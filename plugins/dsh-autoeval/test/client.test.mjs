// AutoEval 浏览器侧回归测试：用迷你 React 渲染面板，数据来自宿主插件导出的阶段目录。
//   node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
process.env.DSH_HOME = path.join(os.tmpdir(), 'autoeval-client-test')

const { stageCatalog, BUILTIN_TEMPLATES } = await import(path.join(root, 'index.js'))

const ROW = {
  id: 'c1',
  bucket: 'stable',
  query: 'Python 3.13 新特性',
  infoPoints: ['Python', '3.13'],
  material: 'Python 3.13 有什么新变化',
  sources: [{ url: 'https://example.com/a', title: 'a' }],
  latencyMs: 4711,
  hit: ['Python', '3.13'],
  missed: [],
  coverage: 1,
  score: 1,
}

const STATE = {
  ok: true,
  stages: stageCatalog(),
  workspace: {
    dir: '/tmp/autoeval',
    templates: 1,
    runs: 2,
    bytes: 20480,
    configPath: '/tmp/autoeval/config.yaml',
    templatesDir: '/tmp/autoeval/templates',
    runsDir: '/tmp/autoeval/runs',
    fields: [
      { key: 'maxRuns', type: 'number', label: '保留最近多少次运行', default: 30, min: 1, max: 500, step: 1 },
      { key: 'defaultTemplate', type: 'string', label: '默认模板 id', default: 'websearch-tool' },
      { key: 'commandTimeoutMs', type: 'number', label: '自定义命令超时', default: 120000, min: 1000, max: 600000, step: 1000, unit: 'ms' },
    ],
    config: { maxRuns: 30, defaultTemplate: 'websearch-tool', commandTimeoutMs: 120000 },
  },
  querysets: [
    {
      id: 'qs-small',
      name: '小测试集',
      description: '六条检索问题',
      count: 2,
      fields: ['query', 'expect'],
      queryField: 'query',
      source: { kind: 'csv' },
      updatedAt: '2026-11-05T10:00:00.000Z',
    },
  ],
  templates: [
    ...BUILTIN_TEMPLATES,
    {
      id: 'my-coverage',
      name: '我的覆盖模板',
      description: '自建：只判信息点',
      builtin: false,
      stages: BUILTIN_TEMPLATES[0].stages,
    },
  ],
  runs: [
    {
      id: 'run-fixture',
      name: '小测试集 · WebSearchTool 覆盖',
      templateId: 'websearch-tool',
      status: 'done',
      startedAt: '2026-11-05T04:32:27.686Z',
      finishedAt: '2026-11-05T04:32:58.627Z',
      durationMs: 30944,
      caseCount: 6,
      metrics: {
        total: 6, scored: 6, passed: 4, passRate: 0.6667, avgCoverage: 0.6667,
        scrapeErrors: 0, latency: { count: 6, avgMs: 4906, p50Ms: 4470, p95Ms: 7514 },
      },
      stages: {
        scraping: {
          status: 'done', durationMs: 30940, template: 'websearch', config: { maxResults: 5 },
          summary: { cases: 6, material: 6, sources: 30, errors: 0 },
        },
        annotation: {
          status: 'done', durationMs: 1, template: 'coverage-keyword', config: {},
          summary: { cases: 6, scored: 6, passed: 4 },
        },
        metrics: {
          status: 'done', durationMs: 0, template: 'standard', config: {},
          summary: {
            total: 6, scored: 6, passed: 4, passRate: 0.6667, avgCoverage: 0.6667, scrapeErrors: 0,
            latency: { count: 6, avgMs: 4906, p50Ms: 4470, p95Ms: 7514 },
          },
        },
        reporting: {
          status: 'done', durationMs: 1, template: 'markdown', config: {},
          summary: { format: 'markdown', chars: 1200, rows: 6 },
        },
      },
      artifacts: { dir: '/tmp/autoeval/runs/run-fixture', report: '/tmp/r.md', rows: '/tmp/r.jsonl' },
      log: [],
    },
    {
      id: 'run-failed',
      name: '抓取挂了的一次',
      templateId: 'websearch-tool',
      status: 'failed',
      startedAt: '2026-11-05T05:00:00.000Z',
      finishedAt: '2026-11-05T05:00:09.000Z',
      durationMs: 9000,
      caseCount: 2,
      error: '检索服务 503',
      metrics: null,
      stages: {
        scraping: {
          status: 'failed', durationMs: 8990, template: 'websearch', config: { maxResults: 5 },
          summary: null, error: '检索服务 503',
        },
        annotation: { status: 'pending', durationMs: null, template: 'coverage-keyword', config: {}, summary: null },
        metrics: { status: 'pending', durationMs: null, template: 'standard', config: {}, summary: null },
        reporting: { status: 'pending', durationMs: null, template: 'markdown', config: {}, summary: null },
      },
      artifacts: { dir: '/tmp/autoeval/runs/run-failed' },
      log: [{ at: '2026-11-05T05:00:09.000Z', stage: 'scraping', message: '失败：检索服务 503' }],
    },
  ],
  active: null,
}

// ---------------------------------------------------------------- 迷你 React
let inst = null
let pending = false
const effects = []

function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(4) }
}

function useState(initial) {
  const index = inst.i++
  if (!(index in inst.hooks)) inst.hooks[index] = typeof initial === 'function' ? initial() : initial
  return [inst.hooks[index], (next) => {
    inst.hooks[index] = typeof next === 'function' ? next(inst.hooks[index]) : next
    pending = true
  }]
}

const React = {
  createElement,
  useState,
  useEffect(fn) { effects.push(fn) },
  useCallback(fn) { return fn },
}

