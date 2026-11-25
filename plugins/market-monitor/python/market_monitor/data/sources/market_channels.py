"""Multi-channel market-data collectors (Sina, Tencent, CoinGecko, Frankfurter).

This module is the governed fallback/rotation layer beyond Yahoo Finance: a
backup collector that fills live quotes and end-of-day bars from four public
channels.  Every request goes through the shared polite HTTP client
(``ctx.http.fetch``), so the rate governor, budgets, conditional GETs and retry
policy apply uniformly; collectors never open a socket themselves.

Endpoints (public, no API key; probed on this machine 2026-11-25)::

    GET https://hq.sinajs.cn/list=gb_aapl,rt_hk00700,int_dji,hf_GC,...
    GET https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_AAPL=/
        US_MinKService.getDailyK?symbol=AAPL
    GET https://qt.gtimg.cn/q=usAAPL,hk00700,sh600519
    GET https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usAAPL.OQ,day,,,365,qfq
    GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,...&vs_currencies=usd
        &include_24hr_change=true
    GET https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd
        &days=365&interval=daily
    GET https://api.frankfurter.app/latest?from=EUR&to=USD
    GET https://api.frankfurter.app/2026-11-18..2026-11-24?from=EUR&to=USD

Sina and Tencent require a browser-like ``Referer`` and answer with **GBK**
encoded bodies; the JSON endpoints are UTF-8.  Source ids are the four
constants in :mod:`..specs` (``sina-finance``, ``tencent-finance``,
``coingecko``, ``frankfurter``).

The tracked universe never arrives with the module: it is resolved in
``ctx.settings["tracked_series"]`` by the job wiring (see
:func:`market_yahoo.tracked_series`)::

    [{"series_id": "INS:XNAS:AAPL", "kind": "instrument",
      "provider_symbol": "AAPL", "currency": "USD"}, ...]

Channel coverage:

* **Sina** — US equities/ETFs (``gb_<sym>``), Hong Kong equities
  (``rt_hk<code>``), six blue-chip indices (``int_*``) and five global futures
  (``hf_*``).  It is the primary quote source for everything except A-shares,
  and the primary EOD source for US listings.
* **Tencent** — A-shares (``sh``/``sz``) are served only here; US and HK series
  that Sina missed are retried on Tencent.  It is the EOD source for HK /
  A-share history and the US history fallback.
* **CoinGecko** — spot crypto quotes and one year of daily closes.
* **Frankfurter** — ECB reference FX rates for USD pairs; latest only, so the
  quote carries ``prev_close == price`` and ``change_pct == 0``.

Field layouts below were verified against live payloads.  One note on the Sina
US quote: field 5 carries the session **open** (field 26 is the previous close
in the current gateway response).  :func:`parse_sina_us_fields` reconciles the
reported change (``last - prev_close == change``) to detect either layout, so a
provider-side layout change cannot silently swap open and previous close.

Writes follow ``docs/DATA.md``: quotes land in ``market_quote_latest`` with a
``source_id`` and ``observed_at`` (provider time when parseable, otherwise the
collector clock); daily bars land in ``market_bar`` as ``interval="1d"``.  Rates
are final because a rate is published once per business day.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterator, Sequence

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, parse_iso
from ..specs import COINGECKO, FRANKFURTER, SINA_FINANCE, TENCENT_FINANCE
from .market_yahoo import tracked_series

LOGGER = logging.getLogger("market_monitor.data.sources.market_channels")

UTC = timezone.utc
#: Sina/Tencent report Hong Kong / mainland exchange local time (UTC+8).
PROVIDER_TZ = timezone(timedelta(hours=8))

# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

SINA_BASE_URL = "https://hq.sinajs.cn"
SINA_QUOTE_URL = f"{SINA_BASE_URL}/list="
SINA_US_HISTORY_BASE_URL = "https://stock.finance.sina.com.cn/usstock/api/jsonp.php"
SINA_US_HISTORY_PATH = "/US_MinKService.getDailyK"
SINA_REFERER = "https://finance.sina.com.cn"
SINA_HEADERS = {"Referer": SINA_REFERER}
SINA_ACCEPT = "*/*"

TENCENT_BASE_URL = "https://qt.gtimg.cn"
TENCENT_QUOTE_URL = f"{TENCENT_BASE_URL}/q="
TENCENT_KLINE_BASE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
TENCENT_KLINE_INTERVAL = "day"
TENCENT_REFERER = "https://gu.qq.com"
TENCENT_HEADERS = {"Referer": TENCENT_REFERER}

COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
COINGECKO_IDS_PATH = "/simple/price"
COINGECKO_CHART_PATH = "/coins/{coin_id}/market_chart"
COINGECKO_VS_CURRENCY = "usd"

FRANKFURTER_BASE_URL = "https://api.frankfurter.app"

# ---------------------------------------------------------------------------
# settings defaults (documented in docs/DATA.md / specs.py)
# ---------------------------------------------------------------------------

DEFAULT_QUOTE_LIMIT = 20
MIN_QUOTE_LIMIT = 1
MAX_QUOTE_LIMIT = 40
DEFAULT_SINA_BATCH = 40
MIN_SINA_BATCH = 1
MAX_SINA_BATCH = 80
DEFAULT_EOD_LIMIT = 20
MIN_EOD_LIMIT = 1
MAX_EOD_LIMIT = 40
#: One year of daily history per EOD request (CoinGecko/Frankfurter/Tencent).
EOD_HISTORY_DAYS = 365
#: The Sina US gateway answers with the full archive (~10 000 rows / ~940 KB);
#: only the most recent sessions are written so a daily fallback run cannot
#: rewrite the whole archive every cycle.
SINA_US_MAX_BARS = 400

#: MICs whose listings are served by Sina/Tencent US quote endpoints.
US_MICS = frozenset({"XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"})
HK_MIC = "XHKG"
SHANGHAI_MIC = "XSHG"
SHENZHEN_MIC = "XSHE"
CRYPTO_MIC = "XCRY"
FX_MIC = "XFXS"

#: ``IDX:{code}`` -> Sina ``int_*`` symbol and quote currency.
INDEX_SINA_SYMBOLS = {
    "DJI": "int_dji",
    "IXIC": "int_nasdaq",
    "GSPC": "int_sp500",
    "HSI": "int_hangseng",
    "N225": "int_nikkei",
    "FTSE": "int_ftse",
}
INDEX_CURRENCIES = {
    "DJI": "USD",
    "IXIC": "USD",
    "GSPC": "USD",
    "HSI": "HKD",
    "N225": "JPY",
    "FTSE": "GBP",
}
#: ``XXX=F`` provider roots the Sina global-futures feed serves.
FUTURES_ROOTS = frozenset({"GC", "SI", "HG", "CL", "NG"})
FUTURES_CURRENCY = "USD"

#: ``INS:XCRY:{BASE}-USD`` provider base -> CoinGecko coin id.
COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "DOGE": "dogecoin",
    "ADA": "cardano",
    "BNB": "binancecoin",
    "LTC": "litecoin",
    "DOT": "polkadot",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
    "MATIC": "matic-network",
    "TRX": "tron",
    "SHIB": "shiba-inu",
    "UNI": "uniswap",
}

#: Verified Sina quote field positions (live probe 2026-11-25).
SINA_US_FIELDS = {
    "name": 0,
    "last": 1,
    "change_pct": 2,
    "time": 3,
    "change": 4,
    "open": 5,
    "high": 6,
    "low": 7,
    "week_high_52": 8,
    "week_low_52": 9,
    "volume": 10,
    "prev_close": 26,
    "prev_close_alt": 35,
}
SINA_HK_FIELDS = {
    "name": 1,
    "open": 2,
    "prev_close": 3,
    "high": 4,
    "low": 5,
    "last": 6,
    "change": 7,
    "change_pct": 8,
    "volume": 12,
    "date": 17,
    "time": 18,
}
SINA_INDEX_FIELDS = {"last": 1, "change": 2, "change_pct": 3}
SINA_FUTURES_FIELDS = {
    "last": 0,
    "high": 4,
    "low": 5,
    "time": 6,
    "prev_settle": 7,
    "prev_close": 8,
    "date": 12,
    "name": 13,
}
TENCENT_QUOTE_FIELDS = {
    "status": 0,
    "name": 1,
    "code": 2,
    "last": 3,
    "prev_close": 4,
    "open": 5,
    "volume": 6,
}

#: ``var hq_str_<symbol>="<fields>";`` — one line per requested symbol.
_SINA_QUOTE_LINE = re.compile(r'var\s+hq_str_([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*;?')
#: ``v_<symbol>="<fields>";`` — one line per requested Tencent symbol.
_TENCENT_QUOTE_LINE = re.compile(r'v_([A-Za-z0-9_.]+)\s*=\s*"([^"]*)"\s*;?')
_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_US_SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9.]+$")
_FX_PAIR_PATTERN = re.compile(r"^([A-Z]{3})([A-Z]{3})=X$")


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


def _first_positive(*values: Any) -> float | None:
    """First strictly positive finite number in ``values``."""
    for value in values:
        number = _positive(value)
        if number is not None:
            return number
    return None


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


def _provider_iso(date_text: Any, time_text: Any = "") -> str | None:
    """Convert a Sina/Tencent exchange date+time (UTC+8) into ISO-8601 UTC.

    Accepts ``YYYY-MM-DD`` / ``YYYY/MM/DD`` dates with an optional
    ``HH:MM:SS`` time.  Returns ``None`` when the values are unusable.
    """
    raw_date = _text(date_text).replace("/", "-")
    time_value = _text(time_text)
    if not time_value and " " in raw_date:
        raw_date, _, time_value = raw_date.partition(" ")
    date_value = raw_date[:10]
    if not _DATE_PATTERN.match(date_value):
        return None
    time_value = time_value or "00:00:00"
    try:
        moment = datetime.strptime(f"{date_value} {time_value}", "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return moment.replace(tzinfo=PROVIDER_TZ).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _epoch_ms_iso(value: Any) -> str | None:
    """Convert an epoch-millisecond value to ``YYYY-MM-DD`` (UTC date)."""
    number = _number(value)
    if number is None:
        return None
    try:
        return datetime.fromtimestamp(number / 1000.0, tz=UTC).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError):
        return None


def _instrument_code(series: dict[str, Any]) -> tuple[str, str]:
    """Return ``(mic, code)`` for an ``INS:{mic}:{code}`` series id."""
    parts = _text(series.get("series_id")).split(":")
    if len(parts) >= 3 and parts[0].upper() == "INS":
        return parts[1].upper(), parts[2].upper()
    return "", ""


def _base_symbol(series: dict[str, Any]) -> str:
    """Upper-case provider symbol of a series."""
    return _text(series.get("provider_symbol")).upper()


def _hk_code(symbol: str) -> str:
    """Five-digit Hong Kong code from ``0700.HK`` / ``00700`` style symbols."""
    digits = re.sub(r"[^0-9]", "", _text(symbol))
    if not digits or len(digits) > 5:
        return ""
    return digits.zfill(5)


def _a_share_code(symbol: str) -> str:
    """Six-digit mainland stock code from ``600519.SS`` / ``000001.SZ`` symbols."""
    digits = re.sub(r"[^0-9]", "", _text(symbol))
    return digits if len(digits) == 6 else ""


# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------


def sina_quote_url(symbols: Sequence[str]) -> str:
    """Batch Sina quote URL (``list=gb_aapl,rt_hk00700``)."""
    encoded = ",".join(
        text for text in (_text(symbol) for symbol in symbols) if text
    )
    return f"{SINA_QUOTE_URL}{encoded}"


def sina_us_daily_url(symbol: str) -> str:
    """Sina US daily-history JSONP URL for one ticker."""
    value = _text(symbol).upper()
    quoted = urllib.parse.quote(value, safe="")
    return (
        f"{SINA_US_HISTORY_BASE_URL}/var%20_{value}="
        f"{SINA_US_HISTORY_PATH}?symbol={quoted}"
    )


def tencent_quote_url(symbols: Sequence[str]) -> str:
    """Batch Tencent quote URL (``q=usAAPL,hk00700``)."""
    encoded = ",".join(
        text for text in (_text(symbol) for symbol in symbols) if text
    )
    return f"{TENCENT_QUOTE_URL}{encoded}"


def tencent_kline_url(code: str, bars: int = EOD_HISTORY_DAYS) -> str:
    """Tencent forward-adjusted daily kline URL for one provider code."""
    value = _text(code)
    return (
        f"{TENCENT_KLINE_BASE_URL}?param={value},{TENCENT_KLINE_INTERVAL}"
        f",,,{int(bars)},qfq"
    )


def coingecko_price_url(coin_ids: Sequence[str]) -> str:
    """CoinGecko batch simple-price URL (``ids=bitcoin,ethereum``)."""
    encoded = ",".join(text for text in (_text(value) for value in coin_ids) if text)
    return (
        f"{COINGECKO_BASE_URL}{COINGECKO_IDS_PATH}?ids={encoded}"
        f"&vs_currencies={COINGECKO_VS_CURRENCY}&include_24hr_change=true"
    )


def coingecko_chart_url(coin_id: str, days: int = EOD_HISTORY_DAYS) -> str:
    """CoinGecko daily market-chart URL for one coin id."""
    path = COINGECKO_CHART_PATH.format(
        coin_id=urllib.parse.quote(_text(coin_id), safe="")
    )
    return (
        f"{COINGECKO_BASE_URL}{path}?vs_currency={COINGECKO_VS_CURRENCY}"
        f"&days={int(days)}&interval=daily"
    )


def frankfurter_latest_url(base: str, quotes: Sequence[str]) -> str:
    """Frankfurter latest-rates URL for one base and its quote currencies."""
    targets = ",".join(text for text in (_text(value) for value in quotes) if text)
    return (
        f"{FRANKFURTER_BASE_URL}/latest?from={_text(base).upper()}"
        f"&to={targets}"
    )


def frankfurter_series_url(base: str, quote: str, start: str, end: str) -> str:
    """Frankfurter time-series URL for one pair and inclusive date range."""
    return (
        f"{FRANKFURTER_BASE_URL}/{_text(start)}..{_text(end)}"
        f"?from={_text(base).upper()}&to={_text(quote).upper()}"
    )


# ---------------------------------------------------------------------------
# series classification / request planning
# ---------------------------------------------------------------------------


def _index_sina_symbol(series: dict[str, Any]) -> str | None:
    """Sina ``int_*`` symbol for a tracked index series, if covered."""
    series_id = _text(series.get("series_id")).upper()
    code = series_id.split(":", 1)[1] if series_id.startswith("IDX:") else ""
    if not code:
        code = _base_symbol(series).lstrip("^")
    return INDEX_SINA_SYMBOLS.get(code)


def _index_currency(series: dict[str, Any]) -> str:
    """Quote currency for a tracked index series."""
    series_id = _text(series.get("series_id")).upper()
    code = series_id.split(":", 1)[1] if series_id.startswith("IDX:") else ""
    currency = INDEX_CURRENCIES.get(code) or _text(series.get("currency")).upper()
    return currency or "USD"


def _futures_sina_symbol(series: dict[str, Any]) -> str | None:
    """Sina ``hf_*`` symbol for a tracked global-futures root, if covered."""
    root = _base_symbol(series).replace("=F", "").strip("^")
    if not root:
        series_id = _text(series.get("series_id")).upper()
        if series_id.startswith("COM:"):
            root = series_id.split(":")[-1].upper()
    if root not in FUTURES_ROOTS:
        return None
    return f"hf_{root}"


def _sina_us_symbol(series: dict[str, Any]) -> str | None:
    """Sina ``gb_<ticker>`` symbol for a US instrument (``None`` if unsafe)."""
    symbol = _base_symbol(series)
    if not _SYMBOL_OK(symbol):
        return None
    return f"gb_{symbol.lower()}"


def _SYMBOL_OK(symbol: str) -> bool:
    """True when a symbol can be embedded in a Sina/Tencent request."""
    return bool(symbol) and bool(_US_SYMBOL_PATTERN.match(symbol)) and not symbol.startswith("^")


def _tencent_symbol(series: dict[str, Any]) -> str | None:
    """Tencent quote symbol for a US / HK / A-share instrument series."""
    mic, _code = _instrument_code(series)
    symbol = _base_symbol(series)
    if mic in US_MICS:
        if not _SYMBOL_OK(symbol):
            return None
        return f"us{symbol}"
    if mic == HK_MIC:
        code = _hk_code(symbol)
        return f"hk{code}" if code else None
    if mic in (SHANGHAI_MIC, SHENZHEN_MIC):
        code = _a_share_code(symbol)
        if not code:
            return None
        return f"sh{code}" if mic == SHANGHAI_MIC else f"sz{code}"
    return None


def _tencent_kline_code(series: dict[str, Any]) -> str | None:
    """Tencent kline code for a US / HK / A-share instrument series."""
    mic, code = _instrument_code(series)
    symbol = _base_symbol(series)
    if mic in US_MICS:
        if not _SYMBOL_OK(symbol):
            return None
        return f"us{symbol}.OQ"
    if mic == HK_MIC:
        hk = _hk_code(symbol)
        return f"hk{hk}" if hk else None
    if mic in (SHANGHAI_MIC, SHENZHEN_MIC):
        digits = _a_share_code(symbol) or code
        if not digits:
            return None
        return f"sh{digits}" if mic == SHANGHAI_MIC else f"sz{digits}"
    return None


def coingecko_coin_id(series: dict[str, Any]) -> str | None:
    """CoinGecko coin id for a crypto instrument series, if covered."""
    mic, _code = _instrument_code(series)
    if mic != CRYPTO_MIC:
        return None
    symbol = _base_symbol(series)
    base = symbol.split("-")[0] if "-" in symbol else symbol
    return COINGECKO_IDS.get(base)


def frankfurter_pair(series: dict[str, Any]) -> dict[str, str] | None:
    """Request plan for a USD FX pair (``XXXUSD=X`` or ``USDXXX=X``)."""
    mic, _code = _instrument_code(series)
    if mic != FX_MIC:
        return None
    match = _FX_PAIR_PATTERN.match(_base_symbol(series))
    if match is None:
        return None
    left, right = match.group(1), match.group(2)
    if right == "USD":
        return {"base": left, "quote": "USD", "request_from": left, "target": "USD"}
    if left == "USD":
        return {"base": "USD", "quote": right, "request_from": "USD", "target": right}
    return None


def quote_entry(series: dict[str, Any]) -> dict[str, Any] | None:
    """Request plan for one live-quote series, or ``None`` when uncovered.

    The returned dict carries ``source_id``, ``kind`` (dispatch tag), the
    provider ``symbol`` to request and the ``currency`` of the quote.
    """
    kind = _text(series.get("kind")).lower()
    mic, _code = _instrument_code(series)
    if kind == "instrument":
        if mic in US_MICS:
            symbol = _sina_us_symbol(series)
            if symbol is not None:
                return _entry(series, SINA_FINANCE, "sina-us", symbol, "USD")
        if mic == HK_MIC:
            code = _hk_code(_base_symbol(series))
            if code:
                return _entry(series, SINA_FINANCE, "sina-hk", f"rt_hk{code}", "HKD")
        if mic == CRYPTO_MIC:
            coin_id = coingecko_coin_id(series)
            if coin_id is not None:
                return _entry(series, COINGECKO, "coingecko", coin_id, "USD")
        if mic == FX_MIC:
            pair = frankfurter_pair(series)
            if pair is not None:
                entry = _entry(
                    series, FRANKFURTER, "frankfurter",
                    f"{pair['base']}/{pair['quote']}", pair["quote"],
                )
                entry.update(pair)
                return entry
        if mic in (SHANGHAI_MIC, SHENZHEN_MIC):
            symbol = _tencent_symbol(series)
            if symbol is not None:
                return _entry(series, TENCENT_FINANCE, "tencent-a", symbol, "CNY")
        return None
    if kind == "index":
        symbol = _index_sina_symbol(series)
        if symbol is not None:
            return _entry(series, SINA_FINANCE, "sina-index", symbol, _index_currency(series))
        return None
    if kind == "commodity":
        symbol = _futures_sina_symbol(series)
        if symbol is not None:
            return _entry(series, SINA_FINANCE, "sina-futures", symbol, FUTURES_CURRENCY)
        return None
    return None


def eod_entry(series: dict[str, Any]) -> dict[str, Any] | None:
    """Request plan for one daily-bar series, or ``None`` when uncovered.

    ``kind`` is ``sina-us`` (primary US history, Tencent fallback), ``tencent``
    (HK / A-share history), ``coingecko`` (crypto closes) or ``frankfurter``
    (ECB business-day rates).
    """
    kind = _text(series.get("kind")).lower()
    mic, _code = _instrument_code(series)
    if kind != "instrument":
        return None
    if mic in US_MICS:
        symbol = _base_symbol(series)
        if not _SYMBOL_OK(symbol):
            return None
        return _entry(series, SINA_FINANCE, "sina-us", symbol, "USD")
    if mic == HK_MIC:
        code = _tencent_kline_code(series)
        if code is None:
            return None
        return _entry(series, TENCENT_FINANCE, "tencent", code, "HKD")
    if mic in (SHANGHAI_MIC, SHENZHEN_MIC):
        code = _tencent_kline_code(series)
        if code is None:
            return None
        return _entry(series, TENCENT_FINANCE, "tencent", code, "CNY")
    if mic == CRYPTO_MIC:
        coin_id = coingecko_coin_id(series)
        if coin_id is None:
            return None
        return _entry(series, COINGECKO, "coingecko", coin_id, "USD")
    if mic == FX_MIC:
        pair = frankfurter_pair(series)
        if pair is None:
            return None
        entry = _entry(
            series, FRANKFURTER, "frankfurter",
            f"{pair['base']}/{pair['quote']}", pair["quote"],
        )
        entry.update(pair)
        return entry
    return None


def _entry(
    series: dict[str, Any],
    source_id: str,
    kind: str,
    symbol: str,
    currency: str,
) -> dict[str, Any]:
    """Build one request-plan entry shared by the quote and EOD planners."""
    return {
        "series": series,
        "series_id": _text(series.get("series_id")),
        "provider_symbol": _base_symbol(series),
        "source_id": source_id,
        "kind": kind,
        "symbol": symbol,
        "currency": currency,
    }


# ---------------------------------------------------------------------------
# quote parsing
# ---------------------------------------------------------------------------


def parse_sina_quote_text(text: str) -> dict[str, list[str]]:
    """Parse a GBK-decoded ``hq.sinajs.cn/list=`` body into field lists."""
    parsed: dict[str, list[str]] = {}
    if not text:
        return parsed
    for match in _SINA_QUOTE_LINE.finditer(text):
        symbol = _text(match.group(1))
        if not symbol:
            continue
        value = match.group(2)
        parsed[symbol] = [part.strip() for part in value.split(",")] if value else []
    return parsed


def parse_tencent_quote_text(text: str) -> dict[str, list[str]]:
    """Parse a GBK-decoded ``qt.gtimg.cn/q=`` body into field lists."""
    parsed: dict[str, list[str]] = {}
    if not text:
        return parsed
    for match in _TENCENT_QUOTE_LINE.finditer(text):
        symbol = _text(match.group(1))
        if not symbol:
            continue
        value = match.group(2)
        parsed[symbol] = [part.strip() for part in value.split("~")] if value else []
    return parsed


def _reconciles(price: float, prev_close: float, change: float) -> bool:
    """True when ``last - prev_close`` matches the reported change.

    Used to detect a provider-side field-layout move; the tolerance is relative
    to the change so quote-sized values reconcile while unrelated neighbours
    (open/high/low) do not.
    """
    gap = abs(price - prev_close - change)
    return gap <= max(0.005, abs(change) * 1e-6)


def parse_sina_us_fields(fields: Sequence[str]) -> dict[str, Any] | None:
    """Map a Sina ``gb_*`` field list onto a normalised quote dict.

    The current gateway layout puts the session open at index 5 and the
    previous close at index 26 (index 35 repeats it).  The reported change is
    reconciled against both candidates so a layout that moves ``prev_close`` to
    index 5 (and ``open``/``high`` to 6/8) is still mapped correctly.
    """
    price = _positive(_field(fields, SINA_US_FIELDS["last"]))
    if price is None:
        return None
    change = _number(_field(fields, SINA_US_FIELDS["change"]))
    live_prev = _first_positive(
        _field(fields, SINA_US_FIELDS["prev_close"]),
        _field(fields, SINA_US_FIELDS["prev_close_alt"]),
    )
    alt_prev = _positive(_field(fields, SINA_US_FIELDS["open"]))
    prev_close = live_prev
    open_price = _positive(_field(fields, SINA_US_FIELDS["open"]))
    high = _positive(_field(fields, SINA_US_FIELDS["high"]))
    low = _positive(_field(fields, SINA_US_FIELDS["low"]))
    if change is not None:
        live_matches = live_prev is not None and _reconciles(price, live_prev, change)
        alt_matches = alt_prev is not None and _reconciles(price, alt_prev, change)
        if alt_matches and not live_matches:
            # Alternate layout: [5] is prev_close, [6] open, [8] high, [7] low.
            prev_close = alt_prev
            open_price = _positive(_field(fields, SINA_US_FIELDS["high"]))
            high = _positive(_field(fields, SINA_US_FIELDS["week_high_52"]))
            low = _positive(_field(fields, SINA_US_FIELDS["low"]))
    if prev_close is None and change is not None:
        prev_close = price - change
    return {
        "name": _field(fields, SINA_US_FIELDS["name"]),
        "price": price,
        "prev_close": prev_close,
        "change_pct": _number(_field(fields, SINA_US_FIELDS["change_pct"])),
        "open": open_price,
        "high": high,
        "low": low,
        "volume": _number(_field(fields, SINA_US_FIELDS["volume"])),
        "currency": "USD",
        "ts": _provider_iso(_field(fields, SINA_US_FIELDS["time"])),
    }


def parse_sina_hk_fields(fields: Sequence[str]) -> dict[str, Any] | None:
    """Map a Sina ``rt_hk*`` field list onto a normalised quote dict."""
    price = _positive(_field(fields, SINA_HK_FIELDS["last"]))
    if price is None:
        return None
    return {
        "name": _field(fields, SINA_HK_FIELDS["name"]),
        "price": price,
        "prev_close": _positive(_field(fields, SINA_HK_FIELDS["prev_close"])),
        "change_pct": _number(_field(fields, SINA_HK_FIELDS["change_pct"])),
        "open": _positive(_field(fields, SINA_HK_FIELDS["open"])),
        "high": _positive(_field(fields, SINA_HK_FIELDS["high"])),
        "low": _positive(_field(fields, SINA_HK_FIELDS["low"])),
        "volume": _number(_field(fields, SINA_HK_FIELDS["volume"])),
        "currency": "HKD",
        "ts": _provider_iso(
            _field(fields, SINA_HK_FIELDS["date"]),
            _field(fields, SINA_HK_FIELDS["time"]),
        ),
    }


def parse_sina_index_fields(
    fields: Sequence[str], currency: str = "USD",
) -> dict[str, Any] | None:
    """Map a Sina ``int_*`` field list onto a normalised quote dict."""
    price = _positive(_field(fields, SINA_INDEX_FIELDS["last"]))
    if price is None:
        return None
    change = _number(_field(fields, SINA_INDEX_FIELDS["change"]))
    return {
        "price": price,
        "prev_close": price - change if change is not None else None,
        "change_pct": _number(_field(fields, SINA_INDEX_FIELDS["change_pct"])),
        "volume": None,
        "currency": currency or "USD",
        "ts": None,
    }


def parse_sina_futures_fields(fields: Sequence[str]) -> dict[str, Any] | None:
    """Map a Sina ``hf_*`` field list onto a normalised quote dict."""
    price = _positive(_field(fields, SINA_FUTURES_FIELDS["last"]))
    if price is None:
        return None
    return {
        "name": _field(fields, SINA_FUTURES_FIELDS["name"]),
        "price": price,
        "prev_close": _first_positive(
            _field(fields, SINA_FUTURES_FIELDS["prev_close"]),
            _field(fields, SINA_FUTURES_FIELDS["prev_settle"]),
        ),
        "change_pct": None,
        "high": _positive(_field(fields, SINA_FUTURES_FIELDS["high"])),
        "low": _positive(_field(fields, SINA_FUTURES_FIELDS["low"])),
        "volume": None,
        "currency": FUTURES_CURRENCY,
        "ts": _provider_iso(
            _field(fields, SINA_FUTURES_FIELDS["date"]),
            _field(fields, SINA_FUTURES_FIELDS["time"]),
        ),
    }


def parse_tencent_fields(
    fields: Sequence[str], currency: str = "USD",
) -> dict[str, Any] | None:
    """Map a Tencent ``v_*`` field list onto a normalised quote dict."""
    price = _positive(_field(fields, TENCENT_QUOTE_FIELDS["last"]))
    if price is None:
        return None
    return {
        "name": _field(fields, TENCENT_QUOTE_FIELDS["name"]),
        "price": price,
        "prev_close": _positive(_field(fields, TENCENT_QUOTE_FIELDS["prev_close"])),
        "change_pct": None,
        "open": _positive(_field(fields, TENCENT_QUOTE_FIELDS["open"])),
        "volume": _number(_field(fields, TENCENT_QUOTE_FIELDS["volume"])),
        "currency": currency or "USD",
        "ts": None,
    }


def parse_coingecko_prices(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Parse a CoinGecko ``simple/price`` payload into normalised quotes.

    Keys are the requested coin ids; ``prev_close`` is derived from the
    reported 24 h change (``price / (1 + pct / 100)``).
    """
    quotes: dict[str, dict[str, Any]] = {}
    if not isinstance(payload, dict):
        return quotes
    for coin_id, record in payload.items():
        if not isinstance(record, dict):
            continue
        price = _positive(record.get(COINGECKO_VS_CURRENCY))
        if price is None:
            continue
        pct = _number(record.get(f"{COINGECKO_VS_CURRENCY}_24h_change"))
        prev_close = None
        if pct is not None:
            factor = 1.0 + pct / 100.0
            if factor > 0:
                prev_close = price / factor
        quotes[_text(coin_id)] = {
            "price": price,
            "prev_close": prev_close,
            "change_pct": pct,
            "volume": None,
            "currency": COINGECKO_VS_CURRENCY.upper(),
            "ts": None,
        }
    return quotes


