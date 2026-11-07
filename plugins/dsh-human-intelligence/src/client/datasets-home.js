/* Dataset catalogue, creation, and per-dataset item management. */

function datasetSnippet(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function datasetItemName(entry, fallback) {
  if (entry && typeof entry === 'object') {
    if (typeof entry.name === 'string' && entry.name.trim() !== '') return entry.name.trim();
    if (typeof entry.query === 'string' && entry.query.trim() !== '') return entry.query.trim();
  }
  return fallback;
}

function buildDatasetItems(raw) {
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
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [parsed];
    return list
      .map((entry, index) => {
        if (typeof entry === 'string') {
          const value = entry.trim();
          if (value === '') return null;
          return { name: datasetSnippet(value, 60) || `#${index + 1}`, text: value };
        }
        if (entry && typeof entry.text === 'string' && entry.text.trim() !== '') {
          return { name: datasetItemName(entry, datasetSnippet(entry.text, 60)), text: entry.text };
        }
        if (entry && typeof entry === 'object') {
          const label = datasetItemName(entry, `数据 ${index + 1}`);
          return { name: datasetSnippet(label, 60), text: JSON.stringify(entry) };
        }
        return null;
      })
      .filter(Boolean);
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ name: datasetSnippet(line, 60) || `#${index + 1}`, text: line }));
}

function DatasetCard(props) {
  const ui = props.ui;
  const t = props.t;
  const dataset = props.dataset;
  const modality = props.registry.modalityOf(dataset.modality);
  return h(
    'div',
    {
      className: 'hi-project-row',
      role: 'button',
      tabIndex: 0,
      onClick: () => props.onOpen(dataset),
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen(dataset);
        }
      },
    },
    h('span', { className: 'hi-project-icon' }, h(ui.Icon, { name: modality?.icon || 'database', size: 17 })),
    h(
      'div',
      { className: 'hi-project-main' },
      h(
        'div',
        { className: 'hi-project-line' },
        h('span', { className: 'hi-project-name' }, dataset.name),
        h(ui.Badge, { tone: 'brand' }, modality ? t(modality.titleKey) : dataset.modality),
        h(ui.Badge, null, t('datasets.itemCount', { n: dataset.itemCount || 0 })),
        dataset.taskCount > 0
          ? h(ui.Badge, { tone: 'success' }, t('datasets.taskCount', { n: dataset.taskCount }))
          : null,
      ),
      h(
        'div',
        { className: 'hi-project-meta' },
        dataset.description
          ? h('span', { className: 'hi-project-desc' }, dataset.description.slice(0, 100))
          : h('span', null, t('datasets.noDescription')),
        h('span', null, t('project.updated', { time: formatDate(dataset.updatedAt) })),
      ),
    ),
    h(
      'div',
      { className: 'hi-project-actions', onClick: (event) => event.stopPropagation() },
      h(
        ui.Button,
        { size: 'sm', variant: 'secondary', icon: 'database', onClick: () => props.onOpen(dataset) },
        t('datasets.open'),
      ),
      h(ui.IconButton, {
        icon: 'trash',
        label: dataset.taskCount > 0 ? t('datasets.inUse', { n: dataset.taskCount }) : t('datasets.delete'),
        className: 'hi-danger-hover',
        disabled: dataset.taskCount > 0,
        onClick: () => props.onDelete(dataset),
      }),
    ),
  );
}

