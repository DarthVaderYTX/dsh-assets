---
name: human-intelligence
description: Operate the HumanIntelligence annotation workbench: datasets, annotation tasks, annotation tools, task configuration, annotation results, media, export, and the supported data formats.
whenToUse: Use when creating, inspecting, editing, deleting, configuring, annotating, or exporting HumanIntelligence datasets, annotation tasks, or annotation tools, or when explaining the plugin data formats and task options.
---

# HumanIntelligence annotation workbench

HumanIntelligence is a DSH plugin for human data annotation. It supports text, image, and video data. The plugin entry is in the DSH left sidebar.

The workbench has three tabs:

- Tasks: annotation tasks.
- Datasets: reusable annotated data sources.
- Annotation Tools: preset and custom tools.

The annotation editor is a task-scoped workspace. It reads the task's dataset, saves annotations per task and item, and never mutates the dataset structure.

## Mental model

- Dataset: a modality-bound collection of items. One dataset can be referenced by several annotation tasks.
- Annotation tool: a named preset or custom tool. A tool identifies a modality and a task type and carries default task options.
- Annotation task: a task instance that binds a tool, a dataset, a name, instructions, and its own taskOptions. Annotations are stored per task, keyed by item id.
- Annotation: a task/item pair with a value, a status, and a revision.
- Preset tools are generated from the plugin task modules. They cannot be deleted.
- Custom tools are stored by the Host. They can be created and deleted, but there is no update-tool API; delete and recreate to change one.

Deleting a task does not delete its dataset. Deleting a dataset is rejected while any task references it. Deleting a dataset item also deletes that item's annotations in every task using the dataset.

## UI operations

### Tasks tab

- Search tasks and filter by modality (All, Text, Image, Video).
- Open a task to annotate.
- Export a task as JSON.
- Delete a task.
- Create a task from a tool in the Annotation Tools tab.

### Datasets tab

- Search and filter datasets by modality.
- Create a dataset: name, description, modality.
- Open a dataset to inspect its items.
- Add text items through the text importer, or image/video items through the file importer.
- Delete individual items.
- Delete a dataset only when no task uses it.
- Dataset name and description can be edited; modality cannot be changed.

### Annotation Tools tab

- Preset tools show their task type, default options, and task count.
- Create a custom tool: name, modality, task type, and task options.
- Delete a custom tool. Preset tools have no delete action.

### Annotation workspace

- The data list supports substring search, All/Completed/Incomplete filtering, and Default/Todo First/Done First/Name sorting.
- The divider between the data list and the annotation card can be dragged to resize the list; the width is remembered.
- Previous, Next, Skip, and Complete & Next are in the footer.
- Annotations auto-save as drafts. Editing an item that was completed reopens it as a draft.
- Complete is disabled while the current value fails task validation (for example, a ranking still has unassigned pages).
- Progress is based on done plus skipped items and updates while editing.
- Data list status markers: todo, draft, done, skipped.

## Task types, annotation values, and job options

Task ids are scoped by modality. Preset tool ids use the form preset:<task-id>.

### text-classification

- Task id: text-classification
- Options: labels (tags), default 正面, 负面, 中性
- Annotation value: { "label": "正面" }
- Complete requires a non-empty label.

### text-entity

- Task id: text-entity
- Options: entityTypes (tags), default 人名, 地名, 组织, 时间
- Annotation value:
~~~json
{
  "spans": [
    { "id": "span-1", "start": 0, "end": 2, "label": "人名", "text": "张三" }
  ]
}
~~~
- start and end are JavaScript string indices in the item text. Complete requires at least one span.

### text-rating

- Task id: text-rating
- Options: scale (select), choices 3, 5, 10; default 5
- Annotation value: { "score": 4, "note": "optional note" }
- Complete requires score >= 1.

### text-ranking (Web Page Ranking)

- Task id: text-ranking
- Options: queryFields and listFields, both required multiselect fields (see below).
- Annotation value:
~~~json
{
  "buckets": {
    "candidates": [],
    "perfect": ["c1"],
    "excellent": ["c2", "c3"],
    "good": [],
    "fair": [],
    "bad": ["c4"]
  }
}
~~~
- Candidate ids must match ids in the item's candidates. Complete requires every candidate to appear in exactly one group; candidates must be empty.
- Old order arrays are migrated by the editor; new saves use buckets.

### image-classification

- Task id: image-classification
- Options: labels (tags), default 目标, 背景
- Annotation value: { "label": "目标" }

### image-bbox

