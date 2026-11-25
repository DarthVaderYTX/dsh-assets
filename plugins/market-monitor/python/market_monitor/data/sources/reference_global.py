"""Curated reference seed collector for global exchanges, listings and markets.

The bundled JSON seed in ``market_monitor/data/seed`` is small, versioned in git
and human-reviewable.  This collector validates it and mirrors it into the
warehouse: exchanges, global listings (including the internal crypto/FX
aggregate venues), indices, commodity roots and the monthly commodity contracts
generated from the current UTC month.

It performs no network requests, so it is also the bootstrap source for the
tracked universe when the US bulk job cannot run.  Contract months are derived
from the injected clock (:meth:`CollectContext.now_iso`) which keeps the job
deterministic in tests.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Iterable

from ..models import (
    MIC_PATTERN,
    CollectContext,
    commodity_contract_id,
    commodity_root_id,
    index_id,
    instrument_id,
    normalise_contract_month,
    normalise_symbol,
)

LOGGER = logging.getLogger("market_monitor.data.sources.reference_global")

#: Provenance string recorded for every row that comes from the bundled seed.
SEED_SOURCE_ID = "reference:seed"

#: Directory with the bundled seed files.
DATA_SEED_DIR = Path(__file__).resolve().parents[1] / "seed"

#: Default number of forward monthly contracts generated per commodity root.
DEFAULT_MONTHS_AHEAD = 12

#: Column whitelists; rows are rebuilt from these keys so a malformed seed row
#: cannot smuggle unexpected columns into the warehouse tables.
EXCHANGE_FIELDS = (
    "mic", "code", "name", "country", "city", "timezone", "currency",
    "calendar", "website",
)
INSTRUMENT_FIELDS = (
    "symbol", "mic", "name", "type", "currency", "country", "sector",
    "industry", "provider_symbol",
)
INDEX_FIELDS = (
    "code", "name", "region", "currency", "type", "venue", "provider_symbol",
    "constituents_count",
)
ROOT_FIELDS = (
    "venue", "root", "name", "category", "unit", "currency", "provider_symbol",
    "months_ahead",
)

INSTRUMENT_TYPES = frozenset({"stock", "etf", "adr", "crypto", "forex"})
INDEX_TYPES = frozenset({"broad", "blue-chip", "sector", "volatility"})
COMMODITY_CATEGORIES = frozenset({"energy", "metals", "agriculture", "livestock"})

#: Venues accepted in ``commodities.json`` (exchange MICs plus aggregate venues).
COMMODITY_VENUES = frozenset({
    "XCEC", "XNYM", "XCME", "IFEU", "IFUS", "XSGE", "XDCE", "XZCE", "XLME",
})

_CURRENCY_PATTERN = re.compile(r"^[A-Z]{3}$")
_COUNTRY_PATTERN = re.compile(r"^[A-Z]{2}$")


# --------------------------------------------------------------------- loading


def _seed_root(base_dir: str | Path | None) -> Path:
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


def load_seed(base_dir: str | Path | None = None) -> dict[str, Any]:
    """Load and validate the four bundled seed files.

    Returns a mapping with the keys ``exchanges``, ``global_instruments``,
    ``indices`` and ``commodities`` (the latter is the list of commodity roots).
    Validation raises :class:`ValueError` with the file and row index so a broken
    seed fails the job with a useful message instead of storing bad identities.
    """
    root = _seed_root(base_dir)
    exchanges = validate_exchanges(_read_json(root / "exchanges.json"))
    exchange_mics = {row["mic"] for row in exchanges}
    return {
        "exchanges": exchanges,
        "global_instruments": validate_instruments(
            _read_json(root / "global_instruments.json"), exchange_mics,
        ),
        "indices": validate_indices(_read_json(root / "indices.json"), exchange_mics),
        "commodities": validate_commodities(_read_json(root / "commodities.json")),
    }


# -------------------------------------------------------------------- validate
# The validators are public so tests (and future seed tooling) can check
# identity rules without touching the warehouse.


def _as_dict(row: Any, filename: str, index: int) -> dict[str, Any]:
    """Require a JSON object at ``row[index]``."""
    if not isinstance(row, dict):
        raise ValueError(f"{filename}[{index}] must be a JSON object")
    return row


def _text(row: dict[str, Any], field: str, filename: str, index: int, *, allow_empty: bool = False) -> str:
    """Read a trimmed string field, raising on missing/empty values."""
    value = row.get(field)
    text = str(value).strip() if value is not None else ""
    if not text and not allow_empty:
        raise ValueError(f"{filename}[{index}].{field} must be a non-empty string")
    return text


def _integer(row: dict[str, Any], field: str, filename: str, index: int, default: int | None = None) -> int:
    """Read an integer field, rejecting booleans and non-numeric values."""
    value = row.get(field, default)
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{filename}[{index}].{field} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{filename}[{index}].{field} must be an integer") from error


def validate_exchanges(rows: Any) -> list[dict[str, Any]]:
    """Validate ``exchanges.json`` and return normalised exchange rows."""
    filename = "exchanges.json"
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must be a non-empty JSON array")
    validated: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        row = _as_dict(raw, filename, index)
        record = {field: _text(row, field, filename, index, allow_empty=field in {"city", "website"})
                  for field in EXCHANGE_FIELDS}
        mic = record["mic"].upper()
        if not MIC_PATTERN.match(mic):
            raise ValueError(f"{filename}[{index}].mic is not a valid ISO 10383 MIC: {record['mic']!r}")
        if mic in seen:
            raise ValueError(f"{filename}[{index}].mic is duplicated: {mic}")
        seen.add(mic)
        record["mic"] = mic
        record["country"] = record["country"].upper()
        if not _COUNTRY_PATTERN.match(record["country"]):
            raise ValueError(f"{filename}[{index}].country must be a 2-letter code: {record['country']!r}")
        if not _CURRENCY_PATTERN.match(record["currency"].upper()):
            raise ValueError(f"{filename}[{index}].currency must be a 3-letter code: {record['currency']!r}")
        record["currency"] = record["currency"].upper()
        validated.append(record)
    return validated


def validate_instruments(
    rows: Any,
    exchange_mics: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """Validate ``global_instruments.json`` and return normalised instrument rows."""
    filename = "global_instruments.json"
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must be a non-empty JSON array")
    known_mics = {str(mic).upper() for mic in exchange_mics} if exchange_mics is not None else None
    validated: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        row = _as_dict(raw, filename, index)
        record = {field: _text(row, field, filename, index) for field in INSTRUMENT_FIELDS}
        try:
            record["symbol"] = normalise_symbol(record["symbol"])
        except ValueError as error:
            raise ValueError(f"{filename}[{index}].symbol is invalid: {error}") from error
        mic = record["mic"].upper()
        if not MIC_PATTERN.match(mic):
            raise ValueError(f"{filename}[{index}].mic is not a valid MIC: {record['mic']!r}")
        if known_mics is not None and mic not in known_mics:
            raise ValueError(f"{filename}[{index}].mic is not in exchanges.json: {mic}")
        record["mic"] = mic
        instrument_type = record["type"].lower()
        if instrument_type not in INSTRUMENT_TYPES:
            raise ValueError(
                f"{filename}[{index}].type must be one of {sorted(INSTRUMENT_TYPES)}: {record['type']!r}",
            )
        record["type"] = instrument_type
        currency = record["currency"].upper()
        if not _CURRENCY_PATTERN.match(currency):
            raise ValueError(f"{filename}[{index}].currency must be a 3-letter code: {record['currency']!r}")
        record["currency"] = currency
        record["country"] = record["country"].upper()
        if not _COUNTRY_PATTERN.match(record["country"]):
            raise ValueError(f"{filename}[{index}].country must be a 2-letter code: {record['country']!r}")
        identity = instrument_id(mic, record["symbol"])
        if identity in seen:
            raise ValueError(f"{filename}[{index}] duplicates instrument identity {identity}")
        seen.add(identity)
        validated.append(record)
    return validated


def validate_indices(
    rows: Any,
    exchange_mics: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """Validate ``indices.json`` and return normalised index rows."""
    filename = "indices.json"
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must be a non-empty JSON array")
    known_mics = {str(mic).upper() for mic in exchange_mics} if exchange_mics is not None else None
    validated: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        row = _as_dict(raw, filename, index)
        record = {field: _text(row, field, filename, index) for field in INDEX_FIELDS if field != "constituents_count"}
        record["constituents_count"] = _integer(row, "constituents_count", filename, index)
        if record["constituents_count"] < 0:
            raise ValueError(f"{filename}[{index}].constituents_count must be >= 0")
        code = record["code"].upper().replace("^", "")
        identity = index_id(code)  # validates the code pattern
        if identity in seen:
            raise ValueError(f"{filename}[{index}] duplicates index identity {identity}")
        seen.add(identity)
        record["code"] = code
        index_type = record["type"].lower()
        if index_type not in INDEX_TYPES:
            raise ValueError(
                f"{filename}[{index}].type must be one of {sorted(INDEX_TYPES)}: {record['type']!r}",
            )
        record["type"] = index_type
        record["venue"] = record["venue"].upper()
        if known_mics is not None and record["venue"] not in known_mics:
            raise ValueError(f"{filename}[{index}].venue is not in exchanges.json: {record['venue']}")
        record["currency"] = record["currency"].upper()
        if not _CURRENCY_PATTERN.match(record["currency"]):
            raise ValueError(f"{filename}[{index}].currency must be a 3-letter code: {record['currency']!r}")
        validated.append(record)
    return validated


def validate_commodities(payload: Any) -> list[dict[str, Any]]:
    """Validate ``commodities.json`` and return the commodity root rows.

    Accepts either ``{"roots": [...]}`` (the bundled shape) or a bare JSON array.
    The ``provider_symbol`` may be empty for venues without a free quote feed;
    such roots are still stored as metadata but are not tracked by the market
    collector.
    """
    filename = "commodities.json"
    if isinstance(payload, dict):
        rows = payload.get("roots")
    else:
        rows = payload
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{filename} must contain a non-empty 'roots' array")
    validated: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        row = _as_dict(raw, filename, index)
        record = {
            field: _text(row, field, filename, index, allow_empty=field == "provider_symbol")
            for field in ROOT_FIELDS
            if field != "months_ahead"
        }
        record["venue"] = record["venue"].upper()
        if record["venue"] not in COMMODITY_VENUES:
            raise ValueError(
                f"{filename}[{index}].venue must be one of {sorted(COMMODITY_VENUES)}: {record['venue']!r}",
            )
        record["root"] = record["root"].upper()
        root_id = commodity_root_id(record["venue"], record["root"])
        if root_id in seen:
            raise ValueError(f"{filename}[{index}] duplicates commodity root identity {root_id}")
        seen.add(root_id)
        category = record["category"].lower()
        if category not in COMMODITY_CATEGORIES:
            raise ValueError(
                f"{filename}[{index}].category must be one of {sorted(COMMODITY_CATEGORIES)}: "
                f"{record['category']!r}",
            )
        record["category"] = category
        record["currency"] = record["currency"].upper()
        if not _CURRENCY_PATTERN.match(record["currency"]):
            raise ValueError(f"{filename}[{index}].currency must be a 3-letter code: {record['currency']!r}")
        months_ahead = _integer(row, "months_ahead", filename, index, DEFAULT_MONTHS_AHEAD)
        if months_ahead < 1 or months_ahead > 60:
            raise ValueError(f"{filename}[{index}].months_ahead must be between 1 and 60")
        record["months_ahead"] = months_ahead
        validated.append(record)
    return validated


# -------------------------------------------------------------------- contract


def generate_commodity_contracts(
    roots: list[dict[str, Any]],
    start_month: str,
    source_id: str = SEED_SOURCE_ID,
) -> list[dict[str, Any]]:
    """Generate forward monthly contract metadata for every commodity root.

    ``start_month`` is the current UTC month (``YYYY-MM`` or ``YYYYMM``); each
    root yields ``months_ahead`` consecutive contracts beginning with that month.
    Only the front month carries the provider symbol, because the Yahoo quote is
    a continuous front contract; the other months are metadata for later
    licensed-feed expansion.
    """
    first_month = normalise_contract_month(start_month)
    year = int(first_month[:4])
    month = int(first_month[4:])
    rows: list[dict[str, Any]] = []
    for root in roots:
        venue = str(root["venue"]).upper()
        root_code = str(root["root"]).upper()
        root_id = commodity_root_id(venue, root_code)
        provider_symbol = str(root.get("provider_symbol") or "").strip()
        months_ahead = int(root.get("months_ahead") or DEFAULT_MONTHS_AHEAD)
        contract_year, contract_month = year, month
        for offset in range(months_ahead):
            stamp = f"{contract_year:04d}{contract_month:02d}"
            rows.append({
                "contract_id": commodity_contract_id(venue, root_code, stamp),
                "root_id": root_id,
                "venue": venue,
                "root": root_code,
                "contract_month": stamp,
                "first_trade_date": "",
                "last_trade_date": "",
                "provider_symbol": provider_symbol if offset == 0 else "",
                "source_id": source_id,
            })
            contract_month += 1
            if contract_month > 12:
                contract_month = 1
                contract_year += 1
    return rows


# -------------------------------------------------------------------- collect


def _exchange_rows(seed: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ``ref_exchange`` rows from validated seed exchanges."""
    return [
        {**{field: row[field] for field in EXCHANGE_FIELDS}, "source_id": SEED_SOURCE_ID}
        for row in seed["exchanges"]
    ]


