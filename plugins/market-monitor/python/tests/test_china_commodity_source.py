"""Offline tests for the Sina Finance mainland commodity collectors.

Every HTTP response is an inline GBK fixture served by a fake HTTP object, so
the suite never touches the network.  The fixed clock is 2026-11-25T12:00:00Z,
which makes today's UTC date ``2026-11-25`` for the provisional-bar assertions.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import sys
import unittest
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError, SourceRateLimitedError
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import china_commodity

CLOCK = datetime(2026, 11, 25, 12, 0, 0, tzinfo=timezone.utc)
NOW = CLOCK.timestamp()
NOW_ISO = "2026-11-25T12:00:00Z"
TODAY = "2026-11-25"


# ---------------------------------------------------------------------------
# inline GBK / JSONP fixtures
# ---------------------------------------------------------------------------

#: Verified domestic-futures quote layout, with distinct values per position.
AU_QUOTE_FIELDS = [
    "黄金连续", "13:59:58", "931.00", "936.00", "927.50", "930.10",
    "933.10", "933.30", "933.20", "933.00", "932.40", "12", "34",
    "150000", "120000", "SHFE", "AU", "2026-11-25",
]
#: ``prev_settle`` is zero here, so the change falls back to ``prev_close``.
CU_QUOTE_FIELDS = [
    "沪铜连续", "13:59:58", "70010", "70600", "69900", "70100",
    "70400", "70420", "70410", "70400", "0", "5", "6",
    "80000", "60000", "SHFE", "CU", "2026-11-25",
]
UNKNOWN_QUOTE_FIELDS = [
    "未知品种", "13:59:58", "1", "2", "0.5", "1.5", "1.6", "1.7", "1.55",
    "1.6", "1.5", "0", "0", "10", "20", "XXXX", "XX", "2026-11-25",
]

QUOTE_PAYLOADS: dict[str, list[str]] = {
    "AU0": AU_QUOTE_FIELDS,
    "CU0": CU_QUOTE_FIELDS,
}

DAILY_ROWS_AU = [
    {"d": "2026-11-21", "o": "930.0", "h": "936.0", "l": "928.0", "c": "934.0",
     "v": "120000", "p": "110000", "s": "933.5"},
    {"d": "2026-11-24", "o": "934.0", "h": "938.0", "l": "931.0", "c": "936.5",
     "v": "150000", "p": "115000", "s": "936.0"},
]
DAILY_ROWS_CU = [
    {"d": "2026-11-21", "o": "70000", "h": "70400", "l": "69900", "c": "70200",
     "v": "50000", "p": "40000", "s": "70150"},
    {"d": "2026-11-24", "o": "70200", "h": "70600", "l": "70100", "c": "70410",
     "v": "80000", "p": "60000", "s": "70400"},
]


def quote_line(symbol: str, fields: list[str]) -> str:
    """One ``var hq_str_<symbol>="...";`` line."""
    return f'var hq_str_{symbol}="{",".join(fields)}";'


def quote_text(*pairs: tuple[str, list[str]]) -> str:
    """A GBK-decoded batch quote body for the given ``(symbol, fields)`` pairs."""
    return "\n".join(quote_line(symbol, fields) for symbol, fields in pairs) + "\n"


def jsonp_text(symbol: str, rows: list[dict[str, Any]]) -> str:
    """Daily-history JSONP wrapped like the real endpoint (script/comment prefix)."""
    body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return f"/*<script>*/var _{symbol} = ({body});"


def quote_symbols(url: str) -> list[str]:
    """Symbols requested by a batch quote URL."""
    if "list=" not in url:
        return []
    return [symbol for symbol in url.split("list=", 1)[1].split(",") if symbol]


def daily_symbol(url: str) -> str:
    """Symbol encoded in a daily-history URL."""
    return parse_qs(urlsplit(url).query).get("symbol", [""])[0]


# ---------------------------------------------------------------------------
# offline HTTP double
# ---------------------------------------------------------------------------


class FakeHttp:
    """Offline stand-in for :class:`PoliteHttpClient` over inline fixtures.

    ``handler(source_id, url, request_number)`` returns a ``str`` or ``bytes``
    body (encoded as GBK when a ``str``), a :class:`FetchResult`, an exception
    to raise, or ``None`` to mimic a conditional ``304``.
    """

    def __init__(self, handler: Callable[[str, str, int], Any]) -> None:
        self.handler = handler
        self.calls: list[tuple[str, str]] = []
        self.options: list[dict[str, Any]] = []
        self.request_count = 0
        self.dry_run = False

    def fetch(self, source_id: str, url: str, **kwargs: Any) -> FetchResult:
        """Serve one canned response; no network is ever touched."""
        self.calls.append((source_id, url))
        self.options.append({"source_id": source_id, "url": url, **kwargs})
        self.request_count += 1
        response = self.handler(source_id, url, self.request_count)
        if isinstance(response, BaseException):
            raise response
        if response is None:
            return FetchResult(url=url, status=304, not_modified=True, fetched_at=NOW_ISO)
        if isinstance(response, FetchResult):
            return response
        if isinstance(response, str):
            body = response.encode("gbk")
        else:
            body = bytes(response)
        return FetchResult(
            url=url, status=200, body=body, content_type="text/plain; charset=gbk",
            fetched_at=NOW_ISO,
        )


def quote_handler(*extra_lines: str) -> Callable[[str, str, int], str]:
    """Handler answering batch quote requests from :data:`QUOTE_PAYLOADS`."""

    def handler(source_id: str, url: str, number: int) -> str:
        lines = [
            quote_line(symbol, QUOTE_PAYLOADS[symbol])
            for symbol in quote_symbols(url) if symbol in QUOTE_PAYLOADS
        ]
        lines.extend(extra_lines)
        return "\n".join(lines)

    return handler


def daily_handler(
    rows_by_symbol: dict[str, list[dict[str, Any]]] | None = None,
) -> Callable[[str, str, int], str]:
    """Handler answering daily-history requests with JSONP fixtures."""
    fixtures = rows_by_symbol or {}

    def handler(source_id: str, url: str, number: int) -> str:
        symbol = daily_symbol(url)
        rows = fixtures.get(symbol, DAILY_ROWS_AU)
        return jsonp_text(symbol, rows)

    return handler


# ---------------------------------------------------------------------------
# test base
# ---------------------------------------------------------------------------


class CollectorTestCase(unittest.TestCase):
    """Shared warehouse, fixed clock and context factory."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(":memory:", now_fn=lambda: NOW)
        self.addCleanup(self.warehouse.close)
        self.http = FakeHttp(lambda source_id, url, number: self.fail(
            f"unexpected HTTP request: {url}"
        ))
        self.roots = [
            {"venue": "XSHF", "root": "AU", "provider_symbol": "AU0"},
            {"venue": "XSHF", "root": "CU", "provider_symbol": "CU0"},
        ]

    def context(self, settings: dict[str, Any] | None = None,
                job_state: dict[str, Any] | None = None) -> CollectContext:
        """Build a :class:`CollectContext` with the fixed clock and fake HTTP."""
        merged: dict[str, Any] = {"china_commodities": copy.deepcopy(self.roots)}
        if settings:
            merged.update(settings)
        logger = logging.getLogger(f"tests.data.china_commodity.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=self.warehouse,
            http=self.http,
            settings=merged,
            now_fn=lambda: NOW,
            logger=logger,
            job_id="china:commodity:quotes",
            job_state=dict(job_state or {}),
        )


