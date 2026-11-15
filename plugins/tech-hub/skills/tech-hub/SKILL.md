---
name: tech-hub
description: Operate the TechHub evaluation plugin: manage datasets, reusable stages, templates, tasks, runs, workspace bundles, themes, language and documentation.
---

# TechHub Agent 使用指南

这份文档同时作为 DSH 运行时 skill **`tech-hub`** 注册。插件启动或安装时会自动注册该 skill；插件关闭或卸载时会自动移除。

这份文档面向需要管理 TechHub 数据的 agent。目标是让 agent 在不破坏现有数据的前提下，正确创建、修改、删除数据集、阶段、任务模板和任务，并能启动、监控和导出实验运行。

TechHub 有四个页面：

- **Datasets**：JSONL / CSV 数据集
- **Stages**：可复用的阶段库，一个阶段 = 一条命令 + 默认参数 + 对外输出
- **Templates**：按顺序引用阶段库里的阶段，配置全局参数与阶段输入引用
- **Tasks**：一次真实实验运行；一个 Control 组 + 任意多个 Treatment 组

---

## 0. 最重要的规则

1. **不要直接编辑 `store.json` 或 workspace manifest。** 使用 `/techhub/api` 或 Web UI。直接改文件可能丢失并发写入，也可能写出无法通过校验的结构。
2. **`PUT /state` 是全量替换。** 它用请求里的 `datasets`、`stages`、`templates`、`tasks` 替换整个目录。修改前必须先 `GET /state`，保留所有未修改对象，再提交完整数组。
3. **阶段先建、模板再引用并接线。** 模板的 `stages[].stageId` 只能指向阶段库中已有的阶段；阶段声明的输入与参数，必须由模板把来源绑到**上方阶段**的输出/参数或**全局参数**上，没有第四种来源。命令/输出改在阶段实体上，模板里不内联命令。
4. **一次任务只能有一个 `control` 组。** 服务端会丢弃没有 Control 组或 Control 组数量不为 1 的任务。
5. **任务使用模板快照。** 修改阶段或模板后，已有任务不会自动更新；需要同步更新任务的 `groups[].stageConfigs`，或重新创建任务。
6. **不要调用 `/workspace/reset`。** 它会清空所有任务和运行记录。只有用户明确要求重置时才使用。
7. **删除任务会删除其运行记录。** 通过 `PUT /state` 移除任务后，服务端会停止该任务的活跃运行并删除对应 run 记录。
8. **提交后检查响应。** 服务端会静默丢弃校验失败的对象；必须检查响应中的数组数量、ID 和关键字段。
9. **workspace 是项目根目录。** 数据集、阶段、模板、任务定义会持久化到 workspace 的 manifest，脚本和代码也必须放在 workspace 下。使用 workspace 导出/导入来复制项目。

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

### 2.2 Stage（阶段库）

阶段是**可复用的命令单元**，设计参考 Aether 的模块（module）：带类型的端口 + 单条命令模板 + 超时。阶段对外暴露三类端口：**输入**（消费的值）、**参数**（带默认值的配置项）、**输出**（产出文件或目录）。

```json
{
  "id": "stage-score",
  "name": "计算得分",
  "description": "可选",
  "command": "node -e \"...\" \"@@payload@@\" \"@@THRESHOLD@@\" > \"@@score@@\"",
  "timeoutSec": 300,
  "inputs": [
    { "id": "in-payload", "name": "payload", "type": "file", "required": true, "description": "上游产出的文件" }
  ],
  "parameters": [
    { "id": "param-threshold", "name": "THRESHOLD", "type": "number", "defaultValue": "0.5", "description": "判定阈值" }
  ],
  "outputs": [
    { "id": "out-score", "name": "score", "type": "file", "file": "score.json" }
  ],
  "assetKind": "directory",
  "assetName": "bundle",
  "assetFileCount": 2,
  "assetSize": 1234,
  "createdAt": 1793980000000,
  "updatedAt": 1793980000000
}
```

