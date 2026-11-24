/**
 * Load, normalise and audit a chart or table specification.
 *
 * A spec is either the long form (`series:` with explicit data) or the short
 * form used most often in documents:
 *
 *     type: bar
 *     labels: [Q1, Q2]
 *     data: { 华东: [128, 142], 华北: [96, 103] }
 *
 * Both normalise to the same `Chart` object, which the builders consume.
 * Unknown keys fail loudly: a typo must not silently fall back to a default
 * and produce a misleading figure.
 */

import fs from "node:fs";
import path from "node:path";
import { parseYaml } from "./yaml.mjs";
import { formatValue, parseDate } from "./format.mjs";
import { DEFAULT_PALETTE, paletteNames } from "./theme.mjs";

export const SERIES_TYPES = ["line", "area", "bar", "scatter", "bubble", "pie", "donut", "heatmap", "waterfall"];
export const X_TYPES = ["category", "value", "time"];

const TOP_KEYS = new Set([
  "title", "subtitle", "source", "note", "lang", "theme", "width", "height", "padding",
  "id", "aria", "type", "labels", "data", "series", "x", "y", "y2", "annotations",
  "legend", "tooltip", "values", "sort", "columns", "rows", "table", "data_table", "palette",
]);
const DATA_TABLE_KEYS = new Set(["show", "sort", "search", "page_size", "index", "sticky"]);
const AXIS_KEYS = new Set([
  "type", "title", "labels", "unit", "format", "min", "max", "tick_count", "grid",
  "begin_at_zero", "format_date", "decimals",
]);
const SERIES_KEYS = new Set([
  "name", "type", "data", "color", "stack", "axis", "smooth", "points", "labels",
  "emphasis", "dash", "opacity", "width", "format", "hidden", "total_at",
]);
const ANNOTATION_KEYS = new Set(["type", "y", "x", "from", "to", "label", "side", "axis"]);
const COLUMN_KEYS = new Set(["key", "label", "align", "width", "format", "type", "unit", "suffix", "prefix", "decimals"]);
const TABLE_KEYS = new Set([
  "sort", "search", "page_size", "index", "totals", "color_scale", "bar", "sticky", "dense", "caption",
]);

export class SpecError extends Error {}

export class Finding {
  constructor(level, message, hint = "") {
    this.level = level;
    this.message = message;
    this.hint = hint;
  }

  render() {
    const mark = { error: "错误", warning: "警告", info: "提示" }[this.level] || "提示";
    return `[${mark}] ${this.message}${this.hint ? `\n        → ${this.hint}` : ""}`;
  }
}

function fail(message) {
  throw new SpecError(message);
}

// --------------------------------------------------------------------- loading

export function readSpec(file) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) fail(`找不到图表配置：${absolute}`);
  const text = fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/, "");
  const ext = path.extname(absolute).toLowerCase();
  if (ext === ".json") {
    try {
      return JSON.parse(text);
    } catch (error) {
      fail(`${path.basename(absolute)} 不是合法 JSON：${error.message}`);
    }
  }
  if (ext === ".yaml" || ext === ".yml") {
    try {
      return parseYaml(text);
    } catch (error) {
      fail(`${path.basename(absolute)} 不是合法 YAML：${error.message}`);
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    try {
      return parseYaml(text);
    } catch (error) {
      fail(`${path.basename(absolute)} 既不是 JSON 也不是合法 YAML：${error.message}`);
    }
  }
}

export function loadSpec(file) {
  const absolute = path.resolve(file);
  return buildSpec(readSpec(absolute), { baseDir: path.dirname(absolute), file: absolute });
}

// ------------------------------------------------------------------- building

