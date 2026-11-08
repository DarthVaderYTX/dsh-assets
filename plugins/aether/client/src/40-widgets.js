    // ---------------------------------------------------------- 小部件

    function NavIcon({ size = 20, active = false }) {
      const color = active ? 'var(--ath-accent, var(--dsw-alias-brand-primary))' : 'currentColor';
      const fill = active ? 'color-mix(in srgb, var(--ath-accent, var(--dsw-alias-brand-primary)) 16%, transparent)' : 'none';
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          className: 'ath-nav-icon',
        },
        h('path', {
          d: 'M6 6.5 12 17.5M18 7.5 12 17.5M6 6.5 18 7.5',
          stroke: color,
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 6, cy: 6.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
        h('circle', { cx: 18, cy: 7.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
        h('circle', { cx: 12, cy: 17.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
      );
    }

    function ParamsEditor({ t, value, onChange }) {
      const [rows, setRows] = useState(() => paramsToRows(value));
      const update = (next) => {
        setRows(next);
        onChange(rowsToParams(next));
      };
      return h(
        'div',
        null,
        rows.length
          ? rows.map((row, index) =>
              h(
                'div',
                { className: 'ath-param-row', key: `${index}-${row.key}` },
                h('input', {
                  className: 'ath-input ath-mono',
                  type: 'text',
                  value: row.key,
                  placeholder: t('common.paramKey'),
                  spellCheck: false,
                  onChange: (event) => {
                    const next = rows.slice();
                    next[index] = { ...row, key: event.target.value };
                    update(next);
                  },
                }),
                h('input', {
                  className: 'ath-input',
                  type: 'text',
                  value: row.value,
                  placeholder: t('common.paramValue'),
                  onChange: (event) => {
                    const next = rows.slice();
                    next[index] = { ...row, value: event.target.value };
                    update(next);
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ath-icon-btn',
                    title: t('action.remove'),
                    'aria-label': t('action.remove'),
                    onClick: () => update(rows.filter((_, position) => position !== index)),
                  },
                  '×',
                ),
              ),
            )
          : h('div', { className: 'ath-hint' }, t('common.noParams')),
        h(
          'div',
          { style: { marginTop: 8 } },
          h(
            'button',
            {
              type: 'button',
              className: 'ath-btn ath-btn-ghost',
              onClick: () => update([...rows, { key: '', value: '' }]),
            },
            t('common.addParam'),
          ),
        ),
      );
    }

    function PortsEditor({ t, label, ports, onChange, requiredPorts, requiredMode = false }) {
      const rows = Array.isArray(ports) ? ports : [];
      const required = new Set(Array.isArray(requiredPorts) ? requiredPorts : []);
      return h(
        'div',
        { className: 'ath-field' },
        h('label', { className: 'ath-label' }, label),
        rows.map((port, index) =>
          h(
            'div',
            {
              className: `ath-port-edit-row${requiredMode ? ' ath-port-edit-row-required' : ''}`,
              key: index,
            },
            h('input', {
              className: 'ath-input ath-mono',
              type: 'text',
              value: port,
              maxLength: 40,
              placeholder: t('modules.portPlaceholder'),
              onChange: (event) => {
                const next = rows.slice();
                const previous = next[index];
                next[index] = event.target.value;
                const nextRequired = new Set(required);
                if (previous !== event.target.value && required.has(previous)) {
                  nextRequired.delete(previous);
                  if (event.target.value) nextRequired.add(event.target.value);
                }
                onChange(next, [...nextRequired]);
              },
            }),
            requiredMode
              ? h(
                  'label',
                  { className: 'ath-port-required', title: t('modules.requiredInputHint') },
                  h('input', {
                    type: 'checkbox',
                    checked: required.has(port),
                    disabled: !port,
                    onChange: (event) => {
                      const nextRequired = new Set(required);
                      if (event.target.checked) nextRequired.add(port);
                      else nextRequired.delete(port);
                      onChange(rows, [...nextRequired]);
                    },
                  }),
                  h('span', null, t('modules.requiredInput')),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'ath-icon-btn',
                title: t('action.remove'),
                'aria-label': t('action.remove'),
                onClick: () => {
                  const removed = rows[index];
                  const nextRequired = new Set(required);
                  nextRequired.delete(removed);
                  onChange(
                    rows.filter((_, position) => position !== index),
                    [...nextRequired],
                  );
                },
              },
              '×',
            ),
          ),
        ),
        rows.length ? null : h('div', { className: 'ath-hint' }, t('canvas.none')),
        requiredMode && rows.length
          ? h('div', { className: 'ath-hint', style: { marginTop: 2 } }, t('modules.requiredInputHint'))
          : null,
        h(
          'button',
          {
            type: 'button',
            className: 'ath-btn ath-btn-ghost',
            onClick: () => onChange([...rows, ''], [...required]),
            style: { alignSelf: 'flex-start', marginTop: 6 },
          },
          t('modules.addPort'),
        ),
      );
    }

    function Modal({ t, title, children, footer, onClose, wide = false }) {
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') closeRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      return h(
        'div',
        {
          className: 'ath-modal-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          {
            className: 'ath-modal',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            'data-wide': wide ? 'true' : 'false',
          },
          h(
            'div',
            { className: 'ath-modal-head' },
            h('h3', null, title),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: onClose, 'aria-label': t('action.close') }, '×'),
          ),
          h('div', { className: 'ath-modal-body' }, children),
          footer ? h('div', { className: 'ath-modal-foot' }, footer) : null,
        ),
      );
    }

    function ConfirmDialog({ t, dialog, onCancel, onConfirm, busy }) {
      if (!dialog) return null;
      return h(
        Modal,
        {
          t,
          title: dialog.title,
          onClose: onCancel,
          footer: [
            h('button', { key: 'cancel', type: 'button', className: 'ath-btn', onClick: onCancel }, t('action.cancel')),
            h(
              'button',
              {
                key: 'confirm',
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                disabled: busy,
                onClick: onConfirm,
              },
              busy ? t('common.loading') : dialog.confirmLabel || t('action.confirm'),
            ),
          ],
        },
        h('div', { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' } }, dialog.body),
      );
    }

    function Toasts({ toasts }) {
      return h(
        'div',
        { className: 'ath-toasts' },
        toasts.map((toast) =>
          h(
            'div',
            { className: 'ath-toast', 'data-kind': toast.kind || 'success', key: toast.id },
            h('i', { className: 'ath-toast-dot' }),
            h('span', null, toast.message),
          ),
        ),
      );
    }

    function EmptyState({ title, hint, action }) {
      return h(
        'div',
        { className: 'ath-empty' },
        h('strong', null, title),
        hint ? h('span', null, hint) : null,
        action || null,
      );
    }
