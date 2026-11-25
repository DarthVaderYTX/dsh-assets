# Market monitor

A DeepSeek Harness plugin that collects, monitors, and analyzes financial market
data from a workspace in the left sidebar. The financial engine is Python; the
plugin is a thin transport and presentation layer over that engine's SDK/API.

- **Sidebar entry**: a chart icon in the left sidebar opens the *Market monitor*
  main panel.
- **Watchlist**: live quotes, day change, and sparklines for followed symbols.
- **Chart**: conventional market windows — `1D` is today's real-time
  five-minute data, `5D` is 30-minute data across five trading sessions, and
  `1M / 3M / 6M / 1Y` use the usual daily lookback (about 22 / 66 / 132 / 252
  trading days). SMA 20, SMA 50, Bollinger band, RSI and volume overlays plus a
  hover readout are available; the latest point is aligned to the watchlist
  quote so every window shows the same current price. History for a newly
  listed company is trimmed at its recorded listing date, so a recent IPO does
  not display pre-listing synthetic points.
- **Analysis**: one-year indicator and statistics analysis, composite
  bullish/neutral/bearish signal, rule-based signals, narrative, support and
  resistance levels, benchmark correlation, and related news linked by entity.
- **Monitoring**: price, day-change, RSI, moving-average-cross, and volume-spike
  alert rules, evaluated by the engine's background loop; triggered events
  appear in the alert inbox and as toasts.
- **Scan**: rank the monitored universe by gainers, losers, momentum, oversold,
  overbought, or volatility.
- **Portfolio**: positions with market value, cost basis, unrealized P&L, and
  weights, plus portfolio totals that include today's change.
- **Data collection**: a governed pipeline writes a canonical warehouse of
  exchange/listing reference data, indices, commodity contracts, market series,
  and deduplicated news; the **Data** tab shows coverage, source budgets,
  schedule, health, and the collected headlines.
- **Agent tool** `market_monitor` and human command `/market` expose the same
  operations to the assistant.

## Architecture

```
DSH Web UI (client.js)
   │  same-origin fetch under /market-monitor/api
   ▼
DSH Host (index.js) ── spawns ──▶ Python sidecar (python/market_monitor)
   │                                   │
   │  proxies JSON + token             ├── cache: market-monitor.db
   ▼                                   │   watchlist · quotes · bars · alerts
agent tool / /market                   │   portfolio · settings
                                       │
                                       ├── warehouse: warehouse.db
                                       │   ref_* · market_bar · news_* · ingest_*
                                       │
                                       └── collectors → polite HTTP → sources
                                           (rate governor: budgets, backoff,
                                            conditional GET, circuit breaker)
```

All collection, indicator math, alert evaluation, and portfolio arithmetic live
in `python/market_monitor`. The Host never computes financial values: it starts
the sidecar, proxies requests, and formats tool output. The browser only draws
the responses and talks exclusively to the Host route, which keeps the sidecar
token out of the page.

The two SQLite files separate **hot cache** (disposable, shaped for the live
panel) from **canonical warehouse** (provenance-rich, append-oriented, typed
entity ids) so later cross-domain analysis can join news, instruments, indices,
and commodities without reconstructing anything. The design, identity scheme,
source matrix, jobs, and anti-blocking policy are in [docs/DATA.md](docs/DATA.md).

The complete hot-cache contract is in [docs/API.md](docs/API.md), and the
sidecar is also a standalone SDK/API for scripts and other tools:

```bash
python -m market_monitor serve --port 8765 --data-dir ./data
# {"event":"ready","port":8765,"token":"…",…}
curl -H "x-mm-token: <token>" http://127.0.0.1:8765/api/v1/analysis/AAPL
curl -H "x-mm-token: <token>" "http://127.0.0.1:8765/api/v1/data/coverage"
```

```python
from market_monitor import MarketMonitor

mm = MarketMonitor(provider="auto")
mm.add_watch("NVDA")
print(mm.snapshot()["quotes"][0]["price"])
print(mm.analysis("NVDA")["summary"]["headline"])
mm.sync()
print(mm.news(symbol="NVDA", limit=3))
print(mm.data_coverage()["domains"]["reference"]["instruments"])
```

## Where it appears

1. A chart icon is added to the left sidebar's panel list. Its label follows the
   active locale (*Market monitor* / *市场监控*).
2. Selecting it opens the main panel with the watchlist, chart, and the
   Analysis / Scan / Alerts / Portfolio / Data tabs.
3. Quotes refresh automatically on the engine's monitoring cadence; the header
   shows provider status, and the footer shows the sidecar port and cadence.
