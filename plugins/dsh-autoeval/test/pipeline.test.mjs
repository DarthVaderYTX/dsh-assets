// AutoEval 宿主侧回归测试：不装插件，用假 ctx 跑完整流水线。
//   node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
process.env.DSH_HOME = await fsp.mkdtemp(path.join(os.tmpdir(), 'autoeval-test-'))

const { apply, STAGES, BUILTIN_TEMPLATES } = await import(path.join(root, 'index.js'))

const searches = []
const routes = []

const ctx = {
  web: {
    async search({ query, maxResults }) {
      searches.push({ query, maxResults })
      if (query.includes('新能源汽车')) {
        return { content: '暂无数据', sources: [{ url: 'https://example.com/a', title: '统计口径', snippet: '暂无' }] }
      }
      return {
        content: `${query}：Python 3.13 新特性、TypeScript 5.9 release notes、每百万 tokens 定价、Linus 生于 Helsinki、macOS 26 新功能`,
        sources: [{ url: 'https://example.com/b', title: `${query} · 官方文档`, snippet: '发布说明' }],
      }
    },
  },
  get(name) { return name === 'web' ? this.web : undefined },
  webServer: { register(route) { routes.push(route); return () => {} } },
  effect(fn) { return fn() },
  tools: null,
}

apply(ctx, {})

function makeResponse() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(body) { this.body = body },
  }
}

async function call(method, pathAndQuery, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = pathAndQuery
  const res = makeResponse()
  await routes[0].handler(req, res)
  return { status: res.status, ...JSON.parse(res.body || '{}') }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForIdle() {
  for (let index = 0; index < 80; index += 1) {
    const state = await call('GET', '/autoeval-api/state')
    if (!state.active) return state
    await sleep(50)
  }
  throw new Error('运行没有在 4s 内结束')
}

const cases = JSON.parse(await fsp.readFile(path.join(here, 'small-set.json'), 'utf8'))

test('注册一条 HTTP 路由', () => {
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/autoeval-api')
})

test('阶段目录：四个阶段，每个都有内置模板和 custom', () => {
  assert.deepEqual(STAGES.map((stage) => stage.id), ['scraping', 'annotation', 'metrics', 'reporting'])
  for (const stage of STAGES) {
    assert.ok(stage.presets.length >= 2, `${stage.id} 预设太少`)
    assert.ok(stage.presets.some((preset) => preset.id === 'custom'), `${stage.id} 缺少 custom`)
    assert.ok(stage.presets.some((preset) => preset.id !== 'custom'), `${stage.id} 缺少内置模板`)
  }
})

test('内置 WebSearchTool 模板覆盖四个阶段', () => {
  const template = BUILTIN_TEMPLATES.find((item) => item.id === 'websearch-tool')
  assert.ok(template)
  for (const stage of STAGES) {
    assert.ok(template.stages[stage.id], `模板缺阶段 ${stage.id}`)
  }
})

test('/state 返回阶段、模板与历史', async () => {
  const state = await call('GET', '/autoeval-api/state')
  assert.equal(state.ok, true)
  assert.equal(state.stages.length, 4)
  assert.ok(state.templates.some((item) => item.id === 'websearch-tool'))
  assert.deepEqual(state.runs, [])
})

test('用内置模板跑完四个阶段并出指标与报告', async () => {
  const started = await call('POST', '/autoeval-api/run', {
    name: '回归测试', templateId: 'websearch-tool', cases,
  })
  assert.equal(started.ok, true)
  const state = await waitForIdle()
  const run = state.runs[0]
  assert.equal(run.id, started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  for (const stage of STAGES) assert.equal(run.stages[stage.id].status, 'done')

  // 折叠列表用的阶段摘要
  assert.deepEqual(Object.keys(run.stages.scraping.summary).sort(), ['cases', 'errors', 'material', 'sources'])
  assert.equal(run.stages.scraping.summary.cases, cases.length)
  assert.equal(run.stages.scraping.summary.errors, 0)
  assert.ok(run.stages.scraping.summary.sources > 0, '来源数为 0')
  assert.equal(run.stages.annotation.summary.passed, run.metrics.passed)
  assert.equal(run.stages.reporting.summary.rows, cases.length)

  const metrics = run.metrics
  assert.equal(metrics.total, cases.length)
  assert.equal(metrics.scored, cases.length)
  assert.ok(metrics.passed >= 1, '一条都没过')
  assert.ok(metrics.passed < cases.length, '故意留的难题没掉')
  assert.equal(metrics.scrapeErrors, 0)
  assert.ok(metrics.latency.p50Ms >= 0)

  const report = await call('GET', `/autoeval-api/report?run=${run.id}`)
  assert.ok(report.text.includes('# AutoEval 报告'))
  assert.ok(report.text.includes('通过率（分母=有分数的行）'))
  assert.ok(!report.text.includes('结束：null'), '报告结束时间没填')

  const rows = await call('GET', `/autoeval-api/rows?run=${run.id}`)
  const parsed = rows.text.trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(parsed.length, cases.length)
  const hard = parsed.find((item) => item.id === 'c6')
  assert.equal(hard.score, 0)
  assert.ok(hard.missed.length > 0)
})

test('四个阶段全部换成自定义命令也能跑通', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'autoeval-custom-'))
  const write = async (name, body) => {
    const file = path.join(dir, name)
    await fsp.writeFile(file, body, { mode: 0o755 })
    return file
  }
  const node = (script) => `#!/bin/bash\nnode -e '\nlet raw="";process.stdin.on("data",c=>raw+=c).on("end",()=>{const p=JSON.parse(raw);${script}});'\n`
  const files = {
    scraping: await write('scrape.sh', node('process.stdout.write(JSON.stringify(p.cases.map(c=>({...c,material:"Python 3.13 TypeScript 5.9 百万 Linus macOS",sources:[{url:"https://x",title:"t"}],latencyMs:7}))));')),
    annotation: await write('judge.sh', node('process.stdout.write(JSON.stringify(p.cases.map(c=>({...c,score:1,coverage:1,missed:[]}))));')),
    metrics: await write('metrics.sh', node('process.stdout.write(JSON.stringify({total:p.cases.length,custom:true}));')),
    reporting: await write('report.sh', node('process.stdout.write(JSON.stringify({text:"# 自定义报告 "+p.metrics.total,format:"markdown"}));')),
  }
  const started = await call('POST', '/autoeval-api/run', {
    name: '自定义阶段',
    cases: cases.slice(0, 2),
    stages: Object.fromEntries(
      Object.entries(files).map(([stage, file]) => [stage, { template: 'custom', config: { command: `bash ${file}` } }]),
    ),
  })
  assert.equal(started.ok, true)
  const state = await waitForIdle()
  const run = state.runs[0]
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  const report = await call('GET', `/autoeval-api/report?run=${run.id}`)
  assert.ok(report.text.startsWith('# 自定义报告'))
  assert.ok(!report.text.includes('通过率'), '自定义报告没接管')
})

