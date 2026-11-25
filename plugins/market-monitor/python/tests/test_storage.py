"""Cross-platform persistence tests: paths, atomic files, locks and SQLite.

The suite is deliberately platform-neutral: it uses ``tempfile`` directories
with spaces and non-ASCII names and asserts only on relative identities, so the
same test passes on Windows, macOS and Linux.
"""

from __future__ import annotations

import json
import os
import sqlite3
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from market_monitor.data.warehouse import DataWarehouse
from market_monitor.storage import (
    StorageLayout,
    acquire_lock,
    atomic_write_text,
    default_data_dir,
    layout,
    release_lock,
    resolve_data_dir,
    storage_info,
)
from market_monitor.store import Store


class StorageLayoutTests(unittest.TestCase):
    def test_layout_names_are_relative_to_the_data_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "数据 dir with spaces"
            storage = layout(root)
            self.assertIsInstance(storage, StorageLayout)
            self.assertEqual(storage.data_dir, root.absolute())
            self.assertEqual(storage.cache_db.name, "market-monitor.db")
            self.assertEqual(storage.warehouse_db.name, "warehouse.db")
            self.assertEqual(storage.runtime_file.name, "runtime.json")
            self.assertEqual(storage.lock_file.name, "sidecar.lock")
            self.assertEqual(storage.cache_db.parent, root.absolute())
            storage.ensure()
            self.assertTrue(root.is_dir())

    def test_resolve_data_dir_expands_home_and_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            explicit = Path(temp) / "market monitor" / "中文"
            self.assertEqual(resolve_data_dir(str(explicit)), explicit.absolute())
            self.assertEqual(
                resolve_data_dir(None, {"DSH_HOME": temp}),
                (Path(temp) / "market-monitor").absolute(),
            )
            self.assertEqual(default_data_dir({"DSH_HOME": temp}), Path(temp) / "market-monitor")

    def test_resolve_data_dir_expands_tilde(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fake_home = Path(temp) / "fake home"
            fake_home.mkdir()
            env = {"HOME": str(fake_home), "USERPROFILE": str(fake_home)}
            with mock.patch.dict(os.environ, env, clear=False):
                self.assertEqual(resolve_data_dir("~/mm"), fake_home / "mm")
                self.assertEqual(resolve_data_dir("~"), Path(fake_home))

    def test_storage_info_is_platform_neutral(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            storage = layout(temp)
            info = storage_info(storage.data_dir)
            self.assertIn("platform", info)
            self.assertIn("sqlite", info)
            self.assertTrue(info["sqlite"])
            self.assertEqual(info["paths"]["cache_db"], str(storage.cache_db))
            self.assertEqual(info["paths"]["warehouse_db"], str(storage.warehouse_db))
            self.assertIn("data_dir", info["exists"])


class AtomicWriteTests(unittest.TestCase):
    def test_atomic_write_is_utf8_and_leaves_no_temp_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "runtime 数据.json"
            atomic_write_text(target, json.dumps({"note": "中文"}, ensure_ascii=False))
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["note"], "中文")
            atomic_write_text(target, '{"note": "overwritten"}\n')
            self.assertEqual(target.read_text(encoding="utf-8"), '{"note": "overwritten"}\n')
            self.assertEqual([path.name for path in Path(temp).iterdir()], [target.name])

    @unittest.skipIf(os.name == "nt", "POSIX creation modes are not meaningful on Windows")
    def test_atomic_write_applies_restricted_posix_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "runtime.json"
            atomic_write_text(target, "{}", mode=0o600)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_atomic_write_retries_transient_windows_replace_errors(self) -> None:
        from market_monitor import storage as storage_module

        real_replace = os.replace
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "runtime.json"
            busy = PermissionError("file is temporarily locked by another process")
            calls: list[tuple[str, str]] = []

            def flaky_replace(source: str, destination: str) -> None:
                calls.append((source, destination))
                if len(calls) == 1:
                    raise busy
                real_replace(source, destination)

            with mock.patch.object(storage_module.os, "replace", side_effect=flaky_replace):
                atomic_write_text(target, '{"ok": true}\n', attempts=3, delay_s=0.0)
            self.assertEqual(len(calls), 2)
            self.assertEqual(target.read_text(encoding="utf-8"), '{"ok": true}\n')
            self.assertEqual([path.name for path in Path(temp).iterdir()], [target.name])

    def test_atomic_write_raises_after_retry_budget(self) -> None:
        from market_monitor import storage as storage_module

        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "runtime.json"
            with mock.patch.object(
                storage_module.os, "replace", side_effect=PermissionError("locked"),
            ), self.assertRaises(PermissionError):
                atomic_write_text(target, "x", attempts=2, delay_s=0.0)
            self.assertFalse(target.exists())


class LockTests(unittest.TestCase):
    def test_lock_lifecycle_creates_and_removes_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            lock_path = Path(temp) / "sidecar.lock"
            handle = acquire_lock(lock_path)
            self.assertIsNotNone(handle)
            self.assertTrue(lock_path.exists())
            self.assertGreater(lock_path.stat().st_size, 0)
            release_lock(handle)
            self.assertFalse(lock_path.exists())

    @unittest.skipIf(os.name == "nt", "msvcrt locks are process-scoped on Windows")
    def test_lock_is_exclusive_on_posix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            lock_path = Path(temp) / "sidecar.lock"
            first = acquire_lock(lock_path)
            self.assertIsNotNone(first)
            try:
                self.assertIsNone(acquire_lock(lock_path))
            finally:
                release_lock(first)


class SqlitePersistenceTests(unittest.TestCase):
    def test_cache_purge_removes_only_synthetic_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            storage = layout(Path(temp) / "cache").ensure()
            store = Store(storage.cache_db)
            try:
                store.upsert_bars("AAPL", "1d", [{
                    "t": "2026-11-24", "o": 1.0, "h": 2.0,
                    "l": 0.5, "c": 1.5, "v": 10.0,
                }], "synthetic")
                store.upsert_bars("AAPL", "1d", [{
                    "t": "2026-11-25", "o": 2.0, "h": 3.0,
                    "l": 1.0, "c": 2.5, "v": 20.0,
                }], "yahoo-finance")
                store.upsert_quote_cache(
                    "AAPL", {"symbol": "AAPL", "price": 1.0, "source": "synthetic"},
                    provider="synthetic", updated_at=1.0,
                )
                store.upsert_quote_cache(
                    "MSFT", {"symbol": "MSFT", "price": 2.0, "source": "yahoo"},
                    provider="yahoo", updated_at=2.0,
                )
                self.assertEqual(store.purge_synthetic_market_cache(), {
                    "bars": 1, "quotes": 1,
                })
                self.assertEqual(
                    [bar["t"] for bar in store.get_bars("AAPL", "1d")],
                    ["2026-11-25"],
                )
                self.assertIsNone(store.get_quote_cache("AAPL"))
                self.assertIsNotNone(store.get_quote_cache("MSFT"))
            finally:
                store.close()

    def test_cache_and_warehouse_reopen_from_a_unicode_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            storage = layout(Path(temp) / "数据 with spaces" / "market monitor").ensure()
            store = Store(storage.cache_db)
            try:
                store.add_watch("AAPL", note="跨平台")
                self.assertEqual(store.watchlist_symbols(), ["AAPL"])
            finally:
                store.close()
            store = Store(storage.cache_db)
            try:
                self.assertEqual(store.watchlist_symbols(), ["AAPL"])
                self.assertEqual(store.list_watchlist()[0]["note"], "跨平台")
            finally:
                store.close()

            warehouse = DataWarehouse(storage.warehouse_db)
            try:
                warehouse.upsert_bars([{
                    "series_id": "INS:XNAS:AAPL",
                    "interval": "1d",
                    "ts": "2026-11-24",
                    "open": 1.0,
                    "high": 2.0,
                    "low": 0.5,
                    "close": 1.5,
                    "volume": 10.0,
                    "quality": "final",
                }], "sina-finance")
            finally:
                warehouse.close()
            warehouse = DataWarehouse(storage.warehouse_db)
            try:
                bars = warehouse.get_bars("INS:XNAS:AAPL")
                self.assertEqual(len(bars), 1)
                self.assertEqual(bars[0]["close"], 1.5)
            finally:
                warehouse.close()

            # SQLite is portable: the files are ordinary local database files,
            # no platform path was baked into the schema.
            for name in ("market-monitor.db", "warehouse.db"):
                self.assertTrue((storage.data_dir / name).is_file())
            connection = sqlite3.connect(storage.warehouse_db)
            try:
                self.assertEqual(
                    connection.execute("PRAGMA journal_mode").fetchone()[0], "wal",
                )
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
