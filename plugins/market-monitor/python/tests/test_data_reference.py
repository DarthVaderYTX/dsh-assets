"""Tests for the reference-domain collectors and the curated reference seeds.

All provider payloads are inline fixtures; the reference collectors are never
allowed to reach the network from the test suite.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError
from market_monitor.data.models import (
    CollectContext,
    commodity_contract_id,
    commodity_root_id,
    index_id,
    instrument_id,
    normalise_contract_month,
)
from market_monitor.data.sources import reference_global, reference_us

#: Deterministic "now" for the whole suite: 2026-11-25T12:00:00Z.
FIXED_EPOCH = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc).timestamp()
FIXED_ISO = "2026-11-25T12:00:00Z"
#: 2026-11 is the current UTC month, so a 12-month window ends in 2027-10.
EXPECTED_FIRST_MONTH = "202611"
EXPECTED_LAST_MONTH = "202710"

SEC_FIXTURE = json.dumps({
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corporation"},
    "2": {"cik_str": 1652044, "ticker": "GOOGL", "title": "Alphabet Inc."},
    "3": {"cik_str": 1111111, "ticker": "PRIV", "title": "Private Holdings Inc."},
    "4": {"cik_str": 2222222, "ticker": "NOTITLE", "title": ""},
    "5": "not-a-json-object",
}, indent=1).encode("utf-8")

NASDAQ_LISTED_FIXTURE = b"\n".join([
    b"Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
    b"AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N",
    b"MSFT|Microsoft Corporation - Common Stock|Q|N|N|100|N|N",
    b"QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N",
    b"TESTT|Test Security|Q|Y|N|100|N|N",
    b"File Creation Time: 11252026 12:00||||||||",
])

OTHER_LISTED_FIXTURE = b"\n".join([
    b"ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
    b"IBM|International Business Machines Corporation|N|IBM|N|100|N|IBM",
    b"GE|General Electric Company|N|GE|N|100|N|GE",
    b"SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY",
    b"BRK.B|Berkshire Hathaway Inc.|N|BRK.B|N|100|N|BRK-B",
    b"IEXA|IEX Group Inc.|V|IEXA|N|100|N|IEXA",
    b"OTCX|OTC Test Corp|X|OTCX|N|100|N|OTCX",
    b"TESTY|Test Other Security|Z|TESTY|N|100|Y|TESTY",
    b"File Creation Time: 11252026 12:00||||||||",
])


class FakeHttp:
    """Minimal stand-in for :class:`PoliteHttpClient` over inline fixtures."""

    def __init__(self, fixtures=None, failures=None):
        self.fixtures = dict(fixtures or {})
        self.failures = dict(failures or {})
        self.request_count = 0
        self.dry_run = False
        self.calls: list[tuple[str, str]] = []

    def fetch(self, source_id: str, url: str, **kwargs: object) -> FetchResult:
        """Return a fixture body or raise the configured failure."""
        self.request_count += 1
        self.calls.append((source_id, url))
        if self.dry_run:
            return FetchResult(url=url, status=0, dry_run=True, fetched_at=FIXED_ISO)
        if url in self.failures:
            raise self.failures[url]
        if url not in self.fixtures:
            raise DataSourceError(f"no fixture for {url}")
        body = self.fixtures[url]
        return FetchResult(
            url=url, status=200, body=body, content_type="text/plain",
            fetched_at=FIXED_ISO,
        )


def us_fixtures() -> dict[str, bytes]:
    """The three US reference payload fixtures keyed by URL."""
    return {
        reference_us.SEC_TICKERS_URL: SEC_FIXTURE,
        reference_us.NASDAQ_LISTED_URL: NASDAQ_LISTED_FIXTURE,
        reference_us.OTHER_LISTED_URL: OTHER_LISTED_FIXTURE,
    }


class ReferenceTestCase(unittest.TestCase):
    """Warehouse plus deterministic clock shared by the collector tests."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(
            Path(self.directory.name) / "warehouse.db", now_fn=lambda: FIXED_EPOCH,
        )
        self.addCleanup(self.warehouse.close)

    def context(self, http: object) -> CollectContext:
        """Build a collection context over this test's warehouse."""
        logger = logging.getLogger(f"tests.reference.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=self.warehouse,
            http=http,
            settings={},
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="reference:test",
        )


# ---------------------------------------------------------------------- SEC


