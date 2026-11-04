window.__ModuleLoader__.load({
  id: 'work-clock',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'work-clock';
    const STORE_KEY = 'dsh.work-clock.v1';
    const WORKDAY_MS = 9 * 60 * 60 * 1000;

    const DEFAULTS = Object.freeze({
      workStart: '09:00',
      workEnd: '18:00',
      lunch: '12:00',
      dinner: '18:30',
      weekdayOnly: true,
      sound: true,
      voice: false,
      weather: true,
      agenda: true,
      advance: true,
    });

    const ZH = {
      title: '工作时钟',
      collapse: '收起',
      expand: '展开',
      settings: '设置',
      refresh: '刷新日历',
      refreshing: '正在同步日历…',
      close: '关闭',
      dismiss: '知道了',
      dragHint: '拖动可移动',
      untilOffWork: '距下班',
      untilStart: '距上班',
      statusBefore: '未开始',
      statusWorking: '工作中',
      statusOff: '已下班',
      statusRest: '休息日',
      lunch: '午餐',
      dinner: '晚餐',
      passed: '已过',
      inMinutes: '还有 {n} 分钟',
      inHoursMinutes: '还有 {h} 小时 {m} 分',
      inHours: '还有 {h} 小时',
      inDays: '{n} 天',
      workStartShort: '上班',
      workEndShort: '下班',
      fieldStart: '上班时间',
      nineHourHint: '打卡后：下班 = 上班打卡 + 9 小时',
      fieldEnd: '计划下班',
      fieldLunch: '午餐时间',
      fieldDinner: '晚餐时间',
      weekdayOnly: '仅工作日计算下班',
      sound: '提醒音效',
      voice: '整点语音报时',
      hourAnnounce: '整点报时',
      hourSpeech: '现在是 {time}。',
      resetPosition: '重置位置',
      resetSettings: '默认时间',
      remindLunch: '午餐时间到，先去吃饭吧。',
      remindDinner: '晚餐时间到，别忘了吃饭。',
      remindOffWork: '下班时间到，今天辛苦了。',
      remindMeeting: '会议开始：{title}',
      workedTime: '已工作',
      todayWork: '今日工时',
      punchedIn: '已打卡',
      punchedOut: '已下班',
      punchIn: '上班打卡',
      punchLabel: '今日打卡',
      notPunched: '未打卡',
      clearPunch: '清除今日打卡',
      overtime: '已超时',
      punchHint: '打卡后开始计算工时',
      workStartsAt: '{time} 上班',
      showWeather: '显示天气',
      showAgenda: '显示今日日程',
      advance: '临近日程提前提醒（10 / 5 / 1 分钟）',
      advanceReminder: '{minutes} 分钟后：{title}',
      weatherLabel: '天气',
      calendarLabel: '飞书日历',
      integrations: '连接',
      unavailable: '暂无',
      checking: '检测中…',
      off: '已关闭',
      connectedCount: '已连接 · {n} 个日程',
      calendarMissing: '未找到 lark-cli',
      calendarAuth: '登录已失效',
      calendarError: '获取失败',
      calendarAuthHint: '在终端运行 lark-cli auth login 后自动恢复。',
      calendarMissingHint: '安装 lark-cli 后自动连接。',
      calendarErrorHint: '稍后会自动重试。',
      serviceOffline: '本地服务未连接，天气和日程不可用。',
      agendaTitle: '今日日程',
      agendaDone: '今日日程已结束',
      noMeetings: '今日暂无会议',
      meetingCount: '共 {n} 场',
      meetingNow: '进行中',
      allDay: '全天',
    };

    const EN = {
      title: 'Work Clock',
      collapse: 'Collapse',
      expand: 'Expand',
      settings: 'Settings',
      refresh: 'Refresh calendar',
      refreshing: 'Refreshing calendar…',
      close: 'Close',
      dismiss: 'Dismiss',
      dragHint: 'Drag to move',
      untilOffWork: 'Until off-work',
      untilStart: 'Until work',
      statusBefore: 'Not started',
      statusWorking: 'Working',
      statusOff: 'Off work',
      statusRest: 'Rest day',
      lunch: 'Lunch',
      dinner: 'Dinner',
      passed: 'Passed',
      inMinutes: 'in {n} min',
      inHoursMinutes: 'in {h}h {m}m',
      inHours: 'in {h}h',
      inDays: '{n}d',
      workStartShort: 'Start',
      workEndShort: 'End',
      fieldStart: 'Work starts',
      nineHourHint: 'After clock-in: off-work = clock-in + 9 hours',
      fieldEnd: 'Planned end',
      fieldLunch: 'Lunch time',
      fieldDinner: 'Dinner time',
      weekdayOnly: 'Weekdays only',
      sound: 'Reminder sound',
      voice: 'Speak the hour',
      hourAnnounce: 'On the hour',
      hourSpeech: 'It is now {time}.',
      resetPosition: 'Reset position',
      resetSettings: 'Default times',
      remindLunch: 'Lunch time - take a break and eat.',
      remindDinner: 'Dinner time - do not forget to eat.',
      remindOffWork: 'Off-work time - nice work today.',
      remindMeeting: 'Meeting started: {title}',
      workedTime: 'Worked',
      todayWork: 'Today total',
      punchedIn: 'Clocked in',
      punchedOut: 'Clocked out',
      punchIn: 'Clock in',
      punchLabel: 'Today punch',
      notPunched: 'Not clocked in',
      clearPunch: 'Clear today punch',
      overtime: 'Overtime',
      punchHint: 'Work time starts after clock-in',
      workStartsAt: 'Starts {time}',
      showWeather: 'Show weather',
      showAgenda: 'Show today’s calendar',
      advance: 'Advance reminders (10 / 5 / 1 min)',
      advanceReminder: 'In {minutes} min: {title}',
      weatherLabel: 'Weather',
      calendarLabel: 'Lark Calendar',
      integrations: 'Connections',
      unavailable: 'N/A',
      checking: 'Checking…',
      off: 'Off',
      connectedCount: 'Connected · {n} events',
      calendarMissing: 'lark-cli not found',
      calendarAuth: 'Sign-in expired',
      calendarError: 'Fetch failed',
      calendarAuthHint: 'Run lark-cli auth login in a terminal to reconnect.',
      calendarMissingHint: 'Install lark-cli to connect.',
      calendarErrorHint: 'Retrying automatically.',
      serviceOffline: 'Local service unavailable; weather and calendar are off.',
      agendaTitle: 'Today’s calendar',
      agendaDone: 'No more meetings today',
      noMeetings: 'No meetings today',
      meetingCount: '{n} events',
      meetingNow: 'Now',
      allDay: 'All day',
    };

    const CSS = `
.dwc-root {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 70;
  width: 286px;
  pointer-events: auto;
  color: var(--dsw-alias-label-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
.dwc-root { --dwc-accent: #38bdf8; }
.dwc-root.dwc-collapsed { width: 236px; }
.dwc-card {
  position: relative;
  background:
    linear-gradient(
      158deg,
      color-mix(in srgb, var(--dwc-accent) 17%, var(--dsw-alias-bg-overlay)) 0%,
      var(--dsw-alias-bg-overlay) 58%
    );
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--dwc-accent) 55%, transparent),
    0 14px 34px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
  max-height: calc(100vh - 16px);
  overflow: hidden auto;
  user-select: none;
}
.dwc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px 9px 12px;
  cursor: grab;
  touch-action: none;
}
.dwc-head:active { cursor: grabbing; }
.dwc-mark {
  display: inline-flex;
  color: color-mix(in srgb, var(--dwc-accent) 70%, var(--dsw-alias-label-primary));
  flex: none;
  transition: color 0.8s linear;
}
.dwc-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.dwc-icon-btn {
  appearance: none;
  border: 0;
  padding: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  flex: none;
  font-family: inherit;
}
.dwc-icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
  background: transparent;
}

.dwc-icon-btn.is-spinning svg {
  transform-box: fill-box;
  transform-origin: center;
  animation: dwc-spin 0.9s linear infinite;
}

@keyframes dwc-spin {
  to {
    transform: rotate(360deg);
  }
}

.dwc-icon-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dwc-icon-btn:focus-visible,
.dwc-collapsed-row:focus-visible,
.dwc-text-btn:focus-visible,
.dwc-alert-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dwc-accent) 70%, var(--dsw-alias-label-primary));
  outline-offset: 1px;
}
.dwc-body { padding: 0 12px 12px; }
.dwc-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dwc-meta-time {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.dwc-count-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dwc-chip {
  font-size: 10px;
  line-height: 1.4;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--dwc-accent) 34%, transparent);
  color: color-mix(in srgb, var(--dwc-accent) 58%, var(--dsw-alias-label-primary));
  background: color-mix(in srgb, var(--dwc-accent) 10%, var(--dsw-alias-bg-layer-2));
  transition: color 0.8s linear, border-color 0.8s linear, background-color 0.8s linear;
}
.dwc-count {
  margin-top: 1px;
  font-size: 31px;
  font-weight: 650;
  line-height: 1.22;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--dwc-accent) 46%, var(--dsw-alias-label-primary));
  transition: color 0.8s linear;
}
.dwc-progress {
  height: 4px;
  margin-top: 9px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dwc-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--dwc-accent) 62%, var(--dsw-alias-label-primary)),
    var(--dwc-accent)
  );
  transition: width 0.4s ease;
}
.dwc-progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dwc-events {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 11px;
}
.dwc-event {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-1);
  font-size: 12px;
}
.dwc-event.is-next { border-color: color-mix(in srgb, var(--dwc-accent) 52%, transparent); }
.dwc-event.is-past { opacity: 0.62; }
.dwc-event-emoji { font-size: 14px; line-height: 1; flex: none; }
.dwc-event-name { flex: 1; min-width: 0; }
.dwc-event-at {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dwc-event-remain {
  min-width: 70px;
  text-align: right;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dwc-event.is-next .dwc-event-remain {
  color: color-mix(in srgb, var(--dwc-accent) 62%, var(--dsw-alias-label-primary));
}
.dwc-weather {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 86%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dwc-weather-icon { font-size: 11px; line-height: 1; }
.dwc-weather-temp { font-weight: 600; color: var(--dsw-alias-label-primary); }
.dwc-subline {
  margin-top: 1px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dwc-punch {
  appearance: none;
  width: 100%;
  margin-top: 9px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--dwc-accent) 46%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dwc-accent) 12%, var(--dsw-alias-bg-layer-1));
  color: color-mix(in srgb, var(--dwc-accent) 45%, var(--dsw-alias-label-primary));
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}
.dwc-punch:hover {
  background: color-mix(in srgb, var(--dwc-accent) 20%, var(--dsw-alias-bg-layer-1));
  border-color: color-mix(in srgb, var(--dwc-accent) 62%, transparent);
}
.dwc-punch:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dwc-accent) 70%, var(--dsw-alias-label-primary));
  outline-offset: 1px;
}
.dwc-punch:active { transform: translateY(1px); }
.dwc-agenda {
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dwc-agenda-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--dsw-alias-label-secondary);
}
.dwc-agenda-count {
  font-weight: 400;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.dwc-agenda-empty {
  padding: 3px 2px 1px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dwc-meeting {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-left: 2px solid transparent;
  border-radius: 6px;
  font-size: 11px;
}
.dwc-meeting + .dwc-meeting { margin-top: 2px; }
.dwc-meeting.is-now {
  border-left-color: var(--dwc-accent);
  background: color-mix(in srgb, var(--dwc-accent) 11%, var(--dsw-alias-bg-layer-1));
}
.dwc-meeting.is-next { border-left-color: color-mix(in srgb, var(--dwc-accent) 55%, transparent); }
.dwc-meeting.is-allday { opacity: 0.85; }
.dwc-meeting-time {
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dwc-meeting-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.dwc-meeting-status {
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}
.dwc-meeting.is-now .dwc-meeting-status {
  color: color-mix(in srgb, var(--dwc-accent) 62%, var(--dsw-alias-label-primary));
  font-weight: 600;
}
.dwc-meeting.is-now .dwc-meeting-status::before {
  content: "●";
  margin-right: 3px;
  font-size: 6px;
  vertical-align: 2px;
  animation: dwc-pulse 1.6s ease-in-out infinite;
}
@keyframes dwc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.dwc-setting-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dwc-setting-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--dsw-alias-label-secondary);
}
.dwc-status {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}
.dwc-status-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dwc-hint {
  font-size: 10px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.dwc-setting-block .dwc-text-btn { align-self: flex-start; margin-top: 2px; }
.dwc-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 9px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dwc-accent) 13%, var(--dsw-alias-bg-layer-1));
  border: 1px solid color-mix(in srgb, var(--dwc-accent) 46%, transparent);
  font-size: 12px;
  line-height: 1.45;
}
.dwc-alert-text { flex: 1; min-width: 0; }
.dwc-alert-close {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  line-height: 1;
  font-size: 14px;
  border-radius: 4px;
  flex: none;
  font-family: inherit;
}
.dwc-alert-close:hover { color: var(--dsw-alias-label-primary); }
.dwc-settings {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dwc-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dwc-field input[type="time"] {
  width: 82px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  color-scheme: light dark;
}
.dwc-field input[type="time"]:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dwc-accent) 70%, var(--dsw-alias-label-primary));
  outline-offset: 1px;
}
.dwc-check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dwc-check input {
  margin: 0;
  accent-color: var(--dwc-accent);
}
.dwc-actions { display: flex; gap: 8px; margin-top: 1px; }
.dwc-text-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 6px;
  padding: 3px 7px;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}
.dwc-text-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.dwc-hour {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 12px 12px 11px;
  overflow: hidden;
  pointer-events: none;
  border-radius: 14px 14px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--dwc-accent) 45%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--dwc-accent) 26%, var(--dsw-alias-bg-overlay)),
      color-mix(in srgb, var(--dwc-accent) 7%, var(--dsw-alias-bg-overlay))
    );
  animation: dwc-hour-cycle 3.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.dwc-hour::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    color-mix(in srgb, var(--dwc-accent) 40%, transparent) 50%,
    transparent 70%
  );
  transform: translateX(-120%);
  animation: dwc-hour-sweep 1.3s ease 0.15s 1 both;
}
.dwc-hour-time {
  font-size: 27px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--dwc-accent) 42%, var(--dsw-alias-label-primary));
  animation: dwc-hour-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.dwc-hour-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--dsw-alias-label-secondary);
}
@keyframes dwc-hour-cycle {
  0% { opacity: 0; transform: translateY(-100%); }
  11% { opacity: 1; transform: translateY(0); }
  84% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-36%); }
}
@keyframes dwc-hour-pop {
  0% { opacity: 0; transform: scale(0.7); }
  55% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes dwc-hour-sweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
.dwc-collapsed-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dwc-collapsed-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
`;

    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    function clockSeconds(value) {
      if (typeof value !== 'string') return null;
      const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
      if (!match) return null;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) return null;
      return hour * 3600 + minute * 60;
    }

    function clockText(total) {
      return pad2(Math.floor(total / 3600)) + ':' + pad2(Math.floor((total % 3600) / 60));
    }

    function normalizeSettings(raw) {
      const source = raw && typeof raw === 'object' ? raw : {};
      const pick = (key) => {
        const seconds = clockSeconds(source[key]);
        return clockText(seconds === null ? clockSeconds(DEFAULTS[key]) : seconds);
      };
      const next = {
        workStart: pick('workStart'),
        workEnd: pick('workEnd'),
        lunch: pick('lunch'),
        dinner: pick('dinner'),
        weekdayOnly: typeof source.weekdayOnly === 'boolean' ? source.weekdayOnly : DEFAULTS.weekdayOnly,
        sound: typeof source.sound === 'boolean' ? source.sound : DEFAULTS.sound,
        voice: typeof source.voice === 'boolean' ? source.voice : DEFAULTS.voice,
        weather: typeof source.weather === 'boolean' ? source.weather : DEFAULTS.weather,
        agenda: typeof source.agenda === 'boolean' ? source.agenda : DEFAULTS.agenda,
        advance: typeof source.advance === 'boolean' ? source.advance : DEFAULTS.advance,
      };
      if (clockSeconds(next.workEnd) <= clockSeconds(next.workStart)) {
        next.workStart = DEFAULTS.workStart;
        next.workEnd = DEFAULTS.workEnd;
      }
      return next;
    }

    function secondsOfDay(date) {
      return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    }

    function isWorkday(date, settings) {
      if (!settings.weekdayOnly) return true;
      const day = date.getDay();
      return day !== 0 && day !== 6;
    }

    function nextWorkStart(date, settings) {
      const start = clockSeconds(settings.workStart);
      if (start === null) return null;
      for (let offset = 0; offset < 8; offset += 1) {
        const candidate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + offset,
          Math.floor(start / 3600),
          Math.floor((start % 3600) / 60),
          0,
          0,
        );
        if (candidate.getTime() <= date.getTime()) continue;
        if (!isWorkday(candidate, settings)) continue;
        return candidate;
      }
      return null;
    }

    function workView(date, settings) {
      const start = clockSeconds(settings.workStart);
      const end = clockSeconds(settings.workEnd);
      const now = secondsOfDay(date);
      if (!isWorkday(date, settings)) {
        const next = nextWorkStart(date, settings);
        return { mode: 'rest', seconds: next ? (next.getTime() - date.getTime()) / 1000 : 0, pct: 0 };
      }
      if (now < start) {
        return { mode: 'before', seconds: start - now, pct: 0 };
      }
      if (now < end) {
        return { mode: 'work', seconds: end - now, pct: (now - start) / Math.max(1, end - start) };
      }
      const next = nextWorkStart(date, settings);
      return { mode: 'done', seconds: next ? (next.getTime() - date.getTime()) / 1000 : 0, pct: 1 };
    }

    function dayKeyOf(date) {
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function endOfDayMs(date, settings) {
      const end = clockSeconds(settings.workEnd);
      if (end === null) return 0;
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(end / 3600),
        Math.floor((end % 3600) / 60),
        0,
        0,
      ).getTime();
    }

    function normalizePunch(raw) {
      if (!raw || typeof raw !== 'object' || typeof raw.date !== 'string') return null;
      const inMs = Number(raw.in);
      if (!Number.isFinite(inMs) || inMs <= 0) return null;
      const outMs = Number(raw.out);
      return {
        date: raw.date,
        in: inMs,
        out: Number.isFinite(outMs) && outMs >= inMs ? outMs : null,
      };
    }

    function clockHM(ms) {
      if (!Number.isFinite(ms)) return '--:--';
      const date = new Date(ms);
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function weatherEmoji(code, isDay) {
      if (code === 0) return isDay ? '☀️' : '🌙';
      if (code === 1) return isDay ? '🌤️' : '🌙';
      if (code === 2) return '⛅';
      if (code === 3) return '☁️';
      if (code === 45 || code === 48) return '🌫️';
      if (code >= 51 && code <= 57) return '🌦️';
      if (code >= 61 && code <= 67) return '🌧️';
      if (code >= 71 && code <= 77) return '❄️';
      if (code >= 80 && code <= 82) return '🌦️';
      if (code === 85 || code === 86) return '🌨️';
      if (code >= 95) return '⛈️';
      return '🌡️';
    }

    function nextReminderCandidate(date, settings, meetings) {
      const at = date.getTime();
      const candidates = [];
      for (const event of meetings) {
        if (!event || event.allDay) continue;
        if (!Number.isFinite(event.start) || event.start <= at) continue;
        candidates.push({
          key: event.id
            ? 'meeting:' + event.id + ':' + event.start
            : 'meeting:' + event.start + ':' + (event.title || ''),
          at: event.start,
          title: event.title,
          kind: 'meeting',
        });
      }
      for (const key of ['lunch', 'dinner']) {
        const seconds = clockSeconds(settings[key]);
        if (seconds === null) continue;
        const when = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          Math.floor(seconds / 3600),
          Math.floor((seconds % 3600) / 60),
          0,
          0,
        ).getTime();
        if (when <= at) continue;
        candidates.push({
          key: 'slot:' + dayKeyOf(date) + ':' + key + ':' + seconds,
          at: when,
          titleKey: key,
          kind: key,
        });
      }
      candidates.sort((left, right) => {
        if (left.at !== right.at) return left.at - right.at;
        if (left.kind === right.kind) return 0;
        return left.kind === 'meeting' ? -1 : 1;
      });
      return candidates[0] || null;
    }

    /**
     * Only the nearest upcoming event gets advance reminders. All thresholds
     * already crossed are marked, so a sleeping or newly opened app emits at
     * most one sound instead of a burst for 10/5/1 at once.
     */
    function takeAdvanceReminder(date, settings, meetings, fired) {
      const next = nextReminderCandidate(date, settings, meetings);
      if (!next) return null;
      const remaining = (next.at - date.getTime()) / 1000;
      if (!(remaining > 1)) return null;
      let crossed = null;
      for (const threshold of [600, 300, 60]) {
        if (remaining > threshold) continue;
        const marker = next.key + ':' + threshold;
        if (fired.has(marker)) continue;
        fired.add(marker);
        crossed = threshold;
      }
      if (crossed === null) return null;
      return { ...next, threshold: crossed, minutes: Math.max(1, Math.round(remaining / 60)) };
    }


    function formatCountdown(seconds, t) {
      const total = Math.max(0, Math.floor(seconds));
      const days = Math.floor(total / 86400);
      const hms =
        pad2(Math.floor((total % 86400) / 3600)) +
        ':' +
        pad2(Math.floor((total % 3600) / 60)) +
        ':' +
        pad2(total % 60);
      return days > 0 ? t('inDays', { n: days }) + ' ' + hms : hms;
    }

    function formatRemaining(seconds, t) {
      const minutes = Math.ceil(seconds / 60);
      if (minutes <= 0) return t('passed');
      if (minutes < 60) return t('inMinutes', { n: minutes });
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest === 0 ? t('inHours', { h: hours }) : t('inHoursMinutes', { h: hours, m: rest });
    }

    function readStore() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function writeStore(patch) {
      try {
        const next = { ...readStore(), ...patch };
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch (error) {
        /* Storage can be unavailable; the clock still works in memory. */
      }
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    /* Morning blue -> noon amber -> evening violet -> night indigo. */
    const PHASE_STOPS = [
      [0, [99, 102, 241]],
      [300, [99, 102, 241]],
      [480, [56, 189, 248]],
      [660, [56, 189, 248]],
      [720, [245, 158, 11]],
      [840, [245, 158, 11]],
      [1020, [167, 139, 250]],
      [1200, [167, 139, 250]],
      [1380, [99, 102, 241]],
      [1440, [99, 102, 241]],
    ];

    function smoothstep(value) {
      return value * value * (3 - 2 * value);
    }

    function phaseAccent(date) {
      const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
      let from = PHASE_STOPS[0];
      let to = PHASE_STOPS[PHASE_STOPS.length - 1];
      for (let index = 1; index < PHASE_STOPS.length; index += 1) {
        if (minute <= PHASE_STOPS[index][0]) {
          from = PHASE_STOPS[index - 1];
          to = PHASE_STOPS[index];
          break;
        }
      }
      const span = to[0] - from[0] || 1;
      const ratio = smoothstep(clamp((minute - from[0]) / span, 0, 1));
      const channel = (index) =>
        Math.round(from[1][index] + (to[1][index] - from[1][index]) * ratio);
      return 'rgb(' + channel(0) + ' ' + channel(1) + ' ' + channel(2) + ')';
    }

    function svgIcon(children) {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        children,
      );
    }

    function clockMark() {
      return h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('polyline', { points: '12 7 12 12 15.5 14' }),
      );
    }

    function slidersIcon() {
      return svgIcon([
        h('line', { key: 'a', x1: 4, y1: 7, x2: 20, y2: 7 }),
        h('circle', { key: 'b', cx: 9, cy: 7, r: 2.4 }),
        h('line', { key: 'c', x1: 4, y1: 17, x2: 20, y2: 17 }),
        h('circle', { key: 'd', cx: 15, cy: 17, r: 2.4 }),
      ]);
    }

    function refreshIcon() {
      return svgIcon([
        h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
        h('polyline', { key: 'b', points: '20 4 20 11 13 11' }),
      ]);
    }

    function chevronIcon(expanded) {
      return svgIcon(
        h('polyline', { points: expanded ? '6 9 12 15 18 9' : '6 15 12 9 18 15' }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale;
        const t = locale.bind(NS);

        ctx.effect(
          () => locale.register(NS, { zh: ZH, en: EN }),
          'work clock: dictionaries',
        );

        function WorkClock() {
          const [initial] = React.useState(readStore);
          const [settings, setSettings] = React.useState(() => normalizeSettings(initial.settings));
          const [collapsed, setCollapsed] = React.useState(initial.collapsed === true);
          const [pos, setPos] = React.useState(() => {
            const saved = initial.pos;
            return saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)
              ? { left: saved.left, top: saved.top }
              : null;
          });
          const [now, setNow] = React.useState(() => Date.now());
          const [alert, setAlert] = React.useState(null);
          const [hourPulse, setHourPulse] = React.useState(null);
          const [showSettings, setShowSettings] = React.useState(false);
          const [localeSnapshot, setLocaleSnapshot] = React.useState(() => locale.getSnapshot());
          const [punch, setPunch] = React.useState(() => normalizePunch(initial.punch));
          const [office, setOffice] = React.useState({ weather: null, calendar: null, error: null });
          const [refreshing, setRefreshing] = React.useState(false);

          const cardRef = React.useRef(null);
          const dragRef = React.useRef(null);
          const posRef = React.useRef(pos);
          const settingsRef = React.useRef(settings);
          const loadOfficeRef = React.useRef(null);
          const punchRef = React.useRef(punch);
          const prevSecRef = React.useRef(null);
          const prevMsRef = React.useRef(null);
          const prevHourRef = React.useRef(null);
          const audioRef = React.useRef(null);
          const eventsRef = React.useRef([]);
          const firedMeetingsRef = React.useRef(new Set());
          const advanceFiredRef = React.useRef(new Set());
          const todayKey = dayKeyOf(new Date(now));

          posRef.current = pos;
          settingsRef.current = settings;
          punchRef.current = punch;

          function beep(shortTone = false) {
            try {
              const Ctor = window.AudioContext || window.webkitAudioContext;
              if (!Ctor) return;
              const audio = audioRef.current || (audioRef.current = new Ctor());
              if (audio.state === 'suspended') {
                const resumed = audio.resume();
                if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
              }
              const base = audio.currentTime;
              const notes = shortTone ? [660] : [880, 1174.66];
              notes.forEach((frequency, index) => {
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                const start = base + index * 0.17;
                oscillator.type = 'sine';
                oscillator.frequency.value = frequency;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
                oscillator.connect(gain);
                gain.connect(audio.destination);
                oscillator.start(start);
                oscillator.stop(start + 0.18);
              });
            } catch (error) {
              /* Audio is a bonus; never let it break the reminder. */
            }
          }

          function speakHour(label) {
            try {
              const synth = window.speechSynthesis;
              if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return;
              synth.cancel();
              const utterance = new window.SpeechSynthesisUtterance(
                t('hourSpeech', { time: label }),
              );
              const active = locale.getSnapshot().active;
              utterance.lang = active === 'zh' ? 'zh-CN' : active;
              utterance.rate = 1;
              utterance.pitch = 1;
              synth.speak(utterance);
            } catch (error) {
              /* Speech is optional; the animation alone still announces the hour. */
            }
          }

          React.useEffect(() => {
            const unsubscribe = locale.subscribe(() => setLocaleSnapshot(locale.getSnapshot()));
            return unsubscribe;
          }, []);

          React.useEffect(() => {
            const wantWeather = settings.weather;
            const wantAgenda = settings.agenda;
            if (!wantWeather && !wantAgenda) {
              loadOfficeRef.current = null;
              setRefreshing(false);
              setOffice({ weather: null, calendar: null, error: null });
              return undefined;
            }
            let disposed = false;
            let timer = null;
            let controller = null;
            const load = async (force = false) => {
              if (force) setRefreshing(true);
              try {
                if (controller) controller.abort();
                controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), 15000);
                const url =
                  '/work-clock/state?weather=' +
                  (wantWeather ? '1' : '0') +
                  '&agenda=' +
                  (wantAgenda ? '1' : '0') +
                  (force ? '&refresh=1' : '');
                const response = await window.fetch(url, {
                  credentials: 'same-origin',
                  cache: 'no-store',
                  signal: controller.signal,
                });
                window.clearTimeout(timeout);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const data = await response.json();
                if (disposed) return;
                setOffice((previous) => ({
                  weather: wantWeather ? data.weather || previous.weather : null,
                  calendar: wantAgenda ? data.calendar || previous.calendar : null,
                  error: data.weatherError || null,
                }));
              } catch (error) {
                if (disposed || (error && error.name === 'AbortError')) return;
                setOffice((previous) => ({
                  ...previous,
                  error: String((error && error.message) || error),
                }));
              } finally {
                if (force && !disposed) setRefreshing(false);
              }
            };
            loadOfficeRef.current = load;
            load();
            timer = window.setInterval(load, 5 * 60 * 1000);
            const onVisible = () => {
              if (document.visibilityState === 'visible') load();
            };
            document.addEventListener('visibilitychange', onVisible);
            return () => {
              disposed = true;
              loadOfficeRef.current = null;
              if (timer) window.clearInterval(timer);
              if (controller) controller.abort();
              document.removeEventListener('visibilitychange', onVisible);
              setRefreshing(false);
            };
          }, [settings.weather, settings.agenda]);

          React.useEffect(() => {
            firedMeetingsRef.current = new Set();
            advanceFiredRef.current = new Set();
          }, [todayKey]);

          React.useEffect(() => {
            if (!punch || punch.date === todayKey) return;
            setPunch(null);
            writeStore({ punch: null });
          }, [punch, todayKey]);

          React.useEffect(() => {
            const start = new Date();
            prevSecRef.current = secondsOfDay(start);
            prevMsRef.current = start.getTime();
            prevHourRef.current = start.getHours();
            const timer = window.setInterval(() => {
              const date = new Date();
              const sec = secondsOfDay(date);
              setNow(date.getTime());
              const prev = prevSecRef.current;
              prevSecRef.current = sec;
              const prevMs = prevMsRef.current;
              prevMsRef.current = date.getTime();
              const current = settingsRef.current;

              const hour = date.getHours();
              const prevHour = prevHourRef.current;
              prevHourRef.current = hour;
              if (prevHour !== null && hour !== prevHour && date.getMinutes() <= 1) {
                const label = pad2(hour) + ':00';
                setHourPulse({ label, at: Date.now() });
                if (current.voice) speakHour(label);
              }

              if (current.advance) {
                const reminder = takeAdvanceReminder(
                  date,
                  current,
                  eventsRef.current,
                  advanceFiredRef.current,
                );
                if (reminder) {
                  const title = reminder.title || t(reminder.titleKey || 'agendaTitle');
                  setAlert({
                    key: 'advance:' + reminder.key + ':' + reminder.threshold,
                    text: t('advanceReminder', { minutes: reminder.minutes, title }),
                  });
                  if (current.sound) beep(true);
                }
              }

              const meetingMs = date.getTime();
              const meetingList = eventsRef.current;
              if (meetingList.length && current.agenda) {
                for (const event of meetingList) {
                  if (event.allDay) continue;
                  if (event.start > meetingMs || event.start < meetingMs - 90000) continue;
                  const meetingKey = event.id + ':' + event.start;
                  if (firedMeetingsRef.current.has(meetingKey)) continue;
                  firedMeetingsRef.current.add(meetingKey);
                  setAlert({
                    key: 'meeting:' + meetingKey,
                    text: t('remindMeeting', { title: event.title }),
                  });
                  setCollapsed(false);
                  writeStore({ collapsed: false });
                  if (current.sound) beep();
                  break;
                }
              }

              if (prev !== null && sec > prev && sec - prev <= 120) {
                const candidates = [
                  { key: 'lunch', at: clockSeconds(current.lunch), textKey: 'remindLunch' },
                  { key: 'dinner', at: clockSeconds(current.dinner), textKey: 'remindDinner' },
                ];
                let fired = null;
                for (const candidate of candidates) {
                  if (candidate.at === null) continue;
                  if (prev < candidate.at && sec >= candidate.at && sec - candidate.at <= 120) {
                    fired = candidate;
                  }
                }
                if (fired) {
                  setAlert({ key: fired.key, text: t(fired.textKey) });
                  setCollapsed(false);
                  writeStore({ collapsed: false });
                  if (current.sound) beep();
                }
              }

              const active =
                punchRef.current && punchRef.current.date === dayKeyOf(date)
                  ? punchRef.current
                  : null;
              if (active || isWorkday(date, current)) {
                const offAt = active
                  ? active.out
                    ? null
                    : active.in + WORKDAY_MS
                  : endOfDayMs(date, current);
                if (
                  offAt !== null &&
                  prevMs !== null &&
                  prevMs < offAt &&
                  date.getTime() >= offAt &&
                  date.getTime() - offAt <= 120000
                ) {
                  setAlert({ key: 'offWork', text: t('remindOffWork') });
                  setCollapsed(false);
                  writeStore({ collapsed: false });
                  if (current.sound) beep();
                }
              }
            }, 1000);
            return () => window.clearInterval(timer);
          }, []);

          React.useEffect(() => {
            if (!alert) return undefined;
            const timer = window.setTimeout(() => setAlert(null), 60000);
            return () => window.clearTimeout(timer);
          }, [alert]);

          React.useEffect(() => {
            if (!hourPulse) return undefined;
            const timer = window.setTimeout(() => setHourPulse(null), 3400);
            return () => window.clearTimeout(timer);
          }, [hourPulse]);

          React.useEffect(
            () => () => {
              const audio = audioRef.current;
              if (audio && typeof audio.close === 'function') {
                const closed = audio.close();
                if (closed && typeof closed.catch === 'function') closed.catch(() => {});
              }
              audioRef.current = null;
            },
            [],
          );

          React.useEffect(() => {
            const endDrag = () => {
              if (!dragRef.current) return;
              dragRef.current = null;
              if (posRef.current) writeStore({ pos: posRef.current });
            };
            window.addEventListener('pointerup', endDrag);
            window.addEventListener('pointercancel', endDrag);
            return () => {
              window.removeEventListener('pointerup', endDrag);
              window.removeEventListener('pointercancel', endDrag);
            };
          }, []);

          React.useEffect(() => {
            const fit = () => {
              const element = cardRef.current;
              const current = posRef.current;
              if (!element || !current) return;
              const rect = element.getBoundingClientRect();
              const next = {
                left: clamp(current.left, 4, Math.max(4, window.innerWidth - rect.width - 4)),
                top: clamp(current.top, 4, Math.max(4, window.innerHeight - rect.height - 4)),
              };
              if (next.left === current.left && next.top === current.top) return;
              posRef.current = next;
              setPos(next);
              writeStore({ pos: next });
            };
            fit();
            window.addEventListener('resize', fit);
            return () => window.removeEventListener('resize', fit);
          }, [collapsed, showSettings, punch, office.calendar]);

          function refreshOffice() {
            if (refreshing) return;
            const load = loadOfficeRef.current;
            if (load) load(true);
          }

          function updateSettings(patch) {
            const next = normalizeSettings({ ...settings, ...patch });
            setSettings(next);
            writeStore({ settings: next });
          }

          function toggleCollapsed() {
            const next = !collapsed;
            setCollapsed(next);
            writeStore({ collapsed: next });
          }

          function resetPosition() {
            posRef.current = null;
            setPos(null);
            writeStore({ pos: null });
          }

          function handlePunchIn() {
            const at = Date.now();
            const next = { date: dayKeyOf(new Date(at)), in: at, out: null };
            setPunch(next);
            writeStore({ punch: next });
          }

          function clearPunch() {
            setPunch(null);
            writeStore({ punch: null });
          }

          function handlePointerDown(event) {
            if (event.button !== 0) return;
            const target = event.target;
            if (target && typeof target.closest === 'function' && target.closest('button, input, label, a')) return;
            const element = cardRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            dragRef.current = {
              px: event.clientX,
              py: event.clientY,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
            if (event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function') {
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch (error) {
                /* Capture is an optimization; the window pointerup still ends the drag. */
              }
            }
            event.preventDefault();
          }

          function handlePointerMove(event) {
            const drag = dragRef.current;
            if (!drag) return;
            const next = {
              left: clamp(drag.left + event.clientX - drag.px, 4, Math.max(4, window.innerWidth - drag.width - 4)),
              top: clamp(drag.top + event.clientY - drag.py, 4, Math.max(4, window.innerHeight - drag.height - 4)),
            };
            posRef.current = next;
            setPos(next);
          }

          const date = new Date(now);
          const nowSec = secondsOfDay(date);
          const view = workView(date, settings);
          const activePunch = punch && punch.date === todayKey ? punch : null;
          const endToday = endOfDayMs(date, settings);
          const punchEndTarget = activePunch ? activePunch.in + WORKDAY_MS : endToday;
          let mainLabelKey = view.mode === 'work' ? 'untilOffWork' : 'untilStart';
          let mainValue = formatCountdown(view.seconds, t);
          let mainChipKey =
            view.mode === 'before'
              ? 'statusBefore'
              : view.mode === 'done'
                ? 'statusOff'
                : view.mode === 'rest'
                  ? 'statusRest'
                  : 'notPunched';
          let mainSecondary = null;
          let mainPct = view.pct;
          let showProgress = view.mode !== 'rest';
          let progressLeft = t('workStartShort') + ' ' + settings.workStart;
          let progressRight = t('workEndShort') + ' ' + settings.workEnd;

          const autoOut =
            activePunch && !activePunch.out && now >= punchEndTarget ? punchEndTarget : null;
          const punchEnd = activePunch ? activePunch.out || autoOut : null;

          if (activePunch && punchEnd) {
            const total = Math.max(0, (punchEnd - activePunch.in) / 1000);
            mainLabelKey = 'todayWork';
            mainValue = formatCountdown(total, t);
            mainChipKey = 'punchedOut';
            mainSecondary = clockHM(activePunch.in) + ' – ' + clockHM(punchEnd);
            mainPct = 1;
            showProgress = true;
            progressLeft = t('workStartShort') + ' ' + clockHM(activePunch.in);
            progressRight = t('workEndShort') + ' ' + clockHM(punchEnd);
          } else if (activePunch) {
            const elapsed = Math.max(0, (now - activePunch.in) / 1000);
            const untilEnd = (punchEndTarget - now) / 1000;
            mainLabelKey = 'workedTime';
            mainValue = formatCountdown(elapsed, t);
            mainChipKey = 'punchedIn';
            mainSecondary =
              untilEnd < 0
                ? t('overtime') + ' ' + formatCountdown(-untilEnd, t)
                : t('untilOffWork') + ' ' + formatCountdown(untilEnd, t);
            mainPct =
              punchEndTarget > activePunch.in
                ? clamp((now - activePunch.in) / (punchEndTarget - activePunch.in), 0, 1)
                : 1;
            showProgress = true;
            progressLeft = t('workStartShort') + ' ' + clockHM(activePunch.in);
            progressRight = t('workEndShort') + ' ' + clockHM(punchEndTarget);
          } else {
            if (view.mode === 'before' || view.mode === 'work') mainSecondary = t('punchHint');
            showProgress = false;
          }

          const calendar = office.calendar;
          const calendarConnected = !!(calendar && calendar.connected);
          const meetings =
            calendarConnected && settings.agenda && Array.isArray(calendar.events)
              ? calendar.events
              : [];
          const nowMs = now;
          const allDayMeetings = meetings.filter((event) => event.allDay && event.end > nowMs);
          const ongoingMeetings = meetings.filter(
            (event) => !event.allDay && event.start <= nowMs && nowMs < event.end,
          );
          const upcomingMeetings = meetings.filter((event) => !event.allDay && event.start > nowMs);
          const agendaRows = [];
          if (allDayMeetings[0]) agendaRows.push({ event: allDayMeetings[0], kind: 'allday' });
          if (ongoingMeetings[0]) agendaRows.push({ event: ongoingMeetings[0], kind: 'now' });
          for (const event of upcomingMeetings) {
            if (agendaRows.length >= 3) break;
            agendaRows.push({ event, kind: 'next' });
          }
          eventsRef.current = meetings;
          const todayMeetingCount = meetings.length;
          const nextMeeting = upcomingMeetings[0] || null;

          const calendarStatus = !office.calendar
            ? office.error
              ? t('unavailable')
              : t('checking')
            : !settings.agenda
              ? t('off')
              : office.calendar.connected
                ? t('connectedCount', { n: todayMeetingCount })
                : office.calendar.reason === 'missing'
                  ? t('calendarMissing')
                  : office.calendar.reason === 'auth'
                    ? t('calendarAuth')
                    : t('calendarError');
          const calendarHint =
            settings.agenda && office.calendar && !office.calendar.connected
              ? office.calendar.reason === 'missing'
                ? t('calendarMissingHint')
                : office.calendar.reason === 'auth'
                  ? t('calendarAuthHint')
                  : t('calendarErrorHint')
              : null;
          const weatherStatus = !settings.weather
            ? t('off')
            : office.weather
              ? (office.weather.city ? office.weather.city + ' · ' : '') +
                Math.round(office.weather.temperature) +
                '°C'
              : office.error
                ? t('unavailable')
                : t('checking');
          const punchSummary = !activePunch
            ? t('notPunched')
            : punchEnd
              ? clockHM(activePunch.in) + ' – ' + clockHM(punchEnd)
              : clockHM(activePunch.in) + ' ' + t('workStartShort');

          const rows = [
            { key: 'lunch', emoji: '🍚', at: clockSeconds(settings.lunch) },
            { key: 'dinner', emoji: '🍜', at: clockSeconds(settings.dinner) },
          ];
          let nextKey = null;
          let nextRemain = Infinity;
          for (const row of rows) {
            if (row.at === null) continue;
            const remain = row.at - nowSec;
            if (remain > 0 && remain < nextRemain) {
              nextRemain = remain;
              nextKey = row.key;
            }
          }

          const dateText = new Intl.DateTimeFormat(
            localeSnapshot.active === 'zh' ? 'zh-CN' : localeSnapshot.active,
            { month: 'short', day: 'numeric', weekday: 'short' },
          ).format(date);
          const timeText =
            pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());

          const rootStyle = {
            '--dwc-accent': phaseAccent(date),
            ...(pos ? { left: pos.left + 'px', top: pos.top + 'px', right: 'auto', bottom: 'auto' } : null),
          };

          const field = (key, label) =>
            h(
              'label',
              { className: 'dwc-field', key },
              h('span', null, label),
              h('input', {
                type: 'time',
                value: settings[key],
                onChange: (event) => {
                  const value = event.target.value;
                  if (/^\d{2}:\d{2}$/.test(value)) updateSettings({ [key]: value });
                },
              }),
            );

          return h(
            React.Fragment,
            null,
            h('style', { key: 'style' }, CSS),
            h(
              'div',
              {
                key: 'root',
                ref: cardRef,
                className: 'dwc-root' + (collapsed ? ' dwc-collapsed' : ''),
                style: rootStyle,
              },
              h(
                'div',
                { className: 'dwc-card' },
                hourPulse
                  ? h(
                      'div',
                      {
                        key: hourPulse.at,
                        className: 'dwc-hour',
                        role: 'status',
                        'aria-live': 'polite',
                      },
                      h('span', { className: 'dwc-hour-time' }, hourPulse.label),
                      h('span', { className: 'dwc-hour-label' }, t('hourAnnounce')),
                    )
                  : null,
                h(
                  'div',
                  {
                    className: 'dwc-head',
                    title: t('dragHint'),
                    onPointerDown: handlePointerDown,
                    onPointerMove: handlePointerMove,
                  },
                  h('span', { className: 'dwc-mark', 'aria-hidden': true }, clockMark()),
                  h('span', { className: 'dwc-title' }, t('title')),
                  office.weather && settings.weather
                    ? h(
                        'span',
                        {
                          className: 'dwc-weather',
                          title:
                            (office.weather.city ? office.weather.city + ' · ' : '') +
                            Math.round(office.weather.temperature) +
                            '°C',
                        },
                        h(
                          'span',
                          { className: 'dwc-weather-icon', 'aria-hidden': true },
                          weatherEmoji(office.weather.code, office.weather.isDay),
                        ),
                        h(
                          'span',
                          { className: 'dwc-weather-temp' },
                          Math.round(office.weather.temperature) + '°C',
                        ),
                      )
                    : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwc-icon-btn' + (refreshing ? ' is-spinning' : ''),
                      'aria-label': refreshing ? t('refreshing') : t('refresh'),
                      'aria-busy': refreshing,
                      title: refreshing ? t('refreshing') : t('refresh'),
                      disabled: refreshing || !settings.agenda,
                      onClick: refreshOffice,
                    },
                    refreshIcon(),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwc-icon-btn',
                      'aria-label': t('settings'),
                      'aria-expanded': showSettings,
                      title: t('settings'),
                      onClick: () => setShowSettings((value) => !value),
                    },
                    slidersIcon(),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwc-icon-btn',
                      'aria-label': collapsed ? t('expand') : t('collapse'),
                      title: collapsed ? t('expand') : t('collapse'),
                      onClick: toggleCollapsed,
                    },
                    chevronIcon(!collapsed),
                  ),
                ),
                collapsed
                  ? h(
                      'div',
                      {
                        className: 'dwc-collapsed-row',
                        role: 'button',
                        tabIndex: 0,
                        onClick: toggleCollapsed,
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleCollapsed();
                          }
                        },
                      },
                      h('span', null, t(mainLabelKey)),
                      h('span', { className: 'dwc-collapsed-value' }, mainValue),
                    )
                  : h(
                      'div',
                      { className: 'dwc-body' },
                      h(
                        'div',
                        { className: 'dwc-meta' },
                        h('span', { className: 'dwc-meta-time' }, timeText),
                        h('span', null, dateText),
                      ),
                      alert
                        ? h(
                            'div',
                            { className: 'dwc-alert', role: 'status', 'aria-live': 'polite' },
                            h('span', { className: 'dwc-alert-text' }, alert.text),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dwc-alert-close',
                                'aria-label': t('dismiss'),
                                title: t('dismiss'),
                                onClick: () => setAlert(null),
                              },
                              '×',
                            ),
                          )
                        : null,
                      h(
                        'div',
                        { className: 'dwc-count-label' },
                        h('span', null, t(mainLabelKey)),
                        h('span', { className: 'dwc-chip' }, t(mainChipKey)),
                      ),
                      h('div', { className: 'dwc-count' }, mainValue),
                      mainSecondary
                        ? h('div', { className: 'dwc-subline' }, mainSecondary)
                        : null,
                      !activePunch
                        ? h(
                            'button',
                            { type: 'button', className: 'dwc-punch', onClick: handlePunchIn },
                            t('punchIn'),
                          )
                        : null,
                      showProgress
                        ? h(
                            'div',
                            null,
                            h(
                              'div',
                              { className: 'dwc-progress' },
                              h('div', {
                                className: 'dwc-progress-fill',
                                style: { width: Math.round(clamp(mainPct, 0, 1) * 100) + '%' },
                              }),
                            ),
                            h(
                              'div',
                              { className: 'dwc-progress-meta' },
                              h('span', null, progressLeft),
                              h('span', null, progressRight),
                            ),
                          )
                        : null,
                      h(
                        'div',
                        { className: 'dwc-events' },
                        rows.map((row) => {
                          const remain = row.at === null ? 0 : row.at - nowSec;
                          const past = remain <= 0;
                          const isNext = !past && row.key === nextKey;
                          return h(
                            'div',
                            {
                              key: row.key,
                              className:
                                'dwc-event' + (past ? ' is-past' : '') + (isNext ? ' is-next' : ''),
                            },
                            h('span', { className: 'dwc-event-emoji', 'aria-hidden': true }, row.emoji),
                            h('span', { className: 'dwc-event-name' }, t(row.key)),
                            h('span', { className: 'dwc-event-at' }, settings[row.key]),
                            h(
                              'span',
                              { className: 'dwc-event-remain' },
                              past ? t('passed') : formatRemaining(remain, t),
                            ),
                          );
                        }),
                      ),
                      settings.agenda && calendarConnected
                        ? h(
                            'div',
                            { className: 'dwc-agenda' },
                            h(
                              'div',
                              { className: 'dwc-agenda-head' },
                              h('span', null, t('agendaTitle')),
                              h(
                                'span',
                                { className: 'dwc-agenda-count' },
                                t('meetingCount', { n: todayMeetingCount }),
                              ),
                            ),
                            agendaRows.length
                              ? agendaRows.map(({ event, kind }) => {
                                  const isNow = kind === 'now';
                                  const isNext = event === nextMeeting;
                                  const allDay = kind === 'allday';
                                  const remain = (event.start - nowMs) / 1000;
                                  const when = allDay
                                    ? t('allDay')
                                    : clockHM(event.start) + '–' + clockHM(event.end);
                                  const status = allDay
                                    ? ''
                                    : isNow
                                      ? t('meetingNow')
                                      : formatRemaining(remain, t);
                                  return h(
                                    'div',
                                    {
                                      key: event.id,
                                      className:
                                        'dwc-meeting' +
                                        (isNow ? ' is-now' : '') +
                                        (isNext ? ' is-next' : '') +
                                        (allDay ? ' is-allday' : ''),
                                      title:
                                        event.title +
                                        (event.location ? ' · ' + event.location : ''),
                                    },
                                    h('span', { className: 'dwc-meeting-time' }, when),
                                    h('span', { className: 'dwc-meeting-title' }, event.title),
                                    h('span', { className: 'dwc-meeting-status' }, status),
                                  );
                                })
                              : h(
                                  'div',
                                  { className: 'dwc-agenda-empty' },
                                  todayMeetingCount ? t('agendaDone') : t('noMeetings'),
                                ),
                          )
                        : null,
                      showSettings
                        ? h(
                            'div',
                            { className: 'dwc-settings' },
                            field('workStart', t('fieldStart')),
                            field('workEnd', t('fieldEnd')),
                            h('div', { className: 'dwc-hint' }, t('nineHourHint')),
                            field('lunch', t('fieldLunch')),
                            field('dinner', t('fieldDinner')),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.weekdayOnly,
                                onChange: (event) => updateSettings({ weekdayOnly: event.target.checked }),
                              }),
                              h('span', null, t('weekdayOnly')),
                            ),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.sound,
                                onChange: (event) => updateSettings({ sound: event.target.checked }),
                              }),
                              h('span', null, t('sound')),
                            ),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.voice,
                                onChange: (event) => updateSettings({ voice: event.target.checked }),
                              }),
                              h('span', null, t('voice')),
                            ),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.weather,
                                onChange: (event) => updateSettings({ weather: event.target.checked }),
                              }),
                              h('span', null, t('showWeather')),
                            ),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.agenda,
                                onChange: (event) => updateSettings({ agenda: event.target.checked }),
                              }),
                              h('span', null, t('showAgenda')),
                            ),
                            h(
                              'label',
                              { className: 'dwc-check' },
                              h('input', {
                                type: 'checkbox',
                                checked: settings.advance,
                                onChange: (event) => updateSettings({ advance: event.target.checked }),
                              }),
                              h('span', null, t('advance')),
                            ),
                            h(
                              'div',
                              { className: 'dwc-setting-block' },
                              h('div', { className: 'dwc-setting-title' }, t('punchLabel')),
                              h('div', { className: 'dwc-status' }, h('span', null, punchSummary)),
                              activePunch
                                ? h(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'dwc-text-btn',
                                      onClick: clearPunch,
                                    },
                                    t('clearPunch'),
                                  )
                                : null,
                            ),
                            h(
                              'div',
                              { className: 'dwc-setting-block' },
                              h('div', { className: 'dwc-setting-title' }, t('integrations')),
                              h(
                                'div',
                                { className: 'dwc-status' },
                                h('span', null, t('calendarLabel')),
                                h(
                                  'span',
                                  {
                                    className: 'dwc-status-value',
                                    title: (office.calendar && office.calendar.message) || '',
                                  },
                                  calendarStatus,
                                ),
                              ),
                              calendarHint ? h('div', { className: 'dwc-hint' }, calendarHint) : null,
                              h(
                                'div',
                                { className: 'dwc-status' },
                                h('span', null, t('weatherLabel')),
                                h(
                                  'span',
                                  { className: 'dwc-status-value' },
                                  weatherStatus,
                                ),
                              ),
                              office.error && !office.weather && !calendarConnected
                                ? h('div', { className: 'dwc-hint' }, t('serviceOffline'))
                                : null,
                            ),
                            h(
                              'div',
                              { className: 'dwc-actions' },
                              h(
                                'button',
                                { type: 'button', className: 'dwc-text-btn', onClick: resetPosition },
                                t('resetPosition'),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'dwc-text-btn',
                                  onClick: () => updateSettings(DEFAULTS),
                                },
                                t('resetSettings'),
                              ),
                            ),
                          )
                        : null,
                    ),
              ),
            ),
          );
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'work-clock', order: 125 }, WorkClock),
        );
      },
    };
  },
});
