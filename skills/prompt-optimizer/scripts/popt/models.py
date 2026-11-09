"""Model configuration files: one or more target models with per-model settings."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from . import miniyaml
from .errors import ConfigError

API_KEY_FALLBACKS = ("PROMPT_OPT_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
TARGET_KEYS = {
    "name",
    "id",
    "model",
    "model_name",
    "base_url",
    "baseurl",
    "url",
    "endpoint",
    "api_key",
    "api_key_env",
    "key_env",
    "temperature",
    "max_tokens",
    "weight",
    "headers",
    "timeout",
    "max_retries",
    "llm_cmd",
    "enabled",
    "description",
}
TOP_KEYS = {"models", "targets", "judge", "optimizer", "version", "description"}


@dataclass
class ModelConfig:
    name: str
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    api_key_env: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    weight: float = 1.0
    headers: dict[str, str] = field(default_factory=dict)
    timeout: float | None = None
    max_retries: int | None = None
    llm_cmd: str | None = None
    enabled: bool = True

    @property
    def uses_command(self) -> bool:
        return bool(self.llm_cmd)

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model": self.model or self.name,
            "endpoint": "command" if self.uses_command else _safe_endpoint(self.base_url or ""),
            "weight": self.weight,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }


def _safe_endpoint(url: str) -> str:
    """Drop URL credentials/query before an endpoint reaches a report."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    if not parts.scheme or not parts.netloc:
        return url
    host = parts.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = host
    try:
        port = parts.port
    except ValueError:
        port = None
    if port:
        netloc += f":{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, "", ""))


@dataclass
class ModelsConfig:
    targets: list[ModelConfig]
    judge: ModelConfig | None = None
    optimizer: ModelConfig | None = None
    source: str | None = None


