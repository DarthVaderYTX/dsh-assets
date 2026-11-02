/**
 * dsh-perf-profiler — attribute hook-listener and tool-body wall time to the
 * plugin that owns it, without modifying the harness.
 *
 * Three interception points, all public Cordis surface:
 *
 * 1. `internal/listener` — every later `ctx.on()` registration passes through
 *    here; returning a disposer replaces the registration, so a wrapped
 *    listener is stored in its place.
 * 2. `EventsService.unregister` — the disposer closes over the *original*
 *    callback, so the mapping original→wrapped must be honoured for a plugin
 *    unload to actually remove our wrapper (otherwise the hook leaks).
 * 3. `ToolRuntime.register` — inside a service method `this.ctx` is the
 *    *calling* context, so the registering plugin is readable at registration
 *    time. Tool definitions carry no owner field; this is how ownership is
 *    recovered for tools registered after this plugin mounted.
 *
 * Samples are aggregated in memory for live reporting (`perf_report`,
 * `perf_tail`, `/perf`) and optionally appended as JSONL for post-hoc
 * analysis (`scripts/analyze.mjs`).
 *
 * @module dsh-perf-profiler
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-perf-profiler'

/** Cordis events whose last argument is the `next` continuation. */
const DEFAULT_WATERFALL = [
  'agent/pre-step',
  'agent/request',
  'agent/request-error',
  'approval/request',
  'fs/edit-intent',
  'fs/write-intent',
  'session-telemetry/record',
  'system-prompt/assemble',
  'tools/code-dispatch-log',
  'tools/execute',
  'tools/post-execute',
  'tools/pre-execute',
]

/**
 * Events profiled by default. `llm/stream` and `session/event` are deliberately
 * excluded: they fire per token or per event, and wrapping them costs more than
 * the measurement is worth. Opt in with `includeAllEvents` or `events`.
 */
const DEFAULT_EVENTS = [
  'agent/pre-step',
  'agent/request',
  'agent/request-error',
  'approval/request',
  'fs/edit-intent',
  'fs/write-intent',
  'system-prompt/assemble',
  'tools/pre-execute',
  'tools/execute',
  'tools/post-execute',
  'tools/result',
]

const DEFAULTS = {
  /** Master switch; false installs nothing. */
  enabled: true,
  /** Append samples to a JSONL file for offline analysis. */
  log: true,
  /** Log directory; defaults to `<dshHome>/logs/dsh-perf-profiler`. */
  logDir: undefined,
  /** Only samples at or above this inclusive duration reach the log file (ms). */
  logMinMs: 1,
  /** Emit a console warning for samples at or above this exclusive duration (ms). */
  slowMs: 50,
  /** Recent raw samples kept in memory for `perf_tail` and p95 estimates. */
  ringSize: 2000,
  /** Wrap every event instead of {@link DEFAULT_EVENTS}. */
  includeAllEvents: false,
  /** Extra event names to profile. */
  events: [],
  /** Extra event names whose last argument is a `next` continuation. */
  waterfallEvents: [],
  /** Fraction of samples to keep, in (0, 1]. */
  sampleRate: 1,
  /** Manual `{ toolName: pluginName }` map for tools registered before this plugin. */
  toolOwners: {},
}

const MISSING = '-'

/** Aggregated timing for one (kind, plugin, target, function) key. */
class Row {
  constructor() {
    this.count = 0
    this.exclusiveMs = 0
    this.inclusiveMs = 0
    this.maxExclusiveMs = 0
    this.minExclusiveMs = Infinity
  }

  add(inclusiveMs, exclusiveMs) {
    this.count += 1
    this.inclusiveMs += inclusiveMs
    this.exclusiveMs += exclusiveMs
    if (exclusiveMs > this.maxExclusiveMs) this.maxExclusiveMs = exclusiveMs
    if (exclusiveMs < this.minExclusiveMs) this.minExclusiveMs = exclusiveMs
  }
}

/**
 * Install profiling. Every registration below is an effect, so unloading this
 * plugin removes its listeners; the two monkey patches are restored explicitly.
 * @param ctx - this plugin's context.
 * @param config - user configuration merged over {@link DEFAULTS}.
 */
