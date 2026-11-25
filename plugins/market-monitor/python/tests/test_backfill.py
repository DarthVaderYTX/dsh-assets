"""Offline tests for the automatic rolling recent-history backfill job.

Every HTTP response is an inline fixture served by an in-memory fake client, so
this suite never touches the network.  The fixed clock is
``2026-11-25T12:00:00Z``: with the default ``backfill_days=30`` the rolling
window is ``2026-10-26 .. 2026-11-25`` and "today" is ``2026-11-25``.

Payload fixtures mirror the shapes verified in ``tests.test_market_channels``
and ``tests.test_china_commodity_source`` (trimmed to the fields under test).
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import unittest
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError, SourceRateLimitedError
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import backfill

CLOCK = datetime(2026, 11, 25, 12, 0, 0, tzinfo=timezone.utc)
NOW = CLOCK.timestamp()
NOW_ISO = "2026-11-25T12:00:00Z"
TODAY = "2026-11-25"
DEFAULT_WINDOW_START = "2026-10-26"


# ---------------------------------------------------------------------------
# small date / payload helpers
# ---------------------------------------------------------------------------


def series(
    series_id: str,
    kind: str = "index",
    provider_symbol: str = "",
    currency: str = "USD",
) -> dict[str, str]:
    """One tracked-series entry as the job wiring passes it in settings."""
    return {
        "series_id": series_id,
        "kind": kind,
        "provider_symbol": provider_symbol,
        "currency": currency,
    }


def day_offset(days: int, base: str = TODAY) -> str:
    """``YYYY-MM-DD`` shifted by ``days`` from ``base``."""
    moment = datetime.strptime(base, "%Y-%m-%d").date()
    return (moment + timedelta(days=days)).isoformat()


def epoch_seconds(day: str) -> int:
    """UTC epoch seconds of midnight on ``day``."""
    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())


def epoch_ms(day: str) -> int:
    """UTC epoch milliseconds of midnight on ``day``."""
    return epoch_seconds(day) * 1000


def yahoo_chart(days: list[str], closes: list[float] | None = None) -> dict[str, Any]:
    """A Yahoo chart payload covering ``days`` (open/high/low derived from close)."""
    prices = closes if closes is not None else [100.0 + index for index in range(len(days))]
    return {
        "chart": {
            "result": [{
                "meta": {"symbol": "TEST", "currency": "USD"},
                "timestamp": [epoch_seconds(day) for day in days],
                "indicators": {"quote": [{
                    "open": [price - 1.0 for price in prices],
                    "high": [price + 2.0 for price in prices],
                    "low": [price - 2.0 for price in prices],
                    "close": list(prices),
                    "volume": [1000 for _ in days],
                }]},
            }],
            "error": None,
        },
    }


def yahoo_empty() -> dict[str, Any]:
    """A Yahoo chart payload with no result rows."""
    return {"chart": {"result": [], "error": None}}


def json_bytes(payload: Any) -> bytes:
    """A UTF-8 JSON response body (what the JSON channels return)."""
    return json.dumps(payload).encode("utf-8")


def jsonp(callback: str, rows: list[dict[str, Any]]) -> str:
    """A Sina JSONP body with the real script/comment wrapper."""
    return (
        "/*<script>location.href='//sina.com';</script>*/\n"
        f"var {callback}=("
        + json.dumps(rows, separators=(",", ":"))
        + ");"
    )


def sina_us_daily(rows: list[dict[str, Any]]) -> str:
    """A Sina US daily-history JSONP body."""
    return jsonp("_AAPL", rows)


def tencent_kline(code: str, rows: list[list[str]]) -> dict[str, Any]:
    """A Tencent kline payload for one provider code."""
    return {"code": 0, "msg": "", "data": {code: {"day": rows}}}


def coingecko_chart(days: list[str]) -> dict[str, Any]:
    """A CoinGecko market-chart payload covering ``days``."""
    return {
        "prices": [[epoch_ms(day), 100.0 + index] for index, day in enumerate(days)],
        "total_volumes": [[epoch_ms(day), 1000.0 + index] for index, day in enumerate(days)],
    }


def frankfurter_series(days: list[str]) -> dict[str, Any]:
    """A Frankfurter time-series payload covering ``days``."""
    return {
        "amount": 1.0,
        "base": "EUR",
        "rates": {day: {"USD": 1.09 + index / 1000.0} for index, day in enumerate(days)},
    }


def sina_futures_daily(rows: list[dict[str, Any]]) -> str:
    """A mainland commodity daily-history JSONP body (``d/o/h/l/c/v/p/s``)."""
    return jsonp("_AU0", rows)


# ---------------------------------------------------------------------------
# inline channel fixtures (verified payload shapes, trimmed)
# ---------------------------------------------------------------------------

SINA_US_ROWS = [
    {"d": "2026-11-20", "o": "352.87", "h": "354.34", "l": "340.56", "c": "342.56", "v": "80692545"},
    {"d": "2026-11-24", "o": "348.06", "h": "354.40", "l": "345.88", "c": "354.07", "v": "41267141"},
    {"d": TODAY, "o": "350.00", "h": "356.00", "l": "349.00", "c": "355.00", "v": "1000"},
]
TENCENT_HK_ROWS = [
    ["2026-11-20", "341.000", "344.000", "349.600", "339.600", "41094469.000"],
    ["2026-11-24", "352.000", "341.600", "353.000", "340.000", "29393105.000"],
]
TENCENT_CN_ROWS = [
    ["2026-11-20", "1450.890", "1485.750", "1489.090", "1423.900", "67229.000"],
    ["2026-11-24", "1425.000", "1460.000", "1463.260", "1420.000", "42924.000"],
]
CHINA_FUTURES_ROWS = [
    {"d": "2026-10-01", "o": "900.0", "h": "905.0", "l": "895.0", "c": "901.0",
     "v": "100", "p": "10", "s": "900.0"},
    {"d": "2026-11-20", "o": "910.0", "h": "915.0", "l": "905.0", "c": "912.0",
     "v": "120", "p": "11", "s": "910.0"},
    {"d": TODAY, "o": "912.0", "h": "918.0", "l": "908.0", "c": "916.0",
     "v": "130", "p": "12", "s": "914.0"},
]

US_AAPL = series("INS:XNAS:AAPL", "instrument", "AAPL")
HK_TENCENT = series("INS:XHKG:0700", "instrument", "0700.HK", "HKD")
CN_MOUTAI = series("INS:XSHG:600519", "instrument", "600519.SS", "CNY")
CRYPTO_BTC = series("INS:XCRY:BTC-USD", "instrument", "BTC-USD")
FX_EURUSD = series("INS:XFXS:EURUSD=X", "instrument", "EURUSD=X")
IDX_GSPC = series("IDX:GSPC", "index", "^GSPC")
COM_AU = series("COM:XSHF:AU", "commodity", "AU0", "CNY")


# ---------------------------------------------------------------------------
# offline HTTP / governor doubles
# ---------------------------------------------------------------------------


class FakeHttp:
    """Offline stand-in for ``PoliteHttpClient`` over inline fixtures.

    ``handler(source_id, url, request_number)`` returns ``str`` (encoded as GBK,
    like the Sina/Tencent endpoints), ``bytes`` (used verbatim), a
    :class:`FetchResult`, or an exception to raise.  Every request is recorded.
    """

    def __init__(self, handler: Callable[[str, str, int], Any] | None = None) -> None:
        self.handler = handler or self._unexpected
        self.calls: list[dict[str, Any]] = []
        self.dry_run = False

    @staticmethod
    def _unexpected(source_id: str, url: str, number: int) -> Any:
        raise AssertionError(f"unexpected HTTP request #{number}: {source_id} {url}")

    def fetch(self, source_id: str, url: str, **kwargs: Any) -> FetchResult:
        """Serve one canned response; no network is ever touched."""
        self.calls.append({"source_id": source_id, "url": url, "kwargs": kwargs})
        response = self.handler(source_id, url, len(self.calls))
        if isinstance(response, BaseException):
            raise response
        if isinstance(response, FetchResult):
            return response
        body = response if isinstance(response, bytes) else str(response).encode("gbk")
        return FetchResult(
            url=url, status=200, body=body, content_type="text/plain", fetched_at=NOW_ISO,
        )

    def urls(self) -> list[str]:
        """Recorded request URLs in order."""
        return [call["url"] for call in self.calls]


class FakeGovernor:
    """Minimal governor exposing the hourly Yahoo budget diagnostic."""

    def __init__(self, remaining_hour: int = 10_000) -> None:
        self.remaining_hour = remaining_hour
        self.queries: list[str] = []

    def remaining(self, source_id: str) -> dict[str, Any]:
        """Return the remaining budgets of one source."""
        self.queries.append(source_id)
        return {"source_id": source_id, "remaining_hour": self.remaining_hour}


# ---------------------------------------------------------------------------
# shared test case
# ---------------------------------------------------------------------------


class BackfillTestCase(unittest.TestCase):
    """Shared in-memory warehouse, fixed clock, fake HTTP and context factory."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(":memory:", now_fn=lambda: NOW)
        self.addCleanup(self.warehouse.close)
        self.http = FakeHttp()
        logger = logging.getLogger(f"tests.data.backfill.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        self.logger = logger

    # ------------------------------------------------------------- factories

    def context(
        self,
        settings: dict[str, Any] | None = None,
        job_state: dict[str, Any] | None = None,
    ) -> CollectContext:
        """Build a :class:`CollectContext` with the fixed clock and fake HTTP."""
        return CollectContext(
            warehouse=self.warehouse,
            http=self.http,
            settings=dict(settings or {}),
            now_fn=lambda: NOW,
            logger=self.logger,
            job_id="backfill:recent",
            job_state=dict(job_state or {}),
        )

    def run_backfill(
        self,
        tracked: list[dict[str, Any]],
        settings: dict[str, Any] | None = None,
        job_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run the backfill over ``tracked`` with optional extra settings."""
        merged: dict[str, Any] = {"tracked_series": list(tracked)}
        merged.update(settings or {})
        return backfill.collect(self.context(merged, job_state))

    # --------------------------------------------------------------- seeding

    def use_http(self, handler: Callable[[str, str, int], Any]) -> None:
        """Replace the fake HTTP handler."""
        self.http.handler = handler

    def seed_bars(self, series_id: str, days: list[str], close: float = 100.0) -> None:
        """Persist one daily bar per day for a series."""
        self.warehouse.upsert_bars([
            {
                "series_id": series_id,
                "interval": "1d",
                "ts": day,
                "open": close,
                "high": close + 1.0,
                "low": close - 1.0,
                "close": close,
                "volume": 1,
            }
            for day in days
        ], "seed")

    def bars_for(self, series_id: str) -> list[dict[str, Any]]:
        """Stored daily bars of one series, ascending."""
        return self.warehouse.get_bars(series_id, "1d", limit=1000)


# ---------------------------------------------------------------------------
# 1. surface, no-op and window configuration
# ---------------------------------------------------------------------------


class SurfaceTests(BackfillTestCase):
    """Handler surface, result contract, empty universe and window settings."""

    def test_result_contract(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart([TODAY])))
        result = self.run_backfill([IDX_GSPC])
        for key in ("stored", "updated", "duplicates", "skipped", "status", "details", "job_state"):
            self.assertIn(key, result)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        details = result["details"]
        for key in (
            "window", "universe", "needs", "selected", "filled_series",
            "requests", "channels", "errors", "coverage",
        ):
            self.assertIn(key, details)
        self.assertEqual(details["window"], {
            "start": DEFAULT_WINDOW_START, "end": TODAY, "days": 30,
        })
        self.assertEqual(details["coverage"], {"adequate": 0, "needs": 1})
        self.assertEqual(details["channels"]["yahoo-finance"]["series"], 1)
        job_state = result["job_state"]
        for key in ("day", "requests", "cursor", "last_run_at"):
            self.assertIn(key, job_state)
        self.assertEqual(job_state["day"], TODAY)
        self.assertEqual(job_state["last_run_at"], NOW_ISO)

    def test_missing_universe_is_a_clean_noop(self) -> None:
        result = backfill.collect(self.context({}))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["reason"], "no tracked series")
        self.assertEqual(self.http.calls, [])
        self.assertNotIn("job_state", result)

    def test_empty_universe_is_a_clean_noop(self) -> None:
        result = self.run_backfill([])
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["reason"], "no tracked series")
        self.assertEqual(self.http.calls, [])
        self.assertEqual(self.warehouse.latest_bar_map("1d"), {})

    def test_window_is_configurable_and_clamped(self) -> None:
        cases = (
            (None, DEFAULT_WINDOW_START, 30),
            (7, "2026-11-18", 7),
            (1, "2026-11-20", 5),      # clamped up to the 5-day minimum
            (500, "2026-07-28", 120),  # clamped down to the 120-day maximum
        )
        for raw_days, expected_start, expected_days in cases:
            settings: dict[str, Any] = {"dry_run": True}
            if raw_days is not None:
                settings["backfill_days"] = raw_days
            with self.subTest(days=raw_days):
                result = self.run_backfill([IDX_GSPC], settings)
                self.assertEqual(result["details"]["window"], {
                    "start": expected_start, "end": TODAY, "days": expected_days,
                })
        self.assertEqual(self.http.calls, [])


# ---------------------------------------------------------------------------
# 2. coverage scan and fair selection
# ---------------------------------------------------------------------------


class SelectionTests(BackfillTestCase):
    """Coverage window selection: sparse, missing, stale and adequate series."""

    def setUp(self) -> None:
        super().setUp()
        self.seed_bars("INS:XNAS:OLD", [day_offset(-60), day_offset(-59)])
        self.seed_bars("INS:XNAS:SPARSE", [day_offset(-3), day_offset(-2), day_offset(-1)])
        self.seed_bars("INS:XNAS:ADEQUATE", [day_offset(-offset) for offset in range(11, -1, -1)])
        self.seed_bars("INS:XNAS:STALE", [day_offset(-offset) for offset in range(19, 4, -1)])
        self.tracked = [
            series("INS:XNAS:OLD", "instrument", "OLD"),
            series("INS:XNAS:SPARSE", "instrument", "SPARSE"),
            series("INS:XNAS:NOBARS", "instrument", "NOBARS"),
            series("INS:XNAS:ADEQUATE", "instrument", "ADEQUATE"),
            series("INS:XNAS:STALE", "instrument", "STALE"),
        ]

    def test_sparse_missing_and_stale_series_are_selected(self) -> None:
        result = self.run_backfill(self.tracked, {"dry_run": True})
        details = result["details"]
        self.assertEqual(details["universe"], 5)
        self.assertEqual(details["needs"], 4)
        self.assertEqual(details["selected"], 4)
        self.assertEqual(details["coverage"], {"adequate": 1, "needs": 4})
        # Oldest first, then the undated (no stored bars) series.
        self.assertEqual(details["selected_series"], [
            "INS:XNAS:OLD",
            "INS:XNAS:STALE",
            "INS:XNAS:SPARSE",
            "INS:XNAS:NOBARS",
        ])

    def test_adequate_series_is_never_selected(self) -> None:
        result = self.run_backfill(self.tracked, {"dry_run": True})
        self.assertNotIn("INS:XNAS:ADEQUATE", result["details"]["selected_series"])

    def test_stale_window_is_configurable(self) -> None:
        result = self.run_backfill(
            self.tracked, {"dry_run": True, "backfill_stale_days": 6},
        )
        # The stale series' latest bar (today-5) is inside a 6-day tolerance.
        self.assertEqual(result["details"]["needs"], 3)
        self.assertEqual(result["details"]["coverage"], {"adequate": 2, "needs": 3})

    def test_min_bars_is_configurable(self) -> None:
        result = self.run_backfill(self.tracked, {"dry_run": True, "backfill_min_bars": 2})
        # Three recent bars are enough with a 2-bar minimum.
        self.assertEqual(result["details"]["needs"], 3)
        self.assertEqual(result["details"]["coverage"], {"adequate": 2, "needs": 3})
        self.assertNotIn("INS:XNAS:SPARSE", result["details"]["selected_series"])


# ---------------------------------------------------------------------------
# 3. Yahoo chart path
# ---------------------------------------------------------------------------


class YahooTests(BackfillTestCase):
    """Yahoo-covered series: window filtering, provenance and chart settings."""

    def test_yahoo_fills_only_the_rolling_window(self) -> None:
        days = ["2026-09-15", "2026-10-20", "2026-10-27", "2026-11-20", TODAY, "2026-11-28"]
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart(days)))
        result = self.run_backfill([IDX_GSPC])

        self.assertEqual(result["status"], "ok", result["details"])
        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["details"]["filled_series"], 1)
        bars = self.bars_for("IDX:GSPC")
        self.assertEqual([bar["ts"] for bar in bars], ["2026-10-27", "2026-11-20", TODAY])
        self.assertTrue(all(bar["source_id"] == "yahoo-finance" for bar in bars))
        # Yahoo already supplies finality: today is provisional, older bars final.
        self.assertEqual(bars[-1]["quality"], "provisional")
        self.assertEqual(bars[0]["quality"], "final")

        self.assertEqual(len(self.http.calls), 1)
        call = self.http.calls[0]
        self.assertEqual(call["source_id"], "yahoo-finance")
        self.assertIn("/v8/finance/chart/%5EGSPC", call["url"])
        self.assertIn("range=3mo", call["url"])
        self.assertIn("interval=1d", call["url"])
        self.assertEqual(result["details"]["requests"], 1)
        self.assertEqual(result["job_state"]["requests"], 1)
        self.assertEqual(result["job_state"]["cursor"], 0)

    def test_yahoo_range_is_configurable(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_empty()))
        self.run_backfill([IDX_GSPC], {"backfill_range": "1y"})
        self.assertIn("range=1y", self.http.urls()[0])

    def test_provider_symbol_less_series_is_skipped_without_a_request(self) -> None:
        result = self.run_backfill([series("IDX:GSPC", "index", "")])
        self.assertEqual(self.http.calls, [])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["job_state"]["requests"], 0)


# ---------------------------------------------------------------------------
# 4. multi-channel routing
# ---------------------------------------------------------------------------


class ChannelRoutingTests(BackfillTestCase):
    """US/HK/A/crypto/FX go through market_channels; mainland roots to Sina."""

    def test_channel_covered_series_use_the_market_channels_plan(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if "stock.finance.sina.com.cn/usstock" in url:
                return sina_us_daily(SINA_US_ROWS)
            if "web.ifzq.gtimg.cn" in url:
                code = re.search(r"param=([^,&]+),day", url)
                self.assertIsNotNone(code, url)
                rows = {"hk00700": TENCENT_HK_ROWS, "sh600519": TENCENT_CN_ROWS}[code.group(1)]
                return json_bytes(tencent_kline(code.group(1), rows))
            if "api.coingecko.com" in url:
                return json_bytes(coingecko_chart(["2026-11-20", "2026-11-24"]))
            if "api.frankfurter.app" in url:
                return json_bytes(frankfurter_series(["2026-11-18", "2026-11-24"]))
            raise AssertionError(f"unexpected channel URL: {url}")

        self.use_http(handler)
        result = self.run_backfill([US_AAPL, HK_TENCENT, CN_MOUTAI, CRYPTO_BTC, FX_EURUSD])

        self.assertEqual(result["status"], "ok", result["details"])
        self.assertEqual(len(self.http.calls), 5)
        self.assertFalse(any("query1.finance.yahoo.com" in url for url in self.http.urls()))
        self.assertEqual(
            {call["source_id"] for call in self.http.calls},
            {"sina-finance", "tencent-finance", "coingecko", "frankfurter"},
        )
        # Bars landed with the channel's own provenance and quality.
        expected_sources = {
            "INS:XNAS:AAPL": "sina-finance",
            "INS:XHKG:0700": "tencent-finance",
            "INS:XSHG:600519": "tencent-finance",
            "INS:XCRY:BTC-USD": "coingecko",
            "INS:XFXS:EURUSD=X": "frankfurter",
        }
        for series_id, source_id in expected_sources.items():
            bars = self.bars_for(series_id)
            self.assertTrue(bars, series_id)
            self.assertEqual({bar["source_id"] for bar in bars}, {source_id}, series_id)
            self.assertTrue(all(bar["interval"] == "1d" for bar in bars), series_id)
            self.assertTrue(all(bar["quality"] == "final" for bar in bars), series_id)
        self.assertEqual(len(self.bars_for("INS:XNAS:AAPL")), 3)
        self.assertEqual(len(self.bars_for("INS:XHKG:0700")), 2)
        self.assertEqual(result["stored"], 3 + 2 + 2 + 2 + 2)
        self.assertEqual(result["details"]["filled_series"], 5)

    def test_china_commodity_root_uses_the_sina_futures_jsonp(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            self.assertIn("stock2.finance.sina.com.cn", url)
            return sina_futures_daily(CHINA_FUTURES_ROWS)

        self.use_http(handler)
        result = self.run_backfill([COM_AU])

        self.assertEqual(result["status"], "ok", result["details"])
        self.assertEqual(len(self.http.calls), 1)
        call = self.http.calls[0]
        self.assertEqual(call["source_id"], "sina-futures")
        self.assertIn("InnerFuturesNewService.getDailyKLine", call["url"])
        self.assertIn("symbol=AU0", call["url"])
        bars = self.bars_for("COM:XSHF:AU")
        # 2026-10-01 is older than the rolling window and is ignored.
        self.assertEqual([bar["ts"] for bar in bars], ["2026-11-20", TODAY])
        for bar in bars:
            self.assertEqual(bar["interval"], "1d")
            self.assertEqual(bar["quality"], "final")
            self.assertEqual(bar["source_id"], "sina-futures")
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["details"]["channels"]["sina-futures"]["bars"], 2)


# ---------------------------------------------------------------------------
# 5. request budget, stops and cursor rotation
# ---------------------------------------------------------------------------


class BudgetAndCursorTests(BackfillTestCase):
    """Daily request budget, rate-limit stop and cursor rotation."""

    def test_rate_limit_stops_at_the_failed_series(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if number == 1:
                return json_bytes(yahoo_chart([TODAY]))
            if number == 2:
                return SourceRateLimitedError("Source yahoo-finance refused the request (HTTP 429).")
            raise AssertionError("series after the rate-limit stop must not be requested")

        self.use_http(handler)
        tracked = [
            series("IDX:S0", "index", "S0"),
            series("IDX:S1", "index", "S1"),
            series("IDX:S2", "index", "S2"),
        ]
        result = self.run_backfill(tracked, {"backfill_batch": 10})

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["stopped"], "rate_limited")
        self.assertEqual(result["details"]["errors"][0]["reason"], "rate_limited")
        self.assertEqual(result["details"]["processed"], 1)
        self.assertEqual(len(self.http.calls), 2)
        # The failed series is not marked processed: the next run resumes there.
        self.assertEqual(result["job_state"]["cursor"], 1)
        self.assertEqual(len(self.bars_for("IDX:S0")), 1)
        self.assertEqual(self.bars_for("IDX:S1"), [])
        self.assertEqual(self.bars_for("IDX:S2"), [])

    def test_daily_request_limit_stops_the_run(self) -> None:
        tracked = [series(f"IDX:T{index:02d}", "index", f"T{index:02d}") for index in range(25)]
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart([TODAY])))
        settings = {"backfill_batch": 30, "backfill_daily_limit": 20}
        result = self.run_backfill(tracked, settings)

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["stopped"], "daily_limit")
        self.assertEqual(result["details"]["processed"], 20)
        self.assertEqual(result["details"]["filled_series"], 20)
        self.assertEqual(result["skipped"], 5)
        self.assertEqual(len(self.http.calls), 20)
        self.assertEqual(result["job_state"]["requests"], 20)
        self.assertEqual(result["job_state"]["cursor"], 20)

        # A second run on the same UTC day cannot spend any more requests.
        second = self.run_backfill(tracked, settings, job_state=result["job_state"])
        self.assertEqual(len(self.http.calls), 20)
        self.assertEqual(second["status"], "partial")
        self.assertEqual(second["details"]["stopped"], "daily_limit")
        self.assertEqual(second["details"]["processed"], 0)
        self.assertEqual(second["job_state"]["requests"], 20)
        self.assertEqual(second["job_state"]["cursor"], 20)

    def test_daily_budget_resets_on_a_new_utc_day(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart([TODAY])))
        yesterday_state = {"day": "2026-11-24", "requests": 300, "cursor": 0}
        result = self.run_backfill([IDX_GSPC], job_state=yesterday_state)
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["job_state"]["requests"], 1)

    def test_cursor_rotates_across_runs_with_wraparound(self) -> None:
        tracked = [series(f"IDX:S{index}", "index", f"S{index}") for index in range(5)]
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_empty()))
        settings = {"backfill_batch": 2}
        expected = [
            (["S0", "S1"], 2, 2),
            (["S2", "S3"], 4, 4),
            (["S4", "S0"], 1, 6),
            (["S1", "S2"], 3, 8),
        ]
        job_state: dict[str, Any] = {}
        for index, (symbols, expected_cursor, expected_requests) in enumerate(expected):
            result = self.run_backfill(tracked, settings, job_state=job_state)
            requested = [
                unquote(url.split("/chart/", 1)[1].split("?", 1)[0])
                for url in self.http.urls()
            ][-2:]
            with self.subTest(run=index + 1):
                self.assertEqual(requested, symbols)
                self.assertEqual(result["job_state"]["cursor"], expected_cursor)
                self.assertEqual(result["job_state"]["requests"], expected_requests)
            job_state = result["job_state"]

    def test_no_needs_holds_the_cursor_at_zero(self) -> None:
        self.seed_bars("IDX:GSPC", [day_offset(-offset) for offset in range(14, -1, -1)])
        result = self.run_backfill(
            [IDX_GSPC], job_state={"day": TODAY, "requests": 7, "cursor": 5},
        )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["selected"], 0)
        self.assertEqual(result["job_state"]["cursor"], 0)
        self.assertEqual(result["job_state"]["requests"], 7)
        self.assertEqual(self.http.calls, [])


# ---------------------------------------------------------------------------
# 6. dry run, idempotence and the Yahoo reserve
# ---------------------------------------------------------------------------


class DryRunAndReserveTests(BackfillTestCase):
    """Dry-run planning, idempotent re-runs and the Yahoo hourly reserve."""

    def test_dry_run_plans_without_fetch_or_write(self) -> None:
        djia = series("IDX:DJI", "index", "^DJI")
        result = self.run_backfill(
            [IDX_GSPC, djia, US_AAPL], {"dry_run": True, "backfill_batch": 2},
        )
        self.assertEqual(self.http.calls, [])
        self.assertEqual(self.warehouse.latest_bar_map("1d"), {})
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertNotIn("job_state", result)
        details = result["details"]
        self.assertTrue(details["dry_run"])
        self.assertEqual(details["reason"], "dry run")
        self.assertEqual(details["needs"], 3)
        self.assertEqual(details["selected"], 2)
        self.assertEqual(details["requests"], 0)
        # Needs are rotated from the persisted cursor; the plan shows the next one.
        self.assertEqual(details["selected_series"], ["IDX:DJI", "IDX:GSPC"])
        self.assertEqual(details["cursor"], 0)
        self.assertEqual(details["next_cursor"], 2)
        self.assertEqual(set(details["channels"]), {"yahoo-finance"})
        self.assertEqual(details["channels"]["yahoo-finance"]["series"], 2)

    def test_second_run_over_covered_series_makes_no_request(self) -> None:
        tracked = [IDX_GSPC, series("IDX:DJI", "index", "^DJI")]
        days = [day_offset(-offset) for offset in range(14, -1, -1)]
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart(days)))

        first = self.run_backfill(tracked)
        self.assertEqual(first["status"], "ok", first["details"])
        self.assertEqual(len(self.http.calls), 2)
        self.assertEqual(first["stored"], 30)
        self.assertEqual(first["details"]["coverage"], {"adequate": 0, "needs": 2})
        self.assertEqual(first["job_state"]["requests"], 2)

        second = self.run_backfill(tracked, job_state=first["job_state"])
        self.assertEqual(len(self.http.calls), 2)
        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["status"], "ok")
        self.assertEqual(second["details"]["needs"], 0)
        self.assertEqual(second["details"]["selected"], 0)
        self.assertEqual(second["details"]["coverage"], {"adequate": 2, "needs": 0})
        self.assertEqual(second["job_state"]["requests"], 2)
        self.assertEqual(second["job_state"]["cursor"], 0)

    def test_yahoo_hourly_reserve_defers_yahoo_series(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart([TODAY])))
        self.http.governor = FakeGovernor(remaining_hour=40)  # exactly at the reserve

        result = self.run_backfill([IDX_GSPC])
        self.assertEqual(self.http.calls, [])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["skipped"], 1)
        self.assertTrue(result["details"]["yahoo_reserve_hit"])
        self.assertEqual(self.http.governor.queries, ["yahoo-finance"])

        # One request of headroom is enough for the series to be processed.
        self.http.governor.remaining_hour = 41
        result = self.run_backfill([IDX_GSPC])
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(result["stored"], 1)
        self.assertFalse(result["details"].get("yahoo_reserve_hit", False))

    def test_yahoo_hourly_reserve_is_configurable(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_chart([TODAY])))
        self.http.governor = FakeGovernor(remaining_hour=40)
        result = self.run_backfill([IDX_GSPC], {"backfill_yahoo_reserve": 10})
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(result["stored"], 1)

    def test_channel_series_are_not_blocked_by_the_yahoo_reserve(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if "stock.finance.sina.com.cn/usstock" in url:
                return sina_us_daily(SINA_US_ROWS)
            raise AssertionError(f"unexpected URL: {url}")

        self.use_http(handler)
        self.http.governor = FakeGovernor(remaining_hour=0)
        result = self.run_backfill([US_AAPL])
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(result["stored"], 3)


# ---------------------------------------------------------------------------
# 7. per-series error isolation
# ---------------------------------------------------------------------------


class ErrorIsolationTests(BackfillTestCase):
    """A single series failure is recorded and skipped; the run continues."""

    def test_errors_are_isolated_and_recorded(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if "stock2.finance.sina.com.cn" in url:
                # Starts a JSON array but is not valid JSON -> parse error path.
                return 'var _AU0=([{"d": broken]);'
            if "/chart/BAD" in url:
                return DataSourceError("Source yahoo-finance returned HTTP 503.")
            if "/chart/GOOD" in url:
                return json_bytes(yahoo_chart([TODAY, day_offset(-1)]))
            raise AssertionError(f"unexpected URL: {url}")

        self.use_http(handler)
        tracked = [
            COM_AU,
            series("IDX:BAD", "index", "BAD"),
            series("IDX:GOOD", "index", "GOOD"),
        ]
        result = self.run_backfill(tracked)

        self.assertEqual(result["status"], "partial")
        self.assertNotIn("stopped", result["details"])
        self.assertEqual(len(self.http.calls), 3)
        self.assertEqual(result["stored"], 2)
        self.assertEqual(len(self.bars_for("IDX:GOOD")), 2)
        self.assertEqual(self.bars_for("IDX:BAD"), [])
        self.assertEqual(self.bars_for("COM:XSHF:AU"), [])
        reasons = {
            error["series_id"]: error["reason"]
            for error in result["details"]["errors"]
        }
        self.assertEqual(reasons["COM:XSHF:AU"], "parse_error")
        self.assertEqual(reasons["IDX:BAD"], "source_unavailable")
        self.assertEqual(result["details"]["processed"], 3)
        self.assertEqual(result["job_state"]["cursor"], 0)

    def test_empty_result_is_recorded_as_an_error_not_a_crash(self) -> None:
        self.use_http(lambda source_id, url, number: json_bytes(yahoo_empty()))
        result = self.run_backfill([IDX_GSPC])
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["errors"][0]["reason"], "no_bars_in_window")
        self.assertEqual(len(self.http.calls), 1)


if __name__ == "__main__":
    unittest.main()