test('分类指标模板按字段分组', async () => {
  const started = await call('POST', '/autoeval-api/run', {
    name: '分组',
    cases: cases.slice(0, 4),
    stages: {
      scraping: { template: 'inline', config: {} },
      annotation: { template: 'coverage-keyword', config: { pointsField: 'infoPoints', minCoverage: 1 } },
      metrics: { template: 'grouped', config: { groupBy: 'bucket' } },
      reporting: { template: 'json', config: {} },
    },
  }).catch((error) => ({ ok: false, error: String(error) }))
  if (!started.ok) throw new Error(started.error)
  const state = await waitForIdle()
  const run = state.runs[0]
  // inline 模式没有材料，全部判 0，但分组字段要出现
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  assert.ok(run.metrics.groups, '没有分组结果')
  assert.deepEqual(Object.keys(run.metrics.groups).sort(), ['hard', 'stable'].filter((key) => cases.slice(0, 4).some((item) => item.bucket === key)).sort())
})

test('存储写入 state.json 与 runs/<id>/', async () => {
  const stateFile = path.join(process.env.DSH_HOME, 'storages', 'autoeval', 'state.json')
  const raw = JSON.parse(await fsp.readFile(stateFile, 'utf8'))
  assert.ok(raw.runs.length >= 3)
  const run = raw.runs[0]
  const report = await fsp.readFile(run.artifacts.report, 'utf8')
  assert.ok(report.length > 0)
  const rows = await fsp.readFile(run.artifacts.rows, 'utf8')
  assert.ok(rows.trim().split('\n').length >= 1)
})

