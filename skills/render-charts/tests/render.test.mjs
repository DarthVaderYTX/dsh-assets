import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { audit, loadSpec } from "../src/spec.mjs";
import { buildChart, chartTable } from "../src/build-chart.mjs";
import { figureHtml, pageHtml, snippetHtml } from "../src/html.mjs";
import { renderSvg } from "../src/render-svg.mjs";
import { loadRuntime } from "../src/runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function spec(name) {
  return loadSpec(path.join(ROOT, "templates", `${name}.yaml`));
}

test("every template builds without errors", () => {
  const files = fs.readdirSync(path.join(ROOT, "templates")).filter((name) => name.endsWith(".yaml"));
  assert.ok(files.length >= 14, "templates should cover every type");
  for (const file of files) {
    const item = loadSpec(path.join(ROOT, "templates", file));
    const built = buildChart(item);
    assert.ok(built.option.light && built.option.dark, `${file} needs light and dark options`);
    assert.ok(built.table && built.table.columns.length, `${file} needs a data table`);
    assert.equal(audit(item).filter((finding) => finding.level === "error").length, 0, `${file} should pass audit`);
  }
});

test("options keep formatters as markers until hydration", () => {
  const built = buildChart(spec("line"));
  const axis = built.option.light.yAxis[0];
  assert.equal(typeof axis.axisLabel.formatter, "object");
  assert.equal(axis.axisLabel.formatter.__fn, "tick");
  const RC = loadRuntime();
  const hydrated = RC.hydrate(built.option.light);
  assert.equal(typeof hydrated.yAxis[0].axisLabel.formatter, "function");
  assert.equal(hydrated.yAxis[0].axisLabel.formatter(12000), "1.2万");
});

test("only the browser option animates; the static snapshot does not", () => {
  const built = buildChart(spec("bar"));
  assert.equal(built.option.light.animation, true);
  assert.equal(built.staticOption.light.animation, false);
  assert.equal(built.option.light.series[0].animationDelay.__fn, "stagger");

  const RC = loadRuntime();
  const hydrated = RC.hydrate(built.option.light);
  assert.equal(hydrated.series[0].animationDelay(3), 54);
  assert.equal(hydrated.series[0].animationDelay(999), 260);

  const svg = renderSvg(built, { mode: "light" });
  assert.match(svg, /^<svg/);
});

test("static svg renders without a browser", () => {
  const built = buildChart(spec("line"));
  const svg = renderSvg(built, { mode: "light" });
  assert.match(svg, /^<svg/);
  assert.match(svg, /华东/);
  assert.match(svg, /W23/);
  assert.match(svg, /SLO 150ms/);
  assert.doesNotMatch(svg, /__fn/);
});

test("page html embeds the model, echarts and the runtime", () => {
  const payload = buildChart(spec("bar"));
  const html = pageHtml(payload);
  assert.match(html, /class="rc-figure"/);
  assert.match(html, /class="rc-model"/);
  assert.match(html, /echarts/);
  assert.match(html, /window\.RC/);
  assert.match(html, /--rc-s1:/);
});

