// Aether — 有向无环图任务执行管理器（宿主侧）。
//
// 职责：保存模块、图、执行环境与实验记录；把图展开成 DAG 计划，解析每个节点的
// 执行环境并交给对应 Executor；通过 /aether-api 把状态与操作暴露给左侧栏面板。
// 数据放在 $DSH_HOME/storages/aether，运行产物按实验分目录保存。
import { existsSync, promises as fsp, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  expandGraph,
  graphReferenceErrors,
  hydrateGraphPorts,
  isUuid,
  normalizeEnvironments,
  normalizeGraph,
  normalizeModule,
  topoLayers,
  validateGraph,
  validateModule,
} from './dag.js';
import { LocalExecutor, resolvePlacements, safeSegment } from './executor.js';
import { findGraphFolder, materializeGraphs, removeGraphFolder, writeGraphFolder } from './graph-store.js';
import { findModuleFolder, materializeModules, removeModuleFolder, writeModuleFolder } from './module-store.js';
import { zipDirectory } from './zip.js';
import {
  API_PREFIX,
  DATA_VERSION,
  MAX_ASSET_BYTES,
  MAX_ASSET_FILES,
  MAX_CONCURRENCY,
  MAX_RUNS,
  MAX_WORKSPACE_BYTES,
  MAX_WORKSPACE_FILES,
} from './constants.js';
import { httpError, readBody, sendJson, sendText } from './http.js';
import { seedState } from './seed.js';
import { AETHER_SKILL, AETHER_SKILL_DIRECTORY } from './skill.js';

// ------------------------------------------------------------------ 存储

function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function defaultDataDir() {
  return path.join(homeDir(), 'storages', 'aether');
}

function workspaceConfigPath() {
  return path.join(homeDir(), 'storages', 'aether-workspace.json');
}

function workspaceManifestPath(root = dataDir()) {
  return path.join(root, 'aether.workspace.json');
}

async function readWorkspaceManifest(root = dataDir()) {
  try {
    return JSON.parse(await fsp.readFile(workspaceManifestPath(root), 'utf8'));
  } catch {
    return null;
  }
}

