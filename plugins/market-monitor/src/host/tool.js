/**
 * Agent tool and slash-command surface for the market engine.
 *
 * Both callers run the same {@link runAction} function, which maps one action
 * onto the Python HTTP API and formats a bounded text result. No financial
 * logic lives here; this module only validates arguments and presents data.
 */
import { SidecarError } from './sidecar.js';

export const ACTIONS = [
  'snapshot',
  'analyze',
  'history',
  'scan',
  'watchlist',
  'watch',
  'unwatch',
  'alerts',
  'alert_create',
  'alert_set',
  'alert_delete',
  'events',
  'ack',
  'sync',
  'portfolio',
  'position_set',
  'position_delete',
  'settings',
  'settings_update',
  'collect_bars',
  'data_status',
  'data_ingest',
  'news',
  'instruments',
  'indices',
  'commodities',
  'series_bars',
  'index_status',
  'index_entries',
  'index_changes',
  'index_refresh',
  'company_profile',
  'china_status',
  'china_stocks',
  'china_funds',
  'china_commodities',
  'backfill_status',
];

const ALERT_KINDS = [
  'price_above',
  'price_below',
  'change_pct_above',
  'change_pct_below',
  'rsi_above',
  'rsi_below',
  'ma_cross',
  'volume_spike',
];

const RANGES = ['1D', '5D', '1M', '3M', '6M', '1Y'];
const PRESETS = ['gainers', 'losers', 'momentum', 'oversold', 'overbought', 'volatile'];
const PROVIDERS = ['auto', 'yahoo'];

const TOOL_DESCRIPTION = [
  'Collect, monitor, and analyze financial market data through the Market monitor workspace.',
  'Reads the watchlist, quotes, price history, indicator analysis, screener rows, alert rules and events, portfolio P&L, and engine settings.',
  'Mutations are durable in the plugin database: watch symbols, create or change alert rules, acknowledge alerts, set portfolio positions, and update the provider or monitoring cadence.',
  'Quotes use a persisted primary path (Yahoo Finance) with governed fallbacks through Sina Finance, Tencent Finance, CoinGecko and Frankfurter/ECB; `settings_update` can pin auto or Yahoo mode. The production path never generates simulated prices.',
  '',
  'Actions:',
  '- snapshot: quote table for the watchlist or the `symbols` given.',
  '- analyze: one-year indicator analysis, signals, levels, and narrative for `symbol`.',
  '- history: OHLCV chart bars for `symbol`; 1D reads only stored 5-minute bars, 5D reads only stored 30-minute bars, and 1M/3M/6M/1Y read only daily bars. Densities are never mixed or substituted.',
  '- scan: rank the monitored universe with `preset`.',
  '- watchlist | watch | unwatch: read or change followed symbols.',
  '- alerts | alert_create | alert_set | alert_delete: manage alert rules; ma_cross takes `direction` (golden|death) instead of a threshold.',
  '- events | ack: read or acknowledge triggered alerts.',
  '- sync: refresh quotes and evaluate alert rules now.',
  '- portfolio | position_set | position_delete: read or change holdings.',
  '- settings | settings_update: read or change provider mode and monitoring cadence.',
  '- collect_bars: store externally collected daily OHLCV rows for `symbol`.',
  '',
  'Collection layer (canonical multi-domain warehouse):',
  '- data_status: coverage per domain, collection jobs, and source budgets/circuit state.',
  '- data_ingest: run due collection jobs, or one job with `job_id`; `dry_run` plans only.',
  '- news: stored articles (publisher URL, publish time, title, content, collected time) linked to instruments, indices, and commodities; filter by `symbol`.',
  '- instruments | indices | commodities: canonical reference search and contract lists.',
  '- series_bars: canonical stored bars for a typed series id such as INS:XNAS:AAPL.',
  '',
  'Index layer (updatable tracking indexes that drive collection):',
  '- index_status: registry of indexes with entry counts, markets, pending company profiles, and recent refreshes.',
  '- index_entries: page through one index (`index_id`, default company:master) with `market`, `status`, `profile_status`, `q`, `limit`, `offset`.',
  '- index_changes: recently added, updated, removed, delisted, or restored index entries.',
  '- index_refresh: run the index refresh job now (`dry_run` plans only).',
  '- company_profile: index entry plus the collected company profile for `entity_id`.',
  '',
  'China market (mainland A-shares, exchange-traded funds and domestic commodity futures):',
  '- china_status: China securities/commodity index counts and top movers.',
  '- china_stocks | china_funds: largest tracked mainland stocks or ETFs with their latest persisted quote.',
  '- china_commodities: tracked SHFE/INE/DCE/CZCE/GFEX front contracts with quotes.',
  '',
  'Automatic backfill (real persisted data only):',
  '- backfill_status: rolling recent-window coverage plus the annual watched-company window (target 240 real daily bars over 365 days), and both background job states.',
  '- Force a batch with data_ingest job_id=backfill:recent, job_id=backfill:annual, or job_id=market:intraday. The annual job fills four watched companies per 30-minute run; the intraday job stores real 5m and a separate 30m bucket for watched US securities. Short histories are stored as-is, never padded or fabricated.',
].join('\n');

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ACTIONS,
      description: 'Operation to perform.',
    },
    symbol: {
      type: 'string',
      description: 'Instrument symbol such as AAPL, BTC-USD, ^GSPC, or EURUSD=X. Required by most single-symbol actions.',
    },
    symbols: {
      type: 'array',
      items: { type: 'string' },
      description: 'Symbols for snapshot instead of the watchlist.',
    },
    range: {
      type: 'string',
      enum: RANGES,
      description: 'Chart time window: 1D=today intraday, 5D=five sessions intraday, 1M/3M/6M/1Y=daily lookback. Default 1D.',
    },
    preset: {
      type: 'string',
      enum: PRESETS,
      description: 'Screener preset for scan, default gainers.',
    },
    limit: {
      type: 'number',
      description: 'Maximum rows for scan or events, 1-50; default 10 for scan and 20 for events.',
    },
    kind: {
      type: 'string',
      enum: ALERT_KINDS,
      description: 'Alert kind. price_* use price, change_pct_* use percent, rsi_* use RSI(14), volume_spike uses a multiple of 20-day volume, ma_cross uses direction instead of a threshold.',
    },
    threshold: {
      type: 'number',
      description: 'Kind-specific threshold value for alert_create and alert_set; ignored for ma_cross.',
    },
    direction: {
      type: 'string',
      enum: ['golden', 'death'],
      description: 'ma_cross direction: golden (fast crosses above slow) or death. Default golden; ignored by other kinds.',
    },
    rule_id: {
      type: 'string',
      description: 'Alert rule id for alert_set and alert_delete.',
    },
    enabled: {
      type: 'boolean',
      description: 'Whether the alert rule is armed.',
    },
    note: {
      type: 'string',
      description: 'Short note stored with a watch item or alert rule.',
    },
    cooldown_seconds: {
      type: 'number',
      description: 'Alert re-trigger cooldown in seconds, default 3600.',
    },
    ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Alert event ids for ack.',
    },
    acknowledge_all: {
      type: 'boolean',
      description: 'Acknowledge every unacknowledged alert event when ids is absent.',
    },
    acknowledged: {
      type: 'boolean',
      description: 'Filter events by acknowledgement state; omit for all events.',
    },
    quantity: {
      type: 'number',
      description: 'Position size for position_set.',
    },
    avg_cost: {
      type: 'number',
      description: 'Average cost per unit for position_set.',
    },
    provider: {
      type: 'string',
      enum: PROVIDERS,
      description: 'Quote provider for settings_update: auto and yahoo both require real live data; production never falls back to generated prices.',
    },
    poll_seconds: {
      type: 'number',
      description: 'Monitoring cadence in seconds, 5-3600.',
    },
    benchmark: {
      type: 'string',
      description: 'Benchmark symbol for settings_update and analysis correlation, default ^GSPC.',
    },
    entity_id: {
      type: 'string',
      description: 'Canonical entity id for news filtering, such as INS:XNAS:AAPL or IDX:GSPC.',
    },
    mic: {
      type: 'string',
      description: 'Exchange MIC for instruments, such as XNAS, XNYS, XSHG, or XTKS.',
    },
    q: {
      type: 'string',
      description: 'Search text for instruments or indices.',
    },
    type: {
      type: 'string',
      description: 'Instrument type filter: stock, etf, adr, crypto, forex.',
    },
    job_id: {
      type: 'string',
      description: 'Collection job to run explicitly, such as market:live or news:rss.',
    },
    dry_run: {
      type: 'boolean',
      description: 'Plan a collection run without contacting any source.',
    },
    series_id: {
      type: 'string',
      description: 'Typed warehouse series id for series_bars.',
    },
    index_id: {
      type: 'string',
      description: 'Index id for index entries/changes/refresh, default company:master.',
    },
    market: {
      type: 'string',
      description: 'Market/MIC filter for index entries, such as US or XTKS.',
    },
    status: {
      type: 'string',
      description: 'Index entry status filter: active, missing, or delisted.',
    },
    profile_status: {
      type: 'string',
      description: 'Company profile state filter: pending, ready, skipped, or failed.',
    },
    offset: {
      type: 'number',
      description: 'Row offset for index_entries paging, default 0.',
    },
    interval: {
      type: 'string',
      enum: ['1d', '30m', '5m'],
      description: 'Bar interval for series_bars, default 1d.',
    },
    bars: {
      type: 'array',
      description: 'Daily OHLCV rows for collect_bars.',
      items: {
        type: 'object',
        properties: {
          t: { type: 'string', description: 'Trading date, YYYY-MM-DD.' },
          o: { type: 'number' },
          h: { type: 'number' },
          l: { type: 'number' },
          c: { type: 'number' },
          v: { type: 'number' },
        },
        required: ['t', 'o', 'h', 'l', 'c', 'v'],
      },
    },
  },
  required: ['action'],
};

