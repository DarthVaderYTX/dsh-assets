"""Company master index provider (``company:master``).

This is the first concrete *generic index* in the warehouse's index framework:
a diffable snapshot of a universe of entities (here: listed operating companies)
whose changes are persisted as index entries plus an append-only change log, and
whose current state is projected into the canonical reference tables.

Universe rules
--------------
* US: the two official bulk sources used by :mod:`..sources.reference_us` --
  SEC ``company_tickers.json`` (ticker/title/CIK metadata) and the NasdaqTrader
  symbol-directory files (authoritative exchange attribution).  Both sources
  contribute to one merged listing snapshot; the NasdaqTrader MIC is the
  canonical ``market`` of the index entry.
* Global: the curated seed (``global_instruments.json``).  It is an offline,
  versioned list and therefore always a *complete* snapshot component; the US
  files are the only network component whose completeness can vary.
* Only company types (:data:`COMPANY_TYPES`) enter the index: ETFs, crypto, FX,
  indices and commodities are deliberately excluded.

Snapshot semantics
------------------
:meth:`build_snapshot` returns ``(entries, details)``.  ``details["us_complete"]``
is only ``True`` when every US payload was fetched *and* parsed; a failed or
partial US refresh must never make the warehouse diff treat the missing US rows
as delisted companies.  The curated seed is always merged in (it is the global
half of the universe), and US rows win on duplicate identities.

Projection
----------
Added/updated/restored entries are projected into ``ref_instrument``,
``ref_alias`` and (US only) ``ref_exchange``.  Removed entries are never deleted:
they move ``active -> missing -> delisted`` in the index and the projected
instrument row only changes ``listing_status`` (plus ``valid_to`` once delisted).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, instrument_id, to_iso, utc_now
from ..specs import NASDAQ_TRADER, SEC_EDGAR
from ..sources import reference_global, reference_us

LOGGER = logging.getLogger("market_monitor.data.indices.company_master")

#: Canonical id of the company master index.
INDEX_ID = "company:master"

#: Instrument types that represent operating companies in this index.
COMPANY_TYPES = frozenset({"stock", "adr"})

#: Fund-like security names that the US bulk files occasionally classify as
#: ``stock`` (ETNs, grantor trusts, commodity pools).  They belong in a future
#: fund/ETF index, not in the company master index.
_FUND_NAME_PATTERN = re.compile(
    r"\b(?:ETFs?|ETNs?|EXCHANGE[- ]TRADED|FUNDS?|SHARES OF BENEFICIAL|BENEFICIAL INTEREST|"
    r"NOTES? DUE|INDEX DUE|PORTFOLIOS?|COMMODITY POOLS?|GRANTORS?|UNIT INVESTMENT|ROYALTY TRUSTS?)\b",
    re.IGNORECASE,
)

#: Provenance recorded for entries that come from the bundled curated seed.
SEED_SOURCE_ID = "seed"

#: Exchange MICs covered by the official US listing files.
US_MICS = tuple(reference_us.US_EXCHANGE_MICS)

#: MICs of the curated global seed venues that list operating companies.
SEED_COMPANY_MICS = (
    "XLON", "XPAR", "XETR", "XSWX", "XTKS", "XHKG", "XSHG", "XSHE",
    "XASX", "XTSE", "XKRX", "XNSE", "BVMF",
)

#: Declarative index definition stored by :meth:`ensure_registered`.
INDEX_DEFINITION: dict[str, Any] = {
    "index_id": INDEX_ID,
    "name": "Company master index",
    "kind": "company_master",
    "description": (
        "Listed operating companies (common stock and ADRs) from the official US "
        "SEC/NasdaqTrader bulk files and the curated global listing seed; the "
        "canonical company universe for profiles, news linking and EOD history."
    ),
    "markets": sorted({*US_MICS, *SEED_COMPANY_MICS}),
    "source_ids": [SEC_EDGAR, NASDAQ_TRADER, SEED_SOURCE_ID],
    "refresh_interval_s": 86400,
    "enabled": True,
}

#: Fallback provenance for snapshot entries that do not name a source.
_FALLBACK_SOURCE_ID = ",".join(INDEX_DEFINITION["source_ids"])[:255]

#: Parsers for the three US bulk payload labels (see ``reference_us.SOURCES``).
_US_PARSERS = {
    "sec": reference_us.parse_sec_tickers,
    "nasdaq_listed": reference_us.parse_nasdaq_listed,
    "other_listed": reference_us.parse_other_listed,
}

#: Definition fields compared by :func:`ensure_registered`.
_DEFINITION_SCALARS = ("name", "kind", "description")


# --------------------------------------------------------------------- helpers


def _text(value: Any) -> str:
    """Trim a value to a string (``None`` becomes ``""``)."""
    return str(value).strip() if value is not None else ""


def _company_type(value: Any) -> str:
    """Normalise an instrument type for the :data:`COMPANY_TYPES` filter."""
    return _text(value).lower()


def _is_operating_company(name: str) -> bool:
    """Reject fund-like vehicles that the US bulk files mark as stocks."""
    return _FUND_NAME_PATTERN.search(name) is None


def _entry_aliases(symbol: str, name: str, provider_symbol: str) -> list[dict[str, str]]:
    """Build the alias payload for one company (symbol, name, provider symbol)."""
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for value, alias_type in (
        (symbol, "symbol"),
        (name, "name"),
        (provider_symbol, "symbol"),
    ):
        text = _text(value)
        if not text or (text, alias_type) in seen:
            continue
        seen.add((text, alias_type))
        rows.append({"alias": text[:160], "alias_type": alias_type})
    return rows


def _entry(
    *,
    entity_id: str,
    market: str,
    source_id: str,
    payload: dict[str, Any],
    profile_status: str | None = None,
) -> dict[str, Any]:
    """Assemble one snapshot entry in the shape ``apply_index_snapshot`` expects."""
    entry: dict[str, Any] = {
        "entry_key": entity_id,
        "entity_type": "instrument",
        "entity_id": entity_id,
        "market": market,
        "source_id": source_id,
        "payload": payload,
    }
    if profile_status:
        entry["profile_status"] = profile_status
    return entry


# --------------------------------------------------------------------- snapshots


def _seed_entries() -> list[dict[str, Any]]:
    """Company entries from the curated global listing seed.

    The seed is validated and offline; its stock/ADR rows have no provider
    identifiers and are therefore already ``ready`` for consumers (sector and
    industry travel in the payload).
    """
    seed = reference_global.load_seed()
    entries: list[dict[str, Any]] = []
    for row in seed.get("global_instruments") or []:
        instrument_type = _company_type(row.get("type"))
        if instrument_type not in COMPANY_TYPES:
            continue
        mic = _text(row.get("mic")).upper()
        symbol = _text(row.get("symbol")).upper()
        if not mic or not symbol:
            continue
        if mic in US_MICS:
            # US companies come exclusively from the two official bulk files;
            # the seed only covers the non-US venues.  This prevents a partial
            # US refresh from rewriting US entries with poorer seed payloads.
            continue
        try:
            entity_id = instrument_id(mic, symbol)
        except ValueError:
            LOGGER.warning("seed listing has an invalid identity: %s/%s", mic, symbol)
            continue
        name = _text(row.get("name")) or symbol
        provider_symbol = _text(row.get("provider_symbol")) or symbol
        payload = {
            "name": name,
            "symbol": symbol,
            "venue": mic,
            "instrument_type": instrument_type,
            "currency": _text(row.get("currency")).upper(),
            "country": _text(row.get("country")).upper(),
            "sector": _text(row.get("sector")),
            "industry": _text(row.get("industry")),
            "provider_symbol": provider_symbol,
            "provider_ids": {},
            "aliases": _entry_aliases(symbol, name, provider_symbol),
            "description": "",
            "website": "",
        }
        entries.append(_entry(
            entity_id=entity_id,
            market=mic,
            source_id=SEED_SOURCE_ID,
            payload=payload,
            profile_status="ready",
        ))
    return entries


def _sec_cik_map(sec_rows: Iterable[dict[str, Any]]) -> dict[str, str]:
    """Map ticker -> SEC CIK from parsed ``company_tickers.json`` rows."""
    cik_by_ticker: dict[str, str] = {}
    for row in sec_rows:
        ticker = _text(row.get("ticker")).upper()
        cik = row.get("cik")
        if not ticker or cik in (None, ""):
            continue
        cik_by_ticker[ticker] = str(cik)
    return cik_by_ticker


def _us_entries(parsed: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Company entries from the merged US listing snapshot."""
    merged = reference_us.merge_us_listings(
        parsed.get("sec") or [], parsed.get("nasdaq_listed") or [],
        parsed.get("other_listed") or [],
    )
    cik_by_ticker = _sec_cik_map(parsed.get("sec") or [])
    entries: list[dict[str, Any]] = []
    for row in merged:
        instrument_type = _company_type(row.get("type"))
        if instrument_type not in COMPANY_TYPES:
            continue
        entity_id = _text(row.get("instrument_id"))
        mic = _text(row.get("mic")).upper()
        symbol = _text(row.get("symbol")).upper()
        if not entity_id or not mic or not symbol:
            continue
        name = _text(row.get("name")) or symbol
        if not _is_operating_company(name):
            continue
        provider_symbol = _text(row.get("provider_symbol")) or symbol
        cik = cik_by_ticker.get(symbol)
        payload = {
            "name": name,
            "symbol": symbol,
            "venue": mic,
            "instrument_type": instrument_type,
            "currency": _text(row.get("currency")) or "USD",
            "country": _text(row.get("country")) or "US",
            "sector": "",
            "industry": "",
            "provider_symbol": provider_symbol,
            "provider_ids": {"sec_cik": cik} if cik else {},
            "aliases": _entry_aliases(symbol, name, provider_symbol),
            "description": "",
            "website": "",
        }
        entries.append(_entry(
            entity_id=entity_id,
            market=mic,
            source_id=_text(row.get("source_id")) or NASDAQ_TRADER,
            payload=payload,
        ))
    return entries


