/**
 * Build ECharts options (light + dark) and the data-table model for a spec.
 *
 * Options must travel as JSON into the page, so formatters are emitted as
 * marker objects (`{__fn: "tick", ...}`) and hydrated into real functions by
 * `assets/runtime.js` — the same runtime used by the browser and, through a vm
 * sandbox, by server-side rendering. One implementation, no eval.
 */

import { formatDate, formatValue, parseDate, spanDays, tickLabel } from "./format.mjs";
import { FONT_STACK, METRICS, MOTION, TYPE, palette, readableInk, sequential, seriesColor, tokens } from "./theme.mjs";

const CARD = 12;

export function buildChart(spec) {
  const options = {};
  const staticOptions = {};
  for (const mode of ["light", "dark"]) {
    const option = buildOption(spec, mode);
    options[mode] = option;
    staticOptions[mode] = { ...option, animation: false };
  }
  const table = chartTable(spec);
  if (spec.dataTableOptions) Object.assign(table.options, spec.dataTableOptions);
  const dataTable = Boolean(spec.dataTable);
  return {
    kind: spec.kind,
    option: options,
    staticOption: staticOptions,
    table,
    dataTable,
    meta: {
      title: spec.title,
      subtitle: spec.subtitle,
      source: spec.source,
      note: spec.note,
      lang: spec.lang,
      theme: spec.theme,
      palette: spec.palette,
      width: spec.width,
      height: spec.height,
      id: spec.id,
      aria: spec.aria,
      legend: spec.legend,
      dataTable,
      interactive: true,
    },
  };
}

// --------------------------------------------------------------------- option

function buildOption(spec, mode) {
  if (spec.kind === "table") return { animation: false, backgroundColor: "transparent" };
  const ink = tokens(mode);
  const base = {
    // The browser animates the entrance and hover states; static renders use
    // `staticOption` (animation: false) so SVG/PNG stay deterministic.
    animation: true,
    animationDuration: MOTION.duration,
    animationEasing: MOTION.easing,
    animationDurationUpdate: MOTION.updateDuration,
    animationEasingUpdate: MOTION.updateEasing,
    backgroundColor: "transparent",
    textStyle: { fontFamily: FONT_STACK, color: ink.muted, fontSize: TYPE.axis },
    color: palette(mode, spec.palette),
    aria: { enabled: true, decal: { show: false } },
  };
  if (spec.kind === "pie" || spec.kind === "donut") return { ...base, ...polarOption(spec, mode) };
  if (spec.kind === "heatmap") return { ...base, ...heatmapOption(spec, mode) };
  return { ...base, ...cartesianOption(spec, mode) };
}

function axisNameStyle(ink) {
  return { color: ink.faint, fontSize: TYPE.axis, fontFamily: FONT_STACK };
}

function valueAxis(spec, axis, mode, index, hasBarOrArea) {
  const ink = tokens(mode);
  const label = axis.title && axis.unit ? `${axis.title}（${axis.unit}）` : axis.title || axis.unit;
  return {
    type: "value",
    name: label,
    nameLocation: "middle",
    nameGap: 38,
    nameRotate: index === 0 ? 90 : -90,
    nameTextStyle: axisNameStyle(ink),
    min: axis.min ?? undefined,
    max: axis.max ?? undefined,
    scale: axis.beginAtZero === true ? false : axis.beginAtZero === false ? true : !hasBarOrArea,
    splitNumber: axis.tickCount,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: ink.muted,
      fontSize: TYPE.tick,
      fontFamily: FONT_STACK,
      margin: 10,
      formatter: { __fn: "tick", fmt: axis.format, lang: spec.lang },
    },
    splitLine: { show: axis.grid, lineStyle: { color: ink.grid, width: 1 } },
  };
}