function DatasetsHome(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const datasets = props.datasets;
  const query = props.query;
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets.filter((dataset) => {
      if (filter !== 'all' && dataset.modality !== filter) return false;
      if (needle === '') return true;
      const modality = registry.modalityOf(dataset.modality);
      return [dataset.name, dataset.description, modality ? t(modality.titleKey) : dataset.modality]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [datasets, query, filter, registry, t]);

  const filters = [{ id: 'all', label: t('projects.filterAll') }].concat(
    registry.modalities.map((modality) => ({ id: modality.id, label: t(modality.titleKey) })),
  );

  return h(
    'main',
    { className: 'hi-main' },
    h(
      'div',
      { className: 'hi-page' },
      h(
        'div',
        { className: 'hi-pagehead' },
        h(
          'div',
          { className: 'hi-pagehead-copy' },
          h('span', { className: 'hi-kicker' }, t('title')),
          h('h1', null, t('datasets.heading')),
          h('p', null, t('datasets.subtitle')),
        ),
        h(
          ui.Button,
          { variant: 'primary', icon: 'plus', onClick: props.onCreate },
          t('datasets.new'),
        ),
      ),
      h(
        'div',
        { className: 'hi-toolbar', style: { marginTop: 0 } },
        h(
          'div',
          { className: 'hi-segmented', role: 'tablist', 'aria-label': t('datasets.filterLabel') },
          filters.map((entry) =>
            h(
              'button',
              {
                key: entry.id,
                type: 'button',
                role: 'tab',
                'aria-selected': filter === entry.id,
                className: cx('hi-segment', filter === entry.id && 'is-active'),
                onClick: () => setFilter(entry.id),
              },
              entry.label,
            ),
          ),
        ),
        h('span', { className: 'hi-toolbar-count' }, t('datasets.count', { n: filtered.length })),
      ),
      filtered.length === 0
        ? h(ui.EmptyState, {
            icon: 'database',
            title: datasets.length === 0 ? t('datasets.emptyTitle') : t('projects.noMatchTitle'),
            body: datasets.length === 0 ? t('datasets.emptyBody') : t('projects.noMatchBody'),
            action: h(
              ui.Button,
              { variant: 'primary', icon: 'plus', onClick: props.onCreate },
              t('datasets.new'),
            ),
          })
        : h(
            'div',
            { className: 'hi-project-list' },
            filtered.map((dataset) =>
              h(DatasetCard, {
                key: dataset.id,
                dataset,
                registry,
                t,
                ui,
                onOpen: props.onOpen,
                onDelete: props.onDelete,
              }),
            ),
          ),
    ),
  );
}

function CreateDatasetDialog(props) {
  const ui = props.ui;
  const registry = props.registry;
  const t = props.t;
  const initialModality = registry.modalities[0];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modalityId, setModalityId] = useState(initialModality.id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('datasets.nameRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const dataset = await AnnotationApi.datasets.create({
        name: trimmed,
        description,
        modality: modalityId,
      });
      props.onCreated(dataset);
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? t('common.networkError')
          : t('datasets.createFailed', { message: failure && failure.message ? failure.message : '' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return h(
    ui.Modal,
    {
      title: t('datasets.createTitle'),
      subtitle: t('datasets.createSubtitle'),
      onClose: busy ? undefined : props.onClose,
      dismissible: !busy,
      closeLabel: t('common.close'),
      width: 620,
      footer: [
        h(ui.Button, { key: 'cancel', onClick: props.onClose, disabled: busy }, t('common.cancel')),
        h(
          ui.Button,
          { key: 'submit', variant: 'primary', icon: 'plus', onClick: submit, disabled: busy },
          busy ? t('datasets.creating') : t('datasets.create'),
        ),
      ],
    },
    h(
      'form',
      { className: 'hi-form', onSubmit: submit },
      h(
        ui.Field,
        { label: t('datasets.name'), required: true },
        h('input', {
          className: 'hi-input',
          value: name,
          maxLength: 200,
          placeholder: t('datasets.namePlaceholder'),
          onChange: (event) => setName(event.target.value),
        }),
      ),
      h(
        'div',
        { className: 'hi-field' },
        h('span', { className: 'hi-field-label' }, t('create.modality')),
        h(
          'div',
          { className: 'hi-choice-grid' },
          registry.modalities.map((modality) =>
            h(
              'button',
              {
                key: modality.id,
                type: 'button',
                className: cx('hi-choice', modality.id === modalityId && 'is-active'),
                onClick: () => setModalityId(modality.id),
              },
              h(ui.Icon, { name: modality.icon || 'grid', size: 16 }),
              h('strong', null, t(modality.titleKey)),
              h('span', null, t(modality.descriptionKey)),
            ),
          ),
        ),
      ),
      h(
        ui.Field,
        { label: t('datasets.description') },
        h('textarea', {
          className: 'hi-textarea',
          rows: 3,
          value: description,
          maxLength: 4000,
          placeholder: t('datasets.descriptionPlaceholder'),
          onChange: (event) => setDescription(event.target.value),
        }),
      ),
      error ? h('div', { className: 'hi-form-error' }, h(ui.Icon, { name: 'alert', size: 14 }), h('span', null, error)) : null,
    ),
  );
}

function DatasetTextImporter(props) {
  const t = props.t;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = useMemo(() => buildDatasetItems(draft), [draft]);

  async function submit() {
    if (items.length === 0) {
      setError(t('datasets.textImportEmpty'));
      return;
    }
    setBusy(true);
    setError('');
    try {
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
    }
  }

  return h(
    'div',
    { className: 'hi-form' },
    h('p', { className: 'hi-task-note' }, t('datasets.textImportHint')),
    h('textarea', {
      className: 'hi-textarea',
      rows: 9,
      value: draft,
      placeholder: t('datasets.textImportPlaceholder'),
      onChange: (event) => setDraft(event.target.value),
    }),
    h(
      'div',
      { className: 'hi-modal-foot', style: { padding: 0, border: 0, background: 'transparent' } },
      h('span', { className: 'hi-toolbar-count', style: { marginRight: 'auto' } }, t('datasets.textImportCount', { n: items.length })),
      h(
        props.ui.Button,
        { variant: 'primary', icon: 'plus', disabled: busy || items.length === 0, onClick: () => void submit() },
        busy ? t('common.loading') : t('datasets.import'),
      ),
    ),
    error ? h('div', { className: 'hi-form-error' }, h(props.ui.Icon, { name: 'alert', size: 14 }), h('span', null, error)) : null,
  );
}

function DatasetDetail(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const [phase, setPhase] = useState('loading');
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const detail = await AnnotationApi.datasets.get(props.datasetId);
      setDataset(detail);
      setPhase('ready');
      setError('');
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? t('common.networkError')
          : failure && failure.message
            ? failure.message
            : '',
      );
      setPhase('error');
    }
  }, [props.datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const modality = dataset ? registry.modalityOf(dataset.modality) : null;

  async function addItems(prepared) {
    const result = await AnnotationApi.datasets.addItems(props.datasetId, prepared);
    setAddOpen(false);
    props.pushToast(t('datasets.itemsAdded', { n: result.items.length }), 'success');
    await load();
    props.onChanged();
  }

  async function removeItem(item) {
    await AnnotationApi.datasets.removeItem(props.datasetId, item.id);
    setConfirmItem(null);
    props.pushToast(t('datasets.itemDeleted'), 'success');
    await load();
    props.onChanged();
  }

  if (phase === 'loading') {
    return h(
      'main',
      { className: 'hi-main' },
      h(
        'div',
        { style: { display: 'grid', placeItems: 'center', minHeight: 300 } },
        h(ui.Spinner, { label: t('common.loading') }),
      ),
    );
  }

  if (phase === 'error' || !dataset || !modality) {
    return h(
      'main',
      { className: 'hi-main' },
      h(
        'div',
        { className: 'hi-page' },
        h(ui.IconButton, { icon: 'arrowLeft', label: t('datasets.detailBack'), onClick: props.onBack }),
        h(
          'div',
          { className: 'hi-load-error', style: { marginTop: 24 } },
          h(ui.Icon, { name: 'alert', size: 24 }),
          h('p', null, error),
          h(ui.Button, { variant: 'primary', icon: 'refresh', onClick: () => void load() }, t('common.retry')),
        ),
      ),
    );
  }

  return h(
    'main',
    { className: 'hi-main' },
    h(
      'div',
      { className: 'hi-page' },
      h(
        'div',
        { className: 'hi-pagehead' },
        h(
          'div',
          { className: 'hi-pagehead-copy' },
          h(
            'button',
            { type: 'button', className: 'hi-backlink', onClick: props.onBack },
            h(ui.Icon, { name: 'arrowLeft', size: 13 }),
            t('datasets.detailBack'),
          ),
          h('h1', null, dataset.name),
          h(
            'p',
            null,
            h(ui.Badge, { tone: 'brand' }, t(modality.titleKey)),
            ` ${t('datasets.itemCount', { n: dataset.itemCount })}`,
            dataset.taskCount > 0 ? ` · ${t('datasets.taskCount', { n: dataset.taskCount })}` : '',
          ),
        ),
        h(
          'div',
          { className: 'hi-dataset-actions' },
          h(
            ui.Button,
            { variant: 'primary', icon: 'plus', onClick: () => setAddOpen(true) },
            t('datasets.addData'),
          ),
          h(
            ui.Button,
            {
              variant: 'danger',
              icon: 'trash',
              disabled: dataset.taskCount > 0,
              title: dataset.taskCount > 0 ? t('datasets.inUse', { n: dataset.taskCount }) : undefined,
              onClick: () => props.onDelete(dataset),
            },
            t('datasets.delete'),
          ),
        ),
      ),
      dataset.description ? h('p', { className: 'hi-dataset-description' }, dataset.description) : null,
      h(
        'section',
        { className: 'hi-section', style: { marginTop: 8 } },
        h(
          'div',
          { className: 'hi-section-head' },
          h('div', null, h('h2', null, t('datasets.itemsTitle')), h('p', null, t('datasets.itemsHint'))),
          h('span', { className: 'hi-toolbar-count' }, t('datasets.itemCount', { n: dataset.itemCount })),
        ),
        dataset.items.length === 0
          ? h(ui.EmptyState, {
              icon: modality.icon || 'database',
              title: t('datasets.noItems'),
              body: t('datasets.noItemsBody'),
              action: h(
                ui.Button,
                { variant: 'primary', icon: 'plus', onClick: () => setAddOpen(true) },
                t('datasets.addData'),
              ),
            })
          : h(
              'div',
              { className: 'hi-dataset-items' },
              dataset.items.map((item, index) =>
                h(
                  'div',
                  { key: item.id, className: 'hi-dataset-item' },
                  h('span', { className: 'hi-dataset-index' }, index + 1),
                  h(
                    'div',
                    { className: 'hi-dataset-item-main' },
                    h('strong', null, item.name || t('datasets.unnamed')),
                    h(
                      'span',
                      null,
                      typeof item.text === 'string'
                        ? datasetSnippet(item.text, 160)
                        : item.media
                          ? `${item.media.name} · ${formatBytes(item.media.size)}`
                          : '',
                    ),
                  ),
                  h(ui.IconButton, {
                    icon: 'trash',
                    label: t('datasets.deleteItem'),
                    className: 'hi-danger-hover',
                    onClick: () => setConfirmItem(item),
                  }),
                ),
              ),
            ),
      ),
    ),
    addOpen
      ? h(
          ui.Modal,
          {
            title: t('datasets.addData'),
            subtitle: `${t(modality.titleKey)} · ${dataset.name}`,
            onClose: () => setAddOpen(false),
            closeLabel: t('common.close'),
            width: 640,
          },
          modality.id === 'text'
            ? h(DatasetTextImporter, { t, ui, onAdd: addItems })
            : h(modality.ItemImporter, { modality, t, ui, onAdd: addItems }),
        )
      : null,
    confirmItem
      ? h(ConfirmDialog, {
          ui,
          t,
          title: t('datasets.deleteItemTitle'),
          body: t('datasets.deleteItemBody'),
          confirmLabel: t('common.delete'),
          onConfirm: async () => removeItem(confirmItem),
          onClose: () => setConfirmItem(null),
        })
      : null,
  );
}
