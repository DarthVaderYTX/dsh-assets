/**
 * 最小 IMAP4rev1 客户端：登录、列邮箱、取最近邮件、取原文、改已读、IDLE。
 *
 * 只依赖 node:net / node:tls。刻意不做通用：只覆盖收发邮件要用到的那部分
 * 命令，响应解析也只处理 FETCH / SEARCH / LIST / SELECT / IDLE 的结果。
 */

import net from 'node:net';
import tls from 'node:tls';

export class ImapError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'ImapError';
    Object.assign(this, extra);
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `04-Nov-2026 12:00:00 +0800` → epoch ms。 */
export function parseImapDate(text) {
  if (typeof text !== 'string') return 0;
  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!match) {
    const fallback = Date.parse(text);
    return Number.isFinite(fallback) ? fallback : 0;
  }
  const [, day, mon, year, hour, min, sec, sign, offHour, offMin] = match;
  const month = MONTHS.indexOf(mon[0].toUpperCase() + mon.slice(1).toLowerCase());
  const utc = Date.UTC(Number(year), month < 0 ? 0 : month, Number(day), Number(hour), Number(min), Number(sec));
  const offset = (Number(offHour) * 60 + Number(offMin)) * 60000 * (sign === '-' ? -1 : 1);
  return utc - offset;
}

/* ---------------------------------------------------------------- parsing */

/** IMAP 值语法：括号列表、带引号字符串、NIL、原子。 */
export function parseImapValue(text) {
  let index = 0;
  const skip = () => {
    while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index += 1;
  };
  const parse = () => {
    skip();
    const ch = text[index];
    if (ch === '(') {
      index += 1;
      const list = [];
      for (;;) {
        skip();
        if (index >= text.length) return list;
        if (text[index] === ')') {
          index += 1;
          return list;
        }
        list.push(parse());
      }
    }
    if (ch === '"') {
      index += 1;
      let out = '';
      while (index < text.length) {
        const c = text[index];
        index += 1;
        if (c === '\\') {
          out += text[index];
          index += 1;
          continue;
        }
        if (c === '"') return out;
        out += c;
      }
      return out;
    }
    if (ch === '{') {
      const end = text.indexOf('}', index);
      const token = text.slice(index, end + 1);
      index = end + 1;
      return token;
    }
    let atom = '';
    while (index < text.length && !' ()\r\n'.includes(text[index])) {
      atom += text[index];
      index += 1;
    }
    if (atom.toUpperCase() === 'NIL') return null;
    return atom;
  };
  const out = [];
  for (;;) {
    skip();
    if (index >= text.length) break;
    out.push(parse());
  }
  return out;
}

function addressFromTuple(tuple) {
  if (!Array.isArray(tuple)) return { name: '', address: '' };
  const [name, , mailbox, host] = tuple;
  const address = host ? String(mailbox || '') + '@' + String(host) : String(mailbox || '');
  return { name: decodeMimeWord(name), address };
}

function decodeMimeWord(value) {
  if (typeof value !== 'string' || value.indexOf('=?') === -1) return value || '';
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (match, charset, encoding, payload) => {
    try {
      const bytes =
        encoding.toLowerCase() === 'b'
          ? Buffer.from(payload, 'base64')
          : Buffer.from(payload.replace(/_/g, ' '), 'latin1');
      return new TextDecoder(String(charset).toLowerCase() === 'gb2312' ? 'gbk' : String(charset), {
        fatal: false,
      }).decode(bytes);
    } catch {
      return match;
    }
  });
}

/** 把 `* 3 FETCH (...)` 的括号内容映射成对象。 */
export function parseFetchAttributes(text) {
  const raw = parseImapValue(text);
  // 整体是一个括号组时 parseImapValue 会多包一层，先剥掉。
  const tokens = raw.length === 1 && Array.isArray(raw[0]) ? raw[0] : raw;
  const attributes = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const key = String(tokens[i]).toUpperCase();
    if (key === 'BODY[' || key.startsWith('BODY[')) {
      attributes.body = tokens[i + 1];
      i += 1;
      continue;
    }
    const value = tokens[i + 1];
    i += 1;
    attributes[key] = value;
  }
  return attributes;
}