export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...config }
  if (settings.enabled === false) return

  const state = {
    settings,
    ctx,
    rows: new Map(),
    ring: [],
    ringIndex: 0,
    toolOwners: new Map(),
    timedBody: new WeakMap(),
    wrappedOf: new WeakMap(),
    originalOf: new WeakMap(),
    stepByAgent: new Map(),
    reentrant: false,
    counters: { samples: 0, logged: 0, dropped: 0, warnings: 0 },
    pending: [],
    flushScheduled: false,
    logPath: undefined,
    logReady: false,
  }

  const events = ctx.events
  if (!events) {
    ctx.logger?.warn?.('[perf-profiler] no event bus; nothing installed')
    return
  }

  const profiled = new Set(settings.includeAllEvents ? [] : DEFAULT_EVENTS)
  for (const extra of settings.events) profiled.add(extra)
  const waterfall = new Set([...DEFAULT_WATERFALL, ...settings.waterfallEvents])

  installLog(state)
  const restoreUnregister = patchUnregister(state, events)
  wrapExistingHooks(state, events, profiled, waterfall)
  const stopIntercept = interceptFuture(state, profiled, waterfall)
  const restoreTools = patchToolRegistry(state)

  ctx.effect(() => () => {
    stopIntercept()
    restoreUnregister()
    restoreTools()
    unwrapAll(state, events)
    flushLog(state, true)
  })

  registerSurfaces(state)
}

/* ------------------------------------------------------------------ install */

/**
 * Wrap listeners that registered before this plugin mounted. The loader applies
 * patches in order, so most harness plugins are already listening by now.
 * @param state - profiler state.
 * @param events - process-wide event bus.
 * @param profiled - event names to wrap.
 * @param waterfall - event names whose trailing argument is `next`.
 */
function wrapExistingHooks(state, events, profiled, waterfall) {
  for (const eventName of Object.keys(events._hooks ?? {})) {
    if (eventName.startsWith('internal/')) continue
    if (!profiled.has(eventName)) continue
    const hooks = events._hooks[eventName]
    if (!Array.isArray(hooks)) continue
    for (const hook of [...hooks]) {
      if (hook.ctx?.fiber === state.ctx.fiber) continue
      if (hook.ctx?.fiber?.name === name) continue
      wrapStoredHook(state, hook, eventName, waterfall)
    }
  }
}

/**
 * Replace one stored hook callback in place, remembering the original so
 * disposal and uninstall can find it again.
 * @param state - profiler state.
 * @param hook - stored listener record.
 * @param eventName - bus event name.
 * @param waterfall - event names whose trailing argument is `next`.
 */
function wrapStoredHook(state, hook, eventName, waterfall) {
  const original = hook.callback
  if (typeof original !== 'function' || state.wrappedOf.has(original)) return
  const wrapped = makeWrapper(state, hook.ctx, eventName, original, waterfall)
  hook.callback = wrapped
  state.wrappedOf.set(original, wrapped)
  state.originalOf.set(wrapped, original)
}

/**
 * Intercept later `ctx.on()` registrations.
 *
 * `ctx.on` reflect-binds the listener before this event fires, so identity
 * comparison cannot break the recursion: a reentrancy flag is used instead.
 * @param state - profiler state.
 * @param profiled - event names to wrap.
 * @param waterfall - event names whose trailing argument is `next`.
 * @returns teardown that removes the interceptor.
 */
function interceptFuture(state, profiled, waterfall) {
  const dispose = state.ctx.on('internal/listener', function (eventName, listener, options) {
    if (state.reentrant) return
    if (typeof eventName !== 'string' || eventName.startsWith('internal/')) return
    if (typeof listener !== 'function') return
    if (!profiled.has(eventName)) return
    if (this?.fiber === state.ctx.fiber || this?.fiber?.name === name) return
    const wrapped = makeWrapper(state, this, eventName, listener, waterfall)
    state.wrappedOf.set(listener, wrapped)
    state.originalOf.set(wrapped, listener)
    state.reentrant = true
    try {
      return this.on(eventName, wrapped, options)
    } finally {
      state.reentrant = false
    }
  }, { prepend: true, global: true })
  return typeof dispose === 'function' ? dispose : () => {}
}

/**
 * Time one listener invocation.
 *
 * For waterfall events the trailing `next` is wrapped so exclusive time is the
 * listener body minus downstream work; inclusive time is the whole body.
 * @param state - profiler state.
 * @param listenerCtx - context that owns the listener (carries the plugin name).
 * @param eventName - bus event name.
 * @param listener - original callback.
 * @param waterfall - event names whose trailing argument is `next`.
 * @returns the stored wrapper.
 */
