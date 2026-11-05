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

const { apply, STAGES, BUILTIN_TEMPLATES, normalizeTemplate } = await import(path.join(root, 'index.js'))

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

/** 等这一次运行真的落进 state（并发时单看 active 可能读到上一次的 runs[0]）。 */
async function waitForRun(runId) {
  for (let index = 0; index < 120; index += 1) {
    const state = await call('GET', '/autoeval-api/state')
    const found = (state.runs || []).find((item) => item.id === runId)
    if (found && !state.active) return { state, run: found }
    await sleep(50)
  }
  throw new Error(`运行 ${runId} 没有在 6s 内落进 state`)
}

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
  const template = normalizeTemplate(BUILTIN_TEMPLATES.find((item) => item.id === 'websearch-tool'))
  assert.ok(template)
  for (const stage of STAGES) {
    assert.ok(template.stages.some((item) => item.id === stage.id), `模板缺阶段 ${stage.id}`)
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
  assert.match(bad.error, /没有执行模块/)
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

test('自定义模板存成 YAML 文件，只存阶段编排', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'my-template',
    name: '我的模板',
    description: '多插一个重排',
    stages: [
      { id: 'scraping', module: 'websearch', config: { maxResults: 8 } },
      { id: 'rerank', name: '重排', module: 'custom', config: { command: 'echo {}' } },
      { id: 'annotation' },
      { id: 'metrics' },
      { id: 'reporting' },
    ],
  })
  assert.equal(saved.ok, true, saved.error)
  assert.deepEqual(saved.template.stages, [
    { id: 'scraping', kind: 'preset' },
    { id: 'rerank', kind: 'custom', name: '重排' },
    { id: 'annotation', kind: 'preset' },
    { id: 'metrics', kind: 'preset' },
    { id: 'reporting', kind: 'preset' },
  ], '模板不该存模块与参数')

  // 落盘为 templates/my-template.yaml，带注释、能解析
  const file = path.join(process.env.DSH_HOME, 'storages', 'autoeval', 'templates', 'my-template.yaml')
  const text = await fsp.readFile(file, 'utf8')
  assert.ok(!text.includes('maxResults'), 'YAML 里不该有模块参数')
  assert.ok(text.includes('#'), 'YAML 里应该有说明注释')

  const raw = await call('GET', '/autoeval-api/templates/raw?id=my-template')
  assert.equal(raw.ok, true)
  assert.equal(raw.file, file)
  assert.ok(raw.yaml.includes('name: 我的模板'))

  let state = await call('GET', '/autoeval-api/state')
  const found = state.templates.find((item) => item.id === 'my-template')
  assert.equal(found.name, '我的模板')
  assert.equal(found.stages.find((item) => item.id === 'rerank').name, '重排')
  assert.equal(found.stages.find((item) => item.id === 'scraping').module, undefined, '不该有模块')
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
    '  - id: scraping',
    '  - id: rerank',
    '    kind: custom',
    '    name: 重排',
    '  - id: annotation',
    '  - id: metrics',
    '  - id: reporting',
    '',
  ].join('\n')
  const saved = await call('POST', '/autoeval-api/templates/raw', { yaml })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(saved.template.id, 'yaml-template')
  assert.deepEqual(saved.template.stages.map((item) => item.id),
    ['scraping', 'rerank', 'annotation', 'metrics', 'reporting'])
  assert.equal(saved.template.stages[1].name, '重排')

  const again = await call('GET', '/autoeval-api/templates/raw?id=yaml-template')
  const saved2 = await call('POST', '/autoeval-api/templates/raw', { yaml: again.yaml })
  assert.equal(saved2.ok, true, saved2.error)
  assert.deepEqual(saved2.template.stages.map((item) => item.id), ['scraping', 'rerank', 'annotation', 'metrics', 'reporting'])

  // 老格式（阶段对象 + template/config）也能读，只是实现那部分被忽略
  const legacy = await call('POST', '/autoeval-api/templates/raw', {
    yaml: [
      'id: legacy-yaml',
      'name: 老格式',
      'stages:',
      '  scraping: { template: websearch, config: { maxResults: 9 } }',
      '  annotation: { template: coverage-rubric }',
      '',
    ].join('\n'),
  })
  assert.equal(legacy.ok, true, legacy.error)
  assert.deepEqual(legacy.template.stages.map((item) => item.id), ['scraping', 'annotation'])
  await call('DELETE', '/autoeval-api/templates?id=legacy-yaml')
  await call('DELETE', '/autoeval-api/templates?id=yaml-template')
})

