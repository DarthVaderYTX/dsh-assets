/**
 * 最小 SMTP 客户端：EHLO、STARTTLS、AUTH PLAIN/LOGIN、发一封信。
 *
 * 只依赖 node:net / node:tls。
 */

import net from 'node:net';
import tls from 'node:tls';

export class SmtpError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'SmtpError';
    Object.assign(this, extra);
  }
}

export class SmtpClient {
  constructor(options) {
    this.options = options;
    this.buffer = '';
    this.waiters = [];
    this.closed = false;
    this.capabilities = [];
    this.secured = false;
  }

  get secureMode() {
    return this.options.secure === undefined ? 'starttls' : this.options.secure;
  }

  async connect() {
    const { host, rejectUnauthorized } = this.options;
    const mode = this.secureMode;
    const port = this.options.port || (mode === 'tls' ? 465 : 587);
    const timeout = this.options.timeout || 20000;

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new SmtpError('连接 SMTP 超时：' + host + ':' + port)), timeout);

      if (mode === 'tls') {
        this.socket = tls.connect(
          { host, port, servername: host, rejectUnauthorized: rejectUnauthorized !== false },
          () => {
            this.secured = true;
            finish();
          },
        );
      } else {
        this.socket = net.connect({ host, port }, () => finish());
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
        this.failWaiters(new SmtpError('SMTP 连接已关闭'));
      });
    });

    const greeting = await this.readResponse();
    if (greeting.code !== 220) throw new SmtpError('SMTP 握手失败：' + greeting.lines.join(' '));
    await this.ehlo();
    if (mode === 'starttls' && this.capabilities.includes('STARTTLS')) {
      await this.startTls();
      await this.ehlo();
    }
    return this;
  }

  async startTls() {
    await this.command('STARTTLS', [220]);
    const { host, rejectUnauthorized } = this.options;
    await new Promise((resolve, reject) => {
      const plain = this.socket;
      plain.removeAllListeners('data');
      const secured = tls.connect(
        { socket: plain, servername: host, rejectUnauthorized: rejectUnauthorized !== false },
        () => resolve(),
      );
      secured.on('error', reject);
      this.socket = secured;
      this.buffer = '';
      this.socket.on('data', (chunk) => this.onData(chunk));
      this.socket.on('error', (error) => {
        this.closed = true;
        this.failWaiters(error);
      });
      this.socket.on('close', () => {
        this.closed = true;
        this.failWaiters(new SmtpError('SMTP 连接已关闭'));
      });
    });
    this.secured = true;
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
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

  /** 读一条（可能多行的）SMTP 响应，直到 `NNN ` 形式的最后一行。 */
  readResponse() {
    return new Promise((resolve, reject) => {
      const waiter = {
        tryRead: () => {
          const lines = [];
          let consumed = 0;
          for (;;) {
            const index = this.buffer.indexOf('\r\n', consumed);
            if (index === -1) return 'need-more';
            const line = this.buffer.slice(consumed, index);
            consumed = index + 2;
            lines.push(line);
            if (/^\d{3}(?: |$)/.test(line)) {
              this.buffer = this.buffer.slice(consumed);
              return { code: Number(line.slice(0, 3)), lines };
            }
          }
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
    if (this.closed) throw new SmtpError('SMTP 连接已关闭');
    await new Promise((resolve, reject) => {
      this.socket.write(text, 'utf8', (error) => (error ? reject(error) : resolve()));
    });
  }

  async command(line, expected) {
    await this.write(line + '\r\n');
    const response = await this.readResponse();
    if (expected !== undefined && !expected.includes(response.code)) {
      throw new SmtpError('SMTP 命令被拒：' + line.split(' ')[0] + ' → ' + response.lines.join(' '), {
        code: response.code,
      });
    }
    return response;
  }

  async ehlo() {
    const response = await this.command('EHLO dsh-mailbox', [250]);
    this.capabilities = response.lines
      .slice(1)
      .map((line) => line.slice(4).trim().toUpperCase())
      .filter(Boolean);
    return this.capabilities;
  }

  async authenticate(user, password) {
    if (this.capabilities.some((line) => line.startsWith('AUTH') && line.includes('PLAIN'))) {
      const token = Buffer.from('\u0000' + user + '\u0000' + password, 'utf8').toString('base64');
      await this.command('AUTH PLAIN ' + token, [235]);
      return 'PLAIN';
    }
    await this.command('AUTH LOGIN', [334]);
    await this.command(Buffer.from(user, 'utf8').toString('base64'), [334]);
    await this.command(Buffer.from(password, 'utf8').toString('base64'), [235]);
    return 'LOGIN';
  }

  /**
   * 发一封信。raw 是完整 RFC 822 字节（CRLF 行尾）。
   * @param {{from: string, to: string[], raw: Buffer}} message
   */
  async send(message) {
    await this.command('MAIL FROM:<' + message.from + '>', [250]);
    for (const recipient of message.to) {
      await this.command('RCPT TO:<' + recipient + '>', [250, 251]);
    }
    await this.command('DATA', [354]);
    await this.write(dotStuff(message.raw) + '\r\n.\r\n');
    const response = await this.readResponse();
    if (response.code !== 250) throw new SmtpError('SMTP 投递失败：' + response.lines.join(' '));
    return response.lines[0];
  }

  async quit() {
    try {
      if (!this.closed) await this.command('QUIT', [221]);
    } catch {
      /* ignore */
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

/** SMTP 行首的点要双写；正文必须以 CRLF 结尾。 */
export function dotStuff(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const normalized = text.replace(/\r?\n/g, '\r\n');
  const stuffed = normalized.replace(/(^|\r\n)\./g, '$1..');
  return stuffed.endsWith('\r\n') ? stuffed.slice(0, -2) : stuffed;
}
