"""Conditional, governed HTTP client used by every data collector.

Responsibilities:

- reserve a slot from :class:`~.governor.RateGovernor` before each request;
- send ``If-None-Match`` / ``If-Modified-Since`` from the raw document cache and
  treat ``304`` as a successful no-op;
- decode gzip/deflate, cap body size, hash the payload;
- retry only bounded retryable failures, honouring ``Retry-After``;
- persist the raw body so re-parsing never needs a second download;
- report rate-limit and block conditions as typed errors for the API.
"""

from __future__ import annotations

import gzip
import hashlib
import logging
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from typing import Any, Callable

from .errors import DataSourceError, SourceBlockedError, SourceRateLimitedError
from .models import DEFAULT_USER_AGENT, FetchResult, source_contact, to_iso, utc_now

LOGGER = logging.getLogger("market_monitor.data.http")

#: Retry a bounded number of times, and only when the governor says it is soon.
MAX_RETRIES = 2
MAX_INLINE_WAIT_S = 20.0
DEFAULT_MAX_BYTES = 8 * 1024 * 1024
RAW_BODY_LIMIT = 4 * 1024 * 1024


class PoliteHttpClient:
    """A single-threaded, polite HTTP client sharing one governor."""

    def __init__(
        self,
        warehouse: Any,
        governor: Any,
        *,
        timeout: float = 15.0,
        max_bytes: int = DEFAULT_MAX_BYTES,
        now_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        dry_run: bool = False,
    ) -> None:
        self.warehouse = warehouse
        self.governor = governor
        self.timeout = float(timeout)
        self.max_bytes = int(max_bytes)
        self._now = now_fn or time.time
        self._sleep = sleep_fn or time.sleep
        self.dry_run = bool(dry_run)
        self.request_count = 0
        self._ssl_context = ssl.create_default_context()

    # ------------------------------------------------------------------ fetch

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
        """Fetch one URL under the governor's policy."""
        if self.dry_run:
            return FetchResult(url=url, status=0, dry_run=True, fetched_at=self.now_iso())

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            self.governor.before(source_id)
            request_headers = self._request_headers(source_id, url, headers, accept, conditional)
            request = urllib.request.Request(url, headers=request_headers, method="GET")
            try:
                self.request_count += 1
                with urllib.request.urlopen(request, timeout=self.timeout, context=self._ssl_context) as response:
                    result = self._read_response(response)
                wait = self.governor.after(source_id, result.status)
                if result.status == 304:
                    return result
                if keep_raw:
                    self._store_raw(source_id, result)
                return result
            except urllib.error.HTTPError as error:
                status = int(error.code)
                retry_after = _retry_after_seconds(error.headers.get("Retry-After") if error.headers else None)
                wait = self.governor.after(source_id, status, retry_after_s=retry_after)
                body = _safe_read(error)
                if status == 304:
                    return FetchResult(
                        url=url,
                        status=304,
                        not_modified=True,
                        headers=dict(error.headers.items()) if error.headers else {},
                        fetched_at=self.now_iso(),
                    )
                if status in (429, 403):
                    raise SourceRateLimitedError(
                        f"Source {source_id} refused the request (HTTP {status}).",
                        retry_after_s=wait,
                    )
                if status >= 500 and attempt < MAX_RETRIES and wait <= MAX_INLINE_WAIT_S:
                    self._sleep(wait)
                    continue
                if status >= 500:
                    raise DataSourceError(f"Source {source_id} returned HTTP {status}.")
                raise DataSourceError(
                    f"Source {source_id} returned HTTP {status} for {url}."
                    + (f" Body: {body[:200]}" if body else "")
                )
            except (urllib.error.URLError, TimeoutError, ssl.SSLError, OSError) as error:
                wait = self.governor.after(source_id, None)
                message = self._network_message(source_id, error)
                if attempt < MAX_RETRIES and wait <= MAX_INLINE_WAIT_S:
                    self._sleep(wait)
                    last_error = DataSourceError(message)
                    continue
                raise DataSourceError(message) from error
        raise DataSourceError(
            f"Source {source_id} failed after {MAX_RETRIES + 1} attempts: {last_error}",
        )

    def now_iso(self) -> str:
        """Current ISO UTC timestamp from the injected clock."""
        return to_iso(utc_now(self._now))

    # ------------------------------------------------------------- internals

    def _request_headers(
        self,
        source_id: str,
        url: str,
        headers: dict[str, str] | None,
        accept: str,
        conditional: bool,
    ) -> dict[str, str]:
        """Build request headers including conditional-request validators."""
        contact = source_contact()
        user_agent = f"{DEFAULT_USER_AGENT} contact:{contact}" if contact else DEFAULT_USER_AGENT
        merged = {
            "User-Agent": user_agent,
            "Accept": accept,
            "Accept-Encoding": "gzip, deflate",
        }
        if headers:
            merged.update({key: str(value) for key, value in headers.items()})
        if conditional:
            cached = self.warehouse.get_raw_document(source_id, url)
            if cached:
                if cached.get("etag"):
                    merged["If-None-Match"] = str(cached["etag"])
                if cached.get("last_modified"):
                    merged["If-Modified-Since"] = str(cached["last_modified"])
        return merged

    def _read_response(self, response: Any) -> FetchResult:
        """Read and decode one successful response."""
        raw = response.read(self.max_bytes + 1)
        truncated = len(raw) > self.max_bytes
        if truncated:
            raw = raw[: self.max_bytes]
        encoding = (response.headers.get("Content-Encoding") or "").lower()
        if encoding == "gzip":
            try:
                raw = gzip.decompress(raw)
            except OSError:
                LOGGER.warning("could not gunzip response from %s", response.geturl())
        elif encoding == "deflate":
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                pass
        content_type = response.headers.get("Content-Type", "")
        return FetchResult(
            url=response.geturl(),
            status=int(response.status),
            content_type=content_type,
            body=raw,
            headers={key.lower(): value for key, value in response.headers.items()},
            fetched_at=self.now_iso(),
            sha256=hashlib.sha256(raw).hexdigest(),
            truncated=truncated,
        )

    def _store_raw(self, source_id: str, result: FetchResult) -> None:
        """Persist the raw body and validators for future conditional gets."""
        text = ""
        if len(result.body) <= RAW_BODY_LIMIT:
            text = result.body.decode("utf-8", errors="replace")
        document = {
            "doc_id": hashlib.sha256(f"{source_id}\x1f{result.url}".encode("utf-8")).hexdigest()[:24],
            "source_id": source_id,
            "url": result.url,
            "status": result.status,
            "content_type": result.content_type,
            "etag": result.headers.get("etag", ""),
            "last_modified": result.headers.get("last-modified", ""),
            "sha256": result.sha256,
            "body_text": text,
            "bytes": len(result.body),
            "fetched_at": result.fetched_at,
        }
        try:
            self.warehouse.record_raw_document(document)
        except Exception:  # noqa: BLE001 - cache persistence must not fail a fetch
            LOGGER.warning("could not persist raw document for %s", result.url)

    def _network_message(self, source_id: str, error: Exception) -> str:
        """Human-readable network failure with a TLS hint when relevant."""
        text = str(error)
        if isinstance(error, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in text:
            return (
                f"Source {source_id} failed TLS verification. Set SSL_CERT_FILE to the "
                f"corporate CA bundle if this machine uses TLS inspection. ({text[:160]})"
            )
        if isinstance(error, urllib.error.URLError):
            return f"Source {source_id} is unreachable: {error.reason}"
        return f"Source {source_id} failed: {text[:200]}"


def _retry_after_seconds(value: str | None) -> float | None:
    """Parse a ``Retry-After`` header (seconds or HTTP date)."""
    if not value:
        return None
    try:
        return max(0.0, float(value.strip()))
    except ValueError:
        return None


def _safe_read(error: urllib.error.HTTPError) -> str:
    """Read a bounded error body for diagnostics."""
    try:
        data = error.read(4096)
        return data.decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - diagnostics only
        return ""


__all__ = ["DEFAULT_MAX_BYTES", "MAX_RETRIES", "PoliteHttpClient"]