4. The Data tab shows domain coverage (reference, market, news, company index,
   China market), source budgets and health, the company index and China market
   cards (counts, top movers, rebuild buttons), the job schedule, latest
   collected headlines, and a **Collect now** action.
5. The header settings dialog switches the provider, changes the monitoring
   interval, shows engine diagnostics, and restarts the sidecar.

## Quotes and data

- `Auto` (the default) probes Yahoo Finance at startup. It never generates
  market data: when the live provider is unreachable the engine reports a
  degraded state and serves only persisted, real warehouse/cache data (or an
  explicit provider/storage error).
- `Yahoo Finance` fetches public real chart data (no API key). When the request
  fails the engine keeps serving persisted real data where possible.
- The deterministic simulator is retained **for the test suite only** and is
  not exposed by the panel, tool schema, or settings API.
- Bars and quotes are cached in SQLite. `POST /api/v1/collect/bars` lets an
  external collector push daily OHLCV rows into that cache.
- The panel never reads providers directly: it only calls the engine API, which
  reads SQLite. A quote/history refresh is persisted (quote cache or bars) and
  then read back before the response is returned; if persistence fails with no
  older row available the API returns `500 storage_unavailable` instead of an
  unpersisted payload. Collection-layer data shown in the Data tab comes from
  `warehouse.db` through the same API.

The engine stores its two SQLite databases (`market-monitor.db` for the hot
cache, `warehouse.db` for canonical collection), `runtime.json` discovery file,
and logs under `$DSH_HOME/market-monitor`
(`%USERPROFILE%\.dsh\market-monitor` on Windows). Disabling the plugin stops the
sidecar but keeps the data.

## Configuration

The patch row accepts these optional fields:

```yaml
- insert:
    - id: market-monitor
      name: 'market-monitor'
      config:
        pythonPath: 'C:\path\to\python.exe'  # default: DSH runtime, then PATH
        dataDir: 'C:\data\market-monitor'     # default: $DSH_HOME/market-monitor
        provider: auto                        # auto | yahoo (real data only)
        pollSeconds: 15                       # 5–3600
        benchmark: '^GSPC'
        port: 0                               # 0 = ephemeral
        dataCollect: true                     # false = disable the collection loop
```

The provider, monitoring cadence, and benchmark can also be changed at runtime
from the panel's settings dialog or the agent tool; runtime changes persist in
the database and override the patch values for subsequent starts.

## Data collection

The collection layer is documented in [docs/DATA.md](docs/DATA.md). In short:

- **Reference**: US listings from SEC EDGAR + NasdaqTrader bulk files (weekly),
  plus a curated seed of 23 exchanges, 130 global listings, 26 indices, and 19
  commodity roots with monthly contracts.
- **China market**: a dedicated China index tracks A-share stocks and
  exchange-traded funds from the public Eastmoney list endpoints (Sina
  market-centre fallback; market-cap bounded, configurable) and 38 mainland
  commodity front contracts (SHFE, INE, DCE, CZCE, GFEX) from Sina Finance, with
  additional China indices. Quotes, daily bars and commodity history are
  governed, persisted and exposed through the same API/tool/Data-tab surface;
  Chinese symbols can be watched, charted and analyzed like any other
  instrument. See [`docs/CHINA.md`](docs/CHINA.md).
- **Multi-channel market data**: Yahoo Finance is the primary path, with
  governed fallbacks through Sina Finance (US/HK/indices/futures + US EOD),
  Tencent Finance (US/HK/A quotes and kline), CoinGecko (crypto quotes +
  history) and Frankfurter/ECB (USD FX reference rates). The bounded
  `market:backup:quotes` / `market:backup:eod` jobs rotate the least-recently
  updated tracked series and persist every channel response before display.
  See [`docs/MULTI_SOURCE.md`](docs/MULTI_SOURCE.md).
- **Density-separated storage**: real-time and daily bars live in separate
  interval buckets (`5m`, `30m`, `1d`) in both the hot cache and warehouse.
  `1D` reads only `5m`, `5D` reads only `30m`, and `1M/3M/6M/1Y` read only
  `1d`. A range never falls back to another density. The `market:intraday` job
  refreshes real `5m` bars for watched US securities and writes a separately
  stored `30m` bucket; short histories are stored as-is.
- **Automatic recent-history backfill**: a background `backfill:recent` job runs
  every 10 minutes, finds tracked series whose rolling recent window (default
  last 30 days) is missing or sparse, and fills the gaps from the cheapest
  capable channel before rotating to the next series. Coverage is exposed via
  `GET /api/v1/data/backfill`, the `backfill_status` tool and `/market backfill`.
  See [`docs/BACKFILL.md`](docs/BACKFILL.md).