- Task id: image-bbox
- Options: labels (tags), default 目标
- Annotation value:
~~~json
{
  "boxes": [
    { "id": "box-1", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "label": "目标" }
  ]
}
~~~
- x, y, w, and h are normalized to 0..1 relative to the image. Complete requires at least one box.

### video-classification

- Task id: video-classification
- Options: labels (tags), default 高光, 普通, 无效
- Annotation value: { "label": "高光" }

### video-segment

- Task id: video-segment
- Options: labels (tags), default 片段
- Annotation value:
~~~json
{
  "segments": [
    { "id": "seg-1", "start": 0, "end": 4.5, "label": "片段" }
  ]
}
~~~
- start and end are seconds. Complete requires at least one segment.

## Dataset data formats

Create a dataset with a name, optional description, and modality:

~~~json
{ "name": "Web ranking set", "description": "optional", "modality": "text" }
~~~

Modalities are text, image, and video. Dataset items are added in batches:

~~~json
{ "items": [ /* items */ ] }
~~~

Every item may have a name. Text items also need non-empty text:

~~~json
{ "name": "first row", "text": "the text to annotate" }
~~~

Image and video items need an uploaded media reference. Upload the file first with POST /media?name=<filename> and the file content type, then add the returned media object:

~~~json
{
  "name": "photo.png",
  "media": { "file": "uuid.png", "name": "photo.png", "mime": "image/png", "size": 12345 }
}
~~~

Media items are validated against the uploaded file on disk. Only image and video MIME types are accepted.

### Web ranking item format

The item's text is a JSON string. The preferred shape is:

~~~json
{
  "query": "best running shoes",
  "requestTime": "2025-06-01 09:15:00",
  "market": "United States",
  "location": "New York",
  "language": "en-US",
  "device": "Mobile",
  "searchEngine": "Google",
  "queryIntent": "Commercial",
  "candidates": [
    { "id": "c1", "title": "Best running shoes", "url": "https://example.com/a", "body": "..." }
  ]
}
~~~

Aliases accepted by the parser include name for query, request_time, lang/locale, deviceType/device_type, search_engine/engine, query_intent/intent, and region for location.

The text importer also accepts blank-line groups with lines formatted as title | URL | body. The tool parses JSON first.

## Task options and configuration

Every task type declares options with defaults. Creating an annotation task renders those options with a control per kind:

- tags: comma-separated text input.
- select: dropdown list.
- text: text input.
- number: number input.
- multiselect: dropdown with checkboxes; supports required non-empty validation.

Option fields may declare default, choices, required, labelKey, and hintKey. Task options are saved per task under taskOptions. Existing tasks that omit an option fall back to the task definition's default.

### Web ranking options

queryFields chooses the fields shown in the Query Information card. Available fields (8):

- query
- requestTime
- market
- location
- language
- device
- searchEngine
- queryIntent

Default: query, requestTime, market, location. At least one is required.

listFields chooses the fields shown for each row in the data list. Available fields are the 8 query fields plus candidateCount. Default: query, candidateCount. The first selected field is the row title; remaining fields are the row subtitle. At least one is required.

Example taskOptions for a task that shows every query field and a compact data list:

~~~json
{
  "queryFields": ["query", "requestTime", "market", "location", "language", "device", "searchEngine", "queryIntent"],
  "listFields": ["query", "language", "device", "candidateCount"]
}
~~~

## Task creation

Create a task with:

~~~json
{
  "name": "Ranking task",
  "description": "optional instructions",
  "modality": "text",
  "task": "text-ranking",
  "toolId": "preset:text-ranking",
  "datasetId": "dataset-uuid",
  "taskOptions": { "queryFields": ["query"], "listFields": ["query"] }
}
~~~

- datasetId is optional. If omitted, the Host creates an empty dataset named after the task.
- A supplied dataset must have the same modality as the task.
- toolId is optional but should identify the tool used to create the task.
- The Host validates modality and task id; it does not validate task option semantics.
- Task update accepts only name, description, and taskOptions. It cannot change modality, task type, toolId, or datasetId. Delete and recreate to change those.

## Annotation operations

Save value and status:

~~~json
{ "value": { "label": "正面" }, "status": "done", "expectedRevision": 2 }
~~~

- value is any JSON object or array.
- status on save: draft, done, or skipped. An unknown status is rejected.
- expectedRevision, when supplied, must equal the current revision; otherwise the API returns 409. Use this for optimistic concurrency.
- The response includes the new annotation and task stats.
- Saving increments revision.

Update only status:

~~~json
{ "status": "skipped" }
~~~

- status can be pending, draft, done, or skipped.
- pending deletes the annotation record for that item.
- skipped is counted with done in progress.
- Unknown statuses are rejected.

