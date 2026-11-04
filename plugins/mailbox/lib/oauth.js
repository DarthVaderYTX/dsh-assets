/**
 * 通用 OAuth 2.0 设备码（device authorization grant, RFC 8628）登录。
 *
 * 目前接的是 Microsoft 365 / Outlook：它家公开支持设备码，且 IMAP / SMTP 都能用
 * XOAUTH2 换来的 access token。飞书走自己的 lark-cli，不在这里。
 *
 * 整个流程不需要回调地址，也不需要在本地起端口：
 *   devicecode → 用户扫码/在浏览器输入 user_code → 轮询 token → refresh_token 长期保存
 */

export class OAuthError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'OAuthError';
    Object.assign(this, options);
  }
}

/** 微软那条线的默认参数；baseUrl 可被测试覆盖。 */
export const MICROSOFT = {
  id: 'microsoft',
  label: 'Microsoft 365 / Outlook',
  baseUrl: 'https://login.microsoftonline.com/common',
  clientId: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',
  scopes: [
    'offline_access',
    'openid',
    'profile',
    'email',
    'https://outlook.office.com/IMAP.AccessAsUser.All',
    'https://outlook.office.com/SMTP.Send',
  ],
};

/** 让测试能把端点指到本地假服务器。 */
export function resolveSpec(spec) {
  const base = process.env.MAILBOX_OAUTH_BASE || spec.baseUrl;
  return { ...spec, baseUrl: base.replace(/\/$/, '') };
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OAuthError('授权服务返回了非 JSON 响应（HTTP ' + response.status + '）');
  }
  if (!response.ok || data.error) {
    throw new OAuthError(data.error_description || data.error || 'HTTP ' + response.status, {
      code: data.error || 'http_' + response.status,
    });
  }
  return data;
}

/** RFC 8628 §3.2 */
export async function requestDeviceCode(spec) {
  const resolved = resolveSpec(spec);
  const data = await postForm(resolved.baseUrl + '/oauth2/v2.0/devicecode', {
    client_id: resolved.clientId,
    scope: resolved.scopes.join(' '),
  });
  if (!data.device_code || !data.user_code) throw new OAuthError('授权服务没有返回设备码');
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri || data.verification_url || ''),
    interval: Math.max(2, Number(data.interval) || 5),
    expiresIn: Number(data.expires_in) || 900,
    message: String(data.message || ''),
  };
}

/** 一轮轮询。pending / ok / denied / expired 由调用方决定下一次。 */
export async function pollDeviceToken(spec, deviceCode) {
  const resolved = resolveSpec(spec);
  try {
    const data = await postForm(resolved.baseUrl + '/oauth2/v2.0/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: resolved.clientId,
      device_code: deviceCode,
    });
    return { status: 'ok', token: toToken(data) };
  } catch (error) {
    const code = error.code;
    if (code === 'authorization_pending') return { status: 'pending' };
    if (code === 'slow_down') return { status: 'pending', slow: true };
    if (code === 'expired_token') return { status: 'expired' };
    if (code === 'authorization_declined' || code === 'access_denied') return { status: 'denied' };
    return { status: 'error', error: error.message };
  }
}

export async function refreshAccessToken(spec, refreshToken) {
  const resolved = resolveSpec(spec);
  try {
    const data = await postForm(resolved.baseUrl + '/oauth2/v2.0/token', {
      grant_type: 'refresh_token',
      client_id: resolved.clientId,
      refresh_token: refreshToken,
      scope: resolved.scopes.join(' '),
    });
    return toToken(data);
  } catch (error) {
    throw new OAuthError('刷新授权失败，请重新扫码登录：' + error.message, { code: error.code });
  }
}

function toToken(data) {
  if (!data.access_token) throw new OAuthError('授权服务没有返回 access_token');
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : '',
    idToken: data.id_token ? String(data.id_token) : '',
    // 提前 60 秒过期，避免边界上用到刚失效的 token
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 3600) * 1000 - 60000,
  };
}

/** 从 id_token 里读邮箱地址（微软会放在 preferred_username / upn / email）。 */
export function emailFromIdToken(idToken) {
  if (!idToken) return '';
  try {
    const payload = String(idToken).split('.')[1];
    if (!payload) return '';
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return String(json.preferred_username || json.upn || json.email || json.unique_name || '');
  } catch {
    return '';
  }
}

/**
 * XOAUTH2 的 SASL 初始响应：
 *   base64("user=" + 账号 + "\x01auth=Bearer " + token + "\x01\x01")
 */
export function xoauth2Payload(user, accessToken) {
  return Buffer.from('user=' + user + '\x01auth=Bearer ' + accessToken + '\x01\x01', 'utf8').toString('base64');
}
