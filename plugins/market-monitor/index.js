/**
 * Market Monitor host half.
 *
 * Owns one Python sidecar (the financial engine), proxies the browser to it
 * under `/market-monitor/api`, and exposes the same operations to the agent
 * through the `market_monitor` tool and the `/market` command. It contains no
 * financial logic; every operation is a call into the Python API.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MarketSidecar,
  SidecarError,
  resolveDataDir,
  shortError,
} from './src/host/sidecar.js';
import { API_PREFIX, createApiHandler } from './src/host/proxy.js';
import { ACTIONS, createMarketTool, runAction } from './src/host/tool.js';

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS = ['auto', 'yahoo'];

export const name = 'market-monitor';
export const inject = ['webServer'];

/**
 * Plugin entry point.
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context.
 * @param {unknown} rawConfig row configuration from `cordis.patch.yml`.
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const sidecar = new MarketSidecar({
    pluginRoot: PLUGIN_ROOT,
    dataDir: resolveDataDir(config.dataDir),
    pythonPath: config.pythonPath,
    provider: config.provider,
    pollSeconds: config.pollSeconds,
    benchmark: config.benchmark,
    dataCollect: config.dataCollect,
    port: config.port,
    log: (line) => console.log(`[market-monitor] ${line}`),
  });

  // Start eagerly so alerts keep evaluating even while the panel is closed.
  ctx.effect(
    () => {
      void sidecar.ensureStarted().catch((error) => {
        console.warn(`[market-monitor] sidecar unavailable: ${shortError(error)}`);
      });
      return () => {
        void sidecar.stop().catch((error) => {
          console.warn(`[market-monitor] could not stop the sidecar: ${shortError(error)}`);
        });
      };
    },
    'market-monitor: python sidecar',
  );

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: createApiHandler(sidecar, config, PLUGIN_ROOT),
    }),
    `market-monitor: ${API_PREFIX}`,
  );

  ctx.inject(['tools'], (toolsCtx) => {
    const tool = createMarketTool({
      call: (method, apiPath, body) => sidecar.request(method, apiPath, body),
    });
    ctx.effect(() => toolsCtx.tools.register(tool), 'market-monitor: agent tool');
  });

  ctx.inject(['commands'], (commandsCtx) => {
    ctx.effect(
      () => commandsCtx.commands.register({
        name: 'market',
        description: 'Read and change Market monitor data. Usage: /market [snapshot|analyze SYMBOL|history SYMBOL RANGE|scan PRESET|watchlist|watch SYMBOL|unwatch SYMBOL|alerts|alert-add SYMBOL KIND [VALUE|golden|death]|alert-del ID|events [new] [LIMIT]|ack|sync|portfolio|settings|provider MODE|data|ingest [JOB]|news [SYMBOL]|instruments [SEARCH]|indices [SEARCH]|commodities|index|companies [MARKET]|index-changes|index-refresh|china|china-stocks|china-funds|china-commodities|backfill]',
        input: { hint: '[snapshot|analyze SYMBOL|history SYMBOL RANGE|scan PRESET|watch SYMBOL|alerts|events [new]|data|news|ingest|index|companies|china|backfill|portfolio|settings]' },
        handler: async ({ rawInput }) => {
          try {
            const text = await runCommandText(sidecar, String(rawInput ?? ''));
            return { kind: 'success', text };
          } catch (error) {
            return { kind: 'error', text: shortError(error) };
          }
        },
      }),
      'market-monitor: /market command',
    );
  });
}

/**
 * Normalize the patch configuration into validated options.
 * @param {unknown} rawConfig user configuration.
 * @returns {object} normalized options.
 */
function normalizeConfig(rawConfig) {
  const input = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {};
  const pollSecondsRaw = Number(input.pollSeconds);
  const pollSeconds = Number.isFinite(pollSecondsRaw)
    ? Math.max(5, Math.min(3600, Math.round(pollSecondsRaw)))
    : 15;
  const portRaw = Number(input.port);
  const port = Number.isInteger(portRaw) && portRaw >= 0 && portRaw <= 65535 ? portRaw : 0;
  const provider = typeof input.provider === 'string' && PROVIDERS.includes(input.provider)
    ? input.provider
    : 'auto';
  return {
    pythonPath: typeof input.pythonPath === 'string' ? input.pythonPath : '',
    dataDir: typeof input.dataDir === 'string' ? input.dataDir : '',
    provider,
    pollSeconds,
    benchmark: typeof input.benchmark === 'string' && input.benchmark.trim() !== ''
      ? input.benchmark.trim().toUpperCase()
      : '^GSPC',
    dataCollect: input.dataCollect !== false,
    port,
  };
}


/**
 * Translate one `/market` command line into an action and format its result.
 * @param {MarketSidecar} sidecar sidecar manager.
 * @param {string} rawInput text after `/market`.
 * @returns {Promise<string>} command output text.
 */
