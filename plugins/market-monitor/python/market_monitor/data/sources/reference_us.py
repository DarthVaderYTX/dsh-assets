"""US reference collectors: SEC EDGAR tickers and NasdaqTrader symbol files.

Both sources are official bulk files (two requests for the whole US listing
refresh).  The SEC file contributes ticker/title metadata but carries no
exchange, so the NasdaqTrader files are authoritative for exchange attribution:
a symbol only becomes an instrument when one of the symbol-directory files says
where it is listed.  SEC-only tickers are counted and skipped rather than
guessed onto a default venue.

Parsers are pure ``bytes -> list[dict]`` functions so tests need no HTTP stub.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, instrument_id, normalise_symbol
from ..specs import NASDAQ_TRADER, SEC_EDGAR
from .reference_global import SEED_SOURCE_ID, load_seed

LOGGER = logging.getLogger("market_monitor.data.sources.reference_us")

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

#: ``nasdaqlisted.txt`` only contains Nasdaq-listed securities.
NASDAQ_LISTED_MIC = "XNAS"

#: ``otherlisted.txt`` exchange code -> ISO 10383 MIC.  Only codes we are sure
#: about are mapped; anything else is skipped and reported as ``skipped_mic``.
OTHER_LISTED_EXCHANGE_MICS: dict[str, str] = {
    "N": "XNYS",
    "A": "XASE",
    "P": "ARCX",
    "Z": "BATS",
}

#: US exchange rows refreshed by this job (metadata comes from the seed file).
US_EXCHANGE_MICS = ("XNYS", "XNAS", "XASE", "ARCX", "BATS", "IEXG", "XCBO", "OTCM")

#: Fetch plan: label -> (source id, URL).
SOURCES = (
    ("sec", SEC_EDGAR, SEC_TICKERS_URL),
    ("nasdaq_listed", NASDAQ_TRADER, NASDAQ_LISTED_URL),
    ("other_listed", NASDAQ_TRADER, OTHER_LISTED_URL),
)

_EXCHANGE_FIELDS = (
    "mic", "code", "name", "country", "city", "timezone", "currency",
    "calendar", "website",
)


# --------------------------------------------------------------------- parsing


def _decode(body: bytes | str) -> str:
    """Decode a payload body as UTF-8, tolerating a BOM and invalid bytes."""
    if isinstance(body, str):
        text = body
    else:
        text = bytes(body).decode("utf-8-sig", errors="replace")
    return text.lstrip("\ufeff")


def parse_sec_tickers(body: bytes) -> list[dict[str, Any]]:
    """Parse ``company_tickers.json`` into ``{cik, ticker, title}`` rows.

    The official payload is a JSON object keyed by decimal strings; a plain JSON
    array is accepted too because mirrors sometimes reshape it.
    """
    text = _decode(body)
    if not text.strip():
        raise ValueError("empty SEC company_tickers payload")
    try:
        payload = json.loads(text)
    except ValueError as error:
        raise ValueError(f"invalid SEC company_tickers JSON: {error}") from error
    if isinstance(payload, dict):
        entries: Any = payload.values()
    elif isinstance(payload, list):
        entries = payload
    else:
        raise ValueError("SEC company_tickers payload must be a JSON object or array")

    rows: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        ticker = str(entry.get("ticker") or "").strip().upper()
        title = str(entry.get("title") or "").strip()
        if not ticker or not title:
            continue
        rows.append({
            "cik": entry.get("cik_str"),
            "ticker": ticker,
            "title": title,
        })
    return rows


def _pipe_table(body: bytes | str) -> tuple[list[str], list[list[str]]]:
    """Parse a NasdaqTrader pipe-delimited file into a header and data cells."""
    text = _decode(body)
    if not text.strip():
        raise ValueError("empty symbol directory payload")
    reader = csv.reader(io.StringIO(text), delimiter="|")
    header: list[str] | None = None
    data: list[list[str]] = []
    for raw in reader:
        if not raw or not any(cell.strip() for cell in raw):
            continue
        if raw[0].strip().lower().startswith("file creation time"):
            break
        cells = [cell.strip() for cell in raw]
        if header is None:
            header = [cell.lower() for cell in cells]
            continue
        data.append(cells)
    if header is None:
        raise ValueError("symbol directory payload is missing its header row")
    return header, data


def _column(header: list[str], *names: str) -> int | None:
    """Index of the first matching column name (case-insensitive, pre-normalised)."""
    for name in names:
        if name in header:
            return header.index(name)
    return None


def _cell(cells: list[str], index: int | None) -> str:
    """Read one cell, tolerating short rows."""
    if index is None or index >= len(cells):
        return ""
    return cells[index].strip()


def parse_nasdaq_listed(body: bytes) -> list[dict[str, Any]]:
    """Parse ``nasdaqlisted.txt``; test issues are dropped, ETF flag retained."""
    header, data = _pipe_table(body)
    symbol_index = _column(header, "symbol")
    name_index = _column(header, "security name")
    if symbol_index is None or name_index is None:
        raise ValueError("nasdaqlisted.txt is missing the Symbol/Security Name columns")
    test_index = _column(header, "test issue")
    etf_index = _column(header, "etf")
    market_index = _column(header, "market category")
    financial_index = _column(header, "financial status")

    rows: list[dict[str, Any]] = []
    for cells in data:
        symbol = _cell(cells, symbol_index).upper()
        if not symbol or _cell(cells, test_index).upper() == "Y":
            continue
        rows.append({
            "symbol": symbol,
            "name": _cell(cells, name_index),
            "mic": NASDAQ_LISTED_MIC,
            "exchange": "NASDAQ",
            "etf": _cell(cells, etf_index).upper() == "Y",
            "market_category": _cell(cells, market_index),
            "financial_status": _cell(cells, financial_index),
        })
    return rows


def parse_other_listed(body: bytes) -> list[dict[str, Any]]:
    """Parse ``otherlisted.txt``; unknown exchange codes keep ``mic == ""``.

    The raw exchange code is retained so the merge step can count unknown
    venues in ``details["skipped_mic"]`` instead of silently dropping the row.
    Test issues are skipped.
    """
    header, data = _pipe_table(body)
    symbol_index = _column(header, "act symbol", "symbol")
    name_index = _column(header, "security name")
    exchange_index = _column(header, "exchange")
    if symbol_index is None or name_index is None or exchange_index is None:
        raise ValueError("otherlisted.txt is missing the ACT Symbol/Security Name/Exchange columns")
    test_index = _column(header, "test issue")
    etf_index = _column(header, "etf")

    rows: list[dict[str, Any]] = []
    for cells in data:
        symbol = _cell(cells, symbol_index).upper()
        if not symbol or _cell(cells, test_index).upper() == "Y":
            continue
        exchange_code = _cell(cells, exchange_index).upper()
        rows.append({
            "symbol": symbol,
            "name": _cell(cells, name_index),
            "exchange": exchange_code,
            "mic": OTHER_LISTED_EXCHANGE_MICS.get(exchange_code, ""),
            "etf": _cell(cells, etf_index).upper() == "Y",
        })
    return rows


# ----------------------------------------------------------------------- merge


def _merge_with_stats(
    sec_rows: list[dict[str, Any]],
    nasdaq_rows: list[dict[str, Any]],
    other_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Merge the three files into instrument rows plus skip counters."""
    stats = {
        "merged": 0,
        "duplicates": 0,
        "skipped_mic": 0,
        "skipped_symbol": 0,
        "skipped_name": 0,
        "sec_only": 0,
        "sec_name_fallback": 0,
    }
    sec_by_symbol: dict[str, dict[str, Any]] = {}
    for row in sec_rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker:
            sec_by_symbol[ticker] = row

    listing_by_symbol: dict[str, dict[str, Any]] = {}
    for row in nasdaq_rows:
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            stats["skipped_symbol"] += 1
            continue
        if symbol in listing_by_symbol:
            stats["duplicates"] += 1
            continue
        mic = str(row.get("mic") or "").strip().upper() or NASDAQ_LISTED_MIC
        listing_by_symbol[symbol] = {**row, "mic": mic}
    for row in other_rows:
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            stats["skipped_symbol"] += 1
            continue
        mic = str(row.get("mic") or "").strip().upper()
        if not mic:
            exchange_code = str(row.get("exchange") or "").strip().upper()
            mic = OTHER_LISTED_EXCHANGE_MICS.get(exchange_code, "")
        if not mic:
            stats["skipped_mic"] += 1
            continue
        if symbol in listing_by_symbol:
            stats["duplicates"] += 1
            continue
        listing_by_symbol[symbol] = {**row, "mic": mic}

    merged: list[dict[str, Any]] = []
    for symbol, listing in listing_by_symbol.items():
        mic = str(listing.get("mic") or "").strip().upper()
        if not mic:
            stats["skipped_mic"] += 1
            continue
        name = str(listing.get("name") or "").strip()
        sec_row = sec_by_symbol.get(symbol)
        if not name and sec_row is not None:
            name = str(sec_row.get("title") or "").strip()
            if name:
                stats["sec_name_fallback"] += 1
        if not name:
            stats["skipped_name"] += 1
            continue
        try:
            normalised = normalise_symbol(symbol)
            identity = instrument_id(mic, normalised)
        except ValueError:
            stats["skipped_symbol"] += 1
            continue
        merged.append({
            "instrument_id": identity,
            "symbol": normalised,
            "mic": mic,
            "name": name,
            "type": "ETF" if listing.get("etf") else "stock",
            "currency": "USD",
            "country": "US",
            "listing_status": "active",
            "provider_symbol": normalised,
            "source_id": NASDAQ_TRADER,
        })

    merged.sort(key=lambda row: row["instrument_id"])
    stats["merged"] = len(merged)
    stats["sec_only"] = len(set(sec_by_symbol) - set(listing_by_symbol))
    return merged, stats