class SecParserTests(unittest.TestCase):
    """``company_tickers.json`` parsing."""

    def test_parse_sec_tickers_returns_ticker_title_rows(self) -> None:
        rows = reference_us.parse_sec_tickers(SEC_FIXTURE)
        self.assertEqual([row["ticker"] for row in rows], ["AAPL", "MSFT", "GOOGL", "PRIV"])
        self.assertEqual(rows[0]["title"], "Apple Inc.")
        self.assertEqual(rows[0]["cik"], 320193)
        # Entries without a title and non-object entries are dropped.
        self.assertEqual(len(rows), 4)

    def test_parse_sec_tickers_rejects_unusable_payloads(self) -> None:
        with self.assertRaises(ValueError):
            reference_us.parse_sec_tickers(b"")
        with self.assertRaises(ValueError):
            reference_us.parse_sec_tickers(b"<html>blocked</html>")


class NasdaqParserTests(unittest.TestCase):
    """NasdaqTrader pipe-delimited symbol directories."""

    def test_nasdaq_listed_skips_test_issues_and_detects_etf(self) -> None:
        rows = reference_us.parse_nasdaq_listed(NASDAQ_LISTED_FIXTURE)
        self.assertEqual([row["symbol"] for row in rows], ["AAPL", "MSFT", "QQQ"])
        self.assertTrue(all(row["mic"] == "XNAS" for row in rows))
        by_symbol = {row["symbol"]: row for row in rows}
        self.assertFalse(by_symbol["AAPL"]["etf"])
        self.assertTrue(by_symbol["QQQ"]["etf"])
        self.assertNotIn("TESTT", by_symbol)

    def test_nasdaq_listed_ignores_file_creation_line(self) -> None:
        rows = reference_us.parse_nasdaq_listed(NASDAQ_LISTED_FIXTURE)
        self.assertFalse(any("File Creation" in row["symbol"] for row in rows))

    def test_other_listed_maps_exchanges_and_skips_unknown(self) -> None:
        rows = reference_us.parse_other_listed(OTHER_LISTED_FIXTURE)
        by_symbol = {row["symbol"]: row for row in rows}
        self.assertEqual(by_symbol["IBM"]["mic"], "XNYS")
        self.assertEqual(by_symbol["GE"]["mic"], "XNYS")
        self.assertEqual(by_symbol["SPY"]["mic"], "ARCX")
        self.assertTrue(by_symbol["SPY"]["etf"])
        self.assertEqual(by_symbol["BRK.B"]["mic"], "XNYS")
        # V (IEX) and X (unknown venue) are not guessed; the raw code is kept.
        self.assertEqual(by_symbol["IEXA"]["mic"], "")
        self.assertEqual(by_symbol["IEXA"]["exchange"], "V")
        self.assertEqual(by_symbol["OTCX"]["mic"], "")
        # Test issues and the trailing File Creation Time line are ignored.
        self.assertNotIn("TESTY", by_symbol)
        self.assertFalse(any("File Creation" in row["symbol"] for row in rows))


# --------------------------------------------------------------------- merge


