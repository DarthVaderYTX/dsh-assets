"""Tests for the market collectors: Yahoo live/EOD and the Stooq fallback.

Everything is offline: payloads are inline JSON/CSV fixtures and a fake HTTP
object replaces the polite client.  The fixed clock is 2026-11-25T18:00:00Z, so
``ctx.today()`` is ``2026-11-25`` for provisional-bar assertions.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import unittest
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError, SourceRateLimitedError
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import market_stooq, market_yahoo


CLOCK = datetime(2026, 11, 25, 18, 0, 0, tzinfo=timezone.utc)
NOW = CLOCK.timestamp()
TODAY = "2026-11-25"
FETCHED_AT = "2026-11-25T18:00:00Z"
EPOCH_1 = int(datetime(2026, 11, 25, 14, 30, tzinfo=timezone.utc).timestamp())
EPOCH_2 = int(datetime(2026, 11, 25, 14, 35, tzinfo=timezone.utc).timestamp())
BAR_EPOCHS = [
    int(datetime(2026, 11, 20, 14, 30, tzinfo=timezone.utc).timestamp()),
    int(datetime(2026, 11, 24, 14, 30, tzinfo=timezone.utc).timestamp()),
]


# ---------------------------------------------------------------------------
# inline Yahoo payload fixtures
# ---------------------------------------------------------------------------


def _spark_record(
    symbol: str,
    closes: list[float],
    *,
    opens: list[float] | None = None,
    volumes: list[float | None] | None = None,
    prev_close: float | None = None,
    regular_volume: float | None = None,
    timestamps: list[int] | None = None,
) -> dict[str, Any]:
    """Chart-style record as returned inside a Yahoo spark ``response``."""
    stamps = list(timestamps) if timestamps is not None else [EPOCH_1, EPOCH_2][: len(closes)]
    if len(stamps) < len(closes):
        stamps = stamps + [stamps[-1] + 300 * index for index in range(1, len(closes) - len(stamps) + 1)]
    meta: dict[str, Any] = {"symbol": symbol, "currency": "USD"}
    if prev_close is not None:
        meta["chartPreviousClose"] = prev_close
    if regular_volume is not None:
        meta["regularMarketVolume"] = regular_volume
    return {
        "meta": meta,
        "timestamp": stamps,
        "indicators": {"quote": [{
            "open": list(opens if opens is not None else closes),
            "high": list(closes),
            "low": list(closes),
            "close": list(closes),
            "volume": list(volumes if volumes is not None else [0.0] * len(closes)),
        }]},
    }


#: ``spark.result`` as a list of ``{symbol, response}`` objects; AAPL wraps the
#: record in a one-element list while ^GSPC carries a bare record.
SPARK_LIST_PAYLOAD: dict[str, Any] = {"spark": {"result": [
    {
        "symbol": "AAPL",
        "response": [_spark_record(
            "AAPL", [200.5, 202.0],
            opens=[199.0, 201.0], volumes=[1000, 1500],
            prev_close=200.0, regular_volume=1_234_567,
        )],
    },
    {
        "symbol": "^GSPC",
        "response": _spark_record("^GSPC", [5500.0, 5510.0], volumes=[None, None]),
    },
]}}

#: ``spark.result`` keyed by symbol (the shape some deployments return).
SPARK_DICT_PAYLOAD: dict[str, Any] = {"spark": {"result": {
    "AAPL": {"response": [_spark_record("AAPL", [199.0, 200.0])]},
}}}

CHART_PAYLOAD: dict[str, Any] = {"chart": {"error": None, "result": [{
    "meta": {"symbol": "AAPL", "currency": "USD", "regularMarketPrice": 104.0},
    "timestamp": [
        int(datetime(2026, 11, 23, 14, 30, tzinfo=timezone.utc).timestamp()),
        int(datetime(2026, 11, 24, 14, 30, tzinfo=timezone.utc).timestamp()),
        int(datetime(2026, 11, 25, 14, 30, tzinfo=timezone.utc).timestamp()),
    ],
    "indicators": {"quote": [{
        "open": [100.0, None, 103.0],
        "high": [102.0, 104.0, 105.0],
        "low": [99.0, 100.0, 102.0],
        "close": [101.5, None, 104.0],
        "volume": [1000, 1100, 900],
    }]},
}]}}

CHART_ERROR_PAYLOAD: dict[str, Any] = {"chart": {"result": None, "error": {
    "code": "Not Found", "description": "No data found, symbol may be delisted",
}}}

#: Stooq CSV: two valid rows, one empty row, one non-numeric open, one negative
#: close, one current-day row (provisional).
STOOQ_CSV = """Date,Open,High,Low,Close,Volume
2026-11-20,100.0,101.5,99.5,101.0,1200000
2026-11-21,101.0,102.0,100.0,101.5,1100000
2026-11-22,,,,,
2026-11-23,abc,102.0,100.0,101.0,1000
2026-11-24,102.0,103.0,101.0,-5.0,1000
2026-11-25,103.0,104.0,102.0,103.5,900000
"""


def chart_payload(symbol: str, timestamps: list[int], closes: list[float]) -> dict[str, Any]:
    """Minimal chart payload used by the EOD/index/commodity tests."""
    return {"chart": {"error": None, "result": [{
        "meta": {"symbol": symbol, "currency": "USD"},
        "timestamp": list(timestamps),
        "indicators": {"quote": [{
            "open": list(closes),
            "high": list(closes),
            "low": list(closes),
            "close": list(closes),
            "volume": [1000.0] * len(closes),
        }]},
    }]}}


# ---------------------------------------------------------------------------
# offline HTTP double
# ---------------------------------------------------------------------------


class FakeHttp:
    """Offline stand-in for :class:`PoliteHttpClient`.

    ``handler(url, request_number)`` returns a payload string, a ``FetchResult``,
    an exception to raise, or ``None`` to mimic a conditional ``304``.
    """

    def __init__(self, handler: Callable[[str, int], Any]) -> None:
        self.handler = handler
        self.calls: list[str] = []
        self.request_count = 0
        self.dry_run = False

    def fetch(self, source_id: str, url: str) -> FetchResult:
        """Serve one canned response; no network is ever touched."""
        self.calls.append(url)
        self.request_count += 1
        response = self.handler(url, self.request_count)
        if isinstance(response, Exception):
            raise response
        if response is None:
            return FetchResult(url=url, status=304, not_modified=True, fetched_at=FETCHED_AT)
        if isinstance(response, FetchResult):
            return response
        body = response.encode("utf-8") if isinstance(response, str) else response
        return FetchResult(
            url=url, status=200, content_type="application/json", body=body,
            fetched_at=FETCHED_AT,
        )


class MarketCollectorTestCase(unittest.TestCase):
    """Shared warehouse, fixed clock and context factory."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(":memory:", now_fn=lambda: NOW)
        self.addCleanup(self.warehouse.close)
        self.http = FakeHttp(self._unexpected_request)
        self.settings: dict[str, Any] = {}

    def _unexpected_request(self, url: str, number: int) -> Any:
        self.fail(f"unexpected HTTP request: {url}")

    def context(
        self,
        *,
        settings: dict[str, Any] | None = None,
        job_state: dict[str, Any] | None = None,
    ) -> CollectContext:
        """Build a :class:`CollectContext` with the fixed clock and fake HTTP."""
        merged = dict(self.settings)
        if settings:
            merged.update(settings)
        return CollectContext(
            warehouse=self.warehouse,
            http=self.http,
            settings=merged,
            now_fn=lambda: NOW,
            logger=logging.getLogger("tests.data.market"),
            job_id="test-job",
            job_state=dict(job_state or {}),
        )

    def series(
        self,
        series_id: str,
        kind: str = "instrument",
        provider_symbol: str = "AAPL",
        currency: str = "USD",
    ) -> dict[str, Any]:
        """One tracked-series entry as resolved by the service."""
        return {
            "series_id": series_id,
            "kind": kind,
            "provider_symbol": provider_symbol,
            "currency": currency,
        }