test('任务详情返回阶段配置与日志', async () => {
  const state = await call('GET', '/autoeval-api/state')
  const target = state.runs[0]
  const detail = await call('GET', `/autoeval-api/runs/detail?id=${target.id}`)
  assert.equal(detail.ok, true)
  assert.equal(detail.run.id, target.id)
  assert.ok(Array.isArray(detail.log) && detail.log.length >= 8, '日志太短')
  for (const stage of STAGES) {
    assert.equal(detail.run.stages[stage.id].template, target.stages[stage.id].template)
  }
  assert.ok(detail.run.stages.scraping.config, '阶段参数没存下来')
})

test('重跑沿用原用例与阶段配置', async () => {
  const state = await call('GET', '/autoeval-api/state')
  const source = state.runs[0]
  const rerun = await call('POST', '/autoeval-api/runs/rerun', { id: source.id })
  assert.equal(rerun.ok, true)
  assert.notEqual(rerun.runId, source.id)
  const after = await waitForIdle()
  const fresh = after.runs.find((item) => item.id === rerun.runId)
  assert.ok(fresh, '重跑没有进历史')
  assert.equal(fresh.status, 'done', JSON.stringify(fresh.error || fresh.log))
  assert.equal(fresh.caseCount, source.caseCount)
  assert.equal(fresh.metrics.total, source.metrics.total)
  for (const stage of STAGES) {
    assert.equal(fresh.stages[stage.id].template, source.stages[stage.id].template)
  }
})

test('删除运行会连产物目录一起删掉', async () => {
  const state = await call('GET', '/autoeval-api/state')
  const victim = state.runs[0]
  const dir = victim.artifacts.dir
  await fsp.access(dir)
  const removed = await call('DELETE', `/autoeval-api/runs?id=${victim.id}`)
  assert.equal(removed.removed, victim.id)
  const after = await call('GET', '/autoeval-api/state')
  assert.ok(!after.runs.some((item) => item.id === victim.id), '记录还在')
  await assert.rejects(fsp.access(dir), '产物目录没删')
  const missing = await call('GET', `/autoeval-api/report?run=${victim.id}`)
  assert.equal(missing.ok, false)
})

test('带已知模板提交时忽略外部塞进来的阶段配置', async () => {
  const started = await call('POST', '/autoeval-api/run', {
    name: '模板优先',
    templateId: 'websearch-tool',
    cases: cases.slice(0, 1),
    stages: { scraping: { template: 'inline' }, annotation: { template: 'custom', config: { command: 'exit 1' } } },
  })
  assert.equal(started.ok, true)
  const state = await waitForIdle()
  const run = state.runs.find((item) => item.id === started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  assert.equal(run.stages.scraping.template, 'websearch', '阶段配置没按模板走')
  assert.equal(run.stages.annotation.template, 'coverage-keyword')
})

test('空用例与非法的阶段模板都被拒绝', async () => {
  const empty = await call('POST', '/autoeval-api/run', { cases: [] })
  assert.equal(empty.ok, false)
  assert.match(empty.error, /用例/)
  const bad = await call('POST', '/autoeval-api/run', {
    cases: [{ id: 'x', query: 'q' }],
    stages: { scraping: { template: 'nope' } },
  })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /没有执行模板/)
})

test('状态接口把字段 schema 一起发出来', async () => {
  const state = await call('GET', '/autoeval-api/state')
  const scraping = state.stages.find((item) => item.id === 'scraping')
  const websearch = scraping.presets.find((item) => item.id === 'websearch')
  assert.ok(Array.isArray(websearch.fields) && websearch.fields.length === 3)
  const maxResults = websearch.fields.find((item) => item.key === 'maxResults')
  assert.equal(maxResults.type, 'number')
  assert.equal(maxResults.min, 1)
  assert.equal(maxResults.max, 20)
  const sections = state.stages
    .find((item) => item.id === 'reporting')
    .presets.find((item) => item.id === 'markdown')
    .fields.find((item) => item.key === 'sections')
  assert.equal(sections.type, 'list')
  assert.deepEqual(sections.options.map((item) => item.value), ['summary', 'stages', 'cases', 'failures'])
})

