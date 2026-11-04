/**
 * 常见邮箱服务商的 IMAP / SMTP 预设，以及各家能不能「扫码登录」。
 *
 * login.kind：
 *   lark        飞书：lark-cli 设备码授权，Open API 收发信（不需要 IMAP）
 *   device-code OAuth 设备码：扫固定二维码 + 输一次性代码，拿到 refresh_token 后走 IMAP/SMTP 的 XOAUTH2
 *   none        只能用户名 + 应用专用密码：这些家的「扫码」是网页登录态，换不到 IMAP 凭据
 */

export const PROVIDERS = {
  feishu: {
    label: '飞书邮箱',
    imap: { host: 'imap.feishu.cn', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.feishu.cn', port: 465, secure: 'tls' },
    hint: '在飞书邮箱设置里开启 IMAP/SMTP 并生成专用密码。',
    login: { kind: 'lark' },
  },
  'qq': {
    label: 'QQ 邮箱',
    imap: { host: 'imap.qq.com', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.qq.com', port: 465, secure: 'tls' },
    hint: '设置 → 账户 → 开启 IMAP/SMTP，使用生成的授权码而非登录密码。',
    login: { kind: 'none', reason: 'webOnly' },
  },
  '163': {
    label: '网易 163',
    imap: { host: 'imap.163.com', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.163.com', port: 465, secure: 'tls' },
    hint: '需要在设置中开启 IMAP/SMTP，并使用客户端授权密码。',
    login: { kind: 'none', reason: 'webOnly' },
  },
  gmail: {
    label: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: 'tls' },
    hint: '需要先开启两步验证，再用「应用专用密码」。',
    // Google 的设备码授权只对「电视与受限输入设备」这类客户端开放，邮件类受限 scope 拿不到。
    login: { kind: 'none', reason: 'googleRestricted' },
  },
  outlook: {
    label: 'Outlook / Microsoft 365',
    imap: { host: 'outlook.office365.com', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.office365.com', port: 587, secure: 'starttls' },
    hint: '租户若禁用了基本认证，应用密码也无法登录；扫码登录走 OAuth，不受这条限制。',
    login: {
      kind: 'device-code',
      spec: 'microsoft',
    },
  },
  aliyun: {
    label: '阿里云邮箱',
    imap: { host: 'imap.aliyun.com', port: 993, secure: 'tls' },
    smtp: { host: 'smtp.aliyun.com', port: 465, secure: 'tls' },
    hint: '使用邮箱设置里开启 IMAP/SMTP 后的客户端密码。',
    login: { kind: 'none', reason: 'webOnly' },
  },
  custom: {
    label: '自定义',
    imap: { host: '', port: 993, secure: 'tls' },
    smtp: { host: '', port: 465, secure: 'tls' },
    hint: '手动填写 IMAP / SMTP 主机与端口。',
  },
};

export function resolveProvider(preset) {
  return PROVIDERS[preset] || PROVIDERS.custom;
}
