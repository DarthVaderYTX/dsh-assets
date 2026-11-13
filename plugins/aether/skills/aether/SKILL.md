---
name: aether
description: Operate the Aether DAG execution plugin: create and inspect modules, datasets and subgraphs, edit and submit experiments, run and debug instances, read artifacts, cancel or rerun runs, and manage workspaces.
whenToUse: Use when asked to build, edit, inspect, run, debug, cancel, rerun, export or import Aether resources, experiments, instances, canvas layouts or workspaces, or when explaining how Aether executes DAG nodes.
---

# Aether Agent 操作指南

Aether 是 DSH 左侧栏里的 **DAG 任务执行管理器**。它把可复用的「资源」（命令模块、数据集、子图模块）连成「实验」，每次提交实验产生一个「实例」并由本机执行器真正执行。

本文件随插件注册为 DSH 运行时 skill `aether`：插件启动或安装时自动注册，关闭或卸载时自动移除。

Aether 有三个页面：

- **资源**：命令模块、数据集、子图模块；创建后不可修改。
- **实验**：DAG 定义（内部与 API 叫 `graph`），无状态；可编辑、保存、提交。
- **实例**：一次提交（内部与 API 叫 `experiment`），有状态；可看日志、输出、取消、重跑、删除。

---

## 0. 先读：心智模型

1. **资源创建后不可修改。** 名称、类型、文件、命令、端口、参数、执行环境都固定；要改只能删除后重建。更新模块的 API 始终返回 `409`。
2. **实验没有状态，实例才有状态。** 实验只是 DAG；提交后生成的实例记录 `running / succeeded / failed / cancelled`。
3. **提交可以不保存。** 实验编辑器里的「提交实验」按**当前编辑内容**运行；不点「保存」不会写回实验定义。未保存的新实验也可以提交。
4. **实例是快照。** 提交时固化模块命令、参数、端口、模块版本与节点执行环境；之后改实验不影响已经提交的实例。
5. **模块文件会被复制。** 执行时把模块 `files/` 复制到该节点的执行文件夹，输入按端口名放进 `input/`，命令就在执行文件夹里启动。
6. **不要直接改工作区文件。** `state.json`、`resource.json`、`experiment.json` 由宿主维护；直接改可能丢并发写入、绕过校验。用 UI 或 `/aether-api`。
7. **id 是 UUID。** 模块、数据集、子图、实验、实例的 id 都是全局唯一 UUID；名称可改，id 不变。
8. **有引用关系时不能乱删。** 模块被实验节点使用时不能删；实验被子图模块引用时不能删；运行中的实例不能删；切换工作区时不能有运行中的实例。
9. **执行会另起进程。** 每个节点单独 `spawn` 一个 shell + 子进程；超时/取消会杀整棵进程树。
10. **破坏性操作先确认。** 删除资源、删除实例、删除实验、导入覆盖工作区，都要先让用户确认。

---

## 1. 访问方式

### UI

在 DSH 左侧栏点击 **Aether**。三个 tab 分别是「资源 / 实验 / 实例」，顶栏显示当前工作区路径，可复制、打开目录、更改工作区、导入/导出。画布与右侧栏之间有可拖拽分隔条，设置保存在浏览器本地。

### HTTP API

所有接口挂在：

```text
/aether-api
```

鉴权由 DSH 本地连接负责：浏览器里的同源请求会自动携带当前 DSH 会话；独立 `curl` / 无凭据的 HTTP 客户端会得到 `401`。**agent 应从 DSH Web 会话或 Aether 页面上下文调用**，不要自建一个没有会话的服务器。

响应统一为：

```json
{ "ok": true, "...": "..." }
```

或：

```json
{ "ok": false, "error": "人类可读的错误信息" }
```

常见状态码：

| 代码 | 含义 |
| --- | --- |
| 200 | 成功 |
| 400 | 参数/图校验失败 |
| 401 | 缺少 DSH 会话凭据 |
| 404 | 对象不存在 |
| 409 | 冲突：模块被使用、资源不可修改、运行中不能删除/切换 |
| 413 | 上传或请求体超过上限 |

写接口请求体上限约 2 MB；上传接口允许更大的模块文件（以服务端常量为准）。

---

## 2. 数据模型

### 2.1 模块（resource / module）

```json
{
  "id": "f280dc80-...",
  "name": "给 query 加后缀",
  "description": "可选",
  "kind": "command",
  "command": "python main.py",
  "timeoutSec": 300,
  "params": { "suffix": "喵" },
  "paramTypes": { "suffix": "string" },
  "inputs": ["data"],
  "inputTypes": { "data": "file" },
  "requiredInputs": ["data"],
  "outputs": ["result"],
  "outputTypes": { "result": "file" },
  "environmentId": "local",
  "assetId": "asset-...",
  "assetKind": "file",
  "assetName": "main.py",
  "assetPath": "resources/modules/<id>/files",
  "assetFileCount": 1,
  "version": 1
}
```

