# TechHub

A DSH plugin for managing evaluation work in four connected pages:

- **Tasks** — real evaluation runs with exactly one Control group and any number of Treatment groups. Every group picks a template and owns an editable command/argument snapshot for each stage; the group also inherits that template's dataset. Click a task card to see group status and stage progress; each group's stages are collapsed by default and expand on demand. Every stage has a log viewer showing live stdout/stderr, exit code, duration and command, with copy and export actions. Each run can be exported as a ZIP containing `run.json`, all stage logs and the per-group dataset snapshots.
- **Templates** — reusable ordered stage lists. A template only **references** stages from the stage library: pick a stage, order it, and bind each declared input/parameter to a source. Template cards show only a summary; click one to preview its ordered stage detail. Stages can be reordered by dragging the handle (or with the arrow buttons); while dragging, a semi-transparent card follows the pointer with the same grab-point offset as the handle.
- **Stages** — the reusable stage library. A stage is one command plus typed inputs, typed parameters with defaults, exposed outputs, an optional timeout and an optional **submitted file or folder** — the local counterpart of an Aether module. Stages are created, edited and deleted here; templates cannot define commands of their own, so a change to a stage immediately applies to every template that references it. Cards show the command, the declared ports and how many templates use the stage; deleting a stage also removes it from those templates (task snapshots are kept).
- **Datasets** — JSONL/CSV datasets created by importing a local file or editing the text directly, with parse preview and edit/delete support. The format is detected automatically from the file extension or the content, so there is no format picker.

## Agent guide

The agent-facing operations manual is the standard skill [skills/tech-hub/SKILL.md](skills/tech-hub/SKILL.md). It is also registered with the DSH skill registry as the runtime skill **`tech-hub`** whenever the plugin starts; disabling or uninstalling the plugin removes the skill. It documents the full CRUD model, validation rules, API endpoints, run lifecycle, result layout and safety rules for managing datasets, templates and tasks without replacing unrelated data.

The plugin's **Docs** page renders this Markdown automatically in read-only mode; choose **Edit documentation** to modify it, then save. Saves are stored as a profile-local override at:

```text
<DSH_PROFILE_DIR>/techhub/AGENT_GUIDE.md
```

The bundled `skills/tech-hub/SKILL.md` is used when the override does not exist.

The host serves the guide at:

```text
GET /techhub/api/guide
PUT /techhub/api/guide
```

## Color themes

The palette button in the TechHub header opens the theme picker. It offers:

- **Default** — follows the current DSH theme
- **Ocean blue**
- **Emerald**
- **Amber**
- **Violet**
- **Rose**

The selected theme is persisted in the profile's `techhub/config.json` and applied to the plugin's accents, top bar tint, active tab indicator and card hover borders. The equivalent endpoint is `PUT /techhub/api/theme` with `{ "theme": "blue" }`.

## Language

The header language selector switches the plugin UI between:

- **Auto** — follow the DSH locale
- **中文**
- **English**

The choice is persisted in `techhub/config.json`; it does not affect the contents of the documentation. The equivalent endpoint is `PUT /techhub/api/language` with `{ "language": "en" }`.

## Stage library

The **Stages** page owns every executable step. A stage is the local counterpart of an Aether module: typed ports, one command template, an optional timeout.

A stage exposes three kinds of port:

- **inputs** — named values the stage consumes (usually a file produced upstream), each with a value type and a `required` flag,
- **parameters** — named values with a type and a default the stage consumes, so a template can override the default from outside,
- **outputs** — files or directories the stage produces, each mapped from a path under its `output/` directory to a name downstream stages can reference.

Port types are `string`, `number`, `boolean`, `json`, `file` and `directory` (parameters cannot be `file`/`directory`; outputs must be `file` or `directory`). `string` is the universal sink: any source can feed a string port, but a `file` port only accepts a `file` source, and so on.

The command is one string — executable, arguments, redirections and quotes — and is passed to the shell as-is. Inside it, `@@name@@` references a declared input, output or parameter (`{{KEY}}` is still the template global-parameter syntax):

```text
node -e "..." "@@payload@@" > "@@score@@"
```

`@@name@@` may only reference names declared in the stage's own three tables, or one of the built-in variables that every stage gets for free: `run_id`, `run_dir`, `task_id`, `task_name`, `group_id`, `group_name`, `group_role`, `stage_id`, `stage_name`, `stage_dir`, `input_dir`, `output_dir`, `workspace`, `dataset_path`, `dataset_format`. The stage editor rejects a command with an unknown name, an unclosed `@@`, an empty `@@@@` or a placeholder spanning lines. At run time an input resolves to the template binding, a parameter to its binding or `defaultValue`, and an output to the absolute path of that file under the stage's `output/` directory.

