/**
 * Command line entry: spec -> HTML page, embeddable snippet, static SVG or PNG.
 *
 *   node bin/render-charts.mjs chart.yaml -o chart.html
 *   node bin/render-charts.mjs chart.yaml --check
 *   node bin/render-charts.mjs chart.yaml -o chart.svg
 *   node bin/render-charts.mjs --gallery templates -o gallery.html
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChart } from "./build-chart.mjs";
import { audit, hasErrors, loadSpec, SpecError } from "./spec.mjs";
import { galleryHtml, pageHtml, snippetHtml } from "./html.mjs";
import { renderSvg } from "./render-svg.mjs";
import { renderPng } from "./export.mjs";
import { paletteNames } from "./theme.mjs";

const VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version;

const USAGE = `用法: render-charts <配置.yaml|json> [选项]

选项:
  -o, --out <file>       输出文件；省略时写入 <配置名>.html 或标准输出
  --format <fmt>         html | snippet | svg | png（默认按 -o 扩展名推断）
  --theme <mode>         auto | light | dark（覆盖配置）
  --palette <name>       配色方案：editorial（默认）| vivid
  --width <px>           覆盖画布宽度
  --height <px>          覆盖画布高度
  --check                只做校验与文档级检查，不渲染
  --strict               把警告视为失败
  --json                 --check 以 JSON 输出
  --scale <n>            PNG 像素倍率（默认 2）
  --browser <path>       Chrome/Edge 可执行文件路径
  --gallery <dir>        把目录下所有配置渲染成一张总览页
  --version              显示版本
  -h, --help             显示帮助
`;

function parseArgs(argv) {
  const options = { _: [] };
  const takesValue = new Set(["-o", "--out", "--format", "--theme", "--palette", "--width", "--height", "--scale", "--browser", "--gallery"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "-h" || token === "--help") return { options, help: true };
    if (token === "--version") return { options, version: true };
    if (takesValue.has(token)) {
      const value = argv[index + 1];
      if (value === undefined) throw new SpecError(`${token} 需要一个值`);
      const key = token.replace(/^-+/, "").replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key === "o" ? "out" : key] = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = true;
      continue;
    }
    if (token === "-o") continue;
    options._.push(token);
  }
  return { options };
}

function guessFormat(out) {
  if (!out) return "html";
  const ext = path.extname(out).toLowerCase();
  if (ext === ".svg") return "svg";
  if (ext === ".png") return "png";
  if (ext === ".snippet.html") return "snippet";
  return "html";
}

function defaultName(spec, format) {
  const base = spec.replace(/\.(ya?ml|json)$/i, "");
  return `${base}${format === "snippet" ? ".snippet.html" : `.${format}`}`;
}

function reportFindings(findings, { json = false, chartTitle = "" } = {}) {
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");
  if (json) {
    console.log(JSON.stringify({ chart: chartTitle, errors: errors.length, warnings: warnings.length, findings }, null, 2));
    return { errors, warnings };
  }
  for (const finding of findings) console.error(finding.render());
  if (!findings.length) console.error("✓ 未发现问题");
  if (errors.length) console.error(`✗ ${errors.length} 个错误，${warnings.length} 个警告`);
  else if (warnings.length) console.error(`! ${warnings.length} 个警告（文档规范：标题、单位、口径、来源）`);
  return { errors, warnings };
}

function applyOverrides(spec, options) {
  if (options.palette) {
    const name = String(options.palette).toLowerCase();
    if (!paletteNames().includes(name)) throw new SpecError(`--palette 只能是 ${paletteNames().join(" / ")}，收到 ${options.palette}`);
    spec.palette = name;
  }
  if (!options.theme) return spec;
  if (!["auto", "light", "dark"].includes(options.theme)) throw new SpecError("--theme 只能是 auto / light / dark");
  spec.theme = options.theme;
  return spec;
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    return 2;
  }
  const { options, help, version } = parsed;
  if (help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (version) {
    console.log(`render-charts ${VERSION} (ECharts 6)`);
    return 0;
  }

  try {
    if (options.gallery) return await gallery(options);
    const file = options._[0];
    if (!file) {
      console.error(USAGE);
      return 2;
    }
    const spec = loadSpec(file);
    applyOverrides(spec, options);
    if (options.width) spec.width = Number(options.width);
    if (options.height) spec.height = Number(options.height);
    if (!Number.isFinite(spec.width) || !Number.isFinite(spec.height)) throw new SpecError("width/height 必须是数字");

    const findings = audit(spec);
    if (options.check) {
      const { errors, warnings } = reportFindings(findings, { json: Boolean(options.json), chartTitle: spec.title });
      if (errors.length) return 2;
      if (warnings.length && options.strict) return 1;
      return 0;
    }

    const { errors, warnings } = reportFindings(findings, { json: Boolean(options.json), chartTitle: spec.title });
    if (errors.length) {
      console.error("✗ 检查未通过，未生成输出；修正配置后重试");
      return 2;
    }
    if (warnings.length && options.strict) {
      console.error("✗ --strict 把警告视为失败，未生成输出");
      return 1;
    }

    const format = options.format || guessFormat(options.out);
    if (!["html", "snippet", "svg", "png"].includes(format)) throw new SpecError(`不支持的输出格式：${format}`);

    if (spec.kind === "table" && (format === "svg" || format === "png")) {
      throw new SpecError("表格只支持 html / snippet；需要静态表格请用 HTML 打印为 PDF");
    }

    const built = buildChart(spec);
    const out = options.out || defaultName(file, format);

    if (format === "html") {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, pageHtml(built), "utf8");
      console.log(`✓ ${out}  (${size(fs.statSync(out).size)}，${spec.width}×${spec.height})`);
      return 0;
    }
    if (format === "snippet") {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, snippetHtml(built), "utf8");
      console.log(`✓ ${out}  (${size(fs.statSync(out).size)})`);
      return 0;
    }

    const mode = spec.theme === "dark" ? "dark" : "light";
    const svg = renderSvg(built, { mode });
    if (format === "svg") {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, svg, "utf8");
      console.log(`✓ ${out}  (${size(fs.statSync(out).size)}，${spec.width}×${spec.height})`);
      return 0;
    }
    const scale = Number(options.scale) || 2;
    const background = mode === "dark" ? "#0B1220" : "#FFFFFF";
    const result = await renderPng(svg, { width: spec.width, height: spec.height, scale, background, out, browser: options.browser });
    console.log(`✓ ${out}  (${size(result.bytes)}，${result.width}×${result.height})`);
    return 0;
  } catch (error) {
    if (error instanceof SpecError) {
      console.error(`✗ ${error.message}`);
      return 2;
    }
    console.error(`✗ ${error.stack || error.message}`);
    return 2;
  }
}

async function gallery(options) {
  const directory = path.resolve(options.gallery);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new SpecError(`不是目录：${directory}`);
  const files = fs
    .readdirSync(directory)
    .filter((name) => /\.(ya?ml|json)$/i.test(name))
    .sort()
    .map((name) => path.join(directory, name));
  if (!files.length) throw new SpecError(`${directory} 里没有 .yaml / .json 配置`);

  const payloads = [];
  for (const file of files) {
    try {
      const spec = loadSpec(file);
      applyOverrides(spec, options);
      payloads.push(buildChart(spec));
    } catch (error) {
      console.error(`! 跳过 ${path.basename(file)}：${error.message}`);
    }
  }
  if (!payloads.length) throw new SpecError("没有可渲染的配置");
  const out = options.out || "gallery.html";
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, galleryHtml(payloads, { title: options.title || "图表总览" }), "utf8");
  console.log(`✓ ${out}（${payloads.length} 张图）`);
  return 0;
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
