---
name: techhub
description: Operate the TechHub evaluation plugin: manage datasets, templates, tasks, runs, workspace bundles, themes, language and documentation.
---

# TechHub Agent 使用指南

这份文档同时作为 DSH 运行时 skill **`techhub`** 注册。插件启动或安装时会自动注册该 skill；插件关闭或卸载时会自动移除。

这份文档面向需要管理 TechHub 数据的 agent。目标是让 agent 在不破坏现有数据的前提下，正确创建、修改、删除数据集、任务模板和任务，并能启动、监控和导出实验运行。

TechHub 有三个页面：

- **Datasets**：JSONL / CSV 数据集
- **Templates**：可复用的串行阶段模板，包含全局参数、阶段命令、对外输出、阶段输入引用
- **Tasks**：一次真实实验运行；一个 Control 组 + 任意多个 Treatment 组

---

## 0. 最重要的规则

1. **不要直接编辑 `store.json` 或 workspace manifest。** 使用 `/techhub/api` 或 Web UI。直接改文件可能丢失并发写入，也可能写出无法通过校验的结构。
2. **`PUT /state` 是全量替换。** 它用请求里的 `datasets`、`templates`、`tasks` 替换整个目录。修改前必须先 `GET /state`，保留所有未修改对象，再提交完整数组。
3. **一次任务只能有一个 `control` 组。** 服务端会丢弃没有 Control 组或 Control 组数量不为 1 的任务。
4. **任务使用模板快照。** 修改模板后，已有任务不会自动更新；需要同步更新任务的 `groups[].stageConfigs`，或重新创建任务。
5. **不要调用 `/workspace/reset`。** 它会清空所有任务和运行记录。只有用户明确要求重置时才使用。
6. **删除任务会删除其运行记录。** 通过 `PUT /state` 移除任务后，服务端会停止该任务的活跃运行并删除对应 run 记录。
7. **提交后检查响应。** 服务端会静默丢弃校验失败的对象；必须检查响应中的数组数量、ID 和关键字段。
8. **workspace 是项目根目录。** 数据集、模板、任务定义会持久化到 workspace 的 manifest，脚本和代码也必须放在 workspace 下。使用 workspace 导出/导入来复制项目。

---

## 1. 访问方式

Web UI：

```text
http://127.0.0.1:14298
```

Host API：

```text
/techhub/api
```

API 使用 DSH 本地连接鉴权。浏览器中的同源请求会自动携带当前 DSH 会话；外部脚本直接请求时如果没有正确的会话凭据，会被拒绝。Agent 应通过 DSH Web 会话（例如浏览器上下文）调用 API，而不是无鉴权的独立 HTTP 客户端。

所有响应都是 JSON（导出和输出文件除外）。错误格式：

```json
{
  "error": {
    "status": 400,
    "message": "Human readable message"
  }
}
```

常见状态码：

- `200` 成功
- `201` 已创建（启动运行）
- `400` 请求不合法
- `404` 对象不存在
- `405` 方法不允许
- `409` 当前状态冲突（例如运行中的 run 不能删除）
- `413` 请求体/输出文件过大
- `500` 服务端错误

---

## 2. 数据结构

### 2.1 Dataset

```json
{
  "id": "dataset-uuid",
  "name": "真实用户查询测试集",
  "description": "可选",
  "format": "jsonl",
  "raw": "{\"query\":\"hello\"}\n{\"query\":\"world\"}\n",
  "columns": ["query"],
  "rowCount": 2,
  "sourceName": "queries.jsonl",
  "createdAt": 1793980000000,
  "updatedAt": 1793980000000
}
```

- `format` 只能是 `jsonl` 或 `csv`。
- `raw` 是完整文本内容；JSONL 每行一个 JSON 对象。
- `columns`、`rowCount` 用于 UI 展示；宿主不重新解析 `raw`，agent 应尽量填写正确值。
- `id` 必须唯一且非空。
- 时间戳使用毫秒。

### 2.2 Template

