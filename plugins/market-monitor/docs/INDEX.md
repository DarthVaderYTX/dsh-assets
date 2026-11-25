# Index framework and the company master index

The collection layer keeps two different kinds of data:

- **facts** — bars, quotes, news articles, profiles;
- **indexes** — updatable registries that answer *which entities exist in which
  market, and what changed since the last refresh*.

Indexes are the gate between raw providers and fact collectors. A collector that
needs company-specific data (profiles, filings, fundamentals, events) never
enumerates a provider directly; it asks the index for the current entries and
collects only what is due. This keeps source traffic proportional to the
tracked universe and gives every downstream fact a stable entity id.

`company:master` is the first index (kind `company_master`). The framework is
generic: further indexes add a definition, a snapshot builder, a projection and
one job, without changing the warehouse.

Implemented indexes:

| Index | Kind | Universe | Refresh |
| --- | --- | --- | --- |
| `company:master` | `company_master` | US operating companies from official bulk files + curated non-US seed; SEC profiles | `company:index` daily |
| `china:securities` | `china_securities` | mainland A-shares and ETFs from Eastmoney lists (Sina fallback; market-cap bounded; see [CHINA.md](CHINA.md)) | `china:index` daily |
| `china:commodities` | `china_commodities` | 38 mainland commodity front contracts on SHFE/INE/DCE/CZCE/GFEX | `china:index` daily |

## Lifecycle and boundaries

```
provider snapshots ──build_snapshot()──► entries
                                         │
              warehouse.apply_index_snapshot(index_id, entries, full_snapshot=…)
                                         │
                ┌────────────────────────┼────────────────────────┐
                ▼                        ▼                        ▼
        index_entry diff          index_change log         index_refresh audit
                │
         project_entries() ──► ref_instrument / ref_alias / ref_exchange
                │
         entries_needing_profiles() ──► company:profile job ──► company_profile
```

Entry status lifecycle:

| status | meaning |
| --- | --- |
| `active` | present in the latest complete snapshot |
| `missing` | absent from one full snapshot; still queryable, not delisted yet |
| `delisted` | absent from `delist_confirmations` consecutive full snapshots; `valid_to` is set |
| back to `active` | appears in a later snapshot; recorded as `restored` |

A refresh never deletes rows. Facts stay addressable by entity id after a
delisting, which matters for point-in-time research.

A partial snapshot (for example SEC succeeded but NasdaqTrader failed) is applied
with `full_snapshot=False`: additions and updates land, but nothing is marked
missing. This is why one failed provider can never mass-delist an index.

## Warehouse tables (schema v2)

| table | purpose |
| --- | --- |
| `index_def` | registry: id, kind, markets, source ids, refresh interval, revision, aggregate counts, last refresh state |
| `index_entry` | one tracked entity: `(index_id, entry_key)`, entity id/type, market, status, revision, misses, first/last seen, valid window, typed `payload` JSON, profile state |
| `index_change` | append-only diff log: `added / updated / removed / delisted / restored` plus changed field list and revision |
| `index_refresh` | one audit row per refresh attempt: counts, requests, status, error, details |
| `company_profile` | the authoritative company facts collected through the index (SEC submissions for US issuers) |

`payload` is the index-specific part, always JSON-serialisable. For the company
index it contains `name`, `symbol`, `venue`, `instrument_type`, `currency`,
`country`, `sector`, `industry`, `provider_symbol`, `provider_ids` and
`aliases`; provider ids are the bridge to downstream collectors (`sec_cik`).

## Company master index

- **Scope**: listed companies (`stock`, `adr`) on the covered markets. ETFs,
  crypto, FX, indices and commodity contracts are tracked by their own reference
  tables or future indexes, not by the company index.
- **US**: SEC EDGAR `company_tickers.json` + NasdaqTrader symbol directory files,
  merged by the existing reference parser. The merged listing decides the
  MIC/venue; SEC supplies the company title, CIK and former names.
- **Global**: the curated seed (`seed/global_instruments.json`) contributes
  company entries for the non-US exchanges in the seed; those entries are
  already `profile_status=ready` because the seed carries name/sector/industry.
  Seed rows on US markets are ignored: official bulk files own the US universe,
  and this also prevents a partial US refresh from rewriting US entries with
  poorer seed payloads.
- **Fund-like vehicles**: ETF/ETN/trust/royalty-trust/commodity-pool names are
  excluded even when a bulk file classifies them as `stock`; they belong in a
  future fund/ETF index, not in the company master index.
- **Refresh**: `company:index`, daily. It fetches the two bulk files with
  conditional GET (304 reuses the raw-document cache), builds the snapshot,
  diffs it, projects changed entries into `ref_instrument`/`ref_alias` (and US
  exchanges into `ref_exchange`), then queues US entries for profile collection.
- **Profile collection**: `company:profile`, every 5 minutes, at most
  `profile_batch_size` (default 20) companies per run through
  `sec-submissions` (`https://data.sec.gov/submissions/CIK##########.json`).
  One governed request per company; failures retry while attempts remain, then
  the entry is marked `failed`. At the default cadence this is ~240 requests/hour
  against a 600/hour, 4000/day budget.