async function writeWorkspaceManifest(root = dataDir(), seed = {}) {
  const file = workspaceManifestPath(root);
  const previous = await readWorkspaceManifest(root);
  const now = Date.now();
  const manifest = {
    format: 'aether-workspace',
    formatVersion: 1,
    dataVersion: DATA_VERSION,
    name: path.basename(root) || 'aether',
    createdAt: Number(seed.createdAt) || Number(previous && previous.createdAt) || now,
    updatedAt: now,
    layout: {
      state: 'state.json',
      resources: 'resources',
      experiments: 'experiments',
      subgraphs: 'subgraphs',
      runs: 'runs',
      backups: '.aether-backups',
    },
  };
  await fsp.mkdir(root, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

async function ensureWorkspaceManifest(root = dataDir()) {
  const previous = await readWorkspaceManifest(root);
  if (
    previous &&
    previous.format === 'aether-workspace' &&
    previous.formatVersion === 1 &&
    Number(previous.dataVersion) === DATA_VERSION
  ) {
    return previous;
  }
  return writeWorkspaceManifest(root);
}

function expandHomePath(raw) {
  const text = String(raw || '').trim();
  if (text === '~') return os.homedir();
  if (text.startsWith('~/') || text.startsWith('~\\')) return path.join(os.homedir(), text.slice(2));
  return text;
}

let workspaceCache = '';
let workspaceCacheHome = '';

function workspaceRoot() {
  const home = homeDir();
  if (workspaceCache && workspaceCacheHome === home) return workspaceCache;
  workspaceCacheHome = home;
  try {
    const parsed = JSON.parse(readFileSync(workspaceConfigPath(), 'utf8'));
    const configured = expandHomePath(parsed && parsed.path);
    workspaceCache = configured ? path.resolve(configured) : defaultDataDir();
  } catch {
    workspaceCache = defaultDataDir();
  }
  return workspaceCache;
}

function dataDir() {
  return workspaceRoot();
}

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function rewriteRunDirectories(root) {
  const runsRoot = path.join(root, 'runs');
  const entries = await fsp.readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(runsRoot, entry.name, 'run.json');
    try {
      const run = JSON.parse(await fsp.readFile(file, 'utf8'));
      run.dir = path.join(runsRoot, entry.name);
      await fsp.writeFile(file, JSON.stringify(run, null, 2), 'utf8');
    } catch {
      // 损坏的运行记录保持原样，不阻塞工作区切换。
    }
  }
}

async function switchWorkspace(rawPath) {
  const requested = String(rawPath || '').trim();
  if (!requested) throw httpError(400, '工作区目录不能为空');
  if (activeRuns.size) throw httpError(409, '仍有实验在运行，请先取消再切换工作区');
  const current = dataDir();
  const target = path.resolve(expandHomePath(requested));
  if (target === current) {
    return { workspace: target, copied: false, existing: true, unchanged: true };
  }
  if (isInsidePath(current, target) || isInsidePath(target, current)) {
    throw httpError(400, '新工作区不能位于当前工作区内部，也不能包含当前工作区');
  }
  const stat = await fsp.stat(target).catch(() => null);
  if (stat && !stat.isDirectory()) throw httpError(400, '工作区路径必须是一个目录');
  await fsp.mkdir(target, { recursive: true });
  const targetState = path.join(target, 'state.json');
  const hasState = existsSync(targetState);
  let copied = false;
  if (!hasState) {
    const state = await readState();
    for (const name of ['resources', 'experiments', 'subgraphs', 'runs']) {
      const source = path.join(current, name);
      if (existsSync(source)) {
        await fsp.cp(source, path.join(target, name), { recursive: true, force: true });
      }
    }
    await fsp.writeFile(targetState, JSON.stringify(state, null, 2), 'utf8');
    await rewriteRunDirectories(target);
    copied = true;
  }
  await fsp.mkdir(path.dirname(workspaceConfigPath()), { recursive: true });
  await fsp.writeFile(
    workspaceConfigPath(),
    JSON.stringify({ path: target, updatedAt: Date.now() }, null, 2),
    'utf8',
  );
  workspaceCache = target;
  workspaceCacheHome = homeDir();
  stateCache = null;
  stateLoading = null;
  recoveredRuns = false;
  await readState();
  return { workspace: target, copied, existing: hasState, unchanged: false };
}

async function collectWorkspaceFiles(root) {
  const files = [];
  const roots = [
    path.join(root, 'resources'),
    path.join(root, 'experiments'),
    path.join(root, 'subgraphs'),
  ];
  async function walk(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        files.push({ path: relative, data: (await fsp.readFile(full)).toString('base64') });
      }
    }
  }
  for (const directory of roots) await walk(directory);
  return files;
}

async function exportWorkspaceBundle() {
  const state = await readState();
  return {
    format: 'aether-workspace',
    formatVersion: 1,
    dataVersion: DATA_VERSION,
    exportedAt: Date.now(),
    includeRuns: false,
    manifest: await readWorkspaceManifest(dataDir()),
    state,
    files: await collectWorkspaceFiles(dataDir()),
  };
}

async function backupWorkspaceForImport() {
  const root = path.join(dataDir(), '.aether-backups', `import-${Date.now()}`);
  await fsp.mkdir(root, { recursive: true });
  const stateSource = statePath();
  if (existsSync(stateSource)) await fsp.copyFile(stateSource, path.join(root, 'state.json'));
  const manifestSource = workspaceManifestPath();
  if (existsSync(manifestSource)) {
    await fsp.copyFile(manifestSource, path.join(root, 'aether.workspace.json'));
  }
  for (const name of ['resources', 'modules', 'experiments', 'subgraphs']) {
    const source = path.join(dataDir(), name);
    if (existsSync(source)) await fsp.cp(source, path.join(root, name), { recursive: true, force: true });
  }
  return root;
}