def merge_us_listings(
    sec_rows: list[dict[str, Any]],
    nasdaq_rows: list[dict[str, Any]],
    other_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge SEC and NasdaqTrader rows into canonical US instrument rows.

    The NasdaqTrader files decide the exchange; the SEC file is only a metadata
    fallback (company title) and a completeness check.  SEC-only tickers cannot
    be attributed to a venue and are therefore not returned.
    """
    rows, _stats = _merge_with_stats(sec_rows, nasdaq_rows, other_rows)
    return rows


# --------------------------------------------------------------------- collect


def _instrument_aliases(instruments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build symbol/name aliases for every merged instrument."""
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for instrument in instruments:
        for alias, alias_type in ((instrument["symbol"], "symbol"), (instrument["name"], "name")):
            text = str(alias or "").strip()
            if not text:
                continue
            key = (text, instrument["instrument_id"], alias_type)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "alias": text[:160],
                "entity_type": "instrument",
                "entity_id": instrument["instrument_id"],
                "alias_type": alias_type,
                "language": "en",
                "source_id": instrument["source_id"],
            })
    return rows


def _us_exchange_rows() -> list[dict[str, Any]]:
    """Load the eight US exchange rows this job touches from the seed file."""
    try:
        seed = load_seed()
    except (OSError, ValueError) as error:  # pragma: no cover - bundled seed damage
        LOGGER.warning("could not load exchange seed metadata: %s", error)
        return []
    rows = []
    for exchange in seed["exchanges"]:
        if exchange["mic"] not in US_EXCHANGE_MICS:
            continue
        rows.append({
            **{field: exchange[field] for field in _EXCHANGE_FIELDS},
            "source_id": SEED_SOURCE_ID,
        })
    return rows


