// ---- client/src/00-header.js ----
window.__ModuleLoader__.load({
  id: 'aether',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'aether';
    const API = '/aether-api';
    const TAB_KEY = 'aether:active-tab-v2';
    const SIDEBAR_WIDTH_KEY = 'aether:sidebar-width';
    const PALETTE_HEIGHT_KEY = 'aether:palette-height';
    const LANGUAGE_KEY = 'aether:language';

    // 术语：UI 的「实验」= 内部 graph（DAG 定义）；UI 的「运行」= 内部 experiment（一次提交）。

// ---- client/src/10-locales.js ----
    // ---------------------------------------------------------- 文案

    const ZH = {
      panel: 'Aether',
      subtitle: '有向无环图任务执行管理器',
      'tab.runs': '运行',
      'tab.experiments': '实验',
      'tab.modules': '模块',
      workspace: '工作区',
      'workspace.title': '工作区',
      'workspace.change': '更改',
      'workspace.current': '当前目录',
      'workspace.pathLabel': '工作区目录',
      'workspace.pathHint': '所有模块、数据集、子图、实验与运行都会保存在此目录。目标目录为空时会复制当前数据；已有 state.json 时会直接切换到该工作区。',
      'workspace.apply': '切换工作区',
      'workspace.busy': '切换中…',
      'workspace.copied': '工作区已切换，并迁移了当前数据',
      'workspace.switched': '工作区已切换',
      'language.title': '插件语言',
      'language.auto': '自动',
      'language.zh': '中文',
      'language.en': 'English',
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
      'runStatus.succeeded': '完成',
      'runStatus.running': '执行中',
      'runStatus.failed': '失败',
      'runStatus.pending': '未开始',
      'runs.noNodes': '这次运行没有节点',
      'runs.outputMenu': '输出端口',
      'runs.viewOutput': '查看输出结果',
      'runs.downloadOutput': '下载输出内容',
      'runs.outputTitle': '输出结果',
      'runs.outputEmpty': '没有输出内容',
      'runs.outputHint': '点击或右键查看 / 下载输出',
      'environment.local': '本机',
      'environment.localHint': '在 dsh 宿主进程所在的机器上执行。',
      'executor.local': '本机执行器',
      'executor.remote': '远程执行器',
      'experiments.executor': '执行器',
      'experiments.environments': '执行环境',
      'graphs.planEnv': '环境',
      'experiments.title': '运行记录',
      'experiments.searchPlaceholder': '搜索运行 / 实验 / 模块 / 状态 / id',
      'experiments.emptyResult': '没有匹配的运行记录',
      'experiments.subtitle': '每次运行是一张实验 DAG 的一次提交；这里查看进度、日志与产物。',
      'experiments.new': '运行实验',
      'experiments.empty': '还没有运行记录。先在「实验」里搭一张 DAG，再运行它。',
      'experiments.select': '选择左侧的运行查看详情',
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
      'experiments.cancel': '取消运行',
      'experiments.rerun': '重跑',
      'experiments.copy': '复制',
      'experiments.copyOpened': '已复制为实验草稿，保存后创建新实验',
      'experiments.delete': '删除记录',
      'experiments.openDir': '打开运行目录',
      'experiments.name': '运行名称',
      'experiments.namePlaceholder': '留空则自动生成',
      'experiments.concurrency': '并发上限',
      'experiments.graph': '选择实验',
      'experiments.submit': '运行',
      'experiments.submitting': '正在提交…',
      'experiments.noGraphs': '还没有可运行的实验，先去「实验」里创建一个。',
      'experiments.noRunnableGraphs': '没有可单独运行的实验；子图需要在引用它的实验里运行。',
      'experiments.plan': '执行计划',
      'experiments.planSummary': '{nodes} 个节点 · {layers} 层',
      'experiments.startedAt': '开始',
      'experiments.endedAt': '结束',
      'experiments.paramsHint': '提交运行时使用的模块与参数已快照，之后修改实验不会影响这次运行。',
      'experiments.cancelHint': '取消会终止正在运行的节点，未开始的节点标记为已取消。',
      'experiments.deleteHint': '删除会移除这次运行的目录和日志，不可恢复。',
      'experiments.rerunHint': '按当前实验重新运行一次（会使用最新的模块与参数）。',
      'experiments.params': '参数',
      'experiments.subgraphNode': '子图',
      'graphs.title': '实验',
      'graphs.subtitle': '实验是一张有向无环图：添加模块使用、连接输入输出端口，保存后可以运行。',
      'graphs.empty': '还没有实验。新建一个，添加模块并用端口连线。',
      'graphs.new': '新建实验',
      'graphs.edit': '编辑',
      'graphs.delete': '删除实验',
      'graphs.name': '实验名称',
      'graphs.desc': '说明',
      'graphs.nodeCount': '{n} 个模块',
      'graphs.edgeCount': '{n} 条连线',
      'graphs.layerCount': '{n} 层',
      'graphs.addNode': '添加模块',
      'graphs.chooseModule': '选择模块',
      'graphs.noModules': '模块库还是空的，先去「模块」里创建一个。',
      'graphs.canvasEmpty': '从上方选一个模块并添加到画布。',
      'graphs.inspector': '模块设置',
      'graphs.selectNode': '在画布上点一个模块来编辑。',
      'graphs.nodeLabel': '显示名称',
      'graphs.nodeLabelPlaceholder': '默认使用模块名称',
      'graphs.nodeModule': '使用模块',
      'graphs.nodeDeps': '连线',
      'graphs.addDep': '添加连线',
      'graphs.depPlaceholder': '选择上游模块',
      'graphs.noDeps': '还没有连线。',
      'graphs.deleteNode': '删除模块',
      'graphs.edges': '连线',
      'graphs.save': '保存实验',
      'graphs.saving': '正在保存…',
      'graphs.cycle': '存在环，请调整连线',
      'graphs.cycleBlocked': '这条连线会形成环，已取消',
      'graphs.planNodes': '{n} 个可执行节点',
      'graphs.unsaved': '有未保存的修改',
      'graphs.subgraph': '子图',
      'graphs.openSubgraph': '在新标签页打开子图',
      'graphs.subgraphRunHint': '子图不能单独运行；保存会更新引用它的实验。',
      'confirm.closeTab.title': '关闭标签页？',
      'confirm.closeTab.body': '「{name}」还有未保存的修改，关闭后会丢失。',
      'graphs.subgraphTip': '这个模块会把实验「{name}」内联进来执行；模块参数会作为内层节点的默认值。',
      'graphs.fixErrors': '请先修正实验上的问题',
      'graphs.deleteHint': '删除后这个实验不会再出现在运行列表里；历史运行记录仍然保留。',
      'graphs.usedBy': '被子图模块引用',
      'graphs.nodesTitle': '模块与连线',
      'graphs.removeEdge': '删除连线',
      'canvas.tidy': '整理',
      'canvas.reset': '复位',
      'canvas.zoomIn': '放大',
      'canvas.zoomOut': '缩小',
      'canvas.zoomReset': '恢复 100%',
      'canvas.hint': '拖拽空白处平移 · 滚轮缩放 · Shift+右键框选模块与连线 · 从端口拖出连线 · 从右侧拖入模块',
      'canvas.input': '输入',
      'canvas.output': '输出',
      'canvas.inputs': '输入',
      'canvas.outputs': '输出',
      'canvas.none': '无',
      'canvas.noPorts': '无端口',
      'canvas.connectHint': '从模块右侧的输出端点拖到另一模块左侧的输入端点；反向拖也可以。',
      'canvas.edgeSelected': '已选中的连线',
      'canvas.deleteSelected': '删除选中',
      'canvas.runHint': '拖拽空白处平移 · 滚轮缩放 · 拖拽节点调整位置 · 点击节点查看日志',
      'canvas.paletteTitle': '添加模块',
      'canvas.searchPlaceholder': '搜索模块、子图、数据集',
      'canvas.filter.all': '全部',
      'canvas.filter.command': '模块',
      'canvas.filter.graph': '子图',
      'canvas.filter.dataset': '数据集',
      'canvas.emptyPalette': '没有匹配的项',
      'canvas.paletteHint': '拖拽到画布或单击添加',
      'canvas.nodeParamsHint': '继承模块默认参数，可在这里覆盖。',
      'canvas.dropHint': '放到画布上',
      'canvas.resizeSidebar': '拖动调整画布宽度',
      'canvas.resizePalette': '拖动调整添加模块区高度',
      'canvas.portSummary': '{inputs} 入 · {outputs} 出',
      'canvas.direction': '布局',
      'canvas.vertical': '上下',
      'canvas.horizontal': '左右',
      'modules.title': '模块',
      'modules.subtitle': '模块是可复用的执行单元：一段命令、另一个实验（子图），或一个数据集指针。',
      'modules.empty': '还没有模块。创建一个命令模块开始。',
      'modules.new': '新建模块',
      'modules.edit': '编辑模块',
      'modules.delete': '删除模块',
      'modules.id': '模块 id',
      'modules.idHint': '小写字母、数字和连字符；留空时按名称生成。',
      'modules.kind': '模块类型',
      'modules.kind.command': '命令',
      'modules.kind.graph': '子图',
      'modules.kind.dataset': '数据集',
      'modules.datasetUri': '数据集 URI / 路径',
      'modules.datasetUriHint': '本地路径或 URL；数据集节点执行时会把该值写给下游。',
      'modules.datasetFormat': '格式',
      'modules.datasetFormatHint': '例如 jsonl / csv / parquet（可选）',
      'modules.datasetPortsHint': '数据集只有输出端点，用于连接到下游模块的输入。',
      'modules.ports': '端口',
      'modules.inputs': '输入端口',
      'modules.outputs': '输出端口',
      'modules.addPort': '添加端口',
      'modules.portPlaceholder': '端口名',
      'modules.requiredInput': '必填',
      'modules.requiredInputHint': '勾选表示该输入端口必须连线；未勾选为可选。',
      'modules.requiredCount': '必填 {n}',
      'modules.paramsDefaultHint': '这里填写的是参数默认值；实验中的节点可以单独覆盖，画布节点会显示合并后的参数。',
      'modules.portsHint': '端口是画布上的连线端点；模块可以没有输入或输出，用空列表表示。',
      'modules.command': '命令',
      'modules.commandHint': '可选。留空时尝试执行提交的文件/目录入口；填写时通过 shell 执行，可用 {{参数名}} 插入参数。',
      'modules.cwd': '工作目录',
      'modules.cwdHint': '留空使用 DSH 进程的当前目录；支持 ~。',
      'modules.timeout': '超时（秒）',
      'modules.params': '默认参数',
      'modules.paramsHint': '节点会继承这里的默认值，可在节点上覆盖。',
      'modules.graphRef': '引用的实验',
      'modules.graphRefHint': '该实验会在使用此模块的节点处内联执行。',
      'modules.environment': '执行环境',
      'modules.environmentHint': '决定模块由哪个执行器运行。当前只有本机执行器；接入远程执行器后，由调度器按环境选择执行位置。',
      'modules.usedBy': '被使用',
      'modules.usedByCount': '{n} 张图',
      'modules.notUsed': '尚未被使用',
      'modules.envTitle': '执行时注入的环境',
      'modules.assetTitle': '模块文件 / 目录',
      'modules.assetKind.file': '文件',
      'modules.assetKind.directory': '目录',
      'modules.chooseFile': '选择文件',
      'modules.chooseDir': '选择目录',
      'modules.clearAsset': '移除',
      'modules.assetRequired': '新建命令模块必须提交一个文件或目录',
      'modules.assetOptional': '可提交一个文件或目录作为模块实现',
      'modules.assetHint': '提交的文件会复制到 Aether 工作区；命令留空时尝试执行该文件或目录中的 run.sh / main.py / index.js 等入口。',
      'modules.assetFiles': '共 {n} 个文件',
      'modules.assetUploading': '提交中…',
      'modules.assetTooLarge': '文件总大小超过 12MB，请精简后重试',
      'modules.assetUploadFailed': '文件提交失败',
      'modules.noAsset': '未提交文件',
      'modules.envHint': 'AETHER_INPUT_FILE（上游输入 JSON 文件）、AETHER_NODE_DIR（节点目录）、AETHER_PARAMS（参数 JSON）、AETHER_INPUTS（上游摘要 JSON）、AETHER_RUN_ID / AETHER_NODE_PATH。',
      'modules.noGraphs': '还没有实验可选，先创建一个实验。',
      'modules.deleteHint': '删除后模块会从模块库移除；被图引用的模块不能直接删除。',
      'modules.version': '版本',
      'modules.versionLabel': 'v{version}',
      'modules.overwriteVersion': '覆盖当前版本（不新建版本）',
      'modules.versionHint': '默认保存为新版本（当前 v{version}）；勾选后覆盖当前版本。',
      'modules.versionHistory': '历史版本：{n} 个',
      'modules.searchPlaceholder': '搜索模块、子图、数据集',
      'modules.emptyResult': '没有匹配的模块',
      'newModule.title': '新建',
      'newModule.subtitle': '选择要创建的类型',
      'newModule.commandDesc': '一段通过 shell 执行的命令，可配置输入 / 输出与参数。',
      'newModule.graphDesc': '引用另一个实验，作为子图内联执行。',
      'newModule.datasetDesc': '数据集 URI / 路径，只有输出端口。',
      'newModule.choose': '创建',
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
      'confirm.deleteGraph.title': '删除实验？',
      'confirm.deleteGraph.body': '实验「{name}」将从实验列表移除。',
      'confirm.deleteRun.title': '删除实验记录？',
      'confirm.deleteRun.body': '实验「{name}」的运行目录与日志会被删除。',
      'confirm.cancelRun.title': '取消实验？',
      'confirm.cancelRun.body': '正在运行的节点会被终止，未开始的节点标记为已取消。',
      'log.title': '节点日志',
      'log.refresh': '刷新',
      'log.close': '关闭',
      'log.copy': '复制全部',
      'graphEditor.new': '新建实验',
      'graphEditor.edit': '编辑实验',
      'graphEditor.copy': '副本',
      'graphEditor.copyHint': '这是复制的实验草稿；保存后会创建一个新实验，不会修改原实验。',
      'graphs.copySuffix': '副本',
      'moduleEditor.new': '新建模块',
      'moduleEditor.edit': '编辑模块',
    };

    const EN = {
      panel: 'Aether',
      subtitle: 'Directed-acyclic-graph task execution manager',
      'tab.runs': 'Runs',
      'tab.experiments': 'Experiments',
      'tab.modules': 'Modules',
      workspace: 'Workspace',
      'workspace.title': 'Workspace',
      'workspace.change': 'Change',
      'workspace.current': 'Current directory',
      'workspace.pathLabel': 'Workspace directory',
      'workspace.pathHint': 'Modules, datasets, subgraphs, experiments and runs are stored here. An empty target is copied from the current workspace; a target with state.json is opened as-is.',
      'workspace.apply': 'Switch workspace',
      'workspace.busy': 'Switching…',
      'workspace.copied': 'Workspace switched; current data was migrated',
      'workspace.switched': 'Workspace switched',
      'language.title': 'Plugin language',
      'language.auto': 'Auto',
      'language.zh': '中文',
      'language.en': 'English',
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
      'runStatus.succeeded': 'Completed',
      'runStatus.running': 'Running',
      'runStatus.failed': 'Failed',
      'runStatus.pending': 'Not started',
      'runs.noNodes': 'This run has no nodes',
      'runs.outputMenu': 'Output port',
      'runs.viewOutput': 'View output',
      'runs.downloadOutput': 'Download output',
      'runs.outputTitle': 'Output',
      'runs.outputEmpty': 'No output',
      'runs.outputHint': 'Click or right-click to view or download output',
      'environment.local': 'Local',
      'environment.localHint': 'Run on the machine hosting the dsh process.',
      'executor.local': 'Local executor',
      'executor.remote': 'Remote executor',
      'experiments.executor': 'Executor',
      'experiments.environments': 'Environments',
      'graphs.planEnv': 'Environment',
      'experiments.title': 'Runs',
      'experiments.searchPlaceholder': 'Search run / experiment / module / status / id',
      'experiments.emptyResult': 'No runs match',
      'experiments.subtitle': 'Each run is one submission of an experiment DAG; inspect progress, logs and artifacts here.',
      'experiments.new': 'Run experiment',
      'experiments.empty': 'No runs yet. Build a DAG under Experiments, then run it.',
      'experiments.select': 'Select a run on the left to see details',
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
      'experiments.cancel': 'Cancel run',
      'experiments.rerun': 'Run again',
      'experiments.copy': 'Copy',
      'experiments.copyOpened': 'Copied to an experiment draft; saving creates a new experiment',
      'experiments.delete': 'Delete record',
      'experiments.openDir': 'Open run folder',
      'experiments.name': 'Run name',
      'experiments.namePlaceholder': 'Leave blank to generate one',
      'experiments.concurrency': 'Concurrency limit',
      'experiments.graph': 'Experiment',
      'experiments.submit': 'Run',
      'experiments.submitting': 'Submitting…',
      'experiments.noGraphs': 'No experiments to run yet. Create one under Experiments first.',
      'experiments.noRunnableGraphs': 'No standalone experiment to run; subgraphs run through their parent experiment.',
      'experiments.plan': 'Execution plan',
      'experiments.planSummary': '{nodes} nodes · {layers} layers',
      'experiments.startedAt': 'Started',
      'experiments.endedAt': 'Ended',
      'experiments.paramsHint': 'Modules and parameters are snapshotted when the run is submitted; later experiment edits do not affect it.',
      'experiments.cancelHint': 'Cancelling stops running nodes and marks pending nodes as cancelled.',
      'experiments.deleteHint': 'Deleting removes this run folder and its logs permanently.',
      'experiments.rerunHint': 'Run the current experiment again with the latest modules and parameters.',
      'experiments.params': 'Parameters',
      'experiments.subgraphNode': 'Subgraph',
      'graphs.title': 'Experiments',
      'graphs.subtitle': 'An experiment is a DAG: add module usages, connect input and output ports, save, then run it.',
      'graphs.empty': 'No experiments yet. Create one, add modules and connect their ports.',
      'graphs.new': 'New experiment',
      'graphs.edit': 'Edit',
      'graphs.delete': 'Delete experiment',
      'graphs.name': 'Experiment name',
      'graphs.desc': 'Description',
      'graphs.nodeCount': '{n} modules',
      'graphs.edgeCount': '{n} edges',
      'graphs.layerCount': '{n} layers',
      'graphs.addNode': 'Add module',
      'graphs.chooseModule': 'Choose a module',
      'graphs.noModules': 'The module library is empty. Create a module first.',
      'graphs.canvasEmpty': 'Pick a module above and add it to the canvas.',
      'graphs.inspector': 'Module settings',
      'graphs.selectNode': 'Select a module on the canvas to edit it.',
      'graphs.nodeLabel': 'Display name',
      'graphs.nodeLabelPlaceholder': 'Defaults to the module name',
      'graphs.nodeModule': 'Module usage',
      'graphs.nodeDeps': 'Connections',
      'graphs.addDep': 'Add connection',
      'graphs.depPlaceholder': 'Choose an upstream module',
      'graphs.noDeps': 'No connections yet.',
      'graphs.deleteNode': 'Delete module',
      'graphs.edges': 'Edges',
      'graphs.save': 'Save experiment',
      'graphs.saving': 'Saving…',
      'graphs.cycle': 'The experiment contains a cycle',
      'graphs.cycleBlocked': 'That connection would create a cycle and was cancelled',
      'graphs.planNodes': '{n} executable nodes',
      'graphs.unsaved': 'Unsaved changes',
      'graphs.subgraph': 'Subgraph',
      'graphs.openSubgraph': 'Open subgraph in a new tab',
      'graphs.subgraphRunHint': 'Subgraphs cannot run on their own; saving updates the experiments that reference them.',
      'confirm.closeTab.title': 'Close this tab?',
      'confirm.closeTab.body': '“{name}” has unsaved changes that will be lost.',
      'graphs.subgraphTip': 'This module inlines experiment “{name}” when run; module parameters become defaults for the inner nodes.',
      'graphs.fixErrors': 'Fix the experiment problems first',
      'graphs.deleteHint': 'Deleting removes the experiment from the run list; past runs keep their records.',
      'graphs.usedBy': 'Referenced by subgraph module',
      'graphs.nodesTitle': 'Modules and edges',
      'graphs.removeEdge': 'Remove edge',
      'canvas.tidy': 'Tidy',
      'canvas.reset': 'Reset',
      'canvas.zoomIn': 'Zoom in',
      'canvas.zoomOut': 'Zoom out',
      'canvas.zoomReset': 'Reset to 100%',
      'canvas.hint': 'Drag the background to pan · wheel to zoom · Shift+right-drag to select modules and edges · drag from a port to connect · drag modules in from the right',
      'canvas.input': 'Input',
      'canvas.output': 'Output',
      'canvas.inputs': 'Inputs',
      'canvas.outputs': 'Outputs',
      'canvas.none': 'none',
      'canvas.noPorts': 'No ports',
      'canvas.connectHint': 'Drag from an output port on the right to an input port on the left; the reverse works too.',
      'canvas.edgeSelected': 'Selected edge',
      'canvas.deleteSelected': 'Delete selection',
      'canvas.runHint': 'Drag the background to pan · wheel to zoom · drag nodes to rearrange · click a node for logs',
      'canvas.paletteTitle': 'Add modules',
      'canvas.searchPlaceholder': 'Search modules, subgraphs, datasets',
      'canvas.filter.all': 'All',
      'canvas.filter.command': 'Modules',
      'canvas.filter.graph': 'Subgraphs',
      'canvas.filter.dataset': 'Datasets',
      'canvas.emptyPalette': 'Nothing matches',
      'canvas.paletteHint': 'Drag onto the canvas or click to add',
      'canvas.nodeParamsHint': 'Inherited from the module defaults; override them here.',
      'canvas.dropHint': 'Drop on the canvas',
      'canvas.resizeSidebar': 'Drag to resize the canvas',
      'canvas.resizePalette': 'Drag to resize the module palette',
      'canvas.portSummary': '{inputs} in · {outputs} out',
      'canvas.direction': 'Layout',
      'canvas.vertical': 'Vertical',
      'canvas.horizontal': 'Horizontal',
      'modules.title': 'Modules',
      'modules.subtitle': 'Modules are reusable execution units: a shell command, another experiment (a subgraph), or a dataset pointer.',
      'modules.empty': 'No modules yet. Create a command module to start.',
      'modules.new': 'New module',
      'modules.edit': 'Edit module',
      'modules.delete': 'Delete module',
      'modules.id': 'Module id',
      'modules.idHint': 'Lowercase letters, digits and hyphens; generated from the name when blank.',
      'modules.kind': 'Module type',
      'modules.kind.command': 'Command',
      'modules.kind.graph': 'Subgraph',
      'modules.kind.dataset': 'Dataset',
      'modules.datasetUri': 'Dataset URI / path',
      'modules.datasetUriHint': 'A local path or URL; a dataset node writes it to downstream nodes when run.',
      'modules.datasetFormat': 'Format',
      'modules.datasetFormatHint': 'e.g. jsonl / csv / parquet (optional)',
      'modules.datasetPortsHint': 'Datasets have output ports only; connect them to downstream inputs.',
      'modules.ports': 'Ports',
      'modules.inputs': 'Input ports',
      'modules.outputs': 'Output ports',
      'modules.addPort': 'Add port',
      'modules.portPlaceholder': 'Port name',
      'modules.requiredInput': 'Required',
      'modules.requiredInputHint': 'Checked inputs must be connected; unchecked inputs are optional.',
      'modules.requiredCount': '{n} required',
      'modules.paramsDefaultHint': 'These are default parameter values; nodes in experiments can override them, and canvas nodes show the merged values.',
      'modules.portsHint': 'Ports are the connection endpoints on the canvas; a module may have no inputs or no outputs.',
      'modules.command': 'Command',
      'modules.commandHint': 'Optional. Leave blank to run the submitted file/directory entrypoint; otherwise it runs through the shell with {{name}} parameter substitution.',
      'modules.cwd': 'Working directory',
      'modules.cwdHint': 'Blank uses the DSH process working directory; ~ is supported.',
      'modules.timeout': 'Timeout (seconds)',
      'modules.params': 'Default parameters',
      'modules.paramsHint': 'Nodes inherit these defaults and can override them.',
      'modules.graphRef': 'Experiment',
      'modules.graphRefHint': 'This experiment is inlined where the module is used.',
      'modules.environment': 'Execution environment',
      'modules.environmentHint': 'Chooses which executor runs the module. Only the local executor exists today; a remote executor will let a scheduler pick a location per environment.',
      'modules.usedBy': 'Used by',
      'modules.usedByCount': '{n} experiments',
      'modules.notUsed': 'Not used yet',
      'modules.envTitle': 'Injected environment',
      'modules.assetTitle': 'Module file / directory',
      'modules.assetKind.file': 'File',
      'modules.assetKind.directory': 'Directory',
      'modules.chooseFile': 'Choose file',
      'modules.chooseDir': 'Choose directory',
      'modules.clearAsset': 'Remove',
      'modules.assetRequired': 'A new command module must include a file or directory',
      'modules.assetOptional': 'Optionally include a file or directory as the module implementation',
      'modules.assetHint': 'Files are copied into the Aether workspace. If the command is blank, Aether tries run.sh / main.py / index.js and similar entrypoints.',
      'modules.assetFiles': '{n} files',
      'modules.assetUploading': 'Submitting…',
      'modules.assetTooLarge': 'Files exceed 12MB in total; trim them and retry',
      'modules.assetUploadFailed': 'Failed to submit files',
      'modules.noAsset': 'No file',
      'modules.envHint': 'AETHER_INPUT_FILE (upstream inputs JSON), AETHER_NODE_DIR (node folder), AETHER_PARAMS (params JSON), AETHER_INPUTS (upstream summary JSON), AETHER_RUN_ID / AETHER_NODE_PATH.',
      'modules.noGraphs': 'No experiments available; create one first.',
      'modules.deleteHint': 'Deleting removes the module from the library; modules used by graphs cannot be deleted.',
      'modules.version': 'Version',
      'modules.versionLabel': 'v{version}',
      'modules.overwriteVersion': 'Overwrite the current version',
      'modules.versionHint': 'Saving creates a new version by default (currently v{version}); check this to overwrite it.',
      'modules.versionHistory': 'History: {n} versions',
      'modules.searchPlaceholder': 'Search modules, subgraphs, datasets',
      'modules.emptyResult': 'No modules match',
      'newModule.title': 'New',
      'newModule.subtitle': 'Choose what to create',
      'newModule.commandDesc': 'A shell command with configurable ports and parameters.',
      'newModule.graphDesc': 'Reference another experiment and inline it as a subgraph.',
      'newModule.datasetDesc': 'A dataset URI / path with output ports only.',
      'newModule.choose': 'Create',
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
      'confirm.deleteGraph.title': 'Delete experiment?',
      'confirm.deleteGraph.body': 'Experiment “{name}” will be removed from the experiment list.',
      'confirm.deleteRun.title': 'Delete experiment record?',
      'confirm.deleteRun.body': 'The run folder and logs of “{name}” will be deleted.',
      'confirm.cancelRun.title': 'Cancel experiment?',
      'confirm.cancelRun.body': 'Running nodes are stopped and pending nodes are marked cancelled.',
      'log.title': 'Node log',
      'log.refresh': 'Refresh',
      'log.close': 'Close',
      'log.copy': 'Copy all',
      'graphEditor.new': 'New experiment',
      'graphEditor.edit': 'Edit experiment',
      'graphEditor.copy': 'Copy',
      'graphEditor.copyHint': 'This is a copied experiment draft; saving creates a new experiment and leaves the original untouched.',
      'graphs.copySuffix': 'copy',
      'moduleEditor.new': 'New module',
      'moduleEditor.edit': 'Edit module',
    };

// ---- client/src/20-styles.js ----
    // ---------------------------------------------------------- 样式

    const STYLE = `
.ath-root {
  --ath-accent: color-mix(in srgb, var(--dsw-alias-brand-primary) 72%, #94a7ba);
  --ath-accent-soft: color-mix(in srgb, var(--ath-accent) 14%, transparent);
  --ath-green: #22c55e;
  --ath-yellow: #facc15;
  --ath-red: #ef4444;
  --ath-gray: #9ca3af;
  --ath-green-40: rgba(34, 197, 94, 0.4);
  --ath-yellow-40: rgba(250, 204, 21, 0.4);
  --ath-red-40: rgba(239, 68, 68, 0.4);
  --ath-gray-40: rgba(156, 163, 175, 0.4);
  --ath-green-ink: #15803d;
  --ath-yellow-ink: #a16207;
  --ath-red-ink: #b91c1c;
  --ath-gray-ink: #4b5563;
  --ath-dataset-ink: #4338ca;
  --ath-dataset: #6c63ff;
  --ath-dataset-40: rgba(108, 99, 255, 0.4);
  --ath-edge: color-mix(in srgb, var(--dsw-alias-border-l2) 72%, transparent);
  --ath-border-soft: color-mix(in srgb, var(--dsw-alias-border-l1) 82%, transparent);
  --ath-shadow-soft: 0 6px 18px rgba(32, 43, 61, .07);
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
  background: color-mix(in srgb, var(--ath-accent) 14%, var(--dsw-alias-bg-layer-2));
  color: var(--ath-accent);
}
.ath-brand-copy { display: flex; flex-direction: column; min-width: 0; }
.ath-brand-title { font-size: 15px; font-weight: 650; letter-spacing: .01em; }
.ath-brand-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ath-top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; }
.ath-workspace {
  display: inline-flex; align-items: center; gap: 6px; max-width: 320px;
  padding: 4px 9px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.ath-workspace span { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.ath-workspace-edit {
  flex: 0 0 auto; border: 0; background: transparent; padding: 0;
  color: var(--ath-accent); font-size: 10px; cursor: pointer;
}
.ath-workspace-edit:hover { text-decoration: underline; }
.ath-lang-select {
  border: 1px solid var(--ath-border-soft); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  padding: 4px 7px; font-size: 11.5px; cursor: pointer;
}
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
.ath-tab[data-active="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--ath-accent); font-weight: 600; }
.ath-tab-count { margin-left: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.ath-editor-tabs {
  flex: 0 0 auto; display: flex; align-items: flex-end; gap: 4px;
  padding: 6px 16px 0; overflow-x: auto; border-bottom: 1px solid var(--ath-border-soft);
}
.ath-editor-tab {
  display: flex; align-items: center; min-width: 0; max-width: 260px;
  border: 1px solid transparent; border-bottom: 0; border-radius: 8px 8px 0 0;
  background: transparent;
}
.ath-editor-tab[data-active="true"] {
  background: var(--dsw-alias-bg-layer-1);
  border-color: var(--ath-border-soft);
}
.ath-editor-tab-label {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; min-width: 0;
  padding: 6px 4px 6px 10px; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ath-editor-tab[data-active="true"] .ath-editor-tab-label { color: var(--dsw-alias-label-primary); font-weight: 600; }
.ath-editor-tab-badge {
  flex: 0 0 auto; font-size: 9.5px; padding: 1px 4px; border-radius: 4px;
  background: color-mix(in srgb, var(--ath-accent) 12%, transparent); color: var(--ath-accent);
}
.ath-editor-tab-close {
  flex: 0 0 auto; width: 20px; height: 20px; margin-right: 4px;
  border: 0; border-radius: 4px; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1;
}
.ath-editor-tab-close:hover { background: color-mix(in srgb, var(--ath-red) 12%, transparent); color: var(--ath-red); }
.ath-subgraph-link { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.ath-asset-chip {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 8px; border: 1px solid color-mix(in srgb, var(--ath-accent) 28%, var(--ath-border-soft));
  border-radius: 8px; background: color-mix(in srgb, var(--ath-accent) 6%, transparent);
}
.ath-body { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.ath-page {
  flex: 1 1 auto; min-height: 0; width: 100%; max-width: none; margin: 0;
  padding: 16px 20px 20px; overflow: auto; display: flex; flex-direction: column;
}
.ath-page-runs { overflow: hidden; }
.ath-page-runs .ath-split { flex: 1 1 auto; min-height: 0; align-items: stretch; }
.ath-page-runs .ath-split > div { min-height: 0; overflow: auto; }
.ath-page-runs .ath-split > div:first-child { display: flex; flex-direction: column; overflow: hidden; }
.ath-page-runs .ath-run-list { min-height: 0; overflow: auto; flex: 1 1 auto; }
.ath-page-editor { overflow: hidden; }
.ath-page-editor .ath-editor {
  flex: 1 1 auto; min-height: 0;
  grid-template-columns: minmax(0, 1fr) 10px min(var(--ath-sidebar-width, 340px), 55%);
  gap: 10px 4px;
}
.ath-editor-resizer {
  align-self: stretch; position: relative; z-index: 2;
  cursor: col-resize; touch-action: none;
}
.ath-editor-resizer::before {
  content: ''; position: absolute; top: 6px; bottom: 6px; left: 4px; width: 2px;
  border-radius: 2px; background: var(--ath-border-soft);
}
.ath-editor-resizer:hover::before, .ath-editor-resizer:active::before { background: var(--ath-accent); }
.ath-page-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 12px; flex: 0 0 auto; }
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
.ath-btn-primary { background: var(--ath-accent); border-color: transparent; color: #fff; }
.ath-btn-primary:hover { background: var(--ath-accent); filter: brightness(1.06); }
.ath-btn-danger { color: var(--ath-red); }
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
.ath-badge[data-kind="command"] { color: var(--ath-accent); border-color: color-mix(in srgb, var(--ath-accent) 40%, transparent); }
.ath-badge[data-kind="graph"] { color: var(--ath-yellow-ink); border-color: color-mix(in srgb, var(--ath-yellow) 40%, transparent); }
.ath-badge[data-kind="dataset"] { color: var(--ath-dataset); border-color: color-mix(in srgb, var(--ath-dataset) 40%, transparent); }
.ath-status {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px; white-space: nowrap;
  padding: 1px 7px; border-radius: 999px; border: 1px solid transparent; font-weight: 500;
}
.ath-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ath-status[data-status="running"] {
  color: var(--ath-yellow-ink); background: var(--ath-yellow-40); border-color: var(--ath-yellow-40);
}
.ath-status[data-status="succeeded"] {
  color: var(--ath-green-ink); background: var(--ath-green-40); border-color: var(--ath-green-40);
}
.ath-status[data-status="failed"] {
  color: var(--ath-red-ink); background: var(--ath-red-40); border-color: var(--ath-red-40);
}
.ath-status[data-status="pending"], .ath-status[data-status="skipped"],
.ath-status[data-status="cancelled"] {
  color: var(--ath-gray-ink); background: var(--ath-gray-40); border-color: var(--ath-gray-40);
}
.ath-muted { color: var(--dsw-alias-label-secondary); }
.ath-error { color: var(--ath-red); font-size: 12px; }
.ath-card {
  border: 1px solid var(--ath-border-soft);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 13px 14px;
  box-shadow: var(--ath-shadow-soft);
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
.ath-input:focus, .ath-select:focus, .ath-textarea:focus { outline: 2px solid color-mix(in srgb, var(--ath-accent) 35%, transparent); outline-offset: -1px; border-color: var(--ath-accent); }
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
.ath-spinner { width: 16px; height: 16px; border: 2px solid color-mix(in srgb, var(--ath-accent) 25%, transparent); border-top-color: var(--ath-accent); border-radius: 50%; animation: ath-spin .8s linear infinite; }
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
.ath-run-item[data-active="true"] { background: color-mix(in srgb, var(--ath-accent) 8%, var(--dsw-alias-bg-layer-1)); box-shadow: inset 2px 0 0 var(--ath-accent); }
.ath-run-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; min-width: 0; }
.ath-run-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-run-meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.ath-progress { height: 4px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.ath-progress > i { display: block; height: 100%; background: var(--ath-accent); transition: width .3s ease; }
.ath-progress[data-status="succeeded"] > i { background: var(--ath-green); }
.ath-progress[data-status="failed"] > i { background: var(--ath-red); }
.ath-progress[data-status="cancelled"] > i { background: var(--ath-gray); }
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
.ath-node-error { grid-column: 1 / -1; color: var(--ath-red); font-size: 10.5px; overflow-wrap: anywhere; }
.ath-node-params { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.ath-param-chip { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 1px 5px; }
.ath-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ath-module-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; }
.ath-module-toolbar .ath-input { max-width: 340px; }
.ath-version-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ath-check { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dsw-alias-label-primary); cursor: pointer; }
.ath-check input { accent-color: var(--ath-accent); }
.ath-type-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ath-type-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left;
  padding: 12px; border: 1px solid var(--ath-border-soft); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); color: inherit; cursor: pointer;
}
.ath-type-card:hover { border-color: var(--ath-accent); background: var(--dsw-alias-bg-layer-2); }
.ath-type-title { font-size: 13px; }
.ath-type-action { margin-top: 6px; font-size: 11px; color: var(--ath-accent); font-weight: 600; }
.ath-module-card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; background: var(--dsw-alias-bg-layer-1); padding: 13px 14px; }
.ath-module-card:hover { border-color: var(--dsw-alias-border-l2); }
.ath-module-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ath-module-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-module-desc { font-size: 11.5px; color: var(--dsw-alias-label-secondary); min-height: 34px; overflow-wrap: anywhere; }
.ath-module-code { margin: 0; padding: 7px 9px; border-radius: 7px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-height: 56px; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.ath-module-foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 3px; }
.ath-module-foot .ath-actions { margin-left: auto; }
.ath-editor { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; align-items: stretch; }
.ath-editor-main, .ath-editor-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
.ath-page-editor .ath-editor-side { overflow: hidden; }
.ath-editor-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; flex: 0 0 auto; }
.ath-editor-errors {
  flex: 0 0 auto; max-height: 120px; overflow: auto; margin-bottom: 10px;
  padding: 9px 12px; border: 1px solid var(--ath-red);
  border-radius: 9px; background: var(--dsw-alias-bg-layer-1);
}
.ath-editor-meta { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 10px; flex: 0 0 auto; }
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
.ath-canvas-node[data-kind="dataset"] {
  border-color: color-mix(in srgb, var(--ath-dataset) 48%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--ath-dataset) 8%, var(--dsw-alias-bg-layer-1));
}
.ath-canvas-node[data-selected="true"] { border-color: var(--ath-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ath-accent) 22%, transparent); }
.ath-canvas-node[data-kind="graph"] { border-style: dashed; }
.ath-canvas-node-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-canvas-node-meta { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap; }
.ath-canvas-node-meta > span { overflow: hidden; text-overflow: ellipsis; }
.ath-node-tag { font-size: 9px; padding: 0 4px; border-radius: 3px; border: 1px solid currentColor; color: var(--ath-yellow-ink); flex: 0 0 auto; }
.ath-node-env { margin-left: 6px; font-size: 9.5px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 0 4px; white-space: nowrap; }
.ath-port-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) 24px; gap: 6px; align-items: center; margin-bottom: 6px; }
.ath-port-edit-row-required { grid-template-columns: minmax(0, 1fr) auto 24px; }
.ath-port-required {
  display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
  font-size: 10.5px; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.ath-port-required input { accent-color: var(--ath-accent); }
.ath-canvas-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 240px;
  height: auto;
  overflow: hidden;
  border: 1px solid var(--ath-border-soft);
  border-radius: 12px;
  background-color: var(--dsw-alias-bg-base);
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent) 1px, transparent 0);
  background-size: 22px 22px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.ath-canvas-viewport[data-panning="true"] { cursor: grabbing; }
.ath-canvas-viewport[data-connecting="true"] { cursor: crosshair; }
.ath-canvas-layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.ath-canvas-empty {
  position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center;
  padding: 24px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12.5px; pointer-events: none;
}
.ath-node-card {
  position: absolute; width: 200px;
  border: 1px solid var(--ath-border-soft); border-radius: 11px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 1px 2px rgba(32, 43, 61, .05);
  cursor: grab;
}
.ath-node-card:active { cursor: grabbing; }
.ath-node-card[data-kind="dataset"] {
  border-color: color-mix(in srgb, var(--ath-dataset) 50%, var(--ath-border-soft));
  background: color-mix(in srgb, var(--ath-dataset) 9%, var(--dsw-alias-bg-layer-1));
}
.ath-node-card[data-kind="dataset"]::before {
  content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px;
  border-radius: 0 3px 3px 0; background: var(--ath-dataset);
}
.ath-node-card[data-kind="dataset"] .ath-node-head { border-bottom-color: color-mix(in srgb, var(--ath-dataset) 34%, var(--ath-border-soft)); }
.ath-node-card[data-kind="dataset"] .ath-node-tag { color: var(--ath-dataset); }
.ath-node-card[data-selected="true"] {
  border-color: var(--ath-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ath-accent) 24%, transparent);
}
.ath-node-head {
  height: 38px; padding: 5px 10px;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto;
  column-gap: 5px; align-content: center;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.ath-node-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-node-tag {
  grid-column: 2; grid-row: 1; align-self: center;
  font-size: 8.5px; line-height: 1.5; color: var(--ath-yellow-ink);
  border: 1px solid currentColor; border-radius: 3px; padding: 0 3px;
}
.ath-node-sub { grid-column: 1 / -1; grid-row: 2; font-size: 9.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-node-ports { padding: 0; }
.ath-port-row { height: 22px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px; }
.ath-port-name { font-size: 9.5px; color: var(--dsw-alias-label-secondary); max-width: 78px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-port-out-name { text-align: right; margin-left: auto; }
.ath-node-noports { height: 22px; display: flex; align-items: center; padding: 0 10px; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.ath-port-dot {
  position: absolute; z-index: 2; width: 12px; height: 12px; border-radius: 50%;
  background: var(--dsw-alias-bg-base); border: 2px solid var(--dsw-alias-label-secondary);
  cursor: crosshair;
}
.ath-port-in { left: -7px; }
.ath-port-out { right: -7px; border-color: var(--ath-accent); }
.ath-port-dot:hover { transform: scale(1.3); border-color: var(--ath-accent); }
.ath-port-dot.ath-port-required {
  border-color: var(--ath-accent); border-width: 3px;
  background: color-mix(in srgb, var(--ath-accent) 24%, var(--dsw-alias-bg-base));
}
.ath-vport-name[data-required="true"], .ath-port-in-name[data-required="true"] {
  color: var(--ath-accent); font-weight: 650;
}
.ath-edges { pointer-events: none; overflow: visible; }
.ath-edge { fill: none; stroke: var(--ath-edge); stroke-width: 1.6; }
.ath-edge[data-selected="true"] { stroke: var(--ath-accent); stroke-width: 2.4; }
.ath-edge-hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.ath-edge-pending { fill: none; stroke: var(--ath-accent); stroke-width: 1.8; stroke-dasharray: 4 4; opacity: .85; }
.ath-connect-origin { position: absolute; z-index: 3; width: 8px; height: 8px; border-radius: 50%; background: var(--ath-accent); opacity: .7; pointer-events: none; }
.ath-marquee {
  position: absolute; z-index: 5; pointer-events: none;
  border: 1px dashed var(--ath-accent);
  background: color-mix(in srgb, var(--ath-accent) 12%, transparent);
}
.ath-canvas-tools {
  position: absolute; top: 10px; right: 10px; z-index: 6;
  display: flex; align-items: center; gap: 4px; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
  background: var(--dsw-alias-bg-overlay); box-shadow: 0 4px 14px rgba(15, 23, 42, .12);
}
.ath-canvas-tools .ath-btn { padding: 4px 8px; font-size: 11.5px; }
.ath-zoom-value {
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); border-radius: 6px;
  min-width: 44px; height: 24px; font-size: 10.5px; cursor: pointer;
}
.ath-tool-sep { width: 1px; height: 18px; background: var(--dsw-alias-border-l1); margin: 0 3px; }
.ath-canvas-hint {
  position: absolute; left: 12px; bottom: 10px; z-index: 4; max-width: 72%;
  padding: 4px 7px; border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 84%, transparent);
  color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5;
  pointer-events: none;
}
.ath-node-card[data-direction="vertical"] .ath-node-head {
  position: absolute; top: 15px; left: 0; right: 0; height: 38px; border-bottom: 0;
}
.ath-node-vports {
  position: absolute; top: 0; bottom: 0; left: 8px; right: 8px;
  display: flex; flex-direction: column; justify-content: space-between;
  pointer-events: none;
}
.ath-node-vports-row { display: flex; justify-content: space-around; gap: 0; height: 14px; align-items: center; }
.ath-vport-name {
  max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 9px; color: var(--dsw-alias-label-secondary);
}
.ath-vport-empty { font-size: 9px; color: var(--dsw-alias-label-secondary); opacity: .55; }
.ath-port-dot.ath-port-top, .ath-port-dot.ath-port-bottom { right: auto; }
.ath-segmented {
  display: flex; align-items: center; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
}
.ath-seg-btn {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 10.5px; padding: 4px 9px; cursor: pointer;
}
.ath-seg-btn[data-active="true"] {
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600;
}
.ath-palette {
  display: flex; flex-direction: column; gap: 7px; flex: 0 0 auto;
  min-height: 0; max-height: calc(100% - 160px);
}
.ath-palette-head { display: flex; align-items: center; gap: 6px; }
.ath-palette-list {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1 1 auto; min-height: 0; max-height: none;
  overflow: auto; padding-right: 2px;
}
.ath-palette-resizer {
  flex: 0 0 auto; position: relative; height: 10px; margin: -4px 0;
  cursor: row-resize; touch-action: none;
}
.ath-palette-resizer::before {
  content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 2px;
  border-radius: 2px; background: var(--ath-border-soft);
}
.ath-palette-resizer:hover::before, .ath-palette-resizer:active::before { background: var(--ath-accent); }
.ath-palette-item {
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: inherit; padding: 6px 8px; cursor: grab;
}
.ath-palette-item:active { cursor: grabbing; }
.ath-palette-item:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
.ath-palette-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ath-palette-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-palette-meta { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.ath-palette-desc {
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ath-inspector { flex: 1 1 auto; min-height: 0; overflow: auto; }
.ath-module-detail {
  display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px;
  padding: 8px 10px; border: 1px solid var(--ath-border-soft); border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2);
}
.ath-module-detail-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.ath-module-detail-name { font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-param-summary { display: flex; flex-wrap: wrap; gap: 4px; }
.ath-canvas-viewport[data-dragover="true"] {
  outline: 2px dashed var(--ath-accent);
  outline-offset: -4px;
  background-color: color-mix(in srgb, var(--ath-accent) 5%, var(--dsw-alias-bg-base));
}
.ath-canvas-warning {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 8;
  max-width: calc(100% - 40px); padding: 6px 10px; border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--ath-red) 40%, var(--ath-border-soft));
  background: var(--dsw-alias-bg-overlay); color: var(--ath-red);
  box-shadow: var(--ath-shadow-soft); font-size: 11px; pointer-events: none;
}
.ath-canvas-tools { flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 20px); }
.ath-page-runs .ath-split > .ath-run-detail {
  overflow: hidden; display: flex; flex-direction: column; gap: 10px;
}
.ath-run-canvas { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ath-run-viewport { flex: 1 1 auto; min-height: 260px; }
.ath-run-node {
  --ath-status: var(--ath-gray);
  --ath-status-40: var(--ath-gray-40);
  --ath-status-ink: var(--ath-gray-ink);
}
.ath-run-node[data-group="succeeded"] {
  --ath-status: var(--ath-green);
  --ath-status-40: var(--ath-green-40);
  --ath-status-ink: var(--ath-green-ink);
}
.ath-run-node[data-group="running"] {
  --ath-status: var(--ath-yellow);
  --ath-status-40: var(--ath-yellow-40);
  --ath-status-ink: var(--ath-yellow-ink);
}
.ath-run-node[data-group="failed"] {
  --ath-status: var(--ath-red);
  --ath-status-40: var(--ath-red-40);
  --ath-status-ink: var(--ath-red-ink);
}
.ath-run-node[data-group="pending"] {
  --ath-status: var(--ath-gray);
  --ath-status-40: var(--ath-gray-40);
  --ath-status-ink: var(--ath-gray-ink);
}
.ath-run-node {
  border-color: var(--ath-status-40);
  background: var(--ath-status-40);
  box-shadow: inset 0 3px 0 var(--ath-status), 0 1px 2px rgba(32, 43, 61, .05);
}
.ath-run-node[data-kind="dataset"] {
  background: var(--ath-dataset-40);
  border-color: var(--ath-dataset-40);
  box-shadow: inset 4px 0 0 var(--ath-dataset), 0 1px 2px rgba(32, 43, 61, .05);
}
.ath-run-node[data-kind="dataset"] .ath-node-sub { color: var(--ath-dataset-ink); }
.ath-run-node[data-kind="dataset"][data-selected="true"] {
  border-color: var(--ath-dataset);
  box-shadow: 0 0 0 2px var(--ath-dataset-40), inset 4px 0 0 var(--ath-dataset);
}
.ath-run-node[data-selected="true"] {
  border-color: var(--ath-status);
  box-shadow: 0 0 0 2px var(--ath-status-40), inset 0 3px 0 var(--ath-status);
}
.ath-run-node .ath-node-sub { color: var(--ath-status-ink); font-weight: 600; }
.ath-run-node .ath-node-head { border-bottom-color: var(--ath-status-40); }
.ath-run-pulse {
  width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; margin-left: auto;
  background: var(--ath-yellow);
  animation: ath-run-pulse 1.8s ease-out infinite;
}
.ath-run-port {
  width: 10px; height: 10px; border-width: 2px;
  border-color: var(--ath-status); background: var(--dsw-alias-bg-base);
  pointer-events: none;
}
.ath-run-edge { fill: none; stroke: var(--ath-edge); stroke-width: 1.5; }
.ath-run-legend {
  position: absolute; top: 10px; left: 12px; z-index: 6;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 4px 8px; border: 1px solid var(--ath-border-soft); border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 88%, transparent);
  color: var(--dsw-alias-label-secondary); font-size: 10px; pointer-events: none;
}
.ath-run-legend-item { display: inline-flex; align-items: center; gap: 4px; }
.ath-run-legend-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ath-gray); }
.ath-run-legend-dot[data-group="succeeded"] { background: var(--ath-green); }
.ath-run-legend-dot[data-group="running"] { background: var(--ath-yellow); }
.ath-run-legend-dot[data-group="failed"] { background: var(--ath-red); }
.ath-run-hint {
  position: absolute; left: 12px; bottom: 10px; z-index: 5;
  padding: 4px 7px; border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 84%, transparent);
  color: var(--dsw-alias-label-secondary); font-size: 10px; pointer-events: none;
}
.ath-run-nodebar {
  position: absolute; left: 12px; right: 12px; bottom: 10px; z-index: 7;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center;
  padding: 8px 10px; border: 1px solid var(--ath-border-soft); border-radius: 10px;
  background: var(--dsw-alias-bg-overlay); box-shadow: var(--ath-shadow-soft);
}
.ath-run-nodebar-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.ath-run-nodebar-title { font-size: 12px; }
.ath-run-nodebar-path {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px;
}
.ath-run-nodebar-meta { color: var(--dsw-alias-label-secondary); font-size: 10px; }
.ath-run-nodebar-error { grid-column: 1 / -1; color: var(--ath-red); font-size: 10px; overflow-wrap: anywhere; }
.ath-output-menu {
  position: fixed; z-index: 60; min-width: 180px; max-width: 260px;
  display: flex; flex-direction: column; gap: 2px; padding: 5px;
  border: 1px solid var(--ath-border-soft); border-radius: 9px;
  background: var(--dsw-alias-bg-overlay); box-shadow: 0 10px 28px rgba(24, 34, 48, .18);
}
.ath-output-menu-head {
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px 8px 6px; border-bottom: 1px solid var(--ath-border-soft); margin-bottom: 2px;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
}
.ath-output-menu-head code { font-size: 10px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.ath-output-menu button {
  appearance: none; border: 0; background: transparent; text-align: left; cursor: pointer;
  padding: 7px 9px; border-radius: 6px; font-size: 11.5px; color: var(--dsw-alias-label-primary);
}
.ath-output-menu button:hover { background: color-mix(in srgb, var(--ath-accent) 10%, transparent); }
.ath-run-nodebar .ath-btn { grid-column: 2; grid-row: 1; }
@keyframes ath-run-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ath-yellow) 45%, transparent); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
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
  background: rgba(35, 47, 62, .26);
  backdrop-filter: blur(2px);
}
.ath-modal {
  width: min(620px, 100%); max-height: 84vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--ath-border-soft); border-radius: 14px;
  box-shadow: 0 18px 46px rgba(32, 43, 61, .20);
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
.ath-toast[data-kind="error"] { border-color: color-mix(in srgb, var(--ath-red) 40%, var(--dsw-alias-border-l1)); color: var(--ath-red); }
.ath-toast-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto; background: var(--ath-green); }
.ath-toast[data-kind="error"] .ath-toast-dot { background: var(--ath-red); }
.ath-nav-icon { display: block; }
@keyframes ath-spin { to { transform: rotate(360deg); } }
@keyframes ath-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 980px) {
  .ath-split { grid-template-columns: minmax(0, 1fr); }
  .ath-editor { grid-template-columns: minmax(0, 1fr); }
  .ath-page-editor .ath-editor { grid-template-columns: minmax(0, 1fr); }
  .ath-editor-resizer, .ath-palette-resizer { display: none; }
  .ath-palette { height: auto !important; max-height: 46vh; }
  .ath-page-editor { overflow: auto; }
  .ath-page-editor .ath-editor { flex: 0 0 auto; }
  .ath-page-runs { overflow: auto; }
  .ath-page-runs .ath-split { flex: 0 0 auto; }
  .ath-page-runs .ath-split > div { overflow: visible; }
  .ath-page-runs .ath-run-list { overflow: visible; }
  .ath-editor-side { overflow: visible; }
  .ath-inspector { overflow: visible; }
  .ath-canvas-viewport { min-height: 55vh; }
  .ath-node-row { grid-template-columns: minmax(120px, 1.4fr) minmax(90px, 1fr) 78px 60px 52px; }
  .ath-node-row > :nth-child(5) { display: none; }
  .ath-workspace { max-width: 180px; }
}
@media (max-width: 720px) {
  .ath-canvas-hint { display: none; }
  .ath-canvas-viewport { height: auto; min-height: 60vh; }
  .ath-page { padding: 12px; }
  .ath-editor-meta { grid-template-columns: minmax(0, 1fr); }
  .ath-type-grid { grid-template-columns: minmax(0, 1fr); }
  .ath-brand-sub { display: none; }
  .ath-workspace { display: none; }
  .ath-topbar { padding: 10px 12px; }
  .ath-node-row { grid-template-columns: minmax(110px, 1.4fr) 84px 56px 52px; }
  .ath-node-row > :nth-child(2), .ath-node-row > :nth-child(4) { display: none; }
  .ath-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
    `;

// ---- client/src/30-utils.js ----
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

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          resolve(text.slice(text.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
    }

    function uniqueExperimentName(base, graphs, suffix) {
      const taken = new Set((graphs || []).map((graph) => String(graph.name || '').toLowerCase()));
      const stem = `${String(base || 'experiment').trim()} · ${suffix}`.slice(0, 110);
      if (!taken.has(stem.toLowerCase())) return stem;
      for (let index = 2; index < 1000; index += 1) {
        const candidate = `${stem} ${index}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
      }
      return `${stem} ${Date.now().toString(36)}`;
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

// ---- client/src/40-widgets.js ----
    // ---------------------------------------------------------- 小部件

    function NavIcon({ size = 20, active = false }) {
      const color = active ? 'var(--ath-accent, var(--dsw-alias-brand-primary))' : 'currentColor';
      const fill = active ? 'color-mix(in srgb, var(--ath-accent, var(--dsw-alias-brand-primary)) 16%, transparent)' : 'none';
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

    function PortsEditor({ t, label, ports, onChange, requiredPorts, requiredMode = false }) {
      const rows = Array.isArray(ports) ? ports : [];
      const required = new Set(Array.isArray(requiredPorts) ? requiredPorts : []);
      return h(
        'div',
        { className: 'ath-field' },
        h('label', { className: 'ath-label' }, label),
        rows.map((port, index) =>
          h(
            'div',
            {
              className: `ath-port-edit-row${requiredMode ? ' ath-port-edit-row-required' : ''}`,
              key: index,
            },
            h('input', {
              className: 'ath-input ath-mono',
              type: 'text',
              value: port,
              maxLength: 40,
              placeholder: t('modules.portPlaceholder'),
              onChange: (event) => {
                const next = rows.slice();
                const previous = next[index];
                next[index] = event.target.value;
                const nextRequired = new Set(required);
                if (previous !== event.target.value && required.has(previous)) {
                  nextRequired.delete(previous);
                  if (event.target.value) nextRequired.add(event.target.value);
                }
                onChange(next, [...nextRequired]);
              },
            }),
            requiredMode
              ? h(
                  'label',
                  { className: 'ath-port-required', title: t('modules.requiredInputHint') },
                  h('input', {
                    type: 'checkbox',
                    checked: required.has(port),
                    disabled: !port,
                    onChange: (event) => {
                      const nextRequired = new Set(required);
                      if (event.target.checked) nextRequired.add(port);
                      else nextRequired.delete(port);
                      onChange(rows, [...nextRequired]);
                    },
                  }),
                  h('span', null, t('modules.requiredInput')),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'ath-icon-btn',
                title: t('action.remove'),
                'aria-label': t('action.remove'),
                onClick: () => {
                  const removed = rows[index];
                  const nextRequired = new Set(required);
                  nextRequired.delete(removed);
                  onChange(
                    rows.filter((_, position) => position !== index),
                    [...nextRequired],
                  );
                },
              },
              '×',
            ),
          ),
        ),
        rows.length ? null : h('div', { className: 'ath-hint' }, t('canvas.none')),
        requiredMode && rows.length
          ? h('div', { className: 'ath-hint', style: { marginTop: 2 } }, t('modules.requiredInputHint'))
          : null,
        h(
          'button',
          {
            type: 'button',
            className: 'ath-btn ath-btn-ghost',
            onClick: () => onChange([...rows, ''], [...required]),
            style: { alignSelf: 'flex-start', marginTop: 6 },
          },
          t('modules.addPort'),
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

function WorkspaceDialog({ t, current, onClose, onSubmit, busy }) {
  const [pathValue, setPathValue] = useState(current || '');
  return h(
    Modal,
    {
      t,
      title: t('workspace.title'),
      onClose: busy ? () => {} : onClose,
      footer: [
        h('button', { key: 'cancel', type: 'button', className: 'ath-btn', onClick: onClose, disabled: busy }, t('action.cancel')),
        h(
          'button',
          {
            key: 'apply',
            type: 'button',
            className: 'ath-btn ath-btn-primary',
            disabled: busy || !pathValue.trim(),
            onClick: () => onSubmit(pathValue.trim()),
          },
          busy ? t('workspace.busy') : t('workspace.apply'),
        ),
      ],
    },
    h(
      'div',
      { className: 'ath-field' },
      h('label', { className: 'ath-label' }, t('workspace.pathLabel')),
      h('input', {
        className: 'ath-input ath-mono',
        type: 'text',
        value: pathValue,
        spellCheck: false,
        placeholder: 'D:\\workspaces\\aether',
        onChange: (event) => setPathValue(event.target.value),
      }),
      h('div', { className: 'ath-hint' }, t('workspace.pathHint')),
    ),
    h('div', { className: 'ath-hint' }, `${t('workspace.current')}: ${current || ''}`),
  );
}

// ---- client/src/50-run-views.js ----
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

// ---- client/src/55-graphs.js ----
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

// ---- client/src/60-canvas.js ----
    // ---------------------------------------------------------- 实验画布

    const NODE_WIDTH = 200;
    const NODE_HEADER = 38;
    const PORT_ROW = 22;
    const NODE_BOTTOM = 10;
    const VERTICAL_HEIGHT = 94;
    const CANVAS_ZOOM_MIN = 0.3;
    const CANVAS_ZOOM_MAX = 2.4;

    function modulePorts(module) {
      return {
        inputs: Array.isArray(module && module.inputs) ? module.inputs : [],
        outputs: Array.isArray(module && module.outputs) ? module.outputs : [],
      };
    }

    function nodeSizeFor(module, direction) {
      const ports = modulePorts(module);
      if (direction === 'vertical') {
        const columns = Math.max(1, ports.inputs.length, ports.outputs.length);
        return {
          width: Math.min(360, Math.max(NODE_WIDTH, 56 + columns * 64)),
          height: VERTICAL_HEIGHT,
        };
      }
      const rows = Math.max(1, ports.inputs.length, ports.outputs.length);
      return { width: NODE_WIDTH, height: NODE_HEADER + rows * PORT_ROW + NODE_BOTTOM + 2 };
    }

    function portTop(index) {
      return NODE_HEADER + index * PORT_ROW + PORT_ROW / 2;
    }

    function portX(index, count, width) {
      const total = Math.max(1, count);
      return ((index * 2 + 1) * width) / (2 * total);
    }

    function clampZoom(value) {
      return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value));
    }

    function layoutNodes(graph, moduleById, direction, sizes) {
      const layers = localLayers(graph);
      const columns = layers || [graph.nodes.map((node) => node.id)];
      const positions = new Map();
      const gapAcross = direction === 'vertical' ? 28 : 92;
      const gapAlong = direction === 'vertical' ? 76 : 26;

      const buildItems = (ids) =>
        ids.map((id) => {
          const node = graph.nodes.find((item) => item.id === id);
          const size = sizes.get(id) || nodeSizeFor(node ? moduleById.get(node.moduleId) : null, direction);
          return { id, size };
        });

      if (direction === 'vertical') {
        let y = 0;
        let widest = 0;
        const rows = columns.map((ids) => {
          const items = buildItems(ids);
          const width =
            items.reduce((sum, item) => sum + item.size.width, 0) + gapAcross * Math.max(0, items.length - 1);
          const height = items.reduce((max, item) => Math.max(max, item.size.height), 0);
          const row = { items, width, y };
          widest = Math.max(widest, width);
          y += height + gapAlong;
          return row;
        });
        rows.forEach((row) => {
          let x = (widest - row.width) / 2;
          row.items.forEach((item) => {
            positions.set(item.id, { x, y: row.y });
            x += item.size.width + gapAcross;
          });
        });
        return positions;
      }

      let x = 0;
      let tallest = 0;
      const cols = columns.map((ids) => {
        const items = buildItems(ids);
        const height =
          items.reduce((sum, item) => sum + item.size.height, 0) + gapAlong * Math.max(0, items.length - 1);
        const width = items.reduce((max, item) => Math.max(max, item.size.width), 0);
        const col = { items, height, x };
        tallest = Math.max(tallest, height);
        x += width + gapAcross;
        return col;
      });
      cols.forEach((col) => {
        let y = (tallest - col.height) / 2;
        col.items.forEach((item) => {
          positions.set(item.id, { x: col.x, y });
          y += item.size.height + gapAlong;
        });
      });
      return positions;
    }

    function canvasBounds(graph, positions, moduleById, direction, sizes) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of graph.nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const size = sizes.get(node.id) || nodeSizeFor(moduleById.get(node.moduleId), direction);
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
        maxX = Math.max(maxX, position.x + size.width);
        maxY = Math.max(maxY, position.y + size.height);
      }
      if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 320, height: 200 };
      return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }

    function edgeCurve(start, end, direction) {
      if (direction === 'vertical') {
        const dy = Math.max(36, Math.abs(end.y - start.y) * 0.5);
        const sign = end.y >= start.y ? 1 : -1;
        const c1 = { x: start.x, y: start.y + dy * sign };
        const c2 = { x: end.x, y: end.y - dy * sign };
        return {
          d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
          mid: {
            x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
            y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
          },
        };
      }
      const dx = Math.max(50, Math.abs(end.x - start.x) * 0.5);
      const sign = end.x >= start.x ? 1 : -1;
      const c1 = { x: start.x + dx * sign, y: start.y };
      const c2 = { x: end.x - dx * sign, y: end.y };
      return {
        d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
        mid: {
          x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
          y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
        },
      };
    }

    const RUN_STATUS_GROUP = {
      succeeded: 'succeeded',
      running: 'running',
      failed: 'failed',
      pending: 'pending',
      skipped: 'pending',
      cancelled: 'pending',
    };

    function runStatusLabel(t, status) {
      if (status === 'succeeded' || status === 'running' || status === 'failed' || status === 'pending') {
        return t(`runStatus.${status}`);
      }
      return t(`status.${status}`);
    }

    function deriveRunEdges(nodes) {
      const byPath = new Map(nodes.map((node) => [node.path, node]));
      const edges = [];
      const outCounts = new Map();
      const inCounts = new Map();
      const seen = new Set();
      for (const node of nodes) {
        for (const depPath of node.deps || []) {
          const source = byPath.get(depPath);
          if (!source) continue;
          const outputs = source.outputs || [];
          const inputs = node.inputs || [];
          const outIndex = outCounts.get(depPath) || 0;
          const inIndex = inCounts.get(node.path) || 0;
          const fromPort = outputs.length ? outputs[outIndex % outputs.length] : '';
          const toPort = inputs.length ? inputs[inIndex % inputs.length] : '';
          const key = `${depPath}>${node.path}>${fromPort}>${toPort}`;
          if (seen.has(key)) continue;
          seen.add(key);
          outCounts.set(depPath, outIndex + 1);
          inCounts.set(node.path, inIndex + 1);
          edges.push({ id: `e-${edges.length + 1}`, from: depPath, to: node.path, fromPort, toPort });
        }
      }
      return edges;
    }

    function RunDag({ t, experiment, onOpenLog, onViewOutput }) {
      const nodes = experiment.nodes || [];
      const direction = experiment.layout === 'horizontal' ? 'horizontal' : 'vertical';
      const nodeByPath = useMemo(() => new Map(nodes.map((node) => [node.path, node])), [nodes]);
      const modules = useMemo(
        () =>
          new Map(
            nodes.map((node) => [
              node.path,
              {
                name: node.moduleName,
                kind: node.kind,
                inputs: node.inputs || [],
                outputs: node.outputs || [],
                requiredInputs: node.requiredInputs || [],
              },
            ]),
          ),
        [nodes],
      );
      const edgesData = useMemo(
        () => (experiment.edges && experiment.edges.length ? experiment.edges : deriveRunEdges(nodes)),
        [experiment.edges, nodes],
      );
      const graphForLayout = useMemo(
        () => ({
          nodes: nodes.map((node) => ({ id: node.path, moduleId: node.path })),
          edges: edgesData,
        }),
        [nodes, edgesData],
      );
      const sizes = useMemo(
        () => new Map(nodes.map((node) => [node.path, nodeSizeFor(modules.get(node.path), direction)])),
        [nodes, modules, direction],
      );
      const basePositions = useMemo(
        () => layoutNodes(graphForLayout, modules, direction, sizes),
        [graphForLayout, modules, direction, sizes],
      );

      const [overrides, setOverrides] = useState({});
      const [view, setView] = useState({ x: 30, y: 24, zoom: 1 });
      const [selectedPath, setSelectedPath] = useState('');
      const [interaction, setInteraction] = useState(null);
      const [outputMenu, setOutputMenu] = useState(null);
      const canvasRef = useRef(null);

      useEffect(() => {
        setOutputMenu(null);
      }, [experiment.id]);

      useEffect(() => {
        if (!outputMenu) return undefined;
        const close = () => setOutputMenu(null);
        const onKey = (event) => {
          if (event.key === 'Escape') close();
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('pointerdown', close);
          window.removeEventListener('keydown', onKey);
        };
      }, [outputMenu]);

      const openOutputMenu = (event, node, port) => {
        if (node.kind !== 'dataset' && node.status !== 'succeeded') return;
        event.preventDefault();
        event.stopPropagation();
        setSelectedPath(node.path);
        setOutputMenu({
          path: node.path,
          port,
          x: Math.min(event.clientX, Math.max(12, window.innerWidth - 210)),
          y: Math.min(event.clientY, Math.max(12, window.innerHeight - 120)),
        });
      };

      const downloadOutput = (pathName, port) => {
        const href = `${API}/experiments/download?run=${encodeURIComponent(experiment.id)}&node=${encodeURIComponent(
          pathName,
        )}&port=${encodeURIComponent(port)}`;
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      const positions = useMemo(() => {
        const map = new Map();
        for (const node of nodes) {
          const base = basePositions.get(node.path) || { x: 0, y: 0 };
          const override = overrides[node.path];
          map.set(node.path, override ? { x: override.x, y: override.y } : { x: base.x, y: base.y });
        }
        return map;
      }, [nodes, basePositions, overrides]);

      const viewRef = useRef(view);
      viewRef.current = view;
      const positionsRef = useRef(positions);
      positionsRef.current = positions;
      const sizesRef = useRef(sizes);
      sizesRef.current = sizes;
      const modulesRef = useRef(modules);
      modulesRef.current = modules;
      const directionRef = useRef(direction);
      directionRef.current = direction;
      const nodesRef = useRef(nodes);
      nodesRef.current = nodes;
      const nodeByPathRef = useRef(nodeByPath);
      nodeByPathRef.current = nodeByPath;
      const selectedRef = useRef(selectedPath);
      selectedRef.current = selectedPath;

      const fitTo = useCallback((positionMap) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = canvasBounds(
          { nodes: nodesRef.current },
          positionMap,
          modulesRef.current,
          directionRef.current,
          sizesRef.current,
        );
        const padding = 50;
        const zoom = clampZoom(
          Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height, 1.1),
        );
        setView({
          zoom,
          x: (rect.width - bounds.width * zoom) / 2 - bounds.minX * zoom,
          y: (rect.height - bounds.height * zoom) / 2 - bounds.minY * zoom,
        });
      }, []);

      useEffect(() => {
        setOverrides({});
        setSelectedPath('');
        setInteraction(null);
        const frame = requestAnimationFrame(() => fitTo(positionsRef.current));
        return () => cancelAnimationFrame(frame);
      }, [experiment.id, fitTo]);

      const zoomBy = useCallback((factor) => {
        setView((previous) => {
          const element = canvasRef.current;
          if (!element) return previous;
          const rect = element.getBoundingClientRect();
          const px = rect.width / 2;
          const py = rect.height / 2;
          const zoom = clampZoom(previous.zoom * factor);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      const zoomTo = useCallback((targetZoom) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const px = rect.width / 2;
        const py = rect.height / 2;
        setView((previous) => {
          const zoom = clampZoom(targetZoom);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      useEffect(() => {
        const element = canvasRef.current;
        if (!element) return undefined;
        const onWheel = (event) => {
          event.preventDefault();
          const rect = element.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          setView((previous) => {
            const zoom = clampZoom(previous.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
            const worldX = (px - previous.x) / previous.zoom;
            const worldY = (py - previous.y) / previous.zoom;
            return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
          });
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
      }, []);

      useEffect(() => {
        if (!interaction) return undefined;
        const onMove = (event) => {
          if (interaction.type === 'pan') {
            setView({
              ...interaction.origin,
              x: interaction.origin.x + event.clientX - interaction.startX,
              y: interaction.origin.y + event.clientY - interaction.startY,
            });
            return;
          }
          if (interaction.type === 'node') {
            const zoom = viewRef.current.zoom;
            const x = interaction.origin.x + (event.clientX - interaction.startX) / zoom;
            const y = interaction.origin.y + (event.clientY - interaction.startY) / zoom;
            setOverrides((previous) => ({ ...previous, [interaction.path]: { x, y } }));
          }
        };
        const onUp = () => setInteraction(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
      }, [interaction]);

      const portPoint = (path, kind, portName) => {
        const node = nodeByPath.get(path);
        const module = modules.get(path);
        const position = positions.get(path);
        const size = sizes.get(path);
        if (!node || !position || !size) return null;
        const ports = kind === 'input' ? modulePorts(module).inputs : modulePorts(module).outputs;
        let index = ports.indexOf(portName);
        if (index < 0) index = 0;
        if (direction === 'vertical') {
          return {
            x: position.x + portX(index, ports.length, size.width),
            y: position.y + (kind === 'input' ? 0 : size.height),
          };
        }
        return {
          x: position.x + (kind === 'input' ? 0 : size.width),
          y: position.y + portTop(index),
        };
      };

      const edgeGeometry = useMemo(() => {
        const list = [];
        for (const edge of edgesData) {
          const fromNode = nodeByPath.get(edge.from);
          const toNode = nodeByPath.get(edge.to);
          if (!fromNode || !toNode) continue;
          const fromModule = modules.get(edge.from);
          const toModule = modules.get(edge.to);
          const fromPort = edge.fromPort || modulePorts(fromModule).outputs[0] || '';
          const toPort = edge.toPort || modulePorts(toModule).inputs[0] || '';
          const start = portPoint(edge.from, 'output', fromPort);
          const end = portPoint(edge.to, 'input', toPort);
          if (!start || !end) continue;
          list.push({ ...edge, d: edgeCurve(start, end, direction).d });
        }
        return list;
      }, [edgesData, nodeByPath, modules, positions, sizes, direction]);

      const bounds = canvasBounds({ nodes }, positions, modules, direction, sizes);
      const padding = 500;
      const svgLeft = bounds.minX - padding;
      const svgTop = bounds.minY - padding;
      const svgWidth = bounds.width + padding * 2;
      const svgHeight = bounds.height + padding * 2;
      const selectedNode = selectedPath ? nodeByPath.get(selectedPath) : null;

      return h(
        'div',
        { className: 'ath-run-canvas' },
        h(
          'div',
          {
            className: 'ath-canvas-viewport ath-run-viewport',
            ref: canvasRef,
            onPointerDown: (event) => {
              if (event.button !== 0) return;
              setSelectedPath('');
              setInteraction({
                type: 'pan',
                startX: event.clientX,
                startY: event.clientY,
                origin: { ...viewRef.current },
              });
            },
            onContextMenu: (event) => event.preventDefault(),
          },
          nodes.length
            ? h(
                'div',
                {
                  className: 'ath-canvas-layer',
                  style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` },
                },
                h(
                  'svg',
                  {
                    className: 'ath-edges',
                    width: svgWidth,
                    height: svgHeight,
                    viewBox: `${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`,
                    style: { left: svgLeft, top: svgTop, position: 'absolute' },
                    'aria-hidden': 'true',
                  },
                  h(
                    'defs',
                    null,
                    h(
                      'marker',
                      {
                        id: 'ath-run-arrow',
                        viewBox: '0 0 10 10',
                        refX: 8,
                        refY: 5,
                        markerWidth: 6,
                        markerHeight: 6,
                        orient: 'auto-start-reverse',
                      },
                      h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--ath-edge)' }),
                    ),
                  ),
                  edgeGeometry.map((edge) =>
                    h('path', {
                      key: edge.id,
                      d: edge.d,
                      className: 'ath-run-edge',
                      markerEnd: 'url(#ath-run-arrow)',
                    }),
                  ),
                ),
                nodes.map((node) => {
                  const module = modules.get(node.path);
                  const ports = modulePorts(module);
                  const position = positions.get(node.path) || { x: 0, y: 0 };
                  const size = sizes.get(node.path) || nodeSizeFor(module, direction);
                  const group = node.kind === 'dataset' ? 'dataset' : RUN_STATUS_GROUP[node.status] || 'pending';
                  const rows = Math.max(ports.inputs.length, ports.outputs.length);
                  const requiredInputs = new Set(module && Array.isArray(module.requiredInputs) ? module.requiredInputs : []);
                  const runParams = node.params || {};
                  const runParamPairs = Object.entries(runParams).map(([key, value]) => [
                    key,
                    String(value == null ? '' : value).replace(/\s+/g, ' '),
                  ]);
                  const runParamShort = runParamPairs
                    .slice(0, 1)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' · ');
                  const runParamTitle = runParamPairs.map(([key, value]) => `${key}=${value}`).join('\n');
                  return h(
                    'div',
                    {
                      key: node.path,
                      className: 'ath-node-card ath-run-node',
                      'data-selected': node.path === selectedPath ? 'true' : 'false',
                      'data-kind': node.kind || 'command',
                      'data-direction': direction,
                      'data-group': group,
                      title: runParamTitle || undefined,
                      style: { left: position.x, top: position.y, width: size.width, height: size.height },
                      onPointerDown: (event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        setSelectedPath(node.path);
                        const origin = positionsRef.current.get(node.path) || { x: 0, y: 0 };
                        setInteraction({
                          type: 'node',
                          path: node.path,
                          startX: event.clientX,
                          startY: event.clientY,
                          origin,
                        });
                      },
                    },
                    h(
                      'div',
                      { className: 'ath-node-head' },
                      h('span', { className: 'ath-node-title' }, node.label || node.path),
                      group === 'running' ? h('span', { className: 'ath-run-pulse' }) : null,
                      h(
                        'span',
                        { className: 'ath-node-sub' },
                        `${
                          node.kind === 'dataset'
                            ? t('modules.kind.dataset')
                            : runStatusLabel(t, node.status)
                        } · ${node.moduleName || node.moduleId} · ${tr(t, 'modules.versionLabel', {
                          version: node.moduleVersion || 1,
                        })}${runParamShort ? ` · ${runParamShort}` : ''}`,
                      ),
                    ),
                    direction === 'vertical'
                      ? h(
                          'div',
                          { className: 'ath-node-vports' },
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-top' },
                            ports.inputs.length
                              ? ports.inputs.map((port) =>
                                  h(
                                    'span',
                                    {
                                      key: `in-${port}`,
                                      className: 'ath-vport-name',
                                      'data-required': requiredInputs.has(port) ? 'true' : 'false',
                                      title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                                    },
                                    `${port}${requiredInputs.has(port) ? ' *' : ''}`,
                                  ),
                                )
                              : null,
                          ),
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-bottom' },
                            ports.outputs.map((port) =>
                              h(
                                'span',
                                {
                                  key: `out-${port}`,
                                  className: 'ath-vport-name',
                                  title:
                                    node.kind === 'dataset' || node.status === 'succeeded'
                                      ? t('runs.outputHint')
                                      : undefined,
                                  onClick: (event) => openOutputMenu(event, node, port),
                                  onPointerDown: (event) => event.stopPropagation(),
                                  onContextMenu: (event) => openOutputMenu(event, node, port),
                                },
                                port,
                              ),
                            ),
                          ),
                        )
                      : rows
                        ? h(
                            'div',
                            { className: 'ath-node-ports' },
                            Array.from({ length: rows }).map((_, row) =>
                              h(
                                'div',
                                { className: 'ath-port-row', key: row },
                                h(
                                  'span',
                                  {
                                    className: 'ath-port-name ath-port-in-name',
                                    'data-required': requiredInputs.has(ports.inputs[row]) ? 'true' : 'false',
                                  },
                                  `${ports.inputs[row] || ''}${requiredInputs.has(ports.inputs[row]) ? ' *' : ''}`,
                                ),
                                h(
                                  'span',
                                  {
                                    className: 'ath-port-name ath-port-out-name',
                                    title:
                                      node.kind === 'dataset' || node.status === 'succeeded'
                                        ? t('runs.outputHint')
                                        : undefined,
                                    onClick: ports.outputs[row]
                                      ? (event) => openOutputMenu(event, node, ports.outputs[row])
                                      : undefined,
                                    onPointerDown: ports.outputs[row]
                                      ? (event) => event.stopPropagation()
                                      : undefined,
                                    onContextMenu: ports.outputs[row]
                                      ? (event) => openOutputMenu(event, node, ports.outputs[row])
                                      : undefined,
                                  },
                                  ports.outputs[row] || '',
                                ),
                              ),
                            ),
                          )
                        : null,
                    ports.inputs.map((port, index) =>
                      h('div', {
                        key: `in-${port}`,
                        className: `ath-port-dot ath-run-port ath-port-in${requiredInputs.has(port) ? ' ath-port-required' : ''}${direction === 'vertical' ? ' ath-port-top' : ''}`,
                        title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.inputs.length, size.width) - 5, top: -5 }
                            : { top: portTop(index) - 5 },
                      }),
                    ),
                    ports.outputs.map((port, index) =>
                      h('div', {
                        key: `out-${port}`,
                        className: `ath-port-dot ath-run-port ath-run-port-output ath-port-out${direction === 'vertical' ? ' ath-port-bottom' : ''}`,
                        title:
                          node.kind === 'dataset' || node.status === 'succeeded'
                            ? t('runs.outputHint')
                            : undefined,
                        onClick: (event) => openOutputMenu(event, node, port),
                        onPointerDown: (event) => event.stopPropagation(),
                        onContextMenu: (event) => openOutputMenu(event, node, port),
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.outputs.length, size.width) - 5, top: size.height - 5 }
                            : { top: portTop(index) - 5 },
                      }),
                    ),
                  );
                }),
              )
            : h('div', { className: 'ath-canvas-empty' }, h('strong', null, t('runs.noNodes'))),
          h(
            'div',
            { className: 'ath-run-legend', onPointerDown: (event) => event.stopPropagation() },
            ['succeeded', 'running', 'failed', 'pending'].map((group) =>
              h(
                'span',
                { className: 'ath-run-legend-item', key: group },
                h('i', { className: 'ath-run-legend-dot', 'data-group': group }),
                runStatusLabel(t, group),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ath-canvas-tools', onPointerDown: (event) => event.stopPropagation() },
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-ghost',
                onClick: () => {
                  setOverrides({});
                  requestAnimationFrame(() => fitTo(basePositions));
                },
              },
              t('canvas.tidy'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-ghost',
                onClick: () => {
                  setOverrides({});
                  setSelectedPath('');
                  requestAnimationFrame(() => fitTo(basePositions));
                },
              },
              t('canvas.reset'),
            ),
            h('span', { className: 'ath-tool-sep' }),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1 / 1.2), title: t('canvas.zoomOut') }, '−'),
            h(
              'button',
              { type: 'button', className: 'ath-zoom-value', onClick: () => zoomTo(1), title: t('canvas.zoomReset') },
              `${Math.round(view.zoom * 100)}%`,
            ),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1.2), title: t('canvas.zoomIn') }, '+'),
          ),
          selectedNode
            ? h(
                'div',
                { className: 'ath-run-nodebar', onPointerDown: (event) => event.stopPropagation() },
                h(
                  'div',
                  { className: 'ath-run-nodebar-main' },
                  selectedNode.kind === 'dataset'
                    ? h(
                        'span',
                        { className: 'ath-badge', 'data-kind': 'dataset' },
                        t('modules.kind.dataset'),
                      )
                    : h(
                        'span',
                        { className: 'ath-status', 'data-status': selectedNode.status },
                        runStatusLabel(t, selectedNode.status),
                      ),
                  h('strong', { className: 'ath-run-nodebar-title' }, selectedNode.label || selectedNode.path),
                  h('code', { className: 'ath-run-nodebar-path' }, selectedNode.path),
                  h(
                    'span',
                    { className: 'ath-run-nodebar-meta' },
                    tr(t, 'modules.versionLabel', { version: selectedNode.moduleVersion || 1 }),
                  ),
                  selectedNode.kind === 'dataset'
                    ? null
                    : h('span', { className: 'ath-run-nodebar-meta' }, formatDuration(selectedNode.startedAt, selectedNode.endedAt)),
                  selectedNode.kind !== 'dataset' &&
                  selectedNode.exitCode !== null &&
                  selectedNode.exitCode !== undefined
                    ? h('span', { className: 'ath-run-nodebar-meta' }, `${t('experiments.exitCode')} ${selectedNode.exitCode}`)
                    : null,
                ),
                selectedNode.error ? h('div', { className: 'ath-run-nodebar-error' }, selectedNode.error) : null,
                h(
                  'button',
                  { type: 'button', className: 'ath-btn', onClick: () => onOpenLog(experiment.id, selectedNode) },
                  t('experiments.log'),
                ),
              )
            : h('div', { className: 'ath-run-hint' }, t('canvas.runHint')),
          outputMenu
            ? h(
                'div',
                {
                  className: 'ath-output-menu',
                  style: { left: outputMenu.x, top: outputMenu.y },
                  onPointerDown: (event) => event.stopPropagation(),
                  onContextMenu: (event) => event.preventDefault(),
                },
                h(
                  'div',
                  { className: 'ath-output-menu-head' },
                  h('span', null, t('runs.outputMenu')),
                  h('code', null, `${outputMenu.path} · ${outputMenu.port}`),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      const node = nodeByPath.get(outputMenu.path);
                      const port = outputMenu.port;
                      setOutputMenu(null);
                      if (node) onViewOutput(experiment.id, node, port);
                    },
                  },
                  t('runs.viewOutput'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      downloadOutput(outputMenu.path, outputMenu.port);
                      setOutputMenu(null);
                    },
                  },
                  t('runs.downloadOutput'),
                ),
              )
            : null,
        ),
      );
    }

