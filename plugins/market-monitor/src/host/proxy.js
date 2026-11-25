/**
 * Browser-to-engine HTTP proxy and host-only diagnostics routes.
 *
 * Kept free of Cordis imports so it can be mounted on a plain Node server in
 * tests. The sidecar object only needs `request(method, path, body)` and
 * `status()`.
 */
import { SidecarError, shortError } from './sidecar.js';

export const API_PREFIX = '/market-monitor/api';
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Create the HTTP handler for the plugin prefix route.
 * @param {{ request: Function, status: () => object }} sidecar sidecar client.
 * @param {object} config normalized plugin configuration.
 * @param {string} pluginRoot absolute plugin directory for diagnostics.
 * @returns {(req: any, res: any, peer?: any) => Promise<void>} route handler.
 */
export function createApiHandler(sidecar, config, pluginRoot) {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const relative = url.pathname.slice(API_PREFIX.length) || '/';
      const method = (req.method ?? 'GET').toUpperCase();

      // Host-only diagnostics keep the panel informed when the sidecar is down.
      if (relative === '/host' || relative === '/host/') {
        sendJson(res, 200, {
          status: sidecar.status(),
          config: {
            provider: config.provider,
            pollSeconds: config.pollSeconds,
            benchmark: config.benchmark,
            dataCollect: config.dataCollect !== false,
          },
          pluginRoot,
        });
        return;
      }
      if (relative === '/host/restart' && method === 'POST') {
        await sidecar.stop();
        await sidecar.ensureStarted();
        sendJson(res, 200, { status: sidecar.status() });
        return;
      }

      const target = toEnginePath(relative);
      if (!target) {
        sendError(res, 404, 'not_found', `Unknown market monitor endpoint "${relative}".`);
        return;
      }
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readJsonBody(req);
      const payload = await sidecar.request(method, `${target}${url.search}`, body);
      sendJson(res, 200, payload);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = error instanceof SidecarError && Number.isInteger(error.status)
        ? error.status
        : 503;
      const code = error instanceof SidecarError ? error.code : 'internal_error';
      const message = shortError(error);
      if (status >= 500) console.warn(`[market-monitor] api failure: ${message}`);
      sendError(res, status, code, message);
    }
  };
}

/**
 * Map a browser-relative path onto the Python engine path.
 * @param {string} relative path after the plugin prefix.
 * @returns {string | null} engine path, or null for an unknown shape.
 */
export function toEnginePath(relative) {
  if (relative === '/health') return '/health';
  if (relative.startsWith('/v1/')) return `/api${relative}`;
  return null;
}

/**
 * Read and parse a JSON request body with a size cap.
 * @param {any} req node request.
 * @returns {Promise<unknown>} parsed body.
 */
export function readJsonBody(req) {
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
      if (size > MAX_BODY_BYTES) {
        fail(new SidecarError('payload_too_large', 'Request body is too large.', 413));
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
        reject(new SidecarError('invalid_json', 'Request body must be valid JSON.', 400));
      }
    });
    req.on('error', (error) => fail(new SidecarError('bad_request', shortError(error), 400)));
  });
}

/**
 * Write one JSON response.
 * @param {any} res node response.
 * @param {number} status HTTP status.
 * @param {unknown} value response payload.
 */
export function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

/**
 * Write one JSON error response.
 * @param {any} res node response.
 * @param {number} status HTTP status.
 * @param {string} code machine-readable code.
 * @param {string} message human-readable message.
 */
export function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}
