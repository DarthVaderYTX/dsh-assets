"""Offline tests for the China securities index provider (``china:securities``).

Every Eastmoney list page is an inline JSON fixture, and the fake HTTP client
matches requests by their decoded ``fs``/``pn`` query parameters, so the suite
never touches the network.  The bundled exchange seed is read from disk (it is
versioned with the package) and no other provider is contacted.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import unittest
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data.errors import DataSourceError
from market_monitor.data.indices import china_securities
from market_monitor.data.models import CollectContext, FetchResult
from market_monitor.data.warehouse import DataWarehouse

#: Deterministic "now" for the whole suite: 2026-11-25T12:00:00Z.
FIXED_EPOCH = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc).timestamp()
FIXED_ISO = "2026-11-25T12:00:00Z"
NEXT_REFRESH_ISO = "2026-11-26T12:00:00Z"

A_SHARE_FILTER = china_securities.A_SHARE_FILTER
ETF_FILTER = china_securities.ETF_FILTER

# --------------------------------------------------------------------- fixtures


def row(
    code: str,
    market: int,
    name: str,
    market_cap: float,
    *,
    turnover: float = 1_000_000.0,
    price: float = 10.0,
    change: float = 0.5,
    industry: str = "Beverages",
) -> dict:
    """One Eastmoney ``clist`` row (``f13`` 1 = Shanghai, 0 = Shenzhen)."""
    return {
        "f12": code, "f13": market, "f14": name, "f20": market_cap,
        "f6": turnover, "f2": price, "f3": change, "f100": industry,
    }


def page(rows: list[dict], total: int | None = None) -> bytes:
    """Encode one ``clist`` JSON response with a ``data.total`` count."""
    return json.dumps(
        {"rc": 0, "rt": 6, "data": {"total": len(rows) if total is None else total, "diff": rows}},
        ensure_ascii=False,
    ).encode("utf-8")


STOCK_ROWS = [
    row("600519", 1, "è´µå·žèŒ…å°", 2_100_000_000_000.0, industry="é…¿é…’è¡Œä¸š"),
    row("300750", 0, "å®å¾·æ—¶ä»£", 1_050_000_000_000.0, industry="ç”µæ± "),
    row("000001", 0, "å¹³å®‰é“¶è¡Œ", 250_000_000_000.0, industry="é“¶è¡Œ"),
]
ETF_ROWS = [
    row("510300", 1, "æ²ªæ·±300ETF", 40_000_000_000.0, industry=""),
    row("159915", 0, "åˆ›ä¸šæ¿ETF", 20_000_000_000.0, industry=""),
]

#: Default fixtures: one full page per security class.
DEFAULT_PAGES = {
    (A_SHARE_FILTER, 1): page(STOCK_ROWS),
    (ETF_FILTER, 1): page(ETF_ROWS),
}

EXPECTED_ENTRY_KEYS = {
    "INS:XSHG:600519", "INS:XSHE:300750", "INS:XSHE:000001",
    "INS:XSHG:510300", "INS:XSHE:159915",
}
#: Three aliases (symbol, Chinese name, provider symbol) per entry.
ALIAS_COUNT = 3 * len(EXPECTED_ENTRY_KEYS)


def request_params(url: str) -> dict[str, str]:
    """Decoded query parameters of one request URL."""
    query = parse_qs(urlsplit(url).query, keep_blank_values=True)
    return {key: values[0] for key, values in query.items()}


# ------------------------------------------------------------------------ fakes


class FakeHttp:
    """Minimal stand-in for :class:`PoliteHttpClient` over inline fixtures."""

    def __init__(
        self,
        pages: dict[tuple[str, int], bytes] | None = None,
        failures: dict[tuple[str, int], Exception] | None = None,
    ) -> None:
        self.pages = dict(pages if pages is not None else DEFAULT_PAGES)
        self.failures = dict(failures or {})
        self.calls: list[dict[str, object]] = []

    def fetch(self, source_id: str, url: str, **kwargs: object) -> FetchResult:
        """Return the fixture page for ``fs``/``pn`` or raise the configured failure."""
        params = request_params(url)
        try:
            page_number = int(params.get("pn") or 1)
        except ValueError:
            page_number = 1
        key = (params.get("fs", ""), page_number)
        self.calls.append({"source_id": source_id, "url": url, "params": params, "kwargs": kwargs})
        if key in self.failures:
            raise self.failures[key]
        if key not in self.pages:
            raise DataSourceError(f"no fixture for fs={key[0]!r} page {key[1]}")
        return FetchResult(
            url=url,
            status=200,
            content_type="application/json; charset=utf-8",
            body=self.pages[key],
            fetched_at=FIXED_ISO,
        )

    def urls(self) -> list[str]:
        """Every requested URL, in call order."""
        return [str(call["url"]) for call in self.calls]

    def call_params(self) -> list[dict[str, str]]:
        """Decoded query parameters for every call, in call order."""
        return [dict(call["params"]) for call in self.calls]  # type: ignore[arg-type]


# --------------------------------------------------------------------- test base


class ChinaSecuritiesTestCase(unittest.TestCase):
    """In-memory warehouse, deterministic clock and injected HTTP client."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(now_fn=lambda: FIXED_EPOCH)
        self.addCleanup(self.warehouse.close)

    def context(self, http: object, settings: dict | None = None) -> CollectContext:
        """Build a collection context over this test's warehouse."""
        logger = logging.getLogger(f"tests.china_securities.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=self.warehouse,
            http=http,
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="china:index",
        )

    def snapshot(self, http: FakeHttp | None = None,
                 settings: dict | None = None) -> tuple[list[dict], dict]:
        """Run ``build_snapshot`` over fixtures."""
        return china_securities.build_snapshot(self.context(http or FakeHttp(), settings))

    def collect(self, http: FakeHttp | None = None,
                settings: dict | None = None) -> dict:
        """Run the collector over fixtures."""
        return china_securities.collect(self.context(http or FakeHttp(), settings))

    def entries_by_key(self) -> dict[str, dict]:
        """The stored index entries keyed by entry key."""
        rows = self.warehouse.list_index_entries(china_securities.INDEX_ID, limit=500)["entries"]
        return {row["entry_key"]: row for row in rows}

    def entry_stats(self) -> dict:
        """Aggregate entry counters for the China securities index."""
        return self.warehouse.index_entry_stats(china_securities.INDEX_ID)

    def alias_keys(self) -> set[tuple[str, str, str, str]]:
        """``(alias, entity_type, entity_id, alias_type)`` for every alias row."""
        return {
            (row["alias"], row["entity_type"], row["entity_id"], row["alias_type"])
            for row in self.warehouse.list_aliases()
        }


