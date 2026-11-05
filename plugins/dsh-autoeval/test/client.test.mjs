// AutoEval 浏览器侧回归测试：用迷你 React 渲染面板，数据来自宿主插件导出的阶段目录。
//   node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
process.env.DSH_HOME = path.join(os.tmpdir(), 'autoeval-client-test')

const { STAGES, BUILTIN_TEMPLATES } = await import(path.join(root, 'index.js'))

const STATE = {
  ok: true,
  stages: STAGES,
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
      status: 'done',
      startedAt: '2026-11-05T04:32:27.686Z',
      finishedAt: '2026-11-05T04:32:58.627Z',
      durationMs: 30944,
      metrics: { total: 6, scored: 6, passed: 4, passRate: 0.6667, avgCoverage: 0.6667, latency: { p50Ms: 4470 } },
      stages: { scraping: { status: 'done', durationMs: 30940 } },
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

// ---------------------------------------------------------------- fetch 桩
const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET', body: options.body })
  const reply = (value, status = 200) => ({ ok: status < 300, status, json: async () => value })
  if (url.endsWith('/state')) return reply(STATE)
  if (url.endsWith('/run')) return reply({ ok: true, runId: 'run-stub' })
  if (url.endsWith('/cancel')) return reply({ ok: true })
  if (url.includes('/report')) return reply({ ok: true, text: '# stub report' })
  if (url.includes('/runs/detail')) return reply({ ok: true, run: STATE.runs[0], log: [{ at: '2026-11-05T04:32:27.686Z', stage: 'scraping', message: '完成，用时 30940ms' }] })
  if (url.includes('/runs?')) return reply({ ok: true, removed: 'run-fixture' })
  if (url.includes('/runs/rerun')) return reply({ ok: true, runId: 'run-rerun' })
  return reply({ ok: false, error: `unexpected ${url}` }, 404)
}

// 面板用 setInterval 轮询；测试里换成空实现，避免把进程挂住
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

// ---------------------------------------------------------------- 加载插件
let captured = null
globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod } } }
const source = readFileSync(path.join(root, 'client.js'), 'utf8')
// 写成临时文件再 import：报错时行号可读，而不是一长串 base64
const copyPath = path.join(os.tmpdir(), 'autoeval-client-under-test.mjs')
await import('node:fs').then(({ promises }) => promises.writeFile(copyPath, source, 'utf8'))
await import(`${'file://'}${copyPath}`)

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

test('面板：加载 /state 后渲染四个阶段与运行按钮', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  assert.match(texts(view), /AutoEval/)          // 首帧占位
  for (const fn of effects.splice(0)) fn()
  for (let tick = 0; tick < 40 && !pending; tick += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.ok(pending, '没有触发重渲染')
  assert.ok(calls.some((call) => call.url.endsWith('/state')))

  pending = false
  view = render(main.component, {})
  const text = texts(view)
  for (const expected of ['AutoEval', 'Scraping · 抓取', 'Annotation · 标注', 'Metrics · 指标', 'Reporting · 报告',
    'WebSearchTool 检索覆盖', '开始运行']) {
    assert.ok(text.includes(expected), `面板缺少「${expected}」`)
  }
  assert.ok(findAll(view, (node) => node.props.className === 'ae-chip').length >= 4)
})

test('点「开始运行」把用例和阶段配置 POST 到 /run', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  const view = render(main.component, {})
  const button = findAll(view, (node) => node.props.className === 'ae-btn ae-btn-primary')[0]
  assert.ok(button)
  const before = calls.length
  await button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/run'))
  assert.ok(posted, '没有 POST /run')
  const body = JSON.parse(posted.body)
  assert.ok(Array.isArray(body.cases) && body.cases.length > 0)
  assert.deepEqual(Object.keys(body.stages).sort(), ['annotation', 'metrics', 'reporting', 'scraping'])
  assert.equal(body.stages.scraping.template, 'websearch')
})

globalThis.window.confirm = () => true

test('历史页与报告页', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  const tabs = findAll(view, (node) => node.props.className === 'ae-tab')
  assert.equal(tabs.length, 4)
  tabs[1].props.onClick()       // 切到历史页
  view = render(main.component, {})
  assert.ok(texts(view).includes('小测试集'), '历史页没有记录')

  const link = findAll(view, (node) => node.props.className === 'ae-link')[0]
  assert.ok(link)
  link.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(calls.some((call) => call.url.includes('/report?run=')))
  view = render(main.component, {})
  assert.ok(texts(view).includes('stub report'))
})

