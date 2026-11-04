/**
 * mailbox — host 半：账号、IMAP 收信、SMTP 发信、新邮件事件流。
 *
 * 路由统一挂在 `/mailbox/api/` 前缀下，进入前用 `connection.requestRejection`
 * 复用宿主鉴权。client 半只做 UI，所有网络与凭据都在这一侧。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ImapClient, ImapError } from './lib/imap.js';
import { SmtpClient } from './lib/smtp.js';
import { buildMessage, parseMessage, previewText } from './lib/mime.js';
import { PROVIDERS, resolveProvider } from './lib/providers.js';
import { nextAccountId, publicAccount, readState, storeDir, writeState } from './lib/store.js';
import { FeishuRuntime } from './lib/feishu-runtime.js';
import { MICROSOFT, emailFromIdToken, pollDeviceToken, refreshAccessToken, requestDeviceCode } from './lib/oauth.js';
import {
  cleanLarkError,
  mailboxProfile,
  qrcodePng,
  resolveLarkBinary,
  startDeviceLogin,
  waitForDeviceLogin,
} from './lib/lark.js';

export const inject = ['webServer', 'connection'];

const PREFIX = '/mailbox/api';
const EVENT_LIMIT = 400;
const MAX_BODY = 32 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL = 18 * 1024 * 1024;
const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));

const LOGIN_UNSUPPORTED = {
  webOnly: '这家邮箱的扫码登录只发网页登录态，换不到 IMAP/SMTP 凭据，只能用应用专用密码',
  googleRestricted: 'Google 的设备码授权不开放邮件类权限，请用「应用专用密码」',
};

const IDLE_CYCLE_MS = 20 * 60 * 1000;

/* ------------------------------------------------------------------ errors */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------ event queue */

/** refresh_token 会被服务端轮换，落盘保存，避免下次启动失效。 */
function persistRefreshToken(accountId, refreshToken) {
  const state = readState();
  const target = state.accounts.find((item) => item.id === accountId);
  if (!target) return;
  target.refreshToken = refreshToken;
  writeState(state);
}

export class EventHub {
  constructor() {
    this.seq = 0;
    this.events = [];
    this.waiters = new Set();
  }

  push(event) {
    this.seq += 1;
    const record = { seq: this.seq, at: Date.now(), ...event };
    this.events.push(record);
    if (this.events.length > EVENT_LIMIT) this.events.splice(0, this.events.length - EVENT_LIMIT);
    for (const waiter of [...this.waiters]) waiter(record);
    return record;
  }

  /**
   * 长期轮询：等到 `after` 之后的第一条事件，或超时返回空数组。
   * 客户端存的 seq 比当前大（宿主重启过，seq 从 0 重新计数）时按 0 处理，
   * 否则会永远等不到新事件。
   */
  wait(after, timeoutMs) {
    const baseline = after > this.seq ? 0 : after;
    const pending = this.events.filter((event) => event.seq > baseline);
    if (pending.length > 0) return Promise.resolve(pending);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.waiters.delete(onEvent);
        resolve(value);
      };
      const onEvent = () => finish(this.events.filter((event) => event.seq > baseline));
      const timer = setTimeout(() => finish([]), timeoutMs);
      this.waiters.add(onEvent);
    });
  }
}

/* ------------------------------------------------------------------ account */

export class AccountRuntime {
  constructor(account, hub, logger) {
    this.account = account;
    this.hub = hub;
    this.logger = logger;
    this.reader = null;
    this.readerQueue = Promise.resolve();
    this.watcher = null;
    this.disposed = false;
    this.handle = null;
    this.status = {
      connected: false,
      error: null,
      unread: 0,
      lastSync: 0,
      watching: false,
    };
    this.cache = new Map();
    this.token = null;
  }

  log(message) {
    this.logger('[mailbox:' + this.account.id + '] ' + message);
  }

  imapOptions() {
    return {
      host: this.account.imap.host,
      port: Number(this.account.imap.port) || 993,
      secure: this.account.imap.secure || 'tls',
      rejectUnauthorized: this.account.imap.rejectUnauthorized !== false,
      timeout: 20000,
    };
  }

