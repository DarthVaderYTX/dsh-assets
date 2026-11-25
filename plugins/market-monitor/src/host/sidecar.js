/**
 * Process and transport manager for the Python market engine.
 *
 * The Python package in `python/market_monitor` owns every financial operation.
 * This module only finds a Python interpreter, starts the sidecar, performs the
 * stdout handshake, forwards JSON requests, restarts the sidecar after a crash,
 * and stops it with the plugin lifecycle. It has no Cordis dependency so it can
 * be exercised by plain Node tests.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const READY_TIMEOUT_MS = 30000;
const STOP_TIMEOUT_MS = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 45000;
const SLOW_REQUEST_TIMEOUT_MS = 120000;

/** Raised for a request the sidecar could not answer. */
export class SidecarError extends Error {
  /**
   * @param {string} code machine-readable code.
   * @param {string} message human-readable message.
   * @param {number} [status] HTTP status when the sidecar answered.
   */
  constructor(code, message, status) {
    super(message);
    this.name = 'SidecarError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/**
 * Resolve the interpreter that runs the Python package.
 * @param {{ configured?: string, pluginRoot: string, env?: NodeJS.ProcessEnv }} options
 * @returns {Promise<{ command: string, version: string }>} resolved interpreter.
 */
export async function resolvePython(options) {
  const env = options.env ?? process.env;
  const candidates = [];
  const add = (command) => {
    if (typeof command === 'string' && command.trim() !== '' && !candidates.includes(command)) {
      candidates.push(command.trim());
    }
  };

  add(options.configured);
  add(env.DSH_MARKET_MONITOR_PYTHON);

  if (process.platform === 'win32') {
    add(env.DSH_PYTHON);
    for (const root of runtimeRoots(env)) {
      for (const found of await findRuntimeInterpreters(root, 'python.exe')) add(found);
    }
    for (const found of await findLocalAppDataInterpreters()) add(found);
    for (const name of ['python.exe', 'python3.exe', 'py.exe', 'python', 'python3', 'py']) {
      const onPath = whichSync(name);
      if (onPath) add(onPath);
    }
  } else {
    for (const root of runtimeRoots(env)) {
      for (const found of await findRuntimeInterpreters(root, 'python3')) add(found);
    }
    for (const fixed of ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3', '/usr/bin/python']) {
      if (existsSync(fixed)) add(fixed);
    }
    for (const name of ['python3', 'python']) {
      const onPath = whichSync(name);
      if (onPath) add(onPath);
    }
  }

  const problems = [];
  for (const command of candidates) {
    try {
      const { stdout } = await execFileAsync(command, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
        timeout: 8000,
        windowsHide: true,
      });
      const version = String(stdout).trim();
      const major = Number.parseInt(version.split('.')[0] ?? '', 10);
      const minor = Number.parseInt(version.split('.')[1] ?? '', 10);
      if (major > 3 || (major === 3 && minor >= 9)) return { command, version };
      problems.push(`${command}: Python ${version} is older than 3.9`);
    } catch (error) {
      problems.push(`${command}: ${shortError(error)}`);
    }
  }
  throw new SidecarError(
    'python_not_found',
    'No usable Python 3.9+ interpreter was found. Set `pythonPath` in the plugin config or the DSH_MARKET_MONITOR_PYTHON environment variable.'
      + (problems.length > 0 ? ` Tried: ${problems.join('; ')}` : ''),
  );
}

/**
 * Directories that may hold a DSH runtime with a bundled Python.
 * The Desktop app does not always export DSH_HOME to plugin code, so the
 * conventional profile home is always probed as well.
 * @param {NodeJS.ProcessEnv} env process environment.
 * @returns {string[]} candidate DSH home directories.
 */
function runtimeRoots(env) {
  const roots = [];
  const push = (value) => {
    if (typeof value !== 'string' || value.trim() === '') return;
    const resolved = path.resolve(value.trim());
    if (!roots.includes(resolved)) roots.push(resolved);
  };
  push(env.DSH_HOME);
  push(path.join(os.homedir(), '.dsh'));
  return roots;
}

/**
 * Probe the per-user Python installations on Windows.
 * @returns {Promise<string[]>} candidate interpreter paths.
 */
async function findLocalAppDataInterpreters() {
  const base = process.env.LOCALAPPDATA;
  if (!base) return [];
  const root = path.join(base, 'Programs', 'Python');
  const found = [];
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'python.exe');
    if (existsSync(candidate)) found.push(candidate);
  }
  return found.reverse();
}