`kind` 只有三种：

- `command`：执行命令的普通模块。
- `dataset`：数据集，只有输出；执行时把数据集指针写到 stdout，不启动命令。
- `graph`：子图模块，指向另一个实验；执行时递归内联该实验的节点。

端口类型 `VALUE_TYPES`：

```text
string / number / boolean / json / file / directory
```

- 参数类型只能是 `string / number / boolean / json`（不能是 file/directory）。
- 同名不能同时出现在输入、输出、参数里，否则命令模板无法区分。
- 输入可以标记 `requiredInputs`；必填输入没有连线时实验校验失败。
- 名称在所有资源（模块 / 数据集 / 子图）中必须唯一。
- `cwd` 字段旧数据可能还有，但**执行时已忽略**；cwd 固定为执行文件夹。

### 2.2 实验（graph）

```json
{
  "id": "466d0869-...",
  "name": "两步实验",
  "description": "可选",
  "layout": "vertical",
  "nodes": [
    { "id": "data", "moduleId": "<module-id>", "label": "", "params": {}, "x": 40, "y": 40, "width": 0, "height": 0 },
    { "id": "step", "moduleId": "<module-id>", "params": {}, "x": 40, "y": 240 }
  ],
  "edges": [
    { "id": "e1", "from": "data", "to": "step", "fromPort": "rows", "toPort": "data" }
  ]
}
```

- `nodes[].id` 在实验内唯一；`edges` 引用节点 id。
- `layout`：`vertical`（上下）或 `horizontal`（左右）。
- 节点 `params` 覆盖模块默认参数；`width/height` 是画布尺寸，0 表示默认。
- 实验必须无环；子图引用链也不能成环。
- 被任何 `graph` 模块引用的实验就是**子图**，不能单独提交。

### 2.3 实例（run / experiment）

```json
{
  "id": "a00079fe-...",
  "name": "检查样例·实例1",
  "graphId": "466d0869-...",
  "graphName": "两步实验",
  "status": "succeeded",
  "layout": "vertical",
  "concurrency": 3,
  "createdAt": 1794580000000,
  "startedAt": 1794580000000,
  "endedAt": 1794580100000,
  "nodes": [
    {
      "path": "step",
      "nodeId": "step",
      "moduleId": "...",
      "moduleName": "...",
      "moduleVersion": 1,
      "params": {},
      "status": "succeeded",
      "exitCode": 0,
      "stdoutTail": "...",
      "stderrTail": "",
      "artifacts": [{ "port": "result", "path": "final.jsonl", "kind": "file", "size": 136 }]
    }
  ],
  "edges": []
}
```

状态：

- 实例：`running / succeeded / failed / cancelled`。
- 节点：`pending / running / succeeded / failed / skipped / cancelled`。
- 任一节点失败，实例最终为 `failed`；节点失败后其下游标为 `skipped`，其它分支继续。
- 用户取消后，运行中/未开始的节点标记 `cancelled`。

### 2.4 工作区目录

```text
<workspace>/
  aether.workspace.json      # 清单
  state.json                 # 索引镜像；不要手改
  resources/
    modules/<module>/resource.json + files/ + versions/
    datasets/<module>/...
    subgraphs/<module>/...
  experiments/<graph>/experiment.json
  subgraphs/<graph>/subgraph.json
  runs/<run-id>/run.json
  runs/<run-id>/nodes/<node>/...
  runs/<run-id>/outputs/<node>.out
  .aether-backups/
```

默认工作区：`$DSH_HOME/storages/aether`；当前路径指针在 `$DSH_HOME/storages/aether-workspace.json`。

---

## 3. 资源页

### 3.1 新建命令模块

UI：**资源 → 新建资源 → 模块 → 命令模块**。

填写：

- 名称、描述。
- 文件或文件夹：命令模块必须上传（`requireAsset`）。命令可以留空，执行器会尝试按入口 `run.sh / run.ps1 / main.py / index.js / main.js / run.js` 自动执行。
- 输入 / 输出端口：每行一个名称 + 类型；同名不能跨输入/输出/参数。
- 参数：名称、类型、默认值。
- 执行环境：目前只有「本机 / local」。
- 超时：默认 300 秒。

上传的文件会先进入 `resources/.uploads/<assetId>/`，保存后移动到资源自己的 `files/`。上传文件夹时只保留文件夹内的内容，不会多套一层。

### 3.2 新建数据集