- `command` 是必填的**单条命令字符串**：可执行文件、参数、重定向都写在一起，原样交给 shell 执行（没有单独的 `args` 字段；旧数据里的 `command` + `args` 会自动合并）。
- `timeoutSec`：0（默认）表示不限制；>0 时宿主超时后终止该阶段的进程树并标记失败。
- **端口类型**（与 Aether 一致）：
  - `inputs[].type` / `outputs[].type`：`string|number|boolean|json|file|directory`，默认 `string`；
  - `parameters[].type`：`string|number|boolean|json`，默认 `string`；
  - `outputs[].type` 只能是 `file` 或 `directory`（`directory` 表示 `file` 指向一个目录）。
- `inputs[].required`（默认 `true`）：必填输入必须由模板绑定来源；`false` 时模板可以留空（占位符保持原样）。
- `inputs[].name` / `parameters[].name` / `outputs[].name` 都必须是 `[A-Za-z_][A-Za-z0-9_]*`，且三者**任意两个之间都不能重名**（它们共用 `@@名称@@` 命名空间），也不能与内置变量同名。
- 命令里用 `@@输入名@@` / `@@参数名@@` / `@@输出名@@` 引用：
  - 输入：替换为模板里绑定的值（上游输出路径 / 上游参数值 / 全局参数值）；
  - 参数：替换为绑定值，未绑定时用 `defaultValue`；
  - 输出：替换为该输出文件的绝对路径（`TECHHUB_OUTPUT_DIR` 下），方便命令直接写文件。
- **内置变量**无需声明即可在命令里引用（`@@run_id@@`、`@@run_dir@@`、`@@task_id@@`、`@@task_name@@`、`@@group_id@@`、`@@group_name@@`、`@@group_role@@`、`@@stage_id@@`、`@@stage_name@@`、`@@stage_dir@@`、`@@input_dir@@`、`@@output_dir@@`、`@@workspace@@`、`@@work_dir@@`、`@@dataset_path@@`、`@@dataset_format@@`）。
- **命令模板校验**（保存前）：`@@` 必须成对闭合、不能有空占位符或跨行占位符；除内置变量外，每个名字都必须在本阶段声明过，否则拒绝保存。模板全局参数仍然用 `{{KEY}}` 引用（不走 `@@`）。
- `outputs[].file` 是相对于该阶段 `output/` 的路径，不能是绝对路径，也不能包含 `..`。
- 只有配置在 `outputs` 中的文件才能被下游引用。
- 阶段**不保存**“谁给我值”：输入与参数的来源由模板在引用阶段时绑定（见 2.3）。
- `id` 必须唯一且非空；编辑阶段后，所有引用它的模板立即生效。

#### 提交文件 / 文件夹（asset）

阶段可以像 Aether 模块一样**自带提交的文件或文件夹**（例如脚本、配置、小样本），运行时会复制到该阶段的工作目录，**命令的 cwd 就是提交内容的根目录**，根目录里能看到全部提交内容。

- 字段：`assetKind`（`file` | `directory`，空串表示没有提交）、`assetName`、`assetFileCount`、`assetSize`。
- 上传接口（先上传、再保存阶段）：

```text
POST /techhub/api/stage-assets
Content-Type: application/json

{
  "stageId": "stage-uuid",
  "kind": "directory",
  "name": "bundle",
  "files": [
    { "path": "hello.txt", "data": "<base64>" },
    { "path": "sub/extra.txt", "data": "<base64>" }
  ]
}
```

  返回 `{ assetKind, assetName, assetFileCount, assetSize }`，把它合并进阶段对象后随 `PUT /state` 保存。文件路径必须为相对路径（不能含 `..`/盘符）；单个阶段最多 1000 个文件、总计 64MB；`kind: "file"` 时只能提交 1 个文件。
- 保存后文件物化到 `stages/<名称>__<id>/files/`；运行时复制到 `runs/<run>/groups/<组>/stages/<阶段>/work/`，命令在该 `work/` 下执行。单文件提交时文件就在 `work/` 根下（例如 `python script.py` 直接可用）；文件夹提交时其内容在根下（不含被选中的那层目录）。
- 没有提交文件的阶段仍在任务的工作目录（`cwd`）下执行，行为不变。
- `@@work_dir@@` / `TECHHUB_WORK_DIR` 指向实际执行目录；清除提交（`assetKind: ""`）会在下次保存时删除 `files/`。

### 2.3 Template

