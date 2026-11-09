"""The optimization loop: measure, analyse failures, propose, re-measure, keep the winner."""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .dataset import Dataset, Item
from .errors import BudgetExceeded, LLMError, PromptOptError
from .evaluate import EvalRun, Evaluator, ItemResult, summarize
from .llm import CountingClient
from .promptspec import PromptSpec
from .util import (
    ensure_dir,
    extract_json,
    local_stamp,
    normalize_space,
    sha256_text,
    truncate,
    utc_now,
    write_json,
    write_jsonl,
    write_text,
)

OPTIMIZER_SYSTEM = """You are a senior prompt engineer. You improve a task prompt by studying measured failures on a rubric-graded dataset.

Rules:
- The prompt under optimisation is the system instruction sent to the model for every dataset row.
- Return complete replacement system prompts, never patches or commentary.
- Encode the rubric's requirements as general, checkable rules. Do not mention the rubric, the grader, the dataset, or the evaluation process in the prompt.
- Never hardcode row-specific facts, answers, names or numbers taken from the failures. Do not invent facts, citations or policies.
- Preserve the original language and the task's actual goal. Do not broaden or narrow the task beyond what the current prompt and rubric imply.
- Prefer concrete output requirements (structure, required elements, evidence, constraints) over vague advice such as "be helpful" or "be accurate".
- Remove or rewrite rules that the failures show are not working. Shorter is better when it does not lose a requirement.
- Candidates in one batch must attack different failure modes, not paraphrase each other."""

OPTIMIZER_TEMPLATE = """Improve the system prompt below.

<current_prompt>
{current_prompt}
</current_prompt>

<rubric_summary>
{criteria}
</rubric_summary>

<scoring>
Each row is graded per criterion: 1 = fully satisfied, 0.5 = partial, 0 = not satisfied.
Row score = 100 * weighted criteria score. The dataset score is the weighted mean row score (0-100).
</scoring>

<worst_rows>
{failures}
</worst_rows>

<task>
Write {count} candidate system prompts. Each candidate must be a complete, self-contained replacement.
Return only JSON in this exact shape:
{{"candidates": [{{"prompt": "<full system prompt>", "hypothesis": "<why this should raise the score>", "changes": "<what was changed vs the current prompt>"}}]}}
Do not wrap the JSON in a markdown fence. Keep each prompt under {max_chars} characters.
</task>"""


@dataclass
class OptimizeConfig:
    rounds: int = 3
    candidates: int = 4
    search_size: int = 0
    analysis_items: int = 8
    min_improvement: float = 0.0
    patience: int = 2
    seed: int = 0
    holdout: float = 0.0
    optimizer_temperature: float = 0.7
    optimizer_max_tokens: int = 2048
    max_prompt_chars: int = 20000


@dataclass
class Candidate:
    prompt: PromptSpec
    hypothesis: str = ""
    changes: str = ""


@dataclass
class CandidateRecord:
    round: int
    slot: int
    prompt_file: str
    score: float
    accepted: bool
    hypothesis: str
    changes: str
    prompt_chars: int
    usage: dict[str, int]


@dataclass
class OptimizerOutcome:
    summary: dict[str, Any]
    best_prompt: PromptSpec
    baseline_full: EvalRun
    best_full: EvalRun
    history: list[CandidateRecord]
    warnings: list[str]
    started_at: str
    ended_at: str
    seconds: float


def split_items(items: list[Item], holdout: float, seed: int) -> tuple[list[Item], list[Item]]:
    """Split into search and holdout items; the holdout is never optimised against."""
    count = len(items)
    if count < 2 or holdout <= 0:
        return list(items), []
    if holdout < 1:
        holdout_count = max(1, int(round(count * holdout)))
    else:
        holdout_count = int(holdout)
    holdout_count = min(holdout_count, count - 1)
    shuffled = list(items)
    random.Random(seed).shuffle(shuffled)
    holdout_items = sorted(shuffled[-holdout_count:], key=lambda item: item.index)
    search_items = sorted(shuffled[:-holdout_count], key=lambda item: item.index)
    return search_items, holdout_items


def sample_items(items: list[Item], size: int, seed: int) -> list[Item]:
    if size <= 0 or size >= len(items):
        return list(items)
    sampled = random.Random(seed + 1).sample(list(items), size)
    return sorted(sampled, key=lambda item: item.index)


