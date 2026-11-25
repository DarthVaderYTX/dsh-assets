/**
 * Tests for the agent tool / slash-command action layer. A fake engine records
 * the HTTP call each action makes and returns canned payloads for formatting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createMarketTool, runAction } from '../src/host/tool.js';
import { SidecarError } from '../src/host/sidecar.js';

/**
 * Build a fake engine.
 * @param {Record<string, unknown>} responses path -> payload.
 * @returns {{ calls: any[], call: Function }} fake engine.
 */
function fakeEngine(responses = {}) {
  const calls = [];
  const keys = Object.keys(responses).sort((a, b) => b.length - a.length);
  return {
    calls,
    async call(method, path, body) {
      calls.push({ method, path, body });
      const match = keys.find((prefix) => path.startsWith(prefix));
      return match ? responses[match] : {};
    },
  };
}

const QUOTE = {
  symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD',
  price: 231.45, prev_close: 228.9, change: 2.55, change_pct: 1.11,
  open: 229.4, high: 232.1, low: 228.6, volume: 51234000,
  market_state: 'simulated', as_of: '2026-11-25T02:05:00Z', source: 'synthetic', stale: false,
  spark: [226, 227, 229, 231], rsi14: 58.2, trend: 'uptrend',
};

test('snapshot formats a watchlist table', async () => {
  const engine = fakeEngine({ '/api/v1/snapshot': { quotes: [QUOTE], as_of: '2026-11-25T02:05:00Z', provider: 'synthetic', degraded: false, stale: false } });
  const text = await runAction(engine.call, { action: 'snapshot' });
  assert.match(text, /Watchlist snapshot · synthetic/);
  assert.match(text, /AAPL/);
  assert.match(text, /\$231\.45/);
  assert.match(text, /\+1\.11%/);
  assert.match(text, /58\.2/);
});

test('snapshot passes explicit symbols and is empty-safe', async () => {
  const engine = fakeEngine({ '/api/v1/snapshot': { quotes: [], as_of: 'x', provider: 'synthetic' } });
  const text = await runAction(engine.call, { action: 'snapshot', symbols: ['AAPL', 'BTC-USD'] });
  assert.match(engine.calls[0].path, /symbols=AAPL%2CBTC-USD/);
  assert.match(text, /No symbols are followed/);
});

test('analysis renders signal, indicators and narrative', async () => {
  const engine = fakeEngine({
    '/api/v1/analysis/AAPL': {
      symbol: 'AAPL', name: 'Apple Inc.', as_of: '2026-11-25T02:05:00Z', provider: 'synthetic',
      quote: QUOTE,
      summary: { signal: 'bullish', score: 0.41, confidence: 'medium', trend: 'uptrend', momentum: 'positive', volatility: 'moderate', headline: 'AAPL is in an uptrend.' },
      indicators: {
        sma20: 228.1, sma50: 221.4, sma200: 205.7, ema12: 229, ema26: 224.6, rsi14: 58.2,
        macd: { line: 4.4, signal: 3.9, histogram: 0.5 },
        bollinger: { upper: 236.1, middle: 228.1, lower: 220.1, width_pct: 7 },
        atr14: 4.1,
      },
      stats: {
        period_return_pct: 18.2, annualized_volatility_pct: 24.6, max_drawdown_pct: -11.3,
        sharpe: 1.12, win_rate_pct: 55.6, avg_daily_range_pct: 1.8,
        high_52w: 245, low_52w: 164.1, distance_from_52w_high_pct: -5.5, avg_volume_20d: 51200000,
      },
      signals: [{ id: 'trend_alignment', label: 'Price above averages', direction: 'bullish', strength: 0.7, detail: 'Close is above SMA20 and SMA50.' }],
      narrative: 'Momentum is positive with moderate volatility.',
      levels: { support: [220.4, 214.9], resistance: [236.1, 244] },
      correlation: { benchmark: '^GSPC', value: 0.71, window_days: 250 },
    },
  });
  const text = await runAction(engine.call, { action: 'analyze', symbol: 'aapl' });
  assert.match(engine.calls[0].path, /\/api\/v1\/analysis\/AAPL$/);
  assert.match(text, /Signal: bullish/);
  assert.match(text, /RSI\(14\)/);
  assert.match(text, /support 220\.40/);
  assert.match(text, /Momentum is positive/);
});

