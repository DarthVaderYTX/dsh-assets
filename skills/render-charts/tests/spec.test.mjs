import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { audit, buildSpec, hasErrors, loadSpec, SpecError } from "../src/spec.mjs";
import { buildChart } from "../src/build-chart.mjs";

function base(overrides = {}) {
  return buildSpec({
    title: "测试图",
    source: "数据来源：单元测试",
    labels: ["A", "B", "C"],
    y: { title: "数量", unit: "个" },
    type: "bar",
    data: { 系列一: [3, 5, 2] },
    ...overrides,
  });
}

test("short form builds one series and labels", () => {
  const spec = base();
  assert.equal(spec.series.length, 1);
  assert.deepEqual(spec.series[0].points, [
    [0, 3],
    [1, 5],
    [2, 2],
  ]);
  assert.equal(spec.kind, "cartesian");
});

test("unknown top-level key fails loudly", () => {
  assert.throws(() => base({ bogus: 1 }), (error) => error instanceof SpecError && /未知的顶层字段/.test(error.message));
});

test("length mismatch is rejected", () => {
  assert.throws(() => base({ data: { 系列一: [1, 2] } }), /有 2 个点，labels 有 3 个/);
});

test("single series has no legend, pie does", () => {
  assert.equal(base().legend, false);
  assert.equal(base({ data: { 一: [1, 2, 3], 二: [3, 2, 1] } }).legend, true);
  const pie = buildSpec({ title: "占比", source: "s", type: "pie", labels: ["A", "B"], data: { 值: [5, 3] } });
  assert.equal(pie.legend, true);
});

test("sort desc reorders labels and points together", () => {
  const spec = base({ sort: "desc", data: { 系列一: [3, 9, 5] } });
  assert.deepEqual(spec.x.labels, ["B", "C", "A"]);
  assert.deepEqual(spec.series[0].points.map((point) => point[1]), [9, 5, 3]);
});

test("linear x is accepted as an alias of value", () => {
  const spec = buildSpec({
    title: "散点",
    source: "s",
    x: { type: "linear" },
    y: { title: "y" },
    series: [{ name: "点", type: "scatter", data: [[1, 2]] }],
  });
  assert.equal(spec.x.kind, "value");
});

test("csv data resolves relative to the spec directory", () => {
  const spec = loadSpec(path.join(import.meta.dirname, "..", "templates", "csv.yaml"));
  assert.equal(spec.series.length, 3);
  assert.equal(spec.x.labels.length, 6);
  assert.equal(spec.series[0].name, "华北");
});

test("heatmap matrix infers rows and columns", () => {
  const spec = buildSpec({
    title: "热力",
    source: "s",
    x: { labels: ["a", "b"] },
    y: { labels: ["r1", "r2"] },
    series: [{ type: "heatmap", data: [[1, 2], [3, null]] }],
  });
  assert.equal(spec.series[0].cells.length, 3);
  assert.deepEqual(spec.series[0].cells[0], [0, 0, 1]);
});

test("audit reports a truncated bar baseline as an error", () => {
  const spec = buildSpec({
    title: "柱",
    source: "s",
    labels: ["A", "B"],
    type: "bar",
    y: { min: 90 },
    data: { 值: [95, 120] },
  });
  const findings = audit(spec);
  assert.ok(hasErrors(findings));
  assert.match(findings.find((item) => item.level === "error").message, /y\.min/);
});

test("audit warns about missing source and unit", () => {
  const spec = buildSpec({ title: "无来源", labels: ["A", "B"], type: "line", data: { x: [1, 2] } });
  const messages = audit(spec).map((item) => item.message);
  assert.ok(messages.some((message) => message.includes("来源")));
  assert.ok(messages.some((message) => message.includes("单位")));
});

test("pie rejects negative values at build time", () => {
  const spec = buildSpec({ title: "占比", source: "s", type: "pie", labels: ["A", "B"], data: { 值: [5, -1] } });
  assert.throws(() => buildChart(spec), /负值/);
});

test("table spec normalises cells, totals and conditional formatting", () => {
  const spec = buildSpec({
    type: "table",
    title: "表格",
    source: "s",
    columns: [
      { key: "name", label: "名称" },
      { key: "value", label: "数值", unit: "万" },
      { key: "growth", label: "同比", format: "percent" },
    ],
    rows: [
      { name: "A", value: 10, growth: 0.1 },
      { name: "B", value: 20, growth: -0.05 },
    ],
    table: { totals: ["value"], color_scale: "growth", bar: "value" },
  });
  assert.equal(spec.kind, "table");
  assert.equal(spec.rows[0][1].text, "10 万");
  assert.equal(spec.rows[0][2].text, "10%");
  assert.equal(spec.totals.value, 30);
  // Diverging scale is centred on zero: negative and positive differ.
  assert.ok(spec.rows[1][2].tone < 4);
  assert.ok(spec.rows[0][2].tone > 4);
  assert.ok(spec.rows[1][1].bar > spec.rows[0][1].bar);
});


test("palette defaults to editorial and rejects unknown names", () => {
  assert.equal(base().palette, "frost");
  assert.equal(base({ palette: "vivid" }).palette, "vivid");
  assert.throws(() => base({ palette: "nope" }), /palette 只能是 frost \/ editorial \/ vivid/);
});

test("table rejects unknown table options", () => {
  assert.throws(
    () => buildSpec({ type: "table", title: "表", source: "s", columns: [{ key: "a" }], rows: [{ a: 1 }], table: { bogus: true } }),
    /未知字段/,
  );
});

test("data_table accepts a flag or options and rejects unknown keys", () => {
  const flagged = base({ data_table: true });
  assert.equal(flagged.dataTable, true);
  assert.deepEqual(flagged.dataTableOptions, {});

  const configured = base({ data_table: { search: true, page_size: 5, sort: false } });
  assert.equal(configured.dataTable, true);
  assert.equal(configured.dataTableOptions.search, true);
  assert.equal(configured.dataTableOptions.pageSize, 5);
  assert.equal(configured.dataTableOptions.sort, false);

  assert.throws(() => base({ data_table: { bogus: 1 } }), /data_table 中有未知字段/);
  assert.equal(base({ data_table: { show: false } }).dataTable, false);
});

test("cli spec errors keep a readable message", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rc-spec-"));
  const file = path.join(directory, "bad.yaml");
  fs.writeFileSync(file, "title: 坏图\nlabels: [A]\ny: {title: v}\nseries:\n  - {name: a, type: bar, data: [1, 2]}\n", "utf8");
  assert.throws(() => loadSpec(file), /数据点/);
  fs.rmSync(directory, { recursive: true, force: true });
});
