# HumanIntelligence

`dsh-human-intelligence` 是一个带左侧栏入口的 DSH 数据标注工作台插件，支持 **文本**、**图片**、**视频** 三种数据模态的人工标注。每种模态由独立模块管理，模态下的每种任务类型也由独立模块管理；工作台把模态统一收归到「标注工具」Tab，通过统一的任务契约组合它们。

本插件由 `dsh-assets` 仓库的 `plugins/dsh-human-intelligence` 目录管理，并直接从该目录作为本地 link 装入 DSH profile；后续源码、构建产物与运行时 skill 都以这里为准。

## 功能

- **左侧栏入口**：侧边栏显示 **HumanIntelligence** 图标与名称，点击打开独立工作台面板。
- **任务页签**：单独的「任务」Tab 汇总所有已创建的标注任务，可按模态筛选、继续标注、导出或删除。
- **数据集页签**：独立管理待标注数据——创建数据集、按模态筛选、查看/导入/删除数据项。数据集可被多个任务复用；被任务使用的数据集不能删除。新建任务时可以选择已有数据集，或自动创建一个空数据集。
- **标注工具页签**：所有模态统一收归「标注工具」Tab。预设工具按模态分组、开箱即用且不能删除；用户可以在任意模态/任务类型上创建自定义工具（配置专属标签），并删除自己创建的工具。任务从标注工具创建。
- **预设与自定义工具**
  - 预设工具由插件的任务模块生成，共 8 个，覆盖三种模态。
  - 自定义工具保存在 Host `tools` 中，可删除；删除工具不会影响其已创建的任务与标注数据。
  - 新建任务时从工具选择器挑选工具，工具的名称、模态、任务类型和默认标签会带入任务；同时选择该模态下的数据集。
- **运行时 Skill**：插件通过 Host `skills` 服务注册 `human-intelligence` skill，模型与用户均可调用；skill 说明数据格式、任务配置和全部数据集/任务/工具/标注/导出操作，并随插件卸载自动注销。
- **三种数据模态**
  - 文本：批量粘贴导入；分类/实体/评分任务一行一条，网页排序支持 JSON 或空行分组。
  - 图片：多选上传 PNG / JPG / WebP / GIF / AVIF / BMP。
  - 视频：多选上传 MP4 / WebM / OGG / MOV / MKV，媒体接口支持 HTTP Range，可拖动进度条。
- **按模态分任务**
  - 文本：文本分类、实体标注（拖选片段）、质量评分、网页排序（web page ranking）。
  - 图片：图片分类、目标框选（可拖拽绘制边界框）。
  - 视频：视频分类、片段切分（入点/出点 + 时间轴）。
- **标注工作台**：任务页签、工具目录、项目列表、进度统计、数据列表搜索/过滤/排序、逐条导航、自动保存、完成/跳过、导出 JSON。
- **模态筛选**：任务页签与标注工具页签都提供「全部 / 文本 / 图片 / 视频」筛选，快速定位对应模态的任务或工具。
- **快速搜索**：顶部搜索框按当前页签搜索任务或工具；工具选择器内也提供独立搜索。
- **语言切换（插件内）**：顶部语言选择器只切换插件自己的中英文案，偏好保存在 `human-intelligence:language`，不会修改 DSH 的全局 locale；首次打开时按宿主语言选择默认值。
- **网页排序**：每条数据包含查询信息和候选网页（标题 / URL / 摘要）；标注界面参考多列看板，将网页卡片拖入 Candidates、Perfect、Excellent、Good、Fair、Bad 分组，点击 URL 可打开网页。创建任务时可配置两类多选字段（均至少选择一项）：
  - `Query Information 展示字段`：默认 query、requestTime、market、location；
  - `数据列表展示字段`：默认 query、candidateCount，列表以首字段为标题、其余字段为副标题。导入支持以下 JSON：
  ```json
  {
    "query": "DevOps Best Practices",
    "requestTime": "2023-05-15 14:30:00",
    "market": "Technology",
    "location": "Global",
    "candidates": [
      { "title": "DevOps Best Practices", "url": "https://example.com/devops", "body": "..." }
    ]
  }
  ```
  也可以使用空行分组、每行「标题 | URL | 摘要」的简写格式。