`timeoutSec` (0 = no limit) bounds one stage: when it elapses the host terminates the stage's process tree and marks the stage failed with `timedOut: true`.

### Submitting files with a stage

A stage can carry its own file or folder, like an Aether module asset (scripts, config, a small sample):

- Upload first, then save the stage: `POST /techhub/api/stage-assets` with `{ stageId, kind: "file" | "directory", name, files: [{ path, data: <base64> }] }`. Paths must stay relative (no `..`, no drive letters); a stage may submit at most 1000 files / 64 MB, and `kind: "file"` accepts exactly one file.
- The response (`assetKind`, `assetName`, `assetFileCount`, `assetSize`) is stored on the stage. After saving, the content is materialized into `stages/<name>__<id>/files/`.
- At run time the submission is copied into `runs/<run-id>/groups/<group>/stages/<stage>/work/` and **the command runs with that directory as its cwd** — the root holds every submitted file (folder submissions drop the picked folder level). `@@work_dir@@` / `TECHHUB_WORK_DIR` point at it, so `python script.py` or `node app.js` just work for a single-file submission.
- A stage without a submission keeps running in the task's working directory (`task.cwd`), exactly as before.
- Clearing the submission (`assetKind: ""`) removes `files/` on the next save.

Templates never store commands. A template holds an ordered list of references — `{ id, stageId, inputs, parameters }` — where `id` is the reference's id inside that template, `stageId` points at a library stage, and the two binding arrays say **where each declared input and parameter gets its value**:

```json
{ "kind": "output",    "stageId": "<earlier reference id>", "name": "normalized" }
{ "kind": "parameter", "stageId": "<earlier reference id>", "name": "THRESHOLD" }
{ "kind": "global",    "name": "WEIGHT" }
```

Those are the only allowed sources: an **earlier stage's output**, an **earlier stage's parameter**, or a **template global parameter**. The source type must be compatible with the target port (globals are strings). A required input must be bound; an optional input may stay unbound, and its placeholder then survives as-is. A parameter binding may be `null`, meaning “use the stage default”. Because the wiring lives in the template, the same stage can sit at different positions in different templates with different sources.

Consequences worth knowing:

- Editing a stage (command, ports, defaults, outputs, timeout) updates every template that references it immediately.
- Adding a required input to a stage makes existing templates incomplete: they must bind it before they can be saved again. Adding an optional input does not.
- Renaming or removing an output/parameter invalidates bindings that pointed at it; the host clears those `source` values when the template is next saved (inputs become unbound, parameters fall back to their default).
- A stage can appear at most once per template, and only earlier references may be used as sources.
- Deleting a stage removes it from the templates that used it; task stage snapshots are unaffected.
- Deleting a template or stage never rewrites existing tasks — they keep the snapshot captured when they were created. The task editor's **Re-apply template** button rebuilds one group's snapshot from the current template (keeping already filled parameter values).

The stage library persists in the workspace manifest next to datasets, templates and tasks, so it travels with workspace export/import. Older workspaces are migrated on load: stages kept inline inside templates are lifted into the library with their original ids, legacy `inputRefs` become declared inputs plus `output` bindings, `command`/`args` are merged into one command, and `{{input}}` references are rewritten to `@@input@@` — so task snapshots and wiring keep resolving.

## Template parameters

A template can declare global parameters. Each parameter has a key (letters, digits and underscores, not starting with a digit), a **type** (`string`, `number`, `boolean` or `json`; default `string`), a default value and an optional description. The default must fit the type — a `number` parameter has to hold a number, a `boolean` one of `true`/`false`/`1`/`0`, a `json` a parseable value.

Global parameters are one of the three allowed binding sources, and their placeholders also work directly in stage commands:

```text
{{MODEL}}
{{RUN_TAG}}
```

When a task uses the template, each group gets its own values initialized from the template defaults. The values are snapshotted into the task and into each run; before a stage starts, every `{{KEY}}` is replaced with that group’s configured value. Task cards show these parameter values per group (with a type badge when it is not `string`).

The declared type also participates in binding validation: a `number` global can feed a `number` or `string` port, while a `string` global cannot feed a `file`, `directory` or `number` port.

## Template dataset

A template owns the dataset it evaluates: pick one in the template editor (`datasetId`), or leave it empty. Tasks no longer choose a dataset — each group inherits its template's dataset, and since groups may reference different templates, one task can compare approaches on different datasets at the same time.

