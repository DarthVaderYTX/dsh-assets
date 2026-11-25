"""Unit tests for the technical indicators and statistical helpers."""

from __future__ import annotations

import os
import statistics
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import indicators


class MovingAverageTests(unittest.TestCase):
    """SMA/EMA behaviour on known series."""

    def test_sma_last_window(self) -> None:
        self.assertAlmostEqual(indicators.sma([1, 2, 3, 4, 5], 3), 4.0)

    def test_sma_insufficient_data(self) -> None:
        self.assertIsNone(indicators.sma([1, 2], 3))
        self.assertIsNone(indicators.sma([], 3))

    def test_ema_known_series(self) -> None:
        # alpha = 2 / (3 + 1) = 0.5, seeded with the first value.
        self.assertAlmostEqual(indicators.ema([1, 2, 3, 4, 5], 3), 4.0625)

    def test_ema_series_seed_and_length(self) -> None:
        series = indicators.ema_series([1, 2, 3, 4, 5], 3)
        self.assertEqual(len(series), 5)
        self.assertAlmostEqual(series[0], 1.0)
        self.assertAlmostEqual(series[-1], 4.0625)
        self.assertEqual(series, indicators.ema_series([1, 2, 3, 4, 5], 3))

    def test_ema_empty(self) -> None:
        self.assertEqual(indicators.ema_series([], 5), [])
        self.assertIsNone(indicators.ema([], 5))


class RsiTests(unittest.TestCase):
    """Wilder RSI edge cases and series alignment."""

    def test_rising_series_is_100(self) -> None:
        values = [float(index) for index in range(1, 30)]
        self.assertAlmostEqual(indicators.rsi(values, 14), 100.0)

    def test_falling_series_is_0(self) -> None:
        values = [float(index) for index in range(30, 1, -1)]
        self.assertAlmostEqual(indicators.rsi(values, 14), 0.0)

    def test_flat_series_is_50(self) -> None:
        self.assertAlmostEqual(indicators.rsi([5.0] * 20, 14), 50.0)

    def test_insufficient_data(self) -> None:
        self.assertIsNone(indicators.rsi([1.0] * 14, 14))

    def test_rsi_series_alignment(self) -> None:
        values = [100.0 + index for index in range(30)]
        series = indicators.rsi_series(values, 14)
        self.assertEqual(len(series), len(values))
        self.assertEqual(series[:14], [None] * 14)
        self.assertIsNotNone(series[14])
        self.assertAlmostEqual(series[-1], indicators.rsi(values, 14))

    def test_rsi_series_gap_is_null(self) -> None:
        values = [100.0 + index for index in range(20)]
        values[5] = None
        series = indicators.rsi_series(values, 14)
        self.assertEqual(len(series), 20)
        self.assertTrue(all(value is None for value in series))


class MacdTests(unittest.TestCase):
    """MACD computation on trending input."""

    def test_uptrend_positive(self) -> None:
        values = [100.0 + index for index in range(80)]
        block = indicators.macd(values)
        self.assertIsNotNone(block)
        assert block is not None
        self.assertGreater(block["line"], 0.0)
        self.assertGreater(block["histogram"], 0.0)
        self.assertLess(block["signal"], block["line"])

    def test_insufficient_data(self) -> None:
        self.assertIsNone(indicators.macd([100.0] * 20))


class BollingerTests(unittest.TestCase):
    """Bollinger band values."""

    def test_constant_series_has_zero_width(self) -> None:
        block = indicators.bollinger([5.0] * 20, 20, 2.0)
        self.assertIsNotNone(block)
        assert block is not None
        self.assertAlmostEqual(block["middle"], 5.0)
        self.assertAlmostEqual(block["upper"], 5.0)
        self.assertAlmostEqual(block["lower"], 5.0)
        self.assertAlmostEqual(block["width_pct"], 0.0)

    def test_middle_equals_sma(self) -> None:
        values = [float(index) for index in range(1, 31)]
        block = indicators.bollinger(values, 20, 2.0)
        assert block is not None
        self.assertAlmostEqual(block["middle"], indicators.sma(values, 20))
        self.assertGreater(block["upper"], block["middle"])
        self.assertLess(block["lower"], block["middle"])

    def test_insufficient_data(self) -> None:
        self.assertIsNone(indicators.bollinger([1.0] * 5))

    def test_series_matches_scalar(self) -> None:
        values = [float(index) for index in range(1, 31)]
        series = indicators.bollinger_series(values, 20, 2.0)
        block = indicators.bollinger(values, 20, 2.0)
        assert block is not None
        self.assertEqual(len(series["middle"]), len(values))
        self.assertEqual(series["middle"][:19], [None] * 19)
        self.assertAlmostEqual(series["middle"][-1], block["middle"])
        self.assertAlmostEqual(series["upper"][-1], block["upper"])
        self.assertAlmostEqual(series["lower"][-1], block["lower"])