UI：**资源 → 新建资源 → 数据集**。

- 直接编辑内容：目前只支持 JSONL / CSV，内容会保存成数据文件。
- 从文件导入：上传 `.jsonl` / `.csv`。
- 也可以填写任意 URI / 路径；数据集节点执行时把这个指针写给下游。
- 数据集只有输出端口（默认 `output`，可改名并选择类型）。

使用上传文件创建数据集时，API 仍先调 `/modules/assets`，然后把 `assetId/assetKind/assetName/assetPath` 和 `datasetUri`（通常等于文件名）一起提交；宿主会把 `datasetUri` 规范为 `resources/datasets/<id>/files/<file>`。

### 3.3 子图模块

子图模块是 `kind: "graph"` 的模块，`graphId` 指向一个实验。UI 不再从资源页新建子图模块；已有子图资源以只读详情展示。需要新建时用 API：

```json
{
  "create": true,
  "module": {
    "name": "清洗流水线",
    "kind": "graph",
    "graphId": "466d0869-5ed6-49b8-8578-bd4d51256084",
    "inputs": ["in"],
    "inputTypes": { "in": "file" },
    "outputs": ["out"],
    "outputTypes": { "out": "file" },
    "params": {},
    "paramTypes": {}
  }
}
```

子图模块的端口用于父画布连线；执行时展开为内部节点。子图模块本身不能单独运行；父实验会拒绝引用不存在的实验或成环的引用。

### 3.4 卡片、详情、复制 id、删除

- 页面顶部有搜索框与「全部 / 模块 / 数据集」筛选，匹配名称、描述、端口、数据集 URI 或子图实验名。
- 卡片只显示名称、描述、版本、UUID id。
- 右键卡片（或聚焦后按菜单键 / Shift+F10）：复制 id、详情、删除资源。
- 详情页只读；顶部显示 id。
- 删除前会二次确认；被实验节点使用的模块删除会被拒绝（先删节点/实验）。

---

## 4. 实验编辑器

### 4.1 新建与打开

- **实验 → 新建实验**：空白草稿。
- 实验列表可以按名称 / id 搜索；点已有实验卡片打开编辑器；多个实验可以在标签栏里同时打开。
- 子图节点详情里可「在新标签页打开子图」，父实验标签不关闭。
- 标签可切换、关闭；有未保存修改时关闭会确认。

### 4.2 编辑 DAG

- 右侧栏搜索并添加模块 / 子图 / 数据集；单击添加到视口中心，或直接拖到画布位置。
- 从输出端口拖到另一节点的输入端口建立连线；端口类型必须兼容：
  - 相同类型可直接连；
  - `number / boolean / json` 可连到 `string`；
  - `file` 只能连 `file`，`directory` 只能连 `directory`。
- 会成环的连线会被立即取消；已有环会显示错误并禁用保存/提交。
- 选中节点后右侧可改节点参数（覆盖模块默认值）、查看端口和执行环境。
- 拖动节点保存坐标；选中单个节点后四角手柄可调整宽高；「整理 / 复位」重新自动布局。
- 选中后按 Delete/Backspace 或工具条「删除选中」删除；Esc 清除选择。
- 方向「上下 / 左右」切换会重新自动布局。
- 画布支持平移、滚轮缩放、框选（Shift + 右键拖动）。
- 节点卡片优先显示名称、`id=<UUID>`、合并后的参数；空间不足时省略或隐藏，放大节点会显示更多。

### 4.3 保存 vs 提交实验

工具栏：

- **保存**：`POST /graphs`，持久化实验定义；名称重复、环、必填输入、端口类型等问题会拒绝。
- **提交实验**：打开提交框，按**当前编辑内容**运行一次：
  - 不保存也会生效；
  - 不写回实验定义；
  - 未保存的新实验（没有 id）也可以提交；
  - 实例保存这次草稿的完整快照 `run.graphSnapshot`，重跑草稿实例仍使用该快照；
  - 提交成功后**停留在实验编辑器**，不会跳到实例页；
  - 切到其它 tab 再切回来会保留编辑器标签、草稿、画布视口和选中项；
  - 已经在实验页时再点一次「实验」tab 才回到实验列表。
- **返回**：回到实验列表（草稿标签仍保留在标签栏）。

提交框可以填实例名称和并发（1–8）。

### 4.4 提交前的校验

保存和提交都会做服务端校验（`validateGraph`）：

- 实验名称不能为空；实验 id 为空表示新建，非空必须是 UUID。
- 节点 id 唯一；节点必须引用存在的模块。
- 子图模块必须指向存在的实验；引用链不能成环。
- 连线端口必须存在；端口类型兼容。
- 必填输入必须有连线。
- 节点参数名必须合法。

