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
| **评测任务** | 已提交的评测任务：搜索（名称 / id / 模板）、按状态筛（全部 / 运行中 / 完成 / 失败 / 已取消）；右上角「提交任务」进提交表单；每行可重跑、删除，运行中的可取消 | 任务详情：概览（指标卡 + **按组切换的阶段可折叠列表** + 组间对比 + 产物目录 + 日志）+ 逐条结果（每条用例的分数 / 覆盖 / 缺失信息点 / 来源数，可展开看材料）+ 报告（落盘的 Markdown）；顶部可重跑或删除 |
| **Queryset** | 管理评测用的 query 集合：卡片显示名称、条数、来源、更新时间；点进去看用例列表（只读），点「编辑」可改名称、说明和用例（一行一条 JSON） | 支持从 **JSONL / CSV / XLSX（含表头）/ 飞书表格 / 飞书智能表格** 导入：选来源 → 贴内容或选文件（飞书贴链接）→「解析」看预览与 `query` 列 → 存成 Queryset；已有的集可以「重新导入」覆盖用例。提交任务时可以直接选一个 Queryset，不用再粘 JSON |
| **任务模板** | 当前支持的评测模板，卡片式列出并标出内置 / 自定义；配置坏掉的模板带红标 | 模板详情：默认**只读查看**（id、名称、说明、**阶段列表（顺序即执行顺序）**与每阶段模块/参数、Control 与 Treatment 组），点「编辑」才可改；编辑态能加/删/上下移阶段、改每个阶段的默认模块与参数；编辑态有两个子页签——**表单**（字段按 schema 生成控件：数字带范围、枚举多选、命令输入框）和 **YAML**（直接改配置文件）；「保存」落盘，「取消」或直接返回会把未保存的修改丢掉，回到打开时的样子。内置模板没有「编辑」，只能复制 |

阶段的可折叠列表：每条一行，表头给阶段名、状态、该阶段耗时，跑着的时候还带 `已完成/总数` 与进度条；展开看这一阶段用的执行模板、参数、跑完的摘要（抓取的用例数/带材料/来源数/失败数、标注的计分行与通过数、指标的通过率与 P50/P95、报告的字数与结果行数）以及该阶段的日志。运行中或失败的阶段默认展开，其余收起。

「提交任务」和「保存模板」都会先弹一层确认，确认了才真的动：

- **提交任务**：点「运行」先出确认框，列出任务名、模板（名称 + id）、用例数，以及逐组的各阶段模块与参数（Control + 每个 Treatment 各一行），点「确认」才开跑
- **保存模板**：点「保存」先出确认框，列出模板 id / 名称 / 描述、阶段顺序与各阶段默认配置，点「确认」才重写 `templates/<id>.yaml`
- **保存 YAML**：同样先确认，顺带说明会按这段 YAML 重写文件

取消就是取消，不发请求也不改文件。agent 侧的 `autoeval_run` / `autoeval_status` 走的是工具调用，不经过面板这层确认。

「提交任务」**只能从已有模板里选**：模板是一个下拉列表——点开有搜索框，按名称、id 或说明做关键词过滤（不区分大小写，多个模板同名也能靠 id 区分），选中后自动收起并回填；再填任务名、贴用例 JSON，下面只读展示这个模板四个阶段会怎么跑；阶段配置一律取自模板本身，要改就先到「任务模板」里改模板。提交成功会直接跳到这次任务的详情页，边跑边看阶段进度。

同一条规则在宿主侧也生效：`POST /autoeval-api/run` 若带了已知的 `templateId`，外面塞进来的 `stages` 会被忽略，任务不会和模板悄悄漂移。重跑例外——它走 `stageSource: 'record'`，按当次运行记录里的阶段配置原样再跑一遍。

## 工作区

插件有自己的工作区：`$DSH_HOME/storages/autoeval`（默认 `~/.dsh/storages/autoeval`），模板、配置、跑出来的数据都在这里，可以整体备份或放进 git。

```
~/.dsh/storages/autoeval/
├── config.yaml          工作区配置：保留多少运行、默认模板、自定义命令超时
├── templates/<id>.yaml  评测模板，一个模板一个文件
├── querysets/<id>.json   Queryset（字段、query 列、用例）
├── runs/<id>/           每次运行的用例快照、报告、逐条结果
└── state.json           运行索引（内部用，别手改）
```

