import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';

import { apply } from '../index.js';

const API = '/aether-api';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let server;
let base;
let home;
let routes = [];
const registeredSkills = [];

function findPython() {
  const candidates = [process.env.AETHER_TEST_PYTHON, 'python3', 'python'].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return candidate;
  }
  return '';
}

async function moduleByName(name) {
  const { payload } = await call('/state');
  return payload.modules.find((module) => module.name === name) || {};
}

async function graphByName(name) {
  const { payload } = await call('/state');
  return payload.graphs.find((graph) => graph.name === name) || {};
}

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
    get(name) {
      if (name === 'skills') {
        return {
          register(spec) {
            registeredSkills.push(spec);
            return () => {};
          },
        };
      }
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

test('registers the aether agent skill', () => {
  assert.equal(registeredSkills.length, 1);
  const skill = registeredSkills[0];
  assert.equal(skill.name, 'aether');
  assert.ok(skill.description.length > 0 && skill.description.length <= 480);
  assert.ok(skill.whenToUse && skill.whenToUse.length > 0);
  assert.match(skill.content, /Aether Agent/);
  assert.match(skill.content, /## 6\. 执行语义/);
  assert.match(skill.content, /POST \/aether-api\/experiments/);
  assert.equal(skill.resourceBase && skill.resourceBase.kind, 'directory');
});

test('seeds a demo module library and graphs', async () => {
  const { payload } = await call('/state');
  assert.equal(payload.modules.length, 6);
  assert.equal(payload.graphs.length, 2);
  const prepare = payload.modules.find((module) => module.name === '准备数据');
  const pipelineModule = payload.modules.find((module) => module.name === '演示流水线（子图）');
  const dataset = payload.modules.find((module) => module.name === '示例数据集');
  assert.ok(pipelineModule && pipelineModule.kind === 'graph');
  assert.ok(dataset && dataset.kind === 'dataset');
  assert.match(pipelineModule.id, UUID_RE);
  assert.match(dataset.id, UUID_RE);
  const nightly = payload.graphs.find((graph) => graph.name === '夜间实验');
  const pipelineGraph = payload.graphs.find((graph) => graph.name === '演示流水线');
  assert.equal(nightly.nodeCount, 2);
  assert.equal(nightly.layerCount, 2);
  assert.match(nightly.id, UUID_RE);
  assert.equal(payload.environments[0].id, 'local');
  assert.equal(payload.environments[0].executor, 'local');
  assert.equal(payload.executors.find((executor) => executor.id === 'local').available, true);
  assert.ok(payload.modules.every((module) => module.environmentId === 'local'));
  const root = path.join(home, 'storages', 'aether');
  assert.equal(existsSync(path.join(root, 'resources', 'modules', prepare.id, 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'subgraphs', pipelineModule.id, 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'datasets', dataset.id, 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', pipelineGraph.id, 'subgraph.json')), true);
  assert.equal(existsSync(path.join(root, 'experiments', nightly.id, 'experiment.json')), true);
});

test('graph connections reject incompatible port types', async () => {
  const numberSourceId = randomUUID();
  const fileSinkId = randomUUID();
  const textSinkId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: numberSourceId,
        name: 'Typed number source',
        kind: 'command',
        command: 'echo 42',
        inputs: [],
        outputs: ['value'],
        outputTypes: { value: 'number' },
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: fileSinkId,
        name: 'Typed file sink',
        kind: 'command',
        command: 'echo file',
        inputs: ['data'],
        inputTypes: { data: 'file' },
        outputs: [],
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: textSinkId,
        name: 'Typed text sink',
        kind: 'command',
        command: 'echo text',
        inputs: ['data'],
        inputTypes: { data: 'string' },
        outputs: [],
      },
    },
  });

  const rejected = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Typed incompatible graph',
        layout: 'vertical',
        nodes: [
          { id: 'source', moduleId: numberSourceId, label: 'Source', x: 40, y: 40 },
          { id: 'sink', moduleId: fileSinkId, label: 'Sink', x: 40, y: 200 },
        ],
        edges: [{ id: 'edge-1', from: 'source', to: 'sink', fromPort: 'value', toPort: 'data' }],
      },
    },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.payload.error, /端口类型不匹配/);

  const accepted = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Typed compatible graph',
        layout: 'vertical',
        nodes: [
          { id: 'source', moduleId: numberSourceId, label: 'Source', x: 40, y: 40 },
          { id: 'sink', moduleId: textSinkId, label: 'Sink', x: 40, y: 200 },
        ],
        edges: [{ id: 'edge-1', from: 'source', to: 'sink', fromPort: 'value', toPort: 'data' }],
      },
    },
  });
  assert.equal(accepted.status, 200);
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
  const templateRunId = randomUUID();
  const templateGraphId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: templateRunId,
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
        id: templateGraphId,
        name: 'Template run graph',
        layout: 'vertical',
        nodes: [{ id: 'template', moduleId: templateRunId, label: 'Template', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: templateGraphId },
  });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.match(run.id, UUID_RE);
  assert.equal(run.status, 'succeeded');
  assert.match(run.nodes[0].stdoutTail, /hello-template/);
  assert.match(run.nodes[0].stdoutTail, /result\.out/);
});

