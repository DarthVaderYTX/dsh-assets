"""Tests for the news domain: RSS/Atom parsing, collection and entity linking.

The suite is offline and deterministic: feed payloads are inline XML strings, the
HTTP client is a local fake, and the clock is a fixed epoch.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult, SourceSpec
from market_monitor.data.errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from market_monitor.data.models import (
    CollectContext,
    DOMAIN_NEWS,
    canonical_url,
    instrument_id,
    news_article_id,
    to_iso,
)
from market_monitor.data.sources import news_linker, news_rss
from market_monitor.data.specs import NEWS_CONTENT, NEWS_SOURCES, NEWS_SOURCE_IDS

#: Fixed injection clock used everywhere (2027-01-15T08:00:00Z).
FIXED_EPOCH = 1_800_000_000.0
FIXED_ISO = to_iso(FIXED_EPOCH)

#: Keep collector warnings out of the unittest output (collectors use ctx.logger).
TEST_LOGGER = logging.getLogger("tests.market_monitor.news")
TEST_LOGGER.addHandler(logging.NullHandler())
logging.getLogger("market_monitor.data.sources").addHandler(logging.NullHandler())


RSS_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Markets</title>
    <item>
      <title>Apple &amp; suppliers &lt;b&gt;beat&lt;/b&gt; estimates</title>
      <link>https://example.test/news/apple-beats?utm_source=rss&amp;utm_medium=feed</link>
      <guid isPermaLink="false">urn:example:1</guid>
      <pubDate>Mon, 24 Nov 2026 13:05:00 GMT</pubDate>
      <description><![CDATA[<p>Quarterly <b>revenue</b> rose &amp; margins expanded.</p><script>alert('x')</script>]]></description>
      <author>newsroom@example.test (Newsroom)</author>
      <category>markets</category>
      <category>earnings</category>
    </item>
    <item>
      <title>Fed holds rates steady</title>
      <link>https://example.test/news/fed-holds</link>
      <guid>urn:example:2</guid>
      <dc:creator>Jane Doe</dc:creator>
      <description>   </description>
      <content:encoded><![CDATA[<p>Policy <i>unchanged</i>; guidance cautious.</p>]]></content:encoded>
      <category domain="topic">economy</category>
    </item>
  </channel>
</rss>
"""

ATOM_FEED = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title type="html">Oil prices climb as &lt;b&gt;OPEC&lt;/b&gt; meets</title>
    <link rel="self" href="https://example.test/atom/oil-feed"/>
    <link rel="alternate" type="text/html" href="https://example.test/atom/oil?utm_campaign=x"/>
    <id>tag:example.test,2026:oil</id>
    <updated>2026-11-24T09:35:00Z</updated>
    <published>2026-11-24T09:25:00Z</published>
    <summary type="html">&lt;p&gt;Brent crude &amp;amp; WTI rose.&lt;/p&gt;</summary>
    <content type="html">&lt;p&gt;Long content that should not win.&lt;/p&gt;</content>
    <author><name>Jane Doe</name></author>
    <category term="commodities"/>
    <category term="energy"/>
  </entry>
  <entry>
    <title>Markets quiet ahead of data</title>
    <link href="https://example.test/atom/quiet"/>
    <id>tag:example.test,2026:quiet</id>
    <updated>2026-11-24T08:00:00Z</updated>
    <summary>No major moves.</summary>
  </entry>
