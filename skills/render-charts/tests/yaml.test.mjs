import test from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml, YamlError } from '../src/yaml.mjs';

/** Run a parser call that must fail and return its error. */
function capture(parse) {
  try {
    parse();
  } catch (error) {
    return error;
  }
  assert.fail('expected the parser to throw');
}

test('parses block mappings and nested blocks', () => {
  const value = parseYaml(`
title: 检索接口 P95 延迟
subtitle: 按周统计 · 2026 年 6–9 月
x:
  title: 周
  labels: [W23, W24, W25]
y:
  title: P95 延迟
  unit: 毫秒
width: 760
`);
  assert.equal(value.title, '检索接口 P95 延迟');
  assert.equal(value.subtitle, '按周统计 · 2026 年 6–9 月');
  assert.deepEqual(value.x, { title: '周', labels: ['W23', 'W24', 'W25'] });
  assert.deepEqual(value.y, { title: 'P95 延迟', unit: '毫秒' });
  assert.equal(value.width, 760);
});

test('parses mappings nested three levels deep', () => {
  const value = parseYaml(`
a:
  b:
    c:
      - 1
      - 2
`);
  assert.deepEqual(value, { a: { b: { c: [1, 2] } } });
});

test('parses block sequences of scalars', () => {
  const value = parseYaml(`
labels:
  - Q1
  - Q2
  - Q3
empty:
`);
  assert.deepEqual(value.labels, ['Q1', 'Q2', 'Q3']);
  assert.equal(value.empty, null);
});

test('parses sequence items that open with a mapping key', () => {
  const value = parseYaml(`
series:
  - name: 月活
    type: area
    smooth: true
    data: [312, 318, 330]
  - name: DAU
    type: line
    data: [1, 2]
`);
  assert.deepEqual(value, {
    series: [
      { name: '月活', type: 'area', smooth: true, data: [312, 318, 330] },
      { name: 'DAU', type: 'line', data: [1, 2] },
    ],
  });
});

test('parses nested blocks under the key that opens a sequence item', () => {
  const value = parseYaml(`
annotations:
  - type: rule
    y: 150
    options:
      dashed: true
  - type: vband
    from: 2026-08-10
    to: 2026-08-24
`);
  assert.deepEqual(value.annotations, [
    { type: 'rule', y: 150, options: { dashed: true } },
    { type: 'vband', from: '2026-08-10', to: '2026-08-24' },
  ]);
});

test('parses empty sequence items that hold a nested mapping', () => {
  const value = parseYaml(`
list:
  -
    a: 1
  - b
`);
  assert.deepEqual(value.list, [{ a: 1 }, 'b']);
});

test('decodes single-quoted, double-quoted and escaped scalars', () => {
  const value = parseYaml(`
single: 'it''s fine'
double: "line\\nbreak"
tab: "a\\tb"
unicode: "\\u4e2d\\u6587"
escaped_quote: "say \\"hi\\""
backslash: "c:\\\\temp"
yaml_only_escape: "\\e"
padded: "  spaced  "
empty_double: ""
empty_single: ''
`);
  assert.equal(value.single, "it's fine");
  assert.equal(value.double, 'line\nbreak');
  assert.equal(value.tab, 'a\tb');
  assert.equal(value.unicode, '中文');
  assert.equal(value.escaped_quote, 'say "hi"');
  assert.equal(value.backslash, 'c:\\temp');
  assert.equal(value.yaml_only_escape, 'e');
  assert.equal(value.padded, '  spaced  ');
  assert.equal(value.empty_double, '');
  assert.equal(value.empty_single, '');
});

test('parses quoted mapping keys', () => {
  const value = parseYaml(`
"a b": 1
'c: d': 2
`);
  assert.deepEqual(value, { 'a b': 1, 'c: d': 2 });
});

test('parses flow sequences including nesting and trailing commas', () => {
  const value = parseYaml(`
labels: [2025-09, "2025 Q4", 3, true, null]
matrix: [[1, 2], [3, 4]]
pairs: [["2026-06-01", 118], ["2026-06-15", 121]]
trailing: [1, 2,]
empty: []
`);
  assert.deepEqual(value.labels, ['2025-09', '2025 Q4', 3, true, null]);
  assert.deepEqual(value.matrix, [[1, 2], [3, 4]]);
  assert.deepEqual(value.pairs, [['2026-06-01', 118], ['2026-06-15', 121]]);
  assert.deepEqual(value.trailing, [1, 2]);
  assert.deepEqual(value.empty, []);
});

