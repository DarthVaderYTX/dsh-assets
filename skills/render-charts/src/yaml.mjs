/**
 * Zero-dependency YAML subset parser.
 *
 * Ported from the Python implementation in `scripts/charts/miniyaml.py` so the
 * skill decodes chart specs the same way under Node. Supported: block mappings
 * and sequences nested arbitrarily, plain / single-quoted / double-quoted
 * scalars, literal (`|`) and folded (`>`) block scalars with `-`/`+` chomping,
 * single-line flow collections, comments outside quotes, `---` and `...`
 * markers, BOM and CRLF input.
 *
 * Anchors, aliases, tags and multiple documents are rejected on purpose so a
 * malformed config fails loudly instead of being guessed.
 */

const NUMBER_RE = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/;
const INT_RE = /^[+-]?\d+$/;
const NULLS = new Set(['', '~', 'null', 'Null', 'NULL']);
const TRUE_WORDS = new Set(['true', 'True', 'TRUE', 'yes', 'Yes', 'YES', 'on', 'On', 'ON']);
const FALSE_WORDS = new Set(['false', 'False', 'FALSE', 'no', 'No', 'NO', 'off', 'Off', 'OFF']);
const BLOCK_HEADER_RE = /^([|>])([+-]?)([1-9]?)$/;
const DOUBLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\u0000', '\\': '\\', '"': '"' };
const WHITESPACE_RE = /\s/;

export class YamlError extends Error {
  constructor(message, line = null) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'YamlError';
    this.line = line ?? null;
  }
}

export function parseYaml(text) {
  if (typeof text !== 'string') throw new TypeError('parseYaml expects a string');
  return new Parser(text).parse();
}

// ---------------------------------------------------------------- helpers

/** Render a string the way Python's repr() does, for error messages. */
function repr(value) {
  const text = String(value);
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (char === '\\') out += '\\\\';
    else if (char === quote) out += `\\${char}`;
    else if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else out += char;
  }
  return out + quote;
}

function setKey(target, key, value) {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

function hasKey(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function stripComment(text) {
  let quote = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (quote) {
      if (quote === '"' && char === '\\') {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#' && (index === 0 || WHITESPACE_RE.test(text[index - 1]))) {
      return text.slice(0, index).trimEnd();
    }
    index += 1;
  }
  return text.trimEnd();
}

function codePointFromHex(hex) {
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new YamlError(`invalid hex escape in double-quoted scalar: ${repr(hex)}`);
  const codePoint = Number.parseInt(hex, 16);
  if (codePoint > 0x10ffff) throw new YamlError(`invalid code point in double-quoted scalar: ${repr(hex)}`);
  return String.fromCodePoint(codePoint);
}

function unescapeDouble(body) {
  try {
    return JSON.parse(`"${body}"`);
  } catch {
    // Tolerate YAML-only escapes that JSON rejects.
  }
  const out = [];
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char !== '\\') {
      out.push(char);
      index += 1;
      continue;
    }
    index += 1;
    if (index >= body.length) throw new YamlError('dangling backslash in double-quoted scalar');
    const code = body[index];
    if (code === 'x' && index + 2 < body.length + 1) {
      out.push(codePointFromHex(body.slice(index + 1, index + 3)));
      index += 3;
    } else if (code === 'u' && index + 4 < body.length + 1) {
      out.push(codePointFromHex(body.slice(index + 1, index + 5)));
      index += 5;
    } else {
      out.push(hasKey(DOUBLE_ESCAPES, code) ? DOUBLE_ESCAPES[code] : code);
      index += 1;
    }
  }
  return out.join('');
}

function decodeQuoted(text) {
  const stripped = text.trim();
  if (!stripped || (stripped[0] !== '"' && stripped[0] !== "'")) return stripped;
  const quote = stripped[0];
  const end = findQuoteEnd(stripped, 0);
  if (end === null) throw new YamlError('unterminated quoted scalar');
  const trailing = stripped.slice(end + 1).trim();
  if (trailing) throw new YamlError(`unexpected text after quoted scalar: ${repr(trailing)}`);
  const body = stripped.slice(1, end);
  if (quote === '"') return unescapeDouble(body);
  return body.split("''").join("'");
}

function findQuoteEnd(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (quote === '"' && char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) {
      if (quote === "'" && index + 1 < text.length && text[index + 1] === "'") {
        index += 2;
        continue;
      }
      return index;
    }
    index += 1;
  }
  return null;
}

