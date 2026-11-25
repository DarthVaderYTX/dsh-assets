"""Tests for the deterministic synthetic market provider."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import analytics
from market_monitor.errors import InvalidArgumentError, InvalidSymbolError
from market_monitor.providers.synthetic import ANCHOR_DATE, SyntheticProvider

#: Monday 2025-06-16 15:30:00 UTC.
FIXED_NOW = datetime(2025, 6, 16, 15, 30, 0, tzinfo=timezone.utc).timestamp()
TODAY = datetime.fromtimestamp(FIXED_NOW, tz=timezone.utc).date()


def fixed_now() -> float:
    """Return the fixed test clock."""
    return FIXED_NOW


def _iso_timestamps(bars: list[dict]) -> list[datetime]:
    """Parse the intraday bar timestamps of ``bars`` as UTC datetimes."""
    return [
        datetime.strptime(bar["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        for bar in bars
    ]


class SyntheticProviderTests(unittest.TestCase):
    """Determinism, conventional chart windows and consistency of the simulator."""

    def setUp(self) -> None:
        self.provider = SyntheticProvider(now_fn=fixed_now)

    def test_quote_is_deterministic(self) -> None:
        other = SyntheticProvider(now_fn=fixed_now)
        self.assertEqual(self.provider.quote("AAPL"), other.quote("AAPL"))
        self.assertEqual(
            self.provider.history_daily("AAPL", 500),
            other.history_daily("AAPL", 500),
        )
        self.assertEqual(
            self.provider.history("AAPL", "3M"), other.history("AAPL", "3M")
        )

    def test_quote_fields(self) -> None:
        quote = self.provider.quote("AAPL")
        for key in (
            "symbol",
            "name",
            "exchange",
            "type",
            "sector",
            "currency",
            "price",
            "prev_close",
            "change",
            "change_pct",
            "open",
            "high",
            "low",
            "volume",
            "market_state",
            "as_of",
            "source",
        ):
            self.assertIn(key, quote)
        self.assertEqual(quote["symbol"], "AAPL")
        self.assertEqual(quote["name"], "Apple Inc.")
        self.assertEqual(quote["market_state"], "simulated")
        self.assertEqual(quote["source"], "synthetic")
        self.assertGreaterEqual(quote["high"], quote["price"])
        self.assertLessEqual(quote["low"], quote["price"])
        self.assertAlmostEqual(quote["open"], quote["prev_close"])
        self.assertAlmostEqual(
            quote["change"], quote["price"] - quote["prev_close"]
        )
        self.assertEqual(quote["as_of"], "2025-06-16T15:30:00Z")

    def test_quote_price_matches_the_latest_chart_point(self) -> None:
        quote = self.provider.quote("AAPL")
        today_bar = self.provider.history_daily("AAPL", 1)[0]
        self.assertEqual(today_bar["t"], TODAY.isoformat())
        self.assertAlmostEqual(today_bar["c"], quote["price"])
        # 1D is today's five-minute series, so its newest bucket is the quote.
        intraday = self.provider.history("AAPL", "1D")["bars"]
        self.assertAlmostEqual(intraday[-1]["c"], quote["price"])
        # Daily windows end with today's partial daily bar.
        for range_name, count in (("1M", 22), ("3M", 66), ("6M", 132), ("1Y", 252)):
            bars = self.provider.history("AAPL", range_name)["bars"]
            self.assertEqual(bars, self.provider.history_daily("AAPL", count), range_name)
            self.assertAlmostEqual(bars[-1]["c"], quote["price"], msg=range_name)
        # The 5D chart stops at the last completed 30-minute bar, i.e. the last
        # five-minute bucket below the current one.
        five_day = self.provider.history("AAPL", "5D")["bars"]
        self.assertAlmostEqual(five_day[-1]["c"], intraday[-2]["c"])

    # ------------------------------------------------------------------
    # Daily history source
    # ------------------------------------------------------------------
    def test_history_live_returns_today_five_minute_bars(self) -> None:
        payload = self.provider.history("AAPL", "LIVE")
        self.assertEqual(payload["range"], "LIVE")
        self.assertEqual(payload["interval"], "5m")
        self.assertGreater(len(payload["bars"]), 0)
        last = payload["bars"][-1]
        self.assertIn("T", last["t"])
        self.assertEqual(last["t"][:10], "2025-06-16")
        self.assertAlmostEqual(last["c"], self.provider.quote("AAPL")["price"])
        # ``1D`` is the conventional alias for the same live window.
        one_day = self.provider.history("AAPL", "1D")
        self.assertEqual(one_day["interval"], "5m")
        self.assertEqual(one_day["bars"], payload["bars"])

    def test_history_daily_returns_requested_count(self) -> None:
        bars = self.provider.history_daily("AAPL", 252)
        self.assertEqual(len(bars), 252)
        for bar in bars:
            self.assertLess(
                date.fromisoformat(bar["t"]).weekday(), 5, bar["t"],
            )
        labels = [bar["t"] for bar in bars]
        self.assertEqual(labels, sorted(labels))
        self.assertEqual(len(set(labels)), len(labels))
        self.assertLessEqual(
            date.fromisoformat(labels[-1]), TODAY,
        )
        for bar in bars[:40]:
            self.assertGreaterEqual(bar["h"], max(bar["o"], bar["c"]))
            self.assertLessEqual(bar["l"], min(bar["o"], bar["c"]))
            self.assertGreater(bar["l"], 0.0)
            self.assertGreaterEqual(bar["v"], 0.0)

    def test_history_daily_extended_backwards_for_long_lookbacks(self) -> None:
        # Long lookbacks stay supported and are extended backwards
        # deterministically from the anchor date.
        lookback = analytics.history_lookback_days("1Y")
        bars = self.provider.history_daily("AAPL", lookback)
        self.assertEqual(len(bars), lookback)
        self.assertEqual(bars[-1]["t"], TODAY.isoformat())
        first_day = date.fromisoformat(bars[0]["t"])
        self.assertLess(first_day, ANCHOR_DATE)
        self.assertLessEqual(first_day.year, TODAY.year - 58)
        self.assertAlmostEqual(bars[-1]["c"], self.provider.quote("AAPL")["price"])
        # The backward extension is deterministic across provider instances.
        other = SyntheticProvider(now_fn=fixed_now)
        self.assertEqual(other.history_daily("AAPL", 500), bars[-500:])

    def test_history_daily_deterministic_and_cached(self) -> None:
        first = self.provider.history_daily("AAPL", 1200)
        again = self.provider.history_daily("AAPL", 1200)
        self.assertEqual(first, again)
        # The long lookback is memoised per symbol: a longer request reuses the
        # already-generated bars instead of recomputing them from scratch.
        broader = self.provider.history_daily("AAPL", 2400)
        self.assertEqual(len(broader), 2400)
        self.assertEqual(broader[-1200:], first)

    def test_history_daily_validates_lookback(self) -> None:
        for bad in (0, -1, "soon", None, True):
            with self.assertRaises(InvalidArgumentError, msg=repr(bad)):
                self.provider.history_daily("AAPL", bad)  # type: ignore[arg-type]
        with self.assertRaises(InvalidArgumentError):
            self.provider.history_daily("AAPL", analytics.HISTORY_LOOKBACK_MAX_DAYS + 1)
        with self.assertRaises(InvalidSymbolError):
            self.provider.history_daily("bad symbol", 10)

    def test_backward_extension_preserves_the_anchor(self) -> None:
        self.provider.history_daily("AAPL", 3000)
        path = self.provider._ensure_daily_path("AAPL")  # noqa: SLF001
        self.assertAlmostEqual(path[ANCHOR_DATE], 231.45)

    # ------------------------------------------------------------------
    # Conventional chart windows
    # ------------------------------------------------------------------
    def test_history_uses_conventional_chart_windows(self) -> None:
        expected = (
            ("1D", "5m", 187),
            ("5D", "30m", 64),
            ("1M", "1d", 22),
            ("3M", "1d", 66),
            ("6M", "1d", 132),
            ("1Y", "1d", 252),
        )
        for range_name, interval, count in expected:
            payload = self.provider.history("AAPL", range_name)
            self.assertEqual(payload["symbol"], "AAPL", range_name)
            self.assertEqual(payload["range"], range_name, range_name)
            self.assertEqual(payload["interval"], interval, range_name)
            self.assertEqual(payload["source"], "synthetic", range_name)
            bars = payload["bars"]
            self.assertEqual(len(bars), count, range_name)
            labels = [bar["t"] for bar in bars]
            self.assertEqual(labels, sorted(labels), range_name)
            self.assertEqual(len(set(labels)), len(labels), range_name)
            for bar in bars:
                if interval == "1d":
                    self.assertNotIn("T", bar["t"], range_name)
                    self.assertEqual(len(bar["t"]), 10, range_name)
                    date.fromisoformat(bar["t"])
                else:
                    self.assertIn("T", bar["t"], range_name)
                    self.assertTrue(bar["t"].endswith("Z"), range_name)
                    datetime.strptime(bar["t"], "%Y-%m-%dT%H:%M:%SZ")
                self.assertGreaterEqual(bar["h"], max(bar["o"], bar["c"]))
                self.assertLessEqual(bar["l"], min(bar["o"], bar["c"]))
                self.assertGreater(bar["l"], 0.0)
                self.assertGreaterEqual(bar["v"], 0.0)

    def test_one_day_is_the_intraday_five_minute_window(self) -> None:
        payload = self.provider.history("AAPL", "1D")
        self.assertEqual(payload["interval"], "5m")
        bars = payload["bars"]
        self.assertEqual(bars, self.provider.history_intraday("AAPL"))
        self.assertEqual(len(bars), 187)  # five-minute buckets elapsed by 15:30
        self.assertEqual(bars[0]["t"], "2025-06-16T00:00:00Z")
        self.assertEqual(bars[-1]["t"], "2025-06-16T15:30:00Z")
        stamps = _iso_timestamps(bars)
        self.assertEqual(
            {
                (later - earlier).total_seconds()
                for earlier, later in zip(stamps, stamps[1:])
            },
            {300.0},
        )

    def test_daily_windows_are_fixed_daily_bar_counts(self) -> None:
        for range_name, count in (("1M", 22), ("3M", 66), ("6M", 132), ("1Y", 252)):
            bars = self.provider.history("AAPL", range_name)["bars"]
            self.assertEqual(
                bars, self.provider.history_daily("AAPL", count), range_name
            )
            self.assertEqual(len(bars), count, range_name)
            labels = [bar["t"] for bar in bars]
            for label in labels:
                self.assertLess(date.fromisoformat(label).weekday(), 5, range_name)
            self.assertEqual(labels, sorted(labels), range_name)
            self.assertLessEqual(date.fromisoformat(labels[-1]), TODAY, range_name)

    def test_five_day_returns_weekday_thirty_minute_sessions(self) -> None:
        payload = self.provider.history("AAPL", "5D")
        self.assertEqual(payload["interval"], "30m")
        bars = payload["bars"]
        # Four complete weekday sessions plus today's partial Monday session.
        self.assertEqual(len(bars), 64)
        days: dict[str, list[dict]] = {}
        for bar in bars:
            days.setdefault(bar["t"][:10], []).append(bar)
        self.assertEqual(
            list(days),
            [
                "2025-06-10",
                "2025-06-11",
                "2025-06-12",
                "2025-06-13",
                "2025-06-16",
            ],
        )
        for day_text, day_bars in days.items():
            self.assertLess(date.fromisoformat(day_text).weekday(), 5, day_text)
            self.assertEqual(day_bars[0]["t"], f"{day_text}T09:30:00Z")
            stamps = _iso_timestamps(day_bars)
            self.assertEqual(
                {
                    (later - earlier).total_seconds()
                    for earlier, later in zip(stamps, stamps[1:])
                },
                {1800.0},
            )
            for stamp in stamps:
                minutes = stamp.hour * 60 + stamp.minute
                self.assertGreaterEqual(minutes, 9 * 60 + 30)
                self.assertLessEqual(minutes, 16 * 60)
                self.assertEqual(stamp.minute % 30, 0)
            for bar in day_bars:
                self.assertGreaterEqual(bar["h"], max(bar["o"], bar["c"]))
                self.assertLessEqual(bar["l"], min(bar["o"], bar["c"]))
                self.assertGreater(bar["v"], 0.0)
        self.assertEqual(
            [len(day_bars) for day_bars in days.values()],
            [13, 13, 13, 13, 12],
        )
        self.assertEqual(bars[-1]["t"], "2025-06-16T15:00:00Z")

    def test_unknown_symbol_uses_conventional_windows(self) -> None:
        payload = self.provider.history("ZZZZ", "1Y")
        self.assertEqual(payload["interval"], "1d")
        self.assertEqual(len(payload["bars"]), 252)
        self.assertEqual(payload["bars"][-1]["t"], TODAY.isoformat())
        self.assertGreater(payload["bars"][-1]["c"], 0.0)
        intraday = self.provider.history("ZZZZ", "1D")
        self.assertEqual(intraday["interval"], "5m")
        self.assertEqual(len(intraday["bars"]), 187)
        self.assertIn("T", intraday["bars"][-1]["t"])

    # ------------------------------------------------------------------
    # Quote/volume contracts that must not change
    # ------------------------------------------------------------------
    def test_unknown_symbol_is_deterministic(self) -> None:
        other = SyntheticProvider(now_fn=fixed_now)
        first = self.provider.quote("ZZZZ")
        self.assertEqual(first, other.quote("ZZZZ"))
        self.assertEqual(first["name"], "ZZZZ")
        self.assertGreater(first["price"], 1.0)
        self.assertLess(first["price"], 5000.0)
        different = self.provider.quote("WXYZ")
        self.assertNotEqual(first["price"], different["price"])
        for symbol in ("AAA", "BBB", "CCC", "DDD"):
            quote = self.provider.quote(symbol)
            self.assertGreater(quote["price"], 1.0)
            self.assertLess(quote["price"], 5000.0)

    def test_volume_by_instrument_type(self) -> None:
        aapl = self.provider.quote("AAPL")
        self.assertGreater(aapl["volume"], 0.0)
        self.assertLessEqual(aapl["volume"], 55_000_000.0 * 1.35)
        index_quote = self.provider.quote("^GSPC")
        self.assertEqual(index_quote["volume"], 0.0)
        forex_quote = self.provider.quote("EURUSD=X")
        self.assertEqual(forex_quote["volume"], 0.0)
        crypto_quote = self.provider.quote("BTC-USD")
        self.assertGreater(crypto_quote["volume"], 100_000_000.0)

    def test_market_state_is_always_simulated(self) -> None:
        for symbol in ("AAPL", "BTC-USD", "^GSPC", "EURUSD=X", "GC=F", "ZZZZ"):
            self.assertEqual(
                self.provider.quote(symbol)["market_state"], "simulated", symbol
            )

    def test_available_and_supports(self) -> None:
        self.assertTrue(self.provider.available())
        self.assertTrue(self.provider.supports("AAPL"))
        self.assertTrue(self.provider.supports("ZZZZ"))
        self.assertFalse(self.provider.supports("bad symbol"))

    def test_invalid_inputs(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.provider.history("AAPL", "2Y")
        with self.assertRaises(InvalidSymbolError):
            self.provider.history("bad symbol", "1Y")
        with self.assertRaises(InvalidSymbolError):
            self.provider.quote("")

    def test_anchor_uses_catalog_base_price(self) -> None:
        # A clock on the anchor date returns the catalog base price.
        anchor = SyntheticProvider(
            now_fn=lambda: datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc).timestamp()
        )
        path = anchor._ensure_daily_path("AAPL")  # noqa: SLF001 - white-box assertion
        self.assertAlmostEqual(path[ANCHOR_DATE], 231.45)

    def test_history_next_day_extends_path(self) -> None:
        tomorrow = FIXED_NOW + 24 * 3600
        later = SyntheticProvider(now_fn=lambda: tomorrow)
        later_bars = later.history_daily("AAPL", 2)
        # Yesterday's completed bar on the next day equals the daily close path
        # value for today (the daily path is independent of the intraday path).
        self.assertEqual(later_bars[-2]["t"], TODAY.isoformat())
        today_close = self.provider._ensure_daily_path("AAPL")[TODAY]  # noqa: SLF001
        self.assertAlmostEqual(later_bars[-2]["c"], today_close)
        self.assertEqual(later_bars[-1]["t"], (TODAY + timedelta(days=1)).isoformat())

    def test_today_bar_starts_at_yesterdays_close(self) -> None:
        quote = self.provider.quote("AAPL")
        today_bar = self.provider.history_daily("AAPL", 1)[0]
        self.assertAlmostEqual(today_bar["o"], quote["prev_close"])
        self.assertAlmostEqual(today_bar["c"], quote["price"])


class DeterministicClockTests(unittest.TestCase):
    """The injected clock fully determines the simulator output."""

    def test_different_days_differ(self) -> None:
        first = SyntheticProvider(now_fn=lambda: FIXED_NOW)
        second = SyntheticProvider(now_fn=lambda: FIXED_NOW + 86400)
        self.assertNotEqual(
            first.quote("AAPL")["price"], second.quote("AAPL")["price"]
        )
        # The next day's previous close is the completed daily bar for today.
        today_close = first._ensure_daily_path("AAPL")[TODAY]  # noqa: SLF001
        self.assertAlmostEqual(second.quote("AAPL")["prev_close"], today_close)

    def test_utc_day_boundary(self) -> None:
        provider = SyntheticProvider(
            now_fn=lambda: datetime(
                2025, 6, 17, 0, 0, 1, tzinfo=timezone.utc
            ).timestamp()
        )
        quote = provider.quote("AAPL")
        self.assertEqual(quote["as_of"], "2025-06-17T00:00:01Z")
        bars = provider.history_daily("AAPL", 1)
        self.assertEqual(len(bars), 1)
        self.assertEqual(bars[0]["t"], "2025-06-17")
        one_day = provider.history("AAPL", "1D")["bars"]
        self.assertEqual(len(one_day), 1)
        self.assertEqual(one_day[0]["t"], "2025-06-17T00:00:00Z")
        # The 5D window only includes regular sessions that have started, so
        # Tuesday's empty session is skipped and the previous four weekdays
        # remain (13 half-hour bars each).
        five_day = provider.history("AAPL", "5D")["bars"]
        self.assertEqual(len(five_day), 52)
        self.assertEqual(five_day[-1]["t"], "2025-06-16T15:30:00Z")
        self.assertEqual(
            {bar["t"][:10] for bar in five_day},
            {"2025-06-11", "2025-06-12", "2025-06-13", "2025-06-16"},
        )


if __name__ == "__main__":
    unittest.main()
