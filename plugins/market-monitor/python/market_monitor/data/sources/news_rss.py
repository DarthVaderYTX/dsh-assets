"""RSS 2.0 and Atom 1.0 collection for the ``news:rss`` job.

The collector stores only what an approved feed publishes: publisher headline,
summary, link, timestamps and categories (the categories are kept in the
``news_article.topics`` JSON list column).  **Article bodies are never fetched in
this version**: the UI always attributes the publisher and links readers to the
original page, and the stored summary is capped at
:data:`SUMMARY_MAX_CHARS` characters.

Feed items are de-duplicated through
:func:`market_monitor.data.models.news_article_id` (canonical URL, falling back
to the feed guid) and :func:`market_monitor.data.models.content_hash`, so a story
carried by two feeds produces one stored row and one counted duplicate.

The registry of approved feeds lives in the bundled
``seed/news_sources.json`` file; its ids and feed URLs mirror
:data:`market_monitor.data.specs.NEWS_SOURCES`.  Every request goes through the
governed :class:`~market_monitor.data.http.PoliteHttpClient`; a rate-limited,
blocked, unreachable or unparseable feed is counted as ``skipped`` and never
aborts the run.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import (
    CollectContext,
    canonical_url,
    content_hash,
    news_article_id,
    parse_iso,
    to_iso,
)
from .news_content import CONTENT_MAX_CHARS, MIN_CONTENT_CHARS, fetch_article_content
from .news_linker import link_articles

LOGGER = logging.getLogger("market_monitor.data.sources.news_rss")

#: Newest items parsed per feed per run (feeds are published newest-first).
MAX_ITEMS_PER_FEED = 60
#: Maximum stored summary length; feeds often carry long CDATA descriptions.
SUMMARY_MAX_CHARS = 1200
#: Maximum full article content stored per article.
CONTENT_MAX_STORED_CHARS = CONTENT_MAX_CHARS
#: Default article-page fetches per feed pass (bounded by the news-content budget).
DEFAULT_CONTENT_FETCH_LIMIT = 12
#: Maximum stored author length.
AUTHOR_MAX_CHARS = 200
#: Maximum number of feed categories kept per article.
CATEGORY_LIMIT = 12
#: Maximum length of one stored feed category.
CATEGORY_MAX_CHARS = 120
#: Default bound for the optional re-link phase (``settings['relink']``).
DEFAULT_RELINK_LIMIT = 200
#: Bundled feed registry, also used when ``settings['news_sources_path']`` is unset.
DEFAULT_SEED_PATH = Path(__file__).resolve().parent.parent / "seed" / "news_sources.json"

_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_BLOCK_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.IGNORECASE | re.DOTALL)
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_WHITESPACE_RE = re.compile(r"\s+")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?%)\]])")
_SPACE_AFTER_OPEN_RE = re.compile(r"([(\[])\s+")

_RSS_ITEM_TITLE_NAMES = ("title",)
_RSS_ITEM_SUMMARY_NAMES = ("description", "summary")
_RSS_ITEM_CONTENT_NAMES = ("encoded", "content")
_RSS_ITEM_AUTHOR_NAMES = ("author", "creator", "contributor")
_RSS_ITEM_PUBLISHED_NAMES = ("pubdate", "date", "published")
_RSS_ITEM_UPDATED_NAMES = ("updated",)
_RSS_ITEM_CATEGORY_NAMES = ("category", "subject")

_SEED_CACHE: dict[str, list[dict[str, Any]]] = {}
_SEED_LOCK = threading.Lock()


# --------------------------------------------------------------------- helpers


def _local_name(tag: Any) -> str:
    """Return the lowercase local XML tag name without its namespace."""
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower()


def _element_text(element: ET.Element | None) -> str:
    """All descendant text of an element, stripped (``""`` for ``None``)."""
    if element is None:
        return ""
    return "".join(element.itertext()).strip()


def _child_element(element: ET.Element | None, name: str) -> ET.Element | None:
    """First direct child whose local tag name matches ``name``."""
    if element is None:
        return None
    wanted = name.lower()
    for child in element:
        if _local_name(child.tag) == wanted:
            return child
    return None


def _first_child_text(element: ET.Element | None, names: tuple[str, ...]) -> str:
    """Raw stripped text of the first direct child matching any of ``names``."""
    for name in names:
        child = _child_element(element, name)
        if child is not None:
            value = _element_text(child)
            if value:
                return value
    return ""


def _first_clean_child_text(
    element: ET.Element | None,
    names: tuple[str, ...],
    *,
    limit: int = 0,
) -> str:
    """First non-empty child text after HTML/markup stripping."""
    for name in names:
        if element is None:
            break
        for child in element:
            if _local_name(child.tag) != name:
                continue
            value = strip_html(_element_text(child), limit=limit)
            if value:
                return value
    return ""


def strip_html(value: str | None, *, limit: int = 0) -> str:
    """Strip HTML tags/comments and decode entities in a feed text value.

    ``limit`` caps the returned string length after whitespace collapsing
    (``0`` means no cap).  Feeds routinely double-encode markup, so comments,
    script/style blocks and remaining tags are removed before entities are
    decoded.
    """
    if not value:
        return ""
    text = str(value)
    text = _HTML_COMMENT_RE.sub(" ", text)
    text = _HTML_BLOCK_RE.sub(" ", text)
    text = _HTML_TAG_RE.sub(" ", text)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    text = _WHITESPACE_RE.sub(" ", text).strip()
    text = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", text)
    text = _SPACE_AFTER_OPEN_RE.sub(r"\1", text)
    if limit > 0 and len(text) > int(limit):
        text = text[: int(limit)].rstrip()
    return text


def parse_feed_datetime(value: str | None) -> str | None:
    """Parse an RFC-822 or ISO-8601 feed timestamp into ISO-8601 UTC.

    ``None`` is returned when the value is absent or unusable; callers then fall
    back to the fetch time so an article always has a sortable timestamp.
    """
    text = str(value or "").strip()
    if not text:
        return None
    iso_value = parse_iso(text)
    if iso_value is not None:
        return to_iso(iso_value.timestamp())
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError, OverflowError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return to_iso(parsed.timestamp())


# ------------------------------------------------------------- registry loader


def load_news_sources(path: str | Path | None = None) -> list[dict[str, Any]]:
    """Load the approved feed registry (cached per resolved path).

    ``path`` defaults to the bundled :data:`DEFAULT_SEED_PATH`; tests may pass an
    alternate JSON file.  The file is either ``{"sources": [...]}`` or a bare
    list of entries.  Rows are normalised to the ``news_source`` table columns
    and copies are returned so callers cannot corrupt the cache.
    """
    resolved = (
        Path(path).expanduser().resolve()
        if path is not None
        else DEFAULT_SEED_PATH
    )
    cache_key = str(resolved)
    with _SEED_LOCK:
        cached = _SEED_CACHE.get(cache_key)
    if cached is not None:
        return [dict(entry) for entry in cached]

    try:
        raw = resolved.read_text(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"cannot read news source registry {resolved}: {error}") from error
    try:
        payload = json.loads(raw)
    except ValueError as error:
        raise ValueError(f"invalid news source registry {resolved}: {error}") from error

    entries = payload.get("sources") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise ValueError(f"news source registry {resolved} must contain a 'sources' list")

    normalised: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ValueError(f"news source registry entry #{index} is not an object")
        source_id = str(entry.get("source_id") or "").strip()
        feed_url = str(entry.get("feed_url") or "").strip()
        if not source_id:
            raise ValueError(f"news source registry entry #{index} has no source_id")
        if source_id in seen:
            raise ValueError(f"duplicate news source id in registry: {source_id}")
        seen.add(source_id)
        if not feed_url.lower().startswith(("http://", "https://")):
            raise ValueError(f"news source {source_id} has an invalid feed_url: {feed_url!r}")
        normalised.append({
            "source_id": source_id,
            "name": str(entry.get("name") or source_id),
            "kind": str(entry.get("kind") or "news-rss"),
            "language": str(entry.get("language") or "en"),
            "country": str(entry.get("country") or ""),
            "homepage": str(entry.get("homepage") or ""),
            "feed_url": feed_url,
            "license_note": str(entry.get("license_note") or ""),
            "enabled": 1 if bool(entry.get("enabled", True)) else 0,
        })

    with _SEED_LOCK:
        _SEED_CACHE[cache_key] = normalised
    return [dict(entry) for entry in normalised]


def clear_news_sources_cache() -> None:
    """Drop cached registry payloads (tests use this after editing a fixture)."""
    with _SEED_LOCK:
        _SEED_CACHE.clear()


# ------------------------------------------------------------------- parsing


def _resolve_url(value: str, base_url: str) -> str:
    """Return an absolute HTTP(S) article URL, or ``""`` when unusable."""
    text = str(value or "").strip()
    if not text:
        return ""
    parts = urlsplit(text)
    if parts.scheme.lower() not in ("http", "https") and base_url:
        text = urljoin(base_url, text)
        parts = urlsplit(text)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return ""
    return text


def _rss_entry_url(element: ET.Element, base_url: str) -> tuple[str, str]:
    """RSS item link (falling back to a URL-shaped guid) plus the raw guid."""
    guid_element = _child_element(element, "guid")
    guid = _element_text(guid_element)
    link_element = _child_element(element, "link")
    link = _element_text(link_element)
    if not link and link_element is not None:
        link = str(link_element.get("href") or "").strip()
    if not link and guid.lower().startswith(("http://", "https://")):
        link = guid
    return _resolve_url(link, base_url), guid


def _atom_entry_url(element: ET.Element, base_url: str) -> tuple[str, str]:
    """Atom entry ``link rel=alternate`` (or first link) plus the entry id."""
    identifier = _element_text(_child_element(element, "id"))
    alternate = ""
    fallback = ""
    text_link = ""
    for child in element:
        if _local_name(child.tag) != "link":
            continue
        href = str(child.get("href") or "").strip()
        if href:
            relation = str(child.get("rel") or "alternate").strip().lower()
            if relation in ("alternate", ""):
                alternate = alternate or href
            else:
                fallback = fallback or href
        elif not text_link:
            text_link = _element_text(child)
    link = alternate or fallback or text_link
    if not link and identifier.lower().startswith(("http://", "https://")):
        link = identifier
    return _resolve_url(link, base_url), identifier


def _normalise_categories(values: list[str]) -> list[str]:
    """Clean, de-duplicate and cap feed categories (stored as ``topics``)."""
    categories: list[str] = []
    seen: set[str] = set()
    for value in values:
        category = strip_html(value, limit=CATEGORY_MAX_CHARS)
        if not category:
            continue
        key = category.casefold()
        if key in seen:
            continue
        seen.add(key)
        categories.append(category)
        if len(categories) >= CATEGORY_LIMIT:
            break
    return categories


def _rss_categories(element: ET.Element) -> list[str]:
    """Collect RSS ``category``/``subject`` values."""
    values: list[str] = []
    for child in element:
        if _local_name(child.tag) not in _RSS_ITEM_CATEGORY_NAMES:
            continue
        value = _element_text(child) or str(child.get("term") or "")
        if value:
            values.append(value)
    return _normalise_categories(values)


def _atom_categories(element: ET.Element) -> list[str]:
    """Collect Atom ``category`` terms (falling back to label/text)."""
    values: list[str] = []
    for child in element:
        if _local_name(child.tag) != "category":
            continue
        value = (
            str(child.get("term") or "")
            or str(child.get("label") or "")
            or _element_text(child)
        )
        if value:
            values.append(value)
    return _normalise_categories(values)


def _atom_author(element: ET.Element) -> str:
    """Read the Atom ``author/name`` (or the author text itself)."""
    for child in element:
        if _local_name(child.tag) != "author":
            continue
        name_element = _child_element(child, "name")
        if name_element is not None:
            value = strip_html(_element_text(name_element), limit=AUTHOR_MAX_CHARS)
            if value:
                return value
        value = strip_html(_element_text(child), limit=AUTHOR_MAX_CHARS)
        if value:
            return value
    return ""


def _build_article_row(
    *,
    source_id: str,
    language: str,
    fetched_at: str,
    url: str,
    guid: str,
    title: str,
    summary: str,
    content: str,
    author: str,
    categories: list[str],
    published_raw: str,
    updated_raw: str,
) -> dict[str, Any] | None:
    """Turn parsed feed fields into one ``news_article`` insert row."""
    clean_title = strip_html(title)
    if not clean_title or not url:
        return None
    clean_summary = strip_html(summary, limit=SUMMARY_MAX_CHARS)
    clean_content = strip_html(content, limit=CONTENT_MAX_STORED_CHARS)
    if len(clean_content) <= len(clean_summary):
        clean_content = clean_summary
    clean_author = strip_html(author, limit=AUTHOR_MAX_CHARS)
    published_at = parse_feed_datetime(published_raw) or fetched_at
    updated_at = parse_feed_datetime(updated_raw) or published_at
    return {
        "article_id": news_article_id(url, guid),
        "source_id": source_id,
        "url": url,
        "canonical_url": canonical_url(url),
        "title": clean_title,
        "summary": clean_summary,
        "body": clean_content,
        "language": language or "en",
        "author": clean_author,
        "published_at": published_at,
        "updated_at": updated_at,
        "fetched_at": fetched_at,
        "topics": list(categories),
        "content_hash": content_hash(clean_title, clean_summary),
    }


def _parse_rss_entry(
    element: ET.Element,
    *,
    source_id: str,
    language: str,
    fetched_at: str,
    base_url: str,
) -> dict[str, Any] | None:
    """Parse one RSS 2.0 ``<item>`` into an article row."""
    url, guid = _rss_entry_url(element, base_url)
    if not url:
        return None
    summary = _first_clean_child_text(
        element, _RSS_ITEM_SUMMARY_NAMES, limit=SUMMARY_MAX_CHARS,
    )
    content = _first_child_text(element, _RSS_ITEM_CONTENT_NAMES)
    if not summary and content:
        summary = strip_html(content, limit=SUMMARY_MAX_CHARS)
    return _build_article_row(
        source_id=source_id,
        language=language,
        fetched_at=fetched_at,
        url=url,
        guid=guid,
        title=_first_clean_child_text(element, _RSS_ITEM_TITLE_NAMES),
        summary=summary,
        content=content,
        author=_first_clean_child_text(
            element, _RSS_ITEM_AUTHOR_NAMES, limit=AUTHOR_MAX_CHARS,
        ),
        categories=_rss_categories(element),
        published_raw=_first_child_text(element, _RSS_ITEM_PUBLISHED_NAMES),
        updated_raw=_first_child_text(element, _RSS_ITEM_UPDATED_NAMES),
    )


def _parse_atom_entry(
    element: ET.Element,
    *,
    source_id: str,
    language: str,
    fetched_at: str,
    base_url: str,
) -> dict[str, Any] | None:
    """Parse one Atom 1.0 ``<entry>`` into an article row."""
    url, identifier = _atom_entry_url(element, base_url)
    if not url:
        return None
    published_raw = _first_child_text(element, ("published", "issued", "pubdate"))
    updated_raw = _first_child_text(element, ("updated", "modified"))
    summary = _first_clean_child_text(
        element, ("summary",), limit=SUMMARY_MAX_CHARS,
    )
    content = _first_child_text(element, ("content",))
    if not summary and content:
        summary = strip_html(content, limit=SUMMARY_MAX_CHARS)
    return _build_article_row(
        source_id=source_id,
        language=language,
        fetched_at=fetched_at,
        url=url,
        guid=identifier,
        title=_first_clean_child_text(element, ("title",)),
        summary=summary,
        content=content,
        author=_atom_author(element),
        categories=_atom_categories(element),
        published_raw=published_raw or updated_raw,
        updated_raw=updated_raw,
    )


def parse_feed(
    text: str,
    *,
    source_id: str,
    language: str = "en",
    fetched_at: str = "",
    base_url: str = "",
    max_items: int = MAX_ITEMS_PER_FEED,
) -> list[dict[str, Any]]:
    """Parse RSS 2.0 or Atom 1.0 XML into ``news_article`` insert rows.

    Feeds publish newest-first, so parsing stops after ``max_items`` document
    entries.  Items without a usable title or HTTP(S) link are dropped.  The
    parsed rows carry ``article_id``, ``canonical_url`` and ``content_hash`` and
    are ready for :meth:`market_monitor.data.warehouse.DataWarehouse.insert_news_articles`.
    Raises :class:`ValueError` for unusable XML or an unsupported feed document.
    """
    raw = str(text or "").lstrip("\ufeff")
    if not raw.strip():
        raise ValueError("empty feed payload")
    try:
        root = ET.fromstring(raw)
    except (ET.ParseError, ValueError) as error:
        raise ValueError(f"invalid feed XML: {error}") from error

    root_name = _local_name(root.tag)
    if root_name == "rss":
        channel = _child_element(root, "channel")
        entries = [] if channel is None else [
            child for child in channel if _local_name(child.tag) == "item"
        ]
    elif root_name == "feed":
        entries = [child for child in root if _local_name(child.tag) == "entry"]
    else:
        raise ValueError(f"unsupported feed root <{root_name or root.tag}>")

    limit = max(0, int(max_items))
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for element in entries[:limit]:
        if root_name == "feed":
            row = _parse_atom_entry(
                element,
                source_id=source_id,
                language=language,
                fetched_at=fetched_at,
                base_url=base_url,
            )
        else:
            row = _parse_rss_entry(
                element,
                source_id=source_id,
                language=language,
                fetched_at=fetched_at,
                base_url=base_url,
            )
        if row is None or row["article_id"] in seen:
            continue
        seen.add(row["article_id"])
        rows.append(row)
    return rows


# ------------------------------------------------------------------ collector


def _positive_int(value: Any, default: int) -> int:
    """Coerce a settings value to a positive integer, else use ``default``."""
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _enrich_article_content(
    ctx: CollectContext,
    rows_by_id: dict[str, dict[str, Any]],
    inserted_ids: list[str],
    limit: int,
) -> dict[str, Any]:
    """Fetch publisher pages for newly stored articles and persist full content.

    Feed-provided content is already stored by the parser.  This pass only
    fills short/empty bodies, is capped by ``limit`` and the shared
    ``news-content`` governor budget, and records per-article failures instead of
    failing the feed run.
    """
    result = {"fetched": 0, "skipped": 0, "failed": 0, "rate_limited": False}
    if not inserted_ids or limit <= 0:
        return result
    seen: set[str] = set()
    for article_id in inserted_ids:
        if result["fetched"] >= limit:
            break
        if article_id in seen:
            continue
        seen.add(article_id)
        row = rows_by_id.get(article_id)
        if row is None:
            result["skipped"] += 1
            continue
        current = str(row.get("body") or "")
        if len(current) >= max(MIN_CONTENT_CHARS * 2, 1200):
            result["skipped"] += 1
            continue
        content, error = fetch_article_content(ctx, str(row.get("url") or ""))
        if error == "rate_limited":
            result["rate_limited"] = True
            break
        if not content or len(content) <= len(current):
            result["failed"] += 1
            continue
        if ctx.warehouse.update_news_content(article_id, content):
            result["fetched"] += 1
        else:
            result["failed"] += 1
    return result


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Run the ``news:rss`` job: register feeds, poll them, store and link news.

    Returns integer counters ``stored``, ``updated``, ``duplicates`` and
    ``skipped`` plus ``status`` (``"ok"``/``"partial"``), an optional ``error``
    summary and a ``details`` dictionary.  ``updated`` stays ``0`` because
    articles are append-only and duplicates are ignored rather than rewritten.
    Per-feed failures are recorded in ``details['failures']``; a failed feed
    never aborts the run.  Setting ``settings['relink']`` truthy additionally
    re-links the newest ``settings.get('relink_limit', 200)`` stored articles.
    """
    now = ctx.now_iso()
    registry = load_news_sources(ctx.settings.get("news_sources_path"))
    sources_registered = ctx.warehouse.upsert_news_sources(
        [dict(entry) for entry in registry],
    )

    stored = 0
    duplicates = 0
    skipped = 0
    links = 0
    relinked = 0
    parsed_articles = 0
    feeds_attempted = 0
    not_modified = 0
    dry_run_feeds = 0
    disabled_sources: list[str] = []
    failures: list[dict[str, Any]] = []
    newly_stored_ids: list[str] = []
    rows_by_id: dict[str, dict[str, Any]] = {}

    for entry in registry:
        source_id = str(entry["source_id"])
        if not int(entry.get("enabled", 1)):
            skipped += 1
            disabled_sources.append(source_id)
            continue
        source_state = ctx.warehouse.get_source(source_id)
        if not source_state or not bool(source_state.get("enabled", 1)):
            skipped += 1
            disabled_sources.append(source_id)
            ctx.logger.info(
                "news source %s is not registered or disabled; skipping", source_id,
            )
            continue

        feeds_attempted += 1
        try:
            result = ctx.http.fetch(source_id, str(entry["feed_url"]))
        except (SourceRateLimitedError, SourceBlockedError) as error:
            skipped += 1
            reason = "rate_limited" if isinstance(error, SourceRateLimitedError) else "blocked"
            failures.append({
                "source_id": source_id,
                "reason": reason,
                "error": str(error)[:300],
            })
            ctx.logger.warning("news source %s was limited/blocked: %s", source_id, error)
            continue
        except DataSourceError as error:
            skipped += 1
            failures.append({
                "source_id": source_id,
                "reason": "source_error",
                "error": str(error)[:300],
            })
            ctx.logger.warning("news source %s failed: %s", source_id, error)
            continue

        if result.not_modified:
            not_modified += 1
            ctx.logger.info("news source %s not modified; nothing to store", source_id)
            continue
        if result.dry_run:
            skipped += 1
            dry_run_feeds += 1
            continue

        try:
            rows = parse_feed(
                result.text(),
                source_id=source_id,
                language=str(entry.get("language") or "en"),
                fetched_at=result.fetched_at or now,
                base_url=str(entry.get("feed_url") or ""),
            )
        except ValueError as error:
            skipped += 1
            failures.append({
                "source_id": source_id,
                "reason": "parse_error",
                "error": str(error)[:300],
            })
            ctx.logger.warning("news source %s returned unusable XML: %s", source_id, error)
            continue

        parsed_articles += len(rows)
        if not rows:
            continue
        for row in rows:
            rows_by_id[str(row["article_id"])] = row
        outcome = ctx.warehouse.insert_news_articles(rows)
        stored += int(outcome.get("stored", 0) or 0)
        duplicates += int(outcome.get("duplicates", 0) or 0)
        newly_stored_ids.extend(
            str(article_id) for article_id in outcome.get("article_ids") or []
        )

    # Link in one pass after all feeds so the entity dictionary is built once.
    if newly_stored_ids:
        try:
            link_result = link_articles(ctx, newly_stored_ids)
        except Exception as error:  # noqa: BLE001 - linking must not abort ingestion
            ctx.logger.warning(
                "entity linking failed for %s new article(s): %s",
                len(newly_stored_ids), error,
            )
        else:
            links += int(link_result.get("links", 0) or 0)

    content_result = {"fetched": 0, "skipped": 0, "failed": 0, "rate_limited": False}
    content_limit = 0
    if bool(ctx.settings.get("news_content_fetch", False)):
        content_limit = _positive_int(
            ctx.settings.get("news_content_max_per_run"),
            DEFAULT_CONTENT_FETCH_LIMIT,
        )
        content_result = _enrich_article_content(
            ctx,
            rows_by_id,
            newly_stored_ids,
            content_limit,
        )
        if not content_result["rate_limited"]:
            remaining = content_limit - content_result["fetched"]
            if remaining > 0:
                backfill_rows = ctx.warehouse.list_news_needing_content(remaining)
                backfill_ids = [
                    str(row["article_id"]) for row in backfill_rows
                    if str(row["article_id"]) not in rows_by_id
                ]
                if backfill_rows:
                    rows_by_id.update({
                        str(row["article_id"]): row for row in backfill_rows
                    })
                    backfill = _enrich_article_content(
                        ctx, rows_by_id, backfill_ids, remaining,
                    )
                    content_result["fetched"] += backfill["fetched"]
                    content_result["failed"] += backfill["failed"]
                    content_result["rate_limited"] = backfill["rate_limited"]

    if bool(ctx.settings.get("relink")):
        relink_limit = _positive_int(ctx.settings.get("relink_limit"), DEFAULT_RELINK_LIMIT)
        recent_rows = ctx.warehouse.all_news_entities(limit=relink_limit)
        recent_ids = [
            str(row.get("article_id")) for row in recent_rows if row.get("article_id")
        ]
        if recent_ids:
            try:
                relink_result = link_articles(ctx, recent_ids)
            except Exception as error:  # noqa: BLE001 - optional phase, never fatal
                ctx.logger.warning("re-linking %s article(s) failed: %s", len(recent_ids), error)
            else:
                relinked = int(relink_result.get("links", 0) or 0)

    status = "partial" if failures else "ok"
    error_summary = ""
    if failures:
        error_summary = "; ".join(
            f"{failure['source_id']}: {failure['reason']}" for failure in failures[:8]
        )[:500]

    job_state = dict(ctx.job_state or {})
    job_state["last_run_at"] = now
    job_state["last_stored"] = stored
    job_state["last_failed_sources"] = [failure["source_id"] for failure in failures]

    ctx.logger.info(
        "news:rss stored=%s duplicates=%s skipped=%s links=%s",
        stored, duplicates, skipped, links,
    )
    return {
        "stored": stored,
        "updated": 0,
        "duplicates": duplicates,
        "skipped": skipped,
        "status": status,
        "error": error_summary,
        "details": {
            "sources": len(registry),
            "sources_registered": sources_registered,
            "feeds_attempted": feeds_attempted,
            "articles_parsed": parsed_articles,
            "not_modified": not_modified,
            "dry_run_feeds": dry_run_feeds,
            "links": links,
            "relinked_links": relinked,
            "content_fetched": content_result["fetched"],
            "content_skipped": content_result["skipped"],
            "content_failed": content_result["failed"],
            "content_rate_limited": content_result["rate_limited"],
            "content_limit": content_limit,
            "disabled_sources": disabled_sources,
            "failures": failures,
        },
        "job_state": job_state,
    }


