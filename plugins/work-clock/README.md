# work-clock

浮动「工作时钟」浮窗：显示打卡工时（下班 = 上班打卡 + 9 小时）、天气和今日飞书日程，并在临近日程开始前 10 / 5 / 1 分钟，以及午餐、晚餐、会议开始时提醒。

包名 `work-clock`，由 host 半（`index.js`）与 client 半（`client.js`）组成，装在 dsh profile 里即生效。

> 2026-11-04 从 `FLES/plugins/work-clock` 迁入本仓库，原目录已删除。此后该插件只在这里维护。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | host 半：注册 `GET /work-clock/state`，聚合天气与飞书日程 |
| `client.js` | client 半：`shell.overlay` 槽位里的浮窗，含设置面板与提醒 |
| `cordis.patch.yml` | bundle patch，把 `work-clock` 插入 loader |
| `locale/zh.json`、`locale/en.json` | 插件元信息（`meta.title` / `meta.description`） |
| `icon.svg` | 浮窗图标 |

## host 半

`apply(ctx)` 只做一件事：通过 `webServer` 注册精确路由 `/work-clock/state`，进入前用 `connection.requestRejection(req)` 复用宿主鉴权。查询参数：

| 参数 | 含义 |
| --- | --- |
| `weather=0` | 不要天气（默认要） |
| `agenda=0` | 不要日程（默认要） |
| `refresh=1` | 强制刷新日程，绕过 1 分钟缓存 |

返回 `{ ok, now, weather, weatherError, calendar }`。天气来自 `ipwho.is` / `ipapi.co` 定位 + `open-meteo` 当前温度与天气码，缓存 10 分钟（失败缓存 1 分钟），无需 API key。日程来自 `lark-cli calendar +agenda --as user --format json`，缓存 1 分钟，过滤已拒绝与已取消的日程，最多 24 条。

`lark-cli` 按 `LARK_CLI_PATH` → `~/.local/bin` → Homebrew → volta → nvm 各版本依次查找；找不到或未登录时不影响浮窗本身，只把「连接」状态标成未连接/登录失效，并提示在终端执行 `lark-cli auth login`。因为 `lark-cli` 的 shebang 是 `#!/usr/bin/env node`，host 半还会补一个 Node 目录到子进程 `PATH`，避免从 Finder 启动时没有 Node。

## client 半

注册到 `shell.overlay`（`id: work-clock`，`order: 125`），可拖动、可收起，位置与设置存在 `localStorage` 的 `dsh.work-clock.v1`。

- **强调色**按时段连续插值（凌晨靛蓝 → 白天青 → 午间琥珀 → 午后紫 → 夜晚靛蓝），不按整点跳变。
- **工时**：打卡后以下班 = 打卡 + 9 小时为基准倒计时；未打卡时显示距上班时间。
- **提醒**：午餐、晚餐、下班、会议开始各触发一次；日程提前 10 / 5 / 1 分钟提醒（可关）。提醒音效与整点语音报时（`SpeechSynthesis`）分别由「提醒音效」「整点语音报时」控制。
- **日程**：每 5 分钟自动刷新，也可手动刷新；标出进行中/下一场，显示组织者、地点、会议链接。
- **设置**：上班时间、计划下班、午餐、晚餐、仅工作日计算下班、提醒音效、整点报时、显示天气、显示今日日程、提前提醒、重置位置、默认时间。

`package.json` 里 `dsh.client` 声明 `platform: web` 且 `immediately: true`，所以页面加载即挂载，不依赖打开某个面板。

## 安装

```bash
./install.sh plugin work-clock --profile desktop
```

dsh 的 client 模块系统用**包名**作注册键（graph row id），所以下面三处必须一致，改名时一起改：

- `package.json` 的 `name`
- `cordis.patch.yml` 里 `insert[].name`
- `client.js` 顶部 `window.__ModuleLoader__.load({ id })`

装完需重启 dsh 才生效。仓库里改了代码后，因为插件是 link 装进去的，重启 dsh 即可加载新版本，不必重装。

## 依赖与边界

- dsh `>=0.2.0 <0.3.0`，用到 `webServer`（`register`）与 `connection`（`requestRejection`）两个服务。
- 天气与定位走公网 HTTP，离线时浮窗仍可用，只是天气位显示不可用。
- 日程强依赖本机 `lark-cli` 与用户身份的飞书登录态；应用（bot）身份拿不到个人日历。
