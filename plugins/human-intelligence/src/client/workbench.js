/* Workbench page: project catalogue, creation form, and the annotation shell. */

const ACTIVE_TAB_KEY = 'human-intelligence:active-tab';
const LANGUAGE_KEY = 'human-intelligence:language';
const RAIL_WIDTH_KEY = 'human-intelligence:rail-width';
const RAIL_WIDTH_MIN = 180;
const RAIL_WIDTH_MAX = 620;

function initialRailWidth() {
  try {
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_KEY));
    if (Number.isFinite(stored)) return clamp(stored, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX);
  } catch {
    // A blocked storage API falls back to the default width.
  }
  return typeof window !== 'undefined' && window.innerWidth < 900 ? 184 : 264;
}

function initialPluginLanguage(props) {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // A blocked storage API falls back to the host locale below.
  }
  const host = typeof props.getLocaleId === 'function' ? String(props.getLocaleId() || '').toLowerCase() : '';
  return host.startsWith('zh') ? 'zh' : 'en';
}

function HumanIntelligenceLogo(props) {
  const size = props.size || 32;
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': 'true', className: 'hi-logo-svg' },
    h('rect', { x: 3, y: 3, width: 58, height: 58, rx: 15, fill: '#ffffff', stroke: '#111111', strokeWidth: 4 }),
    h('path', { d: 'M14 24v-6a4 4 0 0 1 4-4h6', fill: 'none', stroke: '#111111', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.92 }),
    h('path', { d: 'M40 14h6a4 4 0 0 1 4 4v6', fill: 'none', stroke: '#111111', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.92 }),
    h('path', { d: 'M14 40v6a4 4 0 0 0 4 4h6', fill: 'none', stroke: '#111111', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.92 }),
    h('path', { d: 'M40 50h6a4 4 0 0 0 4-4v-6', fill: 'none', stroke: '#111111', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.92 }),
    h('circle', { cx: 32, cy: 27, r: 7.2, fill: '#ffffff', stroke: '#111111', strokeWidth: 3.5 }),
    h('path', { d: 'M20.5 47c0-6.6 5.2-10.4 11.5-10.4S43.5 40.4 43.5 47', fill: 'none', stroke: '#111111', strokeWidth: 4, strokeLinecap: 'round' }),
  );
}

function HumanIntelligenceIcon(props) {
  const size = props.size || 20;
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: '#111111',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className: 'hi-nav-icon',
    },
    h('rect', { x: 1.5, y: 1.5, width: 21, height: 21, rx: 5, fill: '#ffffff', stroke: '#111111', strokeWidth: 1.8 }),
    h('path', { d: 'M5 9V6.5A1.5 1.5 0 0 1 6.5 5H9' }),
    h('path', { d: 'M15 5h2.5A1.5 1.5 0 0 1 19 6.5V9' }),
    h('path', { d: 'M19 15v2.5a1.5 1.5 0 0 1-1.5 1.5H15' }),
    h('path', { d: 'M9 19H6.5A1.5 1.5 0 0 1 5 17.5V15' }),
    h('circle', { cx: 12, cy: 10, r: 2.5 }),
    h('path', { d: 'M7.8 18.5c0-2.4 1.9-4 4.2-4s4.2 1.6 4.2 4' }),
  );
}

function choiceValue(choice) {
  return typeof choice === 'string' ? choice : choice && choice.value !== undefined ? String(choice.value) : '';
}

function choiceLabel(choice, t) {
  if (typeof choice === 'string') return choice;
  if (choice && choice.labelKey) return t(choice.labelKey);
  return choiceValue(choice);
}

function buildOptionValues(task) {
  const values = {};
  const fields = task && Array.isArray(task.options) ? task.options : [];
  for (const field of fields) {
    if (field.kind === 'multiselect') {
      values[field.key] = Array.isArray(field.default) ? field.default.map(String) : [];
    } else if (field.kind === 'tags') {
      values[field.key] = Array.isArray(field.default) ? field.default.join(', ') : '';
    } else if (field.kind === 'select') {
      const first = (field.choices || [])[0];
      const fallback = field.default !== undefined ? field.default : choiceValue(first);
      values[field.key] = fallback !== undefined ? String(fallback) : '';
    } else {
      values[field.key] = field.default !== undefined ? String(field.default) : '';
    }
  }
  return values;
}

function taskOptionValues(task, base) {
  const values = buildOptionValues(task);
  const saved = base && typeof base === 'object' ? base : {};
  const fields = task && Array.isArray(task.options) ? task.options : [];
  for (const field of fields) {
    if (saved[field.key] === undefined) continue;
    const value = saved[field.key];
    if (field.kind === 'multiselect') {
      values[field.key] = Array.isArray(value) ? value.map(String) : [];
    } else if (field.kind === 'tags') {
      values[field.key] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    } else {
      values[field.key] = String(value ?? '');
    }
  }
  return values;
}

function collectTaskOptions(task, values) {
  const options = {};
  const fields = task && Array.isArray(task.options) ? task.options : [];
  for (const field of fields) {
    const value = values ? values[field.key] : undefined;
    if (field.kind === 'multiselect') {
      const allowed = new Set((field.choices || []).map((choice) => choiceValue(choice)));
      const selected = (Array.isArray(value) ? value : [])
        .map(String)
        .filter((entry, index, list) => list.indexOf(entry) === index)
        .filter((entry) => allowed.size === 0 || allowed.has(entry));
      if (field.required && selected.length === 0) return { error: 'create.selectionRequired' };
      options[field.key] = selected;
    } else if (field.kind === 'tags') {
      const tags = splitTags(value);
      if (tags.length === 0) return { error: 'create.optionRequired' };
      options[field.key] = tags;
    } else if (field.kind === 'select') {
      const raw = value !== undefined ? String(value) : '';
      const numeric = Number(raw);
      options[field.key] = raw !== '' && Number.isFinite(numeric) ? numeric : raw;
    } else if (field.kind === 'number') {
      options[field.key] = Number(value) || 0;
    } else {
      options[field.key] = value !== undefined ? String(value) : '';
    }
  }
  return { options };
}

function validationProblem(task, value, options) {
  if (!task || typeof task.validate !== 'function') return null;
  try {
    return task.validate(value, options);
  } catch {
    return 'annotate.annotationError';
  }
}

function ToastStack(props) {
  const { h: create, Icon } = props;
  if (!props.toasts.length) return null;
  return create(
    'div',
    { className: 'hi-toasts', role: 'status', 'aria-live': 'polite' },
    props.toasts.map((toast) =>
      create(
        'div',
        { key: toast.id, className: cx('hi-toast', `is-${toast.kind || 'success'}`) },
        create(Icon, { name: toast.kind === 'error' ? 'alert' : 'check', size: 15 }),
        create('span', null, toast.message),
      ),
    ),
  );
}

