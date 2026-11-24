/**
 * Assemble HTML deliverables: a standalone page, an embeddable snippet and the
 * figure card itself. Styles and the runtime are inlined so a generated chart
 * is a single file that works offline.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PALETTE, DIVERGING, METRICS, PALETTES, SEQUENTIAL, TOKENS, FONT_STACK } from "./theme.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const LABELS = {
  zh: { table: "数据", copy: "复制数据", csv: "CSV", png: "PNG", svg: "SVG", theme: "深色" },
  en: { table: "Data", copy: "Copy", csv: "CSV", png: "PNG", svg: "SVG", theme: "Dark" },
};

let assetCache = null;
function assets() {
  if (!assetCache) {
    assetCache = {
      css: fs.readFileSync(path.join(ROOT, "assets/page.css"), "utf8"),
      runtime: fs.readFileSync(path.join(ROOT, "assets/runtime.js"), "utf8"),
      echarts: fs.readFileSync(path.join(ROOT, "vendor/echarts.min.cjs"), "utf8"),
    };
  }
  return assetCache;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function tokenBlock(mode, selector, paletteName = DEFAULT_PALETTE) {
  const tokens = TOKENS[mode];
  const lines = [`${selector} {`];
  for (const [key, value] of Object.entries(tokens)) lines.push(`  --rc-${kebab(key)}: ${value};`);
  const scheme = PALETTES[paletteName] || PALETTES[DEFAULT_PALETTE];
  scheme[mode].forEach((color, index) => lines.push(`  --rc-s${index + 1}: ${color};`));
  SEQUENTIAL[mode].forEach((color, index) => lines.push(`  --rc-q${index + 1}: ${color};`));
  DIVERGING[mode].forEach((color, index) => lines.push(`  --rc-d${index + 1}: ${color};`));
  lines.push(`  --rc-font: ${FONT_STACK};`);
  lines.push(`  --rc-radius: ${METRICS.radius}px;`);
  lines.push(`  --rc-pad: ${METRICS.pad}px;`);
  lines.push("}");
  return lines.join("\n");
}

export function styles(selector = ":root", allowAuto = true, paletteName = DEFAULT_PALETTE) {
  const blocks = [tokenBlock("light", selector, paletteName)];
  if (allowAuto) {
    blocks.push(`@media (prefers-color-scheme: dark) {\n${tokenBlock("dark", `${selector}:not([data-theme="light"])`, paletteName)}\n}`);
  }
  blocks.push(tokenBlock("dark", `${selector}[data-theme="dark"]`, paletteName));
  return blocks.join("\n");
}

function toolbar(kind, lang, expanded = false) {
  const labels = LABELS[lang === "en" ? "en" : "zh"];
  const buttons = [];
  if (kind === "table") {
    buttons.push(["csv", labels.csv]);
    buttons.push(["copy", labels.copy]);
  } else {
    buttons.push(["table", labels.table, `aria-pressed="${expanded ? "true" : "false"}"`]);
    buttons.push(["copy", labels.copy]);
    buttons.push(["png", labels.png]);
    buttons.push(["svg", labels.svg]);
  }
  buttons.push(["theme", labels.theme]);
  return `<div class="rc-tools">${buttons
    .map(([action, label, extra]) => `<button type="button" class="rc-tool" data-rc-action="${action}" ${extra || ""}>${label}</button>`)
    .join("")}</div>`;
}

export function figureHtml(payload, { index = 1, interactive = true } = {}) {
  const { meta, kind, table } = payload;
  const id = meta.id || `rc-${index}`;
  const lang = meta.lang === "en" ? "en" : "zh";
  const isTable = kind === "table";
  const expanded = Boolean(payload.dataTable) && !isTable;
  const attrs = [`class="rc-figure"`, `data-rc="${id}"`, `id="${escapeHtml(id)}"`];
  if (meta.theme === "dark") attrs.push('data-theme="dark"');

  const heading = [];
  if (meta.title) heading.push(`<h3 class="rc-title">${escapeHtml(meta.title)}</h3>`);
  if (meta.subtitle) heading.push(`<p class="rc-subtitle">${escapeHtml(meta.subtitle)}</p>`);

  const footer = [];
  if (meta.source) footer.push(`<span class="rc-source">${escapeHtml(meta.source)}</span>`);
  if (meta.note) footer.push(`<span class="rc-note">${escapeHtml(meta.note)}</span>`);

  const plot = isTable
    ? ""
    : `<div class="rc-plot"><div class="rc-canvas" style="height:${meta.height}px"></div></div>`;
  const tablePanel = isTable || expanded
    ? `<div class="rc-table-panel"></div>`
    : `<div class="rc-table-panel" hidden></div>`;

  // `staticOption` is a server-side snapshot only; keep it out of the page.
  const { staticOption: _ignored, ...clientPayload } = payload;
  const payloadJson = JSON.stringify({ ...clientPayload, id, lang }).replace(/</g, "\\u003c");

  return [
    `<figure ${attrs.join(" ")}>`,
    `<header class="rc-head"><div class="rc-heading">${heading.join("")}</div>${interactive ? toolbar(kind, lang, expanded) : ""}</header>`,
    plot,
    tablePanel,
    footer.length ? `<figcaption class="rc-foot">${footer.join("")}</figcaption>` : "",
    `<script type="application/json" class="rc-model">${payloadJson}</script>`,
    "</figure>",
  ].join("");
}

export function pageHtml(payload, { index = 1 } = {}) {
  const { meta } = payload;
  const lang = meta.lang === "en" ? "en" : "zh";
  const themeAttr = meta.theme === "dark" ? ' data-theme="dark"' : "";
  const content = assets();
  return `<!doctype html>
<html lang="${lang}"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="render-charts ${PACK.version} (Apache ECharts)">
<title>${escapeHtml(meta.title || "图表")}</title>
<style>
${styles(":root", true, meta.palette)}
${content.css}
</style>
</head>
<body class="rc-page">
<main class="rc-wrap">
${figureHtml(payload, { index })}
</main>
<script>
${content.echarts}
</script>
<script>
${content.runtime}
</script>
</body>
</html>
`;
}

export function snippetHtml(payload, { index = 1 } = {}) {
  const content = assets();
  return `<!-- render-charts: paste into an HTML document; styles and runtime are self-contained. -->
<style>
${styles(".rc-figure")}
${content.css}
</style>
${figureHtml(payload, { index })}
<script>
${content.echarts}
</script>
<script>
${content.runtime}
</script>
`;
}

export function galleryHtml(payloads, { title = "图表总览", subtitle = "", groups = null } = {}) {
  const content = assets();
  const figures = payloads
    .map((payload, index) => figureHtml(payload, { index: index + 1 }))
    .join("\n");
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
${styles(":root", true, meta.palette)}
${content.css}
</style>
</head>
<body class="rc-page">
<main class="rc-wrap">
<header class="rc-gallery-head">
<p class="rc-eyebrow">render-charts · 样式总览</p>
<h1 class="rc-gallery-title">${escapeHtml(title)}</h1>
${subtitle ? `<p class="rc-gallery-lede">${escapeHtml(subtitle)}</p>` : ""}
</header>
${figures}
</main>
<script>
${content.echarts}
</script>
<script>
${content.runtime}
</script>
</body>
</html>
`;
}

export function standaloneSvg(payload, mode = "light") {
  return payload.svg?.[mode] || payload.svg?.light || "";
}

export { ROOT };