function findPairColon(text) {
  let quote = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (quote) {
      if (quote === '"' && char === '\\') {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ':' && (index + 1 === text.length || text[index + 1] === ' ' || text[index + 1] === '\t')) {
      return index;
    }
    index += 1;
  }
  return -1;
}

function toScalar(text) {
  const stripped = stripComment(text).trim();
  if (!stripped) return null;
  if (stripped[0] === '"' || stripped[0] === "'") return decodeQuoted(stripped);
  if (NULLS.has(stripped)) return null;
  if (TRUE_WORDS.has(stripped)) return true;
  if (FALSE_WORDS.has(stripped)) return false;
  if (INT_RE.test(stripped)) return Number(stripped);
  if (NUMBER_RE.test(stripped)) return Number(stripped);
  if (stripped[0] === '&' || stripped[0] === '*' || stripped[0] === '!') {
    throw new YamlError(`anchors, aliases and tags are not supported: ${repr(stripped)}`);
  }
  return stripped;
}

function decodeKey(raw, lineIndex) {
  if (raw[0] === '&' || raw[0] === '*' || raw[0] === '!') {
    throw new YamlError(`anchors, aliases and tags are not supported: ${repr(raw)}`, lineIndex + 1);
  }
  if (raw[0] === '"' || raw[0] === "'") {
    try {
      return decodeQuoted(raw);
    } catch (error) {
      // The Python version attaches the line after construction, so the
      // message keeps its original form; mirror that here.
      if (error instanceof YamlError) error.line = error.line ?? lineIndex + 1;
      throw error;
    }
  }
  return raw;
}

// ------------------------------------------------------------ flow parser

class FlowParser {
  constructor(text, line) {
    this.text = text;
    this.pos = 0;
    this.line = line;
  }

  error(message) {
    return new YamlError(message, this.line);
  }

  skipWhitespace() {
    while (this.pos < this.text.length && (this.text[this.pos] === ' ' || this.text[this.pos] === '\t')) {
      this.pos += 1;
    }
  }

  parseValue() {
    this.skipWhitespace();
    if (this.pos >= this.text.length) throw this.error('unexpected end of flow collection');
    const char = this.text[this.pos];
    if (char === '{') return this.parseMapping();
    if (char === '[') return this.parseSequence();
    if (char === '"' || char === "'") {
      const end = findQuoteEnd(this.text, this.pos);
      if (end === null) throw this.error('unterminated quoted scalar');
      const raw = this.text.slice(this.pos, end + 1);
      this.pos = end + 1;
      return decodeQuoted(raw);
    }
    const start = this.pos;
    while (this.pos < this.text.length && !',]}'.includes(this.text[this.pos])) this.pos += 1;
    return toScalar(this.text.slice(start, this.pos));
  }

  parseMapping() {
    this.pos += 1; // {
    const result = {};
    this.skipWhitespace();
    if (this.pos < this.text.length && this.text[this.pos] === '}') {
      this.pos += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) throw this.error('unterminated flow mapping');
      let key;
      if (this.text[this.pos] === '"' || this.text[this.pos] === "'") {
        const end = findQuoteEnd(this.text, this.pos);
        if (end === null) throw this.error('unterminated quoted key');
        key = decodeQuoted(this.text.slice(this.pos, end + 1));
        this.pos = end + 1;
      } else {
        const start = this.pos;
        while (this.pos < this.text.length && !':,}'.includes(this.text[this.pos])) this.pos += 1;
        key = this.text.slice(start, this.pos).trim();
      }
      this.skipWhitespace();
      if (this.pos >= this.text.length || this.text[this.pos] !== ':') {
        throw this.error(`expected ':' after flow key ${repr(key)}`);
      }
      this.pos += 1;
      setKey(result, key, this.parseValue());
      this.skipWhitespace();
      if (this.pos < this.text.length && this.text[this.pos] === ',') {
        this.pos += 1;
        this.skipWhitespace();
        if (this.pos < this.text.length && this.text[this.pos] === '}') {
          this.pos += 1;
          return result;
        }
        continue;
      }
      if (this.pos < this.text.length && this.text[this.pos] === '}') {
        this.pos += 1;
        return result;
      }
      throw this.error("expected ',' or '}' in flow mapping");
    }
  }

  parseSequence() {
    this.pos += 1; // [
    const result = [];
    this.skipWhitespace();
    if (this.pos < this.text.length && this.text[this.pos] === ']') {
      this.pos += 1;
      return result;
    }
    for (;;) {
      result.push(this.parseValue());
      this.skipWhitespace();
      if (this.pos < this.text.length && this.text[this.pos] === ',') {
        this.pos += 1;
        this.skipWhitespace();
        if (this.pos < this.text.length && this.text[this.pos] === ']') {
          this.pos += 1;
          return result;
        }
        continue;
      }
      if (this.pos < this.text.length && this.text[this.pos] === ']') {
        this.pos += 1;
        return result;
      }
      throw this.error("expected ',' or ']' in flow sequence");
    }
  }
}

