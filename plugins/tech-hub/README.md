# TechHub

A DSH plugin for managing evaluation work in three connected pages:

- **Tasks** — real evaluation runs with exactly one Control group and any number of Treatment groups. Every group picks a template and owns an editable command/argument snapshot for each stage. Click a task card to see group status and stage progress; each group's stages are collapsed by default and expand on demand. Every stage has a log viewer showing live stdout/stderr, exit code, duration and command, with copy and export actions. Each run can be exported as a ZIP containing `run.json`, all stage logs and the dataset snapshot.
- **Templates** — reusable serial stage lists. Template cards show only a summary; click one to preview its ordered stage detail. Stages can be reordered by dragging the handle (or with the arrow buttons); while dragging, a semi-transparent card follows the pointer with the same grab-point offset as the handle. Every stage stores its own default arguments as well as the command it will run.
- **Datasets** — JSONL/CSV datasets created by importing a local file or editing the text directly, with parse preview and edit/delete support. The format is detected automatically from the file extension or the content, so there is no format picker.

## Agent guide

The agent-facing operations manual is the standard skill [skills/techhub/SKILL.md](skills/techhub/SKILL.md). It is also registered with the DSH skill registry as the runtime skill **`techhub`** whenever the plugin starts; disabling or uninstalling the plugin removes the skill. It documents the full CRUD model, validation rules, API endpoints, run lifecycle, result layout and safety rules for managing datasets, templates and tasks without replacing unrelated data.

The plugin's **Docs** page renders this Markdown automatically in read-only mode; choose **Edit documentation** to modify it, then save. Saves are stored as a profile-local override at:

```text
<DSH_PROFILE_DIR>/techhub/AGENT_GUIDE.md
```

The bundled `skills/techhub/SKILL.md` is used when the override does not exist.

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

## Template parameters

A template can declare global parameters. Each parameter has a key (letters, digits and underscores, not starting with a digit), a default value and an optional description. Use it in any stage command or argument as:

```text
{{MODEL}}
{{RUN_TAG}}
```

When a task uses the template, each group gets its own values initialized from the template defaults. The values are snapshotted into the task and into each run; before a stage starts, every `{{KEY}}` is replaced with that group’s configured value. Task cards show these parameter values per group.

## Template script folders

Each template keeps its scripts in its own folder under the workspace, named after the template id — one folder per template:

```text
<workspace>/scripts/
├── README.md
├── template-miao-suffix/          # template-miao-suffix
│   ├── miao_dataset.py
│   └── README.md
└── template-miew-bash-pipeline/   # template-miew-bash-pipeline
    ├── 01_lowercase.sh
    ├── 02_append_miew.sh
    ├── 03_append_miew2.sh
    └── README.md
```

Stage commands reference them as `%TECHHUB_WORKSPACE%/scripts/<template id>/<script>` (`$TECHHUB_WORKSPACE` on non-Windows shells), so the paths keep working after the workspace moves or is exported and re-imported. Because a task snapshots its template, moving or renaming a script means updating both the template's `stages[].args` and the `stageConfigs` of existing tasks.

## Run model

A run starts all of its groups together; stages within each group run serially. Multiple runs of the same task, and runs of different tasks, execute independently and never block one another. Each stage runs through the host shell in the task's working directory (or the DSH default directory). stdout/stderr, exit code, timing and status are kept with the run, and an active run can be stopped.

At run time the selected dataset is materialized to:

```
<workspace>/runs/<run-id>/dataset.jsonl
```

and exposed as `TECHHUB_DATASET_PATH`. Each stage also gets its own output directory, exposed as `TECHHUB_OUTPUT_DIR`:

```
<workspace>/runs/<run-id>/groups/<group>/stages/<stage>/output/
```

Stage commands can also read `TECHHUB_RUN_ID`, `TECHHUB_RESULTS_DIR`, `TECHHUB_WORKSPACE`, `TECHHUB_INPUT_DIR`, `TECHHUB_INPUT_MANIFEST`, `TECHHUB_INPUT_REFS`, `TECHHUB_INPUT_PATHS`, `TECHHUB_INPUT_DIRS`, `TECHHUB_TASK_ID`, `TECHHUB_TASK_NAME`, `TECHHUB_GROUP_ID`, `TECHHUB_GROUP_NAME`, `TECHHUB_GROUP_ROLE`, `TECHHUB_STAGE_ID`, `TECHHUB_STAGE_NAME`, and `TECHHUB_DATASET_FORMAT`.

