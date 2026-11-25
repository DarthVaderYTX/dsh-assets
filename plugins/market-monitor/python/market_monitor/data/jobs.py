"""Job handlers wiring collectors to the warehouse runner.

Keeping the wiring here (rather than in each collector) means a collector never
needs to know about scheduling, universe construction or fallbacks.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from .models import CollectContext
from .runner import IngestionRunner, JobSpec
from .specs import JOB_DEFINITIONS, JobDefinition

LOGGER = logging.getLogger("market_monitor.data.jobs")

#: Callable returning the current tracked universe for one or more kinds.
UniverseProvider = Callable[[], dict[str, list[dict[str, Any]]]]


def _wrap(handler: Callable[[CollectContext], dict[str, Any] | None], universe_key: str,
          series_provider: UniverseProvider):
    """Bind a universe list into the collector's settings before the run."""

    def run(context: CollectContext) -> dict[str, Any] | None:
        universe = series_provider()
        context.settings["tracked_series"] = universe.get(universe_key, [])
        return handler(context)

    return run


def _china_index(context: CollectContext) -> dict[str, Any]:
    """Refresh both China indexes (securities from Eastmoney, commodities from seed)."""
    from .indices import china_commodities, china_securities

    results = []
    errors = []
    for module in (china_securities, china_commodities):
        try:
            results.append(module.collect(context) or {})
        except Exception as error:  # noqa: BLE001 - one index must not hide the other
            context.logger.warning("China index refresh failed: %s", error)
            errors.append({"index": getattr(module, "INDEX_ID", ""), "error": str(error)[:300]})
    details: dict[str, Any] = {
        "indices": [result.get("details") or {} for result in results],
        "errors": errors,
    }
    partial = bool(errors) or any(str(result.get("status") or "") == "partial" for result in results)
    return {
        "stored": sum(int(result.get("stored", 0) or 0) for result in results),
        "updated": sum(int(result.get("updated", 0) or 0) for result in results),
        "duplicates": 0,
        "skipped": sum(int(result.get("skipped", 0) or 0) for result in results),
        "status": "partial" if partial else "ok",
        "details": details,
        "job_state": {"refreshed": [result.get("index_id") for result in results]},
    }


def _china_wrap(handler: Callable[[CollectContext], dict[str, Any] | None],
                universe_key: str, china_provider: UniverseProvider | None):
    """Bind the China universe into the collector's settings before the run."""

    def run(context: CollectContext) -> dict[str, Any] | None:
        universe = china_provider() if china_provider is not None else {}
        context.settings["tracked_series"] = universe.get(universe_key, [])
        if universe_key == "commodities":
            context.settings["china_commodities"] = universe.get("commodities", [])
        return handler(context)

    return run


def _market_eod(series_provider: UniverseProvider):
    """Yahoo EOD pass followed by an opt-in Stooq gap-fill pass."""

    def run(context: CollectContext) -> dict[str, Any]:
        from .sources import market_stooq, market_yahoo

        universe = series_provider()
        context.settings["tracked_series"] = universe.get("eod", [])
        primary = market_yahoo.collect_eod(context) or {}
        fallback = {"stored": 0, "skipped": 0}
        if context.settings.get("stooq_fallback", False):
            try:
                context.settings["tracked_series"] = universe.get("eod", [])
                fallback = market_stooq.collect(context) or {}
            except Exception as error:  # noqa: BLE001 - fallback must not fail the job
                context.logger.warning("stooq fallback failed: %s", error)
                fallback = {"stored": 0, "skipped": 0}
        details = dict(primary.get("details") or {})
        details["stooq"] = fallback.get("details") or {}
        return {
            "stored": int(primary.get("stored", 0)) + int(fallback.get("stored", 0)),
            "updated": int(primary.get("updated", 0)) + int(fallback.get("updated", 0)),
            "duplicates": int(primary.get("duplicates", 0)) + int(fallback.get("duplicates", 0)),
            "skipped": int(primary.get("skipped", 0)) + int(fallback.get("skipped", 0)),
            "status": primary.get("status", "ok"),
            "details": details,
            "job_state": primary.get("job_state"),
        }

    return run


