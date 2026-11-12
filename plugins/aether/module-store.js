// 模块存储：按类别分目录，每个模块一个自己的目录。
//   modules/commands/<folder>/module.json        命令模块描述
//   modules/subgraphs/<folder>/module.json       子图模块描述
//   modules/datasets/<folder>/module.json        数据集模块描述
//   modules/<category>/<folder>/files/           模块提交的文件或目录
//   modules/<category>/<folder>/versions/vN.json 历史版本快照
//
// state.json 仍保留模块索引/镜像，但每个模块目录始终会被补齐。
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { DATA_VERSION } from './constants.js';
import { safeSegment } from './executor.js';
import { normalizeModule } from './dag.js';

const CATEGORIES = ['commands', 'subgraphs', 'datasets'];
const CATEGORY_BY_KIND = { command: 'commands', graph: 'subgraphs', dataset: 'datasets' };

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function moduleRoot(root) {
  return path.join(root, 'modules');
}

function categoryFor(module) {
  return CATEGORY_BY_KIND[module && module.kind] || 'commands';
}

async function readDescription(folder) {
  try {
    return JSON.parse(await fsp.readFile(path.join(folder, 'module.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function listModuleFolders(root) {
  const base = moduleRoot(root);
  const folders = [];
  for (const category of CATEGORIES) {
    const parent = path.join(base, category);
    const entries = await fsp.readdir(parent, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(parent, entry.name);
      const description = await readDescription(folder);
      if (description) folders.push(folder);
    }
  }
  // 兼容旧版直接放在 modules/<folder> 的目录。
  const legacy = await fsp.readdir(base, { withFileTypes: true }).catch(() => []);
  for (const entry of legacy) {
    if (!entry.isDirectory() || CATEGORIES.includes(entry.name) || entry.name.startsWith('.')) continue;
    const folder = path.join(base, entry.name);
    const description = await readDescription(folder);
    if (description) folders.push(folder);
  }
  return folders;
}

export async function findModuleFolder(root, moduleId) {
  for (const folder of await listModuleFolders(root)) {
    const description = await readDescription(folder);
    if (description && description.id === moduleId) return folder;
  }
  return '';
}

async function chooseFolder(root, module) {
  const parent = path.join(moduleRoot(root), categoryFor(module));
  await fsp.mkdir(parent, { recursive: true });
  const existing = await findModuleFolder(root, module.id);
  if (existing) {
    if (path.dirname(existing) === parent) return existing;
    let target = path.join(parent, path.basename(existing));
    if (existsSync(target)) target = `${target}-${shortHash(module.id)}`;
    await fsp.rename(existing, target);
    return target;
  }
  let target = path.join(parent, safeSegment(module.id));
  if (existsSync(target)) target = `${target}-${shortHash(module.id)}`;
  if (existsSync(target)) target = `${target}-${Date.now().toString(36)}`;
  return target;
}

function descriptionFor(module, assetPath) {
  return {
    format: 'aether-module',
    formatVersion: 1,
    dataVersion: DATA_VERSION,
    id: module.id,
    name: module.name,
    description: module.description,
    kind: module.kind,
    category: categoryFor(module),
    command: module.command,
    cwd: module.cwd,
    timeoutSec: module.timeoutSec,
    params: module.params || {},
    inputs: module.inputs || [],
    requiredInputs: module.requiredInputs || [],
    outputs: module.outputs || [],
    graphId: module.graphId || '',
    datasetUri: module.datasetUri || '',
    datasetFormat: module.datasetFormat || '',
    assetId: module.assetId || '',
    assetKind: module.assetKind || '',
    assetName: module.assetName || '',
    assetFileCount: module.assetFileCount || 0,
    assetPath,
    environmentId: module.environmentId || 'local',
    version: module.version || 1,
    versionCount: (module.versions || []).length,
    createdAt: module.createdAt || Date.now(),
    updatedAt: module.updatedAt || Date.now(),
  };
}

async function writeVersionFiles(folder, module) {
  const versionsDir = path.join(folder, 'versions');
  await fsp.mkdir(versionsDir, { recursive: true });
  const keep = new Set();
  for (const snapshot of module.versions || []) {
    const version = Number(snapshot.version) || 1;
    const name = `v${version}.json`;
    keep.add(name);
    await fsp.writeFile(
      path.join(versionsDir, name),
      JSON.stringify({ format: 'aether-module-version', ...snapshot }, null, 2),
      'utf8',
    );
  }
  const existing = await fsp.readdir(versionsDir).catch(() => []);
  for (const name of existing) {
    if (name.endsWith('.json') && !keep.has(name)) {
      await fsp.rm(path.join(versionsDir, name), { force: true }).catch(() => {});
    }
  }
}

async function removeDuplicateFolders(root, moduleId, keepFolder) {
  for (const folder of await listModuleFolders(root)) {
    if (folder === keepFolder) continue;
    const description = await readDescription(folder);
    if (description && description.id === moduleId) {
      await fsp.rm(folder, { recursive: true, force: true });
    }
  }
}

export async function writeModuleFolder(root, input) {
  const module = normalizeModule(input);
  const folder = await chooseFolder(root, module);
  await fsp.mkdir(folder, { recursive: true });
  await fsp.mkdir(path.join(folder, 'files'), { recursive: true });

  let assetPath = '';
  if (module.assetId) {
    const target = path.join(folder, 'files');
    const source = module.assetPath ? path.resolve(root, module.assetPath) : '';
    if (source && source !== target && existsSync(source)) {
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.cp(source, target, { recursive: true, force: true });
      for (const tempDir of ['.uploads', 'assets']) {
        const assetsRoot = path.resolve(root, 'modules', tempDir);
        if (source === assetsRoot || source.startsWith(assetsRoot + path.sep)) {
          await fsp.rm(source, { recursive: true, force: true });
          break;
        }
      }
    }
    assetPath = path.relative(root, target).split(path.sep).join('/');
  }
  module.assetPath = assetPath;
  await fsp.writeFile(
    path.join(folder, 'module.json'),
    JSON.stringify(descriptionFor(module, assetPath), null, 2),
    'utf8',
  );
  await writeVersionFiles(folder, module);
  await removeDuplicateFolders(root, module.id, folder);
  return module;
}

export async function materializeModules(root, modules) {
  const updated = [];
  for (const module of modules || []) {
    updated.push(await writeModuleFolder(root, module));
  }
  return updated;
}

export async function removeModuleFolder(root, module) {
  for (const folder of await listModuleFolders(root)) {
    const description = await readDescription(folder);
    if (description && description.id === module.id) {
      await fsp.rm(folder, { recursive: true, force: true });
    }
  }
}

export async function readModuleFolders(root) {
  const modules = [];
  for (const folder of await listModuleFolders(root)) {
    const description = await readDescription(folder);
    if (!description) continue;
    const versions = [];
    const versionsDir = path.join(folder, 'versions');
    const versionFiles = await fsp.readdir(versionsDir).catch(() => []);
    for (const name of versionFiles) {
      if (!name.endsWith('.json')) continue;
      try {
        versions.push(JSON.parse(await fsp.readFile(path.join(versionsDir, name), 'utf8')));
      } catch {
        // 跳过损坏的版本快照。
      }
    }
    modules.push(
      normalizeModule({
        ...description,
        versions: versions.sort((left, right) => Number(left.version) - Number(right.version)),
      }),
    );
  }
  return modules;
}
