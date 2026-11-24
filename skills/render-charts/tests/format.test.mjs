import test from "node:test";
import assert from "node:assert/strict";

import { formatDate, formatValue, humanize, parseDate, tickLabel } from "../src/format.mjs";
import { loadRuntime } from "../src/runtime.mjs";

test("compact numbers follow the document language", () => {
  assert.equal(formatValue(12000, "compact", "zh"), "1.2万");
  assert.equal(formatValue(9800, "compact", "zh"), "9,800");
  assert.equal(formatValue(120000000, "compact", "zh"), "1.2亿");
  assert.equal(formatValue(12000, "compact", "en"), "12K");
});

test("percent takes a 0–1 ratio", () => {
  assert.equal(formatValue(0.426, { style: "percent", decimals: 1 }), "42.6%");
  assert.equal(formatValue(0.426, { style: "percent", decimals: 0 }), "43%");
});

test("currency keeps a symbol and strips trailing zeros", () => {
  assert.equal(formatValue(394, { style: "currency", decimals: 0 }), "¥394");
  assert.equal(formatValue(-12.5, { style: "currency" }), "-¥12.50");
});

test("units are separated from the number", () => {
  assert.equal(formatValue(1680, { style: "number", unit: "万元" }), "1,680 万元");
});

test("integer and prefix/suffix", () => {
  assert.equal(formatValue(1234.6, "integer"), "1,235");
  assert.equal(formatValue(3, { style: "number", prefix: "≈", suffix: "+" }), "≈3+");
});

test("tick labels switch to compact notation for large values", () => {
  assert.equal(tickLabel(12000, null, "zh"), "1.2万");
  assert.equal(tickLabel(120, null, "zh"), "120");
  assert.equal(tickLabel(0.5, { style: "number", decimals: 1 }, "zh"), "0.5");
});

test("dates format by span and language", () => {
  const date = parseDate("2026-08-10");
  assert.equal(formatDate(date, "auto", 90, "zh"), "8月10日");
  assert.equal(formatDate(date, "auto", 90, "en"), "Aug 10");
  assert.equal(formatDate(date, "auto", 900, "zh"), "2026-08");
  assert.equal(formatDate(date, "%Y-%m-%d"), "2026-08-10");
});

test("humanize handles negatives and null", () => {
  assert.equal(humanize(-15000, "zh"), "-1.5万");
  assert.equal(formatValue(null), "—");
});

test("browser runtime formatters match the Node implementation", () => {
  const RC = loadRuntime();
  const cases = [
    [1234.5, { style: "number" }],
    [0.426, { style: "percent", decimals: 1 }],
    [12000, { style: "compact" }],
    [1680, { style: "number", unit: "万元" }],
    [-12.5, { style: "currency" }],
  ];
  for (const [value, fmt] of cases) {
    assert.equal(RC.format.value(value, fmt, "zh"), formatValue(value, fmt, "zh"), `value ${value}`);
  }
  assert.equal(RC.format.tick(12000, null, "zh"), tickLabel(12000, null, "zh"));
  assert.equal(RC.format.date(parseDate("2026-08-10"), "auto", 90, "zh"), "8月10日");
});
