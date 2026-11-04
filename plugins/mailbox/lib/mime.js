/**
 * MIME 解析与构造。
 *
 * 只用 node:buffer 与 TextDecoder，不依赖任何第三方库：插件要能被 loader 直接
 * `import()`，装不上 npm 依赖的机器也要能用。
 *
 * 对外接口：
 *   parseMessage(buffer) -> { headers, text, html, attachments, subject, from, ... }
 *   buildMessage({...})  -> Buffer（CRLF 行尾，可直接进 SMTP DATA）
 */

const CRLF = Buffer.from('\r\n', 'latin1');

/* ------------------------------------------------------------------ headers */

/** 展开折行（RFC 5322 §2.2.3）：以空白开头的续行接回上一行。 */
export function parseHeaders(text) {
  const headers = {};
  const raw = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') continue;
    if (/^[ \t]/.test(line) && raw.length > 0) {
      raw[raw.length - 1] += ' ' + line.trim();
      continue;
    }
    raw.push(line);
  }
  for (const entry of raw) {
    const colon = entry.indexOf(':');
    if (colon <= 0) continue;
    const name = entry.slice(0, colon).trim().toLowerCase();
    const value = entry.slice(colon + 1).trim();
    // 同名头（Received 等）保留多份，用数组；其余取第一份。
    if (headers[name] === undefined) headers[name] = value;
    else if (Array.isArray(headers[name])) headers[name].push(value);
    else headers[name] = [headers[name], value];
  }
  return { headers, raw };
}

function headerValue(headers, name) {
  const value = headers[name];
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

/** 拆 `type; a=b; c="d"`，参数名小写，去引号。 */
export function parseStructured(value) {
  const result = { value: '', params: {} };
  if (typeof value !== 'string') return result;
  const parts = splitParams(value);
  result.value = (parts.shift() || '').trim().toLowerCase();
  for (const piece of parts) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const key = piece.slice(0, eq).trim().toLowerCase();
    let val = piece.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1);
    result.params[key] = val;
  }
  return result;
}

/** 按分号切分，但跳过引号内的分号。 */
function splitParams(value) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '"' && value[i - 1] !== '\\') quoted = !quoted;
    if (ch === ';' && !quoted) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/* ------------------------------------------------------------ encoded words */

const CHARSET_ALIASES = {
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'gb2312': 'gbk',
  'gbk': 'gbk',
  'gb18030': 'gb18030',
  'big5': 'big5',
  'iso-8859-1': 'iso-8859-1',
  'latin1': 'iso-8859-1',
  'us-ascii': 'utf-8',
  'ascii': 'utf-8',
  'shift_jis': 'shift_jis',
  'sjis': 'shift_jis',
  'koi8-r': 'koi8-r',
  'windows-1252': 'windows-1252',
  'iso-8859-15': 'iso-8859-15',
};

function normalizeCharset(charset) {
  if (!charset) return 'utf-8';
  const key = String(charset).trim().toLowerCase().replace(/^"|"$/g, '');
  return CHARSET_ALIASES[key] || key;
}

export function decodeBytes(buffer, charset) {
  const label = normalizeCharset(charset);
  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}

const ENCODED_WORD = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

/** RFC 2047 编码词解码；相邻编码词之间的空白按规范丢弃。 */
export function decodeHeader(value) {
  if (typeof value !== 'string' || value.indexOf('=?') === -1) return value;
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(ENCODED_WORD, (match, charset, encoding, payload) => {
      try {
        let bytes;
        if (encoding.toLowerCase() === 'b') {
          bytes = Buffer.from(payload, 'base64');
        } else {
          const spaced = payload.replace(/_/g, ' ');
          const out = [];
          for (let i = 0; i < spaced.length; i += 1) {
            if (spaced[i] === '=' && /^[0-9a-fA-F]{2}$/.test(spaced.slice(i + 1, i + 3))) {
              out.push(parseInt(spaced.slice(i + 1, i + 3), 16));
              i += 2;
            } else {
              out.push(spaced.charCodeAt(i) & 0xff);
            }
          }
          bytes = Buffer.from(out);
        }
        return decodeBytes(bytes, charset);
      } catch {
        return match;
      }
    });
}

/** 单个编码词不超过 75 字符；按 UTF-8 字节切块，避免切断多字节字符。 */
export function encodeHeader(value) {
  const text = String(value ?? '');
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const chunks = [];
  let current = [];
  let size = 0;
  for (const char of text) {
    const bytes = Buffer.byteLength(char, 'utf8');
    // 每块 base64 后 <= 60 字符，留出 =?utf-8?B??= 的开销
    if (size + bytes > 45 && current.length > 0) {
      chunks.push(current.join(''));
      current = [];
      size = 0;
    }
    current.push(char);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current.join(''));
  return chunks
    .map((chunk) => '=?utf-8?B?' + Buffer.from(chunk, 'utf8').toString('base64') + '?=')
    .join('\r\n ');
}

