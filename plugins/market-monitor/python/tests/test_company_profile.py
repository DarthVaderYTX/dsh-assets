"""Offline tests for the index-driven company profile collector.

Every provider payload is an inline fixture and the HTTP client is a stub, so the
suite never reaches the network.  The warehouse is in-memory and uses a fixed
clock, which keeps the timestamp assertions deterministic.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import (
    DataSourceError,
    SourceBlockedError,
    SourceRateLimitedError,
)
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import company_profile

#: Deterministic "now" for the whole suite: 2026-11-25T12:00:00Z.
FIXED_EPOCH = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc).timestamp()
FIXED_ISO = "2026-11-25T12:00:00Z"
#: When a cached raw document was originally fetched (304 re-parse path).
CACHED_ISO = "2026-11-20T09:30:00Z"

APPLE_ENTITY = "INS:XNAS:AAPL"
MICROSOFT_ENTITY = "INS:XNAS:MSFT"
NVIDIA_ENTITY = "INS:XNAS:NVDA"
TOYOTA_ENTITY = "INS:XTKS:7203"

APPLE_SUBMISSIONS = {
    "cik": "0000320193",
    "entityName": "Apple Inc.",
    "name": "Apple Inc.",
    "sic": "3571",
    "sicDescription": "Electronic Computers",
    "stateOfIncorporation": "CA",
    "fiscalYearEnd": "0930",
    "tickers": ["AAPL"],
    "exchanges": ["Nasdaq"],
    "formerNames": [
        {"name": "Apple Computer, Inc.", "from": "1980-12-12", "to": "2007-01-09"},
    ],
    "addresses": {
        "mailing": {
            "street1": "One Apple Park Way", "street2": "", "city": "Cupertino",
            "stateOrCountry": "CA", "zipCode": "95014",
        },
        "business": {
            "street1": "One Apple Park Way", "street2": "", "city": "Cupertino",
            "stateOrCountry": "CA", "zipCode": "95014",
        },
    },
    "website": "https://www.apple.com",
}

MICROSOFT_SUBMISSIONS = {
    "cik": "0000789019",
    "name": "Microsoft Corporation",
    "sic": "7372",
    "sicDescription": "Services-Prepackaged Software",
    "stateOfIncorporation": "WA",
    "fiscalYearEnd": "0630",
    "tickers": ["MSFT"],
    "exchanges": ["Nasdaq"],
    "formerNames": [],
    "addresses": {
        "business": {
            "street1": "One Microsoft Way", "city": "Redmond",
            "stateOrCountry": "WA", "zipCode": "98052",
        },
    },
}

NVIDIA_SUBMISSIONS = {
    "name": "NVIDIA Corporation",
    "sic": "3674",
    "sicDescription": "Semiconductors",
    "stateOfIncorporation": "DE",
    "fiscalYearEnd": "0131",
    "tickers": ["NVDA"],
    "exchanges": ["Nasdaq"],
}

APPLE_URL = company_profile.submissions_url("320193")
MICROSOFT_URL = company_profile.submissions_url("789019")
NVIDIA_URL = company_profile.submissions_url("1045810")


class FakeHttp:
    """Minimal stand-in for :class:`PoliteHttpClient` over inline fixtures."""

    def __init__(self, fixtures=None, errors=None):
        self.fixtures = dict(fixtures or {})
        self.errors = dict(errors or {})
        self.calls: list[tuple[str, str]] = []
        self.dry_run = False

    @property
    def request_count(self) -> int:
        """Number of attempted fetches (matching the polite client attribute)."""
        return len(self.calls)

    def fetch(self, source_id: str, url: str, **kwargs: object) -> FetchResult:
        """Return a fixture body, a prepared result, or raise a configured error."""
        self.calls.append((source_id, url))
        failure = self.errors.get(url)
        if failure is not None:
            if callable(failure):
                failure = failure()
            raise failure
        payload = self.fixtures.get(url)
        if payload is None:
            raise DataSourceError(f"no fixture for {url}")
        if isinstance(payload, FetchResult):
            return payload
        if callable(payload):
            payload = payload()
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode("utf-8")
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        return FetchResult(
            url=url,
            status=200,
            body=payload,
            content_type="application/json",
            fetched_at=FIXED_ISO,
        )


class ParseSubmissionsTests(unittest.TestCase):
    """The pure SEC submissions parser."""

    def test_maps_every_supported_company_field(self) -> None:
        row = company_profile.parse_submissions(APPLE_SUBMISSIONS)
        self.assertEqual(row["legal_name"], "Apple Inc.")
        self.assertEqual(row["sic"], "3571")
        self.assertEqual(row["sic_description"], "Electronic Computers")
        self.assertEqual(row["state_of_incorporation"], "CA")
        self.assertEqual(row["fiscal_year_end"], "0930")
        self.assertEqual(row["tickers"], ["AAPL"])
        self.assertEqual(row["exchanges"], ["Nasdaq"])
        self.assertEqual(row["former_names"], [
            {"name": "Apple Computer, Inc.", "from": "1980-12-12", "to": "2007-01-09"},
        ])
        self.assertEqual(row["address"], "One Apple Park Way, Cupertino, CA 95014")
        self.assertEqual(row["website"], "https://www.apple.com")
        # The result is a plain JSON-serialisable profile row.
        self.assertEqual(json.loads(json.dumps(row)), row)

    def test_empty_payload_defaults_to_empty_values(self) -> None:
        row = company_profile.parse_submissions({})
        self.assertEqual(row, {
            "legal_name": "",
            "sic": "",
            "sic_description": "",
            "state_of_incorporation": "",
            "fiscal_year_end": "",
            "tickers": [],
            "exchanges": [],
            "former_names": [],
            "address": "",
            "website": "",
        })

    def test_absent_optional_fields_never_raise(self) -> None:
        row = company_profile.parse_submissions({"name": "Example Corp"})
        self.assertEqual(row["legal_name"], "Example Corp")
        self.assertEqual(row["sic"], "")
        self.assertEqual(row["tickers"], [])
        # Non-mapping input is treated as an empty document rather than an error.
        for payload in (None, [], "not-a-document", 42):
            with self.subTest(payload=payload):
                self.assertEqual(
                    company_profile.parse_submissions(payload)["legal_name"], "",
                )

    def test_former_names_normalise_strings_and_drop_unusable_entries(self) -> None:
        row = company_profile.parse_submissions({"formerNames": [
            "Old Name",
            {"name": "Mid Name", "from": "2000-01-01", "to": "2005-01-01"},
            {"from": "missing-name"},
            7,
            None,
        ]})
        self.assertEqual(row["former_names"], [
            {"name": "Old Name", "from": "", "to": ""},
            {"name": "Mid Name", "from": "2000-01-01", "to": "2005-01-01"},
        ])
        json.dumps(row["former_names"])

    def test_tickers_and_exchanges_are_string_lists(self) -> None:
        row = company_profile.parse_submissions({
            "tickers": ["AAPL", "", None], "exchanges": "Nasdaq",
        })
        self.assertEqual(row["tickers"], ["AAPL"])
        self.assertEqual(row["exchanges"], ["Nasdaq"])
        self.assertEqual(
            company_profile.parse_submissions({"tickers": {"bad": "shape"}})["tickers"], [],
        )

    def test_first_non_empty_address_wins(self) -> None:
        payload = {"addresses": {
            "mailing": {},
            "business": {"street1": "1 Main St", "city": "Austin", "stateOrCountry": "TX"},
        }}
        self.assertEqual(
            company_profile.parse_submissions(payload)["address"],
            "1 Main St, Austin, TX",
        )
        self.assertEqual(
            company_profile.parse_submissions({"addresses": {"business": {"city": "Austin"}}})["address"],
            "Austin",
        )
        self.assertEqual(
            company_profile.parse_submissions({"addresses": {"zip": {"zipCode": "95014"}}})["address"],
            "95014",
        )
        self.assertEqual(company_profile.parse_submissions({"addresses": None})["address"], "")


class SubmissionsUrlTests(unittest.TestCase):
    """CIK normalisation and URL construction."""

    def test_zero_pads_to_ten_digits(self) -> None:
        self.assertEqual(APPLE_URL, "https://data.sec.gov/submissions/CIK0000320193.json")
        self.assertEqual(company_profile.submissions_url("789019"), MICROSOFT_URL)

    def test_accepts_leading_zeros_and_integer_ciks(self) -> None:
        self.assertEqual(company_profile.submissions_url("0000320193"), APPLE_URL)
        self.assertEqual(company_profile.submissions_url(320193), APPLE_URL)

    def test_rejects_unusable_ciks(self) -> None:
        for bad in ("", None, "not-a-cik", -1):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    company_profile.submissions_url(bad)


class CompanyProfileTestCase(unittest.TestCase):
    """In-memory warehouse with the company master index registered."""

    def setUp(self) -> None:
        self.warehouse = self.new_warehouse()
        self.warehouse.register_index({
            "index_id": company_profile.INDEX_ID,
            "name": "Company master index",
            "kind": "company_master",
            "markets": ["US", "XTKS"],
            "source_ids": ["sec-edgar", "nasdaqtrader"],
            "refresh_interval_s": 86400,
        })

    def new_warehouse(self) -> DataWarehouse:
        """Create a fresh in-memory warehouse with the fixed clock."""
        warehouse = DataWarehouse(":memory:", now_fn=lambda: FIXED_EPOCH)
        self.addCleanup(warehouse.close)
        return warehouse

    def seed(self, entries: list[dict]) -> dict:
        """Apply one index snapshot through the real warehouse path."""
        return self.warehouse.apply_index_snapshot(
            company_profile.INDEX_ID, entries, source_id="sec-edgar",
        )

    def entry(
        self,
        entity_id: str,
        cik: str | None = None,
        *,
        market: str = "US",
        name: str | None = None,
    ) -> dict:
        """Build one company master index entry."""
        payload: dict = {
            "name": name or entity_id,
            "symbol": entity_id.rsplit(":", 1)[-1],
        }
        if cik is not None:
            payload["provider_ids"] = {"sec_cik": cik}
        return {
            "entry_key": entity_id,
            "entity_type": "instrument",
            "entity_id": entity_id,
            "market": market,
            "payload": payload,
        }

    def context(
        self,
        http: object,
        settings: dict | None = None,
        warehouse: DataWarehouse | None = None,
    ) -> CollectContext:
        """Build a collection context over this test's warehouse."""
        logger = logging.getLogger(f"tests.company_profile.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=warehouse or self.warehouse,
            http=http,
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="company:profile",
        )

    def entry_row(self, entity_id: str) -> dict:
        """Current index-entry row for one entity."""
        row = self.warehouse.get_index_entry(company_profile.INDEX_ID, entity_id)
        self.assertIsNotNone(row, entity_id)
        return row


