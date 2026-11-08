    // ---------------------------------------------------------- 实验

    function LogModal({ t, runId, node, onClose }) {
      const [stream, setStream] = useState('out');
      const [text, setText] = useState('');
      const [loading, setLoading] = useState(true);
      const [failed, setFailed] = useState('');

      const load = useCallback(
        async (nextStream = stream) => {
          setLoading(true);
          setFailed('');
          try {
            const response = await fetch(
              `${API}/experiments/logs?run=${encodeURIComponent(runId)}&node=${encodeURIComponent(node.path)}&stream=${nextStream}`,
              { cache: 'no-store', credentials: 'same-origin' },
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setText(await response.text());
          } catch (error) {
            setFailed(String(error && error.message ? error.message : error));
          } finally {
            setLoading(false);
          }
        },
        [runId, node.path, stream],
      );

      useEffect(() => {
        void load(stream);
      }, [runId, node.path, stream]);

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // 剪贴板不可用时静默失败，日志仍然可见。
        }
      };

      return h(
        Modal,
        {
          t,
          wide: true,
          title: `${t('log.title')} · ${node.label || node.path}`,
          onClose,
          footer: [
            h('button', { key: 'copy', type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => void copy() }, t('log.copy')),
            h('button', { key: 'refresh', type: 'button', className: 'ath-btn', onClick: () => void load(stream), disabled: loading }, t('log.refresh')),
            h('button', { key: 'close', type: 'button', className: 'ath-btn ath-btn-primary', onClick: onClose }, t('log.close')),
          ],
        },
        h(
          'div',
          { className: 'ath-detail', style: { gap: 10 } },
          h(
            'div',
            { className: 'ath-chips' },
            h(
              'button',
              { type: 'button', className: 'ath-chip', 'data-active': stream === 'out' ? 'true' : 'false', onClick: () => setStream('out') },
              t('experiments.stdout'),
            ),
            h(
              'button',
              { type: 'button', className: 'ath-chip', 'data-active': stream === 'err' ? 'true' : 'false', onClick: () => setStream('err') },
              t('experiments.stderr'),
            ),
            h('span', { className: 'ath-hint ath-mono' }, node.path),
          ),
          loading
            ? h('div', { className: 'ath-loading' }, h('i', { className: 'ath-spinner' }), t('common.loading'))
            : failed
              ? h('div', { className: 'ath-error' }, failed)
              : h('pre', { className: 'ath-log-pre' }, text || t('experiments.logEmpty')),
        ),
      );
    }

    function OutputModal({ t, runId, node, port, onClose }) {
      const [text, setText] = useState('');
      const [loading, setLoading] = useState(true);
      const [failed, setFailed] = useState('');

      const load = useCallback(async () => {
        setLoading(true);
        setFailed('');
        try {
          const response = await fetch(
            `${API}/experiments/logs?run=${encodeURIComponent(runId)}&node=${encodeURIComponent(
              node.path,
            )}&stream=out`,
            { cache: 'no-store', credentials: 'same-origin' },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setText(await response.text());
        } catch (error) {
          setFailed(String(error && error.message ? error.message : error));
        } finally {
          setLoading(false);
        }
      }, [runId, node.path]);

      useEffect(() => {
        void load();
      }, [load]);

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // 剪贴板不可用时静默失败。
        }
      };

      const download = () => {
        const anchor = document.createElement('a');
        anchor.href = `${API}/experiments/download?run=${encodeURIComponent(runId)}&node=${encodeURIComponent(
          node.path,
        )}&port=${encodeURIComponent(port)}`;
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      return h(
        Modal,
        {
          t,
          wide: true,
          title: `${t('runs.outputTitle')} · ${node.label || node.path} · ${port}`,
          onClose,
          footer: [
            h('button', { key: 'copy', type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => void copy() }, t('log.copy')),
            h('button', { key: 'download', type: 'button', className: 'ath-btn ath-btn-ghost', onClick: download }, t('runs.downloadOutput')),
            h('button', { key: 'close', type: 'button', className: 'ath-btn ath-btn-primary', onClick: onClose }, t('log.close')),
          ],
        },
        h(
          'div',
          { className: 'ath-detail', style: { gap: 10 } },
          h(
            'div',
            { className: 'ath-chips' },
            h('span', { className: 'ath-badge', 'data-kind': 'dataset' }, port),
            h('span', { className: 'ath-hint ath-mono' }, node.path),
          ),
          loading
            ? h('div', { className: 'ath-loading' }, h('i', { className: 'ath-spinner' }), t('common.loading'))
            : failed
              ? h('div', { className: 'ath-error' }, failed)
              : h('pre', { className: 'ath-log-pre' }, text || t('runs.outputEmpty')),
        ),
      );
    }

    function SubmitDialog({ t, graphs, executors, onClose, onSubmit, busy }) {
      const [graphId, setGraphId] = useState(() => (graphs[0] ? graphs[0].id : ''));
      const [name, setName] = useState('');
      const [concurrency, setConcurrency] = useState(3);
      const graph = graphs.find((item) => item.id === graphId) || null;
      return h(
        Modal,
        {
          t,
          title: t('experiments.new'),
          onClose: busy ? () => {} : onClose,
          footer: [
            h('button', { key: 'cancel', type: 'button', className: 'ath-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
            h(
              'button',
              {
                key: 'submit',
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                disabled: busy || !graphId,
                onClick: () => onSubmit({ graphId, name, concurrency }),
              },
              busy ? t('experiments.submitting') : t('experiments.submit'),
            ),
          ],
        },
        graphs.length === 0
          ? h('div', { className: 'ath-hint' }, t('experiments.noGraphs'))
          : h(
              'div',
              null,
              h(
                'div',
                { className: 'ath-field' },
                h('label', { className: 'ath-label' }, t('experiments.graph')),
                h(
                  'select',
                  {
                    className: 'ath-select',
                    value: graphId,
                    onChange: (event) => setGraphId(event.target.value),
                  },
                  graphs.map((item) => h('option', { key: item.id, value: item.id }, item.name)),
                ),
              ),
              h(
                'div',
                { className: 'ath-field' },
                h('label', { className: 'ath-label' }, t('experiments.name')),
                h('input', {
                  className: 'ath-input',
                  type: 'text',
                  value: name,
                  placeholder: t('experiments.namePlaceholder'),
                  maxLength: 120,
                  onChange: (event) => setName(event.target.value),
                }),
              ),
              h(
                'div',
                { className: 'ath-field' },
                h('label', { className: 'ath-label' }, t('experiments.concurrency')),
                h('input', {
                  className: 'ath-input',
                  type: 'number',
                  min: 1,
                  max: 8,
                  value: concurrency,
                  onChange: (event) => setConcurrency(Number(event.target.value) || 1),
                }),
              ),
              graph
                ? h(
                    'div',
                    { className: 'ath-card', style: { marginTop: 14 } },
                    h('div', { className: 'ath-section-title' }, t('experiments.plan')),
                    h(
                      'div',
                      { className: 'ath-stat-row' },
                      h('span', null, tr(t, 'experiments.planSummary', { nodes: graph.nodeCount, layers: graph.layerCount })),
                      h(
                        'span',
                        null,
                        `${t('experiments.executor')} ${(executors || [])
                          .filter((executor) => executor.available)
                          .map((executor) => executorLabel(t, executor.id))
                          .join(', ')}`,
                      ),
                    ),
                  )
                : null,
            ),
      );
    }

    function NewModuleDialog({ t, onClose, onPick }) {
      const options = [
        { kind: 'command', desc: 'newModule.commandDesc' },
        { kind: 'graph', desc: 'newModule.graphDesc' },
        { kind: 'dataset', desc: 'newModule.datasetDesc' },
      ];
      return h(
        Modal,
        { t, title: t('newModule.title'), onClose },
        h('div', { className: 'ath-hint', style: { marginBottom: 12 } }, t('newModule.subtitle')),
        h(
          'div',
          { className: 'ath-type-grid' },
          options.map((option) =>
            h(
              'button',
              {
                key: option.kind,
                type: 'button',
                className: 'ath-type-card',
                onClick: () => onPick(option.kind),
              },
              h('span', { className: 'ath-badge', 'data-kind': option.kind }, t(`modules.kind.${option.kind}`)),
              h('strong', { className: 'ath-type-title' }, t(`modules.kind.${option.kind}`)),
              h('span', { className: 'ath-hint' }, t(option.desc)),
              h('span', { className: 'ath-type-action' }, t('newModule.choose')),
            ),
          ),
        ),
      );
    }

    function ExperimentsView({
      t,
      data,
      runId,
      runDetail,
      filter,
      setFilter,
      onOpenRun,
      onNew,
      onCancelRun,
      onCopyRun,
      onRerun,
      onDeleteRun,
      onOpenFolder,
      onOpenLog,
      onViewOutput,
    }) {
      const [query, setQuery] = useState('');
      const keyword = query.trim().toLowerCase();
      const runs = (data.experiments || []).filter((run) => {
        if (filter === 'running' && run.status !== 'running') return false;
        if (filter === 'failed' && run.status !== 'failed') return false;
        if (filter === 'finished' && run.status === 'running') return false;
        if (!keyword) return true;
        const nodeText = (run.nodes || [])
          .flatMap((node) => [node.label, node.moduleName, node.path])
          .filter(Boolean)
          .join(' ');
        return [run.name, run.id, run.graphName, run.graphId, run.message, statusText(t, run.status), nodeText]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      });
      const current = runDetail;

      return h(
        'div',
        { className: 'ath-page ath-page-runs' },
        h(
          'div',
          { className: 'ath-page-head' },
          h(
            'div',
            null,
            h('h2', { className: 'ath-page-title' }, t('experiments.title')),
            h('p', { className: 'ath-page-sub' }, t('experiments.subtitle')),
          ),
          h(
            'div',
            { className: 'ath-actions' },
            h(
              'button',
              { type: 'button', className: 'ath-btn ath-btn-primary', onClick: onNew, disabled: (data.graphs || []).length === 0 },
              t('experiments.new'),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ath-split' },
          h(
            'div',
            null,
            h('input', {
              className: 'ath-input',
              type: 'search',
              value: query,
              placeholder: t('experiments.searchPlaceholder'),
              style: { marginBottom: 8 },
              onChange: (event) => setQuery(event.target.value),
            }),
            h(
              'div',
              { className: 'ath-chips', style: { marginBottom: 8 } },
              ['all', 'running', 'finished', 'failed'].map((key) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    className: 'ath-chip',
                    'data-active': filter === key ? 'true' : 'false',
                    onClick: () => setFilter(key),
                  },
                  t(`experiments.filter.${key}`),
                ),
              ),
            ),
            (data.experiments || []).length === 0
              ? h(EmptyState, { title: t('experiments.empty') })
              : h(
                  'div',
                  { className: 'ath-run-list' },
                  runs.length === 0
                    ? h('div', { className: 'ath-hint', style: { padding: '14px' } }, t('experiments.emptyResult'))
                    : runs.map((run) =>
                        h(
                          'button',
                          {
                            key: run.id,
                            type: 'button',
                            className: 'ath-run-item',
                            'data-active': run.id === runId ? 'true' : 'false',
                            onClick: () => onOpenRun(run.id),
                          },
                          h(
                            'div',
                            { className: 'ath-run-title' },
                            h('span', null, run.name),
                            h('span', { className: 'ath-status', 'data-status': statusClass(run.status), style: { marginLeft: 'auto' } }, statusText(t, run.status)),
                          ),
                          h(
                            'div',
                            { className: 'ath-run-meta' },
                            h('span', null, run.graphName),
                            h('span', null, '·'),
                            h('span', null, tr(t, 'experiments.progress', { done: run.counts.done, total: run.counts.total })),
                            h('span', null, '·'),
                            h('span', null, formatDateTime(run.createdAt)),
                          ),
                          h(
                            'div',
                            { className: 'ath-progress', 'data-status': statusClass(run.status) },
                            h('i', {
                              style: { width: `${run.counts.total ? Math.round((run.counts.done / run.counts.total) * 100) : 0}%` },
                            }),
                          ),
                        ),
                      ),
                ),
          ),
          current
            ? h(
                'div',
                { className: 'ath-detail ath-run-detail' },
                h(
                  'div',
                  { className: 'ath-card' },
                  h(
                    'div',
                    { className: 'ath-detail-head' },
                    h(
                      'div',
                      { style: { minWidth: 0 } },
                      h('h3', { className: 'ath-detail-title' }, current.name),
                      h(
                        'div',
                        { className: 'ath-detail-meta' },
                        h('span', { className: 'ath-status', 'data-status': statusClass(current.status) }, statusText(t, current.status)),
                        h('span', null, current.graphName),
                        h('span', null, `${t('experiments.startedAt')} ${formatDateTime(current.startedAt)}`),
                        h('span', null, `${t('experiments.endedAt')} ${formatDateTime(current.endedAt)}`),
                        h('span', null, `${t('experiments.concurrency')} ${current.concurrency}`),
                        h('span', null, `${t('experiments.executor')} ${executorLabel(t, current.executor)}`),
                      ),
                      current.message ? h('div', { className: 'ath-hint', style: { marginTop: 4 } }, current.message) : null,
                    ),
                    h(
                      'div',
                      { className: 'ath-detail-actions' },
                      current.status === 'running'
                        ? h('button', { type: 'button', className: 'ath-btn ath-btn-danger', onClick: () => onCancelRun(current) }, t('experiments.cancel'))
                        : null,
                      h('button', { type: 'button', className: 'ath-btn', onClick: () => onCopyRun(current) }, t('experiments.copy')),
                      h('button', { type: 'button', className: 'ath-btn', onClick: () => onRerun(current) }, t('experiments.rerun')),
                      h('button', { type: 'button', className: 'ath-btn', onClick: () => onOpenFolder(current) }, t('experiments.openDir')),
                      current.status !== 'running'
                        ? h('button', { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: () => onDeleteRun(current) }, t('experiments.delete'))
                        : null,
                    ),
                  ),
                  h(
                    'div',
                    { className: 'ath-stat-row', style: { marginTop: 12 } },
                    h('span', null, `${t('common.nodes')} `, h('b', null, `${current.counts.done}/${current.counts.total}`)),
                    h('span', null, `${t('status.succeeded')} `, h('b', null, current.counts.succeeded)),
                    h('span', null, `${t('status.failed')} `, h('b', null, current.counts.failed)),
                    h('span', null, `${t('status.running')} `, h('b', null, current.counts.running)),
                    h('span', null, `${t('status.pending')} `, h('b', null, current.counts.pending)),
                  ),
                  h(
                    'div',
                    { className: 'ath-progress', 'data-status': statusClass(current.status), style: { marginTop: 8 } },
                    h('i', {
                      style: { width: `${current.counts.total ? Math.round((current.counts.done / current.counts.total) * 100) : 0}%` },
                    }),
                  ),
                ),
                h(RunDag, {
                  t,
                  experiment: current,
                  onOpenLog: (id, node) => onOpenLog(id, node),
                  onViewOutput: (id, node, port) => onViewOutput(id, node, port),
                }),
              )
            : h(EmptyState, { title: t('experiments.select') }),
        ),
      );
    }

    // ---------------------------------------------------------- 图列表
