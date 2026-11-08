// Shared Mafengwo mobile-page reader.
//
// The public mobile site exposes three useful ranking pages under the same
// destination id:
//   /jd/<id>/  attractions
//   /cy/<id>/  food
//   /gw/<id>/  shopping (not used yet)
// /yl/<id>/ (entertainment) can be plugged in the same way.
//
// The parser supports both HTML layouts used by the mobile site: the richer
// "poi-li" card (rating/address/tags) and the international "poi" card
// (review excerpt/one tag).

import { fetchText } from '../../http.js'

const DIRECTORY_URL = 'https://m.mafengwo.cn/mdd/'
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const DIRECTORY_TTL = 24 * 60 * 60 * 1000
const PAGE_TTL = 60 * 60 * 1000
const MAX_ITEMS = 6

let directoryCache = null
let directoryPromise = null
const pageCache = new Map()

const ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, code) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x'
      const number = Number.parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10)
      return Number.isFinite(number) ? String.fromCodePoint(number) : full
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, code) ? ENTITIES[code] : full
  })
}

function stripHtml(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s,，.。·'’"“”\-_/()（）]/g, '')
    .replace(/(市|地区|特别行政区)$/g, '')
}

function absolute(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http')) return value
  return `https://m.mafengwo.cn${value.startsWith('/') ? '' : '/'}${value}`
}

function isBlocked(html) {
  return (
    !html ||
    html.length < 1500 ||
    (html.includes('probe.js') && !html.includes('poi_list') && !html.includes('class="title"'))
  )
}

function pageHeaders(referer = 'https://m.mafengwo.cn/') {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'user-agent': MOBILE_UA,
    referer,
  }
}

export function parseDestinationDirectory(html) {
  const directory = new Map()
  const pattern =
    /<a href="\/mdd\/(\d+)"[\s\S]{0,4000}?<div class="title">([^<]+)<\/div>/g
  for (const match of String(html || '').matchAll(pattern)) {
    const id = match[1]
    const name = stripHtml(match[2])
    const key = normalizeName(name)
    if (!id || !key || directory.has(key)) continue
    directory.set(key, { id, name })
  }
  return directory
}

function attachLocalCoordinates(items, place, category) {
  if (category !== 'attraction') return items
  const known = Array.isArray(place.attractions) ? place.attractions : []
  if (!known.length) return items
  return items.map((item) => {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return item
    const normalized = normalizeName(item.name)
    const match = known.find((candidate) => {
      const name = normalizeName(candidate.name || candidate.nameZh || '')
      return (
        name &&
        (name === normalized ||
          (normalized.length >= 2 && name.includes(normalized)) ||
          (name.length >= 2 && normalized.includes(name)))
      )
    })
    if (!match) return item
    return {
      ...item,
      lat: match.lat,
      lon: match.lon,
      localId: match.id,
    }
  })
}

