/**
 * 扫码登录（OAuth 设备码）测试：假 Microsoft 端点 + 假 IMAP 服务器的 XOAUTH2。
 *
 *   node --test test/oauth.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { MICROSOFT, emailFromIdToken, pollDeviceToken, refreshAccessToken, requestDeviceCode, xoauth2Payload } from '../lib/oauth.js';
import { ImapClient } from '../lib/imap.js';
import { startMockMailServer } from './mock-mail-server.mjs';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mailbox-oauth-'));
process.env.DSH_HOME = tempHome;

function makeIdToken(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none' }) + '.' + encode(payload) + '.sig';
}

/* ------------------------------------------------------- 假 Microsoft 端点 */

let deviceCodeCalls = 0;
let tokenCalls = 0;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const send = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.url.endsWith('/devicecode')) {
      deviceCodeCalls += 1;
      const params = new URLSearchParams(body);
      if (!params.get('client_id')) return send(400, { error: 'invalid_client' });
      return send(200, {
        device_code: 'dc_test',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://microsoft.com/devicelogin',
        expires_in: 900,
        interval: 2,
      });
    }
    if (req.url.endsWith('/token')) {
      const params = new URLSearchParams(body);
      if (params.get('grant_type') === 'refresh_token') {
        if (params.get('refresh_token') !== 'rt_1') return send(400, { error: 'invalid_grant' });
        return send(200, { access_token: 'at_refreshed', refresh_token: 'rt_2', expires_in: 3600 });
      }
      tokenCalls += 1;
      if (tokenCalls < 2) return send(400, { error: 'authorization_pending', error_description: 'pending' });
      return send(200, {
        access_token: 'at_1',
        refresh_token: 'rt_1',
        expires_in: 3600,
        id_token: makeIdToken({ preferred_username: 'demo@example.com' }),
      });
    }
    res.writeHead(404);
    res.end('not found');
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.MAILBOX_OAUTH_BASE = 'http://127.0.0.1:' + server.address().port + '/common';

/* --------------------------------------------------------------- 单元用例 */

test('设备码：拿到 user_code 与验证地址', async () => {
  const device = await requestDeviceCode(MICROSOFT);
  assert.equal(device.userCode, 'ABCD-EFGH');
  assert.equal(device.verificationUri, 'https://microsoft.com/devicelogin');
  assert.equal(device.interval, 2);
  assert.equal(device.deviceCode, 'dc_test');
  assert.equal(deviceCodeCalls, 1);
});

test('轮询：先 pending，授权后拿到 token 与邮箱', async () => {
  const first = await pollDeviceToken(MICROSOFT, 'dc_test');
  assert.equal(first.status, 'pending');
  const second = await pollDeviceToken(MICROSOFT, 'dc_test');
  assert.equal(second.status, 'ok');
  assert.equal(second.token.accessToken, 'at_1');
  assert.equal(second.token.refreshToken, 'rt_1');
  assert.equal(emailFromIdToken(second.token.idToken), 'demo@example.com');
});

test('刷新：refresh_token 换新 access_token', async () => {
  const token = await refreshAccessToken(MICROSOFT, 'rt_1');
  assert.equal(token.accessToken, 'at_refreshed');
  assert.equal(token.refreshToken, 'rt_2');
  await assert.rejects(() => refreshAccessToken(MICROSOFT, 'bad'), /刷新授权失败/);
});

test('XOAUTH2 payload 符合 RFC 7628 的拼接格式', () => {
  const decoded = Buffer.from(xoauth2Payload('demo@example.com', 'tok'), 'base64').toString('utf8');
  assert.equal(decoded, 'user=demo@example.com\u0001auth=Bearer tok\u0001\u0001');
});

