/* Text modality · entity tagging (span) task module. */
const createTextEntityTask = ({ h, React, ui }) => {
  const { useMemo, useRef, useState } = React;
  const { Icon, IconButton, Badge } = ui;
  const DEFAULT_TYPES = ['人名', '地名', '组织', '时间'];

  function toneFor(label) {
    return hashTone(label, 6);
  }

  function normalizeSpans(value, text, fallbackTypes) {
    const length = typeof text === 'string' ? text.length : 0;
    const source = value && Array.isArray(value.spans) ? value.spans : [];
    const cleaned = [];
    for (const candidate of source) {
      if (!candidate || typeof candidate !== 'object') continue;
      const start = Math.max(0, Math.min(length, Math.floor(Number(candidate.start))));
      const end = Math.max(start, Math.min(length, Math.floor(Number(candidate.end))));
      if (end <= start) continue;
      const label = typeof candidate.label === 'string' && candidate.label !== '' ? candidate.label : fallbackTypes[0] || '实体';
      cleaned.push({
        id: typeof candidate.id === 'string' && candidate.id !== '' ? candidate.id : uid('span'),
        start,
        end,
        label,
        text: text.slice(start, end),
      });
    }
    cleaned.sort((left, right) => left.start - right.start);
    const output = [];
    let cursor = -1;
    for (const span of cleaned) {
      if (span.start < cursor) continue;
      output.push(span);
      cursor = span.end;
    }
    return output;
  }

  function Editor(props) {
    const t = props.t;
    const containerRef = useRef(null);
    const [pending, setPending] = useState(null);
    const [error, setError] = useState('');
    const types = useMemo(
      () => readStringList(props.options, 'entityTypes', DEFAULT_TYPES),
      [props.options],
    );
    const text = typeof props.item.text === 'string' ? props.item.text : '';
    const spans = useMemo(() => normalizeSpans(props.value, text, types), [props.value, text, types]);

    function handleMouseUp() {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPending(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setPending(null);
        return;
      }
      const prefix = range.cloneRange();
      prefix.selectNodeContents(container);
      prefix.setEnd(range.startContainer, range.startOffset);
      const raw = range.toString();
      const start = prefix.toString().length;
      const leading = raw.length - raw.replace(/^\s+/, '').length;
      const trimmed = raw.trim();
      if (trimmed === '') {
        setPending(null);
        return;
      }
      setPending({ start: start + leading, end: start + leading + trimmed.length, text: trimmed });
      setError('');
    }

    function addSpan(label) {
      if (!pending) return;
      const overlaps = spans.some((span) => pending.start < span.end && pending.end > span.start);
      if (overlaps) {
        setError(t('task.textEntity.overlap'));
        return;
      }
      const next = spans
        .concat([
          {
            id: uid('span'),
            start: pending.start,
            end: pending.end,
            label,
            text: text.slice(pending.start, pending.end),
          },
        ])
        .sort((left, right) => left.start - right.start);
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges();
      setPending(null);
      setError('');
      props.onChange({ spans: next });
    }

    function removeSpan(id) {
      props.onChange({ spans: spans.filter((span) => span.id !== id) });
    }

    function changeLabel(id, label) {
      props.onChange({ spans: spans.map((span) => (span.id === id ? { ...span, label } : span)) });
    }

    const nodes = [];
    let cursor = 0;
    spans.forEach((span) => {
      if (span.start > cursor) nodes.push(text.slice(cursor, span.start));
      nodes.push(
        h(
          'mark',
          {
            key: span.id,
            className: `hi-entity-mark hi-entity-tone-${toneFor(span.label)}`,
            title: `${span.label}: ${span.text}`,
            'data-label': span.label,
          },
          text.slice(span.start, span.end),
        ),
      );
      cursor = span.end;
    });
    if (cursor < text.length) nodes.push(text.slice(cursor));

    const availableTypes = types.slice();
    for (const span of spans) if (!availableTypes.includes(span.label)) availableTypes.push(span.label);

    return h(
      'div',
      { className: 'hi-task' },
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.textEntity.source')),
          h(Badge, null, t('task.textEntity.count', { n: spans.length })),
        ),
        h(
          'div',
          {
            ref: containerRef,
            className: 'hi-text-item hi-text-body',
            onMouseUp: handleMouseUp,
          },
          nodes,
        ),
        h(
          'p',
          { className: 'hi-entity-select-hint' },
          h(Icon, { name: 'cursor', size: 13 }),
          pending ? t('task.textEntity.selected', { text: pending.text.slice(0, 40) }) : t('task.textEntity.selectHint'),
        ),
        h(
          'div',
          { className: 'hi-entity-palette' },
          h('span', { className: 'hi-palette-title' }, t('task.textEntity.types')),
          availableTypes.map((type) =>
            h(
              'button',
              {
                key: type,
                type: 'button',
                className: 'hi-label',
                disabled: !pending,
                onClick: () => addSpan(type),
              },
              h('span', { className: `hi-label-dot hi-entity-tone-${toneFor(type)}` }),
              type,
            ),
          ),
        ),
        error ? h('div', { className: 'hi-form-error', style: { marginTop: 10 } }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
      ),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.textEntity.list')),
          h(Badge, { tone: spans.length ? 'brand' : undefined }, t('task.textEntity.count', { n: spans.length })),
        ),
        spans.length === 0
          ? h('p', { className: 'hi-task-note', style: { margin: 0 } }, t('task.textEntity.empty'))
          : h(
              'div',
              { className: 'hi-entity-list' },
              spans.map((span) =>
                h(
                  'div',
                  { key: span.id, className: 'hi-entity-row' },
                  h('span', { className: `hi-label-dot hi-entity-tone-${toneFor(span.label)}` }),
                  h('span', { className: 'hi-entity-text', title: span.text }, span.text),
                  h(
                    'select',
                    {
                      className: 'hi-select',
                      value: span.label,
                      'aria-label': t('task.textEntity.type'),
                      onChange: (event) => changeLabel(span.id, event.target.value),
                    },
                    availableTypes.map((type) => h('option', { key: type, value: type }, type)),
                  ),
                  h(IconButton, {
                    icon: 'trash',
                    label: t('common.delete'),
                    className: 'hi-danger-hover',
                    onClick: () => removeSpan(span.id),
                  }),
                ),
              ),
            ),
      ),
    );
  }

  return {
    id: 'text-entity',
    modality: 'text',
    titleKey: 'task.textEntity.title',
    descriptionKey: 'task.textEntity.description',
    icon: 'cursor',
    messages: {
      zh: {
        'task.textEntity.title': '实体标注',
        'task.textEntity.description': '在文本中拖选片段，并标出人名、地名等实体。',
        'task.textEntity.source': '文本与实体',
        'task.textEntity.types': '实体类型',
        'task.textEntity.type': '实体类型',
        'task.textEntity.entityTypes': '实体类型',
        'task.textEntity.entityTypesHint': '用逗号或换行分隔，例如：人名, 地名, 组织, 时间',
        'task.textEntity.selectHint': '在文本中拖选一段文字，然后选择实体类型。',
        'task.textEntity.selected': '已选中「{text}」，选择一个类型完成标注。',
        'task.textEntity.overlap': '选中的片段与已有实体重叠，请重新选择。',
        'task.textEntity.list': '已标注实体',
        'task.textEntity.empty': '还没有实体。先在上方文本中拖选一段文字。',
        'task.textEntity.count': '{n} 个实体',
        'task.textEntity.required': '请至少标注一个实体。',
      },
      en: {
        'task.textEntity.title': 'Entity Tagging',
        'task.textEntity.description': 'Select spans of text and tag them with entity types.',
        'task.textEntity.source': 'Text and entities',
        'task.textEntity.types': 'Entity types',
        'task.textEntity.type': 'Entity type',
        'task.textEntity.entityTypes': 'Entity types',
        'task.textEntity.entityTypesHint': 'Separate types with commas or new lines, e.g. Person, Place, Organization, Time',
        'task.textEntity.selectHint': 'Drag over text to select a span, then choose an entity type.',
        'task.textEntity.selected': 'Selected “{text}”. Choose a type to finish the annotation.',
        'task.textEntity.overlap': 'The selection overlaps an existing entity. Select another span.',
        'task.textEntity.list': 'Tagged entities',
        'task.textEntity.empty': 'No entities yet. Drag over the text above to add one.',
        'task.textEntity.count': '{n} entities',
        'task.textEntity.required': 'Tag at least one entity.',
      },
    },
    styles: `
.hi-entity-palette .hi-label:disabled { opacity: .42; cursor: not-allowed; }
.hi-entity-row .hi-label-dot { width: 8px; height: 8px; border-radius: 50%; }
.hi-label-dot.hi-entity-tone-0 { background: #6366f1; }
.hi-label-dot.hi-entity-tone-1 { background: #14b8a6; }
.hi-label-dot.hi-entity-tone-2 { background: #f59e0b; }
.hi-label-dot.hi-entity-tone-3 { background: #ec4899; }
.hi-label-dot.hi-entity-tone-4 { background: #0ea5e9; }
.hi-label-dot.hi-entity-tone-5 { background: #22c55e; }
`,
    options: [
      {
        key: 'entityTypes',
        kind: 'tags',
        labelKey: 'task.textEntity.entityTypes',
        hintKey: 'task.textEntity.entityTypesHint',
        default: DEFAULT_TYPES,
      },
    ],
    initial: () => ({ spans: [] }),
    validate: (value) =>
      value && Array.isArray(value.spans) && value.spans.length > 0 ? null : 'task.textEntity.required',
    summary: (value, options, t) =>
      t('task.textEntity.count', { n: value && Array.isArray(value.spans) ? value.spans.length : 0 }),
    Editor,
  };
};
