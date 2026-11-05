// AutoEval — 四阶段评测流水线（Scraping / Annotation / Metrics / Reporting）。
//
// 宿主侧只做三件事：保存模板与历史运行、跑流水线、把结果通过 /autoeval-api 暴露给
// 侧栏面板和 agent 工具。每个阶段都有内置执行模板（preset），也可以换成自定义命令：
// 命令从 stdin 收一段 JSON，往 stdout 吐一段 JSON。
import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { parseYaml, stringifyYaml } from './yaml.js'
import { importQueries } from './importers.js'

const API_PREFIX = '/autoeval-api'
const DATA_VERSION = 1

function dataDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', 'autoeval')
}

function statePath() {
  return path.join(dataDir(), 'state.json')
}

function templatesDir() {
  return path.join(dataDir(), 'templates')
}

function templateFile(id) {
  return path.join(templatesDir(), `${id}.yaml`)
}

// ---------------------------------------------------------------- 阶段模板

/**
 * 四个阶段 × 各自的执行模板。`config` 是该模板的默认参数，面板上可改，
 * 也可以整体换成 `custom`（自定义命令）。
 */
/**
 * 每个阶段执行模板能配哪些字段。面板按这份 schema 生成表单（类型、范围、枚举都从这来），
 * 宿主保存时用同一份校验；用户直接改 YAML 也按它检查。
 */
const FIELDS = {
  'scraping.websearch': [
    { key: 'queryField', type: 'string', label: '检索词字段', default: 'query', hint: '用例里存检索词的字段名' },
    { key: 'maxResults', type: 'number', label: '每条结果数', default: 5, min: 1, max: 20, step: 1 },
    { key: 'intervalMs', type: 'number', label: '条目间隔', default: 250, min: 0, max: 5000, step: 50, unit: 'ms' },
  ],
  'scraping.inline': [],
  'scraping.custom': [
    { key: 'command', type: 'command', label: '自定义命令', default: '', hint: 'stdin 收 JSON，stdout 吐 JSON' },
  ],
  'annotation.coverage-keyword': [
    { key: 'pointsField', type: 'string', label: '信息点字段', default: 'infoPoints' },
    { key: 'minCoverage', type: 'number', label: '判通过所需覆盖', default: 1, min: 0, max: 1, step: 0.1 },
  ],
  'annotation.coverage-rubric': [
    { key: 'rubricField', type: 'string', label: 'Rubric 字段', default: 'rubric' },
    { key: 'minCoverage', type: 'number', label: '判通过所需覆盖', default: 1, min: 0, max: 1, step: 0.1 },
  ],
  'annotation.custom': [
    { key: 'command', type: 'command', label: '自定义命令', default: '', hint: 'stdin 收 JSON，stdout 吐 JSON' },
  ],
  'metrics.standard': [
    { key: 'latencyField', type: 'string', label: '耗时字段', default: 'latencyMs', hint: '用例里存耗时的字段名' },
  ],
  'metrics.grouped': [
    { key: 'groupBy', type: 'string', label: '分组字段', default: 'bucket' },
    { key: 'latencyField', type: 'string', label: '耗时字段', default: 'latencyMs' },
  ],
  'metrics.custom': [
    { key: 'command', type: 'command', label: '自定义命令', default: '', hint: 'stdin 收 JSON，stdout 吐 JSON' },
  ],
  'reporting.markdown': [
    {
      key: 'sections', type: 'list', label: '报告包含哪些小节', default: ['summary', 'stages', 'cases', 'failures'],
      options: [
        { value: 'summary', label: '总览' },
        { value: 'stages', label: '阶段' },
        { value: 'cases', label: '逐条' },
        { value: 'failures', label: '未通过' },
      ],
    },
  ],
  'reporting.json': [],
  'reporting.custom': [
    { key: 'command', type: 'command', label: '自定义命令', default: '', hint: 'stdin 收 JSON，stdout 吐 JSON' },
  ],
}

/** 工作区级配置：一个 config.yaml，管保留多少运行、默认模板、自定义命令超时。 */
const WORKSPACE_FIELDS = [
  { key: 'maxRuns', type: 'number', label: '保留最近多少次运行', default: 30, min: 1, max: 500, step: 1 },
  {
    key: 'defaultTemplate', type: 'string', label: '默认模板 id', default: 'websearch-tool',
    hint: '提交任务时默认选中；留空则用列表里的第一个',
  },
  {
    key: 'commandTimeoutMs', type: 'number', label: '自定义命令超时', default: 120000,
    min: 1000, max: 600000, step: 1000, unit: 'ms',
  },
]

function configPath() {
  return path.join(dataDir(), 'config.yaml')
}

// ---------------------------------------------------------------- Queryset

function querysetsDir() {
  return path.join(dataDir(), 'querysets')
}

function querysetFile(id) {
  return path.join(querysetsDir(), `${id}.json`)
}

function normalizeQueryset(input) {
  if (!input || typeof input !== 'object') throw new Error('缺少 Queryset内容')
  const id = String(input.id || '').trim()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('id 只能用 a-z、0-9、-，且以字母或数字开头')
  const name = String(input.name || '').trim() || id
  const description = String(input.description || '').trim()
  const cases = Array.isArray(input.cases) ? input.cases : []
  if (cases.length === 0) throw new Error('Queryset里没有用例')
  const clean = cases.map((item, index) => {
    const record = item && typeof item === 'object' ? item : {}
    const query = String(record.query === undefined || record.query === null ? '' : record.query).trim()
    if (!query) throw new Error(`第 ${index + 1} 条缺 query`)
    return { ...record, query }
  })
  const fields = Array.isArray(input.fields) && input.fields.length > 0
    ? input.fields.map((field) => String(field))
    : Object.keys(clean[0])
  const queryField = String(input.queryField || (fields.includes('query') ? 'query' : fields[0] || 'query'))
  const source = input.source && typeof input.source === 'object' ? input.source : {}
  return {
    id,
    name,
    description,
    fields,
    queryField,
    cases: clean,
    source,
    updatedAt: nowIso(),
    createdAt: String(input.createdAt || nowIso()),
  }
}

