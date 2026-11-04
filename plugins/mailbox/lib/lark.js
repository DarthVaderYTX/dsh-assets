/**
 * 飞书邮箱后端：不直连 IMAP，而是调用本机的 `lark-cli`（Open API + 设备码登录）。
 *
 * 好处是登录可以扫码、不需要应用专用密码，飞书侧还能推送新邮件事件；代价是
 * 依赖本机装了 lark-cli 并已授权 `mail` 域。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class LarkError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'LarkError';
    Object.assign(this, extra);
  }
}

/* --------------------------------------------------------------- 可执行文件 */

const NODE_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(os.homedir(), '.volta', 'bin'),
  '/usr/bin',
];

function nvmNodeDirs() {
  const out = [];
  try {
    const root = path.join(os.homedir(), '.nvm', 'versions', 'node');
    for (const version of fs.readdirSync(root)) out.push(path.join(root, version, 'bin'));
  } catch {
    /* 没装 nvm */
  }
  return out;
}

/** 找 lark-cli：环境变量 → PATH → 常见安装位置。 */
export function resolveLarkBinary() {
  const explicit = process.env.LARK_CLI_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const fromPath = (process.env.PATH || '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, 'lark-cli'))
    .find((candidate) => fs.existsSync(candidate));
  if (fromPath) return fromPath;
  const candidates = [
    ...NODE_DIRS.map((dir) => path.join(dir, 'lark-cli')),
    ...nvmNodeDirs().map((dir) => path.join(dir, 'lark-cli')),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/** lark-cli 的 shebang 是 `#!/usr/bin/env node`，从 Finder 启动时 PATH 里常常没有 node。 */
function childEnv() {
  const env = { ...process.env };
  const nodeBinary = process.execPath;
  const nodeDir = nodeBinary ? path.dirname(nodeBinary) : '';
  const parts = (env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of [...nvmNodeDirs(), ...NODE_DIRS]) {
    if (dir && !parts.includes(dir)) parts.unshift(dir);
  }
  if (nodeDir && !parts.includes(nodeDir)) parts.unshift(nodeDir);
  env.PATH = parts.join(path.delimiter);
  return env;
}

/* ------------------------------------------------------------------- 执行 */

/** lark-cli 有时会在 JSON 前面打一行 tip，取第一个 `{` 或 `[` 开始解析。 */
export function parseJsonOutput(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new LarkError('lark-cli 没有输出');
  const objectAt = raw.indexOf('{');
  const arrayAt = raw.indexOf('[');
  let start = -1;
  if (objectAt === -1) start = arrayAt;
  else if (arrayAt === -1) start = objectAt;
  else start = Math.min(objectAt, arrayAt);
  if (start === -1) throw new LarkError('lark-cli 输出不是 JSON：' + raw.slice(0, 120));
  try {
    return JSON.parse(raw.slice(start));
  } catch (error) {
    throw new LarkError('lark-cli 输出解析失败：' + error.message);
  }
}

/**
 * 飞书邮件一律以「用户身份」调用。
 *
 * 为什么不是应用（bot）身份：个人邮箱属于用户本人，应用身份读不到也不该代管；
 * lark-cli 的默认身份取决于本机配置（`lark-cli config default-as`），
 * 所以每条命令都显式带上 `--as user`，不赌配置正确。
 */
function asUser(args) {
  if (!Array.isArray(args) || args[0] !== 'mail') return args;
  return args.includes('--as') ? args : [...args, '--as', 'user'];
}

export async function runLark(args, options = {}) {
  const binary = options.binary || resolveLarkBinary();
  if (!binary) throw new LarkError('没找到 lark-cli：请先安装并 `lark-cli auth login --domain mail`');
  const timeout = options.timeoutMs || 60000;
  const argv = asUser(args);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, argv, {
      cwd: options.cwd || os.tmpdir(),
      env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new LarkError('lark-cli 超时（' + Math.round(timeout / 1000) + 's）：' + argv.slice(0, 2).join(' ')));
    }, timeout);
    child.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new LarkError('lark-cli 启动失败：' + error.message));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function runJson(args, options = {}) {
  const { code, stdout, stderr } = await runLark(args, options);
  if (code !== 0) {
    throw new LarkError(cleanLarkError(stderr || stdout) || 'lark-cli 退出码 ' + code);
  }
  const data = parseJsonOutput(stdout);
  if (data && data.ok === false) {
    throw new LarkError(data.error?.message || cleanLarkError(stdout) || 'lark-cli 调用失败');
  }
  return data;
}

/** 从 lark-cli 的报错里挑出人能看懂的一行。 */
export function cleanLarkError(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
    if (parsed?.error?.message) {
      return String(parsed.error.message) + (parsed.error.subtype ? '（' + parsed.error.subtype + '）' : '');
    }
  } catch {
    /* 非 JSON，走下面的文本清理 */
  }
  return raw.split('\n').filter((line) => line.trim() && !line.startsWith('{'))[0]?.slice(0, 200) || '';
}

/* ------------------------------------------------------------------- 认证 */

