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
| `prompt-optimizer` | skill | [skills/prompt-optimizer](skills/prompt-optimizer) | 带 rubric 的 JSONL 数据集上的 YAML messages prompt 自动优化：inspect 校验数据与模型配置 → 基线评测 → 失败分析与候选生成 → search 集实测择优（可留 holdout 验证）→ 全量重算并出报告；支持多个可单独配置的目标模型（endpoint / key / temperature / weight）按权重汇总，LLM 判分 + 确定性 check、OpenAI 兼容接口或自定义命令、调用预算、缓存与逐模型/逐准则/逐行对比 |
| `dsh-perf-profiler` | plugin | [plugins/dsh-perf-profiler](plugins/dsh-perf-profiler) | 把 hook 监听器与工具执行体的耗时可归因到插件/hook 点/工具/单次调用；支持实时报告与离线 JSONL 分析 |
| `work-clock` | plugin | [plugins/work-clock](plugins/work-clock) | 浮窗工作时钟：打卡工时（下班 = 打卡 + 9 小时）、天气、今日飞书日程，临近日程 10/5/1 分钟与午餐/晚餐/会议开始时提醒 |
| `dsh-autoeval` | plugin | [plugins/dsh-autoeval](plugins/dsh-autoeval) | 左侧栏 AutoEval 面板：四阶段评测流水线（Scraping 抓取 → Annotation 标注 → Metrics 指标 → Reporting 报告），模板只排阶段（四个预置阶段相对顺序固定、可插自定义阶段、拖拽排序），各阶段用哪个执行模块、参数多少在提交任务时为每个组单独决定；提交任务时配 Control + 多个 Treatment 组，每组独立设定各阶段的实现与参数、可折叠查看，报告出组间对比；三个页签分别是「评测任务」（按模板提交——模板用带关键词过滤的下拉选、筛选、重跑、删除，点进去看指标、可折叠的分阶段进度、逐条结果与报告）、「Queryset」（JSONL / CSV / XLSX / 飞书表格 / 飞书智能表格导入，可增删改；依赖本机 lark-cli 读飞书）与「任务模板」（模板即 `templates/<id>.yaml`，点进去默认只读、点「编辑」才改，内置只能复制；提交任务与保存模板都会先二次确认）；插件有独立工作区（`storages/autoeval`：config.yaml + templates/ + querysets/ + runs/），面板顶部显示路径并可复制/打开/改配置；内置 WebSearchTool 检索覆盖模板，报告与逐条结果落盘 |
| `footprint` | plugin | [plugins/footprint](plugins/footprint) | 左侧栏 FootPrint 面板：CesiumJS 3D 地球（本地随插件分发，无需 CDN / ion token），输入城市、地标或地址即飞抵定位；默认按用户当地时间用 SunLight 呈现昼夜，区域级叠加 NASA 夜间灯光、城市近景改用高清 Esri 夜面，顶栏显示本地时间；放大时自动淡入 Esri World Imagery 卫星细节层并由 Cesium 按屏幕误差选择瓦片层级，画布按设备像素比渲染，缩回全球视角则回到 Natural Earth II；鼠标移动、拖拽和缩放时实时显示光标下经纬度与 Nominatim 反向地理编码的详细地区名；点击推荐景点时在球面高亮区域并浮出可加入行程/打开原页的交互卡片；宿主经 Nominatim / Photon 检索并通过 Wikipedia 摘要与 geosearch 返回地点介绍；推荐 Provider 按类别/服务商组织：景点来自马蜂窝，餐饮来自马蜂窝 + OpenStreetMap，住宿来自 OpenStreetMap，Provider 注册表预留携程、小红书或官方 API；可创建多个本地持久化行程，把景点/餐饮/住宿逐项加入并按类别管理；内置 16 个目的地的离线导览与双语界面，支持 Windows 系统代理 |
| `dsh-pet` | plugin | [plugins/dsh-pet](plugins/dsh-pet) | 悬浮像素宠物：十二个品种（狸花猫 / 白猫 / 黑猫 / 金渐层 / 老虎 / 狮子 / 金毛 / 萨摩耶 / 哈士奇 / 鹦鹉 / 绵羊 / 山羊），48×54 全代码绘制，正面与侧面三档转身、呼吸、眨眼、抖耳、摇尾、打盹、发疯都按品种性格逐帧重画；可拖到窗口任意位置，点一下会跳、冒爱心、说专属台词 |
| `human-intelligence` | plugin | [plugins/human-intelligence](plugins/human-intelligence) | 左侧栏多模态人工标注工作台：文本/图片/视频标注任务与数据集分离管理，预设/自定义标注工具，网页排序，任务级多选配置，数据列表搜索/过滤/排序；自带标准 SKILL.md，插件加载时注册、卸载时注销 |
| `tech-hub` | plugin | [plugins/tech-hub](plugins/tech-hub) | 评测任务工作台：数据集、任务模板、任务三页管理；模板支持全局参数、串行阶段、对外输出映射与阶段输入引用；任务按 Control/Treatment 分组并发执行，阶段产出 input 描述文件与 output，可查看日志/输出、打开目录、导出 ZIP；workspace 级项目导入导出（任务与 runs 可选）；内置主题、语言、可编辑文档和随插件自动注册的 `tech-hub` skill |
| `aether` | plugin | [plugins/aether](plugins/aether) | 左侧栏 Aether 面板：有向无环图任务执行管理器。页签为「运行 / 实验 / 模块」，页面铺满可用空间，顶栏可切换插件语言（自动 / 中文 / English，仅影响插件）；实验编辑器的右侧栏可按模块 / 子图 / 数据集筛选与搜索，支持拖拽到画布任意位置或单击添加；画布与右侧栏之间、右侧栏上下两部分之间均可拖拽调整宽高占比并本地记忆；画布支持平移缩放、端口拖拽连线（会形成环的连线即时取消并提示）、Shift+右键框选、整理/复位，DAG 可在「上下（默认）/ 左右」两种布局间切换，端口按模块预定义数量与名称渲染（输入端口可标记必填，必填未连线时校验失败；数据集只有输出端点，并在实验/运行画布上以蓝紫色节点标识，运行画布不显示其状态），节点卡片显示合并后的参数键值，点击模块/子图可在详情顶部查看参数，子图可在独立编辑标签页打开、编辑并保存回原实验，但不能单独运行（可嵌套），节点坐标随实验保存；模块分命令、子图（引用另一个实验内联执行）与数据集（执行时向下游输出 URI）三类，并带执行环境声明；模块库新建时先选类型，命令模块需提交文件或目录（命令、端口、参数可选），可按名称 / 端口 / URI 搜索并直接编辑或删除，每个模块带版本（默认保存新版本，可勾选覆盖，历史最多 20 条），运行节点记录所用 moduleVersion；运行实验后按依赖并发执行（并发 1–8），执行以 Executor 为边界（当前本机，预留服务器按执行环境选择执行位置），节点 placement、状态、stdout/stderr、上游输入与运行目录落盘，支持取消/复制/重跑/删除，复制会打开新实验草稿并在保存时创建新实验，运行记录可按名称 / 实验 / 模块 / 状态 / id 搜索；运行详情用实例 DAG 画布呈现，节点按状态着色（完成绿 #22C55E / 执行中黄 #FACC15 / 失败红 #EF4444 / 未开始灰 #9CA3AF，背景与状态标签使用 40% 半透明，带实色状态条），可平移缩放、拖拽节点、点开节点日志（点击或右键已完成模块/子图的输出端点可查看或下载输出文件/目录，数据集视为已成功执行），整体配色柔和；数据保存在可配置工作区（默认 `$DSH_HOME/storages/aether`，顶栏可切换并迁移，支持 JSON 导入/导出且运行记录可选），样式全部使用主题令牌，内置图核心、端口/坐标/布局/版本迁移、环境解析与真实 HTTP 集成测试 |

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

- `.DS_Store`、Python 的 `__pycache__/` 与 `*.pyc` 不入库（已在 `.gitignore` 屏蔽），复制或移动文件时不要带入。
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
