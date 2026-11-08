// Shared Nominatim bounded search for category POIs.
//
// Nominatim's public search endpoint supports a viewbox + bounded=1, which is
// enough to collect nearby restaurants/hotels without depending on Overpass
// (Overpass is frequently slow or unavailable behind some networks).
//
// Public Nominatim asks for at most one request per second; all category
// providers share this queue.

import { fetchJson } from '../../http.js'

const CACHE_TTL = 6 * 60 * 60 * 1000
const cache = new Map()
const inflight = new Map()
let searchQueue = Promise.resolve()
let lastSearchAt = 0

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s,，.。·'’"“”\-_/()（）]+/g, '')
}

async function requestSearch(term, viewbox, lang) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', term)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('viewbox', viewbox)
  url.searchParams.set('bounded', '1')
  url.searchParams.set('limit', '20')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('namedetails', '1')
  url.searchParams.set('extratags', '1')
  url.searchParams.set('accept-language', lang === 'zh' ? 'zh-CN,zh;q=0.9,en;q=0.7' : 'en-US,en;q=0.9,zh;q=0.5')
  return fetchJson(url, {
    accept: 'application/json',
    'user-agent': 'FootPrint-DSH/1.1.1 (local travel globe plugin)',
  }, 12000)
}

export async function searchNearby(term, place, radiusDegrees, lang = 'zh') {
  const lat = Number(place.lat)
  const lon = Number(place.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
  const viewbox = `${lon - radiusDegrees},${lat + radiusDegrees},${lon + radiusDegrees},${lat - radiusDegrees}`
  const key = `${term}|${lang}|${lat.toFixed(3)}|${lon.toFixed(3)}|${radiusDegrees}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value
  if (inflight.has(key)) return inflight.get(key)
  const task = searchQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastSearchAt))
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    try {
      return await requestSearch(term, viewbox, lang)
    } finally {
      lastSearchAt = Date.now()
    }
  })
  searchQueue = task.catch(() => {})
  const result = task
    .then((data) => {
      const value = Array.isArray(data) ? data : []
      cache.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, result)
  return result
}

export function osmAddress(result) {
  const address = result.address || {}
  return [
    address.road || address.pedestrian || address.footpath,
    address.house_number,
    address.city_district || address.suburb || address.neighbourhood,
  ]
    .filter(Boolean)
    .join(' ')
}

export function osmUrl(result) {
  const type = String(result.osm_type || '').toLowerCase()
  const id = result.osm_id
  return type && id ? `https://www.openstreetmap.org/${type}/${id}` : ''
}

export function normalizeOsmName(value) {
  return normalize(value)
}