test('任务页：表格、筛选、展开详情', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  const tabs = findAll(view, (node) => node.props.className === 'ae-tab')
  assert.equal(tabs.length, 4, '应该是 4 个页签')
  tabs[1].props.onClick()
  view = render(main.component, {})
  const text = texts(view)
  assert.ok(text.includes('小测试集'), '任务表没有记录')
  assert.ok(findAll(view, (node) => String(node.props.className).includes('ae-search')).length === 1, '缺少搜索框')
  assert.ok(findAll(view, (node) => node.props.className === 'ae-select').length === 1, '缺少状态筛选')
  const links = findAll(view, (node) => String(node.props.className || '').startsWith('ae-link'))
  assert.ok(links.length >= 3, '行内操作太少')

  // 展开详情 → 请求 /runs/detail
  const before = calls.length
  const toggle = findAll(view, (node) => node.props.className === 'ae-row-toggle')[0]
  assert.ok(toggle, '缺少展开按钮')
  await toggle.props.onClick()
  assert.ok(calls.slice(before).some((call) => call.url.includes('/runs/detail')), '没有请求 /runs/detail')
  pending = false
  view = render(main.component, {})
  assert.ok(texts(view).includes('日志'), '详情里没有日志')
})

test('任务页：重跑与删除', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  const rerunButton = findAll(view, (node) => node.props.className === 'ae-link' && node.children.includes('重跑'))[0]
  assert.ok(rerunButton, '缺少重跑按钮')
  let before = calls.length
  await rerunButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(calls.slice(before).some((call) => call.url.includes('/runs/rerun')), '没有请求 /runs/rerun')

  // 重跑成功后会跳回运行页，重新切回任务页再找删除
  view = render(main.component, {})
  const tabList = findAll(view, (node) => node.props.className === 'ae-tab')
  tabList[1].props.onClick()
  view = render(main.component, {})
  const deleteButton = findAll(view, (node) => node.props.className === 'ae-link ae-danger')[0]
  assert.ok(deleteButton, '缺少删除按钮')
  before = calls.length
  await deleteButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const deleted = calls.slice(before).find((call) => call.method === 'DELETE' && call.url.includes('/runs?'))
  assert.ok(deleted, '没有 DELETE /runs')
  assert.ok(deleted.url.includes('run-fixture'))
})

test('模板页：内置只读、自定义可编辑删除', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  const tabs = findAll(view, (node) => node.props.className === 'ae-tab')
  tabs[2].props.onClick()
  view = render(main.component, {})
  const text = texts(view)
  assert.ok(text.includes('WebSearchTool 检索覆盖'), '没有内置模板卡片')
  assert.ok(text.includes('我的覆盖模板'), '没有自定义模板卡片')
  const badges = findAll(view, (node) => node.props.className === 'ae-badge')
  assert.equal(badges.length, 2)
  assert.equal(badges[0].props['data-kind'], 'builtin')
  assert.equal(badges[1].props['data-kind'], 'custom')
  // 自定义卡片才有删除
  const dangers = findAll(view, (node) => node.props.className === 'ae-link ae-danger')
  assert.equal(dangers.length, 1)
})

test('模板页：新建并保存自定义模板', async () => {
  const main = registered.find((item) => item.options.name === 'main')
  let view = render(main.component, {})
  const newButton = findAll(view, (node) => node.props.className === 'ae-btn ae-btn-primary')[0]
  assert.ok(newButton, '缺少新建按钮')
  await newButton.props.onClick()
  view = render(main.component, {})
  const text = texts(view)
  assert.ok(text.includes('新建任务模板'), '没有进入编辑器')
  assert.equal(findAll(view, (node) => node.props.className === 'ae-stage-edit').length, 4, '编辑器里不是四个阶段')

  const saveButton = findAll(view, (node) => node.props.className === 'ae-btn ae-btn-primary')[0]
  const before = calls.length
  await saveButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const posted = calls.slice(before).find((call) => call.method === 'POST' && call.url.endsWith('/templates'))
  assert.ok(posted, '没有 POST /templates')
  const body = JSON.parse(posted.body)
  assert.match(body.id, /^[a-z0-9][a-z0-9-]*$/)
  assert.deepEqual(Object.keys(body.stages).sort(), ['annotation', 'metrics', 'reporting', 'scraping'])
  assert.equal(body.stages.reporting.template, 'markdown')
})
