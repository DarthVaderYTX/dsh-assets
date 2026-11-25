"""Offline tests for the ``china:commodities`` index provider.

The seed rows and the curated exchange seed are injected by monkeypatching the
module-level loaders, so the suite never touches the network.  A small class at
the end runs the collector against the *bundled* seed to prove the committed
data itself is valid and projectable.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_monitor.data import DataWarehouse
from market_monitor.data.models import CollectContext
from market_monitor.data.indices import china_commodities
from market_monitor.data.sources import reference_global

#: Deterministic "now" for the whole suite: 2026-11-25T12:00:00Z.
FIXED_EPOCH = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc).timestamp()
FIXED_ISO = "2026-11-25T12:00:00Z"
#: now + 30 days (the index refresh interval).
NEXT_REFRESH_ISO = "2026-12-25T12:00:00Z"

SEED_ROWS = [
    {
        "venue": "XSHF", "root": "AU", "name": "Gold futures (SHFE)",
        "name_zh": "黄金连续", "category": "metals", "unit": "gram",
        "currency": "CNY", "provider_symbol": "AU0",
    },
    {
        "venue": "XSHF", "root": "CU", "name": "Copper futures (SHFE)",
        "name_zh": "沪铜连续", "category": "metals", "unit": "tonne",
        "currency": "CNY", "provider_symbol": "CU0",
    },
    {
        "venue": "XCZC", "root": "SR", "name": "White sugar futures (CZCE)",
        "name_zh": "白糖连续", "category": "agriculture", "unit": "tonne",
        "currency": "CNY", "provider_symbol": "SR0",
    },
]

#: Curated exchange seed rows (the five mainland venues plus one unrelated MIC).
SEED_EXCHANGES = [
    {
        "mic": "XCZC", "code": "CZCE", "name": "Zhengzhou Commodity Exchange",
        "country": "CN", "city": "Zhengzhou", "timezone": "Asia/Shanghai",
        "currency": "CNY", "calendar": "CN-FUTURES", "website": "http://www.czce.com.cn",
    },
    {
        "mic": "XDCE", "code": "DCE", "name": "Dalian Commodity Exchange",
        "country": "CN", "city": "Dalian", "timezone": "Asia/Shanghai",
        "currency": "CNY", "calendar": "CN-FUTURES", "website": "http://www.dce.com.cn",
    },
    {
        "mic": "XGFE", "code": "GFEX", "name": "Guangzhou Futures Exchange",
        "country": "CN", "city": "Guangzhou", "timezone": "Asia/Shanghai",
        "currency": "CNY", "calendar": "CN-FUTURES", "website": "http://www.gfex.com.cn",
    },
    {
        "mic": "XINE", "code": "INE", "name": "Shanghai International Energy Exchange",
        "country": "CN", "city": "Shanghai", "timezone": "Asia/Shanghai",
        "currency": "CNY", "calendar": "CN-FUTURES", "website": "https://www.ine.cn",
    },
    {
        "mic": "XSHF", "code": "SHFE", "name": "Shanghai Futures Exchange",
        "country": "CN", "city": "Shanghai", "timezone": "Asia/Shanghai",
        "currency": "CNY", "calendar": "CN-FUTURES", "website": "https://www.shfe.com.cn",
    },
    {
        "mic": "XNAS", "code": "NASDAQ", "name": "Nasdaq",
        "country": "US", "city": "New York", "timezone": "America/New_York",
        "currency": "USD", "calendar": "US-EQUITY", "website": "https://www.nasdaq.com",
    },
]


class NoHttp:
    """HTTP double that fails the test if the offline index tries to fetch."""

    def fetch(self, *args: object, **kwargs: object) -> None:  # noqa: D401 - test double
        raise AssertionError(f"the china commodities index must not use HTTP: {args} {kwargs}")


class IndexTestCase(unittest.TestCase):
    """In-memory warehouse, injected seed/exchange fixtures and fixed clock."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(now_fn=lambda: FIXED_EPOCH)
        self.addCleanup(self.warehouse.close)
        self.seed_rows = copy.deepcopy(SEED_ROWS)
        self.exchanges = copy.deepcopy(SEED_EXCHANGES)
        seed_patcher = mock.patch.object(
            china_commodities, "load_seed", new=self._load_seed,
        )
        seed_patcher.start()
        self.addCleanup(seed_patcher.stop)
        exchange_patcher = mock.patch.object(
            reference_global, "load_seed",
            new=lambda *_args, **_kwargs: {"exchanges": copy.deepcopy(self.exchanges)},
        )
        exchange_patcher.start()
        self.addCleanup(exchange_patcher.stop)

    def _load_seed(self, base_dir: object = None) -> list[dict]:
        """Module loader replacement returning a copy of the fixture rows."""
        return [dict(row) for row in self.seed_rows]

    def context(self, settings: dict | None = None) -> CollectContext:
        """Build a collection context over this test's warehouse."""
        logger = logging.getLogger(f"tests.index.china_commodities.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        return CollectContext(
            warehouse=self.warehouse,
            http=NoHttp(),
            settings=dict(settings or {}),
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="china:index",
        )

    def collect(self, settings: dict | None = None) -> dict:
        """Run the collector over the fixtures."""
        return china_commodities.collect(self.context(settings))

    def entries_by_key(self) -> dict[str, dict]:
        """The stored index entries keyed by entry key."""
        rows = self.warehouse.list_index_entries(china_commodities.INDEX_ID, limit=500)["entries"]
        return {row["entry_key"]: row for row in rows}

    def alias_keys(self) -> set[tuple[str, str, str, str]]:
        """Alias identities as ``(alias, entity_type, entity_id, alias_type)``."""
        return {
            (row["alias"], row["entity_type"], row["entity_id"], row["alias_type"])
            for row in self.warehouse.list_aliases()
        }