  smtpOptions() {
    return {
      host: this.account.smtp.host,
      port: Number(this.account.smtp.port) || 465,
      secure: this.account.smtp.secure || 'tls',
      rejectUnauthorized: this.account.smtp.rejectUnauthorized !== false,
      timeout: 20000,
    };
  }

  /** OAuth 账号：refresh_token 换 access_token，内存里缓存到快过期。 */
  async accessToken() {
    if (this.account.auth !== 'xoauth2') return '';
    if (this.token && this.token.expiresAt > Date.now()) return this.token.accessToken;
    const spec = {
      baseUrl: this.account.oauthBase || MICROSOFT.baseUrl,
      clientId: this.account.clientId || MICROSOFT.clientId,
      scopes: this.account.scopes || MICROSOFT.scopes,
    };
    const fresh = await refreshAccessToken(spec, this.account.refreshToken);
    this.token = fresh;
    if (fresh.refreshToken && fresh.refreshToken !== this.account.refreshToken) {
      this.account.refreshToken = fresh.refreshToken;
      persistRefreshToken(this.account.id, fresh.refreshToken);
    }
    return fresh.accessToken;
  }

  async authenticateImap(client) {
    if (this.account.auth !== 'xoauth2') return client.login(this.account.username, this.account.password);
    const token = await this.accessToken();
    try {
      return await client.authenticateXoauth2(this.account.username, token);
    } catch (error) {
      // token 可能刚好在服务端失效：丢掉缓存重取一次再试。
      this.token = null;
      const fresh = await this.accessToken();
      return client.authenticateXoauth2(this.account.username, fresh);
    }
  }

  async authenticateSmtp(client) {
    if (this.account.auth !== 'xoauth2') return client.authenticate(this.account.username, this.account.password);
    const token = await this.accessToken();
    try {
      return await client.authenticateXoauth2(this.account.username, token);
    } catch (error) {
      this.token = null;
      const fresh = await this.accessToken();
      return client.authenticateXoauth2(this.account.username, fresh);
    }
  }

