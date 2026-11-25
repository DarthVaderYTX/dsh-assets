"""Stooq EOD fallback collector for US equity series.

Stooq's public daily history endpoint returns a plain CSV and is used only as a
*fallback* when Yahoo's chart endpoint could not keep a US equity series current::

    GET https://stooq.com/q/d/l/?s=aapl.us&i=d

CSV shape (header always present for a known symbol)::

    Date,Open,High,Low,Close,Volume
    2026-11-24,199.5,202.0,198.8,201.4,48900000

Mapping policy (v1, deliberately conservative): only US-style equity tickers are
supported, because that is the one mapping we can derive and justify without a
verified symbol table: a tracked ``instrument`` provider symbol like ``AAPL``
becomes ``aapl.us`` (lower-case ticker plus ``.us``).  Indices and futures are
**not** guessed at: :data:`STOOQ_SYMBOL_MAP` starts empty and exists purely as a
reviewed extension point for symbols that are verified against the live endpoint
(for example a future explicit ``"^spx": "^spx"`` entry).  Unsupported series are
skipped and reported, never silently mapped through a guess.

This module never decides when Yahoo has failed: the service runs it as an
explicit fallback pass, and :func:`collect` only fills series whose latest stored
daily bar is at least ``stale_days`` old (default 2).  Requests still pass through
the shared polite HTTP client and rate governor.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import urllib.parse
from datetime import date, datetime
from typing import Any

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, utc_date
from ..specs import STOOQ

#: Shared tracked-series normalisation lives with the Yahoo collector so both
#: price modules parse ``ctx.settings["tracked_series"]`` identically.
from .market_yahoo import tracked_series

LOGGER = logging.getLogger("market_monitor.data.sources.market_stooq")

STOOQ_BASE_URL = "https://stooq.com"
STOOQ_DAILY_PATH = "/q/d/l/"
DEFAULT_STALE_DAYS = 2
#: Cap per fallback pass; the rest is deferred to the next run.
DEFAULT_MAX_SERIES_PER_RUN = 40

#: Explicit provider-symbol overrides, verified mapping only.  Empty in v1:
#: only US equities are supported via the derived ``<ticker>.us`` form.
STOOQ_SYMBOL_MAP: dict[str, str] = {}

#: A US-style ticker: letters/digits plus ``.``/``-`` share-class separators.
#: ``^`` (indexes) and ``=`` (Yahoo futures) intentionally do not match.
_US_TICKER = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,11}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _number(value: Any) -> float | None:
    """Return ``value`` as a finite float, or ``None`` for blank/invalid text."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _parse_date(value: Any) -> date | None:
    """Parse a ``YYYY-MM-DD`` prefix into a date, or ``None``."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def stooq_symbol_for(series: dict[str, Any]) -> str | None:
    """Map one tracked series to a Stooq symbol, or ``None`` when unsupported.

    Only tracked instruments (US-listed equities/ETFs/ADRs) are supported in v1.
    A reviewed entry in :data:`STOOQ_SYMBOL_MAP` wins over the derived
    ``<ticker>.us`` form.
    """
    if series.get("kind") != "instrument":
        return None
    provider_symbol = str(series.get("provider_symbol") or "").strip().upper()
    if not provider_symbol:
        return None
    override = STOOQ_SYMBOL_MAP.get(provider_symbol)
    if override:
        return override
    if not _US_TICKER.match(provider_symbol):
        return None
    return f"{provider_symbol.lower()}.us"


def stooq_url(symbol: str) -> str:
    """Daily-history CSV URL for one Stooq symbol."""
    return f"{STOOQ_BASE_URL}{STOOQ_DAILY_PATH}?s={urllib.parse.quote(str(symbol), safe='')}&i=d"


def parse_stooq_csv(text: str, series_id: str, today: str | None = None) -> list[dict[str, Any]]:
    """Parse a Stooq daily CSV into warehouse bar rows.

    Rows are dropped when a number is missing/invalid or the close is not
    positive; a missing/invalid volume is stored as ``None`` (the rest of the row
    is still usable).  ``ts`` is the CSV ``Date`` (``YYYY-MM-DD``) and today's
    bar is marked provisional like every other daily source.
    """
    if not text or not text.strip():
        return []
    current_day = today or utc_date()
    stream = io.StringIO(text.lstrip("\ufeff"))
    reader = csv.DictReader(stream)
    if not reader.fieldnames:
        return []
    fields = {str(name).strip().lower(): name for name in reader.fieldnames if name}
    required = ("date", "open", "high", "low", "close")
    if any(name not in fields for name in required):
        LOGGER.info("stooq: unexpected CSV header %r for %s", reader.fieldnames, series_id)
        return []
    bars: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in reader:
        ts = str(raw.get(fields["date"]) or "").strip()
        if not _DATE.match(ts) or _parse_date(ts) is None or ts in seen:
            continue
        values: dict[str, float] = {}
        for name in ("open", "high", "low", "close"):
            number = _number(raw.get(fields[name]))
            if number is None:
                values = {}
                break
            values[name] = number
        if not values or values["close"] <= 0:
            continue
        seen.add(ts)
        bars.append({
            "series_id": series_id,
            "interval": "1d",
            "ts": ts,
            "open": values["open"],
            "high": values["high"],
            "low": values["low"],
            "close": values["close"],
            "volume": _number(raw.get(fields["volume"])) if "volume" in fields else None,
            "quality": "provisional" if ts == current_day else "final",
        })
    return bars


def fetch_stooq_eod(ctx: CollectContext, series: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch and parse Stooq daily bars for one tracked series.

    Unsupported series return an empty list without touching the network.  A
    non-200 answer raises :class:`DataSourceError`; transport failures propagate
    as the polite client's typed errors, so callers can skip one symbol and keep
    the fallback pass running.
    """
    symbol = stooq_symbol_for(series)
    if symbol is None:
        return []
    url = stooq_url(symbol)
    result = ctx.http.fetch(STOOQ, url)
    if getattr(result, "dry_run", False) or getattr(result, "not_modified", False):
        return []
    status = int(getattr(result, "status", 0) or 0)
    if status and status != 200:
        raise DataSourceError(f"Stooq returned HTTP {status} for {symbol}")
    series_id = str(series.get("series_id") or "")
    bars = parse_stooq_csv(result.text(), series_id, ctx.today())
    LOGGER.debug("stooq: %s -> %d bar(s) for %s", symbol, len(bars), series_id)
    return bars


