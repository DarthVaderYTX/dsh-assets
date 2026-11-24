/**
 * Design tokens shared by the chart options, the page CSS and the tables.
 *
 * The palette is deliberately document-first: one accent per series, a quiet
 * grey ink ramp, hairline grids, no shadows on data. Light and dark variants
 * resolve to the same semantic names so a single option can be recolored.
 */

export const FONT_STACK =
  '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export const TOKENS = {
  light: {
    bg: "#FFFFFF",
    card: "#FFFFFF",
    ink: "#0F172A",
    muted: "#5B667A",
    faint: "#8A94A6",
    grid: "#E9EDF4",
    axis: "#D6DCE6",
    zero: "#C2CAD6",
    chip: "#F1F5F9",
    chipInk: "#334155",
    tipBg: "#0F172A",
    tipInk: "#F8FAFC",
    tipMuted: "#A8B3C4",
    focus: "#2563EB",
    annot: "#7C8798",
    band: "#64748B",
    negative: "#A33A2E",
    border: "#E9EDF4",
  },
  dark: {
    bg: "#0B1220",
    card: "#111A2B",
    ink: "#E9EEF7",
    muted: "#A3AFC2",
    faint: "#7C8798",
    grid: "#1F2A3D",
    axis: "#2A3750",
    zero: "#3A4A66",
    chip: "#1B2740",
    chipInk: "#D3DCEA",
    tipBg: "#F8FAFC",
    tipInk: "#0F172A",
    tipMuted: "#5B667A",
    focus: "#60A5FA",
    annot: "#93A1B7",
    band: "#94A3B8",
    negative: "#E08F80",
    border: "#1F2A3D",
  },
};

/**
 * Categorical palettes. `frost` is the default: a light, cool set that stays
 * readable on white without looking heavy. `editorial` is the muted print
 * variant and `vivid` the original saturated one; all three ship dark modes.
 */
export const PALETTES = {
  frost: {
    light: [
      "#7CA6F2", "#5CC4B4", "#F0C264", "#F0979B", "#B79AE8",
      "#6FC6E4", "#A5CF7C", "#F0AE86", "#9AA7BB", "#E9A0C0",
    ],
    dark: [
      "#A6C4FF", "#7FDCCD", "#F6D389", "#F7B4B7", "#CBB6F5",
      "#8FD8F0", "#BEE09B", "#F6C3A5", "#B5C0D2", "#F2BBD6",
    ],
  },
  editorial: {
    light: [
      "#3D5A80", "#B65A3C", "#2F7D6F", "#A97B12", "#7A5C8E",
      "#5B7F3F", "#B0736A", "#4C7A8C", "#9C6B8E", "#6F7C8C",
    ],
    dark: [
      "#86A9CE", "#E0917A", "#6FC3B2", "#DDB55F", "#B79BCB",
      "#A3C47E", "#E0A79B", "#86B7C9", "#C99DBD", "#A9B6C6",
    ],
  },
  vivid: {
    light: [
      "#2563EB", "#0D9488", "#F59E0B", "#E11D48", "#7C3AED",
      "#0891B2", "#65A30D", "#C2410C", "#475569", "#DB2777",
    ],
    dark: [
      "#60A5FA", "#2DD4BF", "#FBBF24", "#FB7185", "#A78BFA",
      "#22D3EE", "#A3E635", "#FB923C", "#94A3B8", "#F9A8D4",
    ],
  },
};

export const DEFAULT_PALETTE = "frost";

export function paletteNames() {
  return Object.keys(PALETTES);
}

/** Sequential ramp used by heatmaps and data bars (7 ordered steps). */
export const SEQUENTIAL = {
  light: ["#F4F7FD", "#E4EDFB", "#CEE0F8", "#B4D1F3", "#95BCEC", "#6F9FDF", "#4A7CC2"],
  dark: ["#1B2534", "#22334A", "#2A4562", "#335C80", "#42779F", "#6AA3CC", "#A9CDEA"],
};

/** Diverging ramp for variances and growth tables. */
export const DIVERGING = {
  light: ["#B4534B", "#D4877E", "#EFC1BA", "#F3F3F1", "#C6DCF2", "#8FB9E8", "#5C90D5"],
  dark: ["#E08F80", "#D9A79C", "#F0CFC6", "#2A3648", "#8FB2D0", "#6C9FD0", "#4A7CC2"],
};

export const TYPE = {
  title: 17,
  subtitle: 12,
  axis: 11,
  tick: 11,
  legend: 12,
  value: 10.5,
  annot: 10.5,
  note: 11.5,
};

export const METRICS = {
  radius: 14,
  pad: 18,
  lineWidth: 2,
  symbolSize: 6,
  barRadius: 3,
  maxBarWidth: 46,
};

/** Motion is deliberately restrained: one entrance, no decorative loops. */
export const MOTION = {
  duration: 700,
  easing: "cubicOut",
  updateDuration: 300,
  updateEasing: "cubicInOut",
  barStagger: 18,
  barStaggerMax: 260,
  pointStagger: 22,
  pointStaggerMax: 300,
  pieDuration: 750,
};

export function tokens(mode) {
  return TOKENS[mode === "dark" ? "dark" : "light"];
}

export function palette(mode, name = DEFAULT_PALETTE) {
  const scheme = PALETTES[name] || PALETTES[DEFAULT_PALETTE];
  return scheme[mode === "dark" ? "dark" : "light"];
}

export function seriesColor(mode, index, explicit, name = DEFAULT_PALETTE) {
  if (explicit) return explicit;
  const colors = palette(mode, name);
  return colors[index % colors.length];
}

export function sequential(mode) {
  return SEQUENTIAL[mode === "dark" ? "dark" : "light"];
}

export function diverging(mode) {
  return DIVERGING[mode === "dark" ? "dark" : "light"];
}

export function readableInk(hex) {
  const text = String(hex).replace("#", "");
  const full =
    text.length === 3
      ? text
          .split("")
          .map((char) => char + char)
          .join("")
      : text;
  const channel = (offset) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Threshold tuned for 11–12px labels on pastel and saturated palettes.
  return luminance > 0.28 ? "#0B1220" : "#FFFFFF";
}
