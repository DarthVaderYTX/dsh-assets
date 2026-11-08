# Social content providers

`providers/index.js` is a small registry for attraction recommendations from
social / travel sources. The current first provider is **Mafengwo**; future
providers (Ctrip, Xiaohongshu, an official API, ...) only need to implement the
same contract and be added to the registry.

## Provider contract

```js
export const myProvider = {
  id: 'ctrip',
  label: { zh: '携程', en: 'Ctrip' },
  priority: 20,
  timeoutMs: 9000,

  supports(place, lang) {
    return Boolean(place && place.lat != null && place.lon != null)
  },

  async recommend(place, lang) {
    // Return null when this source has no content for the place.
    return {
      id: 'ctrip',
      label: lang === 'zh' ? '携程' : 'Ctrip',
      url: 'https://example.com/destination',
      items: [
        {
          id: 'ctrip:123',
          name: '示例景点',
          description: '推荐理由/简介',
          image: 'https://example.com/photo.jpg',
          url: 'https://example.com/poi/123',
          rating: 4.7,
          reviewCount: 1200,
          noteCount: 80,
          tags: ['博物馆', '亲子'],
          // Optional: coordinates let the client fly to the item and drop a marker.
          lat: 39.9,
          lon: 116.4,
          localId: 'curated:beijing:forbidden-city',
          provider: 'ctrip',
          source: 'ctrip',
        },
      ],
    }
  },
}
```

Then register it in `providers/index.js`:

```js
import { myProvider } from './my-provider.js'

const PROVIDERS = [mafengwoProvider, myProvider]
```

`getSocialRecommendations(place, lang)` runs all supported providers in
parallel, isolates failures, applies `timeoutMs`, and returns every non-empty
section. The place's existing Wikipedia / built-in guide recommendations stay
untouched, so a failing social provider never blanks the panel.

## Mafengwo provider

- Reads the public mobile destination directory (`m.mafengwo.cn/mdd/`) to map a
  place name to a destination id.
- Reads the public attraction ranking page (`m.mafengwo.cn/jd/<id>/`) for
  ranking, rating, review/note counts, tags, address, recommendation reason,
  image and backlink.
- Caches the directory for 24 hours and each destination page for 1 hour.
- Maps a POI to coordinates only when its name matches an existing place
  attraction (e.g. Mafengwo "故宫" ↔ "故宫博物院"); otherwise the card links
  to Mafengwo instead of flying on the globe.
- Does not use Mafengwo's official Open Platform API because that API is aimed
  at hotel/ticket supply and requires merchant credentials. A future provider
  can implement the official API without changing the client contract.
