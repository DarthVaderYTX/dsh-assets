// 模块存储：每个模块一个目录。
//   modules/<folder>/module.json        描述文件（当前版本）
//   modules/<folder>/files/             模块提交的文件或目录
//   modules/<folder>/versions/vN.json   历史版本快照
//
// state.json 仍保留模块索引/镜像，但每个模块目录始终会被补齐；save/import 时以目录描述为准。
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { DATA_VERSION } from './constants.js';
import { safeSegment } from './executor.js';
import { normalizeModule } from './dag.js';

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function moduleRoot(root) {
  return path.join(root, 'modules');
}

async function readDescription(folder) {
  try {
    return JSON.parse(await fsp.readFile(path.join(folder, 'module.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function findModuleFolder(root, moduleId) {
  const base = moduleRoot(root);
  const entries = await fsp.readdir(base, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(base, entry.name);
    const description = await readDescription(folder);
    if (description && description.id === moduleId) return folder;
  }
  return '';
}

async function chooseFolder(root, module) {
  const existing = await findModuleFolder(root, module.id);
  if (existing) return existing;
  const base = path.join(moduleRoot(root), safeSegment(module.id));
  if (!existsSync(base)) return base;
  const fallback = `${base}-${shortHash(module.id)}`;
  if (!existsSync(fallback)) return fallback;
  return `${base}-${shortHash(module.id)}-${Date.now().toString(36)}`;
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
  const folder = await findModuleFolder(root, module.id);
  if (folder) await fsp.rm(folder, { recursive: true, force: true });
}

export async function readModuleFolders(root) {
  const base = moduleRoot(root);
  const entries = await fsp.readdir(base, { withFileTypes: true }).catch(() => []);
  const modules = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(base, entry.name);
    const description = await readDescription(folder);
    if (!description) continue;
    const versions = [];
    const versionsDir = path.join(folder, 'versions');
    const versionFiles = await fsp.readdir(versionsDir).catch(() => []);
    for (const name of versionFiles) {
      if (!name.endsWith('.json')) continue;
      try {
        const snapshot = JSON.parse(await fsp.readFile(path.join(versionsDir, name), 'utf8'));
        versions.push(snapshot);
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