test('自定义模板存成 YAML 文件，能读回来也能删', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'my-template',
    name: '我的模板',
    description: '换个抓取间隔',
    stages: {
      scraping: { template: 'websearch', config: { maxResults: 8, queryField: 'q', intervalMs: 0 } },
      annotation: { template: 'coverage-keyword', config: {} },
      metrics: { template: 'standard', config: {} },
      reporting: { template: 'markdown', config: { sections: ['summary'] } },
    },
  })
  assert.equal(saved.ok, true, saved.error)

  // 落盘为 templates/my-template.yaml，带注释、能解析
  const file = path.join(process.env.DSH_HOME, 'storages', 'autoeval', 'templates', 'my-template.yaml')
  const text = await fsp.readFile(file, 'utf8')
  assert.ok(text.includes('maxResults: 8'), text)
  assert.ok(text.includes('#'), 'YAML 里应该有字段说明注释')

  const raw = await call('GET', '/autoeval-api/templates/raw?id=my-template')
  assert.equal(raw.ok, true)
  assert.equal(raw.file, file)
  assert.ok(raw.yaml.includes('name: 我的模板'))

  let state = await call('GET', '/autoeval-api/state')
  const found = state.templates.find((item) => item.id === 'my-template')
  assert.equal(found.name, '我的模板')
  assert.equal(found.stages.scraping.config.maxResults, 8)
  assert.equal(found.broken, null)

  const removed = await call('DELETE', '/autoeval-api/templates?id=my-template')
  assert.equal(removed.removed, 1)
  state = await call('GET', '/autoeval-api/state')
  assert.ok(!state.templates.some((item) => item.id === 'my-template'))
})

test('模板可以整段 YAML 写进去', async () => {
  const yaml = [
    'id: yaml-template',
    'name: 直接改 YAML 的模板',
    'description: 手写',
    'stages:',
    '  scraping:',
    '    template: websearch',
    '    config:',
    '      maxResults: 3',
    '  annotation:',
    '    template: coverage-rubric',
    '    config:',
    '      minCoverage: 0.8',
    '  metrics:',
    '    template: grouped',
    '    config:',
    '      groupBy: bucket',
    '  reporting:',
    '    template: markdown',
    '    config:',
    '      sections: [summary, cases]',
    '',
  ].join('\n')
  const saved = await call('POST', '/autoeval-api/templates/raw', { yaml })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(saved.template.id, 'yaml-template')
  assert.equal(saved.template.stages.metrics.template, 'grouped')
  assert.deepEqual(saved.template.stages.reporting.config.sections, ['summary', 'cases'])

  const again = await call('GET', '/autoeval-api/templates/raw?id=yaml-template')
  const saved2 = await call('POST', '/autoeval-api/templates/raw', { yaml: again.yaml })
  assert.equal(saved2.ok, true, saved2.error)
  assert.equal(saved2.template.stages.annotation.config.minCoverage, 0.8)
  await call('DELETE', '/autoeval-api/templates?id=yaml-template')
})

test('用自定义模板提交时，阶段参数来自 YAML 文件', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'fast-template',
    name: '快检模板',
    stages: {
      scraping: { template: 'websearch', config: { maxResults: 2, queryField: 'query', intervalMs: 0 } },
      annotation: { template: 'coverage-keyword', config: { pointsField: 'infoPoints', minCoverage: 1 } },
      metrics: { template: 'standard', config: { latencyField: 'latencyMs' } },
      reporting: { template: 'markdown', config: { sections: ['summary'] } },
    },
  })
  assert.equal(saved.ok, true, saved.error)

  const before = searches.length
  const started = await call('POST', '/autoeval-api/run', { name: '按 YAML 模板跑', templateId: 'fast-template', cases: cases.slice(0, 1) })
  assert.equal(started.ok, true, started.error)
  const state = await waitForIdle()
  const run = state.runs.find((item) => item.id === started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  assert.equal(run.stages.scraping.config.maxResults, 2, '运行记录里的参数不是模板里的')
  assert.equal(run.stages.scraping.config.intervalMs, 0)
  assert.deepEqual(run.stages.reporting.config.sections, ['summary'])
  const used = searches.slice(before)
  assert.ok(used.length > 0 && used.every((item) => item.maxResults === 2), `检索没用模板里的条数：${JSON.stringify(used)}`)
  await call('DELETE', '/autoeval-api/templates?id=fast-template')
})

