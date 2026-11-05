// AutoEval 的浏览器侧：左侧栏图标 + 主面板。
//
// 面板不自己算评测，全部逻辑在宿主插件里，这里只通过同源的 /autoeval-api 读写状态。
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
      'tab.run': '运行',
      'tab.runs': '历史',
      'tab.report': '报告',
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
      'field.template': '评测模板',
      'field.cases': '用例集（JSON 数组）',
      'field.command': '自定义命令（stdin 收 JSON，stdout 吐 JSON）',
      'field.params': '参数',
      'action.run': '开始运行',
      'action.cancel': '取消',
      'action.save': '保存为模板',
      'action.reset': '恢复内置模板',
      'action.view': '查看报告',
      'action.refresh': '刷新',
      'label.running': '运行中',
      'label.idle': '空闲',
      'label.done': '完成',
      'label.failed': '失败',
      'label.cancelled': '已取消',
      'label.pending': '等待',
      'label.noRuns': '还没有运行记录。',
      'label.noReport': '选择一次运行查看报告。',
      'label.passRate': '通过率',
      'label.p50': 'P50 耗时',
      'label.cases': '用例',
      'label.saved': '已保存',
      'label.lastRun': '上一次运行结果',
      'error.cases': '用例不是合法的 JSON 数组',
      'error.params': '该阶段参数不是合法的 JSON',
    }

    const en = {
      'panel.title': 'AutoEval',
      'panel.subtitle': 'Four-stage evaluation pipeline: scraping, annotation, metrics, reporting',
      'tab.run': 'Run',
      'tab.runs': 'History',
      'tab.report': 'Report',
      'stage.scraping': 'Scraping',
      'stage.annotation': 'Annotation',
      'stage.metrics': 'Metrics',
      'stage.reporting': 'Reporting',
      'stage.hint.scraping': 'Runs a search per case and keeps the returned sources as the material to judge.',
      'stage.hint.annotation': 'Coverage scoring: 1 when every info point appears, 0 otherwise; conflicts never cost points.',
      'stage.hint.metrics': 'Aggregates pass rate (denominator = scored rows), coverage and search latency.',
      'stage.hint.reporting': 'Writes a Markdown report plus rows.jsonl.',
      'preset.scraping.websearch': 'Preset · search scraping',
      'preset.scraping.inline': 'Preset · inline material',
      'preset.scraping.custom': 'Custom command',
      'preset.annotation.coverage-keyword': 'Preset · info-point coverage',
      'preset.annotation.coverage-rubric': 'Preset · rubric coverage',
      'preset.annotation.custom': 'Custom command',
      'preset.metrics.standard': 'Preset · standard metrics',
      'preset.metrics.grouped': 'Preset · grouped metrics',
      'preset.metrics.custom': 'Custom command',
      'preset.reporting.markdown': 'Preset · Markdown report',
      'preset.reporting.json': 'Preset · JSON snapshot',
      'preset.reporting.custom': 'Custom command',
      'field.template': 'Template',
      'field.cases': 'Cases (JSON array)',
      'field.command': 'Custom command (JSON on stdin, JSON on stdout)',
      'field.params': 'Parameters',
      'action.run': 'Run',
      'action.cancel': 'Cancel',
      'action.save': 'Save as template',
      'action.reset': 'Load built-in template',
      'action.view': 'View report',
      'action.refresh': 'Refresh',
      'label.running': 'running',
      'label.idle': 'idle',
      'label.done': 'done',
      'label.failed': 'failed',
      'label.cancelled': 'cancelled',
      'label.pending': 'pending',
      'label.noRuns': 'No runs yet.',
      'label.noReport': 'Pick a run to read its report.',
      'label.passRate': 'pass rate',
      'label.p50': 'P50 latency',
      'label.cases': 'cases',
      'label.saved': 'saved',
      'label.lastRun': 'Previous result',
      'error.cases': 'Cases are not a valid JSON array',
      'error.params': 'This stage parameter is not valid JSON',
    }

    const DEMO_CASES = [
      { id: 'c1', bucket: 'stable', query: 'Python 3.13 新特性', infoPoints: ['Python', '3.13'] },
      { id: 'c2', bucket: 'stable', query: 'TypeScript 5.9 release notes', infoPoints: ['TypeScript', '5.9'] },
      { id: 'c3', bucket: 'stable', query: 'DeepSeek API 定价 每百万 tokens', infoPoints: ['百万'] },
      { id: 'c4', bucket: 'stable', query: 'Linus Torvalds 出生地', infoPoints: ['Linus'] },
      { id: 'c5', bucket: 'stable', query: 'macOS 26 新功能', infoPoints: ['macOS'] },
      { id: 'c6', bucket: 'hard', query: '2026 年 6 月 中国新能源汽车 销量 具体数字', infoPoints: ['万辆|销量'] },
    ]

    // ------------------------------------------------------------ 样式

    const STYLE = `
.ae-page { display: flex; flex-direction: column; gap: 16px; padding: 24px 28px 40px; height: 100%; overflow: auto; box-sizing: border-box; }
.ae-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ae-title { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: .2px; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-sub { margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); color: var(--dsw-alias-label-secondary, #6b6b6b); white-space: nowrap; }
.ae-pill[data-state="running"] { color: var(--dsw-alias-brand-primary, #247bbf); border-color: currentColor; }
.ae-pill[data-state="done"] { color: var(--dsw-alias-state-success-primary, #1a7f4b); border-color: currentColor; }
.ae-pill[data-state="failed"] { color: var(--dsw-alias-state-error-primary, #c0392b); border-color: currentColor; }
.ae-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ae-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); }
.ae-tab { appearance: none; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 13px; padding: 8px 12px;
  color: var(--dsw-alias-label-secondary, #6b6b6b); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.ae-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #1f1f1f); border-bottom-color: var(--dsw-alias-brand-primary, #247bbf); font-weight: 600; }
.ae-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; align-items: start; }
.ae-card { border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.ae-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.ae-card-title { font-size: 13.5px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-card-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); line-height: 1.45; }
.ae-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ae-chip { appearance: none; cursor: pointer; font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background: transparent; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-chip[data-active="true"] { border-color: var(--dsw-alias-brand-primary, #247bbf); color: var(--dsw-alias-brand-primary, #247bbf);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #247bbf) 10%, transparent); font-weight: 600; }
.ae-input, .ae-textarea { font: inherit; font-size: 12.5px; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f); resize: vertical; }
.ae-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.5; }
.ae-textarea:focus, .ae-input:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #247bbf) 45%, transparent); outline-offset: 1px; }
.ae-field { display: flex; flex-direction: column; gap: 5px; }
.ae-label { font-size: 11.5px; font-weight: 600; letter-spacing: .2px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ae-btn { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 7px 14px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.18)); background: transparent; color: var(--dsw-alias-label-primary, #1f1f1f); }
.ae-btn:hover { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04)); }
.ae-btn[disabled] { opacity: .5; cursor: not-allowed; }
.ae-btn-primary { background: var(--dsw-alias-brand-primary, #247bbf); border-color: transparent; color: #fff; font-weight: 600; }
.ae-btn-primary:hover { filter: brightness(1.06); background: var(--dsw-alias-brand-primary, #247bbf); }
.ae-bar { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.08)); overflow: hidden; }
.ae-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary, #247bbf); transition: width .3s ease; }
.ae-steps { display: flex; flex-direction: column; gap: 6px; }
.ae-step { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px;
  padding: 6px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03)); }
.ae-step[data-status="done"] .ae-step-name { color: var(--dsw-alias-state-success-primary, #1a7f4b); }
.ae-step[data-status="running"] .ae-step-name { color: var(--dsw-alias-brand-primary, #247bbf); font-weight: 600; }
.ae-step[data-status="failed"] .ae-step-name { color: var(--dsw-alias-state-error-primary, #c0392b); }
.ae-step-meta { color: var(--dsw-alias-label-secondary, #6b6b6b); font-variant-numeric: tabular-nums; }
.ae-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.ae-metric { border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); border-radius: 10px; padding: 8px 10px; }
.ae-metric-k { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.ae-metric-v { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f1f1f); margin-top: 2px; }
.ae-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ae-table th, .ae-table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
.ae-table th { font-weight: 600; color: var(--dsw-alias-label-secondary, #6b6b6b); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.ae-table td { color: var(--dsw-alias-label-primary, #1f1f1f); font-variant-numeric: tabular-nums; }
.ae-pre { margin: 0; padding: 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1));
  background: var(--dsw-alias-bg-base, #fff); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-primary, #1f1f1f);
  max-height: 62vh; overflow: auto; }
.ae-error { font-size: 12px; padding: 8px 10px; border-radius: 8px; color: var(--dsw-alias-state-error-primary, #c0392b);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c0392b) 10%, transparent); }
.ae-empty { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b6b6b); padding: 18px 0; text-align: center; }
.ae-link { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-brand-primary, #247bbf);
  cursor: pointer; font: inherit; font-size: 12px; padding: 0; text-decoration: underline; }
`

    // ------------------------------------------------------------ 工具

    function readJson(text) {
      try {
        return { ok: true, value: JSON.parse(text) }
      } catch (error) {
        return { ok: false, error: error.message }
      }
    }

    async function api(path, options) {
      const response = await fetch(`${API}${path}`, options)
      const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      return data
    }

    function statusState(status) {
      if (status === 'running') return 'running'
      if (status === 'done') return 'done'
      if (status === 'failed' || status === 'cancelled') return 'failed'
      return 'idle'
    }

    function pct(value) {
      return `${(Number(value || 0) * 100).toFixed(1)}%`
    }

    // ------------------------------------------------------------ 侧栏图标

    function AutoEvalIcon(props) {
      const size = props.size || 20
      const active = props.active
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', {
        d: 'M3.4 4.6h17.2l-6.5 7.7v6.5l-4.2 2.3v-8.8z',
        fill: 'currentColor', opacity: active ? 0.95 : 0.7, stroke: 'none',
      }),
      h('circle', { cx: 18.2, cy: 18.1, r: 4.3, fill: 'var(--dsw-alias-bg-layer-1, #fff)', stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', {
        d: 'M16.1 18.1l1.5 1.5 2.6-2.8', stroke: 'currentColor', strokeWidth: 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    // ------------------------------------------------------------ 主面板

    function AutoEvalPanel(props) {
      const t = (props && props.t) || ((key) => key)

      const [state, setState] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [casesText, setCasesText] = React.useState(() => JSON.stringify(DEMO_CASES, null, 2))
      const [view, setView] = React.useState('run')
      const [report, setReport] = React.useState('')
      const [reportRun, setReportRun] = React.useState('')
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(async () => {
        try {
          const data = await api('/state')
          setState(data)
          setDraft((current) => current || defaultDraft(data))
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }, [])

      React.useEffect(() => {
        void load()
        const timer = setInterval(() => { void load() }, 1500)
        return () => clearInterval(timer)
      }, [load])

      const active = state && state.active
      const runs = (state && state.runs) || []

      function defaultDraft(data) {
        const template = (data.templates || []).find((item) => item.builtin) || (data.templates || [])[0]
        return {
          templateId: template ? template.id : 'custom',
          name: template ? template.name : 'AutoEval 运行',
          stages: cloneStages(template ? template.stages : {}, data.stages),
        }
      }

      function cloneStages(stages, catalog) {
        const out = {}
        for (const stage of catalog || []) {
          const chosen = (stages && stages[stage.id]) || {}
          const preset = stage.presets.find((item) => item.id === chosen.template) || stage.presets[0]
          out[stage.id] = {
            template: preset.id,
            config: { ...preset.config, ...(chosen.config || {}) },
            configText: JSON.stringify({ ...preset.config, ...(chosen.config || {}) }, null, 2),
          }
        }
        return out
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

      function pickPreset(stageId, presetId) {
        const stage = (state.stages || []).find((item) => item.id === stageId)
        const preset = stage && stage.presets.find((item) => item.id === presetId)
        setStage(stageId, {
          template: presetId,
          config: { ...(preset ? preset.config : {}) },
          configText: JSON.stringify(preset ? preset.config : {}, null, 2),
        })
      }

      function applyTemplate(templateId) {
        const template = (state.templates || []).find((item) => item.id === templateId)
        if (!template) return
        setDraft({
          templateId: template.id,
          name: template.name,
          stages: cloneStages(template.stages, state.stages),
        })
        setNotice('')
        setError('')
      }

      async function run() {
        setError('')
        setNotice('')
        let cases
        try {
          cases = JSON.parse(casesText)
        } catch (failure) {
          setError(`${t('error.cases')}：${failure.message}`)
          return
        }
        if (!Array.isArray(cases) || cases.length === 0) {
          setError(t('error.cases'))
          return
        }
        const stages = {}
        for (const stage of state.stages || []) {
          const entry = draft.stages[stage.id]
          let config = entry.config
          if (entry.configText !== undefined) {
            const parsed = readJson(entry.configText)
            if (!parsed.ok) {
              setError(`${stage.id} / ${t('error.params')}：${parsed.error}`)
              return
            }
            config = parsed.value
          }
          stages[stage.id] = { template: entry.template, config }
        }
        setBusy(true)
        try {
          const result = await api('/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: draft.name, templateId: draft.templateId, cases, stages }),
          })
          setNotice(`runId: ${result.runId}`)
          setView('run')
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
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      async function saveTemplate() {
        const id = window.prompt('模板 id（英文/数字/中划线）', `my-template-${Date.now().toString(36)}`)
        if (!id) return
        const stages = {}
        for (const stage of state.stages || []) {
          const entry = draft.stages[stage.id]
          const parsed = readJson(entry.configText || '{}')
          stages[stage.id] = { template: entry.template, config: parsed.ok ? parsed.value : entry.config }
        }
        try {
          await api('/templates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, name: draft.name, stages }),
          })
          setNotice(t('label.saved'))
          await load()
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }

      async function openReport(runId) {
        setReportRun(runId)
        setView('report')
        try {
          const data = await api(`/report?run=${encodeURIComponent(runId)}`)
          setReport(data.text)
        } catch (failure) {
          setReport('')
          setError(String(failure.message || failure))
        }
      }

      if (!state || !draft) {
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          h('div', { className: 'ae-empty' }, 'AutoEval …'))
      }

      const status = active ? active.status : (runs[0] ? runs[0].status : 'idle')
      const progress = active && active.progress

      const head = h('div', { className: 'ae-head' },
        h('div', null,
          h('h1', { className: 'ae-title' }, t('panel.title')),
          h('p', { className: 'ae-sub' }, t('panel.subtitle'))),
        h('div', { className: 'ae-pill', 'data-state': statusState(status) },
          h('i', { className: 'ae-dot' }),
          status === 'running' ? t('label.running') : status === 'done' ? t('label.done') : status === 'failed' ? t('label.failed') : t('label.idle')))

      const tabs = h('div', { className: 'ae-tabs' },
        ...['run', 'runs', 'report'].map((key) => h('button', {
          key, type: 'button', className: 'ae-tab', 'data-active': String(view === key),
          onClick: () => setView(key),
        }, t(`tab.${key}`))))

      const messages = h('div', null,
        error ? h('div', { className: 'ae-error' }, error) : null,
        notice && !error ? h('div', { className: 'ae-card-note' }, notice) : null)

      if (view === 'run') {
        const stageCards = (state.stages || []).map((stage, index) => {
          const entry = draft.stages[stage.id]
          const chips = stage.presets.map((preset) => h('button', {
            key: preset.id, type: 'button', className: 'ae-chip',
            'data-active': String(entry.template === preset.id),
            onClick: () => pickPreset(stage.id, preset.id),
          }, t(`preset.${stage.id}.${preset.id}`) || preset.id))
          return h('div', { className: 'ae-card', key: stage.id },
            h('div', { className: 'ae-card-head' },
              h('div', { className: 'ae-card-title' }, `${index + 1}. ${t(`stage.${stage.id}`)}`),
              h('div', { className: 'ae-card-note' }, entry.template)),
            h('div', { className: 'ae-card-note' }, t(`stage.hint.${stage.id}`)),
            h('div', { className: 'ae-chips' }, ...chips),
            entry.template === 'custom'
              ? h('div', { className: 'ae-field' },
                h('label', { className: 'ae-label' }, t('field.command')),
                h('input', {
                  className: 'ae-input', type: 'text', spellCheck: false,
                  value: entry.config.command || '',
                  placeholder: 'python3 ./my-judge.py',
                  onChange: (event) => {
                    const config = { ...entry.config, command: event.target.value }
                    setStage(stage.id, { config, configText: JSON.stringify(config, null, 2) })
                  },
                }))
              : null,
            h('details', null,
              h('summary', { className: 'ae-card-note', style: { cursor: 'pointer' } }, t('field.params')),
              h('textarea', {
                className: 'ae-textarea', rows: 6, spellCheck: false, value: entry.configText,
                onChange: (event) => setStage(stage.id, { configText: event.target.value }),
              })))
        })

        const metrics = (active && active.metrics) || (runs[0] && runs[0].metrics)

        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, tabs, messages,
          h('div', { className: 'ae-cols' },
            h('div', { className: 'ae-card' },
              h('div', { className: 'ae-field' },
                h('label', { className: 'ae-label' }, t('field.template')),
                h('div', { className: 'ae-chips' },
                  ...(state.templates || []).map((template) => h('button', {
                    key: template.id, type: 'button', className: 'ae-chip',
                    'data-active': String(draft.templateId === template.id),
                    onClick: () => applyTemplate(template.id),
                  }, template.name)))),
              ...stageCards),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
              h('div', { className: 'ae-card' },
                h('div', { className: 'ae-field' },
                  h('label', { className: 'ae-label' }, t('field.cases')),
                  h('textarea', {
                    className: 'ae-textarea', rows: 12, spellCheck: false, value: casesText,
                    onChange: (event) => setCasesText(event.target.value),
                  })),
                h('div', { className: 'ae-actions' },
                  h('button', {
                    type: 'button', className: 'ae-btn ae-btn-primary',
                    disabled: busy || Boolean(active), onClick: () => { void run() },
                  }, t('action.run')),
                  h('button', {
                    type: 'button', className: 'ae-btn', disabled: !active, onClick: () => { void cancel() },
                  }, t('action.cancel')),
                  h('button', { type: 'button', className: 'ae-btn', onClick: () => { void saveTemplate() } }, t('action.save')))),
              active || progress
                ? h('div', { className: 'ae-card' },
                  h('div', { className: 'ae-card-title' }, `${t('label.running')} · ${active ? active.name : ''}`),
                  h('div', { className: 'ae-bar' },
                    h('i', {
                      style: {
                        width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 4}%`,
                      },
                    })),
                  h('div', { className: 'ae-steps' },
                    ...Object.entries((active && active.stages) || {}).map(([key, value]) => h('div', {
                      key, className: 'ae-step', 'data-status': value.status,
                    },
                    h('span', { className: 'ae-step-name' }, t(`stage.${key}`)),
                    h('span', { className: 'ae-step-meta' },
                      `${t(`label.${value.status}`)}${value.durationMs == null ? '' : ` · ${value.durationMs}ms`}`)))))
                : null,
              metrics
                ? h('div', { className: 'ae-card' },
                  h('div', { className: 'ae-card-title' },
                    active ? `${t('label.lastRun')}` : (runs[0] && runs[0].name ? runs[0].name : draft.name)),
                  h('div', { className: 'ae-metrics' },
                    h('div', { className: 'ae-metric' },
                      h('div', { className: 'ae-metric-k' }, t('label.passRate')),
                      h('div', { className: 'ae-metric-v' }, pct(metrics.passRate))),
                    h('div', { className: 'ae-metric' },
                      h('div', { className: 'ae-metric-k' }, `${metrics.passed}/${metrics.scored}`),
                      h('div', { className: 'ae-metric-v' }, String(metrics.total))),
                    h('div', { className: 'ae-metric' },
                      h('div', { className: 'ae-metric-k' }, 'coverage'),
                      h('div', { className: 'ae-metric-v' }, pct(metrics.avgCoverage))),
                    h('div', { className: 'ae-metric' },
                      h('div', { className: 'ae-metric-k' }, t('label.p50')),
                      h('div', { className: 'ae-metric-v' }, `${metrics.latency ? metrics.latency.p50Ms : 0}ms`))),
                  runs[0]
                    ? h('button', { type: 'button', className: 'ae-link', onClick: () => { void openReport(runs[0].id) } }, t('action.view'))
                    : null)
                : null)))
      }

      if (view === 'runs') {
        const rows = runs.map((item) => h('tr', { key: item.id },
          h('td', null, item.name),
          h('td', null, (item.startedAt || '').replace('T', ' ').slice(0, 19)),
          h('td', null, t(`label.${item.status}`)),
          h('td', null, item.metrics ? pct(item.metrics.passRate) : '-'),
          h('td', null, item.metrics ? `${item.metrics.passed}/${item.metrics.scored}` : '-'),
          h('td', null, item.metrics && item.metrics.latency ? `${item.metrics.latency.p50Ms}ms` : '-'),
          h('td', null, h('button', {
            type: 'button', className: 'ae-link', onClick: () => { void openReport(item.id) },
          }, t('action.view')))))
        return h('div', { className: 'ae-page' },
          h('style', null, STYLE),
          head, tabs, messages,
          h('div', { className: 'ae-card' },
            runs.length === 0
              ? h('div', { className: 'ae-empty' }, t('label.noRuns'))
              : h('table', { className: 'ae-table' },
                h('thead', null, h('tr', null,
                  ...['name', 'time', 'status', t('label.passRate'), t('label.cases'), t('label.p50'), ''].map((label, index) =>
                    h('th', { key: index }, label)))),
                h('tbody', null, ...rows))))
      }

      return h('div', { className: 'ae-page' },
        h('style', null, STYLE),
        head, tabs, messages,
        h('div', { className: 'ae-card' },
          h('div', { className: 'ae-card-head' },
            h('div', { className: 'ae-card-title' }, reportRun || t('tab.report')),
            h('div', { className: 'ae-actions' },
              h('button', {
                type: 'button', className: 'ae-btn', disabled: !reportRun,
                onClick: () => { void openReport(reportRun) },
              }, t('action.refresh')))),
          report
            ? h('pre', { className: 'ae-pre' }, report)
            : h('div', { className: 'ae-empty' }, t('label.noReport'))))
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
