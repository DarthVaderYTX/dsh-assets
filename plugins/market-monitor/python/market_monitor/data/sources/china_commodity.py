"""Sina Finance collectors for mainland commodity futures quotes and EOD bars.

This module is the only place in the collection layer that talks to Sina
Finance.  Every request goes through the shared polite HTTP client
(``ctx.http.fetch``) under the ``sina-futures`` source, so the rate governor,
budgets and retry policy apply uniformly.  Both endpoints require a browser-like
``Referer`` and answer with **GBK** encoded bodies, never UTF-8.

Endpoints (public; probed on this machine 2026-11-25)::

    GET https://hq.sinajs.cn/list=AU0,CU0,...
    GET https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_AU0=/
        InnerFuturesNewService.getDailyKLine?symbol=AU0

Batch quote payload (one line per symbol, GBK)::

    var hq_str_AU0="黄金连续,13:59:58,930.00,...,SHFE,AU,2026-11-25,...";

The verified domestic-futures field layout is documented in
:data:`QUOTE_FIELDS`; ``last`` (index 8) is the traded price and ``prev_settle``
(index 10) the settlement of the previous session, which is the reference for
the daily change (``prev_close`` field 5 is only a fallback).

The daily-history payload is JSONP (and may be prefixed by a script tag or a
comment).  Rows are ``[d, o, h, l, c, v, p, s]`` = date, open, high, low, close,
volume, open interest, settlement.

Series identity is the commodity **root** -- ``COM:{venue}:{root}`` -- because
that is what the provider's continuous front-contract symbol (``AU0``) quotes.
The tracked universe arrives in ``ctx.settings["china_commodities"]`` (the
service resolves it from the ``china:commodities`` index); when the setting is
absent the validated seed is used directly, so the collectors also work before
the index has been refreshed.  An explicitly injected empty list means "no
roots" and is a clean no-op.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
from datetime import date
from typing import Any, Iterable, Iterator, Sequence

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, commodity_root_id
from ..specs import SINA_FUTURES

LOGGER = logging.getLogger("market_monitor.data.sources.china_commodity")

#: Batch quote endpoint (symbols appended after ``list=``).
SINA_BASE_URL = "https://hq.sinajs.cn"
SINA_QUOTE_URL = f"{SINA_BASE_URL}/list="
#: Daily-history JSONP endpoint (callback name embeds the symbol).
SINA_HISTORY_BASE_URL = "https://stock2.finance.sina.com.cn/futures/api/jsonp.php"
SINA_HISTORY_PATH = "/InnerFuturesNewService.getDailyKLine"
#: Sina only serves the quote/history endpoints to a browser-like referer.
SINA_REFERER = "https://finance.sina.com.cn"
SINA_HEADERS = {"Referer": SINA_REFERER}
SINA_ACCEPT = "*/*"

DEFAULT_BATCH_SIZE = 40
MIN_BATCH_SIZE = 1
MAX_BATCH_SIZE = 80
DEFAULT_EOD_MAX_ROOTS = 50
MIN_EOD_MAX_ROOTS = 1
MAX_EOD_MAX_ROOTS = 80
#: A quote whose embedded trading date is older than this is not treated as a
#: live observation (some public gateways serve a frozen snapshot).
MAX_QUOTE_AGE_DAYS = 7

#: Verified domestic-futures quote field layout (comma separated ``fields``).
QUOTE_FIELDS = (
    "name", "time", "open", "high", "low", "prev_close", "bid", "ask", "last",
    "settle", "prev_settle", "bid_vol", "ask_vol", "volume", "open_interest",
    "exchange", "variety", "date",
)

#: ``var hq_str_AU0="...";`` -- one line per requested symbol.
_QUOTE_LINE = re.compile(r'var\s+hq_str_([A-Za-z0-9_.]+)\s*=\s*"([^"]*)"\s*;?')

#: Daily bar timestamps must be plain ``YYYY-MM-DD`` dates.
_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

#: Quote fields that carry a numeric value.
_NUMERIC_QUOTE_FIELDS = QUOTE_FIELDS[2:15]


# ---------------------------------------------------------------------------
# small parsing helpers
# ---------------------------------------------------------------------------


def _text(value: Any) -> str:
    """Trim a value to a string (``None`` becomes ``""``)."""
    return str(value).strip() if value is not None else ""


def _number(value: Any) -> float | None:
    """Return ``value`` as a finite float, or ``None`` for blank/invalid values."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _positive(value: Any) -> float | None:
    """Return ``value`` as a finite float only when it is strictly positive."""
    number = _number(value)
    if number is None or number <= 0:
        return None
    return number