# ---------------------------------------------------------------------------
# 1. surface and URLs
# ---------------------------------------------------------------------------


class SurfaceTests(CollectorTestCase):
    """Source id, endpoint constants and URL builders."""

    def test_module_surface(self) -> None:
        self.assertEqual(china_commodity.SINA_FUTURES, "sina-futures")
        self.assertEqual(china_commodity.SINA_HEADERS, {"Referer": "https://finance.sina.com.cn"})
        self.assertEqual(china_commodity.DEFAULT_BATCH_SIZE, 40)
        self.assertEqual(china_commodity.DEFAULT_EOD_MAX_ROOTS, 50)
        self.assertEqual(china_commodity.MAX_BATCH_SIZE, 80)
        self.assertEqual(china_commodity.MAX_EOD_MAX_ROOTS, 80)
        self.assertEqual(
            china_commodity.quote_url(["au0", "cu0", ""]),
            "https://hq.sinajs.cn/list=AU0,CU0",
        )
        self.assertEqual(
            china_commodity.daily_url("au0"),
            "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/"
            "var%20_AU0=/InnerFuturesNewService.getDailyKLine?symbol=AU0",
        )


# ---------------------------------------------------------------------------
# 2. quote parsing / row building
# ---------------------------------------------------------------------------


class QuoteParsingTests(CollectorTestCase):
    """Verified quote field layout, fallback reference price and bar building."""

    def test_parse_quote_text_maps_the_verified_field_layout(self) -> None:
        text = quote_text(("AU0", AU_QUOTE_FIELDS), ("CU0", CU_QUOTE_FIELDS))
        quotes = china_commodity.parse_quote_text(text)

        self.assertEqual([quote["symbol"] for quote in quotes], ["AU0", "CU0"])
        gold = quotes[0]
        self.assertEqual(gold["name"], "黄金连续")
        self.assertEqual(gold["time"], "13:59:58")
        self.assertEqual(gold["open"], 931.0)
        self.assertEqual(gold["high"], 936.0)
        self.assertEqual(gold["low"], 927.5)
        self.assertEqual(gold["prev_close"], 930.1)
        self.assertEqual(gold["bid"], 933.1)
        self.assertEqual(gold["ask"], 933.3)
        self.assertEqual(gold["last"], 933.2)
        self.assertEqual(gold["settle"], 933.0)
        self.assertEqual(gold["prev_settle"], 932.4)
        self.assertEqual(gold["bid_vol"], 12.0)
        self.assertEqual(gold["ask_vol"], 34.0)
        self.assertEqual(gold["volume"], 150000.0)
        self.assertEqual(gold["open_interest"], 120000.0)
        self.assertEqual(gold["exchange"], "SHFE")
        self.assertEqual(gold["variety"], "AU")
        self.assertEqual(gold["date"], "2026-11-25")
        self.assertEqual(quotes[1]["name"], "沪铜连续")
        self.assertEqual(quotes[1]["prev_settle"], 0.0)

    def test_parse_quote_text_handles_empty_and_malformed_lines(self) -> None:
        text = (
            'var hq_str_ZZ0="";\n'
            "garbage without a quote line\n"
            'var hq_str_AB1="name,09:00:00";\n'
        )
        quotes = china_commodity.parse_quote_text(text)
        self.assertEqual([quote["symbol"] for quote in quotes], ["ZZ0", "AB1"])
        self.assertIsNone(quotes[0]["last"])
        self.assertEqual(quotes[0]["name"], "")
        self.assertEqual(quotes[1]["name"], "name")
        self.assertIsNone(quotes[1]["open"])
        self.assertEqual(china_commodity.parse_quote_text(""), [])

    def test_gbk_body_is_decoded_with_chinese_names(self) -> None:
        body = quote_text(("AU0", AU_QUOTE_FIELDS)).encode("gbk")
        decoded = china_commodity._decode_body(FetchResult(url="x", body=body))
        quotes = china_commodity.parse_quote_text(decoded)
        self.assertEqual(quotes[0]["name"], "黄金连续")

    def test_build_quote_rows_uses_settlement_and_computes_change(self) -> None:
        quotes = china_commodity.parse_quote_text(
            quote_text(("AU0", AU_QUOTE_FIELDS), ("CU0", CU_QUOTE_FIELDS))
        )
        roots = [china_commodity._normalise_root(root) for root in self.roots]
        rows = china_commodity.build_quote_rows(quotes, roots, NOW_ISO)

        self.assertEqual([row["series_id"] for row in rows], ["COM:XSHF:AU", "COM:XSHF:CU"])
        gold = rows[0]
        self.assertEqual(gold["price"], 933.2)
        self.assertEqual(gold["prev_close"], 932.4)  # prev_settle wins when positive
        self.assertAlmostEqual(gold["change_pct"], (933.2 - 932.4) / 932.4 * 100.0)
        self.assertEqual(gold["change_type"], "percent")
        self.assertEqual(gold["volume"], 150000.0)
        self.assertEqual(gold["currency"], "CNY")
        self.assertEqual(gold["source_id"], "sina-futures")
        self.assertEqual(gold["ts"], NOW_ISO)
        self.assertEqual(gold["observed_at"], NOW_ISO)
        copper = rows[1]
        self.assertEqual(copper["price"], 70410.0)
        self.assertEqual(copper["prev_close"], 70100.0)  # prev_settle was zero
        self.assertAlmostEqual(copper["change_pct"], (70410.0 - 70100.0) / 70100.0 * 100.0)

    def test_build_quote_rows_skips_unusable_and_unknown_quotes(self) -> None:
        quotes = [
            china_commodity.parse_quote_text(quote_text(("AU0", AU_QUOTE_FIELDS)))[0],
            {"symbol": "CU0", "last": 0, "prev_settle": 1, "prev_close": 1, "volume": 1},
            {"symbol": "CU0", "last": None, "prev_settle": 1, "prev_close": 1, "volume": 1},
            china_commodity.parse_quote_text(quote_text(("ZZ0", UNKNOWN_QUOTE_FIELDS)))[0],
        ]
        roots = [china_commodity._normalise_root(root) for root in self.roots]
        rows = china_commodity.build_quote_rows(quotes, roots, NOW_ISO)
        self.assertEqual([row["series_id"] for row in rows], ["COM:XSHF:AU"])
        self.assertIsNone(
            china_commodity.build_quote_rows(
                [{"symbol": "AU0", "last": 933.2, "prev_settle": 0}], roots, NOW_ISO,
            )[0]["change_pct"],
        )

    def test_build_quote_rows_accepts_seed_shaped_roots(self) -> None:
        """The row builders normalise raw seed rows, not just resolved roots."""
        quotes = china_commodity.parse_quote_text(quote_text(("AU0", AU_QUOTE_FIELDS)))
        rows = china_commodity.build_quote_rows(quotes, self.roots, NOW_ISO)
        bars = china_commodity.build_provisional_bars(quotes, self.roots, NOW_ISO)
        self.assertEqual(rows[0]["series_id"], "COM:XSHF:AU")
        self.assertEqual(bars[0]["series_id"], "COM:XSHF:AU")

    def test_build_provisional_bars_uses_today_and_last_price(self) -> None:
        quotes = china_commodity.parse_quote_text(
            quote_text(("AU0", AU_QUOTE_FIELDS), ("CU0", CU_QUOTE_FIELDS))
        )
        roots = [china_commodity._normalise_root(root) for root in self.roots]
        bars = china_commodity.build_provisional_bars(quotes, roots, NOW_ISO)

        self.assertEqual([bar["series_id"] for bar in bars], ["COM:XSHF:AU", "COM:XSHF:CU"])
        gold = bars[0]
        self.assertEqual(gold["interval"], "1d")
        self.assertEqual(gold["ts"], TODAY)
        self.assertEqual(gold["open"], 931.0)
        self.assertEqual(gold["high"], 936.0)
        self.assertEqual(gold["low"], 927.5)
        self.assertEqual(gold["close"], 933.2)
        self.assertEqual(gold["volume"], 150000.0)
        self.assertEqual(gold["quality"], "provisional")
        self.assertEqual(gold["source_id"], "sina-futures")
        self.assertEqual(gold["observed_at"], NOW_ISO)