class CollectSuccessTests(CompanyProfileTestCase):
    """Happy path: profiles are written and entries marked ready."""

    def test_successful_batch_writes_profiles_and_marks_entries_ready(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
            self.entry(NVIDIA_ENTITY, "1045810"),
        ])
        http = FakeHttp({
            APPLE_URL: APPLE_SUBMISSIONS,
            MICROSOFT_URL: MICROSOFT_SUBMISSIONS,
            NVIDIA_URL: NVIDIA_SUBMISSIONS,
        })

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["batch"], company_profile.DEFAULT_PROFILE_BATCH)
        self.assertEqual(result["details"]["profiles"], 3)
        self.assertEqual(result["details"]["failed"], [])
        self.assertEqual(result["details"]["missing_cik"], 0)
        self.assertEqual(result["details"]["attempts"], company_profile.DEFAULT_MAX_ATTEMPTS)
        self.assertEqual(result["job_state"], {"last_run_at": FIXED_ISO, "profiles": 3})

        self.assertEqual(
            http.calls,
            [
                (company_profile.SOURCE_ID, APPLE_URL),
                (company_profile.SOURCE_ID, MICROSOFT_URL),
                (company_profile.SOURCE_ID, NVIDIA_URL),
            ],
        )

        apple = self.warehouse.get_company_profile(APPLE_ENTITY)
        self.assertIsNotNone(apple)
        self.assertEqual(apple["market"], "US")
        self.assertEqual(apple["legal_name"], "Apple Inc.")
        self.assertEqual(apple["sic"], "3571")
        self.assertEqual(apple["sic_description"], "Electronic Computers")
        self.assertEqual(apple["state_of_incorporation"], "CA")
        self.assertEqual(apple["fiscal_year_end"], "0930")
        self.assertEqual(apple["tickers"], ["AAPL"])
        self.assertEqual(apple["exchanges"], ["Nasdaq"])
        self.assertEqual(apple["address"], "One Apple Park Way, Cupertino, CA 95014")
        self.assertEqual(apple["website"], "https://www.apple.com")
        self.assertEqual(apple["source_id"], company_profile.SOURCE_ID)
        self.assertEqual(apple["fetched_at"], FIXED_ISO)
        self.assertEqual(apple["observed_at"], FIXED_ISO)
        self.assertEqual(self.warehouse.get_company_profile(MICROSOFT_ENTITY)["legal_name"],
                         "Microsoft Corporation")

        for entity_id in (APPLE_ENTITY, MICROSOFT_ENTITY, NVIDIA_ENTITY):
            row = self.entry_row(entity_id)
            self.assertEqual(row["profile_status"], "ready")
            self.assertEqual(row["profile_attempts"], 1)
            self.assertEqual(row["profile_synced_at"], FIXED_ISO)
            self.assertIn(row["profile_error"], (None, ""))
            # Enrichment never rewrites the index payload.
            self.assertTrue(row["payload"]["name"])
            self.assertIn("sec_cik", row["payload"]["provider_ids"])

    def test_batch_limit_bounds_the_number_of_requests(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
            self.entry(NVIDIA_ENTITY, "1045810"),
        ])
        http = FakeHttp({
            APPLE_URL: APPLE_SUBMISSIONS,
            MICROSOFT_URL: MICROSOFT_SUBMISSIONS,
            NVIDIA_URL: NVIDIA_SUBMISSIONS,
        })

        result = company_profile.collect(self.context(http, {"profile_batch_size": 2}))

        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["batch"], 2)
        self.assertEqual(len(http.calls), 2)
        # Entries are processed in (attempts, market, entity_id) order.
        ready = {
            entity for entity in (APPLE_ENTITY, MICROSOFT_ENTITY, NVIDIA_ENTITY)
            if self.entry_row(entity)["profile_status"] == "ready"
        }
        self.assertEqual(ready, {APPLE_ENTITY, MICROSOFT_ENTITY})
        self.assertEqual(self.entry_row(NVIDIA_ENTITY)["profile_status"], "pending")
        self.assertEqual(self.entry_row(NVIDIA_ENTITY)["profile_attempts"], 0)

    def test_integer_cik_payload_is_accepted(self) -> None:
        entry = self.entry(APPLE_ENTITY, "320193")
        entry["payload"]["provider_ids"] = {"sec_cik": 320193}
        self.seed([entry])
        http = FakeHttp({APPLE_URL: APPLE_SUBMISSIONS})

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(http.calls, [(company_profile.SOURCE_ID, APPLE_URL)])
        self.assertIsNotNone(self.warehouse.get_company_profile(APPLE_ENTITY))

    def test_304_reuses_the_cached_raw_document(self) -> None:
        self.seed([self.entry(APPLE_ENTITY, "320193")])
        body_text = json.dumps(APPLE_SUBMISSIONS)
        self.warehouse.record_raw_document({
            "doc_id": "doc-apple",
            "source_id": company_profile.SOURCE_ID,
            "url": APPLE_URL,
            "status": 200,
            "content_type": "application/json",
            "etag": 'W/"v1"',
            "sha256": "deadbeef",
            "body_text": body_text,
            "bytes": len(body_text),
            "fetched_at": CACHED_ISO,
        })
        http = FakeHttp({APPLE_URL: FetchResult(
            url=APPLE_URL, status=304, not_modified=True, fetched_at=FIXED_ISO,
        )})

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "ok")
        apple = self.warehouse.get_company_profile(APPLE_ENTITY)
        self.assertEqual(apple["legal_name"], "Apple Inc.")
        # The source value was observed when the cached document was fetched.
        self.assertEqual(apple["observed_at"], CACHED_ISO)
        self.assertEqual(apple["fetched_at"], FIXED_ISO)
        self.assertEqual(self.entry_row(APPLE_ENTITY)["profile_status"], "ready")


