/* Shared upload importer used by the image and video modality modules. */
function createFileItemImporter(options) {
  const h = options.h;
  const React = options.React;
  const ui = options.ui;
  const kind = options.kind;
  const accept = options.accept;
  const typesLabel = options.typesLabel;
  const sizeLabel = options.sizeLabel;
  const icon = options.icon || (kind === 'video' ? 'video' : 'image');
  const maxBytes = options.maxBytes || 512 * 1024 * 1024;

  return function FileItemImporter(props) {
    const t = props.t;
    const [files, setFiles] = React.useState([]);
    const [busy, setBusy] = React.useState(false);
    const [progress, setProgress] = React.useState('');
    const [error, setError] = React.useState('');
    const inputRef = React.useRef(null);

    function addFiles(list) {
      const incoming = Array.from(list || []);
      if (incoming.length === 0) return;
      setFiles((current) => {
        const merged = current.slice();
        for (const file of incoming) {
          if (!merged.some((entry) => entry.name === file.name && entry.size === file.size && entry.lastModified === file.lastModified)) {
            merged.push(file);
          }
        }
        return merged;
      });
      setError('');
    }

    function onDrop(event) {
      event.preventDefault();
      if (busy) return;
      addFiles(event.dataTransfer && event.dataTransfer.files);
    }

    async function submit() {
      if (files.length === 0) {
        setError(t('importer.file.none'));
        return;
      }
      setBusy(true);
      setError('');
      try {
        const items = [];
        for (const file of files) {
          if (!file.type || !file.type.startsWith(`${kind}/`)) {
            throw new Error(t('importer.file.unsupported', { name: file.name }));
          }
          if (file.size > maxBytes) {
            throw new Error(t('importer.file.tooLarge', { name: file.name, size: sizeLabel }));
          }
          setProgress(t('importer.file.uploading', { name: file.name }));
          const media = await AnnotationApi.media.upload(file);
          items.push({ name: file.name, media });
        }
        await props.onAdd(items);
      } catch (failure) {
        setError(
          failure && failure.message === 'NETWORK'
            ? t('common.networkError')
            : failure && failure.message
              ? failure.message
              : t('common.networkError'),
        );
      } finally {
        setBusy(false);
        setProgress('');
      }
    }

    return h(
      'div',
      { className: 'hi-form' },
      h('p', { className: 'hi-task-note' }, t('importer.file.hint', { types: typesLabel, size: sizeLabel })),
      h(
        'div',
        {
          className: 'hi-file-drop',
          onDragOver: (event) => event.preventDefault(),
          onDrop,
        },
        h(ui.Icon, { name: icon, size: 26 }),
        h('strong', null, t('importer.file.choose')),
        h('span', null, `${typesLabel} · ${sizeLabel}`),
        h(
          ui.Button,
          { variant: 'secondary', icon: 'plus', disabled: busy, onClick: () => inputRef.current && inputRef.current.click() },
          t('importer.file.browse'),
        ),
        h('input', {
          ref: inputRef,
          type: 'file',
          multiple: true,
          accept,
          style: { display: 'none' },
          onChange: (event) => {
            addFiles(event.target.files);
            event.target.value = '';
          },
        }),
      ),
      files.length > 0
        ? h(
            'div',
            { className: 'hi-file-list' },
            files.map((file) =>
              h(
                'div',
                { key: `${file.name}:${file.size}:${file.lastModified}`, className: 'hi-file-row' },
                h('span', null, file.name),
                h('span', null, formatBytes(file.size)),
                h(
                  ui.IconButton,
                  {
                    icon: 'close',
                    label: t('common.cancel'),
                    disabled: busy,
                    onClick: () => setFiles((current) => current.filter((entry) => entry !== file)),
                  },
                ),
              ),
            ),
          )
        : null,
      progress ? h('div', { className: 'hi-file-row' }, h(ui.Spinner, { label: progress })) : null,
      h(
        'div',
        { className: 'hi-modal-foot', style: { padding: 0, border: 0, background: 'transparent' } },
        h(
          'span',
          { className: 'hi-toolbar-count', style: { marginRight: 'auto' } },
          files.length > 0 ? `${files.length} ${t('importer.file.files')}` : t('importer.file.none'),
        ),
        h(
          ui.Button,
          { variant: 'primary', icon: 'plus', disabled: busy || files.length === 0, onClick: () => void submit() },
          busy ? t('common.loading') : t('importer.file.submit', { n: files.length }),
        ),
      ),
      error
        ? h('div', { className: 'hi-form-error' }, h(ui.Icon, { name: 'alert', size: 14 }), h('span', null, error))
        : null,
    );
  };
}