- **Annual watchlist backfill**: `backfill:annual` runs every 30 minutes and
  gradually fills up to **one year of real daily bars** for watched companies
  (default target: 240 bars over 365 calendar days, four companies per run).
  Data comes only from the real Sina/Tencent/Yahoo/CoinGecko archive; short
  histories (for example a recent IPO) are stored as-is and the missing dates are
  left empty. Progress for the annual window is included in
  `GET /api/v1/data/backfill` under `annual`.
- **Cross-platform local storage**: one configurable data directory contains
  `market-monitor.db` (cache) and `warehouse.db` (canonical facts), both SQLite
  WAL databases plus atomic UTF-8 `runtime.json` and a native single-instance
  lock. Paths use `pathlib`/Node `path`, `~` expands on every OS, and Windows
  sharing-violation retries and POSIX/Windows locks are built in. See
  [`docs/STORAGE.md`](docs/STORAGE.md).
- **Updatable company index**: a generic index framework (`index_def`,
  `index_entry`, `index_change`, `index_refresh`) maintains the company master
  index across markets. The daily `company:index` job diffs official listing
  files plus the curated seed, records additions/updates/removals/delistings in
  an append-only change log, and projects changed entries into the reference
  tables. The `company:profile` job then enriches pending US issuers from SEC
  submissions (max 20 companies per run, governed and retried). New indexes
  (ETFs, sector taxonomy, media sources, events, …) reuse the same machinery; see
  [`docs/INDEX.md`](docs/INDEX.md).
- **Market series**: batched Yahoo Finance quotes for tracked instruments,
  indices, and commodity front contracts; daily bars for the tracked universe.
  An opt-in Stooq EOD fallback is available for US equities but is disabled by
  default because the public CSV endpoint rejects repeated requests. The live
  path is batched and cache-first, so the watchlist never produces one upstream
  request per symbol per poll.
- **News**: 10 approved RSS feeds (CNBC, BBC, Guardian, MarketWatch, WSJ, FT,
  Nasdaq, Investing.com, SEC, Federal Reserve) polled every 15 minutes. Each
  article stores `url`, `publish_time`, `title`, `content` and `collected_at`
  (English ISO-8601 UTC); feed-provided content is used first and recent
  summary-only articles are enriched from their public article page under a
  governed `news-content` budget. Articles are always linked to the publisher,
  deduplicated by canonical URL, and linked to instruments/indices/commodities
  by ticker and company name.
- **Governance**: per-source minimum intervals with jitter, hourly/daily budgets
  persisted in SQLite, conditional GET, bounded retries with `Retry-After`,
  a persisted circuit breaker after repeated blocks, one request at a time per
  host, and a single-instance sidecar lock so a plugin reload cannot start a
  second collector against the same data directory. No request bypasses the
  governor, including tests (dry runs and local stubs only).
- **Storage**: append-oriented tables with typed entity ids
  (`INS:XNAS:AAPL`, `IDX:GSPC`, `COM:XCEC:GC`), source id, `observed_at` and
  `ingested_at` on every row, and a `news_entity` link table so later fusion
  does not depend on merged rows.

`POST /api/v1/data/ingest` without a job id wakes the single-flight loop and
returns immediately; named jobs and `dry_run` plans are also available through
the agent tool.

## Agent tool and command

`market_monitor` exposes actions: `snapshot`, `analyze`, `history`, `scan`,
`watchlist`, `watch`, `unwatch`, `alerts`, `alert_create`, `alert_set`,
`alert_delete`, `events`, `ack`, `sync`, `portfolio`, `position_set`,
`position_delete`, `settings`, `settings_update`, `collect_bars`,
`data_status`, `data_ingest`, `news`, `instruments`, `indices`, `commodities`,
`series_bars`, `index_status`, `index_entries`, `index_changes`,
`index_refresh`, `company_profile`, `china_status`, `china_stocks`,
`china_funds`, `china_commodities`, `backfill_status`. `/market` mirrors the
common ones and adds `/market index`, `/market companies [MARKET]`,
`/market index-changes`, `/market index-refresh`, `/market profile ENTITY_ID`,
`/market china`, `/market china-stocks|china-funds|china-commodities`,
`/market backfill`.

```
/market snapshot
/market analyze NVDA
/market scan momentum
/market alert-add NVDA price_above 250
/market events new
/market provider auto|yahoo
/market data
/market news NVDA
/market instruments japan
/market ingest
```