Each stage can expose selected output files under external names. Only these exposed outputs can be referenced by downstream stages. A downstream stage adds an input reference with three parts: a local key, an upstream stage, and one of that stage's exposed outputs. Before the stage starts, its `input/` folder receives only `input.json`, and upstream files are referenced in place.

Use the local key in commands and arguments as `{{key}}`. At run time it is replaced with the actual absolute file path (using forward slashes on Windows). For example, if the reference key is `normalized`:

```text
{{normalized}}
```

```js
const data = JSON.parse(
  fs.readFileSync('{{normalized}}', 'utf8')
);
```

Reference keys are local to their stage: they must be unique within the stage and cannot collide with global parameter keys.

Example descriptor:

```json
{
  "stage": { "id": "score", "name": "计算得分" },
  "inputs": [
    {
      "key": "features",
      "stageId": "features",
      "stageName": "提取特征",
      "outputName": "features",
      "file": "features.json",
      "path": "<workspace>/.../02-提取特征/output/features.json"
    }
  ],
  "refs": {
    "features": "<workspace>/.../02-提取特征/output/features.json"
  }
}
```

`TECHHUB_INPUT_REFS` contains the same name-to-path mapping, and `TECHHUB_INPUT_PATHS` contains only the selected file paths. (`TECHHUB_INPUT_DIRS` remains for legacy whole-stage inputs.)

## Results workspace

The gear button in the TechHub header opens **Results workspace**. The configured path is where every future run writes its results, under `runs/<run-id>/`:

- `run.json` — full run record, status, commands and stage logs
- `dataset.jsonl` / `dataset.csv` — materialized dataset snapshot
- `groups/<group>/` — one folder per group
- `groups/<group>/stages/<stage>/stdout.log` / `.stderr.log` — per-stage logs
- `groups/<group>/stages/<stage>/input/input.json` — descriptor referencing configured upstream stage outputs
- `groups/<group>/stages/<stage>/output/` — per-stage output files, browsable and downloadable from the stage's **Output** view

The path is persisted in the profile's `techhub/config.json`. The catalogue is mirrored into the workspace at:

```text
<workspace>/techhub-workspace.json
```

That manifest contains the datasets, templates and tasks. Scripts, code and other assets referenced by templates should live inside the workspace too, so they travel with it.

Datasets are also materialized for inspection:

```text
<workspace>/datasets/<name>__<id>/
  dataset.json
  data.jsonl / data.csv
```

Dataset cards and the dataset preview have an **Open dataset folder** action that opens this directory in the file manager.

The task detail's **Export results** action downloads one run directory as a ZIP, and each stage log can be downloaded separately from its log viewer.

**Open folder** buttons are available for the whole run, each group and each stage, using the operating system's file manager.

### Workspace import / export

The workspace settings dialog has **Export workspace** and **Import workspace**:

- Export downloads a ZIP of the workspace manifest, datasets, templates and workspace files.
- **Include tasks and run results** is off by default. When enabled, tasks and the `runs/` directory are included.
- Import replaces the current workspace project. Datasets and templates are replaced; tasks and runs are replaced when the bundle includes them, otherwise they are cleared.
- The equivalent endpoints are `GET /techhub/api/workspace/export?includeTasks=0|1` and `POST /techhub/api/workspace/import` with a ZIP body.

**Reset workspace** clears all tasks and run records and deletes the plugin's `run-*` result directories under the current workspace. Templates and datasets are kept.

## Example pipelines

Two runnable templates are included:

- **示例：Query 清洗与评分** — `清洗查询 → 提取特征 → 计算得分`, with `WEIGHT` and `BONUS` global parameters. Each downstream stage consumes the previous stage's `output/`.
- **示例：Token 统计与报告** — `分词 → 统计摘要 → 生成报告`, writing `tokens.json`, `summary.json` and `report.md`.

Both read the first row of the selected dataset as their starting point, and fall back to a sample query when no dataset is selected.

## Storage

The catalogue is persisted by the host half at:

```
<workspace>/techhub-workspace.json
```

The profile still keeps a cache at `<DSH_PROFILE_DIR>/techhub/store.json`; on startup the workspace manifest takes precedence when it exists.

The host API is mounted at `/techhub/api` on the local DSH Web server.