function ConfirmDialog(props) {
  const ui = props.ui;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await props.onConfirm();
      props.onClose();
    } catch (failure) {
      setError(failure && failure.message === 'NETWORK' ? props.t('common.networkError') : (failure && failure.message) || '');
    } finally {
      setBusy(false);
    }
  }
  return h(
    ui.Modal,
    {
      title: props.title,
      onClose: busy ? undefined : props.onClose,
      dismissible: !busy,
      closeLabel: props.t('common.close'),
      footer: [
        h(ui.Button, { key: 'cancel', onClick: props.onClose, disabled: busy }, props.t('common.cancel')),
        h(
          ui.Button,
          { key: 'confirm', variant: 'danger', onClick: confirm, disabled: busy },
          busy ? h(ui.Spinner, null) : props.confirmLabel || props.t('common.delete'),
        ),
      ],
    },
    h('p', { className: 'hi-confirm-body' }, props.body),
    error ? h('div', { className: 'hi-form-error', style: { marginTop: 12 } }, h(ui.Icon, { name: 'alert', size: 14 }), h('span', null, error)) : null,
  );
}

function MultiSelectField(props) {
  const ui = props.ui;
  const t = props.t;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const choices = Array.isArray(props.choices) ? props.choices : [];
  const values = Array.isArray(props.value) ? props.value : [];
  const selected = new Set(values);
  const selectedLabels = choices
    .filter((choice) => selected.has(choiceValue(choice)))
    .map((choice) => choiceLabel(choice, t));

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function toggle(value) {
    const next = selected.has(value)
      ? values.filter((entry) => entry !== value)
      : values.concat(value);
    props.onChange(next);
  }

  return h(
    'div',
    { className: 'hi-multiselect', ref: rootRef },
    h(
      'button',
      {
        type: 'button',
        className: 'hi-input hi-multiselect-trigger',
        'aria-haspopup': 'listbox',
        'aria-expanded': open,
        onClick: () => setOpen((current) => !current),
        onKeyDown: (event) => {
          if (event.key === 'Escape') setOpen(false);
        },
      },
      h(
        'span',
        { className: cx('hi-multiselect-text', selectedLabels.length === 0 && 'is-placeholder') },
        selectedLabels.length > 0 ? selectedLabels.join(', ') : t('create.selectPlaceholder'),
      ),
      h(ui.Icon, { name: open ? 'chevron-up' : 'chevron-down', size: 14 }),
    ),
    open
      ? h(
          'div',
          { className: 'hi-multiselect-menu', role: 'listbox', 'aria-multiselectable': 'true' },
          choices.map((choice) => {
            const value = choiceValue(choice);
            const active = selected.has(value);
            return h(
              'label',
              { key: value, className: cx('hi-multiselect-option', active && 'is-selected'), role: 'option', 'aria-selected': active },
              h('input', {
                type: 'checkbox',
                checked: active,
                onChange: () => toggle(value),
              }),
              h('span', null, choiceLabel(choice, t)),
            );
          }),
        )
      : null,
  );
}

function TaskOptionFields(props) {
  const ui = props.ui;
  const t = props.t;
  const fields = props.task && Array.isArray(props.task.options) ? props.task.options : [];
  if (fields.length === 0) return null;
  const values = props.values || {};
  const update = (key, value) => props.onChange({ ...values, [key]: value });
  return h(
    'div',
    { className: 'hi-field' },
    h('span', { className: 'hi-field-label' }, t('create.options')),
    h(
      'div',
      { className: 'hi-form-grid' },
      fields.map((field) => {
        const shared = {
          key: field.key,
          label: t(field.labelKey),
          hint: field.hintKey ? t(field.hintKey) : undefined,
          required: field.required === true,
          className: field.kind === 'multiselect' || field.kind === 'tags' ? 'hi-span-2' : undefined,
        };
        let control;
        if (field.kind === 'multiselect') {
          control = h(MultiSelectField, {
            ui,
            t,
            choices: field.choices || [],
            value: Array.isArray(values[field.key]) ? values[field.key] : [],
            onChange: (next) => update(field.key, next),
          });
        } else if (field.kind === 'select') {
          control = h(
            'select',
            {
              className: 'hi-select',
              value: values[field.key] !== undefined ? String(values[field.key]) : '',
              onChange: (event) => update(field.key, event.target.value),
            },
            (field.choices || []).map((choice) =>
              h('option', { key: choiceValue(choice), value: choiceValue(choice) }, choiceLabel(choice, t)),
            ),
          );
        } else if (field.kind === 'number') {
          control = h('input', {
            type: 'number',
            className: 'hi-input',
            value: values[field.key] !== undefined ? values[field.key] : '',
            onChange: (event) => update(field.key, event.target.value),
          });
        } else {
          control = h('input', {
            className: cx('hi-input', field.kind === 'tags' && 'hi-option-tags'),
            value: values[field.key] !== undefined ? values[field.key] : '',
            placeholder: field.placeholderKey ? t(field.placeholderKey) : '',
            onChange: (event) => update(field.key, event.target.value),
          });
        }
        return h(ui.Field, shared, control);
      }),
    ),
  );
}