class MissingCikTests(CompanyProfileTestCase):
    """Entries that cannot be enriched are skipped, once and boundedly."""

    def test_entry_without_cik_is_marked_skipped_once(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(TOYOTA_ENTITY, market="XTKS"),
        ])
        http = FakeHttp({APPLE_URL: APPLE_SUBMISSIONS})

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["missing_cik"], 1)
        toyota = self.entry_row(TOYOTA_ENTITY)
        self.assertEqual(toyota["profile_status"], "skipped")
        self.assertEqual(toyota["profile_error"], "no sec cik")
        self.assertEqual(toyota["profile_attempts"], 0)
        self.assertIsNone(self.warehouse.get_company_profile(TOYOTA_ENTITY))

        # A second run does not re-mark the entry and selects nothing.
        second_http = FakeHttp({})
        second = company_profile.collect(self.context(second_http))
        self.assertEqual(second_http.calls, [])
        self.assertEqual(second["skipped"], 0)
        self.assertEqual(second["details"]["missing_cik"], 0)
        self.assertEqual(second["details"]["reason"], "no pending index entries")
        self.assertEqual(self.entry_row(TOYOTA_ENTITY)["profile_status"], "skipped")
        self.assertEqual(self.entry_row(TOYOTA_ENTITY)["profile_attempts"], 0)

    def test_missing_cik_markings_are_bounded_by_the_batch(self) -> None:
        self.seed([self.entry(f"INS:XTKS:{index:04d}", market="XTKS") for index in range(10)])
        http = FakeHttp({})

        result = company_profile.collect(self.context(http, {"profile_batch_size": 2}))

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["details"]["missing_cik"], 2)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(http.calls, [])
        statuses = [self.entry_row(f"INS:XTKS:{index:04d}")["profile_status"] for index in range(10)]
        self.assertEqual(statuses.count("skipped"), 2)
        self.assertEqual(statuses.count("pending"), 8)

    def test_empty_provider_ids_are_skipped(self) -> None:
        entry = self.entry(TOYOTA_ENTITY, market="XTKS")
        entry["payload"]["provider_ids"] = {"sec_cik": ""}
        self.seed([entry])

        result = company_profile.collect(self.context(FakeHttp({})))

        self.assertEqual(result["skipped"], 1)
        self.assertEqual(self.entry_row(TOYOTA_ENTITY)["profile_status"], "skipped")


