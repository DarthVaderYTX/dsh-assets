# 图表配置字段参考

一个配置文件一张图，YAML 或 JSON 均可（`.yaml` / `.yml` / `.json` 按扩展名解析）。解析是**严格**的：未知字段直接报错并列出可用字段——拼错的键不应该悄悄退化成默认值。

图表类型由顶层 `type` 或各系列的 `type` 决定：`line` / `area` / `bar` / `scatter` / `bubble` / `pie` / `donut` / `heatmap` / `waterfall`；`type: table` 进入表格分支（§5），用 `columns` / `rows` / `table`。

## 1. 顶层字段

| 字段 | 类型 / 默认 | 说明 |
| --- | --- | --- |
| `title` / `subtitle` | 字符串 | 主标题与副标题；HTML 卡片显示，静态图请写进图注 |
| `source` / `note` | 字符串 | 来源与口径（页脚左）、补充说明（页脚右） |
| `lang` | `zh` \| `en`，`zh` | 影响紧凑单位（万/亿 与 K/M/B）、日期标签、界面文案 |
| `theme` | `auto` \| `light` \| `dark`，`auto` | 静态 SVG/PNG 取哪套配色；`dark` 同时把卡片标为深色 |
| `width` / `height` | 数字，`760` / `420` | 画布尺寸；< 240×160 报错；HTML 里宽度随容器，高度生效 |
| `padding` / `aria` | 数字 / 字符串 | 保留字段，当前不改变输出 |
| `id` | 字符串，`rc-1` | HTML `id` 与 `data-rc`，多图同页时定位用 |
| `type` / `labels` / `data` / `series` | — | 简写类型（默认 `line`）、分类标签、简写数据、显式系列；`data` 与 `series` 二选一 |
| `x` / `y` / `y2` | 对象 | 见 §2；有 `y2` 且系列写 `axis: y2` 才出现右轴 |
| `annotations` | 数组 | 见 §6 |
| `legend` / `tooltip` / `values` | 布尔或 `{show}` | 图例（默认系列 > 1 或饼/环时开）、提示（默认开）、数值标签（默认关） |
| `sort` | `desc` \| `asc` | 仅分类轴：按第一个可见系列重排分类 |
| `columns` / `rows` / `table` | 数组 / 数组 / 对象 | 仅表格，见 §5 |
| `data_table` | 布尔或 `{show, sort, search, page_size, index, sticky}` | 图表：在 HTML 卡片里展开底层数据表，见 §5.3 |
| `palette` | `frost` \| `editorial` \| `vivid` | `frost`：浅彩冷调（默认）；`editorial`：低饱和印刷风；`vivid`：高饱和。命令行 `--palette` 可覆盖 |

表格只读 `title` / `subtitle` / `source` / `note` / `lang` / `theme` / `id` / `columns` / `rows` / `data.csv` / `table`；`width` / `height` 与 `x` / `y` / `series` 对表格不生效（宽度随页面容器，滚动区固定 420px）。图表上的 `data_table` 对表格类型无意义。

## 2. 轴对象

`x` 支持 `category`（默认）/ `value` / `time`（旧写法 `linear` 等同 `value`）；`y` / `y2` 固定数值轴。

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `type` | x | `category` / `value` / `time` |
| `labels` | x；热力图的 y | 分类标签；热力图的 `y.labels` 是行名 |
| `title` / `unit` | x / y / y2 | 轴标题与单位，同时存在时显示「标题（单位）」；单位不进柱/线提示框 |
| `format` / `decimals` | x（value/time）/ y / y2 | 数字格式（§7）与小数位 |
| `min` / `max` / `begin_at_zero` | y / y2 | 固定范围；`true` 强制含 0，`false` 允许截断；柱/面积 `min > 0` 是错误 |
| `tick_count` / `grid` | y / y2 | 刻度目标数（默认 5）、是否画横向网格（默认画） |
| `format_date` | x（time） | `%Y` `%m` `%d` `%H` `%M`；不写时按跨度自动（≤2 天到时分，≤180 天到月日，≤1000 天到月，再长到年） |

