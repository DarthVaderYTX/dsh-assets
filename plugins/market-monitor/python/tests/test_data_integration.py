"""Integration tests for the data manager, tracked universe and cache handoff.

These run entirely offline: the seed reference job reads bundled JSON, and the
network collectors are either planned (dry run) or stubbed.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import MarketMonitorService
from market_monitor.data.manager import MarketDataManager


class DataManagerIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.watchlist = ["AAPL", "^GSPC", "GC=F", "BTC-USD"]
        self.manager = MarketDataManager(
            os.path.join(self.tmp.name, "warehouse"),
            enabled=True,
            watchlist_provider=lambda: self.watchlist,
        )
        self.addCleanup(self.manager.stop)

    def test_seed_reference_job_is_offline_and_populates_all_domains(self) -> None:
        result = self.manager.runner.run("reference:seed", force=True)
        self.assertEqual(result.status, "ok", result.error)
        self.assertGreater(result.stored, 100)
        coverage = self.manager.coverage()["domains"]["reference"]
        self.assertGreaterEqual(coverage["exchanges"], 12)
        self.assertGreaterEqual(coverage["instruments"], 80)
        self.assertGreaterEqual(coverage["indices"], 20)
        self.assertGreaterEqual(coverage["commodity_roots"], 12)
        self.assertGreaterEqual(coverage["commodity_contracts"], 100)

    def test_backfill_job_is_dry_runnable_without_network(self) -> None:
        result = self.manager.runner.run("backfill:recent", force=True, dry_run=True)
        self.assertEqual(result.status, "ok", result.error)
        self.assertTrue(result.details.get("dry_run"))
        self.assertEqual(self.manager.http.request_count, 0)
        status = self.manager.backfill_status()
        self.assertEqual(status["window"]["days"], 30)
        self.assertGreaterEqual(status["universe"], 1)

    def test_multi_channel_jobs_are_dry_runnable_without_network(self) -> None:
        for job_id in ("market:backup:quotes", "market:backup:eod"):
            result = self.manager.runner.run(job_id, force=True, dry_run=True)
            self.assertEqual(result.status, "ok", result.error)
            self.assertTrue(result.details.get("dry_run"))
        self.assertEqual(self.manager.http.request_count, 0)

    def test_company_index_job_is_dry_runnable_without_network(self) -> None:
        result = self.manager.runner.run("company:index", force=True, dry_run=True)
        self.assertEqual(result.status, "ok", result.error)
        self.assertTrue(result.details.get("dry_run"))
        self.assertEqual(self.manager.http.request_count, 0)

    def test_manager_index_surface_reads_entries_and_profiles(self) -> None:
        warehouse = self.manager.warehouse
        warehouse.register_index({
            "index_id": "company:master", "name": "Company master index",
            "kind": "company_master", "markets": ["XNAS"],
            "source_ids": ["sec-edgar"], "refresh_interval_s": 86400,
        })
        warehouse.apply_index_snapshot("company:master", [{
            "entry_key": "INS:XNAS:AAPL", "entity_type": "instrument",
            "entity_id": "INS:XNAS:AAPL", "market": "XNAS",
            "payload": {"name": "Apple Inc.", "provider_ids": {"sec_cik": "320193"}},
            "profile_status": "ready",
        }], source_id="sec-edgar")
        warehouse.upsert_company_profile({
            "entity_id": "INS:XNAS:AAPL", "market": "XNAS",
            "legal_name": "Apple Inc.", "sic": "3571", "tickers": ["AAPL"],
            "source_id": "sec-submissions",
        })
        overview = self.manager.index_overview()
        self.assertEqual([item["index_id"] for item in overview["indices"]], ["company:master"])
        company = self.manager.company_index()
        self.assertEqual(company["stats"]["active"], 1)
        entries = self.manager.index_entries("company:master", market="XNAS")
        self.assertEqual(entries["entries"][0]["entity_id"], "INS:XNAS:AAPL")
        profile = self.manager.company_profile("INS:XNAS:AAPL")
        self.assertEqual(profile["profile"]["legal_name"], "Apple Inc.")
        changes = self.manager.index_changes("company:master")
        self.assertEqual(changes["changes"][0]["change_type"], "added")

    def test_commodity_quote_falls_back_to_persisted_bars(self) -> None:
        warehouse = self.manager.warehouse
        warehouse.upsert_commodity_roots([{
            "root_id": "COM:XSHF:AU", "venue": "XSHF", "root": "AU",
            "name": "Gold futures (SHFE)", "category": "metals", "unit": "gram",
            "currency": "CNY", "provider_symbol": "AU0", "source_id": "seed",
        }])
        warehouse.upsert_bars([{
            "series_id": "COM:XSHF:AU", "interval": "1d", "ts": "2026-11-21",
            "open": 570.0, "high": 575.0, "low": 568.0, "close": 572.0,
            "volume": 1000, "source_id": "sina-futures", "quality": "final",
        }, {
            "series_id": "COM:XSHF:AU", "interval": "1d", "ts": "2026-11-24",
            "open": 574.0, "high": 585.0, "low": 574.0, "close": 580.0,
            "volume": 2000, "source_id": "sina-futures", "quality": "final",
        }], source_id="sina-futures")
        quote = self.manager.quote_for_symbol("AU0")
        self.assertAlmostEqual(quote["price"], 580.0)
        self.assertAlmostEqual(quote["prev_close"], 572.0)
        self.assertEqual(quote["source"], "warehouse")
        self.assertEqual(quote["currency"], "CNY")

    def test_china_manager_overview_series_and_quotes(self) -> None:
        warehouse = self.manager.warehouse
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
        warehouse.upsert_instruments([{
            "instrument_id": "INS:XSHG:600519", "symbol": "600519", "mic": "XSHG",
            "name": "Kweichow Moutai", "type": "stock", "currency": "CNY",
            "country": "CN", "provider_symbol": "600519.SS", "source_id": "eastmoney",
        }])
        warehouse.register_index({
            "index_id": "china:commodities", "name": "China commodity index",
            "kind": "china_commodities", "markets": ["XSHF"],
            "source_ids": ["seed"], "refresh_interval_s": 2592000,
        })
        warehouse.apply_index_snapshot("china:commodities", [{
            "entry_key": "COM:XSHF:AU", "entity_type": "commodity_root",
            "entity_id": "COM:XSHF:AU", "market": "XSHF",
            "payload": {"name": "Gold futures (SHFE)", "name_zh": "黄金连续",
                        "root": "AU", "venue": "XSHF", "provider_symbol": "AU0"},
            "profile_status": "ready",
        }], source_id="seed")
        warehouse.upsert_commodity_roots([{
            "root_id": "COM:XSHF:AU", "venue": "XSHF", "root": "AU",
            "name": "Gold futures (SHFE)", "category": "metals", "unit": "gram",
            "currency": "CNY", "provider_symbol": "AU0", "source_id": "seed",
        }])
        warehouse.upsert_quote_latest([{
            "series_id": "COM:XSHF:AU", "ts": "2026-11-24T07:00:00Z",
            "price": 580.2, "prev_close": 582.0, "change_pct": -0.31,
            "volume": 2000, "currency": "CNY", "source_id": "sina-futures",
        }, {
            "series_id": "INS:XSHG:600519", "ts": "2026-11-24T07:00:00Z",
            "price": 1500.5, "prev_close": 1480.0, "change_pct": 1.39,
            "volume": 1000, "currency": "CNY", "source_id": "yahoo-finance",
        }])
        overview = self.manager.china_overview()
        self.assertTrue(overview["securities"]["ready"])
        self.assertEqual(overview["securities"]["stats"]["by_type"], {"stock": 1, "etf": 1})
        self.assertEqual(overview["top_stocks"][0]["symbol"], "600519")
        self.assertEqual(overview["top_funds"][0]["symbol"], "510300")
        self.assertEqual(overview["top_commodities"][0]["symbol"], "AU0")

        commodity_series = self.manager.series_for_symbol("AU0")
        self.assertEqual(commodity_series["series_id"], "COM:XSHF:AU")
        self.assertEqual(commodity_series["kind"], "commodity")
        stock_series = self.manager.series_for_symbol("600519.SS")
        self.assertEqual(stock_series["series_id"], "INS:XSHG:600519")
        commodity_quote = self.manager.quote_for_symbol("AU0")
        self.assertAlmostEqual(commodity_quote["price"], 580.2)
        self.assertEqual(commodity_quote["source"], "sina")
        self.assertEqual(commodity_quote["currency"], "CNY")

    def test_watchlist_resolves_through_catalog_before_reference_sync(self) -> None:
        # No warehouse rows yet: catalog fallback must still produce series.
        universe = self.manager.tracked_universe()
        self.assertEqual(len(universe["watchlist"]), 4)
        ids = {item["series_id"] for item in universe["watchlist"]}
        self.assertIn("INS:XNAS:AAPL", ids)
        self.assertIn("IDX:GSPC", ids)
        self.assertIn("COM:XCEC:GC", ids)
        self.assertIn("INS:XCRY:BTC-USD", ids)

    def test_universe_dedupes_and_limits_live_series(self) -> None:
        self.manager.runner.run("reference:seed", force=True)
        self.manager.settings["live_max_series"] = 5
        universe = self.manager.tracked_universe()
        self.assertLessEqual(len(universe["live"]), 5)
        self.assertEqual(len({item["series_id"] for item in universe["live"]}), len(universe["live"]))
        self.assertGreater(len(universe["eod"]), len(universe["live"]))
        kinds = {item["kind"] for item in universe["eod"]}
        self.assertIn("index", kinds)
        self.assertIn("commodity", kinds)

    def test_dry_run_offers_a_plan_without_network(self) -> None:
        self.manager.runner.run("reference:seed", force=True)
        plan = self.manager.ingest(dry_run=True)
        self.assertTrue(plan["dry_run"])
        planned = {item["job_id"] for item in plan["planned"]}
        self.assertIn("market:live", planned)
        self.assertIn("news:rss", planned)
        self.assertIn("company:index", planned)
        self.assertIn("company:profile", planned)
        self.assertEqual(self.manager.http.request_count, 0)

    def test_cycle_request_is_async(self) -> None:
        response = self.manager.ingest()
        self.assertTrue(response["accepted"])
        self.assertEqual(response["results"], [])

    def test_unknown_job_is_rejected(self) -> None:
        from market_monitor.data.errors import DataNotFoundError

        with self.assertRaises(DataNotFoundError):
            self.manager.ingest("missing:job", dry_run=True)

    def test_provider_quote_wins_over_warehouse_for_chart_consistency(self) -> None:
        service = MarketMonitorService(
            data_dir=self.tmp.name, provider="synthetic", poll_seconds=15,
        )
        self.addCleanup(service.close)
        service.attach_data_layer(self.manager)
        today = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.manager.warehouse.upsert_quote_latest([{
            "series_id": "INS:XNAS:AAPL",
            "ts": today,
            "price": 250.0,
            "prev_close": 240.0,
            "change_pct": 4.17,
            "volume": 12345,
            "currency": "USD",
            "source_id": "yahoo-finance",
        }])
        quote = service.quote("AAPL")
        # The active provider owns both quotes and chart bars; a persisted
        # backup-channel quote must not silently override it.
        self.assertEqual(quote["source"], "synthetic")
        self.assertGreater(quote["price"], 0)
        self.assertNotAlmostEqual(quote["price"], 250.0)

    def test_provider_quote_ignores_mismatched_persisted_cache(self) -> None:
        service = MarketMonitorService(
            data_dir=self.tmp.name, provider="synthetic", poll_seconds=15,
        )
        self.addCleanup(service.close)
        service.attach_data_layer(self.manager)
        self.manager.warehouse.upsert_quote_latest([{
            "series_id": "INS:XNAS:AAPL",
            "ts": "2020-01-02T15:00:00Z",
            "price": 111.0,
            "prev_close": 110.0,
            "change_pct": 0.91,
            "volume": 1000,
            "currency": "USD",
            "source_id": "yahoo-finance",
        }])
        quote = service.quote("AAPL")
        self.assertEqual(quote["source"], "synthetic")
        self.assertNotAlmostEqual(quote["price"], 111.0)

    def test_news_symbol_resolution_and_entity_enrichment(self) -> None:
        self.manager.runner.run("reference:seed", force=True)
        self.manager.warehouse.upsert_news_sources([{
            "source_id": "cnbc-rss", "name": "CNBC", "kind": "news-rss",
            "language": "en", "feed_url": "https://example.test/rss",
        }])
        self.manager.warehouse.insert_news_articles([{
            "article_id": "a1", "source_id": "cnbc-rss",
            "url": "https://example.test/a", "canonical_url": "https://example.test/a",
            "title": "Apple beats estimates", "language": "en",
            "published_at": "2026-11-20T12:00:00Z",
        }])
        self.manager.warehouse.link_news_entities("a1", [{
            "entity_type": "instrument", "entity_id": "INS:XNAS:AAPL",
            "confidence": 0.85, "method": "symbol",
        }])
        payload = self.manager.news(symbol="AAPL")
        self.assertEqual(payload["count"], 1)
        entity = payload["articles"][0]["entities"][0]
        self.assertEqual(entity["symbol"], "AAPL")
        self.assertEqual(entity["label"], "Apple Inc.")
        self.assertEqual(entity["venue"], "XNAS")

    def test_status_and_sources_report_budgets(self) -> None:
        status = self.manager.status()
        self.assertTrue(status["enabled"])
        self.assertFalse(status["running"])
        source_ids = {source["source_id"] for source in status["sources"]}
        self.assertIn("yahoo-finance", source_ids)
        self.assertIn("sec-edgar", source_ids)
        jobs = {job["job_id"] for job in status["jobs"]}
        self.assertIn("market:eod", jobs)


if __name__ == "__main__":
    unittest.main()
