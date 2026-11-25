# China market support

The collection layer now has first-class mainland China coverage: A-share
stocks, exchange-traded funds, mainland commodity futures, and additional China
indices. Everything follows the same persistence contract as the rest of the
plugin: collectors write SQLite through the engine, and the panel only reads the
engine API.

## Scope

| Segment | Universe | Source | Persisted to |
| --- | --- | --- | --- |
| A-share stocks | Top-of-book list by market cap (default 2 000 entries, configurable up to the full ~5 565) | Eastmoney public list API, Sina market-centre fallback | `ref_instrument`, aliases, `index_entry` |
| ETFs / exchange-traded funds | Default 800 of ~1 400 ETFs (configurable to full) | Eastmoney public list API, Sina market-centre fallback | `ref_instrument`, aliases, `index_entry` |
| Commodity futures | 38 front/continuous contracts on SHFE, INE, DCE, CZCE, GFEX | Sina Finance futures quotes + daily history | `ref_commodity_root`, aliases, `market_quote_latest`, `market_bar` |
| China indices | SSE Composite, CSI 300/500/1000, SZSE Component, ChiNext, STAR 50, Hang Seng, HSCE | Yahoo Finance (same governed source) | `ref_index`, `market_bar`, quotes |

Markets use standard MICs for equities/HK (`XSHG`, `XSHE`, `XHKG`) and the
exchange MICs for futures (`XSHF`, `XINE`, `XDCE`, `XCZC`, `XGFE`). Entity ids
stay canonical: `INS:XSHG:600519`, `INS:XSHE:000001`, `COM:XSHF:AU`.

## Indexes (updatable, diffed, projected)

Two new generic indexes reuse the framework documented in
[INDEX.md](INDEX.md):

### `china:securities` (kind `china_securities`)

- **Snapshot**: Eastmoney list pages (`pz=100`, sorted by market cap `f20`).
  - A-shares filter covers Shanghai A, Shenzhen A, STAR and ChiNext
    (`m:1+t:2,m:0+t:6,m:1+t:23,m:0+t:80`; ~5 565 total).
  - ETFs use `b:MK0021` (~1 400 total).
  - The first refresh fetches the top entries only; `china_stock_max_entries`
    (default 2 000) and `china_fund_max_entries` (default 800) control the bound.
- **Entry payload** carries Chinese and English names, market cap, turnover,
  last price, industry (`f100`), Yahoo provider symbol (`600519.SS`, `000001.SZ`)
  and Eastmoney ids (`1.600519`, `0.000001`).
- **Projection**: `ref_instrument` (+ aliases) for the current universe;
  missing/delisted entries only change `listing_status`/`valid_to`, rows are
  never deleted.
- **Refresh**: `china:index` daily. Partial pages set `full_snapshot=False`, so a
  failed page can never mass-delist the rest of the universe.

### `china:commodities` (kind `china_commodities`)

- **Snapshot**: the curated offline seed `seed/china_commodities.json` (38 roots,
  Chinese names, categories, units and Sina continuous symbols such as `AU0`).
- **Projection**: `ref_commodity_root` and aliases; the seed exchange rows were
  added for the five futures venues.
- **Refresh**: part of `china:index` (daily); it is offline and always complete.

## Collection jobs

| Job | Cadence | Sources | Writes |
| --- | --- | --- | --- |
| `china:index` | daily | eastmoney | both China indexes, projections, refresh audit |
| `china:quotes` | 3 min | yahoo-finance | batched live quotes for the tracked China stock/fund subset (top 10 stocks + top 10 funds by market cap plus watched China symbols) |
| `china:eod` | daily | yahoo-finance | daily bars for up to 600 tracked China stocks/funds (top 400 stocks + top 200 funds), 120 per run with a persisted cursor |
| `china:commodity:quotes` | 1 min | sina-futures | one batched quote request for the commodity front contracts; provisional today bar |
| `china:commodity:eod` | daily | sina-futures | daily bars + open interest for up to 50 roots per run |

