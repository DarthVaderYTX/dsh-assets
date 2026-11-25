"""Tests for the Yahoo Finance provider against a local HTTP stub (offline)."""

from __future__ import annotations

import http.server
import json
import os
import socket
import sys
import threading
import unittest
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.errors import InvalidArgumentError, ProviderUnavailableError
from market_monitor.providers import get_provider, resolve_provider
from market_monitor.providers.synthetic import SyntheticProvider
from market_monitor.providers.yahoo import YahooProvider

#: Number of daily rows the stub serves for every daily chart request.
DAILY_ROW_COUNT = 40
#: Row the stub turns into an all-null row so tests prove nulls are dropped.
NULL_ROW_INDEX = 20
#: First stub daily timestamp (2023-11-14T22:13:20Z).
DAILY_BASE_EPOCH = 1_700_000_000


def _daily_rows() -> list[dict]:
    """Return the deterministic ascending daily rows behind the stub payload."""
    rows: list[dict] = []
    for index in range(DAILY_ROW_COUNT):
        timestamp = DAILY_BASE_EPOCH + index * 86_400
        label = datetime.fromtimestamp(
            timestamp, tz=timezone.utc
        ).strftime("%Y-%m-%d")
        close = 100.0 + index
        rows.append(
            {
                "ts": timestamp,
                "t": label,
                "o": close - 1.0,
                "h": close + 2.0,
                "l": close - 3.0,
                "c": close,
                "v": 1000.0 * (index + 1),
            }
        )
    return rows


def _valid_daily_rows() -> list[dict]:
    """Daily rows that survive the null-row filtering."""
    return [
        row
        for index, row in enumerate(_daily_rows())
        if index != NULL_ROW_INDEX
    ]


#: Keys of the API bar contract (the stub rows also carry a raw ``ts``).
_BAR_KEYS = ("t", "o", "h", "l", "c", "v")


def _as_bar(row: dict) -> dict:
    """Project a stub row onto the API bar contract."""
    return {key: row[key] for key in _BAR_KEYS}


def _as_bars(rows: list[dict]) -> list[dict]:
    """Project stub rows onto API bars."""
    return [_as_bar(row) for row in rows]


def _expected_intraday_bars() -> list[dict]:
    """Return the stub's intraday bars after the all-null row is dropped."""
    return [
        {
            "t": "2023-11-14T22:13:20Z",
            "o": 228.9,
            "h": 229.5,
            "l": 228.3,
            "c": 228.9,
            "v": 1000.0,
        },
        {
            "t": "2023-11-14T22:18:20Z",
            "o": 229.4,
            "h": 230.1,
            "l": 228.7,
            "c": 229.8,
            "v": 1200.0,
        },
        {
            "t": "2023-11-14T22:28:20Z",
            "o": 231.0,
            "h": 232.1,
            "l": 230.5,
            "c": 231.45,
            "v": 1500.0,
        },
    ]


def _chart_payload(symbol: str, yahoo_range: str, interval: str) -> dict:
    """Build a canned Yahoo chart payload.

    Intraday payloads include one all-null row so tests can prove null rows are
    dropped; daily payloads are a 40-row ascending series with one null row.
    """
    if interval in ("5m", "30m"):
        timestamps = [1700000000, 1700000300, 1700000600, 1700000900]
        opens = [228.9, 229.4, None, 231.0]
        highs = [229.5, 230.1, None, 232.1]
        lows = [228.3, 228.7, None, 230.5]
        closes = [228.9, 229.8, None, 231.45]
        volumes = [1_000, 1_200, None, 1_500]
    else:
        rows = _daily_rows()
        timestamps = []
        opens, highs, lows, closes, volumes = [], [], [], [], []
        for index, row in enumerate(rows):
            timestamps.append(row["ts"])
            if index == NULL_ROW_INDEX:
                opens.append(None)
                highs.append(None)
                lows.append(None)
                closes.append(None)
                volumes.append(None)
                continue
            opens.append(row["o"])
            highs.append(row["h"])
            lows.append(row["l"])
            closes.append(row["c"])
            volumes.append(row["v"])
    return {
        "chart": {
            "result": [
                {
                    "meta": {
                        "symbol": symbol,
                        "regularMarketPrice": 231.45,
                        "chartPreviousClose": 228.9,
                        "previousClose": 228.9,
                        "regularMarketOpen": 229.4,
                        "regularMarketDayHigh": 232.1,
                        "regularMarketDayLow": 228.6,
                        "regularMarketVolume": 51_234_000,
                        "currency": "USD",
                        "fullExchangeName": "NasdaqGS",
                        "exchangeName": "NMS",
                        "instrumentType": "EQUITY",
                        "shortName": "Apple Inc.",
                        "marketState": "REGULAR",
                        "regularMarketTime": 1700000900,
                    },
                    "timestamp": timestamps,
                    "indicators": {
                        "quote": [
                            {
                                "open": opens,
                                "high": highs,
                                "low": lows,
                                "close": closes,
                                "volume": volumes,
                            }
                        ]
                    },
                }
            ],
            "error": None,
        }
    }