def _result_body(ctx: CollectContext, result: Any, source_id: str, url: str) -> bytes | None:
    """Return the parseable body for a fetch, reusing the raw-document cache on 304."""
    if getattr(result, "not_modified", False):
        for candidate in (url, getattr(result, "url", "")):
            if not candidate:
                continue
            cached = ctx.warehouse.get_raw_document(source_id, candidate)
            text = (cached or {}).get("body_text") or ""
            if text:
                return str(text).encode("utf-8")
        return None
    body = getattr(result, "body", b"") or b""
    return body if body else None


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Refresh US exchanges and listings from the two official bulk sources.

    A failed or throttled source never aborts the run: it is recorded in
    ``details["sources"]``, counted in ``skipped`` and the other files are still
    merged.  The payloads that are written make a second run idempotent.
    """
    source_status: dict[str, dict[str, Any]] = {}
    payloads: dict[str, bytes] = {}
    skipped = 0
    dry_run = False

    for label, source_id, url in SOURCES:
        try:
            result = ctx.http.fetch(source_id, url)
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            skipped += 1
            source_status[label] = {"source_id": source_id, "status": "error", "error": str(error)[:300]}
            ctx.logger.warning("US reference source %s failed: %s", source_id, error)
            continue
        if getattr(result, "dry_run", False):
            dry_run = True
            source_status[label] = {"source_id": source_id, "status": "dry_run"}
            continue
        body = _result_body(ctx, result, source_id, url)
        if body is None:
            skipped += 1
            source_status[label] = {"source_id": source_id, "status": "empty"}
            continue
        payloads[label] = body
        source_status[label] = {"source_id": source_id, "status": "ok", "bytes": len(body)}

    if not payloads:
        details: dict[str, Any] = {"sources": source_status, "reason": "no usable payloads"}
        if dry_run:
            details["dry_run"] = True
        return {
            "status": "ok",
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": skipped,
            "details": details,
        }

    parsed: dict[str, list[dict[str, Any]]] = {
        "sec": [], "nasdaq_listed": [], "other_listed": [],
    }
    parse_errors: dict[str, str] = {}
    parsers = {
        "sec": parse_sec_tickers,
        "nasdaq_listed": parse_nasdaq_listed,
        "other_listed": parse_other_listed,
    }
    for label, parser in parsers.items():
        body = payloads.get(label)
        if body is None:
            continue
        try:
            parsed[label] = parser(body)
        except ValueError as error:
            skipped += 1
            parse_errors[label] = str(error)[:300]
            source_status[label] = {**source_status.get(label, {}), "status": "parse_error",
                                    "error": str(error)[:300]}
            ctx.logger.warning("could not parse %s payload: %s", label, error)

    instruments, stats = _merge_with_stats(
        parsed["sec"], parsed["nasdaq_listed"], parsed["other_listed"],
    )
    aliases = _instrument_aliases(instruments)
    exchanges = _us_exchange_rows()

    stored = 0
    stored += ctx.warehouse.upsert_exchanges(exchanges)
    stored += ctx.warehouse.upsert_instruments(instruments)
    stored += ctx.warehouse.upsert_aliases(aliases)

    failed = any(
        status.get("status") in ("error", "empty", "parse_error")
        for status in source_status.values()
    )
    skipped += (
        stats["skipped_mic"] + stats["skipped_symbol"]
        + stats["skipped_name"] + stats["sec_only"]
    )
    details = {
        "sources": source_status,
        "sec_rows": len(parsed["sec"]),
        "nasdaq_listed_rows": len(parsed["nasdaq_listed"]),
        "other_listed_rows": len(parsed["other_listed"]),
        "merged": stats["merged"],
        "instruments": len(instruments),
        "exchanges": len(exchanges),
        "aliases": len(aliases),
        "skipped_mic": stats["skipped_mic"],
        "skipped_symbol": stats["skipped_symbol"],
        "skipped_name": stats["skipped_name"],
        "sec_only": stats["sec_only"],
        "duplicates": stats["duplicates"],
        "parse_errors": parse_errors,
    }
    ctx.logger.info(
        "US reference refresh: %d instrument(s), %d exchange(s), %d alias(es); "
        "skipped_mic=%d sec_only=%d",
        len(instruments), len(exchanges), len(aliases),
        stats["skipped_mic"], stats["sec_only"],
    )
    return {
        "status": "partial" if failed else "ok",
        "stored": stored,
        "updated": 0,
        "duplicates": stats["duplicates"],
        "skipped": skipped,
        "details": details,
    }


__all__ = [
    "NASDAQ_LISTED_MIC",
    "NASDAQ_LISTED_URL",
    "OTHER_LISTED_EXCHANGE_MICS",
    "OTHER_LISTED_URL",
    "SEC_TICKERS_URL",
    "SOURCES",
    "US_EXCHANGE_MICS",
    "collect",
    "merge_us_listings",
    "parse_nasdaq_listed",
    "parse_other_listed",
    "parse_sec_tickers",
]
