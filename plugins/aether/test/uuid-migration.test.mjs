import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { existsSync } from 'node:fs';

import { apply } from '../index.js';

const API = '/aether-api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let home;
let root;
let server;
let base;
let routes = [];

async function call(route) {
  const response = await fetch(`${base}${API}${route}`);
  return { status: response.status, payload: await response.json() };
}

before(async () => {
  home = await fsp.mkdtemp(path.join(os.tmpdir(), 'aether-uuid-'));
  root = path.join(home, 'storages', 'aether');
  process.env.DSH_HOME = home;

  const modules = [
    {
      id: 'prepare',
      name: '准备',
      kind: 'command',
      command: 'echo hi',
      timeoutSec: 60,
      inputs: [],
      outputs: ['out'],
      params: {},
      paramTypes: {},
      inputTypes: {},
      outputTypes: { out: 'string' },
      environmentId: 'local',
      version: 1,
      versions: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'pipeline-module',
      name: '流水线模块',
      kind: 'graph',
      graphId: 'pipeline-graph',
      inputs: [],
      outputs: [],
      params: {},
      paramTypes: {},
      inputTypes: {},
      outputTypes: {},
      environmentId: 'local',
      version: 1,
      versions: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const graphs = [
    {
      id: 'pipeline-graph',
      name: '流水线',
      layout: 'vertical',
      nodes: [{ id: 'p', moduleId: 'prepare', label: 'P', params: {}, x: 10, y: 20 }],
      edges: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'nightly',
      name: '夜间实验',
      layout: 'vertical',
      nodes: [{ id: 'm', moduleId: 'pipeline-module', label: 'M', params: {}, x: 10, y: 20 }],
      edges: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  await fsp.mkdir(root, { recursive: true });
  await fsp.writeFile(
    path.join(root, 'state.json'),
    JSON.stringify({ version: 9, modules, graphs, environments: [], createdAt: 1, updatedAt: 1 }, null, 2),
    'utf8',
  );

  const write = async (relative, value) => {
    const file = path.join(root, relative);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
  };
  await write('resources/modules/prepare/resource.json', { format: 'aether-resource', id: 'prepare', kind: 'command' });
  await write('resources/subgraphs/pipeline-module/resource.json', {
    format: 'aether-resource',
    id: 'pipeline-module',
    kind: 'graph',
    graphId: 'pipeline-graph',
  });
  await write('subgraphs/pipeline-graph/subgraph.json', {
    format: 'aether-subgraph',
    category: 'subgraphs',
    id: 'pipeline-graph',
    nodes: [{ id: 'p', moduleId: 'prepare' }],
    edges: [],
  });
  await write('experiments/nightly/experiment.json', {
    format: 'aether-experiment',
    category: 'experiments',
    id: 'nightly',
    nodes: [{ id: 'm', moduleId: 'pipeline-module' }],
    edges: [],
  });
  await write('runs/exp-1/run.json', {
    id: 'exp-1',
    graphId: 'nightly',
    nodes: [{ path: 'm', moduleId: 'pipeline-module' }],
  });

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
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fsp.rm(home, { recursive: true, force: true });
});

test('legacy name-based ids are migrated to globally unique UUIDs', async () => {
  const { status, payload } = await call('/state');
  assert.equal(status, 200);
  assert.equal(payload.modules.length, 2);
  assert.equal(payload.graphs.length, 2);

  const prepare = payload.modules.find((module) => module.name === '准备');
  const pipelineModule = payload.modules.find((module) => module.name === '流水线模块');
  const pipeline = payload.graphs.find((graph) => graph.name === '流水线');
  const nightly = payload.graphs.find((graph) => graph.name === '夜间实验');
  for (const entity of [prepare, pipelineModule, pipeline, nightly]) {
    assert.match(entity.id, UUID_RE);
  }
  const ids = [prepare.id, pipelineModule.id, pipeline.id, nightly.id];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes('prepare'), false);
  assert.equal(pipelineModule.graphId, pipeline.id);

  const state = JSON.parse(await fsp.readFile(path.join(root, 'state.json'), 'utf8'));
  assert.equal(state.version, 10);
  assert.deepEqual(
    state.graphs.find((graph) => graph.id === nightly.id).nodes[0].moduleId,
    pipelineModule.id,
  );

  const moduleDescription = JSON.parse(
    await fsp.readFile(path.join(root, 'resources', 'modules', 'prepare', 'resource.json'), 'utf8'),
  );
  assert.equal(moduleDescription.id, prepare.id);

  const subgraphDescription = JSON.parse(
    await fsp.readFile(path.join(root, 'subgraphs', 'pipeline-graph', 'subgraph.json'), 'utf8'),
  );
  assert.equal(subgraphDescription.id, pipeline.id);
  assert.equal(subgraphDescription.nodes[0].moduleId, prepare.id);

  const graphModuleDescription = JSON.parse(
    await fsp.readFile(path.join(root, 'resources', 'subgraphs', 'pipeline-module', 'resource.json'), 'utf8'),
  );
  assert.equal(graphModuleDescription.id, pipelineModule.id);
  assert.equal(graphModuleDescription.graphId, pipeline.id);

  const experimentDescription = JSON.parse(
    await fsp.readFile(path.join(root, 'experiments', 'nightly', 'experiment.json'), 'utf8'),
  );
  assert.equal(experimentDescription.id, nightly.id);
  assert.equal(experimentDescription.nodes[0].moduleId, pipelineModule.id);

  const listed = await call('/experiments');
  const migratedRun = listed.payload.experiments.find((item) => item.graphId === nightly.id);
  assert.ok(migratedRun);
  assert.match(migratedRun.id, UUID_RE);
  const run = JSON.parse(
    await fsp.readFile(path.join(root, 'runs', migratedRun.id, 'run.json'), 'utf8'),
  );
  assert.equal(run.id, migratedRun.id);
  assert.equal(run.graphId, nightly.id);
  assert.equal(run.nodes[0].moduleId, pipelineModule.id);
  assert.equal(existsSync(path.join(root, 'runs', 'exp-1')), false);

  const backups = await fsp.readdir(path.join(root, '.aether-backups'));
  assert.equal(backups.some((name) => name.startsWith('state.before-uuid-')), true);

  // 迁移后的资源同样不允许再修改，目录与描述保持原样。
  const update = await fetch(`${base}${API}/modules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      module: {
        id: prepare.id,
        name: '准备',
        kind: 'command',
        command: 'echo updated',
        timeoutSec: 60,
        inputs: [],
        outputs: ['out'],
        outputTypes: { out: 'string' },
        params: {},
        paramTypes: {},
        environmentId: 'local',
      },
    }),
  });
  assert.equal(update.status, 409);
  assert.match((await update.json()).error, /创建后不可修改/);
  const updatedDescription = JSON.parse(
    await fsp.readFile(path.join(root, 'resources', 'modules', 'prepare', 'resource.json'), 'utf8'),
  );
  assert.equal(updatedDescription.id, prepare.id);
  assert.equal(updatedDescription.command, 'echo hi');
  assert.equal(existsSync(path.join(root, 'resources', 'modules', prepare.id)), false);
});

test('module and graph creation rejects non-UUID ids and keeps ids unique', async () => {
  const response = await fetch(`${base}${API}/modules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ create: true, module: { id: 'not-a-uuid', name: 'Bad id', kind: 'command', command: 'echo' } }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /UUID/);

  const first = await fetch(`${base}${API}/graphs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ graph: { name: 'Auto id graph' } }),
  });
  const created = await first.json();
  assert.equal(first.status, 200);
  assert.match(created.graph.id, UUID_RE);

  const state = await call('/state');
  const moduleIds = new Set(state.payload.modules.map((module) => module.id));
  for (const graph of state.payload.graphs) {
    assert.equal(moduleIds.has(graph.id), false);
  }
});