def _fetch_us_payloads(
    ctx: CollectContext,
) -> tuple[
    dict[str, list[dict[str, Any]]], set[str], dict[str, Any], dict[str, str], int, int, bool,
]:
    """Fetch and parse the US bulk files, tolerating per-source failures.

    Returns ``(parsed, fetched, source_status, parse_errors, requests, skipped,
    dry_run)``.  A source failure is recorded and counted but never raised: the
    collector degrades to the sources that answered and reports ``partial``.
    """
    source_status: dict[str, Any] = {}
    parse_errors: dict[str, str] = {}
    parsed: dict[str, list[dict[str, Any]]] = {
        "sec": [], "nasdaq_listed": [], "other_listed": [],
    }
    fetched: set[str] = set()
    skipped = 0
    requests = 0
    dry_run = False

    for label, source_id, url in reference_us.SOURCES:
        requests += 1
        try:
            result = ctx.http.fetch(source_id, url)
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            skipped += 1
            source_status[label] = {
                "source_id": source_id, "status": "error", "error": _text(error)[:300],
            }
            ctx.logger.warning("US bookkeeping source %s failed: %s", source_id, error)
            continue
        if getattr(result, "dry_run", False):
            dry_run = True
            source_status[label] = {"source_id": source_id, "status": "dry_run"}
            continue
        body = reference_us._result_body(ctx, result, source_id, url)
        if body is None:
            skipped += 1
            source_status[label] = {"source_id": source_id, "status": "empty"}
            continue
        fetched.add(label)
        source_status[label] = {"source_id": source_id, "status": "ok", "bytes": len(body)}
        try:
            parsed[label] = _US_PARSERS[label](body)
        except ValueError as error:
            skipped += 1
            parse_errors[label] = _text(error)[:300]
            source_status[label] = {
                **source_status.get(label, {}),
                "status": "parse_error",
                "error": _text(error)[:300],
            }
            ctx.logger.warning("could not parse %s payload: %s", label, error)

    return parsed, fetched, source_status, parse_errors, requests, skipped, dry_run


