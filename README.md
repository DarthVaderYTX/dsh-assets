# dsh-assets

DeepSeek Harness（dsh）自建资产的**唯一存放地**：插件与 skill 在这里编写、维护和版本化，用于跨机器同步、分享和回滚。

**本仓库即为自建资产的唯一存放地**：skill 与插件都在这里编写、维护、提交，不再与工作区的 `internal-dsh-assets/` 互相复制。约定见下方「存放约定」。

## 目录结构

```
dsh-assets/
  skills/<skill-name>/        # 一个 skill 一个目录，name 以 SKILL.md 的 frontmatter 为准
  plugins/<plugin-name>/      # 一个插件一个目录，目录名 = package.json 的 name
```

插件是 dsh 的 **bundle**：`package.json` 里声明 `dsh.bundle.patch`，`cordis.patch.yml` 用包名插入自己。已安装的 dsh 只能加载**纯 JS**（loader 是裸 `import()`），所以插件不要以 `.ts` 源码分发：

```
plugins/<plugin-name>/
  package.json         # dsh.bundle.patch + engines.dsh
  cordis.patch.yml     # - insert: [{ id, name: '<包名>', config: {} }]
  index.js             # export function apply(ctx, config)
  locale/en.json       # meta.title / meta.description（可选）
  README.md
```

安装：`dsh plugin --profile <p> add ./plugins/<plugin-name>`（本地目录是 link）。

`skills/<skill-name>/SKILL.md` 必须有 frontmatter。**skill 的身份只取 frontmatter 的 `name`，目录名不参与校验**（但建议保持一致，便于人读）；`name` 必须是 kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）：

```markdown
---
name: <skill-name>
description: 一句话说明能力与适用场景，写清"什么时候该用"。单段，≤480 字符。
---
```

可选字段：`whenToUse`（驼峰，只给 UI 菜单）、`disable-model-invocation`、`user-invocable`、`metadata`。这几个键只认原文写法：写成旧版的 `disableModelInvocation`、`modelInvocable`、`userInvocable` 会**直接报错并丢弃整个 skill**。

skill 附带的脚本、模板、参考资料放在同一目录下按用途分（`scripts/`、`templates/`、`types/`、`references/`），并在 `SKILL.md` 里写明调用方式。

## 当前内容

| 资产 | 类型 | 路径 | 说明 |
| --- | --- | --- | --- |
| `how-to-write-document` | skill | [skills/how-to-write-document](skills/how-to-write-document) | 六类文档写作规范与模板：paper / prd / one-pager / experiment-report / research-report / technical-design |
| `dsh-perf-profiler` | plugin | [plugins/dsh-perf-profiler](plugins/dsh-perf-profiler) | 把 hook 监听器与工具执行体的耗时可归因到插件/hook 点/工具/单次调用；支持实时报告与离线 JSONL 分析 |

## 存放约定

- **本仓库是自建资产的唯一存放地。** 新增或修改 skill、插件一律直接写在这里，不再向 `internal-dsh-assets/` 回写或从那里复制——那个目录不归本仓库维护，改动会失去同步。
- **启用方式**：dsh 的实际加载根是 `~/.dsh/skills/`（本地 provider 的 `user-dsh`，rank 400；项目内则是 `<projectRoot>/.dsh/skills`）。本仓库**不会**被自动扫描，要用某个 skill 需软链过去：

  ```bash
  ln -s "$PWD/skills/<name>" ~/.dsh/skills/<name>
  ```

  插件不比 skill，需要装进 profile 才生效：

  ```bash
  dsh plugin --profile <profile> add ./plugins/<plugin-name>
  ```

- `.DS_Store` 不入库（已在 `.gitignore` 屏蔽），复制或移动文件时不要带入。
- 提交前用 `git status --short` 确认没有意外带入的文件；`git diff --stat HEAD` 用来核对文档是否与内容同批。

## 文档同步（硬要求）

**改了内容就必须改文档，且放在同一个 commit 里。** 不允许"先更新资产、README 回头再补"——回头往往就不补了。

| 改动 | 必须同步更新 |
| --- | --- |
| 新增 / 删除 / 重命名 skill 或插件目录 | 本 README 的「目录结构」与「当前内容」表 |
| skill 增删模板、脚本、`types/` 子目录 | 该 skill 的 `types/INDEX.md` 及对应 `types/<type>/README.md` |
| 改 skill 的适用范围、选型或执行流程 | `SKILL.md` 正文，以及本 README「当前内容」中该资产的说明列 |
| 改插件对外行为、依赖或挂载方式 | 该插件目录下的 README，以及本 README 的说明列 |
| 改仓库约定（存放 / 提交 / 推送） | 本 README 对应小节 |

提交前自查：

```bash
git diff --stat HEAD   # 内容文件出现在 diff 里时，README 也必须一起出现
```

## 提交约定

- 提交信息用 conventional commits，scope 写资产类型：
  - `feat(skills): add <skill-name>`
  - `fix(skills): <what changed in which skill>`
  - `feat(plugins): add <plugin-name>`
- 一个资产的一次完整变更一个 commit，避免把多个不相关资产混在一起。
- `.DS_Store`、本地临时文件不入库。

## 推送

**push 到 `origin` 需经用户明确确认** —— 这是公开仓库的对外写入。默认只在本地提交，等用户点头后再执行：

```bash
git push -u origin main
```