可以单独预检：

```json
POST /aether-api/graphs/validate
{ "graph": { "name": "...", "nodes": [], "edges": [] } }
```

返回 `{ "ok": true, "errors": [], "plan": {...} }`。有错误时 `errors` 非空。

---

## 5. 实例页

实例页只用于查看/操作，**没有新建入口**；新建实例从实验编辑器「提交实验」发起。

### 5.1 列表

- 搜索：实例名称、实例 id、实验名、模块/节点名、消息、状态、节点输出。
- 筛选：全部 / 运行中 / 已结束 / 失败。
- 列表项显示名称、状态、实验名、进度、时间；状态按 failure-first 显示。

### 5.2 详情

- 点实例打开详情；顶部显示实例名称、`id=<UUID>`、状态、耗时、并发。
- 实例画布与实验画布一样支持平移、缩放、拖动节点、点开节点详情；实例画布不显示数据集节点的执行状态。
- 节点卡片显示状态、退出码、日志入口。
- **日志**：查看 stdout / stderr，可刷新、复制全部。
- **输出**：每个输出端口可查看/下载：
  - 映射了文件：显示文本或下载；
  - 映射了目录：列出目录，支持进入子目录和 ZIP 下载；
  - 未映射：回退到节点 stdout。
- **打开目录**：在系统文件管理器中打开 `runs/<id>`。
- **取消**：仅运行中显示；取消会终止整个进程树。
- **重跑**：创建新实例；普通实例按当前实验定义；草稿实例优先使用 `run.graphSnapshot`。
- **复制**：把该实例的节点与连线复制成一张新的实验草稿并打开编辑器；原实验已删除也能重建草稿。
- **删除**：删除 `runs/<id>` 目录；运行中拒绝。

常见状态文案：运行中、成功、失败、已取消；失败原因可能是退出码、超时、被信号终止、进程未启动。

---

## 6. 执行语义（agent 必须理解）

提交后：

1. 实验展开成计划：子图递归内联，节点路径用 `/` 表示层级（如 `pipeline/prepare`）。
2. 解析每个节点的 `environmentId → executor`；当前只有 `local`。
3. 依赖全部成功的节点进入就绪队列，最多同时跑「并发上限」个。
4. 每个节点：
   - 创建执行文件夹 `runs/<run-id>/nodes/<safe(path)>/`；
   - 把模块 `files/` 内容复制进去；
   - 按端口准备 `input/`：
     - `file` / `directory`：复制上游实际产物为 `input/<端口名>`；`dataset` 节点直接复制其数据文件；
     - 其它类型：把上游文本写进 `input/<端口名>`；
     - 没有连线的可选输入写空文件；
   - 命令在**执行文件夹**里运行，等价于先 `cd` 到该目录再执行渲染后的命令模板。
5. `dataset` 节点不启动命令：把 `{ kind, name, uri, format, params }` 写到 stdout，下游从 `inputs.json`/`input/` 取值。
6. 节点失败 → 下游 `skipped`，其它分支继续；实例最终 `failed`。
7. 取消 → 结束整棵进程树；运行中/未开始节点标记 `cancelled`。
8. 超时按模块的「超时（秒）」处理，默认 300 秒。

命令模板：

- `@@名称@@` 引用已定义的输入 / 输出 / 参数。
- file/directory 输入 → `input/<端口名>` 的绝对路径。
- 其它输入 → 上游文本。
- 输出 → 执行文件夹里的输出文件路径。
- 参数 → 参数值。
- 内置：`@@run_id@@`、`@@node_path@@`、`@@node_dir@@`、`@@input_dir@@`、`@@input_file@@`、`@@graph_id@@` 等。
- 路径建议加引号。

文件/目录输出：脚本结束前写 `aether-outputs.json`：

```json
{
  "report_file": { "path": "report.md" },
  "report_dir": { "path": "artifacts" }
}
```

- 路径相对执行文件夹，不能越界（不能 `..` 或绝对路径）。
- 只有模块声明的输出端口才生效。
- 不写清单时，下游拿不到真实的文件产物，只会拿到上游文本（按内容写入 `input/<端口名>`）。

环境变量：