def chart_symbol(url: str) -> str:
    """Provider symbol encoded in a Yahoo chart URL."""
    return unquote(urlsplit(url).path.rsplit("/", 1)[-1])


# ---------------------------------------------------------------------------
# 1. spark quotes
# ---------------------------------------------------------------------------


class SparkQuoteTests(MarketCollectorTestCase):
    """Parsing of the two spark response shapes and quote-row derivation."""

    def test_spark_parses_list_and_dict_response_shapes(self) -> None:
        self.http = FakeHttp(lambda url, number: json.dumps(SPARK_LIST_PAYLOAD))
        series = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("IDX:GSPC", kind="index", provider_symbol="^GSPC"),
        ]
        result = market_yahoo.fetch_spark_quotes(self.context(), series)

        self.assertEqual(result["batches"], 1)
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["skipped"], 0)
        self.assertIn("symbols=AAPL,%5EGSPC", self.http.calls[0])
        self.assertIn("range=1d", self.http.calls[0])
        self.assertIn("interval=5m", self.http.calls[0])

        quotes = {quote["series_id"]: quote for quote in result["quotes"]}
        aapl = quotes["INS:XNAS:AAPL"]
        self.assertEqual(aapl["provider_symbol"], "AAPL")
        self.assertEqual(aapl["price"], 202.0)
        self.assertEqual(aapl["prev_close"], 200.0)
        self.assertAlmostEqual(aapl["change_pct"], 1.0)
        self.assertEqual(aapl["volume"], 1_234_567.0)
        self.assertEqual(aapl["currency"], "USD")
        self.assertEqual(aapl["ts"], "2026-11-25T14:35:00Z")
        self.assertEqual(aapl["spark"], [200.5, 202.0])

        spx = quotes["IDX:GSPC"]
        self.assertEqual(spx["price"], 5510.0)
        self.assertEqual(spx["prev_close"], 5500.0)  # second-to-last close
        self.assertAlmostEqual(spx["change_pct"], 10.0 / 5500.0 * 100.0)
        self.assertIsNone(spx["volume"])

        latest = self.warehouse.get_quote_latest("INS:XNAS:AAPL")
        self.assertEqual(latest["price"], 202.0)
        self.assertEqual(latest["change_type"], "percent")
        self.assertEqual(latest["source_id"], "yahoo-finance")
        counts = self.warehouse.table_counts()
        self.assertEqual(counts["quote_latest"], 2)
        self.assertEqual(counts["quote_observations"], 2)

    def test_spark_dict_keyed_result_and_missing_symbol(self) -> None:
        self.http = FakeHttp(lambda url, number: json.dumps(SPARK_DICT_PAYLOAD))
        series = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("INS:XNAS:MSFT", provider_symbol="MSFT"),
        ]
        result = market_yahoo.fetch_spark_quotes(self.context(), series)

        self.assertEqual([quote["series_id"] for quote in result["quotes"]], ["INS:XNAS:AAPL"])
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["missing_symbols"], ["INS:XNAS:MSFT"])
        # No metadata previous close: derive it from the earlier spark close.
        self.assertEqual(result["quotes"][0]["prev_close"], 199.0)

    def test_spark_closes_are_limited_to_thirty_points(self) -> None:
        closes = [100.0 + index for index in range(40)]
        timestamps = [EPOCH_1 + index * 300 for index in range(40)]
        payload = {"spark": {"result": [{
            "symbol": "AAPL",
            "response": [_spark_record("AAPL", closes, timestamps=timestamps)],
        }]}}
        self.http = FakeHttp(lambda url, number: json.dumps(payload))
        result = market_yahoo.fetch_spark_quotes(
            self.context(), [self.series("INS:XNAS:AAPL", provider_symbol="AAPL")],
        )
        quote = result["quotes"][0]
        self.assertEqual(len(quote["spark"]), market_yahoo.SPARK_CLOSE_POINTS)
        self.assertEqual(quote["spark"][-1], 139.0)
        self.assertEqual(quote["ts"], "2026-11-25T17:45:00Z")

    def test_spark_rate_limited_batch_counts_skipped(self) -> None:
        self.http = FakeHttp(
            lambda url, number: SourceRateLimitedError("governor says wait", retry_after_s=5),
        )
        series = [self.series("INS:XNAS:AAPL", provider_symbol="AAPL")]
        result = market_yahoo.fetch_spark_quotes(self.context(), series)
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["errors"][0]["reason"], "rate_limited")


