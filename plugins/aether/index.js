// Aether — 有向无环图任务执行管理器（宿主侧）。
//
// 职责：保存模块、图、执行环境与实验记录；把图展开成 DAG 计划，解析每个节点的
// 执行环境并交给对应 Executor；通过 /aether-api 把状态与操作暴露给左侧栏面板。
// 数据放在 $DSH_HOME/storages/aether，运行产物按实验分目录保存。
import { promises as fsp } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  expandGraph,
  graphReferenceErrors,
  hydrateGraphPorts,
  normalizeEnvironments,
  normalizeGraph,
  normalizeModule,
  slugify,
  topoLayers,
  validateGraph,
  validateModule,
} from './dag.js';
import { LocalExecutor, resolvePlacements } from './executor.js';

const API_PREFIX = '/aether-api';
const DATA_VERSION = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_ASSET_FILES = 500;
const MAX_CONCURRENCY = 8;
const MAX_RUNS = 200;

// ------------------------------------------------------------------ 存储

function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function dataDir() {
  return path.join(homeDir(), 'storages', 'aether');
}

function statePath() {
  return path.join(dataDir(), 'state.json');
}

function runsDir() {
  return path.join(dataDir(), 'runs');
}

function runDir(id) {
  return path.join(runsDir(), id);
}

let stateCache = null;
let stateLoading = null;
let recoveredRuns = false;