`x.min` / `x.max` / `x.tick_count` / `x.grid` / `x.begin_at_zero`、`y.type`、`y.format_date` 写上去不报错，但不生效。

## 3. 系列对象

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | 字符串 | 系列名，图例、提示、数据表都用它；缺省「系列 N」 |
| `type` | 枚举 | 见开头列表；缺省继承顶层 `type` |
| `data` | 数组 | 见 §4 |
| `color` | 颜色 | 覆盖色板；写死 hex 后深浅两套主题都用它，不再自动换色 |
| `stack` | 字符串 | 相同值的柱叠在一起，堆叠组内只能是 `bar` |
| `axis` | `y2` | 挂到右轴；**必须同时定义 `y2`**，否则被当左轴且没有提示 |
| `smooth` / `points` / `dash` | 布尔 / `auto`·`always`·`never` / 字符串 | 0.35 单调平滑；`auto` 在 ≤32 点时显示点；虚线含 `6` → 6-4、含 `2` → 2-3、否则 4-4 |
| `labels` / `opacity` / `width` / `format` | 布尔 / 0–1 / 数字 / 格式 | 数值标签；线与柱透明度、线宽（默认 2）；格式覆盖标签与数据表，提示框仍用 `y.format` |
| `hidden` / `total_at` | 布尔 / 整数数组 | 初始隐藏（图例可再打开）；瀑布图的绝对值为这些下标 |
| `emphasis` | 布尔 | 保留字段，当前不生效 |

颜色按系列顺序取色板 10 色循环；分类轴上每个系列的 `data` 长度必须等于 `labels` 长度，缺失写 `null`。

## 4. 数据写法

| 写法 | 示例 | 说明 |
| --- | --- | --- |
| 分类数组 | `labels: [Q1, Q2]` + `data: {华东: [128, 142]}` | 键是系列名；长度必须等于标签数 |
| `[x, y]` 对 | `data: [["2026-06-01", 118], [128, 0.032]]` | 数值轴或时间轴；也可写对象 `{x, y, size}` |
| 气泡三元组 | `data: [[128, 0.032, 1200]]` | 第三项映射为直径（8–34px，平方根比例） |
| 热力矩阵或三元组 | `data: [[4, 3], [5, 4]]` 或 `[[4, 3, 42]]` | 矩阵按行给值，`null` 留空；三元组是 `[列下标, 行下标, 值]` |
| CSV | `data: {csv: data/r.csv, x: quarter, series: [north], names: {north: 华北}}` | 路径相对配置文件；`x` 必填 |

- 时间轴日期用 ISO（`2026/06/01` 也接受）且必须递增；分类轴缺值写 `null`，折线会断开而不是连过去。
- CSV 的行按等距处理（内部用行号当 x），不要配 `x.type: time`；`series` 省略时画除 `x` 外所有列。
- 热力图的列名与行名分别来自 `x.labels` / `y.labels`，值域自动取 min–max 映到 7 档色阶。

## 5. 表格规范

`type: table` 渲染成可排序、可搜索、可分页的 HTML 表格，工具栏提供 CSV 导出与复制。表格**不支持** SVG/PNG，需要静态表格请把 HTML 打印为 PDF。

**列**：`key`（必填，对应行对象的键）、`label`（表头，缺省用 `key`）、`align`（`left`/`center`/`right`，缺省数值列右对齐）、`width`（列宽 px）、`format`（数字格式，见 §7）、`unit`（没写 `format` 时按「数字 + 单位」显示）。列级 `type` / `prefix` / `suffix` / `decimals` 在白名单里但当前不生效，要写进 `format` 对象。

**行**：`rows` 是对象数组，`null` 与空串显示 `—`；不写 `columns` 时按第一行对象的键自动生成列。