test('history requests the normalized range and lists bars', async () => {
  const engine = fakeEngine({
    '/api/v1/history/MSFT': {
      symbol: 'MSFT', range: '5D', interval: '1d', provider: 'synthetic',
      bars: [
        { t: '2026-11-19', o: 1, h: 2, l: 0.5, c: 1.5, v: 1000 },
        { t: '2026-11-20', o: 2, h: 3, l: 1, c: 2.5, v: 2000 },
      ],
    },
  });
  const text = await runAction(engine.call, { action: 'history', symbol: 'MSFT', range: '5D' });
  assert.match(engine.calls[0].path, /range=5D/);
  assert.match(text, /2026-11-20/);
});

test('scan clamps the limit and renders rows', async () => {
  const engine = fakeEngine({
    '/api/v1/screener': {
      preset: 'momentum', scope: 'watchlist', as_of: '2026-11-25T02:05:00Z',
      rows: [{ symbol: 'NVDA', price: 182.4, change_pct: 2.1, rsi14: 61, trend: 'uptrend', score: 0.6 }],
    },
  });
  const text = await runAction(engine.call, { action: 'scan', preset: 'momentum', limit: '7' });
  assert.match(engine.calls[0].path, /limit=7/);
  assert.match(text, /NVDA/);
  await runAction(engine.call, { action: 'scan', preset: 'momentum', limit: 999 });
  assert.match(engine.calls[1].path, /limit=50/);
});

test('events forwards the limit and acknowledgement filter', async () => {
  const engine = fakeEngine({
    '/api/v1/alerts/events': {
      events: [{ id: 'e1', symbol: 'AAPL', severity: 'warning', message: 'AAPL crossed 250', ts: '2026-11-25T02:05:00Z', acknowledged: false }],
    },
  });
  const text = await runAction(engine.call, { action: 'events', limit: '6', acknowledged: false });
  assert.match(engine.calls[0].path, /limit=6&acknowledged=false/);
  assert.match(text, /AAPL crossed 250/);
});

test('watch, unwatch, alert and position mutations call the right endpoints', async () => {
  const engine = fakeEngine({
    '/api/v1/watchlist/AAPL': { ok: true },
    '/api/v1/alerts/r1': { rule: { id: 'r1', symbol: 'AAPL', kind: 'price_above', threshold: 250, enabled: false, armed: false } },
    '/api/v1/alerts': { rule: { id: 'r1', symbol: 'AAPL', kind: 'price_above', threshold: 250, enabled: true, armed: true } },
    '/api/v1/portfolio/positions': { position: { symbol: 'AAPL', quantity: 10, avg_cost: 180, market_value: 1800, unrealized_pnl: 0, currency: 'USD' } },
  });
  await runAction(engine.call, { action: 'watch', symbol: 'aapl' });
  await runAction(engine.call, { action: 'unwatch', symbol: 'AAPL' });
  await runAction(engine.call, { action: 'alert_create', symbol: 'AAPL', kind: 'price_above', threshold: 250 });
  await runAction(engine.call, { action: 'alert_set', rule_id: 'r1', enabled: false });
  await runAction(engine.call, { action: 'position_set', symbol: 'AAPL', quantity: 10, avg_cost: 180 });
  assert.deepEqual(engine.calls.map((call) => `${call.method} ${call.path}`), [
    'POST /api/v1/watchlist',
    'DELETE /api/v1/watchlist/AAPL',
    'POST /api/v1/alerts',
    'PATCH /api/v1/alerts/r1',
    'PUT /api/v1/portfolio/positions',
  ]);
  assert.deepEqual(engine.calls[0].body, { symbol: 'AAPL' });
  assert.deepEqual(engine.calls[2].body, { symbol: 'AAPL', kind: 'price_above', threshold: 250 });
});

