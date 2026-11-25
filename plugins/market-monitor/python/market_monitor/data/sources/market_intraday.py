"""Real intraday-bar collector for watched US securities.

Daily bars and intraday bars are stored in separate density buckets
(``interval='1d'`` vs ``interval='5m'``/``'30m'``). This job fills the intraday
buckets from Sina's public US minute-history endpoint; the service reads the
matching bucket for ``1D``/``5D`` and never substitutes daily rows.

The endpoint is the same governed ``sina-finance`` source used by the daily
collector. Only provider-published bars are stored; no synthetic bars, no gap
padding and no extrapolation. If the endpoint has less history than requested,
the shorter real series is stored as-is.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import SINA_FINANCE
from .market_channels import SINA_HEADERS, _request, _stats_for

LOGGER = logging.getLogger("market_monitor.data.sources.market_intraday")

SINA_US_MINUTE_BASE_URL = (
    "https://stock.finance.sina.com.cn/usstock/api/jsonp.php"
)
SINA_US_MINUTE_PATH = "/US_MinKService.getMinK"
US_INTRADAY_MICS = frozenset({"XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"})

DEFAULT_INTRADAY_BATCH = 12
MIN_INTRADAY_BATCH = 1
MAX_INTRADAY_BATCH = 20
DEFAULT_5M_DAYS = 5
DEFAULT_30M_DAYS = 10
DEFAULT_DAILY_LIMIT = 60

_JSONP_ARRAY = re.compile(r"\((\[.*\])\)\s*;?\s*$", re.DOTALL)
_EASTERN = ZoneInfo("America/New_York")


def _number(value: Any) -> float | None:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _setting_int(ctx: CollectContext, key: str, default: int, low: int, high: int) -> int:
    try:
        value = int(ctx.settings.get(key, default))
    except (TypeError, ValueError):
        value = int(default)
    return max(low, min(value, high))


def _us_symbol(series: dict[str, Any]) -> str:
    parts = str(series.get("series_id") or "").upper().split(":")
    if len(parts) < 3 or parts[0] != "INS" or parts[1] not in US_INTRADAY_MICS:
        return ""
    symbol = str(series.get("provider_symbol") or "").strip().upper()
    return symbol if symbol.isalnum() or all(ch.isalnum() or ch in ".-" for ch in symbol) else ""


def minute_url(symbol: str, minutes: int) -> str:
    """Sina minute-history JSONP URL for one US symbol."""
    return (
        f"{SINA_US_MINUTE_BASE_URL}/var%20_{symbol}="
        f"{SINA_US_MINUTE_PATH}?symbol={symbol}&type={int(minutes)}"
    )


def _timestamp(value: Any) -> str:
    """Convert Sina's US-Eastern wall clock to an ISO UTC timestamp."""
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        local = datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=_EASTERN
        )
    except ValueError:
        return ""
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_minute_jsonp(text: str, interval: str) -> list[dict[str, Any]]:
    """Parse a Sina minute JSONP body into one density's bar rows.

    Only provider rows with valid OHLC values are returned. Rows are
    deduplicated by UTC timestamp; no missing bar is synthesised.
    """
    if not text or "(" not in text:
        return []
    try:
        start = text.find("([")
        end = text.rfind("]);")
        if start >= 0 and end > start:
            payload = json.loads(text[start + 1:end + 1])
        else:
            payload = json.loads(_JSONP_ARRAY.search(text.strip()).group(1))
    except (AttributeError, ValueError, TypeError) as error:
        raise ValueError(f"invalid Sina minute payload: {error}") from error
    if not isinstance(payload, list):
        return []
    by_ts: dict[str, dict[str, Any]] = {}
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        ts = _timestamp(raw.get("d"))
        open_price = _number(raw.get("o"))
        high = _number(raw.get("h"))
        low = _number(raw.get("l"))
        close = _number(raw.get("c"))
        if not ts or None in (open_price, high, low, close):
            continue
        if min(open_price, high, low, close) <= 0:
            continue
        if high < max(open_price, close) or low > min(open_price, close):
            continue
        by_ts[ts] = {
            "interval": interval,
            "ts": ts,
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": _number(raw.get("v")),
            "source_id": SINA_FINANCE,
            "quality": "final",
        }
    return [by_ts[ts] for ts in sorted(by_ts)]


