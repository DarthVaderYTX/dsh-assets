# Market Monitor SDK and HTTP API (v1)

`market-monitor` separates the financial engine from the DSH plugin. Everything
that collects, stores, monitors and analyses data lives in the Python package
`python/market_monitor`; the plugin only transports JSON and renders it.

Two faces share one implementation:

- **Python SDK** — `MarketMonitor` for scripts, notebooks, and tests.
- **HTTP API** — the same operations over localhost JSON, consumed by the plugin
  host proxy, the agent tool, and any external client.

```
                 ┌──────────────────────────────┐
   Python SDK ──▶│  MarketMonitorService        │◀── HTTP API (localhost, token)
 (in-process)    │  store · providers · analytics│        ▲        ▲
                 │  alerts · portfolio           │        │        │
                 └──────────────────────────────┘   DSH Host   external SDK client
```

## Run the API

```bash
python -m market_monitor serve --port 8765 --data-dir ./data
# {"event":"ready","port":8765,"token":"<token>", ...}
```

The sidecar prints one JSON handshake line on stdout, then serves
`http://127.0.0.1:<port>`. `--port 0` binds an ephemeral port. It writes
`<data-dir>/runtime.json` for discovery and removes it on shutdown. It exits
when its parent closes stdin, receives SIGTERM/SIGINT, or calls
`POST /api/v1/shutdown` (token required).

Data lives in `<data-dir>/market-monitor.db` (SQLite). The DSH plugin passes
`<DSH_HOME>/market-monitor`; the SDK defaults to `$DSH_HOME/market-monitor` when
that variable exists, otherwise `~/.market-monitor`.

## Topology and conventions

- Base path: `/api/v1`; liveness is `GET /health` (no token).
- Every other request needs `x-mm-token: <token>`; a wrong or missing token is
  `401 {"error":{"code":"unauthorized","message":"..."}}`.
- Request and response bodies are UTF-8 JSON. Unknown query parameters are
  ignored. Errors use the shape
  `{"error":{"code":"<snake_case>","message":"<human text>"}}` with a 4xx/5xx
  status; unexpected failures are `500 internal_error`.
- Timestamps are ISO-8601 UTC with `Z` (for example `2026-11-25T02:07:54Z`).
  Daily bars carry `t` as `YYYY-MM-DD`; intraday bars carry full timestamps.
- Money and ratios are JSON numbers; percentages are named `*_pct` and are
  already multiplied by 100 (a 1.2% change is `1.2`).
- Symbols are canonical uppercase strings: `AAPL`, `MSFT`, `BTC-USD`, `^GSPC`,
  `EURUSD=X`. Unknown symbols are rejected with `404 symbol_not_found` on read
  endpoints and `400 invalid_symbol` where the symbol must be watched.
- The service keeps an in-memory quote cache and a SQLite bar cache; a failed
  upstream refresh is reported as `stale: true` on payloads, never as a 500, as
  long as cached data exists.

## Data shapes

```jsonc
// quote
{
  "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "type": "stock",
  "sector": "Technology", "currency": "USD",
  "price": 231.45, "prev_close": 228.9, "change": 2.55, "change_pct": 1.11,
  "open": 229.4, "high": 232.1, "low": 228.6, "volume": 51234000,
  "market_state": "open",            // open | closed | pre | post | simulated
  "as_of": "2026-11-25T02:05:00Z", "source": "yahoo", "stale": false
}
// bar
{ "t": "2026-11-24", "o": 228.1, "h": 230.2, "l": 226.8, "c": 228.9, "v": 48120000 }
// watch item
{ "symbol": "AAPL", "name": "Apple Inc.", "order": 0, "note": "", "added_at": "..." }
// alert rule
{ "id": "a1b2c3", "symbol": "AAPL", "kind": "price_above", "threshold": 250.0,
  "params": {}, "note": "", "enabled": true, "cooldown_s": 3600,
  "created_at": "...", "last_triggered_at": null, "armed": true }
// alert event
{ "id": "e1", "rule_id": "a1b2c3", "symbol": "AAPL", "kind": "price_above",
  "severity": "warning", "message": "AAPL crossed above 250.00 (231.45)",
  "value": 231.45, "threshold": 250.0, "ts": "...", "acknowledged": false }
```

## Endpoints

All paths below are under `/api/v1`.

