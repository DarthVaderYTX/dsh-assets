"""Extract readable article text from a publisher HTML page.

The news collector stores the publisher URL, publication time, title and a
compact content field.  RSS feeds sometimes ship a full ``content:encoded``
body, but most business feeds only carry a one-line description; for the
approved sources the collector may fetch the linked article page (through the
same governed HTTP client) and use this module to recover the article text.

The extractor is dependency-free (stdlib :class:`html.parser.HTMLParser`),
skips navigation/script/style content, prefers JSON-LD ``articleBody`` when the
page exposes it, and otherwise joins the substantive paragraph/heading nodes.
It is intentionally conservative: paywalled pages, cookie walls and pages with
only a short description simply yield a short (or empty) result, and the
collector keeps the feed summary as the content fallback.
"""

from __future__ import annotations

import json
import re
from html import unescape
from html.parser import HTMLParser
from typing import Any

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import NEWS_CONTENT

#: Hard cap for stored article content (characters).
CONTENT_MAX_CHARS = 20_000
#: A page must produce at least this much text to replace the feed summary.
MIN_CONTENT_CHARS = 200

_SKIP_TAGS = frozenset({
    "script", "style", "noscript", "svg", "canvas", "iframe", "form",
    "nav", "footer", "header", "aside", "template",
})
_CAPTURE_TAGS = frozenset({"p", "h1", "h2", "h3", "h4", "li", "blockquote"})
_WHITESPACE_RE = re.compile(r"\s+")
_ARTICLE_BODY_RE = re.compile(
    r'"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"', re.IGNORECASE | re.DOTALL,
)
_META_DESCRIPTION_RE = re.compile(
    r'<meta[^>]+(?:name|property)\s*=\s*["\'](?:description|og:description)["\']'
    r'[^>]*content\s*=\s*["\']([^"\']*)["\']',
    re.IGNORECASE | re.DOTALL,
)


def _clean(value: str) -> str:
    """Collapse whitespace and decode entities in one text node."""
    text = unescape(str(value or "")).replace("\xa0", " ")
    return _WHITESPACE_RE.sub(" ", text).strip()


class _ParagraphParser(HTMLParser):
    """Collect substantive paragraph/heading text while skipping chrome."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._capture_depth = 0
        self._current: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower()
        if name in _SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if name in _CAPTURE_TAGS:
            if self._capture_depth == 0:
                self._current = []
            self._capture_depth += 1
        elif name == "br" and self._capture_depth:
            self._current.append(" ")

    def handle_endtag(self, tag: str) -> None:
        name = tag.lower()
        if name in _SKIP_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth or name not in _CAPTURE_TAGS:
            return
        if self._capture_depth:
            self._capture_depth -= 1
        if self._capture_depth == 0:
            text = _clean("".join(self._current))
            if len(text) >= 20:
                self.blocks.append(text)
            self._current = []

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and self._capture_depth:
            self._current.append(data)


def _join_blocks(blocks: list[str]) -> str:
    """Join paragraphs with blank lines, dropping consecutive duplicates."""
    result: list[str] = []
    previous = ""
    for block in blocks:
        text = _clean(block)
        if not text or text == previous:
            continue
        result.append(text)
        previous = text
    return "\n\n".join(result)


def _json_ld_body(html: str) -> str:
    """Return a JSON-LD ``articleBody`` value when the page publishes one."""
    for match in _ARTICLE_BODY_RE.finditer(html):
        try:
            value = json.loads(f'"{match.group(1)}"')
        except (TypeError, ValueError):
            continue
        if isinstance(value, str):
            text = _clean(value)
            if len(text) >= MIN_CONTENT_CHARS:
                return text
    return ""


def _meta_description(html: str) -> str:
    """Return the page description meta tag as a last-resort excerpt."""
    match = _META_DESCRIPTION_RE.search(html)
    return _clean(match.group(1)) if match else ""


def extract_article_content(html: str, *, url: str = "") -> str:
    """Extract readable article text from one HTML page.

    ``url`` is accepted for diagnostics only; the extractor does not fetch
    anything.  The returned string has paragraph breaks preserved and is capped
    at :data:`CONTENT_MAX_CHARS`; ``""`` means the page had no usable text.
    """
    if not isinstance(html, str) or not html.strip():
        return ""
    body = _json_ld_body(html)
    if len(body) >= MIN_CONTENT_CHARS:
        return body[:CONTENT_MAX_CHARS].rstrip()
    parser = _ParagraphParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # noqa: BLE001 - malformed HTML must not abort collection
        pass
    text = _join_blocks(parser.blocks)
    if len(text) < MIN_CONTENT_CHARS:
        description = _meta_description(html)
        if description and len(description) > len(text):
            text = description
    return text[:CONTENT_MAX_CHARS].rstrip()


def fetch_article_content(
    ctx: CollectContext,
    url: str,
) -> tuple[str, str]:
    """Fetch one publisher article page and extract its readable content.

    Returns ``(content, error)``: ``content`` is ``""`` when the page cannot be
    fetched or has no usable text; ``error`` is a short machine-readable reason
    for diagnostics.  The call is governed by the shared ``news-content``
    source budget and never raises for ordinary per-article failures.
    """
    target = str(url or "").strip()
    if not target.lower().startswith(("http://", "https://")):
        return "", "invalid_url"
    try:
        result = ctx.http.fetch(NEWS_CONTENT, target)
    except SourceRateLimitedError:
        return "", "rate_limited"
    except SourceBlockedError:
        return "", "blocked"
    except DataSourceError:
        return "", "fetch_failed"
    except Exception:  # noqa: BLE001 - one article must not abort the feed pass
        return "", "fetch_failed"
    if result.not_modified or result.dry_run:
        return "", "no_body"
    try:
        text = result.text()
    except Exception:  # noqa: BLE001
        return "", "decode_failed"
    content = extract_article_content(text, url=target)
    return (content, "" if content else "empty_content")


__all__ = [
    "CONTENT_MAX_CHARS",
    "MIN_CONTENT_CHARS",
    "extract_article_content",
    "fetch_article_content",
]
