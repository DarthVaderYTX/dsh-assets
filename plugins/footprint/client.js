// FootPrint 的浏览器侧：左侧栏入口 + Cesium 3D 地球主面板。
//
// 地球资源由宿主插件从 vendor/cesium 通过 /footprint-vendor 提供，
// 地点检索与维基资料通过 /footprint-api 读取，因此不依赖 CDN。

window.__ModuleLoader__.load({
  id: 'footprint',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'footprint'
    const API = '/footprint-api'
    const VENDOR = '/footprint-vendor/'

    const zh = {
      'panel.title': 'FootPrint',
      'panel.tagline': '把世界放在一颗星球上',
      'panel.hint': '3D 地球 · 地点检索 · 旅行灵感',
      'search.placeholder': '输入城市、地标或地址，例如「京都」',
      'search.action': '定位',
      'search.busy': '搜索中',
      'search.failed': '搜索失败，请检查网络后重试。',
      'search.empty': '没有找到这个地点，试试更完整的名称。',
      'search.localOnly': '在线地名库暂时不可用，当前只显示内置目的地。',
      'search.results': '搜索结果',
      'search.matches': '个匹配',
      'search.hide': '收起结果',
      'search.clear': '清除输入',
      'quick.title': '快速出发',
      'quick.beijing': '北京',
      'quick.tokyo': '东京',
      'quick.paris': '巴黎',
      'quick.newyork': '纽约',
      'welcome.eyebrow': 'FOOTPRINT · 旅行地球',
      'welcome.title': '下一站，去哪里？',
      'welcome.sub': '输入一个地点，FootPrint 会带你在 3D 地球上找到它，并告诉你这里的故事与值得去的地方。',
      'welcome.hint': '拖动旋转 · 滚轮缩放 · 放大后自动加载更清晰的地图',
      'loading.globe': '正在铺开地球…',
      'loading.detail': '正在寻找这个地方…',
      'globe.failed': '地球加载失败',
      'globe.retry': '重新加载',
      'globe.ready': 'CesiumJS · 自适应底图',
      'globe.coords': '光标坐标',
      'time.local': '当地时间',
      'area.locating': '识别地区…',
      'area.unknown': '未知区域',
      'place.located': '已定位',
      'place.guide': '内置导览',
      'place.intro': '关于这里',
      'place.noIntro': '暂无简介。',
      'place.copy': '复制坐标',
      'place.copied': '已复制',
      'attractions.title': '景点推荐',
      'attractions.count': '个去处',
      'attractions.empty': '附近暂时没有可推荐的景点，先在地球上看看周边吧。',
      'attractions.focus': '在地球上查看',
      'source.wikipedia': '资料与图片来自 Wikipedia',
      'source.guide': 'FootPrint 内置旅行导览',
      'source.view': '在 Wikipedia 查看',
      'source.license': 'CC BY-SA 4.0',
      'source.map': '全球底图 Natural Earth II · 放大后自动加载 Esri 卫星影像',
      'source.data': '卫星影像 © Esri · 夜间灯光 NASA GIBS · 地名 © OpenStreetMap contributors',
      'notice.guide': '在线资料暂不可用，以下为内置导览。',
      'empty.title': '从一个地方开始',
      'empty.body': '搜索后会在这里看到地点介绍、坐标和附近景点推荐。点击推荐景点，地球会飞过去。',
      'empty.tip': '试试搜索「西湖」「圣家堂」或「伊斯坦布尔」。',
      'error.detail': '地点详情加载失败，请稍后再试。',
      'action.back': '返回',
      'action.close': '关闭',
      'distance.m': '米',
      'distance.km': '公里',
      'kind.city': '城市',
      'kind.town': '城镇',
      'kind.village': '村落',
      'kind.country': '国家',
      'kind.attraction': '景点',
      'kind.museum': '博物馆',
      'kind.park': '公园',
      'kind.place': '地点',
      'aria.copy': '复制地点坐标',
      'aria.attraction': '在地球上查看这个景点',
      'aria.globe': '可交互的三维地球',
    }

    const en = {
      'panel.title': 'FootPrint',
      'panel.tagline': 'The world on one globe',
      'panel.hint': '3D globe · place search · travel ideas',
      'search.placeholder': 'Search a city, landmark or address, e.g. Kyoto',
      'search.action': 'Locate',
      'search.busy': 'Searching',
      'search.failed': 'Search failed. Check your connection and try again.',
      'search.empty': 'No place found. Try a fuller name.',
      'search.localOnly': 'The online gazetteer is unavailable; showing built-in destinations only.',
      'search.results': 'Search results',
      'search.matches': 'matches',
      'search.hide': 'Hide results',
      'search.clear': 'Clear input',
      'quick.title': 'Quick start',
      'quick.beijing': 'Beijing',
      'quick.tokyo': 'Tokyo',
      'quick.paris': 'Paris',
      'quick.newyork': 'New York',
      'welcome.eyebrow': 'FOOTPRINT · A TRAVEL GLOBE',
      'welcome.title': 'Where to next?',
      'welcome.sub': 'Type a place and FootPrint will find it on a 3D globe, then tell you its story and what is worth seeing nearby.',
      'welcome.hint': 'Drag to rotate · Scroll to zoom · Higher-resolution maps load as you zoom in',
      'loading.globe': 'Unfolding the globe…',
      'loading.detail': 'Finding this place…',
      'globe.failed': 'The globe could not load',
      'globe.retry': 'Try again',
      'globe.ready': 'CesiumJS · adaptive basemap',
      'globe.coords': 'Cursor coordinates',
      'time.local': 'Local time',
      'area.locating': 'Locating area…',
      'area.unknown': 'Unknown area',
      'place.located': 'Located',
      'place.guide': 'Built-in guide',
      'place.intro': 'About this place',
      'place.noIntro': 'No introduction yet.',
      'place.copy': 'Copy coordinates',
      'place.copied': 'Copied',
      'attractions.title': 'Places to see',
      'attractions.count': 'nearby',
      'attractions.empty': 'No nearby sights to recommend yet. Explore the surroundings on the globe.',
      'attractions.focus': 'Show on globe',
      'source.wikipedia': 'Text and images from Wikipedia',
      'source.guide': 'FootPrint built-in travel guide',
      'source.view': 'View on Wikipedia',
      'source.license': 'CC BY-SA 4.0',
      'source.map': 'Global basemap Natural Earth II · Esri satellite imagery fades in as you zoom',
      'source.data': 'Imagery © Esri · Night lights NASA GIBS · Place data © OpenStreetMap contributors',
      'notice.guide': 'Online details are unavailable; showing the built-in guide.',
      'empty.title': 'Start with a place',
      'empty.body': 'After a search, this panel shows the introduction, coordinates and nearby recommendations. Click a recommendation to fly there.',
      'empty.tip': 'Try West Lake, Sagrada Família or Istanbul.',
      'error.detail': 'Could not load this place. Please try again.',
      'action.back': 'Back',
      'action.close': 'Close',
      'distance.m': 'm',
      'distance.km': 'km',
      'kind.city': 'City',
      'kind.town': 'Town',
      'kind.village': 'Village',
      'kind.country': 'Country',
      'kind.attraction': 'Attraction',
      'kind.museum': 'Museum',
      'kind.park': 'Park',
      'kind.place': 'Place',
      'aria.copy': 'Copy place coordinates',
      'aria.attraction': 'Show this attraction on the globe',
      'aria.globe': 'Interactive three-dimensional globe',
    }

    const QUICK = [
      { label: 'quick.beijing', query: '北京', fallback: 'Beijing' },
      { label: 'quick.tokyo', query: '东京', fallback: 'Tokyo' },
      { label: 'quick.paris', query: '巴黎', fallback: 'Paris' },
      { label: 'quick.newyork', query: '纽约', fallback: 'New York' },
    ]

    const STYLE = `
.fp-page {
  --fp-amber: #f4b04a;
  --fp-amber-soft: rgba(244, 176, 74, .15);
  --fp-teal: #63e6d5;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #0b1017);
  color: var(--dsw-alias-label-primary, #e7edf5);
  font-family: inherit;
}
.fp-top {
  flex: 0 0 auto;
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
  background: var(--dsw-alias-bg-layer-1, #111820);
}
.fp-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.fp-brandmark {
  width: 37px; height: 37px; flex: 0 0 auto;
  display: grid; place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(244,176,74,.35);
  background: linear-gradient(145deg, #1b2b3d 0%, #0a121d 100%);
  box-shadow: 0 5px 18px rgba(0,0,0,.22);
}
.fp-brandtext { min-width: 0; }
.fp-title { margin: 0; font-size: 16px; line-height: 1.15; font-weight: 720; letter-spacing: -.01em; }
.fp-tagline { margin: 3px 0 0; font-size: 11px; line-height: 1.2; color: var(--dsw-alias-label-secondary, #93a2b5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fp-top-meta { margin-left: auto; display: flex; align-items: center; gap: 9px; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #93a2b5); min-width: 0; }
.fp-live { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.fp-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fp-teal); box-shadow: 0 0 0 3px rgba(99,230,213,.12); }
.fp-key { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 5px; padding: 2px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary, #93a2b5); background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.04)); }
.fp-time-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.04)); white-space: nowrap; }
.fp-time-chip svg { color: var(--fp-teal); opacity: .9; }
.fp-time-chip[data-day="true"] svg { color: var(--fp-amber); }
.fp-time-value { font-size: 10.5px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #dfe9f5); }
.fp-time-zone { font-size: 9.5px; color: var(--dsw-alias-label-secondary, #8797aa); }

.fp-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(310px, 370px) minmax(0, 1fr); }
.fp-side {
  min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
  background: var(--dsw-alias-bg-base, #0b1017);
}
.fp-search-wrap { flex: 0 0 auto; padding: 15px 15px 10px; }
.fp-search {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 5px 5px 11px;
  border-radius: 13px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.17));
  background: var(--dsw-alias-bg-layer-1, #121a24);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.fp-search:focus-within { border-color: var(--dsw-alias-brand-primary, #4f8cff); box-shadow: 0 0 0 3px rgba(79,140,255,.14); }
.fp-search svg { flex: 0 0 auto; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-input {
  flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent;
  color: var(--dsw-alias-label-primary, #e7edf5); font: inherit; font-size: 12.5px; padding: 8px 2px;
}
.fp-input::placeholder { color: var(--dsw-alias-label-secondary, #7d8da2); opacity: .9; }
.fp-submit {
  flex: 0 0 auto; appearance: none; border: 0; border-radius: 9px; cursor: pointer;
  min-width: 58px; padding: 8px 12px; font: inherit; font-size: 12px; font-weight: 650;
  color: #fff; background: var(--dsw-alias-brand-primary, #3d7eff);
}
.fp-submit:disabled { cursor: default; opacity: .58; }
.fp-submit[data-busy="true"] { min-width: 64px; }
.fp-quick { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.fp-quick-label { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--dsw-alias-label-secondary, #7d8da2); margin-right: 1px; }
.fp-chip {
  appearance: none; cursor: pointer; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
  background: transparent; color: var(--dsw-alias-label-secondary, #93a2b5);
  border-radius: 999px; padding: 4px 9px; font: inherit; font-size: 11px;
}
.fp-chip:hover { color: var(--dsw-alias-label-primary, #e7edf5); border-color: var(--dsw-alias-border-l2, rgba(255,255,255,.22)); }
.fp-msg { margin: 8px 1px 0; font-size: 11px; line-height: 1.45; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-msg[data-kind="error"] { color: var(--dsw-alias-state-error-primary, #e06b5e); }
.fp-msg[data-kind="warn"] { color: var(--dsw-alias-state-warn-primary, #d49b36); }

.fp-side-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px 15px 24px; scrollbar-width: thin; }
.fp-side-scroll::-webkit-scrollbar { width: 8px; }
.fp-side-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2, rgba(255,255,255,.16)); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }

.fp-results { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); border-radius: 12px; overflow: hidden; background: var(--dsw-alias-bg-layer-1, #121a24); margin: 0 0 12px; }
.fp-results-head { display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); font-size: 10.5px; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-results-head strong { color: var(--dsw-alias-label-primary, #e7edf5); font-weight: 600; }
.fp-results-close { margin-left: auto; appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #93a2b5); cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; }
.fp-result { width: 100%; display: flex; align-items: flex-start; gap: 9px; padding: 9px 10px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.06)); background: transparent; text-align: left; color: inherit; cursor: pointer; font: inherit; }
.fp-result:last-child { border-bottom: 0; }
.fp-result:hover { background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.045)); }
.fp-result-mark { flex: 0 0 auto; width: 21px; height: 21px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center; background: var(--fp-amber-soft); color: var(--fp-amber); font-size: 9px; font-weight: 700; border: 1px solid rgba(244,176,74,.28); }
.fp-result-body { min-width: 0; }
.fp-result-name { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.35; color: var(--dsw-alias-label-primary, #e7edf5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-result-sub { display: block; margin-top: 2px; font-size: 10.5px; line-height: 1.4; color: var(--dsw-alias-label-secondary, #93a2b5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.fp-empty-card { border: 1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.17)); border-radius: 13px; padding: 15px; margin-top: 8px; background: linear-gradient(150deg, var(--dsw-alias-bg-layer-1, #121a24), transparent); }
.fp-empty-title { margin: 0 0 6px; font-size: 13px; font-weight: 650; }
.fp-empty-body { margin: 0; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-empty-tip { margin: 10px 0 0; font-size: 10.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #7d8da2); }

.fp-detail { min-width: 0; }
.fp-hero, .fp-hero-fallback { width: 100%; height: 140px; border-radius: 13px; margin-bottom: 13px; object-fit: cover; display: block; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05)); }
.fp-hero-fallback { display: grid; place-items: center; background: radial-gradient(circle at 30% 20%, #34526c 0%, #101b28 55%, #0a1119 100%); color: rgba(255,255,255,.3); font-size: 38px; font-weight: 750; letter-spacing: -.05em; }
.fp-kicker { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--dsw-alias-brand-primary, #6ba0ff); }
.fp-kicker-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px rgba(107,160,255,.12); }
.fp-place-name { margin: 7px 0 0; font-size: 24px; line-height: 1.18; font-weight: 750; letter-spacing: -.025em; color: var(--dsw-alias-label-primary, #eef4fa); }
.fp-place-sub { margin: 4px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.fp-tag { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); border-radius: 999px; padding: 3px 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-coord { display: flex; align-items: center; gap: 8px; margin: 11px 0 0; padding: 7px 9px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.045)); }
.fp-coord-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; letter-spacing: .01em; color: var(--dsw-alias-label-secondary, #a5b3c4); }
.fp-copy { margin-left: auto; appearance: none; border: 0; background: transparent; color: var(--dsw-alias-brand-primary, #6ba0ff); cursor: pointer; font: inherit; font-size: 10.5px; padding: 1px 2px; white-space: nowrap; }
.fp-copy:hover { text-decoration: underline; }
.fp-notice { margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--fp-amber-soft); border: 1px solid rgba(244,176,74,.24); color: var(--dsw-alias-label-secondary, #c9b28e); font-size: 10.5px; line-height: 1.55; }
.fp-intro-block { margin-top: 15px; }
.fp-section-title { margin: 0 0 7px; font-size: 11px; font-weight: 650; letter-spacing: .045em; text-transform: uppercase; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-intro { margin: 0; font-size: 12.5px; line-height: 1.78; color: var(--dsw-alias-label-primary, #dbe5f0); white-space: pre-line; }
.fp-attractions-head { display: flex; align-items: baseline; gap: 7px; margin: 17px 0 8px; }
.fp-attractions-head .fp-section-title { margin: 0; }
.fp-attractions-count { margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-secondary, #7d8da2); }
.fp-attractions { display: flex; flex-direction: column; gap: 7px; }
.fp-attraction { width: 100%; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 9px; align-items: start; padding: 8px; border-radius: 11px; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.1)); background: var(--dsw-alias-bg-layer-1, #121a24); color: inherit; text-align: left; cursor: pointer; font: inherit; transition: border-color .14s ease, transform .14s ease, background .14s ease; }
.fp-attraction:hover { border-color: var(--dsw-alias-border-l2, rgba(255,255,255,.23)); transform: translateY(-1px); }
.fp-attraction[data-active="true"] { border-color: rgba(244,176,74,.7); box-shadow: 0 0 0 1px rgba(244,176,74,.24); background: linear-gradient(140deg, var(--fp-amber-soft), var(--dsw-alias-bg-layer-1, #121a24)); }
.fp-thumb, .fp-thumb-fallback { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; display: block; background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05)); }
.fp-thumb-fallback { display: grid; place-items: center; background: linear-gradient(135deg, rgba(99,230,213,.22), rgba(244,176,74,.2)); color: rgba(255,255,255,.72); font-size: 17px; font-weight: 700; }
.fp-attraction-body { min-width: 0; }
.fp-attraction-top { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.fp-attraction-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-primary, #e7edf5); }
.fp-attraction-distance { margin-left: auto; flex: 0 0 auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary, #7d8da2); font-variant-numeric: tabular-nums; }
.fp-attraction-desc { margin: 4px 0 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 10.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-muted { margin: 5px 0 0; font-size: 11px; line-height: 1.55; color: var(--dsw-alias-label-secondary, #93a2b5); }
.fp-source { margin-top: 16px; padding-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l1, rgba(255,255,255,.12)); font-size: 10px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #7d8da2); }
.fp-source a { color: var(--dsw-alias-brand-primary, #6ba0ff); text-decoration: none; }
.fp-source a:hover { text-decoration: underline; }
.fp-source-line + .fp-source-line { margin-top: 2px; }

.fp-globe { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: radial-gradient(circle at 52% 42%, #0a1a2c 0%, #040a12 58%, #02050a 100%); }
.fp-cesium { position: absolute; inset: 0; }
.fp-cesium .cesium-viewer, .fp-cesium .cesium-viewer-cesiumWidgetContainer, .fp-cesium .cesium-widget, .fp-cesium .cesium-widget canvas { width: 100%; height: 100%; }
.fp-cesium .cesium-widget-credits { font-size: 9px; opacity: .62; right: 10px; bottom: 7px; left: auto; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
.fp-cesium .cesium-credit-textContainer, .fp-cesium .cesium-credit-expand-link, .fp-cesium .cesium-credit-logoContainer { color: rgba(230,240,252,.7) !important; }
.fp-cesium .cesium-credit-expand-link { border-left-color: rgba(230,240,252,.3) !important; }
.fp-cesium .cesium-performanceDisplay-defaultContainer { display: none; }
.fp-globe::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(ellipse at 50% 45%, transparent 48%, rgba(0,3,8,.48) 100%); }
.fp-hud { position: absolute; z-index: 2; top: 14px; left: 16px; display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.13); background: rgba(6,14,24,.7); backdrop-filter: blur(10px); color: rgba(231,240,250,.86); font-size: 10.5px; letter-spacing: .015em; pointer-events: none; }
.fp-hud-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--fp-teal); box-shadow: 0 0 0 3px rgba(99,230,213,.12); }
.fp-loc-hud { position: absolute; z-index: 3; right: 16px; top: 14px; width: min(300px, calc(100% - 32px)); display: flex; align-items: flex-start; gap: 9px; padding: 9px 11px; border-radius: 11px; border: 1px solid rgba(255,255,255,.13); background: rgba(6,14,24,.72); backdrop-filter: blur(12px); color: rgba(231,240,250,.9); pointer-events: none; box-shadow: 0 8px 28px rgba(0,0,0,.18); }
.fp-loc-mark { width: 22px; height: 22px; flex: 0 0 auto; margin-top: 1px; border-radius: 50%; border: 1px solid rgba(244,176,74,.45); background: rgba(244,176,74,.12); display: grid; place-items: center; }
.fp-loc-mark span { width: 7px; height: 7px; border-radius: 50%; background: var(--fp-amber); box-shadow: 0 0 0 3px rgba(244,176,74,.12); }
.fp-loc-body { min-width: 0; flex: 1 1 auto; }
.fp-loc-name { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.35; font-weight: 650; color: #f0f7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fp-loc-name::after { content: ''; width: 5px; height: 5px; flex: 0 0 auto; border-radius: 50%; background: var(--fp-teal); opacity: 0; }
.fp-loc-hud[data-loading="true"] .fp-loc-name::after { opacity: .9; animation: fp-pulse 1.1s ease-in-out infinite; }
.fp-loc-detail { margin-top: 2px; font-size: 10px; line-height: 1.35; color: rgba(220,235,250,.58); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fp-loc-coord { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 1.3; color: rgba(220,235,250,.78); letter-spacing: .01em; font-variant-numeric: tabular-nums; }
@keyframes fp-pulse { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
.fp-map-attribution { position: absolute; z-index: 2; left: 16px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 10px; max-width: calc(100% - 120px); font-size: 9px; line-height: 1.4; color: rgba(226,238,250,.52); pointer-events: none; }
.fp-map-attribution a { color: inherit; pointer-events: auto; }

.fp-welcome { position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; pointer-events: none; background: linear-gradient(180deg, rgba(2,7,13,.02) 30%, rgba(2,7,13,.5) 100%); }
.fp-welcome-eyebrow { font-size: 10px; font-weight: 650; letter-spacing: .22em; color: var(--fp-amber); }
.fp-welcome-title { margin: 11px 0 0; font-size: clamp(27px, 4vw, 46px); line-height: 1.08; letter-spacing: -.035em; font-weight: 760; color: #f4f8fd; text-shadow: 0 4px 26px rgba(0,0,0,.38); }
.fp-welcome-sub { max-width: 480px; margin: 13px 0 0; font-size: 12.5px; line-height: 1.7; color: rgba(224,235,247,.72); }
.fp-starters { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 20px; pointer-events: auto; }
.fp-starter { appearance: none; cursor: pointer; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(10,20,32,.56); backdrop-filter: blur(10px); color: rgba(241,247,253,.9); padding: 7px 13px; font: inherit; font-size: 11.5px; transition: background .15s ease, border-color .15s ease; }
.fp-starter:hover { background: rgba(244,176,74,.18); border-color: rgba(244,176,74,.5); }
.fp-welcome-hint { margin-top: 15px; font-size: 10.5px; letter-spacing: .02em; color: rgba(224,235,247,.46); }

.fp-globe-status { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: radial-gradient(circle at 50% 45%, #0b1d30 0%, #03080f 72%); color: rgba(231,240,250,.82); text-align: center; padding: 24px; }
.fp-spinner { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.16); border-top-color: var(--fp-amber); animation: fp-spin .85s linear infinite; }
.fp-status-title { font-size: 12px; font-weight: 550; letter-spacing: .02em; }
.fp-status-detail { max-width: 360px; font-size: 10.5px; line-height: 1.55; color: rgba(231,240,250,.5); overflow-wrap: anywhere; }
.fp-retry { appearance: none; cursor: pointer; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.07); color: #fff; border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 11.5px; }
.fp-retry:hover { background: rgba(244,176,74,.16); border-color: rgba(244,176,74,.5); }
@keyframes fp-spin { to { transform: rotate(360deg); } }

.fp-detail-loading { display: flex; flex-direction: column; gap: 9px; padding-top: 4px; }
.fp-skeleton { border-radius: 9px; background: linear-gradient(90deg, var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05)) 0%, var(--dsw-alias-bg-layer-1, rgba(255,255,255,.1)) 45%, var(--dsw-alias-bg-layer-2, rgba(255,255,255,.05)) 100%); background-size: 220% 100%; animation: fp-shimmer 1.25s ease-in-out infinite; }
.fp-skeleton-hero { height: 132px; border-radius: 13px; }
.fp-skeleton-title { height: 24px; width: 54%; }
.fp-skeleton-line { height: 11px; width: 100%; }
.fp-skeleton-line.short { width: 72%; }
@keyframes fp-shimmer { from { background-position: 140% 0; } to { background-position: -40% 0; } }

@media (max-width: 900px) {
  .fp-top-meta { display: none; }
  .fp-body { grid-template-columns: 1fr; grid-template-rows: minmax(250px, 43%) minmax(280px, 1fr); }
  .fp-side { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); }
  .fp-globe { min-height: 280px; }
  .fp-brandmark { width: 33px; height: 33px; border-radius: 10px; }
}
@media (max-width: 560px) {
  .fp-top { padding: 9px 13px; }
  .fp-search-wrap { padding: 12px 12px 8px; }
  .fp-side-scroll { padding: 0 12px 20px; }
  .fp-welcome-sub { font-size: 11.5px; }
  .fp-welcome-hint { display: none; }
  .fp-loc-hud { right: 10px; top: 10px; width: min(245px, calc(100% - 20px)); }
  .fp-loc-detail { display: none; }
}
`

    let cesiumTimer = null

    function loadCesium() {
      if (window.Cesium) return Promise.resolve(window.Cesium)
      if (window.__footprintCesiumPromise) return window.__footprintCesiumPromise
      window.CESIUM_BASE_URL = VENDOR
      const promise = new Promise((resolve, reject) => {
        const finish = () => {
          if (cesiumTimer) window.clearTimeout(cesiumTimer)
          if (window.Cesium) resolve(window.Cesium)
          else reject(new Error('Cesium global was not created'))
        }
        const fail = () => {
          if (cesiumTimer) window.clearTimeout(cesiumTimer)
          reject(new Error('Cesium script failed to load'))
        }
        if (!document.querySelector('link[data-footprint-cesium-css]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = `${VENDOR}Widgets/widgets.css`
          link.dataset.footprintCesiumCss = 'true'
          document.head.appendChild(link)
        }
        let script = document.querySelector('script[data-footprint-cesium-js]')
        if (script) {
          script.addEventListener('load', finish, { once: true })
          script.addEventListener('error', fail, { once: true })
        } else {
          script = document.createElement('script')
          script.src = `${VENDOR}Cesium.js`
          script.async = true
          script.dataset.footprintCesiumJs = 'true'
          script.addEventListener('load', finish, { once: true })
          script.addEventListener('error', fail, { once: true })
          document.head.appendChild(script)
        }
        if (window.Cesium) {
          finish()
          return
        }
        cesiumTimer = window.setTimeout(fail, 30000)
      })
      window.__footprintCesiumPromise = promise.catch((error) => {
        window.__footprintCesiumPromise = null
        const script = document.querySelector('script[data-footprint-cesium-js]')
        if (script) script.remove()
        throw error
      })
      return window.__footprintCesiumPromise
    }

    function FootprintIcon({ size = 20, active = false }) {
      const stroke = active ? 'var(--dsw-alias-brand-primary, #3d7eff)' : 'currentColor'
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('circle', {
          cx: 11,
          cy: 10.5,
          r: 7.1,
          stroke,
          strokeWidth: 1.45,
        }),
        h('ellipse', {
          cx: 11,
          cy: 10.5,
          rx: 3.2,
          ry: 7.1,
          stroke,
          strokeWidth: 1.2,
          opacity: 0.72,
        }),
        h('path', {
          d: 'M4.1 10.5h13.8M5.4 6.3c3.4 1.5 8.2 1.5 11.2 0M5.4 14.7c3.4-1.5 8.2-1.5 11.2 0',
          stroke,
          strokeWidth: 1.12,
          strokeLinecap: 'round',
          opacity: 0.72,
        }),
        h('path', {
          d: 'M17.4 13.3c3 0 5.4 2 5.4 4.5 0 3.2-5.4 6.2-5.4 6.2s-5.4-3-5.4-6.2c0-2.5 2.4-4.5 5.4-4.5z',
          fill: active ? 'var(--dsw-alias-brand-primary, #3d7eff)' : '#f4b04a',
          stroke: '#0a121d',
          strokeWidth: 1.2,
          strokeLinejoin: 'round',
        }),
        h('circle', {
          cx: 17.4,
          cy: 17.7,
          r: 1.45,
          fill: '#0a121d',
        }),
      )
    }

    function SearchIcon() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 10.8, cy: 10.8, r: 6.2, stroke: 'currentColor', strokeWidth: 1.8 }),
        h('path', {
          d: 'M15.4 15.4l4.4 4.4',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
        }),
      )
    }

    function useActiveLocale(locale) {
      const subscribe = React.useCallback((callback) => locale.subscribe(callback), [locale])
      const getSnapshot = React.useCallback(() => locale.getSnapshot(), [locale])
      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    function useLocalClock() {
      const [now, setNow] = React.useState(() => new Date())
      React.useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000)
        return () => window.clearInterval(timer)
      }, [])
      return now
    }

    function DayNightIcon({ day, size = 13 }) {
      if (day) {
        return h(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            'aria-hidden': 'true',
          },
          h('circle', {
            cx: 12,
            cy: 12,
            r: 4.1,
            stroke: 'currentColor',
            strokeWidth: 1.7,
          }),
          h('path', {
            d: 'M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M5.1 5.1l1.5 1.5M17.4 17.4l1.5 1.5M18.9 5.1l-1.5 1.5M6.6 17.4l-1.5 1.5',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
          }),
        )
      }
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M20.2 14.4A8.4 8.4 0 0 1 9.6 3.8 8.5 8.5 0 1 0 20.2 14.4z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
      )
    }

    function LocalTimeChip({ lang, t }) {
      const now = useLocalClock()
      const locale = lang === 'zh' ? 'zh-CN' : 'en-GB'
      const time = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now)
      const zone =
        new Intl.DateTimeFormat(locale, { timeZoneName: 'short' })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value || ''
      const full = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(now)
      const day = now.getHours() >= 6 && now.getHours() < 18
      return h(
        'span',
        {
          className: 'fp-time-chip',
          'data-day': day ? 'true' : 'false',
          title: `${t('time.local')} · ${full}`,
          'aria-label': `${t('time.local')} ${time} ${zone}`,
        },
        h(DayNightIcon, { day }),
        h('span', { className: 'fp-time-value' }, time),
        zone ? h('span', { className: 'fp-time-zone' }, zone) : null,
      )
    }

    function formatDistance(km, t) {
      if (typeof km !== 'number' || Number.isNaN(km)) return ''
      if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} ${t('distance.m')}`
      return `${km.toFixed(1)} ${t('distance.km')}`
    }

    function formatLatLon(lat, lon, lang) {
      const ns = lat >= 0 ? 'N' : 'S'
      const ew = lon >= 0 ? 'E' : 'W'
      const latText = Math.abs(lat).toFixed(4)
      const lonText = Math.abs(lon).toFixed(4)
      if (lang === 'zh') {
        return `${lat >= 0 ? '北纬' : '南纬'} ${latText}° · ${lon >= 0 ? '东经' : '西经'} ${lonText}°`
      }
      return `${latText}° ${ns} · ${lonText}° ${ew}`
    }

    function kindLabel(kind, t) {
      const key = `kind.${String(kind || '').toLowerCase()}`
      const label = t(key)
      return label === key ? t('kind.place') : label
    }

    function SmartImage({ src, alt, className, fallback }) {
      const [broken, setBroken] = React.useState(false)
      React.useEffect(() => {
        setBroken(false)
      }, [src])
      if (!src || broken) {
        return h('div', { className: `${className}-fallback`, 'aria-hidden': 'true' }, fallback || '·')
      }
      return h('img', {
        className,
        src,
        alt,
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setBroken(true),
      })
    }

    function bodyAtmosphere(Cesium, viewer) {
      const scene = viewer.scene
      // Use the device pixel ratio instead of Cesium's default CSS-resolution
      // canvas, so imagery and labels stay sharp on 1.5x/2x displays.
      try {
        const dpr = window.devicePixelRatio || 1
        const widget = viewer.cesiumWidget
        if (widget) {
          widget.useBrowserRecommendedResolution = false
          widget.resolutionScale = Math.min(1, 2 / dpr)
        }
      } catch {
        // The canvas still renders at the default resolution if this is unavailable.
      }
      scene.backgroundColor = Cesium.Color.fromCssColorString('#02050a')
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#071626')
      scene.globe.showGroundAtmosphere = true
      scene.globe.enableLighting = true
      scene.globe.dynamicAtmosphereLighting = true
      scene.globe.dynamicAtmosphereLightingFromSun = true
      scene.globe.depthTestAgainstTerrain = false
      scene.globe.maximumScreenSpaceError = 1.1
      scene.globe.tileCacheSize = 320
      scene.globe.preloadAncestors = true
      scene.globe.preloadSiblings = true
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = true
        scene.skyAtmosphere.brightnessShift = 0.18
        scene.skyAtmosphere.saturationShift = 0.08
      }
      if (scene.fog) {
        scene.fog.enabled = true
        scene.fog.density = 0.00016
      }
      if (scene.screenSpaceCameraController) {
        scene.screenSpaceCameraController.minimumZoomDistance = 500
        scene.screenSpaceCameraController.maximumZoomDistance = 60000000
        scene.screenSpaceCameraController.inertiaSpin = 0.82
        scene.screenSpaceCameraController.inertiaTranslate = 0.82
        scene.screenSpaceCameraController.inertiaZoom = 0.76
      }
      if (scene.postProcessStages?.fxaa) scene.postProcessStages.fxaa.enabled = true
      try {
        const credits = viewer.cesiumWidget?.creditContainer
        if (credits) {
          credits.style.opacity = '0.6'
          credits.style.fontSize = '9px'
          credits.style.zIndex = '2'
        }
      } catch {
        // Cesium's DOM is version-specific; the credits remain usable without these tweaks.
      }
    }

    function clearGlobeEntities(viewer, markerRef, attractionsRef) {
      if (!viewer || viewer.isDestroyed()) return
      try {
        if (markerRef.current) viewer.entities.remove(markerRef.current)
        for (const entity of attractionsRef.current || []) viewer.entities.remove(entity)
      } catch {
        // Entities can already be gone when a new viewer replaced the old one.
      }
      markerRef.current = null
      attractionsRef.current = []
    }

    function altitudeFor(place) {
      const kind = String(place.kind || '').toLowerCase()
      if (/country|sovereign/.test(kind)) return 2600000
      if (/state|province|region|county/.test(kind)) return 620000
      if (/city|town|municipality|village|hamlet/.test(kind)) return 170000
      if (/museum|attraction|monument|park|building|tourism/.test(kind)) return 18000
      return 48000
    }

    function radiusFor(place) {
      const kind = String(place.kind || '').toLowerCase()
      if (/country|sovereign/.test(kind)) return 260000
      if (/state|province|region|county/.test(kind)) return 70000
      if (/city|town|municipality|village|hamlet/.test(kind)) return 26000
      return 1600
    }

    function paintPlace(Cesium, viewer, place, markerRef, attractionsRef) {
      clearGlobeEntities(viewer, markerRef, attractionsRef)
      if (!place) return
      const position = Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 0)
      const radius = radiusFor(place)
      const marker = viewer.entities.add({
        position,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#f4b04a'),
          outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: Cesium.Color.fromCssColorString('#f4b04a').withAlpha(0.14),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f4b04a').withAlpha(0.55),
          outlineWidth: 1.4,
          height: 0,
        },
        label: {
          text: place.name,
          font: '600 14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#ffffff'),
          outlineColor: Cesium.Color.fromCssColorString('#06101c'),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#071424').withAlpha(0.76),
          backgroundPadding: new Cesium.Cartesian2(9, 5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      markerRef.current = marker

      const entities = []
      for (const attraction of place.attractions || []) {
        if (!Number.isFinite(attraction.lat) || !Number.isFinite(attraction.lon)) continue
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(attraction.lon, attraction.lat, 0),
          point: {
            pixelSize: 7,
            color: Cesium.Color.fromCssColorString('#63e6d5'),
            outlineColor: Cesium.Color.fromCssColorString('#06212a'),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: attraction.name,
            font: '500 11px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#d9fff9'),
            outlineColor: Cesium.Color.fromCssColorString('#06101c'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 850000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
        entity.footprintAttractionId = attraction.id
        entities.push(entity)
      }
      attractionsRef.current = entities

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, altitudeFor(place)),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0,
        },
        duration: 2.15,
      })
      if (viewer.scene?.requestRender) viewer.scene.requestRender()
    }

    function useGlobe(containerRef, detail, onPickAttraction) {
      const [status, setStatus] = React.useState('loading')
      const [error, setError] = React.useState('')
      const [attempt, setAttempt] = React.useState(0)
      const viewerRef = React.useRef(null)
      const markerRef = React.useRef(null)
      const attractionsRef = React.useRef([])
      const detailRef = React.useRef(detail)
      const pickRef = React.useRef(onPickAttraction)

      React.useEffect(() => {
        detailRef.current = detail
      }, [detail])
      React.useEffect(() => {
        pickRef.current = onPickAttraction
      }, [onPickAttraction])

      React.useEffect(() => {
        let disposed = false
        let viewer = null
        let handler = null
        let observer = null
        let detailLayer = null
        let updateDetailLayer = null
        setStatus('loading')
        setError('')
        loadCesium()
          .then((Cesium) => {
            if (disposed || !containerRef.current) return
            viewer = new Cesium.Viewer(containerRef.current, {
              animation: false,
              timeline: false,
              baseLayerPicker: false,
              geocoder: false,
              homeButton: false,
              sceneModePicker: false,
              navigationHelpButton: false,
              fullscreenButton: false,
              infoBox: false,
              selectionIndicator: false,
              shouldAnimate: true,
              baseLayer: false,
              terrainProvider: new Cesium.EllipsoidTerrainProvider(),
            })
            viewerRef.current = viewer
            containerRef.current.__footprintViewer = viewer
            bodyAtmosphere(Cesium, viewer)

            // Drive the terminator from the user's actual local clock. Cesium
            // uses UTC internally, but the instant is the same; the browser's
            // timezone offset only decides which meridian the initial camera
            // faces (an approximate local meridian).
            const now = new Date()
            viewer.clock.currentTime = Cesium.JulianDate.fromDate(now)
            viewer.clock.shouldAnimate = true
            viewer.clock.multiplier = 1
            if (Cesium.SunLight) viewer.scene.light = new Cesium.SunLight()
            const rawMeridian = -now.getTimezoneOffset() / 4
            const localMeridian = ((rawMeridian + 540) % 360) - 180
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(localMeridian, 20, 21500000),
              orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
            })
            const providerPromise =
              Cesium.TileMapServiceImageryProvider?.fromUrl
                ? Cesium.TileMapServiceImageryProvider.fromUrl(
                    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
                  )
                : Promise.reject(new Error('TMS provider unavailable'))
            providerPromise
              .then((provider) => {
                if (disposed || viewer.isDestroyed()) return
                // Keep the offline Natural Earth layer underneath, so the
                // high-resolution layer can fail without leaving a blank globe.
                viewer.imageryLayers.addImageryProvider(provider, 0)
              })
              .catch(() => {
                // The ellipsoid base color still gives a usable globe if tiles are unavailable.
              })

            // The detail layer fades in as the camera descends. Cesium then
            // selects the appropriate imagery level for the screen automatically,
            // so the visible region gains detail instead of stretching the
            // low-resolution Natural Earth texture.
            //
            // We use Esri World Imagery rather than the public OSM tile server:
            // OSM blocks embedded apps that do not present a policy-compliant
            // Referer, and returns an "Access blocked" placeholder even when the
            // HTTP status is 200. Esri's imagery service serves the same kind of
            // zoom-dependent tiles without that referer dependency.
            try {
              const detailProvider = new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                minimumLevel: 0,
                maximumLevel: 19,
                credit: new Cesium.Credit(
                  'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
                ),
              })
              detailLayer = viewer.imageryLayers.addImageryProvider(detailProvider)
              detailLayer.alpha = 0
              detailLayer.show = false
            } catch {
              detailLayer = null
            }

            // NASA GIBS city lights appear only on the globe's night side
            // (dayAlpha 0 / nightAlpha 1). Cesium's lighting shader blends this
            // layer from the SunLight terminator automatically.
            try {
              const nightProvider = new Cesium.UrlTemplateImageryProvider({
                url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
                minimumLevel: 0,
                maximumLevel: 8,
                credit: new Cesium.Credit('NASA Earth Observatory / GIBS'),
              })
              const nightLayer = viewer.imageryLayers.addImageryProvider(nightProvider)
              nightLayer.dayAlpha = 0
              nightLayer.nightAlpha = 0.9
              nightLayer.brightness = 1.15
            } catch {
              // Day/night shading still works without the optional city-light layer.
            }

            updateDetailLayer = () => {
              if (!detailLayer || viewer.isDestroyed()) return
              try {
                const height = viewer.camera.positionCartographic.height
                if (!Number.isFinite(height)) return
                const alpha = Cesium.Math.clamp((9_000_000 - height) / 3_500_000, 0, 1)
                detailLayer.alpha = alpha
                detailLayer.show = alpha > 0.015
                if (detailLayer.show) viewer.scene.requestRender()
              } catch {
                // A camera read during teardown is harmless.
              }
            }
            viewer.camera.percentageChanged = 0.002
            viewer.camera.changed.addEventListener(updateDetailLayer)
            updateDetailLayer()

            handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
            handler.setInputAction((movement) => {
              try {
                const picked = viewer.scene.pick(movement.position)
                const attractionId = picked?.id?.footprintAttractionId
                if (attractionId) pickRef.current?.(attractionId)
              } catch {
                // Picking can race with teardown; ignore.
              }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

            observer = new ResizeObserver(() => {
              try {
                if (!viewer.isDestroyed()) viewer.resize()
              } catch {
                // Ignore a resize after teardown.
              }
            })
            observer.observe(containerRef.current)
            window.setTimeout(() => {
              try {
                if (!disposed && !viewer.isDestroyed()) viewer.resize()
              } catch {
                // Ignore.
              }
            }, 80)
            setStatus('ready')
          })
          .catch((loadError) => {
            if (disposed) return
            setError(String(loadError?.message || loadError))
            setStatus('error')
          })

        return () => {
          disposed = true
          if (observer) observer.disconnect()
          if (handler) {
            try {
              handler.destroy()
            } catch {
              // Ignore.
            }
          }
          if (viewer && updateDetailLayer) {
            try {
              viewer.camera.changed.removeEventListener(updateDetailLayer)
            } catch {
              // The camera may already be disposed with the viewer.
            }
          }
          if (viewer && !viewer.isDestroyed()) {
            try {
              viewer.destroy()
            } catch {
              // Ignore.
            }
          }
          viewerRef.current = null
          markerRef.current = null
          attractionsRef.current = []
          if (containerRef.current?.__footprintViewer === viewer) {
            delete containerRef.current.__footprintViewer
          }
        }
      }, [attempt, containerRef])

      React.useEffect(() => {
        if (status !== 'ready') return
        const Cesium = window.Cesium
        const viewer = viewerRef.current
        if (!Cesium || !viewer || viewer.isDestroyed()) return
        paintPlace(Cesium, viewer, detail, markerRef, attractionsRef)
      }, [detail, status])

      const focusAttraction = React.useCallback((attraction) => {
        const Cesium = window.Cesium
        const viewer = viewerRef.current
        if (!Cesium || !viewer || viewer.isDestroyed() || !attraction) return
        if (!Number.isFinite(attraction.lat) || !Number.isFinite(attraction.lon)) return
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(attraction.lon, attraction.lat, 14000),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
          duration: 1.55,
        })
      }, [])

      return {
        status,
        error,
        retry: () => setAttempt((value) => value + 1),
        focusAttraction,
      }
    }

    function PlaceDetail({ place, t, copied, onCopy, onAttraction, activeAttraction }) {
      const attractions = Array.isArray(place.attractions) ? place.attractions : []
      const hasSource = place.source === 'wikipedia' && place.sourceUrl
      return h(
        'div',
        { className: 'fp-detail' },
        h(SmartImage, {
          src: place.thumbnail,
          alt: place.name,
          className: 'fp-hero',
          fallback: place.name?.slice(0, 1) || '·',
        }),
        h(
          'div',
          { className: 'fp-kicker' },
          h('span', { className: 'fp-kicker-dot' }),
          place.source === 'guide' ? t('place.guide') : t('place.located'),
        ),
        h('h2', { className: 'fp-place-name' }, place.name),
        place.displayName && place.displayName !== place.name
          ? h('p', { className: 'fp-place-sub' }, place.displayName)
          : null,
        h(
          'div',
          { className: 'fp-tags' },
          h('span', { className: 'fp-tag' }, kindLabel(place.kind, t)),
          place.country ? h('span', { className: 'fp-tag' }, place.country) : null,
          attractions.length
            ? h('span', { className: 'fp-tag' }, `${attractions.length} ${t('attractions.count')}`)
            : null,
        ),
        h(
          'div',
          { className: 'fp-coord' },
          h(
            'span',
            { className: 'fp-coord-value' },
            `${Number(place.lat).toFixed(4)}°, ${Number(place.lon).toFixed(4)}°`,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'fp-copy',
              onClick: onCopy,
              'aria-label': t('aria.copy'),
            },
            copied ? t('place.copied') : t('place.copy'),
          ),
        ),
        place.notice ? h('div', { className: 'fp-notice' }, place.notice) : null,
        h(
          'div',
          { className: 'fp-intro-block' },
          h('h3', { className: 'fp-section-title' }, t('place.intro')),
          h('p', { className: 'fp-intro' }, place.intro || t('place.noIntro')),
        ),
        h(
          'div',
          { className: 'fp-attractions-head' },
          h('h3', { className: 'fp-section-title' }, t('attractions.title')),
          h('span', { className: 'fp-attractions-count' }, `${attractions.length} ${t('attractions.count')}`),
        ),
        attractions.length
          ? h(
              'div',
              { className: 'fp-attractions' },
              ...attractions.map((attraction) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: attraction.id,
                    className: 'fp-attraction',
                    'data-active': attraction.id === activeAttraction ? 'true' : 'false',
                    onClick: () => onAttraction(attraction),
                    title: `${t('attractions.focus')}: ${attraction.name}`,
                    'aria-label': `${t('aria.attraction')}: ${attraction.name}`,
                  },
                  h(SmartImage, {
                    src: attraction.thumbnail,
                    alt: attraction.name,
                    className: 'fp-thumb',
                    fallback: attraction.name?.slice(0, 1) || '·',
                  }),
                  h(
                    'span',
                    { className: 'fp-attraction-body' },
                    h(
                      'span',
                      { className: 'fp-attraction-top' },
                      h('span', { className: 'fp-attraction-name' }, attraction.name),
                      h(
                        'span',
                        { className: 'fp-attraction-distance' },
                        formatDistance(attraction.distance, t),
                      ),
                    ),
                    h('span', { className: 'fp-attraction-desc' }, attraction.description),
                  ),
                ),
              ),
            )
          : h('p', { className: 'fp-muted' }, t('attractions.empty')),
        h(
          'div',
          { className: 'fp-source' },
          h(
            'div',
            { className: 'fp-source-line' },
            hasSource
              ? h(
                  'span',
                  null,
                  `${t('source.wikipedia')} · `,
                  h(
                    'a',
                    { href: place.sourceUrl, target: '_blank', rel: 'noreferrer' },
                    t('source.view'),
                  ),
                  ` · ${t('source.license')}`,
                )
              : t('source.guide'),
          ),
          h('div', { className: 'fp-source-line' }, t('source.map')),
          h(
            'div',
            { className: 'fp-source-line' },
            h(
              'a',
              {
                href: 'https://www.openstreetmap.org/copyright',
                target: '_blank',
                rel: 'noreferrer',
              },
              t('source.data'),
            ),
          ),
        ),
      )
    }

    function FootprintPanel({ t, locale }) {
      const localeSnapshot = useActiveLocale(locale)
      const lang = String(localeSnapshot?.active || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
      const globeRef = React.useRef(null)
      const sideScrollRef = React.useRef(null)
      const [query, setQuery] = React.useState('')
      const [results, setResults] = React.useState(null)
      const [searchBusy, setSearchBusy] = React.useState(false)
      const [searchError, setSearchError] = React.useState('')
      const [online, setOnline] = React.useState(true)
      const [detail, setDetail] = React.useState(null)
      const [detailBusy, setDetailBusy] = React.useState(false)
      const [detailError, setDetailError] = React.useState('')
      const [activeAttraction, setActiveAttraction] = React.useState('')
      const [copied, setCopied] = React.useState(false)
      const [cursor, setCursor] = React.useState(null)
      const [cursorPlace, setCursorPlace] = React.useState(null)
      const [reverseLoading, setReverseLoading] = React.useState(false)
      const searchAbort = React.useRef(null)
      const detailAbort = React.useRef(null)
      const candidateRef = React.useRef(null)
      const copiedTimer = React.useRef(null)
      const langRef = React.useRef(lang)
      const pointerRef = React.useRef({ inside: false, x: 0, y: 0 })
      const cursorKeyRef = React.useRef('')
      const reverseCacheRef = React.useRef(new Map())
      const reverseTimerRef = React.useRef(null)
      const reverseAbortRef = React.useRef(null)
      const pendingReverseRef = React.useRef(null)

      React.useEffect(
        () => () => {
          if (searchAbort.current) searchAbort.current.abort()
          if (detailAbort.current) detailAbort.current.abort()
          if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
          if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current)
          if (reverseAbortRef.current) reverseAbortRef.current.abort()
        },
        [],
      )

      const apiGet = React.useCallback(async (path, signal) => {
        const response = await fetch(path, {
          signal,
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
        let payload = null
        try {
          payload = await response.json()
        } catch {
          // Fall through to the HTTP status message.
        }
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`)
        }
        return payload
      }, [])

      const runReverse = React.useCallback(async () => {
        const pending = pendingReverseRef.current
        if (!pending) return
        if (reverseAbortRef.current) reverseAbortRef.current.abort()
        const controller = new AbortController()
        reverseAbortRef.current = controller
        try {
          const payload = await apiGet(
            `${API}/reverse?lat=${encodeURIComponent(pending.lat)}&lon=${encodeURIComponent(pending.lon)}&lang=${lang}`,
            controller.signal,
          )
          const place = payload.place || null
          reverseCacheRef.current.set(pending.key, place)
          if (controller.signal.aborted) return
          if (pendingReverseRef.current?.key === pending.key) {
            setCursorPlace(place)
            setReverseLoading(Boolean(reverseTimerRef.current))
          }
        } catch (error) {
          if (error?.name === 'AbortError') return
          if (pendingReverseRef.current?.key === pending.key) {
            setCursorPlace(null)
            setReverseLoading(false)
          }
        }
      }, [apiGet, lang])

      const scheduleReverse = React.useCallback(
        (lat, lon) => {
          const key = `${lang}|${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}`
          const cached = reverseCacheRef.current.get(key)
          if (cached) {
            pendingReverseRef.current = { lat, lon, key }
            if (reverseTimerRef.current) {
              window.clearTimeout(reverseTimerRef.current)
              reverseTimerRef.current = null
            }
            if (reverseAbortRef.current) reverseAbortRef.current.abort()
            setCursorPlace(cached)
            setReverseLoading(false)
            return
          }
          pendingReverseRef.current = { lat, lon, key }
          setReverseLoading(true)
          if (reverseTimerRef.current) return
          reverseTimerRef.current = window.setTimeout(() => {
            reverseTimerRef.current = null
            void runReverse()
          }, 550)
        },
        [lang, runReverse],
      )

      const openPlace = React.useCallback(
        async (candidate) => {
          if (!candidate) return
          candidateRef.current = candidate
          if (detailAbort.current) detailAbort.current.abort()
          const controller = new AbortController()
          detailAbort.current = controller
          setDetailBusy(true)
          setDetailError('')
          setDetail(null)
          setActiveAttraction('')
          setCopied(false)
          try {
            const params = new URLSearchParams({
              id: candidate.id || '',
              name: candidate.name || '',
              lat: String(candidate.lat ?? ''),
              lon: String(candidate.lon ?? ''),
              country: candidate.country || '',
              displayName: candidate.displayName || '',
              localName: candidate.localName || '',
              kind: candidate.kind || candidate.category || '',
              category: candidate.category || '',
              wikipedia: candidate.wikipedia || '',
              lang,
            })
            const payload = await apiGet(`${API}/place?${params.toString()}`, controller.signal)
            if (!controller.signal.aborted) {
              setDetail(payload.place)
              setQuery(payload.place?.name || candidate.name || '')
              setDetailBusy(false)
            }
          } catch (error) {
            if (error?.name === 'AbortError') return
            setDetailError(t('error.detail'))
            setDetailBusy(false)
          }
        },
        [apiGet, lang, t],
      )

      const runSearch = React.useCallback(
        async (term, autoOpen) => {
          const text = String(term || '').trim()
          if (!text) return
          if (searchAbort.current) searchAbort.current.abort()
          const controller = new AbortController()
          searchAbort.current = controller
          setSearchBusy(true)
          setSearchError('')
          try {
            const payload = await apiGet(
              `${API}/search?q=${encodeURIComponent(text)}&lang=${lang}`,
              controller.signal,
            )
            if (controller.signal.aborted) return
            const places = Array.isArray(payload.places) ? payload.places : []
            setOnline(payload.online !== false)
            setResults(places)
            if (autoOpen && places[0]) {
              setSearchBusy(false)
              await openPlace(places[0])
            }
          } catch (error) {
            if (error?.name === 'AbortError') return
            setSearchError(t('search.failed'))
          } finally {
            if (!controller.signal.aborted) setSearchBusy(false)
          }
        },
        [apiGet, lang, openPlace, t],
      )

      React.useEffect(() => {
        if (langRef.current === lang) return
        langRef.current = lang
        if (candidateRef.current) void openPlace(candidateRef.current)
      }, [lang, openPlace])

      React.useEffect(() => {
        if (cursor) scheduleReverse(cursor.lat, cursor.lon)
      }, [lang])

      const onGlobePick = React.useCallback((attractionId) => {
        setActiveAttraction(attractionId)
      }, [])

      const globe = useGlobe(globeRef, detail, onGlobePick)

      const selectAttraction = React.useCallback(
        (attraction) => {
          setActiveAttraction(attraction.id)
          globe.focusAttraction(attraction)
        },
        [globe],
      )

      const copyCoordinates = React.useCallback(async () => {
        if (!detail) return
        const text = `${Number(detail.lat).toFixed(5)}, ${Number(detail.lon).toFixed(5)}`
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          try {
            document.execCommand('copy')
          } catch {
            // Clipboard may be unavailable in a hardened WebView; leave the feedback unchanged.
          }
          area.remove()
        }
        setCopied(true)
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
      }, [detail])

      React.useEffect(() => {
        if (!detail) return
        const scroller = sideScrollRef.current
        if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
      }, [detail])

      React.useEffect(() => {
        const element = globeRef.current
        if (!element) return undefined
        const Cesium = window.Cesium
        if (!Cesium) return undefined
        const viewer = element.__footprintViewer
        let frame = null
        let lastCameraSample = 0

        const sample = (clientX, clientY) => {
          try {
            const rect = element.getBoundingClientRect()
            const position = new Cesium.Cartesian2(clientX - rect.left, clientY - rect.top)
            const cartesian = viewerPickPosition(element, position)
            if (!cartesian) return
            const carto = Cesium.Cartographic.fromCartesian(cartesian)
            if (!carto) return
            const lat = Cesium.Math.toDegrees(carto.latitude)
            const lon = Cesium.Math.toDegrees(carto.longitude)
            const key = `${lat.toFixed(5)},${lon.toFixed(5)}`
            if (cursorKeyRef.current === key) return
            cursorKeyRef.current = key
            setCursor({ lat, lon })
            scheduleReverse(lat, lon)
          } catch {
            // Cursor readout is decorative; never let it interrupt globe interaction.
          }
        }

        const onMove = (event) => {
          pointerRef.current.inside = true
          pointerRef.current.x = event.clientX
          pointerRef.current.y = event.clientY
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = null
            sample(pointerRef.current.x, pointerRef.current.y)
          })
        }

        const onLeave = () => {
          pointerRef.current.inside = false
          cursorKeyRef.current = ''
          setCursor(null)
          setCursorPlace(null)
          setReverseLoading(false)
          pendingReverseRef.current = null
          if (reverseTimerRef.current) {
            window.clearTimeout(reverseTimerRef.current)
            reverseTimerRef.current = null
          }
          if (reverseAbortRef.current) reverseAbortRef.current.abort()
        }

        // While the user drags or zooms, the point under a stationary pointer
        // changes too. Re-sample on camera changes so the coordinate/name readout
        // follows the actual globe, not only the last mousemove.
        const onCameraChange = () => {
          if (!pointerRef.current.inside) return
          const now = performance.now()
          if (now - lastCameraSample < 70) return
          lastCameraSample = now
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = null
            sample(pointerRef.current.x, pointerRef.current.y)
          })
        }

        element.addEventListener('mousemove', onMove)
        element.addEventListener('mouseleave', onLeave)
        if (viewer && !viewer.isDestroyed()) {
          viewer.camera.changed.addEventListener(onCameraChange)
        }
        return () => {
          if (frame) window.cancelAnimationFrame(frame)
          element.removeEventListener('mousemove', onMove)
          element.removeEventListener('mouseleave', onLeave)
          if (viewer && !viewer.isDestroyed()) {
            viewer.camera.changed.removeEventListener(onCameraChange)
          }
        }
      }, [globe.status, scheduleReverse])

      const showWelcome = !detail && !detailBusy && !detailError
      return h(
        'div',
        { className: 'fp-page' },
        h('style', null, STYLE),
        h(
          'header',
          { className: 'fp-top' },
          h(
            'div',
            { className: 'fp-brand' },
            h(
              'div',
              { className: 'fp-brandmark' },
              h(FootprintIcon, { size: 25, active: true }),
            ),
            h(
              'div',
              { className: 'fp-brandtext' },
              h('h1', { className: 'fp-title' }, t('panel.title')),
              h('p', { className: 'fp-tagline' }, t('panel.tagline')),
            ),
          ),
          h(
            'div',
            { className: 'fp-top-meta' },
            h(
              'span',
              { className: 'fp-live' },
              h('span', { className: 'fp-live-dot' }),
              t('globe.ready'),
            ),
            h(LocalTimeChip, { lang, t }),
            h('span', { className: 'fp-key' }, 'Enter'),
          ),
        ),
        h(
          'div',
          { className: 'fp-body' },
          h(
            'aside',
            { className: 'fp-side' },
            h(
              'div',
              { className: 'fp-search-wrap' },
              h(
                'form',
                {
                  className: 'fp-search',
                  onSubmit: (event) => {
                    event.preventDefault()
                    void runSearch(query, true)
                  },
                  role: 'search',
                },
                h(SearchIcon),
                h('input', {
                  className: 'fp-input',
                  type: 'text',
                  value: query,
                  placeholder: t('search.placeholder'),
                  'aria-label': t('search.placeholder'),
                  spellCheck: false,
                  autoComplete: 'off',
                  onChange: (event) => {
                    setQuery(event.target.value)
                    if (results) setResults(null)
                    if (searchError) setSearchError('')
                  },
                }),
                query
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'fp-results-close',
                        onClick: () => {
                          setQuery('')
                          setResults(null)
                          setSearchError('')
                        },
                        'aria-label': t('search.clear'),
                        title: t('search.clear'),
                      },
                      '×',
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'submit',
                    className: 'fp-submit',
                    disabled: searchBusy || !query.trim(),
                    'data-busy': searchBusy ? 'true' : 'false',
                  },
                  searchBusy ? t('search.busy') : t('search.action'),
                ),
              ),
              h(
                'div',
                { className: 'fp-quick' },
                h('span', { className: 'fp-quick-label' }, t('quick.title')),
                ...QUICK.map((item) =>
                  h(
                    'button',
                    {
                      key: item.label,
                      type: 'button',
                      className: 'fp-chip',
                      onClick: () => {
                        const label = t(item.label)
                        setQuery(label)
                        void runSearch(lang === 'zh' ? item.query : item.fallback, true)
                      },
                    },
                    t(item.label),
                  ),
                ),
              ),
              searchError
                ? h('p', { className: 'fp-msg', 'data-kind': 'error' }, searchError)
                : null,
              !online
                ? h('p', { className: 'fp-msg', 'data-kind': 'warn' }, t('search.localOnly'))
                : null,
            ),
            h(
              'div',
              { className: 'fp-side-scroll', ref: sideScrollRef },
              results && results.length
                ? h(
                    'section',
                    { className: 'fp-results', 'aria-label': t('search.results') },
                    h(
                      'div',
                      { className: 'fp-results-head' },
                      h('strong', null, t('search.results')),
                      h('span', null, `· ${results.length} ${t('search.matches')}`),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'fp-results-close',
                          onClick: () => setResults(null),
                          title: t('search.hide'),
                          'aria-label': t('search.hide'),
                        },
                        '×',
                      ),
                    ),
                    ...results.slice(0, 6).map((place) =>
                      h(
                        'button',
                        {
                          key: place.id,
                          type: 'button',
                          className: 'fp-result',
                          onClick: () => void openPlace(place),
                        },
                        h('span', { className: 'fp-result-mark' }, '●'),
                        h(
                          'span',
                          { className: 'fp-result-body' },
                          h('span', { className: 'fp-result-name' }, place.name),
                          h(
                            'span',
                            { className: 'fp-result-sub' },
                            place.displayName || place.country || '',
                          ),
                        ),
                      ),
                    ),
                  )
                : results && results.length === 0
                  ? h('p', { className: 'fp-msg' }, t('search.empty'))
                  : null,
              detailBusy
                ? h(
                    'div',
                    { className: 'fp-detail-loading', 'aria-busy': 'true' },
                    h('div', { className: 'fp-skeleton fp-skeleton-hero' }),
                    h('div', { className: 'fp-skeleton fp-skeleton-title' }),
                    h('div', { className: 'fp-skeleton fp-skeleton-line' }),
                    h('div', { className: 'fp-skeleton fp-skeleton-line short' }),
                    h('div', { className: 'fp-skeleton fp-skeleton-line' }),
                    h('div', { className: 'fp-skeleton fp-skeleton-line short' }),
                  )
                : detail
                  ? h(PlaceDetail, {
                      place: detail,
                      t,
                      copied,
                      onCopy: copyCoordinates,
                      onAttraction: selectAttraction,
                      activeAttraction,
                    })
                  : detailError
                    ? h('div', { className: 'fp-empty-card' }, h('p', { className: 'fp-msg', 'data-kind': 'error' }, detailError))
                    : h(
                        'div',
                        { className: 'fp-empty-card' },
                        h('h2', { className: 'fp-empty-title' }, t('empty.title')),
                        h('p', { className: 'fp-empty-body' }, t('empty.body')),
                        h('p', { className: 'fp-empty-tip' }, t('empty.tip')),
                      ),
            ),
          ),
          h(
            'section',
            { className: 'fp-globe', 'aria-label': t('aria.globe') },
            h('div', { className: 'fp-cesium', ref: globeRef }),
            globe.status === 'ready'
              ? h(
                  'div',
                  { className: 'fp-hud' },
                  h('span', { className: 'fp-hud-dot' }),
                  t('globe.ready'),
                )
              : null,
            cursor
              ? h(
                  'div',
                  {
                    className: 'fp-loc-hud',
                    'data-loading': reverseLoading ? 'true' : 'false',
                    'aria-live': 'polite',
                    title: cursorPlace?.displayName || '',
                  },
                  h('span', { className: 'fp-loc-mark', 'aria-hidden': 'true' }, h('span')),
                  h(
                    'div',
                    { className: 'fp-loc-body' },
                    h(
                      'div',
                      { className: 'fp-loc-name' },
                      cursorPlace?.label || (reverseLoading ? t('area.locating') : t('area.unknown')),
                    ),
                    cursorPlace?.detail
                      ? h('div', { className: 'fp-loc-detail' }, cursorPlace.detail)
                      : null,
                    h('div', { className: 'fp-loc-coord' }, formatLatLon(cursor.lat, cursor.lon, lang)),
                  ),
                )
              : null,
            showWelcome
              ? h(
                  'div',
                  { className: 'fp-welcome' },
                  h('div', { className: 'fp-welcome-eyebrow' }, t('welcome.eyebrow')),
                  h('h2', { className: 'fp-welcome-title' }, t('welcome.title')),
                  h('p', { className: 'fp-welcome-sub' }, t('welcome.sub')),
                  h(
                    'div',
                    { className: 'fp-starters' },
                    ...QUICK.map((item) =>
                      h(
                        'button',
                        {
                          key: `welcome-${item.label}`,
                          type: 'button',
                          className: 'fp-starter',
                          onClick: () => {
                            const label = t(item.label)
                            setQuery(label)
                            void runSearch(lang === 'zh' ? item.query : item.fallback, true)
                          },
                        },
                        t(item.label),
                      ),
                    ),
                  ),
                  h('div', { className: 'fp-welcome-hint' }, t('welcome.hint')),
                )
              : null,
            globe.status === 'loading'
              ? h(
                  'div',
                  { className: 'fp-globe-status' },
                  h('div', { className: 'fp-spinner' }),
                  h('div', { className: 'fp-status-title' }, t('loading.globe')),
                )
              : globe.status === 'error'
                ? h(
                    'div',
                    { className: 'fp-globe-status' },
                    h('div', { className: 'fp-status-title' }, t('globe.failed')),
                    h('div', { className: 'fp-status-detail' }, globe.error),
                    h(
                      'button',
                      { type: 'button', className: 'fp-retry', onClick: globe.retry },
                      t('globe.retry'),
                    ),
                  )
                : null,
            h(
              'div',
              { className: 'fp-map-attribution' },
              h('span', null, t('source.map')),
              h(
                'a',
                {
                  href: 'https://www.openstreetmap.org/copyright',
                  target: '_blank',
                  rel: 'noreferrer',
                },
                t('source.data'),
              ),
            ),
          ),
        ),
      )
    }

    // Pick a Cartesian position from the globe under a screen coordinate. This
    // keeps the decorative coordinate readout from touching the camera.
    function viewerPickPosition(element, position) {
      const viewer = element?.__footprintViewer
      if (!viewer || !window.Cesium) return null
      const Cesium = window.Cesium
      try {
        const ray = viewer.camera.getPickRay(position)
        return ray ? viewer.scene.globe.pick(ray, viewer.scene) : null
      } catch {
        return null
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'footprint: locale')
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'footprint',
              order: 34,
              label: () => t('panel.title'),
            },
            (props) => h(FootprintIcon, props),
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'footprint',
            },
            (props) => h(FootprintPanel, { ...props, t, locale: ctx.locale }),
          ),
        )
      },
    }
  },
})