async function importWorkspaceBundle(bundle) {
  if (activeRuns.size) throw httpError(409, '仍有实验在运行，请先取消再导入工作区');
  if (!bundle || bundle.format !== 'aether-workspace' || bundle.formatVersion !== 1) {
    throw httpError(400, '不是有效的 Aether 工作区导出文件');
  }
  const bundleFiles = Array.isArray(bundle.files) ? bundle.files : [];
  const state = normalizeState(bundle.state);
  const incoming = [];
  let total = 0;
  for (const file of bundleFiles) {
    const cleaned = String(file && file.path ? file.path : '').replace(/\\/g, '/');
    const allowed =
      cleaned.startsWith('resources/') ||
      cleaned.startsWith('modules/') ||
      cleaned.startsWith('experiments/') ||
      cleaned.startsWith('subgraphs/');
    if (!allowed) continue;
    const relative = safeAssetRelative(cleaned);
    if (!file || typeof file.data !== 'string') throw httpError(400, `工作区文件缺少内容：${cleaned}`);
    const buffer = Buffer.from(file.data, 'base64');
    total += buffer.length;
    if (total > MAX_WORKSPACE_BYTES) throw httpError(413, '工作区导入内容过大');
    if (incoming.length >= MAX_WORKSPACE_FILES) throw httpError(400, `工作区文件数量超过 ${MAX_WORKSPACE_FILES}`);
    const target = path.join(dataDir(), relative);
    if (!target.startsWith(dataDir() + path.sep)) throw httpError(400, `工作区文件路径越界：${cleaned}`);
    incoming.push({ relative, buffer });
  }

  const backup = await backupWorkspaceForImport();
  for (const name of ['resources', 'modules', 'experiments', 'subgraphs']) {
    const root = path.join(dataDir(), name);
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.mkdir(root, { recursive: true });
  }
  for (const file of incoming) {
    const target = path.join(dataDir(), file.relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, file.buffer);
  }
  state.modules = await materializeModules(dataDir(), state.modules);
  await materializeGraphs(dataDir(), state.graphs, (graph) => graphUsage(state, graph.id).length > 0);
  state.updatedAt = Date.now();
  await writeState(state);
  await writeWorkspaceManifest(dataDir(), bundle.manifest || {});
  stateCache = null;
  stateLoading = null;
  recoveredRuns = false;
  const loaded = await readState();
  return {
    workspace: dataDir(),
    includeRuns: false,
    files: incoming.length,
    modules: loaded.modules.length,
    graphs: loaded.graphs.length,
    runs: null,
    backup,
  };
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

/** 把旧的可读 id（名称 slug）就地换成 UUID，并同步引用、目录描述与运行记录。 */
async function migrateEntityIds(state, root) {
  const modules = state.modules || [];
  const graphs = state.graphs || [];
  const legacyModules = modules.filter((module) => !isUuid(module.id));
  const legacyGraphs = graphs.filter((graph) => !isUuid(graph.id));
  if (!legacyModules.length && !legacyGraphs.length) return false;

  const backupDir = path.join(root, '.aether-backups');
  await fsp.mkdir(backupDir, { recursive: true }).catch(() => {});
  await fsp
    .copyFile(statePath(), path.join(backupDir, `state.before-uuid-${Date.now()}.json`))
    .catch(() => {});

  const used = new Set();
  for (const module of modules) if (isUuid(module.id)) used.add(module.id);
  for (const graph of graphs) if (isUuid(graph.id)) used.add(graph.id);
  const fresh = () => {
    let id = randomUUID();
    while (used.has(id)) id = randomUUID();
    used.add(id);
    return id;
  };
  const moduleIds = new Map();
  const graphIds = new Map();
  for (const module of legacyModules) {
    const next = fresh();
    moduleIds.set(module.id, next);
    module.id = next;
  }
  for (const graph of legacyGraphs) {
    const next = fresh();
    graphIds.set(graph.id, next);
    graph.id = next;
  }
  for (const module of modules) {
    if (module.kind === 'graph' && graphIds.has(module.graphId)) module.graphId = graphIds.get(module.graphId);
  }
  for (const graph of graphs) {
    for (const node of graph.nodes || []) {
      if (moduleIds.has(node.moduleId)) node.moduleId = moduleIds.get(node.moduleId);
    }
  }
  // 资源目录里的描述文件要一起改，materialize 才能按新 id 找回原来的目录。
  for (const [oldId, nextId] of moduleIds) {
    const folder = await findModuleFolder(root, oldId).catch(() => '');
    if (!folder) continue;
    const file = path.join(folder, 'resource.json');
    try {
      const description = JSON.parse(await fsp.readFile(file, 'utf8'));
      description.id = nextId;
      if (description.kind === 'graph' && graphIds.has(description.graphId)) {
        description.graphId = graphIds.get(description.graphId);
      }
      await fsp.writeFile(file, JSON.stringify(description, null, 2), 'utf8');
    } catch {
      // 描述文件缺失或损坏时交给 materialize 重新生成。
    }
  }
  for (const [oldId, nextId] of graphIds) {
    const folder = await findGraphFolder(root, oldId).catch(() => '');
    if (!folder) continue;
    for (const name of ['experiment.json', 'subgraph.json']) {
      const file = path.join(folder, name);
      try {
        const description = JSON.parse(await fsp.readFile(file, 'utf8'));
        description.id = nextId;
        for (const node of description.nodes || []) {
          if (moduleIds.has(node.moduleId)) node.moduleId = moduleIds.get(node.moduleId);
        }
        await fsp.writeFile(file, JSON.stringify(description, null, 2), 'utf8');
      } catch {
        // 另一个文件名的描述不存在时跳过。
      }
    }
  }
  // 运行记录里也有实验与模块引用，换掉后「重跑」仍能找到它们。
  const runsRoot = path.join(root, 'runs');
  const entries = await fsp.readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(runsRoot, entry.name, 'run.json');
    try {
      const run = JSON.parse(await fsp.readFile(file, 'utf8'));
      let changed = false;
      if (graphIds.has(run.graphId)) {
        run.graphId = graphIds.get(run.graphId);
        changed = true;
      }
      for (const node of run.nodes || []) {
        if (moduleIds.has(node.moduleId)) {
          node.moduleId = moduleIds.get(node.moduleId);
          changed = true;
        }
      }
      if (changed) await fsp.writeFile(file, JSON.stringify(run, null, 2), 'utf8');
    } catch {
      // 损坏的运行记录保持原样，不阻塞启动。
    }
  }
  return true;
}