- **What a profile holds**: legal name, SIC code/description, state of
  incorporation, fiscal year end, tickers, exchanges, former names, address,
  website when provided, plus `source_id`/`observed_at`/`fetched_at`.
- Seed (non-US) entries are already `profile_status=ready` because the seed
  carries sector/industry in the entry payload; `GET /company/{id}/profile`
  therefore returns the entry with `profile: null` for them. Collected profiles
  are facts and remain readable after an entry is delisted.
- **Why profiles are index-driven**: the index decides which companies exist;
  the profile job only enriches entries marked `pending`, so a newly listed
  company is picked up after the next refresh and never enumerated ad hoc.

### Entry payload example

```json
{
  "name": "Apple Inc.",
  "symbol": "AAPL",
  "venue": "XNAS",
  "instrument_type": "stock",
  "currency": "USD",
  "country": "US",
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "provider_symbol": "AAPL",
  "provider_ids": {"sec_cik": "320193"},
  "aliases": [
    {"alias": "AAPL", "alias_type": "symbol"},
    {"alias": "Apple Inc.", "alias_type": "name"}
  ]
}
```

## API and SDK

| endpoint | purpose |
| --- | --- |
| `GET /api/v1/index` | registry with per-index stats, market breakdown, last refreshes |
| `GET /api/v1/index/company` | company index summary + recent changes + refreshes |
| `GET /api/v1/index/:index_id/entries?market=&status=&profile_status=&q=&limit=&offset=` | page entries (default `company:master` in the agent tool) |
| `GET /api/v1/index/:index_id/changes?limit=` | append-only change log |
| `GET /api/v1/index/:index_id/refreshes?limit=` | refresh audit rows |
| `POST /api/v1/index/:index_id/refresh` | run the mapped refresh job inline (`dry_run` plans only) |
| `GET /api/v1/company/:entity_id/profile` | index entry + collected profile |

SDK: `index_overview()`, `company_index()`, `index_entries()`,
`index_changes()`, `index_refreshes()`, `index_refresh()`,
`company_profile()`.

Agent tool: `index_status`, `index_entries`, `index_changes`, `index_refresh`,
`company_profile`; the Data tab now renders the company index card with active
entries, pending profiles, markets, revision, last refresh and recent changes.

## Adding another index

1. **Define** it in `python/market_monitor/data/indices/<name>.py`:
   `INDEX_ID`, `INDEX_DEFINITION` (id, name, kind, description, markets,
   source_ids, refresh interval), `build_snapshot(ctx)`, `project_entries`,
   `collect(ctx)`. Snapshot entries follow the `entry_key / entity_type /
   entity_id / market / payload / profile_status` contract.
2. **Register** the definition with `warehouse.register_index` (do this in
   `ensure_registered` inside the collector).
3. **Diff** with `warehouse.apply_index_snapshot(..., full_snapshot=…)`; record
   an audit row with `record_index_refresh`.
4. **Project** the changed entries into the reference tables the rest of the
   system reads (or into a new fact table if the index is not a reference
   registry). Keep the projection idempotent.
5. **Schedule** a job: add a `JobDefinition` in `specs.py`, wire the handler in
   `jobs.py`, and map `index_id -> job_id` in
   `MarketDataManager.INDEX_REFRESH_JOBS`. Add the provider to `SOURCE_SPECS`
   so its traffic goes through the same governor.
6. **Expose** it: generic `/api/v1/index/:index_id/*` routes already work; add a
   summary route only if the index needs a custom shape, and extend the Data tab
   with an index card if it deserves first-class UI.

Planned index candidates, reusing the same machinery:

- `fund:etf` — global ETF/fund master (issuer, expense ratio, underlying index);
- `taxonomy:sector` — sector/industry mapping and history;
- `media:source` — approved news publishers, feed URLs, licensing notes;
- `commodity:contract` — contract months and roll schedule (including Chinese
  futures month curves);
- `event:calendar` — earnings, dividends, macro release dates;
- `index:constituents` — index membership with effective dates;
- `ownership:holder` — institutional holder changes (when a licensed source is
  available).

Each is a registry of tracked entities plus a change log, not a fact table; the
facts collected *from* them stay in the appropriate domain tables.

## Failure semantics and verification

- Provider failure → partial refresh, no removals, `index_refresh.status=partial`.
- Parse errors are counted per source and never discard the other source.
- Profile fetch failures keep the entry `pending` until `profile_max_attempts`
  (default 3), then mark it `failed`; rate-limit errors stop the batch instead of
  failing the remaining companies.
- Tests: `python -m unittest tests.test_data_index_foundation
  tests.test_data_index tests.test_company_profile` and the API suite. All are
  offline: snapshots come from fixtures, profiles from canned submissions JSON.
- Live verification: refresh the index from the real bulk files, inspect
  `+added/~updated` counts, then run the profile job and read
  `GET /api/v1/company/INS:XNAS:AAPL/profile`.
