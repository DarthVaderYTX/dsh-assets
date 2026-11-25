# Multi-channel market data

Yahoo Finance is no longer the only market-data path. Four additional public
channels provide quotes and/or end-of-day bars, all through the same persisted
rate governor, warehouse tables and plugin API. The collector never trusts a
channel blindly: every refresh writes SQLite first, and displayed values are read
back from the warehouse/cache.

## Channels

| Channel id | Endpoints | Assets | Role | Budget |
| --- | --- | --- | --- | --- |
| `sina-finance` | `hq.sinajs.cn` batch quotes; `stock.finance.sina.com.cn` US daily history | US stocks/ETFs, HK stocks, major global indices (`int_dji/int_nasdaq/int_sp500/int_hangseng/int_nikkei/int_ftse`), global futures (`hf_GC/hf_SI/hf_HG/hf_CL/hf_NG`), US EOD bars | primary fallback for US/HK/index/futures quotes; US EOD gap fill | 1 200/day, 240/h, ≥2 s |
| `tencent-finance` | `qt.gtimg.cn` quotes; `web.ifzq.gtimg.cn` kline | US, HK, A-share quotes; US/HK/A-share EOD bars | second fallback when Sina cannot serve a symbol, and EOD for HK/A when Yahoo fails | 800/day, 240/h, ≥2 s |
| `coingecko` | `/simple/price`, `/coins/{id}/market_chart` | crypto (`BTC-USD`, `ETH-USD`, …) | quotes + 365-day daily history | 500/day, 100/h, ≥10 s |
| `frankfurter` | `api.frankfurter.app/latest`, `/{start}..{end}` | USD-based FX pairs (ECB reference rates) | quotes + 365-day daily history | 300/day, 100/h, ≥5 s |

Stooq was probed again and remains unreachable from this host
(`SSL: UNEXPECTED_EOF_WHILE_READING`); it stays disabled.

## Routing

`market:backup:quotes` (every 5 minutes) and `market:backup:eod` (daily) select
the tracked series whose persisted quote/bar is missing or oldest, capped by
`channel_quote_limit` (default 20) / `channel_eod_limit` (default 20), then
route by asset class:

- crypto → CoinGecko;
- USD-based FX → Frankfurter;
- US stocks/ETFs, HK stocks, supported indices and global futures → Sina;
- series Sina does not serve, or failed for, fall through to Tencent (US/HK/A).

The primary Yahoo jobs (`market:live`, `market:eod`, `china:*`) remain in place.
The fallback jobs are deliberately bounded and rotating: they fill gaps or
refresh the least-recently-updated series instead of duplicating all Yahoo
traffic. A forced `POST /api/v1/data/ingest {"job_id":"market:backup:quotes"}`
runs the fallback immediately.

Symbol mapping examples:

- US: `AAPL` → Sina `gb_aapl`, Tencent `usAAPL`;
- HK: `0700.HK` → Sina `rt_hk00700`, Tencent `hk00700`;
- indices: `^GSPC` → `int_sp500`, `^HSI` → `int_hangseng`;
- futures: `GC=F` → `hf_GC`;
- FX: `EURUSD=X` → Frankfurter `from=EUR&to=USD`;
- crypto: `BTC-USD` → CoinGecko `bitcoin`.

## Configuration

Runtime settings (manager defaults; override where the plugin exposes engine
settings): `channel_quote_limit=20`, `channel_eod_limit=20`,
`channel_sina_batch=40`. Jobs run on the shared collection loop; a manual
`market:backup:quotes` or `market:backup:eod` can be forced with the tool/API.

## Persistence and provenance

- Quotes: `market_quote_latest` rows with `source_id` set to the channel id;
  the API/UI reports `source: sina|tencent|coingecko|frankfurter|yahoo`.
- Bars: `market_bar` rows with `source_id` and `quality="final"`.
- History endpoints fall back to the persisted warehouse bars when the primary
  provider fails, so the panel still renders what was previously collected.
- No channel response is returned to the plugin without being written first;
  the existing `storage_unavailable` contract still applies.

## Verification

Live probes from this host (2026-11-25):

```
Sina:     AAPL 354.07, Tencent 341.60, DJI 46 247.29, GC 3583.7, USDCNY 6.6653
Tencent:  usAAPL 354.07, hk00700 341.60, usDJI 50 018.70
CoinGecko: BTC 59 520 USD, ETH 1 671 USD
Frankfurter: USD→CNY 6.6645, USD→EUR 0.91216
```

The collectors are covered by offline tests with GBK/JSONP/JSON fixtures; live
verification is performed by forcing the two fallback jobs and inspecting
`/api/v1/data/status` source budgets plus the persisted `source_id` values.

Verified live on this host (2026-11-25): a forced `market:backup:quotes` run
made 4 requests and stored 18 quotes with `source_id` values `sina-finance`
(indices, GLD, AAPL/TSLA/…), `tencent-finance` (an A-share), `coingecko`
(BTC-USD) and `frankfurter` (EURUSD=X); a forced `market:backup:eod` run made
20 requests and stored 6,562 final daily bars from Sina/Tencent/CoinGecko.

## Limitations

- These are public web endpoints, not licensed feeds; they may rate-limit,
  change formats, or serve frozen snapshots. The governor's budget/circuit
  breaker and the quote-date sanity check protect the stored data.
- Frankfurter serves ECB daily reference rates, not intraday FX quotes; change
  percent is reported as 0 on latest-rate quotes.
- Sina global-futures history is not collected; only quotes plus the existing
  Yahoo/other EOD paths. Tencent/Sina EOD covers US/HK/A equities.
- Index/futures coverage from Sina is limited to the symbols listed above;
  unsupported series simply skip the fallback channel.
- Primary quote/EOD scheduling still defaults to Yahoo; fallbacks are bounded
  and rotate rather than fanning out to every channel for every symbol.
