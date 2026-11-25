"""Automatic rolling recent-history backfill job (``backfill:recent``).

The requirement is to fill the most recent exchange history in the background
("在后台自动补齐最近前后 30 天的数据").  Future dates cannot be collected, so the
job keeps a **rolling window** ``today - backfill_days`` .. ``today`` (UTC) of
daily bars complete for every tracked series.  When a series' latest bar is much
older than the window the full ``backfill_range`` buffer (default ``3mo``) is
fetched, so the window is complete up to today instead of starting from an
outdated bar.

Each run:

1. scans the warehouse once (``bar_coverage_since`` + ``latest_bar_map``) and
   selects the series whose recent window is sparse (fewer than
   ``backfill_min_bars`` stored bars) or stale (latest bar older than
   ``backfill_stale_days``);
2. rotates the needs list with the persisted ``job_state["cursor"]`` so a large
   universe (~20 000 series) is covered fairly over runs;
3. fills at most ``backfill_batch`` series from the cheapest governed channel:
   mainland commodity roots from the Sina futures JSONP endpoint
   (``sina-futures``), US / HK / A-share equities, crypto and USD FX through the
   multi-channel EOD collectors (``sina-finance``, ``tencent-finance``,
   ``coingecko``, ``frankfurter``), and everything else (indices, global
   commodities) from the Yahoo chart endpoint (``yahoo-finance``);
4. charges every request to a per-UTC-day budget persisted in the job state
   (``backfill_daily_limit``) and leaves the Yahoo hourly budget floor
   (``backfill_yahoo_reserve``) for the live quote path.

A rate-limit or block answer stops the run at the failed series
(``status="partial"``, ``details["stopped"]="rate_limited"``) and leaves the
cursor there, so the next run resumes at the same series.  A single series
error (transport failure, empty result, unparseable payload) is recorded and
skipped; it never aborts the whole job.  Every request goes through
``ctx.http``, so the shared rate governor, budgets and retry policy apply
uniformly.

Rows are written to :class:`~..warehouse.DataWarehouse` (``market_bar``,
``interval="1d"``) with the channel's ``source_id``, filtered to the rolling
window (older and future rows are ignored).  A series whose window is already
adequate is never requested, so repeated runs over a covered universe make no
HTTP request at all.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import SINA_FUTURES, YAHOO
from . import china_commodity, market_channels, market_yahoo

LOGGER = logging.getLogger("market_monitor.data.sources.backfill")

# ---------------------------------------------------------------------------
# settings defaults and safe clamps (documented in docs/DATA.md)
# ---------------------------------------------------------------------------

DEFAULT_BACKFILL_DAYS = 30
MIN_BACKFILL_DAYS = 5
MAX_BACKFILL_DAYS = 120

DEFAULT_BACKFILL_BATCH = 30
MIN_BACKFILL_BATCH = 1
MAX_BACKFILL_BATCH = 60

DEFAULT_BACKFILL_DAILY_LIMIT = 300
MIN_BACKFILL_DAILY_LIMIT = 20
MAX_BACKFILL_DAILY_LIMIT = 1000

DEFAULT_BACKFILL_MIN_BARS = 12
MIN_BACKFILL_MIN_BARS = 1
MAX_BACKFILL_MIN_BARS = 30

DEFAULT_BACKFILL_STALE_DAYS = 3
MIN_BACKFILL_STALE_DAYS = 1
MAX_BACKFILL_STALE_DAYS = 14

#: Yahoo fetch range used when a series needs a buffer to reach today.
DEFAULT_BACKFILL_RANGE = "3mo"
#: Keep this many hourly Yahoo requests free for the live quote path.
DEFAULT_BACKFILL_YAHOO_RESERVE = 40
MAX_BACKFILL_YAHOO_RESERVE = 1000

#: Mainland commodity venues whose daily history is served by Sina futures.
#: A tracked commodity series is ``COM:{venue}:{root}`` (three components).
CHINA_COMMODITY_VENUES = ("XSHF", "XINE", "XDCE", "XCZC", "XGFE")


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def _setting_int(
    ctx: CollectContext,
    key: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    """Read a bounded integer setting, clamping (not merely falling back)."""
    raw = ctx.settings.get(key, default) if isinstance(ctx.settings, dict) else default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = int(default)
    return max(minimum, min(value, maximum))


def _setting_text(ctx: CollectContext, key: str, default: str) -> str:
    """Read a non-empty string setting, falling back to ``default``."""
    raw = ctx.settings.get(key) if isinstance(ctx.settings, dict) else None
    text = str(raw).strip() if raw is not None else ""
    return text or default


def _safe_int(raw: Any, default: int = 0) -> int:
    """Best-effort integer conversion (persisted job state is untrusted)."""
    try:
        return int(raw)
    except (TypeError, ValueError):
        return int(default)


def _iso_day_shift(day: str, days: int) -> str:
    """``YYYY-MM-DD`` shifted by ``days``; ``""`` when ``day`` is unusable."""
    try:
        return (date.fromisoformat(str(day)) + timedelta(days=int(days))).isoformat()
    except (TypeError, ValueError):
        return ""


def _window_start(today: str, days: int) -> str:
    """First day of the rolling window (``today - days``)."""
    return _iso_day_shift(today, -days) or str(today)


def _normalise_cursor(raw: Any, total: int) -> int:
    """Normalise a persisted cursor into ``[0, total)``."""
    if total <= 0:
        return 0
    return max(0, _safe_int(raw, 0)) % total


def _select_needs(
    needs: list[dict[str, Any]],
    cursor: int,
    batch: int,
) -> tuple[list[dict[str, Any]], int]:
    """Prefer priority-0 (watched/market benchmark) series, then rotate the rest.

    Priority series are always taken from the front so a persisted cursor can
    never skip the watchlist/indices/commodities in favour of alphabetical
    instruments. The cursor only rotates the non-priority tail; unprocessed
    priority needs are retried on the next run.
    """
    priority = [item for item in needs if int(item["series"].get("priority", 1)) == 0]
    rest = [item for item in needs if int(item["series"].get("priority", 1)) != 0]
    priority.sort(key=lambda item: (
        0 if (_is_china_commodity(item["series"]) or market_channels.eod_entry(item["series"]))
        else 1,
        item["series"]["series_id"],
    ))
    take = max(1, int(batch))
    if priority:
        selected = priority[:take]
        remaining = take - len(selected)
        if remaining > 0 and rest:
            rotated, next_cursor = _rotate(rest, cursor, remaining)
            selected.extend(rotated)
            return selected, next_cursor
        return selected, _normalise_cursor(cursor, len(rest))
    return _rotate(rest, cursor, take)


def _rotate(
    needs: list[dict[str, Any]],
    cursor: int,
    batch: int,
) -> tuple[list[dict[str, Any]], int]:
    """Take up to ``batch`` needs from ``cursor``, wrapping modulo the length."""
    total = len(needs)
    if total <= 0:
        return [], 0
    start = cursor % total
    take = min(max(1, int(batch)), total)
    selected = [needs[(start + offset) % total] for offset in range(take)]
    return selected, (start + take) % total


def _provider_symbol(series: dict[str, Any]) -> str:
    """Trimmed provider symbol of a tracked series (``""`` when absent)."""
    return str(series.get("provider_symbol") or "").strip()


def _tracked_universe(ctx: CollectContext) -> list[dict[str, Any]]:
    """Normalise ``ctx.settings["tracked_series"]`` into a deterministic universe.

    The job wiring resolves the symbols and de-duplicates, but the setting is
    untrusted input: entries without a ``series_id`` are dropped, missing fields
    get safe defaults, duplicates are removed and the list is sorted so runs are
    deterministic.  An unknown/missing ``kind`` is treated as ``instrument``;
    that never mis-routes a series because the channel planner keys off the
    canonical ``series_id`` and indices/commodities simply stay on Yahoo.
    """
    raw = ctx.settings.get("tracked_series") if isinstance(ctx.settings, dict) else None
    if not isinstance(raw, (list, tuple)) or not raw:
        return []
    seen: set[str] = set()
    dropped = 0
    universe: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            dropped += 1
            continue
        series_id = str(entry.get("series_id") or "").strip()
        if not series_id or series_id in seen:
            dropped += 1
            continue
        seen.add(series_id)
        priority_raw = entry.get("priority")
        universe.append({
            "series_id": series_id,
            "kind": str(entry.get("kind") or "").strip().lower() or "instrument",
            "provider_symbol": str(entry.get("provider_symbol") or "").strip(),
            "currency": str(entry.get("currency") or "").strip().upper(),
            "priority": int(priority_raw) if priority_raw is not None else 1,
        })
    if dropped:
        LOGGER.warning("backfill: dropped %d unusable tracked_series entry(ies)", dropped)
    universe.sort(key=lambda item: (item["priority"], item["series_id"]))
    return universe


def _is_china_commodity(series: dict[str, Any]) -> bool:
    """True for a mainland commodity root ``COM:{venue}:{root}``.

    Only the three-component root identity is a China commodity series; a
    four-component contract id is not served by the continuous-root endpoint.
    """
    parts = str(series.get("series_id") or "").upper().split(":")
    return (
        len(parts) == 3
        and parts[0] == "COM"
        and parts[1] in CHINA_COMMODITY_VENUES
        and bool(parts[2])
    )


def _filter_rows(
    rows: list[dict[str, Any]],
    start: str,
    today: str,
) -> list[dict[str, Any]]:
    """Keep only daily bars inside ``[start, today]``, deduplicated by date."""
    by_day: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        day = str(row.get("ts") or "").strip()[:10]
        if len(day) != 10 or day < start or day > today:
            continue
        prepared = dict(row)
        prepared["ts"] = day
        by_day[day] = prepared
    return [by_day[day] for day in sorted(by_day)]


def _store_bars(ctx: CollectContext, rows: list[dict[str, Any]]) -> int:
    """Upsert bars grouped by their row source id; return the rows written."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        source_id = str(row.get("source_id") or "").strip() or YAHOO
        groups.setdefault(source_id, []).append(row)
    stored = 0
    for source_id, group in groups.items():
        stored += int(ctx.warehouse.upsert_bars(group, source_id))
    return stored