# ----------------------------------------------------------------------- snapshot


class ChinaSecuritiesSnapshotTests(ChinaSecuritiesTestCase):
    """``build_snapshot`` mapping, pagination and completeness semantics."""

    def test_snapshot_maps_markets_provider_symbols_and_instrument_types(self) -> None:
        entries, details = self.snapshot()

        self.assertTrue(details["complete"])
        self.assertEqual(details["index_id"], china_securities.INDEX_ID)
        self.assertEqual(details["requests"], 2)
        self.assertEqual(details["skipped"], 0)
        self.assertEqual(details["errors"], [])
        self.assertEqual(details["entries"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(details["stock_entries"], 3)
        self.assertEqual(details["fund_entries"], 2)
        self.assertEqual(details["duplicates"], 0)
        self.assertEqual(details["markets"], {"XSHG": 2, "XSHE": 3})
        self.assertEqual(details["limits"]["stock_max_entries"], 2000)
        self.assertEqual(details["limits"]["fund_max_entries"], 800)
        self.assertEqual(details["limits"]["page_size"], 100)
        self.assertEqual(details["limits"]["max_pages"], 80)
        self.assertEqual(details["sources"]["eastmoney"]["status"], "ok")
        self.assertEqual(details["stocks"]["status"], "ok")
        self.assertEqual(details["funds"]["status"], "ok")

        by_key = {entry["entry_key"]: entry for entry in entries}
        self.assertEqual(set(by_key), EXPECTED_ENTRY_KEYS)

        maotai = by_key["INS:XSHG:600519"]
        self.assertEqual(maotai["entity_type"], "instrument")
        self.assertEqual(maotai["entity_id"], "INS:XSHG:600519")
        self.assertEqual(maotai["market"], "XSHG")
        self.assertEqual(maotai["source_id"], "eastmoney")
        self.assertEqual(maotai["profile_status"], "ready")
        payload = maotai["payload"]
        self.assertEqual(payload["name"], "è´µå·žèŒ…å°")
        self.assertEqual(payload["name_zh"], "è´µå·žèŒ…å°")
        self.assertEqual(payload["symbol"], "600519")
        self.assertEqual(payload["venue"], "XSHG")
        self.assertEqual(payload["instrument_type"], "stock")
        self.assertEqual(payload["currency"], "CNY")
        self.assertEqual(payload["country"], "CN")
        self.assertEqual(payload["sector"], "é…¿é…’è¡Œä¸š")
        self.assertEqual(payload["industry"], "é…¿é…’è¡Œä¸š")
        self.assertEqual(payload["provider_symbol"], "600519.SS")
        self.assertEqual(payload["provider_ids"], {"eastmoney_secid": "1.600519"})
        self.assertEqual(payload["market_cap"], 2_100_000_000_000.0)
        self.assertEqual(payload["turnover"], 1_000_000.0)
        self.assertEqual(payload["last_price"], 10.0)
        self.assertEqual(payload["aliases"], [
            {"alias": "600519", "alias_type": "symbol"},
            {"alias": "è´µå·žèŒ…å°", "alias_type": "name"},
            {"alias": "600519.SS", "alias_type": "provider_symbol"},
        ])

        shenzhen = by_key["INS:XSHE:000001"]["payload"]
        self.assertEqual(shenzhen["provider_symbol"], "000001.SZ")
        self.assertEqual(shenzhen["provider_ids"], {"eastmoney_secid": "0.000001"})
        fund = by_key["INS:XSHG:510300"]["payload"]
        self.assertEqual(fund["instrument_type"], "etf")
        self.assertEqual(fund["provider_symbol"], "510300.SS")
        self.assertEqual(fund["sector"], "")
        self.assertEqual(by_key["INS:XSHE:159915"]["payload"]["provider_symbol"], "159915.SZ")

    def test_market_cap_sort_pagination_requests_pages_in_order(self) -> None:
        rows = [
            row("600000", 1, "æµ¦å‘é“¶è¡Œ", 900.0),
            row("600001", 1, "é‚¯éƒ¸é’¢é“", 800.0),
            row("000002", 0, "ä¸‡ç§‘A", 700.0),
            row("000003", 0, "PTé‡‘ç”°A", 600.0),
        ]
        pages = {
            (A_SHARE_FILTER, 1): page(rows[:2], total=4),
            (A_SHARE_FILTER, 2): page(rows[2:], total=4),
        }
        http = FakeHttp(pages)

        entries, details = self.snapshot(
            http,
            settings={
                "china_page_size": 2,
                "china_stock_max_entries": 3,
                "china_fund_max_entries": 0,
            },
        )

        self.assertTrue(details["complete"])
        self.assertEqual(details["stocks"]["pages"], 2)
        self.assertEqual(details["stocks"]["requests"], 2)
        self.assertEqual(details["stocks"]["total"], 4)
        self.assertEqual(details["stock_entries"], 3)
        self.assertEqual(details["funds"]["status"], "skipped")
        # Target truncates the last page: only the highest market-cap row of
        # page two is kept, and no third page is requested.
        symbols = {entry["payload"]["symbol"] for entry in entries}
        self.assertEqual(symbols, {"600000", "600001", "000002"})
        self.assertNotIn("000003", symbols)

        calls = http.call_params()
        self.assertEqual([call["fs"] for call in calls], [A_SHARE_FILTER, A_SHARE_FILTER])
        self.assertEqual([call["pn"] for call in calls], ["1", "2"])
        for call in calls:
            self.assertEqual(call["pz"], "2")
            self.assertEqual(call["fid"], "f20")
            self.assertEqual(call["po"], "1")
            self.assertEqual(call["np"], "1")
            self.assertEqual(call["fltt"], "2")
            self.assertEqual(call["invt"], "2")

    def test_max_entry_settings_cap_page_requests_and_entries(self) -> None:
        http = FakeHttp()

        entries, details = self.snapshot(
            http,
            settings={"china_stock_max_entries": 1, "china_fund_max_entries": 0},
        )

        self.assertEqual(len(entries), 1)
        # One page was needed for the single stock row; the ETF pass is disabled.
        self.assertEqual(entries[0]["payload"]["symbol"], "600519")
        self.assertEqual(details["stocks"]["requests"], 1)
        self.assertEqual(details["stocks"]["entries"], 1)
        self.assertEqual(details["funds"]["status"], "skipped")
        self.assertEqual(details["fund_entries"], 0)
        self.assertEqual([call["fs"] for call in http.call_params()], [A_SHARE_FILTER])
        self.assertTrue(details["complete"])

    def test_collection_settings_are_clamped_into_safe_ranges(self) -> None:
        limits = china_securities._limits(self.context(FakeHttp(), {
            "china_stock_max_entries": 99_999,
            "china_fund_max_entries": -5,
            "china_page_size": 1_000,
            "china_max_pages": 1_000,
        }))
        self.assertEqual(limits, {
            "stock_max_entries": china_securities.MAX_STOCK_ENTRIES,
            "fund_max_entries": 0,
            "page_size": china_securities.MAX_PAGE_SIZE,
            "max_pages": china_securities.MAX_PAGES,
        })
        defaults = china_securities._limits(self.context(FakeHttp()))
        self.assertEqual(defaults, {
            "stock_max_entries": 2000,
            "fund_max_entries": 800,
            "page_size": 100,
            "max_pages": 80,
        })

    def test_unusable_rows_keep_long_term_snapshot_semantics_and_empty_data(self) -> None:
        pages = {
            (A_SHARE_FILTER, 1): page([
                row("600519", 1, "è´µå·žèŒ…å°", 2_100.0),
                # A numeric code must keep Shenzhen's leading zeros.
                {"f12": 1, "f13": 0, "f14": "å¹³å®‰é“¶è¡Œ", "f20": 250.0, "f100": "é“¶è¡Œ"},
                # Missing market flag: unusable.
                {"f12": "600000", "f14": "æµ¦å‘é“¶è¡Œ", "f20": 100.0},
                # Missing code: unusable.
                {"f12": "", "f13": 1, "f14": "ç©ºä»£ç ", "f20": 1.0},
                # Unknown market flag: unusable.
                {"f12": "000002", "f13": 2, "f14": "ä¸‡ç§‘A", "f20": 1.0},
                # Missing name falls back to the code.
                {"f12": "600518", "f13": 1, "f20": 1.0},
            ]),
            # ``data: null`` is a valid empty selection.
            (ETF_FILTER, 1): json.dumps({"rc": 0, "data": None}).encode("utf-8"),
        }

        entries, details = self.snapshot(FakeHttp(pages))

        symbols = {entry["payload"]["symbol"] for entry in entries}
        self.assertEqual(symbols, {"600519", "000001", "600518"})
        by_symbol = {entry["payload"]["symbol"]: entry for entry in entries}
        self.assertEqual(by_symbol["000001"]["entry_key"], "INS:XSHE:000001")
        self.assertEqual(by_symbol["600518"]["payload"]["name"], "600518")
        self.assertTrue(details["complete"])
        self.assertEqual(details["fund_entries"], 0)
        self.assertEqual(details["funds"]["total"], 0)


# ---------------------------------------------------------------- failure semantics


    def test_sina_fallback_replaces_a_failed_eastmoney_pass(self) -> None:
        class SinaFallbackHttp:
            def __init__(self) -> None:
                self.calls = []

            def fetch(self, source_id: str, url: str, **kwargs: object) -> FetchResult:
                if source_id == "eastmoney":
                    raise DataSourceError("eastmoney 502")
                self.calls.append((source_id, url))
                if source_id != "sina-cn-list":
                    raise DataSourceError(f"unexpected source {source_id}")
                params = request_params(url)
                node = params.get("node")
                page_number = int(params.get("pn") or 1)
                rows = (
                    [
                        {"symbol": "sh600519", "code": "600519", "name": "è´µå·žèŒ…å°",
                         "trade": "1500.00", "amount": 1e8, "mktcap": 210000000.0},
                        {"symbol": "sz000001", "code": "000001", "name": "å¹³å®‰é“¶è¡Œ",
                         "trade": "9.2", "amount": 1e7, "mktcap": 25000000.0},
                    ] if node == "hs_a" else [
                        {"symbol": "sh510300", "code": "510300", "name": "æ²ªæ·±300ETF",
                         "trade": "4.1", "amount": 1e7, "mktcap": 4000000.0},
                    ]
                )
                body = json.dumps(rows if page_number == 1 else [], ensure_ascii=False).encode("utf-8")
                return FetchResult(
                    url=url, status=200, content_type="application/json; charset=utf-8",
                    body=body, fetched_at=FIXED_ISO,
                )

        entries, details = self.snapshot(http=SinaFallbackHttp())
        self.assertTrue(details["complete"])
        self.assertEqual(details["stocks"]["source"], "sina-cn-list")
        self.assertEqual(details["funds"]["source"], "sina-cn-list")
        self.assertEqual(details["stocks"]["fallback_from"], "eastmoney")
        self.assertEqual(details["entries"], 3)
        by_id = {entry["entity_id"]: entry for entry in entries}
        self.assertIn("INS:XSHG:600519", by_id)
        self.assertEqual(by_id["INS:XSHG:600519"]["payload"]["provider_symbol"], "600519.SS")
        self.assertEqual(by_id["INS:XSHG:600519"]["source_id"], "sina-cn-list")


class ChinaSecuritiesFailureTests(ChinaSecuritiesTestCase):
    """Partial snapshots never retire entries and are audited as partial."""

    def setUp(self) -> None:
        super().setUp()
        self.pages = {
            (A_SHARE_FILTER, 1): page(
                [row("600000", 1, "æµ¦å‘é“¶è¡Œ", 900.0), row("600001", 0, "é‚¯éƒ¸é’¢é“", 800.0)],
                total=4,
            ),
            (A_SHARE_FILTER, 2): page(
                [row("000002", 0, "ä¸‡ç§‘A", 700.0), row("000003", 1, "PTé‡‘ç”°A", 600.0)],
                total=4,
            ),
            (ETF_FILTER, 1): page(ETF_ROWS),
        }
        self.settings = {
            "china_page_size": 2,
            "china_stock_max_entries": 10,
            "china_fund_max_entries": 10,
        }

    def test_failed_page_is_partial_and_never_marks_entries_missing(self) -> None:
        first = self.collect(FakeHttp(self.pages), self.settings)
        self.assertEqual(first["status"], "ok")
        self.assertTrue(first["details"]["complete"])
        # ``data.total`` ended the stock pass after two pages.
        self.assertEqual(first["details"]["counts"]["added"], 6)

        failures = {(A_SHARE_FILTER, 2): DataSourceError("eastmoney page 2 failed")}
        result = self.collect(FakeHttp(self.pages, failures=failures), self.settings)

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["complete"])
        self.assertGreaterEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["sources"]["eastmoney"]["status"], "partial")
        self.assertEqual(result["details"]["errors"][0]["page"], 2)
        self.assertIn("eastmoney page 2 failed", result["details"]["errors"][0]["error"])
        self.assertEqual(result["details"]["counts"]["removed"], 0)
        self.assertEqual(result["details"]["counts"]["added"], 0)
        stats = self.entry_stats()
        self.assertEqual(stats["total"], 6)
        self.assertEqual(stats["active"], 6)
        self.assertEqual(stats["missing"], 0)
        self.assertEqual(stats["delisted"], 0)
        # Page-one entries were still applied and remain active.
        self.assertEqual(self.warehouse.get_index_entry(
            china_securities.INDEX_ID, "INS:XSHG:600000")["status"], "active")
        refreshes = self.warehouse.list_index_refreshes(china_securities.INDEX_ID)
        self.assertEqual(refreshes[0]["status"], "partial")
        self.assertFalse(refreshes[0]["details"]["complete"])
        self.assertTrue(refreshes[0]["details"]["errors"])

    def test_unusable_page_payload_is_recorded_as_parse_error(self) -> None:
        first = self.collect()
        self.assertEqual(first["status"], "ok")

        broken = FakeHttp({**DEFAULT_PAGES, (ETF_FILTER, 1): b"<html>rate limited</html>"})
        result = self.collect(broken)

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["complete"])
        self.assertEqual(result["details"]["errors"][0]["page"], 1)
        self.assertEqual(result["details"]["counts"]["removed"], 0)
        self.assertEqual(self.entry_stats()["missing"], 0)
        self.assertEqual(
            len(self.warehouse.list_index_refreshes(china_securities.INDEX_ID)), 2,
        )

    def test_provider_error_envelope_is_a_parse_error(self) -> None:
        first = self.collect()
        self.assertEqual(first["status"], "ok")

        broken = FakeHttp({
            **DEFAULT_PAGES,
            (ETF_FILTER, 1): json.dumps({"rc": 102, "data": None}).encode("utf-8"),
        })
        result = self.collect(broken)

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["complete"])
        self.assertIn("rc=102", result["details"]["errors"][0]["error"])
        self.assertEqual(result["details"]["counts"]["removed"], 0)
        self.assertEqual(self.entry_stats()["missing"], 0)

    def test_inconsistent_empty_page_is_partial_and_never_mass_removes(self) -> None:
        first = self.collect()
        self.assertEqual(first["status"], "ok")

        # The provider says three A-shares exist but returns none: applying
        # this as a complete snapshot would wrongly retire every tracked stock.
        inconsistent = FakeHttp({
            (A_SHARE_FILTER, 1): page([], total=3),
            (ETF_FILTER, 1): page(ETF_ROWS),
        })
        result = self.collect(inconsistent)

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["complete"])
        self.assertIn("data.total", result["details"]["errors"][0]["error"])
        self.assertEqual(result["details"]["counts"]["removed"], 0)
        stats = self.entry_stats()
        self.assertEqual(stats["active"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["missing"], 0)
        self.assertEqual(stats["delisted"], 0)

    def test_page_safety_cap_is_partial_and_adds_nothing_beyond_the_fetched_pages(self) -> None:
        pages = {
            (A_SHARE_FILTER, 1): page(
                [row("600000", 1, "æµ¦å‘é“¶è¡Œ", 900.0), row("600001", 0, "é‚¯éƒ¸é’¢é“", 800.0)],
                total=100,
            ),
            (A_SHARE_FILTER, 2): page(
                [row("000002", 0, "ä¸‡ç§‘A", 700.0), row("000003", 1, "PTé‡‘ç”°A", 600.0)],
                total=100,
            ),
        }
        result = self.collect(FakeHttp(pages), {
            "china_page_size": 2,
            "china_stock_max_entries": 10,
            "china_fund_max_entries": 0,
            "china_max_pages": 2,
        })

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["complete"])
        self.assertEqual(result["details"]["counts"]["added"], 4)
        self.assertEqual(self.entry_stats()["active"], 4)