| `table` 字段 | 默认 | 说明 |
| --- | --- | --- |
| `sort` | `true` | 点表头排序，升序 → 降序 → 原序 |
| `search` | `true` | 搜索框，匹配任意单元格文本，不区分大小写 |
| `page_size` | `10` | 每页行数；`0` 显示全部且不出分页器 |
| `index` | `true` | 首列行号（按原始行序，不随排序重排） |
| `totals` | `[]` | 参与合计的列 `key`；表尾加一行「合计」，按全部行求和，不受搜索影响 |
| `color_scale` | — | 列 `key`：按值给单元格 7 档底色 |
| `bar` | — | 列 `key`：单元格内画数据条，宽度按该列最大绝对值归一 |
| `dense` | `false` | 紧凑行距（5px / 10px） |
| `sticky` | `true` | 表头吸顶；当前表头始终吸顶，设为 `false` 不改变 |
| `caption` | — | 表注文字；当前版本不渲染，表注写 `subtitle` 或文档表注 |

- `color_scale` / `bar` 指向不存在的列会直接报错；条件格式按列值预计算，页面不需要额外数据。
- 条件格式只有一套 7 档色阶：有正有负时以 0 为中心（负 1–3、0 为 4、正 5–7），同号时按 min–max 分档，因此低值端偏红、高值端偏蓝。
- 行数 > 500、列数 > 12 会被 `--check` 警告；交互表格可以保留，但文档里要说明滚动与筛选方式。

表格也能用 CSV 行数据：`data: {csv: data/rows.csv}`，表头即列名，显式 `columns` 可只保留部分列并补 `label` / `format`，显式 `rows` 优先于 CSV。

### 5.3 图表带表：`data_table`

图表的底层数据默认藏在「数据」按钮后面。加 `data_table` 可以让它**直接展开在 HTML 卡片里**：

```yaml
type: bar
title: 各区域季度收入
labels: [Q1, Q2, Q3, Q4]
y: {title: 收入, unit: 百万元}
data: {华东: [128, 142, 151, 168], 华北: [96, 103, 99, 118], 华南: [74, 81, 88, 95]}
data_table: true
```

| 写法 | 效果 |
| --- | --- |
| `data_table: true` | 表格展开；可排序，不分页，行数显示在工具条里 |
| `data_table: {show: false}` | 等价于不写 |
| `{sort, search, page_size, index, sticky}` | 与 `table` 的同名选项含义一致，默认 `sort: true`、`search: false`、`page_size: 0` |

- 表格列由图表的可见系列生成：第一列是分类/时间，其余每列一个系列；列名就是系列名。
- 图表工具栏的「数据」按钮仍可折叠/展开；`data_table` 只是把初始状态设为展开。
- 只影响 `--format html` 与 `snippet`；`--format svg` / `png` 仍然只有图。
- 需要自定义列（改名、加单位、百分比格式）时，改用 `type: table` 单独出一张表。

## 6. 标注

`annotations` 是数组，每项一个标注，`label` 可选（不写则不显示文字）：

- `rule`（必填 `y`）水平参考线，别名 `line` / `hline`；`vrule`（必填 `x`）垂直参考线，分类轴上写标签名。
- `band`（必填 `from` / `to`）水平区间，别名 `hband`；`vband`（必填 `from` / `to`）垂直区间，分类轴上写标签名。

```yaml
annotations:
  - {type: rule, y: 150, label: SLO 150ms}
  - {type: vband, from: W32, to: W33, label: 大促}
```

参考线用注释色虚线、区间带用同色 7% 填充；标签名不在分类轴里会报错并列出可用标签。`annotations.side` / `axis` 在白名单里但不生效。

## 7. 数字格式

`format` 可写字符串 `percent`，或对象 `{style: percent, decimals: 1}`。

- `number` → `1,234.5`（默认；小数位自适应：≥1000 或整数取 0，否则 2）
- `integer` → `1,235`；`compact` → `1.2万` / `1.2K`（按 `lang`）
- `percent` → `42.6%`（**输入是 0–1 的比例**，自动 ×100）；`currency` → `¥1,234.00`（默认符号 `¥`，2 位小数）

对象还可写 `decimals`、`prefix`、`suffix`、`unit`、`symbol`（currency 专用）。

- 比例写 `0.426`；写 `42.6` 会显示成 `4,260%`。
- 轴刻度没写 `format` 时 ≥10000 自动用紧凑写法；写了就严格按 `format`。
- 柱/线/面积的提示框只认 `format`，`y.unit` 不自动拼进去；要带单位就写 `format: {style: number, unit: 毫秒}` 或 `suffix`。