/* -------------------------------------------------------------------- body */

const TRANSFER = {
  'base64': (buf) => Buffer.from(buf.toString('latin1').replace(/\s+/g, ''), 'base64'),
  'quoted-printable': decodeQuotedPrintable,
  '7bit': (buf) => buf,
  '8bit': (buf) => buf,
  'binary': (buf) => buf,
};

function decodeQuotedPrintable(buffer) {
  const text = buffer.toString('latin1').replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '=' && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
      out.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(text.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(out);
}

export function decodeTransfer(buffer, encoding) {
  const fn = TRANSFER[String(encoding || '').trim().toLowerCase()];
  return fn ? fn(buffer) : buffer;
}

/** 在第一个空行处切成头部与正文。 */
function splitEntity(buffer) {
  const crlf = buffer.indexOf(Buffer.from('\r\n\r\n', 'latin1'));
  const lf = buffer.indexOf(Buffer.from('\n\n', 'latin1'));
  let index;
  let skip;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    index = crlf;
    skip = 4;
  } else if (lf !== -1) {
    index = lf;
    skip = 2;
  } else {
    return { head: buffer.toString('latin1'), body: Buffer.alloc(0) };
  }
  return { head: buffer.slice(0, index).toString('latin1'), body: buffer.slice(index + skip) };
}

/** 按 boundary 切出各子部件（保留原始字节，后续递归解析）。 */
function splitMultipart(body, boundary) {
  const delimiter = Buffer.from('--' + boundary, 'latin1');
  const parts = [];
  let from = body.indexOf(delimiter);
  while (from !== -1) {
    const lineEnd = body.indexOf(CRLF, from);
    if (lineEnd === -1) break;
    const marker = body.slice(from + delimiter.length, lineEnd).toString('latin1').trim();
    if (marker.startsWith('--')) break; // 结束边界
    const start = lineEnd + 2;
    const next = body.indexOf(Buffer.from('\r\n--' + boundary, 'latin1'), start);
    if (next === -1) break;
    parts.push(body.slice(start, next));
    from = next + 2;
  }
  return parts;
}

const HTML_TAG = /<[^>]*>/g;

function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(HTML_TAG, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (m, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解析一封完整邮件。
 * @param {Buffer} buffer 原始 RFC 822 字节
 * @returns {{headers: object, text: string, html: string, attachments: Array<object>,
 *   subject: string, from: object, to: object[], cc: object[], date: number, messageId: string}}
 */
export function parseMessage(buffer) {
  const result = {
    headers: {},
    text: '',
    html: '',
    attachments: [],
    subject: '',
    from: { name: '', address: '' },
    to: [],
    cc: [],
    date: 0,
    messageId: '',
  };
  const { head, body } = splitEntity(buffer);
  const parsed = parseHeaders(head);
  result.headers = parsed.headers;

  const walk = (bufferPart) => {
    const { head: partHead, body: partBody } = splitEntity(bufferPart);
    const { headers } = parseHeaders(partHead);
    const type = parseStructured(headerValue(headers, 'content-type') || 'text/plain');
    const disposition = parseStructured(headerValue(headers, 'content-disposition'));
    const encoding = headerValue(headers, 'content-transfer-encoding');
    const filename = decodeHeader(disposition.params.filename || type.params.name || '');

    if (type.value.startsWith('multipart/') && type.params.boundary) {
      for (const child of splitMultipart(partBody, type.params.boundary)) walk(child);
      return;
    }

    if (type.value === 'message/rfc822') {
      const nested = parseMessage(partBody);
      result.attachments.push({
        filename: filename || 'message.eml',
        contentType: 'message/rfc822',
        size: partBody.length,
        content: partBody,
        inline: false,
      });
      if (!result.text) result.text = nested.text;
      return;
    }

    const decoded = decodeTransfer(partBody, encoding);
    const isAttachment = disposition.value === 'attachment' || (filename !== '' && type.value !== 'text/plain' && type.value !== 'text/html');
    if (isAttachment) {
      result.attachments.push({
        filename: filename || 'attachment.bin',
        contentType: type.value || 'application/octet-stream',
        size: decoded.length,
        content: decoded,
        inline: disposition.value === 'inline',
        contentId: headerValue(headers, 'content-id').replace(/^<|>$/g, ''),
      });
      return;
    }
    if (type.value === 'text/html') {
      result.html = result.html || decodeBytes(decoded, type.params.charset);
      return;
    }
    if (type.value === 'text/plain' || type.value === '') {
      result.text = result.text || decodeBytes(decoded, type.params.charset);
    }
  };

  walk(buffer);

  result.subject = decodeHeader(headerValue(result.headers, 'subject'));
  result.from = parseAddress(headerValue(result.headers, 'from'));
  result.to = parseAddressList(headerValue(result.headers, 'to'));
  result.cc = parseAddressList(headerValue(result.headers, 'cc'));
  const dateHeader = headerValue(result.headers, 'date');
  const parsedDate = Date.parse(dateHeader);
  result.date = Number.isFinite(parsedDate) ? parsedDate : 0;
  result.messageId = headerValue(result.headers, 'message-id');
  if (!result.text && result.html) result.text = htmlToText(result.html);
  return result;
}

/** `显示名 <a@b>` 或裸地址。 */
export function parseAddress(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    return { name: decodeHeader(name), address: match[2].trim() };
  }
  return { name: '', address: text };
}

export function parseAddressList(value) {
  if (!value) return [];
  const out = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of String(value)) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '<' && !quoted) depth += 1;
    else if (ch === '>' && !quoted) depth -= 1;
    else if (ch === ',' && !quoted && depth === 0) {
      if (current.trim()) out.push(parseAddress(current));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(parseAddress(current));
  return out;
}

