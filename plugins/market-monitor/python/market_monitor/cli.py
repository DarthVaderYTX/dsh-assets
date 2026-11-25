"""Command line interface: ``python -m market_monitor <command>``.

Commands
--------
``snapshot``
    Print quote entries (JSON) for the watchlist or explicit ``--symbols``.
``analyze SYMBOL``
    Print the full analysis payload for one symbol.
``scan``
    Print a screener preset.
``serve``
    Run the localhost JSON API sidecar (see :mod:`market_monitor.server`).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any, Sequence

from . import server
from .errors import MarketMonitorError
from .sdk import MarketMonitor
from .service import SCREENER_PRESETS

LOGGER = logging.getLogger("market_monitor.cli")

_LOG_LEVELS = ("debug", "info", "warning", "error", "critical")


def _add_client_arguments(parser: argparse.ArgumentParser) -> None:
    """Add the shared options of the read-only client subcommands."""
    parser.add_argument("--data-dir", default=None, help="data directory override")
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
        help="quote cache interval in seconds (default: 15)",
    )
    parser.add_argument(
        "--benchmark",
        default="^GSPC",
        help="benchmark symbol for correlation analysis (default: ^GSPC)",
    )
    parser.add_argument(
        "--log-level",
        choices=_LOG_LEVELS,
        default="info",
        help="stderr log level (default: info)",
    )


def build_parser() -> argparse.ArgumentParser:
    """Build the top-level argument parser."""
    parser = argparse.ArgumentParser(
        prog="python -m market_monitor",
        description="Market monitor SDK/CLI and localhost JSON API sidecar.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    serve_parser = subcommands.add_parser(
        "serve", help="run the localhost JSON API sidecar"
    )
    server.add_serve_arguments(serve_parser)

    snapshot_parser = subcommands.add_parser(
        "snapshot", help="print quotes for the watchlist or --symbols"
    )
    _add_client_arguments(snapshot_parser)
    snapshot_parser.add_argument(
        "--symbols",
        default=None,
        help="comma separated symbols (default: the watchlist)",
    )

    analyze_parser = subcommands.add_parser(
        "analyze", help="print the analysis payload for one symbol"
    )
    _add_client_arguments(analyze_parser)
    analyze_parser.add_argument("symbol", help="canonical symbol, e.g. AAPL")

    scan_parser = subcommands.add_parser(
        "scan", help="print a screener preset"
    )
    _add_client_arguments(scan_parser)
    scan_parser.add_argument(
        "--preset",
        choices=SCREENER_PRESETS,
        default="gainers",
        help="screener preset (default: gainers)",
    )
    scan_parser.add_argument(
        "--limit", type=int, default=10, help="maximum rows (default: 10)"
    )
    return parser


def _print_json(payload: Any) -> None:
    """Write a JSON payload to stdout."""
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    sys.stdout.flush()


def _run_client_command(args: argparse.Namespace) -> int:
    """Execute a read-only client subcommand."""
    server.configure_logging(args.log_level)
    try:
        with MarketMonitor(
            data_dir=args.data_dir,
            provider=args.provider,
            poll_seconds=args.poll_seconds,
            benchmark=args.benchmark,
        ) as monitor:
            if args.command == "snapshot":
                payload = monitor.snapshot(args.symbols)
            elif args.command == "analyze":
                payload = monitor.analysis(args.symbol)
            elif args.command == "scan":
                payload = monitor.screener(args.preset, args.limit)
            else:  # pragma: no cover - argparse enforces the choices
                raise SystemExit(f"unknown command: {args.command}")
    except MarketMonitorError as error:
        LOGGER.error("%s: %s", error.code, error.message)
        return 1
    _print_json(payload)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments and dispatch a command."""
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.command == "serve":
        try:
            return server.run_serve(args)
        except KeyboardInterrupt:  # pragma: no cover - Ctrl+C during startup
            return 130
        except OSError as error:  # pragma: no cover - bind failure
            LOGGER.error("sidecar failed: %s", error)
            return 1
    return _run_client_command(args)


__all__ = ["build_parser", "main"]