/**
 * Locate interpreters bundled in a DSH installation.
 * @param {string} dshHome value of DSH_HOME.
 * @param {string} executable platform interpreter name.
 * @returns {Promise<string[]>} candidate interpreter paths.
 */
async function findRuntimeInterpreters(dshHome, executable) {
  const root = path.join(dshHome, 'dsh-runtimes');
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const base = path.join(root, entry.name, 'dependencies', 'python');
    for (const candidate of [path.join(base, executable), path.join(base, 'bin', executable)]) {
      try {
        await fsp.access(candidate);
        found.push(candidate);
      } catch {
        // Not bundled in this runtime.
      }
    }
  }
  return found;
}

/**
 * Resolve an executable on PATH without a shell.
 * @param {string} name executable name.
 * @returns {string | undefined} absolute path when found.
 */
function whichSync(name) {
  const pathValue = process.env.PATH ?? process.env.Path ?? '';
  const separator = process.platform === 'win32' ? ';' : ':';
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of pathValue.split(separator)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Start and supervise the Python sidecar for one plugin activation.
 */
export class MarketSidecar {
  /**
   * @param {object} options sidecar options.
   * @param {string} options.pluginRoot plugin package root.
   * @param {string} options.dataDir durable data directory.
   * @param {string} [options.pythonPath] explicit interpreter.
   * @param {string} [options.provider] initial provider mode.
   * @param {number} [options.pollSeconds] monitoring cadence.
   * @param {string} [options.benchmark] benchmark symbol.
   * @param {number} [options.port] 0 for an ephemeral port.
   * @param {(line: string) => void} [options.log] diagnostic logger.
   */
  constructor(options) {
    this.pluginRoot = options.pluginRoot;
    this.dataDir = options.dataDir;
    this.pythonPath = options.pythonPath ?? '';
    this.provider = options.provider ?? 'auto';
    this.pollSeconds = options.pollSeconds ?? 15;
    this.benchmark = options.benchmark ?? '^GSPC';
    this.dataCollect = options.dataCollect !== false;
    this.configuredPort = options.port ?? 0;
    this.log = options.log ?? (() => {});

    this.state = 'stopped';
    this.child = null;
    this.ownsChild = true;
    this.port = 0;
    this.token = '';
    this.pid = 0;
    this.python = null;
    this.error = '';
    this.stderrTail = [];
    this.stdoutTail = [];
    this.restartAttempts = 0;
    this.stopping = false;
    this.startTimer = null;
    this.startPromise = null;
    this.readySince = 0;
  }

  /** @returns {string} runtime discovery file written by the Python sidecar. */
  get runtimeFile() {
    return path.join(this.dataDir, 'runtime.json');
  }

  /** @returns {object} a serializable status snapshot for diagnostics. */
  status() {
    return {
      state: this.state,
      pid: this.pid,
      port: this.port,
      python: this.python?.command ?? '',
      pythonVersion: this.python?.version ?? '',
      dataDir: this.dataDir,
      runtimeFile: this.runtimeFile,
      provider: this.provider,
      pollSeconds: this.pollSeconds,
      dataCollect: this.dataCollect,
      platform: process.platform,
      error: this.error,
      restartAttempts: this.restartAttempts,
      ownsChild: this.ownsChild,
      stderrTail: this.stderrTail.slice(-8),
    };
  }

  /**
   * Ensure the sidecar is running and ready.
   * @returns {Promise<void>} resolves once `/health` can be reached.
   */
  async ensureStarted() {
    if (this.state === 'ready') return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /**
   * Start the child process and wait for the JSON handshake.
   * @returns {Promise<void>} resolves after the handshake.
   */
  async #start() {
    this.stopping = false;
    this.state = 'starting';
    this.error = '';
    if (!this.python) {
      this.python = await resolvePython({ configured: this.pythonPath, pluginRoot: this.pluginRoot });
      this.log(`using Python ${this.python.version} at ${this.python.command}`);
    }
    await fsp.mkdir(this.dataDir, { recursive: true });

    // A previous activation may still own the data directory (the Python
    // sidecar enforces one instance per directory). Adopt it instead of
    // spawning a duplicate collector.
    if (await this.#adoptExisting()) return;
    if (this.stopping) throw new SidecarError('sidecar_stopped', 'The sidecar start was cancelled.');

    if (this.stopping) throw new SidecarError('sidecar_stopped', 'The sidecar start was cancelled.');

    const args = [
      '-u',
      '-m',
      'market_monitor',
      'serve',
      '--port',
      String(this.configuredPort),
      '--data-dir',
      this.dataDir,
      '--provider',
      this.provider,
      '--poll-seconds',
      String(this.pollSeconds),
      '--benchmark',
      this.benchmark,
      ...(this.dataCollect ? [] : ['--no-data-collect']),
    ];
    const child = spawn(this.python.command, args, {
      cwd: path.join(this.pluginRoot, 'python'),
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.pid = child.pid ?? 0;

    try {
      this.token = await new Promise((resolve, reject) => {
        let stdoutBuffer = '';
        let stderrBuffer = '';
        let settled = false;
        const timer = setTimeout(() => {
          settle(new SidecarError('sidecar_timeout', `The Python sidecar did not report readiness within ${READY_TIMEOUT_MS / 1000}s.`));
        }, READY_TIMEOUT_MS);

        const settle = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdoutBuffer += chunk;
          let index = stdoutBuffer.indexOf('\n');
          while (index >= 0) {
            const line = stdoutBuffer.slice(0, index).trim();
            stdoutBuffer = stdoutBuffer.slice(index + 1);
            if (line !== '') this.#onStdoutLine(line, settle);
            index = stdoutBuffer.indexOf('\n');
          }
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
          stderrBuffer += chunk;
          let index = stderrBuffer.indexOf('\n');
          while (index >= 0) {
            const line = stderrBuffer.slice(0, index).trim();
            stderrBuffer = stderrBuffer.slice(index + 1);
            if (line !== '') {
              this.stderrTail.push(line);
              if (this.stderrTail.length > 40) this.stderrTail.shift();
              this.log(`[sidecar] ${line}`);
            }
            index = stderrBuffer.indexOf('\n');
          }
        });

        child.once('error', (error) => {
          settle(new SidecarError('sidecar_spawn_failed', `Could not start the Python sidecar: ${error.message}`));
        });
        child.once('exit', (code, signal) => {
          if (settled) return;
          const tail = this.stderrTail.slice(-3).join(' | ');
          settle(new SidecarError(
            'sidecar_exited',
            `The Python sidecar exited before becoming ready (code ${code ?? 'null'}, signal ${signal ?? 'none'}).${tail ? ` ${tail}` : ''}`,
          ));
        });
      });
    } catch (error) {
      if (this.stopping) {
        this.state = 'stopped';
        this.#safeKill(child);
        this.child = null;
        throw new SidecarError('sidecar_stopped', 'The sidecar start was cancelled.');
      }
      // Another live sidecar may own the directory; adopt it when healthy.
      if (await this.#adoptExisting()) {
        this.#safeKill(child);
        this.child = null;
        return;
      }
      this.state = 'error';
      this.error = shortError(error);
      this.#safeKill(child);
      this.child = null;
      throw error;
    }

    if (this.stopping) {
      this.#safeKill(this.child);
      this.child = null;
      this.state = 'stopped';
      throw new SidecarError('sidecar_stopped', 'The sidecar start was cancelled.');
    }
    this.ownsChild = true;
    this.state = 'ready';
    this.readySince = Date.now();
    this.restartAttempts = 0;
    this.child.once('exit', (code, signal) => this.#onExit(code, signal));
    this.child.stdin?.on('error', () => {
      // The sidecar may exit before the pipe closes; the exit handler owns the state.
    });
    this.log(`sidecar ready on 127.0.0.1:${this.port}`);
  }

  /**
   * Adopt an already running sidecar discovered through ``runtime.json``.
   * The Python sidecar enforces one instance per data directory; a plugin
   * reload must attach to it rather than spawning a duplicate collector.
   * @returns {Promise<boolean>} true when a healthy instance was adopted.
   */
  async #adoptExisting() {
    let raw;
    try {
      raw = await fsp.readFile(this.runtimeFile, 'utf8');
    } catch {
      return false;
    }
    let info;
    try {
      info = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!Number.isInteger(info.port) || info.port <= 0 || info.port > 65535) return false;
    if (typeof info.token !== 'string' || info.token === '') return false;
    if (!(await sidecarHealth(info.port))) return false;
    this.port = info.port;
    this.token = info.token;
    this.pid = Number.isInteger(info.pid) ? info.pid : 0;
    this.ownsChild = false;
    this.state = 'ready';
    this.readySince = Date.now();
    this.restartAttempts = 0;
    this.error = '';
    this.log(`adopted running sidecar on 127.0.0.1:${info.port}`);
    return true;
  }

  /**
   * Consume one stdout line looking for the readiness handshake.
   * @param {string} line stdout line.
   * @param {(error?: Error, value?: string) => void} settle promise settler.
   */
  #onStdoutLine(line, settle) {
    this.stdoutTail.push(line);
    if (this.stdoutTail.length > 20) this.stdoutTail.shift();
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.log(`[sidecar stdout] ${line}`);
      return;
    }
    if (message && message.event === 'ready' && Number.isInteger(message.port) && typeof message.token === 'string') {
      this.port = message.port;
      this.pid = Number.isInteger(message.pid) ? message.pid : this.pid;
      settle(undefined, message.token);
      return;
    }
    if (message && message.event === 'error') {
      settle(new SidecarError('sidecar_failed', String(message.message ?? 'The Python sidecar reported an error.')));
    }
  }

  /**
   * React to an unexpected child exit by restarting with bounded backoff.
   * @param {number | null} code exit code.
   * @param {string | null} signal exit signal.
   */
  #onExit(code, signal) {
    const wasReady = this.state === 'ready';
    this.child = null;
    this.pid = 0;
    this.port = 0;
    this.token = '';
    if (this.stopping) {
      this.state = 'stopped';
      return;
    }
    if (!this.ownsChild) {
      this.state = 'stopped';
      return;
    }
    this.state = 'error';
    this.error = `The Python sidecar exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'none'}).`;
    this.log(this.error);
    if (!wasReady) return;
    this.restartAttempts += 1;
    const delay = Math.min(30000, 1500 * 2 ** Math.min(this.restartAttempts, 4));
    this.log(`restarting the sidecar in ${delay}ms (attempt ${this.restartAttempts})`);
    clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => {
      if (this.stopping) return;
      void this.ensureStarted().catch((error) => {
        this.log(`restart failed: ${shortError(error)}`);
      });
    }, delay);
    if (typeof this.startTimer.unref === 'function') this.startTimer.unref();
  }

  /**
   * Perform one JSON request against the sidecar.
   * @param {string} method HTTP method.
   * @param {string} apiPath path beginning with `/api/v1` or `/health`.
   * @param {unknown} [body] JSON body.
   * @param {{ timeoutMs?: number }} [options] request options.
   * @returns {Promise<any>} parsed JSON response.
   */
  async request(method, apiPath, body, options = {}) {
    await this.ensureStarted();
    const timeoutMs = options.timeoutMs ?? (slowPath(apiPath) ? SLOW_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS);
    try {
      return await this.#http(method, apiPath, body, timeoutMs);
    } catch (error) {
      if (error instanceof SidecarError && (error.code === 'sidecar_unreachable' || error.code === 'sidecar_timeout')) {
        // The process may have died between the health check and the request.
        this.state = 'error';
        this.error = shortError(error);
        await this.ensureStarted();
        return this.#http(method, apiPath, body, timeoutMs);
      }
      throw error;
    }
  }

  /**
   * Issue the HTTP request and decode the response.
   * @param {string} method HTTP method.
   * @param {string} apiPath request path.
   * @param {unknown} body JSON body.
   * @param {number} timeoutMs socket timeout.
   * @returns {Promise<any>} parsed JSON response.
   */
  #http(method, apiPath, body, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (this.state !== 'ready' || this.port === 0) {
        reject(new SidecarError('sidecar_unavailable', 'The Python sidecar is not running.'));
        return;
      }
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
      const request = http.request({
        host: '127.0.0.1',
        port: this.port,
        path: apiPath,
        method,
        timeout: timeoutMs,
        headers: {
          'x-mm-token': this.token,
          accept: 'application/json',
          ...(payload === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
        },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = text === '' ? {} : JSON.parse(text);
          } catch {
            reject(new SidecarError('sidecar_bad_response', 'The Python sidecar returned a non-JSON response.'));
            return;
          }
          const status = response.statusCode ?? 500;
          if (status >= 400) {
            const detail = parsed && typeof parsed === 'object' && parsed.error ? parsed.error : {};
            reject(new SidecarError(
              String(detail.code ?? 'request_failed'),
              String(detail.message ?? `The market engine answered ${status}.`),
              status,
            ));
            return;
          }
          resolve(parsed);
        });
      });
      request.on('timeout', () => {
        request.destroy(new SidecarError('sidecar_timeout', 'The market engine did not answer in time.'));
      });
      request.on('error', (error) => {
        if (error instanceof SidecarError) {
          reject(error);
          return;
        }
        reject(new SidecarError('sidecar_unreachable', `Could not reach the market engine: ${error.message}`));
      });
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }

  /**
   * Stop the sidecar and release resources.
   * @returns {Promise<void>} resolves after the child exits or is killed.
   */
  async stop() {
    this.stopping = true;
    clearTimeout(this.startTimer);
    this.startTimer = null;
    if (this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        // A failed or cancelled start has no live child to stop.
      }
    }
    const child = this.child;
    if (!child) {
      // Adopted instance: request its graceful shutdown instead of killing it.
      if (this.state === 'ready' && this.port > 0) {
        try {
          await this.#http('POST', '/api/v1/shutdown', {}, 2500);
        } catch {
          // Best effort only.
        }
      }
      this.pid = 0;
      this.port = 0;
      this.token = '';
      this.state = 'stopped';
      return;
    }
    try {
      // A graceful shutdown removes runtime.json and flushes SQLite.
      await this.#http('POST', '/api/v1/shutdown', {}, 2500);
    } catch {
      // Fall through to pipe close and kill.
    }
    try {
      child.stdin?.end();
    } catch {
      // The pipe may already be closed.
    }
    const exited = await waitForExit(child, STOP_TIMEOUT_MS);
    if (!exited) this.#safeKill(child);
    this.child = null;
    this.pid = 0;
    this.port = 0;
    this.token = '';
    this.state = 'stopped';
  }

  /**
   * Kill a child process tree on a best-effort basis.
   * @param {import('node:child_process').ChildProcess} child child handle.
   */
  #safeKill(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
    if (process.platform === 'win32' && child.pid) {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {
        // Best effort only.
      }
    }
  }
}