function render(Component, props) {
  inst = { hooks: inst ? inst.hooks : [], i: 0 }
  let element = Component(props)
  let guard = 0
  while (element && typeof element.type === 'function') {
    inst.i = 0
    element = element.type(element.props)
    if ((guard += 1) > 10) throw new Error('组件解包层数过深')
  }
  return element
}

function walk(node, visit) {
  if (node == null) return
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (typeof node === 'string' || typeof node === 'number') { visit({ text: String(node) }); return }
  visit(node)
  walk(node.children, visit)
}

function texts(node) {
  const out = []
  walk(node, (item) => { if (item.text !== undefined) out.push(item.text) })
  return out.join('|')
}

function findAll(node, predicate) {
  const found = []
  walk(node, (item) => { if (item.type && predicate(item)) found.push(item) })
  return found
}

const byClass = (name) => (node) => String(node.props.className || '') === name
const hasClass = (name) => (node) => String(node.props.className || '').split(' ').includes(name)
const textOf = (node) => texts(node)
const clickable = (label) => (node) => typeof node.type === 'string'
  && typeof node.props.onClick === 'function' && texts(node).includes(label)

// ---------------------------------------------------------------- fetch 桩
const calls = []

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET', body: options.body })
  const reply = (value, status = 200) => ({ ok: status < 300, status, json: async () => value })
  if (url.endsWith('/state')) return reply(STATE)
  if (url.endsWith('/run')) return reply({ ok: true, runId: 'run-stub' })
  if (url.endsWith('/cancel')) return reply({ ok: true })
  if (url.includes('/runs/detail')) {
    const id = decodeURIComponent((url.match(/id=([^&]+)/) || [])[1] || '')
    const found = STATE.runs.find((item) => item.id === id) || STATE.runs[0]
    if (found.log && found.log.length > 0) return reply({ ok: true, run: found, log: found.log })
    return reply({
      ok: true,
      run: found,
      log: [
        { at: '2026-11-05T04:32:27.686Z', stage: 'scraping', message: '开始（模板 websearch）' },
        { at: '2026-11-05T04:32:57.600Z', stage: 'scraping', message: '完成，用时 30940ms' },
      ],
    })
  }
  if (url.includes('/rows')) return reply({ ok: true, text: `${JSON.stringify(ROW)}\n` })
  if (url.includes('/report')) return reply({ ok: true, text: '# AutoEval 报告\n\n通过率 66.7%' })
  if (url.includes('/runs/rerun')) return reply({ ok: true, runId: 'run-rerun' })
  if (url.includes('/runs?')) return reply({ ok: true, removed: 'run-fixture' })
  if (url.includes('/querysets/import')) {
    return reply({
      ok: true,
      fields: ['query', 'expect'],
      cases: [{ query: '导入的第一条', expect: 'A' }, { query: '导入的第二条', expect: 'B' }],
      queryField: 'query',
      skipped: 0,
      total: 2,
      title: '',
    })
  }
  if (url.includes('/querysets?') || url.endsWith('/querysets')) {
    const id = decodeURIComponent((url.match(/id=([^&]+)/) || [])[1] || '')
    if (!id) return reply({ ok: true, querysets: STATE.querysets })
    return reply({
      ok: true,
      queryset: {
        ...STATE.querysets[0],
        id,
        cases: [{ query: '第一条', expect: 'A' }, { query: '第二条', expect: 'B' }],
      },
    })
  }
  if ((options.method || 'GET') === 'POST' && url.includes('/querysets')) {
    return reply({ ok: true, queryset: { ...STATE.querysets[0], count: 2 } })
  }
  if (url.includes('/workspace/config')) return reply({ ok: true, config: { maxRuns: 5 } })
  if (url.includes('/workspace/open')) return reply({ ok: true, dir: '/tmp/autoeval' })
  if (url.includes('/templates/raw') && (options.method || 'GET') === 'GET') {
    return reply({
      ok: true,
      id: 'my-coverage',
      yaml: 'id: my-coverage\nname: 我的覆盖模板\nstages:\n  scraping:\n    template: websearch\n',
      file: '/tmp/autoeval/templates/my-coverage.yaml',
    })
  }
  if (url.includes('/templates/preview')) {
    return reply({ ok: true, yaml: 'id: template-new\nname: 新建\nstages: {}\n' })
  }
  if (url.includes('/templates/raw')) return reply({ ok: true, template: { id: 'my-coverage', name: '我的覆盖模板' } })
  if (url.includes('/templates')) return reply({ ok: true, template: { id: 'x' } })
  return reply({ ok: false, error: `unexpected ${url}` }, 404)
}

// 面板用 setInterval 轮询；测试里换成空实现，避免把进程挂住
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

// ---------------------------------------------------------------- 加载插件
let captured = null
globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod } }, confirm: () => true }
const source = readFileSync(path.join(root, 'client.js'), 'utf8')
const copyPath = path.join(os.tmpdir(), 'autoeval-client-under-test.mjs')
await fsp.writeFile(copyPath, source, 'utf8')
await import(`file://${copyPath}`)

let dict = {}
const registered = []
const ctx = {
  locale: {
    bind: () => (key) => (dict[key] === undefined ? key : dict[key]),
    register: (ns, dicts) => { dict = dicts.zh; return () => {} },
  },
  slots: {
    inject(_key, callback) { return callback() },
    register(options, component) { registered.push({ options, component }); return () => {} },
  },
  effect(fn) { return fn() },
}

const mod = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`意外的 require：${name}`)
})

const mainComponent = () => registered.find((item) => item.options.name === 'main').component
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

