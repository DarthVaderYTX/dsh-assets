// Social content provider registry.
//
// Adding another source (Ctrip, Xiaohongshu, an official API, ...) means:
//   1. implement { id, label, priority, supports, recommend } in a module,
//   2. import it here and put it in PROVIDERS (or call registerProvider at
//      startup from another host plugin).
//
// The first provider that supports a place contributes one section. Multiple
// providers may contribute sections; the client renders every section and
// falls back to the existing Wikipedia / built-in attractions if none answer.

import { mafengwoProvider } from './mafengwo.js'

const PROVIDERS = [mafengwoProvider]

function isValidProvider(provider) {
  return (
    provider &&
    typeof provider.id === 'string' &&
    typeof provider.recommend === 'function' &&
    typeof provider.label === 'object'
  )
}

/** Register a social provider at runtime. Returns an idempotent disposer. */
export function registerProvider(provider) {
  if (!isValidProvider(provider)) throw new Error('Invalid social provider')
  if (!PROVIDERS.some((item) => item.id === provider.id)) {
    PROVIDERS.push(provider)
    PROVIDERS.sort((a, b) => (a.priority || 0) - (b.priority || 0))
  }
  return () => {
    const index = PROVIDERS.findIndex((item) => item.id === provider.id)
    if (index >= 0) PROVIDERS.splice(index, 1)
  }
}

/** Metadata for the Plugin Manager diagnostics / future Settings UI. */
export function listProviders() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    priority: provider.priority || 0,
    timeoutMs: provider.timeoutMs || 9000,
  }))
}

function withTimeout(promise, timeoutMs) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Social provider timed out')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Collect social recommendation sections for a place.
 *
 * A provider failure is isolated: the place keeps its Wikipedia/guide content.
 * Providers run in parallel so a future second source does not add latency.
 */
export async function getSocialRecommendations(place, lang = 'zh') {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return []
  const active = PROVIDERS.filter((provider) => {
    try {
      return provider.supports ? provider.supports(place, lang) : true
    } catch {
      return false
    }
  })
  const settled = await Promise.allSettled(
    active.map((provider) =>
      withTimeout(
        Promise.resolve().then(() => provider.recommend(place, lang)),
        provider.timeoutMs || 9000,
      ),
    ),
  )
  const sections = []
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const section = result.value
    if (section && Array.isArray(section.items) && section.items.length > 0) {
      sections.push(section)
    }
  }
  return sections
}
