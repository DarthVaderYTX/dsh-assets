"""Tests for readable article-content extraction."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data.sources.news_content import (
    CONTENT_MAX_CHARS,
    MIN_CONTENT_CHARS,
    extract_article_content,
)

PARAGRAPH = " ".join(["Central banks signalled a slower path for rate cuts."] * 8)


class ArticleContentTests(unittest.TestCase):
    def test_extracts_paragraphs_and_skips_page_chrome(self) -> None:
        html = (
            "<html><body><header>Site header</header>"
            "<nav>Home Markets World</nav>"
            "<article><h1>Rates outlook</h1>"
            f"<p>{PARAGRAPH}</p>"
            "<p>Investors repriced the front end of the curve after the statement.</p>"
            "</article><footer>Copyright</footer>"
            "<script>window.tracker()</script></body></html>"
        )
        content = extract_article_content(html, url="https://example.test/a")
        self.assertIn("slower path for rate cuts", content)
        self.assertIn("\n\n", content)
        self.assertNotIn("Site header", content)
        self.assertNotIn("Home Markets", content)
        self.assertNotIn("tracker", content)
        self.assertGreaterEqual(len(content), MIN_CONTENT_CHARS)

    def test_json_ld_article_body_wins(self) -> None:
        body = " ".join(["Regulators published the final rule package."] * 12)
        html = (
            '<html><head><script type="application/ld+json">'
            '{"@type":"NewsArticle","articleBody":"' + body + '"}'
            "</script></head><body><nav>menu</nav></body></html>"
        )
        content = extract_article_content(html)
        self.assertEqual(content, body)

    def test_meta_description_is_a_short_fallback(self) -> None:
        html = (
            '<html><head><meta name="description" content="Markets closed mixed.">'
            "</head><body><div>No paragraphs here.</div></body></html>"
        )
        self.assertEqual(extract_article_content(html), "Markets closed mixed.")

    def test_content_is_capped(self) -> None:
        html = "<article><p>" + ("word " * 8000) + "</p></article>"
        content = extract_article_content(html)
        self.assertLessEqual(len(content), CONTENT_MAX_CHARS)
        self.assertTrue(content.startswith("word word"))

    def test_malformed_or_empty_pages_return_empty(self) -> None:
        self.assertEqual(extract_article_content(""), "")
        self.assertEqual(extract_article_content("<html><body><p>tiny</p>"), "")
        self.assertEqual(extract_article_content("<html><p>"), "")


if __name__ == "__main__":
    unittest.main()
