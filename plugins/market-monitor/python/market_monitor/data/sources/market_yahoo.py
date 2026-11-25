"""Yahoo Finance collectors for live quotes, index/commodity and EOD bars.

This module is the only place in the collection layer that talks to Yahoo
Finance.  Every request goes through the shared polite HTTP client
(``ctx.http.fetch``), so the rate governor, budgets, conditional GETs and retry
policy apply uniformly; collectors never open a socket themselves.

Endpoints (public, no API key required; probed on this machine 2026-11-25)::

    GET /v8/finance/spark?symbols=AAPL,^GSPC&range=1d&interval=5m
    GET /v8/finance/chart/AAPL?range=1mo&interval=1d&includePrePost=false

The spark endpoint is preferred for live quotes because one request covers a
whole batch of series.  Its response has changed shape several times, so the
parser accepts both the list form (``spark.result`` is a list of
``{symbol, response}`` objects) and the mapping form (``spark.result`` keyed by
symbol), and tolerates a ``response`` that is either a list or a bare chart
record.  See :func:`_spark_records` for the accepted variants.

Timestamps follow ``docs/DATA.md``: ISO-8601 UTC with ``Z`` for quotes and
intraday bars, ``YYYY-MM-DD`` for daily bars.  A daily bar for the current UTC
date is stored with ``quality="provisional"``; older bars are ``"final"``.

The tracked universe is never fetched: it arrives fully resolved in
``ctx.settings["tracked_series"]`` (the service owns symbol resolution)::

    [{"series_id": "INS:XNAS:AAPL", "kind": "instrument",
      "provider_symbol": "AAPL", "currency": "USD"}, ...]
"""

from __future__ import annotations

import json
import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Iterator, Sequence

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import YAHOO

LOGGER = logging.getLogger("market_monitor.data.sources.market_yahoo")

UTC = timezone.utc

#: Public Yahoo Finance base URL (kept as one constant so the endpoints are easy
#: to audit; tests inject a fake HTTP client instead of rewriting it).
YAHOO_BASE_URL = "https://query1.finance.yahoo.com"
SPARK_PATH = "/v8/finance/spark"
CHART_PATH = "/v8/finance/chart"
SPARK_RANGE = "1d"
SPARK_INTERVAL = "5m"
#: Number of sparkline closes kept on the cache hand-off quote.
SPARK_CLOSE_POINTS = 30

DEFAULT_LIVE_BATCH_SIZE = 20
DEFAULT_EOD_MAX_SERIES_PER_RUN = 120
#: Minimum stored daily bars before a "bar exists today" skip is trusted; below
#: this a series is still backfilled with the full range.
DEFAULT_EOD_MIN_HISTORY_BARS = 60
#: Keep this many hourly Yahoo requests free for live quotes while backfilling.
DEFAULT_EOD_HOURLY_RESERVE = 40
DEFAULT_EOD_RANGE = "1y"
INCREMENTAL_EOD_RANGE = "1mo"

#: ``kind`` values the service may put on a tracked series.
SERIES_KINDS = ("instrument", "index", "commodity")


# ---------------------------------------------------------------------------
# small parsing helpers
# ---------------------------------------------------------------------------


