/**
 * Locale and display-resource checks for the client bundle: every visible
 * string key must exist in both dictionaries, the dictionaries must stay in
 * sync, plugin metadata must parse, and the detail document/icon must be
 * present and self-contained.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const source = readFileSync(path.join(ROOT, 'client.js'), 'utf8');

/**
 * Evaluate one dictionary literal from client.js.
 * @param {'EN'|'ZH'} name dictionary name.
 * @returns {Record<string, string>} parsed dictionary.
 */
function dictionary(name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} dictionary exists`);
  const end = source.indexOf('\n    };', start);
  assert.ok(end > start, `${name} dictionary terminates`);
  const objectText = source.slice(start + `const ${name} = `.length, end + '\n    };'.length - 1);
  return new Function(`return (${objectText});`)();
}

const EN = dictionary('EN');
const ZH = dictionary('ZH');

test('both dictionaries define the same keys', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort());
  assert.ok(Object.keys(EN).length > 180, 'dictionaries stay substantial');
});

test('every translation key used by the panel exists in both dictionaries', () => {
  const used = new Set();
  for (const match of source.matchAll(/\bt\('([^']+)'\)/g)) used.add(match[1]);
  for (const match of source.matchAll(/\bt\(`([^`$]+)`\)/g)) used.add(match[1]);
  const families = {
    'trend.': ['uptrend', 'downtrend', 'sideways'],
    'signal.': ['bullish', 'neutral', 'bearish'],
    'momentum.': ['positive', 'negative', 'flat'],
    'volatility.': ['low', 'moderate', 'high'],
    'state.': ['open', 'closed', 'simulated', 'pre', 'post'],
    'preset.': ['gainers', 'losers', 'momentum', 'oversold', 'overbought', 'volatile'],
    'alert.': ['price_above', 'price_below', 'change_pct_above', 'change_pct_below', 'rsi_above', 'rsi_below', 'ma_cross', 'volume_spike'],
    'settings.provider.': ['auto', 'synthetic', 'yahoo'],
    'confidence.': ['low', 'medium', 'high'],
  };
  for (const [prefix, suffixes] of Object.entries(families)) {
    for (const suffix of suffixes) used.add(`${prefix}${suffix}`);
  }
  for (const provider of ['auto', 'synthetic', 'yahoo']) used.add(`settings.provider.${provider}.hint`);
  const missingEn = [...used].filter((key) => !(key in EN));
  const missingZh = [...used].filter((key) => !(key in ZH));
  assert.deepEqual(missingEn, [], 'keys missing from en');
  assert.deepEqual(missingZh, [], 'keys missing from zh');
});

test('plugin metadata locales are complete and point at existing documents', () => {
  const en = JSON.parse(readFileSync(path.join(ROOT, 'locale', 'en.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(path.join(ROOT, 'locale', 'zh.json'), 'utf8'));
  for (const locale of [en, zh]) {
    assert.ok(locale.meta.title, 'meta.title');
    assert.ok(locale.meta.description.length > 80, 'meta.description explains the plugin');
    assert.ok(locale.meta.detail.endsWith('.md'), 'meta.detail is a markdown path');
    const detail = path.join(ROOT, locale.meta.detail);
    assert.ok(existsSync(detail), `${locale.meta.detail} exists`);
    const lines = readFileSync(detail, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1, `${locale.meta.detail} contains exactly one image line`);
    const match = lines[0].match(/^!\[(.+)\]\((preview\.svg)\)$/);
    assert.ok(match, `${locale.meta.detail} references preview.svg with alt text`);
    assert.ok(match[1].trim().length > 10, 'preview alt text is meaningful');
    assert.ok(existsSync(path.join(ROOT, 'docs', 'preview.svg')), 'preview.svg exists');
  }
});

test('client dictionaries localize the panel shell', () => {
  for (const [name, dict] of [['en', EN], ['zh', ZH]]) {
    for (const key of ['panel', 'watchlist', 'analysis', 'alerts', 'portfolio', 'screener', 'settings.title', 'boot.failed']) {
      assert.ok(dict[key] && dict[key].trim() !== '', `${name} has ${key}`);
    }
  }
  assert.equal(EN.panel, 'MarketMonitor');
  assert.equal(ZH.panel, 'MarketMonitor');
  assert.notEqual(EN['settings.title'], ZH['settings.title']);
});

test('display assets are valid self-contained SVGs inside the size limit', () => {
  for (const file of ['icon.svg', 'docs/preview.svg']) {
    const full = path.join(ROOT, file);
    assert.ok(existsSync(full), `${file} exists`);
    const content = readFileSync(full, 'utf8');
    assert.ok(content.includes('<svg') && content.includes('</svg>'), `${file} is SVG`);
    assert.ok(!content.includes('<script'), `${file} has no scripts`);
    assert.ok(!content.includes('<foreignObject'), `${file} has no foreignObject`);
    assert.ok(!content.includes('<text'), `${file} has no text elements`);
    assert.ok(Buffer.byteLength(content) < 256 * 1024, `${file} stays small`);
  }
});
