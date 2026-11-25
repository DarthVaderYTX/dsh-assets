"""Entity linking for stored news articles (``news:link`` job, no network use).

The linker builds a dictionary from the warehouse reference tables and alias
rows, then matches article title/summary text against it on word boundaries.
Only confirmed mentions become rows in ``news_entity``; the article itself is
never modified and no HTTP request is made.

Matching rules:

- ticker / provider symbols must appear in the original upper-case form (the
  same case pattern as the stored symbol), so a lower-case English word that
  happens to be a ticker is not linked;
- index codes and names, commodity names and company names are matched
  case-insensitively on word boundaries;
- aliases shorter than two characters, purely numeric aliases and a small
  generic-word blocklist (``A``, ``ON``, ``IT``, ``ALL``, ...) are ignored;
- one link per ``(entity_type, entity_id)`` is kept (highest confidence wins)
  and at most :data:`MAX_LINKS_PER_ARTICLE` links are stored per article.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from ..models import CollectContext

LOGGER = logging.getLogger("market_monitor.data.sources.news_linker")

#: Hard cap on stored links per article.
MAX_LINKS_PER_ARTICLE = 12
#: Aliases shorter than this are never linked.
MIN_ALIAS_LENGTH = 2
#: Default number of newest articles re-scanned by the ``news:link`` job.
DEFAULT_LINK_LIMIT = 200
#: Upper bound applied to ``settings['link_limit']`` to keep the job bounded.
MAX_LINK_LIMIT = 2000
#: How many instrument/index rows are scanned when building the dictionary.
INSTRUMENT_SCAN_LIMIT = 50000
INDEX_SCAN_LIMIT = 5000

#: Confidence/method values (see ``docs/DATA.md`` and the collection contract).
INSTRUMENT_SYMBOL_CONFIDENCE = 0.85
INDEX_SYMBOL_CONFIDENCE = 0.8
INDEX_NAME_CONFIDENCE = 0.6
COMMODITY_SYMBOL_CONFIDENCE = 0.6
COMMODITY_NAME_SHORT_CONFIDENCE = 0.6
COMMODITY_NAME_LONG_CONFIDENCE = 0.7
COMMODITY_CONTRACT_SYMBOL_CONFIDENCE = 0.6
NAME_MIN_CONFIDENCE = 0.55
NAME_MAX_CONFIDENCE = 0.75

_ENTITY_TYPES = frozenset({
    "instrument", "index", "commodity_root", "commodity_contract",
})
_SYMBOL_ALIAS_TYPES = frozenset({"symbol", "ticker", "provider_symbol"})
_NAME_ALIAS_TYPES = frozenset({"name", "company_name", "short_name"})

#: Lower-case aliases that are ordinary words rather than entity mentions.
GENERIC_ALIASES = frozenset({
    "a", "ai", "all", "an", "and", "as", "at", "be", "by", "eu", "for",
    "from", "if", "in", "is", "it", "no", "not", "of", "on", "or", "so",
    "the", "to", "uk", "up", "us", "we",
    # Financial/news acronyms that also exist as US tickers.
    "ipo", "spac", "esg", "etf", "etn", "reit", "ceo", "cfo", "coo", "fed",
    "fomc", "sec", "ecb", "boe", "boj", "imf", "wto", "opec", "iea", "fda",
    "ftc", "doj", "irs", "gdp", "cpi", "ppi", "pmi", "yoy", "qoq", "mom",
    "cagr", "eps", "roe", "roi", "m&a", "ev", "vr", "ml", "bbc", "nhs", "tv",
    "g7", "g20", "br", "sale", "bid", "ask", "buy", "sell", "hold", "long",
    "short", "call", "put", "cash", "bond", "note", "fund", "trust", "net",
})

#: Legal-form and share-class tokens stripped to form brand name variants.
_NAME_SUFFIXES = frozenset({
    "inc", "incorporated", "corp", "corporation", "co", "company", "ltd",
    "limited", "plc", "group", "holdings", "holding", "ag", "sa", "s.a.",
    "nv", "n.v.", "se", "spa", "kk", "k.k.", "pte", "bhd", "berhad",
    "class", "series", "ordinary", "shares", "the",
})

_WORD_LEFT = r"(?<![A-Za-z0-9])"
_WORD_RIGHT = r"(?![A-Za-z0-9])"
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class _AliasMatcher:
    """One compiled alias ready for text matching."""

    alias: str
    pattern: re.Pattern[str]
    entity_type: str
    entity_id: str
    confidence: float
    method: str


# --------------------------------------------------------------------- helpers


def _normalise_alias(value: Any) -> str:
    """Collapse whitespace in a reference-table alias value."""
    return _WHITESPACE_RE.sub(" ", str(value or "").strip())


def _is_usable_alias(alias: str) -> bool:
    """True when an alias is safe to match against news text.

    Rejects too-short aliases, purely numeric values and the generic-word
    blocklist that causes false positives (``A``, ``ON``, ``IT``, ``ALL``, ...).
    """
    if len(alias) < MIN_ALIAS_LENGTH:
        return False
    if alias.casefold() in GENERIC_ALIASES:
        return False
    if not any(character.isalpha() for character in alias):
        return False
    return True


def _name_variants(value: Any) -> list[str]:
    """Brand-name variants of a company/index name for news matching.

    ``NVIDIA Corporation`` also matches ``NVIDIA``, ``Apple Inc.`` matches
    ``Apple`` and ``Amazon.com, Inc.`` matches both ``Amazon.com`` and
    ``Amazon``; overly short or generic results are dropped.
    """
    base = _normalise_alias(value)
    if base == "":
        return []
    variants: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        cleaned = candidate.strip(" ,.&+")
        if cleaned == "" or cleaned.casefold() in seen:
            return
        if not _is_usable_alias(cleaned):
            return
        seen.add(cleaned.casefold())
        variants.append(cleaned)

    add(base)
    words = base.replace(",", " ").split()
    while words and words[-1].lower().strip(".,") in _NAME_SUFFIXES:
        words.pop()
    while words and words[-1].lower().strip(".,") in {"&", "and"}:
        words.pop()
    if words:
        add(" ".join(words))
    if "." in base:
        add(base.split(".")[0])
    return variants


def _name_confidence(alias: str) -> float:
    """Confidence for a company-name match, rising with the alias length."""
    length = len(alias)
    if length <= 3:
        return NAME_MIN_CONFIDENCE
    if length <= 5:
        return 0.6
    if length <= 8:
        return 0.65
    if length <= 12:
        return 0.7
    return NAME_MAX_CONFIDENCE


def _commodity_name_confidence(alias: str) -> float:
    """Confidence for a commodity-name match (0.6 short, 0.7 descriptive)."""
    return COMMODITY_NAME_LONG_CONFIDENCE if len(alias) >= 6 else COMMODITY_NAME_SHORT_CONFIDENCE


def _rows(value: Any) -> list[dict[str, Any]]:
    """Coerce a warehouse list result to a list (defensive against ``None``)."""
    return list(value or [])


def _dictionary_entry(
    alias: Any,
    *,
    entity_type: str,
    entity_id: str,
    alias_type: str,
    confidence: float,
    method: str,
    case_sensitive: bool,
) -> dict[str, Any] | None:
    """Build one validated dictionary entry (``None`` when unusable)."""
    text = _normalise_alias(alias)
    if not entity_id or not _is_usable_alias(text):
        return None
    return {
        "alias": text,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "alias_type": alias_type,
        "confidence": round(float(confidence), 2),
        "method": method,
        "case_sensitive": bool(case_sensitive),
    }


def _store_entry(
    store: dict[tuple[str, str, str], dict[str, Any]],
    entry: dict[str, Any] | None,
) -> None:
    """Keep the highest-confidence entry per ``(alias, type, id)``."""
    if entry is None:
        return
    key = (entry["alias"].casefold(), entry["entity_type"], entry["entity_id"])
    current = store.get(key)
    if current is None or entry["confidence"] > current["confidence"]:
        store[key] = entry


def _alias_facts(entity_type: str, alias_type: str, alias: str) -> tuple[float, str, bool] | None:
    """Return ``(confidence, method, case_sensitive)`` for an alias row."""
    if alias_type in _SYMBOL_ALIAS_TYPES:
        if entity_type == "instrument":
            return INSTRUMENT_SYMBOL_CONFIDENCE, "symbol", True
        if entity_type == "index":
            return INDEX_SYMBOL_CONFIDENCE, "index_symbol", True
        if entity_type == "commodity_root":
            return COMMODITY_SYMBOL_CONFIDENCE, "commodity_name", True
        if entity_type == "commodity_contract":
            return COMMODITY_CONTRACT_SYMBOL_CONFIDENCE, "symbol", True
        return None
    if alias_type in _NAME_ALIAS_TYPES:
        if entity_type == "instrument":
            return _name_confidence(alias), "name", False
        if entity_type == "index":
            return INDEX_NAME_CONFIDENCE, "index_name", False
        if entity_type == "commodity_root":
            return _commodity_name_confidence(alias), "commodity_name", False
        if entity_type == "commodity_contract":
            return COMMODITY_NAME_SHORT_CONFIDENCE, "commodity_name", False
    return None


# ------------------------------------------------------------------ dictionary


def build_entity_dictionary(warehouse: Any) -> list[dict[str, Any]]:
    """Build the linkable alias dictionary from warehouse reference data.

    Sources are every alias row in ``ref_alias`` for the supported entity types
    (``instrument``, ``index``, ``commodity_root``, ``commodity_contract``), plus
    instrument/index/commodity-root ``symbol``/``provider_symbol``/``name``
    columns and commodity-contract quote symbols, so linking also works when
    ``ref_alias`` has not been seeded yet.  Each entry is a plain dictionary
    with ``alias``, ``entity_type``, ``entity_id``, ``alias_type``,
    ``confidence``, ``method`` and ``case_sensitive`` keys, sorted
    deterministically.  Aliases shorter than two characters, purely numeric
    aliases and generic words are excluded.
    """
    store: dict[tuple[str, str, str], dict[str, Any]] = {}

    for row in _rows(warehouse.list_aliases()):
        entity_type = str(row.get("entity_type") or "").strip().lower()
        if entity_type not in _ENTITY_TYPES:
            continue
        entity_id = str(row.get("entity_id") or "").strip()
        if not entity_id:
            continue
        alias_type = str(row.get("alias_type") or "").strip().lower()
        alias = _normalise_alias(row.get("alias"))
        facts = _alias_facts(entity_type, alias_type, alias)
        if facts is None:
            continue
        confidence, method, case_sensitive = facts
        _store_entry(store, _dictionary_entry(
            alias,
            entity_type=entity_type,
            entity_id=entity_id,
            alias_type=alias_type,
            confidence=confidence,
            method=method,
            case_sensitive=case_sensitive,
        ))
        if alias_type in _NAME_ALIAS_TYPES and entity_type in ("instrument", "index", "commodity_root"):
            # Reference aliases often carry the full legal name only; add brand
            # variants so a headline saying "Nvidia" matches "NVIDIA Corporation".
            for variant in _name_variants(alias)[1:]:
                variant_facts = _alias_facts(entity_type, alias_type, variant)
                if variant_facts is None:
                    continue
                variant_confidence, variant_method, variant_case = variant_facts
                _store_entry(store, _dictionary_entry(
                    variant,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    alias_type=alias_type,
                    confidence=min(variant_confidence, confidence),
                    method=variant_method,
                    case_sensitive=variant_case,
                ))

    for row in _rows(warehouse.list_instruments(limit=INSTRUMENT_SCAN_LIMIT)):
        entity_id = str(row.get("instrument_id") or "").strip()
        if not entity_id:
            continue
        _store_entry(store, _dictionary_entry(
            row.get("symbol"),
            entity_type="instrument",
            entity_id=entity_id,
            alias_type="symbol",
            confidence=INSTRUMENT_SYMBOL_CONFIDENCE,
            method="symbol",
            case_sensitive=True,
        ))
        _store_entry(store, _dictionary_entry(
            row.get("provider_symbol"),
            entity_type="instrument",
            entity_id=entity_id,
            alias_type="provider_symbol",
            confidence=INSTRUMENT_SYMBOL_CONFIDENCE,
            method="symbol",
            case_sensitive=True,
        ))
        name = _normalise_alias(row.get("name"))
        for variant in _name_variants(name):
            _store_entry(store, _dictionary_entry(
                variant,
                entity_type="instrument",
                entity_id=entity_id,
                alias_type="name",
                confidence=_name_confidence(variant),
                method="name",
                case_sensitive=False,
            ))

    for row in _rows(warehouse.list_indices(limit=INDEX_SCAN_LIMIT)):
        entity_id = str(row.get("index_id") or "").strip()
        if not entity_id:
            continue
        code = _normalise_alias(row.get("code")).lstrip("^")
        provider_symbol = _normalise_alias(row.get("provider_symbol")).lstrip("^")
        _store_entry(store, _dictionary_entry(
            code,
            entity_type="index",
            entity_id=entity_id,
            alias_type="symbol",
            confidence=INDEX_SYMBOL_CONFIDENCE,
            method="index_symbol",
            case_sensitive=True,
        ))
        _store_entry(store, _dictionary_entry(
            provider_symbol,
            entity_type="index",
            entity_id=entity_id,
            alias_type="provider_symbol",
            confidence=INDEX_SYMBOL_CONFIDENCE,
            method="index_symbol",
            case_sensitive=True,
        ))
        _store_entry(store, _dictionary_entry(
            row.get("name"),
            entity_type="index",
            entity_id=entity_id,
            alias_type="name",
            confidence=INDEX_NAME_CONFIDENCE,
            method="index_name",
            case_sensitive=False,
        ))

    for row in _rows(warehouse.list_commodity_roots()):
        entity_id = str(row.get("root_id") or "").strip()
        if not entity_id:
            continue
        _store_entry(store, _dictionary_entry(
            row.get("root"),
            entity_type="commodity_root",
            entity_id=entity_id,
            alias_type="symbol",
            confidence=COMMODITY_SYMBOL_CONFIDENCE,
            method="commodity_name",
            case_sensitive=True,
        ))
        _store_entry(store, _dictionary_entry(
            row.get("provider_symbol"),
            entity_type="commodity_root",
            entity_id=entity_id,
            alias_type="provider_symbol",
            confidence=COMMODITY_SYMBOL_CONFIDENCE,
            method="commodity_name",
            case_sensitive=True,
        ))
        name = _normalise_alias(row.get("name"))
        _store_entry(store, _dictionary_entry(
            name,
            entity_type="commodity_root",
            entity_id=entity_id,
            alias_type="name",
            confidence=_commodity_name_confidence(name),
            method="commodity_name",
            case_sensitive=False,
        ))

    for row in _rows(warehouse.list_commodity_contracts()):
        entity_id = str(row.get("contract_id") or "").strip()
        if not entity_id:
            continue
        _store_entry(store, _dictionary_entry(
            row.get("provider_symbol"),
            entity_type="commodity_contract",
            entity_id=entity_id,
            alias_type="provider_symbol",
            confidence=COMMODITY_CONTRACT_SYMBOL_CONFIDENCE,
            method="symbol",
            case_sensitive=True,
        ))

    return sorted(
        store.values(),
        key=lambda entry: (
            entry["entity_type"],
            entry["entity_id"],
            entry["alias"].casefold(),
            entry["alias_type"],
        ),
    )


def _compile_matchers(dictionary: Sequence[dict[str, Any]]) -> list[_AliasMatcher]:
    """Compile dictionary entries into word-boundary regular expressions."""
    matchers: list[_AliasMatcher] = []
    for entry in dictionary:
        flags = 0 if entry.get("case_sensitive") else re.IGNORECASE
        pattern = re.compile(
            f"{_WORD_LEFT}{re.escape(entry['alias'])}{_WORD_RIGHT}",
            flags,
        )
        matchers.append(_AliasMatcher(
            alias=entry["alias"],
            pattern=pattern,
            entity_type=str(entry["entity_type"]),
            entity_id=str(entry["entity_id"]),
            confidence=float(entry["confidence"]),
            method=str(entry["method"]),
        ))
    return matchers


def _match_text(text: str, matchers: Sequence[_AliasMatcher]) -> list[dict[str, Any]]:
    """Match one article text, keeping the best link per entity and capping."""
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for matcher in matchers:
        if not matcher.pattern.search(text):
            continue
        key = (matcher.entity_type, matcher.entity_id)
        current = best.get(key)
        if current is not None and current["confidence"] >= matcher.confidence:
            continue
        best[key] = {
            "entity_type": matcher.entity_type,
            "entity_id": matcher.entity_id,
            "confidence": matcher.confidence,
            "method": matcher.method,
        }
    ordered = sorted(
        best.values(),
        key=lambda link: (-link["confidence"], link["entity_type"], link["entity_id"]),
    )
    return ordered[:MAX_LINKS_PER_ARTICLE]


# ---------------------------------------------------------------- link/collect


def link_articles(
    ctx: CollectContext,
    article_ids: Sequence[str] | Iterable[str],
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """Link the given stored articles to warehouse entities.

    ``replace=True`` re-computes each article's links and removes stale ones
    (used by the periodic ``news:link`` job); the default only adds links.

    Returns a counter dictionary with ``scanned`` (articles loaded),
    ``articles`` (ids requested), ``links`` (rows actually inserted),
    ``linked_articles`` (articles that gained at least one new link) and
    ``missing`` (ids no longer in the warehouse).  Idempotent: re-running over
    the same articles inserts nothing because ``news_entity`` has a composite
    primary key.
    """
    if isinstance(article_ids, str):
        raw_ids: Iterable[str] = [article_ids]
    else:
        raw_ids = article_ids
    ids: list[str] = []
    seen: set[str] = set()
    for value in raw_ids:
        article_id = str(value or "").strip()
        if not article_id or article_id in seen:
            continue
        seen.add(article_id)
        ids.append(article_id)
    if not ids:
        return {
            "scanned": 0,
            "articles": 0,
            "links": 0,
            "linked_articles": 0,
            "missing": 0,
        }

    matchers = _compile_matchers(build_entity_dictionary(ctx.warehouse))
    scanned = 0
    links = 0
    linked_articles = 0
    missing = 0
    for article_id in ids:
        article = ctx.warehouse.get_news(article_id)
        if not article:
            missing += 1
            continue
        scanned += 1
        text = f"{article.get('title') or ''}\n{article.get('summary') or ''}".strip()
        if not text:
            continue
        existing = {
            (str(link.get("entity_type") or ""), str(link.get("entity_id") or ""))
            for link in article.get("entities") or []
        }
        matched = _match_text(text, matchers)
        if replace:
            inserted = int(ctx.warehouse.replace_news_entities(article_id, matched) or 0)
            links += inserted
            if inserted:
                linked_articles += 1
            continue
        matches = [
            link for link in matched
            if (link["entity_type"], link["entity_id"]) not in existing
        ]
        remaining = MAX_LINKS_PER_ARTICLE - len(existing)
        if not matches or remaining <= 0:
            continue
        inserted = int(
            ctx.warehouse.link_news_entities(article_id, matches[:remaining]) or 0,
        )
        links += inserted
        if inserted:
            linked_articles += 1

    ctx.logger.debug(
        "news linker scanned=%s articles, inserted=%s links", scanned, links,
    )
    return {
        "scanned": scanned,
        "articles": len(ids),
        "links": links,
        "linked_articles": linked_articles,
        "missing": missing,
    }


def _link_limit(value: Any) -> int:
    """Coerce ``settings['link_limit']`` to a bounded positive integer."""
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_LINK_LIMIT
    return max(1, min(MAX_LINK_LIMIT, parsed))


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Run the ``news:link`` job over the newest stored articles.

    Scans ``settings.get('link_limit', 200)`` newest articles, re-computes their
    entity mentions and inserts the missing links.  ``updated`` is the number of
    ``news_entity`` rows inserted; ``details`` carries ``scanned`` and ``links``.
    """
    limit = _link_limit(ctx.settings.get("link_limit", DEFAULT_LINK_LIMIT))
    rows = ctx.warehouse.all_news_entities(limit=limit)
    article_ids = [
        str(row.get("article_id")) for row in rows if row.get("article_id")
    ]
    outcome = link_articles(ctx, article_ids, replace=True)

    now = ctx.now_iso()
    job_state = dict(ctx.job_state or {})
    job_state["last_run_at"] = now
    job_state["last_links"] = outcome["links"]
    ctx.logger.info(
        "news:link scanned=%s links=%s", outcome["scanned"], outcome["links"],
    )
    return {
        "stored": 0,
        "updated": outcome["links"],
        "duplicates": 0,
        "skipped": outcome["missing"],
        "status": "ok",
        "details": {
            "limit": limit,
            "scanned": outcome["scanned"],
            "links": outcome["links"],
            "articles": outcome["articles"],
            "missing": outcome["missing"],
        },
        "job_state": job_state,
    }


__all__ = [
    "DEFAULT_LINK_LIMIT",
    "GENERIC_ALIASES",
    "MAX_LINKS_PER_ARTICLE",
    "MIN_ALIAS_LENGTH",
    "build_entity_dictionary",
    "collect",
    "link_articles",
]