async function migrateRunIds() {
  const root = runsDir();
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, entry.name);
    try {
      const run = JSON.parse(await fsp.readFile(path.join(folder, 'run.json'), 'utf8'));
      items.push({ folder, run });
    } catch {
      // 跳过损坏的运行目录。
    }
  }
  const used = new Set(items.filter((item) => isUuid(item.run.id)).map((item) => item.run.id));
  const mapping = new Map();
  for (const item of items) {
    if (!item.run.id || isUuid(item.run.id)) continue;
    let id = randomUUID();
    while (used.has(id)) id = randomUUID();
    used.add(id);
    mapping.set(item.run.id, id);
    item.nextId = id;
  }
  if (!mapping.size) return;
  for (const item of items) {
    if (!item.nextId) continue;
    const nextFolder = path.join(root, item.nextId);
    await renameWithRetry(item.folder, nextFolder).catch(() => {});
    item.folder = nextFolder;
    item.run.id = item.nextId;
    item.run.dir = nextFolder;
    await fsp
      .writeFile(path.join(nextFolder, 'run.json'), JSON.stringify(item.run, null, 2))
      .catch(() => {});
  }
  for (const item of items) {
    if (!item.run.rerunOf || !mapping.has(item.run.rerunOf)) continue;
    item.run.rerunOf = mapping.get(item.run.rerunOf);
    await fsp
      .writeFile(path.join(item.folder, 'run.json'), JSON.stringify(item.run, null, 2))
      .catch(() => {});
  }
}

