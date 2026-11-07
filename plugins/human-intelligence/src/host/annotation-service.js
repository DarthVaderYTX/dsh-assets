/**
 * Annotation service API.
 *
 * Owns the durable annotation model: datasets (with their pending items),
 * annotation tasks, per-task annotation status/result records, and custom
 * annotation tools. Datasets and tasks are separate entities; a task points to
 * one dataset. Every mutation goes through this module.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const STORE_VERSION = 3;
export const ANNOTATION_STATUSES = ['pending', 'draft', 'done', 'skipped'];
export const MODALITY_TASKS = {
  text: new Set(['text-classification', 'text-entity', 'text-rating', 'text-ranking']),
  image: new Set(['image-classification', 'image-bbox']),
  video: new Set(['video-classification', 'video-segment']),
};

const STORED_ANNOTATION_STATUS = new Set(['draft', 'done', 'skipped']);
const MAX_TEXT_CHARS = 400_000;
const MAX_ANNOTATION_BYTES = 1 * 1024 * 1024;
const MAX_ITEMS_PER_DATASET = 50_000;
const MAX_ITEMS_PER_REQUEST = 1_000;
const MAX_TASK_OPTIONS = 40;
const MAX_TOOLS = 200;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function finiteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function emptyStore() {
  return { version: STORE_VERSION, datasets: [], tasks: [], annotations: {}, tools: [] };
}

function normalizeTaskOptions(value) {
  if (!isRecord(value)) return {};
  const output = {};
  for (const key of Object.keys(value).slice(0, MAX_TASK_OPTIONS)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) continue;
    const candidate = value[key];
    if (typeof candidate === 'string') {
      output[key] = candidate.slice(0, 2_000);
    } else if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      output[key] = candidate;
    } else if (typeof candidate === 'boolean') {
      output[key] = candidate;
    } else if (Array.isArray(candidate)) {
      output[key] = candidate
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 200)
        .map((entry) => entry.slice(0, 200));
    }
  }
  return output;
}

function normalizeTask(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const modality = text(value.modality).trim();
  const task = text(value.task).trim();
  const tasks = MODALITY_TASKS[modality];
  if (!tasks || !tasks.has(task)) return null;
  const now = Date.now();
  return {
    id,
    name: text(value.name, 'Untitled task').trim().slice(0, 200) || 'Untitled task',
    description: text(value.description).slice(0, 4_000),
    modality,
    task,
    toolId: text(value.toolId).trim().slice(0, 120),
    datasetId: text(value.datasetId).trim(),
    taskOptions: normalizeTaskOptions(value.taskOptions),
    createdAt: finiteNumber(value.createdAt, now),
    updatedAt: finiteNumber(value.updatedAt, now),
  };
}

function normalizeTool(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '' || id.startsWith('preset:')) return null;
  const modality = text(value.modality).trim();
  const task = text(value.task).trim();
  const tasks = MODALITY_TASKS[modality];
  if (!tasks || !tasks.has(task)) return null;
  const now = Date.now();
  return {
    id,
    name: text(value.name, 'Untitled tool').trim().slice(0, 120) || 'Untitled tool',
    modality,
    task,
    taskOptions: normalizeTaskOptions(value.taskOptions),
    createdAt: finiteNumber(value.createdAt, now),
    updatedAt: finiteNumber(value.updatedAt, now),
  };
}

function safeMediaName(value) {
  const base = text(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return base || 'data';
}

function normalizeMedia(value) {
  if (!isRecord(value)) return null;
  const file = text(value.file).trim();
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/i.test(file)) return null;
  return {
    file,
    name: safeMediaName(value.name),
    mime: text(value.mime).trim().toLowerCase().slice(0, 120),
    size: Math.max(0, Math.floor(finiteNumber(value.size))),
  };
}

function normalizeItem(modality, value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const base = {
    id,
    name: safeMediaName(value.name),
    createdAt: finiteNumber(value.createdAt, Date.now()),
  };
  if (modality === 'text') {
    const content = text(value.text);
    if (content.trim() === '') return null;
    return { ...base, text: content.slice(0, MAX_TEXT_CHARS) };
  }
  const media = normalizeMedia(value.media);
  if (!media) return null;
  return { ...base, media };
}

function normalizeDataset(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const modality = text(value.modality).trim();
  if (!MODALITY_TASKS[modality]) return null;
  const now = Date.now();
  const items = [];
  const seen = new Set();
  for (const rawItem of Array.isArray(value.items) ? value.items : []) {
    const item = normalizeItem(modality, rawItem);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return {
    id,
    name: text(value.name, 'Untitled dataset').trim().slice(0, 200) || 'Untitled dataset',
    description: text(value.description).slice(0, 4_000),
    modality,
    items,
    createdAt: finiteNumber(value.createdAt, now),
    updatedAt: finiteNumber(value.updatedAt, now),
  };
}

function normalizeAnnotation(value) {
  if (!isRecord(value)) return null;
  let status = text(value.status, 'draft');
  if (status === 'in_progress') status = 'draft';
  if (!STORED_ANNOTATION_STATUS.has(status)) status = 'draft';
  let payload = value.value;
  if (!isRecord(payload) && !Array.isArray(payload)) payload = {};
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return null;
  }
  if (typeof serialized !== 'string' || serialized.length > MAX_ANNOTATION_BYTES) return null;
  return {
    value: payload,
    status,
    revision: Math.max(1, Math.floor(finiteNumber(value.revision, 1))),
    updatedAt: finiteNumber(value.updatedAt, Date.now()),
  };
}

function normalizeStore(raw) {
  const store = emptyStore();
  if (!isRecord(raw)) return store;

  const datasetIds = new Set();
  for (const candidate of Array.isArray(raw.datasets) ? raw.datasets : []) {
    const dataset = normalizeDataset(candidate);
    if (!dataset || datasetIds.has(dataset.id)) continue;
    datasetIds.add(dataset.id);
    store.datasets.push(dataset);
  }

  const legacyItems = isRecord(raw.items) ? raw.items : {};
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : Array.isArray(raw.projects) ? raw.projects : [];
  const rawAnnotations = isRecord(raw.annotations) ? raw.annotations : {};
  const taskIds = new Set();

  for (const candidate of rawTasks) {
    const task = normalizeTask(candidate);
    if (!task || taskIds.has(task.id)) continue;
    taskIds.add(task.id);

    let dataset = task.datasetId ? store.datasets.find((entry) => entry.id === task.datasetId) : undefined;
    if (!dataset || dataset.modality !== task.modality) {
      const items = [];
      const seenItems = new Set();
      for (const rawItem of Array.isArray(legacyItems[task.id]) ? legacyItems[task.id] : []) {
        const item = normalizeItem(task.modality, rawItem);
        if (!item || seenItems.has(item.id)) continue;
        seenItems.add(item.id);
        items.push(item);
      }
      let datasetId = task.datasetId && !datasetIds.has(task.datasetId) ? task.datasetId : randomUUID();
      while (datasetIds.has(datasetId)) datasetId = randomUUID();
      dataset = {
        id: datasetId,
        name: `${task.name} dataset`,
        description: '',
        modality: task.modality,
        items,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
      datasetIds.add(dataset.id);
      store.datasets.push(dataset);
      task.datasetId = dataset.id;
    }

    store.tasks.push(task);
    const itemIds = new Set(dataset.items.map((item) => item.id));
    store.annotations[task.id] = {};
    const annotations = isRecord(rawAnnotations[task.id]) ? rawAnnotations[task.id] : {};
    for (const [itemId, rawAnnotation] of Object.entries(annotations)) {
      if (!itemIds.has(itemId)) continue;
      const annotation = normalizeAnnotation(rawAnnotation);
      if (annotation) store.annotations[task.id][itemId] = annotation;
    }
  }

  const rawTools = Array.isArray(raw.tools) ? raw.tools : [];
  const seenTools = new Set();
  for (const candidate of rawTools) {
    const tool = normalizeTool(candidate);
    if (!tool || seenTools.has(tool.id)) continue;
    seenTools.add(tool.id);
    store.tools.push(tool);
  }
  return store;
}

function summarizeTask(task, items, annotations) {
  let done = 0;
  let skipped = 0;
  let draft = 0;
  for (const item of items) {
    const annotation = annotations[item.id];
    if (!annotation) continue;
    if (annotation.status === 'done') done += 1;
    else if (annotation.status === 'skipped') skipped += 1;
    else draft += 1;
  }
  const total = items.length;
  const reviewed = done + skipped;
  return {
    total,
    done,
    skipped,
    draft,
    pending: Math.max(0, total - reviewed - draft),
    todo: Math.max(0, total - reviewed),
    progress: total === 0 ? 0 : reviewed / total,
  };
}

export function createAnnotationService(options) {
  const dataDirectory = options.dataDirectory;
  const mediaDirectory = options.mediaDirectory;
  const storeFile = path.join(dataDirectory, 'store.json');
  const store = emptyStore();
  let loadPromise;
  let saveChain = Promise.resolve();
  let lastSaveError = null;

  async function ensureLoaded() {
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const raw = await fs.readFile(storeFile, 'utf8');
          const parsed = normalizeStore(JSON.parse(raw));
          store.version = parsed.version;
          store.datasets = parsed.datasets;
          store.tasks = parsed.tasks;
          store.annotations = parsed.annotations;
          store.tools = parsed.tools;
        } catch (error) {
          if (!error || error.code !== 'ENOENT') {
            console.error('[human-intelligence] could not read the annotation store:', error);
          }
        }
      })();
    }
    return loadPromise;
  }

  function persist() {
    const payload = JSON.stringify(store, null, 2);
    const run = saveChain.then(async () => {
      try {
        await fs.mkdir(dataDirectory, { recursive: true });
        const temporary = `${storeFile}.${process.pid}.tmp`;
        await fs.writeFile(temporary, payload, 'utf8');
        await fs.rename(temporary, storeFile);
        lastSaveError = null;
      } catch (error) {
        lastSaveError = error instanceof Error ? error.message : String(error);
        console.error('[human-intelligence] failed to save the annotation store:', error);
        throw error;
      }
    });
    saveChain = run.catch(() => {});
    return run;
  }

  function requireTask(taskId) {
    const task = store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw fail(404, 'Annotation task not found.');
    return task;
  }

  function requireDataset(datasetId) {
    const dataset = store.datasets.find((candidate) => candidate.id === datasetId);
    if (!dataset) throw fail(404, 'Dataset not found.');
    return dataset;
  }

  function taskDataset(task) {
    const dataset = store.datasets.find((candidate) => candidate.id === task.datasetId);
    if (!dataset) throw fail(500, 'The task dataset is missing.');
    return dataset;
  }

  function requireTaskItem(task, itemId) {
    const dataset = taskDataset(task);
    const item = dataset.items.find((candidate) => candidate.id === itemId);
    if (!item) throw fail(404, 'Dataset item not found.');
    return item;
  }

  function datasetSummary(dataset) {
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      modality: dataset.modality,
      itemCount: dataset.items.length,
      taskCount: store.tasks.reduce((count, task) => count + (task.datasetId === dataset.id ? 1 : 0), 0),
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }

  function datasetDetail(dataset) {
    return { ...datasetSummary(dataset), items: dataset.items };
  }

  function taskSnapshot(task) {
    const dataset = taskDataset(task);
    const annotations = store.annotations[task.id] || {};
    return { ...task, stats: summarizeTask(task, dataset.items, annotations) };
  }

  function taskDetail(task) {
    const dataset = taskDataset(task);
    const annotations = store.annotations[task.id] || {};
    return {
      task: taskSnapshot(task),
      dataset: {
        ...datasetDetail(dataset),
        annotations,
        stats: summarizeTask(task, dataset.items, annotations),
      },
    };
  }

  function getState() {
    return {
      version: STORE_VERSION,
      datasets: store.datasets.map(datasetSummary),
      tasks: store.tasks.map(taskSnapshot),
      tools: store.tools,
      saveError: lastSaveError,
    };
  }

  function listDatasets() {
    return store.datasets.map(datasetSummary);
  }

  function getDataset(datasetId) {
    return datasetDetail(requireDataset(datasetId));
  }

  function getTask(taskId) {
    return taskDetail(requireTask(taskId));
  }

  function getTaskDataset(taskId) {
    const task = requireTask(taskId);
    const dataset = taskDataset(task);
    const annotations = store.annotations[task.id] || {};
    return {
      ...datasetDetail(dataset),
      annotations,
      stats: summarizeTask(task, dataset.items, annotations),
    };
  }

  function listTools() {
    return store.tools.slice();
  }

  async function createDataset(input) {
    if (!isRecord(input)) throw fail(400, 'A dataset payload is required.');
    const modality = text(input.modality).trim();
    if (!MODALITY_TASKS[modality]) throw fail(400, 'Unknown data modality.');
    const name = text(input.name).trim().slice(0, 200);
    if (name === '') throw fail(400, 'A dataset name is required.');
    const now = Date.now();
    const dataset = {
      id: randomUUID(),
      name,
      description: text(input.description).slice(0, 4_000),
      modality,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    store.datasets.unshift(dataset);
    await persist();
    return datasetSummary(dataset);
  }

  async function updateDataset(datasetId, patch) {
    const dataset = requireDataset(datasetId);
    if (!isRecord(patch)) throw fail(400, 'A dataset payload is required.');
    if (typeof patch.name === 'string') {
      const name = patch.name.trim().slice(0, 200);
      if (name !== '') dataset.name = name;
    }
    if (typeof patch.description === 'string') dataset.description = patch.description.slice(0, 4_000);
    dataset.updatedAt = Date.now();
    await persist();
    return datasetSummary(dataset);
  }

  async function deleteMediaFiles(files) {
    for (const file of files) {
      if (!file) continue;
      await fs.rm(path.join(mediaDirectory, file), { force: true }).catch(() => {});
    }
  }

  async function deleteDataset(datasetId) {
    const dataset = requireDataset(datasetId);
    const usedBy = store.tasks.filter((task) => task.datasetId === dataset.id);
    if (usedBy.length > 0) {
      throw fail(409, `This dataset is used by ${usedBy.length} annotation task(s). Delete those tasks first.`);
    }
    const files = dataset.items.map((item) => item.media && item.media.file);
    store.datasets = store.datasets.filter((candidate) => candidate.id !== dataset.id);
    await persist();
    await deleteMediaFiles(files);
    return { deleted: true, id: dataset.id };
  }

  async function prepareItems(modality, incoming) {
    if (!Array.isArray(incoming)) throw fail(400, 'An items array is required.');
    if (incoming.length > MAX_ITEMS_PER_REQUEST) {
      throw fail(413, `At most ${MAX_ITEMS_PER_REQUEST} items can be added at once.`);
    }
    const prepared = [];
    for (const candidate of incoming) {
      const item = normalizeItem(modality, { ...(isRecord(candidate) ? candidate : {}), id: randomUUID() });
      if (!item) throw fail(400, 'Every item needs valid text or an uploaded media reference.');
      if (modality !== 'text') {
        const mediaPath = path.join(mediaDirectory, item.media.file);
        try {
          const stat = await fs.stat(mediaPath);
          if (!stat.isFile()) throw new Error('not a file');
          item.media.size = stat.size;
        } catch {
          throw fail(400, 'Uploaded media was not found. Re-upload the file.');
        }
      }
      prepared.push(item);
    }
    return prepared;
  }

  async function addDatasetItems(datasetId, incoming) {
    const dataset = requireDataset(datasetId);
    if (dataset.items.length + (Array.isArray(incoming) ? incoming.length : 0) > MAX_ITEMS_PER_DATASET) {
      throw fail(413, `A dataset can hold at most ${MAX_ITEMS_PER_DATASET} items.`);
    }
    const prepared = await prepareItems(dataset.modality, incoming);
    dataset.items.push(...prepared);
    dataset.updatedAt = Date.now();
    await persist();
    return { items: prepared, dataset: datasetSummary(dataset) };
  }

  async function deleteDatasetItem(datasetId, itemId) {
    const dataset = requireDataset(datasetId);
    const item = dataset.items.find((candidate) => candidate.id === itemId);
    if (!item) throw fail(404, 'Dataset item not found.');
    dataset.items = dataset.items.filter((candidate) => candidate.id !== itemId);
    dataset.updatedAt = Date.now();
    for (const task of store.tasks) {
      if (task.datasetId === dataset.id && store.annotations[task.id]) {
        delete store.annotations[task.id][itemId];
      }
    }
    await persist();
    if (item.media) await deleteMediaFiles([item.media.file]);
    return {
      deleted: true,
      id: itemId,
      dataset: datasetSummary(dataset),
    };
  }

  async function createTask(input) {
    if (!isRecord(input)) throw fail(400, 'A task payload is required.');
    const modality = text(input.modality).trim();
    const taskId = text(input.task).trim();
    if (!MODALITY_TASKS[modality]) throw fail(400, 'Unknown data modality.');
    if (!MODALITY_TASKS[modality].has(taskId)) throw fail(400, 'Unknown task type for this modality.');
    const toolId = text(input.toolId).trim().slice(0, 120);
    if (toolId !== '' && !toolId.startsWith('preset:') && !store.tools.some((tool) => tool.id === toolId)) {
      throw fail(400, 'Annotation tool not found.');
    }
    const name = text(input.name).trim().slice(0, 200) || 'Untitled task';
    const requestedDatasetId = text(input.datasetId).trim();
    let dataset;
    if (requestedDatasetId !== '') {
      dataset = store.datasets.find((candidate) => candidate.id === requestedDatasetId);
      if (!dataset) throw fail(400, 'Dataset not found.');
      if (dataset.modality !== modality) throw fail(400, 'Dataset modality does not match the task modality.');
    } else {
      const now = Date.now();
      dataset = {
        id: randomUUID(),
        name: `${name} dataset`,
        description: '',
        modality,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
      store.datasets.unshift(dataset);
    }
    const now = Date.now();
    const task = {
      id: randomUUID(),
      name,
      description: text(input.description).slice(0, 4_000),
      modality,
      task: taskId,
      toolId,
      datasetId: dataset.id,
      taskOptions: normalizeTaskOptions(input.taskOptions),
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.unshift(task);
    store.annotations[task.id] = {};
    await persist();
    return taskSnapshot(task);
  }

  async function updateTask(taskId, patch) {
    const task = requireTask(taskId);
    if (!isRecord(patch)) throw fail(400, 'A task payload is required.');
    if (typeof patch.name === 'string') {
      const name = patch.name.trim().slice(0, 200);
      if (name !== '') task.name = name;
    }
    if (typeof patch.description === 'string') task.description = patch.description.slice(0, 4_000);
    if (patch.taskOptions !== undefined) task.taskOptions = normalizeTaskOptions(patch.taskOptions);
    task.updatedAt = Date.now();
    await persist();
    return taskSnapshot(task);
  }

  async function deleteTask(taskId) {
    const task = requireTask(taskId);
    store.tasks = store.tasks.filter((candidate) => candidate.id !== task.id);
    delete store.annotations[task.id];
    await persist();
    return { deleted: true, id: task.id };
  }

  async function saveAnnotation(taskId, itemId, input) {
    const task = requireTask(taskId);
    requireTaskItem(task, itemId);
    if (!isRecord(input)) throw fail(400, 'An annotation payload is required.');
    const current = store.annotations[task.id] ? store.annotations[task.id][itemId] : undefined;
    if (input.expectedRevision !== undefined) {
      const expected = Math.max(0, Math.floor(finiteNumber(input.expectedRevision)));
      if ((current ? current.revision : 0) !== expected) {
        throw fail(409, 'The annotation was updated by another writer.');
      }
    }
    let value = input.value;
    if (!isRecord(value) && !Array.isArray(value)) value = {};
    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw fail(400, 'The annotation payload must be JSON serializable.');
    }
    if (typeof serialized !== 'string' || serialized.length > MAX_ANNOTATION_BYTES) {
      throw fail(400, 'The annotation payload is too large.');
    }
    let status = current ? current.status : 'draft';
    if (input.status !== undefined) {
      status = text(input.status);
      if (!STORED_ANNOTATION_STATUS.has(status)) throw fail(400, 'Unknown annotation status.');
    }
    const annotation = {
      value,
      status,
      revision: (current ? current.revision : 0) + 1,
      updatedAt: Date.now(),
    };
    store.annotations[task.id] = store.annotations[task.id] || {};
    store.annotations[task.id][itemId] = annotation;
    task.updatedAt = Date.now();
    await persist();
    const dataset = taskDataset(task);
    return {
      annotation,
      stats: summarizeTask(task, dataset.items, store.annotations[task.id] || {}),
    };
  }

  async function setStatus(taskId, itemId, status) {
    const task = requireTask(taskId);
    requireTaskItem(task, itemId);
    if (!ANNOTATION_STATUSES.includes(status)) throw fail(400, 'Unknown annotation status.');
    const current = store.annotations[task.id] ? store.annotations[task.id][itemId] : undefined;
    if (status === 'pending') {
      if (store.annotations[task.id]) delete store.annotations[task.id][itemId];
      task.updatedAt = Date.now();
      await persist();
      const dataset = taskDataset(task);
      return {
        annotation: null,
        stats: summarizeTask(task, dataset.items, store.annotations[task.id] || {}),
      };
    }
    const annotation = {
      value: current ? current.value : {},
      status,
      revision: (current ? current.revision : 0) + 1,
      updatedAt: Date.now(),
    };
    store.annotations[task.id] = store.annotations[task.id] || {};
    store.annotations[task.id][itemId] = annotation;
    task.updatedAt = Date.now();
    await persist();
    const dataset = taskDataset(task);
    return {
      annotation,
      stats: summarizeTask(task, dataset.items, store.annotations[task.id] || {}),
    };
  }

  async function createTool(input) {
    if (!isRecord(input)) throw fail(400, 'A tool payload is required.');
    const modality = text(input.modality).trim();
    const taskId = text(input.task).trim();
    if (!MODALITY_TASKS[modality]) throw fail(400, 'Unknown data modality.');
    if (!MODALITY_TASKS[modality].has(taskId)) throw fail(400, 'Unknown task type for this modality.');
    const name = text(input.name).trim().slice(0, 120);
    if (name === '') throw fail(400, 'A tool name is required.');
    if (store.tools.length >= MAX_TOOLS) throw fail(413, `At most ${MAX_TOOLS} custom tools can be created.`);
    const now = Date.now();
    const tool = {
      id: randomUUID(),
      name,
      modality,
      task: taskId,
      taskOptions: normalizeTaskOptions(input.taskOptions),
      createdAt: now,
      updatedAt: now,
    };
    store.tools.unshift(tool);
    await persist();
    return tool;
  }

  async function deleteTool(toolId) {
    const tool = store.tools.find((candidate) => candidate.id === toolId);
    if (!tool) throw fail(404, 'Annotation tool not found.');
    store.tools = store.tools.filter((candidate) => candidate.id !== tool.id);
    await persist();
    return { deleted: true, id: tool.id };
  }

  function exportTask(taskId) {
    const task = requireTask(taskId);
    const dataset = taskDataset(task);
    const annotations = store.annotations[task.id] || {};
    return {
      format: 'human-intelligence-annotations',
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      task: taskSnapshot(task),
      dataset: datasetSummary(dataset),
      stats: summarizeTask(task, dataset.items, annotations),
      items: dataset.items.map((item) => ({ ...item, annotation: annotations[item.id] || null })),
    };
  }

  return {
    ensureLoaded,
    getState,
    listDatasets,
    getDataset,
    createDataset,
    updateDataset,
    deleteDataset,
    addDatasetItems,
    deleteDatasetItem,
    getTask,
    getTaskDataset,
    createTask,
    updateTask,
    deleteTask,
    saveAnnotation,
    setStatus,
    listTools,
    createTool,
    deleteTool,
    exportTask,
  };
}
