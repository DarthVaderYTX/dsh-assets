"""Yahoo Finance chart-API provider.

Only the public chart endpoint is used::

    GET {base_url}/v8/finance/chart/{symbol}?range=...&interval=...&includePrePost=false

The base URL is injectable so tests can point at a local HTTP stub instead of
the real network.  Network and parse failures surface as
:class:`~market_monitor.errors.ProviderUnavailableError` (HTTP 503); a failure
that only affects one symbol (for example "no data for this symbol") carries
``symbol_level=True`` so the service does not switch away from live data.

Chart history is built from long daily requests (:meth:`YahooProvider.history_daily`)
and aggregated by the range's period, because the range labels name the period
covered by one point (``1D`` daily, ``5D`` five trading days, ``1M`` calendar
month, ``3M`` quarter, ``6M`` half-year, ``1Y`` calendar year) rather than the
total window length.  The service aggregates for ``/history``; the provider's
own ``history`` method applies the same aggregation for direct SDK users.
"""

from __future__ import annotations

import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from ..analytics import (
    HISTORY_POINTS_DEFAULT,
    aggregate_daily_bars,
    chart_interval,
    history_lookback_days,
    normalize_lookback_days,
)
from ..catalog import get_instrument, normalize_symbol
from ..errors import ProviderUnavailableError
from .base import Provider, validate_range

DEFAULT_BASE_URL = "https://query1.finance.yahoo.com"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
#: How long an ``available()`` probe result is trusted (seconds).
PROBE_TTL_SECONDS = 60.0
#: Daily-bar intervals the chart endpoint understands.
DAILY_INTERVAL = "1d"
#: Conventional daily-bar counts for 1M/3M/6M/1Y.
DAILY_WINDOW_BARS: dict[str, int] = {"1M": 22, "3M": 66, "6M": 132, "1Y": 252}
#: Yahoo daily ranges in ascending coverage, with the calendar days they span.
DAILY_RANGE_SPAN_DAYS: tuple[tuple[str, int], ...] = (
    ("1y", 366),
    ("5y", 1830),
    ("10y", 3660),
)
#: Daily bars a trading calendar supplies per calendar week (used to pick a
#: fetch range that still yields ``lookback_days`` bars).
TRADING_BARS_PER_WEEK = 5
#: Yahoo instrument types mapped to the API contract's ``type`` strings.
INSTRUMENT_TYPES: dict[str, str] = {
    "EQUITY": "stock",
    "ETF": "etf",
    "INDEX": "index",
    "CRYPTOCURRENCY": "crypto",
    "CURRENCY": "forex",
    "FUTURE": "commodity",
    "MUTUALFUND": "etf",
}
#: Yahoo market states mapped to the API contract's ``market_state`` strings.
MARKET_STATES: dict[str, str] = {
    "REGULAR": "open",
    "PRE": "pre",
    "PREPRE": "pre",
    "POST": "post",
    "POSTPOST": "post",
    "CLOSED": "closed",
}


def _range_for_lookback(lookback_days: int) -> str:
    """Pick the smallest Yahoo daily range covering ``lookback_days`` bars.

    ``lookback_days`` counts daily bars, while Yahoo ranges cover trading days,
    so the request expands the span to a calendar week first (about five daily
    bars per seven calendar days) to avoid returning fewer points than asked.
    """
    calendar_span = max(
        lookback_days,
        math.ceil(lookback_days * 7 / TRADING_BARS_PER_WEEK),
    )
    for yahoo_range, span_days in DAILY_RANGE_SPAN_DAYS:
        if calendar_span <= span_days:
            return yahoo_range
    return "max"


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