function makeWrapper(state, listenerCtx, eventName, listener, waterfall) {
  const plugin = listenerCtx?.fiber?.name ?? '(root)'
  const fnName = functionName(listener)
  const isWaterfall = waterfall.has(eventName)

  return function profiledListener(...args) {
    let nextMs = 0
    if (isWaterfall) {
      const next = args[args.length - 1]
      if (typeof next === 'function') {
        args[args.length - 1] = function profiledNext(...nextArgs) {
          const started = performance.now()
          const finish = () => { nextMs += performance.now() - started }
          try {
            const result = next.apply(this, nextArgs)
            if (isThenable(result)) return Promise.resolve(result).finally(finish)
            finish()
            return result
          } catch (error) {
            finish()
            throw error
          }
        }
      }
    }

    const context = extractContext(state, eventName, args)
    const started = performance.now()
    const finish = () => {
      record(state, 'hook', plugin, eventName, fnName, performance.now() - started, nextMs, context)
    }
    try {
      const result = listener.apply(this, args)
      if (isThenable(result)) return Promise.resolve(result).finally(finish)
      finish()
      return result
    } catch (error) {
      finish()
      throw error
    }
  }
}

/**
 * Restore every wrapped callback so a later hook scan sees original functions.
 * @param state - profiler state.
 * @param events - process-wide event bus.
 */
function unwrapAll(state, events) {
  for (const eventName of Object.keys(events._hooks ?? {})) {
    const hooks = events._hooks[eventName]
    if (!Array.isArray(hooks)) continue
    for (const hook of hooks) {
      const original = state.originalOf.get(hook.callback)
      if (original !== undefined) hook.callback = original
    }
  }
}

/**
 * Teach `unregister` about wrapped callbacks.
 *
 * The disposer returned by `ctx.on` closes over the original callback, so
 * without this mapping a wrapped hook would survive its owner's unload.
 * @param state - profiler state.
 * @param events - process-wide event bus.
 * @returns teardown restoring the original method.
 */
function patchUnregister(state, events) {
  const original = events.unregister
  if (typeof original !== 'function') return () => {}
  const patched = function (eventName, callback) {
    const wrapped = state.wrappedOf.get(callback)
    if (wrapped !== undefined && original.call(this, eventName, wrapped)) return true
    return original.call(this, eventName, callback)
  }
  events.unregister = patched
  return () => {
    if (events.unregister === patched) events.unregister = original
  }
}

/**
 * Learn tool ownership and time tool bodies.
 *
 * `ToolDefinition` has no owner field, but inside a service method `this.ctx` is
 * the caller's context, so `this.ctx.fiber.name` identifies the registering
 * plugin. `executable()` is the per-call resolution point, so wrapping the
 * definition it returns measures the tool body alone — plugin hooks on
 * `tools/execute` are accounted separately as hooks.
 *
 * Tools registered before this plugin mounted cannot be attributed this way;
 * list them in `toolOwners` to fill the gap.
 * @param state - profiler state.
 * @returns teardown restoring the original methods.
 */
function patchToolRegistry(state) {
  const tools = state.ctx.get?.('tools') ?? state.ctx.tools
  if (!tools) return () => {}

  for (const [toolName, owner] of Object.entries(state.settings.toolOwners ?? {})) {
    if (typeof toolName === 'string' && typeof owner === 'string') state.toolOwners.set(toolName, owner)
  }

  const restores = []
  if (typeof tools.register === 'function') {
    const original = tools.register
    const patched = function (definition, options) {
      const owner = this?.ctx?.fiber?.name
      const toolName = definition?.name
      if (typeof toolName === 'string' && typeof owner === 'string' && owner !== name) {
        state.toolOwners.set(toolName, owner)
      }
      return original.call(this, definition, options)
    }
    tools.register = patched
    restores.push(() => {
      if (tools.register === patched) tools.register = original
    })
  }

  if (typeof tools.executable === 'function') {
    const original = tools.executable
    const patched = function (toolName, scope, toolSet) {
      const definition = original.call(this, toolName, scope, toolSet)
      if (definition === undefined || definition === null) return definition
      return withTimedBody(state, definition)
    }
    tools.executable = patched
    restores.push(() => {
      if (tools.executable === patched) tools.executable = original
    })
  }

  return () => {
    for (const restore of restores) restore()
  }
}