def _criteria_digest(items: list[Item], limit: int = 20) -> str:
    counts: dict[str, int] = {}
    for item in items:
        for criterion in item.rubric.criteria:
            counts[criterion.text] = counts.get(criterion.text, 0) + 1
    ordered = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]
    lines = [f"- {text} (appears in {count} row(s))" for text, count in ordered]
    if not lines:
        return "- (no criteria)"
    return "\n".join(lines)


def _failure_digest(
    results: list[ItemResult],
    items_by_index: dict[int, Item],
    limit: int,
) -> str:
    scored = [result for result in results if result.item_score is not None]
    scored.sort(key=lambda result: (result.item_score or 0.0, result.index))
    blocks: list[str] = []
    for result in scored[:limit]:
        if result.item_score is not None and result.item_score >= 100.0:
            continue
        item = items_by_index.get(result.index)
        failed = [criterion for criterion in result.criteria if criterion.score < 1.0]
        if not failed:
            continue
        lines = [f"### Row {result.id} — score {result.item_score:.1f}/100"]
        if item is not None:
            lines.append("<input>\n" + truncate(item.input, 700) + "\n</input>")
        lines.append("<model_output>\n" + truncate(result.output, 700) + "\n</model_output>")
        lines.append("Failed criteria:")
        for criterion in failed:
            lines.append(
                f"- [{criterion.id}] score {criterion.score:g}: {truncate(criterion.rationale or 'no rationale', 300)}"
            )
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks) if blocks else "(no failing rows)"


def build_optimizer_messages(
    current_prompt: PromptSpec,
    items: list[Item],
    failures: str,
    count: int,
    max_chars: int,
) -> list[dict[str, str]]:
    user = OPTIMIZER_TEMPLATE.format(
        current_prompt=truncate(current_prompt.system, max_chars),
        criteria=_criteria_digest(items),
        failures=failures,
        count=count,
        max_chars=max_chars,
    )
    return [
        {"role": "system", "content": OPTIMIZER_SYSTEM},
        {"role": "user", "content": user},
    ]


def parse_candidates(text: str) -> list[dict[str, str]]:
    payload = extract_json(text)
    if isinstance(payload, dict):
        raw = payload.get("candidates")
        if raw is None and isinstance(payload.get("prompt"), str):
            raw = [payload]
    elif isinstance(payload, list):
        raw = payload
    else:
        raw = None
    if not isinstance(raw, list):
        raise ValueError("reply has no 'candidates' array")

    parsed: list[dict[str, str]] = []
    for entry in raw:
        if isinstance(entry, str):
            parsed.append({"prompt": entry, "hypothesis": "", "changes": ""})
        elif isinstance(entry, dict):
            prompt = entry.get("prompt") or entry.get("system") or entry.get("instruction")
            if not isinstance(prompt, str) or not prompt.strip():
                continue
            parsed.append(
                {
                    "prompt": prompt.strip(),
                    "hypothesis": str(entry.get("hypothesis", "")).strip(),
                    "changes": str(entry.get("changes", "")).strip(),
                }
            )
    if not parsed:
        raise ValueError("no usable candidate prompts in reply")
    return parsed


def _sanitize_label(label: str) -> str:
    return "".join(char if char.isalnum() or char in "-_." else "-" for char in label)