test('parses flow mappings including nesting and trailing commas', () => {
  const value = parseYaml(`
object: {a: 1, b: [2, 3], c: {d: "e, f"}}
trailing: {x: 1,}
empty: {}
`);
  assert.deepEqual(value.object, { a: 1, b: [2, 3], c: { d: 'e, f' } });
  assert.deepEqual(value.trailing, { x: 1 });
  assert.deepEqual(value.empty, {});
});

test('parses a top-level flow collection', () => {
  assert.deepEqual(parseYaml('[1, 2, 3]\n'), [1, 2, 3]);
  assert.deepEqual(parseYaml('{a: 1, b: two}\n'), { a: 1, b: 'two' });
});

test('strips comments that sit outside quotes', () => {
  const value = parseYaml(`
# leading comment
title: 收入  # trailing comment
note: a#b
quoted: "a # b"
list:
  - 1  # one
  # comment between items
  - 2
flow: {x: 1} # after flow
`);
  assert.equal(value.title, '收入');
  assert.equal(value.note, 'a#b');
  assert.equal(value.quoted, 'a # b');
  assert.deepEqual(value.list, [1, 2]);
  assert.deepEqual(value.flow, { x: 1 });
});

test('parses literal block scalars with chomping', () => {
  const value = parseYaml(`
literal: |
  line one
  line two
stripped: |-
  no newline
kept: |+
  keep

after: 1
`);
  assert.equal(value.literal, 'line one\nline two\n');
  assert.equal(value.stripped, 'no newline');
  assert.equal(value.kept, 'keep\n');
  assert.equal(value.after, 1);
});

test('parses folded block scalars with chomping', () => {
  const value = parseYaml(`
folded: >
  one
  two
  three
stripped: >-
  no newline
kept: >+
  keep

after: 1
`);
  assert.equal(value.folded, 'one two three\n');
  assert.equal(value.stripped, 'no newline');
  assert.equal(value.kept, 'keep\n');
  assert.equal(value.after, 1);
});

test('parses block scalars as sequence items and with indentation indicators', () => {
  const value = parseYaml(`
list:
  - |
    hello
  - world
indicated: |2
  first
  second
`);
  assert.deepEqual(value.list, ['hello\n', 'world']);
  assert.equal(value.indicated, 'first\nsecond\n');
});

test('recognises numbers, booleans and null', () => {
  const value = parseYaml(`
int: 42
negative: -7
plus: +5
float: 0.032
leading_dot: .5
trailing_dot: 1.
exponent: 1.5e3
true_lower: true
true_title: True
true_upper: TRUE
yes_word: yes
on_word: on
false_lower: false
false_upper: FALSE
no_word: no
off_word: off
null_tilde: ~
null_word: null
null_empty:
quoted_number: "42"
date: 2026-09-01
version: 1.2.3
`);
  assert.deepEqual(value, {
    int: 42,
    negative: -7,
    plus: 5,
    float: 0.032,
    leading_dot: 0.5,
    trailing_dot: 1,
    exponent: 1500,
    true_lower: true,
    true_title: true,
    true_upper: true,
    yes_word: true,
    on_word: true,
    false_lower: false,
    false_upper: false,
    no_word: false,
    off_word: false,
    null_tilde: null,
    null_word: null,
    null_empty: null,
    quoted_number: '42',
    date: '2026-09-01',
    version: '1.2.3',
  });
});

test('accepts a UTF-8 BOM and CRLF line endings', () => {
  const value = parseYaml('\ufefftitle: 收入\r\nseries:\r\n  - name: 华东\r\n    data: [1, 2]\r\n');
  assert.deepEqual(value, { title: '收入', series: [{ name: '华东', data: [1, 2] }] });
});

test('accepts document markers and directives', () => {
  assert.deepEqual(parseYaml('---\ntitle: 收入\n'), { title: '收入' });
  assert.deepEqual(parseYaml('- 1\n- 2\n...\n'), [1, 2]);
  assert.deepEqual(parseYaml('%YAML 1.2\n---\na: 1\n'), { a: 1 });
});

test('returns an empty object for an empty document', () => {
  assert.deepEqual(parseYaml(''), {});
  assert.deepEqual(parseYaml('# just a comment\n\n'), {});
  assert.deepEqual(parseYaml('---\n'), {});
});

test('rejects duplicate mapping keys with a line number', () => {
  const error = capture(() => parseYaml('title: a\ntitle: b\n'));
  assert.ok(error instanceof YamlError);
  assert.equal(error.line, 2);
  assert.equal(error.message, "line 2: duplicate mapping key 'title'");
});

test('rejects duplicate keys inside a sequence item mapping', () => {
  const error = capture(() => parseYaml('- name: a\n  name: b\n'));
  assert.ok(error instanceof YamlError);
  assert.equal(error.line, 2);
  assert.equal(error.message, "line 2: duplicate mapping key 'name'");
});

