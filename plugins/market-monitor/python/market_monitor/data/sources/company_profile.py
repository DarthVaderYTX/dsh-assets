"""Index-driven company profile collector (SEC submissions API).

The company master index (``INDEX_ID``) lists every company the plugin knows
about; each entry starts with ``profile_status='pending'`` and this collector
enriches them one governed request at a time:

1. read the next batch of pending entries through
   :meth:`DataWarehouse.entries_needing_profiles`;
2. mark entries that cannot be enriched (no SEC CIK) as ``skipped`` so they are
   not retried forever;
3. fetch ``https://data.sec.gov/submissions/CIK##########.json`` through the
   polite HTTP client -- one request per company, conditional GET reuses the
   cached raw document on ``304``;
4. upsert the parsed ``company_profile`` row and mark the entry ``ready``.

Failures are classified.  A rate-limit or block stops the batch immediately and
does **not** increment attempts (the governor knows when the source may be
touched again), while an individual company error keeps its entry ``pending``
until ``profile_max_attempts`` is exhausted and only then marks it ``failed``.
One malformed company therefore never aborts the run.

``parse_submissions`` is a pure ``dict -> dict`` function so tests need no HTTP.
The caller owns the identity and time columns: ``entity_id``, ``market``,
``source_id``, ``observed_at`` and ``fetched_at`` are added by :func:`collect`.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from ..models import CollectContext
from ..specs import SEC_SUBMISSIONS

LOGGER = logging.getLogger("market_monitor.data.sources.company_profile")

#: Warehouse index whose entries are enriched by this collector.
INDEX_ID = "company:master"
#: Rate-governed source used for every company request.
SOURCE_ID = SEC_SUBMISSIONS  # "sec-submissions"
#: SEC submissions endpoint prefix; a company document is one CIK-specific JSON.
SEC_SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions/"

#: Default number of companies enriched per run and retry ceiling.
DEFAULT_PROFILE_BATCH = 20
DEFAULT_MAX_ATTEMPTS = 3
PROFILE_BATCH_MIN, PROFILE_BATCH_MAX = 1, 100
MAX_ATTEMPTS_MIN, MAX_ATTEMPTS_MAX = 1, 10

#: How many index entries to inspect per run so missing-CIK housekeeping stays
#: bounded while the run still finds enough enrichable entries.
CANDIDATE_WINDOW_FACTOR = 3

#: Longest error text stored on an index entry.
ERROR_MAX_CHARS = 500


# --------------------------------------------------------------------- helpers


def _text(value: Any) -> str:
    """Return a trimmed string for a scalar, or ``""`` for anything else."""
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _string_list(value: Any) -> list[str]:
    """Coerce tickers/exchanges to a de-duplicated list of short strings."""
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    items: list[str] = []
    for entry in value:
        text = _text(entry.get("name")) if isinstance(entry, dict) else _text(entry)
        if text and text not in items:
            items.append(text)
    return items


def _former_names(value: Any) -> list[dict[str, str]]:
    """Normalise ``formerNames`` to a JSON-serialisable list of name periods."""
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    names: list[dict[str, str]] = []
    for entry in value:
        if isinstance(entry, str):
            text = entry.strip()
            if text:
                names.append({"name": text, "from": "", "to": ""})
            continue
        if not isinstance(entry, dict):
            continue
        name = _text(entry.get("name"))
        if not name:
            continue
        names.append({
            "name": name,
            "from": _text(entry.get("from")),
            "to": _text(entry.get("to")),
        })
    return names


def _format_address(addresses: Any) -> str:
    """Format the first non-empty address as ``street, city, state postal``.

    The SEC payload carries a ``mailing`` and a ``business`` address (in that
    order); the first one with any content wins.  Unknown shapes yield ``""``.
    """
    if isinstance(addresses, dict):
        candidates = list(addresses.values())
    elif isinstance(addresses, (list, tuple)):
        candidates = list(addresses)
    else:
        return ""
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        street = " ".join(
            part for part in (
                _text(candidate.get("street1")),
                _text(candidate.get("street2")),
            ) if part
        )
        city = _text(candidate.get("city"))
        state = _text(candidate.get("stateOrCountry"))
        postal = _text(candidate.get("zipCode"))
        locality = " ".join(part for part in (state, postal) if part)
        parts = [part for part in (street, city, locality) if part]
        if parts:
            return ", ".join(parts)
    return ""


def normalise_cik(value: Any) -> str:
    """Return the decimal digits of a CIK, or ``""`` when it is not usable.

    Index payloads may store the CIK as a string with or without leading zeros,
    or as a JSON number; all three forms are accepted.  The caller decides
    whether an empty result means "skip this entry".
    """
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, float):
        return str(int(value)) if value >= 0 and value.is_integer() else ""
    if isinstance(value, int):
        return str(value) if value >= 0 else ""
    return re.sub(r"[^0-9]", "", str(value).strip())


def submissions_url(cik: str | int) -> str:
    """Build the zero-padded submissions URL for one company CIK."""
    digits = normalise_cik(cik)
    if not digits:
        raise ValueError(f"invalid SEC CIK: {cik!r}")
    return f"{SEC_SUBMISSIONS_BASE_URL}CIK{int(digits):010d}.json"


def parse_submissions(payload: dict) -> dict:
    """Map an SEC submissions JSON document to a ``company_profile`` row dict.

    Only fields that the payload actually provides are mapped; every other
    column is left to the caller (identity, source and timestamps) or defaults
    to an empty string/list.  Absent or oddly typed optional fields never raise.
    """
    data = payload if isinstance(payload, dict) else {}
    return {
        "legal_name": _text(data.get("name")),
        "sic": _text(data.get("sic")),
        "sic_description": _text(data.get("sicDescription")),
        "state_of_incorporation": _text(data.get("stateOfIncorporation")),
        "fiscal_year_end": _text(data.get("fiscalYearEnd")),
        "tickers": _string_list(data.get("tickers")),
        "exchanges": _string_list(data.get("exchanges")),
        "former_names": _former_names(data.get("formerNames")),
        "address": _format_address(data.get("addresses")),
        "website": _text(data.get("website")),
    }


def _entry_payload(entry: dict[str, Any]) -> dict[str, Any]:
    """Decode an index entry's payload, tolerating a JSON string or bad value."""
    payload = entry.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except (TypeError, ValueError):
            return {}
    return payload if isinstance(payload, dict) else {}


