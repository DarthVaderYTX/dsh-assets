"""Analysis, signals, overlay series and screener metrics.

Everything here is pure: input is a quote and OHLCV bars, output is the JSON
shape described by ``docs/API.md``.  Missing or short data never raises; the
affected fields are ``null``.  ``overlays`` reuses the same indicator math (and
rounding) as ``/analysis`` so chart overlays match the report values.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any, Mapping, Sequence

from . import indicators
from .errors import InvalidArgumentError

SMA_OVERLAY_PERIODS: tuple[int, ...] = (20, 50)
RSI_PERIOD = 14
BOLLINGER_PERIOD = 20
BOLLINGER_STD = 2.0

# ----------------------------------------------------------------------
# Chart history aggregation
# ----------------------------------------------------------------------
#: Default number of points returned by a chart history response.
HISTORY_POINTS_DEFAULT = 60
#: Accepted bounds for the ``history_points`` service setting.
HISTORY_POINTS_MIN = 20
HISTORY_POINTS_MAX = 120
#: Extra aggregation periods fetched so weekends/holidays cannot starve the
#: newest ``history_points`` groups.
HISTORY_LOOKBACK_BUFFER_PERIODS = 2
#: Largest daily lookback a provider accepts (safety bound for the simulator
#: and for the Yahoo range selection).
HISTORY_LOOKBACK_MAX_DAYS = 50_000
#: Chart range -> aggregation interval label (one bar per period).
CHART_INTERVALS: dict[str, str] = {
    "1D": "1d",
    "5D": "5d",
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1Y": "1y",
}
#: Calendar days covered by one aggregation period of each chart range.
CHART_PERIOD_DAYS: dict[str, int] = {
    "1D": 1,
    "5D": 5,
    "1M": 31,
    "3M": 92,
    "6M": 184,
    "1Y": 366,
}
#: Trading days aggregated into one ``5D`` point.
FIVE_DAY_GROUP_SIZE = 5


# ----------------------------------------------------------------------
# Small numeric helpers
# ----------------------------------------------------------------------
def _num(value: Any) -> float | None:
    """Return ``value`` as a finite float or ``None``."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _round(value: Any, digits: int = 4) -> float | None:
    """Round a finite number for output, preserving ``None``."""
    number = _num(value)
    if number is None:
        return None
    return round(number, digits)


def _clamp(value: float, low: float = -1.0, high: float = 1.0) -> float:
    """Clamp ``value`` into ``[low, high]``."""
    return max(low, min(high, value))


def _bar_closes(bars: Sequence[Mapping[str, Any]]) -> list[float]:
    """Return the valid close prices of ``bars``."""
    closes: list[float] = []
    for bar in bars:
        close = _num(bar.get("c"))
        if close is not None:
            closes.append(close)
    return closes


def _avg_daily_range_pct(bars: Sequence[Mapping[str, Any]]) -> float | None:
    """Return the average (high - low) / previous close as a percentage."""
    ranges: list[float] = []
    previous: float | None = None
    for bar in bars:
        high = _num(bar.get("h"))
        low = _num(bar.get("l"))
        close = _num(bar.get("c"))
        if high is not None and low is not None and previous:
            ranges.append((high - low) / previous * 100.0)
        previous = close
    if not ranges:
        return None
    return sum(ranges) / len(ranges)


# ----------------------------------------------------------------------
# Chart range aggregation helpers
# ----------------------------------------------------------------------
def clamp_history_points(
    value: Any, default: int = HISTORY_POINTS_DEFAULT
) -> int:
    """Coerce ``value`` into the accepted ``history_points`` range."""
    if value is None or isinstance(value, bool):
        return default
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default
    return max(HISTORY_POINTS_MIN, min(HISTORY_POINTS_MAX, number))


def chart_interval(range_: str) -> str:
    """Return the aggregation interval label for a chart ``range_``."""
    try:
        return CHART_INTERVALS[range_]
    except KeyError:
        raise InvalidArgumentError(
            f"invalid range: {range_!r} (expected one of"
            f" {', '.join(CHART_INTERVALS)})"
        ) from None


def history_period_days(range_: str) -> int:
    """Return how many calendar days one chart point of ``range_`` covers."""
    try:
        return CHART_PERIOD_DAYS[range_]
    except KeyError:
        raise InvalidArgumentError(
            f"invalid range: {range_!r} (expected one of"
            f" {', '.join(CHART_PERIOD_DAYS)})"
        ) from None


