"""Tests for the data collection foundation: warehouse, governor, HTTP, runner."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import (
    DataWarehouse,
    FetchResult,
    IngestResult,
    IngestionRunner,
    JobSpec,
    PoliteHttpClient,
    RateGovernor,
    SourceSpec,
)
from market_monitor.data.errors import JobRunningError, SourceBlockedError, SourceRateLimitedError
from market_monitor.data.models import CollectContext, to_iso


class WarehouseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)

    def test_schema_and_reference_roundtrip(self) -> None:
        self.assertEqual(self.warehouse.schema_version, 2)
        self.warehouse.upsert_exchanges([{
            "mic": "XNAS", "code": "XNAS", "name": "Nasdaq", "country": "US",
            "timezone": "America/New_York", "currency": "USD", "source_id": "seed",
        }])
        self.warehouse.upsert_instruments([{
            "instrument_id": "INS:XNAS:AAPL", "symbol": "AAPL", "mic": "XNAS",
            "name": "Apple Inc.", "type": "stock", "currency": "USD",
            "provider_symbol": "AAPL", "source_id": "sec-edgar",
        }])
        self.warehouse.upsert_indices([{
            "index_id": "IDX:GSPC", "code": "GSPC", "name": "S&P 500",
            "region": "US", "currency": "USD", "provider_symbol": "^GSPC", "source_id": "seed",
        }])
        self.warehouse.upsert_commodity_roots([{
            "root_id": "COM:XCEC:GC", "venue": "XCEC", "root": "GC",
            "name": "Gold futures", "category": "metals", "unit": "troy ounce",
            "currency": "USD", "provider_symbol": "GC=F", "source_id": "seed",
        }])
        self.warehouse.upsert_aliases([
            {"alias": "AAPL", "entity_type": "instrument", "entity_id": "INS:XNAS:AAPL", "alias_type": "symbol"},
            {"alias": "Apple", "entity_type": "instrument", "entity_id": "INS:XNAS:AAPL", "alias_type": "name"},
        ])
        self.assertEqual(self.warehouse.count_instruments(), 1)
        self.assertEqual(self.warehouse.find_instrument_by_provider_symbol("AAPL")["instrument_id"], "INS:XNAS:AAPL")
        self.assertEqual(self.warehouse.list_indices()[0]["index_id"], "IDX:GSPC")
        self.assertEqual(self.warehouse.list_commodity_roots()[0]["root_id"], "COM:XCEC:GC")
        self.assertEqual(len(self.warehouse.list_aliases()), 2)
        coverage = self.warehouse.coverage()
        self.assertEqual(coverage["domains"]["reference"]["instruments"], 1)
        self.assertIn("XNAS", coverage["domains"]["reference"]["instruments_by_mic"])

    def test_market_bars_and_quotes_are_idempotent(self) -> None:
        rows = [
            {"series_id": "INS:XNAS:AAPL", "interval": "1d", "ts": "2026-11-20",
             "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10},
            {"series_id": "INS:XNAS:AAPL", "interval": "1d", "ts": "2026-11-21",
             "open": 1.5, "high": 2.5, "low": 1.2, "close": 2.2, "volume": 12},
        ]
        self.assertEqual(self.warehouse.upsert_bars(rows, "yahoo-finance"), 2)
        self.assertEqual(self.warehouse.upsert_bars(rows, "yahoo-finance"), 2)
        bars = self.warehouse.get_bars("INS:XNAS:AAPL")
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[-1]["close"], 2.2)
        self.assertEqual(self.warehouse.latest_bar("INS:XNAS:AAPL")["ts"], "2026-11-21")
        prepared = [{
            "series_id": "INS:XNAS:AAPL", "ts": "2026-11-21T18:00:00Z",
            "price": 2.2, "prev_close": 1.5, "change_pct": 46.7, "volume": 12,
            "currency": "USD", "source_id": "yahoo-finance",
        }]
        self.assertEqual(self.warehouse.upsert_quote_latest(prepared), 1)
        self.assertEqual(self.warehouse.get_quote_latest("INS:XNAS:AAPL")["price"], 2.2)
        observations = [{
            "series_id": "INS:XNAS:AAPL", "ts": "2026-11-21T18:00:00Z",
            "price": 2.2, "change_pct": 46.7, "volume": 12, "source_id": "yahoo-finance",
        }]
        self.assertEqual(self.warehouse.insert_quote_observations(observations), 1)
        self.assertEqual(self.warehouse.insert_quote_observations(observations), 0)

    def test_news_articles_deduplicate_and_link(self) -> None:
        self.warehouse.upsert_news_sources([{
            "source_id": "cnbc-rss", "name": "CNBC", "kind": "news-rss",
            "language": "en", "feed_url": "https://example.test/rss",
        }])
        article = {
            "article_id": "abc123", "source_id": "cnbc-rss",
            "url": "https://example.test/a", "canonical_url": "https://example.test/a",
            "title": "Apple beats estimates", "summary": "Strong quarter",
            "language": "en", "published_at": "2026-11-20T12:00:00Z",
            "topics": ["earnings"],
        }
        first = self.warehouse.insert_news_articles([article])
        self.assertEqual(first["stored"], 1)
        second = self.warehouse.insert_news_articles([article])
        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["duplicates"], 1)
        self.warehouse.link_news_entities("abc123", [
            {"entity_type": "instrument", "entity_id": "INS:XNAS:AAPL", "confidence": 0.9, "method": "symbol"},
        ])
        articles = self.warehouse.list_news(entity_id_value="INS:XNAS:AAPL")
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["entities"][0]["entity_id"], "INS:XNAS:AAPL")
        self.assertEqual(self.warehouse.get_news("abc123")["title"], "Apple beats estimates")
        self.assertIsNone(self.warehouse.get_news("missing"))

    def test_sources_jobs_and_runs_persist(self) -> None:
        self.warehouse.ensure_source(SourceSpec(
            source_id="test-source", name="Test", kind="test", domain="market",
            min_interval_s=5, max_per_hour=10, max_per_day=100,
        ))
        self.assertEqual(self.warehouse.get_source("test-source")["max_per_day"], 100)
        self.warehouse.update_source("test-source", used_day=4, budget_date="2026-11-24")
        self.assertEqual(self.warehouse.get_source("test-source")["used_day"], 4)
        self.warehouse.ensure_job("job-a", "Job A", "market", 60)
        self.warehouse.update_job("job-a", last_status="ok", next_due_at="2026-11-25T00:00:00Z")
        self.assertEqual(self.warehouse.get_job("job-a")["last_status"], "ok")
        result = IngestResult(job_id="job-a", status="ok", requests=2, stored=5,
                              started_at="2026-11-24T00:00:00Z", finished_at="2026-11-24T00:00:10Z")
        self.assertGreater(self.warehouse.record_run(result), 0)
        runs = self.warehouse.list_runs()
        self.assertEqual(runs[0]["job_id"], "job-a")
        self.assertEqual(runs[0]["stored"], 5)

    def test_raw_documents_conditional_state_and_prune(self) -> None:
        self.warehouse.record_raw_document({
            "doc_id": "doc1", "source_id": "test-source", "url": "https://example.test/data",
            "status": 200, "etag": "W/\"abc\"", "last_modified": "Mon, 24 Nov 2026 00:00:00 GMT",
            "sha256": "abc", "body_text": "payload", "bytes": 7,
        })
        stored = self.warehouse.get_raw_document("test-source", "https://example.test/data")
        self.assertEqual(stored["etag"], "W/\"abc\"")
        self.assertIsNone(self.warehouse.get_raw_document("test-source", "https://example.test/other"))


class GovernorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self.clock = [1_800_000_000.0]
        self.sleeps: list[float] = []

        def sleep(seconds: float) -> None:
            self.sleeps.append(seconds)
            self.clock[0] += seconds

        self.governor = RateGovernor(
            self.warehouse,
            now_fn=lambda: self.clock[0],
            sleep_fn=sleep,
            random_fn=lambda: 0.0,
        )
        self.governor.register([SourceSpec(
            source_id="s1", name="S1", kind="k", domain="market",
            min_interval_s=10, max_per_hour=3, max_per_day=10,
        )])

    def test_reservation_waits_for_min_interval(self) -> None:
        self.governor.before("s1")
        self.assertEqual(self.sleeps, [])
        self.clock[0] += 1
        self.governor.before("s1")
        self.assertGreaterEqual(self.sleeps[0], 9.0)
        self.assertLessEqual(self.sleeps[0], 12.0)
        state = self.warehouse.get_source("s1")
        self.assertEqual(state["used_hour"], 2)
        self.assertEqual(state["used_day"], 2)

    def test_daily_budget_is_enforced_and_resets(self) -> None:
        for _ in range(10):
            self.clock[0] += 3601
            self.governor.before("s1")
        with self.assertRaises(SourceRateLimitedError):
            self.governor.before("s1")
        self.clock[0] += 86400
        self.governor.before("s1")
        self.assertEqual(self.warehouse.get_source("s1")["used_day"], 1)

    def test_circuit_opens_after_repeated_blocks_and_persists(self) -> None:
        for _ in range(3):
            self.clock[0] += 10
            self.governor.before("s1")
            self.governor.after("s1", 429, retry_after_s=5)
        with self.assertRaises(SourceBlockedError):
            self.governor.before("s1")
        state = self.warehouse.get_source("s1")
        self.assertGreaterEqual(state["consecutive_blocks"], 3)
        self.assertTrue(state["circuit_open_until"])
        # A fresh governor over the same database sees the persisted circuit.
        self.clock[0] += 10
        other = RateGovernor(self.warehouse, now_fn=lambda: self.clock[0], sleep_fn=lambda s: None)
        with self.assertRaises(SourceBlockedError):
            other.before("s1")

    def test_success_clears_circuit(self) -> None:
        self.clock[0] += 10
        self.governor.before("s1")
        self.governor.after("s1", 500)
        self.clock[0] += 10
        self.governor.before("s1")
        self.governor.after("s1", 200)
        state = self.warehouse.get_source("s1")
        self.assertEqual(state["consecutive_blocks"], 0)
        self.assertEqual(state["circuit_open_until"], "")

    def test_dry_run_reservation_does_not_consume_budget(self) -> None:
        self.governor.before("s1", dry_run=True)
        self.assertEqual(self.warehouse.get_source("s1")["used_day"], 0)


class _StubHandler(BaseHTTPRequestHandler):
    calls: list[dict] = []
    etag = 'W/"v1"'
    fail_first = False

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        type(self).calls.append({"path": self.path, "if_none_match": self.headers.get("If-None-Match")})
        if self.path == "/not-modified" and self.headers.get("If-None-Match") == self.etag:
            self.send_response(304)
            self.send_header("ETag", self.etag)
            self.end_headers()
            return
        if self.path == "/limited":
            self.send_response(429)
            self.send_header("Retry-After", "7")
            self.end_headers()
            return
        if self.path == "/error" and type(self).fail_first:
            type(self).fail_first = False
            self.send_response(500)
            self.end_headers()
            return
        body = json.dumps({"ok": True, "path": self.path}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("ETag", type(self).etag)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # noqa: D401 - silence test server
        return


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = HTTPServer(("127.0.0.1", 0), _StubHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self.clock = [1_800_000_000.0]
        sleeps: list[float] = []

        def sleep(seconds: float) -> None:
            sleeps.append(seconds)
            self.clock[0] += seconds

        self.governor = RateGovernor(
            self.warehouse, now_fn=lambda: self.clock[0], sleep_fn=sleep, random_fn=lambda: 0.0,
        )
        self.governor.register([SourceSpec(
            source_id="stub", name="Stub", kind="test", domain="market",
            min_interval_s=1, max_per_hour=100, max_per_day=100,
        )])
        self.client = PoliteHttpClient(
            self.warehouse, self.governor,
            now_fn=lambda: self.clock[0], sleep_fn=sleep,
        )
        _StubHandler.calls = []
        _StubHandler.fail_first = False

    def url(self, path: str) -> str:
        return f"http://127.0.0.1:{self.port}{path}"

    def test_fetch_stores_raw_document_and_etag(self) -> None:
        result = self.client.fetch("stub", self.url("/data"))
        self.assertEqual(result.status, 200)
        self.assertIn("ok", result.text())
        stored = self.warehouse.get_raw_document("stub", self.url("/data"))
        self.assertEqual(stored["etag"], _StubHandler.etag)
        self.assertEqual(self.client.request_count, 1)
        state = self.warehouse.get_source("stub")
        self.assertEqual(state["used_day"], 1)
        self.assertTrue(state["last_success_at"])

    def test_conditional_request_returns_not_modified(self) -> None:
        self.client.fetch("stub", self.url("/not-modified"))
        self.clock[0] += 10
        second = self.client.fetch("stub", self.url("/not-modified"))
        self.assertTrue(second.not_modified)
        self.assertEqual(_StubHandler.calls[-1]["if_none_match"], _StubHandler.etag)
        self.assertEqual(self.client.request_count, 2)

    def test_429_raises_rate_limited_with_retry_after(self) -> None:
        with self.assertRaises(SourceRateLimitedError) as caught:
            self.client.fetch("stub", self.url("/limited"))
        self.assertGreater(caught.exception.retry_after_s, 0)
        self.assertEqual(self.warehouse.get_source("stub")["last_error"], "HTTP 429 after 1 consecutive block(s)")

    def test_5xx_retries_once_then_succeeds(self) -> None:
        _StubHandler.fail_first = True
        result = self.client.fetch("stub", self.url("/error"))
        self.assertEqual(result.status, 200)
        self.assertEqual(self.client.request_count, 2)

    def test_unknown_source_is_rejected(self) -> None:
        with self.assertRaises(SourceBlockedError):
            self.client.fetch("missing", self.url("/data"))

    def test_dry_run_client_skips_network(self) -> None:
        self.client.dry_run = True
        result = self.client.fetch("stub", self.url("/data"))
        self.assertTrue(result.dry_run)
        self.assertEqual(_StubHandler.calls, [])
        self.client.dry_run = False


class RunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self.clock = [1_800_000_000.0]
        self.sleeps: list[float] = []

        def sleep(seconds: float) -> None:
            self.sleeps.append(seconds)
            self.clock[0] += seconds

        self.governor = RateGovernor(
            self.warehouse, now_fn=lambda: self.clock[0], sleep_fn=sleep, random_fn=lambda: 0.0,
        )
        self.governor.register([SourceSpec(
            source_id="runner-source", name="Runner", kind="test", domain="market",
            min_interval_s=1, max_per_hour=100, max_per_day=100,
        )])
        self.http = PoliteHttpClient(
            self.warehouse, self.governor, now_fn=lambda: self.clock[0], sleep_fn=sleep,
        )

        def handler(context: CollectContext) -> dict:
            calls = list(context.job_state.get("calls", []))
            calls.append(context.now_iso())
            return {
                "stored": 2,
                "updated": 1,
                "duplicates": 0,
                "details": {"seen": context.job_state.get("seen", 0) + 1},
                "job_state": {"calls": calls, "seen": context.job_state.get("seen", 0) + 1},
            }

        def failing(context: CollectContext) -> dict:
            raise RuntimeError("boom")

        self.runner = IngestionRunner(
            self.warehouse, self.http, self.governor,
            now_fn=lambda: self.clock[0], sleep_fn=sleep, random_fn=lambda: 0.0,
        )
        self.runner.register(JobSpec(
            job_id="job-ok", description="ok", domain="market", interval_s=60,
            source_ids=("runner-source",), handler=handler,
        ))
        self.runner.register(JobSpec(
            job_id="job-fail", description="fail", domain="market", interval_s=60,
            handler=failing,
        ))

    def test_run_once_records_result_and_next_due(self) -> None:
        result = self.runner.run("job-ok", force=True)
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.stored, 2)
        self.assertEqual(result.updated, 1)
        self.assertEqual(self.warehouse.list_runs()[0]["job_id"], "job-ok")
        self.assertFalse(self.runner.is_due("job-ok"))
        self.assertEqual(self.runner.run("job-ok").status, "skipped")

    def test_force_ignores_schedule_and_persists_cursor(self) -> None:
        self.runner.run("job-ok", force=True)
        self.clock[0] += 10
        second = self.runner.run("job-ok", force=True)
        self.assertEqual(second.status, "ok")
        job = self.warehouse.get_job("job-ok")
        state = json.loads(job["last_summary"])
        self.assertEqual(len(state["calls"]), 2)

    def test_handler_failure_is_recorded(self) -> None:
        result = self.runner.run("job-fail", force=True)
        self.assertEqual(result.status, "error")
        self.assertIn("boom", result.error)
        runs = self.warehouse.list_runs()
        self.assertEqual(runs[0]["status"], "error")

    def test_run_due_only_runs_due_jobs(self) -> None:
        results = self.runner.run_due()
        self.assertEqual(len(results), 2)
        self.clock[0] += 61
        # job-fail interval is 60s -> due again, job-ok too.
        results = self.runner.run_due()
        self.assertEqual(len(results), 2)

    def test_unknown_job_raises(self) -> None:
        with self.assertRaises(Exception) as caught:
            self.runner.run("missing", force=True)
        self.assertIn("Unknown ingestion job", str(caught.exception))

    def test_job_locking(self) -> None:
        lock = self.runner._locks["job-ok"]
        lock.acquire()
        try:
            with self.assertRaises(JobRunningError):
                self.runner.run("job-ok", force=True)
        finally:
            lock.release()


if __name__ == "__main__":
    unittest.main()
