import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, promises as fsp } from 'node:fs';

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
  assert.equal(payload.modules.length, 6);
  assert.equal(payload.graphs.length, 2);
  assert.ok(payload.modules.some((module) => module.id === 'demo-pipeline' && module.kind === 'graph'));
  assert.ok(payload.modules.some((module) => module.id === 'demo-dataset' && module.kind === 'dataset'));
  const nightly = payload.graphs.find((graph) => graph.id === 'nightly-experiment');
  assert.equal(nightly.nodeCount, 2);
  assert.equal(nightly.layerCount, 2);
  assert.equal(payload.environments[0].id, 'local');
  assert.equal(payload.environments[0].executor, 'local');
  assert.equal(payload.executors.find((executor) => executor.id === 'local').available, true);
  assert.ok(payload.modules.every((module) => module.environmentId === 'local'));
  const root = path.join(home, 'storages', 'aether');
  assert.equal(existsSync(path.join(root, 'resources', 'modules', 'prepare', 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'subgraphs', 'demo-pipeline', 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'datasets', 'demo-dataset', 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', 'demo-pipeline', 'subgraph.json')), true);
  assert.equal(existsSync(path.join(root, 'experiments', 'nightly-experiment', 'experiment.json')), true);
});

test('command templates must reference defined names and validate before save', async () => {
  const missing = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        name: 'Missing ref',
        kind: 'command',
        command: 'echo @@missing@@',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(missing.status, 400);
  assert.match(missing.payload.error, /未定义的名称「missing」/);

  const unclosed = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        name: 'Unclosed ref',
        kind: 'command',
        command: 'echo @@name',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(unclosed.status, 400);
  assert.match(unclosed.payload.error, /@@ 占位符未闭合/);

  const duplicate = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        name: 'Duplicate names',
        kind: 'command',
        command: 'echo @@same@@',
        inputs: ['same'],
        outputs: [],
        params: { same: 'x' },
        paramTypes: { same: 'string' },
      },
    },
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.payload.error, /同时出现在输入和参数中/);

  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        name: 'Typed template',
        kind: 'command',
        command: 'echo @@name@@ @@rows@@ @@report@@',
        inputs: ['rows'],
        inputTypes: { rows: 'file' },
        outputs: ['report'],
        outputTypes: { report: 'json' },
        params: { name: 'world' },
        paramTypes: { name: 'string' },
      },
    },
  });
  assert.equal(created.status, 200);
  assert.deepEqual(created.payload.module.paramTypes, { name: 'string' });
  assert.deepEqual(created.payload.module.inputTypes, { rows: 'file' });
  assert.deepEqual(created.payload.module.outputTypes, { report: 'json' });

  const legacy = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        name: 'Legacy template',
        kind: 'command',
        command: 'echo {{value}}',
        inputs: [],
        outputs: [],
        params: { value: 'ok' },
      },
    },
  });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.payload.module.command, 'echo @@value@@');
});

