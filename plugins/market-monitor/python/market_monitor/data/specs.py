"""Source registry and job catalogue for the data collection layer.

These are declarative defaults from ``docs/DATA.md``; runtime counters, circuit
state and schedules live in the warehouse.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import DOMAIN_MARKET, DOMAIN_NEWS, DOMAIN_REFERENCE, SourceSpec

YAHOO = "yahoo-finance"
STOOQ = "stooq"
SEC_EDGAR = "sec-edgar"
SEC_SUBMISSIONS = "sec-submissions"
NASDAQ_TRADER = "nasdaqtrader"
EASTMONEY = "eastmoney"
SINA_CN_LIST = "sina-cn-list"
SINA_FUTURES = "sina-futures"
SINA_FINANCE = "sina-finance"
TENCENT_FINANCE = "tencent-finance"
COINGECKO = "coingecko"
FRANKFURTER = "frankfurter"
SEC_PRESS = "sec-press-rss"
FED_PRESS = "fed-press-rss"
NEWS_CONTENT = "news-content"

NEWS_SOURCES = (
    ("cnbc-rss", "CNBC Top News", "https://www.cnbc.com/id/100003114/device/rss/rss.html", "en", "US"),
    ("bbc-business-rss", "BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "en", "GB"),
    ("guardian-business-rss", "The Guardian Business", "https://www.theguardian.com/uk/business/rss", "en", "GB"),
    ("marketwatch-rss", "MarketWatch Top Stories", "https://feeds.content.dowjones.io/public/rss/mw_topstories", "en", "US"),
    ("wsj-markets-rss", "WSJ Markets", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "en", "US"),
    ("ft-rss", "Financial Times", "https://www.ft.com/rss/home", "en", "GB"),
    ("nasdaq-rss", "Nasdaq Markets", "https://www.nasdaq.com/feed/rssoutbound?category=Markets", "en", "US"),
    ("investing-rss", "Investing.com News", "https://www.investing.com/rss/news.rss", "en", "US"),
    ("sec-press-rss", "SEC Press Releases", "https://www.sec.gov/news/pressreleases.rss", "en", "US"),
    ("fed-press-rss", "Federal Reserve Press", "https://www.federalreserve.gov/feeds/press_all.xml", "en", "US"),
)

NEWS_SOURCE_IDS = tuple(source_id for source_id, *_rest in NEWS_SOURCES)


def _news_spec(source_id: str, name: str, url: str, language: str, country: str) -> SourceSpec:
    """Build a polite RSS source specification."""
    official = source_id.endswith("-press-rss")
    return SourceSpec(
        source_id=source_id,
        name=name,
        kind="official-release" if official else "news-rss",
        domain=DOMAIN_NEWS,
        base_url=url,
        license_note=(
            "Public feed; headline, summary and linked article content for "
            "internal analysis, always attributed and linked to the publisher."
        ),
        enabled=True,
        min_interval_s=600.0 if not official else 900.0,
        max_per_hour=6 if not official else 4,
        max_per_day=96 if not official else 48,
    )


SOURCE_SPECS: tuple[SourceSpec, ...] = (
    SourceSpec(
        source_id=SEC_EDGAR,
        name="SEC EDGAR company tickers",
        kind="bulk-reference",
        domain=DOMAIN_REFERENCE,
        base_url="https://www.sec.gov/files/company_tickers.json",
        license_note="US public domain filing metadata.",
        min_interval_s=2.0,
        max_per_hour=20,
        max_per_day=30,
    ),
    SourceSpec(
        source_id=SEC_SUBMISSIONS,
        name="SEC EDGAR submissions (company profile)",
        kind="official-api",
        domain=DOMAIN_REFERENCE,
        base_url="https://data.sec.gov/submissions/",
        license_note="US public domain filing metadata; one company per governed request.",
        min_interval_s=1.0,
        max_per_hour=600,
        max_per_day=4000,
    ),
    SourceSpec(
        source_id=NASDAQ_TRADER,
        name="NasdaqTrader symbol directory",
        kind="bulk-reference",
        domain=DOMAIN_REFERENCE,
        base_url="https://www.nasdaqtrader.com/dynamic/SymDir/",
        license_note="Public symbol directory files.",
        min_interval_s=3.0,
        max_per_hour=10,
        max_per_day=30,
    ),
    SourceSpec(
        source_id=EASTMONEY,
        name="Eastmoney public market lists (China)",
        kind="bulk-reference",
        domain=DOMAIN_REFERENCE,
        base_url="https://push2.eastmoney.com",
        license_note="Public web quote/list endpoints; bounded pagination and conservative polling.",
        min_interval_s=2.0,
        max_per_hour=300,
        max_per_day=2000,
    ),
    SourceSpec(
        source_id=SINA_CN_LIST,
        name="Sina Finance China equity/ETF lists",
        kind="bulk-reference",
        domain=DOMAIN_REFERENCE,
        base_url="https://vip.stock.finance.sina.com.cn",
        license_note="Public Sina Finance market-center list API; fallback when Eastmoney list pages fail.",
        min_interval_s=2.0,
        max_per_hour=200,
        max_per_day=1000,
    ),
    SourceSpec(
        source_id=SINA_FUTURES,
        name="Sina Finance China futures",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://hq.sinajs.cn",
        license_note="Public Sina Finance futures quote/history endpoints; batched requests, referer required.",
        min_interval_s=2.0,
        max_per_hour=240,
        max_per_day=1200,
    ),
    SourceSpec(
        source_id=SINA_FINANCE,
        name="Sina Finance global quotes",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://hq.sinajs.cn",
        license_note="Public Sina Finance quote/history endpoints; batched, referer required.",
        min_interval_s=2.0,
        max_per_hour=240,
        max_per_day=1200,
    ),
    SourceSpec(
        source_id=TENCENT_FINANCE,
        name="Tencent Finance quotes",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://qt.gtimg.cn",
        license_note="Public Tencent Finance quotes/kline; batched, conservative polling.",
        min_interval_s=2.0,
        max_per_hour=240,
        max_per_day=800,
    ),
    SourceSpec(
        source_id=COINGECKO,
        name="CoinGecko crypto",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://api.coingecko.com/api/v3",
        license_note="Public CoinGecko API; free-tier pacing, attribution appreciated.",
        min_interval_s=10.0,
        max_per_hour=100,
        max_per_day=500,
    ),
    SourceSpec(
        source_id=FRANKFURTER,
        name="Frankfurter ECB FX",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://api.frankfurter.app",
        license_note="ECB reference rates via Frankfurter; daily reference data, not tradable quotes.",
        min_interval_s=5.0,
        max_per_hour=100,
        max_per_day=300,
    ),
    SourceSpec(
        source_id=YAHOO,
        name="Yahoo Finance",
        kind="market-data",
        domain=DOMAIN_MARKET,
        base_url="https://query1.finance.yahoo.com",
        license_note="Public chart endpoints; conservative polling with batching.",
        min_interval_s=2.0,
        max_per_hour=240,
        max_per_day=2500,
    ),
    SourceSpec(
        source_id=STOOQ,
        name="Stooq",
        kind="eod-fallback",
        domain=DOMAIN_MARKET,
        base_url="https://stooq.com",
        license_note="Public CSV download endpoint; used only as EOD fallback.",
        min_interval_s=3.0,
        max_per_hour=200,
        max_per_day=1500,
    ),
    *(_news_spec(source_id, name, url, language, country) for source_id, name, url, language, country in NEWS_SOURCES),
    SourceSpec(
        source_id=NEWS_CONTENT,
        name="News article content",
        kind="news-content",
        domain=DOMAIN_NEWS,
        base_url="https://",
        license_note=(
            "Fetches linked public article pages from approved news sources to "
            "extract readable content; attributed to the publisher and never "
            "redistributed by the plugin."
        ),
        enabled=True,
        min_interval_s=2.0,
        max_per_hour=120,
        max_per_day=1200,
    ),
)


@dataclass(frozen=True)
class JobDefinition:
    """Declarative job description before a handler is attached."""

    job_id: str
    description: str
    domain: str
    interval_s: int
    source_ids: tuple[str, ...] = ()
    enabled: bool = True


JOB_DEFINITIONS: tuple[JobDefinition, ...] = (
    JobDefinition(
        job_id="backfill:annual",
        description="Gradually backfill one year of real daily bars for watched companies",
        domain=DOMAIN_MARKET,
        interval_s=1800,
        source_ids=(YAHOO, SINA_FINANCE, TENCENT_FINANCE, COINGECKO, FRANKFURTER),
    ),
    JobDefinition(
        job_id="market:intraday",
        description="Collect real 5m bars and separately stored 30m bars for watched US securities",
        domain=DOMAIN_MARKET,
        interval_s=1800,
        source_ids=(SINA_FINANCE,),
    ),
    JobDefinition(
        job_id="reference:seed",
        description="Load curated exchanges, global listings, indices and commodity contracts",
        domain=DOMAIN_REFERENCE,
        interval_s=30 * 86400,
    ),
    JobDefinition(
        job_id="reference:us",
        description="Refresh US listings from SEC and NasdaqTrader bulk files (legacy path; company:index supersedes it)",
        domain=DOMAIN_REFERENCE,
        interval_s=7 * 86400,
        source_ids=(SEC_EDGAR, NASDAQ_TRADER),
        enabled=False,
    ),
    JobDefinition(
        job_id="company:index",
        description="Refresh the company master index from official listing files and the curated global seed",
        domain=DOMAIN_REFERENCE,
        interval_s=86400,
        source_ids=(SEC_EDGAR, NASDAQ_TRADER),
    ),
    JobDefinition(
        job_id="company:profile",
        description="Collect company profiles for index entries that still need enrichment",
        domain=DOMAIN_REFERENCE,
        interval_s=300,
        source_ids=(SEC_SUBMISSIONS,),
    ),
    JobDefinition(
        job_id="china:index",
        description="Refresh the China securities (A-share/ETF) and domestic commodity indexes",
        domain=DOMAIN_REFERENCE,
        interval_s=86400,
        source_ids=(EASTMONEY,),
    ),
    JobDefinition(
        job_id="china:quotes",
        description="Batch live quotes for tracked China A-shares and exchange-traded funds",
        domain=DOMAIN_MARKET,
        interval_s=180,
        source_ids=(YAHOO,),
    ),
    JobDefinition(
        job_id="china:eod",
        description="Daily bars for tracked China A-shares and exchange-traded funds",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(YAHOO,),
    ),
    JobDefinition(
        job_id="china:commodity:quotes",
        description="Batch quotes for tracked mainland commodity front contracts",
        domain=DOMAIN_MARKET,
        interval_s=120,
        source_ids=(SINA_FUTURES,),
    ),
    JobDefinition(
        job_id="china:commodity:eod",
        description="Daily bars and open interest for mainland commodity front contracts",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(SINA_FUTURES,),
    ),
    JobDefinition(
        job_id="market:backup:quotes",
        description="Multi-channel quote fallback (Sina, Tencent, CoinGecko, Frankfurter)",
        domain=DOMAIN_MARKET,
        interval_s=300,
        source_ids=(SINA_FINANCE, TENCENT_FINANCE, COINGECKO, FRANKFURTER),
    ),
    JobDefinition(
        job_id="market:backup:eod",
        description="Multi-channel EOD fallback for stale US/crypto/FX/HK/A-share series",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(SINA_FINANCE, TENCENT_FINANCE, COINGECKO, FRANKFURTER),
    ),
    JobDefinition(
        job_id="news:rss",
        description="Poll approved news RSS feeds, fetch article content and store deduplicated articles",
        domain=DOMAIN_NEWS,
        interval_s=900,
        source_ids=(*NEWS_SOURCE_IDS, NEWS_CONTENT),
    ),
    JobDefinition(
        job_id="news:content",
        description="Fetch readable content for recent news articles that have only a summary",
        domain=DOMAIN_NEWS,
        interval_s=600,
        source_ids=(NEWS_CONTENT,),
    ),
    JobDefinition(
        job_id="backfill:recent",
        description="Automatically fill missing daily bars in the rolling recent window",
        domain=DOMAIN_MARKET,
        interval_s=600,
        source_ids=(YAHOO, SINA_FINANCE, TENCENT_FINANCE, COINGECKO, FRANKFURTER, SINA_FUTURES),
    ),
    JobDefinition(
        job_id="market:live",
        description="Batch live quotes for tracked instruments, indices and commodities",
        domain=DOMAIN_MARKET,
        interval_s=60,
        source_ids=(YAHOO,),
    ),
    JobDefinition(
        job_id="index:daily",
        description="Daily index levels for the curated blue-chip indices",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(YAHOO,),
    ),
    JobDefinition(
        job_id="commodity:daily",
        description="Daily bars for front commodity contracts",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(YAHOO,),
    ),
    JobDefinition(
        job_id="market:eod",
        description="Daily bars for tracked instruments from Yahoo with Stooq fallback",
        domain=DOMAIN_MARKET,
        interval_s=86400,
        source_ids=(YAHOO, STOOQ),
    ),
    JobDefinition(
        job_id="news:link",
        description="Link stored articles to instruments, indices and commodities",
        domain=DOMAIN_NEWS,
        interval_s=900,
    ),
    JobDefinition(
        job_id="maintenance:prune",
        description="Apply raw-document and quote-observation retention policies",
        domain=DOMAIN_REFERENCE,
        interval_s=86400,
    ),
)


def get_job_definition(job_id: str) -> JobDefinition | None:
    """Look up a job definition by id."""
    for definition in JOB_DEFINITIONS:
        if definition.job_id == job_id:
            return definition
    return None


__all__ = [
    "COINGECKO",
    "EASTMONEY",
    "FED_PRESS",
    "FRANKFURTER",
    "JOB_DEFINITIONS",
    "NASDAQ_TRADER",
    "NEWS_SOURCES",
    "NEWS_SOURCE_IDS",
    "NEWS_CONTENT",
    "SEC_EDGAR",
    "SEC_SUBMISSIONS",
    "SEC_PRESS",
    "SINA_CN_LIST",
    "SINA_FINANCE",
    "SINA_FUTURES",
    "SOURCE_SPECS",
    "STOOQ",
    "TENCENT_FINANCE",
    "YAHOO",
    "JobDefinition",
    "get_job_definition",
]