test('模板只给顺序：各阶段实现由提交时的分组决定', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'fast-template',
    name: '快检模板',
    stages: [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }],
  })
  assert.equal(saved.ok, true, saved.error)
  assert.deepEqual(saved.template.stages.map((stage) => stage.id), ['scraping', 'annotation', 'metrics', 'reporting'])

  const before = searches.length
  const started = await call('POST', '/autoeval-api/run', {
    name: '按分组跑',
    templateId: 'fast-template',
    cases: cases.slice(0, 1),
    groups: [{
      id: 'control', kind: 'control', name: 'Control',
      stages: {
        scraping: { module: 'websearch', config: { maxResults: 2, queryField: 'query', intervalMs: 0 } },
        annotation: { module: 'coverage-keyword', config: { pointsField: 'infoPoints', minCoverage: 1 } },
        metrics: { module: 'standard', config: { latencyField: 'latencyMs' } },
        reporting: { module: 'markdown', config: { sections: ['summary'] } },
      },
    }],
  })
  assert.equal(started.ok, true, started.error)
  const { run } = await waitForRun(started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error || run.log))
  assert.equal(run.stages.scraping.config.maxResults, 2, '运行记录里的参数不是提交时给的')
  assert.equal(run.stages.scraping.config.intervalMs, 0)
  assert.deepEqual(run.stages.reporting.config.sections, ['summary'])
  const used = searches.slice(before)
  assert.ok(used.length > 0 && used.every((item) => item.maxResults === 2), `检索没用提交时的条数：${JSON.stringify(used)}`)
  await call('DELETE', '/autoeval-api/templates?id=fast-template')
})

test('工作区：路径、计数、配置读写', async () => {
  const probe = await call('POST', '/autoeval-api/templates', {
    id: 'workspace-probe',
    name: '工作区探针',
    stages: [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }],
  })
  assert.equal(probe.ok, true, probe.error)
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

test('阶段顺序：预置阶段不能调换，自定义阶段可以插在中间', async () => {
  const base = [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }]
  const swapped = await call('POST', '/autoeval-api/templates', {
    id: 'bad-order', name: 'x', stages: [base[1], base[0], base[2], base[3]],
  })
  assert.equal(swapped.ok, false)
  assert.match(swapped.error, /先后不能改/)

  // 预置阶段可以删：只留前三个也能存
  const subset = await call('POST', '/autoeval-api/templates', {
    id: 'subset-stage', name: 'x', stages: [base[0], base[1], base[2]],
  })
  assert.equal(subset.ok, true, subset.error)
  assert.deepEqual(subset.template.stages.map((stage) => stage.id), ['scraping', 'annotation', 'metrics'])

  const command = `node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);process.stdout.write(JSON.stringify({cases:p.cases.map(c=>Object.assign({},c,{reranked:p.stage}))}))})"`
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'with-custom',
    name: '带自定义阶段',
    stages: [base[0], { id: 'rerank', name: '重排' }, base[1], base[2], base[3]],
  })
  assert.equal(saved.ok, true, saved.error)
  assert.deepEqual(saved.template.stages.map((item) => item.id), ['scraping', 'rerank', 'annotation', 'metrics', 'reporting'])

  const started = await call('POST', '/autoeval-api/run', {
    templateId: 'with-custom',
    cases,
    groups: [{
      id: 'control', kind: 'control',
      stages: {
        scraping: { module: 'websearch' },
        rerank: { module: 'custom', config: { command } },
        annotation: { module: 'coverage-keyword' },
        metrics: { module: 'standard' },
        reporting: { module: 'markdown' },
      },
    }],
  })
  assert.equal(started.ok, true, started.error)
  const { run } = await waitForRun(started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error))
  assert.deepEqual(Object.keys(run.stages), ['scraping', 'rerank', 'annotation', 'metrics', 'reporting'])
  assert.equal(run.stages.rerank.kind, 'custom')
  assert.equal(run.stages.rerank.summary.cases, cases.length)
  const rows = await call('GET', `/autoeval-api/rows?run=${run.id}`)
  const first = JSON.parse(rows.text.trim().split('\n')[0])
  assert.equal(first.reranked, 'rerank', '自定义阶段没跑起来')
})