/**
 * Probe the sidecar liveness route without a token.
 * @param {number} port listening port.
 * @returns {Promise<boolean>} true when the process answers ``/health``.
 */
function sidecarHealth(port) {
  return new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/health',
      method: 'GET',
      timeout: 2000,
      headers: { accept: 'application/json' },
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

/**
 * Wait for a child process to exit.
 * @param {import('node:child_process').ChildProcess} child child handle.
 * @param {number} timeoutMs maximum wait.
 * @returns {Promise<boolean>} true when the child exited in time.
 */
function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Paths that may legitimately take much longer than an ordinary request.
 * @param {string} apiPath request path.
 * @returns {boolean} true for slow endpoints.
 */
function slowPath(apiPath) {
  return apiPath.startsWith('/api/v1/screener')
    || apiPath.startsWith('/api/v1/analysis')
    || apiPath.startsWith('/api/v1/sync')
    || apiPath.startsWith('/api/v1/data/ingest')
    || apiPath.startsWith('/api/v1/index/');
}

/**
 * Compress an unknown error into one line.
 * @param {unknown} error any thrown value.
 * @returns {string} message text.
 */
export function shortError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 600);
}

/**
 * Resolve the durable data directory for the Python engine.
 * @param {string} configured explicit configuration value.
 * @param {NodeJS.ProcessEnv} env environment.
 * @returns {string} absolute data directory.
 */
export function resolveDataDir(configured, env = process.env) {
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(expandHome(configured.trim()));
  }
  const home = env.DSH_HOME && env.DSH_HOME.trim() !== '' ? env.DSH_HOME : path.join(os.homedir(), '.dsh');
  return path.resolve(expandHome(home), 'market-monitor');
}

/**
 * Expand a leading `~` using the current user's home directory.
 * @param {string} value configured path.
 * @returns {string} path with `~` expanded.
 */
function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

