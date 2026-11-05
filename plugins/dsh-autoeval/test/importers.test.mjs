import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCsv, parseJsonl, tableToRecords, detectQueryField, buildCases,
  parseFeishuLink, normalizeCell, createFeishu, importQueries,
} from '../importers.js'

test('CSV：引号、逗号、换行、BOM', () => {
  const rows = parseCsv('\uFEFFquery,note\n"含,逗号","带 ""引号"""\n普通,值\n')
  assert.deepEqual(rows, [['query', 'note'], ['含,逗号', '带 "引号"'], ['普通', '值']])
})

test('CSV：TSV 也能认', () => {
  const rows = parseCsv('query\tnote\n甲\t乙\n')
  assert.deepEqual(rows, [['query', 'note'], ['甲', '乙']])
})

test('JSONL：带行号的错误', () => {
  assert.equal(parseJsonl('{"a":1}\n{"b":2}\n').length, 2)
  assert.throws(() => parseJsonl('{"a":1}\n[*]\n'), /第 2 行/)
})

test('表格转记录：表头、空行、缺列', () => {
  const table = tableToRecords([['query', 'expect'], ['甲', 'A'], ['', ''], ['乙']])
  assert.deepEqual(table.fields, ['query', 'expect'])
  assert.equal(table.records.length, 2)
  assert.equal(table.records[1].expect, '')
})

test('query 列识别：候选词与兜底', () => {
  assert.equal(detectQueryField(['id', 'query', 'expect']), 'query')
  assert.equal(detectQueryField(['问题', '答案']), '问题')
  assert.equal(detectQueryField(['测试问题（probe）', '得分']), '测试问题（probe）')
  assert.equal(detectQueryField(['随便', '别的']), '随便')
})

test('buildCases：空 query 丢掉', () => {
  const built = buildCases([{ query: ' 甲 ' }, { query: '   ' }, { question: '乙' }], 'query')
  assert.equal(built.cases.length, 1)
  assert.equal(built.cases[0].query, '甲')
  assert.equal(built.skipped, 2)
})

test('飞书链接解析：表格 / 多维表格 / wiki', () => {
  assert.deepEqual(
    { ...parseFeishuLink('https://x.feishu.cn/sheets/abc123?sheet=sh1') },
    { kind: 'sheet', token: 'abc123', sheetId: 'sh1', tableId: '', viewId: '' },
  )
  const base = parseFeishuLink('https://x.feishu.cn/base/app1?table=tbl1&view=vew1')
  assert.equal(base.kind, 'bitable')
  assert.equal(base.token, 'app1')
  assert.equal(base.tableId, 'tbl1')
  assert.equal(base.viewId, 'vew1')
  assert.equal(parseFeishuLink('https://x.feishu.cn/wiki/node1').kind, 'wiki')
  assert.equal(parseFeishuLink('raw-token').token, 'raw-token')
})

test('单元格归一化：数组 / 富文本 / 数字', () => {
  assert.equal(normalizeCell([{ text: '甲' }, { text: '乙' }]), '甲乙')
  assert.equal(normalizeCell({ name: '选项A' }), '选项A')
  assert.equal(normalizeCell(42), '42')
  assert.equal(normalizeCell(null), '')
})

test('飞书表格：跳过没数据的工作表，按标题指定', async () => {
  const asked = []
  const runner = async (args) => {
    asked.push(args.join(' '))
    if (args[2].endsWith('/sheets/query')) {
      return { sheets: [
        { sheet_id: 's1', title: '空表', grid_properties: { row_count: 3, column_count: 5 } },
        { sheet_id: 's2', title: '有数据', grid_properties: { row_count: 10, column_count: 4 } },
      ] }
    }
    if (args[2].includes('/values/')) {
      const range = decodeURIComponent(args[2].split('/values/')[1])
      if (range.startsWith('s1!')) return { valueRange: { values: [[null, null], [null, null]] } }
      return { valueRange: { values: [['query', 'expect'], ['甲', 'A'], ['乙', 'B']] } }
    }
    throw new Error(`意外的调用 ${args.join(' ')}`)
  }
  const feishu = createFeishu(runner)
  const data = await feishu.sheet({ input: 'https://x.feishu.cn/sheets/tok1' })
  assert.equal(data.title, '有数据')
  assert.equal(data.sheetId, 's2')
  const table = tableToRecords(data.rows)
  assert.equal(table.records.length, 2)

  const explicit = await feishu.sheet({ input: 'https://x.feishu.cn/sheets/tok1', sheetId: '有数据' })
  assert.equal(explicit.sheetId, 's2')

  await assert.rejects(() => feishu.sheet({ input: 'https://x.feishu.cn/sheets/tok1', sheetId: '不存在' }), /没有叫「不存在」的工作表/)
})

test('飞书智能表格：字段顺序与记录', async () => {
  const runner = async (args) => {
    if (args[2].endsWith('/fields')) return { items: [{ field_name: 'query' }, { field_name: '得分' }] }
    if (args[2].endsWith('/records')) {
      return { items: [
        { fields: { query: [{ text: '甲' }, { text: '乙' }], 得分: 1 } },
        { fields: { query: '丙', 得分: 0 } },
      ] }
    }
    throw new Error(`意外的调用 ${args.join(' ')}`)
  }
  const feishu = createFeishu(runner)
  const data = await feishu.bitable({ input: 'https://x.feishu.cn/base/app1?table=tbl1' })
  assert.deepEqual(data.fields, ['query', '得分'])
  assert.equal(data.records.length, 2)
  assert.equal(data.records[0].query, '甲乙')
  assert.equal(data.records[1].得分, '0')
})

test('飞书接口报错会带上错误信息', async () => {
  const runner = async () => ({ ok: false, error: { code: 91402, message: 'NOTEXIST' } })
  const feishu = createFeishu(runner)
  // createFeishu 拿到的已经是 data，报错在 runLark 里拦；这里验 importQueries 的入口校验
  await assert.rejects(() => importQueries({ kind: 'sheet', link: '' }, { feishu }), /没认出表格 token/)
  await assert.rejects(() => importQueries({ kind: 'pdf' }, { feishu }), /不支持的导入来源/)
})