function emptyState() {
  return {
    version: DATA_VERSION,
    modules: [],
    graphs: [],
    environments: normalizeEnvironments([]),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function seedState() {
  const now = Date.now();
  const modules = [
    normalizeModule({
      id: 'prepare',
      name: '准备数据',
      description: '输出一份示例数据集信息。',
      kind: 'command',
      command: 'node -e "console.log(JSON.stringify({dataset:\'demo\', rows: 128}))"',
      timeoutSec: 60,
      inputs: [],
      outputs: ['dataset'],
    }),
    normalizeModule({
      id: 'train',
      name: '训练模型',
      description: '按学习率训练一段时间，输出准确率。',
      kind: 'command',
      command:
        'node -e "const lr={{lr}}; const ms={{seconds}}*1000; console.log(\'training lr=\' + lr + \' for \' + ms + \'ms\'); setTimeout(() => console.log(JSON.stringify({lr, accuracy: Number((0.9 + Math.random()*0.08).toFixed(4))})), ms)"',
      timeoutSec: 120,
      params: { lr: 0.01, seconds: 2 },
      inputs: ['dataset'],
      outputs: ['model'],
    }),
    normalizeModule({
      id: 'evaluate',
      name: '评估结果',
      description: '读取上游节点，汇总评估信息。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const j=JSON.parse(fs.readFileSync(process.env.AETHER_INPUT_FILE,\'utf8\')); const names=Object.keys(j.inputs); console.log(\'evaluated upstream: \' + names.join(\', \'))"',
      timeoutSec: 60,
      inputs: ['model'],
      outputs: ['metrics'],
    }),
    normalizeModule({
      id: 'report',
      name: '生成报告',
      description: '在实验目录写一份 Markdown 报告。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const path=require(\'path\'); const file=path.join(process.env.AETHER_NODE_DIR,\'report.md\'); fs.writeFileSync(file, \'# Aether demo report\\n\'); console.log(\'report -> \' + file)"',
      timeoutSec: 60,
      inputs: ['metrics'],
      outputs: [],
    }),
    normalizeModule({
      id: 'demo-dataset',
      name: '示例数据集',
      description: '一个数据集节点：执行时把 URI 与格式写给下游，不启动命令。',
      kind: 'dataset',
      datasetUri: 'datasets/demo.jsonl',
      datasetFormat: 'jsonl',
      inputs: [],
      outputs: ['rows'],
    }),
    normalizeModule({
      id: 'demo-pipeline',
      name: '演示流水线（子图）',
      description: '把“准备 → 训练 → 评估”打包成一个可复用的子图模块。',
      kind: 'graph',
      graphId: 'demo-pipeline',
      inputs: ['dataset'],
      outputs: ['metrics'],
    }),
  ];
  const graphs = [
    normalizeGraph({
      id: 'demo-pipeline',
      name: '演示流水线',
      description: '准备数据、训练模型、评估结果三个节点串行执行。',
      nodes: [
        { id: 'prepare', moduleId: 'prepare', label: '准备数据', x: 40, y: 80 },
        { id: 'train', moduleId: 'train', label: '训练', params: { lr: 0.02 }, x: 330, y: 80 },
        { id: 'evaluate', moduleId: 'evaluate', label: '评估', x: 620, y: 80 },
      ],
      edges: [
        { id: 'e1', from: 'prepare', to: 'train', fromPort: 'dataset', toPort: 'dataset' },
        { id: 'e2', from: 'train', to: 'evaluate', fromPort: 'model', toPort: 'model' },
      ],
    }),
    normalizeGraph({
      id: 'nightly-experiment',
      name: '夜间实验',
      description: '把一个子图模块和一个报告节点拼成实验图。',
      nodes: [
        { id: 'pipeline', moduleId: 'demo-pipeline', label: '流水线', x: 40, y: 80 },
        { id: 'report', moduleId: 'report', label: '生成报告', x: 330, y: 80 },
      ],
      edges: [{ id: 'e1', from: 'pipeline', to: 'report', fromPort: 'metrics', toPort: 'metrics' }],
    }),
  ];
  return {
    version: DATA_VERSION,
    modules: modules.map((module) => ({ ...module, createdAt: now, updatedAt: now })),
    graphs: graphs.map((graph) => ({ ...graph, createdAt: now, updatedAt: now })),
    environments: normalizeEnvironments([]),
    createdAt: now,
    updatedAt: now,
    seeded: true,
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    version: DATA_VERSION,
    modules: (Array.isArray(source.modules) ? source.modules : []).map(normalizeModule).filter((m) => m.id),
    graphs: (Array.isArray(source.graphs) ? source.graphs : []).map(normalizeGraph).filter((g) => g.id),
    environments: normalizeEnvironments(source.environments),
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

async function readState() {
  if (stateCache) return stateCache;
  if (!stateLoading) {
    stateLoading = loadState().finally(() => {
      stateLoading = null;
    });
  }
  return stateLoading;
}

async function loadState() {
  await fsp.mkdir(dataDir(), { recursive: true });
  try {
    const text = await fsp.readFile(statePath(), 'utf8');
    const parsed = JSON.parse(text);
    const legacyLayout = new Set(
      (Array.isArray(parsed.graphs) ? parsed.graphs : [])
        .filter((graph) => graph && !graph.layout)
        .map((graph) => graph.id),
    );
    stateCache = normalizeState(parsed);
    // v1 → v2 补执行环境；v2 → v3 补模块端口与旧连线的默认端口；
    // v3 → v4 记录布局方向，旧实验的横向坐标清空后按默认「上下」重新布局；
    // v4 → v5 给模块补版本号与版本历史。
    for (const graph of stateCache.graphs) {
      if (legacyLayout.has(graph.id)) {
        for (const node of graph.nodes) {
          node.x = null;
          node.y = null;
        }
      }
      hydrateGraphPorts(graph, stateCache.modules);
    }
    if (Number(parsed.version) !== DATA_VERSION || !Array.isArray(parsed.environments) || legacyLayout.size) {
      await writeState(stateCache);
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      stateCache = seedState();
    } else {
      // 状态文件损坏：留一份备份，再从示例数据重建，避免整个面板打不开。
      const backup = path.join(dataDir(), `state.corrupt-${Date.now()}.json`);
      await fsp.rename(statePath(), backup).catch(() => {});
      stateCache = seedState();
    }
    await writeState(stateCache);
  }
  return stateCache;
}

async function renameWithRetry(source, target) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fsp.rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (error && error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function writeState(next) {
  stateCache = next;
  await fsp.mkdir(dataDir(), { recursive: true });
  const text = JSON.stringify(next, null, 2);
  const tmp = `${statePath()}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await renameWithRetry(tmp, statePath());
}

// ------------------------------------------------------------- 运行记录

function summarizeRun(run, { detail = false } = {}) {
  const nodes = (run.nodes || []).map((node) => ({
    path: node.path,
    nodeId: node.nodeId,
    moduleId: node.moduleId,
    moduleName: node.moduleName,
    moduleVersion: node.moduleVersion || 1,
    label: node.label,
    kind: node.kind,
    deps: node.deps,
    params: node.params,
    environmentId: node.environmentId || 'local',
    environmentName: node.environmentName || '',
    executor: node.executor || 'local',
    inputs: node.inputs || [],
    outputs: node.outputs || [],
    datasetUri: node.datasetUri || '',
    datasetFormat: node.datasetFormat || '',
    status: node.status,
    startedAt: node.startedAt || null,
    endedAt: node.endedAt || null,
    exitCode: node.exitCode,
    error: node.error || '',
    ...(detail ? { stdoutTail: node.stdoutTail || '', stderrTail: node.stderrTail || '' } : {}),
  }));
  const counts = { total: nodes.length, succeeded: 0, failed: 0, running: 0, pending: 0, skipped: 0, cancelled: 0 };
  for (const node of nodes) {
    if (counts[node.status] !== undefined) counts[node.status] += 1;
  }
  counts.done = counts.succeeded + counts.failed + counts.skipped + counts.cancelled;
  return {
    id: run.id,
    name: run.name,
    graphId: run.graphId,
    graphName: run.graphName,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt || null,
    endedAt: run.endedAt || null,
    concurrency: run.concurrency,
    layout: run.layout === 'horizontal' ? 'horizontal' : 'vertical',
    executor: run.executor || 'local',
    message: run.message || '',
    rerunOf: run.rerunOf || null,
    dir: run.dir,
    counts,
    nodes,
    edges: (run.edges || []).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromPort: edge.fromPort || '',
      toPort: edge.toPort || '',
    })),
  };
}

function summarizeRunLight(run) {
  const summary = summarizeRun(run);
  return {
    ...summary,
    nodes: summary.nodes.map(({ stdoutTail, stderrTail, ...node }) => node),
  };
}

async function persistRun(run) {
  await fsp.mkdir(run.dir, { recursive: true });
  const file = path.join(run.dir, 'run.json');
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(run, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

async function readRunFromDisk(id) {
  if (!id || /[\\/]/.test(id)) return null;
  try {
    const text = await fsp.readFile(path.join(runDir(id), 'run.json'), 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function listRunsFromDisk() {
  if (!recoveredRuns) {
    recoveredRuns = true;
    await recoverInterruptedRuns();
  }
  let entries = [];
  try {
    entries = await fsp.readdir(runsDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const run = await readRunFromDisk(entry.name);
    if (run) runs.push(run);
  }
  runs.sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
  return runs.slice(0, MAX_RUNS);
}

async function recoverInterruptedRuns() {
  let entries = [];
  try {
    entries = await fsp.readdir(runsDir(), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const run = await readRunFromDisk(entry.name);
    if (!run || run.status !== 'running' || activeRuns.has(run.id)) continue;
    run.status = 'failed';
    run.message = 'Aether 重启前实验未结束';
    run.endedAt = Date.now();
    for (const node of run.nodes || []) {
      if (node.status === 'running') {
        node.status = 'failed';
        node.error = '实验被中断';
        node.endedAt = Date.now();
      } else if (node.status === 'pending') {
        node.status = 'skipped';
        node.error = '实验被中断';
      }
    }
    await persistRun(run).catch(() => {});
  }
}

// -------------------------------------------------------------- 执行引擎

const activeRuns = new Map();
const executorRegistry = new Map();

function clampConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(number)));
}

function registerExecutor(executor) {
  const descriptor = executor.describe();
  executorRegistry.set(descriptor.id, executor);
  return descriptor;
}

/** 内置本机执行器。未来远端执行器在这里注册，其余代码不用改。 */
registerExecutor(new LocalExecutor({ persist: persistRun }));

function availableExecutorIds() {
  return [...executorRegistry.values()]
    .filter((executor) => executor.describe().available)
    .map((executor) => executor.describe().id);
}

function executorFor(executorId) {
  return executorRegistry.get(executorId || 'local') || null;
}

function executorDescriptors() {
  return [...executorRegistry.values()].map((executor) => executor.describe());
}

/**
 * 计划 → placement。当前在本机按环境目录解析；接入服务器调度时，把这个函数
 * 换成「把展开后的 plan 提交给调度器并读取 placement」即可，后续创建与执行
 * 流程不用改。返回 { placements, executors, errors }。
 */
async function placePlan(plan, state) {
  return resolvePlacements(plan.nodes, state.environments, availableExecutorIds());
}

async function startExperiment(input = {}) {
  const state = await readState();
  const graph = state.graphs.find((item) => item.id === input.graphId);
  if (!graph) throw httpError(404, `实验不存在：${input.graphId || '（空）'}`);
  const referencedBy = graphUsage(state, graph.id);
  if (referencedBy.length) {
    throw httpError(
      400,
      `「${graph.name}」是子图，不能单独运行；请在引用它的实验里运行（引用方：${referencedBy
        .map((module) => module.name)
        .join('、')}）`,
    );
  }
  const graphErrors = validateGraph(graph, state.modules, state.graphs);
  if (graphErrors.length) throw httpError(400, graphErrors.join('；'));
  const plan = expandGraph(graph, state.modules, state.graphs);
  if (plan.error) throw httpError(400, plan.error);
  if (!plan.nodes.length) throw httpError(400, '实验里没有节点，无法运行');

  // 执行环境 → 执行器。当前只有本机；将来这里换成向服务器提交计划、由调度器
  // 返回 placement，节点字段与存储格式保持不变。
  const placement = await placePlan(plan, state);
  if (placement.errors.length) throw httpError(400, placement.errors.join('；'));
  if (placement.executors.length > 1) {
    throw httpError(400, '这个计划需要多个执行器；跨执行器的调度需要服务器支持，当前只支持单一执行器');
  }
  const executor = executorFor(placement.executors[0] || 'local');
  if (!executor || !executor.describe().available) {
    throw httpError(400, '没有可用的执行器');
  }

  const now = Date.now();
  const id = `exp-${now.toString(36)}-${randomUUID().slice(0, 4)}`;
  const concurrency = clampConcurrency(input.concurrency);
  const nodes = plan.nodes.map((node) => {
    const target = placement.placements[node.path] || {
      environmentId: node.environmentId || 'local',
      environmentName: '',
      executor: 'local',
    };
    return {
      path: node.path,
      nodeId: node.nodeId,
      moduleId: node.moduleId,
      moduleName: node.moduleName,
      moduleVersion: node.moduleVersion || 1,
      label: node.label,
      kind: node.kind,
      params: node.params,
      deps: node.deps,
      command: node.command,
      cwd: node.cwd,
      timeoutSec: node.timeoutSec,
      environmentId: target.environmentId,
      environmentName: target.environmentName,
      executor: target.executor,
      inputs: node.inputs || [],
      outputs: node.outputs || [],
      datasetUri: node.datasetUri || '',
      datasetFormat: node.datasetFormat || '',
      assetPath: node.assetPath ? path.resolve(dataDir(), node.assetPath) : '',
      assetKind: node.assetKind || '',
      assetName: node.assetName || '',
      status: 'pending',
      startedAt: null,
      endedAt: null,
      exitCode: null,
      error: '',
      stdoutTail: '',
      stderrTail: '',
    };
  });
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const runEdges = Array.isArray(plan.edges)
    ? plan.edges.map((edge, index) => ({
        id: `e-${index + 1}`,
        from: edge.from,
        to: edge.to,
        fromPort: edge.fromPort,
        toPort: edge.toPort,
      }))
    : [];
  if (!runEdges.length && plan.edges === undefined) {
    const outCounts = new Map();
    const inCounts = new Map();
    const seenEdges = new Set();
    for (const node of nodes) {
      for (const depPath of node.deps || []) {
        const source = byPath.get(depPath);
        if (!source) continue;
        const outputs = source.outputs || [];
        const inputs = node.inputs || [];
        const outIndex = outCounts.get(depPath) || 0;
        const inIndex = inCounts.get(node.path) || 0;
        const fromPort = outputs.length ? outputs[outIndex % outputs.length] : '';
        const toPort = inputs.length ? inputs[inIndex % inputs.length] : '';
        const key = `${depPath}>${node.path}>${fromPort}>${toPort}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        outCounts.set(depPath, outIndex + 1);
        inCounts.set(node.path, inIndex + 1);
        runEdges.push({
          id: `e-${runEdges.length + 1}`,
          from: depPath,
          to: node.path,
          fromPort,
          toPort,
        });
      }
    }
  }
  const run = {
    id,
    graphId: graph.id,
    graphName: graph.name,
    name: String(input.name || '').trim().slice(0, 120) || `${graph.name} · ${new Date(now).toLocaleString('zh-CN')}`,
    status: 'running',
    createdAt: now,
    startedAt: now,
    endedAt: null,
    concurrency,
    layout: graph.layout === 'horizontal' ? 'horizontal' : 'vertical',
    message: '',
    rerunOf: input.rerunOf || null,
    executor: executor.describe().id,
    dir: runDir(id),
    nodes,
    edges: runEdges,
  };
  await fsp.mkdir(path.join(run.dir, 'nodes'), { recursive: true });
  await fsp.mkdir(path.join(run.dir, 'outputs'), { recursive: true });
  await fsp.mkdir(path.join(run.dir, 'logs'), { recursive: true });
  await persistRun(run);

  let handle;
  try {
    handle = executor.start(run, plan);
  } catch (error) {
    run.status = 'failed';
    run.message = `执行器启动失败：${error && error.message ? error.message : error}`;
    run.endedAt = Date.now();
    await persistRun(run).catch(() => {});
    throw httpError(500, run.message);
  }
  activeRuns.set(run.id, handle);
  void Promise.resolve(handle.done)
    .catch(async (error) => {
      run.status = 'failed';
      run.message = `执行失败：${error && error.message ? error.message : error}`;
      run.endedAt = Date.now();
      await persistRun(run).catch(() => {});
    })
    .finally(() => {
      if (activeRuns.get(run.id) === handle) activeRuns.delete(run.id);
    });
  return summarizeRun(run, { detail: true });
}

async function cancelExperiment(id) {
  const handle = activeRuns.get(id);
  if (handle) {
    await handle.cancel();
    return { ok: true, id, cancelling: true };
  }
  const run = await readRunFromDisk(id);
  if (!run) throw httpError(404, '实验不存在');
  if (run.status === 'running') {
    run.status = 'cancelled';
    run.message = '已取消';
    run.endedAt = Date.now();
    for (const node of run.nodes || []) {
      if (node.status === 'running' || node.status === 'pending') {
        node.status = 'cancelled';
        node.error = '已取消';
      }
    }
    await persistRun(run);
  }
  return { ok: true, id, cancelling: false };
}

async function deleteExperiment(id) {
  if (activeRuns.has(id)) throw httpError(409, '实验仍在运行，请先取消');
  const run = await readRunFromDisk(id);
  if (!run) throw httpError(404, '实验不存在');
  if (run.status === 'running') throw httpError(409, '实验仍在运行，请先取消');
  await fsp.rm(runDir(id), { recursive: true, force: true });
  return { ok: true, id };
}

function openDirectory(directory) {
  const target = path.resolve(directory);
  if (process.platform === 'win32') {
    spawn('explorer', [target], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  }
  return { ok: true, path: target };
}

// ------------------------------------------------------------------ 视图

function moduleUsage(state, moduleId) {
  const graphs = [];
  for (const graph of state.graphs) {
    if (graph.nodes.some((node) => node.moduleId === moduleId)) {
      graphs.push({ id: graph.id, name: graph.name });
    }
  }
  return graphs;
}

function graphUsage(state, graphId) {
  return state.modules
    .filter((module) => module.kind === 'graph' && module.graphId === graphId)
    .map((module) => ({ id: module.id, name: module.name }));
}

function graphSummary(graph) {
  const layers = topoLayers(graph.nodes, graph.edges) || [];
  return {
    id: graph.id,
    name: graph.name,
    description: graph.description,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    layerCount: layers.length,
    updatedAt: graph.updatedAt || graph.createdAt || 0,
  };
}

async function buildStatePayload() {
  const state = await readState();
  const runs = await listRunsFromDisk();
  const modules = state.modules.map((module) => {
    const usedBy = moduleUsage(state, module.id);
    const environment = state.environments.find((item) => item.id === module.environmentId);
    const { versions = [], ...rest } = module;
    return {
      ...rest,
      version: module.version || 1,
      versionCount: versions.length,
      usedBy,
      environmentName: environment ? environment.name : module.environmentId,
      subgraphName:
        module.kind === 'graph' ? state.graphs.find((graph) => graph.id === module.graphId)?.name || '' : '',
    };
  });
  const graphs = state.graphs.map((graph) => {
    const usedBy = graphUsage(state, graph.id);
    return {
      ...graphSummary(graph),
      usedBy,
      isSubgraph: usedBy.length > 0,
      nodeCount: graph.nodes.length,
    };
  });
  return {
    ok: true,
    version: DATA_VERSION,
    workspace: dataDir(),
    modules,
    graphs,
    environments: state.environments,
    executors: executorDescriptors(),
    experiments: runs.map(summarizeRunLight),
    activeRuns: activeRuns.size,
    maxConcurrency: MAX_CONCURRENCY,
  };
}

function planSummary(graph, state) {
  const plan = expandGraph(graph, state.modules, state.graphs);
  if (plan.error) return { error: plan.error, nodes: [], entries: [], exits: [], layerCount: 0 };
  const depth = new Map();
  for (const node of plan.nodes) {
    const parents = node.deps || [];
    depth.set(node.path, parents.length ? Math.max(...parents.map((dep) => (depth.get(dep) || 0) + 1)) : 0);
  }
  const layerCount = plan.nodes.length ? Math.max(...[...depth.values()]) + 1 : 0;
  return {
    error: null,
    entries: plan.entries,
    exits: plan.exits,
    layerCount,
    nodes: plan.nodes.map((node) => ({
      path: node.path,
      label: node.label,
      moduleId: node.moduleId,
      moduleName: node.moduleName,
      kind: node.kind,
      params: node.params,
      deps: node.deps,
      environmentId: node.environmentId || 'local',
      environmentName: state.environments.find((item) => item.id === (node.environmentId || 'local'))?.name || '',
      layer: depth.get(node.path) || 0,
    })),
  };
}

// ------------------------------------------------------------------ HTTP

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, '请求体过大');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, '请求体不是合法 JSON');
  }
}