def _iso_from_epoch(value: Any) -> str | None:
    """Convert an epoch-second value to an ISO UTC timestamp."""
    number = _number(value)
    if number is None:
        return None
    return (
        datetime.fromtimestamp(number, tz=timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


def _date_from_epoch(value: Any) -> str | None:
    """Convert an epoch-second value to the API contract's ``YYYY-MM-DD`` date."""
    number = _number(value)
    if number is None:
        return None
    return datetime.fromtimestamp(number, tz=timezone.utc).strftime("%Y-%m-%d")


class YahooProvider(Provider):
    """Live provider backed by Yahoo Finance's public chart API."""

    name = "yahoo"
    live = True

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 8.0,
        probe_timeout: float = 4.0,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = float(timeout)
        self.probe_timeout = float(probe_timeout)
        self.user_agent = user_agent
        self.last_probe_error: str | None = None
        self._probe_lock = threading.Lock()
        self._probe_ok = False
        self._probe_at = 0.0
        self._probe_attempted = False

    # ------------------------------------------------------------------
    # Provider interface
    # ------------------------------------------------------------------
    def available(self) -> bool:
        """Return ``True`` when a tiny chart request succeeds (cached <= 60 s)."""
        with self._probe_lock:
            if (
                self._probe_attempted
                and time.monotonic() - self._probe_at < PROBE_TTL_SECONDS
            ):
                return self._probe_ok
        try:
            self._fetch_chart("SPY", "1d", "5m", timeout=self.probe_timeout)
        except ProviderUnavailableError as exc:
            with self._probe_lock:
                self._probe_ok = False
                self._probe_at = time.monotonic()
                self._probe_attempted = True
                self.last_probe_error = str(exc)
            return False
        with self._probe_lock:
            self._probe_ok = True
            self._probe_at = time.monotonic()
            self._probe_attempted = True
            self.last_probe_error = None
        return True

    def supports(self, symbol: str) -> bool:
        """Yahoo supports any symbol the API accepts (best effort)."""
        return isinstance(symbol, str) and bool(symbol.strip())

    def quote(self, symbol: str) -> dict[str, Any]:
        """Fetch a quote from the 1-day / 5-minute chart endpoint."""
        symbol = normalize_symbol(symbol)
        result = self._fetch_chart(symbol, "1d", "5m")
        meta = result.get("meta") or {}
        series = self._series(result)
        closes = series["close"]
        price = _number(meta.get("regularMarketPrice"))
        if price is None:
            price = next((value for value in reversed(closes) if value is not None), None)
        prev_close = _number(meta.get("chartPreviousClose"))
        if prev_close is None:
            prev_close = _number(meta.get("previousClose"))
        if prev_close is None:
            prev_close = next((value for value in closes if value is not None), None)
        if price is None or prev_close is None:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned no quote data for {symbol}",
                symbol_level=True,
            )
        open_price = _number(meta.get("regularMarketOpen"))
        if open_price is None:
            open_price = next((value for value in series["open"] if value is not None), price)
        high = _number(meta.get("regularMarketDayHigh"))
        if high is None:
            high = max((value for value in series["high"] if value is not None), default=price)
        low = _number(meta.get("regularMarketDayLow"))
        if low is None:
            low = min((value for value in series["low"] if value is not None), default=price)
        volume = _number(meta.get("regularMarketVolume"))
        if volume is None:
            volume = float(sum(value for value in series["volume"] if value is not None))
        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0
        instrument = get_instrument(symbol)
        market_state = MARKET_STATES.get(
            str(meta.get("marketState") or "CLOSED").upper(), "closed"
        )
        as_of = _iso_from_epoch(meta.get("regularMarketTime"))
        if as_of is None:
            as_of = (
                datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        return {
            "symbol": symbol,
            "name": str(meta.get("shortName") or meta.get("longName") or symbol),
            "exchange": str(
                meta.get("fullExchangeName") or meta.get("exchangeName") or ""
            ),
            "type": INSTRUMENT_TYPES.get(
                str(meta.get("instrumentType") or "EQUITY").upper(), "stock"
            ),
            "sector": instrument.sector if instrument is not None else "",
            "currency": str(meta.get("currency") or "USD"),
            "price": price,
            "prev_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "open": open_price,
            "high": high,
            "low": low,
            "volume": volume,
            "market_state": market_state,
            "as_of": as_of,
            "source": self.name,
        }

    def history(
        self,
        symbol: str,
        range_: str = "1Y",
        interval: str | None = None,
    ) -> dict[str, Any]:
        """Return ~60 chart bars aggregated by the range's period.

        ``range_`` names the period each point covers; the ``interval``
        argument is accepted for interface compatibility and ignored because
        the response interval is implied by ``range_``.
        """
        symbol = normalize_symbol(symbol)
        range_ = validate_range(range_)
        if range_ in ("LIVE", "1D"):
            return {
                "symbol": symbol,
                "range": range_,
                "interval": "5m",
                "bars": self.history_intraday(symbol),
                "source": self.name,
            }
        if range_ == "5D":
            return {
                "symbol": symbol,
                "range": range_,
                "interval": "30m",
                "bars": self.history_five_day(symbol),
                "source": self.name,
            }
        count = DAILY_WINDOW_BARS[range_]
        daily = self.history_daily(symbol, int(count * 1.6) + 10)
        return {
            "symbol": symbol,
            "range": range_,
            "interval": "1d",
            "bars": daily[-count:],
            "source": self.name,
        }

    def history_intraday(self, symbol: str) -> list[dict[str, Any]]:
        """Fetch today's five-minute chart bars for the live window."""
        symbol = normalize_symbol(symbol)
        result = self._fetch_chart(symbol, "1d", "5m")
        timestamps = result.get("timestamp") or []
        series = self._series(result)
        bars: list[dict[str, Any]] = []
        for index, timestamp in enumerate(timestamps):
            open_price = self._at(series["open"], index)
            high = self._at(series["high"], index)
            low = self._at(series["low"], index)
            close = self._at(series["close"], index)
            label = _iso_from_epoch(timestamp)
            if None in (open_price, high, low, close) or label is None:
                continue
            bars.append({
                "t": label,
                "o": open_price,
                "h": high,
                "l": low,
                "c": close,
                "v": self._at(series["volume"], index) or 0.0,
            })
        if not bars:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned no intraday bars for {symbol}",
                symbol_level=True,
            )
        bars.sort(key=lambda bar: bar["t"])
        return bars

    def history_five_day(self, symbol: str) -> list[dict[str, Any]]:
        """Fetch 30-minute bars for the conventional five-day chart."""
        symbol = normalize_symbol(symbol)
        result = self._fetch_chart(symbol, "5d", "30m")
        timestamps = result.get("timestamp") or []
        series = self._series(result)
        bars: list[dict[str, Any]] = []
        for index, timestamp in enumerate(timestamps):
            open_price = self._at(series["open"], index)
            high = self._at(series["high"], index)
            low = self._at(series["low"], index)
            close = self._at(series["close"], index)
            label = _iso_from_epoch(timestamp)
            if None in (open_price, high, low, close) or label is None:
                continue
            bars.append({
                "t": label,
                "o": open_price,
                "h": high,
                "l": low,
                "c": close,
                "v": self._at(series["volume"], index) or 0.0,
            })
        if not bars:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned no five-day intraday bars for {symbol}",
                symbol_level=True,
            )
        bars.sort(key=lambda bar: bar["t"])
        return bars

    def history_daily(
        self, symbol: str, lookback_days: int
    ) -> list[dict[str, Any]]:
        """Fetch daily bars covering at least ``lookback_days`` trading days.

        The lookback is mapped to a long Yahoo chart range (``1y``/``5y``/
        ``10y``/``max``) so chart aggregation and analysis get a long daily
        series; the result is capped to what Yahoo actually returns.
        """
        symbol = normalize_symbol(symbol)
        lookback = normalize_lookback_days(lookback_days)
        result = self._fetch_chart(symbol, _range_for_lookback(lookback), DAILY_INTERVAL)
        bars = self._daily_bars_from_result(result)
        if not bars:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned no daily bars for {symbol}",
                symbol_level=True,
            )
        return bars[-lookback:]

    def _daily_bars_from_result(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """Normalise a daily chart result into ``YYYY-MM-DD`` OHLCV bars."""
        timestamps = result.get("timestamp") or []
        series = self._series(result)
        bars: list[dict[str, Any]] = []
        for index, timestamp in enumerate(timestamps):
            open_price = self._at(series["open"], index)
            high = self._at(series["high"], index)
            low = self._at(series["low"], index)
            close = self._at(series["close"], index)
            if None in (open_price, high, low, close):
                continue
            label = _date_from_epoch(timestamp)
            if label is None:
                continue
            bars.append(
                {
                    "t": label,
                    "o": open_price,
                    "h": high,
                    "l": low,
                    "c": close,
                    "v": self._at(series["volume"], index) or 0.0,
                }
            )
        bars.sort(key=lambda bar: bar["t"])
        return bars

    # ------------------------------------------------------------------
    # HTTP / parsing helpers
    # ------------------------------------------------------------------
    def _fetch_chart(
        self,
        symbol: str,
        yahoo_range: str,
        yahoo_interval: str,
        *,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """Fetch one chart result object, raising ``ProviderUnavailableError``."""
        encoded = urllib.parse.quote(symbol, safe="")
        url = (
            f"{self.base_url}/v8/finance/chart/{encoded}"
            f"?range={urllib.parse.quote(yahoo_range)}"
            f"&interval={urllib.parse.quote(yahoo_interval)}"
            "&includePrePost=false"
        )
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.timeout if timeout is None else timeout
            ) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            symbol_level = exc.code in (400, 404)
            raise ProviderUnavailableError(
                f"Yahoo Finance HTTP {exc.code} for {symbol}",
                symbol_level=symbol_level,
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ProviderUnavailableError(
                f"Yahoo Finance unreachable: {exc}"
            ) from exc
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned invalid JSON for {symbol}"
            ) from exc
        chart = payload.get("chart") if isinstance(payload, dict) else None
        if not isinstance(chart, dict):
            raise ProviderUnavailableError(
                f"Yahoo Finance returned an unexpected payload for {symbol}"
            )
        error = chart.get("error")
        if error:
            description = (
                error.get("description") if isinstance(error, dict) else str(error)
            )
            raise ProviderUnavailableError(
                f"Yahoo Finance error for {symbol}: {description}",
                symbol_level=True,
            )
        results = chart.get("result")
        if not isinstance(results, list) or not results:
            raise ProviderUnavailableError(
                f"Yahoo Finance returned no result for {symbol}",
                symbol_level=True,
            )
        return results[0]

    @staticmethod
    def _series(result: dict[str, Any]) -> dict[str, list[Any]]:
        """Extract the quote arrays from a chart result object."""
        indicators = result.get("indicators") or {}
        quotes = indicators.get("quote") or []
        first = quotes[0] if quotes else {}
        return {
            "open": list(first.get("open") or []),
            "high": list(first.get("high") or []),
            "low": list(first.get("low") or []),
            "close": list(first.get("close") or []),
            "volume": list(first.get("volume") or []),
        }

    @staticmethod
    def _at(values: list[Any], index: int) -> float | None:
        """Return the finite float at ``index`` or ``None`` when out of range."""
        if index >= len(values):
            return None
        return _number(values[index])


__all__ = [
    "DEFAULT_BASE_URL",
    "DEFAULT_USER_AGENT",
    "PROBE_TTL_SECONDS",
    "DAILY_INTERVAL",
    "DAILY_RANGE_SPAN_DAYS",
    "TRADING_BARS_PER_WEEK",
    "INSTRUMENT_TYPES",
    "MARKET_STATES",
    "YahooProvider",
]
