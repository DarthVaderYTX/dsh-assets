"""China domestic commodity roots index provider (``china:commodities``).

This index is the second concrete *generic index* in the collection layer.  Its
universe is the curated ``seed/china_commodities.json`` file: one row per
mainland futures **root** (the continuous front contract a provider like Sina
quotes as ``AU0``) across the five mainland futures exchanges::

    XSHF  Shanghai Futures Exchange
    XINE  Shanghai International Energy Exchange
    XDCE  Dalian Commodity Exchange
    XCZC  Zhengzhou Commodity Exchange
    XGFE  Guangzhou Futures Exchange

The seed is offline, versioned and always a *complete* snapshot, so every
refresh applies ``full_snapshot=True``: a root removed from the seed moves
``active -> missing -> delisted`` in the index, but its projected reference row
is never deleted (facts stay addressable by ``COM:{venue}:{root}``).

Projection
----------
Added/updated/restored entries are projected into ``ref_commodity_root`` and
``ref_alias``; the five mainland exchanges themselves are projected into
``ref_exchange`` from the curated global exchange seed.  There are no
commodity *contract* rows here: the collector tracks continuous roots only, so
``generate_commodity_contracts`` is deliberately not called.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Iterable

from ..models import CollectContext, commodity_root_id, to_iso, utc_now
from ..sources import reference_global

LOGGER = logging.getLogger("market_monitor.data.indices.china_commodities")

#: Canonical id of the China commodity roots index.
INDEX_ID = "china:commodities"

#: Provenance recorded for entries that come from the bundled curated seed.
SEED_SOURCE_ID = "seed"

#: Bundled seed file with the mainland commodity roots.
SEED_FILENAME = "china_commodities.json"

#: Directory with the bundled seed files (``market_monitor/data/seed``).
DATA_SEED_DIR = Path(__file__).resolve().parents[1] / "seed"

#: Monthly refresh: roots and their provider symbols change very rarely.
REFRESH_INTERVAL_S = 30 * 86400

#: The five mainland futures exchanges covered by this index.
CHINA_COMMODITY_VENUES = ("XCZC", "XDCE", "XGFE", "XINE", "XSHF")

#: Fields required on every seed root row.
REQUIRED_ROOT_FIELDS = (
    "venue", "root", "name", "category", "unit", "currency", "provider_symbol",
)

#: Declarative index definition stored by :meth:`ensure_registered`.
INDEX_DEFINITION: dict[str, Any] = {
    "index_id": INDEX_ID,
    "name": "China commodity roots index",
    "kind": "china_commodities",
    "description": (
        "Mainland commodity futures roots (continuous front contracts) across "
        "SHFE, INE, DCE, CZCE and GFEX from the curated seed; the canonical "
        "commodity universe for live quotes and daily history."
    ),
    "markets": sorted(CHINA_COMMODITY_VENUES),
    "source_ids": [SEED_SOURCE_ID],
    "refresh_interval_s": REFRESH_INTERVAL_S,
    "enabled": True,
}

#: Provenance recorded on projected seed rows.
_ROW_SOURCE_ID = SEED_SOURCE_ID

#: Definition fields compared by :func:`ensure_registered`.
_DEFINITION_SCALARS = ("name", "kind", "description")

#: Alias types accepted for commodity roots (see ``docs/DATA.md``).
_ALIAS_TYPES = frozenset({"symbol", "name"})


# --------------------------------------------------------------------- helpers


def _text(value: Any) -> str:
    """Trim a value to a string (``None`` becomes ``""``)."""
    return str(value).strip() if value is not None else ""


def _seed_dir(base_dir: str | Path | None = None) -> Path:
    """Resolve the seed directory (bundled default, or a test override)."""
    return Path(base_dir) if base_dir is not None else DATA_SEED_DIR


def _read_json(path: Path) -> Any:
    """Read and decode one bundled seed file, raising ``ValueError`` on failure."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"seed file not found: {path}") from error
    except OSError as error:  # pragma: no cover - filesystem level failure
        raise ValueError(f"could not read seed file {path}: {error}") from error
    try:
        return json.loads(text)
    except ValueError as error:
        raise ValueError(f"invalid JSON in {path.name}: {error}") from error


# --------------------------------------------------------------------- loading


