/* Image modality · bounding-box task module. */
const createImageBboxTask = ({ h, React, ui }) => {
  const { useMemo, useRef, useState } = React;
  const { Icon, Badge } = ui;

  function Editor(props) {
    const t = props.t;
    const labels = readStringList(props.options, 'labels', ['目标']);
    const value = props.value && typeof props.value === 'object' ? props.value : {};
    const [activeLabel, setActiveLabel] = useState(labels[0] || '目标');
    const [selectedId, setSelectedId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState('');
    const stageRef = useRef(null);
    const dragRef = useRef(null);

    const boxes = useMemo(() => {
      const source = Array.isArray(value.boxes) ? value.boxes : [];
      return source
        .filter((box) => box && typeof box === 'object')
        .map((box) => ({
          id: typeof box.id === 'string' && box.id !== '' ? box.id : uid('box'),
          x: clamp(Number(box.x) || 0, 0, 1),
          y: clamp(Number(box.y) || 0, 0, 1),
          w: clamp(Number(box.w) || 0, 0, 1),
          h: clamp(Number(box.h) || 0, 0, 1),
          label: typeof box.label === 'string' && box.label !== '' ? box.label : labels[0] || '目标',
        }))
        .filter((box) => box.w > 0.002 && box.h > 0.002);
    }, [value, labels]);

    const availableLabels = labels.slice();
    for (const box of boxes) if (!availableLabels.includes(box.label)) availableLabels.push(box.label);

    function pointFromEvent(event) {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const rect = stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
      };
    }

    function startDraw(event) {
      if (event.button !== 0) return;
      const point = pointFromEvent(event);
      dragRef.current = { x: point.x, y: point.y };
      setDraft({ x: point.x, y: point.y, w: 0, h: 0 });
      setError('');
      if (event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort.
        }
      }
    }

    function moveDraw(event) {
      if (!dragRef.current) return;
      const point = pointFromEvent(event);
      const start = dragRef.current;
      setDraft({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y),
      });
    }

    function endDraw(event) {
      if (!dragRef.current) return;
      const start = dragRef.current;
      dragRef.current = null;
      const point = pointFromEvent(event);
      const width = Math.abs(point.x - start.x);
      const height = Math.abs(point.y - start.y);
      setDraft(null);
      if (width < 0.005 || height < 0.005) return;
      const box = {
        id: uid('box'),
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: width,
        h: height,
        label: activeLabel || availableLabels[0] || '目标',
      };
      setSelectedId(box.id);
      props.onChange({ ...value, boxes: boxes.concat(box) });
    }

    function chooseLabel(label) {
      setActiveLabel(label);
      if (selectedId) {
        props.onChange({
          ...value,
          boxes: boxes.map((box) => (box.id === selectedId ? { ...box, label } : box)),
        });
      }
    }

    function removeBox(id) {
      if (selectedId === id) setSelectedId(null);
      props.onChange({ ...value, boxes: boxes.filter((box) => box.id !== id) });
    }

    function changeBoxLabel(id, label) {
      props.onChange({ ...value, boxes: boxes.map((box) => (box.id === id ? { ...box, label } : box)) });
    }

    return h(
      'div',
      { className: 'hi-task' },
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.imageBbox.labels')),
          h(Badge, { tone: boxes.length ? 'brand' : undefined }, t('task.imageBbox.count', { n: boxes.length })),
        ),
        h(
          'div',
          { className: 'hi-label-grid', style: { marginBottom: 10 } },
          availableLabels.map((label) =>
            h(
              'button',
              {
                key: label,
                type: 'button',
                className: cx('hi-label', activeLabel === label && 'is-selected'),
                onClick: () => chooseLabel(label),
              },
              h('span', { className: 'hi-label-dot' }),
              label,
            ),
          ),
        ),
        h(
          'p',
          { className: 'hi-task-note', style: { marginBottom: 10 } },
          t('task.imageBbox.drawHint'),
        ),
        h(
          'div',
          { style: { textAlign: 'center' } },
          h(
            'div',
            { className: 'hi-media-frame' },
            h('img', {
              src: AnnotationApi.media.url(props.item.media.file),
              alt: props.item.name || '',
              draggable: false,
            }),
            h(
              'div',
              {
                ref: stageRef,
                className: 'hi-bbox-layer',
                onPointerDown: startDraw,
                onPointerMove: moveDraw,
                onPointerUp: endDraw,
                onPointerCancel: () => {
                  dragRef.current = null;
                  setDraft(null);
                },
              },
              boxes.map((box) =>
                h(
                  'div',
                  {
                    key: box.id,
                    className: cx('hi-bbox', selectedId === box.id && 'is-selected'),
                    style: {
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                    },
                    onPointerDown: (event) => {
                      event.stopPropagation();
                      setSelectedId(box.id);
                    },
                  },
                  h('span', { className: 'hi-bbox-chip' }, box.label),
                ),
              ),
              draft
                ? h('div', {
                    className: 'hi-bbox is-draft',
                    style: {
                      left: `${draft.x * 100}%`,
                      top: `${draft.y * 100}%`,
                      width: `${draft.w * 100}%`,
                      height: `${draft.h * 100}%`,
                    },
                  })
                : null,
            ),
          ),
        ),
        h(
          'div',
          { className: 'hi-bbox-help' },
          h(Icon, { name: 'bounds', size: 13 }),
          h('span', null, t('task.imageBbox.help')),
          selectedId
            ? h(
                ui.Button,
                {
                  size: 'sm',
                  variant: 'danger',
                  icon: 'trash',
                  style: { marginLeft: 'auto' },
                  onClick: () => removeBox(selectedId),
                },
                t('task.imageBbox.deleteSelected'),
              )
            : null,
        ),
        error ? h('div', { className: 'hi-form-error' }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
      ),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.imageBbox.list')),
          h(Badge, null, t('task.imageBbox.count', { n: boxes.length })),
        ),
        boxes.length === 0
          ? h('p', { className: 'hi-task-note', style: { margin: 0 } }, t('task.imageBbox.empty'))
          : h(
              'div',
              { className: 'hi-segment-list' },
              boxes.map((box, index) =>
                h(
                  'div',
                  { key: box.id, className: 'hi-segment-row' },
                  h(
                    'span',
                    { className: 'hi-segment-range', style: { minWidth: 26 } },
                    `#${index + 1}`,
                  ),
                  h(
                    'span',
                    { style: { flex: '1 1 auto', fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                    `${Math.round(box.x * 100)}, ${Math.round(box.y * 100)} · ${Math.round(box.w * 100)}×${Math.round(box.h * 100)}%`,
                  ),
                  h(
                    'select',
                    {
                      className: 'hi-select',
                      value: box.label,
                      'aria-label': t('task.imageBbox.label'),
                      onChange: (event) => changeBoxLabel(box.id, event.target.value),
                    },
                    availableLabels.map((label) => h('option', { key: label, value: label }, label)),
                  ),
                  h(ui.IconButton, {
                    icon: 'trash',
                    label: t('common.delete'),
                    className: 'hi-danger-hover',
                    onClick: () => removeBox(box.id),
                  }),
                ),
              ),
            ),
      ),
    );
  }

  return {
    id: 'image-bbox',
    modality: 'image',
    titleKey: 'task.imageBbox.title',
    descriptionKey: 'task.imageBbox.description',
    icon: 'bounds',
    messages: {
      zh: {
        'task.imageBbox.title': '目标框选',
        'task.imageBbox.description': '在图片上拖动绘制边界框，并为每个框指定类别。',
        'task.imageBbox.labels': '目标类别',
        'task.imageBbox.label': '目标类别',
        'task.imageBbox.labelsHint': '用逗号或换行分隔，例如：行人, 车辆, 交通标志',
        'task.imageBbox.drawHint': '在图片上按住并拖动即可绘制一个边界框；点击已有框可选中或删除。',
        'task.imageBbox.help': '框选后可在列表里调整类别。',
        'task.imageBbox.list': '已标注目标',
        'task.imageBbox.empty': '还没有目标框。在上方图片中拖动开始框选。',
        'task.imageBbox.count': '{n} 个目标',
        'task.imageBbox.deleteSelected': '删除选中',
        'task.imageBbox.required': '请至少框选一个目标。',
      },
      en: {
        'task.imageBbox.title': 'Bounding Boxes',
        'task.imageBbox.description': 'Draw boxes over the image and assign a category to each one.',
        'task.imageBbox.labels': 'Categories',
        'task.imageBbox.label': 'Category',
        'task.imageBbox.labelsHint': 'Separate categories with commas or new lines, e.g. Person, Vehicle, Sign',
        'task.imageBbox.drawHint': 'Press and drag on the image to draw a box. Click an existing box to select it.',
        'task.imageBbox.help': 'Change a category from the list after drawing.',
        'task.imageBbox.list': 'Boxes',
        'task.imageBbox.empty': 'No boxes yet. Drag on the image above to start.',
        'task.imageBbox.count': '{n} boxes',
        'task.imageBbox.deleteSelected': 'Delete selected',
        'task.imageBbox.required': 'Draw at least one box.',
      },
    },
    styles: `.hi-media-frame img { max-height: 56vh; } .hi-bbox-layer { touch-action: none; }`,
    options: [
      {
        key: 'labels',
        kind: 'tags',
        labelKey: 'task.imageBbox.labels',
        hintKey: 'task.imageBbox.labelsHint',
        default: ['目标'],
      },
    ],
    initial: () => ({ boxes: [] }),
    validate: (value) => (value && Array.isArray(value.boxes) && value.boxes.length > 0 ? null : 'task.imageBbox.required'),
    summary: (value, options, t) =>
      t('task.imageBbox.count', { n: value && Array.isArray(value.boxes) ? value.boxes.length : 0 }),
    Editor,
  };
};