# ---------------------------------------------------------------------------
# 2. chart bars
# ---------------------------------------------------------------------------


class ChartBarTests(MarketCollectorTestCase):
    """Chart parsing, null-row dropping and provisional/final quality."""

    def test_chart_bars_drop_null_close_and_mark_quality(self) -> None:
        self.http = FakeHttp(lambda url, number: json.dumps(CHART_PAYLOAD))
        bars = market_yahoo.fetch_chart_bars(
            self.context(), self.series("INS:XNAS:AAPL", provider_symbol="AAPL"), "1mo", "1d",
        )
        self.assertEqual([bar["ts"] for bar in bars], ["2026-11-23", "2026-11-25"])
        self.assertEqual([bar["quality"] for bar in bars], ["final", "provisional"])
        self.assertEqual(bars[0]["open"], 100.0)
        self.assertEqual(bars[1]["open"], 103.0)
        self.assertEqual(bars[1]["close"], 104.0)
        self.assertEqual(bars[1]["high"], 105.0)
        self.assertEqual(bars[1]["volume"], 900.0)
        self.assertIn("/v8/finance/chart/AAPL", self.http.calls[0])
        self.assertIn("range=1mo", self.http.calls[0])
        self.assertIn("interval=1d", self.http.calls[0])
        self.assertIn("includePrePost=false", self.http.calls[0])
        self.assertEqual(self.warehouse.upsert_bars(bars, "yahoo-finance"), 2)
        self.assertEqual(self.warehouse.latest_bar("INS:XNAS:AAPL")["quality"], "provisional")

    def test_intraday_bars_keep_iso_utc_timestamps(self) -> None:
        self.http = FakeHttp(lambda url, number: json.dumps(CHART_PAYLOAD))
        bars = market_yahoo.fetch_chart_bars(self.context(), self.series("INS:XNAS:AAPL"), "1d", "5m")
        self.assertEqual(
            [bar["ts"] for bar in bars],
            ["2026-11-23T14:30:00Z", "2026-11-25T14:30:00Z"],
        )
        self.assertEqual([bar["interval"] for bar in bars], ["5m", "5m"])

    def test_chart_error_and_empty_result_yield_no_bars(self) -> None:
        payloads = [
            CHART_ERROR_PAYLOAD,
            {"chart": {"result": [], "error": None}},
            {"chart": {"result": None, "error": None}},
        ]
        for payload in payloads:
            self.http = FakeHttp(lambda url, number, payload=payload: json.dumps(payload))
            bars = market_yahoo.fetch_chart_bars(
                self.context(), self.series("INS:XNAS:GONE", provider_symbol="GONE"),
            )
            self.assertEqual(bars, [])

    def test_missing_provider_symbol_never_hits_network(self) -> None:
        bars = market_yahoo.fetch_chart_bars(
            self.context(), self.series("COM:XCEC:GC", kind="commodity", provider_symbol=""),
        )
        self.assertEqual(bars, [])
        self.assertEqual(self.http.calls, [])


