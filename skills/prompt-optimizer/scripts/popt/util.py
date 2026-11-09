"""Small stdlib helpers: hashing, atomic writes, JSON extraction, time."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def local_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_text(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    ensure_dir(target.parent)
    target.write_text(text, encoding="utf-8", newline="\n")


def write_json(path: str | Path, value: Any, *, indent: int = 2) -> None:
    """Atomic JSON write so a crashed run never leaves a half file."""
    target = Path(path)
    ensure_dir(target.parent)
    payload = json.dumps(value, ensure_ascii=False, indent=indent) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=target.name + ".", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def write_jsonl(path: str | Path, rows: list[dict[str, Any]]) -> None:
    target = Path(path)
    ensure_dir(target.parent)
    text = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    write_text(target, text)


def read_json(path: str | Path) -> Any:
    return json.loads(read_text(path))


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            rows.append(json.loads(line))
    return rows


def truncate(text: str, limit: int, suffix: str = "…[truncated]") -> str:
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(0, limit - len(suffix))] + suffix


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def short_hash(text: str, length: int = 8) -> str:
    return sha256_text(text)[:length]


_NUMBER_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")


def first_number(text: str) -> float | None:
    match = _NUMBER_RE.search(text or "")
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if len(lines) >= 2 and lines[0].startswith("```"):
        body = lines[1:]
        if body and body[-1].strip().startswith("```"):
            body = body[:-1]
        return "\n".join(body).strip()
    return stripped


def extract_json(text: str) -> Any:
    """Best-effort JSON extraction from an LLM reply.

    Accepts a bare JSON document, a fenced code block, or prose with one
    balanced JSON object/array embedded in it. Raises ValueError when no
    parseable JSON is found.
    """
    if text is None:
        raise ValueError("empty reply")
    candidate = _strip_code_fence(text)
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        pass

    # Scan for the first balanced {...} or [...] that parses.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = candidate.find(opener)
        while start != -1:
            depth = 0
            in_string = False
            escape = False
            for index in range(start, len(candidate)):
                char = candidate[index]
                if in_string:
                    if escape:
                        escape = False
                    elif char == "\\":
                        escape = True
                    elif char == '"':
                        in_string = False
                    continue
                if char == '"':
                    in_string = True
                elif char == opener:
                    depth += 1
                elif char == closer:
                    depth -= 1
                    if depth == 0:
                        chunk = candidate[start : index + 1]
                        try:
                            return json.loads(chunk)
                        except json.JSONDecodeError:
                            break
            start = candidate.find(opener, start + 1)
    raise ValueError("no parseable JSON found")


def relpath(path: str | Path, base: str | Path) -> str:
    """Relative path that uses forward slashes on every platform."""
    try:
        return os.path.relpath(str(path), str(base)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def human_bytes(count: int) -> str:
    size = float(count)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f}{unit}" if unit != "B" else f"{int(size)}B"
        size /= 1024
    return f"{count}B"
