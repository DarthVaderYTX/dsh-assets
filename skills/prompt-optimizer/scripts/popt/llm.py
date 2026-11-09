"""LLM transport: OpenAI-compatible HTTP, custom command, cache and budget.

Only the Python standard library is used so the harness runs anywhere the
skill is installed. Every model call goes through :class:`CountingClient`,
which owns caching, usage accounting and the call budget.
"""

from __future__ import annotations

import json
import os
import random
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .errors import BudgetExceeded, ConfigError, LLMError
from .util import ensure_dir, sha256_text, stable_json, write_json

RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504, 529}
DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_MODEL = "deepseek-chat"


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cache_hits: int = 0

    def add(self, other: "Usage") -> None:
        self.calls += other.calls
        self.prompt_tokens += other.prompt_tokens
        self.completion_tokens += other.completion_tokens
        self.total_tokens += other.total_tokens
        self.cache_hits += other.cache_hits

    def to_dict(self) -> dict[str, int]:
        return {
            "calls": self.calls,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "cache_hits": self.cache_hits,
        }

    def copy(self) -> "Usage":
        return Usage(
            calls=self.calls,
            prompt_tokens=self.prompt_tokens,
            completion_tokens=self.completion_tokens,
            total_tokens=self.total_tokens,
            cache_hits=self.cache_hits,
        )


@dataclass
class Completion:
    text: str
    usage: Usage
    model: str = ""
    finish_reason: str | None = None


class Backend(Protocol):
    name: str

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> Completion: ...


class HttpBackend:
    """OpenAI-compatible ``/chat/completions`` client."""

    name = "http"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 180.0,
        max_retries: int = 3,
        extra_headers: dict[str, str] | None = None,
        label: str = "",
    ) -> None:
        if not base_url:
            raise ConfigError("model base URL is empty; set --base-url or PROMPT_OPT_BASE_URL")
        if not model:
            raise ConfigError("model name is empty; set --model or PROMPT_OPT_MODEL")
        self.base_url = base_url.rstrip("/")
        self.endpoint = (
            self.base_url if self.base_url.endswith("/chat/completions") else self.base_url + "/chat/completions"
        )
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max(0, max_retries)
        self.extra_headers = extra_headers or {}
        self.label = label or model
        # Include endpoint/model plus hashed auth and headers so two configs that
        # share an endpoint but use different tenants do not share cached answers.
        auth_fingerprint = sha256_text(api_key)[:8] if api_key else ""
        header_fingerprint = (
            sha256_text(stable_json(self.extra_headers))[:8] if self.extra_headers else ""
        )
        self.name = (
            f"http:{self.endpoint}:{model}:{header_fingerprint}:{auth_fingerprint}"
        )

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        headers.update(self.extra_headers)
        return headers

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> Completion:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        last_error: Exception | None = None
        json_mode_active = json_mode
        attempt = 0
        while attempt <= self.max_retries:
            attempt += 1
            request = urllib.request.Request(
                self.endpoint, data=body, headers=self._headers(), method="POST"
            )
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = response.read().decode("utf-8", errors="replace")
                return self._parse_completion(raw, json_mode_active)
            except urllib.error.HTTPError as error:
                detail = _read_error_body(error)
                if (
                    error.code in {400, 422}
                    and json_mode_active
                    and ("response_format" in detail.lower() or "json" in detail.lower())
                ):
                    json_mode_active = False
                    payload.pop("response_format", None)
                    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    last_error = LLMError(f"{self.label}: provider rejected response_format: {detail}")
                    continue
                if error.code not in RETRYABLE_STATUS:
                    raise LLMError(
                        f"{self.label}: HTTP {error.code} from {self.endpoint}: {detail}"
                    ) from error
                last_error = LLMError(f"{self.label}: HTTP {error.code}: {detail}")
                retry_after = _retry_after_seconds(error)
                self._sleep(attempt, retry_after)
            except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as error:
                last_error = LLMError(f"{self.label}: connection failed: {error}")
                self._sleep(attempt, None)
            except json.JSONDecodeError as error:
                last_error = LLMError(f"{self.label}: provider returned non-JSON response: {error}")
                self._sleep(attempt, None)

        raise LLMError(f"{last_error or self.label + ': request failed'} (after {attempt} attempts)")

    def _sleep(self, attempt: int, retry_after: float | None) -> None:
        if attempt > self.max_retries:
            return
        delay = retry_after if retry_after is not None else min(30.0, 1.5 ** attempt) + random.random()
        time.sleep(max(0.0, delay))

    def _parse_completion(self, raw: str, json_mode: bool) -> Completion:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            raise LLMError(f"{self.label}: provider returned non-JSON body: {error}") from error
        choices = data.get("choices") or []
        if not choices:
            raise LLMError(f"{self.label}: response has no choices: {raw[:500]}")
        choice = choices[0]
        message = choice.get("message") or {}
        content = message.get("content")
        if isinstance(content, list):
            content = "\n".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        if content is None:
            content = choice.get("text")
        text = (content or "").strip()
        if not text:
            finish = choice.get("finish_reason")
            raise LLMError(
                f"{self.label}: empty completion (finish_reason={finish}); "
                "raise --max-tokens if the model hit the length limit"
            )
        usage_raw = data.get("usage") or {}
        usage = Usage(
            calls=1,
            prompt_tokens=int(usage_raw.get("prompt_tokens") or 0),
            completion_tokens=int(usage_raw.get("completion_tokens") or 0),
            total_tokens=int(usage_raw.get("total_tokens") or 0),
        )
        return Completion(
            text=text,
            usage=usage,
            model=str(data.get("model") or self.model),
            finish_reason=choice.get("finish_reason"),
        )