# ---------------------------------------------------------------- seed loading


class SeedValidationTests(unittest.TestCase):
    """``load_seed`` validation: required fields, identity and duplicates."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def write_seed(self, payload: object) -> str:
        """Write ``china_commodities.json`` into the temp seed dir."""
        path = Path(self.directory.name) / china_commodities.SEED_FILENAME
        path.write_text(json.dumps(payload), encoding="utf-8")
        return self.directory.name

    def test_bundled_seed_is_valid_and_normalised(self) -> None:
        rows = china_commodities.load_seed()
        self.assertEqual(len(rows), 38)
        self.assertEqual(
            {row["venue"] for row in rows},
            set(china_commodities.CHINA_COMMODITY_VENUES),
        )
        gold = next(row for row in rows if row["venue"] == "XSHF" and row["root"] == "AU")
        self.assertEqual(gold["provider_symbol"], "AU0")
        self.assertEqual(gold["name_zh"], "黄金连续")
        self.assertEqual(gold["currency"], "CNY")
        self.assertEqual(gold["category"], "metals")
        identities = {f"{row['venue']}:{row['root']}" for row in rows}
        self.assertEqual(len(identities), len(rows))

    def test_normalises_case_and_accepts_bare_array(self) -> None:
        base = self.write_seed([
            {
                "venue": "xshf", "root": "au", "name": "Gold", "name_zh": "黄金",
                "category": "METALS", "unit": "gram", "currency": "cny",
                "provider_symbol": "au0",
            },
        ])
        rows = china_commodities.load_seed(base)
        self.assertEqual(rows[0]["venue"], "XSHF")
        self.assertEqual(rows[0]["root"], "AU")
        self.assertEqual(rows[0]["category"], "metals")
        self.assertEqual(rows[0]["currency"], "CNY")
        self.assertEqual(rows[0]["provider_symbol"], "AU0")

    def test_missing_required_field_is_rejected(self) -> None:
        for field in china_commodities.REQUIRED_ROOT_FIELDS:
            with self.subTest(field=field):
                row = dict(SEED_ROWS[0])
                row.pop(field)
                base = self.write_seed({"roots": [row]})
                with self.assertRaises(ValueError) as caught:
                    china_commodities.load_seed(base)
                self.assertIn(field, str(caught.exception))

    def test_duplicate_venue_root_is_rejected(self) -> None:
        base = self.write_seed({"roots": [SEED_ROWS[0], dict(SEED_ROWS[0])]})
        with self.assertRaises(ValueError) as caught:
            china_commodities.load_seed(base)
        self.assertIn("duplicates", str(caught.exception))

    def test_empty_and_malformed_payloads_are_rejected(self) -> None:
        for payload in ({"roots": []}, {}, [], None):
            with self.subTest(payload=repr(payload)):
                base = self.write_seed(payload)
                with self.assertRaises(ValueError):
                    china_commodities.load_seed(base)

    def test_unknown_venue_is_rejected(self) -> None:
        row = dict(SEED_ROWS[0], venue="XNAS")
        base = self.write_seed({"roots": [row]})
        with self.assertRaises(ValueError) as caught:
            china_commodities.load_seed(base)
        self.assertIn("venue", str(caught.exception))

    def test_invalid_json_and_missing_file_are_rejected(self) -> None:
        path = Path(self.directory.name) / china_commodities.SEED_FILENAME
        path.write_text("{not json", encoding="utf-8")
        with self.assertRaises(ValueError) as caught:
            china_commodities.load_seed(self.directory.name)
        self.assertIn("invalid JSON", str(caught.exception))

        with self.assertRaises(ValueError) as caught:
            china_commodities.load_seed(Path(self.directory.name) / "missing")
        self.assertIn("not found", str(caught.exception))


# -------------------------------------------------------------------- snapshot


class SnapshotTests(IndexTestCase):
    """``build_snapshot`` entry contract and completeness semantics."""

    def test_entry_payload_matches_the_index_contract(self) -> None:
        entries, details = china_commodities.build_snapshot(self.context())

        self.assertTrue(details["complete"])
        self.assertEqual(details["source_id"], china_commodities.SEED_SOURCE_ID)
        self.assertEqual(details["seed_rows"], 3)
        self.assertEqual(details["entries"], 3)
        self.assertEqual(details["markets"], {"XSHF": 2, "XCZC": 1})
        self.assertEqual([entry["entry_key"] for entry in entries], sorted(
            entry["entry_key"] for entry in entries
        ))

        by_key = {entry["entry_key"]: entry for entry in entries}
        self.assertEqual(set(by_key), {"COM:XSHF:AU", "COM:XSHF:CU", "COM:XCZC:SR"})
        gold = by_key["COM:XSHF:AU"]
        self.assertEqual(gold["entry_key"], gold["entity_id"])
        self.assertEqual(gold["entity_type"], "commodity_root")
        self.assertEqual(gold["market"], "XSHF")
        self.assertEqual(gold["source_id"], china_commodities.SEED_SOURCE_ID)
        self.assertEqual(gold["profile_status"], "ready")
        payload = gold["payload"]
        self.assertEqual(
            set(payload),
            {
                "name", "name_zh", "root", "venue", "category", "unit", "currency",
                "provider_symbol", "provider_ids", "aliases",
            },
        )
        self.assertEqual(payload["name"], "Gold futures (SHFE)")
        self.assertEqual(payload["name_zh"], "黄金连续")
        self.assertEqual(payload["root"], "AU")
        self.assertEqual(payload["venue"], "XSHF")
        self.assertEqual(payload["category"], "metals")
        self.assertEqual(payload["unit"], "gram")
        self.assertEqual(payload["currency"], "CNY")
        self.assertEqual(payload["provider_symbol"], "AU0")
        self.assertEqual(payload["provider_ids"], {"sina_symbol": "AU0"})
        self.assertEqual(payload["aliases"], [
            {"alias": "AU", "alias_type": "symbol"},
            {"alias": "Gold futures (SHFE)", "alias_type": "name"},
            {"alias": "黄金连续", "alias_type": "name"},
            {"alias": "AU0", "alias_type": "symbol"},
        ])

    def test_definition_matches_the_required_surface(self) -> None:
        definition = china_commodities.INDEX_DEFINITION
        self.assertEqual(china_commodities.INDEX_ID, "china:commodities")
        self.assertEqual(
            set(definition),
            {"index_id", "name", "kind", "description", "markets",
             "source_ids", "refresh_interval_s", "enabled"},
        )
        self.assertEqual(definition["kind"], "china_commodities")
        self.assertEqual(definition["markets"], sorted(china_commodities.CHINA_COMMODITY_VENUES))
        self.assertEqual(set(definition["markets"]), {"XSHF", "XINE", "XDCE", "XCZC", "XGFE"})
        self.assertEqual(definition["source_ids"], ["seed"])
        self.assertEqual(definition["refresh_interval_s"], 2592000)
        self.assertTrue(definition["enabled"])


# ------------------------------------------------------------------ registration


class RegistrationTests(IndexTestCase):
    """Definition bootstrap idempotence and repair."""

    def test_ensure_registered_is_idempotent_and_repairs_changes(self) -> None:
        definition = china_commodities.ensure_registered(self.warehouse)
        self.assertEqual(definition["index_id"], china_commodities.INDEX_ID)
        self.assertEqual(definition["kind"], "china_commodities")
        self.assertEqual(definition["revision"], 0)
        updated_at = definition["updated_at"]

        again = china_commodities.ensure_registered(self.warehouse)
        self.assertEqual(again["updated_at"], updated_at)
        self.assertEqual(again["refresh_interval_s"], 2592000)

        self.warehouse.register_index({
            **china_commodities.INDEX_DEFINITION, "refresh_interval_s": 12345,
        })
        self.assertEqual(
            self.warehouse.get_index_definition(china_commodities.INDEX_ID)["refresh_interval_s"],
            12345,
        )
        repaired = china_commodities.ensure_registered(self.warehouse)
        self.assertEqual(repaired["refresh_interval_s"], 2592000)


# ---------------------------------------------------------------------- collect


class CollectTests(IndexTestCase):
    """End-to-end ``collect`` over the diff, projection and audit tables."""

    def test_first_collect_projects_roots_aliases_and_exchanges(self) -> None:
        result = self.collect()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["stored"], 3)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["duplicates"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["index_id"], china_commodities.INDEX_ID)
        self.assertEqual(result["details"]["counts"]["added"], 3)
        self.assertEqual(result["details"]["counts"]["entries_seen"], 3)
        self.assertEqual(result["details"]["revision"], 1)
        self.assertEqual(result["details"]["markets"], {"XSHF": 2, "XCZC": 1})
        self.assertEqual(
            result["job_state"],
            {"last_revision": 1, "index_id": china_commodities.INDEX_ID},
        )

        # Index entries and definition/schedule state.
        entries = self.entries_by_key()
        self.assertEqual(set(entries), {"COM:XSHF:AU", "COM:XSHF:CU", "COM:XCZC:SR"})
        self.assertTrue(all(entry["status"] == "active" for entry in entries.values()))
        self.assertTrue(all(entry["profile_status"] == "ready" for entry in entries.values()))
        definition = self.warehouse.get_index_definition(china_commodities.INDEX_ID)
        self.assertEqual(definition["kind"], "china_commodities")
        self.assertEqual(definition["refresh_interval_s"], 2592000)
        self.assertEqual(definition["source_ids"], ["seed"])
        self.assertTrue(definition["enabled"])
        self.assertEqual(definition["next_refresh_at"], NEXT_REFRESH_ISO)
        self.assertEqual(definition["last_refresh_at"], FIXED_ISO)
        self.assertEqual(definition["active"], 3)
        self.assertEqual(definition["revision"], 1)

        # ref_commodity_root projection.
        roots = {row["root_id"]: row for row in self.warehouse.list_commodity_roots()}
        self.assertEqual(set(roots), {"COM:XSHF:AU", "COM:XSHF:CU", "COM:XCZC:SR"})
        gold = roots["COM:XSHF:AU"]
        self.assertEqual(gold["venue"], "XSHF")
        self.assertEqual(gold["root"], "AU")
        self.assertEqual(gold["name"], "Gold futures (SHFE)")
        self.assertEqual(gold["category"], "metals")
        self.assertEqual(gold["unit"], "gram")
        self.assertEqual(gold["currency"], "CNY")
        self.assertEqual(gold["provider_symbol"], "AU0")
        self.assertEqual(gold["source_id"], china_commodities.SEED_SOURCE_ID)
        self.assertEqual(gold["updated_at"], FIXED_ISO)

        # ref_alias projection: root/name/Chinese name/provider symbol per root.
        self.assertEqual(len(self.warehouse.list_aliases()), 12)
        aliases = self.alias_keys()
        self.assertIn(("AU", "commodity_root", "COM:XSHF:AU", "symbol"), aliases)
        self.assertIn(("Gold futures (SHFE)", "commodity_root", "COM:XSHF:AU", "name"), aliases)
        self.assertIn(("黄金连续", "commodity_root", "COM:XSHF:AU", "name"), aliases)
        self.assertIn(("AU0", "commodity_root", "COM:XSHF:AU", "symbol"), aliases)
        chinese = next(
            row for row in self.warehouse.list_aliases()
            if row["alias"] == "黄金连续" and row["entity_id"] == "COM:XSHF:AU"
        )
        self.assertEqual(chinese["language"], "zh")
        english = next(
            row for row in self.warehouse.list_aliases()
            if row["alias"] == "Gold futures (SHFE)" and row["entity_id"] == "COM:XSHF:AU"
        )
        self.assertEqual(english["language"], "en")

        # ref_exchange projection: only the five mainland venues from the seed.
        exchanges = self.warehouse.list_exchanges()
        self.assertEqual(
            {row["mic"] for row in exchanges},
            {"XSHF", "XINE", "XDCE", "XCZC", "XGFE"},
        )
        shfe = next(row for row in exchanges if row["mic"] == "XSHF")
        self.assertEqual(shfe["name"], "Shanghai Futures Exchange")
        self.assertEqual(shfe["country"], "CN")
        self.assertEqual(shfe["source_id"], reference_global.SEED_SOURCE_ID)
        self.assertEqual(result["details"]["projection"]["exchanges"], 5)

        # One refresh audit row, no network requests.
        refreshes = self.warehouse.list_index_refreshes(china_commodities.INDEX_ID)
        self.assertEqual(len(refreshes), 1)
        refresh = refreshes[0]
        self.assertEqual(refresh["status"], "ok")
        self.assertEqual(refresh["added"], 3)
        self.assertEqual(refresh["entries_seen"], 3)
        self.assertEqual(refresh["requests"], 0)
        self.assertTrue(refresh["details"]["complete"])
        self.assertEqual(refresh["details"]["projection"]["stored"], 3)
        self.assertEqual(refresh["details"]["projection"]["aliases"], 12)

    def test_second_identical_collect_is_idempotent(self) -> None:
        first = self.collect()
        counts_after_first = self.warehouse.table_counts()
        changes_after_first = counts_after_first["index_changes"]

        second = self.collect()

        self.assertEqual(second["status"], "ok")
        self.assertEqual(second["stored"], 0)
        self.assertEqual(second["updated"], 0)
        self.assertEqual(second["details"]["counts"]["added"], 0)
        self.assertEqual(second["details"]["counts"]["updated"], 0)
        self.assertEqual(second["details"]["counts"]["entries_seen"], 3)
        self.assertEqual(first["stored"], 3)

        counts_after_second = self.warehouse.table_counts()
        for table in (
            "commodity_roots", "aliases", "exchanges", "indices_defined",
            "index_entries", "index_changes",
        ):
            self.assertEqual(counts_after_second[table], counts_after_first[table], table)
        self.assertEqual(
            counts_after_second["index_refreshes"], counts_after_first["index_refreshes"] + 1,
        )
        self.assertEqual(counts_after_second["index_changes"], changes_after_first)
        self.assertEqual(counts_after_second["commodity_contracts"], 0)
        self.assertEqual(self.warehouse.index_entry_stats(china_commodities.INDEX_ID)["active"], 3)

        refreshes = self.warehouse.list_index_refreshes(china_commodities.INDEX_ID)
        self.assertEqual(len(refreshes), 2)
        self.assertEqual([row["status"] for row in refreshes], ["ok", "ok"])
        self.assertEqual(refreshes[0]["added"], 0)

    def test_seed_change_updates_projection_without_deleting_aliases(self) -> None:
        self.collect()
        self.seed_rows[0] = {**self.seed_rows[0], "name": "Gold futures (renamed)"}

        result = self.collect()

        self.assertEqual(result["details"]["counts"]["updated"], 1)
        self.assertEqual(result["details"]["counts"]["added"], 0)
        gold = next(
            row for row in self.warehouse.list_commodity_roots()
            if row["root_id"] == "COM:XSHF:AU"
        )
        self.assertEqual(gold["name"], "Gold futures (renamed)")
        entry = self.warehouse.get_index_entry(china_commodities.INDEX_ID, "COM:XSHF:AU")
        self.assertEqual(entry["payload"]["name"], "Gold futures (renamed)")
        # The new name is projected; old alias rows are never deleted in v1.
        self.assertIn(
            ("Gold futures (renamed)", "commodity_root", "COM:XSHF:AU", "name"),
            self.alias_keys(),
        )
        changes = self.warehouse.list_index_changes(china_commodities.INDEX_ID, limit=10)
        self.assertEqual(changes[0]["change_type"], "updated")
        self.assertIn("payload.name", changes[0]["changed_fields"])

    def test_missing_then_delisted_never_deletes_reference_rows(self) -> None:
        self.collect()
        removed = self.seed_rows.pop(1)  # CU disappears from the complete seed.

        missing = self.collect()
        self.assertEqual(missing["details"]["counts"]["removed"], 1)
        self.assertEqual(missing["details"]["counts"]["delisted"], 0)
        entry = self.warehouse.get_index_entry(china_commodities.INDEX_ID, "COM:XSHF:CU")
        self.assertEqual(entry["status"], "missing")
        self.assertIsNotNone(
            next((row for row in self.warehouse.list_commodity_roots()
                  if row["root_id"] == "COM:XSHF:CU"), None),
            "a missing root must never delete its reference row",
        )

        delisted = self.collect()
        self.assertEqual(delisted["details"]["counts"]["delisted"], 1)
        entry = self.warehouse.get_index_entry(china_commodities.INDEX_ID, "COM:XSHF:CU")
        self.assertEqual(entry["status"], "delisted")
        self.assertIsNotNone(
            next((row for row in self.warehouse.list_commodity_roots()
                  if row["root_id"] == "COM:XSHF:CU"), None),
        )
        self.assertEqual(self.warehouse.index_entry_stats(china_commodities.INDEX_ID)["active"], 2)

        # A returning root is restored and becomes active again.
        self.seed_rows.insert(1, removed)
        restored = self.collect()
        self.assertEqual(restored["details"]["counts"]["restored"], 1)
        entry = self.warehouse.get_index_entry(china_commodities.INDEX_ID, "COM:XSHF:CU")
        self.assertEqual(entry["status"], "active")

    def test_dry_run_plans_without_writing_or_fetching(self) -> None:
        result = self.collect(settings={"dry_run": True})

        self.assertEqual(result["stored"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["skipped"], 0)
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["details"]["dry_run"])
        self.assertEqual(result["details"]["planned_seed"], 3)
        self.assertEqual(result["index_id"], china_commodities.INDEX_ID)
        self.assertIsNone(self.warehouse.get_index_definition(china_commodities.INDEX_ID))
        counts = self.warehouse.table_counts()
        for table in ("commodity_roots", "aliases", "exchanges", "index_entries", "index_refreshes"):
            self.assertEqual(counts[table], 0, table)

    def test_broken_seed_records_an_error_refresh_then_raises(self) -> None:
        with mock.patch.object(
            china_commodities, "load_seed", side_effect=ValueError("broken seed"),
        ):
            with self.assertRaises(ValueError):
                self.collect()

        refreshes = self.warehouse.list_index_refreshes(china_commodities.INDEX_ID)
        self.assertEqual(len(refreshes), 1)
        self.assertEqual(refreshes[0]["status"], "error")
        self.assertIn("broken seed", refreshes[0]["error"])
        self.assertEqual(refreshes[0]["details"]["exception"], "ValueError")


# ---------------------------------------------------------------- bundled seed


class BundledSeedCollectTests(unittest.TestCase):
    """The committed seed must load and project without any fixture patching."""

    def setUp(self) -> None:
        self.warehouse = DataWarehouse(now_fn=lambda: FIXED_EPOCH)
        self.addCleanup(self.warehouse.close)
        logger = logging.getLogger(f"tests.index.china_commodities.bundled.{id(self)}")
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        self.context = CollectContext(
            warehouse=self.warehouse,
            http=NoHttp(),
            settings={},
            now_fn=lambda: FIXED_EPOCH,
            logger=logger,
            job_id="china:index",
        )

    def test_bundled_seed_collects_all_38_roots(self) -> None:
        result = china_commodities.collect(self.context)

        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["details"]["entries"], 38)
        self.assertEqual(result["details"]["seed_rows"], 38)
        self.assertEqual(result["details"]["markets"], {
            "XCZC": 9, "XDCE": 11, "XGFE": 3, "XINE": 4, "XSHF": 11,
        })
        self.assertEqual(len(self.warehouse.list_commodity_roots()), 38)
        self.assertEqual(len(self.warehouse.list_aliases()), 38 * 4)
        self.assertEqual(
            {row["mic"] for row in self.warehouse.list_exchanges()},
            {"XSHF", "XINE", "XDCE", "XCZC", "XGFE"},
        )
        root = next(
            row for row in self.warehouse.list_commodity_roots()
            if row["root_id"] == "COM:XSHF:AU"
        )
        self.assertEqual(root["provider_symbol"], "AU0")
        self.assertEqual(self.warehouse.table_counts()["commodity_contracts"], 0)


if __name__ == "__main__":
    unittest.main()