export async function authStatus() {
  const data = await runJson(['auth', 'status', '--json'], { timeoutMs: 30000 });
  return data;
}

export async function currentUser() {
  const status = await authStatus();
  const user = status?.identities?.user;
  if (!user || user.status !== 'ready' || user.tokenStatus === 'invalid') {
    throw new LarkError('lark-cli 的用户身份未登录或已过期，请重新扫码登录');
  }
  return user;
}

/** 当前登录用户的邮箱地址（飞书邮箱主地址）。 */
export async function mailboxProfile() {
  const data = await runJson(
    ['mail', 'user_mailboxes', 'profile', '--params', JSON.stringify({ user_mailbox_id: 'me' }), '--json'],
    { timeoutMs: 30000 },
  );
  const address = data?.data?.primary_email_address;
  if (!address) throw new LarkError('读不到飞书邮箱地址');
  return address;
}

/* --------------------------------------------------------------- 设备码登录 */

/**
 * 发起一次扫码登录：拿到 verification_url 与 device_code，二维码由调用方生成。
 * @returns {Promise<{deviceCode: string, verificationUrl: string, expiresIn: number}>}
 */
export async function startDeviceLogin(domains = 'mail') {
  const data = await runJson(['auth', 'login', '--no-wait', '--json', '--domain', domains], {
    timeoutMs: 30000,
  });
  if (!data.verification_url || !data.device_code) throw new LarkError('lark-cli 没有返回扫码链接');
  return {
    deviceCode: String(data.device_code),
    verificationUrl: String(data.verification_url),
    expiresIn: Number(data.expires_in) || 600,
  };
}

/** 把扫码链接渲染成 PNG（lark-cli 自带二维码生成，省得自己写编码器）。 */
export async function qrcodePng(verificationUrl, outputPath, size = 320) {
  const { code, stderr } = await runLark(
    ['auth', 'qrcode', verificationUrl, '--output', outputPath, '--size', String(size)],
    { timeoutMs: 30000 },
  );
  if (code !== 0 || !fs.existsSync(outputPath)) {
    throw new LarkError('生成二维码失败：' + (cleanLarkError(stderr) || '未知错误'));
  }
  return outputPath;
}

/**
 * 等待用户扫码确认。child 会在授权完成后退出，退出码 0 表示成功。
 * @returns {import('node:child_process').ChildProcess}
 */