export function buildSpec(raw, context = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("图表配置的根节点必须是映射（key: value）");
  const unknown = Object.keys(raw).filter((key) => !TOP_KEYS.has(key));
  if (unknown.length) {
    fail(`未知的顶层字段：${unknown.join(", ")}；可用字段：${[...TOP_KEYS].sort().join(", ")}`);
  }

  const kindRaw = String(raw.type || "").toLowerCase();
  if (kindRaw === "table") return buildTable(raw, context);

  const dataTable = buildDataTableOption(raw.data_table);
  const chart = {
    title: text(raw.title),
    subtitle: text(raw.subtitle),
    source: text(raw.source),
    note: text(raw.note),
    lang: text(raw.lang) || "zh",
    theme: text(raw.theme) || "auto",
    palette: normalisePalette(raw.palette),
    width: number(raw.width, 760),
    height: number(raw.height, 420),
    padding: number(raw.padding, 18),
    id: text(raw.id),
    aria: text(raw.aria),
    legend: raw.legend === undefined ? null : legendFlag(raw.legend),
    tooltip: raw.tooltip === undefined ? true : legendFlag(raw.tooltip),
    values: raw.values && typeof raw.values === "object" ? Boolean(raw.values.show) : Boolean(raw.values),
    sort: text(raw.sort).toLowerCase(),
    annotations: [],
    series: [],
    x: buildAxis(raw.x || {}, "x"),
    y: buildAxis(raw.y || {}, "y"),
    y2: raw.y2 ? buildAxis(raw.y2, "y2") : null,
    table: null,
    dataTable: dataTable.show,
    dataTableOptions: dataTable.options,
  };
  if (chart.width < 240 || chart.height < 160) fail("width/height 太小：至少 240×160");

  const { series, labels } = buildSeries(raw, context);
  chart.series = series;
  if (chart.x.kind === "category" && chart.x.labels.length === 0) chart.x.labels = labels;
  if (chart.sort === "desc" || chart.sort === "asc") sortCategories(chart);

  if (chart.x.kind === "category" && chart.x.labels.length === 0 && !chart.series.some((item) => item.kind === "heatmap")) {
    fail("分类轴缺少 labels：请给出 x.labels 或顶层 labels");
  }

  chart.annotations = buildAnnotations(raw.annotations || [], chart);
  if (chart.legend === null) {
    const kinds = new Set(chart.series.map((item) => item.kind));
    const polar = kinds.size > 0 && [...kinds].every((kind) => kind === "pie" || kind === "donut");
    // A pie needs a legend for slice names; a single cartesian series does not.
    chart.legend = polar || chart.series.length > 1;
  }
  validate(chart);
  chart.kind = classify(chart);
  return chart;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function number(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`无法把 ${JSON.stringify(value)} 解析成数字`);
  return parsed;
}

function normalisePalette(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PALETTE;
  const name = String(value).toLowerCase();
  if (!paletteNames().includes(name)) fail(`palette 只能是 ${paletteNames().join(" / ")}，收到 ${value}`);
  return name;
}

