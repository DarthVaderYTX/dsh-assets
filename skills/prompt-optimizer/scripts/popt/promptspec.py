"""Prompt templates: YAML messages, with legacy plain-text conversion."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import miniyaml
from .errors import ConfigError
from .util import read_text, sha256_text, stable_json

INPUT_PATTERN = re.compile(r"\{\{\s*input\s*\}\}")
LEGACY_INPUT_PATTERN = re.compile(r"(?<!\{)\{input\}(?!\})")
MESSAGE_ROLES = {"system", "user", "assistant", "developer"}


@dataclass
class PromptSpec:
    messages: list[dict[str, str]]
    name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    source: str | None = None

    @property
    def system_text(self) -> str:
        parts = [message["content"] for message in self.messages if message["role"] == "system"]
        return "\n\n".join(part for part in parts if part.strip())

    def with_system(self, system: str) -> "PromptSpec":
        system = system.strip()
        if not system:
            raise ConfigError("candidate system prompt is empty")
        first_system = next(
            (index for index, message in enumerate(self.messages) if message["role"] == "system"),
            None,
        )
        messages = [dict(message) for message in self.messages]
        if first_system is None:
            messages.insert(0, {"role": "system", "content": system})
        else:
            messages[first_system] = {"role": "system", "content": system}
            messages = [
                message
                for index, message in enumerate(messages)
                if message["role"] != "system" or index == first_system
            ]
        return PromptSpec(
            messages=messages,
            name=self.name,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            source=self.source,
        )

    def rendered_messages(self, item_input: str) -> list[dict[str, str]]:
        replaced = False
        rendered: list[dict[str, str]] = []
        for message in self.messages:
            content, count = INPUT_PATTERN.subn(lambda _match: item_input, message["content"])
            replaced = replaced or count > 0
            rendered.append({"role": message["role"], "content": content})
        if not replaced:
            rendered.append({"role": "user", "content": item_input})
        return rendered

    def identity(self) -> str:
        return sha256_text(stable_json(self.messages))

    def display_text(self) -> str:
        lines: list[str] = []
        if self.name:
            lines.append(f"name: {_yaml_scalar(self.name)}")
        if self.temperature is not None:
            lines.append(f"temperature: {self.temperature:g}")
        if self.max_tokens is not None:
            lines.append(f"max_tokens: {self.max_tokens}")
        lines.append("messages:")
        for message in self.messages:
            lines.append(f"  - role: {message['role']}")
            content = message["content"].rstrip("\n")
            if not content:
                lines.append('    content: ""')
                continue
            lines.append("    content: |-")
            for content_line in content.split("\n"):
                lines.append("      " + content_line if content_line else "")
        return "\n".join(lines) + "\n"


def _yaml_scalar(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        return value
    return json.dumps(value, ensure_ascii=False)


def _validate_messages(raw: Any, source: str | None) -> list[dict[str, str]]:
    if not isinstance(raw, list) or not raw:
        raise ConfigError(f"{source or 'prompt'}: 'messages' must be a non-empty list")
    messages: list[dict[str, str]] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ConfigError(f"{source or 'prompt'}: messages[{index}] must be an object")
        role = str(entry.get("role", "")).strip().lower()
        if role not in MESSAGE_ROLES:
            raise ConfigError(
                f"{source or 'prompt'}: messages[{index}].role must be one of "
                f"{', '.join(sorted(MESSAGE_ROLES))}, got {entry.get('role')!r}"
            )
        content = entry.get("content")
        if not isinstance(content, str):
            raise ConfigError(f"{source or 'prompt'}: messages[{index}].content must be a string")
        messages.append({"role": role, "content": content})
    return messages


def _number(payload: dict[str, Any], key: str, source: str | None) -> float | None:
    value = payload.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{source or 'prompt'}: {key!r} must be a number")
    return float(value)


def _positive_int(payload: dict[str, Any], key: str, source: str | None) -> int | None:
    value = payload.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ConfigError(f"{source or 'prompt'}: {key!r} must be a positive integer")
    return value


def _from_document(document: Any, source: str | None) -> PromptSpec:
    if isinstance(document, list):
        return PromptSpec(messages=_validate_messages(document, source), source=source)
    if isinstance(document, str):
        text = document.strip()
        if not text:
            raise ConfigError(f"{source or 'prompt'}: prompt is empty")
        return PromptSpec(messages=[{"role": "system", "content": text}], source=source)
    if not isinstance(document, dict):
        raise ConfigError(f"{source or 'prompt'}: prompt must be a mapping or a message list")

    if "messages" in document:
        messages = _validate_messages(document.get("messages"), source)
        temperature = _number(document, "temperature", source)
        if temperature is not None and not 0 <= temperature <= 2:
            raise ConfigError(f"{source or 'prompt'}: temperature must be between 0 and 2")
        return PromptSpec(
            messages=messages,
            name=str(document.get("name")) if document.get("name") else None,
            temperature=temperature,
            max_tokens=_positive_int(document, "max_tokens", source),
            source=source,
        )

    # Legacy single-system formats remain accepted for older prompt files.
    system = ""
    for key in ("system", "instruction", "prompt"):
        value = document.get(key)
        if isinstance(value, str) and value.strip():
            system = value.strip()
            break
    user_template = None
    for key in ("user_template", "template", "user"):
        value = document.get(key)
        if isinstance(value, str) and value:
            user_template = LEGACY_INPUT_PATTERN.sub("{{input}}", value)
            break
    few_shot = document.get("few_shot") or []
    if not isinstance(few_shot, list):
        raise ConfigError(f"{source or 'prompt'}: few_shot must be a list of messages")
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    for index, entry in enumerate(few_shot):
        if not isinstance(entry, dict):
            raise ConfigError(f"{source or 'prompt'}: few_shot[{index}] must be an object")
        role = str(entry.get("role", "")).strip().lower()
        if role not in MESSAGE_ROLES - {"system"}:
            raise ConfigError(f"{source or 'prompt'}: few_shot[{index}].role is invalid")
        content = entry.get("content")
        if not isinstance(content, str):
            raise ConfigError(f"{source or 'prompt'}: few_shot[{index}].content must be a string")
        messages.append({"role": role, "content": content})
    if user_template:
        messages.append({"role": "user", "content": user_template})
    if not messages:
        raise ConfigError(
            f"{source or 'prompt'}: define 'messages', or a legacy 'system'/'prompt' field"
        )
    temperature = _number(document, "temperature", source)
    if temperature is not None and not 0 <= temperature <= 2:
        raise ConfigError(f"{source or 'prompt'}: temperature must be between 0 and 2")
    return PromptSpec(
        messages=messages,
        name=str(document.get("name")) if document.get("name") else None,
        temperature=temperature,
        max_tokens=_positive_int(document, "max_tokens", source),
        source=source,
    )


def _looks_like_yaml(text: str) -> bool:
    stripped = text.lstrip()
    if stripped.startswith(("{", "[", "---")):
        return True
    if re.match(r"(?m)^\s*-\s+(role|content)\s*:", text):
        return True
    if re.match(r"(?m)^\s*-\s*\{", text):
        return True
    return bool(
        re.search(
            r"(?m)^\s*(messages|system|instruction|prompt|user_template|template|few_shot)\s*:",
            text,
        )
    )


def parse_prompt_text(text: str, source: str | None = None) -> PromptSpec:
    stripped = text.lstrip()
    if stripped.startswith("{"):
        try:
            document = json.loads(stripped)
        except json.JSONDecodeError:
            document = None
        if isinstance(document, dict):
            return _from_document(document, source)
    if not _looks_like_yaml(text):
        plain = text.strip()
        if not plain:
            raise ConfigError(f"{source or 'prompt'}: prompt is empty")
        return _from_document(plain, source)
    try:
        document = miniyaml.loads(text)
    except miniyaml.MiniYamlError as error:
        raise ConfigError(f"{source or 'prompt'}: invalid YAML: {error}") from error
    return _from_document(document, source)


def load_prompt(path: str | Path | None = None, inline: str | None = None) -> PromptSpec:
    if bool(path) == bool(inline):
        raise ConfigError("provide exactly one of --prompt-file or --prompt")
    if path:
        prompt_path = Path(path)
        if not prompt_path.exists():
            raise ConfigError(f"prompt file not found: {prompt_path}")
        text = read_text(prompt_path)
        source = str(prompt_path)
    else:
        text = inline or ""
        source = "<inline>"
    return parse_prompt_text(text, source)
