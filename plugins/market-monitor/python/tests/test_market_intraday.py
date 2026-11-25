"""Offline tests for the real intraday density collector."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from typing import Any
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data.models import CollectContext
from market_monitor.data.sources import market_intraday

CLOCK = datetime(2026, 11, 25, 21, 0, 0, tzinfo=timezone.utc)
TODAY = "2026-11-25"


def fixture_rows(count: int = 6) -> list[dict[str, Any]]:
    """Real-looking Sina 5m rows, converted to our row shape."""
    rows = []
    for index in range(count):
        hour = 20
        minute = 30 + index * 5
        if minute >= 60:
            hour += 1
            minute -= 60
        rows.append({
            "interval": "5m",
            "ts": f"{TODAY}T{hour:02d}:{minute:02d}:00Z",
            "open": 100.0 + index,
            "high": 101.0 + index,
            "low": 99.0 + index,
            "close": 100.5 + index,
            "volume": 10.0,
            "source_id": "sina-finance",
            "quality": "final",
        })
    return rows


class FakeWarehouse:
    def __init__(self) -> None:
        self.rows: list[tuple[list[dict[str, Any]], str, str]] = []

    def upsert_bars(self, rows: list[dict[str, Any]], source_id: str) -> int:
        interval = str(rows[0].get("interval") or "") if rows else ""
        self.rows.append(([dict(row) for row in rows], source_id, interval))
        return len(rows)


def context(series: list[dict[str, Any]]) -> tuple[CollectContext, FakeWarehouse]:
    warehouse = FakeWarehouse()
    return CollectContext(
        warehouse=warehouse,
        http=object(),
        settings={
            "tracked_series": series,
            "intraday_batch": 12,
            "intraday_5m_days": 5,
            "intraday_daily_limit": 60,
        },
        now_fn=lambda: CLOCK.timestamp(),
        logger=None,
    ), warehouse


def tracked(symbol: str, *, kind: str = "instrument", priority: int = 0) -> dict[str, Any]:
    return {
        "series_id": f"INS:XNAS:{symbol}",
        "kind": kind,
        "provider_symbol": symbol,
        "currency": "USD",
        "priority": priority,
    }


class MarketIntradayTests(unittest.TestCase):
    def test_parse_minute_jsonp_uses_utc_and_keeps_only_real_ohlc(self) -> None:
        text = (
            "/*<script>location.href='//sina.com';</script>*/\n"
            'var _AAPL=([{"d":"2026-11-25 15:55:00","o":"100","h":"101",'
            '"l":"99","c":"100.5","v":"12"},'
            '{"d":"bad","o":"1","h":"2","l":"0","c":"1","v":"1"}]);'
        )
        rows = market_intraday.parse_minute_jsonp(text, "5m")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ts"], "2026-11-25T20:55:00Z")
        self.assertEqual(rows[0]["interval"], "5m")
        self.assertEqual(rows[0]["source_id"], "sina-finance")

    def test_aggregate_30m_uses_only_the_real_5m_bars(self) -> None:
        thirty = market_intraday.aggregate_30m(fixture_rows(6))
        self.assertEqual(len(thirty), 1)
        self.assertEqual(thirty[0]["interval"], "30m")
        self.assertEqual(thirty[0]["ts"], "2026-11-25T20:30:00Z")
        self.assertEqual(thirty[0]["open"], 100.0)
        self.assertEqual(thirty[0]["close"], 105.5)
        self.assertEqual(thirty[0]["high"], 106.0)
        self.assertEqual(thirty[0]["low"], 99.0)
        self.assertEqual(thirty[0]["quality"], "derived")

    def test_collect_stores_5m_and_30m_separately(self) -> None:
        series = [tracked("AAPL"), tracked("MSFT"), tracked("^GSPC", kind="index")]
        ctx, warehouse = context(series)
        with mock.patch.object(
            market_intraday, "_fetch", return_value=fixture_rows(6),
        ) as fetch:
            result = market_intraday.collect(ctx)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(result["status"], "ok")
        intervals = [row[2] for row in warehouse.rows]
        self.assertEqual(intervals.count("5m"), 2)
        self.assertEqual(intervals.count("30m"), 2)
        self.assertEqual(result["details"]["bars_5m"], 12)
        self.assertEqual(result["details"]["bars_30m"], 2)
        self.assertEqual(result["details"]["window"]["days"], 5)
        self.assertEqual(result["job_state"]["cursor"], 0)

    def test_source_failure_stores_nothing(self) -> None:
        ctx, warehouse = context([tracked("AAPL")])
        with mock.patch.object(
            market_intraday, "_fetch", side_effect=market_intraday.DataSourceError("down"),
        ):
            result = market_intraday.collect(ctx)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(warehouse.rows, [])
        self.assertEqual(result["details"]["errors"][0]["reason"], "source_unavailable")


if __name__ == "__main__":
    unittest.main()
