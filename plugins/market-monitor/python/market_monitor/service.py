"""Service orchestration: providers, caches, monitoring, portfolio, collection.

:class:`MarketMonitorService` is the single implementation behind both the
Python SDK and the HTTP API.  It owns the SQLite store, the active provider, the
in-memory quote/bar caches, the alert engine integration and the optional
monitoring thread.

Threading model
---------------
* One re-entrant lock guards the in-memory caches and provider selection.
* Provider network calls happen outside the lock; a stale duplicate fetch is
  harmless because results are idempotent.
* The monitoring loop is a daemon thread started only when ``start_monitor`` is
  passed (the sidecar does so).  It never dies on provider errors.
"""

from __future__ import annotations

import logging
import math
import os
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

from . import __version__
from . import alerts as alerts_engine
from . import analytics, indicators
from .catalog import (
    DEFAULT_WATCHLIST,
    catalog_items,
    get_instrument,
    normalize_symbol,
)
from .errors import (
    InvalidArgumentError,
    MarketMonitorError,
    NotFoundError,
    ProviderUnavailableError,
    StorageUnavailableError,
    SymbolNotFoundError,
)
from .providers import normalize_provider_name, resolve_provider
from .providers.base import validate_interval, validate_range
from .providers.synthetic import SyntheticProvider
from .store import Store, new_id

LOGGER = logging.getLogger("market_monitor.service")

#: API version reported by ``meta``.
API_VERSION = "v1"
#: Daily bar cache lifetime (seconds).  Chart bars and the daily history source
#: share it because both describe daily data that only changes once a day.
DAILY_BARS_TTL_SECONDS = 300.0
#: Daily bars fetched for analysis/screener indicator math (about one year).
ANALYSIS_DAILY_BARS = 252
#: Maximum daily bars kept in the in-memory daily-history cache per symbol.
_DAILY_HISTORY_CACHE_BARS = 600
#: Screener presets accepted by ``screener``.
SCREENER_PRESETS: tuple[str, ...] = (
    "gainers",
    "losers",
    "momentum",
    "oversold",
    "overbought",
    "volatile",
)
SCREENER_DEFAULT_LIMIT = 10
SCREENER_MAX_LIMIT = 50
EVENTS_MAX_LIMIT = 500
CATALOG_MAX_LIMIT = 200
MAX_COLLECTED_BARS = 5000
MAX_SOURCE_LENGTH = 40
#: Conventional daily-bar counts for the 1M/3M/6M/1Y windows.
_HISTORY_DAILY_BARS: dict[str, int] = {"1M": 22, "3M": 66, "6M": 132, "1Y": 252}


def default_data_dir() -> Path:
    """Return the default data directory (``$DSH_HOME/market-monitor`` or ``~``)."""
    from .storage import default_data_dir as _default_data_dir

    return _default_data_dir()


# ----------------------------------------------------------------------
# Input coercion helpers
# ----------------------------------------------------------------------
def _is_bool(value: Any) -> bool:
    """Return ``True`` for booleans (which are ints in Python)."""
    return isinstance(value, bool)


