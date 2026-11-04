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
  folderUnread,
  watchMail,
} from './lark.js';

/**
 * 推送通道的调节参数：轮询间隔、重连节奏、判定「秒退」的阈值。
 * 抽成对象是为了让测试能把等待时间压到毫秒级。
 */
export const WATCH_TUNING = {
  // 主路径的轮询间隔：只调一次 folders 接口拿未读数，10 秒一轮 ≈ 6 次/分钟。
  pollMs: 10000,
  // 连接活过这个时长就算正常断线，直接重连；否则计入失败次数。
  minAliveMs: 15000,
  // 连续失败时的重试间隔；用完还没成功就降级成轮询。
  retryDelays: [3000, 10000],
  // 正常断线后的重连等待。
  reconnectDelay: 3000,
};

export class FeishuRuntime {
  constructor(account, hub, logger) {
    this.account = account;
    this.hub = hub;
    this.logger = logger;
    this.status = {
      connected: false,
      error: null,
      unread: 0,
      lastSync: 0,
      watching: false,
      mode: 'starting',
      kind: 'feishu',
    };
    this.disposed = false;
    this.watchChild = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.watchLog = '';
    this.watchFailures = 0;
    this.known = new Set();
    this.degraded = false;
    this.baselineDone = false;
  }

  log(message) {
    this.logger('[mailbox:feishu:' + this.account.id + '] ' + message);
  }

  async listFolders() {
    return feishuFolders();
  }

  async list(folder = 'INBOX', limit = 40) {
    const rows = await listMessages({ folder, max: Math.min(Math.max(limit, 1), 200), mailbox: this.account.email });
    const unread = (await folderUnread({ mailbox: this.account.email })).inbox;
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

  /**
   * 飞书邮箱的实时监控走「用户身份的短轮询」：
   * 每 10 秒调一次 folders 接口拿未读数，涨了再拉最近 20 封未读做差分。
   * 不依赖飞书应用的事件订阅，也不以 bot 身份访问邮件。
   *
   * 如果你确实在开放平台给应用加过 mail 事件，可以设 MAILBOX_FEISHU_WATCH=1
   * 改用 WebSocket 推送（更快，但要应用级配置）。
   */
  startWatching() {
    if (this.disposed || this.watchChild || this.pollTimer) return;
    // 首轮同步：把已有未读作为基线，避免一启动就把历史邮件当新邮件推。
    this.baseline().catch((error) => {
      this.status.error = error?.message || String(error);
      this.status.connected = false;
    });
    if (process.env.MAILBOX_FEISHU_WATCH === '1') this.attachWatch();
    else this.startPolling();
  }

  async baseline() {
    const user = await currentUser();
    this.status.connected = true;
    // 未读数直接问 folders（准确、一次调用）；known 只用来去重，拉最近一小批就够。
    const counts = await folderUnread({ mailbox: this.account.email });
    const rows = await listMessages({ unreadOnly: true, folder: 'INBOX', max: 20, mailbox: this.account.email });
    for (const row of rows) this.known.add(row.uid);
    this.unreadSeen = counts.inbox;
    this.status.unread = counts.inbox;
    this.status.lastSync = Date.now();
    this.baselineDone = true;
    this.log('已登录：' + (user.userName || user.openId || '') + '，未读 ' + counts.inbox);
  }

  attachWatch() {
    if (this.disposed) return;
    let child = null;
    try {
      child = watchMail({ mailbox: this.account.email });
    } catch (error) {
      this.log('无法建立新邮件推送，改用轮询：' + (error?.message || error));
      this.startPolling();
      return;
    }
    this.watchChild = child;
    this.status.mode = 'watch';
    this.status.watching = true;
    const startedAt = Date.now();
    this.watchLog = '';
    readNdjson(child.stdout, (payload) => {
      this.watchFailures = 0;
      this.onPush(payload);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      // 推送连接的诊断信息量很大，留一截给报错用，不整段进日志。
      this.watchLog = (this.watchLog + text + '\n').slice(-2000);
      if (/error|fail|denied|not\s+subscrib|unauthor/i.test(text)) this.log('watch stderr: ' + text.slice(0, 200));
    });
    child.on('error', () => this.onWatchExit(startedAt));
    child.on('close', () => this.onWatchExit(startedAt));
  }

  lastWatchError() {
    const lines = String(this.watchLog || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(-1)[0] || '没有更多信息';
  }

  onWatchExit(startedAt) {
    this.watchChild = null;
    this.status.watching = false;
    if (this.disposed) return;
    const lived = Date.now() - startedAt;
    // 活得够久说明推送通道本身可用，只是断线，直接重连。
    if (lived >= WATCH_TUNING.minAliveMs) {
      this.watchFailures = 0;
      this.reconnectTimer = setTimeout(() => this.attachWatch(), WATCH_TUNING.reconnectDelay);
      return;
    }
    this.watchFailures = (this.watchFailures || 0) + 1;
    if (this.watchFailures <= WATCH_TUNING.retryDelays.length) {
      const delay = WATCH_TUNING.retryDelays[this.watchFailures - 1];
      this.log('新邮件推送连接失败（' + Math.round(lived / 1000) + 's 退出），' + delay / 1000 + 's 后重试');
      this.reconnectTimer = setTimeout(() => this.attachWatch(), delay);
      return;
    }
    this.degraded = true;
    this.log(
      '新邮件推送不可用（连续 ' +
        this.watchFailures +
        ' 次失败），改用 ' +
        WATCH_TUNING.pollMs / 1000 +
        ' 秒轮询：' +
        this.lastWatchError(),
    );
    this.startPolling();
  }

  startPolling() {
    if (this.pollTimer || this.disposed) return;
    this.status.mode = 'poll';
    this.status.watching = true;
    const tick = async () => {
      if (this.disposed) return;
      try {
        const counts = await folderUnread({ mailbox: this.account.email });
        const previous = this.unreadSeen;
        this.status.connected = true;
        this.status.error = null;
        this.status.lastSync = Date.now();
        if (typeof previous === 'number' && counts.inbox > previous) {
          const rows = await listMessages({
            unreadOnly: true,
            folder: 'INBOX',
            max: 20,
            mailbox: this.account.email,
          });
          const fresh = rows.filter((row) => !this.known.has(row.uid));
          for (const row of rows) this.known.add(row.uid);
          // 从旧到新推，面板上的提示顺序才自然。
          for (const row of fresh.reverse()) this.pushMail(row);
        }
        this.unreadSeen = counts.inbox;
        // 以服务端计数为准，pushMail 的 +1 只用于推送当刻的乐观显示。
        this.status.unread = counts.inbox;
      } catch (error) {
        this.status.connected = false;
        this.status.error = error?.message || String(error);
      }
      if (this.disposed) return;
      this.pollTimer = setTimeout(tick, WATCH_TUNING.pollMs);
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
