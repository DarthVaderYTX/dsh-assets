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

test('自定义模板可以保存、读取、删除', async () => {
  const saved = await call('POST', '/autoeval-api/templates', {
    id: 'my-template', name: '我的模板', stages: { scraping: { template: 'inline', config: {} } },
  })
  assert.equal(saved.ok, true)
  let state = await call('GET', '/autoeval-api/state')
  assert.ok(state.templates.some((item) => item.id === 'my-template'))
  const removed = await call('DELETE', '/autoeval-api/templates?id=my-template')
  assert.equal(removed.removed, 1)
  state = await call('GET', '/autoeval-api/state')
  assert.ok(!state.templates.some((item) => item.id === 'my-template'))
})