def _field(fields: Sequence[str], index: int) -> str:
    """Return the trimmed field at ``index``, or ``""`` when out of range."""
    if index < 0 or index >= len(fields):
        return ""
    return fields[index]


def _setting_int(
    ctx: CollectContext,
    key: str,
    default: int,
    *,
    minimum: int = 1,
    maximum: int | None = None,
) -> int:
    """Read a bounded integer setting, falling back to ``default``."""
    try:
        value = int(ctx.settings.get(key, default))
    except (TypeError, ValueError):
        value = default
    value = max(minimum, value)
    if maximum is not None:
        value = min(value, maximum)
    return value


def _chunks(items: Sequence[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    """Yield consecutive chunks of at most ``size`` items."""
    for start in range(0, len(items), size):
        yield list(items[start:start + size])


def _decode_body(result: Any) -> str:
    """Decode a Sina response body as GBK (with tolerant fallbacks)."""
    body = getattr(result, "body", b"") or b""
    if isinstance(body, bytes):
        for encoding in ("gbk", "gb18030", "utf-8"):
            try:
                return body.decode(encoding)
            except UnicodeDecodeError:
                continue
        return body.decode("utf-8", errors="replace")
    return str(body)


# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------


def quote_url(symbols: Iterable[str]) -> str:
    """Batch quote URL for the given provider symbols (``list=AU0,CU0``)."""
    encoded = ",".join(
        text for text in (str(symbol or "").strip().upper() for symbol in symbols) if text
    )
    return f"{SINA_QUOTE_URL}{encoded}"


def daily_url(provider_symbol: str) -> str:
    """Daily-history JSONP URL for one continuous front-contract symbol."""
    symbol = str(provider_symbol or "").strip().upper()
    quoted = urllib.parse.quote(symbol, safe="")
    return (
        f"{SINA_HISTORY_BASE_URL}/var%20_{quoted}="
        f"{SINA_HISTORY_PATH}?symbol={quoted}"
    )


# ---------------------------------------------------------------------------
# quote parsing
# ---------------------------------------------------------------------------


def parse_quote_text(text: str) -> list[dict[str, Any]]:
    """Parse a GBK-decoded ``hq.sinajs.cn/list=`` response.

    Returns one dict per ``var hq_str_<symbol>`` line with the verified field
    layout mapped onto named keys (numeric fields as floats where parseable).
    Symbols that the endpoint answers with an empty string are kept with blank
    fields so the collector can count them as unusable instead of silently
    dropping them.
    """
    if not text:
        return []
    quotes: list[dict[str, Any]] = []
    for match in _QUOTE_LINE.finditer(text):
        symbol = _text(match.group(1)).upper()
        if not symbol:
            continue
        value = match.group(2)
        fields = [part.strip() for part in value.split(",")] if value else []
        quote: dict[str, Any] = {"symbol": symbol}
        for index, name in enumerate(QUOTE_FIELDS):
            raw = _field(fields, index)
            quote[name] = _number(raw) if name in _NUMERIC_QUOTE_FIELDS else raw
        quotes.append(quote)
    return quotes


# ---------------------------------------------------------------------------
# daily history parsing
# ---------------------------------------------------------------------------


def _json_array(text: str) -> list[Any]:
    """Extract the first JSON array from a JSONP/script-wrapped payload.

    The response may be prefixed by a script tag or comment, so the first ``[``
    is located and decoded with :class:`json.JSONDecoder` (positioned decoding),
    which extracts exactly one array without touching the wrapper text.
    """
    start = text.find("[")
    if start < 0:
        return []
    try:
        payload, _end = json.JSONDecoder().raw_decode(text, start)
    except ValueError as error:
        raise ValueError(f"invalid JSON array in Sina daily response: {error}") from error
    if not isinstance(payload, list):
        raise ValueError("Sina daily response did not contain a JSON array")
    return payload


def parse_daily_jsonp(text: str) -> list[dict[str, Any]]:
    """Parse a GBK-decoded daily-history JSONP payload into normalised rows.

    Rows are ``[d, o, h, l, c, v, p, s]`` (date, open, high, low, close, volume,
    open interest, settlement).  Rows without a valid date or a positive close
    are dropped; the other numbers may be null.  An empty/unrecognisable payload
    yields ``[]``; a payload that starts an array but is not valid JSON raises
    :class:`ValueError` so the caller can record a parse error and move on.
    """
    if not text:
        return []
    rows: list[dict[str, Any]] = []
    for raw in _json_array(text):
        if not isinstance(raw, dict):
            continue
        date_text = _text(raw.get("d"))[:10]
        if not _DATE_PATTERN.match(date_text):
            continue
        close = _positive(raw.get("c"))
        if close is None:
            continue
        rows.append({
            "date": date_text,
            "open": _number(raw.get("o")),
            "high": _number(raw.get("h")),
            "low": _number(raw.get("l")),
            "close": close,
            "volume": _number(raw.get("v")),
            "open_interest": _number(raw.get("p")),
            "settlement": _number(raw.get("s")),
        })
    rows.sort(key=lambda row: row["date"])
    return rows


# ---------------------------------------------------------------------------
# tracked universe
# ---------------------------------------------------------------------------


def _seed_roots() -> list[dict[str, Any]]:
    """Tracked roots from the validated ``china:commodities`` seed."""
    # Imported lazily: the index provider imports this package's siblings, so a
    # module-level import would be an avoidable cycle risk for the job wiring.
    from ..indices.china_commodities import load_seed

    roots: list[dict[str, Any]] = []
    for row in load_seed():
        roots.append({
            "series_id": commodity_root_id(row["venue"], row["root"]),
            "venue": _text(row["venue"]).upper(),
            "root": _text(row["root"]).upper(),
            "provider_symbol": _text(row["provider_symbol"]).upper(),
            "name": _text(row["name"]),
            "category": _text(row.get("category")),
            "unit": _text(row.get("unit")),
            "currency": _text(row.get("currency")).upper() or "CNY",
        })
    return roots


def _normalise_root(raw: Any) -> dict[str, Any] | None:
    """Validate one tracked-root item (seed row, index entry or series dict).

    Accepted inputs are the seed rows, the manager's ``ref_commodity_root``
    shaped rows (``root_id``/``venue``/``root``/``provider_symbol``) and index
    entries (payload also inspected).  ``None`` is returned for unusable items.
    """
    if not isinstance(raw, dict):
        return None
    payload = raw.get("payload") if isinstance(raw.get("payload"), dict) else {}
    venue = (
        _text(raw.get("venue")) or _text(payload.get("venue")) or _text(raw.get("market"))
    ).upper()
    root = (_text(raw.get("root")) or _text(payload.get("root"))).upper()
    provider_symbol = (
        _text(raw.get("provider_symbol")) or _text(payload.get("provider_symbol"))
    ).upper()
    series_id = (
        _text(raw.get("series_id"))
        or _text(raw.get("root_id"))
        or _text(payload.get("series_id"))
    )
    if not series_id and venue and root:
        try:
            series_id = commodity_root_id(venue, root)
        except ValueError:
            return None
    if not series_id or not provider_symbol:
        return None
    if not venue or not root:
        parts = series_id.split(":")
        if len(parts) >= 3 and parts[0] == "COM":
            venue = venue or parts[1].upper()
            root = root or parts[2].upper()
    currency = (
        _text(raw.get("currency")) or _text(payload.get("currency")) or "CNY"
    ).upper()
    return {
        "series_id": series_id,
        "venue": venue,
        "root": root,
        "provider_symbol": provider_symbol,
        "name": _text(raw.get("name")) or _text(payload.get("name")),
        "category": _text(raw.get("category")) or _text(payload.get("category")),
        "unit": _text(raw.get("unit")) or _text(payload.get("unit")),
        "currency": currency,
    }


def tracked_roots(ctx: CollectContext) -> list[dict[str, Any]]:
    """Resolved tracked commodity roots for one collector run.

    ``ctx.settings["china_commodities"]`` wins when present (including an empty
    list, which means "no roots"); otherwise the validated seed is loaded.  A
    mapping is also accepted (``provider_symbol -> series_id`` or row) so tests
    and callers can inject a small universe without touching the seed.
    """
    raw = ctx.settings.get("china_commodities")
    if raw is None:
        items: Iterable[Any] = _seed_roots()
    elif isinstance(raw, dict):
        mapped: list[Any] = []
        for key, value in raw.items():
            if isinstance(value, dict):
                item = dict(value)
                item.setdefault("provider_symbol", key)
            else:
                item = {"provider_symbol": key, "series_id": _text(value)}
            mapped.append(item)
        items = mapped
    elif isinstance(raw, (list, tuple)):
        items = raw
    else:  # pragma: no cover - defensive: unexpected injection type
        items = []

    roots: list[dict[str, Any]] = []
    seen_series: set[str] = set()
    seen_symbols: set[str] = set()
    for item in items:
        root = _normalise_root(item)
        if root is None:
            continue
        if root["series_id"] in seen_series or root["provider_symbol"] in seen_symbols:
            continue
        seen_series.add(root["series_id"])
        seen_symbols.add(root["provider_symbol"])
        roots.append(root)
    return roots


# ---------------------------------------------------------------------------
# row builders
# ---------------------------------------------------------------------------


def _root_map(roots: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Map upper-case provider symbol -> tracked root.

    Raw inputs are normalised here as well, so the public row builders accept
    seed rows, manager-shaped reference rows, tracked-series dicts and already
    normalised roots alike.
    """
    mapping: dict[str, dict[str, Any]] = {}
    for raw in roots:
        root = _normalise_root(raw)
        if root is not None:
            mapping[root["provider_symbol"]] = root
    return mapping


def build_quote_rows(
    quotes: Iterable[dict[str, Any]],
    roots: Iterable[dict[str, Any]],
    now: str,
) -> list[dict[str, Any]]:
    """Build ``market_quote_latest`` rows for parsed Sina quotes.

    ``price`` is the last traded price; rows without a positive price are
    dropped.  ``prev_close`` prefers the previous settlement when positive
    (domestic futures settle daily, so that is the reference price) and falls
    back to the provider's previous close otherwise.  ``ts``/``observed_at`` use
    the collector clock, as required for the batch quote hand-off.
    """
    by_symbol = _root_map(roots)
    rows: list[dict[str, Any]] = []
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        root = by_symbol.get(_text(quote.get("symbol")).upper())
        if root is None:
            continue
        price = _positive(quote.get("last"))
        if price is None:
            continue
        prev_close = _positive(quote.get("prev_settle"))
        if prev_close is None:
            prev_close = _number(quote.get("prev_close"))
        change_pct: float | None = None
        if prev_close is not None and prev_close > 0:
            change_pct = (price - prev_close) / prev_close * 100.0
        rows.append({
            "series_id": root["series_id"],
            "ts": now,
            "price": price,
            "prev_close": prev_close,
            "change_pct": change_pct,
            "change_type": "percent",
            "volume": _number(quote.get("volume")),
            "currency": root.get("currency") or "CNY",
            "source_id": SINA_FUTURES,
            "observed_at": now,
        })
    return rows


def build_provisional_bars(
    quotes: Iterable[dict[str, Any]],
    roots: Iterable[dict[str, Any]],
    now: str,
) -> list[dict[str, Any]]:
    """One provisional daily bar per usable quote for the current UTC date.

    The bar lets charts render intraday before the end-of-day history job writes
    the final bar (which upserts the same ``(series_id, interval, ts)`` key and
    promotes ``quality`` to ``final``).  Missing/zero OHLC values fall back to
    the last price so the bar stays renderable.
    """
    today = now[:10]
    by_symbol = _root_map(roots)
    rows: list[dict[str, Any]] = []
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        root = by_symbol.get(_text(quote.get("symbol")).upper())
        if root is None:
            continue
        close = _positive(quote.get("last"))
        if close is None:
            continue
        open_price = _positive(quote.get("open")) or close
        high = _positive(quote.get("high")) or close
        low = _positive(quote.get("low")) or close
        rows.append({
            "series_id": root["series_id"],
            "interval": "1d",
            "ts": today,
            "open": open_price,
            "high": max(high, open_price, close),
            "low": min(low, open_price, close),
            "close": close,
            "volume": _number(quote.get("volume")),
            "quality": "provisional",
            "source_id": SINA_FUTURES,
            "observed_at": now,
        })
    return rows


def build_daily_bar_rows(
    rows: Iterable[dict[str, Any]],
    series_id: str,
    now: str,
) -> list[dict[str, Any]]:
    """Build ``market_bar`` rows (``interval="1d"``, ``quality="final"``)."""
    bars: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        date_text = _text(row.get("date"))[:10]
        close = _positive(row.get("close"))
        if not _DATE_PATTERN.match(date_text) or close is None:
            continue
        bars.append({
            "series_id": series_id,
            "interval": "1d",
            "ts": date_text,
            "open": _number(row.get("open")),
            "high": _number(row.get("high")),
            "low": _number(row.get("low")),
            "close": close,
            "volume": _number(row.get("volume")),
            "quality": "final",
            "source_id": SINA_FUTURES,
            "observed_at": now,
        })
    bars.sort(key=lambda bar: bar["ts"])
    return bars


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def _fetch_text(ctx: CollectContext, url: str) -> str | None:
    """Fetch one Sina URL and return the GBK-decoded body.

    Returns ``None`` for a dry-run or conditional ``304`` response.  A non-200
    status and transport failures raise the typed data errors so callers can
    isolate one symbol/batch from the rest of the run.
    """
    result = ctx.http.fetch(
        SINA_FUTURES, url, headers=dict(SINA_HEADERS), accept=SINA_ACCEPT,
    )
    if getattr(result, "dry_run", False) or getattr(result, "not_modified", False):
        return None
    status = int(getattr(result, "status", 0) or 0)
    if status and status != 200:
        raise DataSourceError(f"Sina futures returned HTTP {status} for {url}")
    return _decode_body(result)


def _empty_result(reason: str, **extra: Any) -> dict[str, Any]:
    """Uniform counters payload for collectors with nothing to do."""
    details: dict[str, Any] = {"reason": reason}
    details.update(extra)
    return {
        "stored": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "status": "ok",
        "details": details,
    }


# ---------------------------------------------------------------------------
# collectors
# ---------------------------------------------------------------------------


def collect_quotes(ctx: CollectContext) -> dict[str, Any]:
    """Collect batched live quotes plus one provisional daily bar per root.

    Requests are chunked at ``ctx.settings["china_commodity_batch"]`` (default
    40, clamped to 1..80) and each chunk is one governed HTTP request.  Rate
    limit, block and source errors are caught per batch so one bad batch never
    aborts a live run.  A dry run returns the plan without fetching or writing.
    """
    roots = tracked_roots(ctx)
    if not roots:
        return _empty_result("no commodity roots")

    batch_size = _setting_int(
        ctx, "china_commodity_batch", DEFAULT_BATCH_SIZE,
        minimum=MIN_BATCH_SIZE, maximum=MAX_BATCH_SIZE,
    )
    batches = (len(roots) + batch_size - 1) // batch_size
    now = ctx.now_iso()

    if bool(ctx.settings.get("dry_run")):
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": {
                "dry_run": True,
                "reason": "dry run",
                "planned": len(roots),
                "batch_size": batch_size,
                "batches": batches,
            },
        }

    quote_rows: list[dict[str, Any]] = []
    bar_rows: list[dict[str, Any]] = []
    unknown_symbols: set[str] = set()
    missing_symbols: list[str] = []
    unusable_symbols: list[str] = []
    stale_symbols: list[str] = []
    errors: list[dict[str, Any]] = []
    skipped = 0
    today = ctx.today()

    for chunk in _chunks(roots, batch_size):
        url = quote_url([root["provider_symbol"] for root in chunk])
        try:
            body = _fetch_text(ctx, url)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            skipped += len(chunk)
            errors.append({
                "reason": "rate_limited",
                "series": [root["series_id"] for root in chunk],
                "error": _text(error)[:200],
            })
            continue
        except DataSourceError as error:
            skipped += len(chunk)
            errors.append({
                "reason": "source_unavailable",
                "series": [root["series_id"] for root in chunk],
                "error": _text(error)[:200],
            })
            continue
        if body is None:
            skipped += len(chunk)
            errors.append({
                "reason": "no payload",
                "series": [root["series_id"] for root in chunk],
            })
            continue

        parsed = parse_quote_text(body)
        if not parsed and body.strip():
            # A non-empty body without a single quote line is a broken payload
            # (for example an HTML block page), not a market-wide empty result.
            skipped += len(chunk)
            errors.append({
                "reason": "parse_error",
                "series": [root["series_id"] for root in chunk],
                "error": "unparseable quote payload",
            })
            continue
        parsed_by_symbol: dict[str, dict[str, Any]] = {}
        requested = {root["provider_symbol"] for root in chunk}
        for quote in parsed:
            symbol = _text(quote.get("symbol")).upper()
            parsed_by_symbol[symbol] = quote
            if symbol not in requested:
                unknown_symbols.add(symbol)
        for root in chunk:
            quote = parsed_by_symbol.get(root["provider_symbol"])
            if quote is None:
                skipped += 1
                missing_symbols.append(root["series_id"])
                continue
            rows = build_quote_rows([quote], [root], now)
            if not rows:
                # The endpoint answered, but without a usable last price (for
                # example a delisted/renamed contract -> empty quote line).
                skipped += 1
                unusable_symbols.append(root["series_id"])
                continue
            quote_date = _text(quote.get("date"))[:10]
            try:
                age_days = (date.fromisoformat(today) - date.fromisoformat(quote_date)).days
            except ValueError:
                age_days = None
            if age_days is None or age_days > MAX_QUOTE_AGE_DAYS or age_days < -1:
                # The public gateway sometimes serves a frozen snapshot; do not
                # let an old price overwrite the persisted EOD close.
                skipped += 1
                stale_symbols.append(root["series_id"])
                ctx.warehouse.delete_quote_latest(root["series_id"])
                ctx.warehouse.delete_bar(root["series_id"], "1d", today, quality="provisional")
                continue
            quote_rows.extend(rows)
            existing = ctx.warehouse.latest_bar(root["series_id"], "1d")
            if not (
                existing
                and str(existing.get("ts") or "")[:10] == today
                and str(existing.get("quality") or "") == "final"
            ):
                bar_rows.extend(build_provisional_bars([quote], [root], now))

    quotes_stored = ctx.warehouse.upsert_quote_latest(quote_rows)
    bars_stored = ctx.warehouse.upsert_bars(bar_rows, SINA_FUTURES)
    LOGGER.debug(
        "sina futures quotes: %d root(s) in %d batch(es), %d quote(s), %d bar(s), %d skipped",
        len(roots), batches, quotes_stored, bars_stored, skipped,
    )
    details: dict[str, Any] = {
        "quotes": int(quotes_stored),
        "bars": int(bars_stored),
        "skipped": skipped,
        "unknown_symbols": sorted(unknown_symbols),
        "roots": len(roots),
        "batches": batches,
        "batch_size": batch_size,
    }
    if missing_symbols:
        details["missing_symbols"] = missing_symbols
    if unusable_symbols:
        details["unusable_symbols"] = unusable_symbols
    if stale_symbols:
        details["stale_symbols"] = stale_symbols
    if errors:
        details["errors"] = errors
    if not quote_rows:
        details["reason"] = "no quote data"
    return {
        "stored": int(quotes_stored) + int(bars_stored),
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": "partial" if errors else "ok",
        "details": details,
    }


def collect_eod(ctx: CollectContext) -> dict[str, Any]:
    """Collect daily history bars for tracked commodity roots.

    At most ``ctx.settings["china_commodity_eod_max_roots"]`` roots (default 50,
    clamped to 1..80) are fetched sequentially; the rest are reported as
    ``deferred`` for the next run.  A rate-limit/block answer stops the run
    immediately with ``status="partial"`` and ``details["stopped"]`` set, while
    a single parse/HTTP failure is recorded and skipped -- the job never fails
    because of one symbol.  A dry run returns the plan without fetching/writing.
    """
    roots = tracked_roots(ctx)
    if not roots:
        return _empty_result("no commodity roots")

    cap = _setting_int(
        ctx, "china_commodity_eod_max_roots", DEFAULT_EOD_MAX_ROOTS,
        minimum=MIN_EOD_MAX_ROOTS, maximum=MAX_EOD_MAX_ROOTS,
    )
    selected = roots[:cap]
    deferred = roots[cap:]
    now = ctx.now_iso()

    if bool(ctx.settings.get("dry_run")):
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": {
                "dry_run": True,
                "reason": "dry run",
                "planned": len(selected),
                "roots": len(roots),
                "deferred": [root["series_id"] for root in deferred],
            },
        }

    stored = 0
    skipped = 0
    processed = 0
    failed: list[dict[str, Any]] = []
    empty: list[dict[str, Any]] = []
    stopped = ""
    unprocessed: list[str] = []

    for index, root in enumerate(selected):
        url = daily_url(root["provider_symbol"])
        try:
            body = _fetch_text(ctx, url)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            stopped = "rate_limited"
            skipped += 1
            failed.append({
                "series_id": root["series_id"],
                "reason": "rate_limited",
                "error": _text(error)[:200],
            })
            unprocessed = [item["series_id"] for item in selected[index + 1:]]
            break
        except DataSourceError as error:
            skipped += 1
            failed.append({
                "series_id": root["series_id"],
                "reason": "source_unavailable",
                "error": _text(error)[:200],
            })
            continue
        if body is None:
            skipped += 1
            empty.append({"series_id": root["series_id"], "reason": "no payload"})
            continue
        try:
            rows = parse_daily_jsonp(body)
        except ValueError as error:
            skipped += 1
            failed.append({
                "series_id": root["series_id"],
                "reason": "parse_error",
                "error": _text(error)[:200],
            })
            continue
        bars = build_daily_bar_rows(rows, root["series_id"], now)
        if not bars:
            skipped += 1
            empty.append({"series_id": root["series_id"], "reason": "no bars"})
            continue
        stored += ctx.warehouse.upsert_bars(bars, SINA_FUTURES)
        processed += 1

    if deferred:
        # Deferring the tail past the per-run cap is normal budget behaviour,
        # not a failure: it is counted as skipped and reported for the next run.
        skipped += len(deferred)
    # Chunk/transport/parse failures degrade the run to ``partial``; a root the
    # provider simply has no history for is a per-symbol gap, not a run failure.
    status = "partial" if (stopped or failed) else "ok"
    LOGGER.debug(
        "sina futures EOD: %d/%d root(s) processed, %d bar(s) stored, stopped=%s",
        processed, len(selected), stored, stopped or "no",
    )
    details: dict[str, Any] = {
        "bars": int(stored),
        "processed": processed,
        "roots": len(roots),
        "selected": len(selected),
        "skipped": skipped,
    }
    if deferred:
        details["deferred"] = [root["series_id"] for root in deferred]
    if stopped:
        details["stopped"] = stopped
    if unprocessed:
        details["unprocessed"] = unprocessed
    if failed:
        details["failed"] = failed
    if empty:
        details["empty"] = empty
    if not stored:
        details["reason"] = "no daily data"
    return {
        "stored": int(stored),
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": status,
        "details": details,
    }


__all__ = [
    "DEFAULT_BATCH_SIZE",
    "DEFAULT_EOD_MAX_ROOTS",
    "MAX_BATCH_SIZE",
    "MAX_EOD_MAX_ROOTS",
    "QUOTE_FIELDS",
    "SINA_ACCEPT",
    "SINA_BASE_URL",
    "SINA_FUTURES",
    "SINA_HEADERS",
    "SINA_HISTORY_BASE_URL",
    "SINA_HISTORY_PATH",
    "SINA_QUOTE_URL",
    "SINA_REFERER",
    "build_daily_bar_rows",
    "build_provisional_bars",
    "build_quote_rows",
    "collect_eod",
    "collect_quotes",
    "daily_url",
    "parse_daily_jsonp",
    "parse_quote_text",
    "quote_url",
    "tracked_roots",
]
