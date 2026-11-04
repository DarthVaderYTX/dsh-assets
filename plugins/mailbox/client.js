window.__ModuleLoader__.load({
  id: 'mailbox',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'mailbox';
    const PANEL_ID = 'mailbox';
    const API = '/mailbox/api';
    const MUTE_KEY = 'dsh.mailbox.muted';

    /* ------------------------------------------------------------ 词典 */

    const ZH = {
      panel: '邮箱',
      title: '邮箱',
      noAccount: '还没有登录邮箱',
      noAccountHint: '添加一个账号后即可收发邮件；同一邮箱可以添加多个账号，用标签区分。',
      addAccount: '添加账号',
      accountLabel: '标签',
      accountLabelHint: '比如「工作」「个人」，同一邮箱的不同账号靠它区分',
      provider: '服务商',
      email: '邮箱地址',
      password: '密码 / 应用专用密码',
      passwordHint: '多数服务商需要先在网页端开启 IMAP/SMTP 并生成专用密码。',
      imapHost: 'IMAP 主机',
      smtpHost: 'SMTP 主机',
      connect: '登录',
      connecting: '正在连接…',
      cancel: '取消',
      accountAdded: '账号已登录',
      removeAccount: '登出并移除',
      confirmRemove: '再次点击确认登出',
      folders: '文件夹',
      inbox: '收件箱',
      compose: '写邮件',
      refresh: '刷新',
      to: '收件人',
      cc: '抄送',
      subject: '主题',
      body: '正文',
      send: '发送',
      sending: '发送中…',
      sent: '已发送',
      attachments: '附件',
      addAttachment: '添加附件',
      remove: '移除',
      reply: '回复',
      emptyList: '这里还没有邮件',
      emptyReader: '选择左侧的一封邮件',
      loading: '载入中…',
      failed: '出错了',
      retry: '重试',
      unread: '未读',
      newMail: '新邮件',
      from: '发件人',
      date: '时间',
      noSubject: '(无主题)',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
      download: '下载',
      soundOn: '新邮件提示音：开',
      soundOff: '新邮件提示音：关',
      needRecipient: '至少填一个收件人',
      attachTooBig: '附件总大小超过 18MB',
      close: '关闭',
      accountDisconnected: '未连接',
      accountWatching: '实时收信中',
      mailFrom: '来自 {name}',
      readInPanel: '读完可直接回复，不用切走。',
      tabQr: '扫码登录',
      tabPassword: '邮箱密码',
      feishuHint: '用手机飞书扫码授权，不用生成应用专用密码。授权后本机会用 lark-cli 的登录态收发飞书邮箱。',
      oauthHint: '扫码后在打开的页面输入下方代码并登录，授权完成前别关弹窗。',
      userCodeLabel: '一次性代码',
      openInBrowser: '或在浏览器打开：',
      unsupportedWebOnly: '这家邮箱的扫码只发网页登录态，换不到 IMAP/SMTP 凭据，只能用应用专用密码。',
      unsupportedGoogle: 'Google 的设备码授权不开放邮件权限，请用应用专用密码。',
      generateQr: '生成二维码',
      qrWaiting: '等待手机扫码…',
      qrOk: '已登录',
      qrFailed: '扫码失败',
      regenerate: '重新生成',
      feishuBadge: '飞书',
      sessionDays: '已保持登录 {days} 天',
      sessionKept: '凭据只存本机，默认保持登录 30 天，不会反复要密码。',
      authNeeded: '登录态失效，需要重新登录',
      larkMissing: '本机没有安装 lark-cli，无法扫码登录飞书邮箱',
      qrExpired: '二维码已过期，请重新生成',
      resizeHint: '拖动调整宽度，双击恢复默认',
    };

    const EN = {
      panel: 'Mail',
      title: 'Mail',
      noAccount: 'No mailbox signed in yet',
      noAccountHint: 'Add an account to send and receive mail. The same address can be added twice with different labels.',
      addAccount: 'Add account',
      accountLabel: 'Label',
      accountLabelHint: 'For example Work or Personal — it keeps two accounts of one address apart',
      provider: 'Provider',
      email: 'Email address',
      password: 'Password / app password',
      passwordHint: 'Most providers need IMAP/SMTP enabled and an app password generated on their website.',
      imapHost: 'IMAP host',
      smtpHost: 'SMTP host',
      connect: 'Sign in',
      connecting: 'Connecting…',
      cancel: 'Cancel',
      accountAdded: 'Account signed in',
      removeAccount: 'Sign out and remove',
      confirmRemove: 'Click again to sign out',
      folders: 'Folders',
      inbox: 'Inbox',
      compose: 'Compose',
      refresh: 'Refresh',
      to: 'To',
      cc: 'Cc',
      subject: 'Subject',
      body: 'Message',
      send: 'Send',
      sending: 'Sending…',
      sent: 'Sent',
      attachments: 'Attachments',
      addAttachment: 'Add attachment',
      remove: 'Remove',
      reply: 'Reply',
      emptyList: 'No mail here',
      emptyReader: 'Pick a message on the left',
      loading: 'Loading…',
      failed: 'Something went wrong',
      retry: 'Retry',
      unread: 'Unread',
      newMail: 'New mail',
      from: 'From',
      date: 'Date',
      noSubject: '(no subject)',
      justNow: 'just now',
      minutesAgo: '{n}m ago',
      hoursAgo: '{n}h ago',
      daysAgo: '{n}d ago',
      download: 'Download',
      soundOn: 'New-mail sound: on',
      soundOff: 'New-mail sound: off',
      needRecipient: 'At least one recipient is required',
      attachTooBig: 'Attachments exceed 18MB',
      close: 'Close',
      accountDisconnected: 'Disconnected',
      accountWatching: 'Listening for mail',
      mailFrom: 'from {name}',
      readInPanel: 'Read and reply without leaving the panel.',
      tabQr: 'QR sign-in',
      tabPassword: 'Password',
      feishuHint: 'Scan with the Feishu mobile app — no app password needed. The panel then uses your local lark-cli session.',
      oauthHint: 'Scan, then enter the code below on the page that opens. Keep this dialog open until it finishes.',
      userCodeLabel: 'One-time code',
      openInBrowser: 'Or open in a browser:',
      unsupportedWebOnly: 'QR sign-in for this provider only yields a web session, not IMAP/SMTP credentials — use an app password.',
      unsupportedGoogle: 'Google does not allow device-code sign-in for mail scopes — use an app password.',
      generateQr: 'Show QR code',
      qrWaiting: 'Waiting for the scan…',
      qrOk: 'Signed in',
      qrFailed: 'Scan failed',
      regenerate: 'Regenerate',
      feishuBadge: 'Feishu',
      sessionDays: 'Signed in for {days} days',
      sessionKept: 'Credentials stay on this machine; the session is kept for 30 days by default.',
      authNeeded: 'Sign-in expired, please sign in again',
      larkMissing: 'lark-cli is not installed, QR sign-in is unavailable',
      qrExpired: 'The code expired, generate a new one',
      resizeHint: 'Drag to resize, double-click to reset',
    };

    /* ------------------------------------------------------------ 样式 */

    const CSS = `
.mbx-root { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; }
.mbx-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); min-height: 44px; }
.mbx-title { font-weight: 600; font-size: 14px; margin-right: 2px; }
.mbx-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; }
.mbx-chip.is-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.mbx-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbx-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px;
  padding: 0 4px; border-radius: 999px; background: var(--dsw-alias-brand-primary); color: #fff;
  font-size: 10px; font-weight: 600; }
.mbx-spacer { flex: 1; }
.mbx-btn { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 12px; }
.mbx-btn:hover { border-color: var(--dsw-alias-border-l2); }
.mbx-btn.is-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.mbx-btn:disabled { opacity: .5; cursor: default; }
.mbx-body { flex: 1; min-height: 0; display: grid; overflow: hidden; }
.mbx-col { min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.mbx-col.is-last { border-right: 0; }
.mbx-splitter { position: relative; min-width: 0; padding: 0; border: 0; background: transparent;
  cursor: col-resize; touch-action: none; }
.mbx-splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; right: 2px;
  background: var(--dsw-alias-border-l1); transition: background .12s ease; }
.mbx-splitter:hover::after, .mbx-splitter:focus-visible::after, .mbx-splitter.is-active::after {
  background: var(--dsw-alias-brand-primary); }
.mbx-splitter:focus-visible { outline: none; }
.mbx-root.is-resizing { cursor: col-resize; user-select: none; }
.mbx-root.is-resizing .mbx-frame, .mbx-root.is-resizing .mbx-modal { pointer-events: none; }
.mbx-col-title { padding: 8px 12px 4px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--dsw-alias-label-secondary); }
.mbx-scroll { flex: 1; min-height: 0; overflow: auto; }
.mbx-account { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer;
  border-left: 2px solid transparent; }
.mbx-account:hover { background: var(--dsw-alias-bg-layer-2); }
.mbx-account.is-active { border-left-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
.mbx-avatar { width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-layer-2); flex: none; }
.mbx-picon { display: block; flex: none; object-fit: contain; }
.mbx-select-row { display: flex; align-items: center; gap: 8px; }
.mbx-select-icon { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center;
  justify-content: center; background: var(--dsw-alias-bg-layer-2); flex: none; }
.mbx-select-row .mbx-select { flex: 1; }
.mbx-account-text { min-width: 0; flex: 1; }
.mbx-account-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
  display: flex; align-items: center; gap: 6px; }
".mbx-warn { flex: none; width: 14px; height: 14px; border-radius: 50%; display: inline-flex;
  align-items: center; justify-content: center; font-size: 10px; font-weight: 700; cursor: help;
  color: #fff; background: var(--dsw-alias-state-error-primary); }
.mbx-tag { flex: none; padding: 0 5px; border-radius: 4px; font-size: 10px; line-height: 15px;
  color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.mbx-account-mail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;
  color: var(--dsw-alias-label-secondary); }
.mbx-folder { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 12px;
  cursor: pointer; font-size: 12px; border-radius: 6px; margin: 1px 6px; }
.mbx-folder:hover { background: var(--dsw-alias-bg-layer-2); }
.mbx-folder.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
  color: var(--dsw-alias-brand-primary); }
.mbx-row { display: block; width: 100%; text-align: left; padding: 8px 12px; cursor: pointer; border: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit; }
.mbx-row:hover { background: var(--dsw-alias-bg-layer-2); }
.mbx-row.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.mbx-row-top { display: flex; align-items: baseline; gap: 6px; }
.mbx-row-from { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.mbx-row-date { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.mbx-row-subject { margin-top: 2px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbx-row-preview { margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbx-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); flex: none; }
.mbx-reader { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.mbx-reader-head { padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.mbx-reader-subject { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.mbx-reader-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.6; }
.mbx-reader-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px; }
.mbx-text { margin: 0; white-space: pre-wrap; word-break: break-word; font: inherit; line-height: 1.65; }
.mbx-frame { width: 100%; height: 100%; border: 0; background: #fff; border-radius: 6px; }
.mbx-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.mbx-attach { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); cursor: pointer; }
.mbx-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 32px; color: var(--dsw-alias-label-secondary); text-align: center; }
.mbx-empty-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mbx-card { width: min(420px, 90%); padding: 16px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 10px; }
.mbx-field { display: flex; flex-direction: column; gap: 4px; }
.mbx-field > label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.mbx-input, .mbx-textarea, .mbx-select { width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); font-family: inherit; }
.mbx-input:focus, .mbx-textarea:focus, .mbx-select:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.mbx-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
.mbx-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.mbx-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.mbx-actions { display: flex; gap: 8px; justify-content: flex-end; }
.mbx-modal { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 24%, transparent); padding: 24px; }
.mbx-modal-card { width: min(680px, 96%); max-height: 100%; overflow: auto; display: flex; flex-direction: column;
  gap: 10px; padding: 16px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay); box-shadow: 0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 24%, transparent); }
.mbx-modal-title { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; }
.mbx-toast { position: absolute; right: 16px; bottom: 16px; z-index: 6; max-width: 320px; padding: 10px 12px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent); font-size: 12px; }
.mbx-toast-title { font-weight: 600; margin-bottom: 2px; }
.mbx-toast-body { color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.mbx-tag { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); }
.mbx-tag.is-live { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.mbx-files { display: flex; flex-direction: column; gap: 6px; }
.mbx-file { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 8px;
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: 6px; }
.mbx-link { color: var(--dsw-alias-brand-primary); cursor: pointer; background: none; border: 0; padding: 0; font: inherit; }
.mbx-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 8px; }
.mbx-tab { padding: 4px 10px; border-radius: 6px; border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; }
.mbx-tab.is-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.mbx-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 8px 0; }
.mbx-qr { width: 240px; height: 240px; border-radius: 8px; background: #fff; padding: 8px; box-sizing: border-box; }
.mbx-qr-code { display: flex; align-items: baseline; gap: 8px; }
.mbx-qr-code strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 18px; letter-spacing: .14em; }
`;

    /* ------------------------------------------------------------ 工具 */

    function formatWhen(ts, t) {
      if (!ts) return '';
      const diff = Date.now() - ts;
      if (diff < 60 * 1000) return t('justNow');
      if (diff < 60 * 60 * 1000) return t('minutesAgo', { n: Math.floor(diff / 60000) });
      if (diff < 24 * 60 * 60 * 1000) return t('hoursAgo', { n: Math.floor(diff / 3600000) });
      if (diff < 7 * 24 * 60 * 60 * 1000) return t('daysAgo', { n: Math.floor(diff / 86400000) });
      const date = new Date(ts);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    const COLUMNS_KEY = 'dsh-mailbox:columns';
const DEFAULT_COLUMNS = { accounts: 170, list: 300 };
const MIN_ACCOUNTS = 132;
const MIN_LIST = 240;
const MIN_READER = 280;
const SPLITTER_W = 6;

function readColumns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COLUMNS_KEY) || 'null');
    if (parsed && Number.isFinite(parsed.accounts) && Number.isFinite(parsed.list)) {
      return {
        accounts: Math.max(MIN_ACCOUNTS, Math.round(parsed.accounts)),
        list: Math.max(MIN_LIST, Math.round(parsed.list)),
      };
    }
  } catch {
    /* 坏数据回默认 */
  }
  return { ...DEFAULT_COLUMNS };
}

    /* ---------------------------------------------------- 服务商小图标 */

    // 优先用各家的官方矢量标记；163 只找得到官方 favicon 位图，直接内联成 data URI。
    const BRAND_ICONS = {
      feishu: { color: '#3370FF', viewBox: '0 0 497 512', path: 'm177.803 358.2l40.97 44.93c-30.652-.461-61.413 4.551-87.328 9.754C144.08 389 158.49 367.568 177.803 358.2m73.11 46.451l-48.169-52.647c9.543-1.27 20.202-2.094 31.804-3.44c32.47 7.322 54.089 25.091 68.926 49.388c-16.053 3.403-33.189 6.697-52.561 6.7m-68.44-369c47.958 7.494 64.709 28.864 60.847 63.46c-83.711 44.084-133.924 156.5-145.55 209.22c-9.393 42.588-10.39 77.567-33.826 113.913c-35.587.89-42.159-2.869-59.564 10.44L0 454.147c15.159-13.417 19.46-7.006 47.047-10c-4.585 5.086-9.673 10.227-15.403 15.454c-19.705 23.88 21.544 72.554 46.276 43.326c15.75-11.84 28.03-38.095 41.197-65.365c24.443-1.805 55.521-3.509 86.461-4.82c2.813 9.248 7.42 17.82 15.284 25.163c3.007-8.622 9.108-17.444 17.081-26.388c23.532-.782 45.491-1.259 62.56-1.286c0 0 16.863-29.977 82.44-29.977c65.575 0 66.95 20.73 70.447 6.745c5.246-20.985 45.087-21.898 42.718-28.48c-6.745-18.735-31.271-5.257-50.962 7.495h-35.224c-5.808-24.544-48.807 2.717-78.23 6.381c-15.713-17.451-30.117-35.824-53.734-52.102c49.401-14.246 166.023-104.59 114.727-224.827c-15.423-36.151-36.467-86.41-57.707-101.175c-49.404-34.341-101.92 3.998-101.92 3.998h-33.055c-8.892 1.209-10.855 2.61-17.53 17.361' },
      outlook: { color: '#0F6CBD', path: 'M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z' },
      gmail: { color: '#EA4335', path: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' },
      qq: { color: '#12B7F5', path: 'M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673' },
      aliyun: { color: '#FF6A00', path: 'M3.996 4.517h5.291L8.01 6.324 4.153 7.506a1.668 1.668 0 0 0-1.165 1.601v5.786a1.668 1.668 0 0 0 1.165 1.6l3.857 1.183 1.277 1.807H3.996A3.996 3.996 0 0 1 0 15.487V8.513a3.996 3.996 0 0 1 3.996-3.996m16.008 0h-5.291l1.277 1.807 3.857 1.182c.715.227 1.17.889 1.165 1.601v5.786a1.668 1.668 0 0 1-1.165 1.6l-3.857 1.183-1.277 1.807h5.291A3.996 3.996 0 0 0 24 15.487V8.513a3.996 3.996 0 0 0-3.996-3.996m-4.007 8.345H8.002v-1.804h7.995Z' },
      '163': { color: '#E63C33', img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAIcUlEQVR42pWXb4xcVRnGf++5987cmd3+n9m2WAvS0pZSMZUW0QaypdDCF8RoCahoUFQMMYqRhECgFDEEvgCmITFI/KABLX8lEBADAkJBoRjDv3YXWloLtDu7LXR2Z+bemXseP9zZWpZtwZNMMsnMeZ/3vO9znvc5xqdYAmfgX4ZoaqGyLsSd03bqd7L5ZvR4Ucf0NtgLgfhzMxl6ZhmkG8BtBH+02PZpwQcLs77qLLjSG6vKGA2EAa4bxAMFjARhYovguoXJ0JObIbgAsv87AeW/mYHfXqxeXzK3IQRGkTdwUzEOIiSNGBaVzKYCNFFWxoIOoqXshsXJyIbxQ0yG446UwPVd8G1x33VlcxvayI+idgwOqXYQfyXKVocBa8z7Mxu+c14if08IQQN1UvBTLLzuzbhytYHfDMGnroAgMMjeivsuirG7m0geVMJcS9rSkb9kaTo8MNnet4rVGyNz1yQoC4AQglQ694Sk9vh43KMm0C09r1erPYU6T/bgVo7lwUKkkXbsVi75cN9OgW0rzu4PTes9/tn3WsP39edltsG4+kQP7swGSktY1BBbTkj2nQHIQEdtwdN5lopH7ewe3Kljec/pxchkt4+DvxP3nVY2PVox9+NpBPfMKVYv7gJkYHelCEHUROZMqwZ7K6cbSBMwJ0vAA8j704JDRSEYkxLv3ePKuaHM+1Md7Bz2/rmm/OuR9JkugDnvX2qjtgPz4GNMvs26bvyPYIYTE9jYLVGGW9DJe6QiZk3THovS96yTn+LedHjTvbBpPVAF68/3GUAhjfe04qTtIPLgCxAG2HEAUya03U3OQTAo6jCiODSWFLJG94awHvy9kF0A2WrodMklA7UZKwDWzUhmBlhhMtKGk5HQQCb/Tmh5EzLAi4q1CjOBAxvBfzuufmeP7NKGqQ6kyOpCzoEy6AUrqitkqSSPdgHUJ5AwPII2ZM5s63hCKfIlc3Pw2RLBDgOZC1+Xz06aacHMccXqINJu+GZOQgCXInPm/gHQP0GQwkkESALb5vwTdc/uktm8BngHoZz91OBRgVnj/a3P9s5ZMredXQh2jMw3kf2HQDUyd0fB+GwKWQiujUY6Ufgkrf+1+JP0PwAYjPuu3hvP1kDc1x6I+7Ld+fcNn7R/IK4+9X48W4NxX/pePFsDpb4rADZMwjk72hx4gXnFSiF9cLpz6w7g5YAILJPu9rg7oyDbnjaG98fMc+0ZY4WwEVbauGPN/M0R7hSBJeiBaHbpWy/t2tVeD36iENkR5FmbIVgP+nfP7MrUjr8rMFubQqhclFwTkaEBxIiByayANCs0OzbASJEQH5r3Zy1sD289nOBHTGCyPwC8Gc5aEQfuPpmbn6FMEARgMXYogIA2og1e+XU0B8qkYWfa5Fv+14vYf3Aixscq8DBzy/PxNrPUnp5k4QqcznHiG86skkJWxoKGfIIhB5mwonXvPOBCsBBD+d0kAKabY0TZX5NC8cKTDu450AXWISES2GYIBguVn59UzN7tif2+RMGgOR6KcZdhVmkD07CgiQbNtK4+I5yVoVtCcMpP6wylHel7TemyVP6NKNeQbES+NcPc2YU0ueljw6hrFrSsXOnD7Kqi2fRctaw0Xp4iRoDSBv63hG7VotbwM1P3Z6siuR9ZfhpfwszDxkVJ7XdjUeMBzMKuEgYG8QEpC7AfvlGsrrUux8YrIIH5xvCIYX8rYUw3F5UwvBhtS/9qoU3m/cnHt2o/SEf3fjhQrN5o6DFnHNPOfULYkL9hcat200Bvb3Vau/xQL7bIQ0fQ8qhpYD0YEVxMd34c4sA4Md6YcswskvTLxcDiLFNLga/Vm/tfXQENgMFi9Rzg+l7nvlRXbs16MA7K37gkqV27r1rtrdft/h5sbR2lM3GFA8p+aVipZPaLDGihV7KerP/EkZH6hrz6R19b5s0rVfa31jjPTxxubZAbz3YZizowmpquXdQcum3XtGkzsqRwf4xbXUfJFKw4Kj1HMnSWj/vWF+H3hpHK7xrD9S9P9r2jnLQfvYZbIayW557cyjqfN2OVG05OcbjlhdwJd0BhLxal+BcbZlcsbQ69uK00Z2Xayu4om1tRR8lUrNiQf7lTaJ2/NCHZjpzHDpnCeLJZMG7FphUrdwY++6Yzi8oY3bJJyGaaCw96v7vpstsWNIdvBRgsVS837zeWzM0aQ+kUrDgmv7XusvOX1+sjAnsbHVfA8Pm8HlPUqJMc5gfGOfAq86dj7rsdiIKu1w+6H492HKTzs1Yh/OKC5vCtg2H1KwNx9alYbhPGrAbqTMEKTfSYj4Jzlzf3v7uTY+PcJdkZ5AQU2J6leWLO8iGXi4LARthdR/qDh04mDaXSKw38bwy/+oRWbcHxzeHbo1Zzzltx9U4X2t/LuNVNlEUYERaOmm7ePm/oa4tG99YE9jl2tbYVK9+PcWsaqOPBhJ463JrZRBl+jaWFMK6tLNDec3zrg10AWk+w45Hq+Zm4xIn+HnM99dwpBxFGgn+t4+2aE9Ohh8fjvcvccjPuXO5w1wqVXW5MhoPELVvIviHjMA832Xo7njE/JOxPZGcaOjs0OybCaCE8aBrOxuT3ZqY/IvrAipJ/XsaYYYsxO6+MLWzmrlpls6CO//riZu2Bw98HNtmbYEdpzgrvs0cqLuhrSDS7oDG5u2vKNwKzuxLvN4WB1swmuuMDiZLlw6nd3ZOB78FcB9H0umpxWrtlfNqOS/JER+QMskHvvzDFXF9Nvh1A1H2MWoJ/Cc+DMvvTgtbQjty0VE8bM+GBD+Q9OWldnO9xifR8Kv+rJenwY902+08axwz0zqnQ9vc743RJ/3To6Qx7Mp3KlmW12uj4q3n8NAPFyqWh2UWZWCSIHOwMZC8lZH8ZS0ceXwHtIz1Q/wvf/lUzqyXQMwAAAABJRU5ErkJggg==' },
      custom: {
        color: 'currentColor',
        path:
          'M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.4.5 6.6 4.8 6.6-4.8H5.4Zm13.6 2.1-7 5.1-7-5.1v8.4c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V9.1Z',
      },
    };

    function ProviderIcon({ preset, size = 14 }) {
      const icon = BRAND_ICONS[preset] || BRAND_ICONS.custom;
      if (icon.img) {
        return h('img', {
          className: 'mbx-picon',
          src: icon.img,
          width: size,
          height: size,
          alt: String(preset || 'mail'),
          draggable: false,
        });
      }
      return h(
        'svg',
        {
          className: 'mbx-picon',
          width: size,
          height: size,
          viewBox: icon.viewBox || '0 0 24 24',
          'aria-hidden': 'true',
          fill: icon.color,
        },
        h('path', { d: icon.path }),
      );
    }

    function initialOf(text) {
      const value = String(text || '?').trim();
      return value.slice(0, 1).toUpperCase();
    }

    async function api(path, options) {
      const response = await fetch(API + path, {
        method: options?.method || 'GET',
        headers: options?.body ? { 'content-type': 'application/json' } : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await response.json().catch(() => ({ ok: false, error: 'HTTP ' + response.status }));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + response.status);
      return data;
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          resolve({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            content: comma >= 0 ? result.slice(comma + 1) : result,
          });
        };
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
    }

    /* ------------------------------------------------------------ 声音 */

    function createChime() {
      let context = null;
      return function chime() {
        try {
          if (typeof window === 'undefined') return;
          const Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) return;
          context = context || new Ctor();
          if (context.state === 'suspended') context.resume().catch(() => {});
          const now = context.currentTime;
          const notes = [
            { freq: 987.77, at: 0 },
            { freq: 1318.51, at: 0.12 },
          ];
          for (const note of notes) {
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.type = 'sine';
            osc.frequency.value = note.freq;
            gain.gain.setValueAtTime(0.0001, now + note.at);
            gain.gain.exponentialRampToValueAtTime(0.18, now + note.at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + 0.42);
            osc.connect(gain).connect(context.destination);
            osc.start(now + note.at);
            osc.stop(now + note.at + 0.45);
          }
        } catch {
          /* 浏览器拒绝播放时静默 */
        }
      };
    }

    /* ------------------------------------------------------------ 图标 */

    function MailIcon({ size = 16, unread = 0 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', {
          x: 2.5, y: 5, width: 19, height: 14, rx: 2.5,
          stroke: 'currentColor', strokeWidth: 1.7,
        }),
        h('path', { d: 'M3.5 7.2 12 13l8.5-5.8', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
        unread > 0
          ? h('circle', { cx: 20, cy: 5, r: 3.4, fill: 'var(--dsw-alias-brand-primary)', stroke: 'none' })
          : null,
      );
    }

    /* ------------------------------------------------------------ 主组件 */

    function MailboxPage(props) {
      const state = props.store.use();
      const t = props.t;
      const [activeId, setActiveId] = React.useState(null);
      const [folder, setFolder] = React.useState('INBOX');
      const [folders, setFolders] = React.useState([]);
      const [messages, setMessages] = React.useState([]);
      const [listState, setListState] = React.useState('idle');
      const [listError, setListError] = React.useState(null);
      const [selectedUid, setSelectedUid] = React.useState(null);
      const [message, setMessage] = React.useState(null);
      const [messageState, setMessageState] = React.useState('idle');
      const [compose, setCompose] = React.useState(null);
      const [addForm, setAddForm] = React.useState(null);
      const [addMode, setAddMode] = React.useState('qr');
      const [qr, setQr] = React.useState(null);
      const [pendingRemove, setPendingRemove] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      // 三栏宽度可拖：左（账号/文件夹）、中（列表）可调，右（读信）吃剩余空间。
      const [cols, setCols] = React.useState(readColumns);
      const [resizing, setResizing] = React.useState(false);
      const bodyRef = React.useRef(null);

      const clampCols = (current, which, next) => {
        const total = bodyRef.current ? bodyRef.current.clientWidth : 900;
        const other = which === 'accounts' ? current.list : current.accounts;
        const min = which === 'accounts' ? MIN_ACCOUNTS : MIN_LIST;
        const room = total - other - MIN_READER - 2 * SPLITTER_W;
        const max = Math.max(min, room);
        return { ...current, [which]: Math.round(Math.min(max, Math.max(min, next))) };
      };

      const startResize = (which) => (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = which === 'accounts' ? cols.accounts : cols.list;
        setResizing(true);
        const onMove = (moveEvent) => {
          const next = startWidth + (moveEvent.clientX - startX);
          setCols((current) => clampCols(current, which, next));
        };
        const onUp = () => {
          setResizing(false);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      };

      const resizeByKey = (which) => (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.shiftKey ? 48 : 16;
        const delta = event.key === 'ArrowLeft' ? -step : step;
        setCols((current) => clampCols(current, which, (which === 'accounts' ? current.accounts : current.list) + delta));
      };

      const resetColumn = (which) => () =>
        setCols((current) => ({ ...current, [which]: which === 'accounts' ? DEFAULT_COLUMNS.accounts : DEFAULT_COLUMNS.list }));

      // 拖动时每帧都写 localStorage 太重，停手 200ms 再存。
      React.useEffect(() => {
        const timer = setTimeout(() => {
          try {
            window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols));
          } catch {
            /* 隐私模式忽略 */
          }
        }, 200);
        return () => clearTimeout(timer);
      }, [cols]);

      // 面板变窄时把保存的宽度收回可用范围，避免读信区被挤没。
      React.useEffect(() => {
        const element = bodyRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
          const total = element.clientWidth;
          if (!total) return;
          setCols((current) => {
            const accounts = Math.min(
              current.accounts,
              Math.max(MIN_ACCOUNTS, total - current.list - MIN_READER - 2 * SPLITTER_W),
            );
            const list = Math.min(
              current.list,
              Math.max(MIN_LIST, total - accounts - MIN_READER - 2 * SPLITTER_W),
            );
            return accounts === current.accounts && list === current.list ? current : { accounts, list };
          });
        });
        observer.observe(element);
        return () => observer.disconnect();
      }, []);

      const accounts = state.accounts;
      const providers = state.providers;
      const active = accounts.find((item) => item.id === activeId) || accounts[0] || null;

      React.useEffect(() => {
        if (!activeId && accounts.length > 0) setActiveId(accounts[0].id);
      }, [accounts, activeId]);

      // 账号切换后拉文件夹
      React.useEffect(() => {
        if (!active) {
          setFolders([]);
          return undefined;
        }
        let cancelled = false;
        api('/folders?account=' + encodeURIComponent(active.id))
          .then((data) => {
            if (!cancelled) setFolders(data.folders || []);
          })
          .catch(() => {
            if (!cancelled) setFolders([{ name: 'INBOX' }]);
          });
        return () => {
          cancelled = true;
        };
      }, [active?.id]);

      const loadMessages = React.useCallback(
        async (accountId, box) => {
          if (!accountId) return;
          setListState('loading');
          setListError(null);
          try {
            const data = await api(
              '/messages?account=' + encodeURIComponent(accountId) +
                '&folder=' + encodeURIComponent(box) + '&limit=40',
            );
            setMessages(data.messages || []);
            setListState('ready');
          } catch (error) {
            setListError(error.message);
            setListState('error');
          }
        },
        [],
      );

      React.useEffect(() => {
        setSelectedUid(null);
        setMessage(null);
        loadMessages(active?.id, folder);
      }, [active?.id, folder, loadMessages, state.mailTick]);

      // 新邮件到达时，如果正在看收件箱就提示一下
      React.useEffect(() => {
        if (!state.lastEvent) return;
        setToast({
          title: t('newMail'),
          body:
            (state.lastEvent.from?.name || state.lastEvent.from?.address || '') +
            ' · ' +
            (state.lastEvent.subject || t('noSubject')),
        });
        const timer = setTimeout(() => setToast(null), 6000);
        return () => clearTimeout(timer);
      }, [state.lastEvent]);

      const openMessage = async (uid) => {
        setSelectedUid(uid);
        setMessageState('loading');
        setMessage(null);
        try {
          const data = await api(
            '/message?account=' + encodeURIComponent(active.id) +
              '&folder=' + encodeURIComponent(folder) +
              '&uid=' + uid,
          );
          setMessage(data.message);
          setMessageState('ready');
          setMessages((current) =>
            current.map((row) => (row.uid === uid ? { ...row, seen: true } : row)),
          );
          props.store.refreshAccounts().catch(() => {});
        } catch (error) {
          setMessageState('error');
          setMessage(null);
          setToast({ title: t('failed'), body: error.message });
        }
      };

      const cancelQr = React.useCallback(() => {
        setQr((current) => {
          if (current?.id) {
            api('/login/cancel', { method: 'POST', body: { id: current.id } }).catch(() => {});
          }
          return null;
        });
      }, []);

      const startQrLogin = async (preset) => {
        setQr({ status: 'starting' });
        try {
          const data = await api('/login/start', { method: 'POST', body: { provider: preset } });
          setQr({
            id: data.id,
            src: data.qr,
            kind: data.kind,
            userCode: data.userCode || '',
            verificationUri: data.verificationUri || '',
            status: 'waiting',
            error: null,
          });
        } catch (error) {
          setQr({ status: 'error', error: error.message });
        }
      };

      React.useEffect(() => {
        if (!qr || qr.status !== 'waiting' || !qr.id) return undefined;
        let stopped = false;
        const timer = setInterval(async () => {
          try {
            const data = await api('/login/poll', { method: 'POST', body: { id: qr.id } });
            if (stopped) return;
            if (data.status === 'ok') {
              setQr(null);
              setAddForm(null);
              setToast({ title: t('qrOk'), body: (data.account && data.account.email) || '' });
              await props.store.refreshAccounts();
            } else if (data.status === 'error' || data.status === 'cancelled' || data.status === 'expired') {
              setQr((current) =>
                current
                  ? {
                      ...current,
                      status: data.status === 'expired' ? 'expired' : 'error',
                      error: data.error || t('qrFailed'),
                    }
                  : current,
              );
            }
          } catch (error) {
            if (!stopped) {
              setQr((current) => (current ? { ...current, status: 'error', error: error.message } : current));
            }
          }
        }, 2000);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      }, [qr?.id, qr?.status]);

      const startCompose = (mode, source) => {
        const replyTo = source ? source.from?.address || '' : '';
        const quoted = source
          ? '\n\n--- ' + (source.date ? new Date(source.date).toLocaleString() : '') + ' ' +
            (source.from?.name || source.from?.address || '') + ' ---\n' +
            String(source.text || '').split('\n').map((line) => '> ' + line).join('\n')
          : '';
        setCompose({
          mode,
          to: mode === 'new' ? '' : replyTo,
          cc: '',
          subject: source ? (mode === 'reply' ? (/^re:/i.test(source.subject) ? source.subject : 'Re: ' + source.subject) : 'Fwd: ' + source.subject) : '',
          text: quoted,
          attachments: [],
          sending: false,
          error: null,
        });
      };

      const addFiles = async (fileList) => {
        const files = Array.from(fileList || []);
        const encoded = [];
        for (const file of files) encoded.push(await readFileAsBase64(file));
        const total = encoded.reduce((sum, file) => sum + file.size, 0);
        if (total > 18 * 1024 * 1024) {
          setCompose((current) => (current ? { ...current, error: t('attachTooBig') } : current));
          return;
        }
        setCompose((current) =>
          current ? { ...current, attachments: [...current.attachments, ...encoded], error: null } : current,
        );
      };

      const submitCompose = async () => {
        if (!compose || !active) return;
        const to = compose.to.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
        if (to.length === 0) {
          setCompose({ ...compose, error: t('needRecipient') });
          return;
        }
        setCompose({ ...compose, sending: true, error: null });
        try {
          await api('/send', {
            method: 'POST',
            body: {
              account: active.id,
              to,
              cc: compose.cc.split(/[,;]/).map((item) => item.trim()).filter(Boolean),
              subject: compose.subject,
              text: compose.text,
              attachments: compose.attachments.map((file) => ({
                filename: file.filename,
                contentType: file.contentType,
                content: file.content,
              })),
            },
          });
          setCompose(null);
          setToast({ title: t('sent'), body: to.join(', ') });
          loadMessages(active.id, folder);
        } catch (error) {
          setCompose({ ...compose, sending: false, error: error.message });
        }
      };

      const submitAccount = async () => {
        if (!addForm) return;
        setAddForm({ ...addForm, busy: true, error: null });
        const provider = providers.find((item) => item.id === addForm.preset) || providers[0] || { imap: {}, smtp: {} };
        try {
          await api('/accounts', {
            method: 'POST',
            body: {
              label: addForm.label,
              email: addForm.email,
              password: addForm.password,
              preset: addForm.preset,
              imap: { host: addForm.imapHost || provider.imap.host, port: Number(addForm.imapPort || provider.imap.port) },
              smtp: { host: addForm.smtpHost || provider.smtp.host, port: Number(addForm.smtpPort || provider.smtp.port) },
            },
          });
          setAddForm(null);
          setToast({ title: t('accountAdded'), body: addForm.email });
          await props.store.refreshAccounts();
        } catch (error) {
          setAddForm({ ...addForm, busy: false, error: error.message });
        }
      };

      const removeAccount = async (account) => {
        if (pendingRemove !== account.id) {
          setPendingRemove(account.id);
          setTimeout(() => setPendingRemove((current) => (current === account.id ? null : current)), 4000);
          return;
        }
        setPendingRemove(null);
        try {
          await api('/accounts/remove', { method: 'POST', body: { id: account.id } });
          await props.store.refreshAccounts();
        } catch (error) {
          setToast({ title: t('failed'), body: error.message });
        }
      };

      /* ---------------------------------------------------------- 渲染 */

      const head = h(
        'div',
        { className: 'mbx-head' },
        h('span', { className: 'mbx-title' }, t('title')),
        ...accounts.map((account) =>
          h(
            'button',
            {
              key: account.id,
              type: 'button',
              className: 'mbx-chip' + (active && account.id === active.id ? ' is-active' : ''),
              onClick: () => setActiveId(account.id),
              title: account.email,
            },
            h(ProviderIcon, { preset: account.preset, size: 12 }),
            h('span', { className: 'mbx-chip-name' }, account.label || account.email),
            account.status && account.status.unread > 0
              ? h('span', { className: 'mbx-badge' }, String(account.status.unread))
              : null,
          ),
        ),
        h('button', {
          type: 'button',
          className: 'mbx-btn',
          onClick: () => {
            setAddMode('qr');
            setQr(null);
            setAddForm({
              preset: (providers[0] && providers[0].id) || 'custom',
              label: '',
              email: '',
              password: '',
              imapHost: '',
              imapPort: '',
              smtpHost: '',
              smtpPort: '',
              busy: false,
              error: null,
            });
          },
          title: t('addAccount'),
        }, '＋ ' + t('addAccount')),
        h('span', { className: 'mbx-spacer' }),
        h('button', {
          type: 'button',
          className: 'mbx-btn',
          onClick: () => props.store.setMuted(!props.store.state.muted),
          title: props.store.state.muted ? t('soundOff') : t('soundOn'),
        }, props.store.state.muted ? '🔕' : '🔔'),
        active
          ? h(
              'button',
              {
                type: 'button',
                className: 'mbx-btn',
                onClick: () => loadMessages(active.id, folder),
                title: t('refresh'),
              },
              '⟳',
            )
          : null,
        active
          ? h('button', {
              type: 'button',
              className: 'mbx-btn is-primary',
              onClick: () => startCompose('new', null),
            }, t('compose'))
          : null,
      );

      const splitter = (which) =>
        h('div', {
          key: 'splitter-' + which,
          className: 'mbx-splitter' + (resizing ? ' is-active' : ''),
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': t('resizeHint'),
          title: t('resizeHint'),
          tabIndex: 0,
          onPointerDown: startResize(which),
          onDoubleClick: resetColumn(which),
          onKeyDown: resizeByKey(which),
        });

      const body = h(
        'div',
        {
          className: 'mbx-body',
          ref: bodyRef,
          style: {
            gridTemplateColumns:
              cols.accounts + 'px ' + SPLITTER_W + 'px ' + cols.list + 'px ' + SPLITTER_W + 'px minmax(0, 1fr)',
          },
        },
        // 左：账号 + 文件夹
        h(
          'div',
          { className: 'mbx-col' },
          h('div', { className: 'mbx-col-title' }, t('accounts')),
          h(
            'div',
            { className: 'mbx-scroll' },
            accounts.length === 0
              ? h('div', { className: 'mbx-hint', style: { padding: '8px 12px' } }, t('noAccount'))
              : accounts.map((account) =>
                  h(
                    'div',
                    {
                      key: account.id,
                      className: 'mbx-account' + (active && account.id === active.id ? ' is-active' : ''),
                      onClick: () => setActiveId(account.id),
                    },
                    h('span', { className: 'mbx-avatar' }, h(ProviderIcon, { preset: account.preset, size: 15 })),
                    h(
                      'span',
                      { className: 'mbx-account-text' },
                      h(
                        'div',
                        { className: 'mbx-account-label' },
                        account.label || account.email,
                        account.kind === 'feishu'
                          ? h('span', { className: 'mbx-tag' }, t('feishuBadge'))
                          : null,
                      ),
                      h(
                        'div',
                        { className: 'mbx-account-mail', title: t('sessionKept') },
                        account.email,
                        account.session && account.session.startedAt
                          ? ' · ' +
                            t('sessionDays', {
                              days: String(Math.max(0, Math.floor((Date.now() - account.session.startedAt) / 86400000))),
                            })
                          : '',
                      ),
                    ),
                    account.status && account.status.error
                      ? h('span', { className: 'mbx-warn', title: account.status.error }, '!')
                      : null,
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'mbx-link',
                        title: pendingRemove === account.id ? t('confirmRemove') : t('removeAccount'),
                        onClick: (event) => {
                          event.stopPropagation();
                          removeAccount(account);
                        },
                      },
                      pendingRemove === account.id ? '✓' : '⏻',
                    ),
                  ),
                ),
          ),
          active
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'mbx-col-title' }, t('folders')),
                h(
                  'div',
                  { className: 'mbx-scroll', style: { flex: '0 1 auto', maxHeight: '40%' } },
                  [{ name: 'INBOX' }, ...folders.filter((item) => item.name !== 'INBOX')].map((item) =>
                    h(
                      'div',
                      {
                        key: item.name,
                        className: 'mbx-folder' + (folder === item.name ? ' is-active' : ''),
                        onClick: () => setFolder(item.name),
                      },
                      h('span', null, item.name === 'INBOX' ? t('inbox') : item.display || item.name),
                      item.name === 'INBOX' && active.status && active.status.unread > 0
                        ? h('span', { className: 'mbx-badge' }, String(active.status.unread))
                        : null,
                    ),
                  ),
                ),
              )
            : null,
        ),
        splitter('accounts'),
        // 中：邮件列表
        h(
          'div',
          { className: 'mbx-col' },
          h(
            'div',
            { className: 'mbx-scroll' },
            listState === 'loading'
              ? h('div', { className: 'mbx-hint', style: { padding: 12 } }, t('loading'))
              : listState === 'error'
                ? h(
                    'div',
                    { className: 'mbx-hint', style: { padding: 12 } },
                    t('failed') + '：' + listError,
                  )
                : messages.length === 0
                  ? h('div', { className: 'mbx-hint', style: { padding: 12 } }, t('emptyList'))
                  : messages.map((row) =>
                      h(
                        'button',
                        {
                          key: row.uid,
                          type: 'button',
                          className: 'mbx-row' + (row.uid === selectedUid ? ' is-active' : ''),
                          onClick: () => openMessage(row.uid),
                        },
                        h(
                          'div',
                          { className: 'mbx-row-top' },
                          h('span', { className: 'mbx-row-from' }, row.from?.name || row.from?.address || '—'),
                          !row.seen ? h('span', { className: 'mbx-dot' }) : null,
                          h('span', { className: 'mbx-row-date' }, formatWhen(row.date, t)),
                        ),
                        h('div', { className: 'mbx-row-subject' }, row.subject || t('noSubject')),
                        h('div', { className: 'mbx-row-preview' }, formatSize(row.size)),
                      ),
                    ),
          ),
        ),
        splitter('list'),
        // 右：读信
        h(
          'div',
          { className: 'mbx-col is-last' },
          !active
            ? h(
                'div',
                { className: 'mbx-empty' },
                h('div', { className: 'mbx-empty-title' }, t('noAccount')),
                h('div', { className: 'mbx-hint' }, t('noAccountHint')),
                h('button', {
                  type: 'button',
                  className: 'mbx-btn is-primary',
                  onClick: () => {
                    setAddMode('qr');
                    setQr(null);
                    setAddForm({
                      preset: (providers[0] && providers[0].id) || 'custom',
                      label: '',
                      email: '',
                      password: '',
                      imapHost: '',
                      imapPort: '',
                      smtpHost: '',
                      smtpPort: '',
                      busy: false,
                      error: null,
                    });
                  },
                }, t('addAccount')),
              )
            : messageState === 'loading'
              ? h('div', { className: 'mbx-empty' }, h('div', { className: 'mbx-hint' }, t('loading')))
              : !message
                ? h(
                    'div',
                    { className: 'mbx-empty' },
                    h('div', { className: 'mbx-empty-title' }, t('emptyReader')),
                    h('div', { className: 'mbx-hint' }, t('readInPanel')),
                  )
                : h(
                    'div',
                    { className: 'mbx-reader' },
                    h(
                      'div',
                      { className: 'mbx-reader-head' },
                      h('div', { className: 'mbx-reader-subject' }, message.subject || t('noSubject')),
                      h(
                        'div',
                        { className: 'mbx-reader-meta' },
                        h('div', null, t('from') + '：' + (message.from?.name ? message.from.name + ' <' + message.from.address + '>' : message.from?.address || '')),
                        h('div', null, t('to') + '：' + (message.to || []).map((item) => item.address).join(', ')),
                        message.cc && message.cc.length > 0
                          ? h('div', null, t('cc') + '：' + message.cc.map((item) => item.address).join(', '))
                          : null,
                        h('div', null, formatWhen(message.date, t)),
                        h(
                          'div',
                          { style: { display: 'flex', gap: 8, marginTop: 8 } },
                          h('button', {
                            type: 'button',
                            className: 'mbx-btn',
                            onClick: () => startCompose('reply', message),
                          }, t('reply')),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'mbx-btn',
                              onClick: () => startCompose('forward', message),
                            },
                            '↗ ' + t('compose'),
                          ),
                        ),
                      ),
                      message.attachments.length > 0
                        ? h(
                            'div',
                            { className: 'mbx-attachments' },
                            ...message.attachments.map((file) =>
                              h(
                                'button',
                                {
                                  key: file.index,
                                  type: 'button',
                                  className: 'mbx-attach',
                                  title: t('download'),
                                  onClick: () => downloadAttachment(active.id, folder, message.uid, file),
                                },
                                '📎 ' + file.filename + ' · ' + formatSize(file.size),
                              ),
                            ),
                          )
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'mbx-reader-body' },
                      message.html
                        ? h('iframe', {
                            className: 'mbx-frame',
                            sandbox: '',
                            title: message.subject || 'mail',
                            srcDoc: frameDocument(message.html),
                          })
                        : h('pre', { className: 'mbx-text' }, message.text || ''),
                    ),
                  ),
        ),
      );

      const modals = [];

      if (addForm) {
        const provider = providers.find((item) => item.id === addForm.preset) || providers[0] || {};
        const loginKind = (provider.login && provider.login.kind) || 'none';
        const supportsQr = loginKind !== 'none';
        const mode = supportsQr ? addMode : 'password';
        const unsupported =
          (provider.login && provider.login.reason) === 'googleRestricted'
            ? t('unsupportedGoogle')
            : t('unsupportedWebOnly');
        modals.push(
          h(
            'div',
            {
              key: 'add',
              className: 'mbx-modal',
              onClick: () => {
                if (addForm.busy) return;
                cancelQr();
                setAddForm(null);
              },
            },
            h(
              'div',
              { className: 'mbx-modal-card', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'mbx-modal-title' },
                h('span', null, t('addAccount')),
                h('button', {
                  type: 'button',
                  className: 'mbx-link',
                  onClick: () => {
                    cancelQr();
                    setAddForm(null);
                  },
                }, '✕'),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('provider')),
                h(
                  'div',
                  { className: 'mbx-select-row' },
                  h('span', { className: 'mbx-select-icon' }, h(ProviderIcon, { preset: addForm.preset, size: 16 })),
                  h(
                    'select',
                    {
                      className: 'mbx-select',
                      value: addForm.preset,
                      onChange: (event) => {
                        cancelQr();
                        setAddForm({ ...addForm, preset: event.target.value, error: null });
                      },
                    },
                    ...providers.map((item) => h('option', { key: item.id, value: item.id }, item.label)),
                  ),
                ),
                provider.hint ? h('div', { className: 'mbx-hint' }, provider.hint) : null,
                supportsQr ? null : h('div', { className: 'mbx-hint' }, unsupported),
              ),
              supportsQr
                ? h(
                    'div',
                    { className: 'mbx-tabs' },
                    h('button', {
                      type: 'button',
                      className: 'mbx-tab' + (mode === 'qr' ? ' is-active' : ''),
                      onClick: () => {
                        cancelQr();
                        setAddMode('qr');
                      },
                    }, t('tabQr')),
                    h('button', {
                      type: 'button',
                      className: 'mbx-tab' + (mode === 'password' ? ' is-active' : ''),
                      onClick: () => {
                        cancelQr();
                        setAddMode('password');
                      },
                    }, t('tabPassword')),
                  )
                : null,
              mode === 'qr'
                ? h(
                    'div',
                    { className: 'mbx-qr-wrap' },
                    h('div', { className: 'mbx-hint' }, loginKind === 'lark' ? t('feishuHint') : t('oauthHint')),
                    qr && qr.status === 'waiting' && qr.src
                      ? h('img', { className: 'mbx-qr', src: qr.src, alt: 'QR' })
                      : null,
                    qr && qr.status === 'waiting' && qr.userCode
                      ? h(
                          'div',
                          { className: 'mbx-qr-code' },
                          h('span', { className: 'mbx-hint' }, t('userCodeLabel')),
                          h('strong', null, qr.userCode),
                        )
                      : null,
                    qr && qr.status === 'waiting' && qr.verificationUri
                      ? h(
                          'div',
                          { className: 'mbx-hint' },
                          t('openInBrowser'),
                          ' ',
                          h('a', { href: qr.verificationUri, target: '_blank', rel: 'noreferrer' }, qr.verificationUri),
                        )
                      : null,
                    qr && qr.status === 'waiting' ? h('div', { className: 'mbx-hint' }, t('qrWaiting')) : null,
                    qr && qr.status === 'starting' ? h('div', { className: 'mbx-hint' }, t('loading')) : null,
                    qr && (qr.status === 'error' || qr.status === 'expired')
                      ? h('div', { className: 'mbx-error' }, qr.error || t('qrFailed'))
                      : null,
                    h(
                      'div',
                      { style: { display: 'flex', gap: 8 } },
                      h('button', {
                        type: 'button',
                        className: 'mbx-btn is-primary',
                        onClick: () => startQrLogin(addForm.preset),
                        disabled: Boolean(qr) && (qr.status === 'waiting' || qr.status === 'starting'),
                      }, qr && (qr.status === 'waiting' || qr.status === 'expired') ? t('regenerate') : t('generateQr')),
                    ),
                  )
                : h(
                    React.Fragment,
                    null,
                    h(
                      'div',
                      { className: 'mbx-field' },
                      h('label', null, t('accountLabel')),
                      h('input', {
                        className: 'mbx-input',
                        value: addForm.label,
                        placeholder: t('accountLabelHint'),
                        onChange: (event) => setAddForm({ ...addForm, label: event.target.value }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'mbx-field' },
                      h('label', null, t('email')),
                      h('input', {
                        className: 'mbx-input',
                        value: addForm.email,
                        placeholder: 'you@example.com',
                        onChange: (event) => setAddForm({ ...addForm, email: event.target.value }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'mbx-field' },
                      h('label', null, t('password')),
                      h('input', {
                        className: 'mbx-input',
                        type: 'password',
                        value: addForm.password,
                        onChange: (event) => setAddForm({ ...addForm, password: event.target.value }),
                      }),
                      h('div', { className: 'mbx-hint' }, t('passwordHint')),
                    ),
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 } },
                      h(
                        'div',
                        { className: 'mbx-field' },
                        h('label', null, t('imapHost')),
                        h('input', {
                          className: 'mbx-input',
                          value: addForm.imapHost,
                          placeholder: (provider.imap && provider.imap.host) || 'imap.example.com',
                          onChange: (event) => setAddForm({ ...addForm, imapHost: event.target.value }),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'mbx-field' },
                        h('label', null, 'Port'),
                        h('input', {
                          className: 'mbx-input',
                          value: addForm.imapPort,
                          placeholder: String((provider.imap && provider.imap.port) || 993),
                          onChange: (event) => setAddForm({ ...addForm, imapPort: event.target.value }),
                        }),
                      ),
                    ),
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 } },
                      h(
                        'div',
                        { className: 'mbx-field' },
                        h('label', null, t('smtpHost')),
                        h('input', {
                          className: 'mbx-input',
                          value: addForm.smtpHost,
                          placeholder: (provider.smtp && provider.smtp.host) || 'smtp.example.com',
                          onChange: (event) => setAddForm({ ...addForm, smtpHost: event.target.value }),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'mbx-field' },
                        h('label', null, 'Port'),
                        h('input', {
                          className: 'mbx-input',
                          value: addForm.smtpPort,
                          placeholder: String((provider.smtp && provider.smtp.port) || 465),
                          onChange: (event) => setAddForm({ ...addForm, smtpPort: event.target.value }),
                        }),
                      ),
                    ),
                  ),
              mode === 'password' && addForm.error ? h('div', { className: 'mbx-error' }, addForm.error) : null,
              h(
                'div',
                { className: 'mbx-actions' },
                h('button', {
                  type: 'button',
                  className: 'mbx-btn',
                  onClick: () => {
                    cancelQr();
                    setAddForm(null);
                  },
                  disabled: addForm.busy,
                }, mode === 'qr' ? t('close') : t('cancel')),
                mode === 'password'
                  ? h('button', {
                      type: 'button',
                      className: 'mbx-btn is-primary',
                      onClick: submitAccount,
                      disabled: addForm.busy || !addForm.email || !addForm.password,
                    }, addForm.busy ? t('connecting') : t('connect'))
                  : null,
              ),
            ),
          ),
        );
      }

      if (compose) {
        modals.push(
          h(
            'div',
            { key: 'compose', className: 'mbx-modal', onClick: () => (compose.sending ? null : setCompose(null)) },
            h(
              'div',
              { className: 'mbx-modal-card', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'mbx-modal-title' },
                h('span', null, t('compose') + (active ? ' · ' + (active.label || active.email) : '')),
                h('button', { type: 'button', className: 'mbx-link', onClick: () => setCompose(null) }, '✕'),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('to')),
                h('input', {
                  className: 'mbx-input',
                  value: compose.to,
                  placeholder: 'a@example.com, b@example.com',
                  onChange: (event) => setCompose({ ...compose, to: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('cc')),
                h('input', {
                  className: 'mbx-input',
                  value: compose.cc,
                  onChange: (event) => setCompose({ ...compose, cc: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('subject')),
                h('input', {
                  className: 'mbx-input',
                  value: compose.subject,
                  onChange: (event) => setCompose({ ...compose, subject: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('body')),
                h('textarea', {
                  className: 'mbx-textarea',
                  value: compose.text,
                  onChange: (event) => setCompose({ ...compose, text: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'mbx-field' },
                h('label', null, t('attachments')),
                h(
                  'div',
                  { className: 'mbx-files' },
                  ...compose.attachments.map((file, index) =>
                    h(
                      'div',
                      { key: file.filename + index, className: 'mbx-file' },
                      h('span', null, '📎 ' + file.filename),
                      h('span', { className: 'mbx-hint' }, formatSize(file.size)),
                      h('span', { style: { flex: 1 } }),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'mbx-link',
                          onClick: () =>
                            setCompose({
                              ...compose,
                              attachments: compose.attachments.filter((_, i) => i !== index),
                            }),
                        },
                        t('remove'),
                      ),
                    ),
                  ),
                ),
                h(
                  'label',
                  { className: 'mbx-btn', style: { alignSelf: 'flex-start', cursor: 'pointer' } },
                  '＋ ' + t('addAttachment'),
                  h('input', {
                    type: 'file',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (event) => {
                      addFiles(event.target.files);
                      event.target.value = '';
                    },
                  }),
                ),
              ),
              compose.error ? h('div', { className: 'mbx-error' }, compose.error) : null,
              h(
                'div',
                { className: 'mbx-actions' },
                h('button', {
                  type: 'button',
                  className: 'mbx-btn',
                  onClick: () => setCompose(null),
                  disabled: compose.sending,
                }, t('cancel')),
                h('button', {
                  type: 'button',
                  className: 'mbx-btn is-primary',
                  onClick: submitCompose,
                  disabled: compose.sending,
                }, compose.sending ? t('sending') : t('send')),
              ),
            ),
          ),
        );
      }

      return h(
        'div',
        { className: 'mbx-root' + (resizing ? ' is-resizing' : '') },
        h('style', null, CSS),
        head,
        body,
        ...modals,
        toast
          ? h(
              'div',
              { className: 'mbx-toast', onClick: () => setToast(null) },
              h('div', { className: 'mbx-toast-title' }, toast.title),
              h('div', { className: 'mbx-toast-body' }, toast.body),
            )
          : null,
      );
    }

    /** HTML 邮件放进沙箱 iframe：禁脚本、禁外链资源，只允许 data: 图片。 */
    function frameDocument(html) {
      return (
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
        '<style>html,body{margin:0;padding:8px;font:13px/1.6 -apple-system,system-ui,sans-serif;color:#1f2328;word-break:break-word}' +
        'img{max-width:100%;height:auto}a{color:#0969da}</style></head><body>' +
        String(html || '') +
        '</body></html>'
      );
    }

    function downloadAttachment(accountId, folder, uid, file) {
      const url =
        API + '/attachment?account=' + encodeURIComponent(accountId) +
        '&folder=' + encodeURIComponent(folder) +
        '&uid=' + encodeURIComponent(uid) +
        '&index=' + encodeURIComponent(file.index);
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.blob();
        })
        .then((blob) => {
          const href = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.download = file.filename || 'attachment.bin';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(href), 4000);
        })
        .catch(() => {});
    }

    /* ------------------------------------------------------------ 图标注册 */

    function MailboxIcon(props) {
      const state = props.store.use();
      return h(MailIcon, { size: props.size || 16, unread: state.unread });
    }

    /* ------------------------------------------------------------ 插件定义 */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'mailbox: dictionaries');

        /* ---- 共享状态：未读数、账号、事件轮询（面板没打开也要跑） ---- */
        const store = {
          state: {
            accounts: [],
            providers: [],
            unread: 0,
            seq: 0,
            lastEvent: null,
            mailTick: 0,
            muted: false,
            loading: true,
            error: null,
          },
          listeners: new Set(),
          set(patch) {
            this.state = { ...this.state, ...patch };
            for (const listener of [...this.listeners]) listener();
          },
          use() {
            const [, force] = React.useState(0);
            React.useEffect(() => {
              const listener = () => force((n) => n + 1);
              this.listeners.add(listener);
              return () => this.listeners.delete(listener);
            }, []);
            return this.state;
          },
          async refreshAccounts() {
            try {
              const data = await api('/accounts');
              const unread = (data.accounts || []).reduce(
                (sum, account) => sum + Number((account.status && account.status.unread) || 0),
                0,
              );
              this.set({ accounts: data.accounts || [], providers: data.providers || [], unread, loading: false, error: null });
            } catch (error) {
              this.set({ loading: false, error: error.message });
            }
          },
          setMuted(muted) {
            try {
              window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
            } catch {
              /* ignore */
            }
            this.set({ muted });
          },
        };

        try {
          store.state.muted = window.localStorage.getItem(MUTE_KEY) === '1';
        } catch {
          store.state.muted = false;
        }

        const chime = createChime();

        ctx.effect(() => {
          let stopped = false;
          const tick = async () => {
            await store.refreshAccounts();
            while (!stopped) {
              try {
                const response = await fetch(
                  API + '/events?after=' + store.state.seq + '&timeout=25000',
                );
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const data = await response.json();
                if (stopped) return;
                // 宿主重启后 seq 会从头计数；host 半对「游标比当前大」按 0 处理。
                const seq = Number(data.seq) || 0;
                if (seq !== store.state.seq) store.set({ seq });
                const events = data.events || [];
                for (const event of events) {
                  if (event.type !== 'mail') continue;
                  if (!store.state.muted) chime();
                  store.set({ lastEvent: event, mailTick: store.state.mailTick + 1 });
                }
                if (events.length > 0) await store.refreshAccounts();
              } catch {
                if (stopped) return;
                await new Promise((resolve) => setTimeout(resolve, 4000));
              }
            }
          };
          tick().catch(() => {});
          return () => {
            stopped = true;
          };
        }, 'mailbox: account sync loop');

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              locale: NS,
              label: () => t('panel'),
            },
            (props) => h(MailboxIcon, { ...props, store }),
          ),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            { name: 'main', key: PANEL_ID, locale: NS },
            (props) => h(MailboxPage, { ...props, store, t }),
          ),
        );
      },
    };
  },
});