test('collect_bars forwards pushed rows', async () => {
  const engine = fakeEngine({ '/api/v1/collect/bars': { stored: 2, range: { from: '2026-11-01', to: '2026-11-02' } } });
  const text = await runAction(engine.call, {
    action: 'collect_bars',
    symbol: 'FOO',
    bars: [
      { t: '2026-11-01', o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
      { t: '2026-11-02', o: 2, h: 3, l: 1, c: 2.5, v: 20 },
    ],
  });
  assert.equal(engine.calls[0].method, 'POST');
  assert.equal(engine.calls[0].body.bars.length, 2);
  assert.match(text, /Stored 2 bars for FOO/);
});

test('ma_cross alert_create does not require a threshold and carries a direction', async () => {
  const engine = fakeEngine({
    '/api/v1/alerts': {
      rule: {
        id: 'r2', symbol: 'AAPL', kind: 'ma_cross', threshold: 0,
        params: { direction: 'death', fast: 20, slow: 50 }, enabled: true, armed: true,
      },
    },
  });
  const text = await runAction(engine.call, { action: 'alert_create', symbol: 'AAPL', kind: 'ma_cross', direction: 'death' });
  assert.deepEqual(engine.calls[0].body, {
    symbol: 'AAPL',
    kind: 'ma_cross',
    threshold: 0,
    params: { direction: 'death', fast: 20, slow: 50 },
  });
  assert.match(text, /death cross/);
});

test('settings_update formats the flat settings payload', async () => {
  const engine = fakeEngine({
    '/api/v1/settings': {
      provider: 'auto', poll_seconds: 30, benchmark: '^GSPC', base_currency: 'USD', auto_refresh: true,
    },
  });
  const text = await runAction(engine.call, { action: 'settings_update', provider: 'auto', poll_seconds: 30 });
  assert.equal(engine.calls[0].method, 'PATCH');
  assert.match(text, /provider: auto/);
  assert.match(text, /poll_seconds: 30/);
});

test('collection-layer actions query the data endpoints', async () => {
  const engine = fakeEngine({
    '/api/v1/data/status': {
      enabled: true, running: true, schema_version: 2,
      tracked: { live: 12, eod: 150, indices: 20, commodities: 10 },
      jobs: [{ job_id: 'market:live', last_run_at: '2026-11-25T02:00:00Z', next_due_at: '2026-11-25T02:01:00Z', last_status: 'ok', due: false }],
      sources: [{ source_id: 'yahoo-finance', used_day: 30, max_per_day: 2500, used_hour: 4, max_per_hour: 240, last_error: '', circuit_open_in_s: 0 }],
    },
    '/api/v1/data/coverage': {
      domains: {
        reference: { exchanges: 14, instruments: 9000, indices: 28, commodity_roots: 16 },
        market: { bars: 4000, series: 150 },
        news: { articles: 120, entity_links: 300 },
        index: { entries: 12997, active_entries: 12900, pending_profiles: 8000, changes: 42 },
      },
      tracked: { live: 12, eod: 150, indices: 20, commodities: 10 },
    },
    '/api/v1/data/ingest': { enabled: true, dry_run: false, results: [{ job_id: 'market:live', status: 'ok', requests: 1, stored: 12, updated: 0, skipped: 0, error: '', details: { quotes: [{ series_id: 'INS:XNAS:AAPL' }] } }] },
    '/api/v1/news': {
      articles: [{
        article_id: 'a1', source_id: 'cnbc-rss', published_at: '2026-11-25T01:00:00Z',
        title: 'Apple beats estimates',
        entities: [{ entity_id: 'INS:XNAS:AAPL', entity_type: 'instrument', symbol: 'AAPL' }],
      }],
      count: 1,
    },
    '/api/v1/ref/instruments': {
      instruments: [{ instrument_id: 'INS:XNAS:AAPL', symbol: 'AAPL', mic: 'XNAS', name: 'Apple Inc.', type: 'stock', sector: 'Technology' }],
      total: 1, count: 1,
    },
    '/api/v1/ref/indices': { indices: [{ index_id: 'IDX:GSPC', code: 'GSPC', name: 'S&P 500', region: 'US', provider_symbol: '^GSPC' }] },
    '/api/v1/ref/commodities': { roots: [{ root_id: 'COM:XCEC:GC', venue: 'XCEC', root: 'GC', name: 'Gold futures', category: 'metals', unit: 'troy ounce', provider_symbol: 'GC=F' }], contracts: [{ contract_id: 'COM:XCEC:GC:202612' }] },
    '/api/v1/series/INS%3AXNAS%3AAAPL/bars': {
      series_id: 'INS:XNAS:AAPL', interval: '1d',
      bars: [{ t: '2026-11-21', o: 1, h: 2, l: 0.5, c: 2.2, v: 12, quality: 'final' }],
    },
  });
  const statusText = await runAction(engine.call, { action: 'data_status' });
  assert.match(statusText, /Data collection · enabled/);
  assert.match(statusText, /instruments/);
  assert.match(statusText, /indexed entries/);
  assert.match(statusText, /yahoo-finance/);
  assert.match(statusText, /Tracked series: live 12/);

  const ingestText = await runAction(engine.call, { action: 'data_ingest' });
  assert.match(ingestText, /market:live/);
  assert.match(ingestText, /quotes refreshed/);

  const plannedText = await runAction(engine.call, { action: 'data_ingest', dry_run: true });
  assert.match(plannedText, /No collection job was due|market:live/);

  const newsText = await runAction(engine.call, { action: 'news', symbol: 'aapl' });
  assert.match(engine.calls.at(-1).path, /symbol=AAPL/);
  assert.match(newsText, /Apple beats estimates/);
  assert.match(newsText, /INS:XNAS:AAPL AAPL/);

  const instrumentText = await runAction(engine.call, { action: 'instruments', mic: 'xnas', q: 'apple' });
  assert.match(engine.calls.at(-1).path, /mic=XNAS/);
  assert.match(instrumentText, /Apple Inc\./);

  const indexText = await runAction(engine.call, { action: 'indices', q: 's%p' });
  assert.match(indexText, /S&P 500/);

  const commodityText = await runAction(engine.call, { action: 'commodities' });
  assert.match(commodityText, /Gold futures/);
  assert.match(commodityText, /1 contracts/);

  const barsText = await runAction(engine.call, { action: 'series_bars', series_id: 'INS:XNAS:AAPL' });
  assert.match(engine.calls.at(-1).path, /\/api\/v1\/series\/INS%3AXNAS%3AAAPL\/bars/);
  assert.match(barsText, /2026-11-21/);
  await assert.rejects(
    () => runAction(engine.call, { action: 'series_bars' }),
    /series_id is required/,
  );
});

test('index-layer actions query index and profile endpoints', async () => {
  const engine = fakeEngine({
    '/api/v1/index/company%3Amaster/entries': {
      total: 42,
      entries: [{
        entity_id: 'INS:XNAS:AAPL', market: 'XNAS', status: 'active', profile_status: 'pending',
        payload: { name: 'Apple Inc.', provider_ids: { sec_cik: '320193' } },
      }],
    },
    '/api/v1/index/company%3Amaster/changes': {
      changes: [{
        change_id: 7, entry_key: 'INS:XNAS:AAPL', entity_id: 'INS:XNAS:AAPL', market: 'XNAS',
        change_type: 'updated', changed_fields: ['payload.name'], observed_at: '2026-11-25T02:00:00Z',
      }],
    },
    '/api/v1/index/company%3Amaster/refresh': {
      index_id: 'company:master', job_id: 'company:index', dry_run: false,
      result: {
        status: 'ok',
        details: {
          counts: { entries_seen: 42, added: 2, updated: 1, restored: 0, removed: 0, delisted: 0 },
          projection: { instruments: 3, aliases: 5 },
          sources: { sec: { status: 'ok' }, nasdaq: { status: 'ok' } },
        },
      },
    },
    '/api/v1/index': {
      indices: [{
        index_id: 'company:master', kind: 'company_master', revision: 3, refresh_job: 'company:index',
        stats: { total: 42, active: 40, missing: 1, delisted: 1, pending_profiles: 12, by_market: { XNAS: 30, XTKS: 12 } },
        refreshes: [{ finished_at: '2026-11-25T02:00:00Z', status: 'ok', added: 2, updated: 1, removed: 0, delisted: 0 }],
      }],
    },
    '/api/v1/company/INS%3AXNAS%3AAAPL/profile': {
      entry: {
        entity_id: 'INS:XNAS:AAPL', market: 'XNAS', status: 'active', revision: 2,
        first_seen_at: '2026-11-24T00:00:00Z', last_seen_at: '2026-11-25T00:00:00Z',
        profile_status: 'ready', payload: { name: 'Apple Inc.', provider_ids: { sec_cik: '320193' } },
      },
      profile: {
        legal_name: 'Apple Inc.', sic: '3571', sic_description: 'Electronic Computers',
        state_of_incorporation: 'CA', fiscal_year_end: '0926', tickers: ['AAPL'],
        exchanges: ['Nasdaq'], former_names: [], address: '1 Apple Park Way, Cupertino, CA',
        source_id: 'sec-submissions', fetched_at: '2026-11-25T00:00:00Z',
      },
    },
  });

  const statusText = await runAction(engine.call, { action: 'index_status' });
  assert.match(statusText, /company:master · company_master · revision 3/);
  assert.match(statusText, /pending profiles 12/);
  assert.match(statusText, /XNAS 30/);

  const entriesText = await runAction(engine.call, { action: 'index_entries', market: 'xnas', limit: '5' });
  assert.match(engine.calls.at(-1).path, /index\/company%3Amaster\/entries\?limit=5&market=XNAS/);
  assert.match(entriesText, /INS:XNAS:AAPL/);
  assert.match(entriesText, /320193/);

  const changesText = await runAction(engine.call, { action: 'index_changes' });
  assert.match(changesText, /updated/);
  assert.match(changesText, /payload\.name/);

  const refreshText = await runAction(engine.call, { action: 'index_refresh' });
  assert.equal(engine.calls.at(-1).method, 'POST');
  assert.match(refreshText, /added 2 · updated 1/);
  assert.match(refreshText, /projection: instruments 3/);

  const profileText = await runAction(engine.call, { action: 'company_profile', entity_id: 'INS:XNAS:AAPL' });
  assert.match(engine.calls.at(-1).path, /\/api\/v1\/company\/INS%3AXNAS%3AAAPL\/profile/);
  assert.match(profileText, /Apple Inc\./);
  assert.match(profileText, /Electronic Computers/);
  assert.match(profileText, /SEC CIK: 320193/);
});

test('china-layer actions read the persisted China overview', async () => {
  const engine = fakeEngine({
    '/api/v1/china/overview': {
      securities: {
        ready: true,
        stats: { active: 50, total: 50, by_type: { stock: 40, etf: 10 } },
        refreshes: [{ finished_at: '2026-11-25T02:00:00Z', status: 'ok' }],
      },
      commodities: { ready: true, stats: { active: 38, total: 38 } },
      top_stocks: [{
        entity_id: 'INS:XSHG:600519', symbol: '600519', name: '贵州茅台', market: 'XSHG',
        price: 1500.5, change_pct: 1.2, currency: 'CNY', market_cap: 1880000000000,
      }],
      top_funds: [{
        entity_id: 'INS:XSHG:510300', symbol: '510300', name: '沪深300ETF', market: 'XSHG',
        price: 4.1, change_pct: 0.5, currency: 'CNY', market_cap: 100000000000,
      }],
      top_commodities: [{
        root_id: 'COM:XSHF:AU', symbol: 'AU0', name: 'Gold futures (SHFE)', venue: 'XSHF',
        price: 580.2, change_pct: -0.3, currency: 'CNY', as_of: '2026-11-25T02:00:00Z',
      }],
    },
  });
  const statusText = await runAction(engine.call, { action: 'china_status' });
  assert.match(statusText, /China market/);
  assert.match(statusText, /贵州茅台/);
  assert.match(statusText, /Top commodities|Commodity futures/);
  const stocksText = await runAction(engine.call, { action: 'china_stocks' });
  assert.match(stocksText, /Top stocks/);
  assert.match(stocksText, /600519/);
  const fundsText = await runAction(engine.call, { action: 'china_funds' });
  assert.match(fundsText, /510300/);
  const commodityText = await runAction(engine.call, { action: 'china_commodities' });
  assert.match(commodityText, /AU0/);
  assert.match(commodityText, /XSHF/);
});

test('backfill_status summarizes recent-window coverage', async () => {
  const engine = fakeEngine({
    '/api/v1/data/backfill': {
      window: { days: 30, start: '2026-10-26', end: '2026-11-25' },
      universe: 120, with_recent_bars: 40, adequate: 40, needs_fill: 80,
      needs: [{
        series_id: 'INS:XNAS:AAPL', kind: 'instrument', provider_symbol: 'AAPL',
        bars_in_window: 3, latest_bar: '2026-11-20',
      }],
      job: {
        last_run_at: '2026-11-25T01:00:00Z', last_status: 'ok',
        next_due_at: '2026-11-25T01:10:00Z',
      },
    },
  });
  const text = await runAction(engine.call, { action: 'backfill_status' });
  assert.match(text, /Recent backfill · last 30 days/);
  assert.match(text, /needs fill 80/);
  assert.match(text, /INS:XNAS:AAPL/);
  assert.match(text, /BARS/);
});

test('invalid arguments fail before any request', async () => {
  const engine = fakeEngine();
  await assert.rejects(() => runAction(engine.call, { action: 'nope' }), SidecarError);
  await assert.rejects(() => runAction(engine.call, { action: 'analyze' }), /symbol is required/);
  await assert.rejects(() => runAction(engine.call, { action: 'alert_create', symbol: 'AAPL', kind: 'wat', threshold: 1 }), /kind must be one of/);
  await assert.rejects(() => runAction(engine.call, { action: 'alert_create', symbol: 'AAPL', kind: 'price_above' }), /threshold is required/);
  await assert.rejects(() => runAction(engine.call, { action: 'ack' }), /ids or acknowledge_all/);
  await assert.rejects(() => runAction(engine.call, { action: 'settings_update', provider: 'nope' }), /provider must be one of/);
  await assert.rejects(() => runAction(engine.call, { action: 'position_set', symbol: 'AAPL', quantity: 'x', avg_cost: 1 }), /quantity is required/);
  assert.equal(engine.calls.length, 0);
});

test('tool definition exposes every action and a string output', () => {
  const tool = createMarketTool({ call: async () => ({}) });
  assert.equal(tool.name, 'market_monitor');
  assert.deepEqual(tool.parameters.properties.action.enum, ACTIONS);
  assert.equal(tool.output.schema.type, 'string');
  assert.equal(typeof tool.execute, 'function');
});
