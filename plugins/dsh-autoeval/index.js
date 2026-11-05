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

const API_PREFIX = '/autoeval-api'
const MAX_RUNS = 30
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

/** 某个阶段某个执行模板的可配字段（面板用它生成表单）。 */
export function fieldsOf(stageId, presetId) {
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
  return STAGES.map((stage) => ({
    id: stage.id,
    presets: stage.presets.map((preset) => ({
      id: preset.id,
      config: preset.config,
      fields: fieldsOf(stage.id, preset.id),
    })),
  }))
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
    const result = await runCommand(config.command, { stage: 'scraping', cases, config })
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
    const result = await runCommand(config.command, { stage: 'annotation', cases, config })
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
    const result = await runCommand(config.command, { stage: 'metrics', cases, stages, config })
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
    const result = await runCommand(config.command, { stage: 'reporting', ...payload, config })
    return { text: String(result.text || result.report || ''), format: 'markdown' }
  }
  if (payload.template === 'json') {
    return { text: JSON.stringify({ run: payload.run, metrics: payload.metrics, cases: payload.cases }, null, 2), format: 'json' }
  }
  return { text: buildMarkdown(payload, config), format: 'markdown' }
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

const RUNNERS = {
  scraping: stageScraping,
  annotation: stageAnnotation,
  metrics: stageMetrics,
  reporting: stageReporting,
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
  for (const stage of STAGES) {
    const entry = (template.stages || {})[stage.id]
    if (!entry) continue
    for (const field of fieldsOf(stage.id, entry.template)) {
      comments[`stages.${stage.id}.config.${field.key}`] = fieldComment(field)
    }
  }
  const head = [
    `# AutoEval 任务模板：${template.name || template.id}`,
    `# 文件：templates/${template.id}.yaml（文件名就是模板 id）`,
    '# 可以直接改这个文件，面板「任务模板 → YAML」能读回来；保存时按下面的注释校验。',
    '',
  ].join('\n')
  return `${head}${stringifyYaml(
    {
      id: template.id,
      name: template.name || template.id,
      description: template.description || '',
      stages: template.stages || {},
    },
    { comments },
  )}`
}

