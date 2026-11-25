# Market data architecture (collection layer v1)

This document defines the **collection/warehouse** layer added for multi-domain
financial data. It is deliberately separate from the existing hot cache used by
the live panel and analysis engine.

```
┌──────────────────────────── DSH plugin ─────────────────────────────┐
│ panel / agent tools / REST clients                                  │
│        │ read (fast)                     │ read (canonical)        │
│        ▼                                 ▼                         │
│  cache layer (market-monitor.db)   warehouse layer (warehouse.db)  │
│  watchlist · quotes · bars ·       ref_* · market_bar · news_* ·   │
│  alerts · portfolio · settings     quote_latest · ingest_*         │
│        ▲                                 ▲                         │
│        └────────── service.py ───────────┘  (live path may hydrate  │
│                      │                       cache from warehouse)  │
│                      ▼                                              │
│            data collector (data/sources/*): reference, quotes,     │
│            EOD bars, indices, commodities, news RSS                │
│                      │                                              │
│                      ▼                                              │
│            polite HTTP client → rate governor → external sources   │
└─────────────────────────────────────────────────────────────────────┘
```

**Boundary rules**

1. The cache layer is disposable: provider responses may be evicted, rebuilt,
   and shaped for analysis. It answers "what does the panel show now".
2. The warehouse is canonical and append-oriented: every row carries
   `source_id`, `observed_at` and `ingested_at`, and daily bars are never
   rewritten except for their finality flag. It answers "what do we know, from
   where, and when".
3. Collectors never analyse; analysers never fetch. Entity linking is the only
   cross-domain step in the collection layer, and it is stored as a link table
   rather than merged rows, so later fusion can re-run with new rules.
4. No network request leaves the process without passing the rate governor.

## Domains and entity identity

| Domain | Canonical entity id | Example | Source of truth |
| --- | --- | --- | --- |
| Exchange | `{mic}` (ISO 10383) | `XNAS`, `XSHG`, `XTKS` | exchange list / curated seed |
| Instrument (listed company, ETF, ADR) | `INS:{mic}:{ticker}` | `INS:XNAS:AAPL` | SEC + NasdaqTrader bulk (US), curated seed (global) |
| Instrument (crypto / spot FX) | `INS:{pseudo-mic}:{provider symbol}` | `INS:XCRY:BTC-USD`, `INS:XFXS:EURUSD=X` | curated seed; `XCRY`/`XFXS` are documented internal normalisation venues, not trading venues |
| Index | `IDX:{code}` | `IDX:GSPC`, `IDX:N225` | curated seed + provider quote |
| Commodity root | `COM:{venue}:{root}` | `COM:XCEC:GC` | curated seed |
| Commodity contract | `COM:{venue}:{root}:{YYYYMM}` | `COM:XCEC:GC:202612` | curated seed + provider quote |
| News article | `sha256(canonical_url \| guid)[:20]` | `7f3a…` | approved feed registry (RSS) |
| News source | `{publisher}-{vertical}` | `reuters-business` | feed registry |

All series data uses the string above as `series_id`. Typed prefixes (`INS:`,
`IDX:`, `COM:`) prevent collisions across domains and make fusion joins
explicit. Aliases (ticker, provider symbol, company name, ISIN) live in
`ref_alias`, never in the identity itself.

Time rules: every stored timestamp is ISO-8601 UTC with `Z`; daily bars use
`YYYY-MM-DD`; `observed_at` is when the source issued the value, `ingested_at`
is when we stored it. Today's daily bar is stored with `quality='provisional'`
and promoted to `final` only after a later refresh without intraday change.

Commodity series convention: the collected time series is the provider's
continuous front contract stored under the **root** id (`COM:XCEC:GC`), because
that is what public quote endpoints expose. `ref_commodity_contract` rows are
metadata for the monthly contracts (identity, venue, month) and reserve a
per-contract `provider_symbol` for feeds that later provide real contract
prices. Fusion queries joining news to commodities should therefore use the
root id unless the source names a specific month.