class FailureTests(CompanyProfileTestCase):
    """Company failures are isolated, retried, then marked failed."""

    def test_transient_error_keeps_pending_then_third_failure_marks_failed(self) -> None:
        self.seed([self.entry(APPLE_ENTITY, "320193")])
        error_text = "SEC submissions timed out"

        for run_index in range(3):
            with self.subTest(run=run_index + 1):
                http = FakeHttp(errors={APPLE_URL: lambda: DataSourceError(error_text)})
                result = company_profile.collect(self.context(http))
                self.assertEqual(result["stored"], 0)
                self.assertEqual(result["status"], "partial")
                self.assertEqual(result["details"]["failed"], [APPLE_ENTITY])
                self.assertEqual(http.calls, [(company_profile.SOURCE_ID, APPLE_URL)])
                row = self.entry_row(APPLE_ENTITY)
                self.assertEqual(row["profile_attempts"], run_index + 1)
                self.assertEqual(row["profile_error"], error_text)
                self.assertEqual(
                    row["profile_status"],
                    "pending" if run_index < 2 else "failed",
                )

        self.assertIsNone(self.warehouse.get_company_profile(APPLE_ENTITY))
        # A failed entry is no longer selected for collection.
        final = company_profile.collect(self.context(FakeHttp({})))
        self.assertEqual(final["details"]["reason"], "no pending index entries")

    def test_max_attempts_setting_fails_after_the_first_error(self) -> None:
        self.seed([self.entry(APPLE_ENTITY, "320193")])
        result = company_profile.collect(self.context(
            FakeHttp(errors={APPLE_URL: DataSourceError("boom")}),
            {"profile_max_attempts": 1},
        ))
        self.assertEqual(result["details"]["attempts"], 1)
        self.assertEqual(self.entry_row(APPLE_ENTITY)["profile_status"], "failed")
        self.assertEqual(self.entry_row(APPLE_ENTITY)["profile_attempts"], 1)

    def test_malformed_payload_is_retried_not_aborted(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
        ])
        http = FakeHttp({
            APPLE_URL: b"<html>blocked</html>",
            MICROSOFT_URL: MICROSOFT_SUBMISSIONS,
        })

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["failed"], [APPLE_ENTITY])
        # The malformed company stays pending; the next company was still stored.
        apple = self.entry_row(APPLE_ENTITY)
        self.assertEqual(apple["profile_status"], "pending")
        self.assertEqual(apple["profile_attempts"], 1)
        self.assertIn("invalid SEC submissions JSON", apple["profile_error"])
        self.assertEqual(self.entry_row(MICROSOFT_ENTITY)["profile_status"], "ready")
        self.assertEqual(self.warehouse.get_company_profile(MICROSOFT_ENTITY)["legal_name"],
                         "Microsoft Corporation")

    def test_rate_limit_stops_the_batch_without_marking_failures(self) -> None:
        self._assert_stop_keeps_entries_pending(
            SourceRateLimitedError("source is busy", retry_after_s=60),
        )

    def test_blocked_source_stops_the_batch_without_marking_failures(self) -> None:
        self._assert_stop_keeps_entries_pending(SourceBlockedError("circuit is open"))

    def _assert_stop_keeps_entries_pending(self, failure: Exception) -> None:
        """First company succeeds, second stops the batch, third is untouched."""
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
            self.entry(NVIDIA_ENTITY, "1045810"),
        ])
        http = FakeHttp({APPLE_URL: APPLE_SUBMISSIONS}, errors={MICROSOFT_URL: failure})

        result = company_profile.collect(self.context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["stopped"], "rate_limited")
        self.assertEqual(result["details"]["failed"], [])
        self.assertEqual(
            [url for _source_id, url in http.calls],
            [APPLE_URL, MICROSOFT_URL],
        )
        self.assertEqual(self.entry_row(APPLE_ENTITY)["profile_status"], "ready")
        microsoft = self.entry_row(MICROSOFT_ENTITY)
        self.assertEqual(microsoft["profile_status"], "pending")
        self.assertEqual(microsoft["profile_attempts"], 0)
        nvidia = self.entry_row(NVIDIA_ENTITY)
        self.assertEqual(nvidia["profile_status"], "pending")
        self.assertEqual(nvidia["profile_attempts"], 0)
        self.assertIsNone(self.warehouse.get_company_profile(MICROSOFT_ENTITY))
        self.assertIsNone(self.warehouse.get_company_profile(NVIDIA_ENTITY))