async function loadState() {
  await fsp.mkdir(dataDir(), { recursive: true });
  await migrateRunIds().catch(() => {});
  await ensureWorkspaceManifest(dataDir()).catch(() => {});
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
    // v4 → v5 给模块补版本号与版本历史；v5 → v6 给模块补必填输入端口列表；
    // v6 → v7 将模块/实验/子图迁移到分类目录；v7 → v8 将 modules 重命名为 resources、module.json 重命名为 resource.json；
    // v8 → v9 给输入/输出/参数补类型，并把命令模板统一为 @@名称@@ 引用；
    // v9 → v10 把模块 / 数据集 / 子图 / 实验的 id 换成全局唯一的 UUID。
    for (const graph of stateCache.graphs) {
      if (legacyLayout.has(graph.id)) {
        for (const node of graph.nodes) {
          node.x = null;
          node.y = null;
        }
      }
    }
    const idsMigrated = await migrateEntityIds(stateCache, dataDir());
    for (const graph of stateCache.graphs) {
      hydrateGraphPorts(graph, stateCache.modules);
    }
    if (Number(parsed.version) !== DATA_VERSION || !Array.isArray(parsed.environments) || legacyLayout.size || idsMigrated) {
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
  const assetPaths = (stateCache.modules || []).map((module) => module.assetPath);
  stateCache.modules = await materializeModules(dataDir(), stateCache.modules);
  const changed = stateCache.modules.some((module, index) => module.assetPath !== assetPaths[index]);
  if (changed) await writeState(stateCache);
  await materializeGraphs(
    dataDir(),
    stateCache.graphs,
    (graph) => graphUsage(stateCache, graph.id).length > 0,
  );
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
    paramTypes: node.paramTypes || {},
    environmentId: node.environmentId || 'local',
    environmentName: node.environmentName || '',
    executor: node.executor || 'local',
    inputs: node.inputs || [],
    inputTypes: node.inputTypes || {},
    outputs: node.outputs || [],
    outputTypes: node.outputTypes || {},
    artifacts: (node.artifacts || []).map((artifact) => ({
      port: artifact.port,
      path: artifact.path,
      kind: artifact.kind,
      size: artifact.size,
    })),
    datasetUri: node.datasetUri || '',
    datasetFormat: node.datasetFormat || '',
    width: node.width || 0,
    height: node.height || 0,
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
  // 从实验编辑器直接提交时，input.graph 是当前编辑态：只用于这次运行，
  // 不写回 state，所以不点保存不会改变实验定义。
  const draft = input.graph && typeof input.graph === 'object' ? normalizeGraph(input.graph) : null;
  const graph = draft || state.graphs.find((item) => item.id === input.graphId);
  if (!graph) throw httpError(404, `实验不存在：${input.graphId || '（空）'}`);
  if (graph.id) {
    const referencedBy = graphUsage(state, graph.id);
    if (referencedBy.length) {
      throw httpError(
        400,
        `「${graph.name}」是子图，不能单独运行；请在引用它的实验里运行（引用方：${referencedBy
          .map((module) => module.name)
          .join('、')}）`,
      );
    }
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
  const id = randomUUID();
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
      paramTypes: node.paramTypes || {},
      deps: node.deps,
      command: node.command,
      cwd: node.cwd,
      timeoutSec: node.timeoutSec,
      environmentId: target.environmentId,
      environmentName: target.environmentName,
      executor: target.executor,
      inputs: node.inputs || [],
      inputTypes: node.inputTypes || {},
      outputs: node.outputs || [],
      outputTypes: node.outputTypes || {},
      requiredInputs: node.requiredInputs || [],
      artifacts: [],
      datasetUri: node.datasetUri || '',
      datasetFormat: node.datasetFormat || '',
      width: node.width || 0,
      height: node.height || 0,
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
    graphId: graph.id || '',
    graphName: graph.name,
    graphSnapshot: draft || undefined,
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

function idInUse(state, id) {
  return state.modules.some((module) => module.id === id) || state.graphs.some((graph) => graph.id === id);
}

/** 资源与实验共用一个 id 命名空间，新 id 一律是随机 UUID。 */
function generateEntityId(state) {
  let id = randomUUID();
  while (idInUse(state, id)) id = randomUUID();
  return id;
}

function assetBaseDir() {
  return path.join(dataDir(), 'resources', '.uploads');
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
    assetPath: path.join('resources', '.uploads', assetId),
    assetFileCount: decoded.length,
    assetSize: total,
  };
}

async function saveModule(input, options = {}) {
  const state = await readState();
  const module = normalizeModule(input);
  if (!options.create) {
    throw httpError(409, '资源创建后不可修改；如需调整，请删除后重新创建');
  }
  if (module.id && !isUuid(module.id)) throw httpError(400, '模块 id 必须是 UUID');
  if (!module.id) module.id = generateEntityId(state);
  else if (idInUse(state, module.id)) throw httpError(409, `模块 id「${module.id}」已存在，请换一个`);
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
  } else if (module.kind === 'command' && options.requireAsset) {
    errors.push('新建命令模块需要提交对应的文件或目录');
  }
  if (errors.length) throw httpError(400, errors.join('；'));

  let savedModule = {
    ...module,
    version: 1,
    versions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  savedModule = await writeModuleFolder(dataDir(), savedModule);

  const moduleList = [...state.modules, savedModule];
  const refErrors = graphReferenceErrors(state.graphs, moduleList);
  if (refErrors.length) throw httpError(400, refErrors.join('；'));

  await writeState({ ...state, modules: moduleList, updatedAt: Date.now() });
  const next = await readState();
  await materializeGraphs(dataDir(), next.graphs, (graph) => graphUsage(next, graph.id).length > 0);
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
  await removeModuleFolder(dataDir(), module);
  const assetRoot = moduleAssetRoot(module);
  if (assetRoot) await fsp.rm(assetRoot, { recursive: true, force: true }).catch(() => {});
  const next = await readState();
  await materializeGraphs(dataDir(), next.graphs, (graph) => graphUsage(next, graph.id).length > 0);
  return { ok: true, id };
}

async function saveGraph(input) {
  const state = await readState();
  const graph = normalizeGraph(input);
  const inputId = graph.id;
  if (!inputId) {
    graph.id = generateEntityId(state);
  } else {
    if (!isUuid(inputId)) throw httpError(400, '实验 id 必须是 UUID');
    const clash = idInUse(state, inputId) && !state.graphs.some((item) => item.id === inputId);
    if (clash) throw httpError(409, `id「${inputId}」已被占用`);
  }
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
  const next = await readState();
  await writeGraphFolder(dataDir(), graph, graphUsage(next, graph.id).length > 0);
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
  await removeGraphFolder(dataDir(), id);
  return { ok: true, id };
}

function artifactContext(run, nodePath, port) {
  const node = (run.nodes || []).find((item) => item.path === nodePath);
  if (!node) throw httpError(404, '节点不存在');
  const artifact = (node.artifacts || []).find((item) => item.port === port);
  const nodeDir = path.join(run.dir, 'nodes', safeSegment(node.path));
  if (!artifact) return { node, nodeDir, artifact: null, root: '' };
  const root = path.resolve(nodeDir, artifact.path);
  if (root !== nodeDir && !root.startsWith(nodeDir + path.sep)) {
    throw httpError(400, '输出路径无效');
  }
  return { node, nodeDir, artifact, root };
}

async function ensureInside(root, target) {
  const realRoot = await fsp.realpath(root);
  const realTarget = await fsp.realpath(target);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    throw httpError(400, '输出路径越界');
  }
  return realTarget;
}

function relativeArtifactPath(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  return relative || '.';
}

async function artifactFileView(root, target) {
  const stat = await fsp.stat(target);
  if (stat.isDirectory()) return null;
  const limit = 1024 * 1024;
  const size = stat.size;
  const handle = await fsp.open(target, 'r');
  let buffer;
  try {
    buffer = Buffer.alloc(Math.min(size, limit));
    if (buffer.length) await handle.read(buffer, 0, buffer.length, 0);
  } finally {
    await handle.close();
  }
  const binary = buffer.includes(0);
  return {
    kind: 'file',
    path: relativeArtifactPath(root, target),
    size,
    truncated: size > limit,
    binary,
    content: binary ? '' : buffer.toString('utf8'),
  };
}

async function artifactDirectoryView(root, target) {
  const entries = [];
  const items = await fsp.readdir(target, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    if (item.isSymbolicLink()) continue;
    const full = path.join(target, item.name);
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat) continue;
    entries.push({
      name: item.name,
      path: relativeArtifactPath(root, full),
      kind: stat.isDirectory() ? 'directory' : 'file',
      size: stat.isDirectory() ? null : stat.size,
    });
  }
  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return { kind: 'directory', path: relativeArtifactPath(root, target), entries };
}

