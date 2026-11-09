"""JSONL dataset loading with tolerant field detection and strict rubric checks."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .errors import DatasetError
from .rubric import Rubric, normalize_rubric
from .util import sha256_file, truncate

INPUT_CANDIDATES = (
    "input",
    "question",
    "query",
    "user_query",
    "user_input",
    "prompt_input",
    "text",
    "content",
    "messages",
    "instruction",
)
RUBRIC_CANDIDATES = (
    "rubric",
    "rubrics",
    "criteria",
    "grading_rubric",
    "rubric_items",
    "metadata.rubric",
)
ID_CANDIDATES = ("id", "_id", "uid", "key", "case_id", "sample_id", "metadata.id")
WEIGHT_CANDIDATES = ("weight", "sample_weight", "score_weight", "metadata.weight")
REFERENCE_CANDIDATES = (
    "reference",
    "reference_answer",
    "expected",
    "expected_output",
    "answer",
    "gold",
    "target",
    "metadata.reference",
)


@dataclass
class Item:
    index: int
    line: int
    id: str
    input: str
    rubric: Rubric
    reference: str | None
    weight: float
    raw: dict[str, Any]


@dataclass
class Dataset:
    path: Path
    sha256: str
    items: list[Item]
    fields: list[str]
    field_map: dict[str, str | None]
    warnings: list[str] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.items)


@dataclass
class LoadOptions:
    input_field: str | None = None
    rubric_field: str | None = None
    id_field: str | None = None
    weight_field: str | None = None
    reference_field: str | None = None
    skip_invalid: bool = False
    max_items: int = 0


def _lookup(row: dict[str, Any], path: str) -> tuple[bool, Any]:
    current: Any = row
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def _render_input(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        if value and all(isinstance(entry, dict) and ("role" in entry or "content" in entry) for entry in value):
            users = [entry for entry in value if str(entry.get("role", "")).lower() == "user"]
            chosen = users[-1] if users else value[-1]
            return _render_content(chosen.get("content", ""))
        return "\n".join(_render_input(entry) for entry in value)
    if isinstance(value, dict):
        for key in ("text", "content", "input", "question", "query"):
            if key in value:
                return _render_input(value[key])
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    if value is None:
        return ""
    return str(value)


def _render_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for entry in value:
            if isinstance(entry, dict) and isinstance(entry.get("text"), str):
                parts.append(entry["text"])
            elif isinstance(entry, str):
                parts.append(entry)
        if parts:
            return "\n".join(parts)
    if isinstance(value, dict):
        return _render_input(value)
    return "" if value is None else str(value)


def _render_reference(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return "\n".join(str(entry) for entry in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _choose_field(
    forced: str | None,
    candidates: tuple[str, ...],
    rows: list[dict[str, Any]],
    role: str,
) -> str | None:
    if forced:
        if not any(_lookup(row, forced)[0] for row in rows):
            raise DatasetError(f"--{role}-field {forced!r} does not exist in any dataset row")
        return forced
    keys = {key for row in rows for key in row.keys()}
    # Prefer a candidate present in every row, then a dotted candidate, then any.
    for candidate in candidates:
        if "." not in candidate and candidate in keys:
            if all(_lookup(row, candidate)[0] for row in rows):
                return candidate
    for candidate in candidates:
        if "." in candidate and any(_lookup(row, candidate)[0] for row in rows):
            return candidate
    for candidate in candidates:
        if "." not in candidate and candidate in keys:
            return candidate
    return None


def load_dataset(path: str | Path, options: LoadOptions | None = None) -> Dataset:
    options = options or LoadOptions()
    data_path = Path(path)
    if not data_path.exists():
        raise DatasetError(f"dataset not found: {data_path}")
    if not data_path.is_file():
        raise DatasetError(f"dataset is not a file: {data_path}")

    raw_rows: list[tuple[int, dict[str, Any]]] = []
    with open(data_path, "r", encoding="utf-8-sig") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise DatasetError(
                    f"{data_path}:{line_number}: invalid JSON ({error.msg} at column {error.colno})"
                ) from error
            if not isinstance(row, dict):
                raise DatasetError(
                    f"{data_path}:{line_number}: each JSONL line must be an object, "
                    f"got {type(row).__name__}"
                )
            raw_rows.append((line_number, row))

    if not raw_rows:
        raise DatasetError(f"dataset has no rows: {data_path}")

    rows = [row for _, row in raw_rows]
    fields = sorted({key for row in rows for key in row.keys()})
    field_map = {
        "input": _choose_field(options.input_field, INPUT_CANDIDATES, rows, "input"),
        "rubric": _choose_field(options.rubric_field, RUBRIC_CANDIDATES, rows, "rubric"),
        "id": _choose_field(options.id_field, ID_CANDIDATES, rows, "id"),
        "weight": _choose_field(options.weight_field, WEIGHT_CANDIDATES, rows, "weight"),
        "reference": _choose_field(options.reference_field, REFERENCE_CANDIDATES, rows, "reference"),
    }
    if field_map["rubric"] is None:
        raise DatasetError(
            "dataset has no rubric field; expected one of: "
            + ", ".join(RUBRIC_CANDIDATES)
            + f" (fields found: {', '.join(fields)})"
        )
    if field_map["input"] is None:
        raise DatasetError(
            "dataset has no input field; expected one of: "
            + ", ".join(INPUT_CANDIDATES)
            + f" (fields found: {', '.join(fields)})"
        )

    items: list[Item] = []
    warnings: list[str] = []
    skipped: list[dict[str, Any]] = []
    seen_ids: dict[str, int] = {}

    for row_index, (line_number, row) in enumerate(raw_rows):
        problems: list[str] = []

        found, input_value = _lookup(row, field_map["input"])
        input_text = _render_input(input_value).strip() if found else ""
        if not found:
            problems.append(f"missing input field {field_map['input']!r}")
        elif not input_text:
            problems.append("input is empty")

        found, rubric_value = _lookup(row, field_map["rubric"])
        rubric: Rubric | None = None
        if not found or rubric_value is None:
            problems.append(f"missing rubric field {field_map['rubric']!r}")
        else:
            try:
                rubric = normalize_rubric(rubric_value, f"line {line_number}")
            except DatasetError as error:
                problems.append(str(error))

        if problems:
            entry = {"line": line_number, "problems": problems}
            if options.skip_invalid:
                skipped.append(entry)
                continue
            raise DatasetError(
                f"{data_path}:{line_number}: " + "; ".join(problems) + "; pass --skip-invalid to skip bad rows"
            )

        assert rubric is not None
        warnings.extend(rubric.warnings)

        reference: str | None = None
        if field_map["reference"]:
            found, reference_value = _lookup(row, field_map["reference"])
            if found:
                reference = _render_reference(reference_value)

        weight = 1.0
        if field_map["weight"]:
            found, weight_value = _lookup(row, field_map["weight"])
            if found:
                try:
                    weight = float(weight_value)
                except (TypeError, ValueError) as error:
                    raise DatasetError(
                        f"{data_path}:{line_number}: weight must be numeric, got {weight_value!r}"
                    ) from error
                if weight <= 0:
                    raise DatasetError(f"{data_path}:{line_number}: weight must be positive")

        if field_map["id"]:
            found, id_value = _lookup(row, field_map["id"])
            item_id = str(id_value) if found and id_value is not None else f"row-{row_index}"
        else:
            item_id = f"row-{row_index}"
        if item_id in seen_ids:
            warnings.append(
                f"duplicate item id {item_id!r} at line {line_number} "
                f"(first seen at line {seen_ids[item_id]}); per-item joins may be ambiguous"
            )
        else:
            seen_ids[item_id] = line_number

        items.append(
            Item(
                index=len(items),
                line=line_number,
                id=item_id,
                input=input_text,
                rubric=rubric,
                reference=reference,
                weight=weight,
                raw=row,
            )
        )
        if options.max_items and len(items) >= options.max_items:
            break

    if not items:
        raise DatasetError(f"dataset has no usable rows: {data_path}")

    inputs = Counter(item.input for item in items)
    duplicates = sum(count - 1 for count in inputs.values() if count > 1)
    if duplicates:
        warnings.append(f"{duplicates} rows share an identical input; consider deduplicating")

    return Dataset(
        path=data_path,
        sha256=sha256_file(data_path),
        items=items,
        fields=fields,
        field_map=field_map,
        warnings=_dedupe(warnings),
        skipped=skipped,
    )


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


@dataclass
class DatasetStats:
    rows: int
    fields: list[str]
    field_map: dict[str, str | None]
    criteria_total: int
    criteria_min: int
    criteria_max: int
    deterministic_criteria: int
    judged_criteria: int
    weight_sum: float
    input_chars: int
    skipped: int
    warnings: list[str]
    rubric_frequency: list[tuple[str, int]]
    sample: dict[str, Any] | None


def dataset_stats(dataset: Dataset, sample_chars: int = 400) -> DatasetStats:
    criteria_counts = [len(item.rubric.criteria) for item in dataset.items]
    deterministic = sum(len(item.rubric.deterministic_criteria) for item in dataset.items)
    judged = sum(len(item.rubric.judged_criteria) for item in dataset.items)
    frequency: Counter[str] = Counter()
    for item in dataset.items:
        for criterion in item.rubric.criteria:
            frequency[criterion.text] += 1
    sample: dict[str, Any] | None = None
    if dataset.items:
        first = dataset.items[0]
        sample = {
            "id": first.id,
            "line": first.line,
            "input": truncate(first.input, sample_chars),
            "rubric": [
                {
                    "id": criterion.id,
                    "text": criterion.text,
                    "weight": criterion.weight,
                    "check": criterion.check.describe() if criterion.check else None,
                }
                for criterion in first.rubric.criteria
            ],
            "reference": truncate(first.reference, sample_chars) if first.reference else None,
            "weight": first.weight,
        }
    return DatasetStats(
        rows=len(dataset.items),
        fields=dataset.fields,
        field_map=dataset.field_map,
        criteria_total=sum(criteria_counts),
        criteria_min=min(criteria_counts),
        criteria_max=max(criteria_counts),
        deterministic_criteria=deterministic,
        judged_criteria=judged,
        weight_sum=sum(item.weight for item in dataset.items),
        input_chars=sum(len(item.input) for item in dataset.items),
        skipped=len(dataset.skipped),
        warnings=dataset.warnings + [f"line {entry['line']}: " + "; ".join(entry["problems"]) for entry in dataset.skipped],
        rubric_frequency=frequency.most_common(10),
        sample=sample,
    )