Annotation completion is validated by the task type. The annotation app disables Complete while validation fails. Completion does not depend on a status alone; a done value should satisfy the task validator.

## HTTP API

All routes are under /human-intelligence/api on the DSH Web origin. The browser uses the same relative prefix. Direct HTTP automation must use the authenticated DSH Web session; the UI is the safe default for manual operation.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /state | Datasets, task summaries, custom tools, stats |
| GET | /datasets | List datasets |
| POST | /datasets | Create dataset |
| GET | /datasets/:id | Dataset with items |
| PATCH | /datasets/:id | Update name or description |
| DELETE | /datasets/:id | Delete dataset; 409 when used by tasks |
| POST | /datasets/:id/items | Add items |
| DELETE | /datasets/:id/items/:itemId | Delete item and all its task annotations |
| GET | /tasks | Same data as /state |
| POST | /tasks | Create task |
| GET | /tasks/:id | Task, dataset, annotations |
| PATCH | /tasks/:id | Update name, description, or taskOptions |
| DELETE | /tasks/:id | Delete task; dataset is retained |
| GET | /tasks/:id/dataset | Task dataset and annotations |
| GET | /tasks/:id/export | Export task, dataset, stats, annotations |
| PUT or POST | /tasks/:id/dataset/items/:itemId/annotation | Save annotation value/status |
| PATCH or PUT | /tasks/:id/dataset/items/:itemId/status | Update status only |
| GET | /tools | List custom tools |
| POST | /tools | Create custom tool |
| DELETE | /tools/:id | Delete custom tool |
| POST | /media?name=... | Upload image or video |
| GET | /media/:file | Read media; supports Range |

The task dataset item add/delete routes are intentionally not exposed under /tasks; use the dataset routes so dataset ownership stays explicit.

### Browser API

The client facade is AnnotationApi:

- AnnotationApi.state()
- AnnotationApi.datasets.list/get/create/update/remove/addItems/removeItem
- AnnotationApi.tasks.create/get/exportUrl
- AnnotationApi.annotations.save/setStatus
- AnnotationApi.tools.list/create/remove
- AnnotationApi.media.upload/url
- AnnotationApi.forTask(taskId): get, getDataset, saveAnnotation, setStatus, exportUrl. The task-scoped facade does not mutate datasets.

## Supported operations summary

Datasets:

- Create.
- List and read.
- Edit name and description.
- Add items.
- Delete item.
- Delete dataset when unused.
- No item edit; delete and re-add.

Tasks:

- Create with tool, dataset, options, and instructions.
- List and read.
- Edit name, description, and taskOptions.
- Delete.
- Export.
- No dataset/tool/type change after creation.

Annotations:

- Save value and status.
- Change status only.
- Clear to pending.
- Optimistic concurrency with expectedRevision.
- Export with the task.

Tools:

- List preset and custom tools.
- Create custom tools.
- Delete custom tools.
- Preset tools cannot be deleted.
- No tool update; delete and recreate.

Media:

- Upload image/video.
- Read media with Range.
- Media is deleted with its item, dataset, or task as applicable.

## Recommended workflows

### Create a ranking task from a dataset

1. Create a text dataset.
2. Add ranking items whose text is the JSON string described above.
3. Create a task with modality text, task text-ranking, the dataset id, and taskOptions for queryFields/listFields.
4. Open the task, assign every candidate to a quality group, and click Complete & Next.
5. Export the task.

### Edit configuration

1. Update a task's name, description, or taskOptions with PATCH /tasks/:id.
2. Dataset name and description use PATCH /datasets/:id.
3. Task option changes affect only future editor behavior; existing annotations remain stored.
4. To change a task's dataset or task type, delete the task and create a new one.

### Delete

1. Delete tasks that reference a dataset first.
2. Then delete the dataset.
3. Custom tools can be deleted independently; preset tools cannot.

## Important constraints

- Do not edit the Host store.json or media directory directly while the Host is running. Use the API or UI; the Host caches state and can overwrite external edits.
- Data is stored under the profile directory in human-intelligence/store.json, with uploaded media in human-intelligence/media.
- A dataset is shared by tasks. Annotations are independent per task.
- Preset tool ids are preset:<task-id>; custom tools have UUID ids.
- The Host accepts only known modality/task ids and image/video uploads.
- Annotation values are capped in size by the Host.
- A 409 from dataset deletion means tasks still reference it; a 409 from annotation save means expectedRevision is stale.
- The annotation editor does not add or remove dataset items. Use the Datasets tab or dataset API.
