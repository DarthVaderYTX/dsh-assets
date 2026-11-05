# AutoEval

把「跑一次评测」拆成四个固定阶段的 DSH 插件：**Scraping → Annotation → Metrics → Reporting**。
每个阶段都自带执行模板（preset），也都能整体换成**自定义命令**；左侧栏点开图标就能改阶段参数、
贴用例集、跑一次、读报告，不用写代码。

内置评测模板 **WebSearchTool 检索覆盖**：拿一批 query 走 harness 的 `web` 检索服务，把返回的
摘要与来源当材料，按信息点判覆盖（全命中记 1，缺一条记 0，冲突不计错），最后出通过率与
Markdown 报告。

## 界面

左侧栏新增一个 **AutoEval** 图标（`sidebar.panellist`，order 20），点开是主面板（`main` 槽位，key `autoeval`）。面板只有两个页签，列表点进去是详情页：

| 页签 | 列表 | 点进去 |
| --- | --- | --- |
| **评测任务** | 已提交的评测任务：搜索（名称 / id / 模板）、按状态筛（全部 / 运行中 / 完成 / 失败 / 已取消）；右上角「提交任务」进提交表单；每行可重跑、删除，运行中的可取消 | 任务详情：概览（指标卡 + **四个阶段的可折叠列表** + 产物目录 + 日志）+ 逐条结果（每条用例的分数 / 覆盖 / 缺失信息点 / 来源数，可展开看材料）+ 报告（落盘的 Markdown）；顶部可重跑或删除 |
| **任务模板** | 当前支持的评测模板，卡片式列出并标出内置 / 自定义；配置坏掉的模板带红标 | 模板详情：模板 id、名称、说明 + 两个子页签——**表单**（四个阶段各挑执行模板，字段按 schema 生成控件：数字带范围、枚举多选、命令输入框）和 **YAML**（直接改配置文件内容）；自定义模板可改可存，内置模板只读、只能复制 |

阶段的可折叠列表：每条一行，表头给阶段名、状态、该阶段耗时，跑着的时候还带 `已完成/总数` 与进度条；展开看这一阶段用的执行模板、参数、跑完的摘要（抓取的用例数/带材料/来源数/失败数、标注的计分行与通过数、指标的通过率与 P50/P95、报告的字数与结果行数）以及该阶段的日志。运行中或失败的阶段默认展开，其余收起。

「提交任务」**只能从已有模板里选**：表单里挑一个任务模板、填任务名、贴用例 JSON，下面只读展示这个模板四个阶段会怎么跑；阶段配置一律取自模板本身，要改就先到「任务模板」里改模板。提交成功会直接跳到这次任务的详情页，边跑边看阶段进度。

同一条规则在宿主侧也生效：`POST /autoeval-api/run` 若带了已知的 `templateId`，外面塞进来的 `stages` 会被忽略，任务不会和模板悄悄漂移。重跑例外——它走 `stageSource: 'record'`，按当次运行记录里的阶段配置原样再跑一遍。

## 任务模板：YAML 配置文件

模板不存数据库，就是文件：`$DSH_HOME/storages/autoeval/templates/<id>.yaml`，一个模板一个文件，**文件名就是模板 id**。面板里存模板就是写这个文件，你直接用编辑器改它也立刻生效（列表每次请求都重新读盘）。

```yaml
# AutoEval 任务模板：检索覆盖（快检）
# 文件：templates/websearch-fast.yaml（文件名就是模板 id）
# 可以直接改这个文件，面板「任务模板 → YAML」能读回来；保存时按下面的注释校验。
id: websearch-fast
name: 检索覆盖（快检）
description: 每条只取 3 条结果，间隔 0
stages:
  scraping:
    template: websearch
    config:
      maxResults: 3  # 数字 1~20，默认 5
      queryField: query  # 字符串，默认 "query"，用例里存检索词的字段名
      intervalMs: 0  # 数字 0~5000，ms，默认 250
  annotation:
    template: coverage-keyword
    config:
      pointsField: infoPoints  # 字符串，默认 "infoPoints"
      minCoverage: 1  # 数字 0~1，默认 1
  metrics:
    template: standard
    config:
      latencyField: latencyMs  # 字符串，默认 "latencyMs"
  reporting:
    template: markdown
    config:
      sections: [summary, cases]  # 列表，可选：summary / stages / cases / failures
```

注释里的类型和范围不是手写的——保存时按字段 schema 生成，改字段表注释会跟着变。

### 每个阶段能配什么

| 阶段 | 执行模板 | 可配字段 |
| --- | --- | --- |
| scraping | `websearch` | `queryField` 字符串（默认 `query`）、`maxResults` 数字 1~20（默认 5）、`intervalMs` 数字 0~5000（默认 250） |
| | `inline` | — |
| | `custom` | `command` 命令，必填 |
| annotation | `coverage-keyword` | `pointsField` 字符串（默认 `infoPoints`）、`minCoverage` 数字 0~1（默认 1） |
| | `coverage-rubric` | `rubricField` 字符串（默认 `rubric`）、`minCoverage` 数字 0~1（默认 1） |
| | `custom` | `command` 命令，必填 |
| metrics | `standard` | `latencyField` 字符串（默认 `latencyMs`） |
| | `grouped` | `groupBy` 字符串（默认 `bucket`）、`latencyField` 字符串 |
| | `custom` | `command` 命令，必填 |
| reporting | `markdown` | `sections` 列表，取值 `summary` / `stages` / `cases` / `failures` |
| | `json` | — |
| | `custom` | `command` 命令，必填 |