- **持久化**：任务、待标注数据集、标注状态/结果与工具保存在 DSH profile 目录下的 `human-intelligence/store.json`；上传的媒体保存在同目录的 `media/`。

## 模块结构

```
src/client/
  core/
    registry.js          模态/任务注册表与契约校验
    messages.js          基础 UI 字典
    ui.js                共享 React 控件（Button/Modal/Field/Icon…）
    annotation-api.js    浏览器唯一 fetch 入口；tasks/dataset/status/result/tools API
    file-importer.js     图片/视频共用的上传导入器
    styles.js            基础样式（只使用 --dsw-alias-* 主题变量）
  modalities/
    text/
      index.js           文本模态模块（导入器 + 任务装配）
      tasks/
        classification.js
        entity.js
        rating.js
        ranking.js
    image/
      index.js           图片模态模块
      tasks/
        classification.js
        bbox.js
    video/
      index.js           视频模态模块
      tasks/
        classification.js
        segments.js
  tools-home.js           标注工具目录、预设/自定义工具卡片与工具选择器
  datasets-home.js        数据集目录、创建、详情与数据项导入/删除
  workbench-home.js       任务页签与任务列表
  workbench.js           创建工具/任务、标注工作台与导入弹窗
  bootstrap.js           组合注册表并注册左侧栏与主面板
src/host/
  annotation-service.js  Host 领域服务：任务、数据集、标注状态/结果、工具的唯一读写入口
  skill.js               随插件注册/注销的 human-intelligence 运行时 skill 内容
build.mjs                将模块按依赖顺序打包成 client.js
index.js                 Host HTTP 适配器：路由、媒体上传与 Range 读取
```

`client.js` 由 `build.mjs` 生成（Harness 的浏览器模块加载器要求单个 factory），不要直接编辑生成的产物；修改 `src/client/**` 后运行：

```powershell
node build.mjs
```

## 任务模块契约

任务模块是一个工厂函数 `({ h, React, ui }) => task`，必须返回：

| 字段 | 说明 |
| --- | --- |
| `id` | 全局唯一任务 id，建议 `<modality>-<task>` |
| `modality` | 所属模态 id，必须与所在模态模块一致 |
| `titleKey` / `descriptionKey` | 界面文案的 i18n key |
| `messages` | `{ zh, en }` 该任务自己的字典 |
| `options` | 每个工具自己的配置字段与默认值，创建任务时渲染：`tags`、`select`、`text`、`number`、`multiselect`；字段可带 `default`、`choices`、`required` |
| `itemView(item, index, options, t)`（可选） | 数据列表中的展示字段；返回 `{ title, meta }` |
| `initial(options)` | 空标注值；排序任务会收到第二个参数 `item`，用于按条目生成初始顺序 |
| `validate(value, options)` | 返回错误文案 key，或 `null` |
| `summary(value, options, t)` | 条目列表/编辑器头部的摘要 |
| `Editor` | React 组件，props 为 `{ item, value, options, onChange, t, ui }` |
| `styles`（可选） | 该任务自己的 CSS 字符串 |
| `parsePaste(raw, t)`（可选） | 覆盖文本模态的粘贴导入解析；返回 `{name, text}` 数组或抛出带 `messageKey` 的错误 |
| `importHintKey` / `importPlaceholderKey` / `importCountKey`（可选） | 覆盖导入弹窗的说明、占位符和条数文案 |
| `defaultInstructionKey`（可选） | 新建该任务时预填到任务说明里的文案 key |

新增任务：