// ---- client/src/70-experiment-editor.js ----
    function ExperimentEditor({
      t,
      modules,
      environments,
      draft,
      onDraftChange,
      onSave,
      onBack,
      onOpenSubgraph,
      onDelete,
      saving,
      errors,
      subgraph,
    }) {
      const graph = draft.graph;
      const direction = graph.layout === 'horizontal' ? 'horizontal' : 'vertical';
      const moduleById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
      const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
      const sizes = useMemo(
        () =>
          new Map(
            graph.nodes.map((node) => [node.id, nodeSizeFor(moduleById.get(node.moduleId), direction)]),
          ),
        [graph.nodes, moduleById, direction],
      );
      const layoutPositions = useMemo(
        () => layoutNodes(graph, moduleById, direction, sizes),
        [graph, moduleById, direction, sizes],
      );
      const positions = useMemo(() => {
        const map = new Map();
        for (const node of graph.nodes) {
          const fallback = layoutPositions.get(node.id) || { x: 0, y: 0 };
          map.set(
            node.id,
            Number.isFinite(node.x) && Number.isFinite(node.y) ? { x: node.x, y: node.y } : { x: fallback.x, y: fallback.y },
          );
        }
        return map;
      }, [graph, layoutPositions]);

      const [view, setView] = useState({ x: 30, y: 24, zoom: 1 });
      const [selection, setSelection] = useState({ nodes: [], edges: [] });
      const [interaction, setInteraction] = useState(null);
      const [marquee, setMarquee] = useState(null);
      const [connecting, setConnecting] = useState(null);
      const [paletteQuery, setPaletteQuery] = useState('');
      const [paletteFilter, setPaletteFilter] = useState('all');
      const [dragOver, setDragOver] = useState(false);
      const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
          const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
          if (Number.isFinite(value) && value >= 260 && value <= 640) return value;
        } catch {
          // localStorage 不可用时使用默认值。
        }
        return 340;
      });
      const [paletteHeight, setPaletteHeight] = useState(() => {
        try {
          const value = Number(localStorage.getItem(PALETTE_HEIGHT_KEY));
          if (Number.isFinite(value) && value >= 140) return value;
        } catch {
          // 同上。
        }
        return 280;
      });
      const [cycleNotice, setCycleNotice] = useState('');
      const cycleTimer = useRef(null);

      const canvasRef = useRef(null);
      const inspectorRef = useRef(null);
      const editorRef = useRef(null);
      const sideRef = useRef(null);
      const draggingRef = useRef(false);
      const viewRef = useRef(view);
      viewRef.current = view;
      const graphRef = useRef(graph);
      graphRef.current = graph;
      const positionsRef = useRef(positions);
      positionsRef.current = positions;
      const sizesRef = useRef(sizes);
      sizesRef.current = sizes;
      const directionRef = useRef(direction);
      directionRef.current = direction;
      const moduleByIdRef = useRef(moduleById);
      moduleByIdRef.current = moduleById;
      const selectionRef = useRef(selection);
      selectionRef.current = selection;
      const draftRef = useRef(draft);
      draftRef.current = draft;

      const paletteItems = useMemo(() => {
        const query = paletteQuery.trim().toLowerCase();
        return modules
          .filter((module) => paletteFilter === 'all' || module.kind === paletteFilter)
          .filter((module) => {
            if (!query) return true;
            const ports = modulePorts(module);
            const haystack = [
              module.name,
              module.id,
              module.description,
              module.kind,
              t(`modules.kind.${module.kind}`),
              module.datasetUri || '',
              module.subgraphName || '',
              module.graphId || '',
              ...ports.inputs,
              ...ports.outputs,
            ]
              .join(' ')
              .toLowerCase();
            return haystack.includes(query);
          });
      }, [modules, paletteQuery, paletteFilter, t]);

      const portPoint = (nodeId, kind, portName) => {
        const node = nodeById.get(nodeId);
        const module = node ? moduleById.get(node.moduleId) : null;
        const position = positions.get(nodeId);
        const size = sizes.get(nodeId);
        if (!node || !position || !size) return null;
        const ports = kind === 'input' ? modulePorts(module).inputs : modulePorts(module).outputs;
        let index = ports.indexOf(portName);
        if (index < 0) index = 0;
        if (direction === 'vertical') {
          return {
            x: position.x + portX(index, ports.length, size.width),
            y: position.y + (kind === 'input' ? 0 : size.height),
          };
        }
        return {
          x: position.x + (kind === 'input' ? 0 : size.width),
          y: position.y + portTop(index),
        };
      };

      const edgeGeometry = useMemo(() => {
        const list = [];
        for (const edge of graph.edges) {
          const fromNode = nodeById.get(edge.from);
          const toNode = nodeById.get(edge.to);
          if (!fromNode || !toNode) continue;
          const fromModule = moduleById.get(fromNode.moduleId);
          const toModule = moduleById.get(toNode.moduleId);
          const fromPort = edge.fromPort || modulePorts(fromModule).outputs[0] || '';
          const toPort = edge.toPort || modulePorts(toModule).inputs[0] || '';
          const start = portPoint(edge.from, 'output', fromPort);
          const end = portPoint(edge.to, 'input', toPort);
          if (!start || !end) continue;
          const curve = edgeCurve(start, end, direction);
          list.push({ ...edge, start, end, d: curve.d, mid: curve.mid });
        }
        return list;
      }, [graph.edges, nodeById, moduleById, positions, sizes, direction]);

      const fitTo = useCallback((positionMap, sizeMap, dir, maxZoom = 1.15) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = canvasBounds(graphRef.current, positionMap, moduleByIdRef.current, dir, sizeMap);
        const padding = 54;
        const zoom = clampZoom(
          Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height, maxZoom),
        );
        setView({
          zoom,
          x: (rect.width - bounds.width * zoom) / 2 - bounds.minX * zoom,
          y: (rect.height - bounds.height * zoom) / 2 - bounds.minY * zoom,
        });
      }, []);

      useEffect(() => {
        setSelection({ nodes: [], edges: [] });
        setInteraction(null);
        setMarquee(null);
        setConnecting(null);
        const frame = requestAnimationFrame(() =>
          fitTo(positionsRef.current, sizesRef.current, directionRef.current),
        );
        return () => cancelAnimationFrame(frame);
      }, [draft.graph.id, fitTo]);

      useEffect(() => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
        } catch {
          // 记住分栏宽度是尽力而为。
        }
      }, [sidebarWidth]);

      useEffect(() => {
        try {
          localStorage.setItem(PALETTE_HEIGHT_KEY, String(Math.round(paletteHeight)));
        } catch {
          // 记住右侧栏高度占比是尽力而为。
        }
      }, [paletteHeight]);

      useEffect(
        () => () => {
          if (cycleTimer.current) window.clearTimeout(cycleTimer.current);
        },
        [],
      );

      const zoomTo = useCallback((targetZoom) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const px = rect.width / 2;
        const py = rect.height / 2;
        setView((previous) => {
          const zoom = clampZoom(targetZoom);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      const zoomBy = useCallback((factor) => {
        setView((previous) => {
          const element = canvasRef.current;
          if (!element) return previous;
          const rect = element.getBoundingClientRect();
          const px = rect.width / 2;
          const py = rect.height / 2;
          const zoom = clampZoom(previous.zoom * factor);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      const applyLayout = useCallback(
        (fit, clearSelection) => {
          const nextDirection = directionRef.current;
          const nextSizes = sizesRef.current;
          const layout = layoutNodes(graphRef.current, moduleByIdRef.current, nextDirection, nextSizes);
          const current = draftRef.current;
          onDraftChange({
            ...current,
            graph: {
              ...current.graph,
              nodes: current.graph.nodes.map((node) => {
                const position = layout.get(node.id);
                return position ? { ...node, x: position.x, y: position.y } : node;
              }),
            },
          });
          if (clearSelection) setSelection({ nodes: [], edges: [] });
          if (fit) requestAnimationFrame(() => fitTo(layout, nextSizes, nextDirection));
        },
        [fitTo, onDraftChange],
      );

      const setDirection = (nextDirection) => {
        if (nextDirection === direction) return;
        const current = draftRef.current;
        const nextSizes = new Map(
          current.graph.nodes.map((node) => [
            node.id,
            nodeSizeFor(moduleByIdRef.current.get(node.moduleId), nextDirection),
          ]),
        );
        const nextGraph = { ...current.graph, layout: nextDirection };
        const layout = layoutNodes(nextGraph, moduleByIdRef.current, nextDirection, nextSizes);
        onDraftChange({
          ...current,
          graph: {
            ...nextGraph,
            nodes: current.graph.nodes.map((node) => {
              const position = layout.get(node.id);
              return position ? { ...node, x: position.x, y: position.y } : node;
            }),
          },
        });
        setSelection({ nodes: [], edges: [] });
        requestAnimationFrame(() => fitTo(layout, nextSizes, nextDirection));
      };

      const deleteSelection = useCallback(() => {
        const current = draftRef.current;
        const selected = selectionRef.current;
        if (!selected.nodes.length && !selected.edges.length) return;
        const nodeIds = new Set(selected.nodes);
        const edgeIds = new Set(selected.edges);
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: current.graph.nodes.filter((node) => !nodeIds.has(node.id)),
            edges: current.graph.edges.filter(
              (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.from) && !nodeIds.has(edge.to),
            ),
          },
        });
        setSelection({ nodes: [], edges: [] });
      }, [onDraftChange]);

      useEffect(() => {
        const onKey = (event) => {
          const target = event.target;
          const tag = target && target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
          if (event.key === 'Escape') {
            setSelection({ nodes: [], edges: [] });
            setInteraction(null);
            setConnecting(null);
            setMarquee(null);
            return;
          }
          if ((event.key === 'Delete' || event.key === 'Backspace') && (selectionRef.current.nodes.length || selectionRef.current.edges.length)) {
            event.preventDefault();
            deleteSelection();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [deleteSelection]);

      useEffect(() => {
        const element = canvasRef.current;
        if (!element) return undefined;
        const onWheel = (event) => {
          event.preventDefault();
          const rect = element.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          setView((previous) => {
            const zoom = clampZoom(previous.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
            const worldX = (px - previous.x) / previous.zoom;
            const worldY = (py - previous.y) / previous.zoom;
            return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
          });
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
      }, []);

      const notifyCycle = () => {
        setCycleNotice(t('graphs.cycleBlocked'));
        if (cycleTimer.current) window.clearTimeout(cycleTimer.current);
        cycleTimer.current = window.setTimeout(() => setCycleNotice(''), 3400);
      };

      const addEdge = (fromId, fromPort, toId, toPort) => {
        const current = draftRef.current;
        if (!fromPort || !toPort) return;
        if (current.graph.edges.some((edge) => edge.from === fromId && edge.to === toId && edge.fromPort === fromPort && edge.toPort === toPort)) {
          return;
        }
        const candidate = {
          ...current.graph,
          edges: [
            ...current.graph.edges,
            { id: '__cycle-check__', from: fromId, to: toId, fromPort, toPort },
          ],
        };
        if (!localLayers(candidate)) {
          notifyCycle();
          return;
        }
        const edgeId = `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        setCycleNotice('');
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            edges: [...current.graph.edges, { id: edgeId, from: fromId, to: toId, fromPort, toPort }],
          },
        });
        setSelection({ nodes: [], edges: [edgeId] });
      };

      useEffect(() => {
        if (!interaction) return undefined;
        const onMove = (event) => {
          if (interaction.type === 'resize-sidebar') {
            const element = editorRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const maximum = Math.max(280, Math.min(640, rect.width * 0.55, rect.width - 360));
            setSidebarWidth(Math.min(maximum, Math.max(260, rect.right - event.clientX)));
            return;
          }
          if (interaction.type === 'resize-palette') {
            const element = sideRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const maximum = Math.max(160, rect.height - 200);
            setPaletteHeight(Math.min(maximum, Math.max(140, event.clientY - rect.top)));
            return;
          }
          if (interaction.type === 'pan') {
            setView({
              ...interaction.origin,
              x: interaction.origin.x + event.clientX - interaction.startX,
              y: interaction.origin.y + event.clientY - interaction.startY,
            });
            return;
          }
          if (interaction.type === 'node') {
            const zoom = viewRef.current.zoom;
            const dx = (event.clientX - interaction.startX) / zoom;
            const dy = (event.clientY - interaction.startY) / zoom;
            const current = draftRef.current;
            const origins = new Map(interaction.origins.map((item) => [item.id, item]));
            onDraftChange({
              ...current,
              graph: {
                ...current.graph,
                nodes: current.graph.nodes.map((node) =>
                  origins.has(node.id)
                    ? { ...node, x: origins.get(node.id).x + dx, y: origins.get(node.id).y + dy }
                    : node,
                ),
              },
            });
            return;
          }
          if (interaction.type === 'marquee') {
            const rect = interaction.rect;
            setMarquee({
              x1: interaction.startX,
              y1: interaction.startY,
              x2: event.clientX - rect.left,
              y2: event.clientY - rect.top,
            });
            return;
          }
          if (interaction.type === 'connect') {
            const element = canvasRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const zoom = viewRef.current.zoom;
            setConnecting((current) =>
              current
                ? {
                    ...current,
                    current: {
                      x: (event.clientX - rect.left - viewRef.current.x) / zoom,
                      y: (event.clientY - rect.top - viewRef.current.y) / zoom,
                    },
                  }
                : current,
            );
          }
        };

        const onUp = (event) => {
          if (interaction.type === 'marquee') {
            const rect = interaction.rect;
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const screen = {
              x1: Math.min(interaction.startX, localX),
              y1: Math.min(interaction.startY, localY),
              x2: Math.max(interaction.startX, localX),
              y2: Math.max(interaction.startY, localY),
            };
            const zoom = viewRef.current.zoom;
            const world = {
              x1: (screen.x1 - viewRef.current.x) / zoom,
              y1: (screen.y1 - viewRef.current.y) / zoom,
              x2: (screen.x2 - viewRef.current.x) / zoom,
              y2: (screen.y2 - viewRef.current.y) / zoom,
            };
            const nodes = [];
            for (const node of graphRef.current.nodes) {
              const position = positionsRef.current.get(node.id);
              const size = sizesRef.current.get(node.id);
              if (!position || !size) continue;
              if (
                position.x < world.x2 &&
                position.x + size.width > world.x1 &&
                position.y < world.y2 &&
                position.y + size.height > world.y1
              ) {
                nodes.push(node.id);
              }
            }
            const edges = [];
            for (const edge of graphRef.current.edges) {
              const fromNode = graphRef.current.nodes.find((node) => node.id === edge.from);
              const toNode = graphRef.current.nodes.find((node) => node.id === edge.to);
              if (!fromNode || !toNode) continue;
              const fromPort = edge.fromPort || modulePorts(moduleByIdRef.current.get(fromNode.moduleId)).outputs[0] || '';
              const toPort = edge.toPort || modulePorts(moduleByIdRef.current.get(toNode.moduleId)).inputs[0] || '';
              const start = portPoint(edge.from, 'output', fromPort);
              const end = portPoint(edge.to, 'input', toPort);
              if (!start || !end) continue;
              const mid = edgeCurve(start, end, directionRef.current).mid;
              if (mid.x >= world.x1 && mid.x <= world.x2 && mid.y >= world.y1 && mid.y <= world.y2) edges.push(edge.id);
            }
            setSelection({ nodes, edges });
            setMarquee(null);
            setInteraction(null);
            return;
          }
          if (interaction.type === 'connect') {
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const portElement = target && target.closest ? target.closest('[data-port-node]') : null;
            if (portElement) {
              const nodeId = portElement.getAttribute('data-port-node');
              const portName = portElement.getAttribute('data-port-name');
              const portKind = portElement.getAttribute('data-port-kind');
              const from = interaction.from;
              if (portKind !== from.kind && nodeId !== from.nodeId) {
                const outputSide = from.kind === 'output' ? from : { nodeId, port: portName };
                const inputSide = from.kind === 'input' ? from : { nodeId, port: portName };
                addEdge(outputSide.nodeId, outputSide.port, inputSide.nodeId, inputSide.port);
              }
            }
            setConnecting(null);
            setInteraction(null);
            return;
          }
          setInteraction(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
      }, [interaction, onDraftChange]);

      const addModule = (module, anchor) => {
        if (!module) return;
        const current = draftRef.current;
        const id = uniqueNodeId(current.graph, module.id);
        const size = nodeSizeFor(module, directionRef.current);
        const element = canvasRef.current;
        const rect = element ? element.getBoundingClientRect() : null;
        const zoom = viewRef.current.zoom;
        const centerX = anchor ? anchor.x : rect ? (rect.width / 2 - viewRef.current.x) / zoom : 120;
        const centerY = anchor ? anchor.y : rect ? (rect.height / 2 - viewRef.current.y) / zoom : 80;
        const offset = anchor ? 0 : (current.graph.nodes.length % 4) * 18;
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: [
              ...current.graph.nodes,
              {
                id,
                moduleId: module.id,
                label: '',
                params: { ...(module.params || {}) },
                x: centerX - size.width / 2 + offset,
                y: centerY - size.height / 2 + offset,
              },
            ],
          },
        });
        setSelection({ nodes: [id], edges: [] });
      };

      const onCanvasDrop = (event) => {
        event.preventDefault();
        setDragOver(false);
        const moduleId =
          event.dataTransfer.getData('text/aether-module') || event.dataTransfer.getData('text/plain');
        const module = moduleByIdRef.current.get(moduleId);
        if (!module) return;
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const zoom = viewRef.current.zoom;
        addModule(module, {
          x: (event.clientX - rect.left - viewRef.current.x) / zoom,
          y: (event.clientY - rect.top - viewRef.current.y) / zoom,
        });
      };

      const startSidebarResize = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setInteraction({ type: 'resize-sidebar' });
      };

      const startPaletteResize = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setInteraction({ type: 'resize-palette' });
      };

      const onViewportPointerDown = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.button === 2) {
          if (!event.shiftKey) return;
          event.preventDefault();
          setSelection({ nodes: [], edges: [] });
          setMarquee({ x1: event.clientX - rect.left, y1: event.clientY - rect.top, x2: event.clientX - rect.left, y2: event.clientY - rect.top });
          setInteraction({
            type: 'marquee',
            startX: event.clientX - rect.left,
            startY: event.clientY - rect.top,
            rect,
          });
          return;
        }
        if (event.button !== 0 && event.button !== 1) return;
        if (event.button === 0) setSelection({ nodes: [], edges: [] });
        setInteraction({
          type: 'pan',
          startX: event.clientX,
          startY: event.clientY,
          origin: { ...viewRef.current },
        });
      };

      const onNodePointerDown = (event, node) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey;
        let dragIds = [];
        if (additive) {
          dragIds = selectionRef.current.nodes.includes(node.id)
            ? selectionRef.current.nodes.filter((id) => id !== node.id)
            : [...selectionRef.current.nodes, node.id];
          setSelection({ nodes: dragIds, edges: [] });
        } else if (selectionRef.current.nodes.includes(node.id) && selectionRef.current.nodes.length > 0) {
          dragIds = selectionRef.current.nodes;
        } else {
          dragIds = [node.id];
          setSelection({ nodes: dragIds, edges: [] });
        }
        if (!dragIds.length) return;
        const origins = dragIds.map((id) => ({ id, ...(positionsRef.current.get(id) || { x: 0, y: 0 }) }));
        setInteraction({ type: 'node', startX: event.clientX, startY: event.clientY, origins });
      };

      const onPortPointerDown = (event, nodeId, kind, portName) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        const start = portPoint(nodeId, kind, portName);
        if (!start) return;
        setConnecting({ from: { nodeId, port: portName, kind }, start, current: start });
        setInteraction({ type: 'connect', from: { nodeId, port: portName, kind } });
      };

      const onEdgePointerDown = (event, edgeId) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey;
        setSelection((previous) =>
          additive
            ? {
                nodes: previous.nodes,
                edges: previous.edges.includes(edgeId)
                  ? previous.edges.filter((id) => id !== edgeId)
                  : [...previous.edges, edgeId],
              }
            : { nodes: [], edges: [edgeId] },
        );
      };

      const changeNodeModule = (nodeId, moduleId) => {
        const module = moduleById.get(moduleId);
        if (!module) return;
        const current = draftRef.current;
        const outputs = modulePorts(module).outputs;
        const inputs = modulePorts(module).inputs;
        const nodes = current.graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, moduleId, params: { ...(module.params || {}) } } : node,
        );
        const edges = current.graph.edges.filter((edge) => {
          if (edge.from === nodeId && edge.fromPort && !outputs.includes(edge.fromPort)) return false;
          if (edge.to === nodeId && edge.toPort && !inputs.includes(edge.toPort)) return false;
          return true;
        });
        onDraftChange({ ...current, graph: { ...current.graph, nodes, edges } });
      };

      const patchNode = (nodeId, patch) => {
        const current = draftRef.current;
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: current.graph.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
          },
        });
      };

      const selectedNodes = selection.nodes.map((id) => nodeById.get(id)).filter(Boolean);
      const selectedEdges = selection.edges
        .map((id) => graph.edges.find((edge) => edge.id === id))
        .filter(Boolean);
      const singleNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null;
      const singleEdge = selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0] : null;
      const selectedCount = selectedNodes.length + selectedEdges.length;
      const singleNodeId = singleNode ? singleNode.id : '';
      useEffect(() => {
        if (inspectorRef.current) inspectorRef.current.scrollTop = 0;
      }, [singleNodeId]);
      const bounds = canvasBounds(graph, positions, moduleById, direction, sizes);
      const padding = 500;
      const svgLeft = bounds.minX - padding;
      const svgTop = bounds.minY - padding;
      const svgWidth = bounds.width + padding * 2;
      const svgHeight = bounds.height + padding * 2;
      const broken = !localLayers(graph);

      const edgeLabel = (edge) => {
        const fromNode = nodeById.get(edge.from);
        const toNode = nodeById.get(edge.to);
        return `${fromNode ? fromNode.label || fromNode.id : edge.from} · ${edge.fromPort || '—'} → ${
          toNode ? toNode.label || toNode.id : edge.to
        } · ${edge.toPort || '—'}`;
      };

      return h(
        'div',
        { className: 'ath-page ath-page-editor' },
        h(
          'div',
          { className: 'ath-editor-head' },
          h('h2', { className: 'ath-editor-title' }, graph.id ? t('graphEditor.edit') : t('graphEditor.new')),
          draft.isCopy ? h('span', { className: 'ath-badge' }, t('graphEditor.copy')) : null,
          subgraph ? h('span', { className: 'ath-badge' }, t('graphs.subgraph')) : null,
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn', onClick: onBack, disabled: saving }, t('action.back')),
            graph.id
              ? h(
                  'button',
                  { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: onDelete, disabled: saving },
                  t('action.delete'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                onClick: onSave,
                disabled: saving || modules.length === 0 || broken,
                title: broken ? t('graphs.cycle') : undefined,
              },
              saving ? t('graphs.saving') : t('graphs.save'),
            ),
          ),
        ),
        errors.length
          ? h(
              'div',
              { className: 'ath-editor-errors' },
              h('div', { className: 'ath-error', style: { fontWeight: 600, marginBottom: 4 } }, t('graphs.fixErrors')),
              errors.map((error, index) => h('div', { className: 'ath-error', key: index }, `· ${error}`)),
            )
          : null,
        draft.isCopy ? h('div', { className: 'ath-hint', style: { marginBottom: 8 } }, t('graphEditor.copyHint')) : null,
        subgraph
          ? h('div', { className: 'ath-hint', style: { marginBottom: 8 } }, t('graphs.subgraphRunHint'))
          : null,
        h(
          'div',
          { className: 'ath-editor-meta' },
          h('input', {
            className: 'ath-input',
            type: 'text',
            value: graph.name,
            placeholder: t('graphs.name'),
            maxLength: 120,
            onChange: (event) => {
              const current = draftRef.current;
              onDraftChange({ ...current, graph: { ...current.graph, name: event.target.value } });
            },
          }),
          h('input', {
            className: 'ath-input',
            type: 'text',
            value: graph.description,
            placeholder: t('graphs.desc'),
            maxLength: 300,
            onChange: (event) => {
              const current = draftRef.current;
              onDraftChange({ ...current, graph: { ...current.graph, description: event.target.value } });
            },
          }),
        ),
        h(
          'div',
          {
            className: 'ath-editor',
            ref: editorRef,
            style: { '--ath-sidebar-width': `${sidebarWidth}px` },
          },
          h(
            'div',
            { className: 'ath-editor-main' },
            h(
              'div',
              {
                className: 'ath-canvas-viewport',
                ref: canvasRef,
                onPointerDown: onViewportPointerDown,
                onContextMenu: (event) => event.preventDefault(),
                onDragEnter: (event) => {
                  event.preventDefault();
                  setDragOver(true);
                },
                onDragOver: (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                },
                onDragLeave: (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
                },
                onDrop: onCanvasDrop,
                'data-panning': interaction && interaction.type === 'pan' ? 'true' : 'false',
                'data-connecting': connecting ? 'true' : 'false',
                'data-dragover': dragOver ? 'true' : 'false',
              },
              graph.nodes.length === 0
                ? h('div', { className: 'ath-canvas-empty' }, h('strong', null, t('graphs.canvasEmpty')))
                : null,
              h(
                'div',
                {
                  className: 'ath-canvas-layer',
                  style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` },
                },
                graph.nodes.length
                  ? h(
                      'svg',
                      {
                        className: 'ath-edges',
                        width: svgWidth,
                        height: svgHeight,
                        viewBox: `${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`,
                        style: { left: svgLeft, top: svgTop, position: 'absolute' },
                        'aria-hidden': 'true',
                      },
                      h(
                        'defs',
                        null,
                        h(
                          'marker',
                          {
                            id: 'ath-edge-arrow',
                            viewBox: '0 0 10 10',
                            refX: 8,
                            refY: 5,
                            markerWidth: 6,
                            markerHeight: 6,
                            orient: 'auto-start-reverse',
                          },
                          h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--dsw-alias-border-l2)' }),
                        ),
                      ),
                      edgeGeometry.map((edge) =>
                        h(
                          'g',
                          { key: edge.id },
                          h('path', {
                            d: edge.d,
                            className: 'ath-edge',
                            markerEnd: 'url(#ath-edge-arrow)',
                            'data-selected': selection.edges.includes(edge.id) ? 'true' : 'false',
                          }),
                          h('path', {
                            d: edge.d,
                            className: 'ath-edge-hit',
                            onPointerDown: (event) => onEdgePointerDown(event, edge.id),
                          }),
                        ),
                      ),
                      connecting
                        ? h('path', {
                            d: edgeCurve(connecting.start, connecting.current, direction).d,
                            className: 'ath-edge-pending',
                          })
                        : null,
                    )
                  : null,
                graph.nodes.map((node) => {
                  const module = moduleById.get(node.moduleId);
                  const ports = modulePorts(module);
                  const position = positions.get(node.id) || { x: 0, y: 0 };
                  const size = sizes.get(node.id) || nodeSizeFor(module, direction);
                  const selected = selection.nodes.includes(node.id);
                  const rows = Math.max(ports.inputs.length, ports.outputs.length);
                  const requiredInputs = new Set(module && Array.isArray(module.requiredInputs) ? module.requiredInputs : []);
                  const effectiveParams = module ? { ...(module.params || {}), ...(node.params || {}) } : {};
                  const paramPairs = Object.entries(effectiveParams).map(([key, value]) => [
                    key,
                    String(value == null ? '' : value).replace(/\s+/g, ' '),
                  ]);
                  const paramShort = paramPairs
                    .slice(0, 2)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' · ');
                  const paramFull = paramPairs.map(([key, value]) => `${key}=${value}`).join('\n');
                  const moduleName = module ? module.name : node.moduleId;
                  const nodeSub = `${moduleName}${paramShort ? ` · ${paramShort}` : ''}${
                    paramPairs.length > 2 ? ` +${paramPairs.length - 2}` : ''
                  }`;
                  return h(
                    'div',
                    {
                      key: node.id,
                      className: 'ath-node-card',
                      'data-selected': selected ? 'true' : 'false',
                      'data-kind': module ? module.kind : 'command',
                      'data-direction': direction,
                      style: { left: position.x, top: position.y, width: size.width, height: size.height },
                      onPointerDown: (event) => onNodePointerDown(event, node),
                    },
                    h(
                      'div',
                      { className: 'ath-node-head' },
                      h('span', { className: 'ath-node-title' }, node.label || (module ? module.name : node.moduleId)),
                      module && module.kind !== 'command' ? h('span', { className: 'ath-node-tag' }, t(`modules.kind.${module.kind}`)) : null,
                      h(
                        'span',
                        { className: 'ath-node-sub', title: paramFull || undefined },
                        nodeSub,
                      ),
                    ),
                    direction === 'vertical'
                      ? h(
                          'div',
                          { className: 'ath-node-vports' },
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-top' },
                            ports.inputs.length
                              ? ports.inputs.map((port) =>
                                  h(
                                    'span',
                                    {
                                      key: `in-${port}`,
                                      className: 'ath-vport-name',
                                      'data-required': requiredInputs.has(port) ? 'true' : 'false',
                                      title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                                    },
                                    `${port}${requiredInputs.has(port) ? ' *' : ''}`,
                                  ),
                                )
                              : ports.outputs.length
                                ? null
                                : h('span', { className: 'ath-vport-empty' }, t('canvas.noPorts')),
                          ),
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-bottom' },
                            ports.outputs.map((port) => h('span', { key: `out-${port}`, className: 'ath-vport-name' }, port)),
                          ),
                        )
                      : rows
                        ? h(
                            'div',
                            { className: 'ath-node-ports' },
                            Array.from({ length: rows }).map((_, row) =>
                              h(
                                'div',
                                { className: 'ath-port-row', key: row },
                                h(
                                  'span',
                                  {
                                    className: 'ath-port-name ath-port-in-name',
                                    'data-required': requiredInputs.has(ports.inputs[row]) ? 'true' : 'false',
                                  },
                                  `${ports.inputs[row] || ''}${requiredInputs.has(ports.inputs[row]) ? ' *' : ''}`,
                                ),
                                h('span', { className: 'ath-port-name ath-port-out-name' }, ports.outputs[row] || ''),
                              ),
                            ),
                          )
                        : h('div', { className: 'ath-node-noports' }, t('canvas.noPorts')),
                    ports.inputs.map((port, index) =>
                      h('div', {
                        key: `in-${port}`,
                        className: `ath-port-dot ath-port-in${requiredInputs.has(port) ? ' ath-port-required' : ''}${direction === 'vertical' ? ' ath-port-top' : ''}`,
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.inputs.length, size.width) - 6, top: -6 }
                            : { top: portTop(index) - 6 },
                        'data-port-node': node.id,
                        'data-port-name': port,
                        'data-port-kind': 'input',
                        title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                        onPointerDown: (event) => onPortPointerDown(event, node.id, 'input', port),
                      }),
                    ),
                    ports.outputs.map((port, index) =>
                      h('div', {
                        key: `out-${port}`,
                        className: `ath-port-dot ath-port-out${direction === 'vertical' ? ' ath-port-bottom' : ''}`,
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.outputs.length, size.width) - 6, top: size.height - 6 }
                            : { top: portTop(index) - 6 },
                        'data-port-node': node.id,
                        'data-port-name': port,
                        'data-port-kind': 'output',
                        title: `${t('canvas.output')}: ${port}`,
                        onPointerDown: (event) => onPortPointerDown(event, node.id, 'output', port),
                      }),
                    ),
                  );
                }),
                connecting
                  ? h('div', {
                      className: 'ath-connect-origin',
                      style: { left: connecting.start.x - 4, top: connecting.start.y - 4 },
                    })
                  : null,
              ),
              marquee
                ? h('div', {
                    className: 'ath-marquee',
                    style: {
                      left: Math.min(marquee.x1, marquee.x2),
                      top: Math.min(marquee.y1, marquee.y2),
                      width: Math.abs(marquee.x2 - marquee.x1),
                      height: Math.abs(marquee.y2 - marquee.y1),
                    },
                  })
                : null,
              h(
                'div',
                {
                  className: 'ath-canvas-tools',
                  onPointerDown: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'ath-segmented' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-seg-btn',
                      'data-active': direction === 'vertical' ? 'true' : 'false',
                      onClick: () => setDirection('vertical'),
                      title: t('canvas.vertical'),
                    },
                    t('canvas.vertical'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-seg-btn',
                      'data-active': direction === 'horizontal' ? 'true' : 'false',
                      onClick: () => setDirection('horizontal'),
                      title: t('canvas.horizontal'),
                    },
                    t('canvas.horizontal'),
                  ),
                ),
                h('span', { className: 'ath-tool-sep' }),
                h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => applyLayout(false, false) }, t('canvas.tidy')),
                h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => applyLayout(true, true) }, t('canvas.reset')),
                selectedCount
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'ath-btn ath-btn-ghost ath-btn-danger',
                        onClick: deleteSelection,
                      },
                      `${t('canvas.deleteSelected')} (${selectedCount})`,
                    )
                  : null,
                h('span', { className: 'ath-tool-sep' }),
                h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1 / 1.2), title: t('canvas.zoomOut') }, '−'),
                h(
                  'button',
                  { type: 'button', className: 'ath-zoom-value', onClick: () => zoomTo(1), title: t('canvas.zoomReset') },
                  `${Math.round(view.zoom * 100)}%`,
                ),
                h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1.2), title: t('canvas.zoomIn') }, '+'),
              ),
              cycleNotice ? h('div', { className: 'ath-canvas-warning' }, cycleNotice) : null,
              h('div', { className: 'ath-canvas-hint' }, t('canvas.hint')),
            ),
          ),
          h('div', {
            className: 'ath-editor-resizer',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': t('canvas.resizeSidebar'),
            title: t('canvas.resizeSidebar'),
            onPointerDown: startSidebarResize,
          }),
          h(
            'div',
            { className: 'ath-editor-side', ref: sideRef },
            h(
              'div',
              { className: 'ath-card ath-palette', style: { height: `${paletteHeight}px` } },
              h('div', { className: 'ath-palette-head' }, h('h4', { className: 'ath-section-title' }, t('canvas.paletteTitle'))),
              h('input', {
                className: 'ath-input',
                type: 'search',
                value: paletteQuery,
                placeholder: t('canvas.searchPlaceholder'),
                onChange: (event) => setPaletteQuery(event.target.value),
              }),
              h(
                'div',
                { className: 'ath-chips', style: { marginTop: 8 } },
                ['all', 'command', 'graph', 'dataset'].map((key) =>
                  h(
                    'button',
                    {
                      key,
                      type: 'button',
                      className: 'ath-chip',
                      'data-active': paletteFilter === key ? 'true' : 'false',
                      onClick: () => setPaletteFilter(key),
                    },
                    t(`canvas.filter.${key}`),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'ath-palette-list' },
                paletteItems.length
                  ? paletteItems.map((module) => {
                      const ports = modulePorts(module);
                      return h(
                        'button',
                        {
                          key: module.id,
                          type: 'button',
                          className: 'ath-palette-item',
                          draggable: true,
                          onClick: () => {
                            if (draggingRef.current) return;
                            addModule(module);
                          },
                          onDragStart: (event) => {
                            draggingRef.current = true;
                            event.dataTransfer.setData('text/aether-module', module.id);
                            event.dataTransfer.setData('text/plain', module.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          },
                          onDragEnd: () => {
                            setDragOver(false);
                            window.setTimeout(() => {
                              draggingRef.current = false;
                            }, 0);
                          },
                          title: t('canvas.paletteHint'),
                        },
                        h(
                          'span',
                          { className: 'ath-palette-row' },
                          h('span', { className: 'ath-palette-name' }, module.name),
                          h('span', { className: 'ath-badge', 'data-kind': module.kind }, t(`modules.kind.${module.kind}`)),
                        ),
                        h(
                          'span',
                          { className: 'ath-palette-meta' },
                          tr(t, 'canvas.portSummary', { inputs: ports.inputs.length, outputs: ports.outputs.length }),
                          (module.requiredInputs || []).length
                            ? ` · ${tr(t, 'modules.requiredCount', { n: module.requiredInputs.length })}`
                            : '',
                          ` · ${t('common.params')} ${Object.keys(module.params || {}).length}`,
                          ` · ${tr(t, 'modules.versionLabel', { version: module.version || 1 })}`,
                          module.environmentName ? ` · ${module.environmentName}` : '',
                        ),
                        h(
                          'span',
                          { className: 'ath-palette-desc' },
                          module.kind === 'dataset'
                            ? module.datasetUri || ''
                            : module.kind === 'graph'
                              ? module.subgraphName || module.graphId || ''
                              : module.description || '',
                        ),
                      );
                    })
                  : h('div', { className: 'ath-hint', style: { padding: '10px 0' } }, t('canvas.emptyPalette')),
              ),
            ),
            h('div', {
              className: 'ath-palette-resizer',
              role: 'separator',
              'aria-orientation': 'horizontal',
              'aria-label': t('canvas.resizePalette'),
              title: t('canvas.resizePalette'),
              onPointerDown: startPaletteResize,
            }),
            h(
              'div',
              { className: 'ath-card ath-inspector', ref: inspectorRef },
              h('h4', { className: 'ath-section-title' }, t('graphs.inspector')),
              singleNode
                ? h(
                    'div',
                    null,
                    (() => {
                      const module = moduleById.get(singleNode.moduleId);
                      const ports = modulePorts(module);
                      const entries = Object.entries(singleNode.params || {});
                      return h(
                        'div',
                        { className: 'ath-module-detail' },
                        h(
                          'div',
                          { className: 'ath-module-detail-head' },
                          h('strong', { className: 'ath-module-detail-name' }, module ? module.name : singleNode.moduleId),
                          module
                            ? h(
                                'span',
                                { className: 'ath-badge', 'data-kind': module.kind },
                                t(`modules.kind.${module.kind}`),
                              )
                            : null,
                          module
                            ? h(
                                'span',
                                { className: 'ath-badge' },
                                tr(t, 'modules.versionLabel', { version: module.version || 1 }),
                              )
                            : null,
                          module
                            ? h(
                                'span',
                                { className: 'ath-node-env' },
                                environmentName(t, environments, module.environmentId, module.environmentName),
                              )
                            : null,
                        ),
                        h(
                          'div',
                          { className: 'ath-hint' },
                          `${t('canvas.inputs')}: ${ports.inputs.length ? ports.inputs.join(', ') : t('canvas.none')} · ${t(
                            'canvas.outputs',
                          )}: ${ports.outputs.length ? ports.outputs.join(', ') : t('canvas.none')}`,
                        ),
                        h(
                          'div',
                          { className: 'ath-param-summary' },
                          entries.length
                            ? entries.map(([key, value]) =>
                                h('span', { className: 'ath-param-chip', key }, `${key}=${value}`),
                              )
                            : h('span', { className: 'ath-hint' }, t('common.noParams')),
                        ),
                        h('div', { className: 'ath-hint', style: { marginTop: 4 } }, t('canvas.nodeParamsHint')),
                      );
                    })(),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('graphs.nodeLabel')),
                      h('input', {
                        className: 'ath-input',
                        type: 'text',
                        value: singleNode.label,
                        placeholder: t('graphs.nodeLabelPlaceholder'),
                        maxLength: 120,
                        onChange: (event) => patchNode(singleNode.id, { label: event.target.value }),
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
                          value: singleNode.moduleId,
                          onChange: (event) => changeNodeModule(singleNode.id, event.target.value),
                        },
                        modules.map((module) => h('option', { key: module.id, value: module.id }, module.name)),
                      ),
                    ),
                    (() => {
                      const module = moduleById.get(singleNode.moduleId);
                      return module && module.kind === 'graph'
                        ? h(
                            'div',
                            { className: 'ath-subgraph-link' },
                            h('div', { className: 'ath-hint', style: { marginTop: 6 } }, tr(t, 'graphs.subgraphTip', { name: module.name })),
                            module.graphId
                              ? h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'ath-btn ath-btn-ghost',
                                    onClick: () => onOpenSubgraph(module.graphId),
                                  },
                                  t('graphs.openSubgraph'),
                                )
                              : null,
                          )
                        : null;
                    })(),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('common.params')),
                      h(ParamsEditor, {
                        key: `${singleNode.id}:${singleNode.moduleId}`,
                        t,
                        value: singleNode.params,
                        onChange: (params) => patchNode(singleNode.id, { params }),
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
                          .filter((edge) => edge.to === singleNode.id || edge.from === singleNode.id)
                          .map((edge) =>
                            h(
                              'div',
                              { className: 'ath-dep-row', key: edge.id },
                              h('span', { className: 'ath-hint', style: { flex: 1, overflowWrap: 'anywhere' } }, edgeLabel(edge)),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'ath-icon-btn',
                                  title: t('graphs.removeEdge'),
                                  'aria-label': t('graphs.removeEdge'),
                                  onClick: () => {
                                    const current = draftRef.current;
                                    onDraftChange({
                                      ...current,
                                      graph: {
                                        ...current.graph,
                                        edges: current.graph.edges.filter((item) => item.id !== edge.id),
                                      },
                                    });
                                  },
                                },
                                '×',
                              ),
                            ),
                          ),
                        graph.edges.some((edge) => edge.to === singleNode.id || edge.from === singleNode.id)
                          ? null
                          : h('div', { className: 'ath-hint' }, t('graphs.noDeps')),
                      ),
                      h('div', { className: 'ath-hint', style: { marginTop: 8 } }, t('canvas.connectHint')),
                    ),
                    h(
                      'div',
                      { style: { marginTop: 14 } },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ath-btn ath-btn-ghost ath-btn-danger',
                          onClick: () => {
                            const current = draftRef.current;
                            onDraftChange({
                              ...current,
                              graph: {
                                ...current.graph,
                                nodes: current.graph.nodes.filter((item) => item.id !== singleNode.id),
                                edges: current.graph.edges.filter(
                                  (edge) => edge.from !== singleNode.id && edge.to !== singleNode.id,
                                ),
                              },
                            });
                            setSelection({ nodes: [], edges: [] });
                          },
                        },
                        t('graphs.deleteNode'),
                      ),
                    ),
                  )
                : singleEdge
                  ? h(
                      'div',
                      { className: 'ath-detail', style: { gap: 10 } },
                      h('div', { className: 'ath-hint' }, t('canvas.edgeSelected')),
                      h('div', { className: 'ath-mono', style: { fontSize: 11.5, overflowWrap: 'anywhere' } }, edgeLabel(singleEdge)),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ath-btn ath-btn-ghost ath-btn-danger',
                          onClick: () => {
                            const current = draftRef.current;
                            onDraftChange({
                              ...current,
                              graph: {
                                ...current.graph,
                                edges: current.graph.edges.filter((edge) => edge.id !== singleEdge.id),
                              },
                            });
                            setSelection({ nodes: [], edges: [] });
                          },
                        },
                        t('graphs.removeEdge'),
                      ),
                    )
                  : selectedCount
                    ? h(
                        'div',
                        { className: 'ath-detail', style: { gap: 10 } },
                        h(
                          'div',
                          { className: 'ath-hint' },
                          `${selectedNodes.length} ${t('common.nodes')} · ${selectedEdges.length} ${t('common.edges')}`,
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: deleteSelection },
                          t('canvas.deleteSelected'),
                        ),
                      )
                    : h('div', { className: 'ath-hint' }, t('graphs.selectNode')),
            ),
            broken ? h('div', { className: 'ath-error' }, t('graphs.cycle')) : null,
          ),
        ),
      );
    }

