"""Prompt files: plain system prompts or a small JSON spec with a user template."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .errors import ConfigError
from .util import read_text, sha256_text, stable_json

INPUT_TOKENS = ("{{input}}", "{input}")
PROMPT_JSON_KEYS = {
    "system",
    "instruction",
    "prompt",
    "user_template",
    "user",
    "template",
    "few_shot",
    "temperature",
    "max_tokens",
}


@dataclass
class PromptSpec:
    system: str
    user_template: str | None = None
    few_shot: list[dict[str, str]] = field(default_factory=list)
    temperature: float = 0.0
    max_tokens: int | None = None
    source: str | None = None

    def rendered_user(self, item_input: str) -> str:
        if not self.user_template:
            return item_input
        rendered = self.user_template
        replaced = False
        for token in INPUT_TOKENS:
            if token in rendered:
                rendered = rendered.replace(token, item_input)
                replaced = True
        if not replaced:
            rendered = rendered.rstrip() + "\n\n" + item_input
        return rendered

    def messages(self, item_input: str) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if self.system.strip():
            messages.append({"role": "system", "content": self.system})
        messages.extend(self.few_shot)
        messages.append({"role": "user", "content": self.rendered_user(item_input)})
        return messages

    def identity(self) -> str:
        return sha256_text(
            stable_json(
                {
                    "system": self.system,
                    "user_template": self.user_template,
                    "few_shot": self.few_shot,
                }
            )
        )

    def display_text(self, include_metadata: bool = True) -> str:
        parts: list[str] = []
        if self.system.strip():
            parts.append("# system\n" + self.system.rstrip())
        if self.user_template:
            parts.append("# user template\n" + self.user_template.rstrip())
        if self.few_shot and include_metadata:
            lines = [f"# few-shot ({len(self.few_shot)} messages)"]
            for message in self.few_shot:
                lines.append(f"## {message['role']}\n{message['content'].rstrip()}")
            parts.append("\n".join(lines))
        return "\n\n".join(parts).strip() + "\n"


def _validate_few_shot(raw: Any) -> list[dict[str, str]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ConfigError("prompt JSON 'few_shot' must be a list of chat messages")
    messages: list[dict[str, str]] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ConfigError(f"few_shot[{index}] must be an object with role and content")
        role = str(entry.get("role", "")).strip().lower()
        if role not in {"system", "user", "assistant"}:
            raise ConfigError(f"few_shot[{index}].role must be system, user or assistant")
        content = entry.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ConfigError(f"few_shot[{index}].content must be a non-empty string")
        messages.append({"role": role, "content": content})
    return messages


def _spec_from_json(payload: dict[str, Any], source: str | None) -> PromptSpec:
    system = ""
    for key in ("system", "instruction", "prompt"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            system = value
            break
    user_template = None
    for key in ("user_template", "template", "user"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            user_template = value
            break
    if not system.strip():
        raise ConfigError(
            f"{source or 'prompt'}: JSON prompt needs a non-empty 'system', 'instruction' or 'prompt' string"
        )
    if any(token in system for token in INPUT_TOKENS):
        raise ConfigError(
            "the system prompt must not contain an {input} placeholder; "
            "put it in 'user_template' instead"
        )
    temperature = payload.get("temperature", 0.0)
    if not isinstance(temperature, (int, float)) or isinstance(temperature, bool) or temperature < 0 or temperature > 2:
        raise ConfigError("prompt JSON 'temperature' must be a number between 0 and 2")
    max_tokens = payload.get("max_tokens")
    if max_tokens is not None:
        if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or max_tokens <= 0:
            raise ConfigError("prompt JSON 'max_tokens' must be a positive integer")
    return PromptSpec(
        system=system.strip(),
        user_template=user_template,
        few_shot=_validate_few_shot(payload.get("few_shot")),
        temperature=float(temperature),
        max_tokens=max_tokens,
        source=source,
    )


def _spec_from_text(text: str, source: str | None) -> PromptSpec:
    stripped = text.strip()
    if not stripped:
        raise ConfigError(f"{source or 'prompt'}: prompt is empty")
    if any(token in stripped for token in INPUT_TOKENS):
        raise ConfigError(
            "the system prompt must not contain an {input} placeholder; "
            "use a JSON prompt with 'user_template' instead"
        )
    return PromptSpec(system=stripped, source=source)


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

    stripped = text.lstrip()
    if stripped.startswith("{"):
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict) and PROMPT_JSON_KEYS & set(payload.keys()):
            return _spec_from_json(payload, source)
    return _spec_from_text(text, source)
