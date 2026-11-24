---
name: render-charts
description: 把文档里的数据做成漂亮、可交互、可核查的图表与表格：折线/面积/柱/堆叠/排名/散点/气泡/环形/饼图/热力/瀑布/双轴/时间轴，以及可排序搜索分页的交互表格；一条命令输出可交互 HTML、可嵌 Markdown/HTML 的片段、或可直接放进 Word/PPT/PDF 的静态 SVG/PNG，并检查标题、单位、口径、来源与基线截断。写报告、PRD、技术方案、论文需要配图或配表时使用。
whenToUse: 文档需要趋势、对比、构成、分布、排名或拆解类图表，或需要一张能排序、筛选、导出的数据表时；已有数据要变成可交互 HTML，或要嵌进 Word/PPT/PDF 的静态图时。
---

# 文档图表与交互表格

本 skill 用 **Node.js + Apache ECharts 6** 渲染图表，用内置的表格组件渲染数据表。同一份配置可以输出三种形态：

| 形态 | 用途 | 命令 |
| --- | --- | --- |
| 可交互 HTML | 独立分发、知识库附件、评审 | `--format html`（默认） |
| 片段（snippet） | 嵌进已有网页或静态站点 | `--format snippet` |
| 静态 SVG / PNG | 嵌进 Word / PowerPoint / PDF | `--format svg` / `--format png` |

零安装：ECharts 已随 skill 分发（`vendor/echarts.min.cjs`，Apache-2.0），不需要 `npm install`。需要 Node 18+；只有 PNG 需要本机 Chrome 或 Edge。

## 一、什么时候用，什么时候不用

适用：

- 报告、方案、PRD、白皮书里的趋势、对比、构成、分布、排名、瀑布拆解。
- 需要一张能**排序、搜索、分页、看合计、导出 CSV** 的数据表。
- 已有 CSV 或一组数字，要变成能发出去、能点开看数值的图或表。

不适用：

- 地图、3D、关系网络、甘特图、桑基图：本 skill 不做。
- 只有一两个数字：写成正文或 KPI 卡片，不要画图。
- 数据口径不明、样本缺失：先把口径补齐，图解决不了证据问题。
- 需要 Word 里可编辑的原生表格：本 skill 的表格是 HTML/CSV，不是 docx 表格。

## 二、开工前一次问清（不要逐条来回问）

1. **数据从哪来**：对话里的数字、CSV、还是已有表格？列名和单位是什么？
2. **要回答什么问题**：趋势、横向对比、构成、分布、排名、从 A 到 B 的拆解，还是查明细？
3. **单位与口径**：单位、分母、样本量、时间范围；同比还是环比，百分比还是百分点。
4. **交付形态**：交互 HTML、嵌进现有页面、还是要进 Word/PPT/PDF 的静态图？
5. **语言与主题**：中文/英文，浅色/深色/跟随系统。

能从上下文推断的直接推断；只有会改变图表类型的缺口才集中问一次。

## 三、选图

| 要回答的问题 | 用 | `type` |
| --- | --- | --- |
| 随时间怎么变 | 折线（多系列） | `line` |
| 累计量怎么变 | 面积图 | `area` |
| 分类之间比大小 | 柱状（分组） | `bar` |
| 总量由什么构成 | 堆叠柱 | `bar` + `stack` |
| 排名前 N | 柱状 + `sort: desc` | `bar` |
| 两项指标是否相关 | 散点；第三维用气泡 | `scatter` / `bubble` |
| 占比构成（≤6 类） | 环形图 | `donut` |
| 单一时点占比 | 饼图 | `pie` |
| 两个维度的强度 | 热力图 | `heatmap` |
| 从期初到期末的拆解 | 瀑布图 | `waterfall` |
| 两个量纲放一起 | 柱 + 线，双轴 | `bar` + `line` + `axis: y2` |
| 精确数值、多列对比、要筛选 | 交互表格 | `table` |

选型细节与反模式见 [references/chart-selection.md](references/chart-selection.md)。

## 四、写配置

配置文件是 YAML 或 JSON，一张图一个文件。最常用的是简写形式：

```yaml
title: 各区域季度收入
subtitle: 单位：百万元 · 未税
source: 数据来源：财务系统 2026 年结账数据
type: bar
labels: [Q1, Q2, Q3, Q4]
x: {title: 季度}
y: {title: 收入, unit: 百万元}
data:
  华东: [128, 142, 151, 168]
  华北: [96, 103, 99, 118]
```

数据有五种写法：