class DryRunTests(CompanyProfileTestCase):
    """``dry_run`` plans the batch without network or warehouse writes."""

    def test_dry_run_performs_no_fetch_and_writes_nothing(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
            self.entry(TOYOTA_ENTITY, market="XTKS"),
        ])
        http = FakeHttp({
            APPLE_URL: APPLE_SUBMISSIONS,
            MICROSOFT_URL: MICROSOFT_SUBMISSIONS,
        })

        result = company_profile.collect(self.context(http, {"dry_run": True}))

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"], {
            "dry_run": True,
            "planned": [APPLE_ENTITY, MICROSOFT_ENTITY],
        })
        self.assertEqual(result["job_state"]["profiles"], 0)
        self.assertEqual(http.calls, [])
        self.assertEqual(self.warehouse.table_counts()["company_profiles"], 0)
        # Neither candidate nor missing-CIK entries were mutated.
        for entity_id in (APPLE_ENTITY, MICROSOFT_ENTITY, TOYOTA_ENTITY):
            row = self.entry_row(entity_id)
            self.assertEqual(row["profile_status"], "pending")
            self.assertEqual(row["profile_attempts"], 0)
            self.assertIn(row["profile_error"], (None, ""))


class IdempotencyTests(CompanyProfileTestCase):
    """A completed batch is not re-collected on the next run."""

    def test_second_run_after_success_selects_nothing(self) -> None:
        self.seed([
            self.entry(APPLE_ENTITY, "320193"),
            self.entry(MICROSOFT_ENTITY, "789019"),
        ])
        first = company_profile.collect(self.context(FakeHttp({
            APPLE_URL: APPLE_SUBMISSIONS,
            MICROSOFT_URL: MICROSOFT_SUBMISSIONS,
        })))
        self.assertEqual(first["stored"], 2)
        counts_after_first = self.warehouse.table_counts()

        second_http = FakeHttp({})
        second = company_profile.collect(self.context(second_http))

        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["skipped"], 0)
        self.assertEqual(second["status"], "ok")
        self.assertEqual(second["details"]["reason"], "no pending index entries")
        self.assertEqual(second_http.calls, [])
        self.assertEqual(self.warehouse.table_counts(), counts_after_first)
        self.assertEqual(self.warehouse.entries_needing_profiles(company_profile.INDEX_ID, limit=10), [])