# ---------------------------------------------------------------------------
# 3. tracked universe resolution
# ---------------------------------------------------------------------------


class TrackedUniverseTests(CollectorTestCase):
    """Seed fallback, injected universes and manager-shaped root rows."""

    def test_seed_is_used_when_the_setting_is_absent(self) -> None:
        roots = china_commodity.tracked_roots(self.context(settings={"china_commodities": None}))
        self.assertEqual(len(roots), 38)
        gold = next(root for root in roots if root["series_id"] == "COM:XSHF:AU")
        self.assertEqual(gold["venue"], "XSHF")
        self.assertEqual(gold["root"], "AU")
        self.assertEqual(gold["provider_symbol"], "AU0")
        self.assertEqual(gold["currency"], "CNY")
        self.assertEqual(
            {root["venue"] for root in roots},
            {"XSHF", "XINE", "XDCE", "XCZC", "XGFE"},
        )

    def test_manager_shaped_rows_and_index_entries_are_normalised(self) -> None:
        settings = {"china_commodities": [
            {
                "root_id": "COM:XSHF:AU", "venue": "XSHF", "root": "AU",
                "provider_symbol": "AU0", "name": "Gold", "currency": "CNY",
            },
            {
                "series_id": "COM:XINE:SC", "provider_symbol": "SC0",
                "payload": {"venue": "XINE", "root": "SC", "provider_symbol": "SC0"},
            },
            {"name": "not a root"},
        ]}
        roots = china_commodity.tracked_roots(self.context(settings=settings))
        self.assertEqual([root["series_id"] for root in roots], ["COM:XSHF:AU", "COM:XINE:SC"])
        self.assertEqual(roots[1]["venue"], "XINE")
        self.assertEqual(roots[1]["root"], "SC")

    def test_mapping_injection_and_deduplication(self) -> None:
        settings = {"china_commodities": {
            "AU0": "COM:XSHF:AU",
            "CU0": {"root_id": "COM:XSHF:CU", "venue": "XSHF", "root": "CU"},
            "AU0-DUP": {"series_id": "COM:XSHF:AU", "provider_symbol": "AU0"},
        }}
        roots = china_commodity.tracked_roots(self.context(settings=settings))
        self.assertEqual([root["series_id"] for root in roots], ["COM:XSHF:AU", "COM:XSHF:CU"])

    def test_explicitly_empty_universe_is_a_clean_noop(self) -> None:
        self.http = FakeHttp(lambda source_id, url, number: self.fail("no HTTP expected"))
        quotes = china_commodity.collect_quotes(
            self.context(settings={"china_commodities": []}),
        )
        eod = china_commodity.collect_eod(
            self.context(settings={"china_commodities": []}),
        )
        self.assertEqual(quotes["details"]["reason"], "no commodity roots")
        self.assertEqual(eod["details"]["reason"], "no commodity roots")
        self.assertEqual(self.http.request_count, 0)


