"""Markdown report rendering from a finished optimization run."""

from __future__ import annotations

import difflib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .util import read_json, read_text, relpath

MAX_DIFF_LINES = 250
MAX_ITEM_ROWS = 6
MAX_RUBRIC_ROWS = 15


def _fmt(value: Any, digits: int = 2) -> str:
    if value is None:
        return "—"
    if isinstance(value, (int, float)):
        return f"{value:.{digits}f}"
    return str(value)


def _delta(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, (int, float)):
        return f"{value:+.{2}f}"
    return str(value)


def _truncate(text: str, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: max(0, limit - 1)] + "…"


def _load_results(path: Path) -> dict[tuple[str, int], dict[str, Any]]:
    rows: dict[tuple[str, int], dict[str, Any]] = {}
    if not path.exists():
        return rows
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            index = row.get("index")
            if isinstance(index, int):
                rows[(str(row.get("model", "")), index)] = row
    return rows


def _metric_rows(summary: dict[str, Any]) -> list[tuple[str, Any, Any, Any]]:
    baseline = summary["baseline"]["metrics"]
    best = summary["best"]["metrics"]
    rows: list[tuple[str, Any, Any, Any]] = []
    for split, label in (("all", "全部行"), ("search", "优化用行（search）"), ("holdout", "留出集（holdout）")):
        base_metrics = baseline.get(split)
        best_metrics = best.get(split)
        if not base_metrics and not best_metrics:
            continue
        if split == "holdout" and not base_metrics:
            continue
        base_score = base_metrics["score_mean"] if base_metrics else None
        best_score = best_metrics["score_mean"] if best_metrics else None
        delta = (
            best_score - base_score
            if isinstance(base_score, (int, float)) and isinstance(best_score, (int, float))
            else None
        )
        rows.append((label, base_score, best_score, delta))
    return rows


def _model_rows(summary: dict[str, Any]) -> list[tuple[str, Any, Any, Any, Any, Any]]:
    baseline = summary["baseline"]["metrics"]
    best = summary["best"]["metrics"]
    base_by = (baseline.get("all") or {}).get("by_model", {})
    best_by = (best.get("all") or {}).get("by_model", {})
    base_search = (baseline.get("search") or {}).get("by_model", {})
    best_search = (best.get("search") or {}).get("by_model", {})
    base_holdout = (baseline.get("holdout") or {}).get("by_model", {})
    best_holdout = (best.get("holdout") or {}).get("by_model", {})
    order = [
        target.get("name")
        for target in (summary.get("models") or {}).get("targets", [])
        if target.get("name")
    ]
    names = [name for name in order if name in base_by or name in best_by]
    if not names:
        names = sorted(set(base_by) | set(best_by))
    rows: list[tuple[str, Any, Any, Any, Any, Any]] = []
    for name in names:
        base = base_by.get(name) or {}
        top = best_by.get(name) or {}
        base_mean = base.get("score_mean")
        best_mean = top.get("score_mean")
        delta = (
            best_mean - base_mean
            if isinstance(base_mean, (int, float)) and isinstance(best_mean, (int, float))
            else None
        )
        search_delta = None
        if name in base_search and name in best_search:
            search_delta = best_search[name]["score_mean"] - base_search[name]["score_mean"]
        holdout_delta = None
        if name in base_holdout and name in best_holdout:
            holdout_delta = best_holdout[name]["score_mean"] - base_holdout[name]["score_mean"]
        rows.append(
            (name, base.get("weight", 1.0), base_mean, best_mean, delta, (search_delta, holdout_delta))
        )
    return rows


def _rubric_rows(summary: dict[str, Any]) -> list[tuple[str, int, Any, Any, Any]]:
    baseline = summary["baseline"]["metrics"]["all"].get("rubric_means", {})
    best = summary["best"]["metrics"]["all"].get("rubric_means", {})
    keys = set(baseline) | set(best)
    rows: list[tuple[str, int, Any, Any, Any]] = []
    for key in keys:
        base_entry = baseline.get(key) or {}
        best_entry = best.get(key) or {}
        text = best_entry.get("text") or base_entry.get("text") or key
        count = max(int(base_entry.get("items") or 0), int(best_entry.get("items") or 0))
        base_mean = base_entry.get("mean")
        best_mean = best_entry.get("mean")
        delta = (
            best_mean - base_mean
            if isinstance(base_mean, (int, float)) and isinstance(best_mean, (int, float))
            else None
        )
        rows.append((text, count, base_mean, best_mean, delta))
    rows.sort(key=lambda row: (-row[1], -abs(row[4] or 0), row[0]))
    return rows