function xAxisFor(spec, mode) {
  const ink = tokens(mode);
  const axis = spec.x;
  const days = timeSpan(spec);
  const common = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: ink.muted, fontSize: TYPE.tick, fontFamily: FONT_STACK, margin: 10, hideOverlap: true },
    splitLine: { show: false },
    name: axis.title || (axis.unit && axis.kind !== "category" ? axis.unit : ""),
    nameLocation: "middle",
    nameGap: 28,
    nameTextStyle: axisNameStyle(ink),
  };

  if (axis.kind === "time") {
    return {
      ...common,
      type: "time",
      axisLabel: { ...common.axisLabel, formatter: { __fn: "date", pattern: axis.dateFormat, days, lang: spec.lang } },
      splitLine: { show: true, lineStyle: { color: ink.grid, width: 1, opacity: 0.6 } },
    };
  }
  if (axis.kind === "value") {
    return {
      ...common,
      type: "value",
      scale: true,
      axisLabel: { ...common.axisLabel, formatter: { __fn: "tick", fmt: axis.format, lang: spec.lang } },
      splitLine: { show: true, lineStyle: { color: ink.grid, width: 1, opacity: 0.6 } },
    };
  }
  return {
    ...common,
    type: "category",
    data: axis.labels,
    // Keep half a slot at both ends so edge labels are not clipped.
    boundaryGap: true,
    axisLabel: { ...common.axisLabel, interval: "auto" },
  };
}

function cartesianOption(spec, mode) {
  const ink = tokens(mode);
  const hasAxis2 = Boolean(spec.y2) && spec.series.some((series) => series.axis === 1);
  const barsOn = (axisIndex) =>
    spec.series.some((series) => (series.axis === 1 ? 1 : 0) === axisIndex && ["bar", "area", "waterfall"].includes(series.kind));
  const yAxes = [valueAxis(spec, spec.y, mode, 0, barsOn(0))];
  if (hasAxis2) yAxes.push(valueAxis(spec, spec.y2, mode, 1, barsOn(1)));

  const seriesList = [];
  spec.series.forEach((series, index) => {
    if (series.kind === "waterfall") seriesList.push(...waterfallSeries(spec, series, index, mode));
    else seriesList.push(seriesOption(spec, series, index, mode, hasAxis2));
  });

  const marks = annotationMarks(spec, mode);
  const host = seriesList.find((series) => !String(series.name).endsWith("·base")) || seriesList[0];
  if (host && marks.markLine) host.markLine = marks.markLine;
  if (host && marks.markArea) host.markArea = marks.markArea;

  if (spec.values) {
    for (const series of seriesList) {
      if (series.type === "line" || series.type === "bar") {
        series.label = {
          show: true,
          position: "top",
          color: ink.muted,
          fontSize: TYPE.value,
          formatter: { __fn: "value", fmt: spec.y.format, lang: spec.lang },
        };
      }
    }
  }

  const yName = Boolean(spec.y.title || spec.y.unit);
  const y2Name = Boolean(spec.y2 && (spec.y2.title || spec.y2.unit));
  const xName = Boolean(spec.x.title || (spec.x.unit && spec.x.kind !== "category"));

  return {
    grid: {
      left: yName ? 72 : 10,
      right: hasAxis2 ? (y2Name ? 78 : 22) : CARD + 14,
      top: 10 + (spec.legend ? 30 : 0),
      bottom: xName ? 28 : 6,
      containLabel: true,
    },
    legend: spec.legend
      ? {
          show: true,
          top: 0,
          left: 0,
          itemWidth: 9,
          itemHeight: 9,
          icon: "roundRect",
          itemGap: 16,
          textStyle: { color: ink.muted, fontSize: TYPE.legend, fontFamily: FONT_STACK },
          selected: Object.fromEntries(spec.series.map((series) => [series.name, !series.hidden])),
          data: spec.series.map((series) => series.name),
        }
      : { show: false },
    tooltip: tooltipOption(spec, mode, "axis"),
    xAxis: xAxisFor(spec, mode),
    yAxis: yAxes,
    series: seriesList,
  };
}

