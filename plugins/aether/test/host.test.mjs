import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { apply } from '../index.js';

const API = '/aether-api';
let server;
let base;
let home;
let routes = [];

async function call(route, options = {}) {
  const init = { method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${base}${API}${route}`, init);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function waitForRun(id, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { payload } = await call(`/experiments?id=${encodeURIComponent(id)}`);
    if (payload.experiment && payload.experiment.status !== 'running') return payload.experiment;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`run ${id} did not settle`);
}

before(async () => {
  home = await fsp.mkdtemp(path.join(os.tmpdir(), 'aether-test-'));
  process.env.DSH_HOME = home;
  const ctx = {
    effect(fn) {
      fn();
    },
    get() {
      return undefined;
    },
    logger: { warn() {} },
    webServer: {
      register(spec) {
        routes.push(spec);
        return () => {};
      },
    },
  };
  apply(ctx);
  server = http.createServer((req, res) => routes[0].handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const { payload } = await call('/state');
  assert.equal(payload.ok, true);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fsp.rm(home, { recursive: true, force: true });
});

test('seeds a demo module library and graphs', async () => {
  const { payload } = await call('/state');
  assert.equal(payload.modules.length, 5);
  assert.equal(payload.graphs.length, 2);
  assert.ok(payload.modules.some((module) => module.id === 'demo-pipeline' && module.kind === 'graph'));
  const nightly = payload.graphs.find((graph) => graph.id === 'nightly-experiment');
  assert.equal(nightly.nodeCount, 2);
  assert.equal(nightly.layerCount, 2);
  assert.equal(payload.environments[0].id, 'local');
  assert.equal(payload.environments[0].executor, 'local');
  assert.equal(payload.executors.find((executor) => executor.id === 'local').available, true);
  assert.ok(payload.modules.every((module) => module.environmentId === 'local'));
});

test('modules record their execution environment', async () => {
  const created = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: 'Env module', kind: 'command', command: 'echo env' } },
  });
  assert.equal(created.status, 200);
  assert.equal(created.payload.module.environmentId, 'local');

  const rejected = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: { name: 'Remote module', kind: 'command', command: 'echo remote', environmentId: 'gpu-a100' },
    },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.payload.error, /执行环境「gpu-a100」不存在/);
});

test('module and graph CRUD with usage protection', async () => {
  const created = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: 'Smoke', kind: 'command', command: 'echo smoke' } },
  });
  assert.equal(created.status, 200);
  const module = created.payload.module;
  assert.equal(module.id, 'smoke');

  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Smoke graph',
        nodes: [
          { id: 'one', moduleId: 'smoke', label: 'one' },
          { id: 'two', moduleId: 'smoke', label: 'two' },
        ],
        edges: [{ id: 'e1', from: 'one', to: 'two' }],
      },
    },
  });
  assert.equal(graph.status, 200);
  const graphId = graph.payload.graph.id;
  assert.equal(graphId, 'smoke-graph');

  const detail = await call(`/graphs?id=${graphId}`);
  assert.equal(detail.payload.plan.nodes.length, 2);
  assert.equal(detail.payload.plan.layerCount, 2);

  const blocked = await call('/modules?id=smoke', { method: 'DELETE' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.payload.error, /Smoke graph/);

  const removedGraph = await call(`/graphs?id=${graphId}`, { method: 'DELETE' });
  assert.equal(removedGraph.status, 200);
  const removedModule = await call('/modules?id=smoke', { method: 'DELETE' });
  assert.equal(removedModule.status, 200);
});

test('cycles and subgraph reference loops are rejected', async () => {
  const loop = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Loop graph',
        nodes: [
          { id: 'a', moduleId: 'train' },
          { id: 'b', moduleId: 'evaluate' },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e2', from: 'b', to: 'a' },
        ],
      },
    },
  });
  assert.equal(loop.status, 400);
  assert.match(loop.payload.error, /环/);

  const empty = await call('/graphs', { method: 'POST', body: { graph: { name: 'Loop shell' } } });
  assert.equal(empty.status, 200);
  const shellId = empty.payload.graph.id;

  const module = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: { id: 'loop-module', name: 'Loop module', kind: 'graph', graphId: shellId },
    },
  });
  assert.equal(module.status, 200);

  const looped = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: shellId,
        name: 'Loop shell',
        nodes: [{ id: 'n1', moduleId: 'loop-module' }],
        edges: [],
      },
    },
  });
  assert.equal(looped.status, 400);
  assert.match(looped.payload.error, /子图循环引用/);
});

test('non-latin names still receive distinct module ids', async () => {
  const first = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: '中文模块一', kind: 'command', command: 'echo one' } },
  });
  const second = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: '中文模块二', kind: 'command', command: 'echo two' } },
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.payload.module.id, second.payload.module.id);
  assert.equal(first.payload.module.id, 'module');
  assert.equal(second.payload.module.id, 'module-2');
});

test('module ports and canvas coordinates round-trip through the API', async () => {
  const source = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: { name: 'Port source', kind: 'command', command: 'echo src', inputs: [], outputs: ['result', 'result'] },
    },
  });
  assert.equal(source.status, 200);
  assert.deepEqual(source.payload.module.inputs, []);
  assert.deepEqual(source.payload.module.outputs, ['result']);

  const sink = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: 'Port sink', kind: 'command', command: 'echo sink', inputs: ['value'], outputs: [] } },
  });
  assert.equal(sink.status, 200);

  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Port graph',
        nodes: [
          { id: 's', moduleId: source.payload.module.id, x: 40, y: 50 },
          { id: 'd', moduleId: sink.payload.module.id, x: 300, y: 75 },
        ],
        edges: [{ id: 'e1', from: 's', to: 'd', fromPort: 'result', toPort: 'value' }],
      },
    },
  });
  assert.equal(graph.status, 200);
  const detail = await call(`/graphs?id=${graph.payload.graph.id}`);
  assert.equal(detail.payload.graph.nodes[0].x, 40);
  assert.equal(detail.payload.graph.nodes[1].y, 75);
  assert.equal(detail.payload.graph.edges[0].fromPort, 'result');
  assert.equal(detail.payload.graph.edges[0].toPort, 'value');

  const badPort = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Bad port graph',
        nodes: [
          { id: 's', moduleId: source.payload.module.id },
          { id: 'd', moduleId: sink.payload.module.id },
        ],
        edges: [{ id: 'e1', from: 's', to: 'd', fromPort: 'result', toPort: 'missing' }],
      },
    },
  });
  assert.equal(badPort.status, 400);
  assert.match(badPort.payload.error, /没有输入端口「missing」/);
});

test('submitting a graph executes subgraph nodes in dependency order', async () => {
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'nightly-experiment', name: 'nightly smoke', concurrency: 2 },
  });
  assert.equal(submitted.status, 200);
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded', JSON.stringify(run.nodes));
  assert.equal(run.executor, 'local');
  assert.deepEqual(
    run.nodes.map((node) => node.path),
    ['pipeline/prepare', 'pipeline/train', 'pipeline/evaluate', 'report'],
  );
  for (const node of run.nodes) {
    assert.equal(node.status, 'succeeded', `${node.path}: ${node.error}`);
    assert.equal(node.environmentId, 'local');
    assert.equal(node.environmentName, '本机');
    assert.equal(node.executor, 'local');
  }
  assert.match(run.nodes.find((node) => node.path === 'pipeline/train').stdoutTail, /training lr=0\.02/);

  const log = await fetch(`${base}${API}/experiments/logs?run=${run.id}&node=${encodeURIComponent('pipeline/prepare')}&stream=out`);
  assert.match(await log.text(), /dataset/);
});

test('a failing node skips dependents and fails the run', async () => {
  const created = await call('/modules', {
    method: 'POST',
    body: { create: true, module: { name: 'Fail', kind: 'command', command: 'node -e "process.exit(3)"' } },
  });
  const failId = created.payload.module.id;
  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Failure graph',
        nodes: [
          { id: 'boom', moduleId: failId },
          { id: 'after', moduleId: 'report' },
        ],
        edges: [{ id: 'e1', from: 'boom', to: 'after' }],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: graph.payload.graph.id, concurrency: 1 },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'failed');
  const byPath = new Map(run.nodes.map((node) => [node.path, node]));
  assert.equal(byPath.get('boom').status, 'failed');
  assert.equal(byPath.get('boom').exitCode, 3);
  assert.equal(byPath.get('after').status, 'skipped');
});

test('cancelling a running experiment settles as cancelled', async () => {
  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: { name: 'Slow', kind: 'command', command: 'node -e "setTimeout(() => {}, 8000)"' },
    },
  });
  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Cancel graph',
        nodes: [{ id: 'slow', moduleId: created.payload.module.id }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: graph.payload.graph.id, concurrency: 1 },
  });
  const id = submitted.payload.experiment.id;
  await new Promise((resolve) => setTimeout(resolve, 400));
  const cancelled = await call('/experiments/cancel', { method: 'POST', body: { id } });
  assert.equal(cancelled.status, 200);
  const run = await waitForRun(id);
  assert.equal(run.status, 'cancelled');
  assert.equal(run.nodes[0].status, 'cancelled');
});
