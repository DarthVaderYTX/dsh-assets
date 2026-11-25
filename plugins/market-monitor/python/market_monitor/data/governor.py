"""Polite rate governor for every outbound data request.

Policy (see ``docs/DATA.md``): per-host minimum interval with jitter, hourly and
daily budgets, persisted counters, exponential backoff for retryable failures,
and a circuit breaker after repeated blocks.  The governor never silently waits
forever: an exhausted budget or open circuit raises, so callers can report a
clear status to the panel instead of hanging.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from typing import Any, Callable, Iterable

from .errors import SourceBlockedError, SourceRateLimitedError
from .models import SourceSpec, parse_iso, to_iso, utc_now

LOGGER = logging.getLogger("market_monitor.data.governor")

#: Never block a caller on a governor wait longer than this; report instead.
MAX_WAIT_SECONDS = 90.0
#: Circuit opens after this many consecutive blocked/failed attempts.
CIRCUIT_THRESHOLD = 3
#: Circuit cool-down.
CIRCUIT_SECONDS = 1800.0
#: Backoff schedule for retryable failures.
BACKOFF_SECONDS = (5.0, 15.0, 60.0, 300.0)
#: Hour window length for the hourly budget.
HOUR_SECONDS = 3600.0


class RateGovernor:
    """Thread-safe, SQLite-persisted request governor."""

    def __init__(
        self,
        warehouse: Any,
        *,
        now_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        random_fn: Callable[[], float] | None = None,
    ) -> None:
        self.warehouse = warehouse
        self._now = now_fn or time.time
        self._sleep = sleep_fn or time.sleep
        self._random = random_fn or random.random
        self._lock = threading.RLock()

    # ------------------------------------------------------------- registry

    def register(self, specs: Iterable[SourceSpec]) -> None:
        """Register all source specifications (idempotent)."""
        for spec in specs:
            self.warehouse.ensure_source(spec)

    def state(self, source_id: str) -> dict[str, Any]:
        """Read the current state, refreshing hour/day windows on the fly."""
        state = self.warehouse.get_source(source_id)
        if state is None:
            raise SourceBlockedError(f"Unknown data source: {source_id}")
        now = utc_now(self._now)
        updates: dict[str, Any] = {}
        day = to_iso(now)[:10]
        if state.get("budget_date") != day:
            updates["used_day"] = 0
            updates["budget_date"] = day
        hour_window = state.get("hour_window") or ""
        if not hour_window:
            updates["used_hour"] = 0
            updates["hour_window"] = to_iso(now)[:13]
        else:
            previous = parse_iso(f"{hour_window}:00:00Z")
            if previous is None or (now - previous.timestamp()) >= HOUR_SECONDS:
                updates["used_hour"] = 0
                updates["hour_window"] = to_iso(now)[:13]
        if updates:
            self.warehouse.update_source(source_id, **updates)
            state = {**state, **updates}
        return state

    # --------------------------------------------------------------- checks

    def remaining(self, source_id: str) -> dict[str, Any]:
        """Remaining budgets and wait time without consuming anything."""
        state = self.state(source_id)
        now = utc_now(self._now)
        next_allowed = parse_iso(state.get("next_allowed_at") or "")
        wait = max(0.0, next_allowed.timestamp() - now) if next_allowed else 0.0
        circuit = parse_iso(state.get("circuit_open_until") or "")
        circuit_wait = max(0.0, circuit.timestamp() - now) if circuit else 0.0
        return {
            "source_id": source_id,
            "enabled": bool(state.get("enabled", 1)),
            "used_hour": int(state.get("used_hour") or 0),
            "max_per_hour": int(state.get("max_per_hour") or 0),
            "remaining_hour": max(0, int(state.get("max_per_hour") or 0) - int(state.get("used_hour") or 0)),
            "used_day": int(state.get("used_day") or 0),
            "max_per_day": int(state.get("max_per_day") or 0),
            "remaining_day": max(0, int(state.get("max_per_day") or 0) - int(state.get("used_day") or 0)),
            "next_allowed_in_s": round(wait, 1),
            "circuit_open_in_s": round(circuit_wait, 1),
            "last_success_at": state.get("last_success_at") or "",
            "last_error": state.get("last_error") or "",
        }

    def ensure_allowed(self, source_id: str) -> None:
        """Check whether a request would be allowed right now (no wait)."""
        state = self.state(source_id)
        if not bool(state.get("enabled", 1)):
            raise SourceBlockedError(f"Source {source_id} is disabled.")
        circuit = parse_iso(state.get("circuit_open_until") or "")
        now = utc_now(self._now)
        if circuit and circuit.timestamp() > now:
            retry = circuit.timestamp() - now
            raise SourceBlockedError(
                f"Source {source_id} is cooling down after repeated blocks; retry in {retry:.0f}s."
            )
        if int(state.get("used_day") or 0) >= int(state.get("max_per_day") or 0) > 0:
            raise SourceRateLimitedError(
                f"Daily budget exhausted for source {source_id}.",
                retry_after_s=0.0,
            )
        if int(state.get("used_hour") or 0) >= int(state.get("max_per_hour") or 0) > 0:
            raise SourceRateLimitedError(
                f"Hourly budget exhausted for source {source_id}.",
                retry_after_s=HOUR_SECONDS,
            )

    # ------------------------------------------------------------- reservation

    def before(self, source_id: str, *, dry_run: bool = False) -> float:
        """Reserve one request slot, sleeping for the polite interval.

        Returns the number of seconds slept.  Raises
        :class:`SourceBlockedError` or :class:`SourceRateLimitedError` when the
        source must not be used right now.
        """
        with self._lock:
            self.ensure_allowed(source_id)
            state = self.state(source_id)
            now = utc_now(self._now)
            next_allowed = parse_iso(state.get("next_allowed_at") or "")
            wait = max(0.0, next_allowed.timestamp() - now) if next_allowed else 0.0
            if wait > MAX_WAIT_SECONDS:
                raise SourceRateLimitedError(
                    f"Source {source_id} is limited; next request allowed in {wait:.0f}s.",
                    retry_after_s=wait,
                )
            if wait > 0 and not dry_run:
                self._sleep(wait)
            if dry_run:
                return wait
            slept = wait
            min_interval = float(state.get("min_interval_s") or 0)
            reserve_until = to_iso(
                utc_now(self._now) + min_interval * (1.15 + 0.35 * self._random())
            )
            self.warehouse.update_source(
                source_id,
                used_hour=int(state.get("used_hour") or 0) + 1,
                used_day=int(state.get("used_day") or 0) + 1,
                hour_window=state.get("hour_window"),
                budget_date=state.get("budget_date"),
                next_allowed_at=reserve_until,
            )
            return slept

    # ----------------------------------------------------------- outcomes

    def after(
        self,
        source_id: str,
        status_code: int | None,
        *,
        retry_after_s: float | None = None,
    ) -> float:
        """Record one request outcome; returns a suggested retry wait."""
        with self._lock:
            state = self.state(source_id)
            now = utc_now(self._now)
            min_interval = float(state.get("min_interval_s") or 0)
            jitter = min_interval * (0.15 + 0.35 * self._random())
            base_next = to_iso(now + min_interval + jitter)
            attempts = int(state.get("consecutive_blocks") or 0)

            if status_code is not None and 200 <= status_code < 400:
                self.warehouse.update_source(
                    source_id,
                    consecutive_blocks=0,
                    circuit_open_until="",
                    next_allowed_at=base_next,
                    last_success_at=to_iso(now),
                    last_error="",
                )
                return 0.0

            if status_code in (429, 403):
                attempts += 1
                backoff = (
                    max(float(retry_after_s), BACKOFF_SECONDS[min(attempts - 1, len(BACKOFF_SECONDS) - 1)])
                    if retry_after_s
                    else BACKOFF_SECONDS[min(attempts - 1, len(BACKOFF_SECONDS) - 1)]
                )
                backoff *= 0.9 + 0.2 * self._random()
                circuit_until = (
                    to_iso(now + CIRCUIT_SECONDS) if attempts >= CIRCUIT_THRESHOLD else ""
                )
                self.warehouse.update_source(
                    source_id,
                    consecutive_blocks=attempts,
                    circuit_open_until=circuit_until,
                    next_allowed_at=to_iso(now + backoff),
                    last_error=f"HTTP {status_code} after {attempts} consecutive block(s)",
                )
                return backoff

            if status_code is not None and status_code >= 500:
                attempts += 1
                backoff = BACKOFF_SECONDS[min(attempts - 1, len(BACKOFF_SECONDS) - 1)]
                backoff *= 0.9 + 0.2 * self._random()
                self.warehouse.update_source(
                    source_id,
                    consecutive_blocks=attempts,
                    next_allowed_at=to_iso(now + backoff),
                    last_error=f"HTTP {status_code} upstream error",
                )
                return backoff

            # Non-retryable client error or network failure: back off modestly.
            self.warehouse.update_source(
                source_id,
                next_allowed_at=base_next,
                last_error=f"HTTP {status_code}" if status_code else "network error",
            )
            return 0.0

    def note_error(self, source_id: str, message: str) -> None:
        """Persist a non-HTTP error message for diagnostics."""
        self.warehouse.update_source(source_id, last_error=str(message)[:500])


__all__ = [
    "BACKOFF_SECONDS",
    "CIRCUIT_SECONDS",
    "CIRCUIT_THRESHOLD",
    "MAX_WAIT_SECONDS",
    "RateGovernor",
]
