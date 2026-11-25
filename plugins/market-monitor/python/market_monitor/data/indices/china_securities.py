"""China securities index provider (``china:securities``).

The index tracks the mainland China listed universe -- A-shares (Shanghai,
Shenzhen, STAR and ChiNext) plus exchange-traded funds -- from the public
Eastmoney list endpoints, diffs it through the generic index framework and
projects the current state into the canonical reference tables.

Universe and source
-------------------
Two bounded, market-cap ranked passes are made against
``https://push2.eastmoney.com/api/qt/clist/get``:

* A-shares: ``m:1+t:2,m:0+t:6,m:1+t:23,m:0+t:80`` (Shanghai A, Shenzhen A,
  STAR, ChiNext);
* ETFs: ``b:MK0021`` (Shanghai + Shenzhen exchange-traded funds).

``pz`` is capped by the server at 100 rows per page, so the collector pages
through ``fid=f20`` (market capitalisation, descending) until the configured
entry target is reached.  Each row carries code (``f12``), market flag (``f13``:
``1`` = Shanghai, ``0`` = Shenzhen), Chinese name (``f14``), market cap
(``f20``), turnover (``f6``), last price (``f2``) and industry (``f100``).

Bounded collection
------------------
``china_stock_max_entries`` (default 2000) and ``china_fund_max_entries``
(default 800) bound the tracked universe; ``china_page_size`` (default 100) and
``china_max_pages`` (default 80) bound the number of provider requests.  A
failed page, an unusable payload or the page safety cap makes the snapshot
*partial* (:data:`False` in ``details["complete"]``): entries fetched so far are
still applied, but nothing is retired, so a transient provider failure can never
mass-delist the index.  A run that reaches its target, the last page or the
known ``data.total`` is complete.

Projection
----------
Added/updated/restored entries are projected into ``ref_instrument``,
``ref_alias`` and ``ref_exchange`` (the Shanghai/Shenzhen exchange rows already
exist in the curated seed).  Removed entries are never deleted: they move
``active -> missing -> delisted`` in the index and the projected instrument row
only changes ``listing_status`` (plus ``valid_to`` once delisted); a returning
entry is restored and its ``valid_to`` cleared.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext, instrument_id, to_iso, utc_now
from ..specs import EASTMONEY, SINA_CN_LIST
from ..sources import reference_global

LOGGER = logging.getLogger("market_monitor.data.indices.china_securities")

#: Canonical id of the China securities index.
INDEX_ID = "china:securities"

#: Public Eastmoney list endpoint (paged market-cap-ranked security lists).
BASE_URL = "https://push2.eastmoney.com/api/qt/clist/get"

#: Referer required by the public quote endpoints for browser-like clients.
REFERER = "https://quote.eastmoney.com/"

#: Fallback Sina market-center list endpoint used when Eastmoney pages fail.
SINA_BASE_URL = (
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
    "Market_Center.getHQNodeData"
)
SINA_REFERER = "https://finance.sina.com.cn/"
SINA_NODES = {"stock": "hs_a", "etf": "etf_hq_fund"}

#: Row fields requested from the provider (code, market, name, price, change,
#: turnover, market cap, industry).
FIELDS = "f12,f13,f14,f2,f3,f6,f20,f100"

#: Sort field: ``f20`` is market capitalisation, descending (``po=1``).
SORT_FIELD = "f20"

#: A-share clause filter: Shanghai A, Shenzhen A, STAR and ChiNext boards.
A_SHARE_FILTER = "m:1+t:2,m:0+t:6,m:1+t:23,m:0+t:80"

#: ETF clause filter: Shanghai + Shenzhen exchange-traded funds.
ETF_FILTER = "b:MK0021"

#: Instrument types tracked by this index, keyed by provider pass.
STOCK_TYPE = "stock"
FUND_TYPE = "etf"

#: MICs of the mainland exchanges covered by the index, in definition order.
CHINA_MICS = ("XSHG", "XSHE")

#: ``f13`` market flag -> exchange MIC.
_MARKET_BY_FLAG = {"1": "XSHG", "0": "XSHE"}

#: Exchange MIC -> Yahoo-style provider symbol suffix.
_SUFFIX_BY_MARKET = {"XSHG": "SS", "XSHE": "SZ"}

#: Default and maximum bounds (settings are clamped into these ranges).
DEFAULT_STOCK_MAX_ENTRIES = 2000
DEFAULT_FUND_MAX_ENTRIES = 800
DEFAULT_PAGE_SIZE = 100
DEFAULT_MAX_PAGES = 80
MAX_STOCK_ENTRIES = 6000
MAX_FUND_ENTRIES = 2000
MAX_PAGE_SIZE = 100
MAX_PAGES = 120

#: Declarative index definition stored by :meth:`ensure_registered`.
INDEX_DEFINITION: dict[str, Any] = {
    "index_id": INDEX_ID,
    "name": "China securities index",
    "kind": "china_securities",
    "description": (
        "Mainland China listed securities (A-shares on Shanghai/Shenzhen, STAR and "
        "ChiNext plus exchange-traded funds) from the public Eastmoney security "
        "lists; the canonical instrument universe for China quotes and EOD history."
    ),
    "markets": list(CHINA_MICS),
    "source_ids": [EASTMONEY, SINA_CN_LIST],
    "refresh_interval_s": 86400,
    "enabled": True,
}

#: Definition fields compared by :func:`ensure_registered`.
_DEFINITION_SCALARS = ("name", "kind", "description")


# --------------------------------------------------------------------- helpers


def _text(value: Any) -> str:
    """Trim a value to a string (``None`` becomes ``""``)."""
    return str(value).strip() if value is not None else ""


def _code(value: Any) -> str:
    """Normalise a provider security code, preserving Shenzhen leading zeros.

    ``f12`` is normally a string, but a numeric JSON value would drop the
    leading zeros of codes such as ``000001``; pad short digit values back to
    their canonical six-character form.
    """
    if isinstance(value, bool):
        return ""
    if isinstance(value, int):
        return f"{value:06d}"
    text = _text(value)
    if text.isdigit() and len(text) < 6:
        return text.zfill(6)
    return text


def _number(value: Any) -> float:
    """Best-effort float for a provider numeric field (``-``/missing -> 0.0)."""
    if value is None or isinstance(value, bool):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int_or_none(value: Any) -> int | None:
    """Best-effort int for ``data.total`` (``None`` when unusable)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _setting_int(
    settings: dict[str, Any],
    key: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    """Read one integer setting and clamp it into ``[minimum, maximum]``."""
    raw = settings.get(key, default)
    if isinstance(raw, bool) or raw is None:
        value = default
    else:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = default
    return max(minimum, min(maximum, value))


def _limits(ctx: CollectContext) -> dict[str, int]:
    """The clamped collection bounds for one run (settings -> safe ranges)."""
    settings = ctx.settings or {}
    return {
        "stock_max_entries": _setting_int(
            settings, "china_stock_max_entries", DEFAULT_STOCK_MAX_ENTRIES,
            minimum=1, maximum=MAX_STOCK_ENTRIES,
        ),
        "fund_max_entries": _setting_int(
            settings, "china_fund_max_entries", DEFAULT_FUND_MAX_ENTRIES,
            minimum=0, maximum=MAX_FUND_ENTRIES,
        ),
        "page_size": _setting_int(
            settings, "china_page_size", DEFAULT_PAGE_SIZE,
            minimum=1, maximum=MAX_PAGE_SIZE,
        ),
        "max_pages": _setting_int(
            settings, "china_max_pages", DEFAULT_MAX_PAGES,
            minimum=1, maximum=MAX_PAGES,
        ),
    }


def _eastmoney_filter(filter_value: str) -> str:
    """Percent-encode one Eastmoney ``fs`` filter without changing its syntax.

    ``+`` separates filter clauses in the provider syntax (``m:1+t:2``), so it
    must travel as ``%2B``: a raw ``+`` is parsed back as a space by the server
    and the filter silently matches nothing.
    """
    return quote(str(filter_value or "").strip(), safe="")


def _list_url(page: int, page_size: int, filter_value: str) -> str:
    """Build one paged list request URL (``fid=f20``, market cap descending)."""
    return (
        f"{BASE_URL}?pn={int(page)}&pz={int(page_size)}&po=1&np=1&fltt=2&invt=2"
        f"&fid={SORT_FIELD}&fs={_eastmoney_filter(filter_value)}&fields={FIELDS}"
    )


def _entry_aliases(symbol: str, name: str, provider_symbol: str) -> list[dict[str, str]]:
    """Build the alias payload (symbol, Chinese name, provider symbol)."""
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for value, alias_type in (
        (symbol, "symbol"),
        (name, "name"),
        (provider_symbol, "provider_symbol"),
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
    payload: dict[str, Any],
    source_id: str = EASTMONEY,
) -> dict[str, Any]:
    """Assemble one snapshot entry in the shape ``apply_index_snapshot`` expects."""
    return {
        "entry_key": entity_id,
        "entity_type": "instrument",
        "entity_id": entity_id,
        "market": market,
        "source_id": source_id,
        "payload": payload,
        "profile_status": "ready",
    }


def _entry_from_row(row: dict[str, Any], instrument_type: str) -> dict[str, Any] | None:
    """Map one Eastmoney list row to a snapshot entry (``None`` when unusable).

    ``name`` carries the Chinese name provided by ``f14`` (there is no English
    name in the list payload), so ``name_zh`` mirrors it for display consumers.
    """
    code = _code(row.get("f12"))
    market = _MARKET_BY_FLAG.get(_text(row.get("f13")))
    if not code or market is None:
        return None
    try:
        entity_id = instrument_id(market, code)
    except ValueError:
        LOGGER.debug("skipping Eastmoney row with invalid identity: %s/%s", market, code)
        return None
    flag = _text(row.get("f13"))
    name = _text(row.get("f14")) or code
    industry = _text(row.get("f100"))
    provider_symbol = f"{code}.{_SUFFIX_BY_MARKET[market]}"
    payload = {
        "name": name,
        "name_zh": name,
        "symbol": code,
        "venue": market,
        "instrument_type": instrument_type,
        "currency": "CNY",
        "country": "CN",
        "sector": industry,
        "industry": industry,
        "provider_symbol": provider_symbol,
        "provider_ids": {"eastmoney_secid": f"{flag}.{code}"},
        "market_cap": _number(row.get("f20")),
        "turnover": _number(row.get("f6")),
        "last_price": _number(row.get("f2")),
        "aliases": _entry_aliases(code, name, provider_symbol),
    }
    return _entry(entity_id=entity_id, market=market, payload=payload)


def _sina_entry_from_row(
    row: dict[str, Any], instrument_type: str,
) -> dict[str, Any] | None:
    """Map one Sina market-centre row to a snapshot entry (fallback source)."""
    raw_symbol = _text(row.get("symbol")).lower()
    code = _code(row.get("code"))
    if raw_symbol.startswith("sh"):
        market = "XSHG"
        code = code or _code(raw_symbol[2:])
    elif raw_symbol.startswith("sz"):
        market = "XSHE"
        code = code or _code(raw_symbol[2:])
    else:
        return None
    if not code:
        return None
    try:
        entity_id = instrument_id(market, code)
    except ValueError:
        return None
    name = _text(row.get("name")) or code
    provider_symbol = f"{code}.{_SUFFIX_BY_MARKET[market]}"
    # Sina reports market capitalisation in ten-thousand CNY.
    market_cap = _number(row.get("mktcap")) * 10000.0
    payload = {
        "name": name,
        "name_zh": name,
        "symbol": code,
        "venue": market,
        "instrument_type": instrument_type,
        "currency": "CNY",
        "country": "CN",
        "sector": "",
        "industry": "",
        "provider_symbol": provider_symbol,
        "provider_ids": {"sina_symbol": raw_symbol},
        "market_cap": market_cap,
        "turnover": _number(row.get("amount")),
        "last_price": _number(row.get("trade")),
        "aliases": _entry_aliases(code, name, provider_symbol),
    }
    return _entry(
        entity_id=entity_id, market=market, payload=payload, source_id=SINA_CN_LIST,
    )


def _sina_list_url(page: int, page_size: int, node: str) -> str:
    """Build one Sina market-centre list URL."""
    return (
        f"{SINA_BASE_URL}?page={page}&num={page_size}&sort=mktcap&asc=0"
        f"&node={quote(node, safe='')}"
    )


def _parse_sina_page(body: bytes) -> list[dict[str, Any]]:
    """Decode one Sina list page (a JSON array) into rows."""
    payload = json.loads(body.decode("utf-8", errors="replace"))
    if not isinstance(payload, list):
        raise ValueError("Sina payload is not a JSON array")
    return [row for row in payload if isinstance(row, dict)]


# --------------------------------------------------------------------- fetching


def _page_body(ctx: CollectContext, result: Any, url: str) -> bytes | None:
    """Return the parseable body for one fetch, reusing the raw cache on ``304``."""
    if getattr(result, "not_modified", False):
        for candidate in (url, getattr(result, "url", "")):
            if not candidate:
                continue
            cached = ctx.warehouse.get_raw_document(EASTMONEY, candidate)
            text = (cached or {}).get("body_text") or ""
            if text:
                return str(text).encode("utf-8")
        return None
    body = getattr(result, "body", b"") or b""
    return body if body else None


def _parse_page(body: bytes) -> tuple[list[dict[str, Any]], int | None]:
    """Decode one ``clist`` JSON page into ``(rows, data.total)``.

    Eastmoney answers ``{"rc":0, "data":null}`` when a selection has no rows;
    that is a valid empty page, not a parse error.
    """
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
    except ValueError as error:
        raise ValueError(f"invalid JSON: {_text(error)[:160]}") from error
    if not isinstance(payload, dict):
        raise ValueError("payload is not a JSON object")
    if "data" not in payload:
        raise ValueError("payload has no data member")
    rc = _int_or_none(payload.get("rc"))
    if rc is not None and rc != 0:
        raise ValueError(f"provider error rc={rc}")
    data = payload.get("data")
    if data is None:
        return [], 0
    if not isinstance(data, dict):
        raise ValueError("data is not a JSON object")
    diff = data.get("diff") or []
    if not isinstance(diff, list):
        raise ValueError("data.diff is not a list")
    rows = [row for row in diff if isinstance(row, dict)]
    return rows, _int_or_none(data.get("total"))


def _fetch_sina_class(
    ctx: CollectContext,
    *,
    label: str,
    instrument_type: str,
    target: int,
    page_size: int,
    max_pages: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fallback list pass over Sina's market-centre API."""
    detail: dict[str, Any] = {
        "label": label,
        "filter": "",
        "source": SINA_CN_LIST,
        "instrument_type": instrument_type,
        "target": int(target),
        "complete": True,
        "status": "ok",
        "pages": 0,
        "requests": 0,
        "rows": 0,
        "entries": 0,
        "total": None,
        "error": "",
        "errors": [],
    }
    entries: list[dict[str, Any]] = []
    if target <= 0:
        detail["status"] = "skipped"
        return entries, detail
    node = SINA_NODES.get(instrument_type)
    if node is None:
        detail["status"] = "skipped"
        return entries, detail
    for page in range(1, max_pages + 1):
        url = _sina_list_url(page, page_size, node)
        detail["requests"] += 1
        try:
            result = ctx.http.fetch(
                SINA_CN_LIST,
                url,
                headers={"Referer": SINA_REFERER},
                accept="application/json",
            )
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            detail["complete"] = False
            detail["status"] = "partial"
            detail["error"] = _text(error)[:300]
            detail["errors"].append({"page": page, "error": detail["error"]})
            break
        if getattr(result, "dry_run", False):
            detail["complete"] = False
            detail["status"] = "partial"
            detail["error"] = "dry-run placeholder without a body"
            break
        body = getattr(result, "body", b"") or b""
        try:
            rows = _parse_sina_page(body)
        except ValueError as error:
            detail["complete"] = False
            detail["status"] = "parse_error"
            detail["error"] = _text(error)[:300]
            detail["errors"].append({"page": page, "error": detail["error"]})
            break
        detail["pages"] += 1
        detail["rows"] += len(rows)
        for raw in rows:
            if len(entries) >= target:
                break
            entry = _sina_entry_from_row(raw, instrument_type)
            if entry is not None:
                entries.append(entry)
        if len(entries) >= target:
            break
        if not rows or len(rows) < page_size:
            break
    else:
        detail["complete"] = False
        detail["status"] = "partial"
        detail["error"] = f"page cap ({max_pages}) reached before target {target}"
        detail["errors"].append({"page": max_pages, "error": detail["error"]})
    detail["entries"] = len(entries)
    return entries, detail


def _fetch_class(
    ctx: CollectContext,
    *,
    label: str,
    filter_value: str,
    instrument_type: str,
    target: int,
    limits: dict[str, int],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch one ranked security list up to ``target`` entries.

    Pagination stops when the target entry count is reached, the provider
    returns an empty page, the page is the last one (fewer rows than the page
    size), ``data.total`` rows have been seen, or a page fails.  A failure or
    the page safety cap marks the pass incomplete and is recorded in the
    returned detail instead of raising, so the other pass still lands.
    """
    detail: dict[str, Any] = {
        "label": label,
        "filter": filter_value,
        "instrument_type": instrument_type,
        "target": int(target),
        "complete": True,
        "status": "ok",
        "pages": 0,
        "requests": 0,
        "rows": 0,
        "entries": 0,
        "total": None,
        "error": "",
        "errors": [],
    }
    entries: list[dict[str, Any]] = []
    if target <= 0:
        detail["status"] = "skipped"
        return entries, detail

    page_size = limits["page_size"]
    max_pages = limits["max_pages"]

    def fail(status: str, message: str, page: int) -> None:
        """Record a page-level failure on the class detail."""
        detail["complete"] = False
        detail["status"] = status
        if not detail["error"]:
            detail["error"] = message[:300]
        detail["errors"].append({"page": int(page), "error": message[:300]})
        LOGGER.warning("eastmoney %s page %d failed: %s", label, page, message)

    for page in range(1, max_pages + 1):
        url = _list_url(page, page_size, filter_value)
        detail["requests"] += 1
        try:
            result = ctx.http.fetch(
                EASTMONEY,
                url,
                headers={"Referer": REFERER},
                accept="application/json",
            )
        except (SourceRateLimitedError, SourceBlockedError, DataSourceError) as error:
            fail("partial", _text(error), page)
            break
        if getattr(result, "dry_run", False):
            fail("partial", "dry-run placeholder without a body", page)
            break
        body = _page_body(ctx, result, url)
        if body is None:
            fail("partial", "empty response body", page)
            break
        try:
            rows, total = _parse_page(body)
        except ValueError as error:
            fail("parse_error", _text(error), page)
            break
        if total is not None:
            detail["total"] = total
        detail["pages"] += 1
        detail["rows"] += len(rows)
        for raw in rows:
            if len(entries) >= target:
                break
            entry = _entry_from_row(raw, instrument_type)
            if entry is not None:
                entries.append(entry)
        if len(entries) >= target:
            break
        if not rows:
            # A genuinely empty selection means the universe is exhausted; an
            # empty page while ``data.total`` still promises rows is a provider
            # inconsistency and must never be applied as a complete snapshot.
            if total is not None and total > detail["rows"]:
                fail("partial", f"empty page before data.total={total}", page)
            break
        if len(rows) < page_size:
            if total is not None and detail["rows"] < total:
                fail(
                    "partial",
                    f"short page ({len(rows)} row(s)) before data.total={total}",
                    page,
                )
            break
        if total is not None and detail["rows"] >= total:
            break
    else:
        # The loop ran out of page budget before the target or the end of the
        # data: treat it as a partial snapshot so no entry can be retired.
        fail("partial", f"page cap ({max_pages}) reached before target {target}", max_pages)

    detail["entries"] = len(entries)
    if not detail["complete"]:
        fallback_entries, fallback_detail = _fetch_sina_class(
            ctx,
            label=label,
            instrument_type=instrument_type,
            target=target,
            page_size=page_size,
            max_pages=max_pages,
        )
        if fallback_entries:
            LOGGER.info(
                "china securities %s: Eastmoney failed, Sina fallback produced %d entries",
                label, len(fallback_entries),
            )
            fallback_detail["fallback_from"] = EASTMONEY
            fallback_detail["eastmoney_errors"] = detail["errors"]
            entries = fallback_entries
            detail = fallback_detail
    detail["entries"] = len(entries)
    return entries, detail


# --------------------------------------------------------------------- snapshot


def build_snapshot(ctx: CollectContext) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build the China securities snapshot from the two Eastmoney lists.

    The A-share pass runs first, then the ETF pass.  ``details["complete"]`` is
    only ``True`` when both passes finished within their configured bounds;
    any failed page keeps the entries fetched so far and reports ``partial``.
    """
    limits = _limits(ctx)
    stock_entries, stock_details = _fetch_class(
        ctx,
        label="a_shares",
        filter_value=A_SHARE_FILTER,
        instrument_type=STOCK_TYPE,
        target=limits["stock_max_entries"],
        limits=limits,
    )
    fund_entries, fund_details = _fetch_class(
        ctx,
        label="etfs",
        filter_value=ETF_FILTER,
        instrument_type=FUND_TYPE,
        target=limits["fund_max_entries"],
        limits=limits,
    )

    by_key: dict[str, dict[str, Any]] = {}
    duplicates = 0
    for entry in [*stock_entries, *fund_entries]:
        key = entry["entry_key"]
        if key in by_key:
            duplicates += 1
            continue
        by_key[key] = entry
    entries = sorted(by_key.values(), key=lambda entry: entry["entry_key"])

    complete = bool(stock_details["complete"] and fund_details["complete"])
    requests = int(stock_details["requests"]) + int(fund_details["requests"])
    errors = [*stock_details["errors"], *fund_details["errors"]]
    markets: dict[str, int] = {}
    for entry in entries:
        markets[entry["market"]] = markets.get(entry["market"], 0) + 1
    details: dict[str, Any] = {
        "complete": complete,
        "index_id": INDEX_ID,
        "stocks": stock_details,
        "funds": fund_details,
        "sources": {
            EASTMONEY: {
                "source_id": EASTMONEY,
                "status": "ok" if complete else "partial",
                "complete": complete,
                "requests": requests,
                "entries": len(entries),
            },
        },
        "entries": len(entries),
        "stock_entries": len(stock_entries),
        "fund_entries": len(fund_entries),
        "duplicates": duplicates,
        "markets": markets,
        "requests": requests,
        "skipped": len(errors),
        "errors": errors,
        "limits": limits,
    }
    ctx.logger.info(
        "china securities snapshot: %d entry(ies) (%d stock, %d fund) in %d request(s); "
        "complete=%s",
        len(entries), len(stock_entries), len(fund_entries), requests, complete,
    )
    return entries, details


# ----------------------------------------------------------------- registration


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
    """Register the China securities definition if absent or out of date.

    Returns the stored definition with decoded JSON columns.  The check avoids
    bumping ``updated_at`` (and therefore the index revision shown in the UI)
    when the declarative definition is unchanged.
    """
    current = ward.get_index_definition(INDEX_ID)
    if current is not None and _definition_matches(current, INDEX_DEFINITION):
        return current
    registered = ward.register_index(dict(INDEX_DEFINITION)) or {}
    if registered.get("index_id") == INDEX_ID:
        return registered
    return ward.get_index_definition(INDEX_ID) or dict(INDEX_DEFINITION)


# ------------------------------------------------------------------- projection


def _exchange_rows() -> list[dict[str, Any]]:
    """``ref_exchange`` rows for the two mainland exchanges from the seed."""
    seed = reference_global.load_seed()
    rows: list[dict[str, Any]] = []
    for raw in seed.get("exchanges") or []:
        mic = _text(raw.get("mic")).upper()
        if mic not in CHINA_MICS:
            continue
        record = {field: _text(raw.get(field)) for field in reference_global.EXCHANGE_FIELDS}
        record["mic"] = mic
        record["source_id"] = reference_global.SEED_SOURCE_ID
        rows.append(record)
    return rows


def _project_active_entries(
    ward: Any,
    entries: list[dict[str, Any]],
    *,
    observed_at: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], int]:
    """Build ``ref_instrument`` and alias rows for active entries.

    Returns ``(instrument_rows, alias_rows, clear_valid_to, skipped)``.  The
    ``clear_valid_to`` ids were delisted before and are active again; their
    lifecycle end date must not survive a restore.
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
        existing = ward.get_instrument(entity_id) or {}
        if _text(existing.get("valid_to")):
            clear_valid_to.append(entity_id)
        name = _text(payload.get("name")) or _text(payload.get("name_zh")) or symbol
        # Empty provider metadata (ETFs carry no industry) must not erase
        # enrichment that came from the curated seed or an earlier refresh.
        sector = _text(payload.get("sector")) or _text(existing.get("sector"))
        industry = _text(payload.get("industry")) or _text(existing.get("industry"))
        first_seen = _text(entry.get("first_seen_at")) or observed_at
        source_id = _text(entry.get("source_id")) or EASTMONEY
        instrument_rows.append({
            "instrument_id": entity_id,
            "symbol": symbol,
            "mic": mic,
            "name": name,
            "type": _text(payload.get("instrument_type")) or STOCK_TYPE,
            "currency": _text(payload.get("currency")) or "CNY",
            "country": _text(payload.get("country")) or "CN",
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
            if not isinstance(alias, dict):
                continue
            alias_text = _text(alias.get("alias"))
            if not alias_text:
                continue
            alias_type = _text(alias.get("alias_type")) or "name"
            alias_rows.append({
                "alias": alias_text[:160],
                "entity_type": "instrument",
                "entity_id": entity_id,
                "alias_type": alias_type,
                "language": "zh" if alias_type == "name" else "en",
                "source_id": source_id,
            })
    return instrument_rows, alias_rows, clear_valid_to, skipped


def project_entries(ward: Any, applied: dict[str, Any], *, observed_at: str) -> dict[str, Any]:
    """Project the changed index entries into the canonical reference tables.

    ``applied`` is the return value of :meth:`DataWarehouse.apply_index_snapshot`.
    Instrument, alias and exchange rows are written for added/updated/restored
    entries; removed entries only move their lifecycle status, so a transient
    missing security can be restored later without losing metadata.
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
    for entry in [*updated, *restored]:
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
    # Active rows are upserted without ``valid_to`` (the column whitelist keeps
    # lifecycle state out of normal refreshes), so clear it explicitly.
    for entity_id in clear_valid_to:
        ward.set_instrument_status(entity_id, "active")

    missing_updated = 0
    for entry in applied.get("missing_entries") or []:
        entity_id = _text(entry.get("entity_id"))
        if entity_id and ward.set_instrument_status(entity_id, "missing"):
            missing_updated += 1
        else:
            skipped += 1
    delisted_updated = 0
    for entry in applied.get("delisted_entries") or []:
        entity_id = _text(entry.get("entity_id"))
        if entity_id and ward.set_instrument_status(entity_id, "delisted", valid_to=observed_at):
            delisted_updated += 1
        else:
            skipped += 1

    exchange_rows = _exchange_rows()
    stored_exchanges = ward.upsert_exchanges(exchange_rows) if exchange_rows else 0

    return {
        "stored": stored_instruments,
        "aliases": stored_aliases,
        "exchanges": stored_exchanges,
        "missing": missing_updated,
        "delisted": delisted_updated,
        "restored": len(restored),
        "cleared_valid_to": len(clear_valid_to),
        "skipped": skipped,
        "active_entries": len(entries),
    }


# ---------------------------------------------------------------------- collect


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
    """Refresh the China securities index and its reference projections.

    Page failures never abort the run: the snapshot is applied as a partial
    snapshot so no existing entry is retired by an incomplete fetch, while the
    failure is recorded in the refresh audit.  A dry run neither fetches nor
    writes anything.
    """
    ward = ctx.warehouse
    started_at = ctx.now_iso()

    if bool(ctx.settings.get("dry_run")):
        limits = _limits(ctx)
        planned = (
            f"fetch up to {limits['stock_max_entries']} A-share row(s) then up to "
            f"{limits['fund_max_entries']} ETF row(s) from {EASTMONEY} "
            f"({limits['page_size']} row(s)/page, at most {limits['max_pages']} page(s))"
        )
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": 0,
            "status": "ok",
            "index_id": INDEX_ID,
            "details": {
                "dry_run": True,
                "index_id": INDEX_ID,
                "planned": planned,
                "limits": limits,
                "requests": 0,
            },
        }

    observed_at = ctx.now_iso()
    try:
        definition = ensure_registered(ward)
        next_refresh_at = _next_refresh_at(ctx, definition)
        ward.set_index_next_refresh(INDEX_ID, next_refresh_at)
        entries, snapshot_details = build_snapshot(ctx)
        complete = bool(snapshot_details.get("complete"))
        applied = ward.apply_index_snapshot(
            INDEX_ID,
            entries,
            source_id=EASTMONEY,
            full_snapshot=complete,
            delist_confirmations=int(ctx.settings.get("index_delist_confirmations", 2)),
            observed_at=observed_at,
        )
        projection = project_entries(ward, applied, observed_at=observed_at)
    except Exception as error:  # noqa: BLE001 - audit the failure, then surface it
        _record_error_refresh(ward, started_at, error)
        raise

    counts = _refresh_counts(applied)
    revision = int(applied.get("revision") or 0)
    status = "ok" if complete else "partial"
    ward.record_index_refresh(
        INDEX_ID,
        started_at=started_at,
        status=status,
        counts=counts,
        requests=int(snapshot_details.get("requests") or 0),
        details={
            "sources": snapshot_details.get("sources") or {},
            "errors": snapshot_details.get("errors") or [],
            "complete": complete,
            "entries": int(snapshot_details.get("entries") or 0),
            "stocks": snapshot_details.get("stocks") or {},
            "funds": snapshot_details.get("funds") or {},
            "next_refresh_at": next_refresh_at,
            "projection": projection,
        },
    )
    ctx.logger.info(
        "china securities refresh: revision=%d added=%d updated=%d removed=%d "
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
        "index_id": INDEX_ID,
        "details": {
            "counts": counts,
            "sources": snapshot_details.get("sources") or {},
            "errors": snapshot_details.get("errors") or [],
            "revision": revision,
            "next_refresh_at": next_refresh_at,
            "complete": complete,
            "entries": int(snapshot_details.get("entries") or 0),
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
        LOGGER.warning("could not record china securities error refresh: %s", record_error)


__all__ = [
    "A_SHARE_FILTER",
    "BASE_URL",
    "CHINA_MICS",
    "DEFAULT_FUND_MAX_ENTRIES",
    "DEFAULT_MAX_PAGES",
    "DEFAULT_PAGE_SIZE",
    "DEFAULT_STOCK_MAX_ENTRIES",
    "ETF_FILTER",
    "FIELDS",
    "INDEX_DEFINITION",
    "INDEX_ID",
    "MAX_FUND_ENTRIES",
    "MAX_PAGES",
    "MAX_PAGE_SIZE",
    "MAX_STOCK_ENTRIES",
    "SORT_FIELD",
    "build_snapshot",
    "collect",
    "ensure_registered",
    "project_entries",
]