test('阶段可以删到只剩抓取和自定义：没有 metrics/reporting 也能跑完', async () => {
  const command = `node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);process.stdout.write(JSON.stringify({cases:p.cases.map(c=>Object.assign({},c,{tag:p.stage}))}))})"`
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'slim-template',
    name: '精简模板',
    stages: [{ id: 'scraping' }, { id: 'annotation' }, { id: 'tag', name: '打标' }],
  })
  assert.equal(saved.ok, true, saved.error)

  const started = await call('POST', '/autoeval-api/run', {
    templateId: 'slim-template',
    cases: [{ id: 's1', query: '一', material: '苹果', infoPoints: ['苹果'] }],
    groups: [{
      id: 'control', kind: 'control',
      stages: {
        scraping: { module: 'inline' },
        annotation: { module: 'coverage-keyword', config: { minCoverage: 1 } },
        tag: { module: 'custom', config: { command } },
      },
    }],
  })
  assert.equal(started.ok, true, started.error)
  const { run } = await waitForRun(started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error))
  assert.deepEqual(Object.keys(run.groups[0].stages), ['scraping', 'annotation', 'tag'])
  assert.equal(run.metrics.derived, true, '没有 metrics 阶段时应补一份兜底指标')
  assert.equal(run.metrics.passRate, 1, '兜底通过率算错了')
  assert.equal(run.metrics.scored, 1)
  assert.equal(run.comparison, null, '单组不需要对比')

  const report = await call('GET', `/autoeval-api/report?run=${run.id}`)
  assert.ok(report.text.includes('没有 Reporting 阶段'), '缺少降级说明')
  assert.ok(report.text.includes('Control'), '降级报告里没有组名')
  assert.ok(report.text.includes('100.0%'), '降级报告里应该补上通过率')
  assert.ok(!report.text.includes('通过率：-'), '降级报告不该全是空值')

  const rows = await call('GET', `/autoeval-api/rows?run=${run.id}`)
  const first = JSON.parse(rows.text.trim().split('\n')[0])
  assert.equal(first.tag, 'tag', '自定义阶段的结果没传下去')
})