面板顶部常驻一条工作区信息：**路径**、模板数、运行数、占用，以及三个按钮：

- **复制路径**：把工作区目录复制到剪贴板
- **打开目录**：在系统文件管理器里打开（macOS `open`、Windows `explorer`、Linux `xdg-open`）
- **配置**：就地展开工作区配置表单，改完保存即写回 `config.yaml`

`config.yaml` 就三个字段，写出来带注释，手改同样生效：

| 字段 | 类型 | 默认 | 作用 |
| --- | --- | --- | --- |
| `maxRuns` | 数字 1~500 | 30 | 保留最近多少次运行，超出的连同产物目录一起不保留 |
| `defaultTemplate` | 字符串 | `websearch-tool` | 提交任务时默认选中的模板；留空则用列表第一个 |
| `commandTimeoutMs` | 数字 1000~600000 | 120000 | 自定义执行命令的超时 |

```yaml
# AutoEval 工作区配置
maxRuns: 20  # 数字 1~500，默认 30
defaultTemplate: websearch-fast  # 提交任务时默认选中
commandTimeoutMs: 90000  # ms，自定义命令超时
```

改坏了不影响跑：读不出来的字段回退默认值，面板顶部会把错误原文显示出来。

## Queryset

- 存储：一个集一个文件 `querysets/<id>.json`，内容是 `{id, name, description, fields, queryField, cases, source}`，`cases` 每条至少有 `query`
- 三种来源都能用：
  - **JSONL**：一行一个对象，键名随便，但要有 query 列（`query` / `q` / `question` / `问题` / `关键词` … 见 `QUERY_CANDIDATES`）
  - **CSV / TSV**：第一行表头，支持引号包裹与 `""` 转义、BOM；空 query 的行会跳过并在预览里报数
  - **XLSX**：读第一个工作表，第一行当表头；纯 Node 解析（`zlib` 解 zip + 读 `sharedStrings` 与 sheet1），不依赖三方库。日期单元格会按数值出来，需要的话自己加一列文本
  - **飞书表格**：贴 `https://xxx.feishu.cn/sheets/<token>?sheet=<sheetId>` 或 token；不给工作表就从第一张开始找，跳过没数据的；也可以填工作表 id 或标题
  - **飞书智能表格**：贴 `.../base/<appToken>?table=<tableId>&view=<viewId>` 或 token；不给数据表就用第一张；wiki 里的表格/智能表格链接也能直接贴
- 飞书读取走本机的 `lark-cli`（用户身份，token 自动刷新），所以面板要在装了 `lark-cli` 的机器上跑；读不到会直接把飞书的错误原文带回来
- `query` 列识别：先按候选词精确匹配，再按包含匹配，都不中就取第一列；导入预览里可以手动改

提交任务时可以选「选 Queryset」，此时 `POST /run` 只带 `templateId` + `querysetId`，宿主从文件里读用例。

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
  - id: scraping
    module: websearch
    config:
      maxResults: 3  # 数字 1~20，默认 5
      queryField: query  # 字符串，默认 "query"，用例里存检索词的字段名
      intervalMs: 0  # 数字 0~5000，ms，默认 250
  - id: rerank  # 自定义阶段：插在抓取之后、标注之前，只跑自定义命令
    name: 重排
    module: custom
    config:
      command: python3 ./rerank.py
  - id: annotation
    module: coverage-keyword
    config:
      pointsField: infoPoints  # 字符串，默认 "infoPoints"
      minCoverage: 1  # 数字 0~1，默认 1
  - id: metrics
    module: standard
    config:
      latencyField: latencyMs  # 字符串，默认 "latencyMs"
  - id: reporting
    module: markdown
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

自定义阶段目前只有一种模块：`custom`（自定义命令）。契约是把当前用例从 stdin 交给命令，命令把加工后的用例吐回来：

```bash
# stdin:  { stage, cases, config, stages, metrics, group }
# stdout: { cases: [...] }   或直接一个数组
node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const p=JSON.parse(d);
  process.stdout.write(JSON.stringify({cases:p.cases.map(c=>({...c,reranked:true}))}))
})'
```

### 两种改法

