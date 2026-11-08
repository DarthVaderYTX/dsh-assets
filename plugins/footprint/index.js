import { createReadStream } from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLACES,
  haversineKm,
  materializePlace,
  nearestCurated,
  searchCurated,
} from './data/places.js'
import { fetchJson as requestJson } from './http.js'
import { getSocialRecommendations, listProviders } from './providers/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VENDOR_ROOT = path.join(HERE, 'vendor', 'cesium')
const API_PREFIX = '/footprint-api'
const VENDOR_PREFIX = '/footprint-vendor'
const USER_AGENT = 'FootPrint-DSH/1.0 (local Cesium globe plugin)'
const SEARCH_TTL = 10 * 60 * 1000
const PLACE_TTL = 30 * 60 * 1000
const REVERSE_TTL = 24 * 60 * 60 * 1000

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const searchCache = new Map()
const placeCache = new Map()
const reverseCache = new Map()
const inflight = new Map()
let reverseQueue = Promise.resolve()
let lastReverseAt = 0

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function normalizeLang(value) {
  return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function acceptLanguage(lang) {
  return lang === 'zh'
    ? 'zh-CN,zh;q=0.9,en;q=0.7'
    : 'en-US,en;q=0.9,zh;q=0.5'
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s,，.。·'’"“”\-_/()（）]+/g, '')
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function truncate(value, max) {
  const text = cleanText(value)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastStop = Math.max(
    cut.lastIndexOf('。'),
    cut.lastIndexOf('！'),
    cut.lastIndexOf('？'),
    cut.lastIndexOf('. '),
    cut.lastIndexOf('; '),
  )
  return `${cut.slice(0, lastStop > max * 0.55 ? lastStop + 1 : max).trim()}…`
}

function round(value, digits = 5) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

async function getCached(cache, key, ttl, producer) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  if (inflight.has(key)) return inflight.get(key)
  const task = Promise.resolve()
    .then(producer)
    .then((value) => {
      cache.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, task)
  return task
}

async function fetchJson(url, lang, timeoutMs = 9000) {
  return requestJson(
    String(url),
    {
      accept: 'application/json',
      'accept-language': acceptLanguage(lang),
      'user-agent': USER_AGENT,
    },
    timeoutMs,
  )
}

function parseWikipediaTag(value) {
  const text = String(value || '')
  const index = text.indexOf(':')
  if (index <= 0) return null
  return { lang: text.slice(0, index), title: text.slice(index + 1) }
}

function toOsmCandidate(result, lang) {
  const address = result.address || {}
  const named = result.namedetails || {}
  const fallbackName = String(result.display_name || '').split(',')[0] || '未命名地点'
  const localName = named.name || named['name:zh'] || named['name:en'] || fallbackName
  const name =
    lang === 'zh'
      ? named['name:zh'] || named.name || fallbackName
      : named['name:en'] || named.name || fallbackName
  const wikipedia = result.extratags?.wikipedia || ''
  const osmType = String(result.osm_type || '').toLowerCase()
  const osmId = String(result.osm_id || '')
  return {
    id: osmId ? `osm:${osmType}:${osmId}` : `osm:place:${result.place_id}`,
    name,
    localName,
    displayName: cleanText(result.display_name) || name,
    country: address.country || '',
    countryCode: String(address.country_code || '').toUpperCase(),
    lat: Number(result.lat),
    lon: Number(result.lon),
    kind: result.addresstype || result.type || 'place',
    category: result.class || '',
    wikipedia,
    importance: Number(result.importance || 0),
    source: 'osm',
  }
}

function toPhotonCandidate(feature, lang) {
  const properties = feature.properties || {}
  const coords = feature.geometry?.coordinates || []
  const name = properties.name || properties.street || properties.city || '未命名地点'
  const parts = [name, properties.city, properties.state, properties.country].filter(
    (part, index, list) => part && list.indexOf(part) === index,
  )
  const osmType = String(properties.osm_type || '').toLowerCase()
  const osmId = String(properties.osm_id || '')
  return {
    id: osmId ? `osm:${osmType}:${osmId}` : `photon:${properties.osm_id || name}`,
    name,
    localName: properties.name || name,
    displayName: parts.join(', '),
    country: properties.country || '',
    countryCode: String(properties.countrycode || '').toUpperCase(),
    lat: Number(coords[1]),
    lon: Number(coords[0]),
    kind: properties.type || 'place',
    category: '',
    wikipedia: '',
    importance: 0,
    source: 'photon',
  }
}

async function searchRemote(query, lang) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('namedetails', '1')
  url.searchParams.set('extratags', '1')
  url.searchParams.set('limit', '8')
  url.searchParams.set('accept-language', acceptLanguage(lang))
  const data = await fetchJson(url, lang, 10000)
  if (!Array.isArray(data)) return []
  return data
    .map((item) => toOsmCandidate(item, lang))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
}

async function searchPhoton(query, lang) {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  if (lang === 'en') url.searchParams.set('lang', 'en')
  const data = await fetchJson(url, lang, 10000)
  const features = Array.isArray(data.features) ? data.features : []
  return features
    .map((feature) => toPhotonCandidate(feature, lang))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
}

function curatedCandidate(item) {
  return {
    id: item.id,
    name: item.name,
    localName: item.localName,
    displayName: item.displayName,
    country: item.country,
    countryCode: '',
    lat: item.lat,
    lon: item.lon,
    kind: item.kind || 'city',
    category: item.category || 'city',
    wikipedia: '',
    importance: 1,
    source: 'guide',
  }
}

function dedupeCandidates(items) {
  const seen = new Set()
  const output = []
  for (const item of items) {
    if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue
    const sameName = normalizeText(item.name).slice(0, 24)
    const key = `${sameName}|${item.lat.toFixed(2)}|${item.lon.toFixed(2)}`
    const looseKey = `${sameName}|${Math.round(item.lat)}|${Math.round(item.lon)}`
    if (seen.has(key) || seen.has(looseKey)) continue
    seen.add(key)
    seen.add(looseKey)
    output.push(item)
  }
  return output
}

export async function searchPlaces(query, lang) {
  const local = searchCurated(query, 4, lang).map(curatedCandidate)
  let remote = []
  let online = true
  try {
    remote = await getCached(searchCache, `nominatim|${lang}|${normalizeText(query)}`, SEARCH_TTL, () =>
      searchRemote(query, lang),
    )
  } catch {
    try {
      remote = await getCached(searchCache, `photon|${lang}|${normalizeText(query)}`, SEARCH_TTL, () =>
        searchPhoton(query, lang),
      )
    } catch {
      online = false
    }
  }
  const places = dedupeCandidates([...local.filter(Boolean), ...remote]).slice(0, 8)
  return { places, online }
}

function uniqueParts(values) {
  return values
    .map((value) => cleanText(String(value || '').split(';')[0]))
    .filter((value, index, list) => value && list.indexOf(value) === index)
}

function preferLanguageScript(parts, lang) {
  if (parts.length < 2) return parts
  const cjk = /[\u4e00-\u9fff]/
  const preferred = parts.filter((part) => (lang === 'zh') === cjk.test(part))
  return preferred.length ? preferred : parts
}

async function reverseRemote(lat, lon, lang) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('zoom', '16')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('namedetails', '1')
  url.searchParams.set('accept-language', acceptLanguage(lang))
  const data = await fetchJson(url, lang, 9000)
  if (!data || data.error) throw new Error(data?.error || 'Reverse geocode failed')
  const address = data.address || {}
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    ''
  const district = address.city_district || address.district || address.borough || ''
  const suburb = address.suburb || address.neighbourhood || address.quarter || ''
  const road = address.road || address.pedestrian || address.footpath || ''
  const labelParts = preferLanguageScript(uniqueParts([city, district]), lang)
  const fallbackParts = preferLanguageScript(uniqueParts([address.state, address.country]), lang)
  const detailParts = uniqueParts([suburb, road])
  return {
    label: labelParts.join(' · ') || fallbackParts.join(' · ') || data.name || '',
    detail: detailParts.join(' · '),
    name: data.name || '',
    displayName: cleanText(data.display_name || ''),
    kind: data.addresstype || data.type || '',
    lat,
    lon,
    source: 'osm',
  }
}