test("snippet scopes tokens to the figure", () => {
  const payload = buildChart(spec("donut"));
  const html = snippetHtml(payload);
  assert.match(html, /\.rc-figure \{/);
  assert.match(html, /--rc-bg:/);
  assert.doesNotMatch(html, /^<!doctype/i);
});

test("table figure has no canvas and shows the table panel", () => {
  const payload = buildChart(spec("table"));
  const html = figureHtml(payload);
  assert.doesNotMatch(html, /rc-canvas/);
  assert.match(html, /class="rc-table-panel"/);
  assert.match(html, /data-rc-action="csv"/);
});

test("data_table expands the chart's data table in the card", () => {
  const payload = buildChart(spec("attached-table"));
  assert.equal(payload.dataTable, true);
  const html = figureHtml(payload);
  assert.doesNotMatch(html, /rc-table-panel" hidden/);
  assert.match(html, /data-rc-action="table" aria-pressed="true"/);
  // The same figure still exports a static chart without the table.
  const svg = renderSvg(payload, { mode: "light" });
  assert.match(svg, /^<svg/);
});

test("waterfall series uses a floating base and a connector", () => {
  const built = buildChart(spec("waterfall"));
  const series = built.option.light.series;
  assert.equal(series.length, 3);
  assert.equal(series[0].stack, "wf-0");
  assert.equal(series[1].type, "line");
  assert.equal(series[1].step, "end");
  assert.equal(series[2].stack, "wf-0");
  assert.ok(series[2].data.some((item) => item.delta < 0));
});


test("palette changes the series colours", () => {
  const spec = loadSpec(path.join(ROOT, "templates", "line.yaml"));
  const before = buildChart(spec);
  spec.palette = "vivid";
  const after = buildChart(spec);
  assert.notEqual(before.option.light.series[0].color, after.option.light.series[0].color);
  assert.equal(before.option.light.series[0].color, "#7CA6F2");
  assert.equal(after.option.light.series[0].color, "#2563EB");
});

test("pie legend is enabled and slices carry colors", () => {
  const built = buildChart(spec("pie"));
  assert.equal(built.option.light.legend.show, true);
  assert.equal(built.option.light.series[0].type, "pie");
  assert.ok(built.option.light.series[0].data[0].itemStyle.color);
});

test("hovering a pie slice enlarges it without touching static output", () => {
  for (const name of ["pie", "donut"]) {
    const built = buildChart(spec(name));
    const series = built.option.light.series[0];
    assert.equal(series.emphasis.scale, true, `${name} should scale on hover`);
    assert.equal(series.emphasis.scaleSize, 7);
    assert.equal(series.emphasis.label.show, true);
    // Slice labels pick a readable ink per slice colour (white / dark).
    assert.match(series.data[0].label.color, /^#[0-9A-F]{6}$/i);
    assert.equal(built.staticOption.light.animation, false);
  }
});

test("dual axis marks the second series with yAxisIndex 1", () => {
  const built = buildChart(spec("combo"));
  assert.equal(built.option.light.yAxis.length, 2);
  assert.equal(built.option.light.series[1].yAxisIndex, 1);
});

test("chart data table is derived from series", () => {
  const table = chartTable(spec("bar"));
  assert.equal(table.columns.length, 4);
  assert.equal(table.rows.length, 4);
  assert.equal(table.rows[0][1].text, "128");
});

test("cli --check passes good specs and rejects broken ones", () => {
  const cli = path.join(ROOT, "bin", "render-charts.mjs");
  const good = spawnSync(process.execPath, [cli, path.join(ROOT, "templates", "line.yaml"), "--check"], { encoding: "utf8" });
  assert.equal(good.status, 0);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rc-cli-"));
  const bad = path.join(directory, "bad.yaml");
  fs.writeFileSync(bad, "title: 坏图\nlabels: [A]\ny: {title: v}\nseries:\n  - {name: a, type: bar, data: [1, 2]}\n", "utf8");
  const failed = spawnSync(process.execPath, [cli, bad, "--check"], { encoding: "utf8" });
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /数据点/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("cli writes html and svg files", () => {
  const cli = path.join(ROOT, "bin", "render-charts.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rc-out-"));
  const html = path.join(directory, "chart.html");
  const svg = path.join(directory, "chart.svg");
  assert.equal(spawnSync(process.execPath, [cli, path.join(ROOT, "templates", "bar.yaml"), "-o", html], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, path.join(ROOT, "templates", "bar.yaml"), "--format", "svg", "-o", svg], { encoding: "utf8" }).status, 0);
  assert.ok(fs.statSync(html).size > 100000);
  assert.match(fs.readFileSync(svg, "utf8"), /^<svg/);
  fs.rmSync(directory, { recursive: true, force: true });
});
