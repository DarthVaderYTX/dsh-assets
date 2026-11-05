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
      'tpl.usedBy': '用在',

      'submit.title': '提交评测任务',
      'submit.name': '任务名称',
      'submit.cases': '用例集（JSON 数组）',
      'submit.casesHint': '每条至少要有 id 和 query；infoPoints 是判分用的信息点。',
      'submit.template': '从模板开始',
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
      'tpl.usedBy': 'used by',

      'submit.title': 'Submit evaluation task',
      'submit.name': 'Task name',
      'submit.cases': 'Cases (JSON array)',
      'submit.casesHint': 'Each case needs at least id and query; infoPoints drives scoring.',
      'submit.template': 'Start from template',
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
.ae-steps { display: flex; flex-direction: column; gap: 6px; }
.ae-step { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.ae-step-name { color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-step-meta { margin-left: auto; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b);
  font-variant-numeric: tabular-nums; }
.ae-step[data-status="running"] .ae-step-meta { color: var(--dsw-alias-brand-primary, #247bbf); }
.ae-step[data-status="failed"] .ae-step-meta { color: var(--dsw-alias-state-error-primary, #c0392b); }
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

      function defaultDraft(data) {
        const template = (data.templates || []).find((item) => item.builtin) || (data.templates || [])[0]
        return {
          templateId: template ? template.id : 'custom',
          name: template ? template.name : 'AutoEval 运行',
          stages: cloneStages(template ? template.stages : {}, data.stages),
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
        const stages = {}
        for (const stage of (state.stages || [])) {
          const entry = draft.stages[stage.id]
          const parsed = readJson(entry.configText || '{}')
          if (!parsed.ok) {
            setError(`${stage.id} / ${t('error.params')}：${parsed.error}`)
            return
          }
          stages[stage.id] = { template: entry.template, config: parsed.value }
        }
        setBusy(true)
        try {
          const result = await api('/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: draft.name, templateId: draft.templateId, cases: cases.value, stages }),
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
        setError('')
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

      function draftToTemplate() {
        setError('')
        setNotice('')
        setView('templates')
        setTemplateDraft({
          mode: 'new',
          readonly: false,
          id: `template-${Date.now().toString(36)}`,
          name: draft.name,
          description: '',
          stages: Object.fromEntries(
            Object.entries(draft.stages).map(([key, value]) => [
              key,
              { template: value.template, config: value.config, configText: value.configText },
            ]),
          ),
        })
      }

      function setStage(stageId, patch) {
        setDraft((current) => {
          if (!current) return current
          return {
            ...current,
            stages: { ...current.stages, [stageId]: { ...current.stages[stageId], ...patch } },
          }
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

      function pickStagePreset(stageId, presetId, target) {
        const stage = (state.stages || []).find((item) => item.id === stageId)
        const preset = stage && stage.presets.find((item) => item.id === presetId)
        const patch = {
          template: presetId,
          config: { ...(preset ? preset.config : {}) },
          configText: JSON.stringify(preset ? preset.config : {}, null, 2),
        }
        if (target === 'template') setTemplateStage(stageId, patch)
        else setStage(stageId, patch)
      }

      function applyTemplateToDraft(template) {
        setDraft({
          templateId: template.id,
          name: template.name,
          stages: cloneStages(template.stages, state.stages),
        })
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

      function stageChips(stage, entry, target, disabled) {
        return h('div', { className: 'ae-chips' },
          ...stage.presets.map((preset) => h('button', {
            key: preset.id, type: 'button', className: 'ae-chip', disabled,
            'data-active': String(entry.template === preset.id),
            onClick: () => {
              if (!disabled) pickStagePreset(stage.id, preset.id, target)
            },
          }, t(`preset.${stage.id}.${preset.id}`) || preset.id)))
      }

      function stageEditor(stage, entry, target, readonly) {
        return h('div', { className: 'ae-stage-edit', key: stage.id },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, t(`stage.${stage.id}`)),
            h('div', { className: 'ae-card-note' }, t(`stage.hint.${stage.id}`))),
          stageChips(stage, entry, target, readonly),
          entry.template === 'custom'
            ? h('input', {
              className: 'ae-input', type: 'text', spellCheck: false, disabled: readonly,
              placeholder: 'python3 ./my-judge.py', value: entry.config.command || '',
              onChange: (event) => {
                const config = { ...entry.config, command: event.target.value }
                const patch = { config, configText: JSON.stringify(config, null, 2) }
                if (target === 'template') setTemplateStage(stage.id, patch)
                else setStage(stage.id, patch)
              },
            })
            : null,
          h('div', { className: 'ae-field' },
            h('label', { className: 'ae-label' }, t('field.params')),
            h('textarea', {
              className: 'ae-textarea', rows: 4, spellCheck: false, disabled: readonly,
              value: entry.configText,
              onChange: (event) => {
                const patch = { configText: event.target.value }
                if (target === 'template') setTemplateStage(stage.id, patch)
                else setStage(stage.id, patch)
              },
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
          h('div', { className: 'ae-steps' },
            ...Object.entries(run.stages || {}).map(([key, value]) => h('div', {
              key, className: 'ae-step', 'data-status': value.status,
            },
            h('span', { className: 'ae-step-name' },
              `${t(`stage.${key}`)}${value.template ? ` · ${value.template}` : ''}`),
            h('span', { className: 'ae-step-meta' },
              `${t(`label.${value.status}`)}${value.durationMs == null ? '' : ` · ${duration(value.durationMs)}`}`)))),
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
                }, template.name))))),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-title' }, t('tpl.config')),
            ...(state.stages || []).map((stage) => stageEditor(stage, draft.stages[stage.id], 'draft', false))),
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, t('submit.cases')),
              h('div', { className: 'ae-card-note' }, t('submit.casesHint'))),
            h('textarea', {
              className: 'ae-textarea', rows: 10, spellCheck: false, value: casesText,
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
              type: 'button', className: 'ae-btn ae-btn-primary', disabled: busy || Boolean(active),
              onClick: () => { void submit() },
            }, t('action.run')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => draftToTemplate() }, t('action.saveAsTemplate'))))
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
                h('span', {
                  className: 'ae-badge',
                  'data-kind': template.builtin ? 'builtin' : 'custom',
                }, template.builtin ? t('tpl.builtin') : t('tpl.custom'))),
              h('div', { className: 'ae-card-note' }, template.description || template.id),
              h('div', { className: 'ae-card-note' },
                Object.entries(template.stages || {}).map(([key, value]) => `${key}: ${value.template}`).join(' · '))))))
      }

      // ---------------------------------------------------------- 模板详情
      function renderTemplateDetail() {
        const current = templateDraft
        const readonly = current.readonly
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
              readonly ? null : h('div', { className: 'ae-card-note' }, t('tpl.edit')),
              readonly
                ? h('div', { className: 'ae-card-note', style: { marginLeft: 'auto' } }, t('tpl.readonly'))
                : null),
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
          h('div', { className: 'ae-card' },
            h('div', { className: 'ae-card-title' }, t('tpl.config')),
            ...(state.stages || []).map((stage) => stageEditor(stage, current.stages[stage.id], 'template', readonly))),
          h('div', { className: 'ae-actions' },
            readonly
              ? null
              : h('button', {
                type: 'button', className: 'ae-btn ae-btn-primary',
                onClick: () => { void saveTemplateDraft() },
              }, t('action.save')),
            h('button', { type: 'button', className: 'ae-btn', onClick: () => copyTemplate(current) }, t('action.copyTemplate')),
            readonly
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
