# Aether

Aether 是 dsh 的左侧栏插件：一个**有向无环图（DAG）任务执行管理器**。它把「可复用的模块」和「模块在实验图里的使用」分开管理，用连线表达依赖，提交实验后由执行器按拓扑序并发执行，并把每个节点的状态、日志与产物留在磁盘上。

执行被显式分成「执行环境 → 执行器」两层：模块声明它需要哪个执行环境，宿主把计划节点解析成 placement 后交给对应执行器。当前只内置本机执行器，但模块、图、运行记录和 API 都已经按“服务器按环境选择执行位置”的形态落地（见「执行环境与远程调度」）。

面板有三个页签：

| 页签 | 作用 |
| --- | --- |
| 实验 | 提交图、查看运行中的实验与逐节点进度、翻看 stdout/stderr、取消 / 重跑 / 删除。 |
| 图 | 图的增删改：添加「模块使用」节点、连线表达依赖、自动分层画布、子图模块内联、保存前校验环。 |
| 模块 | 命令模块与子图模块的增删改；显示每个模块被哪些图引用。 |

## 概念

- **模块（module）**：可复用的执行单元。
  - `command`：一段通过 shell 执行的命令，可带默认参数、工作目录与超时。
  - `graph`：指向另一张图的**子图模块**；被用作节点时，那张图会内联进当前图执行。
  - 每个模块还带 `environmentId`（执行环境），决定它由哪个执行器运行。
- **模块使用（node）**：图里的一个节点，引用一个模块，可覆盖参数、改显示名称、连上游依赖。节点从模块继承执行环境。
- **图（graph）**：节点 + 有向连线；必须无环。图可以被提交成实验，也可以被别的图当作子图嵌套（引用关系同样必须无环）。
- **实验（experiment）**：一次提交产生的运行记录。提交时会快照当次的模块命令、参数与每个节点的执行环境，之后改图不影响这次实验。

## 执行语义

1. 提交时把图展开成计划：子图递归内联，节点路径用 `/` 表示层级（如 `pipeline/prepare`）；节点的依赖换成上游节点的实际路径。
2. 按节点的 `environmentId` 解析执行环境 → 执行器，把 placement 写进运行记录；当前只有 `local` 可用，需要未注册执行器的节点会在提交时被拒绝。
3. 依赖全部成功的节点才进入就绪队列，最多同时跑「并发上限」个（1–8）。
4. 节点失败后，它的下游标记为 `skipped`，其他分支继续执行；实验最终状态为 `failed`。
5. 取消会结束整个进程树，正在运行的节点标记 `cancelled`，未开始的节点同样标记 `cancelled`。
6. 超时按模块的「超时（秒）」处理，默认 300 秒。

命令由宿主用 shell 执行（Windows 走 `cmd.exe /d /s /c`，macOS / Linux 走系统 shell），工作目录默认是 dsh 进程的当前目录。命令文本里可用 `{{参数名}}` 插入参数（也支持 `{{run_id}}`、`{{node_path}}`、`{{node_dir}}`、`{{input_file}}` 等内置值）。

每个节点执行时还会注入：

| 环境变量 | 内容 |
| --- | --- |
| `AETHER_RUN_ID` / `AETHER_RUN_DIR` | 实验 id 与运行目录 |
| `AETHER_NODE_ID` / `AETHER_NODE_PATH` / `AETHER_NODE_DIR` | 节点 id、路径（`a/b`）与节点目录 |
| `AETHER_GRAPH_ID` / `AETHER_GRAPH_NAME` | 提交时使用的图 |
| `AETHER_ENVIRONMENT_ID` / `AETHER_ENVIRONMENT_NAME` | 节点声明的执行环境 |
| `AETHER_EXECUTOR` | 实际执行该节点的执行器 id |
| `AETHER_INPUT_FILE` | 本节点的 `inputs.json`：上游节点的状态、退出码、stdout 文件路径与开头 4KB 文本 |
| `AETHER_INPUTS` | 同一份上游信息的 JSON 字符串 |
| `AETHER_PARAMS` | 节点参数 JSON |
| `AETHER_PARAM_<KEY>` | 每个参数一个变量，键名大写、非字母数字换成 `_` |

