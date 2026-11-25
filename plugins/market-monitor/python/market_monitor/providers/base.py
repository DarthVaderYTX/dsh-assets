"""Provider abstraction shared by the synthetic simulator and Yahoo adapter."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..errors import InvalidArgumentError

#: Ranges accepted by ``GET /history/:symbol`` and the providers.
VALID_RANGES: tuple[str, ...] = ("LIVE", "1D", "5D", "1M", "3M", "6M", "1Y")

#: Bar intervals accepted by ``GET /history/:symbol``.
VALID_INTERVALS: tuple[str, ...] = ("5m", "30m", "1d")


def validate_range(value: Any) -> str:
    """Validate and normalise a history range string."""
    if not isinstance(value, str) or not value:
        raise InvalidArgumentError("range must be one of LIVE, 1D, 5D, 1M, 3M, 6M, 1Y")
    candidate = value.strip().upper()
    if candidate not in VALID_RANGES:
        raise InvalidArgumentError(
            f"invalid range: {value!r} (expected one of {', '.join(VALID_RANGES)})"
        )
    return candidate


def validate_interval(value: Any, *, allow_none: bool = True) -> str | None:
    """Validate and normalise a bar interval string."""
    if value is None or (isinstance(value, str) and not value.strip()):
        if allow_none:
            return None
        raise InvalidArgumentError("interval is required")
    if not isinstance(value, str):
        raise InvalidArgumentError("interval must be one of 5m, 30m, 1d")
    candidate = value.strip().lower()
    if candidate not in VALID_INTERVALS:
        raise InvalidArgumentError(
            f"invalid interval: {value!r} (expected one of {', '.join(VALID_INTERVALS)})"
        )
    return candidate


class Provider(ABC):
    """Interface implemented by every market data provider.

    Implementations return plain JSON-ready dictionaries and raise
    :class:`~market_monitor.errors.ProviderUnavailableError` when data cannot be
    fetched.  They never return ``None`` for a successful call.
    """

    name: str = "base"
    live: bool = False

    @abstractmethod
    def available(self) -> bool:
        """Return ``True`` when the provider can currently serve data."""

    def supports(self, symbol: str) -> bool:
        """Return ``True`` when the provider may know ``symbol``."""
        return True

    @abstractmethod
    def quote(self, symbol: str) -> dict[str, Any]:
        """Return the live quote dictionary for ``symbol``.

        Required keys: ``symbol``, ``name``, ``exchange``, ``type``, ``sector``,
        ``currency``, ``price``, ``prev_close``, ``change``, ``change_pct``,
        ``open``, ``high``, ``low``, ``volume``, ``market_state``, ``as_of``,
        ``source``.
        """

    @abstractmethod
    def history(
        self,
        symbol: str,
        range_: str = "1Y",
        interval: str | None = None,
    ) -> dict[str, Any]:
        """Return ``{symbol, range, interval, bars, source}`` for ``symbol``."""


__all__ = [
    "VALID_RANGES",
    "VALID_INTERVALS",
    "validate_range",
    "validate_interval",
    "Provider",
]