/**
 * Return a shallow copy of a tool definition whose `execute` is timed.
 *
 * The wrapper is memoised per definition so repeated calls cost one spread.
 * @param state - profiler state.
 * @param definition - resolved definition.
 * @returns definition carrying a timed `execute`.
 */
function withTimedBody(state, definition) {
  const cached = state.timedBody.get(definition)
  if (cached !== undefined) return { ...definition, execute: cached }
  const inner = definition.execute
  if (typeof inner !== 'function') return definition
  const toolName = definition.name
  const timed = async function timedExecute(args, exec) {
    const started = performance.now()
    try {
      return await inner.call(this, args, exec)
    } finally {
      const owner = state.toolOwners.get(toolName) ?? '(unknown)'
      const context = extractContext(state, 'tools/execute', [exec ?? {}])
      record(state, 'tool', owner, toolName, `execute:${toolName}`, performance.now() - started, 0, context)
    }
  }
  state.timedBody.set(definition, timed)
  return { ...definition, execute: timed }
}

/* ------------------------------------------------------------------- record */

/**
 * Accumulate one sample, keep it in the ring, and queue it for the log.
 * @param state - profiler state.
 * @param kind - `hook` or `tool`.
 * @param plugin - owning plugin display name.
 * @param target - event name or tool name.
 * @param fnName - listener function name, or the call label for tools.
 * @param inclusiveMs - full wall time.
 * @param nextMs - time spent downstream (waterfall only).
 * @param context - correlation ids for this invocation.
 */
function record(state, kind, plugin, target, fnName, inclusiveMs, nextMs, context) {
  const settings = state.settings
  const exclusiveMs = Math.max(0, inclusiveMs - nextMs)

  state.counters.samples += 1
  if (settings.sampleRate < 1 && Math.random() > settings.sampleRate) return

  const key = `${kind}\u0000${plugin}\u0000${target}\u0000${fnName}`
  let row = state.rows.get(key)
  if (row === undefined) {
    row = new Row()
    state.rows.set(key, row)
  }
  row.add(inclusiveMs, exclusiveMs)

  const sample = { ts: Date.now(), kind, plugin, target, fn: fnName, inclusiveMs, exclusiveMs, ...context }
  pushRing(state, sample)

  if (settings.log && inclusiveMs >= settings.logMinMs) enqueueLog(state, sample)

  if (exclusiveMs >= settings.slowMs) {
    state.counters.warnings += 1
    console.warn(
      `[perf-profiler] slow ${kind}: ${plugin} · ${target}${fnName === target ? '' : ` · ${fnName}`}`
      + ` ${exclusiveMs.toFixed(1)}ms (inclusive ${inclusiveMs.toFixed(1)}ms)`,
    )
  }
}

/**
 * Store a sample in the bounded recent-sample ring.
 * @param state - profiler state.
 * @param sample - one timing sample.
 */
function pushRing(state, sample) {
  const size = Math.max(1, state.settings.ringSize)
  if (state.ring.length < size) {
    state.ring.push(sample)
    state.ringIndex = state.ring.length % size
    return
  }
  state.ring[state.ringIndex] = sample
  state.ringIndex = (state.ringIndex + 1) % size
}

/**
 * Pull session / agent / turn / step / callId out of whatever the payload offers.
 *
 * `ToolExecution` carries `callId` and `agent` but no turn/step, so a per-agent
 * step map is maintained from the events that do carry them.
 * @param state - profiler state.
 * @param eventName - bus event name.
 * @param args - listener arguments.
 * @returns correlation ids, missing values as `-`.
 */