1. **简写**：`type` + `labels` + `data`（`名称 -> 数值数组`），适合直接抄表格。
2. **显式 `series`**：逐系列设置 `stack`、`axis`、`smooth`、`color`、`format`。
3. **数值/时间轴**：`data: [[x, y], ...]`，配合 `x.type: value|time`。
4. **气泡**：`data: [[x, y, size], ...]`，配 `type: bubble`。
5. **CSV**：`data: {csv: 文件, x: 列名, series: [列名...], names: {列: 展示名}}`，路径相对配置文件。

### 交互表格

```yaml
type: table
title: 区域经营明细
source: 数据来源：经营看板
columns:
  - {key: city, label: 城市, align: left}
  - {key: revenue, label: 收入, unit: 万元}
  - {key: growth, label: 同比, format: percent}
  - {key: orders, label: 订单量}
rows:
  - {city: 上海, revenue: 1680, growth: 0.083, orders: 42600}
  - {city: 北京, revenue: 1520, growth: 0.061, orders: 38100}
table:
  sort: true          # 点表头排序
  search: true        # 关键词过滤
  page_size: 8        # 0 表示不分页
  totals: [revenue, orders]
  color_scale: growth # 按列值着色（有正负时以 0 为中心）
  bar: revenue        # 在单元格里画数据条
```

表格行也可以直接来自 CSV：`data: {csv: data/table.csv}`，列名即表头。

图表也可以带表：加 `data_table: true`，图表的底层数据会作为可排序表格**直接展开在 HTML 卡片里**（静态 SVG/PNG 不受影响）。需要细调时写对象：`data_table: {show: true, sort: true, search: false, page_size: 0}`，`page_size: 0` 表示不翻页。
```yaml
type: bar
title: 各区域季度收入
labels: [Q1, Q2, Q3, Q4]
y: {title: 收入, unit: 百万元}
data: {华东: [128, 142, 151, 168], 华北: [96, 103, 99, 118]}
data_table: true
```

### 配色

默认色板是 `frost`：雾蓝、薄荷、天青为主，白底上轻而清楚。需要更沉一点写 `palette: editorial`（低饱和印刷风），需要更醒目写 `palette: vivid`（高饱和），命令行 `--palette` 同样生效。三套色板共用墨色、网格与热力色阶，只换系列颜色——图表结构、图例顺序、表格都不受影响。

完整字段见 [references/spec.md](references/spec.md)。

## 五、生成与交付

```bash
cd <本 skill 目录>

node bin/render-charts.mjs chart.yaml                       # -> chart.html
node bin/render-charts.mjs chart.yaml --check               # 只检查，不出图
node bin/render-charts.mjs chart.yaml --format svg -o chart.svg
node bin/render-charts.mjs chart.yaml --format png -o chart.png
node bin/render-charts.mjs chart.yaml --format snippet -o chart.snippet.html
node bin/render-charts.mjs --gallery templates -o gallery.html   # 一次渲染整个模板目录
```

- **HTML**：单文件，内联 ECharts 与运行时（约 1.1 MB），离线可用，双击即开。
- **片段**：`<figure>` + 作用域样式 + 运行时，直接粘进已有页面；样式不会污染宿主。
- **SVG**：Node 端 SSR 渲染，不需要浏览器；只含绘图区，标题与来源写进文档图注。
- **PNG**：调用本机 Chrome/Edge 把同一份 SVG 截图，默认 2 倍像素；找不到浏览器时用 `--browser` 指定。

嵌入 Office、打印、图注模板见 [references/delivery.md](references/delivery.md)。

## 六、设计与交互

默认视觉按文档场景调好：8 色分类色板、只保留横向网格线、无边框卡片、等宽数字、标题/副标题/来源分层。**不要为了「好看」加渐变背景、3D、阴影或彩虹色**；改样式只改 `src/theme.mjs` 与 `assets/page.css`，规则见 [references/design.md](references/design.md)。

图表交互：

- 入场动画 700ms：柱从基线生长、折线从左到右绘制、饼环缩放展开；柱与散点按数据顺序错峰 18–22ms（上限 260/300ms）。
- 悬停时系列强调、提示框淡入；饼图/环形图的扇区会向外放大 7px（数值标签同步放大，低于显示阈值的小扇区也会露出占比）。
- 点图例隐藏/恢复系列有过渡。
- 切换深浅色**不重播**入场动画（属于状态切换，不是新图）。
- 系统开启「减少动态效果」（`prefers-reduced-motion: reduce`）时自动关闭动画。
- 工具栏：数据表、复制 TSV、导出 PNG、导出 SVG、深浅色切换。

