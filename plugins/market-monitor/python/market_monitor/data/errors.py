"""Failures specific to the data collection layer."""

from __future__ import annotations

from ..errors import MarketMonitorError


class DataSourceError(MarketMonitorError):
    """An upstream source failed or returned unusable data (``503``)."""

    code = "source_unavailable"
    status = 503


class SourceBlockedError(MarketMonitorError):
    """A source is disabled, over budget, or circuit-open (``503``)."""

    code = "source_blocked"
    status = 503


class SourceRateLimitedError(MarketMonitorError):
    """A request was refused by the governor (``429``)."""

    code = "rate_limited"
    status = 429

    def __init__(self, message: str, *, retry_after_s: float = 0.0) -> None:
        super().__init__(message)
        self.retry_after_s = max(0.0, float(retry_after_s))


class JobRunningError(MarketMonitorError):
    """The requested ingestion job is already running (``409``)."""

    code = "job_running"
    status = 409


class DataNotFoundError(MarketMonitorError):
    """A warehouse entity, series or article is unknown (``404``)."""

    code = "not_found"
    status = 404


__all__ = [
    "DataNotFoundError",
    "DataSourceError",
    "JobRunningError",
    "SourceBlockedError",
    "SourceRateLimitedError",
]