function seriesOption(spec, series, index, mode, hasAxis2) {
  const ink = tokens(mode);
  const color = seriesColor(mode, index, series.color, spec.palette);
  const format = series.format || spec.y.format;
  const formatMarker = { __fn: "value", fmt: format, lang: spec.lang };
  const data = chartData(spec, series);
  const base = {
    name: series.name,
    yAxisIndex: hasAxis2 && series.axis === 1 ? 1 : 0,
    data,
    color,
    emphasis: { focus: "series", scale: false },
    z: 3,
  };

  if (series.kind === "line" || series.kind === "area") {
    const showSymbol = series.showPoints !== "never" && (series.showPoints === "always" || series.points.length <= 32);
    return {
      ...base,
      type: "line",
      smooth: series.smooth ? 0.35 : false,
      smoothMonotone: "x",
      showSymbol,
      symbol: "circle",
      symbolSize: METRICS.symbolSize,
      connectNulls: false,
      lineStyle: {
        width: series.width || METRICS.lineWidth,
        type: series.dash ? dashType(series.dash) : "solid",
        cap: "round",
        join: "round",
        opacity: series.opacity,
      },
      itemStyle: { color, borderColor: ink.card, borderWidth: 1.5 },
      areaStyle: series.kind === "area" ? { color, opacity: 0.16 } : undefined,
      label: series.valueLabels
        ? { show: true, position: "top", color: ink.muted, fontSize: TYPE.value, formatter: formatMarker }
        : { show: false },
    };
  }

  if (series.kind === "bar") {
    return {
      ...base,
      type: "bar",
      stack: series.stack || undefined,
      barMaxWidth: METRICS.maxBarWidth,
      animationDelay: { __fn: "stagger", step: MOTION.barStagger, max: MOTION.barStaggerMax },
      data: (data || []).map((value) => ({
        value,
        itemStyle: { borderRadius: value !== null && value < 0 ? [0, 0, METRICS.barRadius, METRICS.barRadius] : [METRICS.barRadius, METRICS.barRadius, 0, 0] },
      })),
      itemStyle: { color, opacity: series.opacity },
      label: series.valueLabels
        ? { show: true, position: "top", color: ink.muted, fontSize: TYPE.value, formatter: formatMarker }
        : { show: false },
    };
  }

  const sizes = series.sizes || [];
  const known = sizes.filter((size) => Number.isFinite(size));
  return {
    ...base,
    type: "scatter",
    symbolSize: { __fn: "bubble", low: known.length ? Math.min(...known) : 0, high: known.length ? Math.max(...known) : 1 },
    animationDelay: { __fn: "stagger", step: MOTION.pointStagger, max: MOTION.pointStaggerMax },
    itemStyle: { color, opacity: 0.85, borderColor: ink.card, borderWidth: 1.2 },
    label: series.valueLabels ? { show: true, position: "top", color: ink.muted, fontSize: TYPE.value } : { show: false },
  };
}

function chartData(spec, series) {
  if (series.kind === "heatmap") return series.cells;
  if (series.kind === "waterfall") return series.points;
  if (spec.x.kind === "category") return series.points.map((point) => point[1]);
  if (spec.x.kind === "time") return series.points.map((point) => [new Date(point[0]).toISOString(), point[1]]);
  if (series.sizes) return series.points.map((point, index) => [point[0], point[1], series.sizes[index] ?? null]);
  return series.points.map((point) => [point[0], point[1]]);
}

function dashType(dash) {
  if (Array.isArray(dash)) return dash;
  const text = String(dash);
  if (text.includes("2")) return [2, 3];
  if (text.includes("6")) return [6, 4];
  return [4, 4];
}

function tooltipOption(spec, mode, trigger) {
  const ink = tokens(mode);
  return {
    show: spec.tooltip,
    trigger,
    confine: true,
    backgroundColor: ink.tipBg,
    borderWidth: 0,
    padding: [8, 10],
    textStyle: { color: ink.tipInk, fontSize: 12, fontFamily: FONT_STACK },
    extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.22);",
    axisPointer: { type: trigger === "item" ? "none" : "line", lineStyle: { color: ink.faint, width: 1, type: "dashed" } },
    valueFormatter: { __fn: "value", fmt: spec.y.format, lang: spec.lang },
  };
}

function annotationMarks(spec, mode) {
  if (!spec.annotations?.length) return {};
  const ink = tokens(mode);
  const lineData = [];
  const areaData = [];
  for (const annotation of spec.annotations) {
    if (annotation.kind === "rule") lineData.push({ yAxis: annotation.value, label: { formatter: annotation.label } });
    else if (annotation.kind === "vrule") lineData.push({ xAxis: axisValue(spec, annotation.value), label: { formatter: annotation.label } });
    else if (annotation.kind === "band") areaData.push([{ yAxis: annotation.start }, { yAxis: annotation.end, name: annotation.label }]);
    else if (annotation.kind === "vband") areaData.push([{ xAxis: axisValue(spec, annotation.start) }, { xAxis: axisValue(spec, annotation.end), name: annotation.label }]);
  }
  return {
          markLine: lineData.length
      ? {
          silent: true,
          symbol: "none",
          animation: false,
          lineStyle: { color: ink.annot, type: "dashed", width: 1 },
          label: { color: ink.annot, fontSize: TYPE.annot, fontFamily: FONT_STACK, position: "insideEndTop", distance: 5 },
          data: lineData,
        }
      : null,
    markArea: areaData.length
      ? {
          silent: true,
          itemStyle: { color: ink.band, opacity: 0.07 },
          label: { color: ink.annot, fontSize: TYPE.annot, fontFamily: FONT_STACK, position: "insideTopLeft" },
          data: areaData,
        }
      : null,
  };
}