| 变量 | 内容 |
| --- | --- |
| `AETHER_RUN_ID` / `AETHER_RUN_DIR` | 实例 id 与运行目录 |
| `AETHER_NODE_ID` / `AETHER_NODE_PATH` / `AETHER_NODE_DIR` | 节点 id、路径、执行文件夹 |
| `AETHER_EXEC_DIR` | 执行文件夹（cwd） |
| `AETHER_GRAPH_ID` / `AETHER_GRAPH_NAME` | 实验 |
| `AETHER_ENVIRONMENT_ID` / `AETHER_ENVIRONMENT_NAME` | 执行环境 |
| `AETHER_EXECUTOR` | 执行器 id |
| `AETHER_PORTS` | `{ inputs, outputs }` |
| `AETHER_INPUT_DIR` | `input/` 目录 |
| `AETHER_INPUT_FILE` | `inputs.json` |
| `AETHER_INPUTS` | 端口名 → `{ type, path, text }` |
| `AETHER_PARAMS` | 节点参数 JSON |
| `AETHER_PARAM_<KEY>` | 每个参数一个变量（大写，非字母数字转 `_`） |
| `AETHER_MODULE_ASSET` / `_KIND` / `_NAME` / `_FILE` | 模块资源信息 |
| `AETHER_DATASET_URI` / `AETHER_DATASET_FORMAT` | 数据集节点专用 |

命令由宿主用 shell 执行（Windows `cmd.exe /d /s /c`，macOS/Linux 系统 shell），**另起子进程**；stdout/stderr 写入执行文件夹的 `stdout.log` / `stderr.log`；节点退出码来自子进程。

---

## 7. API 参考

所有路径均以 `/aether-api` 开头。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 模块、实验摘要、环境/执行器、实例摘要、工作区 |
| GET | `/graphs?id=` | 实验详情与计划；不带 id 返回摘要 |
| POST | `/graphs` | 新建/更新实验 `{ graph }` |
| POST | `/graphs/validate` | 预检 `{ graph }` |
| DELETE | `/graphs?id=` | 删除实验（被子图模块引用时拒绝） |
| POST | `/modules` | 新建资源 `{ create: true, requireAsset?, module }`；不可更新 |
| POST | `/modules/assets` | 上传 `{ kind, name, files: [{ path, data(base64) }] }` |
| DELETE | `/modules?id=` | 删除资源（被实验使用时拒绝） |
| GET | `/experiments?id=` | 实例详情；不带 id 返回列表 |
| POST | `/experiments` | 提交 `{ graphId, graph?, name?, concurrency? }` |
| POST | `/experiments/cancel` | 取消 `{ id }` |
| POST | `/experiments/rerun` | 重跑 `{ id }` |
| POST | `/experiments/open` | 打开运行目录 `{ id }` |
| DELETE | `/experiments?id=` | 删除实例（运行中拒绝） |
| GET | `/experiments/logs?run=&node=&stream=out\|err` | 节点日志 |
| GET | `/experiments/artifact?run=&node=&port=&file=` | 查看/列目录 |
| GET | `/experiments/artifact/download?run=&node=&port=&file=` | 下载文件或 ZIP |
| GET | `/experiments/download?run=&node=&port=` | 兼容接口：下载节点 stdout |
| POST | `/workspace` | 切换 `{ path }` |
| GET | `/workspace/export` | 导出工作区 JSON 包 |
| POST | `/workspace/import` | 导入 `{ bundle }` |
| POST | `/workspace/open` | 打开工作区目录 |

### 7.1 上传模块文件

```json
POST /aether-api/modules/assets
{
  "kind": "file",
  "name": "main.py",
  "files": [
    { "path": "main.py", "data": "<base64>" }
  ]
}
```

`kind: "directory"` 时 `files` 可以有多个相对 `path`；文件夹上传只保留内容，不要带顶层文件夹名（UI 会自动去掉）。

响应：

```json
{
  "ok": true,
  "asset": {
    "assetId": "asset-...",
    "assetKind": "file",
    "assetName": "main.py",
    "assetPath": "resources/.uploads/asset-...",
    "assetFileCount": 1,
    "assetSize": 1234
  }
}
```

创建模块时把 `assetId / assetKind / assetName / assetPath / assetFileCount` 原样传入。

### 7.2 创建命令模块

```json
POST /aether-api/modules
{
  "create": true,
  "requireAsset": true,
  "module": {
    "name": "给 query 加后缀",
    "description": "逐行读 JSONL，把 suffix 追加到 query",
    "kind": "command",
    "command": "python main.py",
    "inputs": ["data"],
    "inputTypes": { "data": "file" },
    "requiredInputs": ["data"],
    "outputs": ["result"],
    "outputTypes": { "result": "file" },
    "params": { "suffix": "喵" },
    "paramTypes": { "suffix": "string" },
    "environmentId": "local",
    "timeoutSec": 300,
    "assetId": "asset-...",
    "assetKind": "file",
    "assetName": "main.py",
    "assetPath": "resources/.uploads/asset-...",
    "assetFileCount": 1
  }
}
```