- **改文件**：`templates/<id>.yaml` 直接编辑，下次打开面板就生效。写坏了不会静默吞掉——列表里标「配置有问题」，点进去默认停在 YAML 页签，把 `broken` 里的行号和原因读出来改掉即可。
- **用面板**：模板详情有「表单」和「YAML」两个子页签。表单改字段，保存时宿主重新渲染成 YAML 落盘；YAML 页签能直接改文件内容再保存。两条路写的是同一个文件，不会各改各的。

保存时会校验：模板 id 只能用小写字母/数字/`-`；**至少有一个阶段**；预置阶段的相对顺序固定（`scraping → annotation → metrics → reporting`，可以只留其中几个，但不能换位）；自定义阶段的 id 不能与预置阶段重名、命令不能为空；**必须有且只有一个 `control` 组**，`overrides` 只能指向模板里已有的阶段；字段类型、数字范围、枚举取值也都会校验。任何一项不对就带着具体字段名报错，不会写坏文件。不认识的额外字段会原样保留（方便你挂自定义参数），但不参与校验。

支持的 YAML 子集：块状映射与序列、`- key: value`、行内 `[a, b]` 与 `{a: b}`、单双引号字符串、数字/布尔/null、`#` 注释、`|` 与 `>` 文本块。锚点/别名、多文档这类高级写法不支持，遇到直接报错而不是猜。

## 阶段编排与提交时的分组

模板只定两件事：**有哪些阶段、按什么顺序跑**，以及**每个阶段的默认模块与参数**。真正决定一次实验怎么跑的，是提交任务时配的组（Control / Treatment）。

### 模板：阶段清单 + 默认值

四个预置阶段（Scraping / Annotation / Metrics / Reporting）只是现成的可选阶段，不是必须的：

- **删**：任何阶段都能删，包括预置阶段（至少留一个）
- **加**：编辑区底部「新增阶段」列出还没用上的预置阶段和一个「自定义阶段」；自定义阶段是个 `custom` 模块，填名字和命令即可
- **排**：阶段是一张排序列表，按住左侧 `⠿` 直接拖动即可；也可以用卡片右侧的 ↑ / ↓（键盘/无障碍兜底）。都在的预置阶段之间拖不过去，因为它们有固定先后：`scraping → annotation → metrics → reporting`；预置和自定义之间、自定义和自定义之间随便拖
- **默认值**：每个阶段用哪个模块、参数填什么，模板里存一份，提交任务时拿来预填

删到只剩一部分也能跑：没有 Metrics 就没有指标卡，没有 Reporting 时报告会退化成一份各组指标快照，不会写空文件。

### 提交任务时：Control 与 Treatment

提交页在模板预览下面就是分组配置：

- **Control**：固定一个，不能删也不能改名。每个阶段都从模板的默认值起头，可以逐个换模块、改参数
- **Treatment**：点「新增 Treatment 组」加，可以加多个、可以删、可以改名。新组默认抄一份当前的 Control，之后每个阶段独立配置——**换的是哪一组、哪一阶段的实现都不影响别的组**
- 每组里把模板的每个阶段列出来（模块 chips + 按 schema 生成的参数控件），组多的时候点标题行可以**折叠**成一行摘要（`Scraping:websearch · Annotation:coverage-keyword …`），表头还有「全部展开 / 全部折叠」

点「运行」先出确认框，逐组列出「阶段：模块 + 参数」，确认后才真的发 `POST /run`：

```jsonc
{
  "name": "检索覆盖对比",
  "templateId": "websearch-fast",
  "cases": [ /* ... */ ],
  "groups": [
    { "id": "control", "kind": "control", "name": "对照组",
      "stages": { "scraping": { "module": "websearch", "config": { "maxResults": 3 } } } },
    { "id": "treatment-1", "kind": "treatment", "name": "多取两条结果",
      "stages": { "scraping": { "module": "websearch", "config": { "maxResults": 5 } } } }
  ]
}
```

没给 `groups` 就按模板默认值跑一个 Control。组里没写的阶段也走模板默认值，所以只写想改的那几个阶段就够。

跑一次任务时：先跑 Control 的全部阶段，再依次跑每个 Treatment 的全部阶段（用例是同一批）。产物里：