1. 在对应 `modalities/<modality>/tasks/` 下新建文件，按上面的契约实现工厂函数。
2. 在 `modalities/<modality>/index.js` 中把工厂加入 `taskFactories`。
3. 在 `src/client/bootstrap.js` 的 `modalityFactories[].tasks` 中登记该工厂。
4. 在 `build.mjs` 的 `MODULES` 列表中、模态 index 之前加入新文件。
5. 在 `index.js` 的 `MODALITY_TASKS` 中加入任务 id（Host 只校验 id，不理解任务语义）。
6. 运行 `node build.mjs`。

新增模态：

1. 新建 `modalities/<modality>/index.js`，实现 `{ id, titleKey, descriptionKey, icon, messages, tasks, ItemImporter }`。
2. 在 `bootstrap.js` 的 `modalityFactories` 中登记。
3. 在 `build.mjs` 的 `MODULES` 中加入该模态的任务与 index 文件。
4. 在 Host `index.js` 的 `MODALITY_TASKS` 中登记模态与任务 id；如涉及文件上传，扩展 `IMAGE_TYPES` / `VIDEO_TYPES`。
5. 运行 `node build.mjs`。

模态模块只负责数据形态（文本粘贴、文件上传、预览）与任务组合；工作台不包含任何模态或任务分支。

## 代码架构与 API

分层约束：

- `src/host/annotation-service.js` 是唯一的领域服务：任务、待标注数据集、标注状态、标注结果、自定义工具都只能通过它的方法读写；`store.json` 只在这个模块内被访问。
- `index.js` 只是 HTTP 适配器：解析请求、调用服务、上传/流式读取媒体，不直接修改数据。
- `src/client/core/annotation-api.js` 是浏览器唯一的 `fetch` 入口，暴露 `tasks` / `dataset` / `annotations` / `tools` / `media` 命名空间，以及任务级 `forTask(taskId)` 门面。
- 标注 app（`workbench.js` 的 Annotator）只通过 `AnnotationApi.forTask(taskId)` 提供的操作读取数据集、保存标注和更新状态；任务编辑器是纯 UI，不直接访问网络或存储。
- 新增 UI 代码时不得在其他模块调用 `fetch`，只能扩展 `annotation-api.js` 并在服务层补上对应方法。

### Host 服务方法

`createAnnotationService({ dataDirectory, mediaDirectory })` 返回：

| 方法 | 说明 |
| --- | --- |
| `getState()` | 数据集摘要、任务摘要、自定义工具、统计 |
| `listDatasets()` / `getDataset(datasetId)` | 数据集列表与数据项明细 |
| `createDataset(input)` / `updateDataset(datasetId, patch)` / `deleteDataset(datasetId)` | 数据集生命周期 |
| `addDatasetItems(datasetId, items)` / `deleteDatasetItem(datasetId, itemId)` | 待标注数据维护 |
| `getTask(taskId)` / `getTaskDataset(taskId)` | 任务 + 数据集 + 标注 |
| `createTask(input)` / `updateTask(taskId, patch)` / `deleteTask(taskId)` | 任务生命周期；任务引用 `datasetId` |
| `saveAnnotation(taskId, itemId, { value, status, expectedRevision })` | 保存/更新标注结果与状态 |
| `setStatus(taskId, itemId, status)` | 单独维护标注状态，`pending` 会清除标注 |
| `createTool(input)` / `deleteTool(toolId)` / `listTools()` | 自定义工具管理 |
| `exportTask(taskId)` | 导出任务与标注结果 |

### HTTP API