```json
{
  "id": "template-uuid",
  "name": "示例：Query 清洗与评分",
  "description": "可选",
  "parameters": [
    { "id": "p-weight", "key": "WEIGHT", "defaultValue": "1.25", "description": "词数权重" }
  ],
  "stages": [
    {
      "id": "stage-clean",
      "name": "清洗查询",
      "description": "可选",
      "command": "node",
      "args": "-e \"...\"",
      "outputs": [
        { "id": "out-normalized", "name": "normalized", "file": "normalized.json" }
      ],
      "inputRefs": []
    },
    {
      "id": "stage-score",
      "name": "计算得分",
      "description": "可选",
      "command": "node",
      "args": "-e \"...\"",
      "outputs": [
        { "id": "out-score", "name": "score", "file": "score.json" }
      ],
      "inputRefs": [
        {
          "id": "ref-features",
          "key": "features",
          "stageId": "stage-features",
          "outputName": "features"
        }
      ]
    }
  ],
  "createdAt": 1793980000000,
  "updatedAt": 1793980000000
}
```

#### 全局参数

- `key` 必须是 `[A-Za-z_][A-Za-z0-9_]*`。
- 在阶段命令/参数中使用 `{{KEY}}`；运行时会替换为该组配置的值。
- 同一个模板内 key 不能重复。

#### 阶段对外输出

- `outputs[].file` 是相对于该阶段 `output/` 的路径，不能是绝对路径，也不能包含 `..`。
- `outputs[].name` 是下游可见的名称，必须是 `[A-Za-z_][A-Za-z0-9_]*`，同一阶段内不能重复。
- 只有配置在 `outputs` 中的文件才能被下游引用。

#### 阶段输入引用

下游阶段通过 `inputRefs` 引用上游暴露的文件：

```json
{
  "id": "ref-features",
  "key": "features",
  "stageId": "upstream-stage-id",
  "outputName": "upstream-output-name"
}
```

- `key` 是**当前阶段内**使用的引用变量名。
- 在命令/参数中使用 `{{key}}`，运行时会替换为上游文件的绝对路径。
- 只能引用**当前阶段之前**的阶段。
- 同一阶段内 `key` 不能重复，也不能与模板全局参数 key 重名。
- 上游阶段必须存在，且其 `outputs` 中必须有对应的 `outputName`。

#### 阶段顺序

阶段按数组顺序串行执行。下游只能引用前面的阶段，不能形成循环。

### 2.3 Task

```json
{
  "id": "task-uuid",
  "name": "实验 A",
  "description": "可选",
  "datasetId": "dataset-uuid-or-empty",
  "cwd": "",
  "groups": [
    {
      "id": "group-control",
      "name": "Control",
      "role": "control",
      "templateId": "template-uuid",
      "parameters": [
        { "key": "WEIGHT", "value": "1.25" }
      ],
      "stageConfigs": [
        {
          "stageId": "stage-clean",
          "name": "清洗查询",
          "command": "node",
          "args": "-e \"...\"",
          "outputs": [
            { "id": "out-normalized", "name": "normalized", "file": "normalized.json" }
          ],
          "inputRefs": []
        }
      ]
    }
  ],
  "createdAt": 1793980000000,
  "updatedAt": 1793980000000
}
```

- `role` 只能是 `control` 或 `treatment`。
- 必须有且只有一个 `control` 组；可以有 0 个或多个 `treatment` 组。
- `parameters` 是该组的全局参数值；缺失的 key 会在启动运行时用模板默认值补齐。
- `stageConfigs` 是模板阶段的**快照**。创建任务时必须从模板复制 `command`、`args`、`outputs`、`inputRefs`，并保留 `stageId`。
- `stageConfigs[].inputRefs[].stageId` 指向同一个 group 内上游阶段的 `stageConfigs[].stageId`。
- `cwd` 为空时使用 DSH 默认工作目录；否则为绝对路径或相对于默认目录的路径。

---

## 3. 读取状态

```js
const state = await fetch('/techhub/api/state').then((response) => response.json());
```

返回：

```json
{
  "version": 1,
  "datasets": [],
  "templates": [],
  "tasks": [],
  "runs": [],
  "settings": {},
  "saveError": null
}
```

`runs` 是运行记录；`settings` 包含当前 workspace 信息。

---

## 4. Workspace manifest 与项目文件

当前 workspace 下会维护：

```text
<workspace>/
  techhub-workspace.json   # datasets / templates / tasks 的完整定义
  runs/                    # 运行结果
  ...                      # 你的脚本、代码、资源文件
```

`techhub-workspace.json` 是 workspace 的项目清单，包含：