/**
 * Build the `market_monitor` tool definition.
 * @param {{ call: (method: string, path: string, body?: unknown) => Promise<unknown> }} engine sidecar caller.
 * @returns {object} a plain tool definition accepted by `ctx.tools.register`.
 */
export function createMarketTool(engine) {
  return {
    name: 'market_monitor',
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      return runAction((method, path, body) => engine.call(method, path, body), args ?? {});
    },
  };
}

/**
 * Execute one action against the engine and format its result.
 * @param {(method: string, path: string, body?: unknown) => Promise<unknown>} call engine caller.
 * @param {Record<string, unknown>} args tool arguments.
 * @returns {Promise<string>} formatted text result.
 */
export async function runAction(call, args) {
  const action = typeof args.action === 'string' ? args.action : '';
  if (!ACTIONS.includes(action)) {
    throw new SidecarError('invalid_argument', `Unknown action "${action}". Use one of: ${ACTIONS.join(', ')}.`);
  }
  const symbol = requireSymbol(args, action);

  switch (action) {
    case 'snapshot': {
      const symbols = Array.isArray(args.symbols)
        ? args.symbols.filter((item) => typeof item === 'string' && item.trim() !== '')
        : [];
      const query = symbols.length > 0 ? `?symbols=${encodeURIComponent(symbols.join(','))}` : '';
      return formatSnapshot(await call('GET', `/api/v1/snapshot${query}`));
    }
    case 'analyze':
      return formatAnalysis(await call('GET', `/api/v1/analysis/${encodeURIComponent(symbol)}`));
    case 'history':
      return formatHistory(await call('GET', `/api/v1/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(rangeOf(args))}`));
    case 'scan':
      return formatScreener(await call(
        'GET',
        `/api/v1/screener?preset=${encodeURIComponent(presetOf(args))}&limit=${encodeURIComponent(String(limitOf(args, 10)))}`,
      ));
    case 'watchlist':
      return formatWatchlist(await call('GET', '/api/v1/watchlist'));
    case 'watch': {
      const result = await call('POST', '/api/v1/watchlist', { symbol });
      return `${symbol} is ${result.created ? 'now' : 'already'} followed.`;
    }
    case 'unwatch': {
      await call('DELETE', `/api/v1/watchlist/${encodeURIComponent(symbol)}`);
      return `${symbol} was removed from the watchlist.`;
    }
    case 'alerts':
      return formatAlerts(await call('GET', '/api/v1/alerts'));
    case 'alert_create': {
      const kind = alertKindOf(args);
      const threshold = kind === 'ma_cross'
        ? (Number.isFinite(Number(args.threshold)) ? Number(args.threshold) : 0)
        : finiteNumber(args.threshold, `threshold is required for ${kind}`);
      const direction = typeof args.direction === 'string' && (args.direction === 'golden' || args.direction === 'death')
        ? args.direction
        : 'golden';
      const body = {
        symbol,
        kind,
        threshold,
        ...(kind === 'ma_cross' ? { params: { direction, fast: 20, slow: 50 } } : {}),
        ...(typeof args.note === 'string' && args.note !== '' ? { note: args.note } : {}),
        ...(Number.isFinite(args.cooldown_seconds)
          ? { cooldown_s: Math.max(0, Math.round(Number(args.cooldown_seconds))) }
          : {}),
      };
      const result = await call('POST', '/api/v1/alerts', body);
      return `Created alert ${result.rule.id} on ${symbol}: ${describeRule(result.rule)}.`;
    }
    case 'alert_set': {
      const ruleId = requireString(args.rule_id, 'rule_id is required for alert_set');
      const body = {};
      if (typeof args.enabled === 'boolean') body.enabled = args.enabled;
      if (Number.isFinite(args.threshold)) body.threshold = Number(args.threshold);
      if (Number.isFinite(args.cooldown_seconds)) body.cooldown_s = Math.max(0, Math.round(Number(args.cooldown_seconds)));
      if (typeof args.note === 'string') body.note = args.note;
      if (Object.keys(body).length === 0) throw new SidecarError('invalid_argument', 'alert_set needs enabled, threshold, cooldown_seconds, or note.');
      const result = await call('PATCH', `/api/v1/alerts/${encodeURIComponent(ruleId)}`, body);
      return `Updated alert ${result.rule.id}: ${describeRule(result.rule)}.`;
    }
    case 'alert_delete': {
      const ruleId = requireString(args.rule_id, 'rule_id is required for alert_delete');
      await call('DELETE', `/api/v1/alerts/${encodeURIComponent(ruleId)}`);
      return `Deleted alert ${ruleId}.`;
    }
    case 'events':
      return formatEvents(await call(
        'GET',
        `/api/v1/alerts/events?limit=${encodeURIComponent(String(limitOf(args, 20)))}${typeof args.acknowledged === 'boolean' ? `&acknowledged=${args.acknowledged}` : ''}`,
      ));
    case 'ack': {
      const ids = Array.isArray(args.ids)
        ? args.ids.filter((item) => typeof item === 'string' && item.trim() !== '')
        : [];
      const body = ids.length > 0 ? { ids } : { all: true };
      if (ids.length === 0 && args.acknowledge_all !== true) {
        throw new SidecarError('invalid_argument', 'ack needs ids or acknowledge_all: true.');
      }
      const result = await call('POST', '/api/v1/alerts/events/ack', body);
      return `Acknowledged ${result.acknowledged} alert event${result.acknowledged === 1 ? '' : 's'}.`;
    }
    case 'sync': {
      const result = await call('POST', '/api/v1/sync', {});
      return formatSync(result);
    }
    case 'portfolio':
      return formatPortfolio(await call('GET', '/api/v1/portfolio'));
    case 'position_set': {
      const quantity = finiteNumber(args.quantity, 'quantity is required for position_set');
      const avgCost = finiteNumber(args.avg_cost, 'avg_cost is required for position_set');
      const result = await call('PUT', '/api/v1/portfolio/positions', { symbol, quantity, avg_cost: avgCost });
      const position = result.position;
      return `Set ${position.symbol} position: ${formatNumber(position.quantity, 4)} units at ${formatMoney(position.avg_cost, position.currency)} average cost (market value ${formatMoney(position.market_value, position.currency)}, P&L ${formatSignedMoney(position.unrealized_pnl, position.currency)}).`;
    }
    case 'position_delete': {
      await call('DELETE', `/api/v1/portfolio/positions/${encodeURIComponent(symbol)}`);
      return `Removed the ${symbol} position.`;
    }
    case 'settings':
      return formatSettings(await call('GET', '/api/v1/settings'));
    case 'settings_update': {
      const body = {};
      if (typeof args.provider === 'string') {
        if (!PROVIDERS.includes(args.provider)) throw new SidecarError('invalid_argument', `provider must be one of ${PROVIDERS.join(', ')}.`);
        body.provider = args.provider;
      }
      if (Number.isFinite(args.poll_seconds)) body.poll_seconds = Math.round(Number(args.poll_seconds));
      if (typeof args.benchmark === 'string' && args.benchmark.trim() !== '') body.benchmark = args.benchmark.trim().toUpperCase();
      if (Object.keys(body).length === 0) throw new SidecarError('invalid_argument', 'settings_update needs provider, poll_seconds, or benchmark.');
      const result = await call('PATCH', '/api/v1/settings', body);
      return formatSettings(result);
    }
    case 'collect_bars': {
      const bars = Array.isArray(args.bars) ? args.bars : [];
      if (bars.length === 0) throw new SidecarError('invalid_argument', 'collect_bars needs a non-empty bars array.');
      const result = await call('POST', '/api/v1/collect/bars', { symbol, bars });
      return `Stored ${result.stored} bars for ${symbol} (${result.range.from} to ${result.range.to}).`;
    }
    case 'data_status': {
      const [status, coverage] = await Promise.all([
        call('GET', '/api/v1/data/status'),
        call('GET', '/api/v1/data/coverage'),
      ]);
      return formatDataStatus(status, coverage);
    }
    case 'data_ingest': {
      const body = {};
      if (typeof args.job_id === 'string' && args.job_id.trim() !== '') body.job_id = args.job_id.trim();
      if (typeof args.dry_run === 'boolean') body.dry_run = args.dry_run;
      return formatIngest(await call('POST', '/api/v1/data/ingest', body));
    }
    case 'news': {
      const params = new URLSearchParams({ limit: String(limitOf(args, 20)) });
      if (typeof args.symbol === 'string' && args.symbol.trim() !== '') params.set('symbol', args.symbol.trim().toUpperCase());
      if (typeof args.entity_id === 'string' && args.entity_id.trim() !== '') params.set('entity_id', args.entity_id.trim());
      return formatNews(await call('GET', `/api/v1/news?${params.toString()}`));
    }
    case 'instruments': {
      const params = new URLSearchParams({ limit: String(limitOf(args, 20)) });
      if (typeof args.mic === 'string' && args.mic.trim() !== '') params.set('mic', args.mic.trim().toUpperCase());
      if (typeof args.q === 'string' && args.q.trim() !== '') params.set('q', args.q.trim());
      if (typeof args.type === 'string' && args.type.trim() !== '') params.set('type', args.type.trim());
      return formatInstruments(await call('GET', `/api/v1/ref/instruments?${params.toString()}`));
    }
    case 'indices': {
      const params = new URLSearchParams({ limit: String(limitOf(args, 20)) });
      if (typeof args.q === 'string' && args.q.trim() !== '') params.set('q', args.q.trim());
      return formatIndices(await call('GET', `/api/v1/ref/indices?${params.toString()}`));
    }
    case 'commodities':
      return formatCommodities(await call('GET', '/api/v1/ref/commodities'));
    case 'series_bars': {
      const seriesId = requireString(args.series_id, 'series_id is required for series_bars');
      const interval = ['1d', '30m', '5m'].includes(args.interval) ? args.interval : '1d';
      return formatSeriesBars(await call(
        'GET',
        `/api/v1/series/${encodeURIComponent(seriesId)}/bars?interval=${interval}&limit=12`,
      ));
    }
    case 'index_status': {
      const overview = await call('GET', '/api/v1/index');
      return formatIndexStatus(overview);
    }
    case 'index_entries': {
      const indexId = indexIdOf(args);
      const params = new URLSearchParams({ limit: String(limitOf(args, 20)) });
      if (typeof args.market === 'string' && args.market.trim() !== '') params.set('market', args.market.trim().toUpperCase());
      if (typeof args.status === 'string' && args.status.trim() !== '') params.set('status', args.status.trim().toLowerCase());
      if (typeof args.profile_status === 'string' && args.profile_status.trim() !== '') params.set('profile_status', args.profile_status.trim().toLowerCase());
      if (typeof args.q === 'string' && args.q.trim() !== '') params.set('q', args.q.trim());
      if (Number.isFinite(args.offset) && Number(args.offset) > 0) params.set('offset', String(Math.floor(Number(args.offset))));
      return formatIndexEntries(await call('GET', `/api/v1/index/${encodeURIComponent(indexId)}/entries?${params.toString()}`));
    }
    case 'index_changes': {
      const indexId = indexIdOf(args);
      const params = new URLSearchParams({ limit: String(limitOf(args, 20)) });
      return formatIndexChanges(await call('GET', `/api/v1/index/${encodeURIComponent(indexId)}/changes?${params.toString()}`));
    }
    case 'index_refresh': {
      const indexId = indexIdOf(args);
      const body = {};
      if (typeof args.dry_run === 'boolean') body.dry_run = args.dry_run;
      return formatIndexRefresh(await call('POST', `/api/v1/index/${encodeURIComponent(indexId)}/refresh`, body));
    }
    case 'company_profile': {
      const entityId = requireString(args.entity_id, 'entity_id is required for company_profile');
      return formatCompanyProfile(await call('GET', `/api/v1/company/${encodeURIComponent(entityId)}/profile`));
    }
    case 'china_status':
      return formatChinaStatus(await call('GET', '/api/v1/china/overview'));
    case 'china_stocks':
      return formatChinaStatus(await call('GET', '/api/v1/china/overview'), 'stocks');
    case 'china_funds':
      return formatChinaStatus(await call('GET', '/api/v1/china/overview'), 'funds');
    case 'china_commodities':
      return formatChinaStatus(await call('GET', '/api/v1/china/overview'), 'commodities');
    case 'backfill_status':
      return formatBackfillStatus(await call('GET', '/api/v1/data/backfill'));
    default:
      throw new SidecarError('invalid_argument', `Unknown action "${action}".`);
  }
}

