# Recommendation providers

Providers are organized by **category** and **service name**:

```
providers/
  index.js                         registry; returns sections grouped by category
  attraction/
    mafengwo.js                    attractions from the public Mafengwo mobile ranking
  food/
    mafengwo.js                    food from the public Mafengwo mobile ranking
    openstreetmap.js               nearby restaurants/cafes via Nominatim bounded search
  lodging/
    openstreetmap.js               nearby hotels/guest houses via Nominatim bounded search
  shared/
    mafengwo.js                    directory, page cache and mobile HTML parser
    nominatim.js                   shared 1 req/s bounded-search queue
```

A place response contains:

```js
{
  recommendations: {
    attraction: [ section, ... ],
    food:       [ section, ... ],
    lodging:    [ section, ... ],
  }
}
```

Each section:

```js
{
  key: 'mafengwo:food',
  service: 'mafengwo',
  serviceLabel: '马蜂窝',
  category: 'food',
  label: '马蜂窝',
  url: 'https://m.mafengwo.cn/cy/10065/',
  attribution: { name, url, note },
  items: [ item, ... ],
}
```

Item fields used by the client:

```js
{
  id, name, description, image, url,
  category, service, provider, source,
  rating?, reviewCount?, noteCount?,
  tags?, address?,
  lat?, lon?, localId?, distance?
}
```

## Adding a provider

```js
export const myProvider = {
  key: 'ctrip:food',
  service: 'ctrip',
  category: 'food',
  label: { zh: '携程', en: 'Ctrip' },
  priority: 30,
  timeoutMs: 9000,
  supports(place, lang) { return true },
  async recommend(place, lang) {
    return { key: 'ctrip:food', service: 'ctrip', category: 'food',
      label: '携程', url: '...', items: [...] }
  },
}
```

Register it in `providers/index.js`, or call `registerProvider(provider)` from
another Host plugin. `getRecommendations()` runs supported providers in
parallel, applies each timeout, isolates failures, and returns every non-empty
section. A failed social provider never blocks the Wikipedia/guide content.

## Notes

- Mafengwo: public mobile pages (`/jd/<id>/` attractions, `/cy/<id>/` food).
  Directory cached 24h; each ranking page cached 1h. The official Open Platform
  API is aimed at hotel/ticket supply and needs merchant credentials, so it is
  not used here; a future provider can wrap it.
- OpenStreetMap: Nominatim bounded search around the place; shared queue keeps
  requests at roughly one per second. Food radius ~3 km, lodging ~5 km.
- Mafengwo content belongs to Mafengwo and its authors. Only short ranking
  snippets and backlinks are cached; confirm the terms before redistributing.