/** IMAP 的修改版 UTF-7 文件夹名解码（`&V4NXPpCuTvY-` → 中文）。 */
export function decodeUtf7(name) {
  if (typeof name !== 'string' || name.indexOf('&') === -1) return name;
  return name.replace(/&([^-]*)-/g, (match, chunk) => {
    if (chunk === '') return '&';
    try {
      const raw = Buffer.from(chunk.replace(/,/g, '/'), 'base64');
      let out = '';
      for (let i = 0; i + 1 < raw.length; i += 2) out += String.fromCharCode(raw.readUInt16BE(i));
      return out;
    } catch {
      return match;
    }
  });
}

/** 从 ENVELOPE 抽摘要字段。 */
export function envelopeToSummary(envelope) {
  if (!Array.isArray(envelope)) return { subject: '', from: { name: '', address: '' }, to: [], date: 0, messageId: '' };
  const [date, subject, from, , , to] = envelope;
  return {
    subject: decodeMimeWord(subject || '(无主题)'),
    from: addressFromTuple(Array.isArray(from) ? from[0] : from),
    to: Array.isArray(to) ? to.map(addressFromTuple) : [],
    date: Date.parse(date || '') || 0,
    messageId: String(envelope[9] || ''),
  };
}

/* ----------------------------------------------------------------- client */

export class ImapClient {
  constructor(options) {
    this.options = options;
    this.tag = 0;
    this.pending = '';
    this.literals = [];
    this.waiters = [];
    this.closed = false;
    this.capabilities = [];
    this.idleTag = null;
  }

  get secureMode() {
    return this.options.secure === undefined ? 'tls' : this.options.secure;
  }

