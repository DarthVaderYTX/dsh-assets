"""Offline tests for the generic index framework's first provider (``company:master``).

Every provider payload is an inline fixture and the curated seed is injected by
monkeypatching :func:`reference_global.load_seed`, so the suite never touches the
network and never depends on the size of the bundled seed.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError
from market_monitor.data.models import CollectContext
from market_monitor.data.indices import company_master
from market_monitor.data.sources import reference_global, reference_us

#: Deterministic "now" for the whole suite: 2026-11-25T12:00:00Z.
FIXED_EPOCH = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc).timestamp()
FIXED_ISO = "2026-11-25T12:00:00Z"
NEXT_REFRESH_ISO = "2026-11-26T12:00:00Z"

# --------------------------------------------------------------------- fixtures

SEC_FIXTURE = json.dumps({
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corporation"},
    "2": {"cik_str": 51143, "ticker": "IBM", "title": "International Business Machines Corporation"},
    # SEC-only tickers cannot be attributed to a venue and must be dropped.
    "3": {"cik_str": 1652044, "ticker": "GOOGL", "title": "Alphabet Inc."},
}, indent=1).encode("utf-8")


def nasdaq_listed_fixture(aapl_name: str = "Apple Inc. - Common Stock") -> bytes:
    """``nasdaqlisted.txt`` with two companies plus an ETF and a test issue."""
    return b"\n".join([
        b"Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
        f"AAPL|{aapl_name}|Q|N|N|100|N|N".encode("utf-8"),
        b"MSFT|Microsoft Corporation - Common Stock|Q|N|N|100|N|N",
        b"QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N",
        b"TESTT|Test Security|Q|Y|N|100|N|N",
        b"File Creation Time: 11252026 12:00||||||||",
    ])


NASDAQ_LISTED_FIXTURE = nasdaq_listed_fixture()

OTHER_LISTED_FIXTURE = b"\n".join([
    b"ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
    b"IBM|International Business Machines Corporation|N|IBM|N|100|N|IBM",
    b"SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY",
    # V (IEX) has no MIC mapping in reference_us and must be skipped.
    b"IEXA|IEX Group Inc.|V|IEXA|N|100|N|IEXA",
    b"File Creation Time: 11252026 12:00||||||||",
])


def us_fixtures(*, aapl_name: str | None = None) -> dict[str, bytes]:
    """The three US payload fixtures keyed by URL."""
    return {
        reference_us.SEC_TICKERS_URL: SEC_FIXTURE,
        reference_us.NASDAQ_LISTED_URL: nasdaq_listed_fixture(aapl_name) if aapl_name else NASDAQ_LISTED_FIXTURE,
        reference_us.OTHER_LISTED_URL: OTHER_LISTED_FIXTURE,
    }


def small_seed(*, include_7203: bool = True) -> dict:
    """Minimal curated seed: two companies, one ADR, and non-company rows."""
    instruments = [
        # Same identity as a US row: the US listing must win the merge.
        {"symbol": "AAPL", "mic": "XNAS", "name": "Apple Inc.", "type": "stock",
         "currency": "USD", "country": "US", "sector": "Technology",
         "industry": "Consumer Electronics", "provider_symbol": "AAPL"},
        {"symbol": "0700.HK", "mic": "XHKG", "name": "Tencent Holdings Limited", "type": "stock",
         "currency": "HKD", "country": "HK", "sector": "Communication Services",
         "industry": "Internet Content & Information", "provider_symbol": "0700.HK"},
        {"symbol": "TSM", "mic": "XNYS", "name": "Taiwan Semiconductor Manufacturing Company Limited",
         "type": "adr", "currency": "USD", "country": "US", "sector": "Technology",
         "industry": "Semiconductors", "provider_symbol": "TSM"},
        # Excluded non-company instruments.
        {"symbol": "SPY", "mic": "XNYS", "name": "SPDR S&P 500 ETF Trust", "type": "etf",
         "currency": "USD", "country": "US", "sector": "Financials",
         "industry": "Exchange Traded Fund", "provider_symbol": "SPY"},
        {"symbol": "BTC-USD", "mic": "XCRY", "name": "Bitcoin", "type": "crypto",
         "currency": "USD", "country": "XX", "sector": "Digital Assets",
         "industry": "Cryptocurrency", "provider_symbol": "BTC-USD"},
        {"symbol": "EURUSD=X", "mic": "XFXS", "name": "Euro / US Dollar", "type": "forex",
         "currency": "USD", "country": "XX", "sector": "Foreign Exchange",
         "industry": "Currency Pair", "provider_symbol": "EURUSD=X"},
    ]
    if include_7203:
        instruments.insert(3, {
            "symbol": "7203.T", "mic": "XTKS", "name": "Toyota Motor Corporation", "type": "stock",
            "currency": "JPY", "country": "JP", "sector": "Consumer Discretionary",
            "industry": "Auto Manufacturers", "provider_symbol": "7203.T",
        })
    return {
        "exchanges": [
            {"mic": "XNAS", "code": "XNAS", "name": "Nasdaq", "country": "US",
             "city": "New York", "timezone": "America/New_York", "currency": "USD",
             "calendar": "US", "website": ""},
        ],
        "global_instruments": instruments,
        "indices": [],
        "commodities": [],
    }


#: Index entries after the first collect with the fixtures above.
EXPECTED_ENTRY_KEYS = {
    "INS:XNAS:AAPL", "INS:XNAS:MSFT", "INS:XNYS:IBM",
    "INS:XHKG:0700.HK", "INS:XTKS:7203.T",
}
#: Seed company rows outside the US: Tencent and Toyota.  Seed rows on US
#: markets (AAPL, TSM) are ignored because the official bulk files own them.
SEED_COMPANY_COUNT = 2
#: US company rows after the ETF filter: AAPL, MSFT, IBM.
US_COMPANY_COUNT = 3
#: 2 aliases (symbol + name) for each of the 5 entries.
ALIAS_COUNT = 10


# --------------------------------------------------------------------- test base


class FakeHttp:
    """Minimal stand-in for :class:`PoliteHttpClient` over inline fixtures."""

    def __init__(self, fixtures: dict[str, bytes] | None = None,
                 failures: dict[str, Exception] | None = None) -> None:
        self.fixtures = dict(fixtures or {})
        self.failures = dict(failures or {})
        self.calls: list[tuple[str, str]] = []
        self.request_count = 0
        self.dry_run = False

    def fetch(self, source_id: str, url: str, **_kwargs: object) -> FetchResult:
        """Return a fixture body or raise the configured failure."""
        self.calls.append((source_id, url))
        self.request_count += 1
        if self.dry_run:
            return FetchResult(url=url, status=0, dry_run=True, fetched_at=FIXED_ISO)
        if url in self.failures:
            raise self.failures[url]
        if url not in self.fixtures:
            raise DataSourceError(f"no fixture for {url}")
        return FetchResult(
            url=url, status=200, body=self.fixtures[url],
            content_type="text/plain", fetched_at=FIXED_ISO,
        )


class IndexTestCase(unittest.TestCase):
    """In-memory warehouse, injected seed and deterministic clock."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(now_fn=lambda: FIXED_EPOCH)
        self.addCleanup(self.warehouse.close)
        self.seed = small_seed()
        patcher = mock.patch.object(
            reference_global, "load_seed",
            new=lambda *_args, **_kwargs: copy.deepcopy(self.seed),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def context(self, http: object, settings: dict | None = None) -> CollectContext:
        """Build a collection context over this test's warehouse."""
        logger = logging.getLogger(f"tests.index.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=self.warehouse,
            http=http,
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="company:index",
        )

    def collect(self, http: FakeHttp | None = None,
                settings: dict | None = None) -> dict:
        """Run the collector over fixtures (or the given fake HTTP)."""
        return company_master.collect(self.context(http or FakeHttp(us_fixtures()), settings))

    def entries_by_key(self) -> dict[str, dict]:
        """The stored index entries keyed by entry key."""
        rows = self.warehouse.list_index_entries(company_master.INDEX_ID, limit=500)["entries"]
        return {row["entry_key"]: row for row in rows}

    def entry_stats(self) -> dict:
        """Aggregate entry counters for the company index."""
        return self.warehouse.index_entry_stats(company_master.INDEX_ID)


# ----------------------------------------------------------------------- snapshot


class CompanyMasterSnapshotTests(IndexTestCase):
    """``build_snapshot`` merging, filtering and completeness semantics."""

    def test_snapshot_merges_sources_and_filters_non_companies(self) -> None:
        entries, details = company_master.build_snapshot(
            self.context(FakeHttp(us_fixtures())),
        )
        self.assertTrue(details["us_fetched"])
        self.assertTrue(details["us_complete"])
        self.assertEqual(details["parse_errors"], {})
        self.assertEqual(details["us_entries"], US_COMPANY_COUNT)
        self.assertEqual(details["seed_entries"], SEED_COMPANY_COUNT)
        self.assertEqual(details["entries"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(details["duplicates"], 0)
        self.assertEqual(details["requests"], 3)
        self.assertEqual(details["sources"]["sec"]["status"], "ok")
        self.assertEqual(details["sources"]["nasdaq_listed"]["status"], "ok")
        self.assertEqual(details["sources"]["other_listed"]["status"], "ok")

        by_key = {entry["entry_key"]: entry for entry in entries}
        self.assertEqual(set(by_key), EXPECTED_ENTRY_KEYS)
        for entry in entries:
            self.assertEqual(entry["entity_type"], "instrument")
            self.assertEqual(entry["entry_key"], entry["entity_id"])
            self.assertIn(entry["payload"]["instrument_type"], company_master.COMPANY_TYPES)
            self.assertEqual(entry["market"], entry["payload"]["venue"])

        # US rows win duplicates and carry their SEC CIK; ETFs never enter.
        apple = by_key["INS:XNAS:AAPL"]
        self.assertEqual(apple["payload"]["name"], "Apple Inc. - Common Stock")
        self.assertEqual(apple["payload"]["provider_ids"], {"sec_cik": "320193"})
        self.assertEqual(apple["source_id"], reference_us.NASDAQ_TRADER)
        self.assertNotIn("profile_status", apple)
        self.assertNotIn("INS:XNAS:QQQ", by_key)
        self.assertNotIn("INS:ARCX:SPY", by_key)
        # Seed rows are complete (sector/industry) and already profile-ready.
        tencent = by_key["INS:XHKG:0700.HK"]
        self.assertEqual(tencent["payload"]["sector"], "Communication Services")
        self.assertEqual(tencent["payload"]["provider_ids"], {})
        self.assertEqual(tencent["source_id"], company_master.SEED_SOURCE_ID)
        self.assertEqual(tencent["profile_status"], "ready")
        # Seed rows on a US market are ignored: the bulk files own those ids.
        self.assertNotIn("INS:XNYS:TSM", by_key)
        self.assertNotIn("INS:XCRY:BTC-USD", by_key)
        self.assertNotIn("INS:XFXS:EURUSD=X", by_key)

    def test_sec_only_ticker_has_no_venue_and_is_dropped(self) -> None:
        entries, details = company_master.build_snapshot(
            self.context(FakeHttp(us_fixtures())),
        )
        self.assertTrue(details["us_complete"])
        # The SEC-only ticker is not attributed to a venue, so it is absent.
        self.assertNotIn("GOOGL", {entry["payload"]["symbol"] for entry in entries})


# ------------------------------------------------------------------ first collect


class CompanyMasterCollectTests(IndexTestCase):
    """End-to-end ``collect`` over the diff, projection and audit tables."""

    def test_first_collect_adds_entries_and_projects_reference_tables(self) -> None:
        result = self.collect()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["details"]["counts"]["added"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(result["details"]["counts"]["entries_seen"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(result["details"]["revision"], 1)
        self.assertEqual(result["job_state"], {"last_revision": 1, "index_id": company_master.INDEX_ID})

        stats = self.entry_stats()
        self.assertEqual(stats["total"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["active"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["missing"], 0)
        self.assertEqual(stats["delisted"], 0)
        self.assertEqual(stats["pending_profiles"], US_COMPANY_COUNT)
        self.assertEqual(stats["by_market"]["XNAS"], 2)

        # ref_instrument projection.
        self.assertEqual(self.warehouse.count_instruments(), len(EXPECTED_ENTRY_KEYS))
        apple = self.warehouse.get_instrument("INS:XNAS:AAPL")
        self.assertEqual(apple["name"], "Apple Inc. - Common Stock")
        self.assertEqual(apple["type"], "stock")
        self.assertEqual(apple["mic"], "XNAS")
        self.assertEqual(apple["listing_status"], "active")
        self.assertEqual(apple["provider_symbol"], "AAPL")
        self.assertEqual(apple["source_id"], reference_us.NASDAQ_TRADER)
        self.assertEqual(apple["first_seen_at"], FIXED_ISO)
        tencent = self.warehouse.get_instrument("INS:XHKG:0700.HK")
        self.assertEqual(tencent["sector"], "Communication Services")
        self.assertEqual(tencent["country"], "HK")
        self.assertEqual(tencent["source_id"], company_master.SEED_SOURCE_ID)
        self.assertIsNone(self.warehouse.get_instrument("INS:XNYS:TSM"))

        # ref_alias projection: symbol and name for every entry.
        self.assertEqual(len(self.warehouse.list_aliases()), ALIAS_COUNT)
        alias_keys = {
            (row["alias"], row["entity_type"], row["entity_id"], row["alias_type"])
            for row in self.warehouse.list_aliases()
        }
        self.assertIn(("AAPL", "instrument", "INS:XNAS:AAPL", "symbol"), alias_keys)
        self.assertIn(
            ("Apple Inc. - Common Stock", "instrument", "INS:XNAS:AAPL", "name"), alias_keys,
        )
        self.assertIn(
            ("Tencent Holdings Limited", "instrument", "INS:XHKG:0700.HK", "name"), alias_keys,
        )

        # ref_exchange projection happens only for a fetched US snapshot.
        exchanges = self.warehouse.list_exchanges()
        self.assertEqual(len(exchanges), len(reference_us._us_exchange_rows()))
        self.assertIn("XNAS", {row["mic"] for row in exchanges})

        # Index definition and schedule state.
        definition = self.warehouse.get_index_definition(company_master.INDEX_ID)
        self.assertEqual(definition["kind"], "company_master")
        self.assertEqual(definition["refresh_interval_s"], 86400)
        self.assertEqual(definition["source_ids"], [reference_us.SEC_EDGAR, reference_us.NASDAQ_TRADER, "seed"])
        self.assertTrue(definition["enabled"])
        self.assertEqual(definition["next_refresh_at"], NEXT_REFRESH_ISO)
        self.assertEqual(definition["last_refresh_at"], FIXED_ISO)
        self.assertEqual(definition["active"], len(EXPECTED_ENTRY_KEYS))

        # One refresh audit row with source status and projection details.
        refreshes = self.warehouse.list_index_refreshes(company_master.INDEX_ID)
        self.assertEqual(len(refreshes), 1)
        refresh = refreshes[0]
        self.assertEqual(refresh["status"], "ok")
        self.assertEqual(refresh["added"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(refresh["entries_seen"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(refresh["requests"], 3)
        self.assertTrue(refresh["details"]["us_complete"])
        self.assertEqual(refresh["details"]["projection"]["aliases"], ALIAS_COUNT)
        self.assertTrue(result["details"]["projection"]["exchanges"])

    def test_second_identical_collect_reports_unchanged(self) -> None:
        first = self.collect()
        counts_after_first = self.warehouse.table_counts()
        changes_after_first = counts_after_first["index_changes"]

        second = self.collect()

        self.assertEqual(second["status"], "ok")
        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["updated"], 0)
        self.assertEqual(second["details"]["counts"]["added"], 0)
        self.assertEqual(second["details"]["counts"]["updated"], 0)
        self.assertEqual(second["details"]["counts"]["removed"], 0)
        self.assertEqual(second["details"]["counts"]["restored"], 0)
        self.assertGreater(second["details"]["counts"]["entries_seen"], 0)
        self.assertEqual(first["stored"], len(EXPECTED_ENTRY_KEYS))

        counts_after_second = self.warehouse.table_counts()
        for table in ("instruments", "aliases", "exchanges", "indices_defined",
                      "index_entries", "index_changes"):
            self.assertEqual(counts_after_second[table], counts_after_first[table], table)
        self.assertEqual(counts_after_second["index_refreshes"], counts_after_first["index_refreshes"] + 1)
        self.assertEqual(counts_after_second["index_changes"], changes_after_first)
        self.assertEqual(self.entry_stats()["active"], len(EXPECTED_ENTRY_KEYS))

        refreshes = self.warehouse.list_index_refreshes(company_master.INDEX_ID)
        self.assertEqual(len(refreshes), 2)
        self.assertEqual(refreshes[0]["status"], "ok")
        self.assertEqual(refreshes[0]["added"], 0)

    def test_rename_updates_entry_and_keeps_profile_when_provider_ids_match(self) -> None:
        self.collect()
        self.warehouse.update_index_profile(
            company_master.INDEX_ID, "INS:XNAS:AAPL",
            profile_status="ready", synced_at=FIXED_ISO,
        )

        result = self.collect(FakeHttp(us_fixtures(aapl_name="Apple Inc. - Common Stock (Renamed)")))

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["updated"], 1)
        self.assertEqual(result["details"]["counts"]["updated"], 1)
        self.assertEqual(result["details"]["counts"]["added"], 0)

        entry = self.warehouse.get_index_entry(company_master.INDEX_ID, "INS:XNAS:AAPL")
        self.assertEqual(entry["payload"]["name"], "Apple Inc. - Common Stock (Renamed)")
        self.assertEqual(entry["payload"]["provider_ids"], {"sec_cik": "320193"})
        self.assertEqual(entry["profile_status"], "ready")
        self.assertEqual(
            self.warehouse.get_instrument("INS:XNAS:AAPL")["name"],
            "Apple Inc. - Common Stock (Renamed)",
        )

        changes = self.warehouse.list_index_changes(company_master.INDEX_ID, limit=10)
        newest = changes[0]
        self.assertEqual(newest["entry_key"], "INS:XNAS:AAPL")
        self.assertEqual(newest["change_type"], "updated")
        self.assertIn("payload.name", newest["changed_fields"])
        self.assertNotIn("payload.provider_ids", newest["changed_fields"])

        # Only the US entries that are still pending remain queued for profiles.
        self.assertEqual(
            self.entry_stats()["pending_profiles"], US_COMPANY_COUNT - 1,
        )

    def test_failed_us_source_is_partial_and_never_marks_entries_missing(self) -> None:
        self.collect()
        failures = {reference_us.NASDAQ_LISTED_URL: DataSourceError("nasdaqtrader is down")}

        result = self.collect(FakeHttp(us_fixtures(), failures=failures))

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["us_complete"])
        self.assertGreaterEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["sources"]["nasdaq_listed"]["status"], "error")
        self.assertEqual(result["details"]["counts"]["removed"], 0)
        stats = self.entry_stats()
        self.assertEqual(stats["active"], len(EXPECTED_ENTRY_KEYS))
        self.assertEqual(stats["missing"], 0)
        self.assertEqual(stats["delisted"], 0)
        # The Nasdaq-only listings stay active and the failure is audited.
        self.assertEqual(self.warehouse.get_index_entry(
            company_master.INDEX_ID, "INS:XNAS:MSFT")["status"], "active")
        refresh = self.warehouse.list_index_refreshes(company_master.INDEX_ID)[0]
        self.assertEqual(refresh["status"], "partial")
        self.assertFalse(refresh["details"]["us_complete"])

    def test_unusable_payload_is_a_parse_error_not_a_removal(self) -> None:
        self.collect()
        broken = {reference_us.SEC_TICKERS_URL: b"<html>rate limited</html>"}

        result = self.collect(FakeHttp({**us_fixtures(), **broken}))

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["sources"]["sec"]["status"], "parse_error")
        self.assertTrue(result["details"]["parse_errors"])
        self.assertEqual(self.entry_stats()["missing"], 0)

    def test_seed_only_fallback_when_no_us_payload_is_available(self) -> None:
        failures = {
            reference_us.SEC_TICKERS_URL: DataSourceError("sec down"),
            reference_us.NASDAQ_LISTED_URL: DataSourceError("nasdaq down"),
            reference_us.OTHER_LISTED_URL: DataSourceError("other down"),
        }

        result = self.collect(FakeHttp(us_fixtures(), failures=failures))

        self.assertEqual(result["status"], "partial")
        self.assertFalse(result["details"]["us_complete"])
        self.assertEqual(result["details"]["counts"]["added"], SEED_COMPANY_COUNT)
        stats = self.entry_stats()
        self.assertEqual(stats["total"], SEED_COMPANY_COUNT)
        self.assertEqual(stats["active"], SEED_COMPANY_COUNT)
        self.assertEqual(self.warehouse.count_instruments(), SEED_COMPANY_COUNT)
        self.assertTrue(all(
            row["source_id"] == company_master.SEED_SOURCE_ID
            for row in self.warehouse.list_instruments()
        ))
        # No US snapshot was fetched, so the US exchange projection is skipped.
        self.assertEqual(self.warehouse.list_exchanges(), [])

    def test_dry_run_does_not_fetch_or_write(self) -> None:
        http = FakeHttp(us_fixtures())

        result = self.collect(http, settings={"dry_run": True})

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["details"]["planned_seed"], SEED_COMPANY_COUNT)
        self.assertTrue(result["details"]["would_fetch_us"])
        self.assertEqual(http.calls, [])
        self.assertEqual(self.warehouse.table_counts()["index_entries"], 0)
        self.assertEqual(self.warehouse.table_counts()["instruments"], 0)
        self.assertIsNone(self.warehouse.get_index_definition(company_master.INDEX_ID))

    def test_change_log_and_refresh_rows(self) -> None:
        self.collect()
        added = self.warehouse.list_index_changes(company_master.INDEX_ID)
        self.assertEqual(len(added), len(EXPECTED_ENTRY_KEYS))
        self.assertEqual({row["change_type"] for row in added}, {"added"})

        self.collect(FakeHttp(us_fixtures(aapl_name="Apple Inc. - Common Stock (Renamed)")))
        changes = self.warehouse.list_index_changes(company_master.INDEX_ID)
        self.assertEqual(len(changes), len(EXPECTED_ENTRY_KEYS) + 1)
        self.assertEqual(changes[0]["change_type"], "updated")
        self.assertIn("payload.name", changes[0]["changed_fields"])
        highest = max(row["change_id"] for row in changes)
        self.assertEqual(
            len(self.warehouse.list_index_changes(company_master.INDEX_ID, since_change_id=highest)),
            0,
        )
        refreshes = self.warehouse.list_index_refreshes(company_master.INDEX_ID)
        self.assertEqual(len(refreshes), 2)
        self.assertEqual([row["status"] for row in refreshes], ["ok", "ok"])

    def test_missing_then_delisted_only_updates_lifecycle_columns(self) -> None:
        self.collect()
        self.assertEqual(self.warehouse.get_instrument("INS:XTKS:7203.T")["listing_status"], "active")

        self.seed = small_seed(include_7203=False)
        missing = self.collect()
        self.assertEqual(missing["details"]["counts"]["removed"], 1)
        self.assertEqual(missing["details"]["counts"]["delisted"], 0)
        entry = self.warehouse.get_index_entry(company_master.INDEX_ID, "INS:XTKS:7203.T")
        self.assertEqual(entry["status"], "missing")
        instrument = self.warehouse.get_instrument("INS:XTKS:7203.T")
        self.assertIsNotNone(instrument, "missing companies must never be deleted")
        self.assertEqual(instrument["listing_status"], "missing")
        self.assertFalse(instrument["valid_to"])

        delisted = self.collect()
        self.assertEqual(delisted["details"]["counts"]["delisted"], 1)
        entry = self.warehouse.get_index_entry(company_master.INDEX_ID, "INS:XTKS:7203.T")
        self.assertEqual(entry["status"], "delisted")
        instrument = self.warehouse.get_instrument("INS:XTKS:7203.T")
        self.assertEqual(instrument["listing_status"], "delisted")
        self.assertEqual(instrument["valid_to"], FIXED_ISO)
        # Everything else stayed untouched.
        self.assertEqual(self.entry_stats()["active"], len(EXPECTED_ENTRY_KEYS) - 1)
        self.assertEqual(self.entry_stats()["delisted"], 1)

    def test_restored_entry_is_active_again_and_clears_valid_to(self) -> None:
        self.collect()
        self.seed = small_seed(include_7203=False)
        self.collect()
        self.collect()
        self.assertEqual(
            self.warehouse.get_instrument("INS:XTKS:7203.T")["listing_status"], "delisted",
        )

        self.seed = small_seed(include_7203=True)
        result = self.collect()

        self.assertEqual(result["details"]["counts"]["restored"], 1)
        entry = self.warehouse.get_index_entry(company_master.INDEX_ID, "INS:XTKS:7203.T")
        self.assertEqual(entry["status"], "active")
        instrument = self.warehouse.get_instrument("INS:XTKS:7203.T")
        self.assertEqual(instrument["listing_status"], "active")
        self.assertFalse(instrument["valid_to"])


# ------------------------------------------------------------------ registration


class CompanyMasterRegistrationTests(IndexTestCase):
    """Definition bootstrap idempotence and repair."""

    def test_ensure_registered_is_idempotent_and_repairs_changes(self) -> None:
        definition = company_master.ensure_registered(self.warehouse)
        self.assertEqual(definition["index_id"], company_master.INDEX_ID)
        self.assertEqual(definition["kind"], "company_master")
        self.assertEqual(definition["revision"], 0)
        self.assertEqual(definition["entries"], 0)
        updated_at = definition["updated_at"]

        again = company_master.ensure_registered(self.warehouse)
        self.assertEqual(again["updated_at"], updated_at)
        self.assertEqual(again["refresh_interval_s"], 86400)

        self.warehouse.register_index({**company_master.INDEX_DEFINITION, "refresh_interval_s": 12345})
        self.assertEqual(self.warehouse.get_index_definition(company_master.INDEX_ID)["refresh_interval_s"], 12345)
        repaired = company_master.ensure_registered(self.warehouse)
        self.assertEqual(repaired["refresh_interval_s"], 86400)

    def test_fund_like_vehicles_are_not_company_entries(self) -> None:
        self.assertFalse(company_master._is_operating_company(
            "GraniteShares Gold Trust Shares of Beneficial Interest",
        ))
        self.assertFalse(company_master._is_operating_company(
            "DB Gold Double Long ETN due February 15, 2038",
        ))
        self.assertFalse(company_master._is_operating_company(
            "MicroSectors FANG Index 2X Leveraged ETNs due January 8, 2038",
        ))
        self.assertFalse(company_master._is_operating_company("SPDR S&P 500 ETF Trust"))
        self.assertTrue(company_master._is_operating_company("Apple Inc."))
        self.assertTrue(company_master._is_operating_company("Northern Trust Corp"))
        self.assertTrue(company_master._is_operating_company("UBS AG"))

    def test_module_definition_matches_the_required_surface(self) -> None:
        self.assertEqual(company_master.INDEX_ID, "company:master")
        self.assertEqual(company_master.COMPANY_TYPES, frozenset({"stock", "adr"}))
        definition = company_master.INDEX_DEFINITION
        self.assertEqual(
            set(definition),
            {"index_id", "name", "kind", "description", "markets",
             "source_ids", "refresh_interval_s", "enabled"},
        )
        self.assertEqual(definition["kind"], "company_master")
        self.assertIn("XNAS", definition["markets"])
        self.assertEqual(definition["refresh_interval_s"], 86400)
        self.assertTrue(definition["enabled"])


if __name__ == "__main__":
    unittest.main()