function CreateToolDialog(props) {
  const ui = props.ui;
  const registry = props.registry;
  const t = props.t;
  const initialModality = registry.modalities[0];
  const initialTask = initialModality.tasks[0];
  const [modalityId, setModalityId] = useState(initialModality.id);
  const [taskId, setTaskId] = useState(initialTask ? initialTask.id : '');
  const [optionValues, setOptionValues] = useState(() => buildOptionValues(initialTask));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const modality = registry.modalityOf(modalityId) || initialModality;
  const task = registry.taskOf(modality.id, taskId) || modality.tasks[0];

  function chooseModality(nextId) {
    const next = registry.modalityOf(nextId);
    if (!next) return;
    const first = next.tasks[0];
    setModalityId(next.id);
    setTaskId(first ? first.id : '');
    setOptionValues(buildOptionValues(first));
    setError('');
  }

  function chooseTask(nextTask) {
    setTaskId(nextTask.id);
    setOptionValues(buildOptionValues(nextTask));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!task) return;
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError(t('tools.nameRequired'));
      return;
    }
    const collected = collectTaskOptions(task, optionValues);
    if (collected.error) {
      setError(t(collected.error));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const tool = await AnnotationApi.tools.create({
        name: trimmedName,
        modality: modality.id,
        task: task.id,
        taskOptions: collected.options,
      });
      props.onCreated(tool);
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? t('common.networkError')
          : t('tools.createFailed', { message: failure && failure.message ? failure.message : '' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return h(
    ui.Modal,
    {
      title: t('tools.createTitle'),
      subtitle: t('tools.createSubtitle'),
      onClose: busy ? undefined : props.onClose,
      dismissible: !busy,
      closeLabel: t('common.close'),
      width: 680,
      footer: [
        h(ui.Button, { key: 'cancel', onClick: props.onClose, disabled: busy }, t('common.cancel')),
        h(
          ui.Button,
          { key: 'submit', variant: 'primary', icon: 'plus', onClick: submit, disabled: busy },
          busy ? t('tools.creating') : t('tools.create'),
        ),
      ],
    },
    h(
      'form',
      { className: 'hi-form', onSubmit: submit },
      h(
        'div',
        { className: 'hi-field' },
        h('span', { className: 'hi-field-label' }, t('create.modality')),
        h(
          'div',
          { className: 'hi-choice-grid' },
          registry.modalities.map((candidate) =>
            h(
              'button',
              {
                key: candidate.id,
                type: 'button',
                className: cx('hi-choice', candidate.id === modality.id && 'is-active'),
                onClick: () => chooseModality(candidate.id),
              },
              h(ui.Icon, { name: candidate.icon || 'grid', size: 16 }),
              h('strong', null, t(candidate.titleKey)),
              h('span', null, t(candidate.descriptionKey)),
            ),
          ),
        ),
      ),
      h(
        'div',
        { className: 'hi-field' },
        h('span', { className: 'hi-field-label' }, t('create.task')),
        h(
          'div',
          { className: 'hi-task-choice-grid' },
          modality.tasks.map((candidate) =>
            h(
              'button',
              {
                key: candidate.id,
                type: 'button',
                className: cx('hi-task-choice', candidate.id === task.id && 'is-active'),
                onClick: () => chooseTask(candidate),
              },
              h(ui.Icon, { name: candidate.icon || 'tag', size: 15 }),
              h('div', null, h('strong', null, t(candidate.titleKey)), h('span', null, t(candidate.descriptionKey))),
            ),
          ),
        ),
      ),
      h(
        ui.Field,
        { label: t('tools.name'), required: true },
        h('input', {
          className: 'hi-input',
          value: name,
          maxLength: 120,
          placeholder: t('tools.namePlaceholder'),
          onChange: (event) => setName(event.target.value),
        }),
      ),
      task && task.options && task.options.length > 0
        ? h(TaskOptionFields, { ui, t, task, values: optionValues, onChange: setOptionValues })
        : null,
      error ? h('div', { className: 'hi-form-error' }, h(ui.Icon, { name: 'alert', size: 14 }), h('span', null, error)) : null,
    ),
  );
}

function CreateTaskDialog(props) {
  const ui = props.ui;
  const registry = props.registry;
  const t = props.t;
  const tool = props.tool;
  const task = registry.taskOf(tool.modality, tool.task);
  const modality = registry.modalityOf(tool.modality);
  const compatibleDatasets = (Array.isArray(props.datasets) ? props.datasets : []).filter(
    (dataset) => dataset.modality === tool.modality,
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState(() =>
    task && task.defaultInstructionKey ? t(task.defaultInstructionKey) : '',
  );
  const [optionValues, setOptionValues] = useState(() => taskOptionValues(task, tool.taskOptions));
  const [datasetId, setDatasetId] = useState(() => (compatibleDatasets[0] ? compatibleDatasets[0].id : ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chips = toolChips(tool, registry, t).slice(0, 6);

  async function submit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError(t('tasks.nameRequired'));
      return;
    }
    const collected = collectTaskOptions(task, optionValues);
    if (collected.error) {
      setError(t(collected.error));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const project = await AnnotationApi.tasks.create({
        name: trimmedName,
        description,
        modality: tool.modality,
        task: tool.task,
        taskOptions: collected.options,
        toolId: tool.id,
        datasetId: datasetId || undefined,
      });
      props.onCreated(project);
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? t('common.networkError')
          : t('tasks.createFailed', { message: failure && failure.message ? failure.message : '' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return h(
    ui.Modal,
    {
      title: t('tasks.createTitle'),
      subtitle: t('tasks.createSubtitle', { tool: toolTitle(tool, registry, t) }),
      onClose: busy ? undefined : props.onClose,
      dismissible: !busy,
      closeLabel: t('common.close'),
      width: 620,
      footer: [
        h(ui.Button, { key: 'cancel', onClick: props.onClose, disabled: busy }, t('common.cancel')),
        h(
          ui.Button,
          { key: 'submit', variant: 'primary', icon: 'plus', onClick: submit, disabled: busy },
          busy ? t('tasks.creating') : t('tasks.create'),
        ),
      ],
    },
    h(
      'form',
      { className: 'hi-form', onSubmit: submit },
      h(
        'div',
        { className: 'hi-tool-summary' },
        h(
          'span',
          { className: 'hi-tool-icon' },
          h(ui.Icon, {
            name: task && task.icon ? task.icon : modality && modality.icon ? modality.icon : 'grid',
            size: 16,
          }),
        ),
        h(
          'div',
          { className: 'hi-tool-summary-copy' },
          h(
            'div',
            { className: 'hi-tool-title' },
            h('strong', null, toolTitle(tool, registry, t)),
            tool.preset ? h(ui.Badge, { tone: 'brand' }, t('tools.badgePreset')) : null,
          ),
          h('p', null, toolDescription(tool, registry, t)),
          chips.length > 0
            ? h(
                'div',
                { className: 'hi-tool-chips' },
                chips.map((chip, index) =>
                  h('span', { key: `${chip}-${index}`, className: 'hi-tool-chip' }, chip),
                ),
              )
            : null,
        ),
      ),
      h(
        ui.Field,
        { label: t('tasks.dataset'), hint: t('tasks.datasetHint') },
        h(
          'select',
          {
            className: 'hi-select',
            value: datasetId,
            onChange: (event) => setDatasetId(event.target.value),
          },
          h('option', { value: '' }, t('tasks.newDataset')),
          compatibleDatasets.map((dataset) =>
            h(
              'option',
              { key: dataset.id, value: dataset.id },
              `${dataset.name} (${t('datasets.itemCount', { n: dataset.itemCount })})`,
            ),
          ),
        ),
      ),
      h(
        ui.Field,
        { label: t('tasks.name'), required: true },
        h('input', {
          className: 'hi-input',
          value: name,
          maxLength: 200,
          placeholder: t('tasks.namePlaceholder'),
          onChange: (event) => setName(event.target.value),
        }),
      ),
      task && task.options && task.options.length > 0
        ? h(TaskOptionFields, { ui, t, task, values: optionValues, onChange: setOptionValues })
        : null,
      h(
        ui.Field,
        { label: t('tasks.instruction') },
        h('textarea', {
          className: 'hi-textarea',
          value: description,
          rows: 3,
          maxLength: 4000,
          placeholder: t('tasks.instructionPlaceholder'),
          onChange: (event) => setDescription(event.target.value),
        }),
      ),
      error ? h('div', { className: 'hi-form-error' }, h(ui.Icon, { name: 'alert', size: 14 }), h('span', null, error)) : null,
    ),
  );
}

function ItemRail(props) {
  const ui = props.ui;
  const t = props.t;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const total = props.items.length;
  const reviewed = props.reviewed;
  const normalizedSearch = search.trim().toLowerCase();
  const entries = props.items.map((item, index) => ({
    item,
    index,
    status: props.statusOf(item.id),
  }));
  const isReviewed = (status) => status === 'done' || status === 'skipped';
  const viewOf = (item, index) => {
    if (typeof props.itemView === 'function') {
      try {
        const view = props.itemView(item, index);
        if (view && typeof view === 'object') {
          return {
            title: view.title !== undefined && view.title !== null ? String(view.title) : itemDisplayName(item, index),
            meta: view.meta !== undefined && view.meta !== null ? String(view.meta) : '',
          };
        }
        if (typeof view === 'string') return { title: view, meta: '' };
      } catch {
        // Fall through to the generic label.
      }
    }
    return { title: itemDisplayName(item, index), meta: '' };
  };
  const filtered = entries.filter((entry) => {
    if (filter === 'done' && !isReviewed(entry.status)) return false;
    if (filter === 'todo' && isReviewed(entry.status)) return false;
    if (!normalizedSearch) return true;
    return itemSearchText(entry.item).includes(normalizedSearch);
  });
  const sorted = [...filtered].sort((left, right) => {
    if (sort === 'todoFirst') {
      return Number(isReviewed(left.status)) - Number(isReviewed(right.status)) || left.index - right.index;
    }
    if (sort === 'doneFirst') {
      return Number(isReviewed(right.status)) - Number(isReviewed(left.status)) || left.index - right.index;
    }
    if (sort === 'name') {
      return viewOf(left.item, left.index).title.localeCompare(viewOf(right.item, right.index).title, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
    return left.index - right.index;
  });
  const filterOptions = [
    ['all', t('annotate.filter.all'), total],
    ['done', t('annotate.filter.done'), reviewed],
    ['todo', t('annotate.filter.todo'), total - reviewed],
  ];
  const sortOptions = [
    ['default', t('annotate.sort.default')],
    ['todoFirst', t('annotate.sort.todoFirst')],
    ['doneFirst', t('annotate.sort.doneFirst')],
    ['name', t('annotate.sort.name')],
  ];

  return h(
    'aside',
    { className: 'hi-rail', style: { width: `${props.width}px` }, 'aria-label': t('annotate.rail') },
    h(
      'div',
      { className: 'hi-rail-head' },
      h('span', null, t('annotate.rail')),
      h('span', null, `${reviewed}/${total}`),
    ),
    total > 0
      ? h(
          'div',
          { className: 'hi-rail-tools' },
          h(
            'div',
            { className: 'hi-rail-search-row' },
            h('input', {
              type: 'search',
              className: 'hi-input hi-rail-search',
              value: search,
              placeholder: t('annotate.search'),
              'aria-label': t('annotate.search'),
              onChange: (event) => setSearch(event.target.value),
            }),
            h(
              'select',
              {
                className: 'hi-select hi-rail-sort',
                value: sort,
                'aria-label': t('annotate.sort'),
                onChange: (event) => setSort(event.target.value),
              },
              sortOptions.map(([value, label]) => h('option', { key: value, value }, label)),
            ),
          ),
          h(
            'div',
            { className: 'hi-segmented hi-rail-filters', role: 'group', 'aria-label': t('annotate.filter') },
            filterOptions.map(([value, label, count]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  className: cx('hi-segment', filter === value && 'is-active'),
                  'aria-pressed': filter === value,
                  title: `${label} (${count})`,
                  onClick: () => setFilter(value),
                },
                label,
              ),
            ),
          ),
        )
      : null,
    h(
      'div',
      { className: 'hi-rail-list' },
      total === 0
        ? h('div', { className: 'hi-rail-empty' }, t('annotate.noItems'))
        : sorted.length === 0
          ? h(
              'div',
              { className: 'hi-rail-empty' },
              h('span', null, t('annotate.noMatch')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'hi-backlink',
                  onClick: () => {
                    setSearch('');
                    setFilter('all');
                  },
                },
                t('annotate.clearFilters'),
              ),
            )
          : sorted.map((entry) => {
              const view = viewOf(entry.item, entry.index);
              return h(
                'button',
                {
                  key: entry.item.id,
                  type: 'button',
                  className: cx('hi-rail-item', entry.index === props.index && 'is-active'),
                  title: `${itemSummary(entry.item)} · ${t(`status.${entry.status}`)}`,
                  onClick: () => props.onSelect(entry.index),
                },
                h('span', { className: `hi-status-dot is-${entry.status}` }),
                h('span', { className: 'hi-rail-index' }, entry.index + 1),
                h(
                  'span',
                  { className: 'hi-rail-name' },
                  h('span', { className: 'hi-rail-title' }, view.title),
                  view.meta ? h('span', { className: 'hi-rail-meta' }, view.meta) : null,
                ),
              );
            }),
    ),
  );
}

/*
 * Annotation app.
 *
 * This component reads and writes a task only through its task-scoped API
 * (`AnnotationApi.forTask`): dataset reads, item add/remove, annotation result
 * saves, and status transitions. It never calls fetch or touches storage.
 */
function Annotator(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const projectId = props.projectId;
  const taskApi = useMemo(() => AnnotationApi.forTask(projectId), [projectId]);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [project, setProject] = useState(null);
  const [items, setItems] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [railWidth, setRailWidth] = useState(initialRailWidth);
  const [resizing, setResizing] = useState(false);
  const railWidthRef = useRef(railWidth);
  railWidthRef.current = railWidth;
  const bodyRef = useRef(null);
  const resizeRef = useRef(null);

  function maxRailWidth() {
    const body = bodyRef.current;
    const width = body ? body.getBoundingClientRect().width : 0;
    if (width <= 0) return RAIL_WIDTH_MAX;
    return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, width - 320));
  }

  function persistRailWidth(value) {
    try {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(Math.round(value)));
    } catch {
      // Remembering the split width is best effort.
    }
  }

  function startRailResize(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const body = bodyRef.current;
    resizeRef.current = {
      startX: event.clientX,
      startWidth: railWidth,
      bodyWidth: body ? body.getBoundingClientRect().width : 0,
    };
    setResizing(true);
    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    }
    event.preventDefault();
  }

  function moveRailResize(event) {
    if (!resizeRef.current) return;
    const max = Math.max(
      RAIL_WIDTH_MIN,
      Math.min(RAIL_WIDTH_MAX, resizeRef.current.bodyWidth - 320),
    );
    const next = clamp(
      resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
      RAIL_WIDTH_MIN,
      max,
    );
    railWidthRef.current = next;
    setRailWidth(next);
  }

  function endRailResize(event) {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setResizing(false);
    persistRailWidth(railWidthRef.current);
    if (event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    }
  }

  function nudgeRail(delta) {
    const next = clamp(railWidth + delta, RAIL_WIDTH_MIN, maxRailWidth());
    railWidthRef.current = next;
    setRailWidth(next);
    persistRailWidth(next);
  }

  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);
  const flushRef = useRef(null);
  const mountedRef = useRef(true);
  const translateRef = useRef(t);
  translateRef.current = t;

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const detail = await taskApi.get();
      const nextDataset = detail.dataset && typeof detail.dataset === 'object' ? detail.dataset : {};
      const nextItems = Array.isArray(nextDataset.items) ? nextDataset.items : [];
      const nextAnnotations =
        nextDataset.annotations && typeof nextDataset.annotations === 'object' ? nextDataset.annotations : {};
      const firstUnhandled = nextItems.findIndex((item) => {
        const annotation = nextAnnotations[item.id];
        return !annotation || (annotation.status !== 'done' && annotation.status !== 'skipped');
      });
      setProject(detail.task);
      setItems(nextItems);
      setAnnotations(nextAnnotations);
      setIndex(firstUnhandled >= 0 ? firstUnhandled : 0);
      setPhase('ready');
      setError('');
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? translateRef.current('common.networkError')
          : translateRef.current('error.loadProject', {
              message: failure && failure.message ? failure.message : '',
            }),
      );
      setPhase('error');
    }
  }, [taskApi]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (pendingRef.current.size > 0) {
        const entries = [...pendingRef.current.entries()];
        pendingRef.current.clear();
        for (const [itemId, payload] of entries) {
          void taskApi.saveAnnotation(itemId, payload.value, payload.status).catch(() => {});
        }
      }
    };
  }, [load, taskApi]);

  const flushNow = useCallback(() => {
    if (flushRef.current) return flushRef.current;
    const run = (async () => {
      while (pendingRef.current.size > 0) {
        const entries = [...pendingRef.current.entries()];
        pendingRef.current.clear();
        if (mountedRef.current) setSaveState('saving');
        try {
          for (const [itemId, payload] of entries) {
            const result = await taskApi.saveAnnotation(itemId, payload.value, payload.status);
            if (!mountedRef.current) continue;
            setAnnotations((current) => ({ ...current, [itemId]: result.annotation }));
          }
          if (mountedRef.current) {
            setSaveState('saved');
            setSaveError('');
          }
        } catch (failure) {
          for (const [itemId, payload] of entries) {
            if (!pendingRef.current.has(itemId)) pendingRef.current.set(itemId, payload);
          }
          if (mountedRef.current) {
            setSaveState('error');
            setSaveError(
              failure && failure.message === 'NETWORK'
                ? translateRef.current('common.networkError')
                : translateRef.current('annotate.saveFailed', {
                    message: failure && failure.message ? failure.message : '',
                  }),
            );
          }
          return false;
        }
      }
      return true;
    })();
    flushRef.current = run.finally(() => {
      flushRef.current = null;
    });
    return flushRef.current;
  }, [taskApi]);

  const flushAll = useCallback(async () => {
    if (flushRef.current) {
      const ok = await flushRef.current;
      if (!ok) return false;
    }
    if (pendingRef.current.size === 0) return true;
    let ok = await flushNow();
    if (ok && pendingRef.current.size > 0) ok = await flushNow();
    return ok;
  }, [flushNow]);

  const queueSave = useCallback(
    (itemId, payload, immediate) => {
      pendingRef.current.set(itemId, payload);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (immediate) {
        void flushAll();
      } else {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void flushAll();
        }, 700);
      }
    },
    [flushAll],
  );

  const modality = project ? registry.modalityOf(project.modality) : null;
  const task = project ? registry.taskOf(project.modality, project.task) : null;
  const options = project && task ? registry.resolveOptions(task, project.taskOptions) : {};
  const currentItem = items.length > 0 ? items[Math.min(index, items.length - 1)] : null;
  const currentAnnotation = currentItem ? annotations[currentItem.id] : null;
  const currentValue = currentItem && task ? (currentAnnotation ? currentAnnotation.value : task.initial(options, currentItem)) : null;
  const currentProblem =
    currentItem && task ? validationProblem(task, currentValue, options) : 'annotate.annotationError';
  const canComplete = currentItem !== null && currentProblem === null;
  const reviewed = items.reduce((count, item) => {
    const status = statusOf(item.id);
    return count + (status === 'done' || status === 'skipped' ? 1 : 0);
  }, 0);
  const progressPercent = items.length === 0 ? 0 : Math.floor((reviewed / items.length) * 100);

  function statusOf(itemId) {
    const annotation = annotations[itemId];
    if (!annotation) return 'todo';
    if (annotation.status === 'skipped') return 'skipped';
    if (annotation.status === 'done') {
      const problem = task ? validationProblem(task, annotation.value, options) : null;
      return problem === null ? 'done' : 'draft';
    }
    return 'draft';
  }

  function itemView(item, itemIndex) {
    if (task && typeof task.itemView === 'function') {
      try {
        const view = task.itemView(item, itemIndex, options, t);
        if (view && typeof view === 'object') {
          return {
            title: view.title !== undefined && view.title !== null ? String(view.title) : itemDisplayName(item, itemIndex),
            meta: view.meta !== undefined && view.meta !== null ? String(view.meta) : '',
          };
        }
        if (typeof view === 'string') return { title: view, meta: '' };
      } catch {
        // Fall through to the generic label.
      }
    }
    return { title: itemDisplayName(item, itemIndex), meta: '' };
  }

  function handleChange(nextValue) {
    if (!currentItem) return;
    const status = 'draft';
    setAnnotations((current) => ({
      ...current,
      [currentItem.id]: { value: nextValue, status, updatedAt: Date.now() },
    }));
    queueSave(currentItem.id, { value: nextValue, status });
  }

  function findNext(fromIndex, includeCurrent) {
    const size = items.length;
    if (size === 0) return -1;
    for (let offset = includeCurrent ? 0 : 1; offset < size; offset += 1) {
      const candidate = (fromIndex + offset) % size;
      const status = statusOf(items[candidate].id);
      if (status !== 'done' && status !== 'skipped') return candidate;
    }
    return -1;
  }

  async function commit(status) {
    if (!currentItem || !task) return;
    if (status === 'done' && typeof task.validate === 'function') {
      const problem = task.validate(currentValue, options);
      if (problem) {
        props.pushToast(t(problem), 'error');
        return;
      }
    }
    setAnnotations((current) => ({
      ...current,
      [currentItem.id]: { value: currentValue, status, updatedAt: Date.now() },
    }));
    queueSave(currentItem.id, { value: currentValue, status }, true);
    const saved = await flushAll();
    if (!saved) return;
    const next = findNext(index, false);
    if (next < 0) {
      props.pushToast(t('annotate.allDone'), 'success');
    } else {
      setIndex(next);
    }
  }

  async function go(nextIndex) {
    if (nextIndex < 0 || nextIndex >= items.length) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const saved = await flushAll();
    if (!saved) return;
    setIndex(nextIndex);
  }

  async function goBack() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const saved = await flushAll();
    if (!saved) return;
    props.onChanged();
    props.onBack();
  }

  if (phase === 'loading') {
    return h(
      'div',
      { className: 'hi-annotator' },
      h('div', { className: 'hi-annotator-head' }, h(ui.IconButton, { icon: 'arrowLeft', label: t('annotate.back'), onClick: props.onBack })),
      h('div', { style: { flex: 1, display: 'grid', placeItems: 'center' } }, h(ui.Spinner, { label: t('common.loading') })),
    );
  }

  if (phase === 'error') {
    return h(
      'div',
      { className: 'hi-annotator' },
      h(
        'div',
        { className: 'hi-annotator-head' },
        h(ui.IconButton, { icon: 'arrowLeft', label: t('annotate.back'), onClick: props.onBack }),
      ),
      h(
        'div',
        { style: { flex: 1, display: 'grid', placeItems: 'center' } },
        h(
          'div',
          { className: 'hi-load-error' },
          h(ui.Icon, { name: 'alert', size: 24 }),
          h('p', null, error),
          h(ui.Button, { variant: 'primary', icon: 'refresh', onClick: () => void load() }, t('common.retry')),
        ),
      ),
    );
  }

  if (!project || !modality || !task) {
    return h(
      'div',
      { className: 'hi-annotator' },
      h('div', { className: 'hi-annotator-head' }, h(ui.IconButton, { icon: 'arrowLeft', label: t('annotate.back'), onClick: props.onBack })),
      h(
        'div',
        { style: { flex: 1, display: 'grid', placeItems: 'center', padding: 20 } },
        h(ui.EmptyState, { icon: 'alert', title: t('common.networkError'), body: null }),
      ),
    );
  }

  const saveStatusNode =
    saveState === 'saving'
      ? h(ui.Spinner, { label: t('annotate.saving') })
      : saveState === 'saved'
        ? h('span', { className: 'hi-save-status is-saved' }, h(ui.Icon, { name: 'check', size: 13 }), t('annotate.saved'))
        : saveState === 'error'
          ? h('span', { className: 'hi-save-status is-error', title: saveError }, h(ui.Icon, { name: 'alert', size: 13 }), saveError)
          : null;

  return h(
    'div',
    { className: 'hi-annotator' },
    h(
      'div',
      { className: 'hi-annotator-head' },
      h(ui.IconButton, { icon: 'arrowLeft', label: t('annotate.back'), onClick: () => void goBack() }),
      h(
        'div',
        { className: 'hi-annotator-title' },
        h('strong', null, project.name),
        h(
          'span',
          null,
          h(ui.Badge, { tone: 'brand' }, t(modality.titleKey)),
          h(ui.Badge, null, t(task.titleKey)),
          h('span', null, t('annotate.progress', { done: reviewed, total: items.length })),
        ),
      ),
      h(
        'div',
        { className: 'hi-annotator-progress' },
        h(
          'div',
          { className: 'hi-progress-boundary' },
          h(ui.ProgressBar, { value: items.length === 0 ? 0 : reviewed / items.length }),
          h('span', { className: 'hi-progress-percent', 'aria-hidden': 'true' }, `${progressPercent}%`),
        ),
        h('span', null, `${reviewed}/${items.length}`),
      ),
      h(
        'div',
        { className: 'hi-annotator-actions' },
        h(
          'a',
          {
            className: 'hi-btn hi-btn-secondary hi-btn-sm',
            href: taskApi.exportUrl(),
            download: '',
            title: t('annotate.export'),
          },
          h(ui.Icon, { name: 'download', size: 14 }),
          h('span', null, t('annotate.export')),
        ),
      ),
    ),
    h(
      'div',
      { ref: bodyRef, className: cx('hi-annotator-body', resizing && 'is-resizing') },
      h(ItemRail, {
        ui,
        t,
        items,
        index,
        width: railWidth,
        reviewed,
        statusOf,
        itemView,
        onSelect: (next) => void go(next),
      }),
      h(
        'div',
        {
          className: cx('hi-splitter', resizing && 'is-active'),
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': t('annotate.resizeRail'),
          'aria-valuemin': RAIL_WIDTH_MIN,
          'aria-valuemax': RAIL_WIDTH_MAX,
          'aria-valuenow': Math.round(railWidth),
          tabIndex: 0,
          onPointerDown: startRailResize,
          onPointerMove: moveRailResize,
          onPointerUp: endRailResize,
          onPointerCancel: endRailResize,
          onKeyDown: (event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              nudgeRail(-16);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              nudgeRail(16);
            }
          },
        },
        h('span', { className: 'hi-splitter-grip' }),
      ),
      h(
        'div',
        { className: 'hi-editor' },
        items.length === 0
          ? h(
              'div',
              { style: { flex: 1, display: 'grid', placeItems: 'center', padding: 22, overflow: 'auto' } },
              h(ui.EmptyState, {
                icon: modality.icon || 'database',
                title: t('annotate.emptyTitle'),
                body: t('annotate.emptyBody'),
              }),
            )
          : h(
              'div',
              { style: { display: 'contents' } },
              h(
                'div',
                { className: 'hi-editor-scroll' },
                h(
                  'div',
                  { className: 'hi-editor-inner' },
                  h(
                    'div',
                    { className: 'hi-editor-head' },
                    h(
                      'div',
                      null,
                      h('h2', null, itemDisplayName(currentItem, index)),
                      h(
                        'p',
                        null,
                        t('annotate.itemIndex', { index: index + 1, total: items.length }),
                        currentAnnotation && currentAnnotation.status !== 'draft'
                          ? ` · ${t(`status.${currentAnnotation.status}`)}`
                          : '',
                      ),
                    ),
                    currentValue
                      ? h(
                          'span',
                          { className: 'hi-editor-index' },
                          typeof task.summary === 'function' ? task.summary(currentValue, options, t) : '',
                        )
                      : null,
                  ),
                  project.description
                    ? h('div', { className: 'hi-task-instruction', style: { marginBottom: 14 } }, project.description)
                    : null,
                  h(
                    'div',
                    { className: 'hi-tool-surface' },
                    h(task.Editor, {
                      key: currentItem.id,
                      item: currentItem,
                      value: currentValue,
                      options,
                      onChange: handleChange,
                      t,
                      ui,
                    }),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'hi-editor-foot' },
                saveStatusNode,
                h(
                  ui.Button,
                  {
                    size: 'sm',
                    variant: 'ghost',
                    icon: 'chevron-left',
                    disabled: index <= 0,
                    onClick: () => void go(index - 1),
                  },
                  t('annotate.prev'),
                ),
                h(
                  ui.Button,
                  {
                    size: 'sm',
                    variant: 'ghost',
                    icon: 'chevron-right',
                    disabled: index >= items.length - 1,
                    onClick: () => void go(index + 1),
                  },
                  t('annotate.next'),
                ),
                h(ui.Button, { size: 'sm', variant: 'secondary', icon: 'skip', onClick: () => void commit('skipped') }, t('annotate.skip')),
                h(
                  ui.Button,
                  {
                    size: 'sm',
                    variant: 'primary',
                    icon: 'check',
                    disabled: !canComplete,
                    title: currentProblem ? t(currentProblem) : undefined,
                    onClick: () => void commit('done'),
                  },
                  t('annotate.done'),
                ),
              ),
            ),
      ),
    ),
  );
}