// ------------------------------------------------------------ block parser

class Parser {
  constructor(text) {
    if (text.startsWith('\ufeff')) text = text.slice(1);
    this.raw = text.replace(/\r\n?/g, '\n').split('\n');
    this.i = 0;
  }

  error(message, index = null) {
    return new YamlError(message, (index === null ? this.i : index) + 1);
  }

  static blank(raw) {
    const stripped = raw.trim();
    return !stripped || stripped.startsWith('#');
  }

  indent(raw) {
    const leading = raw.slice(0, raw.length - raw.trimStart(' \t').length);
    if (leading.includes('\t')) throw this.error('tabs are not allowed for indentation');
    return leading.length;
  }

  line() {
    const raw = this.raw[this.i];
    const indent = this.indent(raw);
    return [indent, raw.slice(indent).trimEnd()];
  }

  skip() {
    while (this.i < this.raw.length && Parser.blank(this.raw[this.i])) this.i += 1;
  }

  skipDirectives() {
    while (this.i < this.raw.length) {
      const stripped = this.raw[this.i].trim();
      if (!stripped || stripped.startsWith('#') || stripped.startsWith('%')) {
        this.i += 1;
        continue;
      }
      break;
    }
  }

  // --------------------------------------------------------------- parse

  parse() {
    this.skipDirectives();
    if (this.i >= this.raw.length) return {};
    if (this.raw[this.i].trim() === '---') {
      this.i += 1;
      this.skipDirectives();
      if (this.i >= this.raw.length) return {};
    }
    const [indent] = this.line();
    const value = this.parseBlock(indent);
    this.skip();
    if (this.i < this.raw.length && this.raw[this.i].trim() === '...') {
      this.i += 1;
      this.skip();
    }
    if (this.i < this.raw.length) {
      if (this.raw[this.i].trim() === '---') throw this.error('multiple YAML documents are not supported');
      throw this.error('unexpected content');
    }
    return value;
  }

  parseBlock(indent) {
    this.skip();
    if (this.i >= this.raw.length) return null;
    const [current, content] = this.line();
    if (current < indent) return null;
    if (current > indent) throw this.error(`unexpected indentation (expected ${indent} spaces)`);
    if (content === '-' || content.startsWith('- ')) return this.parseSequence(indent);
    if (content[0] === '[' || content[0] === '{') {
      this.i += 1;
      return this.parseFlow(content, this.i - 1);
    }
    return this.parseMapping(indent);
  }

  parseSequence(indent) {
    const result = [];
    for (;;) {
      this.skip();
      if (this.i >= this.raw.length) break;
      const [current, content] = this.line();
      if (current < indent) break;
      if (current > indent) throw this.error(`unexpected indentation in sequence (expected ${indent} spaces)`);
      if (!(content === '-' || content.startsWith('- '))) break;
      const lineIndex = this.i;
      const restRaw = content.slice(1);
      const rest = restRaw.replace(/^ +/, '');
      const keyIndent = indent + 1 + (restRaw.length - rest.length);
      this.i += 1;

      let item;
      if (!rest || rest.startsWith('#')) {
        this.skip();
        if (this.i < this.raw.length) {
          const [nextIndent] = this.line();
          item = nextIndent > indent ? this.parseBlock(nextIndent) : null;
        } else {
          item = null;
        }
      } else if (rest[0] === '|' || rest[0] === '>') {
        item = this.blockScalar(indent, rest, lineIndex);
      } else if (rest[0] === '[' || rest[0] === '{') {
        item = this.parseFlow(rest, lineIndex);
      } else {
        const colon = findPairColon(rest);
        if (colon !== -1) {
          const key = decodeKey(rest.slice(0, colon).trim(), lineIndex);
          const valueText = rest.slice(colon + 1).trimStart();
          const entry = {};
          setKey(entry, key, this.parseValue(valueText, keyIndent, lineIndex));
          item = this.parseMapping(keyIndent, entry);
        } else {
          item = toScalar(rest);
        }
      }
      result.push(item);
    }
    return result;
  }

