/**
 * HTTP 路由层测试：用假 ctx 直接调用 apply() 注册的 handler，后端接假邮件服务器。
 *
 *   node --test test/routes.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { startMockMailServer } from './mock-mail-server.mjs';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mailbox-routes-'));
process.env.DSH_HOME = tempHome;

const { apply } = await import('../index.js');

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
      get: () => undefined,
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
    const result = { status: 0, headers: {}, body: '' };
    const res = {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers || {};
      },
      end(chunk) {
        if (chunk !== undefined) result.body += String(chunk);
        let parsed;
        try {
          parsed = JSON.parse(result.body);
        } catch {
          parsed = undefined;
        }
        resolve({ ...result, json: parsed });
      },
    };
    route.handler(req, res);
  });
}

test('HTTP 路由：鉴权、账号 CRUD、列信、发信、长轮询', async () => {
  const server = await startMockMailServer();
  const { ctx, routes, cleanups } = fakeContext(true);
  apply(ctx, {});
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/mailbox/api');
  const route = routes[0];

  try {
    const empty = await call(route, 'GET', '/mailbox/api/accounts');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json.accounts, []);
    assert.equal(empty.json.providers.length >= 5, true);

    const bad = await call(route, 'POST', '/mailbox/api/accounts', { email: 'nope' });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /不合法/);

    const account = {
      label: '测试',
      email: server.user,
      password: server.password,
      preset: 'custom',
      imap: { host: '127.0.0.1', port: server.imapPort, secure: 'plain' },
      smtp: { host: '127.0.0.1', port: server.smtpPort, secure: 'plain' },
    };
    const created = await call(route, 'POST', '/mailbox/api/accounts', account);
    assert.equal(created.status, 200, JSON.stringify(created.json));
    assert.equal(created.json.account.email, server.user);
    assert.equal(created.json.account.password, undefined);

    const accounts = await call(route, 'GET', '/mailbox/api/accounts');
    assert.equal(accounts.json.accounts.length, 1);
    const id = accounts.json.accounts[0].id;

    const messages = await call(route, 'GET', '/mailbox/api/messages?account=' + id + '&folder=INBOX');
    assert.equal(messages.status, 200);
    assert.deepEqual(messages.json.messages, []);

    const sent = await call(route, 'POST', '/mailbox/api/send', {
      account: id,
      to: 'a@example.com, b@example.com',
      subject: '路由层发信',
      text: '正文',
      attachments: [],
    });
    assert.equal(sent.status, 200, JSON.stringify(sent.json));
    assert.equal(sent.json.recipients, 2);

    const afterSend = await call(route, 'GET', '/mailbox/api/messages?account=' + id + '&folder=INBOX');
    assert.equal(afterSend.json.messages.length, 1);
    const uid = afterSend.json.messages[0].uid;

    const message = await call(route, 'GET', '/mailbox/api/message?account=' + id + '&folder=INBOX&uid=' + uid);
    assert.equal(message.status, 200, JSON.stringify(message.json));
    assert.match(message.json.message.text, /正文/);

    const events = await call(route, 'GET', '/mailbox/api/events?after=0&timeout=1000');
    assert.equal(events.status, 200);
    assert.equal(Array.isArray(events.json.events), true);

    const unknown = await call(route, 'GET', '/mailbox/api/nope');
    assert.equal(unknown.status, 404);

    const removed = await call(route, 'POST', '/mailbox/api/accounts/remove', { id });
    assert.equal(removed.status, 200);
    const left = await call(route, 'GET', '/mailbox/api/accounts');
    assert.deepEqual(left.json.accounts, []);
  } finally {
    for (const cleanup of cleanups) cleanup();
    server.close();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('事件中心的游标比当前大时按 0 处理', async () => {
  const { EventHub } = await import('../index.js');
  const hub = new EventHub();
  hub.push({ type: 'mail', uid: 1 });
  const before = await hub.wait(99, 50);
  assert.equal(before.length, 1);
  assert.equal(before[0].uid, 1);
  const empty = await hub.wait(1, 40);
  assert.deepEqual(empty, []);
});

test('HTTP 路由：宿主拒绝时返回 401 且不执行业务', async () => {
  const { ctx, routes } = fakeContext(false);
  apply(ctx, {});
  const response = await call(routes[0], 'GET', '/mailbox/api/accounts');
  assert.equal(response.status, 401);
  assert.equal(response.body, 'unauthorized');
});
