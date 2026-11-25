"""Deterministic offline market simulator.

The provider is a *simulator*, not a replay of real markets: it is
calendar-continuous (weekends and holidays are treated as ordinary days), it is
not aware of market hours, and it always reports ``market_state: "simulated"``.

Model
-----
* A per-symbol daily close path is anchored at :data:`ANCHOR_DATE` with the
  catalog ``base_price`` and walked forward one calendar day at a time.  Each
  day's log return is drawn from ``random.Random("<symbol>:<YYYY-MM-DD>")``::

      log_return = annual_drift / 252 + annual_vol / sqrt(252) * gauss()

  The path is also extended *backwards* from the anchor on demand (the same
  per-day seed, inverted) so chart aggregation can render decades of history:
  60 monthly points need five years, 60 quarterly points fifteen years, and
  60 annual points sixty years.  Both directions are deterministic and the
  forward path (and therefore every quote) is unchanged.

* Today's intraday path consists of 288 five-minute UTC buckets whose returns
  are seeded by ``random.Random("<symbol>:<YYYY-MM-DD>:<bucket>")``::

      bucket_return = (daily_drift + daily_vol * gauss()) / sqrt(288)

  where ``daily_drift``/``daily_vol`` are the daily forms of the annual
  parameters.  The path starts at yesterday's close and the current price is
  the last elapsed bucket close.

* Chart history aggregates that daily path: the ``range`` argument names the
  period covered by one point (``1D`` daily, ``5D`` five trading days, ``1M``
  calendar month, ``3M`` quarter, ``6M`` half-year, ``1Y`` calendar year), not
  the total window length.  See :func:`market_monitor.analytics.aggregate_daily_bars`.

* Daily OHLC bars for completed days are memoised per symbol so the long
  lookback is generated once per process instead of on every chart request.

* Volume is a plausible per-type base scaled by a seeded factor and by the
  fraction of the UTC day elapsed.

Symbols outside the catalog get deterministic defaults derived from a SHA-256
hash of the symbol (price 20..400, volatility 0.20..0.45, drift -0.05..0.15),
so arbitrary symbols work offline.
"""

from __future__ import annotations

import hashlib
import math
import random
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from ..analytics import (
    HISTORY_POINTS_DEFAULT,
    aggregate_daily_bars,
    chart_interval,
    history_lookback_days,
    normalize_lookback_days,
)
from ..catalog import Instrument, get_instrument, is_valid_symbol, normalize_symbol
from .base import Provider, validate_range

#: First simulated day; the catalog ``base_price`` is the close of this day.
ANCHOR_DATE = date(2024, 1, 1)
#: Number of five-minute buckets in one UTC day.
BUCKETS_PER_DAY = 288
#: Seconds per intraday bucket.
BUCKET_SECONDS = 300
#: Trading days per year used to annualise daily drift/volatility.
TRADING_DAYS_PER_YEAR = 252
#: Maximum days kept in a cached intraday path map before pruning.
_INTRADAY_CACHE_LIMIT = 600
#: Maximum number of cached daily OHLC bars per symbol before pruning.
_DAILY_BAR_CACHE_LIMIT = 30_000
#: Conventional daily-bar counts for 1M/3M/6M/1Y.
DAILY_WINDOW_BARS: dict[str, int] = {"1M": 22, "3M": 66, "6M": 132, "1Y": 252}
#: Simulated regular session used by the five-day chart (UTC minutes).
SESSION_START_MINUTES = 9 * 60 + 30
SESSION_END_MINUTES = 16 * 60