export function waitForDeviceLogin(deviceCode) {
  const binary = resolveLarkBinary();
  if (!binary) throw new LarkError('没找到 lark-cli');
  return spawn(binary, ['auth', 'login', '--device-code', deviceCode, '--json'], {
    cwd: os.tmpdir(),
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/* ------------------------------------------------------------------- 邮件 */

const SYSTEM_FOLDERS = [
  { name: 'INBOX', display: '收件箱', api: 'inbox' },
  { name: 'SENT', display: '已发送', api: 'sent' },
  { name: 'ARCHIVE', display: '归档', api: 'archive' },
  { name: 'SPAM', display: '垃圾邮件', api: 'spam' },
];

export function feishuFolders() {
  return SYSTEM_FOLDERS.map((folder) => ({ name: folder.name, display: folder.display }));
}

function folderApi(name) {
  const found = SYSTEM_FOLDERS.find((folder) => folder.name === String(name || 'INBOX').toUpperCase());
  return (found || SYSTEM_FOLDERS[0]).api;
}

/** `"名字 <a@b.c>"` → {name, address}。 */
export function parseMailboxAddress(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), address: match[2].trim() };
  if (raw.includes('@')) return { name: '', address: raw };
  return { name: raw, address: '' };
}

/** 把飞书摘要映射成面板用的行。 */
export function toRow(summary) {
  const labels = String(summary.labels || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return {
    uid: String(summary.message_id || ''),
    subject: summary.subject || '(无主题)',
    from: parseMailboxAddress(summary.from),
    to: [],
    date: parseFeishuDate(summary.date),
    seen: !labels.includes('UNREAD'),
    size: 0,
    folder: summary.folder || 'INBOX',
  };
}

/** `2026-11-04 02:01` → epoch ms（本地时区）。 */
export function parseFeishuDate(text) {
  const match = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  ).getTime();
}

export async function listMessages(options = {}) {
  const args = ['mail', '+triage', '--json', '--max', String(options.max || 30)];
  if (options.folder) args.push('--folder', folderApi(options.folder));
  if (options.unreadOnly) args.push('--is-unread');
  if (options.mailbox) args.push('--mailbox', options.mailbox);
  const data = await runJson(args, { timeoutMs: 60000 });
  const messages = data?.messages || data?.data?.messages || [];
  return messages.map(toRow);
}

export async function unreadCount(options = {}) {
  // +triage 单次最多 400 条；未读超过这个数时按 400 显示。
  const rows = await listMessages({ ...options, folder: options.folder || 'INBOX', max: 400, unreadOnly: true });
  return rows.length;
}

export async function getMessage(messageId, options = {}) {
  const args = ['mail', '+message', '--message-id', String(messageId), '--json'];
  if (options.mailbox) args.push('--mailbox', options.mailbox);
  const response = await runJson(args, { timeoutMs: 60000 });
  const data = response?.data || response;
  if (!data || !data.message_id) throw new LarkError('读不到这封邮件');
  const labels = Array.isArray(data.label_ids) ? data.label_ids.map(String) : [];
  const to = Array.isArray(data.to) ? data.to.map((item) => ({ name: item.name || '', address: item.mail_address || '' })) : [];
  const attachments = Array.isArray(data.attachments)
    ? data.attachments.map((item, index) => ({
        index,
        id: item.id || item.attachment_id || '',
        filename: item.name || item.filename || 'attachment.bin',
        contentType: item.type || item.content_type || 'application/octet-stream',
        size: Number(item.size || 0),
      }))
    : [];
  return {
    uid: String(data.message_id),
    folder: String(data.folder_id || 'INBOX'),
    subject: data.subject || '(无主题)',
    from: { name: data.head_from?.name || '', address: data.head_from?.mail_address || '' },
    to,
    cc: [],
    date: Number(data.internal_date) || parseFeishuDate(data.date_formatted),
    messageId: data.smtp_message_id || '',
    text: data.body_plain_text || '',
    html: data.body_html || '',
    seen: !labels.includes('UNREAD'),
    preview: String(data.body_preview || '').slice(0, 120),
    attachments,
  };
}

export async function setUnread(messageId, unread, options = {}) {
  const args = ['mail', '+message-modify', '--json', '--message-ids', String(messageId)];
  if (options.mailbox) args.push('--mailbox', options.mailbox);
  if (unread) args.push('--add-label-ids', 'unread');
  else args.push('--remove-label-ids', 'unread');
  await runJson(args, { timeoutMs: 45000 });
  return { ok: true };
}

/** 取附件的临时下载链接。 */
export async function attachmentLinks(messageId, attachmentIds, options = {}) {
  const args = [
    'mail',
    'user_mailbox.message.attachments',
    'download_url',
    '--message-id',
    String(messageId),
    '--user-mailbox-id',
    options.mailbox || 'me',
    '--json',
  ];
  for (const id of attachmentIds) args.push('--attachment-ids', String(id));
  const data = await runJson(args, { timeoutMs: 45000 });
  const list = data?.data?.items || data?.data?.download_urls || data?.items || [];
  return list;
}

/** 下载附件本体（签名链接，直接用 fetch 取）。 */
export async function downloadAttachment(messageId, attachment, options = {}) {
  if (!attachment?.id) throw new LarkError('这条附件没有 id，飞书侧不提供下载');
  const links = await attachmentLinks(messageId, [attachment.id], options);
  const first = links[0] || {};
  const url = first.download_url || first.url;
  if (!url) throw new LarkError('飞书没有返回下载链接');
  const response = await fetch(url);
  if (!response.ok) throw new LarkError('附件下载失败：HTTP ' + response.status);
  const content = Buffer.from(await response.arrayBuffer());
  return {
    filename: attachment.filename,
    contentType: attachment.contentType || 'application/octet-stream',
    content,
  };
}

/**
 * 发信。飞书的 --attach 只接受 cwd 下的相对路径，所以附件先落到临时目录。
 * @returns {Promise<{ok: true, recipients: number}>}
 */
export async function sendMail(input) {
  const attachments = input.attachments || [];
  const tempDir = attachments.length > 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mailbox-attach-')) : null;
  const args = ['mail', '+send', '--confirm-send', '--json', '--plain-text'];
  args.push('--subject', String(input.subject || '(无主题)'));
  args.push('--body', String(input.text || ' '));
  for (const address of input.to || []) args.push('--to', address);
  for (const address of input.cc || []) args.push('--cc', address);
  if (input.mailbox) args.push('--mailbox', input.mailbox);
  try {
    if (tempDir) {
      for (const [index, file] of attachments.entries()) {
        const safeName = String(file.filename || 'attachment-' + index).replace(/[/\\]/g, '_');
        const filePath = path.join(tempDir, index + '-' + safeName);
        fs.writeFileSync(filePath, file.content);
        args.push('--attach', path.basename(filePath));
      }
    }
    await runJson(args, { timeoutMs: 120000, cwd: tempDir || os.tmpdir() });
    return { ok: true, recipients: (input.to || []).length + (input.cc || []).length };
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 新邮件推送：`mail +watch` 是 NDJSON 流。返回的 child 需要调用方自行关闭。
 */
export function watchMail(options = {}) {
  const binary = resolveLarkBinary();
  if (!binary) throw new LarkError('没找到 lark-cli');
  const args = ['mail', '+watch', '--format', 'data', '--msg-format', 'metadata'];
  if (options.mailbox) args.push('--mailbox', options.mailbox);
  if (options.folders) args.push('--folders', JSON.stringify(options.folders));
  return spawn(binary, asUser(args), { cwd: os.tmpdir(), env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
}

/** 逐行解析 NDJSON。 */
export function readNdjson(stream, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const index = buffer.indexOf('\n');
      if (index === -1) break;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        /* 跳过非 JSON 行 */
      }
    }
  });
}
