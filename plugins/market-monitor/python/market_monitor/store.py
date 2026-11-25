"""Thread-safe SQLite persistence for the market monitor.

One connection is shared behind a re-entrant lock (connections are opened with
``check_same_thread=False``) and the database runs in WAL mode so the HTTP
server threads and the monitoring loop can read while rows are written.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SCHEMA_VERSION = 2

#: Persisted settings defaults.
DEFAULT_SETTINGS: dict[str, Any] = {
    "provider": "auto",
    "poll_seconds": 15,
    "benchmark": "^GSPC",
    "base_currency": "USD",
    "auto_refresh": True,
}

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    exchange TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD'
);
CREATE TABLE IF NOT EXISTS watchlist (
    symbol TEXT PRIMARY KEY,
    order_index INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bars (
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    t TEXT NOT NULL,
    o REAL,
    h REAL,
    l REAL,
    c REAL,
    v REAL,
    source TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (symbol, interval, t)
);
CREATE TABLE IF NOT EXISTS quote_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    as_of TEXT NOT NULL DEFAULT '',
    stale INTEGER NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    kind TEXT NOT NULL,
    threshold REAL,
    params TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    cooldown_s INTEGER NOT NULL DEFAULT 3600,
    created_at TEXT NOT NULL,
    last_triggered_at TEXT
);
CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT,
    symbol TEXT NOT NULL,
    kind TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL DEFAULT '',
    value REAL,
    threshold REAL,
    ts TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    quantity REAL NOT NULL,
    avg_cost REAL NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bars_symbol_interval ON bars(symbol, interval, t);
CREATE INDEX IF NOT EXISTS idx_alert_events_ts ON alert_events(ts DESC);
"""


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string ending in ``Z``."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_to_epoch(value: Any) -> float | None:
    """Parse an ISO-8601 UTC timestamp into epoch seconds (``None`` if invalid)."""
    if not isinstance(value, str) or not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.timestamp()


def new_id() -> str:
    """Return a 12-character lowercase hex identifier."""
    return uuid.uuid4().hex[:12]


def _row_to_rule(row: sqlite3.Row) -> dict[str, Any]:
    """Convert an ``alert_rules`` row into a plain dictionary."""
    record = dict(row)
    try:
        params = json.loads(record.get("params") or "{}")
    except ValueError:
        params = {}
    record["params"] = params if isinstance(params, dict) else {}
    record["enabled"] = bool(record.get("enabled"))
    record["threshold"] = record.get("threshold")
    return record


def _row_to_event(row: sqlite3.Row) -> dict[str, Any]:
    """Convert an ``alert_events`` row into a plain dictionary."""
    record = dict(row)
    record["acknowledged"] = bool(record.get("acknowledged"))
    return record