function extractContext(state, eventName, args) {
  const context = { session: MISSING, agent: MISSING, turn: MISSING, step: MISSING, callId: MISSING }
  const first = args[0]
  if (first === undefined || first === null) return context

  const exec = first
  if (typeof exec === 'object' && 'callId' in exec) {
    context.callId = String(exec.callId)
    const agent = readAgent(exec.agent)
    if (agent !== undefined) {
      context.agent = agent.id
      context.session = agent.id
      const step = state.stepByAgent.get(agent.id)
      if (step !== undefined) {
        context.turn = String(step.turn)
        context.step = String(step.step)
      }
    }
    return context
  }

  if (eventName === 'agent/pre-step' || eventName === 'agent/request' || eventName === 'agent/request-error') {
    const payload = first
    const agent = readAgent(payload?.agent ?? payload)
    if (agent !== undefined) {
      context.agent = agent.id
      context.session = agent.id
      rememberStep(state, agent.id, payload?.turn, payload?.step)
      const step = state.stepByAgent.get(agent.id)
      if (step !== undefined) {
        context.turn = String(step.turn)
        context.step = String(step.step)
      }
    }
  }
  return context
}

/**
 * Extract a stable id pair from an agent-like value.
 * @param value - candidate agent or payload.
 * @returns ids, or undefined when the value is not agent-shaped.
 */
function readAgent(value) {
  if (value === null || typeof value !== 'object') return undefined
  const id = value.id ?? value.sessionId ?? value.agentId
  if (id === undefined || id === null) return undefined
  return { id: String(id) }
}

/**
 * Remember the latest turn/step observed for an agent.
 * @param state - profiler state.
 * @param agentId - agent/session id.
 * @param turn - turn number, when known.
 * @param step - step number, when known.
 */
function rememberStep(state, agentId, turn, step) {
  const previous = state.stepByAgent.get(agentId)
  const next = {
    turn: Number.isFinite(turn) ? turn : previous?.turn,
    step: Number.isFinite(step) ? step : previous?.step,
  }
  if (next.turn === undefined || next.step === undefined) return
  state.stepByAgent.set(agentId, next)
}

/* ---------------------------------------------------------------------- log */

/**
 * Prepare the append-only JSONL sink.
 * @param state - profiler state.
 */
function installLog(state) {
  if (!state.settings.log) return
  const base = state.settings.logDir ?? join(resolveDshHome(), 'logs', 'dsh-perf-profiler')
  const day = new Date().toISOString().slice(0, 10)
  state.logPath = join(base, `perf-${day}.jsonl`)
  mkdir(base, { recursive: true }).then(
    () => {
      state.logReady = true
      state.ctx.logger?.info?.(`[perf-profiler] appending samples to ${state.logPath}`)
    },
    (error) => {
      state.logPath = undefined
      state.ctx.logger?.warn?.(`[perf-profiler] cannot create ${base}: ${String(error)}`)
    },
  )
}

/**
 * Queue one sample for the background writer.
 * @param state - profiler state.
 * @param sample - one timing sample.
 */
function enqueueLog(state, sample) {
  if (state.pending.length >= 10_000) {
    state.counters.dropped += 1
    return
  }
  state.pending.push(sample)
  state.counters.logged += 1
  if (state.flushScheduled) return
  state.flushScheduled = true
  const timer = setTimeout(() => {
    state.flushScheduled = false
    void flushLog(state, false)
  }, 250)
  timer.unref?.()
}

/**
 * Write queued samples, optionally awaiting the result.
 * @param state - profiler state.
 * @param drain - whether to keep writing until the queue is empty.
 */
async function flushLog(state, drain) {
  if (!state.logReady || state.logPath === undefined || state.pending.length === 0) {
    if (drain) state.pending.length = 0
    return
  }
  const batch = state.pending.splice(0, state.pending.length)
  const text = `${batch.map((sample) => JSON.stringify(sample)).join('\n')}\n`
  try {
    await appendFile(state.logPath, text, 'utf8')
  } catch (error) {
    state.counters.dropped += batch.length
    state.ctx.logger?.warn?.(`[perf-profiler] log write failed: ${String(error)}`)
  }
  if (drain && state.pending.length > 0) await flushLog(state, true)
}

/* ------------------------------------------------------------------ surfaces */

/**
 * Register the model-facing tools and the `/perf` slash command.
 * @param state - profiler state.
 */
