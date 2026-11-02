# dsh-perf-profiler

把 hook 监听器与工具执行体的耗时，归因到**是哪个插件、在哪个 hook 点或哪个工具、在哪一次调用**上。实时报告和离线分析都支持，**不修改 dsh 源码**。

## 为什么不用改源码

三个拦截点都是 Cordis 的公开（或运行期可达）接口：

| 拦截点 | 作用 | 关键事实 |
| --- | --- | --- |
| `internal/listener` 事件 | 拦截之后每一次 `ctx.on()` 注册，替换成计时包装 | 返回 disposer 即"替换本次注册" |
| `EventsService.unregister` | 让包装后的回调仍能被原 disposer 摘除 | disposer 闭包持有**原始**回调，不映射就会泄漏 |
| `ToolRuntime.register` / `executable` | 记录工具归属、给工具体计时 | 服务方法内 `this.ctx` 是**调用方**上下文 |

hook 的插件归属来自监听器上下文的 `fiber.name`；工具的归属来自注册时的 `this.ctx.fiber.name`（`ToolDefinition` 本身没有 owner 字段）。

## 安装

```sh
# 从本地目录装入 profile（link，改完重启生效）
dsh plugin --profile web add /path/to/dsh-assets/plugins/dsh-perf-profiler

# 或者先打包再装
pnpm pack && dsh plugin --profile web add ./dsh-perf-profiler-0.1.0.tgz
```

装完后 `dsh --profile web --dump-config` 能看到 `# == dsh-perf-profiler` 这一层。

## 实时看

模型侧两个工具，用户侧一个斜杠命令：

```
perf_report { kind: "all" | "hook" | "tool", top: 20, reset: false }
perf_tail   { limit: 20, kind, minMs, plugin }
/perf [report | tail 30 | reset | status]
```

`perf_report` 的列：`kind / plugin / hook-tool / fn / n / total / avg / p95 / max`（按独占时间降序）。

```
kind  plugin    hook/tool      fn           n  total    avg     p95     max
----  --------  -------------  -----------  -  -------  ------  ------  ------
hook  plugin-a  tools/execute  pluginAHook  2  12.89ms  6.45ms  6.51ms  6.51ms
tool  plugin-b  tool_b         execute:…    1  5.05ms   5.05ms  5.05ms  5.05ms
```

`perf_tail` 给的是**最近 N 条原始样本**，带 `session / turn / step / callId`，用来回答"慢在哪一次调用"。

超过 `slowMs`（默认 50ms）的样本会同时打一行 console 警告。

## 离线看

样本以 JSONL 追加到 `$DSH_HOME/logs/dsh-perf-profiler/perf-YYYY-MM-DD.jsonl`：

```json
{"ts":1793590211180,"kind":"hook","plugin":"plugin-slow","target":"tools/execute",
 "fn":"slowHook","inclusiveMs":7.34,"exclusiveMs":7.26,
 "session":"sess-1","agent":"sess-1","turn":"-","step":"-","callId":"c-0"}
```

```sh
node scripts/analyze.mjs                       # 自动取最新日志
node scripts/analyze.mjs --file perf.jsonl --top 30 --kind tool
node scripts/analyze.mjs --json > report.json
```

输出四段：`慢在哪（plugin × hook/tool）`、`按插件汇总`、`按 hook/工具汇总`、`最慢的单次调用`。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉则什么都不装 |
| `log` | `true` | 是否写 JSONL |
| `logDir` | `$DSH_HOME/logs/dsh-perf-profiler` | 日志目录 |
| `logMinMs` | `1` | 只落盘 ≥ 该值的样本（聚合仍统计全部） |
| `slowMs` | `50` | 超过则打 console 警告 |
| `ringSize` | `2000` | 内存里保留的最近样本数（供 `perf_tail` 与 p95） |
| `includeAllEvents` | `false` | 包装所有事件，而非默认白名单 |
| `events` | `[]` | 追加要观测的事件名 |
| `waterfallEvents` | `[]` | 追加"最后一个参数是 next"的事件名 |
| `sampleRate` | `1` | 采样率 (0,1] |
| `toolOwners` | `{}` | 手工补 `{ "工具名": "插件名" }`，用于挂载前已注册的工具 |

## 开销

设计目标是最小占用：

- **默认只包装白名单事件**（工具流水线、agent 步骤、system-prompt 组装等）。`llm/stream`、`session/event` 这类每 token / 每事件触发的高频事件**默认不碰**——包它们比测量本身更贵。
- 包装成本约 100–200ns/次（一次闭包调用 + 两次 `performance.now()`）。
- 日志走异步串行写，250ms 一批，队列上限 10000 条，溢出计数丢弃而不阻塞。
- 聚合是 `Map` 累加，无额外分配；原始样本有固定容量环形缓冲。
- 工具体计时是**每次调用一次对象浅拷贝**，不是每次监听。

