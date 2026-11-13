    function GraphsView({ t, data, onNew, onEdit }) {
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
                  'button',
                  {
                    type: 'button',
                    key: graph.id,
                    className: 'ath-module-card ath-graph-card',
                    title: t('graphs.open'),
                    onClick: () => onEdit(graph.id),
                  },
                  h(
                    'div',
                    { className: 'ath-module-head' },
                    h('span', { className: 'ath-module-name' }, graph.name),
                  ),
                  h('div', { className: 'ath-graph-id ath-mono' }, graph.id),
                ),
              ),
            ),
      );
    }
