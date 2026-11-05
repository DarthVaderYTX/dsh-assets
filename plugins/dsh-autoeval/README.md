# AutoEval

把「跑一次评测」拆成四个固定阶段的 DSH 插件：**Scraping → Annotation → Metrics → Reporting**。
每个阶段都自带执行模板（preset），也都能整体换成**自定义命令**；左侧栏点开图标就能改阶段参数、
贴用例集、跑一次、读报告，不用写代码。

内置评测模板 **WebSearchTool 检索覆盖**：拿一批 query 走 harness 的 `web` 检索服务，把返回的
摘要与来源当材料，按信息点判覆盖（全命中记 1，缺一条记 0，冲突不计错），最后出通过率与
Markdown 报告。

## 界面

左侧栏新增一个 **AutoEval** 图标（`sidebar.panellist`，order 20），点开是主面板（`main` 槽位，key `autoeval`），四个页签：

| 页签 | 干什么 |
| --- | --- |
| **运行** | 选评测模板 → 四个阶段各挑执行模板、改参数 → 贴用例 JSON → 开始运行；运行中显示阶段进度条，结束后给通过率/P50 摘要 |
| **评测任务** | 管理已经提交的评测任务：搜索（名称 / id / 模板）、按状态筛（全部 / 运行中 / 完成 / 失败 / 已取消）；每行可展开看阶段、耗时、产物目录和日志；操作有查看报告、重跑、删除（运行中的给取消） |
| **任务模板** | 管理当前支持的评测模板：内置模板只读（可复制），自定义模板可新建、编辑、复制、删除；编辑器里逐阶段挑执行模板、改参数 JSON、填自定义命令 |
| **报告** | 直接看落盘的 Markdown，可刷新 |

「运行」页的「存为模板」会把当前四个阶段的配置带进模板编辑器，改完名字保存即可。

## 四个阶段与执行模板

| 阶段 | 内置模板 | 干什么 |
| --- | --- | --- |
| Scraping | `websearch` | 逐条用例调 `ctx.web.search`，把 `content` + 每个来源的标题/摘要拼成 `material` |
| | `inline` | 用例自带 `material`（离线复算用） |
| | `custom` | 自定义命令 |
| Annotation | `coverage-keyword` | 按 `infoPoints` 判覆盖 |
| | `coverage-rubric` | 按 `rubric`（`;`/`；`/换行分隔）判覆盖 |
| | `custom` | 自定义命令 |
| Metrics | `standard` | 通过率（分母=有分数的行）、平均覆盖、P50/P95 检索耗时、抓取失败数 |
| | `grouped` | 在 `standard` 基础上按某个字段分组 |
| | `custom` | 自定义命令 |
| Reporting | `markdown` | 报告（总览 / 阶段耗时 / 逐条结果 / 未通过） |
| | `json` | 全量 JSON 快照 |
| | `custom` | 自定义命令 |

### 判分口径（内置标注）

照搬 ocsc 的 coverage 口径，改动会写在报告里，不自作主张：

- 信息点全部出现在材料里 → **1**；缺任意一条 → **0**。
- 材料里同时出现矛盾说法、不同数值、与 rubric 表述不一致的内容，**不扣分**。
- 一个信息点可以写成 `a|b`，任一词命中即算覆盖。
- 通过率的分母是「有分数的行」，抓取失败的行单列 `scrapeErrors`，两个数不混着说。

### 自定义执行契约

选 `custom` 的阶段会跑你填的命令（`bash -lc`），超时 120s：

- **stdin**：一段 JSON，含 `stage`、`cases`、`config`（`metrics`/`reporting` 阶段还带 `stages`、`metrics`、`run`）。
- **stdout**：一段 JSON，必须是合法 JSON，否则该阶段失败。
  - Scraping / Annotation：JSON 数组（新的用例数组）。
  - Metrics：对象（当作 `summary`）。
  - Reporting：对象，`{ "text": "...", "format": "markdown" }`。

例：接一个大模型当评委

```bash
#!/usr/bin/env bash
# stdin: {"stage":"annotation","cases":[...],"config":{...}}
python3 ./llm-judge.py     # 自己读 stdin、算分，把带 score 的数组打到 stdout
```

## 面板背后的 HTTP 接口

面板和宿主之间只有同源 HTTP，没有别的桥。所有接口都在 `/autoeval-api` 下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 阶段目录 + 模板 + 历史运行 + 当前运行进度 |
| POST | `/run` | `{ name, templateId, cases, stages }` → `{ runId }`，后台跑 |
| POST | `/cancel` | 取消当前运行 |
| GET | `/runs/detail?id=<id>` | 单次任务的阶段、参数与日志 |
| POST | `/runs/rerun` | `{ id }` 按原用例与阶段配置重跑 |
| DELETE | `/runs?id=<id>` | 删掉一次任务（记录 + 产物目录） |
| GET | `/report?run=<id>` | 读报告正文 |
| GET | `/rows?run=<id>` | 读 `rows.jsonl` |
| POST | `/templates` | 存一份自定义模板（同 id 覆盖） |
| DELETE | `/templates?id=<id>` | 删掉自定义模板 |

agent 侧另有两个工具：`autoeval_run`、`autoeval_status`。

## 数据落在哪

```
$DSH_HOME/storages/autoeval/            （默认 ~/.dsh）
├── state.json                          模板 + 最近 30 次运行（含阶段配置）
└── runs/<runId>/
    ├── cases.json                        本次提交的用例快照（重跑靠它）
    ├── report.md     或 report.json
    └── rows.jsonl                        逐条结果（含材料与来源）
```

删除任务时整个 `runs/<runId>/` 一起删。

## 安装

```bash
# 在 dsh-assets 仓库里
./install.sh autoeval                   # 见 dsh-assets/README.md
```

或直接用宿主插件管理器安装本目录（绝对路径）。安装后**刷新页面**，左侧栏出现 AutoEval 图标。

卸载：`plugin_manager` 移除 `dsh-autoeval` 包，或 `./install.sh --remove autoeval`。
运行数据不会自动删，需要的话手动删 `~/.dsh/storages/autoeval/`。

## 文件

```
dsh-autoeval/
├── package.json          dsh.bundle.patch + dsh.client
├── cordis.patch.yml      insert 一行 autoeval
├── index.js              宿主：阶段执行、存储、/autoeval-api、两个工具
├── client.js             浏览器：侧栏图标 + 主面板
├── locale/{zh,en}.json   插件管理器里的标题与说明
├── icon.svg              插件图标
├── test/                 小测试集 + 宿主/面板回归测试
└── README.md
```

## 自测

```bash
cd plugins/dsh-autoeval
node --test          # 23 个用例：宿主流水线 13 + 浏览器面板 10
```

- `test/pipeline.test.mjs`：假 ctx + 假 `web` 服务跑完整四阶段、自定义命令、任务详情/重跑/删除、错误路径、模板增删；数据写在临时 `DSH_HOME` 里。
- `test/client.test.mjs`：用迷你 React 渲染面板，检查侧栏/主面板注册、四阶段渲染、点「开始运行」发出的 `/run` body、四个页签的渲染、任务页的筛选/展开/重跑/删除、模板页的新建与保存。

## 已知限制

- 同一时刻只允许一次运行；排队不做。
- 抓取串行 + 每条间隔 250ms（可在阶段参数里改 `intervalMs`），没有并发抓取。
- 自定义命令在宿主进程里用 `bash -lc` 跑，没有沙箱隔离——只填自己信得过的命令。
- 报告是纯 Markdown 文本，面板里按等宽预排版展示，不渲染表格样式。
