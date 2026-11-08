    function GraphsView({ t, data, onNew, onEdit, onDelete }) {
      return h(
        'div',
        { className: 'ath-page' },
        h(
          'div',
          { className: 'ath-page-head' },
          h(
            'div',
            null,
            h('h2', { className: 'ath-page-title' }, t('graphs.title')),
            h('p', { className: 'ath-page-sub' }, t('graphs.subtitle')),
          ),
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn ath-btn-primary', onClick: onNew }, t('graphs.new')),
          ),
        ),
        (data.graphs || []).length === 0
          ? h(EmptyState, { title: t('graphs.empty') })
          : h(
              'div',
              { className: 'ath-card-grid' },
              data.graphs.map((graph) =>
                h(
                  'div',
                  { className: 'ath-module-card', key: graph.id },
                  h(
                    'div',
                    { className: 'ath-module-head' },
                    h('span', { className: 'ath-module-name' }, graph.name),
                    h('span', { className: 'ath-badge' }, `DAG`),
                    graph.isSubgraph ? h('span', { className: 'ath-badge' }, t('graphs.subgraph')) : null,
                  ),
                  h('div', { className: 'ath-module-desc' }, graph.description || ''),
                  h(
                    'div',
                    { className: 'ath-stat-row' },
                    h('span', null, tr(t, 'graphs.nodeCount', { n: graph.nodeCount })),
                    h('span', null, tr(t, 'graphs.edgeCount', { n: graph.edgeCount })),
                    h('span', null, tr(t, 'graphs.layerCount', { n: graph.layerCount || 0 })),
                  ),
                  h(
                    'div',
                    { className: 'ath-module-foot' },
                    h('span', { className: 'ath-hint' }, `${t('common.updatedAt')} ${formatDateTime(graph.updatedAt)}`),
                    h(
                      'div',
                      { className: 'ath-actions' },
                      h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => onEdit(graph.id) }, t('graphs.edit')),
                      h('button', { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: () => onDelete(graph) }, t('action.delete')),
                    ),
                  ),
                  (graph.usedBy || []).length
                    ? h(
                        'div',
                        { className: 'ath-chips' },
                        graph.usedBy.map((module) => h('span', { className: 'ath-badge', key: module.id }, `${t('graphs.usedBy')} ${module.name}`)),
                      )
                    : null,
                ),
              ),
            ),
      );
    }