// Nominatim's public service asks for at most one request per second. The
// client already debounces, but serializing here also protects against a
// second FootPrint panel or a quick language switch.
async function reverseRemoteThrottled(lat, lon, lang) {
  const task = reverseQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastReverseAt))
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    try {
      return await reverseRemote(lat, lon, lang)
    } finally {
      lastReverseAt = Date.now()
    }
  })
  reverseQueue = task.catch(() => {})
  return task
}

export async function reverseGeocode(lat, lon, lang) {
  const key = `${lang}|${lat.toFixed(3)}|${lon.toFixed(3)}`
  try {
    const place = await getCached(reverseCache, key, REVERSE_TTL, () =>
      reverseRemoteThrottled(lat, lon, lang),
    )
    if (place?.label) return place
  } catch {
    // Fall through to the built-in area name.
  }
  const nearest = nearestCurated(lat, lon)
  if (nearest && nearest.distanceKm <= 80) {
    return {
      label: lang === 'zh' ? nearest.place.name : nearest.place.nameEn,
      detail: lang === 'zh' ? '内置城市范围' : 'Built-in city area',
      name: '',
      displayName: '',
      kind: 'city',
      lat,
      lon,
      source: 'guide',
      approximate: true,
    }
  }
  return {
    label: '',
    detail: '',
    name: '',
    displayName: '',
    kind: 'place',
    lat,
    lon,
    source: 'none',
    approximate: true,
  }
}