function uniqueId(base, taken, fallback) {
  const root = base || fallback;
  if (!taken.has(root)) return root;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${root}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function moduleContentFields(module) {
  return {
    name: module.name,
    description: module.description,
    kind: module.kind,
    command: module.command,
    cwd: module.cwd,
    timeoutSec: module.timeoutSec,
    params: module.params || {},
    inputs: module.inputs || [],
    outputs: module.outputs || [],
    graphId: module.graphId,
    datasetUri: module.datasetUri,
    datasetFormat: module.datasetFormat,
    assetId: module.assetId,
    assetKind: module.assetKind,
    assetName: module.assetName,
    assetPath: module.assetPath,
    assetFileCount: module.assetFileCount,
    environmentId: module.environmentId,
  };
}

function sameModuleContent(left, right) {
  return JSON.stringify(moduleContentFields(left)) === JSON.stringify(moduleContentFields(right));
}

function moduleSnapshot(module) {
  return { version: module.version || 1, savedAt: Date.now(), ...moduleContentFields(module) };
}

function assetBaseDir() {
  return path.join(dataDir(), 'modules', 'assets');
}

function moduleAssetRoot(module) {
  if (!module || !module.assetPath) return '';
  const root = path.resolve(dataDir(), module.assetPath);
  const base = path.resolve(assetBaseDir());
  if (root !== base && !root.startsWith(base + path.sep)) return '';
  return root;
}

function safeAssetRelative(raw) {
  const text = String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const parts = text.split('/');
  if (
    !parts.length ||
    parts.some((part) => !part || part === '.' || part === '..' || part.includes(':')) ||
    text.length > 240
  ) {
    throw httpError(400, `模块文件路径不合法：${raw}`);
  }
  return parts.join(path.sep);
}

async function storeModuleAsset(body) {
  const kind = body.kind === 'directory' ? 'directory' : 'file';
  const name = String(body.name || '').trim().slice(0, 120) || (kind === 'file' ? 'module-file' : 'module-dir');
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) throw httpError(400, '请至少提交一个模块文件');
  if (files.length > MAX_ASSET_FILES) throw httpError(400, `模块文件数量不能超过 ${MAX_ASSET_FILES}`);
  let total = 0;
  const decoded = files.map((file) => {
    const relative = safeAssetRelative(file && file.path);
    const data = file && typeof file.data === 'string' ? file.data : '';
    if (!data) throw httpError(400, `模块文件内容为空：${relative}`);
    const buffer = Buffer.from(data, 'base64');
    total += buffer.length;
    if (total > MAX_ASSET_BYTES) {
      throw httpError(413, `模块文件总大小超过 ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB`);
    }
    return { relative, buffer };
  });
  if (kind === 'file' && decoded.length !== 1) throw httpError(400, '提交单个文件时只能包含一个文件');

  const assetId = `asset-${randomUUID()}`;
  const root = path.join(assetBaseDir(), assetId);
  try {
    await fsp.mkdir(root, { recursive: true });
    for (const item of decoded) {
      const target = path.join(root, item.relative);
      if (!target.startsWith(root + path.sep)) throw httpError(400, '模块文件路径越界');
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, item.buffer);
    }
  } catch (error) {
    await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return {
    assetId,
    assetKind: kind,
    assetName: name,
    assetPath: path.join('modules', 'assets', assetId),
    assetFileCount: decoded.length,
    assetSize: total,
  };
}

