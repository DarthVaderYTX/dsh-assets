# 交付与嵌入

同一份配置有四种交付物，选错会让图在目标载体里掉字、丢交互或被压缩。先定载体，再定格式。

| 载体 | 用 | 不要用 |
| --- | --- | --- |
| 浏览器打开、发给同事、知识库附件 | `html` | PNG 截图 |
| 已有网页 / 静态站点 / 支持 HTML 的 Markdown | `snippet` | 整页 HTML 套 iframe |
| Word / PowerPoint / PDF / Keynote | `svg`（首选）或 `png` | HTML、交互脚本 |
| 打印 | 浅色主题的 `svg` / `png` | 深色主题 |
| 数据可复查 | `html`（数据表）或 CSV | 只有截图 |

## 1. 可交互 HTML

```bash
node bin/render-charts.mjs chart.yaml -o out/delay.html
```

- 单文件：ECharts 与运行时全部内联，**约 1.1 MB**（ECharts 本身约 1.1 MB）。这是离线可用的代价；不含任何网络请求。
- 打开即渲染；工具栏在鼠标悬停卡片时出现：数据、复制数据、PNG、SVG、深色。
- 嵌进知识库优先上传文件或作为附件；用 `<iframe>` 时高度至少 `画布高 + 160`，否则工具栏会被裁掉。
- 浏览器需要支持 ES2018+；不依赖 WebGL（canvas 2D）。

## 2. 片段（嵌进已有页面）

```bash
node bin/render-charts.mjs chart.yaml --format snippet -o out/delay.snippet.html
```

- 产出 `<figure>` + 作用域样式（`.rc-figure`）+ ECharts + 运行时；直接粘进宿主页面即可。
- 样式只作用于 `.rc-figure` 内部，不会覆盖宿主的 `body`、`svg`、`table` 规则；已用衬线字体页面验证过。
- 一个页面放多个片段时，脚本会各自初始化，互不干扰。
- 片段同样内联 ECharts（约 1.1 MB/份）；同页多图时建议改用整页 `html` 一次生成，或接受重复体积。

## 3. 静态 SVG / PNG

```bash
node bin/render-charts.mjs chart.yaml --format svg -o out/delay.svg
node bin/render-charts.mjs chart.yaml --format png -o out/delay.png
node bin/render-charts.mjs chart.yaml --theme dark --format png -o out/delay-dark.png
```

- **SVG** 由 ECharts SSR 在 Node 里直接生成，不需要浏览器；文字与颜色是矢量/属性，缩放不糊。
- **PNG** 把同一份 SVG 交给无头 Chrome/Edge 截图，默认 2×（760×400 → 1520×800）；找不到浏览器时用 `--browser` 指定路径，或退回 HTML 里的「PNG」按钮。
- 静态图**只画绘图区**：标题、来源、口径写进文档图注，避免图片内与图注重复。
- 深色主题的图不要直接插进白底文档；要么 `--theme light` 重出，要么单独做深色版。
- 表格不支持 SVG/PNG（它是 HTML 组件）；需要静态表格时把 HTML 打印成 PDF，或导出 CSV 另行排版。

**Word/PPT 里的尺寸**：插入后按版心宽度等比缩放（A4 正文约 16cm，PPT 16:9 约 20cm）。缩放后轴标签不应小于 8pt 等效字号——太小就加大 `width` 或减少分类。

## 4. Markdown

- 支持 HTML 的渲染器：用 `snippet`，交互可用。
- 只支持图片的渲染器：用 `svg` 或 `png`，`![图注](path.svg)` 引用；图注写在图片下一行，不要塞进 alt。

## 5. 图注怎么写

图注承担**图内不重复**的信息：编号、结论性标题、单位与口径、样本量、来源。

```
图 3　检索接口 P95 延迟按周变化（单位：毫秒；样本：每周约 42 万次请求）
数据来源：网关访问日志，2026-06-01 至 2026-09-21；8 月起切换新路由。
```

```
Figure 3. Weekly P95 latency of the search API (ms; n ≈ 420k requests per week).
Source: gateway access logs, 2026-06-01 to 2026-09-21.
```

表格用表注，格式相同：

```
表 2　各城市 8 月经营明细（收入单位：万元；同比为可比口径）
数据来源：经营看板，2026-08-01 至 2026-08-31。
```

要点：

- 标题写**结论或主题**，不写「趋势图」「示意图」。
- 单位、分母、时间范围、样本量至少出现一次；正文引用同一张图时不要改口径。
- 注释（口径变化、异常点）放在图注最后一句，或作为 `note` 由 HTML 页脚展示。
- 多图并列时编号连续，正文按编号引用。

## 6. 打印与 PDF

- 用浅色主题；深色图打印会变成一团深灰。
- HTML 打印样式已隐藏工具栏、保留卡片边框、禁止图被分页切断（`break-inside: avoid`）。
- 表格打印会展开滚动区（`max-height: none`），但**不会**展开分页——打印前把 `page_size` 设为 `0` 重新生成。
- 需要 PDF 时：浏览器「打印 → 另存为 PDF」保留矢量；或导出 SVG 后在 Word/InDesign 里排版。

## 7. 文件与目录

- 图配置与数据放在文档同目录的 `figures/` 下，命名用 `fig-<编号>-<主题>.yaml`，输出同名 `.html/.svg/.png`。
- CSV 与配置文件同目录（或 `data/` 子目录），路径写相对路径，换机器不会断。
- 配置一定要留（下次改数据要重出）；交付物按需留 HTML 与静态图。

## 8. 交付前检查

- [ ] 目标载体能打开：浏览器无控制台报错、Word/PPT 插入后不糊、PDF 里字号可读。
- [ ] 静态图在浅色/深色背景上都不丢字（SVG 自带颜色，不依赖页面 CSS）。
- [ ] 图注/表注含编号、单位、口径、来源、样本量，正文有对应解释。
- [ ] 表格的合计与正文数字一致；条件格式的红/蓝语义没有被误读。
- [ ] 交互版的数据表、复制、CSV、PNG/SVG 导出都能用。
- [ ] 文件名、目录、相对路径在另一台机器上仍可用。