def load_seed(base_dir: str | Path | None = None) -> list[dict[str, Any]]:
    """Load and validate the bundled mainland commodity roots seed.

    Accepts either ``{"roots": [...]}`` (the bundled shape) or a bare JSON array.
    Every root must carry non-empty ``venue``, ``root``, ``name``, ``category``,
    ``unit``, ``currency`` and ``provider_symbol``; duplicate ``(venue, root)``
    identities (and venues outside :data:`CHINA_COMMODITY_VENUES`) are rejected
    so a broken seed fails the job instead of storing bad identities.

    Returns normalised rows (upper-case venue/root/provider symbol/currency,
    lower-case category) in file order.
    """
    filename = SEED_FILENAME
    payload = _read_json(_seed_dir(base_dir) / filename)
    if isinstance(payload, dict):
        rows = payload.get("roots")
    elif isinstance(payload, list):
        rows = payload
    else:  # pragma: no cover - defensive: unusual JSON root type
        rows = None
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must contain a non-empty 'roots' array")

    validated: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict):
            raise ValueError(f"{filename}[{index}] must be a JSON object")
        record: dict[str, str] = {}
        for field in REQUIRED_ROOT_FIELDS:
            value = _text(raw.get(field))
            if not value:
                raise ValueError(f"{filename}[{index}].{field} must be a non-empty string")
            record[field] = value
        venue = record["venue"].upper()
        if venue not in CHINA_COMMODITY_VENUES:
            raise ValueError(
                f"{filename}[{index}].venue must be one of {sorted(CHINA_COMMODITY_VENUES)}: "
                f"{record['venue']!r}"
            )
        root = record["root"].upper()
        try:
            root_id = commodity_root_id(venue, root)
        except ValueError as error:
            raise ValueError(f"{filename}[{index}] has an invalid root identity: {error}") from error
        if root_id in seen:
            raise ValueError(f"{filename}[{index}] duplicates commodity root identity {root_id}")
        seen.add(root_id)
        validated.append({
            "venue": venue,
            "root": root,
            "name": record["name"],
            "name_zh": _text(raw.get("name_zh")),
            "category": record["category"].lower(),
            "unit": record["unit"],
            "currency": record["currency"].upper(),
            "provider_symbol": record["provider_symbol"].upper(),
        })
    return validated


# --------------------------------------------------------------------- snapshots


def _entry_aliases(
    root: str,
    name: str,
    name_zh: str,
    provider_symbol: str,
) -> list[dict[str, str]]:
    """Build the alias payload for one root (root/name/zh name/provider symbol)."""
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for value, alias_type in (
        (root, "symbol"),
        (name, "name"),
        (name_zh, "name"),
        (provider_symbol, "symbol"),
    ):
        text = _text(value)
        if not text or (text, alias_type) in seen:
            continue
        seen.add((text, alias_type))
        rows.append({"alias": text[:160], "alias_type": alias_type})
    return rows


def _entry(row: dict[str, Any]) -> dict[str, Any]:
    """Assemble one seed row as a snapshot entry for ``apply_index_snapshot``."""
    venue = _text(row.get("venue")).upper()
    root = _text(row.get("root")).upper()
    entity_id = commodity_root_id(venue, root)
    name = _text(row.get("name")) or root
    name_zh = _text(row.get("name_zh"))
    provider_symbol = _text(row.get("provider_symbol")) or root
    payload = {
        "name": name,
        "name_zh": name_zh,
        "root": root,
        "venue": venue,
        "category": _text(row.get("category")).lower(),
        "unit": _text(row.get("unit")),
        "currency": _text(row.get("currency")).upper() or "CNY",
        "provider_symbol": provider_symbol,
        "provider_ids": {"sina_symbol": provider_symbol},
        "aliases": _entry_aliases(root, name, name_zh, provider_symbol),
    }
    return {
        "entry_key": entity_id,
        "entity_type": "commodity_root",
        "entity_id": entity_id,
        "market": venue,
        "source_id": SEED_SOURCE_ID,
        "payload": payload,
        "profile_status": "ready",
    }


def _seed_entries(base_dir: str | Path | None = None) -> list[dict[str, Any]]:
    """Snapshot entries for every validated seed root, sorted by entry key."""
    entries = [_entry(row) for row in load_seed(base_dir)]
    entries.sort(key=lambda entry: entry["entry_key"])
    return entries


