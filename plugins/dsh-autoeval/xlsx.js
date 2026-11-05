// 最小 XLSX 读取器：只依赖 node:zlib，读第一个工作表，够 Query 集导入用。
import zlib from 'node:zlib'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

function findEocd(buffer) {
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) return i
  }
  return -1
}

/** 把 xlsx（zip）里的条目解成 Map<文件名, Buffer>。 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('文件太小，不像 xlsx')
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('不是有效的 xlsx（找不到 zip 结尾标记）')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const files = new Map()
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) {
      throw new Error('xlsx 中央目录损坏')
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(start, start + compressedSize)
    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, zlib.inflateRawSync(raw))
    else throw new Error(`xlsx 用了不支持的压缩方式 ${method}`)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

function unescapeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function textOf(xml) {
  const parts = []
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let match = re.exec(xml)
  while (match) {
    parts.push(unescapeXml(match[1]))
    match = re.exec(xml)
  }
  return parts.join('')
}

function parseSharedStrings(xml) {
  const list = []
  const re = /<si>([\s\S]*?)<\/si>/g
  let match = re.exec(xml)
  while (match) {
    list.push(textOf(match[1]))
    match = re.exec(xml)
  }
  return list
}

function columnIndex(ref) {
  const letters = String(ref).replace(/[^A-Z]/gi, '').toUpperCase()
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64)
  return value - 1
}

function parseSheet(xml, shared) {
  const rows = []
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g
  let rowMatch = rowRe.exec(xml)
  while (rowMatch) {
    const body = rowMatch[1] || ''
    const cells = []
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch = cellRe.exec(body)
    let cursor = 0
    while (cellMatch) {
      const attrs = cellMatch[1] || ''
      const inner = cellMatch[2] || ''
      const ref = /r="([A-Z]+\d+)"/i.exec(attrs)
      const column = ref ? columnIndex(ref[1]) : cursor
      cursor = column + 1
      const type = /t="([^"]+)"/.exec(attrs)
      const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(inner)
      let value = ''
      if (type && type[1] === 'inlineStr') value = textOf(inner)
      else if (valueMatch) {
        const raw = unescapeXml(valueMatch[1])
        value = type && type[1] === 's' ? (shared[Number(raw)] || '') : raw
      }
      cells[column] = value
      cellMatch = cellRe.exec(body)
    }
    rows.push(cells)
    rowMatch = rowRe.exec(xml)
  }
  return rows
}

/** 读第一个工作表，返回二维字符串数组（含表头行）。 */
export function readXlsx(buffer) {
  const files = readZip(buffer)
  const sharedFile = files.get('xl/sharedStrings.xml')
  const shared = sharedFile ? parseSharedStrings(sharedFile.toString('utf8')) : []
  const sheets = [...files.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)[1]) - Number(b.match(/sheet(\d+)/)[1]))
  if (sheets.length === 0) throw new Error('xlsx 里没有工作表')
  const rows = parseSheet(files.get(sheets[0]).toString('utf8'), shared)
  return rows.map((row) => {
    const out = []
    for (let i = 0; i < row.length; i += 1) out.push(row[i] === undefined ? '' : String(row[i]))
    return out
  })
}

export const __testing = { parseSharedStrings, parseSheet, columnIndex, findEocd }