At run time each group materializes its dataset into `runs/<run-id>/groups/<group>/dataset.jsonl|csv` and exposes it as `TECHHUB_DATASET_PATH`; stages read it through that variable or `@@dataset_path@@`. Templates without a dataset fall back to the legacy `task.datasetId`; if neither is set, `TECHHUB_DATASET_PATH` is empty.

Deleting a dataset that a template still uses asks for confirmation and clears that template's dataset reference; running such a template fails with “dataset not found” until a new dataset is picked.

## Script folders

Stage scripts live under the workspace, grouped by owner:

```text
<workspace>/scripts/
├── README.md
├── template-miao-suffix/          # scripts used only by one template
│   ├── miao_dataset.py
│   └── README.md
└── template-miew-bash-pipeline/   # scripts used only by one template
    ├── 01_lowercase.sh
    ├── 02_append_miew.sh
    ├── 03_append_miew2.sh
    └── README.md
```

Because a stage belongs to the shared library, prefer one folder per stage (`<workspace>/scripts/<stage-id>/`) — that makes a shared stage's scripts obvious and lets every template reference the same path. Stage commands reference them as `%TECHHUB_WORKSPACE%/scripts/<folder>/<script>` (`$TECHHUB_WORKSPACE` on non-Windows shells), so the paths keep working after the workspace moves or is exported and re-imported. Because tasks snapshot their stages, moving or renaming a script means updating both the stage's `command` and the `stageConfigs` of existing tasks.

## Run model

A run starts all of its groups together; stages within each group run serially. Multiple runs of the same task, and runs of different tasks, execute independently and never block one another. Each stage runs through the host shell in the task's working directory (or the DSH default directory); a stage that submitted files runs inside its own copy of them instead (see **Submitting files with a stage**). stdout/stderr, exit code, timing and status are kept with the run, and an active run can be stopped. A stage with `timeoutSec > 0` is terminated when it exceeds that limit; the run record marks the stage `timedOut` and the run fails with a timeout message.

At run time each group materializes its template's dataset to:

```
<workspace>/runs/<run-id>/groups/<group>/dataset.jsonl
```

and exposes it as `TECHHUB_DATASET_PATH`. Each stage also gets its own output directory, exposed as `TECHHUB_OUTPUT_DIR`:

```
<workspace>/runs/<run-id>/groups/<group>/stages/<stage>/output/
```

Stage commands can also read `TECHHUB_RUN_ID`, `TECHHUB_RESULTS_DIR`, `TECHHUB_WORKSPACE`, `TECHHUB_INPUT_DIR`, `TECHHUB_INPUT_MANIFEST`, `TECHHUB_INPUT_REFS`, `TECHHUB_INPUT_PATHS`, `TECHHUB_STAGE_VALUES`, `TECHHUB_WORK_DIR`, `TECHHUB_TASK_ID`, `TECHHUB_TASK_NAME`, `TECHHUB_GROUP_ID`, `TECHHUB_GROUP_NAME`, `TECHHUB_GROUP_ROLE`, `TECHHUB_STAGE_ID`, `TECHHUB_STAGE_NAME`, and `TECHHUB_DATASET_FORMAT`.

Each **stage** (in the library) declares inputs, parameters and exposed output files. A **template** adds the wiring: for a stage reference it binds every declared input and parameter to an earlier stage's output, an earlier stage's parameter, or a template global parameter. Before a stage starts, its `input/` folder receives only `input.json`, and upstream files are referenced in place.

A binding's `stageId` is the reference id inside that template, not the library stage id — the same library stage can therefore sit at different positions in different templates with different wiring.

Reference a declared input, parameter or output in the command as `@@name@@`. At run time it is replaced with the bound value; for an output source that is the actual absolute file path (using forward slashes on Windows). For example, a stage that declares the input `payload`:

```text
@@payload@@
```

```js
const data = JSON.parse(
  fs.readFileSync('@@payload@@', 'utf8')
);
```

Names are local to their stage: inputs, parameters and outputs share the `@@` namespace and must be unique within the stage. Template global parameters keep their own `{{KEY}}` syntax.

Example descriptor (`input.json`; legacy `inputRefs` entries still appear with `key`/`stageId`/`outputName`):

```json
{
  "stage": { "id": "ts-2", "name": "计算得分" },
  "inputs": [
    {
      "name": "payload",
      "kind": "output",
      "source": { "kind": "output", "stageId": "ts-1", "name": "normalized" },
      "value": "<workspace>/.../01-清洗查询/output/normalized.json"
    }
  ],
  "refs": {},
  "values": {
    "payload": "<workspace>/.../01-清洗查询/output/normalized.json",
    "score": "<workspace>/.../02-计算得分/output/score.json"
  }
}
```

