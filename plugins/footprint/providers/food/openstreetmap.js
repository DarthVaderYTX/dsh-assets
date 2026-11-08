import { haversineKm } from '../../data/places.js'
import { osmAddress, osmUrl, searchNearby } from '../shared/nominatim.js'

const KIND_LABELS = {
  restaurant: '餐厅',
  cafe: '咖啡馆',
  fast_food: '快餐',
  food_court: '美食广场',
  bar: '酒吧',
  pub: '酒馆',
}

function toItem(result, place) {
  const tags = result.extratags || {}
  const name = result.name || result.namedetails?.['name:zh'] || result.namedetails?.name
  if (!name) return null
  const lat = Number(result.lat)
  const lon = Number(result.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const amenity = result.type || ''
  const kind = KIND_LABELS[amenity] || '餐饮'
  const cuisine = String(tags.cuisine || '')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)
  const address = osmAddress(result)
  const hours = tags.opening_hours || ''
  const distance = Math.round(haversineKm(place.lat, place.lon, lat, lon) * 10) / 10
  const description = [kind, cuisine.join(' / '), address, hours].filter(Boolean).join(' · ')
  const itemTags = [kind, ...cuisine]
  if (tags.outdoor_seating === 'yes') itemTags.push('户外座位')
  if (tags.takeaway === 'yes') itemTags.push('可外带')
  return {
    id: `osm:${result.osm_type || 'place'}:${result.osm_id || result.place_id}`,
    name,
    category: 'food',
    provider: 'openstreetmap',
    service: 'openstreetmap',
    source: 'openstreetmap',
    description,
    image: tags.image || '',
    url: osmUrl(result),
    lat,
    lon,
    distance,
    address,
    rating: null,
    reviewCount: null,
    noteCount: null,
    tags: [...new Set(itemTags)].slice(0, 4),
  }
}

export const openstreetmapFoodProvider = {
  key: 'openstreetmap:food',
  service: 'openstreetmap',
  category: 'food',
  label: { zh: 'OpenStreetMap', en: 'OpenStreetMap' },
  priority: 20,
  timeoutMs: 15000,
  supports(place) {
    return Number.isFinite(place?.lat) && Number.isFinite(place?.lon)
  },
  async recommend(place, lang = 'zh') {
    const results = await searchNearby('restaurant', place, 0.03, lang)
    const seen = new Set()
    const items = results
      .map((result) => toItem(result, place))
      .filter((item) => {
        if (!item) return false
        const key = `${item.name}|${item.lat.toFixed(4)}|${item.lon.toFixed(4)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6)
    if (!items.length) return null
    return {
      key: 'openstreetmap:food',
      service: 'openstreetmap',
      serviceLabel: 'OpenStreetMap',
      category: 'food',
      label: 'OpenStreetMap',
      title: lang === 'zh' ? '周边餐饮' : 'Nearby food',
      url: `https://www.openstreetmap.org/#map=15/${place.lat}/${place.lon}`,
      attribution: {
        name: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        note:
          lang === 'zh'
            ? '餐饮点来自 OpenStreetMap，按距离排序'
            : 'Food places from OpenStreetMap, sorted by distance',
      },
      items,
    }
  },
}
