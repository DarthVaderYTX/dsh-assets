"""Offline tests for the multi-channel market data collectors.

Every HTTP response is an inline fixture served by a fake HTTP object, so the
suite never touches the network.  The fixed clock is 2026-11-25T12:00:00Z, which
makes today's UTC date ``2026-11-25`` for the EOD freshness assertions.

Payload fixtures are copies of the shapes verified against the live endpoints
on 2026-11-25 (values trimmed to the fields under test).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse, FetchResult
from market_monitor.data.errors import DataSourceError, SourceRateLimitedError
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import market_channels as channels

CLOCK = datetime(2026, 11, 25, 12, 0, 0, tzinfo=timezone.utc)
NOW = CLOCK.timestamp()
NOW_ISO = "2026-11-25T12:00:00Z"
TODAY = "2026-11-25"


# ---------------------------------------------------------------------------
# inline fixtures
# ---------------------------------------------------------------------------


def us_quote_fields(
    last: str = "354.0700",
    pct: str = "1.43",
    stamp: str = "2026-11-25 08:52:38",
    change: str = "4.9900",
    open_price: str = "348.0600",
    high: str = "354.4000",
    low: str = "345.8800",
    week_high: str = "360.8300",
    week_low: str = "242.3500",
    volume: str = "41266740",
    prev_close: str = "349.0800",
) -> list[str]:
    """A verified ``gb_*`` field list (prev_close lives at index 26)."""
    fields = ["0.00"] * 37
    fields[0] = "苹果"
    fields[1] = last
    fields[2] = pct
    fields[3] = stamp
    fields[4] = change
    fields[5] = open_price
    fields[6] = high
    fields[7] = low
    fields[8] = week_high
    fields[9] = week_low
    fields[10] = volume
    fields[26] = prev_close
    fields[35] = prev_close
    return fields


#: Verified ``rt_hk00700`` layout: [2] open, [3] prev_close, [4] high, [5] low,
#: [6] last, [8] change_pct, [12] volume, [17] date, [18] time.
HK_QUOTE_FIELDS = [
    "TENCENT", "腾讯控股", "352.000", "344.000", "353.000", "340.000",
    "341.600", "-2.400", "-0.698", "341.400", "341.600", "10123426303.240",
    "29393105", "12.426", "0.000", "631.641", "333.000", "2026/11/24",
    "16:08:15", "100|0", "N|Y|Y", "341.000|324.000|358.000",
]

#: Verified ``int_dji`` layout: [1] last, [2] change, [3] change_pct.
INDEX_QUOTE_FIELDS = ["道琼斯", "46247.29", "299.97", "0.65"]

#: Verified ``hf_GC`` layout: [0] last, [4] high, [5] low, [6] time,
#: [7] prev_settle, [8] prev_close, [12] date, [13] name.
FUTURES_QUOTE_FIELDS = [
    "3578.985", "", "3580.000", "3580.500", "3596.000", "3566.700",
    "08:53:30", "3591.100", "3586.900", "0", "1", "2", "2026-11-25",
    "纽约黄金", "0",
]

#: Tencent ``usAAPL`` layout: [3] last, [4] prev_close, [5] open, [6] volume.
TENCENT_US_FIELDS = [
    "200", "苹果", "AAPL.OQ", "354.07", "349.08", "348.06", "41266740",
    "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
    "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "", "2026-11-24 16:00:02",
]
TENCENT_HK_FIELDS = [
    "100", "腾讯控股", "00700", "341.600", "344.000", "352.000", "29393105.0",
    "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
]
TENCENT_CN_FIELDS = [
    "1", "贵州茅台", "600519", "1460.00", "1439.00", "1425.00", "42924",
    "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
]

#: Verified Sina US daily-history rows (``d/o/h/l/c/v``).
SINA_US_DAILY_ROWS = [
    {"d": "2026-11-20", "o": "352.87", "h": "354.34", "l": "340.56", "c": "342.56",
     "v": "80692545", "a": "27860800000"},
    {"d": "2026-11-21", "o": "347.87", "h": "352.60", "l": "345.44", "c": "349.08",
     "v": "58588677", "a": "20450700000"},
    {"d": "2026-11-24", "o": "348.06", "h": "354.40", "l": "345.88", "c": "354.07",
     "v": "41267141", "a": "14525300000"},
    {"d": "2026-11-24", "o": "0.00", "h": "0.00", "l": "0.00", "c": "0.00",
     "v": "1"},  # no close -> dropped
]

#: Verified Tencent kline payloads (row order: date, open, close, high, low, vol).
TENCENT_US_KLINE = {
    "code": 0,
    "msg": "",
    "data": {"usAAPL.OQ": {"day": [
        ["2026-11-20", "352.870", "342.560", "354.340", "340.560", "80692545.000"],
        ["2026-11-24", "348.06", "354.07", "354.40", "345.88", "41267141"],
    ]}},
}
TENCENT_HK_KLINE = {
    "code": 0,
    "msg": "",
    "data": {"hk00700": {"day": [
        ["2026-11-20", "341.000", "344.000", "349.600", "339.600", "41094469.000"],
        ["2026-11-24", "352.000", "341.600", "353.000", "340.000", "29393105.000"],
    ]}},
}
TENCENT_CN_KLINE = {
    "code": 0,
    "msg": "",
    "data": {"sh600519": {"qfqday": [
        ["2026-11-20", "1450.890", "1485.750", "1489.090", "1423.900", "67229.000"],
        ["2026-11-24", "1425.000", "1460.000", "1463.260", "1420.000", "42924.000"],
    ]}},
}


def epoch_ms(day: str, hour: int = 0) -> int:
    """UTC epoch milliseconds for ``YYYY-MM-DD`` plus an optional hour."""
    moment = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int((moment.timestamp() + hour * 3600) * 1000)


def daily_rows(count: int, end: str = "2026-11-24") -> list[dict[str, str]]:
    """A synthetic ascending ``d/o/h/l/c/v`` daily history ending on ``end``."""
    end_day = datetime.strptime(end, "%Y-%m-%d")
    return [
        {
            "d": (end_day - timedelta(days=offset)).strftime("%Y-%m-%d"),
            "o": "1.00", "h": "2.00", "l": "0.50", "c": "1.50", "v": "10",
        }
        for offset in range(count - 1, -1, -1)
    ]


COINGECKO_CHART = {
    "prices": [
        [epoch_ms("2026-11-20"), 100.0],
        [epoch_ms("2026-11-21"), 110.0],
        [epoch_ms("2026-11-24"), 90.0],
        [epoch_ms("2026-11-24", 1), 95.0],
    ],
    "market_caps": [],
    "total_volumes": [
        [epoch_ms("2026-11-20"), 1000.0],
        [epoch_ms("2026-11-21"), 2000.0],
        [epoch_ms("2026-11-24"), 500.0],
        [epoch_ms("2026-11-24", 1), 700.0],
    ],
}

FRANKFURTER_SERIES = {
    "amount": 1.0,
    "base": "EUR",
    "start_date": "2026-11-18",
    "end_date": "2026-11-24",
    "rates": {
        "2026-11-18": {"USD": 1.0968},
        "2026-11-19": {"USD": 1.0992},
        "2026-11-20": {"USD": 1.099},
        "2026-11-23": {"USD": 1.0939},
        "2026-11-24": {"USD": 1.0963},
    },
}

COINGECKO_SIMPLE = {
    "bitcoin": {"usd": 59586.0, "usd_24h_change": -2.5969},
    "ethereum": {"usd": 1672.56, "usd_24h_change": -2.0367},
}

FRANKFURTER_LATEST_EUR = {"amount": 1.0, "base": "EUR", "date": "2026-11-24",
                          "rates": {"GBP": 0.837, "USD": 1.0963}}
FRANKFURTER_LATEST_USD = {"amount": 1.0, "base": "USD", "date": "2026-11-24",
                          "rates": {"EUR": 0.9121}}


def sina_line(symbol: str, fields: list[str]) -> str:
    """One ``var hq_str_<symbol>="...";`` batch-quote line."""
    return f'var hq_str_{symbol}="{",".join(fields)}";'


def sina_batch(*pairs: tuple[str, list[str]]) -> str:
    """A GBK-decoded Sina batch-quote body."""
    return "\n".join(sina_line(symbol, fields) for symbol, fields in pairs) + "\n"


def tencent_line(symbol: str, fields: list[str]) -> str:
    """One ``v_<symbol>="...";`` Tencent batch-quote line."""
    return f'v_{symbol}="{"~".join(fields)}";'


def tencent_batch(*pairs: tuple[str, list[str]]) -> str:
    """A GBK-decoded Tencent batch-quote body."""
    return "\n".join(tencent_line(symbol, fields) for symbol, fields in pairs) + "\n"


def jsonp(symbol: str, rows: list[dict[str, Any]]) -> str:
    """A Sina daily-history JSONP body with the real script/comment wrapper."""
    return (
        "/*<script>location.href='//sina.com';</script>*/\n"
        f"var _{symbol}=({json.dumps(rows, ensure_ascii=False, separators=(',', ':'))});"
    )


def json_bytes(payload: Any) -> bytes:
    """A UTF-8 encoded JSON response body (what the JSON channels return)."""
    return json.dumps(payload).encode("utf-8")


# ---------------------------------------------------------------------------
# offline HTTP double
# ---------------------------------------------------------------------------


class FakeHttp:
    """Offline stand-in for :class:`PoliteHttpClient` over inline fixtures.

    ``handler(source_id, url, request_number)`` returns a ``str`` (encoded as
    GBK), ``bytes`` (used verbatim), a :class:`FetchResult`, or an exception to
    raise.  Every request is recorded for assertions.
    """

    def __init__(self, handler: Callable[[str, str, int], Any]) -> None:
        self.handler = handler
        self.calls: list[dict[str, Any]] = []
        self.dry_run = False

    def fetch(
        self,
        source_id: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        conditional: bool = True,
        keep_raw: bool = True,
        accept: str = "*/*",
    ) -> FetchResult:
        """Serve one canned response; no network is ever touched."""
        self.calls.append({
            "source_id": source_id,
            "url": url,
            "headers": dict(headers or {}),
            "conditional": conditional,
            "accept": accept,
        })
        response = self.handler(source_id, url, len(self.calls))
        if isinstance(response, BaseException):
            raise response
        if isinstance(response, FetchResult):
            return response
        body = response if isinstance(response, bytes) else str(response).encode("gbk")
        return FetchResult(
            url=url, status=200, body=body, content_type="text/plain", fetched_at=NOW_ISO,
        )


# ---------------------------------------------------------------------------
# tracked-series fixtures
# ---------------------------------------------------------------------------


def series(series_id: str, kind: str, provider_symbol: str, currency: str) -> dict[str, str]:
    """One tracked-series entry as the job wiring passes it in settings."""
    return {
        "series_id": series_id,
        "kind": kind,
        "provider_symbol": provider_symbol,
        "currency": currency,
    }


US_AAPL = series("INS:XNAS:AAPL", "instrument", "AAPL", "USD")
US_MSFT = series("INS:XNAS:MSFT", "instrument", "MSFT", "USD")
US_TSLA = series("INS:XNAS:TSLA", "instrument", "TSLA", "USD")
HK_TENCENT = series("INS:XHKG:0700", "instrument", "0700.HK", "HKD")
CN_MOUTAI = series("INS:XSHG:600519", "instrument", "600519.SS", "CNY")
CRYPTO_BTC = series("INS:XCRY:BTC-USD", "instrument", "BTC-USD", "USD")
FX_EURUSD = series("INS:XFXS:EURUSD=X", "instrument", "EURUSD=X", "USD")
FX_USDEUR = series("INS:XFXS:USDEUR=X", "instrument", "USDEUR=X", "EUR")
FX_EURGBP = series("INS:XFXS:EURGBP=X", "instrument", "EURGBP=X", "GBP")
IDX_GSPC = series("IDX:GSPC", "index", "^GSPC", "USD")
IDX_HSI = series("IDX:HSI", "index", "^HSI", "HKD")
FUT_GC = series("COM:XCEC:GC", "commodity", "GC=F", "USD")


class CollectorTestCase(unittest.TestCase):
    """Shared warehouse, fixed clock, fake HTTP and context factory."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(":memory:", now_fn=lambda: NOW)
        self.addCleanup(self.warehouse.close)
        self.http = FakeHttp(lambda *args: self.fail(f"unexpected HTTP request: {args[1]}"))
        logger = logging.getLogger(f"tests.data.market_channels.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        self.logger = logger

    def context(self, settings: dict[str, Any] | None = None) -> CollectContext:
        """Build a :class:`CollectContext` with the fixed clock and fake HTTP."""
        return CollectContext(
            warehouse=self.warehouse,
            http=self.http,
            settings=dict(settings or {}),
            now_fn=lambda: NOW,
            logger=self.logger,
            job_id="market:backup:quotes",
            job_state={},
        )

    def use_http(self, handler: Callable[[str, str, int], Any]) -> None:
        """Replace the fake HTTP handler."""
        self.http.handler = handler

    def seed_quote(self, series_id: str, observed_at: str, price: float = 100.0) -> None:
        """Persist one latest quote so the staleness ordering has an age."""
        self.warehouse.upsert_quote_latest([{
            "series_id": series_id,
            "ts": observed_at,
            "price": price,
            "prev_close": price,
            "change_pct": 0.0,
            "volume": 0,
            "currency": "USD",
            "source_id": "seed",
            "observed_at": observed_at,
        }])

    def seed_bar(self, series_id: str, ts: str, close: float = 100.0) -> None:
        """Persist one daily bar so a series can look fresh/stale by date."""
        self.warehouse.upsert_bars([{
            "series_id": series_id,
            "interval": "1d",
            "ts": ts,
            "open": close,
            "high": close,
            "low": close,
            "close": close,
            "volume": 1,
        }], "yahoo-finance")


# ---------------------------------------------------------------------------
# 1. surface and URLs
# ---------------------------------------------------------------------------


class SurfaceTests(CollectorTestCase):
    """Source ids, referers, defaults and URL builders."""

    def test_module_surface(self) -> None:
        self.assertEqual(channels.SINA_FINANCE, "sina-finance")
        self.assertEqual(channels.TENCENT_FINANCE, "tencent-finance")
        self.assertEqual(channels.COINGECKO, "coingecko")
        self.assertEqual(channels.FRANKFURTER, "frankfurter")
        self.assertEqual(channels.SINA_HEADERS, {"Referer": "https://finance.sina.com.cn"})
        self.assertEqual(channels.TENCENT_HEADERS, {"Referer": "https://gu.qq.com"})
        self.assertEqual(channels.DEFAULT_QUOTE_LIMIT, 20)
        self.assertEqual(channels.MAX_QUOTE_LIMIT, 40)
        self.assertEqual(channels.DEFAULT_SINA_BATCH, 40)
        self.assertEqual(channels.MAX_SINA_BATCH, 80)
        self.assertEqual(channels.DEFAULT_EOD_LIMIT, 20)
        self.assertEqual(channels.MAX_EOD_LIMIT, 40)

    def test_url_builders(self) -> None:
        self.assertEqual(
            channels.sina_quote_url(["gb_aapl", "rt_hk00700", ""]),
            "https://hq.sinajs.cn/list=gb_aapl,rt_hk00700",
        )
        self.assertEqual(
            channels.sina_us_daily_url("aapl"),
            "https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_AAPL="
            "/US_MinKService.getDailyK?symbol=AAPL",
        )
        self.assertEqual(
            channels.tencent_quote_url(["usAAPL", "hk00700"]),
            "https://qt.gtimg.cn/q=usAAPL,hk00700",
        )
        self.assertEqual(
            channels.tencent_kline_url("usAAPL.OQ", bars=30),
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
            "?param=usAAPL.OQ,day,,,30,qfq",
        )
        self.assertEqual(
            channels.coingecko_price_url(["bitcoin", "ethereum"]),
            "https://api.coingecko.com/api/v3/simple/price"
            "?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
        )
        self.assertEqual(
            channels.coingecko_chart_url("bitcoin", days=365),
            "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
            "?vs_currency=usd&days=365&interval=daily",
        )
        self.assertEqual(
            channels.frankfurter_latest_url("EUR", ["USD", "GBP"]),
            "https://api.frankfurter.app/latest?from=EUR&to=USD,GBP",
        )
        self.assertEqual(
            channels.frankfurter_series_url("EUR", "USD", "2026-11-18", "2026-11-24"),
            "https://api.frankfurter.app/2026-11-18..2026-11-24?from=EUR&to=USD",
        )


# ---------------------------------------------------------------------------
# 2. channel planning (symbol mapping)
# ---------------------------------------------------------------------------


class ChannelPlanTests(CollectorTestCase):
    """Tracked-series classification and provider symbol mapping."""

    def test_quote_entries(self) -> None:
        self.assertEqual(channels.quote_entry(US_AAPL)["kind"], "sina-us")
        self.assertEqual(channels.quote_entry(US_AAPL)["symbol"], "gb_aapl")
        self.assertEqual(channels.quote_entry(HK_TENCENT)["symbol"], "rt_hk00700")
        self.assertEqual(channels.quote_entry(CN_MOUTAI)["source_id"], channels.TENCENT_FINANCE)
        self.assertEqual(channels.quote_entry(CN_MOUTAI)["symbol"], "sh600519")
        self.assertEqual(channels.quote_entry(CRYPTO_BTC)["symbol"], "bitcoin")
        entry = channels.quote_entry(FX_EURUSD)
        self.assertEqual(entry["source_id"], channels.FRANKFURTER)
        self.assertEqual(entry["request_from"], "EUR")
        self.assertEqual(entry["target"], "USD")
        self.assertEqual(entry["currency"], "USD")
        inverse = channels.quote_entry(FX_USDEUR)
        self.assertEqual(inverse["request_from"], "USD")
        self.assertEqual(inverse["target"], "EUR")
        self.assertEqual(inverse["currency"], "EUR")
        self.assertEqual(channels.quote_entry(IDX_GSPC)["symbol"], "int_sp500")
        self.assertEqual(channels.quote_entry(IDX_HSI)["currency"], "HKD")
        self.assertEqual(channels.quote_entry(FUT_GC)["symbol"], "hf_GC")
        self.assertIsNone(channels.quote_entry(FX_EURGBP))
        self.assertIsNone(channels.quote_entry(series("INS:XTKS:7203", "instrument", "7203.T", "JPY")))
        self.assertIsNone(channels.quote_entry(series("COM:XCEC:ZW", "commodity", "ZW=F", "USD")))
        self.assertIsNone(channels.quote_entry(series("INS:XNAS:BRK-B", "instrument", "BRK-B", "USD")))

    def test_eod_entries(self) -> None:
        self.assertEqual(channels.eod_entry(US_AAPL)["kind"], "sina-us")
        self.assertEqual(channels.eod_entry(US_AAPL)["symbol"], "AAPL")
        self.assertEqual(channels.eod_entry(HK_TENCENT)["kind"], "tencent")
        self.assertEqual(channels.eod_entry(HK_TENCENT)["symbol"], "hk00700")
        self.assertEqual(channels.eod_entry(CN_MOUTAI)["symbol"], "sh600519")
        self.assertEqual(channels.eod_entry(CRYPTO_BTC)["symbol"], "bitcoin")
        self.assertEqual(channels.eod_entry(FX_EURUSD)["source_id"], channels.FRANKFURTER)
        self.assertIsNone(channels.eod_entry(IDX_GSPC))
        self.assertIsNone(channels.eod_entry(FUT_GC))

    def test_tencent_kline_codes(self) -> None:
        self.assertEqual(channels._tencent_kline_code(US_AAPL), "usAAPL.OQ")
        self.assertEqual(channels._tencent_kline_code(HK_TENCENT), "hk00700")
        self.assertEqual(channels._tencent_kline_code(CN_MOUTAI), "sh600519")
        shenzhen = series("INS:XSHE:000001", "instrument", "000001.SZ", "CNY")
        self.assertEqual(channels._tencent_kline_code(shenzhen), "sz000001")


# ---------------------------------------------------------------------------
# 3. Sina quote parsing
# ---------------------------------------------------------------------------


class SinaQuoteParsingTests(CollectorTestCase):
    """Verified Sina quote field layouts and row mapping."""

    def test_parse_batch_text(self) -> None:
        body = sina_batch(
            ("gb_aapl", us_quote_fields()),
            ("int_dji", INDEX_QUOTE_FIELDS),
            ("empty", []),
        )
        parsed = channels.parse_sina_quote_text(body)
        self.assertEqual(sorted(parsed), ["empty", "gb_aapl", "int_dji"])
        self.assertEqual(parsed["gb_aapl"][1], "354.0700")
        self.assertEqual(parsed["empty"], [])

    def test_us_fields_and_row_mapping(self) -> None:
        quote = channels.parse_sina_us_fields(us_quote_fields())
        self.assertIsNotNone(quote)
        self.assertEqual(quote["price"], 354.07)
        self.assertAlmostEqual(quote["prev_close"], 349.08)
        self.assertEqual(quote["open"], 348.06)
        self.assertEqual(quote["high"], 354.4)
        self.assertEqual(quote["low"], 345.88)
        self.assertEqual(quote["volume"], 41266740)
        self.assertEqual(quote["currency"], "USD")
        # Sina reports Beijing time; UTC is eight hours earlier.
        self.assertEqual(quote["ts"], "2026-11-25T00:52:38Z")

        entry = channels.quote_entry(US_AAPL)
        row = channels._quote_row(entry, quote, NOW_ISO)
        self.assertEqual(row["series_id"], "INS:XNAS:AAPL")
        self.assertEqual(row["source_id"], "sina-finance")
        self.assertEqual(row["ts"], "2026-11-25T00:52:38Z")
        self.assertEqual(row["observed_at"], "2026-11-25T00:52:38Z")
        self.assertAlmostEqual(row["change_pct"], (354.07 - 349.08) / 349.08 * 100.0)

    def test_us_alternate_layout_is_reconciled(self) -> None:
        # A provider layout move: [5] prev_close, [6] open, [8] high, [7] low.
        fields = ["0.00"] * 12
        fields[0] = "苹果"
        fields[1] = "101.00"
        fields[2] = "1.00"
        fields[3] = "2026-11-25 10:00:00"
        fields[4] = "1.00"
        fields[5] = "100.00"
        fields[6] = "99.00"
        fields[7] = "98.00"
        fields[8] = "103.00"
        fields[10] = "500"
        quote = channels.parse_sina_us_fields(fields)
        self.assertAlmostEqual(quote["price"], 101.0)
        self.assertAlmostEqual(quote["prev_close"], 100.0)
        self.assertAlmostEqual(quote["open"], 99.0)
        self.assertAlmostEqual(quote["high"], 103.0)
        self.assertAlmostEqual(quote["low"], 98.0)
        self.assertAlmostEqual(quote["change_pct"], 1.0)

    def test_us_change_fallback_when_prev_close_missing(self) -> None:
        fields = us_quote_fields(prev_close="0.00")
        quote = channels.parse_sina_us_fields(fields)
        self.assertAlmostEqual(quote["prev_close"], 349.08)

    def test_hk_fields(self) -> None:
        quote = channels.parse_sina_hk_fields(HK_QUOTE_FIELDS)
        self.assertEqual(quote["price"], 341.6)
        self.assertEqual(quote["prev_close"], 344.0)
        self.assertEqual(quote["open"], 352.0)
        self.assertEqual(quote["high"], 353.0)
        self.assertEqual(quote["low"], 340.0)
        self.assertEqual(quote["volume"], 29393105.0)
        self.assertEqual(quote["currency"], "HKD")
        # 2026/11/24 16:08:15 Hong Kong time -> 08:08:15 UTC.
        self.assertEqual(quote["ts"], "2026-11-24T08:08:15Z")
        entry = channels.quote_entry(HK_TENCENT)
        row = channels._quote_row(entry, quote, NOW_ISO)
        self.assertAlmostEqual(row["change_pct"], (341.6 - 344.0) / 344.0 * 100.0)

    def test_index_fields(self) -> None:
        quote = channels.parse_sina_index_fields(INDEX_QUOTE_FIELDS, "USD")
        self.assertEqual(quote["price"], 46247.29)
        self.assertAlmostEqual(quote["prev_close"], 46247.29 - 299.97)
        self.assertEqual(quote["currency"], "USD")
        row = channels._quote_row(channels.quote_entry(IDX_GSPC), quote, NOW_ISO)
        self.assertAlmostEqual(row["change_pct"], 299.97 / (46247.29 - 299.97) * 100.0, places=3)
        hsi = channels.parse_sina_index_fields(["恒生指数", "22219.65", "-164.09", "-0.73"], "HKD")
        self.assertEqual(hsi["currency"], "HKD")
        self.assertGreater(hsi["prev_close"], hsi["price"])

    def test_futures_fields(self) -> None:
        quote = channels.parse_sina_futures_fields(FUTURES_QUOTE_FIELDS)
        self.assertAlmostEqual(quote["price"], 3578.985)
        self.assertAlmostEqual(quote["prev_close"], 3586.9)
        self.assertAlmostEqual(quote["high"], 3596.0)
        self.assertAlmostEqual(quote["low"], 3566.7)
        self.assertEqual(quote["currency"], "USD")
        self.assertEqual(quote["ts"], "2026-11-25T00:53:30Z")
        self.assertEqual(quote["name"], "纽约黄金")

    def test_invalid_price_is_none(self) -> None:
        fields = ["0.00"] * 12
        self.assertIsNone(channels.parse_sina_us_fields(fields))
        self.assertIsNone(channels.parse_sina_hk_fields(["x"] * 7))


# ---------------------------------------------------------------------------
# 4. Tencent quote parsing
# ---------------------------------------------------------------------------


class TencentQuoteParsingTests(CollectorTestCase):
    """Tencent quote body parsing and market currency mapping."""

    def test_parse_batch_text(self) -> None:
        body = tencent_batch(
            ("usAAPL", TENCENT_US_FIELDS),
            ("hk00700", TENCENT_HK_FIELDS),
            ("sh600519", TENCENT_CN_FIELDS),
        )
        parsed = channels.parse_tencent_quote_text(body)
        self.assertEqual(sorted(parsed), ["hk00700", "sh600519", "usAAPL"])
        self.assertEqual(parsed["usAAPL"][3], "354.07")

    def test_field_mapping(self) -> None:
        quote = channels.parse_tencent_fields(TENCENT_US_FIELDS, "USD")
        self.assertEqual(quote["price"], 354.07)
        self.assertEqual(quote["prev_close"], 349.08)
        self.assertEqual(quote["open"], 348.06)
        self.assertEqual(quote["volume"], 41266740)
        self.assertEqual(quote["currency"], "USD")
        # Tencent carries no provider time in the mapped fields: the collector
        # clock is used instead.
        entry = channels.quote_entry(US_AAPL)
        retry = channels._tencent_retry_entry(entry)
        row = channels._quote_row(retry, quote, NOW_ISO)
        self.assertEqual(row["source_id"], "tencent-finance")
        self.assertEqual(row["ts"], NOW_ISO)
        self.assertEqual(row["currency"], "USD")
        hk = channels.parse_tencent_fields(TENCENT_HK_FIELDS, "HKD")
        self.assertEqual(hk["price"], 341.6)
        self.assertEqual(hk["currency"], "HKD")
        cn = channels.parse_tencent_fields(TENCENT_CN_FIELDS, "CNY")
        self.assertEqual(cn["price"], 1460.0)
        self.assertEqual(cn["prev_close"], 1439.0)


# ---------------------------------------------------------------------------
# 5. CoinGecko / Frankfurter quote parsing
# ---------------------------------------------------------------------------


class CryptoFxQuoteParsingTests(CollectorTestCase):
    """CoinGecko simple prices and Frankfurter latest rates."""

    def test_coingecko_prices(self) -> None:
        quotes = channels.parse_coingecko_prices(COINGECKO_SIMPLE)
        self.assertEqual(sorted(quotes), ["bitcoin", "ethereum"])
        bitcoin = quotes["bitcoin"]
        self.assertAlmostEqual(bitcoin["price"], 59586.0)
        self.assertAlmostEqual(bitcoin["prev_close"], 59586.0 / (1 - 2.5969 / 100.0))
        self.assertAlmostEqual(bitcoin["change_pct"], -2.5969)
        self.assertEqual(bitcoin["currency"], "USD")
        row = channels._quote_row(channels.quote_entry(CRYPTO_BTC), bitcoin, NOW_ISO)
        self.assertEqual(row["series_id"], "INS:XCRY:BTC-USD")
        self.assertEqual(row["source_id"], "coingecko")
        self.assertAlmostEqual(row["change_pct"], -2.5969)
        self.assertEqual(channels.parse_coingecko_prices({}), {})

    def test_frankfurter_latest(self) -> None:
        self.assertAlmostEqual(
            channels.parse_frankfurter_latest(FRANKFURTER_LATEST_EUR, "USD"), 1.0963,
        )
        self.assertIsNone(channels.parse_frankfurter_latest(FRANKFURTER_LATEST_EUR, "JPY"))
        self.assertIsNone(channels.parse_frankfurter_latest({}, "USD"))


# ---------------------------------------------------------------------------
# 6. quote collection: selection, channels, fallback, isolation, dry run
# ---------------------------------------------------------------------------


def sina_quote_handler(**by_symbol: list[str]) -> Callable[[str, str, int], str]:
    """Handler answering Sina batch quotes from the given symbol fixtures."""

    def handler(source_id: str, url: str, number: int) -> str:
        symbols = url.split("list=", 1)[1].split(",") if "list=" in url else []
        lines = [sina_line(symbol, by_symbol[symbol]) for symbol in symbols if symbol in by_symbol]
        return "\n".join(lines) + "\n"

    return handler


def tencent_quote_handler(**by_symbol: list[str]) -> Callable[[str, str, int], str]:
    """Handler answering Tencent batch quotes from the given symbol fixtures."""

    def handler(source_id: str, url: str, number: int) -> str:
        symbols = url.split("q=", 1)[1].split(",") if "q=" in url else []
        lines = [tencent_line(symbol, by_symbol[symbol]) for symbol in symbols if symbol in by_symbol]
        return "\n".join(lines) + "\n"

    return handler


class QuoteSelectionTests(CollectorTestCase):
    """Staleness ordering (missing first, then oldest) and the per-run cap."""

    def test_selection_order_and_limit(self) -> None:
        self.seed_quote("INS:XNAS:AAPL", "2026-11-24T00:00:00Z")  # oldest
        self.seed_quote("INS:XNAS:MSFT", "2026-11-25T10:00:00Z")  # fresh
        # TSLA has no persisted quote: missing ranks first.
        worker = sina_quote_handler(
            gb_aapl=us_quote_fields(),
            gb_msft=us_quote_fields(last="496.13", change="3.63", prev_close="492.50"),
            gb_tsla=us_quote_fields(last="384.68", change="-0.78", prev_close="385.46"),
        )
        self.use_http(worker)
        result = channels.collect_quotes(self.context({
            "tracked_series": [US_AAPL, US_MSFT, US_TSLA],
            "channel_quote_limit": 2,
        }))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["details"]["symbols"], ["gb_tsla", "gb_aapl"],
        )
        self.assertEqual(result["details"]["selected"], 2)
        requested = self.http.calls[0]["url"]
        self.assertIn("gb_tsla", requested)
        self.assertIn("gb_aapl", requested)
        self.assertNotIn("gb_msft", requested)

    def test_limit_is_clamped(self) -> None:
        worker = sina_quote_handler(gb_aapl=us_quote_fields())
        self.use_http(worker)
        result = channels.collect_quotes(self.context({
            "tracked_series": [US_AAPL],
            "channel_quote_limit": 999,
            "channel_sina_batch": 0,
        }))
        self.assertEqual(result["details"]["quote_limit"], channels.MAX_QUOTE_LIMIT)
        self.assertEqual(result["details"]["batch_size"], 1)