function buildDataTableOption(raw) {
  if (raw === true) return { show: true, options: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { show: false, options: {} };
  const unknown = Object.keys(raw).filter((key) => !DATA_TABLE_KEYS.has(key));
  if (unknown.length) fail(`data_table 中有未知字段：${unknown.join(", ")}；可用字段：${[...DATA_TABLE_KEYS].sort().join(", ")}`);
  const options = {};
  if (raw.sort !== undefined) options.sort = Boolean(raw.sort);
  if (raw.search !== undefined) options.search = Boolean(raw.search);
  if (raw.page_size !== undefined) options.pageSize = raw.page_size === 0 ? 0 : Number(raw.page_size) || 10;
  if (raw.index !== undefined) options.index = Boolean(raw.index);
  if (raw.sticky !== undefined) options.sticky = Boolean(raw.sticky);
  return { show: raw.show !== false, options };
}

function legendFlag(value) {
  if (value && typeof value === "object") return Boolean(value.show ?? true);
  return Boolean(value);
}

function buildAxis(raw, name) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${name} 必须是映射，例如 ${name}: {title: 周, unit: 毫秒}`);
  const unknown = Object.keys(raw).filter((key) => !AXIS_KEYS.has(key));
  if (unknown.length) {
    fail(`${name} 中有未知字段：${unknown.join(", ")}；可用字段：${[...AXIS_KEYS].sort().join(", ")}`);
  }
  let kind = String(raw.type || (name === "x" ? "category" : "value")).toLowerCase();
  if (kind === "linear") kind = "value"; // older specs used `linear`
  if (name === "x" && !X_TYPES.includes(kind)) fail(`x.type 只能是 ${X_TYPES.join("/")}，收到 ${kind}`);
  let format = raw.format;
  if (typeof format === "string") format = { style: format };
  if (raw.decimals !== undefined && raw.decimals !== null) {
    format = { ...(format || { style: "number" }), decimals: Number(raw.decimals) };
  }
  return {
    kind,
    labels: Array.isArray(raw.labels) ? raw.labels.map(text) : [],
    title: text(raw.title),
    unit: text(raw.unit),
    format: format || null,
    min: raw.min === undefined || raw.min === null ? null : Number(raw.min),
    max: raw.max === undefined || raw.max === null ? null : Number(raw.max),
    tickCount: raw.tick_count ? Number(raw.tick_count) : 5,
    grid: raw.grid !== false,
    beginAtZero: raw.begin_at_zero === undefined ? null : Boolean(raw.begin_at_zero),
    dateFormat: text(raw.format_date) || "auto",
  };
}

function axisLabel(axis) {
  if (axis.title && axis.unit) return `${axis.title}（${axis.unit}）`;
  return axis.title || axis.unit;
}

function buildSeries(raw, context) {
  const block = raw.data;
  const labels = Array.isArray(raw.labels) ? raw.labels.map(text) : [];

  if (block && typeof block === "object" && !Array.isArray(block) && block.csv) {
    const { rows, columns } = readCsv(block, context.baseDir);
    const xColumn = block.x || block.labels;
    const outLabels = labels.length ? labels : xColumn && columns.includes(xColumn) ? rows.map((row) => text(row[xColumn])) : [];
    const names = block.names || {};
    let keys = block.series;
    if (keys && typeof keys === "object" && !Array.isArray(keys)) keys = Object.keys(keys);
    if (!keys) keys = columns.filter((column) => column !== xColumn);
    const series = keys.map((key) => {
      if (!columns.includes(key)) fail(`CSV 中找不到列 ${JSON.stringify(key)}；实际列：${columns.join(", ")}`);
      return {
        name: text(names[key] || key),
        kind: seriesKind(raw.type, "line"),
        points: rows.map((row, index) => [index, toNumber(row[key])]),
        sizes: null,
      };
    });
    return { series, labels: outLabels };
  }

  // Short form: type + data mapping name -> values.
  if (block && typeof block === "object" && !Array.isArray(block) && !block.labels) {
    const kind = seriesKind(raw.type, "line");
    const series = Object.entries(block).map(([name, values]) => {
      if (!Array.isArray(values)) fail(`data.${name} 必须是数组`);
      return { name, kind, points: values.map((value, index) => [index, toNumber(value)]), sizes: null, format: null };
    });
    return { series, labels };
  }

  if (!Array.isArray(raw.series) || raw.series.length === 0) {
    fail("缺少 series（显式系列）或 data（name -> 数值数组）");
  }

  const series = [];
  raw.series.forEach((item, index) => {
    if (typeof item === "number") item = { data: [item] };
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`series[${index}] 必须是映射或数值`);
    const unknown = Object.keys(item).filter((key) => !SERIES_KEYS.has(key));
    if (unknown.length) fail(`series[${index}] 中有未知字段：${unknown.join(", ")}`);
    const name = text(item.name) || `系列 ${index + 1}`;
    const kind = seriesKind(item.type || raw.type, "line");
    if (kind === "heatmap") {
      series.push({ name, kind, cells: heatmapCells(item.data, index), points: [], sizes: null });
      return;
    }
    const { points, sizes } = seriesPoints(item.data, index);
    series.push({
      name,
      kind,
      points,
      sizes,
      color: item.color || null,
      stack: item.stack ? text(item.stack) : null,
      axis: String(item.axis || "").toLowerCase() === "y2" ? 1 : 0,
      smooth: Boolean(item.smooth),
      showPoints: item.points === undefined ? "auto" : String(item.points),
      valueLabels: Boolean(item.labels),
      emphasis: Boolean(item.emphasis),
      dash: item.dash ? String(item.dash) : null,
      opacity: item.opacity === undefined ? 1 : Number(item.opacity),
      width: item.width ? Number(item.width) : null,
      format: normaliseFormat(item.format),
      hidden: Boolean(item.hidden),
      totals: Array.isArray(item.total_at) ? item.total_at.map(Number) : null,
    });
  });

  for (const item of series) {
    if (item.kind === "heatmap") continue;
    if (["line", "area", "bar", "waterfall"].includes(item.kind) && labels.length && item.points.length !== labels.length) {
      fail(`series ${JSON.stringify(item.name)} 有 ${item.points.length} 个数据点，但分类轴有 ${labels.length} 个标签`);
    }
  }
  return { series, labels };
}

function seriesKind(value, fallback) {
  const kind = String(value || fallback || "line").toLowerCase();
  if (!SERIES_TYPES.includes(kind)) fail(`不支持的系列类型 ${JSON.stringify(kind)}；可用：${SERIES_TYPES.join("/")}`);
  return kind;
}

function normaliseFormat(value) {
  if (!value) return null;
  return typeof value === "string" ? { style: value } : value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/,/g, "").replace(/%$/, "");
  if (["", "-", "—", "NA", "N/A", "null", "None"].includes(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) fail(`无法把 ${JSON.stringify(value)} 解析成数字`);
  return parsed;
}

function toX(value) {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return parseDate(value).getTime();
}

function seriesPoints(data, index) {
  if (!Array.isArray(data)) fail(`series[${index}].data 必须是数组`);
  const points = [];
  const sizes = [];
  data.forEach((item, position) => {
    if (item === null || item === undefined) {
      points.push([position, null]);
      sizes.push(null);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length === 2) {
        points.push([toX(item[0]), toNumber(item[1])]);
        sizes.push(null);
      } else if (item.length === 3) {
        points.push([toX(item[0]), toNumber(item[1])]);
        sizes.push(toNumber(item[2]));
      } else {
        fail(`series[${index}].data[${position}] 需要 [x, y] 或 [x, y, size]`);
      }
      return;
    }
    if (typeof item === "object") {
      if ("x" in item && "y" in item) {
        points.push([toX(item.x), toNumber(item.y)]);
        sizes.push(toNumber(item.size ?? item.r));
        return;
      }
      fail(`series[${index}].data[${position}] 需要 [x, y] 或 [x, y, size]`);
    }
    points.push([position, toNumber(item)]);
    sizes.push(null);
  });
  return { points, sizes: sizes.some((size) => size !== null) ? sizes : null };
}

function heatmapCells(data, index) {
  if (!Array.isArray(data) || data.length === 0) fail(`series[${index}].data 必须是热力图矩阵或 [列, 行, 值] 三元组数组`);
  const first = data[0];
  if (Array.isArray(first) && first.length === 3 && !Array.isArray(first[0])) {
    return data.map((item, position) => {
      if (!Array.isArray(item) || item.length !== 3) fail(`series[${index}].data[${position}] 需要 [列索引, 行索引, 值]`);
      return [Number(item[0]), Number(item[1]), Number(item[2])];
    });
  }
  const cells = [];
  data.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) fail(`series[${index}].data[${rowIndex}] 必须是数值数组`);
    row.forEach((value, colIndex) => {
      if (value === null || value === undefined) return;
      cells.push([colIndex, rowIndex, Number(value)]);
    });
  });
  return cells;
}

function buildAnnotations(items, chart) {
  if (!Array.isArray(items)) fail("annotations 必须是数组");
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`annotations[${index}] 必须是映射`);
    const unknown = Object.keys(item).filter((key) => !ANNOTATION_KEYS.has(key));
    if (unknown.length) fail(`annotations[${index}] 中有未知字段：${unknown.join(", ")}`);
    const kind = String(item.type || "rule").toLowerCase();
    const label = text(item.label);
    if (["line", "rule", "hline"].includes(kind)) {
      const value = toNumber(item.y);
      if (value === null) fail(`annotations[${index}] 缺少 y`);
      return { kind: "rule", value, label };
    }
    if (["vrule", "vline"].includes(kind)) {
      return { kind: "vrule", value: toAxisX(chart, item.x), label };
    }
    if (["band", "hband"].includes(kind)) {
      const from = toNumber(item.from);
      const to = toNumber(item.to);
      if (from === null || to === null) fail(`annotations[${index}] 的 band 需要 from 与 to`);
      return { kind: "band", start: Math.min(from, to), end: Math.max(from, to), label };
    }
    if (kind === "vband") {
      const from = toAxisX(chart, item.from);
      const to = toAxisX(chart, item.to);
      return { kind: "vband", start: Math.min(from, to), end: Math.max(from, to), label };
    }
    fail(`annotations[${index}].type 不支持 ${JSON.stringify(kind)}；可用 rule/vrule/band/vband`);
  });
}

function toAxisX(chart, value) {
  if (chart.x.kind === "category" && typeof value === "string") {
    const index = chart.x.labels.indexOf(value);
    if (index < 0) fail(`标注位置 ${JSON.stringify(value)} 不在分类轴标签里：${chart.x.labels.join(", ")}`);
    return index;
  }
  return toX(value);
}

function sortCategories(chart) {
  const reference = chart.series.find((item) => !item.hidden && item.points.length);
  if (!reference) return;
  const order = chart.x.labels
    .map((label, index) => index)
    .sort((a, b) => {
      const left = reference.points[a]?.[1];
      const right = reference.points[b]?.[1];
      const leftValue = left === null || left === undefined ? -Infinity : left;
      const rightValue = right === null || right === undefined ? -Infinity : right;
      return chart.sort === "desc" ? rightValue - leftValue : leftValue - rightValue;
    });
  chart.x.labels = order.map((index) => chart.x.labels[index]);
  for (const series of chart.series) {
    if (!series.points.length) continue;
    series.points = order.map((index) => series.points[index] ?? [index, null]);
    if (series.sizes) series.sizes = order.map((index) => series.sizes[index] ?? null);
  }
}

function validate(chart) {
  if (!chart.series.length) fail("至少需要一个数据系列");
  for (const series of chart.series) {
    if (series.kind === "heatmap") {
      if (!series.cells?.length) fail(`series ${JSON.stringify(series.name)} 没有热力图数据`);
      continue;
    }
    if (!series.points.length) fail(`series ${JSON.stringify(series.name)} 没有数据`);
    if (chart.x.kind === "category" && chart.x.labels.length && series.points.length !== chart.x.labels.length) {
      fail(`series ${JSON.stringify(series.name)} 有 ${series.points.length} 个点，labels 有 ${chart.x.labels.length} 个`);
    }
  }
}

export function classify(chart) {
  const kinds = new Set(chart.series.filter((item) => !item.hidden).map((item) => item.kind));
  if (kinds.size && [...kinds].every((kind) => ["pie", "donut"].includes(kind))) return [...kinds].includes("donut") ? "donut" : "pie";
  if (kinds.has("heatmap")) return "heatmap";
  if (kinds.has("waterfall")) return "waterfall";
  if ([...kinds].every((kind) => ["bar", "line", "area", "scatter", "bubble"].includes(kind))) {
    return kinds.has("bar") && (kinds.has("line") || kinds.has("area")) ? "combo" : "cartesian";
  }
  fail(`无法识别图表类型：${[...kinds].join(", ")}`);
}

// ---------------------------------------------------------------------- tables

function buildTable(raw, context) {
  const block = raw.data;
  let columns = Array.isArray(raw.columns) ? raw.columns : [];
  let rows = Array.isArray(raw.rows) ? raw.rows : [];

  if (block && typeof block === "object" && block.csv) {
    const csv = readCsv(block, context.baseDir);
    if (!rows.length) rows = csv.rows;
    if (!columns.length) columns = csv.columns.map((key) => ({ key, label: key }));
  }
  if (!rows.length) fail("表格需要 rows 或 data.csv");
  if (!columns.length) {
    columns = Object.keys(rows[0]).map((key) => ({ key, label: key }));
  }
  columns = columns.map((column, index) => {
    if (typeof column === "string") column = { key: column, label: column };
    const unknown = Object.keys(column).filter((key) => !COLUMN_KEYS.has(key));
    if (unknown.length) fail(`columns[${index}] 中有未知字段：${unknown.join(", ")}`);
    if (!column.key) fail(`columns[${index}] 缺少 key`);
    const format = normaliseFormat(column.format);
    return {
      key: String(column.key),
      label: text(column.label) || String(column.key),
      align: ["left", "center", "right"].includes(column.align) ? column.align : null,
      width: column.width ? Number(column.width) : null,
      format: format || (column.unit ? { style: "number", unit: text(column.unit) } : null),
      numeric: undefined,
    };
  });

  const options = raw.table && typeof raw.table === "object" ? raw.table : {};
  const unknown = Object.keys(options).filter((key) => !TABLE_KEYS.has(key));
  if (unknown.length) fail(`table 中有未知字段：${unknown.join(", ")}；可用字段：${[...TABLE_KEYS].sort().join(", ")}`);

  const table = {
    kind: "table",
    title: text(raw.title),
    subtitle: text(raw.subtitle),
    source: text(raw.source),
    note: text(raw.note),
    lang: text(raw.lang) || "zh",
    theme: text(raw.theme) || "auto",
    palette: normalisePalette(raw.palette),
    width: number(raw.width, 760),
    height: number(raw.height, 420),
    id: text(raw.id),
    columns: columns.map((column) => ({ ...column, numeric: columnNumeric(rows, column.key) })),
    rows: rows.map((row) => columns.map((column) => cellValue(row[column.key], column, table_lang(raw)))),
    raw: rows,
    options: {
      sort: options.sort !== false,
      search: options.search !== false,
      pageSize: options.page_size === 0 ? 0 : Number(options.page_size) || 10,
      index: Boolean(options.index ?? true),
      totals: Array.isArray(options.totals) ? options.totals.map(String) : [],
      colorScale: options.color_scale ? String(options.color_scale) : null,
      bar: options.bar ? String(options.bar) : null,
      sticky: options.sticky !== false,
      dense: Boolean(options.dense),
      caption: text(options.caption),
    },
  };
  if (table.options.colorScale && !table.columns.some((column) => column.key === table.options.colorScale)) {
    fail(`table.color_scale 指向不存在的列：${table.options.colorScale}`);
  }
  if (table.options.bar && !table.columns.some((column) => column.key === table.options.bar)) {
    fail(`table.bar 指向不存在的列：${table.options.bar}`);
  }
  decorateTable(table);
  return table;
}

function table_lang(raw) {
  return text(raw.lang) || "zh";
}

function columnNumeric(rows, key) {
  return rows.every((row) => row[key] === null || row[key] === undefined || row[key] === "" || Number.isFinite(Number(row[key])));
}

function cellValue(value, column, lang) {
  if (value === null || value === undefined || value === "") return { text: "—", value: null };
  if (column.format) {
    const raw = Number(value);
    return {
      text: Number.isFinite(raw) ? formatValue(raw, column.format, lang) : String(value),
      value: Number.isFinite(raw) ? raw : null,
    };
  }
  if (typeof value === "number") return { text: value.toLocaleString("en-US"), value };
  return { text: String(value), value: Number.isFinite(Number(value)) ? Number(value) : null };
}

/** Pre-compute conditional formatting classes so the page needs no extra data. */
function decorateTable(table) {
  const numeric = table.columns.map((column) =>
    table.rows.every((row) => row[table.columns.indexOf(column)]?.value === null || Number.isFinite(row[table.columns.indexOf(column)].value)),
  );
  table.columns.forEach((column, index) => {
    column.numeric = numeric[index];
  });
  if (table.options.colorScale) {
    const index = table.columns.findIndex((column) => column.key === table.options.colorScale);
    const values = table.rows.map((row) => row[index].value).filter((value) => Number.isFinite(value));
    if (values.length) {
      const negative = values.filter((value) => value < 0);
      const positive = values.filter((value) => value > 0);
      const mixed = negative.length > 0 && positive.length > 0;
      const low = Math.min(...values);
      const high = Math.max(...values);
      const negMax = negative.length ? Math.abs(Math.min(...negative)) : 0;
      const posMax = positive.length ? Math.max(...positive) : 0;
      table.rows.forEach((row) => {
        const value = row[index].value;
        if (!Number.isFinite(value)) return;
        let bucket;
        if (mixed) {
          // Diverging scale centred on zero: sign carries meaning.
          bucket = value < 0 ? 1 + Math.min(2, Math.floor((Math.abs(value) / negMax) * 3)) : value > 0 ? 5 + Math.min(2, Math.floor((value / posMax) * 3)) : 4;
        } else {
          const ratio = high === low ? 0.5 : (value - low) / (high - low);
          bucket = Math.max(1, Math.min(7, Math.floor(ratio * 7) + 1));
        }
        row[index].tone = bucket;
      });
    }
  }
  if (table.options.bar) {
    const index = table.columns.findIndex((column) => column.key === table.options.bar);
    const values = table.rows.map((row) => row[index].value).filter((value) => Number.isFinite(value));
    const max = Math.max(...values, 1);
    table.rows.forEach((row) => {
      const value = row[index].value;
      if (!Number.isFinite(value)) return;
      row[index].bar = Math.max(0.02, Math.min(1, Math.abs(value) / max));
    });
  }
  table.columns.forEach((column, index) => {
    if (!table.options.totals.includes(column.key)) return;
    const sum = table.rows.reduce((total, row) => total + (Number.isFinite(row[index].value) ? row[index].value : 0), 0);
    table.totals = table.totals || {};
    table.totals[column.key] = sum;
  });
}

// ------------------------------------------------------------------------- CSV

export function readCsv(block, baseDir) {
  const file = path.resolve(baseDir || ".", String(block.csv));
  if (!fs.existsSync(file)) fail(`找不到 CSV：${file}`);
  const delimiter = block.delimiter || ",";
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text, delimiter);
  if (!rows.length) fail(`CSV 是空的：${file}`);
  const header = rows[0].map((cell) => cell.trim());
  const records = rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? "";
    });
    return record;
  });
  return { rows: records, columns: header };
}

export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

// ------------------------------------------------------------------------ audit

export function audit(spec) {
  if (spec.kind === "table") return auditTable(spec);
  const findings = [];
  const all = spec.series.filter((item) => !item.hidden);

  if (!spec.title) findings.push(new Finding("warning", "图表没有标题", "HTML 版需要 title；只交付静态图时至少写进图注"));
  if (!spec.source) findings.push(new Finding("warning", "没有数据来源 source", "文档规范要求图表注明口径与来源"));
  const special = ["pie", "donut", "heatmap"].includes(spec.kind);
  if (!special && !spec.y.unit && !spec.y.title && !spec.y.format) {
    findings.push(new Finding("warning", "数值轴没有单位或标题", "写 unit（如 毫秒）或 title（如 P95 延迟）"));
  }
  if (all.length > 8) findings.push(new Finding("warning", `有 ${all.length} 个系列，超过 8 个通常难以分辨`, "合并小类或改用小倍数图"));
  if (all.length === 1 && spec.legend) findings.push(new Finding("info", "只有一个系列时图例通常多余", "设置 legend: false"));

  for (const series of all) {
    const values = series.points.map((point) => point[1]).filter((value) => value !== null && value !== undefined);
    if (values.length < 2 && ["line", "area"].includes(series.kind)) {
      findings.push(new Finding("warning", `系列 ${JSON.stringify(series.name)} 少于 2 个有效点`, "折线至少需要 2 个点"));
    }
    if (values.length && Math.min(...values) === Math.max(...values)) {
      findings.push(new Finding("info", `系列 ${JSON.stringify(series.name)} 的所有数值相同`, "确认数据是否真的没有变化"));
    }
  }
  const hasBars = spec.series.some((series) => ["bar", "area"].includes(series.kind));
  if (hasBars && spec.y.min !== null && spec.y.min > 0) {
    findings.push(new Finding("error", "柱/面积图的 y.min 大于 0", "截断的基线会误导读者；删除 min 或改为折线"));
  }
  if (spec.x.kind === "category" && spec.x.labels.length > 40) {
    findings.push(new Finding("warning", `分类有 ${spec.x.labels.length} 个，标签会被抽稀`, "改为时间轴或聚合"));
  }
  const stacks = new Map();
  for (const series of all) {
    if (!series.stack) continue;
    if (!stacks.has(series.stack)) stacks.set(series.stack, []);
    stacks.get(series.stack).push(series);
  }
  for (const [name, members] of stacks) {
    if (members.some((item) => item.kind !== "bar")) {
      findings.push(new Finding("warning", `堆叠组 ${JSON.stringify(name)} 混合了不同图型`, "堆叠组内应统一为 bar"));
    }
  }
  if (spec.y2 && !spec.y2.title && !spec.y2.unit) {
    findings.push(new Finding("warning", "第二个数值轴没有标题或单位", "双轴必须写清各自口径"));
  }
  if (["pie", "donut"].includes(spec.kind)) {
    const values = all[0].points.map((point) => point[1]).filter((value) => value !== null);
    if (values.some((value) => value < 0)) findings.push(new Finding("error", "饼图含负值", "改用柱状图或修正数据"));
    if (values.reduce((sum, value) => sum + value, 0) <= 0) findings.push(new Finding("error", "饼图数值合计为 0", "检查数据"));
    if (values.length > 8) findings.push(new Finding("warning", `饼图有 ${values.length} 个分类`, "前 5 类 + 其他，或改柱状图"));
  }
  if (spec.x.kind === "time") {
    const stamps = spec.series.flatMap((series) => series.points.map((point) => point[0])).filter(Number.isFinite).sort((a, b) => a - b);
    if (stamps.length && stamps.at(-1) <= stamps[0]) findings.push(new Finding("error", "时间轴没有递增的日期", "检查 x 数据是否是 ISO 日期"));
  }
  return findings;
}

function auditTable(spec) {
  const findings = [];
  if (!spec.title) findings.push(new Finding("warning", "表格没有标题", "写清表名，或写进文档表注"));
  if (!spec.source) findings.push(new Finding("warning", "没有数据来源 source", "表格同样需要口径与来源"));
  if (!spec.rows.length) findings.push(new Finding("error", "表格没有数据行", "检查 rows 或 CSV"));
  if (spec.rows.length > 500) findings.push(new Finding("warning", `表格有 ${spec.rows.length} 行`, "文档里建议筛选或拆分，交互表格可保留"));
  if (spec.columns.length > 12) findings.push(new Finding("warning", `表格有 ${spec.columns.length} 列`, "列太多在页面里需要横向滚动"));
  const empty = spec.columns.filter((column) => spec.rows.every((row) => row[spec.columns.indexOf(column)].text === "—"));
  if (empty.length) findings.push(new Finding("warning", `空列：${empty.map((column) => column.label).join(", ")}`, "删除空列或补数据"));
  return findings;
}

export function hasErrors(findings) {
  return findings.some((finding) => finding.level === "error");
}

export { axisLabel };
