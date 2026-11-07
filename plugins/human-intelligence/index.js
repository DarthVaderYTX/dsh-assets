/**
 * Human Intelligence host HTTP adapter.
 *
 * All durable data operations live in `src/host/annotation-service.js`; this
 * file only translates the browser API surface (tasks, datasets, annotation
 * status/results, tools, media) into service calls. Media upload and byte
 * serving stay here because they are transport concerns.
 */
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createAnnotationService } from './src/host/annotation-service.js';
import { HUMAN_INTELLIGENCE_SKILL } from './src/host/skill.js';

export const name = 'human-intelligence';
export const inject = ['webServer', 'skills'];

const API_PREFIX = '/human-intelligence/api';
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['avif', 'image/avif'],
]);

const VIDEO_TYPES = new Map([
  ['mp4', 'video/mp4'],
  ['m4v', 'video/mp4'],
  ['webm', 'video/webm'],
  ['ogg', 'video/ogg'],
  ['ogv', 'video/ogg'],
  ['mov', 'video/quicktime'],
  ['mkv', 'video/x-matroska'],
]);

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: { status, message } });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        fail(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (size === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', (error) => fail(error));
  });
}

function parseSegments(url) {
  const relative = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '');
  if (relative === '') return [];
  return relative.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function safeFileStem(value) {
  return (
    String(value || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'annotation'
  );
}

function mediaTypeForFile(file) {
  const extension = path.extname(file).slice(1).toLowerCase();
  return IMAGE_TYPES.get(extension) || VIDEO_TYPES.get(extension) || 'application/octet-stream';
}

export function apply(ctx) {
  const profileDirectory =
    process.env.DSH_PROFILE_DIR ||
    path.join(os.homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'desktop');
  const dataDirectory = path.join(profileDirectory, 'human-intelligence');
  const mediaDirectory = path.join(dataDirectory, 'media');
  const service = createAnnotationService({ dataDirectory, mediaDirectory });

  ctx.effect(
    () => ctx.skills.register(HUMAN_INTELLIGENCE_SKILL),
    'human-intelligence: runtime skill',
  );

  async function handleUpload(req, res, url) {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Method not allowed.');
      return;
    }
    const name = safeFileStem(url.searchParams.get('name') || 'upload');
    const declared = text(req.headers['content-type']).split(';')[0].trim().toLowerCase();
    const extension = MIME_EXTENSIONS[declared];
    if (!extension) {
      sendError(res, 415, 'Only image and video files can be uploaded.');
      return;
    }
    await fs.mkdir(mediaDirectory, { recursive: true });
    const file = `${randomUUID()}.${extension}`;
    const target = path.join(mediaDirectory, file);
    let size = 0;
    let failed = null;
    const stream = createWriteStream(target);
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve();
        };
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_UPLOAD_BYTES) {
            failed = Object.assign(new Error('The file is too large.'), { status: 413 });
            req.unpipe(stream);
            stream.destroy();
            req.destroy();
            finish(failed);
          }
        });
        req.on('aborted', () => finish(Object.assign(new Error('Upload aborted.'), { status: 400 })));
        req.on('error', (error) => finish(error));
        stream.on('error', (error) => finish(error));
        stream.on('finish', () => finish());
        req.pipe(stream);
      });
      if (failed) {
        await fs.rm(target, { force: true }).catch(() => {});
        sendError(res, failed.status || 400, failed.message);
        return;
      }
      sendJson(res, 201, {
        media: { file, name, mime: declared, size },
        url: `${API_PREFIX}/media/${encodeURIComponent(file)}`,
      });
    } catch (error) {
      await fs.rm(target, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function handleMedia(req, res, file) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method not allowed.');
      return;
    }
    if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/i.test(file)) {
      sendError(res, 404, 'Media not found.');
      return;
    }
    const target = path.join(mediaDirectory, file);
    let stat;
    try {
      stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('not a file');
    } catch {
      sendError(res, 404, 'Media not found.');
      return;
    }
    const mime = mediaTypeForFile(file);
    const range = req.headers.range;
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('content-type', mime);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=3600');
    if (typeof range === 'string') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        const start = match[1] === '' ? Math.max(0, stat.size - Number(match[2])) : Number(match[1]);
        const end = match[1] !== '' && match[2] !== '' ? Number(match[2]) : stat.size - 1;
        if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
          const last = Math.min(end, stat.size - 1);
          res.statusCode = 206;
          res.setHeader('content-range', `bytes ${start}-${last}/${stat.size}`);
          res.setHeader('content-length', last - start + 1);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          createReadStream(target, { start, end: last }).pipe(res);
          return;
        }
        res.statusCode = 416;
        res.setHeader('content-range', `bytes */${stat.size}`);
        res.end();
        return;
      }
    }
    res.statusCode = 200;
    res.setHeader('content-length', stat.size);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(target).pipe(res);
  }

  async function handle(req, res) {
    const connection = ctx.get('connection');
    if (connection && typeof connection.requestRejection === 'function') {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
    }

    let url;
    let segments;
    try {
      url = new URL(String(req.url || '/'), 'http://human-intelligence.local');
      segments = parseSegments(url);
    } catch {
      sendError(res, 400, 'Invalid request URL.');
      return;
    }
    const method = req.method || 'GET';

    try {
      await service.ensureLoaded();

      if (segments.length === 1 && segments[0] === 'state') {
        if (method !== 'GET') {
          sendError(res, 405, 'Method not allowed.');
          return;
        }
        sendJson(res, 200, service.getState());
        return;
      }

      if (segments[0] === 'datasets') {
        if (segments.length === 1) {
          if (method === 'GET') {
            sendJson(res, 200, { datasets: service.listDatasets() });
            return;
          }
          if (method === 'POST') {
            const body = await readJsonBody(req);
            sendJson(res, 201, await service.createDataset(body));
            return;
          }
          sendError(res, 405, 'Method not allowed.');
          return;
        }
        const datasetId = segments[1];
        if (segments.length === 2) {
          if (method === 'GET') {
            sendJson(res, 200, service.getDataset(datasetId));
            return;
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonBody(req);
            sendJson(res, 200, await service.updateDataset(datasetId, body));
            return;
          }
          if (method === 'DELETE') {
            sendJson(res, 200, await service.deleteDataset(datasetId));
            return;
          }
          sendError(res, 405, 'Method not allowed.');
          return;
        }
        if (segments.length === 3 && segments[2] === 'items' && method === 'POST') {
          const body = await readJsonBody(req);
          const items = isRecord(body) ? body.items : undefined;
          sendJson(res, 201, await service.addDatasetItems(datasetId, items));
          return;
        }
        if (segments.length === 4 && segments[2] === 'items' && method === 'DELETE') {
          sendJson(res, 200, await service.deleteDatasetItem(datasetId, segments[3]));
          return;
        }
        sendError(res, 404, 'Unknown dataset endpoint.');
        return;
      }

      if (segments[0] === 'tasks') {
        if (segments.length === 1) {
          if (method === 'GET') {
            sendJson(res, 200, service.getState());
            return;
          }
          if (method === 'POST') {
            const body = await readJsonBody(req);
            sendJson(res, 201, await service.createTask(body));
            return;
          }
          sendError(res, 405, 'Method not allowed.');
          return;
        }

        const taskId = segments[1];
        if (segments.length === 2) {
          if (method === 'GET') {
            sendJson(res, 200, service.getTask(taskId));
            return;
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJsonBody(req);
            sendJson(res, 200, await service.updateTask(taskId, body));
            return;
          }
          if (method === 'DELETE') {
            sendJson(res, 200, await service.deleteTask(taskId));
            return;
          }
          sendError(res, 405, 'Method not allowed.');
          return;
        }

        if (segments.length === 3 && segments[2] === 'dataset' && method === 'GET') {
          sendJson(res, 200, service.getTaskDataset(taskId));
          return;
        }

        if (segments.length === 3 && segments[2] === 'export' && method === 'GET') {
          const payload = service.exportTask(taskId);
          const body = JSON.stringify(payload, null, 2);
          const fileName = `human-intelligence-${safeFileStem(payload.task.name)}-${taskId.slice(0, 8)}.json`;
          const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_');
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('content-length', Buffer.byteLength(body));
          res.setHeader('cache-control', 'no-store');
          res.setHeader(
            'content-disposition',
            `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          );
          res.end(body);
          return;
        }

        if (
          segments.length === 6 &&
          segments[2] === 'dataset' &&
          segments[3] === 'items' &&
          segments[5] === 'annotation' &&
          (method === 'PUT' || method === 'POST')
        ) {
          const body = await readJsonBody(req);
          sendJson(res, 200, await service.saveAnnotation(taskId, segments[4], body));
          return;
        }

        if (
          segments.length === 6 &&
          segments[2] === 'dataset' &&
          segments[3] === 'items' &&
          segments[5] === 'status' &&
          (method === 'PATCH' || method === 'PUT')
        ) {
          const body = await readJsonBody(req);
          sendJson(res, 200, await service.setStatus(taskId, segments[4], isRecord(body) ? body.status : undefined));
          return;
        }

        sendError(res, 404, 'Unknown task endpoint.');
        return;
      }

      if (segments[0] === 'tools') {
        if (segments.length === 1) {
          if (method === 'GET') {
            sendJson(res, 200, { tools: service.listTools() });
            return;
          }
          if (method === 'POST') {
            const body = await readJsonBody(req);
            sendJson(res, 201, await service.createTool(body));
            return;
          }
          sendError(res, 405, 'Method not allowed.');
          return;
        }
        if (segments.length === 2 && method === 'DELETE') {
          sendJson(res, 200, await service.deleteTool(segments[1]));
          return;
        }
        sendError(res, 404, 'Unknown tool endpoint.');
        return;
      }

      if (segments.length === 1 && segments[0] === 'media') {
        await handleUpload(req, res, url);
        return;
      }

      if (segments.length === 2 && segments[0] === 'media') {
        await handleMedia(req, res, segments[1]);
        return;
      }

      sendError(res, 404, 'Unknown Human Intelligence API endpoint.');
    } catch (error) {
      const status = isRecord(error) && typeof error.status === 'number' ? error.status : 500;
      if (status >= 500) console.error('[human-intelligence] api failure:', error);
      if (!res.headersSent) sendError(res, status, error instanceof Error ? error.message : String(error));
      else res.end();
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: handle,
      }),
    'human-intelligence: /human-intelligence/api',
  );
}
