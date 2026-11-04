/**
 * 飞书邮箱账号的运行时：把 lark-cli 的调用包装成与 IMAP 账号相同的接口，
 * 这样 HTTP 路由和前端不用区分账号类型。
 */

import {
  LarkError,
  currentUser,
  downloadAttachment,
  feishuFolders,
  getMessage,
  listMessages,
  mailboxProfile,
  parseMailboxAddress,
  readNdjson,
  sendMail,
  setUnread,
  unreadCount,
  watchMail,
} from './lark.js';

const POLL_MS = 60000;

export class FeishuRuntime {
  constructor(account, hub, logger) {
    this.account = account;
    this.hub = hub;
    this.logger = logger;
    this.status = { connected: false, error: null, unread: 0, lastSync: 0, watching: false, kind: 'feishu' };
    this.disposed = false;
    this.watchChild = null;
    this.pollTimer = null;
    this.known = new Set();
    this.degraded = false;
  }

  log(message) {
    this.logger('[mailbox:feishu:' + this.account.id + '] ' + message);
  }

  async listFolders() {
    return feishuFolders();
  }

  async list(folder = 'INBOX', limit = 40) {
    const rows = await listMessages({ folder, max: Math.min(Math.max(limit, 1), 200), mailbox: this.account.email });
    const unread = await unreadCount({ folder: 'INBOX', mailbox: this.account.email });
    this.status.unread = unread;
    this.status.connected = true;
    this.status.error = null;
    this.status.lastSync = Date.now();
    return { folder, unread, messages: rows };
  }

  async message(uid, folder = 'INBOX', markSeen = true) {
    const data = await getMessage(uid, { mailbox: this.account.email });
    if (markSeen && !data.seen) {
      try {
        await setUnread(uid, false, { mailbox: this.account.email });
      } catch (error) {
        this.log('标记已读失败：' + (error?.message || error));
      }
    }
    this.status.unread = Math.max(0, this.status.unread - (data.seen ? 0 : 1));
    return {
      uid: data.uid,
      folder: data.folder || folder,
      subject: data.subject,
      from: data.from,
      to: data.to,
      cc: data.cc,
      date: data.date,
      messageId: data.messageId,
      text: data.text,
      html: data.html,
      preview: data.preview,
      attachments: data.attachments.map(({ index, filename, contentType, size }) => ({
        index,
        filename,
        contentType,
        size,
      })),
      _attachmentIds: data.attachments.map((item) => item.id),
    };
  }

  async attachment(uid, index, folder = 'INBOX') {
    const data = await getMessage(uid, { mailbox: this.account.email });
    const item = data.attachments[index];
    if (!item) throw new LarkError('附件不存在');
    return downloadAttachment(uid, item, { mailbox: this.account.email });
  }

  async setSeen(uid, seen, folder = 'INBOX') {
    await setUnread(uid, !seen, { mailbox: this.account.email });
    this.status.unread = Math.max(0, this.status.unread + (seen ? -1 : 1));
    return { ok: true };
  }

  async send(input) {
    if (!input.to || input.to.length === 0) throw new LarkError('至少需要一个收件人');
    return sendMail({
      mailbox: this.account.email,
      to: input.to,
      cc: input.cc || [],
      subject: input.subject,
      text: input.text,
      attachments: input.attachments || [],
    });
  }

  /* ------------------------------------------------------------- 新邮件 */

  startWatching() {
    if (this.disposed || this.watchChild || this.pollTimer) return;
    this.attachWatch();
    // 首轮同步：把已有未读作为基线，避免一启动就把历史邮件当新邮件推。
    this.baseline().catch((error) => {
      this.status.error = error?.message || String(error);
      this.status.connected = false;
    });
  }

  async baseline() {
    const user = await currentUser();
    this.status.connected = true;
    const rows = await listMessages({ unreadOnly: true, folder: 'INBOX', max: 400, mailbox: this.account.email });
    for (const row of rows) this.known.add(row.uid);
    this.status.unread = rows.length;
    this.status.lastSync = Date.now();
    this.log('已登录：' + (user.userName || user.openId || ''));
  }

  attachWatch() {
    let child = null;
    try {
      child = watchMail({ mailbox: this.account.email });
    } catch (error) {
      this.log('无法建立新邮件推送，改用轮询：' + (error?.message || error));
      this.startPolling();
      return;
    }
    this.watchChild = child;
    this.status.watching = true;
    const startedAt = Date.now();
    readNdjson(child.stdout, (payload) => this.onPush(payload));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) this.log('watch stderr: ' + text.slice(0, 200));
    });
    child.on('error', () => this.onWatchExit(startedAt));
    child.on('close', () => this.onWatchExit(startedAt));
  }

  onWatchExit(startedAt) {
    this.watchChild = null;
    this.status.watching = false;
    if (this.disposed) return;
    const lived = Date.now() - startedAt;
    // 秒退说明当前应用没有订阅邮件事件，直接降级成轮询，别反复重连。
    if (lived < 15000) {
      this.degraded = true;
      this.log('邮件事件推送不可用（' + Math.round(lived / 1000) + 's 后退出），改用 ' + POLL_MS / 1000 + ' 秒轮询');
      this.startPolling();
      return;
    }
    setTimeout(() => this.attachWatch(), 5000);
  }

  startPolling() {
    if (this.pollTimer || this.disposed) return;
    this.status.watching = true;
    const tick = async () => {
      if (this.disposed) return;
      try {
        const rows = await listMessages({ unreadOnly: true, folder: 'INBOX', max: 400, mailbox: this.account.email });
        this.status.unread = rows.length;
        this.status.connected = true;
        this.status.error = null;
        this.status.lastSync = Date.now();
        for (const row of rows) {
          if (this.known.has(row.uid)) continue;
          this.known.add(row.uid);
          this.pushMail(row);
        }
      } catch (error) {
        this.status.connected = false;
        this.status.error = error?.message || String(error);
      }
      if (this.disposed) return;
      this.pollTimer = setTimeout(tick, POLL_MS);
    };
    tick().catch(() => undefined);
  }

  onPush(payload) {
    const data = payload?.data?.message || payload?.data || payload?.message || payload;
    if (!data) return;
    const id = String(data.message_id || data.message?.message_id || '');
    if (!id || this.known.has(id)) return;
    this.known.add(id);
    const from = data.head_from
      ? { name: data.head_from.name || '', address: data.head_from.mail_address || '' }
      : parseMailboxAddress(data.from || '');
    this.pushMail({
      uid: id,
      subject: data.subject || '(无主题)',
      from,
      date: Number(data.internal_date) || Date.now(),
    });
  }

  pushMail(row) {
    this.status.unread += 1;
    this.hub.push({
      type: 'mail',
      account: this.account.id,
      accountLabel: this.account.label || this.account.email,
      folder: 'INBOX',
      uid: row.uid,
      subject: row.subject,
      from: row.from,
      date: row.date,
      seen: false,
      preview: '',
    });
  }

  dispose() {
    this.disposed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      this.watchChild?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.watchChild = null;
  }
}

export { mailboxProfile, LarkError };