```json
{
  "id": "template-uuid",
  "name": "示例：Query 清洗与评分",
  "description": "可选",
  "datasetId": "dataset-uuid",
  "parameters": [
    { "id": "p-weight", "key": "WEIGHT", "type": "number", "defaultValue": "1.25", "description": "词数权重" }
  ],
  "stages": [
    { "id": "ts-clean", "stageId": "stage-clean", "inputs": [], "parameters": [] },
    {
      "id": "ts-score",
      "stageId": "stage-score",
      "inputs": [
        {
          "id": "b-1",
          "name": "payload",
          "source": { "kind": "output", "stageId": "ts-clean", "name": "normalized" }
        }
      ],
      "parameters": [
        {
          "id": "b-2",
          "name": "THRESHOLD",
          "source": { "kind": "global", "name": "WEIGHT" }
        }
      ]
    }
  ],
  "createdAt": 1793980000000,
  "updatedAt": 1793980000000
}
```

`stages[]` 是**引用**，不内联命令：

- **模板自己声明数据集**：`datasetId` 指向 `state.datasets` 里的数据集（可空）。任务是“用这个模板跑实验”，因此**不再单独选数据集**，而是继承模板的 `datasetId`；同一任务的不同分组可以引用不同模板，从而各用各的数据集。
- 运行时每个分组会把它模板的数据集导出成 `runs/<run>/groups/<组>/dataset.jsonl|csv`，阶段通过 `TECHHUB_DATASET_PATH` / `@@dataset_path@@` 读取（见第 10 节）。
- 旧的 `task.datasetId` 仍然兼容：模板没有 `datasetId` 时回退到任务级数据集；新数据建议只写在模板上。
- `stages[].id` 是该阶段在本模板中的实例 id，同一模板内唯一。
- `stages[].stageId` 必须指向 `state.stages` 中已存在的阶段；指向不存在的阶段会在保存时被丢弃。
- `stages[].inputs` 为阶段声明的每个输入提供来源；`inputs[].name` 必须与阶段声明的输入同名。
- `stages[].parameters` 为阶段声明的每个参数提供来源；`source` 为 `null` 表示使用阶段默认值。
- 阶段按数组顺序串行执行；下游只能引用前面的阶段，不能形成循环。
- 同一个模板里一个阶段最多出现一次。

#### 取值来源（source）

```json
{ "kind": "output",    "stageId": "ts-clean", "name": "normalized" }
{ "kind": "parameter", "stageId": "ts-clean", "name": "THRESHOLD" }
{ "kind": "global",    "name": "WEIGHT" }
```

- `kind: "output"`：取**前面某个阶段**暴露的输出（文件或目录），运行时值是该路径的绝对路径（Windows 用 `/`）。
- `kind: "parameter"`：取**前面某个阶段**解析后的参数值。
- `kind: "global"`：取模板全局参数（任务分组可以覆盖）。
- 三种来源之外的写法无效；来源必须指向前面的阶段（`stageId` 是 `stages[].id`，不是阶段库 id），或模板已声明的全局参数 key。
- **类型必须兼容**：目标端口是 `string` 时接受任何来源；否则来源类型必须与端口类型一致（`file→file`、`directory→directory`、`number→number`…）。全局参数一律视作 `string`。
- **必填输入**（`required !== false`）必须绑定；可选输入可以留空，未绑定时命令里的 `@@名称@@` 保持原样。
- 不合法、类型不兼容或找不到的来源会在保存时被清空：输入变回未绑定（`source: null`，需要重新选择），参数回退到默认值。

#### 全局参数

- `key` 必须是 `[A-Za-z_][A-Za-z0-9_]*`；同一模板内不能重复。
- `type`：`string|number|boolean|json`，默认 `string`；`defaultValue` 必须符合类型（number 要能转数字，boolean 为 true/false/1/0，json 要能解析）。
- 在阶段命令/参数中使用 `{{KEY}}`；运行时会替换为该组配置的值（任务分组可以覆盖默认值）。
- 全局参数也是一类来源：`{ "kind": "global", "name": "KEY" }`。它的类型参与绑定的类型校验（`number` 全局只能喂 `number`/`string` 端口，`string` 全局不能喂 `file`/`directory`/`number`）。
- 阶段输入/参数/输出名与全局 key 分属两套占位符（`@@` / `{{ }}`），同名也不冲突。

#### 旧版 inputRefs（已迁移）