# ---------------------------------------------------------------------------
# 3. live collection
# ---------------------------------------------------------------------------


class LiveCollectorTests(MarketCollectorTestCase):
    """Batched spark quotes through the public collector entry point."""

    def _spark_handler(self, url: str, number: int) -> str:
        symbols = parse_qs(urlsplit(url).query)["symbols"][0].split(",")
        return json.dumps({"spark": {"result": [
            {"symbol": symbol, "response": [_spark_record(symbol, [100.0, 101.0], prev_close=99.0)]}
            for symbol in symbols
        ]}})

    def test_collect_live_batches_and_hands_off_quotes(self) -> None:
        self.http = FakeHttp(self._spark_handler)
        tracked = [
            self.series(f"INS:XNAS:S{index:03d}", provider_symbol=f"S{index:03d}")
            for index in range(25)
        ]
        settings = {"tracked_series": tracked, "live_batch_size": 20}
        result = market_yahoo.collect_live(self.context(settings=settings))

        self.assertEqual(self.http.request_count, 2)
        sizes = [
            len(parse_qs(urlsplit(call).query)["symbols"][0].split(","))
            for call in self.http.calls
        ]
        self.assertEqual(sizes, [20, 5])
        self.assertEqual(result["stored"], 25)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertNotIn("job_state", result)
        self.assertEqual(result["details"]["batches"], 2)
        self.assertEqual(len(result["details"]["quotes"]), 25)
        handoff = result["details"]["quotes"][0]
        self.assertEqual(
            set(handoff),
            {"series_id", "provider_symbol", "price", "prev_close", "change_pct",
             "volume", "currency", "ts", "spark"},
        )
        counts = self.warehouse.table_counts()
        self.assertEqual(counts["quote_latest"], 25)
        self.assertEqual(counts["quote_observations"], 25)

        # Same clock and same spark timestamps: the latest rows are refreshed and
        # the observation rows are recognised as duplicates.
        again = market_yahoo.collect_live(self.context(settings=settings))
        self.assertEqual(again["stored"], 25)
        self.assertEqual(again["duplicates"], 25)
        self.assertEqual(again["details"]["batches"], 2)

    def test_collect_live_skips_series_without_provider_symbol(self) -> None:
        tracked = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("COM:XCEC:GC", kind="commodity", provider_symbol=""),
        ]
        self.http = FakeHttp(self._spark_handler)
        result = market_yahoo.collect_live(self.context(settings={"tracked_series": tracked}))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["missing_provider_symbol"], ["COM:XCEC:GC"])
        self.assertEqual(len(self.http.calls), 1)


