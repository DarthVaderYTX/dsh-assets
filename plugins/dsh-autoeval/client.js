// AutoEval 的浏览器侧：左侧栏图标 + 主面板。
//
// 面板只有两个页签——「评测任务」和「任务模板」，点进一条任务或一个模板才是详情页。
// 面板不自己算评测，逻辑全在宿主插件里，这里只通过同源的 /autoeval-api 读写状态。
window.__ModuleLoader__.load({
  id: 'dsh-autoeval',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'autoeval'
    const API = '/autoeval-api'

    // ------------------------------------------------------------ 文案
    const zh = {
      'panel.title': 'AutoEval',
      'panel.subtitle': '四阶段评测流水线：抓取、标注、指标、报告',
      'tab.tasks': '评测任务',
      'tab.templates': '任务模板',
      'tab.querysets': 'Queryset',
      'qs.unit': '个 Queryset',
      'tpl.defaultsHint': '模板只定阶段与顺序；每个阶段用哪个执行模块、参数多少，提交任务时为每个组各自决定',
      'tpl.dragHint': '按住拖动调整顺序',
      'tpl.orderLocked': '预置阶段之间的先后固定，不能把其中一个拖到另一个后面',
      'tpl.stageOrderHint': '拖动左侧 ⠿ 调整顺序（也可以用 ↑ ↓）；四个预置阶段之间的先后固定，可以插自定义阶段',
      'submit.orderOnly': '模板只给阶段与顺序，下面为每个组挑具体的执行模块与参数',
      'submit.groupHint': 'Control 固定一个；Treatment 可以加多个。每组都要为每个阶段挑模块、填参数',
      'tpl.addStage': '新增阶段',
      'tpl.addTreatment': '新增 Treatment 组',
      'tpl.presetStage': '预置',
      'tpl.customStage': '自定义',
      'tpl.customModule': '自定义命令',
      'tpl.stageName': '阶段名称',
      'tpl.module': '模块',
      'run.comparison': '组间对比',
      'run.metric': '指标',
      'tpl.noOverride': '没有覆盖任何阶段',
      'tpl.groups': '对照组与实验组',
      'tpl.groupHint': '必须有一个 Control 组；Treatment 组可以加多个，每组能给任意阶段换模块、改参数',
      'tpl.groupName': '组名称',
      'tpl.control': 'Control 组',
      'tpl.treatment': 'Treatment',
      'tpl.overrides': '覆盖',
      'stage.custom': '自定义阶段',
      'action.moveUp': '上移',
      'action.moveDown': '下移',

      'qs.cases': '条用例',
      'qs.hint': '从 JSONL / CSV / XLSX 或飞书表格、智能表格导入，也可以直接编辑用例',
      'qs.empty': '还没有 Queryset，点右上角「导入 Queryset」。',
      'qs.import': '导入 Queryset',
      'qs.broken': '文件坏了',
      'qs.id': 'id',
      'qs.name': '名称',
      'qs.desc': '说明',
      'qs.queryField': 'query 列',
      'qs.fields': '字段',
      'qs.source': '来源',
      'qs.casesHint': '只读预览，点「编辑」可以改名称、说明和用例',
      'qs.more': '……还有更多条，编辑状态能看到全部。共多出 ',
      'qs.replaceCases': '重新导入',
      'qs.replaceTitle': '重新导入用例（会覆盖现有用例）',
      'qs.importTitle': '导入 Queryset',
      'qs.paste': '粘贴内容',
      'qs.orFile': '或者选文件',
      'qs.pickFile': '选一个 xlsx（第一行是表头）',
      'qs.link': '飞书链接或 token',
      'qs.sheetId': '工作表 id',
      'qs.tableId': '数据表 id',
      'qs.optional': '可留空，默认第一张表',
      'qs.parsed': '解析结果',
      'qs.skipped': '跳过空行',
      'qs.parse': '解析',
      'qs.applyNew': '存成 Queryset',
      'qs.applyReplace': '替换用例',
      'qs.imported': 'Queryset已保存。',
      'qs.noCases': '用例是空的，至少留一条。',
      'qs.confirmDelete': '删掉 Queryset',
      'qs.needText': '先粘贴内容或者选个文件。',
      'qs.needFile': '先选一个 xlsx 文件。',
      'qs.needLink': '先贴飞书链接或 token。',
      'qs.kind.jsonl': 'JSONL',
      'qs.kind.csv': 'CSV',
      'qs.kind.xlsx': 'XLSX',
      'qs.kind.sheet': '飞书表格',
      'qs.kind.bitable': '飞书智能表格',
      'qs.kind.manual': '手工维护',
      'confirm.querysetTitle': '确认保存这个 Queryset？',
      'confirm.querysetNote': '保存会重写工作区里的 querysets/<id>.json。',


      'action.submit': '提交任务',
      'action.run': '开始运行',
      'action.cancel': '取消',
      'action.edit': '编辑',
      'action.reload': '重新载入',
      'action.cancelTask': '取消运行',
      'action.rerun': '重跑',
      'action.delete': '删除',
      'action.back': '返回列表',
      'action.save': '保存',
      'action.refresh': '刷新',
      'action.newTemplate': '新建模板',
      'action.copyTemplate': '复制',
      'action.editTemplate': '编辑',
      'action.viewReport': '查看报告',
      'action.saveAsTemplate': '存为模板',

      'tasks.search': '搜索名称 / id / 模板',
      'tasks.allStatus': '全部状态',
      'tasks.empty': '没有匹配的任务。',
      'tasks.noRuns': '还没有提交过评测任务。点右上角「提交任务」跑第一个。',
      'tasks.name': '任务',
      'tasks.template': '模板',
      'tasks.status': '状态',
      'tasks.passRate': '通过率',
      'tasks.passed': '通过 / 计分',
      'tasks.cases': '用例',
      'tasks.duration': '耗时',
      'tasks.startedAt': '提交时间',

      'detail.summary': '概览',
      'detail.rows': '逐条结果',
      'detail.report': '报告',
      'detail.stages': '阶段',
      'detail.log': '日志',
      'detail.artifacts': '产物目录',
      'detail.noReport': '这次任务没有报告（可能跑失败了）。',
      'detail.noRows': '这次任务没有逐条结果。',
      'detail.rowQuery': '用例',
      'detail.rowScore': '分数',
      'detail.rowCoverage': '覆盖',
      'detail.rowMissed': '缺失信息点',
      'detail.rowSources': '来源',
      'detail.rowLatency': '检索耗时',
      'detail.rowMaterial': '材料',
      'detail.caseSnapshot': '用例快照',
      'detail.loading': '加载中…',
      'detail.noLog': '这个阶段还没有日志。',
      'detail.sum.cases': '用例数',
      'detail.sum.material': '带材料',
      'detail.sum.sources': '来源数',
      'detail.sum.errors': '抓取失败',
      'detail.sum.scored': '计分行',
      'detail.sum.passed': '通过',
      'detail.sum.total': '用例总数',
      'detail.sum.passRate': '通过率',
      'detail.sum.avgCoverage': '平均覆盖',
      'detail.sum.scrapeErrors': '抓取失败行',
      'detail.sum.format': '报告格式',
      'detail.sum.chars': '报告字数',
      'detail.sum.rows': '结果行数',
      'detail.sum.groups': '分组',
      'detail.sum.count': '样本数',
      'detail.sum.avgMs': '平均耗时',
      'detail.sum.p50Ms': 'P50 耗时',
      'detail.sum.p95Ms': 'P95 耗时',

      'tpl.empty': '还没有自定义模板。点「新建模板」做一个。',
      'tpl.builtin': '内置',
      'tpl.custom': '自定义',
      'tpl.new': '新建任务模板',
      'tpl.edit': '编辑任务模板',
      'tpl.readonly': '内置模板只读。要改就先复制成自定义模板。',
      'tpl.id': '模板 id',
      'tpl.name': '显示名称',
      'tpl.desc': '说明（可选）',
      'tpl.badId': '模板 id 只能用小写字母、数字和短横线',
      'tpl.copySuffix': '副本',
      'tpl.confirmDelete': '删除模板',
      'tpl.config': '各阶段配置',
      'tpl.tab.form': '表单',
      'tpl.tab.yaml': 'YAML',
      'tpl.yaml': '模板配置文件',
      'tpl.yamlHint': '也可以直接用编辑器改 templates/<id>.yaml',
      'tpl.yamlSync': 'YAML 是模板的真实来源；表单保存会重写成 YAML，两边不会各改各的。',
      'tpl.saved': '模板已保存。',
      'tpl.viewing': '只读查看，点「编辑」改配置',
      'tpl.editing': '编辑中，保存前不会动文件',
      'tpl.noParams': '这个执行模板没有可配参数',
      'confirm.ok': '确认',
      'confirm.runTitle': '确认提交这次评测？',
      'confirm.runNote': '提交后立刻开跑，四个阶段会按上面的模板执行；期间可以在任务详情里看进度或取消。',
      'confirm.templateTitle': '确认保存对模板的更改？',
      'confirm.templateNote': '保存会重写 templates/<id>.yaml，之后提交的任务都用新配置。',
      'confirm.yamlTitle': '确认保存模板 YAML？',
      'confirm.yamlNote': '保存会按这段 YAML 重写模板文件；id 由内容里的 id 字段决定。',
      'confirm.lines': '行',
      'tpl.yamlEmpty': 'YAML 是空的，没什么可存。',
      'ws.title': '工作区',
      'ws.copy': '复制路径',
      'ws.open': '打开目录',
      'ws.config': '配置',
      'ws.templates': '模板',
      'ws.runs': '运行',
      'ws.copied': '工作区路径已复制。',
      'ws.copyManual': '复制这个路径：',
      'ws.opened': '已打开工作区：',
      'ws.saved': '工作区配置已保存。',
      'tpl.broken': '配置有问题',
      'tpl.usedBy': '用在',

      'submit.title': '提交评测任务',
      'submit.name': '任务名称',
      'submit.cases': '用例集（JSON 数组）',
      'submit.casesHint': '每条至少要有 id 和 query；infoPoints 是判分用的信息点。',
      'submit.template': '用哪个任务模板',
      'submit.templateHint': '阶段配置取自模板本身；要改配置先去「任务模板」里改模板。',
      'submit.pickTemplate': '先选一个任务模板。',
      'submit.searchTemplate': '按名称或 id 过滤模板…',
      'submit.noMatch': '没有匹配的模板。',
      'submit.sourceText': '粘贴 JSON',
      'submit.sourceQueryset': '选 Queryset',
      'submit.queryset': '用哪个 Queryset',
      'submit.pickQueryset': '先选一个 Queryset。',
      'submit.searchQueryset': '按名称或 id 过滤 Queryset…',
      'submit.noQueryset': '没有匹配的 Queryset。',

      'submit.progress': '运行中',

      'field.template': '执行模板',
      'field.params': '参数（JSON）',
      'field.command': '自定义命令（stdin 收 JSON，stdout 吐 JSON）',

      'stage.scraping': 'Scraping · 抓取',
      'stage.annotation': 'Annotation · 标注',
      'stage.metrics': 'Metrics · 指标',
      'stage.reporting': 'Reporting · 报告',
      'stage.hint.scraping': '按用例的 query 跑检索，把返回的来源与摘要当作待判材料。',
      'stage.hint.annotation': '按信息点判覆盖：全部命中记 1，缺任一条记 0；冲突不计错。',
      'stage.hint.metrics': '聚合通过率（分母 = 有分数的行）、平均覆盖与检索耗时。',
      'stage.hint.reporting': '产出 Markdown 报告，同时落盘 rows.jsonl。',

      'preset.scraping.websearch': '内置 · 检索抓取',
      'preset.scraping.inline': '内置 · 用例自带材料',
      'preset.scraping.custom': '自定义命令',
      'preset.annotation.coverage-keyword': '内置 · 信息点覆盖',
      'preset.annotation.coverage-rubric': '内置 · Rubric 覆盖',
      'preset.annotation.custom': '自定义命令',
      'preset.metrics.standard': '内置 · 标准指标',
      'preset.metrics.grouped': '内置 · 分组指标',
      'preset.metrics.custom': '自定义命令',
      'preset.reporting.markdown': '内置 · Markdown 报告',
      'preset.reporting.json': '内置 · JSON 快照',
      'preset.reporting.custom': '自定义命令',

      'label.running': '运行中',
      'label.idle': '空闲',
      'label.done': '完成',
      'label.failed': '失败',
      'label.cancelled': '已取消',
      'label.pending': '等待',
      'label.passRate': '通过率',
      'label.avgCoverage': '平均覆盖',
      'label.total': '用例总数',
      'label.scored': '有分数的行',
      'label.passed': '通过',
      'label.scrapeErrors': '抓取失败',
      'label.p50': 'P50 耗时',
      'label.p95': 'P95 耗时',
      'label.avg': '平均耗时',
      'label.saved': '已保存',
      'label.templates': '个模板',
      'label.tasks': '个任务',

      'error.cases': '用例不是合法的 JSON 数组',
      'error.params': '该阶段参数不是合法的 JSON',
      'tpl.expand': '展开',
      'tpl.collapse': '折叠',
      'tpl.expandAll': '全部展开',
      'tpl.collapseAll': '全部折叠',
    }

    const en = {
      'panel.title': 'AutoEval',
      'panel.subtitle': 'Four-stage evaluation pipeline: scraping, annotation, metrics, reporting',
      'tab.tasks': 'Tasks',
      'tab.templates': 'Templates',
      'tab.querysets': 'Queryset',
      'qs.unit': 'querysets',
      'tpl.stageOrderHint': 'Drag the ⠿ handle to reorder (or use ↑ ↓); the four preset stages keep their relative order and custom stages can be interleaved',
      'tpl.addStage': 'Add stage',
      'tpl.addTreatment': 'Add treatment',
      'tpl.presetStage': 'Preset',
      'tpl.customStage': 'Custom',
      'tpl.customModule': 'Custom command',
      'tpl.stageName': 'Stage name',
      'tpl.module': 'Module',
      'run.comparison': 'Group comparison',
      'run.metric': 'Metric',
      'tpl.noOverride': 'No stage overridden',
      'tpl.groups': 'Control and treatment groups',
      'tpl.groupHint': 'Exactly one Control group; add as many Treatments as you like, and each can override any stage module or parameter',
      'tpl.groupName': 'Group name',
      'tpl.control': 'Control',
      'tpl.treatment': 'Treatment',
      'tpl.overrides': 'Override',
      'stage.custom': 'Custom stage',
      'action.moveUp': 'Move up',
      'action.moveDown': 'Move down',

      'qs.cases': 'cases',
      'qs.hint': 'Import from JSONL / CSV / XLSX, Feishu Sheets or Bitable; cases stay editable',
      'qs.empty': 'No queryset yet — hit “Import queryset”.',
      'qs.import': 'Import queryset',
      'qs.broken': 'Broken file',
      'qs.id': 'id',
      'qs.name': 'Name',
      'qs.desc': 'Description',
      'qs.queryField': 'Query column',
      'qs.fields': 'Fields',
      'qs.source': 'Source',
      'qs.casesHint': 'Read-only preview; hit Edit to change name, description and cases',
      'qs.more': '…more cases, open Edit to see all. Extra: ',
      'qs.replaceCases': 'Re-import',
      'qs.replaceTitle': 'Re-import cases (replaces the current ones)',
      'qs.importTitle': 'Import queryset',
      'qs.paste': 'Paste content',
      'qs.orFile': 'Or pick a file',
      'qs.pickFile': 'Pick an xlsx (first row is the header)',
      'qs.link': 'Feishu link or token',
      'qs.sheetId': 'Sheet id',
      'qs.tableId': 'Table id',
      'qs.optional': 'Optional — first sheet is used by default',
      'qs.parsed': 'Parsed',
      'qs.skipped': 'blank rows skipped',
      'qs.parse': 'Parse',
      'qs.applyNew': 'Save as queryset',
      'qs.applyReplace': 'Replace cases',
      'qs.imported': 'Queryset saved.',
      'qs.noCases': 'No cases left — keep at least one.',
      'qs.confirmDelete': 'Delete queryset',
      'qs.needText': 'Paste something or pick a file first.',
      'qs.needFile': 'Pick an xlsx file first.',
      'qs.needLink': 'Paste a Feishu link or token first.',
      'qs.kind.jsonl': 'JSONL',
      'qs.kind.csv': 'CSV',
      'qs.kind.xlsx': 'XLSX',
      'qs.kind.sheet': 'Feishu Sheets',
      'qs.kind.bitable': 'Feishu Bitable',
      'qs.kind.manual': 'Hand-maintained',
      'confirm.querysetTitle': 'Save this queryset?',
      'confirm.querysetNote': 'Saving rewrites querysets/<id>.json in the workspace.',


      'action.submit': 'Submit task',
      'action.run': 'Run',
      'action.cancel': 'Cancel',
      'action.edit': 'Edit',
      'action.reload': 'Reload',
      'action.cancelTask': 'Cancel run',
      'action.rerun': 'Re-run',
      'action.delete': 'Delete',
      'action.back': 'Back',
      'action.save': 'Save',
      'action.refresh': 'Refresh',
      'action.newTemplate': 'New template',
      'action.copyTemplate': 'Duplicate',
      'action.editTemplate': 'Edit',
      'action.viewReport': 'Open report',
      'action.saveAsTemplate': 'Save as template',

      'tasks.search': 'Search name / id / template',
      'tasks.allStatus': 'All statuses',
      'tasks.empty': 'No matching tasks.',
      'tasks.noRuns': 'No evaluation task yet. Use "Submit task" to run the first one.',
      'tasks.name': 'Task',
      'tasks.template': 'Template',
      'tasks.status': 'Status',
      'tasks.passRate': 'Pass rate',
      'tasks.passed': 'Passed / scored',
      'tasks.cases': 'Cases',
      'tasks.duration': 'Duration',
      'tasks.startedAt': 'Submitted',

      'detail.summary': 'Overview',
      'detail.rows': 'Per-case',
      'detail.report': 'Report',
      'detail.stages': 'Stages',
      'detail.log': 'Log',
      'detail.artifacts': 'Artifacts',
      'detail.noReport': 'This task has no report (it may have failed).',
      'detail.noRows': 'This task has no per-case result.',
      'detail.rowQuery': 'Case',
      'detail.rowScore': 'Score',
      'detail.rowCoverage': 'Coverage',
      'detail.rowMissed': 'Missing points',
      'detail.rowSources': 'Sources',
      'detail.rowLatency': 'Search latency',
      'detail.rowMaterial': 'Material',
      'detail.caseSnapshot': 'Cases snapshot',
      'detail.loading': 'Loading…',
      'detail.noLog': 'No log for this stage yet.',
      'detail.sum.cases': 'Cases',
      'detail.sum.material': 'With material',
      'detail.sum.sources': 'Sources',
      'detail.sum.errors': 'Scrape errors',
      'detail.sum.scored': 'Scored',
      'detail.sum.passed': 'Passed',
      'detail.sum.total': 'Total cases',
      'detail.sum.passRate': 'Pass rate',
      'detail.sum.avgCoverage': 'Avg coverage',
      'detail.sum.scrapeErrors': 'Scrape errors',
      'detail.sum.format': 'Format',
      'detail.sum.chars': 'Chars',
      'detail.sum.rows': 'Rows',
      'detail.sum.groups': 'Groups',
      'detail.sum.count': 'Count',
      'detail.sum.avgMs': 'Avg latency',
      'detail.sum.p50Ms': 'P50 latency',
      'detail.sum.p95Ms': 'P95 latency',

      'tpl.empty': 'No custom template yet. Use "New template".',
      'tpl.builtin': 'built-in',
      'tpl.custom': 'custom',
      'tpl.new': 'New template',
      'tpl.edit': 'Edit template',
      'tpl.readonly': 'Built-in templates are read-only. Duplicate it to change anything.',
      'tpl.id': 'Template id',
      'tpl.name': 'Display name',
      'tpl.desc': 'Description (optional)',
      'tpl.badId': 'Template id accepts lowercase letters, digits and dashes only',
      'tpl.copySuffix': 'copy',
      'tpl.confirmDelete': 'Delete template',
      'tpl.config': 'Stage config',
      'tpl.tab.form': 'Form',
      'tpl.tab.yaml': 'YAML',
      'tpl.yaml': 'Template file',
      'tpl.yamlHint': 'You can also edit templates/<id>.yaml directly',
      'tpl.yamlSync': 'The YAML file is the source of truth; saving the form rewrites it, so the two never drift.',
      'tpl.saved': 'Template saved.',
      'tpl.broken': 'Broken config',
      'tpl.viewing': 'Read-only; hit Edit to change the config',
      'tpl.editing': 'Editing — nothing is written until you save',
      'tpl.noParams': 'This preset has no parameters',
      'confirm.ok': 'Confirm',
      'confirm.runTitle': 'Submit this evaluation?',
      'confirm.runNote': 'It starts right away and runs the four stages above; you can watch or cancel from the task detail.',
      'confirm.templateTitle': 'Save changes to this template?',
      'confirm.templateNote': 'Saving rewrites templates/<id>.yaml; later submissions will use the new config.',
      'confirm.yamlTitle': 'Save this template YAML?',
      'confirm.yamlNote': 'Saving rewrites the template file from this YAML; the id comes from the id field inside.',
      'confirm.lines': 'lines',
      'tpl.yamlEmpty': 'The YAML is empty, nothing to save.',
      'ws.title': 'Workspace',
      'ws.copy': 'Copy path',
      'ws.open': 'Open folder',
      'ws.config': 'Config',
      'ws.templates': 'templates',
      'ws.runs': 'runs',
      'ws.copied': 'Workspace path copied.',
      'ws.copyManual': 'Copy this path:',
      'ws.opened': 'Opened workspace: ',
      'ws.saved': 'Workspace config saved.',
      'tpl.usedBy': 'used by',

      'submit.title': 'Submit evaluation task',
      'submit.name': 'Task name',
      'submit.cases': 'Cases (JSON array)',
      'submit.casesHint': 'Each case needs at least id and query; infoPoints drives scoring.',
      'submit.template': 'Template to run',
      'submit.templateHint': 'Stage config comes from the template; edit the template first if it needs changes.',
      'submit.pickTemplate': 'Pick a template first.',
      'submit.searchTemplate': 'Filter templates by name or id…',
      'submit.noMatch': 'No template matches.',
      'submit.sourceText': 'Paste JSON',
      'submit.sourceQueryset': 'Pick a queryset',
      'submit.queryset': 'Queryset',
      'submit.pickQueryset': 'Pick a queryset first.',
      'submit.searchQueryset': 'Filter querysets by name or id…',
      'submit.noQueryset': 'No queryset matches.',

      'submit.progress': 'Running',

      'field.template': 'Stage template',
      'field.params': 'Params (JSON)',
      'field.command': 'Custom command (JSON in via stdin, JSON out via stdout)',

      'stage.scraping': 'Scraping',
      'stage.annotation': 'Annotation',
      'stage.metrics': 'Metrics',
      'stage.reporting': 'Reporting',
      'stage.hint.scraping': 'Search each query and treat the returned snippets as material.',
      'stage.hint.annotation': 'Info-point coverage: 1 when all points hit, 0 otherwise; conflicts never cost points.',
      'stage.hint.metrics': 'Aggregate pass rate (denominator = scored rows), coverage and search latency.',
      'stage.hint.reporting': 'Write a Markdown report and rows.jsonl.',

      'preset.scraping.websearch': 'built-in · web search',
      'preset.scraping.inline': 'built-in · case material',
      'preset.scraping.custom': 'custom command',
      'preset.annotation.coverage-keyword': 'built-in · info points',
      'preset.annotation.coverage-rubric': 'built-in · rubric',
      'preset.annotation.custom': 'custom command',
      'preset.metrics.standard': 'built-in · standard',
      'preset.metrics.grouped': 'built-in · grouped',
      'preset.metrics.custom': 'custom command',
      'preset.reporting.markdown': 'built-in · Markdown',
      'preset.reporting.json': 'built-in · JSON',
      'preset.reporting.custom': 'custom command',

      'label.running': 'running',
      'label.idle': 'idle',
      'label.done': 'done',
      'label.failed': 'failed',
      'label.cancelled': 'cancelled',
      'label.pending': 'pending',
      'label.passRate': 'Pass rate',
      'label.avgCoverage': 'Avg coverage',
      'label.total': 'Cases',
      'label.scored': 'Scored rows',
      'label.passed': 'Passed',
      'label.scrapeErrors': 'Scrape errors',
      'label.p50': 'P50 latency',
      'label.p95': 'P95 latency',
      'label.avg': 'Avg latency',
      'label.saved': 'Saved',
      'label.templates': 'templates',
      'label.tasks': 'tasks',

      'error.cases': 'Cases are not a valid JSON array',
      'error.params': 'Stage params are not valid JSON',
      'tpl.defaultsHint': 'A template only fixes the stages and their order; each stage module and its parameters are decided per group when you submit a run',
      'tpl.dragHint': 'Drag to reorder',
      'tpl.expand': 'Expand',
      'tpl.collapse': 'Collapse',
      'tpl.expandAll': 'Expand all',
      'tpl.collapseAll': 'Collapse all',
      'tpl.orderLocked': 'Preset stages keep their relative order: you cannot drag one past another',
      'submit.orderOnly': 'The template only fixes the stage order; pick each stage module and its parameters per group below',
      'submit.groupHint': 'One Control is fixed; add as many Treatments as you like. Every group picks a module and params for every stage',
    }

    // ------------------------------------------------------------ 演示用例
    const DEMO_CASES = [
      { id: 'c1', bucket: 'stable', query: 'Python 3.13 新特性', infoPoints: ['Python', '3.13'] },
      { id: 'c2', bucket: 'stable', query: 'TypeScript 5.9 release notes', infoPoints: ['TypeScript', '5.9'] },
      { id: 'c3', bucket: 'detail', query: 'DeepSeek API 定价 每百万 tokens', infoPoints: ['DeepSeek', '百万'] },
      { id: 'c4', bucket: 'hard', query: 'Linus Torvalds 出生于哪里', infoPoints: ['Helsinki'] },
    ]

    // ------------------------------------------------------------ 样式
    const STYLE = `
.ae-page { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 28px; height: 100%; overflow: auto; }
.ae-head { display: flex; align-items: flex-start; gap: 12px; }
.ae-title { margin: 0; font-size: 17px; font-weight: 650; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-sub { margin: 2px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-pill { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  padding: 4px 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
  color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary, #9aa0a6); }
.ae-pill[data-state="running"] .ae-dot { background: var(--dsw-alias-brand-primary, #247bbf); }
.ae-pill[data-state="done"] .ae-dot { background: var(--dsw-alias-state-success-primary, #1a7f4b); }
.ae-pill[data-state="failed"] .ae-dot { background: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); }
.ae-tab { appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 13px;
  padding: 8px 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); border-bottom: 2px solid transparent; }
.ae-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #1f1f1f); border-bottom-color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-subtabs { display: flex; gap: 6px; }
.ae-subtab { appearance: none; cursor: pointer; font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background: transparent;
  color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-subtab[data-active="true"] { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.05));
  color: var(--dsw-alias-label-primary, #1f1f1f); border-color: var(--dsw-alias-border-l2, rgba(0,0,0,.2)); }
.ae-card { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1));
  border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.ae-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ae-card-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-card-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-back { appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-brand-primary, #247bbf); padding: 0; align-self: flex-start; }
.ae-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ae-chip { appearance: none; cursor: pointer; font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); background: transparent;
  color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-chip[data-active="true"] { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.05));
  color: var(--dsw-alias-label-primary, #1f1f1f); border-color: var(--dsw-alias-border-l2, rgba(0,0,0,.24)); }
.ae-chip:disabled { cursor: default; opacity: .7; }
.ae-input, .ae-textarea { font: inherit; font-size: 12.5px; padding: 7px 9px; border-radius: 8px; width: 100%;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f); box-sizing: border-box; }
.ae-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; resize: vertical; }
.ae-input:disabled, .ae-textarea:disabled { opacity: .65; }
.ae-field { display: flex; flex-direction: column; gap: 4px; }
.ae-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-btn { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 7px 13px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); background: transparent;
  color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-btn:disabled { cursor: default; opacity: .5; }
.ae-btn-primary { background: var(--dsw-alias-brand-primary, #247bbf); border-color: transparent; color: #fff; }
.ae-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ae-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ae-toolbar-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b);
  font-variant-numeric: tabular-nums; margin-left: auto; }
.ae-search { width: 220px; }
.ae-select { font: inherit; font-size: 12.5px; padding: 7px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-row-toggle { appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary, #1f1f1f); padding: 0; text-align: left; }
.ae-state { font-size: 11.5px; }
.ae-state[data-state="running"] { color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-state[data-state="done"] { color: var(--dsw-alias-state-success-primary, #1a7f4b); }
.ae-state[data-state="failed"] { color: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-row-actions { display: flex; gap: 10px; white-space: nowrap; }
.ae-link { appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-brand-primary, #247bbf); padding: 0; }
.ae-link:disabled { cursor: default; opacity: .5; }
.ae-danger { color: var(--dsw-alias-state-error-primary, #c0392b) !important; }
.ae-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ae-table th { text-align: left; font-weight: 500; font-size: 11px; letter-spacing: .02em;
  color: var(--dsw-alias-label-secondary, #6b6b6b); padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); white-space: nowrap; }
.ae-table td { padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06));
  color: var(--dsw-alias-label-primary, #1f1f1f); vertical-align: top; }
.ae-table tr:last-child td { border-bottom: 0; }
.ae-metrics { display: flex; flex-wrap: wrap; gap: 10px; }
.ae-metric { flex: 1 1 96px; padding: 10px 12px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.ae-metric-k { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-metric-v { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #1f1f1f); margin-top: 2px; }
.ae-fold { display: flex; align-items: center; gap: 6px; background: none; border: none;
  padding: 0; cursor: pointer; color: inherit; font: inherit; text-align: left; }
.ae-fold-hint { font-size: 12px; color: var(--dsw-alias-text-l3, rgba(0,0,0,.45)); }
.ae-group-summary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ae-drag { cursor: grab; color: var(--dsw-alias-text-l3, rgba(0,0,0,.35)); font-size: 14px;
  line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none; }
.ae-drag:active { cursor: grabbing; }
.ae-stage-edit[data-dragging="true"] { opacity: .45; }
.ae-stage-edit[data-dropping="true"] { outline: 2px dashed var(--dsw-alias-brand-primary, #4b7bec); outline-offset: 1px; }
.ae-group-edit { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px;
  border: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.18)); }
.ae-override { display: flex; flex-direction: column; gap: 6px; }
.ae-override-body { padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
.ae-check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ae-row-actions { display: flex; gap: 4px; margin-left: auto; }
.ae-btn-xs { padding: 2px 8px; font-size: 12px; line-height: 18px; }
.ae-qs-card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; cursor: pointer;
  border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); }
.ae-qs-card:hover { border-color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-qs-card[data-broken="true"] { border-color: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-qs-table { max-height: 360px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.ae-import-preview { margin: 8px 0; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.ae-import-sample { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.ae-select { position: relative; }
.ae-select-button { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
  padding: 7px 10px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 12.5px; text-align: left;
  color: var(--dsw-alias-label-primary, #1f1f1f); background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); }
.ae-select-button:hover { border-color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-select-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ae-select-menu { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
  padding: 6px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); box-shadow: 0 8px 24px rgba(0,0,0,.16); }
.ae-select-search { margin-bottom: 6px; }
.ae-select-list { display: flex; flex-direction: column; max-height: 240px; overflow: auto; }
.ae-select-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 0; border-radius: 8px;
  background: transparent; cursor: pointer; font: inherit; font-size: 12.5px; text-align: left;
  color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-select-item:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04)); }
.ae-select-item[data-active="true"] { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06)); font-weight: 600; }
.ae-select-name { flex: 1 1 auto; }
.ae-select-id { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-select-empty { padding: 10px 8px; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-modal-mask { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,.28); padding: 24px; }
.ae-modal { width: min(560px, 92vw); max-height: 78vh; overflow: auto; box-sizing: border-box;
  padding: 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); box-shadow: 0 12px 32px rgba(0,0,0,.22); }
.ae-modal-title { font-size: 13.5px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f1f1f);
  margin-bottom: 10px; }
.ae-modal-body { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.ae-workspace { margin: 8px 0; padding: 8px 12px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06));
  font-size: 12px; }
.ae-workspace-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ae-workspace-label { color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-workspace-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-workspace-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 12px;
  margin-top: 8px; }
.ae-acc { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
  border-radius: 10px; overflow: hidden; }
.ae-acc-item { border-top: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.06)); }
.ae-acc-item:first-child { border-top: 0; }
.ae-acc-head { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
  padding: 9px 12px; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px;
  color: var(--dsw-alias-label-primary, #1f1f1f); text-align: left; }
.ae-acc-head:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.ae-acc-title { flex: 1 1 auto; }
.ae-acc-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); font-variant-numeric: tabular-nums; }
.ae-acc-body { display: flex; flex-direction: column; gap: 6px; padding: 2px 12px 12px 32px; }
.ae-acc-item[data-status="running"] .ae-acc-title { color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-acc-item[data-status="failed"] .ae-acc-title { color: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-caret { color: var(--dsw-alias-label-secondary, #6b6b6b); font-size: 10px; width: 10px; }
.ae-log { margin: 0; max-height: 200px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #6b6b6b); white-space: pre-wrap; }
.ae-pre { margin: 0; max-height: 460px; overflow: auto; padding: 12px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-primary, #1f1f1f); white-space: pre-wrap; }
.ae-detail-row { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.ae-detail-key { min-width: 64px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-badge { font-size: 10.5px; padding: 2px 7px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-badge[data-kind="builtin"] { color: var(--dsw-alias-brand-primary, #247bbf); border-color: currentColor; }
.ae-template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ae-template-card { border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;
  background: var(--dsw-alias-bg-base, #fff); text-align: left; font: inherit; }
.ae-template-card:hover { border-color: var(--dsw-alias-border-l2, rgba(0,0,0,.24)); }
.ae-template-name { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-stage-edit { display: flex; flex-direction: column; gap: 6px; padding: 10px 0;
  border-top: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1)); }
.ae-stage-edit:first-of-type { border-top: 0; }
.ae-progress { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.08)); overflow: hidden; }
.ae-progress > i { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary, #247bbf); }
.ae-empty { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); padding: 12px 0; }
.ae-error { font-size: 12px; color: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-notice { font-size: 12px; color: var(--dsw-alias-state-success-primary, #1a7f4b); }
.ae-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; word-break: break-all; }
`

    function statusState(status) {
      if (status === 'running') return 'running'
      if (status === 'done') return 'done'
      if (status === 'failed') return 'failed'
      return 'idle'
    }

    function pct(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) return '-'
      return `${Math.round(value * 1000) / 10}%`
    }

    function duration(ms) {
      if (typeof ms !== 'number' || ms < 0) return '-'
      return ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms)}ms`
    }

    // ------------------------------------------------------------ 图标
    function AutoEvalIcon({ size = 20, active = false }) {
      const stroke = active ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'currentColor'
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('path', {
        d: 'M3.4 4.6h17.2l-6.6 7.6v6.2l-4 2v-8.2z',
        stroke, strokeWidth: 1.6, strokeLinejoin: 'round', fill: active ? 'rgba(36,123,191,.14)' : 'none',
      }),
      h('path', {
        d: 'M14.2 16.6l2.2 2.2 4.2-4.6',
        stroke: 'var(--dsw-alias-state-success-primary, #1a7f4b)', strokeWidth: 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    // ------------------------------------------------------------ 面板
    function AutoEvalPanel({ t }) {
      const [state, setState] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [casesText, setCasesText] = React.useState(() => JSON.stringify(DEMO_CASES, null, 2))
      const [view, setView] = React.useState('tasks')
      const [submitting, setSubmitting] = React.useState(false)
      const [taskId, setTaskId] = React.useState('')
      const [detail, setDetail] = React.useState(null)
      const [detailTab, setDetailTab] = React.useState('summary')
      const [templateDraft, setTemplateDraft] = React.useState(null)
      const [taskQuery, setTaskQuery] = React.useState('')
      const [taskStatus, setTaskStatus] = React.useState('all')
      const [openStages, setOpenStages] = React.useState({})
      const [stageGroup, setStageGroup] = React.useState('')
      const [submitGroups, setSubmitGroups] = React.useState(null)
      const [dragStage, setDragStage] = React.useState(-1)
      const [dragOverStage, setDragOverStage] = React.useState(-1)
      const [groupFolded, setGroupFolded] = React.useState({})
      const [templateTab, setTemplateTab] = React.useState('form')
      const [templateYaml, setTemplateYaml] = React.useState('')
      const [yamlBusy, setYamlBusy] = React.useState(false)
      const [workspaceEditing, setWorkspaceEditing] = React.useState(false)
      const [editingDraft, setEditingDraft] = React.useState(false)
      const [confirmDialog, setConfirmDialog] = React.useState(null)
      const [qsDraft, setQsDraft] = React.useState(null)
      const [qsCasesText, setQsCasesText] = React.useState('')
      const [qsBusy, setQsBusy] = React.useState(false)
      const [importer, setImporter] = React.useState(null)
      const [casesSource, setCasesSource] = React.useState('text')
      const [casesQuerysetId, setCasesQuerysetId] = React.useState('')
      const [pickerKey, setPickerKey] = React.useState('')
      const [pickerQuery, setPickerQuery] = React.useState('')
      const [workspaceDraft, setWorkspaceDraft] = React.useState(null)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      async function api(path, options) {
        const response = await fetch(`${API}${path}`, options)
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.ok === false) throw new Error(data.error || `${response.status} ${path}`)
        return data
      }

      function readJson(text) {
        try {
          return { ok: true, value: JSON.parse(text) }
        } catch (failure) {
          return { ok: false, error: String(failure.message || failure) }
        }
      }

      function catalogStage(stageId) {
        return (state.stages || []).find((item) => item.id === stageId) || null
      }

      function moduleList(stageId) {
        const stage = catalogStage(stageId)
        if (stage) return stage.presets
        const custom = state.customStage || { module: 'custom', config: { command: '' }, fields: [] }
        return [{ id: custom.module, config: custom.config, fields: custom.fields }]
      }

      function moduleOf(stageId, moduleId) {
        const list = moduleList(stageId)
        return list.find((item) => item.id === moduleId) || list[0]
      }

      /** 模板只是一张编排清单：数组顺序就是执行顺序，v1 的对象形式也认。
       *  具体实现（模块 + 参数）由提交时每组自己定，这里只给一个默认起点。 */
      function stagesFromTemplate(template) {
        const raw = template && template.stages
        const list = Array.isArray(raw)
          ? raw
          : (state.stages || [])
            .filter((stage) => raw && raw[stage.id])
            .map((stage) => ({ id: stage.id }))
        return list.map((item) => {
          const stageId = String(item.id)
          const custom = !catalogStage(stageId)
          const preset = moduleOf(stageId, custom ? 'custom' : moduleList(stageId)[0].id)
          return {
            id: stageId,
            kind: custom ? 'custom' : 'preset',
            name: item.name || stageId,
            module: preset ? preset.id : 'custom',
            config: { ...(preset ? preset.config : {}) },
            fields: (preset && preset.fields) || [],
          }
        })
      }
      function defaultDraft(data) {
        const preferred = data.workspace && data.workspace.config ? data.workspace.config.defaultTemplate : ''
        const template = ((data.templates || []).find((item) => item.id === preferred))
          || (data.templates || []).find((item) => item.builtin)
          || (data.templates || [])[0]
        return {
          templateId: template ? template.id : '',
          name: template ? template.name : 'AutoEval 运行',
        }
      }

      const load = React.useCallback(async () => {
        try {
          const data = await api('/state')
          setState(data)
          setDraft((current) => current || defaultDraft(data))
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }, [])

      const loadDetail = React.useCallback(async (runId) => {
        if (!runId) return
        try {
          const [info, rows, report] = await Promise.all([
            api(`/runs/detail?id=${encodeURIComponent(runId)}`),
            api(`/rows?run=${encodeURIComponent(runId)}`).catch(() => null),
            api(`/report?run=${encodeURIComponent(runId)}`).catch(() => null),
          ])
          const parsed = []
          if (rows && typeof rows.text === 'string') {
            for (const line of rows.text.split('\n')) {
              if (!line.trim()) continue
              try {
                parsed.push(JSON.parse(line))
              } catch {
                // 半行产物，跳过
              }
            }
          }
          setDetail({ run: info.run, log: info.log || [], rows: parsed, report: report ? report.text : '' })
        } catch (failure) {
          setDetail({ run: null, log: [], rows: [], report: '', error: String(failure.message || failure) })
        }
      }, [])

      React.useEffect(() => {
        void load()
        if (taskId) void loadDetail(taskId)
        const timer = setInterval(() => {
          void load()
          if (taskId) void loadDetail(taskId)
        }, 1500)
        return () => clearInterval(timer)
      }, [load, loadDetail, taskId])

      const active = state && state.active
      const runs = (state && state.runs) || []
      const templates = (state && state.templates) || []
      const polled = (detail && detail.run) || (taskId ? runs.find((item) => item.id === taskId) : null)
      const status = active ? active.status : (runs[0] ? runs[0].status : 'idle')

      // ---- 数据操作 ----

      /** 提交前先把要跑的东西摊开给用户看一眼，确认了才发。 */
      function submit() {
        setError('')
        setNotice('')
        const template = templates.find((item) => item.id === draft.templateId)
        if (!template) {
          setError(t('submit.pickTemplate'))
          return
        }
        let payload
        let caseRows
        if (casesSource === 'queryset') {
          const queryset = querysets.find((item) => item.id === casesQuerysetId)
          if (!queryset) {
            setError(t('submit.pickQueryset'))
            return
          }
          payload = { name: draft.name, templateId: template.id, querysetId: queryset.id }
          caseRows = [[t('submit.queryset'), `${queryset.name}（${queryset.id}）`],
            [t('submit.cases'), String(queryset.count)]]
        } else {
          const cases = readJson(casesText)
          if (!cases.ok || !Array.isArray(cases.value) || cases.value.length === 0) {
            setError(`${t('error.cases')}${cases.ok ? '' : `：${cases.error}`}`)
            return
          }
          payload = { name: draft.name, templateId: template.id, cases: cases.value }
          caseRows = [[t('submit.cases'), String(cases.value.length)]]
        }
        const rows = [
          [t('submit.name'), draft.name || '-'],
          [t('submit.template'), `${template.name}（${template.id}）`],
          ...caseRows,
        ]
        const groups = ensureSubmitGroups()
        const groupPayload = submitGroupPayload(template, groups)
        payload.groups = groupPayload
        const stageRows = []
        for (const group of groups) {
          const prefix = group.kind === 'control' ? t('tpl.control') : group.name
          const parts = stagesFromTemplate(template).map((stage) => {
            const entry = group.stages[stage.id] || {}
            const config = Object.keys(entry.config || {}).length > 0 ? ` ${JSON.stringify(entry.config)}` : ''
            return `${stageLabel(stage)}:${entry.module || stage.module}${config}`
          })
          stageRows.push(`${prefix} · ${parts.join(' | ')}`)
        }
        setConfirmDialog({
          kind: 'run',
          title: t('confirm.runTitle'),
          note: t('confirm.runNote'),
          rows,
          stages: stageRows,
          payload,
        })
      }

      async function runConfirmed(payload) {
        setConfirmDialog(null)
        setBusy(true)
        try {
          const result = await api('/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setSubmitting(false)
          setView('tasks')
          setDetailTab('summary')
          setDetail(null)
          setTaskId(result.runId)
          setNotice(`runId: ${result.runId}`)
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setBusy(false)
        }
      }

      async function cancel() {
        try {
          await api('/cancel', { method: 'POST' })
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      async function rerun(runId) {
        setError('')
        try {
          const result = await api('/runs/rerun', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: runId }),
          })
          setNotice(`runId: ${result.runId}`)
          setView('tasks')
          setDetailTab('summary')
          setDetail(null)
          setTaskId(result.runId)
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      async function removeRun(item) {
        if (!window.confirm(`${t('action.delete')}「${item.name}」？产物目录也会一起删掉。`)) return
        setError('')
        try {
          await api(`/runs?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
          if (taskId === item.id) {
            setTaskId('')
            setDetail(null)
          }
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      async function openTask(runId) {
        setError('')
        setView('tasks')
        setSubmitting(false)
        setDetailTab('summary')
        setTaskId(runId)
        setDetail({ run: null, log: [], rows: [], report: '', loading: true })
        await loadDetail(runId)
      }

      function openTemplate(template) {
        setError(template.broken || '')
        setNotice('')
        setView('templates')
        setTemplateDraft({
          mode: template.builtin ? 'view' : 'edit',
          readonly: Boolean(template.builtin),
          original: {
            id: template.id,
            name: template.name,
            description: template.description || '',
            stages: stagesFromTemplate(template),
          },
          id: template.id,
          name: template.name,
          description: template.description || '',
          stages: stagesFromTemplate(template),
        })
        setEditingDraft(false)
        setTemplateTab(template.broken ? 'yaml' : 'form')
        setTemplateYaml('')
        if (template.broken) void loadTemplateYaml(template.id)
      }

      /** YAML 页签：已存模板读文件，新建模板让宿主渲染一份预览。 */
      async function loadTemplateYaml(explicitId) {
        const id = explicitId || (templateDraft && templateDraft.id)
        if (!id) return
        setYamlBusy(true)
        try {
          const saved = templates.find((item) => item.id === id && !item.builtin)
          const result = saved
            ? await api(`/templates/raw?id=${encodeURIComponent(id)}`)
            : await api('/templates/preview', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                id,
                name: (templateDraft && templateDraft.name) || id,
                description: (templateDraft && templateDraft.description) || '',
                stages: Object.fromEntries(
                  Object.entries((templateDraft && templateDraft.stages) || {}).map(([key, value]) => [
                    key,
                    { template: value.template, config: value.config },
                  ]),
                ),
              }),
            })
          setTemplateYaml(result.yaml || '')
        } catch (error) {
          setError(String(error && error.message ? error.message : error))
        } finally {
          setYamlBusy(false)
        }
      }

      function saveTemplateYaml() {
        setError('')
        setNotice('')
        if (!String(templateYaml || '').trim()) {
          setError(t('tpl.yamlEmpty'))
          return
        }
        setConfirmDialog({
          kind: 'yaml',
          title: t('confirm.yamlTitle'),
          note: t('confirm.yamlNote'),
          rows: [
            [t('tpl.id'), templateDraft ? templateDraft.id : '-'],
            [t('tpl.yaml'), `${String(templateYaml).split('\n').length} ${t('confirm.lines')}`],
          ],
          payload: { yaml: templateYaml },
        })
      }

      async function saveTemplateYamlConfirmed() {
        const dialog = confirmDialog
        setConfirmDialog(null)
        if (!dialog) return
        setError('')
        setYamlBusy(true)
        try {
          const result = await api('/templates/raw', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(dialog.payload),
          })
          await load()
          const saved = result.template
          if (saved) {
            setTemplateDraft({
              mode: 'edit',
              readonly: false,
              id: saved.id,
              name: saved.name,
              description: saved.description || '',
              stages: stagesFromTemplate(saved),
            })
            setNotice(t('tpl.saved'))
            await loadTemplateYaml(saved.id)
          }
        } catch (error) {
          setError(String(error && error.message ? error.message : error))
        } finally {
          setYamlBusy(false)
        }
      }

      function newTemplate() {
        setError('')
        setNotice('')
        setView('templates')
        setTemplateDraft({
          mode: 'new',
          readonly: false,
          original: null,
          id: `template-${Date.now().toString(36)}`,
          name: '',
          description: '',
          stages: stagesFromTemplate({
            stages: (state.stages || []).map((stage) => ({ id: stage.id, module: stage.presets[0].id })),
          }),
        })
        setEditingDraft(true)
        setTemplateTab('form')
      }

      function copyTemplate(source) {
        setError('')
        setNotice('')
        setView('templates')
        setTemplateDraft({
          mode: 'new',
          readonly: false,
          id: `${source.id}-copy`,
          name: `${source.name} ${t('tpl.copySuffix')}`,
          description: source.description || '',
          stages: stagesFromTemplate(source),
        })
      }

      function updateStages(mapper) {
        setTemplateDraft((current) => {
          if (!current) return current
          return { ...current, stages: mapper(current.stages || []) }
        })
      }

      function setStageAt(index, patch) {
        updateStages((list) => list.map((item, at) => (at === index ? { ...item, ...patch } : item)))
      }

      /** 预置阶段之间不能换位置，跟自定义阶段换可以。 */
      function addCustomStage() {
        const used = new Set((templateDraft.stages || []).map((item) => item.id))
        let index = 1
        while (used.has(`custom-${index}`)) index += 1
        const id = `custom-${index}`
        updateStages((list) => [...list, {
          id,
          kind: 'custom',
          name: `${t('stage.custom')} ${index}`,
          module: 'custom',
          config: { command: '' },
          configText: JSON.stringify({ command: '' }, null, 2),
        }])
      }

      /** 还能加的预置阶段（已删掉的那些）。 */
      function missingPresets() {
        const used = new Set((templateDraft.stages || []).map((item) => item.id))
        return (state.stages || []).filter((stage) => !used.has(stage.id))
      }

      function removeStageAt(index) {
        const stage = (templateDraft.stages || [])[index]
        if (!stage || (templateDraft.stages || []).length <= 1) return
        updateStages((list) => list.filter((item, at) => at !== index))
        setTemplateDraft((current) => {
          if (!current) return current
          const groups = (current.groups || []).map((group) => {
            const overrides = { ...group.overrides }
            delete overrides[stage.id]
            return { ...group, overrides }
          })
          return { ...current, groups }
        })
      }
      function canSwap(index, delta) {
        const list = templateDraft.stages || []
        const a = list[index]
        const b = list[index + delta]
        if (!a || !b) return false
        return !(a.kind === 'preset' && b.kind === 'preset')
      }

      /** 拖到 to 位置后，预置阶段的相对先后是否还成立。 */
      function canMoveTo(from, to) {
        const list = templateDraft.stages || []
        if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false
        const next = [...list]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        const order = next
          .filter((stage) => stage.kind === 'preset')
          .map((stage) => (state.stages || []).findIndex((item) => item.id === stage.id))
        for (let index = 1; index < order.length; index += 1) {
          if (order[index] < order[index - 1]) return false
        }
        return true
      }

      function moveStageTo(from, to) {
        if (!canMoveTo(from, to)) {
          setNotice(t('tpl.orderLocked'))
          return
        }
        updateStages((list) => {
          const next = [...list]
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return next
        })
      }

      function moveStageAt(index, delta) {
        if (!canSwap(index, delta)) return
        updateStages((list) => {
          const next = [...list]
          const target = index + delta
          const tmp = next[index]
          next[index] = next[target]
          next[target] = tmp
          return next
        })
      }

      /** 把某个预置阶段加回模板：插在它该在的位置上。 */
      function addPresetStage(stageId) {
        updateStages((list) => {
          if (list.some((item) => item.id === stageId)) return list
          const def = catalogStage(stageId)
          const preset = def && def.presets[0]
          const entry = {
            id: stageId,
            kind: 'preset',
            name: stageId,
            module: preset ? preset.id : 'custom',
            config: { ...(preset ? preset.config : {}) },
            configText: JSON.stringify(preset ? preset.config : {}, null, 2),
          }
          const rank = (id) => {
            const found = (state.stages || []).findIndex((item) => item.id === id)
            return found < 0 ? 99 : found
          }
          const at = list.findIndex((item) => item.kind === 'preset' && rank(item.id) > rank(stageId))
          if (at < 0) return [...list, entry]
          return [...list.slice(0, at), entry, ...list.slice(at)]
        })
      }
      function applyTemplateToDraft(template) {
        setDraft({ templateId: template.id, name: template.name })
        setSubmitGroups(groupsForTemplate(template))
        setNotice('')
        setError('')
      }

      /** 提交时的分组：Control 用模板默认值起头，Treatment 默认抄一份 Control。 */
      function groupsFromDefaults(template, source) {
        const base = source || stagesFromTemplate(template)
        return {
          id: 'control',
          kind: 'control',
          name: 'Control',
          stages: Object.fromEntries(base.map((stage) => [stage.id, {
            module: stage.module,
            config: { ...(stage.config || {}) },
          }])),
        }
      }

      function groupsForTemplate(template) {
        return [groupsFromDefaults(template)]
      }

      function ensureSubmitGroups() {
        const template = templates.find((item) => item.id === draft.templateId)
        if (!template) return []
        if (!Array.isArray(submitGroups) || submitGroups.length === 0) return [groupsFromDefaults(template)]
        return submitGroups
      }

      function setSubmitGroupAt(index, patchOrUpdater) {
        const list = ensureSubmitGroups()
        setSubmitGroups(list.map((group, at) => {
          if (at !== index) return group
          return typeof patchOrUpdater === 'function' ? patchOrUpdater(group) : { ...group, ...patchOrUpdater }
        }))
      }

      function setSubmitStageConfig(index, stageId, next) {
        setSubmitGroupAt(index, (group) => ({
          ...group,
          stages: { ...group.stages, [stageId]: { ...group.stages[stageId], ...next } },
        }))
      }

      function addSubmitTreatment() {
        const list = ensureSubmitGroups()
        const used = new Set(list.map((group) => group.id))
        let index = 1
        while (used.has(`treatment-${index}`)) index += 1
        const control = list.find((group) => group.kind === 'control') || list[0]
        setSubmitGroups([...list, {
          id: `treatment-${index}`,
          kind: 'treatment',
          name: `${t('tpl.treatment')} ${index}`,
          stages: Object.fromEntries(Object.entries(control.stages).map(([stageId, entry]) => [
            stageId,
            { module: entry.module, config: { ...(entry.config || {}) } },
          ])),
        }])
      }

      function removeSubmitGroupAt(index) {
        setSubmitGroups(ensureSubmitGroups().filter((group, at) => at !== index || group.kind === 'control'))
      }

      /** 提交时每组每阶段的模块与参数；确认框和请求体共用。 */
      function submitGroupPayload(template, groups) {
        return groups.map((group) => ({
          id: group.id,
          kind: group.kind,
          name: group.name,
          stages: Object.fromEntries(Object.entries(group.stages || {}).map(([stageId, entry]) => [
            stageId,
            { module: entry.module, config: { ...(entry.config || {}) } },
          ])),
        }))
      }

      /** 折叠状态按组 id 记，没记过就是展开。 */
      function groupOpen(group) {
        return groupFolded[group.id] !== false
      }

      function setAllGroups(open) {
        const groups = ensureSubmitGroups()
        setGroupFolded(Object.fromEntries(groups.map((group) => [group.id, open])))
      }

      /** 折叠时用一行摘要让你还能看清这组怎么跑。 */
      function groupSummary(group, stages) {
        return stages
          .map((stage) => {
            const entry = group.stages[stage.id] || {}
            return `${stageLabel(stage)}:${entry.module || stage.module}`
          })
          .join(' · ')
      }

      function renderSubmitGroups(template) {
        const groups = ensureSubmitGroups()
        const stages = stagesFromTemplate(template)
        return h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t('tpl.groups')),
            h('div', { className: 'ae-actions', style: { marginLeft: 'auto' } },
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-xs',
                onClick: () => setAllGroups(true),
              }, t('tpl.expandAll')),
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-xs',
                onClick: () => setAllGroups(false),
              }, t('tpl.collapseAll')))),
          h('div', { className: 'ae-card-note' }, t('submit.groupHint')),
          ...groups.map((group, index) => {
            const isControl = group.kind === 'control'
            const open = groupOpen(group)
            const head = h('div', { className: 'ae-card-head' },
              h('button', {
                type: 'button', className: 'ae-fold', 'aria-expanded': String(open),
                onClick: () => setGroupFolded({ ...groupFolded, [group.id]: !open }),
              },
              h('span', { className: 'ae-caret' }, open ? '▾' : '▸'),
              h('span', { className: 'ae-card-title' },
                `${isControl ? t('tpl.control') : t('tpl.treatment')} · ${group.name || group.id}`),
              h('span', {
                className: 'ae-badge', 'data-kind': isControl ? 'builtin' : 'custom',
              }, group.kind),
              h('span', { className: 'ae-fold-hint' }, open ? t('tpl.collapse') : t('tpl.expand'))),
              !isControl
                ? h('button', {
                  type: 'button', className: 'ae-btn ae-btn-xs',
                  onClick: () => removeSubmitGroupAt(index),
                }, t('action.delete'))
                : null)
            if (!open) {
              return h('div', {
                className: 'ae-group-edit', key: `${group.id}-${index}`,
                'data-kind': group.kind, 'data-open': 'false',
              },
              head,
              h('div', { className: 'ae-card-note ae-group-summary' }, groupSummary(group, stages)))
            }
            return h('div', {
              className: 'ae-group-edit', key: `${group.id}-${index}`,
              'data-kind': group.kind, 'data-open': 'true',
            },
            head,
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('tpl.groupName')),
              h('input', {
                className: 'ae-input', type: 'text', value: group.name || '',
                onChange: (event) => setSubmitGroupAt(index, { name: event.target.value }),
              })),
            ...stages.map((stage) => {
              const entry = group.stages[stage.id] || { module: stage.module, config: {} }
              const preset = moduleOf(stage.id, entry.module)
              return h('div', { className: 'ae-override', key: stage.id },
                h('div', { className: 'ae-override-title' }, stageLabel(stage)),
                moduleChips(stage.id, entry.module, false, (moduleId) => {
                  const next = moduleOf(stage.id, moduleId)
                  setSubmitStageConfig(index, stage.id, {
                    module: moduleId,
                    config: { ...(next ? next.config : {}) },
                  })
                }),
                ...((preset && preset.fields) || []).map((field) => renderFieldInput(
                  field,
                  (entry.config || {})[field.key],
                  (value) => setSubmitStageConfig(index, stage.id, {
                    config: { ...(entry.config || {}), [field.key]: value },
                  }),
                  false,
                )))
            }))
          }),
          h('div', { className: 'ae-actions' },
            h('button', { type: 'button', className: 'ae-btn', onClick: addSubmitTreatment }, t('tpl.addTreatment'))))
      }

      async function saveTemplateDraft() {
        const current = templateDraft
        if (!current || current.readonly) return
        const id = String(current.id || '').trim()
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
          setError(t('tpl.badId'))
          return
        }
        const stages = (current.stages || []).map((stage) => ({
          id: stage.id,
          kind: stage.kind,
          ...(stage.kind === 'custom' ? { name: stage.name } : {}),
        }))
        setError('')
        const stageRows = stages.map((stage, index) => {
          const config = Object.keys(stage.config || {}).length > 0 ? JSON.stringify(stage.config) : ''
          const label = stage.kind === 'custom' ? (stage.name || stage.id) : t(`stage.${stage.id}`)
          return `${index + 1}. ${label} · ${stage.module}${config ? ` ${config}` : ''}`
        })
        setConfirmDialog({
          kind: 'template',
          title: t('confirm.templateTitle'),
          note: t('confirm.templateNote'),
          rows: [
            [t('tpl.id'), id],
            [t('tpl.name'), current.name || id],
            [t('tpl.desc'), current.description || '-'],
          ],
          stages: stageRows,
          payload: { id, name: current.name || id, description: current.description || '', stages },
          draft: current,
        })
      }

      async function saveTemplateConfirmed(payload, current) {
        setConfirmDialog(null)
        setError('')
        try {
          await api('/templates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const snapshot = {
            id: payload.id,
            name: payload.name,
            description: payload.description,
            stages: payload.stages.map((stage) => ({ ...stage, config: { ...(stage.config || {}) } })),
          }
          setTemplateDraft({
            ...current,
            mode: 'edit',
            readonly: false,
            stages: stagesFromTemplate(snapshot),
            original: snapshot,
          })
          setEditingDraft(false)
          setNotice(t('label.saved'))
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      function startTemplateEdit() {
        setError('')
        setNotice('')
        setEditingDraft(true)
      }

      /** 没保存就退出编辑：回到打开时的样子。 */
      function cancelTemplateEdit() {
        setError('')
        setNotice('')
        const original = templateDraft && templateDraft.original
        if (original) {
          setTemplateDraft({
            ...templateDraft,
            id: original.id,
            name: original.name,
            description: original.description,
            stages: stagesFromTemplate(original),
          })
        }
        setEditingDraft(false)
        setTemplateYaml('')
      }

      async function deleteTemplate(template) {
        if (!window.confirm(`${t('tpl.confirmDelete')}「${template.name}」？`)) return
        setError('')
        try {
          await api(`/templates?id=${encodeURIComponent(template.id)}`, { method: 'DELETE' })
          setTemplateDraft(null)
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      // ---- 首屏 ----
      if (!state || !draft) {
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          h('div', { className: 'ae-empty' }, 'AutoEval …'))
      }

      const messages = h('div', null,
        error ? h('div', { className: 'ae-error' }, error) : null,
        notice ? h('div', { className: 'ae-notice' }, notice) : null)

      const head = h('div', { className: 'ae-head' },
        h('div', null,
          h('h1', { className: 'ae-title' }, t('panel.title')),
          h('p', { className: 'ae-sub' }, t('panel.subtitle'))),
        h('div', { className: 'ae-pill', 'data-state': statusState(status) },
          h('i', { className: 'ae-dot' }),
          status === 'running' ? t('label.running') : status === 'done' ? t('label.done')
            : status === 'failed' ? t('label.failed') : t('label.idle')))

      const tabs = h('div', { className: 'ae-tabs' },
        ...['tasks', 'querysets', 'templates'].map((key) => h('button', {
          key, type: 'button', className: 'ae-tab', 'data-active': String(view === key),
          onClick: () => {
            setView(key)
            setSubmitting(false)
            setTaskId('')
            setDetail(null)
            setTemplateDraft(null)
            setQsDraft(null)
            setImporter(null)
            setError('')
            setNotice('')
          },
        }, t(`tab.${key}`))))
      function stageLabel(stage) {
        return stage.kind === 'custom' ? (stage.name || stage.id) : t(`stage.${stage.id}`)
      }


      function moduleLabel(stageId, moduleId) {
        if (!catalogStage(stageId)) return t('tpl.customModule')
        const key = `preset.${stageId}.${moduleId}`
        const label = t(key)
        return label === key ? moduleId : label
      }


      function moduleChips(stageId, moduleId, disabled, onPick) {
        return h('div', { className: 'ae-chips' },
          ...moduleList(stageId).map((preset) => h('button', {
            key: preset.id,
            type: 'button',
            className: 'ae-chip',
            disabled,
            'data-active': String(moduleId === preset.id),
            onClick: () => { if (!disabled) onPick(preset.id) },
          }, moduleLabel(stageId, preset.id))))
      }
      function renderStageRow(stage, index, editing) {
        const body = []
        const dragging = dragStage === index
        const dropping = dragOverStage === index && dragStage >= 0 && dragStage !== index
        return h('div', {
          className: 'ae-stage-edit',
          key: `${stage.id}-${index}`,
          draggable: editing,
          'data-dragging': String(dragging),
          'data-dropping': String(dropping),
          onDragStart: (event) => {
            if (!editing) return
            setDragStage(index)
            if (event && event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', stage.id)
            }
          },
          onDragOver: (event) => {
            if (!editing || dragStage < 0) return
            if (event && event.preventDefault) event.preventDefault()
            if (dragOverStage !== index) setDragOverStage(index)
          },
          onDragLeave: () => {
            if (dragOverStage === index) setDragOverStage(-1)
          },
          onDrop: (event) => {
            if (!editing) return
            if (event && event.preventDefault) event.preventDefault()
            const from = dragStage
            setDragStage(-1)
            setDragOverStage(-1)
            if (from >= 0) moveStageTo(from, index)
          },
          onDragEnd: () => {
            setDragStage(-1)
            setDragOverStage(-1)
          },
        },
          h('div', { className: 'ae-card-head' },
            editing
              ? h('span', { className: 'ae-drag', title: t('tpl.dragHint'), 'aria-hidden': 'true' }, '⠿')
              : null,
            h('div', { className: 'ae-card-title' }, `${index + 1}. ${stageLabel(stage)}`),
            h('span', {
              className: 'ae-badge',
              'data-kind': stage.kind === 'preset' ? 'builtin' : 'custom',
            }, stage.kind === 'preset' ? t('tpl.presetStage') : t('tpl.customStage')),
            editing
              ? h('div', { className: 'ae-row-actions' },
                h('button', {
                  type: 'button', className: 'ae-btn ae-btn-xs',
                  title: t('action.moveUp'), disabled: !canSwap(index, -1),
                  onClick: () => moveStageAt(index, -1),
                }, '↑'),
                h('button', {
                  type: 'button', className: 'ae-btn ae-btn-xs',
                  title: t('action.moveDown'), disabled: !canSwap(index, 1),
                  onClick: () => moveStageAt(index, 1),
                }, '↓'),
                h('button', {
                  type: 'button', className: 'ae-btn ae-btn-xs',
                  disabled: (templateDraft.stages || []).length <= 1,
                  onClick: () => removeStageAt(index),
                }, t('action.delete')))
              : null),
          editing && stage.kind === 'custom'
            ? h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('tpl.stageName')),
              h('input', {
                className: 'ae-input', type: 'text', value: stage.name || '',
                onChange: (event) => setStageAt(index, { name: event.target.value }),
              }))
            : null,
          ...body)
      }
      function renderConfirm() {
        const dialog = confirmDialog
        if (!dialog) return null
        return h('div', { className: 'ae-modal-mask' },
          h('div', { className: 'ae-modal' },
            h('div', { className: 'ae-modal-title' }, dialog.title),
            h('div', { className: 'ae-modal-body' },
              ...(dialog.rows || []).map(([label, value], index) => h('div', {
                className: 'ae-detail-row', key: `confirm-row-${index}`,
              },
              h('span', { className: 'ae-detail-key' }, label),
              h('span', { className: 'ae-mono' }, value))),
              ...(dialog.stages || []).map((line, index) => h('div', {
                className: 'ae-card-note', key: `confirm-stage-${index}`,
              }, line))),
            dialog.note ? h('div', { className: 'ae-card-note' }, dialog.note) : null,
            h('div', { className: 'ae-actions' },
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary',
                onClick: () => { confirmNow() },
              }, t('confirm.ok')),
              h('button', {
                type: 'button', className: 'ae-btn',
                onClick: () => setConfirmDialog(null),
              }, t('action.cancel')))))
      }

      function confirmNow() {
        const dialog = confirmDialog
        if (!dialog) return
        if (dialog.kind === 'run') {
          void runConfirmed(dialog.payload)
          return
        }
        if (dialog.kind === 'template') {
          void saveTemplateConfirmed(dialog.payload, dialog.draft)
          return
        }
        if (dialog.kind === 'yaml') {
          void saveTemplateYamlConfirmed()
          return
        }
        if (dialog.kind === 'queryset') {
          void saveQuerysetConfirmed(dialog.payload)
        }
      }

      // ---------------------------------------------------------- 工作区
      function formatBytes(bytes) {
        const size = Number(bytes) || 0
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
        return `${(size / 1024 / 1024).toFixed(1)} MB`
      }

      async function copyWorkspacePath(dir) {
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(dir)
            setNotice(t('ws.copied'))
            return
          }
        } catch {
          // 落到下面的降级
        }
        setNotice(`${t('ws.copyManual')}${dir}`)
      }

      async function openWorkspace() {
        setError('')
        try {
          const result = await api('/workspace/open', { method: 'POST' })
          setNotice(`${t('ws.opened')}${result.dir || ''}`)
        } catch (error) {
          setError(String(error && error.message ? error.message : error))
        }
      }

      function startWorkspaceEdit() {
        const config = (state.workspace && state.workspace.config) || {}
        setWorkspaceDraft({
          maxRuns: config.maxRuns,
          defaultTemplate: config.defaultTemplate,
          commandTimeoutMs: config.commandTimeoutMs,
        })
        setWorkspaceEditing(true)
        setError('')
        setNotice('')
      }

      async function saveWorkspaceConfig() {
        setBusy(true)
        setError('')
        try {
          await api('/workspace/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(workspaceDraft || {}),
          })
          await load()
          setWorkspaceEditing(false)
          setNotice(t('ws.saved'))
        } catch (error) {
          setError(String(error && error.message ? error.message : error))
        } finally {
          setBusy(false)
        }
      }

      /** 工作区：路径、模板/运行计数、占用，以及一份工作区级配置。 */
      function renderWorkspace() {
        const workspace = state.workspace
        if (!workspace) return null
        const fields = workspace.fields || []
        const config = workspaceDraft || workspace.config || {}
        return h('div', { className: 'ae-workspace' },
          h('div', { className: 'ae-workspace-head' },
            h('span', { className: 'ae-workspace-label' }, t('ws.title')),
            h('span', { className: 'ae-mono ae-workspace-path', title: workspace.dir }, workspace.dir),
            h('button', {
              type: 'button', className: 'ae-link',
              onClick: () => { void copyWorkspacePath(workspace.dir) },
            }, t('ws.copy')),
            h('button', {
              type: 'button', className: 'ae-link',
              onClick: () => { void openWorkspace() },
            }, t('ws.open')),
            workspaceEditing
              ? null
              : h('button', { type: 'button', className: 'ae-link', onClick: startWorkspaceEdit }, t('ws.config')),
            h('span', { className: 'ae-toolbar-count' },
              `${t('ws.templates')} ${workspace.templates} · ${t('ws.runs')} ${workspace.runs} · ${formatBytes(workspace.bytes)}`)),
          workspace.broken
            ? h('div', { className: 'ae-error' }, workspace.broken)
            : null,
          workspaceEditing
            ? h('div', { className: 'ae-workspace-body' },
              ...fields.map((field) => renderFieldInput(
                field,
                config[field.key],
                (next) => setWorkspaceDraft({ ...(workspaceDraft || {}), [field.key]: next }),
                busy,
              )),
              h('div', { className: 'ae-actions' },
                h('button', {
                  type: 'button', className: 'ae-btn ae-btn-primary', disabled: busy,
                  onClick: () => { void saveWorkspaceConfig() },
                }, t('action.save')),
                h('button', {
                  type: 'button', className: 'ae-btn',
                  onClick: () => { setWorkspaceEditing(false); setWorkspaceDraft(null) },
                }, t('action.cancel'))))
            : null)
      }

      function renderTaskList() {
        const query = taskQuery.trim().toLowerCase()
        const filtered = runs.filter((item) => {
          if (taskStatus !== 'all' && item.status !== taskStatus) return false
          if (!query) return true
          return `${item.name} ${item.id} ${item.templateId || ''}`.toLowerCase().includes(query)
        })
        const statuses = ['all', 'running', 'done', 'failed', 'cancelled']
        const rows = filtered.map((item) => h('tr', { key: item.id },
          h('td', null, h('button', {
            type: 'button', className: 'ae-row-toggle',
            onClick: () => { void openTask(item.id) },
          }, item.name)),
          h('td', null, item.templateId || '-'),
          h('td', null, h('span', { className: 'ae-state', 'data-state': statusState(item.status) }, t(`label.${item.status}`))),
          h('td', null, item.metrics ? pct(item.metrics.passRate) : '-'),
          h('td', null, item.metrics ? `${item.metrics.passed}/${item.metrics.scored}` : '-'),
          h('td', null, String(item.caseCount == null ? '-' : item.caseCount)),
          h('td', null, duration(item.durationMs)),
          h('td', null, (item.startedAt || '').replace('T', ' ').slice(0, 19)),
          h('td', null, h('div', { className: 'ae-row-actions' },
            h('button', {
              type: 'button', className: 'ae-link', disabled: Boolean(active),
              onClick: () => { void rerun(item.id) },
            }, t('action.rerun')),
            item.status === 'running'
              ? h('button', { type: 'button', className: 'ae-link', onClick: () => { void cancel() } }, t('action.cancelTask'))
              : h('button', {
                type: 'button', className: 'ae-link ae-danger',
                onClick: () => { void removeRun(item) },
              }, t('action.delete'))))))

        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-toolbar' },
              h('input', {
                className: 'ae-input ae-search', type: 'search', spellCheck: false,
                placeholder: t('tasks.search'), value: taskQuery,
                onChange: (event) => setTaskQuery(event.target.value),
              }),
              h('select', {
                className: 'ae-select', value: taskStatus,
                onChange: (event) => setTaskStatus(event.target.value),
              }, ...statuses.map((key) => h('option', { key, value: key },
                key === 'all' ? t('tasks.allStatus') : t(`label.${key}`)))),
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary', disabled: Boolean(active),
                onClick: () => {
                  setSubmitting(true)
                  setSubmitGroups(groupsForTemplate(templates.find((item) => item.id === draft.templateId) || templates[0] || { stages: [] }))
                  setError('')
                  setNotice('')
                },
              }, t('action.submit')),
              h('span', { className: 'ae-toolbar-count' }, `${filtered.length} / ${runs.length} ${t('label.tasks')}`)),
            runs.length === 0
              ? h('div', { className: 'ae-empty' }, t('tasks.noRuns'))
              : filtered.length === 0
                ? h('div', { className: 'ae-empty' }, t('tasks.empty'))
                : h('table', { className: 'ae-table' },
                  h('thead', null, h('tr', null,
                    ...['tasks.name', 'tasks.template', 'tasks.status', 'tasks.passRate', 'tasks.passed',
                      'tasks.cases', 'tasks.duration', 'tasks.startedAt', '']
                      .map((key, index) => h('th', { key: index }, key ? t(key) : '')))),
                  h('tbody', null, ...rows))))
      }

      // ---------------------------------------------------------- 任务详情
      function renderMetrics(metrics) {
        if (!metrics) return h('div', { className: 'ae-empty' }, '-')
        const tiles = [
          [t('label.total'), String(metrics.total)],
          [t('label.scored'), String(metrics.scored)],
          [t('label.passed'), String(metrics.passed)],
          [t('label.passRate'), pct(metrics.passRate)],
          [t('label.avgCoverage'), pct(metrics.avgCoverage)],
          [t('label.scrapeErrors'), String(metrics.scrapeErrors)],
          [t('label.p50'), metrics.latency ? duration(metrics.latency.p50Ms) : '-'],
          [t('label.p95'), metrics.latency ? duration(metrics.latency.p95Ms) : '-'],
        ]
        return h('div', { className: 'ae-metrics' },
          ...tiles.map(([key, value]) => h('div', { className: 'ae-metric', key },
            h('div', { className: 'ae-metric-k' }, key),
            h('div', { className: 'ae-metric-v' }, value))))
      }

      // 阶段摘要里每个字段的显示名：没登记过的直接用字段名
      const SUMMARY_KEYS = {
        cases: 'detail.sum.cases',
        material: 'detail.sum.material',
        sources: 'detail.sum.sources',
        errors: 'detail.sum.errors',
        scored: 'detail.sum.scored',
        passed: 'detail.sum.passed',
        total: 'detail.sum.total',
        passRate: 'detail.sum.passRate',
        avgCoverage: 'detail.sum.avgCoverage',
        scrapeErrors: 'detail.sum.scrapeErrors',
        format: 'detail.sum.format',
        chars: 'detail.sum.chars',
        rows: 'detail.sum.rows',
        groups: 'detail.sum.groups',
        count: 'detail.sum.count',
        avgMs: 'detail.sum.avgMs',
        p50Ms: 'detail.sum.p50Ms',
        p95Ms: 'detail.sum.p95Ms',
      }

      function summaryPairs(summary) {
        if (!summary || typeof summary !== 'object') return []
        const out = []
        for (const [key, value] of Object.entries(summary)) {
          if (value == null) continue
          // 老运行记录里可能还带着 stages 快照，列表里不展示
          if (key === 'stages') continue
          const label = SUMMARY_KEYS[key] ? t(SUMMARY_KEYS[key]) : key
          if (key === 'latency' && typeof value === 'object') {
            out.push([t('detail.sum.p50Ms'), duration(value.p50Ms)])
            out.push([t('detail.sum.p95Ms'), duration(value.p95Ms)])
            continue
          }
          if (typeof value === 'object') {
            out.push([`${label}`, JSON.stringify(value).slice(0, 160)])
            continue
          }
          const text = key === 'passRate' || key === 'avgCoverage' ? pct(value) : String(value)
          out.push([label, text])
        }
        return out
      }

      // 各阶段的可折叠列表：表头给状态与耗时，展开看模板、参数、摘要、该阶段日志
      function groupStages(run) {
        const groups = Array.isArray(run.groups) ? run.groups : []
        if (groups.length === 0) return run.stages || {}
        const picked = groups.find((item) => item.id === stageGroup)
        return (picked && picked.stages) || groups[0].stages || {}
      }

      function renderGroupTabs(run) {
        const groups = Array.isArray(run.groups) ? run.groups : []
        if (groups.length <= 1) return null
        return h('div', { className: 'ae-chips', style: { marginBottom: '8px' } },
          ...groups.map((group) => h('button', {
            key: group.id, type: 'button', className: 'ae-chip',
            'data-active': String(group.id === stageGroup),
            onClick: () => setStageGroup(group.id),
          }, `${group.name}（${group.kind}）`)))
      }

      function renderComparison(run) {
        const comparison = run.comparison
        if (!comparison || !Array.isArray(comparison.rows) || comparison.rows.length === 0) return null
        return h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-title' }, t('run.comparison')),
          h('table', { className: 'ae-table' },
            h('thead', null, h('tr', null,
              h('th', null, t('run.metric')),
              h('th', null, comparison.control.name),
              ...comparison.treatments.map((item) => h('th', { key: item.id }, item.name)))),
            h('tbody', null, ...comparison.rows.map((row) => h('tr', { key: row.key },
              h('td', null, row.label),
              h('td', null, row.control),
              ...row.treatments.map((item, index) => h('td', { key: `${row.key}-${index}` }, item.text)))))))
      }

      function renderStages(run, log) {
        const stages = groupStages(run)
        return h('div', { className: 'ae-acc' },
          ...Object.entries(stages || {}).map(([key, value]) => {
            const stageRunning = value.status === 'running'
            const open = openStages[key] === undefined
              ? (stageRunning || value.status === 'failed')
              : openStages[key]
            const stageLog = (log || []).filter((line) => line.stage === key)
            const progress = stageRunning && active && active.progress && active.progress.stage === key
              ? active.progress
              : null
            const pairs = summaryPairs(value.summary)
            return h('div', {
              key, className: 'ae-acc-item', 'data-status': value.status, 'data-open': String(open),
            },
            h('button', {
              type: 'button', className: 'ae-acc-head',
              'aria-expanded': String(open),
              onClick: () => setOpenStages({ ...openStages, [key]: !open }),
            },
            h('span', { className: 'ae-caret' }, open ? '▾' : '▸'),
            h('span', { className: 'ae-acc-title' }, value.name && value.kind === 'custom'
              ? value.name
              : t(`stage.${key}`)),
            h('span', {
              className: 'ae-state', 'data-state': statusState(value.status),
            }, t(`label.${value.status}`)),
            progress ? h('span', { className: 'ae-card-note' }, `${progress.done}/${progress.total}`) : null,
            h('span', { className: 'ae-acc-meta' }, value.durationMs == null ? '' : duration(value.durationMs))),
            progress
              ? h('div', { className: 'ae-progress', style: { margin: '0 12px 8px' } },
                h('i', { style: { width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` } }))
              : null,
            open
              ? h('div', { className: 'ae-acc-body' },
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('field.template')),
                  h('span', null, value.template || '-')),
                value.config && Object.keys(value.config).length > 0
                  ? h('div', { className: 'ae-detail-row' },
                    h('span', { className: 'ae-detail-key' }, t('field.params')),
                    h('span', { className: 'ae-mono' }, JSON.stringify(value.config)))
                  : null,
                ...pairs.map(([label, text], index) => h('div', {
                  className: 'ae-detail-row', key: `${key}-sum-${index}`,
                },
                h('span', { className: 'ae-detail-key' }, label),
                h('span', { className: 'ae-mono' }, text))),
                value.error ? h('div', { className: 'ae-error' }, value.error) : null,
                stageLog.length > 0
                  ? h('pre', { className: 'ae-log' },
                    stageLog.map((line) => `${String(line.at || '').slice(11, 19)}  ${line.message}`).join('\n'))
                  : h('div', { className: 'ae-card-note' }, t('detail.noLog')))
              : null)
          }))
      }

      function renderTaskDetail() {
        const run = polled
        const log = (detail && detail.log) || []
        const rows = (detail && detail.rows) || []
        if (!run) {
          return h('div', { className: 'ae-page' },
            h('style', null, STYLE),
            head, renderWorkspace(), tabs, messages, renderConfirm(),
            h('button', {
              type: 'button', className: 'ae-back',
              onClick: () => { setTaskId(''); setDetail(null) },
            }, `← ${t('action.back')}`),
            h('div', { className: 'ae-card' },
              h('div', { className: 'ae-empty' }, (detail && detail.error) ? detail.error : t('detail.loading'))))
        }
        const running = run.status === 'running'

        const summary = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t('label.passRate')),
            running && active && active.progress
              ? h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } },
                `${t('submit.progress')} · ${active.progress.stage || '-'} ${active.progress.done}/${active.progress.total}`)
              : null),
          renderMetrics(run.metrics),
          h('div', { className: 'ae-card-title', style: { marginTop: '4px' } }, t('detail.stages')),
          renderGroupTabs(run),
          renderStages(run, log),
          run.artifacts && run.artifacts.dir
            ? h('div', { className: 'ae-detail-row' },
              h('span', { className: 'ae-detail-key' }, t('detail.artifacts')),
              h('span', { className: 'ae-mono' }, run.artifacts.dir))
            : null,
          h('div', { className: 'ae-label' }, t('detail.log')),
          h('pre', { className: 'ae-log' },
            log.length === 0 ? '-'
              : log.map((line) => `${String(line.at || '').slice(11, 19)}  ${line.stage || '-'}  ${line.message}`).join('\n')))

        const comparisonCard = renderComparison(run)

        const rowTable = rows.length === 0
          ? h('div', { className: 'ae-empty' }, t('detail.noRows'))
          : h('table', { className: 'ae-table' },
            h('thead', null, h('tr', null,
              ...['detail.rowQuery', 'detail.rowScore', 'detail.rowCoverage', 'detail.rowMissed',
                'detail.rowSources', 'detail.rowLatency']
                .map((key, index) => h('th', { key: index }, t(key))))),
            h('tbody', null, ...rows.map((row) => h('tr', { key: row.id || row.query },
              h('td', null,
                h('div', null, row.query || '-'),
                h('div', { className: 'ae-card-note' }, `${row.id || '?'}${row.bucket ? ` · ${row.bucket}` : ''}`),
                row.material
                  ? h('details', null,
                    h('summary', { className: 'ae-card-note' }, t('detail.rowMaterial')),
                    h('pre', { className: 'ae-log' }, String(row.material).slice(0, 4000)))
                  : null),
              h('td', null, row.error
                ? h('span', { className: 'ae-state', 'data-state': 'failed' }, 'error')
                : String(row.score == null ? '-' : row.score)),
              h('td', null, row.coverage == null ? '-' : pct(row.coverage)),
              h('td', null, (row.missed && row.missed.length) ? row.missed.join('、') : '-'),
              h('td', null, String((row.sources || []).length)),
              h('td', null, duration(row.latencyMs))))))

        const body = detailTab === 'summary' ? summary
          : detailTab === 'rows' ? h('div', { className: 'ae-card' }, rowTable)
            : h('div', { className: 'ae-card' },
              (detail && detail.report)
                ? h('pre', { className: 'ae-pre' }, detail.report)
                : h('div', { className: 'ae-empty' }, t('detail.noReport')))

        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(),
          h('button', {
            type: 'button', className: 'ae-back',
            onClick: () => { setTaskId(''); setDetail(null) },
          }, `← ${t('action.back')}`),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', null,
                h('div', { className: 'ae-card-title' }, run.name),
                h('div', { className: 'ae-card-note' },
                  `${run.id} · ${run.templateId || '-'} · ${(run.startedAt || '').replace('T', ' ').slice(0, 19)} · ${duration(run.durationMs)}`)),
              h('div', { className: 'ae-actions', style: { marginLeft: 'auto' } },
                running
                  ? h('button', { type: 'button', className: 'ae-btn', onClick: () => { void cancel() } }, t('action.cancelTask'))
                  : h('button', {
                    type: 'button', className: 'ae-btn', disabled: Boolean(active),
                    onClick: () => { void rerun(run.id) },
                  }, t('action.rerun')),
                h('button', {
                  type: 'button', className: 'ae-btn ae-danger',
                  onClick: () => { void removeRun(run) },
                }, t('action.delete')))),
            h('div', { className: 'ae-subtabs' },
              ...['summary', 'rows', 'report'].map((key) => h('button', {
                key, type: 'button', className: 'ae-subtab', 'data-active': String(detailTab === key),
                onClick: () => setDetailTab(key),
              }, t(`detail.${key}`)))),
            body,
            detailTab === 'summary' ? comparisonCard : null))
      }

      // ---------------------------------------------------------- 提交任务
      const pickerMatches = (item) => {
        const query = pickerQuery.trim().toLowerCase()
        if (!query) return true
        return [item.id, item.name, item.detail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      }

      /** 通用下拉：按钮 + 搜索框 + 列表，模板和 Queryset共用。 */
      function renderPicker(key, options) {
        const open = pickerKey === key
        const items = options.items || []
        const selected = items.find((item) => item.id === options.selectedId)
        const matched = items.filter(pickerMatches)
        return h('div', { className: 'ae-select', 'data-open': String(open) },
          h('button', {
            type: 'button', className: 'ae-select-button',
            'aria-expanded': String(open),
            onClick: () => {
              setPickerKey(open ? '' : key)
              if (open) setPickerQuery('')
            },
          },
          h('span', { className: 'ae-select-value' },
            selected ? `${selected.name}（${selected.id}）` : options.placeholder),
          h('span', { className: 'ae-caret' }, open ? '▴' : '▾')),
          open
            ? h('div', { className: 'ae-select-menu' },
              h('input', {
                className: 'ae-input ae-select-search', type: 'search', spellCheck: false,
                placeholder: options.searchPlaceholder, value: pickerQuery,
                onChange: (event) => setPickerQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    setPickerKey('')
                    setPickerQuery('')
                  }
                },
              }),
              matched.length === 0
                ? h('div', { className: 'ae-select-empty' }, options.emptyText)
                : h('div', { className: 'ae-select-list' },
                  ...matched.map((item) => h('button', {
                    key: item.id, type: 'button', className: 'ae-select-item',
                    'data-active': String(item.id === options.selectedId),
                    onClick: () => {
                      options.onPick(item)
                      setPickerKey('')
                      setPickerQuery('')
                    },
                  },
                  h('span', { className: 'ae-select-name' }, item.name),
                  h('span', { className: 'ae-select-id ae-mono' }, item.detail || item.id),
                  item.badge
                    ? h('span', { className: 'ae-badge', 'data-kind': 'builtin' }, item.badge)
                    : null))))
            : null)
      }

      function renderTemplatePicker() {
        return renderPicker('template', {
          items: templates.map((template) => ({
            id: template.id,
            name: template.name,
            detail: template.id,
            badge: template.builtin ? t('tpl.builtin') : '',
          })),
          selectedId: draft.templateId,
          placeholder: t('submit.pickTemplate'),
          searchPlaceholder: t('submit.searchTemplate'),
          emptyText: t('submit.noMatch'),
          onPick: (item) => {
            const template = templates.find((entry) => entry.id === item.id)
            if (template) applyTemplateToDraft(template)
          },
        })
      }

      function renderSubmit() {
        const progress = active && active.progress
        const selected = templates.find((item) => item.id === draft.templateId)
        const templateStages = selected ? stagesFromTemplate(selected) : []
        const preview = selected
          ? h('div', null,
            h('div', { className: 'ae-card-note' }, t('submit.orderOnly')),
            ...templateStages.map((stage, index) => h('div', { className: 'ae-detail-row', key: stage.id },
              h('span', { className: 'ae-detail-key' }, `${index + 1}. ${stageLabel(stage)}`),
              h('span', { className: 'ae-mono' }, stage.kind === 'custom' ? t('tpl.customStage') : t('tpl.presetStage')))))
          : null
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(),
          h('button', { type: 'button', className: 'ae-back', onClick: () => setSubmitting(false) },
            `← ${t('action.back')}`),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-title' }, t('submit.title')),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('submit.name')),
              h('input', {
                className: 'ae-input', type: 'text', value: draft.name,
                onChange: (event) => setDraft({ ...draft, name: event.target.value }),
              })),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('submit.template')),
              renderTemplatePicker(),
              h('div', { className: 'ae-card-note' }, t('submit.templateHint'))),
            h('div', { className: 'ae-label', style: { marginTop: '4px' } }, t('tpl.config')),
            preview || h('div', { className: 'ae-empty' }, t('submit.pickTemplate'))),
          selected ? renderSubmitGroups(selected) : null,
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, t('submit.cases')),
              h('div', { className: 'ae-card-note' }, t('submit.casesHint'))),
            h('div', { className: 'ae-chips' },
              h('button', {
                type: 'button', className: 'ae-chip', 'data-active': String(casesSource === 'text'),
                onClick: () => setCasesSource('text'),
              }, t('submit.sourceText')),
              h('button', {
                type: 'button', className: 'ae-chip', 'data-active': String(casesSource === 'queryset'),
                onClick: () => setCasesSource('queryset'),
              }, t('submit.sourceQueryset'))),
            casesSource === 'text'
              ? h('textarea', {
                className: 'ae-textarea', rows: 12, spellCheck: false, value: casesText,
                onChange: (event) => setCasesText(event.target.value),
              })
              : h('div', null,
                renderPicker('queryset', {
                  items: querysets.map((item) => ({
                    id: item.id,
                    name: item.name,
                    detail: `${item.count} ${t('qs.cases')}`,
                    badge: '',
                  })),
                  selectedId: casesQuerysetId,
                  placeholder: t('submit.pickQueryset'),
                  searchPlaceholder: t('submit.searchQueryset'),
                  emptyText: t('submit.noQueryset'),
                  onPick: (item) => setCasesQuerysetId(item.id),
                }),
                casesQuerysetId
                  ? h('div', { className: 'ae-card-note' },
                    `${querysets.find((item) => item.id === casesQuerysetId)?.count || 0} ${t('qs.cases')}`)
                  : null)),
          progress
            ? h('div', { className: 'ae-card' },
              h('div', { className: 'ae-progress' },
                h('i', { style: { width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` } })),
              h('div', { className: 'ae-card-note' },
                `${t('submit.progress')} · ${progress.stage || '-'} ${progress.done}/${progress.total}`))
            : null,
          h('div', { className: 'ae-actions' },
            h('button', {
              type: 'button', className: 'ae-btn ae-btn-primary',
              disabled: busy || Boolean(active) || !selected,
              onClick: () => { void submit() },
            }, t('action.run'))))
      }

      // ---------------------------------------------------------- 模板列表
      function renderTemplateList() {
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(),
          h('div', { className: 'ae-toolbar' },
            h('button', { type: 'button', className: 'ae-btn ae-btn-primary', onClick: () => newTemplate() }, t('action.newTemplate')),
            h('span', { className: 'ae-toolbar-count' },
              `${templates.filter((item) => !item.builtin).length} / ${templates.length} ${t('label.templates')}`)),
          templates.length === 0
            ? h('div', { className: 'ae-empty' }, t('tpl.empty'))
            : h('div', { className: 'ae-template-grid' },
              ...templates.map((template) => h('div', {
                key: template.id, className: 'ae-template-card', role: 'button', tabIndex: 0,
                onClick: () => openTemplate(template),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') openTemplate(template)
                },
              },
              h('div', { className: 'ae-template-name' }, template.name,
                template.broken
                  ? h('span', { className: 'ae-badge', 'data-kind': 'broken' }, t('tpl.broken'))
                  : null,
                h('span', {
                  className: 'ae-badge',
                  'data-kind': template.builtin ? 'builtin' : 'custom',
                }, template.builtin ? t('tpl.builtin') : t('tpl.custom'))),
              h('div', { className: 'ae-card-note' }, template.description || template.id),
              h('div', { className: 'ae-card-note' },
                Object.entries(template.stages || {}).map(([key, value]) => `${key}: ${value.template}`).join(' · '))))))
      }

      // ---------------------------------------------------------- 模板详情
      // 按 schema 生成一个字段的控件：类型、范围、枚举都来自宿主给的 fields
      function renderFieldInput(field, value, onPatch, disabled) {
        const current = value === undefined || value === null ? field.default : value
        const label = h('label', { className: 'ae-label' },
          `${field.label || field.key}${field.unit ? `（${field.unit}）` : ''}`)
        const note = field.hint ? h('div', { className: 'ae-card-note' }, field.hint) : null

        if (field.type === 'number') {
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('input', {
              className: 'ae-input', type: 'number', disabled,
              min: field.min, max: field.max, step: field.step,
              value: current === undefined || current === null ? '' : String(current),
              onChange: (event) => onPatch(event.target.value === '' ? null : Number(event.target.value)),
            }),
            field.min != null && field.max != null
              ? h('div', { className: 'ae-card-note' }, `范围 ${field.min} ~ ${field.max}`)
              : null,
            note)
        }
        if (field.type === 'boolean') {
          return h('div', { className: 'ae-field', key: field.key },
            h('label', { className: 'ae-label' },
              h('input', {
                type: 'checkbox', disabled, checked: Boolean(current),
                onChange: (event) => onPatch(event.target.checked),
              }),
              ` ${field.label || field.key}`),
            note)
        }
        if (field.type === 'list') {
          const list = Array.isArray(current) ? current : []
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('div', { className: 'ae-chips' },
              ...(field.options || []).map((option) => h('button', {
                key: option.value, type: 'button', className: 'ae-chip', disabled,
                'data-active': String(list.includes(option.value)),
                onClick: () => onPatch(list.includes(option.value)
                  ? list.filter((item) => item !== option.value)
                  : [...list, option.value]),
              }, option.label || option.value))),
            note)
        }
        if (field.type === 'command') {
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('input', {
              className: 'ae-input ae-mono', type: 'text', spellCheck: false, disabled,
              placeholder: 'python3 ./my-judge.py', value: current || '',
              onChange: (event) => onPatch(event.target.value),
            }),
            note)
        }
        return h('div', { className: 'ae-field', key: field.key },
          label,
          h('input', {
            className: 'ae-input', type: 'text', spellCheck: false, disabled,
            value: current === undefined || current === null ? '' : String(current),
            onChange: (event) => onPatch(event.target.value),
          }),
          note)
      }

      /** 只读展示：字段值排成行，跟编辑态共用同一份数据。 */
      function renderStageReadonly(stage, entry) {
        const preset = moduleOf(stage.id, entry.module)
        const fields = (preset && preset.fields) || []
        return h('div', { className: 'ae-stage-edit', key: stage.id },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, stageLabel(entry)),
            h('div', { className: 'ae-card-note' }, entry.module || '-')),
          fields.length === 0
            ? h('div', { className: 'ae-card-note' }, t('tpl.noParams'))
            : h('div', null, ...fields.map((field) => {
              const value = entry.config && entry.config[field.key] !== undefined
                ? entry.config[field.key]
                : field.default
              const shown = Array.isArray(value) ? value.join(', ') : String(value === undefined ? '-' : value)
              return h('div', { className: 'ae-detail-row', key: field.key },
                h('span', { className: 'ae-detail-key' }, field.label || field.key),
                h('span', { className: 'ae-mono' }, shown))
            })))
      }

      function renderTemplateDetail() {
        const current = templateDraft
        const readonly = current.readonly
        const editing = editingDraft && !readonly
        const subtabs = h('div', { className: 'ae-subtabs' },
          ...['form', 'yaml'].map((tab) => h('button', {
            key: tab, type: 'button', className: 'ae-subtab',
            'data-active': String(templateTab === tab),
            onClick: () => {
              setTemplateTab(tab)
              if (tab === 'yaml' && !templateYaml) void loadTemplateYaml()
            },
          }, t(`tpl.tab.${tab}`))))

        const stageList = current.stages || []
        const formView = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-title' }, t('tpl.config')),
          h('div', { className: 'ae-card-note' }, t('tpl.stageOrderHint')),
          h('div', { className: 'ae-card-note' }, t('tpl.defaultsHint')),
          ...stageList.map((stage, index) => renderStageRow(stage, index, false)))

        const formEdit = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-title' }, t('tpl.config')),
          h('div', { className: 'ae-card-note' }, t('tpl.stageOrderHint')),
          ...stageList.map((stage, index) => renderStageRow(stage, index, editing)),
          editing
            ? h('div', { className: 'ae-actions', style: { flexWrap: 'wrap' } },
              h('span', { className: 'ae-label' }, `${t('tpl.addStage')}：`),
              ...missingPresets().map((stage) => h('button', {
                key: `add-${stage.id}`, type: 'button', className: 'ae-btn',
                onClick: () => addPresetStage(stage.id),
              }, `+ ${t(`stage.${stage.id}`)}`)),
              h('button', { type: 'button', className: 'ae-btn', onClick: addCustomStage }, `+ ${t('stage.custom')}`))
            : null,
          )

        const yamlPane = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t('tpl.yaml')),
            h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('tpl.yamlHint'))),
          h('textarea', {
            className: 'ae-textarea ae-mono', rows: 26, spellCheck: false,
            disabled: readonly || !editing || yamlBusy,
            value: templateYaml,
            onChange: (event) => setTemplateYaml(event.target.value),
          }),
          readonly || !editing
            ? null
            : h('div', { className: 'ae-actions' },
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary', disabled: yamlBusy,
                onClick: () => { void saveTemplateYaml() },
              }, t('action.save')),
              h('button', {
                type: 'button', className: 'ae-btn', disabled: yamlBusy,
                onClick: () => { void loadTemplateYaml() },
              }, t('action.reload'))))

        const body = templateTab === 'form'
          ? (editing ? formEdit : formView)
          : yamlPane

        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(),
          h('button', { type: 'button', className: 'ae-back', onClick: () => setTemplateDraft(null) },
            `← ${t('action.back')}`),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' },
                current.mode === 'new' ? t('tpl.new') : (current.name || current.id)),
              h('span', {
                className: 'ae-badge', 'data-kind': readonly ? 'builtin' : 'custom',
              }, readonly ? t('tpl.builtin') : t('tpl.custom')),
              editing
                ? h('div', { className: 'ae-card-note' }, t('tpl.editing'))
                : h('div', { className: 'ae-card-note' }, t('tpl.viewing')),
              readonly
                ? h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('tpl.readonly'))
                : null),
            subtabs,
            editing
              ? h('div', null,
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('tpl.id')),
                  h('input', {
                    className: 'ae-input', type: 'text', spellCheck: false,
                    disabled: current.mode === 'edit',
                    value: current.id,
                    onChange: (event) => setTemplateDraft({ ...current, id: event.target.value }),
                  })),
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('tpl.name')),
                  h('input', {
                    className: 'ae-input', type: 'text', value: current.name,
                    onChange: (event) => setTemplateDraft({ ...current, name: event.target.value }),
                  })),
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('tpl.desc')),
                  h('input', {
                    className: 'ae-input', type: 'text', value: current.description,
                    onChange: (event) => setTemplateDraft({ ...current, description: event.target.value }),
                  })))
              : h('div', null,
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('tpl.id')),
                  h('span', { className: 'ae-mono' }, current.id)),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('tpl.name')),
                  h('span', null, current.name || '-')),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('tpl.desc')),
                  h('span', null, current.description || '-')))), 
          body,
          h('div', { className: 'ae-actions' },
            readonly
              ? null
              : editing
                ? h('button', {
                  type: 'button', className: 'ae-btn ae-btn-primary',
                  onClick: () => { void saveTemplateDraft() },
                }, t('action.save'))
                : h('button', { type: 'button', className: 'ae-btn ae-btn-primary', onClick: startTemplateEdit }, t('action.edit')),
            editing ? h('button', { type: 'button', className: 'ae-btn', onClick: cancelTemplateEdit }, t('action.cancel')) : null,
            h('button', { type: 'button', className: 'ae-btn', onClick: () => copyTemplate(current) }, t('action.copyTemplate')),
            editing || readonly
              ? null
              : h('button', {
                type: 'button', className: 'ae-btn ae-danger',
                onClick: () => { void deleteTemplate({ id: current.id, name: current.name || current.id }) },
              }, t('action.delete')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => setTemplateDraft(null) }, t('action.back'))))
      }

      // ---------------------------------------------------------- Queryset
      const querysets = state.querysets || []

      function casesToText(cases) {
        return (cases || []).map((item) => JSON.stringify(item)).join('\n')
      }

      function parseCasesText(text) {
        const cases = []
        const lines = String(text || '').split(/\r?\n/)
        for (const [index, line] of lines.entries()) {
          if (!line.trim()) continue
          let value
          try {
            value = JSON.parse(line)
          } catch (failure) {
            return { ok: false, error: `第 ${index + 1} 行：${failure.message}` }
          }
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false, error: `第 ${index + 1} 行：每行应该是一个对象` }
          }
          if (!String(value.query || '').trim()) {
            return { ok: false, error: `第 ${index + 1} 行：缺 query` }
          }
          cases.push(value)
        }
        return { ok: true, cases }
      }

      async function openQueryset(item) {
        setError('')
        setNotice('')
        setQsBusy(true)
        try {
          const data = await api(`/querysets?id=${encodeURIComponent(item.id)}`)
          const queryset = data.queryset
          setQsCasesText(casesToText(queryset.cases))
          setQsDraft({
            mode: 'edit',
            editing: false,
            id: queryset.id,
            name: queryset.name,
            description: queryset.description || '',
            fields: queryset.fields || [],
            queryField: queryset.queryField || 'query',
            source: queryset.source || {},
            cases: queryset.cases || [],
            original: {
              name: queryset.name,
              description: queryset.description || '',
              cases: queryset.cases || [],
              fields: queryset.fields || [],
              queryField: queryset.queryField || 'query',
            },
          })
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setQsBusy(false)
        }
      }

      function cancelQuerysetEdit() {
        const original = qsDraft && qsDraft.original
        if (original) {
          setQsDraft({
            ...qsDraft,
            name: original.name,
            description: original.description,
            fields: original.fields,
            queryField: original.queryField,
            cases: original.cases,
          })
          setQsCasesText(casesToText(original.cases))
        }
        setError('')
        setNotice('')
      }

      function saveQueryset() {
        if (!qsDraft) return
        const parsed = parseCasesText(qsCasesText)
        if (!parsed.ok) {
          setError(parsed.error)
          return
        }
        if (parsed.cases.length === 0) {
          setError(t('qs.noCases'))
          return
        }
        const fields = []
        for (const item of parsed.cases) {
          for (const key of Object.keys(item)) if (!fields.includes(key)) fields.push(key)
        }
        setError('')
        setConfirmDialog({
          kind: 'queryset',
          title: t('confirm.querysetTitle'),
          note: t('confirm.querysetNote'),
          rows: [
            [t('qs.id'), qsDraft.id],
            [t('qs.name'), qsDraft.name || qsDraft.id],
            [t('qs.cases'), String(parsed.cases.length)],
            [t('qs.fields'), fields.join(', ')],
          ],
          payload: {
            id: qsDraft.id,
            name: qsDraft.name || qsDraft.id,
            description: qsDraft.description || '',
            fields,
            queryField: qsDraft.queryField || fields[0] || 'query',
            cases: parsed.cases,
            source: qsDraft.source || {},
          },
        })
      }

      async function saveQuerysetConfirmed(payload) {
        setConfirmDialog(null)
        setQsBusy(true)
        setError('')
        try {
          await api('/querysets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setQsDraft({
            ...qsDraft,
            ...payload,
            editing: false,
            original: {
              name: payload.name,
              description: payload.description,
              cases: payload.cases,
              fields: payload.fields,
              queryField: payload.queryField,
            },
          })
          setQsCasesText(casesToText(payload.cases))
          setNotice(t('label.saved'))
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setQsBusy(false)
        }
      }

      async function deleteQueryset(item) {
        if (!window.confirm(`${t('qs.confirmDelete')}「${item.name}」？`)) return
        setError('')
        try {
          await api(`/querysets?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
          setQsDraft(null)
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      // ---- 导入 ----
      function toBase64(buffer) {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        const chunk = 0x8000
        for (let index = 0; index < bytes.length; index += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
        }
        if (typeof btoa !== 'function') throw new Error('这个环境不支持 base64 编码')
        return btoa(binary)
      }

      function openImporter(mode, target) {
        setError('')
        setNotice('')
        setImporter({
          mode,
          kind: 'jsonl',
          id: target ? target.id : `qs-${Date.now().toString(36)}`,
          name: target ? target.name : '',
          description: target ? target.description || '' : '',
          text: '',
          base64: '',
          fileName: '',
          link: '',
          sheetId: '',
          tableId: '',
          queryField: '',
          busy: false,
          result: null,
          error: '',
        })
      }

      function updateImporter(patch) {
        setImporter({ ...importer, ...patch })
      }

      async function runImport() {
        const current = importer
        if (!current) return
        const payload = { kind: current.kind, queryField: current.queryField || undefined, name: current.fileName || current.name }
        if (current.kind === 'jsonl' || current.kind === 'csv') {
          if (!current.text.trim()) {
            updateImporter({ error: t('qs.needText') })
            return
          }
          payload.text = current.text
        } else if (current.kind === 'xlsx') {
          if (!current.base64) {
            updateImporter({ error: t('qs.needFile') })
            return
          }
          payload.base64 = current.base64
        } else {
          if (!current.link.trim()) {
            updateImporter({ error: t('qs.needLink') })
            return
          }
          payload.link = current.link.trim()
          if (current.sheetId.trim()) payload.sheetId = current.sheetId.trim()
          if (current.tableId.trim()) payload.tableId = current.tableId.trim()
        }
        updateImporter({ busy: true, error: '', result: null })
        try {
          const result = await api('/querysets/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          updateImporter({
            busy: false,
            result,
            queryField: result.queryField,
            name: current.name || result.title || '',
          })
        } catch (failure) {
          updateImporter({ busy: false, error: String(failure.message || failure) })
        }
      }

      async function applyImport() {
        const current = importer
        if (!current || !current.result) return
        const result = current.result
        const body = {
          id: current.id,
          name: current.name || current.id,
          description: current.description || '',
          fields: result.fields,
          queryField: current.queryField || result.queryField,
          cases: result.cases,
          source: { kind: current.kind, link: current.link || '', fileName: current.fileName || '' },
        }
        setQsBusy(true)
        try {
          await api('/querysets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          setImporter(null)
          setNotice(t('qs.imported'))
          await load()
          if (current.mode === 'replace') {
            await openQueryset(body)
          } else {
            setQsDraft(null)
          }
        } catch (failure) {
          updateImporter({ error: String(failure.message || failure) })
        } finally {
          setQsBusy(false)
        }
      }

      function renderQuerysetList() {
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(), renderImporter(),
          h('div', { className: 'ae-toolbar' },
            h('div', { className: 'ae-toolbar-left' },
              h('span', { className: 'ae-toolbar-count' }, `${querysets.length} ${t('qs.unit')}`),
              h('span', { className: 'ae-card-note' }, t('qs.hint'))),
            h('div', { className: 'ae-toolbar-right' },
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary',
                onClick: () => openImporter('new'),
              }, t('qs.import')))),
          querysets.length === 0
            ? h('div', { className: 'ae-empty' }, t('qs.empty'))
            : h('div', { className: 'ae-cards' },
              ...querysets.map((item) => h('div', {
                key: item.id, className: 'ae-qs-card', role: 'button', tabIndex: 0,
                'data-broken': String(Boolean(item.broken)),
                onClick: () => { void openQueryset(item) },
              },
              h('div', { className: 'ae-card-head' },
                h('div', { className: 'ae-card-title' }, item.name),
                h('span', { className: 'ae-badge', 'data-kind': 'custom' }, `${item.count} ${t('qs.cases')}`),
                item.broken ? h('span', { className: 'ae-badge', 'data-kind': 'broken' }, t('qs.broken')) : null),
              h('div', { className: 'ae-card-note' }, item.description || '—'),
              h('div', { className: 'ae-card-meta' },
                h('span', { className: 'ae-mono' }, item.id),
                h('span', null, item.source && item.source.kind ? t(`qs.kind.${item.source.kind}`) : t('qs.kind.manual')),
                h('span', null, item.updatedAt ? item.updatedAt.slice(0, 16).replace('T', ' ') : ''))))))
      }

      function renderQuerysetDetail() {
        const current = qsDraft
        const editing = Boolean(current.editing)
        const parsed = editing ? null : null
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, renderWorkspace(), tabs, messages, renderConfirm(), renderImporter(),
          h('button', { type: 'button', className: 'ae-back', onClick: () => setQsDraft(null) },
            `← ${t('action.back')}`),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, current.name || current.id),
              h('span', { className: 'ae-badge', 'data-kind': 'custom' }, `${current.cases.length} ${t('qs.cases')}`),
              editing
                ? h('div', { className: 'ae-card-note' }, t('tpl.editing'))
                : h('div', { className: 'ae-card-note' }, t('tpl.viewing'))),
            editing
              ? h('div', null,
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.name')),
                  h('input', {
                    className: 'ae-input', type: 'text', value: current.name,
                    onChange: (event) => setQsDraft({ ...current, name: event.target.value }),
                  })),
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.desc')),
                  h('input', {
                    className: 'ae-input', type: 'text', value: current.description,
                    onChange: (event) => setQsDraft({ ...current, description: event.target.value }),
                  })))
              : h('div', null,
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.id')),
                  h('span', { className: 'ae-mono' }, current.id)),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.name')),
                  h('span', null, current.name || '-')),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.desc')),
                  h('span', null, current.description || '-')),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.queryField')),
                  h('span', { className: 'ae-mono' }, current.queryField || 'query')),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.fields')),
                  h('span', { className: 'ae-mono' }, (current.fields || []).join(', ') || '-')),
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.source')),
                  h('span', null, current.source && current.source.kind
                    ? t(`qs.kind.${current.source.kind}`)
                    : t('qs.kind.manual'))))),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, t('qs.cases')),
              h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('qs.casesHint'))),
            editing
              ? h('textarea', {
                className: 'ae-textarea ae-mono', rows: 18, spellCheck: false,
                value: qsCasesText,
                onChange: (event) => setQsCasesText(event.target.value),
              })
              : h('div', { className: 'ae-qs-table' },
                ...previewCases(current.cases).map((item, index) => h('div', {
                  className: 'ae-detail-row', key: `case-${index}`,
                },
                h('span', { className: 'ae-detail-key' }, `${index + 1}`),
                h('span', { className: 'ae-mono' }, item.query)))),
            !editing && current.cases.length > 30
              ? h('div', { className: 'ae-card-note' }, `${t('qs.more')}${current.cases.length - 30}`)
              : null),
          h('div', { className: 'ae-actions' },
            editing
              ? h('button', { type: 'button', className: 'ae-btn ae-btn-primary', disabled: qsBusy, onClick: () => saveQueryset() }, t('action.save'))
              : h('button', { type: 'button', className: 'ae-btn ae-btn-primary', onClick: () => setQsDraft({ ...current, editing: true }) }, t('action.edit')),
            editing
              ? h('button', { type: 'button', className: 'ae-btn', onClick: cancelQuerysetEdit }, t('action.cancel'))
              : null,
            h('button', {
              type: 'button', className: 'ae-btn', disabled: qsBusy,
              onClick: () => openImporter('replace', { id: current.id, name: current.name, description: current.description }),
            }, t('qs.replaceCases')),
            h('button', {
              type: 'button', className: 'ae-btn ae-danger', disabled: qsBusy,
              onClick: () => { void deleteQueryset({ id: current.id, name: current.name || current.id }) },
            }, t('action.delete')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => setQsDraft(null) }, t('action.back'))))
      }

      function previewCases(cases) {
        return (cases || []).slice(0, 30)
      }

      function renderImporter() {
        const current = importer
        if (!current) return null
        const kinds = ['jsonl', 'csv', 'xlsx', 'sheet', 'bitable']
        const result = current.result
        return h('div', { className: 'ae-modal-mask' },
          h('div', { className: 'ae-modal', style: { width: 'min(720px, 94vw)' } },
            h('div', { className: 'ae-modal-title' },
              current.mode === 'replace' ? t('qs.replaceTitle') : t('qs.importTitle')),
            h('div', { className: 'ae-chips' },
              ...kinds.map((kind) => h('button', {
                key: kind, type: 'button', className: 'ae-chip',
                'data-active': String(current.kind === kind),
                onClick: () => updateImporter({ kind, result: null, error: '' }),
              }, t(`qs.kind.${kind}`)))),
            current.kind === 'jsonl' || current.kind === 'csv'
              ? h('div', null,
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.paste')),
                  h('textarea', {
                    className: 'ae-textarea ae-mono', rows: 8, spellCheck: false,
                    placeholder: current.kind === 'csv' ? 'query,expect\nDSH 是什么,本地运行时' : '{"query":"DSH 是什么","expect":"本地运行时"}',
                    value: current.text,
                    onChange: (event) => updateImporter({ text: event.target.value, result: null }),
                  })),
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.orFile')),
                  h('input', {
                    className: 'ae-input', type: 'file',
                    accept: current.kind === 'csv' ? '.csv,.tsv,text/csv' : '.jsonl,.json,text/plain',
                    onChange: (event) => {
                      const file = event.target.files && event.target.files[0]
                      if (!file) return
                      Promise.resolve(file.text()).then((text) => {
                        updateImporter({ text, fileName: file.name, result: null })
                      }).catch((failure) => updateImporter({ error: String(failure.message || failure) }))
                    },
                  })))
              : null,
            current.kind === 'xlsx'
              ? h('div', { className: 'ae-field' },
                h('label', { className: 'ae-label' }, t('qs.pickFile')),
                h('input', {
                  className: 'ae-input', type: 'file', accept: '.xlsx',
                  onChange: (event) => {
                    const file = event.target.files && event.target.files[0]
                    if (!file) return
                    Promise.resolve(file.arrayBuffer()).then((buffer) => {
                      updateImporter({ base64: toBase64(buffer), fileName: file.name, result: null })
                    }).catch((failure) => updateImporter({ error: String(failure.message || failure) }))
                  },
                }),
                current.fileName ? h('div', { className: 'ae-card-note' }, current.fileName) : null)
              : null,
            current.kind === 'sheet' || current.kind === 'bitable'
              ? h('div', null,
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.link')),
                  h('input', {
                    className: 'ae-input', type: 'text', spellCheck: false,
                    placeholder: current.kind === 'sheet'
                      ? 'https://xxx.feishu.cn/sheets/xxxxx?sheet=xxxxx'
                      : 'https://xxx.feishu.cn/base/xxxxx?table=tblxxxx',
                    value: current.link,
                    onChange: (event) => updateImporter({ link: event.target.value, result: null }),
                  })),
                current.kind === 'sheet'
                  ? h('div', { className: 'ae-field' },
                    h('label', { className: 'ae-label' }, t('qs.sheetId')),
                    h('input', {
                      className: 'ae-input ae-mono', type: 'text', spellCheck: false,
                      placeholder: t('qs.optional'), value: current.sheetId,
                      onChange: (event) => updateImporter({ sheetId: event.target.value, result: null }),
                    }))
                  : h('div', { className: 'ae-field' },
                    h('label', { className: 'ae-label' }, t('qs.tableId')),
                    h('input', {
                      className: 'ae-input ae-mono', type: 'text', spellCheck: false,
                      placeholder: t('qs.optional'), value: current.tableId,
                      onChange: (event) => updateImporter({ tableId: event.target.value, result: null }),
                    })))
              : null,
            result
              ? h('div', { className: 'ae-import-preview' },
                h('div', { className: 'ae-detail-row' },
                  h('span', { className: 'ae-detail-key' }, t('qs.parsed')),
                  h('span', null, `${result.total} ${t('qs.cases')}${result.skipped ? ` · ${t('qs.skipped')} ${result.skipped}` : ''}`)),
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('qs.queryField')),
                  h('select', {
                    className: 'ae-input',
                    value: current.queryField,
                    onChange: (event) => updateImporter({ queryField: event.target.value }),
                  },
                  ...(result.fields || []).map((field) => h('option', { key: field, value: field }, field)))),
                h('div', { className: 'ae-import-sample' },
                  ...result.cases.slice(0, 5).map((item, index) => h('div', {
                    className: 'ae-detail-row', key: `sample-${index}`,
                  },
                  h('span', { className: 'ae-detail-key' }, `${index + 1}`),
                  h('span', { className: 'ae-mono' }, String(item[current.queryField || result.queryField] || ''))))))
              : null,
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('qs.name')),
              h('input', {
                className: 'ae-input', type: 'text', value: current.name,
                onChange: (event) => updateImporter({ name: event.target.value }),
              })),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('qs.id')),
              h('input', {
                className: 'ae-input ae-mono', type: 'text', spellCheck: false,
                disabled: current.mode === 'replace',
                value: current.id,
                onChange: (event) => updateImporter({ id: event.target.value }),
              })),
            current.error ? h('div', { className: 'ae-error' }, current.error) : null,
            h('div', { className: 'ae-actions' },
              h('button', {
                type: 'button', className: 'ae-btn', disabled: current.busy,
                onClick: () => { void runImport() },
              }, t('qs.parse')),
              h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary',
                disabled: current.busy || !result,
                onClick: () => { void applyImport() },
              }, current.mode === 'replace' ? t('qs.applyReplace') : t('qs.applyNew')),
              h('button', {
                type: 'button', className: 'ae-btn',
                onClick: () => setImporter(null),
              }, t('action.cancel')))))
      }

      // ---------------------------------------------------------- 路由
      if (view === 'tasks') {
        if (submitting) return renderSubmit()
        if (taskId) return renderTaskDetail()
        return renderTaskList()
      }
      if (view === 'querysets') {
        if (qsDraft) return renderQuerysetDetail()
        return renderQuerysetList()
      }
      if (templateDraft) return renderTemplateDetail()
      return renderTemplateList()
    }

    // ------------------------------------------------------------ 注册

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'autoeval: locale')
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'autoeval',
          order: 20,
          label: () => t('panel.title'),
        }, (props) => h(AutoEvalIcon, props)))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'autoeval',
        }, (props) => h(AutoEvalPanel, { ...props, t })))
      },
    }
  },
})