export function parseMafengwoPage(html, category, place = {}) {
  const items = []
  const cardPattern =
    /<a href="\/poi\/(\d+)\.html[^"]*" class="(?:poi-li|poi)">([\s\S]*?)<\/a>/g
  let rank = 0
  for (const match of String(html || '').matchAll(cardPattern)) {
    const poiId = match[1]
    const block = match[2]
    const name = stripHtml(
      (block.match(/<div class="hd">([\s\S]*?)<\/div>/) || [])[1] ||
        (block.match(/<p class="t1"[^>]*title="([^"]+)"/) || [])[1] ||
        (block.match(/<p class="t1"[^>]*>([\s\S]*?)<\/p>/) || [])[1],
    )
    if (!name) continue
    const image = absolute(
      (block.match(/<img[^>]+(?:data-original|src)="([^"]+)"/) || [])[1],
    )
    const progress = Number(
      (block.match(/class="progress"[^>]*style="width:\s*(\d+)%/) || [])[1] || 0,
    )
    const numbers = [
      ...block.matchAll(/<(?:span|strong) class="num">([\d,]+)<\/(?:span|strong)>/g),
    ].map((item) => Number(String(item[1]).replace(/,/g, '')))
    const tagsText = stripHtml(
      (block.match(/<p class="m-t">([\s\S]*?)<\/p>/) || [])[1] ||
        (block.match(/<div class="t4">([\s\S]*?)<\/div>/) || [])[1],
    )
    const address =
      [...block.matchAll(/<p><strong>([\s\S]*?)<\/strong><\/p>/g)]
        .map((item) => stripHtml(item[1]))
        .find((value) => value && value !== tagsText) || ''
    const commentHtml =
      (block.match(/<div class="comment"><strong>推荐理由<\/strong>([\s\S]*?)<\/div>/) ||
        block.match(/<div class="desc">([\s\S]*?)<\/div>/) ||
        [])[1]
    const comment = stripHtml(
      String(commentHtml || '').replace(/<strong>[\s\S]*?<\/strong>/, ''),
    )
    rank += 1
    items.push({
      id: `mafengwo:${poiId}`,
      poiId,
      name,
      rank,
      category,
      image,
      rating: progress > 0 ? Math.round((progress / 20) * 10) / 10 : null,
      reviewCount: Number.isFinite(numbers[0]) ? numbers[0] : null,
      noteCount: Number.isFinite(numbers[1]) ? numbers[1] : null,
      tags: tagsText ? tagsText.split(/\s+/).filter(Boolean) : [],
      address,
      description: comment || [tagsText, address].filter(Boolean).join(' · '),
      url: `https://m.mafengwo.cn/poi/${poiId}.html`,
      provider: 'mafengwo',
      service: 'mafengwo',
      source: 'mafengwo',
    })
    if (items.length >= MAX_ITEMS) break
  }
  return attachLocalCoordinates(items, place, category)
}

async function fetchDirectory() {
  const html = await fetchText(DIRECTORY_URL, pageHeaders(), 10000)
  if (isBlocked(html)) throw new Error('Mafengwo directory response was blocked')
  const directory = parseDestinationDirectory(html)
  if (!directory.size) throw new Error('Mafengwo directory was empty')
  return directory
}

async function getDirectory() {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL) {
    return directoryCache.value
  }
  if (!directoryPromise) {
    directoryPromise = fetchDirectory()
      .then((value) => {
        directoryCache = { at: Date.now(), value }
        return value
      })
      .finally(() => {
        directoryPromise = null
      })
  }
  return directoryPromise
}

export async function findMafengwoDestination(place) {
  const directory = await getDirectory()
  const candidates = [
    place.nameZh,
    place.name,
    place.localName,
    place.nameEn,
    place.displayName,
    ...(place.aliases || []),
  ]
    .filter(Boolean)
    .map(normalizeName)
    .filter(Boolean)
  for (const candidate of candidates) {
    if (directory.has(candidate)) return directory.get(candidate)
  }
  return null
}

const SECTION_PATH = {
  attraction: 'jd',
  food: 'cy',
  shopping: 'gw',
  entertainment: 'yl',
}

export async function fetchMafengwoSection(destination, category) {
  const section = SECTION_PATH[category]
  if (!section) throw new Error(`Unsupported Mafengwo category: ${category}`)
  const key = `${section}:${destination.id}`
  const cached = pageCache.get(key)
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.value
  const url = `https://m.mafengwo.cn/${section}/${destination.id}/`
  const html = await fetchText(url, pageHeaders(`https://m.mafengwo.cn/mdd/${destination.id}`), 10000)
  if (isBlocked(html)) throw new Error(`Mafengwo ${category} page was blocked`)
  const items = parseMafengwoPage(html, category)
  if (!items.length) throw new Error(`Mafengwo ${category} page had no entries`)
  const value = { destination, category, url, items }
  pageCache.set(key, { at: Date.now(), value })
  return value
}

export function buildMafengwoSection({ destination, category, url, items }, lang) {
  const categoryLabel =
    category === 'food'
      ? lang === 'zh'
        ? '美食'
        : 'Food'
      : category === 'lodging'
        ? lang === 'zh'
          ? '住宿'
          : 'Stay'
        : lang === 'zh'
          ? '景点'
          : 'Sights'
  return {
    key: `mafengwo:${category}`,
    service: 'mafengwo',
    serviceLabel: lang === 'zh' ? '马蜂窝' : 'Mafengwo',
    category,
    label: lang === 'zh' ? '马蜂窝' : 'Mafengwo',
    title: categoryLabel,
    url,
    destination: { id: destination.id, name: destination.name },
    attribution: {
      name: '马蜂窝',
      url,
      note:
        lang === 'zh'
          ? '榜单摘要与评分来自马蜂窝公开移动端页面'
          : 'Ranking snippets and ratings from public Mafengwo mobile pages',
    },
    items,
  }
}

export { normalizeName as normalizeMafengwoName }