Reference tables hold the current snapshot: `valid_from`/`valid_to` are reserved
for point-in-time history, and a re-run updates the current row instead of
appending a new version. This is a deliberate v1 simplification; adding
bitemporal rows later does not change the identity or join keys.

## Warehouse schema (warehouse.db, schema_version 2)

### Reference data (slow, versioned by `valid_from/valid_to`)

- `ref_exchange(mic PK, code, name, country, city, timezone, currency, calendar,
  website, source_id, observed_at, updated_at)`
- `ref_instrument(instrument_id PK, symbol, mic, name, short_name, type,
  currency, country, sector, industry, listing_status, isin, provider_symbol,
  source_id, valid_from, valid_to, first_seen_at, updated_at)`
- `ref_index(index_id PK, code, name, region, currency, type, venue,
  provider_symbol, constituents_count, source_id, valid_from, valid_to,
  updated_at)`
- `ref_index_constituent(row_id PK, index_id, instrument_id, constituent_symbol,
  name, weight_pct, valid_from, valid_to, source_id, UNIQUE(index_id,
  instrument_id, valid_from))`
- `ref_commodity_root(root_id PK, venue, root, name, category, unit, currency,
  provider_symbol, source_id, updated_at)`
- `ref_commodity_contract(contract_id PK, root_id, venue, root, contract_month,
  first_trade_date, last_trade_date, provider_symbol, source_id, updated_at)`
- `ref_alias(alias, entity_type, entity_id, alias_type, language, source_id,
  PRIMARY KEY(alias, entity_type, entity_id, alias_type))`
  where `entity_type ∈ {instrument,index,commodity_root,commodity_contract,
  exchange}` and `alias_type ∈ {symbol,name,isin,provider_symbol}`.

### Market data (append-only)

- `market_bar(series_id, interval, ts, open, high, low, close, volume,
  source_id, observed_at, ingested_at, quality,
  PRIMARY KEY(series_id, interval, ts))`
- `market_quote_latest(series_id PK, ts, price, prev_close, change_pct,
  change_type, volume, currency, source_id, observed_at, updated_at)`
- `market_quote_observation(row_id PK, series_id, ts, price, change_pct,
  volume, source_id, UNIQUE(series_id, ts))` — retention 14 days.

### News (append-only, deduplicated)

- `news_source(source_id PK, name, kind, language, country, homepage, feed_url,
  license_note, enabled, updated_at)`
- `news_article(article_id PK, source_id, url, canonical_url, title, summary,
  body, language, author, published_at, updated_at, fetched_at, topics,
  content_hash, duplicate_of, UNIQUE(canonical_url))`
- `news_entity(article_id, entity_type, entity_id, confidence, method,
  PRIMARY KEY(article_id, entity_type, entity_id))`