/* --------------------------------------------------------------- formatting */

/**
 * Format a watchlist snapshot table.
 * @param {any} payload snapshot response.
 * @returns {string} text table.
 */
function formatSnapshot(payload) {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const header = `Watchlist snapshot · ${payload?.provider ?? 'unknown'} · ${formatTimestamp(payload?.as_of)}${payload?.degraded ? ' · degraded' : ''}${payload?.stale ? ' · stale' : ''}`;
  if (quotes.length === 0) return `${header}\nNo symbols are followed. Use watch to add one.`;
  const rows = quotes.map((quote) => [
    quote.symbol,
    formatMoney(quote.price, quote.currency),
    formatSignedMoney(quote.change, quote.currency),
    formatSignedPct(quote.change_pct),
    Number.isFinite(quote.rsi14) ? formatNumber(quote.rsi14, 1) : '-',
    quote.trend ?? '-',
    quote.market_state ?? '-',
  ]);
  return [header, formatTable(['SYMBOL', 'PRICE', 'CHANGE', 'CHG%', 'RSI', 'TREND', 'STATE'], rows)].join('\n');
}

/**
 * Format one instrument analysis.
 * @param {any} payload analysis response.
 * @returns {string} readable analysis text.
 */
function formatAnalysis(payload) {
  if (!payload || typeof payload !== 'object') return 'No analysis returned.';
  const summary = payload.summary ?? {};
  const quote = payload.quote ?? {};
  const indicators = payload.indicators ?? {};
  const stats = payload.stats ?? {};
  const sections = [];
  sections.push([
    `${payload.symbol} — ${payload.name ?? ''}`.trim(),
    `${formatMoney(quote.price, quote.currency)} (${formatSignedMoney(quote.change, quote.currency)}, ${formatSignedPct(quote.change_pct)}) · ${payload.provider ?? ''} · ${formatTimestamp(payload.as_of)}`,
    `Signal: ${summary.signal ?? '-'} (score ${formatNumber(summary.score, 2)}, confidence ${summary.confidence ?? '-'}) · trend ${summary.trend ?? '-'} · momentum ${summary.momentum ?? '-'} · volatility ${summary.volatility ?? '-'}`,
    summary.headline ? `Headline: ${summary.headline}` : '',
  ].filter(Boolean).join('\n'));
  sections.push([
    'Indicators',
    formatTable(['METRIC', 'VALUE'], [
      ['SMA 20 / 50 / 200', `${formatNumber(indicators.sma20, 2)} / ${formatNumber(indicators.sma50, 2)} / ${formatNumber(indicators.sma200, 2)}`],
      ['EMA 12 / 26', `${formatNumber(indicators.ema12, 2)} / ${formatNumber(indicators.ema26, 2)}`],
      ['RSI(14)', formatNumber(indicators.rsi14, 1)],
      ['MACD line / signal / histogram', `${formatNumber(indicators.macd?.line, 3)} / ${formatNumber(indicators.macd?.signal, 3)} / ${formatNumber(indicators.macd?.histogram, 3)}`],
      ['Bollinger upper / middle / lower', `${formatNumber(indicators.bollinger?.upper, 2)} / ${formatNumber(indicators.bollinger?.middle, 2)} / ${formatNumber(indicators.bollinger?.lower, 2)}`],
      ['ATR(14)', formatNumber(indicators.atr14, 2)],
    ]),
  ].join('\n'));
  sections.push([
    'Statistics (1 year)',
    formatTable(['METRIC', 'VALUE'], [
      ['Period return', formatSignedPct(stats.period_return_pct)],
      ['Annualized volatility', formatSignedPct(stats.annualized_volatility_pct)],
      ['Max drawdown', formatSignedPct(stats.max_drawdown_pct)],
      ['Sharpe (rf 0)', formatNumber(stats.sharpe, 2)],
      ['Win rate', formatSignedPct(stats.win_rate_pct)],
      ['52-week high / low', `${formatNumber(stats.high_52w, 2)} / ${formatNumber(stats.low_52w, 2)}`],
      ['Distance from 52-week high', formatSignedPct(stats.distance_from_52w_high_pct)],
      ['Average volume (20d)', formatCompact(stats.avg_volume_20d)],
    ]),
  ].join('\n'));
  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  if (signals.length > 0) {
    sections.push(['Signals', ...signals.map((signal) => `- [${signal.direction}] ${signal.label}: ${signal.detail ?? ''}`.trimEnd())].join('\n'));
  }
  const levels = payload.levels ?? {};
  const support = Array.isArray(levels.support) ? levels.support : [];
  const resistance = Array.isArray(levels.resistance) ? levels.resistance : [];
  const levelLines = [`Levels: support ${support.map((value) => formatNumber(value, 2)).join(', ') || '-'} · resistance ${resistance.map((value) => formatNumber(value, 2)).join(', ') || '-'}`];
  if (payload.correlation && typeof payload.correlation.value === 'number') {
    levelLines.push(`Correlation with ${payload.correlation.benchmark}: ${formatNumber(payload.correlation.value, 2)} over ${payload.correlation.window_days ?? '?'} days`);
  }
  sections.push(levelLines.join('\n'));
  if (payload.narrative) sections.push(payload.narrative);
  return sections.filter((section) => section !== '').join('\n\n');
}