### Meta, health, catalog

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ok, version, provider, uptime_s, poll_seconds, symbols, last_sync_at, degraded, error?}` |
| POST | `/shutdown` | — | `{ok: true}` then the process exits |
| GET | `/meta` | — | `{version, api_version, provider:{mode,active,live,degraded,last_error}, sidecar:{port,pid,uptime_s,data_dir}, settings, capabilities:[...], catalog_size, watchlist_size}` |
| GET | `/catalog` | `q`,`type`,`limit` | `{items:[{symbol,name,exchange,type,sector,currency,default_watch}]}` |
| GET | `/settings` | — | `{provider, poll_seconds, benchmark, base_currency, auto_refresh}` (historical `history_points` is still echoed for compatibility but has no effect on chart windows) |
| PATCH | `/settings` | `{provider?, poll_seconds?, benchmark?}` | updated settings |

`provider` accepts `auto` (use live Yahoo data when reachable; otherwise report
a degraded provider and serve persisted real data) or `yahoo` (Yahoo Finance
chart API; fails clearly when unreachable). The deterministic `synthetic`
simulator is test-only and is rejected by runtime provider updates.
`poll_seconds` is clamped to 5..3600 and applies to the monitoring loop.

### Watchlist

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/watchlist` | — | `{items:[watch item]}` |
| POST | `/watchlist` | `{symbol, note?}` | `{item, created}` |
| DELETE | `/watchlist/:symbol` | — | `{ok: true, removed: "AAPL"}` |
| POST | `/watchlist/note` | `{symbol, note}` | `{item}` |

### Quotes, history, analysis

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/snapshot` | `symbols?` (csv) | `{quotes:[quote + spark:[float], rsi14, trend], as_of, provider, degraded, stale}` |
| POST | `/sync` | `{symbols?}` | `{quotes:[...], triggered:[alert event], synced_at, provider, degraded}` |
| GET | `/quotes/:symbol` | — | `{quote}` |
| GET | `/history/:symbol` | `range=1D\|5D\|1M\|3M\|6M\|1Y` (compat alias `LIVE` = `1D`), `interval?=5m\|30m\|1d`, `overlays?=1` | `{symbol, range, interval, provider, bars:[bar], overlays?, stale}`; intervals are stored/read separately (`1D`→5m, `5D`→30m, longer→1d) and never mixed |
| GET | `/analysis/:symbol` | — | see below |
| GET | `/screener` | `preset=gainers\|losers\|momentum\|oversold\|overbought\|volatile&limit=10` | `{preset, scope, as_of, rows:[...]}` |

A snapshot entry adds `spark` (last 30 closings), `rsi14`, and `trend`
(`uptrend` | `downtrend` | `sideways`) to the quote.

`GET /history/:symbol?overlays=1` adds an `overlays` object for chart drawing.
Every array is index-aligned with `bars` and padded with `null` where the
lookback is not available:

```jsonc
"overlays": {
  "sma20": [null, null, 228.1],        // one entry per bar
  "sma50": [null, null, 221.4],
  "bollinger": { "upper": [...], "middle": [...], "lower": [...] },
  "rsi14": [null, 61.2]
}
```

```jsonc
// GET /analysis/:symbol
{
  "symbol": "AAPL", "name": "Apple Inc.", "as_of": "...", "provider": "yahoo",
  "quote": { /* quote */ },
  "summary": {
    "signal": "bullish",          // bullish | neutral | bearish
    "score": 0.41,                 // -1..1
    "confidence": "medium",        // low | medium | high
    "trend": "uptrend", "momentum": "positive", "volatility": "moderate",
    "headline": "AAPL is in an uptrend ..."
  },
  "indicators": {
    "sma20": 228.1, "sma50": 221.4, "sma200": 205.7,
    "ema12": 229.0, "ema26": 224.6,
    "rsi14": 58.2,
    "macd": { "line": 4.4, "signal": 3.9, "histogram": 0.5 },
    "bollinger": { "upper": 236.1, "middle": 228.1, "lower": 220.1, "width_pct": 7.0 },
    "atr14": 4.1
  },
  "stats": {
    "period_return_pct": 18.2, "annualized_volatility_pct": 24.6,
    "max_drawdown_pct": -11.3, "sharpe": 1.12, "win_rate_pct": 55.6,
    "avg_daily_range_pct": 1.8, "high_52w": 245.0, "low_52w": 164.1,
    "distance_from_52w_high_pct": -5.5, "avg_volume_20d": 51200000
  },
  "signals": [
    { "id": "trend_alignment", "label": "Price above 20/50-day averages",
      "direction": "bullish", "strength": 0.7, "detail": "..." }
  ],
  "narrative": "…",
  "levels": { "support": [220.4, 214.9], "resistance": [236.1, 244.0] },
  "correlation": { "benchmark": "^GSPC", "value": 0.71, "window_days": 250 }
}
```

Screener rows: `{symbol, name, price, change_pct, rsi14, trend, score, volume}`.
Its `scope` is the monitored universe (watchlist plus portfolio positions).

### Monitoring: alerts

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/alerts` | — | `{rules:[alert rule]}` |
| POST | `/alerts` | `{symbol, kind, threshold, params?, note?, cooldown_s?}` | `{rule}` |
| PATCH | `/alerts/:id` | `{enabled?, threshold?, params?, note?, cooldown_s?}` | `{rule}` |
| DELETE | `/alerts/:id` | — | `{ok:true}` |
| GET | `/alerts/events` | `limit?=50`, `acknowledged?` | `{events:[alert event]}` |
| POST | `/alerts/events/ack` | `{ids:[...]}` or `{all:true}` | `{acknowledged: n}` |

