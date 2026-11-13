// 资源存储：按类别分目录，每个资源一个自己的目录。
//   resources/modules/<folder>/resource.json        模块资源描述
//   resources/subgraphs/<folder>/resource.json      子图资源描述
//   resources/datasets/<folder>/resource.json       数据集资源描述
//   resources/<category>/<folder>/files/            资源提交的文件或目录
//   resources/<category>/<folder>/versions/vN.json  历史版本快照
//
// state.json 仍保留资源索引/镜像，但每个资源目录始终会被补齐。
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { DATA_VERSION } from './constants.js';
import { safeSegment } from './executor.js';
import { normalizeModule } from './dag.js';

const RESOURCE_ROOT = 'resources';
const LEGACY_ROOT = 'modules';
const DESCRIPTION_FILE = 'resource.json';
const LEGACY_DESCRIPTION_FILE = 'module.json';
const CATEGORIES = ['modules', 'subgraphs', 'datasets'];
const CATEGORY_BY_KIND = { command: 'modules', graph: 'subgraphs', dataset: 'datasets' };

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function moduleRoot(root) {
  return path.join(root, RESOURCE_ROOT);
}

function legacyModuleRoot(root) {
  return path.join(root, LEGACY_ROOT);
}

function categoryFor(module) {
  return CATEGORY_BY_KIND[module && module.kind] || 'modules';
}

async function readDescription(folder) {
  for (const name of [DESCRIPTION_FILE, LEGACY_DESCRIPTION_FILE]) {
    try {
      return JSON.parse(await fsp.readFile(path.join(folder, name), 'utf8'));
    } catch {
      // 尝试下一个兼容文件名。
    }
  }
  return null;
}

async function listModuleFolders(root) {
  const folders = [];
  const seen = new Set();
  const roots = [
    { base: moduleRoot(root), categories: CATEGORIES },
    { base: legacyModuleRoot(root), categories: ['commands', ...CATEGORIES] },
  ];
  for (const { base, categories } of roots) {
    for (const category of categories) {
      const parent = path.join(base, category);
      const entries = await fsp.readdir(parent, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const folder = path.join(parent, entry.name);
        const description = await readDescription(folder);
        if (description && !seen.has(folder)) {
          seen.add(folder);
          folders.push(folder);
        }
      }
    }
    // 兼容更早的 modules/<folder> 平铺目录。
    const legacy = await fsp.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of legacy) {
      if (
        !entry.isDirectory() ||
        categories.includes(entry.name) ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      const folder = path.join(base, entry.name);
      const description = await readDescription(folder);
      if (description && !seen.has(folder)) {
        seen.add(folder);
        folders.push(folder);
      }
    }
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
    format: 'aether-resource',
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
    paramTypes: module.paramTypes || {},
    inputs: module.inputs || [],
    inputTypes: module.inputTypes || {},
    requiredInputs: module.requiredInputs || [],
    outputs: module.outputs || [],
    outputTypes: module.outputTypes || {},
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
      JSON.stringify({ format: 'aether-resource-version', ...snapshot }, null, 2),
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
    // 上传目录的内容直接放到 files/ 根下（前端上传文件夹时已经去掉所选文件夹这一层）。
    const target = path.join(folder, 'files');
    const source = module.assetPath ? path.resolve(root, module.assetPath) : '';
    if (source && source !== target && existsSync(source)) {
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.cp(source, target, { recursive: true, force: true });
      for (const tempRoot of [moduleRoot(root), legacyModuleRoot(root)]) {
        for (const tempDir of ['.uploads', 'assets']) {
          const assetsRoot = path.resolve(tempRoot, tempDir);
          if (source === assetsRoot || source.startsWith(assetsRoot + path.sep)) {
            await fsp.rm(source, { recursive: true, force: true });
            break;
          }
        }
      }
    }
    assetPath = path.relative(root, target).split(path.sep).join('/');
  }
  module.assetPath = assetPath;
  if (module.kind === 'dataset' && module.assetId && assetPath) {
    const fileName = module.assetName || path.basename(module.assetPath || 'dataset');
    if (!module.datasetUri || module.datasetUri === fileName || module.datasetUri === 'inline') {
      module.datasetUri = `${assetPath}/${fileName}`;
    }
  }
  await fsp.writeFile(
    path.join(folder, DESCRIPTION_FILE),
    JSON.stringify(descriptionFor(module, assetPath), null, 2),
    'utf8',
  );
  await fsp.rm(path.join(folder, LEGACY_DESCRIPTION_FILE), { force: true }).catch(() => {});
  await writeVersionFiles(folder, module);
  await removeDuplicateFolders(root, module.id, folder);
  return module;
}

async function pruneLegacyRoot(root) {
  const legacy = legacyModuleRoot(root);
  async function prune(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) await prune(path.join(directory, entry.name));
    }
    const remaining = await fsp.readdir(directory).catch(() => ['keep']);
    if (!remaining.length) await fsp.rmdir(directory).catch(() => {});
  }
  await prune(legacy);
}

export async function materializeModules(root, modules) {
  const updated = [];
  for (const module of modules || []) {
    updated.push(await writeModuleFolder(root, module));
  }
  await pruneLegacyRoot(root);
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