def _snapshot_requests(http: Any) -> int | None:
    """Request counter of the polite client, or ``None`` for a stub client."""
    value = getattr(http, "request_count", None)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _new_channel() -> dict[str, int]:
    """Fresh per-channel statistics accumulator."""
    return {"series": 0, "bars": 0, "requests": 0, "errors": 0, "skipped": 0}


def _empty_result(reason: str, window: dict[str, Any] | None = None) -> dict[str, Any]:
    """Uniform counters payload for a job with nothing to do."""
    details: dict[str, Any] = {"reason": reason}
    if window:
        details["window"] = window
    return {
        "stored": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "status": "ok",
        "details": details,
    }


@dataclass
class _RequestBudget:
    """Per-UTC-day request counter persisted through the job state.

    ``used`` starts at the persisted ``job_state["requests"]`` for the same UTC
    day (a new day resets it in :class:`_Backfill`).  Every strategy attempt is
    charged with the requests it actually spent: measured on the polite client
    when ``request_count`` is available, otherwise conservatively counted as one
    request per attempt (stub clients in tests have no counter).
    """

    limit: int
    used: int
    snapshot: Callable[[], int | None]

    def exhausted(self) -> bool:
        """True when no request may be issued for the rest of the UTC day."""
        return self.used >= self.limit

    def begin(self) -> int | None:
        """Snapshot the client request counter before one attempt."""
        return self.snapshot()

    def record(self, before: int | None) -> int:
        """Account one finished attempt and return the requests it spent."""
        after = self.snapshot()
        if before is not None and after is not None:
            spent = max(0, after - before)
        else:
            spent = 1
        self.used += spent
        return spent