def parse_frankfurter_latest(
    payload: dict[str, Any], target: str,
) -> float | None:
    """Extract one ECB reference rate (``rates[target]``) from a latest payload."""
    if not isinstance(payload, dict):
        return None
    rates = payload.get("rates")
    if not isinstance(rates, dict):
        return None
    return _positive(rates.get(_text(target).upper()))


# ---------------------------------------------------------------------------
# daily-bar parsing
# ---------------------------------------------------------------------------


def _json_array(text: str) -> list[Any]:
    """Extract the first JSON array from a JSONP/script-wrapped payload."""
    start = text.find("[")
    if start < 0:
        return []
    try:
        payload, _end = json.JSONDecoder().raw_decode(text, start)
    except ValueError as error:
        raise ValueError(f"invalid JSON array in channel payload: {error}") from error
    if not isinstance(payload, list):
        raise ValueError("channel payload did not contain a JSON array")
    return payload


def parse_sina_us_daily(text: str) -> list[dict[str, Any]]:
    """Parse a Sina US daily-history JSONP body into normalised bar rows.

    Rows are ``{"d","o","h","l","c","v"}`` = date, open, high, low, close,
    volume.  Rows without a valid date or a positive close are dropped; the
    result is ascending by date.
    """
    rows: list[dict[str, Any]] = []
    if not text:
        return rows
    for raw in _json_array(text):
        if not isinstance(raw, dict):
            continue
        date_text = _text(raw.get("d")).replace("/", "-")[:10]
        close = _positive(raw.get("c"))
        if not _DATE_PATTERN.match(date_text) or close is None:
            continue
        rows.append({
            "date": date_text,
            "open": _number(raw.get("o")),
            "high": _number(raw.get("h")),
            "low": _number(raw.get("l")),
            "close": close,
            "volume": _number(raw.get("v")),
        })
    rows.sort(key=lambda row: row["date"])
    return rows