// 不管当前在哪个页面，都回到任务列表
// 点某个页签，返回新的视图
function openTab(view, label) {
  const tab = findAll(view, (node) => String(node.props.className || '') === 'ae-tab'
    && texts(node).includes(label))[0]
  if (!tab) throw new Error(`没有页签：${label}`)
  tab.props.onClick()
  return render(mainComponent(), {})
}

// 进提交页并把模板下拉展开、清空过滤词（状态在用例间是共享的）
function openPicker() {
  let view = ensureTaskList()
  findAll(view, clickable('提交任务'))[0].props.onClick()
  view = render(mainComponent(), {})
  if (findAll(view, hasClass('ae-select-menu')).length === 0) {
    findAll(view, hasClass('ae-select-button'))[0].props.onClick()
    view = render(mainComponent(), {})
  }
  const search = findAll(view, hasClass('ae-select-search'))[0]
  if (search && search.props.value) {
    search.props.onChange({ target: { value: '' } })
    view = render(mainComponent(), {})
  }
  return view
}

function ensureTaskList() {
  let view = render(mainComponent(), {})
  const back = findAll(view, byClass('ae-back'))[0]
  if (back) {
    back.props.onClick()
    view = render(mainComponent(), {})
  }
  if (findAll(view, hasClass('ae-row-toggle')).length === 0) {
    findAll(view, byClass('ae-tab'))[0].props.onClick()
    view = render(mainComponent(), {})
  }
  return view
}

// 首次渲染 + 等 /state 落地
async function boot() {
  render(mainComponent(), {})
  for (const fn of effects.splice(0)) fn()
  for (let tick = 0; tick < 60 && !pending; tick += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  pending = false
  return render(mainComponent(), {})
}

// 回到任务列表
function backToTaskList(view) {
  const back = findAll(view, byClass('ae-back'))[0]
  if (back) back.props.onClick()
  findAll(view, byClass('ae-tab'))[0] || null
  return render(mainComponent(), {})
}

test('模块 id 与依赖声明', () => {
  assert.equal(captured.id, 'dsh-autoeval')
  assert.deepEqual(mod.inject, ['slots', 'locale'])
})

test('同时注册侧栏图标与主面板', () => {
  mod.apply(ctx)
  const list = registered.find((item) => item.options.name === 'sidebar.panellist')
  const main = registered.find((item) => item.options.name === 'main')
  assert.ok(list, '没有 sidebar.panellist 注册')
  assert.equal(list.options.id, 'autoeval')
  assert.equal(typeof list.options.order, 'number')
  assert.equal(list.options.label(), 'AutoEval')
  assert.ok(main, '没有 main 注册')
  assert.equal(main.options.key, 'autoeval')
})

test('侧栏图标跟随 size / active', () => {
  const list = registered.find((item) => item.options.name === 'sidebar.panellist')
  let icon = list.component({ size: 22, active: true })
  while (icon && typeof icon.type === 'function') icon = icon.type(icon.props)
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 22)
})

test('三个页签：评测任务 / Queryset / 任务模板', async () => {
  const view = await boot()
  const tabs = findAll(view, byClass('ae-tab'))
  assert.equal(tabs.length, 3, '页签不是三个')
  assert.deepEqual(tabs.map((node) => texts(node)), ['评测任务', 'Queryset', '任务模板'])
  assert.equal(tabs[0].props['data-active'], 'true')
  assert.match(texts(view), /AutoEval/)
})

test('顶部工作区条：路径、计数、配置可改', async () => {
  let view = ensureTaskList()
  const text = texts(view)
  assert.ok(text.includes('/tmp/autoeval'), '没显示工作区路径')
  assert.ok(text.includes('模板 1'), '模板计数没显示')
  assert.ok(text.includes('运行 2'), '运行计数没显示')
  assert.ok(text.includes('20.0 KB'), '占用没格式化')

  // 打开目录
  const openBefore = calls.length
  await findAll(view, clickable('打开目录'))[0].props.onClick()
  await settle()
  assert.ok(calls.slice(openBefore).some((call) => call.url.includes('/workspace/open')), '没有请求打开目录')

  // 配置：展开 → 改 → 保存
  findAll(view, clickable('配置'))[0].props.onClick()
  view = render(mainComponent(), {})
  const numbers = findAll(view, (node) => node.type === 'input' && node.props.type === 'number')
  assert.ok(numbers.length >= 2, '配置里应该有数字字段')
  const maxRuns = numbers.find((node) => node.props.max === 500)
  assert.ok(maxRuns, 'maxRuns 没带范围')
  maxRuns.props.onChange({ target: { value: '5' } })
  view = render(mainComponent(), {})
  const saveBefore = calls.length
  await findAll(view, clickable('保存'))[0].props.onClick()
  await settle()
  const posted = calls.slice(saveBefore).find((call) => call.method === 'POST' && call.url.includes('/workspace/config'))
  assert.ok(posted, '没有 POST /workspace/config')
  assert.equal(JSON.parse(posted.body).maxRuns, 5)
})

test('任务列表：表格、搜索、状态筛选', () => {
  const view = render(mainComponent(), {})
  const text = texts(view)
  assert.ok(text.includes('小测试集'), '列表没有任务')
  assert.ok(text.includes('66.7%'), '列表没有通过率')
  assert.equal(findAll(view, hasClass('ae-search')).length, 1, '缺搜索框')
  assert.equal(findAll(view, byClass('ae-select')).length, 1, '缺状态筛选')
  assert.equal(findAll(view, clickable('提交任务')).length, 1, '缺提交任务按钮')
  assert.equal(findAll(view, hasClass('ae-row-toggle')).length, 2, '任务名不可点')
})