/**
 * Format recent OHLCV bars.
 * @param {any} payload history response.
 * @returns {string} text table.
 */
function formatHistory(payload) {
  const bars = Array.isArray(payload?.bars) ? payload.bars : [];
  if (bars.length === 0) return `No ${payload?.range ?? ''} history for ${payload?.symbol ?? 'the symbol'}.`;
  const tail = bars.slice(-12);
  const rows = tail.map((bar) => [
    bar.t,
    formatNumber(bar.o, 2),
    formatNumber(bar.h, 2),
    formatNumber(bar.l, 2),
    formatNumber(bar.c, 2),
    formatCompact(bar.v),
  ]);
  return [
    `${payload.symbol} history · ${payload.range} · ${payload.interval} · ${payload.provider ?? ''}`,
    formatTable(['TIME', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME'], rows),
    bars.length > tail.length ? `Showing the last ${tail.length} of ${bars.length} bars.` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Format screener rows.
 * @param {any} payload screener response.
 * @returns {string} text table.
 */
function formatScreener(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const header = `Scan ${payload?.preset ?? ''} · ${payload?.scope ?? ''} · ${formatTimestamp(payload?.as_of)}`;
  if (rows.length === 0) return `${header}\nNo monitored symbol matched this preset.`;
  return [
    header,
    formatTable(['#', 'SYMBOL', 'PRICE', 'CHG%', 'RSI', 'TREND', 'SCORE'], rows.map((row, index) => [
      String(index + 1),
      row.symbol,
      formatNumber(row.price, 2),
      formatSignedPct(row.change_pct),
      formatNumber(row.rsi14, 1),
      row.trend ?? '-',
      formatNumber(row.score, 2),
    ])),
  ].join('\n');
}

/**
 * Format the watchlist.
 * @param {any} payload watchlist response.
 * @returns {string} text lines.
 */
function formatWatchlist(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return 'No symbols are followed.';
  return [`Watchlist (${items.length})`, formatTable(['#', 'SYMBOL', 'NAME', 'NOTE'], items.map((item, index) => [
    String(index + 1),
    item.symbol,
    truncate(item.name ?? '', 34),
    truncate(item.note ?? '', 30),
  ]))].join('\n');
}

/**
 * Format alert rules.
 * @param {any} payload alerts response.
 * @returns {string} text table.
 */
function formatAlerts(payload) {
  const rules = Array.isArray(payload?.rules) ? payload.rules : [];
  if (rules.length === 0) return 'No alert rules. Use alert_create to add one.';
  return [
    `Alert rules (${rules.length})`,
    formatTable(['ID', 'SYMBOL', 'KIND', 'THRESHOLD', 'STATE', 'LAST TRIGGERED', 'NOTE'], rules.map((rule) => [
      rule.id,
      rule.symbol,
      rule.kind,
      formatNumber(rule.threshold, 2),
      !rule.enabled ? 'paused' : rule.armed ? 'armed' : 'cooldown',
      rule.last_triggered_at ? formatTimestamp(rule.last_triggered_at) : 'never',
      truncate(rule.note ?? '', 24),
    ])),
  ].join('\n');
}

/**
 * Format alert events.
 * @param {any} payload events response.
 * @returns {string} text table.
 */
function formatEvents(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (events.length === 0) return 'No alert events.';
  return [
    `Alert events (${events.length})`,
    formatTable(['TIME', 'SYMBOL', 'SEVERITY', 'MESSAGE', 'ACK'], events.map((event) => [
      formatTimestamp(event.ts),
      event.symbol,
      event.severity ?? '-',
      truncate(event.message ?? '', 60),
      event.acknowledged ? 'yes' : 'no',
    ])),
  ].join('\n');
}

/**
 * Format a sync result.
 * @param {any} payload sync response.
 * @returns {string} summary text.
 */
function formatSync(payload) {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const triggered = Array.isArray(payload?.triggered) ? payload.triggered : [];
  const lines = [
    `Synced ${quotes.length} quotes at ${formatTimestamp(payload?.synced_at)} via ${payload?.provider ?? 'unknown'}${payload?.degraded ? ' (degraded)' : ''}.`,
    `${triggered.length} alert${triggered.length === 1 ? '' : 's'} triggered.`,
  ];
  for (const event of triggered) lines.push(`- ${event.symbol}: ${event.message}`);
  return lines.join('\n');
}

/**
 * Format the portfolio with totals.
 * @param {any} payload portfolio response.
 * @returns {string} text table.
 */
function formatPortfolio(payload) {
  const positions = Array.isArray(payload?.positions) ? payload.positions : [];
  const totals = payload?.totals ?? {};
  const currency = payload?.currency ?? 'USD';
  if (positions.length === 0) return 'No positions. Use position_set to record one.';
  return [
    formatTable(['SYMBOL', 'QTY', 'AVG COST', 'PRICE', 'VALUE', 'P&L', 'P&L%', 'WEIGHT'], positions.map((position) => [
      position.symbol,
      formatNumber(position.quantity, 4),
      formatNumber(position.avg_cost, 2),
      formatNumber(position.price, 2),
      formatNumber(position.market_value, 2),
      formatSignedMoney(position.unrealized_pnl, currency),
      formatSignedPct(position.unrealized_pnl_pct),
      formatSignedPct(position.weight_pct),
    ])),
    `Totals: value ${formatMoney(totals.market_value, currency)} · cost ${formatMoney(totals.cost_basis, currency)} · P&L ${formatSignedMoney(totals.unrealized_pnl, currency)} (${formatSignedPct(totals.unrealized_pnl_pct)}) · day ${formatSignedMoney(totals.day_change, currency)} (${formatSignedPct(totals.day_change_pct)})`,
  ].join('\n');
}

/**
 * Format engine settings.
 * @param {any} settings settings payload.
 * @returns {string} key/value lines.
 */
function formatSettings(settings) {
  if (!settings || typeof settings !== 'object') return 'No settings returned.';
  return [
    'Engine settings',
    `provider: ${settings.provider}`,
    `poll_seconds: ${settings.poll_seconds}`,
    `benchmark: ${settings.benchmark}`,
    `base_currency: ${settings.base_currency}`,
  ].join('\n');
}

/**
 * Format collection-layer status and coverage.
 * @param {any} payload data status response.
 * @param {any} coveragePayload data coverage response.
 * @returns {string} summary text.
 */
function formatDataStatus(payload, coveragePayload) {
  const coverage = coveragePayload?.domains ?? {};
  const reference = coverage.reference ?? {};
  const market = coverage.market ?? {};
  const news = coverage.news ?? {};
  const index = coverage.index ?? {};
  const tracked = payload?.tracked ?? coveragePayload?.tracked ?? {};
  const lines = [
    `Data collection · ${payload?.enabled ? 'enabled' : 'disabled'} · schema v${payload?.schema_version ?? '?'} · running ${payload?.running ? 'yes' : 'no'}`,
    '',
    'Coverage',
    formatTable(['DOMAIN', 'METRIC', 'VALUE'], [
      ['reference', 'exchanges', String(reference.exchanges ?? 0)],
      ['reference', 'instruments', String(reference.instruments ?? 0)],
      ['reference', 'indices', String(reference.indices ?? 0)],
      ['reference', 'commodity roots', String(reference.commodity_roots ?? 0)],
      ['market', 'stored bars', String(market.bars ?? 0)],
      ['market', 'latest quotes', String(market.series ?? 0)],
      ['news', 'articles', String(news.articles ?? 0)],
      ['news', 'entity links', String(news.entity_links ?? 0)],
      ['index', 'indexed entries', String(index.entries ?? 0)],
      ['index', 'pending profiles', String(index.pending_profiles ?? 0)],
      ['index', 'change log rows', String(index.changes ?? 0)],
    ]),
    `Tracked series: live ${tracked.live ?? 0} · EOD ${tracked.eod ?? 0} · indices ${tracked.indices ?? 0} · commodities ${tracked.commodities ?? 0}`,
  ];
  const storage = payload?.storage;
  if (storage?.platform) {
    lines.push(`Storage: ${storage.platform} · ${storage.paths?.data_dir ?? '?'} · SQLite ${storage.sqlite ?? '?'}`);
  }
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  if (jobs.length > 0) {
    lines.push('', 'Jobs', formatTable(['JOB', 'LAST', 'NEXT DUE', 'STATUS'], jobs.map((job) => [
      job.job_id,
      formatTimestamp(job.last_run_at),
      formatTimestamp(job.next_due_at),
      job.last_status ?? (job.due ? 'due' : 'idle'),
    ])));
  }
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  if (sources.length > 0) {
    lines.push('', 'Sources', formatTable(['SOURCE', 'DAY', 'HOUR', 'STATE'], sources.map((source) => [
      source.source_id,
      `${source.used_day ?? 0}/${source.max_per_day ?? 0}`,
      `${source.used_hour ?? 0}/${source.max_per_hour ?? 0}`,
      source.circuit_open_in_s > 0
        ? `circuit ${Math.ceil(source.circuit_open_in_s)}s`
        : source.last_error
          ? 'error'
          : 'ok',
    ])));
  }
  return lines.join('\n');
}

/**
 * Format the index registry with entry stats.
 * @param {any} payload index overview response.
 * @returns {string} summary text.
 */
function formatIndexStatus(payload) {
  const indices = Array.isArray(payload?.indices) ? payload.indices : [];
  if (indices.length === 0) {
    return 'No index is registered yet. Run index_refresh for company:master to build the first one.';
  }
  const lines = [`Indexes (${indices.length})`];
  for (const index of indices) {
    const stats = index.stats ?? {};
    lines.push(`${index.index_id} · ${index.kind ?? 'generic'} · revision ${index.revision ?? 0} · job ${index.refresh_job ?? '-'}`);
    lines.push(`  entries ${stats.total ?? 0} · active ${stats.active ?? 0} · missing ${stats.missing ?? 0} · delisted ${stats.delisted ?? 0} · pending profiles ${stats.pending_profiles ?? 0}`);
    const markets = Object.entries(stats.by_market ?? {}).slice(0, 8).map(([mic, count]) => `${mic} ${count}`);
    if (markets.length > 0) lines.push(`  markets: ${markets.join(' · ')}`);
    const refresh = (index.refreshes ?? [])[0];
    if (refresh) {
      lines.push(`  last refresh ${formatTimestamp(refresh.finished_at)} · ${refresh.status ?? 'ok'} · +${refresh.added ?? 0} / ~${refresh.updated ?? 0} / -${refresh.removed ?? 0} / ${refresh.delisted ?? 0} delisted`);
    }
  }
  return lines.join('\n');
}

/**
 * Format one page of index entries.
 * @param {any} payload index entries response.
 * @returns {string} table text.
 */
function formatIndexEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length === 0) return 'No index entry matched the filter.';
  return [
    `Index entries (${entries.length} of ${payload?.total ?? entries.length})`,
    formatTable(['ENTITY', 'MARKET', 'STATUS', 'PROFILE', 'NAME', 'CIK'], entries.map((entry) => [
      entry.entity_id,
      entry.market ?? '-',
      entry.status ?? '-',
      entry.profile_status ?? '-',
      truncate(entry.payload?.name ?? '-', 34),
      entry.payload?.provider_ids?.sec_cik ?? '-',
    ])),
  ].join('\n');
}

/**
 * Format recent index change-log rows.
 * @param {any} payload index changes response.
 * @returns {string} table text.
 */
function formatIndexChanges(payload) {
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  if (changes.length === 0) return 'No index changes recorded yet.';
  return [
    `Index changes (${changes.length})`,
    formatTable(['CHANGE', 'ENTITY', 'MARKET', 'FIELDS', 'WHEN'], changes.map((change) => [
      change.change_type ?? '-',
      change.entity_id ?? change.entry_key ?? '-',
      change.market ?? '-',
      (change.changed_fields ?? []).slice(0, 3).join(', ') || '-',
      formatTimestamp(change.observed_at),
    ])),
  ].join('\n');
}

/**
 * Format an index refresh result.
 * @param {any} payload index refresh response.
 * @returns {string} summary text.
 */
function formatIndexRefresh(payload) {
  const result = payload?.result ?? {};
  const details = result.details ?? {};
  const counts = details.counts ?? details;
  if (result.status === 'error') return `Index refresh failed: ${result.error ?? 'unknown error'}`;
  const lines = [
    `Index refresh · ${payload?.index_id ?? '?'} · ${result.status ?? 'ok'}${payload?.dry_run ? ' (dry run)' : ''}`,
    `  seen ${counts.entries_seen ?? details.entries_seen ?? 0} · added ${counts.added ?? 0} · updated ${counts.updated ?? 0} · restored ${counts.restored ?? 0} · removed ${counts.removed ?? 0} · delisted ${counts.delisted ?? 0}`,
  ];
  const projection = details.projection ?? {};
  if (Object.keys(projection).length > 0) {
    lines.push(`  projection: ${Object.entries(projection).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  }
  const sources = details.sources ?? {};
  const sourceRows = Object.entries(sources).map(([name, state]) => `${name}: ${state?.status ?? '?'}`);
  if (sourceRows.length > 0) lines.push(`  sources: ${sourceRows.join(' · ')}`);
  return lines.join('\n');
}

/**
 * Format one company index entry and its collected profile.
 * @param {any} payload company profile response.
 * @returns {string} summary text.
 */
function formatCompanyProfile(payload) {
  const entry = payload?.entry ?? {};
  const profile = payload?.profile;
  const name = profile?.legal_name || entry.payload?.name || entry.entity_id;
  const lines = [
    `${name} · ${entry.entity_id ?? '?'} · ${entry.market ?? '?'} · ${entry.status ?? '?'}`,
    `Index: revision ${entry.revision ?? '-'} · profile ${entry.profile_status ?? '-'} · first seen ${formatTimestamp(entry.first_seen_at)} · last seen ${formatTimestamp(entry.last_seen_at)}`,
  ];
  if (entry.payload?.provider_ids?.sec_cik) lines.push(`SEC CIK: ${entry.payload.provider_ids.sec_cik}`);
  if (!profile) {
    lines.push('No profile collected yet; the company:profile job enriches pending entries.');
    return lines.join('\n');
  }
  const rows = [
    ['legal name', profile.legal_name || '-'],
    ['SIC', profile.sic ? `${profile.sic} ${profile.sic_description ?? ''}`.trim() : '-'],
    ['state', profile.state_of_incorporation || '-'],
    ['fiscal year end', profile.fiscal_year_end || '-'],
    ['tickers', (profile.tickers ?? []).join(', ') || '-'],
    ['exchanges', (profile.exchanges ?? []).join(', ') || '-'],
    ['former names', (profile.former_names ?? []).map((item) => (typeof item === 'string' ? item : item?.name ?? '')).filter(Boolean).slice(0, 3).join(', ') || '-'],
    ['address', profile.address || '-'],
    ['source', profile.source_id || '-'],
    ['fetched', formatTimestamp(profile.fetched_at)],
  ];
  lines.push(formatTable(['PROFILE', 'VALUE'], rows));
  return lines.join('\n');
}

/**
 * Format the China market overview.
 * @param {any} payload China overview response.
 * @param {'stocks'|'funds'|'commodities'} [focus] optional section to emphasize.
 * @returns {string} summary text.
 */
function formatChinaStatus(payload, focus) {
  const securities = payload?.securities ?? {};
  const commodities = payload?.commodities ?? {};
  const securityStats = securities.stats ?? {};
  const commodityStats = commodities.stats ?? {};
  const lastRefresh = (securities.refreshes ?? [])[0] ?? (commodities.refreshes ?? [])[0];
  const lines = [
    `China market · securities ${securityStats.active ?? 0} active (awaiting index) · commodity roots ${commodityStats.active ?? 0}`
      .replace(' (awaiting index)', securities.ready ? '' : ' (index not built yet)'),
  ];
  if (lastRefresh) {
    lines.push(`Last index refresh ${formatTimestamp(lastRefresh.finished_at)} · ${lastRefresh.status ?? 'ok'}`);
  }
  const sections = [];
  if (!focus || focus === 'stocks') sections.push(['Top stocks', payload?.top_stocks, 'stock']);
  if (!focus || focus === 'funds') sections.push(['Top funds / ETFs', payload?.top_funds, 'fund']);
  if (!focus || focus === 'commodities') sections.push(['Commodity futures', payload?.top_commodities, 'commodity']);
  for (const [title, rows, kind] of sections) {
    const list = Array.isArray(rows) ? rows : [];
    lines.push('', title);
    if (list.length === 0) {
      lines.push('  no persisted quotes yet — run a collection cycle or index_refresh for china:securities');
      continue;
    }
    if (kind === 'commodity') {
      lines.push(formatTable(['SYMBOL', 'VENUE', 'NAME', 'PRICE', 'CHG%', 'AS OF'], list.map((row) => [
        row.symbol ?? row.root_id,
        row.venue ?? '-',
        truncate(row.name ?? '-', 30),
        formatMoney(row.price, row.currency ?? 'CNY'),
        formatSignedPct(row.change_pct),
        formatTimestamp(row.as_of),
      ])));
    } else {
      lines.push(formatTable(['SYMBOL', 'MARKET', 'NAME', 'PRICE', 'CHG%', 'MKT CAP'], list.map((row) => [
        row.symbol ?? '-',
        row.market ?? '-',
        truncate(row.name ?? '-', 30),
        formatMoney(row.price, row.currency ?? 'CNY'),
        formatSignedPct(row.change_pct),
        row.market_cap ? formatCompact(Number(row.market_cap)) : '-',
      ])));
    }
  }
  return lines.join('\n');
}

/**
 * Format the recent-window backfill coverage summary.
 * @param {any} payload data/backfill response.
 * @returns {string} summary text.
 */
function formatBackfillStatus(payload) {
  const window = payload?.window ?? {};
  const job = payload?.job ?? {};
  const needs = Array.isArray(payload?.needs) ? payload.needs : [];
  const lines = [
    `Recent backfill · last ${window.days ?? '?'} days (${window.start ?? '?'} → ${window.end ?? '?'})`,
    `Universe ${payload?.universe ?? 0} · adequate ${payload?.adequate ?? 0} · needs fill ${payload?.needs_fill ?? 0}`,
  ];
  if (job.last_run_at) {
    lines.push(`Job last run ${formatTimestamp(job.last_run_at)} · ${job.last_status ?? '?'} · next ${formatTimestamp(job.next_due_at)}`);
  } else {
    lines.push('Background job has not run yet; it runs every 10 minutes.');
  }
  if (needs.length > 0) {
    lines.push('', 'Series needing recent bars');
    lines.push(formatTable(['SERIES', 'KIND', 'SYMBOL', 'BARS', 'LATEST'], needs.slice(0, 15).map((row) => [
      row.series_id,
      row.kind ?? '-',
      row.provider_symbol ?? '-',
      String(row.bars_in_window ?? 0),
      formatTimestamp(row.latest_bar),
    ])));
  }
  const annual = payload?.annual ?? {};
  if (annual.window) {
    const annualJob = annual.job ?? {};
    lines.push(
      '',
      `Annual watchlist backfill · last ${annual.window.days ?? '?'} days (${annual.window.start ?? '?'} → ${annual.window.end ?? '?'})`,
      `Watched companies ${annual.watched_companies ?? 0} · adequate ${annual.adequate ?? 0} · needs fill ${annual.needs_fill ?? 0} · target ${annual.target_bars ?? 0} real daily bars`,
    );
    if (annualJob.last_run_at) {
      lines.push(`Annual job · ${formatTimestamp(annualJob.last_run_at)} · ${annualJob.last_status ?? '?'} · next ${formatTimestamp(annualJob.next_due_at)}`);
    } else {
      lines.push('Annual job has not run yet; it runs every 30 minutes.');
    }
    const annualNeeds = Array.isArray(annual.needs) ? annual.needs : [];
    if (annualNeeds.length > 0) {
      lines.push(formatTable(['SERIES', 'SYMBOL', 'BARS'], annualNeeds.slice(0, 15).map((row) => [
        row.series_id,
        row.provider_symbol ?? '-',
        String(row.bars_in_window ?? 0),
      ])));
    }
  }
  return lines.join('\n');
}

/**
 * Format an ingestion run or dry-run plan.
 * @param {any} payload ingest response.
 * @returns {string} summary text.
 */
function formatIngest(payload) {
  if (payload?.dry_run) {
    const planned = Array.isArray(payload?.planned) ? payload.planned : [];
    if (planned.length === 0) return 'No collection jobs are registered.';
    return [
      `Dry run: ${planned.length} job${planned.length === 1 ? '' : 's'} planned, no source contacted.`,
      formatTable(['JOB', 'DUE', 'SOURCES'], planned.map((job) => [
        job.job_id,
        job.due ? 'yes' : 'no',
        (job.sources ?? []).join(', ') || '-',
      ])),
    ].join('\n');
  }
  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (results.length === 0) return 'No collection job was due. Use job_id to force one.';
  const lines = [
    `Collection finished: ${results.length} job${results.length === 1 ? '' : 's'} run.`,
    formatTable(['JOB', 'STATUS', 'REQ', 'STORED', 'UPDATED', 'SKIPPED', 'ERROR'], results.map((result) => [
      result.job_id,
      result.status,
      String(result.requests ?? 0),
      String(result.stored ?? 0),
      String(result.updated ?? 0),
      String(result.skipped ?? 0),
      truncate(result.error ?? '', 40) || '-',
    ])),
  ];
  for (const result of results) {
    const quotes = result.details?.quotes;
    if (Array.isArray(quotes) && quotes.length > 0) {
      lines.push(`- ${result.job_id}: ${quotes.length} quotes refreshed (${quotes.slice(0, 3).map((quote) => quote.series_id).join(', ')}…)`);
    }
  }
  return lines.join('\n');
}

/**
 * Format stored news articles and their entity links.
 * @param {any} payload news response.
 * @returns {string} text feed.
 */
function formatNews(payload) {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  if (articles.length === 0) {
    const total = Number(payload?.total_articles ?? 0);
    if (total > 0) {
      return `No stored article is linked to this entity yet (${total} articles collected in total). News linking runs every 15 minutes.`;
    }
    return 'No stored news yet. Request a collection cycle with data_ingest to collect from the approved feeds.';
  }
  const lines = [`News (${articles.length})`];
  for (const article of articles.slice(0, 20)) {
    lines.push(`${formatTimestamp(article.publish_time ?? article.published_at)} · ${article.source_id}`);
    lines.push(`  ${article.title}`);
    const content = typeof article.content === 'string' ? article.content.replace(/\s+/g, ' ').trim() : '';
    if (content) lines.push(`  ${truncate(content, 180)}`);
    const entities = Array.isArray(article.entities) ? article.entities : [];
    if (entities.length > 0) {
      const labels = entities.slice(0, 6).map((entity) => {
        const symbol = entity.symbol ? ` ${entity.symbol}` : '';
        return `[${entity.entity_id}${symbol}]`;
      });
      lines.push(`  ${labels.join(' ')}`);
    }
  }
  if (articles.length > 20) lines.push(`… ${articles.length - 20} more articles`);
  return lines.join('\n');
}

/**
 * Format canonical instrument reference rows.
 * @param {any} payload instruments response.
 * @returns {string} table text.
 */
function formatInstruments(payload) {
  const items = Array.isArray(payload?.instruments) ? payload.instruments : [];
  if (items.length === 0) return 'No instrument matched the query.';
  return [
    `Instruments (${items.length} of ${payload?.total ?? items.length})`,
    formatTable(['SYMBOL', 'MIC', 'NAME', 'TYPE', 'SECTOR'], items.map((item) => [
      item.symbol,
      item.mic,
      truncate(item.name ?? '', 34),
      item.type ?? '-',
      truncate(item.sector ?? '', 22),
    ])),
  ].join('\n');
}

/**
 * Format canonical index reference rows.
 * @param {any} payload indices response.
 * @returns {string} table text.
 */
function formatIndices(payload) {
  const items = Array.isArray(payload?.indices) ? payload.indices : [];
  if (items.length === 0) return 'No index matched the query.';
  return [
    `Indices (${items.length})`,
    formatTable(['CODE', 'NAME', 'REGION', 'PROVIDER'], items.map((item) => [
      item.code,
      truncate(item.name ?? '', 36),
      item.region ?? '-',
      item.provider_symbol ?? '-',
    ])),
  ].join('\n');
}

/**
 * Format commodity roots and contract count.
 * @param {any} payload commodities response.
 * @returns {string} table text.
 */
function formatCommodities(payload) {
  const roots = Array.isArray(payload?.roots) ? payload.roots : [];
  const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
  if (roots.length === 0) return 'No commodity roots stored yet. Run data_ingest for reference:seed.';
  return [
    `Commodities (${roots.length} roots, ${contracts.length} contracts)`,
    formatTable(['VENUE', 'ROOT', 'NAME', 'CATEGORY', 'UNIT', 'PROVIDER'], roots.map((root) => [
      root.venue,
      root.root,
      truncate(root.name ?? '', 26),
      root.category ?? '-',
      truncate(root.unit ?? '', 16),
      root.provider_symbol || '-',
    ])),
  ].join('\n');
}

/**
 * Format canonical stored bars for one series.
 * @param {any} payload series bars response.
 * @returns {string} table text.
 */
function formatSeriesBars(payload) {
  const bars = Array.isArray(payload?.bars) ? payload.bars : [];
  if (bars.length === 0) return 'No stored bars for this series.';
  return [
    `${payload.series_id} · ${payload.interval} · ${bars.length} bars`,
    formatTable(['TIME', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'QUALITY'], bars.map((bar) => [
      bar.t,
      formatNumber(bar.o, 2),
      formatNumber(bar.h, 2),
      formatNumber(bar.l, 2),
      formatNumber(bar.c, 2),
      formatCompact(bar.v),
      bar.quality ?? '-',
    ])),
  ].join('\n');
}

/* -------------------------------------------------------------------- utils */

/**
 * Render an aligned text table.
 * @param {string[]} headers column headers.
 * @param {string[][]} rows cell values.
 * @returns {string} table text.
 */
export function formatTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => String(row[index] ?? '').length),
  ));
  const line = (cells) => cells
    .map((cell, index) => {
      const text = String(cell ?? '');
      return index === 0 ? text.padEnd(widths[index]) : text.padStart(widths[index]);
    })
    .join('  ');
  return [line(headers), ...rows.map(line)].join('\n');
}

/**
 * Require a symbol for actions that need one.
 * @param {Record<string, unknown>} args tool arguments.
 * @param {string} action current action.
 * @returns {string} the symbol.
 */
function requireSymbol(args, action) {
  const needsSymbol = [
    'analyze', 'history', 'watch', 'unwatch', 'alert_create', 'position_set', 'position_delete', 'collect_bars',
  ].includes(action);
  if (!needsSymbol) return typeof args.symbol === 'string' ? args.symbol.trim() : '';
  return requireString(args.symbol, `symbol is required for ${action}`).toUpperCase();
}

/**
 * Require a non-empty string argument.
 * @param {unknown} value candidate value.
 * @param {string} message error message when absent.
 * @returns {string} the trimmed value.
 */
function requireString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new SidecarError('invalid_argument', message);
  return value.trim();
}

/**
 * Require a finite number.
 * @param {unknown} value candidate value.
 * @param {string} message error message when invalid.
 * @returns {number} the number.
 */
function finiteNumber(value, message) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(number)) throw new SidecarError('invalid_argument', message);
  return number;
}

/**
 * Normalize the range argument.
 * @param {Record<string, unknown>} args tool arguments.
 * @returns {string} one of RANGES.
 */
function rangeOf(args) {
  return typeof args.range === 'string' && RANGES.includes(args.range) ? args.range : '1D';
}

/**
 * Normalize the preset argument.
 * @param {Record<string, unknown>} args tool arguments.
 * @returns {string} one of PRESETS.
 */
function presetOf(args) {
  return typeof args.preset === 'string' && PRESETS.includes(args.preset) ? args.preset : 'gainers';
}

/**
 * Normalize the alert kind argument.
 * @param {Record<string, unknown>} args tool arguments.
 * @returns {string} one of ALERT_KINDS.
 */
function alertKindOf(args) {
  if (typeof args.kind !== 'string' || !ALERT_KINDS.includes(args.kind)) {
    throw new SidecarError('invalid_argument', `kind must be one of ${ALERT_KINDS.join(', ')}.`);
  }
  return args.kind;
}

/**
 * Normalize the index id argument.
 * @param {Record<string, unknown>} args tool arguments.
 * @returns {string} an index id or the company master default.
 */
function indexIdOf(args) {
  return typeof args.index_id === 'string' && args.index_id.trim() !== ''
    ? args.index_id.trim()
    : 'company:master';
}

/**
 * Normalize a row limit.
 * @param {Record<string, unknown>} args tool arguments.
 * @param {number} fallback default when absent.
 * @returns {number} clamped limit.
 */
function limitOf(args, fallback) {
  const raw = args.limit;
  const numeric = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : Number.NaN;
  const value = Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  return Math.max(1, Math.min(50, value));
}

/**
 * Describe one alert rule on one line.
 * @param {any} rule alert rule.
 * @returns {string} description.
 */
function describeRule(rule) {
  if (!rule) return 'unknown rule';
  if (rule.kind === 'ma_cross') {
    const params = rule.params ?? {};
    return `${params.direction ?? 'golden'} cross of SMA${params.fast ?? 20}/SMA${params.slow ?? 50}`;
  }
  if (rule.kind === 'volume_spike') return `volume at ${rule.threshold}x the 20-day average`;
  if (rule.kind === 'price_above') return `price at or above ${rule.threshold}`;
  if (rule.kind === 'price_below') return `price at or below ${rule.threshold}`;
  if (rule.kind === 'change_pct_above') return `day change at or above ${rule.threshold}%`;
  if (rule.kind === 'change_pct_below') return `day change at or below ${rule.threshold}%`;
  if (rule.kind === 'rsi_above') return `RSI(14) at or above ${rule.threshold}`;
  if (rule.kind === 'rsi_below') return `RSI(14) at or below ${rule.threshold}`;
  return `${rule.kind} ${rule.threshold}`;
}

/**
 * Format a money value.
 * @param {unknown} value number.
 * @param {string} [currency] ISO currency.
 * @returns {string} formatted money.
 */
function formatMoney(value, currency = 'USD') {
  if (!Number.isFinite(value)) return '-';
  const number = Number(value);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  const abs = Math.abs(number);
  if (abs >= 1000) return `${symbol}${number.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  return `${symbol}${number.toFixed(2)}`;
}

/**
 * Format a signed money value.
 * @param {unknown} value number.
 * @param {string} [currency] ISO currency.
 * @returns {string} formatted money with sign.
 */
function formatSignedMoney(value, currency = 'USD') {
  if (!Number.isFinite(value)) return '-';
  const number = Number(value);
  return `${number >= 0 ? '+' : '-'}${formatMoney(Math.abs(number), currency)}`;
}

/**
 * Format a signed percentage that is already scaled by 100.
 * @param {unknown} value number.
 * @returns {string} formatted percentage.
 */
function formatSignedPct(value) {
  if (!Number.isFinite(value)) return '-';
  const number = Number(value);
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

/**
 * Format a fixed-precision number.
 * @param {unknown} value number.
 * @param {number} digits fraction digits.
 * @returns {string} formatted number or `-`.
 */
function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '-';
}

/**
 * Format a large count compactly.
 * @param {unknown} value number.
 * @returns {string} compact number or `-`.
 */
function formatCompact(value) {
  if (!Number.isFinite(value)) return '-';
  const number = Number(value);
  if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (Math.abs(number) >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return number.toFixed(0);
}

/**
 * Format an ISO timestamp for humans.
 * @param {unknown} value ISO timestamp.
 * @returns {string} `YYYY-MM-DD HH:MM` or `-`.
 */
function formatTimestamp(value) {
  if (typeof value !== 'string' || value === '') return '-';
  return value.replace('T', ' ').replace('Z', '').slice(0, 16);
}

/**
 * Truncate text with an ellipsis.
 * @param {string} value text.
 * @param {number} length maximum length.
 * @returns {string} truncated text.
 */
function truncate(value, length) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}…`;
}