class _StubHandler(http.server.BaseHTTPRequestHandler):
    """Serve canned chart JSON for any symbol except the failure sentinels."""

    requests: list[urllib.parse.SplitResult] = []

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        """Silence the default stderr logging of the stub server."""

    def _send(self, status: int, payload: object) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        parsed = urllib.parse.urlsplit(self.path)
        type(self).requests.append(parsed)
        parts = [part for part in parsed.path.split("/") if part]
        symbol = urllib.parse.unquote(parts[-1]) if parts else ""
        query = urllib.parse.parse_qs(parsed.query)
        if symbol == "BROKEN":
            self._send(500, {"error": "boom"})
            return
        if symbol == "NODATA":
            self._send(
                200,
                {
                    "chart": {
                        "result": None,
                        "error": {"code": "Not Found", "description": "No data found"},
                    }
                },
            )
            return
        interval = (query.get("interval") or ["1d"])[0]
        yahoo_range = (query.get("range") or ["1d"])[0]
        self._send(200, _chart_payload(symbol, yahoo_range, interval))


def _closed_port() -> int:
    """Return a localhost port that is currently closed."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])
    finally:
        sock.close()


class YahooProviderTests(unittest.TestCase):
    """Quote/history parsing and failure handling for the Yahoo adapter."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
        cls.httpd.daemon_threads = True
        cls.port = int(cls.httpd.server_address[1])
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"
        cls.closed_url = f"http://127.0.0.1:{_closed_port()}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def setUp(self) -> None:
        _StubHandler.requests = []
        self.provider = YahooProvider(
            base_url=self.base_url, timeout=2.0, probe_timeout=1.0
        )

    def test_available_probes_spy(self) -> None:
        self.assertTrue(self.provider.available())
        self.assertTrue(self.provider.available())
        spy_requests = [
            request for request in _StubHandler.requests if request.path.endswith("/SPY")
        ]
        self.assertEqual(len(spy_requests), 1)  # cached for 60 s
        self.assertIsNone(self.provider.last_probe_error)

    def test_quote_fields(self) -> None:
        quote = self.provider.quote("AAPL")
        self.assertEqual(quote["symbol"], "AAPL")
        self.assertEqual(quote["name"], "Apple Inc.")
        self.assertEqual(quote["currency"], "USD")
        self.assertEqual(quote["type"], "stock")
        self.assertEqual(quote["sector"], "Technology")
        self.assertAlmostEqual(quote["price"], 231.45)
        self.assertAlmostEqual(quote["prev_close"], 228.9)
        self.assertAlmostEqual(quote["change"], 2.55)
        self.assertAlmostEqual(quote["change_pct"], 2.55 / 228.9 * 100.0)
        self.assertEqual(quote["market_state"], "open")
        self.assertEqual(quote["source"], "yahoo")
        self.assertEqual(quote["as_of"], "2023-11-14T22:28:20Z")

    # ------------------------------------------------------------------
    # Conventional chart windows
    # ------------------------------------------------------------------
    def test_history_requests_conventional_chart_windows(self) -> None:
        expected = {
            "LIVE": ("1d", "5m"),
            "1D": ("1d", "5m"),
            "5D": ("5d", "30m"),
            "1M": ("1y", "1d"),
            "3M": ("1y", "1d"),
            "6M": ("1y", "1d"),
            "1Y": ("5y", "1d"),
        }
        for range_name, (yahoo_range, interval) in expected.items():
            payload = self.provider.history("AAPL", range_name)
            self.assertEqual(payload["interval"], interval, range_name)
            query = urllib.parse.parse_qs(_StubHandler.requests[-1].query)
            self.assertEqual(query["range"], [yahoo_range], range_name)
            self.assertEqual(query["interval"], [interval], range_name)

    def test_history_daily_window_drops_null_rows(self) -> None:
        payload = self.provider.history("AAPL", "1M")
        self.assertEqual(payload["interval"], "1d")
        bars = payload["bars"]
        self.assertEqual(len(bars), 22)
        self.assertEqual(bars, _as_bars(_valid_daily_rows()[-22:]))
        for bar in bars:
            self.assertNotIn("T", bar["t"])
            self.assertEqual(len(bar["t"]), 10)
            self.assertIsNotNone(bar["c"])
        labels = [bar["t"] for bar in bars]
        self.assertEqual(labels, sorted(labels))
        self.assertEqual(len(set(labels)), len(labels))

    def test_history_intraday_window_drops_null_rows(self) -> None:
        payload = self.provider.history("AAPL", "1D")
        self.assertEqual(payload["interval"], "5m")
        bars = payload["bars"]
        self.assertEqual(len(bars), 3)  # the all-null stub row is dropped
        self.assertEqual(bars, _expected_intraday_bars())
        self.assertIn("T", bars[-1]["t"])

    def test_history_five_day_is_thirty_minute_bars(self) -> None:
        payload = self.provider.history("AAPL", "5D")
        self.assertEqual(payload["interval"], "30m")
        bars = payload["bars"]
        # The stub serves the same intraday payload for any intraday range.
        self.assertEqual(bars, _expected_intraday_bars())
        self.assertTrue(all("T" in bar["t"] for bar in bars))
        self.assertEqual([bar["t"] for bar in bars], sorted(bar["t"] for bar in bars))

    def test_daily_ranges_return_fixed_daily_windows(self) -> None:
        rows = _valid_daily_rows()
        cases = {"1M": 22, "3M": 66, "6M": 132, "1Y": 252}
        for range_name, count in cases.items():
            payload = self.provider.history("AAPL", range_name)
            self.assertEqual(payload["interval"], "1d", range_name)
            self.assertEqual(payload["bars"], _as_bars(rows[-count:]), range_name)
            self.assertEqual(payload["bars"][-1]["t"], rows[-1]["t"], range_name)
        # The stub serves 39 usable daily rows, so the longer windows return
        # the whole available series instead of inventing missing bars.
        for range_name in ("3M", "6M", "1Y"):
            self.assertEqual(
                len(self.provider.history("AAPL", range_name)["bars"]),
                len(rows),
                range_name,
            )

    # ------------------------------------------------------------------
    # Daily-history source used by the service
    # ------------------------------------------------------------------
    def test_history_daily_returns_requested_tail(self) -> None:
        bars = self.provider.history_daily("AAPL", 252)
        self.assertEqual(bars, _as_bars(_valid_daily_rows()[-252:]))
        short = self.provider.history_daily("AAPL", 10)
        self.assertEqual(len(short), 10)
        self.assertEqual(short, _as_bars(_valid_daily_rows()[-10:]))
        query = urllib.parse.parse_qs(_StubHandler.requests[-1].query)
        self.assertEqual(query["range"], ["1y"])
        self.assertEqual(query["interval"], ["1d"])

    def test_history_daily_validates_lookback(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.provider.history_daily("AAPL", 0)
        with self.assertRaises(InvalidArgumentError):
            self.provider.history_daily("AAPL", "soon")  # type: ignore[arg-type]

    def test_invalid_range_is_rejected_before_network(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            self.provider.history("AAPL", "2Y")
        self.assertEqual(_StubHandler.requests, [])

    def test_unreachable_provider_fails_cleanly(self) -> None:
        provider = YahooProvider(
            base_url=self.closed_url, timeout=0.5, probe_timeout=0.5
        )
        self.assertFalse(provider.available())
        self.assertIsNotNone(provider.last_probe_error)
        with self.assertRaises(ProviderUnavailableError) as context:
            provider.quote("AAPL")
        self.assertEqual(context.exception.status, 503)
        self.assertFalse(context.exception.symbol_level)
        with self.assertRaises(ProviderUnavailableError):
            provider.history("AAPL", "1Y")
        with self.assertRaises(ProviderUnavailableError):
            provider.history_daily("AAPL", 252)

    def test_http_error_marks_provider_unavailable(self) -> None:
        with self.assertRaises(ProviderUnavailableError) as context:
            self.provider.quote("BROKEN")
        self.assertFalse(context.exception.symbol_level)
        self.assertIn("500", context.exception.message)
        with self.assertRaises(ProviderUnavailableError) as context:
            self.provider.history_daily("BROKEN", 252)
        self.assertFalse(context.exception.symbol_level)

    def test_no_data_marks_symbol_level_failure(self) -> None:
        with self.assertRaises(ProviderUnavailableError) as context:
            self.provider.quote("NODATA")
        self.assertTrue(context.exception.symbol_level)
        with self.assertRaises(ProviderUnavailableError) as context:
            self.provider.history("NODATA", "1Y")
        self.assertTrue(context.exception.symbol_level)
        with self.assertRaises(ProviderUnavailableError) as context:
            self.provider.history_daily("NODATA", 252)
        self.assertTrue(context.exception.symbol_level)


class ProviderResolutionTests(unittest.TestCase):
    """Provider registry and auto/explicit fallback behaviour."""

    def test_get_provider_synthetic(self) -> None:
        provider = get_provider("synthetic")
        self.assertIsInstance(provider, SyntheticProvider)
        self.assertFalse(provider.live)

    def test_auto_keeps_real_provider_when_yahoo_is_unreachable(self) -> None:
        selection = resolve_provider(
            "auto",
            yahoo_kwargs={"base_url": f"http://127.0.0.1:{_closed_port()}", "probe_timeout": 0.5},
        )
        self.assertEqual(selection.requested, "auto")
        self.assertEqual(selection.provider.name, "yahoo")
        self.assertTrue(selection.degraded)
        self.assertIsNotNone(selection.last_error)

    def test_explicit_yahoo_outage_is_degraded_not_simulated(self) -> None:
        selection = resolve_provider(
            "yahoo",
            yahoo_kwargs={"base_url": f"http://127.0.0.1:{_closed_port()}", "probe_timeout": 0.5},
        )
        self.assertEqual(selection.provider.name, "yahoo")
        self.assertTrue(selection.degraded)
        self.assertIsNotNone(selection.last_error)

    def test_invalid_provider_name(self) -> None:
        with self.assertRaises(InvalidArgumentError):
            resolve_provider("bogus")


if __name__ == "__main__":
    unittest.main()
