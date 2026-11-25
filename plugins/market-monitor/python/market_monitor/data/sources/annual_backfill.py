"""Gradual one-year daily-history backfill for watched companies.

The regular ``backfill:recent`` job only guarantees a rolling 30-day window.
This job fills the last **365 calendar days** of real daily bars for companies
the user follows, a few symbols per run and in the background.

Production data rules:

* Only persisted real market data is written. Rows come from the existing
  governed collectors (Sina/Tencent/CoinGecko/Frankfurter via
  :mod:`market_channels`, or the Yahoo chart endpoint); no synthetic provider
  or generated bar is ever consulted.
* If a source only has a shorter history (for example a recent IPO), the
  available bars are stored and the gap is **left empty**. The collector never
  interpolates, extends or fabricates missing points.
* A failed/empty fetch is recorded and retried later; it never blocks other
  watched symbols.

The job is intentionally gradual: a small batch per run, priority for watched
companies, a request budget and a persisted attempt map so a recently listed
symbol that cannot reach 240 bars is not hammered every cycle.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import COINGECKO, FRANKFURTER, SINA_FINANCE, TENCENT_FINANCE, YAHOO
from . import market_channels, market_yahoo
from .backfill import (
    _RequestBudget,
    _filter_rows,
    _new_channel,
    _safe_int,
    _select_needs,
    _snapshot_requests,
    _store_bars,
    _tracked_universe,
)

LOGGER = logging.getLogger("market_monitor.data.sources.annual_backfill")

DEFAULT_ANNUAL_DAYS = 365
MIN_ANNUAL_DAYS = 180
MAX_ANNUAL_DAYS = 400
DEFAULT_ANNUAL_TARGET_BARS = 240
MIN_ANNUAL_TARGET_BARS = 60
MAX_ANNUAL_TARGET_BARS = 260
DEFAULT_ANNUAL_BATCH = 4
MIN_ANNUAL_BATCH = 1
MAX_ANNUAL_BATCH = 20
DEFAULT_ANNUAL_DAILY_LIMIT = 120
MIN_ANNUAL_DAILY_LIMIT = 10
MAX_ANNUAL_DAILY_LIMIT = 500
#: Retry a still-incomplete series after this many days (e.g. recent IPO).
DEFAULT_ANNUAL_RETRY_DAYS = 7


def _setting_int(
    ctx: CollectContext,
    key: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    raw = ctx.settings.get(key, default) if isinstance(ctx.settings, dict) else default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = int(default)
    return max(minimum, min(value, maximum))


def _day_shift(day: str, days: int) -> str:
    try:
        return (date.fromisoformat(str(day)) + timedelta(days=int(days))).isoformat()
    except (TypeError, ValueError):
        return str(day)


def _is_watched_company(series: dict[str, Any]) -> bool:
    """True for priority-0 watched securities (not indices/commodities/crypto)."""
    if str(series.get("kind") or "") != "instrument":
        return False
    if int(series.get("priority", 1)) != 0:
        return False
    parts = str(series.get("series_id") or "").upper().split(":")
    if len(parts) >= 2 and parts[1] in {"XCRY", "XFXS"}:
        return False
    return True


class _AnnualBackfill:
    def __init__(self, ctx: CollectContext) -> None:
        self.ctx = ctx
        self.settings = dict(ctx.settings or {})
        self.state = dict(ctx.job_state or {})
        self.today = ctx.today()
        self.days = _setting_int(
            ctx, "annual_backfill_days", DEFAULT_ANNUAL_DAYS,
            minimum=MIN_ANNUAL_DAYS, maximum=MAX_ANNUAL_DAYS,
        )
        self.target = _setting_int(
            ctx, "annual_backfill_target_bars", DEFAULT_ANNUAL_TARGET_BARS,
            minimum=MIN_ANNUAL_TARGET_BARS, maximum=MAX_ANNUAL_TARGET_BARS,
        )
        self.batch = _setting_int(
            ctx, "annual_backfill_batch", DEFAULT_ANNUAL_BATCH,
            minimum=MIN_ANNUAL_BATCH, maximum=MAX_ANNUAL_BATCH,
        )
        self.daily_limit = _setting_int(
            ctx, "annual_backfill_daily_limit", DEFAULT_ANNUAL_DAILY_LIMIT,
            minimum=MIN_ANNUAL_DAILY_LIMIT, maximum=MAX_ANNUAL_DAILY_LIMIT,
        )
        self.retry_days = max(1, _safe_int(
            self.settings.get("annual_backfill_retry_days"), DEFAULT_ANNUAL_RETRY_DAYS,
        ))
        self.start = _day_shift(self.today, -self.days)
        self.window = {"start": self.start, "end": self.today, "days": self.days}
        self.dry_run = bool(self.settings.get("dry_run"))
        self.channels: dict[str, dict[str, int]] = {}
        self.errors: list[dict[str, Any]] = []
        self.budget: _RequestBudget | None = None
        self.stored = 0
        self.filled = 0
        self.processed = 0
        self.stopped = ""

    # ---------------------------------------------------------------- run

    def run(self) -> dict[str, Any]:
        universe = [
            series for series in _tracked_universe(self.ctx)
            if _is_watched_company(series)
        ]
        if not universe:
            return self._empty("no watched companies", universe=[])
        coverage = self.ctx.warehouse.bar_coverage_since(self.start, "1d")
        attempted = self._attempted_map()
        needs: list[dict[str, Any]] = []
        for series in universe:
            series_id = str(series["series_id"])
            count = max(0, _safe_int((coverage.get(series_id) or {}).get("count"), 0))
            if count >= self.target:
                continue
            if self._attempt_recent(attempted.get(series_id)):
                continue
            needs.append({
                "series": series,
                "annual_bars": count,
            })
        needs.sort(key=lambda item: (
            item["series"]["series_id"],
        ))
        cursor = _safe_int(self.state.get("cursor"), 0)
        selected, next_cursor = _select_needs(needs, cursor, self.batch)
        if self.dry_run:
            return self._dry_run(universe, needs, selected, coverage, next_cursor)
        requests_before = (
            max(0, _safe_int(self.state.get("requests"), 0))
            if str(self.state.get("day") or "") == self.today
            else 0
        )
        self.budget = _RequestBudget(
            limit=self.daily_limit,
            used=requests_before,
            snapshot=lambda: _snapshot_requests(self.ctx.http),
        )
        for item in selected:
            if self.budget.exhausted():
                self.stopped = "daily_limit"
                break
            self._process(item)
            attempted[str(item["series"]["series_id"])] = self.today
            self.processed += 1
        status = "partial" if (self.stopped or self.errors) else "ok"
        total = len(needs)
        spent = max(0, self.budget.used - requests_before)
        details = {
            "window": dict(self.window),
            "target_bars": self.target,
            "universe": len(universe),
            "needs": len(needs),
            "selected": len(selected),
            "processed": self.processed,
            "filled_series": self.filled,
            "bars": self.stored,
            "requests": spent,
            "channels": {key: dict(value) for key, value in self.channels.items()},
            "errors": self.errors,
            "coverage": {
                "adequate": sum(
                    1 for series in universe
                    if _safe_int((coverage.get(series["series_id"]) or {}).get("count"), 0)
                    >= self.target
                ),
                "needs": len(needs),
            },
            "selected_series": [item["series"]["series_id"] for item in selected],
            "attempted": {key: value for key, value in sorted(attempted.items())},
        }
        if self.stopped:
            details["stopped"] = self.stopped
        if not selected:
            details["reason"] = "coverage adequate or recently attempted"
        LOGGER.info(
            "annual backfill: window %s..%s, target %d bars, %d/%d watched need fill, "
            "%d selected, %d bar(s), %d request(s), status=%s",
            self.start, self.today, self.target, len(needs), len(universe),
            len(selected), self.stored, spent, status,
        )
        return {
            "stored": int(self.stored),
            "updated": 0,
            "duplicates": 0,
            "skipped": max(0, len(selected) - self.filled),
            "status": status,
            "details": details,
            "job_state": {
                "day": self.today,
                "requests": int(self.budget.used),
                "cursor": int(next_cursor) if total else 0,
                "attempted": attempted,
                "last_run_at": self.ctx.now_iso(),
            },
        }

    # ------------------------------------------------------------- helpers

    def _attempted_map(self) -> dict[str, str]:
        raw = self.state.get("attempted")
        if not isinstance(raw, dict):
            return {}
        return {
            str(key): str(value)
            for key, value in raw.items()
            if str(key) and str(value)
        }

    def _attempt_recent(self, attempted_day: str | None) -> bool:
        if not attempted_day:
            return False
        retry_before = _day_shift(self.today, -self.retry_days)
        return str(attempted_day) > retry_before

    def _empty(self, reason: str, *, universe: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": {
                "reason": reason,
                "window": dict(self.window),
                "target_bars": self.target,
                "universe": len(universe),
                "needs": 0,
                "selected": 0,
                "coverage": {"adequate": 0, "needs": 0},
            },
        }

    def _dry_run(
        self,
        universe: list[dict[str, Any]],
        needs: list[dict[str, Any]],
        selected: list[dict[str, Any]],
        coverage: dict[str, dict[str, Any]],
        next_cursor: int,
    ) -> dict[str, Any]:
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": {
                "dry_run": True,
                "window": dict(self.window),
                "target_bars": self.target,
                "universe": len(universe),
                "needs": len(needs),
                "selected": len(selected),
                "selected_series": [item["series"]["series_id"] for item in selected],
                "coverage": {
                    "adequate": sum(
                        1 for series in universe
                        if _safe_int((coverage.get(series["series_id"]) or {}).get("count"), 0)
                        >= self.target
                    ),
                    "needs": len(needs),
                },
                "next_cursor": next_cursor,
                "reason": "dry run",
            },
        }

    def _classify(self, series: dict[str, Any]) -> tuple[str, Any]:
        entry = market_channels.eod_entry(series)
        if entry is not None:
            return str(entry.get("source_id") or "").strip() or "market-channels", entry
        return YAHOO, str(series.get("provider_symbol") or "").strip()

    def _process(self, item: dict[str, Any]) -> None:
        series = item["series"]
        series_id = str(series["series_id"])
        channel, payload = self._classify(series)
        summary = self.channels.setdefault(channel, _new_channel())
        summary["series"] += 1
        if not payload:
            summary["skipped"] += 1
            return
        if self.budget is None:
            return
        before = self.budget.begin()
        try:
            rows = self._fetch(channel, series, payload)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            spent = self.budget.record(before)
            summary["requests"] += spent
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "rate_limited",
                "error": str(error)[:200],
            })
            self.stopped = "rate_limited"
            return
        except (DataSourceError, ValueError) as error:
            spent = self.budget.record(before)
            summary["requests"] += spent
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "source_unavailable",
                "error": str(error)[:200],
            })
            return
        spent = self.budget.record(before)
        summary["requests"] += spent
        in_window = _filter_rows(rows, self.start, self.today)
        if not in_window:
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "no_bars_in_window",
            })
            return
        written = _store_bars(self.ctx, in_window)
        summary["bars"] += written
        self.stored += written
        if written > 0:
            self.filled += 1

    def _fetch(
        self,
        channel: str,
        series: dict[str, Any],
        payload: Any,
    ) -> list[dict[str, Any]]:
        if channel == YAHOO:
            rows = market_yahoo.fetch_chart_bars(
                self.ctx, series, "1y", "1d",
            )
            for row in rows:
                row["source_id"] = YAHOO
            return rows
        entry = payload
        bars = market_channels._fetch_eod_series(
            self.ctx, entry, self.today, self.ctx.now_iso(), {},
        )
        source_id = str(entry.get("source_id") or "").strip() or YAHOO
        for bar in bars:
            if isinstance(bar, dict) and not bar.get("source_id"):
                bar["source_id"] = source_id
        return bars


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Fill at most one small batch of watched-company annual daily history."""
    return _AnnualBackfill(ctx).run()


__all__ = [
    "DEFAULT_ANNUAL_BATCH",
    "DEFAULT_ANNUAL_DAYS",
    "DEFAULT_ANNUAL_DAILY_LIMIT",
    "DEFAULT_ANNUAL_RETRY_DAYS",
    "DEFAULT_ANNUAL_TARGET_BARS",
    "MAX_ANNUAL_BATCH",
    "MAX_ANNUAL_DAYS",
    "MAX_ANNUAL_DAILY_LIMIT",
    "MAX_ANNUAL_TARGET_BARS",
    "MIN_ANNUAL_BATCH",
    "MIN_ANNUAL_DAYS",
    "MIN_ANNUAL_DAILY_LIMIT",
    "MIN_ANNUAL_TARGET_BARS",
    "collect",
]
