# market-monitor Python engine

The Python core of the `market-monitor` DSH plugin: collection, storage,
monitoring, alerts, portfolio math and analysis. Two faces share one
implementation:

- **Python SDK** — `MarketMonitor`, for scripts, notebooks and tests.
- **Localhost HTTP API** — the sidecar consumed by the DSH plugin host, the
  agent tool, and external clients.

The JavaScript host/client of the plugin lives outside this directory; the wire
contract is `../docs/API.md`.

## Requirements

Python 3.12, standard library only (no pip installs, no third-party imports).
A bundled interpreter is used for development, but any CPython 3.10+ should
work. Run with this directory on `PYTHONPATH` (or as the working directory), or
package/install it, so `import market_monitor` resolves.

## SDK quick start

```python
from market_monitor import MarketMonitor

with MarketMonitor(provider="auto", data_dir=None) as mm:
    mm.add_watch("NVDA")
    print(mm.snapshot()["quotes"][0]["price"])
    print(mm.analysis("NVDA")["summary"]["headline"])

    mm.create_alert("NVDA", "price_above", 200.0, note="breakout")
    mm.sync()                                  # refresh + evaluate alerts
    print(mm.list_events(limit=5))

    print(mm.history("NVDA", "1Y", overlays=True)["overlays"]["sma20"][-1])
    print(mm.screener("momentum", limit=3)["rows"])
```

`data_dir=None` resolves to `$DSH_HOME/market-monitor` when `$DSH_HOME` is set,
otherwise `~/.market-monitor`; the SQLite file is
`<data-dir>/market-monitor.db`. Default `provider="auto"` probes Yahoo Finance;
when it is unavailable the service serves persisted real data and reports a
degraded provider instead of generating prices.

SDK methods mirror the API with snake_case names:
`health, meta, catalog, list_watchlist, add_watch, remove_watch, set_note,
snapshot, quote, sync, history, analysis, screener, list_alerts, create_alert,
update_alert, delete_alert, list_events, ack_events, portfolio, set_position,
delete_position, get_settings, update_settings, collect_bars`. `close()` (used
automatically by the context manager) releases the SQLite store; the SDK never
starts a background monitor thread.

`MarketMonitor`/`MarketMonitorService` constructor arguments (`provider`,
`poll_seconds`, `benchmark`) override persisted settings on start; later
`update_settings`/`PATCH /api/v1/settings` changes are persisted.

## CLI

```bash
python -m market_monitor snapshot [--symbols AAPL,MSFT] [--provider ...]
python -m market_monitor analyze AAPL
python -m market_monitor scan --preset momentum --limit 5
python -m market_monitor serve --port 0 --data-dir ./data
```

Read-only commands print JSON to stdout. `serve` runs the sidecar (below).

## Sidecar protocol

```bash
python -m market_monitor serve \
  [--port 0] [--token AUTO] [--data-dir PATH] [--provider auto] \
  [--poll-seconds 15] [--benchmark ^GSPC] [--log-level info]
```

The sidecar must be launched with this `python/` directory on `sys.path`
(`cwd=python/` or `PYTHONPATH`), and its stdin must be an open pipe for
parent-death detection.

1. Binds `127.0.0.1:<port>` (`0` = ephemeral), starts the monitoring loop.
2. Writes `<data-dir>/runtime.json`:
   `{pid, port, token, started_at, version, provider, poll_seconds}`.
3. Prints **exactly one** JSON handshake line to stdout, then flushes:
   `{"event":"ready","port":<int>,"token":"<str>","pid":<int>,"version":"<str>"}`.
   All logging goes to stderr; stdout carries only this line.
4. Serves the JSON API until one of: stdin reaches EOF (parent closed the pipe —
   the parent process must keep the stdin pipe open for the sidecar's lifetime),
   `SIGINT`/`SIGTERM`/`SIGBREAK`, or `POST /api/v1/shutdown` with the token.
5. On exit it stops the monitor thread, closes the store and removes
   `runtime.json`.

`--token AUTO` (the default) generates a random token. Discover the port and
token from either the handshake or `runtime.json`.

HTTP conventions: base path `/api/v1`; `GET /health` needs no token; every other
request requires the `x-mm-token` header (constant-time compared). Errors are
`{"error":{"code":"<snake_case>","message":"..."}}`; responses are JSON with
`Cache-Control: no-store`; request bodies are limited to 4 MiB. `POST
/api/v1/shutdown` requires the token and stops the sidecar gracefully.

## Data providers

| mode | behaviour |
| --- | --- |
| `auto` | probe Yahoo Finance; use live data when reachable. When it is not, the provider is marked degraded and the service serves persisted real warehouse/cache data, or an explicit error. It never generates prices. |
| `yahoo` | Yahoo chart API; an unreachable upstream is degraded, never simulated. |
| `synthetic` | deterministic simulator for the offline test suite only; not exposed by the panel/tool settings API and rejected by runtime provider updates. |

The simulator is a test fixture, not a production data source. Production
quotes/charts are real persisted market data only. When the live provider is
unavailable the fallback is the real `market_bar`/`warehouse` history (fewer
points if that is all that has been collected), with `stale=true` and a
`cache`/`warehouse` provider label.

`GET /history/:symbol` follows the usual financial-site windows: `1D` returns
today's five-minute intraday bars (the `LIVE` value is kept as a
backward-compatible alias), `5D` returns 30-minute bars across the last five
weekday sessions, and `1M/3M/6M/1Y` return about 22/66/132/252 daily bars. The
`interval` query parameter remains validated for compatibility but the response
granularity follows the range. The newest point is aligned with the active
provider quote, so the latest close is identical in every window. Analysis and
the screener always use the latest 252 daily bars.

