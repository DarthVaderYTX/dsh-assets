# Aether 结构

Aether 分为宿主侧、图核心、执行器、客户端与构建脚本五层。运行时只加载一个 `client.js`，但客户端源码按职责拆在 `client/src/`，由脚本拼接生成 bundle。

## 目录

```
aether/
  index.js                 宿主插件入口：注册、服务编排、HTTP 路由
  constants.js             数据版本、请求体/资源上限、并发与运行数上限
  seed.js                  首次启动示例模块与实验（纯函数）
  http.js                  统一错误、JSON/文本响应、请求体读取
  dag.js                   纯 DAG 核心：归一化、校验、拓扑、子图展开、图引用环
  executor.js              执行器边界：LocalExecutor、placement、进程树取消
  client.js                构建产物（唯一被 DSH 加载的客户端文件）
  client/src/              客户端源码片段，共享同一工厂作用域
    00-header.js              React/require 引导与常量
    10-locales.js             中文/英文文案
    20-styles.js              全部 CSS
    30-utils.js               格式化、参数、坐标与 ID 工具
    40-widgets.js             图标、弹窗、确认框、Toast、端口/参数编辑器
    50-run-views.js           运行列表、提交、日志与输出弹窗
    55-graphs.js              实验列表
    60-canvas.js              画布几何、自动布局、RunDag
    70-experiment-editor.js   实验/子图编辑器（画布、检查器、工具栏）
    80-modules.js             模块库与模块编辑器
    90-panel.js               主面板、页签、编辑器标签、全局状态
    99-register.js            导出 Cordis 插件对象
  scripts/build-client.mjs  片段拼接与 --check
  test/*.test.mjs           DAG、执行器、宿主 HTTP、客户端构建一致性
```

## 宿主侧调用链

```
HTTP 请求
  → index.js handleApi
    → saveModule / saveGraph / startExperiment / cancelExperiment ...
      → dag.js（校验、展开）
      → executor.js（resolvePlacements / LocalExecutor）
      → state.json / runs/<id>（存储）
```

- `index.js` 只做编排与路由，不实现图算法或进程管理。
- `dag.js` 不依赖文件系统，可单独测试。
- `executor.js` 不知道 HTTP 与面板，只接收 run/plan 并回写状态。
- `seed.js`、`http.js`、`constants.js` 是无状态/纯函数辅助层。

## 客户端调用链

```
AetherPanel（90-panel）
  → ExperimentsView / GraphsView / ModulesView
  → ExperimentEditor（70）→ canvas 几何（60）
  → RunDag（60）→ 输出弹窗（50）
  → 小部件（40）→ 文案（10）/ 样式（20）/ 工具（30）
  → /aether-api
```

- 片段共享 `require`、React hooks、`API`、文案与小组件，不需要跨文件导入。
- `client/src/00-header.js` 开启 `window.__ModuleLoader__.load` 工厂，`99-register.js` 关闭并注册插件。
- 修改客户端必须编辑 `client/src/`，然后执行：

```bash
npm run build
```

- `npm run check` 或 `node --test test` 会检查 `client.js` 是否与源码片段一致。
- 之所以生成单文件：DSH 客户端每个插件只物化一个 bundle，片段拼接既保持运行时简单，又避免 6000 行单文件。

## 工作区

`dataDir()` 从 `$DSH_HOME/storages/aether-workspace.json` 读取工作区路径；未配置时回退到 `$DSH_HOME/storages/aether`。模块（含数据集、子图）、实验、运行与模块资产都写在该目录下。`index.js` 的 `switchWorkspace` 负责校验、迁移（空目标）或直接切换（已有 `state.json`），并重置状态缓存与运行恢复标记。`exportWorkspaceBundle` / `importWorkspaceBundle` 用 JSON 包（文件 base64）导入导出工作区；运行记录可选，导入前备份到 `$DSH_HOME/storages/aether-backups`。

## 数据版本

`const DATA_VERSION = 6`（`constants.js`）。加载旧 `state.json` 时自动补执行环境、端口、布局、模块版本、必填输入与文件资产字段。迁移逻辑集中在 `index.js` 的存储加载函数中。