test('command template substitutes params and output paths at runtime', async () => {
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'template-run',
        name: 'Template run',
        kind: 'command',
        command:
          'node -e "console.log(process.argv[1] + \'|\' + process.argv[2])" "@@greeting@@" "@@result@@"',
        inputs: [],
        outputs: ['result'],
        outputTypes: { result: 'file' },
        params: { greeting: 'hello-template' },
        paramTypes: { greeting: 'string' },
      },
    },
  });
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: 'template-run-graph',
        name: 'Template run graph',
        layout: 'vertical',
        nodes: [{ id: 'template', moduleId: 'template-run', label: 'Template', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'template-run-graph' },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded');
  assert.match(run.nodes[0].stdoutTail, /hello-template/);
  assert.match(run.nodes[0].stdoutTail, /result\.out/);
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

test('dataset nodes emit their URI without starting a command', async () => {
  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Dataset graph',
        layout: 'vertical',
        nodes: [{ id: 'rows', moduleId: 'demo-dataset', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  assert.equal(graph.status, 200);
  assert.equal(graph.payload.graph.layout, 'vertical');
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: graph.payload.graph.id, concurrency: 1 },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.layout, 'vertical');
  assert.equal(run.nodes[0].kind, 'dataset');
  assert.equal(run.nodes[0].outputs[0], 'rows');
  assert.match(run.nodes[0].stdoutTail, /datasets\/demo\.jsonl/);
  assert.equal(run.nodes[0].exitCode, 0);
});

test('module saves create a new version by default and can overwrite it', async () => {
  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'versioned', name: 'Versioned', kind: 'command', command: 'echo 1', inputs: [], outputs: ['out'],
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.payload.module.version, 1);
  assert.equal(created.payload.module.versions.length, 0);

  const updated = await call('/modules', {
    method: 'POST',
    body: { module: { ...created.payload.module, command: 'echo 2' } },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.module.version, 2);
  assert.equal(updated.payload.module.versions.length, 1);

  const overwritten = await call('/modules', {
    method: 'POST',
    body: { module: { ...updated.payload.module, command: 'echo 3' }, overwriteVersion: true },
  });
  assert.equal(overwritten.status, 200);
  assert.equal(overwritten.payload.module.version, 2);
  assert.equal(overwritten.payload.module.versions.length, 1);

  const { payload } = await call('/state');
  const module = payload.modules.find((item) => item.id === 'versioned');
  assert.equal(module.version, 2);
  assert.equal(module.versionCount, 1);
  assert.equal(module.versions, undefined);
});

test('new command modules can be required to submit an asset', async () => {
  const { status, payload } = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      requireAsset: true,
      module: {
        id: 'no-asset',
        name: 'No asset',
        kind: 'command',
        command: 'echo',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(status, 400);
  assert.match(payload.error, /文件或目录/);
});

test('module assets can be uploaded and run without an explicit command', async () => {
  const source = Buffer.from('console.log("asset ok")', 'utf8').toString('base64');
  const uploaded = await call('/modules/assets', {
    method: 'POST',
    body: {
      kind: 'file',
      name: 'run.js',
      files: [{ path: 'run.js', data: source }],
    },
  });
  assert.equal(uploaded.status, 200);
  const asset = uploaded.payload.asset;
  assert.equal(asset.assetKind, 'file');
  assert.equal(asset.assetName, 'run.js');

  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'asset-module',
        name: 'Asset module',
        kind: 'command',
        command: '',
        inputs: [],
        outputs: ['result'],
        assetId: asset.assetId,
        assetKind: asset.assetKind,
        assetName: asset.assetName,
        assetPath: asset.assetPath,
        assetFileCount: asset.assetFileCount,
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(
    existsSync(path.join(home, 'storages', 'aether', 'resources', 'modules', 'asset-module', 'resource.json')),
    true,
  );
  assert.equal(
    existsSync(
      path.join(home, 'storages', 'aether', 'resources', 'modules', 'asset-module', 'files', 'run.js'),
    ),
    true,
  );

  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: 'asset-graph',
        name: 'Asset graph',
        layout: 'vertical',
        nodes: [{ id: 'asset', moduleId: 'asset-module', label: 'Asset', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  assert.equal(graph.status, 200);

  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'asset-graph' },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded');
  assert.match(run.nodes[0].stdoutTail, /asset ok/);

  const download = await fetch(
    `${base}${API}/experiments/download?run=${encodeURIComponent(run.id)}&node=asset&port=result`,
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /attachment/);
  assert.match(await download.text(), /asset ok/);
});

test('graph save rejects an unconnected required input', async () => {
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'required-source', name: 'Required source', kind: 'command', command: 'echo',
        inputs: [], outputs: ['result'],
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'required-target', name: 'Required target', kind: 'command', command: 'echo',
        inputs: ['a', 'b'], outputs: [], requiredInputs: ['a'],
      },
    },
  });
  const baseGraph = {
    id: 'required-graph',
    name: 'Required graph',
    layout: 'vertical',
    nodes: [
      { id: 's', moduleId: 'required-source', label: 'Source', x: 40, y: 40 },
      { id: 't', moduleId: 'required-target', label: 'Target', x: 40, y: 200 },
    ],
    edges: [],
  };
  const rejected = await call('/graphs', { method: 'POST', body: { graph: baseGraph } });
  assert.equal(rejected.status, 400);
  assert.match(rejected.payload.error, /必填输入端口「a」/);

  const accepted = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        ...baseGraph,
        edges: [{ id: 'e1', from: 's', to: 't', fromPort: 'result', toPort: 'a' }],
      },
    },
  });
  assert.equal(accepted.status, 200);
});

test('a subgraph cannot be run on its own', async () => {
  const { status, payload } = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'demo-pipeline' },
  });
  assert.equal(status, 400);
  assert.match(payload.error, /子图/);

  const state = await call('/state');
  assert.equal(state.payload.graphs.find((graph) => graph.id === 'demo-pipeline').isSubgraph, true);
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
  assert.equal(run.layout, 'vertical');
  assert.equal(run.edges.length, 3);
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

