/**
 * Server-side SVG rendering with ECharts' SSR mode.
 *
 * No browser and no canvas: ECharts renders the same option to an SVG string,
 * using the hydrated formatters from the shared runtime. This is what the
 * `--format svg` path (and the PNG wrapper) consume.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadRuntime } from "./runtime.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let echarts = null;

export function loadEcharts() {
  if (!echarts) echarts = require(path.join(ROOT, "vendor", "echarts.min.cjs"));
  return echarts;
}

export function renderSvg(built, { mode = "light", width, height } = {}) {
  const RC = loadRuntime();
  // Static output must be deterministic: no entrance animation in the snapshot.
  const source = built.staticOption?.[mode] || built.staticOption?.light || { ...(built.option[mode] || built.option.light), animation: false };
  const option = RC.hydrate(source);
  const chart = loadEcharts().init(null, null, {
    renderer: "svg",
    ssr: true,
    width: width || built.meta.width,
    height: height || built.meta.height,
  });
  chart.setOption(option, true);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}
