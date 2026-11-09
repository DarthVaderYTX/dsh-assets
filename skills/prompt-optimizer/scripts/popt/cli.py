"""Command line interface for the prompt optimizer."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from . import __version__
from .dataset import LoadOptions, dataset_stats, load_dataset
from .errors import BudgetExceeded, ConfigError, PromptOptError
from .evaluate import EvalConfig, Evaluator
from .llm import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    Budget,
    CommandBackend,
    CountingClient,
    HttpBackend,
    ResponseCache,
    Usage,
    default_cache_dir,
)
from .optimize import OptimizeConfig, Optimizer, sample_items, split_items
from .promptspec import PromptSpec, load_prompt
from .report import write_report
from .util import ensure_dir, local_stamp, utc_now, write_json, write_jsonl, write_text

API_KEY_FALLBACKS = ("PROMPT_OPT_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def _redact_header(raw: str) -> str:
    separator = ":" if ":" in raw else "="
    name, _, _value = raw.partition(separator)
    if re.search(r"(?i)(key|token|auth|secret|password|credential)", name):
        return f"{name}{separator} ***"
    return raw


def _display_command(argv: list[str]) -> str:
    """Render argv for manifests without leaking API keys or auth headers."""
    parts: list[str] = []
    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg == "--api-key" and index + 1 < len(argv):
            parts.extend(["--api-key", "***"])
            index += 2
            continue
        if arg.startswith("--api-key="):
            parts.append("--api-key=***")
            index += 1
            continue
        if arg == "--header" and index + 1 < len(argv):
            parts.extend(["--header", _redact_header(argv[index + 1])])
            index += 2
            continue
        if arg.startswith("--header="):
            parts.append("--header=" + _redact_header(arg.split("=", 1)[1]))
            index += 1
            continue
        parts.append(arg)
        index += 1
    text = " ".join(parts)
    text = re.sub(r"sk-[A-Za-z0-9_\-]{8,}", "***", text)
    text = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9_\-\.]+", r"\1***", text)
    return text


def _reconfigure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _print(message: str, *, error: bool = False, quiet: bool = False) -> None:
    if quiet:
        return
    print(message, file=sys.stderr if error else sys.stdout, flush=True)


def _add_dataset_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dataset", required=True, help="JSONL dataset path")
    parser.add_argument("--input-field", help="field holding the task input (auto-detected)")
    parser.add_argument("--rubric-field", help="field holding the rubric (auto-detected)")
    parser.add_argument("--id-field", help="field holding the row id (auto-detected)")
    parser.add_argument("--weight-field", help="field holding the row weight (auto-detected)")
    parser.add_argument("--reference-field", help="field holding a reference answer (optional)")
    parser.add_argument(
        "--skip-invalid",
        action="store_true",
        help="skip rows with missing/invalid input or rubric instead of failing",
    )


def _add_model_args(parser: argparse.ArgumentParser, *, optimize: bool = False) -> None:
    parser.add_argument(
        "--base-url",
        default=os.environ.get("PROMPT_OPT_BASE_URL", DEFAULT_BASE_URL),
        help=f"OpenAI-compatible base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("PROMPT_OPT_MODEL", DEFAULT_MODEL),
        help=f"task model (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--judge-model",
        default=os.environ.get("PROMPT_OPT_JUDGE_MODEL", ""),
        help="grading model (default: same as --model)",
    )
    parser.add_argument(
        "--judge-base-url",
        default=os.environ.get("PROMPT_OPT_JUDGE_BASE_URL", ""),
        help="grading endpoint (default: same as --base-url)",
    )
    if optimize:
        parser.add_argument(
            "--optimizer-model",
            default=os.environ.get("PROMPT_OPT_OPTIMIZER_MODEL", ""),
            help="model that rewrites the prompt (default: same as --model)",
        )
        parser.add_argument(
            "--optimizer-base-url",
            default=os.environ.get("PROMPT_OPT_OPTIMIZER_BASE_URL", ""),
            help="rewrite endpoint (default: same as --base-url)",
        )
    parser.add_argument("--api-key", help="API key (prefer the PROMPT_OPT_API_KEY env var)")
    parser.add_argument(
        "--allow-no-auth",
        action="store_true",
        help="allow a remote endpoint without an API key",
    )
    parser.add_argument("--header", action="append", default=[], help="extra HTTP header, e.g. 'x-key: v'")
    parser.add_argument("--timeout", type=float, default=180.0, help="per-request timeout in seconds")
    parser.add_argument("--max-retries", type=int, default=3, help="transport retries (default 3)")
    parser.add_argument("--concurrency", type=int, default=4, help="parallel rows (default 4)")
    parser.add_argument(
        "--max-calls",
        type=int,
        default=0,
        help="hard budget of logical model calls; 0 means unlimited (use --dry-run to estimate)",
    )
    parser.add_argument("--max-tokens", type=int, default=1024, help="task completion limit (default 1024)")
    parser.add_argument("--judge-max-tokens", type=int, default=1024, help="grader completion limit")
    parser.add_argument("--judge-temperature", type=float, default=0.0, help="grader temperature (default 0)")
    parser.add_argument("--judge-max-chars", type=int, default=12000, help="truncate input/output for grading")
    parser.add_argument("--judge-retries", type=int, default=1, help="retries when grader JSON is invalid")
    parser.add_argument(
        "--judge-json-mode",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="ask the grader for response_format=json_object",
    )
    parser.add_argument("--cache-dir", default=str(default_cache_dir()), help="completion cache directory")
    parser.add_argument("--no-cache", action="store_true", help="disable the completion cache")
    parser.add_argument(
        "--on-error",
        choices=("abort", "skip"),
        default="abort",
        help="abort on a failed row, or skip it and report the gap",
    )
    parser.add_argument(
        "--on-judge-error",
        choices=("abort", "zero"),
        default="abort",
        help="abort when grading fails, or score the row as zero",
    )
    parser.add_argument("--llm-cmd", help="shell command used for every completion (instead of HTTP)")
    parser.add_argument("--judge-llm-cmd", help="shell command for grading (default: --llm-cmd)")
    if optimize:
        parser.add_argument("--optimizer-llm-cmd", help="shell command for rewriting (default: --llm-cmd)")
    parser.add_argument("--quiet", action="store_true", help="suppress progress output")


def _add_limit(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--limit", type=int, default=0, help="use only the first N rows (0 = all)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="prompt_opt.py",
        description="Optimize a prompt on a rubric-graded JSONL dataset by measured score.",
    )
    parser.add_argument("--version", action="version", version=f"prompt-optimizer {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect", help="validate the dataset and show the scoring plan")
    _add_dataset_args(inspect_parser)
    inspect_parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    inspect_parser.add_argument("--sample-chars", type=int, default=400)
    inspect_parser.set_defaults(func=cmd_inspect)

    score_parser = subparsers.add_parser("score", help="evaluate one prompt and print its score")
    _add_dataset_args(score_parser)
    prompt_group = score_parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt-file")
    prompt_group.add_argument("--prompt")
    score_parser.add_argument("--out", help="output directory (default: runs/score-<stamp>)")
    score_parser.add_argument("--overwrite", action="store_true")
    score_parser.add_argument("--json", action="store_true", help="print the summary as JSON")
    score_parser.add_argument("--dry-run", action="store_true", help="print the call plan without calling a model")
    _add_limit(score_parser)
    _add_model_args(score_parser)
    score_parser.set_defaults(func=cmd_score)

    optimize_parser = subparsers.add_parser("optimize", help="iteratively improve a prompt")
    _add_dataset_args(optimize_parser)
    prompt_group = optimize_parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt-file")
    prompt_group.add_argument("--prompt")
    optimize_parser.add_argument("--out", required=True, help="run directory for artifacts")
    optimize_parser.add_argument("--overwrite", action="store_true")
    optimize_parser.add_argument("--dry-run", action="store_true", help="print the call plan without calling a model")
    optimize_parser.add_argument("--rounds", type=int, default=3, help="optimization rounds (default 3)")
    optimize_parser.add_argument("--candidates", type=int, default=4, help="candidates per round (default 4)")
    optimize_parser.add_argument(
        "--search-size", type=int, default=0, help="rows per candidate evaluation (0 = all search rows)"
    )
    optimize_parser.add_argument(
        "--holdout",
        type=float,
        default=0.0,
        help="holdout fraction (0.2) or row count (20); never optimized against",
    )
    optimize_parser.add_argument("--analysis-items", type=int, default=8, help="failing rows shown per round")
    optimize_parser.add_argument("--min-improvement", type=float, default=0.0, help="required gain to accept")
    optimize_parser.add_argument("--patience", type=int, default=2, help="stop after N non-improving rounds")
    optimize_parser.add_argument("--seed", type=int, default=0)
    optimize_parser.add_argument("--optimizer-temperature", type=float, default=0.7)
    optimize_parser.add_argument("--optimizer-max-tokens", type=int, default=2048)
    optimize_parser.add_argument("--max-prompt-chars", type=int, default=20000)
    _add_limit(optimize_parser)
    _add_model_args(optimize_parser, optimize=True)
    optimize_parser.set_defaults(func=cmd_optimize)

    report_parser = subparsers.add_parser("report", help="re-render report.md from a finished run")
    report_parser.add_argument("--run", required=True, help="run directory containing summary.json")
    report_parser.set_defaults(func=cmd_report)

    return parser


def _load(args: argparse.Namespace):
    options = LoadOptions(
        input_field=args.input_field,
        rubric_field=args.rubric_field,
        id_field=args.id_field,
        weight_field=args.weight_field,
        reference_field=args.reference_field,
        skip_invalid=args.skip_invalid,
        max_items=getattr(args, "limit", 0),
    )
    return load_dataset(args.dataset, options)


def _apply_defaults(spec: PromptSpec, args: argparse.Namespace) -> PromptSpec:
    if spec.max_tokens is None:
        spec.max_tokens = args.max_tokens
    return spec


def _resolve_api_key(args: argparse.Namespace) -> str | None:
    if args.api_key:
        return args.api_key
    for name in API_KEY_FALLBACKS:
        value = os.environ.get(name)
        if value:
            return value
    return None


def _is_local(url: str) -> bool:
    try:
        host = urlparse(url).hostname
    except ValueError:
        return False
    return bool(host) and host.lower() in LOCAL_HOSTS


def _parse_headers(raw_headers: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for raw in raw_headers:
        if ":" not in raw and "=" not in raw:
            raise ConfigError(f"--header must look like 'Name: value', got {raw!r}")
        separator = ":" if ":" in raw else "="
        name, value = raw.split(separator, 1)
        if not name.strip():
            raise ConfigError(f"--header has an empty name: {raw!r}")
        headers[name.strip()] = value.strip()
    return headers


def _build_backend(args: argparse.Namespace, role: str, api_key: str | None):
    command = None
    if role == "judge":
        command = getattr(args, "judge_llm_cmd", None) or args.llm_cmd
    elif role == "optimizer":
        command = getattr(args, "optimizer_llm_cmd", None) or args.llm_cmd
    else:
        command = args.llm_cmd
    if command:
        return CommandBackend(command, timeout=max(args.timeout, 300.0), label=role)

    base_url = args.base_url
    model = args.model
    if role == "judge":
        base_url = getattr(args, "judge_base_url", "") or args.base_url
        model = getattr(args, "judge_model", "") or args.model
    elif role == "optimizer":
        base_url = getattr(args, "optimizer_base_url", "") or args.base_url
        model = getattr(args, "optimizer_model", "") or args.model

    if (
        not api_key
        and not _is_local(base_url)
        and not args.allow_no_auth
        and not getattr(args, "dry_run", False)
    ):
        raise ConfigError(
            f"no API key for {role} endpoint {base_url}; set PROMPT_OPT_API_KEY "
            "(or pass --allow-no-auth for a keyless gateway)"
        )
    if not api_key and _is_local(base_url):
        api_key = None
    return HttpBackend(
        base_url=base_url,
        model=model,
        api_key=api_key,
        timeout=args.timeout,
        max_retries=args.max_retries,
        extra_headers=_parse_headers(args.header),
        label=role,
    )


def _clients(args: argparse.Namespace, *, optimize: bool = False):
    api_key = _resolve_api_key(args)
    backend_roles = ["task", "judge"] + (["optimizer"] if optimize else [])
    backends = {role: _build_backend(args, role, api_key) for role in backend_roles}
    cache = ResponseCache(args.cache_dir, enabled=not args.no_cache)
    budget = Budget(args.max_calls)
    clients = {
        role: CountingClient(backends[role], cache=cache, budget=budget, usage=Usage())
        for role in backend_roles
    }
    models = {
        "task": getattr(backends["task"], "model", backends["task"].name),
        "judge": getattr(backends["judge"], "model", backends["judge"].name),
        "endpoint": getattr(backends["task"], "endpoint", ""),
    }
    if optimize:
        models["optimizer"] = getattr(backends["optimizer"], "model", backends["optimizer"].name)
    warnings: list[str] = []
    if backends["judge"].name == backends["task"].name:
        warnings.append(
            "task and judge use the same model/endpoint; grading may share the generator's blind spots"
        )
    return clients, models, budget, warnings


def _evaluator(args: argparse.Namespace, clients) -> Evaluator:
    config = EvalConfig(
        concurrency=max(1, args.concurrency),
        judge_max_chars=max(500, args.judge_max_chars),
        judge_retries=max(0, args.judge_retries),
        judge_json_mode=args.judge_json_mode,
        judge_temperature=args.judge_temperature,
        judge_max_tokens=max(64, args.judge_max_tokens),
        on_error=args.on_error,
        on_judge_error=args.on_judge_error,
        progress=not args.quiet,
    )
    return Evaluator(
        clients["task"],
        clients["judge"],
        config,
        progress=lambda message: _print(message, error=True, quiet=args.quiet),
    )


def _calls_per_item(dataset) -> int:
    return 1 + (1 if any(item.rubric.judged_criteria for item in dataset.items) else 0)


def _prepare_out(path: str | None, prefix: str, overwrite: bool) -> Path:
    target = Path(path) if path else Path("runs") / f"{prefix}-{local_stamp()}"
    ensure_dir(target)
    if (target / "summary.json").exists() and not overwrite:
        raise ConfigError(f"{target} already contains a run; pass --overwrite or choose another --out")
    return target


def cmd_inspect(args: argparse.Namespace) -> int:
    dataset = _load(args)
    stats = dataset_stats(dataset, sample_chars=max(50, args.sample_chars))
    cpi = _calls_per_item(dataset)
    plan = {
        "rows": stats.rows,
        "fields": stats.fields,
        "field_map": stats.field_map,
        "criteria": {
            "total": stats.criteria_total,
            "min_per_row": stats.criteria_min,
            "max_per_row": stats.criteria_max,
            "judged": stats.judged_criteria,
            "deterministic": stats.deterministic_criteria,
        },
        "weight_sum": round(stats.weight_sum, 3),
        "input_chars": stats.input_chars,
        "skipped_rows": stats.skipped,
        "warnings": stats.warnings,
        "estimated_calls_per_full_eval": stats.rows * cpi,
        "sample": stats.sample,
    }
    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    print(f"dataset: {dataset.path}")
    print(f"rows: {stats.rows}   sha256: {dataset.sha256[:16]}…")
    print(f"fields: {', '.join(stats.fields)}")
    mapping = ", ".join(f"{key}={value}" for key, value in stats.field_map.items() if value)
    print(f"detected: {mapping or '(none)'}")
    print(
        f"criteria: {stats.criteria_total} total, {stats.criteria_min}-{stats.criteria_max} per row "
        f"({stats.judged_criteria} judged, {stats.deterministic_criteria} deterministic)"
    )
    print(f"weight sum: {stats.weight_sum:g}   input chars: {stats.input_chars}")
    print(f"estimated calls for one full evaluation: {stats.rows * cpi}")
    if stats.skipped:
        print(f"skipped rows: {stats.skipped}")
    if stats.warnings:
        print("warnings:")
        for warning in stats.warnings:
            print(f"  - {warning}")
    if stats.sample:
        print("\nsample row:")
        print(f"  id: {stats.sample['id']}")
        print(f"  input: {stats.sample['input']}")
        for criterion in stats.sample["rubric"]:
            check = f" [check: {criterion['check']}]" if criterion["check"] else ""
            print(f"  - [{criterion['id']}] (w={criterion['weight']:g}) {criterion['text']}{check}")
        if stats.sample["reference"]:
            print(f"  reference: {stats.sample['reference']}")
    print(
        "\nnext: python scripts/prompt_opt.py optimize --dataset <file> --prompt-file <file> "
        "--out runs/opt --dry-run"
    )
    return 0


def _print_plan(
    args: argparse.Namespace,
    dataset,
    search_items,
    holdout_items,
    cfg: OptimizeConfig | None,
    models: dict[str, str],
    task_calls: int,
    judge_calls: int,
) -> None:
    print("DRY RUN — no model calls were made")
    print(f"dataset: {dataset.path} ({len(dataset.items)} rows)")
    print(f"task model: {models.get('task')} @ {models.get('endpoint')}")
    print(f"judge model: {models.get('judge')}")
    if cfg:
        print(
            f"search rows: {len(search_items)}   holdout rows: {len(holdout_items)}   "
            f"rounds: {cfg.rounds}   candidates/round: {cfg.candidates}"
        )
    print(f"estimated logical calls: ~{task_calls + judge_calls} (task {task_calls}, judge {judge_calls})")
    if args.max_calls:
        print(f"call budget: {args.max_calls}")
        if task_calls + judge_calls > args.max_calls:
            print("WARNING: the estimate exceeds --max-calls; the run will stop early", file=sys.stderr)
    print("estimate excludes transport retries and invalid-JSON repair calls; token counts are unknown")


def cmd_score(args: argparse.Namespace) -> int:
    dataset = _load(args)
    prompt = _apply_defaults(load_prompt(args.prompt_file, args.prompt), args)
    clients, models, budget, warnings = _clients(args)
    evaluator = _evaluator(args, clients)
    items = dataset.items
    if args.limit:
        items = items[: args.limit]
    cpi = _calls_per_item(dataset)
    if args.dry_run:
        _print_plan(
            args,
            dataset,
            items,
            [],
            None,
            models,
            task_calls=len(items),
            judge_calls=len(items) if cpi > 1 else 0,
        )
        return 0

    out = _prepare_out(args.out, "score", args.overwrite)
    write_json(
        out / "run.json",
        {
            "format": "prompt-optimizer-score",
            "version": 1,
            "created_at": utc_now(),
            "command": _display_command(sys.argv),
            "dataset": {
                "path": str(dataset.path),
                "sha256": dataset.sha256,
                "rows": len(dataset.items),
                "fields": dataset.fields,
                "field_map": dataset.field_map,
            },
            "models": models,
        },
    )
    write_text(out / "prompts" / "baseline.txt", prompt.display_text())
    _print(f"scoring {len(items)} rows…", error=True, quiet=args.quiet)
    run = evaluator.evaluate(prompt, items, label="score")
    write_jsonl(out / "results" / "score.jsonl", [result.to_dict() for result in run.results])
    summary = run.summary.to_dict()
    summary["warnings"] = list(dict.fromkeys(warnings + evaluator.warnings))
    summary["dataset"] = str(dataset.path)
    summary["prompt_file"] = "prompts/baseline.txt"
    write_json(out / "summary.json", summary)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(f"score: {summary['score_mean']:.2f} / 100 (weighted sum {summary['score_sum']:.2f})")
        print(
            f"rows: {summary['scored_items']} scored, {summary['skipped_items']} skipped, "
            f"{summary['item_count']} total"
        )
        print(f"summary: {out / 'summary.json'}")
    if summary["skipped_items"]:
        print(
            f"WARNING: {summary['skipped_items']} rows were skipped and excluded from the score",
            file=sys.stderr,
        )
    return 0


def cmd_optimize(args: argparse.Namespace) -> int:
    if args.rounds < 0:
        raise ConfigError("--rounds must be >= 0")
    if args.candidates < 1:
        raise ConfigError("--candidates must be >= 1")
    if args.holdout < 0:
        raise ConfigError("--holdout must be >= 0")
    if args.min_improvement < 0:
        raise ConfigError("--min-improvement must be >= 0")

    dataset = _load(args)
    prompt = _apply_defaults(load_prompt(args.prompt_file, args.prompt), args)
    cfg = OptimizeConfig(
        rounds=args.rounds,
        candidates=args.candidates,
        search_size=max(0, args.search_size),
        analysis_items=max(0, args.analysis_items),
        min_improvement=args.min_improvement,
        patience=max(1, args.patience),
        seed=args.seed,
        holdout=args.holdout,
        optimizer_temperature=args.optimizer_temperature,
        optimizer_max_tokens=max(128, args.optimizer_max_tokens),
        max_prompt_chars=max(1000, args.max_prompt_chars),
    )
    search_items, holdout_items = split_items(dataset.items, cfg.holdout, cfg.seed)
    search_items = sample_items(search_items, cfg.search_size, cfg.seed)
    if not search_items:
        raise ConfigError("no search rows after applying --search-size/--holdout")

    clients, models, budget, warnings = _clients(args, optimize=True)
    evaluator = _evaluator(args, clients)

    cpi = _calls_per_item(dataset)
    covers_all = len(search_items) == len(dataset.items) and not holdout_items
    baseline_calls = len(search_items) * cpi
    candidate_calls = len(search_items) * cpi
    final_calls = 0 if covers_all else len(dataset.items) * cpi * 2
    estimated = (
        baseline_calls
        + cfg.rounds * (1 + cfg.candidates * candidate_calls)
        + final_calls
    )
    estimated_task = (
        len(search_items)
        + cfg.rounds * (1 + cfg.candidates * len(search_items))
        + (0 if covers_all else len(dataset.items) * 2)
    )
    estimated_judge = (
        len(search_items) * (cpi - 1)
        + cfg.rounds * cfg.candidates * len(search_items) * (cpi - 1)
        + (0 if covers_all else len(dataset.items) * (cpi - 1) * 2)
    )

    if args.dry_run:
        _print_plan(
            args,
            dataset,
            search_items,
            holdout_items,
            cfg,
            models,
            task_calls=estimated_task,
            judge_calls=estimated_judge,
        )
        print(f"estimated total logical calls: ~{estimated}")
        return 0

    out = _prepare_out(args.out, "opt", args.overwrite)
    optimizer = Optimizer(
        dataset=dataset,
        evaluator=evaluator,
        optimizer_client=clients["optimizer"],
        config=cfg,
        out_dir=out,
        models=models,
        command=_display_command(sys.argv),
        warnings=warnings,
        progress=lambda message: _print(message, error=True, quiet=args.quiet),
    )
    try:
        outcome = optimizer.run(prompt)
    except BudgetExceeded as error:
        raise BudgetExceeded(
            f"{error}. Use --dry-run to size --max-calls, or raise the budget."
        ) from error

    write_json(out / "summary.json", outcome.summary)
    write_report(out, outcome.summary)
    improvement = outcome.summary["improvement"]
    print("done")
    print(f"best prompt: {out / 'prompts' / 'best.txt'}")
    print(f"report:      {out / 'report.md'}")
    print(
        f"score:       {outcome.summary['baseline']['metrics']['all']['score_mean']:.2f} → "
        f"{outcome.summary['best']['metrics']['all']['score_mean']:.2f} "
        f"({improvement['full_mean_delta']:+.2f})"
    )
    if outcome.warnings:
        print("warnings:")
        for warning in outcome.warnings:
            print(f"  - {warning}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    run_dir = Path(args.run)
    if not (run_dir / "summary.json").exists():
        raise ConfigError(f"{run_dir} has no summary.json; pass the --out directory of a finished run")
    path = write_report(run_dir)
    print(str(path))
    return 0


def main(argv: list[str] | None = None) -> int:
    _reconfigure_stdio()
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except PromptOptError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return error.exit_code
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