test('module output artifacts can be inspected and downloaded', async () => {
  const script = `
const fs = require('fs');
const path = require('path');
const dir = process.env.AETHER_NODE_DIR;
fs.writeFileSync(path.join(dir, 'report.md'), '# artifact report\\n');
const artifacts = path.join(dir, 'artifacts');
fs.mkdirSync(path.join(artifacts, 'nested'), { recursive: true });
fs.writeFileSync(path.join(artifacts, 'summary.json'), JSON.stringify({ rows: 3 }));
fs.writeFileSync(path.join(artifacts, 'nested', 'detail.txt'), 'nested detail\\n');
fs.writeFileSync(
  path.join(dir, 'aether-outputs.json'),
  JSON.stringify({
    report_file: { path: 'report.md' },
    report_dir: { path: 'artifacts' }
  })
);
console.log('artifacts ready');
`;
  const uploaded = await call('/modules/assets', {
    method: 'POST',
    body: {
      kind: 'file',
      name: 'artifact.js',
      files: [{ path: 'artifact.js', data: Buffer.from(script, 'utf8').toString('base64') }],
    },
  });
  const asset = uploaded.payload.asset;
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'artifact-module',
        name: 'Artifact module',
        kind: 'command',
        command: '',
        inputs: [],
        outputs: ['report_file', 'report_dir'],
        assetId: asset.assetId,
        assetKind: asset.assetKind,
        assetName: asset.assetName,
        assetPath: asset.assetPath,
        assetFileCount: asset.assetFileCount,
      },
    },
  });
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: 'artifact-graph',
        name: 'Artifact graph',
        layout: 'vertical',
        nodes: [{ id: 'artifact', moduleId: 'artifact-module', label: 'Artifact', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'artifact-graph' },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded');
  assert.deepEqual(
    run.nodes[0].artifacts.map((artifact) => [artifact.port, artifact.kind]),
    [['report_file', 'file'], ['report_dir', 'directory']],
  );

  const fileView = await call(
    `/experiments/artifact?run=${encodeURIComponent(run.id)}&node=artifact&port=report_file`,
  );
  assert.equal(fileView.payload.kind, 'file');
  assert.match(fileView.payload.content, /artifact report/);

  const directoryView = await call(
    `/experiments/artifact?run=${encodeURIComponent(run.id)}&node=artifact&port=report_dir`,
  );
  assert.equal(directoryView.payload.kind, 'directory');
  assert.equal(
    directoryView.payload.entries.some((entry) => entry.name === 'summary.json'),
    true,
  );
  assert.equal(
    directoryView.payload.entries.some((entry) => entry.name === 'nested'),
    true,
  );

  const nestedView = await call(
    `/experiments/artifact?run=${encodeURIComponent(run.id)}&node=artifact&port=report_dir&file=nested/detail.txt`,
  );
  assert.match(nestedView.payload.content, /nested detail/);

  const fileDownload = await fetch(
    `${base}${API}/experiments/artifact/download?run=${encodeURIComponent(run.id)}&node=artifact&port=report_file`,
  );
  assert.equal(fileDownload.status, 200);
  assert.match(fileDownload.headers.get('content-disposition') || '', /report\.md/);
  assert.match(await fileDownload.text(), /artifact report/);

  const directoryDownload = await fetch(
    `${base}${API}/experiments/artifact/download?run=${encodeURIComponent(run.id)}&node=artifact&port=report_dir`,
  );
  assert.equal(directoryDownload.status, 200);
  assert.match(directoryDownload.headers.get('content-type') || '', /application\/zip/);
  assert.match(directoryDownload.headers.get('content-disposition') || '', /\.zip/);
  const archive = Buffer.from(await directoryDownload.arrayBuffer());
  assert.equal(archive.subarray(0, 4).toString('hex'), '504b0304');
  assert.match(archive.toString('utf8'), /summary\.json/);
  assert.match(archive.toString('utf8'), /nested\/detail\.txt/);
});