# ---------------------------------------------------------------------------
# 4. EOD cursor
# ---------------------------------------------------------------------------


class EodCollectorTests(MarketCollectorTestCase):
    """Cursor-based backfill, today's-bar skip and per-symbol error isolation."""

    def setUp(self) -> None:
        super().setUp()
        self.tracked = [
            self.series(f"INS:XNAS:S{index:03d}", provider_symbol=f"S{index:03d}")
            for index in range(5)
        ]
        self.warehouse.upsert_bars([
            {"series_id": "INS:XNAS:S000", "interval": "1d", "ts": "2026-11-20",
             "open": 99.0, "high": 100.0, "low": 98.0, "close": 99.5, "volume": 1000},
            {"series_id": "INS:XNAS:S001", "interval": "1d", "ts": TODAY,
             "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.5, "volume": 1000},
        ], "seed")

    def _chart_handler(self, url: str, number: int) -> Any:
        symbol = chart_symbol(url)
        if symbol == "S002":
            raise DataSourceError("simulated source failure")
        return json.dumps(chart_payload(symbol, BAR_EPOCHS, [100.0, 101.0]))

    def test_cursor_advances_and_one_failure_does_not_abort(self) -> None:
        self.http = FakeHttp(self._chart_handler)
        settings = {
            "tracked_series": self.tracked,
            "eod_max_series_per_run": 2,
            "eod_range": "1y",
        }

        first = market_yahoo.collect_eod(self.context(settings=settings))
        self.assertEqual(first["details"]["processed"], 2)
        self.assertEqual(first["details"].get("skipped_today", []), [])
        self.assertEqual(first["job_state"]["cursor"], 2)
        self.assertEqual(first["skipped"], 0)
        # Both series lack enough history, so each is backfilled with the full
        # range; two chart fetches x two fixture bars = four stored rows.
        self.assertEqual(first["stored"], 4)
        self.assertEqual(first["status"], "ok")
        self.assertEqual(chart_symbol(self.http.calls[0]), "S000")
        self.assertIn("range=1y", self.http.calls[0])
        self.assertEqual(chart_symbol(self.http.calls[1]), "S001")
        self.assertIn("range=1y", self.http.calls[1])

        second = market_yahoo.collect_eod(self.context(settings=settings, job_state={"cursor": 2}))
        self.assertEqual(second["details"]["processed"], 2)
        self.assertEqual(second["job_state"]["cursor"], 4)
        self.assertEqual(second["skipped"], 1)
        self.assertEqual(second["status"], "partial")
        self.assertEqual(second["details"]["failed"][0]["series_id"], "INS:XNAS:S002")
        self.assertEqual(second["details"]["failed"][0]["reason"], "source_unavailable")
        self.assertEqual(second["stored"], 2)  # S003 still stored after S002 failed
        self.assertEqual(self.warehouse.latest_bar_ts("INS:XNAS:S003"), "2026-11-24")

        third = market_yahoo.collect_eod(self.context(settings=settings, job_state={"cursor": 4}))
        self.assertEqual(third["details"]["processed"], 1)
        self.assertEqual(third["job_state"]["cursor"], 0)
        self.assertTrue(any("range=1y" in call for call in self.http.calls))

    def test_today_skip_requires_enough_history(self) -> None:
        tracked = [
            self.series("INS:XNAS:S100", provider_symbol="S100"),
            self.series("INS:XNAS:S101", provider_symbol="S101"),
        ]
        warehouse_rows = [{
            "series_id": "INS:XNAS:S100", "interval": "1d", "ts": TODAY,
            "open": 1.0, "high": 1.0, "low": 1.0, "close": 1.0, "volume": 1,
        }]
        for day in range(1, 61):
            warehouse_rows.append({
                "series_id": "INS:XNAS:S101",
                "interval": "1d",
                "ts": f"2026-09-{day:02d}" if day <= 30 else f"2026-10-{day - 30:02d}",
                "open": 1.0, "high": 1.0, "low": 1.0, "close": 1.0, "volume": 1,
            })
        warehouse_rows.append({
            "series_id": "INS:XNAS:S101", "interval": "1d", "ts": TODAY,
            "open": 1.0, "high": 1.0, "low": 1.0, "close": 1.0, "volume": 1,
        })
        self.warehouse.upsert_bars(warehouse_rows, "seed")
        self.http = FakeHttp(self._chart_handler)

        result = market_yahoo.collect_eod(self.context(settings={
            "tracked_series": tracked, "eod_max_series_per_run": 10, "eod_range": "1y",
        }))
        self.assertEqual(result["details"]["skipped_today"], ["INS:XNAS:S101"])
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(chart_symbol(self.http.calls[0]), "S100")
        self.assertIn("range=1y", self.http.calls[0])

    def test_rate_limited_series_is_skipped_but_others_continue(self) -> None:
        def handler(url: str, number: int) -> Any:
            if chart_symbol(url) == "R000":
                raise SourceRateLimitedError("governor says wait", retry_after_s=5)
            return json.dumps(chart_payload(chart_symbol(url), BAR_EPOCHS, [10.0, 11.0]))

        self.http = FakeHttp(handler)
        tracked = [
            self.series(f"INS:XNAS:R{index:03d}", provider_symbol=f"R{index:03d}")
            for index in range(3)
        ]
        result = market_yahoo.collect_eod(self.context(settings={"tracked_series": tracked}))
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["failed"][0]["reason"], "rate_limited")
        self.assertEqual(result["stored"], 4)
        self.assertEqual(self.http.request_count, 3)
        self.assertEqual(self.warehouse.latest_bar_ts("INS:XNAS:R001"), "2026-11-24")

    def test_dry_run_does_not_advance_the_cursor(self) -> None:
        self.http = FakeHttp(self._chart_handler)
        result = market_yahoo.collect_eod(self.context(settings={
            "tracked_series": self.tracked,
            "eod_max_series_per_run": 2,
            "dry_run": True,
        }))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["reason"], "dry run")
        self.assertNotIn("job_state", result)
        self.assertEqual(self.http.calls, [])