- `id` 可省略；服务端自动生成 UUID。
- 名称不能与已有模块重复。
- `requireAsset: true` 只对新建命令模块生效；命令模块建议总是上传文件并设为 true。
- 创建成功后返回 `{ ok: true, module: {...} }`。
- 更新（`create: false`）会返回 `409`。

### 7.3 创建数据集

```json
POST /aether-api/modules
{
  "create": true,
  "module": {
    "name": "JSONL 输入",
    "kind": "dataset",
    "datasetUri": "rows.jsonl",
    "datasetFormat": "jsonl",
    "outputs": ["rows"],
    "outputTypes": { "rows": "file" },
    "assetId": "asset-...",
    "assetKind": "file",
    "assetName": "rows.jsonl",
    "assetPath": "resources/.uploads/asset-...",
    "assetFileCount": 1
  }
}
```

`datasetUri` 如果等于上传文件名，宿主会改成资源内的真实路径。也可以不传 asset，直接把 `datasetUri` 指向工作区内的已有路径（相对工作区或绝对路径）。

### 7.4 创建/保存实验

```json
POST /aether-api/graphs
{
  "graph": {
    "name": "两步实验",
    "description": "可选",
    "layout": "vertical",
    "nodes": [
      { "id": "data", "moduleId": "<dataset-id>", "x": 40, "y": 40 },
      { "id": "step", "moduleId": "<module-id>", "params": { "suffix": "喵" }, "x": 40, "y": 240 }
    ],
    "edges": [
      { "id": "e1", "from": "data", "to": "step", "fromPort": "rows", "toPort": "data" }
    ]
  }
}
```

- 不带 `id` 新建；带 UUID `id` 更新。
- 名称不能与其它实验重复。
- 返回 `{ ok: true, graph: {...} }`。
- 保存前可先 `POST /graphs/validate`。

### 7.5 提交实例

按已保存实验：

```json
POST /aether-api/experiments
{
  "graphId": "<graph-id>",
  "name": "夜间实验 · run 1",
  "concurrency": 3
}
```

按当前编辑草稿（不保存）：

```json
POST /aether-api/experiments
{
  "graph": {
    "id": "<已有实验-id，可为空>",
    "name": "两步实验",
    "layout": "vertical",
    "nodes": [...],
    "edges": [...]
  },
  "name": "草稿实例",
  "concurrency": 3
}
```

- 带 `graph` 时不会写回实验；未保存的新实验可以传 `id: ""` 或不传 id。
- 被模块引用的子图不能单独提交。
- 返回实例详情；可以轮询 `GET /experiments?id=` 直到状态不是 `running`。

### 7.6 轮询、日志、输出

```text
GET /aether-api/experiments?id=<run-id>
GET /aether-api/experiments/logs?run=<run-id>&node=<node-path>&stream=err
GET /aether-api/experiments/artifact?run=<run-id>&node=<node-path>&port=result
GET /aether-api/experiments/artifact/download?run=<run-id>&node=<node-path>&port=result
```

- `node` 用的是展开后的路径（包含子图前缀，如 `pipeline/prepare`）。
- 日志接口返回文本（`stream=out|err`）。
- artifact 未映射端口时回退节点 stdout。

### 7.7 取消 / 重跑 / 删除

```json
POST /aether-api/experiments/cancel  { "id": "<run-id>" }
POST /aether-api/experiments/rerun   { "id": "<run-id>" }
DELETE /aether-api/experiments?id=<run-id>
```

运行中删除会被拒绝；先取消。

### 7.8 工作区

```json
POST /aether-api/workspace        { "path": "D:\\aether-workspace" }
GET  /aether-api/workspace/export
POST /aether-api/workspace/import { "bundle": { ... } }
POST /aether-api/workspace/open
```

切换规则：

- 目标为空：复制当前 `state.json`、`resources`、`experiments`、`subgraphs`、`runs` 后切换。
- 目标已有 `state.json`：直接打开，不覆盖。
- 有运行中的实例、目标在当前工作区内/包含当前工作区：拒绝。

导出/导入：

- 导出包包含资源目录、实验/子图目录、`state.json`，**不包含 runs**。
- 导入会替换当前资源与实验；运行记录不变；导入前自动备份到 `<workspace>/.aether-backups/import-<时间>/`。
- 导入包只接受 `resources/**`、`experiments/**`、`subgraphs/**`；旧包的 `modules/**` 会迁移。

---

## 8. 详细配方

### 配方 A：从零建一个 Python JSONL 处理实验（UI 流程）

1. 准备 `rows.jsonl`：

```jsonl
{"query":"第一行","id":1}
{"query":"第二行","id":2}
```

2. **资源 → 新建资源 → 数据集**：
   - 名称 `JSONL 输入`；
   - 选择「从文件导入」，上传 `rows.jsonl`；
   - 输出端口 `rows`，类型 `file`；
   - 保存。

