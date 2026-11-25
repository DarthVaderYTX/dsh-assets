"""Persistence contract: API responses are backed by rows already written to disk."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor import MarketMonitorService
from market_monitor.errors import ProviderUnavailableError, StorageUnavailableError
from market_monitor.store import Store


class _FailingProvider:
    """A provider that is always unavailable, for read-from-disk assertions."""

    name = "failing"

    def quote(self, symbol: str):  # noqa: ANN001 - test double
        raise ProviderUnavailableError("provider down")

    def history(self, symbol: str, range_: str, interval: str | None = None):  # noqa: ANN001
        raise ProviderUnavailableError("provider down")


class PersistenceContractTests(unittest.TestCase):
    """Quotes and bars must be persisted before they are returned."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _service(self) -> MarketMonitorService:
        service = MarketMonitorService(
            data_dir=self.tmp.name, provider="synthetic", poll_seconds=15,
        )
        self.addCleanup(service.close)
        return service

    def test_quote_cache_roundtrip(self) -> None:
        store = Store(os.path.join(self.tmp.name, "cache.db"))
        self.addCleanup(store.close)
        stored = store.upsert_quote_cache(
            "AAPL",
            {"symbol": "AAPL", "price": 231.5, "as_of": "2026-11-24T20:00:00Z",
             "source": "test", "stale": False},
            provider="test-provider",
            updated_at=1234.5,
        )
        self.assertEqual(stored["quote"]["price"], 231.5)
        self.assertEqual(stored["provider"], "test-provider")
        read = store.get_quote_cache("AAPL")
        self.assertEqual(read["updated_at"], 1234.5)
        self.assertEqual(read["quote"]["source"], "test")
        self.assertIsNone(store.get_quote_cache("MISSING"))

    def test_quote_is_persisted_and_survives_a_provider_outage(self) -> None:
        first = self._service()
        quote = first.quote("AAPL")
        self.assertGreater(quote["price"], 0)
        persisted = first._store.get_quote_cache("AAPL")  # noqa: SLF001 - contract test
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["quote"]["price"], quote["price"])
        first.close()

        second = self._service()
        second._provider = _FailingProvider()  # noqa: SLF001 - simulate outage
        recovered = second.quote("AAPL")
        self.assertEqual(recovered["price"], quote["price"])
        self.assertFalse(recovered.get("stale", False))  # still inside the quote TTL
        self.assertIn("as_of", recovered)

    def test_snapshot_renders_from_disk_after_a_provider_outage(self) -> None:
        first = self._service()
        first.snapshot(symbols=["AAPL"])
        first.close()

        second = self._service()
        second._provider = _FailingProvider()  # noqa: SLF001 - simulate outage
        payload = second.snapshot(symbols=["AAPL"])
        self.assertEqual(len(payload["quotes"]), 1)
        entry = payload["quotes"][0]
        self.assertEqual(entry["symbol"], "AAPL")
        self.assertTrue(entry["spark"])  # bars were persisted by the first snapshot
        self.assertIsNotNone(entry["rsi14"])

    def test_history_is_persisted_and_served_from_disk_on_failure(self) -> None:
        first = self._service()
        history = first.history("AAPL", "1Y")
        # 1Y is the conventional 252 daily bars.
        self.assertEqual(history["interval"], "1d")
        self.assertEqual(len(history["bars"]), 252)
        stored = first._store.get_bars("AAPL", "1d")  # noqa: SLF001
        # The service fetched a longer lookback than the chart window and kept
        # every daily row, so more bars are persisted than the chart returns.
        self.assertGreater(len(stored), len(history["bars"]))
        self.assertEqual(stored[-1]["c"], history["bars"][-1]["c"])
        first.close()

        second = self._service()
        second._provider = _FailingProvider()  # noqa: SLF001 - simulate outage
        fallback = second.history("AAPL", "1Y")
        self.assertTrue(fallback["stale"])
        self.assertEqual(fallback["provider"], "cache")
        self.assertEqual(fallback["interval"], "1d")
        self.assertEqual(len(fallback["bars"]), 252)
        self.assertEqual(len(fallback["bars"]), len(history["bars"]))
        self.assertEqual(fallback["bars"][-1], history["bars"][-1])

    def test_analysis_uses_persisted_quote_and_bars_after_outage(self) -> None:
        first = self._service()
        first.analysis("AAPL")
        first.close()

        second = self._service()
        second._provider = _FailingProvider()  # noqa: SLF001 - simulate outage
        analysis = second.analysis("AAPL")
        self.assertIn("summary", analysis)
        self.assertIn("indicators", analysis)
        self.assertIsNotNone(analysis["indicators"].get("rsi14"))

    def test_unpersistable_quote_is_an_error_not_an_ephemeral_payload(self) -> None:
        service = self._service()
        with mock.patch.object(
            service._store, "upsert_quote_cache",  # noqa: SLF001
            side_effect=RuntimeError("disk full"),
        ):
            with self.assertRaises(StorageUnavailableError):
                service.quote("MSFT")

    def test_unpersistable_history_falls_back_to_stored_rows_or_errors(self) -> None:
        service = self._service()
        with mock.patch.object(
            service._store, "replace_bars",  # noqa: SLF001
            side_effect=RuntimeError("disk full"),
        ):
            with self.assertRaises(StorageUnavailableError):
                service.history("MSFT", "1Y")


if __name__ == "__main__":
    unittest.main()