class Store:
    """SQLite-backed state store (instruments, bars, alerts, portfolio)."""

    def __init__(self, database_path: str | os.PathLike[str]) -> None:
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            str(self.path), timeout=10.0, check_same_thread=False
        )
        self._connection.row_factory = sqlite3.Row
        with self._lock:
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA synchronous=NORMAL")
            self._connection.execute("PRAGMA foreign_keys=ON")
            self._connection.executescript(_SCHEMA_SQL)
            self._connection.commit()
            self._connection.execute(
                "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            self._connection.commit()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def close(self) -> None:
        """Close the underlying SQLite connection (idempotent)."""
        with self._lock:
            connection = getattr(self, "_connection", None)
            if connection is not None:
                try:
                    connection.close()
                finally:
                    self._connection = None  # type: ignore[assignment]

    # ------------------------------------------------------------------
    # Instruments
    # ------------------------------------------------------------------
    def seed_instruments(self, instruments: Iterable[Mapping[str, Any]]) -> None:
        """Insert catalog instruments that are not stored yet."""
        rows = [
            (
                item["symbol"],
                item.get("name", ""),
                item.get("exchange", ""),
                item.get("type", ""),
                item.get("sector", ""),
                item.get("currency", "USD"),
            )
            for item in instruments
        ]
        if not rows:
            return
        with self._lock, self._connection:
            self._connection.executemany(
                "INSERT OR IGNORE INTO instruments"
                "(symbol, name, exchange, type, sector, currency)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                rows,
            )

    def ensure_instrument(
        self,
        symbol: str,
        name: str | None = None,
        exchange: str = "",
        type_: str = "stock",
        sector: str = "Unknown",
        currency: str = "USD",
    ) -> None:
        """Insert a minimal instrument row for ``symbol`` when unknown."""
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT OR IGNORE INTO instruments"
                "(symbol, name, exchange, type, sector, currency)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (symbol, name or symbol, exchange, type_, sector, currency),
            )

    def get_instrument(self, symbol: str) -> dict[str, Any] | None:
        """Return stored instrument metadata (or ``None``)."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM instruments WHERE symbol = ?", (symbol,)
            ).fetchone()
        return dict(row) if row is not None else None

    def has_instrument(self, symbol: str) -> bool:
        """Return ``True`` when instrument metadata exists for ``symbol``."""
        with self._lock:
            row = self._connection.execute(
                "SELECT 1 FROM instruments WHERE symbol = ? LIMIT 1", (symbol,)
            ).fetchone()
        return row is not None

    def list_instruments(self) -> list[dict[str, Any]]:
        """Return all stored instrument rows ordered by symbol."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM instruments ORDER BY symbol"
            ).fetchall()
        return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Watchlist
    # ------------------------------------------------------------------
    def list_watchlist(self) -> list[dict[str, Any]]:
        """Return watch items ordered by their stored position."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT w.symbol, w.order_index, w.note, w.added_at, i.name"
                " FROM watchlist w LEFT JOIN instruments i ON i.symbol = w.symbol"
                " ORDER BY w.order_index, w.symbol"
            ).fetchall()
        return [
            {
                "symbol": row["symbol"],
                "name": row["name"] or row["symbol"],
                "order": int(row["order_index"]),
                "note": row["note"] or "",
                "added_at": row["added_at"],
            }
            for row in rows
        ]

    def watchlist_symbols(self) -> list[str]:
        """Return watchlist symbols in display order."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT symbol FROM watchlist ORDER BY order_index, symbol"
            ).fetchall()
        return [row["symbol"] for row in rows]

    def is_watched(self, symbol: str) -> bool:
        """Return ``True`` when ``symbol`` is on the watchlist."""
        with self._lock:
            row = self._connection.execute(
                "SELECT 1 FROM watchlist WHERE symbol = ? LIMIT 1", (symbol,)
            ).fetchone()
        return row is not None

    def add_watch(self, symbol: str, note: str = "") -> tuple[dict[str, Any], bool]:
        """Add ``symbol`` to the watchlist, returning ``(item, created)``."""
        with self._lock:
            existing = self._connection.execute(
                "SELECT w.symbol, w.order_index, w.note, w.added_at, i.name"
                " FROM watchlist w LEFT JOIN instruments i ON i.symbol = w.symbol"
                " WHERE w.symbol = ?",
                (symbol,),
            ).fetchone()
            if existing is not None:
                return (
                    {
                        "symbol": existing["symbol"],
                        "name": existing["name"] or existing["symbol"],
                        "order": int(existing["order_index"]),
                        "note": existing["note"] or "",
                        "added_at": existing["added_at"],
                    },
                    False,
                )
            row = self._connection.execute(
                "SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM watchlist"
            ).fetchone()
            order_index = int(row["next"])
            added_at = utc_now_iso()
            with self._connection:
                self._connection.execute(
                    "INSERT INTO watchlist(symbol, order_index, note, added_at)"
                    " VALUES (?, ?, ?, ?)",
                    (symbol, order_index, note, added_at),
                )
            instrument = self._connection.execute(
                "SELECT name FROM instruments WHERE symbol = ?", (symbol,)
            ).fetchone()
        return (
            {
                "symbol": symbol,
                "name": instrument["name"] if instrument is not None else symbol,
                "order": order_index,
                "note": note,
                "added_at": added_at,
            },
            True,
        )

    def remove_watch(self, symbol: str) -> bool:
        """Remove ``symbol`` from the watchlist, returning whether it existed."""
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "DELETE FROM watchlist WHERE symbol = ?", (symbol,)
            )
        return cursor.rowcount > 0

    def set_watch_note(self, symbol: str, note: str) -> dict[str, Any] | None:
        """Update the note of a watched symbol (``None`` when not watched)."""
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "UPDATE watchlist SET note = ? WHERE symbol = ?", (note, symbol)
            )
        if cursor.rowcount == 0:
            return None
        item = self._connection.execute(
            "SELECT w.symbol, w.order_index, w.note, w.added_at, i.name"
            " FROM watchlist w LEFT JOIN instruments i ON i.symbol = w.symbol"
            " WHERE w.symbol = ?",
            (symbol,),
        ).fetchone()
        return {
            "symbol": item["symbol"],
            "name": item["name"] or item["symbol"],
            "order": int(item["order_index"]),
            "note": item["note"] or "",
            "added_at": item["added_at"],
        }

    # ------------------------------------------------------------------
    # Bars
    # ------------------------------------------------------------------
    def upsert_bars(
        self,
        symbol: str,
        interval: str,
        bars: Iterable[Mapping[str, Any]],
        source: str,
    ) -> int:
        """Insert or update bar rows, returning the number of rows written."""
        rows: list[tuple[Any, ...]] = []
        for bar in bars:
            rows.append(
                (
                    symbol,
                    interval,
                    str(bar["t"]),
                    bar.get("o"),
                    bar.get("h"),
                    bar.get("l"),
                    bar.get("c"),
                    bar.get("v", 0.0),
                    source,
                )
            )
        if not rows:
            return 0
        with self._lock, self._connection:
            self._connection.executemany(
                "INSERT INTO bars(symbol, interval, t, o, h, l, c, v, source)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(symbol, interval, t) DO UPDATE SET"
                " o = excluded.o, h = excluded.h, l = excluded.l,"
                " c = excluded.c, v = excluded.v, source = excluded.source",
                rows,
            )
        return len(rows)

    def purge_synthetic_market_cache(self) -> dict[str, int]:
        """Delete cached bars/quotes that came from the simulator.

        The hot cache is disposable and may predate a policy switch to
        real-data-only. Removing simulator rows prevents an old synthetic quote
        or bar window from being replayed as if it were market data.
        """
        bars = 0
        quotes = 0
        with self._lock, self._connection:
            bars = self._connection.execute(
                "DELETE FROM bars WHERE lower(source) LIKE '%synthetic%'"
            ).rowcount
            quotes = self._connection.execute(
                "DELETE FROM quote_cache WHERE lower(provider) LIKE '%synthetic%' "
                "OR lower(source) LIKE '%synthetic%'"
            ).rowcount
        return {"bars": max(0, int(bars or 0)), "quotes": max(0, int(quotes or 0))}

    def replace_bars(
        self,
        symbol: str,
        interval: str,
        bars: Iterable[Mapping[str, Any]],
        source: str,
    ) -> int:
        """Replace every stored bar for ``symbol``/``interval``.

        Intraday provider responses describe one authoritative window (the
        current day for ``5m``, the last five sessions for ``30m``).  Stored
        rows from an older provider/window must not survive and leak into the
        response through a ``LIMIT`` query, so the interval's cache is replaced
        atomically for those ranges.
        """
        rows: list[tuple[Any, ...]] = []
        for bar in bars:
            rows.append((
                symbol,
                interval,
                str(bar["t"]),
                bar.get("o"),
                bar.get("h"),
                bar.get("l"),
                bar.get("c"),
                bar.get("v", 0.0),
                source,
            ))
        with self._lock, self._connection:
            self._connection.execute(
                "DELETE FROM bars WHERE symbol = ? AND interval = ?",
                (symbol, interval),
            )
            if rows:
                self._connection.executemany(
                    "INSERT INTO bars(symbol, interval, t, o, h, l, c, v, source)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    rows,
                )
        return len(rows)

    def get_bars(
        self,
        symbol: str,
        interval: str,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Return bars for ``symbol``/``interval`` in ascending time order."""
        with self._lock:
            if limit is not None and limit > 0:
                rows = self._connection.execute(
                    "SELECT * FROM (SELECT * FROM bars"
                    " WHERE symbol = ? AND interval = ?"
                    " ORDER BY t DESC LIMIT ?) ORDER BY t ASC",
                    (symbol, interval, int(limit)),
                ).fetchall()
            else:
                rows = self._connection.execute(
                    "SELECT * FROM bars WHERE symbol = ? AND interval = ?"
                    " ORDER BY t ASC",
                    (symbol, interval),
                ).fetchall()
        return [
            {
                "t": row["t"],
                "o": row["o"],
                "h": row["h"],
                "l": row["l"],
                "c": row["c"],
                "v": row["v"],
            }
            for row in rows
        ]

    def latest_bar(self, symbol: str, interval: str) -> dict[str, Any] | None:
        """Return the most recent stored bar for ``symbol``/``interval``."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM bars WHERE symbol = ? AND interval = ?"
                " ORDER BY t DESC LIMIT 1",
                (symbol, interval),
            ).fetchone()
        if row is None:
            return None
        return {
            "t": row["t"],
            "o": row["o"],
            "h": row["h"],
            "l": row["l"],
            "c": row["c"],
            "v": row["v"],
            "source": row["source"],
        }

    def has_bars(self, symbol: str) -> bool:
        """Return ``True`` when any bar is stored for ``symbol``."""
        with self._lock:
            row = self._connection.execute(
                "SELECT 1 FROM bars WHERE symbol = ? LIMIT 1", (symbol,)
            ).fetchone()
        return row is not None

    # ------------------------------------------------------------------
    # Quote cache (persisted before any API response returns a quote)
    # ------------------------------------------------------------------
    def upsert_quote_cache(
        self,
        symbol: str,
        quote: Mapping[str, Any],
        *,
        provider: str,
        updated_at: float,
    ) -> dict[str, Any]:
        """Persist the latest quote payload and return it read back from disk."""
        payload = json.dumps(dict(quote), separators=(",", ":"), default=str)
        values = (
            symbol,
            payload,
            str(provider or ""),
            str(quote.get("source") or ""),
            str(quote.get("as_of") or ""),
            1 if quote.get("stale") else 0,
            float(updated_at),
        )
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO quote_cache(symbol, payload, provider, source, as_of, stale, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(symbol) DO UPDATE SET"
                " payload = excluded.payload, provider = excluded.provider,"
                " source = excluded.source, as_of = excluded.as_of,"
                " stale = excluded.stale, updated_at = excluded.updated_at",
                values,
            )
        stored = self.get_quote_cache(symbol)
        if stored is None:  # pragma: no cover - upsert must be visible afterwards
            raise RuntimeError(f"quote cache write for {symbol} was not visible")
        return stored

    def get_quote_cache(self, symbol: str) -> dict[str, Any] | None:
        """Read the persisted quote for ``symbol`` (payload plus cache metadata)."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM quote_cache WHERE symbol = ?", (symbol,)
            ).fetchone()
        if row is None:
            return None
        try:
            quote = json.loads(row["payload"] or "{}")
        except ValueError:
            return None
        if not isinstance(quote, dict) or not quote:
            return None
        quote["symbol"] = str(quote.get("symbol") or symbol)
        return {
            "quote": quote,
            "provider": str(row["provider"] or ""),
            "source": str(row["source"] or ""),
            "as_of": str(row["as_of"] or ""),
            "stale": bool(row["stale"]),
            "updated_at": float(row["updated_at"] or 0.0),
        }

    # ------------------------------------------------------------------
    # Alert rules
    # ------------------------------------------------------------------
    def add_rule(self, rule: Mapping[str, Any]) -> dict[str, Any]:
        """Persist an alert rule and return the stored representation."""
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO alert_rules"
                "(id, symbol, kind, threshold, params, note, enabled,"
                " cooldown_s, created_at, last_triggered_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    rule["id"],
                    rule["symbol"],
                    rule["kind"],
                    rule.get("threshold"),
                    json.dumps(rule.get("params") or {}),
                    rule.get("note", ""),
                    1 if rule.get("enabled", True) else 0,
                    int(rule.get("cooldown_s", 3600)),
                    rule["created_at"],
                    rule.get("last_triggered_at"),
                ),
            )
        stored = self.get_rule(str(rule["id"]))
        assert stored is not None  # noqa: S101 - just inserted
        return stored

    def list_rules(self) -> list[dict[str, Any]]:
        """Return all alert rules, newest first."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM alert_rules ORDER BY created_at DESC, id DESC"
            ).fetchall()
        return [_row_to_rule(row) for row in rows]

    def get_rule(self, rule_id: str) -> dict[str, Any] | None:
        """Return one alert rule (or ``None``)."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM alert_rules WHERE id = ?", (rule_id,)
            ).fetchone()
        return _row_to_rule(row) if row is not None else None

    def update_rule(
        self, rule_id: str, fields: Mapping[str, Any]
    ) -> dict[str, Any] | None:
        """Update whitelisted alert-rule columns and return the new row."""
        allowed = {
            "threshold": "threshold",
            "note": "note",
            "enabled": "enabled",
            "cooldown_s": "cooldown_s",
            "params": "params",
        }
        assignments: list[str] = []
        values: list[Any] = []
        for key, column in allowed.items():
            if key not in fields:
                continue
            value = fields[key]
            if key == "params":
                value = json.dumps(value or {})
            elif key == "enabled":
                value = 1 if value else 0
            assignments.append(f"{column} = ?")
            values.append(value)
        if assignments:
            values.append(rule_id)
            with self._lock, self._connection:
                self._connection.execute(
                    f"UPDATE alert_rules SET {', '.join(assignments)} WHERE id = ?",
                    values,
                )
        return self.get_rule(rule_id)

    def delete_rule(self, rule_id: str) -> bool:
        """Delete an alert rule, returning whether it existed."""
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "DELETE FROM alert_rules WHERE id = ?", (rule_id,)
            )
        return cursor.rowcount > 0

    def mark_rule_triggered(self, rule_id: str, timestamp: str) -> None:
        """Record the last trigger timestamp of an alert rule."""
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE alert_rules SET last_triggered_at = ? WHERE id = ?",
                (timestamp, rule_id),
            )

    # ------------------------------------------------------------------
    # Alert events
    # ------------------------------------------------------------------
    def add_event(self, event: Mapping[str, Any]) -> dict[str, Any]:
        """Persist one alert event and return the stored representation."""
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO alert_events"
                "(id, rule_id, symbol, kind, severity, message, value, threshold,"
                " ts, acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event["id"],
                    event.get("rule_id"),
                    event["symbol"],
                    event["kind"],
                    event.get("severity", "info"),
                    event.get("message", ""),
                    event.get("value"),
                    event.get("threshold"),
                    event["ts"],
                    1 if event.get("acknowledged") else 0,
                ),
            )
        stored = self._get_event(str(event["id"]))
        assert stored is not None  # noqa: S101 - just inserted
        return stored

    def _get_event(self, event_id: str) -> dict[str, Any] | None:
        """Return one event by id (internal helper)."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM alert_events WHERE id = ?", (event_id,)
            ).fetchone()
        return _row_to_event(row) if row is not None else None

    def list_events(
        self,
        limit: int = 50,
        acknowledged: bool | None = None,
    ) -> list[dict[str, Any]]:
        """Return alert events newest first, optionally filtered by ack state."""
        clauses: list[str] = []
        values: list[Any] = []
        if acknowledged is not None:
            clauses.append("acknowledged = ?")
            values.append(1 if acknowledged else 0)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        values.append(int(limit))
        with self._lock:
            rows = self._connection.execute(
                f"SELECT * FROM alert_events{where}"
                " ORDER BY ts DESC, rowid DESC LIMIT ?",
                values,
            ).fetchall()
        return [_row_to_event(row) for row in rows]

    def ack_events(self, ids: Sequence[str]) -> int:
        """Acknowledge the identified events, returning the number updated."""
        if not ids:
            return 0
        placeholders = ", ".join("?" for _ in ids)
        with self._lock, self._connection:
            cursor = self._connection.execute(
                f"UPDATE alert_events SET acknowledged = 1"
                f" WHERE acknowledged = 0 AND id IN ({placeholders})",
                list(ids),
            )
        return cursor.rowcount

    def ack_all_events(self) -> int:
        """Acknowledge every unacknowledged event, returning the number updated."""
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "UPDATE alert_events SET acknowledged = 1 WHERE acknowledged = 0"
            )
        return cursor.rowcount

    # ------------------------------------------------------------------
    # Portfolio
    # ------------------------------------------------------------------
    def upsert_position(
        self, symbol: str, quantity: float, avg_cost: float
    ) -> dict[str, Any]:
        """Insert or update one portfolio position."""
        updated_at = utc_now_iso()
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO positions(symbol, quantity, avg_cost, updated_at)"
                " VALUES (?, ?, ?, ?)"
                " ON CONFLICT(symbol) DO UPDATE SET"
                " quantity = excluded.quantity, avg_cost = excluded.avg_cost,"
                " updated_at = excluded.updated_at",
                (symbol, quantity, avg_cost, updated_at),
            )
        stored = self.get_position(symbol)
        assert stored is not None  # noqa: S101 - just inserted
        return stored

    def list_positions(self) -> list[dict[str, Any]]:
        """Return all portfolio positions ordered by symbol."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM positions ORDER BY symbol"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_position(self, symbol: str) -> dict[str, Any] | None:
        """Return one portfolio position (or ``None``)."""
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM positions WHERE symbol = ?", (symbol,)
            ).fetchone()
        return dict(row) if row is not None else None

    def delete_position(self, symbol: str) -> bool:
        """Delete a portfolio position, returning whether it existed."""
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "DELETE FROM positions WHERE symbol = ?", (symbol,)
            )
        return cursor.rowcount > 0

    # ------------------------------------------------------------------
    # Settings and meta
    # ------------------------------------------------------------------
    def get_settings(self) -> dict[str, Any]:
        """Return persisted settings merged over the defaults."""
        settings = dict(DEFAULT_SETTINGS)
        with self._lock:
            rows = self._connection.execute("SELECT key, value FROM settings").fetchall()
        for row in rows:
            try:
                settings[row["key"]] = json.loads(row["value"])
            except ValueError:
                settings[row["key"]] = row["value"]
        return settings

    def update_settings(self, values: Mapping[str, Any]) -> dict[str, Any]:
        """Persist setting values and return the merged settings."""
        rows = [(key, json.dumps(value)) for key, value in values.items()]
        if rows:
            with self._lock, self._connection:
                self._connection.executemany(
                    "INSERT INTO settings(key, value) VALUES (?, ?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    rows,
                )
        return self.get_settings()

    def get_meta(self, key: str, default: Any = None) -> Any:
        """Return a meta value (JSON decoded) or ``default``."""
        with self._lock:
            row = self._connection.execute(
                "SELECT value FROM meta WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row["value"])
        except ValueError:
            return row["value"]

    def set_meta(self, key: str, value: Any) -> None:
        """Persist a meta value as JSON."""
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO meta(key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )


__all__ = [
    "SCHEMA_VERSION",
    "DEFAULT_SETTINGS",
    "Store",
    "utc_now_iso",
    "iso_to_epoch",
    "new_id",
]