# ---------------------------------------------------------------------------
# 5. Stooq fallback
# ---------------------------------------------------------------------------


class StooqTests(MarketCollectorTestCase):
    """CSV parsing, US-equity symbol mapping and the stale-only fallback pass."""

    def test_parse_stooq_csv_keeps_valid_rows_and_skips_bad_numbers(self) -> None:
        bars = market_stooq.parse_stooq_csv(STOOQ_CSV, "INS:XNAS:AAPL", TODAY)
        self.assertEqual(
            [bar["ts"] for bar in bars],
            ["2026-11-20", "2026-11-21", "2026-11-25"],
        )
        self.assertEqual([bar["quality"] for bar in bars], ["final", "final", "provisional"])
        self.assertEqual([bar["interval"] for bar in bars], ["1d", "1d", "1d"])
        self.assertEqual(bars[0]["open"], 100.0)
        self.assertEqual(bars[0]["volume"], 1_200_000.0)
        self.assertEqual(bars[0]["series_id"], "INS:XNAS:AAPL")
        self.assertEqual(market_stooq.parse_stooq_csv("No data", "INS:XNAS:AAPL", TODAY), [])
        self.assertEqual(
            market_stooq.parse_stooq_csv("Symbol,Name\nAAPL,Apple", "INS:XNAS:AAPL", TODAY), [],
        )

    def test_fetch_stooq_eod_maps_us_equities_and_rejects_indices(self) -> None:
        self.http = FakeHttp(lambda url, number: STOOQ_CSV)
        equity = self.series("INS:XNAS:AAPL", provider_symbol="AAPL")
        bars = market_stooq.fetch_stooq_eod(self.context(), equity)
        self.assertEqual(len(bars), 3)
        self.assertIn("s=aapl.us", self.http.calls[0])
        self.assertIn("i=d", self.http.calls[0])

        index_series = self.series("IDX:GSPC", kind="index", provider_symbol="^GSPC")
        self.assertIsNone(market_stooq.stooq_symbol_for(index_series))
        self.assertEqual(market_stooq.fetch_stooq_eod(self.context(), index_series), [])
        self.assertEqual(len(self.http.calls), 1)  # unsupported symbol never hits the network
        self.assertEqual(
            market_stooq.stooq_symbol_for(self.series("INS:XNYS:BRK-B", provider_symbol="BRK-B")),
            "brk-b.us",
        )
        commodity = self.series("COM:XCEC:GC", kind="commodity", provider_symbol="GC=F")
        self.assertIsNone(market_stooq.stooq_symbol_for(commodity))
        self.assertIsNone(
            market_stooq.stooq_symbol_for(self.series("INS:XNAS:EMPTY", provider_symbol="")),
        )

    def test_collect_only_fills_stale_supported_us_equities(self) -> None:
        self.http = FakeHttp(lambda url, number: STOOQ_CSV)
        tracked = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("INS:XNAS:MSFT", provider_symbol="MSFT"),
            self.series("IDX:GSPC", kind="index", provider_symbol="^GSPC"),
            self.series("COM:XCEC:GC", kind="commodity", provider_symbol="GC=F"),
        ]
        self.warehouse.upsert_bars([{
            "series_id": "INS:XNAS:MSFT", "interval": "1d", "ts": TODAY,
            "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.5, "volume": 1,
        }], "seed")
        result = market_stooq.collect(self.context(settings={"tracked_series": tracked}))

        self.assertEqual(result["details"]["filled"], ["INS:XNAS:AAPL"])
        self.assertEqual(result["details"]["fresh"], ["INS:XNAS:MSFT"])
        self.assertEqual(set(result["details"]["unsupported"]), {"IDX:GSPC", "COM:XCEC:GC"})
        self.assertEqual(result["skipped"], 3)
        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(self.http.request_count, 1)
        self.assertEqual(self.warehouse.latest_bar_ts("INS:XNAS:AAPL"), TODAY)
        self.assertEqual(self.warehouse.get_bars("INS:XNAS:AAPL")[0]["source_id"], "stooq")

    def test_collect_refreshes_a_bar_older_than_stale_days(self) -> None:
        self.http = FakeHttp(lambda url, number: STOOQ_CSV)
        tracked = [self.series("INS:XNAS:AAPL", provider_symbol="AAPL")]
        self.warehouse.upsert_bars([{
            "series_id": "INS:XNAS:AAPL", "interval": "1d", "ts": "2026-11-20",
            "open": 99.0, "high": 100.0, "low": 98.0, "close": 99.5, "volume": 1,
        }], "seed")
        result = market_stooq.collect(self.context(settings={"tracked_series": tracked}))
        self.assertEqual(result["details"]["filled"], ["INS:XNAS:AAPL"])
        self.assertEqual(self.warehouse.latest_bar_ts("INS:XNAS:AAPL"), TODAY)

    def test_collect_fallback_is_opt_in(self) -> None:
        tracked = [self.series("INS:XNAS:AAPL", provider_symbol="AAPL")]
        result = market_stooq.collect(
            self.context(settings={"tracked_series": tracked, "stooq_fallback": False}),
        )
        self.assertEqual(result["details"]["reason"], "stooq fallback disabled")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(self.http.calls, [])


