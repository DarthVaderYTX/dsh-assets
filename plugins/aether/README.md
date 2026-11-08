# Aether

Aether 是 dsh 的左侧栏插件：一个**有向无环图（DAG）任务执行管理器**。它把「可复用的模块」和「模块在实验图里的使用」分开管理，用连线表达依赖，提交实验后由宿主按拓扑序并发执行，并把每个节点的状态、日志与产物留在磁盘上。

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
- **模块使用（node）**：图里的一个节点，引用一个模块，可覆盖参数、改显示名称、连上游依赖。
- **图（graph）**：节点 + 有向连线；必须无环。图可以被提交成实验，也可以被别的图当作子图嵌套（引用关系同样必须无环）。
- **实验（experiment）**：一次提交产生的运行记录。提交时会快照当次的模块命令与参数，之后改图不影响这次实验。

## 执行语义

1. 提交时把图展开成计划：子图递归内联，节点路径用 `/` 表示层级（如 `pipeline/prepare`）；节点的依赖换成上游节点的实际路径。
2. 依赖全部成功的节点才进入就绪队列，最多同时跑「并发上限」个（1–8）。
3. 节点失败后，它的下游标记为 `skipped`，其他分支继续执行；实验最终状态为 `failed`。
4. 取消会结束整个进程树，正在运行的节点标记 `cancelled`，未开始的节点同样标记 `cancelled`。
5. 超时按模块的「超时（秒）」处理，默认 300 秒。

命令由宿主用 shell 执行（Windows 走 `cmd.exe /d /s /c`，macOS / Linux 走系统 shell），工作目录默认是 dsh 进程的当前目录。命令文本里可用 `{{参数名}}` 插入参数（也支持 `{{run_id}}`、`{{node_path}}`、`{{node_dir}}`、`{{input_file}}` 等内置值）。

每个节点执行时还会注入：

| 环境变量 | 内容 |
| --- | --- |
| `AETHER_RUN_ID` / `AETHER_RUN_DIR` | 实验 id 与运行目录 |
| `AETHER_NODE_ID` / `AETHER_NODE_PATH` / `AETHER_NODE_DIR` | 节点 id、路径（`a/b`）与节点目录 |
| `AETHER_GRAPH_ID` / `AETHER_GRAPH_NAME` | 提交时使用的图 |
| `AETHER_INPUT_FILE` | 本节点的 `inputs.json`：上游节点的状态、退出码、stdout 文件路径与开头 4KB 文本 |
| `AETHER_INPUTS` | 同一份上游信息的 JSON 字符串 |
| `AETHER_PARAMS` | 节点参数 JSON |
| `AETHER_PARAM_<KEY>` | 每个参数一个变量，键名大写、非字母数字换成 `_` |

上游节点的完整 stdout 会写到 `outputs/<节点路径>.out`，本节点的完整输出在 `nodes/<节点路径>/stdout.log` / `stderr.log`。子图节点会把节点参数作为内层节点的默认参数（内层自己的参数优先）。

## 数据与工作区

默认工作区是 `$DSH_HOME/storages/aether`：

```
storages/aether/
  state.json              # 模块与图
  runs/<run-id>/
    run.json              # 实验与节点状态
    nodes/<node>/         # stdout.log / stderr.log / inputs.json
    outputs/<node>.out    # 供下游读取的 stdout
```

面板顶部显示工作区路径，可直接复制；「打开目录」在系统文件管理器里打开它。删除实验会删掉对应的 `runs/<id>` 目录。

首次加载（还没有 `state.json`）时会写入一组示例数据：4 个命令模块（准备数据、训练模型、评估结果、生成报告）、1 个子图模块（演示流水线）和 2 张图（`demo-pipeline`、`nightly-experiment`）。可以直接提交「夜间实验」看一次完整的子图执行，也可以全部删掉从零开始。

## HTTP 接口

面板通过 `/aether-api` 访问宿主：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 模块、图摘要、实验摘要、工作区 |
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

- `index.js`：宿主插件。按 `ctx.effect` 注册 `/aether-api` 路由、退出时结束仍在跑的进程树；数据只在工作区读写。
- `dag.js`：纯函数核心——参数 / 模块 / 图归一化、校验、拓扑分层、子图展开、图引用环检测。
- `client.js`：Web 面板。注册 `sidebar.panellist` 图标与 `main` 面板，样式全部使用 `--dsw-alias-*` 主题令牌。
- `test/dag.test.mjs`：图核心单测（拓扑、环、子图展开、参数继承）。
- `test/host.test.mjs`：用假 `ctx` 起真实 HTTP 服务，覆盖种子数据、CRUD 保护、环拒绝、子图执行、失败传播与取消。

```bash
node --test plugins/aether/test/
```

宿主侧没有注册 agent 工具，操作入口只有面板与 HTTP 接口；如果后续要让 agent 提交实验，建议复用同一套 `startExperiment` / `saveGraph` 逻辑再注册 `tools.register`。

## 已知边界

- 模块命令在宿主进程的权限下执行，没有额外的沙箱；命令内容应视为用户自己的脚本。
- 子图展开是静态内联；暂不支持「按条件跳过」「循环」「失败重试」等控制流。
- 实验记录最多在列表里显示 200 条；更早的记录仍留在磁盘上，可通过运行目录访问。