class MergeUsListingsTests(unittest.TestCase):
    """Exchange attribution and the SEC-only rule."""

    def setUp(self) -> None:
        self.sec_rows = reference_us.parse_sec_tickers(SEC_FIXTURE)
        self.nasdaq_rows = reference_us.parse_nasdaq_listed(NASDAQ_LISTED_FIXTURE)
        self.other_rows = reference_us.parse_other_listed(OTHER_LISTED_FIXTURE)
        self.rows = reference_us.merge_us_listings(
            self.sec_rows, self.nasdaq_rows, self.other_rows,
        )
        self.by_symbol = {row["symbol"]: row for row in self.rows}

    def test_uses_nasdaq_exchange_mapping(self) -> None:
        self.assertEqual(self.by_symbol["AAPL"]["mic"], "XNAS")
        self.assertEqual(self.by_symbol["AAPL"]["instrument_id"], "INS:XNAS:AAPL")
        self.assertEqual(self.by_symbol["IBM"]["mic"], "XNYS")
        self.assertEqual(self.by_symbol["SPY"]["mic"], "ARCX")
        self.assertEqual(self.by_symbol["BRK.B"]["mic"], "XNYS")
        self.assertEqual(len(self.rows), 7)

    def test_does_not_guess_sec_only_tickers(self) -> None:
        # GOOGL and PRIV appear in the SEC file but not in the listing files.
        self.assertNotIn("GOOGL", self.by_symbol)
        self.assertNotIn("PRIV", self.by_symbol)
        self.assertFalse(any(row["symbol"] == "GOOGL" for row in self.rows))
        # Unknown NasdaqTrader exchange codes (V, X) are skipped as well.
        self.assertNotIn("IEXA", self.by_symbol)
        self.assertNotIn("OTCX", self.by_symbol)

    def test_sets_common_instrument_fields(self) -> None:
        row = self.by_symbol["AAPL"]
        self.assertEqual(row["type"], "stock")
        self.assertEqual(row["currency"], "USD")
        self.assertEqual(row["country"], "US")
        self.assertEqual(row["listing_status"], "active")
        self.assertEqual(row["provider_symbol"], "AAPL")
        self.assertEqual(row["source_id"], "nasdaqtrader")
        self.assertEqual(self.by_symbol["QQQ"]["type"], "ETF")

    def test_sec_title_is_only_a_name_fallback(self) -> None:
        nasdaq_rows = [{"symbol": "AAPL", "name": "", "mic": "XNAS", "etf": False}]
        rows = reference_us.merge_us_listings(self.sec_rows, nasdaq_rows, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Apple Inc.")


# ---------------------------------------------------------------- US collect


class UsReferenceCollectorTests(ReferenceTestCase):
    """End-to-end ``reference_us.collect`` against fixture payloads."""

    def run_collector(self, http: FakeHttp) -> dict:
        return reference_us.collect(self.context(http))

    def test_collect_persists_instruments_exchanges_and_aliases(self) -> None:
        http = FakeHttp(us_fixtures())
        result = self.run_collector(http)
        self.assertEqual(result["status"], "ok")
        self.assertGreater(result["stored"], 0)
        self.assertEqual(http.request_count, 3)
        self.assertEqual(result["details"]["sec_rows"], 4)
        self.assertEqual(result["details"]["nasdaq_listed_rows"], 3)
        self.assertEqual(result["details"]["other_listed_rows"], 6)
        self.assertEqual(result["details"]["skipped_mic"], 2)
        self.assertEqual(result["details"]["sec_only"], 2)

        self.assertEqual(self.warehouse.count_instruments(), 7)
        apple = self.warehouse.get_instrument("INS:XNAS:AAPL")
        self.assertIsNotNone(apple)
        self.assertEqual(apple["name"], "Apple Inc. - Common Stock")
        self.assertEqual(apple["provider_symbol"], "AAPL")
        self.assertEqual(apple["type"], "stock")
        self.assertEqual(self.warehouse.get_instrument("INS:XNAS:QQQ")["type"], "ETF")
        self.assertEqual(self.warehouse.get_instrument("INS:ARCX:SPY")["type"], "ETF")

        exchanges = self.warehouse.list_exchanges()
        self.assertEqual(len(exchanges), len(reference_us.US_EXCHANGE_MICS))
        self.assertTrue(all(row["country"] == "US" for row in exchanges))
        self.assertIn("XNYS", {row["mic"] for row in exchanges})

        aliases = self.warehouse.list_aliases()
        self.assertEqual(len(aliases), 14)
        self.assertIn("INS:XNAS:AAPL", {row["entity_id"] for row in aliases})
        self.assertIn(("AAPL", "symbol"), {(row["alias"], row["alias_type"]) for row in aliases})

    def test_second_run_is_idempotent(self) -> None:
        first = self.run_collector(FakeHttp(us_fixtures()))
        counts_after_first = self.warehouse.table_counts()
        second = self.run_collector(FakeHttp(us_fixtures()))
        self.assertEqual(first["stored"], second["stored"])
        self.assertEqual(second["duplicates"], first["duplicates"])
        self.assertEqual(self.warehouse.table_counts(), counts_after_first)
        self.assertEqual(self.warehouse.count_instruments(), 7)
        self.assertEqual(len(self.warehouse.list_aliases()), 14)

    def test_failed_source_does_not_abort_the_job(self) -> None:
        http = FakeHttp(
            us_fixtures(),
            failures={reference_us.SEC_TICKERS_URL: DataSourceError("SEC is down")},
        )
        result = self.run_collector(http)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["sources"]["sec"]["status"], "error")
        self.assertGreaterEqual(result["skipped"], 1)
        # The NasdaqTrader files alone still produce the listing rows.
        self.assertEqual(self.warehouse.count_instruments(), 7)
        self.assertEqual(len(self.warehouse.list_exchanges()), len(reference_us.US_EXCHANGE_MICS))

    def test_dry_run_does_not_touch_the_warehouse(self) -> None:
        http = FakeHttp(us_fixtures())
        http.dry_run = True
        result = self.run_collector(http)
        self.assertEqual(result["stored"], 0)
        self.assertTrue(result["details"].get("dry_run"))
        self.assertEqual(self.warehouse.table_counts()["instruments"], 0)
        self.assertEqual(self.warehouse.table_counts()["exchanges"], 0)


# ------------------------------------------------------------ seeded markets


