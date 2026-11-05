# dsh-assets

DeepSeek Harness（dsh）自建资产的**唯一存放地**：插件与 skill 在这里编写、维护和版本化，用于跨机器同步、分享和回滚。

**本仓库即为自建资产的唯一存放地**：skill 与插件都在这里编写、维护、提交，不再与工作区的 `internal-dsh-assets/` 互相复制。约定见下方「存放约定」。

## 目录结构

```
dsh-assets/
  install.sh                  # 安装脚本：把 skill / 插件装到本机 dsh
  skills/<skill-name>/        # 一个 skill 一个目录，name 以 SKILL.md 的 frontmatter 为准
  plugins/<plugin-name>/      # 一个插件一个目录，目录名 = package.json 的 name
```

插件是 dsh 的 **bundle**：`package.json` 里声明 `dsh.bundle.patch`，`cordis.patch.yml` 用包名插入自己。已安装的 dsh 只能加载**纯 JS**（loader 是裸 `import()`），所以插件不要以 `.ts` 源码分发：

```
plugins/<plugin-name>/
  package.json         # dsh.bundle.patch + engines.dsh
  cordis.patch.yml     # - insert: [{ id, name: '<包名>', config: {} }]
  index.js             # export function apply(ctx, config)
  client.js            # 可选：Web UI 界面，package.json 里加 dsh.client + "./client" 导出
  locale/en.json       # meta.title / meta.description（可选）
  README.md
```

安装见下节「安装与卸载」，底层命令是 `dsh plugin --profile <p> add ./plugins/<plugin-name>`（本地目录装成 link）。

**写插件必须以本地源码的 `master` 分支为准。** 具体约束：

- 唯一 API 依据是本机的 `deepseek-harness` 检出（默认 `~/Projects/Repositories/Github/deepseek-harness`）的 **`master`** 分支，不是记忆里的旧版本，也不是 `demo` 等分支。
- 动手前先对齐：`git -C <repo> fetch origin && git checkout master && git pull --ff-only`，确认工作区干净。
- 事件名、服务方法签名、`Hook` 结构、bundle / patch 约定，一律按该分支源码核对；源码里已经变成 private 的接口就不要再用。
- 记录核对基线：最近一次是 `0.2.2-alpha.2`（`ce7073d5`）。基线前进后，受影响的插件要重新核对一遍。

`skills/<skill-name>/SKILL.md` 必须有 frontmatter。**skill 的身份只取 frontmatter 的 `name`，目录名不参与校验**（但建议保持一致，便于人读）；`name` 必须是 kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）：

```markdown
---
name: <skill-name>
description: 一句话说明能力与适用场景，写清"什么时候该用"。单段，≤480 字符。
---
```

可选字段：`whenToUse`（驼峰，只给 UI 菜单）、`disable-model-invocation`、`user-invocable`、`metadata`。这几个键只认原文写法：写成旧版的 `disableModelInvocation`、`modelInvocable`、`userInvocable` 会**直接报错并丢弃整个 skill**。

skill 附带的脚本、模板、参考资料放在同一目录下按用途分（`scripts/`、`templates/`、`types/`、`references/`），并在 `SKILL.md` 里写明调用方式。

## 安装与卸载

`install.sh` 把仓库里的资产装进本机 dsh，也能干净地删掉。macOS / Linux + bash 即可，不依赖 jq、node；装插件时会调用 dsh 自带的 pnpm。

```bash
./install.sh list                              # 仓库里有什么、本机装没装
./install.sh skill how-to-write-document       # 装 skill
./install.sh plugin dsh-perf-profiler          # 装插件（默认 profile: web）
./install.sh all                               # 全装
./install.sh uninstall all                     # 全删（只动本仓库装的东西）
./install.sh uninstall skill --all --dry-run   # 先看看会删什么
./install.sh doctor                            # 检查 dsh 路径、DSH_HOME、profile 状态
```

| 命令 | 行为 |
| --- | --- |
| `list` | 列出 skill / 插件及安装状态（已链接 / 存在同名目录 / 链接指向别处 / 悬空链接 / 未安装），并标出仓库里已删除但本机仍有残留的项 |
| `skill <name...>` | 软链到 `$DSH_HOME/skills/<name>`，已存在则幂等跳过 |
| `plugin <name...>` | 调 `dsh plugin --profile <p> add <仓库内绝对路径>`，并回读 profile 核对是否进了 `dsh.profile.bundles`；`--profile desktop` 会被提前拦下 |
| `all` | 上面两个全跑一遍 |
| `uninstall skill <name...>` | 只删本仓库创建的链接；实体目录仅在与仓库内容完全一致时删除 |
| `uninstall skill --all` | 清理全部托管项：指向本仓库的链接（含仓库已改名的悬空链接）+ 内容一致的副本 |
| `uninstall plugin <name...>` | 走 `dsh plugin --profile <p> remove`，之后回读 manifest 确认确实移除；`--profile desktop` 会被提前拦下 |
| `uninstall plugin --all` | 卸载 profile 里所有来自本仓库的插件 |
| `uninstall all` | 上面两项都做 |
| `doctor` | 打印仓库路径、DSH_HOME、dsh 版本、profile 与 skills 目录状态 |