# ---------------------------------------------------------------------------
# 4. batch quote collector
# ---------------------------------------------------------------------------


class CollectQuotesTests(CollectorTestCase):
    """Batch quotes, chunking, provisional bars, errors and idempotence."""

    def test_collect_quotes_writes_quotes_and_provisional_bars(self) -> None:
        self.http = FakeHttp(quote_handler(quote_line("ZZ0", UNKNOWN_QUOTE_FIELDS)))

        result = china_commodity.collect_quotes(self.context())

        self.assertEqual(self.http.request_count, 1)
        self.assertEqual(self.http.calls[0][0], "sina-futures")
        self.assertEqual(
            self.http.calls[0][1], "https://hq.sinajs.cn/list=AU0,CU0",
        )
        self.assertEqual(self.http.options[0]["headers"], {
            "Referer": "https://finance.sina.com.cn",
        })
        self.assertEqual(self.http.options[0]["accept"], "*/*")

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 4)  # 2 quotes + 2 provisional bars
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["details"]["quotes"], 2)
        self.assertEqual(result["details"]["bars"], 2)
        self.assertEqual(result["details"]["skipped"], 0)
        self.assertEqual(result["details"]["unknown_symbols"], ["ZZ0"])
        self.assertEqual(result["details"]["batches"], 1)

        gold = self.warehouse.get_quote_latest("COM:XSHF:AU")
        self.assertEqual(gold["price"], 933.2)
        self.assertEqual(gold["prev_close"], 932.4)
        self.assertAlmostEqual(gold["change_pct"], (933.2 - 932.4) / 932.4 * 100.0)
        self.assertEqual(gold["currency"], "CNY")
        self.assertEqual(gold["source_id"], "sina-futures")
        self.assertEqual(gold["ts"], NOW_ISO)
        self.assertEqual(gold["observed_at"], NOW_ISO)
        copper = self.warehouse.get_quote_latest("COM:XSHF:CU")
        self.assertEqual(copper["price"], 70410.0)
        self.assertEqual(copper["prev_close"], 70100.0)

        bar = self.warehouse.latest_bar("COM:XSHF:AU")
        self.assertEqual(bar["interval"], "1d")
        self.assertEqual(bar["ts"], TODAY)
        self.assertEqual(bar["quality"], "provisional")
        self.assertEqual(bar["open"], 931.0)
        self.assertEqual(bar["high"], 936.0)
        self.assertEqual(bar["low"], 927.5)
        self.assertEqual(bar["close"], 933.2)
        self.assertEqual(bar["volume"], 150000.0)
        self.assertEqual(bar["source_id"], "sina-futures")
        self.assertEqual(self.warehouse.table_counts()["bars"], 2)

    def test_collect_quotes_chunks_and_clamps_the_batch_setting(self) -> None:
        roots = [
            {"venue": "XSHF", "root": f"R{index:03d}", "provider_symbol": f"P{index:03d}"}
            for index in range(85)
        ]
        self.http = FakeHttp(lambda source_id, url, number: "")
        result = china_commodity.collect_quotes(self.context(settings={
            "china_commodities": roots, "china_commodity_batch": 500,
        }))
        sizes = [len(quote_symbols(url)) for _source, url in self.http.calls]
        self.assertEqual(sizes, [80, 5])  # clamped to MAX_BATCH_SIZE
        self.assertEqual(result["details"]["batches"], 2)
        self.assertEqual(result["details"]["batch_size"], 80)
        self.assertEqual(result["skipped"], 85)

        self.http = FakeHttp(lambda source_id, url, number: "")
        china_commodity.collect_quotes(self.context(settings={
            "china_commodities": roots, "china_commodity_batch": "bad",
        }))
        self.assertEqual([len(quote_symbols(url)) for _source, url in self.http.calls], [40, 40, 5])

        self.http = FakeHttp(lambda source_id, url, number: "")
        small = roots[:5]
        china_commodity.collect_quotes(self.context(settings={
            "china_commodities": small, "china_commodity_batch": 0,
        }))
        self.assertEqual(len(self.http.calls), 5)  # clamped to MIN_BATCH_SIZE

    def test_collect_quotes_empty_line_is_a_symbol_gap_not_an_error(self) -> None:
        def handler(source_id: str, url: str, number: int) -> str:
            # CU0 answered without fields (e.g. a renamed/delisted contract).
            return quote_text(("AU0", AU_QUOTE_FIELDS), ("CU0", []))

        self.http = FakeHttp(handler)
        result = china_commodity.collect_quotes(self.context())

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 2)  # AU quote + AU provisional bar
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["unusable_symbols"], ["COM:XSHF:CU"])
        self.assertNotIn("errors", result["details"])

    def test_collect_quotes_unparseable_body_is_a_parse_error(self) -> None:
        self.http = FakeHttp(lambda source_id, url, number: "<html>blocked</html>")
        result = china_commodity.collect_quotes(self.context())

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["details"]["errors"][0]["reason"], "parse_error")

    def test_collect_quotes_rate_limited_batch_continues(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if "AU0" in url:
                raise SourceRateLimitedError("governor says wait", retry_after_s=5)
            return quote_text(("CU0", CU_QUOTE_FIELDS))

        self.http = FakeHttp(handler)
        result = china_commodity.collect_quotes(self.context(settings={
            "china_commodity_batch": 1,
        }))

        self.assertEqual(self.http.request_count, 2)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 2)  # CU quote + CU provisional bar
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["errors"][0]["reason"], "rate_limited")
        self.assertIsNone(self.warehouse.get_quote_latest("COM:XSHF:AU"))
        self.assertEqual(
            self.warehouse.get_quote_latest("COM:XSHF:CU")["price"], 70410.0,
        )

    def test_collect_quotes_second_run_is_idempotent(self) -> None:
        self.http = FakeHttp(quote_handler())
        first = china_commodity.collect_quotes(self.context())
        counts_after_first = self.warehouse.table_counts()

        second = china_commodity.collect_quotes(self.context())

        self.assertEqual(first["stored"], 4)
        self.assertEqual(second["stored"], 4)
        self.assertEqual(second["status"], "ok")
        counts_after_second = self.warehouse.table_counts()
        for table in ("quote_latest", "bars", "quote_observations"):
            self.assertEqual(counts_after_second[table], counts_after_first[table], table)
        self.assertEqual(self.warehouse.latest_bar("COM:XSHF:AU")["quality"], "provisional")

    def test_collect_quotes_dry_run_plans_without_fetching_or_writing(self) -> None:
        self.http = FakeHttp(lambda source_id, url, number: self.fail("no HTTP expected"))
        result = china_commodity.collect_quotes(self.context(settings={"dry_run": True}))

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["reason"], "dry run")
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["details"]["planned"], 2)
        self.assertEqual(result["details"]["batches"], 1)
        self.assertEqual(self.http.request_count, 0)
        counts = self.warehouse.table_counts()
        self.assertEqual(counts["quote_latest"], 0)
        self.assertEqual(counts["bars"], 0)