前缀 `/human-intelligence/api`：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/state` | 数据集摘要、任务摘要、工具与统计 |
| GET / POST | `/datasets` | 列出 / 创建数据集 |
| GET / PATCH / DELETE | `/datasets/:id` | 读取 / 更新 / 删除数据集（被任务使用时返回 409） |
| POST | `/datasets/:id/items` | 批量添加数据项 |
| DELETE | `/datasets/:id/items/:itemId` | 删除数据项及其在所有任务中的标注 |
| POST | `/tasks` | 创建标注任务（携带 `toolId` 与 `datasetId`） |
| GET | `/tasks/:id` | 任务 + 数据集 + 标注 |
| PATCH | `/tasks/:id` | 更新任务名称/说明/配置 |
| DELETE | `/tasks/:id` | 删除任务（数据集保留） |
| GET | `/tasks/:id/dataset` | 读取任务引用的数据集与标注 |
| PUT | `/tasks/:id/dataset/items/:itemId/annotation` | 保存/更新标注结果与状态 |
| PATCH | `/tasks/:id/dataset/items/:itemId/status` | 仅更新标注状态 |
| GET | `/tasks/:id/export` | 导出 JSON |
| GET / POST | `/tools` | 列出 / 创建自定义工具 |
| DELETE | `/tools/:id` | 删除自定义工具（预设不经过该接口） |
| POST | `/media?name=...` | 上传图片/视频 |
| GET | `/media/:file` | 读取媒体（支持 Range） |

### 浏览器 API

```js
AnnotationApi.state()                       // 数据集 + 任务 + 工具
AnnotationApi.datasets.list() / create(input)
AnnotationApi.datasets.get(datasetId) / update(datasetId, patch) / remove(datasetId)
AnnotationApi.datasets.addItems(datasetId, items)
AnnotationApi.datasets.removeItem(datasetId, itemId)
AnnotationApi.tasks.create(input)           // 携带 datasetId
AnnotationApi.tasks.get(taskId)             // { task, dataset }
AnnotationApi.annotations.save(taskId, itemId, { value, status, expectedRevision })
AnnotationApi.annotations.setStatus(taskId, itemId, status)
AnnotationApi.tools.create(input) / remove(toolId)
AnnotationApi.media.upload(file) / url(file)

const app = AnnotationApi.forTask(taskId);  // 只读数据集，不可改数据集
await app.getDataset();
await app.saveAnnotation(itemId, value, 'done');
await app.setStatus(itemId, 'skipped');
app.exportUrl();
```

### 数据与状态

- `$DSH_PROFILE_DIR/human-intelligence/store.json`
- `$DSH_PROFILE_DIR/human-intelligence/media/<uuid>.<ext>`
- 标注状态：`pending`（无记录）/ `draft`（标注中）/ `done` / `skipped`；完成率按 `done + skipped` 计算。
- 每条标注带自增 `revision`；客户端可传 `expectedRevision`，不匹配时服务返回 `409`，避免覆盖其他写入。
- 旧版 `projects` 字段在加载时迁移为 `tasks`，旧版任务内嵌的 `items` 会迁移为独立数据集；旧版 `draft`/无 revision 的标注也会自动规范化。

## 验证与限制

- 本地回归：`node test/smoke.mjs` 会用假的 Cordis 上下文启动 Host 半边，覆盖数据集创建/查看/删除、自定义工具创建/删除、任务创建、数据导入、标注保存、状态更新、revision 冲突、统计、上传、Range 读取、导出、删除与持久化。
- 客户端 API 门面与 Host API 已做端到端校验（tasks / dataset / annotations / status / tools / media）；浏览器代码中只有 `annotation-api.js` 调用 `fetch`。
- Host 只接受白名单内的模态/任务 id、图片/视频 MIME 与包内媒体引用；媒体路径按 UUID 文件名校验，避免路径穿越。
- 单个上传上限 512 MB；JSON 请求上限 32 MB；单条标注值上限 1 MB。
- 视频预览依赖浏览器对上传容器的解码能力（例如 MKV 在部分浏览器中只有声音）；标注数据本身不受影响。
- 插件运行在 DSH Web UI 中，样式只引用 `--dsw-alias-*` 主题变量，随宿主深浅色主题切换。