test('工作区：路径、计数、配置读写', async () => {
  await call('POST', '/autoeval-api/templates', {
    id: 'workspace-probe',
    name: '工作区探针',
    stages: {
      scraping: { template: 'inline', config: {} },
      annotation: { template: 'coverage-keyword', config: {} },
      metrics: { template: 'standard', config: {} },
      reporting: { template: 'markdown', config: {} },
    },
  })
  const state = await call('GET', '/autoeval-api/state')
  const workspace = state.workspace
  assert.ok(workspace, '没有工作区信息')
  assert.equal(workspace.dir, path.join(process.env.DSH_HOME, 'storages', 'autoeval'))
  assert.equal(workspace.configPath, path.join(workspace.dir, 'config.yaml'))
  assert.ok(workspace.templatesDir.endsWith(path.join('autoeval', 'templates')))
  assert.equal(workspace.templates, 1, '模板计数不对')
  assert.equal(workspace.runs, state.runs.length, '运行目录数应与记录数一致')
  assert.ok(workspace.bytes > 0, '占用应为正数')
  assert.equal(workspace.config.maxRuns, 30)
  assert.equal(workspace.config.commandTimeoutMs, 120000)
  assert.deepEqual(workspace.fields.map((field) => field.key), ['maxRuns', 'defaultTemplate', 'commandTimeoutMs'])

  const saved = await call('POST', '/autoeval-api/workspace/config', {
    maxRuns: 12, defaultTemplate: 'websearch-tool', commandTimeoutMs: 30000,
  })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(saved.config.maxRuns, 12)

  // 配置文件真的落盘，且带注释
  const text = await fsp.readFile(workspace.configPath, 'utf8')
  assert.ok(text.includes('maxRuns: 12'), text)
  assert.ok(text.includes('#'), '配置里应该有字段说明')

  // 越界会被挡住
  const bad = await call('POST', '/autoeval-api/workspace/config', { maxRuns: 5000 })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /不能大于 500/)

  // 直接改文件也能读到
  await fsp.writeFile(workspace.configPath, 'maxRuns: 7\ncommandTimeoutMs: 5000\n', 'utf8')
  const again = await call('GET', '/autoeval-api/state')
  assert.equal(again.workspace.config.maxRuns, 7)
  assert.equal(again.workspace.config.commandTimeoutMs, 5000)

  await call('POST', '/autoeval-api/workspace/config', {
    maxRuns: 30, defaultTemplate: 'websearch-tool', commandTimeoutMs: 120000,
  })
  await call('DELETE', '/autoeval-api/templates?id=workspace-probe')
})