class QuoteChannelTests(CollectorTestCase):
    """Per-channel requests, rows and source attribution."""

    def test_mixed_channels_write_quotes(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if source_id == channels.SINA_FINANCE:
                return sina_batch(
                    ("gb_aapl", us_quote_fields()),
                    ("rt_hk00700", HK_QUOTE_FIELDS),
                    ("int_sp500", ["标普指数", "6643.70", "38.98", "0.59"]),
                    ("hf_GC", FUTURES_QUOTE_FIELDS),
                )
            if source_id == channels.TENCENT_FINANCE:
                return tencent_batch(("sh600519", TENCENT_CN_FIELDS))
            if source_id == channels.COINGECKO:
                return json_bytes(COINGECKO_SIMPLE)
            if source_id == channels.FRANKFURTER:
                self.assertIn("from=EUR", url)
                return json_bytes(FRANKFURTER_LATEST_EUR)
            self.fail(f"unexpected source {source_id}")

        self.use_http(handler)
        result = channels.collect_quotes(self.context({
            "tracked_series": [
                US_AAPL, HK_TENCENT, CN_MOUTAI, IDX_GSPC, FUT_GC, CRYPTO_BTC, FX_EURUSD,
            ],
        }))
        self.assertEqual(result["stored"], 7)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["skipped"], 0)
        detail = result["details"]["channels"]
        self.assertEqual(detail[channels.SINA_FINANCE]["quotes"], 4)
        self.assertEqual(detail[channels.TENCENT_FINANCE]["quotes"], 1)
        self.assertEqual(detail[channels.COINGECKO]["quotes"], 1)
        self.assertEqual(detail[channels.FRANKFURTER]["quotes"], 1)
        self.assertEqual(detail[channels.SINA_FINANCE]["requests"], 1)
        self.assertEqual(detail[channels.FRANKFURTER]["requests"], 1)

        us = self.warehouse.get_quote_latest("INS:XNAS:AAPL")
        self.assertEqual(us["source_id"], "sina-finance")
        self.assertEqual(us["currency"], "USD")
        self.assertEqual(us["ts"], "2026-11-25T00:52:38Z")
        hk = self.warehouse.get_quote_latest("INS:XHKG:0700")
        self.assertEqual(hk["source_id"], "sina-finance")
        self.assertEqual(hk["currency"], "HKD")
        cn = self.warehouse.get_quote_latest("INS:XSHG:600519")
        self.assertEqual(cn["source_id"], "tencent-finance")
        self.assertEqual(cn["currency"], "CNY")
        crypto = self.warehouse.get_quote_latest("INS:XCRY:BTC-USD")
        self.assertEqual(crypto["source_id"], "coingecko")
        fx = self.warehouse.get_quote_latest("INS:XFXS:EURUSD=X")
        self.assertEqual(fx["source_id"], "frankfurter")
        self.assertAlmostEqual(fx["price"], 1.0963)
        self.assertEqual(fx["prev_close"], fx["price"])
        self.assertEqual(fx["change_pct"], 0.0)
        index = self.warehouse.get_quote_latest("IDX:GSPC")
        self.assertEqual(index["source_id"], "sina-finance")
        self.assertEqual(index["ts"], NOW_ISO)

    def test_frankfurter_groups_by_request_base(self) -> None:
        requests: list[str] = []

        def handler(source_id: str, url: str, number: int) -> bytes:
            self.assertEqual(source_id, channels.FRANKFURTER)
            requests.append(url)
            if "from=EUR" in url:
                return json_bytes(FRANKFURTER_LATEST_EUR)
            self.assertIn("from=USD", url)
            return json_bytes(FRANKFURTER_LATEST_USD)

        self.use_http(handler)
        result = channels.collect_quotes(self.context({
            "tracked_series": [FX_EURUSD, FX_USDEUR, FX_EURGBP],
        }))
        self.assertEqual(result["stored"], 2)
        self.assertEqual(len(requests), 2, requests)
        eur = self.warehouse.get_quote_latest("INS:XFXS:EURUSD=X")
        usd = self.warehouse.get_quote_latest("INS:XFXS:USDEUR=X")
        self.assertAlmostEqual(eur["price"], 1.0963)
        self.assertEqual(eur["currency"], "USD")
        self.assertAlmostEqual(usd["price"], 0.9121)
        self.assertEqual(usd["currency"], "EUR")
        self.assertEqual(result["details"]["channels"][channels.FRANKFURTER]["requests"], 2)