async function searchWikipediaTitle(name, country, lang) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('list', 'search')
  url.searchParams.set('srsearch', `${name} ${country || ''}`.trim())
  url.searchParams.set('srnamespace', '0')
  url.searchParams.set('srlimit', '5')
  const data = await fetchJson(url, lang, 9000)
  const results = Array.isArray(data.query?.search) ? data.query.search : []
  const candidate = results.find((item) => {
    const title = String(item.title || '')
    return !/消歧义|disambiguation/i.test(title)
  })
  return candidate?.title || ''
}

async function resolveWikipediaTitle(input, lang) {
  const tag = parseWikipediaTag(input.wikipedia)
  if (tag && tag.lang === lang && tag.title) return tag.title
  if (tag && tag.lang === 'en' && lang === 'en' && tag.title) return tag.title
  return searchWikipediaTitle(input.name, input.country, lang)
}

async function getWikipediaSummary(title, lang) {
  if (!title) return null
  const page = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${page}`
  const data = await fetchJson(url, lang, 9000)
  if (!data || data.type === 'disambiguation') return null
  return data
}

async function getWikipediaNearby(lat, lon, lang) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('generator', 'geosearch')
  url.searchParams.set('ggscoord', `${lat}|${lon}`)
  url.searchParams.set('ggsradius', '10000')
  url.searchParams.set('ggslimit', '20')
  url.searchParams.set('ggsnamespace', '0')
  url.searchParams.set('prop', 'coordinates|pageimages|extracts|description')
  url.searchParams.set('exintro', '1')
  url.searchParams.set('explaintext', '1')
  url.searchParams.set('exlimit', '20')
  url.searchParams.set('piprop', 'thumbnail')
  url.searchParams.set('pithumbsize', '480')
  url.searchParams.set('pilimit', '20')
  url.searchParams.set('redirects', '1')
  const data = await fetchJson(url, lang, 10000)
  return Array.isArray(data.query?.pages) ? data.query.pages : []
}

function attractionScore(page, distanceKm) {
  const description = `${page.description || ''} ${page.extract || ''}`
  const landmark =
    /museum|gallery|palace|temple|church|cathedral|basilica|mosque|tower|bridge|square|park|garden|market|monument|memorial|castle|fort|ruins|archaeological|theatre|theater|opera|stadium|zoo|aquarium|beach|mountain|lake|river|island|observation|landmark|shrine|abbey|library|street|quarter|waterfront|harbour|harbor|pavilion|pagoda|博物馆|美术馆|宫殿|寺|教堂|清真寺|塔|桥|广场|公园|花园|市场|纪念碑|城堡|遗址|剧院|歌剧院|动物园|水族馆|海滩|山|湖|岛|观景|地标|神社|修道院|图书馆|老街|步行街|码头/i.test(
      description,
    )
  const bad = /list of|timeline|history of|metro station|railway station|airport|hospital|disambiguation|\bsiege\b|\bbattle\b|\btreaty\b|\belection\b|\bmassacre\b|地铁站|车站|机场|医院|消歧义|列表|战役|战争|事件|选举/i.test(
    description,
  )
  if (bad) return -1
  let score = landmark ? 34 : 0
  if (page.thumbnail?.source) score += 18
  if (page.extract) score += 6
  score += Math.max(0, 24 - distanceKm * 2.2)
  return score
}

function nearbyAttractions(pages, input, summaryTitle, lang) {
  const excluded = new Set(
    [input.name, summaryTitle].filter(Boolean).map((value) => normalizeText(value)),
  )
  const output = []
  for (const page of pages) {
    const title = String(page.title || '')
    const normalized = normalizeText(title)
    if (!title || excluded.has(normalized)) continue
    if (/街道|乡$|镇$|县$|市$|^列表|^List of/i.test(title)) continue
    const coords = Array.isArray(page.coordinates) ? page.coordinates[0] : null
    const lat = Number(coords?.lat ?? input.lat)
    const lon = Number(coords?.lon ?? input.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const distance = haversineKm(input.lat, input.lon, lat, lon)
    if (distance < 0.08) continue
    const score = attractionScore(page, distance)
    if (score < 0) continue
    const description = truncate(
      page.extract || page.description || '',
      170,
    )
    output.push({
      id: `wiki:${page.pageid || normalized}`,
      name: title,
      lat,
      lon,
      distance: Math.round(distance * 10) / 10,
      description: description || (lang === 'zh' ? '这处地点就在附近，适合顺路一游。' : 'A nearby place worth adding to the walk.'),
      thumbnail: page.thumbnail?.source || '',
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      source: 'wikipedia',
      score,
    })
  }
  output.sort((a, b) => b.score - a.score)
  return output.slice(0, 6).map(({ score, ...item }) => item)
}

function genericIntro(input, nearby, lang) {
  if (lang === 'zh') {
    const where = input.country ? `位于${input.country}` : '位于这颗星球上'
    const kinds = {
      city: '城市',
      town: '城镇',
      village: '村落',
      attraction: '景点',
      museum: '博物馆',
      park: '公园',
    }
    const kind = kinds[String(input.kind || '').toLowerCase()] || '地点'
    const nearbyText = nearby.length
      ? `附近的${nearby
          .slice(0, 3)
          .map((item) => item.name)
          .join('、')}可以作为探索这一带的起点。`
      : '关于这里的在线资料暂时不可用，可以先从地图上观察它的位置与周边关系。'
    return `${input.name}${where}，是一处${kind}。${nearbyText}`
  }
  const nearbyText = nearby.length
    ? ` Nearby ${nearby
        .slice(0, 3)
        .map((item) => item.name)
        .join(', ')} can anchor a walk in the area.`
    : ' Online background is unavailable right now; use the globe to explore its position and surroundings.'
  return `${input.name}${input.country ? ` is in ${input.country}` : ''}.${nearbyText}`
}

function guideFallback(input, lang) {
  const nearest = nearestCurated(input.lat, input.lon)
  if (!nearest || nearest.distanceKm > 35) return null
  const place = materializePlace(nearest.place, lang)
  return {
    ...place,
    id: input.id || place.id,
    name: input.name || place.name,
    displayName: input.displayName || place.displayName,
    localName: input.localName || place.localName,
    lat: input.lat,
    lon: input.lon,
    notice:
      lang === 'zh'
        ? `在线资料暂不可用，以下为${nearest.place.name}一带的内置城市导览，景点距离以城市中心估算。`
        : `Online details are unavailable. This is the built-in guide for ${nearest.place.nameEn}; distances are measured from the city centre.`,
  }
}

export async function buildPlace(input, lang) {
  const curatedId = String(input.id || '').startsWith('curated:')
    ? String(input.id).slice('curated:'.length)
    : ''
  if (curatedId) {
    const [cityId, attractionId] = curatedId.split(':')
    const place = PLACES.find((item) => item.id === cityId)
    if (place && !attractionId) return materializePlace(place, lang)
    if (place && attractionId) {
      const attraction = (place.attractions || []).find((item) => item.id === attractionId)
      if (attraction) {
        const city = materializePlace(place, lang)
        const name = lang === 'zh' ? attraction.name : attraction.nameEn
        const cityName = lang === 'zh' ? place.name : place.nameEn
        const country = lang === 'zh' ? place.country : place.countryEn
        return {
          ...city,
          id: `curated:${place.id}:${attraction.id}`,
          name,
          nameZh: attraction.name,
          nameEn: attraction.nameEn,
          localName: attraction.name,
          displayName: `${name} · ${cityName}, ${country}`,
          lat: attraction.lat,
          lon: attraction.lon,
          kind: 'attraction',
          category: 'attraction',
          intro:
            lang === 'zh'
              ? attraction.description
              : attraction.descriptionEn ||
                `${attraction.nameEn} is a highlight of ${cityName}.`,
          attractions: city.attractions
            .filter((item) => item.id !== `curated:${place.id}:${attraction.id}`)
            .map((item) => ({
              ...item,
              distance:
                Math.round(
                  haversineKm(attraction.lat, attraction.lon, item.lat, item.lon) * 10,
                ) / 10,
            }))
            .sort((a, b) => a.distance - b.distance),
        }
      }
    }
  }

  let summary = null
  let pages = []
  let title = ''
  const titleTask = resolveWikipediaTitle(input, lang).catch(() => '')
  const nearbyTask = getWikipediaNearby(input.lat, input.lon, lang).catch(() => [])
  const [resolvedTitle, nearbyPages] = await Promise.all([titleTask, nearbyTask])
  title = resolvedTitle
  pages = nearbyPages
  if (title) {
    summary = await getWikipediaSummary(title, lang).catch(() => null)
  }

  if (!summary) {
    const closest = pages
      .map((page) => {
        const coords = Array.isArray(page.coordinates) ? page.coordinates[0] : null
        const distance =
          coords && Number.isFinite(Number(coords.lat))
            ? haversineKm(input.lat, input.lon, Number(coords.lat), Number(coords.lon))
            : 99
        return { page, distance }
      })
      .filter((item) => item.distance < 1.2 && item.page.extract)
      .sort((a, b) => a.distance - b.distance)[0]
    if (closest) {
      title = closest.page.title
      summary = {
        title: closest.page.title,
        extract: closest.page.extract,
        description: closest.page.description,
        thumbnail: closest.page.thumbnail,
        content_urls: {
          desktop: {
            page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(closest.page.title).replace(/ /g, '_'))}`,
          },
        },
      }
    }
  }

  if (summary?.extract) {
    const attractions = nearbyAttractions(pages, input, summary.title || title, lang)
    const name = summary.title || input.name
    const articleUrl = summary.content_urls?.desktop?.page || ''
    return {
      id: input.id || `wiki:${title || input.name}`,
      name,
      nameZh: lang === 'zh' ? name : input.nameZh || '',
      nameEn: lang === 'en' ? name : input.nameEn || '',
      localName: input.localName || name,
      displayName: input.displayName || (input.country ? `${name} · ${input.country}` : name),
      country: input.country || '',
      lat: input.lat,
      lon: input.lon,
      kind: input.kind || 'place',
      category: input.category || '',
      intro: truncate(summary.extract, 760),
      description: cleanText(summary.description || ''),
      thumbnail: summary.thumbnail?.source || summary.originalimage?.source || '',
      source: 'wikipedia',
      sourceUrl: articleUrl,
      license: 'CC BY-SA 4.0',
      attractions,
    }
  }

  const fallback = guideFallback(input, lang)
  if (fallback) return fallback

  return {
    id: input.id || `place:${input.lat},${input.lon}`,
    name: input.name,
    nameZh: lang === 'zh' ? input.name : input.nameZh || '',
    nameEn: lang === 'en' ? input.name : input.nameEn || '',
    localName: input.localName || input.name,
    displayName: input.displayName || input.name,
    country: input.country || '',
    lat: input.lat,
    lon: input.lon,
    kind: input.kind || 'place',
    category: input.category || '',
    intro: genericIntro(input, [], lang),
    source: 'generated',
    attractions: [],
    notice:
      lang === 'zh'
        ? '在线资料暂不可用，当前介绍由 FootPrint 根据坐标生成。'
        : 'Online details are unavailable; this introduction was generated from the coordinates.',
  }
}