// ---- client/src/80-modules.js ----
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
                  ['command', 'graph', 'dataset'].map((kind) =>
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

// ---- client/src/90-panel.js ----
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

      const changeWorkspace = async (pathValue) => {
        setWorkspaceBusy(true);
        try {
          const payload = await request('/workspace', {
            method: 'POST',
            body: { path: pathValue },
          });
          setWorkspaceOpen(false);
          setEditorTabs([]);
          setActiveEditorKey('');
          setModuleDraft(null);
          setRunId('');
          setRunDetail(null);
          setLogView(null);
          setOutputView(null);
          setTab('runs');
          pushToast(payload.copied ? t('workspace.copied') : t('workspace.switched'));
          await loadState(true);
        } catch (error) {
          fail(error);
        } finally {
          setWorkspaceBusy(false);
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
              inputs: nextKind === 'dataset' ? [] : ['input'],
              requiredInputs: [],
              outputs: ['output'],
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
            onNew: () => setNewModuleOpen(true),
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
            })
          : null,
        newModuleOpen
          ? h(NewModuleDialog, {
              t,
              onClose: () => setNewModuleOpen(false),
              onPick: (kind) => {
                setNewModuleOpen(false);
                startModule(null, kind);
              },
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

// ---- client/src/99-register.js ----
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

