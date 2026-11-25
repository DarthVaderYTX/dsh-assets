"""Service orchestration tests: watchlist, analysis, alerts, portfolio, fallbacks."""

from __future__ import annotations

import math
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import MarketMonitorService, indicators
from market_monitor.catalog import DEFAULT_WATCHLIST
from market_monitor.errors import (
    InvalidArgumentError,
    InvalidSymbolError,
    NotFoundError,
    ProviderUnavailableError,
    SymbolNotFoundError,
)
from market_monitor.providers import ProviderSelection
from market_monitor.providers.base import Provider

#: Fixed clock: 2025-06-15T15:06:40Z, deterministic for simulator and cooldowns.
FIXED_NOW = 1_750_000_000.0
TODAY = datetime.fromtimestamp(FIXED_NOW, tz=timezone.utc).date()


def fixed_now() -> float:
    """Return the fixed test clock."""
    return FIXED_NOW


def _quote(
    symbol: str,
    price: float = 100.0,
    prev_close: float = 99.0,
    volume: float = 1_000_000.0,
    **extra: object,
) -> dict:
    """Build a minimal provider quote (the service fills in the rest)."""
    quote = {
        "symbol": symbol,
        "name": f"{symbol} Stub",
        "exchange": "STUB",
        "type": "stock",
        "sector": "Technology",
        "currency": "USD",
        "price": price,
        "prev_close": prev_close,
        "open": prev_close,
        "high": max(price, prev_close) + 1.0,
        "low": min(price, prev_close) - 1.0,
        "volume": volume,
        "market_state": "open",
        "as_of": "2025-06-15T15:00:00Z",
        "source": "stub",
    }
    quote.update(extra)
    return quote


def _bars_from_closes(
    closes: list[float],
    volumes: list[float] | None = None,
    end: date = TODAY,
) -> list[dict]:
    """Build daily bars ending at ``end`` from a list of closes."""
    bars: list[dict] = []
    start = end - timedelta(days=len(closes) - 1)
    previous: float | None = None
    for index, close in enumerate(closes):
        open_price = previous if previous is not None else close
        high = max(open_price, close) + 1.0
        low = max(min(open_price, close) - 1.0, 0.01)
        volume = volumes[index] if volumes is not None else 1_000_000.0
        bars.append(
            {
                "t": (start + timedelta(days=index)).isoformat(),
                "o": open_price,
                "h": high,
                "l": low,
                "c": float(close),
                "v": volume,
            }
        )
        previous = float(close)
    return bars


def _daily_bars(count: int = 252, base: float = 100.0) -> list[dict]:
    """Build a gently rising deterministic daily bar series."""
    return _bars_from_closes([base + index * 0.1 for index in range(count)])


class StubProvider(Provider):
    """A controllable in-memory provider used to inject quotes/bars."""

    name = "stub"
    live = False

    def __init__(self) -> None:
        self.quotes: dict[str, dict] = {}
        self.histories: dict[str, list[dict]] = {}
        self.fail_all = False
        self.fail_quote_symbols: set[str] = set()
        self.fail_history_symbols: set[str] = set()

    def available(self) -> bool:
        """The stub is always available."""
        return True

    def quote(self, symbol: str) -> dict:
        """Return an injected quote or a default one."""
        if self.fail_all or symbol in self.fail_quote_symbols:
            raise ProviderUnavailableError(
                f"stub quote failure for {symbol}", symbol_level=True
            )
        if symbol in self.quotes:
            return dict(self.quotes[symbol])
        return _quote(symbol)

    def history(
        self, symbol: str, range_: str = "1Y", interval: str | None = None
    ) -> dict:
        """Return injected or generated daily bars (legacy provider shape)."""
        if self.fail_all or symbol in self.fail_history_symbols:
            raise ProviderUnavailableError(
                f"stub history failure for {symbol}", symbol_level=True
            )
        bars = self.histories.get(symbol) or _daily_bars()
        return {
            "symbol": symbol,
            "range": range_,
            "interval": "1d",
            "bars": [dict(bar) for bar in bars],
            "source": "stub",
        }

    def history_daily(self, symbol: str, lookback_days: int) -> list[dict]:
        """Return the last ``lookback_days`` injected/generated daily bars."""
        if self.fail_all or symbol in self.fail_history_symbols:
            raise ProviderUnavailableError(
                f"stub history failure for {symbol}", symbol_level=True
            )
        bars = self.histories.get(symbol) or _daily_bars()
        return [dict(bar) for bar in bars[-lookback_days:]]