```json
{
  "format": "techhub-workspace",
  "version": 1,
  "updatedAt": 1793980000000,
  "includeTasks": true,
  "datasets": [],
  "templates": [],
  "tasks": []
}
```

- 数据集定义、模板命令/参数/输出、任务配置都保存在这个清单中。
- 模板引用的脚本、代码、数据文件应放在 workspace 下；导出 workspace 时会一起打包。
- 不要手动编辑这个清单；通过 API 保存会自动更新。
- 服务重启时会优先读取当前 workspace 的清单。

### 4.1 模板脚本目录（约定）

每个任务模板的脚本放在 workspace 下以模板 `id` 命名的独立目录里，一个模板一个文件夹：

```text
<workspace>/scripts/
├── README.md
├── template-miao-suffix/          # 模板 template-miao-suffix
│   ├── miao_dataset.py
│   └── README.md
└── template-miew-bash-pipeline/   # 模板 template-miew-bash-pipeline
    ├── 01_lowercase.sh
    ├── 02_append_miew.sh
    ├── 03_append_miew2.sh
    └── README.md
```

- 目录名使用模板 `id`，与模板一一对应；同一模板的所有阶段脚本都放在该目录内。
- 阶段命令用 `%TECHHUB_WORKSPACE%/scripts/<模板 id>/<脚本>` 引用（`TECHHUB_WORKSPACE` 由宿主注入；非 Windows shell 用 `$TECHHUB_WORKSPACE`），这样移动 workspace 或导入导出后路径依然有效。
- 移动或重命名脚本后，模板的 `stages[].args` 和已有任务的 `groups[].stageConfigs[].args` 都要同步更新——任务保存的是快照，不会跟随模板变化。

## 5. 全量保存状态

```js
async function saveState(mutator) {
  const state = await fetch('/techhub/api/state').then((r) => r.json());

  const payload = {
    datasets: state.datasets,
    templates: state.templates,
    tasks: state.tasks
  };

  mutator(payload);

  const response = await fetch('/techhub/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
  return result;
}
```

注意：

- 不要传 `runs`；保存状态不会创建运行记录。
- 被移除的任务对应的 runs 会被删除，活跃运行会被停止。
- 保存后检查返回的任务/模板/数据集 ID，确认没有被校验丢弃。

---

## 6. 数据集 CRUD

### 创建 JSONL 数据集

```js
await saveState((state) => {
  state.datasets.push({
    id: crypto.randomUUID(),
    name: 'My JSONL Dataset',
    description: '',
    format: 'jsonl',
    raw: '{"query":"hello"}\n{"query":"world"}\n',
    columns: ['query'],
    rowCount: 2,
    sourceName: 'queries.jsonl',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

### 创建 CSV 数据集

```js
{
  id: crypto.randomUUID(),
  name: 'My CSV Dataset',
  format: 'csv',
  raw: 'query,label\nhello,greeting\nworld,greeting\n',
  columns: ['query', 'label'],
  rowCount: 2,
  sourceName: 'queries.csv',
  createdAt: Date.now(),
  updatedAt: Date.now()
}
```

### 修改数据集

先读取状态，按 `id` 找到 dataset，修改需要改的字段，保留 `id` 和 `createdAt`，把 `updatedAt` 设为当前时间，再保存完整状态。

### 删除数据集

从 `state.datasets` 中移除对应 `id`，保存完整状态。

注意：宿主不会阻止删除仍被任务引用的数据集。删除后任务仍可运行，但不会得到 `TECHHUB_DATASET_PATH`，依赖数据集的命令可能失败。删除前先检查 `tasks[].datasetId`。

### 数据集文件

保存或打开数据集时，宿主会把数据集物化到 workspace：

```text
<workspace>/datasets/<name>__<id>/
  dataset.json   # id/name/format/file/columns/rowCount 等元数据
  data.jsonl     # 或 data.csv，完整 raw 内容
```

这些文件会随 workspace 一起导出。不要直接修改 `dataset.json`；修改数据集应通过 `/state` 保存。

打开数据集目录：

```js
await fetch('/techhub/api/open-folder', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ datasetId: 'dataset-uuid' })
});
```

---

## 7. 模板 CRUD

### 创建模板

```js
const cleanStage = {
  id: 'stage-clean',
  name: '清洗查询',
  description: '',
  command: 'node',
  args: '-e "const fs=require(\'fs\');const q=fs.readFileSync(process.env.TECHHUB_DATASET_PATH,\'utf8\');fs.writeFileSync(process.env.TECHHUB_OUTPUT_DIR+\'/normalized.json\',q.trim())"',
  outputs: [
    { id: 'out-normalized', name: 'normalized', file: 'normalized.json' }
  ],
  inputRefs: []
};

