window.__ModuleLoader__.load({
  id: 'aether',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'aether';
    const API = '/aether-api';
    const TAB_KEY = 'aether:active-tab';

    // ---------------------------------------------------------- 文案

    const ZH = {
      panel: 'Aether',
      subtitle: '有向无环图任务执行管理器',
      'tab.experiments': '实验',
      'tab.graphs': '图',
      'tab.modules': '模块',
      workspace: '工作区',
      'action.refresh': '刷新',
      'action.openFolder': '打开目录',
      'action.save': '保存',
      'action.cancel': '取消',
      'action.delete': '删除',
      'action.edit': '编辑',
      'action.create': '新建',
      'action.add': '添加',
      'action.remove': '移除',
      'action.close': '关闭',
      'action.back': '返回',
      'action.confirm': '确定',
      'common.loading': '正在加载…',
      'common.empty': '暂无内容',
      'common.name': '名称',
      'common.description': '描述',
      'common.status': '状态',
      'common.params': '参数',
      'common.updatedAt': '更新于',
      'common.duration': '耗时',
      'common.seconds': '秒',
      'common.nodes': '节点',
      'common.edges': '连线',
      'common.module': '模块',
      'common.graph': '图',
      'common.dash': '—',
      'status.pending': '等待',
      'status.running': '运行中',
      'status.succeeded': '成功',
      'status.failed': '失败',
      'status.skipped': '跳过',
      'status.cancelled': '已取消',
      'environment.local': '本机',
      'environment.localHint': '在 dsh 宿主进程所在的机器上执行。',
      'executor.local': '本机执行器',
      'executor.remote': '远程执行器',
      'experiments.executor': '执行器',
      'experiments.environments': '执行环境',
      'graphs.planEnv': '环境',
      'experiments.title': '实验记录',
      'experiments.subtitle': '提交一张图，Aether 按依赖顺序执行其中的模块使用。',
      'experiments.new': '提交实验',
      'experiments.empty': '还没有提交过实验。先在「图」里搭一张 DAG，再回来提交。',
      'experiments.select': '选择左侧的实验中查看详情',
      'experiments.filter.all': '全部',
      'experiments.filter.running': '运行中',
      'experiments.filter.finished': '已结束',
      'experiments.filter.failed': '失败',
      'experiments.progress': '{done}/{total}',
      'experiments.nodeTable': '节点执行情况',
      'experiments.node': '节点',
      'experiments.exitCode': '退出码',
      'experiments.log': '日志',
      'experiments.logs': '执行日志',
      'experiments.stdout': '标准输出',
      'experiments.stderr': '错误输出',
      'experiments.logEmpty': '这个节点还没有输出。',
      'experiments.cancel': '取消实验',
      'experiments.rerun': '重跑',
      'experiments.delete': '删除实验',
      'experiments.openDir': '打开运行目录',
      'experiments.name': '实验名称',
      'experiments.namePlaceholder': '留空则自动生成',
      'experiments.concurrency': '并发上限',
      'experiments.graph': '选择图',
      'experiments.submit': '提交',
      'experiments.submitting': '正在提交…',
      'experiments.noGraphs': '还没有可提交的图，先去「图」里创建一张。',
      'experiments.plan': '执行计划',
      'experiments.planSummary': '{nodes} 个节点 · {layers} 层',
      'experiments.startedAt': '开始',
      'experiments.endedAt': '结束',
      'experiments.paramsHint': '提交时使用的模块与参数已快照，之后修改图不会影响这次实验。',
      'experiments.cancelHint': '取消会终止正在运行的节点，未开始的节点标记为已取消。',
      'experiments.deleteHint': '删除会移除这次实验的运行目录和日志，不可恢复。',
      'experiments.rerunHint': '按当前图重新提交一次实验（会使用最新的模块与参数）。',
      'experiments.params': '参数',
      'experiments.subgraphNode': '子图',
      'graphs.title': '图',
      'graphs.subtitle': '用模块使用和连线搭出实验的 DAG；子图模块可以把一张图装进另一张图。',
      'graphs.empty': '还没有图。新建一张，从模块库添加节点并用连线表达依赖。',
      'graphs.new': '新建图',
      'graphs.edit': '编辑',
      'graphs.delete': '删除图',
      'graphs.name': '图名称',
      'graphs.desc': '说明',
      'graphs.nodeCount': '{n} 个节点',
      'graphs.edgeCount': '{n} 条连线',
      'graphs.layerCount': '{n} 层',
      'graphs.addNode': '添加节点',
      'graphs.chooseModule': '选择模块',
      'graphs.noModules': '模块库还是空的，先去「模块」里创建一个。',
      'graphs.canvasEmpty': '从上方选一个模块并添加为节点。',
      'graphs.inspector': '节点设置',
      'graphs.selectNode': '在画布上点一个节点来编辑。',
      'graphs.nodeLabel': '显示名称',
      'graphs.nodeLabelPlaceholder': '默认使用模块名称',
      'graphs.nodeModule': '使用模块',
      'graphs.nodeDeps': '依赖',
      'graphs.addDep': '添加依赖',
      'graphs.depPlaceholder': '选择上游节点',
      'graphs.noDeps': '没有依赖，作为入口节点。',
      'graphs.deleteNode': '删除节点',
      'graphs.edges': '连线',
      'graphs.save': '保存图',
      'graphs.saving': '正在保存…',
      'graphs.cycle': '存在环，请调整连线',
      'graphs.planNodes': '{n} 个可执行节点',
      'graphs.unsaved': '有未保存的修改',
      'graphs.subgraph': '子图',
      'graphs.subgraphTip': '这个节点会把子图「{name}」内联进当前图执行；节点参数会作为子图节点的默认值。',
      'graphs.fixErrors': '请先修正图上的问题',
      'graphs.deleteHint': '删除后这张图不会再出现在提交列表里；历史实验记录仍然保留。',
      'graphs.nodesTitle': '节点与连线',
      'graphs.removeEdge': '删除连线',
      'modules.title': '模块',
      'modules.subtitle': '模块是可复用的执行单元：一段命令，或另一张图（子图）。',
      'modules.empty': '还没有模块。创建一个命令模块开始。',
      'modules.new': '新建模块',
      'modules.edit': '编辑模块',
      'modules.delete': '删除模块',
      'modules.id': '模块 id',
      'modules.idHint': '小写字母、数字和连字符；留空时按名称生成。',
      'modules.kind': '模块类型',
      'modules.kind.command': '命令',
      'modules.kind.graph': '子图',
      'modules.command': '命令',
      'modules.commandHint': '通过 shell 执行。可用 {{参数名}} 插入参数；环境变量见下方说明。',
      'modules.cwd': '工作目录',
      'modules.cwdHint': '留空使用 DSH 进程的当前目录；支持 ~。',
      'modules.timeout': '超时（秒）',
      'modules.params': '默认参数',
      'modules.paramsHint': '节点会继承这里的默认值，可在节点上覆盖。',
      'modules.graphRef': '引用的图',
      'modules.graphRefHint': '该图会在使用此模块的节点处内联执行。',
      'modules.environment': '执行环境',
      'modules.environmentHint': '决定模块由哪个执行器运行。当前只有本机执行器；接入远程执行器后，由调度器按环境选择执行位置。',
      'modules.usedBy': '被使用',
      'modules.usedByCount': '{n} 张图',
      'modules.notUsed': '尚未被使用',
      'modules.envTitle': '执行时注入的环境',
      'modules.envHint': 'AETHER_INPUT_FILE（上游输入 JSON 文件）、AETHER_NODE_DIR（节点目录）、AETHER_PARAMS（参数 JSON）、AETHER_INPUTS（上游摘要 JSON）、AETHER_RUN_ID / AETHER_NODE_PATH。',
      'modules.noGraphs': '还没有图可选，先创建一张图。',
      'modules.deleteHint': '删除后模块会从模块库移除；被图引用的模块不能直接删除。',
      'modules.placeholder.name': '例如：训练模型',
      'modules.placeholder.description': '这个模块做什么、输入输出是什么',
      'modules.placeholder.command': 'node scripts/train.js --lr {{lr}}',
      'modules.save': '保存模块',
      'modules.saving': '正在保存…',
      'modules.commandTitle': '命令模块',
      'modules.graphTitle': '子图模块',
      'modules.usage': '引用它的图',
      'common.addParam': '添加参数',
      'common.paramKey': '参数名',
      'common.paramValue': '值',
      'common.noParams': '没有参数',
      'toast.saved': '已保存',
      'toast.deleted': '已删除',
      'toast.submitted': '实验已提交',
      'toast.cancelled': '已请求取消',
      'toast.rerun': '已重新提交',
      'toast.failed': '操作失败：{message}',
      'toast.opened': '已打开目录',
      'toast.copied': '已复制',
      'error.load': '无法加载 Aether 状态：{message}',
      'error.title': '无法加载 Aether',
      'error.retry': '重试',
      'confirm.deleteModule.title': '删除模块？',
      'confirm.deleteModule.body': '模块「{name}」将从模块库移除。',
      'confirm.deleteGraph.title': '删除图？',
      'confirm.deleteGraph.body': '图「{name}」将从图列表移除。',
      'confirm.deleteRun.title': '删除实验记录？',
      'confirm.deleteRun.body': '实验「{name}」的运行目录与日志会被删除。',
      'confirm.cancelRun.title': '取消实验？',
      'confirm.cancelRun.body': '正在运行的节点会被终止，未开始的节点标记为已取消。',
      'log.title': '节点日志',
      'log.refresh': '刷新',
      'log.close': '关闭',
      'log.copy': '复制全部',
      'graphEditor.new': '新建图',
      'graphEditor.edit': '编辑图',
      'moduleEditor.new': '新建模块',
      'moduleEditor.edit': '编辑模块',
    };

    const EN = {
      panel: 'Aether',
      subtitle: 'Directed-acyclic-graph task execution manager',
      'tab.experiments': 'Experiments',
      'tab.graphs': 'Graphs',
      'tab.modules': 'Modules',
      workspace: 'Workspace',
      'action.refresh': 'Refresh',
      'action.openFolder': 'Open folder',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.create': 'New',
      'action.add': 'Add',
      'action.remove': 'Remove',
      'action.close': 'Close',
      'action.back': 'Back',
      'action.confirm': 'Confirm',
      'common.loading': 'Loading…',
      'common.empty': 'Nothing here yet',
      'common.name': 'Name',
      'common.description': 'Description',
      'common.status': 'Status',
      'common.params': 'Parameters',
      'common.updatedAt': 'Updated',
      'common.duration': 'Duration',
      'common.seconds': 'seconds',
      'common.nodes': 'nodes',
      'common.edges': 'edges',
      'common.module': 'Module',
      'common.graph': 'Graph',
      'common.dash': '—',
      'status.pending': 'Pending',
      'status.running': 'Running',
      'status.succeeded': 'Succeeded',
      'status.failed': 'Failed',
      'status.skipped': 'Skipped',
      'status.cancelled': 'Cancelled',
      'environment.local': 'Local',
      'environment.localHint': 'Run on the machine hosting the dsh process.',
      'executor.local': 'Local executor',
      'executor.remote': 'Remote executor',
      'experiments.executor': 'Executor',
      'experiments.environments': 'Environments',
      'graphs.planEnv': 'Environment',
      'experiments.title': 'Experiments',
      'experiments.subtitle': 'Submit a graph and Aether runs its module usages in dependency order.',
      'experiments.new': 'Submit experiment',
      'experiments.empty': 'No experiments yet. Build a DAG under Graphs, then submit it here.',
      'experiments.select': 'Select an experiment on the left to see details',
      'experiments.filter.all': 'All',
      'experiments.filter.running': 'Running',
      'experiments.filter.finished': 'Finished',
      'experiments.filter.failed': 'Failed',
      'experiments.progress': '{done}/{total}',
      'experiments.nodeTable': 'Node execution',
      'experiments.node': 'Node',
      'experiments.exitCode': 'Exit code',
      'experiments.log': 'Log',
      'experiments.logs': 'Execution log',
      'experiments.stdout': 'stdout',
      'experiments.stderr': 'stderr',
      'experiments.logEmpty': 'This node has no output yet.',
      'experiments.cancel': 'Cancel experiment',
      'experiments.rerun': 'Run again',
      'experiments.delete': 'Delete experiment',
      'experiments.openDir': 'Open run folder',
      'experiments.name': 'Experiment name',
      'experiments.namePlaceholder': 'Leave blank to generate one',
      'experiments.concurrency': 'Concurrency limit',
      'experiments.graph': 'Graph',
      'experiments.submit': 'Submit',
      'experiments.submitting': 'Submitting…',
      'experiments.noGraphs': 'No graphs to submit yet. Create one under Graphs first.',
      'experiments.plan': 'Execution plan',
      'experiments.planSummary': '{nodes} nodes · {layers} layers',
      'experiments.startedAt': 'Started',
      'experiments.endedAt': 'Ended',
      'experiments.paramsHint': 'The modules and parameters are snapshotted at submit time; later graph edits do not affect this run.',
      'experiments.cancelHint': 'Cancelling stops running nodes and marks pending nodes as cancelled.',
      'experiments.deleteHint': 'Deleting removes this run folder and its logs permanently.',
      'experiments.rerunHint': 'Submit the current graph again with the latest modules and parameters.',
      'experiments.params': 'Parameters',
      'experiments.subgraphNode': 'Subgraph',
      'graphs.title': 'Graphs',
      'graphs.subtitle': 'Build experiment DAGs from module usages and edges; a subgraph module nests one graph in another.',
      'graphs.empty': 'No graphs yet. Create one, add module usages as nodes and connect their dependencies.',
      'graphs.new': 'New graph',
      'graphs.edit': 'Edit',
      'graphs.delete': 'Delete graph',
      'graphs.name': 'Graph name',
      'graphs.desc': 'Description',
      'graphs.nodeCount': '{n} nodes',
      'graphs.edgeCount': '{n} edges',
      'graphs.layerCount': '{n} layers',
      'graphs.addNode': 'Add node',
      'graphs.chooseModule': 'Choose a module',
      'graphs.noModules': 'The module library is empty. Create a module first.',
      'graphs.canvasEmpty': 'Pick a module above and add it as a node.',
      'graphs.inspector': 'Node settings',
      'graphs.selectNode': 'Select a node on the canvas to edit it.',
      'graphs.nodeLabel': 'Display name',
      'graphs.nodeLabelPlaceholder': 'Defaults to the module name',
      'graphs.nodeModule': 'Module usage',
      'graphs.nodeDeps': 'Dependencies',
      'graphs.addDep': 'Add dependency',
      'graphs.depPlaceholder': 'Choose an upstream node',
      'graphs.noDeps': 'No dependencies; this is an entry node.',
      'graphs.deleteNode': 'Delete node',
      'graphs.edges': 'Edges',
      'graphs.save': 'Save graph',
      'graphs.saving': 'Saving…',
      'graphs.cycle': 'The graph contains a cycle',
      'graphs.planNodes': '{n} executable nodes',
      'graphs.unsaved': 'Unsaved changes',
      'graphs.subgraph': 'Subgraph',
      'graphs.subgraphTip': 'This node inlines graph “{name}” when run; node parameters become defaults for the inner nodes.',
      'graphs.fixErrors': 'Fix the graph problems first',
      'graphs.deleteHint': 'Deleting removes the graph from the submit list; past experiments keep their records.',
      'graphs.nodesTitle': 'Nodes and edges',
      'graphs.removeEdge': 'Remove edge',
      'modules.title': 'Modules',
      'modules.subtitle': 'Modules are reusable execution units: a shell command, or another graph (a subgraph).',
      'modules.empty': 'No modules yet. Create a command module to start.',
      'modules.new': 'New module',
      'modules.edit': 'Edit module',
      'modules.delete': 'Delete module',
      'modules.id': 'Module id',
      'modules.idHint': 'Lowercase letters, digits and hyphens; generated from the name when blank.',
      'modules.kind': 'Module type',
      'modules.kind.command': 'Command',
      'modules.kind.graph': 'Subgraph',
      'modules.command': 'Command',
      'modules.commandHint': 'Runs through the shell. Insert parameters with {{name}}; environment variables are listed below.',
      'modules.cwd': 'Working directory',
      'modules.cwdHint': 'Blank uses the DSH process working directory; ~ is supported.',
      'modules.timeout': 'Timeout (seconds)',
      'modules.params': 'Default parameters',
      'modules.paramsHint': 'Nodes inherit these defaults and can override them.',
      'modules.graphRef': 'Graph',
      'modules.graphRefHint': 'This graph is inlined where the module is used.',
      'modules.environment': 'Execution environment',
      'modules.environmentHint': 'Chooses which executor runs the module. Only the local executor exists today; a remote executor will let a scheduler pick a location per environment.',
      'modules.usedBy': 'Used by',
      'modules.usedByCount': '{n} graphs',
      'modules.notUsed': 'Not used yet',
      'modules.envTitle': 'Injected environment',
      'modules.envHint': 'AETHER_INPUT_FILE (upstream inputs JSON), AETHER_NODE_DIR (node folder), AETHER_PARAMS (params JSON), AETHER_INPUTS (upstream summary JSON), AETHER_RUN_ID / AETHER_NODE_PATH.',
      'modules.noGraphs': 'No graphs available; create a graph first.',
      'modules.deleteHint': 'Deleting removes the module from the library; modules used by graphs cannot be deleted.',
      'modules.placeholder.name': 'e.g. Train model',
      'modules.placeholder.description': 'What this module does and what it consumes or produces',
      'modules.placeholder.command': 'node scripts/train.js --lr {{lr}}',
      'modules.save': 'Save module',
      'modules.saving': 'Saving…',
      'modules.commandTitle': 'Command module',
      'modules.graphTitle': 'Subgraph module',
      'modules.usage': 'Referenced by',
      'common.addParam': 'Add parameter',
      'common.paramKey': 'Parameter',
      'common.paramValue': 'Value',
      'common.noParams': 'No parameters',
      'toast.saved': 'Saved',
      'toast.deleted': 'Deleted',
      'toast.submitted': 'Experiment submitted',
      'toast.cancelled': 'Cancellation requested',
      'toast.rerun': 'Submitted again',
      'toast.failed': 'Action failed: {message}',
      'toast.opened': 'Folder opened',
      'toast.copied': 'Copied',
      'error.load': 'Could not load Aether state: {message}',
      'error.title': 'Could not load Aether',
      'error.retry': 'Retry',
      'confirm.deleteModule.title': 'Delete module?',
      'confirm.deleteModule.body': 'Module “{name}” will be removed from the library.',
      'confirm.deleteGraph.title': 'Delete graph?',
      'confirm.deleteGraph.body': 'Graph “{name}” will be removed from the graph list.',
      'confirm.deleteRun.title': 'Delete experiment record?',
      'confirm.deleteRun.body': 'The run folder and logs of “{name}” will be deleted.',
      'confirm.cancelRun.title': 'Cancel experiment?',
      'confirm.cancelRun.body': 'Running nodes are stopped and pending nodes are marked cancelled.',
      'log.title': 'Node log',
      'log.refresh': 'Refresh',
      'log.close': 'Close',
      'log.copy': 'Copy all',
      'graphEditor.new': 'New graph',
      'graphEditor.edit': 'Edit graph',
      'moduleEditor.new': 'New module',
      'moduleEditor.edit': 'Edit module',
    };

    // ---------------------------------------------------------- 样式

    const STYLE = `
.ath-root {
  height: 100%;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  overflow: hidden;
}
.ath-root *, .ath-root *::before, .ath-root *::after { box-sizing: border-box; }
.ath-root button, .ath-root input, .ath-root textarea, .ath-root select { font: inherit; }
.ath-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.ath-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.ath-brand-mark {
  width: 28px; height: 28px; border-radius: 9px; flex: 0 0 auto;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-brand-primary);
}
.ath-brand-copy { display: flex; flex-direction: column; min-width: 0; }
.ath-brand-title { font-size: 15px; font-weight: 650; letter-spacing: .01em; }
.ath-brand-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ath-top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.ath-workspace {
  display: inline-flex; align-items: center; gap: 6px; max-width: 320px;
  padding: 4px 9px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.ath-workspace span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.ath-tabs {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 2px;
  padding: 0 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.ath-tab {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  padding: 10px 12px 9px;
  color: var(--dsw-alias-label-secondary);
  border-bottom: 2px solid transparent;
  font-size: 13px;
}
.ath-tab:hover { color: var(--dsw-alias-label-primary); }
.ath-tab[data-active="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.ath-tab-count { margin-left: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.ath-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.ath-page { width: min(1180px, 100% - 40px); margin: 0 auto; padding: 18px 0 40px; }
.ath-page-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.ath-page-title { margin: 0; font-size: 17px; font-weight: 650; }
.ath-page-sub { margin: 3px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); max-width: 720px; }
.ath-page-head .ath-actions { margin-left: auto; }
.ath-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ath-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px; padding: 6px 11px; cursor: pointer;
  font-size: 12.5px; line-height: 1.4;
}
.ath-btn:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.ath-btn:disabled { opacity: .55; cursor: not-allowed; }
.ath-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.ath-btn-primary:hover { background: var(--dsw-alias-brand-primary); filter: brightness(1.06); }
.ath-btn-danger { color: var(--dsw-alias-state-error-primary); }
.ath-btn-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.ath-btn-ghost:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.ath-icon-btn {
  border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary);
  border-radius: 7px; width: 26px; height: 26px; cursor: pointer; line-height: 1;
  display: inline-grid; place-items: center; font-size: 16px;
}
.ath-icon-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
.ath-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 7px; border-radius: 999px; font-size: 10.5px; line-height: 1.7;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); white-space: nowrap;
}
.ath-badge[data-kind="command"] { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); }
.ath-badge[data-kind="graph"] { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); }
.ath-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; white-space: nowrap; }
.ath-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ath-status[data-status="running"] { color: var(--dsw-alias-brand-primary); }
.ath-status[data-status="succeeded"] { color: var(--dsw-alias-state-success-primary); }
.ath-status[data-status="failed"] { color: var(--dsw-alias-state-error-primary); }
.ath-status[data-status="pending"], .ath-status[data-status="skipped"] { color: var(--dsw-alias-label-secondary); }
.ath-status[data-status="cancelled"] { color: var(--dsw-alias-state-warn-primary); }
.ath-muted { color: var(--dsw-alias-label-secondary); }
.ath-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.ath-card {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 11px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 13px 14px;
}
.ath-field { display: flex; flex-direction: column; gap: 5px; }
.ath-field + .ath-field { margin-top: 12px; }
.ath-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); letter-spacing: .01em; }
.ath-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.ath-input, .ath-select, .ath-textarea {
  width: 100%; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  border-radius: 8px; padding: 7px 9px; font-size: 12.5px;
}
.ath-input:focus, .ath-select:focus, .ath-textarea:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); outline-offset: -1px; border-color: var(--dsw-alias-brand-primary); }
.ath-textarea { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.5px; line-height: 1.65; resize: vertical; min-height: 96px; }
.ath-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.ath-row { display: flex; align-items: center; gap: 8px; }
.ath-row > * { min-width: 0; }
.ath-grid-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.ath-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ath-chip {
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); border-radius: 999px;
  padding: 3px 10px; font-size: 11.5px; cursor: pointer;
}
.ath-chip[data-active="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
.ath-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  min-height: 220px; padding: 28px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: 12px;
  color: var(--dsw-alias-label-secondary); font-size: 12.5px;
}
.ath-empty strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
.ath-spinner { width: 16px; height: 16px; border: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent); border-top-color: var(--dsw-alias-brand-primary); border-radius: 50%; animation: ath-spin .8s linear infinite; }
.ath-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 64px 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.ath-load-error { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 56px 20px; text-align: center; }
.ath-load-error h2 { margin: 0; font-size: 15px; }
.ath-load-error p { margin: 0; max-width: 480px; color: var(--dsw-alias-label-secondary); font-size: 12px; overflow-wrap: anywhere; }
.ath-split { display: grid; grid-template-columns: minmax(260px, 330px) minmax(0, 1fr); gap: 14px; align-items: start; }
.ath-run-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.ath-run-item {
  display: flex; flex-direction: column; gap: 5px;
  padding: 10px 12px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: transparent; text-align: left; cursor: pointer; color: inherit;
}
.ath-run-item:last-child { border-bottom: 0; }
.ath-run-item:hover { background: var(--dsw-alias-bg-layer-2); }
.ath-run-item[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1)); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.ath-run-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; min-width: 0; }
.ath-run-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-run-meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.ath-progress { height: 4px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.ath-progress > i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); transition: width .3s ease; }
.ath-progress[data-status="succeeded"] > i { background: var(--dsw-alias-state-success-primary); }
.ath-progress[data-status="failed"] > i { background: var(--dsw-alias-state-error-primary); }
.ath-progress[data-status="cancelled"] > i { background: var(--dsw-alias-state-warn-primary); }
.ath-detail { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ath-detail-head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.ath-detail-title { margin: 0; font-size: 16px; font-weight: 650; overflow-wrap: anywhere; }
.ath-detail-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 3px; }
.ath-detail-actions { margin-left: auto; display: flex; gap: 7px; flex-wrap: wrap; }
.ath-stat-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.ath-stat-row b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.ath-node-table { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.ath-node-row { display: grid; grid-template-columns: minmax(140px, 1.6fr) minmax(110px, 1fr) 92px 78px 64px 62px; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11.5px; }
.ath-node-row:last-child { border-bottom: 0; }
.ath-node-row[data-head="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10.5px; font-weight: 600; }
.ath-node-name { display: flex; flex-direction: column; min-width: 0; }
.ath-node-name strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-node-name code { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.ath-node-error { grid-column: 1 / -1; color: var(--dsw-alias-state-error-primary); font-size: 10.5px; overflow-wrap: anywhere; }
.ath-node-params { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.ath-param-chip { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 1px 5px; }
.ath-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ath-module-card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; background: var(--dsw-alias-bg-layer-1); padding: 13px 14px; }
.ath-module-card:hover { border-color: var(--dsw-alias-border-l2); }
.ath-module-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ath-module-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-module-desc { font-size: 11.5px; color: var(--dsw-alias-label-secondary); min-height: 34px; overflow-wrap: anywhere; }
.ath-module-code { margin: 0; padding: 7px 9px; border-radius: 7px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-height: 56px; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.ath-module-foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 3px; }
.ath-module-foot .ath-actions { margin-left: auto; }
.ath-editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 14px; align-items: start; }
.ath-editor-main, .ath-editor-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ath-editor-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ath-editor-title { margin: 0; font-size: 16px; font-weight: 650; }
.ath-editor-head .ath-actions { margin-left: auto; }
.ath-canvas-wrap { border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; background: var(--dsw-alias-bg-base); overflow: auto; }
.ath-canvas { position: relative; }
.ath-canvas svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.ath-canvas-node {
  position: absolute; width: 168px; height: 68px;
  display: flex; flex-direction: column; justify-content: center; gap: 3px;
  padding: 8px 11px; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); color: inherit; cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
}
.ath-canvas-node:hover { border-color: var(--dsw-alias-border-l2); }
.ath-canvas-node[data-selected="true"] { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.ath-canvas-node[data-kind="graph"] { border-style: dashed; }
.ath-canvas-node-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-canvas-node-meta { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap; }
.ath-canvas-node-meta > span { overflow: hidden; text-overflow: ellipsis; }
.ath-node-tag { font-size: 9px; padding: 0 4px; border-radius: 3px; border: 1px solid currentColor; color: var(--dsw-alias-state-warn-primary); flex: 0 0 auto; }
.ath-node-env { margin-left: 6px; font-size: 9.5px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 0 4px; white-space: nowrap; }
.ath-inspector { display: flex; flex-direction: column; gap: 12px; }
.ath-section-title { margin: 0 0 2px; font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-secondary); text-transform: none; }
.ath-param-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 24px; gap: 6px; align-items: center; }
.ath-param-row + .ath-param-row { margin-top: 6px; }
.ath-dep-list { display: flex; flex-direction: column; gap: 6px; }
.ath-dep-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; font-size: 11.5px; background: var(--dsw-alias-bg-base); }
.ath-dep-row .ath-dep-arrow { color: var(--dsw-alias-label-secondary); }
.ath-dep-row .ath-icon-btn { margin-left: auto; }
.ath-edge-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding: 4px 0; }
.ath-edge-row code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.ath-modal-backdrop {
  position: fixed; inset: 0; z-index: 1410;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 8vh 16px 16px;
  background: rgba(15, 23, 42, .38);
  backdrop-filter: blur(1.5px);
}
.ath-modal {
  width: min(620px, 100%); max-height: 84vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 13px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .28);
  overflow: hidden;
}
.ath-modal[data-wide="true"] { width: min(860px, 100%); }
.ath-modal-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px 11px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ath-modal-head h3 { margin: 0; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.ath-modal-head .ath-icon-btn { margin-left: auto; }
.ath-modal-body { padding: 14px; overflow: auto; }
.ath-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 11px 14px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ath-log-pre {
  margin: 0; min-height: 240px; max-height: 52vh; overflow: auto;
  padding: 11px 12px; border-radius: 8px;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
}
.ath-toasts { position: fixed; right: 20px; bottom: 20px; z-index: 1420; display: flex; flex-direction: column; gap: 7px; max-width: 380px; pointer-events: none; }
.ath-toast {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 9px 12px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  box-shadow: 0 10px 30px rgba(15, 23, 42, .20); font-size: 11.5px;
  animation: ath-toast-in .16s ease-out;
}
.ath-toast[data-kind="error"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-state-error-primary); }
.ath-toast-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto; background: var(--dsw-alias-state-success-primary); }
.ath-toast[data-kind="error"] .ath-toast-dot { background: var(--dsw-alias-state-error-primary); }
.ath-nav-icon { display: block; }
@keyframes ath-spin { to { transform: rotate(360deg); } }
@keyframes ath-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 980px) {
  .ath-split { grid-template-columns: minmax(0, 1fr); }
  .ath-editor { grid-template-columns: minmax(0, 1fr); }
  .ath-node-row { grid-template-columns: minmax(120px, 1.4fr) minmax(90px, 1fr) 78px 60px 52px; }
  .ath-node-row > :nth-child(5) { display: none; }
  .ath-workspace { max-width: 180px; }
}
@media (max-width: 720px) {
  .ath-page { width: calc(100% - 24px); padding-top: 14px; }
  .ath-brand-sub { display: none; }
  .ath-topbar { padding: 10px 12px; }
  .ath-node-row { grid-template-columns: minmax(110px, 1.4fr) 84px 56px 52px; }
  .ath-node-row > :nth-child(2), .ath-node-row > :nth-child(4) { display: none; }
  .ath-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
    `;

    // ---------------------------------------------------------- 工具

    function fill(template, values) {
      return String(template == null ? '' : template).replace(/\{(\w+)\}/g, (match, key) =>
        values && values[key] !== undefined ? String(values[key]) : match,
      );
    }

    function tr(t, key, values) {
      return values ? fill(t(key), values) : t(key);
    }

    function pad(value) {
      return String(value).padStart(2, '0');
    }

    function formatDateTime(ms) {
      if (!ms) return '—';
      const date = new Date(ms);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatDuration(start, end) {
      if (!start) return '—';
      const ms = Math.max(0, (end || Date.now()) - start);
      if (ms < 1000) return `${Math.round(ms)}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }

    function statusText(t, status) {
      return t(`status.${status}`);
    }

    function statusClass(status) {
      return status;
    }

    function environmentLabel(t, environment) {
      if (!environment) return '';
      if (environment.builtin && environment.id === 'local') return t('environment.local');
      return environment.name || environment.id;
    }

    function environmentHint(t, environment) {
      if (!environment) return '';
      if (environment.builtin && environment.id === 'local') return t('environment.localHint');
      return environment.description || '';
    }

    /** 在环境目录里找名字；目录里没有时退回节点快照里的名字。 */
    function environmentName(t, environments, environmentId, fallback) {
      const environment = (environments || []).find((item) => item.id === environmentId);
      if (environment) return environmentLabel(t, environment);
      return fallback || environmentId || t('environment.local');
    }

    function executorLabel(t, executorId) {
      return executorId === 'local' ? t('executor.local') : executorId || t('executor.local');
    }

    function paramsToRows(params) {
      return Object.entries(params || {}).map(([key, value]) => ({ key, value: String(value) }));
    }

    function rowsToParams(rows) {
      const params = {};
      for (const row of rows) {
        const key = String(row.key || '').trim();
        if (!key) continue;
        params[key] = row.value;
      }
      return params;
    }

    function uniqueNodeId(graph, base) {
      const taken = new Set(graph.nodes.map((node) => node.id));
      let index = 1;
      let id = `${base}-${index}`;
      while (taken.has(id)) {
        index += 1;
        id = `${base}-${index}`;
      }
      return id;
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    /** 本地分层；有环时返回 null，画布退回单列布局。 */
    function localLayers(graph) {
      const ids = new Set(graph.nodes.map((node) => node.id));
      const deps = new Map(graph.nodes.map((node) => [node.id, []]));
      const out = new Map(graph.nodes.map((node) => [node.id, []]));
      for (const edge of graph.edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
        deps.get(edge.to).push(edge.from);
        out.get(edge.from).push(edge.to);
      }
      const indegree = new Map(graph.nodes.map((node) => [node.id, deps.get(node.id).length]));
      const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
      const order = [];
      while (queue.length) {
        const id = queue.shift();
        order.push(id);
        for (const next of out.get(id) || []) {
          const left = indegree.get(next) - 1;
          indegree.set(next, left);
          if (left === 0) queue.push(next);
        }
      }
      if (order.length !== graph.nodes.length) return null;
      const depth = new Map();
      for (const id of order) {
        const parents = deps.get(id) || [];
        depth.set(id, parents.length ? Math.max(...parents.map((parent) => (depth.get(parent) || 0) + 1)) : 0);
      }
      const layers = [];
      for (const id of order) {
        const index = depth.get(id) || 0;
        if (!layers[index]) layers[index] = [];
        layers[index].push(id);
      }
      return layers;
    }

    function graphLayout(graph) {
      const layers = localLayers(graph);
      if (!layers) {
        const positions = new Map();
        graph.nodes.forEach((node, index) => {
          positions.set(node.id, { x: 24, y: 24 + index * 92, col: 0, row: index });
        });
        return { positions, width: 360, height: Math.max(200, graph.nodes.length * 92 + 32), broken: true };
      }
      const positions = new Map();
      let maxRows = 1;
      layers.forEach((ids, col) => {
        maxRows = Math.max(maxRows, ids.length);
        ids.forEach((id, row) => {
          positions.set(id, { x: 24 + col * 214, y: 24 + row * 92, col, row });
        });
      });
      return {
        positions,
        width: Math.max(360, layers.length * 214 + 48),
        height: Math.max(190, maxRows * 92 + 40),
        broken: false,
      };
    }

    // ---------------------------------------------------------- 小部件

    function NavIcon({ size = 20, active = false }) {
      const color = active ? 'var(--dsw-alias-brand-primary)' : 'currentColor';
      const fill = active ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)' : 'none';
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          className: 'ath-nav-icon',
        },
        h('path', {
          d: 'M6 6.5 12 17.5M18 7.5 12 17.5M6 6.5 18 7.5',
          stroke: color,
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 6, cy: 6.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
        h('circle', { cx: 18, cy: 7.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
        h('circle', { cx: 12, cy: 17.5, r: 2.6, fill, stroke: color, strokeWidth: 1.6 }),
      );
    }

    function ParamsEditor({ t, value, onChange }) {
      const [rows, setRows] = useState(() => paramsToRows(value));
      const update = (next) => {
        setRows(next);
        onChange(rowsToParams(next));
      };
      return h(
        'div',
        null,
        rows.length
          ? rows.map((row, index) =>
              h(
                'div',
                { className: 'ath-param-row', key: `${index}-${row.key}` },
                h('input', {
                  className: 'ath-input ath-mono',
                  type: 'text',
                  value: row.key,
                  placeholder: t('common.paramKey'),
                  spellCheck: false,
                  onChange: (event) => {
                    const next = rows.slice();
                    next[index] = { ...row, key: event.target.value };
                    update(next);
                  },
                }),
                h('input', {
                  className: 'ath-input',
                  type: 'text',
                  value: row.value,
                  placeholder: t('common.paramValue'),
                  onChange: (event) => {
                    const next = rows.slice();
                    next[index] = { ...row, value: event.target.value };
                    update(next);
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'ath-icon-btn',
                    title: t('action.remove'),
                    'aria-label': t('action.remove'),
                    onClick: () => update(rows.filter((_, position) => position !== index)),
                  },
                  '×',
                ),
              ),
            )
          : h('div', { className: 'ath-hint' }, t('common.noParams')),
        h(
          'div',
          { style: { marginTop: 8 } },
          h(
            'button',
            {
              type: 'button',
              className: 'ath-btn ath-btn-ghost',
              onClick: () => update([...rows, { key: '', value: '' }]),
            },
            t('common.addParam'),
          ),
        ),
      );
    }

    function Modal({ t, title, children, footer, onClose, wide = false }) {
      const closeRef = useRef(onClose);
      closeRef.current = onClose;
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') closeRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      return h(
        'div',
        {
          className: 'ath-modal-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          {
            className: 'ath-modal',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            'data-wide': wide ? 'true' : 'false',
          },
          h(
            'div',
            { className: 'ath-modal-head' },
            h('h3', null, title),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: onClose, 'aria-label': t('action.close') }, '×'),
          ),
          h('div', { className: 'ath-modal-body' }, children),
          footer ? h('div', { className: 'ath-modal-foot' }, footer) : null,
        ),
      );
    }

    function ConfirmDialog({ t, dialog, onCancel, onConfirm, busy }) {
      if (!dialog) return null;
      return h(
        Modal,
        {
          t,
          title: dialog.title,
          onClose: onCancel,
          footer: [
            h('button', { key: 'cancel', type: 'button', className: 'ath-btn', onClick: onCancel }, t('action.cancel')),
            h(
              'button',
              {
                key: 'confirm',
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                disabled: busy,
                onClick: onConfirm,
              },
              busy ? t('common.loading') : dialog.confirmLabel || t('action.confirm'),
            ),
          ],
        },
        h('div', { style: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' } }, dialog.body),
      );
    }

    function Toasts({ toasts }) {
      return h(
        'div',
        { className: 'ath-toasts' },
        toasts.map((toast) =>
          h(
            'div',
            { className: 'ath-toast', 'data-kind': toast.kind || 'success', key: toast.id },
            h('i', { className: 'ath-toast-dot' }),
            h('span', null, toast.message),
          ),
        ),
      );
    }

    function EmptyState({ title, hint, action }) {
      return h(
        'div',
        { className: 'ath-empty' },
        h('strong', null, title),
        hint ? h('span', null, hint) : null,
        action || null,
      );
    }

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
      onRerun,
      onDeleteRun,
      onOpenFolder,
      onOpenLog,
    }) {
      const runs = (data.experiments || []).filter((run) => {
        if (filter === 'running') return run.status === 'running';
        if (filter === 'failed') return run.status === 'failed';
        if (filter === 'finished') return run.status !== 'running';
        return true;
      });
      const current = runDetail;

      return h(
        'div',
        { className: 'ath-page' },
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
                    ? h('div', { className: 'ath-hint', style: { padding: '14px' } }, t('common.empty'))
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
                { className: 'ath-detail' },
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
                h(
                  'div',
                  { className: 'ath-node-table' },
                  h(
                    'div',
                    { className: 'ath-node-row', 'data-head': 'true' },
                    h('span', null, t('experiments.node')),
                    h('span', null, t('common.module')),
                    h('span', null, t('common.status')),
                    h('span', null, t('common.duration')),
                    h('span', null, t('experiments.exitCode')),
                    h('span', null, ''),
                  ),
                  (current.nodes || []).map((node) =>
                    h(
                      'div',
                      { className: 'ath-node-row', key: node.path },
                      h(
                        'div',
                        { className: 'ath-node-name' },
                        h('strong', null, node.label || node.path),
                        h('code', null, node.path),
                      ),
                      h(
                        'span',
                        { className: 'ath-module-name', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        node.kind === 'graph' ? h('span', { className: 'ath-badge', 'data-kind': 'graph' }, t('experiments.subgraphNode')) : null,
                        ` ${node.moduleName}`,
                        h(
                          'span',
                          { className: 'ath-node-env' },
                          environmentName(t, data.environments, node.environmentId, node.environmentName),
                        ),
                      ),
                      h('span', { className: 'ath-status', 'data-status': statusClass(node.status) }, statusText(t, node.status)),
                      h('span', { className: 'ath-muted' }, formatDuration(node.startedAt, node.endedAt)),
                      h('span', { className: 'ath-muted ath-mono' }, node.exitCode === null || node.exitCode === undefined ? '—' : node.exitCode),
                      h(
                        'button',
                        { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => onOpenLog(current.id, node) },
                        t('experiments.log'),
                      ),
                      node.error ? h('div', { className: 'ath-node-error' }, node.error) : null,
                      node.params && Object.keys(node.params).length
                        ? h(
                            'div',
                            { className: 'ath-node-params' },
                            Object.entries(node.params).map(([key, value]) =>
                              h('span', { className: 'ath-param-chip', key }, `${key}=${value}`),
                            ),
                          )
                        : null,
                    ),
                  ),
                ),
                h('div', { className: 'ath-hint' }, t('experiments.paramsHint')),
              )
            : h(EmptyState, { title: t('experiments.select') }),
        ),
      );
    }

    // ---------------------------------------------------------- 图列表

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

    // ---------------------------------------------------------- 图编辑器

    function GraphEditor({ t, modules, environments, draft, onDraftChange, onSave, onBack, onDelete, onValidate, saving, errors, plan }) {
      const graph = draft.graph;
      const selectedId = draft.selectedNodeId;
      const selected = graph.nodes.find((node) => node.id === selectedId) || null;
      const layout = graphLayout(graph);
      const moduleById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
      const [modulePick, setModulePick] = useState(() => (modules[0] ? modules[0].id : ''));
      const [depPick, setDepPick] = useState('');

      useEffect(() => {
        if (!modules.some((module) => module.id === modulePick)) {
          setModulePick(modules[0] ? modules[0].id : '');
        }
      }, [modules, modulePick]);

      useEffect(() => {
        if (!onValidate) return undefined;
        const timer = window.setTimeout(() => {
          void onValidate(graph);
        }, 450);
        return () => window.clearTimeout(timer);
      }, [graph, onValidate]);

      const patchGraph = (patch) => onDraftChange({ ...draft, graph: { ...graph, ...patch } });
      const patchNode = (nodeId, patch) =>
        onDraftChange({
          ...draft,
          graph: { ...graph, nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)) },
        });

      const addNode = () => {
        const module = moduleById.get(modulePick);
        if (!module) return;
        const id = uniqueNodeId(graph, module.id);
        onDraftChange({
          selectedNodeId: id,
          graph: {
            ...graph,
            nodes: [...graph.nodes, { id, moduleId: module.id, label: '', params: { ...(module.params || {}) } }],
          },
        });
      };

      const removeNode = (nodeId) => {
        onDraftChange({
          selectedNodeId: '',
          graph: {
            ...graph,
            nodes: graph.nodes.filter((node) => node.id !== nodeId),
            edges: graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
          },
        });
      };

      const addDependency = () => {
        if (!selected || !depPick) return;
        if (depPick === selected.id) return;
        if (graph.edges.some((edge) => edge.from === depPick && edge.to === selected.id)) return;
        patchGraph({
          edges: [...graph.edges, { id: `edge-${Date.now().toString(36)}`, from: depPick, to: selected.id }],
        });
        setDepPick('');
      };

      const removeEdge = (edgeId) => patchGraph({ edges: graph.edges.filter((edge) => edge.id !== edgeId) });
      const depOptions = graph.nodes.filter(
        (node) => selected && node.id !== selected.id && !graph.edges.some((edge) => edge.from === node.id && edge.to === selected.id),
      );

      return h(
        'div',
        { className: 'ath-page' },
        h(
          'div',
          { className: 'ath-editor-head' },
          h('h2', { className: 'ath-editor-title' }, graph.id ? t('graphEditor.edit') : t('graphEditor.new')),
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn', onClick: onBack, disabled: saving }, t('action.back')),
            graph.id
              ? h('button', { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: onDelete, disabled: saving }, t('action.delete'))
              : null,
            h('button', { type: 'button', className: 'ath-btn ath-btn-primary', onClick: onSave, disabled: saving || modules.length === 0 }, saving ? t('graphs.saving') : t('graphs.save')),
          ),
        ),
        errors.length
          ? h(
              'div',
              { className: 'ath-card', style: { borderColor: 'var(--dsw-alias-state-error-primary)', marginBottom: 12 } },
              h('div', { className: 'ath-error', style: { fontWeight: 600, marginBottom: 4 } }, t('graphs.fixErrors')),
              errors.map((error, index) => h('div', { className: 'ath-error', key: index }, `· ${error}`)),
            )
          : null,
        h(
          'div',
          { className: 'ath-card', style: { marginBottom: 12 } },
          h(
            'div',
            { className: 'ath-grid-2' },
            h(
              'div',
              { className: 'ath-field' },
              h('label', { className: 'ath-label' }, t('graphs.name')),
              h('input', {
                className: 'ath-input',
                type: 'text',
                value: graph.name,
                maxLength: 120,
                onChange: (event) => patchGraph({ name: event.target.value }),
              }),
            ),
            h(
              'div',
              { className: 'ath-field' },
              h('label', { className: 'ath-label' }, t('graphs.desc')),
              h('input', {
                className: 'ath-input',
                type: 'text',
                value: graph.description,
                maxLength: 300,
                onChange: (event) => patchGraph({ description: event.target.value }),
              }),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ath-editor' },
          h(
            'div',
            { className: 'ath-editor-main' },
            h(
              'div',
              { className: 'ath-card', style: { padding: 10 } },
              h(
                'div',
                { className: 'ath-row' },
                h(
                  'select',
                  {
                    className: 'ath-select',
                    value: modulePick,
                    onChange: (event) => setModulePick(event.target.value),
                    style: { maxWidth: 320 },
                  },
                  modules.length === 0
                    ? h('option', { value: '' }, t('graphs.noModules'))
                    : modules.map((module) => h('option', { key: module.id, value: module.id }, `${module.name}${module.kind === 'graph' ? ` (${t('graphs.subgraph')})` : ''}`)),
                ),
                h('button', { type: 'button', className: 'ath-btn', onClick: addNode, disabled: !modulePick }, t('graphs.addNode')),
                h('span', { className: 'ath-hint', style: { marginLeft: 'auto' } }, tr(t, 'graphs.planNodes', { n: (plan && plan.nodes ? plan.nodes.length : graph.nodes.length) })),
              ),
            ),
            h(
              'div',
              { className: 'ath-canvas-wrap' },
              graph.nodes.length === 0
                ? h('div', { className: 'ath-empty', style: { border: 0 } }, h('strong', null, t('graphs.canvasEmpty')))
                : h(
                    'div',
                    { className: 'ath-canvas', style: { width: layout.width, height: layout.height } },
                    h(
                      'svg',
                      { width: layout.width, height: layout.height, 'aria-hidden': 'true' },
                      h(
                        'defs',
                        null,
                        h(
                          'marker',
                          {
                            id: 'ath-arrow',
                            viewBox: '0 0 10 10',
                            refX: 9,
                            refY: 5,
                            markerWidth: 6,
                            markerHeight: 6,
                            orient: 'auto-start-reverse',
                          },
                          h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--dsw-alias-border-l2)' }),
                        ),
                      ),
                      graph.edges.map((edge) => {
                        const from = layout.positions.get(edge.from);
                        const to = layout.positions.get(edge.to);
                        if (!from || !to) return null;
                        const x1 = from.x + 168;
                        const y1 = from.y + 34;
                        const x2 = to.x;
                        const y2 = to.y + 34;
                        const curve = Math.max(26, Math.abs(x2 - x1) / 2);
                        return h('path', {
                          key: edge.id,
                          d: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
                          fill: 'none',
                          stroke: 'var(--dsw-alias-border-l2)',
                          strokeWidth: 1.3,
                          markerEnd: 'url(#ath-arrow)',
                        });
                      }),
                    ),
                    graph.nodes.map((node) => {
                      const position = layout.positions.get(node.id) || { x: 24, y: 24 };
                      const module = moduleById.get(node.moduleId);
                      return h(
                        'button',
                        {
                          key: node.id,
                          type: 'button',
                          className: 'ath-canvas-node',
                          'data-selected': node.id === selectedId ? 'true' : 'false',
                          'data-kind': module && module.kind === 'graph' ? 'graph' : 'command',
                          style: { left: position.x, top: position.y },
                          onClick: () => onDraftChange({ ...draft, selectedNodeId: node.id }),
                        },
                        h('span', { className: 'ath-canvas-node-title' }, node.label || (module ? module.name : node.moduleId)),
                        h(
                          'span',
                          { className: 'ath-canvas-node-meta' },
                          module && module.kind === 'graph' ? h('span', { className: 'ath-node-tag' }, t('graphs.subgraph')) : null,
                          h('span', null, module ? module.name : node.moduleId),
                        ),
                      );
                    }),
                  ),
            ),
            h(
              'div',
              { className: 'ath-card' },
              h('h4', { className: 'ath-section-title' }, t('graphs.nodesTitle')),
              graph.nodes.length === 0
                ? h('div', { className: 'ath-hint' }, t('graphs.canvasEmpty'))
                : h(
                    'div',
                    { className: 'ath-dep-list' },
                    graph.nodes.map((node) => {
                      const module = moduleById.get(node.moduleId);
                      const deps = graph.edges.filter((edge) => edge.to === node.id);
                      return h(
                        'div',
                        { className: 'ath-dep-row', key: node.id },
                        h('code', null, node.id),
                        h('span', null, node.label || (module ? module.name : node.moduleId)),
                        depOptions.length || deps.length ? h('span', { className: 'ath-dep-arrow' }, '←') : null,
                        h(
                          'span',
                          { className: 'ath-hint', style: { marginLeft: 'auto' } },
                          deps.length
                            ? deps.map((edge) => graph.nodes.find((item) => item.id === edge.from)?.label || edge.from).join(', ')
                            : t('graphs.noDeps'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ath-icon-btn',
                            title: t('graphs.deleteNode'),
                            'aria-label': t('graphs.deleteNode'),
                            onClick: () => removeNode(node.id),
                          },
                          '×',
                        ),
                      );
                    }),
                  ),
            ),
          ),
          h(
            'div',
            { className: 'ath-editor-side' },
            h(
              'div',
              { className: 'ath-card ath-inspector' },
              h('h4', { className: 'ath-section-title' }, t('graphs.inspector')),
              selected
                ? h(
                    'div',
                    null,
                    h(
                      'div',
                      { className: 'ath-field' },
                      h('label', { className: 'ath-label' }, t('graphs.nodeLabel')),
                      h('input', {
                        className: 'ath-input',
                        type: 'text',
                        value: selected.label,
                        placeholder: t('graphs.nodeLabelPlaceholder'),
                        maxLength: 120,
                        onChange: (event) => patchNode(selected.id, { label: event.target.value }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'ath-field' },
                      h('label', { className: 'ath-label' }, t('graphs.nodeModule')),
                      h(
                        'select',
                        {
                          className: 'ath-select',
                          value: selected.moduleId,
                          onChange: (event) => {
                            const nextModule = moduleById.get(event.target.value);
                            patchNode(selected.id, {
                              moduleId: event.target.value,
                              params: nextModule ? { ...(nextModule.params || {}) } : {},
                            });
                          },
                        },
                        modules.map((module) => h('option', { key: module.id, value: module.id }, module.name)),
                      ),
                    ),
                    (() => {
                      const module = moduleById.get(selected.moduleId);
                      return module && module.kind === 'graph'
                        ? h(
                            'div',
                            { className: 'ath-hint', style: { marginTop: 8 } },
                            tr(t, 'graphs.subgraphTip', { name: module.name }),
                          )
                        : null;
                    })(),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 14 } },
                      h('label', { className: 'ath-label' }, t('common.params')),
                      h(ParamsEditor, {
                        key: `${selected.id}:${selected.moduleId}`,
                        t,
                        value: selected.params,
                        onChange: (params) => patchNode(selected.id, { params }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 14 } },
                      h('label', { className: 'ath-label' }, t('graphs.nodeDeps')),
                      h(
                        'div',
                        { className: 'ath-dep-list' },
                        graph.edges
                          .filter((edge) => edge.to === selected.id)
                          .map((edge) => {
                            const upstream = graph.nodes.find((node) => node.id === edge.from);
                            return h(
                              'div',
                              { className: 'ath-dep-row', key: edge.id },
                              h('span', { className: 'ath-dep-arrow' }, '←'),
                              h('span', null, upstream ? upstream.label || upstream.id : edge.from),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'ath-icon-btn',
                                  title: t('graphs.removeEdge'),
                                  'aria-label': t('graphs.removeEdge'),
                                  onClick: () => removeEdge(edge.id),
                                },
                                '×',
                              ),
                            );
                          }),
                        graph.edges.some((edge) => edge.to === selected.id)
                          ? null
                          : h('div', { className: 'ath-hint' }, t('graphs.noDeps')),
                      ),
                      h(
                        'div',
                        { className: 'ath-row', style: { marginTop: 8 } },
                        h(
                          'select',
                          {
                            className: 'ath-select',
                            value: depPick,
                            onChange: (event) => setDepPick(event.target.value),
                          },
                          h('option', { value: '' }, t('graphs.depPlaceholder')),
                          depOptions.map((node) => {
                            const module = moduleById.get(node.moduleId);
                            return h('option', { key: node.id, value: node.id }, node.label || (module ? module.name : node.id));
                          }),
                        ),
                        h('button', { type: 'button', className: 'ath-btn', onClick: addDependency, disabled: !depPick }, t('graphs.addDep')),
                      ),
                    ),
                    h(
                      'div',
                      { style: { marginTop: 14 } },
                      h(
                        'button',
                        { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: () => removeNode(selected.id) },
                        t('graphs.deleteNode'),
                      ),
                    ),
                  )
                : h('div', { className: 'ath-hint' }, t('graphs.selectNode')),
            ),
            layout.broken ? h('div', { className: 'ath-error' }, t('graphs.cycle')) : null,
            plan && plan.nodes && plan.nodes.length
              ? h(
                  'div',
                  { className: 'ath-card' },
                  h('h4', { className: 'ath-section-title' }, t('experiments.plan')),
                  h('div', { className: 'ath-hint', style: { marginBottom: 6 } }, tr(t, 'graphs.planNodes', { n: plan.nodes.length })),
                  h(
                    'div',
                    { className: 'ath-dep-list' },
                    plan.nodes.slice(0, 24).map((node) =>
                      h(
                        'div',
                        { className: 'ath-dep-row', key: node.path },
                        h('code', null, `L${node.layer}`),
                        h('span', null, node.label),
                        h(
                          'span',
                          { className: 'ath-node-env' },
                          environmentName(t, environments, node.environmentId, node.environmentName),
                        ),
                        h('span', { className: 'ath-hint', style: { marginLeft: 'auto' } }, node.deps.length ? `← ${node.deps.join(', ')}` : ''),
                      ),
                    ),
                  ),
                )
              : null,
          ),
        ),
      );
    }

    // ---------------------------------------------------------- 模块

    function ModulesView({ t, data, onNew, onEdit, onDelete }) {
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
        (data.modules || []).length === 0
          ? h(EmptyState, { title: t('modules.empty') })
          : h(
              'div',
              { className: 'ath-card-grid' },
              data.modules.map((module) =>
                h(
                  'div',
                  { className: 'ath-module-card', key: module.id },
                  h(
                    'div',
                    { className: 'ath-module-head' },
                    h('span', { className: 'ath-module-name' }, module.name),
                    h(
                      'span',
                      { className: 'ath-badge', 'data-kind': module.kind },
                      module.kind === 'graph' ? t('modules.kind.graph') : t('modules.kind.command'),
                    ),
                    h(
                      'span',
                      { className: 'ath-badge' },
                      environmentName(t, data.environments, module.environmentId, module.environmentName),
                    ),
                  ),
                  h('div', { className: 'ath-module-desc' }, module.description || ''),
                  module.kind === 'graph'
                    ? h('div', { className: 'ath-module-code' }, `${t('modules.graphRef')}: ${module.subgraphName || module.graphId}`)
                    : h('pre', { className: 'ath-module-code' }, module.command || ''),
                  h(
                    'div',
                    { className: 'ath-stat-row' },
                    module.kind === 'command' ? h('span', null, `${module.timeoutSec}s`) : null,
                    h('span', null, `${t('common.params')} ${Object.keys(module.params || {}).length}`),
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

    function ModuleEditor({ t, data, draft, setDraft, onSave, onBack, saving, errors }) {
      const module = draft.module;
      const environments = data.environments || [];
      const currentEnvironment =
        environments.find((item) => item.id === (module.environmentId || 'local')) || environments[0];
      const patch = (values) => setDraft({ ...draft, module: { ...module, ...values } });
      const isNew = !module.id || !!draft.isNew;
      return h(
        'div',
        { className: 'ath-page' },
        h(
          'div',
          { className: 'ath-editor-head' },
          h('h2', { className: 'ath-editor-title' }, module.id && !draft.isNew ? t('moduleEditor.edit') : t('moduleEditor.new')),
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn', onClick: onBack, disabled: saving }, t('action.back')),
            h(
              'button',
              { type: 'button', className: 'ath-btn ath-btn-primary', onClick: onSave, disabled: saving },
              saving ? t('modules.saving') : t('modules.save'),
            ),
          ),
        ),
        errors.length
          ? h(
              'div',
              { className: 'ath-card', style: { borderColor: 'var(--dsw-alias-state-error-primary)', marginBottom: 12 } },
              errors.map((error, index) => h('div', { className: 'ath-error', key: index }, `· ${error}`)),
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
                  ['command', 'graph'].map((kind) =>
                    h(
                      'button',
                      {
                        key: kind,
                        type: 'button',
                        className: 'ath-chip',
                        'data-active': module.kind === kind ? 'true' : 'false',
                        onClick: () => patch({ kind }),
                      },
                      kind === 'graph' ? t('modules.kind.graph') : t('modules.kind.command'),
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
                : h(
                    'div',
                    null,
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
            ),
          ),
          h(
            'div',
            { className: 'ath-editor-side' },
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

    // ---------------------------------------------------------- 主面板

    function AetherPanel({ t }) {
      const [data, setData] = useState(null);
      const [phase, setPhase] = useState('loading');
      const [loadError, setLoadError] = useState('');
      const [tab, setTab] = useState(() => {
        try {
          const stored = localStorage.getItem(TAB_KEY);
          return stored === 'graphs' || stored === 'modules' || stored === 'experiments' ? stored : 'experiments';
        } catch {
          return 'experiments';
        }
      });
      const [filter, setFilter] = useState('all');
      const [runId, setRunId] = useState('');
      const [runDetail, setRunDetail] = useState(null);
      const [submitOpen, setSubmitOpen] = useState(false);
      const [submitting, setSubmitting] = useState(false);
      const [logView, setLogView] = useState(null);
      const [graphDraft, setGraphDraft] = useState(null);
      const [graphErrors, setGraphErrors] = useState([]);
      const [graphPlan, setGraphPlan] = useState(null);
      const [graphSaving, setGraphSaving] = useState(false);
      const [moduleDraft, setModuleDraft] = useState(null);
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
        if (tab !== 'experiments' || runId || !firstRunId) return;
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
        if (!data || !(data.graphs || []).length) {
          pushToast(t('experiments.noGraphs'), 'error');
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
          setTab('experiments');
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

      const openRunFolder = async (run) => {
        try {
          await request('/experiments/open', { method: 'POST', body: { id: run.id } });
          pushToast(t('toast.opened'));
        } catch (error) {
          fail(error);
        }
      };

      const startGraph = async (graphId) => {
        setGraphErrors([]);
        setGraphPlan(null);
        if (graphId) {
          try {
            const payload = await request(`/graphs?id=${encodeURIComponent(graphId)}`);
            setGraphDraft({ graph: clone(payload.graph), selectedNodeId: '' });
            setGraphPlan(payload.plan);
          } catch (error) {
            fail(error);
          }
        } else {
          setGraphDraft({
            graph: { id: '', name: '', description: '', nodes: [], edges: [] },
            selectedNodeId: '',
          });
        }
        setTab('graphs');
      };

      const validateDraft = useCallback(
        async (graph) => {
          try {
            const payload = await request('/graphs/validate', { method: 'POST', body: { graph } });
            setGraphPlan(payload.plan || null);
          } catch {
            // 编辑期的预检失败不打扰用户，保存时会再次校验并报错。
          }
        },
        [request],
      );

      const saveGraph = async () => {
        if (!graphDraft) return;
        setGraphSaving(true);
        setGraphErrors([]);
        try {
          const check = await request('/graphs/validate', { method: 'POST', body: { graph: graphDraft.graph } });
          if (check.plan) setGraphPlan(check.plan);
          if (check.errors && check.errors.length) {
            setGraphErrors(check.errors);
            return;
          }
          await request('/graphs', { method: 'POST', body: { graph: graphDraft.graph } });
          pushToast(t('toast.saved'));
          setGraphDraft(null);
          setGraphPlan(null);
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
              if (graphDraft && graphDraft.graph.id === graph.id) {
                setGraphDraft(null);
                setGraphPlan(null);
              }
              await loadState(true);
            } catch (error) {
              fail(error);
            }
          },
        });
      };

      const startModule = (module) => {
        setModuleErrors([]);
        if (module) {
          setModuleDraft({ module: clone(module), isNew: false });
        } else {
          setModuleDraft({
            module: {
              id: '',
              name: '',
              description: '',
              kind: 'command',
              command: '',
              cwd: '',
              timeoutSec: 300,
              params: {},
              graphId: '',
            },
            isNew: true,
          });
        }
        setTab('modules');
      };

      const saveModule = async () => {
        if (!moduleDraft) return;
        setModuleSaving(true);
        setModuleErrors([]);
        try {
          await request('/modules', {
            method: 'POST',
            body: { module: moduleDraft.module, create: Boolean(moduleDraft.isNew) },
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
        if (tab === 'graphs') {
          return h(GraphsView, {
            t,
            data,
            onNew: () => void startGraph(''),
            onEdit: (id) => void startGraph(id),
            onDelete: deleteGraph,
          });
        }
        if (tab === 'modules') {
          return h(ModulesView, { t, data, onNew: () => startModule(null), onEdit: startModule, onDelete: deleteModule });
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
          onRerun: (run) => void rerun(run),
          onDeleteRun: deleteRun,
          onOpenFolder: (run) => void openRunFolder(run),
          onOpenLog: (id, node) => setLogView({ runId: id, node }),
        });
      };

      let content;
      if (graphDraft) {
        content = h(GraphEditor, {
          t,
          modules: data ? data.modules : [],
          environments: data ? data.environments : [],
          draft: graphDraft,
          onDraftChange: setGraphDraft,
          onValidate: validateDraft,
          onSave: () => void saveGraph(),
          onBack: () => {
            setGraphDraft(null);
            setGraphErrors([]);
            setGraphPlan(null);
          },
          onDelete: () => {
            if (!graphDraft.graph.id) return;
            const summary = (data.graphs || []).find((graph) => graph.id === graphDraft.graph.id) || graphDraft.graph;
            deleteGraph(summary);
          },
          saving: graphSaving,
          errors: graphErrors,
          plan: graphPlan,
        });
      } else if (moduleDraft) {
        content = h(ModuleEditor, {
          t,
          data: data || { modules: [], graphs: [], environments: [], executors: [] },
          draft: moduleDraft,
          setDraft: setModuleDraft,
          onSave: () => void saveModule(),
          onBack: () => {
            setModuleDraft(null);
            setModuleErrors([]);
          },
          saving: moduleSaving,
          errors: moduleErrors,
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
            data && data.workspace ? h('div', { className: 'ath-workspace', title: data.workspace }, h('span', null, data.workspace)) : null,
            h('button', { type: 'button', className: 'ath-btn', onClick: () => void refresh(false), disabled: phase === 'loading' }, t('action.refresh')),
            h('button', { type: 'button', className: 'ath-btn', onClick: () => void openWorkspace() }, t('action.openFolder')),
          ),
        ),
        !graphDraft && !moduleDraft
          ? h(
              'div',
              { className: 'ath-tabs' },
              ['experiments', 'graphs', 'modules'].map((key) =>
                h(
                  'button',
                  {
                    key,
                    type: 'button',
                    className: 'ath-tab',
                    'data-active': tab === key ? 'true' : 'false',
                    onClick: () => setTab(key),
                  },
                  t(`tab.${key}`),
                  data
                    ? h(
                        'span',
                        { className: 'ath-tab-count' },
                        key === 'experiments'
                          ? (data.experiments || []).length
                          : key === 'graphs'
                            ? (data.graphs || []).length
                            : (data.modules || []).length,
                      )
                    : null,
                ),
              ),
            )
          : null,
        h('div', { className: 'ath-body' }, content),
        submitOpen
          ? h(SubmitDialog, {
              t,
              graphs: data ? data.graphs : [],
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

    // ---------------------------------------------------------- 注册

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'aether: locale');
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'aether',
              order: 40,
              label: () => t('panel'),
            },
            (props) => h(NavIcon, { ...props }),
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'aether',
            },
            (props) => h(AetherPanel, { ...props, t }),
          ),
        );
      },
    };
  },
});
