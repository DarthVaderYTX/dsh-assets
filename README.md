# dsh-assets

DeepSeek Harness（dsh）自建资产的**分发仓库**：插件与 skill 的 git 版本化副本，用于跨机器同步、分享和回滚。

本机的开发/加载源头仍是工作区的 `../internal-dsh-assets/`（见 `../AGENTS.md`）。本仓库是它的发布镜像，两者的关系见下方「同步约定」。

## 目录结构

```
dsh-assets/
  skills/<skill-name>/        # 一个 skill 一个目录，目录名 = SKILL.md 里的 name
  plugins/<plugin-name>/      # 一个插件一个目录，目录名 = 插件名
```

`skills/<skill-name>/SKILL.md` 必须有 frontmatter，`name` 与目录名一致：

```markdown
---
name: <skill-name>
description: 一句话说明能力与适用场景，写清"什么时候该用"。
---
```

skill 附带的脚本、模板、参考资料放在同一目录下按用途分（`scripts/`、`templates/`、`types/`、`references/`），并在 `SKILL.md` 里写明调用方式。

## 当前内容

| 资产 | 类型 | 路径 | 说明 |
| --- | --- | --- | --- |
| `how-to-write-document` | skill | [skills/how-to-write-document](skills/how-to-write-document) | 六类文档写作规范与模板：paper / prd / one-pager / experiment-report / research-report / technical-design |
| — | plugin | `plugins/` | 暂无 |

## 同步约定

- **源头**：`internal-dsh-assets/`（工作区约定的存放位置）。
- **本仓库**：对外分发副本。向本仓库添加或更新资产时，从源头复制，不反向覆盖源头。
- **启用方式**：dsh 的实际加载根是 `~/.dsh/skills/`（本地 provider 的 `user-dsh`，rank 400；项目内则是 `<projectRoot>/.dsh/skills`）。本仓库**不会**被自动扫描，要用某个 skill 需软链过去：

  ```bash
  ln -s "$PWD/skills/<name>" ~/.dsh/skills/<name>
  ```
- 复制时排除 `.DS_Store`（已在 `.gitignore` 中屏蔽，但仍应避免带入）。
- 复制后校验一致性：

  ```bash
  diff -r --exclude='.DS_Store' \
    ../internal-dsh-assets/skills/<name> skills/<name>
  ```

- 若某项资产只在仓库侧存在（如外部贡献），应先落回 `internal-dsh-assets/` 再同步，保持单一源头。

## 文档同步（硬要求）

**改了内容就必须改文档，且放在同一个 commit 里。** 不允许"先更新资产、README 回头再补"——回头往往就不补了。

| 改动 | 必须同步更新 |
| --- | --- |
| 新增 / 删除 / 重命名 skill 或插件目录 | 本 README 的「目录结构」与「当前内容」表 |
| skill 增删模板、脚本、`types/` 子目录 | 该 skill 的 `types/INDEX.md` 及对应 `types/<type>/README.md` |
| 改 skill 的适用范围、选型或执行流程 | `SKILL.md` 正文，以及本 README「当前内容」中该资产的说明列 |
| 改插件对外行为、依赖或挂载方式 | 该插件目录下的 README，以及本 README 的说明列 |
| 改仓库约定（同步 / 提交 / 推送） | 本 README 对应小节 |

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