3. **资源 → 新建资源 → 模块 → 命令模块**：
   - 名称 `Python 加后缀`；
   - 上传 `main.py`：

```python
import json
import os

suffix = os.environ.get('AETHER_PARAM_SUFFIX', '')

with open('input/data', encoding='utf-8') as source:
    rows = [json.loads(line) for line in source if line.strip()]

for row in rows:
    if isinstance(row, dict) and 'query' in row:
        row['query'] = str(row['query']) + suffix

with open('result.jsonl', 'w', encoding='utf-8') as sink:
    for row in rows:
        sink.write(json.dumps(row, ensure_ascii=False) + '\n')

with open('aether-outputs.json', 'w', encoding='utf-8') as manifest:
    json.dump({'result': 'result.jsonl'}, manifest)
```

   - 命令：`python main.py`（Windows 上如果 `python` 不是真实解释器，使用实际解释器绝对路径）；
   - 输入 `data` → `file`，必填；
   - 输出 `result` → `file`；
   - 参数 `suffix` → `string`，默认 `喵`；
   - 保存。

4. **实验 → 新建实验**：
   - 命名 `JSONL 加后缀实验`；
   - 添加数据集节点和模块节点；
   - 从数据集 `rows` 连到模块 `data`；
   - 选中模块节点，参数 `suffix` 设为 `喵`。

5. 点「提交实验」，填实例名，提交；留在编辑器。
6. **实例**页打开新实例：
   - 状态成功；
   - 打开 `result` 输出，应看到：

```json
{"query": "第一行喵", "id": 1}
{"query": "第二行喵", "id": 2}
```

### 配方 B：参数化 sleep + 透传模块

`main.py`：

```python
import json
import os
import shutil
import time

seconds = float(os.environ.get('AETHER_PARAM_SECONDS', '0') or 0)
time.sleep(max(0.0, seconds))
shutil.copyfile('input/data', 'passed.jsonl')

with open('aether-outputs.json', 'w', encoding='utf-8') as manifest:
    json.dump({'result': 'passed.jsonl'}, manifest)

print('slept ' + format(seconds, 'g') + 's')
```

模块：

- 输入 `data` file，输出 `result` file；
- 参数 `seconds` number，默认 `5`；
- 命令 `python main.py`。

实验里把节点参数 `seconds` 改成 `2`，实例应耗时约 2 秒，并把输入逐字节透传到输出。需要测试运行状态/取消时，把 `seconds` 设大（如 60），提交后在实例页取消。

### 配方 C：子图组合

1. 先建一个实验 `清洗`（有输入/输出节点）。
2. 用 API 建子图模块：

```json
POST /aether-api/modules
{
  "create": true,
  "module": {
    "name": "清洗子图",
    "kind": "graph",
    "graphId": "<清洗实验-id>",
    "inputs": ["in"],
    "inputTypes": { "in": "file" },
    "outputs": ["out"],
    "outputTypes": { "out": "file" }
  }
}
```

3. 在父实验里添加「清洗子图」节点并连线。
4. 提交父实验；执行器会把子图内部节点递归内联，父连线对接到子图入口/出口节点。
5. 子图实验本身不能单独提交；修改子图实验并保存后，引用它的父实验使用新定义。

### 配方 D：不保存直接提交草稿

UI：

1. 打开实验，修改参数或增删节点，但不要点保存。
2. 点「提交实验」→ 提交。
3. 实例使用当前编辑内容；实验定义仍是保存前的版本。
4. 如需永久保存，再点「保存」。

API：

```json
POST /aether-api/experiments
{
  "graph": { "id": "", "name": "临时实验", "nodes": [...], "edges": [...] },
  "name": "临时实例"
}
```

- `graph.id` 为空/省略表示未保存的新实验；
- 返回的实例带 `graphSnapshot`，重跑使用它；
- `GET /state` 中的 `graphs` 不增加新实验。

### 配方 E：观察/取消长任务

1. 提交一个 `sleep` 30 秒的实例。
2. 实例页状态为「运行中」；节点 `running`。
3. 点「取消」；进程树被终止，运行中/未开始节点变 `cancelled`。
4. 查看节点 `stderr` / `stdout` 与退出码；实例最终 `cancelled`。

### 配方 F：读取输出和下载

- 实例详情 → 输出端口 → 查看文本，或下载文件；
- 目录输出会列目录，可进入子目录、整体 ZIP 下载；
- API：
  - `GET /experiments/artifact?...` 返回内容或目录列表；
  - `GET /experiments/artifact/download?...` 下载文件/ZIP；
  - 未映射输出时回退 stdout。

### 配方 G：导出/导入工作区

