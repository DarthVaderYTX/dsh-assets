    // ---------------------------------------------------------- 模块

    function ModulesView({ t, data, onNew, onEdit, onDelete }) {
      const [query, setQuery] = useState('');
      const [filter, setFilter] = useState('all');
      const modules = data.modules || [];
      const keyword = query.trim().toLowerCase();
      const filtered = modules
        .filter((module) => filter === 'all' || module.kind === filter)
        .filter((module) => {
          if (!keyword) return true;
          const haystack = [
            module.name,
            module.id,
            module.description,
            module.kind,
            t(`modules.kind.${module.kind}`),
            module.datasetUri || '',
            module.subgraphName || '',
            module.graphId || '',
            ...(module.inputs || []),
            ...(module.outputs || []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(keyword);
        });
      return h(
        'div',
        { className: 'ath-page' },
        h(
          'div',
          { className: 'ath-page-head' },
          h(
            'div',
            null,
            h('h2', { className: 'ath-page-title' }, t('modules.title')),
            h('p', { className: 'ath-page-sub' }, t('modules.subtitle')),
          ),
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn ath-btn-primary', onClick: onNew }, t('modules.new')),
          ),
        ),
        h(
          'div',
          { className: 'ath-card ath-module-toolbar' },
          h('input', {
            className: 'ath-input',
            type: 'search',
            value: query,
            placeholder: t('modules.searchPlaceholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h(
            'div',
            { className: 'ath-chips' },
            ['all', 'command', 'graph', 'dataset'].map((key) =>
              h(
                'button',
                {
                  key,
                  type: 'button',
                  className: 'ath-chip',
                  'data-active': filter === key ? 'true' : 'false',
                  onClick: () => setFilter(key),
                },
                t(`canvas.filter.${key}`),
              ),
            ),
          ),
        ),
        modules.length === 0
          ? h(EmptyState, { title: t('modules.empty') })
          : filtered.length === 0
            ? h(EmptyState, { title: t('modules.emptyResult') })
            : h(
                'div',
                { className: 'ath-card-grid' },
                filtered.map((module) =>
                  h(
                    'div',
                    { className: 'ath-module-card', key: module.id },
                    h(
                      'div',
                      { className: 'ath-module-head' },
                      h('span', { className: 'ath-module-name' }, module.name),
                      h('span', { className: 'ath-badge', 'data-kind': module.kind }, t(`modules.kind.${module.kind}`)),
                      h('span', { className: 'ath-badge' }, tr(t, 'modules.versionLabel', { version: module.version || 1 })),
                      h(
                        'span',
                        { className: 'ath-badge' },
                        environmentName(t, data.environments, module.environmentId, module.environmentName),
                      ),
                    ),
                    h('div', { className: 'ath-module-desc' }, module.description || ''),
                    module.kind === 'graph'
                      ? h('div', { className: 'ath-module-code' }, `${t('modules.graphRef')}: ${module.subgraphName || module.graphId}`)
                      : module.kind === 'dataset'
                        ? h('div', { className: 'ath-module-code' }, `${module.datasetUri || ''}${module.datasetFormat ? ` · ${module.datasetFormat}` : ''}`)
                        : h('pre', { className: 'ath-module-code' }, module.command || ''),
                    h(
                      'div',
                      { className: 'ath-stat-row' },
                      module.kind === 'command' ? h('span', null, `${module.timeoutSec}s`) : null,
                      module.kind === 'command'
                        ? h(
                            'span',
                            null,
                            module.assetName
                              ? `${t(`modules.assetKind.${module.assetKind || 'file'}`)}: ${module.assetName}`
                              : t('modules.noAsset'),
                          )
                        : null,
                      h('span', null, `${t('common.params')} ${Object.keys(module.params || {}).length}`),
                      h(
                        'span',
                        null,
                        `${t('modules.inputs')} ${(module.inputs || []).length} · ${t('modules.outputs')} ${
                          (module.outputs || []).length
                        }${
                          (module.requiredInputs || []).length
                            ? ` · ${tr(t, 'modules.requiredCount', { n: module.requiredInputs.length })}`
                            : ''
                        }`,
                      ),
                      module.versionCount
                        ? h('span', null, tr(t, 'modules.versionHistory', { n: module.versionCount }))
                        : null,
                      h('span', null, module.usedBy && module.usedBy.length ? tr(t, 'modules.usedByCount', { n: module.usedBy.length }) : t('modules.notUsed')),
                    ),
                    h(
                      'div',
                      { className: 'ath-module-foot' },
                      h('span', { className: 'ath-hint ath-mono' }, module.id),
                      h(
                        'div',
                        { className: 'ath-actions' },
                        h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => onEdit(module) }, t('modules.edit')),
                        h('button', { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: () => onDelete(module) }, t('modules.delete')),
                      ),
                    ),
                  ),
                ),
              ),
      );
    }

    function ModuleEditor({ t, data, draft, setDraft, onUploadAsset, onSave, onBack, saving, errors }) {
      const module = draft.module;
      const environments = data.environments || [];
      const currentEnvironment =
        environments.find((item) => item.id === (module.environmentId || 'local')) || environments[0];
      const patch = (values) => setDraft({ ...draft, module: { ...module, ...values } });
      const isNew = !module.id || !!draft.isNew;
      const kindOptions = module.kind === 'graph' ? ['command', 'graph', 'dataset'] : ['command', 'dataset'];
      const fileInputRef = useRef(null);
      const dirInputRef = useRef(null);
      const [assetBusy, setAssetBusy] = useState(false);
      const [assetError, setAssetError] = useState('');
      const needsAsset = isNew && module.kind === 'command' && !module.assetId;

      useEffect(() => {
        const input = dirInputRef.current;
        if (input) {
          input.setAttribute('webkitdirectory', '');
          input.setAttribute('directory', '');
        }
      }, [module.kind]);

      const handleAssetFiles = async (fileList, kind) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setAssetBusy(true);
        setAssetError('');
        try {
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);
          if (totalSize > 12 * 1024 * 1024) throw new Error(t('modules.assetTooLarge'));
          const first = files[0];
          const rootName =
            kind === 'directory'
              ? (first.webkitRelativePath || '').split('/')[0] || first.name
              : first.name;
          const payloadFiles = [];
          for (const file of files) {
            const parts = (file.webkitRelativePath || file.name).split('/');
            const relative =
              kind === 'directory' && parts.length > 1 ? parts.slice(1).join('/') : file.name;
            payloadFiles.push({ path: relative, data: await readFileAsBase64(file) });
          }
          const asset = await onUploadAsset({ kind, name: rootName, files: payloadFiles });
          if (!asset) throw new Error(t('modules.assetUploadFailed'));
          patch({
            assetId: asset.assetId,
            assetKind: asset.assetKind,
            assetName: asset.assetName,
            assetPath: asset.assetPath,
            assetFileCount: asset.assetFileCount,
          });
        } catch (error) {
          setAssetError(error && error.message ? error.message : String(error));
        } finally {
          setAssetBusy(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          if (dirInputRef.current) dirInputRef.current.value = '';
        }
      };
      return h(
        'div',
        { className: 'ath-page' },
        h(
          'div',
          { className: 'ath-editor-head' },
          h('h2', { className: 'ath-editor-title' }, module.id && !draft.isNew ? t('moduleEditor.edit') : t('moduleEditor.new')),
          h('span', { className: 'ath-badge' }, tr(t, 'modules.versionLabel', { version: module.version || 1 })),
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn', onClick: onBack, disabled: saving }, t('action.back')),
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                onClick: onSave,
                disabled: saving || assetBusy || needsAsset,
                title: needsAsset ? t('modules.assetRequired') : undefined,
              },
              saving ? t('modules.saving') : t('modules.save'),
            ),
          ),
        ),
        errors.length
          ? h(
              'div',
              { className: 'ath-card', style: { borderColor: 'var(--ath-red)', marginBottom: 12 } },
              errors.map((error, index) => h('div', { className: 'ath-error', key: index }, `· ${error}`)),
            )
          : null,
        !draft.isNew
          ? h(
              'div',
              { className: 'ath-card ath-version-bar' },
              h(
                'label',
                { className: 'ath-check' },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(draft.overwriteVersion),
                  onChange: (event) => setDraft({ ...draft, overwriteVersion: event.target.checked }),
                }),
                h('span', null, t('modules.overwriteVersion')),
              ),
              h('span', { className: 'ath-hint' }, tr(t, 'modules.versionHint', { version: module.version || 1 })),
            )
          : null,
        h(
          'div',
          { className: 'ath-editor' },
          h(
            'div',
            { className: 'ath-editor-main' },
            h(
              'div',
              { className: 'ath-card' },
              h(
                'div',
                { className: 'ath-grid-2' },
                h(
                  'div',
                  { className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('common.name')),
                  h('input', {
                    className: 'ath-input',
                    type: 'text',
                    value: module.name,
                    placeholder: t('modules.placeholder.name'),
                    maxLength: 120,
                    onChange: (event) => patch({ name: event.target.value }),
                  }),
                ),
                h(
                  'div',
                  { className: 'ath-field' },
                  h('label', { className: 'ath-label' }, t('modules.id')),
                  h('input', {
                    className: 'ath-input ath-mono',
                    type: 'text',
                    value: module.id,
                    placeholder: 'train-model',
                    spellCheck: false,
                    disabled: !isNew,
                    onChange: (event) => patch({ id: event.target.value }),
                  }),
                  h('div', { className: 'ath-hint' }, t('modules.idHint')),
                ),
              ),
              h(
                'div',
                { className: 'ath-field', style: { marginTop: 12 } },
                h('label', { className: 'ath-label' }, t('common.description')),
                h('input', {
                  className: 'ath-input',
                  type: 'text',
                  value: module.description,
                  placeholder: t('modules.placeholder.description'),
                  maxLength: 300,
                  onChange: (event) => patch({ description: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'ath-field', style: { marginTop: 12 } },
                h('label', { className: 'ath-label' }, t('modules.kind')),
                h(
                  'div',
                  { className: 'ath-chips' },
                  kindOptions.map((kind) =>
                    h(
                      'button',
                      {
                        key: kind,
                        type: 'button',
                        className: 'ath-chip',
                        'data-active': module.kind === kind ? 'true' : 'false',
                        onClick: () =>
                          patch(
                            kind === 'dataset'
                              ? {
                                  kind,
                                  inputs: [],
                                  requiredInputs: [],
                                  outputs: module.outputs && module.outputs.length ? module.outputs : ['output'],
                                }
                              : { kind },
                          ),
                      },
                      t(`modules.kind.${kind}`),
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'ath-field', style: { marginTop: 12 } },
                h('label', { className: 'ath-label' }, t('modules.environment')),
                h(
                  'select',
                  {
                    className: 'ath-select',
                    value: module.environmentId || 'local',
                    onChange: (event) => patch({ environmentId: event.target.value }),
                  },
                  environments.length
                    ? environments.map((environment) =>
                        h('option', { key: environment.id, value: environment.id }, environmentLabel(t, environment)),
                      )
                    : h('option', { value: 'local' }, t('environment.local')),
                ),
                h(
                  'div',
                  { className: 'ath-hint' },
                  `${environmentHint(t, currentEnvironment)} ${t('modules.environmentHint')}`.trim(),
                ),
              ),
              module.kind === 'dataset'
                ? h(
                    'div',
                    { style: { marginTop: 12 } },
                    h(PortsEditor, {
                      t,
                      label: t('modules.outputs'),
                      ports: module.outputs || [],
                      onChange: (outputs) => patch({ outputs }),
                    }),
                    h('div', { className: 'ath-hint', style: { marginTop: 4 } }, t('modules.datasetPortsHint')),
                  )
                : h(
                    'div',
                    { className: 'ath-grid-2', style: { marginTop: 12 } },
                    h(PortsEditor, {
                      t,
                      label: t('modules.inputs'),
                      ports: module.inputs || [],
                      requiredPorts: module.requiredInputs || [],
                      requiredMode: true,
                      onChange: (inputs, requiredInputs) => patch({ inputs, requiredInputs }),
                    }),
                    h(PortsEditor, {
                      t,
                      label: t('modules.outputs'),
                      ports: module.outputs || [],
                      onChange: (outputs) => patch({ outputs }),
                    }),
                  ),
              module.kind === 'dataset'
                ? null
                : h('div', { className: 'ath-hint', style: { marginTop: 4 } }, t('modules.portsHint')),
              module.kind === 'graph'
                ? h(
                    'div',
                    { className: 'ath-field', style: { marginTop: 12 } },
                    h('label', { className: 'ath-label' }, t('modules.graphRef')),
                    h(
                      'select',
                      {
                        className: 'ath-select',
                        value: module.graphId,
                        onChange: (event) => patch({ graphId: event.target.value }),
                      },
                      h('option', { value: '' }, t('modules.graphRef')),
                      (data.graphs || []).map((graph) => h('option', { key: graph.id, value: graph.id }, graph.name)),
                    ),
                    h(
                      'div',
                      { className: 'ath-hint' },
                      (data.graphs || []).length ? t('modules.graphRefHint') : t('modules.noGraphs'),
                    ),
                  )
                : module.kind === 'dataset'
                  ? h(
                      'div',
                      null,
                      h(
                        'div',
                        { className: 'ath-field', style: { marginTop: 12 } },
                        h('label', { className: 'ath-label' }, t('modules.datasetUri')),
                        h('input', {
                          className: 'ath-input ath-mono',
                          type: 'text',
                          value: module.datasetUri || '',
                          placeholder: 'datasets/demo.jsonl',
                          maxLength: 500,
                          onChange: (event) => patch({ datasetUri: event.target.value }),
                        }),
                        h('div', { className: 'ath-hint' }, t('modules.datasetUriHint')),
                      ),
                      h(
                        'div',
                        { className: 'ath-field', style: { marginTop: 12 } },
                        h('label', { className: 'ath-label' }, t('modules.datasetFormat')),
                        h('input', {
                          className: 'ath-input ath-mono',
                          type: 'text',
                          value: module.datasetFormat || '',
                          placeholder: 'jsonl',
                          maxLength: 40,
                          onChange: (event) => patch({ datasetFormat: event.target.value }),
                        }),
                        h('div', { className: 'ath-hint' }, t('modules.datasetFormatHint')),
                      ),
                    )
                  : h(
                    'div',
                    null,
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('modules.assetTitle')),
                      module.assetId
                        ? h(
                            'div',
                            { className: 'ath-asset-chip' },
                            h('span', { className: 'ath-badge' }, t(`modules.assetKind.${module.assetKind}`)),
                            h('span', { className: 'ath-mono' }, module.assetName || module.assetId),
                            module.assetFileCount
                              ? h('span', { className: 'ath-hint' }, tr(t, 'modules.assetFiles', { n: module.assetFileCount }))
                              : null,
                          )
                        : h(
                            'div',
                            { className: 'ath-hint' },
                            needsAsset ? t('modules.assetRequired') : t('modules.assetOptional'),
                          ),
                      h(
                        'div',
                        { className: 'ath-actions', style: { marginTop: 8 } },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ath-btn ath-btn-ghost',
                            disabled: assetBusy,
                            onClick: () => {
                              if (fileInputRef.current) fileInputRef.current.click();
                            },
                          },
                          assetBusy ? t('modules.assetUploading') : t('modules.chooseFile'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ath-btn ath-btn-ghost',
                            disabled: assetBusy,
                            onClick: () => {
                              if (dirInputRef.current) dirInputRef.current.click();
                            },
                          },
                          t('modules.chooseDir'),
                        ),
                        module.assetId
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'ath-btn ath-btn-ghost ath-btn-danger',
                                disabled: assetBusy,
                                onClick: () =>
                                  patch({
                                    assetId: '',
                                    assetKind: '',
                                    assetName: '',
                                    assetPath: '',
                                    assetFileCount: 0,
                                  }),
                              },
                              t('modules.clearAsset'),
                            )
                          : null,
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
                      module.assetPath ? h('div', { className: 'ath-hint ath-mono' }, module.assetPath) : null,
                      h('div', { className: 'ath-hint' }, t('modules.assetHint')),
                      assetError ? h('div', { className: 'ath-error' }, assetError) : null,
                    ),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('modules.command')),
                      h('textarea', {
                        className: 'ath-textarea',
                        rows: 7,
                        value: module.command,
                        placeholder: t('modules.placeholder.command'),
                        spellCheck: false,
                        onChange: (event) => patch({ command: event.target.value }),
                      }),
                      h('div', { className: 'ath-hint' }, t('modules.commandHint')),
                    ),
                    h(
                      'div',
                      { className: 'ath-grid-2', style: { marginTop: 12 } },
                      h(
                        'div',
                        { className: 'ath-field' },
                        h('label', { className: 'ath-label' }, t('modules.cwd')),
                        h('input', {
                          className: 'ath-input ath-mono',
                          type: 'text',
                          value: module.cwd,
                          placeholder: '~/work',
                          onChange: (event) => patch({ cwd: event.target.value }),
                        }),
                        h('div', { className: 'ath-hint' }, t('modules.cwdHint')),
                      ),
                      h(
                        'div',
                        { className: 'ath-field' },
                        h('label', { className: 'ath-label' }, t('modules.timeout')),
                        h('input', {
                          className: 'ath-input',
                          type: 'number',
                          min: 1,
                          max: 86400,
                          value: module.timeoutSec,
                          onChange: (event) => patch({ timeoutSec: Number(event.target.value) || 1 }),
                        }),
                      ),
                    ),
                  ),
            ),
            h(
              'div',
              { className: 'ath-card' },
              h(
                'div',
                { className: 'ath-row' },
                h('h4', { className: 'ath-section-title' }, t('modules.params')),
                h('span', { className: 'ath-hint', style: { marginLeft: 'auto' } }, t('modules.paramsHint')),
              ),
              h(ParamsEditor, {
                key: module.id || 'new',
                t,
                value: module.params,
                onChange: (params) => patch({ params }),
              }),
              h('div', { className: 'ath-hint', style: { marginTop: 4 } }, t('modules.paramsDefaultHint')),
            ),
          ),
          h(
            'div',
            { className: 'ath-editor-side' },
            h(
              'div',
              { className: 'ath-card' },
              h('h4', { className: 'ath-section-title' }, t('modules.version')),
              h(
                'div',
                { className: 'ath-stat-row' },
                h('span', { className: 'ath-badge' }, tr(t, 'modules.versionLabel', { version: module.version || 1 })),
                module.versionCount
                  ? h('span', { className: 'ath-hint' }, tr(t, 'modules.versionHistory', { n: module.versionCount }))
                  : null,
              ),
              h('div', { className: 'ath-hint', style: { marginTop: 6 } }, tr(t, 'modules.versionHint', { version: module.version || 1 })),
            ),
            h(
              'div',
              { className: 'ath-card' },
              h('h4', { className: 'ath-section-title' }, t('modules.envTitle')),
              h('div', { className: 'ath-hint' }, t('modules.envHint')),
            ),
            h(
              'div',
              { className: 'ath-card' },
              h('h4', { className: 'ath-section-title' }, t('modules.usedBy')),
              (() => {
                const usage = (data.modules || []).find((item) => item.id === module.id);
                const usedBy = usage ? usage.usedBy || [] : [];
                return usedBy.length
                  ? h(
                      'div',
                      { className: 'ath-chips' },
                      usedBy.map((graph) => h('span', { className: 'ath-badge', key: graph.id }, graph.name)),
                    )
                  : h('div', { className: 'ath-hint' }, t('modules.notUsed'));
              })(),
              h('div', { className: 'ath-hint', style: { marginTop: 8 } }, t('modules.deleteHint')),
            ),
          ),
        ),
      );
    }