test('Queryset：导入 CSV / JSONL / XLSX，增删改查', async () => {
  // CSV
  const csv = await call('POST', '/autoeval-api/querysets/import', {
    kind: 'csv',
    text: 'query,expect,备注\n"DSH 是什么","本地运行时","含,逗号"\nAutoEval 四个阶段,抓取/标注/指标/报告,\n,空行要丢掉,\n',
  })
  assert.equal(csv.ok, true, csv.error)
  assert.equal(csv.total, 2, '空 query 的行应该被丢掉')
  assert.equal(csv.skipped, 1)
  assert.equal(csv.queryField, 'query')
  assert.deepEqual(csv.fields, ['query', 'expect', '备注'])
  assert.equal(csv.cases[0].expect, '本地运行时')

  // JSONL
  const jsonl = await call('POST', '/autoeval-api/querysets/import', {
    kind: 'jsonl',
    text: '{"question":"怎么装插件","expect":"看 README"}\n{"question":"","expect":"丢掉"}\n',
  })
  assert.equal(jsonl.ok, true, jsonl.error)
  assert.equal(jsonl.total, 1)
  assert.equal(jsonl.queryField, 'question', '应该认出 question 是 query 列')

  // XLSX（openpyxl 生成的夹具，第一行是表头）
  const xlsxBase64 = (await fsp.readFile(new URL('./fixtures/queries.xlsx', import.meta.url))).toString('base64')
  const xlsx = await call('POST', '/autoeval-api/querysets/import', { kind: 'xlsx', base64: xlsxBase64 })
  assert.equal(xlsx.ok, true, xlsx.error)
  assert.equal(xlsx.total, 3)
  assert.equal(xlsx.cases[1].query, 'AutoEval 支持哪些阶段')
  assert.equal(xlsx.cases[1]['备注'], '含,逗号', 'xlsx 里的逗号不该被拆开')

  // 存下来
  const saved = await call('POST', '/autoeval-api/querysets', {
    id: 'qs-small', name: '小测试集', description: '六条',
    fields: csv.fields, queryField: 'query', source: { kind: 'csv' }, cases: csv.cases,
  })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(saved.queryset.count, 2)

  const list = await call('GET', '/autoeval-api/querysets')
  assert.ok(list.querysets.some((item) => item.id === 'qs-small'))

  const detail = await call('GET', '/autoeval-api/querysets?id=qs-small')
  assert.equal(detail.queryset.cases.length, 2)
  assert.equal(detail.queryset.queryField, 'query')

  // 文件真的落在工作区里
  const file = path.join(process.env.DSH_HOME, 'storages', 'autoeval', 'querysets', 'qs-small.json')
  const onDisk = JSON.parse(await fsp.readFile(file, 'utf8'))
  assert.equal(onDisk.cases.length, 2)

  // 改
  const updated = await call('POST', '/autoeval-api/querysets', {
    id: 'qs-small', name: '小测试集 v2', fields: csv.fields, cases: [csv.cases[0]],
  })
  assert.equal(updated.queryset.name, '小测试集 v2')
  assert.equal(updated.queryset.count, 1)

  // 用 Queryset跑一次
  const run = await call('POST', '/autoeval-api/run', { name: '按集跑', templateId: 'websearch-tool', querysetId: 'qs-small' })
  assert.equal(run.ok, true, run.error)
  const state = await waitForIdle()
  const record = state.runs.find((item) => item.id === run.runId)
  assert.equal(record.caseCount, 1, '应该按 Queryset的用例数跑')
  assert.equal(record.querysetId, 'qs-small')

  // 删
  const removed = await call('DELETE', '/autoeval-api/querysets?id=qs-small')
  assert.equal(removed.ok, true)
  assert.equal((await call('GET', '/autoeval-api/querysets')).querysets.some((item) => item.id === 'qs-small'), false)
})

test('Queryset：坏输入被挡住', async () => {
  const badId = await call('POST', '/autoeval-api/querysets', { id: 'Bad Id', cases: [{ query: 'x' }] })
  assert.equal(badId.ok, false)
  assert.match(badId.error, /id 只能用/)

  const noCases = await call('POST', '/autoeval-api/querysets', { id: 'qs-empty', cases: [] })
  assert.equal(noCases.ok, false)
  assert.match(noCases.error, /没有用例/)

  const noQuery = await call('POST', '/autoeval-api/querysets', { id: 'qs-noquery', cases: [{ expect: 'x' }] })
  assert.equal(noQuery.ok, false)
  assert.match(noQuery.error, /缺 query/)

  const badKind = await call('POST', '/autoeval-api/querysets/import', { kind: 'pdf', text: '' })
  assert.equal(badKind.ok, false)
  assert.match(badKind.error, /不支持的导入来源/)

  const badJsonl = await call('POST', '/autoeval-api/querysets/import', { kind: 'jsonl', text: '{"a":1}\nnot json\n' })
  assert.equal(badJsonl.ok, false)
  assert.match(badJsonl.error, /第 2 行/)

  const missing = await call('GET', '/autoeval-api/querysets?id=nope')
  assert.equal(missing.ok, false)
  assert.match(missing.error, /没有这个 Queryset/)
})

test('保留次数按工作区配置裁剪', async () => {
  await call('POST', '/autoeval-api/workspace/config', { maxRuns: 1, defaultTemplate: 'websearch-tool', commandTimeoutMs: 120000 })
  const started = await call('POST', '/autoeval-api/run', { name: '只留一条', templateId: 'websearch-tool', cases: cases.slice(0, 1) })
  assert.equal(started.ok, true, started.error)
  const state = await waitForIdle()
  assert.equal(state.runs.length, 1, '应该按 maxRuns 裁剪到 1 条')
  assert.equal(state.runs[0].id, started.runId)
  await call('POST', '/autoeval-api/workspace/config', { maxRuns: 30, defaultTemplate: 'websearch-tool', commandTimeoutMs: 120000 })
})