test('rejects unexpected indentation', () => {
  const mappingError = capture(() => parseYaml('a: 1\n  b: 2\n'));
  assert.equal(mappingError.message, 'line 2: unexpected indentation in mapping (expected 0 spaces)');

  const sequenceError = capture(() => parseYaml('list:\n  - a\n   - b\n'));
  assert.equal(sequenceError.message, 'line 3: unexpected indentation in sequence (expected 2 spaces)');
});

test('rejects tab indentation', () => {
  const error = capture(() => parseYaml('a:\n\tb: 1\n'));
  assert.equal(error.message, 'line 2: tabs are not allowed for indentation');
});

test('rejects anchors, aliases and tags', () => {
  const anchor = capture(() => parseYaml('a: &anchor 1\n'));
  assert.ok(anchor instanceof YamlError);
  assert.equal(anchor.line, null);
  assert.equal(anchor.message, "anchors, aliases and tags are not supported: '&anchor 1'");

  const alias = capture(() => parseYaml('a: *ref\n'));
  assert.equal(alias.message, "anchors, aliases and tags are not supported: '*ref'");

  const tag = capture(() => parseYaml('a: !!str 1\n'));
  assert.equal(tag.message, "anchors, aliases and tags are not supported: '!!str 1'");

  const key = capture(() => parseYaml('&anchored: 1\n'));
  assert.equal(key.line, 1);
  assert.equal(key.message, "line 1: anchors, aliases and tags are not supported: '&anchored'");
});

test('rejects multiple YAML documents', () => {
  const error = capture(() => parseYaml('- 1\n- 2\n---\n- 3\n'));
  assert.ok(error instanceof YamlError);
  assert.equal(error.line, 3);
  assert.equal(error.message, 'line 3: multiple YAML documents are not supported');
});

test('reports unterminated quotes and trailing text', () => {
  const unterminated = capture(() => parseYaml('a: "x\n'));
  assert.ok(unterminated instanceof YamlError);
  assert.equal(unterminated.line, null);
  assert.equal(unterminated.message, 'unterminated quoted scalar');

  const trailing = capture(() => parseYaml('a: "x" y\n'));
  assert.equal(trailing.message, "unexpected text after quoted scalar: 'y'");

  const flow = capture(() => parseYaml('a: [1, 2\n'));
  assert.equal(flow.message, "line 1: expected ',' or ']' in flow sequence");

  const afterFlow = capture(() => parseYaml('a: [1] junk\n'));
  assert.equal(afterFlow.message, 'line 1: unexpected text after flow collection');
});

test('parses a full chart config with Chinese text, annotations and flow arrays', () => {
  const config = parseYaml(`---
title: 检索接口 P95 延迟
subtitle: 按周统计 · 2026 年 6–9 月
source: 数据来源：网关访问日志，每周约 42 万次请求
width: 760
height: 400
x:
  title: 周
  labels: [W23, W24, W25, W26]
y:
  title: P95 延迟
  unit: 毫秒
series:
  - name: 华东
    type: line
    smooth: true
    data: [118, 121, 116, 124]
  - name: 华南
    type: line
    smooth: false
    data: [96, 99, 101, 98]
annotations:
  - type: rule
    y: 150
    label: SLO 150ms
  - type: vband
    from: "2026-08-10"
    to: "2026-08-24"
    label: 大促
legend: true
`);
  assert.equal(config.title, '检索接口 P95 延迟');
  assert.equal(config.subtitle, '按周统计 · 2026 年 6–9 月');
  assert.equal(config.source, '数据来源：网关访问日志，每周约 42 万次请求');
  assert.equal(config.width, 760);
  assert.equal(config.height, 400);
  assert.deepEqual(config.x, { title: '周', labels: ['W23', 'W24', 'W25', 'W26'] });
  assert.equal(config.y.title, 'P95 延迟');
  assert.equal(config.y.unit, '毫秒');
  assert.equal(config.series.length, 2);
  assert.deepEqual(config.series[0], { name: '华东', type: 'line', smooth: true, data: [118, 121, 116, 124] });
  assert.deepEqual(config.series[1], { name: '华南', type: 'line', smooth: false, data: [96, 99, 101, 98] });
  assert.equal(config.annotations.length, 2);
  assert.deepEqual(config.annotations[0], { type: 'rule', y: 150, label: 'SLO 150ms' });
  assert.deepEqual(config.annotations[1], { type: 'vband', from: '2026-08-10', to: '2026-08-24', label: '大促' });
  assert.equal(config.legend, true);
});