旧数据里的 `stages[].inputRefs`（`key`/`stageId`/`outputName`）会在加载或保存时自动转换：为对应阶段补上同名 `inputs` 声明，并生成 `kind: "output"` 的绑定，然后清空 `inputRefs`。已有任务的 `stageConfigs` 快照里若仍有 `inputRefs`，运行引擎继续支持。

### 2.4 Task

```json
{
  "id": "task-uuid",
  "name": "实验 A",
  "description": "可选",
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
          "stageId": "ts-clean",
          "name": "清洗查询",
          "command": "node -e \"...\"",
          "timeoutSec": 120,
          "inputs": [],
          "parameters": [
            { "id": "p-stamp", "name": "STAMP", "type": "string", "defaultValue": "x", "source": { "kind": "global", "name": "WEIGHT" } }
          ],
          "outputs": [
            { "id": "out-normalized", "name": "normalized", "type": "file", "file": "normalized.json" }
          ]
        },
        {
          "stageId": "ts-score",
          "name": "计算得分",
          "command": "node -e \"...\" \"@@payload@@\" > \"@@score@@\"",
          "timeoutSec": 0,
          "inputs": [
            {
              "id": "b-1",
              "name": "payload",
              "type": "file",
              "required": true,
              "source": { "kind": "output", "stageId": "ts-clean", "name": "normalized" }
            }
          ],
          "parameters": [
            { "id": "p-threshold", "name": "THRESHOLD", "type": "number", "defaultValue": "0.5", "source": null }
          ],
          "outputs": [
            { "id": "out-score", "name": "score", "type": "file", "file": "score.json" }
          ]
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
- 数据集由**分组引用的模板**决定（模板的 `datasetId`），任务本身不再选数据集；旧任务的 `task.datasetId` 只在模板没有声明数据集时作为回退。
- `parameters` 是该组的全局参数值；缺失的 key 会在启动运行时用模板默认值补齐。值应按模板里声明的类型填写（`number`/`boolean`/`json` 会在 UI 保存时校验）。
- `stageConfigs` 是**解析后的快照**：把模板引用的阶段从阶段库展开，复制 `name`、`command`（单条命令字符串）、`outputs`，以及每个输入/参数的绑定 `inputs` / `parameters`（参数带 `defaultValue`），并保留模板实例 id 作为 `stageId`。
- `stageConfigs[].inputs[].source` / `parameters[].source` 的 `stageId` 指向同一个 group 内上游阶段的 `stageConfigs[].stageId`；`kind: "global"` 指向该组 `parameters` 里的 key。
- 旧任务的 `stageConfigs[].inputRefs` 仍然有效（运行引擎继续支持），新任务不再生成它。
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
  "stages": [],
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
  techhub-workspace.json          # datasets / stages / templates / tasks 的完整定义（catalogue）
  datasets/<名称>__<id>/           # 每个数据集一个文件夹
    dataset.json                  # 说明与元数据
    data.jsonl | data.csv
  stages/<名称>__<id>/             # 每个阶段一个文件夹
    stage.json                    # 阶段说明与配置（命令、端口、超时、提交的文件信息）
    files/                        # 阶段提交的文件 / 文件夹内容（可选）
  templates/<名称>__<id>/          # 每个模板一个文件夹
    template.json                 # 模板说明与配置（全局参数、阶段引用与绑定）
  scripts/                        # 阶段脚本（仍按脚本目录约定）
  runs/                           # 运行结果
  ...                             # 你的其它文件
```

- **每个阶段、每个模板都有自己的文件夹和说明配置文件**（`stage.json` / `template.json`，带 `format: techhub-stage|techhub-template`、`version` 和完整定义），便于浏览、备份和随 workspace 迁移；数据集沿用已有约定。
- 这些文件夹是 **catalogue 的物化副本**：`techhub-workspace.json` 仍是权威来源，插件在加载和每次保存时按 catalogue 重写文件夹、删除已删除对象的文件夹（只删带自己说明文件、且 id 已不在 catalogue 的目录），其它文件不会被碰。
- 因此不要只靠手改文件夹来改阶段/模板——用 `/techhub/api` 或 UI 修改，下一次保存会覆盖文件夹内容。要整体搬走项目用 workspace 导出/导入。
- 文件夹名是 `<安全化的名称>__<安全化的 id>`；重命名阶段/模板会移动文件夹，id 不变。
- 三个“打开文件夹”入口（数据集 / 阶段 / 模板卡片与详情）可以打开对应目录。