const scoreStage = {
  id: 'stage-score',
  name: '计算得分',
  description: '',
  command: 'node',
  args: '-e "const fs=require(\'fs\');const q=fs.readFileSync(\'{{normalized}}\',\'utf8\');fs.writeFileSync(process.env.TECHHUB_OUTPUT_DIR+\'/score.json\',JSON.stringify({length:q.length,weight:{{WEIGHT}}}))"',
  outputs: [
    { id: 'out-score', name: 'score', file: 'score.json' }
  ],
  inputRefs: [
    { id: 'ref-normalized', key: 'normalized', stageId: 'stage-clean', outputName: 'normalized' }
  ]
};

await saveState((state) => {
  state.templates.push({
    id: 'template-uuid',
    name: 'My Pipeline',
    description: '',
    parameters: [
      { id: 'p-weight', key: 'WEIGHT', defaultValue: '1', description: '权重' }
    ],
    stages: [cleanStage, scoreStage],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

### 修改模板

- 先读取状态，按 `id` 替换 template。
- 保留 `id` 和 `createdAt`，更新 `updatedAt`。
- 任务保存的是阶段快照；修改模板不会自动更新已有任务。
- 修改阶段顺序后，确保所有 `inputRefs[].stageId` 仍然指向该阶段之前的上游阶段。
- 删除某个 output 时，删除其他阶段对它的 `inputRefs`。

### 删除模板

从 `state.templates` 移除。已有任务仍保留自己的阶段快照，但编辑任务时会找不到模板；建议先处理引用该模板的任务。

---

## 8. 任务 CRUD

### 从模板创建任务

```js
const template = state.templates.find((item) => item.id === 'template-uuid');

const group = {
  id: crypto.randomUUID(),
  name: 'Control',
  role: 'control',
  templateId: template.id,
  parameters: template.parameters.map((parameter) => ({
    key: parameter.key,
    value: parameter.defaultValue
  })),
  stageConfigs: template.stages.map((stage) => ({
    stageId: stage.id,
    name: stage.name,
    command: stage.command,
    args: stage.args,
    outputs: stage.outputs.map((output) => ({ ...output })),
    inputRefs: stage.inputRefs.map((reference) => ({ ...reference }))
  }))
};

await saveState((state) => {
  state.tasks.push({
    id: crypto.randomUUID(),
    name: 'My Experiment',
    description: '',
    datasetId: 'dataset-uuid',
    cwd: '',
    groups: [group],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

Treatment 组使用 `role: "treatment"`，可以复制同一模板并覆盖 `parameters`。

### 修改任务

- 先读取状态，按 `id` 替换 task。
- 保留 `id`、`createdAt`，更新 `updatedAt`。
- 修改阶段命令时，同时更新 `stageConfigs`。
- 重新选择模板/修改模板后，需要重新生成该组的 `stageConfigs`。
- 修改正在运行的任务不会影响当前 run；当前 run 已经快照了配置。

### 删除任务

```js
await saveState((state) => {
  state.tasks = state.tasks.filter((task) => task.id !== 'task-uuid');
});
```

删除任务会停止该任务的活跃运行并删除其 runs。执行前必须确认用户确实要删除。

---

## 9. 启动、监控和清理运行

### 启动

```js
const response = await fetch('/techhub/api/runs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ taskId: 'task-uuid' })
});
const run = await response.json(); // 201
```

所有组同时启动；组内阶段串行执行。同一任务可以同时启动多次运行，不同任务互不阻塞。

### 轮询

```js
async function waitForRun(runId) {
  for (;;) {
    const run = await fetch('/techhub/api/runs/' + runId).then((r) => r.json());
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

状态：

- `running`
- `completed`
- `failed`
- `stopped`

组和阶段也有各自的 `status`。

### 查看日志

run 的 `groups[].stages[]` 中有：

- `stdout`
- `stderr`
- `exitCode`
- `startedAt` / `endedAt`

日志持久化在：

```text
<workspace>/runs/<run-id>/groups/<group>/stages/<stage>/stdout.log
<workspace>/runs/<run-id>/groups/<group>/stages/<stage>/stderr.log
```

### 停止

```js
await fetch('/techhub/api/runs/' + runId + '/stop', { method: 'POST' });
```

### 删除运行

仅允许删除非 `running` 的 run：

```js
await fetch('/techhub/api/runs/' + runId, { method: 'DELETE' });
```

### 导出结果

```js
window.location = '/techhub/api/runs/' + runId + '/export';
```

返回 ZIP，包含 `run.json`、数据集快照、分组/阶段目录、日志、input 描述文件和 output 文件。

### 查看阶段输出

```js
const stageId = encodeURIComponent(`${group.id}:${stage.stageId}`);
const listing = await fetch(
  `/techhub/api/runs/${runId}/stages/${stageId}/output`
).then((r) => r.json());
```

返回：

```json
{
  "dir": ".../output",
  "files": [
    { "path": "normalized.json", "size": 123, "mtime": 1793980000000 }
  ]
}
```

读取文件：

```text
GET /techhub/api/runs/<runId>/stages/<encoded-stage-id>/output/file?path=<relative-path>
```

只允许读取该阶段 output 目录内的普通文件。

### 打开文件夹

```js
await fetch('/techhub/api/open-folder', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ runId, groupId, stageId })
});
```

- 只传 `datasetId`：打开数据集目录
- 只传 `runId`：打开运行根目录
- 传 `runId + groupId`：打开分组目录
- 传 `runId + stageId`：打开阶段目录

此操作会打开系统文件管理器，除非用户要求，否则不要自动调用。

---

## 10. 运行目录与环境变量

默认工作区：

```text
<DSH_PROFILE_DIR>/techhub/workspace
```

运行目录：

```text
runs/<run-id>/
  run.json
  dataset.jsonl / dataset.csv
  groups/<group>/
    stages/<stage>/
      input/input.json
      output/
      stdout.log
      stderr.log
```

阶段命令可以使用：

- `TECHHUB_RUN_ID`
- `TECHHUB_RESULTS_DIR`
- `TECHHUB_WORKSPACE`
- `TECHHUB_TASK_ID`
- `TECHHUB_TASK_NAME`
- `TECHHUB_GROUP_ID`
- `TECHHUB_GROUP_NAME`
- `TECHHUB_GROUP_ROLE`
- `TECHHUB_STAGE_ID`
- `TECHHUB_STAGE_NAME`
- `TECHHUB_DATASET_PATH`
- `TECHHUB_DATASET_FORMAT`
- `TECHHUB_DATASET_ID`
- `TECHHUB_DATASET_NAME`
- `TECHHUB_INPUT_DIR`
- `TECHHUB_INPUT_MANIFEST`
- `TECHHUB_INPUT_REFS`
- `TECHHUB_INPUT_PATHS`
- `TECHHUB_OUTPUT_DIR`

阶段输出：

- 命令把文件写入 `TECHHUB_OUTPUT_DIR`。
- 只有模板中 `outputs` 配置过的文件，才能被下游通过 `inputRefs` 引用。
- 下游阶段启动前，`input/` 只生成 `input.json` 描述文件，不复制上游文件。
- 模板/任务中 `inputRefs[].key` 的值可以在命令里写成 `{{key}}`，运行时会替换为上游文件绝对路径。
- 全局参数使用 `{{KEY}}`，同样在运行时替换。
- 路径在 Windows 下替换为 `/` 分隔；命令中引用路径时建议加引号。

---

## 11. Workspace 管理

读取当前设置：

```js
const state = await fetch('/techhub/api/state').then((r) => r.json());
state.settings;
```

修改工作区：

```js
await fetch('/techhub/api/workspace', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ path: 'D:\\TechHubResults' })
});
```

- 路径必须是绝对路径；空字符串表示恢复默认。
- 修改后只影响未来运行；已有结果保留在原路径。

### 导出 workspace

```text
GET /techhub/api/workspace/export?includeTasks=0
GET /techhub/api/workspace/export?includeTasks=1
```

- 返回 ZIP。
- `includeTasks=0`（默认）：导出数据集、模板、workspace manifest 以及 workspace 下的脚本/资源文件；**不导出任务和 runs**。
- `includeTasks=1`：额外导出任务定义和整个 `runs/` 目录。
- 导出始终包含当前 workspace 下除 `runs/` 外的文件，因此脚本和代码应放在 workspace 内。

### 导入 workspace

```text
POST /techhub/api/workspace/import
Content-Type: application/zip
Body: ZIP
```

- 导入会**替换当前 workspace 的项目内容**：
  - 数据集和模板按 bundle 替换。
  - 如果 bundle 的 `includeTasks` 为 true，任务和 runs 也替换。
  - 如果未包含任务，当前任务和 runs 会被清空。
- 导入前必须先停止所有活跃运行。
- 导入后 `run.json` 中的路径会重定位到当前 workspace。
- 导入适合配置新的 workspace；UI 中通过「导入 workspace」选择 ZIP。

### 重置工作区（**危险**）

```text
POST /techhub/api/workspace/reset
```

会：

- 停止活跃运行
- 清空所有任务和 runs
- 删除当前 workspace 下的 `run-*` 目录
- 保留 datasets 和 templates

除非用户明确要求，否则绝不要调用。

---

## 11.1 主题

TechHub 顶部的调色板按钮提供预设主题：`default`、`blue`、`emerald`、`amber`、`violet`、`rose`。主题是 profile 级 UI 偏好，不会写入 workspace，也不随 workspace 导出。

```text
PUT /techhub/api/theme
Content-Type: application/json

{ "theme": "blue" }
```

### 语言

顶部语言选择器支持：

- `auto`：跟随 DSH 语言
- `zh`：中文
- `en`：English

语言设置保存在 profile 的 `techhub/config.json`，不随 workspace 导出。

```text
PUT /techhub/api/language
Content-Type: application/json

{ "language": "en" }
```

## 12. Agent 推荐工作流

1. `GET /state`，记录现有 IDs。
2. 创建或更新 dataset。
3. 创建或更新 template；检查 output/inputRef/参数校验。
4. 创建 task；从模板复制所有阶段的 `command`、`args`、`outputs`、`inputRefs`。
5. `PUT /state`；检查响应中对象数量。
6. `POST /runs` 启动任务。
7. 轮询 `GET /runs/:id` 直到结束。
8. 读取 stdout/stderr、output 文件或导出 ZIP。
9. 如需清理，删除运行或任务；不要清空整个 workspace。

移植 workspace：

1. 在原 workspace 调用 `GET /workspace/export?includeTasks=0`（默认不含任务）或 `includeTasks=1`。
2. 通过 `PUT /workspace` 指向新的空目录。
3. 调用 `POST /workspace/import` 上传 ZIP。
4. 导入后重新读取 `/state` 确认 datasets/templates/tasks 数量。

## 13. 文档编辑

TechHub 的 **Docs** 页面可以直接读取、编辑并保存这份文档。

- 页面默认处于**只读模式**，Markdown 会自动渲染为标题、列表、代码块、表格和链接。
- 点击「编辑文档」后进入编辑模式。
- 编辑后点击「保存文档」，或使用 `Ctrl/Cmd + S`。
- 保存成功后自动回到只读模式；取消会丢弃未保存的修改。
- 保存位置是 DSH profile 下的覆盖文件：

```text
<DSH_PROFILE_DIR>/techhub/AGENT_GUIDE.md
```

如果这个文件不存在，插件使用内置的 `skills/techhub/SKILL.md`。覆盖文件不会被插件升级覆盖。

对应 API：

```text
GET /techhub/api/guide
PUT /techhub/api/guide
Content-Type: application/json

{ "markdown": "# ..." }
```

## 14. 常见错误

- **任务保存后消失**：没有且只有一个 `control` 组，或 group/stage 缺少合法 ID。
- **下游读不到文件**：上游没有在 `outputs` 中暴露该文件，或 `inputRefs` 的 `stageId`/`outputName` 不匹配。
- **占位符没有替换**：引用 key 和命令里的 `{{key}}` 不一致，或 key 与全局参数冲突。
- **修改模板后任务没变化**：任务使用快照，需要更新 `stageConfigs` 或重新创建任务。
- **运行失败但看不到日志**：检查 run 的 `groups[].stages[].stderr`，以及 `groups/<group>/stages/<stage>/stderr.log`。
- **`PUT /state` 后其他数据消失**：请求只带了部分数组。必须提交完整的 `datasets`、`templates`、`tasks`。
- **运行中的 run 无法删除**：先 `POST /runs/:id/stop`。
