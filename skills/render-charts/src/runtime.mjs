/**
 * Load the browser runtime inside a Node vm sandbox.
 *
 * The runtime is a classic script that attaches `window.RC`; running it here
 * gives server-side rendering the exact same formatter hydration the browser
 * uses, without a second implementation or an eval in the generated page.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let cached = null;

export function loadRuntime() {
  if (cached) return cached;
  const source = fs.readFileSync(path.join(ROOT, "assets/runtime.js"), "utf8");
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "runtime.js" });
  if (!sandbox.window.RC) throw new Error("runtime.js did not expose window.RC");
  cached = sandbox.window.RC;
  return cached;
}

export { ROOT };