# ---------------------------------------------------------------------------
# 5. daily history parsing / collector
# ---------------------------------------------------------------------------


class DailyParsingTests(CollectorTestCase):
    """JSONP extraction, row mapping and final-bar construction."""

    def test_parse_daily_jsonp_maps_rows(self) -> None:
        rows = china_commodity.parse_daily_jsonp(jsonp_text("AU0", DAILY_ROWS_AU))

        self.assertEqual(len(rows), 2)
        last = rows[-1]
        self.assertEqual(last["date"], "2026-11-24")
        self.assertEqual(last["open"], 934.0)
        self.assertEqual(last["high"], 938.0)
        self.assertEqual(last["low"], 931.0)
        self.assertEqual(last["close"], 936.5)
        self.assertEqual(last["volume"], 150000.0)
        self.assertEqual(last["open_interest"], 115000.0)
        self.assertEqual(last["settlement"], 936.0)

    def test_parse_daily_jsonp_tolerates_wrappers_and_plain_arrays(self) -> None:
        rows_json = json.dumps(DAILY_ROWS_AU)
        for text in (
            f"var _AU0=({rows_json});",
            f"/*<script>*/var _AU0 = ({rows_json});</script>",
            f"<script>var x = {rows_json};</script>",
            rows_json,
        ):
            with self.subTest(text=text[:24]):
                self.assertEqual(len(china_commodity.parse_daily_jsonp(text)), 2)
        self.assertEqual(china_commodity.parse_daily_jsonp(""), [])
        self.assertEqual(china_commodity.parse_daily_jsonp("null"), [])

        with self.assertRaises(ValueError):
            china_commodity.parse_daily_jsonp('var _AU0 = ([{"d": }]);')

    def test_parse_daily_jsonp_drops_unusable_rows(self) -> None:
        rows = [
            {"d": "2026-11-20", "o": "1", "h": "2", "l": "0.5", "c": "1.5", "v": "10"},
            {"d": "not-a-date", "o": "1", "h": "2", "l": "0.5", "c": "1.5", "v": "10"},
            {"d": "2026-11-21", "o": "1", "h": "2", "l": "0.5", "c": "0", "v": "10"},
            {"d": "2026-11-22", "o": "1", "h": "2", "l": "0.5", "c": "-3", "v": "10"},
            {"d": "2026-11-23", "o": "bad", "h": "2", "l": "0.5", "c": "1.5", "v": "10"},
        ]
        parsed = china_commodity.parse_daily_jsonp(jsonp_text("AU0", rows))
        self.assertEqual([row["date"] for row in parsed], ["2026-11-20", "2026-11-23"])
        self.assertIsNone(parsed[-1]["open"])
        self.assertEqual(parsed[-1]["close"], 1.5)

    def test_build_daily_bar_rows_marks_final_and_sorts(self) -> None:
        parsed = china_commodity.parse_daily_jsonp(jsonp_text("AU0", DAILY_ROWS_AU))
        bars = china_commodity.build_daily_bar_rows(parsed, "COM:XSHF:AU", NOW_ISO)

        self.assertEqual([bar["ts"] for bar in bars], ["2026-11-21", "2026-11-24"])
        self.assertEqual({bar["interval"] for bar in bars}, {"1d"})
        self.assertEqual({bar["quality"] for bar in bars}, {"final"})
        self.assertEqual({bar["source_id"] for bar in bars}, {"sina-futures"})
        self.assertEqual({bar["observed_at"] for bar in bars}, {NOW_ISO})
        self.assertEqual(bars[-1]["close"], 936.5)