def collect_content(ctx: CollectContext) -> dict[str, Any]:
    """Run the ``news:content`` job: enrich recent summary-only articles.

    Newest articles are processed first, capped by
    ``news_content_max_per_run`` and the shared ``news-content`` governor budget.
    A rate-limit/block answer leaves the remaining articles for the next run.
    """
    limit = _positive_int(
        ctx.settings.get("news_content_max_per_run"),
        DEFAULT_CONTENT_FETCH_LIMIT,
    )
    rows = ctx.warehouse.list_news_needing_content(limit)
    rows_by_id = {str(row["article_id"]): row for row in rows}
    result = _enrich_article_content(
        ctx,
        rows_by_id,
        [str(row["article_id"]) for row in rows],
        limit,
    )
    status = "partial" if result["failed"] or result["rate_limited"] else "ok"
    return {
        "stored": result["fetched"],
        "updated": result["fetched"],
        "duplicates": 0,
        "skipped": result["skipped"] + result["failed"],
        "status": status,
        "details": {
            "selected": len(rows),
            "content_fetched": result["fetched"],
            "content_skipped": result["skipped"],
            "content_failed": result["failed"],
            "content_rate_limited": result["rate_limited"],
            "content_limit": limit,
        },
    }


__all__ = [
    "AUTHOR_MAX_CHARS",
    "CATEGORY_LIMIT",
    "CATEGORY_MAX_CHARS",
    "CONTENT_MAX_STORED_CHARS",
    "DEFAULT_CONTENT_FETCH_LIMIT",
    "DEFAULT_RELINK_LIMIT",
    "DEFAULT_SEED_PATH",
    "MAX_ITEMS_PER_FEED",
    "SUMMARY_MAX_CHARS",
    "clear_news_sources_cache",
    "collect",
    "collect_content",
    "load_news_sources",
    "parse_feed",
    "parse_feed_datetime",
    "strip_html",
]