def parse_tencent_kline(
    payload: dict[str, Any], code: str = "",
) -> list[dict[str, Any]]:
    """Parse a Tencent kline payload into normalised bar rows.

    Rows are ``[date, open, close, high, low, volume]`` (verified order) under
    either the ``day`` or ``qfqday`` key.  The ``code`` lookup falls back to the
    first record in ``data`` so a provider-side code suffix change still parses.
    """
    rows: list[dict[str, Any]] = []
    if not isinstance(payload, dict):
        return rows
    data = payload.get("data")
    if not isinstance(data, dict):
        return rows
    record = data.get(_text(code)) if code else None
    if not isinstance(record, dict):
        record = next((value for value in data.values() if isinstance(value, dict)), None)
    if not isinstance(record, dict):
        return rows
    raw_rows = record.get("day")
    if not isinstance(raw_rows, list):
        raw_rows = record.get("qfqday")
    if not isinstance(raw_rows, list):
        return rows
    for raw in raw_rows:
        if not isinstance(raw, (list, tuple)) or len(raw) < 3:
            continue
        date_text = _text(raw[0]).replace("/", "-")[:10]
        close = _positive(raw[2])
        if not _DATE_PATTERN.match(date_text) or close is None:
            continue
        rows.append({
            "date": date_text,
            "open": _number(raw[1]),
            "close": close,
            "high": _number(raw[3]),
            "low": _number(raw[4]),
            "volume": _number(raw[5]) if len(raw) > 5 else None,
        })
    rows.sort(key=lambda row: row["date"])
    return rows