test('点进任务：概览给指标与阶段，另有逐条结果与报告', async () => {
  let view = render(mainComponent(), {})
  const open = findAll(view, hasClass('ae-row-toggle'))[0]
  const before = calls.length
  await open.props.onClick()
  await settle()
  assert.ok(calls.slice(before).some((call) => call.url.includes('/runs/detail')), '没有请求任务详情')
  assert.ok(calls.slice(before).some((call) => call.url.includes('/rows')), '没有请求逐条结果')
  assert.ok(calls.slice(before).some((call) => call.url.includes('/report')), '没有请求报告')

  view = render(mainComponent(), {})
  const text = texts(view)
  assert.ok(text.includes('小测试集'), '详情页没有任务名')
  assert.equal(findAll(view, byClass('ae-metric')).length, 8, '指标卡片不是 8 个')
  assert.ok(text.includes('66.7%'), '详情没有通过率')
  assert.ok(text.includes('完成，用时 30940ms'), '详情没有日志')
  const subtabs = findAll(view, byClass('ae-subtab'))
  assert.equal(subtabs.length, 3, '子页签不是三个')

  subtabs[1].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('Python 3.13 新特性'), '逐条结果里没有用例')

  findAll(view, byClass('ae-subtab'))[2].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('AutoEval 报告'), '报告没渲染')
})

test('任务详情：阶段是可折叠列表', async () => {
  let view = ensureTaskList()
  const open = findAll(view, hasClass('ae-row-toggle'))[0]
  await open.props.onClick()
  await settle()
  view = render(mainComponent(), {})

  const items = findAll(view, byClass('ae-acc-item'))
  assert.equal(items.length, 4, '不是四个阶段')
  assert.equal(findAll(view, byClass('ae-acc-body')).length, 0, '已完成的阶段默认应收起')

  // 展开标注阶段：能看到执行模板、参数与摘要
  findAll(view, byClass('ae-acc-head'))[1].props.onClick()
  view = render(mainComponent(), {})
  const text = texts(view)
  assert.equal(findAll(view, byClass('ae-acc-body')).length, 1, '展开后应只有一块正文')
  assert.ok(text.includes('coverage-keyword'), '展开后没有执行模板')
  assert.ok(text.includes('计分行'), '展开后没有阶段摘要')
  assert.ok(text.includes('通过'), '摘要里没有通过数')

  // 再点一次收起
  findAll(view, byClass('ae-acc-head'))[1].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-acc-body')).length, 0, '再点一次应该收起')
})

test('失败任务的失败阶段默认展开', async () => {
  let view = ensureTaskList()
  const failed = findAll(view, hasClass('ae-row-toggle'))[1]
  await failed.props.onClick()
  await settle()
  view = render(mainComponent(), {})

  const items = findAll(view, byClass('ae-acc-item'))
  assert.equal(items.length, 4)
  assert.equal(items[0].props['data-open'], 'true', '失败阶段应默认展开')
  assert.equal(items[1].props['data-open'], 'false', '未开始的阶段应收起')
  const text = texts(view)
  assert.ok(text.includes('检索服务 503'), '展开后应看到错误')
  assert.ok(text.includes('失败：检索服务 503'), '展开后应看到该阶段日志')
})

test('任务详情可以返回列表', () => {
  let view = render(mainComponent(), {})
  const back = findAll(view, byClass('ae-back'))[0]
  assert.ok(back, '详情页没有返回')
  back.props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-search')).length, 1, '没有回到列表')
})