- `rows.jsonl` 每行多一个 `group` 字段（多组时才会加，单组保持原样）
- `report.md` 开头是一张组间对比表（通过率 / 平均覆盖 / 有分数的行，Treatment 后面跟与 Control 的差值），后面每组一节
- 任务详情页可以按组切阶段列表，概览下面有组间对比表格
- 重跑沿用当次记录里的分组与各阶段配置，不会回到模板默认值

对比口径跟指标卡一致：通过率的分母是「有分数的行」，每组单独算，不混在一起。

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
| POST | `/run` | `{ name, templateId, cases \| querysetId, groups }` → `{ runId }`；`groups` 里给 Control 与各 Treatment 的每阶段模块/参数，缺省用模板默认值跑一个 Control |
| POST | `/cancel` | 取消当前运行 |
| GET | `/runs/detail?id=<id>` | 单次任务的阶段、参数与日志 |
| POST | `/runs/rerun` | `{ id }` 按原用例与阶段配置重跑 |
| DELETE | `/runs?id=<id>` | 删掉一次任务（记录 + 产物目录） |
| GET | `/report?run=<id>` | 读报告正文 |
| GET | `/rows?run=<id>` | 读 `rows.jsonl` |
| POST | `/templates` | 存一份自定义模板（`{id, name, description, stages: [...]}` → 渲染成 YAML 落盘，同 id 覆盖） |
| GET | `/templates/raw?id=<id>` | 读模板 YAML 原文 |
| POST | `/templates/raw` | `{ yaml }` 直接把一段 YAML 存成模板 |
| POST | `/templates/preview` | `{ id, name, stages }` → 只渲染 YAML 不落盘（新建模板时预览用） |
| DELETE | `/templates?id=<id>` | 删掉自定义模板（删文件） |
| GET | `/querysets` | 列出 Queryset摘要；带 `?id=` 时返回完整用例 |
| POST | `/querysets` | 新建或覆盖一个 Queryset（写 `querysets/<id>.json`） |
| DELETE | `/querysets?id=<id>` | 删掉一个 Queryset |
| POST | `/querysets/import` | 只解析不落盘：`{kind: jsonl|csv|xlsx|sheet|bitable, text|base64|link, queryField?, sheetId?, tableId?}` → `{fields, cases, queryField, total, skipped}` |
| POST | `/workspace/config` | 存工作区配置（`maxRuns` / `defaultTemplate` / `commandTimeoutMs`） |
| POST | `/workspace/open` | 在系统文件管理器里打开工作区目录 |

agent 侧另有两个工具：`autoeval_run`、`autoeval_status`。

## 数据落在哪

```
$DSH_HOME/storages/autoeval/            （默认 ~/.dsh）
├── config.yaml                         工作区配置（保留次数 / 默认模板 / 命令超时）
├── state.json                          最近 N 次运行（含当次阶段配置）
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
node --test          # 69 个用例：宿主流水线 28 + 浏览器面板 30 + 导入解析 11
```

- `test/pipeline.test.mjs`：假 ctx + 假 `web` 服务跑完整四阶段、自定义命令、模板优先级、模板 YAML 落盘与回读、老 state.json 模板迁移、工作区配置与裁剪、Queryset的导入/增删改/按集跑、坏配置拦截、任务详情/重跑/删除；数据写在临时 `DSH_HOME` 里。
- `test/client.test.mjs`：用迷你 React 渲染面板，检查侧栏/主面板注册、只有两个页签、任务列表与详情（指标 / 逐条 / 报告）、阶段折叠列表、提交表单只发模板、模板默认只读与编辑/取消、表单按 schema 生成控件、YAML 页签读改存、提交流程的二次确认与取消、模板下拉的关键词过滤、Queryset列表/编辑/导入/删除、按 Queryset提交、工作区条与配置、重跑与删除。

## 已知限制

- 同一时刻只允许一次运行；排队不做。
- 抓取串行 + 每条间隔 250ms（可在阶段参数里改 `intervalMs`），没有并发抓取。
- 自定义命令在宿主进程里用 `bash -lc` 跑，没有沙箱隔离——只填自己信得过的命令。
- 报告是纯 Markdown 文本，面板里按等宽预排版展示，不渲染表格样式。
- 模板 YAML 只支持常用子集，锚点、别名、多文档、复杂标签都不支持；写错了会报行号，但不会帮你纠正。
- 同时改文件又改面板时以最后保存的为准，没有版本冲突检测。