  parseMapping(indent, initial = null) {
    const result = {};
    if (initial) {
      for (const key of Object.keys(initial)) setKey(result, key, initial[key]);
    }
    for (;;) {
      this.skip();
      if (this.i >= this.raw.length) break;
      const [current, content] = this.line();
      if (current < indent) break;
      if (current > indent) throw this.error(`unexpected indentation in mapping (expected ${indent} spaces)`);
      if (content === '-' || content.startsWith('- ')) {
        throw this.error('sequence item is not valid where a mapping key was expected');
      }
      const lineIndex = this.i;
      const colon = findPairColon(content);
      if (colon === -1) throw this.error("expected 'key: value'");
      const key = decodeKey(content.slice(0, colon).trim(), lineIndex);
      if (!key) throw this.error('empty mapping key', lineIndex);
      const valueText = content.slice(colon + 1).trimStart();
      this.i += 1;
      const value = this.parseValue(valueText, indent, lineIndex);
      if (hasKey(result, key)) throw this.error(`duplicate mapping key ${repr(key)}`, lineIndex);
      setKey(result, key, value);
    }
    return result;
  }

  parseValue(valueText, parentIndent, lineIndex) {
    let stripped = valueText.trim();
    if (stripped.startsWith('#')) stripped = '';
    if (!stripped) {
      this.skip();
      if (this.i < this.raw.length) {
        const [nextIndent] = this.line();
        if (nextIndent > parentIndent) return this.parseBlock(nextIndent);
      }
      return null;
    }
    if (stripped[0] === '|' || stripped[0] === '>') {
      return this.blockScalar(parentIndent, stripComment(stripped), lineIndex);
    }
    if (stripped[0] === '[' || stripped[0] === '{') return this.parseFlow(stripped, lineIndex);
    return toScalar(stripped);
  }

  parseFlow(text, lineIndex) {
    // Strip a trailing comment only when it is outside quotes.
    const cleaned = stripComment(text).trim();
    const parser = new FlowParser(cleaned, lineIndex + 1);
    const value = parser.parseValue();
    parser.skipWhitespace();
    if (parser.pos !== cleaned.length) {
      throw this.error('unexpected text after flow collection', lineIndex);
    }
    return value;
  }

  blockScalar(parentIndent, header, lineIndex) {
    const match = BLOCK_HEADER_RE.exec(header.trim());
    if (!match) throw this.error(`invalid block scalar header ${repr(header)}`, lineIndex);
    const style = match[1];
    const chomp = match[2];
    const explicitIndent = match[3] ? Number(match[3]) : null;

    const blockLines = [];
    const nonblankIndents = [];
    while (this.i < this.raw.length) {
      const raw = this.raw[this.i];
      if (raw.trim() === '') {
        blockLines.push('');
        this.i += 1;
        continue;
      }
      const current = this.indent(raw);
      if (current <= parentIndent) break;
      blockLines.push(raw);
      nonblankIndents.push(current);
      this.i += 1;
    }

    if (!blockLines.length) return '';
    let contentIndent;
    if (nonblankIndents.length) {
      const minIndent = Math.min(...nonblankIndents);
      contentIndent = explicitIndent ? parentIndent + explicitIndent : minIndent;
      if (minIndent < contentIndent) throw this.error('block scalar line is less indented than the block', lineIndex);
    } else {
      contentIndent = parentIndent + (explicitIndent || 1);
    }

    const body = [];
    for (const raw of blockLines) {
      if (raw.trim() === '') {
        body.push('');
        continue;
      }
      const current = this.indent(raw);
      if (current < contentIndent) throw this.error('inconsistent indentation in block scalar', lineIndex);
      body.push(raw.slice(contentIndent));
    }

    let text;
    if (style === '|') {
      text = body.join('\n');
    } else {
      const pieces = [];
      for (const bodyLine of body) {
        if (bodyLine === '') {
          pieces.push('\n');
          continue;
        }
        if (pieces.length && !pieces[pieces.length - 1].endsWith('\n') && !pieces[pieces.length - 1].endsWith(' ')) {
          pieces.push(' ');
        }
        pieces.push(bodyLine);
      }
      text = pieces.join('');
    }

    if (chomp === '-') return text.replace(/\n+$/, '');
    if (chomp === '+') return text;
    const trimmed = text.replace(/\n+$/, '');
    return trimmed ? `${trimmed}\n` : '';
  }
}