  async connect() {
    const { host, port, rejectUnauthorized } = this.options;
    const timeout = this.options.timeout || 20000;
    const mode = this.secureMode;
    const targetPort = port || (mode === 'plain' ? 143 : 993);

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new ImapError('连接 IMAP 超时：' + host + ':' + targetPort)), timeout);

      if (mode === 'tls') {
        this.socket = tls.connect(
          { host, port: targetPort, servername: host, rejectUnauthorized: rejectUnauthorized !== false },
          () => finish(),
        );
      } else {
        this.socket = net.connect({ host, port: targetPort }, () => finish());
      }
      this.socket.setNoDelay(true);
      this.socket.setTimeout(0);
      this.socket.on('data', (chunk) => this.onData(chunk));
      this.socket.on('error', (error) => {
        this.closed = true;
        finish(error);
        this.failWaiters(error);
      });
      this.socket.on('close', () => {
        this.closed = true;
        this.failWaiters(new ImapError('IMAP 连接已关闭'));
      });
    });

    if (mode === 'starttls') {
      await this.startTls();
    }
    const greeting = await this.readLine();
    if (!/^\* OK/i.test(greeting)) throw new ImapError('IMAP 握手失败：' + greeting);
  }

  async startTls() {
    await this.command('STARTTLS');
    const { host } = this.options;
    await new Promise((resolve, reject) => {
      const plain = this.socket;
      plain.removeAllListeners('data');
      const secured = tls.connect(
        { socket: plain, servername: host, rejectUnauthorized: this.options.rejectUnauthorized !== false },
        () => resolve(),
      );
      secured.on('error', reject);
      this.socket = secured;
      this.pending = '';
      this.socket.on('data', (chunk) => this.onData(chunk));
      this.socket.on('error', (error) => {
        this.closed = true;
        this.failWaiters(error);
      });
      this.socket.on('close', () => {
        this.closed = true;
        this.failWaiters(new ImapError('IMAP 连接已关闭'));
      });
    });
  }

  onData(chunk) {
    this.pending += chunk.toString('latin1');
    this.flush();
  }

  flush() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0];
      const outcome = waiter.tryRead();
      if (outcome === 'need-more') return;
      this.waiters.shift();
      waiter.resolve(outcome);
    }
  }

  readLine() {
    return new Promise((resolve, reject) => {
      const waiter = {
        tryRead: () => {
          const index = this.pending.indexOf('\r\n');
          if (index === -1) return 'need-more';
          const line = this.pending.slice(0, index);
          this.pending = this.pending.slice(index + 2);
          return line;
        },
        resolve,
        reject,
      };
      this.waiters.push(waiter);
      this.flush();
    });
  }

  readBytes(count) {
    return new Promise((resolve, reject) => {
      const waiter = {
        tryRead: () => {
          if (Buffer.byteLength(this.pending, 'latin1') < count) return 'need-more';
          const head = Buffer.from(this.pending.slice(0, count), 'latin1');
          this.pending = this.pending.slice(count);
          return head;
        },
        resolve,
        reject,
      };
      this.waiters.push(waiter);
      this.flush();
    });
  }

  failWaiters(error) {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  async write(text) {
    if (this.closed) throw new ImapError('IMAP 连接已关闭');
    await new Promise((resolve, reject) => {
      this.socket.write(text, 'latin1', (error) => (error ? reject(error) : resolve()));
    });
  }

  /**
   * 发一条命令并收集到 tagged 响应为止。
   * 行尾的 `{N}` 字面量会被读入并把占位符替换成 `<literal i>`。
   */
  async command(command, options = {}) {
    const tag = 'A' + (this.tag += 1);
    await this.write(tag + ' ' + command + '\r\n');
    const lines = [];
    const literals = [];
    for (;;) {
      let line = await this.readLine();
      const literal = line.match(/\{(\d+)\}$/);
      if (literal) {
        const data = await this.readBytes(Number(literal[1]));
        literals.push(data);
        const rest = await this.readLine();
        line = line.slice(0, literal.index) + '\u0000lit' + (literals.length - 1) + '\u0000' + rest;
      }
      lines.push(line);
      if (line.startsWith(tag + ' ')) {
        const status = line.slice(tag.length + 1);
        const ok = /^OK/i.test(status);
        if (!ok && !options.allowFailure) {
          throw new ImapError('IMAP 命令失败：' + command + ' → ' + status);
        }
        return { tag, status, ok, lines, literals };
      }
      if (/^\* BYE/i.test(line)) throw new ImapError('IMAP 服务端断开：' + line);
    }
  }

  async login(user, password) {
    const quotedUser = JSON.stringify(user);
    const quotedPass = JSON.stringify(password);
    try {
      return await this.command('LOGIN ' + quotedUser + ' ' + quotedPass);
    } catch (error) {
      if (this.capabilities.includes('AUTH=PLAIN')) {
        return this.authenticatePlain(quotedUser, quotedPass);
      }
      throw error;
    }
  }

  async authenticatePlain(user, password) {
    const tag = 'A' + (this.tag += 1);
    await this.write(tag + ' AUTHENTICATE PLAIN\r\n');
    await this.readLine(); // + 
    await this.write(Buffer.from('\u0000' + user + '\u0000' + password, 'utf8').toString('base64') + '\r\n');
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(tag + ' ')) {
        if (!/^OK/i.test(line.slice(tag.length + 1))) throw new ImapError('IMAP AUTHENTICATE 失败：' + line);
        return line;
      }
    }
  }

  async capability() {
    const { lines } = await this.command('CAPABILITY');
    for (const line of lines) {
      if (/^\* CAPABILITY/i.test(line)) {
        this.capabilities = line.replace(/^\* CAPABILITY /i, '').toUpperCase().split(' ');
      }
    }
    return this.capabilities;
  }

  /** RFC 2971：部分服务商（163/126）要求先报身份才允许 IMAP。 */
  async sendId(params = { name: 'dsh-mailbox', version: '1.0', vendor: 'deepseek-harness' }) {
    if (!this.capabilities.includes('ID')) return false;
    const body = '(' + Object.entries(params).map(([key, value]) => '"' + key + '" "' + value + '"').join(' ') + ')';
    await this.command('ID ' + body, { allowFailure: true });
    return true;
  }

  async list() {
    const { lines } = await this.command('LIST "" "*"');
    const boxes = [];
    for (const line of lines) {
      const match = line.match(/^\* LIST \(([^)]*)\) ("(?:[^"\\]|\\.)*"|NIL) (.+)$/i);
      if (!match) continue;
      let name = match[3].trim();
      if (name.startsWith('"')) name = JSON.parse(name.replace(/\\"/g, '"'));
      boxes.push({
        name,
        display: decodeUtf7(name),
        flags: match[1],
        separator: match[2] === 'NIL' ? '/' : match[2].replace(/"/g, ''),
      });
    }
    return boxes;
  }

  async select(mailbox, options = {}) {
    const name = mailbox === 'INBOX' ? 'INBOX' : '"' + mailbox.replace(/"/g, '\\"') + '"';
    const verb = options.readOnly ? 'EXAMINE ' : 'SELECT ';
    const { lines } = await this.command(verb + name, { allowFailure: true });
    const info = { exists: 0, uidNext: 1, uidValidity: 0, readOnly: Boolean(options.readOnly) };
    for (const line of lines) {
      const exists = line.match(/^\* (\d+) EXISTS/i);
      if (exists) info.exists = Number(exists[1]);
      const ok = line.match(/^\* OK \[UIDNEXT (\d+)\]/i);
      if (ok) info.uidNext = Number(ok[1]);
      const validity = line.match(/^\* OK \[UIDVALIDITY (\d+)\]/i);
      if (validity) info.uidValidity = Number(validity[1]);
    }
    return info;
  }

  async search(criteria) {
    const { lines } = await this.command('UID SEARCH ' + criteria, { allowFailure: true });
    const uids = [];
    for (const line of lines) {
      const match = line.match(/^\* SEARCH(.*)$/i);
      if (!match) continue;
      for (const token of match[1].trim().split(/\s+/)) {
        if (/^\d+$/.test(token)) uids.push(Number(token));
      }
    }
    return uids;
  }

  /** 取一批 UID 的摘要（ENVELOPE + FLAGS + 大小）。 */
  async fetchEnvelopes(uids) {
    if (uids.length === 0) return [];
    const set = uids.join(',');
    const { lines } = await this.command(
      'UID FETCH ' + set + ' (UID FLAGS INTERNALDATE RFC822.SIZE ENVELOPE)',
      { allowFailure: true },
    );
    const out = [];
    for (const line of lines) {
      const match = line.match(/^\* \d+ FETCH ([\s\S]*)$/i);
      if (!match) continue;
      const attributes = parseFetchAttributes(match[1]);
      const summary = envelopeToSummary(attributes.ENVELOPE);
      const flags = Array.isArray(attributes.FLAGS) ? attributes.FLAGS.map(String) : [];
      out.push({
        uid: Number(attributes.UID || 0),
        flags,
        seen: flags.some((flag) => flag.toUpperCase() === '\\SEEN'),
        size: Number(attributes['RFC822.SIZE'] || 0),
        date: summary.date || parseImapDate(attributes.INTERNALDATE),
        subject: summary.subject,
        from: summary.from,
        to: summary.to,
        messageId: summary.messageId,
      });
    }
    return out;
  }

  /** 取整封原文（BODY.PEEK 不改变已读状态）。 */
  async fetchRaw(uid, maxBytes = 25 * 1024 * 1024) {
    const { lines, literals } = await this.command('UID FETCH ' + uid + ' (BODY.PEEK[])', { allowFailure: true });
    if (literals.length === 0) throw new ImapError('邮件正文为空（uid ' + uid + '）');
    const body = literals[0];
    if (body.length > maxBytes) throw new ImapError('邮件超过 ' + Math.round(maxBytes / 1048576) + 'MB，未下载');
    return body;
  }

  async setFlags(uid, flags, mode = '+') {
    const list = '(' + flags.map((flag) => (flag.startsWith('\\') ? flag : '\\' + flag)).join(' ') + ')';
    await this.command('UID STORE ' + uid + ' ' + mode + 'FLAGS ' + list, { allowFailure: true });
  }

  /* ------------------------------------------------------------------ IDLE */

  async idleStart() {
    const tag = 'A' + (this.tag += 1);
    this.idleTag = tag;
    await this.write(tag + ' IDLE\r\n');
    const line = await this.readLine();
    if (!line.startsWith('+')) throw new ImapError('IMAP 不支持 IDLE：' + line);
  }

  /**
   * 等待 IDLE 期间的服务器推送。
   * @param {number} maxMs 最长等待，超时后自行 DONE
   * @returns {Promise<{exists: number|undefined, expunge: boolean, aborted: boolean}>}
   */
  async idleWait(maxMs) {
    const result = { exists: undefined, expunge: false, aborted: false };
    const deadline = Date.now() + maxMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        result.aborted = true;
        break;
      }
      const line = await this.withTimeout(this.readLine(), remaining);
      if (line === null) {
        result.aborted = true;
        break;
      }
      const exists = line.match(/^\* (\d+) EXISTS/i);
      if (exists) {
        result.exists = Number(exists[1]);
        break;
      }
      if (/^\* \d+ EXPUNGE/i.test(line)) result.expunge = true;
    }
    await this.idleDone();
    return result;
  }

  async idleDone() {
    if (!this.idleTag) return;
    const tag = this.idleTag;
    this.idleTag = null;
    await this.write('DONE\r\n');
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(tag + ' ')) return line;
    }
  }

  withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, ms);
      promise.then(
        (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async logout() {
    try {
      if (!this.closed) await this.command('LOGOUT', { allowFailure: true });
    } catch {
      /* 断开时忽略 */
    }
    this.close();
  }

  close() {
    this.closed = true;
    try {
      this.socket?.destroy();
    } catch {
      /* ignore */
    }
  }
}