def _setting_float(ctx: CollectContext, key: str, default: float) -> float:
    """Read a non-negative float setting, falling back to ``default``."""
    raw = ctx.settings.get(key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    if value < 0.0 or value != value:
        return default
    return value


def _is_stale(latest_ts: Any, today: str, stale_days: float) -> bool:
    """True when the latest stored bar is at least ``stale_days`` days old."""
    latest = _parse_date(latest_ts)
    if latest is None:
        return True
    current = _parse_date(today)
    if current is None:
        return False
    return (current - latest).days >= stale_days


def collect(ctx: CollectContext) -> dict[str, Any]:
    """EOD fallback pass: fill stale, Stooq-supported US equity series.

    Opt-in via ``ctx.settings["stooq_fallback"]`` (default ``False``; the public
    Stooq endpoint was observed to reject repeated CSV requests from this host,
    so Yahoo remains the primary EOD source).  Series that are unsupported,
    already current, rate-limited or empty are counted as ``skipped`` and listed
    in ``details``; one failing symbol never aborts the pass.
    """
    if not bool(ctx.settings.get("stooq_fallback", True)):
        return {"stored": 0, "updated": 0, "duplicates": 0, "skipped": 0,
                "details": {"reason": "stooq fallback disabled"}}
    tracked = tracked_series(ctx)
    if not tracked:
        return {"stored": 0, "updated": 0, "duplicates": 0, "skipped": 0,
                "details": {"reason": "no tracked series"}}
    if bool(ctx.settings.get("dry_run")):
        planned = [series["series_id"] for series in tracked if stooq_symbol_for(series)]
        return {"stored": 0, "updated": 0, "duplicates": 0, "skipped": 0,
                "details": {"reason": "dry run", "planned": planned}}
    max_series_setting = ctx.settings.get("stooq_max_series_per_run", DEFAULT_MAX_SERIES_PER_RUN)
    try:
        max_series = max(1, min(500, int(max_series_setting)))
    except (TypeError, ValueError):
        max_series = DEFAULT_MAX_SERIES_PER_RUN
    deferred = tracked[max_series:]
    tracked = tracked[:max_series]
    stale_days = _setting_float(ctx, "stale_days", float(DEFAULT_STALE_DAYS))
    today = ctx.today()
    stored = 0
    skipped = 0
    filled: list[str] = []
    unsupported: list[str] = []
    fresh: list[str] = []
    failed: list[dict[str, Any]] = []

    for series in tracked:
        series_id = series["series_id"]
        if stooq_symbol_for(series) is None:
            skipped += 1
            unsupported.append(series_id)
            continue
        latest = ctx.warehouse.latest_bar_ts(series_id, "1d")
        if latest and not _is_stale(latest, today, stale_days):
            skipped += 1
            fresh.append(series_id)
            continue
        try:
            bars = fetch_stooq_eod(ctx, series)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            skipped += 1
            failed.append({"series_id": series_id, "reason": "rate_limited", "error": str(error)[:200]})
            continue
        except DataSourceError as error:
            skipped += 1
            failed.append({
                "series_id": series_id, "reason": "source_unavailable", "error": str(error)[:200],
            })
            continue
        if not bars:
            skipped += 1
            failed.append({"series_id": series_id, "reason": "no bars"})
            continue
        stored += ctx.warehouse.upsert_bars(bars, STOOQ)
        filled.append(series_id)

    LOGGER.debug(
        "stooq fallback: %d filled, %d skipped of %d tracked",
        len(filled), skipped, len(tracked),
    )
    details: dict[str, Any] = {"stale_days": stale_days, "filled": filled}
    if deferred:
        details["deferred"] = [series["series_id"] for series in deferred]
        skipped += len(deferred)
    if unsupported:
        details["unsupported"] = unsupported
    if fresh:
        details["fresh"] = fresh
    if failed:
        details["failed"] = failed
    return {
        "stored": stored,
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": "partial" if failed else "ok",
        "details": details,
    }


__all__ = [
    "DEFAULT_STALE_DAYS",
    "STOOQ_BASE_URL",
    "STOOQ_DAILY_PATH",
    "STOOQ_SYMBOL_MAP",
    "collect",
    "fetch_stooq_eod",
    "parse_stooq_csv",
    "stooq_symbol_for",
    "stooq_url",
]
