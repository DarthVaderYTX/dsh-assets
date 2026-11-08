import { haversineKm } from '../../data/places.js'
import { osmAddress, osmUrl, searchNearby } from '../shared/nominatim.js'

const KIND_LABELS = {
  hotel: '酒店',
  guest_house: '客栈 / 民宿',
  hostel: '青年旅舍',
  apartment: '公寓',
  motel: '汽车旅馆',
}

function toItem(result, place) {
  const tags = result.extratags || {}
  const name = result.name || result.namedetails?.['name:zh'] || result.namedetails?.name
  if (!name) return null
  const lat = Number(result.lat)
  const lon = Number(result.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const tourism = result.type || ''
  const kind = KIND_LABELS[tourism] || '住宿'
  const stars = Number(tags.stars)
  const address = osmAddress(result)
  const distance = Math.round(haversineKm(place.lat, place.lon, lat, lon) * 10) / 10
  const description = [
    kind,
    Number.isFinite(stars) && stars > 0 ? `${stars} 星` : '',
    address,
    tags.website || '',
  ]
    .filter(Boolean)
    .join(' · ')
  const itemTags = [kind]
  if (Number.isFinite(stars) && stars > 0) itemTags.push(`${stars} 星`)
  if (tags.wheelchair === 'yes') itemTags.push('无障碍')
  return {
    id: `osm:${result.osm_type || 'place'}:${result.osm_id || result.place_id}`,
    name,
    category: 'lodging',
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
    rating: Number.isFinite(stars) && stars > 0 ? stars : null,
    reviewCount: null,
    noteCount: null,
    tags: [...new Set(itemTags)].slice(0, 4),
  }
}

export const openstreetmapLodgingProvider = {
  key: 'openstreetmap:lodging',
  service: 'openstreetmap',
  category: 'lodging',
  label: { zh: 'OpenStreetMap', en: 'OpenStreetMap' },
  priority: 20,
  timeoutMs: 15000,
  supports(place) {
    return Number.isFinite(place?.lat) && Number.isFinite(place?.lon)
  },
  async recommend(place, lang = 'zh') {
    const results = await searchNearby('hotel', place, 0.05, lang)
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
      key: 'openstreetmap:lodging',
      service: 'openstreetmap',
      serviceLabel: 'OpenStreetMap',
      category: 'lodging',
      label: 'OpenStreetMap',
      title: lang === 'zh' ? '周边住宿' : 'Nearby stays',
      url: `https://www.openstreetmap.org/#map=14/${place.lat}/${place.lon}`,
      attribution: {
        name: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/copyright',
        note:
          lang === 'zh'
            ? '住宿点来自 OpenStreetMap，按距离排序'
            : 'Stays from OpenStreetMap, sorted by distance',
      },
      items,
    }
  },
}