def build_snapshot(ctx: CollectContext) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build the company master snapshot from the US files plus the global seed.

    ``entries`` is ready for :meth:`DataWarehouse.apply_index_snapshot`; the
    ``details`` dict carries per-source status, parse errors and
    ``us_complete`` -- the flag the collector uses to decide whether a diff may
    retire US entries that are absent from this snapshot.
    """
    seed_entries = _seed_entries()
    parsed, fetched, source_status, parse_errors, requests, skipped, dry_run = _fetch_us_payloads(ctx)
    us_fetched = bool(fetched)
    us_complete = us_fetched and all(
        source.get("status") == "ok" for source in source_status.values()
    ) and not dry_run

    us_entries: list[dict[str, Any]] = []
    if us_fetched:
        try:
            us_entries = _us_entries(parsed)
        except ValueError as error:  # pragma: no cover - merge is defensive
            skipped += 1
            parse_errors["merge"] = _text(error)[:300]
            LOGGER.warning("could not merge US listings: %s", error)

    by_key: dict[str, dict[str, Any]] = {entry["entry_key"]: entry for entry in seed_entries}
    duplicates = 0
    for entry in us_entries:
        if entry["entry_key"] in by_key:
            duplicates += 1
        by_key[entry["entry_key"]] = entry

    entries = sorted(by_key.values(), key=lambda entry: entry["entry_key"])
    details: dict[str, Any] = {
        "us_complete": us_complete,
        "us_fetched": us_fetched,
        "sources": source_status,
        "parse_errors": parse_errors,
        "requests": requests,
        "skipped": skipped,
        "us_entries": len(us_entries),
        "seed_entries": len(seed_entries),
        "entries": len(entries),
        "duplicates": duplicates,
    }
    if dry_run:
        details["dry_run"] = True
    ctx.logger.info(
        "company master snapshot: %d entry(ies) from %d US row(s) and %d seed row(s); "
        "us_complete=%s",
        len(entries), len(us_entries), len(seed_entries), us_complete,
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
    """Register the company master definition if absent or out of date.

    Returns the stored definition with decoded JSON columns.  The check avoids
    bumping ``updated_at`` (and therefore any UI revision) on every refresh when
    the declarative definition is unchanged.
    """
    current = ward.get_index_definition(INDEX_ID)
    if current is not None and _definition_matches(current, INDEX_DEFINITION):
        return current
    registered = ward.register_index(dict(INDEX_DEFINITION)) or {}
    if registered.get("index_id") == INDEX_ID:
        return registered
    # Be independent of what ``register_index`` returns: the registry lookup is
    # the canonical view of the definition that was just written.
    return ward.get_index_definition(INDEX_ID) or dict(INDEX_DEFINITION)


# --------------------------------------------------------------------- projection


def _set_instrument_status(
    ward: Any,
    entity_id: str,
    status: str,
    *,
    valid_to: str | None,
    observed_at: str,
) -> bool:
    """Update only the lifecycle columns of one projected instrument.

    ``upsert_instruments`` whitelists the columns it updates and deliberately
    leaves ``valid_to`` alone for normal refreshes, so the delist timestamp is
    written through a narrow helper.  The index job never deletes an instrument
    row: missing/delisted companies keep their last known metadata.
    """
    existing = ward.get_instrument(entity_id)
    if existing is None:
        return False
    row = dict(existing)
    row["listing_status"] = status
    row["updated_at"] = observed_at
    ward.upsert_instruments([row])
    if valid_to is not None or _text(existing.get("valid_to")):
        _write_valid_to(ward, entity_id, valid_to)
    return True


def _write_valid_to(ward: Any, entity_id: str, valid_to: str | None) -> None:
    """Persist ``ref_instrument.valid_to`` (upsert ignores it by design)."""
    setter = getattr(ward, "set_instrument_valid_to", None)
    if callable(setter):  # future warehouse API
        setter(entity_id, valid_to)
        return
    execute = getattr(ward, "_execute", None)
    commit = getattr(ward, "_commit", None)
    if not callable(execute) or not callable(commit):
        LOGGER.warning("warehouse cannot persist valid_to for %s; status kept", entity_id)
        return
    execute("UPDATE ref_instrument SET valid_to=? WHERE instrument_id=?", (valid_to, entity_id))
    commit()


def _project_active_entries(
    ward: Any,
    entries: Iterable[dict[str, Any]],
    *,
    observed_at: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], int]:
    """Build ``ref_instrument`` rows plus alias rows for active entries.

    Returns ``(instrument_rows, alias_rows, clear_valid_to, skipped)``.  The
    ``clear_valid_to`` ids are rows that were previously delisted and are active
    again; their lifecycle end date must not survive a restore.
    """
    instrument_rows: list[dict[str, Any]] = []
    alias_rows: list[dict[str, Any]] = []
    clear_valid_to: list[str] = []
    skipped = 0
    for entry in entries:
        payload = entry.get("payload") or {}
        entity_id = _text(entry.get("entity_id"))
        symbol = _text(payload.get("symbol")).upper()
        mic = _text(entry.get("market") or payload.get("venue")).upper()
        if not entity_id or not symbol or not mic:
            skipped += 1
            continue
        name = _text(payload.get("name")) or symbol
        existing = ward.get_instrument(entity_id) or {}
        if _text(existing.get("valid_to")):
            clear_valid_to.append(entity_id)
        # Empty payload metadata (US bulk files carry no sector) must not erase
        # enrichment that came from the curated seed or the profile job.
        sector = _text(payload.get("sector")) or _text(existing.get("sector"))
        industry = _text(payload.get("industry")) or _text(existing.get("industry"))
        first_seen = _text(entry.get("first_seen_at")) or observed_at
        source_id = _text(entry.get("source_id"))
        instrument_rows.append({
            "instrument_id": entity_id,
            "symbol": symbol,
            "mic": mic,
            "name": name,
            "type": _company_type(payload.get("instrument_type")) or "stock",
            "currency": _text(payload.get("currency")),
            "country": _text(payload.get("country")),
            "sector": sector,
            "industry": industry,
            "listing_status": "active",
            "provider_symbol": _text(payload.get("provider_symbol")) or symbol,
            "source_id": source_id,
            "valid_from": first_seen,
            "first_seen_at": first_seen,
            "updated_at": observed_at,
        })
        for alias in payload.get("aliases") or []:
            alias_text = _text(alias.get("alias")) if isinstance(alias, dict) else _text(alias)
            if not alias_text:
                continue
            alias_type = "symbol" if isinstance(alias, dict) else "name"
            if isinstance(alias, dict):
                alias_type = _text(alias.get("alias_type")) or "name"
            alias_rows.append({
                "alias": alias_text[:160],
                "entity_type": "instrument",
                "entity_id": entity_id,
                "alias_type": alias_type,
                "language": "en",
                "source_id": source_id,
            })
    return instrument_rows, alias_rows, clear_valid_to, skipped


def project_entries(ward: Any, applied: dict[str, Any], *, observed_at: str) -> dict[str, Any]:
    """Project the changed index entries into the canonical reference tables.

    ``applied`` is the return value of :meth:`DataWarehouse.apply_index_snapshot`.
    Instrument and alias rows are written for added/updated/restored entries;
    removed entries only move their lifecycle status, so a transient missing
    company can be restored later without losing metadata.
    """
    added = list(applied.get("added_entries") or [])
    updated = list(applied.get("updated_entries") or [])
    restored = list(applied.get("restored_entries") or [])

    entries: list[dict[str, Any]] = []
    skipped = 0
    for entry in added:
        entry = dict(entry)
        entry.setdefault("first_seen_at", observed_at)
        entries.append(entry)
    for entry in updated + restored:
        entry = dict(entry)
        stored = ward.get_index_entry(INDEX_ID, _text(entry.get("entry_key"))) or {}
        entry["first_seen_at"] = _text(stored.get("first_seen_at")) or observed_at
        if not stored:
            skipped += 1
        entries.append(entry)

    instrument_rows, alias_rows, clear_valid_to, row_skipped = _project_active_entries(
        ward, entries, observed_at=observed_at,
    )
    skipped += row_skipped
    stored_instruments = ward.upsert_instruments(instrument_rows) if instrument_rows else 0
    stored_aliases = ward.upsert_aliases(alias_rows) if alias_rows else 0
    for entity_id in clear_valid_to:
        _write_valid_to(ward, entity_id, None)

    missing_rows = list(applied.get("missing_entries") or [])
    delisted_rows = list(applied.get("delisted_entries") or [])
    missing_updated = 0
    delisted_updated = 0
    for entry in missing_rows:
        if _set_instrument_status(
            ward, _text(entry.get("entity_id")), "missing",
            valid_to=None, observed_at=observed_at,
        ):
            missing_updated += 1
        else:
            skipped += 1
    for entry in delisted_rows:
        if _set_instrument_status(
            ward, _text(entry.get("entity_id")), "delisted",
            valid_to=observed_at, observed_at=observed_at,
        ):
            delisted_updated += 1
        else:
            skipped += 1

    return {
        "stored": stored_instruments,
        "aliases": stored_aliases,
        "missing": missing_updated,
        "delisted": delisted_updated,
        "skipped": skipped,
        "active_entries": len(entries),
    }


# ------------------------------------------------------------------------ collect


def _next_refresh_at(ctx: CollectContext, definition: dict[str, Any]) -> str:
    """``now + refresh_interval_s`` as an ISO timestamp."""
    interval = int(definition.get("refresh_interval_s") or INDEX_DEFINITION["refresh_interval_s"])
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
    """Refresh the company master index and its reference projections.

    A single failed US source never aborts the run: the snapshot is built from
    whatever payloads are available (plus the offline seed) and applied as a
    partial snapshot so no existing US entry is retired by an incomplete fetch.
    """
    ward = ctx.warehouse
    started_at = ctx.now_iso()

    if bool(ctx.settings.get("dry_run")):
        planned_seed = len(_seed_entries())
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "details": {
                "dry_run": True,
                "planned_seed": planned_seed,
                "would_fetch_us": True,
                "index_id": INDEX_ID,
            },
        }

    observed_at = ctx.now_iso()
    try:
        definition = ensure_registered(ward)
        next_refresh_at = _next_refresh_at(ctx, definition)
        ward.set_index_next_refresh(INDEX_ID, next_refresh_at)
        entries, snapshot_details = build_snapshot(ctx)
        us_complete = bool(snapshot_details.get("us_complete"))
        applied = ward.apply_index_snapshot(
            INDEX_ID,
            entries,
            source_id=_FALLBACK_SOURCE_ID,
            full_snapshot=us_complete,
            delist_confirmations=int(ctx.settings.get("index_delist_confirmations", 2)),
            observed_at=observed_at,
        )
        projection = project_entries(ward, applied, observed_at=observed_at)
        if snapshot_details.get("us_fetched"):
            exchange_rows = reference_us._us_exchange_rows()
            if exchange_rows:
                projection["exchanges"] = ward.upsert_exchanges(exchange_rows)
    except Exception as error:  # noqa: BLE001 - audit the failure, then surface it
        _record_error_refresh(ward, started_at, error)
        raise

    counts = _refresh_counts(applied)
    revision = int(applied.get("revision") or 0)
    status = "ok" if us_complete else "partial"
    ward.record_index_refresh(
        INDEX_ID,
        started_at=started_at,
        status=status,
        counts=counts,
        requests=int(snapshot_details.get("requests") or 0),
        details={
            "sources": snapshot_details.get("sources") or {},
            "parse_errors": snapshot_details.get("parse_errors") or {},
            "us_complete": us_complete,
            "us_entries": int(snapshot_details.get("us_entries") or 0),
            "seed_entries": int(snapshot_details.get("seed_entries") or 0),
            "entries": int(snapshot_details.get("entries") or 0),
            "next_refresh_at": next_refresh_at,
            "projection": projection,
        },
    )
    ctx.logger.info(
        "company master refresh: revision=%d added=%d updated=%d removed=%d "
        "restored=%d delisted=%d status=%s",
        revision, counts["added"], counts["updated"], counts["removed"],
        counts["restored"], counts["delisted"], status,
    )
    return {
        "stored": int(projection.get("stored") or 0),
        "updated": counts["updated"] + counts["restored"],
        "duplicates": 0,
        "skipped": int(snapshot_details.get("skipped") or 0),
        "status": status,
        "details": {
            "counts": counts,
            "sources": snapshot_details.get("sources") or {},
            "parse_errors": snapshot_details.get("parse_errors") or {},
            "revision": revision,
            "next_refresh_at": next_refresh_at,
            "us_complete": us_complete,
            "projection": projection,
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
        LOGGER.warning("could not record company index error refresh: %s", record_error)


__all__ = [
    "COMPANY_TYPES",
    "INDEX_DEFINITION",
    "INDEX_ID",
    "SEED_COMPANY_MICS",
    "SEED_SOURCE_ID",
    "US_MICS",
    "build_snapshot",
    "collect",
    "ensure_registered",
    "project_entries",
]