async function readQuerysets() {
  let names = []
  try {
    names = await fsp.readdir(querysetsDir())
  } catch {
    return []
  }
  const list = []
  for (const name of names.filter((item) => item.endsWith('.json')).sort()) {
    try {
      const text = await fsp.readFile(path.join(querysetsDir(), name), 'utf8')
      const parsed = JSON.parse(text)
      list.push(parsed)
    } catch {
      list.push({ id: name.replace(/\.json$/, ''), name: name, broken: '文件读不出来', cases: [], fields: [] })
    }
  }
  return list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

async function writeQuerysetFile(queryset) {
  await fsp.mkdir(querysetsDir(), { recursive: true })
  await fsp.writeFile(querysetFile(queryset.id), `${JSON.stringify(queryset, null, 2)}\n`, 'utf8')
  return queryset
}

/** 列表里只带摘要，用例留到详情再取。 */
function summarizeQueryset(queryset) {
  return {
    id: queryset.id,
    name: queryset.name,
    description: queryset.description || '',
    count: (queryset.cases || []).length,
    fields: queryset.fields || [],
    queryField: queryset.queryField || '',
    source: queryset.source || {},
    updatedAt: queryset.updatedAt || '',
    broken: queryset.broken || null,
  }
}

/** 工作区概况：面板顶部显示路径、各类文件数量与占用。 */
async function workspaceInfo() {
  const dir = dataDir()
  const config = await readWorkspaceConfig()
  let bytes = 0
  let runs = 0
  async function walk(target) {
    let entries = []
    try {
      entries = await fsp.readdir(target, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(target, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      try {
        bytes += (await fsp.stat(full)).size
      } catch {
        // 统计失败不影响别的
      }
    }
  }
  await walk(dir)
  let templates = 0
  try {
    templates = (await fsp.readdir(path.join(dir, 'templates'))).filter((name) => /\.ya?ml$/i.test(name)).length
  } catch {
    templates = 0
  }
  try {
    const entries = await fsp.readdir(path.join(dir, 'runs'), { withFileTypes: true })
    runs = entries.filter((entry) => entry.isDirectory()).length
  } catch {
    runs = 0
  }
  let querysets = 0
  try {
    querysets = (await fsp.readdir(path.join(dir, 'querysets'))).filter((name) => name.endsWith('.json')).length
  } catch {
    querysets = 0
  }
  return {
    dir,
    templates,
    runs,
    querysets,
    bytes,
    configPath: configPath(),
    templatesDir: path.join(dir, 'templates'),
    runsDir: path.join(dir, 'runs'),
  }
}

/** 读工作区配置：缺文件就用默认值，写坏了带上错误说明但不影响跑。 */
async function readWorkspaceConfig() {
  const config = Object.fromEntries(WORKSPACE_FIELDS.map((field) => [field.key, field.default]))
  let broken = null
  try {
    const text = await fsp.readFile(configPath(), 'utf8')
    const doc = parseYaml(text)
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      for (const field of WORKSPACE_FIELDS) {
        if (doc[field.key] === undefined || doc[field.key] === null) continue
        try {
          config[field.key] = validateField('config', 'workspace', field, doc[field.key])
        } catch (error) {
          broken = String(error && error.message ? error.message : error)
        }
      }
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') broken = `配置读取失败：${error.message}`
  }
  return { ...config, broken }
}

async function writeWorkspaceConfig(input) {
  const config = {}
  for (const field of WORKSPACE_FIELDS) {
    const value = input && input[field.key] !== undefined ? input[field.key] : field.default
    config[field.key] = validateField('config', 'workspace', field, value)
  }
  const comments = Object.fromEntries(WORKSPACE_FIELDS.map((field) => [field.key, fieldComment(field)]))
  const head = [
    '# AutoEval 工作区配置',
    `# 文件：${configPath()}`,
    '# 面板「工作区 → 配置」里改的是同一个文件，也可以直接编辑它。',
    '',
  ].join('\n')
  await fsp.mkdir(dataDir(), { recursive: true })
  await fsp.writeFile(configPath(), `${head}${stringifyYaml(config, { comments })}`, 'utf8')
  return config
}

/** 某个阶段某个执行模板的可配字段（面板用它生成表单）。 */
/** 四个预置阶段：可以删掉自定义阶段、可以在它们之间插，但这四个之间的先后固定。 */
export const PRESET_STAGE_IDS = ['scraping', 'annotation', 'metrics', 'reporting']

/** 自定义阶段目前只有一种执行模块：自定义命令。 */
export const CUSTOM_STAGE = {
  module: 'custom',
  fields: [
    {
      key: 'command',
      type: 'command',
      label: '命令',
      default: '',
      hint: 'stdin 收 {stage, cases, config, stages, metrics}，stdout 吐 {cases: [...]}',
    },
  ],
}

export function fieldsOf(stageId, presetId) {
  if (stageId === 'custom') return CUSTOM_STAGE.fields
  return FIELDS[`${stageId}.${presetId}`] || []
}

export const STAGES = [
  {
    id: 'scraping',
    presets: [
      {
        id: 'websearch',
        config: { maxResults: 5, queryField: 'query', intervalMs: 250 },
      },
      { id: 'inline', config: {} },
      { id: 'custom', config: { command: '' } },
    ],
  },
  {
    id: 'annotation',
    presets: [
      {
        id: 'coverage-keyword',
        config: { pointsField: 'infoPoints', minCoverage: 1 },
      },
      {
        id: 'coverage-rubric',
        config: { rubricField: 'rubric', minCoverage: 1 },
      },
      { id: 'custom', config: { command: '' } },
    ],
  },
  {
    id: 'metrics',
    presets: [
      { id: 'standard', config: { latencyField: 'latencyMs' } },
      { id: 'grouped', config: { groupBy: 'bucket', latencyField: 'latencyMs' } },
      { id: 'custom', config: { command: '' } },
    ],
  },
  {
    id: 'reporting',
    presets: [
      {
        id: 'markdown',
        config: { sections: ['summary', 'stages', 'cases', 'failures'] },
      },
      { id: 'json', config: {} },
      { id: 'custom', config: { command: '' } },
    ],
  },
]

/** 内置评测模板：WebSearchTool 检索覆盖评测。 */
const BUILTIN_TEMPLATES = [
  {
    id: 'websearch-tool',
    name: 'WebSearchTool 检索覆盖',
    description: '抓取 WebSearch 结果 → 按信息点判覆盖 → 聚合指标 → 出 Markdown 报告',
    builtin: true,
    stages: {
      scraping: { template: 'websearch', config: { maxResults: 5, queryField: 'query', intervalMs: 250 } },
      annotation: { template: 'coverage-keyword', config: { pointsField: 'infoPoints', minCoverage: 1 } },
      metrics: { template: 'standard', config: { latencyField: 'latencyMs' } },
      reporting: { template: 'markdown', config: { sections: ['summary', 'stages', 'cases', 'failures'] } },
    },
  },
]

/** 阶段目录对外的一份，带 schema：面板不用自己维护字段表。 */
export function stageCatalog() {
  return STAGES.map((stage, index) => ({
    id: stage.id,
    kind: 'preset',
    order: index,
    presets: stage.presets.map((preset) => ({
      id: preset.id,
      config: preset.config,
      fields: fieldsOf(stage.id, preset.id),
    })),
  }))
}

/** 新增自定义阶段时面板要用的定义。 */
export function customStageCatalog() {
  return {
    kind: 'custom',
    module: CUSTOM_STAGE.module,
    fields: CUSTOM_STAGE.fields,
    config: { command: '' },
  }
}

function presetOf(stage, template) {
  const entry = STAGES.find((item) => item.id === stage)
  if (!entry) throw new Error(`未知阶段 ${stage}`)
  const preset = entry.presets.find((item) => item.id === template)
  if (!preset) throw new Error(`阶段 ${stage} 没有执行模板 ${template}`)
  return preset
}

function normalizeStageConfig(stage, value) {
  const stageDef = STAGES.find((item) => item.id === stage)
  if (!stageDef) throw new Error(`未知阶段 ${stage}`)
  const template = value && value.template ? String(value.template) : stageDef.presets[0].id
  const preset = presetOf(stage, template)
  return {
    template,
    config: { ...preset.config, ...(value && value.config ? value.config : {}) },
  }
}

// ---------------------------------------------------------------- 小工具

function nowIso() {
  return new Date().toISOString()
}

function nfkc(text) {
  return String(text == null ? '' : text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .trim()
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

/** 自定义命令的超时从工作区配置来，取不到就用 120s。 */
async function commandTimeout() {
  try {
    const config = await readWorkspaceConfig()
    const value = Number(config.commandTimeoutMs)
    return Number.isFinite(value) && value >= 1000 ? value : 120000
  } catch {
    return 120000
  }
}

/** 跑一段自定义命令：stdin 收 JSON，stdout 吐 JSON。 */
function runCommand(command, payload, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (!command || !String(command).trim()) {
      reject(new Error('该阶段选了「自定义执行」，但没有填写命令'))
      return
    }
    const child = spawn(process.env.SHELL || '/bin/bash', ['-lc', String(command)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`自定义命令超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`自定义命令退出码 ${code}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`))
        return
      }
      const text = stdout.trim()
      if (!text) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(new Error(`自定义命令的 stdout 不是 JSON：${error.message}`))
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(payload))
  })
}

// ---------------------------------------------------------------- 四个阶段

async function stageScraping(ctx, payload, config, signal) {
  const { cases } = payload
  const template = payload.template
  if (template === 'custom') {
    const result = await runCommand(config.command, { stage: 'scraping', cases, config }, await commandTimeout())
    return Array.isArray(result) ? result : result.cases || []
  }
  const queryField = config.queryField || 'query'
  const out = []
  for (let index = 0; index < cases.length; index += 1) {
    if (signal.aborted) throw new Error('已取消')
    const item = cases[index] || {}
    if (template === 'inline') {
      out.push({
        ...item,
        material: String(item.material || item.evidence || ''),
        sources: item.sources || [],
        latencyMs: 0,
      })
      continue
    }
    const query = String(item[queryField] || item.query || '').trim()
    if (!query) {
      out.push({ ...item, material: '', sources: [], latencyMs: 0, scrapeError: '缺少 query' })
      continue
    }
    const startedAt = Date.now()
    try {
      const web = ctx.get('web')
      if (!web) throw new Error('当前 profile 没有可用的 web 检索服务')
      const result = await web.search({ query, maxResults: config.maxResults || 5 }, signal)
      const sources = Array.isArray(result.sources) ? result.sources : []
      const material = [result.content || '']
        .concat(sources.map((source) => [source.title, source.snippet].filter(Boolean).join(' — ')))
        .join('\n')
      out.push({
        ...item,
        query,
        material,
        sources: sources.map((source) => ({ url: source.url, title: source.title || '', snippet: source.snippet || '' })),
        latencyMs: Date.now() - startedAt,
      })
    } catch (error) {
      out.push({
        ...item,
        query,
        material: '',
        sources: [],
        latencyMs: Date.now() - startedAt,
        scrapeError: String(error && error.message ? error.message : error),
      })
    }
    if (typeof payload.progress === 'function') payload.progress(index + 1, cases.length)
    await delay(config.intervalMs || 0)
  }
  return out
}

/** 把一个信息点写成若干种可接受的写法：`a|b` 表示任一命中即算覆盖。 */
function expandPoint(point) {
  if (point && typeof point === 'object') {
    const text = String(point.text || point.point || '')
    const any = Array.isArray(point.any) ? point.any.map(String) : []
    return (any.length > 0 ? any : [text]).filter((item) => item.trim().length > 0)
  }
  return String(point || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
}

function pointsOf(item, config) {
  const raw = item[config.pointsField || 'infoPoints']
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[;；\n]/).map((part) => part.trim()).filter(Boolean)
  }
  const rubric = item[config.rubricField || 'rubric']
  if (typeof rubric === 'string' && rubric.trim()) {
    return rubric.split(/[;；\n]/).map((part) => part.trim()).filter(Boolean)
  }
  return []
}

async function stageAnnotation(ctx, payload, config, signal) {
  const { cases } = payload
  if (payload.template === 'custom') {
    const result = await runCommand(config.command, { stage: 'annotation', cases, config }, await commandTimeout())
    return Array.isArray(result) ? result : result.cases || []
  }
  const minCoverage = typeof config.minCoverage === 'number' ? config.minCoverage : 1
  const out = []
  for (const item of cases) {
    if (signal.aborted) throw new Error('已取消')
    const points = pointsOf(item, config)
    const material = nfkc(item.material)
    const missed = []
    let hit = 0
    for (const point of points) {
      const alternatives = expandPoint(point).map(nfkc)
      const covered = alternatives.length > 0 && alternatives.some((alt) => material.includes(alt))
      if (covered) hit += 1
      else missed.push(typeof point === 'string' ? point : String(point.text || point.point || ''))
    }
    const coverage = points.length === 0 ? 0 : hit / points.length
    out.push({
      ...item,
      points,
      hit,
      missed,
      coverage,
      score: points.length > 0 && coverage >= minCoverage ? 1 : 0,
    })
  }
  return out
}

async function stageMetrics(ctx, payload, config, signal) {
  const { cases, stages } = payload
  if (payload.template === 'custom') {
    const result = await runCommand(config.command, { stage: 'metrics', cases, stages, config }, await commandTimeout())
    return result.summary || result
  }
  const scored = cases.filter((item) => typeof item.score === 'number')
  const passed = scored.filter((item) => item.score === 1)
  const latencyField = config.latencyField || 'latencyMs'
  const latencies = cases
    .map((item) => Number(item[latencyField]))
    .filter((value) => Number.isFinite(value) && value >= 0)
  const coverageValues = scored.map((item) => (typeof item.coverage === 'number' ? item.coverage : 0))

  const summary = {
    total: cases.length,
    scored: scored.length,
    passed: passed.length,
    // 分母只说「有分数的行」，未抓到的行单列，避免把两种口径混着讲
    passRate: scored.length === 0 ? 0 : Number((passed.length / scored.length).toFixed(4)),
    avgCoverage: coverageValues.length === 0 ? 0 : Number((coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length).toFixed(4)),
    scrapeErrors: cases.filter((item) => item.scrapeError).length,
    latency: {
      count: latencies.length,
      avgMs: latencies.length === 0 ? 0 : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    },
    stages: Object.fromEntries(
      Object.entries(stages || {}).map(([key, value]) => [key, { status: value.status, durationMs: value.durationMs }]),
    ),
  }

  if (payload.template === 'grouped') {
    const groupBy = config.groupBy || 'bucket'
    const groups = {}
    for (const item of scored) {
      const key = String(item[groupBy] == null ? 'default' : item[groupBy])
      if (!groups[key]) groups[key] = { total: 0, passed: 0 }
      groups[key].total += 1
      if (item.score === 1) groups[key].passed += 1
    }
    summary.groups = Object.fromEntries(
      Object.entries(groups).map(([key, value]) => [
        key,
        { ...value, passRate: value.total === 0 ? 0 : Number((value.passed / value.total).toFixed(4)) },
      ]),
    )
  }
  return summary
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function buildMarkdown(payload, config) {
  const { run, cases, metrics } = payload
  const sections = Array.isArray(config.sections) && config.sections.length > 0
    ? config.sections
    : ['summary', 'stages', 'cases', 'failures']
  const lines = []
  lines.push(`# AutoEval 报告 · ${run.name}`)
  lines.push('')
  lines.push(`- 运行 ID：\`${run.id}\``)
  lines.push(`- 评测模板：\`${run.templateId}\``)
  lines.push(`- 开始：${run.startedAt}　结束：${run.finishedAt}`)
  lines.push('')
  if (sections.includes('summary')) {
    lines.push('## 总览')
    lines.push('')
    lines.push('| 指标 | 值 |')
    lines.push('| --- | --- |')
    lines.push(`| 用例总数 | ${metrics.total} |`)
    lines.push(`| 有分数的行 | ${metrics.scored} |`)
    lines.push(`| 通过 | ${metrics.passed} |`)
    lines.push(`| 通过率（分母=有分数的行） | ${pct(metrics.passRate)} |`)
    lines.push(`| 平均信息点覆盖 | ${pct(metrics.avgCoverage)} |`)
    lines.push(`| 抓取失败行 | ${metrics.scrapeErrors} |`)
    lines.push(`| 检索耗时 平均 / P50 / P95 | ${metrics.latency.avgMs}ms / ${metrics.latency.p50Ms}ms / ${metrics.latency.p95Ms}ms |`)
    lines.push('')
  }
  if (sections.includes('stages')) {
    lines.push('## 阶段耗时')
    lines.push('')
    lines.push('| 阶段 | 状态 | 耗时 |')
    lines.push('| --- | --- | --- |')
    const stageTable = payload.stages || metrics.stages || {}
    for (const [key, value] of Object.entries(stageTable)) {
      lines.push(`| ${key} | ${value.status} | ${value.durationMs == null ? '-' : `${value.durationMs}ms`} |`)
    }
    lines.push('')
  }
  if (sections.includes('cases')) {
    lines.push('## 逐条结果')
    lines.push('')
    lines.push('| 用例 | 查询 | 覆盖 | 分数 | 来源数 | 耗时 |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const item of cases) {
      const coverage = typeof item.coverage === 'number' ? pct(item.coverage) : '-'
      const score = typeof item.score === 'number' ? item.score : '-'
      const sources = Array.isArray(item.sources) ? item.sources.length : 0
      lines.push(`| ${item.id || '-'} | ${String(item.query || item[run.queryField] || '').slice(0, 60)} | ${coverage} | ${score} | ${sources} | ${item.latencyMs == null ? '-' : `${item.latencyMs}ms`} |`)
    }
    lines.push('')
  }
  if (sections.includes('failures')) {
    const failed = cases.filter((item) => item.score === 0 || item.scrapeError)
    lines.push('## 未通过 / 异常')
    lines.push('')
    if (failed.length === 0) {
      lines.push('无。')
    } else {
      for (const item of failed) {
        const reason = item.scrapeError ? `抓取失败：${item.scrapeError}` : `缺信息点：${(item.missed || []).join('、') || '（未知）'}`
        lines.push(`- **${item.id || '-'}**　${String(item.query || '').slice(0, 80)}　→ ${reason}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function stageReporting(ctx, payload, config, signal) {
  if (payload.template === 'custom') {
    const result = await runCommand(config.command, { stage: 'reporting', ...payload, config }, await commandTimeout())
    return { text: String(result.text || result.report || ''), format: 'markdown' }
  }
  if (payload.template === 'json') {
    return { text: JSON.stringify({ run: payload.run, metrics: payload.metrics, cases: payload.cases }, null, 2), format: 'json' }
  }
  return { text: buildMarkdown(payload, config), format: 'markdown' }
}

/** 多组时把各组的报告拼成一份：开头一段组间对比，后面每组一节。 */
function combineReports(run, reports) {
  if (reports.length === 1) return reports[0].text
  const lines = [`# AutoEval 报告 · ${run.name}`, '']
  const comparison = run.comparison
  if (comparison && comparison.treatments.length > 0) {
    lines.push('## 组间对比')
    lines.push('')
    lines.push('| 指标 | Control | ' + comparison.treatments.map((item) => item.name).join(' | ') + ' |')
    lines.push('| --- | --- | ' + comparison.treatments.map(() => '--- |').join(''))
    for (const row of comparison.rows) {
      lines.push(`| ${row.label} | ${row.control} | ${row.treatments.map((item) => item.text).join(' | ')} |`)
    }
    lines.push('')
  }
  for (const report of reports) {
    const body = String(report.text || '').split('\n')
    if (body[0] && body[0].startsWith('# ')) body.shift()
    lines.push(`## ${report.group.name}（${report.group.kind}）`)
    lines.push('')
    lines.push(body.join('\n').replace(/^\n+/, ''))
    lines.push('')
  }
  return lines.join('\n')
}

/** 组间对比：Control 打底，每个 Treatment 算差值。 */
function buildComparison(groups) {
  const control = groups.find((group) => group.kind === 'control')
  const treatments = groups.filter((group) => group.kind === 'treatment')
  if (!control || !control.metrics || treatments.length === 0) return null
  const pick = (metrics) => ({
    passRate: metrics.passRate,
    avgCoverage: metrics.avgCoverage,
    caseCount: metrics.total,
    scored: metrics.scored,
  })
  const keys = [
    { key: 'passRate', label: '通过率', pct: true },
    { key: 'avgCoverage', label: '平均覆盖', pct: true },
    { key: 'scored', label: '有分数的行', pct: false },
  ]
  const rows = keys.map((item) => ({
    key: item.key,
    label: item.label,
    control: formatMetric(pick(control.metrics)[item.key], item.pct),
    treatments: treatments.map((group) => {
      const value = pick(group.metrics || {})[item.key]
      const base = pick(control.metrics)[item.key]
      const delta = typeof value === 'number' && typeof base === 'number' ? value - base : null
      const sign = delta == null ? '' : delta > 0 ? '+' : ''
      const text = formatMetric(value, item.pct)
      return { text: delta == null ? text : `${text}（${sign}${item.pct ? `${(delta * 100).toFixed(1)}pp` : delta}）` }
    }),
  }))
  return {
    control: { id: control.id, name: control.name },
    treatments: treatments.map((group) => ({ id: group.id, name: group.name })),
    rows,
  }
}

function formatMetric(value, pct) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return pct ? `${(value * 100).toFixed(1)}%` : String(value)
}

/** 每个阶段跑完给一份能直接看的摘要，面板的折叠列表就展示这个。 */
function summarizeStage(stageId, cases) {
  if (stageId === 'scraping') {
    const withMaterial = cases.filter((item) => item.material && String(item.material).trim()).length
    const errors = cases.filter((item) => item.error).length
    const sources = cases.reduce((sum, item) => sum + ((item.sources && item.sources.length) || 0), 0)
    return { cases: cases.length, material: withMaterial, sources, errors }
  }
  if (stageId === 'annotation') {
    const scored = cases.filter((item) => typeof item.score === 'number').length
    const passed = cases.filter((item) => item.score === 1).length
    return { cases: cases.length, scored, passed }
  }
  return { cases: cases.length }
}

/** 自定义阶段：把当前用例交给命令，收回来的 cases 继续往下传。 */
async function stageCustom(ctx, payload, config, signal) {
  if (signal.aborted) throw new Error('已取消')
  const result = await runCommand(
    config.command,
    {
      stage: payload.stageId,
      cases: payload.cases,
      config,
      stages: payload.stages,
      metrics: payload.metrics,
      group: payload.group,
    },
    await commandTimeout(),
  )
  const next = Array.isArray(result) ? result : result && result.cases
  if (!Array.isArray(next)) {
    throw new Error(`自定义阶段 ${payload.stageId} 要把 {cases: [...]} 写到 stdout`)
  }
  return next
}

/** 报告的 query 列：取第一个带 queryField 的阶段配置。 */
function queryFieldOf(stages) {
  for (const stage of stages) {
    const field = stage.config && stage.config.queryField
    if (field) return field
  }
  return 'query'
}

const RUNNERS = {
  scraping: stageScraping,
  annotation: stageAnnotation,
  metrics: stageMetrics,
  reporting: stageReporting,
  custom: stageCustom,
}

// ---------------------------------------------------------------- 存储

async function readState() {
  try {
    const raw = await fsp.readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      version: dataVersion(parsed),
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    }
  } catch {
    return { version: DATA_VERSION, templates: [], runs: [] }
  }
}

function dataVersion(parsed) {
  return parsed && parsed.version ? parsed.version : DATA_VERSION
}

async function writeState(state) {
  await fsp.mkdir(dataDir(), { recursive: true })
  const tmp = `${statePath()}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
  await fsp.rename(tmp, statePath())
}

// ---------------------------------------------------------------- 模板文件（YAML）

function fieldComment(field) {
  const bits = []
  if (field.type === 'number') {
    const range = field.min != null && field.max != null ? `${field.min}~${field.max}` : ''
    bits.push(range ? `数字 ${range}` : '数字')
    if (field.unit) bits.push(field.unit)
  } else if (field.type === 'list') {
    bits.push(`列表，可选：${(field.options || []).map((item) => item.value).join(' / ')}`)
  } else if (field.type === 'command') {
    bits.push('命令，stdin 收 JSON / stdout 吐 JSON')
  } else {
    bits.push('字符串')
  }
  if (field.default !== undefined && field.default !== '') bits.push(`默认 ${JSON.stringify(field.default)}`)
  if (field.hint) bits.push(field.hint)
  return bits.join('，')
}

/** 一个模板写成 YAML 的样子，带字段说明注释，方便直接手改。 */
export function templateToYaml(template) {
  const comments = {}
  const stages = (template.stages || []).map((stage, index) => {
    const moduleId = stage.module || 'custom'
    const fieldStage = stage.kind === 'custom' ? 'custom' : stage.id
    for (const field of fieldsOf(fieldStage, moduleId)) {
      comments[`stages.${index}.config.${field.key}`] = fieldComment(field)
    }
    const entry = { id: stage.id, module: moduleId }
    if (stage.kind === 'custom' && stage.name) entry.name = stage.name
    entry.config = stage.config || {}
    return entry
  })
  const groups = (template.groups || []).map((group) => {
    const entry = { id: group.id, kind: group.kind, name: group.name }
    const overrides = {}
    for (const [stageId, patch] of Object.entries(group.overrides || {})) {
      overrides[stageId] = { module: patch.module, config: patch.config || {} }
    }
    entry.overrides = overrides
    return entry
  })
  const head = [
    `# AutoEval 任务模板：${template.name || template.id}`,
    `# 文件：templates/${template.id}.yaml（文件名就是模板 id）`,
    '# 阶段按 stages 里的顺序执行；四个预置阶段（scraping / annotation / metrics / reporting）',
    '# 之间的先后不能改，可以在它们之间插自定义阶段。groups 里必须有且只有一个 control。',
    '# 可以直接改这个文件，面板「任务模板 → YAML」能读回来；保存时按下面的注释校验。',
    '',
  ].join('\n')
  return `${head}${stringifyYaml(
    {
      id: template.id,
      name: template.name || template.id,
      description: template.description || '',
      stages,
      groups,
    },
    { comments },
  )}`
}

/** 校验并归一化一个模板，返回能落盘的结构。
 *  v2 的 stages 是数组（顺序即执行顺序），也接受 v1 的 {scraping: {template, config}} 对象。 */
export function normalizeTemplate(input) {
  const id = String(input && input.id ? input.id : '').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new Error('模板 id 只能用小写字母、数字和「-」，且不超过 64 个字符')
  }
  const name = String((input && input.name) || id).trim() || id
  const stages = stageListOf(input).map(normalizeStageEntry)
  validateStageOrder(stages)
  const groups = normalizeGroups(input && input.groups, stages)
  return { id, name, description: String((input && input.description) || ''), stages, groups }
}

/** v1 只有对象形式的 stages，这里按预置顺序摊成数组。 */
function stageListOf(input) {
  const raw = input && input.stages
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    return PRESET_STAGE_IDS
      .filter((stageId) => raw[stageId])
      .map((stageId) => ({ id: stageId, module: raw[stageId].module || raw[stageId].template, config: raw[stageId].config }))
  }
  throw new Error('模板缺少 stages')
}

function normalizeStageEntry(raw) {
  const stageId = String((raw && raw.id) || '').trim()
  if (!stageId) throw new Error('阶段要有 id')
  if (PRESET_STAGE_IDS.includes(stageId)) {
    const def = STAGES.find((item) => item.id === stageId)
    const moduleId = String((raw && (raw.module || raw.template)) || def.presets[0].id)
    if (!def.presets.some((item) => item.id === moduleId)) {
      throw new Error(`阶段 ${stageId} 没有执行模块 ${moduleId}`)
    }
    return { id: stageId, kind: 'preset', module: moduleId, config: validateConfig(stageId, moduleId, (raw && raw.config) || {}) }
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(stageId)) {
    throw new Error(`自定义阶段 id 只能用小写字母、数字和「-」：${stageId}`)
  }
  const moduleId = String((raw && raw.module) || 'custom')
  if (moduleId !== 'custom') throw new Error(`自定义阶段 ${stageId} 目前只能用「自定义命令」模块`)
  return {
    id: stageId,
    kind: 'custom',
    name: String((raw && raw.name) || stageId),
    module: moduleId,
    config: validateConfig('custom', 'custom', (raw && raw.config) || {}),
  }
}

function validateStageOrder(stages) {
  const ids = stages.map((stage) => stage.id)
  const dupes = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (dupes.length > 0) throw new Error(`阶段 ${dupes[0]} 重复了`)
  const presets = stages.filter((stage) => stage.kind === 'preset').map((stage) => stage.id)
  const missing = PRESET_STAGE_IDS.filter((id) => !presets.includes(id))
  if (missing.length > 0) throw new Error(`预置阶段不能删：${missing.join(' / ')}`)
  if (presets.join('>') !== PRESET_STAGE_IDS.join('>')) {
    throw new Error(`预置阶段之间的先后不能改，只能是 ${PRESET_STAGE_IDS.join(' → ')}`)
  }
}

/** 组：必须正好一个 Control，后面可以跟任意多个 Treatment。 */
function normalizeGroups(input, stages) {
  const raw = Array.isArray(input) && input.length > 0 ? input : [{ id: 'control', kind: 'control' }]
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const kind = item && item.kind === 'treatment' ? 'treatment' : 'control'
    const groupId = String((item && item.id) || '').trim() || (kind === 'control' ? 'control' : `treatment-${out.length}`)
    if (!/^[a-z0-9][a-z0-9-]{0,32}$/.test(groupId)) {
      throw new Error(`组 id 只能用小写字母、数字和「-」：${groupId}`)
    }
    if (seen.has(groupId)) throw new Error(`组 ${groupId} 重复了`)
    seen.add(groupId)
    const overrides = {}
    for (const [stageId, patch] of Object.entries((item && item.overrides) || {})) {
      const stage = byId.get(stageId)
      if (!stage) throw new Error(`组 ${groupId} 覆盖了模板里没有的阶段 ${stageId}`)
      const moduleId = String((patch && patch.module) || stage.module)
      if (stage.kind === 'preset') {
        const def = STAGES.find((entry) => entry.id === stageId)
        if (!def.presets.some((entry) => entry.id === moduleId)) {
          throw new Error(`组 ${groupId} 的 ${stageId} 没有执行模块 ${moduleId}`)
        }
      } else if (moduleId !== 'custom') {
        throw new Error(`组 ${groupId} 的自定义阶段 ${stageId} 只能用「自定义命令」模块`)
      }
      overrides[stageId] = {
        module: moduleId,
        config: validateConfig(stage.kind === 'custom' ? 'custom' : stageId, moduleId, (patch && patch.config) || {}),
      }
    }
    out.push({
      id: groupId,
      kind,
      name: String((item && item.name) || (kind === 'control' ? 'Control' : groupId)),
      overrides,
    })
  }
  const controls = out.filter((group) => group.kind === 'control')
  if (controls.length !== 1) throw new Error('必须正好有一个 Control 组')
  return [controls[0], ...out.filter((group) => group.kind !== 'control')]
}

/** 某个组实际要跑的阶段：模板阶段 + 该组的覆盖。 */
export function effectiveStages(template, group) {
  return template.stages.map((stage) => {
    const patch = group && group.overrides ? group.overrides[stage.id] : null
    if (!patch) return stage
    return { ...stage, module: patch.module || stage.module, config: patch.config || stage.config }
  })
}

function validateConfig(stageId, presetId, config) {
  const cleaned = {}
  const fields = fieldsOf(stageId, presetId)
  const byKey = new Map(fields.map((field) => [field.key, field]))
  for (const [key, value] of Object.entries(config)) {
    const field = byKey.get(key)
    if (!field) {
      cleaned[key] = value
      continue
    }
    cleaned[key] = validateField(stageId, presetId, field, value)
  }
  // 必填的补默认值：自定义命令没填就直接报，免得跑起来才炸
  for (const field of fields) {
    if (cleaned[field.key] !== undefined) continue
    if (field.type === 'command') throw new Error(`${stageId}.${presetId} 缺少 command，自定义执行必须给命令`)
    if (field.default !== undefined) cleaned[field.key] = field.default
  }
  return cleaned
}

function validateField(stageId, presetId, field, value) {
  const where = `${stageId}.${presetId}.${field.key}`
  if (field.type === 'number') {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    if (typeof number !== 'number' || !Number.isFinite(number)) throw new Error(`${where} 要是数字`)
    if (field.min != null && number < field.min) throw new Error(`${where} 不能小于 ${field.min}`)
    if (field.max != null && number > field.max) throw new Error(`${where} 不能大于 ${field.max}`)
    return number
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${where} 要是 true / false`)
    return value
  }
  if (field.type === 'list') {
    const list = Array.isArray(value) ? value : []
    const allowed = field.options ? field.options.map((item) => item.value) : null
    for (const item of list) {
      if (allowed && !allowed.includes(item)) throw new Error(`${where} 里有不认识的取值 ${item}`)
    }
    return list
  }
  if (field.type === 'command' || field.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${where} 要是字符串`)
    if (field.type === 'command' && !value.trim()) throw new Error(`${where} 不能为空`)
    return value
  }
  return value
}

async function readTemplates() {
  const dir = templatesDir()
  let names = []
  try {
    names = await fsp.readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names.sort()) {
    if (!/\.ya?ml$/i.test(name)) continue
    const file = path.join(dir, name)
    const base = name.replace(/\.ya?ml$/i, '')
    let text = ''
    try {
      text = await fsp.readFile(file, 'utf8')
    } catch (error) {
      out.push({
        id: base,
        name: base,
        description: '',
        builtin: false,
        broken: String(error.message),
        file,
        stages: [],
        groups: [{ id: 'control', kind: 'control', name: 'Control', overrides: {} }],
      })
      continue
    }
    let doc = null
    let broken = null
    try {
      doc = parseYaml(text)
      doc = normalizeTemplate({ ...doc, id: (doc && doc.id) || base })
    } catch (error) {
      broken = String(error && error.message ? error.message : error)
    }
    out.push({
      id: base,
      name: (doc && doc.name) || base,
      description: (doc && doc.description) || '',
      builtin: false,
      broken,
      file,
      stages: (doc && doc.stages) || [],
      groups: (doc && doc.groups) || [{ id: 'control', kind: 'control', name: 'Control', overrides: {} }],
    })
  }
  return out
}

async function writeTemplateFile(template) {
  await fsp.mkdir(templatesDir(), { recursive: true })
  await fsp.writeFile(templateFile(template.id), templateToYaml(template), 'utf8')
}

// ---------------------------------------------------------------- 运行编排

class AutoEvalService {
  constructor(ctx) {
    this.ctx = ctx
    this.active = null
    this.progress = null
  }

  async list() {
    const state = await readState()
    const files = await readTemplates()
    const config = await readWorkspaceConfig()
    return {
      stages: stageCatalog(),
      customStage: customStageCatalog(),
      templates: [
        ...BUILTIN_TEMPLATES.map((item) => ({ ...normalizeTemplate(item), builtin: true })),
        ...files,
      ],
      querysets: (await readQuerysets()).map(summarizeQueryset),
      runs: state.runs,
      active: this.active ? this.snapshot() : null,
      workspace: {
        ...(await workspaceInfo()),
        fields: WORKSPACE_FIELDS,
        config,
      },
    }
  }

  snapshot() {
    if (!this.active) return null
    return {
      id: this.active.id,
      name: this.active.name,
      status: this.active.status,
      progress: this.progress,
      stages: this.active.stages,
    }
  }

  async start(input) {
    if (this.active) throw new Error('已有一次运行在进行中，等它结束或者先取消')
    let cases = Array.isArray(input.cases) ? input.cases : []
    if (input.querysetId) {
      const queryset = (await readQuerysets()).find((item) => item.id === input.querysetId)
      if (!queryset) throw new Error(`没有这个 Queryset：${input.querysetId}`)
      if (!Array.isArray(queryset.cases) || queryset.cases.length === 0) {
        throw new Error(`Queryset「${queryset.name || queryset.id}」里没有用例`)
      }
      cases = queryset.cases
    }
    if (cases.length === 0) throw new Error('用例为空：至少给一条用例')
    const template = await this.templateFor(input)
    const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const run = {
      id,
      name: String(input.name || `AutoEval ${id}`),
      templateId: String(input.templateId || 'custom'),
      querysetId: input.querysetId ? String(input.querysetId) : null,
      startedAt: nowIso(),
      finishedAt: null,
      status: 'running',
      groups: [],
      stages: {},
      // 把这次用的模板整份存下来，重跑和任务详情都靠它
      templateSnapshot: template,
      caseCount: cases.length,
      metrics: null,
      artifacts: null,
      log: [],
    }
    // 用例快照先落盘：任务失败也还能照着原样重跑
    const dir = path.join(dataDir(), 'runs', id)
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(path.join(dir, 'cases.json'), JSON.stringify(cases, null, 2), 'utf8')
    run.artifacts = { dir, report: null, rows: null, cases: path.join(dir, 'cases.json') }
    this.active = { ...run, cases }
    this.progress = { stage: null, done: 0, total: cases.length }
    const controller = new AbortController()
    this.controller = controller
    // 后台跑，HTTP 立刻返回 runId
    void this.execute(run, cases, template, controller.signal).catch(() => {})
    return { runId: id }
  }

  cancel() {
    if (!this.active) return { cancelled: false }
    if (this.controller) this.controller.abort()
    return { cancelled: true }
  }

  async execute(run, cases, template, signal) {
    const startedAt = Date.now()
    const reports = []
    try {
      for (const group of template.groups) {
        if (signal.aborted) throw new Error('已取消')
        const stages = effectiveStages(template, group)
        const groupRun = {
          id: group.id,
          name: group.name,
          kind: group.kind,
          status: 'running',
          stages: {},
          metrics: null,
          report: null,
        }
        for (const stage of stages) {
          groupRun.stages[stage.id] = {
            name: stage.kind === 'custom' ? (stage.name || stage.id) : stage.id,
            kind: stage.kind,
            template: stage.module,
            config: stage.config,
            status: 'pending',
            durationMs: null,
            error: null,
            summary: null,
          }
        }
        run.groups.push(groupRun)
        // 兼容旧面板：stages 指向第一组（Control）
        if (run.groups.length === 1) run.stages = groupRun.stages
        let current = cases
        for (const stage of stages) {
          if (signal.aborted) throw new Error('已取消')
          const stageRun = groupRun.stages[stage.id]
          const stageStartedAt = Date.now()
          stageRun.status = 'running'
          this.progress = { stage: stage.id, group: group.id, done: 0, total: current.length }
          run.log.push({ at: nowIso(), group: group.id, stage: stage.id, message: `开始（模块 ${stage.module}）` })
          const runner = stage.kind === 'custom' ? RUNNERS.custom : RUNNERS[stage.id]
          const result = await runner(
            this.ctx,
            {
              stageId: stage.id,
              template: stage.module,
              cases: current,
              stages: groupRun.stages,
              run: { ...run, groups: undefined, queryField: queryFieldOf(stages), finishedAt: nowIso() },
              metrics: groupRun.metrics,
              group: { id: group.id, name: group.name, kind: group.kind },
              progress: (done, total) => { this.progress = { stage: stage.id, group: group.id, done, total } },
            },
            stage.config,
            signal,
          )
          stageRun.durationMs = Date.now() - stageStartedAt
          stageRun.status = 'done'
          if (stage.kind === 'preset' && stage.id === 'reporting') {
            stageRun.summary = { format: result.format, chars: result.text.length, rows: current.length }
            groupRun.report = { format: result.format, text: result.text }
            reports.push({ group, text: result.text, format: result.format })
          } else if (stage.kind === 'preset' && stage.id === 'metrics') {
            // summary 只留指标本身：面板折叠列表要显示它，stages 快照太吵
            const { stages: _snapshot, ...metricsOnly } = result
            stageRun.summary = metricsOnly
            groupRun.metrics = result
          } else {
            current = result
            stageRun.summary = summarizeStage(stage.kind === 'custom' ? 'custom' : stage.id, current)
          }
          this.progress = { stage: stage.id, group: group.id, done: current.length, total: current.length }
          run.log.push({ at: nowIso(), group: group.id, stage: stage.id, message: `完成，用时 ${stageRun.durationMs}ms` })
        }
        groupRun.status = 'done'
        groupRun.caseCount = current.length
        // 报告要用各阶段加工后的最终用例，只在内存里放一会儿
        groupRun._cases = current
      }
      run.metrics = run.groups[0] ? run.groups[0].metrics : null
      run.comparison = buildComparison(run.groups)
      run.status = 'done'
      await this.writeArtifacts(run, cases, reports)
    } catch (error) {
      run.status = signal.aborted ? 'cancelled' : 'failed'
      run.error = String(error && error.message ? error.message : error)
      for (const groupRun of run.groups) {
        if (groupRun.status === 'running') {
          groupRun.status = 'failed'
          groupRun.error = run.error
        }
        for (const stageRun of Object.values(groupRun.stages)) {
          if (stageRun.status === 'running') {
            stageRun.status = 'failed'
            stageRun.error = run.error
          }
        }
      }
      run.log.push({ at: nowIso(), stage: null, message: `失败：${run.error}` })
    } finally {
      run.finishedAt = nowIso()
      run.durationMs = Date.now() - startedAt
      const state = await readState()
      for (const group of run.groups || []) delete group._cases
      const finished = { ...run, cases: undefined }
      delete finished.cases
      state.runs.unshift(finished)
      const config = await readWorkspaceConfig()
      state.runs = state.runs.slice(0, Math.max(1, Number(config.maxRuns) || 30))
      await writeState(state)
      this.lastRun = finished
      this.active = null
      this.progress = null
      this.controller = null
    }
  }

  async writeArtifacts(run, cases, reports) {
    const dir = path.join(dataDir(), 'runs', run.id)
    await fsp.mkdir(dir, { recursive: true })
    const format = (reports[0] && reports[0].format) || 'markdown'
    const name = format === 'json' ? 'report.json' : 'report.md'
    const text = format === 'json'
      ? JSON.stringify(
        { run: { id: run.id, name: run.name, templateId: run.templateId }, groups: reports.map((item) => ({ group: item.group, text: item.text })) },
        null,
        2,
      )
      : combineReports(run, reports)
    await fsp.writeFile(path.join(dir, name), text, 'utf8')
    const rows = []
    for (const group of run.groups || []) {
      const list = Array.isArray(group._cases) ? group._cases : cases
      for (const item of list) {
        rows.push(JSON.stringify(reports.length > 1 ? { group: group.id, ...item } : item))
      }
    }
    await fsp.writeFile(path.join(dir, 'rows.jsonl'), rows.join('\n') + '\n', 'utf8')
    run.artifacts = {
      dir,
      report: path.join(dir, name),
      rows: path.join(dir, 'rows.jsonl'),
      cases: path.join(dir, 'cases.json'),
    }
    this.active.artifacts = run.artifacts
  }

  async readArtifact(runId, kind) {
    const state = await readState()
    const run = state.runs.find((item) => item.id === runId)
    if (!run || !run.artifacts) throw new Error(`找不到运行 ${runId} 的产物`)
    const file = kind === 'rows' ? run.artifacts.rows : run.artifacts.report
    if (!file) throw new Error(`运行 ${runId} 没有${kind === 'rows' ? '逐条结果' : '报告'}（跑失败了？）`)
    return fsp.readFile(file, 'utf8')
  }

  /** 删掉一次运行：记录 + 产物目录。运行中的先取消再删。 */
  async deleteRun(runId) {
    if (this.active && this.active.id === runId) throw new Error('这次运行还在跑，先取消再删')
    const state = await readState()
    const index = state.runs.findIndex((item) => item.id === runId)
    if (index < 0) throw new Error(`找不到运行 ${runId}`)
    const [run] = state.runs.splice(index, 1)
    await writeState(state)
    if (run.artifacts && run.artifacts.dir) {
      await fsp.rm(run.artifacts.dir, { recursive: true, force: true })
    }
    return { removed: runId }
  }

  /** 按原样再跑一次：用例来自 cases.json，阶段模板与参数来自运行记录。 */
  /** 这次运行要用哪个模板：显式快照 > 模板文件 > 提交时塞进来的阶段配置。 */
  async templateFor(input) {
    if (input.stageSource === 'record' && input.templateSnapshot) {
      return normalizeTemplate(input.templateSnapshot)
    }
    const chosen = [...BUILTIN_TEMPLATES, ...(await readTemplates())].find((item) => item.id === input.templateId)
    if (chosen) return normalizeTemplate(chosen)
    if (input.stages) {
      return normalizeTemplate({
        id: String(input.templateId || 'custom'),
        stages: input.stages,
        groups: input.groups,
      })
    }
    throw new Error(`没有这个模板：${input.templateId || '(空)'}`)
  }

  /** 重跑：优先用当次记录的模板快照，老记录就按阶段表反推。 */
  async templateForRun(run) {
    if (run.templateSnapshot) return normalizeTemplate(run.templateSnapshot)
    const stages = Array.isArray(run.stages)
      ? run.stages
      : Object.entries(run.stages || {}).map(([stageId, entry]) => ({
        id: stageId,
        module: entry.template,
        config: entry.config,
      }))
    const groups = Array.isArray(run.groups) && run.groups.length > 0
      ? run.groups.map((group) => ({ id: group.id, kind: group.kind, name: group.name }))
      : undefined
    return normalizeTemplate({ id: run.templateId || 'custom', stages, groups })
  }

  async rerun(runId) {
    const state = await readState()
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw new Error(`找不到运行 ${runId}`)
    const file = run.artifacts && run.artifacts.cases
    if (!file) throw new Error('这次运行没有留下用例快照，不能重跑')
    const cases = JSON.parse(await fsp.readFile(file, 'utf8'))
    if (!Array.isArray(cases) || cases.length === 0) throw new Error('用例快照是空的')
    const template = await this.templateForRun(run)
    const result = await this.start({
      name: `${run.name}（重跑）`,
      templateId: run.templateId,
      cases,
      templateSnapshot: template,
      stageSource: 'record',
    })
    return { ...result, source: runId }
  }

  /** 任务详情：记录 + 阶段 + 日志。 */
  async runDetail(runId) {
    const state = await readState()
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw new Error(`找不到运行 ${runId}`)
    return { run, log: run.log || [] }
  }

  async saveTemplate(input) {
    const template = normalizeTemplate(input)
    if (BUILTIN_TEMPLATES.some((item) => item.id === template.id)) throw new Error('不能覆盖内置模板')
    await writeTemplateFile(template)
    return { ...template, builtin: false, file: templateFile(template.id) }
  }

  /** 直接存一段 YAML：用户在面板里改文件，或者干脆用编辑器改完贴进来。 */
  async saveTemplateYaml(text) {
    let doc = null
    try {
      doc = parseYaml(text)
    } catch (error) {
      throw new Error(`YAML 解析失败：${error.message}`)
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('YAML 顶层应该是一个映射（id / name / stages）')
    return this.saveTemplate(doc)
  }

  async templateYaml(id) {
    const builtin = BUILTIN_TEMPLATES.find((item) => item.id === id)
    if (builtin) return { id, yaml: templateToYaml(builtin), file: null, builtin: true }
    const file = templateFile(id)
    let text = null
    try {
      text = await fsp.readFile(file, 'utf8')
    } catch {
      throw new Error(`找不到模板 ${id}`)
    }
    return { id, yaml: text, file, builtin: false }
  }

  async listQuerysets() {
    return (await readQuerysets()).map(summarizeQueryset)
  }

  async querysetDetail(id) {
    const queryset = (await readQuerysets()).find((item) => item.id === id)
    if (!queryset) throw new Error(`没有这个 Queryset：${id}`)
    return queryset
  }

  async saveQueryset(input) {
    const existing = (await readQuerysets()).find((item) => item.id === String((input && input.id) || '').trim())
    const queryset = normalizeQueryset({ ...input, createdAt: existing ? existing.createdAt : undefined })
    await writeQuerysetFile(queryset)
    return summarizeQueryset(queryset)
  }

  async deleteQueryset(id) {
    try {
      await fsp.unlink(querysetFile(id))
    } catch (error) {
      if (error && error.code === 'ENOENT') throw new Error(`没有这个 Queryset：${id}`)
      throw error
    }
    return { id }
  }

  /** 只解析不落盘：面板里先给用户看预览，确认再存。 */
  async importQueryset(input) {
    const result = await importQueries(input)
    return {
      fields: result.fields,
      cases: result.cases,
      queryField: result.queryField,
      skipped: result.skipped,
      total: result.cases.length,
      title: result.title || '',
    }
  }

  async saveConfig(input) {
    return writeWorkspaceConfig(input)
  }

  /** 在系统文件管理器里打开工作区目录（本地应用，失败就把错误抛回去）。 */
  async openWorkspace() {
    const dir = dataDir()
    await fsp.mkdir(dir, { recursive: true })
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
    await new Promise((resolve, reject) => {
      const child = spawn(opener, [dir], { stdio: 'ignore', detached: true })
      child.on('error', (error) => reject(new Error(`打不开 ${dir}：${error.message}`)))
      child.on('spawn', () => {
        child.unref()
        resolve()
      })
    })
    return { dir }
  }

  /** 只渲染不落盘：新建模板时 YAML 页签也要有东西可看。 */
  async previewTemplate(input) {
    return { yaml: templateToYaml(normalizeTemplate(input)) }
  }

  async deleteTemplate(id) {
    if (BUILTIN_TEMPLATES.some((item) => item.id === id)) throw new Error('内置模板不能删')
    const file = templateFile(id)
    try {
      await fsp.unlink(file)
      return { removed: 1 }
    } catch {
      return { removed: 0 }
    }
  }
}

// ---------------------------------------------------------------- HTTP

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  return JSON.parse(text)
}

export const inject = ['webServer']

export function apply(ctx, config = {}) {
  // 服务实例只在本插件内部用，不注册成 Cordis Service（避免和 provide 冲突）
  const service = new AutoEvalService(ctx)

  ctx.effect(() => {
    const route = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')
          const routePath = url.pathname.slice(API_PREFIX.length) || '/'
          if (req.method === 'GET' && routePath === '/state') {
            const data = await service.list()
            sendJson(res, 200, {
              ok: true,
              stages: data.stages || stageCatalog(),
              ...data,
              lastRun: service.lastRun || null,
            })
            return
          }
          if (req.method === 'POST' && routePath === '/run') {
            const body = await readBody(req)
            const result = await service.start(body)
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'POST' && routePath === '/cancel') {
            sendJson(res, 200, { ok: true, ...service.cancel() })
            return
          }
          if (req.method === 'GET' && routePath === '/report') {
            const text = await service.readArtifact(url.searchParams.get('run') || '', 'report')
            sendJson(res, 200, { ok: true, text })
            return
          }
          if (req.method === 'GET' && routePath === '/runs/detail') {
            const detail = await service.runDetail(url.searchParams.get('id') || '')
            sendJson(res, 200, { ok: true, ...detail })
            return
          }
          if (req.method === 'POST' && routePath === '/runs/rerun') {
            const body = await readBody(req)
            const result = await service.rerun(String(body.id || url.searchParams.get('id') || ''))
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'DELETE' && routePath === '/runs') {
            const result = await service.deleteRun(url.searchParams.get('id') || '')
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'GET' && routePath === '/rows') {
            const text = await service.readArtifact(url.searchParams.get('run') || '', 'rows')
            sendJson(res, 200, { ok: true, text })
            return
          }
          if (req.method === 'POST' && routePath === '/templates') {
            const record = await service.saveTemplate(await readBody(req))
            sendJson(res, 200, { ok: true, template: record })
            return
          }
          if (req.method === 'POST' && routePath === '/workspace/config') {
            const config = await service.saveConfig(await readBody(req))
            sendJson(res, 200, { ok: true, config })
            return
          }
          if (req.method === 'POST' && routePath === '/workspace/open') {
            const result = await service.openWorkspace()
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'GET' && routePath === '/querysets') {
            const id = url.searchParams.get('id') || ''
            if (id) {
              const queryset = await service.querysetDetail(id)
              sendJson(res, 200, { ok: true, queryset })
            } else {
              sendJson(res, 200, { ok: true, querysets: await service.listQuerysets() })
            }
            return
          }
          if (req.method === 'POST' && routePath === '/querysets') {
            const saved = await service.saveQueryset(await readBody(req))
            sendJson(res, 200, { ok: true, queryset: saved })
            return
          }
          if (req.method === 'DELETE' && routePath === '/querysets') {
            const result = await service.deleteQueryset(url.searchParams.get('id') || '')
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'POST' && routePath === '/querysets/import') {
            const result = await service.importQueryset(await readBody(req))
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'POST' && routePath === '/templates/preview') {
            const result = await service.previewTemplate(await readBody(req))
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'GET' && routePath === '/templates/raw') {
            const result = await service.templateYaml(url.searchParams.get('id') || '')
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          if (req.method === 'POST' && routePath === '/templates/raw') {
            const body = await readBody(req)
            const record = await service.saveTemplateYaml(String((body && body.yaml) || ''))
            sendJson(res, 200, { ok: true, template: record })
            return
          }
          if (req.method === 'DELETE' && routePath === '/templates') {
            const result = await service.deleteTemplate(url.searchParams.get('id') || '')
            sendJson(res, 200, { ok: true, ...result })
            return
          }
          sendJson(res, 404, { ok: false, error: `未知接口 ${req.method} ${routePath}` })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      },
    })
    return () => route()
  }, 'autoeval: http routes')

  // 老版本把模板存在 state.json 里，这里搬成 templates/<id>.yaml，搬完清空
  ctx.effect(() => {
    void (async () => {
      try {
        const state = await readState()
        if (!Array.isArray(state.templates) || state.templates.length === 0) return
        await fsp.mkdir(templatesDir(), { recursive: true })
        for (const template of state.templates) {
          if (!template || !template.id) continue
          try {
            await fsp.access(templateFile(template.id))
          } catch {
            try {
              await writeTemplateFile(normalizeTemplate(template))
            } catch (error) {
              ctx.logger?.warn?.(`autoeval: 迁移模板 ${template.id} 失败：${error.message}`)
            }
          }
        }
        state.templates = []
        await writeState(state)
      } catch (error) {
        ctx.logger?.warn?.(`autoeval: 迁移模板失败：${error.message}`)
      }
    })()
  }, 'autoeval: migrate templates')
  return () => route()

  const tools = ctx.get('tools')
  if (tools) {
    ctx.effect(() => tools.register({
      name: 'autoeval_run',
      description: 'Run one AutoEval evaluation: scraping → annotation → metrics → reporting. Returns the run id; poll autoeval_status for progress.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          templateId: { type: 'string' },
          cases: { type: 'array', items: { type: 'object', additionalProperties: true } },
          stages: { type: 'object', additionalProperties: true },
        },
        required: ['cases'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { runId: { type: 'string' } },
          required: ['runId'],
        },
        render: (_args, value) => [{ type: 'text', text: `AutoEval 已启动：${value.runId}` }],
      },
      async execute(args) {
        return service.start(args)
      },
    }), 'autoeval: tool autoeval_run')

    ctx.effect(() => tools.register({
      name: 'autoeval_status',
      description: 'Read the latest AutoEval run state: stage status, metrics, and where the report was written.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute() {
        const data = await service.list()
        return {
          active: data.active,
          lastRun: service.lastRun || data.runs[0] || null,
          templates: data.templates.map((item) => ({ id: item.id, name: item.name })),
        }
      },
    }), 'autoeval: tool autoeval_status')
  }
}

export { AutoEvalService, BUILTIN_TEMPLATES }