def _read_error_body(error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - diagnostics only
        return error.reason or ""
    return body.strip()[:1000] or str(error.reason or "")


def _retry_after_seconds(error: urllib.error.HTTPError) -> float | None:
    value = error.headers.get("Retry-After") if error.headers else None
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


class CommandBackend:
    """Run a user-supplied command per completion.

    The command receives one JSON object on stdin::

        {"messages": [...], "temperature": 0.0, "max_tokens": 1024, "json_mode": false}

    and must print either ``{"text": "...", "usage": {...}}`` or the raw reply.
    This is the escape hatch for gateways, local runners or proprietary CLIs.
    """

    name = "command"

    def __init__(self, command: str, *, timeout: float = 300.0, label: str = "command") -> None:
        if not command.strip():
            raise ConfigError("--llm-cmd is empty")
        self.command = command
        self.timeout = timeout
        self.label = label
        self.model = label
        # Never put the raw command into run manifests or the cache key namespace:
        # it may contain credentials.
        self.name = f"command:{label}:{sha256_text(command)[:12]}"

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> Completion:
        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "json_mode": json_mode,
        }
        try:
            process = subprocess.run(
                self.command,
                input=json.dumps(payload, ensure_ascii=False),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=True,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as error:
            raise LLMError(f"{self.label}: command timed out after {self.timeout}s") from error
        if process.returncode != 0:
            raise LLMError(
                f"{self.label}: command exited {process.returncode}: {process.stderr.strip()[:1000]}"
            )
        stdout = process.stdout.strip()
        if not stdout:
            raise LLMError(f"{self.label}: command produced no output")
        text = stdout
        usage = Usage(calls=1)
        if stdout.startswith("{"):
            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                data = None
            if isinstance(data, dict):
                raw_text = data.get("text") or data.get("content") or data.get("completion")
                if isinstance(raw_text, str):
                    text = raw_text.strip()
                usage_raw = data.get("usage") or {}
                usage = Usage(
                    calls=1,
                    prompt_tokens=int(usage_raw.get("prompt_tokens") or 0),
                    completion_tokens=int(usage_raw.get("completion_tokens") or 0),
                    total_tokens=int(usage_raw.get("total_tokens") or 0),
                )
        if not text:
            raise LLMError(f"{self.label}: command returned empty text")
        return Completion(text=text, usage=usage, model=self.label)


class ResponseCache:
    """Content-addressed completion cache shared across runs."""

    def __init__(self, directory: str | Path | None, enabled: bool = True) -> None:
        self.enabled = enabled and directory is not None
        self.directory = Path(directory) if directory else None
        if self.enabled:
            ensure_dir(self.directory)
        self._lock = threading.Lock()

    def _path(self, key: str) -> Path:
        assert self.directory is not None
        return self.directory / key[:2] / f"{key[2:]}.json"

    def get(self, key: str) -> Completion | None:
        if not self.enabled:
            return None
        path = self._path(key)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            # A cache hit consumes no calls or tokens in this run.
            return Completion(
                text=data["text"],
                usage=Usage(),
                model=data.get("model", ""),
                finish_reason=data.get("finish_reason"),
            )
        except (OSError, ValueError, KeyError):
            return None

    def set(self, key: str, completion: Completion) -> None:
        if not self.enabled:
            return
        try:
            with self._lock:
                write_json(
                    self._path(key),
                    {
                        "text": completion.text,
                        "model": completion.model,
                        "finish_reason": completion.finish_reason,
                        "usage": completion.usage.to_dict(),
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    },
                )
        except OSError:
            # A cache write failure must never fail a run.
            pass


class Budget:
    def __init__(self, max_calls: int = 0) -> None:
        self.max_calls = max(0, int(max_calls or 0))
        self.calls = 0
        self._lock = threading.Lock()

    @property
    def remaining(self) -> int | None:
        if self.max_calls <= 0:
            return None
        return max(0, self.max_calls - self.calls)

    def reserve(self) -> None:
        with self._lock:
            if self.max_calls > 0 and self.calls >= self.max_calls:
                raise BudgetExceeded(
                    f"call budget exhausted ({self.max_calls} logical model calls); "
                    "raise --max-calls or narrow the dataset"
                )
            self.calls += 1


class CountingClient:
    """Backend wrapper that adds cache, budget and usage accounting."""

    def __init__(
        self,
        backend: Backend,
        *,
        cache: ResponseCache | None = None,
        budget: Budget | None = None,
        usage: Usage | None = None,
    ) -> None:
        self.backend = backend
        self.cache = cache
        self.budget = budget or Budget(0)
        self.usage = usage or Usage()
        self._lock = threading.Lock()

    def _cache_key(self, messages: list[dict[str, str]], temperature: float, max_tokens: int | None, json_mode: bool) -> str:
        return sha256_text(
            stable_json(
                {
                    "backend": self.backend.name,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "json_mode": json_mode,
                }
            )
        )

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> Completion:
        key = self._cache_key(messages, temperature, max_tokens, json_mode)
        if self.cache:
            cached = self.cache.get(key)
            if cached is not None:
                with self._lock:
                    self.usage.cache_hits += 1
                return cached
        self.budget.reserve()
        completion = self.backend.complete(
            messages, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode
        )
        with self._lock:
            self.usage.add(completion.usage)
        if self.cache:
            self.cache.set(key, completion)
        return completion


def default_cache_dir() -> Path:
    override = os.environ.get("PROMPT_OPT_CACHE_DIR")
    if override:
        return Path(override)
    return Path.home() / ".cache" / "prompt-optimizer"


def estimate_messages_tokens(messages: list[dict[str, str]]) -> int:
    """Rough token estimate (about four characters per token)."""
    chars = sum(len(message.get("content", "")) for message in messages)
    return max(1, chars // 4)