def _item_rows(summary: dict[str, Any], out_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    baseline = _load_results(out_dir / "results" / "baseline_full.jsonl")
    best = _load_results(out_dir / "results" / "best_full.jsonl")
    rows: list[dict[str, Any]] = []
    for key in sorted(set(baseline) & set(best)):
        base_score = baseline[key].get("item_score")
        best_score = best[key].get("item_score")
        if not isinstance(base_score, (int, float)) or not isinstance(best_score, (int, float)):
            continue
        rows.append(
            {
                "model": best[key].get("model") or baseline[key].get("model") or "",
                "id": best[key].get("id") or baseline[key].get("id") or str(key[1]),
                "input": best[key].get("input_preview") or baseline[key].get("input_preview") or "",
                "baseline": base_score,
                "best": best_score,
                "delta": best_score - base_score,
            }
        )
    gains = sorted(rows, key=lambda row: row["delta"], reverse=True)[:MAX_ITEM_ROWS]
    regressions = sorted(rows, key=lambda row: row["delta"])[:MAX_ITEM_ROWS]
    return [row for row in gains if row["delta"] > 0], [row for row in regressions if row["delta"] < 0]


def _prompt_diff(out_dir: Path) -> str:
    baseline_path = out_dir / "prompts" / "baseline.txt"
    best_path = out_dir / "prompts" / "best.txt"
    if not baseline_path.exists() or not best_path.exists():
        return "（缺少 prompt 文件，无法生成 diff）"
    baseline_lines = read_text(baseline_path).splitlines()
    best_lines = read_text(best_path).splitlines()
    diff = list(
        difflib.unified_diff(
            baseline_lines,
            best_lines,
            fromfile="baseline.txt",
            tofile="best.txt",
            lineterm="",
        )
    )
    if not diff:
        return "（两版 prompt 文本相同）"
    truncated = len(diff) > MAX_DIFF_LINES
    body = "\n".join(diff[:MAX_DIFF_LINES])
    note = f"\n… diff 已截断（共 {len(diff)} 行），完整内容见 prompts/baseline.txt 与 prompts/best.txt" if truncated else ""
    return body + note


def _clean(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


def _local_time(value: Any) -> str:
    if not value:
        return "?"
    try:
        return datetime.fromisoformat(str(value)).astimezone().isoformat(timespec="seconds")
    except ValueError:
        return str(value)


def render_report(out_dir: str | Path, summary: dict[str, Any] | None = None) -> str:
    out = Path(out_dir)
    summary = summary or read_json(out / "summary.json")
    dataset = summary.get("dataset", {})
    config = summary.get("config", {})
    models = summary.get("models", {})
    improvements = summary.get("improvement", {})
    warnings = summary.get("warnings", []) or []
    usage = summary.get("usage", {}) or {}

    lines: list[str] = []
    lines.append("# Prompt 优化报告")
    lines.append("")
    lines.append(
        f"> 数据集 `{dataset.get('path', '?')}` · {dataset.get('rows', '?')} 行 · "
        f"{dataset.get('target_models', len((models.get('targets') or [])))} 个目标模型 · "
        f"运行时间 {_local_time(summary.get('timing', {}).get('ended_at', summary.get('created_at', '?')))}"
    )
    lines.append("")

    # ---------------------------------------------------------------- 1. 结论
    metric_rows = _metric_rows(summary)
    full = next((row for row in metric_rows if row[0] == "全部行"), None)
    lines.append("## 1. 结论")
    lines.append("")
    if full:
        _, base_score, best_score, delta = full
        comparable = improvements.get("full_comparable", True)
        scope = "全部行" if comparable else "搜索行"
        relative = improvements.get("full_relative_pct")
        relative_text = f"，{_delta(relative)}%" if relative is not None else ""
        lines.append(
            f"在**{scope}**上，基线 **{_fmt(base_score)}** 分 → 最优 prompt **{_fmt(best_score)}** 分"
            f"（**{_delta(delta)}**{relative_text}）。"
        )
    else:
        lines.append("未找到可比对的分数。")
    lines.append("")
    search_delta = improvements.get("search_mean_delta")
    holdout_delta = improvements.get("holdout_mean_delta")
    if search_delta is not None:
        lines.append(f"- 优化用行（search）变化：**{_delta(search_delta)}**")
    if holdout_delta is not None:
        lines.append(f"- 留出集（holdout）变化：**{_delta(holdout_delta)}**（未参与优化，更能反映泛化）")
    elif dataset.get("holdout_rows", 0) == 0:
        lines.append("- 未设置留出集：以上提升为**样本内**结果，可能高估泛化能力。")
    lines.append("")

    # ---------------------------------------------------------------- 2. 配置
    lines.append("## 2. 运行配置")
    lines.append("")
    lines.append("| 项 | 值 |")
    lines.append("| --- | --- |")
    lines.append(f"| 数据集 | `{_clean(dataset.get('path'))}` |")
    lines.append(
        f"| 数据行 | {dataset.get('rows')}（search {dataset.get('search_rows')} / "
        f"holdout {dataset.get('holdout_rows')} / skipped {dataset.get('skipped_rows')}） |"
    )
    lines.append(f"| 数据集 SHA-256 | `{str(dataset.get('sha256', ''))[:16]}…` |")
    targets = models.get("targets") or []
    if targets:
        target_text = "<br>".join(
            f"`{_clean(target.get('name'))}` · {_clean(target.get('model'))} · weight {target.get('weight')}"
            for target in targets
        )
        lines.append(f"| 目标模型 | {target_text} |")
    else:
        lines.append(f"| 任务模型 | `{_clean(models.get('task'))}` |")
    judge = models.get("judge") or {}
    optimizer = models.get("optimizer") or {}
    lines.append(
        f"| 判分模型 | `{_clean(judge.get('model') or models.get('judge'))}`"
        f"（{_clean(judge.get('endpoint') or judge.get('name') or '')}） |"
    )
    lines.append(
        f"| 优化模型 | `{_clean(optimizer.get('model') or models.get('optimizer'))}`"
        f"（{_clean(optimizer.get('endpoint') or optimizer.get('name') or '')}） |"
    )
    lines.append(
        f"| 轮次 / 每轮候选 | {config.get('rounds')} / {config.get('candidates')} |"
    )
    lines.append(f"| search_size / holdout / seed | {config.get('search_size')} / {config.get('holdout')} / {config.get('seed')} |")
    lines.append(f"| 命令 | `{_clean(summary.get('command'))}` |")
    lines.append("")

    # ---------------------------------------------------------------- 3. 指标
    lines.append("## 3. 指标对比")
    lines.append("")
    lines.append("行分 = 100 × Σ(准则权重 × 准则得分) / Σ(准则权重)；总分为各目标模型按权重、各行按行权重的加权平均（0–100）。")
    lines.append("")
    lines.append("| 范围 | 基线 | 最优 | 变化 |")
    lines.append("| --- | ---: | ---: | ---: |")
    for label, base_score, best_score, delta in metric_rows:
        lines.append(f"| {label} | {_fmt(base_score)} | {_fmt(best_score)} | {_delta(delta)} |")
    lines.append("")
    baseline_sum = summary["baseline"]["metrics"]["all"].get("score_sum")
    best_sum = summary["best"]["metrics"]["all"].get("score_sum")
    lines.append(f"加权总分（Σ 模型权重×行权重×行分）：基线 {_fmt(baseline_sum)} → 最优 {_fmt(best_sum)}。")
    lines.append("")

    model_rows = _model_rows(summary)
    if model_rows:
        lines.append("### 3.1 分模型得分")
        lines.append("")
        lines.append("| 目标模型 | 权重 | 基线 | 最优 | 变化 | search 变化 | holdout 变化 |")
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
        for name, weight, base_mean, best_mean, delta, split_deltas in model_rows:
            search_delta, holdout_delta = split_deltas
            lines.append(
                f"| `{_clean(name)}` | {_fmt(weight, 0)} | {_fmt(base_mean)} | {_fmt(best_mean)} | "
                f"{_delta(delta)} | {_delta(search_delta)} | {_delta(holdout_delta)} |"
            )
        lines.append("")

    rubric_rows = _rubric_rows(summary)
    if rubric_rows:
        lines.append("### 3.2 分准则得分")
        lines.append("")
        lines.append("| 准则 | 观测数 | 基线 | 最优 | 变化 |")
        lines.append("| --- | ---: | ---: | ---: | ---: |")
        for text, count, base_mean, best_mean, delta in rubric_rows[:MAX_RUBRIC_ROWS]:
            lines.append(
                f"| {_clean(_truncate(text, 90))} | {count} | {_fmt(base_mean)} | "
                f"{_fmt(best_mean)} | {_delta(delta)} |"
            )
        if len(rubric_rows) > MAX_RUBRIC_ROWS:
            lines.append(f"| …其余 {len(rubric_rows) - MAX_RUBRIC_ROWS} 条见 summary.json | | | | |")
        lines.append("")

    gains, regressions = _item_rows(summary, out)
    if gains or regressions:
        lines.append("### 3.3 逐行变化")
        lines.append("")
        lines.append("| 模型 | 行 | 输入摘要 | 基线 | 最优 | 变化 |")
        lines.append("| --- | --- | --- | ---: | ---: | ---: |")
        for row in gains + regressions:
            lines.append(
                f"| `{_clean(row['model'])}` | `{_clean(row['id'])}` | "
                f"{_clean(_truncate(row['input'], 60))} | "
                f"{_fmt(row['baseline'])} | {_fmt(row['best'])} | {_delta(row['delta'])} |"
            )
        lines.append("")
        lines.append("（上表为提升最大和退步最大的模型-行组合各至多 6 条。）")
        lines.append("")

    # ---------------------------------------------------------------- 4. 迭代
    history = summary.get("history", []) or []
    lines.append("## 4. 迭代过程")
    lines.append("")
    if history:
        lines.append("| 轮次 | 候选 | search 得分 | 采纳 | 改动假设 |")
        lines.append("| ---: | ---: | ---: | --- | --- |")
        for record in history:
            lines.append(
                f"| {record.get('round')} | c{record.get('slot')} | {_fmt(record.get('score'))} | "
                f"{'是' if record.get('accepted') else '否'} | "
                f"{_clean(_truncate(record.get('hypothesis') or record.get('changes') or '', 90))} |"
            )
        lines.append("")
        lines.append("所有已评估候选的 prompt 与逐行 results 都保留在 `prompts/candidates/` 和 `results/`；每轮只采纳 search 得分最高且超过基线的候选。")
    else:
        lines.append("没有产生候选（基线可能已达到 100 分，或调用预算/候选生成失败）。")
    lines.append("")

    # ---------------------------------------------------------------- 5. 成本
    lines.append("## 5. 调用与成本")
    lines.append("")
    if usage:
        lines.append("| 角色 | 逻辑调用 | prompt tokens | completion tokens | total tokens | 缓存命中 |")
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
        rows: list[tuple[str, dict[str, Any]]] = []
        target_usage = usage.get("targets")
        if isinstance(target_usage, dict):
            rows.extend((f"target:{name}", value or {}) for name, value in target_usage.items())
        elif usage.get("task"):
            rows.append(("task", usage.get("task") or {}))
        rows.append(("judge", usage.get("judge") or {}))
        rows.append(("optimizer", usage.get("optimizer") or {}))
        totals = {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cache_hits": 0}
        for role, role_usage in rows:
            lines.append(
                f"| {role} | {role_usage.get('calls', 0)} | {role_usage.get('prompt_tokens', 0)} | "
                f"{role_usage.get('completion_tokens', 0)} | {role_usage.get('total_tokens', 0)} | "
                f"{role_usage.get('cache_hits', 0)} |"
            )
            for key in totals:
                totals[key] += int(role_usage.get(key, 0) or 0)
        lines.append(
            f"| **合计** | {totals['calls']} | {totals['prompt_tokens']} | "
            f"{totals['completion_tokens']} | {totals['total_tokens']} | {totals['cache_hits']} |"
        )
        lines.append("")
        lines.append("缓存命中不产生模型调用；token 数为提供商返回的 usage，缺失时为 0。")
    else:
        lines.append("未记录调用统计。")
    lines.append("")

    # ---------------------------------------------------------------- 6. 风险
    lines.append("## 6. 风险与限制")
    lines.append("")
    if warnings:
        for warning in warnings:
            lines.append(f"- {warning}")
    else:
        lines.append("- 未记录其他风险。")
    lines.append("- 分数由判分模型给出，存在判分偏好与随机性；重要结论建议人工抽查失败样本。")
    lines.append("- 若任一目标模型与判分模型相同，分数可能被同一模型的表达偏好放大。")
    lines.append("")

    # ---------------------------------------------------------------- 7. 复现
    lines.append("## 7. 复现与产物")
    lines.append("")
    lines.append("```")
    lines.append(str(summary.get("command") or ""))
    lines.append("```")
    lines.append("")
    lines.append(f"- 最优 prompt：[prompts/best.txt]({relpath(out / 'prompts' / 'best.txt', out)})")
    lines.append(f"- 基线 prompt：[prompts/baseline.txt]({relpath(out / 'prompts' / 'baseline.txt', out)})")
    lines.append(f"- 完整指标：[summary.json](summary.json)")
    lines.append(f"- 逐行结果：[results/](results/)")
    lines.append("")

    # ---------------------------------------------------------------- 附录
    lines.append("## 附录 A：prompt diff")
    lines.append("")
    lines.append("```diff")
    lines.append(_prompt_diff(out))
    lines.append("```")
    lines.append("")
    lines.append("## 附录 B：最优 prompt 全文")
    lines.append("")
    best_path = out / "prompts" / "best.txt"
    if best_path.exists():
        lines.append("````text")
        lines.append(read_text(best_path).rstrip())
        lines.append("````")
    else:
        lines.append("（缺少 prompts/best.txt）")
    lines.append("")
    return "\n".join(lines)


def write_report(out_dir: str | Path, summary: dict[str, Any] | None = None) -> Path:
    out = Path(out_dir)
    text = render_report(out, summary)
    path = out / "report.md"
    path.write_text(text, encoding="utf-8", newline="\n")
    return path