上游节点的完整 stdout 会写到 `outputs/<节点路径>.out`，本节点的完整输出在 `nodes/<节点路径>/stdout.log` / `stderr.log`。子图节点会把节点参数作为内层节点的默认参数（内层自己的参数优先）。

## 执行环境与远程调度（预留）

模块带有 `environmentId`，指向 `state.json` 的环境目录。内置环境只有本机：

```json
{ "id": "local", "name": "本机", "executor": "local", "builtin": true }
```

`executor` 是执行后端 id，由宿主内的 [executor.js](executor.js) 解释；模块编辑器里的「执行环境」就是给未来的调度器看的声明。今天所有环境都解析到本机，提交时会把解析结果固化到运行记录里：

```json
{
  "executor": "local",
  "nodes": [
    { "path": "pipeline/train", "environmentId": "local", "environmentName": "本机", "executor": "local" }
  ]
}
```

**执行器边界**：`LocalExecutor` 实现 `describe / start / cancel / readLog`，`index.js` 只依赖这组方法。

- `start(run, plan)` 返回 `{ done, cancel() }`；执行器负责推进 `run.nodes` 并持久化，宿主持有句柄用于取消与回收。
- `cancel(handle)`、`readLog(run, nodePath, stream)` 供取消与面板日志使用。
- 只有 `describe().available` 的执行器参与环境解析；`/state` 会把环境目录与执行器能力一起返回。

接入服务器调度的目标流程（图、模块与运行记录的字段不需要再改）：

1. **提交**：把展开后的 plan（节点已带 `environmentId`、参数与模块命令快照）提交给调度器，必要时附上 run 元数据（id、名称）。
2. **放置**：调度器按执行环境选择执行位置，返回每个节点的 placement 与远端 run id。`environmentId` 是两边共享的契约；endpoint、凭据与资源标签由服务器侧持有，本地目录只保存 id 与展示名。
3. **对账**：远端回报节点 `running/succeeded/failed`、退出码与日志位置，宿主镜像到同一份 `run.nodes`。
4. **取消 / 日志**：转发到远端 run id；`readLog` 从远端拉取，或改为跳转外部日志地址。
5. **跨执行器**：上游 stdout 目前通过共享的 `run.dir/outputs` 传递；远程节点需要对象存储或服务器中转，这是调度器侧的数据面问题。

模块库目前仍以本地 `state.json` 为准；提交的 plan 已经带上每个节点的模块快照（命令、参数、执行环境），因此服务器不需要访问本机存储就能决定执行位置。

有意留空、尚未实现的部分：环境目录的增删改与凭据管理、`RemoteExecutor`、服务器端调度协议、跨执行器数据传递、日志流式推送。当前提交只接受存在且执行器可用的环境；写了未来环境名的模块会在提交时明确报错，而不会静默落到本机。

## 数据与工作区

默认工作区是 `$DSH_HOME/storages/aether`：

```
storages/aether/
  state.json              # 模块、图与执行环境目录
  runs/<run-id>/
    run.json              # 实验、执行器、逐节点 placement 与状态
    nodes/<node>/         # stdout.log / stderr.log / inputs.json
    outputs/<node>.out    # 供下游读取的 stdout
```

面板顶部显示工作区路径，可直接复制；「打开目录」在系统文件管理器里打开它。删除实验会删掉对应的 `runs/<id>` 目录。旧版 `state.json`（没有环境目录 / 模块没有 `environmentId`）加载时会自动补成 `local` 并写回，不需要手工迁移。

首次加载（还没有 `state.json`）时会写入一组示例数据：4 个命令模块（准备数据、训练模型、评估结果、生成报告）、1 个子图模块（演示流水线）和 2 张图（`demo-pipeline`、`nightly-experiment`）。可以直接提交「夜间实验」看一次完整的子图执行，也可以全部删掉从零开始。

