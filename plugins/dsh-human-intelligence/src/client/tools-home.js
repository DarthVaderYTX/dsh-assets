/* Annotation tool catalogue: preset tools grouped by modality plus custom tools. */

function toolTask(tool, registry) {
  return registry.taskOf(tool.modality, tool.task);
}

function toolModality(tool, registry) {
  return registry.modalityOf(tool.modality);
}

function toolTitle(tool, registry, t) {
  if (!tool.preset) return tool.name;
  const task = toolTask(tool, registry);
  return task ? t(task.titleKey) : tool.task;
}

function toolDescription(tool, registry, t) {
  const task = toolTask(tool, registry);
  const modality = toolModality(tool, registry);
  if (tool.preset) return task ? t(task.descriptionKey) : '';
  return [modality ? t(modality.titleKey) : tool.modality, task ? t(task.titleKey) : tool.task].join(' · ');
}

function toolChips(tool, registry, t) {
  const task = toolTask(tool, registry);
  const fields = task && Array.isArray(task.options) ? task.options : [];
  const chips = [];
  for (const field of fields) {
    const value = tool.taskOptions ? tool.taskOptions[field.key] : undefined;
    if (field.kind === 'tags' && Array.isArray(value)) {
      for (const entry of value) chips.push(entry);
    } else if (field.kind === 'select' && value !== undefined && value !== null && value !== '') {
      chips.push(`${t(field.labelKey)}: ${value}`);
    }
  }
  return chips;
}

function toolTaskCount(tool, projects) {
  return projects.reduce((count, project) => {
    if (project.toolId === tool.id) return count + 1;
    if (tool.preset && !project.toolId && project.modality === tool.modality && project.task === tool.task) {
      return count + 1;
    }
    return count;
  }, 0);
}

function buildToolViews(registry, customTools) {
  const presets = registry.allTasks().map(({ modality, task }) => ({
    id: `preset:${task.id}`,
    preset: true,
    modality: modality.id,
    task: task.id,
    name: '',
    taskOptions: registry.defaultTaskOptions(task),
  }));
  const custom = (Array.isArray(customTools) ? customTools : [])
    .filter((tool) => tool && registry.modalityOf(tool.modality) && registry.taskOf(tool.modality, tool.task))
    .map((tool) => ({ ...tool, preset: false }));
  return presets.concat(custom);
}

function ToolCard(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const tool = props.tool;
  const task = toolTask(tool, registry);
  const modality = toolModality(tool, registry);
  const chips = toolChips(tool, registry, t);
  const visibleChips = chips.slice(0, 4);
  const hiddenCount = chips.length - visibleChips.length;
  return h(
    'article',
    { className: 'hi-tool-card' },
    h(
      'div',
      { className: 'hi-tool-head' },
      h(
        'span',
        { className: 'hi-tool-icon' },
        h(ui.Icon, { name: task && task.icon ? task.icon : modality && modality.icon ? modality.icon : 'grid', size: 16 }),
      ),
      h(
        'div',
        { className: 'hi-tool-copy' },
        h(
          'div',
          { className: 'hi-tool-title' },
          h('strong', null, toolTitle(tool, registry, t)),
          tool.preset
            ? h(ui.Badge, { tone: 'brand' }, t('tools.badgePreset'))
            : h(ui.Badge, null, t('tools.badgeCustom')),
        ),
        h('p', null, toolDescription(tool, registry, t)),
      ),
    ),
    visibleChips.length > 0
      ? h(
          'div',
          { className: 'hi-tool-chips' },
          visibleChips.map((chip, index) =>
            h('span', { key: `${chip}-${index}`, className: 'hi-tool-chip' }, chip),
          ),
          hiddenCount > 0 ? h('span', { className: 'hi-tool-chip' }, `+${hiddenCount}`) : null,
        )
      : null,
    h(
      'div',
      { className: 'hi-tool-foot' },
      h('span', { className: 'hi-tool-count' }, t('tools.taskCount', { n: toolTaskCount(tool, props.projects) })),
      h(
        'div',
        { className: 'hi-tool-actions' },
        h(
          ui.Button,
          { size: 'sm', variant: 'secondary', icon: 'plus', onClick: () => props.onCreateTask(tool) },
          t('tasks.new'),
        ),
        tool.preset
          ? null
          : h(ui.IconButton, {
              icon: 'trash',
              label: t('tools.deleteAction'),
              className: 'hi-danger-hover',
              onClick: () => props.onDeleteTool(tool),
            }),
      ),
    ),
  );
}

