// 图存储：实验与子图分目录管理，每张图一个目录。
//   experiments/<folder>/experiment.json   可独立运行的实验
//   subgraphs/<folder>/subgraph.json       被图模块引用的子图
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { DATA_VERSION } from './constants.js';
import { safeSegment } from './executor.js';

const CATEGORIES = ['experiments', 'subgraphs'];

function shortHash(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function categoryRoot(root, category) {
  return path.join(root, category);
}

function fileNameFor(category) {
  return category === 'subgraphs' ? 'subgraph.json' : 'experiment.json';
}

async function readDescription(folder, fileName) {
  try {
    return JSON.parse(await fsp.readFile(path.join(folder, fileName), 'utf8'));
  } catch {
    return null;
  }
}

async function listGraphFolders(root, category) {
  const parent = categoryRoot(root, category);
  const entries = await fsp.readdir(parent, { withFileTypes: true }).catch(() => []);
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(parent, entry.name);
    const description = await readDescription(folder, fileNameFor(category));
    if (description) folders.push({ folder, description });
  }
  return folders;
}

export async function findGraphFolder(root, graphId) {
  for (const category of CATEGORIES) {
    for (const item of await listGraphFolders(root, category)) {
      if (item.description.id === graphId) return item.folder;
    }
  }
  return '';
}

async function chooseFolder(root, graph, category) {
  const parent = categoryRoot(root, category);
  await fsp.mkdir(parent, { recursive: true });
  const existing = await findGraphFolder(root, graph.id);
  if (existing && path.dirname(existing) === parent) return existing;
  if (existing) await fsp.rm(existing, { recursive: true, force: true });
  let target = path.join(parent, safeSegment(graph.id));
  if (await fsp.stat(target).catch(() => null)) {
    const description = await readDescription(target, fileNameFor(category));
    if (!description || description.id !== graph.id) target = `${target}-${shortHash(graph.id)}`;
  }
  return target;
}

function descriptionFor(graph, category) {
  return {
    format: category === 'subgraphs' ? 'aether-subgraph' : 'aether-experiment',
    formatVersion: 1,
    dataVersion: DATA_VERSION,
    category,
    id: graph.id,
    name: graph.name,
    description: graph.description,
    layout: graph.layout,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    nodes: graph.nodes,
    edges: graph.edges,
    createdAt: graph.createdAt,
    updatedAt: graph.updatedAt,
  };
}

async function removeOtherFolder(root, graphId, keepFolder) {
  for (const category of CATEGORIES) {
    for (const item of await listGraphFolders(root, category)) {
      if (item.folder !== keepFolder && item.description.id === graphId) {
        await fsp.rm(item.folder, { recursive: true, force: true });
      }
    }
  }
}

export async function writeGraphFolder(root, graph, isSubgraph) {
  const category = isSubgraph ? 'subgraphs' : 'experiments';
  const folder = await chooseFolder(root, graph, category);
  await fsp.mkdir(folder, { recursive: true });
  await fsp.writeFile(
    path.join(folder, fileNameFor(category)),
    JSON.stringify(descriptionFor(graph, category), null, 2),
    'utf8',
  );
  await removeOtherFolder(root, graph.id, folder);
  return folder;
}

export async function materializeGraphs(root, graphs, isSubgraph) {
  const updated = [];
  for (const graph of graphs || []) {
    await writeGraphFolder(root, graph, isSubgraph(graph));
    updated.push(graph);
  }
  return updated;
}

export async function removeGraphFolder(root, graphId) {
  for (const category of CATEGORIES) {
    for (const item of await listGraphFolders(root, category)) {
      if (item.description.id === graphId) {
        await fsp.rm(item.folder, { recursive: true, force: true });
      }
    }
  }
}