def _format_ts(moment: datetime) -> str:
    """Format a UTC datetime as the API contract's ISO timestamp."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class SyntheticProvider(Provider):
    """Deterministic, dependency-free market data simulator.

    Parameters
    ----------
    now_fn:
        Callable returning the current epoch seconds.  Injecting a fixed clock
        makes every quote and bar reproducible in tests.
    """

    name = "synthetic"
    live = False

    def __init__(self, now_fn: Callable[[], float] = time.time) -> None:
        self._now_fn = now_fn
        self._daily_paths: dict[str, dict[date, float]] = {}
        self._path_through: dict[str, date] = {}
        self._path_from: dict[str, date] = {}
        self._intraday_paths: dict[tuple[str, date], list[float]] = {}
        self._daily_bar_cache: dict[tuple[str, date], dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Provider interface
    # ------------------------------------------------------------------
    def available(self) -> bool:
        """The simulator is always available."""
        return True

    def supports(self, symbol: str) -> bool:
        """The simulator can synthesise any valid symbol."""
        return is_valid_symbol(symbol)

    def quote(self, symbol: str) -> dict[str, Any]:
        """Return a deterministic simulated quote for ``symbol``."""
        symbol = normalize_symbol(symbol)
        instrument = self._params(symbol)
        now = self._now()
        today = now.date()
        prev_close = self._close(symbol, self._previous_weekday(today))
        elapsed = self._elapsed_buckets(now)
        prices = self._intraday_prices(symbol, today)[:elapsed]
        price = prices[-1]
        open_price = prev_close
        high = max([open_price, *prices])
        low = min([open_price, *prices])
        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0
        volume = self._volume(
            instrument, symbol, today, fraction=elapsed / BUCKETS_PER_DAY
        )
        return {
            "symbol": symbol,
            "name": instrument.name,
            "exchange": instrument.exchange,
            "type": instrument.type,
            "sector": instrument.sector,
            "currency": instrument.currency,
            "price": price,
            "prev_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "open": open_price,
            "high": high,
            "low": low,
            "volume": volume,
            "market_state": "simulated",
            "as_of": _format_ts(now),
            "source": self.name,
        }

    def history(
        self,
        symbol: str,
        range_: str = "1Y",
        interval: str | None = None,
    ) -> dict[str, Any]:
        """Return ~60 simulated chart bars aggregated by the range's period.

        See :meth:`history_daily` for the underlying daily series; the
        ``interval`` argument is accepted for interface compatibility and
        ignored because the response interval is implied by ``range_``.
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
        lookback = int(count * 1.6) + 10
        daily = self.history_daily(symbol, lookback)
        return {
            "symbol": symbol,
            "range": range_,
            "interval": "1d",
            "bars": daily[-count:],
            "source": self.name,
        }

    def history_five_day(self, symbol: str) -> list[dict[str, Any]]:
        """Return 30-minute bars for the last five weekday regular sessions."""
        symbol = normalize_symbol(symbol)
        now = self._now()
        today = now.date()
        weekdays: list[date] = []
        cursor = today
        while len(weekdays) < 5:
            if cursor.weekday() < 5:
                weekdays.append(cursor)
            cursor -= timedelta(days=1)
        bucket_seconds = 30 * 60
        buckets_per_bar = bucket_seconds // BUCKET_SECONDS
        session_start_bucket = SESSION_START_MINUTES * 60 // BUCKET_SECONDS
        session_buckets = (
            SESSION_END_MINUTES - SESSION_START_MINUTES
        ) * 60 // BUCKET_SECONDS
        instrument = self._params(symbol)
        bars: list[dict[str, Any]] = []
        for day in reversed(weekdays):
            if day == today:
                elapsed_minutes = now.hour * 60 + now.minute - SESSION_START_MINUTES
                elapsed = min(session_buckets, max(0, elapsed_minutes // 5))
            else:
                elapsed = session_buckets
            if elapsed <= 0:
                continue
            prices = self._intraday_prices(symbol, day)
            day_start = datetime(
                day.year, day.month, day.day, tzinfo=timezone.utc
            )
            day_volume = self._volume(
                instrument, symbol, day, fraction=elapsed / BUCKETS_PER_DAY
            )
            previous = self._close(symbol, self._previous_weekday(day))
            start = 0
            while start < elapsed:
                chunk = prices[
                    session_start_bucket + start:
                    session_start_bucket + min(start + buckets_per_bar, elapsed)
                ]
                if not chunk:
                    break
                close = chunk[-1]
                wiggle = abs(
                    random.Random(
                        f"{symbol}:{day.isoformat()}:five:{start}"
                    ).gauss(0.0, 1.0)
                ) * 0.0004
                high = max([previous, *chunk]) * (1.0 + wiggle)
                low = min([previous, *chunk]) * (1.0 - wiggle)
                bars.append({
                    "t": _format_ts(
                        day_start
                        + timedelta(
                            seconds=SESSION_START_MINUTES * 60 + start * BUCKET_SECONDS
                        )
                    ),
                    "o": previous,
                    "h": high,
                    "l": max(low, 0.01),
                    "c": close,
                    "v": day_volume * len(chunk) / elapsed,
                })
                previous = close
                start += buckets_per_bar
        return bars

    def history_intraday(self, symbol: str) -> list[dict[str, Any]]:
        """Return today's five-minute bars through the current UTC bucket."""
        symbol = normalize_symbol(symbol)
        now = self._now()
        today = now.date()
        elapsed = self._elapsed_buckets(now)
        previous = self._close(symbol, self._previous_weekday(today))
        prices = self._intraday_prices(symbol, today)
        day_start = datetime(
            today.year, today.month, today.day, tzinfo=timezone.utc
        )
        instrument = self._params(symbol)
        day_volume = self._volume(
            instrument, symbol, today, fraction=elapsed / BUCKETS_PER_DAY
        )
        bucket_volume = int(day_volume / elapsed) if elapsed else 0
        bars: list[dict[str, Any]] = []
        for index in range(elapsed):
            price = prices[index]
            wiggle = abs(
                random.Random(
                    f"{symbol}:{today.isoformat()}:live:{index}"
                ).gauss(0.0, 1.0)
            ) * 0.0004
            high = max(previous, price) * (1.0 + wiggle)
            low = min(previous, price) * (1.0 - wiggle)
            bars.append({
                "t": _format_ts(day_start + timedelta(seconds=index * BUCKET_SECONDS)),
                "o": previous,
                "h": high,
                "l": max(low, 0.01),
                "c": price,
                "v": bucket_volume,
            })
            previous = price
        return bars

    def history_daily(
        self, symbol: str, lookback_days: int
    ) -> list[dict[str, Any]]:
        """Return roughly ``lookback_days`` daily bars ending today.

        Bars cover weekdays only (the conventional trading calendar); holidays
        are not modelled. The close path is extended backwards deterministically
        from :data:`ANCHOR_DATE`, and today's partial bar uses the intraday path
        so its close equals :meth:`quote`'s price.
        """
        symbol = normalize_symbol(symbol)
        lookback = normalize_lookback_days(lookback_days)
        today = self._now().date()
        earliest = today - timedelta(days=int(lookback * 1.6) + 10)
        self._ensure_backward_path(symbol, earliest)
        days: list[date] = []
        cursor = today
        while len(days) < lookback:
            if cursor.weekday() < 5:
                days.append(cursor)
            cursor -= timedelta(days=1)
        days.reverse()
        return [self._daily_bar(symbol, day) for day in days]

    # ------------------------------------------------------------------
    # Clock helpers
    # ------------------------------------------------------------------
    def _now(self) -> datetime:
        """Return the injected clock as an aware UTC datetime."""
        return datetime.fromtimestamp(float(self._now_fn()), tz=timezone.utc)

    @staticmethod
    def _elapsed_buckets(now: datetime) -> int:
        """Return how many of the day's 288 buckets have elapsed (1..288)."""
        seconds = (
            now.hour * 3600
            + now.minute * 60
            + now.second
            + now.microsecond / 1_000_000.0
        )
        elapsed = int(seconds // BUCKET_SECONDS) + 1
        return max(1, min(BUCKETS_PER_DAY, elapsed))

    # ------------------------------------------------------------------
    # Instrument parameters
    # ------------------------------------------------------------------
    @staticmethod
    def _params(symbol: str) -> Instrument:
        """Return catalog parameters, or deterministic defaults for unknown symbols."""
        instrument = get_instrument(symbol)
        if instrument is not None:
            return instrument
        digest = hashlib.sha256(symbol.encode("utf-8")).hexdigest()
        first = int(digest[0:8], 16)
        second = int(digest[8:16], 16)
        third = int(digest[16:24], 16)
        return Instrument(
            symbol=symbol,
            name=symbol,
            exchange="SIM",
            type="stock",
            sector="Unknown",
            currency="USD",
            base_price=20.0 + (first % 38_000) / 100.0,
            annual_drift=-0.05 + (third % 20_001) / 100_000.0,
            annual_vol=0.20 + (second % 2_501) / 10_000.0,
            volume_base=40_000_000.0,
        )

    @staticmethod
    def _previous_weekday(day: date) -> date:
        """Return the previous weekday (Friday for Monday/weekend)."""
        cursor = day - timedelta(days=1)
        while cursor.weekday() >= 5:
            cursor -= timedelta(days=1)
        return cursor

    @staticmethod
    def _daily_drift(instrument: Instrument) -> float:
        """Daily log-drift implied by the annual drift parameter."""
        return instrument.annual_drift / TRADING_DAYS_PER_YEAR

    @staticmethod
    def _daily_vol(instrument: Instrument) -> float:
        """Daily volatility implied by the annual volatility parameter."""
        return instrument.annual_vol / math.sqrt(TRADING_DAYS_PER_YEAR)

    # ------------------------------------------------------------------
    # Daily close path
    # ------------------------------------------------------------------
    def _ensure_daily_path(self, symbol: str) -> dict[date, float]:
        """Build or extend the per-symbol daily close path through today."""
        today = self._now().date()
        path = self._daily_paths.get(symbol)
        if path is None:
            instrument = self._params(symbol)
            path = {ANCHOR_DATE: float(instrument.base_price)}
            self._daily_paths[symbol] = path
            self._path_through[symbol] = ANCHOR_DATE
            self._path_from[symbol] = ANCHOR_DATE
            if today <= ANCHOR_DATE:
                return path
        through = self._path_through[symbol]
        if through >= today:
            return path
        close = path[through]
        instrument = self._params(symbol)
        drift = self._daily_drift(instrument)
        vol = self._daily_vol(instrument)
        current = through
        while current < today:
            current += timedelta(days=1)
            rng = random.Random(f"{symbol}:{current.isoformat()}")
            log_return = drift + vol * rng.gauss(0.0, 1.0)
            close = max(close * math.exp(log_return), 0.01)
            path[current] = close
        self._path_through[symbol] = today
        return path

    def _ensure_backward_path(self, symbol: str, earliest: date) -> dict[date, float]:
        """Extend the daily close path backwards deterministically to ``earliest``.

        The anchored value at :data:`ANCHOR_DATE` and every day after it are
        never modified, so quotes, the intraday path and the forward daily path
        keep their existing deterministic values.
        """
        path = self._ensure_daily_path(symbol)
        current = self._path_from.get(symbol, min(path))
        instrument = self._params(symbol)
        drift = self._daily_drift(instrument)
        vol = self._daily_vol(instrument)
        while current > earliest:
            newer = current
            current -= timedelta(days=1)
            rng = random.Random(f"{symbol}:{current.isoformat()}")
            log_return = drift + vol * rng.gauss(0.0, 1.0)
            path[current] = max(path[newer] / math.exp(log_return), 0.01)
        self._path_from[symbol] = current
        return path

    def _close(self, symbol: str, day: date) -> float:
        """Return the simulated close for ``day``, clamped to the anchored path."""
        path = self._ensure_daily_path(symbol)
        value = path.get(day)
        if value is not None:
            return value
        instrument = self._params(symbol)
        if day < ANCHOR_DATE or not path:
            return float(instrument.base_price)
        return path[max(path)]

    # ------------------------------------------------------------------
    # Intraday path
    # ------------------------------------------------------------------
    def _intraday_prices(self, symbol: str, day: date) -> list[float]:
        """Return the full 288-bucket simulated price path for ``day``."""
        key = (symbol, day)
        cached = self._intraday_paths.get(key)
        if cached is not None:
            return cached
        instrument = self._params(symbol)
        daily_drift = self._daily_drift(instrument)
        daily_vol = self._daily_vol(instrument)
        start = self._close(symbol, self._previous_weekday(day))
        prices: list[float] = []
        price = start
        scale = math.sqrt(BUCKETS_PER_DAY)
        for bucket in range(BUCKETS_PER_DAY):
            rng = random.Random(f"{symbol}:{day.isoformat()}:{bucket}")
            bucket_return = (daily_drift + daily_vol * rng.gauss(0.0, 1.0)) / scale
            price = max(price * math.exp(bucket_return), 0.01)
            prices.append(price)
        if len(self._intraday_paths) > _INTRADAY_CACHE_LIMIT:
            cutoff = day - timedelta(days=2)
            self._intraday_paths = {
                cache_key: value
                for cache_key, value in self._intraday_paths.items()
                if cache_key[1] >= cutoff
            }
        self._intraday_paths[key] = prices
        return prices

    # ------------------------------------------------------------------
    # Daily bars
    # ------------------------------------------------------------------
    def _daily_bar(self, symbol: str, day: date) -> dict[str, Any]:
        """Return one daily bar; today's bar derives from the intraday path.

        Completed days are memoised per symbol because chart aggregation may
        request decades of them; today's partial bar is never memoised.
        """
        today = self._now().date()
        memo_key = (symbol, day)
        if day != today:
            cached = self._daily_bar_cache.get(memo_key)
            if cached is not None:
                return dict(cached)
        close = self._close(symbol, day)
        prev_close = self._close(symbol, self._previous_weekday(day))
        instrument = self._params(symbol)
        if day == today:
            elapsed = self._elapsed_buckets(self._now())
            prices = self._intraday_prices(symbol, day)[:elapsed]
            high = max([prev_close, *prices])
            low = min([prev_close, *prices])
            volume = self._volume(
                instrument, symbol, day, fraction=elapsed / BUCKETS_PER_DAY
            )
            return {
                "t": day.isoformat(),
                "o": prev_close,
                "h": high,
                "l": low,
                "c": prices[-1],
                "v": volume,
            }
        rng = random.Random(f"{symbol}:{day.isoformat()}:ohlc")
        daily_vol = self._daily_vol(instrument)
        open_price = max(prev_close * math.exp(rng.gauss(0.0, daily_vol * 0.3)), 0.01)
        high_extra = abs(rng.gauss(0.0, daily_vol * 0.4))
        low_extra = abs(rng.gauss(0.0, daily_vol * 0.4))
        high = max(open_price, close) * (1.0 + high_extra)
        low = max(min(open_price, close) * (1.0 - low_extra), 0.01)
        volume = self._volume(instrument, symbol, day, fraction=1.0)
        bar = {
            "t": day.isoformat(),
            "o": open_price,
            "h": high,
            "l": low,
            "c": close,
            "v": volume,
        }
        if len(self._daily_bar_cache) > _DAILY_BAR_CACHE_LIMIT:
            cutoff = today - timedelta(days=_DAILY_BAR_CACHE_LIMIT // 2)
            self._daily_bar_cache = {
                cache_key: value
                for cache_key, value in self._daily_bar_cache.items()
                if cache_key[1] >= cutoff
            }
        self._daily_bar_cache[memo_key] = bar
        return dict(bar)

    # ------------------------------------------------------------------
    # Volume
    # ------------------------------------------------------------------
    @staticmethod
    def _volume(
        instrument: Instrument,
        symbol: str,
        day: date,
        *,
        fraction: float,
    ) -> float:
        """Return deterministic volume scaled by a seeded factor and day fraction."""
        if instrument.volume_base <= 0:
            return 0.0
        rng = random.Random(f"{symbol}:{day.isoformat()}:volume")
        factor = 0.65 + 0.7 * rng.random()
        return float(int(instrument.volume_base * factor * max(0.0, fraction)))


__all__ = [
    "ANCHOR_DATE",
    "BUCKETS_PER_DAY",
    "BUCKET_SECONDS",
    "TRADING_DAYS_PER_YEAR",
    "SyntheticProvider",
]
