"""Rubric normalization and deterministic criterion checks.

A rubric is a list of weighted criteria. Each criterion is either:

* scored by an LLM judge from 0 / 0.5 / 1, or
* checked deterministically (``check``) with a rule such as ``contains``.

Item score is ``100 * sum(weight * score) / sum(weight)`` so every row lands
on the same 0-100 scale no matter how many criteria it carries.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from .errors import DatasetError
from .util import first_number

CHECK_TYPES = {
    "contains",
    "not_contains",
    "any_of",
    "all_of",
    "regex",
    "exact",
    "numeric",
    "max_words",
    "max_chars",
    "min_words",
    "min_chars",
    "json",
    "nonempty",
    "starts_with",
    "ends_with",
}

TEXT_KEYS = ("criterion", "criteria", "description", "text", "requirement", "name", "title")
WEIGHT_KEYS = ("weight", "w", "importance")
CHECK_KEYS = ("check", "checks", "rule", "assert")


@dataclass(frozen=True)
class Check:
    type: str
    value: Any = None
    tolerance: float = 0.0
    ignore_case: bool = False

    def describe(self) -> str:
        if self.type in {"json", "nonempty"}:
            return self.type
        return f"{self.type}: {self.value!r}" + (" (ignore case)" if self.ignore_case else "")


@dataclass(frozen=True)
class Criterion:
    id: str
    text: str
    weight: float = 1.0
    check: Check | None = None


@dataclass
class Rubric:
    criteria: list[Criterion] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def judged_criteria(self) -> list[Criterion]:
        return [criterion for criterion in self.criteria if criterion.check is None]

    @property
    def deterministic_criteria(self) -> list[Criterion]:
        return [criterion for criterion in self.criteria if criterion.check is not None]

    def weight_sum(self) -> float:
        return sum(criterion.weight for criterion in self.criteria)


def _coerce_weight(raw: Any, where: str) -> float:
    if raw is None:
        return 1.0
    try:
        weight = float(raw)
    except (TypeError, ValueError) as error:
        raise DatasetError(f"{where}: weight must be a number, got {raw!r}") from error
    if weight <= 0 or weight != weight or weight in (float("inf"), float("-inf")):
        raise DatasetError(f"{where}: weight must be a positive finite number, got {raw!r}")
    return weight


def _parse_check(raw: Any, where: str) -> Check | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        if raw.strip().lower() in CHECK_TYPES:
            raw = {"type": raw.strip().lower()}
        else:
            match = re.match(r"^\s*([a-z_]+)\s*[:=]\s*(.*)$", raw, re.S)
            if not match:
                raise DatasetError(
                    f"{where}: check string must look like 'contains: value', got {raw!r}"
                )
            check_type, value = match.group(1), match.group(2).strip()
            raw = {"type": check_type, "value": value}
    if not isinstance(raw, dict):
        raise DatasetError(f"{where}: check must be an object or a string, got {type(raw).__name__}")

    check_type = raw.get("type") or raw.get("kind") or raw.get("operator")
    if not isinstance(check_type, str):
        raise DatasetError(f"{where}: check is missing a string 'type'")
    check_type = check_type.strip().lower()
    if check_type not in CHECK_TYPES:
        raise DatasetError(
            f"{where}: unknown check type {check_type!r}; supported: {', '.join(sorted(CHECK_TYPES))}"
        )

    value = raw.get("value", raw.get("expected", raw.get("target", raw.get("pattern"))))
    tolerance = raw.get("tolerance", 0.0)
    try:
        tolerance = float(tolerance or 0.0)
    except (TypeError, ValueError) as error:
        raise DatasetError(f"{where}: check tolerance must be a number") from error
    ignore_case = bool(raw.get("ignore_case") or raw.get("ignoreCase") or raw.get("case_insensitive"))
    if isinstance(raw.get("flags"), str) and "i" in raw["flags"]:
        ignore_case = True

    needs_value = check_type not in {"json", "nonempty"}
    if needs_value and value is None:
        raise DatasetError(f"{where}: check {check_type!r} requires a 'value'")
    if check_type in {"any_of", "all_of"}:
        if isinstance(value, str):
            value = [part.strip() for part in value.split("|") if part.strip()]
        if not isinstance(value, list) or not value:
            raise DatasetError(f"{where}: check {check_type!r} requires a non-empty list of values")
        value = [str(item) for item in value]
    if check_type in {"max_words", "min_words", "max_chars", "min_chars"}:
        try:
            value = int(value)
        except (TypeError, ValueError) as error:
            raise DatasetError(f"{where}: check {check_type!r} requires an integer value") from error
        if value < 0:
            raise DatasetError(f"{where}: check {check_type!r} requires a non-negative value")
    if check_type == "numeric":
        try:
            value = float(value)
        except (TypeError, ValueError) as error:
            raise DatasetError(f"{where}: check 'numeric' requires a numeric value") from error
    if check_type == "regex":
        try:
            re.compile(str(value))
        except re.error as error:
            raise DatasetError(f"{where}: invalid regex {value!r}: {error}") from error
    if check_type in {"contains", "not_contains", "starts_with", "ends_with", "regex", "exact"}:
        value = str(value)
    return Check(type=check_type, value=value, tolerance=tolerance, ignore_case=ignore_case)


def _criterion_from_text(text: str, index: int, where: str) -> Criterion:
    text = text.strip()
    if not text:
        raise DatasetError(f"{where}: criterion {index + 1} is empty")
    return Criterion(id=f"c{index + 1}", text=text)


def _criterion_from_object(raw: dict[str, Any], index: int, where: str) -> Criterion:
    text = ""
    for key in TEXT_KEYS:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            text = value.strip()
            break
    if not text:
        raise DatasetError(
            f"{where}: criterion {index + 1} has no text (use one of: {', '.join(TEXT_KEYS)})"
        )
    criterion_id = raw.get("id") or raw.get("key") or f"c{index + 1}"
    criterion_id = str(criterion_id).strip() or f"c{index + 1}"
    weight = _coerce_weight(raw.get("weight", raw.get("w", raw.get("importance"))), where)
    check_raw = None
    for key in CHECK_KEYS:
        if key in raw and raw[key] is not None:
            check_raw = raw[key]
            break
    check = _parse_check(check_raw, f"{where}, criterion {criterion_id!r}")
    return Criterion(id=criterion_id, text=text, weight=weight, check=check)


def _looks_like_json(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("{") or stripped.startswith("[")


def normalize_rubric(raw: Any, where: str = "rubric") -> Rubric:
    """Normalize every supported rubric spelling into a :class:`Rubric`.

    Accepted shapes::

        "The answer cites at least one source."
        ["Cites a source.", "Stays under 100 words."]
        {"criteria": [{"id": "cite", "text": "...", "weight": 2}, ...]}
        [{"id": "format", "text": "...", "check": {"type": "json"}}, ...]
        [{"text": "...", "check": "contains: refund"}]
    """
    warnings: list[str] = []

    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            raise DatasetError(f"{where}: rubric is empty")
        if _looks_like_json(text):
            try:
                decoded = json.loads(text)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, (list, dict)):
                nested = normalize_rubric(decoded, where)
                nested.warnings = warnings + nested.warnings
                return nested
        return Rubric(criteria=[_criterion_from_text(text, 0, where)], warnings=warnings)

    if isinstance(raw, dict):
        for key in ("criteria", "rubric", "items", "rules"):
            nested = raw.get(key)
            if isinstance(nested, list):
                rubric = normalize_rubric(nested, where)
                rubric.warnings = warnings + rubric.warnings
                return rubric
        # Map form: {"Accuracy": "Answer is factually correct", "Tone": "..."}
        if raw and not any(key in raw for key in TEXT_KEYS) and all(
            isinstance(value, str) for value in raw.values()
        ):
            criteria = [
                Criterion(id=str(key), text=value.strip(), weight=1.0)
                for key, value in raw.items()
                if value.strip()
            ]
            if not criteria:
                raise DatasetError(f"{where}: rubric object has no non-empty criteria")
            return Rubric(criteria=criteria, warnings=warnings)
        return Rubric(criteria=[_criterion_from_object(raw, 0, where)], warnings=warnings)

    if isinstance(raw, list):
        if not raw:
            raise DatasetError(f"{where}: rubric list is empty")
        criteria: list[Criterion] = []
        seen: set[str] = set()
        for index, entry in enumerate(raw):
            if isinstance(entry, str):
                criterion = _criterion_from_text(entry, index, where)
            elif isinstance(entry, dict):
                criterion = _criterion_from_object(entry, index, where)
            else:
                raise DatasetError(
                    f"{where}: criterion {index + 1} must be a string or object, "
                    f"got {type(entry).__name__}"
                )
            if criterion.id in seen:
                renamed = f"{criterion.id}_{index + 1}"
                warnings.append(f"{where}: duplicate criterion id {criterion.id!r} renamed to {renamed!r}")
                criterion = Criterion(
                    id=renamed, text=criterion.text, weight=criterion.weight, check=criterion.check
                )
            seen.add(criterion.id)
            criteria.append(criterion)
        return Rubric(criteria=criteria, warnings=warnings)

    raise DatasetError(
        f"{where}: rubric must be a string, object or list, got {type(raw).__name__}"
    )


def evaluate_check(check: Check, output: str) -> tuple[float, str]:
    """Apply a deterministic check. Returns (score in {0,1}, rationale)."""
    text = "" if output is None else str(output)
    haystack = text.lower() if check.ignore_case else text
    value = check.value

    if check.type == "contains":
        needle = str(value).lower() if check.ignore_case else str(value)
        passed = needle in haystack
        return (1.0 if passed else 0.0), f"{'found' if passed else 'missing'} required text {value!r}"
    if check.type == "not_contains":
        needle = str(value).lower() if check.ignore_case else str(value)
        passed = needle not in haystack
        return (1.0 if passed else 0.0), f"{'absent' if passed else 'present'} forbidden text {value!r}"
    if check.type == "any_of":
        found = [item for item in value if (item.lower() if check.ignore_case else item) in haystack]
        return (1.0 if found else 0.0), f"matched {found!r}" if found else "matched none of the required options"
    if check.type == "all_of":
        missing = [item for item in value if (item.lower() if check.ignore_case else item) not in haystack]
        return (1.0 if not missing else 0.0), "all required options present" if not missing else f"missing {missing!r}"
    if check.type == "regex":
        flags = re.IGNORECASE if check.ignore_case else 0
        match = re.search(str(value), text, flags)
        return (1.0 if match else 0.0), f"regex {'matched' if match else 'did not match'} {value!r}"
    if check.type == "exact":
        expected = str(value)
        if check.ignore_case:
            passed = haystack.strip() == expected.lower().strip()
        else:
            passed = text.strip() == expected.strip()
        return (1.0 if passed else 0.0), f"exact match {'succeeded' if passed else 'failed'}"
    if check.type == "numeric":
        number = first_number(text)
        if number is None:
            return 0.0, "no number found in output"
        passed = abs(number - float(value)) <= check.tolerance
        return (1.0 if passed else 0.0), f"found {number}, expected {value} (±{check.tolerance})"
    if check.type in {"max_words", "min_words"}:
        count = len(re.findall(r"\S+", text))
        passed = count <= int(value) if check.type == "max_words" else count >= int(value)
        return (1.0 if passed else 0.0), f"{count} words, limit {value}"
    if check.type in {"max_chars", "min_chars"}:
        count = len(text)
        passed = count <= int(value) if check.type == "max_chars" else count >= int(value)
        return (1.0 if passed else 0.0), f"{count} chars, limit {value}"
    if check.type == "json":
        try:
            from .util import extract_json

            extract_json(text)
        except ValueError:
            return 0.0, "output is not valid JSON"
        return 1.0, "output parses as JSON"
    if check.type == "nonempty":
        passed = bool(text.strip())
        return (1.0 if passed else 0.0), "output is non-empty" if passed else "output is empty"
    if check.type == "starts_with":
        needle = str(value)
        passed = haystack.lstrip().startswith(needle.lower() if check.ignore_case else needle)
        return (1.0 if passed else 0.0), f"{'starts' if passed else 'does not start'} with {needle!r}"
    if check.type == "ends_with":
        needle = str(value)
        passed = haystack.rstrip().endswith(needle.lower() if check.ignore_case else needle)
        return (1.0 if passed else 0.0), f"{'ends' if passed else 'does not end'} with {needle!r}"

    raise DatasetError(f"unsupported check type {check.type!r}")


def render_criteria(criteria: list[Criterion], *, with_checks: bool = False) -> str:
    lines: list[str] = []
    for criterion in criteria:
        suffix = f" [automatic check: {criterion.check.describe()}]" if with_checks and criterion.check else ""
        lines.append(f"- [{criterion.id}] (weight {criterion.weight:g}) {criterion.text}{suffix}")
    return "\n".join(lines)
