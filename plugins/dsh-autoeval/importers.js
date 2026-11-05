// Query 集的导入：CSV / JSONL / XLSX 本地解析，飞书表格与智能表格走 lark-cli。
import { spawn } from 'node:child_process'
import { readXlsx } from './xlsx.js'

/** 认列名时按这个顺序挑，都不中就用第一列。 */
export const QUERY_CANDIDATES = [
  'query', 'q', 'question', '问题', '查询', '查询词', '查询语句', '关键词', 'keyword', 'term', 'text', '内容',
]

export function parseCsv(text) {
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/^\uFEFF/.test(source)) return parseCsv(source.slice(1))
  const delimiter = source.split('\n')[0].includes('\t') && !source.split('\n')[0].includes(',') ? '\t' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => String(value).trim() !== ''))
}

export function parseJsonl(text) {
  const records = []
  const lines = String(text || '').split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value = JSON.parse(trimmed)
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('每行应该是一个对象')
      }
      records.push(value)
    } catch (error) {
      throw new Error(`第 ${index + 1} 行不是合法 JSON：${error.message}`)
    }
  }
  return records
}

/** 表格（第一行表头）转成记录数组。 */
export function tableToRecords(rows) {
  if (!rows || rows.length === 0) return { fields: [], records: [] }
  const header = rows[0].map((cell, index) => {
    const name = String(cell || '').trim()
    return name || `第${index + 1}列`
  })
  const records = []
  for (const row of rows.slice(1)) {
    const record = {}
    let hasValue = false
    for (const [index, name] of header.entries()) {
      const value = row[index] === undefined || row[index] === null ? '' : String(row[index])
      record[name] = value
      if (value.trim() !== '') hasValue = true
    }
    if (hasValue) records.push(record)
  }
  return { fields: header, records }
}

export function detectQueryField(fields) {
  const list = fields || []
  const lower = list.map((field) => String(field).toLowerCase())
  for (const candidate of QUERY_CANDIDATES) {
    const hit = lower.indexOf(candidate)
    if (hit >= 0) return list[hit]
  }
  const fuzzy = list.find((field) => QUERY_CANDIDATES.some((candidate) => String(field).toLowerCase().includes(candidate)))
  return fuzzy || list[0] || ''
}

/** 记录数组 → 用例数组（每条至少带 query，空行的丢掉）。 */
export function buildCases(records, queryField) {
  const field = queryField || detectQueryField(Object.keys((records && records[0]) || {}))
  const cases = []
  let skipped = 0
  for (const record of records || []) {
    const query = String(record[field] === undefined || record[field] === null ? '' : record[field]).trim()
    if (!query) {
      skipped += 1
      continue
    }
    cases.push({ ...record, [field]: query })
  }
  return { cases, skipped, queryField: field }
}

// ------------------------------------------------------------------ 飞书

