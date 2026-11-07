/* Per-modality home: tab-owned task catalogue and project list. */

function ProjectRow(props) {
  const ui = props.ui;
  const project = props.project;
  const modality = props.registry.modalityOf(project.modality);
  const task = props.registry.taskOf(project.modality, project.task);
  if (!modality || !task) return null;
  const stats = project.stats || { total: 0, done: 0, skipped: 0, progress: 0 };
  const reviewed = stats.done + stats.skipped;
  return h(
    'div',
    {
      className: 'hi-project-row',
      role: 'button',
      tabIndex: 0,
      onClick: () => props.onOpen(),
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen();
        }
      },
    },
    h('span', { className: 'hi-project-icon' }, h(ui.Icon, { name: modality.icon || 'grid', size: 17 })),
    h(
      'div',
      { className: 'hi-project-main' },
      h(
        'div',
        { className: 'hi-project-line' },
        h('span', { className: 'hi-project-name' }, project.name),
        h(ui.Badge, { tone: 'brand' }, props.t(modality.titleKey)),
        h(ui.Badge, null, props.t(task.titleKey)),
      ),
      h(
        'div',
        { className: 'hi-project-meta' },
        h('span', null, stats.total === 0 ? props.t('project.noData') : props.t('project.progress', { done: reviewed, total: stats.total })),
        h('span', null, props.t('project.updated', { time: formatDate(project.updatedAt) })),
        project.description ? h('span', { className: 'hi-project-desc' }, project.description.slice(0, 90)) : null,
      ),
    ),
    h(
      'div',
      { className: 'hi-project-progress' },
      h(ui.ProgressBar, { value: stats.progress || 0 }),
      h('span', null, `${reviewed}/${stats.total}`),
    ),
    h(
      'div',
      { className: 'hi-project-actions', onClick: (event) => event.stopPropagation() },
      h(
        ui.Button,
        { size: 'sm', variant: 'secondary', icon: 'cursor', onClick: () => props.onOpen() },
        props.t('project.start'),
      ),
      h(
        'a',
        {
          className: 'hi-iconbtn',
          href: AnnotationApi.tasks.exportUrl(project.id),
          download: '',
          title: props.t('project.export'),
          'aria-label': props.t('project.export'),
        },
        h(ui.Icon, { name: 'download', size: 15 }),
      ),
      h(ui.IconButton, {
        icon: 'trash',
        label: props.t('project.delete'),
        className: 'hi-danger-hover',
        onClick: () => props.onDelete(project),
      }),
    ),
  );
}

function TasksHome(props) {
  const ui = props.ui;
  const t = props.t;
  const registry = props.registry;
  const projects = props.projects;
  const query = props.query;
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (filter !== 'all' && project.modality !== filter) return false;
      if (needle === '') return true;
      const modality = registry.modalityOf(project.modality);
      const task = registry.taskOf(project.modality, project.task);
      const haystack = [
        project.name,
        project.description,
        modality ? t(modality.titleKey) : project.modality,
        task ? t(task.titleKey) : project.task,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [projects, query, filter, registry, t]);

  const totals = useMemo(() => {
    let items = 0;
    let completed = 0;
    for (const project of projects) {
      const stats = project.stats || {};
      items += stats.total || 0;
      completed += (stats.done || 0) + (stats.skipped || 0);
    }
    return { projects: projects.length, items, completed, rate: items === 0 ? 0 : completed / items };
  }, [projects]);

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
          h('h1', null, t('tasks.heading')),
          h('p', null, t('tasks.subtitle')),
        ),
        h(
          ui.Button,
          { variant: 'primary', icon: 'plus', onClick: () => props.onPickTool() },
          t('nav.newProject'),
        ),
      ),
      h(
        'div',
        { className: 'hi-stats' },
        h(
          'div',
          { className: 'hi-stat' },
          h('span', { className: 'hi-stat-icon' }, h(ui.Icon, { name: 'folder', size: 16 })),
          h('div', null, h('strong', null, totals.projects), h('span', null, t('stats.projects'))),
        ),
        h(
          'div',
          { className: 'hi-stat is-items' },
          h('span', { className: 'hi-stat-icon' }, h(ui.Icon, { name: 'database', size: 16 })),
          h('div', null, h('strong', null, totals.items), h('span', null, t('stats.items'))),
        ),
        h(
          'div',
          { className: 'hi-stat is-complete' },
          h('span', { className: 'hi-stat-icon' }, h(ui.Icon, { name: 'check', size: 16 })),
          h('div', null, h('strong', null, totals.completed), h('span', null, t('stats.completed'))),
        ),
        h(
          'div',
          { className: 'hi-stat is-rate' },
          h('span', { className: 'hi-stat-icon' }, h(ui.Icon, { name: 'spark', size: 16 })),
          h('div', null, h('strong', null, `${Math.round(totals.rate * 100)}%`), h('span', null, t('stats.rate'))),
        ),
      ),
      h(
        'section',
        { className: 'hi-section', style: { marginTop: 0 } },
        h(
          'div',
          { className: 'hi-section-head' },
          h('div', null, h('h2', null, t('tasks.list')), h('p', null, t('tasks.listHint'))),
          h('span', { className: 'hi-toolbar-count' }, t('projects.count', { n: filtered.length })),
        ),
        h(
          'div',
          { className: 'hi-toolbar' },
          h(
            'div',
            { className: 'hi-segmented', role: 'tablist', 'aria-label': t('tasks.filterLabel') },
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
        ),
        filtered.length === 0
          ? h(ui.EmptyState, {
              icon: 'layers',
              title: projects.length === 0 ? t('tasks.emptyTitle') : t('projects.noMatchTitle'),
              body: projects.length === 0 ? t('tasks.emptyBody') : t('projects.noMatchBody'),
              action:
                projects.length === 0
                  ? h(
                      ui.Button,
                      { variant: 'primary', icon: 'plus', onClick: () => props.onPickTool() },
                      t('nav.newProject'),
                    )
                  : null,
            })
          : h(
              'div',
              { className: 'hi-project-list' },
              filtered.map((project) =>
                h(ProjectRow, {
                  key: project.id,
                  project,
                  registry,
                  t,
                  ui,
                  onOpen: () => props.onOpen(project.id),
                  onDelete: props.onDelete,
                }),
              ),
            ),
      ),
    ),
  );
}
