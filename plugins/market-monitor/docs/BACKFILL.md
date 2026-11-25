# Automatic recent-history backfill

The collection loop keeps a rolling **recent window** of daily bars complete in
the background. The default window is the **last 30 days** (`today-30` through
today); future dates cannot be collected, so "after today" means the collector
keeps refreshing the window as new sessions arrive.

## Job

`backfill:recent` runs every **10 minutes** on the shared single-flight
collection loop (sources: Yahoo Finance, Sina Finance, Tencent Finance,
CoinGecko, Frankfurter, Sina Futures).

Each run:

1. Builds the target universe: watched symbols + indices + commodity roots +
   every `ref_instrument` with a provider symbol (US, China, HK, global).
2. Scans stored daily bars via `bar_coverage_since(start)` and
   `latest_bar_map()`.
3. Marks a series as needing fill when it has fewer than `backfill_min_bars`
   (default 12) bars in the window, no bars at all, or its latest bar is older
   than `backfill_stale_days` (default 3).
4. Selects the oldest/missing series first, rotates through a persisted cursor,
   and processes at most `backfill_batch` (default 30) series per run.
5. Fetches only the missing window (plus a 3-month buffer when the series is
   stale), using the cheapest capable channel:
   - China mainland commodity roots → Sina futures daily JSONP;
   - US/HK/A equities, crypto, USD FX → the multi-channel router
     (Sina/Tencent/CoinGecko/Frankfurter);
   - indices and global futures → Yahoo Finance (with an hourly budget floor so
     the live quote job is not starved).
6. Writes `market_bar` rows (source and quality preserved), then a second run
   over a complete window makes no HTTP requests.

Requests are capped at `backfill_daily_limit` (default 300/day) across the job;
budgets, minimum intervals, retries and the circuit breaker still apply per
source. A rate-limit response stops the run cleanly (`partial`,
`stopped=rate_limited`) without advancing the cursor past unprocessed series.

## Visibility and control

- `GET /api/v1/data/backfill` (SDK `data_backfill()`, tool `backfill_status`,
  `/market backfill`) shows:
  - window days/start/end;
  - universe size, series with recent bars, adequate vs needs-fill counts;
  - up to 50 series with their recent bar count and latest bar;
  - the job's last run/status/next due.
- Force a run: `POST /api/v1/data/ingest {"job_id":"backfill:recent"}` or the
  agent tool `data_ingest` with `job_id=backfill:recent`.
- The Data tab's job table lists the `backfill:recent` schedule and last status.

## Annual watchlist backfill

`backfill:annual` is the gradual one-year companion for **watched companies**.
It runs every 30 minutes and selects at most four watched instruments per run
(`annual_backfill_batch`, default 4) whose stored daily coverage over the last
365 calendar days is below `annual_backfill_target_bars` (default 240).

- It fetches the real archive through the same governed channels
  (Sina/Tencent/CoinGecko/Frankfurter for covered instruments, Yahoo `1y` for
  the rest). No synthetic source is consulted.
- Rows outside `[today-365, today]` are discarded and only provider-published
  dates are written. A short history (recent IPO) is stored as-is; missing
  dates are **not** padded or invented.
- An attempted symbol is retried after `annual_backfill_retry_days` (default 7)
  if it is still below target, so a short IPO does not consume every cycle while
  other watched companies wait.
- Progress is in `GET /api/v1/data/backfill` under `annual` (window, target,
  watched count, adequate/needs-fill, job status) and the job table.
- Force one batch: `POST /api/v1/data/ingest {"job_id":"backfill:annual"}`.

## Configuration

Manager defaults (override where engine settings are exposed):

| Setting | Default | Meaning |
| --- | --- | --- |
| `backfill_days` | 30 | recent window length (5–120) |
| `backfill_batch` | 30 | series per run (1–60) |
| `backfill_daily_limit` | 300 | requests per UTC day (20–1000) |
| `backfill_min_bars` | 12 | minimum recent bars before "adequate" |
| `backfill_stale_days` | 3 | latest bar older than this triggers a fill |
| `backfill_range` | `3mo` | Yahoo fetch range when a buffer is needed |
| `backfill_yahoo_reserve` | 40 | hourly Yahoo requests reserved for live data |
| `annual_backfill_days` | 365 | annual window length (180â€“400) |
| `annual_backfill_target_bars` | 240 | real daily bars required for annual adequacy |
| `annual_backfill_batch` | 4 | watched companies per 30-minute run |
| `annual_backfill_daily_limit` | 120 | annual requests per UTC day |
| `annual_backfill_retry_days` | 7 | retry interval for still-short histories |

## Persistence and limits

- Backfilled bars are persisted with the channel's `source_id`; the panel and
  analysis read them from the warehouse like any other bar.
- The window is bounded on purpose: a 15k-instrument universe at 30
  series/10 min is about 4 300 series/day, so full coverage takes several days
  while primary quote/EOD jobs keep running. Increase `backfill_batch` and
  `backfill_daily_limit` to accelerate (within source budgets).
- No future bars are fabricated; the job only fills dates that the provider has
  already published.
- Public endpoints can rate-limit or serve incomplete history; failures are
  recorded per series and retried on later runs.
