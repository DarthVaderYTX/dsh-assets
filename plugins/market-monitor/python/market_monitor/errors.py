"""Error types shared by the market-monitor service, SDK and HTTP API.

Every public failure is a :class:`MarketMonitorError` carrying a snake_case
``code`` and an HTTP ``status`` so the HTTP layer can serialise it without
guessing.  The HTTP error body is::

    {"error": {"code": "<code>", "message": "<human text>"}}

Unexpected failures are plain exceptions and become ``500 internal_error``.
"""

from __future__ import annotations

from typing import Any


class MarketMonitorError(Exception):
    """Base class for all handled market-monitor failures.

    Parameters
    ----------
    message:
        Human readable explanation sent to API clients.
    code:
        Optional override of the instance ``code`` (defaults to the class code).
    status:
        Optional override of the HTTP status (defaults to the class status).
    """

    code: str = "internal_error"
    status: int = 500

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = str(message)
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status

    def to_dict(self) -> dict[str, Any]:
        """Return the JSON error envelope for this failure."""
        return {"error": {"code": self.code, "message": self.message}}

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.message


class InvalidArgumentError(MarketMonitorError):
    """A request argument is malformed (``400 invalid_argument``)."""

    code = "invalid_argument"
    status = 400


class InvalidSymbolError(MarketMonitorError):
    """A symbol is missing or does not match the canonical pattern (``400``)."""

    code = "invalid_symbol"
    status = 400


class SymbolNotFoundError(MarketMonitorError):
    """Neither the catalog, watchlist nor bar cache knows the symbol (``404``)."""

    code = "symbol_not_found"
    status = 404


class NotFoundError(MarketMonitorError):
    """A resource such as an alert rule or API path does not exist (``404``)."""

    code = "not_found"
    status = 404


class UnauthorizedError(MarketMonitorError):
    """Missing or wrong API token (``401``)."""

    code = "unauthorized"
    status = 401


class PayloadTooLargeError(MarketMonitorError):
    """Request body exceeds the 4 MiB limit (``413``)."""

    code = "payload_too_large"
    status = 413


class ProviderUnavailableError(MarketMonitorError):
    """The upstream data provider failed or is unreachable (``503``).

    ``symbol_level`` marks failures that only affect one symbol (for example a
    chart endpoint answering "no data for this symbol"); those must not make the
    service drop a live provider in favour of the simulator.
    """

    code = "provider_unavailable"
    status = 503

    def __init__(self, message: str, *, symbol_level: bool = False) -> None:
        super().__init__(message)
        self.symbol_level = symbol_level


class StorageUnavailableError(MarketMonitorError):
    """The engine could not persist or read its own SQLite rows (``500``).

    The plugin only displays data that has been written to disk first, so a
    failed write is surfaced instead of returning an ephemeral provider payload.
    """

    code = "storage_unavailable"
    status = 500


def invalid_argument(message: str) -> InvalidArgumentError:
    """Factory helper for :class:`InvalidArgumentError`."""
    return InvalidArgumentError(message)


def invalid_symbol(message: str) -> InvalidSymbolError:
    """Factory helper for :class:`InvalidSymbolError`."""
    return InvalidSymbolError(message)


def symbol_not_found(message: str) -> SymbolNotFoundError:
    """Factory helper for :class:`SymbolNotFoundError`."""
    return SymbolNotFoundError(message)


def not_found(message: str) -> NotFoundError:
    """Factory helper for :class:`NotFoundError`."""
    return NotFoundError(message)


def provider_unavailable(message: str, *, symbol_level: bool = False) -> ProviderUnavailableError:
    """Factory helper for :class:`ProviderUnavailableError`."""
    return ProviderUnavailableError(message, symbol_level=symbol_level)


__all__ = [
    "MarketMonitorError",
    "InvalidArgumentError",
    "InvalidSymbolError",
    "SymbolNotFoundError",
    "NotFoundError",
    "UnauthorizedError",
    "PayloadTooLargeError",
    "ProviderUnavailableError",
    "invalid_argument",
    "invalid_symbol",
    "symbol_not_found",
    "not_found",
    "provider_unavailable",
]
