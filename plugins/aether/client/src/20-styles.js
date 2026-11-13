    // ---------------------------------------------------------- 样式

    const STYLE = `
.ath-root {
  --ath-accent: #64748b;
  --ath-accent-strong: #475569;
  --ath-accent-soft: rgba(100, 116, 139, 0.10);
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
  --ath-dataset-ink: #1e3a8a;
  --ath-dataset: #1d4ed8;
  --ath-dataset-40: rgba(29, 78, 216, 0.4);
  --ath-edge: color-mix(in srgb, var(--dsw-alias-border-l2) 72%, transparent);
  --ath-border-soft: color-mix(in srgb, var(--dsw-alias-border-l1) 82%, transparent);
  --ath-shadow-soft: 0 2px 10px rgba(32, 43, 61, .05);
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
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.ath-logo-svg { display: block; border-radius: 9px; }
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
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
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
  padding: 6px 8px; border: 1px solid var(--ath-border-soft);
  border-radius: 8px; background: var(--dsw-alias-bg-layer-1);
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
.ath-btn-primary:hover { background: var(--ath-accent-strong); filter: none; }
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
.ath-badge[data-kind="command"] { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); }
.ath-badge[data-kind="graph"] { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); }
.ath-badge[data-kind="dataset"] { color: var(--ath-dataset); border-color: color-mix(in srgb, var(--ath-dataset) 32%, transparent); }
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
.ath-card.ath-form { margin: 0; min-width: 0; }
.ath-form[disabled] button { display: none; }
.ath-form[disabled] input:not([type="checkbox"]):not([type="file"]),
.ath-form[disabled] textarea,
.ath-form[disabled] select {
  color: var(--dsw-alias-label-primary);
  -webkit-text-fill-color: var(--dsw-alias-label-primary);
  opacity: 1;
  background: var(--dsw-alias-bg-layer-2);
  cursor: default;
}
.ath-form[disabled] input[type="checkbox"] { cursor: default; }
.ath-field { display: flex; flex-direction: column; gap: 5px; }
.ath-field + .ath-field { margin-top: 12px; }
.ath-label { font-size: 11.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); letter-spacing: .01em; }
.ath-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.ath-input, .ath-select, .ath-textarea {
  width: 100%; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  border-radius: 8px; padding: 7px 9px; font-size: 12.5px;
}
.ath-input:focus, .ath-select:focus, .ath-textarea:focus { outline: 2px solid rgba(100, 116, 139, .22); outline-offset: -1px; border-color: #94a3b8; }
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
.ath-run-item[data-active="true"] { background: var(--dsw-alias-bg-layer-2); box-shadow: inset 2px 0 0 #94a3b8; }
.ath-run-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; min-width: 0; }
.ath-run-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-run-meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.ath-progress { height: 4px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.ath-progress > i { display: block; height: 100%; background: #64748b; transition: width .3s ease; }
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
.ath-node-info { position: absolute; display: flex; flex-direction: column; overflow: hidden; pointer-events: none; }
.ath-node-id { font-size: 8.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-node-kv { font-size: 8.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-resize-handle {
  position: absolute; z-index: 4; width: 9px; height: 9px; border-radius: 2px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid #64748b;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .12);
}
.ath-resize-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.ath-resize-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.ath-resize-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.ath-resize-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.ath-param-chip { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 1px 5px; }
.ath-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ath-module-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; }
.ath-module-toolbar .ath-input { max-width: 340px; }
.ath-version-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ath-check { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dsw-alias-label-primary); cursor: pointer; }
.ath-check input { accent-color: var(--ath-accent); }
.ath-chip-radio { display: inline-flex; align-items: center; gap: 5px; position: relative; }
.ath-chip-radio:focus-within { outline: 2px solid rgba(100, 116, 139, .22); outline-offset: 1px; }
.ath-radio-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ath-type-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ath-type-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left;
  padding: 12px; border: 1px solid var(--ath-border-soft); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); color: inherit; cursor: pointer;
}
.ath-type-card:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.ath-type-title { font-size: 13px; }
.ath-type-action { margin-top: 6px; font-size: 11px; color: var(--ath-accent); font-weight: 600; }
.ath-module-card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; background: var(--dsw-alias-bg-layer-1); padding: 13px 14px; }
.ath-module-card:hover { border-color: var(--dsw-alias-border-l2); }
.ath-module-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ath-module-name { min-width: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-module-version { margin-left: auto; flex: 0 0 auto; }
.ath-module-desc { font-size: 11.5px; color: var(--dsw-alias-label-secondary); min-height: 34px; overflow-wrap: anywhere; }
.ath-graph-card { width: 100%; text-align: left; color: inherit; cursor: pointer; appearance: none; }
.ath-graph-card:hover { background: var(--dsw-alias-bg-layer-2); }
.ath-graph-card:focus-visible { outline: 2px solid rgba(100, 116, 139, .28); outline-offset: 1px; }
.ath-graph-id, .ath-module-id { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
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
  border: 1px solid #94a3b8; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1); color: inherit; cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .06);
}
.ath-canvas-node:hover { border-color: #64748b; }
.ath-canvas-node[data-kind="dataset"] {
  border-color: color-mix(in srgb, var(--ath-dataset) 55%, #64748b);
  background: color-mix(in srgb, var(--ath-dataset) 38%, var(--dsw-alias-bg-layer-1));
}
.ath-canvas-node[data-selected="true"] { border-color: #64748b; box-shadow: 0 0 0 2px rgba(100, 116, 139, .18); }
.ath-canvas-node[data-kind="graph"] { border-style: dashed; }
.ath-canvas-node-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-canvas-node-meta { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap; }
.ath-canvas-node-meta > span { overflow: hidden; text-overflow: ellipsis; }
.ath-node-tag { font-size: 9px; padding: 0 4px; border-radius: 3px; border: 1px solid currentColor; color: var(--ath-yellow-ink); flex: 0 0 auto; }
.ath-node-env { margin-left: 6px; font-size: 9.5px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 0 4px; white-space: nowrap; }
.ath-port-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) 78px 24px; gap: 6px; align-items: center; margin-bottom: 6px; }
.ath-port-edit-row-required { grid-template-columns: minmax(0, 1fr) 78px auto 24px; }
.ath-readonly-value { display: flex; align-items: center; min-height: 28px; }
.ath-type-select { width: auto; min-width: 72px; padding: 5px 6px; font-size: 11px; }
.ath-template-refs { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; }
.ath-template-ref {
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--ath-border-soft);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10.5px;
}
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
  border: 1px solid #94a3b8; border-radius: 11px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 1px 2px rgba(32, 43, 61, .05);
  cursor: grab;
}
.ath-node-card:active { cursor: grabbing; }
.ath-node-card[data-kind="dataset"] {
  border-color: color-mix(in srgb, var(--ath-dataset) 55%, #64748b);
  background: color-mix(in srgb, var(--ath-dataset) 38%, var(--dsw-alias-bg-layer-1));
}
.ath-node-card[data-kind="dataset"] .ath-node-head { border-bottom-color: color-mix(in srgb, var(--ath-dataset) 45%, #64748b); }
.ath-node-card[data-kind="dataset"] .ath-node-tag { color: var(--ath-dataset); }
.ath-node-card[data-selected="true"] {
  border-color: #64748b;
  box-shadow: 0 0 0 2px rgba(100, 116, 139, .18);
}
.ath-node-head {
  height: 38px; padding: 2px 10px;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto;
  column-gap: 5px; align-content: center;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.ath-node-title { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-node-tag {
  grid-column: 2; grid-row: 1; align-self: center;
  font-size: 8.5px; line-height: 1.5; color: var(--ath-yellow-ink);
  border: 1px solid currentColor; border-radius: 3px; padding: 0 3px;
}
.ath-node-sub { grid-column: 1 / -1; grid-row: 2; font-size: 9.5px; line-height: 1.3; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
.ath-port-out { right: -7px; border-color: #64748b; }
.ath-port-dot:hover { transform: scale(1.3); border-color: #64748b; }
.ath-port-dot.ath-port-required {
  border-color: #64748b; border-width: 3px;
  background: color-mix(in srgb, #64748b 18%, var(--dsw-alias-bg-base));
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
.ath-layout-toggle { background: #fff; border-color: #d1d5db; }
.ath-layout-toggle .ath-seg-btn { background: #fff; color: #4b5563; }
.ath-layout-toggle .ath-seg-btn[data-active="true"] { background: #fff; color: #111827; box-shadow: inset 0 0 0 1px #d1d5db; }
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
  border-color: color-mix(in srgb, var(--ath-status) 62%, #64748b);
  background: var(--ath-status-40);
  box-shadow: 0 1px 2px rgba(32, 43, 61, .05);
}
.ath-run-node[data-kind="dataset"] {
  background: color-mix(in srgb, var(--ath-dataset) 38%, var(--dsw-alias-bg-layer-1));
  border-color: color-mix(in srgb, var(--ath-dataset) 60%, #64748b);
}
.ath-run-node[data-kind="dataset"] .ath-node-sub { color: var(--ath-dataset-ink); }
.ath-run-node[data-kind="dataset"][data-selected="true"] {
  border-color: var(--ath-dataset);
  box-shadow: 0 0 0 2px var(--ath-dataset-40);
}
.ath-run-node[data-selected="true"] {
  border-color: #64748b;
  box-shadow: 0 0 0 2px rgba(100, 116, 139, .18);
}
.ath-run-node .ath-node-sub { color: var(--ath-status-ink); font-weight: 600; }
.ath-run-node .ath-node-head { border-bottom-color: color-mix(in srgb, var(--ath-status) 55%, #64748b); }
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
.ath-run-port-output { pointer-events: auto; cursor: context-menu; }
.ath-run-port-output::after {
  content: ''; position: absolute; inset: -6px; border-radius: 50%;
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
.ath-output-menu, .ath-context-menu {
  position: fixed; z-index: 60; min-width: 180px; max-width: 260px;
  display: flex; flex-direction: column; gap: 2px; padding: 5px;
  border: 1px solid var(--ath-border-soft); border-radius: 9px;
  background: var(--dsw-alias-bg-overlay); box-shadow: 0 4px 12px rgba(24, 34, 48, .08);
}
.ath-output-menu-head {
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px 8px 6px; border-bottom: 1px solid var(--ath-border-soft); margin-bottom: 2px;
  font-size: 10px; color: var(--dsw-alias-label-secondary);
}
.ath-output-menu-head code { font-size: 10px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.ath-output-menu button, .ath-context-menu button {
  appearance: none; border: 0; background: transparent; text-align: left; cursor: pointer;
  padding: 7px 9px; border-radius: 6px; font-size: 11.5px; color: var(--dsw-alias-label-primary);
}
.ath-output-menu button:hover, .ath-context-menu button:hover { background: var(--dsw-alias-bg-layer-2); }
.ath-context-menu button[data-danger="true"] { color: var(--ath-red); }
.ath-context-menu button[data-danger="true"]:hover { background: color-mix(in srgb, var(--ath-red) 10%, transparent); }
.ath-artifact-list {
  display: flex; flex-direction: column; gap: 5px;
  max-height: 52vh; overflow: auto; padding-right: 4px;
}
.ath-artifact-entry {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 7px 9px; border: 1px solid var(--ath-border-soft); border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer;
}
.ath-artifact-entry:hover { border-color: var(--ath-accent); background: var(--dsw-alias-bg-layer-2); }
.ath-artifact-kind { flex: 0 0 auto; }
.ath-artifact-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ath-artifact-entry .ath-hint { margin-left: auto; flex: 0 0 auto; }
.ath-run-nodebar .ath-btn { grid-column: 2; grid-row: 1; }
@keyframes ath-run-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ath-yellow) 25%, transparent); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.ath-inspector { display: flex; flex-direction: column; gap: 12px; }
.ath-section-title { margin: 0 0 2px; font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-secondary); text-transform: none; }
.ath-param-row { display: grid; grid-template-columns: minmax(0, 1fr) 78px minmax(0, 1.1fr) 24px; gap: 6px; align-items: center; }
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
  box-shadow: 0 10px 30px rgba(32, 43, 61, .12);
  overflow: hidden;
}
.ath-modal[data-wide="true"] { width: min(860px, 100%); }
.ath-modal.ath-resource-modal { background: #fff; color: #111827; }
.ath-resource-modal .ath-modal-head { border-bottom-color: #e5e7eb; }
.ath-resource-modal .ath-modal-head h3 { color: #111827; }
.ath-resource-modal .ath-modal-foot { background: #fff; border-top-color: #e5e7eb; }
.ath-resource-modal .ath-label { color: #374151; }
.ath-resource-modal .ath-hint { color: #6b7280; }
.ath-resource-modal .ath-chip { color: #4b5563; }
.ath-resource-modal .ath-chip[data-active="true"] { color: #111827; background: #f3f4f6; border-color: #9ca3af; }
.ath-resource-modal .ath-asset-chip { background: #f9fafb; }
.ath-resource-modal .ath-btn-ghost { color: #374151; }
.ath-resource-modal .ath-icon-btn { color: #6b7280; }
.ath-resource-modal .ath-icon-btn:hover { color: #111827; background: #f3f4f6; border-color: #d1d5db; }
.ath-resource-modal .ath-input,
.ath-resource-modal .ath-select { background: #fff; color: #111827; border-color: #d1d5db; }
.ath-resource-config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ath-resource-config {
  padding: 10px; border: 1px solid #e5e7eb; border-radius: 10px;
  background: #f8fafc; box-shadow: none;
}
.ath-resource-config-wide { grid-column: 1 / -1; }
.ath-resource-config-head { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
.ath-resource-config-head .ath-section-title { margin: 0; font-size: 12px; color: #111827; }
.ath-resource-config-head .ath-hint { margin-left: auto; }
.ath-resource-config-head .ath-icon-btn { width: 22px; height: 22px; }
.ath-resource-config-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 76px 22px;
  gap: 5px; align-items: center;
}
.ath-resource-config-row + .ath-resource-config-row { margin-top: 5px; }
.ath-resource-config-row .ath-input { min-width: 0; }
.ath-resource-config .ath-hint { margin-top: 2px; }
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
  box-shadow: 0 4px 14px rgba(15, 23, 42, .10); font-size: 11.5px;
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
  .ath-resource-config-grid { grid-template-columns: minmax(0, 1fr); }
  .ath-resource-config-wide { grid-column: auto; }
  .ath-brand-sub { display: none; }
  .ath-workspace {
    max-width: none; padding: 0; border: 0; background: transparent;
  }
  .ath-workspace span { display: none; }
  .ath-topbar { padding: 10px 12px; }
  .ath-node-row { grid-template-columns: minmax(110px, 1.4fr) 84px 56px 52px; }
  .ath-node-row > :nth-child(2), .ath-node-row > :nth-child(4) { display: none; }
  .ath-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
    `;