function registerSurfaces(state) {
  state.ctx.inject?.(['tools'], (toolsCtx) => {
    toolsCtx.tools.register(toolDefinition('perf_report', REPORT_SCHEMA, REPORT_DESCRIPTION, (args) => report(state, args)))
    toolsCtx.tools.register(toolDefinition('perf_tail', TAIL_SCHEMA, TAIL_DESCRIPTION, (args) => tail(state, args)))
  })

  state.ctx.inject?.(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'perf',
      description: 'Show plugin/hook/tool timing. Usage: /perf [report|tail [n]|reset|status]',
      input: { hint: '[report|tail [n]|reset|status]' },
      handler: ({ rawInput }) => {
        const [verb = 'report', arg] = String(rawInput ?? '').trim().split(/\s+/)
        if (verb === 'reset') {
          resetStats(state)
          return { kind: 'success', text: 'perf-profiler: counters cleared' }
        }
        if (verb === 'status') return { kind: 'success', text: statusText(state) }
        if (verb === 'tail') {
          const limit = Number.parseInt(arg ?? '20', 10)
          return { kind: 'success', text: tail(state, { limit: Number.isFinite(limit) ? limit : 20 }) }
        }
        return { kind: 'success', text: report(state, {}) }
      },
    })
  })
}

const REPORT_SCHEMA = {
  kind: { type: 'string', enum: ['all', 'hook', 'tool'], description: 'Which samples to include.' },
  top: { type: 'number', description: 'Rows to show, default 20.' },
  reset: { type: 'boolean', description: 'Clear counters after formatting.' },
}

const REPORT_DESCRIPTION = 'Show accumulated plugin/hook/tool execution time grouped by plugin, hook point, and tool.'

const TAIL_SCHEMA = {
  limit: { type: 'number', description: 'Samples to show, default 20.' },
  kind: { type: 'string', enum: ['all', 'hook', 'tool'], description: 'Filter by kind.' },
  minMs: { type: 'number', description: 'Only samples at or above this inclusive duration.' },
  plugin: { type: 'string', description: 'Only samples from this plugin.' },
}

const TAIL_DESCRIPTION = 'Show the most recent individual hook/tool samples with session, turn, step, and callId.'

/**
 * Build a tool definition without importing `@deepseek-ai/dsh-tools`.
 * @param toolName - tool name.
 * @param parameters - parameter schema spec.
 * @param description - model-facing description.
 * @param run - implementation returning the text result.
 * @returns a plain tool definition accepted by `ctx.tools.register`.
 */
function toolDefinition(toolName, parameters, description, run) {
  return {
    name: toolName,
    description,
    parameters,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return run(args ?? {})
    },
  }
}

/* ------------------------------------------------------------------- reports */

/**
 * Format aggregated timings.
 * @param state - profiler state.
 * @param args - `kind`, `top`, `reset`.
 * @returns the report text.
 */
function report(state, args) {
  const kind = args.kind ?? 'all'
  const top = Number.isFinite(args.top) ? Math.max(1, args.top) : 20
  const rows = []
  for (const [key, row] of state.rows) {
    const [rowKind, plugin, target, fnName] = key.split('\u0000')
    if (kind !== 'all' && rowKind !== kind) continue
    rows.push({ kind: rowKind, plugin, target, fnName, row })
  }
  rows.sort((a, b) => b.row.exclusiveMs - a.row.exclusiveMs)

  const shown = rows.slice(0, top)
  const lines = [
    `perf-profiler · samples=${state.counters.samples} logged=${state.counters.logged}`
    + ` dropped=${state.counters.dropped} warnings=${state.counters.warnings}`,
    state.logPath === undefined ? '' : `log: ${state.logPath}`,
    '',
  ].filter((line, index) => line !== '' || index === 2)

  if (shown.length === 0) {
    lines.push('no samples yet')
  } else {
    const header = ['kind', 'plugin', 'hook/tool', 'fn', 'n', 'total', 'avg', 'p95', 'max']
    const body = shown.map((entry) => {
      const p95 = percentileFor(state, entry, 0.95)
      return [
        entry.kind,
        clip(entry.plugin, 22),
        clip(entry.target, 26),
        clip(entry.fnName === entry.target ? '' : entry.fnName, 22),
        String(entry.row.count),
        ms(entry.row.exclusiveMs),
        ms(entry.row.exclusiveMs / entry.row.count),
        ms(p95),
        ms(entry.row.maxExclusiveMs),
      ]
    })
    lines.push(formatTable(header, body))
    const rest = rows.length - shown.length
    if (rest > 0) lines.push(`… ${rest} more rows — raise \`top\` to see them`)
  }

  if (args.reset === true) resetStats(state)
  return lines.join('\n')
}