def aggregate_30m(five_minute_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate real 5m bars into separately stored 30m bars.

    The aggregate is derived only from the provider-published 5m rows in the
    same bucket; an incomplete bucket is still a real partial open/high/low/
    close aggregate and is marked ``derived``. No missing bucket is invented.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in five_minute_rows:
        ts = str(row.get("ts") or "")
        if len(ts) < 16:
            continue
        minute = int(ts[14:16])
        bucket = 0 if minute < 30 else 30
        label = f"{ts[:14]}{bucket:02d}:00Z"
        groups.setdefault(label, []).append(row)
    output: list[dict[str, Any]] = []
    for label in sorted(groups):
        rows = groups[label]
        if not rows:
            continue
        output.append({
            "interval": "30m",
            "ts": label,
            "open": rows[0]["open"],
            "high": max(row["high"] for row in rows),
            "low": min(row["low"] for row in rows),
            "close": rows[-1]["close"],
            "volume": sum(row["volume"] or 0.0 for row in rows) or None,
            "source_id": SINA_FINANCE,
            "quality": "derived",
        })
    return output


def _fetch(ctx: CollectContext, symbol: str, minutes: int, interval: str) -> list[dict[str, Any]]:
    url = minute_url(symbol, minutes)
    result = _request(ctx, SINA_FINANCE, url, SINA_HEADERS, _stats_for({}, SINA_FINANCE))
    if result is None:
        return []
    status = int(getattr(result, "status", 0) or 0)
    if status and status != 200:
        raise DataSourceError(f"Sina minute history returned HTTP {status} for {symbol}")
    return parse_minute_jsonp(result.text(), interval)


def _window_start(today: str, days: int) -> str:
    try:
        return (date.fromisoformat(today) - timedelta(days=days)).isoformat()
    except ValueError:
        return today


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Fetch real 5m bars for watched US securities and store 30m separately.

    One request per symbol (5m); the 30m density is a separate stored bucket
    derived only from those same real 5m bars. Both buckets are written before
    either can be read; the service never falls back from one density to the
    other.
    """
    tracked = ctx.settings.get("tracked_series") if isinstance(ctx.settings, dict) else None
    if not isinstance(tracked, list):
        return {"stored": 0, "details": {"reason": "no tracked series"}}
    batch = _setting_int(ctx, "intraday_batch", DEFAULT_INTRADAY_BATCH, MIN_INTRADAY_BATCH, MAX_INTRADAY_BATCH)
    limit = _setting_int(ctx, "intraday_daily_limit", DEFAULT_DAILY_LIMIT, 10, 500)
    five_days = _setting_int(ctx, "intraday_5m_days", DEFAULT_5M_DAYS, 1, 30)
    watched = [
        series for series in tracked
        if str(series.get("kind")) == "instrument"
        and int(series.get("priority", 1)) == 0
        and _us_symbol(series)
    ]
    if not watched:
        return {"stored": 0, "details": {"reason": "no watched US instruments"}}
    today = ctx.today()
    start = _window_start(today, five_days)
    stored = 0
    bars_5m = 0
    bars_30m = 0
    fetched = 0
    errors: list[dict[str, Any]] = []
    state = dict(ctx.job_state or {})
    try:
        cursor = int(state.get("cursor") or 0)
    except (TypeError, ValueError):
        cursor = 0
    total = len(watched)
    selected = [
        watched[(cursor + offset) % total]
        for offset in range(min(batch, total))
    ]
    next_cursor = (cursor + len(selected)) % total if total else 0
    for series in selected:
        if fetched >= limit:
            errors.append({"reason": "daily_limit"})
            break
        symbol = _us_symbol(series)
        owner = str(series.get("series_id") or "")
        try:
            rows = _fetch(ctx, symbol, 5, "5m")
        except (SourceRateLimitedError, SourceBlockedError) as error:
            errors.append({
                "series_id": owner, "interval": "5m",
                "reason": "rate_limited", "error": str(error)[:200],
            })
            break
        except (DataSourceError, ValueError) as error:
            errors.append({
                "series_id": owner, "interval": "5m",
                "reason": "source_unavailable", "error": str(error)[:200],
            })
            fetched += 1
            continue
        fetched += 1
        five = [
            row for row in rows
            if start <= str(row.get("ts") or "")[:10] <= today
        ]
        if not five:
            errors.append({
                "series_id": owner, "interval": "5m",
                "reason": "no_bars_in_window",
            })
            continue
        for row in five:
            row["series_id"] = owner
        thirty = aggregate_30m(five)
        for row in thirty:
            row["series_id"] = owner
        stored += int(ctx.warehouse.upsert_bars(five, SINA_FINANCE))
        stored += int(ctx.warehouse.upsert_bars(thirty, SINA_FINANCE))
        bars_5m += len(five)
        bars_30m += len(thirty)
    status = "partial" if errors else "ok"
    details = {
        "batch": len(selected),
        "symbols": [_us_symbol(series) for series in selected],
        "window": {"start": start, "end": today, "days": five_days},
        "source": SINA_FINANCE,
        "bars_5m": bars_5m,
        "bars_30m": bars_30m,
        "errors": errors,
    }
    LOGGER.info(
        "intraday: %d/%d watched symbols, %d request(s), 5m=%d 30m=%d, status=%s",
        len(selected), len(watched), fetched, bars_5m, bars_30m, status,
    )
    return {
        "stored": stored,
        "updated": 0,
        "duplicates": 0,
        "skipped": max(0, len(watched) - len(selected)),
        "status": status,
        "details": details,
        "job_state": {"cursor": next_cursor},
    }


__all__ = [
    "DEFAULT_INTRADAY_BATCH",
    "DEFAULT_5M_DAYS",
    "DEFAULT_30M_DAYS",
    "collect",
    "minute_url",
    "parse_minute_jsonp",
]