test('分组：Control + Treatment 各自覆盖参数，报告里有组间对比', async () => {
  const groupCases = [
    { id: 'g1', query: '一', material: '苹果', infoPoints: ['苹果', '香蕉'] },
    { id: 'g2', query: '二', material: '橘子', infoPoints: ['橘子', '葡萄'] },
  ]
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'ab-test',
    name: 'AB 测试',
    stages: [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }],
  })
  assert.equal(saved.ok, true, saved.error)
  assert.equal(saved.template.groups, undefined, '模板里不该有分组')
  assert.equal(saved.template.stages.find((stage) => stage.id === 'scraping').module, undefined, '模板里不该有模块')

  // 分组在提交时才定：两组都完整给出各阶段实现，Treatment 把判定阈值放宽
  const base = {
    scraping: { module: 'inline' },
    annotation: { module: 'coverage-keyword', config: { minCoverage: 1 } },
    metrics: { module: 'standard' },
    reporting: { module: 'markdown', config: { sections: ['summary'] } },
  }
  const started = await call('POST', '/autoeval-api/run', {
    templateId: 'ab-test',
    cases: groupCases,
    groups: [
      { id: 'control', kind: 'control', name: '对照组', stages: base },
      {
        id: 't1',
        kind: 'treatment',
        name: '放宽覆盖',
        stages: { ...base, annotation: { module: 'coverage-keyword', config: { minCoverage: 0.4 } } },
      },
    ],
  })
  assert.equal(started.ok, true, started.error)
  const { run } = await waitForRun(started.runId)
  assert.equal(run.status, 'done', JSON.stringify(run.error))
  assert.equal(run.groups.length, 2)
  assert.equal(run.groups[0].metrics.passRate, 0)
  assert.equal(run.groups[1].metrics.passRate, 1)
  const passRow = run.comparison.rows.find((row) => row.key === 'passRate')
  assert.ok(passRow.treatments[0].text.includes('+100.0pp'), passRow.treatments[0].text)

  const report = await call('GET', `/autoeval-api/report?run=${run.id}`)
  assert.ok(report.text.includes('组间对比'), '报告里没有组间对比')
  assert.ok(report.text.includes('放宽覆盖'))

  const rows = await call('GET', `/autoeval-api/rows?run=${run.id}`)
  const lines = rows.text.trim().split('\n')
  assert.equal(lines.length, 4, '两组各两条')
  assert.equal(JSON.parse(lines[0]).group, 'control')
  assert.equal(JSON.parse(lines[2]).group, 't1')
})

test('分组校验：必须正好一个 Control，每个阶段都要选定实现', async () => {
  const stages = [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }]
  const saved = await call('POST', '/autoeval-api/templates', { id: 'group-guard', name: 'x', stages })
  assert.equal(saved.ok, true, saved.error)

  const cases = [{ id: 'c1', query: '一', material: '苹果', infoPoints: ['苹果'] }]
  const run = (groups) => call('POST', '/autoeval-api/run', { templateId: 'group-guard', cases, groups })
  const full = {
    scraping: { module: 'inline' },
    annotation: { module: 'coverage-keyword' },
    metrics: { module: 'standard' },
    reporting: { module: 'markdown' },
  }

  const twoControls = await run([
    { id: 'control', kind: 'control', stages: full },
    { id: 'c2', kind: 'control', stages: full },
  ])
  assert.equal(twoControls.ok, false)
  assert.match(twoControls.error, /正好有一个 Control/)

  const noControl = await run([{ id: 't1', kind: 'treatment', stages: full }])
  assert.equal(noControl.ok, false)
  assert.match(noControl.error, /正好有一个 Control/)

  const badStage = await run([{ id: 'control', kind: 'control', stages: { ...full, nope: { module: 'inline' } } }])
  assert.equal(badStage.ok, false)
  assert.match(badStage.error, /没有的阶段 nope/)

  const badModule = await run([{ id: 'control', kind: 'control', stages: { ...full, scraping: { module: 'nope' } } }])
  assert.equal(badModule.ok, false)
  assert.match(badModule.error, /没有执行模块 nope/)

  // 少了某个阶段：不会偷偷用默认模块，直接报错
  const missingStage = await run([{
    id: 'control', kind: 'control', stages: { ...full, metrics: undefined },
  }])
  assert.equal(missingStage.ok, false)
  assert.match(missingStage.error, /metrics 还没有选执行模块/)

  // 自定义阶段只能配自定义命令，而且命令不能空
  const customTpl = await call('POST', '/autoeval-api/templates', {
    id: 'custom-guard', name: 'x', stages: [{ id: 'scraping' }, { id: 'tag', name: '打标' }],
  })
  assert.equal(customTpl.ok, true, customTpl.error)
  const wrongCustom = await call('POST', '/autoeval-api/run', {
    templateId: 'custom-guard', cases,
    groups: [{ id: 'control', kind: 'control', stages: { scraping: { module: 'inline' }, tag: { module: 'inline' } } }],
  })
  assert.equal(wrongCustom.ok, false)
  assert.match(wrongCustom.error, /只能用「自定义命令」模块/)
  const emptyCommand = await call('POST', '/autoeval-api/run', {
    templateId: 'custom-guard', cases,
    groups: [{ id: 'control', kind: 'control', stages: { scraping: { module: 'inline' }, tag: { module: 'custom' } } }],
  })
  assert.equal(emptyCommand.ok, false)
  assert.match(emptyCommand.error, /缺少 command/)

  // 什么都不给才走兜底：按每个阶段的首个内置模块跑一个 Control
  const auto = await run(undefined)
  assert.equal(auto.ok, true, auto.error)
  const { run: autoRun } = await waitForRun(auto.runId)
  assert.equal(autoRun.status, 'done', JSON.stringify(autoRun.error))
  assert.equal(autoRun.stages.scraping.template, 'websearch', '兜底应该用首个内置模块')
  await call('DELETE', '/autoeval-api/templates?id=custom-guard')
  await call('DELETE', '/autoeval-api/templates?id=group-guard')
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
  assert.ok(yaml.includes('id: scraping'), yaml)
  assert.ok(!yaml.includes('maxResults'), '迁移后的模板不该再带模块参数')
  const state = JSON.parse(await fsp.readFile(path.join(dir, 'state.json'), 'utf8'))
  assert.deepEqual(state.templates, [], 'state.json 里的模板应该清空')
  process.env.DSH_HOME = previousHome
})

