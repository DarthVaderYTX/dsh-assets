const ICON_NODES = {
  folder: [
    { tag: 'path', d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { tag: 'path', d: 'M3 10h18' },
  ],
  text: [{ tag: 'path', d: 'M4 6h16M4 12h12M4 18h8' }],
  image: [
    { tag: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
    { tag: 'circle', cx: 9, cy: 10, r: 1.6 },
    { tag: 'path', d: 'M4 18l5-5 4 4 3-3 4 4' },
  ],
  video: [
    { tag: 'rect', x: 3, y: 5, width: 18, height: 14, rx: 2 },
    { tag: 'path', d: 'M10 9.5l5 2.5-5 2.5z' },
  ],
  plus: [{ tag: 'path', d: 'M12 5v14M5 12h14' }],
  refresh: [
    { tag: 'path', d: 'M20 11a8 8 0 1 0-2.3 5.7' },
    { tag: 'path', d: 'M20 5v6h-6' },
  ],
  search: [
    { tag: 'circle', cx: 11, cy: 11, r: 6.5 },
    { tag: 'path', d: 'M16 16l4 4' },
  ],
  check: [{ tag: 'path', d: 'M5 12.5l4.5 4.5L19 7.5' }],
  alert: [
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'path', d: 'M12 8v5' },
    { tag: 'circle', cx: 12, cy: 16.5, r: 0.6, fill: 'currentColor', stroke: 'none' },
  ],
  trash: [
    { tag: 'path', d: 'M4 7h16' },
    { tag: 'path', d: 'M9 7V5h6v2' },
    { tag: 'path', d: 'M6 7l1 13h10l1-13' },
    { tag: 'path', d: 'M10 11v5M14 11v5' },
  ],
  'chevron-left': [{ tag: 'path', d: 'M15 6l-6 6 6 6' }],
  'chevron-right': [{ tag: 'path', d: 'M9 6l6 6-6 6' }],
  'chevron-up': [{ tag: 'path', d: 'M6 15l6-6 6 6' }],
  'chevron-down': [{ tag: 'path', d: 'M6 9l6 6 6-6' }],
  download: [
    { tag: 'path', d: 'M12 4v10' },
    { tag: 'path', d: 'M8 11l4 4 4-4' },
    { tag: 'path', d: 'M5 20h14' },
  ],
  close: [{ tag: 'path', d: 'M6 6l12 12M18 6L6 18' }],
  skip: [
    { tag: 'path', d: 'M6 5l9 7-9 7z' },
    { tag: 'path', d: 'M18 5v14' },
  ],
  tag: [
    { tag: 'path', d: 'M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8z' },
    { tag: 'circle', cx: 8.5, cy: 8.5, r: 1.2 },
  ],
  bounds: [{ tag: 'path', d: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4' }],
  clock: [
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'path', d: 'M12 7.5V12l3 2' },
  ],
  star: [
    { tag: 'path', d: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z' },
  ],
  layers: [
    { tag: 'path', d: 'M12 3l9 5-9 5-9-5z' },
    { tag: 'path', d: 'M3 12l9 5 9-5' },
    { tag: 'path', d: 'M3 16l9 5 9-5' },
  ],
  database: [
    { tag: 'ellipse', cx: 12, cy: 6, rx: 7, ry: 3 },
    { tag: 'path', d: 'M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6' },
    { tag: 'path', d: 'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3' },
  ],
  play: [{ tag: 'path', d: 'M8 5l11 7-11 7z' }],
  segment: [
    { tag: 'path', d: 'M3 12h18' },
    { tag: 'rect', x: 6, y: 8, width: 6, height: 8, rx: 1.5 },
    { tag: 'path', d: 'M15 12h3' },
  ],
  info: [
    { tag: 'circle', cx: 12, cy: 12, r: 8.5 },
    { tag: 'path', d: 'M12 11v5' },
    { tag: 'circle', cx: 12, cy: 8, r: 0.6, fill: 'currentColor', stroke: 'none' },
  ],
  arrowLeft: [
    { tag: 'path', d: 'M19 12H5' },
    { tag: 'path', d: 'M11 6l-6 6 6 6' },
  ],
  cursor: [{ tag: 'path', d: 'M6 4l12 8-5 1.5L10 19z' }],
  grid: [
    { tag: 'rect', x: 4, y: 4, width: 6, height: 6, rx: 1 },
    { tag: 'rect', x: 14, y: 4, width: 6, height: 6, rx: 1 },
    { tag: 'rect', x: 4, y: 14, width: 6, height: 6, rx: 1 },
    { tag: 'rect', x: 14, y: 14, width: 6, height: 6, rx: 1 },
  ],
  spark: [
    { tag: 'path', d: 'M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5' },
  ],
};

function createUI(dependencies) {
  const h = dependencies.h;
  const React = dependencies.React;
  const { useEffect, useRef } = React;

  function Icon(props) {
    const name = props.name || 'info';
    const size = props.size || 16;
    const nodes = ICON_NODES[name] || ICON_NODES.info;
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        className: cx('hi-icon', props.className),
      },
      nodes.map((node, index) => {
        const { tag, ...attributes } = node;
        return h(tag, { key: index, ...attributes });
      }),
    );
  }

  function IconButton(props) {
    return h(
      'button',
      {
        type: 'button',
        className: cx('hi-iconbtn', props.className),
        title: props.label,
        'aria-label': props.label,
        disabled: props.disabled,
        style: props.style,
        onClick: props.onClick,
      },
      h(Icon, { name: props.icon, size: props.size || 16 }),
    );
  }

  function Button(props) {
    const className = cx(
      'hi-btn',
      `hi-btn-${props.variant || 'secondary'}`,
      props.size === 'sm' ? 'hi-btn-sm' : '',
      props.className,
    );
    return h(
      'button',
      {
        type: props.type || 'button',
        className,
        disabled: props.disabled,
        title: props.title,
        style: props.style,
        onClick: props.onClick,
      },
      props.icon ? h(Icon, { name: props.icon, size: props.size === 'sm' ? 14 : 15 }) : null,
      props.children,
    );
  }

  function Field(props) {
    return h(
      'label',
      { className: cx('hi-field', props.className), style: props.style },
      h(
        'span',
        { className: 'hi-field-label' },
        props.label,
        props.required ? h('span', { className: 'hi-required' }, '*') : null,
      ),
      props.children,
      props.hint ? h('span', { className: 'hi-field-hint' }, props.hint) : null,
    );
  }

  function Spinner(props) {
    return h(
      'span',
      { className: cx('hi-loading', props.className), role: 'status' },
      h('span', { className: 'hi-spinner', 'aria-hidden': 'true' }),
      props.label || null,
    );
  }

  function Badge(props) {
    return h('span', { className: cx('hi-badge', props.tone ? `hi-badge-${props.tone}` : '', props.className) }, props.children);
  }

  function ProgressBar(props) {
    const value = clamp(Number(props.value) || 0, 0, 1);
    return h(
      'div',
      { className: cx('hi-progress-wrap', props.className), role: 'progressbar', 'aria-valuenow': Math.round(value * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('div', { className: 'hi-progress' }, h('span', { className: 'hi-progress-fill', style: { width: `${value * 100}%` } })),
    );
  }

  function EmptyState(props) {
    return h(
      'div',
      { className: cx('hi-empty', props.className) },
      h('span', { className: 'hi-empty-icon' }, h(Icon, { name: props.icon || 'spark', size: 22 })),
      h('h3', null, props.title),
      props.body ? h('p', null, props.body) : null,
      props.action || null,
    );
  }

  function Modal(props) {
    const boxRef = useRef(null);
    useEffect(() => {
      const onKeyDown = (event) => {
        if (event.key === 'Escape' && props.onClose && props.dismissible !== false) props.onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      const target = boxRef.current;
      if (target) {
        const focusable = target.querySelector('input, textarea, select, button');
        if (focusable && typeof focusable.focus === 'function') focusable.focus();
      }
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [props.onClose, props.dismissible]);
    return h(
      'div',
      {
        className: 'hi-modal-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && props.dismissible !== false && props.onClose) props.onClose();
        },
      },
      h(
        'div',
        {
          ref: boxRef,
          className: cx('hi-modal', props.className),
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': props.title,
          style: props.width ? { maxWidth: props.width } : undefined,
        },
        h(
          'header',
          { className: 'hi-modal-head' },
          h(
            'div',
            null,
            h('h2', null, props.title),
            props.subtitle ? h('p', null, props.subtitle) : null,
          ),
          h(IconButton, {
            icon: 'close',
            label: props.closeLabel || 'Close',
            onClick: props.onClose,
            disabled: props.dismissible === false,
          }),
        ),
        h('div', { className: 'hi-modal-body' }, props.children),
        props.footer ? h('footer', { className: 'hi-modal-foot' }, props.footer) : null,
      ),
    );
  }

  return { Icon, IconButton, Button, Field, Spinner, Badge, ProgressBar, EmptyState, Modal };
}
