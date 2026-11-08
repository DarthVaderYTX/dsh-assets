import {
  buildMafengwoSection,
  fetchMafengwoSection,
  findMafengwoDestination,
} from '../shared/mafengwo.js'

export const mafengwoFoodProvider = {
  key: 'mafengwo:food',
  service: 'mafengwo',
  category: 'food',
  label: { zh: '马蜂窝', en: 'Mafengwo' },
  priority: 10,
  timeoutMs: 9000,
  supports() {
    return true
  },
  async recommend(place, lang = 'zh') {
    const destination = await findMafengwoDestination(place)
    if (!destination) return null
    const page = await fetchMafengwoSection(destination, 'food')
    return buildMafengwoSection(page, lang)
  },
}