/** 校验并归一化一个模板，返回能落盘的结构。 */
export function normalizeTemplate(input) {
  const id = String(input && input.id ? input.id : '').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new Error('模板 id 只能用小写字母、数字和「-」，且不超过 64 个字符')
  }
  const name = String((input && input.name) || id).trim() || id
  const stages = {}
  for (const stage of STAGES) {
    const raw = input && input.stages ? input.stages[stage.id] : undefined
    if (!raw) throw new Error(`模板缺少阶段 ${stage.id}`)
    const presetId = String(raw.template || '')
    const preset = stage.presets.find((item) => item.id === presetId)
    if (!preset) throw new Error(`阶段 ${stage.id} 没有执行模板 ${presetId}`)
    stages[stage.id] = {
      template: presetId,
      config: validateConfig(stage.id, presetId, raw.config || {}),
    }
  }
  return { id, name, description: String((input && input.description) || ''), stages }
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
      out.push({ id: base, name: base, description: '', builtin: false, broken: String(error.message), file, stages: {} })
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
      stages: (doc && doc.stages) || {},
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
    return {
      stages: stageCatalog(),
      templates: [...BUILTIN_TEMPLATES, ...files],
      runs: state.runs,
      active: this.active ? this.snapshot() : null,
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
    const cases = Array.isArray(input.cases) ? input.cases : []
    if (cases.length === 0) throw new Error('用例为空：至少给一条用例')
    // 只给 templateId 时按模板里的阶段配置补全，没给模板就各自用第一个内置模板
    const chosen = [...BUILTIN_TEMPLATES, ...(await readTemplates())].find((item) => item.id === input.templateId)
    // 面板提交一律按模板跑：带了已知模板就忽略外面塞进来的阶段配置，
    // 免得任务和模板悄悄漂移。重跑走 stageSource: 'record'，保留当次记录。
    const supplied = input.stageSource === 'record' || !chosen ? input.stages : undefined
    const stages = {}
    for (const stage of STAGES) {
      const provided = supplied ? supplied[stage.id] : undefined
      const fallback = !provided && chosen && chosen.stages ? chosen.stages[stage.id] : undefined
      stages[stage.id] = normalizeStageConfig(stage.id, provided || fallback)
    }
    const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const run = {
      id,
      name: String(input.name || `AutoEval ${id}`),
      templateId: String(input.templateId || 'custom'),
      startedAt: nowIso(),
      finishedAt: null,
      status: 'running',
      stages: Object.fromEntries(
        STAGES.map((stage) => [
          stage.id,
          // 把这次用的模板与参数一起存下来，重跑和任务详情都靠它
          { status: 'pending', durationMs: null, error: null, summary: null, template: stages[stage.id].template, config: stages[stage.id].config },
        ]),
      ),
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
    void this.execute(run, cases, stages, controller.signal).catch(() => {})
    return { runId: id }
  }

  cancel() {
    if (!this.active) return { cancelled: false }
    if (this.controller) this.controller.abort()
    return { cancelled: true }
  }

  async execute(run, cases, stages, signal) {
    let current = cases
    const startedAt = Date.now()
    try {
      for (const stage of STAGES) {
        if (signal.aborted) throw new Error('已取消')
        const stageRun = this.active.stages[stage.id]
        const stageStartedAt = Date.now()
        stageRun.status = 'running'
        this.progress = { stage: stage.id, done: 0, total: current.length }
        run.log.push({ at: nowIso(), stage: stage.id, message: `开始（模板 ${stages[stage.id].template}）` })
        const result = await RUNNERS[stage.id](
          this.ctx,
          {
            template: stages[stage.id].template,
            cases: current,
            stages: this.active.stages,
            run: { ...run, queryField: stages.scraping.config.queryField, finishedAt: nowIso() },
            metrics: this.active.metrics,
            progress: (done, total) => { this.progress = { stage: stage.id, done, total } },
          },
          stages[stage.id].config,
          signal,
        )
        stageRun.durationMs = Date.now() - stageStartedAt
        stageRun.status = 'done'
        if (stage.id === 'reporting') {
          stageRun.summary = { format: result.format, chars: result.text.length, rows: current.length }
          await this.writeArtifacts(run, current, result)
        } else if (stage.id === 'metrics') {
          // summary 只留指标本身：面板折叠列表要显示它，stages 快照太吵
          const { stages: _snapshot, ...metricsOnly } = result
          stageRun.summary = metricsOnly
          this.active.metrics = result
          run.metrics = result
        } else {
          current = result
          stageRun.summary = summarizeStage(stage.id, current)
        }
        this.progress = { stage: stage.id, done: current.length, total: current.length }
        run.log.push({ at: nowIso(), stage: stage.id, message: `完成，用时 ${stageRun.durationMs}ms` })
      }
      run.status = 'done'
    } catch (error) {
      run.status = signal.aborted ? 'cancelled' : 'failed'
      run.error = String(error && error.message ? error.message : error)
      for (const stage of STAGES) {
        const stageRun = this.active.stages[stage.id]
        if (stageRun.status === 'running') {
          stageRun.status = 'failed'
          stageRun.error = run.error
        }
      }
      run.log.push({ at: nowIso(), stage: null, message: `失败：${run.error}` })
    } finally {
      run.finishedAt = nowIso()
      run.durationMs = Date.now() - startedAt
      const state = await readState()
      const finished = { ...run, cases: undefined }
      delete finished.cases
      state.runs.unshift(finished)
      state.runs = state.runs.slice(0, MAX_RUNS)
      await writeState(state)
      this.lastRun = finished
      this.active = null
      this.progress = null
      this.controller = null
    }
  }

  async writeArtifacts(run, cases, report) {
    const dir = path.join(dataDir(), 'runs', run.id)
    await fsp.mkdir(dir, { recursive: true })
    const reportName = report.format === 'json' ? 'report.json' : 'report.md'
    await fsp.writeFile(path.join(dir, reportName), report.text, 'utf8')
    await fsp.writeFile(
      path.join(dir, 'rows.jsonl'),
      cases.map((item) => JSON.stringify(item)).join('\n') + '\n',
      'utf8',
    )
    run.artifacts = {
      dir,
      report: path.join(dir, reportName),
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
  async rerun(runId) {
    const state = await readState()
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw new Error(`找不到运行 ${runId}`)
    const file = run.artifacts && run.artifacts.cases
    if (!file) throw new Error('这次运行没有留下用例快照，不能重跑')
    const cases = JSON.parse(await fsp.readFile(file, 'utf8'))
    if (!Array.isArray(cases) || cases.length === 0) throw new Error('用例快照是空的')
    const stages = {}
    for (const stage of STAGES) {
      const saved = run.stages && run.stages[stage.id]
      if (saved && saved.template) stages[stage.id] = { template: saved.template, config: saved.config }
    }
    const result = await this.start({
      name: `${run.name}（重跑）`,
      templateId: run.templateId,
      cases,
      stages: Object.keys(stages).length > 0 ? stages : undefined,
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
