// 把 client/src 下的片段按文件名顺序拼成运行时 client.js。
//
// 片段共享同一个工厂作用域，因此可以拆文件但不能各自使用 import/export；
// 这样既保持 DSH 客户端只加载一个 client.js，又让源码按职责分层。
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');
const sourceDir = path.join(pluginRoot, 'client', 'src');
const bundlePath = path.join(pluginRoot, 'client.js');

export async function readClientSource() {
  const names = (await fsp.readdir(sourceDir))
    .filter((name) => name.endsWith('.js'))
    .sort();
  if (!names.length) throw new Error(`client source directory is empty: ${sourceDir}`);
  const parts = [];
  for (const name of names) {
    const text = await fsp.readFile(path.join(sourceDir, name), 'utf8');
    parts.push(`// ---- client/src/${name} ----\n${text.replace(/\s+$/, '')}\n`);
  }
  return `${parts.join('\n')}\n`;
}

async function main() {
  const source = await readClientSource();
  if (process.argv.includes('--check')) {
    const current = await fsp.readFile(bundlePath, 'utf8').catch(() => '');
    if (current.trimEnd() !== source.trimEnd()) {
      console.error('client.js is out of date; run: node scripts/build-client.mjs');
      process.exitCode = 1;
      return;
    }
    console.log('client.js is up to date');
    return;
  }
  await fsp.writeFile(bundlePath, source, 'utf8');
  console.log(`wrote client.js (${source.length} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