function axisValue(spec, value) {
  if (spec.x.kind === "category") return spec.x.labels[value] ?? value;
  if (spec.x.kind === "time") return new Date(value).toISOString();
  return value;
}

// ------------------------------------------------------------------ waterfall

export function waterfallSeries(spec, series, index, mode) {
  const ink = tokens(mode);
  const color = seriesColor(mode, index, series.color, spec.palette);
  const totals = new Set(series.totals || []);
  const bases = [];
  const heights = [];
  const deltas = [];
  const runningAfter = [];
  let running = 0;

  series.points.forEach((point, position) => {
    const value = point[1];
    if (value === null || value === undefined) {
      bases.push(0);
      heights.push(0);
      deltas.push(null);
      runningAfter.push(running);
      return;
    }
    if (totals.has(position)) {
      bases.push(0);
      heights.push(Math.abs(value));
      deltas.push(value);
      running = value;
      runningAfter.push(running);
      return;
    }
    const low = Math.min(running, running + value);
    bases.push(low);
    heights.push(Math.abs(value));
    deltas.push(value);
    running += value;
    runningAfter.push(running);
  });

  const labels = deltas.map((value) => (value === null ? "" : value));

  return [
    {
      name: `${series.name}·base`,
      type: "bar",
      stack: `wf-${index}`,
      silent: true,
      data: bases,
      itemStyle: { color: "transparent" },
      emphasis: { disabled: true },
      tooltip: { show: false },
      z: 2,
    },
    {
      name: series.name,
      type: "line",
      step: "end",
      silent: true,
      symbol: "none",
      data: runningAfter,
      lineStyle: { color: ink.faint, width: 1, type: [2, 3], opacity: 0.9 },
      tooltip: { show: false },
      z: 1,
    },
    {
      name: series.name,
      type: "bar",
      stack: `wf-${index}`,
      barMaxWidth: METRICS.maxBarWidth,
      data: heights.map((value, position) => ({
        value,
        delta: deltas[position],
        itemStyle: { borderRadius: value && deltas[position] < 0 ? [0, 0, 2, 2] : [2, 2, 0, 0] },
      })),
      itemStyle: { color: { __fn: "wfColor", totals: [...totals], positive: color, negative: ink.negative, total: ink.ink } },
      label: { show: true, position: "top", color: ink.muted, fontSize: TYPE.value, formatter: { __fn: "wfLabel", fmt: spec.y.format, lang: spec.lang } },
      z: 3,
    },
  ];
}

// ---------------------------------------------------------------------- polar