test('坏配置会被挡住：阶段参数越界、阶段列表非法、YAML 语法错', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'bad-config-guard', name: '参数守卫',
    stages: [{ id: 'scraping' }, { id: 'annotation' }, { id: 'metrics' }, { id: 'reporting' }],
  })
  assert.equal(saved.ok, true, saved.error)

  const cases = [{ id: 'c1', query: '一', material: '苹果', infoPoints: ['苹果'] }]
  const bad = async (stages, templateId = 'bad-config-guard') => {
    const result = await call('POST', '/autoeval-api/run', {
      templateId, cases, groups: [{ id: 'control', kind: 'control', stages }],
    })
    assert.equal(result.ok, false, '本该被拒绝')
    return result.error
  }
  const base = {
    scraping: { module: 'websearch', config: {} },
    annotation: { module: 'coverage-keyword', config: {} },
    metrics: { module: 'standard', config: {} },
    reporting: { module: 'markdown', config: {} },
  }
  assert.match(await bad({ ...base, scraping: { module: 'websearch', config: { maxResults: 999 } } }), /不能大于 20/)
  assert.match(await bad({ ...base, annotation: { module: 'coverage-keyword', config: { minCoverage: 2 } } }), /不能大于 1/)
  assert.match(await bad({ ...base, reporting: { module: 'markdown', config: { sections: ['nope'] } } }), /不认识的取值/)

  // 模板侧：阶段列表本身非法会被挡住
  const badTemplate = async (body) => {
    const result = await call('POST', '/autoeval-api/templates', body)
    assert.equal(result.ok, false, '本该被拒绝')
    return result.error
  }
  assert.match(await badTemplate({ id: 'bad-5', name: 'x', stages: [] }), /至少要有一个阶段/)
  assert.match(await badTemplate({ id: 'bad-6', name: 'x', stages: [{ id: 'scraping' }, { id: 'scraping' }] }), /重复/)
  assert.match(await badTemplate({ id: 'Bad Id', name: 'x', stages: [{ id: 'scraping' }] }), /模板 id 只能用/)
  const raw = await call('POST', '/autoeval-api/templates/raw', { yaml: 'id: x\n  bad: indent' })
  assert.equal(raw.ok, false)
  assert.match(raw.error, /YAML 解析失败/)
  await call('DELETE', '/autoeval-api/templates?id=bad-config-guard')
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
