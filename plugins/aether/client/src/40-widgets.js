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

    function TypeSelect({ t, value, onChange, paramOnly = false }) {
      const options = paramOnly ? ATH_PARAM_TYPES : ATH_VALUE_TYPES;
      return h(
        'select',
        {
          className: 'ath-select ath-type-select',
          value: options.includes(value) ? value : 'string',
          title: t('modules.typeLabel'),
          onChange: (event) => onChange(event.target.value),
        },
        options.map((type) =>
          h('option', { key: type, value: type }, t(`modules.type.${type}`)),
        ),
      );
    }

    function ParamsEditor({ t, value, types, onChange }) {
      const [rows, setRows] = useState(() => paramsToRows(value, types));
      const update = (next) => {
        setRows(next);
        onChange(rowsToParams(next), rowsToParamTypes(next));
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
                h(TypeSelect, {
                  t,
                  value: row.type,
                  paramOnly: true,
                  onChange: (type) => {
                    const next = rows.slice();
                    next[index] = { ...row, type };
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
              onClick: () => update([...rows, { key: '', value: '', type: 'string' }]),
            },
            t('common.addParam'),
          ),
        ),
      );
    }

    function PortsEditor({ t, label, ports, types, onChange, requiredPorts, requiredMode = false }) {
      const rows = Array.isArray(ports) ? ports : [];
      const typeMap = types && typeof types === 'object' ? types : {};
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
                const nextTypes = { ...typeMap };
                if (previous !== event.target.value) {
                  const previousType = nextTypes[previous] || 'string';
                  delete nextTypes[previous];
                  if (event.target.value) nextTypes[event.target.value] = previousType;
                }
                onChange(next, [...nextRequired], nextTypes);
              },
            }),
            h(TypeSelect, {
              t,
              value: typeMap[port] || 'string',
              onChange: (type) => {
                const nextTypes = { ...typeMap };
                if (port) nextTypes[port] = type;
                onChange(rows, [...required], nextTypes);
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
                      onChange(rows, [...nextRequired], typeMap);
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
                  const nextTypes = { ...typeMap };
                  delete nextTypes[removed];
                  onChange(
                    rows.filter((_, position) => position !== index),
                    [...nextRequired],
                    nextTypes,
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
            onClick: () => {
              const next = [...rows, ''];
              onChange(next, [...required], typeMap);
            },
            style: { alignSelf: 'flex-start', marginTop: 6 },
          },
          t('modules.addPort'),
        ),
      );
    }

    function Modal({ t, title, children, footer, onClose, wide = false, className = '' }) {
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
            className: `ath-modal${className ? ` ${className}` : ''}`,
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

    function ContextMenu({ menu, onClose }) {
      const closeRef = useRef(onClose);
      const menuRef = useRef(null);
      closeRef.current = onClose;
      useEffect(() => {
        if (!menu) return undefined;
        const first = menuRef.current && menuRef.current.querySelector('button');
        if (first) first.focus({ preventScroll: true });
        const close = () => closeRef.current();
        const onKey = (event) => {
          if (event.key === 'Escape') close();
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', close);
        window.addEventListener('wheel', close, { passive: true });
        return () => {
          window.removeEventListener('pointerdown', close);
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('resize', close);
          window.removeEventListener('wheel', close);
        };
      }, [menu]);
      if (!menu) return null;
      return h(
        'div',
        {
          ref: menuRef,
          className: 'ath-context-menu',
          role: 'menu',
          style: { left: menu.x, top: menu.y },
          onPointerDown: (event) => event.stopPropagation(),
          onContextMenu: (event) => event.preventDefault(),
        },
        menu.items
          .filter(Boolean)
          .map((item, index) =>
            h(
              'button',
              {
                key: item.key || String(index),
                type: 'button',
                role: 'menuitem',
                'data-danger': item.danger ? 'true' : 'false',
                disabled: item.disabled,
                onClick: () => {
                  closeRef.current();
                  item.onSelect();
                },
              },
              item.label,
            ),
          ),
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

function WorkspaceDialog({ t, current, onClose, onSubmit, onExport, onImport, busy }) {
  const [pathValue, setPathValue] = useState(current || '');
  const [ioError, setIoError] = useState('');
  const importInputRef = useRef(null);

  const handleImportFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setIoError('');
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      await onImport(bundle);
    } catch (error) {
      setIoError(error && error.message ? error.message : String(error));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return h(
    Modal,
    {
      t,
      title: t('workspace.title'),
      onClose: busy ? () => {} : onClose,
      footer: [
        h('button', { key: 'cancel', type: 'button', className: 'ath-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
        h(
          'button',
          {
            key: 'apply',
            type: 'button',
            className: 'ath-btn ath-btn-primary',
            disabled: busy || !pathValue.trim(),
            onClick: () => onSubmit(pathValue.trim()),
          },
          busy ? t('workspace.busy') : t('workspace.apply'),
        ),
      ],
    },
    h(
      'div',
      { className: 'ath-field' },
      h('label', { className: 'ath-label' }, t('workspace.pathLabel')),
      h('input', {
        className: 'ath-input ath-mono',
        type: 'text',
        value: pathValue,
        spellCheck: false,
        placeholder: 'D:\\workspaces\\aether',
        onChange: (event) => setPathValue(event.target.value),
      }),
      h('div', { className: 'ath-hint' }, t('workspace.pathHint')),
    ),
    h('div', { className: 'ath-hint' }, `${t('workspace.current')}: ${current || ''}`),
    h(
      'div',
      { className: 'ath-card', style: { marginTop: 14 } },
      h('h4', { className: 'ath-section-title' }, t('workspace.ioTitle')),
      h(
        'div',
        { className: 'ath-actions', style: { marginTop: 8 } },
        h(
          'button',
          {
            type: 'button',
            className: 'ath-btn ath-btn-ghost',
            onClick: () => onExport(),
          },
          t('workspace.export'),
        ),
      ),
      h(
        'div',
        { className: 'ath-actions', style: { marginTop: 8 } },
        h(
          'button',
          {
            type: 'button',
            className: 'ath-btn ath-btn-ghost',
            onClick: () => {
              if (importInputRef.current) importInputRef.current.click();
            },
          },
          t('workspace.import'),
        ),
        h('input', {
          ref: importInputRef,
          type: 'file',
          accept: 'application/json,.json',
          style: { display: 'none' },
          onChange: (event) => void handleImportFile(event),
        }),
      ),
      h('div', { className: 'ath-hint' }, t('workspace.ioHint')),
      ioError ? h('div', { className: 'ath-error' }, ioError) : null,
    ),
  );
}

