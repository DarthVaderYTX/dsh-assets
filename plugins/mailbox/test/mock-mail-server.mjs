/**
 * 本地假邮件服务器：一个够用的 IMAP（明文）和一个够用的 SMTP。
 *
 * 只用于验证协议客户端，不追求规范完备：支持 LOGIN、LIST、SELECT、
 * UID SEARCH/FETCH/STORE、IDLE，以及 SMTP 的 EHLO/AUTH/DATA。默认账号
 * demo@example.com / secret。
 */

import net from 'node:net';

const CRLF = '\r\n';

function envelopeFor(entry) {
  const headers = headerMap(entry.raw.toString('utf8'));
  const quote = (value) => (value === undefined ? 'NIL' : '"' + String(value).replace(/["\\]/g, (m) => '\\' + m) + '"');
  const address = headers['from'] || 'demo@example.com';
  const match = address.match(/^(.*?)\s*<([^>]+)>/);
  const name = match ? match[1].trim().replace(/^"|"$/g, '') : '';
  const addr = match ? match[2].trim() : address.trim();
  const [mailbox, host] = addr.includes('@') ? addr.split('@') : [addr, 'example.com'];
  const toList = String(headers['to'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const toTuples = toList.map((item) => {
    const toMatch = item.match(/^(.*?)\s*<([^>]+)>/);
    const toAddr = toMatch ? toMatch[2].trim() : item;
    const [toMailbox, toHost] = toAddr.includes('@') ? toAddr.split('@') : [toAddr, 'example.com'];
    const toName = toMatch ? toMatch[1].trim() : '';
    return '(' + quote(toName) + ' NIL ' + quote(toMailbox) + ' ' + quote(toHost) + ')';
  });
  return (
    '(' + quote(headers['date']) + ' ' + quote(headers['subject']) + ' ' +
    '((' + quote(name) + ' NIL ' + quote(mailbox) + ' ' + quote(host) + ')) NIL NIL ' +
    '(' + toTuples.join(' ') + ') NIL NIL NIL ' + quote(headers['message-id']) + ')'
  );
}

function headerMap(raw) {
  const head = raw.split(/\r?\n\r?\n/)[0] || '';
  const map = {};
  let last = '';
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && last) {
      map[last] += ' ' + line.trim();
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    last = line.slice(0, colon).trim().toLowerCase();
    map[last] = line.slice(colon + 1).trim();
  }
  return map;
}

export function startMockMailServer(options = {}) {
  const state = {
    accounts: new Map([[options.user || 'demo@example.com', options.password || 'secret']]),
    boxes: new Map([['INBOX', []]]),
    uidNext: 1,
    listeners: new Set(),
  };

  const imapServer = net.createServer((socket) => handleImap(socket, state));
  const smtpServer = net.createServer((socket) => handleSmtp(socket, state));

  return new Promise((resolve) => {
    imapServer.listen(options.imapPort || 0, '127.0.0.1', () => {
      smtpServer.listen(options.smtpPort || 0, '127.0.0.1', () => {
        resolve({
          imapPort: imapServer.address().port,
          smtpPort: smtpServer.address().port,
          user: options.user || 'demo@example.com',
          password: options.password || 'secret',
          messages: state.boxes.get('INBOX'),
          /** 直接塞一封进收件箱，并唤醒所有 IDLE 连接。 */
          deliver(raw) {
            const entry = {
              uid: state.uidNext++,
              flags: new Set(),
              raw: Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8'),
              date: new Date(),
            };
            state.boxes.get('INBOX').push(entry);
            for (const listener of state.listeners) listener(state.boxes.get('INBOX').length);
            return entry;
          },
          close() {
            for (const listener of [...state.listeners]) listener(-1);
            state.listeners.clear();
            imapServer.close();
            smtpServer.close();
          },
        });
      });
    });
  });
}

function handleImap(socket, state) {
  let buffer = '';
  let authenticated = false;
  let selected = 'INBOX';
  let idleTag = null;

  const send = (text) => socket.write(text + CRLF);

  const listener = (count) => {
    // 真服务器在 IDLE 期间只推 EXISTS，不主动结束 IDLE：客户端必须自己发 DONE。
    if (!idleTag) return;
    if (count >= 0) send('* ' + count + ' EXISTS');
  };
  state.listeners.add(listener);
  socket.on('close', () => state.listeners.delete(listener));

  send('* OK [CAPABILITY IMAP4rev1 IDLE AUTH=PLAIN] mock ready');

  const handleLine = (line) => {
    if (idleTag && line.toUpperCase() === 'DONE') {
      const tag = idleTag;
      idleTag = null;
      send(tag + ' OK IDLE terminated');
      return;
    }
    const parts = line.match(/^(\S+) (.+)$/);
    if (!parts) {
      send('* BAD empty command');
      return;
    }
    const [, tag, rest] = parts;
    const upper = rest.toUpperCase();

    if (upper === 'CAPABILITY') {
      send('* CAPABILITY IMAP4rev1 IDLE AUTH=PLAIN');
      send(tag + ' OK CAPABILITY done');
      return;
    }
    if (upper.startsWith('LOGIN ')) {
      const match = rest.match(/^LOGIN (?:"([^"]*)"|(\S+)) (?:"([^"]*)"|(\S+))$/i);
      const user = match ? match[1] ?? match[2] : '';
      const pass = match ? match[3] ?? match[4] : '';
      if (state.accounts.get(user) === pass) {
        authenticated = true;
        send(tag + ' OK LOGIN done');
      } else {
        send(tag + ' NO [AUTHENTICATIONFAILED] invalid credentials');
      }
      return;
    }
    if (upper.startsWith('ID ')) {
      send('* ID ("name" "mock")');
      send(tag + ' OK ID done');
      return;
    }
    if (!authenticated) {
      send(tag + ' NO not authenticated');
      return;
    }
    if (upper.startsWith('LIST ')) {
      send('* LIST (\\HasNoChildren) "/" "INBOX"');
      send('* LIST (\\HasNoChildren \\Sent) "/" "Sent"');
      send(tag + ' OK LIST done');
      return;
    }
    if (upper === 'SELECT INBOX' || upper.startsWith('SELECT ')) {
      selected = rest.slice(7).replace(/"/g, '') || 'INBOX';
      const box = state.boxes.get(selected) || [];
      send('* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)');
      send('* ' + box.length + ' EXISTS');
      send('* OK [UIDVALIDITY 1] UIDs valid');
      send('* OK [UIDNEXT ' + state.uidNext + '] next uid');
      send(tag + ' OK [READ-WRITE] SELECT done');
      return;
    }
    if (upper.startsWith('UID SEARCH')) {
      const criteria = rest.slice(11).trim().toUpperCase();
      const box = state.boxes.get(selected) || [];
      let uids = box.map((entry) => entry.uid);
      if (criteria.includes('UNSEEN')) uids = box.filter((entry) => !entry.flags.has('\\Seen')).map((entry) => entry.uid);
      if (criteria.includes('ALL') || criteria === '') uids = box.map((entry) => entry.uid);
      send('* SEARCH ' + uids.join(' '));
      send(tag + ' OK SEARCH done');
      return;
    }
    if (upper.startsWith('UID FETCH')) {
      const match = rest.match(/^UID FETCH (\S+) \((.+)\)$/i);
      const box = state.boxes.get(selected) || [];
      if (!match) {
        send(tag + ' BAD bad fetch');
        return;
      }
      const set = match[1];
      const wants = match[2].toUpperCase();
      const entries = box.filter((entry) => {
        if (set === '1:*' || set.endsWith(':*')) return true;
        return set.split(',').map(Number).includes(entry.uid);
      });
      for (const entry of entries) {
        if (wants.includes('BODY')) {
          socket.write(
            '* ' + entry.uid + ' FETCH (UID ' + entry.uid + ' BODY[] {' + entry.raw.length + '}' + CRLF,
          );
          socket.write(entry.raw);
          socket.write(')' + CRLF);
        } else {
          const flags = entry.flags.size ? '(' + [...entry.flags].join(' ') + ')' : '()';
          send(
            '* ' + entry.uid + ' FETCH (UID ' + entry.uid + ' FLAGS ' + flags +
              ' INTERNALDATE "01-Jan-2026 00:00:00 +0800" RFC822.SIZE ' + entry.raw.length +
              ' ENVELOPE ' + envelopeFor(entry) + ')',
          );
        }
      }
      send(tag + ' OK FETCH done');
      return;
    }
    if (upper.startsWith('UID STORE')) {
      const match = rest.match(/^UID STORE (\d+) ([+-]?)FLAGS \((.*)\)$/i);
      if (match) {
        const uid = Number(match[1]);
        const mode = match[2] || '+';
        const flags = match[3].split(/\s+/).filter(Boolean);
        const entry = (state.boxes.get(selected) || []).find((item) => item.uid === uid);
        if (entry) {
          for (const flag of flags) {
            if (mode === '-') entry.flags.delete(flag.toUpperCase());
            else entry.flags.add(flag.toUpperCase());
          }
        }
      }
      send(tag + ' OK STORE done');
      return;
    }
    if (upper === 'IDLE') {
      idleTag = tag;
      send('+ idling');
      return;
    }
    if (upper === 'NOOP') {
      send(tag + ' OK NOOP done');
      return;
    }
    if (upper === 'LOGOUT') {
      send('* BYE logout');
      send(tag + ' OK LOGOUT done');
      socket.end();
      return;
    }
    send(tag + ' BAD unknown command: ' + rest.slice(0, 40));
  };

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    for (;;) {
      const index = buffer.indexOf(CRLF);
      if (index === -1) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      handleLine(line);
    }
  });
  socket.on('error', () => {});
}

function handleSmtp(socket, state) {
  let buffer = '';
  let dataMode = false;
  let data = '';
  let from = '';
  let recipients = [];
  let authenticated = false;
  let txn = [];

  const send = (text) => socket.write(text + CRLF);

  send('220 mock ESMTP');

  const handleLine = (line) => {
    if (dataMode) {
      if (line === '.') {
        dataMode = false;
        const raw = Buffer.from(data.replace(/\r\n\.\./g, '\r\n.'), 'utf8');
        const entry = {
          uid: state.uidNext++,
          flags: new Set(),
          raw,
          date: new Date(),
        };
        state.boxes.get('INBOX').push(entry);
        for (const listener of state.listeners) listener(state.boxes.get('INBOX').length);
        txn = [];
        data = '';
        send('250 2.0.0 queued as ' + entry.uid);
        return;
      }
      data += line + CRLF;
      return;
    }
    const upper = line.toUpperCase();
    if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
      send('250-mock');
      send('250-SIZE 10485760');
      send('250-8BITMIME');
      send('250-AUTH PLAIN LOGIN');
      send('250 OK');
      return;
    }
    if (upper.startsWith('AUTH PLAIN')) {
      const token = line.split(' ')[2] || '';
      const decoded = Buffer.from(token, 'base64').toString('utf8').split('\u0000');
      const user = decoded[1];
      const pass = decoded[2];
      if (state.accounts.get(user) === pass) {
        authenticated = true;
        send('235 2.7.0 accepted');
      } else {
        send('535 5.7.8 authentication failed');
      }
      return;
    }
    if (upper.startsWith('MAIL FROM')) {
      const match = line.match(/<([^>]*)>/);
      from = match ? match[1] : '';
      recipients = [];
      send('250 2.1.0 ok');
      return;
    }
    if (upper.startsWith('RCPT TO')) {
      const match = line.match(/<([^>]*)>/);
      if (match) recipients.push(match[1]);
      send('250 2.1.5 ok');
      return;
    }
    if (upper === 'DATA') {
      dataMode = true;
      send('354 go ahead');
      return;
    }
    if (upper === 'QUIT') {
      send('221 bye');
      socket.end();
      return;
    }
    if (upper === 'NOOP') {
      send('250 ok');
      return;
    }
    send('500 unknown');
  };

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const index = buffer.indexOf(CRLF);
      if (index === -1) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      handleLine(line);
    }
  });
  socket.on('error', () => {});
}