def _number(value: Any) -> float | None:
    """Return ``value`` as a finite float, or ``None`` for null/invalid values."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _datetime_from_epoch(value: Any) -> datetime | None:
    """Convert an epoch-second value to an aware UTC datetime."""
    number = _number(value)
    if number is None:
        return None
    try:
        return datetime.fromtimestamp(number, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _iso_from_epoch(value: Any) -> str | None:
    """Convert an epoch-second value to ``YYYY-MM-DDTHH:MM:SSZ``."""
    moment = _datetime_from_epoch(value)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ") if moment is not None else None


def _symbol_key(value: Any) -> str:
    """Normalise a provider symbol for response lookup (decoded, upper-case)."""
    text = str(value or "").strip()
    if not text:
        return ""
    return urllib.parse.unquote(text).upper()


def _first_number(*values: Any) -> float | None:
    """First finite number in ``values``."""
    for value in values:
        number = _number(value)
        if number is not None:
            return number
    return None


def _number_field(record: dict[str, Any], meta: dict[str, Any], *names: str) -> float | None:
    """Read the first numeric field from ``meta`` or the record root."""
    return _first_number(*(meta.get(name) for name in names), *(record.get(name) for name in names))


def _record_series(record: dict[str, Any]) -> dict[str, list[Any]]:
    """Extract the timestamp and OHLCV arrays of a spark/chart record.

    Both endpoints wrap the arrays in ``indicators.quote[0]``; the older spark
    variant put them at the record root, so both are accepted.  Arrays are
    padded by position (not by index), exactly like the existing provider.
    """
    timestamps = record.get("timestamp")
    if not isinstance(timestamps, list):
        timestamps = record.get("timestamps")
    if not isinstance(timestamps, list):
        timestamps = []
    indicators = record.get("indicators")
    indicators = indicators if isinstance(indicators, dict) else {}
    quotes = indicators.get("quote")
    first: dict[str, Any] = (
        quotes[0] if isinstance(quotes, list) and quotes and isinstance(quotes[0], dict) else {}
    )

    def column(name: str) -> list[Any]:
        values = first.get(name)
        if isinstance(values, list):
            return list(values)
        direct = record.get(name)
        return list(direct) if isinstance(direct, list) else []

    return {
        "timestamp": list(timestamps),
        "open": column("open"),
        "high": column("high"),
        "low": column("low"),
        "close": column("close"),
        "volume": column("volume"),
    }


def _at(values: list[Any], index: int) -> float | None:
    """Return the finite float at ``index`` or ``None`` when out of range."""
    if index < 0 or index >= len(values):
        return None
    return _number(values[index])


def _record_symbol(record: dict[str, Any]) -> str:
    """Best-effort symbol carried inside a spark/chart record."""
    symbol = _symbol_key(record.get("symbol"))
    if symbol:
        return symbol
    meta = record.get("meta")
    if isinstance(meta, dict):
        return _symbol_key(meta.get("symbol"))
    return ""


def _spark_record(value: Any) -> dict[str, Any] | None:
    """Unwrap one entry of a spark response into a chart-like record.

    Accepted wrappers: ``{"response": [record, ...]}``,
    ``{"response": record}``, a bare chart record, or a one-element list of
    those (some deployments key ``spark.result`` by symbol and give a list).
    """
    if isinstance(value, list):
        for item in value:
            record = _spark_record(item)
            if record is not None:
                return record
        return None
    if not isinstance(value, dict):
        return None
    if "response" in value and value.get("response") is not None:
        return _spark_record(value.get("response"))
    if any(key in value for key in ("meta", "timestamp", "timestamps", "indicators", "close")):
        return value
    return None


def _spark_records(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Map provider symbol -> chart-like record from a spark payload.

    Handled variants::

        {"spark": {"result": [{"symbol": "AAPL", "response": [record]}]}}
        {"spark": {"result": [{"symbol": "AAPL", "response": record}]}}
        {"spark": {"result": {"AAPL": {"response": [record]}}}}
        {"spark": {"result": {"AAPL": record}}}            # record keyed by symbol
        {"spark": {"results": ...}}                        # older spelling
        {"spark": {"AAPL": record, "error": null}}         # spark keyed by symbol
        {"spark": {"result": null, "error": {...}}}        # error only -> no records

    ``record`` is the chart-style object with ``meta``, ``timestamp`` and
    ``indicators`` (or, in the oldest spark format, root-level ``close`` etc.).
    """
    if not isinstance(payload, dict):
        return {}
    if "spark" not in payload:
        # Current Yahoo responses key the top-level object by symbol, e.g.
        # ``{"AAPL": {"timestamp": [...], "close": [...]}, "MSFT": {...}}``.
        root_records: dict[str, dict[str, Any]] = {}
        for key, value in payload.items():
            record = _spark_record(value)
            if record is None:
                continue
            symbol = _symbol_key(key) or _record_symbol(record)
            if symbol:
                root_records[symbol] = record
        return root_records
    spark = payload.get("spark")
    if not isinstance(spark, dict):
        return {}
    if spark.get("error"):
        LOGGER.info("Yahoo spark reported an error: %s", spark.get("error"))
    raw: Any = None
    for key in ("result", "results"):
        if key in spark:
            raw = spark[key]
            break
    if raw is None:
        # Some deployments key the spark object directly by symbol.
        raw = {key: value for key, value in spark.items() if key != "error"}
    records: dict[str, dict[str, Any]] = {}
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            record = _spark_record(item)
            if record is None:
                continue
            symbol = _symbol_key(item.get("symbol")) or _record_symbol(record)
            if symbol:
                records[symbol] = record
    elif isinstance(raw, dict):
        for key, item in raw.items():
            record = _spark_record(item)
            if record is None:
                continue
            symbol = _symbol_key(item.get("symbol")) if isinstance(item, dict) else ""
            symbol = symbol or _record_symbol(record) or _symbol_key(key)
            if symbol:
                records[symbol] = record
    return records