function ToolsHome(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const tools = props.tools;
  const projects = props.projects;
  const query = props.query;
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (filter !== 'all' && tool.modality !== filter) return false;
      if (needle === '') return true;
      const task = toolTask(tool, registry);
      const modality = toolModality(tool, registry);
      const haystack = [
        toolTitle(tool, registry, t),
        toolDescription(tool, registry, t),
        task ? t(task.titleKey) : '',
        modality ? t(modality.titleKey) : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [tools, query, filter, registry, t]);

  const modalityFilters = [{ id: 'all', label: t('projects.filterAll') }].concat(
    registry.modalities.map((modality) => ({ id: modality.id, label: t(modality.titleKey) })),
  );
  const presets = visible.filter((tool) => tool.preset);
  const custom = visible.filter((tool) => !tool.preset);
  const hasCustom = tools.some((tool) => !tool.preset);
  const groups = registry.modalities
    .map((modality) => ({
      modality,
      tools: presets.filter((tool) => tool.modality === modality.id),
    }))
    .filter((group) => group.tools.length > 0);

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
          h('h1', null, t('tools.heading')),
          h('p', null, t('tools.subtitle')),
        ),
        h(
          ui.Button,
          { variant: 'primary', icon: 'plus', onClick: props.onCreateTool },
          t('tools.new'),
        ),
      ),
      h(
        'div',
        { className: 'hi-toolbar', style: { marginTop: 0 } },
        h(
          'div',
          { className: 'hi-segmented', role: 'tablist', 'aria-label': t('tools.filterLabel') },
          modalityFilters.map((entry) =>
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
        h('span', { className: 'hi-toolbar-count' }, t('tools.toolCount', { n: visible.length })),
      ),
      visible.length === 0
        ? h(ui.EmptyState, {
            icon: 'grid',
            title: t('tools.noMatchTitle'),
            body: t('tools.noMatchBody'),
            action: h(
              ui.Button,
              { variant: 'primary', icon: 'plus', onClick: props.onCreateTool },
              t('tools.new'),
            ),
          })
        : [
            groups.length > 0
              ? h(
                  'section',
                  { key: 'presets', className: 'hi-section', style: { marginTop: 0 } },
                  h(
                    'div',
                    { className: 'hi-section-head' },
                    h(
                      'div',
                      null,
                      h('h2', null, t('tools.presetsTitle')),
                      h('p', null, t('tools.presetsHint')),
                    ),
                  ),
                  groups.map((group) =>
                    h(
                      'div',
                      { key: group.modality.id, className: 'hi-tool-group' },
                      h(
                        'div',
                        { className: 'hi-tool-group-head' },
                        h(ui.Icon, { name: group.modality.icon || 'grid', size: 14 }),
                        h('strong', null, t(group.modality.titleKey)),
                        h('span', null, t('tools.toolCount', { n: group.tools.length })),
                      ),
                      h(
                        'div',
                        { className: 'hi-tool-grid' },
                        group.tools.map((tool) =>
                          h(ToolCard, {
                            key: tool.id,
                            tool,
                            projects,
                            registry,
                            t,
                            ui,
                            onCreateTask: props.onCreateTask,
                            onDeleteTool: props.onDeleteTool,
                          }),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
            h(
              'section',
              { key: 'custom', className: 'hi-section' },
              h(
                'div',
                { className: 'hi-section-head' },
                h(
                  'div',
                  null,
                  h('h2', null, t('tools.customTitle')),
                  h('p', null, t('tools.customHint')),
                ),
                h('span', { className: 'hi-toolbar-count' }, t('tools.toolCount', { n: tools.filter((tool) => !tool.preset).length })),
              ),
              custom.length > 0
                ? h(
                    'div',
                    { className: 'hi-tool-grid' },
                    custom.map((tool) =>
                      h(ToolCard, {
                        key: tool.id,
                        tool,
                        projects,
                        registry,
                        t,
                        ui,
                        onCreateTask: props.onCreateTask,
                        onDeleteTool: props.onDeleteTool,
                      }),
                    ),
                  )
                : hasCustom
                  ? null
                  : h(ui.EmptyState, {
                      icon: 'grid',
                      title: t('tools.customEmptyTitle'),
                      body: t('tools.customEmptyBody'),
                      action: h(
                        ui.Button,
                        { variant: 'secondary', icon: 'plus', onClick: props.onCreateTool },
                        t('tools.new'),
                      ),
                    }),
            ),
          ],
    ),
  );
}

function ToolPickerDialog(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const tools = props.tools;
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const visibleTools =
    needle === ''
      ? tools
      : tools.filter((tool) => {
          const task = toolTask(tool, registry);
          const modality = toolModality(tool, registry);
          return [toolTitle(tool, registry, t), toolDescription(tool, registry, t), task ? t(task.titleKey) : '', modality ? t(modality.titleKey) : '']
            .join(' ')
            .toLowerCase()
            .includes(needle);
        });
  const presets = visibleTools.filter((tool) => tool.preset);
  const custom = visibleTools.filter((tool) => !tool.preset);
  const groups = registry.modalities
    .map((modality) => ({
      modality,
      tools: presets.filter((tool) => tool.modality === modality.id),
    }))
    .filter((group) => group.tools.length > 0);

  function pickRow(tool) {
    const task = toolTask(tool, registry);
    const modality = toolModality(tool, registry);
    const chips = toolChips(tool, registry, t).slice(0, 3);
    return h(
      'button',
      {
        key: tool.id,
        type: 'button',
        className: 'hi-tool-pick',
        onClick: () => props.onPick(tool),
      },
      h(
        'span',
        { className: 'hi-tool-icon' },
        h(ui.Icon, { name: task && task.icon ? task.icon : modality && modality.icon ? modality.icon : 'grid', size: 16 }),
      ),
      h(
        'span',
        { className: 'hi-tool-pick-main' },
        h('strong', null, toolTitle(tool, registry, t)),
        h('span', null, toolDescription(tool, registry, t)),
        chips.length > 0
          ? h(
              'span',
              { className: 'hi-tool-chips' },
              chips.map((chip, index) => h('span', { key: `${chip}-${index}`, className: 'hi-tool-chip' }, chip)),
            )
          : null,
      ),
      h(
        'span',
        { className: 'hi-tool-pick-count' },
        t('tools.taskCount', { n: toolTaskCount(tool, props.projects) }),
      ),
    );
  }

  return h(
    ui.Modal,
    {
      title: t('tools.pickTitle'),
      subtitle: t('tools.pickSubtitle'),
      onClose: props.onClose,
      closeLabel: t('common.close'),
      width: 700,
      footer: [
        h(ui.Button, { key: 'cancel', onClick: props.onClose }, t('common.cancel')),
        h(
          ui.Button,
          { key: 'new', variant: 'secondary', icon: 'plus', onClick: props.onCreateTool },
          t('tools.new'),
        ),
      ],
    },
    h(
      'div',
      { className: 'hi-tool-pick-search' },
      h(ui.Icon, { name: 'search', size: 14 }),
      h('input', {
        className: 'hi-input',
        type: 'search',
        value: search,
        placeholder: t('tools.pickSearch'),
        'aria-label': t('tools.pickSearch'),
        onChange: (event) => setSearch(event.target.value),
      }),
    ),
    visibleTools.length === 0
      ? h('p', { className: 'hi-task-note', style: { textAlign: 'center', margin: '18px 0' } }, t('tools.noMatchTitle'))
      : null,
    groups.map((group) =>
      h(
        'div',
        { key: group.modality.id, className: 'hi-tool-pick-group' },
        h(
          'div',
          { className: 'hi-tool-group-head' },
          h(ui.Icon, { name: group.modality.icon || 'grid', size: 14 }),
          h('strong', null, t(group.modality.titleKey)),
        ),
        h('div', { className: 'hi-tool-pick-list' }, group.tools.map(pickRow)),
      ),
    ),
    custom.length > 0
      ? h(
          'div',
          { className: 'hi-tool-pick-group' },
          h(
            'div',
            { className: 'hi-tool-group-head' },
            h(ui.Icon, { name: 'grid', size: 14 }),
            h('strong', null, t('tools.customTitle')),
          ),
          h('div', { className: 'hi-tool-pick-list' }, custom.map(pickRow)),
        )
      : null,
  );
}