async function saveModule(input, options = {}) {
  const state = await readState();
  const module = normalizeModule(input);
  const create = Boolean(options.create);
  const autoId = !module.id;
  if (create) {
    if (!module.id) module.id = slugify(module.name, 'module');
    if (state.modules.some((item) => item.id === module.id)) {
      if (!autoId) throw httpError(409, `模块 id「${module.id}」已存在，请换一个`);
      module.id = uniqueId(module.id, new Set(state.modules.map((item) => item.id)), 'module');
    }
  } else if (!module.id) {
    throw httpError(400, '缺少模块 id');
  }
  const existing = state.modules.find((item) => item.id === module.id);
  if (!create && !existing) throw httpError(404, '模块不存在');
  const errors = validateModule(module, state.modules, state.graphs, state.environments);
  if (module.assetId) {
    const root = moduleAssetRoot(module);
    if (!root) {
      errors.push('模块文件路径不合法，请重新提交文件或目录');
    } else {
      const rootStat = await fsp.stat(root).catch(() => null);
      if (!rootStat || !rootStat.isDirectory()) {
        errors.push('模块文件或目录不存在，请重新提交');
      } else if (module.assetKind === 'file') {
        const fileName = path.basename(module.assetName || '');
        const fileStat = fileName
          ? await fsp.stat(path.join(root, fileName)).catch(() => null)
          : null;
        if (!fileStat || !fileStat.isFile()) errors.push('模块文件不存在，请重新提交');
      }
    }
  } else if (create && module.kind === 'command' && options.requireAsset) {
    errors.push('新建命令模块需要提交对应的文件或目录');
  }
  if (errors.length) throw httpError(400, errors.join('；'));

  const overwriteVersion = Boolean(options.overwriteVersion);
  let version = 1;
  let versions = [];
  if (existing) {
    const existingVersions = Array.isArray(existing.versions) ? existing.versions : [];
    if (sameModuleContent(existing, module) || overwriteVersion) {
      version = existing.version || 1;
      versions = existingVersions;
    } else {
      version = (existing.version || 1) + 1;
      versions = [...existingVersions, moduleSnapshot(existing)].slice(-20);
    }
  }
  const savedModule = {
    ...module,
    version,
    versions,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const moduleList = existing
    ? state.modules.map((item) => (item.id === module.id ? savedModule : item))
    : [...state.modules, savedModule];
  const refErrors = graphReferenceErrors(state.graphs, moduleList);
  if (refErrors.length) throw httpError(400, refErrors.join('；'));

  await writeState({ ...state, modules: moduleList, updatedAt: Date.now() });
  return savedModule;
}

async function deleteModule(id) {
  const state = await readState();
  const module = state.modules.find((item) => item.id === id);
  if (!module) throw httpError(404, '模块不存在');
  const usedBy = moduleUsage(state, id);
  if (usedBy.length) {
    throw httpError(409, `模块仍被这些实验使用：${usedBy.map((graph) => graph.name).join('、')}，请先删除对应节点`);
  }
  await writeState({ ...state, modules: state.modules.filter((item) => item.id !== id), updatedAt: Date.now() });
  const assetRoot = moduleAssetRoot(module);
  if (assetRoot) await fsp.rm(assetRoot, { recursive: true, force: true }).catch(() => {});
  return { ok: true, id };
}

async function saveGraph(input) {
  const state = await readState();
  const graph = normalizeGraph(input);
  if (!graph.id) graph.id = slugify(graph.name, 'graph');
  const taken = new Set(state.graphs.filter((item) => item.id !== graph.id).map((item) => item.id));
  graph.id = uniqueId(graph.id, taken, 'graph');
  const existing = state.graphs.find((item) => item.id === graph.id);
  if (state.graphs.some((item) => item.id !== graph.id && item.name.toLowerCase() === graph.name.toLowerCase())) {
    throw httpError(400, `实验名称「${graph.name}」已被使用`);
  }
  hydrateGraphPorts(graph, state.modules);
  const errors = validateGraph(graph, state.modules, state.graphs);
  if (errors.length) throw httpError(400, errors.join('；'));

  const graphList = existing
    ? state.graphs.map((item) => (item.id === graph.id ? graph : item))
    : [...state.graphs, graph];
  const refErrors = graphReferenceErrors(graphList, state.modules);
  if (refErrors.length) throw httpError(400, refErrors.join('；'));

  graph.createdAt = existing?.createdAt || Date.now();
  graph.updatedAt = Date.now();
  await writeState({
    ...state,
    graphs: existing ? state.graphs.map((item) => (item.id === graph.id ? graph : item)) : [...state.graphs, graph],
    updatedAt: Date.now(),
  });
  return graph;
}

async function deleteGraph(id) {
  const state = await readState();
  const graph = state.graphs.find((item) => item.id === id);
  if (!graph) throw httpError(404, '实验不存在');
  const usedBy = graphUsage(state, id);
  if (usedBy.length) {
    throw httpError(409, `实验仍被这些子图模块引用：${usedBy.map((module) => module.name).join('、')}，请先删除对应模块`);
  }
  await writeState({ ...state, graphs: state.graphs.filter((item) => item.id !== id), updatedAt: Date.now() });
  return { ok: true, id };
}

async function handleApi(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const route = url.pathname.slice(API_PREFIX.length) || '/';
  const method = req.method || 'GET';

  if (method === 'GET' && route === '/state') {
    sendJson(res, 200, await buildStatePayload());
    return;
  }

  if (method === 'GET' && route === '/graphs') {
    const id = url.searchParams.get('id') || '';
    if (!id) {
      const state = await readState();
      sendJson(res, 200, { ok: true, graphs: state.graphs.map(graphSummary) });
      return;
    }
    const state = await readState();
    const graph = state.graphs.find((item) => item.id === id);
    if (!graph) throw httpError(404, '实验不存在');
    sendJson(res, 200, {
      ok: true,
      graph,
      plan: planSummary(graph, state),
      usedBy: graphUsage(state, id),
    });
    return;
  }

  if (method === 'POST' && route === '/graphs') {
    const body = await readBody(req);
    const graph = await saveGraph(body.graph || body);
    sendJson(res, 200, { ok: true, graph });
    return;
  }

  if (method === 'DELETE' && route === '/graphs') {
    sendJson(res, 200, await deleteGraph(url.searchParams.get('id') || ''));
    return;
  }

  if (method === 'POST' && route === '/graphs/validate') {
    const body = await readBody(req);
    const state = await readState();
    const graph = normalizeGraph(body.graph || body);
    const errors = validateGraph(graph, state.modules, state.graphs);
    const candidate = graph.id ? state.graphs.map((item) => (item.id === graph.id ? graph : item)) : [...state.graphs, graph];
    const refErrors = graphReferenceErrors(candidate, state.modules);
    sendJson(res, 200, {
      ok: true,
      errors: [...errors, ...refErrors],
      plan: graph.nodes.length ? planSummary(graph, state) : null,
    });
    return;
  }

  if (method === 'POST' && route === '/modules/assets') {
    const body = await readBody(req, MAX_ASSET_BYTES * 2);
    sendJson(res, 200, { ok: true, asset: await storeModuleAsset(body) });
    return;
  }

  if (method === 'POST' && route === '/modules') {
    const body = await readBody(req);
    const module = await saveModule(body.module || body, {
      create: Boolean(body.create),
      overwriteVersion: Boolean(body.overwriteVersion),
      requireAsset: Boolean(body.requireAsset),
    });
    sendJson(res, 200, { ok: true, module });
    return;
  }

  if (method === 'DELETE' && route === '/modules') {
    sendJson(res, 200, await deleteModule(url.searchParams.get('id') || ''));
    return;
  }

  if (method === 'GET' && route === '/experiments') {
    const id = url.searchParams.get('id') || '';
    if (!id) {
      sendJson(res, 200, { ok: true, experiments: (await listRunsFromDisk()).map(summarizeRunLight) });
      return;
    }
    const active = activeRuns.get(id)?.run;
    const run = active || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const detail = summarizeRun(run, { detail: true });
    sendJson(res, 200, { ok: true, experiment: detail, logRoot: path.join(run.dir, 'nodes') });
    return;
  }

  if (method === 'GET' && route === '/experiments/logs') {
    const id = url.searchParams.get('run') || '';
    const nodePath = url.searchParams.get('node') || '';
    const stream = url.searchParams.get('stream') === 'err' ? 'err' : 'out';
    if (!id || !nodePath) throw httpError(400, '缺少 run 或 node 参数');
    const run = activeRuns.get(id)?.run || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const executor = executorFor(run.executor);
    if (!executor) throw httpError(501, `执行器「${run.executor || 'local'}」未注册`);
    const text = await executor.readLog(run, nodePath, stream);
    sendText(res, 200, text);
    return;
  }

  if (method === 'POST' && route === '/experiments') {
    const body = await readBody(req);
    sendJson(res, 200, { ok: true, experiment: await startExperiment(body) });
    return;
  }

  if (method === 'POST' && route === '/experiments/cancel') {
    const body = await readBody(req);
    sendJson(res, 200, { ok: true, ...(await cancelExperiment(String(body.id || url.searchParams.get('id') || ''))) });
    return;
  }

  if (method === 'POST' && route === '/experiments/rerun') {
    const body = await readBody(req);
    const id = String(body.id || '');
    const active = activeRuns.get(id)?.run;
    const run = active || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const experiment = await startExperiment({
      graphId: run.graphId,
      concurrency: run.concurrency,
      rerunOf: run.id,
    });
    sendJson(res, 200, { ok: true, experiment });
    return;
  }

  if (method === 'DELETE' && route === '/experiments') {
    sendJson(res, 200, await deleteExperiment(url.searchParams.get('id') || ''));
    return;
  }

  if (method === 'POST' && route === '/workspace/open') {
    sendJson(res, 200, openDirectory(dataDir()));
    return;
  }

  if (method === 'POST' && route === '/experiments/open') {
    const body = await readBody(req);
    const id = String(body.id || '');
    const run = activeRuns.get(id)?.run || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    sendJson(res, 200, openDirectory(run.dir));
    return;
  }

  sendJson(res, 404, { ok: false, error: `未知接口 ${method} ${route}` });
}

export const inject = ['webServer'];

export function apply(ctx) {
  ctx.effect(() => {
    const route = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        const connection = ctx.get('connection');
        if (connection && typeof connection.requestRejection === 'function') {
          const rejection = connection.requestRejection(req);
          if (rejection !== undefined) {
            res.writeHead(rejection);
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
            return;
          }
        }
        try {
          await handleApi(req, res);
        } catch (error) {
          const status = Number(error?.status) || 500;
          sendJson(res, status, { ok: false, error: String(error?.message || error) });
        }
      },
    });
    return () => route();
  }, 'aether: http api');

  ctx.effect(
    () => () => {
      for (const handle of activeRuns.values()) {
        void handle.cancel?.();
      }
    },
    'aether: stop running experiments',
  );

  // 首次加载时把目录建好，并修复上次进程遗留的 running 记录。
  ctx.effect(
    () => {
      void readState()
        .then(() => listRunsFromDisk())
        .catch((error) => ctx.logger?.warn?.(`aether: 初始化失败：${error?.message || error}`));
    },
    'aether: warm up storage',
  );
}
