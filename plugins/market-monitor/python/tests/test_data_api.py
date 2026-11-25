"""HTTP API tests for the data collection endpoints."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import MarketMonitorService
from market_monitor.data.manager import MarketDataManager
from market_monitor.http_api import create_http_server

TOKEN = "data-route-token-0123456789"


class DataApiTests(unittest.TestCase):
    """End-to-end tests over a real localhost socket with a seeded warehouse."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.service = MarketMonitorService(
            data_dir=cls.tmp.name, provider="synthetic", poll_seconds=15,
        )
        cls.manager = MarketDataManager(
            os.path.join(cls.tmp.name, "warehouse"),
            enabled=True,
            watchlist_provider=lambda: ["AAPL"],
            now_fn=cls.service._now,  # noqa: SLF001 - test wiring
        )
        cls._seed_warehouse(cls.manager)
        cls.service.attach_data_layer(cls.manager)
        # Keep the fixture watchlist small so tracked-series assertions are exact.
        cls.manager.set_watchlist_provider(lambda: ["AAPL"])
        cls.httpd = create_http_server(cls.service, token=TOKEN, port=0)
        cls.shutdown_event = threading.Event()

        def _stop_server() -> None:
            cls.shutdown_event.set()
            cls.httpd.shutdown()

        cls.httpd.shutdown_callback = _stop_server
        cls.thread = threading.Thread(
            target=cls.httpd.serve_forever,
            kwargs={"poll_interval": 0.05},
            daemon=True,
        )
        cls.thread.start()
        cls.port = int(cls.httpd.server_address[1])
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def _seed_warehouse(cls, manager: MarketDataManager) -> None:
        """Insert a small canonical dataset for the endpoint assertions."""
        warehouse = manager.warehouse
        warehouse.upsert_exchanges([{
            "mic": "XNAS", "code": "XNAS", "name": "Nasdaq",
            "country": "US", "timezone": "America/New_York",
            "currency": "USD", "source_id": "test",
        }])
        warehouse.upsert_instruments([{
            "instrument_id": "INS:XNAS:AAPL", "symbol": "AAPL", "mic": "XNAS",
            "name": "Apple Inc.", "type": "stock", "currency": "USD",
            "country": "US", "provider_symbol": "AAPL", "source_id": "test",
        }])
        warehouse.upsert_indices([{
            "index_id": "IDX:GSPC", "code": "GSPC", "name": "S&P 500",
            "region": "US", "currency": "USD", "provider_symbol": "^GSPC",
            "source_id": "test",
        }])
        warehouse.upsert_commodity_roots([{
            "root_id": "COM:XCEC:GC", "venue": "XCEC", "root": "GC",
            "name": "Gold futures", "category": "metals", "unit": "troy ounce",
            "currency": "USD", "provider_symbol": "GC=F", "source_id": "test",
        }])
        warehouse.upsert_aliases([
            {"alias": "AAPL", "entity_type": "instrument",
             "entity_id": "INS:XNAS:AAPL", "alias_type": "symbol"},
        ])
        warehouse.register_index({
            "index_id": "company:master", "name": "Company master index",
            "kind": "company_master", "markets": ["XNAS"],
            "source_ids": ["sec-edgar"], "refresh_interval_s": 86400,
        })
        warehouse.apply_index_snapshot("company:master", [{
            "entry_key": "INS:XNAS:AAPL", "entity_type": "instrument",
            "entity_id": "INS:XNAS:AAPL", "market": "XNAS",
            "payload": {"name": "Apple Inc.", "symbol": "AAPL",
                        "provider_ids": {"sec_cik": "320193"}},
            "profile_status": "ready",
        }], source_id="sec-edgar")
        warehouse.upsert_company_profile({
            "entity_id": "INS:XNAS:AAPL", "market": "XNAS",
            "legal_name": "Apple Inc.", "sic": "3571",
            "sic_description": "Electronic Computers", "tickers": ["AAPL"],
            "exchanges": ["Nasdaq"], "source_id": "sec-submissions",
        })
        warehouse.register_index({
            "index_id": "china:securities", "name": "China securities index",
            "kind": "china_securities", "markets": ["XSHG", "XSHE"],
            "source_ids": ["eastmoney"], "refresh_interval_s": 86400,
        })
        warehouse.apply_index_snapshot("china:securities", [{
            "entry_key": "INS:XSHG:600519", "entity_type": "instrument",
            "entity_id": "INS:XSHG:600519", "market": "XSHG",
            "payload": {"name": "Kweichow Moutai", "name_zh": "贵州茅台",
                        "symbol": "600519", "instrument_type": "stock",
                        "provider_symbol": "600519.SS", "market_cap": 1.8e12},
            "profile_status": "ready",
        }, {
            "entry_key": "INS:XSHG:510300", "entity_type": "instrument",
            "entity_id": "INS:XSHG:510300", "market": "XSHG",
            "payload": {"name": "CSI 300 ETF", "name_zh": "沪深300ETF",
                        "symbol": "510300", "instrument_type": "etf",
                        "provider_symbol": "510300.SS", "market_cap": 1.0e11},
            "profile_status": "ready",
        }], source_id="eastmoney")
        warehouse.register_index({
            "index_id": "china:commodities", "name": "China commodity index",
            "kind": "china_commodities", "markets": ["XSHF"],
            "source_ids": ["seed"], "refresh_interval_s": 2592000,
        })
        warehouse.apply_index_snapshot("china:commodities", [{
            "entry_key": "COM:XSHF:AU", "entity_type": "commodity_root",
            "entity_id": "COM:XSHF:AU", "market": "XSHF",
            "payload": {"name": "Gold futures (SHFE)", "name_zh": "黄金连续",
                        "root": "AU", "venue": "XSHF",
                        "provider_symbol": "AU0"},
            "profile_status": "ready",
        }], source_id="seed")
        warehouse.upsert_commodity_roots([{
            "root_id": "COM:XSHF:AU", "venue": "XSHF", "root": "AU",
            "name": "Gold futures (SHFE)", "category": "metals", "unit": "gram",
            "currency": "CNY", "provider_symbol": "AU0", "source_id": "seed",
        }])
        warehouse.upsert_quote_latest([{
            "series_id": "INS:XSHG:600519", "ts": "2026-11-24T07:00:00Z",
            "price": 1500.5, "prev_close": 1480.0, "change_pct": 1.39,
            "volume": 1000, "currency": "CNY", "source_id": "yahoo-finance",
        }, {
            "series_id": "COM:XSHF:AU", "ts": "2026-11-24T07:00:00Z",
            "price": 580.2, "prev_close": 582.0, "change_pct": -0.31,
            "volume": 2000, "currency": "CNY", "source_id": "sina-futures",
        }])
        warehouse.upsert_bars([{
            "series_id": "INS:XNAS:AAPL", "interval": "1d", "ts": "2026-11-20",
            "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10,
        }, {
            "series_id": "INS:XNAS:AAPL", "interval": "1d", "ts": "2026-11-21",
            "open": 1.5, "high": 2.5, "low": 1.2, "close": 2.2, "volume": 12,
        }], "yahoo-finance")
        warehouse.upsert_quote_latest([{
            "series_id": "INS:XNAS:AAPL", "ts": "2026-11-21T18:00:00Z",
            "price": 2.2, "prev_close": 1.5, "change_pct": 46.7,
            "volume": 12, "currency": "USD", "source_id": "yahoo-finance",
        }])
        warehouse.upsert_news_sources([{
            "source_id": "cnbc-rss", "name": "CNBC", "kind": "news-rss",
            "language": "en", "feed_url": "https://example.test/rss",
        }])
        warehouse.insert_news_articles([{
            "article_id": "article-1", "source_id": "cnbc-rss",
            "url": "https://example.test/a", "canonical_url": "https://example.test/a",
            "title": "Apple beats estimates", "summary": "Strong quarter",
            "language": "en", "published_at": "2026-11-20T12:00:00Z",
        }])
        warehouse.link_news_entities("article-1", [{
            "entity_type": "instrument", "entity_id": "INS:XNAS:AAPL",
            "confidence": 0.85, "method": "symbol",
        }])

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.thread.is_alive():
            cls.httpd.shutdown()
        cls.thread.join(timeout=5)
        cls.httpd.server_close()
        cls.service.close()
        cls.tmp.cleanup()

    def request(
        self, path: str, *, method: str = "GET", body: object | None = None,
        token: str | None = TOKEN,
    ) -> tuple[int, object]:
        """Perform one authenticated request and decode JSON."""
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if token is not None:
            request.add_header("x-mm-token", token)
        if data is not None:
            request.add_header("content-type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_data_status_reports_platform_storage_layout(self) -> None:
        status, payload = self.request("/api/v1/data/status")
        self.assertEqual(status, 200)
        storage = payload["storage"]
        self.assertIn("platform", storage)
        self.assertIn("sqlite", storage)
        self.assertEqual(storage["paths"]["data_dir"], str(self.manager.data_dir))
        self.assertTrue(storage["paths"]["cache_db"].endswith("market-monitor.db"))
        self.assertTrue(storage["paths"]["warehouse_db"].endswith("warehouse.db"))

    def test_backfill_status_reports_recent_window_coverage(self) -> None:
        status, payload = self.request("/api/v1/data/backfill")
        self.assertEqual(status, 200)
        self.assertEqual(payload["window"]["days"], 30)
        self.assertGreaterEqual(payload["universe"], 1)
        self.assertGreaterEqual(payload["needs_fill"], 1)
        series_ids = {row["series_id"] for row in payload["needs"]}
        self.assertIn("INS:XNAS:AAPL", series_ids)
        self.assertIn("job", payload)

    def test_data_endpoints_require_auth(self) -> None:
        status, payload = self.request("/api/v1/data/coverage", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")

    def test_catalog_reads_persisted_reference_rows(self) -> None:
        status, payload = self.request("/api/v1/catalog?q=Apple&limit=5")
        self.assertEqual(status, 200)
        self.assertEqual(payload.get("source"), "warehouse")
        self.assertEqual(payload["items"][0]["symbol"], "AAPL")
        self.assertEqual(payload["items"][0]["exchange"], "XNAS")

    def test_coverage_reports_all_domains(self) -> None:
        status, payload = self.request("/api/v1/data/coverage")
        self.assertEqual(status, 200)
        domains = payload["domains"]
        self.assertEqual(domains["reference"]["instruments"], 1)
        self.assertEqual(domains["reference"]["indices"], 1)
        self.assertEqual(domains["reference"]["commodity_roots"], 2)
        self.assertEqual(domains["market"]["bars"], 2)
        self.assertEqual(domains["news"]["articles"], 1)
        self.assertEqual(domains["news"]["entity_links"], 1)
        self.assertEqual(domains["index"]["indices"], 3)
        self.assertGreaterEqual(domains["index"]["entries"], 4)
        self.assertGreaterEqual(domains["index"]["changes"], 1)
        self.assertTrue(payload["jobs"])

    def test_china_overview_reads_persisted_index_and_quotes(self) -> None:
        status, payload = self.request("/api/v1/china/overview")
        self.assertEqual(status, 200)
        self.assertTrue(payload["securities"]["ready"])
        self.assertEqual(payload["securities"]["stats"]["by_type"], {"stock": 1, "etf": 1})
        self.assertTrue(payload["commodities"]["ready"])
        self.assertEqual(payload["top_stocks"][0]["symbol"], "600519")
        self.assertAlmostEqual(payload["top_stocks"][0]["price"], 1500.5)
        self.assertEqual(payload["top_funds"][0]["symbol"], "510300")
        self.assertEqual(payload["top_commodities"][0]["symbol"], "AU0")
        self.assertAlmostEqual(payload["top_commodities"][0]["price"], 580.2)

    def test_status_lists_jobs_sources_and_tracked_universe(self) -> None:
        status, payload = self.request("/api/v1/data/status")
        self.assertEqual(status, 200)
        job_ids = {job["job_id"] for job in payload["jobs"]}
        self.assertIn("market:live", job_ids)
        self.assertIn("news:rss", job_ids)
        self.assertIn("company:index", job_ids)
        self.assertIn("company:profile", job_ids)
        source_ids = {source["source_id"] for source in payload["sources"]}
        self.assertIn("yahoo-finance", source_ids)
        self.assertIn("cnbc-rss", source_ids)
        self.assertIn("sec-submissions", source_ids)
        self.assertEqual(payload["tracked"]["live"], 4)  # AAPL + index + 2 commodity roots
        self.assertFalse(payload["running"])

    def test_index_registry_entries_and_company_profile(self) -> None:
        status, payload = self.request("/api/v1/index")
        self.assertEqual(status, 200)
        index_ids = {index["index_id"] for index in payload["indices"]}
        self.assertIn("company:master", index_ids)
        company = next(index for index in payload["indices"] if index["index_id"] == "company:master")
        self.assertEqual(company["stats"]["total"], 1)
        self.assertEqual(company["stats"]["active"], 1)
        self.assertEqual(company["stats"]["by_market"], {"XNAS": 1})

        status, payload = self.request("/api/v1/index/company")
        self.assertEqual(status, 200)
        self.assertEqual(payload["index"]["index_id"], "company:master")
        self.assertEqual(payload["stats"]["active"], 1)

        status, payload = self.request("/api/v1/index/company:master/entries?market=XNAS")
        self.assertEqual(status, 200)
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["entries"][0]["entity_id"], "INS:XNAS:AAPL")
        self.assertEqual(payload["entries"][0]["payload"]["provider_ids"]["sec_cik"], "320193")

        status, payload = self.request("/api/v1/index/company:master/changes")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(payload["changes"]), 1)
        self.assertEqual(payload["changes"][0]["change_type"], "added")

        status, payload = self.request("/api/v1/company/INS:XNAS:AAPL/profile")
        self.assertEqual(status, 200)
        self.assertEqual(payload["entry"]["entity_id"], "INS:XNAS:AAPL")
        self.assertEqual(payload["profile"]["legal_name"], "Apple Inc.")

    def test_index_refresh_dry_run_does_not_touch_sources(self) -> None:
        status, payload = self.request(
            "/api/v1/index/company:master/refresh", method="POST", body={"dry_run": True},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["dry_run"])
        self.assertEqual(payload["result"]["status"], "ok")

    def test_unknown_index_and_entity_return_not_found(self) -> None:
        status, payload = self.request("/api/v1/index/missing:index/entries")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")
        status, payload = self.request("/api/v1/company/INS:XNAS:ZZZZ/profile")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")

    def test_sources_and_runs(self) -> None:
        status, payload = self.request("/api/v1/data/sources")
        self.assertEqual(status, 200)
        yahoo = next(source for source in payload["sources"] if source["source_id"] == "yahoo-finance")
        self.assertGreater(yahoo["max_per_day"], 0)
        self.assertEqual(yahoo["remaining_day"], yahoo["max_per_day"])
        status, payload = self.request("/api/v1/data/runs?limit=5")
        self.assertEqual(status, 200)
        self.assertIsInstance(payload["runs"], list)

    def test_ingest_dry_run_plans_without_network(self) -> None:
        status, payload = self.request(
            "/api/v1/data/ingest", method="POST", body={"dry_run": True},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["dry_run"])
        planned = {item["job_id"] for item in payload["planned"]}
        self.assertIn("market:live", planned)
        self.assertEqual(payload["results"], [])

    def test_news_endpoints(self) -> None:
        status, payload = self.request("/api/v1/news?entity_id=INS:XNAS:AAPL")
        self.assertEqual(status, 200)
        self.assertEqual(payload["count"], 1)
        article = payload["articles"][0]
        self.assertEqual(article["title"], "Apple beats estimates")
        self.assertEqual(article["publish_time"], "2026-11-20T12:00:00Z")
        self.assertEqual(article["content"], "Strong quarter")
        self.assertTrue(article["collected_at"])
        self.assertEqual(article["entities"][0]["entity_id"], "INS:XNAS:AAPL")
        status, payload = self.request("/api/v1/news/article-1")
        self.assertEqual(status, 200)
        self.assertEqual(payload["article"]["article_id"], "article-1")
        status, payload = self.request("/api/v1/news/missing")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")

    def test_reference_endpoints(self) -> None:
        status, payload = self.request("/api/v1/ref/exchanges")
        self.assertEqual(status, 200)
        self.assertEqual(payload["exchanges"][0]["mic"], "XNAS")
        status, payload = self.request("/api/v1/ref/instruments?mic=XNAS&q=apple")
        self.assertEqual(status, 200)
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["instruments"][0]["instrument_id"], "INS:XNAS:AAPL")
        status, payload = self.request("/api/v1/ref/indices")
        self.assertEqual(status, 200)
        self.assertEqual(payload["indices"][0]["index_id"], "IDX:GSPC")
        status, payload = self.request("/api/v1/ref/commodities")
        self.assertEqual(status, 200)
        self.assertEqual(payload["roots"][0]["root_id"], "COM:XCEC:GC")

    def test_series_bars_and_validation(self) -> None:
        status, payload = self.request("/api/v1/series/INS:XNAS:AAPL/bars?interval=1d&limit=10")
        self.assertEqual(status, 200)
        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["bars"][-1]["c"], 2.2)
        status, payload = self.request("/api/v1/series/INS:XNAS:MISSING/bars")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")
        status, payload = self.request(
            "/api/v1/data/ingest", method="POST", body={"job_id": "missing:job"},
        )
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