def _maintenance(context: CollectContext) -> dict[str, Any]:
    """Apply retention policies and refresh raw-document caches."""
    removed = context.warehouse.prune(
        raw_days=float(context.settings.get("raw_retention_days", 7)),
        observation_days=float(context.settings.get("observation_retention_days", 14)),
    )
    return {"stored": 0, "details": {"removed": removed}}


def register_jobs(
    runner: IngestionRunner,
    series_provider: UniverseProvider,
    *,
    china_provider: UniverseProvider | None = None,
    backfill_provider: UniverseProvider | None = None,
    imported_modules: dict[str, Any] | None = None,
) -> list[str]:
    """Attach handlers from ``JOB_DEFINITIONS`` and return job ids registered."""
    modules = imported_modules or _import_sources()
    handlers: dict[str, Callable[[CollectContext], dict[str, Any] | None]] = {
        "reference:seed": modules["reference_global"].collect,
        "reference:us": modules["reference_us"].collect,
        "company:index": modules["company_master"].collect,
        "company:profile": modules["company_profile"].collect,
        "china:index": _china_index,
        "china:quotes": _china_wrap(modules["market_yahoo"].collect_live, "live", china_provider),
        "china:eod": _china_wrap(modules["market_yahoo"].collect_eod, "eod", china_provider),
        "china:commodity:quotes": _china_wrap(
            modules["china_commodity"].collect_quotes, "commodities", china_provider,
        ),
        "china:commodity:eod": _china_wrap(
            modules["china_commodity"].collect_eod, "commodities", china_provider,
        ),
        "market:live": _wrap(modules["market_yahoo"].collect_live, "live", series_provider),
        "market:eod": _market_eod(series_provider),
        "index:daily": _wrap(modules["market_yahoo"].collect_indices, "indices", series_provider),
        "commodity:daily": _wrap(modules["market_yahoo"].collect_commodities, "commodities", series_provider),
        "news:rss": modules["news_rss"].collect,
        "news:content": modules["news_rss"].collect_content,
        "news:link": modules["news_linker"].collect,
        "market:backup:quotes": _wrap(
            modules["market_channels"].collect_quotes, "live", series_provider,
        ),
        "market:backup:eod": _wrap(
            modules["market_channels"].collect_eod, "eod", series_provider,
        ),
        "backfill:recent": _wrap(
            modules["backfill"].collect, "backfill",
            backfill_provider or series_provider,
        ),
        "backfill:annual": _wrap(
            modules["annual_backfill"].collect, "backfill",
            backfill_provider or series_provider,
        ),
        "market:intraday": _wrap(
            modules["market_intraday"].collect, "backfill",
            backfill_provider or series_provider,
        ),
        "maintenance:prune": _maintenance,
    }
    registered: list[str] = []
    for definition in JOB_DEFINITIONS:
        handler = handlers.get(definition.job_id)
        if handler is None:
            LOGGER.warning("no handler registered for job %s", definition.job_id)
            continue
        runner.register(JobSpec(
            job_id=definition.job_id,
            description=definition.description,
            domain=definition.domain,
            interval_s=definition.interval_s,
            source_ids=definition.source_ids,
            handler=handler,
            enabled=definition.enabled,
        ))
        registered.append(definition.job_id)
    return registered


def _import_sources() -> dict[str, Any]:
    """Import collector modules lazily so the foundation can run standalone."""
    from .indices import china_commodities, china_securities, company_master
    from .sources import (
        annual_backfill,
        backfill,
        china_commodity,
        company_profile,
        market_channels,
        market_intraday,
        market_stooq,
        market_yahoo,
        news_linker,
        news_rss,
        reference_global,
        reference_us,
    )

    return {
        "annual_backfill": annual_backfill,
        "backfill": backfill,
        "market_intraday": market_intraday,
        "china_commodities": china_commodities,
        "china_commodity": china_commodity,
        "china_securities": china_securities,
        "company_master": company_master,
        "company_profile": company_profile,
        "market_channels": market_channels,
        "market_stooq": market_stooq,
        "market_yahoo": market_yahoo,
        "news_linker": news_linker,
        "news_rss": news_rss,
        "reference_global": reference_global,
        "reference_us": reference_us,
    }


__all__ = ["UniverseProvider", "register_jobs"]