## History overlays

`GET /api/v1/history/:symbol?overlays=1` (and
`MarketMonitor.history(..., overlays=True)`) adds bar-aligned overlay series for
chart rendering:

```jsonc
"overlays": {
  "sma20": [null, ..., 228.1],          // one entry per bar
  "sma50": [...],
  "bollinger": {"upper": [...], "middle": [...], "lower": [...]},
  "rsi14": [...]
}
```

All five arrays are exactly `len(bars)` long, with `null` padding before the
first defined value. They are computed with the same indicator code and rounding
as `/analysis`, so the last non-null values match the analysis indicators.
Without `overlays=1` the response shape is unchanged.

## Data collection layer

Besides the hot quote/analysis cache, the engine maintains a canonical SQLite
warehouse (`warehouse.db` next to `market-monitor.db`) for reference data,
market series and news. The full design is in `../docs/DATA.md`. The SDK exposes
the same operations as the HTTP API:

```python
from market_monitor import MarketMonitor

mm = MarketMonitor()  # SDK does not start the background loop
mm.data_ingest()                                # request a collection cycle
mm.data_ingest("news:link", dry_run=False)      # run one named job inline
print(mm.data_coverage()["domains"]["reference"])
print(mm.news(symbol="NVDA", limit=5)["articles"])
print(mm.ref_instruments(mic="XTKS", query="chemical")["instruments"])
print(mm.series_bars("INS:XNAS:AAPL", limit=10)["bars"])
```

The sidecar starts the collection loop automatically (unless
`--no-data-collect` is passed). Every outbound request passes the persisted
rate governor: per-host minimum intervals with jitter, hourly/daily budgets,
conditional GET, bounded retries and a circuit breaker. Tests never touch the
network.

### Updatable indexes

`company:master` is the first updatable tracking index: its snapshot is diffed
on every refresh, additions/updates/removals/delistings are written to an
append-only change log, and changed entries are projected into the reference
tables. The same index drives company profile collection from SEC submissions.
The China market adds `china:securities` (A-shares/ETFs) and
`china:commodities` (mainland futures front contracts), refreshed by
`china:index`. SDK methods: `index_overview()`, `company_index()`,
`index_entries()`, `index_changes()`, `index_refreshes()`, `index_refresh()`,
`company_profile()`, `china_overview()`. See `../docs/INDEX.md` for the entry
contract and how to add a new index kind, and `../docs/CHINA.md` for China
coverage and settings.



- `degraded: true` — the configured live provider failed and the simulator or
  cached data is being served; `last_error` explains why (an explicit `yahoo`
  fallback or a runtime failure of a live provider).
- `stale: true` — the payload came from cache because the refresh failed. A
  cached-bar history response reports `provider: "cache"`; a cached quote keeps
  its original `source` and derives its `source` as `"cache"` when it was
  reconstructed from collected bars.
- Reads of symbols unknown to the catalog/watchlist/bar cache return
  `404 symbol_not_found`; malformed symbols/arguments return `400`.
- `/collect/bars` stores externally collected OHLCV rows (`source` defaults to
  `manual`). When the active provider cannot supply a quote/history for a
  symbol, the service falls back to those stored bars and marks the payload
  `source: "cache"` / `stale: true`.

## Tests

From the repository root:

```bash
python -m unittest discover -s plugins/market-monitor/python/tests -v
```

The suite is offline: fixed clocks feed the synthetic provider, inline payload
fixtures feed the collectors, and a local `http.server` stub serves canned Yahoo
Finance JSON. The collection-layer tests cover the warehouse, the persisted
rate governor, the polite HTTP client, the job runner, reference/news/market
parsers, entity linking, and the data HTTP endpoints.