这份字段表就是 `STAGES` 里每份 preset 的 `fields`，`/state` 会原样发给面板，**表单控件是从它生成的**：数字字段出带 `min/max/step` 的数字框，列表字段出多选 chips，命令字段出等宽输入框，字符串出文本框。

### 两种改法

- **改文件**：`templates/<id>.yaml` 直接编辑，下次打开面板就生效。写坏了不会静默吞掉——列表里标「配置有问题」，点进去默认停在 YAML 页签，把 `broken` 里的行号和原因读出来改掉即可。
- **用面板**：模板详情有「表单」和「YAML」两个子页签。表单改字段，保存时宿主重新渲染成 YAML 落盘；YAML 页签能直接改文件内容再保存。两条路写的是同一个文件，不会各改各的。

保存时会校验：模板 id 只能用小写字母/数字/`-`；四个阶段必须齐全；字段类型、数字范围、枚举取值、自定义命令非空，任何一项不对就带着具体字段名报错，不会写坏文件。不认识的额外字段会原样保留（方便你挂自定义参数），但不参与校验。

支持的 YAML 子集：块状映射与序列、`- key: value`、行内 `[a, b]` 与 `{a: b}`、单双引号字符串、数字/布尔/null、`#` 注释、`|` 与 `>` 文本块。锚点/别名、多文档这类高级写法不支持，遇到直接报错而不是猜。

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
| POST | `/run` | `{ name, templateId, cases }` → `{ runId }`，后台跑；给已知 `templateId` 时阶段配置取自模板 |
| POST | `/cancel` | 取消当前运行 |
| GET | `/runs/detail?id=<id>` | 单次任务的阶段、参数与日志 |
| POST | `/runs/rerun` | `{ id }` 按原用例与阶段配置重跑 |
| DELETE | `/runs?id=<id>` | 删掉一次任务（记录 + 产物目录） |
| GET | `/report?run=<id>` | 读报告正文 |
| GET | `/rows?run=<id>` | 读 `rows.jsonl` |
| POST | `/templates` | 存一份自定义模板（JSON → 渲染成 YAML 落盘，同 id 覆盖） |
| GET | `/templates/raw?id=<id>` | 读模板 YAML 原文 |
| POST | `/templates/raw` | `{ yaml }` 直接把一段 YAML 存成模板 |
| POST | `/templates/preview` | `{ id, name, stages }` → 只渲染 YAML 不落盘（新建模板时预览用） |
| DELETE | `/templates?id=<id>` | 删掉自定义模板（删文件） |

agent 侧另有两个工具：`autoeval_run`、`autoeval_status`。

## 数据落在哪

```
$DSH_HOME/storages/autoeval/            （默认 ~/.dsh）
├── state.json                          最近 30 次运行（含当次阶段配置）
├── templates/<id>.yaml                 任务模板：一个模板一个文件，可直接手改
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
├── index.js              宿主：阶段执行、模板 YAML 存储、/autoeval-api、两个工具
├── yaml.js               极简 YAML 解析/序列化（模板文件用）
├── client.js             浏览器：侧栏图标 + 主面板
├── locale/{zh,en}.json   插件管理器里的标题与说明
├── icon.svg              插件图标
├── test/                 小测试集 + 宿主/面板回归测试
└── README.md
```

## 自测

```bash
cd plugins/dsh-autoeval
node --test          # 37 个用例：宿主流水线 20 + 浏览器面板 17
```

- `test/pipeline.test.mjs`：假 ctx + 假 `web` 服务跑完整四阶段、自定义命令、模板优先级、模板 YAML 落盘与回读、老 state.json 模板迁移、坏配置拦截、任务详情/重跑/删除；数据写在临时 `DSH_HOME` 里。
- `test/client.test.mjs`：用迷你 React 渲染面板，检查侧栏/主面板注册、只有两个页签、任务列表与详情（指标 / 逐条 / 报告）、阶段折叠列表、提交表单只发模板、模板表单按 schema 生成控件、YAML 页签读改存、重跑与删除。

## 已知限制

- 同一时刻只允许一次运行；排队不做。
- 抓取串行 + 每条间隔 250ms（可在阶段参数里改 `intervalMs`），没有并发抓取。
- 自定义命令在宿主进程里用 `bash -lc` 跑，没有沙箱隔离——只填自己信得过的命令。
- 报告是纯 Markdown 文本，面板里按等宽预排版展示，不渲染表格样式。
- 模板 YAML 只支持常用子集，锚点、别名、多文档、复杂标签都不支持；写错了会报行号，但不会帮你纠正。
- 同时改文件又改面板时以最后保存的为准，没有版本冲突检测。
