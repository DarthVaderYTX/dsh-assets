/**
 * Integration test for the Python sidecar transport. Skipped when the Python
 * engine is not present (for example in a checkout that only carries the JS
 * half); otherwise it starts the real engine, exercises the API through the
 * same manager the plugin uses, and verifies teardown removes the discovery
 * file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MarketSidecar, resolveDataDir } from '../src/host/sidecar.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const PYTHON_ENTRY = path.join(PLUGIN_ROOT, 'python', 'market_monitor', 'server.py');
const HAS_ENGINE = existsSync(PYTHON_ENTRY);

test('resolveDataDir honors explicit configuration and DSH_HOME', () => {
  const dshHome = path.join(os.tmpdir(), 'dsh home with spaces');
  assert.equal(resolveDataDir('', { DSH_HOME: dshHome }), path.resolve(dshHome, 'market-monitor'));
  const explicit = path.join(os.tmpdir(), 'market monitor data', '中文 目录');
  assert.equal(resolveDataDir(explicit, { DSH_HOME: dshHome }), path.resolve(explicit));
  assert.equal(resolveDataDir(path.join('~', 'mm data'), {}), path.join(os.homedir(), 'mm data'));
  const fallback = resolveDataDir('', {});
  assert.match(fallback, /market-monitor$/);
});

test('the real engine answers the monitoring API', { skip: !HAS_ENGINE, timeout: 180000 }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'market-monitor-sidecar-'));
  const sidecar = new MarketSidecar({
    pluginRoot: PLUGIN_ROOT,
    dataDir,
    provider: 'synthetic',
    pollSeconds: 15,
    benchmark: '^GSPC',
    dataCollect: false,
    log: () => {},
  });
  try {
    await sidecar.ensureStarted();
    assert.equal(sidecar.status().state, 'ready');
    assert.ok(sidecar.status().port > 0);

    const runtime = JSON.parse(await readFile(path.join(dataDir, 'runtime.json'), 'utf8'));
    assert.equal(runtime.port, sidecar.status().port);
    assert.equal(typeof runtime.token, 'string');

    const health = await sidecar.request('GET', '/health');
    assert.equal(health.ok, true);
    assert.ok(health.version);

    const snapshot = await sidecar.request('GET', '/api/v1/snapshot');
    assert.ok(Array.isArray(snapshot.quotes));
    assert.ok(snapshot.quotes.length >= 1);
    const symbol = snapshot.quotes[0].symbol;
    assert.match(symbol, /^[A-Z0-9.^=_-]+$/);
    assert.equal(typeof snapshot.quotes[0].price, 'number');

    const analysis = await sidecar.request('GET', `/api/v1/analysis/${encodeURIComponent(symbol)}`, undefined, { timeoutMs: 120000 });
    assert.equal(analysis.symbol, symbol);
    assert.ok(['bullish', 'neutral', 'bearish'].includes(analysis.summary.signal));
    assert.ok(Array.isArray(analysis.signals));

    const history = await sidecar.request('GET', `/api/v1/history/${encodeURIComponent(symbol)}?range=1M&overlays=1`);
    assert.ok(Array.isArray(history.bars));
    assert.ok(history.bars.length > 0);
    assert.equal(history.overlays.sma20.length, history.bars.length);

    const created = await sidecar.request('POST', '/api/v1/alerts', {
      symbol,
      kind: 'price_above',
      threshold: Math.round(analysis.quote.price * 2),
    });
    assert.ok(created.rule.id);
    const rules = await sidecar.request('GET', '/api/v1/alerts');
    assert.equal(rules.rules.length, 1);
    await sidecar.request('DELETE', `/api/v1/alerts/${encodeURIComponent(created.rule.id)}`);

    const settings = await sidecar.request('PUT', '/api/v1/portfolio/positions', { symbol, quantity: 2, avg_cost: 100 });
    assert.equal(settings.position.symbol, symbol);
    const portfolio = await sidecar.request('GET', '/api/v1/portfolio');
    assert.equal(portfolio.positions.length, 1);
    await sidecar.request('DELETE', `/api/v1/portfolio/positions/${encodeURIComponent(symbol)}`);

    const meta = await sidecar.request('GET', '/api/v1/meta');
    assert.equal(meta.api_version, 'v1');
    assert.ok(meta.sidecar.port > 0);
  } finally {
    await sidecar.stop();
    assert.equal(sidecar.status().state, 'stopped');
    assert.equal(existsSync(path.join(dataDir, 'runtime.json')), false);
    await rm(dataDir, { recursive: true, force: true });
  }
});