test('老 state.json 里的模板启动时迁成 YAML 文件', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'autoeval-migrate-'))
  const dir = path.join(home, 'storages', 'autoeval')
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'state.json'), JSON.stringify({
    version: 1,
    templates: [{
      id: 'legacy-template',
      name: '老的模板',
      description: '迁移前存在 json 里',
      stages: {
        scraping: { template: 'websearch', config: { maxResults: 4 } },
        annotation: { template: 'coverage-keyword', config: {} },
        metrics: { template: 'standard', config: {} },
        reporting: { template: 'markdown', config: {} },
      },
    }],
    runs: [],
  }), 'utf8')

  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const migrateRoutes = []
  const migrateCtx = {
    web: { async search() { return { content: '', sources: [] } } },
    get: () => undefined,
    effect(fn) { fn() },
    webServer: { register(route) { migrateRoutes.push(route); return () => {} } },
  }
  apply(migrateCtx, {})
  // 迁移是异步的，等它落盘
  for (let index = 0; index < 40; index += 1) {
    try {
      await fsp.access(path.join(dir, 'templates', 'legacy-template.yaml'))
      break
    } catch {
      await sleep(50)
    }
  }
  const yaml = await fsp.readFile(path.join(dir, 'templates', 'legacy-template.yaml'), 'utf8')
  assert.ok(yaml.includes('id: legacy-template'), yaml)
  assert.ok(yaml.includes('maxResults: 4'), yaml)
  const state = JSON.parse(await fsp.readFile(path.join(dir, 'state.json'), 'utf8'))
  assert.deepEqual(state.templates, [], 'state.json 里的模板应该清空')
  process.env.DSH_HOME = previousHome
})

test('坏配置会被挡住：字段越界、阶段缺失、YAML 语法错', async () => {
  const bad = async (body) => {
    const result = await call('POST', '/autoeval-api/templates', body)
    assert.equal(result.ok, false, '本该被拒绝')
    return result.error
  }
  const base = {
    scraping: { template: 'websearch', config: {} },
    annotation: { template: 'coverage-keyword', config: {} },
    metrics: { template: 'standard', config: {} },
    reporting: { template: 'markdown', config: {} },
  }
  assert.match(await bad({
    id: 'bad-1', name: 'x', stages: { ...base, scraping: { template: 'websearch', config: { maxResults: 999 } } },
  }), /不能大于 20/)
  assert.match(await bad({
    id: 'bad-2', name: 'x', stages: { ...base, annotation: { template: 'coverage-keyword', config: { minCoverage: 2 } } },
  }), /不能大于 1/)
  assert.match(await bad({
    id: 'bad-3', name: 'x', stages: { ...base, reporting: { template: 'markdown', config: { sections: ['nope'] } } },
  }), /不认识的取值/)
  assert.match(await bad({
    id: 'bad-4', name: 'x', stages: { ...base, scraping: { template: 'custom', config: {} } },
  }), /缺少 command/)
  assert.match(await bad({ id: 'bad-5', name: 'x', stages: { scraping: base.scraping } }), /缺少阶段 annotation/)
  assert.match(await bad({ id: 'Bad Id', name: 'x', stages: base }), /模板 id 只能用/)
  const raw = await call('POST', '/autoeval-api/templates/raw', { yaml: 'id: x\n  bad: indent' })
  assert.equal(raw.ok, false)
  assert.match(raw.error, /YAML 解析失败/)
})

test('手写坏的 YAML 文件不会被吞掉，列表里带 broken 标记', async () => {
  const dir = path.join(process.env.DSH_HOME, 'storages', 'autoeval', 'templates')
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'broken.yaml'), 'id: broken\nname: 坏的\nstages: [\n', 'utf8')
  const state = await call('GET', '/autoeval-api/state')
  const broken = state.templates.find((item) => item.id === 'broken')
  assert.ok(broken, '坏文件也要出现在列表里')
  assert.ok(broken.broken && broken.broken.length > 0, '应带解析错误')
  await fsp.unlink(path.join(dir, 'broken.yaml'))
})
