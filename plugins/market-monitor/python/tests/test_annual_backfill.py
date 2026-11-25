"""Offline tests for the gradual one-year watchlist backfill."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data.errors import DataSourceError
from market_monitor.data.models import CollectContext
from market_monitor.data.sources import annual_backfill

CLOCK = datetime(2026, 11, 25, 12, 0, 0, tzinfo=timezone.utc)
TODAY = "2026-11-25"


def day_offset(days: int) -> str:
    return (CLOCK.date() + timedelta(days=days)).isoformat()


def tracked(series_id: str, kind: str = "instrument", priority: int = 0,
            symbol: str = "AAPL") -> dict[str, Any]:
    return {
        "series_id": series_id,
        "kind": kind,
        "provider_symbol": symbol,
        "currency": "USD",
        "priority": priority,
    }


class FakeWarehouse:
    def __init__(self, counts: dict[str, int] | None = None) -> None:
        self.counts = dict(counts or {})
        self.rows: list[tuple[list[dict[str, Any]], str]] = []

    def bar_coverage_since(self, start: str, interval: str = "1d"):
        return {
            series_id: {"count": count, "last_ts": TODAY}
            for series_id, count in self.counts.items()
        }

    def upsert_bars(self, rows: list[dict[str, Any]], source_id: str) -> int:
        self.rows.append(([dict(row) for row in rows], source_id))
        return len(rows)


class FakeHttp:
    request_count = 0


def fake_rows(start: str, count: int) -> list[dict[str, Any]]:
    days = []
    cursor = datetime.strptime(start, "%Y-%m-%d").date()
    while len(days) < count:
        if cursor.weekday() < 5:
            days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return [
        {
            "series_id": "INS:XNAS:AAPL",
            "interval": "1d",
            "ts": day,
            "open": 100.0 + index,
            "high": 102.0 + index,
            "low": 99.0 + index,
            "close": 101.0 + index,
            "volume": 1000,
            "source_id": "sina-finance",
        }
        for index, day in enumerate(days)
    ]


def context(
    settings: dict[str, Any] | None = None,
    *,
    counts: dict[str, int] | None = None,
    job_state: dict[str, Any] | None = None,
    warehouse: FakeWarehouse | None = None,
) -> tuple[CollectContext, FakeWarehouse]:
    store = warehouse or FakeWarehouse(counts)
    values = {
        "tracked_series": [tracked("INS:XNAS:AAPL")],
        "annual_backfill_days": 365,
        "annual_backfill_target_bars": 240,
        "annual_backfill_batch": 4,
        "annual_backfill_daily_limit": 20,
        "annual_backfill_retry_days": 7,
    }
    values.update(settings or {})
    return CollectContext(
        warehouse=store,
        http=FakeHttp(),
        settings=values,
        now_fn=lambda: CLOCK.timestamp(),
        logger=None,
        job_id="backfill:annual",
        job_state=dict(job_state or {}),
    ), store


class AnnualBackfillTests(unittest.TestCase):
    def test_watched_company_is_backfilled_from_real_rows(self) -> None:
        rows = fake_rows(day_offset(-364), 250)
        ctx, warehouse = context()
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            return_value=rows,
        ) as fetch:
            result = annual_backfill.collect(ctx)
        fetch.assert_called_once()
        self.assertEqual(result["status"], "ok")
        self.assertGreater(result["stored"], 200)
        stored = warehouse.rows[0][0]
        self.assertTrue(all(row["ts"] >= day_offset(-365) for row in stored))
        self.assertTrue(all(row["ts"] <= TODAY for row in stored))
        self.assertEqual(result["details"]["coverage"]["needs"], 1)
        self.assertEqual(result["details"]["filled_series"], 1)

    def test_short_real_history_is_kept_without_fabricated_points(self) -> None:
        rows = fake_rows(day_offset(-3), 3)
        ctx, warehouse = context()
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            return_value=rows,
        ):
            result = annual_backfill.collect(ctx)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 3)
        self.assertEqual(
            [row["ts"] for row in warehouse.rows[0][0]],
            [row["ts"] for row in rows],
        )
        self.assertNotIn("padding", result)
        self.assertNotIn("generated", result)

    def test_out_of_window_rows_are_discarded(self) -> None:
        rows = fake_rows(day_offset(-600), 5) + fake_rows(TODAY, 1)
        ctx, warehouse = context()
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            return_value=rows,
        ):
            result = annual_backfill.collect(ctx)
        self.assertEqual(result["stored"], 1)
        self.assertEqual(warehouse.rows[0][0][0]["ts"], TODAY)

    def test_recent_attempt_is_not_retried_every_cycle(self) -> None:
        ctx, warehouse = context(
            job_state={"attempted": {"INS:XNAS:AAPL": day_offset(-1)}},
        )
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            return_value=fake_rows(TODAY, 1),
        ) as fetch:
            result = annual_backfill.collect(ctx)
        fetch.assert_not_called()
        self.assertEqual(result["details"]["selected"], 0)
        self.assertEqual(result["details"]["needs"], 0)
        self.assertEqual(warehouse.rows, [])

    def test_only_watched_instruments_are_selected(self) -> None:
        ctx, _warehouse = context(settings={
            "tracked_series": [
                tracked("INS:XNAS:AAPL"),
                tracked("IDX:GSPC", kind="index"),
                tracked("INS:XNAS:EXTRA", priority=1, symbol="EXTRA"),
            ],
        })
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            return_value=fake_rows(TODAY, 1),
        ) as fetch:
            result = annual_backfill.collect(ctx)
        fetch.assert_called_once()
        self.assertEqual(result["details"]["universe"], 1)
        self.assertEqual(result["details"]["selected"], 1)

    def test_source_failure_never_creates_rows(self) -> None:
        ctx, warehouse = context()
        with unittest.mock.patch.object(
            annual_backfill.market_channels,
            "_fetch_eod_series",
            side_effect=DataSourceError("upstream down"),
        ):
            result = annual_backfill.collect(ctx)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["stored"], 0)
        self.assertEqual(warehouse.rows, [])
        self.assertEqual(result["details"]["errors"][0]["reason"], "source_unavailable")

    def test_dry_run_plans_without_writing(self) -> None:
        ctx, warehouse = context(settings={"dry_run": True})
        result = annual_backfill.collect(ctx)
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["stored"], 0)
        self.assertEqual(warehouse.rows, [])


if __name__ == "__main__":
    unittest.main()