Alert kinds and thresholds:

| kind | threshold meaning | extra params |
| --- | --- | --- |
| `price_above` | price must reach this value | — |
| `price_below` | price must fall to this value | — |
| `change_pct_above` | day change % at or above | — |
| `change_pct_below` | day change % at or below (negative) | — |
| `rsi_above` | RSI(14) at or above | — |
| `rsi_below` | RSI(14) at or below | — |
| `ma_cross` | unused (`0`) | `{fast:20, slow:50, direction:"golden"\|"death"}` |
| `volume_spike` | multiple of 20-day average volume | — |

The sidecar monitoring loop evaluates armed rules after every sync. A rule
carries a cooldown (default 3600 s) so one condition does not spam events.
Events are stored newest-first; `GET /alerts/events?acknowledged=false` powers
the alert inbox.

### Portfolio

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/portfolio` | — | `{positions:[...], totals:{...}, currency}` |
| PUT | `/portfolio/positions` | `{symbol, quantity, avg_cost}` | `{position}` |
| DELETE | `/portfolio/positions/:symbol` | — | `{ok:true}` |

Position: `{symbol, name, quantity, avg_cost, price, market_value, cost_basis,
unrealized_pnl, unrealized_pnl_pct, day_change, day_change_pct, weight_pct}`.
Totals add `market_value, cost_basis, unrealized_pnl, unrealized_pnl_pct,
day_change, day_change_pct`.

### Collection from outside providers

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/collect/bars` | `{symbol, interval?:"1d", bars:[bar], source?}` | `{symbol, stored, range:{from,to}}` |

`/collect/bars` lets an external collector push OHLCV rows into the bar cache;
analysis and sparklines use them when the active provider has no data.

## Python SDK

```python
from market_monitor import MarketMonitor

mm = MarketMonitor(provider="auto", data_dir=None)  # in-process, no HTTP
mm.add_watch("NVDA")
print(mm.snapshot()["quotes"][0]["price"])
print(mm.analysis("NVDA")["summary"]["headline"])

rule = mm.create_alert("NVDA", "price_above", 200.0, note="breakout")
mm.sync()                      # refresh + evaluate alerts
print(mm.list_events(limit=5))
print(mm.screener("momentum", limit=3)["rows"])
```

The SDK class exposes the same operations as the API with snake_case names:
`health, meta, catalog, list_watchlist, add_watch, remove_watch, set_note,
snapshot, quote, sync, history, analysis, screener, list_alerts, create_alert,
update_alert, delete_alert, list_events, ack_events, portfolio, set_position,
delete_position, get_settings, update_settings, collect_bars`.

## Status and error semantics

- `degraded: true` means the configured live provider failed and the service is
  serving only persisted real data or an error; `last_error` explains why. The
  production path never fills in simulated prices.
- `stale: true` means the payload came from a previously persisted row because
  the refresh failed; the row was still written to SQLite before display.
- `400 invalid_argument` covers malformed range/preset/interval, non-numeric
  thresholds, unknown alert kind, and quantities/avg_cost that are not finite
  numbers. `400 invalid_symbol` covers missing or non-string symbols.
- `404 symbol_not_found` is returned by symbol reads when neither the catalog,
  the watchlist, nor the bar cache knows the symbol.
- `404 not_found` covers unknown alert ids, unknown index ids and unknown API paths.
- `409 job_running` is returned by the collection layer when a forced job cannot
  run because another job is active.
- `500 storage_unavailable` means the engine could not persist or read the row a
  response needs; it never returns an unpersisted provider payload.
- `503 source_unavailable` / `503 source_blocked` / `429 rate_limited` come from
  the collection layer's governed source calls.

## Data collection API (v1)

