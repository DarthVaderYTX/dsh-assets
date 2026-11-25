"""Job scheduling and run recording for the data collection layer.

Jobs are plain callables receiving a :class:`CollectContext` and returning a
dictionary of counters (``stored``, ``updated``, ``duplicates``, ``skipped``,
``details``).  The runner owns locking, due-time checks, run persistence and the
per-job cursor stored in ``ingest_job.last_summary``.
"""

from __future__ import annotations

import json
import logging
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from .errors import DataNotFoundError, JobRunningError
from .models import CollectContext, IngestResult, SourceSpec, to_iso, utc_now

LOGGER = logging.getLogger("market_monitor.data.runner")

#: Handler contract: return counters for the run, or None for a no-op.
JobHandler = Callable[[CollectContext], dict[str, Any] | None]


@dataclass
class JobSpec:
    """Static definition of one ingestion job."""

    job_id: str
    description: str
    domain: str
    interval_s: int
    source_ids: tuple[str, ...] = ()
    handler: JobHandler | None = None
    enabled: bool = True
    tags: tuple[str, ...] = field(default_factory=tuple)


class IngestionRunner:
    """Sequential, single-flight scheduler for collection jobs."""

    def __init__(
        self,
        warehouse: Any,
        http: Any,
        governor: Any,
        *,
        settings: dict[str, Any] | None = None,
        now_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        random_fn: Callable[[], float] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self.warehouse = warehouse
        self.http = http
        self.governor = governor
        self.settings = dict(settings or {})
        self._now = now_fn or time.time
        self._sleep = sleep_fn or time.sleep
        self._random = random_fn or random.random
        self.logger = logger or LOGGER
        self._jobs: dict[str, JobSpec] = {}
        self._locks: dict[str, threading.Lock] = {}
        #: One collection job at a time keeps host-level politeness (one request
        #: in flight per host) valid even when an API caller forces a job while
        #: the background loop is working.
        self._global_lock = threading.Lock()

    # -------------------------------------------------------------- registry

    def register(self, spec: JobSpec) -> None:
        """Register a job definition and persist its schedule row."""
        self._jobs[spec.job_id] = spec
        self._locks.setdefault(spec.job_id, threading.Lock())
        self.warehouse.ensure_job(spec.job_id, spec.description, spec.domain, spec.interval_s)
        if not spec.enabled:
            self.warehouse.update_job(spec.job_id, enabled=0)

    def register_all(self, specs: Iterable[JobSpec]) -> None:
        """Register several job definitions."""
        for spec in specs:
            self.register(spec)

    def specs(self) -> list[JobSpec]:
        """Registered job definitions."""
        return list(self._jobs.values())

    # ------------------------------------------------------------------- run

    def run(self, job_id: str, *, force: bool = False, dry_run: bool = False) -> IngestResult:
        """Run one job now (subject to budget checks inside collectors)."""
        spec = self._jobs.get(job_id)
        if spec is None or spec.handler is None:
            raise DataNotFoundError(f"Unknown ingestion job: {job_id}")
        if not self._global_lock.acquire(blocking=False):
            raise JobRunningError("Another collection job is running; retry shortly.")
        try:
            return self._run_locked(spec, force=force, dry_run=dry_run)
        finally:
            self._global_lock.release()

    def _run_locked(self, spec: JobSpec, *, force: bool, dry_run: bool) -> IngestResult:
        """Execute one job while the runner-wide lock is held."""
        job_id = spec.job_id
        lock = self._locks.setdefault(job_id, threading.Lock())
        if not lock.acquire(blocking=False):
            raise JobRunningError(f"Ingestion job {job_id} is already running.")
        started = self.now_iso()
        result = IngestResult(job_id=job_id, source_ids=list(spec.source_ids), started_at=started)
        requests_before = int(getattr(self.http, "request_count", 0))
        previous_dry = bool(getattr(self.http, "dry_run", False))
        try:
            job_row = self.warehouse.get_job(job_id) or {}
            if not bool(job_row.get("enabled", 1)) and not force:
                result.status = "skipped"
                result.details["reason"] = "job disabled"
                return result
            if not force and not dry_run and not self.is_due(job_id):
                result.status = "skipped"
                result.details["reason"] = "not due"
                return result

            state = self._read_job_state(job_id)
            context = CollectContext(
                warehouse=self.warehouse,
                http=self.http,
                settings={**self.settings, "dry_run": dry_run},
                now_fn=self._now,
                logger=self.logger,
                job_id=job_id,
                job_state=state,
            )
            self.http.dry_run = dry_run
            try:
                payload = spec.handler(context) or {}
            finally:
                self.http.dry_run = previous_dry

            result.requests = max(0, int(getattr(self.http, "request_count", 0)) - requests_before)
            result.stored = int(payload.get("stored", 0) or 0)
            result.updated = int(payload.get("updated", 0) or 0)
            result.duplicates = int(payload.get("duplicates", 0) or 0)
            result.skipped = int(payload.get("skipped", 0) or 0)
            result.status = str(payload.get("status", "ok"))
            result.error = str(payload.get("error", "") or "")
            details = payload.get("details")
            result.details = details if isinstance(details, dict) else {}
            job_state = payload.get("job_state")
            if isinstance(job_state, dict):
                self._write_job_state(job_id, job_state)
            if result.status not in ("ok", "partial", "skipped"):
                result.status = "ok"
            return result
        except Exception as error:  # noqa: BLE001 - one job must not kill the loop
            result.status = "error"
            result.error = str(error)[:800]
            result.details["exception"] = type(error).__name__
            self.logger.warning("ingestion job %s failed: %s", job_id, error)
            return result
        finally:
            result.finished_at = self.now_iso()
            if not dry_run:
                self._finish(job_id, spec, result)
            lock.release()

    def run_due(self, *, dry_run: bool = False) -> list[IngestResult]:
        """Run every enabled job whose schedule is due, in registration order."""
        results: list[IngestResult] = []
        for spec in self.specs():
            if not spec.enabled or spec.handler is None:
                continue
            if not self.is_due(spec.job_id):
                continue
            try:
                results.append(self.run(spec.job_id, dry_run=dry_run))
            except JobRunningError:
                self.logger.info("job %s already running; skipping this cycle", spec.job_id)
            except Exception as error:  # noqa: BLE001 - keep the loop alive
                self.logger.warning("could not start job %s: %s", spec.job_id, error)
        return results

    # --------------------------------------------------------------- schedule

    def is_due(self, job_id: str) -> bool:
        """True when the job should run now."""
        row = self.warehouse.get_job(job_id)
        if row is None:
            return True
        if not bool(row.get("enabled", 1)):
            return False
        next_due = row.get("next_due_at") or ""
        if not next_due:
            return True
        try:
            due_epoch = _iso_epoch(next_due)
        except ValueError:
            return True
        return due_epoch <= utc_now(self._now)

    def status(self) -> dict[str, Any]:
        """Job schedule state plus source budgets for the Data tab."""
        jobs = []
        for row in self.warehouse.list_jobs():
            jobs.append({
                "job_id": row["job_id"],
                "description": row["description"],
                "domain": row["domain"],
                "interval_s": row["interval_s"],
                "enabled": bool(row.get("enabled", 1)),
                "due": self.is_due(row["job_id"]) if row.get("enabled", 1) else False,
                "last_run_at": row.get("last_run_at"),
                "last_status": row.get("last_status"),
                "next_due_at": row.get("next_due_at"),
            })
        sources = [
            self.governor.remaining(source["source_id"])
            for source in self.warehouse.list_sources()
        ]
        return {"jobs": jobs, "sources": sources}

    # ------------------------------------------------------------- internals

    def _finish(self, job_id: str, spec: JobSpec, result: IngestResult) -> None:
        """Persist the run, schedule the next one and refresh job status."""
        now = utc_now(self._now)
        interval = max(30, int(spec.interval_s))
        jitter = interval * (0.9 + 0.2 * self._random())
        next_due = to_iso(now + jitter)
        try:
            self.warehouse.record_run(result)
            self.warehouse.update_job(
                job_id,
                last_run_at=result.finished_at or self.now_iso(),
                last_status=result.status,
                next_due_at=next_due,
            )
        except Exception as error:  # noqa: BLE001 - bookkeeping must not crash
            self.logger.warning("could not persist run for %s: %s", job_id, error)

    def _read_job_state(self, job_id: str) -> dict[str, Any]:
        """Read the cursor persisted on the previous run."""
        row = self.warehouse.get_job(job_id) or {}
        raw = row.get("last_summary") or ""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            return {}

    def _write_job_state(self, job_id: str, state: dict[str, Any]) -> None:
        """Persist the cursor for the next run."""
        try:
            self.warehouse.update_job(job_id, last_summary=json.dumps(state, sort_keys=True)[:8000])
        except Exception as error:  # noqa: BLE001 - cursor is best effort
            self.logger.warning("could not persist cursor for %s: %s", job_id, error)

    def now_iso(self) -> str:
        """Current ISO UTC timestamp."""
        return to_iso(utc_now(self._now))


def _iso_epoch(value: str) -> float:
    """Parse an ISO timestamp into epoch seconds (raises ``ValueError``)."""
    from .models import parse_iso

    parsed = parse_iso(value)
    if parsed is None:
        raise ValueError(value)
    return parsed.timestamp()


def build_runner(
    warehouse: Any,
    http: Any,
    governor: Any,
    *,
    settings: dict[str, Any] | None = None,
    now_fn: Callable[[], float] | None = None,
    sleep_fn: Callable[[float], None] | None = None,
    logger: logging.Logger | None = None,
) -> IngestionRunner:
    """Construct a runner with the standard clock/sleep pair."""
    return IngestionRunner(
        warehouse,
        http,
        governor,
        settings=settings,
        now_fn=now_fn,
        sleep_fn=sleep_fn,
        logger=logger,
    )


__all__ = ["IngestionRunner", "JobHandler", "JobSpec", "build_runner"]