`techhub-workspace.json` 是 workspace 的项目清单，包含：

```json
{
  "format": "techhub-workspace",
  "version": 1,
  "updatedAt": 1793980000000,
  "includeTasks": true,
  "datasets": [],
  "stages": [],
  "templates": [],
  "tasks": []
}
```

- 数据集定义、阶段定义（命令/端口/超时）、模板引用与参数、任务配置都保存在这个清单中。
- 清单之外，每个数据集/阶段/模板还各有一个自己的文件夹（见上面的目录树）；它们由插件按 catalogue 物化，不要手改。
- 模板引用的脚本、代码、数据文件应放在 workspace 下（推荐 `scripts/`）；导出 workspace 时会一起打包。
- 不要手动编辑这个清单；通过 API 保存会自动更新。
- 服务重启时会优先读取当前 workspace 的清单。

### 4.1 脚本目录（约定）

脚本放在 workspace 下、按拥有者分文件夹：

```text
<workspace>/scripts/
├── README.md
├── template-miao-suffix/          # 只属于模板 template-miao-suffix 的脚本
│   ├── miao_dataset.py
│   └── README.md
└── template-miew-bash-pipeline/   # 只属于模板 template-miew-bash-pipeline 的脚本
    ├── 01_lowercase.sh
    ├── 02_append_miew.sh
    ├── 03_append_miew2.sh
    └── README.md
```

- 阶段现在属于**阶段库**，可以被多个模板引用，因此更推荐按阶段建目录：`<workspace>/scripts/<stage-id>/`；只有一个模板使用的旧脚本沿用模板 id 目录即可。
- 阶段命令用 `%TECHHUB_WORKSPACE%/scripts/<目录>/<脚本>` 引用（`TECHHUB_WORKSPACE` 由宿主注入；非 Windows shell 用 `$TECHHUB_WORKSPACE`），这样移动 workspace 或导入导出后路径依然有效。
- 不要把脚本放进 `stages/<名称>__<id>/` 或 `templates/<名称>__<id>/`：这些目录名会随重命名变化，且内容会被 catalogue 覆盖/清理；它们只放各自的说明配置文件。
- 移动或重命名脚本后，阶段库里的 `stages[].command`（阶段实体）和已有任务的 `groups[].stageConfigs[].command`（快照）都要同步更新——任务不会跟随阶段或模板变化。

## 5. 全量保存状态

