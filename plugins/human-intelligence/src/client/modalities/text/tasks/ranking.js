/* Text modality · web page ranking task module. */
const createTextRankingTask = ({ h, React, ui }) => {
  const { useMemo, useRef, useState } = React;
  const { Button, Icon } = ui;

  const BUCKETS = [
    { id: 'candidates', labelKey: 'task.webRanking.candidates' },
    { id: 'perfect', labelKey: 'task.webRanking.perfect' },
    { id: 'excellent', labelKey: 'task.webRanking.excellent' },
    { id: 'good', labelKey: 'task.webRanking.good' },
    { id: 'fair', labelKey: 'task.webRanking.fair' },
    { id: 'bad', labelKey: 'task.webRanking.bad' },
  ];
  const RANKED = ['perfect', 'excellent', 'good', 'fair', 'bad'];
  const QUERY_FIELDS = [
    { key: 'query', labelKey: 'task.webRanking.query' },
    { key: 'requestTime', labelKey: 'task.webRanking.requestTime' },
    { key: 'market', labelKey: 'task.webRanking.market' },
    { key: 'location', labelKey: 'task.webRanking.location' },
    { key: 'language', labelKey: 'task.webRanking.language' },
    { key: 'device', labelKey: 'task.webRanking.device' },
    { key: 'searchEngine', labelKey: 'task.webRanking.searchEngine' },
    { key: 'queryIntent', labelKey: 'task.webRanking.queryIntent' },
  ];
  const LIST_FIELDS = QUERY_FIELDS.concat([
    { key: 'candidateCount', labelKey: 'task.webRanking.candidateCount' },
  ]);
  const QUERY_FIELD_KEYS = QUERY_FIELDS.map((field) => field.key);
  const DEFAULT_QUERY_FIELDS = ['query', 'requestTime', 'market', 'location'];
  const LIST_FIELD_KEYS = LIST_FIELDS.map((field) => field.key);

  function textOf(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeCandidates(list) {
    const output = [];
    const used = new Set();
    for (const [index, raw] of (Array.isArray(list) ? list : []).entries()) {
      const candidate = typeof raw === 'string' ? { title: raw } : raw && typeof raw === 'object' ? raw : null;
      if (!candidate) continue;
      const title =
        textOf(candidate.title) ||
        textOf(candidate.name) ||
        textOf(candidate.text) ||
        textOf(candidate.label) ||
        textOf(candidate.url);
      const url = textOf(candidate.url) || textOf(candidate.link) || textOf(candidate.href);
      const body =
        textOf(candidate.body) ||
        textOf(candidate.snippet) ||
        textOf(candidate.description) ||
        textOf(candidate.content);
      if (title === '' && url === '' && body === '') continue;
      let id = textOf(candidate.id) || `c${index}`;
      while (used.has(id)) id = `${id}-${index}`;
      used.add(id);
      output.push({ id, title: title || url, url, body });
    }
    return output;
  }

  function parseItem(item) {    const raw = typeof item?.text === 'string' ? item.text : '';
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined;
    }
    if (data && typeof data === 'object') {
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.candidates)
          ? data.candidates
          : textOf(data.title) || textOf(data.url)
            ? [data]
            : null;
      if (list) {
        const candidates = normalizeCandidates(list);
        if (candidates.length > 0) {
          return {
            query: textOf(data.query) || textOf(data.name) || textOf(item?.name),
            requestTime: textOf(data.requestTime) || textOf(data.request_time),
            market: textOf(data.market) || textOf(data.category),
            location: textOf(data.location) || textOf(data.region),
            language: textOf(data.language) || textOf(data.lang) || textOf(data.locale),
            device: textOf(data.device) || textOf(data.deviceType) || textOf(data.device_type),
            searchEngine:
              textOf(data.searchEngine) || textOf(data.search_engine) || textOf(data.engine),
            queryIntent: textOf(data.queryIntent) || textOf(data.query_intent) || textOf(data.intent),
            candidates,
          };
        }
      }
    }
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      query: textOf(item?.name),
      requestTime: '',
      market: '',
      location: '',
      language: '',
      device: '',
      searchEngine: '',
      queryIntent: '',
      candidates: normalizeCandidates(lines),
    };
  }

  function selectedFieldKeys(value, allowed, fallback) {
    const selected = [];
    for (const key of Array.isArray(value) ? value : []) {
      if (typeof key !== 'string' || !allowed.includes(key) || selected.includes(key)) continue;
      selected.push(key);
    }
    return selected.length > 0 ? selected : fallback.slice();
  }

  function fieldLabel(key, t) {
    const field = LIST_FIELDS.find((entry) => entry.key === key);
    return field ? t(field.labelKey) : key;
  }

  function listView(item, index, options, t) {
    const parsed = parseItem(item);
    const values = {
      query: parsed.query,
      requestTime: parsed.requestTime,
      market: parsed.market,
      location: parsed.location,
      language: parsed.language,
      device: parsed.device,
      searchEngine: parsed.searchEngine,
      queryIntent: parsed.queryIntent,
      candidateCount: parsed.candidates.length,
    };
    const keys = selectedFieldKeys(options && options.listFields, LIST_FIELD_KEYS, ['query', 'candidateCount']);
    const entries = [];
    for (const key of keys) {
      const value = values[key];
      if (value === '' || value === null || value === undefined) continue;
      entries.push({ key, label: fieldLabel(key, t), value: String(value) });
    }
    const title = entries.length > 0 ? entries[0].value : itemDisplayName(item, index);
    const meta = entries
      .slice(1)
      .map((entry) => `${entry.label}: ${entry.value}`)
      .join(' · ');
    return { title, meta };
  }

  function emptyBuckets() {
    const output = {};
    for (const bucket of BUCKETS) output[bucket.id] = [];
    return output;
  }

  function normalizeBuckets(value, candidates) {
    const known = new Set(candidates.map((candidate) => candidate.id));
    const seen = new Set();
    const buckets = emptyBuckets();
    for (const bucket of BUCKETS) {
      const list = value && value.buckets && Array.isArray(value.buckets[bucket.id]) ? value.buckets[bucket.id] : [];
      for (const id of list) {
        if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
        seen.add(id);
        buckets[bucket.id].push(id);
      }
    }
    if (value && Array.isArray(value.order)) {
      for (const rawIndex of value.order) {
        const candidate = candidates[Number(rawIndex)];
        if (candidate && !seen.has(candidate.id)) {
          seen.add(candidate.id);
          buckets.perfect.push(candidate.id);
        }
      }
    }
    for (const candidate of candidates) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      buckets.candidates.push(candidate.id);
    }
    return buckets;
  }

  function lineCandidate(line) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length >= 2) {
      return { title: parts[0], url: parts[1], body: parts.slice(2).join(' | ') };
    }
    return { title: line };
  }

  function itemFromData(data, index, t) {
    const list = Array.isArray(data)
      ? data
      : data && Array.isArray(data.candidates)
        ? data.candidates
        : data
          ? [data]
          : [];
    const candidates = normalizeCandidates(list);
    if (candidates.length === 0) return null;
    const query = data && !Array.isArray(data) ? textOf(data.query) || textOf(data.name) : '';
    const name = query || t('task.webRanking.itemName', { index: index + 1 });
    return {
      name: name.slice(0, 60),
      text: JSON.stringify({
        query,
        requestTime: data && !Array.isArray(data) ? textOf(data.requestTime) || textOf(data.request_time) : '',
        market: data && !Array.isArray(data) ? textOf(data.market) || textOf(data.category) : '',
        location: data && !Array.isArray(data) ? textOf(data.location) || textOf(data.region) : '',
        candidates,
      }),
    };
  }

  function itemsFromJson(parsed, t) {
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && parsed.every((entry) => entry && Array.isArray(entry.candidates))) {
        return parsed.map((entry, index) => itemFromData(entry, index, t)).filter(Boolean);
      }
      return [itemFromData(parsed, 0, t)].filter(Boolean);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.items)) {
        return parsed.items.map((entry, index) => itemFromData(entry, index, t)).filter(Boolean);
      }
      return [itemFromData(parsed, 0, t)].filter(Boolean);
    }
    return [];
  }

  function Editor(props) {
    const t = props.t;
    const parsed = useMemo(() => parseItem(props.item), [props.item]);
    const candidates = parsed.candidates;
    const buckets = useMemo(() => normalizeBuckets(props.value, candidates), [props.value, candidates]);
    const byId = useMemo(() => {
      const map = new Map();
      for (const candidate of candidates) map.set(candidate.id, candidate);
      return map;
    }, [candidates]);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [dragOverCard, setDragOverCard] = useState(null);
    const dragRef = useRef(null);
    const assigned = RANKED.reduce((count, key) => count + buckets[key].length, 0);
    const total = candidates.length;
    const queryFields = selectedFieldKeys(
      props.options && props.options.queryFields,
      QUERY_FIELD_KEYS,
      QUERY_FIELD_KEYS,
    );

    function commit(nextBuckets) {
      const base = props.value && typeof props.value === 'object' ? { ...props.value } : {};
      delete base.order;
      base.buckets = nextBuckets;
      props.onChange(base);
    }

    function onDragStart(event, candidateId, fromBucket) {
      dragRef.current = { candidateId, fromBucket };
      setDragging(candidateId);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', candidateId);
      }
    }

    function onDragEnd() {
      dragRef.current = null;
      setDragging(null);
      setDragOver(null);
      setDragOverCard(null);
    }

    function drop(targetBucket, beforeId) {
      const drag = dragRef.current;
      if (!drag) return;
      const next = emptyBuckets();
      for (const bucket of BUCKETS) {
        next[bucket.id] = buckets[bucket.id].filter((id) => id !== drag.candidateId);
      }
      const list = next[targetBucket];
      const index = beforeId ? list.indexOf(beforeId) : -1;
      if (index >= 0) list.splice(index, 0, drag.candidateId);
      else list.push(drag.candidateId);
      dragRef.current = null;
      setDragging(null);
      setDragOver(null);
      setDragOverCard(null);
      commit(next);
    }

    function resetBuckets() {
      const next = emptyBuckets();
      next.candidates = candidates.map((candidate) => candidate.id);
      commit(next);
    }

    function onColumnDragOver(event, bucketId) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      if (dragOver !== bucketId) setDragOver(bucketId);
      if (dragOverCard !== null) setDragOverCard(null);
    }

    function onColumnDragLeave(event) {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setDragOver(null);
    }

    function renderCard(candidateId, position, bucketId) {
      const candidate = byId.get(candidateId);
      if (!candidate) return null;
      return h(
        'article',
        {
          key: candidateId,
          className: cx(
            'hi-wr-card',
            dragging === candidateId && 'is-dragging',
            dragOverCard === candidateId && 'is-drop-target',
          ),
          draggable: true,
          onDragStart: (event) => onDragStart(event, candidateId, bucketId),
          onDragEnd,
          onDragOver: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            if (dragOverCard !== candidateId) setDragOverCard(candidateId);
          },
          onDragLeave: (event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setDragOverCard(null);
          },
          onDrop: (event) => {
            event.preventDefault();
            event.stopPropagation();
            drop(bucketId, candidateId);
          },
        },
        h(
          'div',
          { className: 'hi-wr-card-head' },
          h('span', { className: 'hi-wr-position' }, position + 1),
          h('span', { className: 'hi-wr-title', title: candidate.title }, candidate.title),
        ),
        candidate.url
          ? h(
              'a',
              {
                className: 'hi-wr-url',
                href: candidate.url,
                target: '_blank',
                rel: 'noreferrer noopener',
                title: candidate.url,
                draggable: false,
              },
              candidate.url,
            )
          : null,
        candidate.body ? h('div', { className: 'hi-wr-body', title: candidate.body }, candidate.body) : null,
      );
    }

    return h(
      'div',
      { className: 'hi-task hi-wr-task' },
      h(
        'div',
        { className: 'hi-wr-query' },
        h('div', { className: 'hi-wr-query-title' }, t('task.webRanking.queryInfo')),
        h('hr', { className: 'hi-wr-query-divider' }),
        h(
          'div',
          { className: 'hi-wr-query-grid' },
          queryFields.map((key) =>
            h(
              'div',
              { key, className: 'hi-wr-info' },
              h('span', { className: 'hi-wr-info-label' }, fieldLabel(key, t)),
              h('span', { className: 'hi-wr-info-value' }, parsed[key] || '—'),
            ),
          ),
        ),
      ),
      total === 0
        ? h(
            'div',
            { className: 'hi-form-error' },
            h(Icon, { name: 'alert', size: 14 }),
            h('span', null, t('task.webRanking.noCandidates')),
          )
        : h(
            'div',
            { className: 'hi-wr-board' },
            BUCKETS.map((bucket) =>
              h(
                'section',
                {
                  key: bucket.id,
                  className: cx(
                    'hi-wr-column',
                    `hi-wr-${bucket.id}`,
                    dragOver === bucket.id && 'is-over',
                  ),
                  onDragOver: (event) => onColumnDragOver(event, bucket.id),
                  onDragLeave: onColumnDragLeave,
                  onDrop: (event) => {
                    event.preventDefault();
                    setDragOver(null);
                    drop(bucket.id);
                  },
                },
                h(
                  'div',
                  { className: 'hi-wr-head' },
                  h('span', null, t(bucket.labelKey)),
                  h('span', { className: 'hi-wr-count' }, buckets[bucket.id].length),
                ),
                h(
                  'div',
                  { className: 'hi-wr-items' },
                  buckets[bucket.id].length === 0
                    ? h('div', { className: 'hi-wr-empty' }, t('task.webRanking.empty'))
                    : buckets[bucket.id].map((candidateId, position) => renderCard(candidateId, position, bucket.id)),
                ),
              ),
            ),
          ),
      h(
        'div',
        { className: 'hi-wr-footer' },
        h(
          'span',
          { className: 'hi-wr-progress' },
          t('task.webRanking.assigned', { assigned, total }),
        ),
        h(
          Button,
          {
            size: 'sm',
            variant: 'ghost',
            icon: 'refresh',
            className: 'hi-wr-reset',
            disabled: assigned === 0,
            onClick: resetBuckets,
          },
          t('task.webRanking.reset'),
        ),
      ),
    );
  }

  return {
    id: 'text-ranking',
    modality: 'text',
    titleKey: 'task.webRanking.title',
    descriptionKey: 'task.webRanking.description',
    defaultInstructionKey: 'task.webRanking.instructions',
    icon: 'layers',
    options: [
      {
        key: 'queryFields',
        kind: 'multiselect',
        labelKey: 'task.webRanking.queryFields',
        hintKey: 'task.webRanking.queryFieldsHint',
        default: DEFAULT_QUERY_FIELDS,
        choices: QUERY_FIELDS.map((field) => ({ value: field.key, labelKey: field.labelKey })),
        required: true,
      },
      {
        key: 'listFields',
        kind: 'multiselect',
        labelKey: 'task.webRanking.listFields',
        hintKey: 'task.webRanking.listFieldsHint',
        default: ['query', 'candidateCount'],
        choices: LIST_FIELDS.map((field) => ({ value: field.key, labelKey: field.labelKey })),
        required: true,
      },
    ],
    itemView: (item, index, options, t) => listView(item, index, options, t),
    messages: {
      zh: {
        'task.webRanking.title': '网页排序',
        'task.webRanking.description': '将网页搜索结果拖入 Perfect / Excellent / Good / Fair / Bad 质量分组。',
        'task.webRanking.queryInfo': '查询信息',
        'task.webRanking.queryFields': 'Query Information 展示字段',
        'task.webRanking.queryFieldsHint': '选择查询信息卡中展示的字段，至少选择一项。',
        'task.webRanking.listFields': '数据列表展示字段',
        'task.webRanking.listFieldsHint': '选择数据列表中每条数据展示的字段，至少选择一项。',
        'task.webRanking.candidateCount': '候选网页数',
        'task.webRanking.query': '查询词',
        'task.webRanking.requestTime': '请求时间',
        'task.webRanking.market': '市场',
        'task.webRanking.location': '地区',
        'task.webRanking.language': '查询语言',
        'task.webRanking.device': '设备',
        'task.webRanking.searchEngine': '搜索引擎',
        'task.webRanking.queryIntent': '查询意图',
        'task.webRanking.candidates': '候选池',
        'task.webRanking.perfect': 'Perfect',
        'task.webRanking.excellent': 'Excellent',
        'task.webRanking.good': 'Good',
        'task.webRanking.fair': 'Fair',
        'task.webRanking.bad': 'Bad',
        'task.webRanking.instructions': '拖动网页卡片到不同质量分组；点击 URL 可打开网页，悬停标题或摘要可查看全文。',
        'task.webRanking.empty': '暂无网页',
        'task.webRanking.assigned': '{assigned}/{total} 已分配',
        'task.webRanking.reset': '重置分组',
        'task.webRanking.remaining': '仍有候选网页未分配，请将所有网页拖入质量分组。',
        'task.webRanking.required': '请至少对一个网页进行排序。',
        'task.webRanking.noCandidates': '这条数据没有可排序的网页。',
        'task.webRanking.summary': '{n} 个网页已排序',
        'task.webRanking.itemName': '网页排序 {index}',
        'task.webRanking.importHint':
          '粘贴 JSON：{ query, requestTime, market, location, candidates: [{ title, url, body }] }；也支持空行分组，每行按「标题 | URL | 摘要」书写。',
        'task.webRanking.importPlaceholder': '粘贴网页排序 JSON，或每组每行一个网页…',
        'task.webRanking.importCount': '将导入 {n} 组',
        'task.webRanking.importEmpty': '没有可导入的网页排序数据。',
      },
      en: {
        'task.webRanking.title': 'Web Page Ranking',
        'task.webRanking.description': 'Drag web page results into Perfect / Excellent / Good / Fair / Bad quality buckets.',
        'task.webRanking.queryInfo': 'Query information',
        'task.webRanking.queryFields': 'Query Information Fields',
        'task.webRanking.queryFieldsHint': 'Choose the fields shown in the query information card. Select at least one.',
        'task.webRanking.listFields': 'Data List Fields',
        'task.webRanking.listFieldsHint': 'Choose the fields shown for each item in the data list. Select at least one.',
        'task.webRanking.candidateCount': 'Candidates',
        'task.webRanking.query': 'Query',
        'task.webRanking.requestTime': 'Request time',
        'task.webRanking.market': 'Market',
        'task.webRanking.location': 'Location',
        'task.webRanking.language': 'Query Language',
        'task.webRanking.device': 'Device',
        'task.webRanking.searchEngine': 'Search Engine',
        'task.webRanking.queryIntent': 'Query Intent',
        'task.webRanking.candidates': 'Candidates',
        'task.webRanking.perfect': 'Perfect',
        'task.webRanking.excellent': 'Excellent',
        'task.webRanking.good': 'Good',
        'task.webRanking.fair': 'Fair',
        'task.webRanking.bad': 'Bad',
        'task.webRanking.instructions':
          'Drag web page cards into quality buckets; open a URL in a new tab, or hover a title or snippet for the full text.',
        'task.webRanking.empty': 'No pages yet',
        'task.webRanking.assigned': '{assigned}/{total} assigned',
        'task.webRanking.reset': 'Reset buckets',
        'task.webRanking.remaining': 'Some candidate pages are still unassigned. Move every page into a quality bucket.',
        'task.webRanking.required': 'Rank at least one web page.',
        'task.webRanking.noCandidates': 'This item has no pages to rank.',
        'task.webRanking.summary': '{n} pages ranked',
        'task.webRanking.itemName': 'Web ranking {index}',
        'task.webRanking.importHint':
          'Paste JSON: { query, requestTime, market, location, candidates: [{ title, url, body }] }; blank-line groups with one “title | URL | snippet” page per line are also supported.',
        'task.webRanking.importPlaceholder': 'Paste web ranking JSON, or one page per line inside each blank-line group…',
        'task.webRanking.importCount': '{n} groups will be imported',
        'task.webRanking.importEmpty': 'No web ranking data to import.',
      },
    },
    styles: `
.hi-wr-task { background: transparent; padding: 0; border-radius: 0; color: #333; font-family: Arial, sans-serif; min-height: 100%; }
.hi-wr-query { background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, .1); padding: 15px; margin: 0 0 20px; width: 100%; max-width: none; }
.hi-wr-query-title { text-align: center; font-size: 16px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
.hi-wr-query-divider { height: 2px; background-color: #007bff; margin: 10px 0; border: none; }
.hi-wr-query-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 20px; }
.hi-wr-info { display: flex; flex-direction: column; }
.hi-wr-info-label { font-size: 12px; color: #666; margin-bottom: 3px; }
.hi-wr-info-value { font-size: 14px; font-weight: bold; color: #333; overflow-wrap: anywhere; }
.hi-wr-board { display: grid; grid-template-columns: repeat(6, minmax(160px, 1fr)); grid-auto-rows: minmax(320px, 1fr); gap: 12px; overflow-x: auto; padding: 10px 0; margin-bottom: 20px; flex: 1 1 auto; min-height: 320px; }
.hi-wr-column { width: auto; background: #fff; border: 1px solid transparent; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, .1); padding: 12px; min-height: 0; max-height: max(320px, calc(100vh - 360px)); overflow: hidden; display: flex; flex-direction: column; }
.hi-wr-column.is-over { background: #e3f2fd; border-color: #2196f3; }
.hi-wr-candidates { --hi-wr-color: #6c757d; }
.hi-wr-perfect { --hi-wr-color: #28a745; }
.hi-wr-excellent { --hi-wr-color: #ffc107; }
.hi-wr-good { --hi-wr-color: #fd7e14; }
.hi-wr-fair { --hi-wr-color: #ff4500; }
.hi-wr-bad { --hi-wr-color: #dc3545; }
.hi-wr-head { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 14px; font-weight: bold; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #eee; border-bottom-color: var(--hi-wr-color); color: var(--hi-wr-color); text-align: center; }
.hi-wr-count { font-size: 11px; font-weight: 600; color: var(--hi-wr-color); opacity: .8; }
.hi-wr-items { min-height: 0; flex: 1 1 auto; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #c1c1c1 #f1f1f1; }
.hi-wr-items::-webkit-scrollbar { width: 5px; }
.hi-wr-items::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 2px; }
.hi-wr-items::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 2px; }
.hi-wr-items::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
.hi-wr-empty { color: #6c757d; font-style: italic; text-align: center; padding: 20px 10px; font-size: 12px; }
.hi-wr-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; cursor: move; transition: all .2s ease; user-select: none; box-shadow: 0 1px 2px rgba(0, 0, 0, .1); position: relative; }
.hi-wr-card:hover { box-shadow: 0 3px 8px rgba(0, 0, 0, .15); transform: translateY(-1px); }
.hi-wr-card.is-dragging { opacity: .6; transform: rotate(2deg) scale(.98); }
.hi-wr-card.is-drop-target { border-top: 2px solid #007bff; margin-top: -2px; }
.hi-wr-card-head { display: flex; align-items: center; padding: 8px 12px 4px 12px; border-bottom: 1px solid #f0f0f0; }
.hi-wr-position { background: rgba(0, 0, 0, .7); color: #fff; font-size: 10px; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 8px; flex-shrink: 0; }
.hi-wr-title { font-weight: bold; font-size: 12px; color: #333; line-height: 1.3; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-wr-url { display: block; padding: 6px 12px; font-size: 11px; color: #0066cc; background-color: #f8f9fa; border-bottom: 1px solid #f0f0f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
.hi-wr-url:hover { text-decoration: underline; color: #0056b3; }
.hi-wr-body { padding: 8px 12px; font-size: 11px; color: #666; line-height: 1.3; max-height: 50px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.hi-wr-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.hi-wr-progress { font-size: 12px; color: #666; }
.hi-wr-reset { color: #007bff !important; }
@media (max-width: 760px) {
  .hi-wr-query { padding: 12px; }
  .hi-wr-query-grid { grid-template-columns: 1fr; gap: 10px; }
  .hi-wr-board { grid-template-columns: repeat(6, minmax(150px, 1fr)); }
}
`,
    importHintKey: 'task.webRanking.importHint',
    importPlaceholderKey: 'task.webRanking.importPlaceholder',
    importCountKey: 'task.webRanking.importCount',
    parsePaste(raw, t) {
      const trimmed = String(raw || '').trim();
      if (trimmed === '') return [];
      let parsed;
      let hasJson = false;
      try {
        parsed = JSON.parse(trimmed);
        hasJson = true;
      } catch {
        hasJson = false;
      }
      if (hasJson) {
        const items = itemsFromJson(parsed, t);
        if (items.length > 0) return items;
        const failure = new Error('No web ranking data to import.');
        failure.messageKey = 'task.webRanking.importEmpty';
        throw failure;
      }
      const groups = trimmed
        .split(/\r?\n\s*\r?\n/)
        .map((group) => group.trim())
        .filter(Boolean);
      const items = [];
      for (const [index, group] of groups.entries()) {
        const lines = group
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const candidates = normalizeCandidates(lines.map(lineCandidate));
        if (candidates.length === 0) continue;
        items.push({
          name: t('task.webRanking.itemName', { index: index + 1 }),
          text: JSON.stringify({ candidates }),
        });
      }
      if (items.length === 0) {
        const failure = new Error('No web ranking data to import.');
        failure.messageKey = 'task.webRanking.importEmpty';
        throw failure;
      }
      return items;
    },
    initial: (options, item) => {
      const candidates = parseItem(item).candidates;
      return { buckets: normalizeBuckets(null, candidates) };
    },
    validate(value) {
      if (value && Array.isArray(value.order) && value.order.length > 0) return null;
      const buckets = value && value.buckets;
      if (!buckets || typeof buckets !== 'object') return 'task.webRanking.required';
      const remaining = Array.isArray(buckets.candidates) ? buckets.candidates.length : 0;
      if (remaining > 0) return 'task.webRanking.remaining';
      const assigned = RANKED.reduce(
        (count, key) => count + (Array.isArray(buckets[key]) ? buckets[key].length : 0),
        0,
      );
      return assigned > 0 ? null : 'task.webRanking.required';
    },
    summary: (value, options, t) => {
      const buckets = value && value.buckets ? value.buckets : {};
      const assigned = RANKED.reduce(
        (count, key) => count + (Array.isArray(buckets[key]) ? buckets[key].length : 0),
        0,
      );
      return t('task.webRanking.summary', { n: assigned });
    },
    Editor,
  };
};
