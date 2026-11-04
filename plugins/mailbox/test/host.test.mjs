/**
 * host 半的行为测试：账号运行时 + 新邮件事件 + 发信 + 附件。
 *
 *   node --test test/host.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startMockMailServer } from './mock-mail-server.mjs';

// store.js 在调用时读 DSH_HOME，先指向临时目录，避免碰真实账号。
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mailbox-test-'));
process.env.DSH_HOME = tempHome;

const { AccountRuntime, EventHub } = await import('../index.js');
const { startWatching } = await import('../index.js');

function accountFor(server) {
  return {
    id: 'acc_test',
    label: '测试邮箱',
    email: server.user,
    username: server.user,
    password: server.password,
    preset: 'custom',
    imap: { host: '127.0.0.1', port: server.imapPort, secure: 'plain' },
    smtp: { host: '127.0.0.1', port: server.smtpPort, secure: 'plain' },
  };
}

test('host 运行时：列信、收事件、读正文、发信、取附件', async () => {
  const server = await startMockMailServer();
  const hub = new EventHub();
  const runtime = new AccountRuntime(accountFor(server), hub, () => {});
  try {
    const folders = await runtime.listFolders();
    assert.equal(folders[0].name, 'INBOX');

    const empty = await runtime.list('INBOX', 10);
    assert.deepEqual(empty.messages, []);

    runtime.startWatching();
    // 等 watcher 进入 IDLE
    for (let i = 0; i < 60 && !runtime.status.watching; i += 1) await new Promise((r) => setTimeout(r, 50));
    assert.equal(runtime.status.watching, true);

    // 用 SMTP 发一封信给这个账号自己，模拟“收到新邮件”
    const { SmtpClient } = await import('../lib/smtp.js');
    const { buildMessage } = await import('../lib/mime.js');
    const smtp = new SmtpClient({ host: '127.0.0.1', port: server.smtpPort, secure: 'plain' });
    await smtp.connect();
    await smtp.authenticate(server.user, server.password);
    await smtp.send({
      from: 'boss@example.com',
      to: [server.user],
      raw: buildMessage({
        from: 'boss@example.com',
        to: [server.user],
        subject: '季度目标',
        text: '这封邮件用来验证实时提醒。',
      }),
    });
    await smtp.quit();

    const events = await hub.wait(0, 8000);
    assert.equal(events.length >= 1, true);
    assert.equal(events[0].type, 'mail');
    assert.equal(events[0].subject, '季度目标');
    assert.equal(events[0].account, 'acc_test');

    const list = await runtime.list('INBOX', 10);
    assert.equal(list.messages.length, 1);
    assert.equal(list.messages[0].seen, false);

    const message = await runtime.message(list.messages[0].uid, 'INBOX');
    assert.match(message.text, /实时提醒/);
    assert.equal(message.attachments.length, 0);

    // 自己发一封带附件的信
    const sent = await runtime.send({
      to: ['someone@example.com'],
      cc: [],
      subject: '带附件的回复',
      text: '见附件。',
      attachments: [{ filename: 'note.txt', content: Buffer.from('hello').toString('base64') }],
    });
    assert.equal(sent.ok, true);

    // 刚发的那封会进 INBOX（mock 的行为），取附件
    const after = await runtime.list('INBOX', 10);
    assert.equal(after.messages.length, 2);
    const withAttachment = await runtime.message(after.messages[0].uid, 'INBOX');
    assert.equal(withAttachment.attachments.length, 1);
    const file = await runtime.attachment(after.messages[0].uid, 0, 'INBOX');
    assert.equal(file.content.toString('utf8'), 'hello');
    assert.equal(file.filename, 'note.txt');
  } finally {
    runtime.dispose();
    server.close();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