def _instrument_rows(seed: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ``ref_instrument`` rows with canonical identities."""
    rows: list[dict[str, Any]] = []
    for row in seed["global_instruments"]:
        mic = str(row["mic"]).upper()
        symbol = str(row["symbol"]).upper()
        rows.append({
            "instrument_id": instrument_id(mic, symbol),
            "symbol": symbol,
            "mic": mic,
            "name": row["name"],
            "type": row["type"],
            "currency": row["currency"],
            "country": row["country"],
            "sector": row["sector"],
            "industry": row["industry"],
            "listing_status": "active",
            "provider_symbol": row["provider_symbol"],
            "source_id": SEED_SOURCE_ID,
        })
    return rows


def _index_rows(seed: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ``ref_index`` rows with canonical identities."""
    return [
        {
            "index_id": index_id(row["code"]),
            "code": str(row["code"]).upper().replace("^", ""),
            "name": row["name"],
            "region": row["region"],
            "currency": row["currency"],
            "type": row["type"],
            "venue": row["venue"],
            "provider_symbol": row["provider_symbol"],
            "constituents_count": int(row["constituents_count"]),
            "source_id": SEED_SOURCE_ID,
        }
        for row in seed["indices"]
    ]


def _root_rows(seed: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ``ref_commodity_root`` rows with canonical identities."""
    return [
        {
            "root_id": commodity_root_id(row["venue"], row["root"]),
            "venue": str(row["venue"]).upper(),
            "root": str(row["root"]).upper(),
            "name": row["name"],
            "category": row["category"],
            "unit": row["unit"],
            "currency": row["currency"],
            "provider_symbol": row["provider_symbol"],
            "source_id": SEED_SOURCE_ID,
        }
        for row in seed["commodities"]
    ]


def _alias_rows(
    instrument_rows: list[dict[str, Any]],
    index_rows: list[dict[str, Any]],
    root_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build de-duplicated ``ref_alias`` rows for the seeded entities."""
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()

    def add(alias: str, entity_type: str, entity_id: str, alias_type: str) -> None:
        text = str(alias or "").strip()
        if not text:
            return
        key = (text, entity_type, entity_id, alias_type)
        if key in seen:
            return
        seen.add(key)
        rows.append({
            "alias": text[:160],
            "entity_type": entity_type,
            "entity_id": entity_id,
            "alias_type": alias_type,
            "language": "en",
            "source_id": SEED_SOURCE_ID,
        })

    for row in instrument_rows:
        add(row["symbol"], "instrument", row["instrument_id"], "symbol")
        add(row["name"], "instrument", row["instrument_id"], "name")
    for row in index_rows:
        add(row["code"], "index", row["index_id"], "symbol")
        add(row["name"], "index", row["index_id"], "name")
    for row in root_rows:
        add(row["root"], "commodity_root", row["root_id"], "symbol")
        add(row["name"], "commodity_root", row["root_id"], "name")
    return rows


def collect(ctx: CollectContext, base_dir: str | Path | None = None) -> dict[str, Any]:
    """Load the curated seed into the warehouse.

    ``base_dir`` overrides the bundled seed directory for tests.  The payload is
    fully validated before any row is written; a broken seed raises instead of
    leaving the reference tables in a half-updated state.
    """
    seed = load_seed(base_dir)
    exchange_rows = _exchange_rows(seed)
    instrument_rows = _instrument_rows(seed)
    index_rows = _index_rows(seed)
    root_rows = _root_rows(seed)
    contract_rows = generate_commodity_contracts(seed["commodities"], ctx.now_iso()[:7])
    alias_rows = _alias_rows(instrument_rows, index_rows, root_rows)

    stored = 0
    stored += ctx.warehouse.upsert_exchanges(exchange_rows)
    stored += ctx.warehouse.upsert_instruments(instrument_rows)
    stored += ctx.warehouse.upsert_indices(index_rows)
    stored += ctx.warehouse.upsert_index_constituents([])
    stored += ctx.warehouse.upsert_commodity_roots(root_rows)
    stored += ctx.warehouse.upsert_commodity_contracts(contract_rows)
    stored += ctx.warehouse.upsert_aliases(alias_rows)

    months = sorted({row["contract_month"] for row in contract_rows})
    details = {
        "source_id": SEED_SOURCE_ID,
        "seed_dir": str(_seed_root(base_dir)),
        "exchanges": len(exchange_rows),
        "instruments": len(instrument_rows),
        "indices": len(index_rows),
        "index_constituents": 0,
        "commodity_roots": len(root_rows),
        "commodity_contracts": len(contract_rows),
        "aliases": len(alias_rows),
        "contract_first_month": months[0] if months else "",
        "contract_last_month": months[-1] if months else "",
    }
    ctx.logger.info(
        "reference seed loaded: %d exchange(s), %d instrument(s), %d index(es), "
        "%d commodity root(s), %d contract(s), %d alias(es)",
        len(exchange_rows), len(instrument_rows), len(index_rows),
        len(root_rows), len(contract_rows), len(alias_rows),
    )
    return {
        "status": "ok",
        "stored": stored,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "details": details,
    }


__all__ = [
    "COMMODITY_CATEGORIES",
    "COMMODITY_VENUES",
    "DATA_SEED_DIR",
    "DEFAULT_MONTHS_AHEAD",
    "EXCHANGE_FIELDS",
    "INDEX_FIELDS",
    "INDEX_TYPES",
    "INSTRUMENT_FIELDS",
    "INSTRUMENT_TYPES",
    "ROOT_FIELDS",
    "SEED_SOURCE_ID",
    "collect",
    "generate_commodity_contracts",
    "load_seed",
    "validate_commodities",
    "validate_exchanges",
    "validate_instruments",
    "validate_indices",
]