</feed>
"""


def _single_item_feed(
    *,
    title: str,
    link: str,
    summary: str = "",
    published: str = "Mon, 24 Nov 2026 13:05:00 GMT",
    categories: tuple[str, ...] = ("markets",),
) -> str:
    """Build a tiny RSS 2.0 document with one item."""
    category_xml = "".join(f"<category>{category}</category>" for category in categories)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel><title>Fixture</title><item>'
        f"<title>{title}</title>"
        f"<link>{link}</link>"
        f"<pubDate>{published}</pubDate>"
        f"<description><![CDATA[{summary}]]></description>"
        f"{category_xml}"
        "</item></channel></rss>"
    )


def _rss_items(items: int) -> str:
    """Build an RSS document with ``items`` newest-first entries."""
    body = "".join(
        f"<item><title>Item {index}</title>"
        f"<link>https://example.test/items/{index}</link>"
        f"<pubDate>Mon, 24 Nov 2026 13:{59 - (index % 60):02d}:00 GMT</pubDate></item>"
        for index in range(items)
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel>{body}</channel></rss>'


class FakeHttpClient:
    """Local stand-in for the governed HTTP client (two-argument contract)."""

    def __init__(self, responses: dict[str, FetchResult | Exception]) -> None:
        self.responses = dict(responses)
        self.calls: list[tuple[str, str]] = []
        self.request_count = 0
        self.dry_run = False

    def fetch(self, source_id: str, url: str) -> FetchResult:
        """Return the configured payload or raise the configured error."""
        self.calls.append((source_id, url))
        self.request_count += 1
        response = self.responses[source_id]
        if isinstance(response, Exception):
            raise response
        return response


def _fed_result(source_id: str, body: str, *, status: int = 200) -> FetchResult:
    """Build a successful :class:`FetchResult` for a feed source."""
    return FetchResult(
        url=f"https://example.test/{source_id}.xml",
        status=status,
        content_type="application/rss+xml",
        body=body.encode("utf-8"),
        fetched_at=FIXED_ISO,
    )


def _not_modified(source_id: str) -> FetchResult:
    """Build a ``304`` conditional-result double."""
    return FetchResult(
        url=f"https://example.test/{source_id}.xml",
        status=304,
        not_modified=True,
        fetched_at=FIXED_ISO,
    )


def _html_result(url: str, html: str) -> FetchResult:
    """Build a successful article-page response double."""
    return FetchResult(
        url=url,
        status=200,
        content_type="text/html; charset=utf-8",
        body=html.encode("utf-8"),
        fetched_at=FIXED_ISO,
    )


def _seed_instrument(warehouse: DataWarehouse, symbol: str, name: str) -> str:
    """Seed one instrument and its symbol alias; return the canonical id."""
    entity_id = instrument_id("XNAS", symbol)
    warehouse.upsert_instruments([{
        "instrument_id": entity_id,
        "symbol": symbol,
        "mic": "XNAS",
        "name": name,
        "type": "stock",
        "currency": "USD",
        "provider_symbol": symbol,
        "source_id": "seed",
    }])
    warehouse.upsert_aliases([{
        "alias": symbol,
        "entity_type": "instrument",
        "entity_id": entity_id,
        "alias_type": "symbol",
    }])
    return entity_id


def _insert_article(
    warehouse: DataWarehouse,
    slug: str,
    title: str,
    summary: str = "",
    *,
    published_at: str = "2026-11-24T12:00:00Z",
    source_id: str = "cnbc-rss",
) -> str:
    """Insert one article row directly and return its id."""
    url = f"https://example.test/news/{slug}"
    article_id = news_article_id(url)
    warehouse.insert_news_articles([{
        "article_id": article_id,
        "source_id": source_id,
        "url": url,
        "canonical_url": canonical_url(url),
        "title": title,
        "summary": summary,
        "language": "en",
        "published_at": published_at,
        "topics": [],
    }])
    return article_id


def _links_by_entity(warehouse: DataWarehouse, article_id: str) -> dict[str, dict]:
    """Read one article's entity links keyed by entity id."""
    article = warehouse.get_news(article_id)
    assert article is not None
    return {link["entity_id"]: link for link in article["entities"]}