function polarOption(spec, mode) {
  const ink = tokens(mode);
  const series = spec.series.find((item) => !item.hidden) || spec.series[0];
  const total = series.points.reduce((sum, point) => sum + (point[1] || 0), 0);
  if (series.points.some((point) => (point[1] || 0) < 0)) throw new Error("饼图不支持负值，请改用柱状图");
  if (total <= 0) throw new Error("饼图的数值合计为 0");
  const data = series.points.map((point, index) => {
    const color = seriesColor(mode, index, series.color, spec.palette);
    return {
      name: spec.x.labels[index] ?? `分类 ${index + 1}`,
      value: point[1] ?? 0,
      itemStyle: { color },
      // Light slices need dark labels, dark slices need white ones.
      label: { color: readableInk(color) },
    };
  });
  const donut = spec.kind === "donut";
  const fmt = spec.y.format || { style: "number" };
  const unit = spec.y.unit && fmt.style !== "percent" && fmt.style !== "currency" ? ` ${spec.y.unit}` : "";

  const option = {
    tooltip: {
      ...tooltipOption(spec, mode, "item"),
      formatter: { __fn: "pieTip", fmt, lang: spec.lang, unit },
    },
    legend: {
      show: spec.legend,
      orient: "vertical",
      left: "62%",
      top: "middle",
      itemWidth: 9,
      itemHeight: 9,
      icon: "roundRect",
      itemGap: 12,
      textStyle: { color: ink.muted, fontSize: TYPE.legend, fontFamily: FONT_STACK },
      data: data.map((item) => item.name),
    },
    series: [
      {
        name: series.name,
        type: "pie",
        radius: donut ? ["58%", "82%"] : ["0%", "80%"],
        center: ["36%", "52%"],
        animationType: "scale",
        animationDuration: MOTION.pieDuration,
        animationEasing: "cubicOut",
        avoidLabelOverlap: true,
        minShowLabelAngle: 12,
        padAngle: 0.6,
        itemStyle: { borderColor: ink.card, borderWidth: 2, borderRadius: 2 },
        label: { show: true, position: "inside", formatter: "{d}%", fontSize: 11, fontWeight: 600, fontFamily: FONT_STACK },
        labelLine: { show: false },
        // Hovering a slice nudges it outward; small slices also reveal their
        // percentage, which the normal state hides below minShowLabelAngle.
        emphasis: {
          scale: true,
          scaleSize: 7,
          itemStyle: { borderWidth: 2, borderColor: ink.card },
          label: { show: true, fontWeight: 600, fontSize: 12 },
        },
        data,
      },
    ],
  };
  if (donut) {
    option.graphic = [
      {
        type: "text",
        left: "36%",
        top: "46%",
        style: { text: `${formatValue(total, fmt, spec.lang)}${unit}`, fill: ink.ink, font: `600 19px ${FONT_STACK}`, textAlign: "center", textVerticalAlign: "middle" },
      },
      {
        type: "text",
        left: "36%",
        top: "54%",
        style: { text: series.name, fill: ink.faint, font: `11px ${FONT_STACK}`, textAlign: "center", textVerticalAlign: "middle" },
      },
    ];
  }
  return option;
}

// -------------------------------------------------------------------- heatmap

function heatmapOption(spec, mode) {
  const ink = tokens(mode);
  const series = spec.series.find((item) => !item.hidden) || spec.series[0];
  const cells = series.cells || [];
  const rows = spec.y.labels.length ? spec.y.labels : Array.from({ length: Math.max(...cells.map((cell) => cell[1])) + 1 }, (_, index) => `行 ${index + 1}`);
  const cols = spec.x.labels.length ? spec.x.labels : Array.from({ length: Math.max(...cells.map((cell) => cell[0])) + 1 }, (_, index) => `列 ${index + 1}`);
  const values = cells.map((cell) => cell[2]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const fmt = spec.y.format || { style: "number" };

  const data = cells.map(([col, row, value]) => {
    const ratio = high === low ? 0.5 : (value - low) / (high - low);
    const bucket = Math.max(1, Math.min(7, Math.floor(ratio * 7) + 1));
    const labelInk = mode === "dark" ? (bucket >= 7 ? "#0B1220" : "#E9EEF7") : bucket <= 5 ? "#0B1220" : "#FFFFFF";
    return { value: [col, row, value], label: { color: labelInk } };
  });

  return {
    tooltip: { ...tooltipOption(spec, mode, "item"), formatter: { __fn: "heatTip", rows, cols, fmt, lang: spec.lang } },
    grid: { left: 10, right: 16, top: 10, bottom: spec.x.title ? 46 : 34, containLabel: true },
    xAxis: {
      type: "category",
      data: cols,
      name: spec.x.title,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: axisNameStyle(ink),
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, fontSize: TYPE.tick, fontFamily: FONT_STACK },
    },
    yAxis: {
      type: "category",
      data: rows,
      inverse: true,
      name: spec.y.title,
      nameLocation: "middle",
      nameGap: 64,
      nameRotate: 90,
      nameTextStyle: axisNameStyle(ink),
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, fontSize: TYPE.tick, fontFamily: FONT_STACK },
    },
    visualMap: {
      min: low,
      max: high,
      calculable: false,
      orient: "horizontal",
      right: 10,
      bottom: 0,
      itemWidth: 12,
      itemHeight: 84,
      text: [formatValue(high, fmt, spec.lang), formatValue(low, fmt, spec.lang)],
      textStyle: { color: ink.faint, fontSize: TYPE.value, fontFamily: FONT_STACK },
      inRange: { color: sequential(mode) },
    },
    series: [
      {
        name: series.name,
        type: "heatmap",
        data,
        label: { show: true, color: ink.ink, fontSize: TYPE.value, fontFamily: FONT_STACK, formatter: { __fn: "value", fmt, lang: spec.lang } },
        itemStyle: { borderColor: ink.card, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderWidth: 2, borderColor: ink.ink } },
      },
    ],
  };
}

