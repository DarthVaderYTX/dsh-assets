"""Tests for the generic index framework in the warehouse."""

from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data.warehouse import DataWarehouse

INDEX = "company:master"


def _entry(key: str, name: str, market: str = "US", *, cik: str | None = None) -> dict:
    """Build one snapshot entry for the company index."""
    payload = {"name": name, "symbol": key.rsplit(":", 1)[-1], "venue": market}
    if cik is not None:
        payload["provider_ids"] = {"sec_cik": cik}
    return {
        "entry_key": key,
        "entity_type": "instrument",
        "entity_id": key,
        "market": market,
        "source_id": "sec-edgar",
        "payload": payload,
    }


class IndexFoundationTests(unittest.TestCase):
    """Behaviour of index definitions, diffs, changes and profiles."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse()
        self.warehouse.register_index({
            "index_id": INDEX,
            "name": "Company master index",
            "kind": "company_master",
            "description": "test",
            "markets": ["US", "XTKS"],
            "source_ids": ["sec-edgar", "nasdaqtrader", "seed"],
            "refresh_interval_s": 86400,
        })

    def tearDown(self) -> None:
        self.warehouse.close()

    def test_definition_roundtrip_and_registry(self) -> None:
        definition = self.warehouse.get_index_definition(INDEX)
        self.assertEqual(definition["kind"], "company_master")
        self.assertEqual(definition["markets"], ["US", "XTKS"])
        self.assertEqual(definition["revision"], 0)
        self.assertEqual([item["index_id"] for item in self.warehouse.list_index_definitions()], [INDEX])
        self.warehouse.register_index({**definition, "description": "updated"})
        again = self.warehouse.get_index_definition(INDEX)
        self.assertEqual(again["description"], "updated")
        self.assertEqual(again["created_at"], definition["created_at"])

    def test_first_snapshot_adds_entries_and_stats(self) -> None:
        result = self.warehouse.apply_index_snapshot(
            INDEX,
            [_entry("INS:XNAS:AAPL", "Apple Inc.", cik="320193"),
             _entry("INS:XTKS:7203", "Toyota", market="XTKS")],
            source_id="sec-edgar",
        )
        self.assertEqual(result["revision"], 1)
        self.assertEqual(result["added"], 2)
        self.assertEqual(result["entries_seen"], 2)
        self.assertEqual(result["active"], 2)
        stats = self.warehouse.index_entry_stats(INDEX)
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["active"], 2)
        self.assertEqual(stats["pending_profiles"], 2)
        self.assertEqual(stats["by_market"], {"US": 1, "XTKS": 1})
        changes = self.warehouse.list_index_changes(INDEX)
        self.assertEqual([row["change_type"] for row in changes], ["added", "added"])

    def test_second_identical_snapshot_is_unchanged(self) -> None:
        entries = [_entry("INS:XNAS:AAPL", "Apple Inc.", cik="320193")]
        self.warehouse.apply_index_snapshot(INDEX, entries, source_id="sec-edgar")
        result = self.warehouse.apply_index_snapshot(INDEX, entries, source_id="sec-edgar")
        self.assertEqual(result["added"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["unchanged"], 1)
        self.assertEqual(result["revision"], 2)
        self.assertEqual(len(self.warehouse.list_index_changes(INDEX)), 1)
        entry = self.warehouse.get_index_entry(INDEX, "INS:XNAS:AAPL")
        self.assertEqual(entry["revision"], 1)

    def test_payload_change_is_updated_with_changed_fields(self) -> None:
        self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc.", cik="320193")], source_id="sec-edgar",
        )
        result = self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc. (new)", cik="320193")], source_id="sec-edgar",
        )
        self.assertEqual(result["updated"], 1)
        changed = self.warehouse.list_index_changes(INDEX)[0]
        self.assertEqual(changed["change_type"], "updated")
        self.assertIn("payload.name", changed["changed_fields"])
        entry = self.warehouse.get_index_entry(INDEX, "INS:XNAS:AAPL")
        self.assertEqual(entry["payload"]["name"], "Apple Inc. (new)")
        self.assertEqual(entry["revision"], 2)

    def test_missing_then_delisted_and_restored(self) -> None:
        entry = _entry("INS:XTKS:7203", "Toyota", market="XTKS")
        self.warehouse.apply_index_snapshot(INDEX, [entry], source_id="sec-edgar")
        missing = self.warehouse.apply_index_snapshot(INDEX, [], source_id="sec-edgar")
        self.assertEqual(missing["removed"], 1)
        self.assertEqual(self.warehouse.get_index_entry(INDEX, "INS:XTKS:7203")["status"], "missing")
        second = self.warehouse.apply_index_snapshot(INDEX, [], source_id="sec-edgar")
        self.assertEqual(second["delisted"], 1)
        delisted = self.warehouse.get_index_entry(INDEX, "INS:XTKS:7203")
        self.assertEqual(delisted["status"], "delisted")
        self.assertIsNotNone(delisted["valid_to"])
        third = self.warehouse.apply_index_snapshot(INDEX, [], source_id="sec-edgar")
        self.assertEqual(third["delisted"], 0)  # already-delisted entries are not re-reported
        self.assertEqual(third["removed"], 0)
        restored = self.warehouse.apply_index_snapshot(INDEX, [entry], source_id="sec-edgar")
        self.assertEqual(restored["restored"], 1)
        statuses = [row["change_type"] for row in self.warehouse.list_index_changes(INDEX)]
        self.assertEqual(statuses, ["restored", "delisted", "removed", "added"])

    def test_partial_snapshot_does_not_remove_entries(self) -> None:
        self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc."), _entry("INS:XNAS:MSFT", "Microsoft")],
            source_id="sec-edgar",
        )
        partial = self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc.")], source_id="sec-edgar",
            full_snapshot=False,
        )
        self.assertEqual(partial["removed"], 0)
        self.assertEqual(self.warehouse.get_index_entry(INDEX, "INS:XNAS:MSFT")["status"], "active")

    def test_malformed_entries_are_ignored(self) -> None:
        result = self.warehouse.apply_index_snapshot(
            INDEX,
            [{"entry_key": "", "entity_id": "INS:XNAS:X"},
             {"entry_key": "INS:XNAS:Y", "entity_id": ""},
             _entry("INS:XNAS:AAPL", "Apple Inc.")],
            source_id="sec-edgar",
        )
        self.assertEqual(result["added"], 1)

    def test_entries_filter_page_and_query(self) -> None:
        self.warehouse.apply_index_snapshot(
            INDEX,
            [_entry("INS:XNAS:AAPL", "Apple Inc.", "XNAS"), _entry("INS:XNAS:MSFT", "Microsoft", "XNAS"),
             _entry("INS:XTKS:7203", "Toyota", market="XTKS")],
            source_id="sec-edgar",
        )
        page = self.warehouse.list_index_entries(INDEX, market="XNAS", limit=1, offset=0)
        self.assertEqual(page["total"], 2)
        self.assertEqual(len(page["entries"]), 1)
        second = self.warehouse.list_index_entries(INDEX, market="XNAS", limit=1, offset=1)
        self.assertNotEqual(page["entries"][0]["entity_id"], second["entries"][0]["entity_id"])
        found = self.warehouse.list_index_entries(INDEX, query="Toyota")
        self.assertEqual(found["total"], 1)
        self.assertEqual(found["entries"][0]["entity_id"], "INS:XTKS:7203")

    def test_profile_queue_and_status_transitions(self) -> None:
        self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc.", cik="320193")], source_id="sec-edgar",
        )
        pending = self.warehouse.entries_needing_profiles(INDEX, limit=5)
        self.assertEqual([row["entry_key"] for row in pending], ["INS:XNAS:AAPL"])
        self.warehouse.upsert_company_profile({
            "entity_id": "INS:XNAS:AAPL", "market": "US", "legal_name": "Apple Inc.",
            "sic": "3571", "tickers": ["AAPL"], "exchanges": ["Nasdaq"],
            "source_id": "sec-submissions", "observed_at": "2026-11-24T00:00:00Z",
        })
        self.warehouse.update_index_profile(
            INDEX, "INS:XNAS:AAPL", profile_status="ready",
            synced_at="2026-11-24T00:00:00Z",
        )
        self.assertEqual(self.warehouse.entries_needing_profiles(INDEX), [])
        profile = self.warehouse.get_company_profile("INS:XNAS:AAPL")
        self.assertEqual(profile["legal_name"], "Apple Inc.")
        self.assertEqual(profile["tickers"], ["AAPL"])
        self.warehouse.update_index_profile(
            INDEX, "INS:XNAS:AAPL", profile_status="pending", error="timeout", increment_attempt=True,
        )
        entry = self.warehouse.get_index_entry(INDEX, "INS:XNAS:AAPL")
        self.assertEqual(entry["profile_attempts"], 1)
        self.assertEqual(entry["profile_error"], "timeout")
        self.assertEqual(len(self.warehouse.list_company_profiles()), 1)

    def test_refresh_audit_and_coverage(self) -> None:
        counts = {"entries_seen": 10, "added": 3, "updated": 1, "removed": 0, "profiles_queued": 2}
        refresh_id = self.warehouse.record_index_refresh(
            INDEX, started_at="2026-11-24T00:00:00Z", status="ok", counts=counts,
            requests=3, details={"sources": {"sec": "ok"}},
        )
        self.assertGreater(refresh_id, 0)
        rows = self.warehouse.list_index_refreshes(INDEX)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["added"], 3)
        self.assertEqual(rows[0]["details"]["sources"], {"sec": "ok"})
        coverage = self.warehouse.coverage()["domains"]["index"]
        self.assertEqual(coverage["indices"], 1)
        self.assertEqual(coverage["refreshes"], 1)

    def test_change_log_since_filter(self) -> None:
        first = self.warehouse.apply_index_snapshot(
            INDEX, [_entry("INS:XNAS:AAPL", "Apple Inc.")], source_id="sec-edgar",
        )
        self.assertEqual(first["added"], 1)
        newest_id = self.warehouse.list_index_changes(INDEX)[0]["change_id"]
        self.warehouse.apply_index_snapshot(
            INDEX,
            [_entry("INS:XNAS:AAPL", "Apple Inc."), _entry("INS:XNAS:MSFT", "Microsoft")],
            source_id="sec-edgar",
        )
        since = self.warehouse.list_index_changes(INDEX, since_change_id=newest_id)
        self.assertEqual(len(since), 1)
        self.assertEqual(since[0]["change_type"], "added")
        self.assertEqual(since[0]["entity_id"], "INS:XNAS:MSFT")


if __name__ == "__main__":
    unittest.main()
