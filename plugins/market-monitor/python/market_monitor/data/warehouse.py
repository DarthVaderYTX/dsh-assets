"""SQLite warehouse for canonical reference data, market series and news.

The warehouse is separate from the disposable analysis cache in
``market_monitor.store``.  It only upserts facts and serves read queries; all
identifiers, timestamps and provenance columns follow ``docs/DATA.md``.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterable

from .models import (
    IngestResult,
    SourceSpec,
    to_iso,
    utc_now_iso,
)

LOGGER = logging.getLogger("market_monitor.data.warehouse")

SCHEMA_VERSION = 2

#: Columns accepted for each reference table. Rows are filtered to these keys so
#: a collector cannot break an insert by adding an unknown field.
TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "ref_exchange": (
        "mic", "code", "name", "country", "city", "timezone", "currency",
        "calendar", "website", "source_id", "observed_at", "updated_at",
    ),
    "ref_instrument": (
        "instrument_id", "symbol", "mic", "name", "short_name", "type",
        "currency", "country", "sector", "industry", "listing_status", "isin",
        "provider_symbol", "source_id", "valid_from", "valid_to",
        "first_seen_at", "updated_at",
    ),
    "ref_index": (
        "index_id", "code", "name", "region", "currency", "type", "venue",
        "provider_symbol", "constituents_count", "source_id", "valid_from",
        "valid_to", "updated_at",
    ),
    "ref_index_constituent": (
        "index_id", "instrument_id", "constituent_symbol", "name",
        "weight_pct", "valid_from", "valid_to", "source_id",
    ),
    "ref_commodity_root": (
        "root_id", "venue", "root", "name", "category", "unit", "currency",
        "provider_symbol", "source_id", "updated_at",
    ),
    "ref_commodity_contract": (
        "contract_id", "root_id", "venue", "root", "contract_month",
        "first_trade_date", "last_trade_date", "provider_symbol", "source_id",
        "updated_at",
    ),
    "ref_alias": (
        "alias", "entity_type", "entity_id", "alias_type", "language",
        "source_id",
    ),
    "market_bar": (
        "series_id", "interval", "ts", "open", "high", "low", "close",
        "volume", "source_id", "observed_at", "ingested_at", "quality",
    ),
    "market_quote_latest": (
        "series_id", "ts", "price", "prev_close", "change_pct", "change_type",
        "volume", "currency", "source_id", "observed_at", "updated_at",
    ),
    "news_source": (
        "source_id", "name", "kind", "language", "country", "homepage",
        "feed_url", "license_note", "enabled", "updated_at",
    ),
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ref_exchange (
    mic TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    country TEXT,
    city TEXT,
    timezone TEXT,
    currency TEXT,
    calendar TEXT,
    website TEXT,
    source_id TEXT,
    observed_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ref_instrument (
    instrument_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    mic TEXT NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT,
    currency TEXT,
    country TEXT,
    sector TEXT,
    industry TEXT,
    listing_status TEXT,
    isin TEXT,
    provider_symbol TEXT,
    source_id TEXT,
    valid_from TEXT,
    valid_to TEXT,
    first_seen_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_instrument_symbol ON ref_instrument(symbol);
CREATE INDEX IF NOT EXISTS idx_instrument_mic ON ref_instrument(mic);
CREATE INDEX IF NOT EXISTS idx_instrument_provider ON ref_instrument(provider_symbol);
CREATE TABLE IF NOT EXISTS ref_index (
    index_id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    region TEXT,
    currency TEXT,
    type TEXT,
    venue TEXT,
    provider_symbol TEXT,
    constituents_count INTEGER,
    source_id TEXT,
    valid_from TEXT,
    valid_to TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ref_index_constituent (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    constituent_symbol TEXT,
    name TEXT,
    weight_pct REAL,
    valid_from TEXT,
    valid_to TEXT,
    source_id TEXT,
    UNIQUE(index_id, instrument_id, valid_from)
);
CREATE TABLE IF NOT EXISTS ref_commodity_root (
    root_id TEXT PRIMARY KEY,
    venue TEXT NOT NULL,
    root TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    currency TEXT,
    provider_symbol TEXT,
    source_id TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ref_commodity_contract (
    contract_id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL,
    venue TEXT NOT NULL,
    root TEXT NOT NULL,
    contract_month TEXT NOT NULL,
    first_trade_date TEXT,
    last_trade_date TEXT,
    provider_symbol TEXT,
    source_id TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ref_alias (
    alias TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    alias_type TEXT NOT NULL,
    language TEXT,
    source_id TEXT,
    PRIMARY KEY (alias, entity_type, entity_id, alias_type)
);
CREATE INDEX IF NOT EXISTS idx_alias_entity ON ref_alias(entity_id);
CREATE TABLE IF NOT EXISTS market_bar (
    series_id TEXT NOT NULL,
    interval TEXT NOT NULL,
    ts TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    source_id TEXT,
    observed_at TEXT,
    ingested_at TEXT,
    quality TEXT DEFAULT 'final',
    PRIMARY KEY (series_id, interval, ts)
);
CREATE INDEX IF NOT EXISTS idx_bar_ts ON market_bar(ts);
CREATE TABLE IF NOT EXISTS market_quote_latest (
    series_id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    price REAL,
    prev_close REAL,
    change_pct REAL,
    change_type TEXT,
    volume REAL,
    currency TEXT,
    source_id TEXT,
    observed_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS market_quote_observation (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    price REAL,
    change_pct REAL,
    volume REAL,
    source_id TEXT,
    UNIQUE(series_id, ts)
);
CREATE TABLE IF NOT EXISTS news_source (
    source_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT,
    language TEXT,
    country TEXT,
    homepage TEXT,
    feed_url TEXT,
    license_note TEXT,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS news_article (
    article_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    body TEXT,
    language TEXT,
    author TEXT,
    published_at TEXT,
    updated_at TEXT,
    fetched_at TEXT,
    topics TEXT,
    content_hash TEXT,
    duplicate_of TEXT,
    UNIQUE(canonical_url)
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_article(published_at);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_article(source_id);
CREATE TABLE IF NOT EXISTS news_entity (
    article_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    confidence REAL,
    method TEXT,
    PRIMARY KEY (article_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_news_entity_entity ON news_entity(entity_id);
CREATE TABLE IF NOT EXISTS raw_document (
    doc_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,
    status INTEGER,
    content_type TEXT,
    etag TEXT,
    last_modified TEXT,
    sha256 TEXT,
    body_text TEXT,
    bytes INTEGER,
    fetched_at TEXT,
    UNIQUE(source_id, url)
);
CREATE TABLE IF NOT EXISTS ingest_source (
    source_id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    kind TEXT,
    provider TEXT,
    enabled INTEGER DEFAULT 1,
    min_interval_s REAL DEFAULT 3,
    max_per_hour INTEGER DEFAULT 60,
    max_per_day INTEGER DEFAULT 600,
    used_hour INTEGER DEFAULT 0,
    hour_window TEXT,
    used_day INTEGER DEFAULT 0,
    budget_date TEXT,
    next_allowed_at TEXT,
    consecutive_blocks INTEGER DEFAULT 0,
    circuit_open_until TEXT,
    etag TEXT,
    last_modified TEXT,
    last_run_at TEXT,
    last_success_at TEXT,
    last_error TEXT
);
CREATE TABLE IF NOT EXISTS ingest_job (
    job_id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    domain TEXT NOT NULL,
    interval_s INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run_at TEXT,
    last_status TEXT,
    next_due_at TEXT,
    last_summary TEXT
);
CREATE TABLE IF NOT EXISTS ingest_run (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    source_id TEXT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    requests INTEGER DEFAULT 0,
    stored INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    error TEXT,
    details TEXT
);
CREATE INDEX IF NOT EXISTS idx_run_job ON ingest_run(job_id, run_id);
CREATE TABLE IF NOT EXISTS index_def (
    index_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    markets TEXT,
    source_ids TEXT,
    refresh_interval_s INTEGER,
    enabled INTEGER DEFAULT 1,
    revision INTEGER DEFAULT 0,
    entries INTEGER DEFAULT 0,
    active INTEGER DEFAULT 0,
    missing INTEGER DEFAULT 0,
    delisted INTEGER DEFAULT 0,
    pending_profiles INTEGER DEFAULT 0,
    last_refresh_at TEXT,
    next_refresh_at TEXT,
    last_status TEXT,
    last_summary TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS index_entry (
    index_id TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    market TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    revision INTEGER DEFAULT 1,
    misses INTEGER DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    valid_from TEXT,
    valid_to TEXT,
    source_id TEXT,
    payload TEXT,
    profile_status TEXT DEFAULT 'pending',
    profile_synced_at TEXT,
    profile_attempts INTEGER DEFAULT 0,
    profile_error TEXT,
    updated_at TEXT,
    PRIMARY KEY (index_id, entry_key)
);
CREATE INDEX IF NOT EXISTS idx_index_entry_market ON index_entry(index_id, market, status);
CREATE INDEX IF NOT EXISTS idx_index_entry_profile ON index_entry(index_id, profile_status);
CREATE INDEX IF NOT EXISTS idx_index_entry_entity ON index_entry(entity_id);
CREATE TABLE IF NOT EXISTS index_change (
    change_id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    entity_id TEXT,
    market TEXT,
    change_type TEXT NOT NULL,
    changed_fields TEXT,
    observed_at TEXT,
    revision INTEGER,
    source_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_index_change_index ON index_change(index_id, change_id);
CREATE TABLE IF NOT EXISTS index_refresh (
    refresh_id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    entries_seen INTEGER DEFAULT 0,
    added INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    removed INTEGER DEFAULT 0,
    restored INTEGER DEFAULT 0,
    delisted INTEGER DEFAULT 0,
    profiles_queued INTEGER DEFAULT 0,
    requests INTEGER DEFAULT 0,
    error TEXT,
    details TEXT
);
CREATE INDEX IF NOT EXISTS idx_index_refresh_index ON index_refresh(index_id, refresh_id);
CREATE TABLE IF NOT EXISTS company_profile (
    entity_id TEXT PRIMARY KEY,
    market TEXT,
    legal_name TEXT,
    sic TEXT,
    sic_description TEXT,
    state_of_incorporation TEXT,
    fiscal_year_end TEXT,
    website TEXT,
    address TEXT,
    former_names TEXT,
    tickers TEXT,
    exchanges TEXT,
    source_id TEXT,
    observed_at TEXT,
    fetched_at TEXT
);
"""


