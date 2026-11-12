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
      const [view, setView] = useState(null);
      const [currentPath, setCurrentPath] = useState('');
      const [loading, setLoading] = useState(true);
      const [failed, setFailed] = useState('');

      const load = useCallback(
        async (filePath = '') => {
          setLoading(true);
          setFailed('');
          try {
            const query = new URLSearchParams({
              run: runId,
              node: node.path,
              port,
            });
            if (filePath) query.set('file', filePath);
            const response = await fetch(`${API}/experiments/artifact?${query.toString()}`, {
              cache: 'no-store',
              credentials: 'same-origin',
            });
            const payload = await response.json();
            if (!response.ok || payload.ok === false) {
              throw new Error(payload.error || `HTTP ${response.status}`);
            }
            setView(payload);
            setCurrentPath(filePath);
          } catch (error) {
            setFailed(String(error && error.message ? error.message : error));
          } finally {
            setLoading(false);
          }
        },
        [runId, node.path, port],
      );

      useEffect(() => {
        void load('');
      }, [load]);

      const copy = async () => {
        if (!view || typeof view.content !== 'string') return;
        try {
          await navigator.clipboard.writeText(view.content);
        } catch {
          // 剪贴板不可用时静默失败。
        }
      };

      const download = () => {
        const query = new URLSearchParams({ run: runId, node: node.path, port });
        if (currentPath) query.set('file', currentPath);
        const anchor = document.createElement('a');
        anchor.href = `${API}/experiments/artifact/download?${query.toString()}`;
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      const parentPath = currentPath.includes('/')
        ? currentPath.slice(0, currentPath.lastIndexOf('/'))
        : '';

      return h(
        Modal,
        {
          t,
          wide: true,
          title: `${t('runs.outputTitle')} · ${node.label || node.path} · ${port}`,
          onClose,
          footer: [
            view && typeof view.content === 'string'
              ? h('button', { key: 'copy', type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => void copy() }, t('log.copy'))
              : null,
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
            view && view.path ? h('span', { className: 'ath-hint ath-mono' }, view.path) : null,
            currentPath
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'ath-btn ath-btn-ghost',
                    onClick: () => void load(parentPath),
                  },
                  t('runs.outputUp'),
                )
              : null,
          ),
          loading
            ? h('div', { className: 'ath-loading' }, h('i', { className: 'ath-spinner' }), t('common.loading'))
            : failed
              ? h('div', { className: 'ath-error' }, failed)
              : view && view.kind === 'directory'
                ? h(
                    'div',
                    { className: 'ath-artifact-list' },
                    view.entries.length
                      ? view.entries.map((entry) =>
                          h(
                            'button',
                            {
                              key: entry.path,
                              type: 'button',
                              className: 'ath-artifact-entry',
                              onClick: () => void load(entry.path),
                            },
                            h('span', { className: 'ath-artifact-kind' }, entry.kind === 'directory' ? '📁' : '📄'),
                            h('span', { className: 'ath-artifact-name' }, entry.name),
                            entry.kind === 'file' ? h('span', { className: 'ath-hint' }, `${entry.size} B`) : null,
                          ),
                        )
                      : h('div', { className: 'ath-hint' }, t('runs.outputEmpty')),
                  )
                : view && view.kind === 'file'
                  ? h(
                      'div',
                      null,
                      view.binary
                        ? h('div', { className: 'ath-hint' }, t('runs.outputBinary'))
                        : h('pre', { className: 'ath-log-pre' }, view.content || ''),
                      view.truncated ? h('div', { className: 'ath-hint' }, t('runs.outputTruncated')) : null,
                    )
                  : h('pre', { className: 'ath-log-pre' }, (view && view.content) || t('runs.outputEmpty')),
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

    function NewModuleDialog({ t, busy, error, onClose, onCreate }) {
      const [kind, setKind] = useState('command');
      const [name, setName] = useState('');
      const [description, setDescription] = useState('');
      const [command, setCommand] = useState('');
      const [datasetMode, setDatasetMode] = useState('edit');
      const [datasetText, setDatasetText] = useState('');
      const [datasetFile, setDatasetFile] = useState(null);
      const [datasetFormat, setDatasetFormat] = useState('jsonl');
      const [datasetOutputName, setDatasetOutputName] = useState('output');
      const [datasetOutputType, setDatasetOutputType] = useState('json');
      const [inputRows, setInputRows] = useState([]);
      const [outputRows, setOutputRows] = useState([]);
      const [paramRows, setParamRows] = useState([]);
      const [asset, setAsset] = useState(null);
      const [formError, setFormError] = useState('');
      const fileInputRef = useRef(null);
      const dirInputRef = useRef(null);
      const datasetFileInputRef = useRef(null);

      useEffect(() => {
        const input = dirInputRef.current;
        if (input) {
          input.webkitdirectory = true;
          input.setAttribute('webkitdirectory', '');
        }
      }, []);

      const handleAssetFiles = async (fileList, assetKind) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setFormError('');
        try {
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);
          if (totalSize > 12 * 1024 * 1024) throw new Error(t('modules.assetTooLarge'));
          const first = files[0];
          const rootName =
            assetKind === 'directory'
              ? (first.webkitRelativePath || '').split('/')[0] || first.name
              : first.name;
          const payloadFiles = [];
          for (const file of files) {
            const parts = (file.webkitRelativePath || file.name).split('/');
            const relative =
              assetKind === 'directory' && parts.length > 1 ? parts.slice(1).join('/') : file.name;
            payloadFiles.push({ path: relative, data: await readFileAsBase64(file) });
          }
          setAsset({ kind: assetKind, name: rootName, files: payloadFiles, count: files.length });
        } catch (uploadError) {
          setFormError(uploadError && uploadError.message ? uploadError.message : String(uploadError));
        }
      };

      const validateDatasetText = (format, text) => {
        const value = String(text || '');
        if (!value.trim()) throw new Error(t('newModule.validationDatasetContent'));
        if (format === 'jsonl') {
          const lines = value.split(/\r?\n/);
          lines.forEach((line, index) => {
            if (!line.trim()) return;
            try {
              JSON.parse(line);
            } catch {
              throw new Error(tr(t, 'newModule.invalidJsonl', { line: index + 1 }));
            }
          });
        }
      };

      const handleDatasetFile = async (fileList) => {
        const file = fileList && fileList[0];
        if (!file) return;
        setFormError('');
        try {
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          if (!['jsonl', 'csv'].includes(ext)) throw new Error(t('newModule.datasetFileType'));
          if (file.size > 12 * 1024 * 1024) throw new Error(t('modules.assetTooLarge'));
          validateDatasetText(ext, await file.text());
          const data = await readFileAsBase64(file);
          setDatasetFile({ name: file.name, format: ext, data, size: file.size });
          setDatasetFormat(ext);
          setDatasetMode('file');
        } catch (fileError) {
          setFormError(fileError && fileError.message ? fileError.message : String(fileError));
          setDatasetFile(null);
        } finally {
          if (datasetFileInputRef.current) datasetFileInputRef.current.value = '';
        }
      };

      const addConfigRow = (setter) => setter((rows) => [...rows, { name: '', type: 'string' }]);
      const updateConfigRow = (setter, index, patchValue) =>
        setter((rows) => rows.map((row, position) => (position === index ? { ...row, ...patchValue } : row)));
      const removeConfigRow = (setter, index) =>
        setter((rows) => rows.filter((_, position) => position !== index));

      const submit = async () => {
        setFormError('');
        if (!name.trim()) {
          setFormError(t('newModule.validationName'));
          return;
        }
        if (kind === 'command' && !asset) {
          setFormError(t('newModule.validationAsset'));
          return;
        }

        const inputs = [];
        const inputTypes = {};
        const outputs = [];
        const outputTypes = {};
        const params = {};
        const paramTypes = {};
        const seen = new Set();
        if (kind === 'command') {
          for (const [category, rows] of [
            ['input', inputRows],
            ['output', outputRows],
            ['param', paramRows],
          ]) {
            for (const row of rows) {
              const key = String(row.name || '').trim();
              if (!key) {
                setFormError(t('newModule.validationConfigName'));
                return;
              }
              if (seen.has(key)) {
                setFormError(tr(t, 'newModule.validationDuplicateName', { name: key }));
                return;
              }
              seen.add(key);
              if (category === 'input') {
                inputs.push(key);
                inputTypes[key] = row.type || 'string';
              } else if (category === 'output') {
                outputs.push(key);
                outputTypes[key] = row.type || 'string';
              } else {
                params[key] = '';
                paramTypes[key] = row.type || 'string';
              }
            }
          }
        }

        let datasetAsset = null;
        let datasetUriValue = '';
        let datasetFormatValue = '';
        const datasetOutput = datasetOutputName.trim();
        if (kind === 'dataset' && !datasetOutput) {
          setFormError(t('newModule.validationOutputName'));
          return;
        }
        if (kind === 'dataset') {
          try {
            if (datasetMode === 'edit') {
              const format = datasetFormat === 'csv' ? 'csv' : 'jsonl';
              validateDatasetText(format, datasetText);
              const fileName = `dataset.${format}`;
              const data = await readFileAsBase64(
                new File([datasetText], fileName, { type: 'text/plain' }),
              );
              datasetUriValue = fileName;
              datasetFormatValue = format;
              datasetAsset = { kind: 'file', name: fileName, files: [{ path: fileName, data }] };
            } else {
              if (!datasetFile) {
                setFormError(t('newModule.validationDatasetFile'));
                return;
              }
              datasetUriValue = datasetFile.name;
              datasetFormatValue = datasetFile.format;
              datasetAsset = {
                kind: 'file',
                name: datasetFile.name,
                files: [{ path: datasetFile.name, data: datasetFile.data }],
              };
            }
          } catch (datasetError) {
            setFormError(
              datasetError && datasetError.message ? datasetError.message : String(datasetError),
            );
            return;
          }
        }

        onCreate({
          kind,
          name: name.trim(),
          description: description.trim(),
          command: command.trim(),
          datasetUri: datasetUriValue,
          datasetFormat: datasetFormatValue,
          asset: kind === 'command' ? asset : datasetAsset,
          inputs,
          inputTypes,
          outputs: kind === 'command' ? outputs : [datasetOutput],
          outputTypes:
            kind === 'command' ? outputTypes : { [datasetOutput]: datasetOutputType || 'json' },
          params,
          paramTypes,
        });
      };

      const renderConfigCard = (title, rows, setter, paramOnly = false, wide = false) =>
        h(
          'div',
          { className: `ath-card ath-resource-config${wide ? ' ath-resource-config-wide' : ''}` },
          h(
            'div',
            { className: 'ath-resource-config-head' },
            h('h4', { className: 'ath-section-title' }, title),
            h('span', { className: 'ath-hint' }, String(rows.length)),
            h(
              'button',
              {
                type: 'button',
                className: 'ath-icon-btn',
                title: t('action.add'),
                'aria-label': t('action.add'),
                onClick: () => addConfigRow(setter),
              },
              '+',
            ),
          ),
          rows.length
            ? rows.map((row, index) =>
                h(
                  'div',
                  { className: 'ath-resource-config-row', key: index },
                  h('input', {
                    className: 'ath-input ath-mono',
                    type: 'text',
                    value: row.name,
                    maxLength: 40,
                    placeholder: t('newModule.configName'),
                    spellCheck: false,
                    onChange: (event) => updateConfigRow(setter, index, { name: event.target.value }),
                  }),
                  h(TypeSelect, {
                    t,
                    value: row.type,
                    paramOnly,
                    onChange: (type) => updateConfigRow(setter, index, { type }),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-icon-btn',
                      title: t('action.remove'),
                      'aria-label': t('action.remove'),
                      onClick: () => removeConfigRow(setter, index),
                    },
                    '−',
                  ),
                ),
              )
            : h('div', { className: 'ath-hint' }, t('newModule.configEmpty')),
        );

      const shownError = formError || error;
      return h(
        Modal,
        {
          t,
          title: t('newModule.title'),
          className: 'ath-resource-modal',
          onClose: busy ? () => {} : onClose,
          footer: [
            h(
              'button',
              {
                key: 'cancel',
                type: 'button',
                className: 'ath-btn',
                disabled: busy,
                onClick: onClose,
              },
              t('action.cancel'),
            ),
            h(
              'button',
              {
                key: 'create',
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                disabled: busy,
                onClick: submit,
              },
              busy ? t('newModule.creating') : t('newModule.create'),
            ),
          ],
        },
        h(
          'div',
          { className: 'ath-detail', style: { gap: 12 } },
          h('div', { className: 'ath-hint' }, t('newModule.subtitle')),
          h(
            'div',
            { className: 'ath-field' },
            h('label', { className: 'ath-label' }, t('newModule.type')),
            h(
              'div',
              { className: 'ath-chips', role: 'radiogroup', 'aria-label': t('newModule.type') },
              [
                { value: 'command', label: t('newModule.typeModule') },
                { value: 'dataset', label: t('newModule.typeDataset') },
              ].map((option) =>
                h(
                  'label',
                  {
                    key: option.value,
                    className: 'ath-chip ath-chip-radio',
                    'data-active': kind === option.value ? 'true' : 'false',
                  },
                  h('input', {
                    className: 'ath-radio-input',
                    type: 'radio',
                    name: 'new-resource-kind',
                    value: option.value,
                    checked: kind === option.value,
                    onChange: () => setKind(option.value),
                  }),
                  h('span', null, option.label),
                ),
              ),
            ),
            h(
              'div',
              { className: 'ath-hint' },
              kind === 'command' ? t('newModule.commandDesc') : t('newModule.datasetDesc'),
            ),
          ),
          h(
            'div',
            { className: 'ath-field' },
            h('label', { className: 'ath-label' }, t('newModule.name')),
            h('input', {
              className: 'ath-input',
              type: 'text',
              value: name,
              placeholder: t('newModule.namePlaceholder'),
              onChange: (event) => setName(event.target.value),
            }),
          ),
          h(
            'div',
            { className: 'ath-field' },
            h('label', { className: 'ath-label' }, t('newModule.description')),
            h('input', {
              className: 'ath-input',
              type: 'text',
              value: description,
              placeholder: t('newModule.descriptionPlaceholder'),
              onChange: (event) => setDescription(event.target.value),
            }),
          ),
          kind === 'command'
            ? [
                h(
                  'div',
                  { key: 'asset', className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('newModule.asset')),
                  h(
                    'div',
                    { className: 'ath-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'ath-btn ath-btn-ghost',
                        onClick: () => fileInputRef.current && fileInputRef.current.click(),
                      },
                      t('newModule.chooseFile'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'ath-btn ath-btn-ghost',
                        onClick: () => dirInputRef.current && dirInputRef.current.click(),
                      },
                      t('newModule.chooseDirectory'),
                    ),
                    h('input', {
                      ref: fileInputRef,
                      type: 'file',
                      style: { display: 'none' },
                      onChange: (event) => void handleAssetFiles(event.target.files, 'file'),
                    }),
                    h('input', {
                      ref: dirInputRef,
                      type: 'file',
                      multiple: true,
                      style: { display: 'none' },
                      onChange: (event) => void handleAssetFiles(event.target.files, 'directory'),
                    }),
                  ),
                  asset
                    ? h(
                        'div',
                        { className: 'ath-asset-chip' },
                        h(
                          'span',
                          { className: 'ath-badge' },
                          asset.kind === 'directory'
                            ? t('modules.assetKind.directory')
                            : t('modules.assetKind.file'),
                        ),
                        h('span', { className: 'ath-mono' }, asset.name),
                      )
                    : null,
                  h('div', { className: 'ath-hint' }, t('newModule.assetHint')),
                ),
                h(
                  'div',
                  { key: 'config', className: 'ath-resource-config-grid' },
                  renderConfigCard(t('modules.inputs'), inputRows, setInputRows),
                  renderConfigCard(t('modules.outputs'), outputRows, setOutputRows),
                  renderConfigCard(t('common.params'), paramRows, setParamRows, true, true),
                ),
                h(
                  'div',
                  { key: 'command', className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('newModule.command')),
                  h('input', {
                    className: 'ath-input ath-mono',
                    type: 'text',
                    value: command,
                    placeholder: t('newModule.commandPlaceholder'),
                    onChange: (event) => setCommand(event.target.value),
                  }),
                  h('div', { className: 'ath-hint' }, t('newModule.commandHint')),
                ),
              ]
            : [
                h(
                  'div',
                  { key: 'source', className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('newModule.datasetSource')),
                  h(
                    'div',
                    { className: 'ath-chips', role: 'radiogroup', 'aria-label': t('newModule.datasetSource') },
                    [
                      { value: 'edit', label: t('newModule.datasetEdit') },
                      { value: 'file', label: t('newModule.datasetImport') },
                    ].map((option) =>
                      h(
                        'label',
                        {
                          key: option.value,
                          className: 'ath-chip ath-chip-radio',
                          'data-active': datasetMode === option.value ? 'true' : 'false',
                        },
                        h('input', {
                          className: 'ath-radio-input',
                          type: 'radio',
                          name: 'new-dataset-source',
                          value: option.value,
                          checked: datasetMode === option.value,
                          onChange: () => setDatasetMode(option.value),
                        }),
                        h('span', null, option.label),
                      ),
                    ),
                  ),
                ),
                h(
                  'div',
                  { key: 'format', className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('newModule.datasetFormat')),
                  h(
                    'select',
                    {
                      className: 'ath-select',
                      value: datasetFormat,
                      disabled: datasetMode === 'file',
                      onChange: (event) => setDatasetFormat(event.target.value),
                    },
                    h('option', { value: 'jsonl' }, 'JSONL'),
                    h('option', { value: 'csv' }, 'CSV'),
                  ),
                  h('div', { className: 'ath-hint' }, t('newModule.datasetFormatHint')),
                ),
                datasetMode === 'edit'
                  ? h(
                      'div',
                      { key: 'text', className: 'ath-field' },
                      h('label', { className: 'ath-label' }, t('newModule.datasetText')),
                      h('textarea', {
                        className: 'ath-textarea ath-mono',
                        rows: 7,
                        value: datasetText,
                        placeholder: t('newModule.datasetTextPlaceholder'),
                        spellCheck: false,
                        onChange: (event) => setDatasetText(event.target.value),
                      }),
                    )
                  : h(
                      'div',
                      { key: 'file', className: 'ath-field' },
                      h('label', { className: 'ath-label' }, t('newModule.datasetFile')),
                      h(
                        'div',
                        { className: 'ath-actions' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ath-btn ath-btn-ghost',
                            onClick: () =>
                              datasetFileInputRef.current && datasetFileInputRef.current.click(),
                          },
                          t('newModule.chooseDatasetFile'),
                        ),
                        h('input', {
                          ref: datasetFileInputRef,
                          type: 'file',
                          accept: '.jsonl,.csv,application/json,text/csv',
                          style: { display: 'none' },
                          onChange: (event) => void handleDatasetFile(event.target.files),
                        }),
                      ),
                      datasetFile
                        ? h(
                            'div',
                            { className: 'ath-asset-chip' },
                            h('span', { className: 'ath-badge' }, datasetFile.format.toUpperCase()),
                            h('span', { className: 'ath-mono' }, datasetFile.name),
                          )
                        : null,
                      h('div', { className: 'ath-hint' }, t('newModule.datasetFileHint')),
                    ),
                h(
                  'div',
                  { key: 'output', className: 'ath-card ath-resource-config ath-resource-config-wide' },
                  h(
                    'div',
                    { className: 'ath-resource-config-head' },
                    h('h4', { className: 'ath-section-title' }, t('modules.outputs')),
                    h('span', { className: 'ath-hint' }, t('newModule.datasetOutputHint')),
                  ),
                  h(
                    'div',
                    { className: 'ath-resource-config-row' },
                    h('input', {
                      className: 'ath-input ath-mono',
                      type: 'text',
                      value: datasetOutputName,
                      maxLength: 40,
                      onChange: (event) => setDatasetOutputName(event.target.value),
                    }),
                    h(TypeSelect, {
                      t,
                      value: datasetOutputType,
                      onChange: setDatasetOutputType,
                    }),
                  ),
                ),
              ],
          h('div', { className: 'ath-hint' }, t('newModule.stepHint')),
          shownError ? h('div', { className: 'ath-error' }, shownError) : null,
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
