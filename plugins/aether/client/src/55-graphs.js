    function GraphsView({ t, data, onNew, onEdit, onCopy, onDelete }) {
      const [menu, setMenu] = useState(null);
      const showMenu = (graph, x, y) => {
        setMenu({
          graph,
          x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - 240)),
          y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - 140)),
        });
      };
      const openMenu = (event, graph) => {
        event.preventDefault();
        event.stopPropagation();
        showMenu(graph, event.clientX, event.clientY);
      };
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
                    onContextMenu: (event) => openMenu(event, graph),
                    onKeyDown: (event) => {
                      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      showMenu(graph, rect.left + 28, rect.top + 30);
                    },
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
        menu
          ? h(ContextMenu, {
              menu: {
                x: menu.x,
                y: menu.y,
                items: [
                  {
                    key: 'edit',
                    label: t('graphEditor.edit'),
                    onSelect: () => onEdit(menu.graph.id),
                  },
                  {
                    key: 'copy',
                    label: t('graphs.copyId'),
                    onSelect: () => onCopy(menu.graph),
                  },
                  {
                    key: 'delete',
                    label: t('graphs.deleteExperiment'),
                    danger: true,
                    onSelect: () => onDelete(menu.graph),
                  },
                ],
              },
              onClose: () => setMenu(null),
            })
          : null,
      );
    }