## 8. 完整示例

**双轴**：两个量纲不可换算时才用，两侧都写标题。

```yaml
title: 订单量与转化率
x: {title: 月份, labels: [1月, 2月, 3月]}
y: {title: 订单量, unit: 万单}
y2: {title: 转化率, format: percent}
series:
  - {name: 订单量, type: bar, data: [42, 38, 51]}
  - {name: 转化率, type: line, axis: y2, data: [0.031, 0.029, 0.033]}
```

**瀑布**：`total_at` 的下标按绝对值从 0 起画，其余列写增减量，期末应等于期初加各增减量之和（不闭合不会报错，要自己核对）。

```yaml
title: 收入桥：期初 → 期末
x: {labels: [期初, 新增, 流失, 扩容, 期末]}
y: {title: 收入, unit: 百万元}
series:
  - {name: 收入变动, type: waterfall, data: [836, 112, -64, 47, 899], total_at: [0, 4]}
```

**堆叠**：`stack` 相同的柱叠在一起，组内不要混折线。

```yaml
title: 收入构成
x: {labels: [2025 Q3, 2025 Q4]}
y: {title: 收入, unit: 百万元}
series:
  - {name: 直销, type: bar, stack: channel, data: [182, 196]}
  - {name: 渠道, type: bar, stack: channel, data: [96, 108]}
```

**排名**：`sort` 只改分类顺序、不改数据，`values` 直接标数值。

```yaml
title: 9 月各城市订单量
type: bar
sort: desc
labels: [上海, 北京, 深圳, 广州]
y: {title: 订单量, unit: 万单}
data: {订单量: [42.6, 38.1, 31.4, 27.8]}
values: {show: true}
```

**表格**：列格式与条件格式在 `columns` / `table` 里配，行数据也可以来自 CSV。

```yaml
type: table
title: 区域经营明细
columns:
  - {key: city, label: 城市, align: left}
  - {key: revenue, label: 收入, unit: 万元}
  - {key: growth, label: 同比, format: percent}
rows:
  - {city: 上海, revenue: 1680, growth: 0.083}
  - {city: 北京, revenue: 1520, growth: 0.061}
table:
  page_size: 8
  totals: [revenue]
  color_scale: growth
```

## 9. 常见报错与修法

| 报错 | 原因 | 修法 |
| --- | --- | --- |
| `未知的顶层字段：xxx` | 键拼错或字段不支持 | 对照 §1；报错里会列出可用字段 |
| `y 中有未知字段` / `series[0] 中有未知字段` / `table 中有未知字段` | 同上 | 对照 §2 / §3 / §5 |
| `分类轴缺少 labels` | 简写没给标签，或 CSV 没写 `x` | 补顶层 `labels`、`x.labels` 或 CSV 的 `x` |
| `series "x" 有 N 个数据点，但分类轴有 M 个标签` | 数组长度不一致 | 对齐长度，缺失写 `null` |
| `不支持的系列类型 "xxx"` | `type` 拼错 | 用开头列表里的值 |
| `width/height 太小：至少 240×160` | 画布过小 | 加大画布，或减少分类 |
| `无法把 "x" 解析成数字` / `无法解析日期` | 数据混入非数字或非 ISO 日期 | 清理数据，或用 `null` 留空 |
| `表格需要 rows 或 data.csv` / `columns[0] 缺少 key` | 表格没有数据或缺 key | 补 `rows` / CSV / `key` |
| `table.color_scale 指向不存在的列` | 列 `key` 写错 | 改用列的 `key` |
| `表格只支持 html / snippet` | 对表格用了 `--format svg/png` | 用 HTML 打印为 PDF |

`--check` 还会做文档级检查：缺 `title` / `source`、数值轴没写单位/标题/格式、系列超过 8 个、柱/面积 `y.min > 0`（错误）、饼图负值或合计为 0（错误）、时间轴日期不递增（错误）、堆叠组混图型、饼图超过 8 类、分类超过 40 个、表格空列等，详见命令输出。