| 选项 | 说明 |
| --- | --- |
| `--profile <name>` | 插件目标 profile，默认 `web` |
| `--copy` | skill 用复制而非软链（仓库可能被移动或删除时用）；卸载时按内容比对删除 |
| `--force` | 目标已存在时接管：链接直接替换，实体目录备份为 `<name>.bak.<时间戳>` |
| `--all` | 配合 `uninstall` 使用：处理全部已安装项 |
| `--dry-run` | 只打印将执行的动作，不做任何改动；删除前建议先跑一次 |
| `--dsh <path>` | 指定 dsh 可执行文件（默认从 PATH → `/Applications/DeepSeek Harness.app/...` 找） |
| `--dsh-home <path>` | 指定 `DSH_HOME`，默认 `~/.dsh` |

两个容易踩的点，脚本已经替你处理：

- **不读 `$DSH_PROFILE`。** dsh 会把该变量注入子进程（本机实测值是保留的 `desktop`），照抄会往保留 profile 里装东西，所以默认固定 `web`，要改就用 `--profile`。
- **skill 只扫一层。** dsh 找的是 `$DSH_HOME/skills/<name>/SKILL.md`，所以软链必须指向目录本身；装完不用重启，新会话即可用（插件需要重启 dsh）。

### desktop profile

`desktop` 这个 profile 归 DeepSeek Harness 应用独占：`dsh plugin --profile desktop ...` 会被 CLI 直接拒绝（`error: profile "desktop" is managed exclusively by the Electron application`）。所以：

- `./install.sh list --profile desktop`、`doctor --profile desktop` 可用，只读，用来核对装没装、装的是不是本仓库那份。
- `./install.sh plugin ... --profile desktop`、`uninstall plugin ... --profile desktop` 会**在调用 CLI 之前**直接报错并给出替代路径，不会把 CLI 的原始报错抛出来。
- 真要改桌面端插件，两条路：应用内「插件」页从本地目录安装（指向 `plugins/<name>`）；或手工改 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，再用应用自带 pnpm 在 profile 目录跑 `install`。

删除侧的安全边界：不碰用户自己的目录——只有"指向本仓库的链接"和"与仓库内容逐字节一致的副本"会被删；被改过的副本、指向别处的链接、你自己的同名目录，一律只提示不动手。`list` 会把"仓库里已经删掉但本机还装着"的残留标出来。

## 当前内容

| 资产 | 类型 | 路径 | 说明 |
| --- | --- | --- | --- |
| `how-to-write-document` | skill | [skills/how-to-write-document](skills/how-to-write-document) | 六类文档写作规范与模板：paper / prd / one-pager / experiment-report / research-report / technical-design |
| `dsh-perf-profiler` | plugin | [plugins/dsh-perf-profiler](plugins/dsh-perf-profiler) | 把 hook 监听器与工具执行体的耗时可归因到插件/hook 点/工具/单次调用；支持实时报告与离线 JSONL 分析 |
| `work-clock` | plugin | [plugins/work-clock](plugins/work-clock) | 浮窗工作时钟：打卡工时（下班 = 打卡 + 9 小时）、天气、今日飞书日程，临近日程 10/5/1 分钟与午餐/晚餐/会议开始时提醒 |
| `dsh-autoeval` | plugin | [plugins/dsh-autoeval](plugins/dsh-autoeval) | 左侧栏 AutoEval 面板：四阶段评测流水线（Scraping 抓取 → Annotation 标注 → Metrics 指标 → Reporting 报告），每阶段有内置执行模板也能换成自定义命令；两个页签分别是「评测任务」（按模板提交、筛选、重跑、删除，点进去看指标、可折叠的分阶段进度、逐条结果与报告）与「任务模板」（模板即 `templates/<id>.yaml`，可手改文件也可用表单或 YAML 页签改，内置只读、自定义可建可改可删）；内置 WebSearchTool 检索覆盖模板，报告与逐条结果落盘 |
| `dsh-pet` | plugin | [plugins/dsh-pet](plugins/dsh-pet) | 悬浮像素宠物：十二个品种（狸花猫 / 白猫 / 黑猫 / 金渐层 / 老虎 / 狮子 / 金毛 / 萨摩耶 / 哈士奇 / 鹦鹉 / 绵羊 / 山羊），48×54 全代码绘制，正面与侧面三档转身、呼吸、眨眼、抖耳、摇尾、打盹、发疯都按品种性格逐帧重画；可拖到窗口任意位置，点一下会跳、冒爱心、说专属台词 |

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
| **改任何插件的代码**（改文件名、改包名、加删文件、换 profile） | 同批复查三处：该插件 README、本 README、`install.sh`。重点核对命令与参数、profile 归属、目录/包名约定、`package.json` 的 `files` 清单、卸载与残留清理逻辑 |
| 新增 / 改动安装或维护脚本 | 本 README 的「安装与卸载」小节 |
| 源码基线（基线版本/提交）变化 | 本 README 的基线记录，以及受影响插件的兼容性核对 |
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