`TECHHUB_STAGE_VALUES` holds the same `{name: value}` map (inputs, parameters and declared output paths). `TECHHUB_INPUT_REFS` / `TECHHUB_INPUT_PATHS` only contain the file paths that came from output sources; `TECHHUB_INPUT_DIRS` is deprecated and always empty.

## Results workspace

The gear button in the TechHub header opens **Results workspace**. The configured path is where every future run writes its results, under `runs/<run-id>/`:

- `run.json` — full run record, status, commands and stage logs
- `groups/<group>/` — one folder per group
- `groups/<group>/dataset.jsonl` / `dataset.csv` — the dataset its template uses
- `groups/<group>/stages/<stage>/stdout.log` / `.stderr.log` — per-stage logs
- `groups/<group>/stages/<stage>/work/` — the stage's submitted files (when it has an asset); the command runs here
- `groups/<group>/stages/<stage>/input/input.json` — descriptor referencing configured upstream stage outputs
- `groups/<group>/stages/<stage>/output/` — per-stage output files, browsable and downloadable from the stage's **Output** view

The path is persisted in the profile's `techhub/config.json`. The catalogue is mirrored into the workspace at:

```text
<workspace>/techhub-workspace.json
```

That manifest contains the datasets, stages, templates and tasks. Scripts, code and other assets referenced by stages and templates should live inside the workspace too, so they travel with it.

### Library folders

Every dataset, stage and template also gets its own folder in the workspace, each with its own description file:

```text
<workspace>/
  datasets/<name>__<id>/
    dataset.json
    data.jsonl / data.csv
  stages/<name>__<id>/
    stage.json          # format, version, id, command, timeoutSec, inputs, parameters, outputs, asset info
    files/              # submitted file / folder content, when the stage has one
  templates/<name>__<id>/
    template.json       # format, version, id, dataset, parameters, stage references and bindings
```

- The folders are the **materialized copy of the catalogue**: `techhub-workspace.json` stays authoritative, and the plugin rewrites the folders on load and on every save, deleting the folder of an item that no longer exists. Folders without one of these description files are left untouched.
- Folder names use `<sanitized name>__<sanitized id>`; renaming a stage or template moves its folder, the id stays the same.
- Because the catalogue wins, edit stages/templates through the UI or `/techhub/api` — hand-editing `stage.json`/`template.json` is overwritten on the next save. Use workspace export/import to move the whole project.
- Delete a stage or template and its folder goes away with it; no orphan directories are left behind.
- Keep scripts in `scripts/` rather than inside these folders: the folder name changes on rename, and the content is regenerated.
- Dataset, stage and template cards (and their preview dialogs) have an **Open folder** action that reveals the directory in the file manager.

The task detail's **Export results** action downloads one run directory as a ZIP, and each stage log can be downloaded separately from its log viewer.

**Open folder** buttons are available for the whole run, each group and each stage, using the operating system's file manager.

### Workspace import / export

The workspace settings dialog has **Export workspace** and **Import workspace**:

- Export downloads a ZIP of the workspace manifest, the per-item folders and the other workspace files.
- **Include tasks and run results** is off by default. When enabled, tasks and the `runs/` directory are included.
- Import replaces the current workspace project. Datasets, stages and templates are replaced; tasks and runs are replaced when the bundle includes them, otherwise they are cleared.
- The equivalent endpoints are `GET /techhub/api/workspace/export?includeTasks=0|1` and `POST /techhub/api/workspace/import` with a ZIP body.

**Reset workspace** clears all tasks and run records and deletes the plugin's `run-*` result directories under the current workspace. Stages, templates and datasets are kept.

## Example pipelines

Two runnable templates are included:

- **示例：Query 清洗与评分** — `清洗查询 → 提取特征 → 计算得分`, with `WEIGHT` and `BONUS` global parameters. Each downstream stage consumes the previous stage's `output/`.
- **示例：Token 统计与报告** — `分词 → 统计摘要 → 生成报告`, writing `tokens.json`, `summary.json` and `report.md`.

Both templates declare their dataset, and tasks inherit it; they read the first row of that dataset as their starting point, and fall back to a sample query when the template has no dataset.

## Storage

The catalogue is persisted by the host half at:

```
<workspace>/techhub-workspace.json
```

Each dataset, stage and template is also materialized as its own folder with a description file (see **Library folders**); the folders follow the catalogue on every load and save.

The profile still keeps a cache at `<DSH_PROFILE_DIR>/techhub/store.json`; on startup the workspace manifest takes precedence when it exists.

The host API is mounted at `/techhub/api` on the local DSH Web server.