async function artifactDownloadTarget(root, fileParam) {
  const target = fileParam ? path.resolve(root, fileParam) : root;
  if (target !== root && !target.startsWith(root + path.sep)) throw httpError(400, '输出文件路径越界');
  const safe = await ensureInside(root, target);
  return safe;
}

async function stdoutOutputText(run, node) {
  const file = path.join(run.dir, 'outputs', `${safeSegment(node.path)}.out`);
  try {
    return await fsp.readFile(file, 'utf8');
  } catch {
    return node.stdoutTail || '';
  }
}

function downloadFileName(name, fallback) {
  const text = path.basename(String(name || '')) || fallback;
  return /^[\x20-\x7E]+$/.test(text) ? text.replace(/"/g, '') : safeSegment(text);
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

  if (method === 'GET' && route === '/experiments/artifact') {
    const id = url.searchParams.get('run') || '';
    const nodePath = url.searchParams.get('node') || '';
    const port = String(url.searchParams.get('port') || '');
    const fileParam = url.searchParams.get('file') || '';
    if (!id || !nodePath || !port) throw httpError(400, '缺少 run、node 或 port 参数');
    const run = activeRuns.get(id)?.run || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const context = artifactContext(run, nodePath, port);
    if (!context.artifact) {
      const content = await stdoutOutputText(run, context.node);
      sendJson(res, 200, {
        ok: true,
        kind: 'stdout',
        port,
        path: 'stdout',
        size: Buffer.byteLength(content),
        truncated: false,
        binary: false,
        content,
      });
      return;
    }
    let target;
    if (context.artifact.kind === 'file') {
      target = await ensureInside(context.root, context.root);
    } else {
      target = fileParam
        ? await artifactDownloadTarget(context.root, fileParam)
        : await ensureInside(context.root, context.root);
    }
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat) throw httpError(404, '输出文件或目录不存在');
    if (stat.isDirectory()) {
      sendJson(res, 200, {
        ok: true,
        port,
        ...(await artifactDirectoryView(context.root, target)),
      });
    } else {
      const payload = await artifactFileView(context.root, target);
      if (context.artifact.kind === 'file') payload.path = context.artifact.path;
      sendJson(res, 200, { ok: true, port, ...payload });
    }
    return;
  }

  if (method === 'GET' && route === '/experiments/artifact/download') {
    const id = url.searchParams.get('run') || '';
    const nodePath = url.searchParams.get('node') || '';
    const port = String(url.searchParams.get('port') || '');
    const fileParam = url.searchParams.get('file') || '';
    if (!id || !nodePath || !port) throw httpError(400, '缺少 run、node 或 port 参数');
    const run = activeRuns.get(id)?.run || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const context = artifactContext(run, nodePath, port);
    if (!context.artifact) {
      const content = await stdoutOutputText(run, context.node);
      const filename = `${safeSegment(nodePath)}-${safeSegment(port)}.out`;
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': Buffer.byteLength(content),
        'cache-control': 'no-store',
      });
      res.end(content);
      return;
    }
    let target;
    if (context.artifact.kind === 'file') {
      target = await ensureInside(context.root, context.root);
    } else {
      target = fileParam
        ? await artifactDownloadTarget(context.root, fileParam)
        : await ensureInside(context.root, context.root);
    }
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat) throw httpError(404, '输出文件或目录不存在');
    if (stat.isDirectory()) {
      const archive = await zipDirectory(target, path.basename(target) || port);
      const filename = `${safeSegment(nodePath)}-${safeSegment(port)}.zip`;
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': archive.length,
        'cache-control': 'no-store',
      });
      res.end(archive);
      return;
    }
    const buffer = await fsp.readFile(target);
    const filename = downloadFileName(path.basename(target), `${safeSegment(nodePath)}-${safeSegment(port)}.out`);
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': buffer.length,
      'cache-control': 'no-store',
    });
    res.end(buffer);
    return;
  }

  if (method === 'GET' && route === '/experiments/download') {
    const id = url.searchParams.get('run') || '';
    const nodePath = url.searchParams.get('node') || '';
    const port = String(url.searchParams.get('port') || '')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .slice(0, 60);
    if (!id || !nodePath) throw httpError(400, '缺少 run 或 node 参数');
    const run = activeRuns.get(id)?.run || (await readRunFromDisk(id));
    if (!run) throw httpError(404, '实验不存在');
    const node = (run.nodes || []).find((item) => item.path === nodePath);
    if (!node) throw httpError(404, '节点不存在');
    const outputFile = path.join(run.dir, 'outputs', `${safeSegment(nodePath)}.out`);
    let content = '';
    try {
      content = await fsp.readFile(outputFile, 'utf8');
    } catch {
      content = node.stdoutTail || '';
    }
    const filename = `${safeSegment(nodePath)}${port ? `-${port}` : ''}.out`;
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': Buffer.byteLength(content),
      'cache-control': 'no-store',
    });
    res.end(content);
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
      graph: run.graphSnapshot || undefined,
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

  if (method === 'GET' && route === '/workspace/export') {
    const bundle = await exportWorkspaceBundle();
    const body = JSON.stringify(bundle);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="aether-workspace-${stamp}.json"`,
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }

  if (method === 'POST' && route === '/workspace/import') {
    const body = await readBody(req, MAX_WORKSPACE_BYTES * 2);
    const bundle = body.bundle || body;
    const result = await importWorkspaceBundle(bundle);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (method === 'POST' && route === '/workspace') {
    const body = await readBody(req);
    sendJson(res, 200, { ok: true, ...(await switchWorkspace(body.path)) });
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

export const inject = ['webServer', 'skills'];

export function apply(ctx) {
  const skills = ctx.get('skills');
  if (skills && typeof skills.register === 'function') {
    ctx.effect(() => {
      let dispose = null;
      try {
        dispose = skills.register({
          ...AETHER_SKILL,
          resourceBase: { kind: 'directory', path: AETHER_SKILL_DIRECTORY },
          metadata: { plugin: 'aether' },
        });
      } catch (error) {
        ctx.logger?.warn?.(`aether: failed to register agent skill: ${error?.message || error}`);
      }
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    }, 'aether: runtime skill');
  }

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