class Optimizer:
    def __init__(
        self,
        *,
        dataset: Dataset,
        evaluator: Evaluator,
        optimizer_client: CountingClient,
        config: OptimizeConfig,
        out_dir: str | Path,
        models: dict[str, str],
        command: str = "",
        warnings: list[str] | None = None,
        progress: Callable[[str], None] | None = None,
    ) -> None:
        self.dataset = dataset
        self.evaluator = evaluator
        self.optimizer_client = optimizer_client
        self.config = config
        self.out_dir = ensure_dir(out_dir)
        self.models = models
        self.command = command
        self.warnings = list(warnings or [])
        self._progress = progress or (lambda message: None)
        self.budget = evaluator.task_client.budget
        self.history: list[CandidateRecord] = []
        self.started_at = utc_now()
        self._start_monotonic = time.time()
        ensure_dir(self.out_dir / "results")
        ensure_dir(self.out_dir / "results" / "candidates")
        ensure_dir(self.out_dir / "prompts")
        ensure_dir(self.out_dir / "prompts" / "candidates")

    # ------------------------------------------------------------------ flow
    def run(self, baseline_prompt: PromptSpec) -> OptimizerOutcome:
        search_items, holdout_items = split_items(
            self.dataset.items, self.config.holdout, self.config.seed
        )
        search_items = sample_items(search_items, self.config.search_size, self.config.seed)
        if len(search_items) < len(self.dataset.items):
            self.warnings.append(
                f"optimisation used {len(search_items)}/{len(self.dataset.items)} rows; "
                "final scores are recomputed on all rows"
            )
        if not holdout_items:
            self.warnings.append(
                "no holdout rows: reported gains are in-sample and may overstate generalisation; "
                "use --holdout to measure on unseen rows"
            )
        if not search_items:
            raise PromptOptError("no rows left for optimisation after sampling")

        ensure_dir(self.out_dir / "prompts")
        write_text(self.out_dir / "prompts" / "baseline.txt", baseline_prompt.display_text())
        write_json(
            self.out_dir / "run.json",
            {
                "format": "prompt-optimizer-run",
                "version": 1,
                "created_at": self.started_at,
                "command": self.command,
                "dataset": {
                    "path": str(self.dataset.path),
                    "sha256": self.dataset.sha256,
                    "rows": len(self.dataset.items),
                    "fields": self.dataset.fields,
                    "field_map": self.dataset.field_map,
                    "skipped_rows": len(self.dataset.skipped),
                },
                "models": self.models,
                "config": {
                    "rounds": self.config.rounds,
                    "candidates": self.config.candidates,
                    "search_size": self.config.search_size,
                    "search_rows": len(search_items),
                    "holdout": self.config.holdout,
                    "holdout_rows": len(holdout_items),
                    "seed": self.config.seed,
                    "analysis_items": self.config.analysis_items,
                    "min_improvement": self.config.min_improvement,
                    "patience": self.config.patience,
                    "max_prompt_chars": self.config.max_prompt_chars,
                },
                "baseline_prompt": {
                    "hash": baseline_prompt.identity(),
                    "system_chars": len(baseline_prompt.system),
                    "temperature": baseline_prompt.temperature,
                },
            },
        )

        self._progress(f"baseline on {len(search_items)} search rows")
        baseline_search = self._evaluate(baseline_prompt, search_items, "baseline_search")
        incumbent = baseline_search
        incumbent_label = "baseline_search"

        items_by_index = {item.index: item for item in self.dataset.items}
        calls_per_item = 1 + (1 if any(item.rubric.judged_criteria for item in search_items) else 0)
        # Keep enough calls for the final apples-to-apples pass over rows that the
        # search evaluation has not touched yet (holdout rows and unsampled rows).
        unmeasured_rows = len(self.dataset.items) - len(baseline_search.results)
        final_reserve = 2 * max(0, unmeasured_rows) * calls_per_item

        if incumbent.summary.score_mean >= 100.0 - 1e-9:
            self.warnings.append("baseline already scores 100; nothing to optimise")
        else:
            stale_rounds = 0
            for round_number in range(1, self.config.rounds + 1):
                needed = len(search_items) * calls_per_item
                if self.budget.remaining is not None and self.budget.remaining < needed + final_reserve:
                    self.warnings.append(
                        f"stopped before round {round_number}: call budget too small for another "
                        "evaluation plus the reserved final full-dataset pass"
                    )
                    break
                failures = _failure_digest(
                    incumbent.results, items_by_index, self.config.analysis_items
                )
                self._progress(f"round {round_number}: proposing {self.config.candidates} candidates")
                try:
                    candidates = self._propose(incumbent.prompt, search_items, failures)
                except (LLMError, ValueError, BudgetExceeded) as error:
                    self.warnings.append(f"round {round_number}: candidate generation failed: {error}")
                    break
                if not candidates:
                    self.warnings.append(f"round {round_number}: no candidates returned")
                    break

                evaluated: list[tuple[int, Candidate, EvalRun, str]] = []
                for slot, candidate in enumerate(candidates, 1):
                    if (
                        self.budget.remaining is not None
                        and self.budget.remaining < needed + final_reserve
                    ):
                        self.warnings.append(
                            f"stopped inside round {round_number}: budget too small for another "
                            "candidate plus the reserved final pass"
                        )
                        break
                    label = f"cand-r{round_number}-c{slot}-search"
                    self._progress(f"round {round_number}: evaluating candidate {slot}/{len(candidates)}")
                    try:
                        run = self._evaluate(candidate.prompt, search_items, label)
                    except BudgetExceeded as error:
                        self.warnings.append(f"budget exhausted while evaluating {label}: {error}")
                        break
                    prompt_file = f"prompts/candidates/r{round_number}-c{slot}.txt"
                    write_text(self.out_dir / prompt_file, candidate.prompt.display_text())
                    evaluated.append((slot, candidate, run, prompt_file))

                if not evaluated:
                    break
                best_slot, best_candidate, best_run, best_file = max(
                    evaluated, key=lambda entry: entry[2].summary.score_mean
                )
                threshold = incumbent.summary.score_mean + max(self.config.min_improvement, 1e-9)
                accepted = best_run.summary.score_mean > threshold
                for slot, candidate, run, prompt_file in evaluated:
                    self.history.append(
                        CandidateRecord(
                            round=round_number,
                            slot=slot,
                            prompt_file=prompt_file,
                            score=round(run.summary.score_mean, 4),
                            accepted=accepted and slot == best_slot,
                            hypothesis=candidate.hypothesis,
                            changes=candidate.changes,
                            prompt_chars=len(candidate.prompt.system),
                            usage=run.summary.usage.to_dict(),
                        )
                    )
                if accepted:
                    incumbent = best_run
                    incumbent_label = f"cand-r{round_number}-c{best_slot}-search"
                    stale_rounds = 0
                    self._progress(
                        f"round {round_number}: accepted candidate (score {best_run.summary.score_mean:.2f})"
                    )
                else:
                    stale_rounds += 1
                    self._progress(
                        f"round {round_number}: no improvement ({best_run.summary.score_mean:.2f} "
                        f"<= {incumbent.summary.score_mean:.2f})"
                    )
                    if stale_rounds >= max(1, self.config.patience):
                        break

        # Final apples-to-apples evaluation on every row.
        covers_all = len(search_items) == len(self.dataset.items) and not holdout_items
        baseline_full: EvalRun
        if covers_all:
            baseline_full = baseline_search
        else:
            self._progress("final baseline evaluation on all rows")
            try:
                baseline_full = self._evaluate(baseline_prompt, self.dataset.items, "baseline_full")
            except BudgetExceeded as error:
                self.warnings.append(f"baseline full evaluation skipped: {error}")
                baseline_full = baseline_search

        if covers_all:
            best_full = incumbent
        else:
            self._progress("final best-prompt evaluation on all rows")
            try:
                best_full = self._evaluate(incumbent.prompt, self.dataset.items, "best_full")
            except BudgetExceeded as error:
                self.warnings.append(f"best-prompt full evaluation skipped: {error}")
                best_full = incumbent

        write_text(self.out_dir / "prompts" / "best.txt", incumbent.prompt.display_text())
        write_text(self.out_dir / "prompts" / "incumbent_search.txt", incumbent.prompt.display_text())
        self._write_results_alias(incumbent, "best_search.jsonl")
        self._write_results_alias(baseline_search, "baseline_search.jsonl")
        self._write_results_alias(baseline_full, "baseline_full.jsonl")
        self._write_results_alias(best_full, "best_full.jsonl")
        self.warnings = list(dict.fromkeys(self.warnings + self.evaluator.warnings))

        summary = self._build_summary(
            baseline_prompt=baseline_prompt,
            baseline_search=baseline_search,
            baseline_full=baseline_full,
            best_search=incumbent,
            best_full=best_full,
            holdout_items=holdout_items,
            search_items=search_items,
            incumbent_label=incumbent_label,
        )
        ended_at = utc_now()
        return OptimizerOutcome(
            summary=summary,
            best_prompt=incumbent.prompt,
            baseline_full=baseline_full,
            best_full=best_full,
            history=self.history,
            warnings=self.warnings,
            started_at=self.started_at,
            ended_at=ended_at,
            seconds=round(time.time() - self._start_monotonic, 2),
        )

    # -------------------------------------------------------------- helpers
    def _evaluate(self, prompt: PromptSpec, items: list[Item], label: str) -> EvalRun:
        run = self.evaluator.evaluate(prompt, items, label=label)
        path = self.out_dir / "results" / f"{_sanitize_label(label)}.jsonl"
        write_jsonl(path, [result.to_dict() for result in run.results])
        return run

    def _write_results_alias(self, run: EvalRun, filename: str) -> None:
        write_jsonl(
            self.out_dir / "results" / filename,
            [result.to_dict() for result in run.results],
        )

    def _propose(
        self, incumbent: PromptSpec, search_items: list[Item], failures: str
    ) -> list[Candidate]:
        messages = build_optimizer_messages(
            incumbent,
            search_items,
            failures,
            self.config.candidates,
            self.config.max_prompt_chars,
        )
        last_error: Exception | None = None
        for attempt in range(2):
            completion = self.optimizer_client.complete(
                messages,
                temperature=self.config.optimizer_temperature,
                max_tokens=self.config.optimizer_max_tokens,
                json_mode=True,
            )
            try:
                raw_candidates = parse_candidates(completion.text)
            except ValueError as error:
                last_error = error
                if attempt == 0:
                    messages = messages + [
                        {"role": "assistant", "content": truncate(completion.text, 4000)},
                        {
                            "role": "user",
                            "content": (
                                f"That reply could not be parsed: {error}. "
                                "Return ONLY the JSON object with a 'candidates' array."
                            ),
                        },
                    ]
                continue
            return self._validate_candidates(raw_candidates, incumbent, search_items)
        raise ValueError(f"could not parse candidates: {last_error}")

    def _validate_candidates(
        self, raw_candidates: list[dict[str, str]], incumbent: PromptSpec, items: list[Item]
    ) -> list[Candidate]:
        seen = {normalize_space(incumbent.system)}
        leak_sources: list[tuple[str, str]] = []
        for item in items:
            if len(normalize_space(item.input)) >= 80:
                leak_sources.append((item.id, normalize_space(item.input)))
            if item.reference and len(normalize_space(item.reference)) >= 80:
                leak_sources.append((f"{item.id}:reference", normalize_space(item.reference)))

        candidates: list[Candidate] = []
        for entry in raw_candidates:
            text = entry["prompt"].strip()
            if not text:
                continue
            if len(text) > self.config.max_prompt_chars:
                self.warnings.append(
                    f"candidate of {len(text)} chars exceeds max_prompt_chars="
                    f"{self.config.max_prompt_chars}; discarded"
                )
                continue
            if "{{input}}" in text or "{input}" in text:
                self.warnings.append(
                    "candidate contains an {input} placeholder in the system prompt; discarded"
                )
                continue
            normalized = normalize_space(text)
            copied_from = next(
                (source_id for source_id, source in leak_sources if source in normalized), None
            )
            if copied_from:
                self.warnings.append(
                    f"candidate copied a dataset input/reference verbatim from row {copied_from!r}; "
                    "discarded as leakage"
                )
                continue
            for word in ("rubric", "grader"):
                if re.search(rf"\b{word}\b", text, re.IGNORECASE):
                    self.warnings.append(
                        f"candidate mentions {word!r}; review it for grader leakage before deploying"
                    )
            fingerprint = normalized
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            spec = PromptSpec(
                system=text,
                user_template=incumbent.user_template,
                few_shot=list(incumbent.few_shot),
                temperature=incumbent.temperature,
                max_tokens=incumbent.max_tokens,
                source=f"candidate:{sha256_text(text)[:8]}",
            )
            candidates.append(
                Candidate(
                    prompt=spec,
                    hypothesis=entry.get("hypothesis", ""),
                    changes=entry.get("changes", ""),
                )
            )
            if len(candidates) >= self.config.candidates:
                break
        return candidates

    def _build_summary(
        self,
        *,
        baseline_prompt: PromptSpec,
        baseline_search: EvalRun,
        baseline_full: EvalRun,
        best_search: EvalRun,
        best_full: EvalRun,
        holdout_items: list[Item],
        search_items: list[Item],
        incumbent_label: str,
    ) -> dict[str, Any]:
        search_ids = {item.index for item in search_items}
        holdout_ids = {item.index for item in holdout_items}

        def split_metrics(run: EvalRun) -> dict[str, Any]:
            metrics: dict[str, Any] = {
                "all": summarize("all", run.prompt, run.results).to_dict(),
            }
            metrics["all"]["complete"] = len(run.results) == len(self.dataset.items)
            if holdout_ids:
                metrics["search"] = summarize(
                    "search", run.prompt, [row for row in run.results if row.index in search_ids]
                ).to_dict()
                metrics["holdout"] = summarize(
                    "holdout", run.prompt, [row for row in run.results if row.index in holdout_ids]
                ).to_dict()
            else:
                metrics["search"] = metrics["all"]
                metrics["holdout"] = None
            return metrics

        baseline_metrics = split_metrics(baseline_full)
        best_metrics = split_metrics(best_full)
        comparable = bool(
            baseline_metrics["all"].get("complete") and best_metrics["all"].get("complete")
        )
        if comparable:
            base_full_mean = baseline_metrics["all"]["score_mean"]
            best_full_mean = best_metrics["all"]["score_mean"]
        else:
            base_full_mean = baseline_metrics["search"]["score_mean"]
            best_full_mean = best_metrics["search"]["score_mean"]
            self.warnings.append(
                "final full-dataset evaluation was incomplete; the headline delta is measured on "
                "the search rows only"
            )
        delta = best_full_mean - base_full_mean
        relative = (100.0 * delta / base_full_mean) if base_full_mean > 0 else None

        def delta_for(split: str) -> float | None:
            base = baseline_metrics.get(split)
            best = best_metrics.get(split)
            if not base or not best:
                return None
            return round(best["score_mean"] - base["score_mean"], 2)

        improvements = {
            "full_comparable": comparable,
            "full_mean_delta": round(delta, 2),
            "full_relative_pct": round(relative, 2) if relative is not None else None,
            "search_mean_delta": delta_for("search"),
            "holdout_mean_delta": delta_for("holdout"),
        }

        return {
            "format": "prompt-optimizer-summary",
            "version": 1,
            "created_at": utc_now(),
            "command": self.command,
            "dataset": {
                "path": str(self.dataset.path),
                "sha256": self.dataset.sha256,
                "rows": len(self.dataset.items),
                "search_rows": len(search_items),
                "holdout_rows": len(holdout_items),
                "skipped_rows": len(self.dataset.skipped),
                "fields": self.dataset.fields,
            },
            "models": self.models,
            "config": {
                "rounds": self.config.rounds,
                "candidates": self.config.candidates,
                "search_size": self.config.search_size,
                "holdout": self.config.holdout,
                "seed": self.config.seed,
                "min_improvement": self.config.min_improvement,
                "patience": self.config.patience,
                "analysis_items": self.config.analysis_items,
                "max_prompt_chars": self.config.max_prompt_chars,
            },
            "baseline": {
                "prompt_hash": baseline_prompt.identity(),
                "prompt_chars": len(baseline_prompt.system),
                "metrics": baseline_metrics,
            },
            "best": {
                "prompt_hash": best_search.prompt.identity(),
                "prompt_chars": len(best_search.prompt.system),
                "prompt_file": "prompts/best.txt",
                "last_label": incumbent_label,
                "metrics": best_metrics,
            },
            "improvement": improvements,
            "history": [
                {
                    "round": record.round,
                    "slot": record.slot,
                    "prompt_file": record.prompt_file,
                    "score": record.score,
                    "accepted": record.accepted,
                    "hypothesis": record.hypothesis,
                    "changes": record.changes,
                    "prompt_chars": record.prompt_chars,
                    "usage": record.usage,
                }
                for record in self.history
            ],
            "warnings": self.warnings,
            "usage": {
                "task": self.evaluator.task_client.usage.to_dict(),
                "judge": self.evaluator.judge_client.usage.to_dict(),
                "optimizer": self.optimizer_client.usage.to_dict(),
            },
            "timing": {
                "started_at": self.started_at,
                "ended_at": utc_now(),
                "seconds": round(time.time() - self._start_monotonic, 2),
            },
            "artifacts": {
                "best_prompt": "prompts/best.txt",
                "report": "report.md",
                "baseline_results": "results/baseline_full.jsonl",
                "best_results": "results/best_full.jsonl",
            },
            "generated_by": "dsh-assets/skills/prompt-optimizer",
            "stamp": local_stamp(),
        }
