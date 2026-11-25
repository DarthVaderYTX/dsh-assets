"""Provider registry and ``auto`` selection.

The production path never fabricates market data. ``auto`` and ``yahoo`` use
Yahoo Finance; when it is unreachable the provider reports itself unavailable
and the service falls back to persisted, real warehouse data (or returns an
explicit provider/storage error). The deterministic simulator is available only
through the explicit test/development ``synthetic`` mode.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

from ..errors import InvalidArgumentError
from .base import Provider
from .synthetic import SyntheticProvider
from .yahoo import YahooProvider

#: Accepted provider mode strings.
PROVIDER_NAMES: tuple[str, ...] = ("auto", "synthetic", "yahoo")

#: Explicit provider name -> constructor.
PROVIDER_FACTORIES: dict[str, Callable[..., Provider]] = {
    "synthetic": SyntheticProvider,
    "yahoo": YahooProvider,
}


def normalize_provider_name(name: Any) -> str:
    """Validate and normalise a provider mode string."""
    if not isinstance(name, str) or not name.strip():
        raise InvalidArgumentError(
            "provider must be one of auto, synthetic, yahoo"
        )
    candidate = name.strip().lower()
    if candidate not in PROVIDER_NAMES:
        raise InvalidArgumentError(
            f"invalid provider: {name!r} (expected one of auto, synthetic, yahoo)"
        )
    return candidate


@dataclass(frozen=True)
class ProviderSelection:
    """The effective provider plus the reason any fallback happened."""

    requested: str
    provider: Provider
    degraded: bool
    last_error: str | None


def resolve_provider(
    name: str = "auto",
    *,
    now_fn: Callable[[], float] = time.time,
    yahoo_kwargs: dict[str, Any] | None = None,
) -> ProviderSelection:
    """Resolve a provider mode to a concrete provider instance.

    * ``synthetic`` -> the simulator, never degraded (explicit development mode).
    * ``yahoo`` -> Yahoo even when unreachable; the service then serves real
      persisted data or reports the outage instead of fabricating bars.
    * ``auto`` -> Yahoo when reachable, otherwise the unreachable Yahoo adapter
      with ``degraded=True`` and the probe error recorded.
    """
    mode = normalize_provider_name(name)
    yahoo_options = dict(yahoo_kwargs or {})
    if mode == "synthetic":
        return ProviderSelection(mode, SyntheticProvider(now_fn=now_fn), False, None)
    yahoo = YahooProvider(**yahoo_options)
    if yahoo.available():
        return ProviderSelection(mode, yahoo, False, None)
    reason = yahoo.last_probe_error or "Yahoo Finance unavailable"
    return ProviderSelection(mode, yahoo, True, reason)


def get_provider(
    name: str = "auto",
    **kwargs: Any,
) -> Provider:
    """Return a provider instance for ``name``, handling ``auto`` fallback.

    Extra keyword arguments are forwarded to the provider constructors
    (``now_fn`` for the simulator, ``base_url`` etc. for Yahoo).
    """
    now_fn = kwargs.pop("now_fn", time.time)
    yahoo_kwargs = kwargs.pop("yahoo_kwargs", None)
    if kwargs:
        unexpected = ", ".join(sorted(kwargs))
        raise InvalidArgumentError(f"unexpected provider options: {unexpected}")
    return resolve_provider(
        name, now_fn=now_fn, yahoo_kwargs=yahoo_kwargs
    ).provider


__all__ = [
    "PROVIDER_NAMES",
    "PROVIDER_FACTORIES",
    "ProviderSelection",
    "normalize_provider_name",
    "resolve_provider",
    "get_provider",
]