# --------------------------------------------------------------- projection & audit


class ChinaSecuritiesCollectTests(ChinaSecuritiesTestCase):
    """``collect`` diffing, projection and refresh audit rows."""

    def test_first_collect_projects_instruments_aliases_and_exchanges(self) -> None:
        result = self.collect()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertTrue(result["details"]["complete"])
        self.assertEqual(result["details"]["counts"]["added"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(
            result["details"]["counts"]["entries_seen"], len(EXPECTED_ENTRY_KEYS),
        )
        self.assertEqual(result["details"]["counts"]["profiles_queued"], 0)
        self.assertEqual(result["details"]["revision"], 1)
        self.assertEqual(result["job_state"], {
            "last_revision": 1, "index_id": china_securities.INDEX_ID,
        })

        stats = self.entry_stats()
        self.assertEqual(stats["total"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["active"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["missing"], 0)
        self.assertEqual(stats["delisted"], 0)
        self.assertEqual(stats["pending_profiles"], 0)
        self.assertEqual(stats["by_market"], {"XSHG": 2, "XSHE": 3})

        # ref_instrument projection.
        self.assertEqual(self.warehouse.count_instruments(), len(EXPECTED_ENTRY_KEYS))
        maotai = self.warehouse.get_instrument("INS:XSHG:600519")
        self.assertIsNotNone(maotai)
        self.assertEqual(maotai["name"], "è´µå·žèŒ…å°")
        self.assertEqual(maotai["symbol"], "600519")
        self.assertEqual(maotai["mic"], "XSHG")
        self.assertEqual(maotai["type"], "stock")
        self.assertEqual(maotai["currency"], "CNY")
        self.assertEqual(maotai["country"], "CN")
        self.assertEqual(maotai["sector"], "é…¿é…’è¡Œä¸š")
        self.assertEqual(maotai["industry"], "é…¿é…’è¡Œä¸š")
        self.assertEqual(maotai["listing_status"], "active")
        self.assertEqual(maotai["provider_symbol"], "600519.SS")
        self.assertEqual(maotai["source_id"], "eastmoney")
        self.assertEqual(maotai["first_seen_at"], FIXED_ISO)
        self.assertEqual(maotai["valid_from"], FIXED_ISO)
        fund = self.warehouse.get_instrument("INS:XSHG:510300")
        self.assertEqual(fund["type"], "etf")
        self.assertEqual(fund["provider_symbol"], "510300.SS")

        # ref_alias projection: symbol, Chinese name and provider symbol.
        alias_keys = self.alias_keys()
        self.assertEqual(len(alias_keys), ALIAS_COUNT)
        self.assertIn(("600519", "instrument", "INS:XSHG:600519", "symbol"), alias_keys)
        self.assertIn(("è´µå·žèŒ…å°", "instrument", "INS:XSHG:600519", "name"), alias_keys)
        self.assertIn(
            ("600519.SS", "instrument", "INS:XSHG:600519", "provider_symbol"), alias_keys,
        )
        name_alias = [
            alias for alias in self.warehouse.list_aliases()
            if alias["entity_id"] == "INS:XSHG:600519" and alias["alias_type"] == "name"
        ]
        self.assertEqual(len(name_alias), 1)
        self.assertEqual(name_alias[0]["language"], "zh")

        # ref_exchange projection: only the two mainland exchanges.
        exchanges = self.warehouse.list_exchanges()
        self.assertEqual({exchange["mic"] for exchange in exchanges}, {"XSHG", "XSHE"})
        shanghai = next(exchange for exchange in exchanges if exchange["mic"] == "XSHG")
        self.assertEqual(shanghai["name"], "Shanghai Stock Exchange")
        self.assertEqual(shanghai["currency"], "CNY")
        self.assertEqual(shanghai["country"], "CN")
        self.assertEqual(shanghai["source_id"], "reference:seed")

        # Index definition and schedule state.
        definition = self.warehouse.get_index_definition(china_securities.INDEX_ID)
        self.assertEqual(definition["kind"], "china_securities")
        self.assertEqual(definition["markets"], ["XSHG", "XSHE"])
        self.assertEqual(definition["source_ids"], ["eastmoney", "sina-cn-list"])
        self.assertEqual(definition["refresh_interval_s"], 86400)
        self.assertTrue(definition["enabled"])
        self.assertEqual(definition["next_refresh_at"], NEXT_REFRESH_ISO)
        self.assertEqual(definition["last_refresh_at"], FIXED_ISO)
        self.assertEqual(definition["active"], len(EXPECTED_ENTRY_KEYS))

        # One refresh audit row with source status and projection details.
        refreshes = self.warehouse.list_index_refreshes(china_securities.INDEX_ID)
        self.assertEqual(len(refreshes), 1)
        refresh = refreshes[0]
        self.assertEqual(refresh["status"], "ok")
        self.assertEqual(refresh["added"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(refresh["entries_seen"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(refresh["requests"], 2)
        self.assertTrue(refresh["details"]["complete"])
        self.assertEqual(refresh["details"]["errors"], [])
        self.assertEqual(refresh["details"]["projection"]["aliases"], ALIAS_COUNT)
        self.assertEqual(refresh["details"]["projection"]["exchanges"], 2)
        self.assertEqual(refresh["details"]["stocks"]["entries"], 3)
        self.assertEqual(refresh["details"]["funds"]["entries"], 2)

    def test_second_identical_collect_is_idempotent(self) -> None:
        first = self.collect()
        counts_after_first = self.warehouse.table_counts()
        changes_after_first = counts_after_first["index_changes"]

        second = self.collect()

        self.assertEqual(second["status"], "ok")
        self.assertTrue(second["details"]["complete"])
        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["updated"], 0)
        self.assertEqual(second["details"]["counts"]["added"], 0)
        self.assertEqual(second["details"]["counts"]["updated"], 0)
        self.assertEqual(second["details"]["counts"]["removed"], 0)
        self.assertEqual(second["details"]["counts"]["restored"], 0)
        self.assertEqual(second["details"]["counts"]["entries_seen"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(first["stored"], len(EXPECTED_ENTRY_KEYS))

        counts_after_second = self.warehouse.table_counts()
        for table in ("instruments", "aliases", "exchanges", "indices_defined",
                      "index_entries", "index_changes"):
            self.assertEqual(counts_after_second[table], counts_after_first[table], table)
        self.assertEqual(
            counts_after_second["index_refreshes"], counts_after_first["index_refreshes"] + 1,
        )
        self.assertEqual(counts_after_second["index_changes"], changes_after_first)
        self.assertEqual(self.entry_stats()["active"], len(EXPECTED_ENTRY_KEYS))

        # The refresh revision advances even when nothing changed.
        self.assertEqual(second["details"]["revision"], 2)
        refreshes = self.warehouse.list_index_refreshes(china_securities.INDEX_ID)
        self.assertEqual(len(refreshes), 2)
        self.assertEqual(refreshes[0]["status"], "ok")
        self.assertEqual(refreshes[0]["added"], 0)

    def test_missing_then_delisted_then_restored_lifecycle(self) -> None:
        self.collect()
        self.assertEqual(
            self.warehouse.get_instrument("INS:XSHE:000001")["listing_status"], "active",
        )
        missing_pages = {
            (A_SHARE_FILTER, 1): page(
                [entry for entry in STOCK_ROWS if entry["f12"] != "000001"],
            ),
            (ETF_FILTER, 1): page(ETF_ROWS),
        }

        missing = self.collect(FakeHttp(missing_pages))
        self.assertTrue(missing["details"]["complete"])
        self.assertEqual(missing["details"]["counts"]["removed"], 1)
        self.assertEqual(missing["details"]["counts"]["delisted"], 0)
        entry = self.warehouse.get_index_entry(china_securities.INDEX_ID, "INS:XSHE:000001")
        self.assertEqual(entry["status"], "missing")
        instrument = self.warehouse.get_instrument("INS:XSHE:000001")
        self.assertIsNotNone(instrument, "missing securities must never be deleted")
        self.assertEqual(instrument["listing_status"], "missing")
        self.assertFalse(instrument["valid_to"])

        delisted = self.collect(FakeHttp(missing_pages))
        self.assertTrue(delisted["details"]["complete"])
        self.assertEqual(delisted["details"]["counts"]["delisted"], 1)
        entry = self.warehouse.get_index_entry(china_securities.INDEX_ID, "INS:XSHE:000001")
        self.assertEqual(entry["status"], "delisted")
        instrument = self.warehouse.get_instrument("INS:XSHE:000001")
        self.assertEqual(instrument["listing_status"], "delisted")
        self.assertEqual(instrument["valid_to"], FIXED_ISO)
        # Only the removed security changed; everything else stayed active.
        self.assertEqual(self.entry_stats()["active"], len(EXPECTED_ENTRY_KEYS) - 1)
        self.assertEqual(self.entry_stats()["delisted"], 1)

        restored = self.collect()
        self.assertTrue(restored["details"]["complete"])
        self.assertEqual(restored["details"]["counts"]["restored"], 1)
        self.assertEqual(restored["updated"], 1)
        entry = self.warehouse.get_index_entry(china_securities.INDEX_ID, "INS:XSHE:000001")
        self.assertEqual(entry["status"], "active")
        instrument = self.warehouse.get_instrument("INS:XSHE:000001")
        self.assertEqual(instrument["listing_status"], "active")
        self.assertIsNone(instrument["valid_to"])
        self.assertEqual(instrument["first_seen_at"], FIXED_ISO)

    def test_dry_run_does_not_fetch_or_write(self) -> None:
        http = FakeHttp()

        result = self.collect(http, {"dry_run": True})

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["details"]["index_id"], china_securities.INDEX_ID)
        self.assertIn("eastmoney", result["details"]["planned"])
        self.assertIn("2000", result["details"]["planned"])
        self.assertEqual(result["details"]["limits"]["fund_max_entries"], 800)
        self.assertEqual(http.calls, [])
        counts = self.warehouse.table_counts()
        self.assertEqual(counts["index_entries"], 0)
        self.assertEqual(counts["instruments"], 0)
        self.assertEqual(counts["exchanges"], 0)
        self.assertEqual(counts["index_refreshes"], 0)
        self.assertIsNone(self.warehouse.get_index_definition(china_securities.INDEX_ID))


# ------------------------------------------------------------------ URL encoding


class ChinaSecuritiesUrlTests(ChinaSecuritiesTestCase):
    """The provider filter syntax must survive URL encoding byte-for-byte."""

    def test_filter_encoding_keeps_plus_as_clause_separator(self) -> None:
        encoded = china_securities._eastmoney_filter(A_SHARE_FILTER)
        self.assertIn("%2B", encoded)
        self.assertNotIn("+", encoded)
        self.assertNotIn(" ", encoded)
        self.assertEqual(unquote(encoded), A_SHARE_FILTER)
        self.assertEqual(china_securities._eastmoney_filter(ETF_FILTER), "b%3AMK0021")

    def test_request_url_contains_encoded_filters(self) -> None:
        http = FakeHttp()

        self.snapshot(http)

        stock_url = http.urls()[0]
        self.assertTrue(stock_url.startswith(china_securities.BASE_URL))
        self.assertIn("%2B", stock_url)
        self.assertNotIn("fs=m:1+t:2", stock_url)
        params = request_params(stock_url)
        self.assertEqual(params["fs"], A_SHARE_FILTER)
        self.assertEqual(unquote(params["fs"]), A_SHARE_FILTER)
        self.assertEqual(params["fid"], "f20")
        self.assertEqual(params["po"], "1")
        self.assertEqual(params["np"], "1")
        self.assertEqual(params["fltt"], "2")
        self.assertEqual(params["invt"], "2")
        self.assertEqual(params["pz"], "100")
        self.assertEqual(params["pn"], "1")
        self.assertEqual(params["fields"], china_securities.FIELDS)
        self.assertEqual(request_params(http.urls()[1])["fs"], ETF_FILTER)

        first_call = http.calls[0]
        self.assertEqual(first_call["source_id"], "eastmoney")
        self.assertEqual(first_call["kwargs"].get("accept"), "application/json")
        self.assertEqual(
            first_call["kwargs"].get("headers"), {"Referer": china_securities.REFERER},
        )


# ------------------------------------------------------------------ registration


class ChinaSecuritiesRegistrationTests(ChinaSecuritiesTestCase):
    """Definition bootstrap idempotence and repair."""

    def test_ensure_registered_is_idempotent_and_repairs_changes(self) -> None:
        definition = china_securities.ensure_registered(self.warehouse)
        self.assertEqual(definition["index_id"], china_securities.INDEX_ID)
        self.assertEqual(definition["kind"], "china_securities")
        self.assertEqual(definition["revision"], 0)
        self.assertEqual(definition["entries"], 0)
        updated_at = definition["updated_at"]

        again = china_securities.ensure_registered(self.warehouse)
        self.assertEqual(again["updated_at"], updated_at)
        self.assertEqual(again["refresh_interval_s"], 86400)

        self.warehouse.register_index({
            **china_securities.INDEX_DEFINITION, "refresh_interval_s": 12345,
        })
        self.assertEqual(
            self.warehouse.get_index_definition(china_securities.INDEX_ID)["refresh_interval_s"],
            12345,
        )
        repaired = china_securities.ensure_registered(self.warehouse)
        self.assertEqual(repaired["refresh_interval_s"], 86400)

    def test_module_definition_matches_the_required_surface(self) -> None:
        self.assertEqual(china_securities.INDEX_ID, "china:securities")
        definition = china_securities.INDEX_DEFINITION
        self.assertEqual(
            set(definition),
            {"index_id", "name", "kind", "description", "markets",
             "source_ids", "refresh_interval_s", "enabled"},
        )
        self.assertEqual(definition["name"], "China securities index")
        self.assertEqual(definition["kind"], "china_securities")
        self.assertEqual(definition["markets"], ["XSHG", "XSHE"])
        self.assertEqual(definition["source_ids"], ["eastmoney", "sina-cn-list"])
        self.assertEqual(definition["refresh_interval_s"], 86400)
        self.assertTrue(definition["enabled"])
        self.assertEqual(
            china_securities.A_SHARE_FILTER,
            "m:1+t:2,m:0+t:6,m:1+t:23,m:0+t:80",
        )
        self.assertEqual(china_securities.ETF_FILTER, "b:MK0021")
        self.assertEqual(china_securities.FIELDS, "f12,f13,f14,f2,f3,f6,f20,f100")
        self.assertEqual(china_securities.SORT_FIELD, "f20")

    def test_exchange_rows_are_the_two_mainland_exchanges_from_the_seed(self) -> None:
        rows = china_securities._exchange_rows()
        self.assertEqual([row["mic"] for row in rows], ["XSHG", "XSHE"])
        for exchange in rows:
            self.assertEqual(exchange["country"], "CN")
            self.assertEqual(exchange["currency"], "CNY")
            self.assertEqual(exchange["source_id"], "reference:seed")


if __name__ == "__main__":
    unittest.main()
