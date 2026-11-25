"""Shared records, identity helpers and context objects for data collection.

The collectors are intentionally dumb: they turn provider payloads into plain
dictionaries, call :class:`DataWarehouse` upserts, and report counts.  Identity
and time normalisation live here so every domain uses the same conventions.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

UTC = timezone.utc

#: Domains used by coverage reporting and the UI.
DOMAIN_REFERENCE = "reference"
DOMAIN_MARKET = "market"
DOMAIN_NEWS = "news"
DOMAINS = (DOMAIN_REFERENCE, DOMAIN_MARKET, DOMAIN_NEWS)

DEFAULT_USER_AGENT = "MarketMonitor/1.0 (+DSH plugin; local research collector)"
CONTACT_ENV = "MARKET_MONITOR_CONTACT"

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9^][A-Z0-9.^=_-]{0,23}$")
MIC_PATTERN = re.compile(r"^[A-Z]{4}$")

#: Query parameters removed when canonicalising news URLs for de-duplication.
_TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "source",
}


def utc_now(now_fn: Callable[[], float] | None = None) -> float:
    """Return the current POSIX time from an injectable clock."""
    return float(now_fn() if now_fn is not None else time.time())


def to_iso(epoch: float) -> str:
    """Format a POSIX timestamp as ISO-8601 UTC with ``Z``."""
    return datetime.fromtimestamp(float(epoch), tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def utc_now_iso(now_fn: Callable[[], float] | None = None) -> str:
    """Current time as an ISO-8601 UTC string."""
    return to_iso(utc_now(now_fn))


def utc_date(now_fn: Callable[[], float] | None = None) -> str:
    """Current UTC date as ``YYYY-MM-DD``."""
    return utc_now_iso(now_fn)[:10]


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp, returning ``None`` when unusable."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def iso_after_days(now_fn: Callable[[], float] | None, days: float) -> str:
    """ISO timestamp ``days`` in the future."""
    return to_iso(utc_now(now_fn) + float(days) * 86400.0)


def normalise_symbol(symbol: str) -> str:
    """Uppercase and validate an exchange ticker or provider symbol."""
    value = str(symbol or "").strip().upper()
    if not SYMBOL_PATTERN.match(value):
        raise ValueError(f"invalid symbol: {symbol!r}")
    return value


def instrument_id(mic: str, symbol: str) -> str:
    """Canonical listed-instrument identity, e.g. ``INS:XNAS:AAPL``."""
    mic_code = str(mic or "").strip().upper()
    if not MIC_PATTERN.match(mic_code):
        raise ValueError(f"invalid MIC: {mic!r}")
    return f"INS:{mic_code}:{normalise_symbol(symbol)}"


def index_id(code: str) -> str:
    """Canonical index identity, e.g. ``IDX:GSPC``."""
    value = str(code or "").strip().upper().replace("^", "")
    if not re.match(r"^[A-Z0-9][A-Z0-9._-]{0,31}$", value):
        raise ValueError(f"invalid index code: {code!r}")
    return f"IDX:{value}"


def commodity_root_id(venue: str, root: str) -> str:
    """Canonical commodity root identity, e.g. ``COM:XCEC:GC``."""
    venue_code = str(venue or "").strip().upper()
    root_code = str(root or "").strip().upper()
    if not re.match(r"^[A-Z0-9]{2,8}$", venue_code) or not re.match(r"^[A-Z0-9]{1,8}$", root_code):
        raise ValueError(f"invalid commodity root: {venue!r}/{root!r}")
    return f"COM:{venue_code}:{root_code}"


def commodity_contract_id(venue: str, root: str, contract_month: str) -> str:
    """Canonical commodity contract identity, e.g. ``COM:XCEC:GC:202612``."""
    month = normalise_contract_month(contract_month)
    return f"{commodity_root_id(venue, root)}:{month}"


def normalise_contract_month(value: str) -> str:
    """Normalise ``2026-12``, ``202612`` or ``Dec 2026`` to ``202612``."""
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    if len(digits) != 6:
        raise ValueError(f"invalid contract month: {value!r}")
    month = int(digits[4:6])
    if month < 1 or month > 12:
        raise ValueError(f"invalid contract month: {value!r}")
    return digits


def canonical_url(url: str) -> str:
    """Strip fragments and tracking parameters so feeds can be de-duplicated."""
    parts = urlsplit(str(url or "").strip())
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() not in _TRACKING_PARAMS and not key.lower().startswith("utm_")
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower() or "https", parts.netloc.lower(), path, urlencode(query), ""))


def news_article_id(url: str, guid: str | None = None) -> str:
    """Stable article id from a canonical URL (or feed guid as fallback)."""
    seed = canonical_url(url) if url else f"guid:{guid or ''}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:20]


def content_hash(*parts: str) -> str:
    """SHA-256 hex digest of the joined non-empty parts."""
    joined = "\x1f".join(str(part or "") for part in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]


def source_contact() -> str:
    """Contact note appended to the User-Agent (set ``MARKET_MONITOR_CONTACT``)."""
    return os.environ.get(CONTACT_ENV, "").strip()


@dataclass
class SourceSpec:
    """Declarative description of one remote source and its polite limits."""

    source_id: str
    name: str
    kind: str
    domain: str
    base_url: str = ""
    license_note: str = ""
    enabled: bool = True
    min_interval_s: float = 3.0
    max_per_hour: int = 60
    max_per_day: int = 600

    def to_dict(self) -> dict[str, Any]:
        """Return the column values for ``ingest_source``."""
        return {
            "source_id": self.source_id,
            "domain": self.domain,
            "kind": self.kind,
            "provider": self.base_url,
            "enabled": 1 if self.enabled else 0,
            "min_interval_s": float(self.min_interval_s),
            "max_per_hour": int(self.max_per_hour),
            "max_per_day": int(self.max_per_day),
        }


@dataclass
class FetchResult:
    """One HTTP exchange (or a dry-run placeholder) from the polite client."""

    url: str
    status: int = 0
    content_type: str = ""
    body: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)
    fetched_at: str = ""
    not_modified: bool = False
    from_cache: bool = False
    dry_run: bool = False
    sha256: str = ""
    truncated: bool = False

    def text(self) -> str:
        """Decode the body as UTF-8 (replacement characters allowed)."""
        return self.body.decode("utf-8", errors="replace")


@dataclass
class IngestResult:
    """Outcome of one ingestion job, persisted to ``ingest_run``."""

    job_id: str
    status: str = "ok"
    source_ids: list[str] = field(default_factory=list)
    requests: int = 0
    stored: int = 0
    updated: int = 0
    duplicates: int = 0
    skipped: int = 0
    started_at: str = ""
    finished_at: str = ""
    error: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        """True when the run produced no error-level outcome."""
        return self.status in ("ok", "partial")

    def to_dict(self) -> dict[str, Any]:
        """Serialise for the API and run history."""
        return {
            "job_id": self.job_id,
            "status": self.status,
            "source_ids": list(self.source_ids),
            "requests": self.requests,
            "stored": self.stored,
            "updated": self.updated,
            "duplicates": self.duplicates,
            "skipped": self.skipped,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "details": self.details,
        }


@dataclass
class CollectContext:
    """Everything a collector function may use."""

    warehouse: Any
    http: Any
    settings: dict[str, Any]
    now_fn: Callable[[], float]
    logger: Any
    job_id: str = ""
    job_state: dict[str, Any] = field(default_factory=dict)

    def now_iso(self) -> str:
        """Current time in ISO-8601 UTC."""
        return utc_now_iso(self.now_fn)

    def today(self) -> str:
        """Current UTC date."""
        return self.now_iso()[:10]


__all__ = [
    "CONTACT_ENV",
    "DEFAULT_USER_AGENT",
    "DOMAINS",
    "DOMAIN_MARKET",
    "DOMAIN_NEWS",
    "DOMAIN_REFERENCE",
    "CollectContext",
    "FetchResult",
    "IngestResult",
    "SourceSpec",
    "canonical_url",
    "commodity_contract_id",
    "commodity_root_id",
    "content_hash",
    "index_id",
    "instrument_id",
    "iso_after_days",
    "news_article_id",
    "normalise_contract_month",
    "normalise_symbol",
    "parse_iso",
    "source_contact",
    "to_iso",
    "utc_date",
    "utc_now",
    "utc_now_iso",
]