def parse_coingecko_chart(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Aggregate a CoinGecko ``market_chart`` payload into daily bar rows.

    ``prices`` is ``[[epoch_ms, price], ...]``; points sharing a UTC date are
    folded into one bar (open=first, high=max, low=min, close=last) and the
    matching ``total_volumes`` points are summed (0 when absent).
    """
    if not isinstance(payload, dict):
        return []
    prices = payload.get("prices")
    if not isinstance(prices, list) or not prices:
        return []
    volumes = payload.get("total_volumes")
    volume_by_day: dict[str, float] = {}
    if isinstance(volumes, list):
        for point in volumes:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            day = _epoch_ms_iso(point[0])
            amount = _number(point[1])
            if day is None or amount is None:
                continue
            volume_by_day[day] = volume_by_day.get(day, 0.0) + amount
    grouped: dict[str, list[float]] = {}
    order: list[str] = []
    for point in prices:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        day = _epoch_ms_iso(point[0])
        price = _positive(point[1])
        if day is None or price is None:
            continue
        if day not in grouped:
            grouped[day] = []
            order.append(day)
        grouped[day].append(price)
    rows: list[dict[str, Any]] = []
    for day in sorted(order):
        values = grouped[day]
        rows.append({
            "date": day,
            "open": values[0],
            "high": max(values),
            "low": min(values),
            "close": values[-1],
            "volume": volume_by_day.get(day, 0.0),
        })
    return rows


def parse_frankfurter_series(
    payload: dict[str, Any], quote: str,
) -> list[dict[str, Any]]:
    """Parse a Frankfurter time-series payload into one row per business day."""
    if not isinstance(payload, dict):
        return []
    rates = payload.get("rates")
    if not isinstance(rates, dict):
        return []
    target = _text(quote).upper()
    rows: list[dict[str, Any]] = []
    for date_text, record in rates.items():
        day = _text(date_text).replace("/", "-")[:10]
        if not _DATE_PATTERN.match(day) or not isinstance(record, dict):
            continue
        rate = _positive(record.get(target))
        if rate is None:
            continue
        rows.append({
            "date": day,
            "open": rate,
            "high": rate,
            "low": rate,
            "close": rate,
            "volume": 0.0,
        })
    rows.sort(key=lambda row: row["date"])
    return rows


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _request(
    ctx: CollectContext,
    source_id: str,
    url: str,
    headers: dict[str, str] | None = None,
    stats: dict[str, Any] | None = None,
    *,
    accept: str = "*/*",
) -> Any:
    """Fetch one URL through the governed client.

    Returns ``None`` for a dry-run or conditional ``304`` response and raises
    :class:`DataSourceError` for a non-200 status so callers can isolate the
    failure per symbol/batch.
    """
    if stats is not None:
        stats["requests"] = int(stats.get("requests", 0)) + 1
    # These endpoints expose a mutable value behind a stable URL (quotes change
    # every minute, a daily history changes once a day), so a conditional
    # 304-with-no-body reply would starve the collector; always ask for the body.
    result = ctx.http.fetch(
        source_id, url, headers=dict(headers or {}), accept=accept, conditional=False,
    )
    if getattr(result, "dry_run", False) or getattr(result, "not_modified", False):
        return None
    status = int(getattr(result, "status", 0) or 0)
    if status and status != 200:
        raise DataSourceError(f"{source_id} returned HTTP {status} for {url}")
    return result


def _gbk_text(result: Any) -> str:
    """Decode a Sina/Tencent response body as GBK (never raise)."""
    body = getattr(result, "body", b"") or b""
    if isinstance(body, bytes):
        return body.decode("gbk", errors="replace")
    return str(body)


def _json_payload(result: Any, source_id: str, url: str) -> dict[str, Any]:
    """Decode a JSON response body into a dict or raise :class:`DataSourceError`."""
    try:
        payload = json.loads(result.text())
    except (TypeError, ValueError) as error:
        raise DataSourceError(f"{source_id} returned invalid JSON for {url}") from error
    if not isinstance(payload, dict):
        raise DataSourceError(f"{source_id} returned an unexpected payload for {url}")
    return payload


# ---------------------------------------------------------------------------
# row builders
# ---------------------------------------------------------------------------


def _quote_row(
    entry: dict[str, Any],
    quote: dict[str, Any] | None,
    now_iso: str,
) -> dict[str, Any] | None:
    """Build one ``market_quote_latest`` row from a normalised quote."""
    if not quote:
        return None
    price = _positive(quote.get("price"))
    if price is None:
        return None
    prev_close = _positive(quote.get("prev_close"))
    change_pct = _number(quote.get("change_pct"))
    if prev_close is not None:
        change_pct = (price - prev_close) / prev_close * 100.0
    observed_at = _text(quote.get("ts")) or now_iso
    currency = _text(quote.get("currency")) or entry.get("currency") or "USD"
    return {
        "series_id": entry["series_id"],
        "ts": observed_at,
        "price": price,
        "prev_close": prev_close,
        "change_pct": change_pct,
        "change_type": "percent",
        "volume": _number(quote.get("volume")),
        "currency": currency,
        "source_id": entry["source_id"],
        "observed_at": observed_at,
    }


def _daily_bar_rows(
    rows: Sequence[dict[str, Any]],
    series_id: str,
    source_id: str,
    now_iso: str,
) -> list[dict[str, Any]]:
    """Build ``market_bar`` rows (``interval="1d"``, ``quality="final"``)."""
    bars: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        date_text = _text(row.get("date")).replace("/", "-")[:10]
        close = _positive(row.get("close"))
        if not _DATE_PATTERN.match(date_text) or close is None:
            continue
        open_price = _positive(row.get("open")) or close
        high = _positive(row.get("high")) or close
        low = _positive(row.get("low")) or close
        bars.append({
            "series_id": series_id,
            "interval": "1d",
            "ts": date_text,
            "open": open_price,
            "high": max(high, open_price, close),
            "low": min(low, open_price, close),
            "close": close,
            "volume": _number(row.get("volume")),
            "quality": "final",
            "source_id": source_id,
            "observed_at": now_iso,
        })
    bars.sort(key=lambda bar: bar["ts"])
    return bars


def _empty_result(reason: str, *, status: str = "ok", **extra: Any) -> dict[str, Any]:
    """Uniform counters payload for collectors with nothing to do."""
    details: dict[str, Any] = {"reason": reason}
    details.update(extra)
    return {
        "stored": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "status": status,
        "details": details,
    }


# ---------------------------------------------------------------------------
# selection (staleness ordering)
# ---------------------------------------------------------------------------


def _quote_age_key(ctx: CollectContext, series_id: str) -> tuple[int, float]:
    """Sort key: missing quotes first, then the oldest persisted quote."""
    row = ctx.warehouse.get_quote_latest(series_id)
    if not row:
        return (0, 0.0)
    moment = parse_iso(str(row.get("observed_at") or row.get("ts") or ""))
    if moment is None:
        return (1, 0.0)
    return (1, moment.timestamp())


def _select_quote_entries(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Take the ``limit`` stalest supported series (missing quotes first)."""
    ordered = sorted(
        entries,
        key=lambda entry: (_quote_age_key(ctx, entry["series_id"]), entry["series_id"]),
    )
    return ordered[:limit]


def _bar_is_stale(ctx: CollectContext, series_id: str, cutoff: str) -> tuple[bool, str]:
    """True when the latest daily bar is missing or older than ``cutoff``."""
    latest = ctx.warehouse.latest_bar(series_id, "1d")
    if not latest:
        return True, ""
    ts = _text(latest.get("ts")).replace("/", "-")[:10]
    if not _DATE_PATTERN.match(ts):
        return True, ts
    return ts < cutoff, ts


def _select_eod_entries(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    limit: int,
    today: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Select stale daily-bar series, oldest first, capped at ``limit``.

    Returns ``(selected, deferred, skipped_fresh)``; a bar from yesterday is
    still fresh because only one day of history can be missing after a run.
    """
    try:
        cutoff = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    except ValueError:
        cutoff = today
    stale: list[tuple[str, dict[str, Any]]] = []
    fresh: list[str] = []
    undated: list[dict[str, Any]] = []
    for entry in entries:
        is_stale, latest_ts = _bar_is_stale(ctx, entry["series_id"], cutoff)
        if not is_stale:
            fresh.append(entry["series_id"])
            continue
        if latest_ts:
            stale.append((latest_ts, entry))
        else:
            undated.append(entry)
    stale.sort(key=lambda item: (item[0], item[1]["series_id"]))
    ordered = undated + [entry for _ts, entry in stale]
    return ordered[:limit], ordered[limit:], fresh


# ---------------------------------------------------------------------------
# live quote collection
# ---------------------------------------------------------------------------


def _stats() -> dict[str, Any]:
    """Fresh per-channel statistics accumulator."""
    return {"symbols": [], "series": [], "requests": 0, "quotes": 0, "missing": [], "errors": []}


def _stats_for(stats: dict[str, Any], source_id: str) -> dict[str, Any]:
    """Return (and lazily create) the accumulator of one channel."""
    return stats.setdefault(source_id, _stats())


def _record_stats(stats: dict[str, Any], entries: Sequence[dict[str, Any]]) -> None:
    """Register the planned symbols/series of a channel in its accumulator."""
    if not entries:
        return
    source_id = entries[0]["source_id"]
    channel = _stats_for(stats, source_id)
    for entry in entries:
        if entry["symbol"] not in channel["symbols"]:
            channel["symbols"].append(entry["symbol"])
        if entry["series_id"] not in channel["series"]:
            channel["series"].append(entry["series_id"])


def _record_failure(
    stats: dict[str, Any],
    source_id: str,
    reason: str,
    entries: Sequence[dict[str, Any]],
    error: Any = None,
) -> None:
    """Record one request-level failure and mark its series as missing."""
    channel = _stats_for(stats, source_id)
    record: dict[str, Any] = {
        "channel": source_id,
        "reason": reason,
        "symbols": [entry["symbol"] for entry in entries],
        "series": [entry["series_id"] for entry in entries],
    }
    if error is not None:
        record["error"] = _text(error)[:200]
    channel["errors"].append(record)
    for entry in entries:
        if entry["series_id"] not in channel["missing"]:
            channel["missing"].append(entry["series_id"])


def _failure_reason(error: BaseException) -> str:
    """Map a typed transport error to the diagnostics reason string."""
    if isinstance(error, (SourceRateLimitedError, SourceBlockedError)):
        return "rate_limited"
    return "source_unavailable"


def _sina_quote(
    kind: str, fields: Sequence[str], currency: str,
) -> dict[str, Any] | None:
    """Dispatch a Sina quote field list to the layout-specific parser."""
    if kind == "sina-us":
        return parse_sina_us_fields(fields)
    if kind == "sina-hk":
        return parse_sina_hk_fields(fields)
    if kind == "sina-index":
        return parse_sina_index_fields(fields, currency)
    if kind == "sina-futures":
        return parse_sina_futures_fields(fields)
    return None


def _run_sina_quotes(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    batch_size: int,
    now_iso: str,
    stats: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Fetch Sina batch quotes; returns ``(rows, missing_series_ids)``."""
    rows: list[dict[str, Any]] = []
    missing: list[str] = []
    for chunk in _chunks(entries, batch_size):
        url = sina_quote_url([entry["symbol"] for entry in chunk])
        try:
            result = _request(ctx, SINA_FINANCE, url, SINA_HEADERS, _stats_for(stats, SINA_FINANCE))
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            _record_failure(stats, SINA_FINANCE, _failure_reason(error), chunk, error)
            missing.extend(entry["series_id"] for entry in chunk)
            continue
        if result is None:
            _record_failure(stats, SINA_FINANCE, "no payload", chunk)
            missing.extend(entry["series_id"] for entry in chunk)
            continue
        parsed = parse_sina_quote_text(_gbk_text(result))
        if not parsed:
            _record_failure(stats, SINA_FINANCE, "parse_error", chunk)
            missing.extend(entry["series_id"] for entry in chunk)
            continue
        lookup = {symbol.casefold(): fields for symbol, fields in parsed.items()}
        channel = _stats_for(stats, SINA_FINANCE)
        for entry in chunk:
            fields = lookup.get(entry["symbol"].casefold())
            quote = _sina_quote(entry["kind"], fields, entry["currency"]) if fields else None
            row = _quote_row(entry, quote, now_iso)
            if row is None:
                missing.append(entry["series_id"])
                if entry["series_id"] not in channel["missing"]:
                    channel["missing"].append(entry["series_id"])
                continue
            rows.append(row)
            channel["quotes"] = int(channel.get("quotes", 0)) + 1
    return rows, missing


def _run_tencent_quotes(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    batch_size: int,
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch Tencent batch quotes for A-shares and Sina misses."""
    rows: list[dict[str, Any]] = []
    if not entries:
        return rows
    _record_stats(stats, entries)
    for chunk in _chunks(entries, batch_size):
        url = tencent_quote_url([entry["symbol"] for entry in chunk])
        try:
            result = _request(
                ctx, TENCENT_FINANCE, url, TENCENT_HEADERS,
                _stats_for(stats, TENCENT_FINANCE),
            )
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            _record_failure(stats, TENCENT_FINANCE, _failure_reason(error), chunk, error)
            continue
        if result is None:
            _record_failure(stats, TENCENT_FINANCE, "no payload", chunk)
            continue
        parsed = parse_tencent_quote_text(_gbk_text(result))
        if not parsed:
            _record_failure(stats, TENCENT_FINANCE, "parse_error", chunk)
            continue
        lookup = {symbol.casefold(): fields for symbol, fields in parsed.items()}
        channel = _stats_for(stats, TENCENT_FINANCE)
        for entry in chunk:
            fields = lookup.get(entry["symbol"].casefold())
            quote = parse_tencent_fields(fields, entry["currency"]) if fields else None
            row = _quote_row(entry, quote, now_iso)
            if row is None:
                if entry["series_id"] not in channel["missing"]:
                    channel["missing"].append(entry["series_id"])
                continue
            rows.append(row)
            channel["quotes"] = int(channel.get("quotes", 0)) + 1
    return rows


def _run_coingecko_quotes(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch CoinGecko batch simple prices."""
    rows: list[dict[str, Any]] = []
    if not entries:
        return rows
    coin_ids: list[str] = []
    for entry in entries:
        if entry["symbol"] not in coin_ids:
            coin_ids.append(entry["symbol"])
    url = coingecko_price_url(coin_ids)
    try:
        result = _request(
            ctx, COINGECKO, url, None, _stats_for(stats, COINGECKO),
        )
    except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
        _record_failure(stats, COINGECKO, _failure_reason(error), entries, error)
        return rows
    if result is None:
        _record_failure(stats, COINGECKO, "no payload", entries)
        return rows
    try:
        payload = _json_payload(result, COINGECKO, url)
    except DataSourceError as error:
        _record_failure(stats, COINGECKO, "parse_error", entries, error)
        return rows
    quotes = parse_coingecko_prices(payload)
    channel = _stats_for(stats, COINGECKO)
    for entry in entries:
        row = _quote_row(entry, quotes.get(entry["symbol"]), now_iso)
        if row is None:
            if entry["series_id"] not in channel["missing"]:
                channel["missing"].append(entry["series_id"])
            continue
        rows.append(row)
        channel["quotes"] = int(channel.get("quotes", 0)) + 1
    return rows


def _frankfurter_groups(
    entries: Sequence[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Group FX quote entries by the request base currency (one request each)."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        groups.setdefault(entry["request_from"], []).append(entry)
    return groups


def _run_frankfurter_quotes(
    ctx: CollectContext,
    entries: Sequence[dict[str, Any]],
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch Frankfurter latest rates, one request per request base."""
    rows: list[dict[str, Any]] = []
    for base, group in _frankfurter_groups(entries).items():
        targets: list[str] = []
        for entry in group:
            if entry["target"] not in targets:
                targets.append(entry["target"])
        url = frankfurter_latest_url(base, targets)
        try:
            result = _request(ctx, FRANKFURTER, url, None, _stats_for(stats, FRANKFURTER))
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            _record_failure(stats, FRANKFURTER, _failure_reason(error), group, error)
            continue
        if result is None:
            _record_failure(stats, FRANKFURTER, "no payload", group)
            continue
        try:
            payload = _json_payload(result, FRANKFURTER, url)
        except DataSourceError as error:
            _record_failure(stats, FRANKFURTER, "parse_error", group, error)
            continue
        channel = _stats_for(stats, FRANKFURTER)
        for entry in group:
            rate = parse_frankfurter_latest(payload, entry["target"])
            if rate is None:
                if entry["series_id"] not in channel["missing"]:
                    channel["missing"].append(entry["series_id"])
                continue
            # Latest-only endpoint: keep the price and report no daily change.
            quote = {
                "price": rate,
                "prev_close": rate,
                "change_pct": 0.0,
                "volume": None,
                "currency": entry["currency"],
                "ts": None,
            }
            row = _quote_row(entry, quote, now_iso)
            if row is None:
                continue
            rows.append(row)
            channel["quotes"] = int(channel.get("quotes", 0)) + 1
    return rows


def _flatten_channel_errors(stats: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten per-channel error records for ``details["errors"]``."""
    errors: list[dict[str, Any]] = []
    for channel in stats.values():
        errors.extend(channel.get("errors") or [])
    return errors


def _channel_quotes_failed(stats: dict[str, Any]) -> bool:
    """True when every attempted channel produced only failures."""
    attempted = [channel for channel in stats.values() if int(channel.get("requests", 0)) > 0]
    if not attempted:
        return False
    return all(channel.get("errors") and not int(channel.get("quotes", 0)) for channel in attempted)


def collect_quotes(ctx: CollectContext) -> dict[str, Any]:
    """Collect batched live quotes from the fallback channels.

    Supported tracked series are ordered by the age of their persisted
    warehouse quote (missing first, then oldest), capped at
    ``channel_quote_limit`` (default 20, clamp 1..40), then grouped by channel:
    one Sina batch (``channel_sina_batch`` symbols per request, default 40,
    clamp 1..80), one Tencent batch for A-shares plus the Sina misses, one
    CoinGecko batch and one Frankfurter request per request base.  Rows are
    written to ``market_quote_latest`` with the channel's source id.

    One channel failing never hides the others: typed transport errors are
    recorded per channel and the run only reports ``partial`` when *every*
    attempted channel failed.  A dry run performs no request and no write and
    reports the planned symbol list per channel.
    """
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    entries: list[dict[str, Any]] = []
    unsupported: list[str] = []
    for series in tracked:
        entry = quote_entry(series)
        if entry is None:
            unsupported.append(series["series_id"])
        else:
            entries.append(entry)
    if not entries:
        return _empty_result("no supported series", unsupported=unsupported)
    limit = _setting_int(
        ctx, "channel_quote_limit", DEFAULT_QUOTE_LIMIT,
        minimum=MIN_QUOTE_LIMIT, maximum=MAX_QUOTE_LIMIT,
    )
    batch_size = _setting_int(
        ctx, "channel_sina_batch", DEFAULT_SINA_BATCH,
        minimum=MIN_SINA_BATCH, maximum=MAX_SINA_BATCH,
    )
    selected = _select_quote_entries(ctx, entries, limit)
    now_iso = ctx.now_iso()
    plan: dict[str, list[dict[str, Any]]] = {}
    for entry in selected:
        plan.setdefault(entry["source_id"], []).append(entry)
    planned = {source_id: [entry["symbol"] for entry in items] for source_id, items in plan.items()}
    details: dict[str, Any] = {
        "selected": len(selected),
        "quote_limit": limit,
        "batch_size": batch_size,
        "symbols": [entry["symbol"] for entry in selected],
        "planned": planned,
    }
    if unsupported:
        details["unsupported"] = unsupported
    if bool(ctx.settings.get("dry_run")):
        details["dry_run"] = True
        details["reason"] = "dry run"
        details["channels"] = {
            source_id: {"symbols": symbols} for source_id, symbols in planned.items()
        }
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": details,
        }

    stats: dict[str, Any] = {}
    by_id = {entry["series_id"]: entry for entry in selected}
    for source_id, items in plan.items():
        _record_stats(stats, items)
    rows: list[dict[str, Any]] = []

    sina_entries = plan.get(SINA_FINANCE, [])
    sina_rows, sina_missing = _run_sina_quotes(ctx, sina_entries, batch_size, now_iso, stats)
    rows.extend(sina_rows)

    tencent_entries = list(plan.get(TENCENT_FINANCE, []))
    seen_symbols = {entry["symbol"] for entry in tencent_entries}
    for series_id in sina_missing:
        series = by_id.get(series_id)
        if series is None or series["kind"] in ("sina-index", "sina-futures"):
            continue
        retry = _tencent_retry_entry(series)
        if retry is not None and retry["symbol"] not in seen_symbols:
            tencent_entries.append(retry)
            seen_symbols.add(retry["symbol"])
    if tencent_entries:
        rows.extend(_run_tencent_quotes(ctx, tencent_entries, batch_size, now_iso, stats))

    rows.extend(_run_coingecko_quotes(ctx, plan.get(COINGECKO, []), now_iso, stats))
    rows.extend(_run_frankfurter_quotes(ctx, plan.get(FRANKFURTER, []), now_iso, stats))

    stored = ctx.warehouse.upsert_quote_latest(rows) if rows else 0
    details["channels"] = stats
    details["errors"] = _flatten_channel_errors(stats)
    if not rows:
        details["reason"] = "no quote data"
    status = "partial" if _channel_quotes_failed(stats) else "ok"
    LOGGER.debug(
        "market channels quotes: %d/%d series selected, %d quote(s), status=%s",
        len(rows), len(selected), stored, status,
    )
    return {
        "stored": int(stored),
        "updated": 0,
        "duplicates": 0,
        "skipped": max(0, len(selected) - len(rows)),
        "status": status,
        "details": details,
    }


def _tencent_retry_entry(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Tencent quote plan for a Sina entry that produced no quote."""
    series = entry["series"]
    if entry["kind"] == "sina-us":
        symbol = _tencent_symbol(series)
        if symbol is None:
            return None
        return _entry(series, TENCENT_FINANCE, "tencent-us", symbol, "USD")
    if entry["kind"] == "sina-hk":
        symbol = _tencent_symbol(series)
        if symbol is None:
            return None
        return _entry(series, TENCENT_FINANCE, "tencent-hk", symbol, "HKD")
    if entry["kind"] == "tencent-a":
        return entry
    return None


# ---------------------------------------------------------------------------
# end-of-day collection
# ---------------------------------------------------------------------------


def _fetch_tencent_bars(
    ctx: CollectContext,
    series: dict[str, Any],
    code: str,
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch and build Tencent kline bars for one series."""
    url = tencent_kline_url(code)
    result = _request(
        ctx, TENCENT_FINANCE, url, TENCENT_HEADERS, _stats_for(stats, TENCENT_FINANCE),
    )
    if result is None:
        return []
    payload = _json_payload(result, TENCENT_FINANCE, url)
    rows = parse_tencent_kline(payload, code)
    bars = _daily_bar_rows(rows, series["series_id"], TENCENT_FINANCE, now_iso)
    _mark_used(stats, TENCENT_FINANCE, series, code)
    return bars


def _fetch_sina_us_bars(
    ctx: CollectContext,
    series: dict[str, Any],
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch and build Sina US daily bars for one series."""
    url = sina_us_daily_url(_base_symbol(series))
    result = _request(
        ctx, SINA_FINANCE, url, SINA_HEADERS, _stats_for(stats, SINA_FINANCE),
    )
    if result is None:
        return []
    rows = parse_sina_us_daily(_gbk_text(result))[-SINA_US_MAX_BARS:]
    bars = _daily_bar_rows(rows, series["series_id"], SINA_FINANCE, now_iso)
    if bars:
        _mark_used(stats, SINA_FINANCE, series, _base_symbol(series))
    return bars


def _fetch_coingecko_bars(
    ctx: CollectContext,
    series: dict[str, Any],
    coin_id: str,
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch and build CoinGecko daily bars for one crypto series."""
    url = coingecko_chart_url(coin_id)
    result = _request(ctx, COINGECKO, url, None, _stats_for(stats, COINGECKO))
    if result is None:
        return []
    payload = _json_payload(result, COINGECKO, url)
    rows = parse_coingecko_chart(payload)
    bars = _daily_bar_rows(rows, series["series_id"], COINGECKO, now_iso)
    if bars:
        _mark_used(stats, COINGECKO, series, coin_id)
    return bars


def _fetch_frankfurter_bars(
    ctx: CollectContext,
    series: dict[str, Any],
    pair: dict[str, str],
    today: str,
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch and build Frankfurter business-day bars for one FX series."""
    try:
        start = (date.fromisoformat(today) - timedelta(days=EOD_HISTORY_DAYS)).isoformat()
    except ValueError:
        return []
    url = frankfurter_series_url(pair["request_from"], pair["target"], start, today)
    result = _request(ctx, FRANKFURTER, url, None, _stats_for(stats, FRANKFURTER))
    if result is None:
        return []
    payload = _json_payload(result, FRANKFURTER, url)
    rows = parse_frankfurter_series(payload, pair["target"])
    bars = _daily_bar_rows(rows, series["series_id"], FRANKFURTER, now_iso)
    if bars:
        _mark_used(stats, FRANKFURTER, series, f"{pair['base']}/{pair['quote']}")
    return bars


def _mark_used(
    stats: dict[str, Any], source_id: str, series: dict[str, Any], symbol: str = "",
) -> None:
    """Record one series successfully served by a channel."""
    channel = _stats_for(stats, source_id)
    if series["series_id"] not in channel["series"]:
        channel["series"].append(series["series_id"])
    if symbol and symbol not in channel["symbols"]:
        channel["symbols"].append(symbol)


def _fetch_eod_series(
    ctx: CollectContext,
    entry: dict[str, Any],
    today: str,
    now_iso: str,
    stats: dict[str, Any],
) -> list[dict[str, Any]]:
    """Fetch daily bars for one planned series, with the US Sina/Tencent fallback.

    Raises the typed governor errors (rate limit / block) untouched so the
    collector can stop the run; a :class:`DataSourceError` from a primary
    source is isolated per symbol by the caller.
    """
    series = entry["series"]
    kind = entry["kind"]
    if kind == "sina-us":
        try:
            bars = _fetch_sina_us_bars(ctx, series, now_iso, stats)
        except DataSourceError as error:
            LOGGER.info(
                "Sina US history failed for %s (%s); falling back to Tencent",
                series["series_id"], _text(error)[:120],
            )
            bars = []
        if bars:
            return bars
        code = _tencent_kline_code(series)
        if code is None:
            return []
        return _fetch_tencent_bars(ctx, series, code, now_iso, stats)
    if kind == "tencent":
        code = entry["symbol"]
        return _fetch_tencent_bars(ctx, series, code, now_iso, stats)
    if kind == "coingecko":
        return _fetch_coingecko_bars(ctx, series, entry["symbol"], now_iso, stats)
    if kind == "frankfurter":
        return _fetch_frankfurter_bars(ctx, series, entry, today, now_iso, stats)
    return []


def collect_eod(ctx: CollectContext) -> dict[str, Any]:
    """Collect daily bars for stale tracked series from the fallback channels.

    Only series whose latest stored ``1d`` bar is missing or older than one day
    are considered, oldest first and capped at ``channel_eod_limit`` (default
    20, clamp 1..40).  US listings use Sina US history first and Tencent kline
    as the fallback; HK / A-share series use Tencent; crypto uses CoinGecko and
    FX uses Frankfurter.  Indices and commodities are not covered here (the
    Yahoo collectors own them) and are reported as unsupported.

    One request per symbol, all governed.  A rate-limit/block answer stops the
    run cleanly with ``status="partial"`` and ``details["stopped"]``; a single
    symbol failure is recorded and skipped.  A dry run performs no request and
    no write and reports the plan.
    """
    tracked = tracked_series(ctx)
    if not tracked:
        return _empty_result("no tracked series")
    entries: list[dict[str, Any]] = []
    unsupported: list[str] = []
    for series in tracked:
        entry = eod_entry(series)
        if entry is None:
            unsupported.append(series["series_id"])
        else:
            entries.append(entry)
    if not entries:
        return _empty_result("no supported series", unsupported=unsupported)
    limit = _setting_int(
        ctx, "channel_eod_limit", DEFAULT_EOD_LIMIT,
        minimum=MIN_EOD_LIMIT, maximum=MAX_EOD_LIMIT,
    )
    today = ctx.today()
    now_iso = ctx.now_iso()
    selected, deferred, fresh = _select_eod_entries(ctx, entries, limit, today)
    plan: dict[str, list[dict[str, Any]]] = {}
    for entry in selected:
        plan.setdefault(entry["source_id"], []).append(entry)
    planned = {source_id: [entry["symbol"] for entry in items] for source_id, items in plan.items()}
    details: dict[str, Any] = {
        "selected": len(selected),
        "eod_limit": limit,
        "today": today,
        "symbols": [entry["symbol"] for entry in selected],
        "planned": planned,
    }
    if deferred:
        details["deferred"] = [entry["series_id"] for entry in deferred]
    if unsupported:
        details["unsupported"] = unsupported
    if bool(ctx.settings.get("dry_run")):
        details["dry_run"] = True
        details["reason"] = "dry run"
        details["channels"] = {
            source_id: {"symbols": symbols} for source_id, symbols in planned.items()
        }
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": details,
        }
    if not selected:
        details["reason"] = "no stale series"
        if fresh:
            details["fresh"] = fresh
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": details,
        }

    stats: dict[str, Any] = {}
    for items in plan.values():
        _record_stats(stats, items)
    stored = 0
    skipped = 0
    failed: list[dict[str, Any]] = []
    empty: list[dict[str, Any]] = []
    stopped = ""
    unprocessed: list[str] = []

    for index, entry in enumerate(selected):
        if stopped:
            unprocessed.extend(item["series_id"] for item in selected[index:])
            break
        try:
            bars = _fetch_eod_series(ctx, entry, today, now_iso, stats)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            stopped = "rate_limited"
            skipped += 1
            failed.append({
                "series_id": entry["series_id"],
                "channel": entry["source_id"],
                "reason": "rate_limited",
                "error": _text(error)[:200],
            })
            _record_failure(stats, entry["source_id"], "rate_limited", [entry], error)
            continue
        except DataSourceError as error:
            skipped += 1
            failed.append({
                "series_id": entry["series_id"],
                "channel": entry["source_id"],
                "reason": "source_unavailable",
                "error": _text(error)[:200],
            })
            continue
        if not bars:
            skipped += 1
            empty.append({"series_id": entry["series_id"], "channel": entry["source_id"]})
            continue
        written = int(ctx.warehouse.upsert_bars(bars, entry["source_id"]))
        stored += written
        channel = _stats_for(stats, bars[0].get("source_id") or entry["source_id"])
        channel["bars"] = int(channel.get("bars", 0)) + written

    if deferred:
        skipped += len(deferred)
    if stopped and unprocessed:
        details["unprocessed"] = unprocessed
        skipped += len(unprocessed)
    details["channels"] = stats
    details["errors"] = _flatten_channel_errors(stats)
    if failed:
        details["failed"] = failed
    if empty:
        details["empty"] = empty
    if fresh:
        details["fresh"] = fresh
    if stopped:
        details["stopped"] = stopped
    if not stored:
        details["reason"] = "no daily data"
    status = "partial" if (stopped or failed) else "ok"
    LOGGER.debug(
        "market channels EOD: %d series selected, %d bar(s) stored, stopped=%s",
        len(selected), stored, stopped or "no",
    )
    return {
        "stored": int(stored),
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": status,
        "details": details,
    }


__all__ = [
    "COINGECKO",
    "COINGECKO_IDS",
    "DEFAULT_EOD_LIMIT",
    "DEFAULT_QUOTE_LIMIT",
    "DEFAULT_SINA_BATCH",
    "EOD_HISTORY_DAYS",
    "FRANKFURTER",
    "FUTURES_ROOTS",
    "INDEX_SINA_SYMBOLS",
    "MAX_EOD_LIMIT",
    "MAX_QUOTE_LIMIT",
    "MAX_SINA_BATCH",
    "SINA_FINANCE",
    "SINA_HEADERS",
    "SINA_US_FIELDS",
    "SINA_US_MAX_BARS",
    "TENCENT_FINANCE",
    "TENCENT_HEADERS",
    "coingecko_chart_url",
    "coingecko_coin_id",
    "coingecko_price_url",
    "collect_eod",
    "collect_quotes",
    "eod_entry",
    "frankfurter_latest_url",
    "frankfurter_pair",
    "frankfurter_series_url",
    "parse_coingecko_chart",
    "parse_coingecko_prices",
    "parse_frankfurter_latest",
    "parse_frankfurter_series",
    "parse_sina_futures_fields",
    "parse_sina_hk_fields",
    "parse_sina_index_fields",
    "parse_sina_quote_text",
    "parse_sina_us_daily",
    "parse_sina_us_fields",
    "parse_tencent_fields",
    "parse_tencent_kline",
    "parse_tencent_quote_text",
    "quote_entry",
    "sina_quote_url",
    "sina_us_daily_url",
    "tencent_kline_url",
    "tencent_quote_url",
]
