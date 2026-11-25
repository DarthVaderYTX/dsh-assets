"""Portable local-storage primitives for the market-monitor engine.

The engine persists all durable state in one caller-supplied data directory so
the same layout works unchanged on Windows, macOS and Linux:

``market-monitor.db`` (hot analysis cache), ``warehouse.db`` (canonical
collected facts), ``runtime.json`` (sidecar discovery), ``sidecar.lock``
(single-instance lock), plus SQLite's own ``-wal``/``-shm`` companions.

Everything here uses :mod:`pathlib`, UTF-8 text, ``os.replace`` for atomic
replacement and native advisory file locks, so no caller-supplied path needs a
platform-specific separator or encoding.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, Mapping

CACHE_DB_NAME = "market-monitor.db"
WAREHOUSE_DB_NAME = "warehouse.db"
RUNTIME_FILE_NAME = "runtime.json"
LOCK_FILE_NAME = "sidecar.lock"

#: Default sub-directory below ``$DSH_HOME`` (or the user's home directory).
DATA_SUBDIR = "market-monitor"


def default_data_dir(env: Mapping[str, str] | None = None) -> Path:
    """Return the default data directory for this user.

    ``$DSH_HOME/market-monitor`` when ``DSH_HOME`` is set, otherwise the
    standalone-engine fallback ``~/.market-monitor``.  The DSH plugin always
    passes an explicit absolute directory, so the fallback only affects direct
    CLI/SDK use.
    """
    values = os.environ if env is None else env
    dsh_home = values.get("DSH_HOME") or ""
    if dsh_home.strip():
        return Path(dsh_home.strip()).expanduser() / DATA_SUBDIR
    return Path.home() / ".market-monitor"


def resolve_data_dir(
    configured: str | os.PathLike[str] | None,
    env: Mapping[str, str] | None = None,
) -> Path:
    """Resolve an explicit data directory or the platform default.

    ``~``/``~user`` prefixes are expanded on every platform, relative paths are
    made absolute against the current working directory, and no separators are
    assumed.  The directory is not created here.
    """
    if configured is None or str(configured).strip() == "":
        return default_data_dir(env).expanduser().absolute()
    return Path(configured).expanduser().absolute()


@dataclass(frozen=True)
class StorageLayout:
    """Portable on-disk layout rooted at one data directory."""

    data_dir: Path

    @property
    def cache_db(self) -> Path:
        return self.data_dir / CACHE_DB_NAME

    @property
    def warehouse_db(self) -> Path:
        return self.data_dir / WAREHOUSE_DB_NAME

    @property
    def runtime_file(self) -> Path:
        return self.data_dir / RUNTIME_FILE_NAME

    @property
    def lock_file(self) -> Path:
        return self.data_dir / LOCK_FILE_NAME

    def ensure(self) -> "StorageLayout":
        """Create the data directory (idempotent, parents included)."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self

    def as_dict(self) -> dict[str, str]:
        """Serializable path map for diagnostics."""
        return {
            "data_dir": str(self.data_dir),
            "cache_db": str(self.cache_db),
            "warehouse_db": str(self.warehouse_db),
            "runtime_file": str(self.runtime_file),
            "lock_file": str(self.lock_file),
        }


def layout(data_dir: str | os.PathLike[str]) -> StorageLayout:
    """Build a :class:`StorageLayout` for ``data_dir``."""
    return StorageLayout(Path(data_dir).expanduser().absolute())


def atomic_write_text(
    path: str | os.PathLike[str],
    text: str,
    *,
    encoding: str = "utf-8",
    mode: int | None = None,
    attempts: int = 6,
    delay_s: float = 0.05,
) -> None:
    """Write text atomically in the target directory.

    A sibling temporary file is written, flushed and ``fsync``-ed, then moved
    over the target with :func:`os.replace`.  The replace is retried briefly for
    transient Windows sharing violations (antivirus, indexer, host reader)
    while still keeping the atomic-replace guarantee on every platform.

    ``mode`` sets the POSIX creation mode (for example ``0o600`` for the token
    bearing ``runtime.json``); it is ignored on Windows.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
            0o666 if mode is None else mode,
        )
        with os.fdopen(descriptor, "w", encoding=encoding, newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        last_error: OSError | None = None
        for index in range(max(1, int(attempts))):
            try:
                os.replace(temporary, target)
                return
            except OSError as error:  # PermissionError is a subclass of OSError
                last_error = error
                if index + 1 >= max(1, int(attempts)):
                    raise
                time.sleep(max(0.0, float(delay_s)))
        if last_error is not None:  # pragma: no cover - loop always returns/raises
            raise last_error
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - best effort cleanup
            pass


def acquire_lock(path: str | os.PathLike[str]) -> IO[bytes] | None:
    """Acquire an exclusive per-data-directory lock without a shell.

    On Windows the first byte is locked with ``msvcrt.locking``; on POSIX an
    advisory ``fcntl.flock`` is used.  The OS releases the lock when the process
    exits, so a crash cannot leave a permanent stale lock.  Returns an open
    binary handle on success or ``None`` when another sidecar owns the lock.
    """
    lock_path = Path(path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "a+b")
    try:
        # msvcrt needs a real byte to lock and fcntl is happy with one too.
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()
            os.fsync(handle.fileno())
        handle.seek(0)
        if os.name == "nt":  # pragma: no cover - Windows-only branch
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handle
    except OSError:
        handle.close()
        return None


def release_lock(handle: IO[bytes] | None) -> None:
    """Release a lock returned by :func:`acquire_lock` and remove the file."""
    if handle is None:
        return
    try:
        handle.seek(0)
        if os.name == "nt":  # pragma: no cover - Windows-only branch
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    try:
        lock_path = Path(handle.name)
        handle.close()
        lock_path.unlink(missing_ok=True)
    except OSError:
        pass


def storage_info(
    data_dir: str | os.PathLike[str],
    *,
    cache_db: str | os.PathLike[str] | None = None,
    warehouse_db: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    """Return platform-neutral storage diagnostics for the Data API."""
    storage = layout(data_dir)
    cache = Path(cache_db) if cache_db is not None else storage.cache_db
    warehouse = Path(warehouse_db) if warehouse_db is not None else storage.warehouse_db
    return {
        "platform": sys.platform,
        "os_name": os.name,
        "python": sys.version.split()[0],
        "sqlite": sqlite3.sqlite_version,
        "path_separator": os.sep,
        "paths": {
            **storage.as_dict(),
            "cache_db": str(cache),
            "warehouse_db": str(warehouse),
        },
        "exists": {
            "data_dir": storage.data_dir.is_dir(),
            "cache_db": cache.is_file(),
            "warehouse_db": warehouse.is_file(),
            "runtime_file": storage.runtime_file.is_file(),
            "lock_file": storage.lock_file.is_file(),
        },
    }


__all__ = [
    "CACHE_DB_NAME",
    "DATA_SUBDIR",
    "LOCK_FILE_NAME",
    "RUNTIME_FILE_NAME",
    "StorageLayout",
    "WAREHOUSE_DB_NAME",
    "acquire_lock",
    "atomic_write_text",
    "default_data_dir",
    "layout",
    "release_lock",
    "resolve_data_dir",
    "storage_info",
]