class GlobalSeedTests(unittest.TestCase):
    """Curated seed validation and identity correctness."""

    def setUp(self) -> None:
        self.seed = reference_global.load_seed()
        self.exchange_mics = {row["mic"] for row in self.seed["exchanges"]}
        self.instruments = self.seed["global_instruments"]
        self.indices = self.seed["indices"]
        self.roots = self.seed["commodities"]

    def test_seed_counts_are_in_expected_range(self) -> None:
        self.assertGreaterEqual(len(self.seed["exchanges"]), 20)
        self.assertTrue(100 <= len(self.instruments) <= 130, len(self.instruments))
        self.assertTrue(26 <= len(self.indices) <= 30, len(self.indices))
        self.assertGreaterEqual(len(self.roots), 16)
        self.assertEqual(
            len(self.seed["exchanges"]),
            len(self.exchange_mics),
            "exchange MICs must be unique",
        )

    def test_internal_pseudo_venues_are_present(self) -> None:
        by_mic = {row["mic"]: row for row in self.seed["exchanges"]}
        self.assertIn("XCRY", by_mic)
        self.assertIn("XFXS", by_mic)
        self.assertIn("internal", by_mic["XCRY"]["name"].lower())
        self.assertIn("internal", by_mic["XFXS"]["name"].lower())
        self.assertEqual(by_mic["XCRY"]["calendar"], "CRYPTO-24/7")
        self.assertEqual(by_mic["XFXS"]["calendar"], "FX-24/5")

    def test_every_instrument_identity_is_unique_and_well_formed(self) -> None:
        identities = [instrument_id(row["mic"], row["symbol"]) for row in self.instruments]
        self.assertEqual(len(identities), len(set(identities)))
        for identity in identities:
            self.assertRegex(identity, r"^INS:[A-Z]{4}:[A-Z0-9.^=_-]{1,24}$")

    def test_every_instrument_mic_belongs_to_an_exchange(self) -> None:
        for row in self.instruments:
            self.assertIn(row["mic"], self.exchange_mics, row["symbol"])
            self.assertTrue(row["provider_symbol"].strip(), row["symbol"])
            self.assertIn(row["type"], reference_global.INSTRUMENT_TYPES)
            self.assertTrue(row["name"].strip(), row["symbol"])

    def test_index_identities_and_venues_are_valid(self) -> None:
        identities = [index_id(row["code"]) for row in self.indices]
        self.assertEqual(len(identities), len(set(identities)))
        for row in self.indices:
            self.assertTrue(row["provider_symbol"].strip(), row["code"])
            self.assertIn(row["type"], reference_global.INDEX_TYPES)
            self.assertIn(row["venue"], self.exchange_mics, row["code"])
            self.assertGreaterEqual(int(row["constituents_count"]), 0)

    def test_commodity_roots_and_contracts_are_well_formed(self) -> None:
        root_ids = [commodity_root_id(row["venue"], row["root"]) for row in self.roots]
        self.assertEqual(len(root_ids), len(set(root_ids)))
        contracts = reference_global.generate_commodity_contracts(self.roots, "2026-11")
        self.assertTrue(contracts)
        for row in contracts:
            expected = commodity_contract_id(row["venue"], row["root"], row["contract_month"])
            self.assertEqual(row["contract_id"], expected)
            self.assertEqual(row["first_trade_date"], "")
            self.assertEqual(row["last_trade_date"], "")
        months = sorted({row["contract_month"] for row in contracts})
        self.assertEqual(months[0], EXPECTED_FIRST_MONTH)
        self.assertEqual(months[-1], EXPECTED_LAST_MONTH)
        self.assertEqual(
            len(contracts),
            sum(int(row["months_ahead"]) for row in self.roots),
        )

    def test_contract_generation_marks_only_the_front_month_quotable(self) -> None:
        contracts = reference_global.generate_commodity_contracts(self.roots, "2026-11")
        gold = [row for row in contracts if row["root_id"] == "COM:XCEC:GC"]
        self.assertEqual(len(gold), 12)
        self.assertEqual(gold[0]["contract_month"], EXPECTED_FIRST_MONTH)
        self.assertEqual(gold[0]["provider_symbol"], "GC=F")
        self.assertTrue(all(row["provider_symbol"] == "" for row in gold[1:]))

    def test_validators_reject_bad_identities(self) -> None:
        duplicate = [self.seed["exchanges"][0], dict(self.seed["exchanges"][0])]
        with self.assertRaises(ValueError):
            reference_global.validate_exchanges(duplicate)
        bad_instrument = dict(self.instruments[0])
        bad_instrument["mic"] = "ZZZZ"
        with self.assertRaises(ValueError):
            reference_global.validate_instruments([bad_instrument], {"XNAS"})
        bad_root = dict(self.roots[0])
        bad_root["venue"] = "XXXX"
        with self.assertRaises(ValueError):
            reference_global.validate_commodities({"roots": [bad_root]})

    def test_load_seed_accepts_an_explicit_base_directory(self) -> None:
        seed_dir = Path(reference_global.DATA_SEED_DIR)
        seed = reference_global.load_seed(seed_dir)
        self.assertEqual(len(seed["global_instruments"]), len(self.instruments))
        self.assertEqual(normalise_contract_month("2026-11"), EXPECTED_FIRST_MONTH)