# ---------------------------------------------------------------------------
# 6. index / commodity filtering and the empty-universe contract
# ---------------------------------------------------------------------------


class IndexCommodityCollectorTests(MarketCollectorTestCase):
    """Kind filtering and empty-provider-symbol handling."""

    def setUp(self) -> None:
        super().setUp()
        self.tracked = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("IDX:GSPC", kind="index", provider_symbol="^GSPC"),
            self.series("IDX:NDX", kind="index", provider_symbol="^NDX"),
            self.series("COM:XCEC:GC", kind="commodity", provider_symbol=""),
            self.series("COM:XCEC:CL", kind="commodity", provider_symbol="CL=F"),
        ]
        self.settings = {"tracked_series": self.tracked}

        def handler(url: str, number: int) -> str:
            return json.dumps(chart_payload(chart_symbol(url), BAR_EPOCHS, [100.0, 101.0]))

        self.http = FakeHttp(handler)

    def test_index_collector_filters_by_kind(self) -> None:
        result = market_yahoo.collect_indices(self.context())
        requested = {chart_symbol(call) for call in self.http.calls}
        self.assertEqual(requested, {"^GSPC", "^NDX"})
        self.assertEqual(result["stored"], 4)
        self.assertEqual(result["skipped"], 0)
        self.assertIsNone(self.warehouse.latest_bar_ts("INS:XNAS:AAPL"))
        self.assertIsNotNone(self.warehouse.latest_bar_ts("IDX:GSPC"))
        self.assertIsNone(self.warehouse.latest_bar_ts("COM:XCEC:CL"))

    def test_commodity_collector_skips_empty_provider_symbol(self) -> None:
        result = market_yahoo.collect_commodities(self.context())
        requested = {chart_symbol(call) for call in self.http.calls}
        self.assertEqual(requested, {"CL=F"})
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["missing_provider_symbol"], ["COM:XCEC:GC"])
        self.assertIsNone(self.warehouse.latest_bar_ts("COM:XCEC:GC"))
        self.assertEqual(self.warehouse.latest_bar_ts("COM:XCEC:CL"), "2026-11-24")

    def test_kind_collectors_report_filtered_empty_universe(self) -> None:
        settings = {"tracked_series": [self.series("INS:XNAS:AAPL", provider_symbol="AAPL")]}
        self.http = FakeHttp(self._unexpected_request)
        indices = market_yahoo.collect_indices(self.context(settings=settings))
        commodities = market_yahoo.collect_commodities(self.context(settings=settings))
        self.assertEqual(indices["details"]["reason"], "no tracked indices")
        self.assertEqual(commodities["details"]["reason"], "no tracked commodities")
        self.assertEqual(self.http.calls, [])