```js
async function saveState(mutator) {
  const state = await fetch('/techhub/api/state').then((r) => r.json());

  const payload = {
    datasets: state.datasets,
    stages: state.stages,
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
- `stages` 省略时保留现有阶段库（旧客户端不会误删）；显式传 `[]` 会清空阶段库，并从所有模板里移除对应阶段。
- 保存后检查返回的阶段/模板/任务/数据集 ID，确认没有被校验丢弃。

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

注意：宿主不会阻止删除仍被模板引用的数据集。删除后模板的同名 `datasetId` 会失效，运行时会以“数据集不存在”失败（UI 删除时会先提示，并清空这些模板的 `datasetId`）。删除前先检查 `templates[].datasetId`；旧任务还要看 `tasks[].datasetId`。

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

## 7. 阶段与模板 CRUD

### 创建阶段

```js
await saveState((state) => {
  state.stages.push({
    id: 'stage-clean',
    name: '清洗查询',
    description: '',
    command: 'node -e "const fs=require(\'fs\');const q=fs.readFileSync(\'@@dataset_path@@\',\'utf8\');fs.writeFileSync(\'@@normalized@@\',q.trim())"',
    timeoutSec: 120,
    inputs: [],
    parameters: [
      { id: 'param-limit', name: 'LIMIT', type: 'number', defaultValue: '100', description: '最多处理多少行' }
    ],
    outputs: [
      { id: 'out-normalized', name: 'normalized', type: 'file', file: 'normalized.json' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

- 阶段 id 自定义且必须唯一；命令、端口（输入/参数/输出）、类型与超时都定义在这里。
- 命令是**单条字符串**，没有 `args`；参数、重定向、引号都写在这一个字段里。
- 端口要写 `type`（`string|number|boolean|json|file|directory`）；输入还有 `required`（默认 `true`）。
- 命令里的 `@@名称@@` 只能引用本阶段声明的输入/输出/参数或内置变量；`{{KEY}}` 才是模板全局参数，不要混用。
- 需要自带脚本/配置时，先 `POST /stage-assets` 上传（见 2.2），再把返回的 `assetKind/assetName/assetFileCount/assetSize` 合并进阶段对象；命令的 cwd 会是提交内容的根目录（相对路径的 `python script.py`、`node app.js` 直接可用）。
- 编辑阶段后，所有引用它的模板立即生效（模板只保存引用与绑定）。

### 修改阶段

- 先读取状态，按 `id` 替换 stage。
- 保留 `id`、`createdAt`，更新 `updatedAt`。
- 新增输入 → 所有引用它的模板都需要为该输入补绑定，否则模板保存时会报“输入必须绑定来源”。
- 重命名或删除 `outputs[].name` / `parameters[].name` 会让指向它的绑定失效；宿主保存模板时会把这些 `source` 清空（输出绑定变为未绑定、参数回退默认值），需要重新选择。
- 已有任务保存的是快照，不受阶段修改影响。

### 删除阶段

从 `state.stages` 移除，并显式清理引用它的模板条目（宿主也会丢弃指向不存在阶段的条目，但显式清理更清楚）：

```js
await saveState((state) => {
  state.stages = state.stages.filter((stage) => stage.id !== 'stage-clean');
  state.templates = state.templates.map((template) => ({
    ...template,
    stages: template.stages.filter((entry) => entry.stageId !== 'stage-clean')
  }));
});
```

已创建任务的 `stageConfigs` 是快照，不会消失。

### 创建模板

```js
await saveState((state) => {
  const clean = state.stages.find((stage) => stage.id === 'stage-clean');
  const score = state.stages.find((stage) => stage.id === 'stage-score');
  if (!clean || !score) throw new Error('阶段不存在：先创建 state.stages 里的阶段');

  state.templates.push({
    id: 'template-uuid',
    name: 'My Pipeline',
    description: '',
    parameters: [
      { id: 'p-weight', key: 'WEIGHT', type: 'number', defaultValue: '1', description: '权重' }
    ],
    stages: [
      {
        id: 'ts-1',
        stageId: clean.id,
        inputs: [],
        parameters: []
      },
      {
        id: 'ts-2',
        stageId: score.id,
        // 为 score 声明的每个 input 给出来源
        inputs: [
          {
            id: 'b-1',
            name: 'payload',
            source: { kind: 'output', stageId: 'ts-1', name: 'normalized' }
          }
        ],
        // 为 score 声明的每个 parameter 给出 source（null = 用阶段默认值）
        parameters: [
          {
            id: 'b-2',
            name: 'THRESHOLD',
            source: { kind: 'global', name: 'WEIGHT' }
          }
        ]
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

- `stages[].stageId` 必须指向 `state.stages` 中已存在的阶段；不存在的引用会在保存时被丢弃。
- `stages[].id` 是该阶段在本模板中的实例 id，绑定的 `source.stageId` 指向它。
- `inputs` 的行顺序/数量以阶段声明为准：少给就是“未绑定”，保存校验会提示。
- 模板不能内联命令；要改命令或输出，请改阶段实体并在模板里同步绑定名。

### 修改模板

- 先读取状态，按 `id` 替换 template。
- 保留 `id` 和 `createdAt`，更新 `updatedAt`。
- 可改的是：阶段引用与顺序、每个阶段引用的 `inputs` / `parameters` 绑定、全局参数、名称与说明。
- 任务保存的是阶段快照；修改模板不会自动更新已有任务。
- 修改阶段顺序后，指向“后面阶段”的绑定会被清空，需要重新选择。

### 删除模板

从 `state.templates` 移除。已有任务仍保留自己的阶段快照，但编辑任务时会找不到模板；建议先处理引用该模板的任务。

---

## 8. 任务 CRUD

### 从模板创建任务

```js
const template = state.templates.find((item) => item.id === 'template-uuid');
const stageById = new Map(state.stages.map((stage) => [stage.id, stage]));

const group = {
  id: crypto.randomUUID(),
  name: 'Control',
  role: 'control',
  templateId: template.id,
  parameters: template.parameters.map((parameter) => ({
    key: parameter.key,
    value: parameter.defaultValue
  })),
  stageConfigs: template.stages
    .map((entry) => {
      const stage = stageById.get(entry.stageId);
      if (!stage) throw new Error(`阶段不存在：${entry.stageId}`);
      return {
        stageId: entry.id,
        name: stage.name,
        command: stage.command,
        inputs: (stage.inputs || []).map((declaration) => ({
          id: declaration.id,
          name: declaration.name,
          source: (entry.inputs || []).find((binding) => binding.name === declaration.name)?.source || null
        })),
        parameters: (stage.parameters || []).map((declaration) => ({
          id: declaration.id,
          name: declaration.name,
          defaultValue: declaration.defaultValue,
          source: (entry.parameters || []).find((binding) => binding.name === declaration.name)?.source || null
        })),
        outputs: stage.outputs.map((output) => ({ ...output }))
      };
    })
};

await saveState((state) => {
  state.tasks.push({
    id: crypto.randomUUID(),
    name: 'My Experiment',
    description: '',
    cwd: '',
    groups: [group],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
});
```

数据集由 `template.datasetId` 决定，任务不再单独设置；任务里各分组引用的模板可以不同，因此一个实验可以同时跑多个数据集。

Treatment 组使用 `role: "treatment"`，可以复制同一模板并覆盖 `parameters`。

### 修改任务

- 先读取状态，按 `id` 替换 task。
- 保留 `id`、`createdAt`，更新 `updatedAt`。
- 修改阶段命令时，同时更新 `stageConfigs`。
- 重新选择模板/修改模板后，需要重新生成该组的 `stageConfigs`；Web UI 的分组里有「从模板重新生成」按钮，会按当前模板与阶段库重建快照并尽量保留已填参数值。
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
  groups/<group>/
    dataset.jsonl / dataset.csv   # 该组模板的数据集副本
    stages/<stage>/
      work/                     # 阶段提交的文件（有 asset 时）；命令的 cwd
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
- `TECHHUB_STAGE_VALUES`
- `TECHHUB_OUTPUT_DIR`
- `TECHHUB_WORK_DIR`

阶段输出与取值：

- 命令把文件写入 `TECHHUB_OUTPUT_DIR`（声明为 `directory` 的输出可以是目录）。
- 只有阶段 `outputs` 里登记过的文件，才能被下游通过 `source.kind = "output"` 引用。
- 下游阶段启动前，`input/` 只生成 `input.json` 描述文件，不复制上游文件。
- **数据集按分组提供**：每个分组用它引用的模板声明的 `datasetId`，在启动该组前导出到 `runs/<run>/groups/<组>/dataset.jsonl|csv`，并通过 `TECHHUB_DATASET_PATH` 暴露；没有数据集时该变量为空串。模板没有声明数据集时回退到旧任务的 `task.datasetId`。
- 阶段声明的输入/参数/输出在命令里用 `@@名称@@` 引用，运行时替换：输入取绑定值、参数取绑定值或 `defaultValue`、输出取 `TECHHUB_OUTPUT_DIR` 下的绝对路径。
- 内置变量（`@@run_id@@`、`@@run_dir@@`、`@@task_id@@`、`@@task_name@@`、`@@group_*@@`、`@@stage_*@@`、`@@input_dir@@`、`@@output_dir@@`、`@@workspace@@`、`@@work_dir@@`、`@@dataset_path@@`、`@@dataset_format@@`）不需要声明即可使用；没有数据集时 `dataset_path` / `dataset_format` 为空串。
- **命令的执行目录**：阶段提交了文件/文件夹时，先把它复制到 `runs/<run>/groups/<组>/stages/<阶段>/work/`，命令以该目录为 cwd（`TECHHUB_WORK_DIR` / `@@work_dir@@`）；没有提交时沿用任务的工作目录（`task.cwd`）。
- `stage.timeoutSec > 0` 时，阶段超过该秒数会被宿主终止（进程树），`run` 记录里 `timedOut: true`、`stderr` 带超时说明。
- `TECHHUB_STAGE_VALUES` 是本阶段解析后的 `{名称: 值}` JSON（内置变量 + 输入 + 参数 + 输出路径）；`TECHHUB_INPUT_REFS` / `TECHHUB_INPUT_PATHS` 只包含输出类来源的路径。
- 旧版 `inputRefs[].key` 仍然可以写成 `{{key}}`（兼容旧任务快照）；`TECHHUB_INPUT_DIRS` 已废弃，固定为空数组。
- 全局参数使用 `{{KEY}}`，同样在运行时替换（有绑定时绑定优先）。
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
3. 创建或更新 stage：命令、默认参数、输入声明、对外输出；需要自带脚本时上传 asset。
4. 创建或更新 template：**先选定 `datasetId`**（模板要评估的数据集），再按顺序引用 stage，为每个输入/参数配置来源（上游输出/上游参数/全局参数），并声明模板全局参数。
5. 创建 task：把模板引用解析成 `stageConfigs` 快照（复制命令、参数默认值、输入/参数绑定、输出）；数据集由模板带过来，任务不再单独设置。
6. `PUT /state`；检查响应中对象数量。
7. `POST /runs` 启动任务。
8. 轮询 `GET /runs/:id` 直到结束。
9. 读取 stdout/stderr、output 文件或导出 ZIP；数据集副本在 `groups/<组>/dataset.jsonl`。
10. 如需清理，删除运行或任务；不要清空整个 workspace。

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

如果这个文件不存在，插件使用内置的 `skills/tech-hub/SKILL.md`。覆盖文件不会被插件升级覆盖。

对应 API：

```text
GET /techhub/api/guide
PUT /techhub/api/guide
Content-Type: application/json

{ "markdown": "# ..." }
```

## 14. 常见错误

- **任务保存后消失**：没有且只有一个 `control` 组，或 group/stage 缺少合法 ID。
- **模板保存后少了阶段**：`stages[].stageId` 指向的阶段在 `state.stages` 里不存在（或那次请求把 `stages` 一起提交成了空数组）。
- **模板报“输入必须绑定来源”**：阶段声明了输入，但模板里对应 `inputs[]` 行缺失或 `source` 为空；给每个输入选一个来源（上游输出/参数或全局参数）。
- **绑定的来源失效**：来源指向了后面的阶段、不存在的输出/参数名，或未声明的全局 key；这类 `source` 会被清空（输入未绑定、参数回退默认值）。
- **下游读不到文件**：上游阶段没有在 `outputs` 中暴露该文件，或 `source.name` 与输出的 `name` 不一致（`source.stageId` 是模板实例 id，不是阶段库 id）。
- **占位符没有替换**：`@@名称@@` 里的名字没有在阶段输入/输出/参数里声明（宿主不会替换，UI 保存时会直接拒绝），或该名字既没有绑定也不是全局参数。
- **阶段保存被拒：“命令引用了未声明的名字”**：命令里的 `@@x@@` 必须是本阶段声明的输入、输出或参数之一，或内置变量；先声明再引用。
- **阶段保存被拒：`@@` 未闭合 / 空占位符 / 跨行**：`@@名称@@` 必须成对、非空、单行书写。
- **端口名被拒**：输入/输出/参数不能重名，也不能用内置变量名（`run_id`、`output_dir` 等）。
- **模板报“来源类型不匹配”**：目标端口是 `file`/`directory`/`number` 等强类型时，来源类型必须一致；把端口类型改成 `string` 可以接受任意来源，或改选同类型来源。
- **运行报“数据集不存在”**：模板的 `datasetId` 指向的数据集已被删除（或旧任务的 `task.datasetId` 失效）；在模板里重新选择数据集，或恢复该数据集。
- **运行报“提交的文件不存在”**：阶段声明了 `assetKind`，但 `stages/<名称>__<id>/files/` 被删除或从未保存；重新上传并保存阶段即可。
- **阶段一直不结束**：给阶段设置 `timeoutSec`（秒，0 = 不限制），超时后宿主会终止进程树并把阶段标记失败（`timedOut: true`）。
- **改了阶段但模板没变**：模板只存引用与绑定，阶段编辑（含默认值）会立即影响模板；如果任务里没变，是因为任务用的是 `stageConfigs` 快照，可以「从模板重新生成」或重新创建任务。
- **运行失败但看不到日志**：检查 run 的 `groups[].stages[].stderr`，以及 `groups/<group>/stages/<stage>.stderr.log`。
- **`PUT /state` 后其他数据消失**：请求只带了部分数组。必须提交完整的 `datasets`、`stages`、`templates`、`tasks`。
- **运行中的 run 无法删除**：先 `POST /runs/:id/stop`。