All jobs go through the persisted rate governor. Budgets: Eastmoney 300/hour,
2 000/day at ≥2 s spacing (Sina market-centre list fallback 200/hour, 1 000/day
at ≥2 s spacing); Sina futures 240/hour, 1 200/day at ≥2 s spacing; China
stock/fund quotes share the existing Yahoo budget. The commodity quote job
sends one batched request for all roots per cycle, and quotes carrying a frozen
source date older than a week are skipped (persisted EOD bars then supply the
displayed price).

## API and tools

| Surface | Purpose |
| --- | --- |
| `GET /api/v1/china/overview` | China index counts, top stocks/funds/commodities with latest persisted quotes |
| `GET /api/v1/index/china:securities/entries` | paged A-share/ETF universe (filters: market, status, q) |
| `GET /api/v1/index/china:commodities/entries` | commodity roots |
| `POST /api/v1/index/china:securities/refresh` | rebuild both China indexes (`china:index`) |
| `GET /api/v1/ref/instruments?mic=XSHG` | persisted China stock/fund reference rows |
| `GET /api/v1/ref/commodities` | includes the mainland commodity roots |
| `GET /api/v1/series/COM:XSHF:AU/bars` | persisted China commodity bars |

Agent tool actions: `china_status`, `china_stocks`, `china_funds`,
`china_commodities`. Slash commands: `/market china`, `/market china-stocks`,
`/market china-funds`, `/market china-commodities`. The Data tab has a **China
market** card with stock/fund/futures counts, top movers and a rebuild button.

## Watchlist and analysis

- Add a China stock/ETF by its Yahoo symbol (`600519.SS`, `000001.SZ`,
  `510300.SS`) or a futures root by its Sina symbol (`AU0`, `CU0`). The engine
  resolves it through the persisted warehouse; metadata is copied into the hot
  cache when the watch is added.
- Quotes and charts read persisted rows. When Yahoo cannot serve a Chinese
  futures symbol, the history endpoint falls back to the warehouse/Sina bars
  collected by `china:commodity:eod`, and analysis is computed from those
  persisted bars.
- Examples:
  - `/market watch 600519.SS` → `/market snapshot` → `/market analyze 600519.SS`
  - `/market watch AU0` → `/market snapshot` → `/market history AU0 1M`

## Configuration

```yaml
config:
  dataCollect: true
```

Runtime settings (manager defaults, override in the plugin config/engine
settings where exposed): `china_stock_max_entries=2000`,
`china_fund_max_entries=800`, `china_live_max_series=20`,
`china_live_stocks=10`, `china_live_funds=10`, `china_eod_universe=600`,
`china_eod_stocks=400`, `china_eod_funds=200`,
`china_commodity_batch=40`, `china_commodity_eod_max_roots=50`.

## Limitations and risk notes

- Eastmoney and Sina endpoints are public web APIs, not licensed feeds; they
  can change or rate-limit. Every request is governed, persisted, and retried
  only on transient failures. The governor circuit breaker prevents hammering.
- The default stock/fund universe is market-cap bounded; raise
  `china_stock_max_entries`/`china_fund_max_entries` to approach the full list
  (that costs more Eastmoney pages, still within the daily budget).
- Commodity series track the front/continuous contract (Sina `XX0` symbols), not
  every listed contract month. A future commodity-contract index can add the
  monthly curve with the same framework.
- China stock/fund daily bars are collected by Yahoo for tracked names (top 600
  default), not for every index entry; the index is the tracking registry, while
  the hot/EOD collection remains bounded.
- Mainland mutual funds (open-end NAV) are not covered yet; this module covers
  exchange-traded funds. News beyond the existing global feeds is not added in
  this iteration.
- Public web endpoints are informational only; verify against official exchange
  or licensed data before making decisions.
