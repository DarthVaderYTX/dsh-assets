"""HTTP API tests against an in-process ThreadingHTTPServer."""

from __future__ import annotations

import http.client
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import MarketMonitorService
from market_monitor.catalog import DEFAULT_WATCHLIST
from market_monitor.http_api import MAX_BODY_BYTES, create_http_server

TOKEN = "test-token-0123456789"


class ApiTestCase(unittest.TestCase):
    """End-to-end HTTP tests over a real localhost socket."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.service = MarketMonitorService(
            data_dir=cls.tmp.name, provider="synthetic", poll_seconds=15
        )
        cls.httpd = create_http_server(cls.service, token=TOKEN, port=0)
        cls.shutdown_event = threading.Event()

        def _stop_server() -> None:
            cls.shutdown_event.set()
            cls.httpd.shutdown()

        cls.httpd.shutdown_callback = _stop_server
        cls.thread = threading.Thread(
            target=cls.httpd.serve_forever,
            kwargs={"poll_interval": 0.05},
            daemon=True,
        )
        cls.thread.start()
        cls.port = int(cls.httpd.server_address[1])
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.thread.is_alive():
            cls.httpd.shutdown()
        cls.thread.join(timeout=5)
        cls.httpd.server_close()
        cls.service.close()
        cls.tmp.cleanup()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def request(
        self,
        method: str,
        path: str,
        body: object | None = None,
        token: str | None = TOKEN,
        raw: bytes | None = None,
    ) -> tuple[int, object, dict]:
        """Perform one HTTP request and decode the JSON body."""
        data = raw if raw is not None else (
            json.dumps(body).encode("utf-8") if body is not None else None
        )
        request = urllib.request.Request(self.base + path, data=data, method=method)
        if token is not None:
            request.add_header("x-mm-token", token)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return (
                    response.status,
                    json.loads(response.read()),
                    dict(response.headers),
                )
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read()), dict(error.headers)

    # ------------------------------------------------------------------
    # Health / auth
    # ------------------------------------------------------------------
    def test_health_is_exempt_from_token(self) -> None:
        status, payload, headers = self.request("GET", "/health", token=None)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["provider"], "synthetic")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn("application/json", headers["Content-Type"])

    def test_auth_required(self) -> None:
        status, payload, _ = self.request("GET", "/api/v1/meta", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")
        status, payload, _ = self.request("GET", "/api/v1/meta", token="wrong")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")
        status, payload, _ = self.request("GET", "/api/v1/meta")
        self.assertEqual(status, 200)
        self.assertEqual(payload["api_version"], "v1")

    # ------------------------------------------------------------------
    # Meta / catalog / settings
    # ------------------------------------------------------------------
    def test_meta_and_catalog(self) -> None:
        status, meta, _ = self.request("GET", "/api/v1/meta")
        self.assertEqual(status, 200)
        self.assertEqual(meta["provider"]["active"], "synthetic")
        self.assertEqual(meta["provider"]["mode"], "synthetic")
        self.assertGreaterEqual(meta["catalog_size"], 30)
        status, catalog, _ = self.request("GET", "/api/v1/catalog?q=apple&limit=5")
        self.assertEqual(status, 200)
        self.assertEqual([item["symbol"] for item in catalog["items"]], ["AAPL"])
        status, crypto, _ = self.request("GET", "/api/v1/catalog?type=crypto&limit=2")
        self.assertEqual(status, 200)
        self.assertEqual(len(crypto["items"]), 2)

    def test_settings_patch(self) -> None:
        status, settings, _ = self.request("GET", "/api/v1/settings")
        self.assertEqual(status, 200)
        self.assertEqual(settings["provider"], "synthetic")
        status, patched, _ = self.request(
            "PATCH", "/api/v1/settings", {"poll_seconds": 30}
        )
        self.assertEqual(status, 200)
        self.assertEqual(patched["poll_seconds"], 30)
        status, patched, _ = self.request(
            "PATCH", "/api/v1/settings", {"history_points": 80}
        )
        self.assertEqual(status, 200)
        self.assertEqual(patched["history_points"], 80)
        status, payload, _ = self.request(
            "PATCH", "/api/v1/settings", {"provider": "bogus"}
        )
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")
        # Restore the fast interval / default point count for the remaining tests.
        self.request(
            "PATCH", "/api/v1/settings",
            {"poll_seconds": 5, "history_points": 60},
        )

    # ------------------------------------------------------------------
    # Watchlist
    # ------------------------------------------------------------------
    def test_watchlist_flow(self) -> None:
        status, added, _ = self.request(
            "POST", "/api/v1/watchlist", {"symbol": "SPY", "note": "etf"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(added["created"])
        self.assertEqual(added["item"]["symbol"], "SPY")
        status, again, _ = self.request("POST", "/api/v1/watchlist", {"symbol": "SPY"})
        self.assertFalse(again["created"])
        status, noted, _ = self.request(
            "POST", "/api/v1/watchlist/note", {"symbol": "SPY", "note": "core"}
        )
        self.assertEqual(noted["item"]["note"], "core")
        status, listing, _ = self.request("GET", "/api/v1/watchlist")
        self.assertIn("SPY", [item["symbol"] for item in listing["items"]])
        status, removed, _ = self.request("DELETE", "/api/v1/watchlist/SPY")
        self.assertEqual(removed, {"ok": True, "removed": "SPY"})
        status, payload, _ = self.request(
            "POST", "/api/v1/watchlist/note", {"symbol": "SPY", "note": "x"}
        )
        self.assertEqual(status, 404)

    def test_watchlist_invalid_symbol(self) -> None:
        status, payload, _ = self.request(
            "POST", "/api/v1/watchlist", {"symbol": "bad symbol"}
        )
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_symbol")
        status, payload, _ = self.request("POST", "/api/v1/watchlist", {})
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")

    # ------------------------------------------------------------------
    # Quotes / history / analysis / screener
    # ------------------------------------------------------------------
    def test_snapshot(self) -> None:
        status, payload, _ = self.request("GET", "/api/v1/snapshot")
        self.assertEqual(status, 200)
        self.assertEqual(payload["provider"], "synthetic")
        self.assertEqual(len(payload["quotes"]), len(DEFAULT_WATCHLIST))
        quote = payload["quotes"][0]
        self.assertIn("spark", quote)
        self.assertIn("rsi14", quote)
        self.assertIn("trend", quote)
        status, selected, _ = self.request("GET", "/api/v1/snapshot?symbols=AAPL,MSFT")
        self.assertEqual(
            [quote["symbol"] for quote in selected["quotes"]], ["AAPL", "MSFT"]
        )

    def test_quote_endpoint(self) -> None:
        status, payload, _ = self.request("GET", "/api/v1/quotes/AAPL")
        self.assertEqual(status, 200)
        self.assertEqual(payload["quote"]["symbol"], "AAPL")
        status, payload, _ = self.request("GET", "/api/v1/quotes/ZZZZ")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "symbol_not_found")
        status, payload, _ = self.request("GET", "/api/v1/quotes/bad%20symbol")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_symbol")

    def test_history_overlays(self) -> None:
        status, history, _ = self.request(
            "GET", "/api/v1/history/AAPL?range=1Y&overlays=1"
        )
        self.assertEqual(status, 200)
        bars = history["bars"]
        overlays = history["overlays"]
        # 1Y is the conventional 252 daily bars; overlays share the bar length.
        self.assertEqual(len(bars), 252)
        self.assertEqual(history["interval"], "1d")
        for key in ("sma20", "sma50", "rsi14"):
            self.assertEqual(len(overlays[key]), len(bars), key)
        for key in ("upper", "middle", "lower"):
            self.assertEqual(len(overlays["bollinger"][key]), len(bars), key)
        self.assertEqual(overlays["sma20"][:19], [None] * 19)
        self.assertIsNotNone(overlays["sma20"][19])
        self.assertEqual(overlays["sma50"][:49], [None] * 49)
        self.assertEqual(overlays["rsi14"][:14], [None] * 14)
        status, plain, _ = self.request("GET", "/api/v1/history/AAPL?range=1M")
        self.assertEqual(status, 200)
        self.assertEqual(plain["interval"], "1d")
        self.assertEqual(len(plain["bars"]), 22)
        self.assertNotIn("overlays", plain)

    def test_history_and_screener_validation(self) -> None:
        status, payload, _ = self.request("GET", "/api/v1/history/AAPL?range=2Y")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")
        status, payload, _ = self.request(
            "GET", "/api/v1/history/AAPL?range=1M&interval=2m"
        )
        self.assertEqual(status, 400)
        status, payload, _ = self.request("GET", "/api/v1/screener?preset=bogus")
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")
        status, payload, _ = self.request("GET", "/api/v1/screener?preset=losers&limit=x")
        self.assertEqual(status, 400)
        status, payload, _ = self.request(
            "GET", "/api/v1/screener?preset=losers&limit=3"
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["rows"]), 3)

    def test_analysis(self) -> None:
        status, analysis, _ = self.request("GET", "/api/v1/analysis/AAPL")
        self.assertEqual(status, 200)
        self.assertEqual(analysis["symbol"], "AAPL")
        self.assertEqual(analysis["provider"], "synthetic")
        for key in (
            "symbol",
            "name",
            "as_of",
            "provider",
            "quote",
            "summary",
            "indicators",
            "stats",
            "signals",
            "narrative",
            "levels",
            "correlation",
        ):
            self.assertIn(key, analysis)
        self.assertIsNotNone(analysis["indicators"]["sma20"])
        self.assertIsNotNone(analysis["correlation"]["value"])
        status, payload, _ = self.request("GET", "/api/v1/analysis/ZZZZ")
        self.assertEqual(status, 404)

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------
    def test_alert_flow(self) -> None:
        status, created, _ = self.request(
            "POST",
            "/api/v1/alerts",
            {"symbol": "AAPL", "kind": "price_above", "threshold": 100.0},
        )
        self.assertEqual(status, 200)
        rule = created["rule"]
        self.assertEqual(len(rule["id"]), 12)
        self.assertTrue(rule["armed"])
        status, listing, _ = self.request("GET", "/api/v1/alerts")
        self.assertEqual(len(listing["rules"]), 1)
        status, patched, _ = self.request(
            "PATCH", f"/api/v1/alerts/{rule['id']}", {"enabled": False}
        )
        self.assertEqual(status, 200)
        self.assertFalse(patched["rule"]["enabled"])
        status, payload, _ = self.request(
            "GET", "/api/v1/alerts/events?acknowledged=false&limit=10"
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["events"], [])
        status, acked, _ = self.request(
            "POST", "/api/v1/alerts/events/ack", {"all": True}
        )
        self.assertEqual(status, 200)
        self.assertIsInstance(acked["acknowledged"], int)
        status, payload, _ = self.request(
            "PATCH", "/api/v1/alerts/deadbeefcafe", {"enabled": True}
        )
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")
        status, payload, _ = self.request("DELETE", f"/api/v1/alerts/{rule['id']}")
        self.assertEqual(payload, {"ok": True})

    def test_alert_validation(self) -> None:
        status, payload, _ = self.request(
            "POST",
            "/api/v1/alerts",
            {"symbol": "AAPL", "kind": "unknown_kind", "threshold": 1},
        )
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")
        status, payload, _ = self.request(
            "POST",
            "/api/v1/alerts",
            {"symbol": "ZZZZ", "kind": "price_above", "threshold": 1},
        )
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "symbol_not_found")
        status, payload, _ = self.request("POST", "/api/v1/alerts", {})
        self.assertEqual(status, 400)

    # ------------------------------------------------------------------
    # Portfolio
    # ------------------------------------------------------------------
    def test_portfolio_flow(self) -> None:
        status, created, _ = self.request(
            "PUT",
            "/api/v1/portfolio/positions",
            {"symbol": "AAPL", "quantity": 2, "avg_cost": 100.0},
        )
        self.assertEqual(status, 200)
        position = created["position"]
        self.assertEqual(position["symbol"], "AAPL")
        self.assertIn("unrealized_pnl", position)
        status, portfolio, _ = self.request("GET", "/api/v1/portfolio")
        self.assertEqual(status, 200)
        self.assertEqual(len(portfolio["positions"]), 1)
        self.assertIn("totals", portfolio)
        status, payload, _ = self.request(
            "PUT",
            "/api/v1/portfolio/positions",
            {"symbol": "AAPL", "quantity": 1, "avg_cost": 100.0},
        )
        self.assertEqual(status, 200)
        status, removed, _ = self.request(
            "DELETE", "/api/v1/portfolio/positions/AAPL"
        )
        self.assertEqual(removed, {"ok": True, "removed": "AAPL"})
        status, payload, _ = self.request(
            "PUT",
            "/api/v1/portfolio/positions",
            {"symbol": "AAPL", "quantity": 1},
        )
        self.assertEqual(status, 400)

    # ------------------------------------------------------------------
    # Sync / collect
    # ------------------------------------------------------------------
    def test_sync_endpoint(self) -> None:
        status, payload, _ = self.request("POST", "/api/v1/sync", {})
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["quotes"]), len(DEFAULT_WATCHLIST))
        self.assertIsInstance(payload["triggered"], list)
        self.assertIsNotNone(payload["synced_at"])

    def test_collect_bars_endpoint(self) -> None:
        bars = [
            {"t": "2025-01-02", "o": 10.0, "h": 11.0, "l": 9.5, "c": 10.5, "v": 1000},
            {"t": "2025-01-03", "o": 10.5, "h": 11.5, "l": 10.0, "c": 11.0, "v": 1200},
        ]
        status, payload, _ = self.request(
            "POST", "/api/v1/collect/bars", {"symbol": "COL1", "bars": bars}
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["stored"], 2)
        self.assertEqual(payload["range"], {"from": "2025-01-02", "to": "2025-01-03"})
        status, payload, _ = self.request(
            "POST", "/api/v1/collect/bars", {"symbol": "COL1", "bars": []}
        )
        self.assertEqual(status, 400)

    # ------------------------------------------------------------------
    # Errors, limits, shutdown
    # ------------------------------------------------------------------
    def test_unknown_path_and_method(self) -> None:
        status, payload, _ = self.request("GET", "/api/v1/nope")
        self.assertEqual(status, 404)
        self.assertEqual(payload["error"]["code"], "not_found")
        status, payload, _ = self.request("PATCH", "/api/v1/snapshot")
        self.assertEqual(status, 405)
        self.assertEqual(payload["error"]["code"], "method_not_allowed")
        status, payload, _ = self.request("OPTIONS", "/api/v1/meta")
        self.assertEqual(status, 405)

    def test_malformed_json(self) -> None:
        status, payload, _ = self.request(
            "POST", "/api/v1/watchlist", raw=b"{not-json"
        )
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "invalid_argument")

    def test_body_limit(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.putrequest("POST", "/api/v1/collect/bars")
            connection.putheader("x-mm-token", TOKEN)
            connection.putheader("Content-Length", str(MAX_BODY_BYTES + 1))
            connection.endheaders()
            response = connection.getresponse()
            payload = json.loads(response.read())
            self.assertEqual(response.status, 413)
            self.assertEqual(payload["error"]["code"], "payload_too_large")
        finally:
            connection.close()

    def test_zz_shutdown_endpoint(self) -> None:
        status, payload, _ = self.request(
            "POST", "/api/v1/shutdown", {}, token=None
        )
        self.assertEqual(status, 401)
        status, payload, _ = self.request("POST", "/api/v1/shutdown", {})
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"ok": True, "shutting_down": True})
        self.assertTrue(self.shutdown_event.wait(5.0))
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())


if __name__ == "__main__":
    unittest.main()