function parsePlaceInput(url, lang) {
  const id = url.searchParams.get('id') || ''
  const name = cleanText(url.searchParams.get('name') || '')
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  return {
    id,
    name,
    nameZh: url.searchParams.get('nameZh') || '',
    nameEn: url.searchParams.get('nameEn') || '',
    localName: url.searchParams.get('localName') || '',
    displayName: cleanText(url.searchParams.get('displayName') || ''),
    country: cleanText(url.searchParams.get('country') || ''),
    kind: url.searchParams.get('kind') || '',
    category: url.searchParams.get('category') || '',
    wikipedia: url.searchParams.get('wikipedia') || '',
    lat,
    lon,
    lang,
    valid:
      (id.startsWith('curated:') &&
        PLACES.some(
          (place) =>
            id === `curated:${place.id}` ||
            id.startsWith(`curated:${place.id}:`),
        )) ||
      (name.length > 0 &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180),
  }
}

async function serveVendor(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  let relative = decodeURIComponent(url.pathname.slice(VENDOR_PREFIX.length))
  if (!relative || relative === '/') relative = '/Cesium.js'
  relative = relative.replace(/^[/\\]+/, '')
  const resolved = path.resolve(VENDOR_ROOT, relative)
  if (resolved !== VENDOR_ROOT && !resolved.startsWith(`${VENDOR_ROOT}${path.sep}`)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }
  let stat = null
  try {
    stat = await fsp.stat(resolved)
  } catch {
    stat = null
  }
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }
  const ext = path.extname(resolved).toLowerCase()
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    res.end()
    return
  }
  res.writeHead(200, headers)
  const stream = createReadStream(resolved)
  stream.on('error', () => {
    res.destroy()
  })
  stream.pipe(res)
}