class FeedParsingTests(unittest.TestCase):
    """RSS 2.0 / Atom 1.0 field extraction."""

    def test_rss_feed_fields(self) -> None:
        rows = news_rss.parse_feed(RSS_FEED, source_id="cnbc-rss", fetched_at=FIXED_ISO)
        self.assertEqual(len(rows), 2)
        first = rows[0]
        self.assertEqual(first["title"], "Apple & suppliers beat estimates")
        self.assertEqual(first["summary"], "Quarterly revenue rose & margins expanded.")
        self.assertNotIn("<script", first["summary"])
        self.assertNotIn("alert", first["summary"])
        self.assertEqual(
            first["url"],
            "https://example.test/news/apple-beats?utm_source=rss&utm_medium=feed",
        )
        self.assertEqual(first["canonical_url"], "https://example.test/news/apple-beats")
        self.assertEqual(first["published_at"], "2026-11-24T13:05:00Z")
        self.assertEqual(first["updated_at"], "2026-11-24T13:05:00Z")
        self.assertEqual(first["topics"], ["markets", "earnings"])
        self.assertEqual(first["author"], "newsroom@example.test (Newsroom)")
        self.assertEqual(first["source_id"], "cnbc-rss")
        self.assertEqual(first["language"], "en")
        self.assertEqual(first["body"], "Quarterly revenue rose & margins expanded.")
        self.assertEqual(len(first["content_hash"]), 32)
        # Identity is stable from the canonical URL and independent of tracking.
        self.assertEqual(first["article_id"], news_article_id(first["url"]))
        self.assertEqual(first["article_id"], news_article_id(first["canonical_url"]))

        second = rows[1]
        self.assertEqual(second["title"], "Fed holds rates steady")
        self.assertEqual(second["summary"], "Policy unchanged; guidance cautious.")
        self.assertEqual(second["author"], "Jane Doe")
        self.assertEqual(second["topics"], ["economy"])
        self.assertEqual(second["body"], "Policy unchanged; guidance cautious.")
        # Missing pubDate falls back to the provided fetch time.
        self.assertEqual(second["published_at"], FIXED_ISO)

    def test_atom_feed_fields(self) -> None:
        rows = news_rss.parse_feed(ATOM_FEED, source_id="bbc-business-rss", fetched_at=FIXED_ISO)
        self.assertEqual(len(rows), 2)
        first = rows[0]
        self.assertEqual(first["title"], "Oil prices climb as OPEC meets")
        self.assertEqual(first["summary"], "Brent crude & WTI rose.")
        # rel=alternate wins over the rel=self feed link; tracking is stripped.
        self.assertEqual(first["url"], "https://example.test/atom/oil?utm_campaign=x")
        self.assertEqual(first["canonical_url"], "https://example.test/atom/oil")
        self.assertEqual(first["published_at"], "2026-11-24T09:25:00Z")
        self.assertEqual(first["updated_at"], "2026-11-24T09:35:00Z")
        self.assertEqual(first["topics"], ["commodities", "energy"])
        self.assertEqual(first["author"], "Jane Doe")
        self.assertNotIn("should not win", first["summary"])
        self.assertEqual(first["body"], "Long content that should not win.")

        second = rows[1]
        self.assertEqual(second["title"], "Markets quiet ahead of data")
        self.assertEqual(second["summary"], "No major moves.")
        # No rel attribute means alternate; published falls back to <updated>.
        self.assertEqual(second["canonical_url"], "https://example.test/atom/quiet")
        self.assertEqual(second["published_at"], "2026-11-24T08:00:00Z")
        self.assertEqual(second["author"], "")
        self.assertEqual(second["body"], "No major moves.")

    def test_summary_is_capped(self) -> None:
        long_summary = "<p>" + ("word " * 400) + "</p>"
        feed = _single_item_feed(
            title="Long story",
            link="https://example.test/news/long",
            summary=long_summary,
        )
        rows = news_rss.parse_feed(feed, source_id="cnbc-rss", fetched_at=FIXED_ISO)
        self.assertEqual(len(rows), 1)
        self.assertLessEqual(len(rows[0]["summary"]), news_rss.SUMMARY_MAX_CHARS)
        self.assertGreater(len(rows[0]["summary"]), news_rss.SUMMARY_MAX_CHARS - 5)
        self.assertTrue(rows[0]["summary"].startswith("word word"))

    def test_only_newest_items_are_parsed(self) -> None:
        rows = news_rss.parse_feed(
            _rss_items(70), source_id="cnbc-rss", fetched_at=FIXED_ISO,
        )
        self.assertEqual(len(rows), news_rss.MAX_ITEMS_PER_FEED)
        self.assertEqual(rows[0]["title"], "Item 0")
        self.assertEqual(rows[-1]["title"], "Item 59")
        capped = news_rss.parse_feed(
            _rss_items(10), source_id="cnbc-rss", fetched_at=FIXED_ISO, max_items=3,
        )
        self.assertEqual([row["title"] for row in capped], ["Item 0", "Item 1", "Item 2"])

    def test_invalid_feed_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            news_rss.parse_feed("", source_id="cnbc-rss")
        with self.assertRaises(ValueError):
            news_rss.parse_feed("<html><body>not a feed</body></html>", source_id="cnbc-rss")
        with self.assertRaises(ValueError):
            news_rss.parse_feed("<rss><channel>", source_id="cnbc-rss")

    def test_parse_feed_datetime_formats(self) -> None:
        self.assertEqual(
            news_rss.parse_feed_datetime("Mon, 24 Nov 2026 13:05:00 GMT"),
            "2026-11-24T13:05:00Z",
        )
        self.assertEqual(
            news_rss.parse_feed_datetime("2026-11-24T14:05:00+01:00"),
            "2026-11-24T13:05:00Z",
        )
        self.assertIsNone(news_rss.parse_feed_datetime("not a date"))
        self.assertIsNone(news_rss.parse_feed_datetime(""))

    def test_registry_matches_specs(self) -> None:
        registry = news_rss.load_news_sources()
        by_id = {entry["source_id"]: entry for entry in registry}
        self.assertEqual(len(registry), len(NEWS_SOURCE_IDS))
        self.assertEqual(set(by_id), set(NEWS_SOURCE_IDS))
        for source_id, name, feed_url, language, country in NEWS_SOURCES:
            entry = by_id[source_id]
            self.assertEqual(entry["name"], name)
            self.assertEqual(entry["feed_url"], feed_url)
            self.assertEqual(entry["language"], language)
            self.assertEqual(entry["country"], country)
            expected_kind = (
                "official-release" if source_id.endswith("-press-rss") else "news-rss"
            )
            self.assertEqual(entry["kind"], expected_kind)
            self.assertEqual(entry["enabled"], 1)
            self.assertTrue(entry["homepage"].startswith("https://"))
            self.assertIn("headline", entry["license_note"].lower())
            self.assertIn("link", entry["license_note"].lower())
        payload = json.loads(news_rss.DEFAULT_SEED_PATH.read_text(encoding="utf-8"))
        self.assertIsInstance(payload, dict)
        self.assertIsInstance(payload["sources"], list)

    def test_registry_loader_accepts_alternate_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "news_sources.json"
            path.write_text(json.dumps({"sources": [{
                "source_id": "fixture-rss",
                "name": "Fixture",
                "feed_url": "https://example.test/fixture.xml",
            }]}), encoding="utf-8")
            registry = news_rss.load_news_sources(str(path))
            self.assertEqual(len(registry), 1)
            self.assertEqual(registry[0]["source_id"], "fixture-rss")
            self.assertEqual(registry[0]["language"], "en")
            self.assertEqual(registry[0]["enabled"], 1)
            # Cached copies are isolated from caller mutation.
            registry[0]["name"] = "mutated"
            again = news_rss.load_news_sources(str(path))
            self.assertEqual(again[0]["name"], "Fixture")