/** 从分享链接或裸 token 里抠出 token 与表 id。 */
export function parseFeishuLink(input) {
  const text = String(input || '').trim()
  if (!text) return { kind: '', token: '' }
  if (!/^https?:\/\//i.test(text)) {
    return { kind: '', token: text, sheetId: '', tableId: '', viewId: '' }
  }
  let url
  try {
    url = new URL(text)
  } catch {
    return { kind: '', token: text, sheetId: '', tableId: '', viewId: '' }
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const kind = parts[0] === 'sheets' ? 'sheet' : parts[0] === 'base' ? 'bitable' : parts[0] === 'wiki' ? 'wiki' : ''
  return {
    kind,
    token: parts[1] || '',
    sheetId: url.searchParams.get('sheet') || '',
    tableId: url.searchParams.get('table') || '',
    viewId: url.searchParams.get('view') || '',
  }
}

/** lark-cli 有时会在 JSON 前后带点提示，取第一对花括号之间的内容。 */
function parseLarkOutput(text) {
  const source = String(text || '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('没有 JSON')
  return JSON.parse(source.slice(start, end + 1))
}

function columnLetter(index) {
  let value = index
  let out = ''
  while (value > 0) {
    const rest = (value - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    value = Math.floor((value - 1) / 26)
  }
  return out || 'A'
}

function runLark(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('lark-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      reject(new Error(`没找到 lark-cli：${error.message}`))
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`lark-cli 超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error.code === 'ENOENT' ? new Error('这台机器上没有 lark-cli，没法读飞书文档') : error)
    })
    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      let parsed = null
      try {
        parsed = parseLarkOutput(stdout)
      } catch {
        reject(new Error(`lark-cli 输出不是 JSON：${(stdout || stderr).slice(0, 200)}`))
        return
      }
      if (parsed && parsed.ok === false) {
        const error = parsed.error || {}
        reject(new Error(`飞书接口报错：${error.message || '未知错误'}${error.code ? `（code ${error.code}）` : ''}`))
        return
      }
      resolve(parsed && parsed.data !== undefined ? parsed.data : parsed)
    })
  })
}

/** 飞书返回的单元格可能是数组 / 富文本对象，统一成字符串。 */
export function normalizeCell(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(normalizeCell).join('')
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.name === 'string') return value.name
    if (typeof value.link === 'string') return value.link
    if (typeof value.value === 'string') return value.value
    return JSON.stringify(value)
  }
  return String(value)
}

export function createFeishu(runner = runLark) {
  async function resolveToken(parsed, expected) {
    if (parsed.kind !== 'wiki') return parsed
    const data = await runner(['api', 'GET', '/open-apis/wiki/v2/spaces/get_node', '--params', JSON.stringify({ token: parsed.token })])
    const node = (data && data.node) || {}
    if (expected && node.obj_type && node.obj_type !== expected) {
      throw new Error(`这个 wiki 节点是 ${node.obj_type}，不是${expected === 'sheet' ? '表格' : '智能表格'}`)
    }
    return { ...parsed, kind: expected, token: node.obj_token || '' }
  }

  return {
    /** 读一块表格：没指定工作表就挑第一张有数据的，返回 { title, rows }。 */
    async sheet({ input, sheetId, range }) {
      let parsed = parseFeishuLink(input)
      if (!parsed.token) throw new Error('没认出表格 token，贴链接或 token 都行')
      parsed = await resolveToken(parsed, 'sheet')
      const token = parsed.token
      const meta = await runner(['api', 'GET', `/open-apis/sheets/v3/spreadsheets/${token}/sheets/query`])
      const sheets = (meta && meta.sheets) || []
      if (sheets.length === 0) throw new Error('这个表格里没有工作表')
      const titles = sheets.map((item) => item.title || item.sheet_id).join(' / ')
      const wanted = sheetId || parsed.sheetId || ''
      let candidates = sheets
      if (wanted) {
        const hit = sheets.find((item) => item.sheet_id === wanted || item.title === wanted)
        if (!hit) throw new Error(`没有叫「${wanted}」的工作表，可选：${titles}`)
        candidates = [hit]
      }
      const tried = []
      for (const sheet of candidates.slice(0, 8)) {
        const grid = sheet.grid_properties || {}
        const gridRows = Math.min(Number(grid.row_count) || 1000, 10000)
        const gridColumns = Math.min(Number(grid.column_count) || 26, 60)
        const target = range || `${sheet.sheet_id}!A1:${columnLetter(gridColumns)}${gridRows}`
        const data = await runner([
          'api', 'GET',
          `/open-apis/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(target)}`,
          '--params', JSON.stringify({ valueRenderOption: 'ToString', dateTimeRenderOption: 'FormattedString' }),
        ])
        const values = (data && data.valueRange && data.valueRange.values) || []
        const rows = values.map((row) => (row || []).map(normalizeCell))
        const table = tableToRecords(rows)
        tried.push(sheet.title || sheet.sheet_id)
        if (table.records.length > 0 || range) {
          return { title: sheet.title || '', sheetId: sheet.sheet_id, rows }
        }
      }
      throw new Error(`这几张工作表都没有数据：${tried.join(' / ')}（可以指定工作表）`)
    },

    /** 读一张多维表格：返回 { fields, records }。 */
    async bitable({ input, tableId, viewId }) {
      let parsed = parseFeishuLink(input)
      if (!parsed.token) throw new Error('没认出多维表格 token，贴链接或 token 都行')
      parsed = await resolveToken(parsed, 'bitable')
      const app = parsed.token
      parsed.tableId = tableId || parsed.tableId || ''
      parsed.viewId = viewId || parsed.viewId || ''
      if (!parsed.tableId) {
        const data = await runner(['api', 'GET', `/open-apis/bitable/v1/apps/${app}/tables`, '--params', JSON.stringify({ page_size: 100 })])
        const tables = (data && data.items) || []
        if (tables.length === 0) throw new Error('这个多维表格里没有数据表')
        parsed.tableId = tables[0].table_id
      }
      const fieldParams = { page_size: 100 }
      if (parsed.viewId) fieldParams.view_id = parsed.viewId
      let fields = []
      try {
        const data = await runner(['api', 'GET', `/open-apis/bitable/v1/apps/${app}/tables/${parsed.tableId}/fields`, '--params', JSON.stringify(fieldParams)])
        fields = ((data && data.items) || []).map((item) => item.field_name).filter(Boolean)
      } catch {
        fields = []
      }
      const recordParams = { page_size: 500 }
      if (parsed.viewId) recordParams.view_id = parsed.viewId
      const data = await runner([
        'api', 'GET',
        `/open-apis/bitable/v1/apps/${app}/tables/${parsed.tableId}/records`,
        '--params', JSON.stringify(recordParams),
        '--page-all',
      ])
      const items = (data && data.items) || []
      const records = items.map((item) => {
        const out = {}
        const source = item.fields || {}
        for (const [key, value] of Object.entries(source)) out[key] = normalizeCell(value)
        return out
      })
      if (fields.length === 0) {
        const seen = new Set()
        for (const record of records) for (const key of Object.keys(record)) if (!seen.has(key)) { seen.add(key); fields.push(key) }
      }
      return { fields, records }
    },
  }
}

/** 把各种来源统一成 { fields, cases, queryField, skipped, title }。 */
export async function importQueries(input, options = {}) {
  const kind = String((input && input.kind) || '').trim()
  const queryField = (input && input.queryField) || ''
  if (kind === 'jsonl') {
    const records = parseJsonl(input.text)
    const fields = fieldsOfRecords(records)
    const built = buildCases(records, queryField || detectQueryField(fields))
    return { ...built, fields, title: input.name || '' }
  }
  if (kind === 'csv' || kind === 'xlsx') {
    const rows = kind === 'csv'
      ? parseCsv(input.text)
      : readXlsx(Buffer.from(String(input.base64 || ''), 'base64'))
    const table = tableToRecords(rows)
    if (table.records.length === 0) throw new Error('文件里没有数据行（第一行要当表头）')
    const built = buildCases(table.records, queryField || detectQueryField(table.fields))
    return { ...built, fields: table.fields, title: input.name || '' }
  }
  if (kind === 'sheet' || kind === 'bitable') {
    const feishu = options.feishu || createFeishu()
    if (kind === 'sheet') {
      const data = await feishu.sheet({ input: input.link, sheetId: input.sheetId, range: input.range })
      const table = tableToRecords(data.rows)
      if (table.records.length === 0) throw new Error('表格里没有数据行（第一行要当表头）')
      const built = buildCases(table.records, queryField || detectQueryField(table.fields))
      return { ...built, fields: table.fields, title: data.title || '' }
    }
    const data = await feishu.bitable({ input: input.link, tableId: input.tableId, viewId: input.viewId })
    if (data.records.length === 0) throw new Error('这张表里没有记录')
    const built = buildCases(data.records, queryField || detectQueryField(data.fields))
    return { ...built, fields: data.fields, title: '' }
  }
  throw new Error(`不支持的导入来源：${kind || '（空）'}`)
}

function fieldsOfRecords(records) {
  const fields = []
  for (const record of records || []) {
    for (const key of Object.keys(record)) if (!fields.includes(key)) fields.push(key)
  }
  return fields
}

export const __testing = { fieldsOfRecords, runLark }
