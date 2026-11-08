// Recommendation registry, organized by category and service.
//
//   providers/attraction/mafengwo.js
//   providers/food/mafengwo.js
//   providers/food/openstreetmap.js
//   providers/lodging/openstreetmap.js
//
// A provider declares both `category` and `service`. The client groups its
// sections by category; each section carries the service label. Add a new
// service by implementing the contract below in that category directory and
// registering it here (or calling registerProvider from another Host plugin).

import { mafengwoAttractionProvider } from './attraction/mafengwo.js'
import { mafengwoFoodProvider } from './food/mafengwo.js'
import { openstreetmapFoodProvider } from './food/openstreetmap.js'
import { openstreetmapLodgingProvider } from './lodging/openstreetmap.js'

export const CATEGORIES = ['attraction', 'food', 'lodging']

const PROVIDERS = [
  mafengwoAttractionProvider,
  mafengwoFoodProvider,
  openstreetmapFoodProvider,
  openstreetmapLodgingProvider,
]

function isValidProvider(provider) {
  return (
    provider &&
    typeof provider.key === 'string' &&
    typeof provider.service === 'string' &&
    CATEGORIES.includes(provider.category) &&
    typeof provider.recommend === 'function' &&
    typeof provider.label === 'object'
  )
}

/** Register a provider at runtime. Returns an idempotent disposer. */
export function registerProvider(provider) {
  if (!isValidProvider(provider)) throw new Error('Invalid recommendation provider')
  if (!PROVIDERS.some((item) => item.key === provider.key)) {
    PROVIDERS.push(provider)
    PROVIDERS.sort((a, b) => (a.priority || 0) - (b.priority || 0))
  }
  return () => {
    const index = PROVIDERS.findIndex((item) => item.key === provider.key)
    if (index >= 0) PROVIDERS.splice(index, 1)
  }
}

/** Provider directory grouped by category, for diagnostics / a future UI. */
export function listProviders() {
  const grouped = Object.fromEntries(CATEGORIES.map((category) => [category, []]))
  for (const provider of PROVIDERS) {
    grouped[provider.category].push({
      key: provider.key,
      service: provider.service,
      category: provider.category,
      label: provider.label,
      priority: provider.priority || 0,
      timeoutMs: provider.timeoutMs || 9000,
    })
  }
  return grouped
}

function withTimeout(promise, timeoutMs) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Recommendation provider timed out')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Collect recommendation sections for one place, grouped by category.
 * Provider failures are isolated; the place keeps its Wikipedia/guide content.
 */
export async function getRecommendations(place, lang = 'zh') {
  const grouped = Object.fromEntries(CATEGORIES.map((category) => [category, []]))
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return grouped

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
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return
    const section = result.value
    if (!section || !Array.isArray(section.items) || !section.items.length) return
    const category = active[index].category
    if (!grouped[category]) grouped[category] = []
    grouped[category].push({
      ...section,
      category,
      service: section.service || active[index].service,
      serviceLabel:
        section.serviceLabel ||
        active[index].label?.[lang] ||
        active[index].label?.zh ||
        active[index].service,
    })
  })
  return grouped
}
