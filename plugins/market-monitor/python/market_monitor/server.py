"""Sidecar entry point: ``python -m market_monitor serve``.

The sidecar owns the stdin-EOF watchdog that lets the DSH plugin clean it up
when the parent process goes away.  Lifecycle:

1. Start the service with the monitoring loop and bind the HTTP server.
2. Write ``<data-dir>/runtime.json`` for discovery.
3. Print exactly one JSON handshake line on stdout and flush.
4. Serve until SIGINT/SIGTERM, stdin EOF or ``POST /api/v1/shutdown``.
5. Remove ``runtime.json`` and close the service/store.

All diagnostics go to stderr; stdout carries only the handshake line.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import secrets
import signal
import sys
import threading
from pathlib import Path
from typing import Any, Sequence

from . import __version__
from .errors import MarketMonitorError
from .http_api import MarketMonitorHTTPServer, create_http_server
from .service import MarketMonitorService
from .storage import (
    acquire_lock,
    atomic_write_text,
    layout,
    release_lock,
    resolve_data_dir,
)

LOGGER = logging.getLogger("market_monitor.server")

#: Sentinel meaning "generate a random token".
AUTO_TOKEN = "AUTO"
#: Handshake/readiness polling interval in the main wait loop (seconds).
_WAIT_TICK_SECONDS = 0.25


def add_serve_arguments(parser: argparse.ArgumentParser) -> None:
    """Register the CLI options for the ``serve`` subcommand."""
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="TCP port to bind on 127.0.0.1 (0 picks an ephemeral port)",
    )
    parser.add_argument(
        "--token",
        default=AUTO_TOKEN,
        help="API token; AUTO (default) generates a random token",
    )
    parser.add_argument(
        "--data-dir",
        default=None,
        help="data directory for market-monitor.db/runtime.json "
        "(default: $DSH_HOME/market-monitor or ~/.market-monitor)",
    )
    parser.add_argument(
        "--provider",
        choices=("auto", "synthetic", "yahoo"),
        default="auto",
        help="data provider mode (default: auto)",
    )
    parser.add_argument(
        "--poll-seconds",
        type=int,
        default=15,
        help="monitoring/quote refresh interval in seconds (default: 15)",
    )
    parser.add_argument(
        "--benchmark",
        default="^GSPC",
        help="benchmark symbol for correlation analysis (default: ^GSPC)",
    )
    parser.add_argument(
        "--log-level",
        choices=("debug", "info", "warning", "error", "critical"),
        default="info",
        help="stderr log level (default: info)",
    )
    parser.add_argument(
        "--no-data-collect",
        action="store_true",
        help="do not start the multi-domain data collection loop (warehouse stays queryable)",
    )


def configure_logging(level: str = "info") -> None:
    """Configure stderr-only logging for the sidecar/CLI."""
    logging.basicConfig(
        stream=sys.stderr,
        level=getattr(logging, str(level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        force=True,
    )


def _resolve_token(value: str | None) -> str:
    """Return an explicit token or generate a random one for AUTO."""
    if value is None or not str(value).strip() or str(value).upper() == AUTO_TOKEN:
        return secrets.token_hex(24)
    return str(value)


def _write_runtime(path: Path, payload: dict[str, Any]) -> None:
    """Atomically write ``runtime.json`` with cross-platform retry."""
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False), mode=0o600)


def _remove_runtime(path: Path) -> None:
    """Remove ``runtime.json`` if present."""
    try:
        path.unlink(missing_ok=True)
    except OSError:  # pragma: no cover - best effort cleanup
        LOGGER.warning("could not remove %s", path)


def _stdin_watchdog(shutdown_event: threading.Event) -> None:
    """Signal shutdown as soon as the parent closes the stdin pipe."""
    stream = sys.stdin
    if stream is None:  # pragma: no cover - pythonw/odd embedding
        return
    try:
        while True:
            line = stream.readline()
            if not line:
                break
    except (OSError, ValueError, AttributeError):  # pragma: no cover - closed stream
        pass
    LOGGER.info("stdin closed; shutting down")
    shutdown_event.set()


def _install_signal_handlers(shutdown_event: threading.Event) -> None:
    """Turn SIGINT/SIGTERM/SIGBREAK into a graceful shutdown."""

    def _handle(signum: int, _frame: Any) -> None:
        LOGGER.info("received signal %s; shutting down", signum)
        shutdown_event.set()

    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        candidate = getattr(signal, name, None)
        if candidate is None:
            continue
        try:
            signal.signal(candidate, _handle)
        except (ValueError, OSError):  # pragma: no cover - non-main thread/Windows quirks
            LOGGER.debug("cannot install handler for %s", name)


def _acquire_instance_lock(data_dir: Path):
    """Acquire the per-data-directory single-instance lock.

    Returns an open file handle holding the OS lock, or ``None`` when another
    sidecar already owns this directory.  The OS releases the lock when the
    process exits, so a crashed sidecar never leaves a stale lock behind.
    """
    return acquire_lock(layout(data_dir).lock_file)


def _release_instance_lock(handle) -> None:
    """Release and remove the single-instance lock file."""
    release_lock(handle)


def run_serve(args: argparse.Namespace) -> int:
    """Run the sidecar until shutdown, returning a process exit code."""
    configure_logging(getattr(args, "log_level", "info"))
    configured_dir = getattr(args, "data_dir", None)
    data_dir = resolve_data_dir(configured_dir)
    lock_handle = _acquire_instance_lock(data_dir)
    if lock_handle is None:
        message = (
            "Another market-monitor sidecar is already serving this data directory."
        )
        LOGGER.error(message)
        handshake = {
            "event": "error",
            "code": "already_running",
            "message": message,
            "pid": os.getpid(),
        }
        sys.stdout.write(json.dumps(handshake) + "\n")
        sys.stdout.flush()
        return 3
    try:
        return _serve_with_lock(args)
    finally:
        _release_instance_lock(lock_handle)


def _serve_with_lock(args: argparse.Namespace) -> int:
    """Serve with the instance lock already held."""
    try:
        service = MarketMonitorService(
            data_dir=getattr(args, "data_dir", None),
            provider=getattr(args, "provider", "auto"),
            poll_seconds=getattr(args, "poll_seconds", 15),
            benchmark=getattr(args, "benchmark", "^GSPC"),
            start_monitor=True,
        )
    except MarketMonitorError as error:
        LOGGER.error("cannot start market-monitor service: %s", error)
        return 2
    data_collect = not bool(getattr(args, "no_data_collect", False))
    if data_collect:
        try:
            from .data.manager import MarketDataManager

            manager = MarketDataManager(
                service.data_dir,
                enabled=True,
            )
            service.attach_data_layer(manager)
            manager.start()
        except Exception as error:  # noqa: BLE001 - collection must not break the API
            LOGGER.error("data collection layer unavailable: %s", error)
    token = _resolve_token(getattr(args, "token", AUTO_TOKEN))
    port = int(getattr(args, "port", 0))
    try:
        server: MarketMonitorHTTPServer = create_http_server(
            service, token=token, host="127.0.0.1", port=port, version=__version__
        )
    except OSError as error:
        LOGGER.error("cannot bind 127.0.0.1:%s: %s", port, error)
        service.close()
        return 1

    actual_port = int(server.server_address[1])
    pid = os.getpid()
    started_at = service.health()["last_sync_at"] or _utc_now()
    service.set_sidecar(port=actual_port, pid=pid)
    shutdown_event = threading.Event()
    server.shutdown_callback = shutdown_event.set
    runtime_path = layout(service.data_dir).runtime_file
    runtime_payload = {
        "pid": pid,
        "port": actual_port,
        "token": token,
        "started_at": started_at,
        "version": __version__,
        "provider": service.health()["provider"],
        "poll_seconds": service.get_settings()["poll_seconds"],
        "data_collect": data_collect,
    }
    try:
        _write_runtime(runtime_path, runtime_payload)
        server_thread = threading.Thread(
            target=server.serve_forever,
            kwargs={"poll_interval": 0.1},
            name="market-monitor-http",
            daemon=True,
        )
        server_thread.start()
        _install_signal_handlers(shutdown_event)
        watchdog = threading.Thread(
            target=_stdin_watchdog,
            args=(shutdown_event,),
            name="market-monitor-stdin",
            daemon=True,
        )
        watchdog.start()
        handshake = {
            "event": "ready",
            "port": actual_port,
            "token": token,
            "pid": pid,
            "version": __version__,
        }
        sys.stdout.write(json.dumps(handshake) + "\n")
        sys.stdout.flush()
        LOGGER.info(
            "market-monitor sidecar ready on http://127.0.0.1:%s (provider=%s)",
            actual_port,
            runtime_payload["provider"],
        )
        while not shutdown_event.wait(_WAIT_TICK_SECONDS):
            if not server_thread.is_alive():  # pragma: no cover - defensive
                LOGGER.error("HTTP server thread stopped unexpectedly")
                break
    except KeyboardInterrupt:  # pragma: no cover - signal handler usually wins
        LOGGER.info("interrupted")
    finally:
        LOGGER.info("shutting down market-monitor sidecar")
        shutdown_event.set()
        if "server_thread" in locals() and server_thread.is_alive():
            server.shutdown()
        server.server_close()
        service.close()
        _remove_runtime(runtime_path)
    return 0


def _utc_now() -> str:
    """Return the current UTC time as an ISO-8601 string (fallback helper)."""
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: Sequence[str] | None = None) -> int:
    """Parse ``serve`` arguments and run the sidecar."""
    parser = argparse.ArgumentParser(
        prog="python -m market_monitor serve",
        description="Run the market-monitor JSON API sidecar.",
    )
    add_serve_arguments(parser)
    args = parser.parse_args(list(argv) if argv is not None else None)
    return run_serve(args)


__all__ = [
    "AUTO_TOKEN",
    "add_serve_arguments",
    "configure_logging",
    "run_serve",
    "main",
]