test('IMAP XOAUTH2：token 正确可登录，token 错误给出明确报错', async () => {
  const server = await startMockMailServer({ oauthTokens: { 'demo@example.com': 'good-token' } });
  const good = new ImapClient({ host: '127.0.0.1', port: server.imapPort, secure: false, timeout: 5000 });
  try {
    await good.connect();
    await good.capability();
    await good.authenticateXoauth2('demo@example.com', 'good-token');
    const info = await good.select('INBOX');
    assert.equal(info.exists, 0);
  } finally {
    good.close();
  }

  const bad = new ImapClient({ host: '127.0.0.1', port: server.imapPort, secure: false, timeout: 5000 });
  try {
    await bad.connect();
    await bad.capability();
    await assert.rejects(() => bad.authenticateXoauth2('demo@example.com', 'wrong'), /XOAUTH2 失败/);
  } finally {
    bad.close();
    await server.close();
  }
});

/* ----------------------------------------------------------- HTTP 路由 */

function fakeContext() {
  const routes = [];
  const cleanups = [];
  return {
    routes,
    cleanups,
    ctx: {
      connection: { requestRejection: () => undefined },
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
        let json;
        try {
          json = JSON.parse(result.buffer.toString('utf8'));
        } catch {
          json = undefined;
        }
        resolve({ ...result, json, text: result.buffer.toString('utf8') });
      },
    };
    route.handler(req, res);
  });
}

test('HTTP 路由：Outlook 扫码登录后落库，且不泄露 refresh_token', async () => {
  const { apply } = await import('../index.js');
  const { ctx, routes, cleanups } = fakeContext();
  apply(ctx, {});
  const route = routes[0];
  try {
    const started = await call(route, 'POST', '/mailbox/api/login/start', { provider: 'outlook' });
    assert.equal(started.status, 200, started.text);
    assert.equal(started.json.kind, 'oauth');
    assert.equal(started.json.userCode, 'ABCD-EFGH');
    assert.equal(started.json.qr, '/mailbox/api/assets/qr-microsoft-device.png');
    assert.match(started.json.verificationUri, /microsoft\.com/);

    const asset = await call(route, 'GET', '/mailbox/api/assets/qr-microsoft-device.png');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['content-type'], 'image/png');
    assert.equal(asset.buffer.subarray(0, 4).toString('hex'), '89504e47');

    let status = 'waiting';
    let account = null;
    for (let i = 0; i < 40 && status === 'waiting'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const polled = await call(route, 'POST', '/mailbox/api/login/poll', { id: started.json.id });
      status = polled.json.status;
      account = polled.json.account;
    }
    assert.equal(status, 'ok');
    assert.equal(account.email, 'demo@example.com');
    assert.equal(account.auth, 'xoauth2');
    assert.equal(account.refreshToken, undefined);

    const stored = JSON.parse(fs.readFileSync(path.join(tempHome, 'mailbox', 'accounts.json'), 'utf8'));
    assert.equal(stored.accounts.length, 1);
    assert.equal(stored.accounts[0].refreshToken, 'rt_1');
    assert.equal(stored.accounts[0].auth, 'xoauth2');

    // 立刻登出，避免测试去连真实的 outlook.office365.com
    const removed = await call(route, 'POST', '/mailbox/api/accounts/remove', { id: account.id });
    assert.equal(removed.status, 200);
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
});

test('HTTP 路由：不支持扫码的服务商给出可读原因', async () => {
  const { apply } = await import('../index.js');
  const { ctx, routes, cleanups } = fakeContext();
  apply(ctx, {});
  const route = routes[0];
  try {
    const qq = await call(route, 'POST', '/mailbox/api/login/start', { provider: 'qq' });
    assert.equal(qq.status, 400);
    assert.match(qq.json.message || qq.text, /应用专用密码/);

    const gmail = await call(route, 'POST', '/mailbox/api/login/start', { provider: 'gmail' });
    assert.equal(gmail.status, 400);
    assert.match(gmail.json.message || gmail.text, /Google/);
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
});

test.after(() => {
  server.close();
  fs.rmSync(tempHome, { recursive: true, force: true });
});