class _Backfill:
    """One execution of the rolling recent-history backfill job."""

    def __init__(self, ctx: CollectContext) -> None:
        self.ctx = ctx
        self.settings = dict(ctx.settings or {})
        self.state = dict(ctx.job_state or {})
        self.today = ctx.today()
        self.days = _setting_int(
            ctx, "backfill_days", DEFAULT_BACKFILL_DAYS,
            minimum=MIN_BACKFILL_DAYS, maximum=MAX_BACKFILL_DAYS,
        )
        self.batch = _setting_int(
            ctx, "backfill_batch", DEFAULT_BACKFILL_BATCH,
            minimum=MIN_BACKFILL_BATCH, maximum=MAX_BACKFILL_BATCH,
        )
        self.daily_limit = _setting_int(
            ctx, "backfill_daily_limit", DEFAULT_BACKFILL_DAILY_LIMIT,
            minimum=MIN_BACKFILL_DAILY_LIMIT, maximum=MAX_BACKFILL_DAILY_LIMIT,
        )
        self.min_bars = _setting_int(
            ctx, "backfill_min_bars", DEFAULT_BACKFILL_MIN_BARS,
            minimum=MIN_BACKFILL_MIN_BARS, maximum=MAX_BACKFILL_MIN_BARS,
        )
        self.stale_days = _setting_int(
            ctx, "backfill_stale_days", DEFAULT_BACKFILL_STALE_DAYS,
            minimum=MIN_BACKFILL_STALE_DAYS, maximum=MAX_BACKFILL_STALE_DAYS,
        )
        self.range_name = _setting_text(ctx, "backfill_range", DEFAULT_BACKFILL_RANGE)
        self.yahoo_reserve = _setting_int(
            ctx, "backfill_yahoo_reserve", DEFAULT_BACKFILL_YAHOO_RESERVE,
            minimum=0, maximum=MAX_BACKFILL_YAHOO_RESERVE,
        )
        self.dry_run = bool(self.settings.get("dry_run"))
        self.start = _window_start(self.today, self.days)
        self.window = {"start": self.start, "end": self.today, "days": self.days}
        self.started_at = ctx.now_iso()

        self.channels: dict[str, dict[str, int]] = {}
        self.errors: list[dict[str, Any]] = []
        #: Raw per-source accumulators handed to the multi-channel collectors.
        self.channel_stats: dict[str, Any] = {}
        self.budget: _RequestBudget | None = None
        self.stored = 0
        self.filled = 0
        self.processed = 0
        self.stopped = ""
        self.yahoo_reserve_hit = False

    # ------------------------------------------------------------------ run

    def run(self) -> dict[str, Any]:
        """Scan coverage, select a fair batch and fill it from the channels."""
        universe = _tracked_universe(self.ctx)
        if not universe:
            return _empty_result("no tracked series", self.window)

        needs, adequate = self._scan(universe)
        cursor = _normalise_cursor(self.state.get("cursor"), len(needs))
        selected, rotated_cursor = _select_needs(needs, cursor, self.batch)
        requests_before = (
            max(0, _safe_int(self.state.get("requests"), 0))
            if str(self.state.get("day") or "") == self.today
            else 0
        )
        if self.dry_run:
            return self._dry_run(
                universe, needs, selected, adequate, cursor, rotated_cursor,
                requests_before,
            )

        self.budget = _RequestBudget(
            limit=self.daily_limit,
            used=requests_before,
            snapshot=lambda: _snapshot_requests(self.ctx.http),
        )
        for item in selected:
            if self.budget.exhausted():
                self.stopped = "daily_limit"
                LOGGER.info(
                    "backfill: daily request limit (%d) reached; %d selected series deferred",
                    self.daily_limit, len(selected) - self.processed,
                )
                break
            if self._process(item) == "stopped":
                break
            self.processed += 1

        total = len(needs)
        next_cursor = (cursor + self.processed) % total if total else 0
        spent = max(0, self.budget.used - requests_before)
        status = "partial" if (self.stopped or self.errors) else "ok"
        skipped = max(0, len(selected) - self.filled)
        details = self._details(universe, needs, selected, adequate, spent)
        LOGGER.info(
            "backfill: window %s..%s (%d day(s)), %d/%d series need fill, "
            "%d selected, %d bar(s) in %d series, %d request(s), status=%s%s",
            self.start, self.today, self.days, len(needs), len(universe),
            len(selected), self.stored, self.filled, spent, status,
            f" (stopped={self.stopped})" if self.stopped else "",
        )
        return {
            "stored": int(self.stored),
            "updated": 0,
            "duplicates": 0,
            "skipped": int(skipped),
            "status": status,
            "details": details,
            "job_state": {
                "day": self.today,
                "requests": int(self.budget.used),
                "cursor": int(next_cursor),
                "last_run_at": self.ctx.now_iso(),
            },
        }

    # --------------------------------------------------------------- scanning

    def _scan(
        self, universe: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], int]:
        """Return ``(needs, adequate_count)`` for the rolling window.

        One warehouse query per map; a series is adequate when it has at least
        ``backfill_min_bars`` bars in the window **and** its latest bar is no
        older than ``backfill_stale_days``.
        """
        coverage = self.ctx.warehouse.bar_coverage_since(self.start, "1d")
        latest = self.ctx.warehouse.latest_bar_map("1d")
        stale_before = _iso_day_shift(self.today, -self.stale_days) or self.today
        needs: list[dict[str, Any]] = []
        for series in universe:
            series_id = str(series["series_id"])
            window_row = coverage.get(series_id) or {}
            count = max(0, _safe_int(window_row.get("count"), 0))
            latest_ts = latest.get(series_id)
            latest_day = str(latest_ts)[:10] if latest_ts else ""
            if count >= self.min_bars and latest_day and latest_day >= stale_before:
                continue
            needs.append({
                "series": series,
                "recent_bars": count,
                "latest_bar": latest_day,
            })
        # Deterministic and oldest-first: series with a dated latest bar come
        # first ordered by date, then series that have no stored bar at all.
        needs.sort(key=lambda item: (
            int(item["series"].get("priority", 1)),
            not item["latest_bar"],
            item["latest_bar"],
            item["series"]["series_id"],
        ))
        return needs, len(universe) - len(needs)

    # ------------------------------------------------------------ dry-run plan

    def _dry_run(
        self,
        universe: list[dict[str, Any]],
        needs: list[dict[str, Any]],
        selected: list[dict[str, Any]],
        adequate: int,
        cursor: int,
        next_cursor: int,
        requests_before: int,
    ) -> dict[str, Any]:
        """Return the plan without touching network or warehouse."""
        channels: dict[str, dict[str, int]] = {}
        for item in selected:
            channel, _payload = self._classify(item["series"])
            channels.setdefault(channel, _new_channel())["series"] += 1
        details: dict[str, Any] = {
            "dry_run": True,
            "reason": "dry run",
            "window": dict(self.window),
            "universe": len(universe),
            "needs": len(needs),
            "selected": len(selected),
            "filled_series": 0,
            "requests": 0,
            "channels": channels,
            "errors": [],
            "coverage": {"adequate": adequate, "needs": len(needs)},
            "selected_series": [item["series"]["series_id"] for item in selected],
            "cursor": cursor,
            "next_cursor": next_cursor,
            "batch": self.batch,
            "daily_limit": self.daily_limit,
            "requests_used_today": requests_before,
        }
        LOGGER.info(
            "backfill dry run: window %s..%s, %d/%d series need fill, %d selected",
            self.start, self.today, len(needs), len(universe), len(selected),
        )
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": details,
        }

    # -------------------------------------------------------------- execution

    def _classify(self, series: dict[str, Any]) -> tuple[str, Any]:
        """Route one series: ``(channel, payload)``.

        ``channel`` is the source id that will serve the bars: ``sina-futures``
        for a mainland commodity root (payload is the provider symbol),
        ``yahoo-finance`` for the chart fallback (payload is the provider
        symbol), or the multi-channel plan entry for a covered instrument.
        """
        symbol = _provider_symbol(series)
        if _is_china_commodity(series):
            return SINA_FUTURES, symbol
        entry = market_channels.eod_entry(series)
        if entry is not None:
            channel = str(entry.get("source_id") or "").strip() or "market-channels"
            return channel, entry
        return YAHOO, symbol

    def _process(self, item: dict[str, Any]) -> str:
        """Fill one selected series; return ``filled``, ``skipped`` or ``stopped``."""
        series = item["series"]
        series_id = str(series["series_id"])
        channel, payload = self._classify(series)
        summary = self.channels.setdefault(channel, _new_channel())
        summary["series"] += 1

        # A series the service could not resolve has no fetcher: skip it without
        # spending a request (the multi-channel plan already guarantees a symbol).
        if not payload and channel in (SINA_FUTURES, YAHOO):
            summary["skipped"] += 1
            LOGGER.debug("backfill: %s skipped, no provider symbol", series_id)
            return "skipped"
        if channel == YAHOO and self._yahoo_reserve_reached():
            summary["skipped"] += 1
            return "skipped"
        if self.budget is None:  # pragma: no cover - defensive, run() sets it
            return "skipped"

        before = self.budget.begin()
        try:
            rows = self._fetch_bars(channel, series, payload)
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
            LOGGER.info(
                "backfill: %s was rate-limited on %s; stopping (cursor stays here)",
                series_id, channel,
            )
            return "stopped"
        except DataSourceError as error:
            spent = self.budget.record(before)
            summary["requests"] += spent
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "source_unavailable",
                "error": str(error)[:200],
            })
            LOGGER.debug("backfill: %s failed on %s: %s", series_id, channel, error)
            return "skipped"
        except ValueError as error:
            # JSONP/parse failures are per-series data problems, not run failures.
            spent = self.budget.record(before)
            summary["requests"] += spent
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "parse_error",
                "error": str(error)[:200],
            })
            LOGGER.debug("backfill: %s returned an unparseable payload: %s", series_id, error)
            return "skipped"

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
            LOGGER.debug(
                "backfill: %s via %s produced no bar(s) in %s..%s",
                series_id, channel, self.start, self.today,
            )
            return "skipped"
        written = _store_bars(self.ctx, in_window)
        if written <= 0:  # pragma: no cover - upsert of a non-empty list is >= 1
            summary["errors"] += 1
            self.errors.append({
                "series_id": series_id,
                "channel": channel,
                "reason": "not_stored",
            })
            return "skipped"
        summary["bars"] += written
        self.stored += written
        self.filled += 1
        LOGGER.debug(
            "backfill: %s via %s stored %d bar(s) in %s..%s",
            series_id, channel, written, self.start, self.today,
        )
        return "filled"

    def _fetch_bars(
        self,
        channel: str,
        series: dict[str, Any],
        payload: Any,
    ) -> list[dict[str, Any]]:
        """Fetch raw daily bars for one series from its routed channel."""
        if channel == SINA_FUTURES and _is_china_commodity(series):
            return self._fetch_china_bars(series, str(payload))
        if channel == YAHOO:
            rows = market_yahoo.fetch_chart_bars(
                self.ctx, series, self.range_name, "1d",
            )
            # The chart endpoint does not stamp provenance: the job owns it.
            for row in rows:
                row["source_id"] = YAHOO
            return rows
        entry = payload
        bars = market_channels._fetch_eod_series(
            self.ctx, entry, self.today, self.started_at, self.channel_stats,
        )
        # A channel's fallback path stamps its own provenance; a plan-level
        # source id is the documented default when a row has none.
        source_id = str(entry.get("source_id") or "").strip() or YAHOO
        for bar in bars:
            if isinstance(bar, dict) and not bar.get("source_id"):
                bar["source_id"] = source_id
        return bars

    def _fetch_china_bars(
        self,
        series: dict[str, Any],
        provider_symbol: str,
    ) -> list[dict[str, Any]]:
        """Fetch one mainland commodity root's daily history from Sina futures."""
        body = china_commodity._fetch_text(
            self.ctx, china_commodity.daily_url(provider_symbol),
        )
        if body is None:  # dry-run / 304: nothing to parse
            return []
        rows = china_commodity.parse_daily_jsonp(body)
        bars = china_commodity.build_daily_bar_rows(
            rows, str(series["series_id"]), self.started_at,
        )
        for bar in bars:
            # The root identity and final daily quality are contractual for this
            # channel, so they are enforced even if the builder changes.
            bar["series_id"] = str(series["series_id"])
            bar["interval"] = "1d"
            bar["quality"] = "final"
            bar["source_id"] = SINA_FUTURES
        return bars

    def _yahoo_reserve_reached(self) -> bool:
        """True when the hourly Yahoo budget is at/below the live-quote floor."""
        governor = getattr(self.ctx.http, "governor", None)
        if governor is None:
            return False
        try:
            remaining = int(governor.remaining(YAHOO).get("remaining_hour", 10**9))
        except Exception:  # noqa: BLE001 - governor diagnostics are optional
            return False
        if remaining > self.yahoo_reserve:
            return False
        if not self.yahoo_reserve_hit:
            self.yahoo_reserve_hit = True
            LOGGER.info(
                "backfill: Yahoo hourly budget at %d <= reserve %d; deferring Yahoo series",
                remaining, self.yahoo_reserve,
            )
        return True

    # ---------------------------------------------------------------- results

    def _details(
        self,
        universe: list[dict[str, Any]],
        needs: list[dict[str, Any]],
        selected: list[dict[str, Any]],
        adequate: int,
        spent: int,
    ) -> dict[str, Any]:
        """Build the diagnostics payload of a real (non dry-run) execution."""
        details: dict[str, Any] = {
            "window": dict(self.window),
            "universe": len(universe),
            "needs": len(needs),
            "selected": len(selected),
            "processed": self.processed,
            "filled_series": self.filled,
            "requests": int(spent),
            "channels": {key: dict(value) for key, value in self.channels.items()},
            "errors": self.errors,
            "coverage": {"adequate": adequate, "needs": len(needs)},
            "selected_series": [item["series"]["series_id"] for item in selected],
        }
        if self.stopped:
            details["stopped"] = self.stopped
        if self.yahoo_reserve_hit:
            details["yahoo_reserve_hit"] = True
        if self.processed < len(selected):
            details["unprocessed"] = [
                item["series"]["series_id"] for item in selected[self.processed:]
            ]
        if not self.stopped and not self.errors and not selected:
            details["reason"] = "coverage adequate"
        return details


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Automatic rolling recent-history backfill job handler.

    See the module docstring for the window, channel routing, cursor rotation
    and request budget.  A missing/empty tracked universe is a clean no-op; a
    ``dry_run`` setting returns the plan without fetching or writing.
    """
    return _Backfill(ctx).run()


__all__ = [
    "CHINA_COMMODITY_VENUES",
    "DEFAULT_BACKFILL_BATCH",
    "DEFAULT_BACKFILL_DAILY_LIMIT",
    "DEFAULT_BACKFILL_DAYS",
    "DEFAULT_BACKFILL_MIN_BARS",
    "DEFAULT_BACKFILL_RANGE",
    "DEFAULT_BACKFILL_STALE_DAYS",
    "DEFAULT_BACKFILL_YAHOO_RESERVE",
    "MAX_BACKFILL_BATCH",
    "MAX_BACKFILL_DAILY_LIMIT",
    "MAX_BACKFILL_DAYS",
    "MAX_BACKFILL_MIN_BARS",
    "MAX_BACKFILL_STALE_DAYS",
    "MIN_BACKFILL_BATCH",
    "MIN_BACKFILL_DAILY_LIMIT",
    "MIN_BACKFILL_DAYS",
    "MIN_BACKFILL_MIN_BARS",
    "MIN_BACKFILL_STALE_DAYS",
    "collect",
]
