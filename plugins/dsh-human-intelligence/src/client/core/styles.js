const BASE_CSS = `
.hi-root {
  --hi-radius: 13px;
  --hi-rail-width: 264px;
  width: 100%;
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
.hi-root *, .hi-root *::before, .hi-root *::after { box-sizing: border-box; }
.hi-root button, .hi-root input, .hi-root textarea, .hi-root select { font: inherit; }
.hi-root a { color: inherit; text-decoration: none; }
.hi-icon { display: block; flex: 0 0 auto; }
.hi-nav-icon { display: block; }

/* ── top bar ─────────────────────────────────────────────── */
.hi-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 64px;
  padding: 11px 24px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.hi-brand { display: flex; align-items: center; gap: 10px; min-width: 220px; }
.hi-brandmark { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 auto; }
.hi-brandcopy { display: flex; flex-direction: column; gap: 0; }
.hi-brandcopy strong { font-size: 15px; letter-spacing: .01em; }
.hi-brandcopy span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-top-search { position: relative; flex: 1 1 260px; max-width: 400px; }
.hi-top-search .hi-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-secondary); pointer-events: none; }
.hi-top-search .hi-input { padding-left: 32px; height: 32px; }
.hi-top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.hi-language-select { height: 28px; padding: 0 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
.hi-language-select:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.hi-top-tabs { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); flex: 0 1 auto; min-width: 0; overflow: auto; }
.hi-top-tab { appearance: none; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 550; white-space: nowrap; transition: background .15s ease, color .15s ease, border-color .15s ease; }
.hi-top-tab:hover { color: var(--dsw-alias-label-primary); }
.hi-top-tab.is-active { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l1); box-shadow: 0 1px 3px rgba(15, 23, 42, .10); }
.hi-top-tab .hi-icon { color: var(--dsw-alias-label-secondary); }
.hi-top-tab.is-active .hi-icon { color: var(--dsw-alias-brand-primary); }
.hi-top-tab-count { font-size: 10px; line-height: 1; padding: 2px 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.hi-top-tab.is-active .hi-top-tab-count { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); color: var(--dsw-alias-brand-primary); }

/* ── page shell ──────────────────────────────────────────── */
.hi-main { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.hi-page { width: 100%; max-width: none; margin: 0; padding: 26px 28px 48px; min-height: 100%; display: flex; flex-direction: column; flex: 1 1 auto; }
.hi-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.hi-kicker { display: block; margin-bottom: 5px; font-size: 10px; font-weight: 750; letter-spacing: .16em; color: var(--dsw-alias-brand-primary); text-transform: uppercase; }
.hi-pagehead h1 { margin: 0; font-size: 26px; line-height: 1.2; letter-spacing: -.02em; }
.hi-pagehead p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; max-width: 720px; }
.hi-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 22px; }
.hi-stat { display: flex; align-items: center; gap: 11px; padding: 13px 15px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: var(--hi-radius); }
.hi-stat-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.hi-stat.is-complete .hi-stat-icon { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent); color: var(--dsw-alias-state-success-primary); }
.hi-stat.is-rate .hi-stat-icon { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); color: var(--dsw-alias-state-warn-primary); }
.hi-stat.is-items .hi-stat-icon { background: color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent); color: var(--dsw-alias-label-secondary); }
.hi-stat div { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.hi-stat strong { font-size: 19px; line-height: 1.15; font-variant-numeric: tabular-nums; }
.hi-stat span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-section { margin-top: 26px; }
.hi-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.hi-section-head h2 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
.hi-section-head p { margin: 3px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.hi-task-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.hi-task-tile { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--hi-radius); background: var(--dsw-alias-bg-layer-1); transition: border-color .15s ease, background .15s ease; }
.hi-task-tile:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.hi-task-tile-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.hi-task-tile-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: 0 0 auto; border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); }
.hi-task-tile-copy { min-width: 0; }
.hi-task-tile-copy h3 { margin: 0; font-size: 13.5px; letter-spacing: -.005em; }
.hi-task-tile-copy p { margin: 3px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hi-task-tile-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; }
.hi-task-tile-count { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }

/* ── annotation tools ───────────────────────────────────── */
.hi-tool-group { margin-top: 14px; }
.hi-tool-group-head { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-tool-group-head strong { font-size: 12px; color: var(--dsw-alias-label-primary); font-weight: 600; }
.hi-tool-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.hi-tool-card { display: flex; flex-direction: column; gap: 10px; padding: 13px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--hi-radius); background: var(--dsw-alias-bg-layer-1); transition: border-color .15s ease, background .15s ease; }
.hi-tool-card:hover { border-color: var(--dsw-alias-border-l2); }
.hi-tool-head { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
.hi-tool-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); }
.hi-tool-copy { min-width: 0; flex: 1 1 auto; }
.hi-tool-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.hi-tool-title strong { font-size: 12.5px; line-height: 1.35; overflow-wrap: anywhere; }
.hi-tool-copy p { margin: 3px 0 0; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hi-tool-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.hi-tool-chip { display: inline-flex; align-items: center; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); font-size: 9.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.hi-tool-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 2px; }
.hi-tool-count { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.hi-tool-actions { display: flex; align-items: center; gap: 3px; }
.hi-tool-actions .hi-btn { padding: 4px 8px; font-size: 11px; }
.hi-tool-pick-group { margin-bottom: 14px; }
.hi-tool-pick-search { position: relative; margin-bottom: 14px; }
.hi-tool-pick-search .hi-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-secondary); pointer-events: none; }
.hi-tool-pick-search .hi-input { padding-left: 31px; height: 32px; }
.hi-tool-pick-group:last-child { margin-bottom: 0; }
.hi-tool-pick-list { display: flex; flex-direction: column; gap: 5px; }
.hi-tool-pick { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; }
.hi-tool-pick:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.hi-tool-pick-main { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.hi-tool-pick-main strong { font-size: 12.5px; }
.hi-tool-pick-main > span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.hi-tool-pick-main .hi-tool-chips { margin-top: 3px; }
.hi-tool-pick-count { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; flex: 0 0 auto; }
.hi-tool-summary { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.hi-tool-summary-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 auto; }
.hi-tool-summary-copy p { margin: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }

/* ── datasets ───────────────────────────────────────────── */
.hi-backlink { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; gap: 4px; padding: 0; margin-bottom: 5px; font-size: 11px; cursor: pointer; text-transform: capitalize; }
.hi-backlink:hover { color: var(--dsw-alias-label-primary); }
.hi-dataset-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hi-dataset-description { margin: 0 0 4px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.hi-dataset-items { display: flex; flex-direction: column; gap: 6px; }
.hi-dataset-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); }
.hi-dataset-index { width: 22px; flex: 0 0 auto; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 10px; font-variant-numeric: tabular-nums; }
.hi-dataset-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.hi-dataset-item-main strong { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hi-dataset-item-main span { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── modality cards ──────────────────────────────────────── */
.hi-modality-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hi-modality-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--hi-radius);
  transition: border-color .15s ease, background .15s ease;
}
.hi-modality-card.is-active { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, var(--dsw-alias-bg-layer-1)); }
.hi-modality-head { display: flex; align-items: center; gap: 9px; }
.hi-modality-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); }
.hi-modality-head strong { font-size: 14px; }
.hi-modality-head span { margin-left: auto; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.hi-modality-desc { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); min-height: 34px; }
.hi-task-list { display: flex; flex-direction: column; gap: 4px; }
.hi-task-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
}
.hi-task-chip:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.hi-task-chip .hi-icon { color: var(--dsw-alias-label-secondary); }
.hi-task-chip strong { font-weight: 550; color: var(--dsw-alias-label-primary); font-size: 12px; }
.hi-task-chip em { margin-left: auto; font-style: normal; color: var(--dsw-alias-brand-primary); opacity: 0; font-size: 11px; }
.hi-task-chip:hover em { opacity: 1; }

/* ── toolbar and project list ────────────────────────────── */
.hi-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 22px 0 12px; }
.hi-segmented { display: flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 9px; overflow: auto; }
.hi-segment { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 5px 10px; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.hi-segment:hover { color: var(--dsw-alias-label-primary); }
.hi-segment.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); color: var(--dsw-alias-brand-primary); font-weight: 600; }
.hi-toolbar-count { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.hi-project-list { display: flex; flex-direction: column; gap: 8px; }
.hi-project-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 15px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 11px;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.hi-project-row:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.hi-project-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.hi-project-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.hi-project-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.hi-project-name { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hi-project-meta { display: grid; grid-template-columns: 110px 150px minmax(0, 1fr); align-items: center; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-project-desc { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-project-progress { display: grid; grid-template-columns: minmax(0, 1fr) 54px; align-items: center; gap: 8px; width: 220px; flex: 0 0 auto; }
.hi-project-progress .hi-progress-wrap { width: 100%; }
.hi-project-progress span { font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.hi-project-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.hi-project-actions .hi-btn { padding: 5px 9px; font-size: 11.5px; }

/* ── controls ────────────────────────────────────────────── */
.hi-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 560; line-height: 1.25; cursor: pointer; white-space: nowrap; transition: background .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease; text-transform: capitalize; }
.hi-btn:disabled { opacity: .55; cursor: not-allowed; }
.hi-btn-sm { padding: 5px 9px; font-size: 11.5px; border-radius: 7px; }
.hi-btn-primary { background: var(--dsw-alias-brand-primary); color: #fff; }
.hi-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, #000); }
.hi-btn-secondary { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.hi-btn-secondary:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.hi-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary); }
.hi-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.hi-btn-danger { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 25%, transparent); color: var(--dsw-alias-state-error-primary); }
.hi-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent); }
.hi-iconbtn { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; transition: background .15s ease, color .15s ease; }
.hi-iconbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.hi-iconbtn:disabled { opacity: .35; cursor: not-allowed; }
.hi-danger-hover:hover:not(:disabled) { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.hi-input, .hi-select, .hi-textarea {
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
.hi-input { height: 34px; }
.hi-select { appearance: auto; height: 34px; }
.hi-multiselect { position: relative; width: 100%; }
.hi-multiselect-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; height: 34px; padding: 0 10px; font: inherit; text-align: left; cursor: pointer; appearance: none; }
.hi-multiselect-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-multiselect-text.is-placeholder { color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.hi-multiselect-menu { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 60; max-height: 220px; overflow: auto; padding: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 12px 30px rgba(8, 15, 30, .18); }
.hi-multiselect-option { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px; color: var(--dsw-alias-label-primary); cursor: pointer; }
.hi-multiselect-option:hover { background: var(--dsw-alias-bg-layer-2); }
.hi-multiselect-option.is-selected { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
.hi-multiselect-option input { width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.hi-textarea { resize: vertical; min-height: 66px; }
.hi-input::placeholder, .hi-textarea::placeholder { color: color-mix(in srgb, var(--dsw-alias-label-secondary) 68%, transparent); }
.hi-input:focus, .hi-select:focus, .hi-textarea:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent); }
.hi-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hi-field-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); display: inline-flex; gap: 3px; }
.hi-required { color: var(--dsw-alias-state-error-primary); }
.hi-field-hint { font-size: 10.5px; color: var(--dsw-alias-label-secondary); line-height: 1.45; }
.hi-form { display: flex; flex-direction: column; gap: 16px; }
.hi-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 15px; }
.hi-span-2 { grid-column: span 2; }
.hi-form-error { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); color: var(--dsw-alias-state-error-primary); border-radius: 8px; font-size: 12px; }
.hi-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 550; line-height: 1.7; white-space: nowrap; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); border: 1px solid transparent; }
.hi-badge-brand { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); }
.hi-badge-success { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 11%, transparent); color: var(--dsw-alias-state-success-primary); }
.hi-badge-warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); color: var(--dsw-alias-state-warn-primary); }
.hi-badge-error { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); color: var(--dsw-alias-state-error-primary); }
.hi-progress-wrap { display: flex; align-items: center; gap: 4px; min-width: 0; }
.hi-progress { flex: 1 1 auto; min-width: 0; position: relative; height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.hi-progress-fill { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-success-primary); transition: width .25s ease; }
.hi-loading { display: inline-flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.hi-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 28%, transparent); border-top-color: var(--dsw-alias-brand-primary); animation: hi-spin .8s linear infinite; }
.hi-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 40px 20px; text-align: center; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--hi-radius); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); }
.hi-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 11px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); margin-bottom: 2px; }
.hi-empty h3 { margin: 0; font-size: 14px; }
.hi-empty p { margin: 0; max-width: 440px; font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.55; }
.hi-empty .hi-btn { margin-top: 6px; }

/* ── modal ───────────────────────────────────────────────── */
.hi-modal-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 22px; background: color-mix(in srgb, #0b1220 46%, transparent); backdrop-filter: blur(2px); animation: hi-fade .16s ease-out; }
.hi-modal { display: flex; flex-direction: column; width: 100%; max-width: 620px; max-height: 88vh; border: 1px solid var(--dsw-alias-border-l1); border-radius: 15px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 24px 60px rgba(8, 15, 30, .32); animation: hi-rise .18s ease-out; overflow: hidden; }
.hi-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 17px 20px 13px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.hi-modal-head h2 { margin: 0; font-size: 16px; }
.hi-modal-head p { margin: 3px 0 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.hi-modal-body { padding: 18px 20px; overflow: auto; }
.hi-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 50%, transparent); }
.hi-modal-foot .hi-btn-primary { min-width: 96px; }
.hi-confirm-body { margin: 0; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }

/* ── create form ─────────────────────────────────────────── */
.hi-choice-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.hi-choice { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); cursor: pointer; text-align: left; }
.hi-choice:hover { border-color: var(--dsw-alias-border-l2); }
.hi-choice.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); }
.hi-choice strong { font-size: 12.5px; }
.hi-choice span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.hi-task-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.hi-task-choice { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); cursor: pointer; text-align: left; }
.hi-task-choice:hover { border-color: var(--dsw-alias-border-l2); }
.hi-task-choice.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-base)); }
.hi-task-choice .hi-icon { margin-top: 2px; color: var(--dsw-alias-brand-primary); }
.hi-task-choice div { display: flex; flex-direction: column; gap: 2px; }
.hi-task-choice strong { font-size: 12px; }
.hi-task-choice span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); line-height: 1.4; }
.hi-option-tags { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }

/* ── annotator ───────────────────────────────────────────── */
.hi-annotator { flex: 1 1 auto; width: 100%; display: flex; flex-direction: column; min-height: 0; background: var(--dsw-alias-bg-base); }
.hi-annotator-head { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.hi-annotator-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hi-annotator-title strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
.hi-annotator-title span { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.hi-annotator-progress { margin-left: auto; display: flex; align-items: center; gap: 9px; }
.hi-annotator-progress .hi-progress-wrap { width: var(--hi-progress-slot, 150px); }
.hi-progress-boundary { --hi-progress-slot: 150px; display: grid; grid-template-columns: var(--hi-progress-slot) 32px; align-items: center; gap: 6px; }
.hi-progress-percent { font-size: 9px; line-height: 1; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; text-align: right; }
.hi-annotator-progress span { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.hi-annotator-actions { display: flex; align-items: center; gap: 5px; }
.hi-annotator-body { flex: 1 1 auto; display: flex; min-height: 0; }
.hi-splitter { flex: 0 0 7px; width: 7px; display: flex; align-items: center; justify-content: center; cursor: col-resize; touch-action: none; position: relative; background: transparent; }
.hi-splitter::before { content: ''; width: 1px; height: 100%; background: var(--dsw-alias-border-l1); transition: background .12s ease, width .12s ease; }
.hi-splitter:hover::before, .hi-splitter.is-active::before { width: 2px; background: var(--dsw-alias-brand-primary); }
.hi-splitter-grip { position: absolute; width: 3px; height: 28px; border-radius: 2px; background: var(--dsw-alias-border-l2); opacity: 0; transition: opacity .12s ease; }
.hi-splitter:hover .hi-splitter-grip, .hi-splitter.is-active .hi-splitter-grip { opacity: 1; }
.hi-annotator-body.is-resizing { cursor: col-resize; user-select: none; }
.hi-annotator-body.is-resizing * { cursor: col-resize !important; user-select: none !important; }
.hi-rail { width: var(--hi-rail-width); flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; background: var(--dsw-alias-bg-layer-1); }
.hi-rail-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 11px; font-weight: 650; color: var(--dsw-alias-label-secondary); letter-spacing: .02em; }
.hi-rail-tools { flex: 0 0 auto; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.hi-rail-search-row { display: flex; flex-wrap: wrap; gap: 6px; }
.hi-rail-search { flex: 1 1 100px; min-width: 0; height: 28px; font-size: 11px; padding: 0 8px; }
.hi-rail-sort { flex: 0 0 96px; width: 96px; height: 28px; font-size: 10.5px; padding: 0 4px; }
.hi-rail-filters { width: 100%; }
.hi-rail-filters .hi-segment { flex: 1 1 0; padding: 4px 2px; font-size: 10.5px; }
.hi-rail-empty .hi-backlink { margin: 4px 0 0; }
.hi-rail-list { flex: 1 1 auto; overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.hi-rail-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; text-align: left; font-size: 12px; }
.hi-rail-item:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.hi-rail-item.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); color: var(--dsw-alias-label-primary); }
.hi-rail-index { width: 18px; flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; text-align: right; }
.hi-rail-name { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.hi-rail-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hi-rail-meta { font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hi-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-border-l2); }
.hi-status-dot.is-done { background: var(--dsw-alias-state-success-primary); }
.hi-status-dot.is-skipped { background: var(--dsw-alias-state-warn-primary); }
.hi-status-dot.is-draft { background: var(--dsw-alias-brand-primary); }
.hi-rail-empty { padding: 16px 12px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); text-align: center; }
.hi-editor { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.hi-editor-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.hi-editor-inner { width: 100%; max-width: none; margin: 0; padding: 20px 24px 34px; min-height: 100%; display: flex; flex-direction: column; }
.hi-editor-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.hi-editor-head h2 { margin: 0; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
.hi-editor-head p { margin: 4px 0 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.hi-editor-index { font-size: 10.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.hi-editor-foot { flex: 0 0 auto; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 18px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.hi-save-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); margin-right: auto; }
.hi-save-status.is-error { color: var(--dsw-alias-state-error-primary); }
.hi-save-status.is-saved { color: var(--dsw-alias-state-success-primary); }

/* ── task surfaces ───────────────────────────────────────── */
.hi-tool-surface { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 2px rgba(15, 23, 42, .06); }
.hi-tool-surface > .hi-task { flex: 1 1 auto; min-height: 0; }
.hi-task { display: flex; flex-direction: column; flex: 1 1 auto; gap: 16px; min-height: 0; width: 100%; }
.hi-task-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 12px; padding: 16px; }
.hi-task-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.hi-task-card-head h3 { margin: 0; font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-secondary); letter-spacing: .02em; }
.hi-task-note { margin: 0 0 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.55; }
.hi-task-instruction { border-left: 3px solid var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); padding: 9px 12px; border-radius: 0 8px 8px 0; font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; }
.hi-text-item { padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font-size: 15px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.hi-label-grid { display: flex; flex-wrap: wrap; gap: 7px; }
.hi-label { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; transition: border-color .12s ease, background .12s ease, color .12s ease; }
.hi-label:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.hi-label.is-selected { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); font-weight: 600; }
.hi-label .hi-label-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .8; }
.hi-entity-mark { padding: 1px 2px; border-radius: 3px; border-bottom: 2px solid; cursor: pointer; }
.hi-entity-tone-0 { background: color-mix(in srgb, #6366f1 18%, transparent); border-color: #6366f1; }
.hi-entity-tone-1 { background: color-mix(in srgb, #14b8a6 18%, transparent); border-color: #14b8a6; }
.hi-entity-tone-2 { background: color-mix(in srgb, #f59e0b 20%, transparent); border-color: #f59e0b; }
.hi-entity-tone-3 { background: color-mix(in srgb, #ec4899 17%, transparent); border-color: #ec4899; }
.hi-entity-tone-4 { background: color-mix(in srgb, #0ea5e9 18%, transparent); border-color: #0ea5e9; }
.hi-entity-tone-5 { background: color-mix(in srgb, #22c55e 18%, transparent); border-color: #22c55e; }
.hi-entity-select-hint { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); margin: 8px 0 0; }
.hi-entity-palette { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.hi-palette-title { width: 100%; font-size: 10.5px; font-weight: 650; letter-spacing: .03em; color: var(--dsw-alias-label-secondary); margin-bottom: 1px; }
.hi-entity-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-base); font-size: 12px; }
.hi-entity-row .hi-entity-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-entity-row .hi-select { width: 108px; height: 27px; padding: 2px 6px; font-size: 11px; }
.hi-entity-list { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
.hi-media-frame { position: relative; display: inline-block; max-width: 100%; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: #0b1220; }
.hi-media-frame img { display: block; max-width: 100%; max-height: 58vh; object-fit: contain; border-radius: 9px; }
.hi-media-frame video { display: block; width: 100%; max-height: 58vh; background: #000; border-radius: 9px; }
.hi-bbox-layer { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
.hi-bbox { position: absolute; border: 2px solid #f59e0b; background: rgba(245, 158, 11, .16); border-radius: 2px; cursor: pointer; }
.hi-bbox.is-selected { border-color: #22d3ee; background: rgba(34, 211, 238, .18); box-shadow: 0 0 0 1px rgba(34, 211, 238, .5); }
.hi-bbox.is-draft { border-style: dashed; pointer-events: none; }
.hi-bbox-chip { position: absolute; left: -2px; top: -19px; max-width: 160px; padding: 1px 5px; border-radius: 4px; background: #f59e0b; color: #111827; font-size: 10px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hi-bbox.is-selected .hi-bbox-chip { background: #22d3ee; }
.hi-bbox-help { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-video-time { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.hi-timeline { position: relative; height: 44px; margin: 12px 0 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; cursor: pointer; }
.hi-timeline-segment { position: absolute; top: 6px; bottom: 6px; min-width: 3px; border-radius: 5px; background: color-mix(in srgb, #14b8a6 65%, transparent); border: 1px solid color-mix(in srgb, #0f766e 70%, transparent); color: #042f2e; font-size: 9px; font-weight: 650; display: flex; align-items: center; padding: 0 4px; overflow: hidden; white-space: nowrap; }
.hi-timeline-playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #f97316; pointer-events: none; }
.hi-timeline-in { position: absolute; top: 0; bottom: 0; width: 2px; background: #38bdf8; pointer-events: none; }
.hi-timeline-in::before { content: ''; position: absolute; top: 0; left: -3px; border: 4px solid transparent; border-top-color: #38bdf8; }
.hi-segment-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); font-size: 12px; }
.hi-segment-row .hi-segment-range { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.hi-segment-row .hi-select { width: 120px; height: 28px; padding: 2px 6px; font-size: 11px; }
.hi-segment-list { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
.hi-rating-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi-rating-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 14px; font-weight: 600; cursor: pointer; }
.hi-rating-btn:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.hi-rating-btn.is-selected { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
.hi-rating-note { margin-top: 10px; }
.hi-file-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 26px 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-base); text-align: center; }
.hi-file-drop .hi-icon { color: var(--dsw-alias-brand-primary); }
.hi-file-drop strong { font-size: 13px; }
.hi-file-drop span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.hi-file-list { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.hi-file-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 7px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); }
.hi-file-row.is-error { color: var(--dsw-alias-state-error-primary); }
.hi-toasts { position: fixed; right: 20px; bottom: 20px; z-index: 1400; display: flex; flex-direction: column; gap: 7px; max-width: 380px; pointer-events: none; }
.hi-toast { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 10px 30px rgba(15, 23, 42, .2); font-size: 11.5px; animation: hi-toast-in .18s ease-out; }
.hi-toast.is-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-state-error-primary); }
.hi-toast.is-success .hi-icon { color: var(--dsw-alias-state-success-primary); }
.hi-root-loading { align-items: center; justify-content: center; }
.hi-load-error { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 420px; text-align: center; color: var(--dsw-alias-label-secondary); }
.hi-load-error h2 { margin: 0; font-size: 16px; color: var(--dsw-alias-label-primary); }
.hi-load-error p { margin: 0 0 8px; font-size: 12px; overflow-wrap: anywhere; }

@keyframes hi-spin { to { transform: rotate(360deg); } }
@keyframes hi-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes hi-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes hi-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 980px) {
  .hi-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hi-modality-grid { grid-template-columns: minmax(0, 1fr); }
  .hi-modality-desc { min-height: 0; }
  .hi-project-progress { width: 150px; }
  .hi-progress-boundary { --hi-progress-slot: 100px; }
  .hi-tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hi-brand { min-width: 0; }
  .hi-brandcopy span { display: none; }
  .hi-annotator-head { gap: 8px; }
  .hi-annotator-progress .hi-progress-wrap { width: 100px; }
}
@media (max-width: 760px) {
  .hi-page { width: 100%; padding: 18px 14px 36px; }
  .hi-topbar { flex-wrap: wrap; padding: 10px 14px; }
  .hi-top-search { order: 3; flex-basis: 100%; max-width: none; }
  .hi-pagehead { flex-direction: column; align-items: flex-start; gap: 12px; }
  .hi-project-row { flex-wrap: wrap; }
  .hi-project-progress { width: 100%; }
  .hi-project-meta { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .hi-project-actions { margin-left: auto; }
  .hi-root { --hi-rail-width: 184px; }
  .hi-rail-item { padding: 6px 5px; font-size: 11px; }
  .hi-top-tabs { order: 2; width: 100%; }
  .hi-task-grid { grid-template-columns: minmax(0, 1fr); }
  .hi-tool-grid { grid-template-columns: minmax(0, 1fr); }
  .hi-editor-inner { padding: 14px 14px 28px; }
  .hi-annotator-actions .hi-btn span { display: none; }
  .hi-choice-grid, .hi-task-choice-grid, .hi-form-grid { grid-template-columns: minmax(0, 1fr); }
  .hi-span-2 { grid-column: auto; }
  .hi-modal-backdrop { padding: 8px; }
  .hi-modal { max-height: 94vh; }
}
`;
