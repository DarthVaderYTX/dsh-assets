/**
 * Host API smoke test: boots the plugin's HTTP adapter with a fake Cordis
 * context, then exercises the annotation service through the public API:
 * datasets, tasks, annotation status/results, tools, uploads, ranges, export.
 * Run with: node test/smoke.mjs
 */
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { apply } from '../index.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'human-intelligence-smoke-'));
process.env.DSH_PROFILE_DIR = temp;

let handler;
let registeredSkill;
const ctx = {
  get() {
    return undefined;
  },
  effect(factory) {
    const dispose = factory();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  skills: {
    register(skill) {
      registeredSkill = skill;
      return () => {};
    },
  },
  webServer: {
    register(route) {
      handler = route.handler;
      return () => {};
    },
  },
};
apply(ctx);
if (typeof handler !== 'function') throw new Error('The plugin did not register a web route.');
if (!registeredSkill || registeredSkill.name !== 'human-intelligence') {
  throw new Error('The plugin did not register its runtime skill.');
}

const server = createServer((req, res) => {
  handler(req, res).catch((error) => {
    res.statusCode = 500;
    res.end(String(error && error.stack ? error.stack : error));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/human-intelligence/api`;

function check(value, message) {
  if (!value) throw new Error(`FAIL: ${message}`);
  console.log(`ok  ${message}`);
}

async function json(pathname, options = {}) {
  const response = await fetch(origin + pathname, {
    method: options.method || 'GET',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

try {
  let result = await json('/state');
  check(
    result.status === 200 &&
      result.payload.tasks.length === 0 &&
      result.payload.datasets.length === 0 &&
      result.payload.tools.length === 0,
    'state starts empty',
  );

  result = await json('/tools', {
    method: 'POST',
    body: {
      name: 'Review sentiment tool',
      modality: 'text',
      task: 'text-classification',
      taskOptions: { labels: ['正面', '负面'] },
    },
  });
  check(result.status === 201 && result.payload.id, 'create a custom annotation tool');
  const customTool = result.payload;

  result = await json('/state');
  check(result.payload.tools.length === 1 && result.payload.tools[0].id === customTool.id, 'state lists the custom tool');

  const storeAfterTool = JSON.parse(
    await fs.readFile(path.join(temp, 'human-intelligence', 'store.json'), 'utf8'),
  );
  check(
    storeAfterTool.tools.some((tool) => tool.id === customTool.id),
    'persist the custom tool to store.json',
  );

  result = await json('/datasets', {
    method: 'POST',
    body: {
      name: 'Review comments',
      description: 'Two review examples.',
      modality: 'text',
    },
  });
  check(result.status === 201 && result.payload.id && result.payload.itemCount === 0, 'create a text dataset');
  const textDataset = result.payload;

  result = await json(`/datasets/${textDataset.id}/items`, {
    method: 'POST',
    body: {
      items: [
        { name: 'First', text: 'This product is great.' },
        { name: 'Second', text: 'It broke immediately.' },
      ],
    },
  });
  check(result.status === 201 && result.payload.items.length === 2, 'add two dataset items');
  const firstItem = result.payload.items[0].id;
  const secondItem = result.payload.items[1].id;

  result = await json('/datasets');
  check(
    result.status === 200 &&
      result.payload.datasets.some((dataset) => dataset.id === textDataset.id && dataset.itemCount === 2),
    'dataset list reports the item count',
  );

  result = await json('/tasks', {
    method: 'POST',
    body: {
      name: 'Unknown tool',
      modality: 'text',
      task: 'text-classification',
      toolId: 'missing-tool',
      datasetId: textDataset.id,
    },
  });
  check(result.status === 400, 'reject a task that references an unknown tool');

  result = await json('/tasks', {
    method: 'POST',
    body: {
      name: 'Sentiment task',
      modality: 'text',
      task: 'text-classification',
      taskOptions: { labels: ['正面', '负面'] },
      description: 'Pick one label.',
      toolId: customTool.id,
      datasetId: textDataset.id,
    },
  });
  check(result.status === 201 && result.payload.datasetId === textDataset.id, 'create a task from the dataset');
  const textTask = result.payload.id;

  result = await json('/tasks', {
    method: 'POST',
    body: { name: 'Bad', modality: 'text', task: 'image-bbox', datasetId: textDataset.id },
  });
  check(result.status === 400, 'reject a task type from another modality');

  result = await json(`/tasks/${textTask}`);
  check(
    result.status === 200 &&
      result.payload.dataset.items.length === 2 &&
      result.payload.dataset.itemCount === 2,
    'task detail includes the shared dataset',
  );

  result = await json(`/tasks/${textTask}/dataset/items/${firstItem}/annotation`, {
    method: 'PUT',
    body: { value: { label: '正面' }, status: 'done' },
  });
  check(
    result.status === 200 &&
      result.payload.annotation.status === 'done' &&
      result.payload.annotation.revision === 1,
    'save an annotation result with a revision',
  );

  result = await json(`/tasks/${textTask}/dataset/items/${secondItem}/status`, {
    method: 'PATCH',
    body: { status: 'skipped' },
  });
  check(result.status === 200 && result.payload.annotation.status === 'skipped', 'set annotation status to skipped');

  result = await json(`/tasks/${textTask}/dataset/items/${secondItem}/status`, {
    method: 'PATCH',
    body: { status: 'pending' },
  });
  check(result.status === 200 && result.payload.annotation === null, 'clear an annotation status back to pending');

  result = await json(`/tasks/${textTask}/dataset`);
  check(result.status === 200 && result.payload.items.length === 2, 'read the task dataset API');

  result = await json('/state');
  const textTaskSummary = result.payload.tasks.find((task) => task.id === textTask);
  check(textTaskSummary.stats.done === 1 && textTaskSummary.stats.total === 2, 'task stats count the completed item');
  const textDatasetSummary = result.payload.datasets.find((dataset) => dataset.id === textDataset.id);
  check(textDatasetSummary.taskCount === 1, 'dataset reports the task count');

  result = await json(`/datasets/${textDataset.id}`, { method: 'DELETE' });
  check(result.status === 409, 'refuse to delete a dataset used by tasks');

  result = await json(`/tasks/${textTask}/dataset/items/${firstItem}/annotation`, {
    method: 'PUT',
    body: { value: { label: '正面' }, status: 'done', expectedRevision: 99 },
  });
  check(result.status === 409, 'reject a stale annotation revision');

  result = await json('/datasets', {
    method: 'POST',
    body: { name: 'Web ranking dataset', modality: 'text' },
  });
  check(result.status === 201, 'create a web ranking dataset');
  const rankingDataset = result.payload;

  result = await json(`/datasets/${rankingDataset.id}/items`, {
    method: 'POST',
    body: {
      items: [
        {
          name: 'DevOps best practices',
          text: JSON.stringify({
            query: 'DevOps Best Practices',
            requestTime: '2023-05-15 14:30:00',
            market: 'Technology',
            location: 'Global',
            candidates: [
              { id: 'c0', title: 'A', url: 'https://example.com/a', body: 'Page A' },
              { id: 'c1', title: 'B', url: 'https://example.com/b', body: 'Page B' },
              { id: 'c2', title: 'C', url: 'https://example.com/c', body: 'Page C' },
            ],
          }),
        },
      ],
    },
  });
  check(result.status === 201 && result.payload.items.length === 1, 'add a web ranking item to the dataset');
  const rankingItem = result.payload.items[0].id;

  result = await json('/tasks', {
    method: 'POST',
    body: {
      name: 'Web ranking task',
      modality: 'text',
      task: 'text-ranking',
      datasetId: rankingDataset.id,
    },
  });
  check(result.status === 201, 'create a web ranking task from the dataset');
  const rankingTask = result.payload.id;

  result = await json(`/tasks/${rankingTask}/dataset/items/${rankingItem}/annotation`, {
    method: 'PUT',
    body: {
      value: {
        buckets: {
          candidates: [],
          perfect: ['c2'],
          excellent: ['c0'],
          good: [],
          fair: [],
          bad: ['c1'],
        },
      },
      status: 'done',
    },
  });
  check(
    result.status === 200 && result.payload.annotation.value.buckets.perfect[0] === 'c2',
    'save a web page ranking annotation',
  );

  result = await json(`/tools/${customTool.id}`, { method: 'DELETE' });
  check(result.status === 200, 'delete a custom tool');

  result = await json('/state');
  check(
    result.payload.tools.length === 0 && result.payload.tasks.some((task) => task.id === textTask),
    'deleting a tool keeps its existing tasks',
  );

  const upload = await fetch(`${origin}/media?name=dot.png`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
  });
  const uploaded = await upload.json();
  check(upload.status === 201 && uploaded.media.file.endsWith('.png'), 'upload a PNG');

  result = await json('/datasets', {
    method: 'POST',
    body: { name: 'Box images', modality: 'image' },
  });
  check(result.status === 201, 'create an image dataset');
  const imageDataset = result.payload;

  result = await json(`/datasets/${imageDataset.id}/items`, {
    method: 'POST',
    body: { items: [{ name: 'dot.png', media: uploaded.media }] },
  });
  check(result.status === 201 && result.payload.items.length === 1, 'add the uploaded image to the dataset');
  const imageItem = result.payload.items[0].id;

  result = await json('/tasks', {
    method: 'POST',
    body: {
      name: 'Boxes',
      modality: 'image',
      task: 'image-bbox',
      taskOptions: { labels: ['目标'] },
      datasetId: imageDataset.id,
    },
  });
  check(result.status === 201, 'create an image task from the dataset');
  const imageTask = result.payload.id;

  result = await json(`/tasks/${imageTask}/dataset/items/${imageItem}/annotation`, {
    method: 'PUT',
    body: {
      value: { boxes: [{ id: 'b1', x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: '目标' }] },
      status: 'done',
    },
  });
  check(result.status === 200, 'save a bounding-box annotation');

  const range = await fetch(`${origin}/media/${uploaded.media.file}`, {
    headers: { range: 'bytes=0-3' },
  });
  check(range.status === 206 && (await range.arrayBuffer()).byteLength === 4, 'serve media with a byte range');

  result = await json(`/tasks/${imageTask}/export`);
  check(
    result.status === 200 &&
      result.payload.format === 'human-intelligence-annotations' &&
      result.payload.items[0].annotation.value.boxes.length === 1 &&
      result.payload.dataset.itemCount === 1,
    'export task annotations with dataset metadata',
  );

  result = await json(`/datasets/${imageDataset.id}/items`, {
    method: 'POST',
    body: {
      items: [
        {
          name: 'missing.png',
          media: { file: '00000000-0000-0000-0000-000000000000.png', mime: 'image/png', size: 1 },
        },
      ],
    },
  });
  check(result.status === 400, 'reject a dataset item whose media file is missing');

  check((await json('/media/..%2Fstore.json')).status === 404, 'reject media path traversal');

  result = await json(`/tasks/${textTask}`, { method: 'DELETE' });
  check(result.status === 200, 'delete a task');

  result = await json(`/datasets/${textDataset.id}`, { method: 'DELETE' });
  check(result.status === 200, 'delete a dataset after its tasks are gone');

  const store = JSON.parse(await fs.readFile(path.join(temp, 'human-intelligence', 'store.json'), 'utf8'));
  check(
    store.tasks.some((task) => task.id === imageTask) &&
      store.datasets.some((dataset) => dataset.id === imageDataset.id),
    'persist surviving tasks and datasets to store.json',
  );

  console.log('\nAll host API smoke checks passed.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