async function runCommandText(sidecar, rawInput) {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  const verb = tokens[0] ?? '';
  const rest = tokens.slice(1);
  const call = (method, apiPath, body) => sidecar.request(method, apiPath, body);
  let args;
  switch (verb) {
    case '':
    case 'help':
      return [
        'Market monitor commands:',
        '  /market snapshot',
        '  /market analyze AAPL',
        '  /market history AAPL 3M',
        '  /market scan momentum',
        '  /market watchlist | watch AAPL | unwatch AAPL',
        '  /market alerts | alert-add AAPL price_above 250 | alert-add AAPL ma_cross death | alert-del <id>',
        '  /market events [new] [limit] | ack',
        '  /market sync | portfolio | settings',
        '  /market provider auto|yahoo',
        '',
        'Data collection:',
        '  /market data',
        '  /market ingest [job-id]',
        '  /market news [SYMBOL]',
        '  /market instruments [SEARCH]',
        '  /market indices [SEARCH] | commodities',
        '',
        'Company index (updatable tracking index):',
        '  /market index',
        '  /market companies [MARKET]',
        '  /market index-changes [INDEX_ID]',
        '  /market index-refresh [INDEX_ID]',
        '  /market profile ENTITY_ID',
        '',
        'China market:',
        '  /market china',
        '  /market china-stocks | china-funds | china-commodities',
        '',
        'Recent-history backfill:',
        '  /market backfill',
        '  /market ingest backfill:recent',
      ].join('\n');
    case 'snapshot':
      args = { action: 'snapshot' };
      break;
    case 'analyze':
      args = { action: 'analyze', symbol: rest[0] };
      break;
    case 'history':
      args = { action: 'history', symbol: rest[0], range: rest[1] };
      break;
    case 'scan':
      args = { action: 'scan', preset: rest[0], limit: rest[1] };
      break;
    case 'watch':
    case 'unwatch':
      args = { action: verb, symbol: rest[0] };
      break;
    case 'watchlist':
      args = { action: 'watchlist' };
      break;
    case 'alerts':
      args = { action: 'alerts' };
      break;
    case 'alert-add': {
      const kind = rest[1];
      const third = rest[2];
      args = {
        action: 'alert_create',
        symbol: rest[0],
        kind,
        ...(kind === 'ma_cross'
          ? { direction: third === 'death' ? 'death' : 'golden' }
          : { threshold: third }),
      };
      break;
    }
    case 'alert-del':
      args = { action: 'alert_delete', rule_id: rest[0] };
      break;
    case 'events': {
      const wantsNew = rest.includes('new');
      const limitToken = rest.find((token) => /^\d+$/.test(token));
      args = {
        action: 'events',
        ...(limitToken ? { limit: limitToken } : {}),
        ...(wantsNew ? { acknowledged: false } : {}),
      };
      break;
    }
    case 'ack':
      args = rest.length > 0 ? { action: 'ack', ids: rest } : { action: 'ack', acknowledge_all: true };
      break;
    case 'sync':
      args = { action: 'sync' };
      break;
    case 'portfolio':
      args = { action: 'portfolio' };
      break;
    case 'settings':
      args = { action: 'settings' };
      break;
    case 'provider':
      args = { action: 'settings_update', provider: rest[0] };
      break;
    case 'data':
      args = { action: 'data_status' };
      break;
    case 'ingest':
      args = { action: 'data_ingest', ...(rest[0] ? { job_id: rest[0] } : {}) };
      break;
    case 'news':
      args = { action: 'news', ...(rest[0] ? { symbol: rest[0] } : {}) };
      break;
    case 'instruments':
      args = { action: 'instruments', ...(rest.length > 0 ? { q: rest.join(' ') } : {}) };
      break;
    case 'indices':
      args = { action: 'indices', ...(rest.length > 0 ? { q: rest.join(' ') } : {}) };
      break;
    case 'commodities':
      args = { action: 'commodities' };
      break;
    case 'index':
      args = { action: 'index_status' };
      break;
    case 'companies':
      args = {
        action: 'index_entries',
        ...(rest[0] ? { market: rest[0] } : {}),
      };
      break;
    case 'index-changes':
      args = { action: 'index_changes', ...(rest[0] ? { index_id: rest[0] } : {}) };
      break;
    case 'index-refresh':
      args = { action: 'index_refresh', ...(rest[0] ? { index_id: rest[0] } : {}) };
      break;
    case 'profile':
      args = { action: 'company_profile', entity_id: rest[0] };
      break;
    case 'china':
      args = { action: 'china_status' };
      break;
    case 'china-stocks':
      args = { action: 'china_stocks' };
      break;
    case 'china-funds':
      args = { action: 'china_funds' };
      break;
    case 'china-commodities':
      args = { action: 'china_commodities' };
      break;
    case 'backfill':
      args = { action: 'backfill_status' };
      break;
    default:
      throw new SidecarError(
        'invalid_argument',
        `Unknown /market command "${verb}". Try /market help. ACTIONS: ${ACTIONS.join(', ')}.`,
      );
  }
  return runAction(call, args);
}