function WorkbenchPage(props) {
  const ui = props.ui;
  const registry = props.registry;
  const [pluginLanguage, setPluginLanguage] = useState(() => initialPluginLanguage(props));
  const t = useMemo(
    () => makeLocalTranslator(pluginLanguage, DICTIONARIES, pluginLanguage === 'zh' ? 'en' : 'zh'),
    [pluginLanguage],
  );
  const [phase, setPhase] = useState('loading');
  const [projects, setProjects] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [customTools, setCustomTools] = useState([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVE_TAB_KEY);
      if (stored === 'tasks' || stored === 'datasets' || stored === 'tools') return stored;
    } catch {
      // A blocked storage API falls back to the task overview.
    }
    return 'tasks';
  });
  const [createToolOpen, setCreateToolOpen] = useState(false);
  const [createDatasetOpen, setCreateDatasetOpen] = useState(false);
  const [datasetDetailId, setDatasetDetailId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [taskTool, setTaskTool] = useState(null);
  const [annotating, setAnnotating] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());
  const translateRef = useRef(t);
  translateRef.current = t;

  const languageOptions = useMemo(
    () => [
      { id: 'zh', label: t('language.zh') },
      { id: 'en', label: t('language.en') },
    ],
    [t],
  );
  const languageValue = pluginLanguage;

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, pluginLanguage);
    } catch {
      // Remembering the plugin language is best effort.
    }
  }, [pluginLanguage]);

  function chooseLocale(next) {
    if (next !== 'zh' && next !== 'en') return;
    setPluginLanguage(next);
  }

  const allTools = useMemo(() => buildToolViews(registry, customTools), [registry, customTools]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      // Remembering the active tab is best effort.
    }
  }, [activeTab]);

  const pushToast = useCallback((message, kind) => {
    const id = uid('toast');
    setToasts((current) => [...current, { id, message, kind: kind || 'success' }]);
    const timer = window.setTimeout(() => {
      toastTimers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
    toastTimers.current.set(id, timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
      toastTimers.current.clear();
    },
    [],
  );

  const loadState = useCallback(async (silent) => {
    if (!silent) setPhase('loading');
    try {
      const state = await AnnotationApi.state();
      setProjects(Array.isArray(state.tasks) ? state.tasks : []);
      setDatasets(Array.isArray(state.datasets) ? state.datasets : []);
      setCustomTools(Array.isArray(state.tools) ? state.tools : []);
      setPhase('ready');
      setError('');
    } catch (failure) {
      setError(
        failure && failure.message === 'NETWORK'
          ? translateRef.current('common.networkError')
          : failure && failure.message
            ? failure.message
            : '',
      );
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadState(false);
  }, [loadState]);

  function askDeleteProject(project) {
    setConfirm({
      title: t('project.deleteTitle'),
      body: t('project.deleteBody', { n: project.stats ? project.stats.total : 0 }),
      confirmLabel: t('project.delete'),
      onConfirm: async () => {
        await AnnotationApi.tasks.remove(project.id);
        pushToast(t('toast.projectDeleted'), 'success');
        await loadState(true);
      },
    });
  }

  function askDeleteTool(tool) {
    setConfirm({
      title: t('tools.deleteTitle'),
      body: t('tools.deleteBody', { name: toolTitle(tool, registry, t) }),
      confirmLabel: t('tools.deleteAction'),
      onConfirm: async () => {
        await AnnotationApi.tools.remove(tool.id);
        pushToast(t('tools.deleted'), 'success');
        await loadState(true);
      },
    });
  }

  function askDeleteDataset(dataset) {
    if (dataset.taskCount > 0) {
      pushToast(t('datasets.inUse', { n: dataset.taskCount }), 'error');
      return;
    }
    setConfirm({
      title: t('datasets.deleteTitle'),
      body: t('datasets.deleteBody', { n: dataset.itemCount || 0 }),
      confirmLabel: t('datasets.delete'),
      onConfirm: async () => {
        await AnnotationApi.datasets.remove(dataset.id);
        pushToast(t('datasets.deleted'), 'success');
        if (datasetDetailId === dataset.id) setDatasetDetailId(null);
        await loadState(true);
      },
    });
  }

  function openCreateDataset() {
    setCreateDatasetOpen(true);
  }

  function onDatasetCreated(dataset) {
    setCreateDatasetOpen(false);
    pushToast(t('datasets.created'), 'success');
    void loadState(true);
    setActiveTab('datasets');
    setDatasetDetailId(dataset.id);
  }

  function openTaskCreator(tool) {
    setPickerOpen(false);
    setTaskTool(tool);
  }

  function onToolCreated(tool) {
    setCreateToolOpen(false);
    pushToast(t('tools.created'), 'success');
    void loadState(true);
    setTaskTool(tool);
  }

  function onTaskCreated(project) {
    setTaskTool(null);
    pushToast(t('toast.projectCreated'), 'success');
    void loadState(true);
    setAnnotating(project.id);
  }

  function openCreateTool() {
    setPickerOpen(false);
    setCreateToolOpen(true);
  }

  const css = props.css;

  if (phase === 'loading' && projects.length === 0 && datasets.length === 0 && customTools.length === 0) {
    return h(
      'div',
      { className: 'hi-root hi-root-loading' },
      h('style', null, css),
      h(ui.Spinner, { label: t('common.loading') }),
    );
  }

  if (phase === 'error' && projects.length === 0 && datasets.length === 0 && customTools.length === 0) {
    return h(
      'div',
      { className: 'hi-root hi-root-loading' },
      h('style', null, css),
      h(
        'div',
        { className: 'hi-load-error' },
        h(ui.Icon, { name: 'alert', size: 25 }),
        h('h2', null, t('common.networkError')),
        h('p', null, error),
        h(ui.Button, { variant: 'primary', icon: 'refresh', onClick: () => void loadState(false) }, t('common.retry')),
      ),
    );
  }

  const tabs = [
    { id: 'tasks', label: t('tasks.tab'), icon: 'layers', count: projects.length },
    { id: 'datasets', label: t('datasets.tab'), icon: 'database', count: datasets.length },
    { id: 'tools', label: t('tools.tab'), icon: 'grid', count: allTools.length },
  ];

  const home = datasetDetailId
    ? h(DatasetDetail, {
        key: `dataset-${datasetDetailId}`,
        datasetId: datasetDetailId,
        ui,
        t,
        registry,
        pushToast,
        onBack: () => setDatasetDetailId(null),
        onChanged: () => void loadState(true),
        onDelete: askDeleteDataset,
      })
    : activeTab === 'tasks'
      ? h(TasksHome, {
          key: 'home-tasks',
          ui,
          t,
          registry,
          projects,
          query,
          onPickTool: () => setPickerOpen(true),
          onOpen: setAnnotating,
          onDelete: askDeleteProject,
        })
      : activeTab === 'datasets'
        ? h(DatasetsHome, {
            key: 'home-datasets',
            ui,
            t,
            registry,
            datasets,
            query,
            onCreate: openCreateDataset,
            onOpen: (dataset) => setDatasetDetailId(dataset.id),
            onDelete: askDeleteDataset,
          })
        : h(ToolsHome, {
            key: 'home-tools',
            ui,
            t,
            registry,
            tools: allTools,
            projects,
            query,
            onCreateTool: openCreateTool,
            onCreateTask: openTaskCreator,
            onDeleteTool: askDeleteTool,
          });

  return h(
    'div',
    { className: 'hi-root' },
    h('style', null, css),
    annotating !== null
      ? h(Annotator, {
          key: annotating,
          projectId: annotating,
          ui,
          t,
          registry,
          onBack: () => {
            setAnnotating(null);
            void loadState(true);
          },
          onChanged: () => void loadState(true),
          pushToast,
        })
      : [
          h(
            'header',
            { key: 'topbar', className: 'hi-topbar' },
            h(
              'div',
              { className: 'hi-brand' },
              h('span', { className: 'hi-brandmark' }, h(HumanIntelligenceLogo, { size: 32 })),
              h(
                'div',
                { className: 'hi-brandcopy' },
                h('strong', null, t('title')),
                h('span', null, t('subtitle')),
              ),
            ),
            h(
              'nav',
              { className: 'hi-top-tabs', role: 'tablist', 'aria-label': t('catalog.tabsLabel') },
              tabs.map((tab) =>
                h(
                  'button',
                  {
                    key: tab.id,
                    type: 'button',
                    role: 'tab',
                    'aria-selected': tab.id === activeTab,
                    className: cx('hi-top-tab', tab.id === activeTab && 'is-active'),
                    onClick: () => {
                      setActiveTab(tab.id);
                      setDatasetDetailId(null);
                    },
                  },
                  h(ui.Icon, { name: tab.icon || 'grid', size: 14 }),
                  h('span', null, tab.label),
                  h('span', { className: 'hi-top-tab-count' }, tab.count),
                ),
              ),
            ),
            h(
              'div',
              { className: 'hi-top-search' },
              h(ui.Icon, { name: 'search', size: 15 }),
              h('input', {
                className: 'hi-input',
                type: 'search',
                value: query,
                placeholder:
                  activeTab === 'tasks'
                    ? t('nav.searchTasks')
                    : activeTab === 'datasets'
                      ? t('nav.searchDatasets')
                      : t('nav.searchTools'),
                'aria-label': t('nav.search'),
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'hi-top-actions' },
              h(
                'select',
                {
                  className: 'hi-language-select',
                  value: languageValue,
                  title: t('language.title'),
                  'aria-label': t('language.title'),
                  onChange: (event) => chooseLocale(event.target.value),
                },
                languageOptions.map((option) =>
                  h('option', { key: option.id, value: option.id }, option.label),
                ),
              ),
              h(ui.IconButton, {
                icon: 'refresh',
                label: t('nav.refresh'),
                onClick: () => void loadState(true),
              }),
              h(
                ui.Button,
                {
                  variant: 'primary',
                  icon: 'plus',
                  onClick:
                    activeTab === 'tools'
                      ? openCreateTool
                      : activeTab === 'datasets'
                        ? openCreateDataset
                        : () => setPickerOpen(true),
                },
                activeTab === 'tools'
                  ? t('tools.new')
                  : activeTab === 'datasets'
                    ? t('datasets.new')
                    : t('nav.newProject'),
              ),
            ),
          ),
          home,
        ],
    createToolOpen
      ? h(CreateToolDialog, {
          ui,
          registry,
          t,
          onClose: () => setCreateToolOpen(false),
          onCreated: onToolCreated,
        })
      : null,
    createDatasetOpen
      ? h(CreateDatasetDialog, {
          ui,
          registry,
          t,
          onClose: () => setCreateDatasetOpen(false),
          onCreated: onDatasetCreated,
        })
      : null,
    pickerOpen
      ? h(ToolPickerDialog, {
          ui,
          t,
          registry,
          projects,
          tools: allTools,
          onPick: openTaskCreator,
          onClose: () => setPickerOpen(false),
          onCreateTool: openCreateTool,
        })
      : null,
    taskTool
      ? h(CreateTaskDialog, {
          ui,
          t,
          registry,
          tool: taskTool,
          datasets,
          onClose: () => setTaskTool(null),
          onCreated: onTaskCreated,
        })
      : null,
    confirm
      ? h(ConfirmDialog, {
          ui,
          t,
          title: confirm.title,
          body: confirm.body,
          confirmLabel: confirm.confirmLabel,
          onConfirm: confirm.onConfirm,
          onClose: () => setConfirm(null),
        })
      : null,
    h(ToastStack, { h, Icon: ui.Icon, toasts }),
  );
}