def build_snapshot(
    ctx: CollectContext,
    base_dir: str | Path | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build the commodity roots snapshot from the curated seed.

    The seed is offline and versioned, therefore the returned snapshot is always
    *complete* (``details["complete"] is True``) and the collector may apply it
    with ``full_snapshot=True``.  Returns ``(entries, details)``.
    """
    seed_rows = load_seed(base_dir)
    entries = _seed_entries(base_dir)
    by_market: dict[str, int] = {}
    for row in seed_rows:
        venue = row["venue"]
        by_market[venue] = by_market.get(venue, 0) + 1
    details: dict[str, Any] = {
        "complete": True,
        "source_id": SEED_SOURCE_ID,
        "seed_rows": len(seed_rows),
        "entries": len(entries),
        "markets": by_market,
    }
    ctx.logger.info(
        "china commodities snapshot: %d root(s) across %d market(s)",
        len(entries), len(by_market),
    )
    return entries, details


# --------------------------------------------------------------------- registration


def _definition_matches(current: dict[str, Any], definition: dict[str, Any]) -> bool:
    """True when the stored index definition already equals ``definition``."""
    for field in _DEFINITION_SCALARS:
        if _text(current.get(field)) != _text(definition.get(field)):
            return False
    if list(current.get("markets") or []) != list(definition.get("markets") or []):
        return False
    if list(current.get("source_ids") or []) != list(definition.get("source_ids") or []):
        return False
    if int(current.get("refresh_interval_s") or 0) != int(definition.get("refresh_interval_s") or 0):
        return False
    return bool(current.get("enabled", 0)) == bool(definition.get("enabled", True))


def ensure_registered(ward: Any) -> dict[str, Any]:
    """Register the commodity roots definition if absent or out of date.

    Returns the stored definition with decoded JSON columns.  An unchanged
    definition is not rewritten, so a refresh does not bump ``updated_at`` (and
    therefore the UI revision) on every run.
    """
    current = ward.get_index_definition(INDEX_ID)
    if current is not None and _definition_matches(current, INDEX_DEFINITION):
        return current
    registered = ward.register_index(dict(INDEX_DEFINITION)) or {}
    if registered.get("index_id") == INDEX_ID:
        return registered
    return ward.get_index_definition(INDEX_ID) or dict(INDEX_DEFINITION)


# --------------------------------------------------------------------- projection


def _project_roots(
    entries: Iterable[dict[str, Any]],
    *,
    observed_at: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """Build ``ref_commodity_root`` and ``ref_alias`` rows for changed entries.

    Returns ``(root_rows, alias_rows, skipped)``.  Alias rows are de-duplicated
    by ``(alias, alias_type)``; Chinese names are stored with language ``zh``.
    """
    root_rows: list[dict[str, Any]] = []
    alias_rows: list[dict[str, Any]] = []
    alias_seen: set[tuple[str, str, str]] = set()
    skipped = 0
    for entry in entries:
        payload = entry.get("payload") or {}
        entity_id = _text(entry.get("entity_id"))
        venue = _text(entry.get("market") or payload.get("venue")).upper()
        root = _text(payload.get("root")).upper()
        if not entity_id or not venue or not root:
            skipped += 1
            continue
        try:
            canonical_id = commodity_root_id(venue, root)
        except ValueError:
            skipped += 1
            continue
        if canonical_id != entity_id:
            LOGGER.warning(
                "skipping inconsistent commodity entry %s (identity %s)", entity_id, canonical_id,
            )
            skipped += 1
            continue
        source_id = _text(entry.get("source_id")) or _ROW_SOURCE_ID
        name = _text(payload.get("name")) or root
        root_rows.append({
            "root_id": canonical_id,
            "venue": venue,
            "root": root,
            "name": name,
            "category": _text(payload.get("category")).lower(),
            "unit": _text(payload.get("unit")),
            "currency": _text(payload.get("currency")).upper() or "CNY",
            "provider_symbol": _text(payload.get("provider_symbol")),
            "source_id": source_id,
            "updated_at": observed_at,
        })
        name_zh = _text(payload.get("name_zh"))
        for alias in payload.get("aliases") or []:
            if isinstance(alias, dict):
                alias_text = _text(alias.get("alias"))
                alias_type = _text(alias.get("alias_type")) or "name"
            else:
                alias_text = _text(alias)
                alias_type = "name"
            if not alias_text:
                continue
            if alias_type not in _ALIAS_TYPES:
                alias_type = "name"
            key = (alias_text, alias_type, canonical_id)
            if key in alias_seen:
                continue
            alias_seen.add(key)
            alias_rows.append({
                "alias": alias_text[:160],
                "entity_type": "commodity_root",
                "entity_id": canonical_id,
                "alias_type": alias_type,
                "language": "zh" if name_zh and alias_text == name_zh else "en",
                "source_id": source_id,
            })
    return root_rows, alias_rows, skipped


def project_entries(ward: Any, applied: dict[str, Any], *, observed_at: str) -> dict[str, Any]:
    """Project changed index entries into the canonical reference tables.

    ``applied`` is the return value of :meth:`DataWarehouse.apply_index_snapshot`.
    Root and alias rows are written for added/updated/restored entries; removed
    entries only move their index lifecycle status (``missing``/``delisted``) --
    the projection never deletes a reference row.
    """
    added = list(applied.get("added_entries") or [])
    updated = list(applied.get("updated_entries") or [])
    restored = list(applied.get("restored_entries") or [])

    entries: list[dict[str, Any]] = []
    skipped = 0
    for entry in added:
        entries.append(dict(entry))
    for entry in updated + restored:
        entry = dict(entry)
        stored = ward.get_index_entry(INDEX_ID, _text(entry.get("entry_key"))) or {}
        if not stored:
            skipped += 1
        entries.append(entry)

    root_rows, alias_rows, row_skipped = _project_roots(entries, observed_at=observed_at)
    skipped += row_skipped
    stored_roots = ward.upsert_commodity_roots(root_rows) if root_rows else 0
    stored_aliases = ward.upsert_aliases(alias_rows) if alias_rows else 0

    missing_rows = list(applied.get("missing_entries") or [])
    delisted_rows = list(applied.get("delisted_entries") or [])
    return {
        "stored": stored_roots,
        "aliases": stored_aliases,
        "root_rows": len(root_rows),
        "alias_rows": len(alias_rows),
        "missing": len(missing_rows),
        "delisted": len(delisted_rows),
        "skipped": skipped,
        "active_entries": len(entries),
    }


def exchange_rows() -> list[dict[str, Any]]:
    """``ref_exchange`` rows for the five mainland futures exchanges.

    The exchange metadata comes from the curated global exchange seed, so this
    index never invents venue details; refs that are absent from the seed are
    simply not projected.  A broken global seed is logged and treated as empty
    because it is not this index's primary payload.
    """
    try:
        seed = reference_global.load_seed()
    except ValueError as error:  # pragma: no cover - global seed is validated at boot
        LOGGER.warning("could not load exchange seed for china commodities: %s", error)
        return []
    rows: list[dict[str, Any]] = []
    for row in seed.get("exchanges") or []:
        mic = _text(row.get("mic")).upper()
        if mic not in CHINA_COMMODITY_VENUES:
            continue
        record = {
            field: _text(row.get(field))
            for field in reference_global.EXCHANGE_FIELDS
        }
        record["mic"] = mic
        # Provenance follows the loader the rows really came from, matching the
        # ``reference:seed`` job (and the other China index provider).
        record["source_id"] = reference_global.SEED_SOURCE_ID
        rows.append(record)
    rows.sort(key=lambda item: item["mic"])
    return rows


# ------------------------------------------------------------------------ collect


def _next_refresh_at(ctx: CollectContext, definition: dict[str, Any]) -> str:
    """``now + refresh_interval_s`` as an ISO timestamp."""
    interval = int(definition.get("refresh_interval_s") or REFRESH_INTERVAL_S)
    return to_iso(utc_now(ctx.now_fn) + max(60, interval))


def _refresh_counts(applied: dict[str, Any]) -> dict[str, int]:
    """The diff counters persisted with one refresh audit row."""
    return {
        "entries_seen": int(applied.get("entries_seen") or 0),
        "added": int(applied.get("added") or 0),
        "updated": int(applied.get("updated") or 0),
        "removed": int(applied.get("removed") or 0),
        "restored": int(applied.get("restored") or 0),
        "delisted": int(applied.get("delisted") or 0),
        "profiles_queued": int(applied.get("profiles_queued") or 0),
    }


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Refresh the China commodity roots index and its reference projections.

    The snapshot is always complete (the seed is offline), so this collector
    registers the index, applies a full diff, projects the changed roots and
    aliases plus the five exchange rows, records an ``index_refresh`` audit row
    and schedules the next refresh.  No network request is made.
    """
    ward = ctx.warehouse
    started_at = ctx.now_iso()

    if bool(ctx.settings.get("dry_run")):
        planned_seed = len(load_seed())
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "index_id": INDEX_ID,
            "details": {
                "dry_run": True,
                "planned_seed": planned_seed,
                "would_refresh": True,
                "index_id": INDEX_ID,
            },
        }

    observed_at = ctx.now_iso()
    try:
        definition = ensure_registered(ward)
        next_refresh_at = _next_refresh_at(ctx, definition)
        ward.set_index_next_refresh(INDEX_ID, next_refresh_at)
        entries, snapshot_details = build_snapshot(ctx)
        applied = ward.apply_index_snapshot(
            INDEX_ID,
            entries,
            source_id=SEED_SOURCE_ID,
            full_snapshot=True,
            delist_confirmations=int(ctx.settings.get("index_delist_confirmations", 2)),
            observed_at=observed_at,
        )
        projection = project_entries(ward, applied, observed_at=observed_at)
        rows = exchange_rows()
        if rows:
            projection["exchanges"] = ward.upsert_exchanges(rows)
    except Exception as error:  # noqa: BLE001 - audit the failure, then surface it
        _record_error_refresh(ward, started_at, error)
        raise

    counts = _refresh_counts(applied)
    revision = int(applied.get("revision") or 0)
    markets = snapshot_details.get("markets") or {}
    sources = {
        SEED_SOURCE_ID: {
            "source_id": SEED_SOURCE_ID,
            "status": "ok",
            "complete": True,
            "requests": 0,
            "entries": int(snapshot_details.get("entries") or 0),
        },
    }
    ward.record_index_refresh(
        INDEX_ID,
        started_at=started_at,
        status="ok",
        counts=counts,
        requests=0,
        details={
            "index_id": INDEX_ID,
            "complete": True,
            "sources": sources,
            "entries": int(snapshot_details.get("entries") or 0),
            "seed_rows": int(snapshot_details.get("seed_rows") or 0),
            "markets": markets,
            "next_refresh_at": next_refresh_at,
            "projection": projection,
        },
    )
    ctx.logger.info(
        "china commodities refresh: revision=%d added=%d updated=%d removed=%d "
        "restored=%d delisted=%d roots=%d aliases=%d",
        revision, counts["added"], counts["updated"], counts["removed"],
        counts["restored"], counts["delisted"],
        int(projection.get("stored") or 0), int(projection.get("aliases") or 0),
    )
    return {
        "stored": int(projection.get("stored") or 0),
        "updated": counts["updated"] + counts["restored"],
        "duplicates": 0,
        "skipped": int(projection.get("skipped") or 0),
        "status": "ok",
        "index_id": INDEX_ID,
        "details": {
            "counts": counts,
            "revision": revision,
            "entries": int(snapshot_details.get("entries") or 0),
            "seed_rows": int(snapshot_details.get("seed_rows") or 0),
            "markets": markets,
            "complete": True,
            "sources": sources,
            "next_refresh_at": next_refresh_at,
            "projection": projection,
            "index_id": INDEX_ID,
        },
        "job_state": {"last_revision": revision, "index_id": INDEX_ID},
    }


def _record_error_refresh(ward: Any, started_at: str, error: Exception) -> None:
    """Best-effort error audit row for an unexpected collector failure."""
    try:
        ward.record_index_refresh(
            INDEX_ID,
            started_at=started_at,
            status="error",
            counts={},
            error=_text(error)[:800],
            details={"exception": type(error).__name__},
        )
    except Exception as record_error:  # noqa: BLE001 - never mask the real failure
        LOGGER.warning("could not record china commodities error refresh: %s", record_error)


__all__ = [
    "CHINA_COMMODITY_VENUES",
    "DATA_SEED_DIR",
    "INDEX_DEFINITION",
    "INDEX_ID",
    "REFRESH_INTERVAL_S",
    "REQUIRED_ROOT_FIELDS",
    "SEED_FILENAME",
    "SEED_SOURCE_ID",
    "build_snapshot",
    "collect",
    "ensure_registered",
    "exchange_rows",
    "load_seed",
    "project_entries",
]