class ServiceTestCase(unittest.TestCase):
    """Common setup: a fresh synthetic service with a fixed clock."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.service = MarketMonitorService(
            data_dir=self.tmp.name,
            provider="synthetic",
            poll_seconds=15,
            benchmark="^GSPC",
            now_fn=fixed_now,
        )

    def tearDown(self) -> None:
        try:
            self.service.close()
        finally:
            self.tmp.cleanup()

    def use_stub(self, stub: StubProvider | None = None) -> StubProvider:
        """Install a stub provider and clear provider-derived caches."""
        provider = stub or StubProvider()
        self.service._provider = provider  # noqa: SLF001 - test seam
        self.service._degraded = False  # noqa: SLF001
        self.service._last_error = None  # noqa: SLF001
        self.service._quotes.clear()  # noqa: SLF001
        self.service._daily_cache.clear()  # noqa: SLF001
        self.service._intraday_cache.clear()  # noqa: SLF001
        self.service._daily_history_cache.clear()  # noqa: SLF001
        return provider


class SeedAndWatchlistTests(ServiceTestCase):
    """First-run seeding and watchlist operations."""

    def test_first_run_seeds_watchlist(self) -> None:
        items = self.service.list_watchlist()["items"]
        self.assertEqual([item["symbol"] for item in items], list(DEFAULT_WATCHLIST))
        self.assertEqual(items[0]["name"], "Apple Inc.")
        self.assertEqual([item["order"] for item in items], list(range(8)))

    def test_empty_portfolio_and_alerts(self) -> None:
        self.assertEqual(self.service.portfolio()["positions"], [])
        self.assertEqual(self.service.list_alerts()["rules"], [])
        self.assertEqual(self.service.list_events()["events"], [])

    def test_catalog_filters(self) -> None:
        everything = self.service.catalog()["items"]
        self.assertGreaterEqual(len(everything), 30)
        apple = self.service.catalog(q="apple")["items"]
        self.assertEqual([item["symbol"] for item in apple], ["AAPL"])
        crypto = self.service.catalog(type="crypto")["items"]
        self.assertEqual(
            {item["symbol"] for item in crypto},
            {"BTC-USD", "ETH-USD", "SOL-USD"},
        )
        limited = self.service.catalog(limit=2)["items"]
        self.assertEqual(len(limited), 2)
        self.assertTrue(everything[0]["default_watch"])

    def test_watchlist_add_remove_note(self) -> None:
        added = self.service.add_watch("SPY", note="index etf")
        self.assertTrue(added["created"])
        self.assertEqual(added["item"]["name"], "SPDR S&P 500 ETF Trust")
        self.assertEqual(added["item"]["note"], "index etf")
        again = self.service.add_watch("SPY")
        self.assertFalse(again["created"])
        updated = self.service.set_note("SPY", "core holding")["item"]
        self.assertEqual(updated["note"], "core holding")
        removed = self.service.remove_watch("SPY")
        self.assertEqual(removed, {"ok": True, "removed": "SPY"})
        self.assertNotIn(
            "SPY", [item["symbol"] for item in self.service.list_watchlist()["items"]]
        )

    def test_watchlist_rejects_bad_symbols(self) -> None:
        with self.assertRaises(InvalidSymbolError):
            self.service.add_watch("bad symbol")
        with self.assertRaises(InvalidSymbolError):
            self.service.add_watch(None)  # type: ignore[arg-type]
        with self.assertRaises(NotFoundError):
            self.service.set_note("SPY", "not watched")

    def test_arbitrary_valid_symbol_can_be_watched(self) -> None:
        result = self.service.add_watch("MYFAV")
        self.assertTrue(result["created"])
        quote = self.service.quote("MYFAV")
        self.assertEqual(quote["symbol"], "MYFAV")
        self.assertGreater(quote["price"], 0.0)

    def test_quote_unknown_symbol(self) -> None:
        with self.assertRaises(SymbolNotFoundError) as context:
            self.service.quote("ZZZZ")
        self.assertEqual(context.exception.status, 404)
        with self.assertRaises(InvalidSymbolError):
            self.service.quote("bad symbol")


class SnapshotAnalysisTests(ServiceTestCase):
    """Snapshot/analysis contracts including null-safety and overlays."""

    def test_snapshot_contract(self) -> None:
        payload = self.service.snapshot()
        self.assertEqual(payload["provider"], "synthetic")
        self.assertFalse(payload["stale"])
        self.assertFalse(payload["degraded"])
        self.assertIsInstance(payload["as_of"], str)
        self.assertEqual(len(payload["quotes"]), len(DEFAULT_WATCHLIST))
        quote = payload["quotes"][0]
        for key in (
            "symbol",
            "name",
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
            "stale",
            "spark",
            "rsi14",
            "trend",
        ):
            self.assertIn(key, quote)
        self.assertEqual(len(quote["spark"]), 30)
        self.assertIn(quote["trend"], ("uptrend", "downtrend", "sideways"))
        self.assertIsInstance(quote["rsi14"], float)

    def test_snapshot_explicit_symbols(self) -> None:
        payload = self.service.snapshot("AAPL,MSFT")
        self.assertEqual(
            [quote["symbol"] for quote in payload["quotes"]], ["AAPL", "MSFT"]
        )
        with self.assertRaises(SymbolNotFoundError):
            self.service.snapshot("ZZZZ")

    def test_analysis_contract(self) -> None:
        analysis = self.service.analysis("AAPL")
        self.assertEqual(analysis["symbol"], "AAPL")
        self.assertEqual(analysis["name"], "Apple Inc.")
        self.assertEqual(analysis["provider"], "synthetic")
        self.assertEqual(analysis["quote"]["symbol"], "AAPL")
        summary = analysis["summary"]
        self.assertIn(summary["signal"], ("bullish", "neutral", "bearish"))
        self.assertGreaterEqual(summary["score"], -1.0)
        self.assertLessEqual(summary["score"], 1.0)
        self.assertIn(summary["confidence"], ("low", "medium", "high"))
        self.assertIn(summary["trend"], ("uptrend", "downtrend", "sideways"))
        self.assertIn(summary["momentum"], ("positive", "negative", "neutral"))
        self.assertIn(summary["volatility"], ("low", "moderate", "high"))
        self.assertIn("AAPL", summary["headline"])
        indicators = analysis["indicators"]
        for key in (
            "sma20",
            "sma50",
            "sma200",
            "ema12",
            "ema26",
            "rsi14",
            "macd",
            "bollinger",
            "atr14",
        ):
            self.assertIn(key, indicators)
        self.assertIsNotNone(indicators["sma20"])
        self.assertIsNotNone(indicators["sma200"])
        self.assertIsNotNone(indicators["macd"]["line"])
        self.assertIn("width_pct", indicators["bollinger"])
        for key in (
            "period_return_pct",
            "annualized_volatility_pct",
            "max_drawdown_pct",
            "sharpe",
            "win_rate_pct",
            "avg_daily_range_pct",
            "high_52w",
            "low_52w",
            "distance_from_52w_high_pct",
            "avg_volume_20d",
        ):
            self.assertIn(key, analysis["stats"])
        self.assertGreater(len(analysis["signals"]), 0)
        for signal in analysis["signals"]:
            self.assertEqual(
                set(signal) >= {"id", "label", "direction", "strength", "detail"},
                True,
            )
        self.assertIsInstance(analysis["narrative"], str)
        self.assertGreater(len(analysis["narrative"]), 20)
        self.assertGreaterEqual(len(analysis["levels"]["support"]), 1)
        self.assertGreaterEqual(len(analysis["levels"]["resistance"]), 1)
        correlation = analysis["correlation"]
        self.assertEqual(correlation["benchmark"], "^GSPC")
        self.assertIsNotNone(correlation["value"])
        self.assertGreater(correlation["window_days"], 100)

    def test_analysis_quote_matches_live_quote(self) -> None:
        analysis = self.service.analysis("NVDA")
        quote = self.service.quote("NVDA")
        self.assertAlmostEqual(analysis["quote"]["price"], quote["price"])
        self.assertAlmostEqual(analysis["quote"]["prev_close"], quote["prev_close"])

    def test_analysis_null_safety_on_short_history(self) -> None:
        stub = self.use_stub()
        stub.fail_all = True
        closes = [100.0, 101.0, 102.0, 101.5, 103.0]
        bars = _bars_from_closes(closes, end=TODAY)
        self.service.collect_bars("TINY", bars)
        quote = self.service.quote("TINY")
        self.assertTrue(quote["stale"])
        self.assertEqual(quote["source"], "cache")
        analysis = self.service.analysis("TINY")
        self.assertIsNone(analysis["indicators"]["sma20"])
        self.assertIsNone(analysis["indicators"]["sma200"])
        self.assertIsNone(analysis["indicators"]["macd"])
        self.assertIsNone(analysis["correlation"]["value"])
        self.assertIsNotNone(analysis["stats"]["max_drawdown_pct"])
        self.assertIsInstance(analysis["narrative"], str)
        self.assertIn(analysis["summary"]["signal"], ("bullish", "neutral", "bearish"))

    def test_history_overlays_alignment(self) -> None:
        history = self.service.history("AAPL", "1Y", overlays=True)
        bars = history["bars"]
        overlays = history["overlays"]
        self.assertEqual(history["interval"], "1d")
        self.assertEqual(len(bars), 252)
        self.assertEqual(len(overlays["sma20"]), len(bars))
        self.assertEqual(len(overlays["sma50"]), len(bars))
        self.assertEqual(len(overlays["rsi14"]), len(bars))
        for key in ("upper", "middle", "lower"):
            self.assertEqual(len(overlays["bollinger"][key]), len(bars))
        self.assertEqual(overlays["sma20"][:19], [None] * 19)
        self.assertIsNotNone(overlays["sma20"][19])
        self.assertEqual(overlays["sma50"][:49], [None] * 49)
        self.assertEqual(overlays["rsi14"][:14], [None] * 14)
        self.assertEqual(overlays["bollinger"]["middle"][:19], [None] * 19)
        # Overlays are built from the chart bars (not the analysis series), so
        # verify them against the bar closes directly.
        closes = [bar["c"] for bar in bars]
        self.assertAlmostEqual(
            overlays["sma20"][-1], round(indicators.sma(closes, 20), 4)
        )
        self.assertAlmostEqual(
            overlays["sma50"][-1], round(indicators.sma(closes, 50), 4)
        )
        self.assertAlmostEqual(
            overlays["rsi14"][-1], round(indicators.rsi(closes, 14), 4)
        )
        bollinger = indicators.bollinger(closes, 20, 2.0)
        assert bollinger is not None
        self.assertAlmostEqual(
            overlays["bollinger"]["upper"][-1], round(bollinger["upper"], 4)
        )

    def test_history_without_overlays_has_no_key(self) -> None:
        history = self.service.history("AAPL", "1M")
        self.assertNotIn("overlays", history)
        self.assertEqual(len(history["bars"]), 22)
        self.assertEqual(history["interval"], "1d")

    def test_history_validation(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.history("AAPL", "2Y")
        with self.assertRaises(InvalidArgumentError):
            self.service.history("AAPL", "1M", interval="2m")
        with self.assertRaises(SymbolNotFoundError):
            self.service.history("ZZZZ", "1Y")

    def test_chart_ranges_align_the_latest_point_to_the_quote(self) -> None:
        """A chart bar on the quote's day must show the quote price.

        On a weekend the simulator's five-day window ends on Friday while the
        quote is stamped Sunday, so that bar must not be rewritten.
        """
        quote = self.service.quote("AAPL")
        aligned: set[str] = set()
        for range_name in ("LIVE", "1D", "5D", "1M", "3M", "6M", "1Y"):
            history = self.service.history("AAPL", range_name)
            self.assertGreater(len(history["bars"]), 0, range_name)
            last = history["bars"][-1]
            if last["t"][:10] == quote["as_of"][:10]:
                aligned.add(range_name)
                self.assertAlmostEqual(
                    last["c"], quote["price"], places=6, msg=range_name
                )
            else:
                self.assertLess(last["t"][:10], quote["as_of"][:10], range_name)
        self.assertEqual(aligned, {"LIVE", "1D"})

    def test_history_trims_bars_before_the_listing_date(self) -> None:
        class _Warehouse:
            @staticmethod
            def find_instrument_by_provider_symbol(symbol: str):
                return {
                    "instrument_id": f"INS:XNAS:{symbol}",
                    "mic": "XNAS",
                    "valid_from": "2025-06-10T14:30:00Z",
                    "first_seen_at": "2025-06-10T14:30:00Z",
                }

            @staticmethod
            def series_bar_span(series_id: str, interval: str = "1d"):
                return {"count": 2, "first_ts": "2025-06-13", "last_ts": "2025-06-16"}

        class _Manager:
            warehouse = _Warehouse()

            @staticmethod
            def stop() -> None:
                pass

        self.service._data_manager = _Manager()  # noqa: SLF001 - test seam
        self.service.add_watch("NEWIPO")
        for range_name in ("1M", "3M", "6M", "1Y"):
            history = self.service.history("NEWIPO", range_name)
            self.assertGreater(len(history["bars"]), 0, range_name)
            self.assertGreaterEqual(
                history["bars"][0]["t"], "2025-06-10", range_name,
            )
        five_day = self.service.history("NEWIPO", "5D")
        for bar in five_day["bars"]:
            self.assertGreaterEqual(bar["t"], "2025-06-10T14:30:00Z")

    def test_history_all_ranges_point_counts_and_intervals(self) -> None:
        expected = {
            "1D": ("5m", 182),
            "5D": ("30m", 65),
            "1M": ("1d", 22),
            "3M": ("1d", 66),
            "6M": ("1d", 132),
            "1Y": ("1d", 252),
        }
        quote = self.service.quote("AAPL")
        for range_name, (interval, count) in expected.items():
            history = self.service.history("AAPL", range_name)
            self.assertEqual(history["symbol"], "AAPL")
            self.assertEqual(history["range"], range_name)
            self.assertEqual(history["interval"], interval, range_name)
            self.assertEqual(history["provider"], "synthetic", range_name)
            self.assertFalse(history["stale"], range_name)
            bars = history["bars"]
            self.assertEqual(len(bars), count, range_name)
            labels = [bar["t"] for bar in bars]
            self.assertEqual(labels, sorted(labels), range_name)
            self.assertEqual(len(set(labels)), len(labels), range_name)
            for bar in bars:
                self.assertGreaterEqual(bar["h"], max(bar["o"], bar["c"]))
                self.assertLessEqual(bar["l"], min(bar["o"], bar["c"]))
                if interval == "1d":
                    self.assertNotIn("T", bar["t"], range_name)
                    self.assertEqual(len(bar["t"]), 10, range_name)
                    date.fromisoformat(bar["t"])
                else:
                    self.assertIn("T", bar["t"], range_name)
                    self.assertTrue(bar["t"].endswith("Z"), range_name)
                    datetime.strptime(bar["t"], "%Y-%m-%dT%H:%M:%SZ")
            if interval == "1d":
                last_day = date.fromisoformat(bars[-1]["t"])
                self.assertLess(last_day.weekday(), 5, range_name)
                self.assertLessEqual(last_day, TODAY, range_name)
        # Intraday windows end on the last elapsed bucket of their session.
        self.assertEqual(
            self.service.history("AAPL", "1D")["bars"][-1]["t"],
            "2025-06-15T15:05:00Z",
        )
        self.assertEqual(
            self.service.history("AAPL", "5D")["bars"][-1]["t"],
            "2025-06-13T15:30:00Z",
        )

    def test_history_interval_is_validated_but_ignored(self) -> None:
        one_day = self.service.history("AAPL", "1D", interval="1d")
        self.assertEqual(one_day["interval"], "5m")
        self.assertEqual(len(one_day["bars"]), 182)
        five_day = self.service.history("AAPL", "5D", interval="1d")
        self.assertEqual(five_day["interval"], "30m")
        self.assertEqual(len(five_day["bars"]), 65)
        six_month = self.service.history("AAPL", "6M", interval="5m")
        self.assertEqual(six_month["interval"], "1d")
        self.assertEqual(len(six_month["bars"]), 132)

    def test_five_day_returns_weekday_thirty_minute_sessions(self) -> None:
        history = self.service.history("AAPL", "5D")
        self.assertEqual(history["interval"], "30m")
        bars = history["bars"]
        # The fixed clock is a Sunday, so the window holds the five completed
        # weekday sessions 09:30-16:00 UTC with 13 half-hour bars each.
        self.assertEqual(len(bars), 65)
        days: dict[str, list[dict]] = {}
        for bar in bars:
            days.setdefault(bar["t"][:10], []).append(bar)
        self.assertEqual(
            list(days),
            [
                "2025-06-09",
                "2025-06-10",
                "2025-06-11",
                "2025-06-12",
                "2025-06-13",
            ],
        )
        for day_text, day_bars in days.items():
            self.assertLess(date.fromisoformat(day_text).weekday(), 5, day_text)
            self.assertEqual(len(day_bars), 13, day_text)
            self.assertEqual(day_bars[0]["t"], f"{day_text}T09:30:00Z")
            self.assertEqual(day_bars[-1]["t"], f"{day_text}T15:30:00Z")
            stamps = [
                datetime.strptime(bar["t"], "%Y-%m-%dT%H:%M:%SZ")
                for bar in day_bars
            ]
            self.assertEqual(
                {
                    (later - earlier).total_seconds()
                    for earlier, later in zip(stamps, stamps[1:])
                },
                {1800.0},
            )
        # The service serves the provider's authoritative window unchanged.
        self.assertEqual(bars, self.service._provider.history_five_day("AAPL"))
        cached = self.service.history("AAPL", "5D")
        self.assertEqual(cached["bars"], history["bars"])

    def test_stale_intraday_rows_are_replaced_by_the_authoritative_window(self) -> None:
        # A previous provider/window may have left 5m/30m rows behind.  Daily
        # charts never read them, and intraday charts replace the whole window,
        # so an old value can never leak into a response.
        junk = [
            {
                "t": "2024-01-02T14:30:00Z", "o": 1.0, "h": 2.0,
                "l": 0.5, "c": 1.5, "v": 10.0,
            }
        ]
        self.service._store.upsert_bars("AAPL", "30m", junk, "stale-test")  # noqa: SLF001
        self.service._store.upsert_bars("AAPL", "5m", junk, "stale-test")  # noqa: SLF001
        monthly = self.service.history("AAPL", "1M")
        self.assertEqual(monthly["interval"], "1d")
        self.assertEqual(len(monthly["bars"]), 22)
        for bar in monthly["bars"]:
            self.assertNotIn("T", bar["t"])
            self.assertNotEqual(bar["c"], 1.5)
        five_day = self.service.history("AAPL", "5D")
        self.assertEqual(five_day["interval"], "30m")
        self.assertEqual(len(five_day["bars"]), 65)
        self.assertNotIn(
            "2024-01-02T14:30:00Z", [bar["t"] for bar in five_day["bars"]]
        )
        one_day = self.service.history("AAPL", "1D")
        self.assertEqual(one_day["interval"], "5m")
        self.assertEqual(len(one_day["bars"]), 182)
        self.assertNotIn(
            "2024-01-02T14:30:00Z", [bar["t"] for bar in one_day["bars"]]
        )
        # The stale rows were replaced by the authoritative fetched windows.
        self.assertEqual(len(self.service._store.get_bars("AAPL", "30m")), 65)  # noqa: SLF001
        self.assertEqual(len(self.service._store.get_bars("AAPL", "5m")), 182)  # noqa: SLF001

    def test_history_cached_second_call_does_not_refetch(self) -> None:
        provider = self.service._provider
        with mock.patch.object(
            provider, "history_daily", wraps=provider.history_daily
        ) as patched:
            first = self.service.history("AAPL", "6M")
            second = self.service.history("AAPL", "6M")
        self.assertEqual(first["bars"], second["bars"])
        self.assertEqual(patched.call_count, 1)

    def test_history_provider_failure_uses_stored_daily_bars(self) -> None:
        stub = self.use_stub()
        daily = _bars_from_closes([100.0 + index for index in range(10)])
        self.service.collect_bars("FALLBACK", daily)
        stub.fail_all = True
        history = self.service.history("FALLBACK", "1M")
        self.assertTrue(history["stale"])
        self.assertEqual(history["provider"], "cache")
        # The 1M window is 22 daily bars; only the ten stored bars exist.
        self.assertEqual(history["interval"], "1d")
        self.assertEqual(len(history["bars"]), 10)
        self.assertEqual(history["bars"], daily)
        long_window = self.service.history("FALLBACK", "1Y")
        self.assertEqual(long_window["interval"], "1d")
        self.assertEqual(len(long_window["bars"]), 10)
        self.assertEqual(long_window["bars"], daily)
        # Intraday and daily densities are stored separately. With no stored
        # five-minute rows the 1D read fails rather than serving daily bars.
        with self.assertRaises(ProviderUnavailableError):
            self.service.history("FALLBACK", "1D")
        with self.assertRaises(ProviderUnavailableError):
            self.service.history("FALLBACK", "5D")

    def test_intraday_and_daily_storage_are_read_separately(self) -> None:
        stub = self.use_stub()
        daily = _bars_from_closes([100.0 + index for index in range(10)])
        self.service.collect_bars("DENSITY", daily)
        intraday = [
            {"t": f"2025-06-15T{hour:02d}:{minute:02d}:00Z",
             "o": 200.0, "h": 201.0, "l": 199.0, "c": 200.5, "v": 10.0}
            for hour, minute in ((14, 0), (14, 5), (14, 10))
        ]
        thirty = [
            {"t": "2025-06-15T14:30:00Z",
             "o": 200.0, "h": 202.0, "l": 199.0, "c": 201.0, "v": 30.0},
        ]
        self.service._store.upsert_bars("DENSITY", "5m", intraday, "test")
        self.service._store.upsert_bars("DENSITY", "30m", thirty, "test")
        stub.fail_all = True
        one_day = self.service.history("DENSITY", "1D")
        self.assertEqual(one_day["interval"], "5m")
        self.assertEqual([bar["t"] for bar in one_day["bars"]],
                         [bar["t"] for bar in intraday])
        five_day = self.service.history("DENSITY", "5D")
        self.assertEqual(five_day["interval"], "30m")
        self.assertEqual([bar["t"] for bar in five_day["bars"]],
                         [bar["t"] for bar in thirty])
        month = self.service.history("DENSITY", "1M")
        self.assertEqual(month["interval"], "1d")
        self.assertEqual([bar["t"] for bar in month["bars"]],
                         [bar["t"] for bar in daily])
        # Reading one density never mutates the other.
        self.assertEqual(
            [bar["t"] for bar in self.service._store.get_bars("DENSITY", "1d")],
            [bar["t"] for bar in daily],
        )

    def test_history_provider_failure_without_data_is_503(self) -> None:
        stub = self.use_stub()
        stub.fail_all = True
        with self.assertRaises(ProviderUnavailableError):
            self.service.history("AAPL", "1M")

    def test_analysis_uses_daily_bars_not_aggregated_chart_bars(self) -> None:
        stub = self.use_stub()
        lookbacks: list[tuple[str, int]] = []
        original = stub.history_daily

        def spy(symbol: str, lookback_days: int) -> list[dict]:
            lookbacks.append((symbol, lookback_days))
            return original(symbol, lookback_days)

        stub.history_daily = spy  # type: ignore[method-assign]
        analysis = self.service.analysis("AAPL")
        self.assertIn(("AAPL", 252), lookbacks)
        self.assertIn(("^GSPC", 252), lookbacks)
        self.assertGreater(analysis["correlation"]["window_days"], 100)
        self.assertIsNotNone(analysis["indicators"]["sma200"])

    def test_screener_uses_daily_bars(self) -> None:
        stub = self.use_stub()
        lookbacks: list[tuple[str, int]] = []
        original = stub.history_daily

        def spy(symbol: str, lookback_days: int) -> list[dict]:
            lookbacks.append((symbol, lookback_days))
            return original(symbol, lookback_days)

        stub.history_daily = spy  # type: ignore[method-assign]
        rows = self.service.screener("gainers", limit=50)["rows"]
        self.assertEqual(len(rows), len(DEFAULT_WATCHLIST))
        self.assertEqual(lookbacks, [(symbol, 252) for symbol in DEFAULT_WATCHLIST])


class AlertTests(ServiceTestCase):
    """Alert validation, CRUD, evaluation and cooldowns."""

    def test_alert_validation(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "bogus_kind", 1.0)
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "price_above", math.nan)
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "price_above")
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "ma_cross", params={"fast": 50, "slow": 20})
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "ma_cross", params={"direction": "up"})
        with self.assertRaises(SymbolNotFoundError):
            self.service.create_alert("ZZZZ", "price_above", 1.0)
        with self.assertRaises(InvalidArgumentError):
            self.service.create_alert("AAPL", "price_above", 1.0, cooldown_s=-1)

    def test_alert_crud_and_armed(self) -> None:
        created = self.service.create_alert(
            "AAPL", "price_above", 250.0, note="breakout", cooldown_s=60
        )["rule"]
        self.assertEqual(len(created["id"]), 12)
        self.assertTrue(created["enabled"])
        self.assertTrue(created["armed"])
        self.assertIsNone(created["last_triggered_at"])
        self.assertEqual(created["params"], {})
        rules = self.service.list_alerts()["rules"]
        self.assertEqual(len(rules), 1)
        updated = self.service.update_alert(created["id"], enabled=False)["rule"]
        self.assertFalse(updated["enabled"])
        self.assertFalse(updated["armed"])
        threshold = self.service.update_alert(created["id"], threshold=300.0)["rule"]
        self.assertEqual(threshold["threshold"], 300.0)
        with self.assertRaises(NotFoundError):
            self.service.update_alert("deadbeefcafe", enabled=True)
        self.assertEqual(self.service.delete_alert(created["id"]), {"ok": True})
        with self.assertRaises(NotFoundError):
            self.service.delete_alert(created["id"])

    def test_sync_triggers_alert_then_cooldown(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=150.0, prev_close=140.0)
        rule = self.service.create_alert(
            "AAPL", "price_above", 100.0, cooldown_s=3600
        )["rule"]
        first = self.service.sync()
        self.assertEqual(len(first["triggered"]), 1)
        event = first["triggered"][0]
        self.assertEqual(event["rule_id"], rule["id"])
        self.assertEqual(event["kind"], "price_above")
        self.assertEqual(event["symbol"], "AAPL")
        self.assertIn("crossed above", event["message"])
        self.assertFalse(event["acknowledged"])
        events = self.service.list_events()["events"]
        self.assertEqual(len(events), 1)
        # The rule is now in cooldown.
        second = self.service.sync()
        self.assertEqual(second["triggered"], [])
        rule_now = self.service.list_alerts()["rules"][0]
        self.assertFalse(rule_now["armed"])
        self.assertIsNotNone(rule_now["last_triggered_at"])
        # Zero cooldown allows another trigger immediately.
        self.service.update_alert(rule["id"], cooldown_s=0)
        third = self.service.sync()
        self.assertEqual(len(third["triggered"]), 1)
        self.assertEqual(len(self.service.list_events()["events"]), 2)

    def test_rsi_alert(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=60.0, prev_close=61.0)
        stub.histories["AAPL"] = _bars_from_closes(
            [100.0 - index * 0.5 for index in range(120)]
        )
        self.service.create_alert("AAPL", "rsi_below", 50.0)
        triggered = self.service.sync()["triggered"]
        self.assertEqual(len(triggered), 1)
        self.assertEqual(triggered[0]["kind"], "rsi_below")

    def test_volume_spike_alert(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=100.0, volume=5_000_000.0)
        stub.histories["AAPL"] = _bars_from_closes(
            [100.0 + index * 0.1 for index in range(252)],
            volumes=[1_000_000.0] * 252,
        )
        self.service.create_alert("AAPL", "volume_spike", 3.0)
        triggered = self.service.sync()["triggered"]
        self.assertEqual(len(triggered), 1)
        self.assertEqual(triggered[0]["kind"], "volume_spike")

    def test_ma_cross_alert(self) -> None:
        stub = self.use_stub()
        closes = [100.0] * 50 + [85.0] * 10 + [300.0]
        stub.quotes["AAPL"] = _quote("AAPL", price=300.0, prev_close=85.0)
        stub.histories["AAPL"] = _bars_from_closes(closes)
        self.service.create_alert(
            "AAPL",
            "ma_cross",
            params={"fast": 20, "slow": 50, "direction": "golden"},
        )
        triggered = self.service.sync()["triggered"]
        self.assertEqual(len(triggered), 1)
        self.assertEqual(triggered[0]["kind"], "ma_cross")
        self.assertIn("crossed above", triggered[0]["message"])

    def test_change_pct_alert(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=110.0, prev_close=100.0)
        self.service.create_alert("AAPL", "change_pct_above", 5.0)
        triggered = self.service.sync()["triggered"]
        self.assertEqual(len(triggered), 1)
        self.assertEqual(triggered[0]["kind"], "change_pct_above")

    def test_event_acknowledgement(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=150.0)
        rule = self.service.create_alert("AAPL", "price_above", 100.0)["rule"]
        self.service.sync()
        self.service.update_alert(rule["id"], cooldown_s=0)
        self.service.sync()
        events = self.service.list_events()["events"]
        self.assertEqual(len(events), 2)
        acknowledged = self.service.ack_events(ids=[events[0]["id"]])
        self.assertEqual(acknowledged, {"acknowledged": 1})
        unacknowledged = self.service.list_events(acknowledged=False)["events"]
        self.assertEqual(len(unacknowledged), 1)
        self.assertEqual(
            self.service.ack_events(all_events=True), {"acknowledged": 1}
        )
        self.assertEqual(self.service.list_events()["events"][0]["acknowledged"], True)
        with self.assertRaises(InvalidArgumentError):
            self.service.ack_events()
        with self.assertRaises(InvalidArgumentError):
            self.service.ack_events(ids=[123])  # type: ignore[list-item]


class PortfolioTests(ServiceTestCase):
    """Portfolio math and validation."""

    def test_position_math_and_totals(self) -> None:
        stub = self.use_stub()
        stub.quotes["AAPL"] = _quote("AAPL", price=200.0, prev_close=190.0)
        aapl = self.service.set_position("AAPL", 10, 150.0)["position"]
        self.assertAlmostEqual(aapl["market_value"], 2000.0)
        self.assertAlmostEqual(aapl["cost_basis"], 1500.0)
        self.assertAlmostEqual(aapl["unrealized_pnl"], 500.0)
        self.assertAlmostEqual(aapl["unrealized_pnl_pct"], 33.33, places=2)
        self.assertAlmostEqual(aapl["day_change"], 100.0)
        self.assertAlmostEqual(aapl["day_change_pct"], 5.26, places=2)
        stub.quotes["MSFT"] = _quote("MSFT", price=100.0, prev_close=100.0)
        self.service.set_position("MSFT", 5, 80.0)
        portfolio = self.service.portfolio()
        self.assertEqual(len(portfolio["positions"]), 2)
        totals = portfolio["totals"]
        self.assertAlmostEqual(totals["market_value"], 2500.0)
        self.assertAlmostEqual(totals["cost_basis"], 1900.0)
        self.assertAlmostEqual(totals["unrealized_pnl"], 600.0)
        self.assertAlmostEqual(totals["unrealized_pnl_pct"], 31.58, places=2)
        self.assertAlmostEqual(totals["day_change"], 100.0)
        weights = {entry["symbol"]: entry["weight_pct"] for entry in portfolio["positions"]}
        self.assertAlmostEqual(weights["AAPL"], 80.0)
        self.assertAlmostEqual(weights["MSFT"], 20.0)
        self.assertEqual(portfolio["currency"], "USD")

    def test_position_validation(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.set_position("AAPL", math.nan, 100.0)
        with self.assertRaises(InvalidArgumentError):
            self.service.set_position("AAPL", 1, -5.0)
        with self.assertRaises(SymbolNotFoundError):
            self.service.set_position("ZZZZ", 1, 100.0)

    def test_delete_position(self) -> None:
        self.service.set_position("AAPL", 1, 100.0)
        self.assertEqual(
            self.service.delete_position("AAPL"), {"ok": True, "removed": "AAPL"}
        )
        self.assertEqual(self.service.portfolio()["positions"], [])


class ScreenerTests(ServiceTestCase):
    """Screener presets, scope and limit clamps."""

    def test_screener_rows_and_scope(self) -> None:
        payload = self.service.screener("momentum", limit=3)
        self.assertEqual(payload["preset"], "momentum")
        self.assertEqual(len(payload["rows"]), 3)
        row = payload["rows"][0]
        for key in (
            "symbol",
            "name",
            "price",
            "change_pct",
            "rsi14",
            "trend",
            "score",
            "volume",
        ):
            self.assertIn(key, row)
        self.assertEqual(payload["scope"], list(DEFAULT_WATCHLIST))
        self.service.set_position("SPY", 1, 100.0)
        scope = self.service.screener("gainers", limit=50)["scope"]
        self.assertIn("SPY", scope)
        gainers = self.service.screener("gainers", limit=50)["rows"]
        changes = [row["change_pct"] for row in gainers if row["change_pct"] is not None]
        self.assertEqual(changes, sorted(changes, reverse=True))

    def test_screener_presets(self) -> None:
        for preset in (
            "gainers",
            "losers",
            "momentum",
            "oversold",
            "overbought",
            "volatile",
        ):
            rows = self.service.screener(preset, limit=5)["rows"]
            self.assertGreater(len(rows), 0, preset)

    def test_screener_validation_and_clamp(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.screener("bogus")
        with self.assertRaises(InvalidArgumentError):
            self.service.screener("gainers", limit="nan")
        self.assertEqual(len(self.service.screener("gainers", limit=0)["rows"]), 1)
        self.assertEqual(
            len(self.service.screener("gainers", limit=1000)["rows"]),
            len(DEFAULT_WATCHLIST),
        )


class CollectionAndFallbackTests(ServiceTestCase):
    """Collected bars and provider-failure fallbacks."""

    def test_collect_bars_stores_rows(self) -> None:
        bars = _bars_from_closes([100.0, 101.0, 102.0])
        result = self.service.collect_bars("MANUAL", bars)
        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["interval"], "1d")
        self.assertEqual(result["source"], "manual")
        self.assertEqual(result["range"]["from"], bars[0]["t"])
        self.assertEqual(result["range"]["to"], bars[-1]["t"])
        stub = self.use_stub()
        stub.fail_all = True
        history = self.service.history("MANUAL", "1M")
        self.assertTrue(history["stale"])
        self.assertEqual(history["provider"], "cache")
        # The 1M window is fixed at 22 daily bars; the three collected daily
        # rows are served as-is instead of being aggregated into one point.
        self.assertEqual(history["interval"], "1d")
        self.assertEqual(len(history["bars"]), 3)
        self.assertEqual(history["bars"], bars)
        self.assertEqual(history["bars"][-1]["t"], bars[-1]["t"])

    def test_collect_bars_intraday_interval(self) -> None:
        bars = [
            {"t": "2025-06-15T10:00:00Z", "o": 1.0, "h": 2.0, "l": 0.5, "c": 1.5, "v": 10}
        ]
        result = self.service.collect_bars("MAN5", bars, interval="5m", source="collector-1")
        self.assertEqual(result["interval"], "5m")
        self.assertEqual(result["source"], "collector-1")
        self.assertEqual(result["range"]["to"], "2025-06-15T10:00:00Z")

    def test_collect_bars_validation(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.collect_bars("X", [])
        with self.assertRaises(InvalidArgumentError):
            self.service.collect_bars("X", [{"t": "not-a-date", "o": 1, "h": 1, "l": 1, "c": 1}])
        with self.assertRaises(InvalidArgumentError):
            self.service.collect_bars("X", [{"t": "2025-01-02", "o": math.nan, "h": 1, "l": 1, "c": 1}])
        with self.assertRaises(InvalidArgumentError):
            self.service.collect_bars("X", [{"t": "2025-01-02", "o": 1, "h": 1, "l": 1, "c": 1}], interval="2m")
        with self.assertRaises(InvalidArgumentError):
            self.service.collect_bars("X", [{"t": "2025-01-02", "o": 1, "h": 1, "l": 1, "c": 1}], source="bad source!")

    def test_cache_fallback_quote_history_analysis(self) -> None:
        stub = self.use_stub()
        closes = [100.0, 101.0, 102.0, 101.5, 103.0]
        bars = _bars_from_closes(closes, end=TODAY)
        self.service.collect_bars("ZZTOP", bars)
        stub.fail_all = True
        quote = self.service.quote("ZZTOP")
        self.assertTrue(quote["stale"])
        self.assertEqual(quote["source"], "cache")
        self.assertAlmostEqual(quote["price"], 103.0)
        self.assertAlmostEqual(quote["prev_close"], 101.5)
        history = self.service.history("ZZTOP", "1M")
        self.assertTrue(history["stale"])
        self.assertEqual(history["provider"], "cache")
        self.assertEqual(history["interval"], "1d")
        # The fixed 1M window is 22 daily bars; the five stored bars are served
        # as-is rather than aggregated into a single monthly point.
        self.assertEqual(len(history["bars"]), 5)
        self.assertEqual(history["bars"], bars)
        self.assertEqual(history["bars"][-1]["t"], bars[-1]["t"])
        analysis = self.service.analysis("ZZTOP")
        self.assertEqual(analysis["symbol"], "ZZTOP")
        self.assertIsNone(analysis["indicators"]["sma20"])

    def test_known_symbol_without_data_is_503(self) -> None:
        stub = self.use_stub()
        stub.fail_all = True
        with self.assertRaises(ProviderUnavailableError) as context:
            self.service.quote("AAPL")
        self.assertEqual(context.exception.status, 503)


class SettingsAndLifecycleTests(ServiceTestCase):
    """Settings, health/meta, monitoring thread and restart persistence."""

    def test_settings_defaults_and_update(self) -> None:
        settings = self.service.get_settings()
        self.assertEqual(settings["provider"], "synthetic")
        self.assertEqual(settings["poll_seconds"], 15)
        self.assertEqual(settings["benchmark"], "^GSPC")
        self.assertEqual(settings["base_currency"], "USD")
        self.assertTrue(settings["auto_refresh"])
        self.assertEqual(settings["history_points"], 60)
        self.assertEqual(self.service.update_settings(poll_seconds=1)["poll_seconds"], 5)
        self.assertEqual(
            self.service.update_settings(poll_seconds=999999)["poll_seconds"], 3600
        )
        self.assertEqual(self.service.update_settings(benchmark="SPY")["benchmark"], "SPY")
        self.assertEqual(self.service.benchmark, "SPY")
        # The chart point target is clamped to 20..120.
        self.assertEqual(self.service.update_settings(history_points=5)["history_points"], 20)
        self.assertEqual(
            self.service.update_settings(history_points=999)["history_points"], 120
        )
        self.assertEqual(self.service.update_settings(history_points=60)["history_points"], 60)
        with self.assertRaises(InvalidArgumentError):
            self.service.update_settings(provider="synthetic")

    def test_history_points_setting_does_not_change_chart_windows(self) -> None:
        # The chart now uses conventional fixed windows; history_points stays
        # accepted and clamped but no longer changes bar counts.
        self.assertEqual(len(self.service.history("AAPL", "1M")["bars"]), 22)
        self.service.update_settings(history_points=20)
        self.assertEqual(len(self.service.history("AAPL", "1Y")["bars"]), 252)
        self.assertEqual(len(self.service.history("AAPL", "1D")["bars"]), 182)
        self.service.update_settings(history_points=120)
        self.assertEqual(len(self.service.history("AAPL", "3M")["bars"]), 66)
        self.assertEqual(len(self.service.history("AAPL", "6M")["bars"]), 132)
        self.assertEqual(self.service.get_settings()["history_points"], 120)

    def test_invalid_settings(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.service.update_settings(provider="bogus")
        with self.assertRaises(InvalidSymbolError):
            self.service.update_settings(benchmark="bad symbol")
        with self.assertRaises(InvalidArgumentError):
            self.service.update_settings(poll_seconds="soon")
        with self.assertRaises(InvalidArgumentError):
            self.service.update_settings(history_points="soon")

    def test_health_and_meta(self) -> None:
        health = self.service.health()
        self.assertTrue(health["ok"])
        self.assertEqual(health["provider"], "synthetic")
        self.assertEqual(health["symbols"], len(DEFAULT_WATCHLIST))
        self.assertFalse(health["degraded"])
        self.assertIsNone(health["last_sync_at"])
        meta = self.service.meta()
        self.assertEqual(meta["api_version"], "v1")
        self.assertEqual(meta["provider"]["mode"], "synthetic")
        self.assertEqual(meta["provider"]["active"], "synthetic")
        self.assertFalse(meta["provider"]["live"])
        self.assertIsNone(meta["sidecar"]["port"])
        self.assertGreaterEqual(meta["catalog_size"], 30)
        self.assertEqual(meta["watchlist_size"], len(DEFAULT_WATCHLIST))
        self.assertIn("settings", meta)
        self.assertIn("history", meta["capabilities"])
        self.service.set_sidecar(port=8765, pid=1234)
        sidecar = self.service.meta()["sidecar"]
        self.assertEqual(sidecar["port"], 8765)
        self.assertEqual(sidecar["pid"], 1234)
        self.service.sync()
        self.assertIsNotNone(self.service.health()["last_sync_at"])

    def test_monitor_thread_start_stop(self) -> None:
        self.service.start_monitor()
        thread = self.service._monitor_thread  # noqa: SLF001
        self.assertIsNotNone(thread)
        assert thread is not None
        self.assertTrue(thread.is_alive())
        self.service.stop_monitor()
        self.assertFalse(thread.is_alive())
        self.assertIsNone(self.service._monitor_thread)  # noqa: SLF001

    def test_provider_change_via_settings(self) -> None:
        stub = StubProvider()
        selection = ProviderSelection(
            requested="yahoo",
            provider=stub,
            degraded=True,
            last_error="stub fallback",
        )
        with mock.patch(
            "market_monitor.service.resolve_provider", return_value=selection
        ) as patched:
            settings = self.service.update_settings(provider="yahoo")
        patched.assert_called_once()
        self.assertEqual(settings["provider"], "yahoo")
        health = self.service.health()
        self.assertEqual(health["provider"], "stub")
        self.assertTrue(health["degraded"])
        meta = self.service.meta()
        self.assertEqual(meta["provider"]["mode"], "yahoo")
        self.assertEqual(meta["provider"]["active"], "stub")
        self.assertEqual(meta["provider"]["last_error"], "stub fallback")

    def test_persistence_across_restart(self) -> None:
        with tempfile.TemporaryDirectory() as data_dir:
            first = MarketMonitorService(
                data_dir=data_dir, provider="synthetic", now_fn=fixed_now
            )
            try:
                first.add_watch("SPY")
                first.create_alert("AAPL", "price_above", 1.0)
                first.set_position("MSFT", 2, 100.0)
            finally:
                first.close()
            second = MarketMonitorService(
                data_dir=data_dir, provider="synthetic", now_fn=fixed_now
            )
            try:
                symbols = [
                    item["symbol"] for item in second.list_watchlist()["items"]
                ]
                self.assertIn("SPY", symbols)
                self.assertEqual(len(second.list_alerts()["rules"]), 1)
                self.assertEqual(len(second.portfolio()["positions"]), 1)
            finally:
                second.close()


if __name__ == "__main__":
    unittest.main()