## HTTP 接口

面板通过 `/aether-api` 访问宿主：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 模块、图摘要、环境和执行器能力、实验摘要、工作区 |
| GET | `/graphs?id=` | 图详情与展开后的执行计划（不带 id 时返回摘要列表） |
| POST | `/graphs` | 新建 / 更新图（`{ graph }`） |
| POST | `/graphs/validate` | 预检图，返回 `errors[]` 与计划 |
| DELETE | `/graphs?id=` | 删除图（被模块引用时拒绝） |
| POST | `/modules` | 新建（`create: true`）/ 更新模块（`{ module }`） |
| DELETE | `/modules?id=` | 删除模块（被图使用时拒绝） |
| GET | `/experiments?id=` | 实验详情与节点（不带 id 时返回摘要列表） |
| POST | `/experiments` | 提交实验（`{ graphId, name?, concurrency? }`） |
| POST | `/experiments/cancel` | 取消实验（`{ id }`） |
| POST | `/experiments/rerun` | 按当前图重跑（`{ id }`） |
| POST | `/experiments/open` | 在文件管理器里打开该实验目录 |
| DELETE | `/experiments?id=` | 删除实验（运行中拒绝） |
| GET | `/experiments/logs?run=&node=&stream=out\|err` | 节点日志 |
| POST | `/workspace/open` | 打开 Aether 工作区 |

所有接口返回 `{ ok: true, ... }` 或 `{ ok: false, error }`。写接口带 2MB 请求体上限。

## 安装

本仓库约定用 `install.sh` 或 dsh CLI：

```bash
./install.sh plugin aether            # 默认 profile: web
./install.sh plugin aether --profile desktop   # 桌面 profile 由应用管理，脚本会拦下
```

在桌面端也可以从应用内「插件」页从本地目录安装，指向 `plugins/aether`。安装后需要重启 dsh（插件宿主代码在启动时加载），侧栏会出现 Aether 图标。

## 实现说明

- `index.js`：宿主插件。按 `ctx.effect` 注册 `/aether-api` 路由；保存模块 / 图 / 环境目录；提交时解析环境 → 执行器；退出时取消仍在跑的句柄。
- `dag.js`：纯函数核心——参数 / 模块 / 图 / 环境的归一化、校验、拓扑分层、子图展开、图引用环检测。
- `executor.js`：执行后端边界。`resolvePlacements` 把节点的执行环境解析成执行器；`LocalExecutor` 是本机实现，`start / cancel / readLog` 之外的存储与 API 不感知执行位置。
- `client.js`：Web 面板。注册 `sidebar.panellist` 图标与 `main` 面板，样式全部使用 `--dsw-alias-*` 主题令牌。
- `test/dag.test.mjs`：图核心单测（拓扑、环、子图展开、参数继承、环境校验）。
- `test/executor.test.mjs`：环境解析与执行器描述。
- `test/host.test.mjs`：用假 `ctx` 起真实 HTTP 服务，覆盖种子数据、CRUD 保护、环拒绝、子图执行、失败传播、取消与 placement 快照。

```bash
node --test plugins/aether/test/
```

宿主侧没有注册 agent 工具，操作入口只有面板与 HTTP 接口；如果后续要让 agent 提交实验，建议复用同一套 `startExperiment` / `saveGraph` 逻辑再注册 `tools.register`。

## 已知边界

- 模块命令在宿主进程的权限下执行，没有额外的沙箱；命令内容应视为用户自己的脚本。
- 目前只有本机执行器，所有节点都在本机运行；远程执行器与服务器调度尚未实现（见「执行环境与远程调度」）。
- 子图展开是静态内联；暂不支持「按条件跳过」「循环」「失败重试」等控制流。
- 实验记录最多在列表里显示 200 条；更早的记录仍留在磁盘上，可通过运行目录访问。
