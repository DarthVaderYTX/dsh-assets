// Aether — 有向无环图任务执行管理器（宿主侧）。
//
// 职责：保存模块、图与实验记录；把图展开成 DAG 计划并按依赖调度执行；通过
// /aether-api 把状态与操作暴露给左侧栏面板。数据放在
// $DSH_HOME/storages/aether，运行产物按实验分目录保存。
import { promises as fsp, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  expandGraph,
  graphReferenceErrors,
  normalizeGraph,
  normalizeModule,
  slugify,
  topoLayers,
  validateGraph,
  validateModule,
} from './dag.js';

const API_PREFIX = '/aether-api';
const DATA_VERSION = 1;
const NODE_TAIL_LIMIT = 20000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
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

/** 节点路径里的 `/` 会被换成 `__`，避免在磁盘上建嵌套目录。 */
function safeSegment(value) {
  return String(value || 'node')
    .replace(/[\\/]+/g, '__')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .slice(0, 120) || 'node';
}

let stateCache = null;
let recoveredRuns = false;

function emptyState() {
  return { version: DATA_VERSION, modules: [], graphs: [], createdAt: Date.now(), updatedAt: Date.now() };
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
    }),
    normalizeModule({
      id: 'evaluate',
      name: '评估结果',
      description: '读取上游节点，汇总评估信息。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const j=JSON.parse(fs.readFileSync(process.env.AETHER_INPUT_FILE,\'utf8\')); const names=Object.keys(j.inputs); console.log(\'evaluated upstream: \' + names.join(\', \'))"',
      timeoutSec: 60,
    }),
    normalizeModule({
      id: 'report',
      name: '生成报告',
      description: '在实验目录写一份 Markdown 报告。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const path=require(\'path\'); const file=path.join(process.env.AETHER_NODE_DIR,\'report.md\'); fs.writeFileSync(file, \'# Aether demo report\\n\'); console.log(\'report -> \' + file)"',
      timeoutSec: 60,
    }),
    normalizeModule({
      id: 'demo-pipeline',
      name: '演示流水线（子图）',
      description: '把“准备 → 训练 → 评估”打包成一个可复用的子图模块。',
      kind: 'graph',
      graphId: 'demo-pipeline',
    }),
  ];
  const graphs = [
    normalizeGraph({
      id: 'demo-pipeline',
      name: '演示流水线',
      description: '准备数据、训练模型、评估结果三个节点串行执行。',
      nodes: [
        { id: 'prepare', moduleId: 'prepare', label: '准备数据' },
        { id: 'train', moduleId: 'train', label: '训练', params: { lr: 0.02 } },
        { id: 'evaluate', moduleId: 'evaluate', label: '评估' },
      ],
      edges: [
        { id: 'e1', from: 'prepare', to: 'train' },
        { id: 'e2', from: 'train', to: 'evaluate' },
      ],
    }),
    normalizeGraph({
      id: 'nightly-experiment',
      name: '夜间实验',
      description: '把一个子图模块和一个报告节点拼成实验图。',
      nodes: [
        { id: 'pipeline', moduleId: 'demo-pipeline', label: '流水线' },
        { id: 'report', moduleId: 'report', label: '生成报告' },
      ],
      edges: [{ id: 'e1', from: 'pipeline', to: 'report' }],
    }),
  ];
  return {
    version: DATA_VERSION,
    modules: modules.map((module) => ({ ...module, createdAt: now, updatedAt: now })),
    graphs: graphs.map((graph) => ({ ...graph, createdAt: now, updatedAt: now })),
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
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

async function readState() {
  if (stateCache) return stateCache;
  await fsp.mkdir(dataDir(), { recursive: true });
  try {
    const text = await fsp.readFile(statePath(), 'utf8');
    stateCache = normalizeState(JSON.parse(text));
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

async function writeState(next) {
  stateCache = next;
  await fsp.mkdir(dataDir(), { recursive: true });
  const text = JSON.stringify(next, null, 2);
  const tmp = `${statePath()}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, statePath());
}

// ------------------------------------------------------------- 运行记录

function summarizeRun(run, { detail = false } = {}) {
  const nodes = (run.nodes || []).map((node) => ({
    path: node.path,
    nodeId: node.nodeId,
    moduleId: node.moduleId,
    moduleName: node.moduleName,
    label: node.label,
    kind: node.kind,
    deps: node.deps,
    params: node.params,
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
    message: run.message || '',
    rerunOf: run.rerunOf || null,
    dir: run.dir,
    counts,
    nodes,
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

function clampConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(number)));
}

function renderTemplate(text, params, builtins) {
  return String(text || '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) return String(params[key]);
    if (Object.prototype.hasOwnProperty.call(builtins, key)) return String(builtins[key]);
    return match;
  });
}

function resolveCwd(raw) {
  const text = String(raw || '').trim();
  if (!text) return process.cwd();
  let expanded = text;
  if (expanded === '~') expanded = os.homedir();
  else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) expanded = path.join(os.homedir(), expanded.slice(2));
  return path.resolve(expanded);
}

function paramEnvKey(key) {
  return `AETHER_PARAM_${String(key).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

function buildEnv(run, node, nodeDirectory, inputFile, inputs) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.AETHER_RUN_ID = run.id;
  env.AETHER_RUN_DIR = run.dir;
  env.AETHER_NODE_ID = node.nodeId;
  env.AETHER_NODE_PATH = node.path;
  env.AETHER_NODE_DIR = nodeDirectory;
  env.AETHER_GRAPH_ID = run.graphId;
  env.AETHER_GRAPH_NAME = run.graphName;
  env.AETHER_INPUT_FILE = inputFile;
  env.AETHER_PARAMS = JSON.stringify(node.params || {});
  env.AETHER_INPUTS = JSON.stringify(
    Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [
        key,
        { label: value.label, exitCode: value.exitCode, stdoutFile: value.stdoutFile, text: value.text },
      ]),
    ),
  );
  for (const [key, value] of Object.entries(node.params || {})) {
    env[paramEnvKey(key)] = String(value);
  }
  return env;
}

function appendTail(store, chunk) {
  store.push(chunk);
  let length = 0;
  for (let index = store.length - 1; index >= 0; index -= 1) {
    length += store[index].length;
    if (length > NODE_TAIL_LIMIT * 2) {
      store.splice(0, index);
      break;
    }
  }
}

function joinTail(store) {
  const text = store.join('');
  return text.length > NODE_TAIL_LIMIT ? `…${text.slice(-NODE_TAIL_LIMIT)}` : text;
}

function killTree(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    const pid = child.pid;
    if (!pid) return;
    const executable = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe')
      : 'taskkill';
    let killer;
    try {
      killer = spawn(executable, ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      killer = null;
    }
    if (!killer) {
      try {
        child.kill();
      } catch {
        // 忽略：进程可能已经退出。
      }
      return;
    }
    // 只结束 shell 父进程会让命令行留下的孙进程继续跑，所以优先整棵树；
    // taskkill 失败时再退回单进程结束。
    killer.on('error', () => {
      try {
        child.kill();
      } catch {
        // 同上。
      }
    });
    killer.on('exit', (code) => {
      if (code !== 0) {
        try {
          child.kill();
        } catch {
          // 同上。
        }
      }
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // 同上。
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // 同上。
    }
  }, 3000).unref?.();
}

async function readTextHead(file, limit = 4000) {
  let handle;
  try {
    handle = await fsp.open(file, 'r');
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return '';
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function executeNode(handle, node, byPath) {
  const { run } = handle;
  if (node.status !== 'pending') return;
  node.status = 'running';
  node.startedAt = Date.now();
  node.endedAt = null;
  node.exitCode = null;
  node.error = '';
  await persistRun(run).catch(() => {});

  const directory = path.join(run.dir, 'nodes', safeSegment(node.path));
  await fsp.mkdir(directory, { recursive: true });
  const inputs = {};
  for (const depPath of node.deps || []) {
    const dep = byPath.get(depPath);
    const stdoutFile = path.join(run.dir, 'outputs', `${safeSegment(depPath)}.out`);
    const text = await readTextHead(stdoutFile);
    inputs[depPath] = {
      label: dep?.label || depPath,
      status: dep?.status || 'unknown',
      exitCode: dep?.exitCode ?? null,
      stdoutFile,
      text,
    };
  }
  const inputFile = path.join(directory, 'inputs.json');
  await fsp
    .writeFile(inputFile, JSON.stringify({ run: run.id, node: node.path, params: node.params, inputs }, null, 2), 'utf8')
    .catch(() => {});

  const builtins = {
    run_id: run.id,
    run_dir: run.dir,
    node_id: node.nodeId,
    node_path: node.path,
    node_dir: directory,
    graph_id: run.graphId,
    input_file: inputFile,
  };
  const command = renderTemplate(node.command, node.params || {}, builtins);
  const outLog = path.join(directory, 'stdout.log');
  const errLog = path.join(directory, 'stderr.log');
  const outStream = createWriteStream(outLog);
  const errStream = createWriteStream(errLog);
  const outTail = [];
  const errTail = [];

  let timedOut = false;
  const startedAt = Date.now();
  const timeoutMs = Math.max(1, Number(node.timeoutSec) || 300) * 1000;
  let child;
  let closeResult = { code: null, signal: null };
  let spawnError = null;

  try {
    child = spawn(command, {
      shell: true,
      cwd: resolveCwd(node.cwd),
      env: buildEnv(run, node, directory, inputFile, inputs),
      windowsHide: true,
    });
  } catch (error) {
    spawnError = error;
  }

  if (child) {
    handle.children.add(child);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    timer.unref?.();
    await new Promise((resolve) => {
      child.stdout?.on('data', (chunk) => {
        outStream.write(chunk);
        appendTail(outTail, String(chunk));
      });
      child.stderr?.on('data', (chunk) => {
        errStream.write(chunk);
        appendTail(errTail, String(chunk));
      });
      child.on('error', (error) => {
        spawnError = error;
        resolve();
      });
      child.on('close', (code, signal) => {
        closeResult = { code, signal };
        resolve();
      });
    });
    clearTimeout(timer);
    handle.children.delete(child);
  }

  await Promise.all([
    new Promise((resolve) => outStream.end(resolve)),
    new Promise((resolve) => errStream.end(resolve)),
  ]);

  node.endedAt = Date.now();  node.exitCode = closeResult.code;
  node.stdoutTail = joinTail(outTail);
  node.stderrTail = joinTail(errTail);
  node.durationMs = node.endedAt - startedAt;

  if (handle.cancelRequested) {
    node.status = 'cancelled';
    node.error = '已取消';
  } else if (timedOut) {
    node.status = 'failed';
    node.error = `超时（${Math.round(timeoutMs / 1000)} 秒）`;
  } else if (spawnError) {
    node.status = 'failed';
    node.error = String(spawnError.message || spawnError);
  } else if (closeResult.code === 0) {
    node.status = 'succeeded';
    node.error = '';
  } else if (closeResult.code === null) {
    node.status = 'failed';
    node.error = closeResult.signal ? `被信号 ${closeResult.signal} 终止` : '进程未能启动';
  } else {
    node.status = 'failed';
    node.error = `退出码 ${closeResult.code}`;
  }

  await fsp
    .copyFile(outLog, path.join(run.dir, 'outputs', `${safeSegment(node.path)}.out`))
    .catch(() => {});
  await persistRun(run).catch(() => {});
}

async function executeRun(handle) {
  const { run } = handle;
  const byPath = new Map(run.nodes.map((node) => [node.path, node]));
  await persistRun(run).catch(() => {});

  await new Promise((resolve) => {
    let finished = false;
    const finish = (status, message) => {
      if (finished) return;
      finished = true;
      run.status = status;
      run.message = message;
      run.endedAt = Date.now();
      activeRuns.delete(run.id);
      void persistRun(run).catch(() => {});
      resolve();
    };
    const pump = () => {
      if (finished) return;
      if (handle.cancelRequested) {
        for (const node of run.nodes) {
          if (node.status === 'pending') node.status = 'cancelled';
        }
        if (handle.children.size === 0) {
          finish('cancelled', '已取消');
          return;
        }
      }
      let running = 0;
      for (const node of run.nodes) if (node.status === 'running') running += 1;
      let launched = false;
      for (const node of run.nodes) {
        if (node.status !== 'pending') continue;
        if (handle.cancelRequested) {
          node.status = 'cancelled';
          continue;
        }
        const depStatuses = (node.deps || []).map((dep) => byPath.get(dep)?.status || 'failed');
        if (depStatuses.some((status) => status === 'failed' || status === 'skipped' || status === 'cancelled')) {
          node.status = 'skipped';
          node.error = '上游节点未成功';
          continue;
        }
        if (!depStatuses.every((status) => status === 'succeeded')) continue;
        if (running >= run.concurrency) continue;
        running += 1;
        launched = true;
        void executeNode(handle, node, byPath)
          .catch(async (error) => {
            node.status = 'failed';
            node.endedAt = Date.now();
            node.error = String(error?.message || error);
            await persistRun(run).catch(() => {});
          })
          .finally(() => pump());
      }
      if (finished) return;
      const settled = run.nodes.every((node) =>
        ['succeeded', 'failed', 'skipped', 'cancelled'].includes(node.status),
      );
      if (settled) {
        const succeeded = run.nodes.filter((node) => node.status === 'succeeded').length;
        const failed = run.nodes.some((node) => node.status === 'failed');
        const cancelled = run.nodes.some((node) => node.status === 'cancelled');
        finish(cancelled ? 'cancelled' : failed ? 'failed' : 'succeeded', `${succeeded}/${run.nodes.length} 个节点成功`);
        return;
      }
      if (!launched && running === 0) {
        for (const node of run.nodes) {
          if (node.status === 'pending') {
            node.status = 'skipped';
            node.error = '调度失败';
          }
        }
        finish('failed', '调度失败：没有可执行的节点');
      }
    };
    handle.wake = pump;
    pump();
  });
}

async function startExperiment(input = {}) {
  const state = await readState();
  const graph = state.graphs.find((item) => item.id === input.graphId);
  if (!graph) throw httpError(404, `图不存在：${input.graphId || '（空）'}`);
  const plan = expandGraph(graph, state.modules, state.graphs);
  if (plan.error) throw httpError(400, plan.error);
  if (!plan.nodes.length) throw httpError(400, '图里没有节点，无法提交实验');

  const now = Date.now();
  const id = `exp-${now.toString(36)}-${randomUUID().slice(0, 4)}`;
  const concurrency = clampConcurrency(input.concurrency);
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
    message: '',
    rerunOf: input.rerunOf || null,
    dir: runDir(id),
    nodes: plan.nodes.map((node) => ({
      path: node.path,
      nodeId: node.nodeId,
      moduleId: node.moduleId,
      moduleName: node.moduleName,
      label: node.label,
      kind: node.kind,
      params: node.params,
      deps: node.deps,
      command: node.command,
      cwd: node.cwd,
      timeoutSec: node.timeoutSec,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      exitCode: null,
      error: '',
      stdoutTail: '',
      stderrTail: '',
    })),
  };
  await fsp.mkdir(path.join(run.dir, 'nodes'), { recursive: true });
  await fsp.mkdir(path.join(run.dir, 'outputs'), { recursive: true });
  await fsp.mkdir(path.join(run.dir, 'logs'), { recursive: true });
  await persistRun(run);

  const handle = { run, cancelRequested: false, children: new Set(), wake: null };
  activeRuns.set(run.id, handle);
  void executeRun(handle).catch(async (error) => {
    run.status = 'failed';
    run.message = `执行失败：${error?.message || error}`;
    run.endedAt = Date.now();
    activeRuns.delete(run.id);
    await persistRun(run).catch(() => {});
  });
  return summarizeRun(run, { detail: true });
}

async function cancelExperiment(id) {
  const handle = activeRuns.get(id);
  if (handle) {
    handle.cancelRequested = true;
    for (const child of handle.children) killTree(child);
    handle.wake?.();
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
    return {
      ...module,
      usedBy,
      subgraphName:
        module.kind === 'graph' ? state.graphs.find((graph) => graph.id === module.graphId)?.name || '' : '',
    };
  });
  const graphs = state.graphs.map((graph) => ({
    ...graphSummary(graph),
    usedBy: graphUsage(state, graph.id),
    nodeCount: graph.nodes.length,
  }));
  return {
    ok: true,
    version: DATA_VERSION,
    workspace: dataDir(),
    modules,
    graphs,
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

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, '请求体过大');
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
  const errors = validateModule(module, state.modules, state.graphs);
  if (errors.length) throw httpError(400, errors.join('；'));

  const moduleList = existing
    ? state.modules.map((item) => (item.id === module.id ? module : item))
    : [...state.modules, module];
  const refErrors = graphReferenceErrors(state.graphs, moduleList);
  if (refErrors.length) throw httpError(400, refErrors.join('；'));

  const next = {
    ...state,
    modules: moduleList.map((item) =>
      item.id === module.id
        ? { ...module, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() }
        : item,
    ),
    updatedAt: Date.now(),
  };
  await writeState(next);
  return module;
}

async function deleteModule(id) {
  const state = await readState();
  const module = state.modules.find((item) => item.id === id);
  if (!module) throw httpError(404, '模块不存在');
  const usedBy = moduleUsage(state, id);
  if (usedBy.length) {
    throw httpError(409, `模块仍被这些图使用：${usedBy.map((graph) => graph.name).join('、')}，请先删除对应节点`);
  }
  await writeState({ ...state, modules: state.modules.filter((item) => item.id !== id), updatedAt: Date.now() });
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
    throw httpError(400, `图名称「${graph.name}」已被使用`);
  }
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
  if (!graph) throw httpError(404, '图不存在');
  const usedBy = graphUsage(state, id);
  if (usedBy.length) {
    throw httpError(409, `图仍被这些子图模块引用：${usedBy.map((module) => module.name).join('、')}，请先删除对应模块`);
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
    if (!graph) throw httpError(404, '图不存在');
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

  if (method === 'POST' && route === '/modules') {
    const body = await readBody(req);
    const module = await saveModule(body.module || body, { create: Boolean(body.create) });
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
    const stream = url.searchParams.get('stream') === 'err' ? 'stderr.log' : 'stdout.log';
    if (!id || !nodePath) throw httpError(400, '缺少 run 或 node 参数');
    const file = path.join(runDir(id), 'nodes', safeSegment(nodePath), stream);
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {
      text = '';
    }
    if (text.length > 400000) text = `…${text.slice(-400000)}`;
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
        handle.cancelRequested = true;
        for (const child of handle.children) killTree(child);
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
