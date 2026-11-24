/**
 * Number and date formatting with document conventions.
 *
 * Charts carry units, so formatting stays conservative: thousands separators,
 * no trailing zeros, and compact notation that follows the document language
 * (`1.2万` in Chinese, `1.2K` in English). The same helpers feed axis ticks,
 * tooltips, labels and table cells so one figure never shows two formats.
 */

const ZH_UNITS = [
  [1e8, "亿"],
  [1e4, "万"],
];
const EN_UNITS = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

export const FORMAT_STYLES = ["number", "integer", "compact", "percent", "currency"];

function stripZeros(text) {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

export function humanize(value, lang = "zh", decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  for (const [factor, suffix] of lang === "zh" ? ZH_UNITS : EN_UNITS) {
    if (magnitude >= factor) {
      return sign + stripZeros((magnitude / factor).toFixed(decimals)) + suffix;
    }
  }
  if (magnitude >= 1000) return sign + Math.round(magnitude).toLocaleString("en-US");
  return sign + stripZeros(magnitude.toFixed(Math.max(decimals, 2)));
}

export function formatValue(value, fmt, lang = "zh") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (typeof value === "string") return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  const spec = typeof fmt === "string" ? { style: fmt } : fmt || {};
  const style = (spec.style || "number").toLowerCase();
  const decimals = spec.decimals;
  const prefix = spec.prefix || "";
  const suffix = spec.suffix || "";
  const unit = spec.unit ? ` ${spec.unit}` : "";
  let text;

  if (style === "integer") {
    text = Math.round(number).toLocaleString("en-US");
  } else if (style === "compact") {
    text = humanize(number, lang, decimals ?? 1);
  } else if (style === "percent") {
    const scaled = number * 100;
    text = stripZeros(scaled.toFixed(decimals ?? 1)) + "%";
  } else if (style === "currency") {
    const symbol = spec.symbol || "¥";
    const digits = decimals ?? 2;
    text = symbol + Math.abs(number).toFixed(digits);
    if (number < 0) text = "-" + text;
  } else {
    let digits = decimals;
    if (digits === null || digits === undefined) {
      digits = Math.abs(number) >= 1000 || Number.isInteger(number) ? 0 : 2;
    }
    text = stripZeros(number.toFixed(digits));
    const parts = text.split(".");
    parts[0] = Number(parts[0]).toLocaleString("en-US");
    text = parts.join(".");
  }
  return `${prefix}${text}${unit}${suffix}`;
}

/** Axis ticks: compact large magnitudes, never scientific notation. */
export function tickLabel(value, fmt, lang = "zh", decimals) {
  if (fmt) return formatValue(value, fmt, lang);
  return Math.abs(value) >= 10000 ? humanize(value, lang, 1) : formatValue(value, { style: "number", decimals }, lang);
}

export function decimalsForStep(step) {
  if (!step || step >= 1) return 0;
  return Math.max(0, -Math.floor(Math.log10(step)));
}

export function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const stamp = value > 1e11 ? value : value * 1000;
    return new Date(stamp);
  }
  const text = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}/.test(text) ? text : text.replace(/\//g, "-");
  const parsed = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无法解析日期 ${JSON.stringify(value)}；请用 ISO 8601，例如 2026-01-31`);
  }
  return parsed;
}

export function spanDays(start, end) {
  return Math.max((end.getTime() - start.getTime()) / 86400000, 0);
}

/** Date label that matches the visible span and the document language. */
export function formatDate(date, pattern = "auto", days = null, lang = "zh") {
  const pad = (value) => String(value).padStart(2, "0");
  if (pattern && pattern !== "auto") {
    const map = {
      "%Y": String(date.getUTCFullYear()),
      "%m": pad(date.getUTCMonth() + 1),
      "%d": pad(date.getUTCDate()),
      "%H": pad(date.getUTCHours()),
      "%M": pad(date.getUTCMinutes()),
    };
    return pattern.replace(/%[YmdHM]/g, (token) => map[token] ?? token);
  }
  if (days === null) return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  if (days <= 2) return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  if (days <= 180) {
    return lang === "zh"
      ? `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  if (days <= 1000) return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  return String(date.getUTCFullYear());
}

export function axisLabelFormatter(lang, tokens) {
  return (value) => tickLabel(value, null, lang, 0);
}

/** Unit suffix for tooltips, e.g. `1,234 毫秒`. */
export function withUnit(text, unit, style) {
  if (!unit || style === "percent" || style === "currency") return text;
  return `${text} ${unit}`;
}