# ---------------------------------------------------------------------------
# configuration from settings
# ---------------------------------------------------------------------------


def normalise_series(raw: Any) -> dict[str, Any] | None:
    """Validate one ``tracked_series`` entry, returning only the known fields."""
    if not isinstance(raw, dict):
        return None
    series_id = str(raw.get("series_id") or "").strip()
    if not series_id:
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    if kind not in SERIES_KINDS:
        return None
    return {
        "series_id": series_id,
        "kind": kind,
        "provider_symbol": str(raw.get("provider_symbol") or "").strip(),
        "currency": str(raw.get("currency") or "").strip().upper(),
    }


def tracked_series(ctx: CollectContext) -> list[dict[str, Any]]:
    """Resolved tracked universe from ``ctx.settings["tracked_series"]``.

    The list is sorted by ``series_id`` so batched requests and the EOD cursor
    are deterministic across runs.  Invalid entries are logged and dropped; a
    missing or empty setting yields an empty list.
    """
    raw = ctx.settings.get("tracked_series")
    if not isinstance(raw, (list, tuple)) or not raw:
        return []
    series: list[dict[str, Any]] = []
    for entry in raw:
        normalised = normalise_series(entry)
        if normalised is None:
            LOGGER.warning("dropping invalid tracked_series entry: %r", entry)
            continue
        series.append(normalised)
    series.sort(key=lambda item: item["series_id"])
    return series