/**
 * Format the most recent individual samples.
 * @param state - profiler state.
 * @param args - `limit`, `kind`, `minMs`, `plugin`.
 * @returns the report text.
 */
function tail(state, args) {
  const limit = Number.isFinite(args.limit) ? Math.max(1, args.limit) : 20
  const kind = args.kind ?? 'all'
  const minMs = Number.isFinite(args.minMs) ? args.minMs : 0
  const plugin = args.plugin

  const selected = state.ring
    .filter((sample) => (kind === 'all' || sample.kind === kind)
      && sample.inclusiveMs >= minMs
      && (plugin === undefined || sample.plugin === plugin))
    .slice(-limit)

  if (selected.length === 0) return 'no matching samples in the recent ring'
  const header = ['time', 'kind', 'plugin', 'hook/tool', 'excl', 'incl', 'turn', 'step', 'callId']
  const body = selected.map((sample) => [
    new Date(sample.ts).toISOString().slice(11, 23),
    sample.kind,
    clip(sample.plugin, 20),
    clip(sample.target, 24),
    ms(sample.exclusiveMs),
    ms(sample.inclusiveMs),
    sample.turn,
    sample.step,
    clip(sample.callId, 16),
  ])
  return formatTable(header, body)
}

/**
 * Percentile of a row's recent samples, read from the ring.
 * @param state - profiler state.
 * @param entry - aggregated row.
 * @param fraction - 0..1.
 * @returns the percentile duration in ms.
 */
function percentileFor(state, entry, fraction) {
  const values = []
  for (const sample of state.ring) {
    if (sample.kind !== entry.kind || sample.plugin !== entry.plugin) continue
    if (sample.target !== entry.target) continue
    values.push(sample.exclusiveMs)
  }
  if (values.length === 0) return entry.row.maxExclusiveMs
  values.sort((a, b) => a - b)
  const index = Math.min(values.length - 1, Math.floor(fraction * values.length))
  return values[index]
}

/**
 * Short status line.
 * @param state - profiler state.
 * @returns the status text.
 */
function statusText(state) {
  const settings = state.settings
  return [
    `enabled: ${settings.enabled}`,
    `events: ${settings.includeAllEvents ? '(all)' : DEFAULT_EVENTS.join(', ')}`,
    `log: ${state.logPath ?? '(disabled)'} (min ${settings.logMinMs}ms)`,
    `slowMs: ${settings.slowMs}`,
    `ring: ${state.ring.length}/${settings.ringSize}`,
    `rows: ${state.rows.size}`,
    `tool owners known: ${state.toolOwners.size}`,
    `samples: ${state.counters.samples}`,
  ].join('\n')
}

/**
 * Clear aggregates, ring, and counters.
 * @param state - profiler state.
 */
function resetStats(state) {
  state.rows.clear()
  state.ring.length = 0
  state.ringIndex = 0
  state.counters = { samples: 0, logged: 0, dropped: 0, warnings: 0 }
}

/* -------------------------------------------------------------------- utils */

/**
 * Read DSH_HOME the way the harness resolves it.
 * @returns absolute home directory.
 */
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

/**
 * @param value - candidate.
 * @returns whether the value behaves like a promise.
 */
function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function'
}

/**
 * @param listener - callback.
 * @returns its name, or a compact source excerpt.
 */
function functionName(listener) {
  const declared = listener.name
  if (typeof declared === 'string' && declared.length > 0) return declared
  const source = Function.prototype.toString.call(listener).replace(/\s+/g, ' ').trim()
  return source.slice(0, 40)
}

/**
 * @param value - duration in ms.
 * @returns fixed-width rendering.
 */
function ms(value) {
  if (!Number.isFinite(value)) return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${value.toFixed(2)}ms`
}

/**
 * @param text - input.
 * @param width - maximum length.
 * @returns possibly-truncated text.
 */
function clip(text, width) {
  const value = String(text ?? '')
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`
}

/**
 * Render a left-aligned text table.
 * @param header - column titles.
 * @param body - rows of cells.
 * @returns the table text.
 */
function formatTable(header, body) {
  const widths = header.map((title, column) => Math.max(
    title.length,
    ...body.map((row) => String(row[column] ?? '').length),
  ))
  const line = (cells) => cells
    .map((cell, column) => String(cell ?? '').padEnd(widths[column]))
    .join('  ')
    .trimEnd()
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...body.map(line)].join('\n')
}