def _to_float(value: Any, field: str) -> float:
    """Validate and coerce a required finite number."""
    if value is None or _is_bool(value):
        raise InvalidArgumentError(f"{field} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise InvalidArgumentError(f"{field} must be a finite number") from None
    if not math.isfinite(number):
        raise InvalidArgumentError(f"{field} must be a finite number")
    return number


def _to_int(value: Any, field: str, *, default: int | None = None) -> int:
    """Validate and coerce an integer (accepting numeric strings/floats)."""
    if value is None:
        if default is not None:
            return default
        raise InvalidArgumentError(f"{field} is required")
    if _is_bool(value):
        raise InvalidArgumentError(f"{field} must be an integer")
    try:
        if isinstance(value, str):
            return int(float(value.strip()))
        number = float(value)
    except (TypeError, ValueError):
        raise InvalidArgumentError(f"{field} must be an integer") from None
    if not math.isfinite(number):
        raise InvalidArgumentError(f"{field} must be an integer")
    return int(round(number))


def _clamp_int(value: int, minimum: int, maximum: int) -> int:
    """Clamp ``value`` into ``[minimum, maximum]``."""
    return max(minimum, min(maximum, value))


def _require_text(value: Any, field: str) -> str:
    """Validate and trim a required non-empty string."""
    if not isinstance(value, str) or value.strip() == "":
        raise InvalidArgumentError(f"{field} is required")
    return value.strip()


def _num(value: Any) -> float | None:
    """Return ``value`` as a finite float or ``None``."""
    if value is None or _is_bool(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _round(value: Any, digits: int = 4) -> float | None:
    """Round a finite number for output, preserving ``None``."""
    number = _num(value)
    return round(number, digits) if number is not None else None


class MarketMonitorService:
    """Stateful market monitor used by the SDK and the HTTP sidecar.

    Parameters
    ----------
    data_dir:
        Directory for ``market-monitor.db``.  Defaults to
        ``$DSH_HOME/market-monitor`` when ``$DSH_HOME`` exists, else
        ``~/.market-monitor``.
    provider:
        ``auto`` (probe Yahoo, fall back to the simulator), ``synthetic`` or
        ``yahoo``.  Falls back to a simulator with ``degraded=True`` when an
        explicitly selected Yahoo provider is unreachable.
    poll_seconds:
        Refresh interval for the monitoring loop and quote cache (clamped to
        5..3600).
    benchmark:
        Benchmark symbol for correlation analysis (default ``^GSPC``).
    start_monitor:
        Start the daemon monitoring loop immediately (the sidecar passes
        ``True``; the SDK defaults to ``False``).
    now_fn:
        Injectable clock (epoch seconds) used for deterministic tests.
    """

    def __init__(
        self,
        data_dir: str | os.PathLike[str] | None = None,
        provider: str = "auto",
        poll_seconds: int = 15,
        benchmark: str = "^GSPC",
        start_monitor: bool = False,
        now_fn: Callable[[], float] = time.time,
    ) -> None:
        self._now_fn = now_fn
        from .storage import layout, resolve_data_dir

        self.data_dir = resolve_data_dir(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._store = Store(layout(self.data_dir).cache_db)
        self._store.seed_instruments(catalog_items())
        if normalize_provider_name(provider) != "synthetic":
            purged = self._store.purge_synthetic_market_cache()
            if purged["bars"] or purged["quotes"]:
                LOGGER.warning(
                    "removed %d synthetic bar row(s) and %d synthetic quote(s) "
                    "from the hot cache",
                    purged["bars"], purged["quotes"],
                )
        self._lock = threading.RLock()
        self._quotes: dict[str, tuple[dict[str, Any], float]] = {}
        self._daily_cache: dict[tuple[str, str], tuple[list[dict[str, Any]], float, str]] = {}
        self._intraday_cache: dict[tuple[str, str], tuple[list[dict[str, Any]], float, str]] = {}
        self._daily_history_cache: dict[
            str, tuple[list[dict[str, Any]], float, bool]
        ] = {}
        self._started_at = self._now()
        self._shutdown = threading.Event()
        self._monitor_thread: threading.Thread | None = None
        self._last_sync_at: str | None = None
        self._sidecar_port: int | None = None
        self._sidecar_pid = os.getpid()
        self._data_manager: Any = None
        self._closed = False
        mode = normalize_provider_name(provider)
        poll = _clamp_int(_to_int(poll_seconds, "poll_seconds"), 5, 3600)
        benchmark_symbol = normalize_symbol(benchmark)
        stored = self._store.get_settings()
        history_points = analytics.clamp_history_points(
            stored.get("history_points", analytics.HISTORY_POINTS_DEFAULT)
        )
        stored.update(
            {
                "provider": mode,
                "poll_seconds": poll,
                "benchmark": benchmark_symbol,
                "history_points": history_points,
            }
        )
        self._settings = self._store.update_settings(stored)
        self._settings["provider"] = mode
        self._settings["poll_seconds"] = poll
        self._settings["benchmark"] = benchmark_symbol
        self._settings["history_points"] = history_points
        self._apply_selection(resolve_provider(mode, now_fn=self._now_fn))
        self._seed_watchlist()
        if start_monitor:
            self.start_monitor()

    # ------------------------------------------------------------------
    # Lifecycle / settings plumbing
    # ------------------------------------------------------------------
    def attach_data_layer(self, manager: Any) -> None:
        """Attach the collection manager (created and started by the sidecar)."""
        self._data_manager = manager
        try:
            manager.set_watchlist_provider(lambda: self._monitored_symbols())
        except Exception:  # pragma: no cover - manager contract is internal
            LOGGER.exception("could not bind watchlist provider")
        LOGGER.info("data collection layer attached")

    @property
    def data_manager(self) -> Any:
        """The attached collection manager, or ``None`` when absent."""
        return self._data_manager

    def _data_layer(self) -> Any:
        """Return the attached manager, creating a lazy query-only one for SDK use."""
        if self._data_manager is None:
            from .data.manager import MarketDataManager

            manager = MarketDataManager(
                self.data_dir,
                settings={"data_poll_seconds": 5.0},
                enabled=False,
                watchlist_provider=lambda: self._monitored_symbols(),
                logger=LOGGER,
            )
            self._data_manager = manager
        return self._data_manager

    def _now(self) -> float:
        """Return the current epoch seconds from the injected clock."""
        return float(self._now_fn())

    def _iso(self, timestamp: float | None = None) -> str:
        """Format an epoch timestamp (default: now) as ISO UTC with ``Z``."""
        moment = datetime.fromtimestamp(
            self._now() if timestamp is None else timestamp, tz=timezone.utc
        )
        return moment.strftime("%Y-%m-%dT%H:%M:%SZ")

    def _apply_selection(self, selection: Any) -> None:
        """Activate a resolved provider and clear provider-derived caches."""
        with self._lock:
            self._provider_mode = selection.requested
            self._provider = selection.provider
            self._degraded = bool(selection.degraded)
            self._last_error = selection.last_error
            self._quotes.clear()
            self._daily_cache.clear()
            self._intraday_cache.clear()
            self._daily_history_cache.clear()
        LOGGER.info(
            "provider active=%s mode=%s degraded=%s",
            selection.provider.name,
            selection.requested,
            selection.degraded,
        )

    def _seed_watchlist(self) -> None:
        """Seed the default watchlist on the very first run."""
        if self._store.watchlist_symbols():
            return
        for symbol in DEFAULT_WATCHLIST:
            if get_instrument(symbol) is not None:
                self._store.add_watch(symbol)
        LOGGER.info("seeded watchlist with %s", ", ".join(DEFAULT_WATCHLIST))

    def _current_poll_seconds(self) -> int:
        """Return the currently configured poll interval."""
        value = self._settings.get("poll_seconds", 15)
        return _clamp_int(_to_int(value, "poll_seconds", default=15), 5, 3600)

    @property
    def benchmark(self) -> str:
        """The configured benchmark symbol."""
        return str(self._settings.get("benchmark") or "^GSPC")

    def set_sidecar(self, port: int | None, pid: int | None = None) -> None:
        """Record sidecar binding details for ``meta.sidecar``."""
        self._sidecar_port = port
        if pid is not None:
            self._sidecar_pid = int(pid)

    def health(self) -> dict[str, Any]:
        """Return the lightweight liveness/health payload."""
        payload: dict[str, Any] = {
            "ok": True,
            "version": __version__,
            "provider": self._provider.name,
            "uptime_s": round(max(0.0, self._now() - self._started_at), 1),
            "poll_seconds": self._current_poll_seconds(),
            "symbols": len(self._store.watchlist_symbols()),
            "last_sync_at": self._last_sync_at,
            "degraded": self._degraded,
        }
        if self._degraded and self._last_error:
            payload["error"] = self._last_error
        return payload

    def meta(self) -> dict[str, Any]:
        """Return the service/provider/version metadata payload."""
        return {
            "version": __version__,
            "api_version": API_VERSION,
            "provider": {
                "mode": self._provider_mode,
                "active": self._provider.name,
                "live": bool(self._provider.live),
                "degraded": self._degraded,
                "last_error": self._last_error,
            },
            "sidecar": {
                "port": self._sidecar_port,
                "pid": self._sidecar_pid,
                "uptime_s": round(max(0.0, self._now() - self._started_at), 1),
                "data_dir": str(self.data_dir),
            },
            "settings": self.get_settings(),
            "capabilities": [
                "catalog",
                "quotes",
                "history",
                "overlays",
                "analysis",
                "screener",
                "alerts",
                "events",
                "portfolio",
                "collection",
                "settings",
            ],
            "catalog_size": len(catalog_items()),
            "watchlist_size": len(self._store.watchlist_symbols()),
        }

    # ------------------------------------------------------------------
    # Catalog and watchlist
    # ------------------------------------------------------------------
    def catalog(
        self,
        q: str | None = None,
        type: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """Return catalog items filtered by query, type and limit.

        Once the collection layer has persisted reference data, catalog search
        reads ``ref_instrument`` through the warehouse; the shipped static
        catalog is only an offline fallback for a fresh or detached engine.
        """
        limit_value = (
            _clamp_int(_to_int(limit, "limit"), 1, CATALOG_MAX_LIMIT)
            if limit is not None
            else CATALOG_MAX_LIMIT
        )
        manager = self._data_manager
        if manager is not None:
            try:
                rows = manager.warehouse.list_instruments(
                    query=q,
                    instrument_type=type,
                    limit=500 if q else CATALOG_MAX_LIMIT,
                )
            except Exception:  # pragma: no cover - fall back to the static catalog
                LOGGER.exception("could not read persisted catalog rows")
                rows = []
            if q:
                needle = str(q).strip().lower()

                def rank(row: Mapping[str, Any]) -> tuple[int, str]:
                    symbol = str(row.get("symbol") or "").strip().lower()
                    name = str(row.get("name") or "").strip().lower()
                    if symbol == needle:
                        weight = 0
                    elif symbol.startswith(needle):
                        weight = 1
                    elif name.startswith(needle):
                        weight = 2
                    else:
                        weight = 3
                    return (weight, symbol)

                rows = sorted(rows, key=rank)
            items: list[dict[str, Any]] = []
            seen: set[str] = set()
            for row in rows:
                symbol = str(row.get("symbol") or "").strip().upper()
                if not symbol or symbol in seen:
                    continue
                seen.add(symbol)
                items.append({
                    "symbol": symbol,
                    "name": str(row.get("name") or symbol),
                    "exchange": str(row.get("mic") or ""),
                    "type": str(row.get("type") or ""),
                    "sector": str(row.get("sector") or ""),
                    "currency": str(row.get("currency") or "USD"),
                    "default_watch": False,
                })
                if len(items) >= limit_value:
                    break
            if items:
                return {"items": items, "source": "warehouse"}
        items = catalog_items()
        if q:
            needle = str(q).strip().lower()
            items = [
                item
                for item in items
                if needle in item["symbol"].lower() or needle in item["name"].lower()
            ]
        if type:
            wanted = str(type).strip().lower()
            items = [item for item in items if item["type"] == wanted]
        return {"items": items[:limit_value], "source": "catalog"}

    def list_watchlist(self) -> dict[str, Any]:
        """Return the watchlist in display order."""
        return {"items": self._store.list_watchlist()}

    def add_watch(self, symbol: str, note: str = "") -> dict[str, Any]:
        """Add a symbol to the watchlist (idempotent) and return the item."""
        normalized = normalize_symbol(symbol)
        note_value = alerts_engine.validate_note(note)
        if not self._store.has_instrument(normalized):
            self._seed_cache_instrument(normalized)
        item, created = self._store.add_watch(normalized, note_value)
        return {"item": item, "created": created}

    def _seed_cache_instrument(self, symbol: str) -> None:
        """Persist minimal cache metadata for a symbol, preferring warehouse rows."""
        manager = self._data_manager
        if manager is not None:
            try:
                instrument = manager.warehouse.find_instrument_by_provider_symbol(symbol)
                if instrument is not None:
                    self._store.ensure_instrument(
                        symbol,
                        name=instrument.get("name"),
                        exchange=instrument.get("mic") or "",
                        type_=instrument.get("type") or "stock",
                        sector=instrument.get("sector") or "Unknown",
                        currency=instrument.get("currency") or "USD",
                    )
                    return
                root = manager.warehouse.find_commodity_root_by_provider_symbol(symbol)
                if root is not None:
                    self._store.ensure_instrument(
                        symbol,
                        name=root.get("name"),
                        exchange=root.get("venue") or "",
                        type_="commodity",
                        sector=root.get("category") or "Commodity",
                        currency=root.get("currency") or "USD",
                    )
                    return
            except Exception:  # pragma: no cover - metadata lookup is best effort
                LOGGER.warning("could not read warehouse metadata for %s", symbol)
        self._store.ensure_instrument(symbol)

    def remove_watch(self, symbol: str) -> dict[str, Any]:
        """Remove a symbol from the watchlist (idempotent)."""
        normalized = normalize_symbol(symbol)
        self._store.remove_watch(normalized)
        with self._lock:
            self._quotes.pop(normalized, None)
        return {"ok": True, "removed": normalized}

    def set_note(self, symbol: str, note: str) -> dict[str, Any]:
        """Update the note of a watched symbol."""
        normalized = normalize_symbol(symbol)
        note_value = alerts_engine.validate_note(note)
        item = self._store.set_watch_note(normalized, note_value)
        if item is None:
            raise NotFoundError(f"{normalized} is not in the watchlist")
        return {"item": item}

    # ------------------------------------------------------------------
    # Symbol helpers
    # ------------------------------------------------------------------
    def _symbol_known(self, symbol: str) -> bool:
        """Return ``True`` when catalog, store or bar cache knows the symbol."""
        if get_instrument(symbol) is not None:
            return True
        if self._store.has_instrument(symbol):
            return True
        if self._store.is_watched(symbol):
            return True
        return self._store.has_bars(symbol)

    def _require_known(self, symbol: str) -> None:
        """Raise ``symbol_not_found`` unless the symbol is known locally."""
        if not self._symbol_known(symbol):
            raise SymbolNotFoundError(f"unknown symbol: {symbol}")

    @staticmethod
    def _instrument_metadata(symbol: str, stored: Mapping[str, Any] | None) -> dict[str, str]:
        """Return a merged instrument metadata dictionary for ``symbol``."""
        instrument = get_instrument(symbol)
        if instrument is not None:
            return {
                "name": instrument.name,
                "exchange": instrument.exchange,
                "type": instrument.type,
                "sector": instrument.sector,
                "currency": instrument.currency,
            }
        if stored:
            return {
                "name": str(stored.get("name") or symbol),
                "exchange": str(stored.get("exchange") or ""),
                "type": str(stored.get("type") or "stock"),
                "sector": str(stored.get("sector") or ""),
                "currency": str(stored.get("currency") or "USD"),
            }
        return {
            "name": symbol,
            "exchange": "",
            "type": "stock",
            "sector": "",
            "currency": "USD",
        }

    def _resolve_symbols(
        self, symbols: str | Iterable[str] | None
    ) -> list[str]:
        """Normalise an explicit symbol list (None means the whole watchlist)."""
        if symbols is None:
            return self._store.watchlist_symbols()
        if isinstance(symbols, str):
            parts: Iterable[Any] = [part for part in symbols.split(",") if part.strip()]
        else:
            parts = symbols
        result: list[str] = []
        for part in parts:
            symbol = normalize_symbol(part)
            self._require_known(symbol)
            if symbol not in result:
                result.append(symbol)
        return result

    # ------------------------------------------------------------------
    # Quote refresh, caching and provider fallback
    # ------------------------------------------------------------------
    def _quote_ttl(self) -> float:
        """Return the quote cache TTL in seconds."""
        return float(self._current_poll_seconds())

    def _clear_symbol_caches(self, symbol: str) -> None:
        """Drop cached quote/bar/history data for one symbol."""
        with self._lock:
            self._quotes.pop(symbol, None)
            self._daily_history_cache.pop(symbol, None)
            for key in [key for key in self._daily_cache if key[0] == symbol]:
                self._daily_cache.pop(key, None)
            for key in [key for key in self._intraday_cache if key[0] == symbol]:
                self._intraday_cache.pop(key, None)

    def _recover_provider(self, error: MarketMonitorError) -> Any:
        """Kept for compatibility; never fabricates a market-data fallback."""
        return None

    def _enrich_quote(self, symbol: str, raw: Mapping[str, Any]) -> dict[str, Any]:
        """Complete a provider quote with catalog metadata and derived fields."""
        stored = self._store.get_instrument(symbol)
        metadata = self._instrument_metadata(symbol, stored)
        price = _num(raw.get("price"))
        if price is None:
            raise ProviderUnavailableError(
                f"provider returned no price for {symbol}", symbol_level=True
            )
        prev_close = _num(raw.get("prev_close"))
        if prev_close is None:
            prev_close = price
        change = _num(raw.get("change"))
        if change is None:
            change = price - prev_close
        change_pct = _num(raw.get("change_pct"))
        if change_pct is None:
            change_pct = (change / prev_close * 100.0) if prev_close else 0.0
        open_price = _num(raw.get("open"))
        high = _num(raw.get("high"))
        low = _num(raw.get("low"))
        volume = _num(raw.get("volume"))
        return {
            "symbol": symbol,
            "name": str(raw.get("name") or metadata["name"]),
            "exchange": str(raw.get("exchange") or metadata["exchange"]),
            "type": str(raw.get("type") or metadata["type"]),
            "sector": str(raw.get("sector") or metadata["sector"]),
            "currency": str(raw.get("currency") or metadata["currency"]),
            "price": price,
            "prev_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "open": open_price if open_price is not None else prev_close,
            "high": high if high is not None else max(price, prev_close),
            "low": low if low is not None else min(price, prev_close),
            "volume": volume if volume is not None else 0.0,
            "market_state": str(raw.get("market_state") or "closed"),
            "as_of": str(raw.get("as_of") or self._iso()),
            "source": str(raw.get("source") or self._provider.name),
            "stale": bool(raw.get("stale", False)),
        }

    def _fetch_quote(self, symbol: str) -> dict[str, Any]:
        """Fetch and enrich a quote from the active provider, then canonical data.

        The provider is authoritative so quotes and chart history come from the
        same market view (a synthetic quote never overwrites a Yahoo chart or
        vice versa). The canonical warehouse quote is the fallback when the
        active provider cannot answer, which preserves the multi-channel data
        layer without mixing two sources in one chart.
        """
        provider = self._provider
        raw = None
        if not self._degraded:
            try:
                raw = provider.quote(symbol)
            except MarketMonitorError as error:
                replacement = self._recover_provider(error)
                if replacement is not None:
                    try:
                        raw = replacement.quote(symbol)
                    except MarketMonitorError:
                        raw = None
                if raw is None:
                    error_for_fallback = error
                else:
                    error_for_fallback = None
        else:
            error_for_fallback = ProviderUnavailableError(
                self._last_error or f"provider {provider.name} is unavailable"
            )
        if raw is None:
            manager = self._data_manager
            canonical = None
            if manager is not None:
                try:
                    canonical = manager.quote_for_symbol(symbol)
                except Exception:  # pragma: no cover - canonical read must not block
                    canonical = None
            if canonical is not None:
                return self._enrich_quote(symbol, canonical)
            if error_for_fallback is not None:
                raise error_for_fallback
            raise ProviderUnavailableError(f"quote refresh failed for {symbol}")
        return self._enrich_quote(symbol, raw)

    def _quote_from_stored_bars(self, symbol: str) -> dict[str, Any] | None:
        """Derive a stale quote from the last two stored daily bars."""
        bars = self._store.get_bars(symbol, "1d", limit=2)
        if not bars:
            return None
        last = bars[-1]
        price = _num(last.get("c"))
        if price is None:
            return None
        if len(bars) >= 2:
            prev_close = _num(bars[-2].get("c")) or price
        else:
            prev_close = _num(last.get("o")) or price
        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0
        stored = self._store.get_instrument(symbol)
        metadata = self._instrument_metadata(symbol, stored)
        bar_time = str(last.get("t") or "")
        as_of = bar_time if "T" in bar_time else f"{bar_time}T00:00:00Z"
        return {
            "symbol": symbol,
            "name": metadata["name"],
            "exchange": metadata["exchange"],
            "type": metadata["type"],
            "sector": metadata["sector"],
            "currency": metadata["currency"],
            "price": price,
            "prev_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "open": _num(last.get("o")) or price,
            "high": _num(last.get("h")) or price,
            "low": _num(last.get("l")) or price,
            "volume": _num(last.get("v")) or 0.0,
            "market_state": "closed",
            "as_of": as_of,
            "source": "cache",
            "stale": True,
        }

    def _quote_from_fallback(
        self, symbol: str, error: MarketMonitorError
    ) -> dict[str, Any]:
        """Serve a persisted/cached quote or a bar-derived quote, or re-raise."""
        persisted = self._read_persisted_quote(symbol)
        if persisted is not None:
            quote = dict(persisted["quote"])
            quote["stale"] = True
            quote["source"] = "cache"
            return quote
        with self._lock:
            cached = self._quotes.get(symbol)
        if cached is not None:
            quote = dict(cached[0])
            quote["stale"] = True
            quote["source"] = "cache"
            return quote
        derived = self._quote_from_stored_bars(symbol)
        if derived is not None:
            return derived
        raise ProviderUnavailableError(
            f"no market data available for {symbol}: {error}"
        ) from error

    def _read_persisted_quote(self, symbol: str) -> dict[str, Any] | None:
        """Read the last persisted quote row, or ``None``."""
        try:
            return self._store.get_quote_cache(symbol)
        except Exception:  # pragma: no cover - a read failure degrades to fetch
            LOGGER.exception("could not read persisted quote for %s", symbol)
            return None

    def _persist_quote(self, symbol: str, quote: Mapping[str, Any]) -> dict[str, Any]:
        """Write a quote to SQLite and return the row read back from disk.

        The plugin must never render a quote that only exists in memory, so the
        service persists first and serves the persisted representation.  If the
        write fails, an older persisted quote is served as stale; otherwise the
        error is surfaced.
        """
        try:
            stored = self._store.upsert_quote_cache(
                symbol,
                quote,
                provider=self._provider.name,
                updated_at=self._now(),
            )
            return stored
        except Exception as error:  # pragma: no cover - disk failures are rare
            LOGGER.warning("failed to persist quote for %s: %s", symbol, error)
            persisted = self._read_persisted_quote(symbol)
            if persisted is not None:
                stale = dict(persisted["quote"])
                stale["stale"] = True
                stale["source"] = "cache"
                return {**persisted, "quote": stale}
            raise StorageUnavailableError(
                f"could not persist quote for {symbol}: {error}"
            ) from error

    def _get_quote(self, symbol: str, force: bool = False) -> dict[str, Any]:
        """Return a persisted quote, refreshing through the cache TTL.

        The read path is disk-first: a fresh row from ``quote_cache`` is served
        without touching a provider, and any refreshed quote is persisted and
        re-read before it reaches an API response.
        """
        symbol = normalize_symbol(symbol)
        now = self._now()
        persisted = self._read_persisted_quote(symbol)
        if persisted is not None:
            quote = dict(persisted["quote"])
            source = str(quote.get("source") or "")
            allowed_sources = {self._provider.name, "cache", ""}
            if source not in allowed_sources and self._provider.name in ("synthetic", "yahoo"):
                # Do not serve a quote from a different provider than the
                # active chart source (e.g. an old Sina quote while the
                # synthetic provider is active): that is what made the same
                # day disagree across windows.
                persisted = None
        if (
            persisted is not None
            and not force
            and (now - persisted["updated_at"]) < self._quote_ttl()
        ):
            quote = dict(persisted["quote"])
            with self._lock:
                self._quotes[symbol] = (quote, persisted["updated_at"])
            return dict(quote)
        try:
            quote = self._fetch_quote(symbol)
        except MarketMonitorError as error:
            quote = self._quote_from_fallback(symbol, error)
        stored = self._persist_quote(symbol, quote)
        with self._lock:
            self._quotes[symbol] = (dict(stored["quote"]), stored["updated_at"])
        return dict(stored["quote"])

    def quote(self, symbol: str) -> dict[str, Any]:
        """Return one quote (``404`` when the symbol is unknown)."""
        normalized = normalize_symbol(symbol)
        self._require_known(normalized)
        return self._get_quote(normalized)

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------
    @staticmethod
    def _clean_bar(bar: Mapping[str, Any]) -> dict[str, Any] | None:
        """Validate a provider bar, returning ``None`` when it is unusable."""
        if not isinstance(bar, Mapping):
            return None
        label = bar.get("t")
        if not isinstance(label, str) or not label:
            return None
        values = {}
        for key in ("o", "h", "l", "c", "v"):
            value = _num(bar.get(key))
            if value is None:
                return None
            values[key] = value
        return {
            "t": label,
            "o": values["o"],
            "h": values["h"],
            "l": values["l"],
            "c": values["c"],
            "v": values["v"],
        }

    def _history_points(self) -> int:
        """Return the configured chart point target (default 60, clamp 20..120)."""
        return analytics.clamp_history_points(
            self._settings.get("history_points", analytics.HISTORY_POINTS_DEFAULT)
        )

    def _fetch_provider_daily(
        self, symbol: str, lookback_days: int
    ) -> tuple[list[dict[str, Any]], str]:
        """Fetch a daily bar series from the active provider."""
        provider = self._provider
        fetch = getattr(provider, "history_daily", None)
        if callable(fetch):
            return list(fetch(symbol, lookback_days)), str(provider.name)
        # Legacy provider: only ``history`` exists.  Accept it only when the
        # payload really carries daily bars; anything else counts as missing.
        payload = provider.history(symbol, "1Y")
        if not isinstance(payload, Mapping):
            raise ProviderUnavailableError(
                f"provider {provider.name} returned no daily history for {symbol}"
            )
        if str(payload.get("interval") or "") != "1d":
            raise ProviderUnavailableError(
                f"provider {provider.name} returned no daily history for {symbol}"
            )
        return (
            list(payload.get("bars") or []),
            str(payload.get("source") or provider.name),
        )

    def _clean_daily_bars(
        self, raw_bars: Iterable[Mapping[str, Any]] | None
    ) -> list[dict[str, Any]]:
        """Validate provider bars, discarding unusable rows."""
        bars: list[dict[str, Any]] = []
        for bar in raw_bars or []:
            cleaned = self._clean_bar(bar)
            if cleaned is not None:
                bars.append(cleaned)
        return bars

    def _listing_boundary(self, symbol: str) -> str:
        """Return an instrument's listing/first-seen boundary when known.

        ``ref_instrument.valid_from`` is the listing date recorded by the
        reference index; ``first_seen_at`` is the fallback for sources that do
        not publish an explicit first-trade date. The boundary prevents a
        recently listed symbol (for example an IPO) from showing synthetic or
        provider history from before it existed.
        """
        manager = self._data_manager
        if manager is None:
            return ""
        # Established bundled-catalog instruments (AAPL, MSFT, ^GSPC, …) have
        # no listing boundary: their reference row's valid_from is just when the
        # local reference snapshot was refreshed, not their IPO date.
        if get_instrument(symbol) is not None:
            return ""
        try:
            row = manager.warehouse.find_instrument_by_provider_symbol(symbol)
        except Exception:  # pragma: no cover - reference read is non-fatal
            return ""
        if not row:
            return ""
        # Apply the heuristic only to US listings that are not in the curated
        # catalog and whose real EOD history is still very short. That is the
        # signature of a recent IPO; treating every reference row's valid_from
        # as a listing date would incorrectly trim established companies.
        if str(row.get("mic") or "").upper() not in {
            "XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM",
        }:
            return ""
        try:
            span = manager.warehouse.series_bar_span(str(row["instrument_id"]), "1d")
        except Exception:  # pragma: no cover
            span = None
        if not span or int(span.get("count") or 0) > 8:
            return ""
        for key in ("valid_from", "first_seen_at"):
            value = str(row.get(key) or "").strip()
            if value:
                return value
        return str(span.get("first_ts") or "")

    def _filter_listing_bars(
        self, symbol: str, bars: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Drop bars dated before the instrument's listing boundary."""
        boundary = self._listing_boundary(symbol)
        if not boundary:
            return bars
        boundary_day = boundary[:10]
        filtered: list[dict[str, Any]] = []
        for bar in bars:
            label = str(bar.get("t") or "")
            if not label:
                continue
            if label[:10] < boundary_day:
                continue
            if label[:10] == boundary_day and len(label) > 10 and label < boundary:
                continue
            filtered.append(bar)
        return filtered

    def _trim_intraday_window(
        self, bars: list[dict[str, Any]], range_: str,
    ) -> list[dict[str, Any]]:
        """Select only the intraday sessions a range needs.

        ``1D``/``LIVE`` use the latest trading date present in the intraday
        dataset; ``5D`` uses the last five distinct weekday dates. Daily rows
        are never mixed in — intraday windows are served exclusively from the
        ``5m``/``30m`` density.
        """
        if not bars:
            return []
        if range_ in ("1D", "LIVE"):
            latest = max(str(bar.get("t") or "")[:10] for bar in bars)
            return [bar for bar in bars if str(bar.get("t") or "")[:10] == latest]
        dates = sorted({
            str(bar.get("t") or "")[:10]
            for bar in bars
            if len(str(bar.get("t") or "")) >= 10
        })
        keep = set(dates[-5:])
        return [bar for bar in bars if str(bar.get("t") or "")[:10] in keep]

    def _stored_daily_bars(
        self, symbol: str, limit: int
    ) -> tuple[list[dict[str, Any]], str]:
        """Read persisted ``1d`` bars (bar store first, then warehouse)."""
        try:
            stored = self._store.get_bars(symbol, "1d", limit=limit)
        except Exception:  # pragma: no cover - read failure degrades to warehouse
            LOGGER.warning("could not read stored daily bars for %s", symbol)
            stored = []
        if stored:
            return stored, "cache"
        warehouse = self._warehouse_history_bars(symbol, "1d", limit)
        if warehouse:
            return warehouse, "warehouse"
        return [], ""

    def _daily_history(
        self, symbol: str, lookback_days: int
    ) -> tuple[list[dict[str, Any]], bool]:
        """Return ``(daily bars, stale)`` for the chart/analysis core.

        Daily bars are TTL-cached per symbol and fetched from the provider,
        persisted to the ``1d`` store before being used, and backfilled from
        stored/warehouse daily bars when the provider fails (``stale=True``).
        Intraday rows (``5m``/``30m``) are never consulted, so an old window
        left behind by a previous provider cannot leak into a chart.
        """
        lookback = max(1, int(lookback_days))
        now = self._now()
        with self._lock:
            cached = self._daily_history_cache.get(symbol)
        if cached is not None:
            bars, fetched_at, stale = cached
            if (now - fetched_at) < DAILY_BARS_TTL_SECONDS and len(bars) >= lookback:
                return [dict(bar) for bar in bars[-lookback:]], stale

        error: MarketMonitorError | None = None
        bars: list[dict[str, Any]] = []
        source = ""
        if self._degraded:
            error = ProviderUnavailableError(
                self._last_error or f"provider {self._provider.name} is unavailable"
            )
        else:
            try:
                raw_bars, source = self._fetch_provider_daily(symbol, lookback)
                bars = self._filter_listing_bars(
                    symbol, self._clean_daily_bars(raw_bars),
                )
            except MarketMonitorError as exc:
                error = exc

        stale = False
        if bars:
            try:
                # The provider window is authoritative for this symbol's daily
                # cache: replace, do not merge with rows left by an older
                # provider or calendar convention. A LIMIT read of mixed rows
                # is what made a 1Y window start several months late.
                self._store.replace_bars(
                    symbol, "1d", bars, source or self._provider.name
                )
                reloaded = self._store.get_bars(symbol, "1d", limit=len(bars))
                if reloaded:
                    bars = reloaded
            except Exception as exc:  # pragma: no cover - disk failures are rare
                LOGGER.warning(
                    "failed to persist daily bars for %s: %s", symbol, exc
                )
                bars, _ = self._stored_daily_bars(symbol, lookback)
                bars = self._filter_listing_bars(symbol, bars)
                if not bars:
                    raise StorageUnavailableError(
                        f"could not persist daily history for {symbol}: {exc}"
                    ) from exc
                stale = True
        else:
            bars, _ = self._stored_daily_bars(symbol, lookback)
            bars = self._filter_listing_bars(symbol, bars)
            if not bars:
                message = f"no daily history available for {symbol}"
                if error is not None:
                    message = f"{message}: {error}"
                raise ProviderUnavailableError(message) from error
            stale = True

        bars = bars[-lookback:]
        with self._lock:
            start = max(0, len(bars) - _DAILY_HISTORY_CACHE_BARS)
            self._daily_history_cache[symbol] = (
                [dict(bar) for bar in bars[start:]],
                self._now(),
                stale,
            )
        return [dict(bar) for bar in bars], stale

    def history(
        self,
        symbol: str,
        range_: str = "1Y",
        interval: str | None = None,
        overlays: bool = False,
    ) -> dict[str, Any]:
        """Return chart bars using conventional market-range windows.

        ``1D`` (and its ``LIVE`` alias) shows today's five-minute intraday
        series, ``5D`` shows 30-minute bars across the last five sessions, and
        ``1M/3M/6M/1Y`` return the usual daily lookback (about 22/66/132/252
        trading days). ``interval`` is validated for API compatibility but the
        response interval is implied by the range.
        """
        normalized = normalize_symbol(symbol)
        self._require_known(normalized)
        requested_range = validate_range(range_)
        validate_interval(interval)
        if requested_range in ("LIVE", "1D"):
            return self._history_intraday(
                normalized, requested_range=requested_range, overlays=overlays,
            )
        if requested_range == "5D":
            return self._history_five_day(normalized, overlays=overlays)
        count = _HISTORY_DAILY_BARS[requested_range]
        lookback = int(count * 1.6) + 10
        cache_key = (normalized, requested_range)
        with self._lock:
            entry = self._daily_cache.get(cache_key)
        if entry is not None and (self._now() - entry[1]) < DAILY_BARS_TTL_SECONDS:
            bars = self._filter_listing_bars(normalized, entry[0])
            return self._history_payload(
                normalized,
                requested_range,
                self._merge_quote_into_chart(normalized, bars, requested_range),
                entry[2],
                provider_label=self._provider.name,
                stale=False,
                overlays=overlays,
            )
        try:
            daily_bars, stale = self._daily_history(normalized, lookback)
        except StorageUnavailableError:
            raise
        except MarketMonitorError as error:
            return self._history_fallback(
                normalized, requested_range, entry, error, overlays, 0,
            )
        bars = daily_bars[-count:]
        if not bars:
            return self._history_fallback(
                normalized, requested_range, entry, None, overlays, 0,
            )
        with self._lock:
            self._daily_cache[cache_key] = (
                [dict(bar) for bar in bars], self._now(), "1d",
            )
        return self._history_payload(
            normalized,
            requested_range,
            self._merge_quote_into_chart(normalized, bars, requested_range),
            "1d",
            provider_label="cache" if stale else self._provider.name,
            stale=stale,
            overlays=overlays,
        )

    def _history_intraday(
        self,
        symbol: str,
        *,
        requested_range: str = "1D",
        overlays: bool = False,
    ) -> dict[str, Any]:
        """Return today's intraday (five-minute) chart window."""
        cache_key = (symbol, "1D")
        now = self._now()
        with self._lock:
            entry = self._intraday_cache.get(cache_key)
        if entry is not None and (now - entry[1]) < self._quote_ttl():
            bars = self._trim_intraday_window(
                self._filter_listing_bars(symbol, entry[0]), requested_range,
            )
            return self._history_payload(
                symbol, requested_range, self._merge_quote_into_chart(symbol, bars, requested_range), entry[2],
                provider_label=self._provider.name, stale=False, overlays=overlays,
            )
        stale = False
        bars: list[dict[str, Any]] = []
        try:
            if self._degraded:
                raise ProviderUnavailableError(
                    self._last_error or f"provider {self._provider.name} is unavailable"
                )
            fetch = getattr(self._provider, "history_intraday", None)
            if not callable(fetch):
                raise ProviderUnavailableError(
                    f"provider {self._provider.name} has no intraday history"
                )
            raw_bars = fetch(symbol) or []
            bars = self._filter_listing_bars(
                symbol,
                [
                    cleaned for bar in raw_bars
                    if (cleaned := self._clean_bar(bar)) is not None
                ],
            )
        except StorageUnavailableError:
            raise
        except MarketMonitorError:
            bars = []
        if not bars:
            with self._lock:
                entry = self._intraday_cache.get(cache_key)
            if entry is not None:
                bars = [dict(bar) for bar in entry[0]]
                stale = True
            else:
                return self._history_fallback(
                    symbol, requested_range, None, None, overlays, 0,
                )
        else:
            try:
                self._store.replace_bars(symbol, "5m", bars, str(self._provider.name))
                reloaded = self._store.get_bars(symbol, "5m", limit=len(bars))
                if reloaded:
                    bars = reloaded
            except StorageUnavailableError:
                raise
            except Exception as error:  # noqa: BLE001 - non-fatal cache write
                LOGGER.warning("failed to persist intraday bars for %s: %s", symbol, error)
        with self._lock:
            self._intraday_cache[cache_key] = (
                [dict(bar) for bar in bars], self._now(), "5m",
            )
        bars = self._trim_intraday_window(bars, requested_range)
        return self._history_payload(
            symbol,
            requested_range,
            self._merge_quote_into_chart(symbol, bars, requested_range),
            "5m",
            provider_label="cache" if stale else self._provider.name,
            stale=stale,
            overlays=overlays,
        )

    def _history_five_day(
        self,
        symbol: str,
        *,
        overlays: bool = False,
    ) -> dict[str, Any]:
        """Return the conventional five-day 30-minute chart window."""
        cache_key = (symbol, "5D")
        now = self._now()
        with self._lock:
            entry = self._intraday_cache.get(cache_key)
        if entry is not None and (now - entry[1]) < self._quote_ttl():
            bars = self._trim_intraday_window(
                self._filter_listing_bars(symbol, entry[0]), "5D",
            )
            return self._history_payload(
                symbol, "5D", self._merge_quote_into_chart(symbol, bars, "5D"), entry[2],
                provider_label=self._provider.name, stale=False, overlays=overlays,
            )
        stale = False
        bars: list[dict[str, Any]] = []
        try:
            if self._degraded:
                raise ProviderUnavailableError(
                    self._last_error or f"provider {self._provider.name} is unavailable"
                )
            fetch = getattr(self._provider, "history_five_day", None)
            if callable(fetch):
                raw_bars = fetch(symbol) or []
            else:
                raw_bars = self._provider.history(symbol, "5D").get("bars") or []
            bars = self._filter_listing_bars(
                symbol,
                [
                    cleaned for bar in raw_bars
                    if (cleaned := self._clean_bar(bar)) is not None
                ],
            )
        except StorageUnavailableError:
            raise
        except MarketMonitorError:
            bars = []
        if not bars:
            with self._lock:
                entry = self._intraday_cache.get(cache_key)
            if entry is not None:
                bars = [dict(bar) for bar in entry[0]]
                stale = True
            else:
                bars = self._store.get_bars(symbol, "30m", limit=300)
                bars = self._filter_listing_bars(symbol, bars)
                stale = bool(bars)
        if not bars:
            return self._history_fallback(
                symbol, "5D", None, None, overlays, 0,
            )
        bars = self._trim_intraday_window(bars, "5D")
        if not stale:
            try:
                self._store.replace_bars(symbol, "30m", bars, str(self._provider.name))
                reloaded = self._store.get_bars(symbol, "30m", limit=len(bars))
                if reloaded:
                    bars = reloaded
            except StorageUnavailableError:
                raise
            except Exception as error:  # noqa: BLE001 - non-fatal cache write
                LOGGER.warning("failed to persist 5D bars for %s: %s", symbol, error)
        with self._lock:
            self._intraday_cache[cache_key] = (
                [dict(bar) for bar in bars], self._now(), "30m",
            )
        return self._history_payload(
            symbol,
            "5D",
            self._merge_quote_into_chart(symbol, bars, "5D"),
            "30m",
            provider_label="cache" if stale else self._provider.name,
            stale=stale,
            overlays=overlays,
        )

    def _merge_quote_into_chart(
        self,
        symbol: str,
        bars: Sequence[Mapping[str, Any]],
        range_: str,
    ) -> list[dict[str, Any]]:
        """Make the last chart point agree with the current displayed quote.

        The provider daily series and the quote can come from different
        governed channels (Yahoo primary, Sina/Tencent backup or the simulator).
        Financial sites show the same latest price on every range, so the last
        bar is updated in place: a daily bar gets the quote OHLCV, an aggregated
        point keeps its group open/high/low shape but uses the quote as close.
        """
        values = [dict(bar) for bar in bars]
        if not values:
            return values
        if self._degraded:
            try:
                quote = self.quote(symbol)
            except MarketMonitorError:
                return values
        else:
            try:
                quote = self._provider.quote(symbol)
            except MarketMonitorError:
                try:
                    quote = self.quote(symbol)
                except MarketMonitorError:
                    return values
        price = _num(quote.get("price"))
        if price is None:
            return values
        last = values[-1]
        bar_day = str(last.get("t") or "")[:10]
        quote_day = str(quote.get("as_of") or "")[:10]
        if not bar_day or (quote_day and bar_day != quote_day):
            return values
        if range_ in ("LIVE", "1D", "5D"):
            # Intraday point: keep its bucket open, align the current close and
            # extend high/low with the live quote.
            last["c"] = price
            high = _num(quote.get("high"))
            low = _num(quote.get("low"))
            last["h"] = max(_num(last.get("h")) or price, price, high or price)
            last["l"] = min(_num(last.get("l")) or price, price, low or price)
        else:
            open_price = _num(quote.get("open"))
            high = _num(quote.get("high"))
            low = _num(quote.get("low"))
            volume = _num(quote.get("volume"))
            if open_price is not None:
                last["o"] = open_price
            if high is not None:
                last["h"] = max(high, price)
            else:
                last["h"] = max(_num(last.get("h")) or price, price)
            if low is not None:
                last["l"] = min(low, price)
            else:
                last["l"] = min(_num(last.get("l")) or price, price)
            if volume is not None:
                last["v"] = volume
        last["c"] = price
        last["h"] = max(_num(last.get("h")) or price, last["c"])
        last["l"] = min(_num(last.get("l")) or price, last["c"])
        return values

    def _history_payload(
        self,
        symbol: str,
        range_: str,
        bars: Sequence[Mapping[str, Any]],
        interval: str,
        *,
        provider_label: str,
        stale: bool,
        overlays: bool,
    ) -> dict[str, Any]:
        """Assemble a history response payload."""
        payload: dict[str, Any] = {
            "symbol": symbol,
            "range": range_,
            "interval": interval,
            "provider": provider_label,
            "bars": [dict(bar) for bar in bars],
            "stale": stale,
        }
        if overlays:
            payload["overlays"] = analytics.build_overlays(payload["bars"])
        return payload

    def _warehouse_history_bars(
        self, symbol: str, interval: str, limit: int,
    ) -> list[dict[str, Any]]:
        """Read canonical warehouse bars for a display symbol, if resolvable."""
        manager = self._data_manager
        if manager is None:
            return []
        try:
            series = manager.series_for_symbol(symbol)
            if series is None:
                return []
            rows = manager.warehouse.get_bars(
                series["series_id"], interval=interval, limit=limit,
            )
        except Exception:  # pragma: no cover - read failure degrades to cache
            LOGGER.warning("could not read warehouse history for %s", symbol)
            return []
        bars = []
        for row in rows:
            price = _num(row.get("close"))
            if price is None:
                continue
            bars.append({
                "t": row.get("ts"),
                "o": _num(row.get("open")) or price,
                "h": _num(row.get("high")) or price,
                "l": _num(row.get("low")) or price,
                "c": price,
                "v": _num(row.get("volume")) or 0.0,
            })
        return bars

    def _history_fallback(
        self,
        symbol: str,
        range_: str,
        cached_entry: tuple[list[dict[str, Any]], float, str] | None,
        error: MarketMonitorError | None,
        overlays: bool,
        points: int,
    ) -> dict[str, Any]:
        """Serve cached or stored bars when the provider call fails.

        The fallback never invents a granularity it does not have: intraday
        ranges read only their own ``5m``/``30m`` density and fail if it is
        absent; daily ranges read only stored daily bars. The two densities are
        never mixed.
        """
        if cached_entry is not None:
            bars = self._filter_listing_bars(symbol, cached_entry[0])
            if range_ in ("LIVE", "1D", "5D"):
                bars = self._trim_intraday_window(bars, range_)
            interval = cached_entry[2]
            bar_source = "cache"
        elif range_ in ("LIVE", "1D", "5D"):
            wanted = "5m" if range_ in ("LIVE", "1D") else "30m"
            limit = 3000 if wanted == "5m" else 1000
            bars = self._store.get_bars(symbol, wanted, limit=limit)
            bar_source = "cache"
            if not bars:
                bars = self._warehouse_history_bars(symbol, wanted, limit)
                bar_source = "warehouse"
            bars = self._filter_listing_bars(symbol, bars)
            bars = self._trim_intraday_window(bars, range_)
            interval = wanted
            if not bars:
                message = (
                    f"no real {wanted} bars for {symbol}; "
                    "real-time data is stored separately from daily bars"
                )
                if error is not None:
                    message = f"{message}: {error}"
                raise ProviderUnavailableError(message) from error
        else:
            count = _HISTORY_DAILY_BARS[range_]
            lookback = int(count * 1.6) + 10
            daily, bar_source = self._stored_daily_bars(symbol, lookback)
            bars = self._filter_listing_bars(symbol, daily[-count:])
            interval = "1d"
            if not bars:
                message = f"no cached {range_} bars for {symbol}"
                if error is not None:
                    message = f"{message}: {error}"
                raise ProviderUnavailableError(message) from error
        return self._history_payload(
            symbol,
            range_,
            self._merge_quote_into_chart(symbol, bars, range_),
            interval,
            provider_label=bar_source,
            stale=True,
            overlays=overlays,
        )
    # ------------------------------------------------------------------
    # Analysis and snapshots
    # ------------------------------------------------------------------
    def _merge_quote_into_bars(
        self, bars: list[dict[str, Any]], quote: Mapping[str, Any]
    ) -> list[dict[str, Any]]:
        """Make the latest daily bar reflect the current (partial) quote."""
        price = _num(quote.get("price"))
        if price is None:
            return bars
        today = self._iso()[:10]
        open_price = _num(quote.get("open"))
        high = _num(quote.get("high"))
        low = _num(quote.get("low"))
        volume = _num(quote.get("volume"))
        if bars and str(bars[-1].get("t")) == today:
            bar = dict(bars[-1])
            bar["c"] = price
            if open_price is not None:
                bar["o"] = open_price
            if high is not None:
                bar["h"] = max(_num(bar.get("h")) or high, high)
            if low is not None:
                bar["l"] = min(_num(bar.get("l")) or low, low)
            if volume is not None:
                bar["v"] = volume
            bars[-1] = bar
            return bars
        bars.append(
            {
                "t": today,
                "o": open_price if open_price is not None else price,
                "h": high if high is not None else price,
                "l": low if low is not None else price,
                "c": price,
                "v": volume if volume is not None else 0.0,
            }
        )
        return bars

    def _daily_bars_safe(self, symbol: str) -> list[dict[str, Any]]:
        """Return ~252 daily bars, degrading to an empty list on failure."""
        try:
            bars, _ = self._daily_history(symbol, ANALYSIS_DAILY_BARS)
            return bars
        except MarketMonitorError as error:
            LOGGER.debug("daily bars unavailable for %s: %s", symbol, error)
            return []

    def analysis(self, symbol: str) -> dict[str, Any]:
        """Return the full analysis payload for ``symbol``."""
        normalized = normalize_symbol(symbol)
        self._require_known(normalized)
        quote = self._get_quote(normalized)
        daily_bars, _ = self._daily_history(normalized, ANALYSIS_DAILY_BARS)
        bars = self._merge_quote_into_bars(
            [dict(bar) for bar in daily_bars], quote
        )
        benchmark_bars: list[dict[str, Any]] | None = None
        benchmark_symbol = self.benchmark
        if normalized != benchmark_symbol:
            try:
                benchmark_bars, _ = self._daily_history(
                    benchmark_symbol, ANALYSIS_DAILY_BARS
                )
            except MarketMonitorError as error:
                LOGGER.debug("benchmark bars unavailable: %s", error)
        result = analytics.build_analysis(
            normalized,
            quote,
            bars,
            benchmark_bars=benchmark_bars,
            benchmark_symbol=benchmark_symbol,
            provider=self._provider.name,
        )
        result["as_of"] = quote.get("as_of") or self._iso()
        return result

    def _snapshot_entry(
        self, symbol: str, *, force: bool = False
    ) -> tuple[dict[str, Any], bool]:
        """Return one snapshot quote entry and its staleness flag."""
        quote = self._get_quote(symbol, force=force)
        bars = self._daily_bars_safe(symbol)
        closes = [
            value
            for value in (_num(bar.get("c")) for bar in bars)
            if value is not None
        ]
        entry = dict(quote)
        entry["spark"] = [round(value, 4) for value in closes[-30:]]
        rsi14 = indicators.rsi(closes, 14)
        entry["rsi14"] = round(rsi14, 2) if rsi14 is not None else None
        entry["trend"] = analytics.classify_trend(_num(quote.get("price")), closes)
        return entry, bool(quote.get("stale"))

    def snapshot(
        self, symbols: str | Iterable[str] | None = None
    ) -> dict[str, Any]:
        """Return quote entries (with ``spark``/``rsi14``/``trend``) for symbols."""
        selected = self._resolve_symbols(symbols)
        quotes: list[dict[str, Any]] = []
        stale = False
        for symbol in selected:
            entry, entry_stale = self._snapshot_entry(symbol)
            quotes.append(entry)
            stale = stale or entry_stale
        return {
            "quotes": quotes,
            "as_of": self._iso(),
            "provider": self._provider.name,
            "degraded": self._degraded,
            "stale": stale,
        }

    # ------------------------------------------------------------------
    # Sync and monitoring
    # ------------------------------------------------------------------
    def _monitored_symbols(self) -> list[str]:
        """Return watchlist plus portfolio symbols in stable order."""
        symbols = list(self._store.watchlist_symbols())
        for position in self._store.list_positions():
            if position["symbol"] not in symbols:
                symbols.append(position["symbol"])
        return symbols

    def sync(self, symbols: str | Iterable[str] | None = None) -> dict[str, Any]:
        """Force-refresh quotes for the monitored universe and evaluate alerts."""
        if symbols is None:
            selected = self._monitored_symbols()
        else:
            selected = self._resolve_symbols(symbols)
        quotes: list[dict[str, Any]] = []
        for symbol in selected:
            try:
                entry, _ = self._snapshot_entry(symbol, force=True)
            except MarketMonitorError as error:
                LOGGER.warning("sync failed for %s: %s", symbol, error)
                continue
            quotes.append(entry)
        for rule in self._store.list_rules():
            if not rule.get("enabled"):
                continue
            if rule.get("kind") in alerts_engine.BAR_KINDS:
                self._daily_bars_safe(str(rule.get("symbol")))
        triggered = self._evaluate_alerts()
        self._last_sync_at = self._iso()
        return {
            "quotes": quotes,
            "triggered": triggered,
            "synced_at": self._last_sync_at,
            "provider": self._provider.name,
            "degraded": self._degraded,
        }

    def _evaluate_alerts(self, now_ts: float | None = None) -> list[dict[str, Any]]:
        """Evaluate armed alert rules, persisting and returning triggered events."""
        rules = self._store.list_rules()
        if not rules:
            return []
        current = self._now() if now_ts is None else float(now_ts)
        quotes: dict[str, dict[str, Any]] = {}
        daily_bars: dict[str, list[dict[str, Any]]] = {}
        for rule in rules:
            if not rule.get("enabled"):
                continue
            symbol = str(rule.get("symbol"))
            if symbol not in quotes:
                try:
                    quotes[symbol] = self._get_quote(symbol)
                except MarketMonitorError as error:
                    LOGGER.warning("alert quote failed for %s: %s", symbol, error)
                    continue
            if rule.get("kind") in alerts_engine.BAR_KINDS and symbol not in daily_bars:
                daily_bars[symbol] = self._daily_bars_safe(symbol)
        events = alerts_engine.evaluate_rules(rules, quotes, daily_bars, now_ts=current)
        for event in events:
            try:
                self._store.add_event(event)
                self._store.mark_rule_triggered(event["rule_id"], event["ts"])
            except Exception:  # pragma: no cover - persistence failure is non-fatal
                LOGGER.exception("failed to persist alert event %s", event.get("id"))
        if events:
            LOGGER.info("triggered %d alert event(s)", len(events))
        return events

    def start_monitor(self) -> None:
        """Start the daemon monitoring loop if it is not running already."""
        with self._lock:
            if self._monitor_thread is not None and self._monitor_thread.is_alive():
                return
            if self._shutdown.is_set():
                self._shutdown = threading.Event()
            thread = threading.Thread(
                target=self._monitor_loop,
                name="market-monitor-loop",
                daemon=True,
            )
            self._monitor_thread = thread
            thread.start()
        LOGGER.info("monitor loop started (poll %ss)", self._current_poll_seconds())

    def _monitor_loop(self) -> None:
        """Refresh and evaluate until shutdown; never dies on provider errors."""
        while not self._shutdown.is_set():
            try:
                self.sync()
            except Exception:  # pragma: no cover - defensive, logged
                LOGGER.exception("monitor cycle failed")
            try:
                interval = self._current_poll_seconds()
            except Exception:  # pragma: no cover - defensive
                interval = 15
            self._shutdown.wait(interval)

    def stop_monitor(self) -> None:
        """Stop and join the monitoring loop."""
        self._shutdown.set()
        thread = self._monitor_thread
        self._monitor_thread = None
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=5.0)

    # ------------------------------------------------------------------
    # Data collection layer (canonical warehouse)
    # ------------------------------------------------------------------
    def data_status(self) -> dict[str, Any]:
        """Collection health: jobs, source budgets, circuit state and tracked series."""
        return self._data_layer().status()

    def data_coverage(self) -> dict[str, Any]:
        """Canonical coverage counts and freshness per domain."""
        return self._data_layer().coverage()

    def data_sources(self) -> dict[str, Any]:
        """Remote source registry with usage budgets."""
        return self._data_layer().sources()

    def data_runs(self, limit: int = 20) -> dict[str, Any]:
        """Recent ingestion runs."""
        return self._data_layer().runs(limit=_clamp_int(_to_int(limit, "limit", default=20), 1, 100))

    def data_ingest(self, job_id: str | None = None, dry_run: bool = False) -> dict[str, Any]:
        """Run one job or all due jobs through the polite collector."""
        return self._data_layer().ingest(job_id, dry_run=bool(dry_run))

    def data_tracked(self) -> dict[str, Any]:
        """Tracked series counts for each collection pass."""
        return {"tracked": self._data_layer().tracked_summary()}

    def data_backfill(self) -> dict[str, Any]:
        """Recent-window coverage summary for the automatic backfill job."""
        return self._data_layer().backfill_status()

    def news(
        self,
        entity_id: str | None = None,
        source_id: str | None = None,
        since: str | None = None,
        limit: int = 50,
        symbol: str | None = None,
    ) -> dict[str, Any]:
        """Stored news articles with linked entities, newest first."""
        return self._data_layer().news(
            entity_id=entity_id,
            source_id=source_id,
            since=since,
            limit=_clamp_int(_to_int(limit, "limit", default=50), 1, 200),
            symbol=symbol,
        )

    def get_news(self, article_id: str) -> dict[str, Any]:
        """Read one stored article."""
        return self._data_layer().get_news(article_id)

    def ref_exchanges(self) -> dict[str, Any]:
        """Canonical exchange reference rows."""
        return self._data_layer().exchanges()

    def ref_instruments(
        self,
        mic: str | None = None,
        query: str | None = None,
        type_: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Search canonical listed-instrument reference rows."""
        return self._data_layer().instruments(
            mic=mic,
            query=query,
            instrument_type=type_,
            limit=_clamp_int(_to_int(limit, "limit", default=100), 1, 500),
            offset=max(0, _to_int(offset, "offset", default=0)),
        )

    def ref_indices(self, query: str | None = None, limit: int = 100) -> dict[str, Any]:
        """Canonical index reference rows."""
        return self._data_layer().indices(
            query=query,
            limit=_clamp_int(_to_int(limit, "limit", default=100), 1, 500),
        )

    def ref_commodities(self) -> dict[str, Any]:
        """Commodity roots and monthly contracts."""
        return self._data_layer().commodities()

    def index_overview(self) -> dict[str, Any]:
        """Generic index registry with entry stats and refresh history."""
        return self._data_layer().index_overview()

    def company_index(self) -> dict[str, Any]:
        """Company master index definition, stats, changes and refreshes."""
        return self._data_layer().company_index()

    def index_entries(
        self,
        index_id: str,
        *,
        market: str | None = None,
        status: str | None = None,
        profile_status: str | None = None,
        query: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Page through one index's entries."""
        return self._data_layer().index_entries(
            _require_text(index_id, "index_id"),
            market=market,
            status=status,
            profile_status=profile_status,
            query=query,
            limit=_clamp_int(_to_int(limit, "limit", default=100), 1, 500),
            offset=max(0, _to_int(offset, "offset", default=0)),
        )

    def index_changes(self, index_id: str, limit: int = 50) -> dict[str, Any]:
        """Recent change-log rows for one index."""
        return self._data_layer().index_changes(
            _require_text(index_id, "index_id"),
            limit=_clamp_int(_to_int(limit, "limit", default=50), 1, 200),
        )

    def index_refreshes(self, index_id: str, limit: int = 10) -> dict[str, Any]:
        """Recent refresh runs for one index."""
        return self._data_layer().index_refreshes(
            _require_text(index_id, "index_id"),
            limit=_clamp_int(_to_int(limit, "limit", default=10), 1, 50),
        )

    def index_refresh(self, index_id: str, dry_run: bool = False) -> dict[str, Any]:
        """Run the refresh job attached to one index."""
        return self._data_layer().index_refresh(
            _require_text(index_id, "index_id"), dry_run=bool(dry_run),
        )

    def company_profile(self, entity_id: str) -> dict[str, Any]:
        """Index entry plus the collected company profile for one entity."""
        return self._data_layer().company_profile(_require_text(entity_id, "entity_id"))

    def china_overview(self) -> dict[str, Any]:
        """China market overview: securities/fund/commodity counts and top movers."""
        return self._data_layer().china_overview()

    def series_bars(
        self, series_id: str, interval: str = "1d", limit: int = 250,
    ) -> dict[str, Any]:
        """Stored canonical bars for one typed series id."""
        if not isinstance(series_id, str) or series_id.strip() == "":
            raise InvalidArgumentError("series_id is required")
        return self._data_layer().series_bars(
            series_id.strip(),
            interval=str(interval or "1d"),
            limit=_clamp_int(_to_int(limit, "limit", default=250), 1, 2000),
        )

    def shutdown(self) -> None:
        """Stop the monitoring loop and release resources."""
        self.close()

    def close(self) -> None:
        """Stop the monitoring loop, collection layer and store (idempotent)."""
        if self._closed:
            return
        self._closed = True
        try:
            self.stop_monitor()
            if self._data_manager is not None:
                self._data_manager.stop()
                self._data_manager = None
        finally:
            self._store.close()
        LOGGER.info("service closed")

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------
    def list_alerts(self) -> dict[str, Any]:
        """Return all alert rules with their computed ``armed`` flag."""
        now = self._now()
        return {
            "rules": [
                alerts_engine.rule_payload(rule, now)
                for rule in self._store.list_rules()
            ]
        }

    def create_alert(
        self,
        symbol: str,
        kind: str,
        threshold: float | None = None,
        params: Mapping[str, Any] | None = None,
        note: str = "",
        cooldown_s: int | None = None,
    ) -> dict[str, Any]:
        """Validate, persist and return a new alert rule."""
        prepared = alerts_engine.prepare_rule(
            symbol, kind, threshold, params, note, cooldown_s
        )
        self._require_known(prepared["symbol"])
        rule = {
            "id": new_id(),
            **prepared,
            "created_at": self._iso(),
            "last_triggered_at": None,
        }
        stored = self._store.add_rule(rule)
        return {"rule": alerts_engine.rule_payload(stored, self._now())}

    def update_alert(
        self,
        rule_id: str,
        enabled: bool | None = None,
        threshold: float | None = None,
        params: Mapping[str, Any] | None = None,
        note: str | None = None,
        cooldown_s: int | None = None,
    ) -> dict[str, Any]:
        """Patch an existing alert rule and return it."""
        rule = self._store.get_rule(rule_id)
        if rule is None:
            raise NotFoundError(f"alert rule not found: {rule_id}")
        fields: dict[str, Any] = {}
        for key, value in (
            ("enabled", enabled),
            ("threshold", threshold),
            ("params", params),
            ("note", note),
            ("cooldown_s", cooldown_s),
        ):
            if value is not None:
                fields[key] = value
        changes = alerts_engine.prepare_rule_update(rule, fields)
        stored = self._store.update_rule(rule_id, changes) if changes else rule
        if stored is None:  # pragma: no cover - rule existed above
            raise NotFoundError(f"alert rule not found: {rule_id}")
        return {"rule": alerts_engine.rule_payload(stored, self._now())}

    def delete_alert(self, rule_id: str) -> dict[str, Any]:
        """Delete an alert rule."""
        if not self._store.delete_rule(rule_id):
            raise NotFoundError(f"alert rule not found: {rule_id}")
        return {"ok": True}

    def list_events(
        self,
        limit: int = 50,
        acknowledged: bool | None = None,
    ) -> dict[str, Any]:
        """Return alert events newest first, optionally filtered by ack state."""
        limit_value = _clamp_int(
            _to_int(limit, "limit", default=50), 1, EVENTS_MAX_LIMIT
        )
        if acknowledged is not None and not isinstance(acknowledged, bool):
            raise InvalidArgumentError("acknowledged must be a boolean")
        return {
            "events": self._store.list_events(limit_value, acknowledged),
        }

    def ack_events(
        self,
        ids: Sequence[str] | None = None,
        all_events: bool = False,
    ) -> dict[str, Any]:
        """Acknowledge selected events or every unacknowledged event."""
        if all_events:
            return {"acknowledged": self._store.ack_all_events()}
        if ids is None:
            raise InvalidArgumentError("provide ids or all=true")
        if isinstance(ids, str) or not isinstance(ids, (list, tuple)):
            raise InvalidArgumentError("ids must be an array of event ids")
        cleaned: list[str] = []
        for event_id in ids:
            if not isinstance(event_id, str) or not event_id:
                raise InvalidArgumentError("ids must be an array of event ids")
            cleaned.append(event_id)
        return {"acknowledged": self._store.ack_events(cleaned)}

    # ------------------------------------------------------------------
    # Portfolio
    # ------------------------------------------------------------------
    def _position_entry(
        self, position: Mapping[str, Any]
    ) -> tuple[dict[str, Any], float]:
        """Return a computed position entry plus its previous market value."""
        symbol = str(position["symbol"])
        quantity = _num(position.get("quantity")) or 0.0
        avg_cost = _num(position.get("avg_cost")) or 0.0
        try:
            quote = self._get_quote(symbol)
        except MarketMonitorError as error:
            LOGGER.warning("portfolio quote failed for %s: %s", symbol, error)
            quote = {}
        price = _num(quote.get("price"))
        prev_close = _num(quote.get("prev_close"))
        stored = self._store.get_instrument(symbol)
        metadata = self._instrument_metadata(symbol, stored)
        cost_basis = quantity * avg_cost
        if price is not None:
            market_value = quantity * price
            unrealized_pnl = market_value - cost_basis
            unrealized_pnl_pct = (
                (unrealized_pnl / cost_basis * 100.0) if cost_basis else None
            )
            day_change = (
                quantity * (price - prev_close) if prev_close is not None else 0.0
            )
            day_change_pct = (
                ((price - prev_close) / prev_close * 100.0)
                if prev_close
                else None
            )
        else:
            market_value = 0.0
            unrealized_pnl = -cost_basis
            unrealized_pnl_pct = None
            day_change = 0.0
            day_change_pct = None
        previous_value = (
            quantity * prev_close if prev_close is not None else market_value
        )
        entry = {
            "symbol": symbol,
            "name": str(quote.get("name") or metadata["name"]),
            "quantity": quantity,
            "avg_cost": avg_cost,
            "price": _round(price),
            "market_value": _round(market_value),
            "cost_basis": _round(cost_basis),
            "unrealized_pnl": _round(unrealized_pnl),
            "unrealized_pnl_pct": _round(unrealized_pnl_pct, 2),
            "day_change": _round(day_change),
            "day_change_pct": _round(day_change_pct, 2),
            "weight_pct": 0.0,
        }
        return entry, previous_value

    def portfolio(self) -> dict[str, Any]:
        """Return computed portfolio positions and totals."""
        positions = self._store.list_positions()
        entries: list[dict[str, Any]] = []
        total_market = 0.0
        total_cost = 0.0
        total_day = 0.0
        total_previous = 0.0
        for position in positions:
            entry, previous_value = self._position_entry(position)
            entries.append(entry)
            total_market += entry["market_value"] or 0.0
            total_cost += entry["cost_basis"] or 0.0
            total_day += entry["day_change"] or 0.0
            total_previous += previous_value
        for entry in entries:
            market_value = entry["market_value"] or 0.0
            entry["weight_pct"] = (
                round(market_value / total_market * 100.0, 2)
                if total_market
                else 0.0
            )
        total_pnl = total_market - total_cost
        totals = {
            "market_value": _round(total_market),
            "cost_basis": _round(total_cost),
            "unrealized_pnl": _round(total_pnl),
            "unrealized_pnl_pct": _round(
                (total_pnl / total_cost * 100.0) if total_cost else None, 2
            ),
            "day_change": _round(total_day),
            "day_change_pct": _round(
                (total_day / total_previous * 100.0) if total_previous else None, 2
            ),
        }
        return {
            "positions": entries,
            "totals": totals,
            "currency": str(self._settings.get("base_currency") or "USD"),
        }

    def set_position(
        self, symbol: str, quantity: float, avg_cost: float
    ) -> dict[str, Any]:
        """Create or replace a portfolio position."""
        normalized = normalize_symbol(symbol)
        self._require_known(normalized)
        quantity_value = _to_float(quantity, "quantity")
        cost_value = _to_float(avg_cost, "avg_cost")
        if cost_value < 0:
            raise InvalidArgumentError("avg_cost must be non-negative")
        position = self._store.upsert_position(
            normalized, quantity_value, cost_value
        )
        entry, _ = self._position_entry(position)
        return {"position": entry}

    def delete_position(self, symbol: str) -> dict[str, Any]:
        """Delete a portfolio position (idempotent)."""
        normalized = normalize_symbol(symbol)
        self._store.delete_position(normalized)
        return {"ok": True, "removed": normalized}

    # ------------------------------------------------------------------
    # Screener
    # ------------------------------------------------------------------
    def screener(self, preset: str = "gainers", limit: int = 10) -> dict[str, Any]:
        """Return a ranked screener over the monitored universe."""
        if not isinstance(preset, str) or not preset.strip():
            raise InvalidArgumentError(
                f"preset must be one of {', '.join(SCREENER_PRESETS)}"
            )
        preset_value = preset.strip().lower()
        if preset_value not in SCREENER_PRESETS:
            raise InvalidArgumentError(
                f"invalid preset: {preset!r}"
                f" (expected one of {', '.join(SCREENER_PRESETS)})"
            )
        limit_value = _clamp_int(
            _to_int(limit, "limit", default=SCREENER_DEFAULT_LIMIT),
            1,
            SCREENER_MAX_LIMIT,
        )
        scope = self._monitored_symbols()
        rows: list[dict[str, Any]] = []
        for symbol in scope:
            try:
                quote = self._get_quote(symbol)
            except MarketMonitorError as error:
                LOGGER.warning("screener quote failed for %s: %s", symbol, error)
                continue
            rows.append(
                analytics.build_screener_row(symbol, quote, self._daily_bars_safe(symbol))
            )
        rows.sort(key=lambda row: self._screener_sort_key(preset_value, row))
        return {
            "preset": preset_value,
            "scope": scope,
            "as_of": self._iso(),
            "rows": rows[:limit_value],
        }

    @staticmethod
    def _screener_sort_key(preset: str, row: Mapping[str, Any]) -> tuple[Any, ...]:
        """Return the sort key for a screener preset."""
        if preset == "gainers":
            value = row.get("change_pct")
            return (value is None, -(value or 0.0))
        if preset == "losers":
            value = row.get("change_pct")
            return (value is None, value or 0.0)
        if preset == "oversold":
            value = row.get("rsi14")
            return (value is None, value or 0.0)
        if preset == "overbought":
            value = row.get("rsi14")
            return (value is None, -(value or 0.0))
        if preset == "volatile":
            value = row.get("avg_daily_range_pct")
            return (value is None, -(value or 0.0))
        value = row.get("score")
        return (value is None, -(value or 0.0))

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------
    def get_settings(self) -> dict[str, Any]:
        """Return the effective settings."""
        return {
            "provider": self._settings.get("provider", self._provider_mode),
            "poll_seconds": int(self._settings.get("poll_seconds", 15)),
            "benchmark": str(self._settings.get("benchmark", "^GSPC")),
            "base_currency": str(self._settings.get("base_currency", "USD")),
            "auto_refresh": bool(self._settings.get("auto_refresh", True)),
            "history_points": self._history_points(),
        }

    def update_settings(
        self,
        provider: str | None = None,
        poll_seconds: int | None = None,
        benchmark: str | None = None,
        history_points: int | None = None,
    ) -> dict[str, Any]:
        """Update provider/poll/benchmark/history-point settings."""
        updates: dict[str, Any] = {}
        if provider is not None:
            normalized = normalize_provider_name(provider)
            if normalized == "synthetic":
                raise InvalidArgumentError(
                    "synthetic data is test-only; production uses real market "
                    "data (auto or yahoo)"
                )
            updates["provider"] = normalized
        if poll_seconds is not None:
            updates["poll_seconds"] = _clamp_int(
                _to_int(poll_seconds, "poll_seconds"), 5, 3600
            )
        if benchmark is not None:
            updates["benchmark"] = normalize_symbol(benchmark)
        if history_points is not None:
            updates["history_points"] = _clamp_int(
                _to_int(history_points, "history_points"),
                analytics.HISTORY_POINTS_MIN,
                analytics.HISTORY_POINTS_MAX,
            )
        if not updates:
            return self.get_settings()
        stored = self._store.update_settings(updates)
        for key in ("provider", "poll_seconds", "benchmark", "history_points"):
            if key in updates:
                stored[key] = updates[key]
        with self._lock:
            self._settings = stored
            if "history_points" in updates:
                # Aggregated chart bars are keyed by range only; a new point
                # target invalidates every cached response.
                self._daily_cache.clear()
        if "provider" in updates:
            self._apply_selection(
                resolve_provider(updates["provider"], now_fn=self._now_fn)
            )
        return self.get_settings()

    # ------------------------------------------------------------------
    # Collection from external providers
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_source(value: Any) -> str:
        """Validate a ``/collect/bars`` source label (default ``manual``)."""
        if value is None:
            return "manual"
        if not isinstance(value, str) or not value.strip():
            raise InvalidArgumentError("source must be a non-empty string")
        source = value.strip()
        if len(source) > MAX_SOURCE_LENGTH:
            raise InvalidArgumentError(
                f"source must be at most {MAX_SOURCE_LENGTH} characters"
            )
        if not all(character.isalnum() or character in "_.:-" for character in source):
            raise InvalidArgumentError(
                "source may only contain letters, digits and _ . : -"
            )
        return source

    @staticmethod
    def _normalize_bar_time(value: Any, interval: str, index: int) -> str:
        """Validate a collected bar timestamp for ``interval``."""
        if not isinstance(value, str) or not value.strip():
            raise InvalidArgumentError(f"bars[{index}].t must be a timestamp string")
        text = value.strip()
        if interval == "1d":
            try:
                return date.fromisoformat(text[:10]).isoformat()
            except ValueError:
                raise InvalidArgumentError(
                    f"bars[{index}].t must be a YYYY-MM-DD date"
                ) from None
        candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            moment = datetime.fromisoformat(candidate)
        except ValueError:
            raise InvalidArgumentError(
                f"bars[{index}].t must be an ISO timestamp"
            ) from None
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def collect_bars(
        self,
        symbol: str,
        bars: Sequence[Mapping[str, Any]],
        interval: str = "1d",
        source: str | None = None,
    ) -> dict[str, Any]:
        """Store externally collected OHLCV rows in the bar cache."""
        normalized = normalize_symbol(symbol)
        interval_value = validate_interval(interval or "1d") or "1d"
        if not isinstance(bars, (list, tuple)) or not bars:
            raise InvalidArgumentError("bars must be a non-empty array")
        if len(bars) > MAX_COLLECTED_BARS:
            raise InvalidArgumentError(
                f"bars must contain at most {MAX_COLLECTED_BARS} rows"
            )
        normalized_bars: list[dict[str, Any]] = []
        for index, bar in enumerate(bars):
            if not isinstance(bar, Mapping):
                raise InvalidArgumentError(f"bars[{index}] must be an object")
            normalized_bars.append(
                {
                    "t": self._normalize_bar_time(bar.get("t"), interval_value, index),
                    "o": _to_float(bar.get("o"), f"bars[{index}].o"),
                    "h": _to_float(bar.get("h"), f"bars[{index}].h"),
                    "l": _to_float(bar.get("l"), f"bars[{index}].l"),
                    "c": _to_float(bar.get("c"), f"bars[{index}].c"),
                    "v": _to_float(bar.get("v", 0.0), f"bars[{index}].v"),
                }
            )
        normalized_bars.sort(key=lambda item: item["t"])
        source_value = self._normalize_source(source)
        if not self._symbol_known(normalized):
            self._store.ensure_instrument(normalized)
        stored = self._store.upsert_bars(
            normalized, interval_value, normalized_bars, source_value
        )
        self._clear_symbol_caches(normalized)
        return {
            "symbol": normalized,
            "stored": stored,
            "range": {
                "from": normalized_bars[0]["t"],
                "to": normalized_bars[-1]["t"],
            },
            "interval": interval_value,
            "source": source_value,
        }


__all__ = [
    "MarketMonitorService",
    "default_data_dir",
    "API_VERSION",
    "SCREENER_PRESETS",
    "SCREENER_MAX_LIMIT",
]
