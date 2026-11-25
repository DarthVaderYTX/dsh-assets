"""Localhost JSON HTTP API for the market monitor.

A :class:`ThreadingHTTPServer` bound to ``127.0.0.1`` serves ``/api/v1``
operations plus an unauthenticated ``/health``.  All other requests require the
``x-mm-token`` header (constant-time compared with ``hmac.compare_digest``) and
errors use the contract envelope ``{"error": {"code", "message"}}``.  Responses
are JSON with ``Cache-Control: no-store`` and an exact ``Content-Length``.

``POST /api/v1/shutdown`` (token required) stops the server gracefully; the
sidecar entry point wires it to the process shutdown event.
"""

from __future__ import annotations

import hmac
import json
import logging
import re
import sys
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Mapping

from .errors import (
    InvalidArgumentError,
    MarketMonitorError,
    PayloadTooLargeError,
)
from .service import MarketMonitorService

LOGGER = logging.getLogger("market_monitor.http_api")

#: Hard request-body limit (4 MiB).
MAX_BODY_BYTES = 4 * 1024 * 1024
#: Upper bound on ``ack ids`` length.
MAX_ACK_IDS = 1000


def _compile(pattern: str) -> re.Pattern[str]:
    """Compile a route path pattern."""
    return re.compile(pattern)


#: (method, compiled path pattern, handler method name).
ROUTES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("GET", _compile(r"/api/v1/meta"), "_handle_meta"),
    ("GET", _compile(r"/api/v1/catalog"), "_handle_catalog"),
    ("GET", _compile(r"/api/v1/settings"), "_handle_get_settings"),
    ("PATCH", _compile(r"/api/v1/settings"), "_handle_patch_settings"),
    ("GET", _compile(r"/api/v1/watchlist"), "_handle_list_watchlist"),
    ("POST", _compile(r"/api/v1/watchlist"), "_handle_add_watch"),
    ("POST", _compile(r"/api/v1/watchlist/note"), "_handle_set_note"),
    ("DELETE", _compile(r"/api/v1/watchlist/(?P<symbol>[^/]+)"), "_handle_remove_watch"),
    ("GET", _compile(r"/api/v1/snapshot"), "_handle_snapshot"),
    ("POST", _compile(r"/api/v1/sync"), "_handle_sync"),
    ("GET", _compile(r"/api/v1/quotes/(?P<symbol>[^/]+)"), "_handle_quote"),
    ("GET", _compile(r"/api/v1/history/(?P<symbol>[^/]+)"), "_handle_history"),
    ("GET", _compile(r"/api/v1/analysis/(?P<symbol>[^/]+)"), "_handle_analysis"),
    ("GET", _compile(r"/api/v1/screener"), "_handle_screener"),
    ("GET", _compile(r"/api/v1/alerts/events"), "_handle_list_events"),
    ("POST", _compile(r"/api/v1/alerts/events/ack"), "_handle_ack_events"),
    ("GET", _compile(r"/api/v1/alerts"), "_handle_list_alerts"),
    ("POST", _compile(r"/api/v1/alerts"), "_handle_create_alert"),
    ("PATCH", _compile(r"/api/v1/alerts/(?P<rule_id>[^/]+)"), "_handle_update_alert"),
    ("DELETE", _compile(r"/api/v1/alerts/(?P<rule_id>[^/]+)"), "_handle_delete_alert"),
    ("GET", _compile(r"/api/v1/portfolio"), "_handle_portfolio"),
    ("PUT", _compile(r"/api/v1/portfolio/positions"), "_handle_set_position"),
    ("DELETE", _compile(r"/api/v1/portfolio/positions/(?P<symbol>[^/]+)"), "_handle_delete_position"),
    ("POST", _compile(r"/api/v1/collect/bars"), "_handle_collect_bars"),
    ("GET", _compile(r"/api/v1/index"), "_handle_index_overview"),
    ("GET", _compile(r"/api/v1/china/overview"), "_handle_china_overview"),
    ("GET", _compile(r"/api/v1/index/company"), "_handle_company_index"),
    ("GET", _compile(r"/api/v1/company/(?P<entity_id>[^/]+)/profile"), "_handle_company_profile"),
    ("GET", _compile(r"/api/v1/index/(?P<index_id>[^/]+)/entries"), "_handle_index_entries"),
    ("GET", _compile(r"/api/v1/index/(?P<index_id>[^/]+)/changes"), "_handle_index_changes"),
    ("GET", _compile(r"/api/v1/index/(?P<index_id>[^/]+)/refreshes"), "_handle_index_refreshes"),
    ("POST", _compile(r"/api/v1/index/(?P<index_id>[^/]+)/refresh"), "_handle_index_refresh"),
    ("GET", _compile(r"/api/v1/data/status"), "_handle_data_status"),
    ("GET", _compile(r"/api/v1/data/coverage"), "_handle_data_coverage"),
    ("GET", _compile(r"/api/v1/data/backfill"), "_handle_data_backfill"),
    ("GET", _compile(r"/api/v1/data/sources"), "_handle_data_sources"),
    ("GET", _compile(r"/api/v1/data/runs"), "_handle_data_runs"),
    ("GET", _compile(r"/api/v1/data/tracked"), "_handle_data_tracked"),
    ("GET", _compile(r"/api/v1/data/threads"), "_handle_data_threads"),
    ("POST", _compile(r"/api/v1/data/ingest"), "_handle_data_ingest"),
    ("GET", _compile(r"/api/v1/news"), "_handle_news"),
    ("GET", _compile(r"/api/v1/news/(?P<article_id>[^/]+)"), "_handle_news_item"),
    ("GET", _compile(r"/api/v1/ref/exchanges"), "_handle_ref_exchanges"),
    ("GET", _compile(r"/api/v1/ref/instruments"), "_handle_ref_instruments"),
    ("GET", _compile(r"/api/v1/ref/indices"), "_handle_ref_indices"),
    ("GET", _compile(r"/api/v1/ref/commodities"), "_handle_ref_commodities"),
    ("GET", _compile(r"/api/v1/series/(?P<series_id>[^/]+)/bars"), "_handle_series_bars"),
    ("POST", _compile(r"/api/v1/shutdown"), "_handle_shutdown"),
)

