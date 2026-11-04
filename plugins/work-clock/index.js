import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const inject = ['webServer', 'connection'];

const ROUTE = '/work-clock/state';
const WEATHER_TTL = 10 * 60 * 1000;
const WEATHER_ERROR_TTL = 60 * 1000;
const LOCATION_TTL = 12 * 60 * 60 * 1000;
const CALENDAR_TTL = 60 * 1000;
const CALENDAR_ERROR_TTL = 30 * 1000;

let locationCache = null;
let weatherCache = null;
let weatherError = null;
let weatherInflight = null;
let calendarCache = null;
let calendarError = null;
let calendarInflight = null;
let larkCliPath;
let nodeDirPath;

function nowMs() {
  return Date.now();
}

async function fetchJson(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-work-clock/1.2' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readLocation() {
  const at = nowMs();
  if (locationCache && at - locationCache.at < LOCATION_TTL) return locationCache.value;
  const sources = [
    async () => {
      const body = await fetchJson('https://ipwho.is/');
      if (!body || body.success === false) throw new Error('ipwho.is failed');
      if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
        throw new Error('ipwho.is missing coordinates');
      }
      return { latitude: body.latitude, longitude: body.longitude, city: body.city || '' };
    },
    async () => {
      const body = await fetchJson('https://ipapi.co/json/');
      if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
        throw new Error('ipapi.co missing coordinates');
      }
      return { latitude: body.latitude, longitude: body.longitude, city: body.city || '' };
    },
  ];
  let lastError = null;
  for (const source of sources) {
    try {
      const value = await source();
      locationCache = { at, value };
      return value;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('no location provider available');
}

async function fetchWeather() {
  const location = await readLocation();
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    encodeURIComponent(location.latitude) +
    '&longitude=' +
    encodeURIComponent(location.longitude) +
    '&current=temperature_2m,weather_code,is_day&timezone=auto';
  const body = await fetchJson(url);
  const current = body && body.current;
  if (!current || !Number.isFinite(current.temperature_2m)) {
    throw new Error('open-meteo returned no current weather');
  }
  return {
    city: location.city,
    temperature: current.temperature_2m,
    code: Number.isFinite(current.weather_code) ? current.weather_code : 0,
    isDay: current.is_day !== 0,
    fetchedAt: nowMs(),
  };
}

/** Weather for the machine's approximate location, cached for ten minutes. */
export async function getWeather() {
  const at = nowMs();
  if (weatherCache && at - weatherCache.at < WEATHER_TTL) return weatherCache.value;
  if (weatherError && at - weatherError.at < WEATHER_ERROR_TTL) throw weatherError.error;
  if (!weatherInflight) {
    weatherInflight = fetchWeather()
      .then((value) => {
        weatherCache = { at: nowMs(), value };
        weatherError = null;
        return value;
      })
      .catch((error) => {
        weatherError = { at: nowMs(), error };
        throw error;
      })
      .finally(() => {
        weatherInflight = null;
      });
  }
  return weatherInflight;
}

function executable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveLarkCli() {
  if (larkCliPath !== undefined) return larkCliPath;
  const home = os.homedir();
  const candidates = [];
  if (process.env.LARK_CLI_PATH) candidates.push(process.env.LARK_CLI_PATH);
  candidates.push(
    path.join(home, '.local', 'bin', 'lark-cli'),
    '/opt/homebrew/bin/lark-cli',
    '/usr/local/bin/lark-cli',
    path.join(home, '.volta', 'bin', 'lark-cli'),
  );
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try {
    for (const version of fs
      .readdirSync(nvm)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
      candidates.push(path.join(nvm, version, 'bin', 'lark-cli'));
    }
  } catch {
    /* No nvm installation. */
  }
  for (const candidate of candidates) {
    if (executable(candidate)) {
      larkCliPath = candidate;
      return larkCliPath;
    }
  }
  larkCliPath = 'lark-cli';
  return larkCliPath;
}

/**
 * The app can start with a Finder PATH that has no Node, while lark-cli's
 * shebang is `#!/usr/bin/env node`. Find a Node directory and prepend it to
 * the child PATH so the CLI starts in both development and packaged runs.
 */
function resolveNodeDir() {
  if (nodeDirPath !== undefined) return nodeDirPath;
  const home = os.homedir();
  const candidates = [path.join(home, '.volta', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try {
    for (const version of fs
      .readdirSync(nvm)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
      candidates.unshift(path.join(nvm, version, 'bin'));
    }
  } catch {
    /* No nvm installation. */
  }
  for (const directory of candidates) {
    if (executable(path.join(directory, 'node'))) {
      nodeDirPath = directory;
      return nodeDirPath;
    }
  }
  nodeDirPath = null;
  return null;
}

function parseEventTime(value) {
  if (!value || typeof value !== 'object') return NaN;
  if (typeof value.datetime === 'string') return Date.parse(value.datetime);
  if (typeof value.date === 'string') return new Date(value.date + 'T00:00:00').getTime();
  return NaN;
}

function mapEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const start = parseEventTime(event.start_time);
  const end = parseEventTime(event.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
  const rsvp = typeof event.self_rsvp_status === 'string' ? event.self_rsvp_status : '';
  const status = typeof event.status === 'string' ? event.status : '';
  return {
    id: String(event.event_id || start + ':' + summary),
    title: summary || '未命名日程',
    start,
    end,
    allDay: !event.start_time.datetime,
    location: event.location && typeof event.location.name === 'string' ? event.location.name : '',
    meetingUrl: event.vchat && typeof event.vchat.meeting_url === 'string' ? event.vchat.meeting_url : '',
    organizer:
      event.event_organizer && typeof event.event_organizer.display_name === 'string'
        ? event.event_organizer.display_name
        : '',
    rsvp,
    declined: /declin/i.test(rsvp),
    cancelled: /cancel/i.test(status),
  };
}

async function fetchCalendar() {
  const bin = resolveLarkCli();
  const nodeDir = resolveNodeDir();
  const env = { ...process.env };
  if (nodeDir) {
    const parts = [nodeDir];
    if (path.isAbsolute(bin)) parts.push(path.dirname(bin));
    if (process.env.PATH) parts.push(process.env.PATH);
    env.PATH = parts.join(path.delimiter);
  }
  const { stdout } = await execFileAsync(
    bin,
    ['calendar', '+agenda', '--as', 'user', '--format', 'json'],
    { timeout: 20000, maxBuffer: 8 * 1024 * 1024, env },
  );
  const body = JSON.parse(stdout);
  const rows = Array.isArray(body && body.data) ? body.data : [];
  const events = rows
    .map(mapEvent)
    .filter(Boolean)
    .filter((event) => !event.declined && !event.cancelled)
    .sort((left, right) => left.start - right.start)
    .slice(0, 24);
  return { connected: true, events, fetchedAt: nowMs() };
}

/** Today's Lark/Feishu agenda through lark-cli, cached for one minute. */
export async function getCalendar(force = false) {
  const at = nowMs();
  if (!force) {
    if (calendarCache && at - calendarCache.at < CALENDAR_TTL) return calendarCache.value;
    if (calendarError && at - calendarError.at < CALENDAR_ERROR_TTL) return calendarError.value;
  }
  if (!calendarInflight) {
    calendarInflight = fetchCalendar()
      .then((value) => {
        calendarCache = { at: nowMs(), value };
        calendarError = null;
        return value;
      })
      .catch((error) => {
        const message = String((error && (error.stderr || error.message)) || error)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);
        const missing = error && (error.code === 'ENOENT' || /not found|no such file/i.test(message));
        if (missing) larkCliPath = undefined;
        const value = {
          connected: false,
          reason: missing ? 'missing' : /auth|login|token|unauthorized|permission/i.test(message) ? 'auth' : 'error',
          message,
          events: [],
          fetchedAt: nowMs(),
        };
        calendarError = { at: nowMs(), value };
        return value;
      })
      .finally(() => {
        calendarInflight = null;
      });
  }
  return calendarInflight;
}

async function handleState(ctx, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const rejection = ctx.connection.requestRejection(req);
  if (rejection !== undefined) {
    res.writeHead(rejection);
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
    return;
  }

  const url = new URL(req.url || ROUTE, 'http://127.0.0.1');
  const wantWeather = url.searchParams.get('weather') !== '0';
  const wantCalendar = url.searchParams.get('agenda') !== '0';
  const forceCalendar = url.searchParams.get('refresh') === '1';

  const [weather, calendar] = await Promise.all([
    wantWeather
      ? getWeather().catch((error) => ({ error: String((error && error.message) || error).slice(0, 300) }))
      : null,
    wantCalendar ? getCalendar(forceCalendar) : null,
  ]);

  const payload = {
    ok: true,
    now: nowMs(),
    weather: weather && !weather.error ? weather : null,
    weatherError: weather && weather.error ? weather.error : null,
    calendar: calendar || { connected: false, reason: 'off', events: [], fetchedAt: nowMs() },
  };
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: (req, res) =>
          handleState(ctx, req, res).catch((error) => {
            if (res.headersSent) {
              res.end();
              return;
            }
            const body = JSON.stringify({
              ok: false,
              error: String((error && error.message) || error).slice(0, 300),
            });
            res.writeHead(500, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            });
            res.end(body);
          }),
      }),
    'work-clock: weather and calendar state route',
  );
}
