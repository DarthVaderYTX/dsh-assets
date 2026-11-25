"""Canonical instrument catalog and symbol helpers.

The catalog is the offline source of truth for instrument metadata and the seed
parameters of the deterministic synthetic provider.  Symbols follow the API
contract pattern ``^[A-Z0-9^][A-Z0-9.^=_-]{0,15}$`` and are always canonical
uppercase strings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .errors import InvalidSymbolError

SYMBOL_PATTERN = r"^[A-Z0-9^][A-Z0-9.^=_-]{0,15}$"
_SYMBOL_RE = re.compile(SYMBOL_PATTERN)

#: Symbols seeded into the watchlist on the very first run.
DEFAULT_WATCHLIST: tuple[str, ...] = (
    "AAPL",
    "MSFT",
    "NVDA",
    "TSLA",
    "AMZN",
    "GOOGL",
    "META",
    "BTC-USD",
)

#: Fallback daily volume by instrument type when an instrument does not override it.
DEFAULT_VOLUME_BASE: dict[str, float] = {
    "stock": 40_000_000.0,
    "etf": 15_000_000.0,
    "index": 0.0,
    "crypto": 2_000_000_000.0,
    "forex": 0.0,
    "commodity": 300_000.0,
}


def is_valid_symbol(value: Any) -> bool:
    """Return ``True`` when ``value`` is a canonical symbol string."""
    if not isinstance(value, str):
        return False
    candidate = value.strip().upper()
    return bool(_SYMBOL_RE.match(candidate))


def normalize_symbol(value: Any) -> str:
    """Normalise a user supplied symbol, raising on malformed input.

    Leading/trailing whitespace is stripped and the symbol uppercased.  Anything
    that does not match :data:`SYMBOL_PATTERN` raises
    :class:`~market_monitor.errors.InvalidSymbolError`.
    """
    if not isinstance(value, str) or not value.strip():
        raise InvalidSymbolError("symbol must be a non-empty string")
    candidate = value.strip().upper()
    if not _SYMBOL_RE.match(candidate):
        raise InvalidSymbolError(f"invalid symbol: {value!r}")
    return candidate


def normalize_optional_symbol(value: Any) -> str | None:
    """Normalise an optional symbol (``None``/empty string returns ``None``)."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return normalize_symbol(value)


@dataclass(frozen=True)
class Instrument:
    """Static metadata and synthetic-simulation seed for one instrument."""

    symbol: str
    name: str
    exchange: str
    type: str
    sector: str
    currency: str
    base_price: float
    annual_drift: float
    annual_vol: float
    volume_base: float
    default_watch: bool = False

    def catalog_item(self) -> dict[str, Any]:
        """Return the ``GET /catalog`` representation of this instrument."""
        return {
            "symbol": self.symbol,
            "name": self.name,
            "exchange": self.exchange,
            "type": self.type,
            "sector": self.sector,
            "currency": self.currency,
            "default_watch": self.default_watch,
        }


def _instrument(
    symbol: str,
    name: str,
    exchange: str,
    type_: str,
    sector: str,
    base_price: float,
    annual_drift: float,
    annual_vol: float,
    volume_base: float,
    default_watch: bool = False,
) -> Instrument:
    return Instrument(
        symbol=symbol,
        name=name,
        exchange=exchange,
        type=type_,
        sector=sector,
        currency="USD",
        base_price=base_price,
        annual_drift=annual_drift,
        annual_vol=annual_vol,
        volume_base=volume_base,
        default_watch=default_watch,
    )


