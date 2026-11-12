    // ---------------------------------------------------------- 主面板

    function AetherPanel({ t: hostT }) {
      const [data, setData] = useState(null);
      const [phase, setPhase] = useState('loading');
      const [loadError, setLoadError] = useState('');
      const [language, setLanguage] = useState(() => {
        try {
          const stored = localStorage.getItem(LANGUAGE_KEY);
          return stored === 'zh' || stored === 'en' ? stored : 'auto';
        } catch {
          return 'auto';
        }
      });
      const dictionary = language === 'zh' ? ZH : language === 'en' ? EN : null;
      const t = useCallback(
        (key) => {
          if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
          return hostT(key);
        },
        [dictionary, hostT],
      );
      const [tab, setTab] = useState(() => {
        try {
          const stored = localStorage.getItem(TAB_KEY);
          return stored === 'runs' || stored === 'experiments' || stored === 'modules' ? stored : 'runs';
        } catch {
          return 'runs';
        }
      });
      const [filter, setFilter] = useState('all');
      const [runId, setRunId] = useState('');
      const [runDetail, setRunDetail] = useState(null);
      const [submitOpen, setSubmitOpen] = useState(false);
      const [submitting, setSubmitting] = useState(false);
      const [logView, setLogView] = useState(null);
      const [outputView, setOutputView] = useState(null);
      const [editorTabs, setEditorTabs] = useState([]);
      const [activeEditorKey, setActiveEditorKey] = useState('');
      const editorKeySeq = useRef(0);
      const editorTabsRef = useRef(editorTabs);
      editorTabsRef.current = editorTabs;
      const activeEditor = editorTabs.find((entry) => entry.key === activeEditorKey) || null;
      const graphDraft = activeEditor ? activeEditor.draft : null;
      const [graphErrors, setGraphErrors] = useState([]);
      const [graphSaving, setGraphSaving] = useState(false);
      const [moduleDraft, setModuleDraft] = useState(null);
      const [newModuleOpen, setNewModuleOpen] = useState(false);
      const [newResourceBusy, setNewResourceBusy] = useState(false);
      const [newResourceError, setNewResourceError] = useState('');
      const [workspaceOpen, setWorkspaceOpen] = useState(false);
      const [workspaceBusy, setWorkspaceBusy] = useState(false);
      const [moduleErrors, setModuleErrors] = useState([]);
      const [moduleSaving, setModuleSaving] = useState(false);
      const [confirm, setConfirm] = useState(null);
      const [confirmBusy, setConfirmBusy] = useState(false);
      const [toasts, setToasts] = useState([]);
      const toastTimers = useRef(new Set());

      useEffect(() => {
        try {
          localStorage.setItem(TAB_KEY, tab);
        } catch {
          // 记住页签是尽力而为。
        }
      }, [tab]);

      useEffect(() => {
        try {
          localStorage.setItem(LANGUAGE_KEY, language);
        } catch {
          // 记住插件语言是尽力而为。
        }
      }, [language]);

      useEffect(
        () => () => {
          for (const timer of toastTimers.current) window.clearTimeout(timer);
          toastTimers.current.clear();
        },
        [],
      );

      const pushToast = useCallback((message, kind = 'success') => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setToasts((current) => [...current, { id, message, kind }]);
        const timer = window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
          toastTimers.current.delete(timer);
        }, 4200);
        toastTimers.current.add(timer);
      }, []);

      const fail = useCallback(
        (error) => pushToast(tr(t, 'toast.failed', { message: error && error.message ? error.message : String(error) }), 'error'),
        [pushToast, t],
      );

      const request = useCallback(
        async (path, options = {}) => {
          const init = {
            cache: 'no-store',
            credentials: 'same-origin',
            method: options.method || 'GET',
            headers: {},
          };
          if (options.body !== undefined) {
            init.body = JSON.stringify(options.body);
            init.headers['content-type'] = 'application/json';
          }
          const response = await fetch(`${API}${path}`, init);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || `HTTP ${response.status}`);
          }
          return payload;
        },
        [],
      );

      const loadRun = useCallback(
        async (id) => {
          const payload = await request(`/experiments?id=${encodeURIComponent(id)}`);
          setRunDetail(payload.experiment);
          return payload.experiment;
        },
        [request],
      );

      const loadState = useCallback(
        async (silent = false) => {
          if (!silent) setPhase('loading');
          try {
            const next = await request('/state');
            setData(next);
            setPhase('ready');
            setLoadError('');
            return next;
          } catch (error) {
            if (!silent) {
              setLoadError(error && error.message ? error.message : String(error));
              setPhase('error');
            }
            return null;
          }
        },
        [request],
      );

      const refresh = useCallback(
        async (silent = true) => {
          const next = await loadState(silent);
          if (runId) {
            try {
              const experiment = await loadRun(runId);
              if (!experiment) setRunDetail(null);
            } catch {
              setRunDetail(null);
            }
          }
          return next;
        },
        [loadState, loadRun, runId],
      );

      useEffect(() => {
        void loadState(false);
      }, [loadState]);

      const openRun = useCallback(
        async (id) => {
          setRunId(id);
          setRunDetail(null);
          try {
            await loadRun(id);
          } catch (error) {
            fail(error);
          }
        },
        [fail, loadRun],
      );

      const firstRunId = data && data.experiments && data.experiments.length ? data.experiments[0].id : '';
      useEffect(() => {
        if (tab !== 'runs' || runId || !firstRunId) return;
        void openRun(firstRunId);
      }, [tab, runId, firstRunId, openRun]);

      const hasRunning =
        Boolean(data && (data.experiments || []).some((run) => run.status === 'running')) ||
        Boolean(runDetail && runDetail.status === 'running');

      useEffect(() => {
        if (!hasRunning) return undefined;
        const timer = window.setInterval(() => {
          void refresh(true);
        }, 2000);
        return () => window.clearInterval(timer);
      }, [hasRunning, refresh]);

      const openSubmit = () => {
        if (!data || !(data.graphs || []).filter((graph) => !graph.isSubgraph).length) {
          pushToast(t('experiments.noRunnableGraphs'), 'error');
          return;
        }
        setSubmitOpen(true);
      };

      const submitExperiment = async (values) => {
        setSubmitting(true);
        try {
          const payload = await request('/experiments', { method: 'POST', body: values });
          setSubmitOpen(false);
          pushToast(t('toast.submitted'));
          await loadState(true);
          setTab('runs');
          setRunId(payload.experiment.id);
          setRunDetail(payload.experiment);
        } catch (error) {
          fail(error);
        } finally {
          setSubmitting(false);
        }
      };

      const cancelRun = (run) => {
        setConfirm({
          title: t('confirm.cancelRun.title'),
          body: t('confirm.cancelRun.body'),
          confirmLabel: t('experiments.cancel'),
          onConfirm: async () => {
            try {
              await request('/experiments/cancel', { method: 'POST', body: { id: run.id } });
              pushToast(t('toast.cancelled'));
              await refresh(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const updateActiveDraft = (next) => {
        setEditorTabs((tabs) =>
          tabs.map((entry) =>
            entry.key === activeEditorKey
              ? { ...entry, draft: typeof next === 'function' ? next(entry.draft) : next }
              : entry,
          ),
        );
      };

      const openEditorTab = (graph, options = {}) => {
        if (graph.id) {
          const existing = editorTabsRef.current.find((entry) => entry.draft.graph.id === graph.id);
          if (existing) {
            setActiveEditorKey(existing.key);
            setGraphErrors([]);
            setTab('experiments');
            return;
          }
        }
        const key = `editor-${++editorKeySeq.current}`;
        const draft = { graph: clone(graph), selectedNodeId: '', isCopy: Boolean(options.isCopy) };
        setEditorTabs((tabs) => [...tabs, { key, draft, baseline: JSON.stringify(draft.graph) }]);
        setActiveEditorKey(key);
        setGraphErrors([]);
        setTab('experiments');
      };

      const removeTabsForGraph = (graphId) => {
        const tabs = editorTabsRef.current;
        const active = tabs.find((entry) => entry.key === activeEditorKey);
        const next = tabs.filter((entry) => entry.draft.graph.id !== graphId);
        setEditorTabs(next);
        if (active && active.draft.graph.id === graphId) {
          setActiveEditorKey(next.length ? next[next.length - 1].key : '');
        }
      };

      const closeEditorTab = (key) => {
        const tab = editorTabsRef.current.find((entry) => entry.key === key);
        if (!tab) return;
        const doClose = () => {
          const tabs = editorTabsRef.current;
          const index = tabs.findIndex((entry) => entry.key === key);
          const next = tabs.filter((entry) => entry.key !== key);
          setEditorTabs(next);
          setGraphErrors([]);
          if (activeEditorKey === key) {
            const replacement = next[index] || next[index - 1] || next[next.length - 1];
            setActiveEditorKey(replacement ? replacement.key : '');
          }
        };
        const dirty = JSON.stringify(tab.draft.graph) !== tab.baseline;
        if (!dirty) {
          doClose();
          return;
        }
        setConfirm({
          title: t('confirm.closeTab.title'),
          body: tr(t, 'confirm.closeTab.body', { name: tab.draft.graph.name || t('graphEditor.new') }),
          confirmLabel: t('action.close'),
          onConfirm: () => doClose(),
        });
      };

      const copyRun = async (run) => {
        try {
          let graph = null;
          if (run.graphId) {
            try {
              const payload = await request(`/graphs?id=${encodeURIComponent(run.graphId)}`);
              graph = clone(payload.graph);
            } catch {
              graph = null;
            }
          }
          if (!graph) {
            const ids = new Map((run.nodes || []).map((node, index) => [node.path, `copy-${index + 1}`]));
            graph = {
              id: '',
              name: run.graphName || run.name || '',
              description: '',
              layout: run.layout === 'horizontal' ? 'horizontal' : 'vertical',
              nodes: (run.nodes || []).map((node) => ({
                id: ids.get(node.path),
                moduleId: node.moduleId,
                label: node.label || '',
                params: { ...(node.params || {}) },
                x: null,
                y: null,
              })),
              edges: (run.edges || []).map((edge, index) => ({
                id: `copy-edge-${index + 1}`,
                from: ids.get(edge.from),
                to: ids.get(edge.to),
                fromPort: edge.fromPort || '',
                toPort: edge.toPort || '',
              })),
            };
          }
          graph.id = '';
          delete graph.createdAt;
          delete graph.updatedAt;
          graph.name = uniqueExperimentName(
            graph.name || run.graphName || run.name,
            (data && data.graphs) || [],
            t('graphs.copySuffix'),
          );
          graph.layout = graph.layout === 'horizontal' ? 'horizontal' : 'vertical';
          openEditorTab(graph, { isCopy: true });
          pushToast(t('experiments.copyOpened'));
        } catch (error) {
          fail(error);
        }
      };

      const rerun = async (run) => {
        try {
          const payload = await request('/experiments/rerun', { method: 'POST', body: { id: run.id } });
          pushToast(t('toast.rerun'));
          await loadState(true);
          setRunId(payload.experiment.id);
          setRunDetail(payload.experiment);
        } catch (error) {
          fail(error);
        }
      };

      const deleteRun = (run) => {
        setConfirm({
          title: t('confirm.deleteRun.title'),
          body: tr(t, 'confirm.deleteRun.body', { name: run.name }),
          confirmLabel: t('action.delete'),
          onConfirm: async () => {
            try {
              await request(`/experiments?id=${encodeURIComponent(run.id)}`, { method: 'DELETE' });
              pushToast(t('toast.deleted'));
              if (runId === run.id) {
                setRunId('');
                setRunDetail(null);
              }
              await loadState(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const openWorkspace = async () => {
        try {
          await request('/workspace/open', { method: 'POST', body: {} });
          pushToast(t('toast.opened'));
        } catch (error) {
          fail(error);
        }
      };

      const resetWorkspaceView = () => {
        setEditorTabs([]);
        setActiveEditorKey('');
        setModuleDraft(null);
        setRunId('');
        setRunDetail(null);
        setLogView(null);
        setOutputView(null);
        setTab('runs');
      };

      const changeWorkspace = async (pathValue) => {
        setWorkspaceBusy(true);
        try {
          const payload = await request('/workspace', {
            method: 'POST',
            body: { path: pathValue },
          });
          setWorkspaceOpen(false);
          resetWorkspaceView();
          pushToast(payload.copied ? t('workspace.copied') : t('workspace.switched'));
          await loadState(true);
        } catch (error) {
          fail(error);
        } finally {
          setWorkspaceBusy(false);
        }
      };

      const exportWorkspace = () => {
        const anchor = document.createElement('a');
        anchor.href = `${API}/workspace/export`;
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      const importWorkspace = (bundle) => {
        setConfirm({
          title: t('confirm.importWorkspace.title'),
          body: t('confirm.importWorkspace.body'),
          confirmLabel: t('workspace.import'),
          onConfirm: async () => {
            try {
              const payload = await request('/workspace/import', {
                method: 'POST',
                body: { bundle },
              });
              setWorkspaceOpen(false);
              resetWorkspaceView();
              pushToast(
                tr(t, 'workspace.imported', {
                  modules: payload.modules,
                  graphs: payload.graphs,
                }),
              );
              await loadState(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const openRunFolder = async (run) => {
        try {
          await request('/experiments/open', { method: 'POST', body: { id: run.id } });
          pushToast(t('toast.opened'));
        } catch (error) {
          fail(error);
        }
      };

      const openSubgraph = async (graphId) => {
        if (!graphId) return;
        try {
          const payload = await request(`/graphs?id=${encodeURIComponent(graphId)}`);
          openEditorTab(payload.graph);
        } catch (error) {
          fail(error);
        }
      };

      const startGraph = async (graphId) => {
        setGraphErrors([]);
        if (graphId) {
          try {
            const payload = await request(`/graphs?id=${encodeURIComponent(graphId)}`);
            openEditorTab(payload.graph);
          } catch (error) {
            fail(error);
          }
        } else {
          openEditorTab({ id: '', name: '', description: '', layout: 'vertical', nodes: [], edges: [] });
        }
      };

      const saveGraph = async () => {
        if (!graphDraft) return;
        const key = activeEditorKey;
        setGraphSaving(true);
        setGraphErrors([]);
        try {
          const check = await request('/graphs/validate', { method: 'POST', body: { graph: graphDraft.graph } });
          if (check.errors && check.errors.length) {
            setGraphErrors(check.errors);
            return;
          }
          const payload = await request('/graphs', { method: 'POST', body: { graph: graphDraft.graph } });
          const saved = payload.graph || graphDraft.graph;
          setEditorTabs((tabs) =>
            tabs.map((entry) =>
              entry.key === key
                ? {
                    ...entry,
                    draft: { ...entry.draft, graph: clone(saved), isCopy: false },
                    baseline: JSON.stringify(saved),
                  }
                : entry,
            ),
          );
          setGraphErrors([]);
          pushToast(t('toast.saved'));
          await loadState(true);
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          setGraphErrors(message.split('；').filter(Boolean));
          fail(error);
        } finally {
          setGraphSaving(false);
        }
      };

      const deleteGraph = (graph) => {
        setConfirm({
          title: t('confirm.deleteGraph.title'),
          body: tr(t, 'confirm.deleteGraph.body', { name: graph.name }),
          confirmLabel: t('action.delete'),
          onConfirm: async () => {
            try {
              await request(`/graphs?id=${encodeURIComponent(graph.id)}`, { method: 'DELETE' });
              pushToast(t('toast.deleted'));
              removeTabsForGraph(graph.id);
              await loadState(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const uploadModuleAsset = async (payload) => {
        const result = await request('/modules/assets', { method: 'POST', body: payload });
        return result.asset;
      };

      const startModule = (module, kind = 'command') => {
        setModuleErrors([]);
        if (module) {
          setModuleDraft({ module: clone(module), isNew: false, overwriteVersion: false });
        } else {
          const nextKind = kind === 'graph' ? 'graph' : kind === 'dataset' ? 'dataset' : 'command';
          setModuleDraft({
            module: {
              id: '',
              name: '',
              description: '',
              kind: nextKind,
              command: '',
              cwd: '',
              timeoutSec: 300,
              params: {},
              paramTypes: {},
              inputs: nextKind === 'dataset' ? [] : ['input'],
              inputTypes: nextKind === 'dataset' ? {} : { input: 'string' },
              requiredInputs: [],
              outputs: ['output'],
              outputTypes: { output: 'string' },
              graphId: '',
              datasetUri: '',
              datasetFormat: '',
              version: 1,
              versions: [],
            },
            isNew: true,
            overwriteVersion: false,
          });
        }
        setTab('modules');
      };

      const createResource = async (fields) => {
        setNewResourceBusy(true);
        setNewResourceError('');
        try {
          let assetFields = {};
          if (fields.asset) {
            const uploaded = await request('/modules/assets', {
              method: 'POST',
              body: fields.asset,
            });
            assetFields = uploaded.asset || {};
          }
          const created = await request('/modules', {
            method: 'POST',
            body: {
              create: true,
              requireAsset: fields.kind === 'command',
              module: {
                id: '',
                name: fields.name,
                description: fields.description || '',
                kind: fields.kind,
                command: fields.kind === 'command' ? fields.command || '' : '',
                cwd: '',
                timeoutSec: 300,
                params: fields.kind === 'dataset' ? {} : fields.params || {},
                paramTypes: fields.kind === 'dataset' ? {} : fields.paramTypes || {},
                inputs: fields.kind === 'dataset' ? [] : fields.inputs || [],
                inputTypes: fields.kind === 'dataset' ? {} : fields.inputTypes || {},
                requiredInputs: [],
                outputs: fields.outputs || [],
                outputTypes: fields.outputTypes || {},
                graphId: '',
                datasetUri: fields.kind === 'dataset' ? fields.datasetUri : '',
                datasetFormat: fields.kind === 'dataset' ? fields.datasetFormat || '' : '',
                environmentId: 'local',
                ...assetFields,
              },
            },
          });
          setNewModuleOpen(false);
          pushToast(t('toast.saved'));
          await loadState(true);
          startModule(created.module, false);
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          setNewResourceError(message.split('；').filter(Boolean).join('；'));
        } finally {
          setNewResourceBusy(false);
        }
      };

      const saveModule = async () => {
        if (!moduleDraft) return;
        setModuleSaving(true);
        setModuleErrors([]);
        try {
          await request('/modules', {
            method: 'POST',
            body: {
              module: moduleDraft.module,
              create: Boolean(moduleDraft.isNew),
              overwriteVersion: Boolean(moduleDraft.overwriteVersion),
              requireAsset: Boolean(
                moduleDraft.isNew && moduleDraft.module.kind === 'command' && !moduleDraft.module.assetId,
              ),
            },
          });
          pushToast(t('toast.saved'));
          setModuleDraft(null);
          await loadState(true);
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          setModuleErrors(message.split('；').filter(Boolean));
        } finally {
          setModuleSaving(false);
        }
      };

      const deleteModule = (module) => {
        setConfirm({
          title: t('confirm.deleteModule.title'),
          body: tr(t, 'confirm.deleteModule.body', { name: module.name }),
          confirmLabel: t('action.delete'),
          onConfirm: async () => {
            try {
              await request(`/modules?id=${encodeURIComponent(module.id)}`, { method: 'DELETE' });
              pushToast(t('toast.deleted'));
              await loadState(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const confirmNow = async () => {
        if (!confirm) return;
        setConfirmBusy(true);
        try {
          await confirm.onConfirm();
        } finally {
          setConfirmBusy(false);
          setConfirm(null);
        }
      };

      const tabBody = () => {
        if (phase === 'loading' && !data) {
          return h('div', { className: 'ath-loading' }, h('i', { className: 'ath-spinner' }), t('common.loading'));
        }
        if (phase === 'error') {
          return h(
            'div',
            { className: 'ath-load-error' },
            h('h2', null, t('error.title')),
            h('p', null, loadError),
            h(
              'button',
              { type: 'button', className: 'ath-btn ath-btn-primary', onClick: () => void loadState(false) },
              t('error.retry'),
            ),
          );
        }
        if (!data) return null;
        if (tab === 'experiments') {
          return h(GraphsView, {
            t,
            data,
            onNew: () => void startGraph(''),
            onEdit: (id) => void startGraph(id),
            onDelete: deleteGraph,
          });
        }
        if (tab === 'modules') {
          return h(ModulesView, {
            t,
            data,
            onNew: () => {
              setNewResourceError('');
              setNewModuleOpen(true);
            },
            onEdit: (module) => startModule(module),
            onDelete: deleteModule,
          });
        }
        return h(ExperimentsView, {
          t,
          data,
          runId,
          runDetail,
          filter,
          setFilter,
          onOpenRun: (id) => void openRun(id),
          onNew: openSubmit,
          onCancelRun: cancelRun,
          onCopyRun: (run) => void copyRun(run),
          onRerun: (run) => void rerun(run),
          onDeleteRun: deleteRun,
          onOpenFolder: (run) => void openRunFolder(run),
          onOpenLog: (id, node) => setLogView({ runId: id, node }),
          onViewOutput: (id, node, port) => setOutputView({ runId: id, node, port }),
        });
      };

      let content;
      if (moduleDraft) {
        content = h(ModuleEditor, {
          t,
          data: data || { modules: [], graphs: [], environments: [], executors: [] },
          draft: moduleDraft,
          setDraft: setModuleDraft,
          onUploadAsset: uploadModuleAsset,
          onSave: () => void saveModule(),
          onBack: () => {
            setModuleDraft(null);
            setModuleErrors([]);
          },
          saving: moduleSaving,
          errors: moduleErrors,
        });
      } else if (graphDraft && tab === 'experiments') {
        content = h(ExperimentEditor, {
          key: activeEditorKey,
          t,
          modules: data ? data.modules : [],
          environments: data ? data.environments : [],
          draft: graphDraft,
          onDraftChange: updateActiveDraft,
          onSave: () => void saveGraph(),
          onBack: () => {
            setActiveEditorKey('');
            setGraphErrors([]);
          },
          onOpenSubgraph: (graphId) => void openSubgraph(graphId),
          subgraph: Boolean(
            (data && data.graphs ? data.graphs : []).find((graph) => graph.id === graphDraft.graph.id)?.isSubgraph,
          ),
          onDelete: () => {
            if (!graphDraft.graph.id) return;
            const summary = (data.graphs || []).find((graph) => graph.id === graphDraft.graph.id) || graphDraft.graph;
            deleteGraph(summary);
          },
          saving: graphSaving,
          errors: graphErrors,
        });
      } else {
        content = tabBody();
      }

      return h(
        'div',
        { className: 'ath-root' },
        h('style', null, STYLE),
        h(
          'div',
          { className: 'ath-topbar' },
          h(
            'div',
            { className: 'ath-brand' },
            h('div', { className: 'ath-brand-mark' }, h(NavIcon, { size: 20, active: true })),
            h(
              'div',
              { className: 'ath-brand-copy' },
              h('span', { className: 'ath-brand-title' }, t('panel')),
              h('span', { className: 'ath-brand-sub' }, t('subtitle')),
            ),
          ),
          h(
            'div',
            { className: 'ath-top-actions' },
            data && data.workspace
              ? h(
                  'div',
                  { className: 'ath-workspace', title: data.workspace },
                  h('span', null, data.workspace),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-workspace-edit',
                      onClick: () => setWorkspaceOpen(true),
                      title: t('workspace.change'),
                    },
                    t('workspace.change'),
                  ),
                )
              : null,
            h(
              'select',
              {
                className: 'ath-lang-select',
                value: language,
                title: t('language.title'),
                'aria-label': t('language.title'),
                onChange: (event) => setLanguage(event.target.value),
              },
              ['auto', 'zh', 'en'].map((value) =>
                h('option', { key: value, value }, t(`language.${value}`)),
              ),
            ),
            h('button', { type: 'button', className: 'ath-btn', onClick: () => void refresh(false), disabled: phase === 'loading' }, t('action.refresh')),
            h('button', { type: 'button', className: 'ath-btn', onClick: () => void openWorkspace() }, t('action.openFolder')),
          ),
        ),
        !moduleDraft
          ? h(
              'div',
              { className: 'ath-tabs' },
              ['runs', 'experiments', 'modules'].map((key) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    className: 'ath-tab',
                    'data-active': tab === key ? 'true' : 'false',
                    onClick: () => {
                      setTab(key);
                      if (key === 'experiments') setActiveEditorKey('');
                    },
                  },
                  t(`tab.${key}`),
                  data
                    ? h(
                        'span',
                        { className: 'ath-tab-count' },
                        key === 'runs'
                          ? (data.experiments || []).length
                          : key === 'experiments'
                            ? (data.graphs || []).length
                            : (data.modules || []).length,
                      )
                    : null,
                ),
              ),
            )
          : null,
        tab === 'experiments' && !moduleDraft && editorTabs.length
          ? h(
              'div',
              { className: 'ath-editor-tabs' },
              editorTabs.map((entry, index) => {
                const name = entry.draft.graph.name || `${t('graphEditor.new')} ${index + 1}`;
                const dirty = JSON.stringify(entry.draft.graph) !== entry.baseline;
                const summary = (data && data.graphs ? data.graphs : []).find(
                  (graph) => graph.id === entry.draft.graph.id,
                );
                return h(
                  'div',
                  {
                    key: entry.key,
                    className: 'ath-editor-tab',
                    'data-active': entry.key === activeEditorKey ? 'true' : 'false',
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-editor-tab-label',
                      title: name,
                      onClick: () => {
                        setTab('experiments');
                        setActiveEditorKey(entry.key);
                        setGraphErrors([]);
                      },
                    },
                    dirty ? `${name} *` : name,
                    summary && summary.isSubgraph
                      ? h('span', { className: 'ath-editor-tab-badge' }, t('graphs.subgraph'))
                      : null,
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-editor-tab-close',
                      title: t('action.close'),
                      onClick: (event) => {
                        event.stopPropagation();
                        closeEditorTab(entry.key);
                      },
                    },
                    '×',
                  ),
                );
              }),
            )
          : null,
        h('div', { className: 'ath-body' }, content),
        workspaceOpen
          ? h(WorkspaceDialog, {
              t,
              current: data ? data.workspace : '',
              busy: workspaceBusy,
              onClose: () => setWorkspaceOpen(false),
              onSubmit: (pathValue) => void changeWorkspace(pathValue),
              onExport: () => exportWorkspace(),
              onImport: (bundle) => importWorkspace(bundle),
            })
          : null,
        newModuleOpen
          ? h(NewModuleDialog, {
              t,
              busy: newResourceBusy,
              error: newResourceError,
              onClose: () => {
                setNewModuleOpen(false);
                setNewResourceError('');
              },
              onCreate: (fields) => void createResource(fields),
            })
          : null,
        submitOpen
          ? h(SubmitDialog, {
              t,
              graphs: data ? data.graphs.filter((graph) => !graph.isSubgraph) : [],
              executors: data ? data.executors : [],
              busy: submitting,
              onClose: () => setSubmitOpen(false),
              onSubmit: (values) => void submitExperiment(values),
            })
          : null,
        logView
          ? h(LogModal, {
              t,
              runId: logView.runId,
              node: logView.node,
              onClose: () => setLogView(null),
            })
          : null,
        outputView
          ? h(OutputModal, {
              t,
              runId: outputView.runId,
              node: outputView.node,
              port: outputView.port,
              onClose: () => setOutputView(null),
            })
          : null,
        h(ConfirmDialog, {
          t,
          dialog: confirm,
          busy: confirmBusy,
          onCancel: () => setConfirm(null),
          onConfirm: () => void confirmNow(),
        }),
        h(Toasts, { toasts }),
      );
    }