class CollectorTests(unittest.TestCase):
    """``news:rss`` collector behaviour against a fake HTTP client."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self.registry_path = ""
        self._use_feeds((
            "cnbc-rss",
            "bbc-business-rss",
            "guardian-business-rss",
            "marketwatch-rss",
            "wsj-markets-rss",
        ))

    # ------------------------------------------------------------- helpers

    def _feed_url(self, source_id: str) -> str:
        """Deterministic fixture feed URL for one source id."""
        return f"https://example.test/{source_id}.xml"

    def _ensure_source(self, source_id: str) -> None:
        """Register one fake feed source in the warehouse governor registry."""
        self.warehouse.ensure_source(SourceSpec(
            source_id=source_id,
            name=source_id,
            kind="news-rss",
            domain=DOMAIN_NEWS,
            base_url=self._feed_url(source_id),
            min_interval_s=1,
            max_per_hour=20,
            max_per_day=200,
        ))

    def _use_feeds(self, source_ids: tuple[str, ...], *, register: bool = True) -> None:
        """Write a registry file for ``source_ids`` and optionally register them."""
        entries = []
        for source_id in source_ids:
            if register:
                self._ensure_source(source_id)
            entries.append({
                "source_id": source_id,
                "name": source_id,
                "kind": "news-rss",
                "language": "en",
                "country": "US",
                "homepage": "https://example.test/",
                "feed_url": self._feed_url(source_id),
                "license_note": "Fixture feed; headlines and summaries only.",
            })
        path = Path(self.directory.name) / "news_sources.json"
        path.write_text(json.dumps({"sources": entries}), encoding="utf-8")
        news_rss.clear_news_sources_cache()
        self.registry_path = str(path)

    def _context(
        self,
        http: FakeHttpClient,
        settings: dict | None = None,
    ) -> CollectContext:
        """Build a deterministic collection context."""
        merged = {"news_sources_path": self.registry_path}
        merged.update(settings or {})
        return CollectContext(
            warehouse=self.warehouse,
            http=http,
            settings=merged,
            now_fn=lambda: FIXED_EPOCH,
            logger=TEST_LOGGER,
            job_id="news:rss",
        )

    def _article_xml(self, *, title: str, link: str, summary: str) -> str:
        """One-item RSS payload used by collector tests."""
        return _single_item_feed(title=title, link=link, summary=summary)

    # --------------------------------------------------------------- tests

    def test_collect_stores_articles_links_and_reports_partial(self) -> None:
        _seed_instrument(self.warehouse, "AAPL", "Apple Inc.")
        xml = self._article_xml(
            title="Apple suppliers gain as AAPL climbs",
            link="https://example.test/news/aapl-gain",
            summary="<p>Apple Inc. supplier shares rose on strong demand.</p>",
        )
        http = FakeHttpClient({
            "cnbc-rss": _fed_result("cnbc-rss", xml),
            "bbc-business-rss": SourceRateLimitedError("budget exhausted", retry_after_s=5),
            "guardian-business-rss": _not_modified("guardian-business-rss"),
            "marketwatch-rss": DataSourceError("upstream broke"),
            "wsj-markets-rss": SourceBlockedError("circuit open"),
        })
        result = news_rss.collect(self._context(http))

        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 3)
        self.assertEqual(result["status"], "partial")
        self.assertIn("bbc-business-rss", result["error"])
        self.assertIn("marketwatch-rss", result["error"])
        details = result["details"]
        self.assertEqual(details["sources"], 5)
        self.assertEqual(details["sources_registered"], 5)
        self.assertEqual(details["feeds_attempted"], 5)
        self.assertEqual(details["not_modified"], 1)
        self.assertEqual(details["articles_parsed"], 1)
        self.assertGreaterEqual(details["links"], 1)
        reasons = {failure["source_id"]: failure["reason"] for failure in details["failures"]}
        self.assertEqual(reasons["bbc-business-rss"], "rate_limited")
        self.assertEqual(reasons["marketwatch-rss"], "source_error")
        self.assertEqual(reasons["wsj-markets-rss"], "blocked")

        # The registry was upserted into news_source before fetching.
        sources = {row["source_id"]: row for row in self.warehouse.list_news_sources()}
        self.assertEqual(len(sources), 5)
        self.assertEqual(sources["cnbc-rss"]["feed_url"], self._feed_url("cnbc-rss"))
        self.assertEqual(sources["cnbc-rss"]["enabled"], 1)

        articles = self.warehouse.list_news(limit=10)
        self.assertEqual(len(articles), 1)
        article = articles[0]
        self.assertEqual(article["title"], "Apple suppliers gain as AAPL climbs")
        self.assertEqual(article["summary"], "Apple Inc. supplier shares rose on strong demand.")
        self.assertEqual(article["source_id"], "cnbc-rss")
        self.assertEqual(article["body"], "Apple Inc. supplier shares rose on strong demand.")
        entity_links = {link["entity_id"]: link for link in article["entities"]}
        self.assertIn("INS:XNAS:AAPL", entity_links)
        self.assertEqual(entity_links["INS:XNAS:AAPL"]["confidence"], 0.85)
        self.assertEqual(entity_links["INS:XNAS:AAPL"]["method"], "symbol")

        # One fetch per feed; the failed feeds are caught per feed.
        self.assertEqual(len(http.calls), 5)
        self.assertEqual(http.calls[0], ("cnbc-rss", self._feed_url("cnbc-rss")))

    def test_collect_fetches_article_content_for_new_articles(self) -> None:
        self._use_feeds(("cnbc-rss",))
        xml = self._article_xml(
            title="Apple suppliers gain as AAPL climbs",
            link="https://example.test/news/aapl-gain",
            summary="<p>Short feed summary.</p>",
        )
        long_text = " ".join(["Apple supplier demand accelerated this quarter."] * 8)
        html = (
            "<html><head><title>Article</title></head><body>"
            "<nav>Navigation that must be ignored</nav>"
            "<article><h1>Apple suppliers gain</h1><p>" + long_text + "</p>"
            "<p>A second substantive paragraph for the extracted article body.</p>"
            "</article><script>ignore()</script></body></html>"
        )
        http = FakeHttpClient({
            "cnbc-rss": _fed_result("cnbc-rss", xml),
            NEWS_CONTENT: _html_result("https://example.test/news/aapl-gain", html),
        })
        result = news_rss.collect(self._context(
            http,
            {
                "news_content_fetch": True,
                "news_content_max_per_run": 2,
            },
        ))
        self.assertEqual(result["details"]["content_fetched"], 1)
        article = self.warehouse.list_news(limit=5)[0]
        self.assertIn("Apple supplier demand accelerated", article["body"])
        self.assertIn("second substantive paragraph", article["body"])
        self.assertNotIn("Navigation", article["body"])
        self.assertEqual(len(http.calls), 2)
        self.assertEqual(http.calls[0][0], "cnbc-rss")
        self.assertEqual(http.calls[1], (NEWS_CONTENT, "https://example.test/news/aapl-gain"))

    def test_collect_backfills_content_for_existing_summary_articles(self) -> None:
        self._use_feeds(("cnbc-rss",))
        _insert_article(self.warehouse, "existing", "Existing story", "Short summary.")
        long_text = " ".join(["The company raised its full-year outlook."] * 10)
        html = "<article><p>" + long_text + "</p></article>"
        http = FakeHttpClient({
            "cnbc-rss": _fed_result("cnbc-rss", _rss_items(0)),
            NEWS_CONTENT: _html_result("https://example.test/news/existing", html),
        })
        result = news_rss.collect(self._context(
            http,
            {
                "news_content_fetch": True,
                "news_content_max_per_run": 2,
            },
        ))
        self.assertEqual(result["details"]["content_fetched"], 1)
        article = self.warehouse.list_news(limit=5)[0]
        self.assertIn("raised its full-year outlook", article["body"])
        self.assertEqual(http.calls[-1][0], NEWS_CONTENT)

    def test_content_job_enriches_recent_summary_articles(self) -> None:
        _insert_article(self.warehouse, "content-job", "Content job story", "Short summary.")
        long_text = " ".join(["The company raised its full-year outlook."] * 10)
        html = "<article><p>" + long_text + "</p></article>"
        http = FakeHttpClient({
            "news-content": _html_result("https://example.test/news/content-job", html),
        })
        result = news_rss.collect_content(self._context(http, {"news_content_max_per_run": 2}))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "ok")
        article = self.warehouse.list_news(limit=5)[0]
        self.assertIn("raised its full-year outlook", article["body"])
        self.assertEqual(http.calls[0][0], "news-content")

    def test_same_article_from_two_feeds_is_stored_once(self) -> None:
        first_xml = self._article_xml(
            title="Apple beats estimates",
            link="https://example.test/news/apple-beats?utm_source=feed-a",
            summary="<p>Strong quarter.</p>",
        )
        second_xml = self._article_xml(
            title="Apple beats estimates (updated)",
            link="https://example.test/news/apple-beats/",
            summary="<p>Strong quarter.</p>",
        )
        self._use_feeds(("cnbc-rss", "bbc-business-rss"))
        http = FakeHttpClient({
            "cnbc-rss": _fed_result("cnbc-rss", first_xml),
            "bbc-business-rss": _fed_result("bbc-business-rss", second_xml),
        })
        result = news_rss.collect(self._context(http))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["duplicates"], 1)
        articles = self.warehouse.list_news(limit=10)
        self.assertEqual(len(articles), 1)
        self.assertEqual(
            articles[0]["canonical_url"], "https://example.test/news/apple-beats",
        )

        # Re-running the same feeds stores nothing new and counts duplicates.
        second_run = news_rss.collect(self._context(http))
        self.assertEqual(second_run["stored"], 0)
        self.assertEqual(second_run["duplicates"], 2)

    def test_missing_or_disabled_sources_are_skipped(self) -> None:
        self._use_feeds(("cnbc-rss", "not-registered-rss"), register=False)
        self._ensure_source("cnbc-rss")
        self.warehouse.update_source("cnbc-rss", enabled=0)
        http = FakeHttpClient({})
        result = news_rss.collect(self._context(http))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(http.calls, [])
        self.assertEqual(
            sorted(result["details"]["disabled_sources"]),
            ["cnbc-rss", "not-registered-rss"],
        )

    def test_dry_run_feed_is_skipped_without_storing(self) -> None:
        self._use_feeds(("cnbc-rss",))
        http = FakeHttpClient({
            "cnbc-rss": FetchResult(
                url=self._feed_url("cnbc-rss"), status=0, dry_run=True, fetched_at=FIXED_ISO,
            ),
        })
        result = news_rss.collect(self._context(http))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["details"]["dry_run_feeds"], 1)
        self.assertEqual(self.warehouse.list_news(limit=10), [])

    def test_unparseable_feed_is_skipped_not_fatal(self) -> None:
        self._use_feeds(("cnbc-rss", "bbc-business-rss"))
        valid = self._article_xml(
            title="Markets rally",
            link="https://example.test/news/rally",
            summary="Broad gains.",
        )
        http = FakeHttpClient({
            "cnbc-rss": _fed_result("cnbc-rss", "<html><body>gateway error</body></html>"),
            "bbc-business-rss": _fed_result("bbc-business-rss", valid),
        })
        result = news_rss.collect(self._context(http))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["failures"][0]["reason"], "parse_error")

    def test_relink_runs_only_when_requested(self) -> None:
        _seed_instrument(self.warehouse, "AAPL", "Apple Inc.")
        self._use_feeds(("cnbc-rss",))
        article_id = _insert_article(
            self.warehouse,
            "aapl-preview",
            "AAPL shares rise before earnings",
            "Apple Inc. guidance is in focus.",
        )
        http = FakeHttpClient({"cnbc-rss": _not_modified("cnbc-rss")})

        without_relink = news_rss.collect(self._context(http))
        self.assertEqual(without_relink["stored"], 0)
        self.assertEqual(without_relink["details"]["relinked_links"], 0)
        self.assertEqual(_links_by_entity(self.warehouse, article_id), {})

        with_relink = news_rss.collect(self._context(http, {"relink": True}))
        self.assertEqual(with_relink["stored"], 0)
        self.assertEqual(with_relink["details"]["not_modified"], 1)
        self.assertEqual(with_relink["details"]["relinked_links"], 1)
        links = _links_by_entity(self.warehouse, article_id)
        self.assertIn("INS:XNAS:AAPL", links)
        self.assertEqual(links["INS:XNAS:AAPL"]["confidence"], 0.85)

        # Re-linking is idempotent: the row already exists.
        repeat = news_rss.collect(self._context(http, {"relink": True}))
        self.assertEqual(repeat["details"]["relinked_links"], 0)


class LinkerTests(unittest.TestCase):
    """Entity dictionary construction and false-positive guards."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self._seed_instrument("AAPL", "Apple Inc.")
        self._seed_instrument("A", "Agilent Technologies Inc.")
        self._seed_instrument("IT", "Gartner Inc.")
        self._seed_instrument("ALL", "Allstate Corp")
        self._seed_instrument("MSFT", "Microsoft Corp")

    def _seed_instrument(self, symbol: str, name: str) -> str:
        """Seed one instrument via the module helper."""
        return _seed_instrument(self.warehouse, symbol, name)

    def _context(self, settings: dict | None = None) -> CollectContext:
        """Build a linker context with no HTTP use."""
        return CollectContext(
            warehouse=self.warehouse,
            http=None,
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=TEST_LOGGER,
            job_id="news:link",
        )

    def _link(self, slug: str, title: str, summary: str = "") -> dict[str, dict]:
        """Insert an article, link it, and return links keyed by entity id."""
        article_id = _insert_article(self.warehouse, slug, title, summary)
        news_linker.link_articles(self._context(), [article_id])
        return _links_by_entity(self.warehouse, article_id)

    def test_symbol_and_company_name_confidences(self) -> None:
        links = self._link(
            "confidence",
            "AAPL rallies as Microsoft Corp beats estimates",
            "Apple Inc. supplier news was also strong.",
        )
        symbol_link = links["INS:XNAS:AAPL"]
        self.assertEqual(symbol_link["confidence"], 0.85)
        self.assertEqual(symbol_link["method"], "symbol")
        name_link = links["INS:XNAS:MSFT"]
        self.assertEqual(name_link["method"], "name")
        self.assertGreaterEqual(name_link["confidence"], 0.55)
        self.assertLessEqual(name_link["confidence"], 0.75)
        self.assertLess(name_link["confidence"], symbol_link["confidence"])

    def test_generic_and_lowercase_tickers_are_not_linked(self) -> None:
        links = self._link(
            "guards",
            "It is all on the line as AAPL gains",
            "Analysts say all options are open; it remains uncertain.",
        )
        self.assertIn("INS:XNAS:AAPL", links)
        self.assertNotIn("INS:XNAS:A", links)
        self.assertNotIn("INS:XNAS:IT", links)
        self.assertNotIn("INS:XNAS:ALL", links)

        plain_article = _insert_article(
            self.warehouse,
            "guards-plain",
            "It is all just one more test",
            "Nothing relevant here.",
        )
        news_linker.link_articles(self._context(), [plain_article])
        self.assertEqual(_links_by_entity(self.warehouse, plain_article), {})

    def test_dictionary_ignores_generic_aliases(self) -> None:
        dictionary = news_linker.build_entity_dictionary(self.warehouse)
        aliases = {entry["alias"] for entry in dictionary}
        self.assertIn("AAPL", aliases)
        self.assertNotIn("A", aliases)
        self.assertNotIn("IT", aliases)
        self.assertNotIn("ALL", aliases)
        symbol_entry = next(
            entry for entry in dictionary
            if entry["alias"] == "AAPL" and entry["entity_type"] == "instrument"
        )
        self.assertEqual(symbol_entry["confidence"], 0.85)
        self.assertEqual(symbol_entry["method"], "symbol")
        self.assertTrue(symbol_entry["case_sensitive"])

    def test_links_are_capped_at_twelve(self) -> None:
        symbols = [
            "AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH",
            "III", "JJJ", "KKK", "LLL", "MMM", "NNN", "OOO",
        ]
        for symbol in symbols:
            self._seed_instrument(symbol, f"Company {symbol} Holdings")
        article_id = _insert_article(
            self.warehouse,
            "capped",
            " ".join(f"{symbol} shares moved" for symbol in symbols),
        )
        news_linker.link_articles(self._context(), [article_id])
        links = _links_by_entity(self.warehouse, article_id)
        self.assertEqual(len(links), news_linker.MAX_LINKS_PER_ARTICLE)
        expected = {instrument_id("XNAS", symbol) for symbol in symbols[:12]}
        self.assertEqual(set(links), expected)
        self.assertNotIn("INS:XNAS:MMM", links)
        for link in links.values():
            self.assertEqual(link["confidence"], 0.85)
            self.assertEqual(link["method"], "symbol")

    def test_dictionary_from_reference_tables_without_aliases(self) -> None:
        warehouse = DataWarehouse(":memory:")
        self.addCleanup(warehouse.close)
        # Seed reference rows only: ref_alias intentionally stays empty.
        warehouse.upsert_instruments([{
            "instrument_id": "INS:XNAS:AAPL",
            "symbol": "AAPL",
            "mic": "XNAS",
            "name": "Apple Inc.",
            "type": "stock",
            "currency": "USD",
            "provider_symbol": "AAPL",
            "source_id": "seed",
        }])
        warehouse.upsert_indices([{
            "index_id": "IDX:GSPC",
            "code": "GSPC",
            "name": "S&P 500",
            "region": "US",
            "currency": "USD",
            "provider_symbol": "^GSPC",
            "source_id": "seed",
        }])
        warehouse.upsert_commodity_roots([{
            "root_id": "COM:XCEC:GC",
            "venue": "XCEC",
            "root": "GC",
            "name": "Gold futures",
            "category": "metals",
            "provider_symbol": "GC=F",
            "source_id": "seed",
        }])
        warehouse.upsert_commodity_contracts([{
            "contract_id": "COM:XCEC:GC:202612",
            "root_id": "COM:XCEC:GC",
            "venue": "XCEC",
            "root": "GC",
            "contract_month": "202612",
            "provider_symbol": "GCZ26",
            "source_id": "seed",
        }])
        self.assertEqual(warehouse.list_aliases(), [])

        with_alias = _insert_article(
            warehouse,
            "no-alias-symbols",
            "AAPL and GSPC climb as S&P 500 hits a record",
        )
        context = CollectContext(
            warehouse=warehouse,
            http=None,
            settings={},
            now_fn=lambda: FIXED_EPOCH,
            logger=TEST_LOGGER,
            job_id="news:link",
        )
        news_linker.link_articles(context, [with_alias])
        links = _links_by_entity(warehouse, with_alias)
        self.assertEqual(links["INS:XNAS:AAPL"]["confidence"], 0.85)
        self.assertEqual(links["INS:XNAS:AAPL"]["method"], "symbol")
        self.assertEqual(links["IDX:GSPC"]["confidence"], 0.8)
        self.assertEqual(links["IDX:GSPC"]["method"], "index_symbol")

        commodities = _insert_article(
            warehouse,
            "no-alias-commodities",
            "Gold futures rise while GCZ26 settles higher",
        )
        news_linker.link_articles(context, [commodities])
        commodity_links = _links_by_entity(warehouse, commodities)
        self.assertEqual(commodity_links["COM:XCEC:GC"]["confidence"], 0.7)
        self.assertEqual(commodity_links["COM:XCEC:GC"]["method"], "commodity_name")
        self.assertEqual(commodity_links["COM:XCEC:GC:202612"]["confidence"], 0.6)
        self.assertEqual(commodity_links["COM:XCEC:GC:202612"]["method"], "symbol")