The collector stores the requested fields in the `news_article` columns:
`url` → `url`, `publish_time` → `published_at`, `title` → `title`,
`content` → `body` and `collected_at` → `fetched_at`. All timestamps are
English ISO-8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ`). The API exposes both the
normalized column names and the aliases `publish_time`, `content`, and
`collected_at`.

### Provenance and ingestion control

- `raw_document(doc_id PK, source_id, url, status, content_type, etag,
  last_modified, sha256, body_text, bytes, fetched_at)` — capped retention
  (7 days / 64 MB), so re-parsing never requires a second fetch.
- `ingest_source(source_id PK, domain, kind, provider, enabled, min_interval_s,
  max_per_hour, max_per_day, used_hour, hour_window, used_day, budget_date,
  next_allowed_at, consecutive_blocks, circuit_open_until, etag, last_modified,
  last_run_at, last_success_at, last_error)` — persisted governor state.
- `ingest_job(job_id PK, description, domain, interval_s, enabled, last_run_at,
  last_status, next_due_at, last_summary)`
- `ingest_run(run_id PK, job_id, source_id, started_at, finished_at, status,
  requests, stored, updated, duplicates, skipped, error, details)`
- `index_def(index_id PK, name, kind, description, markets, source_ids,
  refresh_interval_s, enabled, revision, entries, active, missing, delisted,
  pending_profiles, last_refresh_at, next_refresh_at, last_status, last_summary,
  created_at, updated_at)` — generic registry of updatable tracking indexes.
- `index_entry(index_id, entry_key, entity_type, entity_id, market, status,
  revision, misses, first_seen_at, last_seen_at, valid_from, valid_to,
  source_id, payload, profile_status, profile_synced_at, profile_attempts,
  profile_error, updated_at, PRIMARY KEY(index_id, entry_key))`
- `index_change(change_id PK, index_id, entry_key, entity_id, market,
  change_type, changed_fields, observed_at, revision, source_id)` — append-only
  added/updated/removed/delisted/restored log.
- `index_refresh(refresh_id PK, index_id, started_at, finished_at, status,
  entries_seen, added, updated, removed, restored, delisted, profiles_queued,
  requests, error, details)`.
- `company_profile(entity_id PK, market, legal_name, sic, sic_description,
  state_of_incorporation, fiscal_year_end, website, address, former_names,
  tickers, exchanges, source_id, observed_at, fetched_at)`.

## Persistence contract

Every value the panel renders comes from a SQLite row that was written before
the API response returned; providers are only contacted by the engine, never by
the client.

The database files are portable SQLite/WAL files; the engine runs unchanged on
Windows, macOS and Linux. See [STORAGE.md](STORAGE.md) for the directory layout,
atomic discovery file, native locking, path resolution and backup guidance.

- **Hot cache** (`market-monitor.db`): `instruments`, `watchlist`, `bars`,
  `quote_cache` (schema v2), alert rules/events, positions, settings, meta. A
  quote refresh writes `quote_cache` and the response is the row read back from
  disk; a history refresh writes `bars` and the response is likewise read back.
  If the write fails, an older row is served with `stale: true`; if none exists
  the API fails with `500 storage_unavailable` instead of returning an
  ephemeral provider payload.
- **Canonical warehouse** (`warehouse.db`): reference rows, market series,
  news, indexes, company profiles and provenance/audit rows. The Data tab,
  index card, news feed and reference search read these tables through the API.
- **Provider refresh** happens only inside the service/collection engine
  (monitor loop, `sync`, a read that finds its cached row expired, or a
  collector job). The refreshed value is persisted first; the client receives
  the persisted representation. Quotes are provider-authoritative so the
  watchlist and every chart window share the same latest price; persisted
  quotes from a different provider are not replayed after a provider switch.
  The conventional windows (`1D`, `5D`, `1M`, `3M`, `6M`, `1Y`) all align
  their newest point to that same quote, so the same trading day has one latest
  value across the chart.
- **External links** in the news feed open the publisher's page in a new tab;
  the collection engine may fetch that page once to extract readable content
  (feed-provided content is used first), but the panel itself never fetches
  article pages.
- **Listing boundary**: chart and analysis history for a symbol is trimmed at
  the reference `valid_from` (falling back to `first_seen_at`) recorded in
  `ref_instrument`. A recent IPO therefore cannot show synthetic or provider
  bars from before its listing date; short history yields fewer chart points
  rather than invented ones.
- **Symbol search** (`/api/v1/catalog`) reads persisted `ref_instrument` rows
  once collection has run; the shipped static catalog is only an offline
  fallback for a fresh engine.
- Every fact carries `source` and a timestamp so the persisted origin is visible
  in API responses.

### Updatable indexes

Indexes are the registries that decide which entities a collector should track.
`company:master` is the first one: its snapshot (SEC + NasdaqTrader bulk files
plus the curated global seed) is diffed on every refresh, entries move
`active → missing → delisted` (and back via `restored`), each change is logged,
and the same index drives the `company:profile` job for US issuers. The generic
framework, entry contract and recipe for adding future indexes are documented in
[`INDEX.md`](INDEX.md).

## Source matrix (probed on this machine, 2026-11-25)

| Source id | Domain | Endpoint | Cadence | Budget | Notes |
| --- | --- | --- | --- | --- | --- |
| `sec-edgar` | reference (US listings) | `sec.gov/files/company_tickers.json` | weekly | 30/day | official bulk; descriptive UA required |
| `nasdaqtrader` | reference (US listings) | `nasdaqtrader.com/dynamic/SymDir/*.txt` | weekly | 30/day | official bulk, 2 files |
| `sec-submissions` | reference (company profiles) | `data.sec.gov/submissions/CIK##########.json` | 5 min, 20 companies/run | 4 000/day, 600/h, ≥1 s apart | one company per governed request; index-driven |
| `eastmoney` | reference (China stocks/ETFs) | `push2.eastmoney.com/api/qt/clist/get` | daily list pages | 2 000/day, 300/h, ≥2 s apart | public China list API; paginated at 100 rows/page, market-cap sorted |
| `sina-cn-list` | reference (China stocks/ETFs fallback) | `vip.stock.finance.sina.com.cn` market-centre API | on Eastmoney failure | 1 000/day, 200/h, ≥2 s apart | market-centre list fallback; mktcap in 10k CNY normalized |
| `sina-futures` | market (mainland commodity futures) | `hq.sinajs.cn`, `stock2.finance.sina.com.cn` | quotes 60 s; history daily | 1 200/day, 240/h, ≥2 s apart | batched quote request; GBK/JSONP history |
| `sina-finance` | market (US/HK/index/futures fallback) | `hq.sinajs.cn`, `stock.finance.sina.com.cn` | fallback quotes 5 min; US EOD daily | 1 200/day, 240/h, ≥2 s apart | GBK batch quotes; US daily JSONP; referer required |
| `tencent-finance` | market (US/HK/A fallback) | `qt.gtimg.cn`, `web.ifzq.gtimg.cn` | fallback quotes 5 min; EOD daily | 800/day, 240/h, ≥2 s apart | GBK quotes; JSON kline |
| `coingecko` | market (crypto) | `api.coingecko.com/api/v3` | fallback quotes 5 min; EOD daily | 500/day, 100/h, ≥10 s apart | free public API |
| `frankfurter` | market (FX reference) | `api.frankfurter.app` | fallback quotes 5 min; EOD daily | 300/day, 100/h, ≥5 s apart | ECB reference rates |
| `yahoo-finance` | market quotes/bars, indices, futures | `query1.finance.yahoo.com/v8/finance/...` | quotes 60 s in batches; EOD daily | 2 500/day, 240/h, ≥2 s apart | batch `spark` endpoint preferred; `chart` per series for history |
| `stooq` | EOD bars (fallback) | `stooq.com/q/d/l/?s=…&i=d` | daily | 1 500/day, ≥3 s apart | CSV, worldwide symbols |
| `cnbc-rss` | news | `cnbc.com/id/100003114/device/rss/rss.html` | 15 min | 96/day | conditional GET |
| `bbc-business-rss` | news | `feeds.bbci.co.uk/news/business/rss.xml` | 15 min | 96/day | |
| `guardian-business-rss` | news | `theguardian.com/uk/business/rss` | 15 min | 96/day | |
| `marketwatch-rss` | news | `feeds.content.dowjones.io/public/rss/mw_topstories` | 15 min | 96/day | |
| `wsj-markets-rss` | news | `feeds.a.dj.com/rss/RSSMarketsMain.xml` | 15 min | 96/day | |
| `ft-rss` | news | `ft.com/rss/home` | 15 min | 96/day | public RSS |
| `nasdaq-rss` | news | `nasdaq.com/feed/rssoutbound?category=Markets` | 15 min | 96/day | |
| `investing-rss` | news | `investing.com/rss/news.rss` | 15 min | 96/day | |
| `sec-press-rss` | news (official) | `sec.gov/news/pressreleases.rss` | 30 min | 48/day | regulator releases |
| `fed-press-rss` | news (official) | `federalreserve.gov/feeds/press_all.xml` | 30 min | 48/day | |
| `news-content` | news article pages | linked publisher article URLs | after feed poll, bounded 12/run | 1 200/day, 120/h, ≥2 s apart | extracts readable content for recent summary-only articles |

Unavailable from this host (recorded, not used): `ecb.europa.eu` (TLS chain),
`reuters.com` feed (TLS/blocked), `cme group` quote API (404/blocked),
`finance.yahoo.com/news/rssindex` (404). Global exchange listing files beyond
the US are not fetched in v1; the curated seed covers 12 exchanges and their
largest listings, and licensed exchange feeds can replace the seed later.

## Rate governance and anti-blocking policy

- One token bucket per host, `min_interval` from the matrix plus 15–35 % jitter;
  global concurrency 1 per host; no parallel fan-out across a host.
- Soft budgets per source: hour window and UTC-day window persisted in
  `ingest_source`; exhausted budget ⇒ skip with status `blocked`, never wait.
- Conditional GET (`If-None-Match` / `If-Modified-Since`) from
  `raw_document`; 304 counts as one request but stores nothing.
- Retries: only on `429`, `5xx`, or network errors; `Retry-After` honoured;
  backoff 5 s → 15 s → 60 s → 300 s with jitter, max 3 retries.
- `403/429` storms: 3 consecutive blocks open the source circuit for 30 min;
  the circuit is persisted and visible in the panel's Data tab.
- Bulk endpoints are always preferred over per-item endpoints; the whole US
  listing refresh costs 2 requests, live quotes cost one batched request per
  cycle regardless of watchlist size.
- Every request carries a descriptive User-Agent with a contact placeholder.
  Users with a registered contact can set `MARKET_MONITOR_CONTACT`.
- `dry_run` plans a job without touching the network; tests always run dry or
  against local stubs.
- News feeds are polled no faster than every 15 minutes even if the panel is
  open; manual refresh is rate-limited by the same governor, so the UI may
  report "next allowed in N s" instead of issuing a request.
- Only one collection job runs at a time. A forced job that arrives while the
  loop is working answers `409 job_running` instead of opening a second request
  stream; `POST /data/ingest` without a job id only wakes the loop.
- EOD backfill trusts a "bar already exists today" skip only after the series
  has at least `eod_min_history_bars` (default 60) stored bars; a series created
  by an interrupted run is backfilled instead of being treated as complete.
- EOD/index/commodity backfills reserve `eod_hourly_reserve` (default 40) of the
  hourly Yahoo budget for live quotes; when the remaining hourly budget reaches
  that floor the backfill stops for the cycle and reports `budget_reserve_hit`
  instead of starving the panel.
- The hot quote path never falls back to one provider request per watchlist
  symbol while the warehouse has a (possibly older) quote: the service serves
  the last canonical quote flagged `stale`, so a long backfill or a rate-limited
  window cannot multiply upstream traffic.
- News entity matching uses brand variants (`NVIDIA Corporation` → `NVIDIA`)
  and a financial-acronym stoplist (`IPO`, `ESG`, `BBC`, …) to reduce both
  misses and ticker false positives.

## Collection jobs (defaults, all configurable)

| Job | Interval | Sources | Writes |
| --- | --- | --- | --- |
| `reference:seed` | 30 days / version bump | bundled seed | exchanges, global instruments, indices, commodity roots/contracts |
| `reference:us` | disabled (legacy) | sec-edgar, nasdaqtrader | retained for reference/tests only; `company:index` supersedes it |
| `company:index` | daily | sec-edgar, nasdaqtrader, bundled seed | `index_def`, `index_entry`, `index_change`, `index_refresh`, projected `ref_instrument`/`ref_alias`/`ref_exchange` |
| `company:profile` | 5 min, 20 companies/run | sec-submissions | `company_profile`, `index_entry.profile_status`, profile attempts |
| `china:index` | daily | eastmoney, bundled China commodity seed | `china:securities`/`china:commodities` index tables and projections |
| `china:quotes` | 3 min | yahoo-finance | `market_quote_latest` for top tracked China stocks/funds (batched) |
| `china:eod` | daily, 120/run cursor | yahoo-finance | `market_bar` for tracked China stocks/funds |
| `china:commodity:quotes` | 60 s | sina-futures | `market_quote_latest` + provisional today bar for 38 mainland commodity roots |
| `china:commodity:eod` | daily, 50/run | sina-futures | daily bars + open interest for mainland commodity roots |
| `market:backup:quotes` | 5 min, 20 symbols/run | sina-finance, tencent-finance, coingecko, frankfurter | stale/rotating `market_quote_latest` fallback quotes |
| `market:backup:eod` | daily, 20 series/run | sina-finance, tencent-finance, coingecko, frankfurter | missing/stale `market_bar` fallback bars |
| `backfill:recent` | 10 min, 30 series/run, 300 req/day | yahoo-finance, sina-finance, tencent-finance, coingecko, frankfurter, sina-futures | automatically fills missing daily bars in the rolling recent window (default 30 days) |
| `backfill:annual` | 30 min, 4 watched companies/run | yahoo-finance, sina-finance, tencent-finance, coingecko, frankfurter | gradually fills the last 365 days of real daily bars for watched companies (target 240 bars; short histories stored as-is, gaps never fabricated) |
| `market:intraday` | 30 min, watched US securities | sina-finance | real `5m` bars plus a separately stored `30m` bucket for `1D`/`5D`; daily rows are never mixed into these buckets |

Yahoo remains the primary quote/EOD path. The backup jobs are deliberately
bounded and rotate the least-recently-updated tracked series, so they add
redundancy without multiplying every source's traffic; see
[MULTI_SOURCE.md](MULTI_SOURCE.md).
| `market:live` | 60 s (only tracked live series, batched ≤20/request) | yahoo-finance | `market_quote_latest`, observations, cache handoff |
| `news:rss` | 15 min | all RSS sources + `news-content` | `news_source`, `news_article` (URL/title/content/publish/collection timestamps), `news_entity` |
| `news:content` | 10 min, 12/run | `news-content` | fills readable `content` for recent summary-only articles |
| `index:daily` | daily | yahoo-finance | index bars |
| `commodity:daily` | daily | yahoo-finance | continuous front-contract bars (root series) |
| `market:eod` | daily | yahoo-finance (+ Stooq only if `stooq_fallback` is enabled; it is off by default because the public CSV endpoint rejected repeated requests from this host) | instrument bars (`1d`, final/provisional) |
| `news:link` | after each news run | local | `news_entity` re-link |
| `maintenance:prune` | daily | local | raw-document and observation retention |

Tracked series for v1 = watchlist symbols resolved through the warehouse (or the
offline catalog before the first reference run) + curated indices + curated
commodity roots for live quotes, plus curated global listings for EOD history.
Live collection is capped at 40 series and each EOD run at 120 series with a
persisted cursor, so a first backfill is spread over runs instead of a burst.
The service's live-quote path reads the warehouse (`market_quote_latest`) first;
per-symbol provider fetches remain only as a warm-up/fallback path, which keeps
Yahoo traffic batched instead of one request per watchlist symbol per poll.

## Fusion contract (for later joint analysis)

The warehouse exposes joins without pre-merging:

- `news_entity` → any `INS:/IDX:/COM:` entity with `confidence` and `method`;
- `market_bar`/`market_quote_latest` keyed by the same entity ids;
- `ref_*` aliases map provider symbols (for example `AAPL`) and human names to
  canonical ids;
- `index_entry`/`company_profile` attach institutional identity to the same
  entity ids (`index_entry.entity_id` = `ref_instrument.instrument_id`), with
  `index_change` providing an as-of view of the tracked universe;
- every fact carries source and time, so as-of joins and provenance-weighted
  features are possible without re-collecting.

Example queries the later analysis layer can run:

```sql
-- news volume and market reaction for one instrument
SELECT date(a.published_at) AS day, count(*) AS articles
FROM news_article a JOIN news_entity e ON e.article_id = a.article_id
WHERE e.entity_id = 'INS:XNAS:AAPL' GROUP BY day;

-- commodity prices joined to related macro news
SELECT b.ts, b.close FROM market_bar b
WHERE b.series_id = 'COM:XCEC:GC:202612' AND b.interval = '1d';

-- company identity and profile for indexed companies by market
SELECT i.entity_id, i.market, i.status, p.legal_name, p.sic_description
FROM index_entry i LEFT JOIN company_profile p ON p.entity_id = i.entity_id
WHERE i.index_id = 'company:master' AND i.status = 'active';
```

## API and SDK surface (v1 additions)

- `GET /api/v1/data/coverage` — counts and freshness per domain.
- `GET /api/v1/data/status` — registry, budgets, circuit state, job schedule,
  tracked series counts, last cycle.
- `GET /api/v1/data/sources` — source registry with usage budgets.
- `GET /api/v1/data/runs` — recent ingestion runs.
- `GET /api/v1/data/tracked` — tracked series counts per pass.
- `GET /api/v1/data/backfill` — rolling recent-window coverage, series needing
  bars, and the automatic backfill job state (see [BACKFILL.md](BACKFILL.md)).
- `GET /api/v1/data/threads` — diagnostic Python thread stacks (token required),
  used to inspect a long-running or stuck collection job.
- `POST /api/v1/data/ingest` `{job_id?, dry_run?}` — with no `job_id` it only
  wakes the single-flight collection loop and returns `accepted: true`, so a
  slow backfill never blocks an HTTP request; with `job_id` it runs that job
  inline and returns its counters; `dry_run` returns the plan only.
- `GET /api/v1/news?entity_id=|symbol=&source_id=&since=&limit=` — articles with
  enriched entity links (`label`, `symbol`, `venue` when resolvable).
- `GET /api/v1/news/{id}`.
- `GET /api/v1/ref/exchanges`, `/ref/instruments`, `/ref/indices`,
  `/ref/commodities`, `/ref/commodities/contracts` (contracts are included in
  the `/ref/commodities` payload).
- `GET /api/v1/series/{series_id}/bars?interval=1d&limit=250`.
- `GET /api/v1/index` — registry of updatable indexes with entry stats, market
  breakdown and last refresh runs.
- `GET /api/v1/index/company` — company master index summary (stats, recent
  changes, refresh audit).
- `GET /api/v1/index/{index_id}/entries?market=&status=&profile_status=&q=&limit=&offset=`
  — paged index entries; `GET .../changes` and `GET .../refreshes` expose the
  change log and audit rows.
- `POST /api/v1/index/{index_id}/refresh` `{dry_run?}` — run the mapped refresh
  job inline (company:master → company:index); `dry_run` plans without sources.
- `GET /api/v1/company/{entity_id}/profile` — index entry plus the collected
  company profile.
- `GET /api/v1/china/overview` — China stock/fund/commodity counts and top
  movers with latest persisted quotes (see [CHINA.md](CHINA.md)).
- SDK methods on `MarketMonitor` mirror these (`index_overview`,
  `company_index`, `index_entries`, `index_changes`, `index_refreshes`,
  `index_refresh`, `company_profile`, `china_overview`).

Errors keep the existing envelope: `400 invalid_argument`, `404 not_found`,
`409 job_running`, `429 rate_limited` (`retry_after_s` in the message),
`503 source_unavailable` / `source_blocked`.

## What v1 deliberately does not collect

- Paywalled article bodies: feed content is stored when present and recent
  summary-only articles are enriched from the public page, but sources that
  return only a summary/paywall keep that excerpt. Full licensed news feeds can
  replace the RSS registry without changing the schema.
- Full non-US listing directories: the curated seed covers 14 venues and their
  largest listings; licensed exchange feeds can replace it. The company index
  therefore covers US operating companies from official bulk files and the
  curated non-US companies; fund/ETF/ETN vehicles are excluded (a future fund
  index will cover them), and non-US companies do not get SEC-style profiles.
- Fundamentals, corporate actions, options chains, fund holdings: the schema has
  room for new `ref_*`/event tables without changing the identity model.
- Per-contract commodity prices beyond the continuous front contract (provider
  symbol reserved for a later feed).
- Real-time intraday storage beyond the latest quote and observations; the hot
  intraday path stays in the disposable cache.
