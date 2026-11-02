#!/usr/bin/env node
/**
 * Offline analyzer for dsh-perf-profiler JSONL logs.
 *
 * Usage:
 *   node scripts/analyze.mjs [--file <path>] [--dir <path>] [--top 20] [--kind hook|tool] [--json]
 *
 * With no `--file`, the newest `perf-*.jsonl` under
 * `$DSH_HOME/logs/dsh-perf-profiler` (default `~/.dsh/...`) is analyzed.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)

/** @returns the value after `flag`, or undefined. */
function option(flag) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

const top = Number.parseInt(option('--top') ?? '20', 10)
const kindFilter = option('--kind')
const asJson = argv.includes('--json')

const dir = option('--dir') ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'logs', 'dsh-perf-profiler')
const file = option('--file') ?? (await newestLog(dir))

if (file === undefined) {
  console.error(`no perf-*.jsonl found under ${dir}`)
  process.exit(1)
}

const samples = await load(file)
if (samples.length === 0) {
  console.error(`no usable samples in ${file}`)
  process.exit(1)
}

const filtered = kindFilter === undefined ? samples : samples.filter((sample) => sample.kind === kindFilter)

if (asJson) {
  console.log(JSON.stringify(summarize(filtered), null, 2))
} else {
  print(summarize(filtered))
}

/**
 * @param {string} directory - log directory.
 * @returns the most recently modified perf log, if any.
 */
async function newestLog(directory) {
  let entries
  try {
    entries = await readdir(directory)
  } catch {
    return undefined
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.startsWith('perf-') || !entry.endsWith('.jsonl')) continue
    const path = join(directory, entry)
    candidates.push({ path, mtime: (await stat(path)).mtimeMs })
  }
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.path
}

/**
 * @param {string} path - JSONL path.
 * @returns parsed samples, malformed lines skipped.
 */
async function load(path) {
  const text = await readFile(path, 'utf8')
  const out = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const sample = JSON.parse(line)
      if (typeof sample?.exclusiveMs === 'number' && typeof sample?.target === 'string') out.push(sample)
    } catch {
      // Ignore a torn final line from a process that exited mid-write.
    }
  }
  return out
}

/**
 * @param {object[]} list - samples.
 * @returns aggregates and rollups.
 */
function summarize(list) {
  const keyed = new Map()
  const byPlugin = new Map()
  const byTarget = new Map()

  for (const sample of list) {
    const key = `${sample.kind}\u0000${sample.plugin}\u0000${sample.target}\u0000${sample.fn ?? ''}`
    accumulate(keyed, key, sample, { kind: sample.kind, plugin: sample.plugin, target: sample.target, fn: sample.fn })
    accumulate(byPlugin, sample.plugin, sample, { plugin: sample.plugin })
    accumulate(byTarget, `${sample.kind}\u0000${sample.target}`, sample, { kind: sample.kind, target: sample.target })
  }

  return {
    file,
    samples: list.length,
    from: new Date(Math.min(...list.map((sample) => sample.ts))).toISOString(),
    to: new Date(Math.max(...list.map((sample) => sample.ts))).toISOString(),
    totalExclusiveMs: round(list.reduce((sum, sample) => sum + sample.exclusiveMs, 0)),
    rows: sortRows(keyed).slice(0, top),
    plugins: sortRows(byPlugin).slice(0, top),
    targets: sortRows(byTarget).slice(0, top),
    slowest: [...list].sort((a, b) => b.exclusiveMs - a.exclusiveMs).slice(0, top),
  }
}

/**
 * @param {Map<string, object>} map - aggregate map.
 * @param {string} key - group key.
 * @param {object} sample - one sample.
 * @param {object} label - fields carried into the aggregate.
 */
function accumulate(map, key, sample, label) {
  let row = map.get(key)
  if (row === undefined) {
    row = { ...label, count: 0, exclusiveMs: 0, inclusiveMs: 0, maxExclusiveMs: 0, durations: [] }
    map.set(key, row)
  }
  row.count += 1
  row.exclusiveMs += sample.exclusiveMs
  row.inclusiveMs += sample.inclusiveMs ?? sample.exclusiveMs
  row.maxExclusiveMs = Math.max(row.maxExclusiveMs, sample.exclusiveMs)
  row.durations.push(sample.exclusiveMs)
}

/**
 * @param {Map<string, object>} map - aggregate map.
 * @returns rows sorted by total exclusive time.
 */
function sortRows(map) {
  return [...map.values()]
    .sort((a, b) => b.exclusiveMs - a.exclusiveMs)
    .map((row) => ({ ...row, percentile95: percentile(row.durations, 0.95), durations: undefined }))
}

/**
 * @param {number[]} values - durations.
 * @param {number} fraction - 0..1.
 * @returns nearest-rank percentile.
 */
function percentile(values, fraction) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
}

/** @param {number} value - ms. @returns rounded ms. */
function round(value) {
  return Math.round(value * 1000) / 1000
}

/** @param {object} summary - analyzer output. @returns void. */
function print(summary) {
  console.log(`file:     ${summary.file}`)
  console.log(`samples:  ${summary.samples}`)
  console.log(`range:    ${summary.from} → ${summary.to}`)
  console.log(`total:    ${summary.totalExclusiveMs} ms exclusive`)
  console.log()

  section('慢在哪（plugin × hook/tool）', summary.rows, ['kind', 'plugin', 'target', 'fn', 'count', 'exclusiveMs', 'maxExclusiveMs', 'percentile95'])
  section('按插件汇总', summary.plugins, ['plugin', 'count', 'exclusiveMs', 'maxExclusiveMs', 'percentile95'])
  section('按 hook / 工具汇总', summary.targets, ['kind', 'target', 'count', 'exclusiveMs', 'maxExclusiveMs', 'percentile95'])
  section('最慢的单次调用', summary.slowest.map((sample) => ({
    time: new Date(sample.ts).toISOString().slice(11, 23),
    kind: sample.kind,
    plugin: sample.plugin,
    target: sample.target,
    exclusiveMs: round(sample.exclusiveMs),
    turn: sample.turn,
    step: sample.step,
    callId: sample.callId,
  })), ['time', 'kind', 'plugin', 'target', 'exclusiveMs', 'turn', 'step', 'callId'])
}

/**
 * @param {string} title - heading.
 * @param {object[]} rows - rows.
 * @param {string[]} columns - columns to print.
 */
function section(title, rows, columns) {
  console.log(`## ${title}`)
  if (rows.length === 0) {
    console.log('(none)\n')
    return
  }
  const table = rows.map((row) => columns.map((column) => format(row[column])))
  const widths = columns.map((column, index) => Math.max(
    column.length,
    ...table.map((cells) => cells[index].length),
  ))
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd()
  console.log(line(columns))
  console.log(line(widths.map((width) => '-'.repeat(width))))
  for (const cells of table) console.log(line(cells))
  console.log()
}

/** @param {unknown} value - cell value. @returns string. */
function format(value) {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return String(value)
}