test('提交任务：表单 → POST /run', async () => {
  let view = render(mainComponent(), {})
  const submitButton = findAll(view, clickable('提交任务'))[0]
  submitButton.props.onClick()
  view = render(mainComponent(), {})
  const text = texts(view)
  assert.ok(text.includes('提交评测任务'), '没有进入提交页')
  // 提交页不给改阶段：只有模板选择 + 只读预览
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 0, '提交页不该有阶段编辑器')
  assert.equal(findAll(view, hasClass('ae-textarea')).length, 1, '应该只有用例一个输入框')
  // 模板是下拉选择：展开后一个模板一项
  assert.equal(findAll(view, hasClass('ae-select-list')).length, 0, '下拉默认应收起')
  assert.ok(texts(findAll(view, hasClass('ae-select-value'))[0]).includes('websearch-tool'),
    '收起时应显示选中的模板')
  findAll(view, hasClass('ae-select-button'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-select-item')).length, 2, '模板选项数量不对')

  const before = calls.length
  const runButton = findAll(view, byClass('ae-btn ae-btn-primary'))[0]
  assert.ok(runButton, '没有开始运行按钮')
  await runButton.props.onClick()
  await settle()
  assert.equal(calls.slice(before).filter((call) => call.url.endsWith('/run')).length, 0, '点运行不该直接发请求')

  // 弹窗里把要跑的东西摊开：模板、用例数、四个阶段
  view = render(mainComponent(), {})
  const modal = findAll(view, byClass('ae-modal'))[0]
  assert.ok(modal, '没有二次确认')
  const modalText = texts(modal)
  assert.ok(modalText.includes('确认提交这次评测'), '确认框标题不对')
  assert.ok(modalText.includes('websearch-tool'), '没列出模板')
  assert.ok(modalText.includes('4'), '没列出用例数')
  assert.ok(modalText.includes('coverage-keyword'), '没列出各阶段')

  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/run'))
  assert.ok(posted, '没有 POST /run')
  const body = JSON.parse(posted.body)
  assert.ok(Array.isArray(body.cases) && body.cases.length > 0, '用例为空')
  assert.equal(body.templateId, 'websearch-tool')
  assert.equal(body.stages, undefined, '提交时不该自带阶段配置')
})

test('提交任务：模板下拉支持关键词过滤', async () => {
  let view = openPicker()
  assert.equal(findAll(view, hasClass('ae-select-item')).length, 2)

  // 按 id 过滤
  const search = findAll(view, hasClass('ae-select-search'))[0]
  assert.ok(search, '下拉里没有搜索框')
  search.props.onChange({ target: { value: 'my-' } })
  view = render(mainComponent(), {})
  let items = findAll(view, hasClass('ae-select-item'))
  assert.equal(items.length, 1, '过滤后应该只剩一个')
  assert.ok(texts(items[0]).includes('我的覆盖模板'))

  // 按中文名过滤，大小写与空格无所谓
  findAll(view, hasClass('ae-select-search'))[0].props.onChange({ target: { value: '  覆盖模  ' } })
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-select-item')).length, 1, '按名称过滤没生效')

  // 没匹配给提示
  findAll(view, hasClass('ae-select-search'))[0].props.onChange({ target: { value: 'zzz' } })
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-select-item')).length, 0)
  assert.ok(texts(view).includes('没有匹配的模板'))
})

test('提交任务：换模板只换引用，预览跟着变', async () => {
  let view = openPicker()
  const items = findAll(view, hasClass('ae-select-item'))
  items[1].props.onClick()
  view = render(mainComponent(), {})
  const text = texts(view)
  assert.ok(text.includes('我的覆盖模板'), '预览没跟着换模板')
  assert.equal(findAll(view, hasClass('ae-select-list')).length, 0, '选完应自动收起')
  assert.equal(findAll(view, hasClass('ae-select-item')).filter((node) => node.props['data-active'] === 'true').length, 0)
  assert.ok(texts(findAll(view, hasClass('ae-select-value'))[0]).includes('我的覆盖模板'), '没回填选中的模板')
})

test('提交任务：可以直接选 Queryset', async () => {
  let view = ensureTaskList()
  findAll(view, clickable('提交任务'))[0].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('选 Queryset'))[0].props.onClick()
  view = render(mainComponent(), {})
  // 粘贴框换成了下拉
  assert.equal(findAll(view, hasClass('ae-textarea')).length, 0, '选 Queryset时不该还显示粘贴框')
  findAll(view, hasClass('ae-select-button'))[1].props.onClick()
  view = render(mainComponent(), {})
  const items = findAll(view, hasClass('ae-select-item'))
  assert.ok(items.some((node) => texts(node).includes('小测试集')), '下拉里没有 Queryset')
  items.find((node) => texts(node).includes('小测试集')).props.onClick()
  view = render(mainComponent(), {})

  // 切回粘贴再切回来，两边都还在
  findAll(view, clickable('粘贴 JSON'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-textarea')).length, 1, '切回来应该还有粘贴框')
  findAll(view, clickable('选 Queryset'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-textarea')).length, 0, '再切回去应该没有粘贴框')

  const before = calls.length
  findAll(view, byClass('ae-btn ae-btn-primary'))[0].props.onClick()
  view = render(mainComponent(), {})
  const modal = findAll(view, byClass('ae-modal'))[0]
  assert.ok(texts(modal).includes('小测试集'), '确认框没列出 Queryset')
  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/run'))
  assert.ok(posted, '没有 POST /run')
  const body = JSON.parse(posted.body)
  assert.equal(body.querysetId, 'qs-small')
  assert.equal(body.cases, undefined, '用 Queryset时不该再带用例')

})

test('二次确认可以取消：不发请求、不改文件', async () => {
  // 提交任务：点运行 → 取消
  let view = ensureTaskList()
  findAll(view, clickable('提交任务'))[0].props.onClick()
  view = render(mainComponent(), {})
  const before = calls.length
  const runButton = findAll(view, byClass('ae-btn ae-btn-primary'))[0]
  runButton.props.onClick()
  view = render(mainComponent(), {})
  assert.ok(findAll(view, byClass('ae-modal'))[0], '没有确认框')
  const runModal = findAll(view, byClass('ae-modal'))[0]
  findAll(runModal, clickable('取消'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-modal')).length, 0, '取消后确认框应关掉')
  assert.equal(calls.slice(before).filter((call) => call.url.endsWith('/run')).length, 0, '取消后还是发了请求')

  // 保存模板：点保存 → 取消
  findAll(view, byClass('ae-back'))[0].props.onClick()
  view = render(mainComponent(), {})
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  const saveBefore = calls.length
  findAll(view, clickable('保存'))[0].props.onClick()
  view = render(mainComponent(), {})
  const templateModal = findAll(view, byClass('ae-modal'))[0]
  assert.ok(templateModal, '保存模板没有二次确认')
  findAll(templateModal, clickable('取消'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-modal')).length, 0, '取消后确认框应关掉')
  assert.equal(calls.slice(saveBefore).filter((call) => call.method === 'POST').length, 0, '取消后还是保存了')
})

test('Queryset：列表、只看、编辑后保存', async () => {
  let view = ensureTaskList()
  view = openTab(view, 'Queryset')
  assert.ok(texts(view).includes('小测试集'), '列表里没有 Queryset')
  assert.ok(texts(view).includes('2 条用例'), '没显示用例数')

  findAll(view, hasClass('ae-qs-card'))[0].props.onClick()
  await settle()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('小测试集'), '没进详情')
  assert.ok(texts(view).includes('第一条'), '没列用例')
  assert.equal(findAll(view, hasClass('ae-textarea')).length, 0, '默认只读，不该有输入框')

  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  const nameInput = findAll(view, (node) => String(node.props.className || '') === 'ae-input'
    && node.props.value === '小测试集')[0]
  assert.ok(nameInput, '编辑态没有名称输入框')
  nameInput.props.onChange({ target: { value: '小测试集 v2' } })
  view = render(mainComponent(), {})
  const before = calls.length
  findAll(view, clickable('保存'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(findAll(view, byClass('ae-modal'))[0], '保存前没有二次确认')
  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/querysets'))
  assert.ok(posted, '没有 POST /querysets')
  const body = JSON.parse(posted.body)
  assert.equal(body.id, 'qs-small')
  assert.equal(body.name, '小测试集 v2')
  assert.deepEqual(body.cases.map((item) => item.query), ['第一条', '第二条'])
})

test('Queryset：从 CSV 导入并保存', async () => {
  let view = ensureTaskList()
  view = openTab(view, 'Queryset')
  findAll(view, clickable('导入 Queryset'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(findAll(view, byClass('ae-modal'))[0], '没打开导入框')

  // 默认 JSONL，切到 CSV
  const csvChip = findAll(view, clickable('CSV'))[0]
  csvChip.props.onClick()
  view = render(mainComponent(), {})
  const area = findAll(view, hasClass('ae-textarea'))[0]
  assert.ok(area, 'CSV 没有粘贴框')
  area.props.onChange({ target: { value: 'query,expect\n第一条,A\n第二条,B\n' } })
  view = render(mainComponent(), {})

  const before = calls.length
  findAll(view, clickable('解析'))[0].props.onClick()
  await settle()
  const imported = calls.slice(before).find((call) => call.url.includes('/querysets/import'))
  assert.ok(imported, '没有请求解析')
  assert.equal(JSON.parse(imported.body).kind, 'csv')

  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('导入的第一条'), '预览没显示解析结果')
  const idInput = findAll(view, (node) => String(node.props.className || '') === 'ae-input ae-mono'
    && node.props.value.startsWith('qs-'))[0]
  assert.ok(idInput, '没有 id 输入框')

  const saveBefore = calls.length
  findAll(view, clickable('存成 Queryset'))[0].props.onClick()
  await settle()
  const saved = calls.slice(saveBefore).find((call) => call.method === 'POST' && call.url.endsWith('/querysets'))
  assert.ok(saved, '没有保存')
  const body = JSON.parse(saved.body)
  assert.equal(body.cases.length, 2)
  assert.equal(body.source.kind, 'csv')
})

test('Queryset：可以删除', async () => {
  let view = ensureTaskList()
  view = openTab(view, 'Queryset')
  findAll(view, hasClass('ae-qs-card'))[0].props.onClick()
  await settle()
  view = render(mainComponent(), {})
  const before = calls.length
  findAll(view, clickable('删除'))[0].props.onClick()
  await settle()
  const removed = calls.slice(before).find((call) => call.method === 'DELETE' && call.url.includes('/querysets'))
  assert.ok(removed, '没有 DELETE /querysets')
})

test('模板列表点进详情：内置只读', () => {
  let view = render(mainComponent(), {})
  view = openTab(view, '任务模板')
  const cards = findAll(view, byClass('ae-template-card'))
  assert.equal(cards.length, 2, '模板卡片数量不对')
  assert.ok(texts(view).includes('WebSearchTool 检索覆盖'))

  cards[0].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('内置模板只读'), '内置模板没提示只读')
  assert.equal(findAll(view, byClass('ae-btn ae-btn-primary')).length, 0, '内置模板不该有保存')
  assert.ok(findAll(view, clickable('复制')).length >= 1, '内置模板缺复制')
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 4, '模板详情不是四个阶段')
  assert.equal(findAll(view, byClass('ae-group-edit')).length, 0, '模板里不该有分组')
})

test('自定义模板可以改字段并保存', async () => {
  let view = render(mainComponent(), {})
  const back = findAll(view, byClass('ae-back'))[0]
  if (back) back.props.onClick()
  view = render(mainComponent(), {})
  if (findAll(view, byClass('ae-template-card')).length === 0) {
    view = openTab(view, '任务模板')
  }
  const cards = findAll(view, byClass('ae-template-card'))
  cards[1].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('我的覆盖模板'))

  // 默认只读：没有输入框，只有「编辑」按钮
  assert.equal(findAll(view, hasClass('ae-input')).length, 0, '默认不该直接可编辑')
  assert.ok(texts(view).includes('只读查看'), '缺少只读提示')

  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  const nameInput = findAll(view, (node) => String(node.props.className || '') === 'ae-input'
    && node.props.value === '我的覆盖模板')[0]
  assert.ok(nameInput, '没有名称输入框')
  nameInput.props.onChange({ target: { value: '改过名的模板' } })
  view = render(mainComponent(), {})
  const before = calls.length
  findAll(view, byClass('ae-btn ae-btn-primary'))[0].props.onClick()
  await settle()
  assert.equal(calls.slice(before).filter((call) => call.url.endsWith('/templates')).length, 0, '没确认就保存了')
  view = render(mainComponent(), {})
  assert.ok(findAll(view, byClass('ae-modal'))[0], '保存模板没有二次确认')
  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/templates'))
  assert.ok(posted, '没有 POST /templates')
  const body = JSON.parse(posted.body)
  assert.equal(body.id, 'my-coverage')
  assert.equal(body.name, '改过名的模板')
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-input')).length, 0, '保存后应回到只读')
})

test('模板编辑：取消就回到打开时的样子', async () => {
  let view = ensureTaskList()
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})

  const nameInput = findAll(view, (node) => String(node.props.className || '') === 'ae-input'
    && node.props.value === '我的覆盖模板')[0]
  nameInput.props.onChange({ target: { value: '临时改的名字' } })
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('临时改的名字'))

  findAll(view, clickable('取消'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, hasClass('ae-input')).length, 0, '取消后应回到只读')
  assert.ok(texts(view).includes('我的覆盖模板'), '取消后应该回到原来的名字')
  assert.ok(!texts(view).includes('临时改的名字'), '未保存的修改应该丢掉')
})

test('模板表单按 schema 生成控件：数字带范围、列表是 chips、命令是输入框', async () => {
  let view = ensureTaskList()
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})

  const numbers = findAll(view, (node) => node.type === 'input' && node.props.type === 'number')
  assert.ok(numbers.length >= 2, '应该按字段类型渲染出数字输入框')
  const maxResults = numbers.find((node) => node.props.max === 20)
  assert.ok(maxResults, 'maxResults 的 max 没带出来')
  assert.equal(String(maxResults.props.min), '1')
  assert.equal(String(maxResults.props.step), '1')
  assert.equal(String(maxResults.props.value), '5')

  // 报告小节的枚举 → 多选 chips，四个选项
  const text = texts(view)
  assert.ok(text.includes('总览') && text.includes('未通过'), '枚举选项没渲染出来')
  const sectionsChips = findAll(view, byClass('ae-chip'))
    .filter((node) => ['summary', 'stages', 'cases', 'failures'].includes(textOf(node)) || ['总览', '阶段', '逐条', '未通过'].includes(textOf(node)))
  assert.equal(sectionsChips.length, 4)
  assert.ok(sectionsChips.every((node) => node.props['data-active'] === 'true'), '默认四个小节都该选中')

  // 点掉一个再点回来
  sectionsChips[0].props.onClick()
  view = render(mainComponent(), {})
  const after = findAll(view, byClass('ae-chip'))
    .filter((node) => ['总览', '阶段', '逐条', '未通过'].includes(textOf(node)))
  assert.equal(after.filter((node) => node.props['data-active'] === 'true').length, 3, '点一下应该取消选中')
})

test('模板 YAML 页签：只读时不能改，进编辑后能改能存', async () => {
  let view = ensureTaskList()
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  const yamlTab = findAll(view, byClass('ae-subtab')).find((node) => textOf(node) === 'YAML')
  assert.ok(yamlTab, '没有 YAML 页签')
  const before = calls.length
  await yamlTab.props.onClick()
  await settle()
  view = render(mainComponent(), {})
  const got = calls.slice(before).find((call) => call.method === 'GET' && call.url.includes('/templates/raw'))
  assert.ok(got, '没有去读模板文件')

  const readonlyArea = findAll(view, byClass('ae-textarea ae-mono'))[0]
  assert.ok(readonlyArea, 'YAML 页签没有文本域')
  assert.ok(String(readonlyArea.props.value).includes('id: my-coverage'), '文本域没填上文件内容')
  assert.equal(readonlyArea.props.disabled, true, '只读态不该能改 YAML')

  // 点「编辑」后文本域解锁
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  const area = findAll(view, byClass('ae-textarea ae-mono'))[0]
  assert.notEqual(area.props.disabled, true, '编辑态应该能改 YAML')

  area.props.onChange({ target: { value: 'id: my-coverage\nname: 改过的名字\nstages: {}\n' } })
  view = render(mainComponent(), {})
  const saveButton = findAll(view, clickable('保存'))[0]
  const saveBefore = calls.length
  await saveButton.props.onClick()
  await settle()
  view = render(mainComponent(), {})
  assert.ok(findAll(view, byClass('ae-modal'))[0], '保存 YAML 没有二次确认')
  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(saveBefore).find((call) => call.method === 'POST' && call.url.includes('/templates/raw'))
  assert.ok(posted, '没有 POST /templates/raw')
  assert.ok(JSON.parse(posted.body).yaml.includes('改过的名字'), '发出去的内容不对')
})

test('模板页可以新建', () => {
  let view = render(mainComponent(), {})
  const back = findAll(view, byClass('ae-back'))[0]
  if (back) {
    back.props.onClick()
    view = render(mainComponent(), {})
  }
  const newButton = findAll(view, clickable('新建模板'))[0]
  assert.ok(newButton, '没有新建模板按钮')
  newButton.props.onClick()
  view = render(mainComponent(), {})
  assert.ok(texts(view).includes('新建任务模板'), '没有进入新建页')
  const idInput = findAll(view, (node) => String(node.props.className || '') === 'ae-input'
    && String(node.props.value || '').startsWith('template-'))[0]
  assert.ok(idInput, '新建模板没有 id 输入框')
})

test('模板编辑：预置阶段不能互换，自定义阶段可以插入再删掉', async () => {
  let view = ensureTaskList()
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 4, '编辑态应该是四个阶段')

  // 预置阶段之间的上下移禁止
  const stageCards = findAll(view, byClass('ae-stage-edit'))
  const upButtons = findAll(stageCards[1], (node) => String(node.props.className || '') === 'ae-btn ae-btn-xs')
  assert.equal(upButtons[0].props.disabled, true, '预置阶段不该能跟上一个预置阶段换')

  // 加一个自定义阶段
  findAll(view, clickable('+ 自定义阶段'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 5, '没加上自定义阶段')
  assert.ok(texts(view).includes('自定义阶段 1'), '自定义阶段没露面')

  const cardsAfter = findAll(view, byClass('ae-stage-edit'))
  const customUp = findAll(cardsAfter[4], (node) => String(node.props.className || '') === 'ae-btn ae-btn-xs')[0]
  assert.equal(customUp.props.disabled, false, '自定义阶段应该能上移')
  customUp.props.onClick()
  view = render(mainComponent(), {})
  const titles = findAll(view, byClass('ae-card-title')).map((node) => texts(node))
  assert.ok(titles.some((text) => text.startsWith('4. 自定义阶段')), '上移后位置不对')

  // 删掉它
  const cardsBeforeDelete = findAll(view, byClass('ae-stage-edit'))
  findAll(cardsBeforeDelete[3], (node) => String(node.props.className || '') === 'ae-btn ae-btn-xs')
    .find((node) => texts(node) === '删除').props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 4, '没删掉自定义阶段')
})

test('模板编辑：预置阶段可以删掉，也能从新增区加回来', async () => {
  let view = ensureTaskList()
  view = openTab(view, '任务模板')
  findAll(view, byClass('ae-template-card'))[1].props.onClick()
  view = render(mainComponent(), {})
  findAll(view, clickable('编辑'))[0].props.onClick()
  view = render(mainComponent(), {})
  assert.ok(!findAll(view, clickable('+ Annotation · 标注')).length, 'Annotation 还在，不该出现在新增区')

  // 删掉 Annotation
  const cards = findAll(view, byClass('ae-stage-edit'))
  findAll(cards[1], (node) => String(node.props.className || '').startsWith('ae-btn ae-btn-xs'))
    .find((node) => texts(node) === '删除').props.onClick()
  view = render(mainComponent(), {})
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 3, '预置阶段没删掉')

  // 新增区里应该出现它，点一下加回来，且回到原来的位置
  const addButton = findAll(view, clickable('+ Annotation · 标注'))[0]
  assert.ok(addButton, '删掉的预置阶段没出现在新增区')
  addButton.props.onClick()
  view = render(mainComponent(), {})
  const titles = findAll(view, byClass('ae-card-title')).map((node) => texts(node))
  assert.equal(findAll(view, byClass('ae-stage-edit')).length, 4, '没加回来')
  assert.ok(titles.some((text) => text === '2. Annotation · 标注'), '加回来的位置不对')
})

