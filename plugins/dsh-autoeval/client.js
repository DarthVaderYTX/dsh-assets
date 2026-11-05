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

      'action.submit': '提交任务',
      'action.run': '开始运行',
      'action.cancel': '取消',
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
      'tpl.broken': '配置有问题',
      'tpl.usedBy': '用在',

      'submit.title': '提交评测任务',
      'submit.name': '任务名称',
      'submit.cases': '用例集（JSON 数组）',
      'submit.casesHint': '每条至少要有 id 和 query；infoPoints 是判分用的信息点。',
      'submit.template': '用哪个任务模板',
      'submit.templateHint': '阶段配置取自模板本身；要改配置先去「任务模板」里改模板。',
      'submit.pickTemplate': '先选一个任务模板。',
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
    }

    const en = {
      'panel.title': 'AutoEval',
      'panel.subtitle': 'Four-stage evaluation pipeline: scraping, annotation, metrics, reporting',
      'tab.tasks': 'Tasks',
      'tab.templates': 'Templates',

      'action.submit': 'Submit task',
      'action.run': 'Run',
      'action.cancel': 'Cancel',
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
      'tpl.usedBy': 'used by',

      'submit.title': 'Submit evaluation task',
      'submit.name': 'Task name',
      'submit.cases': 'Cases (JSON array)',
      'submit.casesHint': 'Each case needs at least id and query; infoPoints drives scoring.',
      'submit.template': 'Template to run',
      'submit.templateHint': 'Stage config comes from the template; edit the template first if it needs changes.',
      'submit.pickTemplate': 'Pick a template first.',
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
      const [templateTab, setTemplateTab] = React.useState('form')
      const [templateYaml, setTemplateYaml] = React.useState('')
      const [yamlBusy, setYamlBusy] = React.useState(false)
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

      function cloneStages(stages, catalog) {
        const out = {}
        for (const stage of catalog || []) {
          const chosen = (stages && stages[stage.id]) || {}
          const preset = stage.presets.find((item) => item.id === chosen.template) || stage.presets[0]
          const config = { ...preset.config, ...(chosen.config || {}) }
          out[stage.id] = {
            template: preset.id,
            config,
            configText: JSON.stringify(config, null, 2),
          }
        }
        return out
      }

      // 提交任务只认模板：draft 里只记选了哪个模板，阶段配置一律取自模板本身
      function defaultDraft(data) {
        const template = (data.templates || []).find((item) => item.builtin) || (data.templates || [])[0]
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

      async function submit() {
        setError('')
        setNotice('')
        const cases = readJson(casesText)
        if (!cases.ok || !Array.isArray(cases.value) || cases.value.length === 0) {
          setError(`${t('error.cases')}${cases.ok ? '' : `：${cases.error}`}`)
          return
        }
        const template = templates.find((item) => item.id === draft.templateId)
        if (!template) {
          setError(t('submit.pickTemplate'))
          return
        }
        setBusy(true)
        try {
          const result = await api('/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: draft.name, templateId: template.id, cases: cases.value }),
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
          id: template.id,
          name: template.name,
          description: template.description || '',
          stages: cloneStages(template.stages, state.stages),
        })
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

      async function saveTemplateYaml() {
        setError('')
        setNotice('')
        setYamlBusy(true)
        try {
          const result = await api('/templates/raw', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ yaml: templateYaml }),
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
              stages: cloneStages(saved.stages, state.stages),
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
          id: `template-${Date.now().toString(36)}`,
          name: '',
          description: '',
          stages: cloneStages({}, state.stages),
        })
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
          stages: cloneStages(source.stages, state.stages),
        })
      }

      function setTemplateStage(stageId, patch) {
        setTemplateDraft((current) => {
          if (!current) return current
          return {
            ...current,
            stages: { ...current.stages, [stageId]: { ...current.stages[stageId], ...patch } },
          }
        })
      }

      function pickStagePreset(stageId, presetId) {
        const stage = (state.stages || []).find((item) => item.id === stageId)
        const preset = stage && stage.presets.find((item) => item.id === presetId)
        setTemplateStage(stageId, {
          template: presetId,
          config: { ...(preset ? preset.config : {}) },
          configText: JSON.stringify(preset ? preset.config : {}, null, 2),
        })
      }

      function applyTemplateToDraft(template) {
        setDraft({ templateId: template.id, name: template.name })
        setNotice('')
        setError('')
      }

      async function saveTemplateDraft() {
        const current = templateDraft
        if (!current || current.readonly) return
        const id = String(current.id || '').trim()
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
          setError(t('tpl.badId'))
          return
        }
        const stages = {}
        for (const stage of (state.stages || [])) {
          const entry = current.stages[stage.id]
          const parsed = readJson(entry.configText || '{}')
          if (!parsed.ok) {
            setError(`${stage.id} / ${t('error.params')}：${parsed.error}`)
            return
          }
          stages[stage.id] = { template: entry.template, config: parsed.value }
        }
        setError('')
        try {
          await api('/templates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id,
              name: current.name || id,
              description: current.description || '',
              stages,
            }),
          })
          setTemplateDraft({ ...current, mode: 'edit', readonly: false })
          setNotice(t('label.saved'))
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
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
        ...['tasks', 'templates'].map((key) => h('button', {
          key, type: 'button', className: 'ae-tab', 'data-active': String(view === key),
          onClick: () => {
            setView(key)
            setSubmitting(false)
            setTaskId('')
            setDetail(null)
            setTemplateDraft(null)
            setError('')
            setNotice('')
          },
        }, t(`tab.${key}`))))

      function stageChips(stage, entry, disabled) {
        return h('div', { className: 'ae-chips' },
          ...stage.presets.map((preset) => h('button', {
            key: preset.id, type: 'button', className: 'ae-chip', disabled,
            'data-active': String(entry.template === preset.id),
            onClick: () => {
              if (!disabled) pickStagePreset(stage.id, preset.id)
            },
          }, t(`preset.${stage.id}.${preset.id}`) || preset.id)))
      }

      function stageEditor(stage, entry, readonly) {
        return h('div', { className: 'ae-stage-edit', key: stage.id },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t(`stage.${stage.id}`)),
            h('div', { className: 'ae-card-note' }, t(`stage.hint.${stage.id}`))),
          stageChips(stage, entry, readonly),
          entry.template === 'custom'
            ? h('input', {
              className: 'ae-input', type: 'text', spellCheck: false, disabled: readonly,
              placeholder: 'python3 ./my-judge.py', value: entry.config.command || '',
              onChange: (event) => {
                const config = { ...entry.config, command: event.target.value }
                setTemplateStage(stage.id, { config, configText: JSON.stringify(config, null, 2) })
              },
            })
            : null,
          h('div', { className: 'ae-field' },
            h('label', { className: 'ae-label' }, t('field.params')),
            h('textarea', {
              className: 'ae-textarea', rows: 4, spellCheck: false, disabled: readonly,
              value: entry.configText,
              onChange: (event) => setTemplateStage(stage.id, { configText: event.target.value }),
            })))
      }

      // ---------------------------------------------------------- 任务列表
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
          head, tabs, messages,
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
                onClick: () => { setSubmitting(true); setError(''); setNotice('') },
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
      function renderStages(run, log) {
        return h('div', { className: 'ae-acc' },
          ...Object.entries(run.stages || {}).map(([key, value]) => {
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
            h('span', { className: 'ae-acc-title' }, t(`stage.${key}`)),
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
            head, tabs, messages,
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
          head, tabs, messages,
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
            body))
      }

      // ---------------------------------------------------------- 提交任务
      function renderSubmit() {
        const progress = active && active.progress
        const selected = templates.find((item) => item.id === draft.templateId)
        const preview = selected
          ? h('div', null,
            ...(state.stages || []).map((stage) => {
              const entry = (selected.stages && selected.stages[stage.id]) || {}
              const config = entry.config && Object.keys(entry.config).length > 0
                ? JSON.stringify(entry.config)
                : ''
              return h('div', { className: 'ae-detail-row', key: stage.id },
                h('span', { className: 'ae-detail-key' }, t(`stage.${stage.id}`)),
                h('span', { className: 'ae-mono' },
                  `${entry.template || '-'}${config ? `  ${config}` : ''}`))
            }))
          : null
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, tabs, messages,
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
              h('div', { className: 'ae-chips' },
                ...templates.map((template) => h('button', {
                  key: template.id, type: 'button', className: 'ae-chip',
                  'data-active': String(draft.templateId === template.id),
                  onClick: () => applyTemplateToDraft(template),
                }, template.name))),
              h('div', { className: 'ae-card-note' }, t('submit.templateHint'))),
            h('div', { className: 'ae-label', style: { marginTop: '4px' } }, t('tpl.config')),
            preview || h('div', { className: 'ae-empty' }, t('submit.pickTemplate'))),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, t('submit.cases')),
              h('div', { className: 'ae-card-note' }, t('submit.casesHint'))),
            h('textarea', {
              className: 'ae-textarea', rows: 12, spellCheck: false, value: casesText,
              onChange: (event) => setCasesText(event.target.value),
            })),
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
          head, tabs, messages,
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
      function renderFieldInput(stageId, entry, field, readonly) {
        const value = entry.config && entry.config[field.key] !== undefined
          ? entry.config[field.key]
          : field.default
        const patch = (next) => setTemplateStage(stageId, {
          config: { ...(entry.config || {}), [field.key]: next },
        })
        const label = h('label', { className: 'ae-label' },
          `${field.label || field.key}${field.unit ? `（${field.unit}）` : ''}`)
        const note = field.hint ? h('div', { className: 'ae-card-note' }, field.hint) : null

        if (field.type === 'number') {
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('input', {
              className: 'ae-input', type: 'number', disabled: readonly,
              min: field.min, max: field.max, step: field.step,
              value: value === undefined || value === null ? '' : String(value),
              onChange: (event) => patch(event.target.value === '' ? null : Number(event.target.value)),
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
                type: 'checkbox', disabled: readonly, checked: Boolean(value),
                onChange: (event) => patch(event.target.checked),
              }),
              ` ${field.label || field.key}`),
            note)
        }
        if (field.type === 'list') {
          const list = Array.isArray(value) ? value : []
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('div', { className: 'ae-chips' },
              ...(field.options || []).map((option) => h('button', {
                key: option.value, type: 'button', className: 'ae-chip', disabled: readonly,
                'data-active': String(list.includes(option.value)),
                onClick: () => patch(list.includes(option.value)
                  ? list.filter((item) => item !== option.value)
                  : [...list, option.value]),
              }, option.label || option.value))),
            note)
        }
        if (field.type === 'command') {
          return h('div', { className: 'ae-field', key: field.key },
            label,
            h('input', {
              className: 'ae-input ae-mono', type: 'text', spellCheck: false, disabled: readonly,
              placeholder: 'python3 ./my-judge.py', value: value || '',
              onChange: (event) => patch(event.target.value),
            }),
            note)
        }
        return h('div', { className: 'ae-field', key: field.key },
          label,
          h('input', {
            className: 'ae-input', type: 'text', spellCheck: false, disabled: readonly,
            value: value === undefined || value === null ? '' : String(value),
            onChange: (event) => patch(event.target.value),
          }),
          note)
      }

      function renderTemplateDetail() {
        const current = templateDraft
        const readonly = current.readonly
        const subtabs = h('div', { className: 'ae-subtabs' },
          ...['form', 'yaml'].map((tab) => h('button', {
            key: tab, type: 'button', className: 'ae-subtab',
            'data-active': String(templateTab === tab),
            onClick: () => {
              setTemplateTab(tab)
              if (tab === 'yaml' && !templateYaml) void loadTemplateYaml()
            },
          }, t(`tpl.tab.${tab}`))))

        const form = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-title' }, t('tpl.config')),
          ...(state.stages || []).map((stage) => {
            const entry = current.stages[stage.id] || {}
            const preset = stage.presets.find((item) => item.id === entry.template)
            return h('div', { className: 'ae-stage-edit', key: stage.id },
              h('div', { className: 'ae-card-head' },
                h('div', { className: 'ae-card-title' }, t(`stage.${stage.id}`)),
                h('div', { className: 'ae-card-note' }, t(`stage.hint.${stage.id}`))),
              stageChips(stage, entry, readonly),
              ...((preset && preset.fields) || []).map((field) => renderFieldInput(stage.id, entry, field, readonly)))
          }))

        const yamlPane = h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t('tpl.yaml')),
            h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('tpl.yamlHint'))),
          readonly
            ? h('div', { className: 'ae-card-note' }, t('tpl.readonly'))
            : null,
          h('textarea', {
            className: 'ae-textarea ae-mono', rows: 26, spellCheck: false,
            disabled: readonly || yamlBusy,
            value: templateYaml,
            onChange: (event) => setTemplateYaml(event.target.value),
          }),
          readonly
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

        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, tabs, messages,
          h('button', { type: 'button', className: 'ae-back', onClick: () => setTemplateDraft(null) },
            `← ${t('action.back')}`),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' },
                current.mode === 'new' ? t('tpl.new') : (current.name || current.id)),
              h('span', {
                className: 'ae-badge', 'data-kind': readonly ? 'builtin' : 'custom',
              }, readonly ? t('tpl.builtin') : t('tpl.custom')),
              current.mode === 'new' ? null : h('div', { className: 'ae-card-note' }, t('tpl.edit')),
              readonly
                ? h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('tpl.readonly'))
                : null),
            subtabs,
            templateTab === 'form' ? null : h('div', { className: 'ae-card-note' }, t('tpl.yamlSync')),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('tpl.id')),
              h('input', {
                className: 'ae-input', type: 'text', spellCheck: false,
                disabled: readonly || current.mode === 'edit',
                value: current.id,
                onChange: (event) => setTemplateDraft({ ...current, id: event.target.value }),
              })),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('tpl.name')),
              h('input', {
                className: 'ae-input', type: 'text', disabled: readonly, value: current.name,
                onChange: (event) => setTemplateDraft({ ...current, name: event.target.value }),
              })),
            h('div', { className: 'ae-field' },
              h('label', { className: 'ae-label' }, t('tpl.desc')),
              h('input', {
                className: 'ae-input', type: 'text', disabled: readonly, value: current.description,
                onChange: (event) => setTemplateDraft({ ...current, description: event.target.value }),
              }))),
          templateTab === 'form' ? form : yamlPane,
          h('div', { className: 'ae-actions' },
            readonly || templateTab === 'yaml'
              ? null
              : h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary',
                onClick: () => { void saveTemplateDraft() },
              }, t('action.save')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => copyTemplate(current) }, t('action.copyTemplate')),
            readonly || templateTab === 'yaml'
              ? null
              : h('button', {
                type: 'button', className: 'ae-btn ae-danger',
                onClick: () => { void deleteTemplate({ id: current.id, name: current.name || current.id }) },
              }, t('action.delete')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => setTemplateDraft(null) }, t('action.back'))))
      }

      // ---------------------------------------------------------- 路由
      if (view === 'tasks') {
        if (submitting) return renderSubmit()
        if (taskId) return renderTaskDetail()
        return renderTaskList()
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