def _entry_cik(entry: dict[str, Any]) -> str:
    """The entry's SEC CIK, or ``""`` when the entry cannot be enriched."""
    provider_ids = _entry_payload(entry).get("provider_ids") or {}
    if isinstance(provider_ids, str):
        try:
            provider_ids = json.loads(provider_ids)
        except (TypeError, ValueError):
            return ""
    if not isinstance(provider_ids, dict):
        return ""
    return normalise_cik(provider_ids.get("sec_cik"))


def _settings_limits(settings: dict[str, Any] | None) -> tuple[int, int]:
    """Clamped ``(profile_batch_size, profile_max_attempts)`` from settings."""
    values = settings or {}

    def bounded(key: str, default: int, low: int, high: int) -> int:
        try:
            value = int(values.get(key, default))
        except (TypeError, ValueError):
            value = default
        return max(low, min(high, value))

    return (
        bounded("profile_batch_size", DEFAULT_PROFILE_BATCH, PROFILE_BATCH_MIN, PROFILE_BATCH_MAX),
        bounded("profile_max_attempts", DEFAULT_MAX_ATTEMPTS, MAX_ATTEMPTS_MIN, MAX_ATTEMPTS_MAX),
    )


def _select_entries(
    entries: list[dict[str, Any]], batch: int,
) -> tuple[list[tuple[dict[str, Any], str]], list[dict[str, Any]]]:
    """Split pending entries into enrichable candidates and missing-CIK entries.

    At most ``batch`` candidates are kept and at most ``batch`` missing-CIK
    entries are selected for marking, so one run can never flood the warehouse
    with housekeeping or unbounded HTTP traffic.
    """
    candidates: list[tuple[dict[str, Any], str]] = []
    missing: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("status") or "active").strip().lower() != "active":
            continue
        cik = _entry_cik(entry)
        if not cik:
            if len(missing) < batch:
                missing.append(entry)
            continue
        if len(candidates) >= batch:
            break
        candidates.append((entry, cik))
    return candidates, missing