def history_lookback_days(range_: str, points: Any = None) -> int:
    """Return the daily history span needed for ``points`` aggregated bars."""
    target = clamp_history_points(points)
    return history_period_days(range_) * (target + HISTORY_LOOKBACK_BUFFER_PERIODS)


def normalize_lookback_days(value: Any) -> int:
    """Validate a provider ``lookback_days`` argument."""
    if isinstance(value, bool) or value is None:
        raise InvalidArgumentError("lookback_days must be a positive integer")
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        raise InvalidArgumentError(
            "lookback_days must be a positive integer"
        ) from None
    if number < 1:
        raise InvalidArgumentError("lookback_days must be a positive integer")
    if number > HISTORY_LOOKBACK_MAX_DAYS:
        raise InvalidArgumentError(
            f"lookback_days must be at most {HISTORY_LOOKBACK_MAX_DAYS}"
        )
    return number


def _bar_day(bar: Mapping[str, Any]) -> date | None:
    """Return the trading date encoded by a daily bar label."""
    label = bar.get("t")
    if not isinstance(label, str) or len(label) < 10:
        return None
    try:
        return date.fromisoformat(label[:10])
    except ValueError:
        return None


def _clean_daily_bars(
    bars: Sequence[Mapping[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Normalise daily bars to ascending ``YYYY-MM-DD`` OHLCV rows."""
    cleaned: list[dict[str, Any]] = []
    for bar in bars or []:
        if not isinstance(bar, Mapping):
            continue
        day = _bar_day(bar)
        if day is None:
            continue
        open_price = _num(bar.get("o"))
        high = _num(bar.get("h"))
        low = _num(bar.get("l"))
        close = _num(bar.get("c"))
        if None in (open_price, high, low, close):
            continue
        volume = _num(bar.get("v"))
        cleaned.append(
            {
                "t": day.isoformat(),
                "o": open_price,
                "h": high,
                "l": low,
                "c": close,
                "v": volume if volume is not None else 0.0,
            }
        )
    cleaned.sort(key=lambda bar: bar["t"])
    return cleaned


def _aggregate_group(group: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Aggregate one period of daily bars into a single OHLCV bar."""
    return {
        "t": str(group[-1]["t"]),
        "o": float(group[0]["o"]),
        "h": max(float(bar["h"]) for bar in group),
        "l": min(float(bar["l"]) for bar in group),
        "c": float(group[-1]["c"]),
        "v": math.fsum(float(bar["v"]) for bar in group),
    }


def _calendar_bucket(range_: str, day: date) -> tuple[int, int]:
    """Return the aggregation bucket key of ``day`` for a calendar range."""
    if range_ == "1M":
        return (day.year, day.month)
    if range_ == "3M":
        return (day.year, (day.month - 1) // 3)
    if range_ == "6M":
        return (day.year, 0 if day.month <= 6 else 1)
    return (day.year, 0)


def aggregate_daily_bars(
    bars: Sequence[Mapping[str, Any]] | None,
    range_: str,
    points: Any = None,
) -> list[dict[str, Any]]:
    """Aggregate a daily OHLCV series into about ``points`` chart bars.

    The chart range labels describe the *period per point*, not the total
    window: ``1D`` keeps daily bars, ``5D`` groups five consecutive daily bars,
    ``1M``/``3M``/``6M``/``1Y`` group by calendar month/quarter/half-year/year.
    Each aggregated bar keeps the first open, the highest high, the lowest low,
    the last close and the summed volume, timestamped with the last daily bar's
    date.  The newest ``points`` groups are returned in ascending order; short
    history yields the bars that exist instead of invented data.
    """
    target = clamp_history_points(points)
    chart_interval(range_)  # validates the range early
    daily = _clean_daily_bars(bars)
    if not daily:
        return []
    if range_ == "1D":
        return [dict(bar) for bar in daily[-target:]]
    if range_ == "5D":
        groups: list[list[dict[str, Any]]] = []
        end = len(daily)
        while end > 0:
            start = max(0, end - FIVE_DAY_GROUP_SIZE)
            groups.append(daily[start:end])
            end = start
        groups.reverse()
        return [_aggregate_group(group) for group in groups[-target:]]
    buckets: list[tuple[tuple[int, int], list[dict[str, Any]]]] = []
    for bar in daily:
        day = date.fromisoformat(bar["t"])
        key = _calendar_bucket(range_, day)
        if buckets and buckets[-1][0] == key:
            buckets[-1][1].append(bar)
        else:
            buckets.append((key, [bar]))
    return [
        _aggregate_group(group)
        for _, group in buckets[-target:]
    ]


# ----------------------------------------------------------------------
# Core evaluation shared by /analysis and the screener
# ----------------------------------------------------------------------
def _trend(
    price: float | None,
    sma20: float | None,
    sma50: float | None,
    sma200: float | None,
) -> str:
    """Classify the trend as ``uptrend``, ``downtrend`` or ``sideways``."""
    if price is None:
        return "sideways"
    if sma50 is not None:
        if price > sma50 and (sma20 is None or sma20 > sma50):
            if sma200 is not None and price < sma200:
                return "sideways"
            return "uptrend"
        if price < sma50 and (sma20 is None or sma20 < sma50):
            if sma200 is not None and price > sma200:
                return "sideways"
            return "downtrend"
        return "sideways"
    if sma20 is not None:
        return "uptrend" if price > sma20 else "downtrend"
    return "sideways"


def classify_trend(price: float | None, closes: Sequence[float]) -> str:
    """Classify the trend from a price and daily closes (public helper)."""
    sma20 = indicators.sma(closes, 20)
    sma50 = indicators.sma(closes, 50)
    sma200 = indicators.sma(closes, 200)
    return _trend(price, sma20, sma50, sma200)


def _momentum(
    rsi14: float | None,
    macd_block: Mapping[str, float] | None,
    closes: Sequence[float],
) -> str:
    """Classify momentum as ``positive``, ``negative`` or ``neutral``."""
    histogram = _num(macd_block.get("histogram")) if macd_block else None
    if rsi14 is not None:
        if rsi14 >= 55.0:
            return "positive"
        if rsi14 <= 45.0:
            return "negative"
    if histogram is not None:
        if histogram > 0.0:
            return "positive"
        if histogram < 0.0:
            return "negative"
    if len(closes) >= 21 and closes[-21]:
        change = closes[-1] / closes[-21] - 1.0
        if change > 0.02:
            return "positive"
        if change < -0.02:
            return "negative"
    return "neutral"


def _volatility(annualized_volatility: float | None) -> str:
    """Classify volatility as ``low``, ``moderate`` or ``high``."""
    if annualized_volatility is None:
        return "moderate"
    percent = annualized_volatility * 100.0
    if percent < 20.0:
        return "low"
    if percent < 35.0:
        return "moderate"
    return "high"


def _confidence(bar_count: int, score: float) -> str:
    """Classify confidence from history length and signal strength."""
    magnitude = abs(score)
    if bar_count >= 200 and magnitude >= 0.35:
        return "high"
    if bar_count >= 60 and magnitude >= 0.12:
        return "medium"
    return "low"


def _signal(
    signal_id: str,
    label: str,
    direction: str,
    strength: float,
    detail: str,
) -> dict[str, Any]:
    """Build one signal entry, clamping strength into ``0..1``."""
    return {
        "id": signal_id,
        "label": label,
        "direction": direction,
        "strength": round(_clamp(strength, 0.0, 1.0), 2),
        "detail": detail,
    }


def _build_signals(
    *,
    price: float | None,
    closes: Sequence[float],
    bars: Sequence[Mapping[str, Any]],
    sma20: float | None,
    sma50: float | None,
    sma200: float | None,
    rsi14: float | None,
    macd_block: Mapping[str, float] | None,
    bollinger_block: Mapping[str, float] | None,
) -> tuple[list[dict[str, Any]], float]:
    """Return the bullish/bearish signal list and the composite -1..1 score."""
    signals: list[dict[str, Any]] = []

    # 1. Short/medium moving-average alignment.
    if price is not None and sma20 is not None and sma50 is not None:
        if price > sma20 > sma50:
            signals.append(
                _signal(
                    "trend_alignment",
                    "Price above 20/50-day averages",
                    "bullish",
                    0.8,
                    f"Price {price:.2f} > SMA20 {sma20:.2f} > SMA50 {sma50:.2f}",
                )
            )
        elif price < sma20 < sma50:
            signals.append(
                _signal(
                    "trend_alignment",
                    "Price below 20/50-day averages",
                    "bearish",
                    0.8,
                    f"Price {price:.2f} < SMA20 {sma20:.2f} < SMA50 {sma50:.2f}",
                )
            )
        else:
            signals.append(
                _signal(
                    "trend_alignment",
                    "Price between 20/50-day averages",
                    "neutral",
                    0.15,
                    f"Price {price:.2f}, SMA20 {sma20:.2f}, SMA50 {sma50:.2f}",
                )
            )

    # 2. 20/50-day cross state.
    if sma20 is not None and sma50 is not None and sma50:
        gap_pct = (sma20 / sma50 - 1.0) * 100.0
        direction = "bullish" if gap_pct > 0 else "bearish" if gap_pct < 0 else "neutral"
        strength = min(0.6, abs(gap_pct) / 5.0 * 0.6)
        label = (
            "20-day average above 50-day average"
            if gap_pct >= 0
            else "20-day average below 50-day average"
        )
        signals.append(
            _signal(
                "sma_cross_20_50",
                label,
                direction,
                strength,
                f"SMA20 {sma20:.2f} vs SMA50 {sma50:.2f} ({gap_pct:+.2f}%)",
            )
        )

    # 3. Long-term trend filter.
    if price is not None and sma200 is not None:
        if price > sma200:
            signals.append(
                _signal(
                    "long_term_trend",
                    "Price above the 200-day average",
                    "bullish",
                    0.5,
                    f"Price {price:.2f} > SMA200 {sma200:.2f}",
                )
            )
        elif price < sma200:
            signals.append(
                _signal(
                    "long_term_trend",
                    "Price below the 200-day average",
                    "bearish",
                    0.5,
                    f"Price {price:.2f} < SMA200 {sma200:.2f}",
                )
            )

    # 4. RSI regime (mean reversion at the extremes, momentum in between).
    if rsi14 is not None:
        if rsi14 >= 70.0:
            direction, strength, label = (
                "bearish",
                0.4,
                "Overbought RSI(14)",
            )
        elif rsi14 <= 30.0:
            direction, strength, label = "bullish", 0.4, "Oversold RSI(14)"
        elif rsi14 >= 55.0:
            direction, strength, label = "bullish", 0.3, "Positive RSI momentum"
        elif rsi14 <= 45.0:
            direction, strength, label = "bearish", 0.3, "Negative RSI momentum"
        else:
            direction, strength, label = "neutral", 0.15, "Neutral RSI"
        signals.append(
            _signal(
                "rsi_regime",
                label,
                direction,
                strength,
                f"RSI(14) at {rsi14:.1f}",
            )
        )

    # 5. MACD momentum.
    if macd_block is not None:
        histogram = _num(macd_block.get("histogram"))
        if histogram is not None:
            direction = "bullish" if histogram > 0 else "bearish" if histogram < 0 else "neutral"
            signals.append(
                _signal(
                    "macd_momentum",
                    "MACD histogram above the signal line"
                    if histogram >= 0
                    else "MACD histogram below the signal line",
                    direction,
                    0.5 if histogram != 0 else 0.1,
                    f"MACD histogram {histogram:+.2f}",
                )
            )

    # 6. Bollinger band position / breakout.
    if price is not None and bollinger_block is not None:
        upper = _num(bollinger_block.get("upper"))
        lower = _num(bollinger_block.get("lower"))
        if upper is not None and lower is not None:
            if price > upper:
                direction, strength, label = (
                    "bullish",
                    0.45,
                    "Bollinger breakout above the upper band",
                )
            elif price < lower:
                direction, strength, label = (
                    "bearish",
                    0.45,
                    "Bollinger breakdown below the lower band",
                )
            else:
                direction, strength, label = (
                    "neutral",
                    0.15,
                    "Price inside the Bollinger bands",
                )
            signals.append(
                _signal(
                    "bollinger_position",
                    label,
                    direction,
                    strength,
                    f"Bands {lower:.2f} .. {upper:.2f}",
                )
            )

    # 7. 20-day price momentum.
    if len(closes) >= 21 and closes[-21]:
        momentum_pct = (closes[-1] / closes[-21] - 1.0) * 100.0
        if abs(momentum_pct) >= 0.5:
            direction = "bullish" if momentum_pct > 0 else "bearish"
            signals.append(
                _signal(
                    "momentum_20d",
                    "Positive 20-day momentum"
                    if momentum_pct > 0
                    else "Negative 20-day momentum",
                    direction,
                    min(0.5, abs(momentum_pct) / 10.0 * 0.5),
                    f"20-day return {momentum_pct:+.2f}%",
                )
            )

    # 8. Volume surge confirmation (informational context, not directional).
    volumes = [
        _num(bar.get("v")) for bar in bars if _num(bar.get("v")) is not None
    ]
    if len(volumes) >= 21:
        recent = volumes[-1]
        window = [volume for volume in volumes[-21:-1] if volume is not None]
        average = sum(window) / len(window) if window else 0.0
        if average > 0 and recent is not None:
            ratio = recent / average
            if ratio >= 1.5:
                signals.append(
                    _signal(
                        "volume_surge",
                        "Volume above the 20-day average",
                        "neutral",
                        min(0.35, (ratio - 1.0) * 0.2),
                        f"Volume {ratio:.2f}x the 20-day average",
                    )
                )

    # 9. Distance from the 52-week high.
    highs = [
        _num(bar.get("h")) for bar in bars if _num(bar.get("h")) is not None
    ]
    if price is not None and highs:
        high_52w = max(highs)
        if high_52w:
            distance = (price / high_52w - 1.0) * 100.0
            if distance > -3.0:
                signals.append(
                    _signal(
                        "near_52w_high",
                        "Trading near the 52-week high",
                        "bullish",
                        0.35,
                        f"{distance:+.2f}% from the 52-week high",
                    )
                )
            elif distance < -25.0:
                signals.append(
                    _signal(
                        "near_52w_high",
                        "Well below the 52-week high",
                        "bearish",
                        0.3,
                        f"{distance:+.2f}% from the 52-week high",
                    )
                )

    weighted_sum = 0.0
    total_weight = 0.0
    for signal in signals:
        direction = signal["direction"]
        if direction == "neutral":
            continue
        total_weight += signal["strength"]
        weighted_sum += signal["strength"] * (1.0 if direction == "bullish" else -1.0)
    score = _clamp(weighted_sum / total_weight) if total_weight else 0.0
    return signals, round(score, 4)


def _core(quote: Mapping[str, Any], bars: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Compute every intermediate value shared by analysis and screener rows."""
    quote = quote if isinstance(quote, Mapping) else {}
    clean_bars = [bar for bar in (bars or []) if isinstance(bar, Mapping)]
    closes = _bar_closes(clean_bars)
    price = _num(quote.get("price"))
    if price is None and closes:
        price = closes[-1]
    sma20 = indicators.sma(closes, 20)
    sma50 = indicators.sma(closes, 50)
    sma200 = indicators.sma(closes, 200)
    ema12 = indicators.ema(closes, 12)
    ema26 = indicators.ema(closes, 26)
    rsi14 = indicators.rsi(closes, RSI_PERIOD)
    macd_block = indicators.macd(closes)
    bollinger_block = indicators.bollinger(closes, BOLLINGER_PERIOD, BOLLINGER_STD)
    atr14 = indicators.atr(clean_bars)
    trend = _trend(price, sma20, sma50, sma200)
    momentum = _momentum(rsi14, macd_block, closes)
    annual_vol = indicators.annualized_volatility(closes)
    volatility = _volatility(annual_vol)
    signals, score = _build_signals(
        price=price,
        closes=closes,
        bars=clean_bars,
        sma20=sma20,
        sma50=sma50,
        sma200=sma200,
        rsi14=rsi14,
        macd_block=macd_block,
        bollinger_block=bollinger_block,
    )
    return {
        "quote": quote,
        "bars": clean_bars,
        "closes": closes,
        "price": price,
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "ema12": ema12,
        "ema26": ema26,
        "rsi14": rsi14,
        "macd": macd_block,
        "bollinger": bollinger_block,
        "atr14": atr14,
        "annual_volatility": annual_vol,
        "avg_daily_range_pct": _avg_daily_range_pct(clean_bars),
        "signals": signals,
        "score": score,
        "trend": trend,
        "momentum": momentum,
        "volatility": volatility,
        "confidence": _confidence(len(closes), score),
    }


# ----------------------------------------------------------------------
# Stats, levels, narrative, correlation
# ----------------------------------------------------------------------
def _stats(core: Mapping[str, Any]) -> dict[str, Any]:
    """Build the ``stats`` block of an analysis payload."""
    bars: Sequence[Mapping[str, Any]] = core["bars"]
    closes: Sequence[float] = core["closes"]
    price = core["price"]
    period_return_pct = None
    if len(closes) >= 2 and closes[0]:
        period_return_pct = (closes[-1] / closes[0] - 1.0) * 100.0
    daily_returns = indicators.returns(closes)
    win_rate_pct = None
    if daily_returns:
        wins = sum(1 for value in daily_returns if value > 0)
        win_rate_pct = wins / len(daily_returns) * 100.0
    highs = [value for value in (_num(bar.get("h")) for bar in bars) if value is not None]
    lows = [value for value in (_num(bar.get("l")) for bar in bars) if value is not None]
    volumes = [value for value in (_num(bar.get("v")) for bar in bars) if value is not None]
    high_52w = max(highs) if highs else None
    low_52w = min(lows) if lows else None
    distance_from_high = None
    if price is not None and high_52w:
        distance_from_high = (price / high_52w - 1.0) * 100.0
    avg_volume_20d = None
    if volumes:
        window = volumes[-20:]
        avg_volume_20d = int(round(sum(window) / len(window)))
    max_drawdown = indicators.max_drawdown(closes)
    return {
        "period_return_pct": _round(period_return_pct, 2),
        "annualized_volatility_pct": _round(
            (core["annual_volatility"] or 0.0) * 100.0, 2
        )
        if core["annual_volatility"] is not None
        else None,
        "max_drawdown_pct": _round((max_drawdown or 0.0) * 100.0, 2)
        if max_drawdown is not None
        else None,
        "sharpe": _round(indicators.sharpe(daily_returns), 2),
        "win_rate_pct": _round(win_rate_pct, 2),
        "avg_daily_range_pct": _round(core["avg_daily_range_pct"], 2),
        "high_52w": _round(high_52w),
        "low_52w": _round(low_52w),
        "distance_from_52w_high_pct": _round(distance_from_high, 2),
        "avg_volume_20d": avg_volume_20d,
    }


def _levels(core: Mapping[str, Any]) -> dict[str, list[float]]:
    """Derive nearby support and resistance levels from swing points and averages."""
    bars: Sequence[Mapping[str, Any]] = core["bars"]
    price = core["price"]
    supports: list[float] = []
    resistances: list[float] = []
    if price is not None and len(bars) >= 5:
        window = bars[-60:]
        for index in range(2, len(window) - 2):
            low = _num(window[index].get("l"))
            high = _num(window[index].get("h"))
            neighbours_low = [
                _num(window[index + offset].get("l")) for offset in (-2, -1, 1, 2)
            ]
            neighbours_high = [
                _num(window[index + offset].get("h")) for offset in (-2, -1, 1, 2)
            ]
            if (
                low is not None
                and all(value is not None for value in neighbours_low)
                and all(value >= low for value in neighbours_low if value is not None)
                and low < price
            ):
                supports.append(low)
            if (
                high is not None
                and all(value is not None for value in neighbours_high)
                and all(value <= high for value in neighbours_high if value is not None)
                and high > price
            ):
                resistances.append(high)

    def _below(value: Any) -> None:
        number = _num(value)
        if number is not None and price is not None and number < price:
            supports.append(number)

    def _above(value: Any) -> None:
        number = _num(value)
        if number is not None and price is not None and number > price:
            resistances.append(number)

    for candidate in (
        core["sma20"],
        core["sma50"],
        (core["bollinger"] or {}).get("lower"),
    ):
        _below(candidate)
    for candidate in (
        core["sma20"],
        core["sma50"],
        (core["bollinger"] or {}).get("upper"),
    ):
        _above(candidate)
    if bars:
        lows = [value for value in (_num(bar.get("l")) for bar in bars) if value is not None]
        highs = [value for value in (_num(bar.get("h")) for bar in bars) if value is not None]
        if lows:
            _below(min(lows[-20:]))
        if highs:
            _above(max(highs[-20:]))
    if price is not None:
        _below(price * 0.97)
        _above(price * 1.03)

    def _unique(values: list[float], reverse: bool) -> list[float]:
        seen: set[float] = set()
        ordered = sorted(values, reverse=reverse)
        result: list[float] = []
        for value in ordered:
            rounded = round(value, 4)
            if rounded in seen or rounded <= 0:
                continue
            seen.add(rounded)
            result.append(rounded)
            if len(result) == 2:
                break
        return result

    return {
        "support": _unique(supports, reverse=True),
        "resistance": _unique(resistances, reverse=False),
    }


def _trend_phrase(trend: str) -> str:
    """Return a human readable trend phrase."""
    if trend == "uptrend":
        return "in an uptrend"
    if trend == "downtrend":
        return "in a downtrend"
    return "trending sideways"


def _narrative(
    symbol: str,
    core: Mapping[str, Any],
    stats: Mapping[str, Any],
    levels: Mapping[str, Any],
) -> str:
    """Compose a short human readable narrative for the analysis payload."""
    quote = core["quote"]
    parts: list[str] = [f"{symbol} is {_trend_phrase(core['trend'])}."]
    change_pct = _num(quote.get("change_pct"))
    price = core["price"]
    if change_pct is not None and price is not None:
        direction = "up" if change_pct >= 0 else "down"
        parts.append(f"It is {direction} {abs(change_pct):.2f}% today at {price:.2f}.")
    rsi14 = core["rsi14"]
    if rsi14 is not None:
        if rsi14 >= 70:
            rsi_state = "overbought"
        elif rsi14 <= 30:
            rsi_state = "oversold"
        else:
            rsi_state = "neutral"
        parts.append(f"RSI(14) is {rsi14:.1f} ({rsi_state}).")
    macd_block = core["macd"]
    if macd_block is not None:
        histogram = _num(macd_block.get("histogram"))
        if histogram is not None:
            state = "positive" if histogram > 0 else "negative" if histogram < 0 else "flat"
            parts.append(f"MACD momentum is {state}.")
    supports = levels.get("support") or []
    resistances = levels.get("resistance") or []
    if supports and resistances:
        parts.append(
            f"Nearest support is near {supports[0]:.2f}; resistance near {resistances[0]:.2f}."
        )
    elif supports:
        parts.append(f"Nearest support is near {supports[0]:.2f}.")
    elif resistances:
        parts.append(f"Nearest resistance is near {resistances[0]:.2f}.")
    period_return = stats.get("period_return_pct")
    if period_return is not None:
        parts.append(f"The period return is {period_return:+.2f}%.")
    return " ".join(parts)


def _correlation(
    bars: Sequence[Mapping[str, Any]],
    benchmark_bars: Sequence[Mapping[str, Any]] | None,
    benchmark_symbol: str,
) -> dict[str, Any]:
    """Compare daily returns against benchmark bars over the aligned window."""
    result: dict[str, Any] = {
        "benchmark": benchmark_symbol,
        "value": None,
        "window_days": 0,
    }
    if not benchmark_bars:
        return result
    benchmark_close: dict[str, float] = {}
    for bar in benchmark_bars:
        label = bar.get("t")
        close = _num(bar.get("c"))
        if isinstance(label, str) and close is not None:
            benchmark_close[label] = close
    symbol_closes: list[float] = []
    benchmark_closes: list[float] = []
    for bar in bars:
        label = bar.get("t")
        close = _num(bar.get("c"))
        if not isinstance(label, str) or close is None:
            continue
        benchmark = benchmark_close.get(label)
        if benchmark is None:
            continue
        symbol_closes.append(close)
        benchmark_closes.append(benchmark)
    window_days = max(0, len(symbol_closes) - 1)
    result["window_days"] = window_days
    if window_days < 10:
        return result
    value = indicators.pearson(
        indicators.returns(symbol_closes), indicators.returns(benchmark_closes)
    )
    result["value"] = _round(value, 4)
    return result


# ----------------------------------------------------------------------
# Public builders
# ----------------------------------------------------------------------
def build_analysis(
    symbol: str,
    quote: Mapping[str, Any],
    bars: Sequence[Mapping[str, Any]],
    benchmark_bars: Sequence[Mapping[str, Any]] | None = None,
    benchmark_symbol: str = "^GSPC",
    provider: str | None = None,
) -> dict[str, Any]:
    """Build the full ``GET /analysis/:symbol`` payload.

    Short or missing data yields ``null`` indicator/stat values instead of an
    error; the result is always the contract shape.
    """
    core = _core(quote, bars)
    stats = _stats(core)
    levels = _levels(core)
    signals = core["signals"]
    score = core["score"]
    summary_signal = "bullish" if score > 0.15 else "bearish" if score < -0.15 else "neutral"
    headline = (
        f"{symbol} is {_trend_phrase(core['trend'])} with a {summary_signal} bias "
        f"(score {score:+.2f})."
    )
    macd_payload: dict[str, float] | None = None
    if core["macd"] is not None:
        macd_payload = {
            "line": _round(core["macd"]["line"]),
            "signal": _round(core["macd"]["signal"]),
            "histogram": _round(core["macd"]["histogram"]),
        }
    bollinger_payload: dict[str, float] | None = None
    if core["bollinger"] is not None:
        bollinger_payload = {
            "upper": _round(core["bollinger"]["upper"]),
            "middle": _round(core["bollinger"]["middle"]),
            "lower": _round(core["bollinger"]["lower"]),
            "width_pct": _round(core["bollinger"]["width_pct"], 2),
        }
    quote_payload = dict(core["quote"])
    return {
        "symbol": symbol,
        "name": str(quote_payload.get("name") or symbol),
        "as_of": str(quote_payload.get("as_of") or ""),
        "provider": provider or str(quote_payload.get("source") or ""),
        "quote": quote_payload,
        "summary": {
            "signal": summary_signal,
            "score": score,
            "confidence": core["confidence"],
            "trend": core["trend"],
            "momentum": core["momentum"],
            "volatility": core["volatility"],
            "headline": headline,
        },
        "indicators": {
            "sma20": _round(core["sma20"]),
            "sma50": _round(core["sma50"]),
            "sma200": _round(core["sma200"]),
            "ema12": _round(core["ema12"]),
            "ema26": _round(core["ema26"]),
            "rsi14": _round(core["rsi14"], 2),
            "macd": macd_payload,
            "bollinger": bollinger_payload,
            "atr14": _round(core["atr14"]),
        },
        "stats": stats,
        "signals": signals,
        "narrative": _narrative(symbol, core, stats, levels),
        "levels": levels,
        "correlation": _correlation(bars, benchmark_bars, benchmark_symbol),
    }


def build_screener_row(
    symbol: str,
    quote: Mapping[str, Any],
    bars: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build one ``GET /screener`` row (adds ``avg_daily_range_pct`` for sorting)."""
    core = _core(quote, bars)
    volume = _num(quote.get("volume")) if isinstance(quote, Mapping) else None
    return {
        "symbol": symbol,
        "name": str((quote or {}).get("name") or symbol),
        "price": _round(core["price"]),
        "change_pct": _round(
            (quote or {}).get("change_pct") if isinstance(quote, Mapping) else None,
            2,
        ),
        "rsi14": _round(core["rsi14"], 2),
        "trend": core["trend"],
        "score": core["score"],
        "volume": int(round(volume)) if volume is not None else None,
        "avg_daily_range_pct": _round(core["avg_daily_range_pct"], 2),
    }


def build_overlays(
    bars: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build chart overlay series aligned index-by-index with ``bars``.

    Returns ``sma20``, ``sma50``, ``rsi14`` and a ``bollinger`` block of
    ``upper``/``middle``/``lower``; every list has exactly ``len(bars)`` entries
    with ``None`` padding before the first defined value.  Values are rounded
    exactly like ``/analysis`` indicators so the last point matches the report.
    """
    closes = [bar.get("c") for bar in bars]

    def _series(values: Sequence[Any]) -> list[float | None]:
        return [_round(value) for value in values]

    sma20 = _series(indicators.sma_series(closes, 20))
    sma50 = _series(indicators.sma_series(closes, 50))
    bollinger_raw = indicators.bollinger_series(closes, BOLLINGER_PERIOD, BOLLINGER_STD)
    return {
        "sma20": sma20,
        "sma50": sma50,
        "bollinger": {
            "upper": _series(bollinger_raw["upper"]),
            "middle": _series(bollinger_raw["middle"]),
            "lower": _series(bollinger_raw["lower"]),
        },
        "rsi14": _series(indicators.rsi_series(closes, RSI_PERIOD)),
    }


__all__ = [
    "SMA_OVERLAY_PERIODS",
    "RSI_PERIOD",
    "BOLLINGER_PERIOD",
    "BOLLINGER_STD",
    "HISTORY_POINTS_DEFAULT",
    "HISTORY_POINTS_MIN",
    "HISTORY_POINTS_MAX",
    "HISTORY_LOOKBACK_BUFFER_PERIODS",
    "HISTORY_LOOKBACK_MAX_DAYS",
    "CHART_INTERVALS",
    "CHART_PERIOD_DAYS",
    "FIVE_DAY_GROUP_SIZE",
    "clamp_history_points",
    "chart_interval",
    "history_period_days",
    "history_lookback_days",
    "normalize_lookback_days",
    "aggregate_daily_bars",
    "classify_trend",
    "build_analysis",
    "build_screener_row",
    "build_overlays",
]
