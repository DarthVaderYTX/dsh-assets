/**
 * 飞书后端测试：用 test/fake-lark-cli.mjs 顶替真的 lark-cli。
 *
 *   node --test test/feishu.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mailbox-feishu-'));
const logFile = path.join(tempHome, 'lark.log');

const fake = path.join(here, 'fake-lark-cli.mjs');
fs.chmodSync(fake, 0o755);
process.env.LARK_CLI_PATH = fake;
process.env.FAKE_LARK_LOG = logFile;
process.env.DSH_HOME = tempHome;

const attachmentServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('attachment-bytes');
});
await new Promise((resolve) => attachmentServer.listen(0, '127.0.0.1', resolve));
process.env.FAKE_ATTACH_URL = 'http://127.0.0.1:' + attachmentServer.address().port + '/file';

const { FeishuRuntime } = await import('../lib/feishu-runtime.js');
const { apply } = await import('../index.js');

const account = { id: 'feishu_1', kind: 'feishu', label: '飞书', email: 'demo@example.com', username: 'demo@example.com' };

function newHub() {
  const events = [];
  return {
    events,
    push(event) {
      events.push(event);
      return event;
    },
  };
}

function readLog() {
  try {
    return fs.readFileSync(logFile, 'utf8');
  } catch {
    return '';
  }
}

test('飞书运行时：列信、读信、附件、标已读、发信', async () => {
  const hub = newHub();
  const runtime = new FeishuRuntime(account, hub, () => {});
  runtime.degraded = true; // 不启动推送，避免测试里起子进程
  try {
    const folders = await runtime.listFolders();
    assert.equal(folders[0].name, 'INBOX');
    assert.equal(folders[1].name, 'SENT');

    const list = await runtime.list('INBOX', 20);
    assert.equal(list.messages.length, 2);
    assert.equal(list.messages[0].uid, 'm1');
    assert.equal(list.messages[0].subject, '季度目标');
    assert.equal(list.messages[0].from.address, 'boss@example.com');
    assert.equal(list.messages[0].seen, false);
    assert.equal(list.messages[1].seen, true);
    assert.equal(list.unread, 1);

    const message = await runtime.message('m1', 'INBOX', true);
    assert.equal(message.subject, '季度目标');
    assert.match(message.text, /验证飞书后端/);
    assert.match(message.html, /<p>/);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].filename, '报表.txt');
    assert.match(readLog(), /message-modify[\s\S]*--remove-label-ids unread/);

    const file = await runtime.attachment('m1', 0, 'INBOX');
    assert.equal(file.content.toString('utf8'), 'attachment-bytes');
    assert.equal(file.filename, '报表.txt');

    await runtime.setSeen('m1', false, 'INBOX');
    assert.match(readLog(), /--add-label-ids unread/);
    await runtime.setSeen('m1', true, 'INBOX');
    assert.match(readLog(), /--remove-label-ids unread/);

    const sent = await runtime.send({
      to: ['a@example.com'],
      cc: ['b@example.com'],
      subject: '飞书发信',
      text: '正文',
      attachments: [{ filename: 'note.txt', contentType: 'text/plain', content: Buffer.from('hi') }],
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.recipients, 2);
    const log = readLog();
    assert.match(log, /\+send --confirm-send/);
    assert.match(log, /--to a@example\.com/);
    assert.match(log, /--cc b@example\.com/);
    assert.match(log, /SEND attach=1 sizes=2/);
  } finally {
    runtime.dispose();
  }
});

test('飞书运行时：推送不可用时降级成轮询', async () => {
  const hub = newHub();
  const runtime = new FeishuRuntime(account, hub, () => {});
  try {
    runtime.startWatching();
    for (let i = 0; i < 60 && !runtime.degraded; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(runtime.degraded, true);
    assert.equal(runtime.status.watching, true);
  } finally {
    runtime.dispose();
  }
});

/* ----------------------------------------------------------- HTTP 路由 */

function fakeContext(trusted = true) {
  const routes = [];
  const cleanups = [];
  return {
    routes,
    cleanups,
    ctx: {
      connection: { requestRejection: () => (trusted ? undefined : 401) },
      webServer: { register: (route) => (routes.push(route), () => {}) },
      effect: (fn) => {
        const cleanup = fn();
        if (typeof cleanup === 'function') cleanups.push(cleanup);
        return () => {};
      },
    },
  };
}

function call(route, method, url, body) {
  return new Promise((resolve) => {
    const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = Readable.from(payload);
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1:52804' };
    const chunks = [];
    const result = { status: 0, headers: {}, buffer: Buffer.alloc(0) };
    const res = {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers || {};
      },
      end(chunk) {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        result.buffer = Buffer.concat(chunks);
        const text = result.buffer.toString('utf8');
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ ...result, text, json });
      },
    };
    route.handler(req, res);
  });
}

test('HTTP 路由：扫码登录生成二维码、轮询成功后落库', async () => {
  const { ctx, routes, cleanups } = fakeContext(true);
  apply(ctx, {});
  const route = routes[0];
  try {
    const started = await call(route, 'POST', '/mailbox/api/feishu/login/start', {});
    assert.equal(started.status, 200, started.text);
    assert.equal(started.json.ok, true);
    const id = started.json.id;
    assert.match(started.json.qr, /\/mailbox\/api\/feishu\/login\/qr\?id=/);

    const png = await call(route, 'GET', '/mailbox/api/feishu/login/qr?id=' + id);
    assert.equal(png.status, 200);
    assert.equal(png.headers['content-type'], 'image/png');
    assert.equal(png.buffer.slice(0, 4).toString('hex'), '89504e47');

    let status = 'waiting';
    for (let i = 0; i < 40 && status === 'waiting'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const polled = await call(route, 'POST', '/mailbox/api/feishu/login/poll', { id });
      status = polled.json.status;
    }
    assert.equal(status, 'ok');

    const accounts = await call(route, 'GET', '/mailbox/api/accounts');
    assert.equal(accounts.json.accounts.length, 1);
    assert.equal(accounts.json.accounts[0].kind, 'feishu');
    assert.equal(accounts.json.accounts[0].email, 'demo@example.com');
    assert.equal(accounts.json.accounts[0].password, undefined);
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
});

test.after(() => {
  attachmentServer.close();
  fs.rmSync(tempHome, { recursive: true, force: true });
});