class AtrTests(unittest.TestCase):
    """Average true range."""

    def test_known_series(self) -> None:
        bars = [
            {"h": 11.0, "l": 9.0, "c": 10.0, "o": 10.0, "v": 1.0}
            for _ in range(15)
        ]
        self.assertAlmostEqual(indicators.atr(bars, 14), 2.0)

    def test_insufficient_data(self) -> None:
        bars = [{"h": 11.0, "l": 9.0, "c": 10.0} for _ in range(5)]
        self.assertIsNone(indicators.atr(bars, 14))


class StatisticalTests(unittest.TestCase):
    """Returns, stdev, percentiles, correlation and risk metrics."""

    def test_stdev_matches_statistics(self) -> None:
        values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
        self.assertAlmostEqual(indicators.stdev(values), statistics.stdev(values))

    def test_stdev_short_input(self) -> None:
        self.assertIsNone(indicators.stdev([1.0]))
        self.assertIsNone(indicators.stdev([]))

    def test_returns(self) -> None:
        values = indicators.returns([100.0, 110.0, 99.0])
        self.assertEqual(len(values), 2)
        self.assertAlmostEqual(values[0], 0.1)
        self.assertAlmostEqual(values[1], -0.1)
        self.assertEqual(indicators.returns([100.0]), [])

    def test_percentile(self) -> None:
        values = [1.0, 2.0, 3.0, 4.0]
        self.assertAlmostEqual(indicators.percentile(values, 50), 2.5)
        self.assertAlmostEqual(indicators.percentile(values, 0), 1.0)
        self.assertAlmostEqual(indicators.percentile(values, 100), 4.0)
        self.assertIsNone(indicators.percentile([], 50))

    def test_pearson_perfect_correlation(self) -> None:
        self.assertAlmostEqual(
            indicators.pearson([1, 2, 3], [2, 4, 6]), 1.0
        )
        self.assertAlmostEqual(
            indicators.pearson([1, 2, 3], [6, 4, 2]), -1.0
        )

    def test_pearson_degenerate(self) -> None:
        self.assertIsNone(indicators.pearson([1, 2, 3], [1, 1, 1]))
        self.assertIsNone(indicators.pearson([1], [1]))

    def test_max_drawdown(self) -> None:
        self.assertAlmostEqual(
            indicators.max_drawdown([100.0, 120.0, 90.0, 110.0]), -0.25
        )
        self.assertAlmostEqual(indicators.max_drawdown([100.0] * 5), 0.0)
        self.assertIsNone(indicators.max_drawdown([100.0]))

    def test_annualized_volatility(self) -> None:
        constant = indicators.annualized_volatility([100.0] * 20)
        self.assertAlmostEqual(constant or 0.0, 0.0)
        volatile = indicators.annualized_volatility(
            [100.0 * (1.02 if index % 2 else 0.98) for index in range(60)]
        )
        self.assertIsNotNone(volatile)
        assert volatile is not None
        self.assertGreater(volatile, 0.0)

    def test_sharpe(self) -> None:
        value = indicators.sharpe([0.01, 0.02, 0.01, 0.02, 0.01, 0.02])
        self.assertIsNotNone(value)
        assert value is not None
        self.assertGreater(value, 0.0)
        self.assertIsNone(indicators.sharpe([0.01] * 10))

    def test_null_safety(self) -> None:
        self.assertIsNone(indicators.mean([]))
        self.assertIsNone(indicators.sma([], 5))
        self.assertIsNone(indicators.rsi([], 14))
        self.assertIsNone(indicators.macd([], 12, 26, 9))
        self.assertIsNone(indicators.bollinger([], 20))
        self.assertIsNone(indicators.atr([], 14))
        self.assertIsNone(indicators.pearson([], []))
        self.assertIsNone(indicators.max_drawdown([]))
        self.assertIsNone(indicators.annualized_volatility([]))
        self.assertIsNone(indicators.sharpe([]))


if __name__ == "__main__":
    unittest.main()
