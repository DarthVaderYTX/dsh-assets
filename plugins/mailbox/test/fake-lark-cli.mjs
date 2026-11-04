#!/usr/bin/env node
/**
 * 测试用的假 lark-cli：按参数返回固定 JSON，行为由 FAKE_* 环境变量控制。
 *
 *   FAKE_LARK_LOG     每行记录一次调用（"argv..."），供断言
 *   FAKE_ATTACH_URL   附件下载链接
 *   FAKE_WATCH_MODE   fail（默认，秒退）| silent（一直活着）
 */

import fs from 'node:fs';

const args = process.argv.slice(2);
const log = process.env.FAKE_LARK_LOG;
if (log) fs.appendFileSync(log, args.join(' ') + '\n');

const out = (data) => process.stdout.write(JSON.stringify(data) + '\n');
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const MESSAGES = [
  {
    message_id: 'm1',
    subject: '季度目标',
    from: '老板 <boss@example.com>',
    date: '2026-11-04 09:30',
    folder: 'INBOX',
    labels: 'UNREAD,OTHER',
  },
  {
    message_id: 'm2',
    subject: '已读的邮件',
    from: 'colleague@example.com',
    date: '2026-11-03 18:00',
    folder: 'INBOX',
    labels: 'OTHER',
  },
];

if (args[0] === 'auth' && args[1] === 'status') {
  out({
    appId: 'cli_fake',
    identities: { user: { status: 'ready', tokenStatus: 'valid', userName: '测试用户' } },
  });
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'qrcode') {
  const file = valueOf('--output');
  // 1x1 PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(file, png);
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'login') {
  if (has('--no-wait')) {
    out({ device_code: 'dc_fake', verification_url: 'https://example.com/verify?code=dc_fake', expires_in: 600 });
    process.exit(0);
  }
  if (has('--device-code')) {
    out({ ok: true, identity: 'user' });
    process.exit(0);
  }
}

if (args[0] === 'mail' && args[1] === 'user_mailboxes' && args[2] === 'profile') {
  out({ ok: true, identity: 'user', data: { primary_email_address: 'demo@example.com' } });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === 'user_mailbox.folders' && args[2] === 'list') {
  const unread = Number(process.env.FAKE_UNREAD || 1);
  out({
    ok: true,
    identity: 'user',
    data: {
      items: [
        { id: 'INBOX', name: 'Inbox', unread_message_count: unread, unread_thread_count: unread },
        { id: 'SENT', name: 'Sent', unread_message_count: 0, unread_thread_count: 0 },
      ],
    },
  });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === '+triage') {
  const unreadOnly = has('--is-unread');
  const extra = process.env.FAKE_EXTRA_MESSAGE
    ? [
        {
          message_id: 'm99',
          subject: '刚到的邮件',
          from: 'someone <someone@example.com>',
          date: '2026-11-04 15:30',
          folder: 'INBOX',
          labels: 'UNREAD,OTHER',
        },
      ]
    : [];
  const messages = (unreadOnly ? MESSAGES.filter((item) => item.labels.includes('UNREAD')) : MESSAGES).concat(extra);
  out({ count: messages.length, has_more: false, mailbox_id: 'me', messages });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === '+message') {
  out({
    ok: true,
    identity: 'user',
    data: {
      message_id: valueOf('--message-id'),
      subject: '季度目标',
      head_from: { name: '老板', mail_address: 'boss@example.com' },
      to: [{ name: '我', mail_address: 'demo@example.com' }],
      folder_id: 'INBOX',
      internal_date: 1793728911436,
      label_ids: ['UNREAD', 'OTHER'],
      body_plain_text: '这封邮件用来验证飞书后端。',
      body_html: '<p>这封邮件用来验证飞书后端。</p>',
      body_preview: '这封邮件用来验证飞书后端。',
      smtp_message_id: 'smtp-1',
      attachments: [
        { id: 'att1', name: '报表.txt', type: 'text/plain', size: 15 },
      ],
    },
  });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === '+message-modify') {
  out({ ok: true, data: { modified: 1 } });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === 'user_mailbox.message.attachments' && args[2] === 'download_url') {
  out({ ok: true, data: { items: [{ download_url: process.env.FAKE_ATTACH_URL || '' }] } });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === '+send') {
  const attachCount = args.filter((item) => item === '--attach').length;
  const attachPaths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--attach') attachPaths.push(args[i + 1]);
  }
  const sizes = attachPaths.map((name) => {
    try {
      return fs.statSync(name).size;
    } catch {
      return -1;
    }
  });
  if (log) fs.appendFileSync(log, 'SEND attach=' + attachCount + ' sizes=' + sizes.join(',') + '\n');
  out({ ok: true, data: { draft_id: 'd1', sent: true } });
  process.exit(0);
}

if (args[0] === 'mail' && args[1] === '+watch') {
  if ((process.env.FAKE_WATCH_MODE || 'fail') === 'silent') {
    setInterval(() => {}, 1000);
    process.exit(0);
  }
  process.stderr.write('watch unavailable: missing bot event\n');
  process.exit(3);
}

process.stderr.write('fake lark-cli: unhandled ' + args.join(' ') + '\n');
process.exit(2);