1. 顶栏工作区旁菜单 → 导出，得到 `aether-workspace-*.json`；
2. 在另一台机器/目录导入；
3. 导入会先备份当前工作区到 `.aether-backups/import-<时间>/`，然后替换资源与实验；运行记录不导入；
4. 导入包不接受 `runs/**`。

---

## 9. 排错

### 提交/保存返回 400

按错误逐项检查：

- **实验名称重复**：换名字。
- **环**：删除形成环的连线；子图引用链也不能成环。
- **必填输入未连线**：补线，或取消必填。
- **端口不存在/类型不兼容**：检查 `fromPort / toPort` 与模块定义。
- **节点引用模块不存在**：模块可能已删除；重建或换模块。
- **子图模块指向的实验不存在**：重建子图模块或修复 `graphId`。
- **模块 id 不是 UUID / 已存在**：不要手填 id，交给服务端生成。

### 返回 409

- 更新模块：资源创建后不可修改，删除重建。
- 删除模块：仍被实验节点使用，先删节点/实验。
- 删除实验：仍被子图模块引用，先删子图模块。
- 删除/取消实例：实例仍在运行，先取消。
- 切换工作区：仍有实例运行，先取消。

### 实例失败

按顺序看：

1. 实例详情节点状态与退出码；
2. `stderrTail` / 查看 stderr 日志；
3. `runs/<run-id>/nodes/<node>/stderr.log`、`stdout.log`；
4. `inputs.json` / `input/` 是否符合预期；
5. 命令是否在 PATH 中、shell 引号是否正确；
6. 脚本是否真的写了 `aether-outputs.json`。

常见坑：

- **文件输入不存在**：输入端口没连线，或上游没产出 artifact。必需输入要在实验里连线。
- **输出端口没有产物**：脚本没写 `aether-outputs.json`，或路径越界/不存在。
- **参数没生效**：命令模板/脚本读错了环境变量名；参数名大写后非字母数字会变 `_`，例如 `my-param` → `AETHER_PARAM_MY_PARAM`。
- **Python 控制台编码**：Windows 控制台可能是 cp1252，`print` 中文可能抛 `UnicodeEncodeError` 导致节点失败（即使输出文件已写好）。日志只打印 ASCII，或显式 `sys.stdout.reconfigure(encoding='utf-8')`，或把中文写文件。
- **`python` 不是真实解释器**：Windows 上可能是 Microsoft Store 占位程序；在模块命令里使用真实解释器路径。
- **cwd 不是模块目录**：执行时 cwd 是执行文件夹；模块文件已复制过来，用相对路径即可；不要依赖旧 `cwd` 字段。

### 401

Aether API 受 DSH 本地连接鉴权保护。独立 HTTP 客户端没有 DSH 会话会 401；从 Aether 页面/DSH Web 会话调用，或使用插件 UI。

### 看不到最新数据

如果绕过插件直接改了工作区文件，宿主内存中的状态不会自动刷新；应通过 UI/API 操作，或重启 DSH / 切换工作区重新加载。运行实例、资源、实验的权威数据都在工作区目录与宿主缓存中。

---

## 10. 最小检查清单

- 创建模块前：确认名称唯一、端口名跨输入/输出/参数唯一、命令模板引用的名字都已定义。
- 创建数据集前：确认文件格式与 `datasetUri`；下游端口类型是 file 时才能拿到真实文件。
- 保存/提交前：确认无环、必填输入已连线、端口类型兼容。
- 提交后：确认实例 `succeeded`，检查每个节点的 stderr 和 artifact。
- 需要取消：先在实例页取消，再删除实例。
- 删除顺序：实例 → 实验 → 子图模块/模块/数据集（有引用时会被拒绝）。
- 改资源：不能改，删除重建；然后更新引用它的实验节点。
- 切换工作区：确认没有运行中的实例。

---

## 11. 快速 API 流程示例

```text
1. POST /aether-api/modules/assets          # 上传 main.py
2. POST /aether-api/modules { create: true } # 创建命令模块
3. POST /aether-api/modules/assets          # 上传 rows.jsonl
4. POST /aether-api/modules { create: true } # 创建数据集
5. POST /aether-api/graphs/validate          # 可选：预检
6. POST /aether-api/graphs                   # 保存实验（或跳过，直接第 7 步草稿提交）
7. POST /aether-api/experiments              # 提交实例
8. GET  /aether-api/experiments?id=<id>       # 轮询状态
9. GET  /aether-api/experiments/logs?...      # 查日志
10. GET /aether-api/experiments/artifact?...  # 查输出
```

记住：**用 UI/API 操作，不直接改文件；资源不可变；草稿提交不保存；实例是快照。**