The plugin also exposes a canonical multi-domain warehouse (reference data,
market series, news, and updatable tracking indexes) collected through a
rate-governed pipeline. Its endpoints are additive to v1 and documented in full
in [DATA.md](DATA.md), [INDEX.md](INDEX.md), [CHINA.md](CHINA.md) and
[MULTI_SOURCE.md](MULTI_SOURCE.md):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/data/coverage` | counts and freshness per domain |
| GET | `/data/status` | jobs, source budgets, circuit state, tracked series, storage layout/platform |
| GET | `/data/sources` | remote source registry and usage |
| GET | `/data/runs` | recent ingestion runs |
| GET | `/data/tracked` | tracked series counts |
| GET | `/data/backfill` | rolling recent-window coverage, annual watched-company coverage, series needing bars, and job state |
| POST | `/data/ingest` | wake the collection loop (`job_id`/`dry_run` optional) |
| GET | `/news` | `entity_id?, source_id?, since?, symbol?, limit?` | stored articles with publisher `url`, `publish_time`, `title`, `content`, `collected_at` and enriched entity links |
| GET | `/news/{id}` | one stored article |
| GET | `/ref/exchanges`, `/ref/instruments`, `/ref/indices`, `/ref/commodities` | reference data |
| GET | `/series/{series_id}/bars` | canonical stored bars |
| GET | `/index` | updatable index registry with stats |
| GET | `/index/company` | company master index summary |
| GET | `/index/{index_id}/entries` | paged index entries (filters: market, status, profile_status, q) |
| GET | `/index/{index_id}/changes` | append-only index change log |
| GET | `/index/{index_id}/refreshes` | index refresh audit rows |
| POST | `/index/{index_id}/refresh` | run the mapped refresh job (`dry_run` plans only) |
| GET | `/company/{entity_id}/profile` | company index entry plus collected profile |
| GET | `/china/overview` | China stock/fund/commodity counts and top movers |

`POST /data/ingest` without `job_id` returns immediately with
`accepted: true`; collection jobs run in the sidecar's single-flight background
loop so a slow backfill never blocks an HTTP client. `POST /index/{id}/refresh`
runs the refresh job inline (it is a bounded bulk-file diff) and returns its
counters; the generic index framework is documented in [INDEX.md](INDEX.md).

Persistence: quotes, bars and every other rendered value are written to SQLite
by the engine before the response is returned. A quote/history refresh returns
the row read back from disk; if the write fails and no older row exists the API
answers `500 storage_unavailable` rather than returning an unpersisted payload.

## Compatibility

`api_version` is `v1`. Additive response fields are allowed within v1; clients
must ignore unknown fields. Removing or renaming a field requires `v2`.

## Implementation notes

These details refine the tables above; they are part of v1 behavior.

- Additional error codes: `405 method_not_allowed` for a wrong method on a known
  path, `413 payload_too_large` for a body over 4 MiB.
- `range=1D` (and the backward-compatible `LIVE` alias) returns today's
  intraday five-minute bars (`interval: "5m"`). `5D` returns 30-minute bars for
  the last five weekday sessions (`interval: "30m"`). `1M/3M/6M/1Y` return the
  conventional daily lookback — about 22, 66, 132 and 252 trading days with
  `interval: "1d"`. `interval` is still accepted and validated for
  compatibility but the response granularity follows the range. The newest
  point is aligned to the active provider quote, so the same trading day shows
  one current price in every window; grouped windows are no longer used.
- `POST /sync` returns snapshot-style entries (including `spark`, `rsi14`,
  `trend`) and the alert events triggered by that refresh.
- Screener rows also carry `avg_daily_range_pct`; `volatile` sorts by it.
- `POST /collect/bars` responds with `{symbol, stored, interval, source,
  range:{from,to}}`; `source` defaults to `manual`.
- `DELETE /watchlist/:symbol` and `DELETE /portfolio/positions/:symbol` are
  idempotent and return `200 {ok: true}` even when the row was absent.
- `POST /watchlist/note` returns `404 not_found` when the symbol is not watched.
- Creating an alert or position for an unknown but well-formed symbol returns
  `404 symbol_not_found`.
- Any well-formed symbol may be added to the watchlist or collected; it then
  becomes known for reads. A read of a symbol that is in no catalog, watchlist,
  or bar cache returns `404 symbol_not_found`.
- `health.symbols` is the watchlist size. `runtime.json.provider` records the
  effective (active) provider; an offline `auto` session reports `yahoo` with
  `degraded: true`.
- Provider status: an unreachable `auto`/`yahoo` provider reports
  `degraded: true` with `last_error` set in `/meta`; the service then serves only
  persisted real data. It never switches to generated prices.
- Constructor arguments (`provider`, `poll_seconds`, `benchmark`) override
  persisted settings on start; later `PATCH /settings` persists them for
  subsequent starts. Runtime provider updates accept only `auto`/`yahoo`.
- History served from the fallback bar cache reports `provider: "cache"` or
  `"warehouse"` and `stale: true`.
