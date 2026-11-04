/**
 * 引擎自检：MIME 编解码 + IMAP/SMTP 客户端对着本地假服务器跑通全链路。
 *
 *   node --test test/engine.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMessage, parseMessage, decodeHeader, encodeHeader } from '../lib/mime.js';
import { ImapClient, parseFetchAttributes, envelopeToSummary, parseImapDate } from '../lib/imap.js';
import { SmtpClient } from '../lib/smtp.js';
import { startMockMailServer } from './mock-mail-server.mjs';

/* ------------------------------------------------------------------- MIME */

test('MIME：中文主题与附件往返', () => {
  const raw = buildMessage({
    from: 'demo@example.com',
    to: ['someone@example.com'],
    subject: '季度评审材料（第二轮）',
    text: '正文第一行\n第二行',
    attachments: [
      { filename: '报告.txt', contentType: 'text/plain', content: Buffer.from('附件内容', 'utf8') },
    ],
  });
  const parsed = parseMessage(raw);
  assert.equal(parsed.subject, '季度评审材料（第二轮）');
  assert.equal(parsed.from.address, 'demo@example.com');
  assert.equal(parsed.to[0].address, 'someone@example.com');
  assert.match(parsed.text, /正文第一行/);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].filename, '报告.txt');
  assert.equal(parsed.attachments[0].content.toString('utf8'), '附件内容');
});

test('MIME：无附件的纯文本邮件不套 multipart/mixed', () => {
  const raw = buildMessage({ from: 'a@b.c', to: ['d@e.f'], subject: 'plain', text: 'hi' });
  assert.doesNotMatch(raw.toString('utf8'), /multipart\/mixed/);
  assert.equal(parseMessage(raw).text.trim(), 'hi');
});

test('MIME：RFC 2047 解码（base64 与 Q）', () => {
  assert.equal(decodeHeader('=?utf-8?B?5rWL6K+V?='), '测试');
  assert.equal(decodeHeader('=?utf-8?Q?=E6=B5=8B=E8=AF=95?='), '测试');
  assert.equal(decodeHeader('Re: =?utf-8?B?5rWL6K+V?= 你好'), 'Re: 测试 你好');
  assert.match(encodeHeader('测试标题'), /^=\?utf-8\?B\?/);
});

test('MIME：GBK 编码的正文与主题', () => {
  const gbk = Buffer.from('d5e2cac7d6d0cec4', 'hex'); // “这是中文” 的 GBK
  const raw = Buffer.concat([
    Buffer.from(
      'Subject: =?gb2312?B?' + gbk.toString('base64') + '?=\r\n' +
        'From: =?gb2312?B?' + gbk.toString('base64') + '?= <g@example.com>\r\n' +
        'Content-Type: text/plain; charset=gb2312\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n',
      'latin1',
    ),
    Buffer.from(gbk.toString('base64')),
  ]);
  const parsed = parseMessage(raw);
  assert.equal(parsed.subject, '这是中文');
  assert.equal(parsed.from.name, '这是中文');
  assert.equal(parsed.text, '这是中文');
});

/* -------------------------------------------------------------------- IMAP */

test('IMAP：值解析与地址/日期', () => {
  const attributes = parseFetchAttributes(
    '(UID 7 FLAGS (\\Seen) ENVELOPE ("Mon, 1 Jan 2026 00:00:00 +0800" "hi" (("A" NIL "a" "b.com")) NIL NIL NIL NIL NIL NIL NIL))',
  );
  assert.equal(attributes.UID, '7');
  const summary = envelopeToSummary(attributes.ENVELOPE);
  assert.equal(summary.subject, 'hi');
  assert.equal(summary.from.address, 'a@b.com');
  assert.equal(parseImapDate('04-Nov-2026 12:00:00 +0800') > 0, true);
});

test('IMAP + SMTP：登录、发信、IDLE 收到新邮件、取正文、标已读', async () => {
  const server = await startMockMailServer();
  const imap = new ImapClient({ host: '127.0.0.1', port: server.imapPort, secure: 'plain' });
  await imap.connect();
  await imap.capability();
  await imap.login(server.user, server.password);
  const boxes = await imap.list();
  assert.equal(boxes[0].name, 'INBOX');
  const info = await imap.select('INBOX');
  assert.equal(info.exists, 0);

  // 起 IDLE，再用 SMTP 投一封信
  await imap.idleStart();
  const idlePromise = imap.idleWait(5000);

  const smtp = new SmtpClient({ host: '127.0.0.1', port: server.smtpPort, secure: 'plain' });
  await smtp.connect();
  await smtp.authenticate(server.user, server.password);
  const raw = buildMessage({
    from: server.user,
    to: ['someone@example.com'],
    subject: '来自测试的信',
    text: '你好，这是一封测试邮件。',
    attachments: [{ filename: 'a.bin', contentType: 'application/octet-stream', content: Buffer.from('xyz') }],
  });
  await smtp.send({ from: server.user, to: ['someone@example.com'], raw });
  await smtp.quit();

  const idle = await idlePromise;
  assert.equal(idle.exists, 1);

  const uids = await imap.search('ALL');
  assert.deepEqual(uids, [1]);
  const envelopes = await imap.fetchEnvelopes(uids);
  assert.equal(envelopes[0].subject, '来自测试的信');
  assert.equal(envelopes[0].seen, false);

  const body = await imap.fetchRaw(1);
  const parsed = parseMessage(body);
  assert.match(parsed.text, /测试邮件/);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].content.toString('utf8'), 'xyz');

  await imap.setFlags(1, ['Seen']);
  const after = await imap.fetchEnvelopes([1]);
  assert.equal(after[0].seen, true);

  await imap.logout();
  server.close();
});
