/**
 * Build the grouped showcase page (`charts-showcase.html` at the repo root).
 *
 * This is a demo/documentation artifact, not part of the rendering pipeline:
 * every card is produced by the normal build + figure path. Run from anywhere:
 *
 *     node skills/render-charts/tools/build-showcase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpec } from "../src/spec.mjs";
import { buildChart } from "../src/build-chart.mjs";
import { figureHtml, styles } from "../src/html.mjs";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SKILL, "..", "..");

const SECTIONS = [
  ["trend", "趋势与时间", "看一个指标随时间怎么变。时间轴会按跨度自动选择日期粒度，折线可以平滑但不允许过冲。", [
    ["line", "折线图", "line", "多系列、目标线、缺失值断线"],
    ["area", "面积图", "area", "强调体量，默认从 0 起"],
    ["time-series", "时间轴折线", "x.type: time", "ISO 日期自动分档，区间标注"],
  ]],
  ["compare", "对比与构成", "分类之间比大小、看总量由什么组成、把两个量纲放在一起。", [
    ["bar", "分组柱状图", "bar", "同一指标多个系列并排"],
    ["stacked-bar", "堆叠柱状图", "bar + stack", "看每个分类的构成"],
    ["ranking", "排名柱状图", "bar + sort: desc", "排序 + 直接标数值"],
    ["combo", "双轴组合图", "bar + line + axis: y2", "两个量纲，两侧都标口径"],
  ]],
  ["distribute", "分布与关系", "两个指标是否相关、密度集中在哪里。", [
    ["scatter", "气泡图", "bubble", "x、y 之外用面积编码第三维"],
    ["heatmap", "热力图", "heatmap", "两个维度的强度，7 档离散色阶"],
  ]],
  ["share", "占比与拆解", "单一时点的构成，以及一个总量如何被各项变化推到另一个总量。", [
    ["donut", "环形图", "donut", "中心放合计，适合 ≤6 类"],
    ["pie", "饼图", "pie", "分类少、加总等于整体时使用"],
    ["waterfall", "瀑布图", "waterfall", "期初 → 增减 → 期末"],
  ]],
  ["data", "数据与明细", "精确数值、多列对比、需要排序筛选时用表格；图表也可以把底层数据表一起展开。", [
    ["table", "交互表格", "table", "排序、搜索、分页、合计、条件着色、CSV"],
    ["attached-table", "图 + 数据表", "data_table: true", "同一张卡片里，图下面直接列出数据"],
    ["csv", "CSV 直出折线", "data.csv", "路径相对配置文件"],
  ]],
];

const CSS = `
.sc-page { max-width: 940px; margin: 0 auto; padding: 56px 28px 88px; }
.sc-topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.sc-title { margin: 16px 0 14px; font-size: 34px; line-height: 1.18; letter-spacing: -0.025em; font-weight: 650; }
.sc-lede { margin: 0; max-width: 640px; font-size: 15px; line-height: 1.65; color: var(--rc-muted); }
.sc-facts { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 18px; font-size: 12px; color: var(--rc-faint); }
.sc-facts b { color: var(--rc-chip-ink); font-weight: 600; }
.sc-cta { appearance: none; border: 1px solid var(--rc-grid); background: var(--rc-card); color: var(--rc-chip-ink); font: inherit; font-size: 12.5px; padding: 7px 13px; border-radius: 999px; cursor: pointer; flex: none; }
.sc-cta:hover { background: var(--rc-chip); }
.sc-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 26px; }
.sc-nav a { font-size: 12px; padding: 6px 11px; border-radius: 999px; background: var(--rc-chip); color: var(--rc-chip-ink); text-decoration: none; }
.sc-nav a:hover { background: var(--rc-grid); }
.sc-section { margin-top: 46px; padding-top: 24px; border-top: 1px solid var(--rc-grid); scroll-margin-top: 24px; }
.sc-sechead { display: flex; align-items: baseline; gap: 10px; }
.sc-num { font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; color: var(--rc-faint); }
.sc-section h2 { margin: 0; font-size: 15px; letter-spacing: 0.01em; color: var(--rc-ink); font-weight: 600; }
.sc-section > p { margin: 6px 0 22px; font-size: 13.5px; color: var(--rc-muted); max-width: 640px; }
.sc-item { margin-bottom: 30px; }
.sc-type { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font-size: 12px; color: var(--rc-muted); }
.sc-type code { font-size: 11.5px; padding: 1px 6px; border-radius: 5px; background: var(--rc-chip); color: var(--rc-chip-ink); }
.sc-type span { color: var(--rc-faint); }
.sc-footer { margin-top: 66px; padding-top: 20px; border-top: 1px solid var(--rc-grid); font-size: 12px; line-height: 1.9; color: var(--rc-faint); }
.sc-footer code { font-size: 11.5px; color: var(--rc-chip-ink); }
`;

const TOGGLE = `
<script>
(function () {
  var button = document.querySelector("[data-sc-theme]");
  if (!button) return;
  button.addEventListener("click", function () {
    var root = document.documentElement;
    var dark = root.dataset.theme === "dark";
    root.dataset.theme = dark ? "light" : "dark";
    var figures = document.querySelectorAll(".rc-figure");
    for (var i = 0; i < figures.length; i++) figures[i].dataset.theme = root.dataset.theme;
    button.textContent = dark ? "切换深色" : "切换浅色";
  });
})();
</script>
`;

const figures = {};
let index = 0;
for (const [, , , items] of SECTIONS) {
  for (const [name] of items) {
    index += 1;
    figures[name] = figureHtml(buildChart(loadSpec(path.join(SKILL, "templates", `${name}.yaml`))), { index });
  }
}

const cards = SECTIONS.map(([anchor, title, note, items], position) => {
  const blocks = items
    .map(([name, label, code, hint]) => `<div class="sc-item"><p class="sc-type">${label} <code>${code}</code> <span>${hint}</span></p>${figures[name]}</div>`)
    .join("");
  return `<section class="sc-section" id="${anchor}"><div class="sc-sechead"><span class="sc-num">${String(position + 1).padStart(2, "0")}</span><h2>${title}</h2></div><p>${note}</p>${blocks}</section>`;
}).join("\n");

const nav = SECTIONS.map(([anchor, title]) => `<a href="#${anchor}">${title}</a>`).join("");
const css = fs.readFileSync(path.join(SKILL, "assets/page.css"), "utf8");
const runtime = fs.readFileSync(path.join(SKILL, "assets/runtime.js"), "utf8");
const echarts = fs.readFileSync(path.join(SKILL, "vendor/echarts.min.cjs"), "utf8");

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>render-charts · 图表与表格总览</title>
<style>
${styles()}
${css}
${CSS}
</style>
</head>
<body class="rc-page">
<main class="sc-page">
  <header>
    <div class="sc-topline">
      <p class="rc-eyebrow">render-charts · 样式总览</p>
      <button type="button" class="sc-cta" data-sc-theme>切换深色</button>
    </div>
    <h1 class="sc-title">一套文档视觉语言，<br>${index} 种图表与表格表达</h1>
    <p class="sc-lede">下面每一项都由同一份 YAML 配置、同一套色板与排版规则渲染，引擎是 Apache ECharts 6。图表有入场与悬停动画，悬浮看数值、点图例开关系列；表格可以排序、搜索、分页、导出 CSV。</p>
    <div class="sc-facts">
      <span><b>${index}</b> 项</span>
      <span><b>5</b> 组主题</span>
      <span>静态 HTML · 可离线打开</span>
      <span>ECharts 6 · 无外部请求</span>
    </div>
    <nav class="sc-nav">${nav}</nav>
  </header>
  ${cards}
  <footer class="sc-footer">
    生成：<code>node tools/build-showcase.mjs</code>（分组展示版）或 <code>node bin/render-charts.mjs --gallery templates -o gallery.html</code>（平铺版）。<br>
    配置在 <code>templates/</code>，字段与规则见 <code>references/spec.md</code>、<code>references/chart-selection.md</code>。
  </footer>
</main>
<script>
${echarts}
</script>
<script>
${runtime}
</script>
${TOGGLE}
</body>
</html>
`;

const target = path.join(ROOT, "charts-showcase.html");
fs.writeFileSync(target, html, "utf8");
console.log("written", target, fs.statSync(target).size);