表格交互：

- 点表头排序（升序 → 降序 → 原始顺序），支持文本与数字。
- 搜索框实时过滤；分页器可翻页；合计行固定在表尾。
- 「CSV」按钮导出当前表（含合计前的全部数据），「复制」把 TSV 放进剪贴板。

## 七、文档级检查

`--check` 输出 `[错误] / [警告] / [提示]`，退出码：`0` 通过、`1` 带 `--strict` 时的警告、`2` 错误。

| 检查 | 级别 | 怎么改 |
| --- | --- | --- |
| 数据点数量与 labels 不一致 | 错误 | 对齐数组长度，缺失值写 `null` |
| 柱/面积图的 `y.min > 0` | 错误 | 删掉 `min`，或改成折线 |
| 饼图含负值 / 合计为 0 | 错误 | 改用柱状图或修正数据 |
| 没有 `title` | 警告 | 写标题，或至少写进文档图注 |
| 没有 `source` | 警告 | 补数据来源、口径、时间范围 |
| 数值轴没有单位或标题 | 警告 | 加 `unit`（如 毫秒） |
| 系列超过 8 个 / 分类超过 40 个 | 警告 | 合并小类、聚合时间、改小倍数 |
| 堆叠组混用图型 | 警告 | 堆叠组内统一为 bar |
| 表格空列 / 行数或列数过多 | 警告 | 删空列、筛选或拆分 |

`--strict` 把警告当失败，适合交付前自检或放进 CI。

## 八、与文档写作规范衔接

- 图必须有**标题、单位、口径、来源**；HTML 版放卡片头部与页脚，静态图请写进图注。
- 表格同样要有表名、口径、来源；数值列右对齐，单位写在列名或标题里。
- 正文要解释图的重点，不要让读者自己从图里找结论；截图不能作为唯一可读证据。
- 需要 Word/PPT 成品时，按 `office` 相关 skill 处理；本 skill 只负责图与表的数据呈现。

## 九、交付检查

- [ ] 图表类型匹配问题，没有为了「丰富」堆图。
- [ ] 标题说了结论或主题，副标题给了范围/单位，页脚有来源与口径。
- [ ] 数值轴单位一致，柱/面积没有截断基线，双轴两侧都写了口径。
- [ ] 分类标签没有被截断或重叠；系列不超过 8 个。
- [ ] 表格列对齐正确，合计与正文数字一致，条件格式没有误导（红/蓝语义）。
- [ ] 静态图插入 Word/PPT 后字号可读；表格另存了 CSV 供核对。
- [ ] 交互版打开无控制台报错，悬浮、图例、数据表、导出都可用。
- [ ] `--check` 无错误；警告要么修掉，要么在交付说明里解释。

## 十、文件索引

```
skills/render-charts/
  SKILL.md
  bin/render-charts.mjs        # 命令行入口
  src/cli.mjs                  # 参数、格式推断、退出码
  src/spec.mjs                 # YAML/JSON/CSV 解析、校验、文档级检查
  src/build-chart.mjs          # 规范 -> ECharts option（明暗两套）+ 表格模型
  src/format.mjs               # 数字/日期格式化（与运行时保持一致）
  src/yaml.mjs                 # 零依赖 YAML 子集解析
  src/runtime.mjs              # 在 Node 里加载浏览器运行时（SSR 共用 formatter）
  src/html.mjs                 # 页面 / 片段 / 卡片装配
  src/render-svg.mjs           # ECharts SSR，输出静态 SVG
  src/export.mjs               # 无头浏览器截图，输出 PNG
  src/theme.mjs                # 色板与设计令牌
  assets/page.css              # 卡片、表格、打印样式
  assets/runtime.js            # 浏览器运行时：水合 formatter、工具栏、表格、导出
  vendor/echarts.min.cjs       # Apache ECharts 6（含 LICENSE）
  templates/                   # 15 个可直接改的示例：13 张图 + 1 个表格 + 1 个「图带表」 + CSV 示例
  tools/build-showcase.mjs     # 生成仓库根目录的分组展示页（演示用，不是渲染管线的一部分）
  tests/                       # node:test：解析、校验、SSR、CLI、格式化
  references/                  # 字段参考、选型、视觉规范、交付
```

自检：`node --test tests/`（64 个用例，含 SSR 与 CLI）。

改本 skill 时同步更新 `templates/` 与 `references/`；改配色或字号要同时改 `src/theme.mjs` 与 `assets/page.css`。