## 已知限制

| 限制 | 原因 | 缓解 |
| --- | --- | --- |
| `ctx.tools.guard()` 看不到 | 它不走事件总线 | — |
| `internal/*` 上的监听器不包装 | 避免递归与噪声 | — |
| 高频事件的耗时不可见（默认） | 见"开销" | `includeAllEvents: true` 或 `events` 追加，自行承担成本 |
| turn/step 可能为 `-` | `ToolExecution` 不带 turn/step，靠 `agent/pre-step` 等事件补 | 正常会话中会在首个 step 之后填上 |
| 只测墙钟时间 | 不做 CPU/内存剖析 | — |

### 工具归属的覆盖率问题（未解决，见后续小节）

hook 的归属是可靠的：`hook.ctx.fiber.name` 直接给出注册方，且能回溯**已存在**的监听器。

工具的归属机制同样可靠、同样不需要改源码，但**覆盖率取决于加载顺序**：只有在本次插件补丁安装之后发生的 `register()` 调用才拿得到 owner，启动期已经注册完的工具只能记为 `(unknown)`。

## 工具归属：机理与覆盖率

### 为什么能拿到

`ToolRuntime.register` 是 Cordis 服务方法，调用时 `this` 被绑定为**调用方上下文**，因此在补丁里可以直接读到注册者：

```js
const owner = this.ctx.fiber.name   // 注册这个工具的插件名
```

工具定义本身没有 owner 字段，这是唯一的来源。

### 覆盖率矩阵

| 工具来源 | 归属 | 说明 |
| --- | --- | --- |
| 启动期、且对应插件在本插件**之后**启动 | ✅ 自动 | 顺序不保证，不能依赖 |
| 本插件加载之后新增的 bundle | ✅ 自动 | 排在 `dsh.profile.bundles` 后面即可 |
| 会话期才注册：per-agent 作用域工具、子 agent 工具、按需连接的 MCP 工具、GUI 里现装的插件 | ✅ 自动 | 这类是主要受益者 |
| 启动期、对应插件在本插件**之前**启动 | ❌ `(unknown)` | 常见情况，见下节 |

### 为什么启动期的工具拿不到

配置层按顺序应用：各 bundle 的 `cordis.patch.yml` → profile 自己的 patch → `--patch` overlay。`dsh plugin add` 默认把我们追加到 `dsh.profile.bundles` **末尾**，于是我们的插件最后启动，harness 自带插件早已把工具注册完毕。

这是层序问题，不是"事件已经过去"无法补救——补丁只要更早装上就能覆盖。

### 三条可选路径（均**未实现**）

| 方案 | 做法 | 覆盖 | 代价 |
| --- | --- | --- | --- |
| ① bundle 前置 | 手工把本 bundle 挪到 `dsh.profile.bundles` 里 `@deepseek-ai/dsh-base` 之前，让本插件最先启动 | 大部分，取决于各插件启动顺序 | 改动 profile 顺序，需实测；顺序本身会影响启动行为 |
| ② 手工映射 | 配置 `toolOwners: { "工具名": "插件名" }` | 精确，但需人工维护 | 工具增减时要跟着改 |
| ③ 改 dsh 源码 | `register()` 里把 `this.ctx.fiber.name` 写进注册记录（`packages/core/tools/src/index.ts`，约 3–5 行） | 100% | 需维护 fork，且要跟着上游走 |

**当前实现只支持 ②**（`toolOwners` 配置项）。① 与 ② 的自动化均未做：插件不会提示哪些工具是 `(unknown)`，也不会自动调整 bundle 顺序。

后续若要做，优先级建议：先加"列出 `(unknown)` 归属的工具名"的诊断（照单填 `toolOwners` 即可，成本最低），再评估 ① 的实际收益，最后才考虑 ③。


## 验证记录

在 dsh `0.2.2-alpha.2` 源码 + 真实 Cordis 上做过头验：

- 挂载前已注册的监听器能被包装，挂载后的注册被拦截 ✅
- 独占时间 = 总时间 − `next()` 时间 ✅
- 工具归属（后注册的准确、先注册的 `(unknown)`）✅
- 插件卸载后 hook 被正确摘除、剖析器卸载后监听器**还原为原函数** ✅
- JSONL 落盘 + `analyze.mjs` 四段报告 ✅