// ---------------------------------------------------------------------- table

export function chartTable(spec) {
  if (spec.kind === "table") return tableModel(spec);
  if (spec.kind === "pie" || spec.kind === "donut") {
    const series = spec.series.find((item) => !item.hidden) || spec.series[0];
    const total = series.points.reduce((sum, point) => sum + (point[1] || 0), 0);
    return {
      columns: [
        { label: "分类", align: "left", numeric: false },
        { label: "数值", align: "right", numeric: true },
        { label: "占比", align: "right", numeric: true },
      ],
      rows: series.points.map((point, index) => [
        { text: spec.x.labels[index] ?? `分类 ${index + 1}`, value: null },
        { text: formatValue(point[1], spec.y.format, spec.lang), value: point[1] },
        { text: formatValue(total ? (point[1] || 0) / total : 0, { style: "percent", decimals: 1 }, spec.lang), value: point[1] },
      ]),
      options: { sort: true, search: false, pageSize: 0, index: false, totals: [], sticky: false },
    };
  }
  if (spec.kind === "heatmap") {
    const series = spec.series[0];
    const rows = spec.y.labels;
    const cols = spec.x.labels;
    return {
      columns: [
        { label: "行", align: "left", numeric: false },
        { label: "列", align: "left", numeric: false },
        { label: "数值", align: "right", numeric: true },
      ],
      rows: (series.cells || []).map((cell) => [
        { text: rows[cell[1]] ?? String(cell[1]), value: null },
        { text: cols[cell[0]] ?? String(cell[0]), value: null },
        { text: formatValue(cell[2], spec.y.format, spec.lang), value: cell[2] },
      ]),
      options: { sort: true, search: true, pageSize: 0, index: false, totals: [], sticky: false },
    };
  }

  const visible = spec.series.filter((series) => !series.hidden);
  const columns = [{ label: spec.x.title || "分类", align: "left", numeric: false }];
  for (const series of visible) columns.push({ label: series.name, align: "right", numeric: true });
  const length = Math.max(...visible.map((series) => series.points.length), 0);
  const rows = [];
  for (let index = 0; index < length; index += 1) {
    const first = visible.find((series) => series.points[index]);
    const label = spec.x.kind === "category" ? spec.x.labels[index] ?? String(index + 1) : xLabel(spec, first.points[index][0]);
    const row = [{ text: label, value: null }];
    for (const series of visible) {
      const value = series.points[index]?.[1];
      const fmt = series.format || (series.axis === 1 && spec.y2 ? spec.y2.format : spec.y.format);
      row.push({ text: value === null || value === undefined ? "—" : formatValue(value, fmt, spec.lang), value });
    }
    rows.push(row);
  }
  return { columns, rows, options: { sort: true, search: false, pageSize: 0, index: false, totals: [], sticky: true } };
}

function xLabel(spec, value) {
  if (spec.x.kind === "time") return formatDate(parseDate(value), spec.x.dateFormat, timeSpan(spec), spec.lang);
  return formatValue(value, spec.x.format, spec.lang);
}

export function tableModel(spec) {
  return {
    columns: spec.columns.map((column) => ({
      key: column.key,
      label: column.label,
      align: column.align || (column.numeric ? "right" : "left"),
      numeric: column.numeric,
      width: column.width,
      format: column.format,
    })),
    rows: spec.rows,
    totals: spec.totals || {},
    lang: spec.lang,
    options: spec.options,
  };
}

// --------------------------------------------------------------------- helpers

export function timeSpan(spec) {
  if (spec.x.kind !== "time") return 0;
  const stamps = spec.series.flatMap((series) => series.points.map((point) => point[0])).filter(Number.isFinite);
  if (!stamps.length) return 0;
  return spanDays(new Date(Math.min(...stamps)), new Date(Math.max(...stamps)));
}