class QuoteFallbackTests(CollectorTestCase):
    """Sina misses fall back to Tencent; channel failures stay isolated."""

    def test_sina_failure_falls_back_to_tencent(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if source_id == channels.SINA_FINANCE:
                raise DataSourceError("sina down")
            if source_id == channels.TENCENT_FINANCE:
                return tencent_batch(("usAAPL", TENCENT_US_FIELDS))
            self.fail(f"unexpected source {source_id}")

        self.use_http(handler)
        result = channels.collect_quotes(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "ok")
        quote = self.warehouse.get_quote_latest("INS:XNAS:AAPL")
        self.assertEqual(quote["source_id"], "tencent-finance")
        self.assertAlmostEqual(quote["price"], 354.07)
        errors = result["details"]["errors"]
        self.assertEqual(errors[0]["channel"], channels.SINA_FINANCE)
        self.assertEqual(errors[0]["reason"], "source_unavailable")
        self.assertEqual(result["details"]["channels"][channels.TENCENT_FINANCE]["quotes"], 1)

    def test_every_channel_failing_is_partial(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            raise DataSourceError(f"{source_id} down")

        self.use_http(handler)
        result = channels.collect_quotes(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "partial")
        self.assertGreaterEqual(result["skipped"], 1)
        self.assertGreaterEqual(len(result["details"]["errors"]), 1)

    def test_one_failed_channel_does_not_hide_others(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if source_id == channels.SINA_FINANCE:
                return sina_batch(("gb_aapl", us_quote_fields()))
            if source_id == channels.COINGECKO:
                raise DataSourceError("coingecko down")
            self.fail(f"unexpected source {source_id}")

        self.use_http(handler)
        result = channels.collect_quotes(self.context({
            "tracked_series": [US_AAPL, CRYPTO_BTC],
        }))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 1)
        self.assertIsNotNone(self.warehouse.get_quote_latest("INS:XNAS:AAPL"))
        self.assertIsNone(self.warehouse.get_quote_latest("INS:XCRY:BTC-USD"))
        self.assertEqual(
            result["details"]["errors"][0]["channel"], channels.COINGECKO,
        )

    def test_rate_limited_channel_is_isolated(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if source_id == channels.SINA_FINANCE:
                raise SourceRateLimitedError("slow down", retry_after_s=5)
            if source_id == channels.TENCENT_FINANCE:
                return tencent_batch(("usAAPL", TENCENT_US_FIELDS))
            self.fail(f"unexpected source {source_id}")

        self.use_http(handler)
        result = channels.collect_quotes(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 1)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["errors"][0]["reason"], "rate_limited")


class QuoteDryRunTests(CollectorTestCase):
    """A dry run plans the batches but touches neither network nor warehouse."""

    def test_dry_run_quotes(self) -> None:
        self.use_http(lambda *args: self.fail(f"dry run fetched {args[1]}"))
        result = channels.collect_quotes(self.context({
            "tracked_series": [US_AAPL, CRYPTO_BTC],
            "dry_run": True,
        }))
        self.assertEqual(self.http.calls, [])
        self.assertEqual(self.warehouse.get_quote_latest("INS:XNAS:AAPL"), None)
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(
            result["details"]["channels"][channels.SINA_FINANCE]["symbols"], ["gb_aapl"],
        )
        self.assertEqual(
            result["details"]["channels"][channels.COINGECKO]["symbols"], ["bitcoin"],
        )


# ---------------------------------------------------------------------------
# 7. daily-bar parsing
# ---------------------------------------------------------------------------


class EodParsingTests(CollectorTestCase):
    """Daily-bar payload parsers for all four channels."""

    def test_sina_us_daily_jsonp(self) -> None:
        rows = channels.parse_sina_us_daily(jsonp("AAPL", SINA_US_DAILY_ROWS))
        self.assertEqual([row["date"] for row in rows], ["2026-11-20", "2026-11-21", "2026-11-24"])
        self.assertAlmostEqual(rows[-1]["close"], 354.07)
        self.assertAlmostEqual(rows[-1]["open"], 348.06)
        self.assertAlmostEqual(rows[-1]["volume"], 41267141.0)
        self.assertEqual(channels.parse_sina_us_daily(""), [])

    def test_tencent_kline(self) -> None:
        rows = channels.parse_tencent_kline(TENCENT_US_KLINE, "usAAPL.OQ")
        self.assertEqual([row["date"] for row in rows], ["2026-11-20", "2026-11-24"])
        self.assertAlmostEqual(rows[-1]["open"], 348.06)
        self.assertAlmostEqual(rows[-1]["close"], 354.07)
        self.assertAlmostEqual(rows[-1]["high"], 354.40)
        self.assertAlmostEqual(rows[-1]["low"], 345.88)
        self.assertAlmostEqual(rows[-1]["volume"], 41267141.0)
        # ``qfqday`` key and an unexpected data key (lookup falls back to it).
        cn_rows = channels.parse_tencent_kline(TENCENT_CN_KLINE, "sh600519")
        self.assertEqual(len(cn_rows), 2)
        self.assertAlmostEqual(cn_rows[-1]["close"], 1460.0)
        self.assertEqual(channels.parse_tencent_kline({"data": {}}, "x"), [])

    def test_coingecko_chart(self) -> None:
        rows = channels.parse_coingecko_chart(COINGECKO_CHART)
        self.assertEqual([row["date"] for row in rows], ["2026-11-20", "2026-11-21", "2026-11-24"])
        last = rows[-1]
        self.assertAlmostEqual(last["open"], 90.0)
        self.assertAlmostEqual(last["high"], 95.0)
        self.assertAlmostEqual(last["low"], 90.0)
        self.assertAlmostEqual(last["close"], 95.0)
        self.assertAlmostEqual(last["volume"], 1200.0)
        # Missing volumes fall back to zero.
        rows = channels.parse_coingecko_chart({"prices": [[epoch_ms("2026-11-24"), 10.0]]})
        self.assertEqual(rows[0]["volume"], 0.0)
        self.assertEqual(channels.parse_coingecko_chart({}), [])

    def test_frankfurter_series(self) -> None:
        rows = channels.parse_frankfurter_series(FRANKFURTER_SERIES, "USD")
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["date"], "2026-11-18")
        self.assertAlmostEqual(rows[-1]["close"], 1.0963)
        self.assertEqual(rows[-1]["open"], rows[-1]["close"])
        self.assertEqual(rows[-1]["volume"], 0.0)
        self.assertEqual(channels.parse_frankfurter_series(FRANKFURTER_SERIES, "JPY"), [])


# ---------------------------------------------------------------------------
# 8. EOD collection
# ---------------------------------------------------------------------------


def eod_router(handler_map: dict[str, Callable[[str], Any]]) -> Callable[[str, str, int], Any]:
    """Route EOD requests by a URL keyword to a response factory."""

    def handler(source_id: str, url: str, number: int) -> Any:
        for keyword, factory in handler_map.items():
            if keyword in url:
                return factory(url)
        raise AssertionError(f"unexpected EOD request: {source_id} {url}")

    return handler


class EodCollectorTests(CollectorTestCase):
    """Daily-bar collectors, freshness selection, fallback and stop behaviour."""

    def test_us_sina_history_writes_final_bars(self) -> None:
        self.use_http(eod_router({
            "US_MinKService": lambda url: jsonp("AAPL", SINA_US_DAILY_ROWS),
        }))
        result = channels.collect_eod(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["status"], "ok")
        bars = self.warehouse.get_bars("INS:XNAS:AAPL", "1d")
        self.assertEqual([bar["ts"] for bar in bars], ["2026-11-20", "2026-11-21", "2026-11-24"])
        self.assertEqual(bars[-1]["source_id"], "sina-finance")
        self.assertEqual(bars[-1]["quality"], "final")
        self.assertAlmostEqual(bars[-1]["close"], 354.07)
        self.assertEqual(result["details"]["channels"][channels.SINA_FINANCE]["bars"], 3)

    def test_hk_and_a_share_use_tencent_kline(self) -> None:
        def handler(source_id: str, url: str, number: int) -> bytes:
            self.assertEqual(source_id, channels.TENCENT_FINANCE)
            if "hk00700" in url:
                return json_bytes(TENCENT_HK_KLINE)
            self.assertIn("sh600519", url)
            return json_bytes(TENCENT_CN_KLINE)

        self.use_http(handler)
        result = channels.collect_eod(self.context({"tracked_series": [HK_TENCENT, CN_MOUTAI]}))
        self.assertEqual(result["stored"], 4)
        hk = self.warehouse.get_bars("INS:XHKG:0700", "1d")
        cn = self.warehouse.get_bars("INS:XSHG:600519", "1d")
        self.assertEqual(hk[-1]["source_id"], "tencent-finance")
        self.assertAlmostEqual(hk[-1]["close"], 341.6)
        self.assertAlmostEqual(cn[-1]["close"], 1460.0)
        self.assertEqual(len(self.http.calls), 2)

    def test_crypto_uses_coingecko_chart(self) -> None:
        def handler(source_id: str, url: str, number: int) -> bytes:
            self.assertEqual(source_id, channels.COINGECKO)
            self.assertIn("/coins/bitcoin/market_chart", url)
            self.assertIn("days=365", url)
            return json_bytes(COINGECKO_CHART)

        self.use_http(handler)
        result = channels.collect_eod(self.context({"tracked_series": [CRYPTO_BTC]}))
        self.assertEqual(result["stored"], 3)
        bars = self.warehouse.get_bars("INS:XCRY:BTC-USD", "1d")
        self.assertEqual(bars[-1]["source_id"], "coingecko")
        self.assertAlmostEqual(bars[-1]["close"], 95.0)

    def test_fx_uses_frankfurter_series(self) -> None:
        def handler(source_id: str, url: str, number: int) -> bytes:
            self.assertEqual(source_id, channels.FRANKFURTER)
            self.assertIn("2025-11-25..2026-11-25", url)
            self.assertIn("from=EUR", url)
            self.assertIn("to=USD", url)
            return json_bytes(FRANKFURTER_SERIES)

        self.use_http(handler)
        result = channels.collect_eod(self.context({"tracked_series": [FX_EURUSD]}))
        self.assertEqual(result["stored"], 5)
        bars = self.warehouse.get_bars("INS:XFXS:EURUSD=X", "1d")
        self.assertEqual(bars[-1]["source_id"], "frankfurter")
        self.assertEqual(bars[-1]["quality"], "final")
        self.assertAlmostEqual(bars[-1]["close"], 1.0963)

    def test_us_falls_back_to_tencent_history(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            if source_id == channels.SINA_FINANCE:
                raise DataSourceError("sina history down")
            self.assertEqual(source_id, channels.TENCENT_FINANCE)
            self.assertIn("usAAPL.OQ", url)
            return json_bytes(TENCENT_US_KLINE)

        self.use_http(handler)
        result = channels.collect_eod(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 2)
        self.assertEqual(result["status"], "ok")
        bars = self.warehouse.get_bars("INS:XNAS:AAPL", "1d")
        self.assertEqual(bars[-1]["source_id"], "tencent-finance")
        self.assertAlmostEqual(bars[-1]["close"], 354.07)

    def test_sina_us_history_is_bounded(self) -> None:
        rows = daily_rows(channels.SINA_US_MAX_BARS + 50)
        self.use_http(eod_router({
            "US_MinKService": lambda url: jsonp("AAPL", rows),
        }))
        result = channels.collect_eod(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], channels.SINA_US_MAX_BARS)
        bars = self.warehouse.get_bars("INS:XNAS:AAPL", "1d", limit=1000)
        self.assertEqual(len(bars), channels.SINA_US_MAX_BARS)
        self.assertEqual(bars[-1]["ts"], "2026-11-24")

    def test_fresh_series_is_not_fetched(self) -> None:
        self.seed_bar("INS:XNAS:AAPL", TODAY)
        self.use_http(lambda *args: self.fail(f"fresh series fetched {args[1]}"))
        result = channels.collect_eod(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(self.http.calls, [])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["details"]["selected"], 0)
        self.assertEqual(result["details"]["fresh"], ["INS:XNAS:AAPL"])

    def test_second_write_is_idempotent(self) -> None:
        # The fixture's newest bar is older than yesterday, so both runs are
        # stale and re-upsert exactly the same rows: the warehouse count stays.
        old_rows = [
            {"d": "2026-11-18", "o": "350.00", "h": "352.00", "l": "348.00",
             "c": "351.00", "v": "100"},
            {"d": "2026-11-19", "o": "351.00", "h": "353.00", "l": "350.00",
             "c": "352.00", "v": "200"},
            {"d": "2026-11-20", "o": "352.87", "h": "354.34", "l": "340.56",
             "c": "342.56", "v": "80692545"},
        ]
        self.use_http(eod_router({
            "US_MinKService": lambda url: jsonp("AAPL", old_rows),
        }))
        settings = {"tracked_series": [US_AAPL]}
        first = channels.collect_eod(self.context(settings))
        second = channels.collect_eod(self.context(settings))
        self.assertEqual(first["stored"], 3)
        self.assertEqual(second["stored"], 3)
        bars = self.warehouse.get_bars("INS:XNAS:AAPL", "1d")
        self.assertEqual(len(bars), 3)
        self.assertAlmostEqual(bars[-1]["close"], 342.56)
        self.assertEqual(len(self.http.calls), 2)

    def test_stale_order_and_cap(self) -> None:
        self.seed_bar("INS:XNAS:AAPL", "2026-11-20")
        self.seed_bar("INS:XNAS:MSFT", "2026-11-18")
        self.seed_bar("INS:XNAS:TSLA", "2026-11-19")
        self.use_http(eod_router({
            "US_MinKService": lambda url: jsonp("AAPL", SINA_US_DAILY_ROWS),
        }))
        result = channels.collect_eod(self.context({
            "tracked_series": [US_AAPL, US_MSFT, US_TSLA],
            "channel_eod_limit": 2,
        }))
        self.assertEqual(result["details"]["selected"], 2)
        self.assertEqual(result["details"]["symbols"], ["MSFT", "TSLA"])
        self.assertEqual(result["details"]["deferred"], ["INS:XNAS:AAPL"])

    def test_unsupported_kinds_are_reported(self) -> None:
        self.use_http(lambda *args: self.fail(f"unsupported fetched {args[1]}"))
        result = channels.collect_eod(self.context({
            "tracked_series": [IDX_GSPC, FUT_GC],
        }))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            result["details"]["unsupported"], ["COM:XCEC:GC", "IDX:GSPC"],
        )

    def test_rate_limit_stops_cleanly(self) -> None:
        calls = {"count": 0}

        def handler(source_id: str, url: str, number: int) -> Any:
            self.assertEqual(source_id, channels.SINA_FINANCE)
            calls["count"] += 1
            if calls["count"] == 1:
                return jsonp("AAPL", SINA_US_DAILY_ROWS)
            raise SourceRateLimitedError("quota exhausted", retry_after_s=30)

        self.use_http(handler)
        result = channels.collect_eod(self.context({
            "tracked_series": [US_AAPL, US_MSFT, US_TSLA],
        }))
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["stopped"], "rate_limited")
        self.assertEqual(result["details"]["unprocessed"], ["INS:XNAS:TSLA"])
        self.assertEqual(calls["count"], 2)
        self.assertIsNotNone(self.warehouse.get_bars("INS:XNAS:AAPL", "1d"))

    def test_per_symbol_failure_is_recorded(self) -> None:
        def handler(source_id: str, url: str, number: int) -> Any:
            raise DataSourceError(f"{source_id} history down")

        self.use_http(handler)
        result = channels.collect_eod(self.context({"tracked_series": [US_AAPL]}))
        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["details"]["failed"][0]["series_id"], "INS:XNAS:AAPL")
        self.assertGreaterEqual(result["skipped"], 1)

    def test_dry_run_eod(self) -> None:
        self.use_http(lambda *args: self.fail(f"dry run fetched {args[1]}"))
        result = channels.collect_eod(self.context({
            "tracked_series": [US_AAPL, HK_TENCENT, CRYPTO_BTC, FX_EURUSD],
            "dry_run": True,
        }))
        self.assertEqual(self.http.calls, [])
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(
            result["details"]["channels"][channels.SINA_FINANCE]["symbols"], ["AAPL"],
        )
        self.assertEqual(
            result["details"]["channels"][channels.TENCENT_FINANCE]["symbols"], ["hk00700"],
        )
        self.assertEqual(
            result["details"]["channels"][channels.COINGECKO]["symbols"], ["bitcoin"],
        )
        self.assertEqual(
            result["details"]["channels"][channels.FRANKFURTER]["symbols"], ["EUR/USD"],
        )

    def test_empty_universe_is_a_clean_noop(self) -> None:
        result = channels.collect_quotes(self.context({}))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["reason"], "no tracked series")
        self.assertEqual(self.http.calls, [])
        result = channels.collect_eod(self.context({"tracked_series": []}))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["details"]["reason"], "no tracked series")


if __name__ == "__main__":
    unittest.main()
