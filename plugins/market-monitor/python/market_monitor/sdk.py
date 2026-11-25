"""In-process Python SDK facade for the market monitor.

``MarketMonitor`` mirrors the HTTP API with snake_case methods and never starts
the monitoring thread (create a service directly, or run the sidecar, when a
background loop is required).  All methods raise
:class:`~market_monitor.errors.MarketMonitorError` subclasses on failure.
"""

from __future__ import annotations

import os
from typing import Any, Iterable, Mapping, Sequence

from .service import MarketMonitorService


class MarketMonitor:
    """In-process facade over :class:`MarketMonitorService`.

    Parameters
    ----------
    data_dir:
        Data directory; defaults to ``$DSH_HOME/market-monitor`` or
        ``~/.market-monitor``.
    provider:
        ``auto``, ``synthetic`` or ``yahoo``.
    poll_seconds:
        Quote cache / monitoring interval in seconds.
    benchmark:
        Benchmark symbol used for correlation analysis.
    """

    def __init__(
        self,
        data_dir: str | os.PathLike[str] | None = None,
        provider: str = "auto",
        poll_seconds: int = 15,
        benchmark: str = "^GSPC",
    ) -> None:
        self._service = MarketMonitorService(
            data_dir=data_dir,
            provider=provider,
            poll_seconds=poll_seconds,
            benchmark=benchmark,
            start_monitor=False,
        )

    @property
    def service(self) -> MarketMonitorService:
        """The underlying service instance."""
        return self._service

    def close(self) -> None:
        """Release the SQLite store and stop any background work (idempotent)."""
        self._service.close()

    def __enter__(self) -> "MarketMonitor":
        """Enter a context manager block."""
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        """Close the monitor when leaving a context manager block."""
        self.close()

    # ------------------------------------------------------------------
    # Meta / catalog / settings
    # ------------------------------------------------------------------
    def health(self) -> dict[str, Any]:
        """Return the health payload (version, provider, uptime, ...)."""
        return self._service.health()

    def meta(self) -> dict[str, Any]:
        """Return version/provider/sidecar/settings metadata."""
        return self._service.meta()

    def catalog(
        self,
        q: str | None = None,
        type: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """Return catalog items (``{"items": [...]}``)."""
        return self._service.catalog(q=q, type=type, limit=limit)

    def get_settings(self) -> dict[str, Any]:
        """Return the current provider/poll/benchmark settings."""
        return self._service.get_settings()

    def update_settings(
        self,
        provider: str | None = None,
        poll_seconds: int | None = None,
        benchmark: str | None = None,
    ) -> dict[str, Any]:
        """Update provider/poll/benchmark settings."""
        return self._service.update_settings(
            provider=provider,
            poll_seconds=poll_seconds,
            benchmark=benchmark,
        )

    # ------------------------------------------------------------------
    # Watchlist
    # ------------------------------------------------------------------
    def list_watchlist(self) -> dict[str, Any]:
        """Return the watchlist (``{"items": [...]}``)."""
        return self._service.list_watchlist()

    def add_watch(self, symbol: str, note: str = "") -> dict[str, Any]:
        """Add a symbol to the watchlist, returning ``{"item", "created"}``."""
        return self._service.add_watch(symbol, note)

    def remove_watch(self, symbol: str) -> dict[str, Any]:
        """Remove a symbol from the watchlist."""
        return self._service.remove_watch(symbol)

    def set_note(self, symbol: str, note: str) -> dict[str, Any]:
        """Set the note of a watched symbol."""
        return self._service.set_note(symbol, note)

    # ------------------------------------------------------------------
    # Quotes / history / analysis
    # ------------------------------------------------------------------
    def snapshot(
        self, symbols: str | Iterable[str] | None = None
    ) -> dict[str, Any]:
        """Return quote entries with spark/rsi/trend for the given symbols."""
        return self._service.snapshot(symbols)

    def quote(self, symbol: str) -> dict[str, Any]:
        """Return one quote."""
        return self._service.quote(symbol)

    def sync(
        self, symbols: str | Iterable[str] | None = None
    ) -> dict[str, Any]:
        """Refresh quotes, evaluate alerts and return triggered events."""
        return self._service.sync(symbols)

    def history(
        self,
        symbol: str,
        range: str = "1Y",
        interval: str | None = None,
        overlays: bool = False,
    ) -> dict[str, Any]:
        """Return history bars (and optionally overlay series)."""
        return self._service.history(symbol, range, interval, overlays=overlays)

    def analysis(self, symbol: str) -> dict[str, Any]:
        """Return the full analysis payload for ``symbol``."""
        return self._service.analysis(symbol)

    def screener(self, preset: str = "gainers", limit: int = 10) -> dict[str, Any]:
        """Return the ranked screener payload."""
        return self._service.screener(preset, limit)

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------
    def list_alerts(self) -> dict[str, Any]:
        """Return all alert rules (``{"rules": [...]}``)."""
        return self._service.list_alerts()

    def create_alert(
        self,
        symbol: str,
        kind: str,
        threshold: float | None = None,
        params: Mapping[str, Any] | None = None,
        note: str = "",
        cooldown_s: int | None = None,
    ) -> dict[str, Any]:
        """Create an alert rule."""
        return self._service.create_alert(
            symbol, kind, threshold, params, note, cooldown_s
        )

    def update_alert(
        self,
        rule_id: str,
        enabled: bool | None = None,
        threshold: float | None = None,
        params: Mapping[str, Any] | None = None,
        note: str | None = None,
        cooldown_s: int | None = None,
    ) -> dict[str, Any]:
        """Patch an alert rule."""
        return self._service.update_alert(
            rule_id,
            enabled=enabled,
            threshold=threshold,
            params=params,
            note=note,
            cooldown_s=cooldown_s,
        )

    def delete_alert(self, rule_id: str) -> dict[str, Any]:
        """Delete an alert rule."""
        return self._service.delete_alert(rule_id)

    def list_events(
        self, limit: int = 50, acknowledged: bool | None = None
    ) -> dict[str, Any]:
        """Return alert events newest first."""
        return self._service.list_events(limit, acknowledged)

    def ack_events(
        self,
        ids: Sequence[str] | None = None,
        all_events: bool = False,
    ) -> dict[str, Any]:
        """Acknowledge selected (or all) alert events."""
        return self._service.ack_events(ids=ids, all_events=all_events)

    # ------------------------------------------------------------------
    # Portfolio
    # ------------------------------------------------------------------
    def portfolio(self) -> dict[str, Any]:
        """Return computed portfolio positions and totals."""
        return self._service.portfolio()

    def set_position(
        self, symbol: str, quantity: float, avg_cost: float
    ) -> dict[str, Any]:
        """Create or replace a portfolio position."""
        return self._service.set_position(symbol, quantity, avg_cost)

    def delete_position(self, symbol: str) -> dict[str, Any]:
        """Delete a portfolio position."""
        return self._service.delete_position(symbol)

    # ------------------------------------------------------------------
    # Collection
    # ------------------------------------------------------------------
    def collect_bars(
        self,
        symbol: str,
        bars: Sequence[Mapping[str, Any]],
        interval: str = "1d",
        source: str | None = None,
    ) -> dict[str, Any]:
        """Store externally collected OHLCV rows in the bar cache."""
        return self._service.collect_bars(symbol, bars, interval, source)


    # ------------------------------------------------------------------
    # Data collection layer
    # ------------------------------------------------------------------
    def data_status(self) -> dict[str, Any]:
        """Collection health: jobs, source budgets and tracked series."""
        return self._service.data_status()

    def data_coverage(self) -> dict[str, Any]:
        """Canonical coverage counts and freshness per domain."""
        return self._service.data_coverage()

    def data_sources(self) -> dict[str, Any]:
        """Remote source registry with usage budgets."""
        return self._service.data_sources()

    def data_runs(self, limit: int = 20) -> dict[str, Any]:
        """Recent ingestion runs."""
        return self._service.data_runs(limit)

    def data_ingest(
        self, job_id: str | None = None, dry_run: bool = False
    ) -> dict[str, Any]:
        """Run one collection job or all due jobs through the polite collector."""
        return self._service.data_ingest(job_id, dry_run=dry_run)

    def data_tracked(self) -> dict[str, Any]:
        """Tracked series counts for each collection pass."""
        return self._service.data_tracked()

    def data_backfill(self) -> dict[str, Any]:
        """Recent-window coverage summary for the automatic backfill job."""
        return self._service.data_backfill()

    def index_overview(self) -> dict[str, Any]:
        """Generic index registry with entry stats and refresh history."""
        return self._service.index_overview()

    def company_index(self) -> dict[str, Any]:
        """Company master index definition, stats and recent changes."""
        return self._service.company_index()

    def index_entries(
        self,
        index_id: str,
        market: str | None = None,
        status: str | None = None,
        profile_status: str | None = None,
        query: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Page through one index's entries."""
        return self._service.index_entries(
            index_id, market=market, status=status, profile_status=profile_status,
            query=query, limit=limit, offset=offset,
        )

    def index_changes(self, index_id: str, limit: int = 50) -> dict[str, Any]:
        """Recent added/updated/removed entries for one index."""
        return self._service.index_changes(index_id, limit)

    def index_refreshes(self, index_id: str, limit: int = 10) -> dict[str, Any]:
        """Recent refresh audit rows for one index."""
        return self._service.index_refreshes(index_id, limit)

    def index_refresh(self, index_id: str, dry_run: bool = False) -> dict[str, Any]:
        """Run the refresh job attached to one index."""
        return self._service.index_refresh(index_id, dry_run=dry_run)

    def company_profile(self, entity_id: str) -> dict[str, Any]:
        """Index entry plus the collected company profile for one entity."""
        return self._service.company_profile(entity_id)

    def china_overview(self) -> dict[str, Any]:
        """China stock/fund/commodity counts and top movers."""
        return self._service.china_overview()

    def news(
        self,
        entity_id: str | None = None,
        source_id: str | None = None,
        since: str | None = None,
        limit: int = 50,
        symbol: str | None = None,
    ) -> dict[str, Any]:
        """Stored news articles with linked entities."""
        return self._service.news(entity_id, source_id, since, limit, symbol=symbol)

    def get_news(self, article_id: str) -> dict[str, Any]:
        """Read one stored news article."""
        return self._service.get_news(article_id)

    def ref_exchanges(self) -> dict[str, Any]:
        """Canonical exchange reference rows."""
        return self._service.ref_exchanges()

    def ref_instruments(
        self,
        mic: str | None = None,
        query: str | None = None,
        type_: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Search canonical listed-instrument reference rows."""
        return self._service.ref_instruments(mic, query, type_, limit, offset)

    def ref_indices(self, query: str | None = None, limit: int = 100) -> dict[str, Any]:
        """Canonical index reference rows."""
        return self._service.ref_indices(query, limit)

    def ref_commodities(self) -> dict[str, Any]:
        """Commodity roots and monthly contracts."""
        return self._service.ref_commodities()

    def series_bars(
        self, series_id: str, interval: str = "1d", limit: int = 250
    ) -> dict[str, Any]:
        """Stored canonical bars for one typed series id."""
        return self._service.series_bars(series_id, interval, limit)


__all__ = ["MarketMonitor"]