def _parse_json(body: bytes | str) -> dict[str, Any]:
    """Decode an SEC submissions body, raising ``ValueError`` when unusable."""
    if isinstance(body, bytes):
        text = body.decode("utf-8-sig", errors="replace")
    else:
        text = str(body).lstrip("\ufeff")
    text = text.strip()
    if not text:
        raise ValueError("empty SEC submissions payload")
    try:
        payload = json.loads(text)
    except ValueError as error:
        raise ValueError(f"invalid SEC submissions JSON: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError("SEC submissions payload must be a JSON object")
    return payload


def _response_body(
    ctx: CollectContext, result: Any, url: str,
) -> tuple[bytes | str, str]:
    """Return the body and ``observed_at`` for one fetch result.

    A ``304`` reuses the raw document cached by the HTTP client; the cached
    ``fetched_at`` becomes the observation time so the profile keeps the time the
    source value was actually seen instead of the re-parse time.
    """
    if getattr(result, "not_modified", False):
        document = ctx.warehouse.get_raw_document(SOURCE_ID, url) or {}
        text = str(document.get("body_text") or "")
        if not text.strip():
            raise ValueError(f"cached SEC submissions document is empty for {url}")
        return text.encode("utf-8"), _text(document.get("fetched_at")) or ctx.now_iso()
    body = getattr(result, "body", b"") or b""
    if not body:
        raise ValueError(f"empty SEC submissions payload for {url}")
    return body, _text(getattr(result, "fetched_at", "")) or ctx.now_iso()


def _index_exists(ctx: CollectContext) -> bool:
    """Best-effort check used only to label an already-empty queue.

    The warehouse queues entries itself, so this probe may be absent or return
    the wrong shape after a refactor without losing work; it never gates
    collection of entries that the queue did return.
    """
    get_index = getattr(ctx.warehouse, "get_index_definition", None)
    if not callable(get_index):
        return True
    try:
        return get_index(INDEX_ID) is not None
    except Exception:  # noqa: BLE001 - a lookup failure must not abort collection
        ctx.logger.warning("could not read index %s; attempting collection anyway", INDEX_ID)
        return True


def _no_op(*, now: str, batch: int, max_attempts: int, reason: str) -> dict[str, Any]:
    """Result dictionary for a run that had nothing to do."""
    return {
        "stored": 0,
        "updated": 0,
        "duplicates": 0,
        "skipped": 0,
        "status": "ok",
        "details": {
            "batch": batch,
            "profiles": 0,
            "failed": [],
            "missing_cik": 0,
            "attempts": max_attempts,
            "reason": reason,
        },
        "job_state": {"last_run_at": now, "profiles": 0},
    }


# --------------------------------------------------------------------- collect


def _mark_skipped(ctx: CollectContext, entry: dict[str, Any]) -> bool:
    """Mark one entry as permanently skipped; return ``True`` when written."""
    entry_key = str(entry.get("entry_key") or "")
    try:
        ctx.warehouse.update_index_profile(
            INDEX_ID, entry_key, profile_status="skipped", error="no sec cik",
        )
    except Exception as error:  # noqa: BLE001 - housekeeping is best effort
        ctx.logger.warning("could not mark %s as profile-skipped: %s", entry_key, error)
        return False
    return True


def _mark_failure(
    ctx: CollectContext, entry: dict[str, Any], error: Exception, max_attempts: int,
) -> str:
    """Record one company failure and return the resulting ``profile_status``."""
    attempts = int(entry.get("profile_attempts") or 0)
    status = "pending" if attempts + 1 < max_attempts else "failed"
    entry_key = str(entry.get("entry_key") or "")
    try:
        ctx.warehouse.update_index_profile(
            INDEX_ID,
            entry_key,
            profile_status=status,
            error=str(error)[:ERROR_MAX_CHARS],
            increment_attempt=True,
        )
    except Exception as update_error:  # noqa: BLE001 - bookkeeping is best effort
        ctx.logger.warning(
            "could not record company profile failure for %s: %s", entry_key, update_error,
        )
    return status


def collect(ctx: CollectContext) -> dict[str, Any]:
    """Enrich the next batch of company master index entries from the SEC.

    The run is bounded by ``profile_batch_size`` (clamped to 1..100, default 20)
    companies and ``profile_max_attempts`` (clamped to 1..10, default 3)
    attempts per company.  ``dry_run`` plans the batch without touching either
    the network or the warehouse.
    """
    batch, max_attempts = _settings_limits(ctx.settings)
    now = ctx.now_iso()

    entries = ctx.warehouse.entries_needing_profiles(INDEX_ID, limit=batch * CANDIDATE_WINDOW_FACTOR) or []
    if not entries:
        # Choose a diagnostic reason only; the empty queue is authoritative, so a
        # missing index can never block collection of an existing one.
        reason = "no pending index entries" if _index_exists(ctx) else "index not found"
        ctx.logger.debug("company profile collection skipped: %s", reason)
        return _no_op(now=now, batch=batch, max_attempts=max_attempts, reason=reason)

    candidates, missing = _select_entries(entries, batch)
    if not candidates and not missing:
        return _no_op(
            now=now, batch=batch, max_attempts=max_attempts, reason="no eligible index entries",
        )

    if bool(ctx.settings.get("dry_run")):
        planned = [str(entry.get("entity_id") or "") for entry, _cik in candidates]
        return {
            "stored": 0,
            "updated": 0,
            "duplicates": 0,
            "skipped": len(planned),
            "status": "ok",
            "details": {"dry_run": True, "planned": planned},
            "job_state": {"last_run_at": now, "profiles": 0},
        }

    skipped = sum(1 for entry in missing if _mark_skipped(ctx, entry))
    if skipped:
        noun = "entry" if skipped == 1 else "entries"
        ctx.logger.info(
            "company profile collection: marked %d %s without an SEC CIK as skipped",
            skipped, noun,
        )

    stored = 0
    failed_entity_ids: list[str] = []
    stopped = ""
    stopped_error = ""

    for entry, cik in candidates:
        entry_key = str(entry.get("entry_key") or "")
        entity_id = str(entry.get("entity_id") or "")
        try:
            url = submissions_url(cik)
        except ValueError as error:  # pragma: no cover - CIK was already validated
            failed_entity_ids.append(entity_id)
            _mark_failure(ctx, entry, error, max_attempts)
            continue

        try:
            result = ctx.http.fetch(SOURCE_ID, url)
        except (SourceRateLimitedError, SourceBlockedError) as error:
            # The governor refused the source: stop immediately and leave the
            # remaining entries pending so the next run retries them.
            stopped = "rate_limited"
            stopped_error = str(error)[:ERROR_MAX_CHARS]
            ctx.logger.warning("company profile collection stopped: %s", error)
            break
        except Exception as error:  # noqa: BLE001 - one company must not abort the run
            failed_entity_ids.append(entity_id)
            _mark_failure(ctx, entry, error, max_attempts)
            ctx.logger.warning("company profile fetch failed for %s: %s", entity_id, error)
            continue

        if getattr(result, "dry_run", False):
            # Defensive: the HTTP client was left in dry-run mode while the
            # collector was asked to write.  Nothing can be fetched this run.
            skipped += 1
            stopped = "dry_run"
            ctx.logger.debug("company profile fetch skipped: HTTP client is dry-run")
            break

        try:
            body, observed_at = _response_body(ctx, result, url)
            payload = _parse_json(body)
            row = parse_submissions(payload)
            row.update({
                "entity_id": entity_id,
                "market": str(entry.get("market") or ""),
                "source_id": SOURCE_ID,
                "observed_at": observed_at,
                "fetched_at": ctx.now_iso(),
            })
            ctx.warehouse.upsert_company_profile(row)
            ctx.warehouse.update_index_profile(
                INDEX_ID,
                entry_key,
                profile_status="ready",
                synced_at=row["fetched_at"],
                error="",
                increment_attempt=True,
            )
        except Exception as error:  # noqa: BLE001 - one company must not abort the run
            failed_entity_ids.append(entity_id)
            _mark_failure(ctx, entry, error, max_attempts)
            ctx.logger.warning("could not store company profile for %s: %s", entity_id, error)
            continue

        stored += 1
        ctx.logger.debug("stored company profile for %s (CIK %s)", entity_id, cik)

    status = "partial" if failed_entity_ids or stopped == "rate_limited" else "ok"
    details: dict[str, Any] = {
        "batch": batch,
        "profiles": stored,
        "failed": failed_entity_ids,
        "missing_cik": len(missing),
        "attempts": max_attempts,
    }
    if stopped:
        details["stopped"] = stopped
        if stopped_error:
            details["stopped_error"] = stopped_error

    if stored or failed_entity_ids or skipped:
        ctx.logger.info(
            "company profiles: %d stored, %d failed, %d skipped (batch %d)",
            stored, len(failed_entity_ids), skipped, batch,
        )
    else:
        ctx.logger.debug("company profiles: nothing collected this run")

    return {
        "stored": stored,
        "updated": 0,
        "duplicates": 0,
        "skipped": skipped,
        "status": status,
        "details": details,
        "job_state": {"last_run_at": now, "profiles": stored},
    }


__all__ = [
    "CANDIDATE_WINDOW_FACTOR",
    "DEFAULT_MAX_ATTEMPTS",
    "DEFAULT_PROFILE_BATCH",
    "INDEX_ID",
    "MAX_ATTEMPTS_MAX",
    "MAX_ATTEMPTS_MIN",
    "PROFILE_BATCH_MIN",
    "PROFILE_BATCH_MAX",
    "SEC_SUBMISSIONS_BASE_URL",
    "SOURCE_ID",
    "collect",
    "normalise_cik",
    "parse_submissions",
    "submissions_url",
]
