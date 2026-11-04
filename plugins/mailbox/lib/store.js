/**
 * 账号持久化。
 *
 * 存到 `<DSH_HOME>/mailbox/accounts.json`，权限 0600。密码是明文——这是本机
 * 单用户桌面工具的取舍，README 里写明了；不要在共享机器上使用。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

export function storeDir() {
  return path.join(homeDir(), 'mailbox');
}

function storeFile() {
  return path.join(storeDir(), 'accounts.json');
}

function emptyState() {
  return { version: 1, accounts: [], counter: 0 };
}

export function readState() {
  const file = storeFile();
  try {
    const text = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      version: 1,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      counter: Number(parsed.counter || 0),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

export function writeState(state) {
  fs.mkdirSync(storeDir(), { recursive: true, mode: 0o700 });
  const file = storeFile();
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* 某些文件系统不支持 */
  }
  return state;
}

/** 对外暴露的账号视图：不含密码。 */
export function publicAccount(account) {
  return {
    id: account.id,
    label: account.label,
    email: account.email,
    username: account.username,
    preset: account.preset || 'custom',
    imap: account.imap,
    smtp: account.smtp,
    createdAt: account.createdAt,
  };
}

export function nextAccountId(state) {
  const counter = Number(state.counter || 0) + 1;
  return { id: 'acc_' + counter + '_' + Math.random().toString(36).slice(2, 8), counter };
}
