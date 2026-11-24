/**
 * PNG export through a headless Chrome/Edge screenshot.
 *
 * The SVG is already correct vector output, so the browser only rasterizes it:
 * a minimal page with the SVG at its native size, captured at N× device scale.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean);

export function findBrowser(explicit) {
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  for (const candidate of CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore unreadable paths */
    }
  }
  return null;
}

export async function renderPng(svg, { width, height, scale = 2, background = "#FFFFFF", out, browser } = {}) {
  const executable = findBrowser(browser);
  if (!executable) throw new Error("找不到 Chrome/Edge，无法生成 PNG；用 --browser 指定路径，或改用 --format svg");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rc-png-"));
  const page = path.join(directory, "chart.html");
  const shot = path.join(directory, "shot.png");
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:${background}}svg{display:block}</style></head><body>${svg}</body></html>`,
    "utf8",
  );
  const density = Number.isInteger(scale) ? String(scale) : String(scale);
  try {
    await run(
      executable,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--force-device-scale-factor=${density}`,
        `--window-size=${Math.round(width)},${Math.round(height)}`,
        `--screenshot=${shot}`,
        new URL(`file://${page.replace(/\\/g, "/")}`).href,
      ],
      { timeout: 120000, windowsHide: true },
    );
  } finally {
    /* the temp directory is removed below when possible */
  }
  if (!fs.existsSync(shot)) throw new Error("浏览器截图失败：没有生成 PNG");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.copyFileSync(shot, out);
  fs.rmSync(directory, { recursive: true, force: true });
  return { width: Math.round(width * scale), height: Math.round(height * scale), bytes: fs.statSync(out).size };
}