class CollectEodTests(CollectorTestCase):
    """Daily-history collection: final bars, cap, rate-limit stop, idempotence."""

    def test_collect_eod_writes_final_bars(self) -> None:
        self.http = FakeHttp(daily_handler({"CU0": DAILY_ROWS_CU}))

        result = china_commodity.collect_eod(self.context())

        self.assertEqual(self.http.request_count, 2)
        for source_id, url in self.http.calls:
            self.assertEqual(source_id, "sina-futures")
            self.assertIn("var%20_", url)
            self.assertIn("/InnerFuturesNewService.getDailyKLine?symbol=", url)
        self.assertEqual(
            self.http.calls[0][1],
            "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/"
            "var%20_AU0=/InnerFuturesNewService.getDailyKLine?symbol=AU0",
        )
        self.assertEqual(self.http.options[0]["headers"], {
            "Referer": "https://finance.sina.com.cn",
        })
        self.assertEqual(self.http.options[0]["accept"], "*/*")

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 4)  # two roots x two bars
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["details"]["bars"], 4)
        self.assertEqual(result["details"]["processed"], 2)
        self.assertEqual(result["details"]["roots"], 2)

        gold = self.warehouse.get_bars("COM:XSHF:AU")
        self.assertEqual(len(gold), 2)
        self.assertEqual(gold[-1]["ts"], "2026-11-24")
        self.assertEqual(gold[-1]["close"], 936.5)
        self.assertEqual(gold[-1]["interval"], "1d")
        self.assertEqual(gold[-1]["quality"], "final")
        self.assertEqual(gold[-1]["source_id"], "sina-futures")
        self.assertEqual(gold[-1]["observed_at"], NOW_ISO)
        self.assertEqual(
            self.warehouse.latest_bar("COM:XSHF:CU")["close"], 70410.0,
        )

    def test_collect_eod_second_run_is_idempotent(self) -> None:
        self.http = FakeHttp(daily_handler())
        first = china_commodity.collect_eod(self.context())
        counts_after_first = self.warehouse.table_counts()

        second = china_commodity.collect_eod(self.context())

        self.assertEqual(first["stored"], 4)
        self.assertEqual(second["stored"], 4)
        self.assertEqual(second["status"], "ok")
        counts_after_second = self.warehouse.table_counts()
        self.assertEqual(counts_after_second["bars"], counts_after_first["bars"])
        self.assertEqual(self.warehouse.table_counts()["bars"], 4)

    def test_collect_eod_cap_defers_tail(self) -> None:
        self.roots.append({"venue": "XSHF", "root": "AL", "provider_symbol": "AL0"})
        self.http = FakeHttp(daily_handler())

        result = china_commodity.collect_eod(self.context(settings={
            "china_commodity_eod_max_roots": 2,
        }))

        self.assertEqual(self.http.request_count, 2)
        self.assertEqual(result["stored"], 4)
        self.assertEqual(result["details"]["deferred"], ["COM:XSHF:AL"])
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["status"], "ok")

    def test_collect_eod_cap_is_clamped_to_eighty_roots(self) -> None:
        self.roots = [
            {"venue": "XSHF", "root": f"R{index:03d}", "provider_symbol": f"P{index:03d}"}
            for index in range(85)
        ]
        self.http = FakeHttp(daily_handler())

        result = china_commodity.collect_eod(self.context(settings={
            "china_commodity_eod_max_roots": 1000,
        }))

        self.assertEqual(self.http.request_count, 80)
        self.assertEqual(result["details"]["selected"], 80)
        self.assertEqual(len(result["details"]["deferred"]), 5)
        self.assertEqual(result["stored"], 160)

    def test_collect_eod_rate_limit_stops_immediately(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if daily_symbol(url) == "CU0":
                raise SourceRateLimitedError("governor says wait", retry_after_s=5)
            return jsonp_text(daily_symbol(url), DAILY_ROWS_AU)

        self.roots.append({"venue": "XSHF", "root": "AL", "provider_symbol": "AL0"})
        self.http = FakeHttp(handler)

        result = china_commodity.collect_eod(self.context())

        self.assertEqual(self.http.request_count, 2)  # AU0 then CU0; AL0 never fetched
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["stopped"], "rate_limited")
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["details"]["processed"], 1)
        self.assertEqual(result["details"]["unprocessed"], ["COM:XSHF:AL"])
        failed = result["details"]["failed"]
        self.assertEqual([item["series_id"] for item in failed], ["COM:XSHF:CU"])
        self.assertEqual(failed[0]["reason"], "rate_limited")
        self.assertIsNone(self.warehouse.latest_bar_ts("COM:XSHF:CU"))
        self.assertIsNone(self.warehouse.latest_bar_ts("COM:XSHF:AL"))

    def test_collect_eod_empty_history_is_a_symbol_gap_not_an_error(self) -> None:
        def handler(source_id: str, url: str, number: int) -> str:
            if daily_symbol(url) == "AU0":
                return jsonp_text("AU0", DAILY_ROWS_AU)
            return "null"  # no history for this root

        self.http = FakeHttp(handler)
        result = china_commodity.collect_eod(self.context())

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(
            result["details"]["empty"],
            [{"series_id": "COM:XSHF:CU", "reason": "no bars"}],
        )
        self.assertNotIn("failed", result["details"])

    def test_collect_eod_parse_error_is_skipped_and_run_continues(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if daily_symbol(url) == "AU0":
                return 'var _AU0 = ([{"d": }]);'
            return jsonp_text(daily_symbol(url), DAILY_ROWS_CU)

        self.http = FakeHttp(handler)
        result = china_commodity.collect_eod(self.context())

        self.assertEqual(self.http.request_count, 2)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 2)  # CU bars only
        self.assertEqual(result["details"]["failed"][0]["reason"], "parse_error")
        self.assertIsNone(self.warehouse.latest_bar_ts("COM:XSHF:AU"))
        self.assertEqual(self.warehouse.latest_bar_ts("COM:XSHF:CU"), "2026-11-24")

    def test_collect_eod_http_error_is_recorded_and_run_continues(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if daily_symbol(url) == "CU0":
                raise DataSourceError("sina history is down")
            return jsonp_text(daily_symbol(url), DAILY_ROWS_AU)

        self.http = FakeHttp(handler)
        result = china_commodity.collect_eod(self.context())

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["details"]["failed"][0]["reason"], "source_unavailable")

    def test_collect_eod_dry_run_plans_without_fetching_or_writing(self) -> None:
        self.http = FakeHttp(lambda source_id, url, number: self.fail("no HTTP expected"))
        result = china_commodity.collect_eod(self.context(settings={"dry_run": True}))

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["reason"], "dry run")
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["details"]["planned"], 2)
        self.assertEqual(result["details"]["deferred"], [])
        self.assertEqual(self.http.request_count, 0)
        self.assertEqual(self.warehouse.table_counts()["bars"], 0)


if __name__ == "__main__":
    unittest.main()