  /** 所有读操作串行复用一个连接，避免被服务商的并发连接数限制卡住。 */
  async withReader(operation) {
    const run = async () => {
      if (this.disposed) throw new HttpError(410, '账号已登出');
      if (!this.reader || this.reader.closed) {
        const client = new ImapClient(this.imapOptions());
        await client.connect();
        await client.capability();
        await this.authenticateImap(client);
        this.reader = client;
      }
      try {
        return await operation(this.reader);
      } catch (error) {
        try {
          this.reader?.close();
        } catch {
          /* ignore */
        }
        this.reader = null;
        throw error;
      }
    };
    const result = this.readerQueue.then(run, run);
    this.readerQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  mailboxName(folder) {
    return !folder || folder === 'INBOX' ? 'INBOX' : folder;
  }

  async listFolders() {
    return this.withReader(async (client) => {
      const boxes = await client.list();
      this.status.connected = true;
      this.status.error = null;
      return boxes.map((box) => ({ name: box.name, display: box.display || box.name, flags: box.flags }));
    });
  }

  async list(folder = 'INBOX', limit = 40) {
    const box = this.mailboxName(folder);
    return this.withReader(async (client) => {
      await client.select(box, { readOnly: false });
      let uids = await client.search('ALL');
      if (uids.length === 0) uids = [];
      const selected = uids.slice(-Math.max(1, Math.min(200, limit)));
      const rows = await client.fetchEnvelopes(selected);
      rows.sort((left, right) => right.uid - left.uid);
      const unread = await client.search('UNSEEN');
      this.status.unread = unread.length;
      this.status.connected = true;
      this.status.error = null;
      this.status.lastSync = Date.now();
      return {
        folder: box,
        unread: unread.length,
        messages: rows.map((row) => ({
          uid: row.uid,
          subject: row.subject,
          from: row.from,
          to: row.to,
          date: row.date,
          seen: row.seen,
          size: row.size,
        })),
      };
    });
  }

  async raw(uid, folder = 'INBOX') {
    const box = this.mailboxName(folder);
    const key = box + ':' + uid;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const buffer = await this.withReader(async (client) => {
      await client.select(box, { readOnly: false });
      return client.fetchRaw(uid);
    });
    this.cache.set(key, buffer);
    if (this.cache.size > 6) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    return buffer;
  }

  async message(uid, folder = 'INBOX', markSeen = true) {
    const buffer = await this.raw(uid, folder);
    const parsed = parseMessage(buffer);
    const summary = {
      uid,
      folder: this.mailboxName(folder),
      subject: parsed.subject || '(无主题)',
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      date: parsed.date,
      messageId: parsed.messageId,
      text: parsed.text,
      html: parsed.html,
      preview: previewText(parsed.text || parsed.html),
      attachments: parsed.attachments.map((item, index) => ({
        index,
        filename: item.filename,
        contentType: item.contentType,
        size: item.size,
      })),
    };
    if (markSeen) {
      try {
        await this.withReader(async (client) => {
          await client.select(this.mailboxName(folder));
          await client.setFlags(uid, ['Seen']);
        });
      } catch {
        /* 标记已读失败不影响读信 */
      }
    }
    return summary;
  }

  async attachment(uid, index, folder = 'INBOX') {
    const buffer = await this.raw(uid, folder);
    const parsed = parseMessage(buffer);
    const item = parsed.attachments[index];
    if (!item) throw new HttpError(404, '附件不存在');
    return item;
  }

  async setSeen(uid, seen, folder = 'INBOX') {
    await this.withReader(async (client) => {
      await client.select(this.mailboxName(folder));
      await client.setFlags(uid, ['Seen'], seen ? '+' : '-');
    });
    return { ok: true };
  }

  async send(input) {
    const recipients = [...(input.to || []), ...(input.cc || [])];
    if (input.to.length === 0) throw new HttpError(400, '至少需要一个收件人');
    const attachments = (input.attachments || []).map((file) => ({
      filename: file.filename || 'attachment.bin',
      contentType: file.contentType || 'application/octet-stream',
      content: Buffer.from(String(file.content || ''), 'base64'),
    }));
    const total = attachments.reduce((sum, file) => sum + file.content.length, 0);
    if (total > MAX_ATTACHMENT_TOTAL) throw new HttpError(413, '附件总大小超过 18MB');

    const raw = buildMessage({
      from: this.account.email,
      to: input.to,
      cc: input.cc || [],
      subject: input.subject || '',
      text: input.text || '',
      attachments,
    });

    const client = new SmtpClient(this.smtpOptions());
    try {
      await client.connect();
      await this.authenticateSmtp(client);
      await client.send({ from: this.account.email, to: recipients, raw });
    } finally {
      await client.quit().catch(() => undefined);
    }
    return { ok: true, recipients: recipients.length };
  }

  /* ------------------------------------------------------------- watching */

  startWatching() {
    if (this.disposed || this.handle) return;
    this.handle = this.watchLoop().catch((error) => {
      this.log('watcher 退出：' + (error?.message || error));
    });
  }

  async watchLoop() {
    let backoff = 3000;
    while (!this.disposed) {
      let client = null;
      try {
        client = new ImapClient(this.imapOptions());
        this.watcher = client;
        await client.connect();
        await client.capability();
        await this.authenticateImap(client);
        const info = await client.select('INBOX');
        let lastExists = info.exists;
        this.status.connected = true;
        this.status.error = null;
        this.status.watching = true;
        const unread = await client.search('UNSEEN');
        this.status.unread = unread.length;
        this.status.lastSync = Date.now();
        backoff = 3000;

        while (!this.disposed) {
          if (!client.capabilities.includes('IDLE')) {
            // 没有 IDLE 就退化成 60 秒轮询。
            await sleep(60000);
            const next = await client.select('INBOX');
            if (next.exists > lastExists) await this.collectNew(client, lastExists + 1, next.exists);
            lastExists = next.exists;
            continue;
          }
          await client.idleStart();
          const result = await client.idleWait(IDLE_CYCLE_MS);
          const next = await client.select('INBOX');
          if (next.exists > lastExists) {
            await this.collectNew(client, lastExists + 1, next.exists);
          }
          lastExists = next.exists;
          if (result.aborted && next.exists === lastExists) {
            /* 正常超时，继续下一轮 IDLE */
          }
          if (this.disposed) break;
        }
      } catch (error) {
        if (this.disposed) break;
        this.status.watching = false;
        this.status.connected = false;
        this.status.error = error?.message || String(error);
        this.log('连接中断：' + this.status.error);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60000);
      } finally {
        try {
          client?.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** 收信：把新 UID 的摘要推进事件队列，并更新未读数。 */
  async collectNew(client, fromUid, exists) {
    try {
      const uids = await client.search('UID ' + fromUid + ':*');
      const fresh = uids.filter((uid) => uid >= fromUid);
      if (fresh.length === 0) return;
      const rows = await client.fetchEnvelopes(fresh);
      rows.sort((left, right) => left.uid - right.uid);
      for (const row of rows) {
        this.hub.push({
          type: 'mail',
          account: this.account.id,
          accountLabel: this.account.label || this.account.email,
          folder: 'INBOX',
          uid: row.uid,
          subject: row.subject,
          from: row.from,
          date: row.date,
          seen: row.seen,
          preview: '',
        });
      }
      const unread = await client.search('UNSEEN');
      this.status.unread = unread.length;
      this.status.lastSync = Date.now();
    } catch (error) {
      this.log('收集新邮件失败：' + (error?.message || error));
    }
  }

  dispose() {
    this.disposed = true;
    try {
      this.reader?.close();
    } catch {
      /* ignore */
    }
    try {
      this.watcher?.close();
    } catch {
      /* ignore */
    }
    this.watcher = null;
    try {
      this.watcher?.close?.();
    } catch {
      /* ignore */
    }
    this.reader = null;
    this.handle = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------- HTTP utils */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : error instanceof ImapError ? 502 : 500;
  sendJson(res, status, { ok: false, error: error?.message || String(error) });
}

/* ------------------------------------------------------------------ plugin */

export function apply(ctx, config = {}) {
  const logger = (message) => console.log(message);
  const hub = new EventHub();
  const runtimes = new Map();
  const idleMinutes = Number(config.idleMinutes) > 0 ? Number(config.idleMinutes) : IDLE_CYCLE_MS / 60000;

  try {
    fs.mkdirSync(storeDir(), { recursive: true, mode: 0o700 });
  } catch (error) {
    logger('[mailbox] 无法创建账号目录 ' + storeDir() + '：' + error.message);
  }

  const createRuntime = (account) =>
    account.kind === 'feishu'
      ? new FeishuRuntime(account, hub, logger)
      : new AccountRuntime(account, hub, logger);

  const bootAccount = (account) => {
    const runtime = createRuntime(account);
    runtimes.set(account.id, runtime);
    runtime.startWatching();
    return runtime;
  };

  // 扫码登录的临时会话：id → { kind, status, account, file?, child?, timer? }
  // 结束后保留 5 分钟，前端才读得到最终的 ok / error。
  const loginSessions = new Map();
  const sessionFile = (id) => path.join(os.tmpdir(), 'dsh-mailbox-qr-' + id + '.png');
  const newSessionId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const releaseSession = (session, status, extra = {}) => {
    session.status = status;
    Object.assign(session, extra);
    session.finishedAt = Date.now();
    if (session.timer) {
      clearInterval(session.timer);
      session.timer = null;
    }
    try {
      session.child?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    session.child = null;
    if (session.file) {
      try {
        fs.rmSync(session.file, { force: true });
      } catch {
        /* ignore */
      }
      session.file = null;
    }
  };

  const dropSession = (session) => {
    releaseSession(session, 'cancelled');
    loginSessions.delete(session.id);
  };

  const sweepSessions = () => {
    const now = Date.now();
    for (const session of [...loginSessions.values()]) {
      const expired = session.finishedAt ? now - session.finishedAt > 300000 : now - session.createdAt > 1800000;
      if (expired) dropSession(session);
    }
  };

  /** OAuth 账号：邮箱地址取自 id_token，refresh_token 落盘。 */
  const addOauthAccount = (providerId, spec, token, email) => {
    const provider = resolveProvider(providerId);
    const state = readState();
    const existing = state.accounts.find((item) => item.auth === 'xoauth2' && item.email === email);
    if (existing) {
      existing.refreshToken = token.refreshToken || existing.refreshToken;
      writeState(state);
      if (!runtimes.has(existing.id)) bootAccount(existing);
      return publicAccount(existing);
    }
    const { id, counter } = nextAccountId(state);
    const stored = {
      id,
      kind: 'imap',
      auth: 'xoauth2',
      provider: providerId,
      label: email,
      email,
      username: email,
      preset: providerId,
      oauthBase: spec.baseUrl,
      clientId: spec.clientId,
      scopes: spec.scopes,
      refreshToken: token.refreshToken,
      imap: { ...provider.imap },
      smtp: { ...provider.smtp },
      createdAt: Date.now(),
    };
    state.accounts.push(stored);
    state.counter = counter;
    writeState(state);
    bootAccount(stored);
    return publicAccount(stored);
  };

  /** 飞书：二维码动态生成，等待 lark-cli 的子进程退出。 */
  const startLarkSession = async () => {
    if (!resolveLarkBinary()) throw new HttpError(400, '本机没有 lark-cli，无法扫码登录飞书邮箱');
    const started = await startDeviceLogin('mail');
    const id = newSessionId('qr_');
    const file = sessionFile(id);
    await qrcodePng(started.verificationUrl, file, 320);
    const session = {
      id,
      kind: 'lark',
      status: 'waiting',
      error: null,
      account: null,
      file,
      child: null,
      timer: null,
      createdAt: Date.now(),
    };
    loginSessions.set(id, session);

    const child = waitForDeviceLogin(started.deviceCode);
    session.child = child;
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    child.stdout.resume();
    child.on('error', (error) => {
      if (session.status === 'waiting') releaseSession(session, 'error', { error: error.message });
    });
    child.on('close', async (code) => {
      if (session.status !== 'waiting') return;
      if (code !== 0) {
        releaseSession(session, 'error', { error: cleanLarkError(stderr) || '扫码登录未完成或已超时' });
        return;
      }
      try {
        const created = await addFeishuAccount({ label: '' });
        releaseSession(session, 'ok', { account: created.account });
      } catch (error) {
        releaseSession(session, 'error', { error: error?.message || String(error) });
      }
    });

    return {
      ok: true,
      id,
      kind: 'lark',
      qr: '/mailbox/api/login/qr?id=' + id,
      expiresIn: started.expiresIn,
    };
  };

  /** Microsoft 365 / Outlook：设备码 + 固定二维码，轮询换 token。 */
  const startOauthSession = async (providerId) => {
    const spec = MICROSOFT;
    const device = await requestDeviceCode(spec);
    const id = newSessionId('oa_');
    const session = {
      id,
      kind: 'oauth',
      provider: providerId,
      spec,
      status: 'waiting',
      error: null,
      account: null,
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + device.expiresIn * 1000,
      timer: null,
    };
    loginSessions.set(id, session);

    let ticking = false;
    const tick = async () => {
      if (session.status !== 'waiting' || ticking) return;
      ticking = true;
      try {
        if (Date.now() > session.expiresAt) {
          releaseSession(session, 'expired', { error: '二维码已过期，请重新生成' });
          return;
        }
        const result = await pollDeviceToken(spec, device.deviceCode);
        if (result.status === 'ok') {
          const email = emailFromIdToken(result.token.idToken);
          if (!email) {
            releaseSession(session, 'error', { error: '授权成功但读不到邮箱地址' });
            return;
          }
          const account = addOauthAccount(providerId, spec, result.token, email);
          releaseSession(session, 'ok', { account });
        } else if (result.status === 'denied') {
          releaseSession(session, 'error', { error: '授权被拒绝' });
        } else if (result.status === 'expired') {
          releaseSession(session, 'expired', { error: '二维码已过期，请重新生成' });
        } else if (result.status === 'error') {
          releaseSession(session, 'error', { error: result.error });
        }
      } catch (error) {
        releaseSession(session, 'error', { error: error?.message || String(error) });
      } finally {
        ticking = false;
      }
    };
    session.timer = setInterval(tick, Math.max(2, device.interval) * 1000);
    setTimeout(tick, 500);

    return {
      ok: true,
      id,
      kind: 'oauth',
      // 微软的验证地址是固定的，扫码落到登录页，再输一次性代码。
      qr: '/mailbox/api/assets/qr-microsoft-device.png',
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      expiresIn: device.expiresIn,
      interval: device.interval,
    };
  };

  /** 飞书账号不走密码：身份来自 lark-cli 当前的用户登录。 */
  const addFeishuAccount = async (input) => {
    const email = await mailboxProfile();
    const state = readState();
    const existing = state.accounts.find((item) => (item.kind || 'imap') === 'feishu' && item.email === email);
    if (existing) {
      if (!runtimes.has(existing.id)) bootAccount(existing);
      return { ok: true, account: publicAccount(existing), reused: true };
    }
    const label = String(input?.label || '').trim() || email;
    const { id, counter } = nextAccountId(state);
    const stored = {
      id,
      kind: 'feishu',
      label,
      email,
      username: email,
      preset: 'feishu',
      createdAt: Date.now(),
    };
    state.accounts.push(stored);
    state.counter = counter;
    writeState(state);
    bootAccount(stored);
    return { ok: true, account: publicAccount(stored) };
  };

  // 启动时恢复已登录的账号
  try {
    for (const account of readState().accounts) bootAccount(account);
  } catch (error) {
    logger('[mailbox] 读取账号失败：' + error.message);
  }

  const requireAccount = (id) => {
    const runtime = runtimes.get(String(id || ''));
    if (!runtime) throw new HttpError(404, '账号不存在或已登出');
    return runtime;
  };

  const routes = {
    async 'GET /accounts'() {
      return {
        ok: true,
        accounts: [...runtimes.values()].map((runtime) => ({
          ...publicAccount(runtime.account),
          status: runtime.status,
        })),
        providers: Object.entries(PROVIDERS).map(([id, provider]) => ({
          id,
          label: provider.label,
          hint: provider.hint,
          imap: provider.imap,
          smtp: provider.smtp,
          login: provider.login || { kind: 'none' },
        })),
      };
    },

    async 'POST /accounts/test'(body) {
      if (body.kind === 'feishu') {
        const email = await mailboxProfile();
        return { ok: true, email };
      }
      const account = normalizeAccount(body);
      const probe = createRuntime({ ...account, id: 'probe' });
      try {
        const boxes = await probe.listFolders();
        return { ok: true, folders: boxes.length };
      } finally {
        probe.dispose();
      }
    },

    async 'POST /accounts'(body) {
      if (body.kind === 'feishu') {
        return addFeishuAccount(body);
      }
      const account = normalizeAccount(body);
      const state = readState();
      if (state.accounts.some((item) => item.email === account.email && item.username === account.username && item.label === account.label)) {
        throw new HttpError(409, '已存在同名账号，换个标签即可添加第二份');
      }
      const probe = createRuntime({ ...account, id: 'probe' });
      try {
        await probe.listFolders();
      } finally {
        probe.dispose();
      }
      const { id, counter } = nextAccountId(state);
      const stored = { ...account, id, createdAt: Date.now() };
      state.accounts.push(stored);
      state.counter = counter;
      writeState(state);
      bootAccount(stored);
      return { ok: true, account: publicAccount(stored) };
    },

    async 'POST /accounts/remove'(body) {
      const runtime = requireAccount(body.id);
      runtime.dispose();
      runtimes.delete(runtime.account.id);
      const state = readState();
      state.accounts = state.accounts.filter((item) => item.id !== runtime.account.id);
      writeState(state);
      return { ok: true };
    },

    async 'POST /login/start'(body) {
      sweepSessions();
      const providerId = String(body.provider || 'feishu');
      const provider = resolveProvider(providerId);
      const login = provider.login || { kind: 'none' };
      if (login.kind === 'lark') return startLarkSession();
      if (login.kind === 'device-code') return startOauthSession(providerId);
      throw new HttpError(400, LOGIN_UNSUPPORTED[login.reason] || '这家邮箱不支持扫码登录，请用应用专用密码');
    },

    async 'GET /login/qr'(query) {
      const session = loginSessions.get(String(query.get('id') || ''));
      if (!session || !session.file || !fs.existsSync(session.file)) {
        throw new HttpError(404, '二维码已失效，请重新生成');
      }
      return { file: { path: session.file, contentType: 'image/png' } };
    },

    async 'POST /login/poll'(body) {
      const session = loginSessions.get(String(body.id || ''));
      if (!session) throw new HttpError(404, '登录会话已失效，请重新生成二维码');
      return {
        ok: true,
        status: session.status,
        error: session.error,
        account: session.account,
        userCode: session.userCode,
      };
    },

    async 'POST /login/cancel'(body) {
      const session = loginSessions.get(String(body.id || ''));
      if (session) dropSession(session);
      return { ok: true };
    },

    async 'GET /assets/qr-microsoft-device.png'() {
      const file = path.join(PACKAGE_DIR, 'assets', 'qr-microsoft-device.png');
      if (!fs.existsSync(file)) throw new HttpError(404, '缺少二维码资源');
      return { file: { path: file, contentType: 'image/png' } };
    },

    // 兼容早先的飞书专用路由
    async 'POST /feishu/login/start'() {
      return startLarkSession();
    },

    async 'GET /feishu/login/qr'(query) {
      const session = loginSessions.get(String(query.get('id') || ''));
      if (!session || !session.file || !fs.existsSync(session.file)) {
        throw new HttpError(404, '二维码已失效，请重新生成');
      }
      return { file: { path: session.file, contentType: 'image/png' } };
    },

    async 'POST /feishu/login/poll'(body) {
      const session = loginSessions.get(String(body.id || ''));
      if (!session) throw new HttpError(404, '登录会话已失效，请重新生成二维码');
      return { ok: true, status: session.status, error: session.error, account: session.account };
    },

    async 'POST /feishu/login/cancel'(body) {
      const session = loginSessions.get(String(body.id || ''));
      if (session) dropSession(session);
      return { ok: true };
    },

    async 'GET /folders'(query) {
      const runtime = requireAccount(query.get('account'));
      return { ok: true, folders: await runtime.listFolders() };
    },

    async 'GET /messages'(query) {
      const runtime = requireAccount(query.get('account'));
      const limit = Number(query.get('limit')) || 40;
      const folder = query.get('folder') || 'INBOX';
      const result = await runtime.list(folder, limit);
      return { ok: true, ...result, status: runtime.status };
    },

    async 'GET /message'(query) {
      const runtime = requireAccount(query.get('account'));
      const uid = String(query.get('uid') || '').trim();
      if (!uid) throw new HttpError(400, '缺少 uid');
      const message = await runtime.message(uid, query.get('folder') || 'INBOX', query.get('unseen') !== '1');
      return { ok: true, message, status: runtime.status };
    },

    async 'POST /flags'(body) {
      const runtime = requireAccount(body.account);
      await runtime.setSeen(String(body.uid), body.seen !== false, body.folder || 'INBOX');
      const unread = await runtime.list(body.folder || 'INBOX', 1).catch(() => null);
      return { ok: true, unread: unread ? unread.unread : runtime.status.unread };
    },

    async 'POST /send'(body) {
      const runtime = requireAccount(body.account);
      const result = await runtime.send({
        to: normalizeRecipients(body.to),
        cc: normalizeRecipients(body.cc),
        subject: String(body.subject || ''),
        text: String(body.text || ''),
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      });
      return { ok: true, ...result };
    },

    async 'GET /events'(query) {
      const after = Number(query.get('after')) || 0;
      const timeout = Math.min(Math.max(Number(query.get('timeout')) || 25000, 1000), 60000);
      const events = await hub.wait(after, timeout);
      return { ok: true, seq: hub.seq, events };
    },

    async 'GET /status'() {
      return { ok: true, seq: hub.seq, unread: totalUnread(runtimes) };
    },

    async 'POST /sync'(body) {
      const runtime = requireAccount(body.account);
      const result = await runtime.list(body.folder || 'INBOX', Number(body.limit) || 40);
      return { ok: true, ...result, status: runtime.status };
    },

    async 'GET /attachment'(query) {
      const runtime = requireAccount(query.get('account'));
      const uid = String(query.get('uid') || '').trim();
      const index = Number(query.get('index'));
      const item = await runtime.attachment(uid, index, query.get('folder') || 'INBOX');
      return { raw: item };
    },
  };

  const serve = async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { ok: false, error: 'bad request' });
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) {
      res.writeHead(rejection);
      res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
      return;
    }
    const pathname = url.pathname.slice(PREFIX.length) || '/';
    const key = req.method + ' ' + pathname;
    const handler = routes[key];
    if (!handler) {
      sendJson(res, 404, { ok: false, error: 'no route ' + key });
      return;
    }
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const result = await handler(req.method === 'GET' ? url.searchParams : body);
      if (result && result.file) {
        let bytes;
        try {
          bytes = fs.readFileSync(result.file.path);
        } catch {
          throw new HttpError(404, '文件已失效');
        }
        res.writeHead(200, {
          'content-type': result.file.contentType || 'application/octet-stream',
          'content-length': bytes.length,
          'cache-control': 'no-store',
        });
        res.end(bytes);
        return;
      }
      if (result && result.raw) {
        const item = result.raw;
        const filename = item.filename || 'attachment.bin';
        res.writeHead(200, {
          'content-type': item.contentType || 'application/octet-stream',
          'content-length': item.content.length,
          'content-disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"',
          'cache-control': 'no-store',
        });
        res.end(item.content);
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      sendError(res, error);
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: serve,
      }),
    'mailbox: http routes',
  );

  ctx.effect(() => () => {
    for (const runtime of runtimes.values()) runtime.dispose();
    runtimes.clear();
    for (const session of [...loginSessions.values()]) dropSession(session);
  }, 'mailbox: close accounts');
}

function totalUnread(runtimes) {
  let total = 0;
  for (const runtime of runtimes.values()) total += Number(runtime.status.unread || 0);
  return total;
}

function normalizeRecipients(input) {
  if (Array.isArray(input)) return input.map((item) => String(item).trim()).filter(Boolean);
  if (typeof input === 'string') {
    return input
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAccount(body) {
  const preset = resolveProvider(body.preset);
  const email = String(body.email || '').trim();
  if (!email.includes('@')) throw new HttpError(400, '邮箱地址不合法');
  const username = String(body.username || '').trim() || email;
  const password = String(body.password || '');
  if (!password) throw new HttpError(400, '缺少密码或应用专用密码');
  const imapHost = String(body.imap?.host || preset.imap.host || '').trim();
  const smtpHost = String(body.smtp?.host || preset.smtp.host || '').trim();
  if (!imapHost || !smtpHost) throw new HttpError(400, '缺少 IMAP / SMTP 主机');
  return {
    label: String(body.label || '').trim() || email,
    email,
    username,
    password,
    preset: body.preset || 'custom',
    imap: {
      host: imapHost,
      port: Number(body.imap?.port || preset.imap.port || 993),
      secure: body.imap?.secure || preset.imap.secure || 'tls',
    },
    smtp: {
      host: smtpHost,
      port: Number(body.smtp?.port || preset.smtp.port || 465),
      secure: body.smtp?.secure || preset.smtp.secure || 'tls',
    },
    signature: String(body.signature || ''),
  };
}