#: The offline instrument catalog (~30 instruments across six asset classes).
INSTRUMENTS: tuple[Instrument, ...] = (
    # US equities
    _instrument("AAPL", "Apple Inc.", "NASDAQ", "stock", "Technology", 231.45, 0.16, 0.24, 55_000_000.0, True),
    _instrument("MSFT", "Microsoft Corporation", "NASDAQ", "stock", "Technology", 428.50, 0.15, 0.22, 24_000_000.0, True),
    _instrument("NVDA", "NVIDIA Corporation", "NASDAQ", "stock", "Technology", 138.20, 0.35, 0.45, 48_000_000.0, True),
    _instrument("TSLA", "Tesla, Inc.", "NASDAQ", "stock", "Consumer Discretionary", 342.80, 0.10, 0.52, 75_000_000.0, True),
    _instrument("AMZN", "Amazon.com, Inc.", "NASDAQ", "stock", "Consumer Discretionary", 205.60, 0.17, 0.28, 42_000_000.0, True),
    _instrument("GOOGL", "Alphabet Inc.", "NASDAQ", "stock", "Communication Services", 178.30, 0.14, 0.25, 28_000_000.0, True),
    _instrument("META", "Meta Platforms, Inc.", "NASDAQ", "stock", "Communication Services", 612.40, 0.18, 0.30, 20_000_000.0, True),
    _instrument("JPM", "JPMorgan Chase & Co.", "NYSE", "stock", "Financials", 243.70, 0.11, 0.20, 21_000_000.0),
    _instrument("XOM", "Exxon Mobil Corporation", "NYSE", "stock", "Energy", 118.90, 0.05, 0.22, 30_000_000.0),
    _instrument("UNH", "UnitedHealth Group Incorporated", "NYSE", "stock", "Health Care", 587.20, 0.08, 0.23, 22_000_000.0),
    # ETFs
    _instrument("SPY", "SPDR S&P 500 ETF Trust", "NYSE", "etf", "Broad Market", 592.30, 0.09, 0.15, 90_000_000.0),
    _instrument("QQQ", "Invesco QQQ Trust", "NASDAQ", "etf", "Technology", 508.70, 0.11, 0.19, 45_000_000.0),
    _instrument("DIA", "SPDR Dow Jones Industrial Average ETF Trust", "NYSE", "etf", "Broad Market", 438.60, 0.07, 0.13, 6_000_000.0),
    _instrument("IWM", "iShares Russell 2000 ETF", "NYSE", "etf", "Broad Market", 224.50, 0.06, 0.21, 28_000_000.0),
    _instrument("VTI", "Vanguard Total Stock Market ETF", "NYSE", "etf", "Broad Market", 292.10, 0.09, 0.16, 8_000_000.0),
    _instrument("GLD", "SPDR Gold Shares", "NYSE", "etf", "Commodities", 245.80, 0.12, 0.15, 7_000_000.0),
    # Indices
    _instrument("^GSPC", "S&P 500", "INDEX", "index", "Broad Market", 5920.00, 0.09, 0.15, 0.0),
    _instrument("^IXIC", "NASDAQ Composite", "INDEX", "index", "Technology", 19050.00, 0.11, 0.19, 0.0),
    _instrument("^DJI", "Dow Jones Industrial Average", "INDEX", "index", "Broad Market", 43850.00, 0.07, 0.13, 0.0),
    _instrument("^VIX", "CBOE Volatility Index", "INDEX", "index", "Broad Market", 15.40, 0.0, 0.90, 0.0),
    # Crypto
    _instrument("BTC-USD", "Bitcoin USD", "CCC", "crypto", "Cryptocurrency", 96800.00, 0.35, 0.55, 3_200_000_000.0, True),
    _instrument("ETH-USD", "Ethereum USD", "CCC", "crypto", "Cryptocurrency", 3420.00, 0.30, 0.65, 1_800_000_000.0),
    _instrument("SOL-USD", "Solana USD", "CCC", "crypto", "Cryptocurrency", 215.40, 0.40, 0.85, 1_200_000_000.0),
    # Forex
    _instrument("EURUSD=X", "EUR/USD", "FX", "forex", "Foreign Exchange", 1.0480, 0.01, 0.08, 0.0),
    _instrument("USDJPY=X", "USD/JPY", "FX", "forex", "Foreign Exchange", 154.30, 0.02, 0.09, 0.0),
    _instrument("GBPUSD=X", "GBP/USD", "FX", "forex", "Foreign Exchange", 1.2620, 0.00, 0.08, 0.0),
    # Commodities
    _instrument("GC=F", "Gold Futures", "COMEX", "commodity", "Commodities", 2650.00, 0.12, 0.15, 450_000.0),
    _instrument("CL=F", "Crude Oil Futures", "NYMEX", "commodity", "Energy", 68.90, 0.00, 0.30, 380_000.0),
    _instrument("SI=F", "Silver Futures", "COMEX", "commodity", "Commodities", 30.80, 0.10, 0.28, 120_000.0),
    _instrument("NG=F", "Natural Gas Futures", "NYMEX", "commodity", "Energy", 2.95, -0.05, 0.55, 260_000.0),
)

_BY_SYMBOL: dict[str, Instrument] = {inst.symbol: inst for inst in INSTRUMENTS}


def get_instrument(symbol: str) -> Instrument | None:
    """Return the catalog instrument for ``symbol`` (or ``None``)."""
    return _BY_SYMBOL.get(symbol)


def has_instrument(symbol: str) -> bool:
    """Return ``True`` when the catalog knows ``symbol``."""
    return symbol in _BY_SYMBOL


def catalog_symbols() -> list[str]:
    """Return all canonical catalog symbols in catalog order."""
    return [inst.symbol for inst in INSTRUMENTS]


def catalog_items() -> list[dict[str, Any]]:
    """Return the public catalog representation of every instrument."""
    return [inst.catalog_item() for inst in INSTRUMENTS]


def volume_base_for(symbol: str) -> float:
    """Return the plausible daily volume base for ``symbol``.

    Catalog instruments carry their own value; unknown symbols default to the
    equity range.
    """
    instrument = get_instrument(symbol)
    if instrument is not None:
        return instrument.volume_base
    return DEFAULT_VOLUME_BASE["stock"]


__all__ = [
    "SYMBOL_PATTERN",
    "DEFAULT_WATCHLIST",
    "DEFAULT_VOLUME_BASE",
    "Instrument",
    "INSTRUMENTS",
    "is_valid_symbol",
    "normalize_symbol",
    "normalize_optional_symbol",
    "get_instrument",
    "has_instrument",
    "catalog_symbols",
    "catalog_items",
    "volume_base_for",
]