class EmptyUniverseTests(MarketCollectorTestCase):
    """Every collector must no-op cleanly without a tracked universe."""

    def test_collectors_report_no_tracked_series_without_network(self) -> None:
        collectors = (
            market_yahoo.collect_live,
            market_yahoo.collect_eod,
            market_yahoo.collect_indices,
            market_yahoo.collect_commodities,
            market_stooq.collect,
        )
        for collector in collectors:
            with self.subTest(collector=collector.__name__):
                result = collector(self.context(settings={"tracked_series": []}))
                self.assertEqual(result["stored"], 0)
                self.assertEqual(result["skipped"], 0)
                self.assertEqual(result["details"]["reason"], "no tracked series")
        self.assertEqual(self.http.calls, [])

    def test_missing_tracked_setting_is_a_clean_no_op(self) -> None:
        result = market_yahoo.collect_eod(self.context())
        self.assertEqual(result["details"]["reason"], "no tracked series")


class SparkTopLevelMappingTests(MarketCollectorTestCase):
    """Current Yahoo responses key the top-level object by symbol."""

    def test_root_level_symbol_mapping_is_parsed(self) -> None:
        payload = {
            "AAPL": {
                "timestamp": [EPOCH_1, EPOCH_2],
                "close": [199.0, 200.0],
                "fulldayPrice": 200.0,
                "fulldayChangePercent": 1.0,
                "previousClose": 198.0,
                "symbol": "AAPL",
            },
            "MSFT": {
                "timestamp": [EPOCH_1, EPOCH_2],
                "close": [499.0, 500.0],
                "symbol": "MSFT",
            },
            "error": None,
        }
        self.http = FakeHttp(lambda url, number: json.dumps(payload))
        series = [
            self.series("INS:XNAS:AAPL", provider_symbol="AAPL"),
            self.series("INS:XNAS:MSFT", provider_symbol="MSFT"),
        ]
        result = market_yahoo.fetch_spark_quotes(self.context(), series)
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["skipped"], 0)
        quotes = {quote["series_id"]: quote for quote in result["quotes"]}
        self.assertEqual(quotes["INS:XNAS:AAPL"]["price"], 200.0)
        self.assertEqual(quotes["INS:XNAS:MSFT"]["price"], 500.0)


if __name__ == "__main__":
    unittest.main()