def _setting_int(ctx: CollectContext, key: str, default: int, *, maximum: int | None = None) -> int:
    """Read a positive integer setting, falling back to ``default``."""
    raw = ctx.settings.get(key, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = default
    if value < 1:
        value = default
    if maximum is not None:
        value = min(value, maximum)
    return value


def _cursor(raw: Any, total: int) -> int:
    """Normalise a persisted EOD cursor into ``[0, total)``."""
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 0
    if total <= 0:
        return 0
    return max(0, value) % total


def _chunks(items: Sequence[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    """Yield consecutive chunks of at most ``size`` items."""
    for start in range(0, len(items), size):
        yield list(items[start:start + size])


# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------


def spark_url(symbols: Sequence[str]) -> str:
    """Batch quote URL for a list of provider symbols."""
    encoded = ",".join(urllib.parse.quote(str(symbol), safe="") for symbol in symbols)
    return (
        f"{YAHOO_BASE_URL}{SPARK_PATH}?symbols={encoded}"
        f"&range={SPARK_RANGE}&interval={SPARK_INTERVAL}"
    )


def chart_url(provider_symbol: str, range_name: str, interval: str) -> str:
    """Chart URL for one provider symbol."""
    symbol = urllib.parse.quote(str(provider_symbol), safe="")
    return (
        f"{YAHOO_BASE_URL}{CHART_PATH}/{symbol}"
        f"?range={urllib.parse.quote(str(range_name), safe='')}"
        f"&interval={urllib.parse.quote(str(interval), safe='')}"
        "&includePrePost=false"
    )


def _fetch_json(ctx: CollectContext, url: str) -> dict[str, Any] | None:
    """Fetch one Yahoo URL and decode the JSON object.

    Returns ``None`` for a dry-run or conditional ``304`` response (nothing to
    parse).  Transport failures propagate as the typed data errors from the
    polite client; malformed payloads raise :class:`DataSourceError`.
    """
    result = ctx.http.fetch(YAHOO, url)
    if getattr(result, "dry_run", False) or getattr(result, "not_modified", False):
        return None
    try:
        payload = json.loads(result.text())
    except (TypeError, ValueError) as error:
        raise DataSourceError(f"Yahoo Finance returned invalid JSON for {url}") from error
    if not isinstance(payload, dict):
        raise DataSourceError(f"Yahoo Finance returned an unexpected payload for {url}")
    return payload


# ---------------------------------------------------------------------------
# live quotes (spark)
# ---------------------------------------------------------------------------


def _quote_from_record(
    series: dict[str, Any],
    record: dict[str, Any],
    now_iso: str,
) -> dict[str, Any] | None:
    """Turn one spark chart record into a cache hand-off quote.

    ``price`` is the last non-null close (falling back to
    ``regularMarketPrice``); ``prev_close`` comes from the response metadata when
    present, otherwise from the second-to-last close.  Returns ``None`` when no
    price can be derived.
    """
    arrays = _record_series(record)
    meta = record.get("meta") if isinstance(record.get("meta"), dict) else {}
    closes = [_number(value) for value in arrays["close"]]
    valid_closes = [value for value in closes if value is not None]
    price = valid_closes[-1] if valid_closes else _number_field(record, meta, "regularMarketPrice")
    if price is None:
        return None
    prev_close = _number_field(
        record, meta, "chartPreviousClose", "previousClose", "regularMarketPreviousClose",
    )
    if prev_close is None and len(valid_closes) >= 2:
        prev_close = valid_closes[-2]
    change_pct: float | None = None
    if prev_close:
        change_pct = (price - prev_close) / prev_close * 100.0
    volume = _number_field(record, meta, "regularMarketVolume")
    if volume is None:
        volumes = [_number(value) for value in arrays["volume"]]
        valid_volumes = [value for value in volumes if value is not None]
        volume = valid_volumes[-1] if valid_volumes else None
    ts = _iso_from_epoch(arrays["timestamp"][-1]) if arrays["timestamp"] else None
    if ts is None:
        ts = _iso_from_epoch(meta.get("regularMarketTime")) or now_iso
    currency = series["currency"] or str(meta.get("currency") or record.get("currency") or "USD")
    return {
        "series_id": series["series_id"],
        "provider_symbol": series["provider_symbol"],
        "price": price,
        "prev_close": prev_close,
        "change_pct": change_pct,
        "volume": volume,
        "currency": currency,
        "ts": ts,
        "spark": valid_closes[-SPARK_CLOSE_POINTS:],
    }


def _quote_row(quote: dict[str, Any], source_id: str) -> dict[str, Any]:
    """Build a ``market_quote_latest`` / observation row from a quote dict."""
    return {
        "series_id": quote["series_id"],
        "ts": quote["ts"],
        "price": quote["price"],
        "prev_close": quote["prev_close"],
        "change_pct": quote["change_pct"],
        "change_type": "percent",
        "volume": quote["volume"],
        "currency": quote["currency"],
        "source_id": source_id,
    }


def fetch_spark_quotes(ctx: CollectContext, series: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Fetch and store batch spark quotes for ``series``.

    Requests are chunked at ``ctx.settings["live_batch_size"]`` (default 20) and
    each chunk is a single HTTP request.  Rate-limit, circuit and source errors
    are caught per request so one bad batch never aborts a live run; series with
    no usable payload are counted as ``skipped``.

    Returns a result dict with ``quotes`` (cache hand-off payloads, including the
    last :data:`SPARK_CLOSE_POINTS` closes), the rows that were written,
    per-counter totals and diagnostics.  Observation rows reuse the source
    timestamp (not the poll time), so repeated polls that see the same source
    bucket are de-duplicated by the warehouse instead of inflating the series.
    """
    usable = [item for item in series if item.get("provider_symbol")]
    missing_provider_symbol = sorted(
        item["series_id"] for item in series if not item.get("provider_symbol")
    )
    batch_size = _setting_int(ctx, "live_batch_size", DEFAULT_LIVE_BATCH_SIZE, maximum=200)
    now_iso = ctx.now_iso()
    quotes: list[dict[str, Any]] = []
    latest_rows: list[dict[str, Any]] = []
    observation_rows: list[dict[str, Any]] = []
    missing_symbols: list[str] = []
    errors: list[dict[str, Any]] = []
    skipped = len(missing_provider_symbol)
    batches = 0

    for chunk in _chunks(usable, batch_size):
        batches += 1
        url = spark_url([item["provider_symbol"] for item in chunk])
        try:
            payload = _fetch_json(ctx, url)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            skipped += len(chunk)
            errors.append({
                "reason": "rate_limited",
                "series": [item["series_id"] for item in chunk],
                "error": str(error)[:200],
            })
            continue
        except DataSourceError as error:
            skipped += len(chunk)
            errors.append({
                "reason": "source_unavailable",
                "series": [item["series_id"] for item in chunk],
                "error": str(error)[:200],
            })
            continue
        if payload is None:
            skipped += len(chunk)
            errors.append({
                "reason": "no payload",
                "series": [item["series_id"] for item in chunk],
            })
            continue
        records = _spark_records(payload)
        for item in chunk:
            record = records.get(_symbol_key(item["provider_symbol"]))
            if record is None:
                missing_symbols.append(item["series_id"])
                skipped += 1
                continue
            quote = _quote_from_record(item, record, now_iso)
            if quote is None:
                skipped += 1
                errors.append({"reason": "no price", "series": [item["series_id"]]})
                continue
            quotes.append(quote)
            latest_rows.append(_quote_row(quote, YAHOO))
            observation_rows.append(_quote_row(quote, YAHOO))

    stored = ctx.warehouse.upsert_quote_latest(latest_rows)
    observations = ctx.warehouse.insert_quote_observations(observation_rows)
    duplicates = max(0, len(observation_rows) - observations)
    LOGGER.debug(
        "yahoo spark: %d series in %d batch(es), %d quote(s), %d skipped",
        len(series), batches, stored, skipped,
    )
    return {
        "quotes": quotes,
        "latest_rows": latest_rows,
        "observation_rows": observation_rows,
        "stored": stored,
        "observations": observations,
        "duplicates": duplicates,
        "skipped": skipped,
        "batches": batches,
        "missing_provider_symbol": missing_provider_symbol,
        "missing_symbols": missing_symbols,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# EOD / history bars (chart)
# ---------------------------------------------------------------------------


def fetch_chart_bars(
    ctx: CollectContext,
    series: dict[str, Any],
    range_name: str = "1mo",
    interval: str = "1d",
) -> list[dict[str, Any]]:
    """Fetch OHLCV bars for one tracked series from the chart endpoint.

    Rows with a null close are dropped.  For ``interval="1d"`` the timestamp is
    ``YYYY-MM-DD`` (UTC trading date); an intraday interval keeps the ISO UTC
    timestamp.  Bars dated today are marked provisional, older bars final.

    A symbol Yahoo answers with ``chart.error`` or an empty result yields an
    empty list (a per-symbol skip); transport and payload failures raise
    :class:`DataSourceError` (or the governor's typed errors) for the caller to
    catch per symbol.
    """
    provider_symbol = str(series.get("provider_symbol") or "").strip()
    if not provider_symbol:
        return []
    url = chart_url(provider_symbol, range_name, interval)
    payload = _fetch_json(ctx, url)
    if payload is None:
        return []
    chart = payload.get("chart")
    if not isinstance(chart, dict):
        raise DataSourceError(
            f"Yahoo Finance returned an unexpected chart payload for {provider_symbol}"
        )
    if chart.get("error"):
        LOGGER.info(
            "Yahoo chart error for %s: %s", provider_symbol, chart.get("error"),
        )
        return []
    results = chart.get("result")
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        LOGGER.info("Yahoo chart returned no result for %s", provider_symbol)
        return []
    arrays = _record_series(results[0])
    if not arrays["timestamp"]:
        LOGGER.info("Yahoo chart returned no timestamps for %s", provider_symbol)
        return []
    today = ctx.today()
    rows: list[dict[str, Any]] = []
    for index, epoch_value in enumerate(arrays["timestamp"]):
        close = _at(arrays["close"], index)
        if close is None:
            continue
        moment = _datetime_from_epoch(epoch_value)
        if moment is None:
            continue
        day = moment.strftime("%Y-%m-%d")
        ts = day if interval == "1d" else moment.strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append({
            "series_id": series["series_id"],
            "interval": interval,
            "ts": ts,
            "open": _at(arrays["open"], index),
            "high": _at(arrays["high"], index),
            "low": _at(arrays["low"], index),
            "close": close,
            "volume": _at(arrays["volume"], index),
            "quality": "provisional" if day == today else "final",
        })
    LOGGER.debug("yahoo chart: %s %s %s -> %d bar(s)", provider_symbol, range_name, interval, len(rows))
    return rows


# ---------------------------------------------------------------------------
# collectors
# ---------------------------------------------------------------------------


def _empty_result(reason: str) -> dict[str, Any]:
    """Uniform counters payload for collectors with nothing to do."""
    return {
        "stored": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "details": {"reason": reason},
    }


def collect_live(ctx: CollectContext) -> dict[str, Any]:
    """Collect batched live quotes for every tracked series.

    Writes ``market_quote_latest`` plus append-only quote observations and
    returns the hand-off quotes in ``details["quotes"]`` so the service can
    hydrate its disposable cache without another request.  A dry run only
    reports the planned batch count and touches neither network nor warehouse.
    """
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    if bool(ctx.settings.get("dry_run")):
        usable = sum(1 for item in tracked if item["provider_symbol"])
        batch_size = _setting_int(ctx, "live_batch_size", DEFAULT_LIVE_BATCH_SIZE, maximum=200)
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "details": {
                "reason": "dry run",
                "planned_series": usable,
                "batch_size": batch_size,
                "batches": (usable + batch_size - 1) // batch_size if usable else 0,
            },
        }
    result = fetch_spark_quotes(ctx, tracked)
    details: dict[str, Any] = {
        "quotes": result["quotes"],
        "batches": result["batches"],
        "observations": result["observations"],
    }
    if result["missing_provider_symbol"]:
        details["missing_provider_symbol"] = result["missing_provider_symbol"]
    if result["missing_symbols"]:
        details["missing_symbols"] = result["missing_symbols"]
    if result["errors"]:
        details["errors"] = result["errors"]
    if not result["quotes"]:
        details["reason"] = "no quote data"
    # Per-symbol gaps and request-level failures still produce a useful run, so
    # the run record says ``partial`` instead of failing the whole job.
    partial = bool(result["errors"] or result["missing_symbols"])
    return {
        "stored": result["stored"],
        "updated": 0,
        "duplicates": result["duplicates"],
        "skipped": result["skipped"],
        "status": "partial" if partial else "ok",
        "details": details,
    }


def _collect_bars(ctx: CollectContext, series_list: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Cursor-based bar backfill shared by the EOD, index and commodity jobs.

    At most ``eod_max_series_per_run`` series are fetched per run (default 120).
    The persisted ``job_state["cursor"]`` advances by the number of series
    attempted and wraps modulo the universe size, so repeated runs cover the
    whole list without any series being processed twice per cycle.  A fresh
    series is backfilled with ``eod_range`` (default ``1y``); a series that
    already has bars only refreshes ``1mo``.  Series whose latest stored daily
    bar is the current UTC date are skipped (nothing new to collect today).
    """
    if not series_list:
        return _empty_result("no tracked series")
    cap = _setting_int(
        ctx, "eod_max_series_per_run", DEFAULT_EOD_MAX_SERIES_PER_RUN, maximum=2000,
    )
    total = len(series_list)
    cursor = _cursor(ctx.job_state.get("cursor"), total)
    selected = list(series_list[cursor:cursor + cap])
    if not selected:
        cursor = 0
        selected = list(series_list[:cap])
    if bool(ctx.settings.get("dry_run")):
        # Planning only: no fetch and, crucially, no cursor advance.
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "details": {
                "reason": "dry run",
                "planned": len(selected),
                "series_total": total,
                "cursor": cursor,
            },
        }
    full_range = str(ctx.settings.get("eod_range") or DEFAULT_EOD_RANGE)
    today = ctx.today()
    stored = 0
    skipped = 0
    processed = 0
    skipped_today: list[str] = []
    missing_provider_symbol: list[str] = []
    failed: list[dict[str, Any]] = []
    budget_reserve_hit = False
    reserve = _setting_int(ctx, "eod_hourly_reserve", DEFAULT_EOD_HOURLY_RESERVE, maximum=1000)

    for series in selected:
        processed += 1
        series_id = series["series_id"]
        if budget_reserve_hit:
            skipped += 1
            continue
        governor = getattr(ctx.http, "governor", None)
        if governor is not None:
            try:
                remaining_hour = int(governor.remaining(YAHOO).get("remaining_hour", 10**9))
            except Exception:  # noqa: BLE001 - governor diagnostics are optional
                remaining_hour = 10**9
            if remaining_hour <= reserve:
                budget_reserve_hit = True
                skipped += 1
                continue
        if not series["provider_symbol"]:
            skipped += 1
            missing_provider_symbol.append(series_id)
            continue
        latest = ctx.warehouse.latest_bar_ts(series_id, "1d")
        min_history = _setting_int(ctx, "eod_min_history_bars", DEFAULT_EOD_MIN_HISTORY_BARS, maximum=1000)
        history_count = len(ctx.warehouse.get_bars(series_id, "1d", limit=min_history))
        has_history = latest is not None and history_count >= min_history
        if latest and str(latest)[:10] == today and has_history:
            skipped += 1
            skipped_today.append(series_id)
            continue
        range_name = INCREMENTAL_EOD_RANGE if has_history else full_range
        try:
            bars = fetch_chart_bars(ctx, series, range_name, "1d")
        except (SourceRateLimitedError, SourceBlockedError) as error:
            skipped += 1
            failed.append({
                "series_id": series_id,
                "reason": "rate_limited",
                "error": str(error)[:200],
            })
            continue
        except DataSourceError as error:
            skipped += 1
            failed.append({
                "series_id": series_id,
                "reason": "source_unavailable",
                "error": str(error)[:200],
            })
            continue
        if not bars:
            skipped += 1
            failed.append({"series_id": series_id, "reason": "no bars"})
            continue
        stored += ctx.warehouse.upsert_bars(bars, YAHOO)

    next_cursor = (cursor + processed) % total if total else 0
    LOGGER.debug(
        "yahoo bars: %d/%d series processed, %d bar(s) stored, cursor -> %d",
        processed, total, stored, next_cursor,
    )
    details: dict[str, Any] = {
        "processed": processed,
        "series_total": total,
        "next_cursor": next_cursor,
    }
    if skipped_today:
        details["skipped_today"] = skipped_today
    if missing_provider_symbol:
        details["missing_provider_symbol"] = missing_provider_symbol
    if failed:
        details["failed"] = failed
    if budget_reserve_hit:
        details["budget_reserve_hit"] = True
    return {
        "stored": stored,
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": "partial" if failed else "ok",
        "details": details,
        "job_state": {"cursor": next_cursor},
    }


def collect_eod(ctx: CollectContext) -> dict[str, Any]:
    """Daily bar job for every tracked instrument, index and commodity."""
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    return _collect_bars(ctx, tracked)


def collect_indices(ctx: CollectContext) -> dict[str, Any]:
    """Daily index levels for the tracked series of ``kind == "index"``."""
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    indices = [item for item in tracked if item["kind"] == "index"]
    if not indices:
        return _empty_result("no tracked indices")
    return _collect_bars(ctx, indices)


def collect_commodities(ctx: CollectContext) -> dict[str, Any]:
    """Daily bars for tracked series of ``kind == "commodity"``.

    Commodity entries may legitimately have no provider symbol (for example a
    contract month the service could not resolve); those are skipped and listed
    in ``details["missing_provider_symbol"]`` instead of failing the run.
    """
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    commodities = [item for item in tracked if item["kind"] == "commodity"]
    if not commodities:
        return _empty_result("no tracked commodities")
    return _collect_bars(ctx, commodities)


__all__ = [
    "CHART_PATH",
    "DEFAULT_EOD_MAX_SERIES_PER_RUN",
    "DEFAULT_EOD_RANGE",
    "DEFAULT_LIVE_BATCH_SIZE",
    "INCREMENTAL_EOD_RANGE",
    "SERIES_KINDS",
    "SPARK_CLOSE_POINTS",
    "SPARK_PATH",
    "YAHOO_BASE_URL",
    "chart_url",
    "collect_commodities",
    "collect_eod",
    "collect_indices",
    "collect_live",
    "fetch_chart_bars",
    "fetch_spark_quotes",
    "normalise_series",
    "spark_url",
    "tracked_series",
]