## Alert kinds

| Kind | Threshold |
| --- | --- |
| `price_above` / `price_below` | price level |
| `change_pct_above` / `change_pct_below` | day change percent |
| `rsi_above` / `rsi_below` | RSI(14) level |
| `ma_cross` | ignored; params `{direction: golden\|death, fast, slow}` |
| `volume_spike` | multiple of the 20-day average volume |

Rules carry a cooldown (default one hour) so a condition does not spam events.
Evaluation runs in the sidecar's monitoring loop after every quote refresh, so
alerts keep firing while the panel is closed.

## Development

```bash
# Python engine + collection tests (502 tests)
& "$env:DSH_HOME\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" -m unittest discover -s plugins/market-monitor/python/tests -v

# Host transport, tool formatting, locale, and real-sidecar integration tests
node --test test/

# Syntax checks
node --check index.js
node --check client.js
node --check src/host/sidecar.js
node --check src/host/proxy.js
node --check src/host/tool.js
```

## Limitations

- The production path is real-data-only. Synthetic data exists solely in the
  test suite; the panel shows persisted real quotes/bars, the degraded provider
  state, or an error when no real source is reachable.
- Intraday history uses the provider's available interval (`5m` for `1D`,
  `30m` for `5D`); when no real intraday rows exist, the chart falls back to
  the latest real daily bars rather than fabricating points.
- The sidecar binds to `127.0.0.1` only. External SDK clients must run their own
  `python -m market_monitor serve` instance.
- Analysis prose (narrative, signal labels, alert messages) is generated in
  English by the engine; the panel chrome and status text are localized in
  English and Chinese.
- Collection coverage is deliberately bounded: US listings are authoritative
  bulk data, non-US listings are a curated seed, news content depends on what
  the publisher feed/page exposes (paywalled pages keep the summary), and
  commodity series use the continuous front contract rather than every contract
  month. Licensed feeds can replace any provider without changing the warehouse
  contract.
- China coverage is market-cap bounded by default (2 000 A-shares, 800 ETFs,
  38 mainland commodity roots, 600 tracked names for EOD bars); raise the
  settings to approach the full Eastmoney lists. Chinese flows depend on public
  Eastmoney/Sina web endpoints rather than licensed exchange feeds. Open-end
  mutual fund NAVs and China-specific news feeds are not included yet.
- The company index currently covers US operating companies from SEC/Nasdaq
  bulk files plus the curated non-US seed (fund/ETF vehicles are excluded).
  Profiles are enriched from SEC submissions at 20 companies per 5-minute cycle
  within the 4 000/day budget, so a fresh index needs days to finish its US
  profile backlog; the index card exposes the pending count.
- Public Yahoo/Stooq/RSS endpoints are not contractual and may rate-limit or
  change; the governor degrades to cached data and reports the source state
  instead of retrying aggressively.
- Intraday and daily storage are separate. `1D`/`5D` never borrow daily closes
  when no real intraday bars exist; the chart shows only the corresponding
  density (or an explicit error). The daily-only fallback was removed.
- The recent-history backfill is bounded (30 series per 10-minute run, 300
  requests/day by default) because public sources cannot be fanned out to a
  15k-instrument universe at once; full coverage arrives over several days while
  the primary live/EOD jobs continue. The separate `backfill:annual` job is
  bounded to four watched companies per 30-minute run and targets 240 real daily
  bars, with a seven-day retry for still-short histories. **Future, missing and
  pre-listing bars are never fabricated.**
- The multi-channel fallbacks (Sina, Tencent, CoinGecko, Frankfurter) are
  deliberately bounded and rotating: they fill gaps and refresh the oldest
  tracked series rather than mirroring every Yahoo request. Sina/Tencent are
  public web endpoints, CoinGecko is free-tier, and Frankfurter serves ECB
  reference rates (daily, not tradable intraday FX quotes).
- Verification status: live sidebar/main slot registration, bundle installation,
  the agent tool against the real engine, the engine HTTP API, the collection
  pipeline against live sources (US listings, curated global references, index
  and commodity bars, 10 news feeds with entity linking), the company index
  refresh/diff/projection and index-driven SEC profile collection, plugin
  disable/enable lifecycle, single-sidecar adoption, and the full test suites
  were exercised. The browser-rendered layout and light/dark appearance could
  not be inspected without browser control in this environment.
- Collection is rate-governed and deliberately bounded; it is not a licensed
  market-data feed. Before using values in decisions, verify them against the
  provider and consider a licensed exchange/media subscription for production.