class NewsLinkJobTests(unittest.TestCase):
    """The standalone ``news:link`` job."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        self._seed_instrument("AAPL", "Apple Inc.")
        self._seed_instrument("MSFT", "Microsoft Corp")
        self._seed_instrument("TSLA", "Tesla Inc.")
        self.oldest = _insert_article(
            self.warehouse,
            "oldest",
            "TSLA deliveries fall",
            published_at="2026-11-24T11:00:00Z",
        )
        self.middle = _insert_article(
            self.warehouse,
            "middle",
            "MSFT cloud growth slows",
            published_at="2026-11-24T12:00:00Z",
        )
        self.newest = _insert_article(
            self.warehouse,
            "newest",
            "AAPL hits a record high",
            published_at="2026-11-24T13:00:00Z",
        )

    def _seed_instrument(self, symbol: str, name: str) -> str:
        """Seed one instrument via the module helper."""
        return _seed_instrument(self.warehouse, symbol, name)

    def _context(self, settings: dict | None = None) -> CollectContext:
        """Build a deterministic ``news:link`` context (no HTTP)."""
        return CollectContext(
            warehouse=self.warehouse,
            http=None,
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=TEST_LOGGER,
            job_id="news:link",
        )

    def test_collect_links_only_the_newest_n(self) -> None:
        result = news_linker.collect(self._context({"link_limit": 2}))
        self.assertEqual(result["updated"], 2)
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["limit"], 2)
        self.assertEqual(result["details"]["scanned"], 2)
        self.assertEqual(result["details"]["links"], 2)
        self.assertIn("INS:XNAS:AAPL", _links_by_entity(self.warehouse, self.newest))
        self.assertIn("INS:XNAS:MSFT", _links_by_entity(self.warehouse, self.middle))
        self.assertEqual(_links_by_entity(self.warehouse, self.oldest), {})

        # A second pass rewrites the same links: the stored state is identical
        # (idempotent) even though the replace-based job reports rewritten rows.
        repeat = news_linker.collect(self._context({"link_limit": 2}))
        self.assertEqual(repeat["updated"], 2)
        self.assertEqual(repeat["details"]["links"], 2)
        self.assertEqual(repeat["details"]["scanned"], 2)
        self.assertIn("INS:XNAS:AAPL", _links_by_entity(self.warehouse, self.newest))

    def test_default_limit_scans_all_recent_articles(self) -> None:
        result = news_linker.collect(self._context())
        self.assertEqual(result["details"]["limit"], news_linker.DEFAULT_LINK_LIMIT)
        self.assertEqual(result["details"]["scanned"], 3)
        self.assertEqual(result["updated"], 3)
        self.assertIn("INS:XNAS:TSLA", _links_by_entity(self.warehouse, self.oldest))

    def test_missing_article_ids_are_counted_as_skipped(self) -> None:
        outcome = news_linker.link_articles(self._context(), ["missing-id", self.newest])
        self.assertEqual(outcome["scanned"], 1)
        self.assertEqual(outcome["missing"], 1)
        self.assertEqual(outcome["articles"], 2)
        self.assertEqual(outcome["links"], 1)


class NameVariantLinkerTests(unittest.TestCase):
    """Brand-name variants and financial-acronym false-positive guards."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.warehouse = DataWarehouse(Path(self.directory.name) / "warehouse.db")
        self.addCleanup(self.warehouse.close)
        _seed_instrument(self.warehouse, "NVDA", "NVIDIA Corporation")
        _seed_instrument(self.warehouse, "AAPL", "Apple Inc.")
        _seed_instrument(self.warehouse, "AMZN", "Amazon.com, Inc.")
        _seed_instrument(self.warehouse, "IPO", "IPO Holdings Corp")
        _seed_instrument(self.warehouse, "BBC", "BBC Ventures Corp")

    def _context(self) -> CollectContext:
        return CollectContext(
            warehouse=self.warehouse,
            http=None,
            settings={},
            now_fn=lambda: FIXED_EPOCH,
            logger=TEST_LOGGER,
            job_id="news:link",
        )

    def _link(self, slug: str, title: str, summary: str = "") -> dict[str, dict]:
        article_id = _insert_article(self.warehouse, slug, title, summary)
        news_linker.link_articles(self._context(), [article_id])
        return _links_by_entity(self.warehouse, article_id)

    def test_brand_name_variants_link(self) -> None:
        links = self._link(
            "brand-variants",
            "Nvidia faces a new investigation as Apple and Amazon report",
        )
        self.assertIn("INS:XNAS:NVDA", links)
        self.assertEqual(links["INS:XNAS:NVDA"]["method"], "name")
        self.assertIn("INS:XNAS:AAPL", links)
        self.assertIn("INS:XNAS:AMZN", links)

    def test_legal_suffix_variants_in_dictionary(self) -> None:
        dictionary = news_linker.build_entity_dictionary(self.warehouse)
        aliases = {entry["alias"].casefold() for entry in dictionary}
        self.assertIn("nvidia", aliases)
        self.assertIn("apple", aliases)
        self.assertIn("amazon", aliases)

    def test_financial_acronym_tickers_are_not_linked(self) -> None:
        links = self._link(
            "acronyms",
            "The IPO window reopened while the BBC covered the ESG backlash",
        )
        self.assertNotIn("INS:XNAS:IPO", links)
        self.assertNotIn("INS:XNAS:BBC", links)

    def test_replace_mode_removes_stale_links_and_re_adds_current_ones(self) -> None:
        article_id = _insert_article(
            self.warehouse, "replace-links", "Nvidia faces a new investigation",
        )
        self.warehouse.link_news_entities(article_id, [
            {"entity_type": "instrument", "entity_id": "INS:XNAS:MNDY",
             "confidence": 0.8, "method": "symbol"},
        ])
        news_linker.link_articles(
            self._context(), [article_id], replace=True,
        )
        links = _links_by_entity(self.warehouse, article_id)
        self.assertNotIn("INS:XNAS:MNDY", links)
        self.assertIn("INS:XNAS:NVDA", links)


if __name__ == "__main__":
    unittest.main()