test('graphs move between experiment and subgraph folders by usage', async () => {
  const root = path.join(home, 'storages', 'aether');
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: { id: 'category-graph', name: 'Category graph', layout: 'vertical', nodes: [], edges: [] },
    },
  });
  assert.equal(existsSync(path.join(root, 'experiments', 'category-graph', 'experiment.json')), true);

  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'category-graph-module',
        name: 'Category graph module',
        kind: 'graph',
        graphId: 'category-graph',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(
    existsSync(path.join(root, 'resources', 'subgraphs', 'category-graph-module', 'resource.json')),
    true,
  );
  assert.equal(existsSync(path.join(root, 'subgraphs', 'category-graph', 'subgraph.json')), true);
  assert.equal(existsSync(path.join(root, 'experiments', 'category-graph')), false);

  await call('/modules?id=category-graph-module', { method: 'DELETE' });
  assert.equal(existsSync(path.join(root, 'experiments', 'category-graph', 'experiment.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', 'category-graph')), false);
});

test('module folders follow the module category', async () => {
  const root = path.join(home, 'storages', 'aether');
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'category-module',
        name: 'Category module',
        kind: 'command',
        command: 'echo category',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(existsSync(path.join(root, 'resources', 'modules', 'category-module', 'resource.json')), true);

  const updated = await call('/modules', {
    method: 'POST',
    body: {
      module: {
        id: 'category-module',
        name: 'Category module',
        kind: 'dataset',
        datasetUri: 'datasets/category.jsonl',
        inputs: [],
        outputs: ['rows'],
      },
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(existsSync(path.join(root, 'resources', 'datasets', 'category-module', 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'modules', 'category-module')), false);
});

test('workspace export/import excludes runs', async () => {
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: 'nightly-experiment', name: 'Workspace export run' },
  });
  await waitForRun(submitted.payload.experiment.id);
  const before = await call('/state');
  const exported = await call('/workspace/export?runs=1');
  assert.equal(exported.status, 200);
  assert.equal(exported.payload.format, 'aether-workspace');
  assert.equal(exported.payload.manifest.format, 'aether-workspace');
  assert.equal(exported.payload.includeRuns, false);
  assert.equal(
    exported.payload.files.some((file) => file.path.startsWith('runs/')),
    false,
  );

  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: 'import-temp-module',
        name: 'Import temp',
        kind: 'command',
        command: 'echo temp',
        inputs: [],
        outputs: [],
      },
    },
  });
  const imported = await call('/workspace/import', {
    method: 'POST',
    body: { bundle: exported.payload },
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.payload.includeRuns, false);
  assert.equal(imported.payload.runs, null);
  assert.equal(existsSync(imported.payload.backup), true);
  assert.match(imported.payload.backup, /\.aether-backups/);
  assert.equal(
    existsSync(path.join(home, 'storages', 'aether', 'aether.workspace.json')),
    true,
  );

  const restored = await call('/state');
  assert.equal(
    restored.payload.modules.some((module) => module.id === 'import-temp-module'),
    false,
  );
  assert.equal(restored.payload.experiments.length, before.payload.experiments.length);
  const runsAfter = await call('/experiments');
  assert.equal(
    runsAfter.payload.experiments.some((run) => run.id === submitted.payload.experiment.id),
    true,
  );
  const root = path.join(home, 'storages', 'aether');
  assert.equal(existsSync(path.join(root, 'experiments', 'nightly-experiment', 'experiment.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', 'demo-pipeline', 'subgraph.json')), true);
});

test('switching workspace migrates state and runs under the new root', async () => {
  const before = await call('/state');
  const moduleCount = before.payload.modules.length;
  const target = path.join(home, 'custom-workspace');

  const switched = await call('/workspace', {
    method: 'POST',
    body: { path: target },
  });
  assert.equal(switched.status, 200);
  assert.equal(switched.payload.workspace, target);
  assert.equal(switched.payload.copied, true);
  assert.equal(existsSync(path.join(target, 'state.json')), true);
  assert.equal(existsSync(path.join(target, 'aether.workspace.json')), true);
  assert.equal(existsSync(path.join(target, 'resources', 'modules', 'prepare', 'resource.json')), true);
  assert.equal(existsSync(path.join(target, 'resources', 'modules', 'prepare', 'files')), true);
  assert.equal(existsSync(path.join(target, 'experiments', 'nightly-experiment', 'experiment.json')), true);
  assert.equal(existsSync(path.join(target, 'subgraphs', 'demo-pipeline', 'subgraph.json')), true);

  const after = await call('/state');
  assert.equal(after.payload.workspace, target);
  assert.equal(after.payload.modules.length, moduleCount);

  const nested = await call('/workspace', {
    method: 'POST',
    body: { path: path.join(target, 'nested') },
  });
  assert.equal(nested.status, 400);
  assert.match(nested.payload.error, /不能位于当前工作区内部/);
});
