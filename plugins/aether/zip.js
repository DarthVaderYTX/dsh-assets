// 目录输出打包为 ZIP（store 模式，不压缩），避免引入第三方依赖。
// ZIP 结构：本地文件头 + 文件数据 + 中央目录 + EOCD；UTF-8 文件名使用通用标志位 11。
import { promises as fsp } from 'node:fs';
import path from 'node:path';

const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zipName(value) {
  return String(value || 'output')
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '') || 'output';
}

async function collectEntries(root, prefix) {
  const entries = [];
  let total = 0;
  const rootName = zipName(prefix);
  async function walk(directory, relative) {
    const name = relative ? `${rootName}/${relative}/` : `${rootName}/`;
    entries.push({ name, directory: true, data: Buffer.alloc(0) });
    const items = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
    items.sort((left, right) => left.name.localeCompare(right.name));
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      const full = path.join(directory, item.name);
      const next = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await walk(full, next);
      } else if (item.isFile()) {
        const data = await fsp.readFile(full);
        total += data.length;
        if (total > MAX_ZIP_BYTES) {
          const error = new Error(`目录超过 ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB，无法打包`);
          error.status = 413;
          throw error;
        }
        entries.push({ name: `${rootName}/${next}`, directory: false, data });
      }
    }
  }
  await walk(root, '');
  return entries;
}

export async function zipDirectory(directory, prefix) {
  const entries = await collectEntries(directory, prefix);
  const { time, day } = dosTimestamp();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const checksum = crc32(data);
    const size = data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(size, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(entry.directory ? 0x10 : 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, eocd]);
}
