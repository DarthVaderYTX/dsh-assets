"""Technical indicators and statistical helpers.

Every function is defensive: insufficient or malformed input yields ``None``
(or an empty list) instead of raising, so analysis can degrade gracefully for
short histories.  No third-party dependencies are used.

Conventions
-----------
* EMA is seeded with the first observation and smoothed with
  ``alpha = 2 / (period + 1)``.
* RSI uses Wilder's smoothing over daily closes.
* ATR uses Wilder's smoothing over true ranges.
* ``stdev`` is the sample standard deviation (``n - 1``).
* Fractional results (drawdown, volatility, Sharpe) are raw ratios; callers
  multiply by 100 for the ``*_pct`` fields of the API contract.
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Iterable, Sequence


def _numbers(values: Iterable[Any]) -> list[float]:
    """Coerce values to finite floats, dropping ``None``/non-numeric entries."""
    result: list[float] = []
    for value in values:
        if value is None or isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            result.append(number)
    return result


def _aligned(values: Iterable[Any]) -> list[float | None]:
    """Coerce values to finite floats while preserving input positions."""
    result: list[float | None] = []
    for value in values:
        if value is None or isinstance(value, bool):
            result.append(None)
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            result.append(None)
            continue
        result.append(number if math.isfinite(number) else None)
    return result


def sma_series(values: Iterable[Any], period: int) -> list[float | None]:
    """Return a bar-aligned simple moving average series."""
    if period <= 0:
        raise ValueError("period must be positive")
    aligned = _aligned(values)
    result: list[float | None] = [None] * len(aligned)
    if len(aligned) < period:
        return result
    for index in range(period - 1, len(aligned)):
        window = aligned[index - period + 1 : index + 1]
        if any(value is None for value in window):
            continue
        total = sum(value for value in window if value is not None)
        result[index] = total / period
    return result


def bollinger_series(
    values: Iterable[Any],
    period: int = 20,
    num_std: float = 2.0,
) -> dict[str, list[float | None]]:
    """Return bar-aligned Bollinger band series (upper/middle/lower)."""
    if period <= 1:
        raise ValueError("period must be greater than one")
    aligned = _aligned(values)
    length = len(aligned)
    upper: list[float | None] = [None] * length
    middle: list[float | None] = [None] * length
    lower: list[float | None] = [None] * length
    if length < period:
        return {"upper": upper, "middle": middle, "lower": lower}
    for index in range(period - 1, length):
        window = aligned[index - period + 1 : index + 1]
        if any(value is None for value in window):
            continue
        numbers = [value for value in window if value is not None]
        mean_value = sum(numbers) / period
        deviation = statistics.stdev(numbers)
        middle[index] = mean_value
        upper[index] = mean_value + num_std * deviation
        lower[index] = mean_value - num_std * deviation
    return {"upper": upper, "middle": middle, "lower": lower}


def mean(values: Iterable[Any]) -> float | None:
    """Return the arithmetic mean or ``None`` for empty input."""
    numbers = _numbers(values)
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def sma(values: Iterable[Any], period: int) -> float | None:
    """Return the simple moving average over the last ``period`` values."""
    if period <= 0:
        raise ValueError("period must be positive")
    numbers = _numbers(values)
    if len(numbers) < period:
        return None
    window = numbers[-period:]
    return sum(window) / period


def ema_series(values: Iterable[Any], period: int) -> list[float]:
    """Return the exponential moving average series (seeded at the first value)."""
    if period <= 0:
        raise ValueError("period must be positive")
    numbers = _numbers(values)
    if not numbers:
        return []
    alpha = 2.0 / (period + 1.0)
    result = [numbers[0]]
    for value in numbers[1:]:
        result.append(alpha * value + (1.0 - alpha) * result[-1])
    return result


def ema(values: Iterable[Any], period: int) -> float | None:
    """Return the latest exponential moving average or ``None``."""
    series = ema_series(values, period)
    return series[-1] if series else None


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    """Convert Wilder average gain/loss into an RSI value."""
    if avg_loss == 0.0:
        return 100.0 if avg_gain > 0.0 else 50.0
    relative_strength = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def rsi_series(values: Iterable[Any], period: int = 14) -> list[float | None]:
    """Return a bar-aligned Wilder RSI series (``None`` before the lookback).

    The length always equals the number of input values so callers can align it
    with OHLC bars.  If the input contains gaps (``None``/non-finite) the whole
    series is unavailable and every entry is ``None``.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    aligned = _aligned(values)
    result: list[float | None] = [None] * len(aligned)
    if any(value is None for value in aligned) or len(aligned) < period + 1:
        return result
    numbers = [value for value in aligned if value is not None]
    gains = 0.0
    losses = 0.0
    for index in range(1, period + 1):
        change = numbers[index] - numbers[index - 1]
        if change >= 0:
            gains += change
        else:
            losses -= change
    avg_gain = gains / period
    avg_loss = losses / period
    result[period] = _rsi_value(avg_gain, avg_loss)
    for index in range(period + 1, len(numbers)):
        change = numbers[index] - numbers[index - 1]
        avg_gain = (avg_gain * (period - 1) + max(change, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-change, 0.0)) / period
        result[index] = _rsi_value(avg_gain, avg_loss)
    return result


def rsi(values: Iterable[Any], period: int = 14) -> float | None:
    """Return the latest Wilder RSI(``period``) or ``None`` when data is short."""
    series = rsi_series(values, period)
    return series[-1] if series else None


