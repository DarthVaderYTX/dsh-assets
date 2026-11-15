window.__ModuleLoader__.load({
  id: 'tech-hub',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
    } = React;

    const NS = 'techhub';
    const API_BASE = '/techhub/api';
    const TAB_KEY = 'techhub:active-tab';

    const ZH = {
      panel: 'TechHub',
      title: 'TechHub',
      subtitle: '评测任务工作台',
      'tab.tasks': '任务',
      'tab.templates': '模板',
      'tab.stages': '阶段',
      'tab.datasets': '数据集',
      'tab.docs': '文档',
      'theme.title': '主题风格',
      'theme.subtitle': '选择一套预设颜色主题，即时应用到 TechHub。',
      'theme.default': '默认',
      'theme.defaultHint': '跟随当前 DSH 主题',
      'theme.blue': '海洋蓝',
      'theme.blueHint': '清爽的科技蓝',
      'theme.emerald': '翡翠绿',
      'theme.emeraldHint': '沉静的绿色调',
      'theme.amber': '琥珀橙',
      'theme.amberHint': '温暖的橙色调',
      'theme.violet': '紫罗兰',
      'theme.violetHint': '柔和的紫色调',
      'theme.rose': '玫瑰红',
      'theme.roseHint': '克制的红色调',
      'theme.saved': '主题已更新',
      'theme.saveFailed': '无法保存主题：{message}',
      'theme.current': '当前',
      'language.title': '语言',
      'language.auto': '自动',
      'language.zh': '中文',
      'language.en': 'English',
      'language.saved': '语言已更新',
      'language.saveFailed': '无法保存语言设置：{message}',
      'docs.kicker': 'Agent Skill',
      'docs.title': '说明文档',
      'docs.subtitle': '阅读、编辑并保存插件自动注册给 agent 的 TechHub skill 文档。',
      'docs.edit': '编辑文档',
      'docs.readonly': '只读',
      'docs.readonlyHint': '点击「编辑文档」后才能修改。',
      'docs.save': '保存文档',
      'docs.saving': '正在保存…',
      'docs.saved': '文档已保存',
      'docs.saveFailed': '保存失败：{message}',
      'docs.loadFailed': '无法加载文档：{message}',
      'docs.loading': '正在加载文档…',
      'docs.characters': '{n} 字符',
      'docs.unsaved': '有未保存的修改',
      'docs.savedHint': '已保存',
      'docs.editHint': '支持 Markdown；Ctrl/Cmd + S 保存。',
      'docs.placeholder': '# TechHub Agent 使用指南\n\n在这里编写说明文档…',
      'docs.editorLabel': '文档内容',
      'common.create': '新建',
      'common.edit': '编辑',
      'common.delete': '删除',
      'common.cancel': '取消',
      'common.save': '保存',
      'common.saving': '保存中…',
      'common.close': '关闭',
      'common.preview': '预览',
      'common.run': '运行',
      'common.stop': '停止',
      'common.search': '搜索',
      'common.refresh': '刷新',
      'common.retry': '重试',
      'common.loading': '正在加载…',
      'common.all': '全部',
      'common.confirm': '确认',
      'common.back': '返回',
      'common.none': '无',
      'common.updated': '更新于',
      'common.created': '创建于',
      'common.deleteTitle': '确认删除？',
      'common.deleteIrreversible': '此操作无法撤销。',
      'common.actions': '操作',
      'common.networkError': '无法连接 TechHub 服务，请稍后重试。',
      'common.notFound': '内容不存在或已被删除。',
      'common.rows': '{n} 行',
      'common.columns': '{n} 列',
      'common.optional': '可选',
      'common.noDescription': '未填写说明',
      'workspace.title': '结果工作区',
      'workspace.subtitle': '配置运行结果、阶段日志和数据集快照的保存位置。',
      'workspace.path': 'Workspace 路径',
      'workspace.placeholder': '例如：D:\\experiments\\techhub',
      'workspace.hint': '请输入绝对路径。结果会保存在该目录下的 runs/<run-id>/：run.json、各阶段 stdout/stderr 日志和数据集快照。',
      'workspace.defaultPath': '默认路径：{path}',
      'workspace.useDefault': '使用默认路径',
      'workspace.current': '保存后结果会写入',
      'workspace.saved': '结果工作区已更新',
      'workspace.saveFailed': '无法设置工作区：{message}',
      'workspace.absolute': '请输入绝对路径，例如 D:\\experiments\\techhub。',
      'workspace.resetTitle': '重置工作区',
      'workspace.resetHint': '清空所有任务和运行记录，并删除当前工作区 runs 下的运行结果。模板和数据集会保留。此操作无法撤销。',
      'workspace.resetConfirm': '确认重置',
      'workspace.resetBusy': '正在重置…',
      'workspace.resetDone': '工作区已重置',
      'workspace.resetFailed': '重置失败：{message}',
      'workspace.cleanupFailed': '任务数据已清空，但部分结果文件删除失败：{message}',
      'workspace.bundleTitle': 'Workspace 导入 / 导出',
      'workspace.bundleHint': '导出当前 workspace 的数据集、模板和脚本文件；任务与运行结果默认不导出。导入会替换当前数据集和模板。',
      'workspace.includeTasks': '包含任务与运行结果',
      'workspace.includeTasksHint': '默认关闭。勾选后会将任务和 runs 目录一起导出。',
      'workspace.export': '导出 workspace',
      'workspace.import': '导入 workspace',
      'workspace.exporting': '正在导出…',
      'workspace.importing': '正在导入…',
      'workspace.importConfirm': '导入会替换当前 workspace 的数据集、模板、任务和运行结果；如果 bundle 未包含任务，任务和运行结果会被清空。继续？',
      'workspace.exportFailed': '导出失败：{message}',
      'workspace.importFailed': '导入失败：{message}',
      'workspace.imported': 'Workspace 导入完成',
      'run.resultsDir': '结果目录',
      'status.idle': '未运行',
      'status.pending': '等待中',
      'status.running': '运行中',
      'status.completed': '已完成',
      'status.failed': '失败',
      'status.stopped': '已停止',
      'tasks.title': '任务',
      'tasks.kicker': 'TASK MANAGEMENT',
      'tasks.subtitle': '创建评测任务，为 Control 组与 Treatment 组配置独立的阶段命令。',
      'tasks.new': '新建任务',
      'tasks.search': '搜索任务、模板或数据集',
      'tasks.empty': '还没有评测任务',
      'tasks.emptyHint': '从任务模板生成阶段，加入 Control 组与任意数量的 Treatment 组。',
      'tasks.emptyAction': '创建第一个任务',
      'tasks.total': '任务总数',
      'tasks.running': '运行中',
      'tasks.templates': '任务模板',
      'tasks.datasets': '数据集',
      'tasks.control': 'Control 组',
      'tasks.treatment': 'Treatment 组',
      'tasks.groups': '{n} 个分组',
      'tasks.stages': '{n} 个阶段',
      'tasks.stagesProgress': '{done}/{total} 阶段',
      'tasks.stagesLabel': '阶段数',
      'tasks.noDataset': '不使用数据集',
      'tasks.run': '运行任务',
      'tasks.runAgain': '再次运行',
      'tasks.stop': '停止运行',
      'tasks.detail': '任务详情',
      'tasks.latestRun': '最近运行',
      'tasks.history': '运行历史',
      'tasks.noRun': '这个任务还没有运行记录。',
      'tasks.runStarted': '任务已开始运行',
      'tasks.runStopped': '任务已停止',
      'tasks.saved': '任务已保存',
      'tasks.deleted': '任务已删除',
      'tasks.deleteTitle': '删除这个任务？',
      'tasks.deleteBody': '任务配置与运行记录会被删除，已导出到磁盘的数据集文件不会被删除。',
      'tasks.name': '任务名称',
      'tasks.namePlaceholder': '例如：Math-500 基线对比',
      'tasks.nameRequired': '请填写任务名称。',
      'tasks.description': '任务说明',
      'tasks.descriptionPlaceholder': '说明本次评测的目标、变量与观察指标（可选）',
      'tasks.dataset': '数据集',
      'tasks.datasetHint': '运行时数据集会导出为 JSONL/CSV 文件，并通过 TECHHUB_DATASET_PATH 提供。',
      'tasks.datasetFromTemplate': '数据集：{name}（继承自模板）',
      'tasks.datasetTemplateEmpty': '该模板未选择数据集',
      'tasks.datasetTemplatePick': '选择模板后自动继承其数据集',
      'datasets.deleteUsedBody': '有 {n} 个模板正在使用该数据集；删除后这些模板会失去数据集。',
      'tasks.cwd': '工作目录',
      'tasks.cwdPlaceholder': '留空使用 DSH 默认工作目录',
      'tasks.cwdHint': '命令在此目录中执行，支持相对路径。',
      'tasks.groupsTitle': '分组配置',
      'tasks.groupsHint': '任务必须包含 1 个 Control 组，可选 1 个或多个 Treatment 组。',
      'tasks.addTreatment': '添加 Treatment 组',
      'tasks.treatmentN': 'Treatment {n}',
      'tasks.groupName': '分组名称',
      'tasks.template': '任务模板',
      'tasks.templatePlaceholder': '请选择任务模板',
      'tasks.templateMissing': '模板已删除',
      'tasks.applyTemplate': '从模板重新生成',
      'tasks.applyTemplateHint': '用当前模板重建该分组的阶段快照，会覆盖已修改的命令；保存后生效。',
      'tasks.parameterTypeInvalid': '全局参数 {{key}} 的值必须是 {type}。',
      'tasks.noStageConfig': '选择任务模板后，会在这里生成可编辑的阶段命令。',
      'tasks.command': '命令',
      'tasks.commandPlaceholder': '例如：python eval.py',
      'tasks.args': '参数',
      'tasks.argsPlaceholder': '例如：--limit 100 --split test',
      'tasks.stage': '阶段',
      'tasks.groupIncomplete': '每个分组都需要选择模板，并为每个阶段填写命令。',
      'tasks.templateRequired': '请为每个分组选择任务模板。',
      'tasks.stageRequired': '每个分组至少需要 1 个阶段。',
      'tasks.stageCommandRequired': '请为每个阶段填写命令。',
      'tasks.envHint': '各组会同时开始执行，组内阶段按顺序串行执行；命令中可以使用 TECHHUB_OUTPUT_DIR、TECHHUB_GROUP_ROLE、TECHHUB_GROUP_ID、TECHHUB_STAGE_ID 等环境变量。',
      'tasks.parameters': '全局参数',
      'tasks.parametersHint': '命令与参数中的 {{KEY}} 会在运行时替换为该分组配置的实际值。',
      'tasks.parameterValue': '值',
      'tasks.parameterDefault': '默认值',
      'tasks.noParameters': '该模板没有全局参数。',
      'tasks.parameterPlaceholder': '例如 baseline',
      'tasks.openFolder': '打开文件夹',
      'tasks.openTaskFolder': '打开任务结果文件夹',
      'tasks.openGroupFolder': '打开分组文件夹',
      'tasks.openStageFolder': '打开阶段文件夹',
      'tasks.folderOpened': '已打开文件夹',
      'tasks.folderOpenFailed': '无法打开文件夹：{message}',
      'tasks.noResultFolder': '该任务还没有可打开的结果文件夹',
      'tasks.newTitle': '新建评测任务',
      'tasks.editTitle': '编辑评测任务',
      'tasks.runStatus': '运行状态',
      'templates.title': '模板',
      'templates.kicker': 'TEMPLATE LIBRARY',
      'templates.subtitle': '从阶段库挑选已有阶段并排序，组成可复用的评测流程。',
      'templates.new': '新建模板',
      'templates.search': '搜索模板或阶段',
      'templates.empty': '还没有任务模板',
      'templates.emptyHint': '先从阶段库挑选阶段组成流程，再在任务里为每个分组覆盖命令与参数。',
      'templates.emptyAction': '创建第一个模板',
      'templates.newTitle': '新建任务模板',
      'templates.editTitle': '编辑任务模板',
      'templates.name': '模板名称',
      'templates.namePlaceholder': '例如：GSM8K 推理评测',
      'templates.nameRequired': '请填写模板名称。',
      'templates.description': '模板说明',
      'templates.descriptionPlaceholder': '描述模板适用的模型、数据或指标（可选）',
      'templates.dataset': '模板数据集',
      'templates.datasetHint': '模板声明它评估的数据集；任务引用模板时会自动继承，运行时导出为该分组的数据集文件。',
      'templates.noDataset': '不使用数据集',
      'templates.datasetMissing': '数据集已删除',
      'templates.parameters': '全局参数',
      'templates.parametersHint': '在阶段命令或参数中使用 {{KEY}} 引用；执行任务时按分组配置实际值。',
      'templates.addParameter': '添加参数',
      'templates.parameterKey': '参数名',
      'templates.parameterDefault': '默认值',
      'templates.parameterDescription': '说明',
      'templates.parameterKeyPlaceholder': '例如 MODEL',
      'templates.parameterDefaultPlaceholder': '例如 baseline',
      'templates.parameterDescriptionPlaceholder': '这个参数的用途（可选）',
      'templates.parameterKeyRequired': '请填写参数名。',
      'templates.parameterKeyInvalid': '参数名只能使用字母、数字和下划线，且不能以数字开头。',
      'templates.parameterKeyDuplicate': '参数名不能重复。',
      'templates.parameterCount': '{n} 个参数',
      'templates.noParameters': '未定义全局参数',
      'templates.stages': '阶段序列',
      'templates.pipeline': '数据处理管线',
      'templates.openFolder': '打开模板文件夹',
      'templates.folderOpened': '已打开模板文件夹',
      'templates.folderOpenFailed': '无法打开模板文件夹：{message}',
      'templates.stagesHint': '阶段按从上到下的顺序串行执行；阶段内容在「阶段」页维护，这里只负责挑选与排序。',
      'templates.addStage': '添加阶段',
      'templates.stageName': '阶段名称',
      'templates.stageNamePlaceholder': '例如：准备环境',
      'templates.stageCommand': '执行命令',
      'templates.stageCommandPlaceholder': '例如：python prepare.py',
      'templates.stageArgs': '默认参数',
      'templates.stageArgsPlaceholder': '例如：--model baseline',
      'templates.stageArgsHint': '默认参数会自动带入任务，可在 Task 的分组配置中覆盖。',
      'templates.stageDescription': '阶段说明',
      'templates.stageDescriptionPlaceholder': '这个阶段做什么（可选）',
      'templates.moveUp': '上移',
      'templates.moveDown': '下移',
      'templates.removeStage': '删除阶段',
      'templates.dragHandle': '拖拽调整阶段顺序',
      'templates.dragHint': '拖拽左侧手柄可以调整阶段顺序；也可以用上下箭头微调。',
      'templates.outputs': '对外输出',
      'templates.outputsHint': '配置输出文件与对外名称；只有这里配置的文件，后续阶段才能引用。',
      'templates.addOutput': '添加输出',
      'templates.outputFile': '输出文件',
      'templates.outputName': '对外名称',
      'templates.outputFilePlaceholder': '例如 result.json',
      'templates.outputNamePlaceholder': '例如 result',
      'templates.outputRequired': '请填写输出文件和对外名称。',
      'templates.outputNameInvalid': '对外名称只能使用字母、数字和下划线，且不能以数字开头。',
      'templates.outputNameDuplicate': '同一阶段的对外名称不能重复。',
      'templates.outputFileInvalid': '输出文件必须是 output 目录内的相对路径，不能使用绝对路径或 ..。',
      'templates.noOutputs': '还没有配置对外输出',
      'templates.inputs': '输入引用',
      'templates.inputsHint': '手动添加引用：指定本阶段的 key，选择上游阶段和输出；命令中 {{key}} 会替换为该文件的绝对路径（Windows 使用 /），建议加引号。',
      'templates.addInputRef': '添加输入引用',
      'templates.inputKey': '引用 key',
      'templates.inputKeyPlaceholder': '例如 normalized',
      'templates.inputStage': '上游阶段',
      'templates.inputOutput': '输出',
      'templates.inputKeyRequired': '请填写输入引用 key。',
      'templates.inputKeyInvalid': '引用 key 只能使用字母、数字和下划线，且不能以数字开头。',
      'templates.inputKeyDuplicate': '同一阶段内的引用 key 不能重复。',
      'templates.inputKeyConflict': '引用 key 不能与全局参数重名。',
      'templates.inputStageRequired': '请选择上游阶段和输出。',
      'templates.noOutputsToReference': '上游阶段还没有配置对外输出',
      'templates.noInputRefs': '还没有输入引用',
      'templates.noUpstream': '上游阶段还没有配置对外输出',
      'templates.previewInputs': '输入引用',
      'templates.previewOutputs': '对外输出',
      'templates.stageNameDuplicate': '同一模板中的阶段名不能重复。',
      'templates.inputRefInvalid': '存在无效的输入引用，请重新选择上游输出。',
      'templates.stageCount': '{n} 个阶段',
      'templates.usedBy': '{n} 个任务使用',
      'templates.stageRequired': '请至少添加 1 个阶段。',
      'templates.commandRequired': '请为每个阶段填写执行命令。',
      'templates.saved': '模板已保存',
      'templates.deleted': '模板已删除',
      'templates.deleteTitle': '删除这个模板？',
      'templates.deleteBody': '已经引用此模板的任务会保留创建时保存的阶段快照。',
      'templates.noStages': '尚未添加阶段',
      'templates.stageN': '阶段 {n}',
      'templates.previewTitle': '模板详情',
      'templates.previewAction': '预览模板',
      'templates.previewStages': '阶段详情',
      'templates.defaultArgs': '默认参数',
      'templates.noDefaultArgs': '无默认参数',
      'templates.previewUsage': '{n} 个任务引用',
      'templates.orderLabel': '执行顺序',
      'templates.pickStage': '从阶段库添加',
      'templates.pickStagePlaceholder': '选择一个阶段…',
      'templates.addPickedStage': '添加阶段',
      'templates.noMoreStages': '阶段库中没有可添加的阶段',
      'templates.stageLibraryEmpty': '阶段库为空，请先到「阶段」页创建阶段。',
      'templates.noStagesHint': '还没有添加阶段：从上面的下拉框挑选阶段库中的阶段加入流程。',
      'templates.stageMissing': '阶段已被删除',
      'templates.stageRefHint': '阶段内容在「阶段」页维护；这里只调整顺序与输入引用。',
      'templates.stageRefCommand': '命令',
      'stages.kicker': 'STAGE LIBRARY',
      'stages.title': '阶段',
      'stages.subtitle': '维护可复用的阶段命令；模板只能按顺序引用这里已有的阶段。',
      'stages.new': '新建阶段',
      'stages.search': '搜索阶段名称、说明或命令',
      'stages.empty': '阶段库还是空的',
      'stages.emptyHint': '先定义阶段（命令、参数与对外输出），再在模板里组合使用。',
      'stages.emptyAction': '创建第一个阶段',
      'stages.newTitle': '新建阶段',
      'stages.editTitle': '编辑阶段',
      'stages.name': '阶段名称',
      'stages.namePlaceholder': '例如：清洗查询',
      'stages.nameRequired': '请填写阶段名称。',
      'stages.nameDuplicate': '阶段名称不能重复。',
      'stages.description': '阶段说明',
      'stages.descriptionPlaceholder': '这个阶段做什么（可选）',
      'stages.command': '执行命令',
      'stages.commandRequired': '请填写执行命令。',
      'stages.commandPlaceholder': '例如：node "%TECHHUB_WORKSPACE%/scripts/clean.js" "@@input@@"',
      'stages.commandHint': '命令、参数写在一起；用 @@名称@@ 引用本阶段的输入、输出或参数。',
      'stages.commandUnknownRefs': '命令引用了未声明的名字：{names}；请先在输入/输出/参数里声明。',
      'stages.args': '默认参数',
      'stages.outputs': '对外输出',
      'stages.outputsHint': '只有这里登记的文件，下游阶段才能通过输入引用使用；文件写在阶段 output/ 目录下。',
      'stages.noOutputs': '还没有配置对外输出',
      'stages.addOutput': '添加输出',
      'stages.saved': '阶段已保存',
      'stages.deleted': '阶段已删除',
      'stages.deleteTitle': '删除这个阶段？',
      'stages.deleteBody': '删除后无法撤销。',
      'stages.deleteUsedBody': '该阶段被 {n} 个模板引用；删除后会同时从这些模板中移除，已创建的任务保留创建时的快照。',
      'stages.usedBy': '{n} 个模板使用',
      'stages.unused': '未被模板使用',
      'stages.previewTitle': '阶段详情',
      'stages.previewCommand': '执行命令',
      'stages.previewArgs': '默认参数',
      'stages.previewOutputs': '对外输出',
      'stages.previewUsage': '引用此阶段的模板',
      'stages.previewNoUsage': '还没有模板引用这个阶段',
      'stages.outputCount': '{n} 个输出',
      'stages.count': '共 {n} 个阶段',
      'stages.openFolder': '打开阶段文件夹',
      'stages.folderOpened': '已打开阶段文件夹',
      'stages.folderOpenFailed': '无法打开阶段文件夹：{message}',
      'stages.asset': '提交文件 / 文件夹',
      'stages.assetHint': '提交后命令在它的根目录执行，根目录里能看到全部提交内容（@@work_dir@@ 也指向这里）。',
      'stages.assetPickFile': '选择文件',
      'stages.assetPickFolder': '选择文件夹',
      'stages.assetClear': '清除',
      'stages.assetEmpty': '未提交文件：命令在任务工作目录执行。',
      'stages.assetBusy': '正在上传…',
      'stages.assetTooLarge': '提交内容不能超过 64MB。',
      'stages.assetTooMany': '提交文件数量不能超过 1000 个。',
      'stages.assetUploadFailed': '上传失败：{message}',
      'stages.assetFiles': '{n} 个文件',
      'stages.assetFile': '文件',
      'stages.assetFolder': '文件夹',
      'stages.inputs': '输入',
      'stages.inputsHint': '阶段要消费的输入；命令与参数里用 @@名称@@ 引用，模板负责为每个输入选择来源。',
      'stages.noInputs': '没有声明输入',
      'stages.addInput': '添加输入',
      'stages.inputName': '输入名',
      'stages.inputNamePlaceholder': '例如 query',
      'stages.parameters': '参数',
      'stages.parametersHint': '阶段自带的参数与默认值；模板里可以改用上游阶段的值或全局参数。',
      'stages.noParameters': '没有声明参数',
      'stages.addParameter': '添加参数',
      'stages.parameterName': '参数名',
      'stages.parameterNamePlaceholder': '例如 WEIGHT',
      'stages.parameterDefault': '默认值',
      'stages.parameterDefaultPlaceholder': '例如 1.25',
      'stages.parameterDescriptionPlaceholder': '这个参数的作用（可选）',
      'stages.ioHint': '命令里的 @@名称@@ 会替换为输入/参数/输出的值。',
      'stages.type': '类型',
      'stages.typeString': '文本',
      'stages.typeNumber': '数字',
      'stages.typeBoolean': '布尔',
      'stages.typeJson': 'JSON',
      'stages.typeFile': '文件',
      'stages.typeDirectory': '目录',
      'stages.required': '必填',
      'stages.requiredHint': '必填输入必须由模板绑定来源；取消勾选后模板可以留空。',
      'stages.optional': '可选',
      'stages.timeout': '超时（秒）',
      'stages.timeoutHint': '0 表示不限制；超时后宿主会终止该阶段的进程并标记失败。',
      'stages.timeoutInvalid': '超时必须是 0 或正整数秒。',
      'stages.defaultInvalid': '参数「{name}」的默认值与类型 {type} 不匹配。',
      'stages.builtinNameConflict': '「{name}」是内置变量名，不能用作输入/输出/参数。',
      'stages.builtins': '内置变量',
      'stages.builtinsHint': '命令里可以直接引用这些变量，无需声明：',
      'stages.commandUnclosed': '命令里的 @@ 占位符没有闭合。',
      'stages.commandEmptyRef': '命令里存在空的 @@占位符@@。',
      'stages.commandMultilineRef': '占位符不能跨行：{name}。',
      'stages.inputNameDuplicate': '输入名不能重复。',
      'stages.inputNameRequired': '请填写输入名。',
      'stages.parameterNameRequired': '请填写参数名。',
      'stages.parameterNameInvalid': '参数名只能使用字母、数字和下划线，且不能以数字开头。',
      'stages.parameterNameDuplicate': '参数名不能重复。',
      'stages.nameConflict': '输入、输出和参数的名字不能重复。',
      'stages.inputCount': '{n} 个输入',
      'stages.parameterCount': '{n} 个参数',
      'templates.bindings': '输入与参数接线',
      'templates.bindingsHint': '输入与参数的取值必须来自上方阶段的输出/参数，或模板的全局参数。',
      'templates.bindingInput': '输入',
      'templates.bindingParameter': '参数',
      'templates.bindingSource': '来源',
      'templates.bindingUnbound': '选择来源…',
      'templates.bindingUseDefault': '使用默认值（{value}）',
      'templates.bindingOutputs': '上游输出',
      'templates.bindingParameters': '上游参数',
      'templates.bindingGlobals': '全局参数',
      'templates.bindingRequired': '输入 {name} 必须绑定来源。',
      'templates.bindingInvalid': '「{name}」的来源无效，请重新选择。',
      'templates.bindingNoSources': '上方没有可用来源：先添加带输出的阶段，或声明全局参数。',
      'templates.bindingNoInputs': '该阶段没有声明输入',
      'templates.bindingNoParameters': '该阶段没有声明参数',
      'templates.bindingDefaultValue': '默认 {value}',
      'templates.bindingTypeMismatch': '「{name}」的来源类型不匹配：需要 {expected}，来源是 {actual}。',
      'templates.bindingOptionalHint': '可选输入，未绑定时占位符保持原样。',
      'datasets.title': '数据集',
      'datasets.kicker': 'DATASET HUB',
      'datasets.subtitle': '导入 JSONL 或 CSV，也可以直接粘贴或编辑数据内容。',
      'datasets.new': '新建数据集',
      'datasets.search': '搜索数据集或字段',
      'datasets.empty': '还没有数据集',
      'datasets.emptyHint': '添加本地 JSONL/CSV 文件，或直接编辑文本创建数据集。',
      'datasets.emptyAction': '创建第一个数据集',
      'datasets.newTitle': '新建数据集',
      'datasets.editTitle': '编辑数据集',
      'datasets.name': '数据集名称',
      'datasets.namePlaceholder': '例如：GSM8K test',
      'datasets.nameRequired': '请填写数据集名称。',
      'datasets.description': '数据集说明',
      'datasets.descriptionPlaceholder': '记录来源、规模或用途（可选）',
      'datasets.detectedFormat': '识别格式',
      'datasets.autoDetectPending': '等待内容',
      'datasets.autoDetectHint': '根据文件扩展名或内容自动判断，无需手动选择',
      'datasets.jsonl': 'JSONL',
      'datasets.csv': 'CSV',
      'datasets.import': '添加本地文件',
      'datasets.drop': '拖拽 .jsonl 或 .csv 文件到这里，或点击选择文件（格式自动识别）',
      'datasets.replaceFile': '更换文件',
      'datasets.editor': '内容编辑',
      'datasets.editorHint': 'JSONL 每行一个 JSON 对象；CSV 第一行为表头。格式会根据扩展名或内容自动识别。',
      'datasets.contentPlaceholderJsonl': '例如：\n{"query":"推荐几款适合新手的机械键盘"}\n{"query":"如何提高英语听力？"}',
      'datasets.contentPlaceholderCsv': '例如：\nquery\n推荐几款适合新手的机械键盘\n如何提高英语听力？',
      'datasets.preview': '数据预览',
      'datasets.noPreview': '有内容后这里会显示预览。',
      'datasets.parseError': '解析失败：{message}',
      'datasets.saved': '数据集已保存',
      'datasets.deleted': '数据集已删除',
      'datasets.deleteTitle': '删除这个数据集？',
      'datasets.deleteBody': '引用它的任务会保留数据集名称快照，但再次运行时将无法导出数据集文件。',
      'datasets.source': '来源',
      'datasets.raw': '原始内容',
      'datasets.previewTitle': '数据集预览',
      'datasets.emptyRaw': '请粘贴内容或导入文件。',
      'datasets.fileTooLarge': '文件不能超过 8 MB。',
      'datasets.unsupported': '仅支持 .jsonl 和 .csv 文件。',
      'datasets.openFolder': '打开数据集目录',
      'datasets.folderOpened': '已打开数据集目录',
      'datasets.folderOpenFailed': '无法打开数据集目录：{message}',
      'datasets.noRows': '数据集至少需要 1 行数据。',
      'datasets.readError': '无法读取文件。',
      'datasets.rowsTotal': '总行数',
      'datasets.columnsTotal': '字段数',
      'run.pending': '等待中',
      'run.running': '运行中',
      'run.completed': '已完成',
      'run.failed': '失败',
      'run.stopped': '已停止',
      'run.exitCode': '退出码',
      'run.started': '开始',
      'run.ended': '结束',
      'run.duration': '耗时',
      'run.stdout': '标准输出',
      'run.stderr': '标准错误',
      'run.noOutput': '暂无输出',
      'run.groups': '分组',
      'run.commandLine': '执行命令',
      'run.live': '实时',
      'run.select': '查看运行',
      'run.noSelection': '选择一次运行查看详情。',
      'run.output': '输出',
      'run.log': '日志',
      'run.stageLog': '阶段日志',
      'run.logStdout': '标准输出',
      'run.logStderr': '标准错误',
      'run.logEmpty': '暂无日志输出',
      'run.copyLog': '复制日志',
      'run.copied': '已复制',
      'run.copyFailed': '复制失败',
      'run.exportResults': '导出结果',
      'run.exportLog': '导出日志',
      'run.outputFiles': '输出文件',
      'run.outputDir': '输出目录',
      'run.downloadFile': '下载文件',
      'run.outputEmpty': '这个阶段还没有输出文件。',
      'run.outputHint': '阶段可以从 TECHHUB_OUTPUT_DIR 读取自己的输出目录。',
      'run.previewUnavailable': '该文件类型无法预览，请下载查看。',
      'run.fileTooLarge': '文件较大，请下载查看。',
      'run.outputLoadFailed': '无法加载输出目录：{message}',
      'run.workingDirectory': '工作目录',
      'run.failedMessage': '运行失败',
      'run.runningMessage': '正在执行',
      'run.completedMessage': '全部阶段执行完成',
      'run.stoppedMessage': '任务已停止',
      'run.stageFailed': '阶段「{name}」执行失败',
      'run.interrupted': '服务重启时中断',
      'confirm.delete': '确认删除',
      'toast.saveFailed': '保存失败：{message}',
      'toast.deleteFailed': '删除失败：{message}',
      'toast.runFailed': '无法启动任务：{message}',
      'toast.stopFailed': '无法停止任务：{message}',
      'toast.loadFailed': '加载失败：{message}',
      'errors.required': '请填写必填项。',
    };

    const EN = {
      panel: 'TechHub',
      title: 'TechHub',
      subtitle: 'Evaluation task workspace',
      'tab.tasks': 'Tasks',
      'tab.templates': 'Templates',
      'tab.stages': 'Stages',
      'tab.datasets': 'Datasets',
      'tab.docs': 'Docs',
      'theme.title': 'Theme',
      'theme.subtitle': 'Choose a preset color theme and apply it to TechHub immediately.',
      'theme.default': 'Default',
      'theme.defaultHint': 'Follow the current DSH theme',
      'theme.blue': 'Ocean blue',
      'theme.blueHint': 'Crisp technical blue',
      'theme.emerald': 'Emerald',
      'theme.emeraldHint': 'Calm green tones',
      'theme.amber': 'Amber',
      'theme.amberHint': 'Warm orange tones',
      'theme.violet': 'Violet',
      'theme.violetHint': 'Soft purple tones',
      'theme.rose': 'Rose',
      'theme.roseHint': 'Restrained red tones',
      'theme.saved': 'Theme updated',
      'theme.saveFailed': 'Could not save theme: {message}',
      'theme.current': 'Current',
      'language.title': 'Language',
      'language.auto': 'Auto',
      'language.zh': '中文',
      'language.en': 'English',
      'language.saved': 'Language updated',
      'language.saveFailed': 'Could not save language: {message}',
      'docs.kicker': 'Agent Skill',
      'docs.title': 'Documentation',
      'docs.subtitle': 'Read, edit and save the TechHub skill this plugin registers for agents.',
      'docs.edit': 'Edit documentation',
      'docs.readonly': 'Read only',
      'docs.readonlyHint': 'Choose Edit documentation to make changes.',
      'docs.save': 'Save documentation',
      'docs.saving': 'Saving…',
      'docs.saved': 'Documentation saved',
      'docs.saveFailed': 'Save failed: {message}',
      'docs.loadFailed': 'Could not load documentation: {message}',
      'docs.loading': 'Loading documentation…',
      'docs.characters': '{n} characters',
      'docs.unsaved': 'Unsaved changes',
      'docs.savedHint': 'Saved',
      'docs.editHint': 'Markdown is supported. Ctrl/Cmd + S saves.',
      'docs.placeholder': '# TechHub Agent Guide\n\nWrite the guide here…',
      'docs.editorLabel': 'Documentation content',
      'common.create': 'Create',
      'common.edit': 'Edit',
      'common.delete': 'Delete',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.saving': 'Saving…',
      'common.close': 'Close',
      'common.preview': 'Preview',
      'common.run': 'Run',
      'common.stop': 'Stop',
      'common.search': 'Search',
      'common.refresh': 'Refresh',
      'common.retry': 'Retry',
      'common.loading': 'Loading…',
      'common.all': 'All',
      'common.confirm': 'Confirm',
      'common.back': 'Back',
      'common.none': 'None',
      'common.updated': 'Updated',
      'common.created': 'Created',
      'common.deleteTitle': 'Delete this item?',
      'common.deleteIrreversible': 'This action cannot be undone.',
      'common.actions': 'Actions',
      'common.networkError': 'Could not reach the TechHub service. Try again.',
      'common.notFound': 'This item no longer exists.',
      'common.rows': '{n} rows',
      'common.columns': '{n} columns',
      'common.optional': 'Optional',
      'common.noDescription': 'No description',
      'workspace.title': 'Results workspace',
      'workspace.subtitle': 'Choose where run results, stage logs and dataset snapshots are stored.',
      'workspace.path': 'Workspace path',
      'workspace.placeholder': 'e.g. D:\\experiments\\techhub',
      'workspace.hint': 'Enter an absolute path. Results are written under this directory in runs/<run-id>/: run.json, per-stage stdout/stderr logs and the dataset snapshot.',
      'workspace.defaultPath': 'Default path: {path}',
      'workspace.useDefault': 'Use default path',
      'workspace.current': 'Results will be written to',
      'workspace.saved': 'Results workspace updated',
      'workspace.saveFailed': 'Could not set workspace: {message}',
      'workspace.absolute': 'Enter an absolute path, for example D:\\experiments\\techhub.',
      'workspace.resetTitle': 'Reset workspace',
      'workspace.resetHint': 'Clear every task and run record, and delete the run results under the current workspace runs directory. Templates and datasets are kept. This cannot be undone.',
      'workspace.resetConfirm': 'Reset now',
      'workspace.resetBusy': 'Resetting…',
      'workspace.resetDone': 'Workspace reset',
      'workspace.resetFailed': 'Reset failed: {message}',
      'workspace.cleanupFailed': 'Task data was cleared, but some result files could not be deleted: {message}',
      'workspace.bundleTitle': 'Workspace import / export',
      'workspace.bundleHint': 'Export datasets, templates and script files from this workspace. Tasks and run results are excluded by default. Import replaces the current datasets and templates.',
      'workspace.includeTasks': 'Include tasks and run results',
      'workspace.includeTasksHint': 'Off by default. When enabled, tasks and the runs directory are exported too.',
      'workspace.export': 'Export workspace',
      'workspace.import': 'Import workspace',
      'workspace.exporting': 'Exporting…',
      'workspace.importing': 'Importing…',
      'workspace.importConfirm': 'Importing replaces the current workspace datasets, templates, tasks and run results. If the bundle has no tasks, tasks and run results are cleared. Continue?',
      'workspace.exportFailed': 'Export failed: {message}',
      'workspace.importFailed': 'Import failed: {message}',
      'workspace.imported': 'Workspace imported',
      'run.resultsDir': 'Results directory',
      'status.idle': 'Not run',
      'status.pending': 'Pending',
      'status.running': 'Running',
      'status.completed': 'Completed',
      'status.failed': 'Failed',
      'status.stopped': 'Stopped',
      'tasks.title': 'Tasks',
      'tasks.kicker': 'TASK MANAGEMENT',
      'tasks.subtitle': 'Create evaluation runs and give each Control and Treatment group its own stage commands.',
      'tasks.new': 'New task',
      'tasks.search': 'Search tasks, templates or datasets',
      'tasks.empty': 'No evaluation tasks yet',
      'tasks.emptyHint': 'Build a task from a template, then add one Control group and any number of Treatment groups.',
      'tasks.emptyAction': 'Create your first task',
      'tasks.total': 'Total tasks',
      'tasks.running': 'Running',
      'tasks.templates': 'Templates',
      'tasks.datasets': 'Datasets',
      'tasks.control': 'Control group',
      'tasks.treatment': 'Treatment group',
      'tasks.groups': '{n} groups',
      'tasks.stages': '{n} stages',
      'tasks.stagesProgress': '{done}/{total} stages',
      'tasks.stagesLabel': 'Stages',
      'tasks.noDataset': 'No dataset',
      'tasks.run': 'Run task',
      'tasks.runAgain': 'Run again',
      'tasks.stop': 'Stop run',
      'tasks.detail': 'Task detail',
      'tasks.latestRun': 'Latest run',
      'tasks.history': 'Run history',
      'tasks.noRun': 'This task has not run yet.',
      'tasks.runStarted': 'Task started',
      'tasks.runStopped': 'Task stopped',
      'tasks.saved': 'Task saved',
      'tasks.deleted': 'Task deleted',
      'tasks.deleteTitle': 'Delete this task?',
      'tasks.deleteBody': 'The task configuration and its run history will be removed. Dataset files already exported to disk are kept.',
      'tasks.name': 'Task name',
      'tasks.namePlaceholder': 'e.g. Math-500 baseline comparison',
      'tasks.nameRequired': 'Enter a task name.',
      'tasks.description': 'Description',
      'tasks.descriptionPlaceholder': 'Goal, variables and metrics for this evaluation (optional)',
      'tasks.dataset': 'Dataset',
      'tasks.datasetHint': 'The dataset is materialized as JSONL/CSV at run time and exposed through TECHHUB_DATASET_PATH.',
      'tasks.datasetFromTemplate': 'Dataset: {name} (from template)',
      'tasks.datasetTemplateEmpty': 'This template has no dataset',
      'tasks.datasetTemplatePick': 'Pick a template to inherit its dataset',
      'datasets.deleteUsedBody': 'Used by {n} templates; deleting it clears their dataset.',
      'tasks.cwd': 'Working directory',
      'tasks.cwdPlaceholder': 'Leave empty to use the DSH default directory',
      'tasks.cwdHint': 'Commands run in this directory; relative paths are supported.',
      'tasks.groupsTitle': 'Groups',
      'tasks.groupsHint': 'A task needs exactly one Control group and may add one or more Treatment groups.',
      'tasks.addTreatment': 'Add Treatment group',
      'tasks.treatmentN': 'Treatment {n}',
      'tasks.groupName': 'Group name',
      'tasks.template': 'Task template',
      'tasks.templatePlaceholder': 'Choose a task template',
      'tasks.templateMissing': 'Template deleted',
      'tasks.applyTemplate': 'Re-apply template',
      'tasks.applyTemplateHint': 'Rebuild this group’s stage snapshot from the current template, overwriting edited commands. Applies when you save.',
      'tasks.parameterTypeInvalid': 'Global parameter {{key}} must be a {type} value.',
      'tasks.noStageConfig': 'Choose a template to generate editable stage commands here.',
      'tasks.command': 'Command',
      'tasks.commandPlaceholder': 'e.g. python eval.py',
      'tasks.args': 'Arguments',
      'tasks.argsPlaceholder': 'e.g. --limit 100 --split test',
      'tasks.stage': 'Stage',
      'tasks.groupIncomplete': 'Every group needs a template and a command for every stage.',
      'tasks.templateRequired': 'Choose a template for every group.',
      'tasks.stageRequired': 'Every group needs at least one stage.',
      'tasks.stageCommandRequired': 'Enter a command for every stage.',
      'tasks.envHint': 'Groups start together and stages run serially within each group. Commands can read TECHHUB_OUTPUT_DIR, TECHHUB_GROUP_ROLE, TECHHUB_GROUP_ID, TECHHUB_STAGE_ID and related variables.',
      'tasks.parameters': 'Global parameters',
      'tasks.parametersHint': '{{KEY}} in commands and arguments is replaced with this group’s value at run time.',
      'tasks.parameterValue': 'Value',
      'tasks.parameterDefault': 'Default',
      'tasks.noParameters': 'This template has no global parameters.',
      'tasks.parameterPlaceholder': 'e.g. baseline',
      'tasks.openFolder': 'Open folder',
      'tasks.openTaskFolder': 'Open task results folder',
      'tasks.openGroupFolder': 'Open group folder',
      'tasks.openStageFolder': 'Open stage folder',
      'tasks.folderOpened': 'Folder opened',
      'tasks.folderOpenFailed': 'Could not open folder: {message}',
      'tasks.noResultFolder': 'This task has no results folder yet',
      'tasks.newTitle': 'New evaluation task',
      'tasks.editTitle': 'Edit evaluation task',
      'tasks.runStatus': 'Run status',
      'templates.title': 'Templates',
      'templates.kicker': 'TEMPLATE LIBRARY',
      'templates.subtitle': 'Pick stages from the library and order them into a reusable evaluation flow.',
      'templates.new': 'New template',
      'templates.search': 'Search templates or stages',
      'templates.empty': 'No task templates yet',
      'templates.emptyHint': 'Pick stages from the library to build a flow, then override commands and arguments per group in a task.',
      'templates.emptyAction': 'Create your first template',
      'templates.newTitle': 'New task template',
      'templates.editTitle': 'Edit task template',
      'templates.name': 'Template name',
      'templates.namePlaceholder': 'e.g. GSM8K reasoning evaluation',
      'templates.nameRequired': 'Enter a template name.',
      'templates.description': 'Description',
      'templates.descriptionPlaceholder': 'Models, data or metrics this template applies to (optional)',
      'templates.dataset': 'Template dataset',
      'templates.datasetHint': 'The template declares the dataset it evaluates; tasks inherit it, and each group gets its own copy at run time.',
      'templates.noDataset': 'No dataset',
      'templates.datasetMissing': 'Dataset deleted',
      'templates.parameters': 'Global parameters',
      'templates.parametersHint': 'Reference a parameter as {{KEY}} in stage commands or arguments; tasks supply the actual value per group.',
      'templates.addParameter': 'Add parameter',
      'templates.parameterKey': 'Key',
      'templates.parameterDefault': 'Default value',
      'templates.parameterDescription': 'Description',
      'templates.parameterKeyPlaceholder': 'e.g. MODEL',
      'templates.parameterDefaultPlaceholder': 'e.g. baseline',
      'templates.parameterDescriptionPlaceholder': 'What this parameter controls (optional)',
      'templates.parameterKeyRequired': 'Enter a parameter key.',
      'templates.parameterKeyInvalid': 'Keys may contain letters, digits and underscores, and cannot start with a digit.',
      'templates.parameterKeyDuplicate': 'Parameter keys must be unique.',
      'templates.parameterCount': '{n} parameters',
      'templates.noParameters': 'No global parameters',
      'templates.stages': 'Stage sequence',
      'templates.pipeline': 'Data pipeline',
      'templates.openFolder': 'Open template folder',
      'templates.folderOpened': 'Template folder opened',
      'templates.folderOpenFailed': 'Could not open the template folder: {message}',
      'templates.stagesHint': 'Stages run serially from top to bottom. Stage content lives on the Stages page; this editor only picks and orders them.',
      'templates.addStage': 'Add stage',
      'templates.stageName': 'Stage name',
      'templates.stageNamePlaceholder': 'e.g. Prepare environment',
      'templates.stageCommand': 'Command',
      'templates.stageCommandPlaceholder': 'e.g. python prepare.py',
      'templates.stageArgs': 'Default arguments',
      'templates.stageArgsPlaceholder': 'e.g. --model baseline',
      'templates.stageArgsHint': 'Default arguments are copied into tasks and can be overridden in a task group.',
      'templates.stageDescription': 'Stage notes',
      'templates.stageDescriptionPlaceholder': 'What this stage does (optional)',
      'templates.moveUp': 'Move up',
      'templates.moveDown': 'Move down',
      'templates.removeStage': 'Remove stage',
      'templates.dragHandle': 'Drag to reorder stage',
      'templates.dragHint': 'Drag the left handle to reorder stages, or use the arrow buttons for small adjustments.',
      'templates.outputs': 'Exposed outputs',
      'templates.outputsHint': 'Map output files to external names. Only configured files can be referenced by downstream stages.',
      'templates.addOutput': 'Add output',
      'templates.outputFile': 'Output file',
      'templates.outputName': 'External name',
      'templates.outputFilePlaceholder': 'e.g. result.json',
      'templates.outputNamePlaceholder': 'e.g. result',
      'templates.outputRequired': 'Enter both an output file and an external name.',
      'templates.outputNameInvalid': 'External names may contain letters, digits and underscores, and cannot start with a digit.',
      'templates.outputNameDuplicate': 'External names must be unique within a stage.',
      'templates.outputFileInvalid': 'Output files must be relative to the output directory and cannot use absolute paths or ..',
      'templates.noOutputs': 'No exposed outputs yet',
      'templates.inputs': 'Input references',
      'templates.inputsHint': 'Add a reference, choose an upstream stage and output, then use {{key}} in commands; it is replaced with the actual absolute path (forward slashes on Windows). Quote it in the command.',
      'templates.addInputRef': 'Add input reference',
      'templates.inputKey': 'Reference key',
      'templates.inputKeyPlaceholder': 'e.g. normalized',
      'templates.inputStage': 'Upstream stage',
      'templates.inputOutput': 'Output',
      'templates.inputKeyRequired': 'Enter a reference key.',
      'templates.inputKeyInvalid': 'Reference keys may contain letters, digits and underscores, and cannot start with a digit.',
      'templates.inputKeyDuplicate': 'Reference keys must be unique within a stage.',
      'templates.inputKeyConflict': 'Reference keys cannot collide with global parameter keys.',
      'templates.inputStageRequired': 'Choose an upstream stage and output.',
      'templates.noOutputsToReference': 'No upstream stage has exposed outputs yet',
      'templates.noInputRefs': 'No input references yet',
      'templates.noUpstream': 'No upstream stage has exposed outputs yet',
      'templates.previewInputs': 'Input references',
      'templates.previewOutputs': 'Exposed outputs',
      'templates.stageNameDuplicate': 'Stage names must be unique within a template.',
      'templates.inputRefInvalid': 'An input reference is invalid. Select upstream outputs again.',
      'templates.stageCount': '{n} stages',
      'templates.usedBy': '{n} tasks use this',
      'templates.stageRequired': 'Add at least one stage.',
      'templates.commandRequired': 'Enter a command for every stage.',
      'templates.saved': 'Template saved',
      'templates.deleted': 'Template deleted',
      'templates.deleteTitle': 'Delete this template?',
      'templates.deleteBody': 'Tasks that reference it keep the stage snapshot captured when they were created.',
      'templates.noStages': 'No stages yet',
      'templates.stageN': 'Stage {n}',
      'templates.previewTitle': 'Template detail',
      'templates.previewAction': 'Preview template',
      'templates.previewStages': 'Stage details',
      'templates.defaultArgs': 'Default arguments',
      'templates.noDefaultArgs': 'No default arguments',
      'templates.previewUsage': '{n} tasks reference this',
      'templates.orderLabel': 'Execution order',
      'templates.pickStage': 'Add from stage library',
      'templates.pickStagePlaceholder': 'Pick a stage…',
      'templates.addPickedStage': 'Add stage',
      'templates.noMoreStages': 'No more stages available in the library',
      'templates.stageLibraryEmpty': 'The stage library is empty. Create stages on the Stages page first.',
      'templates.noStagesHint': 'No stages yet — pick one from the library above to add it to the flow.',
      'templates.stageMissing': 'Stage deleted',
      'templates.stageRefHint': 'Stage content is maintained on the Stages page; here you only order stages and wire input references.',
      'templates.stageRefCommand': 'Command',
      'stages.kicker': 'STAGE LIBRARY',
      'stages.title': 'Stages',
      'stages.subtitle': 'Maintain reusable stage commands; templates may only reference stages from this library.',
      'stages.new': 'New stage',
      'stages.search': 'Search stage name, notes or command',
      'stages.empty': 'The stage library is empty',
      'stages.emptyHint': 'Define a stage (command, arguments and exposed outputs) first, then compose templates from it.',
      'stages.emptyAction': 'Create your first stage',
      'stages.newTitle': 'New stage',
      'stages.editTitle': 'Edit stage',
      'stages.name': 'Stage name',
      'stages.namePlaceholder': 'e.g. Normalize query',
      'stages.nameRequired': 'Enter a stage name.',
      'stages.nameDuplicate': 'Stage names must be unique.',
      'stages.description': 'Stage notes',
      'stages.descriptionPlaceholder': 'What this stage does (optional)',
      'stages.command': 'Command',
      'stages.commandRequired': 'Enter a command.',
      'stages.commandPlaceholder': 'e.g. node "%TECHHUB_WORKSPACE%/scripts/clean.js" "@@input@@"',
      'stages.commandHint': 'The command and its arguments are one field; reference stage inputs, outputs and parameters as @@name@@.',
      'stages.commandUnknownRefs': 'The command references undeclared names: {names}. Declare them as an input, output or parameter first.',
      'stages.args': 'Default arguments',
      'stages.outputs': 'Exposed outputs',
      'stages.outputsHint': 'Only files registered here can be referenced by downstream stages; write them under the stage output/ directory.',
      'stages.noOutputs': 'No exposed outputs yet',
      'stages.addOutput': 'Add output',
      'stages.saved': 'Stage saved',
      'stages.deleted': 'Stage deleted',
      'stages.deleteTitle': 'Delete this stage?',
      'stages.deleteBody': 'This cannot be undone.',
      'stages.deleteUsedBody': '{n} templates reference this stage. They lose it on delete; existing tasks keep their snapshot.',
      'stages.usedBy': '{n} templates use this',
      'stages.unused': 'Not used by any template',
      'stages.previewTitle': 'Stage detail',
      'stages.previewCommand': 'Command',
      'stages.previewArgs': 'Default arguments',
      'stages.previewOutputs': 'Exposed outputs',
      'stages.previewUsage': 'Templates using this stage',
      'stages.previewNoUsage': 'No template uses this stage yet',
      'stages.outputCount': '{n} outputs',
      'stages.count': '{n} stages',
      'stages.openFolder': 'Open stage folder',
      'stages.folderOpened': 'Stage folder opened',
      'stages.folderOpenFailed': 'Could not open the stage folder: {message}',
      'stages.asset': 'Submitted file / folder',
      'stages.assetHint': 'The command runs in the root of the submission, and that root contains everything you submitted (@@work_dir@@ points there too).',
      'stages.assetPickFile': 'Choose file',
      'stages.assetPickFolder': 'Choose folder',
      'stages.assetClear': 'Clear',
      'stages.assetEmpty': 'Nothing submitted — the command runs in the task working directory.',
      'stages.assetBusy': 'Uploading…',
      'stages.assetTooLarge': 'A submission cannot exceed 64 MB.',
      'stages.assetTooMany': 'A submission cannot exceed 1000 files.',
      'stages.assetUploadFailed': 'Upload failed: {message}',
      'stages.assetFiles': '{n} files',
      'stages.assetFile': 'file',
      'stages.assetFolder': 'folder',
      'stages.inputs': 'Inputs',
      'stages.inputsHint': 'Values the stage consumes; reference them as {{name}} in the command. Templates choose where each input comes from.',
      'stages.noInputs': 'No inputs declared',
      'stages.addInput': 'Add input',
      'stages.inputName': 'Input name',
      'stages.inputNamePlaceholder': 'e.g. query',
      'stages.parameters': 'Parameters',
      'stages.parametersHint': 'Stage parameters with defaults; a template may take the value from an upstream stage or a global parameter instead.',
      'stages.noParameters': 'No parameters declared',
      'stages.addParameter': 'Add parameter',
      'stages.parameterName': 'Parameter name',
      'stages.parameterNamePlaceholder': 'e.g. WEIGHT',
      'stages.parameterDefault': 'Default',
      'stages.parameterDefaultPlaceholder': 'e.g. 1.25',
      'stages.parameterDescriptionPlaceholder': 'What this parameter controls (optional)',
      'stages.ioHint': '@@name@@ in the command is replaced with the input/parameter/output value.',
      'stages.type': 'Type',
      'stages.typeString': 'Text',
      'stages.typeNumber': 'Number',
      'stages.typeBoolean': 'Boolean',
      'stages.typeJson': 'JSON',
      'stages.typeFile': 'File',
      'stages.typeDirectory': 'Directory',
      'stages.required': 'Required',
      'stages.requiredHint': 'A required input must be bound in every template; clear it to make the input optional.',
      'stages.optional': 'Optional',
      'stages.timeout': 'Timeout (s)',
      'stages.timeoutHint': '0 means no limit; on timeout the host terminates the stage and marks it failed.',
      'stages.timeoutInvalid': 'The timeout must be 0 or a positive number of seconds.',
      'stages.defaultInvalid': 'The default value of parameter “{name}” does not match its {type} type.',
      'stages.builtinNameConflict': '“{name}” is a built-in variable name and cannot be used as a port.',
      'stages.builtins': 'Built-in variables',
      'stages.builtinsHint': 'These are always available in the command, no declaration needed:',
      'stages.commandUnclosed': 'The @@ placeholders in the command are not closed.',
      'stages.commandEmptyRef': 'The command contains an empty @@placeholder@@.',
      'stages.commandMultilineRef': 'A placeholder cannot span lines: {name}.',
      'stages.inputNameDuplicate': 'Input names must be unique.',
      'stages.inputNameRequired': 'Enter an input name.',
      'stages.parameterNameRequired': 'Enter a parameter name.',
      'stages.parameterNameInvalid': 'Parameter names may contain letters, digits and underscores, and cannot start with a digit.',
      'stages.parameterNameDuplicate': 'Parameter names must be unique.',
      'stages.nameConflict': 'Input, output and parameter names must be unique.',
      'stages.inputCount': '{n} inputs',
      'stages.parameterCount': '{n} parameters',
      'templates.bindings': 'Inputs and parameters',
      'templates.bindingsHint': 'Inputs and parameters must come from an earlier stage’s output/parameter, or from a template global parameter.',
      'templates.bindingInput': 'Input',
      'templates.bindingParameter': 'Parameter',
      'templates.bindingSource': 'Source',
      'templates.bindingUnbound': 'Choose a source…',
      'templates.bindingUseDefault': 'Use default ({value})',
      'templates.bindingOutputs': 'Upstream outputs',
      'templates.bindingParameters': 'Upstream parameters',
      'templates.bindingGlobals': 'Global parameters',
      'templates.bindingRequired': 'Input {name} must be bound to a source.',
      'templates.bindingInvalid': 'The source of “{name}” is invalid. Choose again.',
      'templates.bindingNoSources': 'No source available: add a stage with outputs above, or declare a global parameter.',
      'templates.bindingNoInputs': 'This stage declares no inputs',
      'templates.bindingNoParameters': 'This stage declares no parameters',
      'templates.bindingDefaultValue': 'default {value}',
      'templates.bindingTypeMismatch': 'The source of “{name}” has an incompatible type: expected {expected}, got {actual}.',
      'templates.bindingOptionalHint': 'Optional input — the placeholder is left as-is when unbound.',
      'datasets.title': 'Datasets',
      'datasets.kicker': 'DATASET HUB',
      'datasets.subtitle': 'Import JSONL or CSV, or paste and edit the data directly.',
      'datasets.new': 'New dataset',
      'datasets.search': 'Search datasets or fields',
      'datasets.empty': 'No datasets yet',
      'datasets.emptyHint': 'Add a local JSONL/CSV file, or create one by editing text directly.',
      'datasets.emptyAction': 'Create your first dataset',
      'datasets.newTitle': 'New dataset',
      'datasets.editTitle': 'Edit dataset',
      'datasets.name': 'Dataset name',
      'datasets.namePlaceholder': 'e.g. GSM8K test',
      'datasets.nameRequired': 'Enter a dataset name.',
      'datasets.description': 'Description',
      'datasets.descriptionPlaceholder': 'Source, scale or purpose (optional)',
      'datasets.detectedFormat': 'Detected format',
      'datasets.autoDetectPending': 'Waiting for content',
      'datasets.autoDetectHint': 'Detected from the file extension or content; no manual choice needed',
      'datasets.jsonl': 'JSONL',
      'datasets.csv': 'CSV',
      'datasets.import': 'Add local file',
      'datasets.drop': 'Drop a .jsonl or .csv file here, or click to choose a file (format auto-detected)',
      'datasets.replaceFile': 'Replace file',
      'datasets.editor': 'Content',
      'datasets.editorHint': 'JSONL: one JSON object per line. CSV: the first row is the header. Format is auto-detected from the extension or content.',
      'datasets.contentPlaceholderJsonl': 'For example:\n{"query":"Recommend a mechanical keyboard for beginners"}\n{"query":"How can I improve my English listening?"}',
      'datasets.contentPlaceholderCsv': 'For example:\nquery\nRecommend a mechanical keyboard for beginners\nHow can I improve my English listening?',
      'datasets.preview': 'Preview',
      'datasets.noPreview': 'A preview appears here once there is content.',
      'datasets.parseError': 'Parse failed: {message}',
      'datasets.saved': 'Dataset saved',
      'datasets.deleted': 'Dataset deleted',
      'datasets.deleteTitle': 'Delete this dataset?',
      'datasets.deleteBody': 'Tasks that reference it keep the dataset name snapshot, but future runs cannot export its file.',
      'datasets.source': 'Source',
      'datasets.raw': 'Raw content',
      'datasets.previewTitle': 'Dataset preview',
      'datasets.emptyRaw': 'Paste content or import a file.',
      'datasets.fileTooLarge': 'Files must be 8 MB or smaller.',
      'datasets.unsupported': 'Only .jsonl and .csv files are supported.',
      'datasets.openFolder': 'Open dataset folder',
      'datasets.folderOpened': 'Dataset folder opened',
      'datasets.folderOpenFailed': 'Could not open dataset folder: {message}',
      'datasets.noRows': 'A dataset needs at least one data row.',
      'datasets.readError': 'Could not read the file.',
      'datasets.rowsTotal': 'Rows',
      'datasets.columnsTotal': 'Fields',
      'run.pending': 'Pending',
      'run.running': 'Running',
      'run.completed': 'Completed',
      'run.failed': 'Failed',
      'run.stopped': 'Stopped',
      'run.exitCode': 'Exit code',
      'run.started': 'Started',
      'run.ended': 'Ended',
      'run.duration': 'Duration',
      'run.stdout': 'stdout',
      'run.stderr': 'stderr',
      'run.noOutput': 'No output yet',
      'run.groups': 'Groups',
      'run.commandLine': 'Command',
      'run.live': 'Live',
      'run.select': 'View run',
      'run.noSelection': 'Select a run to see details.',
      'run.output': 'Output',
      'run.log': 'Log',
      'run.stageLog': 'Stage log',
      'run.logStdout': 'stdout',
      'run.logStderr': 'stderr',
      'run.logEmpty': 'No log output yet',
      'run.copyLog': 'Copy log',
      'run.copied': 'Copied',
      'run.copyFailed': 'Copy failed',
      'run.exportResults': 'Export results',
      'run.exportLog': 'Export log',
      'run.outputFiles': 'Output files',
      'run.outputDir': 'Output directory',
      'run.downloadFile': 'Download file',
      'run.outputEmpty': 'This stage has no output files yet.',
      'run.outputHint': 'Stages can use TECHHUB_OUTPUT_DIR to write their own outputs.',
      'run.previewUnavailable': 'This file type cannot be previewed. Download it to inspect it.',
      'run.fileTooLarge': 'This file is too large to preview. Download it instead.',
      'run.outputLoadFailed': 'Could not load the output directory: {message}',
      'run.workingDirectory': 'Working directory',
      'run.failedMessage': 'Run failed',
      'run.runningMessage': 'Running',
      'run.completedMessage': 'All stages completed',
      'run.stoppedMessage': 'Run stopped',
      'run.stageFailed': 'Stage "{name}" failed',
      'run.interrupted': 'Interrupted by a service restart',
      'confirm.delete': 'Delete',
      'toast.saveFailed': 'Save failed: {message}',
      'toast.deleteFailed': 'Delete failed: {message}',
      'toast.runFailed': 'Could not start task: {message}',
      'toast.stopFailed': 'Could not stop task: {message}',
      'toast.loadFailed': 'Load failed: {message}',
      'errors.required': 'Fill in the required fields.',
    };

    const THEME_PRESETS = [
      { id: 'default', label: 'theme.default', hint: 'theme.defaultHint', colors: ['#64748b', '#94a3b8', '#cbd5e1'] },
      { id: 'blue', label: 'theme.blue', hint: 'theme.blueHint', colors: ['#2563eb', '#60a5fa', '#dbeafe'] },
      { id: 'emerald', label: 'theme.emerald', hint: 'theme.emeraldHint', colors: ['#059669', '#34d399', '#d1fae5'] },
      { id: 'amber', label: 'theme.amber', hint: 'theme.amberHint', colors: ['#b45309', '#f59e0b', '#fef3c7'] },
      { id: 'violet', label: 'theme.violet', hint: 'theme.violetHint', colors: ['#6d28d9', '#a78bfa', '#ede9fe'] },
      { id: 'rose', label: 'theme.rose', hint: 'theme.roseHint', colors: ['#be123c', '#fb7185', '#ffe4e6'] },
    ];

    const ICON_PATHS = {
      plus: ['M12 5v14', 'M5 12h14'],
      edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
      trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
      play: ['M8 5.5v13L19 12Z'],
      stop: ['M7 6h10v12H7Z'],
      search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
      refresh: ['M20 6v5h-5', 'M4 18v-5h5', 'M5.6 9A7.5 7.5 0 0 1 19 7l1 4', 'M18.4 15A7.5 7.5 0 0 1 5 17l-1-4'],
      upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
      file: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z', 'M14 3v5h5'],
      layers: ['m12 3 9 5-9 5-9-5Z', 'm3 12 9 5 9-5', 'm3 16 9 5 9-5'],
      database: ['M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z', 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'],
      x: ['M6 6l12 12', 'M18 6 6 18'],
      'chevron-down': ['m6 9 6 6 6-6'],
      'chevron-up': ['m18 15-6-6-6 6'],
      check: ['m5 12 4.5 4.5L19 7'],
      alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
      clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
      'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
      'arrow-down': ['M12 5v14', 'm19 12-7 7-7-7'],
      terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
      folder: ['M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
      list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
      cube: ['m12 3 9 5v8l-9 5-9-5V8Z', 'm3 8 9 5 9-5', 'M12 13v8'],
      save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z', 'M17 21v-8H7v8', 'M7 3v5h8'],
      download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
      spark: ['m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z'],
      palette: ['M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a2 2 0 0 1 0-4h4a4 4 0 0 0 0-8Z', 'M7.5 9h.01', 'M10.5 6.5h.01', 'M15 7h.01'],
      info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
      filter: ['M4 5h16', 'M7 12h10', 'M10 19h4'],
      external: ['M14 4h6v6', 'M20 4 10 14', 'M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5'],
      grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
      copy: ['M9 9h10v10H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
      settings: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
    };
    const FILLED_ICONS = new Set(['play', 'stop']);

    function cx(...values) {
      return values.filter(Boolean).join(' ');
    }

    function uid(prefix) {
      const random = Math.random().toString(36).slice(2, 10);
      return `${prefix}-${Date.now().toString(36)}-${random}`;
    }

    function formatMessage(template, variables) {
      if (!variables) return template;
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        result = result.split(`{${key}}`).join(String(value));
      }
      return result;
    }

    function makeTranslate(props, language = 'auto') {
      const forced = language === 'zh' ? ZH : language === 'en' ? EN : null;
      return (key, variables) => {
        let value;
        if (forced) value = forced[key] ?? EN[key] ?? ZH[key];
        if (!forced && (typeof value !== 'string' || value === key || value === '')) {
          if (typeof props.t === 'function') {
            try {
              value = props.t(key);
            } catch {
              value = undefined;
            }
          }
        }
        if (typeof value !== 'string' || value === key || value === '') {
          value = forced ? forced[key] ?? key : ZH[key] ?? EN[key] ?? key;
        }
        return formatMessage(value, variables);
      };
    }

    function Icon({ name, size = 16, className }) {
      const paths = ICON_PATHS[name] ?? ICON_PATHS.cube;
      const filled = FILLED_ICONS.has(name);
      return h(
        'svg',
        {
          className: cx('th-icon', className),
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: filled ? 'currentColor' : 'none',
          stroke: filled ? 'none' : 'currentColor',
          strokeWidth: filled ? 0 : 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        paths.map((d, index) => h('path', { key: index, d })),
      );
    }

    function TechHubLogo({ size = 34 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          'aria-hidden': 'true',
          className: 'th-logo-svg',
        },
        h(
          'defs',
          null,
          h(
            'clipPath',
            { id: 'th-header-flask-clip' },
            h('path', { d: 'M26 12h12v12l15 24c2 3.2-.3 7-4 7H15c-3.7 0-6-3.8-4-7l15-24V12Z' }),
          ),
        ),
        h('rect', {
          x: 4,
          y: 4,
          width: 56,
          height: 56,
          rx: 16,
          fill: '#ffffff',
          stroke: '#111827',
          strokeWidth: 2.5,
        }),
        h('rect', {
          x: 12,
          y: 36,
          width: 40,
          height: 24,
          fill: '#1565c0',
          clipPath: 'url(#th-header-flask-clip)',
        }),
        h('path', {
          d: 'M26 12h12v12l15 24c2 3.2-.3 7-4 7H15c-3.7 0-6-3.8-4-7l15-24V12Z',
          fill: 'none',
          stroke: '#111827',
          strokeWidth: 3.2,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M24 12h16',
          fill: 'none',
          stroke: '#111827',
          strokeWidth: 3.2,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 29.5, cy: 29, r: 1.9, fill: '#111827' }),
        h('circle', { cx: 35, cy: 33, r: 1.1, fill: '#111827' }),
      );
    }

    function Button({ variant = 'secondary', size = 'md', icon, iconSize, children, className, ...rest }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('th-btn', `th-btn-${variant}`, `th-btn-${size}`, className),
          ...rest,
        },
        icon ? h(Icon, { name: icon, size: iconSize ?? (size === 'sm' ? 14 : 15) }) : null,
        children === undefined || children === null ? null : h('span', { className: 'th-btn-label' }, children),
      );
    }

    function IconButton({ icon, label, className, ...rest }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('th-iconbtn', className),
          'aria-label': label,
          title: label,
          ...rest,
        },
        h(Icon, { name: icon, size: 16 }),
      );
    }

    function StatusBadge({ status, t }) {
      return h(
        'span',
        { className: cx('th-badge', `th-badge-${status}`) },
        h('span', { className: 'th-badge-dot' }),
        t(`status.${status}`),
      );
    }

    function Field({ label, hint, required, children, className }) {
      return h(
        'label',
        { className: cx('th-field', className) },
        h(
          'span',
          { className: 'th-field-label' },
          label,
          required ? h('span', { className: 'th-required' }, '*') : null,
        ),
        children,
        hint ? h('span', { className: 'th-field-hint' }, hint) : null,
      );
    }

    function EmptyState({ icon, title, hint, actionLabel, onAction }) {
      return h(
        'div',
        { className: 'th-empty' },
        h('span', { className: 'th-empty-icon' }, h(Icon, { name: icon, size: 26 })),
        h('h3', null, title),
        hint ? h('p', null, hint) : null,
        actionLabel
          ? h(Button, { variant: 'primary', icon: 'plus', onClick: onAction }, actionLabel)
          : null,
      );
    }

    function Spinner({ label }) {
      return h(
        'div',
        { className: 'th-loading', role: 'status' },
        h('span', { className: 'th-spinner' }),
        h('span', null, label),
      );
    }

    function Modal({ title, subtitle, onClose, children, footer, width = 'min(880px, calc(100vw - 32px))', t, className }) {
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          onClose();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [onClose]);

      return h(
        'div',
        {
          className: 'th-modal-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'section',
          {
            className: cx('th-modal', className),
            style: { maxWidth: width },
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
          },
          h(
            'header',
            { className: 'th-modal-head' },
            h(
              'div',
              { className: 'th-modal-title' },
              h('h2', null, title),
              subtitle ? h('p', null, subtitle) : null,
            ),
            h(IconButton, { icon: 'x', label: t('common.close'), onClick: onClose }),
          ),
          h('div', { className: 'th-modal-body' }, children),
          footer ? h('footer', { className: 'th-modal-foot' }, footer) : null,
        ),
      );
    }

    function parseCsv(raw, limit) {
      const rows = [];
      let row = [];
      let field = '';
      let inQuotes = false;
      for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];
        if (inQuotes) {
          if (character === '"') {
            if (raw[index + 1] === '"') {
              field += '"';
              index += 1;
            } else {
              inQuotes = false;
            }
          } else {
            field += character;
          }
          continue;
        }
        if (character === '"') {
          inQuotes = true;
        } else if (character === ',') {
          row.push(field);
          field = '';
        } else if (character === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else if (character === '\r') {
          if (raw[index + 1] === '\n') index += 1;
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else {
          field += character;
        }
      }
      if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      const cleanRows = rows.filter((candidate) => !(candidate.length === 1 && candidate[0].trim() === ''));
      if (cleanRows.length === 0) throw new Error('CSV 内容为空');
      const columns = cleanRows[0].map((value, index) => value.trim() || `Column ${index + 1}`);
      const dataRows = cleanRows.slice(1);
      const previewRows = [];
      for (let index = 0; index < dataRows.length && index < limit; index += 1) {
        const values = dataRows[index];
        const record = {};
        for (let column = 0; column < columns.length; column += 1) record[columns[column]] = values[column] ?? '';
        previewRows.push(record);
      }
      return { columns, rows: previewRows, rowCount: dataRows.length };
    }

    function parseJsonl(raw, limit) {
      const lines = raw.split(/\r?\n/);
      const columns = [];
      const columnSet = new Set();
      const rows = [];
      let rowCount = 0;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === '') continue;
        let value;
        try {
          value = JSON.parse(line);
        } catch (error) {
          throw new Error(`第 ${index + 1} 行不是有效 JSON：${error.message}`);
        }
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`第 ${index + 1} 行必须是 JSON 对象`);
        }
        rowCount += 1;
        for (const key of Object.keys(value)) {
          if (!columnSet.has(key)) {
            columnSet.add(key);
            columns.push(key);
          }
        }
        if (rows.length < limit) rows.push(value);
      }
      return { columns, rows, rowCount };
    }

    function parseDatasetText(raw, format, limit = 2000) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        return { columns: [], rows: [], rowCount: 0, error: null };
      }
      const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      try {
        const parsed = format === 'csv' ? parseCsv(normalized, limit) : parseJsonl(normalized, limit);
        return { ...parsed, error: null };
      } catch (error) {
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    function detectDatasetFormat(raw, sourceName, fallback = 'jsonl') {
      const text = typeof raw === 'string' ? (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim() : '';
      const lower = typeof sourceName === 'string' ? sourceName.toLowerCase() : '';
      if (text === '') {
        if (lower.endsWith('.csv')) return 'csv';
        if (lower.endsWith('.jsonl')) return 'jsonl';
        return fallback;
      }
      if (text.startsWith('{')) return 'jsonl';
      const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '');
      if (firstLine) {
        try {
          const value = JSON.parse(firstLine);
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) return 'jsonl';
        } catch {
          // Not a JSON object line; fall through to extension and CSV detection.
        }
      }
      if (lower.endsWith('.csv')) return 'csv';
      if (lower.endsWith('.jsonl')) return 'jsonl';
      const asCsv = parseDatasetText(text, 'csv', 1);
      if (asCsv.error === null && asCsv.rowCount > 0) return 'csv';
      const asJsonl = parseDatasetText(text, 'jsonl', 1);
      if (asJsonl.error === null && asJsonl.rowCount > 0) return 'jsonl';
      return fallback;
    }

    function safeFilename(value, fallback = 'techhub') {
      const cleaned = String(value || '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '_')
        .trim()
        .slice(0, 80);
      return cleaned || fallback;
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read the file.'));
        reader.readAsDataURL(file);
      });
    }

    // ---- stage ports (mirrors the host's Aether-style module ports) ---------
    const PORT_VALUE_TYPES = ['string', 'number', 'boolean', 'json', 'file', 'directory'];
    const PORT_PARAMETER_TYPES = ['string', 'number', 'boolean', 'json'];
    const PORT_OUTPUT_TYPES = ['file', 'directory'];
    const STAGE_BUILTIN_NAMES = [
      'run_id',
      'run_dir',
      'task_id',
      'task_name',
      'group_id',
      'group_name',
      'group_role',
      'stage_id',
      'stage_name',
      'stage_dir',
      'input_dir',
      'output_dir',
      'workspace',
      'work_dir',
      'dataset_path',
      'dataset_format',
    ];

    function portTypeLabel(t, type) {
      const key = `stages.type${String(type || 'string').charAt(0).toUpperCase()}${String(type || 'string').slice(1)}`;
      return t(key);
    }

    /** A string sink accepts every source; otherwise the types must match. */
    function portTypesCompatible(fromType, toType) {
      const from = PORT_VALUE_TYPES.includes(fromType) ? fromType : 'string';
      const to = PORT_VALUE_TYPES.includes(toType) ? toType : 'string';
      if (from === to) return true;
      return to === 'string';
    }

    function portDefaultMatches(type, value) {
      const raw = String(value == null ? '' : value).trim();
      if (raw === '') return true;
      if (type === 'number') return Number.isFinite(Number(raw));
      if (type === 'boolean') return ['true', 'false', '1', '0'].includes(raw.toLowerCase());
      if (type === 'json') {
        try {
          JSON.parse(raw);
          return true;
        } catch {
          return false;
        }
      }
      return true;
    }

    /** Validate the @@placeholder@@ syntax and declared names of a stage command. */
    function commandTemplateProblems(command, declared, t) {
      const problems = [];
      const text = String(command || '');
      if (!text.includes('@@')) return problems;
      const parts = text.split('@@');
      if (parts.length % 2 === 0) {
        problems.push(t('stages.commandUnclosed'));
        return problems;
      }
      const unknown = new Set();
      for (let index = 1; index < parts.length; index += 2) {
        const name = parts[index].trim();
        if (!name) {
          problems.push(t('stages.commandEmptyRef'));
          continue;
        }
        if (/[\r\n]/.test(name)) {
          problems.push(t('stages.commandMultilineRef', { name: name.replace(/[\r\n]+/g, ' ') }));
          continue;
        }
        if (!declared.has(name) && !STAGE_BUILTIN_NAMES.includes(name)) unknown.add(name);
      }
      if (unknown.size > 0) {
        problems.push(t('stages.commandUnknownRefs', { names: [...unknown].join(', ') }));
      }
      return problems;
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) return '—';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function isTextOutputFile(fileName) {
      if (!/\.[^/]+$/.test(fileName)) return true;
      return /\.(txt|log|json|jsonl|csv|tsv|md|markdown|html|htm|xml|yaml|yml|js|mjs|cjs|ts|tsx|jsx|py|rb|sh|ps1|cmd|ini|toml|conf|env)$/i.test(fileName);
    }

    function triggerDownload(url, filename) {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function formatDate(value) {
      if (!value) return '—';
      try {
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value));
      } catch {
        return '—';
      }
    }

    function formatDuration(startedAt, endedAt) {
      if (!startedAt) return '—';
      const end = endedAt || Date.now();
      const seconds = Math.max(0, Math.round((end - startedAt) / 1000));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      if (minutes < 60) return `${minutes}m ${rest}s`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    }

    function latestRunOf(taskId, runs) {
      return runs.find((run) => run.taskId === taskId);
    }

    /** The template owns the dataset; tasks only keep a legacy fallback id. */
    function groupDatasetId(group, task, templates) {
      const template = (templates || []).find((item) => item.id === group.templateId);
      return (template?.datasetId || '').trim() || (task?.datasetId || '').trim();
    }

    function taskDatasetNames(task, templates, datasets) {
      const names = [];
      for (const group of task.groups || []) {
        const datasetId = groupDatasetId(group, task, templates);
        const name = (datasets || []).find((item) => item.id === datasetId)?.name;
        if (name && !names.includes(name)) names.push(name);
      }
      return names;
    }

    function parameterRowsForGroup(group, templates) {
      const template = templates.find((item) => item.id === group.templateId);
      const values = new Map((group.parameters || []).map((parameter) => [parameter.key, parameter.value]));
      if (template?.parameters?.length) {
        return template.parameters.map((parameter) => ({
          key: parameter.key,
          value: values.has(parameter.key) ? values.get(parameter.key) : parameter.defaultValue,
        }));
      }
      return (group.parameters || []).map((parameter) => ({ key: parameter.key, value: parameter.value }));
    }

    function PreviewTable({ columns, rows, emptyLabel, maxRows = 5 }) {
      if (!columns.length || !rows.length) {
        return h('div', { className: 'th-preview-empty' }, emptyLabel);
      }
      return h(
        'div',
        { className: 'th-table-wrap' },
        h(
          'table',
          { className: 'th-table' },
          h('thead', null, h('tr', null, columns.map((column) => h('th', { key: column }, column)))),
          h(
            'tbody',
            null,
            rows.slice(0, maxRows).map((row, rowIndex) =>
              h(
                'tr',
                { key: rowIndex },
                columns.map((column) => h('td', { key: column, title: row[column] === undefined ? '' : String(row[column]) }, row[column] === undefined ? '' : String(row[column]))),
              ),
            ),
          ),
        ),
      );
    }

    function groupProgress(group, fallbackStages = []) {
      const stages = Array.isArray(group?.stages) ? group.stages : fallbackStages;
      const total = stages.length;
      const done = stages.filter((stage) => ['completed', 'failed', 'stopped'].includes(stage.status)).length;
      return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
    }

    function RunGroupView({ group, t, runId, onOpenFolder }) {
      const [open, setOpen] = useState(false);
      const progress = groupProgress(group);
      return h(
        'section',
        { className: cx('th-rungroup', `th-rungroup-${group.status}`) },
        h(
          'button',
          {
            type: 'button',
            className: 'th-rungroup-head',
            onClick: () => setOpen((value) => !value),
            'aria-expanded': open,
          },
          h(Icon, { name: 'chevron-down', size: 15, className: cx('th-chevron', open && 'is-open') }),
          h('span', { className: cx('th-role-dot', `is-${group.role}`) }),
          h('span', { className: 'th-rungroup-name' }, group.name),
          h('span', { className: 'th-role-chip' }, group.role === 'control' ? 'Control' : 'Treatment'),
          h(StatusBadge, { status: group.status === 'pending' ? 'idle' : group.status, t }),
          h('span', { className: 'th-rungroup-count' }, t('tasks.stagesProgress', { done: progress.done, total: progress.total })),
        ),
        h(
          'div',
          { className: 'th-rungroup-progress', 'aria-hidden': 'true' },
          h('span', { style: { width: `${progress.percent}%` } }),
        ),
        open
          ? h(
              'div',
              { className: 'th-rungroup-body' },
              group.stages.map((stage) => h(RunStageView, { key: stage.id, stage, t, runId, onOpenFolder })),
            )
          : null,
      );
    }

    function StageLogModal({ stage, t, runId, initialTab, onClose }) {
      const outputUrl = runId
        ? `${API_BASE}/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(stage.id)}/output`
        : '';
      const tabs = [
        ['stdout', t('run.logStdout')],
        ['stderr', t('run.logStderr')],
        ...(outputUrl && stage.outputDir ? [['output', t('run.outputFiles')]] : []),
      ];
      const [tab, setTab] = useState(initialTab || (stage.stderr && !stage.stdout ? 'stderr' : 'stdout'));
      const [copyState, setCopyState] = useState('idle');
      const [output, setOutput] = useState({ status: 'idle', dir: stage.outputDir || '', files: [], error: '' });
      const [preview, setPreview] = useState(null);
      const [refreshKey, setRefreshKey] = useState(0);
      const stdout = stage.stdout || '';
      const stderr = stage.stderr || '';
      const command = [stage.command, stage.args].filter(Boolean).join(' ');
      const body = tab === 'stderr' ? stderr : stdout;
      const logText = [
        `# ${stage.name}`,
        `${t('run.commandLine')}: ${command}`,
        '',
        `[${t('run.logStdout')}]`,
        stdout,
        '',
        `[${t('run.logStderr')}]`,
        stderr,
      ].join('\n');
      const fileUrl = (filePath) =>
        `${outputUrl}/file?path=${encodeURIComponent(filePath)}`;
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(logText);
          setCopyState('copied');
        } catch {
          setCopyState('failed');
        }
        window.setTimeout(() => setCopyState('idle'), 1600);
      };
      const exportLog = () => {
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `techhub-${safeFilename(stage.name)}-${safeFilename(stage.stageId)}.log`);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      useEffect(() => {
        if (tab !== 'output' || !outputUrl) return undefined;
        let cancelled = false;
        let timer;
        const loadOutput = async () => {
          if (!cancelled) {
            setOutput((current) => ({
              ...current,
              status: current.files.length === 0 ? 'loading' : 'refreshing',
            }));
          }
          try {
            const response = await fetch(outputUrl, { cache: 'no-store', credentials: 'same-origin' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            if (cancelled) return;
            setOutput({ status: 'ready', dir: payload.dir || stage.outputDir, files: payload.files || [], error: '' });
          } catch (error) {
            if (cancelled) return;
            setOutput((current) => ({
              ...current,
              status: 'error',
              error: t('run.outputLoadFailed', { message: error instanceof Error ? error.message : String(error) }),
            }));
          }
        };
        void loadOutput();
        if (stage.status === 'running') timer = window.setInterval(loadOutput, 2000);
        return () => {
          cancelled = true;
          if (timer) window.clearInterval(timer);
        };
      }, [tab, outputUrl, refreshKey, stage.status, stage.outputDir, t]);
      const previewFile = async (file) => {
        if (!isTextOutputFile(file.path)) {
          setPreview({ path: file.path, error: t('run.previewUnavailable'), loading: false });
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          setPreview({ path: file.path, error: t('run.fileTooLarge'), loading: false });
          return;
        }
        setPreview({ path: file.path, loading: true, text: '', error: '' });
        try {
          const response = await fetch(fileUrl(file.path), { cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const text = await response.text();
          setPreview({ path: file.path, loading: false, text, error: '' });
        } catch (error) {
          setPreview({
            path: file.path,
            loading: false,
            error: t('run.outputLoadFailed', { message: error instanceof Error ? error.message : String(error) }),
          });
        }
      };
      const renderOutput = () => {
        if (preview) {
          const downloadName = preview.path.split('/').pop() || 'output';
          return h(
            'div',
            { className: 'th-output-preview' },
            h(
              'div',
              { className: 'th-output-preview-head' },
              h(Button, { size: 'sm', variant: 'ghost', onClick: () => setPreview(null) }, t('common.back')),
              h('code', { className: 'th-output-path' }, preview.path),
              h(
                'a',
                {
                  className: 'th-iconbtn th-output-download',
                  href: fileUrl(preview.path),
                  download: downloadName,
                  title: t('run.downloadFile'),
                  'aria-label': t('run.downloadFile'),
                },
                h(Icon, { name: 'download', size: 16 }),
              ),
            ),
            preview.loading
              ? h(Spinner, { label: t('common.loading') })
              : preview.error
                ? h('div', { className: 'th-parse-error' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, preview.error))
                : h('pre', { className: 'th-output-pre' }, preview.text || t('run.logEmpty')),
          );
        }
        return h(
          'div',
          { className: 'th-output-panel' },
          h(
            'div',
            { className: 'th-output-head' },
            h(
              'div',
              { className: 'th-output-dir' },
              h(Icon, { name: 'folder', size: 15 }),
              h(
                'div',
                null,
                h('span', null, t('run.outputDir')),
                h('code', null, output.dir || stage.outputDir || '—'),
                h('em', null, t('run.outputHint')),
              ),
            ),
            h(
              Button,
              {
                size: 'sm',
                variant: 'ghost',
                icon: 'refresh',
                disabled: output.status === 'loading',
                onClick: () => setRefreshKey((value) => value + 1),
              },
              t('common.refresh'),
            ),
          ),
          output.error ? h('div', { className: 'th-parse-error' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, output.error)) : null,
          output.status === 'loading' ? h(Spinner, { label: t('common.loading') }) : null,
          output.files.length === 0
            ? h('div', { className: 'th-output-empty' }, h(Icon, { name: 'folder', size: 20 }), h('span', null, t('run.outputEmpty')))
            : h(
                'div',
                { className: 'th-output-list' },
                output.files.map((file) =>
                  h(
                    'div',
                    { key: file.path, className: 'th-output-row' },
                    h(
                      'button',
                      { type: 'button', className: 'th-output-file', onClick: () => previewFile(file) },
                      h(Icon, { name: 'file', size: 14 }),
                      h('span', { className: 'th-output-name' }, file.path),
                      h('em', null, formatBytes(file.size)),
                      h('span', { className: 'th-output-time' }, formatDate(file.mtime)),
                    ),
                    h(
                      'a',
                      {
                        className: 'th-iconbtn th-output-download',
                        href: fileUrl(file.path),
                        download: file.path.split('/').pop() || 'output',
                        title: t('run.downloadFile'),
                        'aria-label': t('run.downloadFile'),
                      },
                      h(Icon, { name: 'download', size: 15 }),
                    ),
                  ),
                ),
              ),
        );
      };
      return h(
        Modal,
        {
          title: stage.name,
          subtitle: `${t('run.stageLog')} · ${t(`run.${stage.status}`)}`,
          onClose,
          t,
          width: 'min(960px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close')),
            h(Button, { key: 'export', variant: 'secondary', icon: 'download', onClick: exportLog }, t('run.exportLog')),
            h(
              Button,
              {
                key: 'copy',
                variant: 'secondary',
                icon: copyState === 'copied' ? 'check' : 'copy',
                onClick: copy,
              },
              copyState === 'copied' ? t('run.copied') : copyState === 'failed' ? t('run.copyFailed') : t('run.copyLog'),
            ),
          ],
        },
        h(
          'div',
          { className: 'th-log' },
          h(
            'div',
            { className: 'th-log-meta' },
            h(StatusBadge, { status: stage.status, t }),
            stage.exitCode !== null && stage.exitCode !== undefined
              ? h('span', { className: cx('th-exit', stage.exitCode === 0 ? 'is-ok' : 'is-bad') }, `${t('run.exitCode')} ${stage.exitCode}`)
              : null,
            h('span', null, `${t('run.duration')} ${formatDuration(stage.startedAt, stage.endedAt)}`),
            command ? h('code', { className: 'th-log-command' }, command) : null,
          ),
          h(
            'div',
            { className: 'th-log-tabs', role: 'tablist', 'aria-label': t('run.stageLog') },
            tabs.map(([value, label]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === value,
                  className: cx('th-log-tab', tab === value && 'is-active'),
                  onClick: () => {
                    setTab(value);
                    setPreview(null);
                  },
                },
                label,
              ),
            ),
          ),
          tab === 'output' ? renderOutput() : h('pre', { className: 'th-log-pre' }, body || t('run.logEmpty')),
        ),
      );
    }

    function RunStageView({ stage, t, runId, onOpenFolder }) {
      const [logOpen, setLogOpen] = useState(false);
      const [logTab, setLogTab] = useState('stdout');
      return h(
        'div',
        { className: cx('th-runstage', `is-${stage.status}`) },
        h(
          'div',
          { className: 'th-runstage-head' },
          h('span', { className: cx('th-stage-state', `is-${stage.status}`) }, h(StageStateIcon, { status: stage.status })),
          h(
            'div',
            { className: 'th-runstage-main' },
            h(
              'div',
              { className: 'th-runstage-title' },
              h('strong', null, stage.name),
              stage.status !== 'pending' ? h('span', { className: 'th-runstage-time' }, formatDuration(stage.startedAt, stage.endedAt)) : null,
            ),
            h('code', { className: 'th-command' }, [stage.command, stage.args].filter(Boolean).join(' ') || '—'),
          ),
          h(
            'div',
            { className: 'th-runstage-actions' },
            stage.exitCode !== null && stage.exitCode !== undefined
              ? h('span', { className: cx('th-exit', stage.exitCode === 0 ? 'is-ok' : 'is-bad') }, `${t('run.exitCode')} ${stage.exitCode}`)
              : null,
            stage.resultsDir
              ? h(IconButton, {
                  icon: 'folder',
                  label: t('tasks.openStageFolder'),
                  onClick: () => onOpenFolder(runId, undefined, stage.id),
                })
              : null,
            h(
              Button,
              {
                size: 'sm',
                variant: 'ghost',
                icon: 'terminal',
                onClick: () => {
                  setLogTab('stdout');
                  setLogOpen(true);
                },
              },
              t('run.log'),
            ),
            stage.outputDir && runId
              ? h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'ghost',
                    icon: 'folder',
                    onClick: () => {
                      setLogTab('output');
                      setLogOpen(true);
                    },
                  },
                  t('run.output'),
                )
              : null,
          ),
        ),
        logOpen
          ? h(StageLogModal, {
              stage,
              t,
              runId,
              initialTab: logTab,
              onClose: () => setLogOpen(false),
            })
          : null,
      );
    }

    function StageStateIcon({ status }) {
      if (status === 'running') return h('span', { className: 'th-mini-spinner' });
      if (status === 'completed') return h(Icon, { name: 'check', size: 13 });
      if (status === 'failed') return h(Icon, { name: 'x', size: 13 });
      if (status === 'stopped') return h(Icon, { name: 'stop', size: 11 });
      return h('span', { className: 'th-mini-dot' });
    }

    function RunView({ run, t, onOpenFolder }) {
      if (!run) {
        return h(
          'div',
          { className: 'th-run-empty' },
          h(Icon, { name: 'clock', size: 22 }),
          h('p', null, t('tasks.noRun')),
        );
      }
      const message =
        run.status === 'failed'
          ? run.failedStage
            ? t('run.stageFailed', { name: run.failedStage })
            : t('run.failedMessage')
          : t(`run.${run.status}Message`);
      const exportRun = () =>
        triggerDownload(
          `${API_BASE}/runs/${encodeURIComponent(run.id)}/export`,
          `techhub-${safeFilename(run.taskName)}-${run.id}.zip`,
        );
      return h(
        'div',
        { className: 'th-run' },
        h(
          'div',
          { className: 'th-run-summary' },
          h(StatusBadge, { status: run.status, t }),
          h('span', { className: 'th-run-message' }, message),
          run.status === 'running' ? h('span', { className: 'th-live-pill' }, h('span', { className: 'th-live-dot' }), t('run.live')) : null,
          h('span', { className: 'th-run-meta' }, `${t('run.started')} ${formatDate(run.startedAt)}`),
          h('span', { className: 'th-run-meta' }, `${t('run.duration')} ${formatDuration(run.startedAt, run.endedAt)}`),
          h(
            'div',
            { className: 'th-run-actions' },
            run.resultsDir
              ? h(
                  Button,
                  { size: 'sm', variant: 'ghost', icon: 'folder', onClick: () => onOpenFolder(run.id) },
                  t('tasks.openFolder'),
                )
              : null,
            h(Button, { size: 'sm', variant: 'ghost', icon: 'download', onClick: exportRun }, t('run.exportResults')),
          ),
        ),
        run.cwd ? h('div', { className: 'th-run-cwd' }, h(Icon, { name: 'folder', size: 14 }), h('code', null, run.cwd)) : null,
        run.resultsDir
          ? h(
              'div',
              { className: 'th-run-cwd' },
              h(Icon, { name: 'folder', size: 14 }),
              h('span', { className: 'th-run-results-label' }, t('run.resultsDir')),
              h('code', null, run.resultsDir),
            )
          : null,
        h(
          'div',
          { className: 'th-run-groups' },
          run.groups.map((group) =>
            h(RunGroupView, {
              key: group.id,
              group,
              t,
              runId: run.id,
              onOpenFolder,
            }),
          ),
        ),
      );
    }

    function ConfirmDialog({ state, onClose, t }) {
      const [busy, setBusy] = useState(false);
      if (!state) return null;
      const confirm = async () => {
        if (busy) return;
        setBusy(true);
        let ok = false;
        try {
          ok = await state.onConfirm();
        } finally {
          setBusy(false);
        }
        if (ok) onClose();
      };
      return h(
        Modal,
        {
          title: state.title,
          subtitle: state.body,
          onClose: busy ? () => {} : onClose,
          width: 'min(440px, calc(100vw - 32px))',
          t,
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: busy }, t('common.cancel')),
            h(
              Button,
              { key: 'confirm', variant: 'danger', onClick: confirm, disabled: busy, icon: 'trash' },
              busy ? t('common.saving') : state.confirmLabel || t('confirm.delete'),
            ),
          ],
        },
        h('div', { className: 'th-confirm-note' }, h(Icon, { name: 'alert', size: 18 }), h('span', null, t('common.deleteIrreversible'))),
      );
    }

    function TaskEditor({ initial, templates, stages, datasets, t, saving, onClose, onSave }) {
      const makeGroup = (role, index) => ({
        id: uid('group'),
        role,
        name: role === 'control' ? t('tasks.control') : t('tasks.treatmentN', { n: index }),
        templateId: '',
        parameters: [],
        stageConfigs: [],
      });
      const groupParametersForTemplate = (group) => {
        const template = templates.find((item) => item.id === group.templateId);
        if (!template) return (group.parameters || []).map((parameter) => ({ ...parameter }));
        const existing = new Map((group.parameters || []).map((parameter) => [parameter.key, parameter.value]));
        return (template.parameters || []).map((parameter) => ({
          key: parameter.key,
          value: existing.has(parameter.key) ? existing.get(parameter.key) : parameter.defaultValue,
        }));
      };
      const [draft, setDraft] = useState(() =>
        initial
          ? {
              ...initial,
              groups: initial.groups.map((group) => ({
                ...group,
                parameters: groupParametersForTemplate(group),
                stageConfigs: group.stageConfigs.map((stage) => ({ ...stage })),
              })),
            }
          : {
              name: '',
              description: '',
              datasetId: '',
              cwd: '',
              groups: [makeGroup('control', 0)],
            },
      );
      const [error, setError] = useState('');

      const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
      const updateGroup = (groupId, patch) =>
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
        }));

      const changeTemplate = (groupId, templateId) => {
        const template = templates.find((item) => item.id === templateId);
        const library = new Map((stages || []).map((stage) => [stage.id, stage]));
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => {
            if (group.id !== groupId) return group;
            if (group.templateId === templateId) return group;
            return {
              ...group,
              templateId,
              parameters: template
                ? (template.parameters || []).map((parameter) => ({ key: parameter.key, value: parameter.defaultValue }))
                : [],
              stageConfigs: template
                ? template.stages
                    .map((entry) => {
                      const stage = library.get(entry.stageId);
                      if (!stage) return null;
                      return {
                        stageId: entry.id,
                        libraryStageId: stage.id,
                        name: stage.name,
                        command: stage.command,
                        timeoutSec: stage.timeoutSec || 0,
                        outputs: (stage.outputs || []).map((output) => ({ ...output })),
                        inputs: (stage.inputs || []).map((declaration) => ({
                          id: declaration.id,
                          name: declaration.name,
                          type: declaration.type || 'string',
                          required: declaration.required !== false,
                          source: (entry.inputs || []).find((binding) => binding.name === declaration.name)?.source || null,
                        })),
                        parameters: (stage.parameters || []).map((declaration) => ({
                          id: declaration.id,
                          name: declaration.name,
                          type: declaration.type || 'string',
                          defaultValue: declaration.defaultValue || '',
                          source: (entry.parameters || []).find((binding) => binding.name === declaration.name)?.source || null,
                        })),
                        inputRefs: (entry.inputRefs || []).map((reference) => ({ ...reference })),
                      };
                    })
                    .filter(Boolean)
                : [],
            };
          }),
        }));
      };

      const applyTemplate = (groupId) =>
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => {
            if (group.id !== groupId) return group;
            const template = templates.find((item) => item.id === group.templateId);
            if (!template) return group;
            const library = new Map((stages || []).map((stage) => [stage.id, stage]));
            const existing = new Map((group.parameters || []).map((parameter) => [parameter.key, parameter.value]));
            return {
              ...group,
              parameters: (template.parameters || []).map((parameter) => ({
                key: parameter.key,
                value: existing.has(parameter.key) ? existing.get(parameter.key) : parameter.defaultValue,
              })),
              stageConfigs: template.stages
                .map((entry) => {
                  const stage = library.get(entry.stageId);
                  if (!stage) return null;
                  return {
                    stageId: entry.id,
                    libraryStageId: stage.id,
                    name: stage.name,
                    command: stage.command,
                    timeoutSec: stage.timeoutSec || 0,
                    outputs: (stage.outputs || []).map((output) => ({ ...output })),
                    inputs: (stage.inputs || []).map((declaration) => ({
                      id: declaration.id,
                      name: declaration.name,
                      type: declaration.type || 'string',
                      required: declaration.required !== false,
                      source: (entry.inputs || []).find((binding) => binding.name === declaration.name)?.source || null,
                    })),
                    parameters: (stage.parameters || []).map((declaration) => ({
                      id: declaration.id,
                      name: declaration.name,
                      type: declaration.type || 'string',
                      defaultValue: declaration.defaultValue || '',
                      source: (entry.parameters || []).find((binding) => binding.name === declaration.name)?.source || null,
                    })),
                    inputRefs: (entry.inputRefs || []).map((reference) => ({ ...reference })),
                  };
                })
                .filter(Boolean),
            };
          }),
        }));

      const updateGroupParameter = (groupId, key, value) =>
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => {
            if (group.id !== groupId) return group;
            const parameters = [...(group.parameters || [])];
            const index = parameters.findIndex((parameter) => parameter.key === key);
            if (index === -1) parameters.push({ key, value });
            else parameters[index] = { ...parameters[index], value };
            return { ...group, parameters };
          }),
        }));

      const updateStage = (groupId, stageId, patch) =>
        setDraft((current) => ({
          ...current,
          groups: current.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  stageConfigs: group.stageConfigs.map((stage) => (stage.stageId === stageId ? { ...stage, ...patch } : stage)),
                }
              : group,
          ),
        }));

      const addTreatment = () =>
        setDraft((current) => {
          const count = current.groups.filter((group) => group.role === 'treatment').length + 1;
          return { ...current, groups: [...current.groups, makeGroup('treatment', count)] };
        });

      const removeGroup = (groupId) =>
        setDraft((current) => ({
          ...current,
          groups: current.groups.filter((group) => group.id !== groupId || group.role === 'control'),
        }));

      const submit = () => {
        const problems = [];
        if (draft.name.trim() === '') problems.push(t('tasks.nameRequired'));
        if (draft.groups.filter((group) => group.role === 'control').length !== 1) {
          problems.push(t('tasks.groupsHint'));
        }
        for (const group of draft.groups) {
          if (!group.templateId) problems.push(t('tasks.templateRequired'));
          if (group.stageConfigs.length === 0) problems.push(t('tasks.stageRequired'));
          for (const stage of group.stageConfigs) {
            if (stage.command.trim() === '') problems.push(t('tasks.stageCommandRequired'));
          }
          const templateDefinition = templates.find((item) => item.id === group.templateId);
          for (const parameter of group.parameters || []) {
            const definition = (templateDefinition?.parameters || []).find((item) => item.key === parameter.key);
            if (!definition) continue;
            if (!portDefaultMatches(definition.type || 'string', parameter.value)) {
              problems.push(
                t('tasks.parameterTypeInvalid', {
                  key: parameter.key,
                  type: portTypeLabel(t, definition.type || 'string'),
                }),
              );
            }
          }
        }
        if (problems.length > 0) {
          setError([...new Set(problems)].join(' '));
          return;
        }
        const now = Date.now();
        const cleaned = {
          ...draft,
          id: initial?.id || uid('task'),
          name: draft.name.trim(),
          description: draft.description.trim(),
          cwd: draft.cwd.trim(),
          createdAt: initial?.createdAt || now,
          updatedAt: now,
          groups: draft.groups.map((group, index) => ({
            ...group,
            name: group.name.trim() || (group.role === 'control' ? t('tasks.control') : t('tasks.treatmentN', { n: index })),
            parameters: (group.parameters || []).map((parameter) => ({
              key: parameter.key.trim(),
              value: parameter.value,
            })),
            stageConfigs: group.stageConfigs.map((stage) => ({
              ...stage,
              command: stage.command.trim(),
            })),
          })),
        };
        onSave(cleaned);
      };

      return h(
        Modal,
        {
          title: initial ? t('tasks.editTitle') : t('tasks.newTitle'),
          subtitle: t('tasks.groupsHint'),
          onClose,
          t,
          width: 'min(1040px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: saving }, t('common.cancel')),
            h(Button, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: saving }, saving ? t('common.saving') : t('common.save')),
          ],
        },
        h(
          'div',
          { className: 'th-form' },
          error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
          h(
            'div',
            { className: 'th-form-grid' },
            h(Field, { label: t('tasks.name'), required: true, className: 'th-span-2' }, h('input', {
              className: 'th-input',
              value: draft.name,
              autoFocus: true,
              placeholder: t('tasks.namePlaceholder'),
              onChange: (event) => update({ name: event.target.value }),
            })),
            h(Field, { label: t('tasks.cwd'), hint: t('tasks.cwdHint') }, h('input', {
              className: 'th-input',
              value: draft.cwd,
              placeholder: t('tasks.cwdPlaceholder'),
              onChange: (event) => update({ cwd: event.target.value }),
            })),
            h(Field, { label: t('tasks.description'), className: 'th-span-2' }, h('textarea', {
              className: 'th-textarea',
              rows: 2,
              value: draft.description,
              placeholder: t('tasks.descriptionPlaceholder'),
              onChange: (event) => update({ description: event.target.value }),
            })),
          ),
          h(
            'div',
            { className: 'th-section-head' },
            h('div', null, h('h3', null, t('tasks.groupsTitle')), h('p', null, t('tasks.groupsHint'))),
          ),
          h(
            'div',
            { className: 'th-groups' },
            draft.groups.map((group, index) => {
              const template = templates.find((item) => item.id === group.templateId);
              return h(
                'section',
                { key: group.id, className: cx('th-group', `th-group-${group.role}`) },
                h(
                  'header',
                  { className: 'th-group-head' },
                  h(
                    'div',
                    { className: 'th-group-id' },
                    h('span', { className: cx('th-role-badge', `is-${group.role}`) }, group.role === 'control' ? 'Control' : 'Treatment'),
                    h('span', { className: 'th-group-order' }, `#${index + 1}`),
                  ),
                  h('input', {
                    className: 'th-input th-group-name',
                    value: group.name,
                    'aria-label': t('tasks.groupName'),
                    placeholder: t('tasks.groupName'),
                    onChange: (event) => updateGroup(group.id, { name: event.target.value }),
                  }),
                  group.role === 'treatment'
                    ? h(IconButton, { icon: 'trash', label: t('common.delete'), onClick: () => removeGroup(group.id), className: 'th-danger-hover' })
                    : h('span', { className: 'th-lock-note' }, t('tasks.control')),
                ),
                h(
                  'div',
                  { className: 'th-group-template' },
                  h(
                    Field,
                    { label: t('tasks.template'), required: true },
                    h(
                      'div',
                      { className: 'th-template-pick' },
                      h(
                        'select',
                        {
                          className: 'th-select',
                          value: group.templateId,
                          onChange: (event) => changeTemplate(group.id, event.target.value),
                        },
                        h('option', { value: '' }, t('tasks.templatePlaceholder')),
                        group.templateId && !template
                          ? h('option', { value: group.templateId }, t('tasks.templateMissing'))
                          : null,
                        templates.map((item) => h('option', { key: item.id, value: item.id }, item.name)),
                      ),
                      h(IconButton, {
                        icon: 'refresh',
                        label: t('tasks.applyTemplate'),
                        title: t('tasks.applyTemplateHint'),
                        disabled: !group.templateId || !template,
                        onClick: () => applyTemplate(group.id),
                      }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'th-group-dataset' },
                    h(Icon, { name: 'database', size: 12 }),
                    h(
                      'span',
                      null,
                      template
                        ? template.datasetId
                          ? t('tasks.datasetFromTemplate', {
                              name:
                                (datasets || []).find((item) => item.id === template.datasetId)?.name
                                || t('templates.datasetMissing'),
                            })
                          : t('tasks.datasetTemplateEmpty')
                        : t('tasks.datasetTemplatePick'),
                    ),
                  ),
                ),
                (() => {
                  const parameterDefinitions =
                    template?.parameters?.length > 0
                      ? template.parameters
                      : (group.parameters || []).map((parameter) => ({
                          key: parameter.key,
                          defaultValue: '',
                          description: '',
                        }));
                  if (parameterDefinitions.length === 0) return null;
                  return h(
                    'div',
                    { className: 'th-group-params' },
                    h(
                      'div',
                      { className: 'th-group-params-head' },
                      h('strong', null, t('tasks.parameters')),
                      h('span', null, t('tasks.parametersHint')),
                    ),
                    h(
                      'div',
                      { className: 'th-param-list th-task-params' },
                      h(
                        'div',
                        { className: 'th-param-labels' },
                        h('span', null, t('templates.parameterKey')),
                        h('span', null, t('tasks.parameterValue')),
                        h('span', null, t('templates.parameterDescription')),
                      ),
                      parameterDefinitions.map((definition) => {
                        const value =
                          (group.parameters || []).find((parameter) => parameter.key === definition.key)?.value ??
                          definition.defaultValue ??
                          '';
                        return h(
                          'div',
                          { key: definition.key, className: 'th-param-row' },
                          h(
                            'div',
                            { className: 'th-param-keycell' },
                            h('code', { className: 'th-param-key' }, `{{${definition.key}}}`),
                            definition.type && definition.type !== 'string'
                              ? h('em', { className: 'th-port-type-badge' }, portTypeLabel(t, definition.type))
                              : null,
                          ),
                          h('input', {
                            className: 'th-input th-mono',
                            value,
                            placeholder: definition.defaultValue
                              ? `${t('tasks.parameterDefault')}: ${definition.defaultValue}`
                              : t('tasks.parameterPlaceholder'),
                            'aria-label': definition.key,
                            onChange: (event) => updateGroupParameter(group.id, definition.key, event.target.value),
                          }),
                          h('span', { className: 'th-param-description' }, definition.description || '—'),
                        );
                      }),
                    ),
                  );
                })(),
                group.stageConfigs.length > 0
                  ? h(
                      'div',
                      { className: 'th-stagecfg-list' },
                      h(
                        'div',
                        { className: 'th-stagecfg-labels' },
                        h('span', null, '#'),
                        h('span', null, t('tasks.stage')),
                        h('span', null, t('tasks.command')),
                      ),
                      group.stageConfigs.map((stage, stageIndex) =>
                        h(
                          'div',
                          { key: stage.stageId, className: 'th-stagecfg' },
                          h('span', { className: 'th-stagecfg-index' }, String(stageIndex + 1).padStart(2, '0')),
                          h('div', { className: 'th-stagecfg-name' }, h('strong', null, stage.name), stage.command ? null : h('span', null, t('tasks.command'))),
                          h('textarea', {
                            className: 'th-textarea th-mono th-stagecfg-command',
                            rows: 2,
                            value: stage.command,
                            placeholder: t('tasks.commandPlaceholder'),
                            'aria-label': `${stage.name} · ${t('tasks.command')}`,
                            onChange: (event) => updateStage(group.id, stage.stageId, { command: event.target.value }),
                          }),
                        ),
                      ),
                    )
                  : h('div', { className: 'th-group-hint' }, t('tasks.noStageConfig')),
              );
            }),
            h(
              'button',
              { type: 'button', className: 'th-add-group', onClick: addTreatment },
              h(Icon, { name: 'plus', size: 18 }),
              h('span', null, t('tasks.addTreatment')),
            ),
          ),
          h('div', { className: 'th-hintline' }, h(Icon, { name: 'info', size: 14 }), h('span', null, t('tasks.envHint'))),
        ),
      );
    }

    function StageEditor({ initial, stages, t, saving, onClose, onSave }) {
      const [draft, setDraft] = useState(() =>
        initial
          ? {
              id: initial.id,
              name: initial.name,
              description: initial.description || '',
              command: initial.command || '',
              timeoutSec: initial.timeoutSec || 0,
              assetKind: initial.assetKind || '',
              assetName: initial.assetName || '',
              assetFileCount: initial.assetFileCount || 0,
              assetSize: initial.assetSize || 0,
              inputs: (initial.inputs || []).map((input) => ({
                id: input.id,
                name: input.name,
                type: input.type || 'string',
                required: input.required !== false,
                description: input.description || '',
              })),
              parameters: (initial.parameters || []).map((parameter) => ({
                id: parameter.id,
                name: parameter.name,
                type: parameter.type || 'string',
                defaultValue: parameter.defaultValue || '',
                description: parameter.description || '',
              })),
              outputs: (initial.outputs || []).map((output) => ({
                id: output.id,
                name: output.name,
                type: output.type || 'file',
                file: output.file || '',
              })),
            }
          : {
              id: uid('stage'),
              name: '',
              description: '',
              command: '',
              timeoutSec: 0,
              assetKind: '',
              assetName: '',
              assetFileCount: 0,
              assetSize: 0,
              inputs: [],
              parameters: [],
              outputs: [],
            },
      );
      const [error, setError] = useState('');
      const [assetBusy, setAssetBusy] = useState(false);
      const [assetError, setAssetError] = useState('');
      const fileInputRef = useRef(null);
      const folderInputRef = useRef(null);

      const uploadAsset = async (kind, fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        setAssetBusy(true);
        setAssetError('');
        try {
          if (files.length > 1000) throw new Error(t('stages.assetTooMany'));
          const payloadFiles = [];
          let total = 0;
          let name = '';
          for (const file of files) {
            const data = await fileToBase64(file);
            total += file.size;
            if (total > 64 * 1024 * 1024) throw new Error(t('stages.assetTooLarge'));
            const relativePath = String(file.webkitRelativePath || '');
            const relative = kind === 'directory'
              ? relativePath.split('/').slice(1).join('/') || file.name
              : file.name;
            if (name === '') name = kind === 'directory' ? (relativePath.split('/')[0] || 'folder') : file.name;
            payloadFiles.push({ path: relative, data });
          }
          const response = await fetch(`${API_BASE}/stage-assets`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ stageId: draft.id, kind, name, files: payloadFiles }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          setDraft((current) => ({
            ...current,
            assetKind: payload.assetKind,
            assetName: payload.assetName,
            assetFileCount: payload.assetFileCount,
            assetSize: payload.assetSize,
          }));
        } catch (uploadError) {
          setAssetError(
            t('stages.assetUploadFailed', {
              message: uploadError instanceof Error ? uploadError.message : String(uploadError),
            }),
          );
        } finally {
          setAssetBusy(false);
        }
      };
      const clearAsset = () =>
        setDraft((current) => ({
          ...current,
          assetKind: '',
          assetName: '',
          assetFileCount: 0,
          assetSize: 0,
        }));

      const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
      const addInput = () =>
        setDraft((current) => ({
          ...current,
          inputs: [
            ...current.inputs,
            { id: uid('input'), name: '', type: 'string', required: true, description: '' },
          ],
        }));
      const updateInput = (inputId, patch) =>
        setDraft((current) => ({
          ...current,
          inputs: current.inputs.map((input) => (input.id === inputId ? { ...input, ...patch } : input)),
        }));
      const removeInput = (inputId) =>
        setDraft((current) => ({ ...current, inputs: current.inputs.filter((input) => input.id !== inputId) }));
      const addOutput = () =>
        setDraft((current) => ({
          ...current,
          outputs: [...current.outputs, { id: uid('output'), file: '', name: '', type: 'file' }],
        }));
      const updateOutput = (outputId, patch) =>
        setDraft((current) => ({
          ...current,
          outputs: current.outputs.map((output) => (output.id === outputId ? { ...output, ...patch } : output)),
        }));
      const removeOutput = (outputId) =>
        setDraft((current) => ({ ...current, outputs: current.outputs.filter((output) => output.id !== outputId) }));
      const addParameter = () =>
        setDraft((current) => ({
          ...current,
          parameters: [
            ...current.parameters,
            { id: uid('parameter'), name: '', type: 'string', defaultValue: '', description: '' },
          ],
        }));
      const updateParameter = (parameterId, patch) =>
        setDraft((current) => ({
          ...current,
          parameters: current.parameters.map((parameter) =>
            parameter.id === parameterId ? { ...parameter, ...patch } : parameter,
          ),
        }));
      const removeParameter = (parameterId) =>
        setDraft((current) => ({
          ...current,
          parameters: current.parameters.filter((parameter) => parameter.id !== parameterId),
        }));

      const submit = () => {
        const problems = [];
        const name = draft.name.trim();
        if (name === '') {
          problems.push(t('stages.nameRequired'));
        } else if ((stages || []).some((stage) => stage.id !== initial?.id && stage.name.trim() === name)) {
          problems.push(t('stages.nameDuplicate'));
        }
        if (draft.command.trim() === '') problems.push(t('stages.commandRequired'));
        if (!Number.isInteger(Number(draft.timeoutSec)) || Number(draft.timeoutSec) < 0) {
          problems.push(t('stages.timeoutInvalid'));
        }

        // Inputs, outputs and parameters share the @@name@@ namespace, so names
        // must be unique across all three and must not shadow a builtin.
        const declared = new Set();
        const claimName = (rawName, requiredMessage, invalidMessage) => {
          const value = rawName.trim();
          if (value === '') {
            problems.push(requiredMessage);
            return false;
          }
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
            problems.push(invalidMessage);
            return false;
          }
          if (STAGE_BUILTIN_NAMES.includes(value)) {
            problems.push(t('stages.builtinNameConflict', { name: value }));
            return false;
          }
          if (declared.has(value)) {
            problems.push(t('stages.nameConflict'));
            return false;
          }
          declared.add(value);
          return true;
        };
        for (const input of draft.inputs) {
          claimName(input.name, t('stages.inputNameRequired'), t('templates.inputKeyInvalid'));
        }
        for (const output of draft.outputs) {
          const file = output.file.trim();
          claimName(output.name, t('templates.outputRequired'), t('templates.outputNameInvalid'));
          if (file === '') problems.push(t('templates.outputRequired'));
          if (
            file !== '' &&
            (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(file) || /(^|[\\/])\.\.([\\/]|$)/.test(file))
          ) {
            problems.push(t('templates.outputFileInvalid'));
          }
        }
        for (const parameter of draft.parameters) {
          if (claimName(parameter.name, t('stages.parameterNameRequired'), t('stages.parameterNameInvalid'))) {
            if (!portDefaultMatches(parameter.type, parameter.defaultValue)) {
              problems.push(t('stages.defaultInvalid', { name: parameter.name.trim(), type: portTypeLabel(t, parameter.type) }));
            }
          }
        }

        // Every @@name@@ in the command must be declared (or be a builtin), and
        // the placeholder syntax itself has to be well formed.
        problems.push(...commandTemplateProblems(draft.command, declared, t));

        if (problems.length > 0) {
          setError([...new Set(problems)].join(' '));
          return;
        }
        const now = Date.now();
        onSave({
          id: draft.id || initial?.id || uid('stage'),
          name,
          description: draft.description.trim(),
          command: draft.command.trim(),
          timeoutSec: Number(draft.timeoutSec) || 0,
          assetKind: draft.assetKind || '',
          assetName: draft.assetKind ? draft.assetName || '' : '',
          assetFileCount: draft.assetKind ? Number(draft.assetFileCount) || 0 : 0,
          assetSize: draft.assetKind ? Number(draft.assetSize) || 0 : 0,
          inputs: draft.inputs.map((input) => ({
            id: input.id,
            name: input.name.trim(),
            type: input.type,
            required: input.required !== false,
            description: (input.description || '').trim(),
          })),
          outputs: draft.outputs.map((output) => ({
            id: output.id,
            name: output.name.trim(),
            type: output.type,
            file: output.file.trim(),
          })),
          parameters: draft.parameters.map((parameter) => ({
            id: parameter.id,
            name: parameter.name.trim(),
            type: parameter.type,
            defaultValue: parameter.defaultValue || '',
            description: (parameter.description || '').trim(),
          })),
          createdAt: initial?.createdAt || now,
          updatedAt: now,
        });
      };

      const typeSelect = (value, allowed, onChange, label) =>
        h(
          'select',
          { className: 'th-select th-port-type', value, 'aria-label': label, onChange: (event) => onChange(event.target.value) },
          allowed.map((type) => h('option', { key: type, value: type }, portTypeLabel(t, type))),
        );

      return h(
        Modal,
        {
          title: initial ? t('stages.editTitle') : t('stages.newTitle'),
          subtitle: t('stages.subtitle'),
          onClose,
          t,
          width: 'min(900px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: saving }, t('common.cancel')),
            h(Button, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: saving }, saving ? t('common.saving') : t('common.save')),
          ],
        },
        h(
          'div',
          { className: 'th-form' },
          error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
          h(
            'div',
            { className: 'th-form-grid' },
            h(Field, { label: t('stages.name'), required: true, className: 'th-span-2' }, h('input', {
              className: 'th-input',
              value: draft.name,
              autoFocus: true,
              placeholder: t('stages.namePlaceholder'),
              onChange: (event) => update({ name: event.target.value }),
            })),
            h(Field, { label: t('stages.description'), className: 'th-span-2' }, h('input', {
              className: 'th-input',
              value: draft.description,
              placeholder: t('stages.descriptionPlaceholder'),
              onChange: (event) => update({ description: event.target.value }),
            })),
          ),
          h(
            'div',
            { className: 'th-stage-io' },
            h(
              'div',
              { className: 'th-stage-io-head' },
              h(Icon, { name: 'external', size: 13 }),
              h('strong', null, t('stages.inputs')),
              h('span', null, t('stages.inputsHint')),
              h(Button, { size: 'sm', variant: 'ghost', icon: 'plus', onClick: addInput }, t('stages.addInput')),
            ),
            draft.inputs.length === 0
              ? h('span', { className: 'th-input-source-empty' }, t('stages.noInputs'))
              : h(
                  'div',
                  { className: 'th-port-list' },
                  h(
                    'div',
                    { className: 'th-port-labels is-input' },
                    h('span', null, t('stages.inputName')),
                    h('span', null, t('stages.type')),
                    h('span', null, t('stages.required')),
                    h('span', null, t('templates.parameterDescription')),
                    h('span', null, ''),
                  ),
                  draft.inputs.map((input) =>
                    h(
                      'div',
                      { key: input.id, className: 'th-port-row is-input' },
                      h('input', {
                        className: 'th-input th-mono',
                        value: input.name,
                        placeholder: t('stages.inputNamePlaceholder'),
                        'aria-label': t('stages.inputName'),
                        onChange: (event) => updateInput(input.id, { name: event.target.value }),
                      }),
                      typeSelect(
                        input.type,
                        PORT_VALUE_TYPES,
                        (type) => updateInput(input.id, { type }),
                        `${input.name || t('stages.inputName')} · ${t('stages.type')}`,
                      ),
                      h(
                        'label',
                        { className: 'th-port-required', title: t('stages.requiredHint') },
                        h('input', {
                          type: 'checkbox',
                          checked: input.required !== false,
                          'aria-label': t('stages.required'),
                          onChange: (event) => updateInput(input.id, { required: event.target.checked }),
                        }),
                      ),
                      h('input', {
                        className: 'th-input',
                        value: input.description || '',
                        placeholder: t('stages.parameterDescriptionPlaceholder'),
                        'aria-label': t('templates.parameterDescription'),
                        onChange: (event) => updateInput(input.id, { description: event.target.value }),
                      }),
                      h(IconButton, {
                        icon: 'trash',
                        label: t('common.delete'),
                        onClick: () => removeInput(input.id),
                        className: 'th-danger-hover',
                      }),
                    ),
                  ),
                ),
          ),
          h(
            'div',
            { className: 'th-stage-io' },
            h(
              'div',
              { className: 'th-stage-io-head' },
              h(Icon, { name: 'folder', size: 13 }),
              h('strong', null, t('stages.outputs')),
              h('span', null, t('stages.outputsHint')),
              h(Button, { size: 'sm', variant: 'ghost', icon: 'plus', onClick: addOutput }, t('stages.addOutput')),
            ),
            draft.outputs.length === 0
              ? h('span', { className: 'th-input-source-empty' }, t('stages.noOutputs'))
              : h(
                  'div',
                  { className: 'th-output-map-list' },
                  h(
                    'div',
                    { className: 'th-output-map-labels is-output' },
                    h('span', null, t('templates.outputFile')),
                    h('span', null, t('templates.outputName')),
                    h('span', null, t('stages.type')),
                    h('span', null, ''),
                  ),
                  draft.outputs.map((output) =>
                    h(
                      'div',
                      { key: output.id, className: 'th-output-map-row is-output' },
                      h('input', {
                        className: 'th-input th-mono',
                        value: output.file,
                        placeholder: t('templates.outputFilePlaceholder'),
                        'aria-label': t('templates.outputFile'),
                        onChange: (event) => updateOutput(output.id, { file: event.target.value }),
                      }),
                      h('input', {
                        className: 'th-input th-mono',
                        value: output.name,
                        placeholder: t('templates.outputNamePlaceholder'),
                        'aria-label': t('templates.outputName'),
                        onChange: (event) => updateOutput(output.id, { name: event.target.value }),
                      }),
                      typeSelect(
                        output.type,
                        PORT_OUTPUT_TYPES,
                        (type) => updateOutput(output.id, { type }),
                        `${output.name || t('templates.outputName')} · ${t('stages.type')}`,
                      ),
                      h(IconButton, {
                        icon: 'trash',
                        label: t('common.delete'),
                        onClick: () => removeOutput(output.id),
                        className: 'th-danger-hover',
                      }),
                    ),
                  ),
                ),
          ),
          h(
            'div',
            { className: 'th-stage-io' },
            h(
              'div',
              { className: 'th-stage-io-head' },
              h(Icon, { name: 'settings', size: 13 }),
              h('strong', null, t('stages.parameters')),
              h('span', null, t('stages.parametersHint')),
              h(Button, { size: 'sm', variant: 'ghost', icon: 'plus', onClick: addParameter }, t('stages.addParameter')),
            ),
            draft.parameters.length === 0
              ? h('span', { className: 'th-input-source-empty' }, t('stages.noParameters'))
              : h(
                  'div',
                  { className: 'th-port-list' },
                  h(
                    'div',
                    { className: 'th-port-labels is-parameter' },
                    h('span', null, t('stages.parameterName')),
                    h('span', null, t('stages.type')),
                    h('span', null, t('stages.parameterDefault')),
                    h('span', null, t('templates.parameterDescription')),
                    h('span', null, ''),
                  ),
                  draft.parameters.map((parameter) =>
                    h(
                      'div',
                      { key: parameter.id, className: 'th-port-row is-parameter' },
                      h('input', {
                        className: 'th-input th-mono',
                        value: parameter.name,
                        placeholder: t('stages.parameterNamePlaceholder'),
                        'aria-label': t('stages.parameterName'),
                        onChange: (event) => updateParameter(parameter.id, { name: event.target.value }),
                      }),
                      typeSelect(
                        parameter.type,
                        PORT_PARAMETER_TYPES,
                        (type) => updateParameter(parameter.id, { type }),
                        `${parameter.name || t('stages.parameterName')} · ${t('stages.type')}`,
                      ),
                      h('input', {
                        className: 'th-input th-mono',
                        value: parameter.defaultValue || '',
                        placeholder: t('stages.parameterDefaultPlaceholder'),
                        'aria-label': t('stages.parameterDefault'),
                        onChange: (event) => updateParameter(parameter.id, { defaultValue: event.target.value }),
                      }),
                      h('input', {
                        className: 'th-input',
                        value: parameter.description || '',
                        placeholder: t('stages.parameterDescriptionPlaceholder'),
                        'aria-label': t('templates.parameterDescription'),
                        onChange: (event) => updateParameter(parameter.id, { description: event.target.value }),
                      }),
                      h(IconButton, {
                        icon: 'trash',
                        label: t('common.delete'),
                        onClick: () => removeParameter(parameter.id),
                        className: 'th-danger-hover',
                      }),
                    ),
                  ),
                ),
          ),
          h(
            'div',
            { className: 'th-stage-io' },
            h(
              'div',
              { className: 'th-stage-io-head' },
              h(Icon, { name: 'upload', size: 13 }),
              h('strong', null, t('stages.asset')),
              h('span', null, t('stages.assetHint')),
            ),
            h(
              'div',
              { className: 'th-asset-row' },
              h(
                'div',
                { className: 'th-asset-meta' },
                draft.assetKind
                  ? h(
                      'span',
                      null,
                      h('code', { className: 'th-asset-name' }, draft.assetName || '—'),
                      h('em', { className: 'th-asset-kind' }, draft.assetKind === 'directory' ? t('stages.assetFolder') : t('stages.assetFile')),
                      h('span', null, t('stages.assetFiles', { n: draft.assetFileCount })),
                      h('span', null, formatBytes(draft.assetSize)),
                    )
                  : h('span', { className: 'th-asset-empty' }, t('stages.assetEmpty')),
              ),
              h(
                'div',
                { className: 'th-asset-actions' },
                h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'secondary',
                    icon: 'file',
                    disabled: assetBusy || saving,
                    onClick: () => fileInputRef.current?.click(),
                  },
                  t('stages.assetPickFile'),
                ),
                h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'secondary',
                    icon: 'folder',
                    disabled: assetBusy || saving,
                    onClick: () => folderInputRef.current?.click(),
                  },
                  t('stages.assetPickFolder'),
                ),
                draft.assetKind
                  ? h(
                      Button,
                      { size: 'sm', variant: 'ghost', icon: 'x', disabled: assetBusy || saving, onClick: clearAsset },
                      t('stages.assetClear'),
                    )
                  : null,
                assetBusy
                  ? h('span', { className: 'th-saving' }, h('span', { className: 'th-mini-spinner' }), t('stages.assetBusy'))
                  : null,
              ),
            ),
            assetError
              ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 14 }), h('span', null, assetError))
              : null,
            h('input', {
              ref: fileInputRef,
              type: 'file',
              multiple: true,
              className: 'th-visually-hidden',
              onChange: (event) => {
                void uploadAsset('file', event.target.files);
                event.target.value = '';
              },
            }),
            h('input', {
              ref: folderInputRef,
              type: 'file',
              multiple: true,
              webkitdirectory: '',
              directory: '',
              className: 'th-visually-hidden',
              onChange: (event) => {
                void uploadAsset('directory', event.target.files);
                event.target.value = '';
              },
            }),
          ),
          h(
            'div',
            { className: 'th-stage-io' },
            h(
              'div',
              { className: 'th-command-head' },
              h(
                'div',
                { className: 'th-command-title' },
                h(Icon, { name: 'terminal', size: 13 }),
                h('strong', null, t('stages.command')),
                h('span', null, t('stages.commandHint')),
              ),
              h(
                'label',
                { className: 'th-command-timeout', title: t('stages.timeoutHint') },
                h('span', null, t('stages.timeout')),
                h('input', {
                  className: 'th-input th-mono',
                  type: 'number',
                  min: 0,
                  step: 1,
                  value: draft.timeoutSec,
                  'aria-label': t('stages.timeout'),
                  onChange: (event) => update({ timeoutSec: event.target.value }),
                }),
              ),
            ),
            h('textarea', {
              className: 'th-textarea th-mono th-commandarea',
              rows: 4,
              value: draft.command,
              placeholder: t('stages.commandPlaceholder'),
              spellCheck: false,
              'aria-label': t('stages.command'),
              onChange: (event) => update({ command: event.target.value }),
            }),
            h(
              'div',
              { className: 'th-builtin-hint' },
              h('div', null, h(Icon, { name: 'info', size: 12 }), h('strong', null, t('stages.builtins')), h('span', null, t('stages.builtinsHint'))),
              h(
                'div',
                { className: 'th-builtin-chips' },
                STAGE_BUILTIN_NAMES.map((builtin) => h('code', { key: builtin, className: 'th-builtin-chip' }, `@@${builtin}@@`)),
              ),
            ),
          ),
        ),
      );
    }

    function StagePreview({ stage, templates, t, onClose, onEdit, onOpenFolder }) {
      const usage = (templates || []).filter((template) =>
        (template.stages || []).some((entry) => entry.stageId === stage.id),
      );
      return h(
        Modal,
        {
          title: stage.name,
          subtitle: stage.description || t('stages.previewTitle'),
          onClose,
          t,
          width: 'min(820px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close')),
            h(Button, { key: 'folder', variant: 'secondary', icon: 'folder', onClick: () => onOpenFolder(stage.id) }, t('stages.openFolder')),
            h(Button, { key: 'edit', variant: 'primary', icon: 'edit', onClick: onEdit }, t('common.edit')),
          ],
        },
        h(
          'div',
          { className: 'th-preview-detail' },
          h(
            'div',
            { className: 'th-preview-stats' },
            h('span', { className: 'th-format-pill' }, t('stages.outputCount', { n: (stage.outputs || []).length })),
            h('span', null, t('stages.inputCount', { n: (stage.inputs || []).length })),
            h('span', null, t('stages.parameterCount', { n: (stage.parameters || []).length })),
            stage.timeoutSec > 0
              ? h('span', null, `${t('stages.timeout')} ${stage.timeoutSec}s`)
              : h('span', null, `${t('stages.timeout')} —`),
            stage.assetKind
              ? h('span', null, `${t('stages.asset')} · ${stage.assetName} · ${t('stages.assetFiles', { n: stage.assetFileCount })}`)
              : h('span', null, t('stages.assetEmpty')),
            h('span', null, usage.length > 0 ? t('stages.usedBy', { n: usage.length }) : t('stages.unused')),
            h('span', null, `${t('common.updated')} ${formatDate(stage.updatedAt)}`),
          ),
          h(
            'div',
            { className: 'th-preview-args' },
            h('span', null, t('stages.previewCommand')),
            stage.command ? h('code', null, stage.command) : h('em', null, '—'),
          ),
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('stages.inputs')), h('p', null, t('stages.inputsHint'))),
          ),
          (stage.inputs || []).length === 0
            ? h('div', { className: 'th-preview-empty' }, t('stages.noInputs'))
            : h(
                'div',
                { className: 'th-preview-args' },
                (stage.inputs || []).map((input) =>
                  h(
                    'code',
                    { key: input.id || input.name },
                    `${input.name} · ${portTypeLabel(t, input.type || 'string')}${input.required === false ? ` · ${t('stages.optional')}` : ''}${input.description ? ` — ${input.description}` : ''}`,
                  ),
                ),
              ),
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('stages.parameters')), h('p', null, t('stages.parametersHint'))),
          ),
          (stage.parameters || []).length === 0
            ? h('div', { className: 'th-preview-empty' }, t('stages.noParameters'))
            : h(
                'div',
                { className: 'th-preview-args' },
                (stage.parameters || []).map((parameter) =>
                  h(
                    'code',
                    { key: parameter.id || parameter.name },
                    `${parameter.name} · ${portTypeLabel(t, parameter.type || 'string')} = ${parameter.defaultValue || '""'}`,
                  ),
                ),
              ),
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('stages.previewOutputs')), h('p', null, t('stages.outputsHint'))),
          ),
          (stage.outputs || []).length === 0
            ? h('div', { className: 'th-preview-empty' }, t('stages.noOutputs'))
            : h(
                'div',
                { className: 'th-preview-args' },
                (stage.outputs || []).map((output) =>
                  h(
                    'code',
                    { key: output.id || output.name },
                    `${output.name} · ${portTypeLabel(t, output.type || 'file')} = ${output.file}`,
                  ),
                ),
              ),
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('stages.previewUsage'))),
          ),
          usage.length === 0
            ? h('div', { className: 'th-preview-empty' }, t('stages.previewNoUsage'))
            : h(
                'div',
                { className: 'th-preview-args' },
                usage.map((template) => h('code', { key: template.id }, template.name)),
              ),
        ),
      );
    }

    function StagesPage({ data, t, query, setQuery, onNew, onPreview, onEdit, onDelete, onOpenFolder, usage }) {
      const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return data.stages
          .filter(
            (stage) =>
              needle === '' ||
              stage.name.toLowerCase().includes(needle) ||
              stage.description.toLowerCase().includes(needle) ||
              stage.command.toLowerCase().includes(needle),
          )
          .sort((left, right) => right.updatedAt - left.updatedAt);
      }, [data.stages, query]);

      return h(
        'div',
        { className: 'th-page' },
        h(
          'div',
          { className: 'th-pagehead' },
          h(
            'div',
            { className: 'th-pagehead-copy' },
            h('span', { className: 'th-kicker' }, t('stages.kicker')),
            h('h1', null, t('stages.title')),
            h('p', null, t('stages.subtitle')),
          ),
          h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, t('stages.new')),
        ),
        h(
          'div',
          { className: 'th-toolbar' },
          h(
            'div',
            { className: 'th-search' },
            h(Icon, { name: 'search', size: 16 }),
            h('input', {
              className: 'th-input',
              type: 'search',
              value: query,
              placeholder: t('stages.search'),
              'aria-label': t('stages.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          h('span', { className: 'th-toolbar-count' }, t('stages.count', { n: rows.length })),
        ),
        rows.length === 0
          ? h(EmptyState, {
              icon: 'terminal',
              title: data.stages.length === 0 ? t('stages.empty') : t('common.none'),
              hint: data.stages.length === 0 ? t('stages.emptyHint') : t('stages.search'),
              actionLabel: data.stages.length === 0 ? t('stages.emptyAction') : undefined,
              onAction: onNew,
            })
          : h(
              'div',
              { className: 'th-card-grid' },
              rows.map((stage) =>
                h(
                  'article',
                  { key: stage.id, className: 'th-card th-stage-card th-clickable-card', onClick: () => onPreview(stage) },
                  h(
                    'div',
                    { className: 'th-card-head' },
                    h(
                      'div',
                      { className: 'th-card-title' },
                      h('span', { className: 'th-card-glyph is-stage' }, h(Icon, { name: 'terminal', size: 18 })),
                      h('div', null, h('h3', null, stage.name), h('p', null, stage.description || t('common.noDescription'))),
                    ),
                    h(
                      'div',
                      { className: 'th-card-actions', onClick: (event) => event.stopPropagation() },
                      h(Button, { size: 'sm', variant: 'ghost', onClick: () => onPreview(stage) }, t('common.preview')),
                      h(IconButton, { icon: 'folder', label: t('stages.openFolder'), onClick: () => onOpenFolder(stage.id) }),
                      h(IconButton, { icon: 'edit', label: t('common.edit'), onClick: () => onEdit(stage) }),
                      h(IconButton, { icon: 'trash', label: t('common.delete'), onClick: () => onDelete(stage), className: 'th-danger-hover' }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'th-dataset-meta' },
                    h('span', { className: 'th-source-name' }, h(Icon, { name: 'terminal', size: 13 }), stage.command),
                    h('span', null, t('stages.inputCount', { n: (stage.inputs || []).length })),
                    h('span', null, t('stages.parameterCount', { n: (stage.parameters || []).length })),
                    h('span', null, t('stages.outputCount', { n: (stage.outputs || []).length })),
                    stage.timeoutSec > 0 ? h('span', null, `${t('stages.timeout')} ${stage.timeoutSec}s`) : null,
                    stage.assetKind
                      ? h('span', null, `${t('stages.assetFolder')} · ${stage.assetName}`)
                      : null,
                    h('span', null, usage(stage.id) > 0 ? t('stages.usedBy', { n: usage(stage.id) }) : t('stages.unused')),
                  ),
                  (stage.outputs || []).length > 0
                    ? h(
                        'div',
                        { className: 'th-column-chips' },
                        stage.outputs.slice(0, 8).map((output) => h('span', { key: output.id || output.name, className: 'th-column-chip' }, output.name)),
                        stage.outputs.length > 8
                          ? h('span', { className: 'th-column-chip is-more' }, `+${stage.outputs.length - 8}`)
                          : null,
                      )
                    : h('div', { className: 'th-column-chips' }, h('span', { className: 'th-stage-no-output' }, t('stages.noOutputs'))),
                  h(
                    'div',
                    { className: 'th-card-foot' },
                    h('span', null, `${t('common.updated')} ${formatDate(stage.updatedAt)}`),
                    h(
                      Button,
                      {
                        size: 'sm',
                        variant: 'ghost',
                        icon: 'edit',
                        // The whole card opens the preview; keep this action from
                        // also bubbling up and opening the preview behind the editor.
                        onClick: (event) => {
                          event.stopPropagation();
                          onEdit(stage);
                        },
                      },
                      t('common.edit'),
                    ),
                  ),
                ),
              ),
            ),
      );
    }

    function TemplateEditor({ initial, stages, datasets, t, saving, onClose, onSave }) {
      const library = stages || [];
      const stageById = new Map(library.map((stage) => [stage.id, stage]));
      const libraryOutputs = (stageId) => stageById.get(stageId)?.outputs || [];
      const libraryParameters = (stageId) => stageById.get(stageId)?.parameters || [];
      const makeParameter = () => ({
        id: uid('parameter'),
        key: '',
        type: 'string',
        defaultValue: '',
        description: '',
      });
      const [draft, setDraft] = useState(() =>
        initial
          ? {
              ...initial,
              parameters: (initial.parameters || []).map((parameter) => ({
                ...parameter,
                type: parameter.type || 'string',
              })),
              stages: initial.stages.map((entry) => ({
                id: entry.id,
                stageId: entry.stageId,
                inputs: (entry.inputs || []).map((binding) => ({ ...binding, source: binding.source ? { ...binding.source } : null })),
                parameters: (entry.parameters || []).map((binding) => ({
                  ...binding,
                  source: binding.source ? { ...binding.source } : null,
                })),
                inputRefs: (entry.inputRefs || []).map((reference) => ({ ...reference })),
              })),
            }
          : { name: '', description: '', parameters: [], stages: [] },
      );
      const [stageMenuOpen, setStageMenuOpen] = useState(false);
      const [error, setError] = useState('');
      const [dragIndex, setDragIndex] = useState(null);
      const [dragOverIndex, setDragOverIndex] = useState(null);
      const dragIndexRef = useRef(null);
      const dragGhostRef = useRef(null);
      const dragGhostMoveRef = useRef(null);

      const removeDragGhost = () => {
        if (dragGhostMoveRef.current) {
          for (const eventName of dragGhostMoveRef.current.events) {
            document.removeEventListener(eventName, dragGhostMoveRef.current.move, true);
          }
          dragGhostMoveRef.current = null;
        }
        if (dragGhostRef.current) {
          dragGhostRef.current.remove();
          dragGhostRef.current = null;
        }
      };

      const showDragGhost = (event) => {
        removeDragGhost();
        const handle = event.currentTarget;
        const card = handle?.closest?.('.th-stagebuilder-card');
        if (!card) return;
        const cardRect = card.getBoundingClientRect();
        const grabX = Math.max(0, Math.min(cardRect.width, event.clientX - cardRect.left));
        const grabY = Math.max(0, Math.min(cardRect.height, event.clientY - cardRect.top));
        const ghost = card.cloneNode(true);
        ghost.classList.add('th-drag-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.removeAttribute('draggable');
        ghost.style.pointerEvents = 'none';
        ghost.querySelectorAll('[draggable]').forEach((node) => node.removeAttribute('draggable'));
        const sourceFields = card.querySelectorAll('input, textarea, select');
        const clonedFields = ghost.querySelectorAll('input, textarea, select');
        for (let index = 0; index < sourceFields.length && index < clonedFields.length; index += 1) {
          const source = sourceFields[index];
          const target = clonedFields[index];
          if ('value' in target) {
            target.value = source.value;
            if (target.tagName === 'INPUT') target.setAttribute('value', source.value);
          }
        }
        ghost.style.width = `${cardRect.width}px`;
        ghost.style.left = `${event.clientX - grabX}px`;
        ghost.style.top = `${event.clientY - grabY}px`;
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
        const move = (moveEvent) => {
          if (typeof moveEvent.clientX !== 'number' || typeof moveEvent.clientY !== 'number') return;
          ghost.style.left = `${moveEvent.clientX - grabX}px`;
          ghost.style.top = `${moveEvent.clientY - grabY}px`;
        };
        const events = ['dragover', 'drag'];
        dragGhostMoveRef.current = { move, events };
        for (const eventName of events) document.addEventListener(eventName, move, true);
        const transparentImage = document.createElement('canvas');
        transparentImage.width = 1;
        transparentImage.height = 1;
        transparentImage.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;';
        document.body.appendChild(transparentImage);
        try {
          event.dataTransfer.setDragImage(transparentImage, 0, 0);
        } catch {
          // The DOM ghost still follows the pointer.
        }
        window.setTimeout(() => transparentImage.remove(), 0);
      };

      useEffect(
        () => () => {
          removeDragGhost();
        },
        [],
      );

      const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
      const addableStages = library.filter(
        (stage) => !draft.stages.some((entry) => entry.stageId === stage.id),
      );
      const addStage = (stageId) => {
        const stage = stageById.get(stageId);
        if (!stage) return;
        setDraft((current) => ({
          ...current,
          stages: [
            ...current.stages,
            { id: uid('stage'), stageId: stage.id, inputs: [], parameters: [], inputRefs: [] },
          ],
        }));
        setStageMenuOpen(false);
      };
      const isEarlierSource = (entries, index, source) => {
        if (!source) return false;
        if (source.kind === 'global') return true;
        const priorIndex = entries.findIndex((candidate) => candidate.id === source.stageId);
        return priorIndex >= 0 && priorIndex < index;
      };
      const sourceIsValid = (entries, index, source) => {
        if (!source) return false;
        if (!isEarlierSource(entries, index, source)) return false;
        if (source.kind === 'global') return true;
        const upstream = entries.find((candidate) => candidate.id === source.stageId);
        const pool = source.kind === 'output'
          ? libraryOutputs(upstream.stageId)
          : libraryParameters(upstream.stageId);
        return pool.some((item) => item.name === source.name);
      };
      const sanitizeBindings = (entries) =>
        entries.map((entry, index) => {
          const stage = stageById.get(entry.stageId);
          const declaredInputs = stage?.inputs || [];
          const declaredParameters = stage?.parameters || [];
          return {
            ...entry,
            inputs: (entry.inputs || [])
              .filter((binding) => declaredInputs.some((declaration) => declaration.name === binding.name))
              .map((binding) => ({
                ...binding,
                source: sourceIsValid(entries, index, binding.source) ? binding.source : null,
              })),
            parameters: (entry.parameters || [])
              .filter((binding) => declaredParameters.some((declaration) => declaration.name === binding.name))
              .map((binding) => ({
                ...binding,
                source: binding.source && sourceIsValid(entries, index, binding.source) ? binding.source : null,
              })),
          };
        });
      const encodeSource = (source) => {
        if (!source) return '';
        return source.kind === 'global' ? `global::${source.name}` : `${source.kind}:${source.stageId}:${source.name}`;
      };
      const decodeSource = (value) => {
        if (!value) return null;
        const first = value.indexOf(':');
        if (first < 0) return null;
        const kind = value.slice(0, first);
        if (kind === 'global') return { kind, stageId: '', name: value.slice(value.indexOf(':', first + 1) + 1) };
        if (kind !== 'output' && kind !== 'parameter') return null;
        const second = value.indexOf(':', first + 1);
        if (second < 0) return null;
        return { kind, stageId: value.slice(first + 1, second), name: value.slice(second + 1) };
      };
      // Options are filtered by the port type: a value can always feed a string
      // sink, otherwise the types must match.
      const sourceGroups = (priorEntries, globals, targetType = 'string') => {
        const accepts = (type) => portTypesCompatible(type, targetType);
        return [
          {
            id: 'outputs',
            label: t('templates.bindingOutputs'),
            options: priorEntries.flatMap(({ entry: priorEntry, stage: priorStage }) =>
              (priorStage?.outputs || [])
                .filter((output) => accepts(output.type || 'file'))
                .map((output) => ({
                  value: `output:${priorEntry.id}:${output.name}`,
                  label: `${priorStage.name} · ${output.name} · ${portTypeLabel(t, output.type || 'file')}`,
                })),
            ),
          },
          {
            id: 'parameters',
            label: t('templates.bindingParameters'),
            options: priorEntries.flatMap(({ entry: priorEntry, stage: priorStage }) =>
              (priorStage?.parameters || [])
                .filter((parameter) => accepts(parameter.type || 'string'))
                .map((parameter) => ({
                  value: `parameter:${priorEntry.id}:${parameter.name}`,
                  label: `${priorStage.name} · ${parameter.name} · ${portTypeLabel(t, parameter.type || 'string')}`,
                })),
            ),
          },
          {
            id: 'globals',
            label: t('templates.bindingGlobals'),
            options: (globals || [])
              .filter((parameter) => parameter.key.trim() !== '')
              .filter((parameter) => accepts(parameter.type || 'string'))
              .map((parameter) => ({
                value: `global::${parameter.key.trim()}`,
                label: `${parameter.key.trim()} · ${portTypeLabel(t, parameter.type || 'string')}`,
              })),
          },
        ];
      };
      const sourceType = (source) => {
        if (!source) return null;
        if (source.kind === 'global') {
          return draft.parameters.find((parameter) => parameter.key.trim() === source.name)?.type || 'string';
        }
        const upstream = draft.stages.find((candidate) => candidate.id === source.stageId);
        const upstreamStage = upstream ? stageById.get(upstream.stageId) : null;
        if (!upstreamStage) return null;
        if (source.kind === 'output') {
          return (upstreamStage.outputs || []).find((output) => output.name === source.name)?.type || 'file';
        }
        return (upstreamStage.parameters || []).find((parameter) => parameter.name === source.name)?.type || 'string';
      };
      const removeStage = (entryId) =>
        setDraft((current) => ({
          ...current,
          stages: sanitizeBindings(current.stages.filter((entry) => entry.id !== entryId)),
        }));
      const reorderStages = (from, to) =>
        setDraft((current) => {
          if (from === to || from < 0 || to < 0 || from >= current.stages.length || to >= current.stages.length) return current;
          const stages = [...current.stages];
          const [moved] = stages.splice(from, 1);
          stages.splice(to, 0, moved);
          return { ...current, stages: sanitizeBindings(stages) };
        });
      const moveStage = (entryId, direction) =>
        setDraft((current) => {
          const stages = [...current.stages];
          const index = stages.findIndex((entry) => entry.id === entryId);
          const next = index + direction;
          if (index < 0 || next < 0 || next >= stages.length) return current;
          [stages[index], stages[next]] = [stages[next], stages[index]];
          return { ...current, stages: sanitizeBindings(stages) };
        });
      const updateBinding = (entryId, section, name, source) =>
        setDraft((current) => ({
          ...current,
          stages: current.stages.map((entry) => {
            if (entry.id !== entryId) return entry;
            const bindings = [...(entry[section] || [])];
            const index = bindings.findIndex((binding) => binding.name === name);
            const next = {
              ...(index >= 0 ? bindings[index] : { id: uid('binding') }),
              name,
              source: source || null,
            };
            if (index >= 0) bindings[index] = next;
            else bindings.push(next);
            return { ...entry, [section]: bindings };
          }),
        }));
      const addParameter = () =>
        setDraft((current) => ({ ...current, parameters: [...current.parameters, makeParameter()] }));
      const updateParameter = (parameterId, patch) =>
        setDraft((current) => ({
          ...current,
          parameters: current.parameters.map((parameter) =>
            parameter.id === parameterId ? { ...parameter, ...patch } : parameter,
          ),
        }));
      const removeParameter = (parameterId) =>
        setDraft((current) => ({
          ...current,
          parameters: current.parameters.filter((parameter) => parameter.id !== parameterId),
        }));

      const submit = () => {
        const problems = [];
        if (draft.name.trim() === '') problems.push(t('templates.nameRequired'));
        if (draft.stages.length === 0) problems.push(t('templates.stageRequired'));
        const globalKeys = new Set(draft.parameters.map((parameter) => parameter.key.trim()).filter((key) => key !== ''));
        for (const [stageIndex, entry] of draft.stages.entries()) {
          const stage = stageById.get(entry.stageId);
          if (!stage) {
            problems.push(t('templates.stageMissing'));
            continue;
          }
          const priorEntries = draft.stages.slice(0, stageIndex);
          const sourceProblem = (source) => {
            if (!source) return 'missing';
            if (source.kind === 'global') return globalKeys.has(source.name) ? null : 'invalid';
            const upstream = priorEntries.find((candidate) => candidate.id === source.stageId);
            if (!upstream) return 'invalid';
            const pool = source.kind === 'output'
              ? libraryOutputs(upstream.stageId)
              : libraryParameters(upstream.stageId);
            return pool.some((item) => item.name === source.name) ? null : 'invalid';
          };
          const typeProblem = (source, declaration) => {
            if (!source) return null;
            const from = sourceType(source);
            if (from === null) return null;
            return portTypesCompatible(from, declaration.type || 'string')
              ? null
              : { expected: declaration.type || 'string', actual: from };
          };
          for (const declaration of stage.inputs || []) {
            const binding = (entry.inputs || []).find((candidate) => candidate.name === declaration.name);
            const problem = sourceProblem(binding?.source);
            const requiresBinding = declaration.required !== false;
            if (problem === 'missing') {
              if (requiresBinding) problems.push(t('templates.bindingRequired', { name: declaration.name }));
            } else if (problem === 'invalid') {
              problems.push(t('templates.bindingInvalid', { name: declaration.name }));
            } else if (binding?.source) {
              const mismatch = typeProblem(binding.source, declaration);
              if (mismatch) {
                problems.push(
                  t('templates.bindingTypeMismatch', {
                    name: declaration.name,
                    expected: portTypeLabel(t, mismatch.expected),
                    actual: portTypeLabel(t, mismatch.actual),
                  }),
                );
              }
            }
          }
          for (const declaration of stage.parameters || []) {
            const binding = (entry.parameters || []).find((candidate) => candidate.name === declaration.name);
            if (!binding?.source) continue;
            if (sourceProblem(binding.source)) {
              problems.push(t('templates.bindingInvalid', { name: declaration.name }));
              continue;
            }
            const mismatch = typeProblem(binding.source, declaration);
            if (mismatch) {
              problems.push(
                t('templates.bindingTypeMismatch', {
                  name: declaration.name,
                  expected: portTypeLabel(t, mismatch.expected),
                  actual: portTypeLabel(t, mismatch.actual),
                }),
              );
            }
          }
        }
        const keys = new Set();
        for (const parameter of draft.parameters) {
          const key = parameter.key.trim();
          if (key === '') problems.push(t('templates.parameterKeyRequired'));
          else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) problems.push(t('templates.parameterKeyInvalid'));
          else if (keys.has(key)) problems.push(t('templates.parameterKeyDuplicate'));
          keys.add(key);
          if (key !== '' && !portDefaultMatches(parameter.type || 'string', parameter.defaultValue)) {
            problems.push(
              t('stages.defaultInvalid', { name: key, type: portTypeLabel(t, parameter.type || 'string') }),
            );
          }
        }
        if (problems.length > 0) {
          setError([...new Set(problems)].join(' '));
          return;
        }
        const now = Date.now();
        const sanitized = sanitizeBindings(draft.stages);
        onSave({
          ...draft,
          id: initial?.id || uid('template'),
          name: draft.name.trim(),
          description: draft.description.trim(),
          createdAt: initial?.createdAt || now,
          updatedAt: now,
          parameters: draft.parameters.map((parameter) => ({
            ...parameter,
            key: parameter.key.trim(),
            type: parameter.type || 'string',
            defaultValue: parameter.defaultValue,
            description: parameter.description.trim(),
          })),
          stages: sanitized
            .filter((entry) => stageById.has(entry.stageId))
            .map((entry) => {
              const stage = stageById.get(entry.stageId);
              const bindingsFor = (section, declarations) =>
                (declarations || []).map((declaration) => {
                  const binding = (entry[section] || []).find((candidate) => candidate.name === declaration.name);
                  return {
                    id: binding?.id || uid('binding'),
                    name: declaration.name,
                    source: binding?.source || null,
                  };
                });
              return {
                id: entry.id,
                stageId: entry.stageId,
                inputs: bindingsFor('inputs', stage.inputs),
                parameters: bindingsFor('parameters', stage.parameters),
                inputRefs: (entry.inputRefs || []).map((reference) => ({
                  ...reference,
                  key: reference.key.trim(),
                })),
              };
            }),
        });
      };

      return h(
        Modal,
        {
          title: initial ? t('templates.editTitle') : t('templates.newTitle'),
          subtitle: t('templates.stagesHint'),
          onClose,
          t,
          width: 'min(900px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: saving }, t('common.cancel')),
            h(Button, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: saving }, saving ? t('common.saving') : t('common.save')),
          ],
        },
        h(
          'div',
          { className: 'th-form' },
          error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
          h(
            'div',
            { className: 'th-form-grid' },
            h(Field, { label: t('templates.name'), required: true, className: 'th-span-2' }, h('input', {
              className: 'th-input',
              value: draft.name,
              autoFocus: true,
              placeholder: t('templates.namePlaceholder'),
              onChange: (event) => update({ name: event.target.value }),
            })),
            h(Field, { label: t('templates.description'), className: 'th-span-2' }, h('textarea', {
              className: 'th-textarea',
              rows: 2,
              value: draft.description,
              placeholder: t('templates.descriptionPlaceholder'),
              onChange: (event) => update({ description: event.target.value }),
            })),
            h(Field, {
              label: t('templates.dataset'),
              hint: t('templates.datasetHint'),
              className: 'th-span-2',
            }, h(
              'select',
              {
                className: 'th-select',
                value: draft.datasetId || '',
                onChange: (event) => update({ datasetId: event.target.value }),
              },
              h('option', { value: '' }, t('templates.noDataset')),
              draft.datasetId && !(datasets || []).some((item) => item.id === draft.datasetId)
                ? h('option', { value: draft.datasetId }, t('templates.datasetMissing'))
                : null,
              (datasets || []).map((dataset) => h(
                'option',
                { key: dataset.id, value: dataset.id },
                `${dataset.name} · ${t('common.rows', { n: dataset.rowCount })}`,
              )),
            )),
          ),
          h(
            'div',
            { className: 'th-section-head' },
            h('div', null, h('h3', null, t('templates.parameters')), h('p', null, t('templates.parametersHint'))),
            h(Button, { size: 'sm', variant: 'ghost', icon: 'plus', onClick: addParameter }, t('templates.addParameter')),
          ),
          draft.parameters.length === 0
            ? h('div', { className: 'th-param-empty' }, t('templates.noParameters'))
            : h(
                'div',
                { className: 'th-param-list' },
                h(
                  'div',
                  { className: 'th-param-labels' },
                  h('span', null, t('templates.parameterKey')),
                  h('span', null, t('stages.type')),
                  h('span', null, t('templates.parameterDefault')),
                  h('span', null, t('templates.parameterDescription')),
                  h('span', null, ''),
                ),
                draft.parameters.map((parameter) =>
                  h(
                    'div',
                    { key: parameter.id, className: 'th-param-row' },
                    h('input', {
                      className: 'th-input th-mono',
                      value: parameter.key,
                      placeholder: t('templates.parameterKeyPlaceholder'),
                      'aria-label': t('templates.parameterKey'),
                      onChange: (event) => updateParameter(parameter.id, { key: event.target.value }),
                    }),
                    h(
                      'select',
                      {
                        className: 'th-select th-port-type',
                        value: parameter.type || 'string',
                        'aria-label': `${parameter.key || t('templates.parameterKey')} · ${t('stages.type')}`,
                        onChange: (event) => updateParameter(parameter.id, { type: event.target.value }),
                      },
                      PORT_PARAMETER_TYPES.map((type) => h('option', { key: type, value: type }, portTypeLabel(t, type))),
                    ),
                    h('input', {
                      className: 'th-input th-mono',
                      value: parameter.defaultValue,
                      placeholder: t('templates.parameterDefaultPlaceholder'),
                      'aria-label': t('templates.parameterDefault'),
                      onChange: (event) => updateParameter(parameter.id, { defaultValue: event.target.value }),
                    }),
                    h('input', {
                      className: 'th-input',
                      value: parameter.description,
                      placeholder: t('templates.parameterDescriptionPlaceholder'),
                      'aria-label': t('templates.parameterDescription'),
                      onChange: (event) => updateParameter(parameter.id, { description: event.target.value }),
                    }),
                    h(IconButton, {
                      icon: 'trash',
                      label: t('common.delete'),
                      onClick: () => removeParameter(parameter.id),
                      className: 'th-danger-hover',
                    }),
                  ),
                ),
              ),
          h(
            'div',
            { className: 'th-section-head' },
            h(
              'div',
              null,
              h('h3', null, t('templates.pipeline')),
              h('p', null, t('templates.stagesHint')),
              h('p', { className: 'th-section-subhint' }, t('templates.stageRefHint')),
            ),
          ),
          draft.stages.length === 0
            ? h(
                'div',
                { className: 'th-param-empty' },
                library.length === 0 ? t('templates.stageLibraryEmpty') : t('templates.noStagesHint'),
              )
            : h(
                'ol',
                { className: 'th-stagebuilder' },
                draft.stages.map((entry, index) => {
                  const stage = stageById.get(entry.stageId);
                  const outputs = stage?.outputs || [];
                  const priorEntries = draft.stages.slice(0, index).map((candidate) => ({
                    entry: candidate,
                    stage: stageById.get(candidate.stageId),
                  }));
                  return h(
                    'li',
                    {
                      key: entry.id,
                      className: cx(
                        'th-stagebuilder-item',
                        dragIndex === index && 'is-dragging',
                        dragOverIndex === index && dragIndex !== null && dragIndex !== index && 'is-drag-over',
                      ),
                      onDragOver: (event) => {
                        if (dragIndexRef.current === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        if (dragOverIndex !== index) setDragOverIndex(index);
                      },
                      onDragLeave: () => {
                        if (dragOverIndex === index) setDragOverIndex(null);
                      },
                      onDrop: (event) => {
                        event.preventDefault();
                        const from = dragIndexRef.current;
                        dragIndexRef.current = null;
                        setDragIndex(null);
                        setDragOverIndex(null);
                        removeDragGhost();
                        if (from !== null) reorderStages(from, index);
                      },
                    },
                    h('span', { className: 'th-stagebuilder-index' }, String(index + 1).padStart(2, '0')),
                    h(
                      'div',
                      { className: 'th-stagebuilder-card' },
                      h(
                        'div',
                        { className: 'th-stagebuilder-top' },
                        h(
                          'div',
                          { className: 'th-stage-ref' },
                          h('strong', { className: 'th-stage-ref-name' }, stage ? stage.name : t('templates.stageMissing')),
                          stage?.description ? h('span', { className: 'th-stage-ref-desc' }, stage.description) : null,
                          h(
                            'code',
                            { className: 'th-stage-ref-command' },
                            stage ? stage.command : '—',
                          ),
                        ),
                        h(
                          'div',
                          { className: 'th-stagebuilder-tools' },
                          h(
                            'span',
                            {
                              className: 'th-drag-handle',
                              draggable: true,
                              role: 'button',
                              tabIndex: -1,
                              title: t('templates.dragHandle'),
                              'aria-label': t('templates.dragHandle'),
                              onDragStart: (event) => {
                                dragIndexRef.current = index;
                                setDragIndex(index);
                                setDragOverIndex(index);
                                showDragGhost(event);
                                event.dataTransfer.effectAllowed = 'move';
                                try {
                                  event.dataTransfer.setData('text/plain', String(index));
                                } catch {
                                  // Some browsers do not expose a writable drag store.
                                }
                              },
                              onDragEnd: () => {
                                dragIndexRef.current = null;
                                setDragIndex(null);
                                setDragOverIndex(null);
                                removeDragGhost();
                              },
                            },
                            h(Icon, { name: 'grip', size: 15 }),
                          ),
                          h(IconButton, { icon: 'arrow-up', label: t('templates.moveUp'), onClick: () => moveStage(entry.id, -1), disabled: index === 0 }),
                          h(IconButton, { icon: 'arrow-down', label: t('templates.moveDown'), onClick: () => moveStage(entry.id, 1), disabled: index === draft.stages.length - 1 }),
                          h(IconButton, { icon: 'trash', label: t('templates.removeStage'), onClick: () => removeStage(entry.id), className: 'th-danger-hover' }),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'th-stage-io' },
                        h(
                          'div',
                          { className: 'th-stage-io-head' },
                          h(Icon, { name: 'folder', size: 13 }),
                          h('strong', null, t('stages.outputs')),
                        ),
                        outputs.length === 0
                          ? h('span', { className: 'th-input-source-empty' }, t('stages.noOutputs'))
                          : h(
                              'div',
                              { className: 'th-stage-output-chips' },
                              outputs.map((output) =>
                                h(
                                  'span',
                                  { key: output.id || output.name, className: 'th-stage-output-chip' },
                                  `${output.name} · ${output.file}`,
                                ),
                              ),
                            ),
                      ),
                      h(
                        'div',
                        { className: 'th-stage-io' },
                        h(
                          'div',
                          { className: 'th-stage-io-head' },
                          h(Icon, { name: 'external', size: 13 }),
                          h('strong', null, t('templates.bindings')),
                          h('span', null, t('templates.bindingsHint')),
                        ),
                        (stage?.inputs || []).length === 0 && (stage?.parameters || []).length === 0
                          ? h(
                              'span',
                              { className: 'th-input-source-empty' },
                              `${t('templates.bindingNoInputs')} · ${t('templates.bindingNoParameters')}`,
                            )
                          : null,
                        (stage?.inputs || []).length > 0
                          ? h(
                              'div',
                              { className: 'th-binding-list' },
                              h(
                                'div',
                                { className: 'th-binding-labels' },
                                h('span', null, t('templates.bindingInput')),
                                h('span', null, t('templates.bindingSource')),
                                h('span', null, ''),
                              ),
                              (stage.inputs || []).map((declaration) => {
                                const binding = (entry.inputs || []).find((candidate) => candidate.name === declaration.name);
                                const targetType = declaration.type || 'string';
                                const groups = sourceGroups(priorEntries, draft.parameters, targetType);
                                const hasOptions = groups.some((group) => group.options.length > 0);
                                const actualType = sourceType(binding?.source);
                                const mismatch = binding?.source && actualType
                                  ? !portTypesCompatible(actualType, targetType)
                                  : false;
                                const required = declaration.required !== false;
                                return h(
                                  'div',
                                  {
                                    key: declaration.name,
                                    className: cx('th-binding-row', (required && !binding?.source) || mismatch ? 'is-invalid' : null),
                                  },
                                  h(
                                    'span',
                                    { className: 'th-binding-name' },
                                    h('code', null, declaration.name),
                                    h('em', { className: 'th-port-type-badge' }, portTypeLabel(t, targetType)),
                                    required ? null : h('em', { className: 'th-port-optional', title: t('templates.bindingOptionalHint') }, t('stages.optional')),
                                  ),
                                  h(
                                    'select',
                                    {
                                      className: 'th-select',
                                      value: encodeSource(binding?.source),
                                      'aria-label': `${declaration.name} · ${t('templates.bindingSource')}`,
                                      onChange: (event) =>
                                        updateBinding(entry.id, 'inputs', declaration.name, decodeSource(event.target.value)),
                                    },
                                    h(
                                      'option',
                                      { value: '' },
                                      hasOptions ? t('templates.bindingUnbound') : t('templates.bindingNoSources'),
                                    ),
                                    groups.map((group) =>
                                      group.options.length === 0
                                        ? null
                                        : h(
                                            'optgroup',
                                            { key: group.id, label: group.label },
                                            group.options.map((option) =>
                                              h('option', { key: option.value, value: option.value }, option.label),
                                            ),
                                          ),
                                    ),
                                  ),
                                  h(
                                    'span',
                                    { className: cx('th-binding-default', mismatch && 'is-error') },
                                    mismatch
                                      ? t('templates.bindingTypeMismatch', {
                                          name: declaration.name,
                                          expected: portTypeLabel(t, targetType),
                                          actual: portTypeLabel(t, actualType),
                                        })
                                      : declaration.description || '',
                                  ),
                                );
                              }),
                            )
                          : null,
                        (stage?.parameters || []).length > 0
                          ? h(
                              'div',
                              { className: 'th-binding-list' },
                              h(
                                'div',
                                { className: 'th-binding-labels' },
                                h('span', null, t('templates.bindingParameter')),
                                h('span', null, t('templates.bindingSource')),
                                h('span', null, ''),
                              ),
                              (stage.parameters || []).map((declaration) => {
                                const binding = (entry.parameters || []).find((candidate) => candidate.name === declaration.name);
                                const targetType = declaration.type || 'string';
                                const groups = sourceGroups(priorEntries, draft.parameters, targetType);
                                const actualType = sourceType(binding?.source);
                                const mismatch = binding?.source && actualType
                                  ? !portTypesCompatible(actualType, targetType)
                                  : false;
                                return h(
                                  'div',
                                  {
                                    key: declaration.name,
                                    className: cx(
                                      'th-binding-row',
                                      (binding?.source && !sourceIsValid(draft.stages, index, binding.source)) || mismatch ? 'is-invalid' : null,
                                    ),
                                  },
                                  h(
                                    'span',
                                    { className: 'th-binding-name' },
                                    h('code', null, declaration.name),
                                    h('em', { className: 'th-port-type-badge' }, portTypeLabel(t, targetType)),
                                  ),
                                  h(
                                    'select',
                                    {
                                      className: 'th-select',
                                      value: encodeSource(binding?.source),
                                      'aria-label': `${declaration.name} · ${t('templates.bindingSource')}`,
                                      onChange: (event) =>
                                        updateBinding(entry.id, 'parameters', declaration.name, decodeSource(event.target.value)),
                                    },
                                    h(
                                      'option',
                                      { value: '' },
                                      t('templates.bindingUseDefault', { value: declaration.defaultValue || '""' }),
                                    ),
                                    groups.map((group) =>
                                      group.options.length === 0
                                        ? null
                                        : h(
                                            'optgroup',
                                            { key: group.id, label: group.label },
                                            group.options.map((option) =>
                                              h('option', { key: option.value, value: option.value }, option.label),
                                            ),
                                          ),
                                    ),
                                  ),
                                  h(
                                    'span',
                                    { className: cx('th-binding-default', mismatch && 'is-error') },
                                    mismatch
                                      ? t('templates.bindingTypeMismatch', {
                                          name: declaration.name,
                                          expected: portTypeLabel(t, targetType),
                                          actual: portTypeLabel(t, actualType),
                                        })
                                      : declaration.description || '',
                                  ),
                                );
                              }),
                            )
                          : null,
                      ),
                    ),
                  );
                }),
              ),
          h(
            'div',
            { className: 'th-pipeline-add' },
            h(
              Button,
              {
                variant: 'secondary',
                icon: 'plus',
                disabled: addableStages.length === 0,
                onClick: () => setStageMenuOpen((open) => !open),
                'aria-expanded': stageMenuOpen,
              },
              t('templates.addStage'),
            ),
            stageMenuOpen
              ? h(
                  'div',
                  { className: 'th-stage-menu', role: 'menu' },
                  addableStages.length === 0
                    ? h(
                        'div',
                        { className: 'th-stage-menu-empty' },
                        library.length === 0 ? t('templates.stageLibraryEmpty') : t('templates.noMoreStages'),
                      )
                    : addableStages.map((stage) =>
                        h(
                          'button',
                          {
                            key: stage.id,
                            type: 'button',
                            role: 'menuitem',
                            className: 'th-stage-menu-item',
                            onClick: () => addStage(stage.id),
                          },
                          h('strong', null, stage.name),
                          h('span', null, stage.command),
                        ),
                      ),
                )
              : null,
          ),
        ),
      );
    }

    function TemplatePreview({ template, stages, datasets, usageCount, t, onClose, onEdit, onOpenFolder }) {
      const dataset = (datasets || []).find((item) => item.id === template.datasetId) ?? null;
      return h(
        Modal,
        {
          title: template.name,
          subtitle: template.description || t('templates.previewTitle'),
          onClose,
          t,
          width: 'min(880px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close')),
            h(Button, { key: 'folder', variant: 'secondary', icon: 'folder', onClick: () => onOpenFolder(template.id) }, t('templates.openFolder')),
            h(Button, { key: 'edit', variant: 'primary', icon: 'edit', onClick: onEdit }, t('common.edit')),
          ],
        },
        h(
          'div',
          { className: 'th-template-preview' },
          h(
            'div',
            { className: 'th-preview-stats' },
            h('span', { className: 'th-format-pill' }, t('templates.stageCount', { n: template.stages.length })),
            h('span', null, `${t('templates.dataset')} · ${dataset ? dataset.name : (template.datasetId ? t('templates.datasetMissing') : t('templates.noDataset'))}`),
            h('span', null, t('templates.previewUsage', { n: usageCount })),
            h('span', null, `${t('common.updated')} ${formatDate(template.updatedAt)}`),
          ),
          template.parameters?.length
            ? h(
                'div',
                { className: 'th-template-parameters' },
                h(
                  'div',
                  { className: 'th-section-head th-section-head-tight' },
                  h('div', null, h('h3', null, t('templates.parameters')), h('p', null, t('templates.parametersHint'))),
                ),
                h(
                  'div',
                  { className: 'th-param-list th-preview-params' },
                  h(
                    'div',
                    { className: 'th-param-labels' },
                    h('span', null, t('templates.parameterKey')),
                    h('span', null, t('stages.type')),
                    h('span', null, t('templates.parameterDefault')),
                    h('span', null, t('templates.parameterDescription')),
                  ),
                  template.parameters.map((parameter) =>
                    h(
                      'div',
                      { key: parameter.id || parameter.key, className: 'th-param-row' },
                      h('code', { className: 'th-param-key' }, `{{${parameter.key}}}`),
                      h('em', { className: 'th-port-type-badge' }, portTypeLabel(t, parameter.type || 'string')),
                      h('code', { className: 'th-param-default' }, parameter.defaultValue || '—'),
                      h('span', { className: 'th-param-description' }, parameter.description || '—'),
                    ),
                  ),
                ),
              )
            : null,
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('templates.previewStages')), h('p', null, t('templates.orderLabel'))),
          ),
          template.stages.length === 0
            ? h('div', { className: 'th-preview-empty' }, t('templates.noStages'))
            : h(
                'ol',
                { className: 'th-preview-stage-list' },
                template.stages.map((entry, index) => {
                  const stage = (stages || []).find((candidate) => candidate.id === entry.stageId);
                  return h(
                    'li',
                    { key: entry.id, className: 'th-preview-stage' },
                    h('span', { className: 'th-preview-stage-index' }, String(index + 1).padStart(2, '0')),
                    h(
                      'div',
                      { className: 'th-preview-stage-body' },
                      h(
                        'div',
                        { className: 'th-preview-stage-title' },
                        h('strong', null, stage ? stage.name : t('templates.stageMissing')),
                        stage?.description ? h('span', null, stage.description) : null,
                      ),
                      h('div', { className: 'th-preview-command' }, h(Icon, { name: 'terminal', size: 13 }), h('code', null, stage?.command || '—')),
                      (stage?.outputs || []).length > 0
                        ? h(
                            'div',
                            { className: 'th-preview-args' },
                            h('span', null, t('templates.previewOutputs')),
                            (stage.outputs || []).map((output) =>
                              h('code', { key: output.id || output.name }, `${output.name} = ${output.file}`),
                            ),
                          )
                        : null,
                      (() => {
                        const describeSource = (source) => {
                          if (!source) return null;
                          if (source.kind === 'global') return `${t('templates.bindingGlobals')} · ${source.name}`;
                          const upstream = template.stages.find((candidate) => candidate.id === source.stageId);
                          if (!upstream) return null;
                          const upstreamStage = (stages || []).find((candidate) => candidate.id === upstream.stageId);
                          const kindLabel = source.kind === 'output' ? t('templates.bindingOutputs') : t('templates.bindingParameters');
                          return `${kindLabel} · ${upstreamStage?.name || t('templates.stageMissing')}.${source.name}`;
                        };
                        const lines = [
                          ...(entry.inputs || []).map((binding) => {
                            const described = describeSource(binding.source);
                            return described ? `${binding.name} ← ${described}` : null;
                          }),
                          ...(entry.parameters || []).map((binding) => {
                            const described = describeSource(binding.source);
                            if (described) return `${binding.name} ← ${described}`;
                            return `${binding.name} ← ${t('templates.bindingDefaultValue', { value: binding.defaultValue || '""' })}`;
                          }),
                          ...(entry.inputRefs || []).map((reference) => {
                            const upstream = template.stages.find((candidate) => candidate.id === reference.stageId);
                            if (!upstream) return null;
                            const upstreamStage = (stages || []).find((candidate) => candidate.id === upstream.stageId);
                            return `${reference.key || '?'} = ${upstreamStage?.name || t('templates.stageMissing')}.${reference.outputName}`;
                          }),
                        ].filter(Boolean);
                        if (lines.length === 0) return null;
                        return h(
                          'div',
                          { className: 'th-preview-args' },
                          h('span', null, t('templates.bindings')),
                          lines.map((line) => h('code', { key: line }, line)),
                        );
                      })(),
                    ),
                  );
                }),
              ),
        ),
      );
    }

    function DatasetEditor({ initial, t, saving, onClose, onSave }) {
      const [draft, setDraft] = useState(() =>
        initial
          ? {
              name: initial.name,
              description: initial.description,
              raw: initial.raw,
              sourceName: initial.sourceName,
            }
          : { name: '', description: '', raw: '', sourceName: '' },
      );
      const [error, setError] = useState('');
      const [dragging, setDragging] = useState(false);
      const inputRef = useRef(null);
      const detectedFormat = useMemo(
        () => detectDatasetFormat(draft.raw, draft.sourceName, initial?.format || 'jsonl'),
        [draft.raw, draft.sourceName, initial?.format],
      );
      const hasContent = draft.raw.trim() !== '';
      const parsed = useMemo(() => parseDatasetText(draft.raw, detectedFormat, 20), [draft.raw, detectedFormat]);

      const readFile = async (file) => {
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          setError(t('datasets.fileTooLarge'));
          return;
        }
        const lower = file.name.toLowerCase();
        if (!lower.endsWith('.jsonl') && !lower.endsWith('.csv')) {
          setError(t('datasets.unsupported'));
          return;
        }
        try {
          const raw = await file.text();
          setDraft((current) => ({
            ...current,
            raw,
            sourceName: file.name,
            name: current.name || file.name.replace(/\.(jsonl|csv)$/i, ''),
          }));
          setError('');
        } catch {
          setError(t('datasets.readError'));
        }
      };

      const submit = () => {
        if (draft.name.trim() === '') {
          setError(t('datasets.nameRequired'));
          return;
        }
        if (draft.raw.trim() === '') {
          setError(t('datasets.emptyRaw'));
          return;
        }
        if (parsed.error) {
          setError(t('datasets.parseError', { message: parsed.error }));
          return;
        }
        if (parsed.rowCount === 0) {
          setError(t('datasets.noRows'));
          return;
        }
        const now = Date.now();
        onSave({
          id: initial?.id || uid('dataset'),
          name: draft.name.trim(),
          description: draft.description.trim(),
          format: detectedFormat,
          raw: draft.raw,
          columns: parsed.columns,
          rowCount: parsed.rowCount,
          sourceName: draft.sourceName,
          createdAt: initial?.createdAt || now,
          updatedAt: now,
        });
      };

      return h(
        Modal,
        {
          title: initial ? t('datasets.editTitle') : t('datasets.newTitle'),
          subtitle: t('datasets.subtitle'),
          onClose,
          t,
          width: 'min(980px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: saving }, t('common.cancel')),
            h(Button, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: saving }, saving ? t('common.saving') : t('common.save')),
          ],
        },
        h(
          'div',
          { className: 'th-form' },
          error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
          h(
            'div',
            { className: 'th-form-grid' },
            h(Field, { label: t('datasets.name'), required: true }, h('input', {
              className: 'th-input',
              value: draft.name,
              autoFocus: true,
              placeholder: t('datasets.namePlaceholder'),
              onChange: (event) => setDraft((current) => ({ ...current, name: event.target.value })),
            })),
            h(Field, { label: t('datasets.detectedFormat') }, h(
              'div',
              { className: 'th-detected-format' },
              h('span', { className: 'th-format-pill' }, hasContent ? t(`datasets.${detectedFormat}`) : t('datasets.autoDetectPending')),
              h('span', { className: 'th-field-hint' }, t('datasets.autoDetectHint')),
            )),
            h(Field, { label: t('datasets.description'), className: 'th-span-2' }, h('input', {
              className: 'th-input',
              value: draft.description,
              placeholder: t('datasets.descriptionPlaceholder'),
              onChange: (event) => setDraft((current) => ({ ...current, description: event.target.value })),
            })),
          ),
          h(
            'div',
            {
              className: cx('th-dropzone', dragging && 'is-dragging'),
              onClick: () => inputRef.current?.click(),
              onDragOver: (event) => {
                event.preventDefault();
                setDragging(true);
              },
              onDragLeave: () => setDragging(false),
              onDrop: (event) => {
                event.preventDefault();
                setDragging(false);
                void readFile(event.dataTransfer.files?.[0]);
              },
              role: 'button',
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              },
            },
            h(Icon, { name: 'upload', size: 22 }),
            h('div', { className: 'th-dropzone-copy' }, h('strong', null, draft.sourceName || t('datasets.import')), h('span', null, draft.sourceName ? t('datasets.replaceFile') : t('datasets.drop'))),
            h('input', {
              ref: inputRef,
              type: 'file',
              accept: '.jsonl,.csv,application/json,text/csv',
              className: 'th-visually-hidden',
              onChange: (event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = '';
              },
            }),
          ),
          h(
            'div',
            { className: 'th-dataset-grid' },
            h(
              'div',
              { className: 'th-dataset-editor' },
              h('div', { className: 'th-section-head th-section-head-tight' }, h('div', null, h('h3', null, t('datasets.editor')), h('p', null, t('datasets.editorHint')))),
              h('textarea', {
                className: 'th-textarea th-codearea',
                value: draft.raw,
                placeholder: t(detectedFormat === 'csv' ? 'datasets.contentPlaceholderCsv' : 'datasets.contentPlaceholderJsonl'),
                spellCheck: false,
                onChange: (event) => setDraft((current) => ({ ...current, raw: event.target.value })),
              }),
            ),
            h(
              'div',
              { className: 'th-dataset-preview' },
              h(
                'div',
                { className: 'th-preview-head' },
                h('h3', null, t('datasets.preview')),
                h('span', null, `${t('common.rows', { n: parsed.rowCount })} · ${t('common.columns', { n: parsed.columns.length })}`),
              ),
              parsed.error
                ? h('div', { className: 'th-parse-error' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, t('datasets.parseError', { message: parsed.error })))
                : h(PreviewTable, { columns: parsed.columns, rows: parsed.rows, emptyLabel: t('datasets.noPreview'), maxRows: 6 }),
            ),
          ),
        ),
      );
    }

    function DatasetPreview({ dataset, t, onClose, onEdit, onOpenFolder }) {
      const parsed = useMemo(() => parseDatasetText(dataset.raw, dataset.format, 200), [dataset.raw, dataset.format]);
      return h(
        Modal,
        {
          title: dataset.name,
          subtitle: dataset.description || t('datasets.previewTitle'),
          onClose,
          t,
          width: 'min(1040px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close')),
            h(Button, { key: 'folder', variant: 'secondary', icon: 'folder', onClick: () => onOpenFolder(dataset.id) }, t('datasets.openFolder')),
            h(Button, { key: 'edit', variant: 'primary', icon: 'edit', onClick: onEdit }, t('common.edit')),
          ],
        },
        h(
          'div',
          { className: 'th-preview-detail' },
          h(
            'div',
            { className: 'th-preview-stats' },
            h('span', { className: 'th-format-pill' }, t(`datasets.${dataset.format}`)),
            h('span', null, `${t('datasets.rowsTotal')} ${dataset.rowCount}`),
            h('span', null, `${t('datasets.columnsTotal')} ${dataset.columns.length}`),
            h('span', null, `${t('common.updated')} ${formatDate(dataset.updatedAt)}`),
            dataset.sourceName ? h('span', { className: 'th-source-name' }, h(Icon, { name: 'file', size: 13 }), dataset.sourceName) : null,
          ),
          parsed.error
            ? h('div', { className: 'th-parse-error' }, t('datasets.parseError', { message: parsed.error }))
            : h(PreviewTable, { columns: parsed.columns, rows: parsed.rows, emptyLabel: t('datasets.noPreview'), maxRows: 20 }),
          h(
            'details',
            { className: 'th-raw-details' },
            h('summary', null, t('datasets.raw')),
            h('pre', null, dataset.raw.length > 20000 ? `${dataset.raw.slice(0, 20000)}\n…` : dataset.raw),
          ),
        ),
      );
    }

    function TasksPage({
      data,
      t,
      query,
      setQuery,
      filter,
      setFilter,
      onNew,
      onOpen,
      onEdit,
      onDelete,
      onRun,
      onStop,
      onOpenFolder,
      busyTaskId,
      stoppingRunId,
    }) {
      const tasks = data.tasks;
      const runs = data.runs;
      const datasets = data.datasets;
      const templates = data.templates;
      const runningCount = runs.filter((run) => run.status === 'running').length;
      const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return tasks
          .filter((task) => {
            const run = latestRunOf(task.id, runs);
            const status = run ? run.status : 'idle';
            if (filter !== 'all' && filter !== status) return false;
            if (needle === '') return true;
            const datasetNames = taskDatasetNames(task, templates, datasets);
            return (
              task.name.toLowerCase().includes(needle) ||
              task.description.toLowerCase().includes(needle) ||
              datasetNames.some((name) => name.toLowerCase().includes(needle)) ||
              task.groups.some((group) => group.name.toLowerCase().includes(needle))
            );
          })
          .sort((left, right) => right.updatedAt - left.updatedAt);
      }, [tasks, runs, datasets, query, filter]);
      const filters = [
        ['all', t('common.all')],
        ['running', t('status.running')],
        ['completed', t('status.completed')],
        ['failed', t('status.failed')],
        ['idle', t('status.idle')],
      ];

      return h(
        'div',
        { className: 'th-page' },
        h(
          'div',
          { className: 'th-pagehead' },
          h(
            'div',
            { className: 'th-pagehead-copy' },
            h('span', { className: 'th-kicker' }, t('tasks.kicker')),
            h('h1', null, t('tasks.title')),
            h('p', null, t('tasks.subtitle')),
          ),
          h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, t('tasks.new')),
        ),
        h(
          'div',
          { className: 'th-stats' },
          h(
            'div',
            { className: 'th-stat' },
            h('span', { className: 'th-stat-icon' }, h(Icon, { name: 'list', size: 18 })),
            h('div', null, h('strong', null, tasks.length), h('span', null, t('tasks.total'))),
          ),
          h(
            'div',
            { className: 'th-stat' },
            h('span', { className: 'th-stat-icon is-running' }, h(Icon, { name: 'play', size: 16 })),
            h('div', null, h('strong', null, runningCount), h('span', null, t('tasks.running'))),
          ),
          h(
            'div',
            { className: 'th-stat' },
            h('span', { className: 'th-stat-icon is-template' }, h(Icon, { name: 'layers', size: 18 })),
            h('div', null, h('strong', null, data.templates.length), h('span', null, t('tasks.templates'))),
          ),
          h(
            'div',
            { className: 'th-stat' },
            h('span', { className: 'th-stat-icon is-dataset' }, h(Icon, { name: 'database', size: 18 })),
            h('div', null, h('strong', null, data.datasets.length), h('span', null, t('tasks.datasets'))),
          ),
        ),
        h(
          'div',
          { className: 'th-toolbar' },
          h(
            'div',
            { className: 'th-search' },
            h(Icon, { name: 'search', size: 16 }),
            h('input', {
              className: 'th-input',
              type: 'search',
              value: query,
              placeholder: t('tasks.search'),
              'aria-label': t('tasks.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          h(
            'div',
            { className: 'th-segmented', role: 'group', 'aria-label': t('tasks.runStatus') },
            filters.map(([value, label]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  className: cx('th-segment', filter === value && 'is-active'),
                  'aria-pressed': filter === value,
                  onClick: () => setFilter(value),
                },
                label,
              ),
            ),
          ),
        ),
        rows.length === 0
          ? h(EmptyState, {
              icon: 'list',
              title: tasks.length === 0 ? t('tasks.empty') : t('common.none'),
              hint: tasks.length === 0 ? t('tasks.emptyHint') : t('tasks.search'),
              actionLabel: tasks.length === 0 ? t('tasks.emptyAction') : undefined,
              onAction: onNew,
            })
          : h(
              'div',
              { className: 'th-task-grid' },
              rows.map((task) => {
                const run = latestRunOf(task.id, runs);
                const status = run ? run.status : 'idle';
                const activeRun = runs.find((candidate) => candidate.taskId === task.id && candidate.status === 'running') ?? null;
                const datasetNames = taskDatasetNames(task, templates, datasets);
                const stageCount = task.groups.reduce((total, group) => total + group.stageConfigs.length, 0);
                const parameterGroups = task.groups
                  .map((group) => ({ group, parameters: parameterRowsForGroup(group, templates) }))
                  .filter((entry) => entry.parameters.length > 0);
                const busy = busyTaskId === task.id;
                return h(
                  'article',
                  {
                    key: task.id,
                    className: cx('th-taskcard', `is-${status}`),
                    onClick: () => onOpen(task),
                  },
                  h(
                    'div',
                    { className: 'th-taskcard-top' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'th-taskcard-title',
                        onClick: (event) => {
                          event.stopPropagation();
                          onOpen(task);
                        },
                      },
                      h('span', { className: 'th-taskcard-glyph' }, h(Icon, { name: 'cube', size: 18 })),
                      h(
                        'span',
                        { className: 'th-taskcard-copy' },
                        h('strong', null, task.name),
                        h('span', null, task.description || t('common.noDescription')),
                      ),
                    ),
                    h(StatusBadge, { status, t }),
                  ),
                  h(
                    'div',
                    { className: 'th-taskcard-meta' },
                    h('span', null, h(Icon, { name: 'database', size: 14 }), datasetNames.length > 0 ? datasetNames.join(' / ') : t('tasks.noDataset')),
                    h('span', null, h(Icon, { name: 'layers', size: 14 }), t('tasks.groups', { n: task.groups.length })),
                    h('span', null, h(Icon, { name: 'terminal', size: 14 }), t('tasks.stages', { n: stageCount })),
                    h('span', null, h(Icon, { name: 'clock', size: 14 }), formatDate(task.updatedAt)),
                  ),
                  h(
                    'div',
                    { className: 'th-taskcard-groups' },
                    task.groups.map((group) =>
                      h(
                        'span',
                        { key: group.id, className: cx('th-group-chip', `is-${group.role}`) },
                        h('span', { className: 'th-role-dot' }),
                        group.role === 'control' ? 'Control' : 'Treatment',
                        h('em', null, group.name),
                      ),
                    ),
                  ),
                  parameterGroups.length > 0
                    ? h(
                        'div',
                        { className: 'th-taskcard-params' },
                        h(
                          'div',
                          { className: 'th-taskcard-params-head' },
                          h(Icon, { name: 'settings', size: 12 }),
                          t('tasks.parameters'),
                        ),
                        h(
                          'div',
                          { className: 'th-taskcard-param-groups' },
                          parameterGroups.map((entry) =>
                            h(
                              'div',
                              { key: entry.group.id, className: 'th-taskcard-param-group' },
                              h('span', { className: 'th-taskcard-param-group-name' }, entry.group.name),
                              h(
                                'div',
                                { className: 'th-param-value-list' },
                                entry.parameters.map((parameter) =>
                                  h(
                                    'span',
                                    {
                                      key: parameter.key,
                                      className: 'th-param-value-chip',
                                      title: `${parameter.key}=${parameter.value}`,
                                    },
                                    `${parameter.key}=${parameter.value === '' ? '—' : parameter.value}`,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'th-taskcard-foot' },
                    h(
                      'div',
                      { className: 'th-taskcard-runmeta' },
                      run
                        ? h('span', null, `${t('tasks.latestRun')} · ${formatDate(run.startedAt)}`)
                        : h('span', null, t('tasks.noRun')),
                    ),
                    h(
                      'div',
                      { className: 'th-taskcard-actions', onClick: (event) => event.stopPropagation() },
                      h(Button, { size: 'sm', variant: 'ghost', onClick: () => onOpen(task) }, t('tasks.detail')),
                      run?.resultsDir
                        ? h(IconButton, { icon: 'folder', label: t('tasks.openTaskFolder'), onClick: () => onOpenFolder(run.id) })
                        : null,
                      h(
                        Button,
                        {
                          size: 'sm',
                          variant: 'primary',
                          icon: 'play',
                          disabled: busy,
                          onClick: () => onRun(task),
                        },
                        busy ? t('common.loading') : activeRun ? t('tasks.runAgain') : t('common.run'),
                      ),
                      activeRun
                        ? h(
                            Button,
                            {
                              size: 'sm',
                              variant: 'danger',
                              icon: 'stop',
                              disabled: stoppingRunId === activeRun.id,
                              onClick: () => onStop(task, activeRun),
                            },
                            t('tasks.stop'),
                          )
                        : null,
                      h(IconButton, { icon: 'edit', label: t('common.edit'), onClick: () => onEdit(task) }),
                      h(IconButton, { icon: 'trash', label: t('common.delete'), onClick: () => onDelete(task), className: 'th-danger-hover' }),
                    ),
                  ),
                );
              }),
            ),
      );
    }

    function TemplatesPage({ data, t, query, setQuery, onNew, onPreview, onEdit, onDelete, onOpenFolder, usage }) {
      const stageById = useMemo(() => new Map((data.stages || []).map((stage) => [stage.id, stage])), [data.stages]);
      const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return data.templates
          .filter((template) => {
            if (needle === '') return true;
            if (template.name.toLowerCase().includes(needle) || template.description.toLowerCase().includes(needle)) return true;
            return template.stages.some((entry) => {
              const stage = stageById.get(entry.stageId);
              return Boolean(stage) && (stage.name.toLowerCase().includes(needle) || stage.command.toLowerCase().includes(needle));
            });
          })
          .sort((left, right) => right.updatedAt - left.updatedAt);
      }, [data.templates, query, stageById]);

      return h(
        'div',
        { className: 'th-page' },
        h(
          'div',
          { className: 'th-pagehead' },
          h(
            'div',
            { className: 'th-pagehead-copy' },
            h('span', { className: 'th-kicker' }, t('templates.kicker')),
            h('h1', null, t('templates.title')),
            h('p', null, t('templates.subtitle')),
          ),
          h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, t('templates.new')),
        ),
        h(
          'div',
          { className: 'th-toolbar' },
          h(
            'div',
            { className: 'th-search' },
            h(Icon, { name: 'search', size: 16 }),
            h('input', {
              className: 'th-input',
              type: 'search',
              value: query,
              placeholder: t('templates.search'),
              'aria-label': t('templates.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          h('span', { className: 'th-toolbar-count' }, t('common.rows', { n: rows.length })),
        ),
        rows.length === 0
          ? h(EmptyState, {
              icon: 'layers',
              title: data.templates.length === 0 ? t('templates.empty') : t('common.none'),
              hint: data.templates.length === 0 ? t('templates.emptyHint') : t('templates.search'),
              actionLabel: data.templates.length === 0 ? t('templates.emptyAction') : undefined,
              onAction: onNew,
            })
          : h(
              'div',
              { className: 'th-card-grid' },
              rows.map((template) =>
                h(
                  'article',
                  {
                    key: template.id,
                    className: 'th-card th-template-card th-clickable-card',
                    onClick: () => onPreview(template),
                  },
                  h(
                    'div',
                    { className: 'th-card-head' },
                    h(
                      'div',
                      { className: 'th-card-title' },
                      h('span', { className: 'th-card-glyph is-template' }, h(Icon, { name: 'layers', size: 18 })),
                      h('div', null, h('h3', null, template.name), h('p', null, template.description || t('common.noDescription'))),
                    ),
                    h(
                      'div',
                      { className: 'th-card-actions', onClick: (event) => event.stopPropagation() },
                      h(Button, { size: 'sm', variant: 'ghost', onClick: () => onPreview(template) }, t('common.preview')),
                      h(IconButton, { icon: 'folder', label: t('templates.openFolder'), onClick: () => onOpenFolder(template.id) }),
                      h(IconButton, { icon: 'edit', label: t('common.edit'), onClick: () => onEdit(template) }),
                      h(IconButton, { icon: 'trash', label: t('common.delete'), onClick: () => onDelete(template), className: 'th-danger-hover' }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'th-card-foot' },
                    h(
                      'span',
                      null,
                      `${t('templates.stageCount', { n: template.stages.length })}${
                        template.parameters?.length ? ` · ${t('templates.parameterCount', { n: template.parameters.length })}` : ''
                      }`,
                    ),
                    h(
                      'span',
                      { className: 'th-card-dataset' },
                      h(Icon, { name: 'database', size: 12 }),
                      ' ',
                      (template.datasetId && (data.datasets || []).find((item) => item.id === template.datasetId)?.name)
                        || (template.datasetId ? t('templates.datasetMissing') : t('templates.noDataset')),
                    ),
                    h('span', null, usage(template.id) > 0 ? t('templates.usedBy', { n: usage(template.id) }) : t('common.updated') + ' ' + formatDate(template.updatedAt)),
                  ),
                ),
              ),
            ),
      );
    }

    function DatasetsPage({ data, t, query, setQuery, onNew, onPreview, onEdit, onDelete, onOpenFolder }) {
      const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return data.datasets
          .filter(
            (dataset) =>
              needle === '' ||
              dataset.name.toLowerCase().includes(needle) ||
              dataset.description.toLowerCase().includes(needle) ||
              dataset.columns.some((column) => column.toLowerCase().includes(needle)),
          )
          .sort((left, right) => right.updatedAt - left.updatedAt);
      }, [data.datasets, query]);

      return h(
        'div',
        { className: 'th-page' },
        h(
          'div',
          { className: 'th-pagehead' },
          h(
            'div',
            { className: 'th-pagehead-copy' },
            h('span', { className: 'th-kicker' }, t('datasets.kicker')),
            h('h1', null, t('datasets.title')),
            h('p', null, t('datasets.subtitle')),
          ),
          h(Button, { variant: 'primary', icon: 'plus', onClick: onNew }, t('datasets.new')),
        ),
        h(
          'div',
          { className: 'th-toolbar' },
          h(
            'div',
            { className: 'th-search' },
            h(Icon, { name: 'search', size: 16 }),
            h('input', {
              className: 'th-input',
              type: 'search',
              value: query,
              placeholder: t('datasets.search'),
              'aria-label': t('datasets.search'),
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          h('span', { className: 'th-toolbar-count' }, t('common.rows', { n: rows.length })),
        ),
        rows.length === 0
          ? h(EmptyState, {
              icon: 'database',
              title: data.datasets.length === 0 ? t('datasets.empty') : t('common.none'),
              hint: data.datasets.length === 0 ? t('datasets.emptyHint') : t('datasets.search'),
              actionLabel: data.datasets.length === 0 ? t('datasets.emptyAction') : undefined,
              onAction: onNew,
            })
          : h(
              'div',
              { className: 'th-card-grid' },
              rows.map((dataset) =>
                h(
                  'article',
                  { key: dataset.id, className: 'th-card th-dataset-card' },
                  h(
                    'div',
                    { className: 'th-card-head' },
                    h(
                      'div',
                      { className: 'th-card-title' },
                      h('span', { className: 'th-card-glyph is-dataset' }, h(Icon, { name: 'database', size: 18 })),
                      h('div', null, h('h3', null, dataset.name), h('p', null, dataset.description || t('common.noDescription'))),
                    ),
                    h(
                      'div',
                      { className: 'th-card-actions' },
                      h(Button, { size: 'sm', variant: 'ghost', onClick: () => onPreview(dataset) }, t('common.preview')),
                      h(IconButton, { icon: 'folder', label: t('datasets.openFolder'), onClick: () => onOpenFolder(dataset.id) }),
                      h(IconButton, { icon: 'edit', label: t('common.edit'), onClick: () => onEdit(dataset) }),
                      h(IconButton, { icon: 'trash', label: t('common.delete'), onClick: () => onDelete(dataset), className: 'th-danger-hover' }),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'th-dataset-meta' },
                    h('span', { className: 'th-format-pill' }, t(`datasets.${dataset.format}`)),
                    h('span', null, t('common.rows', { n: dataset.rowCount })),
                    h('span', null, t('common.columns', { n: dataset.columns.length })),
                    dataset.sourceName ? h('span', { className: 'th-source-name' }, h(Icon, { name: 'file', size: 13 }), dataset.sourceName) : null,
                  ),
                  h(
                    'div',
                    { className: 'th-column-chips' },
                    dataset.columns.slice(0, 8).map((column) => h('span', { key: column, className: 'th-column-chip' }, column)),
                    dataset.columns.length > 8 ? h('span', { className: 'th-column-chip is-more' }, `+${dataset.columns.length - 8}`) : null,
                  ),
                  h(
                    'div',
                    { className: 'th-card-foot' },
                    h('span', null, `${t('common.updated')} ${formatDate(dataset.updatedAt)}`),
                    h(Button, { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => onEdit(dataset) }, t('common.edit')),
                  ),
                ),
              ),
            ),
      );
    }

    function TaskDetail({ task, datasets, templates, runs, t, onClose, onEdit, onDelete, onRun, onStop, onOpenFolder, busy, stopping, stoppingRunId }) {
      const taskRuns = useMemo(() => runs.filter((run) => run.taskId === task.id), [runs, task.id]);
      const [selectedRunId, setSelectedRunId] = useState(taskRuns[0]?.id ?? null);
      const previousCount = useRef(taskRuns.length);
      useEffect(() => {
        if (taskRuns.length > previousCount.current) setSelectedRunId(taskRuns[0]?.id ?? null);
        previousCount.current = taskRuns.length;
      }, [taskRuns]);
      useEffect(() => {
        if (selectedRunId && taskRuns.some((run) => run.id === selectedRunId)) return;
        setSelectedRunId(taskRuns[0]?.id ?? null);
      }, [selectedRunId, taskRuns]);
      const selectedRun = taskRuns.find((run) => run.id === selectedRunId) ?? taskRuns[0] ?? null;
      const activeRun = taskRuns.find((run) => run.status === 'running') ?? null;
      const selectedRunning = selectedRun?.status === 'running';
      const stageCount = task.groups.reduce((total, group) => total + group.stageConfigs.length, 0);
      const datasetNames = taskDatasetNames(task, templates, datasets);

      return h(
        Modal,
        {
          title: task.name,
          subtitle: task.description || t('tasks.detail'),
          onClose,
          t,
          width: 'min(1080px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'delete', variant: 'ghost', icon: 'trash', onClick: () => onDelete(task), className: 'th-danger-hover' }, t('common.delete')),
            h('span', { key: 'spacer', className: 'th-footer-spacer' }),
            h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close')),
            h(Button, { key: 'edit', variant: 'secondary', icon: 'edit', onClick: () => onEdit(task) }, t('common.edit')),
            selectedRunning
              ? h(Button, { key: 'stop', variant: 'danger', icon: 'stop', disabled: stopping || stoppingRunId === selectedRun?.id, onClick: () => onStop(task, selectedRun) }, t('tasks.stop'))
              : null,
            h(
              Button,
              { key: 'run', variant: 'primary', icon: 'play', disabled: busy, onClick: () => onRun(task) },
              busy ? t('common.loading') : activeRun ? t('tasks.runAgain') : t('tasks.run'),
            ),
          ],
        },
        h(
          'div',
          { className: 'th-detail' },
          h(
            'div',
            { className: 'th-detail-grid' },
            h(
              'div',
              { className: 'th-detail-stat' },
              h('span', null, t('tasks.dataset')),
              h('strong', null, datasetNames.length > 0 ? datasetNames.join(' / ') : t('tasks.noDataset')),
            ),
            h(
              'div',
              { className: 'th-detail-stat' },
              h('span', null, t('tasks.groupsTitle')),
              h('strong', null, t('tasks.groups', { n: task.groups.length })),
            ),
            h(
              'div',
              { className: 'th-detail-stat' },
              h('span', null, t('tasks.stagesLabel')),
              h('strong', null, t('tasks.stages', { n: stageCount })),
            ),
            h(
              'div',
              { className: 'th-detail-stat' },
              h('span', null, t('common.updated')),
              h('strong', null, formatDate(task.updatedAt)),
            ),
          ),
          task.cwd ? h('div', { className: 'th-run-cwd' }, h(Icon, { name: 'folder', size: 14 }), h('code', null, task.cwd)) : null,
          h(
            'div',
            { className: 'th-detail-groups' },
            task.groups.map((group) => {
              const runGroup = selectedRun?.groups.find((candidate) => candidate.id === group.id);
              const progress = groupProgress(runGroup, group.stageConfigs);
              const status = runGroup?.status ?? 'idle';
              const datasetId = groupDatasetId(group, task, templates);
              const datasetName = datasetId
                ? (datasets || []).find((item) => item.id === datasetId)?.name || t('templates.datasetMissing')
                : t('tasks.noDataset');
              return h(
                'div',
                { key: group.id, className: cx('th-detail-group', `is-${group.role}`) },
                h('span', { className: cx('th-role-badge', `is-${group.role}`) }, group.role === 'control' ? 'Control' : 'Treatment'),
                h('strong', null, group.name),
                h(StatusBadge, { status, t }),
                h('span', { className: 'th-detail-dataset' }, h(Icon, { name: 'database', size: 12 }), ' ', datasetName),
                h('span', { className: 'th-detail-progress-text' }, t('tasks.stagesProgress', { done: progress.done, total: progress.total })),
                h(
                  'div',
                  { className: 'th-progressbar th-detail-progressbar', 'aria-hidden': 'true' },
                  h('span', { style: { width: `${progress.percent}%` } }),
                ),
                h(
                  'div',
                  { className: 'th-detail-commands' },
                  group.stageConfigs.map((stage) => h('code', { key: stage.stageId }, [stage.command, stage.args].filter(Boolean).join(' '))),
                ),
                selectedRun && (runGroup?.resultsDir || selectedRun.resultsDir)
                  ? h(IconButton, {
                      icon: 'folder',
                      label: t('tasks.openGroupFolder'),
                      onClick: (event) => {
                        event.stopPropagation();
                        onOpenFolder(selectedRun.id, group.id);
                      },
                    })
                  : null,
              );
            }),
          ),
          h(
            'div',
            { className: 'th-section-head th-section-head-tight' },
            h('div', null, h('h3', null, t('tasks.history')), h('p', null, selectedRun ? `${t('run.started')} ${formatDate(selectedRun.startedAt)}` : t('tasks.noRun'))),
            taskRuns.length > 1
              ? h(
                  'select',
                  {
                    className: 'th-select th-run-select',
                    value: selectedRun?.id ?? '',
                    'aria-label': t('run.select'),
                    onChange: (event) => setSelectedRunId(event.target.value),
                  },
                  taskRuns.map((run) => h('option', { key: run.id, value: run.id }, `${formatDate(run.startedAt)} · ${t(`run.${run.status}`)}`)),
                )
              : null,
          ),
          h(RunView, { run: selectedRun, t, onOpenFolder }),
        ),
      );
    }

    function WorkspaceSettings({ settings, t, onClose, onSave, onReset, onImported }) {
      const defaultWorkspace = settings?.defaultWorkspace || settings?.workspace || '';
      const [pathValue, setPathValue] = useState(settings?.configured || '');
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [resetConfirming, setResetConfirming] = useState(false);
      const [resetBusy, setResetBusy] = useState(false);
      const [resetError, setResetError] = useState('');
      const [includeTasks, setIncludeTasks] = useState(false);
      const [exportBusy, setExportBusy] = useState(false);
      const [importBusy, setImportBusy] = useState(false);
      const [bundleError, setBundleError] = useState('');
      const fileInputRef = useRef(null);
      const effective = pathValue.trim() || defaultWorkspace;
      const locked = busy || resetBusy || exportBusy || importBusy;
      const submit = async () => {
        setBusy(true);
        setError('');
        const result = await onSave(pathValue.trim());
        setBusy(false);
        if (result.ok) onClose();
        else setError(result.message || t('workspace.saveFailed', { message: '' }));
      };
      const reset = async () => {
        setResetBusy(true);
        setResetError('');
        const result = await onReset();
        setResetBusy(false);
        if (result.ok) onClose();
        else setResetError(result.message || t('workspace.resetFailed', { message: '' }));
      };
      const exportBundle = async () => {
        setExportBusy(true);
        setBundleError('');
        try {
          const response = await fetch(
            `${API_BASE}/workspace/export?includeTasks=${includeTasks ? '1' : '0'}`,
            { cache: 'no-store', credentials: 'same-origin' },
          );
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
          triggerDownload(url, `techhub-workspace-${stamp}.zip`);
          window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (caught) {
          setBundleError(t('workspace.exportFailed', { message: caught instanceof Error ? caught.message : String(caught) }));
        } finally {
          setExportBusy(false);
        }
      };
      const importBundle = async (file) => {
        if (!file) return;
        if (!window.confirm(t('workspace.importConfirm'))) {
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        setImportBusy(true);
        setBundleError('');
        try {
          const response = await fetch(`${API_BASE}/workspace/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/zip' },
            credentials: 'same-origin',
            body: file,
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          if (onImported) await onImported(payload);
          onClose();
        } catch (caught) {
          setBundleError(t('workspace.importFailed', { message: caught instanceof Error ? caught.message : String(caught) }));
        } finally {
          setImportBusy(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      return h(
        Modal,
        {
          title: t('workspace.title'),
          subtitle: t('workspace.subtitle'),
          onClose: locked ? () => {} : onClose,
          t,
          width: 'min(640px, calc(100vw - 24px))',
          footer: [
            h(Button, { key: 'cancel', variant: 'ghost', onClick: onClose, disabled: locked }, t('common.cancel')),
            h(Button, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: locked }, busy ? t('common.saving') : t('common.save')),
          ],
        },
        h(
          'div',
          { className: 'th-form' },
          error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
          h(
            Field,
            { label: t('workspace.path'), hint: t('workspace.hint') },
            h('input', {
              className: 'th-input th-mono',
              value: pathValue,
              placeholder: defaultWorkspace || t('workspace.placeholder'),
              autoFocus: true,
              onChange: (event) => setPathValue(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') submit();
              },
            }),
          ),
          h(
            'div',
            { className: 'th-workspace-preview' },
            h(Icon, { name: 'folder', size: 16 }),
            h(
              'div',
              null,
              h('span', null, t('workspace.current')),
              h('code', null, effective || '—'),
            ),
          ),
          h(
            'div',
            { className: 'th-workspace-actions' },
            h(
              Button,
              {
                variant: 'ghost',
                size: 'sm',
                onClick: () => {
                  setPathValue('');
                  setError('');
                },
              },
              t('workspace.useDefault'),
            ),
            h('span', null, t('workspace.defaultPath', { path: defaultWorkspace || '—' })),
          ),
          h(
            'div',
            { className: 'th-workspace-bundle' },
            h(
              'div',
              { className: 'th-workspace-bundle-head' },
              h(Icon, { name: 'cube', size: 16 }),
              h('strong', null, t('workspace.bundleTitle')),
            ),
            h('p', null, t('workspace.bundleHint')),
            h(
              'label',
              { className: 'th-workspace-check' },
              h('input', {
                type: 'checkbox',
                checked: includeTasks,
                disabled: locked,
                onChange: (event) => setIncludeTasks(event.target.checked),
              }),
              h('span', null, t('workspace.includeTasks')),
              h('em', null, t('workspace.includeTasksHint')),
            ),
            bundleError ? h('div', { className: 'th-form-error', role: 'alert' }, h('span', null, bundleError)) : null,
            h(
              'div',
              { className: 'th-workspace-bundle-actions' },
              h(
                Button,
                {
                  size: 'sm',
                  variant: 'secondary',
                  icon: 'download',
                  disabled: locked,
                  onClick: exportBundle,
                },
                exportBusy ? t('workspace.exporting') : t('workspace.export'),
              ),
              h(
                Button,
                {
                  size: 'sm',
                  variant: 'ghost',
                  icon: 'upload',
                  disabled: locked,
                  onClick: () => fileInputRef.current?.click(),
                },
                importBusy ? t('workspace.importing') : t('workspace.import'),
              ),
              h('input', {
                ref: fileInputRef,
                type: 'file',
                accept: '.zip,application/zip',
                style: { display: 'none' },
                onChange: (event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBundle(file);
                },
              }),
            ),
          ),
          h(
            'div',
            { className: 'th-danger-zone' },
            h(
              'div',
              { className: 'th-danger-title' },
              h(Icon, { name: 'alert', size: 16 }),
              h('strong', null, t('workspace.resetTitle')),
            ),
            h('p', null, t('workspace.resetHint')),
            resetError ? h('div', { className: 'th-form-error', role: 'alert' }, h('span', null, resetError)) : null,
            resetConfirming
              ? h(
                  'div',
                  { className: 'th-danger-actions' },
                  h(
                    Button,
                    {
                      variant: 'ghost',
                      size: 'sm',
                      disabled: resetBusy,
                      onClick: () => {
                        setResetConfirming(false);
                        setResetError('');
                      },
                    },
                    t('common.cancel'),
                  ),
                  h(
                    Button,
                    { variant: 'danger', size: 'sm', icon: 'trash', disabled: resetBusy, onClick: reset },
                    resetBusy ? t('workspace.resetBusy') : t('workspace.resetConfirm'),
                  ),
                )
              : h(
                  Button,
                  { variant: 'danger', size: 'sm', icon: 'trash', onClick: () => setResetConfirming(true), disabled: locked },
                  t('workspace.resetTitle'),
                ),
          ),
        ),
      );
    }

    function ThemePicker({ value, t, onClose, onSelect, saving }) {
      return h(
        Modal,
        {
          title: t('theme.title'),
          subtitle: t('theme.subtitle'),
          onClose,
          t,
          width: 'min(620px, calc(100vw - 24px))',
          footer: [h(Button, { key: 'close', variant: 'ghost', onClick: onClose }, t('common.close'))],
        },
        h(
          'div',
          { className: 'th-theme-grid' },
          THEME_PRESETS.map((preset) =>
            h(
              'button',
              {
                key: preset.id,
                type: 'button',
                className: cx('th-theme-card', value === preset.id && 'is-active'),
                'aria-pressed': value === preset.id,
                disabled: saving,
                onClick: () => onSelect(preset.id),
              },
              h('span', {
                className: 'th-theme-swatch',
                style: {
                  background: `linear-gradient(135deg, ${preset.colors[0]} 0 38%, ${preset.colors[1]} 38% 70%, ${preset.colors[2]} 70%)`,
                },
              }),
              h(
                'span',
                { className: 'th-theme-copy' },
                h('strong', null, t(preset.label)),
                h('span', null, t(preset.hint)),
              ),
              value === preset.id
                ? h('span', { className: 'th-theme-check' }, h(Icon, { name: 'check', size: 15 }), t('theme.current'))
                : null,
            ),
          ),
        ),
      );
    }

    function safeMarkdownHref(value) {
      const href = String(value || '').trim();
      return /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/)/i.test(href) ? href : null;
    }

    function renderInlineMarkdown(text, prefix = 'md') {
      const source = String(text ?? '');
      const nodes = [];
      const pattern = /(`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\(([^)]+)\))/g;
      let cursor = 0;
      let key = 0;
      let match;
      while ((match = pattern.exec(source))) {
        if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
        if (match[2] !== undefined) {
          nodes.push(h('code', { key: `${prefix}-code-${key}` }, match[2]));
        } else if (match[3] !== undefined || match[4] !== undefined) {
          const inner = match[3] !== undefined ? match[3] : match[4];
          nodes.push(h('strong', { key: `${prefix}-strong-${key}` }, ...renderInlineMarkdown(inner, `${prefix}-strong-${key}`)));
        } else if (match[5] !== undefined || match[6] !== undefined) {
          const inner = match[5] !== undefined ? match[5] : match[6];
          nodes.push(h('em', { key: `${prefix}-em-${key}` }, ...renderInlineMarkdown(inner, `${prefix}-em-${key}`)));
        } else {
          const label = match[7];
          const href = safeMarkdownHref(match[8]);
          if (href) {
            nodes.push(
              h(
                'a',
                { key: `${prefix}-link-${key}`, href, target: '_blank', rel: 'noreferrer' },
                ...renderInlineMarkdown(label, `${prefix}-link-${key}`),
              ),
            );
          } else {
            nodes.push(...renderInlineMarkdown(label, `${prefix}-label-${key}`));
          }
        }
        cursor = pattern.lastIndex;
        key += 1;
      }
      if (cursor < source.length) nodes.push(source.slice(cursor));
      return nodes;
    }

    function markdownTableCells(line) {
      return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
    }

    function isMarkdownTableSeparator(line) {
      return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
    }

    function isMarkdownBlockStart(line) {
      return /^\s*(#{1,6}\s|```|>\s?|[-*+]\s|\d+\.\s|---+\s*$|\*\*\*+\s*$|___+\s*$)/.test(line);
    }

    function renderMarkdownBlocks(markdown, prefix = 'md') {
      const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
      const nodes = [];
      let index = 0;
      let key = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
          index += 1;
          continue;
        }
        const fence = /^\s*```([A-Za-z0-9_-]*)\s*$/.exec(line);
        if (fence) {
          const language = fence[1];
          const code = [];
          index += 1;
          while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
            code.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          nodes.push(
            h(
              'pre',
              { key: `${prefix}-codeblock-${key}` },
              h('code', { className: language ? `language-${language}` : undefined }, code.join('\n')),
            ),
          );
          key += 1;
          continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
          const level = heading[1].length;
          nodes.push(
            h(
              `h${level}`,
              { key: `${prefix}-heading-${key}` },
              ...renderInlineMarkdown(heading[2], `${prefix}-heading-${key}`),
            ),
          );
          key += 1;
          index += 1;
          continue;
        }
        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
          nodes.push(h('hr', { key: `${prefix}-hr-${key}` }));
          key += 1;
          index += 1;
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = [];
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''));
            index += 1;
          }
          nodes.push(
            h('blockquote', { key: `${prefix}-quote-${key}` }, ...renderMarkdownBlocks(quote.join('\n'), `${prefix}-quote-${key}`)),
          );
          key += 1;
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
          const ordered = /^\s*\d+\.\s+/.test(line);
          const items = [];
          const itemPattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
          while (index < lines.length) {
            const item = itemPattern.exec(lines[index]);
            if (!item) break;
            items.push(item[1]);
            index += 1;
          }
          nodes.push(
            h(
              ordered ? 'ol' : 'ul',
              { key: `${prefix}-list-${key}` },
              items.map((item, itemIndex) =>
                h('li', { key: `${prefix}-item-${key}-${itemIndex}` }, ...renderInlineMarkdown(item, `${prefix}-item-${key}-${itemIndex}`)),
              ),
            ),
          );
          key += 1;
          continue;
        }
        if (line.includes('|') && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
          const header = markdownTableCells(line);
          const rows = [];
          index += 2;
          while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
            rows.push(markdownTableCells(lines[index]));
            index += 1;
          }
          nodes.push(
            h(
              'table',
              { key: `${prefix}-table-${key}` },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  header.map((cell, cellIndex) =>
                    h(
                      'th',
                      { key: `${prefix}-th-${key}-${cellIndex}` },
                      ...renderInlineMarkdown(cell, `${prefix}-th-${key}-${cellIndex}`),
                    ),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                rows.map((row, rowIndex) =>
                  h(
                    'tr',
                    { key: `${prefix}-tr-${key}-${rowIndex}` },
                    header.map((_, cellIndex) =>
                      h(
                        'td',
                        { key: `${prefix}-td-${key}-${rowIndex}-${cellIndex}` },
                        ...renderInlineMarkdown(row[cellIndex] || '', `${prefix}-td-${key}-${rowIndex}-${cellIndex}`),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
          key += 1;
          continue;
        }
        const paragraph = [line.trim()];
        index += 1;
        while (index < lines.length && lines[index].trim() !== '' && !isMarkdownBlockStart(lines[index])) {
          paragraph.push(lines[index].trim());
          index += 1;
        }
        nodes.push(
          h('p', { key: `${prefix}-paragraph-${key}` }, ...renderInlineMarkdown(paragraph.join(' '), `${prefix}-paragraph-${key}`)),
        );
        key += 1;
      }
      return nodes;
    }

    function MarkdownView({ markdown }) {
      return h('div', { className: 'th-markdown' }, ...renderMarkdownBlocks(markdown));
    }

    function DocsPage({ t, pushToast }) {
      const [text, setText] = useState('');
      const [savedText, setSavedText] = useState('');
      const [phase, setPhase] = useState('loading');
      const [error, setError] = useState('');
      const [saving, setSaving] = useState(false);
      const [editing, setEditing] = useState(false);
      const dirty = text !== savedText;

      useEffect(() => {
        let cancelled = false;
        const load = async () => {
          try {
            const response = await fetch(`${API_BASE}/guide`, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            }
            const markdown = await response.text();
            if (cancelled) return;
            setText(markdown);
            setSavedText(markdown);
            setPhase('ready');
            setError('');
          } catch (caught) {
            if (cancelled) return;
            setError(t('docs.loadFailed', { message: caught instanceof Error ? caught.message : String(caught) }));
            setPhase('error');
          }
        };
        void load();
        return () => {
          cancelled = true;
        };
      }, [t]);

      const save = async () => {
        if (saving || phase !== 'ready') return;
        setSaving(true);
        setError('');
        try {
          const response = await fetch(`${API_BASE}/guide`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ markdown: text }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          setSavedText(text);
          setEditing(false);
          pushToast(t('docs.saved'), 'success');
        } catch (caught) {
          setError(t('docs.saveFailed', { message: caught instanceof Error ? caught.message : String(caught) }));
        } finally {
          setSaving(false);
        }
      };

      return h(
        'div',
        { className: 'th-page th-docs-page' },
        h(
          'div',
          { className: 'th-pagehead' },
          h(
            'div',
            { className: 'th-pagehead-copy' },
            h('span', { className: 'th-kicker' }, t('docs.kicker')),
            h('h1', null, t('docs.title')),
            h('p', null, t('docs.subtitle')),
          ),
          h(
            'div',
            { className: 'th-docs-actions' },
            editing
              ? [
                  h(
                    Button,
                    {
                      key: 'cancel',
                      variant: 'ghost',
                      onClick: () => {
                        setText(savedText);
                        setEditing(false);
                        setError('');
                      },
                      disabled: saving,
                    },
                    t('common.cancel'),
                  ),
                  h(
                    Button,
                    {
                      key: 'save',
                      variant: 'primary',
                      icon: 'save',
                      onClick: save,
                      disabled: saving || phase !== 'ready',
                    },
                    saving ? t('docs.saving') : t('docs.save'),
                  ),
                ]
              : h(
                  Button,
                  {
                    variant: 'primary',
                    icon: 'edit',
                    onClick: () => setEditing(true),
                    disabled: phase !== 'ready',
                  },
                  t('docs.edit'),
                ),
          ),
        ),
        h(
          'div',
          { className: 'th-docs-toolbar' },
          h('span', null, t('docs.characters', { n: text.length })),
          h(
            'span',
            { className: cx('th-docs-state', editing && dirty && 'is-dirty') },
            editing ? (dirty ? t('docs.unsaved') : t('docs.savedHint')) : t('docs.readonly'),
          ),
          h('span', { className: 'th-docs-hint' }, editing ? t('docs.editHint') : t('docs.readonlyHint')),
        ),
        error ? h('div', { className: 'th-form-error', role: 'alert' }, h(Icon, { name: 'alert', size: 16 }), h('span', null, error)) : null,
        phase === 'loading'
          ? h('div', { className: 'th-docs-loading' }, h(Spinner, { label: t('docs.loading') }))
          : editing
            ? h('textarea', {
                className: 'th-docs-editor',
                value: text,
                spellCheck: false,
                placeholder: t('docs.placeholder'),
                'aria-label': t('docs.editorLabel'),
                onChange: (event) => setText(event.target.value),
                onKeyDown: (event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    void save();
                  }
                },
              })
            : h(
                'div',
                { className: 'th-docs-readonly', 'aria-label': t('docs.editorLabel') },
                text ? h(MarkdownView, { markdown: text }) : t('docs.placeholder'),
              ),
      );
    }

    function TechHubPage(props) {
      const [data, setData] = useState(null);
      const [phase, setPhase] = useState('loading');
      const [loadError, setLoadError] = useState('');
      const [tab, setTab] = useState(() => {
        try {
          return localStorage.getItem(TAB_KEY) || 'tasks';
        } catch {
          return 'tasks';
        }
      });
      const [taskQuery, setTaskQuery] = useState('');
      const [templateQuery, setTemplateQuery] = useState('');
      const [stageQuery, setStageQuery] = useState('');
      const [datasetQuery, setDatasetQuery] = useState('');
      const [taskFilter, setTaskFilter] = useState('all');
      const [saving, setSaving] = useState(false);
      const [busyTaskId, setBusyTaskId] = useState(null);
      const [stoppingRunId, setStoppingRunId] = useState(null);
      const [taskEditor, setTaskEditor] = useState(null);
      const [templateEditor, setTemplateEditor] = useState(null);
      const [stageEditor, setStageEditor] = useState(null);
      const [datasetEditor, setDatasetEditor] = useState(null);
      const [workspaceOpen, setWorkspaceOpen] = useState(false);
      const [themeOpen, setThemeOpen] = useState(false);
      const [themeOverride, setThemeOverride] = useState(null);
      const [themeSaving, setThemeSaving] = useState(false);
      const [languageOverride, setLanguageOverride] = useState(null);
      const [languageSaving, setLanguageSaving] = useState(false);
      const [previewTemplateId, setPreviewTemplateId] = useState(null);
      const [previewStageId, setPreviewStageId] = useState(null);
      const [previewDatasetId, setPreviewDatasetId] = useState(null);
      const [detailTaskId, setDetailTaskId] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const [toasts, setToasts] = useState([]);
      const dataRef = useRef(data);
      dataRef.current = data;
      const activeLanguage = languageOverride || data?.settings?.language || 'auto';
      const t = useMemo(() => makeTranslate(props, activeLanguage), [props.t, activeLanguage]);

      useEffect(() => {
        try {
          localStorage.setItem(TAB_KEY, tab);
        } catch {
          // Persisting the active tab is best effort.
        }
      }, [tab]);

      const pushToast = useCallback((message, kind = 'success') => {
        const id = uid('toast');
        setToasts((current) => [...current, { id, message, kind }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 4400);
      }, []);

      const loadState = useCallback(async (silent = false) => {
        if (!silent) setPhase('loading');
        try {
          const response = await fetch(`${API_BASE}/state`, { cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const next = await response.json();
          setData({ ...next, stages: Array.isArray(next.stages) ? next.stages : [] });
          setPhase('ready');
          setLoadError('');
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : String(error));
          setPhase('error');
        }
      }, []);

      useEffect(() => {
        void loadState(false);
      }, [loadState]);

      const runningSignature = data
        ? data.runs
            .filter((run) => run.status === 'running')
            .map((run) => run.id)
            .join(',')
        : '';

      useEffect(() => {
        if (!runningSignature) return undefined;
        let cancelled = false;
        const ids = runningSignature.split(',');
        const tick = async () => {
          for (const id of ids) {
            try {
              const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' });
              if (!response.ok) continue;
              const run = await response.json();
              if (cancelled) return;
              setData((current) =>
                current
                  ? { ...current, runs: current.runs.map((candidate) => (candidate.id === run.id ? run : candidate)) }
                  : current,
              );
            } catch {
              // The next poll retries; transient errors should not clear the view.
            }
          }
        };
        const timer = window.setInterval(tick, 1200);
        void tick();
        return () => {
          cancelled = true;
          window.clearInterval(timer);
        };
      }, [runningSignature]);

      const saveModel = useCallback(
        async (patch, successMessage) => {
          const base = dataRef.current;
          if (!base) return false;
          setSaving(true);
          try {
            const body = {
              datasets: patch.datasets ?? base.datasets,
              stages: patch.stages ?? base.stages ?? [],
              templates: patch.templates ?? base.templates,
              tasks: patch.tasks ?? base.tasks,
            };
            const response = await fetch(`${API_BASE}/state`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify(body),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData(payload);
            if (successMessage) pushToast(successMessage, 'success');
            return true;
          } catch (error) {
            pushToast(t('toast.saveFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
            return false;
          } finally {
            setSaving(false);
          }
        },
        [pushToast, t],
      );

      const saveWorkspace = useCallback(
        async (pathValue) => {
          try {
            const response = await fetch(`${API_BASE}/workspace`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ path: pathValue }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData((current) => (current ? { ...current, settings: payload.settings } : current));
            pushToast(t('workspace.saved'), 'success');
            return { ok: true };
          } catch (error) {
            return {
              ok: false,
              message: t('workspace.saveFailed', { message: error instanceof Error ? error.message : String(error) }),
            };
          }
        },
        [pushToast, t],
      );

      const resetWorkspace = useCallback(async () => {
        try {
          const response = await fetch(`${API_BASE}/workspace/reset`, {
            method: 'POST',
            credentials: 'same-origin',
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          setData(payload);
          setDetailTaskId(null);
          setTaskEditor(null);
          setBusyTaskId(null);
          setStoppingRunId(null);
          pushToast(t('workspace.resetDone'), 'success');
          if (payload.cleanupError) {
            pushToast(t('workspace.cleanupFailed', { message: payload.cleanupError }), 'error');
          }
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: t('workspace.resetFailed', { message: error instanceof Error ? error.message : String(error) }),
          };
        }
      }, [pushToast, t]);

      const openResultsFolder = useCallback(
        async (runId, groupId, stageId) => {
          if (!runId) {
            pushToast(t('tasks.noResultFolder'), 'error');
            return false;
          }
          try {
            const response = await fetch(`${API_BASE}/open-folder`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ runId, groupId, stageId }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            pushToast(t('tasks.folderOpened'), 'success');
            return true;
          } catch (error) {
            pushToast(t('tasks.folderOpenFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
            return false;
          }
        },
        [pushToast, t],
      );

      const chooseLanguage = useCallback(
        async (language) => {
          setLanguageOverride(language);
          setLanguageSaving(true);
          try {
            const response = await fetch(`${API_BASE}/language`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ language }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData((current) =>
              current ? { ...current, settings: { ...(current.settings || {}), ...(payload.settings || {}) } } : current,
            );
            setLanguageOverride(null);
            pushToast(t('language.saved'), 'success');
          } catch (error) {
            setLanguageOverride(null);
            pushToast(t('language.saveFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
          } finally {
            setLanguageSaving(false);
          }
        },
        [pushToast, t],
      );

      const chooseTheme = useCallback(
        async (themeId) => {
          const previous = dataRef.current?.settings?.theme || 'default';
          setThemeOverride(themeId);
          setThemeSaving(true);
          try {
            const response = await fetch(`${API_BASE}/theme`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ theme: themeId }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData((current) =>
              current ? { ...current, settings: { ...(current.settings || {}), ...(payload.settings || {}) } } : current,
            );
            setThemeOverride(null);
            setThemeOpen(false);
            pushToast(t('theme.saved'), 'success');
          } catch (error) {
            setThemeOverride(null);
            pushToast(t('theme.saveFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
            if (!dataRef.current?.settings) setThemeOverride(previous);
          } finally {
            setThemeSaving(false);
          }
        },
        [pushToast, t],
      );

      const openDatasetFolder = useCallback(
        async (datasetId) => {
          try {
            const response = await fetch(`${API_BASE}/open-folder`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ datasetId }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            pushToast(t('datasets.folderOpened'), 'success');
            return true;
          } catch (error) {
            pushToast(t('datasets.folderOpenFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
            return false;
          }
        },
        [pushToast, t],
      );

      const openLibraryFolder = useCallback(
        async (payload, openedKey, failedKey) => {
          try {
            const response = await fetch(`${API_BASE}/open-folder`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error?.message || `HTTP ${response.status}`);
            pushToast(t(openedKey), 'success');
            return true;
          } catch (error) {
            pushToast(t(failedKey, { message: error instanceof Error ? error.message : String(error) }), 'error');
            return false;
          }
        },
        [pushToast, t],
      );
      const openStageFolder = useCallback(
        (stageId) => openLibraryFolder({ libraryStageId: stageId }, 'stages.folderOpened', 'stages.folderOpenFailed'),
        [openLibraryFolder],
      );
      const openTemplateFolder = useCallback(
        (templateId) => openLibraryFolder({ templateId }, 'templates.folderOpened', 'templates.folderOpenFailed'),
        [openLibraryFolder],
      );

      const startTask = useCallback(
        async (task) => {
          setBusyTaskId(task.id);
          try {
            const response = await fetch(`${API_BASE}/runs`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ taskId: task.id }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData((current) =>
              current ? { ...current, runs: [payload, ...current.runs.filter((run) => run.id !== payload.id)] } : current,
            );
            pushToast(t('tasks.runStarted'), 'success');
          } catch (error) {
            pushToast(t('toast.runFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
          } finally {
            setBusyTaskId(null);
          }
        },
        [pushToast, t],
      );

      const stopTask = useCallback(
        async (task, targetRun) => {
          const current = dataRef.current;
          const run =
            targetRun ??
            (current
              ? current.runs.find((candidate) => candidate.taskId === task.id && candidate.status === 'running') ?? null
              : null);
          if (!run) return;
          setStoppingRunId(run.id);
          try {
            const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(run.id)}/stop`, {
              method: 'POST',
              credentials: 'same-origin',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
            setData((value) =>
              value ? { ...value, runs: value.runs.map((candidate) => (candidate.id === payload.id ? payload : candidate)) } : value,
            );
            pushToast(t('tasks.runStopped'), 'success');
          } catch (error) {
            pushToast(t('toast.stopFailed', { message: error instanceof Error ? error.message : String(error) }), 'error');
          } finally {
            setStoppingRunId(null);
          }
        },
        [pushToast, t],
      );

      const openTaskEditor = (task) => {
        setDetailTaskId(null);
        setTaskEditor({ task: task ?? null });
      };

      const openTemplateEditor = (template) => {
        setPreviewTemplateId(null);
        setTemplateEditor({ template: template ?? null });
      };
      const openStageEditor = (stage) => {
        setPreviewStageId(null);
        setStageEditor({ stage: stage ?? null });
      };
      const openDatasetEditor = (dataset) => {
        setPreviewDatasetId(null);
        setDatasetEditor({ dataset: dataset ?? null });
      };

      const askDeleteTask = (task) => {
        setConfirm({
          title: t('tasks.deleteTitle'),
          body: t('tasks.deleteBody'),
          onConfirm: async () => {
            const current = dataRef.current;
            if (!current) return false;
            const ok = await saveModel({ tasks: current.tasks.filter((item) => item.id !== task.id) }, t('tasks.deleted'));
            if (ok) setDetailTaskId((id) => (id === task.id ? null : id));
            return ok;
          },
        });
      };

      const askDeleteTemplate = (template) => {
        setConfirm({
          title: t('templates.deleteTitle'),
          body: t('templates.deleteBody'),
          onConfirm: async () => {
            const current = dataRef.current;
            if (!current) return false;
            return saveModel(
              { templates: current.templates.filter((item) => item.id !== template.id) },
              t('templates.deleted'),
            );
          },
        });
      };

      const askDeleteDataset = (dataset) => {
        const current = dataRef.current;
        const usedBy = (current?.templates || []).filter((template) => template.datasetId === dataset.id);
        setConfirm({
          title: t('datasets.deleteTitle'),
          body:
            usedBy.length > 0
              ? t('datasets.deleteUsedBody', { n: usedBy.length })
              : t('datasets.deleteBody'),
          onConfirm: async () => {
            const latest = dataRef.current;
            if (!latest) return false;
            return saveModel(
              {
                datasets: latest.datasets.filter((item) => item.id !== dataset.id),
                templates: latest.templates.map((template) =>
                  template.datasetId === dataset.id ? { ...template, datasetId: '' } : template,
                ),
              },
              t('datasets.deleted'),
            );
          },
        });
      };

      const askDeleteStage = (stage) => {
        const current = dataRef.current;
        if (!current) return;
        const usedBy = current.templates.filter((template) =>
          (template.stages || []).some((entry) => entry.stageId === stage.id),
        );
        setConfirm({
          title: t('stages.deleteTitle'),
          body:
            usedBy.length > 0
              ? t('stages.deleteUsedBody', { n: usedBy.length })
              : t('stages.deleteBody'),
          onConfirm: async () => {
            const latest = dataRef.current;
            if (!latest) return false;
            const ok = await saveModel(
              {
                stages: latest.stages.filter((item) => item.id !== stage.id),
                templates: latest.templates.map((template) => ({
                  ...template,
                  stages: (template.stages || []).filter((entry) => entry.stageId !== stage.id),
                })),
              },
              t('stages.deleted'),
            );
            if (ok) setPreviewStageId((id) => (id === stage.id ? null : id));
            return ok;
          },
        });
      };

      if (phase === 'loading' && !data) {
        return h(
          'div',
          { className: 'th-root th-root-loading' },
          h('style', null, CSS),
          h(Spinner, { label: t('common.loading') }),
        );
      }

      if (phase === 'error' && !data) {
        return h(
          'div',
          { className: 'th-root th-root-loading' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'th-load-error' },
            h(Icon, { name: 'alert', size: 26 }),
            h('h2', null, t('common.networkError')),
            h('p', null, loadError || t('common.networkError')),
            h(Button, { variant: 'primary', icon: 'refresh', onClick: () => void loadState(false) }, t('common.retry')),
          ),
        );
      }

      const detailTask = data.tasks.find((task) => task.id === detailTaskId) ?? null;
      const previewTemplate = data.templates.find((template) => template.id === previewTemplateId) ?? null;
      const previewStage = (data.stages || []).find((stage) => stage.id === previewStageId) ?? null;
      const previewDataset = data.datasets.find((dataset) => dataset.id === previewDatasetId) ?? null;
      const activeTheme = themeOverride || data.settings?.theme || 'default';
      const tabs = [
        ['tasks', t('tab.tasks'), data.tasks.length],
        ['templates', t('tab.templates'), data.templates.length],
        ['stages', t('tab.stages'), (data.stages || []).length],
        ['datasets', t('tab.datasets'), data.datasets.length],
        ['docs', t('tab.docs'), null],
      ];
      const usage = (templateId) => data.tasks.filter((task) => task.groups.some((group) => group.templateId === templateId)).length;
      const stageUsage = (stageId) =>
        data.templates.filter((template) => (template.stages || []).some((entry) => entry.stageId === stageId)).length;

      return h(
        'div',
        { className: 'th-root', 'data-theme': activeTheme },
        h('style', null, CSS),
        h(
          'header',
          { className: 'th-topbar' },
          h(
            'div',
            { className: 'th-brand' },
            h('span', { className: 'th-brandmark' }, h(TechHubLogo, { size: 34 })),
            h('div', { className: 'th-brandcopy' }, h('strong', null, t('title')), h('span', null, t('subtitle'))),
          ),
          h(
            'nav',
            { className: 'th-tabs', role: 'tablist', 'aria-label': t('title') },
            tabs.map(([value, label, count]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === value,
                  className: cx('th-tab', tab === value && 'is-active'),
                  onClick: () => setTab(value),
                },
                h('span', null, label),
                count === null || count === undefined ? null : h('span', { className: 'th-tab-count' }, count),
              ),
            ),
          ),
          h(
            'div',
            { className: 'th-top-actions' },
            saving ? h('span', { className: 'th-saving' }, h('span', { className: 'th-mini-spinner' }), t('common.saving')) : null,
            h(
              'select',
              {
                className: 'th-language-select',
                value: activeLanguage,
                disabled: languageSaving,
                'aria-label': t('language.title'),
                onChange: (event) => void chooseLanguage(event.target.value),
              },
              h('option', { value: 'auto' }, t('language.auto')),
              h('option', { value: 'zh' }, t('language.zh')),
              h('option', { value: 'en' }, t('language.en')),
            ),
            h(IconButton, { icon: 'palette', label: t('theme.title'), onClick: () => setThemeOpen(true) }),
            h(IconButton, { icon: 'settings', label: t('workspace.title'), onClick: () => setWorkspaceOpen(true) }),
            h(IconButton, { icon: 'refresh', label: t('common.refresh'), onClick: () => void loadState(true) }),
          ),
        ),
        h(
          'div',
          { className: 'th-main' },
          tab === 'tasks'
            ? h(TasksPage, {
                data,
                t,
                query: taskQuery,
                setQuery: setTaskQuery,
                filter: taskFilter,
                setFilter: setTaskFilter,
                onNew: () => openTaskEditor(null),
                onOpen: (task) => setDetailTaskId(task.id),
                onEdit: (task) => openTaskEditor(task),
                onDelete: askDeleteTask,
                onRun: startTask,
                onStop: stopTask,
                onOpenFolder: openResultsFolder,
                busyTaskId,
                stoppingRunId,
              })
            : null,
          tab === 'templates'
            ? h(TemplatesPage, {
                data,
                t,
                query: templateQuery,
                setQuery: setTemplateQuery,
                onNew: () => openTemplateEditor(null),
                onPreview: (template) => setPreviewTemplateId(template.id),
                onEdit: openTemplateEditor,
                onDelete: askDeleteTemplate,
                onOpenFolder: openTemplateFolder,
                usage,
              })
            : null,
          tab === 'datasets'
            ? h(DatasetsPage, {
                data,
                t,
                query: datasetQuery,
                setQuery: setDatasetQuery,
                onNew: () => openDatasetEditor(null),
                onPreview: (dataset) => setPreviewDatasetId(dataset.id),
                onEdit: openDatasetEditor,
                onDelete: askDeleteDataset,
                onOpenFolder: openDatasetFolder,
              })
            : null,
          tab === 'stages'
            ? h(StagesPage, {
                data,
                t,
                query: stageQuery,
                setQuery: setStageQuery,
                onNew: () => openStageEditor(null),
                onPreview: (stage) => setPreviewStageId(stage.id),
                onEdit: openStageEditor,
                onDelete: askDeleteStage,
                onOpenFolder: openStageFolder,
                usage: stageUsage,
              })
            : null,
          tab === 'docs' ? h(DocsPage, { t, pushToast }) : null,
        ),
        workspaceOpen
          ? h(WorkspaceSettings, {
              settings: data.settings || {},
              t,
              onClose: () => setWorkspaceOpen(false),
              onSave: saveWorkspace,
              onReset: resetWorkspace,
              onImported: async () => {
                await loadState(true);
                pushToast(t('workspace.imported'), 'success');
              },
            })
          : null,
        themeOpen
          ? h(ThemePicker, {
              value: activeTheme,
              t,
              saving: themeSaving,
              onSelect: chooseTheme,
              onClose: () => {
                if (!themeSaving) setThemeOpen(false);
              },
            })
          : null,
        taskEditor
          ? h(TaskEditor, {
              initial: taskEditor.task,
              templates: data.templates,
              stages: data.stages || [],
              datasets: data.datasets,
              t,
              saving,
              onClose: () => setTaskEditor(null),
              onSave: async (task) => {
                const current = dataRef.current;
                if (!current) return;
                const exists = current.tasks.some((item) => item.id === task.id);
                const tasks = exists ? current.tasks.map((item) => (item.id === task.id ? task : item)) : [task, ...current.tasks];
                const ok = await saveModel({ tasks }, t('tasks.saved'));
                if (ok) setTaskEditor(null);
              },
            })
          : null,
        templateEditor
          ? h(TemplateEditor, {
              initial: templateEditor.template,
              stages: data.stages || [],
              datasets: data.datasets || [],
              t,
              saving,
              onClose: () => setTemplateEditor(null),
              onSave: async (template) => {
                const current = dataRef.current;
                if (!current) return;
                const exists = current.templates.some((item) => item.id === template.id);
                const templates = exists
                  ? current.templates.map((item) => (item.id === template.id ? template : item))
                  : [template, ...current.templates];
                const ok = await saveModel({ templates }, t('templates.saved'));
                if (ok) setTemplateEditor(null);
              },
            })
          : null,
        stageEditor
          ? h(StageEditor, {
              initial: stageEditor.stage,
              stages: data.stages || [],
              t,
              saving,
              onClose: () => setStageEditor(null),
              onSave: async (stage) => {
                const current = dataRef.current;
                if (!current) return;
                const exists = current.stages.some((item) => item.id === stage.id);
                const stages = exists
                  ? current.stages.map((item) => (item.id === stage.id ? stage : item))
                  : [stage, ...current.stages];
                const ok = await saveModel({ stages }, t('stages.saved'));
                if (ok) setStageEditor(null);
              },
            })
          : null,
        datasetEditor
          ? h(DatasetEditor, {
              initial: datasetEditor.dataset,
              t,
              saving,
              onClose: () => setDatasetEditor(null),
              onSave: async (dataset) => {
                const current = dataRef.current;
                if (!current) return;
                const exists = current.datasets.some((item) => item.id === dataset.id);
                const datasets = exists
                  ? current.datasets.map((item) => (item.id === dataset.id ? dataset : item))
                  : [dataset, ...current.datasets];
                const ok = await saveModel({ datasets }, t('datasets.saved'));
                if (ok) setDatasetEditor(null);
              },
            })
          : null,
        // Only one dialog per object: an open editor always wins over its preview,
        // so a stray re-open of the preview can never stack a second modal on top.
        previewTemplate && !templateEditor
          ? h(TemplatePreview, {
              template: previewTemplate,
              stages: data.stages || [],
              datasets: data.datasets || [],
              usageCount: usage(previewTemplate.id),
              t,
              onClose: () => setPreviewTemplateId(null),
              onEdit: () => openTemplateEditor(previewTemplate),
              onOpenFolder: openTemplateFolder,
            })
          : null,
        previewStage && !stageEditor
          ? h(StagePreview, {
              stage: previewStage,
              templates: data.templates,
              t,
              onClose: () => setPreviewStageId(null),
              onEdit: () => openStageEditor(previewStage),
              onOpenFolder: openStageFolder,
            })
          : null,
        previewDataset && !datasetEditor
          ? h(DatasetPreview, {
              dataset: previewDataset,
              t,
              onClose: () => setPreviewDatasetId(null),
              onOpenFolder: openDatasetFolder,
              onEdit: () => openDatasetEditor(previewDataset),
            })
          : null,
        detailTask && !taskEditor
          ? h(TaskDetail, {
              task: detailTask,
              datasets: data.datasets || [],
              templates: data.templates || [],
              runs: data.runs,
              t,
              onClose: () => setDetailTaskId(null),
              onEdit: openTaskEditor,
              onDelete: askDeleteTask,
              onRun: startTask,
              onStop: stopTask,
              onOpenFolder: openResultsFolder,
              busy: busyTaskId === detailTask.id,
              stopping: false,
              stoppingRunId,
            })
          : null,
        h(ConfirmDialog, {
          state: confirm,
          onClose: () => setConfirm(null),
          t,
        }),
        toasts.length > 0
          ? h(
              'div',
              { className: 'th-toasts', role: 'status', 'aria-live': 'polite' },
              toasts.map((toast) =>
                h(
                  'div',
                  { key: toast.id, className: cx('th-toast', `is-${toast.kind}`) },
                  h(Icon, { name: toast.kind === 'error' ? 'alert' : 'check', size: 16 }),
                  h('span', null, toast.message),
                ),
              ),
            )
          : null,
      );
    }

    function TechHubNavIcon({ size = 20 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          className: 'th-nav-icon',
        },
        h('path', { d: 'M9 3h6v5.8l5 8.2a2.4 2.4 0 0 1-2.05 3.7H6.05A2.4 2.4 0 0 1 4 17l5-8.2V3Z' }),
        h('path', { d: 'M8 3h8' }),
        h('path', { d: 'M6.5 14h11' }),
        h('circle', { cx: 10, cy: 16.4, r: 1, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 14, cy: 13.6, r: 0.55, fill: 'currentColor', stroke: 'none' }),
      );
    }

    const CSS = `
.th-root {
  --th-radius: 13px;
  height: 100%;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  overflow: hidden;
}
.th-root[data-theme="blue"] { --dsw-alias-brand-primary: #2563eb; --th-theme-accent: #2563eb; }
.th-root[data-theme="emerald"] { --dsw-alias-brand-primary: #059669; --th-theme-accent: #059669; }
.th-root[data-theme="amber"] { --dsw-alias-brand-primary: #b45309; --th-theme-accent: #b45309; }
.th-root[data-theme="violet"] { --dsw-alias-brand-primary: #6d28d9; --th-theme-accent: #6d28d9; }
.th-root[data-theme="rose"] { --dsw-alias-brand-primary: #be123c; --th-theme-accent: #be123c; }
.th-root:not([data-theme="default"]) .th-topbar { background: linear-gradient(180deg, color-mix(in srgb, var(--th-theme-accent) 8%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1) 62%); }
.th-root:not([data-theme="default"]) .th-tab.is-active { box-shadow: 0 1px 3px rgba(15, 23, 42, .10), inset 0 -2px 0 var(--th-theme-accent); }
.th-root:not([data-theme="default"]) .th-card:hover,
.th-root:not([data-theme="default"]) .th-taskcard:hover { border-color: color-mix(in srgb, var(--th-theme-accent) 38%, var(--dsw-alias-border-l2)); }
.th-root *, .th-root *::before, .th-root *::after { box-sizing: border-box; }
.th-root button, .th-root input, .th-root textarea, .th-root select { font: inherit; }
.th-nav-icon { display: block; }
.th-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 66px;
  padding: 12px 26px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.th-brand { display: flex; align-items: center; gap: 11px; min-width: 210px; }
.th-brandmark { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: 0 0 auto; }
.th-logo-svg { display: block; }
.th-brandcopy { display: flex; flex-direction: column; gap: 1px; }
.th-brandcopy strong { font-size: 15px; letter-spacing: 0.01em; }
.th-brandcopy span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-tabs { display: flex; align-items: center; gap: 3px; padding: 4px; border-radius: 11px; background: var(--dsw-alias-bg-layer-2); }
.th-tab {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 550;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.th-tab:hover { color: var(--dsw-alias-label-primary); }
.th-tab.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border-color: var(--dsw-alias-border-l1);
  box-shadow: 0 1px 3px rgba(15, 23, 42, .10);
}
.th-tab-count { font-size: 11px; line-height: 1; padding: 2px 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.th-tab.is-active .th-tab-count { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); color: var(--dsw-alias-brand-primary); }
.th-top-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.th-language-select { height: 29px; padding: 0 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
.th-language-select:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.th-language-select:disabled { opacity: .6; cursor: wait; }
.th-saving { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-main { flex: 1 1 auto; min-height: 0; overflow: auto; }
.th-page { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 30px 0 64px; }
.th-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.th-pagehead-copy { min-width: 0; }
.th-kicker { display: block; margin-bottom: 6px; font-size: 10px; font-weight: 750; letter-spacing: .16em; color: var(--dsw-alias-brand-primary); }
.th-pagehead h1 { margin: 0; font-size: 27px; line-height: 1.2; letter-spacing: -.02em; }
.th-pagehead p { margin: 7px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; max-width: 760px; }
.th-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.th-stat { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: var(--th-radius); }
.th-stat-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.th-stat-icon.is-running { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); color: var(--dsw-alias-state-warn-primary); }
.th-stat-icon.is-template { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent); color: var(--dsw-alias-state-success-primary); }
.th-stat-icon.is-dataset { background: color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent); color: var(--dsw-alias-label-secondary); }
.th-stat div { display: flex; flex-direction: column; gap: 1px; }
.th-stat strong { font-size: 20px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.th-stat span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 20px 0 16px; }
.th-search { position: relative; flex: 1 1 320px; max-width: 430px; }
.th-search .th-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-secondary); pointer-events: none; }
.th-search .th-input { padding-left: 34px; }
.th-toolbar-count { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.th-segmented { display: flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 9px; overflow: auto; }
.th-segment { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 5px 9px; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.th-segment:hover { color: var(--dsw-alias-label-primary); }
.th-segment.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); color: var(--dsw-alias-brand-primary); font-weight: 600; }
.th-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid transparent; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 560; line-height: 1.25; cursor: pointer; white-space: nowrap; transition: background .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease; }
.th-btn:disabled { opacity: .55; cursor: not-allowed; }
.th-btn-sm { padding: 5px 9px; font-size: 11.5px; border-radius: 7px; }
.th-btn-primary { background: var(--dsw-alias-brand-primary); color: #fff; }
.th-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, #000); }
.th-btn-secondary { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.th-btn-secondary:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.th-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary); }
.th-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.th-btn-danger { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 25%, transparent); color: var(--dsw-alias-state-error-primary); }
.th-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent); }
.th-iconbtn { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 29px; height: 29px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; transition: background .15s ease, color .15s ease; }
.th-iconbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.th-iconbtn:disabled { opacity: .35; cursor: not-allowed; }
.th-danger-hover:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.th-input, .th-select, .th-textarea {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.th-select { appearance: auto; }
.th-textarea { resize: vertical; min-height: 58px; }
.th-input::placeholder, .th-textarea::placeholder { color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.th-input:focus, .th-select:focus, .th-textarea:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent); }
.th-mono { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 12px; }
.th-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.th-field-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); display: inline-flex; gap: 3px; }
.th-required { color: var(--dsw-alias-state-error-primary); }
.th-field-hint { font-size: 10.5px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.th-form { display: flex; flex-direction: column; gap: 18px; }
.th-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.th-span-2 { grid-column: span 2; }
.th-form-error { display: flex; align-items: flex-start; gap: 8px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); color: var(--dsw-alias-state-error-primary); border-radius: 8px; font-size: 12px; }
.th-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 4px 0 10px; }
.th-section-head-tight { margin-top: 2px; }
.th-section-head h3 { margin: 0; font-size: 14px; }
.th-section-head p { margin: 3px 0 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-section-subhint { opacity: .82; }
.th-hintline { display: flex; align-items: flex-start; gap: 7px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
.th-docs-page { max-width: 1100px; }
.th-docs-actions { display: flex; align-items: center; gap: 8px; }
.th-docs-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
.th-docs-state { color: var(--dsw-alias-label-secondary); }
.th-docs-state.is-dirty { color: #b7791f; font-weight: 600; }
.th-docs-hint { margin-left: auto; font-size: 10px; }
.th-docs-editor { width: 100%; min-height: 58vh; resize: vertical; box-sizing: border-box; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.5px; line-height: 1.65; tab-size: 2; }
.th-docs-editor:focus { outline: none; border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.th-docs-readonly { margin: 0; min-height: 58vh; max-height: 70vh; overflow: auto; box-sizing: border-box; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12.5px; line-height: 1.7; }
.th-markdown { max-width: 900px; }
.th-markdown h1, .th-markdown h2, .th-markdown h3, .th-markdown h4, .th-markdown h5, .th-markdown h6 { margin: 1.2em 0 .5em; line-height: 1.3; color: var(--dsw-alias-label-primary); }
.th-markdown h1 { font-size: 24px; }
.th-markdown h2 { font-size: 19px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 5px; }
.th-markdown h3 { font-size: 15.5px; }
.th-markdown h4 { font-size: 13.5px; }
.th-markdown p { margin: .65em 0; }
.th-markdown ul, .th-markdown ol { margin: .6em 0; padding-left: 1.7em; }
.th-markdown li { margin: .25em 0; }
.th-markdown li > p { margin: .2em 0; }
.th-markdown code { padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }
.th-markdown pre { margin: .8em 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); overflow: auto; }
.th-markdown pre code { padding: 0; background: transparent; font-size: 11px; line-height: 1.6; }
.th-markdown blockquote { margin: .8em 0; padding: 2px 0 2px 12px; border-left: 3px solid var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-secondary); }
.th-markdown hr { margin: 1.2em 0; border: 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.th-markdown a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.th-markdown a:hover { text-decoration: underline; }
.th-markdown table { width: 100%; margin: .8em 0; border-collapse: collapse; font-size: 11.5px; }
.th-markdown th, .th-markdown td { padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.th-markdown th { background: var(--dsw-alias-bg-layer-2); font-weight: 650; }
.th-markdown > :first-child { margin-top: 0; }
.th-markdown > :last-child { margin-bottom: 0; }
.th-docs-loading { display: flex; align-items: center; justify-content: center; min-height: 220px; }
.th-workspace-bundle { display: flex; flex-direction: column; gap: 7px; padding: 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
.th-workspace-bundle-head { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-primary); font-size: 11.5px; }
.th-workspace-bundle-head > .th-icon { color: var(--dsw-alias-brand-primary); }
.th-workspace-bundle p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.5; }
.th-workspace-check { display: grid; grid-template-columns: 16px auto; align-items: center; gap: 3px 7px; color: var(--dsw-alias-label-primary); font-size: 11px; cursor: pointer; }
.th-workspace-check input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.th-workspace-check em { grid-column: 2; color: var(--dsw-alias-label-secondary); font-style: normal; font-size: 10px; }
.th-workspace-bundle-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.th-workspace-preview { display: flex; align-items: flex-start; gap: 8px; padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.th-workspace-preview > .th-icon { color: var(--dsw-alias-brand-primary); flex: 0 0 auto; margin-top: 1px; }
.th-workspace-preview div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.th-workspace-preview span { font-size: 10px; }
.th-workspace-preview code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.th-workspace-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.th-workspace-actions > span { color: var(--dsw-alias-label-secondary); font-size: 10.5px; overflow-wrap: anywhere; }
.th-danger-zone { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, var(--dsw-alias-border-l1)); border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent); }
.th-danger-title { display: flex; align-items: center; gap: 7px; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.th-danger-zone p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.55; }
.th-danger-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.th-groups { display: flex; flex-direction: column; gap: 12px; }
.th-group { border: 1px solid var(--dsw-alias-border-l1); border-left-width: 3px; border-radius: 11px; padding: 13px 14px; background: var(--dsw-alias-bg-layer-2); }
.th-group-control { border-left-color: var(--dsw-alias-brand-primary); }
.th-group-treatment { border-left-color: var(--dsw-alias-state-success-primary); }
.th-group-head { display: flex; align-items: center; gap: 10px; }
.th-group-id { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; }
.th-role-badge { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: .02em; }
.th-role-badge.is-control { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); color: var(--dsw-alias-brand-primary); }
.th-role-badge.is-treatment { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent); color: var(--dsw-alias-state-success-primary); }
.th-group-order { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-group-name { max-width: 320px; background: var(--dsw-alias-bg-layer-1); }
.th-lock-note { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-group-head .th-iconbtn { margin-left: auto; }
.th-group-template { margin-top: 10px; max-width: 520px; }
.th-group-dataset { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-template-pick { display: flex; align-items: center; gap: 6px; }
.th-template-pick .th-select { flex: 1 1 auto; min-width: 0; }
.th-group-params { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.th-group-params-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.th-group-params-head strong { font-size: 11.5px; }
.th-group-params-head span { color: var(--dsw-alias-label-secondary); font-size: 10px; }
.th-task-params .th-param-labels, .th-task-params .th-param-row { grid-template-columns: minmax(110px, .65fr) minmax(130px, 1fr) minmax(150px, 1.25fr); }
.th-param-keycell { display: flex; align-items: center; gap: 5px; min-width: 0; }
.th-param-row .th-select.th-port-type { padding: 6px 6px; font-size: 10px; }
.th-preview-params .th-param-labels, .th-preview-params .th-param-row { grid-template-columns: minmax(100px, .6fr) 92px minmax(120px, .9fr) minmax(140px, 1.1fr); }
.th-template-parameters { display: flex; flex-direction: column; gap: 8px; }
.th-param-key { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-brand-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-param-default { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-param-description { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-stagecfg-list { margin-top: 11px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-stagecfg-labels, .th-stagecfg { display: grid; grid-template-columns: 28px minmax(92px, .7fr) minmax(200px, 2fr); align-items: center; gap: 8px; padding: 7px 9px; }
.th-stagecfg-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10px; font-weight: 650; }
.th-stagecfg + .th-stagecfg { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-stagecfg-index { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-stagecfg-name { display: flex; flex-direction: column; min-width: 0; }
.th-stagecfg-name strong { font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-stagecfg .th-input { padding: 6px 8px; font-size: 11px; }
.th-group-hint { margin-top: 10px; padding: 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; text-align: center; }
.th-add-group { width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 11px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; transition: border-color .15s ease, color .15s ease, background .15s ease; }
.th-add-group:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent); }
.th-pipeline-add { position: relative; display: flex; flex-direction: column; gap: 6px; }
.th-pipeline-add .th-btn { width: 100%; justify-content: center; }
.th-stage-menu { display: flex; flex-direction: column; max-height: 260px; overflow: auto; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 12px 28px rgba(15, 23, 42, .18); }
.th-stage-menu-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; text-align: left; }
.th-stage-menu-item:hover { background: var(--dsw-alias-bg-layer-2); }
.th-stage-menu-item strong { font-size: 11.5px; font-weight: 600; }
.th-stage-menu-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.th-stage-menu-empty { padding: 10px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); text-align: center; }
.th-commandarea { min-height: 88px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.6; }
.th-stagecfg-command { min-height: 46px; padding: 6px 8px; font-size: 11px; }
.th-param-empty { padding: 11px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; text-align: center; }
.th-param-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-param-labels, .th-param-row { display: grid; grid-template-columns: minmax(96px, .55fr) 92px minmax(110px, .9fr) minmax(140px, 1.2fr) 30px; align-items: center; gap: 8px; padding: 7px 9px; }
.th-param-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10px; font-weight: 650; }
.th-param-row + .th-param-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-param-row .th-input { padding: 6px 8px; font-size: 11px; }
.th-stagebuilder { list-style: none; display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; }
.th-stagebuilder-item { position: relative; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; padding-bottom: 12px; }
.th-stagebuilder-item:not(:last-child)::before { content: ""; position: absolute; left: 16px; top: 28px; bottom: -2px; width: 1px; background: var(--dsw-alias-border-l2); }
.th-stagebuilder-index { display: inline-flex; align-items: flex-start; justify-content: center; padding-top: 9px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-brand-primary); font-weight: 700; }
.th-stagebuilder-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 11px 12px; transition: border-color .15s ease, box-shadow .15s ease, opacity .15s ease; }
.th-stagebuilder-item.is-dragging .th-stagebuilder-card { opacity: .35; border-style: dashed; }
.th-stagebuilder-item.is-drag-over .th-stagebuilder-card { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
.th-drag-ghost { position: fixed; z-index: 3000; opacity: .68; pointer-events: none; box-shadow: 0 18px 44px rgba(15, 23, 42, .26); background: var(--dsw-alias-bg-layer-1, #fff); }
.th-drag-handle { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: var(--dsw-alias-label-secondary); cursor: grab; flex: 0 0 auto; }
.th-drag-handle:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-brand-primary); }
.th-drag-handle:active { cursor: grabbing; }
.th-drag-handle .th-icon { stroke-width: 2.8; }
.th-stagebuilder-top { display: flex; align-items: center; gap: 9px; }
.th-stagebuilder-tools { margin-left: auto; display: flex; align-items: center; gap: 1px; }
.th-stagebuilder-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 9px; }
.th-stage-io { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.th-stage-io-head { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 10px; }
.th-stage-io-head strong { font-size: 10.5px; color: var(--dsw-alias-label-primary); }
.th-stage-io-head span { font-size: 9.5px; line-height: 1.4; }
.th-stage-io-head .th-btn { margin-left: auto; }
.th-output-map-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-port-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-port-labels, .th-port-row { display: grid; grid-template-columns: minmax(110px, .9fr) minmax(150px, 1.3fr) 30px; gap: 8px; align-items: center; padding: 6px 8px; }
.th-port-labels.is-input, .th-port-row.is-input { grid-template-columns: minmax(110px, .9fr) 96px 58px minmax(120px, 1.1fr) 30px; }
.th-port-labels.is-parameter, .th-port-row.is-parameter { grid-template-columns: minmax(100px, .8fr) 96px minmax(96px, .85fr) minmax(110px, 1fr) 30px; }
.th-port-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 650; }
.th-port-row + .th-port-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-port-row .th-input { padding: 6px 8px; font-size: 10.5px; }
.th-port-type { padding: 5px 6px; font-size: 10px; }
.th-port-required { display: inline-flex; align-items: center; justify-content: center; }
.th-port-required input { width: 13px; height: 13px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.th-output-map-labels.is-output, .th-output-map-row.is-output { grid-template-columns: minmax(130px, 1.1fr) minmax(100px, .8fr) 96px 30px; }
.th-command-head { display: flex; align-items: flex-end; gap: 10px; }
.th-command-title { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 10px; }
.th-command-title strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; }
.th-command-timeout { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.th-command-timeout .th-input { width: 82px; padding: 5px 8px; font-size: 11px; }
.th-builtin-hint { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.th-builtin-hint > div:first-child { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.th-builtin-hint strong { color: var(--dsw-alias-label-primary); font-size: 10px; }
.th-builtin-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.th-builtin-chip { padding: 0 5px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9px; color: var(--dsw-alias-label-secondary); }
.th-port-type-badge { font-style: normal; padding: 0 5px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); font-size: 9px; font-weight: 600; }
.th-port-optional { font-style: normal; font-size: 9px; color: var(--dsw-alias-label-secondary); }
.th-binding-default.is-error { color: var(--dsw-alias-state-error-primary); }
.th-asset-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.th-asset-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-asset-meta > span { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.th-asset-name { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-primary); }
.th-asset-kind { font-style: normal; padding: 0 5px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); color: var(--dsw-alias-state-success-primary); font-size: 9px; font-weight: 600; }
.th-asset-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.th-asset-empty { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-binding-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-binding-labels, .th-binding-row { display: grid; grid-template-columns: minmax(110px, .8fr) minmax(170px, 1.3fr) auto; gap: 8px; align-items: center; padding: 6px 8px; }
.th-binding-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 650; }
.th-binding-row + .th-binding-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-binding-row .th-select { padding: 6px 8px; font-size: 10.5px; min-width: 0; }
.th-binding-name { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-binding-default { font-size: 9.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-binding-row.is-invalid .th-select { border-color: var(--dsw-alias-state-error-primary); }
.th-binding-empty { padding: 8px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-output-map-labels, .th-output-map-row { display: grid; grid-template-columns: minmax(150px, 1.25fr) minmax(120px, .8fr) 30px; gap: 8px; align-items: center; padding: 6px 8px; }
.th-output-map-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 650; }
.th-output-map-row + .th-output-map-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-output-map-row .th-input { padding: 6px 8px; font-size: 10.5px; }
.th-inputref-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-inputref-labels, .th-inputref-row { display: grid; grid-template-columns: minmax(100px, .75fr) minmax(120px, 1fr) minmax(140px, 1.15fr) 30px; gap: 8px; align-items: center; padding: 6px 8px; }
.th-inputref-labels { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 650; }
.th-inputref-row + .th-inputref-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.th-inputref-row .th-input, .th-inputref-row .th-select { padding: 6px 8px; font-size: 10.5px; }
.th-input-source-list { display: flex; flex-wrap: wrap; gap: 5px; }
.th-input-source { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 10px; cursor: pointer; }
.th-input-source:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.th-input-source.is-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
.th-input-source input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.th-input-source-empty { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-stage-name { max-width: 420px; background: var(--dsw-alias-bg-layer-1); font-weight: 600; }
.th-detected-format { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding-top: 2px; }
.th-dropzone { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.th-dropzone:hover, .th-dropzone.is-dragging { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
.th-dropzone > .th-icon { color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.th-dropzone-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.th-dropzone-copy strong { color: var(--dsw-alias-label-primary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-dropzone-copy span { font-size: 10.5px; }
.th-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
.th-dataset-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.th-dataset-editor, .th-dataset-preview { min-width: 0; }
.th-codearea { min-height: 286px; max-height: 430px; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 11.5px; line-height: 1.6; tab-size: 2; white-space: pre; }
.th-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.th-preview-head h3 { margin: 0; font-size: 13px; }
.th-preview-head span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-table-wrap { border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; overflow: auto; max-height: 330px; background: var(--dsw-alias-bg-layer-1); }
.th-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 11px; }
.th-table th { position: sticky; top: 0; z-index: 1; text-align: left; padding: 7px 9px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-weight: 650; white-space: nowrap; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.th-table td { padding: 6px 9px; border-bottom: 1px solid var(--dsw-alias-border-l1); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.th-table tr:last-child td { border-bottom: 0; }
.th-table tbody tr:hover td { background: var(--dsw-alias-bg-layer-2); }
.th-preview-empty { display: flex; align-items: center; justify-content: center; min-height: 180px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 9px; padding: 20px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; text-align: center; }
.th-parse-error { display: flex; align-items: flex-start; gap: 7px; padding: 9px 11px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.th-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.th-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: var(--th-radius); padding: 15px 16px; min-width: 0; transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
.th-card:hover { border-color: var(--dsw-alias-border-l2); box-shadow: 0 12px 32px rgba(15, 23, 42, .07); }
.th-clickable-card { cursor: pointer; }
.th-card-head { display: flex; align-items: flex-start; gap: 12px; }
.th-card-title { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.th-card-glyph { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; flex: 0 0 auto; }
.th-card-glyph.is-template { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); }
.th-card-glyph.is-dataset { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.th-card-glyph.is-stage { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.th-stage-picker { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.th-stage-picker .th-select { flex: 1 1 220px; min-width: 0; }
.th-stage-ref { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.th-stage-ref-name { font-size: 12.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-stage-ref-desc { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-stage-ref-command { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-stage-output-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.th-stage-output-chip { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }
.th-stage-no-output { font-size: 9.5px; color: var(--dsw-alias-label-secondary); font-style: italic; }
.th-card-title h3 { margin: 0; font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
.th-card-title p { margin: 3px 0 0; font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.45; overflow-wrap: anywhere; }
.th-card-actions { margin-left: auto; display: flex; align-items: center; gap: 3px; flex: 0 0 auto; }
.th-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 13px; padding-top: 11px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-template-preview { display: flex; flex-direction: column; gap: 14px; }
.th-preview-stage-list { list-style: none; display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; }
.th-preview-stage { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.th-preview-stage-index { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; font-weight: 700; color: var(--dsw-alias-brand-primary); padding-top: 2px; }
.th-preview-stage-body { min-width: 0; }
.th-preview-stage-title { display: flex; flex-direction: column; gap: 2px; }
.th-preview-stage-title strong { font-size: 12.5px; }
.th-preview-stage-title span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-preview-command { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; color: var(--dsw-alias-label-secondary); }
.th-preview-command code { min-width: 0; padding: 3px 6px; border-radius: 5px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.th-preview-args { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-preview-args span { font-weight: 650; }
.th-preview-args code { padding: 2px 5px; border-radius: 5px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.th-preview-args em { font-style: normal; opacity: .7; }
.th-dataset-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 10px; margin-top: 12px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-format-pill { display: inline-flex; padding: 1px 6px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); font-size: 9.5px; font-weight: 700; letter-spacing: .03em; }
.th-source-name { display: inline-flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-column-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.th-column-chip { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.th-column-chip.is-more { font-family: inherit; color: var(--dsw-alias-brand-primary); border-color: transparent; background: transparent; }
.th-task-grid { display: flex; flex-direction: column; gap: 11px; }
.th-taskcard { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: var(--th-radius); padding: 15px 16px; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.th-taskcard:hover { border-color: var(--dsw-alias-border-l2); box-shadow: 0 10px 28px rgba(15, 23, 42, .06); }
.th-taskcard-actions { cursor: default; }
.th-taskcard-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.th-taskcard-title { appearance: none; border: 0; background: transparent; color: inherit; display: flex; align-items: flex-start; gap: 11px; padding: 0; text-align: left; cursor: pointer; min-width: 0; flex: 1 1 auto; }
.th-taskcard-glyph { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.th-taskcard-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.th-taskcard-copy strong { font-size: 15px; line-height: 1.35; overflow-wrap: anywhere; }
.th-taskcard-copy span { font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.45; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.th-taskcard-meta { display: flex; flex-wrap: wrap; gap: 7px 15px; margin-top: 11px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-taskcard-meta span { display: inline-flex; align-items: center; gap: 4px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-taskcard-groups { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.th-group-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.th-group-chip em { font-style: normal; color: var(--dsw-alias-label-primary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-taskcard-params { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 5px; }
.th-taskcard-params-head { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.th-taskcard-param-groups { display: flex; flex-direction: column; gap: 4px; }
.th-taskcard-param-group { display: flex; align-items: flex-start; gap: 7px; min-width: 0; }
.th-taskcard-param-group-name { flex: 0 0 auto; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 9.5px; font-weight: 600; }
.th-param-value-list { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.th-param-value-chip { display: inline-block; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; line-height: 1.5; }
.th-role-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-brand-primary); }
.th-group-chip.is-treatment .th-role-dot, .th-role-dot.is-treatment { background: var(--dsw-alias-state-success-primary); }
.th-role-dot.is-control { background: var(--dsw-alias-brand-primary); }
.th-taskcard-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.th-taskcard-runmeta { font-size: 10.5px; color: var(--dsw-alias-label-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-taskcard-actions { display: flex; align-items: center; gap: 3px; flex: 0 0 auto; }
.th-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 650; white-space: nowrap; }
.th-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.th-badge-idle { color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent); }
.th-badge-pending { color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 9%, transparent); }
.th-badge-running { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); }
.th-badge-running .th-badge-dot { animation: th-pulse 1.2s ease-in-out infinite; }
.th-badge-completed { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent); }
.th-badge-failed { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.th-badge-stopped { color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent); }
.th-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 58px 22px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--th-radius); background: var(--dsw-alias-bg-layer-1); }
.th-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 50px; height: 50px; border-radius: 14px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); margin-bottom: 13px; }
.th-empty h3 { margin: 0; font-size: 15px; }
.th-empty p { margin: 5px 0 16px; color: var(--dsw-alias-label-secondary); font-size: 12px; max-width: 450px; }
.th-theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.th-theme-card { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.th-theme-card:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.th-theme-card.is-active { border-color: var(--th-theme-accent, var(--dsw-alias-brand-primary)); background: color-mix(in srgb, var(--th-theme-accent, var(--dsw-alias-brand-primary)) 7%, var(--dsw-alias-bg-layer-1)); }
.th-theme-card:disabled { opacity: .65; cursor: wait; }
.th-theme-swatch { width: 46px; height: 34px; flex: 0 0 auto; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25); }
.th-theme-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.th-theme-copy strong { font-size: 11.5px; }
.th-theme-copy span { color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.35; }
.th-theme-check { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; color: var(--th-theme-accent, var(--dsw-alias-brand-primary)); font-size: 9.5px; font-weight: 650; white-space: nowrap; }
.th-modal-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15, 23, 42, .44); backdrop-filter: blur(2px); }
.th-modal { width: 100%; max-height: min(90vh, 960px); display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2); border-radius: 15px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 32px 90px rgba(15, 23, 42, .30); overflow: hidden; }
.th-modal-head { flex: 0 0 auto; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 17px 20px 13px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.th-modal-title { min-width: 0; }
.th-modal-title h2 { margin: 0; font-size: 17px; line-height: 1.3; overflow-wrap: anywhere; }
.th-modal-title p { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.45; }
.th-modal-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 18px 20px; }
.th-modal-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 11px 20px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.th-footer-spacer { flex: 1 1 auto; }
.th-confirm-note { display: flex; align-items: flex-start; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.th-detail { display: flex; flex-direction: column; gap: 16px; }
.th-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.th-detail-stat { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); border-radius: 9px; min-width: 0; }
.th-detail-stat span { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-detail-stat strong { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-detail-groups { display: flex; flex-direction: column; gap: 7px; }
.th-detail-group { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-left-width: 3px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); min-width: 0; }
.th-detail-group.is-control { border-left-color: var(--dsw-alias-brand-primary); }
.th-detail-group.is-treatment { border-left-color: var(--dsw-alias-state-success-primary); }
.th-detail-dataset { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.th-detail-group > strong { font-size: 12px; white-space: nowrap; }
.th-detail-group > span:not(.th-role-badge):not(.th-badge):not(.th-progressbar) { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.th-detail-progress-text { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.th-detail-progressbar { width: 96px; flex: 0 0 auto; }
.th-detail-commands { display: flex; gap: 5px; overflow: hidden; margin-left: auto; max-width: 42%; }
.th-detail-commands code { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 2px 5px; }
.th-run-select { max-width: 250px; }
.th-run { display: flex; flex-direction: column; gap: 10px; }
.th-run-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 28px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; color: var(--dsw-alias-label-secondary); font-size: 12px; text-align: center; }
.th-run-empty p { margin: 0; }
.th-run-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 13px; }
.th-run-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.th-run-message { font-size: 12px; font-weight: 550; }
.th-run-meta { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-run-cwd { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 10.5px; min-width: 0; }
.th-run-cwd code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.th-run-results-label { flex: 0 0 auto; font-size: 9px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.th-live-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); font-size: 9.5px; font-weight: 650; }
.th-live-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: th-pulse 1.1s ease-in-out infinite; }
.th-run-groups { display: flex; flex-direction: column; gap: 8px; }
.th-rungroup { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
.th-rungroup-running { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, var(--dsw-alias-border-l1)); }
.th-rungroup-failed { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l1)); }
.th-rungroup-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 11px; border: 0; background: var(--dsw-alias-bg-layer-2); color: inherit; cursor: pointer; text-align: left; }
.th-rungroup-head:hover { background: var(--dsw-alias-bg-layer-1); }
.th-chevron { transition: transform .15s ease; color: var(--dsw-alias-label-secondary); }
.th-chevron.is-open { transform: rotate(180deg); }
.th-rungroup-name { font-size: 12px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-role-chip { font-size: 9px; font-weight: 650; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 1px 6px; }
.th-rungroup-count { margin-left: auto; font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.th-progressbar { position: relative; height: 4px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 16%, transparent); }
.th-progressbar > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
.th-rungroup-progress { height: 3px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); }
.th-rungroup-progress > span { display: block; height: 100%; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
.th-rungroup-completed .th-rungroup-progress > span { background: var(--dsw-alias-state-success-primary); }
.th-rungroup-failed .th-rungroup-progress > span { background: var(--dsw-alias-state-error-primary); }
.th-rungroup-body { padding: 0 11px 8px; }
.th-runstage { padding: 9px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.th-runstage-head { display: flex; align-items: flex-start; gap: 9px; }
.th-stage-state { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; flex: 0 0 auto; margin-top: 1px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.th-stage-state.is-running { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
.th-stage-state.is-completed { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent); color: var(--dsw-alias-state-success-primary); }
.th-stage-state.is-failed { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent); color: var(--dsw-alias-state-error-primary); }
.th-stage-state.is-stopped { background: color-mix(in srgb, var(--dsw-alias-label-secondary) 11%, transparent); }
.th-runstage-main { flex: 1 1 auto; min-width: 0; }
.th-runstage-title { display: flex; align-items: baseline; gap: 8px; }
.th-runstage-title strong { font-size: 11.5px; font-weight: 600; }
.th-runstage-time { font-size: 9.5px; color: var(--dsw-alias-label-secondary); }
.th-command { display: block; margin-top: 2px; font-size: 10px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.th-runstage-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.th-exit { font-size: 9.5px; color: var(--dsw-alias-label-secondary); padding: 2px 5px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); }
.th-exit.is-ok { color: var(--dsw-alias-state-success-primary); }
.th-exit.is-bad { color: var(--dsw-alias-state-error-primary); }
.th-log { display: flex; flex-direction: column; gap: 12px; }
.th-log-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-log-command { max-width: 100%; padding: 3px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; overflow-wrap: anywhere; }
.th-log-tabs { display: inline-flex; align-self: flex-start; gap: 3px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.th-log-tab { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 4px 11px; border-radius: 5px; cursor: pointer; font-size: 10.5px; font-weight: 600; }
.th-log-tab:hover { color: var(--dsw-alias-label-primary); }
.th-log-tab.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-brand-primary); box-shadow: 0 1px 2px rgba(15, 23, 42, .14); }
.th-log-pre { margin: 0; min-height: 240px; max-height: 52vh; overflow: auto; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.th-output-panel { display: flex; flex-direction: column; gap: 9px; }
.th-output-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.th-output-dir { display: flex; align-items: flex-start; gap: 7px; min-width: 0; color: var(--dsw-alias-label-secondary); }
.th-output-dir > .th-icon { color: var(--dsw-alias-brand-primary); flex: 0 0 auto; margin-top: 1px; }
.th-output-dir div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.th-output-dir span { font-size: 9px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.th-output-dir code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.th-output-dir em { font-style: normal; font-size: 10px; color: var(--dsw-alias-label-secondary); line-height: 1.45; }
.th-output-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; min-height: 180px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 9px; color: var(--dsw-alias-label-secondary); font-size: 11px; text-align: center; }
.th-output-list { border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; overflow: auto; max-height: 46vh; background: var(--dsw-alias-bg-layer-1); }
.th-output-row { display: flex; align-items: center; gap: 2px; padding-right: 7px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.th-output-row:last-child { border-bottom: 0; }
.th-output-row:hover { background: var(--dsw-alias-bg-layer-2); }
.th-output-file { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--dsw-alias-label-primary); padding: 8px; text-align: left; cursor: pointer; }
.th-output-file > .th-icon { color: var(--dsw-alias-label-secondary); }
.th-output-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; }
.th-output-file em { font-style: normal; color: var(--dsw-alias-label-secondary); font-size: 9.5px; white-space: nowrap; }
.th-output-time { color: var(--dsw-alias-label-secondary); font-size: 9.5px; white-space: nowrap; }
.th-output-download { color: var(--dsw-alias-label-secondary); text-decoration: none; flex: 0 0 auto; }
.th-output-preview { display: flex; flex-direction: column; gap: 9px; }
.th-output-preview-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.th-output-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.th-output-preview-head .th-output-download { margin-left: auto; }
.th-output-pre { margin: 0; min-height: 260px; max-height: 50vh; overflow: auto; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.th-mini-spinner { width: 11px; height: 11px; border: 1.5px solid color-mix(in srgb, currentColor 26%, transparent); border-top-color: currentColor; border-radius: 50%; animation: th-spin .8s linear infinite; display: inline-block; }
.th-mini-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; display: inline-block; }
.th-spinner { width: 22px; height: 22px; border: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); border-top-color: var(--dsw-alias-brand-primary); border-radius: 50%; animation: th-spin .8s linear infinite; }
.th-loading { display: inline-flex; align-items: center; gap: 9px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.th-root-loading { align-items: center; justify-content: center; }
.th-load-error { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 440px; text-align: center; color: var(--dsw-alias-label-secondary); }
.th-load-error h2 { margin: 0; font-size: 17px; color: var(--dsw-alias-label-primary); }
.th-load-error p { margin: 0 0 8px; font-size: 12px; overflow-wrap: anywhere; }
.th-toasts { position: fixed; right: 20px; bottom: 20px; z-index: 1400; display: flex; flex-direction: column; gap: 7px; max-width: 380px; pointer-events: none; }
.th-toast { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 10px 30px rgba(15, 23, 42, .20); font-size: 11.5px; animation: th-toast-in .18s ease-out; }
.th-toast.is-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-state-error-primary); }
.th-toast.is-success .th-icon { color: var(--dsw-alias-state-success-primary); }
.th-preview-detail { display: flex; flex-direction: column; gap: 13px; }
.th-preview-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-raw-details { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 9px; }
.th-raw-details summary { cursor: pointer; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.th-raw-details pre { margin: 8px 0 0; max-height: 250px; overflow: auto; padding: 9px; border-radius: 7px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
@keyframes th-spin { to { transform: rotate(360deg); } }
@keyframes th-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes th-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 980px) {
  .th-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .th-card-grid { grid-template-columns: minmax(0, 1fr); }
  .th-dataset-grid { grid-template-columns: minmax(0, 1fr); }
  .th-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .th-brand { min-width: 0; }
  .th-brandcopy span { display: none; }
  .th-topbar { gap: 14px; padding-left: 18px; padding-right: 18px; }
}
@media (max-width: 720px) {
  .th-page { width: calc(100% - 28px); padding-top: 20px; }
  .th-pagehead { flex-direction: column; align-items: flex-start; gap: 12px; }
  .th-toolbar { flex-direction: column; align-items: stretch; }
  .th-search { max-width: none; }
  .th-segmented { overflow-x: auto; }
  .th-tabs { order: 3; width: 100%; justify-content: space-between; }
  .th-topbar { flex-wrap: wrap; }
  .th-top-actions { margin-left: auto; }
  .th-form-grid, .th-stagebuilder-fields { grid-template-columns: minmax(0, 1fr); }
  .th-span-2 { grid-column: auto; }
  .th-stagecfg-labels { display: none; }
  .th-stagecfg { grid-template-columns: 24px minmax(0, 1fr); }
  .th-stagecfg .th-input { grid-column: span 2; }
  .th-taskcard-foot { flex-direction: column; align-items: flex-start; }
  .th-detail-commands { display: none; }
  .th-detail-grid { grid-template-columns: minmax(0, 1fr); }
  .th-modal-backdrop { padding: 8px; }
  .th-modal { max-height: 94vh; }
}
    `;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'techhub: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'techhub',
              locale: NS,
              inject: () => ({ fallbackTranslate: t }),
            },
            TechHubPage,
          ),
        );
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'techhub',
              order: 20,
              locale: NS,
              label: () => t('panel'),
            },
            TechHubNavIcon,
          ),
        );
      },
    };
  },
});