test('submitting an unsaved graph draft runs the edit without saving it', async () => {
  const moduleId = randomUUID();
  const graphId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: moduleId,
        name: 'Draft work',
        kind: 'command',
        command: 'node -e "console.log(process.env.AETHER_PARAM_LABEL)"',
        params: { label: 'default' },
        paramTypes: { label: 'string' },
        inputs: [],
        outputs: [],
      },
    },
  });
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: graphId,
        name: 'Draft graph',
        layout: 'vertical',
        nodes: [{ id: 'work', moduleId, params: { label: 'saved' }, x: 40, y: 40 }],
        edges: [],
      },
    },
  });

  const saved = (await call(`/graphs?id=${graphId}`)).payload.graph;
  const draft = {
    ...saved,
    nodes: saved.nodes.map((node) => ({ ...node, params: { label: 'draft' } })),
  };
  const submitted = await call('/experiments', { method: 'POST', body: { graph: draft, name: 'draft run' } });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded', JSON.stringify(run.nodes));
  assert.match(run.nodes[0].stdoutTail, /draft/);

  const after = (await call(`/graphs?id=${graphId}`)).payload.graph;
  assert.equal(after.nodes[0].params.label, 'saved');

  // 未保存的新实验（没有 id）也能提交；运行只使用草稿快照。
  const countsBefore = (await call('/state')).payload.graphs.length;
  const newDraft = {
    id: '',
    name: 'New draft graph',
    layout: 'vertical',
    nodes: [{ id: 'work', moduleId, params: { label: 'brand-new' }, x: 40, y: 40 }],
    edges: [],
  };
  const submittedNew = await call('/experiments', {
    method: 'POST',
    body: { graph: newDraft, name: 'new draft run' },
  });
  const newRun = await waitForRun(submittedNew.payload.experiment.id);
  assert.equal(newRun.status, 'succeeded', JSON.stringify(newRun.nodes));
  assert.match(newRun.nodes[0].stdoutTail, /brand-new/);
  assert.equal(newRun.graphId, '');
  assert.equal((await call('/state')).payload.graphs.length, countsBefore);

  // 草稿实例的重跑使用 run.graphSnapshot，不依赖实验是否保存。
  const rerun = await call('/experiments/rerun', { method: 'POST', body: { id: newRun.id } });
  const rerunRun = await waitForRun(rerun.payload.experiment.id);
  assert.equal(rerunRun.status, 'succeeded', JSON.stringify(rerunRun.nodes));
  assert.match(rerunRun.nodes[0].stdoutTail, /brand-new/);
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
  assert.match(module.id, UUID_RE);

  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Smoke graph',
        nodes: [
          { id: 'one', moduleId: module.id, label: 'one' },
          { id: 'two', moduleId: module.id, label: 'two' },
        ],
        edges: [{ id: 'e1', from: 'one', to: 'two' }],
      },
    },
  });
  assert.equal(graph.status, 200);
  const graphId = graph.payload.graph.id;
  assert.match(graphId, UUID_RE);

  const detail = await call(`/graphs?id=${graphId}`);
  assert.equal(detail.payload.plan.nodes.length, 2);
  assert.equal(detail.payload.plan.layerCount, 2);

  const blocked = await call(`/modules?id=${module.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.payload.error, /Smoke graph/);

  const removedGraph = await call(`/graphs?id=${graphId}`, { method: 'DELETE' });
  assert.equal(removedGraph.status, 200);
  const removedModule = await call(`/modules?id=${module.id}`, { method: 'DELETE' });
  assert.equal(removedModule.status, 200);
});

test('cycles and subgraph reference loops are rejected', async () => {
  const train = await moduleByName('训练模型');
  const evaluate = await moduleByName('评估结果');
  const loopModuleId = randomUUID();
  const loop = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Loop graph',
        nodes: [
          { id: 'a', moduleId: train.id },
          { id: 'b', moduleId: evaluate.id },
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
      module: { id: loopModuleId, name: 'Loop module', kind: 'graph', graphId: shellId },
    },
  });
  assert.equal(module.status, 200);

  const looped = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: shellId,
        name: 'Loop shell',
        nodes: [{ id: 'n1', moduleId: loopModuleId }],
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
  assert.match(first.payload.module.id, UUID_RE);
  assert.match(second.payload.module.id, UUID_RE);
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

test('dataset resources can store imported data files', async () => {
  const uploaded = await call('/modules/assets', {
    method: 'POST',
    body: {
      kind: 'file',
      name: 'rows.jsonl',
      files: [
        {
          path: 'rows.jsonl',
          data: Buffer.from('{"id":1}\n{"id":2}\n', 'utf8').toString('base64'),
        },
      ],
    },
  });
  const asset = uploaded.payload.asset;
  const datasetUploadId = randomUUID();
  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: datasetUploadId,
        name: 'Dataset upload',
        kind: 'dataset',
        datasetUri: 'rows.jsonl',
        datasetFormat: 'jsonl',
        inputs: [],
        outputs: ['rows'],
        outputTypes: { rows: 'json' },
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
    created.payload.module.datasetUri,
    `resources/datasets/${datasetUploadId}/files/rows.jsonl`,
  );
  assert.deepEqual(created.payload.module.outputTypes, { rows: 'json' });
  const root = path.join(home, 'storages', 'aether');
  assert.equal(
    existsSync(path.join(root, 'resources', 'datasets', datasetUploadId, 'files', 'rows.jsonl')),
    true,
  );
  const description = JSON.parse(
    await fsp.readFile(
      path.join(root, 'resources', 'datasets', datasetUploadId, 'resource.json'),
      'utf8',
    ),
  );
  assert.equal(description.datasetUri, `resources/datasets/${datasetUploadId}/files/rows.jsonl`);
  assert.deepEqual(description.outputTypes, { rows: 'json' });
});

test('dataset nodes emit their URI without starting a command', async () => {
  const dataset = await moduleByName('示例数据集');
  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Dataset graph',
        layout: 'vertical',
        nodes: [{ id: 'rows', moduleId: dataset.id, x: 40, y: 40 }],
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

test('modules cannot be modified after creation', async () => {
  const versionedId = randomUUID();
  const created = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: versionedId, name: 'Immutable', kind: 'command', command: 'echo 1', inputs: [], outputs: ['out'],
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
  assert.equal(updated.status, 409);
  assert.match(updated.payload.error, /创建后不可修改/);

  const { payload } = await call('/state');
  const module = payload.modules.find((item) => item.id === versionedId);
  assert.equal(module.name, 'Immutable');
  assert.equal(module.version, 1);
  assert.equal(module.versionCount, 0);
  assert.equal(module.versions, undefined);
});

test('new command modules can be required to submit an asset', async () => {
  const { status, payload } = await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      requireAsset: true,
      module: {
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

test('module commands run in the execution folder with copied files and inputs', async () => {
  const sourceId = randomUUID();
  const sinkId = randomUUID();
  const graphId = randomUUID();
  const writeScript = [
    "const fs = require('fs');",
    "fs.writeFileSync('rows.jsonl', '{\"query\":\"a\"}\\n{\"query\":\"b\"}\\n');",
    "fs.writeFileSync('aether-outputs.json', JSON.stringify({ rows: 'rows.jsonl' }));",
  ].join('\n');
  const readScript = [
    "const fs = require('fs');",
    "const rows = fs.readFileSync('input/rows', 'utf8').trim().split('\\n');",
    "console.log('cwd=' + process.cwd());",
    "console.log('rows=' + rows.length);",
    "fs.writeFileSync('result.txt', rows.join('|'));",
    "fs.writeFileSync('aether-outputs.json', JSON.stringify({ result: 'result.txt' }));",
  ].join('\n');

  const upload = async (name, files) =>
    (
      await call('/modules/assets', {
        method: 'POST',
        body: {
          kind: 'directory',
          name,
          files: files.map((file) => ({
            path: file.path,
            data: Buffer.from(file.text, 'utf8').toString('base64'),
          })),
        },
      })
    ).payload.asset;
  const sourceAsset = await upload('source', [{ path: 'write.js', text: writeScript }]);
  const sinkAsset = await upload('sink', [{ path: 'main.js', text: readScript }]);

  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: sourceId,
        name: 'Source module',
        kind: 'command',
        command: 'node write.js',
        inputs: [],
        outputs: ['rows'],
        outputTypes: { rows: 'file' },
        assetId: sourceAsset.assetId,
        assetKind: sourceAsset.assetKind,
        assetName: sourceAsset.assetName,
        assetPath: sourceAsset.assetPath,
        assetFileCount: sourceAsset.assetFileCount,
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: sinkId,
        name: 'Sink module',
        kind: 'command',
        command: 'node main.js',
        inputs: ['rows'],
        inputTypes: { rows: 'file' },
        outputs: ['result'],
        outputTypes: { result: 'file' },
        assetId: sinkAsset.assetId,
        assetKind: sinkAsset.assetKind,
        assetName: sinkAsset.assetName,
        assetPath: sinkAsset.assetPath,
        assetFileCount: sinkAsset.assetFileCount,
      },
    },
  });
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: graphId,
        name: 'Execution folder graph',
        layout: 'vertical',
        nodes: [
          { id: 'source', moduleId: sourceId, x: 40, y: 40 },
          { id: 'sink', moduleId: sinkId, x: 40, y: 220 },
        ],
        edges: [{ id: 'e1', from: 'source', to: 'sink', fromPort: 'rows', toPort: 'rows' }],
      },
    },
  });
  const submitted = await call('/experiments', { method: 'POST', body: { graphId } });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded', JSON.stringify(run.nodes));

  const root = path.join(home, 'storages', 'aether');
  const sourceDirectory = path.join(root, 'runs', run.id, 'nodes', 'source');
  const sinkDirectory = path.join(root, 'runs', run.id, 'nodes', 'sink');
  assert.equal(existsSync(path.join(sourceDirectory, 'write.js')), true);
  assert.equal(existsSync(path.join(sinkDirectory, 'main.js')), true);
  const inputRows = await fsp.readFile(path.join(sinkDirectory, 'input', 'rows'), 'utf8');
  assert.match(inputRows, /"query":"a"/);
  assert.match(inputRows, /"query":"b"/);
  assert.match(run.nodes.find((node) => node.path === 'sink').stdoutTail, /cwd=.*[\\/]runs[\\/][^\\/\r\n]+[\\/]nodes[\\/]sink/);
  assert.match(run.nodes.find((node) => node.path === 'sink').stdoutTail, /rows=2/);
  assert.equal(existsSync(path.join(sinkDirectory, 'result.txt')), true);
});

test('python module rewrites JSONL query values from a dataset input', async (t) => {
  const python = findPython();
  if (!python) {
    t.skip('python is not available');
    return;
  }
  const datasetId = randomUUID();
  const scriptId = randomUUID();
  const graphId = randomUUID();
  const pythonSource = [
    "import json",
    "",
    "with open('input/rows', encoding='utf-8') as source:",
    "    rows = [json.loads(line) for line in source if line.strip()]",
    "",
    "with open('result.jsonl', 'w', encoding='utf-8') as sink:",
    "    for row in rows:",
    "        row['query'] = str(row.get('query', '')) + '喵'",
    "        sink.write(json.dumps(row, ensure_ascii=False) + '\\n')",
    "",
    "with open('aether-outputs.json', 'w', encoding='utf-8') as manifest:",
    "    json.dump({'result': 'result.jsonl'}, manifest)",
  ].join('\n');

  const upload = async (name, filename, text) =>
    (
      await call('/modules/assets', {
        method: 'POST',
        body: {
          kind: 'file',
          name,
          files: [{ path: filename, data: Buffer.from(text, 'utf8').toString('base64') }],
        },
      })
    ).payload.asset;
  const datasetAsset = await upload(
    'rows.jsonl',
    'rows.jsonl',
    '{"query":"你好"}\n{"query":"world"}\n',
  );
  const scriptAsset = await upload('main.py', 'main.py', pythonSource);

  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: datasetId,
        name: 'JSONL dataset',
        kind: 'dataset',
        datasetUri: 'rows.jsonl',
        datasetFormat: 'jsonl',
        inputs: [],
        outputs: ['rows'],
        outputTypes: { rows: 'file' },
        assetId: datasetAsset.assetId,
        assetKind: datasetAsset.assetKind,
        assetName: datasetAsset.assetName,
        assetPath: datasetAsset.assetPath,
        assetFileCount: datasetAsset.assetFileCount,
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: scriptId,
        name: 'Python 喵',
        kind: 'command',
        command: `"${python}" main.py`,
        inputs: ['rows'],
        inputTypes: { rows: 'file' },
        outputs: ['result'],
        outputTypes: { result: 'file' },
        assetId: scriptAsset.assetId,
        assetKind: scriptAsset.assetKind,
        assetName: scriptAsset.assetName,
        assetPath: scriptAsset.assetPath,
        assetFileCount: scriptAsset.assetFileCount,
      },
    },
  });
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: graphId,
        name: 'Python cat graph',
        layout: 'vertical',
        nodes: [
          { id: 'data', moduleId: datasetId, x: 40, y: 40 },
          { id: 'script', moduleId: scriptId, x: 40, y: 240 },
        ],
        edges: [{ id: 'e1', from: 'data', to: 'script', fromPort: 'rows', toPort: 'rows' }],
      },
    },
  });
  const submitted = await call('/experiments', { method: 'POST', body: { graphId } });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded', JSON.stringify(run.nodes));
  const nodeDirectory = path.join(home, 'storages', 'aether', 'runs', run.id, 'nodes', 'script');
  assert.equal(existsSync(path.join(nodeDirectory, 'main.py')), true);
  assert.equal(existsSync(path.join(nodeDirectory, 'input', 'rows')), true);
  const result = await fsp.readFile(path.join(nodeDirectory, 'result.jsonl'), 'utf8');
  assert.match(result, /你好喵/);
  assert.match(result, /world喵/);
  const node = run.nodes.find((item) => item.path === 'script');
  assert.deepEqual(node.artifacts.map((item) => item.port), ['result']);
});

test('module commands run as separate child processes', async () => {
  const moduleId = randomUUID();
  const graphId = randomUUID();
  const script = "console.log('pid=' + process.pid + ' ppid=' + process.ppid);";
  const uploaded = await call('/modules/assets', {
    method: 'POST',
    body: {
      kind: 'file',
      name: 'pid.js',
      files: [{ path: 'pid.js', data: Buffer.from(script, 'utf8').toString('base64') }],
    },
  });
  const asset = uploaded.payload.asset;
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: moduleId,
        name: 'Pid module',
        kind: 'command',
        command: 'node pid.js',
        inputs: [],
        outputs: [],
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
        id: graphId,
        name: 'Pid graph',
        layout: 'vertical',
        nodes: [{ id: 'pid', moduleId, x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', { method: 'POST', body: { graphId } });
  const run = await waitForRun(submitted.payload.experiment.id);
  assert.equal(run.status, 'succeeded', JSON.stringify(run.nodes));
  const match = run.nodes[0].stdoutTail.match(/pid=(\d+) ppid=(\d+)/);
  assert.ok(match);
  assert.notEqual(Number(match[1]), process.pid);
  assert.notEqual(Number(match[2]), process.pid);
});

test('module assets can be uploaded and run without an explicit command', async () => {
  const assetModuleId = randomUUID();
  const assetGraphId = randomUUID();
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
        id: assetModuleId,
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
    existsSync(path.join(home, 'storages', 'aether', 'resources', 'modules', assetModuleId, 'resource.json')),
    true,
  );
  assert.equal(
    existsSync(
      path.join(home, 'storages', 'aether', 'resources', 'modules', assetModuleId, 'files', 'run.js'),
    ),
    true,
  );

  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        id: assetGraphId,
        name: 'Asset graph',
        layout: 'vertical',
        nodes: [{ id: 'asset', moduleId: assetModuleId, label: 'Asset', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  assert.equal(graph.status, 200);

  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: assetGraphId },
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
  const requiredSourceId = randomUUID();
  const requiredTargetId = randomUUID();
  const requiredGraphId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: requiredSourceId, name: 'Required source', kind: 'command', command: 'echo',
        inputs: [], outputs: ['result'],
      },
    },
  });
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: requiredTargetId, name: 'Required target', kind: 'command', command: 'echo',
        inputs: ['a', 'b'], outputs: [], requiredInputs: ['a'],
      },
    },
  });
  const baseGraph = {
    id: requiredGraphId,
    name: 'Required graph',
    layout: 'vertical',
    nodes: [
      { id: 's', moduleId: requiredSourceId, label: 'Source', x: 40, y: 40 },
      { id: 't', moduleId: requiredTargetId, label: 'Target', x: 40, y: 200 },
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
  const pipeline = await graphByName('演示流水线');
  const { status, payload } = await call('/experiments', {
    method: 'POST',
    body: { graphId: pipeline.id },
  });
  assert.equal(status, 400);
  assert.match(payload.error, /子图/);

  const state = await call('/state');
  assert.equal(state.payload.graphs.find((graph) => graph.id === pipeline.id).isSubgraph, true);
});

test('submitting a graph executes subgraph nodes in dependency order', async () => {
  const nightly = await graphByName('夜间实验');
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: nightly.id, name: 'nightly smoke', concurrency: 2 },
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
  const report = await moduleByName('生成报告');
  const graph = await call('/graphs', {
    method: 'POST',
    body: {
      graph: {
        name: 'Failure graph',
        nodes: [
          { id: 'boom', moduleId: failId },
          { id: 'after', moduleId: report.id },
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
  const artifactModuleId = randomUUID();
  const artifactGraphId = randomUUID();
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
        id: artifactModuleId,
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
        id: artifactGraphId,
        name: 'Artifact graph',
        layout: 'vertical',
        nodes: [{ id: 'artifact', moduleId: artifactModuleId, label: 'Artifact', x: 40, y: 40 }],
        edges: [],
      },
    },
  });
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: artifactGraphId },
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
  const categoryGraphId = randomUUID();
  const categoryGraphModuleId = randomUUID();
  await call('/graphs', {
    method: 'POST',
    body: {
      graph: { id: categoryGraphId, name: 'Category graph', layout: 'vertical', nodes: [], edges: [] },
    },
  });
  assert.equal(existsSync(path.join(root, 'experiments', categoryGraphId, 'experiment.json')), true);

  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: categoryGraphModuleId,
        name: 'Category graph module',
        kind: 'graph',
        graphId: categoryGraphId,
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(
    existsSync(path.join(root, 'resources', 'subgraphs', categoryGraphModuleId, 'resource.json')),
    true,
  );
  assert.equal(existsSync(path.join(root, 'subgraphs', categoryGraphId, 'subgraph.json')), true);
  assert.equal(existsSync(path.join(root, 'experiments', categoryGraphId)), false);

  await call(`/modules?id=${categoryGraphModuleId}`, { method: 'DELETE' });
  assert.equal(existsSync(path.join(root, 'experiments', categoryGraphId, 'experiment.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', categoryGraphId)), false);
});

test('resources are immutable after creation', async () => {
  const root = path.join(home, 'storages', 'aether');
  const categoryModuleId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: categoryModuleId,
        name: 'Category module',
        kind: 'command',
        command: 'echo category',
        inputs: [],
        outputs: [],
      },
    },
  });
  assert.equal(existsSync(path.join(root, 'resources', 'modules', categoryModuleId, 'resource.json')), true);

  const updated = await call('/modules', {
    method: 'POST',
    body: {
      module: {
        id: categoryModuleId,
        name: 'Category module',
        kind: 'dataset',
        datasetUri: 'datasets/category.jsonl',
        inputs: [],
        outputs: ['rows'],
      },
    },
  });
  assert.equal(updated.status, 409);
  assert.match(updated.payload.error, /创建后不可修改/);
  assert.equal(existsSync(path.join(root, 'resources', 'modules', categoryModuleId, 'resource.json')), true);
  assert.equal(existsSync(path.join(root, 'resources', 'datasets', categoryModuleId)), false);
});

test('workspace export/import excludes runs', async () => {
  const nightly = await graphByName('夜间实验');
  const submitted = await call('/experiments', {
    method: 'POST',
    body: { graphId: nightly.id, name: 'Workspace export run' },
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

  const importTempId = randomUUID();
  await call('/modules', {
    method: 'POST',
    body: {
      create: true,
      module: {
        id: importTempId,
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
    restored.payload.modules.some((module) => module.id === importTempId),
    false,
  );
  assert.equal(restored.payload.experiments.length, before.payload.experiments.length);
  const runsAfter = await call('/experiments');
  assert.equal(
    runsAfter.payload.experiments.some((run) => run.id === submitted.payload.experiment.id),
    true,
  );
  const root = path.join(home, 'storages', 'aether');
  const nightlyAfter = await graphByName('夜间实验');
  const pipelineAfter = await graphByName('演示流水线');
  assert.equal(existsSync(path.join(root, 'experiments', nightlyAfter.id, 'experiment.json')), true);
  assert.equal(existsSync(path.join(root, 'subgraphs', pipelineAfter.id, 'subgraph.json')), true);
});

test('switching workspace migrates state and runs under the new root', async () => {
  const before = await call('/state');
  const moduleCount = before.payload.modules.length;
  const prepare = before.payload.modules.find((module) => module.name === '准备数据');
  const nightly = before.payload.graphs.find((graph) => graph.name === '夜间实验');
  const pipeline = before.payload.graphs.find((graph) => graph.name === '演示流水线');
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
  assert.equal(existsSync(path.join(target, 'resources', 'modules', prepare.id, 'resource.json')), true);
  assert.equal(existsSync(path.join(target, 'resources', 'modules', prepare.id, 'files')), true);
  assert.equal(existsSync(path.join(target, 'experiments', nightly.id, 'experiment.json')), true);
  assert.equal(existsSync(path.join(target, 'subgraphs', pipeline.id, 'subgraph.json')), true);

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