def macd(
    values: Iterable[Any],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, float] | None:
    """Return the latest MACD line, signal line and histogram.

    Returns ``None`` when fewer than ``slow + signal - 1`` values are available.
    """
    numbers = _numbers(values)
    if len(numbers) < slow + signal - 1:
        return None
    fast_series = ema_series(numbers, fast)
    slow_series = ema_series(numbers, slow)
    line_series = [f - s for f, s in zip(fast_series, slow_series)]
    signal_series = ema_series(line_series, signal)
    line = line_series[-1]
    signal_value = signal_series[-1]
    return {"line": line, "signal": signal_value, "histogram": line - signal_value}


def bollinger(
    values: Iterable[Any],
    period: int = 20,
    num_std: float = 2.0,
) -> dict[str, float] | None:
    """Return Bollinger bands (upper/middle/lower/width_pct) for the latest close."""
    if period <= 1:
        raise ValueError("period must be greater than one")
    numbers = _numbers(values)
    if len(numbers) < period:
        return None
    window = numbers[-period:]
    middle = sum(window) / period
    deviation = statistics.stdev(window)
    upper = middle + num_std * deviation
    lower = middle - num_std * deviation
    width_pct = ((upper - lower) / middle * 100.0) if middle else None
    return {
        "upper": upper,
        "middle": middle,
        "lower": lower,
        "width_pct": width_pct if width_pct is not None else 0.0,
    }


def atr(bars: Sequence[dict[str, Any]], period: int = 14) -> float | None:
    """Return the latest Average True Range over OHLCV ``bars``."""
    if period <= 0:
        raise ValueError("period must be positive")
    clean: list[tuple[float, float, float]] = []
    for bar in bars:
        try:
            high = float(bar["h"])
            low = float(bar["l"])
            close = float(bar["c"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(high) and math.isfinite(low) and math.isfinite(close):
            clean.append((high, low, close))
    if len(clean) < period + 1:
        return None
    true_ranges: list[float] = []
    for index in range(1, len(clean)):
        high, low, _ = clean[index]
        previous_close = clean[index - 1][2]
        true_ranges.append(
            max(high - low, abs(high - previous_close), abs(low - previous_close))
        )
    if len(true_ranges) < period:
        return None
    value = sum(true_ranges[:period]) / period
    for true_range in true_ranges[period:]:
        value = (value * (period - 1) + true_range) / period
    return value


def stdev(values: Iterable[Any]) -> float | None:
    """Return the sample standard deviation, or ``None`` with fewer than 2 values."""
    numbers = _numbers(values)
    if len(numbers) < 2:
        return None
    return statistics.stdev(numbers)


def returns(values: Iterable[Any]) -> list[float]:
    """Return simple period-over-period returns (empty for short input)."""
    numbers = _numbers(values)
    result: list[float] = []
    for previous, current in zip(numbers, numbers[1:]):
        if previous == 0:
            continue
        result.append(current / previous - 1.0)
    return result


def percentile(values: Iterable[Any], pct: float) -> float | None:
    """Return the linearly interpolated ``pct`` percentile (``0..100``)."""
    numbers = sorted(_numbers(values))
    if not numbers:
        return None
    pct = min(100.0, max(0.0, float(pct)))
    position = (len(numbers) - 1) * pct / 100.0
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return numbers[lower]
    weight = position - lower
    return numbers[lower] * (1.0 - weight) + numbers[upper] * weight


def pearson(xs: Iterable[Any], ys: Iterable[Any]) -> float | None:
    """Return the Pearson correlation of two equal-length samples, or ``None``."""
    left = _numbers(xs)
    right = _numbers(ys)
    size = min(len(left), len(right))
    if size < 2:
        return None
    left = left[:size]
    right = right[:size]
    mean_left = sum(left) / size
    mean_right = sum(right) / size
    covariance = 0.0
    variance_left = 0.0
    variance_right = 0.0
    for a, b in zip(left, right):
        da = a - mean_left
        db = b - mean_right
        covariance += da * db
        variance_left += da * da
        variance_right += db * db
    if variance_left <= 0.0 or variance_right <= 0.0:
        return None
    return covariance / math.sqrt(variance_left * variance_right)


def max_drawdown(values: Iterable[Any]) -> float | None:
    """Return the maximum drawdown as a negative fraction (``-0.2`` = -20%)."""
    numbers = _numbers(values)
    if len(numbers) < 2:
        return None
    peak = numbers[0]
    worst = 0.0
    for value in numbers[1:]:
        if value > peak:
            peak = value
        if peak > 0:
            drawdown = value / peak - 1.0
            if drawdown < worst:
                worst = drawdown
    return worst


def annualized_volatility(closes: Iterable[Any], periods: int = 252) -> float | None:
    """Return annualised volatility as a fraction, from close-to-close returns."""
    daily = returns(closes)
    if len(daily) < 2:
        return None
    deviation = statistics.stdev(daily)
    return deviation * math.sqrt(periods)


def sharpe(
    daily_returns: Iterable[Any],
    periods: int = 252,
    risk_free: float = 0.0,
) -> float | None:
    """Return the annualised Sharpe ratio of daily returns (``None`` if flat)."""
    values = _numbers(daily_returns)
    if len(values) < 2:
        return None
    excess = [value - risk_free / periods for value in values]
    deviation = statistics.stdev(excess)
    if deviation <= 0.0:
        return None
    return (sum(excess) / len(excess)) / deviation * math.sqrt(periods)


__all__ = [
    "mean",
    "sma",
    "sma_series",
    "ema_series",
    "ema",
    "rsi",
    "rsi_series",
    "bollinger_series",
    "macd",
    "bollinger",
    "atr",
    "stdev",
    "returns",
    "percentile",
    "pearson",
    "max_drawdown",
    "annualized_volatility",
    "sharpe",
]
