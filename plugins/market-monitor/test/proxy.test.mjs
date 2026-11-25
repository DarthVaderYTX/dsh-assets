/**
 * Tests for the browser-to-engine proxy: path mapping, diagnostics routes,
 * request body forwarding, and error translation. Uses a fake sidecar so no
 * Python process is required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiHandler, API_PREFIX, toEnginePath } from '../src/host/proxy.js';
import { SidecarError } from '../src/host/sidecar.js';

/**
 * Mount one handler on an ephemeral HTTP server.
 * @param {(req: any, res: any) => Promise<void>} handler route handler.
 * @returns {Promise<{ port: number, close: () => Promise<void> }>} server info.
 */
async function mount(handler) {
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Build a fake sidecar that records calls.
 * @param {unknown} [result] response payload or error.
 * @returns {{ calls: any[], request: Function, status: Function, stop: Function, ensureStarted: Function }} fake.
 */
function fakeSidecar(result) {
  const calls = [];
  return {
    calls,
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (result instanceof Error) throw result;
      return result ?? {};
    },
    status() {
      return { state: 'ready', port: 1234, pid: 99, python: 'python.exe', pythonVersion: '3.12', dataDir: 'C:/data', error: '', stderrTail: [] };
    },
    async stop() {},
    async ensureStarted() {},
  };
}

test('path mapping only accepts health and v1 routes', () => {
  assert.equal(toEnginePath('/health'), '/health');
  assert.equal(toEnginePath('/v1/snapshot'), '/api/v1/snapshot');
  assert.equal(toEnginePath('/v1/alerts/events'), '/api/v1/alerts/events');
  assert.equal(toEnginePath('/anything'), null);
  assert.equal(toEnginePath('/'), null);
});

test('GET requests proxy to the engine and keep the query string', async () => {
  const sidecar = fakeSidecar({ quotes: [{ symbol: 'AAPL' }] });
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/v1/snapshot?symbols=AAPL,MSFT`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { quotes: [{ symbol: 'AAPL' }] });
    assert.equal(sidecar.calls.length, 1);
    assert.equal(sidecar.calls[0].method, 'GET');
    assert.equal(sidecar.calls[0].path, '/api/v1/snapshot?symbols=AAPL,MSFT');
    assert.equal(sidecar.calls[0].body, undefined);
  } finally {
    await server.close();
  }
});

test('the plugin health path proxies to the engine liveness route', async () => {
  const sidecar = fakeSidecar({ ok: true, provider: 'yahoo' });
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, provider: 'yahoo' });
    assert.equal(sidecar.calls[0].path, '/health');
  } finally {
    await server.close();
  }
});

test('POST bodies are parsed and forwarded', async () => {
  const sidecar = fakeSidecar({ rule: { id: 'r1' } });
  const server = await mount(createApiHandler(sidecar, { provider: 'synthetic', pollSeconds: 30, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/v1/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'AAPL', kind: 'price_above', threshold: 250 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(sidecar.calls[0], {
      method: 'POST',
      path: '/api/v1/alerts',
      body: { symbol: 'AAPL', kind: 'price_above', threshold: 250 },
    });
  } finally {
    await server.close();
  }
});

test('host diagnostics do not reach the engine', async () => {
  const sidecar = fakeSidecar();
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/host`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status.state, 'ready');
    assert.equal(payload.config.provider, 'auto');
    assert.equal(sidecar.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('unknown prefixes return a 404 JSON error', async () => {
  const sidecar = fakeSidecar();
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/nope`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'not_found');
  } finally {
    await server.close();
  }
});

test('engine errors keep their status and code', async () => {
  const sidecar = fakeSidecar(new SidecarError('symbol_not_found', 'No symbol ZZZZ.', 404));
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/v1/quotes/ZZZZ`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'symbol_not_found');
    assert.match(payload.error.message, /ZZZZ/);
  } finally {
    await server.close();
  }
});

test('an unreachable sidecar becomes a 503 with the sidecar code', async () => {
  const sidecar = fakeSidecar(new SidecarError('sidecar_unavailable', 'The Python sidecar is not running.'));
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/v1/health`);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error.code, 'sidecar_unavailable');
  } finally {
    await server.close();
  }
});

test('invalid JSON produces a 400 before the engine is called', async () => {
  const sidecar = fakeSidecar();
  const server = await mount(createApiHandler(sidecar, { provider: 'auto', pollSeconds: 15, benchmark: '^GSPC' }, 'C:/plugin'));
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${API_PREFIX}/v1/watchlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_json');
    assert.equal(sidecar.calls.length, 0);
  } finally {
    await server.close();
  }
});