def _days_ago_iso(days: float, now: float | None = None) -> str:
    """ISO timestamp ``days`` before now."""
    return to_iso((now if now is not None else time.time()) - float(days) * 86400.0)


class DataWarehouse:
    """Thread-safe SQLite warehouse with one connection per instance."""

    def __init__(self, path: str | Path | None = None, now_fn: Callable[[], float] | None = None) -> None:
        self.path = str(path) if path is not None else ":memory:"
        self._now_fn = now_fn or time.time
        self._lock = threading.RLock()
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False, timeout=30)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA busy_timeout=15000")
            self._conn.executescript(_SCHEMA)
            self._conn.execute(
                "INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            self._conn.commit()

    # ------------------------------------------------------------- lifecycle

    @property
    def schema_version(self) -> int:
        """Schema version recorded in the database."""
        row = self._one("SELECT value FROM schema_meta WHERE key='schema_version'")
        return int(row["value"]) if row else 0

    def close(self) -> None:
        """Close the connection; safe to call twice."""
        with self._lock:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass

    def _now_iso(self) -> str:
        """Warehouse-clock ISO timestamp."""
        return utc_now_iso(self._now_fn)

    def _execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        """Run one statement under the connection lock."""
        with self._lock:
            return self._conn.execute(sql, tuple(params))

    def _executemany(self, sql: str, rows: Iterable[Iterable[Any]]) -> sqlite3.Cursor:
        """Run one statement for many rows under the connection lock."""
        with self._lock:
            return self._conn.executemany(sql, [tuple(row) for row in rows])

    def _one(self, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
        """Run a select returning one row as a dict."""
        row = self._execute(sql, params).fetchone()
        return dict(row) if row is not None else None

    def _all(self, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        """Run a select returning all rows as dicts."""
        return [dict(row) for row in self._execute(sql, params).fetchall()]

    def _commit(self) -> None:
        """Commit the current transaction."""
        with self._lock:
            self._conn.commit()

    def _upsert(
        self,
        table: str,
        rows: list[dict[str, Any]],
        conflict_columns: tuple[str, ...],
        update_columns: Iterable[str] | None = None,
    ) -> int:
        """Upsert rows into ``table`` (filtered to known columns)."""
        if not rows:
            return 0
        allowed = TABLE_COLUMNS[table]
        allowed_set = set(allowed)
        update = [column for column in allowed if column not in conflict_columns]
        if update_columns is not None:
            wanted = set(update_columns)
            update = [column for column in update if column in wanted]
        columns = list(allowed)
        statements = [
            tuple(row.get(column) for column in columns)
            for row in rows
        ]
        placeholders = ", ".join("?" for _ in columns)
        conflict = ", ".join(conflict_columns)
        if update:
            update_sql = ", ".join(f"{column}=excluded.{column}" for column in update)
            sql = (
                f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "
                f"ON CONFLICT({conflict}) DO UPDATE SET {update_sql}"
            )
        else:
            sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
        self._executemany(sql, statements)
        self._commit()
        return len(rows)

    # ------------------------------------------------------- source registry

    def ensure_source(self, spec: SourceSpec | dict[str, Any]) -> dict[str, Any]:
        """Register a source without clobbering runtime counters."""
        record = spec.to_dict() if isinstance(spec, SourceSpec) else dict(spec)
        self._execute(
            "INSERT INTO ingest_source (source_id, domain, kind, provider, enabled, "
            "min_interval_s, max_per_hour, max_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(source_id) DO UPDATE SET domain=excluded.domain, kind=excluded.kind, "
            "provider=excluded.provider, enabled=excluded.enabled, "
            "min_interval_s=excluded.min_interval_s, max_per_hour=excluded.max_per_hour, "
            "max_per_day=excluded.max_per_day",
            (
                record["source_id"],
                record.get("domain", "reference"),
                record.get("kind", ""),
                record.get("provider", ""),
                int(record.get("enabled", 1)),
                float(record.get("min_interval_s", 3.0)),
                int(record.get("max_per_hour", 60)),
                int(record.get("max_per_day", 600)),
            ),
        )
        self._commit()
        state = self.get_source(record["source_id"])
        assert state is not None
        return state

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        """Read one source state."""
        return self._one("SELECT * FROM ingest_source WHERE source_id=?", (source_id,))

    def update_source(self, source_id: str, **fields: Any) -> None:
        """Update whitelisted runtime fields of one source."""
        allowed = {
            "enabled", "used_hour", "hour_window", "used_day", "budget_date",
            "next_allowed_at", "consecutive_blocks", "circuit_open_until", "etag",
            "last_modified", "last_run_at", "last_success_at", "last_error",
        }
        updates = {key: value for key, value in fields.items() if key in allowed}
        if not updates:
            return
        assignments = ", ".join(f"{key}=?" for key in updates)
        self._execute(
            f"UPDATE ingest_source SET {assignments} WHERE source_id=?",
            (*updates.values(), source_id),
        )
        self._commit()

    def list_sources(self, domain: str | None = None) -> list[dict[str, Any]]:
        """List registered sources, optionally for one domain."""
        if domain:
            return self._all("SELECT * FROM ingest_source WHERE domain=? ORDER BY source_id", (domain,))
        return self._all("SELECT * FROM ingest_source ORDER BY domain, source_id")

    # ---------------------------------------------------------- raw documents

    def record_raw_document(self, document: dict[str, Any]) -> None:
        """Store a fetched document for conditional requests and re-parsing."""
        record = {
            "doc_id": document["doc_id"],
            "source_id": document["source_id"],
            "url": document["url"],
            "status": int(document.get("status") or 0),
            "content_type": document.get("content_type") or "",
            "etag": document.get("etag") or "",
            "last_modified": document.get("last_modified") or "",
            "sha256": document.get("sha256") or "",
            "body_text": document.get("body_text") or "",
            "bytes": int(document.get("bytes") or 0),
            "fetched_at": document.get("fetched_at") or self._now_iso(),
        }
        columns = list(record.keys())
        self._execute(
            f"INSERT INTO raw_document ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)}) "
            "ON CONFLICT(source_id, url) DO UPDATE SET status=excluded.status, "
            "content_type=excluded.content_type, etag=excluded.etag, "
            "last_modified=excluded.last_modified, sha256=excluded.sha256, "
            "body_text=excluded.body_text, bytes=excluded.bytes, fetched_at=excluded.fetched_at",
            tuple(record[column] for column in columns),
        )
        self._commit()

    def get_raw_document(self, source_id: str, url: str) -> dict[str, Any] | None:
        """Read the cached document descriptor (and body) for a URL."""
        return self._one("SELECT * FROM raw_document WHERE source_id=? AND url=?", (source_id, url))

    def prune_raw_documents(self, keep_days: float = 7, max_rows: int = 2000) -> int:
        """Drop old or excess raw documents; returns removed rows."""
        cutoff = _days_ago_iso(keep_days, self._now_fn())
        cursor = self._execute("DELETE FROM raw_document WHERE fetched_at < ?", (cutoff,))
        removed = cursor.rowcount
        self._execute(
            "DELETE FROM raw_document WHERE doc_id NOT IN "
            "(SELECT doc_id FROM raw_document ORDER BY fetched_at DESC LIMIT ?)",
            (max_rows,),
        )
        self._commit()
        return max(removed, 0)

    # ------------------------------------------------------------------ jobs

    def ensure_job(self, job_id: str, description: str, domain: str, interval_s: int) -> None:
        """Register a job without overwriting its schedule state."""
        self._execute(
            "INSERT INTO ingest_job (job_id, description, domain, interval_s) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(job_id) DO UPDATE SET description=excluded.description, "
            "domain=excluded.domain, interval_s=excluded.interval_s",
            (job_id, description, domain, int(interval_s)),
        )
        self._commit()

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        """Read one job row."""
        return self._one("SELECT * FROM ingest_job WHERE job_id=?", (job_id,))

    def list_jobs(self) -> list[dict[str, Any]]:
        """List every registered job."""
        return self._all("SELECT * FROM ingest_job ORDER BY job_id")

    def update_job(self, job_id: str, **fields: Any) -> None:
        """Update schedule/state fields of one job."""
        allowed = {"enabled", "last_run_at", "last_status", "next_due_at", "last_summary"}
        updates = {key: value for key, value in fields.items() if key in allowed}
        if not updates:
            return
        assignments = ", ".join(f"{key}=?" for key in updates)
        self._execute(f"UPDATE ingest_job SET {assignments} WHERE job_id=?", (*updates.values(), job_id))
        self._commit()

    def record_run(self, result: IngestResult) -> int:
        """Persist one ingestion run and return its row id."""
        cursor = self._execute(
            "INSERT INTO ingest_run (job_id, source_id, started_at, finished_at, status, requests, "
            "stored, updated, duplicates, skipped, error, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                result.job_id,
                ",".join(result.source_ids)[:255],
                result.started_at,
                result.finished_at,
                result.status,
                int(result.requests),
                int(result.stored),
                int(result.updated),
                int(result.duplicates),
                int(result.skipped),
                result.error,
                json.dumps(result.details, ensure_ascii=False, sort_keys=True),
            ),
        )
        self._commit()
        return int(cursor.lastrowid or 0)

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        """Most recent ingestion runs, newest first."""
        rows = self._all("SELECT * FROM ingest_run ORDER BY run_id DESC LIMIT ?", (max(1, int(limit)),))
        for row in rows:
            try:
                row["details"] = json.loads(row.get("details") or "{}")
            except (TypeError, ValueError):
                row["details"] = {}
        return rows

    # --------------------------------------------------------------- reference

    def upsert_exchanges(self, rows: list[dict[str, Any]]) -> int:
        """Upsert exchange reference rows."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("observed_at", now)
            record.setdefault("updated_at", now)
            prepared.append(record)
        return self._upsert("ref_exchange", prepared, ("mic",))

    def upsert_instruments(self, rows: list[dict[str, Any]]) -> int:
        """Upsert instrument reference rows, filling provenance defaults."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("updated_at", now)
            record.setdefault("first_seen_at", now)
            record.setdefault("valid_from", now)
            prepared.append(record)
        return self._upsert(
            "ref_instrument",
            prepared,
            ("instrument_id",),
            update_columns=(
                "symbol", "mic", "name", "short_name", "type", "currency", "country",
                "sector", "industry", "listing_status", "isin", "provider_symbol",
                "source_id", "updated_at", "valid_from",
            ),
        )

    def upsert_indices(self, rows: list[dict[str, Any]]) -> int:
        """Upsert index reference rows."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("updated_at", now)
            record.setdefault("valid_from", now)
            prepared.append(record)
        return self._upsert("ref_index", prepared, ("index_id",))

    def upsert_index_constituents(self, rows: list[dict[str, Any]]) -> int:
        """Upsert index constituents (snapshot semantics per valid_from)."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("valid_from", now[:10])
            prepared.append(record)
        return self._upsert(
            "ref_index_constituent",
            prepared,
            ("index_id", "instrument_id", "valid_from"),
        )

    def upsert_commodity_roots(self, rows: list[dict[str, Any]]) -> int:
        """Upsert commodity root definitions."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("updated_at", now)
            prepared.append(record)
        return self._upsert("ref_commodity_root", prepared, ("root_id",))

    def upsert_commodity_contracts(self, rows: list[dict[str, Any]]) -> int:
        """Upsert commodity contract definitions."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("updated_at", now)
            prepared.append(record)
        return self._upsert("ref_commodity_contract", prepared, ("contract_id",))

    def upsert_aliases(self, rows: list[dict[str, Any]]) -> int:
        """Upsert alias rows used by the news linker and fusion queries."""
        clean = []
        for row in rows:
            alias = str(row.get("alias") or "").strip()
            if not alias:
                continue
            clean.append({
                "alias": alias[:160],
                "entity_type": row.get("entity_type", ""),
                "entity_id": row.get("entity_id", ""),
                "alias_type": row.get("alias_type", ""),
                "language": row.get("language", "en"),
                "source_id": row.get("source_id", ""),
            })
        return self._upsert("ref_alias", clean, ("alias", "entity_type", "entity_id", "alias_type"))

    def list_exchanges(self) -> list[dict[str, Any]]:
        """List exchange reference rows."""
        return self._all("SELECT * FROM ref_exchange ORDER BY mic")

    def list_instruments(
        self,
        mic: str | None = None,
        query: str | None = None,
        instrument_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Search instruments by exchange, name or ticker."""
        sql = "SELECT * FROM ref_instrument WHERE 1=1"
        params: list[Any] = []
        if mic:
            sql += " AND mic=?"
            params.append(mic.upper())
        if instrument_type:
            sql += " AND type=?"
            params.append(instrument_type)
        if query:
            like = f"%{query.strip()}%"
            sql += " AND (symbol LIKE ? OR name LIKE ? OR instrument_id LIKE ?)"
            params.extend([like, like, like])
        sql += " ORDER BY mic, symbol LIMIT ? OFFSET ?"
        params.extend([max(1, int(limit)), max(0, int(offset))])
        return self._all(sql, params)

    def count_instruments(self, mic: str | None = None) -> int:
        """Count instruments, optionally for one exchange."""
        if mic:
            row = self._one("SELECT COUNT(*) AS n FROM ref_instrument WHERE mic=?", (mic.upper(),))
        else:
            row = self._one("SELECT COUNT(*) AS n FROM ref_instrument")
        return int(row["n"]) if row else 0

    def get_instrument(self, instrument_id_value: str) -> dict[str, Any] | None:
        """Read one instrument by canonical id."""
        return self._one("SELECT * FROM ref_instrument WHERE instrument_id=?", (instrument_id_value,))

    def find_instrument_by_provider_symbol(self, symbol: str) -> dict[str, Any] | None:
        """Look up an instrument by the provider symbol (for example ``AAPL``)."""
        value = str(symbol or "").strip().upper()
        if not value:
            return None
        row = self._one(
            "SELECT * FROM ref_instrument WHERE provider_symbol=? OR symbol=? "
            "ORDER BY CASE WHEN provider_symbol=? THEN 0 ELSE 1 END LIMIT 1",
            (value, value, value),
        )
        return row

    def find_commodity_root_by_provider_symbol(self, symbol: str) -> dict[str, Any] | None:
        """Look up a continuous commodity root by its provider symbol (``AU0``)."""
        value = str(symbol or "").strip().upper()
        if not value:
            return None
        return self._one(
            "SELECT * FROM ref_commodity_root WHERE UPPER(provider_symbol)=? "
            "ORDER BY updated_at DESC LIMIT 1",
            (value,),
        )

    def set_instrument_status(
        self, instrument_id: str, listing_status: str, valid_to: str | None = None,
    ) -> int:
        """Update lifecycle columns on an instrument without deleting its row."""
        cursor = self._execute(
            "UPDATE ref_instrument SET listing_status=?, valid_to=?, updated_at=? "
            "WHERE instrument_id=?",
            (listing_status, valid_to, self._now_iso(), instrument_id),
        )
        self._commit()
        return max(0, int(cursor.rowcount or 0))

    def list_indices(self, query: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """List or search index definitions."""
        sql = "SELECT * FROM ref_index"
        params: list[Any] = []
        if query:
            like = f"%{query.strip()}%"
            sql += " WHERE code LIKE ? OR name LIKE ?"
            params.extend([like, like])
        sql += " ORDER BY index_id LIMIT ?"
        params.append(max(1, int(limit)))
        return self._all(sql, params)

    def get_index(self, index_id_value: str) -> dict[str, Any] | None:
        """Read one index by canonical id."""
        return self._one("SELECT * FROM ref_index WHERE index_id=?", (index_id_value,))

    def list_commodity_roots(self) -> list[dict[str, Any]]:
        """List commodity root definitions."""
        return self._all("SELECT * FROM ref_commodity_root ORDER BY venue, root")

    def list_commodity_contracts(self, root_id: str | None = None) -> list[dict[str, Any]]:
        """List commodity contracts, optionally for one root."""
        if root_id:
            return self._all(
                "SELECT * FROM ref_commodity_contract WHERE root_id=? ORDER BY contract_month",
                (root_id,),
            )
        return self._all("SELECT * FROM ref_commodity_contract ORDER BY root_id, contract_month")

    def list_aliases(self, limit: int = 20000) -> list[dict[str, Any]]:
        """List alias rows for the news linker dictionary."""
        return self._all("SELECT * FROM ref_alias LIMIT ?", (max(1, int(limit)),))

    # ------------------------------------------------------------ market data

    def upsert_bars(
        self,
        rows: list[dict[str, Any]],
        source_id: str,
        quality: str = "final",
    ) -> int:
        """Upsert OHLCV bars keyed by ``(series_id, interval, ts)``."""
        if not rows:
            return 0
        now = self._now_iso()
        prepared = []
        for row in rows:
            prepared.append({
                "series_id": row["series_id"],
                "interval": row.get("interval", "1d"),
                "ts": row["ts"],
                "open": row.get("open", row.get("o")),
                "high": row.get("high", row.get("h")),
                "low": row.get("low", row.get("l")),
                "close": row.get("close", row.get("c")),
                "volume": row.get("volume", row.get("v")),
                "source_id": row.get("source_id", source_id),
                "observed_at": row.get("observed_at", now),
                "ingested_at": now,
                "quality": row.get("quality", quality),
            })
        return self._upsert(
            "market_bar",
            prepared,
            ("series_id", "interval", "ts"),
            update_columns=(
                "open", "high", "low", "close", "volume", "source_id", "observed_at",
                "ingested_at", "quality",
            ),
        )

    def get_bars(
        self,
        series_id_value: str,
        interval: str = "1d",
        start: str | None = None,
        end: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        """Read bars ascending by timestamp."""
        sql = "SELECT * FROM market_bar WHERE series_id=? AND interval=?"
        params: list[Any] = [series_id_value, interval]
        if start:
            sql += " AND ts >= ?"
            params.append(start)
        if end:
            sql += " AND ts <= ?"
            params.append(end)
        sql += " ORDER BY ts DESC LIMIT ?"
        params.append(max(1, int(limit)))
        rows = self._all(sql, params)
        rows.reverse()
        return rows

    def latest_bar(self, series_id_value: str, interval: str = "1d") -> dict[str, Any] | None:
        """Most recent bar for a series."""
        return self._one(
            "SELECT * FROM market_bar WHERE series_id=? AND interval=? ORDER BY ts DESC LIMIT 1",
            (series_id_value, interval),
        )

    def latest_bar_ts(self, series_id_value: str, interval: str = "1d") -> str | None:
        """Timestamp of the most recent bar, or ``None``."""
        row = self._one(
            "SELECT ts FROM market_bar WHERE series_id=? AND interval=? ORDER BY ts DESC LIMIT 1",
            (series_id_value, interval),
        )
        return row["ts"] if row else None

    def series_bar_span(
        self, series_id_value: str, interval: str = "1d",
    ) -> dict[str, Any] | None:
        """Return ``{count, first_ts, last_ts}`` for one series/interval."""
        row = self._one(
            "SELECT COUNT(*) AS n, MIN(ts) AS first_ts, MAX(ts) AS last_ts "
            "FROM market_bar WHERE series_id=? AND interval=?",
            (series_id_value, str(interval or "1d")),
        )
        if not row or int(row["n"] or 0) == 0:
            return None
        return {
            "count": int(row["n"]),
            "first_ts": row["first_ts"],
            "last_ts": row["last_ts"],
        }

    def bar_coverage_since(self, since: str, interval: str = "1d") -> dict[str, dict[str, Any]]:
        """Per-series bar count since ``since`` for one interval.

        Returns ``{series_id: {"count": n, "last_ts": <max ts in window>}}``.
        Used by the background backfill job to find sparse recent history.
        """
        rows = self._all(
            "SELECT series_id, COUNT(*) AS n, MAX(ts) AS last_ts FROM market_bar "
            "WHERE interval=? AND ts>=? GROUP BY series_id",
            (str(interval or "1d"), str(since)),
        )
        return {
            str(row["series_id"]): {
                "count": int(row["n"] or 0),
                "last_ts": row["last_ts"],
            }
            for row in rows
        }

    def latest_bar_map(self, interval: str = "1d") -> dict[str, str]:
        """Map every series with stored bars to its latest bar timestamp."""
        rows = self._all(
            "SELECT series_id, MAX(ts) AS last_ts FROM market_bar "
            "WHERE interval=? GROUP BY series_id",
            (str(interval or "1d"),),
        )
        return {str(row["series_id"]): row["last_ts"] for row in rows}

    def upsert_quote_latest(self, rows: list[dict[str, Any]]) -> int:
        """Upsert the latest quote per series."""
        if not rows:
            return 0
        now = self._now_iso()
        prepared = []
        for row in rows:
            prepared.append({
                "series_id": row["series_id"],
                "ts": row.get("ts", now),
                "price": row.get("price"),
                "prev_close": row.get("prev_close"),
                "change_pct": row.get("change_pct"),
                "change_type": row.get("change_type", "percent"),
                "volume": row.get("volume"),
                "currency": row.get("currency"),
                "source_id": row.get("source_id", ""),
                "observed_at": row.get("observed_at", now),
                "updated_at": now,
            })
        return self._upsert("market_quote_latest", prepared, ("series_id",))

    def get_quote_latest(self, series_id_value: str) -> dict[str, Any] | None:
        """Read the latest quote for one series."""
        return self._one("SELECT * FROM market_quote_latest WHERE series_id=?", (series_id_value,))

    def delete_quote_latest(self, series_id_value: str) -> int:
        """Remove a persisted latest quote (used when a source snapshot is stale)."""
        cursor = self._execute(
            "DELETE FROM market_quote_latest WHERE series_id=?", (series_id_value,),
        )
        self._commit()
        return max(0, int(cursor.rowcount or 0))

    def delete_bar(
        self, series_id_value: str, interval: str, ts: str, quality: str | None = None,
    ) -> int:
        """Delete one bar row, optionally only when it has a given quality."""
        sql = "DELETE FROM market_bar WHERE series_id=? AND interval=? AND ts=?"
        params: list[Any] = [series_id_value, interval, ts]
        if quality is not None:
            sql += " AND quality=?"
            params.append(quality)
        cursor = self._execute(sql, params)
        self._commit()
        return max(0, int(cursor.rowcount or 0))

    def insert_quote_observations(self, rows: list[dict[str, Any]]) -> int:
        """Append quote observations, ignoring same-series/time duplicates."""
        if not rows:
            return 0
        before = self._total_changes()
        self._executemany(
            "INSERT OR IGNORE INTO market_quote_observation "
            "(series_id, ts, price, change_pct, volume, source_id) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    row["series_id"], row["ts"], row.get("price"), row.get("change_pct"),
                    row.get("volume"), row.get("source_id", ""),
                )
                for row in rows
            ],
        )
        self._commit()
        return max(0, self._total_changes() - before)

    def _total_changes(self) -> int:
        """Connection-level change counter for insert accounting."""
        row = self._one("SELECT total_changes() AS n")
        return int(row["n"]) if row else 0

    def prune_quote_observations(self, keep_days: float = 14) -> int:
        """Drop quote observations older than the retention window."""
        cutoff = _days_ago_iso(keep_days, self._now_fn())
        cursor = self._execute("DELETE FROM market_quote_observation WHERE ts < ?", (cutoff,))
        self._commit()
        return max(0, cursor.rowcount)

    # ------------------------------------------------------------------- news

    def upsert_news_sources(self, rows: list[dict[str, Any]]) -> int:
        """Upsert news source registry rows."""
        now = self._now_iso()
        prepared = []
        for row in rows:
            record = dict(row)
            record.setdefault("updated_at", now)
            prepared.append(record)
        return self._upsert("news_source", prepared, ("source_id",))

    def list_news_sources(self) -> list[dict[str, Any]]:
        """List news source registry rows."""
        return self._all("SELECT * FROM news_source ORDER BY source_id")

    def insert_news_articles(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        """Insert articles with de-duplication by id and canonical URL."""
        if not rows:
            return {"stored": 0, "duplicates": 0, "article_ids": []}
        stored = 0
        duplicates = 0
        article_ids: list[str] = []
        with self._lock:
            for row in rows:
                cursor = self._conn.execute(
                    "INSERT OR IGNORE INTO news_article "
                    "(article_id, source_id, url, canonical_url, title, summary, body, language, "
                    "author, published_at, updated_at, fetched_at, topics, content_hash, duplicate_of) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        row["article_id"], row["source_id"], row["url"], row["canonical_url"],
                        row["title"], row.get("summary", ""), row.get("body", ""),
                        row.get("language", "en"), row.get("author", ""),
                        row.get("published_at", ""), row.get("updated_at", ""),
                        row.get("fetched_at", self._now_iso()),
                        json.dumps(row.get("topics", []), ensure_ascii=False),
                        row.get("content_hash", ""), row.get("duplicate_of", ""),
                    ),
                )
                if cursor.rowcount > 0:
                    stored += 1
                    article_ids.append(row["article_id"])
                else:
                    duplicates += 1
            self._conn.commit()
        return {"stored": stored, "duplicates": duplicates, "article_ids": article_ids}

    def update_news_content(self, article_id: str, content: str) -> bool:
        """Replace one article's readable content (``body``) after page extraction."""
        if not article_id:
            return False
        cursor = self._execute(
            "UPDATE news_article SET body=? WHERE article_id=?",
            (str(content or ""), str(article_id)),
        )
        self._commit()
        return int(cursor.rowcount or 0) > 0

    def list_news_needing_content(self, limit: int = 20) -> list[dict[str, Any]]:
        """Recent stored articles whose content is still short or summary-only."""
        return self._all(
            "SELECT article_id, source_id, url, title, summary, body "
            "FROM news_article "
            "WHERE length(trim(COALESCE(body, ''))) < 1200 "
            "ORDER BY published_at DESC LIMIT ?",
            (max(1, min(200, int(limit))),),
        )

    def link_news_entities(self, article_id: str, links: list[dict[str, Any]]) -> int:
        """Insert entity links for one article (idempotent)."""
        if not links:
            return 0
        before = self._total_changes()
        self._executemany(
            "INSERT OR IGNORE INTO news_entity (article_id, entity_type, entity_id, confidence, method) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                (
                    article_id, link["entity_type"], link["entity_id"],
                    float(link.get("confidence", 0.5)), link.get("method", "mention"),
                )
                for link in links
            ],
        )
        self._commit()
        return max(0, self._total_changes() - before)

    def replace_news_entities(self, article_id: str, links: list[dict[str, Any]]) -> int:
        """Replace all entity links of one article with a re-computed set."""
        with self._lock:
            self._conn.execute("DELETE FROM news_entity WHERE article_id=?", (article_id,))
            inserted = 0
            for link in links:
                cursor = self._conn.execute(
                    "INSERT OR IGNORE INTO news_entity "
                    "(article_id, entity_type, entity_id, confidence, method) VALUES (?, ?, ?, ?, ?)",
                    (
                        article_id, link["entity_type"], link["entity_id"],
                        float(link.get("confidence", 0.5)), link.get("method", "mention"),
                    ),
                )
                inserted += max(0, cursor.rowcount)
            self._conn.commit()
        return inserted

    def list_news(
        self,
        entity_id_value: str | None = None,
        source_id: str | None = None,
        since: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List news articles with their linked entities, newest first."""
        sql = "SELECT DISTINCT a.* FROM news_article a"
        params: list[Any] = []
        if entity_id_value:
            sql += " JOIN news_entity e ON e.article_id = a.article_id"
        sql += " WHERE 1=1"
        if entity_id_value:
            sql += " AND e.entity_id=?"
            params.append(entity_id_value)
        if source_id:
            sql += " AND a.source_id=?"
            params.append(source_id)
        if since:
            sql += " AND a.published_at >= ?"
            params.append(since)
        sql += " ORDER BY a.published_at DESC LIMIT ?"
        params.append(max(1, min(200, int(limit))))
        articles = self._all(sql, params)
        if articles:
            ids = [article["article_id"] for article in articles]
            placeholders = ", ".join("?" for _ in ids)
            links = self._all(
                f"SELECT * FROM news_entity WHERE article_id IN ({placeholders})", ids,
            )
            by_article: dict[str, list[dict[str, Any]]] = {}
            for link in links:
                by_article.setdefault(link["article_id"], []).append(link)
            for article in articles:
                article["entities"] = by_article.get(article["article_id"], [])
                try:
                    article["topics"] = json.loads(article.get("topics") or "[]")
                except (TypeError, ValueError):
                    article["topics"] = []
        return articles

    def get_news(self, article_id_value: str) -> dict[str, Any] | None:
        """Read one article with its entity links."""
        articles = self._all("SELECT * FROM news_article WHERE article_id=?", (article_id_value,))
        if not articles:
            return None
        article = articles[0]
        article["entities"] = self._all(
            "SELECT * FROM news_entity WHERE article_id=?", (article_id_value,),
        )
        try:
            article["topics"] = json.loads(article.get("topics") or "[]")
        except (TypeError, ValueError):
            article["topics"] = []
        return article

    def all_news_entities(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return recent article ids for re-linking jobs."""
        return self._all(
            "SELECT article_id FROM news_article ORDER BY published_at DESC LIMIT ?",
            (max(1, int(limit)),),
        )

    # ------------------------------------------------------------- indices

    def register_index(self, record: dict[str, Any]) -> dict[str, Any]:
        """Insert or update an index definition without losing its revision."""
        now = self._now_iso()
        existing = self.get_index_definition(record["index_id"])
        payload = {
            "index_id": record["index_id"],
            "name": record.get("name") or record["index_id"],
            "kind": record.get("kind") or "generic",
            "description": record.get("description") or "",
            "markets": json.dumps(record.get("markets") or [], separators=(",", ":")),
            "source_ids": json.dumps(record.get("source_ids") or [], separators=(",", ":")),
            "refresh_interval_s": int(record.get("refresh_interval_s") or 86400),
            "enabled": 1 if record.get("enabled", True) else 0,
            "created_at": (existing or {}).get("created_at") or now,
            "updated_at": now,
        }
        with self._lock:
            self._conn.execute(
                "INSERT INTO index_def (index_id, name, kind, description, markets, "
                "source_ids, refresh_interval_s, enabled, created_at, updated_at) "
                "VALUES (:index_id, :name, :kind, :description, :markets, :source_ids, "
                ":refresh_interval_s, :enabled, :created_at, :updated_at) "
                "ON CONFLICT(index_id) DO UPDATE SET name=excluded.name, kind=excluded.kind, "
                "description=excluded.description, markets=excluded.markets, "
                "source_ids=excluded.source_ids, refresh_interval_s=excluded.refresh_interval_s, "
                "enabled=excluded.enabled, updated_at=excluded.updated_at",
                payload,
            )
            self._conn.commit()
        return self.get_index_definition(record["index_id"]) or {}

    def get_index_definition(self, index_id: str) -> dict[str, Any] | None:
        """Read one index definition with decoded metadata."""
        row = self._one("SELECT * FROM index_def WHERE index_id=?", (index_id,))
        if row is None:
            return None
        for key in ("markets", "source_ids"):
            try:
                row[key] = json.loads(row.get(key) or "[]")
            except (TypeError, ValueError):
                row[key] = []
        try:
            row["last_summary"] = json.loads(row.get("last_summary") or "{}")
        except (TypeError, ValueError):
            row["last_summary"] = {}
        return row

    def list_index_definitions(self) -> list[dict[str, Any]]:
        """Return every index definition ordered by id."""
        rows = self._all("SELECT index_id FROM index_def ORDER BY index_id")
        return [self.get_index_definition(row["index_id"]) or {} for row in rows]

    def set_index_next_refresh(self, index_id: str, next_refresh_at: str) -> None:
        """Persist the next scheduled refresh for an index."""
        self._execute(
            "UPDATE index_def SET next_refresh_at=?, updated_at=? WHERE index_id=?",
            (next_refresh_at, self._now_iso(), index_id),
        )
        self._commit()

    def apply_index_snapshot(
        self,
        index_id: str,
        entries: list[dict[str, Any]],
        *,
        source_id: str,
        full_snapshot: bool = True,
        delist_confirmations: int = 2,
        observed_at: str | None = None,
    ) -> dict[str, Any]:
        """Diff a provider snapshot against an index and persist the changes.

        Each snapshot entry needs ``entry_key``, ``entity_type``, ``entity_id``,
        ``market`` and ``payload`` (a JSON-serialisable dict).  Missing entries
        move ``active -> missing -> delisted``; a returning entry is restored.
        The return value carries the changed entries so callers can project them
        into reference tables and queue downstream collection.
        """
        definition = self.get_index_definition(index_id)
        if definition is None:
            raise KeyError(f"Unknown index: {index_id}")
        now = observed_at or self._now_iso()
        revision = int(definition.get("revision") or 0) + 1
        existing = {
            row["entry_key"]: row
            for row in self._all("SELECT * FROM index_entry WHERE index_id=?", (index_id,))
        }
        snapshot: dict[str, dict[str, Any]] = {}
        for raw in entries:
            entry_key = str(raw.get("entry_key") or "").strip()
            entity_id = str(raw.get("entity_id") or "").strip()
            if not entry_key or not entity_id:
                continue
            payload = raw.get("payload") or {}
            snapshot[entry_key] = {
                "entry_key": entry_key,
                "entity_type": str(raw.get("entity_type") or "instrument"),
                "entity_id": entity_id,
                "market": str(raw.get("market") or "").strip().upper() or "UNKNOWN",
                "source_id": str(raw.get("source_id") or source_id),
                "payload": payload,
                "profile_status": raw.get("profile_status"),
            }

        added: list[dict[str, Any]] = []
        updated: list[dict[str, Any]] = []
        restored: list[dict[str, Any]] = []
        unchanged = 0
        changes: list[tuple[Any, ...]] = []
        inserts: list[tuple[Any, ...]] = []
        updates: list[tuple[Any, ...]] = []

        def payload_text(entry: dict[str, Any]) -> str:
            return json.dumps(entry.get("payload") or {}, sort_keys=True, separators=(",", ":"), default=str)

        def field_diff(old_row: dict[str, Any], new: dict[str, Any]) -> list[str]:
            fields: list[str] = []
            if str(old_row.get("entity_type") or "") != new["entity_type"]:
                fields.append("entity_type")
            if str(old_row.get("entity_id") or "") != new["entity_id"]:
                fields.append("entity_id")
            if str(old_row.get("market") or "") != new["market"]:
                fields.append("market")
            try:
                old_payload = json.loads(old_row.get("payload") or "{}")
            except (TypeError, ValueError):
                old_payload = {}
            new_payload = new.get("payload") or {}
            for key in sorted(set(old_payload) | set(new_payload)):
                if old_payload.get(key) != new_payload.get(key):
                    fields.append(f"payload.{key}")
            return fields

        for entry_key, entry in snapshot.items():
            previous = existing.get(entry_key)
            payload = payload_text(entry)
            if previous is None:
                profile_status = entry.get("profile_status") or "pending"
                inserts.append((
                    index_id, entry_key, entry["entity_type"], entry["entity_id"], entry["market"],
                    "active", revision, 0, now, now, now, None, entry["source_id"], payload,
                    profile_status, None, 0, None, now,
                ))
                added.append(entry)
                changes.append((index_id, entry_key, entry["entity_id"], entry["market"], "added",
                                json.dumps(["entry"], separators=(",", ":")), now, revision, entry["source_id"]))
                continue
            previous_status = str(previous.get("status") or "active")
            previous_payload = str(previous.get("payload") or "{}")
            if previous_status in ("missing", "delisted"):
                profile_status = entry.get("profile_status") or previous.get("profile_status") or "pending"
                restored.append(entry)
                updates.append((
                    entry["entity_type"], entry["entity_id"], entry["market"], "active",
                    int(previous.get("revision") or 1) + 1, 0, now, None, entry["source_id"], payload,
                    profile_status, previous.get("profile_synced_at"),
                    int(previous.get("profile_attempts") or 0), previous.get("profile_error"), now,
                    index_id, entry_key,
                ))
                changes.append((index_id, entry_key, entry["entity_id"], entry["market"], "restored",
                                json.dumps(["status"], separators=(",", ":")), now, revision, entry["source_id"]))
                continue
            fields = field_diff(previous, entry)
            if fields:
                profile_status = entry.get("profile_status") or previous.get("profile_status") or "pending"
                if entry.get("profile_status") is None and "payload.provider_ids" not in fields:
                    profile_status = previous.get("profile_status") or "pending"
                updated.append(entry)
                updates.append((
                    entry["entity_type"], entry["entity_id"], entry["market"], "active",
                    int(previous.get("revision") or 1) + 1, 0, now, None, entry["source_id"], payload,
                    profile_status, previous.get("profile_synced_at"),
                    int(previous.get("profile_attempts") or 0), previous.get("profile_error"), now,
                    index_id, entry_key,
                ))
                changes.append((index_id, entry_key, entry["entity_id"], entry["market"], "updated",
                                json.dumps(fields, separators=(",", ":")), now, revision, entry["source_id"]))
            else:
                unchanged += 1
                updates.append((
                    previous.get("entity_type"), previous.get("entity_id"), previous.get("market"),
                    "active", previous.get("revision"), 0, now, None, previous.get("source_id"),
                    previous_payload, previous.get("profile_status"), previous.get("profile_synced_at"),
                    int(previous.get("profile_attempts") or 0), previous.get("profile_error"), now,
                    index_id, entry_key,
                ))

        missing: list[dict[str, Any]] = []
        delisted: list[dict[str, Any]] = []
        if full_snapshot:
            for entry_key, previous in existing.items():
                if entry_key in snapshot:
                    continue
                previous_status = str(previous.get("status") or "active")
                if previous_status == "active":
                    missing.append(previous)
                    updates.append((
                        previous.get("entity_type"), previous.get("entity_id"), previous.get("market"),
                        "missing", int(previous.get("revision") or 1) + 1,
                        int(previous.get("misses") or 0) + 1, now, None, previous.get("source_id"),
                        str(previous.get("payload") or "{}"), previous.get("profile_status"),
                        previous.get("profile_synced_at"), int(previous.get("profile_attempts") or 0),
                        previous.get("profile_error"), now, index_id, entry_key,
                    ))
                    changes.append((index_id, entry_key, previous.get("entity_id"), previous.get("market"),
                                    "removed", json.dumps(["presence"], separators=(",", ":")),
                                    now, revision, previous.get("source_id")))
                elif previous_status == "missing":
                    misses = int(previous.get("misses") or 0) + 1
                    if misses >= max(1, int(delist_confirmations)):
                        delisted.append(previous)
                        updates.append((
                            previous.get("entity_type"), previous.get("entity_id"), previous.get("market"),
                            "delisted", int(previous.get("revision") or 1) + 1, misses, now,
                            now, previous.get("source_id"), str(previous.get("payload") or "{}"),
                            previous.get("profile_status"), previous.get("profile_synced_at"),
                            int(previous.get("profile_attempts") or 0), previous.get("profile_error"),
                            now, index_id, entry_key,
                        ))
                        changes.append((index_id, entry_key, previous.get("entity_id"), previous.get("market"),
                                        "delisted", json.dumps(["status"], separators=(",", ":")),
                                        now, revision, previous.get("source_id")))
                    else:
                        updates.append((
                            previous.get("entity_type"), previous.get("entity_id"), previous.get("market"),
                            "missing", int(previous.get("revision") or 1), misses, now, None,
                            previous.get("source_id"), str(previous.get("payload") or "{}"),
                            previous.get("profile_status"), previous.get("profile_synced_at"),
                            int(previous.get("profile_attempts") or 0), previous.get("profile_error"),
                            now, index_id, entry_key,
                        ))

        with self._lock:
            if inserts:
                self._conn.executemany(
                    "INSERT INTO index_entry (index_id, entry_key, entity_type, entity_id, market, "
                    "status, revision, misses, first_seen_at, last_seen_at, valid_from, valid_to, "
                    "source_id, payload, profile_status, profile_synced_at, profile_attempts, "
                    "profile_error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    inserts,
                )
            if updates:
                self._conn.executemany(
                    "UPDATE index_entry SET entity_type=?, entity_id=?, market=?, status=?, revision=?, "
                    "misses=?, last_seen_at=?, valid_to=?, source_id=?, payload=?, profile_status=?, "
                    "profile_synced_at=?, profile_attempts=?, profile_error=?, updated_at=? "
                    "WHERE index_id=? AND entry_key=?",
                    updates,
                )
            if changes:
                self._conn.executemany(
                    "INSERT INTO index_change (index_id, entry_key, entity_id, market, change_type, "
                    "changed_fields, observed_at, revision, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    changes,
                )
            self._conn.commit()

        stats = self.index_entry_stats(index_id)
        summary = {
            "revision": revision,
            "entries_seen": len(snapshot),
            "added": len(added),
            "updated": len(updated),
            "restored": len(restored),
            "removed": len(missing),
            "delisted": len(delisted),
            "unchanged": unchanged,
            "profiles_queued": sum(1 for entry in added if (entry.get("profile_status") or "pending") == "pending"),
            "entries_total": stats["total"],
            "active": stats["active"],
            "missing_total": stats["missing"],
            "delisted_total": stats["delisted"],
        }
        self._execute(
            "UPDATE index_def SET revision=?, entries=?, active=?, missing=?, delisted=?, "
            "pending_profiles=?, last_refresh_at=?, last_status=?, last_summary=?, updated_at=? "
            "WHERE index_id=?",
            (
                revision, stats["total"], stats["active"], stats["missing"], stats["delisted"],
                stats["pending_profiles"], now, "ok",
                json.dumps(summary, separators=(",", ":")), now, index_id,
            ),
        )
        self._commit()
        return {
            **summary,
            "added_entries": added,
            "updated_entries": updated,
            "restored_entries": restored,
            "missing_entries": missing,
            "delisted_entries": delisted,
        }

    def record_index_refresh(
        self,
        index_id: str,
        *,
        started_at: str,
        status: str,
        counts: dict[str, Any] | None = None,
        requests: int = 0,
        error: str = "",
        details: dict[str, Any] | None = None,
    ) -> int:
        """Persist one index-refresh audit row."""
        counts = counts or {}
        payload = {
            "index_id": index_id,
            "started_at": started_at,
            "finished_at": self._now_iso(),
            "status": status,
            "entries_seen": int(counts.get("entries_seen") or 0),
            "added": int(counts.get("added") or 0),
            "updated": int(counts.get("updated") or 0),
            "removed": int(counts.get("removed") or 0),
            "restored": int(counts.get("restored") or 0),
            "delisted": int(counts.get("delisted") or 0),
            "profiles_queued": int(counts.get("profiles_queued") or 0),
            "requests": int(requests),
            "error": str(error or "")[:800],
            "details": json.dumps(details or {}, separators=(",", ":"), default=str),
        }
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO index_refresh (index_id, started_at, finished_at, status, entries_seen, "
                "added, updated, removed, restored, delisted, profiles_queued, requests, error, details) "
                "VALUES (:index_id, :started_at, :finished_at, :status, :entries_seen, :added, "
                ":updated, :removed, :restored, :delisted, :profiles_queued, :requests, :error, :details)",
                payload,
            )
            self._conn.commit()
            return int(cursor.lastrowid or 0)

    def list_index_refreshes(self, index_id: str, limit: int = 10) -> list[dict[str, Any]]:
        """Recent refresh runs for one index, newest first."""
        rows = self._all(
            "SELECT * FROM index_refresh WHERE index_id=? ORDER BY refresh_id DESC LIMIT ?",
            (index_id, max(1, int(limit))),
        )
        for row in rows:
            try:
                row["details"] = json.loads(row.get("details") or "{}")
            except (TypeError, ValueError):
                row["details"] = {}
        return rows

    def index_entry_stats(self, index_id: str) -> dict[str, Any]:
        """Aggregate entry counts by status and market for one index."""
        rows = self._all(
            "SELECT status, COUNT(*) AS n FROM index_entry WHERE index_id=? GROUP BY status",
            (index_id,),
        )
        by_status = {str(row["status"]): int(row["n"]) for row in rows}
        markets = self._all(
            "SELECT market, COUNT(*) AS n FROM index_entry WHERE index_id=? AND status='active' "
            "GROUP BY market ORDER BY n DESC",
            (index_id,),
        )
        profile = self._one(
            "SELECT COUNT(*) AS n FROM index_entry WHERE index_id=? AND status='active' "
            "AND profile_status='pending'",
            (index_id,),
        )
        return {
            "total": sum(by_status.values()),
            "active": by_status.get("active", 0),
            "missing": by_status.get("missing", 0),
            "delisted": by_status.get("delisted", 0),
            "pending_profiles": int(profile["n"]) if profile else 0,
            "by_status": by_status,
            "by_market": {str(row["market"]): int(row["n"]) for row in markets},
        }

    def list_index_entries(
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
        """Page through one index's entries with optional filters."""
        clauses = ["index_id=?"]
        params: list[Any] = [index_id]
        if market:
            clauses.append("UPPER(market)=?")
            params.append(str(market).strip().upper())
        if status:
            clauses.append("status=?")
            params.append(str(status).strip().lower())
        if profile_status:
            clauses.append("profile_status=?")
            params.append(str(profile_status).strip().lower())
        if query:
            clauses.append("(entity_id LIKE ? OR json_extract(payload, '$.name') LIKE ?)")
            like = f"%{query.strip()}%"
            params.extend([like, like])
        where = " AND ".join(clauses)
        total_row = self._one(f"SELECT COUNT(*) AS n FROM index_entry WHERE {where}", params)
        rows = self._all(
            f"SELECT * FROM index_entry WHERE {where} ORDER BY market, entity_id LIMIT ? OFFSET ?",
            [*params, max(1, min(10000, int(limit))), max(0, int(offset))],
        )
        entries = []
        for row in rows:
            try:
                row["payload"] = json.loads(row.get("payload") or "{}")
            except (TypeError, ValueError):
                row["payload"] = {}
            entries.append(row)
        return {"entries": entries, "total": int(total_row["n"]) if total_row else 0}

    def get_index_entry(self, index_id: str, entry_key: str) -> dict[str, Any] | None:
        """Read one index entry by its stable key."""
        row = self._one(
            "SELECT * FROM index_entry WHERE index_id=? AND entry_key=?", (index_id, entry_key),
        )
        if row is None:
            return None
        try:
            row["payload"] = json.loads(row.get("payload") or "{}")
        except (TypeError, ValueError):
            row["payload"] = {}
        return row

    def list_index_changes(
        self, index_id: str, *, limit: int = 50, since_change_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """Recent change-log rows for one index, newest first."""
        clauses = ["index_id=?"]
        params: list[Any] = [index_id]
        if since_change_id is not None:
            clauses.append("change_id>?")
            params.append(int(since_change_id))
        rows = self._all(
            f"SELECT * FROM index_change WHERE {' AND '.join(clauses)} "
            f"ORDER BY change_id DESC LIMIT ?",
            [*params, max(1, min(500, int(limit)))],
        )
        for row in rows:
            try:
                row["changed_fields"] = json.loads(row.get("changed_fields") or "[]")
            except (TypeError, ValueError):
                row["changed_fields"] = []
        return rows

    def entries_needing_profiles(self, index_id: str, limit: int = 20) -> list[dict[str, Any]]:
        """Active entries whose company profile still needs collection."""
        rows = self._all(
            "SELECT * FROM index_entry WHERE index_id=? AND status='active' "
            "AND profile_status='pending' ORDER BY profile_attempts, market, entity_id LIMIT ?",
            (index_id, max(1, min(500, int(limit) * 4))),
        )
        entries = []
        for row in rows:
            try:
                row["payload"] = json.loads(row.get("payload") or "{}")
            except (TypeError, ValueError):
                row["payload"] = {}
            entries.append(row)
            if len(entries) >= limit:
                break
        return entries

    def update_index_profile(
        self,
        index_id: str,
        entry_key: str,
        *,
        profile_status: str,
        synced_at: str | None = None,
        error: str | None = None,
        increment_attempt: bool = False,
    ) -> None:
        """Mark one index entry's profile collection state."""
        self._execute(
            "UPDATE index_entry SET profile_status=?, profile_synced_at=COALESCE(?, profile_synced_at), "
            "profile_error=?, profile_attempts=profile_attempts + ?, updated_at=? "
            "WHERE index_id=? AND entry_key=?",
            (
                profile_status, synced_at, (error or "")[:500], 1 if increment_attempt else 0,
                self._now_iso(), index_id, entry_key,
            ),
        )
        self._commit()

    # ------------------------------------------------------- company profiles

    def upsert_company_profile(self, row: dict[str, Any]) -> None:
        """Insert or replace one collected company profile."""
        columns = (
            "entity_id", "market", "legal_name", "sic", "sic_description",
            "state_of_incorporation", "fiscal_year_end", "website", "address",
            "former_names", "tickers", "exchanges", "source_id", "observed_at", "fetched_at",
        )
        payload = {column: row.get(column) for column in columns}
        for json_column in ("former_names", "tickers", "exchanges"):
            value = payload.get(json_column)
            payload[json_column] = json.dumps(value or [], separators=(",", ":"), default=str)
        payload["fetched_at"] = payload.get("fetched_at") or self._now_iso()
        with self._lock:
            self._conn.execute(
                f"INSERT INTO company_profile ({', '.join(columns)}) "
                f"VALUES ({', '.join(f':{column}' for column in columns)}) "
                "ON CONFLICT(entity_id) DO UPDATE SET "
                + ", ".join(f"{column}=excluded.{column}" for column in columns if column != "entity_id"),
                payload,
            )
            self._conn.commit()

    def get_company_profile(self, entity_id: str) -> dict[str, Any] | None:
        """Read one collected company profile with decoded JSON columns."""
        row = self._one("SELECT * FROM company_profile WHERE entity_id=?", (entity_id,))
        if row is None:
            return None
        for key in ("former_names", "tickers", "exchanges"):
            try:
                row[key] = json.loads(row.get(key) or "[]")
            except (TypeError, ValueError):
                row[key] = []
        return row

    def list_company_profiles(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Page through collected company profiles."""
        rows = self._all(
            "SELECT * FROM company_profile ORDER BY fetched_at DESC LIMIT ? OFFSET ?",
            (max(1, min(500, int(limit))), max(0, int(offset))),
        )
        for row in rows:
            for key in ("former_names", "tickers", "exchanges"):
                try:
                    row[key] = json.loads(row.get(key) or "[]")
                except (TypeError, ValueError):
                    row[key] = []
        return rows

    # --------------------------------------------------------------- coverage

    def table_counts(self) -> dict[str, int]:
        """Row counts for the tables the coverage UI reports."""
        tables = {
            "exchanges": "ref_exchange",
            "instruments": "ref_instrument",
            "indices": "ref_index",
            "index_constituents": "ref_index_constituent",
            "commodity_roots": "ref_commodity_root",
            "commodity_contracts": "ref_commodity_contract",
            "aliases": "ref_alias",
            "bars": "market_bar",
            "quote_latest": "market_quote_latest",
            "quote_observations": "market_quote_observation",
            "news_sources": "news_source",
            "news_articles": "news_article",
            "news_entities": "news_entity",
            "indices_defined": "index_def",
            "index_entries": "index_entry",
            "index_changes": "index_change",
            "index_refreshes": "index_refresh",
            "company_profiles": "company_profile",
        }
        counts: dict[str, int] = {}
        for label, table in tables.items():
            row = self._one(f"SELECT COUNT(*) AS n FROM {table}")
            counts[label] = int(row["n"]) if row else 0
        return counts

    def coverage(self) -> dict[str, Any]:
        """Domain coverage with freshness and source health for the Data tab."""
        counts = self.table_counts()
        latest_bar = self._one("SELECT MAX(ts) AS ts FROM market_bar")
        latest_news = self._one("SELECT MAX(published_at) AS ts FROM news_article")
        latest_quote = self._one("SELECT MAX(ts) AS ts FROM market_quote_latest")
        sources = self.list_sources()
        runs = self.list_runs(limit=5)
        index_totals = self._one(
            "SELECT COALESCE(SUM(entries), 0) AS entries, COALESCE(SUM(active), 0) AS active, "
            "COALESCE(SUM(pending_profiles), 0) AS pending FROM index_def",
        )
        return {
            "domains": {
                "reference": {
                    "exchanges": counts["exchanges"],
                    "instruments": counts["instruments"],
                    "indices": counts["indices"],
                    "index_constituents": counts["index_constituents"],
                    "commodity_roots": counts["commodity_roots"],
                    "commodity_contracts": counts["commodity_contracts"],
                    "aliases": counts["aliases"],
                    "instruments_by_mic": self.instrument_counts_by_mic(),
                },
                "market": {
                    "bars": counts["bars"],
                    "series": counts["quote_latest"],
                    "quote_observations": counts["quote_observations"],
                    "latest_bar_ts": latest_bar["ts"] if latest_bar else None,
                    "latest_quote_ts": latest_quote["ts"] if latest_quote else None,
                },
                "news": {
                    "sources": counts["news_sources"],
                    "articles": counts["news_articles"],
                    "entity_links": counts["news_entities"],
                    "latest_published_at": latest_news["ts"] if latest_news else None,
                },
                "index": {
                    "indices": counts["indices_defined"],
                    "entries": int(index_totals["entries"]) if index_totals else counts["index_entries"],
                    "active_entries": int(index_totals["active"]) if index_totals else 0,
                    "pending_profiles": int(index_totals["pending"]) if index_totals else 0,
                    "changes": counts["index_changes"],
                    "company_profiles": counts["company_profiles"],
                    "refreshes": counts["index_refreshes"],
                },
            },
            "sources": [
                {
                    "source_id": source["source_id"],
                    "domain": source["domain"],
                    "kind": source.get("kind"),
                    "enabled": bool(source.get("enabled")),
                    "used_day": source.get("used_day"),
                    "max_per_day": source.get("max_per_day"),
                    "used_hour": source.get("used_hour"),
                    "max_per_hour": source.get("max_per_hour"),
                    "circuit_open_until": source.get("circuit_open_until"),
                    "last_success_at": source.get("last_success_at"),
                    "last_error": source.get("last_error"),
                }
                for source in sources
            ],
            "runs": runs,
            "schema_version": self.schema_version,
        }

    def instrument_counts_by_mic(self) -> dict[str, int]:
        """Instrument totals grouped by exchange MIC."""
        rows = self._all(
            "SELECT mic, COUNT(*) AS n FROM ref_instrument GROUP BY mic ORDER BY n DESC",
        )
        return {row["mic"]: int(row["n"]) for row in rows}

    def prune(self, raw_days: float = 7, observation_days: float = 14) -> dict[str, int]:
        """Apply retention policies and return removed counts."""
        return {
            "raw_documents": self.prune_raw_documents(keep_days=raw_days),
            "quote_observations": self.prune_quote_observations(keep_days=observation_days),
        }


__all__ = ["SCHEMA_VERSION", "DataWarehouse"]