class NoOpTests(CompanyProfileTestCase):
    """Runs without work report an explicit reason instead of failing."""

    def test_unknown_index_is_a_no_op(self) -> None:
        warehouse = self.new_warehouse()
        result = company_profile.collect(self.context(FakeHttp({}), warehouse=warehouse))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["reason"], "index not found")
        self.assertEqual(result["details"]["batch"], company_profile.DEFAULT_PROFILE_BATCH)

    def test_registered_index_without_entries_is_a_no_op(self) -> None:
        result = company_profile.collect(self.context(FakeHttp({})))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["details"]["reason"], "no pending index entries")

    def test_settings_are_clamped_to_safe_ranges(self) -> None:
        empty = company_profile.collect(self.context(FakeHttp({}), {"profile_batch_size": 500}))
        self.assertEqual(empty["details"]["batch"], company_profile.PROFILE_BATCH_MAX)

        self.seed([self.entry(APPLE_ENTITY, "320193")])
        result = company_profile.collect(self.context(
            FakeHttp(errors={APPLE_URL: DataSourceError("boom")}),
            {"profile_batch_size": 0, "profile_max_attempts": 99},
        ))
        self.assertEqual(result["details"]["batch"], company_profile.PROFILE_BATCH_MIN)
        self.assertEqual(result["details"]["attempts"], company_profile.MAX_ATTEMPTS_MAX)
        self.assertEqual(self.entry_row(APPLE_ENTITY)["profile_status"], "pending")


if __name__ == "__main__":
    unittest.main()