export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() => {
    const apiRoute = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')
          const route = url.pathname.slice(API_PREFIX.length) || '/'
          const lang = normalizeLang(url.searchParams.get('lang'))
          if (req.method === 'GET' && route === '/health') {
            sendJson(res, 200, {
              ok: true,
              cesium: true,
              curated: PLACES.length,
              providers: listProviders(),
            })
            return
          }
          if (req.method === 'GET' && route === '/providers') {
            sendJson(res, 200, { ok: true, providers: listProviders() })
            return
          }
          if (req.method === 'GET' && route === '/search') {
            const query = cleanText(url.searchParams.get('q') || '')
            if (!query) {
              sendJson(res, 400, { ok: false, error: 'Missing q' })
              return
            }
            const result = await searchPlaces(query, lang)
            sendJson(res, 200, { ok: true, query, lang, ...result })
            return
          }
          if (req.method === 'GET' && route === '/reverse') {
            const lat = Number(url.searchParams.get('lat'))
            const lon = Number(url.searchParams.get('lon'))
            if (
              !Number.isFinite(lat) ||
              !Number.isFinite(lon) ||
              lat < -90 ||
              lat > 90 ||
              lon < -180 ||
              lon > 180
            ) {
              sendJson(res, 400, { ok: false, error: 'Invalid coordinates' })
              return
            }
            const place = await reverseGeocode(lat, lon, lang)
            sendJson(res, 200, { ok: true, lang, place })
            return
          }
          if (req.method === 'GET' && route === '/place') {
            const input = parsePlaceInput(url, lang)
            if (!input.valid) {
              sendJson(res, 400, { ok: false, error: 'Invalid place coordinates' })
              return
            }
            const key = `${lang}|${input.id}|${input.name}|${round(input.lat, 4)}|${round(input.lon, 4)}`
            const place = await getCached(placeCache, key, PLACE_TTL, async () => {
              const base = await buildPlace(input, lang)
              const social = await getSocialRecommendations(base, lang)
              return social.length ? { ...base, social } : base
            })
            sendJson(res, 200, { ok: true, lang, place })
            return
          }
          sendJson(res, 404, { ok: false, error: `Unknown endpoint ${route}` })
        } catch (error) {
          if (!res.headersSent) {
            sendJson(res, 500, {
              ok: false,
              error: String(error?.message || error),
            })
          } else {
            res.destroy()
          }
        }
      },
    })

    const vendorRoute = ctx.webServer.register({
      kind: 'prefix',
      path: VENDOR_PREFIX,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' })
          res.end()
          return
        }
        try {
          await serveVendor(req, res)
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
            res.end(String(error?.message || error))
          } else {
            res.destroy()
          }
        }
      },
    })

    return () => {
      vendorRoute()
      apiRoute()
    }
  }, 'footprint: http routes')
}