def _one_of(raw: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in raw:
            return raw[key]
    return None


def _number(raw: dict[str, Any], key: str, where: str) -> float | None:
    if key not in raw or raw[key] is None:
        return None
    value = raw[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{where}: {key!r} must be a number")
    return float(value)


def _integer(raw: dict[str, Any], key: str, where: str) -> int | None:
    if key not in raw or raw[key] is None:
        return None
    value = raw[key]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"{where}: {key!r} must be an integer")
    return int(value)


def _headers(raw: dict[str, Any], where: str) -> dict[str, str]:
    value = raw.get("headers")
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ConfigError(f"{where}: 'headers' must be a mapping of names to values")
    headers: dict[str, str] = {}
    for key, item in value.items():
        if not isinstance(key, str) or not key.strip():
            raise ConfigError(f"{where}: header names must be non-empty strings")
        if isinstance(item, bool) or not isinstance(item, (str, int, float)):
            raise ConfigError(f"{where}: header {key!r} must be a string")
        headers[key.strip()] = str(item)
    return headers


def model_config_from_mapping(
    raw: Any,
    *,
    where: str,
    default_name: str | None = None,
) -> ModelConfig:
    if not isinstance(raw, dict):
        raise ConfigError(f"{where}: model entry must be a mapping")
    unknown = set(raw) - TARGET_KEYS
    if unknown:
        raise ConfigError(
            f"{where}: unknown model field(s): {', '.join(sorted(unknown))}; "
            f"allowed: {', '.join(sorted(TARGET_KEYS))}"
        )

    enabled = raw.get("enabled", True)
    if not isinstance(enabled, bool):
        raise ConfigError(f"{where}: 'enabled' must be true or false")
    if not enabled:
        raise ConfigError(f"{where}: disabled model entries must be filtered by the caller")

    model = _one_of(raw, ("model", "model_name"))
    if model is not None and not isinstance(model, str):
        raise ConfigError(f"{where}: 'model' must be a string")
    llm_cmd = raw.get("llm_cmd")
    if llm_cmd is not None and not isinstance(llm_cmd, str):
        raise ConfigError(f"{where}: 'llm_cmd' must be a string")
    if not llm_cmd and not model:
        raise ConfigError(f"{where}: each model needs 'model' or 'llm_cmd'")

    name = raw.get("name", raw.get("id", default_name or model))
    if not isinstance(name, str) or not name.strip():
        raise ConfigError(f"{where}: 'name' must be a non-empty string")
    name = name.strip()

    base_url = _one_of(raw, ("base_url", "baseurl", "url", "endpoint"))
    if base_url is not None and not isinstance(base_url, str):
        raise ConfigError(f"{where}: 'base_url' must be a string")
    if not llm_cmd and not base_url:
        raise ConfigError(f"{where}: each model needs 'base_url' (or use 'llm_cmd')")

    api_key = raw.get("api_key")
    if api_key is not None and not isinstance(api_key, str):
        raise ConfigError(f"{where}: 'api_key' must be a string")
    api_key_env = _one_of(raw, ("api_key_env", "key_env"))
    if api_key_env is not None and not isinstance(api_key_env, str):
        raise ConfigError(f"{where}: 'api_key_env' must be a string")

    temperature = _number(raw, "temperature", where)
    if temperature is not None and not 0 <= temperature <= 2:
        raise ConfigError(f"{where}: temperature must be between 0 and 2")
    max_tokens = _integer(raw, "max_tokens", where)
    if max_tokens is not None and max_tokens <= 0:
        raise ConfigError(f"{where}: max_tokens must be a positive integer")
    weight = _number(raw, "weight", where)
    if weight is None:
        weight = 1.0
    if weight <= 0:
        raise ConfigError(f"{where}: weight must be positive")
    timeout = _number(raw, "timeout", where)
    if timeout is not None and timeout <= 0:
        raise ConfigError(f"{where}: timeout must be positive")
    max_retries = _integer(raw, "max_retries", where)
    if max_retries is not None and max_retries < 0:
        raise ConfigError(f"{where}: max_retries must be >= 0")

    return ModelConfig(
        name=name,
        model=model.strip() if model else None,
        base_url=base_url.strip() if base_url else None,
        api_key=api_key,
        api_key_env=api_key_env,
        temperature=temperature,
        max_tokens=max_tokens,
        weight=weight,
        headers=_headers(raw, where),
        timeout=timeout,
        max_retries=max_retries,
        llm_cmd=llm_cmd,
    )


def _targets_from_raw(raw: Any, where: str) -> list[ModelConfig]:
    entries: list[Any] = []
    if isinstance(raw, list):
        entries = raw
    elif isinstance(raw, dict):
        for name, entry in raw.items():
            if not isinstance(entry, dict):
                raise ConfigError(f"{where}: models[{name!r}] must be a mapping")
            entry = dict(entry)
            entry.setdefault("name", name)
            entries.append(entry)
    else:
        raise ConfigError(f"{where}: 'models' must be a list or a mapping")
    targets: list[ModelConfig] = []
    for index, entry in enumerate(entries):
        if isinstance(entry, dict) and entry.get("enabled") is False:
            continue
        targets.append(
            model_config_from_mapping(entry, where=f"{where}: models[{index}]")
        )
    if not targets:
        raise ConfigError(f"{where}: no enabled target models")
    names = [target.name for target in targets]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ConfigError(f"{where}: duplicate model names: {', '.join(duplicates)}")
    return targets


def load_models_config(path: str | Path) -> ModelsConfig:
    models_path = Path(path)
    if not models_path.exists():
        raise ConfigError(f"models config not found: {models_path}")
    try:
        document = miniyaml.loads(models_path.read_text(encoding="utf-8-sig"))
    except (OSError, miniyaml.MiniYamlError) as error:
        raise ConfigError(f"{models_path}: invalid YAML: {error}") from error

    where = str(models_path)
    if isinstance(document, list):
        targets = _targets_from_raw(document, where)
        return ModelsConfig(targets=targets, source=where)
    if not isinstance(document, dict):
        raise ConfigError(f"{where}: models config must be a mapping or a list")

    unknown = set(document) - TOP_KEYS
    if unknown:
        raise ConfigError(
            f"{where}: unknown top-level field(s): {', '.join(sorted(unknown))}; "
            f"allowed: {', '.join(sorted(TOP_KEYS))}"
        )

    raw_targets = document.get("models", document.get("targets"))
    if raw_targets is None:
        # Convenience: a single model entry at the top level.
        if any(key in document for key in ("model", "base_url", "llm_cmd")):
            raw_targets = [document]
        else:
            raise ConfigError(f"{where}: define a 'models' list")
    targets = _targets_from_raw(raw_targets, where)

    judge = None
    if document.get("judge") is not None:
        judge = model_config_from_mapping(
            document["judge"], where=f"{where}: judge", default_name="judge"
        )
        if judge.uses_command:
            judge.weight = 1.0
    optimizer = None
    if document.get("optimizer") is not None:
        optimizer = model_config_from_mapping(
            document["optimizer"], where=f"{where}: optimizer", default_name="optimizer"
        )
    return ModelsConfig(targets=targets, judge=judge, optimizer=optimizer, source=where)


def resolve_api_key(config: ModelConfig) -> str | None:
    if config.api_key:
        return config.api_key
    if config.api_key_env:
        return os.environ.get(config.api_key_env)
    # Never leak a global cloud key to a localhost endpoint by accident; local
    # servers that need auth can set api_key_env explicitly.
    if config.base_url and endpoint_is_local(config.base_url):
        return None
    for name in API_KEY_FALLBACKS:
        value = os.environ.get(name)
        if value:
            return value
    return None


def endpoint_is_local(url: str) -> bool:
    try:
        host = urlsplit(url).hostname
    except ValueError:
        return False
    return bool(host) and host.lower() in LOCAL_HOSTS


def api_key_hint(config: ModelConfig) -> str:
    if config.api_key_env:
        return f"set {config.api_key_env}"
    return "set PROMPT_OPT_API_KEY"