export { htmlToText };

/* --------------------------------------------------------------- building */

function randomBoundary() {
  return '----dsh_mail_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function encodeBody(text) {
  const buffer = Buffer.from(String(text ?? ''), 'utf8');
  const base64 = buffer.toString('base64');
  const lines = base64.match(/.{1,76}/g) || [''];
  return lines.join('\r\n');
}

function headerBlock(lines) {
  return lines.join('\r\n') + '\r\n';
}

/**
 * 构造待发送邮件。
 * @param {{from: string, to: string[], cc?: string[], subject?: string,
 *   text?: string, html?: string,
 *   attachments?: Array<{filename: string, contentType?: string, content: Buffer|string}>}} input
 * @returns {Buffer}
 */
export function buildMessage(input) {
  const from = input.from;
  const to = input.to || [];
  const cc = input.cc || [];
  const headers = [];
  headers.push('From: ' + from);
  headers.push('To: ' + to.join(', '));
  if (cc.length > 0) headers.push('Cc: ' + cc.join(', '));
  headers.push('Subject: ' + encodeHeader(input.subject || ''));
  headers.push('Date: ' + new Date().toUTCString());
  headers.push('MIME-Version: 1.0');
  const domain = String(from).includes('@') ? String(from).split('@').pop() : 'localhost';
  headers.push(
    'Message-ID: <' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2) + '@' + domain + '>',
  );

  const attachments = input.attachments || [];
  const hasHtml = typeof input.html === 'string' && input.html !== '';
  const alt = randomBoundary();

  // 正文先组成 multipart/alternative：纯文本 +（可选）HTML。
  const alternatives = [];
  alternatives.push(
    Buffer.from(
      '--' + alt + '\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
        encodeBody(input.text || (hasHtml ? htmlToText(input.html) : '')) + '\r\n',
      'latin1',
    ),
  );
  if (hasHtml) {
    alternatives.push(
      Buffer.from(
        '--' + alt + '\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
          encodeBody(input.html) + '\r\n',
        'latin1',
      ),
    );
  }
  alternatives.push(Buffer.from('--' + alt + '--\r\n', 'latin1'));
  const body = Buffer.concat(alternatives);
  const bodyHeaders = ['Content-Type: multipart/alternative; boundary="' + alt + '"'];

  if (attachments.length === 0) {
    return Buffer.concat([Buffer.from(headerBlock(headers.concat(bodyHeaders)) + '\r\n', 'latin1'), body]);
  }

  const mixed = randomBoundary();
  const chunks = [
    Buffer.from(
      '--' + mixed + '\r\nContent-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n',
      'latin1',
    ),
    body,
  ];
  for (const file of attachments) {
    const name = encodeHeader(file.filename || 'attachment.bin');
    const contentType = file.contentType || 'application/octet-stream';
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content ?? ''), 'base64');
    const base64 = content.toString('base64').match(/.{1,76}/g) || [''];
    chunks.push(
      Buffer.from(
        '--' + mixed + '\r\nContent-Type: ' + contentType + '; name="' + name + '"\r\n' +
          'Content-Disposition: attachment; filename="' + name + '"\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' + base64.join('\r\n') + '\r\n',
        'latin1',
      ),
    );
  }
  chunks.push(Buffer.from('--' + mixed + '--\r\n', 'latin1'));

  const outer = headers.concat(['Content-Type: multipart/mixed; boundary="' + mixed + '"']);
  return Buffer.concat([Buffer.from(headerBlock(outer) + '\r\n', 'latin1'), ...chunks]);
}

/** 给界面上显示的摘要：去掉多余空白并截断。 */
export function previewText(text, limit = 140) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}
