"""Service-facing facade for the collection layer.

The manager owns the warehouse, governor, polite HTTP client, runner and the
background collection loop; ``MarketMonitorService`` uses it for live quote
handoff, reference queries, news and diagnostics.  It is deliberately separate
from the hot analysis cache in ``market_monitor.store``.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from .. import catalog as instrument_catalog
from ..storage import layout, storage_info
from .errors import DataNotFoundError
from .governor import RateGovernor
from .http import PoliteHttpClient
from .jobs import register_jobs
from .models import parse_iso, utc_now
from .runner import IngestionRunner
from .specs import SOURCE_SPECS
from .warehouse import DataWarehouse

LOGGER = logging.getLogger("market_monitor.data.manager")

#: Catalog exchange names mapped to internal venue MICs.
_CATALOG_MIC = {
    "NASDAQ": "XNAS",
    "NYSE": "XNYS",
    "AMEX": "XASE",
    "COMEX": "XCEC",
    "NYMEX": "XNYM",
    "CBOE": "XCBO",
}
_CATALOG_COMMODITY_VENUE = {"COMEX": "XCEC", "NYMEX": "XNYM"}
_PSEUDO_VENUES = {"crypto": "XCRY", "forex": "XFXS"}


class MarketDataManager:
    """Facade over the canonical warehouse and the ingestion runner."""

    def __init__(
        self,
        data_dir: str | Path,
        *,
        settings: dict[str, Any] | None = None,
        now_fn: Callable[[], float] | None = None,
        logger: logging.Logger | None = None,
        enabled: bool = True,
        watchlist_provider: Callable[[], Iterable[str]] | None = None,
    ) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.enabled = bool(enabled)
        self._now = now_fn or time.time
        self.logger = logger or LOGGER
        self.settings: dict[str, Any] = {
            "data_poll_seconds": 5.0,
            "live_max_series": 40,
            "eod_extra_instruments": 120,
            "eod_max_series_per_run": 120,
            "quote_max_age_s": 300.0,
            "stooq_fallback": False,
            "company_index_id": "company:master",
            "company_index_delist_confirmations": 2,
            "profile_batch_size": 20,
            "profile_max_attempts": 3,
            "china_securities_index_id": "china:securities",
            "china_commodities_index_id": "china:commodities",
            "china_stock_max_entries": 2000,
            "china_fund_max_entries": 800,
            "china_live_max_series": 20,
            "china_live_stocks": 10,
            "china_live_funds": 10,
            "china_eod_universe": 600,
            "china_eod_stocks": 400,
            "china_eod_funds": 200,
            "china_commodity_batch": 40,
            "china_commodity_eod_max_roots": 50,
            "channel_quote_limit": 20,
            "channel_eod_limit": 20,
            "channel_sina_batch": 40,
            "backfill_days": 30,
            "backfill_batch": 30,
            "backfill_daily_limit": 300,
            "backfill_min_bars": 12,
            "backfill_stale_days": 3,
            "backfill_range": "3mo",
            "backfill_yahoo_reserve": 40,
            "annual_backfill_days": 365,
            "annual_backfill_target_bars": 240,
            "annual_backfill_batch": 4,
            "annual_backfill_daily_limit": 120,
            "annual_backfill_retry_days": 7,
            "intraday_batch": 12,
            "intraday_5m_days": 5,
            "intraday_daily_limit": 60,
            "news_content_fetch": True,
            "news_content_max_per_run": 12,
            "raw_retention_days": 7,
            "observation_retention_days": 14,
        }
        if settings:
            self.settings.update({key: value for key, value in settings.items() if value is not None})
        self.warehouse = DataWarehouse(layout(self.data_dir).warehouse_db, now_fn=self._now)
        self.governor = RateGovernor(self.warehouse, now_fn=self._now)
        self.governor.register(SOURCE_SPECS)
        self.http = PoliteHttpClient(self.warehouse, self.governor, now_fn=self._now)
        self.runner = IngestionRunner(
            self.warehouse,
            self.http,
            self.governor,
            settings=self.settings,
            now_fn=self._now,
            logger=self.logger,
        )
        self._watchlist_provider = watchlist_provider or (lambda: [])
        self._job_ids = register_jobs(
            self.runner,
            self._universe,
            china_provider=self._china_universe,
            backfill_provider=self._backfill_universe,
        )
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._last_cycle: dict[str, Any] = {}

    # ------------------------------------------------------------- lifecycle

    def set_watchlist_provider(self, provider: Callable[[], Iterable[str]]) -> None:
        """Install the callable that returns the current watchlist symbols."""
        self._watchlist_provider = provider

    def start(self) -> None:
        """Start the background collection loop (idempotent)."""
        if not self.enabled:
            return
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._loop, name="market-data-collection", daemon=True,
        )
        self._thread.start()
        self.logger.info("data collection loop started")

    def stop(self) -> None:
        """Stop the loop promptly and close the warehouse when it is idle.

        A long collector run is a daemon thread; rather than blocking process
        shutdown for minutes, the manager waits briefly, closes the database
        only when the thread is idle, and lets interpreter shutdown reap the
        daemon (SQLite WAL keeps the file consistent).
        """
        self._stop.set()
        self._wake.set()
        thread = self._thread
        self._thread = None
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=1.0)
        if thread is not None and thread.is_alive():
            self.logger.info("collection thread still finishing a job; leaving it to process exit")
            return
        try:
            self.warehouse.close()
        except Exception:  # noqa: BLE001 - shutdown is best effort
            pass

    def _loop(self) -> None:
        """Run due jobs until stopped; never dies on a single failure."""
        while not self._stop.is_set():
            try:
                results = self.runner.run_due()
                self._last_cycle = {
                    "at": self.runner.now_iso(),
                    "jobs": [result.to_dict() for result in results],
                }
            except Exception:  # pragma: no cover - defensive
                self.logger.exception("data collection cycle failed")
            self._wake.clear()
            self._wake.wait(max(1.0, float(self.settings.get("data_poll_seconds", 5.0))))
            if self._stop.is_set():
                break

    # ------------------------------------------------------------- diagnostics

    def status(self) -> dict[str, Any]:
        """Manager, runner and source status for the Data tab and diagnostics."""
        runner_status = self.runner.status()
        sources = {source["source_id"]: source for source in runner_status["sources"]}
        spec_map = {spec.source_id: spec for spec in SOURCE_SPECS}
        enriched = []
        for source_id, state in sources.items():
            spec = spec_map.get(source_id)
            enriched.append({
                **state,
                "name": spec.name if spec else source_id,
                "kind": spec.kind if spec else "",
                "license_note": spec.license_note if spec else "",
            })
        return {
            "enabled": self.enabled,
            "running": bool(self._thread is not None and self._thread.is_alive()),
            "database": str(self.warehouse.path),
            "schema_version": self.warehouse.schema_version,
            "storage": storage_info(
                self.data_dir,
                cache_db=layout(self.data_dir).cache_db,
                warehouse_db=self.warehouse.path,
            ),
            "jobs": runner_status["jobs"],
            "sources": enriched,
            "tracked": self.tracked_summary(),
            "last_cycle": self._last_cycle,
            "policy": {
                "poll_seconds": self.settings.get("data_poll_seconds"),
                "live_max_series": self.settings.get("live_max_series"),
                "eod_max_series_per_run": self.settings.get("eod_max_series_per_run"),
                "quote_max_age_s": self.settings.get("quote_max_age_s"),
                "profile_batch_size": self.settings.get("profile_batch_size"),
            },
        }

    def coverage(self) -> dict[str, Any]:
        """Warehouse coverage plus scheduled-job state."""
        payload = self.warehouse.coverage()
        payload["jobs"] = self.runner.status()["jobs"]
        payload["tracked"] = self.tracked_summary()
        return payload

    def sources(self) -> dict[str, Any]:
        """Source registry with budgets and circuit state."""
        return {"sources": self.status()["sources"]}

    def runs(self, limit: int = 20) -> dict[str, Any]:
        """Recent ingestion runs."""
        return {"runs": self.warehouse.list_runs(limit=limit)}

    def ingest(self, job_id: str | None = None, *, dry_run: bool = False) -> dict[str, Any]:
        """Run one job, or request a background collection cycle.

        A cycle request only wakes the single-flight loop so a slow backfill can
        never block an HTTP request; a named job runs inline and returns its
        counters.
        """
        if not self.enabled:
            return {"enabled": False, "results": [], "dry_run": dry_run}
        if dry_run:
            jobs = [job for job in self.status()["jobs"] if job_id is None or job["job_id"] == job_id]
            if job_id is not None and not jobs:
                raise DataNotFoundError(f"Unknown ingestion job: {job_id}")
            return {
                "enabled": True,
                "dry_run": True,
                "planned": [
                    {
                        "job_id": job["job_id"],
                        "due": job["due"],
                        "description": job["description"],
                        "sources": self._job_sources(job["job_id"]),
                    }
                    for job in jobs
                ],
                "results": [],
            }
        if job_id is None:
            self._wake.set()
            return {
                "enabled": True,
                "dry_run": False,
                "accepted": True,
                "message": "Collection cycle requested; due jobs will run in the background.",
                "results": [],
            }
        if job_id not in self._job_ids:
            raise DataNotFoundError(f"Unknown ingestion job: {job_id}")
        result = self.runner.run(job_id, force=True)
        return {"enabled": True, "dry_run": False, "results": [result.to_dict()]}

    def _job_sources(self, job_id: str) -> list[str]:
        """Source ids used by one job."""
        from .specs import get_job_definition

        definition = get_job_definition(job_id)
        return list(definition.source_ids) if definition else []

    # ---------------------------------------------------------------- indices

    #: Index id -> ingestion job that refreshes it.  New index kinds add one
    #: mapping here (and their provider module under ``data/indices``).
    INDEX_REFRESH_JOBS: dict[str, str] = {
        "company:master": "company:index",
        "china:securities": "china:index",
        "china:commodities": "china:index",
    }

    def index_overview(self) -> dict[str, Any]:
        """Index definitions with entry stats and recent refresh runs."""
        indices = []
        for definition in self.warehouse.list_index_definitions():
            index_id = definition["index_id"]
            stats = self.warehouse.index_entry_stats(index_id)
            indices.append({
                **definition,
                "stats": stats,
                "refreshes": self.warehouse.list_index_refreshes(index_id, limit=3),
                "refresh_job": self.INDEX_REFRESH_JOBS.get(index_id),
            })
        return {"indices": indices, "company_index": self.settings.get("company_index_id")}

    def index_entries(
        self,
        index_id: str,
        *,
        market: str | None = None,
        status: str | None = None,
        profile_status: str | None = None,
        query: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Page through one index's entries."""
        if self.warehouse.get_index_definition(index_id) is None:
            raise DataNotFoundError(f"Unknown index: {index_id}")
        return self.warehouse.list_index_entries(
            index_id, market=market, status=status, profile_status=profile_status,
            query=query, limit=limit, offset=offset,
        )

    def index_changes(self, index_id: str, limit: int = 50) -> dict[str, Any]:
        """Recent entries added/changed/removed in one index."""
        if self.warehouse.get_index_definition(index_id) is None:
            raise DataNotFoundError(f"Unknown index: {index_id}")
        return {"changes": self.warehouse.list_index_changes(index_id, limit=limit)}

    def index_refreshes(self, index_id: str, limit: int = 10) -> dict[str, Any]:
        """Recent refresh audit rows for one index."""
        if self.warehouse.get_index_definition(index_id) is None:
            raise DataNotFoundError(f"Unknown index: {index_id}")
        return {"refreshes": self.warehouse.list_index_refreshes(index_id, limit=limit)}

    def index_refresh(self, index_id: str, *, dry_run: bool = False) -> dict[str, Any]:
        """Run the refresh job attached to one index (inline, single-flight)."""
        job_id = self.INDEX_REFRESH_JOBS.get(index_id)
        if job_id is None:
            raise DataNotFoundError(f"No refresh job is registered for index: {index_id}")
        if not dry_run and self.warehouse.get_index_definition(index_id) is None:
            raise DataNotFoundError(f"Unknown index: {index_id}")
        result = self.runner.run(job_id, force=True, dry_run=dry_run)
        return {"index_id": index_id, "job_id": job_id, "dry_run": dry_run, "result": result.to_dict()}

    def company_profile(self, entity_id: str) -> dict[str, Any]:
        """Index entry plus collected company profile for one entity."""
        index_id = str(self.settings.get("company_index_id") or "company:master")
        entry = self.warehouse.get_index_entry(index_id, entity_id)
        if entry is None:
            raise DataNotFoundError(f"Not in the company index: {entity_id}")
        profile = self.warehouse.get_company_profile(entity_id)
        return {"entry": entry, "profile": profile}

    def company_index(self) -> dict[str, Any]:
        """The company master index definition with stats and recent changes."""
        index_id = str(self.settings.get("company_index_id") or "company:master")
        definition = self.warehouse.get_index_definition(index_id)
        if definition is None:
            raise DataNotFoundError("The company index has not been built yet.")
        return {
            "index": definition,
            "stats": self.warehouse.index_entry_stats(index_id),
            "changes": self.warehouse.list_index_changes(index_id, limit=20),
            "refreshes": self.warehouse.list_index_refreshes(index_id, limit=5),
        }

    # ------------------------------------------------------------ China market

    def _china_index_summary(self, index_id: str) -> dict[str, Any]:
        """Index definition + stats + refresh audit for a China index."""
        definition = self.warehouse.get_index_definition(index_id)
        if definition is None:
            return {"index_id": index_id, "ready": False, "stats": {}, "refreshes": []}
        stats = self.warehouse.index_entry_stats(index_id)
        page = self.warehouse.list_index_entries(index_id, status="active", limit=5000)
        type_counts: dict[str, int] = {}
        for entry in page["entries"]:
            instrument_type = str((entry.get("payload") or {}).get("instrument_type") or "")
            if instrument_type:
                type_counts[instrument_type] = type_counts.get(instrument_type, 0) + 1
        stats["by_type"] = type_counts
        return {
            "index": definition,
            "ready": True,
            "stats": stats,
            "refreshes": self.warehouse.list_index_refreshes(index_id, limit=3),
        }

    def _china_movers(self, index_id: str, instrument_type: str, limit: int = 8) -> list[dict[str, Any]]:
        """Top China securities of one type by market cap with latest persisted quote."""
        page = self.warehouse.list_index_entries(index_id, status="active", limit=5000)
        rows = [
            entry for entry in page["entries"]
            if str((entry.get("payload") or {}).get("instrument_type") or "") == instrument_type
        ]
        rows.sort(
            key=lambda entry: float((entry.get("payload") or {}).get("market_cap") or 0.0),
            reverse=True,
        )
        movers: list[dict[str, Any]] = []
        for entry in rows[:limit]:
            payload = entry.get("payload") or {}
            quote = self.quote_for_series(entry["entity_id"]) or {}
            movers.append({
                "entity_id": entry["entity_id"],
                "symbol": payload.get("symbol"),
                "name": payload.get("name_zh") or payload.get("name"),
                "market": entry.get("market"),
                "instrument_type": instrument_type,
                "provider_symbol": payload.get("provider_symbol"),
                "market_cap": payload.get("market_cap"),
                "price": quote.get("price"),
                "change_pct": quote.get("change_pct"),
                "currency": quote.get("currency") or "CNY",
                "as_of": quote.get("as_of"),
            })
        return movers

    def _china_commodity_movers(self, limit: int = 8) -> list[dict[str, Any]]:
        """Mainland commodity roots with their latest persisted quote."""
        roots = [
            root for root in self.warehouse.list_commodity_roots()
            if str(root.get("venue") or "") in ("XSHF", "XINE", "XDCE", "XCZC", "XGFE")
        ]
        roots.sort(key=lambda root: root.get("name") or "")
        movers = []
        for root in roots[:limit]:
            quote = self.quote_for_series(root["root_id"]) or {}
            movers.append({
                "root_id": root["root_id"],
                "symbol": root.get("provider_symbol"),
                "name": root.get("name"),
                "venue": root.get("venue"),
                "category": root.get("category"),
                "unit": root.get("unit"),
                "price": quote.get("price"),
                "change_pct": quote.get("change_pct"),
                "currency": quote.get("currency") or "CNY",
                "as_of": quote.get("as_of"),
            })
        return movers

    def china_overview(self) -> dict[str, Any]:
        """China market summary: index counts, top stocks/funds and commodity quotes."""
        securities_id = str(self.settings.get("china_securities_index_id") or "china:securities")
        commodities_id = str(self.settings.get("china_commodities_index_id") or "china:commodities")
        securities = self._china_index_summary(securities_id)
        commodities = self._china_index_summary(commodities_id)
        cn_venues = ("XSHF", "XINE", "XDCE", "XCZC", "XGFE")
        has_commodity_roots = any(
            str(root.get("venue") or "") in cn_venues
            for root in self.warehouse.list_commodity_roots()
        )
        return {
            "securities": securities,
            "commodities": commodities,
            "top_stocks": self._china_movers(securities_id, "stock", limit=8)
            if securities.get("ready") else [],
            "top_funds": self._china_movers(securities_id, "etf", limit=8)
            if securities.get("ready") else [],
            "top_commodities": self._china_commodity_movers(limit=8)
            if has_commodity_roots else [],
        }

    # ---------------------------------------------------------------- queries

    def news(
        self,
        entity_id: str | None = None,
        source_id: str | None = None,
        since: str | None = None,
        limit: int = 50,
        symbol: str | None = None,
    ) -> dict[str, Any]:
        """Warehouse news articles with linked, enriched entities.

        ``symbol`` resolves a provider symbol (for example ``AAPL``) to its
        canonical entity id so callers do not need to know MICs.
        """
        if entity_id is None and symbol:
            instrument = self.warehouse.find_instrument_by_provider_symbol(symbol)
            if instrument is not None:
                entity_id = instrument["instrument_id"]
            else:
                series = self._catalog_series(str(symbol).strip().upper())
                entity_id = series["series_id"] if series else None
        articles = self.warehouse.list_news(
            entity_id_value=entity_id, source_id=source_id, since=since, limit=limit,
        )
        self._enrich_news_entities(articles)
        articles = [self._news_view(article) for article in articles]
        total = self.warehouse.table_counts()["news_articles"]
        return {"articles": articles, "count": len(articles), "total_articles": total}

    @staticmethod
    def _news_view(article: dict[str, Any]) -> dict[str, Any]:
        """Add English-named collection aliases used by the news API.

        Storage keeps the normalized ``published_at``/``body``/``fetched_at``
        columns; callers also receive the requested ``publish_time``,
        ``content`` and ``collected_at`` names. Timestamps are ISO-8601 UTC
        (an English, locale-independent representation).
        """
        view = dict(article)
        view["publish_time"] = article.get("published_at") or ""
        view["content"] = article.get("body") or article.get("summary") or ""
        view["collected_at"] = article.get("fetched_at") or ""
        return view

    def _enrich_news_entities(self, articles: list[dict[str, Any]]) -> None:
        """Attach label/symbol metadata to entity links for the UI."""
        roots = {row["root_id"]: row for row in self.warehouse.list_commodity_roots()}
        contracts = {row["contract_id"]: row for row in self.warehouse.list_commodity_contracts()}
        for article in articles:
            for link in article.get("entities", []):
                entity_id = str(link.get("entity_id") or "")
                entity_type = str(link.get("entity_type") or "")
                reference: dict[str, Any] | None = None
                if entity_type == "instrument":
                    reference = self.warehouse.get_instrument(entity_id)
                elif entity_type == "index":
                    reference = self.warehouse.get_index(entity_id)
                elif entity_type == "commodity_root":
                    reference = roots.get(entity_id)
                elif entity_type == "commodity_contract":
                    reference = contracts.get(entity_id)
                if reference:
                    link["label"] = reference.get("name")
                    link["symbol"] = (
                        reference.get("symbol")
                        or reference.get("provider_symbol")
                        or reference.get("root")
                        or entity_id.rsplit(":", 1)[-1]
                    )
                    link["venue"] = reference.get("mic") or reference.get("venue") or ""

    def get_news(self, article_id: str) -> dict[str, Any]:
        """One stored article, or ``404``."""
        article = self.warehouse.get_news(article_id)
        if article is None:
            raise DataNotFoundError(f"Unknown news article: {article_id}")
        return {"article": self._news_view(article)}

    def exchanges(self) -> dict[str, Any]:
        """Exchange reference rows."""
        return {"exchanges": self.warehouse.list_exchanges()}

    def instruments(
        self,
        mic: str | None = None,
        query: str | None = None,
        instrument_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Search canonical instrument reference rows."""
        items = self.warehouse.list_instruments(
            mic=mic, query=query, instrument_type=instrument_type,
            limit=limit, offset=offset,
        )
        return {
            "instruments": items,
            "count": len(items),
            "total": self.warehouse.count_instruments(mic),
        }

    def indices(self, query: str | None = None, limit: int = 100) -> dict[str, Any]:
        """Index reference rows."""
        return {"indices": self.warehouse.list_indices(query=query, limit=limit)}

    def commodities(self) -> dict[str, Any]:
        """Commodity roots and contracts."""
        return {
            "roots": self.warehouse.list_commodity_roots(),
            "contracts": self.warehouse.list_commodity_contracts(),
        }

    def series_bars(
        self, series_id: str, interval: str = "1d", limit: int = 250,
    ) -> dict[str, Any]:
        """Warehouse bars for one series."""
        rows = [
            {
                "t": row["ts"],
                "o": row["open"],
                "h": row["high"],
                "l": row["low"],
                "c": row["close"],
                "v": row["volume"],
                "quality": row.get("quality"),
                "source_id": row.get("source_id"),
            }
            for row in self.warehouse.get_bars(series_id, interval=interval, limit=limit)
        ]
        if not rows:
            raise DataNotFoundError(f"No stored bars for series: {series_id}")
        return {"series_id": series_id, "interval": interval, "bars": rows, "count": len(rows)}

    def series_for_symbol(self, symbol: str) -> dict[str, Any] | None:
        """Resolve a display symbol to a warehouse-backed tracked series."""
        value = str(symbol or "").strip().upper()
        if not value:
            return None
        instrument = self.warehouse.find_instrument_by_provider_symbol(value)
        if instrument is not None and instrument.get("provider_symbol"):
            return _series(
                instrument["instrument_id"], "instrument",
                instrument["provider_symbol"], instrument.get("currency") or "USD",
            )
        root = self.warehouse.find_commodity_root_by_provider_symbol(value)
        if root is not None and root.get("provider_symbol"):
            return _series(
                root["root_id"], "commodity", root["provider_symbol"],
                root.get("currency") or "USD",
            )
        return self._catalog_series(value)

    def quote_for_symbol(self, symbol: str) -> dict[str, Any] | None:
        """Latest warehouse quote for a provider symbol, if fresh enough."""
        instrument = self.warehouse.find_instrument_by_provider_symbol(symbol)
        if instrument is not None:
            return self.quote_for_series(instrument["instrument_id"])
        root = self.warehouse.find_commodity_root_by_provider_symbol(str(symbol or "").strip().upper())
        if root is not None:
            return self.quote_for_series(root["root_id"])
        fallback = self._catalog_series(str(symbol or "").strip().upper())
        if fallback is not None:
            return self.quote_for_series(fallback["series_id"])
        return None

    def quote_for_series(self, series_id: str) -> dict[str, Any] | None:
        """Latest warehouse quote mapped to the service quote shape.

        A quote is returned even when it is old: the panel should show the last
        known price (flagged ``stale``) instead of falling back to one provider
        request per symbol, which would multiply upstream traffic during a long
        backfill or a rate-limited window.
        """
        row = self.warehouse.get_quote_latest(series_id)
        latest_bars = self.warehouse.get_bars(series_id, interval="1d", limit=1)
        latest_bar = latest_bars[-1] if latest_bars else None
        if row and row.get("price") is not None and latest_bar is not None:
            quote_day = str(row.get("ts") or "")[:10]
            bar_day = str(latest_bar.get("ts") or "")[:10]
            if bar_day > quote_day and str(latest_bar.get("quality") or "") == "final":
                # A newer finalized daily bar supersedes an older quote row
                # (important when a live gateway serves a frozen snapshot).
                bar_quote = self._quote_from_latest_bar(series_id)
                if bar_quote is not None:
                    return bar_quote
        if (not row or row.get("price") is None):
            return self._quote_from_latest_bar(series_id)
        timestamp = parse_iso(row.get("ts"))
        if timestamp is None:
            return None
        age = utc_now(self._now) - timestamp.timestamp()
        price = float(row["price"])
        prev_close = float(row["prev_close"]) if row.get("prev_close") is not None else price
        source_id = str(row.get("source_id") or "")
        if "sina" in source_id:
            source = "sina"
        elif "tencent" in source_id:
            source = "tencent"
        elif "coingecko" in source_id:
            source = "coingecko"
        elif "frankfurter" in source_id:
            source = "frankfurter"
        elif "yahoo" in source_id:
            source = "yahoo"
        else:
            source = "warehouse"
        return {
            "price": price,
            "prev_close": prev_close,
            "change": price - prev_close,
            "change_pct": float(row["change_pct"]) if row.get("change_pct") is not None else 0.0,
            "volume": row.get("volume") or 0.0,
            "currency": row.get("currency") or "USD",
            "as_of": row["ts"],
            "source": source,
            "market_state": "open" if age < 900 else "closed",
            "stale": age > max(300.0, float(self.settings.get("quote_stale_after_s", 300.0))),
        }

    def _quote_from_latest_bar(self, series_id: str) -> dict[str, Any] | None:
        """Derive a quote from the two latest persisted daily bars.

        Used for series that only have end-of-day history (for example mainland
        commodity contracts when the live gateway is stale), so the panel still
        shows a persisted price instead of nothing.
        """
        bars = self.warehouse.get_bars(series_id, interval="1d", limit=2)
        if not bars:
            return None
        last = bars[-1]
        price = last.get("close")
        if price is None:
            return None
        prev_close = bars[-2].get("close") if len(bars) > 1 else None
        if prev_close is None:
            prev_close = last.get("open") or price
        price = float(price)
        prev_close = float(prev_close)
        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0
        ts = str(last.get("ts") or "")
        as_of = ts if "T" in ts else f"{ts}T00:00:00Z"
        timestamp = parse_iso(as_of)
        age = (utc_now(self._now) - timestamp.timestamp()) if timestamp else 86400.0
        source_id = str(last.get("source_id") or "")
        return {
            "price": price,
            "prev_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "volume": last.get("volume") or 0.0,
            "currency": "CNY" if "sina" in source_id else "USD",
            "as_of": as_of,
            "source": "warehouse",
            "market_state": "closed",
            "stale": age > 86400.0,
        }

    # --------------------------------------------------------------- universe

    def tracked_universe(self) -> dict[str, list[dict[str, Any]]]:
        """Current tracked series for each collection pass."""
        return self._universe()

    def tracked_summary(self) -> dict[str, int]:
        """Counts of tracked series by kind."""
        universe = self._universe()
        return {key: len(value) for key, value in universe.items()}

    def _universe(self) -> dict[str, list[dict[str, Any]]]:
        """Build deduplicated live/EOD series lists from the warehouse and catalog."""
        watchlist = [str(symbol) for symbol in self._watchlist_provider()]
        live = self._watchlist_series(watchlist)
        indices = self._index_series()
        commodities = self._commodity_series()
        watch_series = {item["series_id"] for item in live}
        extra = self._extra_instrument_series(watch_series)
        live_limit = max(1, int(self.settings.get("live_max_series", 40)))
        eod_extra = max(0, int(self.settings.get("eod_extra_instruments", 120)))
        combined_live = _dedupe(live + indices + commodities)[:live_limit]
        combined_eod = _dedupe(live + indices + commodities + extra[:eod_extra])
        return {
            "live": combined_live,
            "eod": combined_eod,
            "indices": indices,
            "commodities": commodities,
            "watchlist": live,
        }

    def _backfill_universe(self) -> dict[str, list[dict[str, Any]]]:
        """Full instrument universe used by the rolling recent-history backfill."""
        watchlist = [str(symbol) for symbol in self._watchlist_provider()]
        live = self._watchlist_series(watchlist)
        indices = self._index_series()
        commodities = self._commodity_series()
        instruments = [
            _series(
                row["instrument_id"], "instrument",
                row.get("provider_symbol") or "", row.get("currency") or "USD",
            )
            for row in self.warehouse.list_instruments(limit=20000)
            if row.get("provider_symbol")
        ]
        priority_ids = {
            series["series_id"] for series in (live + indices + commodities)
        }
        backfill = []
        for series in _dedupe(live + indices + commodities + instruments):
            backfill.append({
                **series,
                "priority": 0 if series["series_id"] in priority_ids else 1,
            })
        return {"backfill": backfill}

    def backfill_status(self) -> dict[str, Any]:
        """Recent-window and annual watchlist coverage summaries."""
        days = max(5, min(120, int(self.settings.get("backfill_days", 30))))
        today = datetime.fromtimestamp(self._now(), tz=timezone.utc).date()
        start = (today - timedelta(days=days)).isoformat()
        universe = self._backfill_universe()["backfill"]
        coverage = self.warehouse.bar_coverage_since(start)
        latest = self.warehouse.latest_bar_map()
        min_bars = max(1, int(self.settings.get("backfill_min_bars", 12)))
        stale_days = max(1, int(self.settings.get("backfill_stale_days", 3)))
        stale_before = (today - timedelta(days=stale_days)).isoformat()
        needs: list[dict[str, Any]] = []
        for series in universe:
            series_id = series["series_id"]
            window = coverage.get(series_id) or {"count": 0, "last_ts": None}
            latest_ts = latest.get(series_id)
            count = int(window.get("count") or 0)
            if count < min_bars or not latest_ts or latest_ts < stale_before:
                needs.append({
                    "series_id": series_id,
                    "kind": series.get("kind"),
                    "provider_symbol": series.get("provider_symbol"),
                    "bars_in_window": count,
                    "latest_bar": latest_ts,
                })
        job = next(
            (item for item in self.runner.status()["jobs"] if item["job_id"] == "backfill:recent"),
            {},
        )
        # Annual watchlist coverage is intentionally separate: it measures real
        # daily bars over the last year, not just the rolling recent window.
        annual_days = max(180, min(400, int(self.settings.get("annual_backfill_days", 365))))
        annual_target = max(60, min(260, int(self.settings.get("annual_backfill_target_bars", 240))))
        annual_start = (today - timedelta(days=annual_days)).isoformat()
        watched = [
            series for series in universe
            if series.get("kind") == "instrument"
            and int(series.get("priority", 1)) == 0
            and str(series.get("series_id") or "").upper().split(":")[1:2] not in (["XCRY"], ["XFXS"])
        ]
        annual_coverage = self.warehouse.bar_coverage_since(annual_start)
        annual_needs = [
            {
                "series_id": series["series_id"],
                "provider_symbol": series.get("provider_symbol"),
                "bars_in_window": int(
                    (annual_coverage.get(series["series_id"]) or {}).get("count") or 0
                ),
            }
            for series in watched
            if int((annual_coverage.get(series["series_id"]) or {}).get("count") or 0)
            < annual_target
        ]
        annual_job = next(
            (item for item in self.runner.status()["jobs"] if item["job_id"] == "backfill:annual"),
            {},
        )
        return {
            "window": {"days": days, "start": start, "end": today.isoformat()},
            "universe": len(universe),
            "with_recent_bars": sum(
                1 for series in universe if coverage.get(series["series_id"], {}).get("count")
            ),
            "adequate": len(universe) - len(needs),
            "needs_fill": len(needs),
            "needs": needs[:50],
            "annual": {
                "window": {
                    "days": annual_days, "start": annual_start, "end": today.isoformat(),
                },
                "target_bars": annual_target,
                "watched_companies": len(watched),
                "adequate": len(watched) - len(annual_needs),
                "needs_fill": len(annual_needs),
                "needs": annual_needs[:50],
                "job": {
                    "last_run_at": annual_job.get("last_run_at"),
                    "last_status": annual_job.get("last_status"),
                    "next_due_at": annual_job.get("next_due_at"),
                    "last_summary": annual_job.get("last_summary"),
                },
            },
            "job": {
                "last_run_at": job.get("last_run_at"),
                "last_status": job.get("last_status"),
                "next_due_at": job.get("next_due_at"),
                "last_summary": job.get("last_summary"),
            },
        }

    def _china_universe(self) -> dict[str, list[dict[str, Any]]]:
        """Tracked China series for the dedicated securities/commodity jobs."""
        watchlist = [str(symbol) for symbol in self._watchlist_provider()]
        watched = [
            series for series in self._watchlist_series(watchlist)
            if series["series_id"].startswith((
                "INS:XSHG:", "INS:XSHE:", "COM:XSHF:", "COM:XINE:",
                "COM:XDCE:", "COM:XCZC:", "COM:XGFE:",
            ))
        ]
        securities_id = str(self.settings.get("china_securities_index_id") or "china:securities")
        entries = self.warehouse.list_index_entries(
            securities_id, status="active", limit=5000,
        )["entries"]
        entries.sort(
            key=lambda entry: float((entry.get("payload") or {}).get("market_cap") or 0.0),
            reverse=True,
        )
        security_series = [
            _series(
                entry["entity_id"], "instrument",
                str((entry.get("payload") or {}).get("provider_symbol") or ""),
                "CNY",
            )
            for entry in entries
            if (entry.get("payload") or {}).get("provider_symbol")
            and str((entry.get("payload") or {}).get("instrument_type") or "") == "stock"
        ]
        fund_series = [
            _series(
                entry["entity_id"], "instrument",
                str((entry.get("payload") or {}).get("provider_symbol") or ""),
                "CNY",
            )
            for entry in entries
            if (entry.get("payload") or {}).get("provider_symbol")
            and str((entry.get("payload") or {}).get("instrument_type") or "") == "etf"
        ]
        live_stocks = max(0, int(self.settings.get("china_live_stocks", 10)))
        live_funds = max(0, int(self.settings.get("china_live_funds", 10)))
        eod_stocks = max(0, int(self.settings.get("china_eod_stocks", 400)))
        eod_funds = max(0, int(self.settings.get("china_eod_funds", 200)))
        live_cap = max(1, int(self.settings.get("china_live_max_series", 20)))
        eod_cap = max(1, int(self.settings.get("china_eod_universe", 600)))
        live = _dedupe(
            watched + security_series[:live_stocks] + fund_series[:live_funds]
        )[:live_cap]
        eod = _dedupe(
            watched + security_series[:eod_stocks] + fund_series[:eod_funds]
        )[:eod_cap]
        cn_venues = ("XSHF", "XINE", "XDCE", "XCZC", "XGFE")
        commodities = [
            {
                "root_id": root["root_id"],
                "venue": root.get("venue"),
                "root": root.get("root"),
                "provider_symbol": root.get("provider_symbol"),
                "name": root.get("name"),
                "category": root.get("category"),
                "unit": root.get("unit"),
                "currency": root.get("currency") or "CNY",
            }
            for root in self.warehouse.list_commodity_roots()
            if str(root.get("venue") or "") in cn_venues and root.get("provider_symbol")
        ]
        return {"live": live, "eod": eod, "commodities": commodities}

    def _watchlist_series(self, symbols: list[str]) -> list[dict[str, Any]]:
        """Resolve watchlist symbols to tracked series through warehouse or catalog."""
        series: list[dict[str, Any]] = []
        for raw_symbol in symbols:
            symbol = str(raw_symbol or "").strip().upper()
            if not symbol:
                continue
            resolved = self.series_for_symbol(symbol)
            if resolved is not None:
                series.append(resolved)
        return _dedupe(series)

    def _catalog_series(self, symbol: str) -> dict[str, Any] | None:
        """Fallback resolution for symbols not yet present in the warehouse."""
        instrument = instrument_catalog.get_instrument(symbol)
        if instrument is None:
            return None
        if instrument.type == "index":
            code = symbol.lstrip("^")
            return _series(f"IDX:{code}", "index", symbol, "USD")
        if instrument.type in _PSEUDO_VENUES:
            mic = _PSEUDO_VENUES[instrument.type]
            return _series(f"INS:{mic}:{symbol}", "instrument", symbol, "USD")
        if instrument.type == "commodity":
            venue = _CATALOG_COMMODITY_VENUE.get(instrument.exchange)
            root = symbol.replace("=F", "")
            if venue is None:
                return None
            return _series(f"COM:{venue}:{root}", "commodity", symbol, "USD")
        mic = _CATALOG_MIC.get(instrument.exchange)
        if mic is None:
            return None
        return _series(f"INS:{mic}:{symbol}", "instrument", symbol, "USD")

    def _index_series(self) -> list[dict[str, Any]]:
        """Tracked index series from the warehouse."""
        series = []
        for row in self.warehouse.list_indices(limit=200):
            provider_symbol = row.get("provider_symbol") or ""
            if not provider_symbol:
                continue
            series.append(_series(
                row["index_id"], "index", provider_symbol, row.get("currency") or "USD",
            ))
        return series

    def _commodity_series(self) -> list[dict[str, Any]]:
        """Tracked continuous front-contract commodity series."""
        series = []
        for row in self.warehouse.list_commodity_roots():
            provider_symbol = row.get("provider_symbol") or ""
            if not provider_symbol:
                continue
            series.append(_series(
                row["root_id"], "commodity", provider_symbol, row.get("currency") or "USD",
            ))
        return series

    def _extra_instrument_series(self, exclude: set[str]) -> list[dict[str, Any]]:
        """Seed instruments used for EOD history beyond the watchlist."""
        series = []
        for row in self.warehouse.list_instruments(limit=5000):
            if row["instrument_id"] in exclude:
                continue
            provider_symbol = row.get("provider_symbol") or ""
            if not provider_symbol:
                continue
            series.append(_series(
                row["instrument_id"], "instrument", provider_symbol, row.get("currency") or "USD",
            ))
        return series


def _series(series_id: str, kind: str, provider_symbol: str, currency: str) -> dict[str, Any]:
    """Build one tracked-series dictionary."""
    return {
        "series_id": series_id,
        "kind": kind,
        "provider_symbol": provider_symbol,
        "currency": currency,
    }


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """De-duplicate tracked series by ``series_id`` preserving order."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        series_id = item.get("series_id") or ""
        if not series_id or series_id in seen:
            continue
        seen.add(series_id)
        result.append(item)
    return result


def create_data_manager(
    data_dir: str | Path,
    *,
    settings: dict[str, Any] | None = None,
    enabled: bool = True,
    watchlist_provider: Callable[[], Iterable[str]] | None = None,
) -> MarketDataManager:
    """Factory used by the service and tests."""
    return MarketDataManager(
        data_dir,
        settings=settings,
        enabled=enabled,
        watchlist_provider=watchlist_provider,
    )


__all__ = ["MarketDataManager", "create_data_manager"]