#: Allowed keys for ``PATCH /settings``.
_SETTINGS_KEYS = ("provider", "poll_seconds", "benchmark", "history_points")
#: Allowed keys for ``PATCH /alerts/:id``.
_ALERT_PATCH_KEYS = ("enabled", "threshold", "params", "note", "cooldown_s")


def _first(query: Mapping[str, list[str]], name: str) -> str | None:
    """Return the first query value or ``None``."""
    values = query.get(name)
    if not values:
        return None
    return values[0]


def _bool_query(query: Mapping[str, list[str]], name: str) -> bool:
    """Return ``True`` for ``1/true/yes/on`` (case-insensitive)."""
    value = _first(query, name)
    return bool(value is not None and value.strip().lower() in ("1", "true", "yes", "on"))


def _int_query(
    query: Mapping[str, list[str]], name: str, default: int | None = None
) -> int | None:
    """Parse an optional integer query parameter."""
    value = _first(query, name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        raise InvalidArgumentError(f"{name} must be an integer") from None


def _optional_bool_query(
    query: Mapping[str, list[str]], name: str
) -> bool | None:
    """Parse a tri-state boolean query parameter (``None`` when absent)."""
    value = _first(query, name)
    if value is None:
        return None
    lowered = value.strip().lower()
    if lowered in ("1", "true", "yes", "on"):
        return True
    if lowered in ("0", "false", "no", "off"):
        return False
    raise InvalidArgumentError(
        f"{name} must be true or false"
    )


def _require_body(body: Any) -> Mapping[str, Any]:
    """Require a JSON object request body."""
    if not isinstance(body, Mapping):
        raise InvalidArgumentError("request body must be a JSON object")
    return body


def _required(body: Mapping[str, Any], key: str) -> Any:
    """Return a required body field."""
    if key not in body:
        raise InvalidArgumentError(f"{key} is required")
    return body[key]


class MarketMonitorRequestHandler(BaseHTTPRequestHandler):
    """Request handler translating HTTP calls into service operations."""

    server_version = "market-monitor/1.0"
    protocol_version = "HTTP/1.1"
    #: Decoded request body bytes (``None`` when the request had no body).
    _body_bytes: bytes | None = None

    # ------------------------------------------------------------------
    # HTTP verbs
    # ------------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        """Handle GET requests."""
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        """Handle POST requests."""
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        """Handle PUT requests."""
        self._dispatch("PUT")

    def do_PATCH(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        """Handle PATCH requests."""
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        """Handle DELETE requests."""
        self._dispatch("DELETE")

    def __getattr__(self, name: str) -> Any:
        """Route any other HTTP verb (HEAD/OPTIONS/...) to a 405 response."""
        if name.startswith("do_"):
            return self._method_not_allowed
        raise AttributeError(name)

    def _method_not_allowed(self) -> None:
        """Respond to unsupported HTTP methods with 405."""
        try:
            self._consume_request_body()
        except MarketMonitorError:
            pass
        self._send_error_json(
            405,
            "method_not_allowed",
            f"method {self.command} is not allowed for {self.path}",
        )

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------
    def _dispatch(self, method: str) -> None:
        """Resolve and execute one request."""
        try:
            parsed = urllib.parse.urlsplit(self.path)
            path = urllib.parse.unquote(parsed.path)
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            # Read the body up front so responding early (auth/route errors)
            # never closes a socket with unread bytes, which can surface as a
            # connection reset on Windows.
            try:
                self._consume_request_body()
            except MarketMonitorError as error:
                self._send_error_json(error.status, error.code, error.message)
                return
            if path == "/health":
                if method != "GET":
                    self._send_error_json(
                        405, "method_not_allowed", "method not allowed for /health"
                    )
                    return
                self._send_json(200, self.server.service.health())  # type: ignore[attr-defined]
                return
            if not self._authorized():
                self._send_error_json(
                    401, "unauthorized", "missing or invalid x-mm-token header"
                )
                return
            matched_path = False
            for route_method, pattern, handler_name in ROUTES:
                match = pattern.fullmatch(path)
                if match is None:
                    continue
                matched_path = True
                if route_method != method:
                    continue
                body = (
                    self._read_json_body()
                    if method in ("POST", "PUT", "PATCH")
                    else None
                )
                handler = getattr(self, handler_name)
                payload = handler(match, query, body)
                self._send_json(200, payload)
                self._maybe_trigger_shutdown()
                return
            if matched_path:
                self._send_error_json(
                    405,
                    "method_not_allowed",
                    f"method {method} is not allowed for {path}",
                )
            else:
                self._send_error_json(404, "not_found", f"unknown path: {path}")
        except MarketMonitorError as error:
            self._send_error_json(error.status, error.code, error.message)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:  # pragma: no cover - defensive catch-all
            LOGGER.exception("unhandled API error for %s %s", method, self.path)
            self._send_error_json(500, "internal_error", "internal server error")

    # ------------------------------------------------------------------
    # Auth / body / response helpers
    # ------------------------------------------------------------------
    def _authorized(self) -> bool:
        """Compare the ``x-mm-token`` header with the server token in constant time."""
        header = self.headers.get("x-mm-token")
        if header is None:
            return False
        expected = str(getattr(self.server, "token", ""))
        return hmac.compare_digest(header.encode("utf-8"), expected.encode("utf-8"))

    def _consume_request_body(self) -> None:
        """Read the declared request body into ``_body_bytes``, enforcing limits."""
        self._body_bytes = None
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            return
        try:
            length = int(length_header)
        except ValueError:
            raise InvalidArgumentError("invalid Content-Length header") from None
        if length < 0:
            raise InvalidArgumentError("invalid Content-Length header")
        if length > MAX_BODY_BYTES:
            raise PayloadTooLargeError(
                f"request body exceeds the {MAX_BODY_BYTES} byte limit"
            )
        if length == 0:
            self._body_bytes = b""
            return
        self._body_bytes = self.rfile.read(length)

    def _read_json_body(self) -> Any:
        """Decode the already-consumed request body as JSON."""
        raw = self._body_bytes
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise InvalidArgumentError("malformed JSON request body") from None

    def _send_json(self, status: int, payload: Any) -> None:
        """Serialise ``payload`` as a JSON response with no-store caching."""
        try:
            encoded = json.dumps(
                payload, allow_nan=False, separators=(",", ":")
            ).encode("utf-8")
        except (TypeError, ValueError):
            LOGGER.exception("response payload is not JSON serialisable")
            status = 500
            encoded = json.dumps(
                {"error": {"code": "internal_error", "message": "internal server error"}}
            ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        if status >= 400:
            self.close_connection = True
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(encoded)
            self.wfile.flush()

    def _send_error_json(self, status: int, code: str, message: str) -> None:
        """Send a contract-shaped JSON error."""
        self._send_json(status, {"error": {"code": code, "message": message}})

    def _maybe_trigger_shutdown(self) -> None:
        """Run the server's shutdown callback after the shutdown response."""
        if not getattr(self, "_shutdown_requested", False):
            return
        self._shutdown_requested = False
        callback = getattr(self.server, "shutdown_callback", None)
        if callback is None:
            LOGGER.warning("/shutdown called but no shutdown callback is wired")
            return
        threading.Thread(
            target=callback,
            name="market-monitor-shutdown",
            daemon=True,
        ).start()

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        """Send request logs to the debug logger instead of stderr directly."""
        LOGGER.debug("%s - %s", self.address_string(), format % args)

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------
    def _handle_meta(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/meta."""
        return self.server.service.meta()  # type: ignore[attr-defined]

    def _handle_catalog(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/catalog."""
        return self.server.service.catalog(  # type: ignore[attr-defined]
            q=_first(query, "q"),
            type=_first(query, "type"),
            limit=_int_query(query, "limit", None),
        )

    def _handle_get_settings(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/settings."""
        return self.server.service.get_settings()  # type: ignore[attr-defined]

    def _handle_patch_settings(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """PATCH /api/v1/settings."""
        fields = _require_body(body)
        values = {key: fields[key] for key in _SETTINGS_KEYS if key in fields}
        return self.server.service.update_settings(**values)  # type: ignore[attr-defined]

    def _handle_list_watchlist(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/watchlist."""
        return self.server.service.list_watchlist()  # type: ignore[attr-defined]

    def _handle_add_watch(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/watchlist."""
        fields = _require_body(body)
        return self.server.service.add_watch(  # type: ignore[attr-defined]
            _required(fields, "symbol"), fields.get("note") or ""
        )

    def _handle_remove_watch(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """DELETE /api/v1/watchlist/:symbol."""
        return self.server.service.remove_watch(match.group("symbol"))  # type: ignore[attr-defined]

    def _handle_set_note(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/watchlist/note."""
        fields = _require_body(body)
        note = _required(fields, "note")
        if not isinstance(note, str):
            raise InvalidArgumentError("note must be a string")
        return self.server.service.set_note(  # type: ignore[attr-defined]
            _required(fields, "symbol"), note
        )

    def _handle_snapshot(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/snapshot."""
        return self.server.service.snapshot(_first(query, "symbols"))  # type: ignore[attr-defined]

    def _handle_sync(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/sync."""
        symbols = None
        if body is not None:
            fields = _require_body(body)
            symbols = fields.get("symbols")
            if symbols is not None and not isinstance(symbols, (list, str)):
                raise InvalidArgumentError("symbols must be an array or a CSV string")
        return self.server.service.sync(symbols)  # type: ignore[attr-defined]

    def _handle_quote(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/quotes/:symbol."""
        return {"quote": self.server.service.quote(match.group("symbol"))}  # type: ignore[attr-defined]

    def _handle_history(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/history/:symbol (supports ``range``/``interval``/``overlays``)."""
        return self.server.service.history(  # type: ignore[attr-defined]
            match.group("symbol"),
            _first(query, "range") or "1Y",
            _first(query, "interval"),
            overlays=_bool_query(query, "overlays"),
        )

    def _handle_analysis(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/analysis/:symbol."""
        return self.server.service.analysis(match.group("symbol"))  # type: ignore[attr-defined]

    def _handle_screener(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/screener."""
        return self.server.service.screener(  # type: ignore[attr-defined]
            _first(query, "preset") or "gainers",
            _int_query(query, "limit", 10),
        )

    def _handle_list_alerts(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/alerts."""
        return self.server.service.list_alerts()  # type: ignore[attr-defined]

    def _handle_create_alert(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/alerts."""
        fields = _require_body(body)
        return self.server.service.create_alert(  # type: ignore[attr-defined]
            _required(fields, "symbol"),
            _required(fields, "kind"),
            fields.get("threshold"),
            fields.get("params"),
            fields.get("note") or "",
            fields.get("cooldown_s"),
        )

    def _handle_update_alert(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """PATCH /api/v1/alerts/:id."""
        fields = _require_body(body)
        values = {key: fields[key] for key in _ALERT_PATCH_KEYS if key in fields}
        return self.server.service.update_alert(  # type: ignore[attr-defined]
            match.group("rule_id"), **values
        )

    def _handle_delete_alert(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """DELETE /api/v1/alerts/:id."""
        return self.server.service.delete_alert(match.group("rule_id"))  # type: ignore[attr-defined]

    def _handle_list_events(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/alerts/events."""
        return self.server.service.list_events(  # type: ignore[attr-defined]
            _int_query(query, "limit", 50),
            _optional_bool_query(query, "acknowledged"),
        )

    def _handle_ack_events(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/alerts/events/ack."""
        fields = _require_body(body)
        if fields.get("all") is True:
            return self.server.service.ack_events(all_events=True)  # type: ignore[attr-defined]
        ids = fields.get("ids")
        if ids is None:
            raise InvalidArgumentError("provide ids or all=true")
        if not isinstance(ids, list) or len(ids) > MAX_ACK_IDS:
            raise InvalidArgumentError(f"ids must be an array of at most {MAX_ACK_IDS} ids")
        return self.server.service.ack_events(ids=ids)  # type: ignore[attr-defined]

    def _handle_portfolio(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/portfolio."""
        return self.server.service.portfolio()  # type: ignore[attr-defined]

    def _handle_set_position(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """PUT /api/v1/portfolio/positions."""
        fields = _require_body(body)
        return self.server.service.set_position(  # type: ignore[attr-defined]
            _required(fields, "symbol"),
            _required(fields, "quantity"),
            _required(fields, "avg_cost"),
        )

    def _handle_delete_position(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """DELETE /api/v1/portfolio/positions/:symbol."""
        return self.server.service.delete_position(match.group("symbol"))  # type: ignore[attr-defined]

    def _handle_collect_bars(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/collect/bars."""
        fields = _require_body(body)
        return self.server.service.collect_bars(  # type: ignore[attr-defined]
            _required(fields, "symbol"),
            _required(fields, "bars"),
            fields.get("interval") or "1d",
            fields.get("source"),
        )

    # ------------------------------------------------------------------
    # Data collection layer
    # ------------------------------------------------------------------
    def _handle_data_status(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/status."""
        return self.server.service.data_status()  # type: ignore[attr-defined]

    def _handle_data_coverage(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/coverage."""
        return self.server.service.data_coverage()  # type: ignore[attr-defined]

    def _handle_data_backfill(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/backfill — recent-window backfill coverage."""
        return self.server.service.data_backfill()  # type: ignore[attr-defined]

    def _handle_data_sources(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/sources."""
        return self.server.service.data_sources()  # type: ignore[attr-defined]

    def _handle_data_runs(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/runs."""
        return self.server.service.data_runs(_int_query(query, "limit", 20))  # type: ignore[attr-defined]

    def _handle_data_tracked(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/tracked."""
        return self.server.service.data_tracked()  # type: ignore[attr-defined]

    # ---------------------------------------------------------------- indices

    def _handle_index_overview(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/index — index registry with entry stats."""
        return self.server.service.index_overview()  # type: ignore[attr-defined]

    def _handle_china_overview(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/china/overview — China securities/fund/commodity summary."""
        return self.server.service.china_overview()  # type: ignore[attr-defined]

    def _handle_company_index(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/index/company — company master index summary."""
        return self.server.service.company_index()  # type: ignore[attr-defined]

    def _handle_company_profile(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/company/:entity_id/profile."""
        entity_id = urllib.parse.unquote(match.group("entity_id"))
        return self.server.service.company_profile(entity_id)  # type: ignore[attr-defined]

    def _handle_index_entries(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/index/:index_id/entries?market=&status=&profile_status=&q=&limit=&offset=."""
        index_id = urllib.parse.unquote(match.group("index_id"))
        return self.server.service.index_entries(  # type: ignore[attr-defined]
            index_id,
            market=_first(query, "market"),
            status=_first(query, "status"),
            profile_status=_first(query, "profile_status"),
            query=_first(query, "q"),
            limit=_int_query(query, "limit", 100),
            offset=_int_query(query, "offset", 0),
        )

    def _handle_index_changes(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/index/:index_id/changes?limit=."""
        index_id = urllib.parse.unquote(match.group("index_id"))
        return self.server.service.index_changes(  # type: ignore[attr-defined]
            index_id, _int_query(query, "limit", 50),
        )

    def _handle_index_refreshes(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/index/:index_id/refreshes?limit=."""
        index_id = urllib.parse.unquote(match.group("index_id"))
        return self.server.service.index_refreshes(  # type: ignore[attr-defined]
            index_id, _int_query(query, "limit", 10),
        )

    def _handle_index_refresh(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/index/:index_id/refresh {dry_run?}."""
        index_id = urllib.parse.unquote(match.group("index_id"))
        fields = _require_body(body) if body is not None else {}
        dry_run = bool(fields.get("dry_run")) or _bool_query(query, "dry_run")
        return self.server.service.index_refresh(index_id, dry_run)  # type: ignore[attr-defined]

    def _handle_data_threads(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/data/threads — diagnostic stack dump for hung jobs."""
        frames = sys._current_frames()  # noqa: SLF001 - deliberate diagnostics
        threads = []
        for thread in threading.enumerate():
            frame = frames.get(thread.ident)
            stack = traceback.format_stack(frame)[-6:] if frame is not None else []
            threads.append({
                "name": thread.name,
                "daemon": thread.daemon,
                "alive": thread.is_alive(),
                "stack": [line.strip() for line in stack],
            })
        return {"threads": threads}

    def _handle_data_ingest(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/data/ingest {job_id?, dry_run?}."""
        fields = _require_body(body) if body is not None else {}
        job_id = fields.get("job_id")
        if job_id is not None and not isinstance(job_id, str):
            raise InvalidArgumentError("job_id must be a string")
        dry_run = fields.get("dry_run", False)
        if not isinstance(dry_run, bool):
            raise InvalidArgumentError("dry_run must be true or false")
        return self.server.service.data_ingest(job_id or None, dry_run=dry_run)  # type: ignore[attr-defined]

    def _handle_news(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/news?entity_id=|symbol=&source_id=&since=&limit=."""
        return self.server.service.news(  # type: ignore[attr-defined]
            entity_id=_first(query, "entity_id"),
            source_id=_first(query, "source_id"),
            since=_first(query, "since"),
            limit=_int_query(query, "limit", 50),
            symbol=_first(query, "symbol"),
        )

    def _handle_news_item(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/news/:article_id."""
        return self.server.service.get_news(match.group("article_id"))  # type: ignore[attr-defined]

    def _handle_ref_exchanges(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/ref/exchanges."""
        return self.server.service.ref_exchanges()  # type: ignore[attr-defined]

    def _handle_ref_instruments(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/ref/instruments?mic=&q=&type=&limit=&offset=."""
        return self.server.service.ref_instruments(  # type: ignore[attr-defined]
            mic=_first(query, "mic"),
            query=_first(query, "q"),
            type_=_first(query, "type"),
            limit=_int_query(query, "limit", 100),
            offset=_int_query(query, "offset", 0),
        )

    def _handle_ref_indices(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/ref/indices?q=&limit=."""
        return self.server.service.ref_indices(  # type: ignore[attr-defined]
            query=_first(query, "q"),
            limit=_int_query(query, "limit", 100),
        )

    def _handle_ref_commodities(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/ref/commodities."""
        return self.server.service.ref_commodities()  # type: ignore[attr-defined]

    def _handle_series_bars(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """GET /api/v1/series/:series_id/bars?interval=1d&limit=250."""
        return self.server.service.series_bars(  # type: ignore[attr-defined]
            match.group("series_id"),
            interval=_first(query, "interval") or "1d",
            limit=_int_query(query, "limit", 250),
        )

    def _handle_shutdown(self, match: re.Match[str], query: Mapping[str, list[str]], body: Any) -> Any:
        """POST /api/v1/shutdown: respond first, then stop the server."""
        self._shutdown_requested = True
        return {"ok": True, "shutting_down": True}


class MarketMonitorHTTPServer(ThreadingHTTPServer):
    """Threading HTTP server carrying the service, token and shutdown callback."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        service: MarketMonitorService,
        token: str,
        version: str = "1.0.0",
    ) -> None:
        self.service = service
        self.token = token
        self.version = version
        self.started_at = time.time()
        self.shutdown_callback: Any = None
        super().__init__(server_address, MarketMonitorRequestHandler)

    def handle_error(self, request: Any, client_address: Any) -> None:
        """Log request-handler errors instead of dumping a traceback to stderr."""
        LOGGER.exception("unhandled error while serving %s", client_address)


def create_http_server(
    service: MarketMonitorService,
    token: str,
    host: str = "127.0.0.1",
    port: int = 0,
    version: str = "1.0.0",
) -> MarketMonitorHTTPServer:
    """Create (but do not start) the market-monitor HTTP server."""
    return MarketMonitorHTTPServer((host, int(port)), service, token, version)


__all__ = [
    "MAX_BODY_BYTES",
    "ROUTES",
    "MarketMonitorHTTPServer",
    "MarketMonitorRequestHandler",
    "create_http_server",
]