test('提交任务：可以加 Treatment 并独立配置各阶段的模块与参数', async () => {
  let view = ensureTaskList()
  findAll(view, clickable('提交任务'))[0].props.onClick()
  view = render(mainComponent(), {})

  // 默认只有 Control，且它的各阶段按模板默认值预填
  let groups = findAll(view, byClass('ae-group-edit'))
  assert.equal(groups.length, 1, '默认应该只有一个 Control')
  assert.ok(texts(groups[0]).includes('Control'))
  assert.ok(texts(groups[0]).includes('Scraping'), 'Control 没列出阶段')

  // 加一个 Treatment：默认抄 Control，之后可以独立改
  findAll(view, clickable('新增 Treatment 组'))[0].props.onClick()
  view = render(mainComponent(), {})
  groups = findAll(view, byClass('ae-group-edit'))
  assert.equal(groups.length, 2, '没加上 Treatment')

  // 改 Treatment 的抓取模块：换成 inline
  const chips = findAll(groups[1], byClass('ae-chip'))
  assert.ok(chips.length >= 4, 'Treatment 应该给每个阶段都列出模块')
  const inlineChip = chips.find((node) => texts(node).includes('用例自带材料'))
  assert.ok(inlineChip, '找不到 inline 模块')
  inlineChip.props.onClick()
  view = render(mainComponent(), {})

  const before = calls.length
  findAll(view, byClass('ae-btn ae-btn-primary'))[0].props.onClick()
  view = render(mainComponent(), {})
  const modal = findAll(view, byClass('ae-modal'))[0]
  assert.ok(texts(modal).includes('Treatment 1'), '确认框没列出 Treatment')

  await findAll(view, clickable('确认'))[0].props.onClick()
  await settle()
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/run'))
  assert.ok(posted, '没有 POST /run')
  const body = JSON.parse(posted.body)
  assert.equal(body.groups.length, 2, '分组没带上')
  assert.equal(body.groups[0].kind, 'control')
  assert.equal(body.groups[1].kind, 'treatment')
  assert.equal(body.groups[1].stages.scraping.module, 'inline', 'Treatment 的抓取模块没改到')
  assert.equal(body.groups[0].stages.scraping.module, 'websearch', 'Control 不该被连累')
})

test('任务列表可以重跑与删除', async () => {
  let view = render(mainComponent(), {})
  findAll(view, byClass('ae-tab'))[0].props.onClick()
  view = render(mainComponent(), {})
  const rerun = findAll(view, clickable('重跑'))[0]
  assert.ok(rerun, '没有重跑按钮')
  let before = calls.length
  await rerun.props.onClick()
  await settle()
  assert.ok(calls.slice(before).some((call) => call.url.includes('/runs/rerun')), '没有请求重跑')

  // 重跑成功会跳到新任务详情，回列表再删
  view = render(mainComponent(), {})
  const back = findAll(view, byClass('ae-back'))[0]
  if (back) {
    back.props.onClick()
    view = render(mainComponent(), {})
  }
  const remove = findAll(view, (node) => String(node.props.className || '') === 'ae-link ae-danger')[0]
  assert.ok(remove, '没有删除按钮')
  before = calls.length
  await remove.props.onClick()
  await settle()
  const deleted = calls.slice(before).find((call) => call.method === 'DELETE')
  assert.ok(deleted && deleted.url.includes('run-fixture'), '没有 DELETE /runs')
})