class GlobalCollectorTests(ReferenceTestCase):
    """End-to-end ``reference_global.collect`` over the bundled seed."""

    def setUp(self) -> None:
        super().setUp()
        self.seed = reference_global.load_seed()

    def run_collector(self) -> dict:
        return reference_global.collect(self.context(FakeHttp({})))

    def test_collect_persists_every_seed_table(self) -> None:
        result = self.run_collector()
        counts = self.warehouse.table_counts()
        details = result["details"]
        self.assertEqual(result["status"], "ok")
        self.assertEqual(counts["exchanges"], len(self.seed["exchanges"]))
        self.assertEqual(counts["instruments"], len(self.seed["global_instruments"]))
        self.assertEqual(counts["indices"], len(self.seed["indices"]))
        self.assertEqual(counts["commodity_roots"], len(self.seed["commodities"]))
        self.assertEqual(
            counts["commodity_contracts"],
            sum(int(row["months_ahead"]) for row in self.seed["commodities"]),
        )
        self.assertGreater(counts["aliases"], 0)
        self.assertEqual(details["contract_first_month"], EXPECTED_FIRST_MONTH)
        self.assertEqual(details["contract_last_month"], EXPECTED_LAST_MONTH)
        self.assertEqual(
            result["stored"],
            details["exchanges"] + details["instruments"] + details["indices"]
            + details["commodity_roots"] + details["commodity_contracts"] + details["aliases"],
        )

    def test_second_run_is_idempotent(self) -> None:
        first = self.run_collector()
        counts_after_first = self.warehouse.table_counts()
        second = self.run_collector()
        self.assertEqual(first["stored"], second["stored"])
        self.assertEqual(self.warehouse.table_counts(), counts_after_first)

    def test_contract_months_follow_the_injected_clock(self) -> None:
        self.run_collector()
        gold_contracts = self.warehouse.list_commodity_contracts("COM:XCEC:GC")
        self.assertEqual(len(gold_contracts), 12)
        self.assertEqual(gold_contracts[0]["contract_month"], EXPECTED_FIRST_MONTH)
        self.assertEqual(gold_contracts[-1]["contract_month"], EXPECTED_LAST_MONTH)
        self.assertEqual(gold_contracts[0]["provider_symbol"], "GC=F")
        self.assertEqual(gold_contracts[1]["provider_symbol"], "")

    def test_index_and_commodity_aliases_exist(self) -> None:
        self.run_collector()
        aliases = self.warehouse.list_aliases()
        keys = {(row["alias"], row["entity_type"], row["entity_id"], row["alias_type"]) for row in aliases}
        self.assertIn(("GSPC", "index", "IDX:GSPC", "symbol"), keys)
        self.assertIn(("S&P 500", "index", "IDX:GSPC", "name"), keys)
        self.assertIn(("GC", "commodity_root", "COM:XCEC:GC", "symbol"), keys)
        self.assertIn(("Gold futures", "commodity_root", "COM:XCEC:GC", "name"), keys)
        self.assertIn(
            ("0700.HK", "instrument", "INS:XHKG:0700.HK", "symbol"), keys,
        )

    def test_crypto_and_fx_watchlist_symbols_resolve(self) -> None:
        self.run_collector()
        expected = {
            "BTC-USD": "INS:XCRY:BTC-USD",
            "ETH-USD": "INS:XCRY:ETH-USD",
            "SOL-USD": "INS:XCRY:SOL-USD",
            "EURUSD=X": "INS:XFXS:EURUSD=X",
            "USDJPY=X": "INS:XFXS:USDJPY=X",
            "GBPUSD=X": "INS:XFXS:GBPUSD=X",
        }
        for symbol, identity in expected.items():
            row = self.warehouse.find_instrument_by_provider_symbol(symbol)
            self.assertIsNotNone(row, symbol)
            self.assertEqual(row["instrument_id"], identity)
            self.assertEqual(row["provider_symbol"], symbol)


if __name__ == "__main__":
    unittest.main()
