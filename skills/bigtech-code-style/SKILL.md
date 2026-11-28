---
name: bigtech-code-style
description: 遇到编程需求时，按 Google、Microsoft、Meta 的官方公开规范选择并落地代码风格与工程实践：先看仓库既有配置，再按语言/框架选基准（C#/.NET、TypeScript → Microsoft；React/RN/Jest/Flow/Hack → Meta；Python/Java/C++/Go/Shell/JS → Google），套用命名、格式、导入、错误处理、测试、评审与 API 设计清单，并说明依据与偏离。
whenToUse: 用户要求按 Google / Microsoft / Meta 风格写代码、评审代码或统一现有代码风格；或仓库没有既有规范、需要一套可核查的业界基线时。
---

# 按大厂规范写代码

本 skill 把「像大厂那样写」变成可执行、可核查的动作：先确定依据哪份官方规范，再按清单写代码，最后用格式器、linter 和测试验证。规范细节在 `references/`，本文件只放选择规则、工作流和通用清单。

## 一、什么时候用

适用：

- 用户点名「按 Google / Microsoft / Meta 的风格」写、改或评审代码。
- 新仓库、新模块没有既有规范，需要一套能讲清依据的基线。
- 统一存量代码风格，或对一段代码做规范审查。

不适用：

- 仓库已有明确的 lint/format 配置或团队规范：**以仓库为准**，本 skill 只用来解释与补缺。
- 需要架构决策（选型、容量、协议）时，先按 `how-to-write-document` 的技术方案/技术选型流程，再回到本 skill 写代码。
- 只需要格式化：直接运行仓库的 formatter，不要手改。

## 二、规范优先级

冲突时按下列顺序，不能跳级：

1. **仓库既有配置与约定**：`.editorconfig`、`prettier`、`eslint`、`.clang-format`、`gofmt`、`dotnet format`、`ruff`/`pylint`、邻近文件的真实风格。
2. **用户点名的公司**。
3. **语言/技术栈映射**（见第三节）。
4. **通用工程实践**（第六节与 `references/engineering-practices.md`）。

不混用两套风格：一套为主，另一套只在主规范未覆盖的部分补充，并在交付说明中写清补了哪一条、为什么。

## 三、选哪套规范

| 语言 / 技术栈 | 基准 | 官方依据 |
| --- | --- | --- |
| C#、.NET、ASP.NET、Azure SDK | Microsoft | C# 编码约定、.NET 设计准则 |
| F#、VB.NET | Microsoft | F# 风格指南、VB 编码约定 |
| TypeScript（业务代码、库、Node 服务，非 React） | Microsoft | TypeScript Coding Guidelines |
| React、React Native、Jest、Flow、Hack | Meta（项目级官方规范） | React 规则、React 仓库 Prettier/ESLint 配置、Jest、Flow、Hack 文档 |
| Python、Java、C++、Go、Shell、HTML/CSS、JavaScript（非 React） | Google | Google Style Guides |
| HTTP / REST API 设计 | Microsoft | Microsoft REST API Guidelines |
| 代码评审、变更拆分与提交描述 | Google | Google Engineering Practices |

说明：

- **Meta 没有公开的公司级通用编码规范**，只有 React、React Native、Jest、Flow、Hack 等项目级官方规范；不要把社区文章当成 Meta 规范，也不要把 React 规则外推到后端代码。
- TypeScript 与 React 同时出现时：语言层用 Microsoft TS 约定（命名、类型、模块），React 层用 Meta 规则（Hooks、组件纯度、Prettier/ESLint）；两者冲突时以仓库配置为准。
- Java 同时受 Google Java Style 与公司内部规范约束时，Google 只管格式与命名，业务约定另算。

## 四、工作流

1. **侦察**：读仓库配置与 3–5 个邻近文件，确认格式器、linter、测试框架、目录约定；记录与所选规范的差异。
2. **选基准**：按第三节确定主规范；用户指定优先。写下一行判断：「本次按 X 规范，因为……」
3. **先定命名与格式**：变量、函数、类型、文件、测试的命名方式先统一，再写逻辑；格式交给工具。
4. **写实现**：错误路径、边界、资源释放与日志和主逻辑一起写，不留 TODO 式空洞。
5. **同批补测试与文档**：测试与实现同一个变更；新增/变更的公开接口更新注释或文档。
6. **用工具验证**：运行仓库的 formatter、linter、类型检查与测试；没有工具时按清单人工核对。
7. **交付说明**：一句话写明遵循的规范、验证命令，以及有意偏离的地方与原因。

## 五、代码层清单

写每段代码前过一遍，按所选规范取具体值（见 `references/`）：

- **命名**：类型/接口/枚举、函数/方法、变量/参数、常量、私有成员各自的大小写规则；不用缩写和单字母（循环下标除外）；名字不靠大小写区分。
- **格式**：缩进宽度与字符、行宽、大括号风格、空行分组；这些优先由 formatter 决定，不手写争论。
- **导入**：分组顺序（标准库、第三方、本项目）、组内排序、禁止通配导入、禁止未使用导入；语言有强制规则时（Go 的 gofmt、TS 的模块）按语言规则。
- **注释与文档**：公开 API 必须有文档注释，说明用途、参数、返回、错误；注释解释「为什么」，不复述代码；注释与代码同批更新。
- **错误处理**：不吞异常；错误信息包含可诊断上下文（操作、对象、原因）；区分可重试与不可重试；不用异常做流程控制；错误类型/错误码稳定。
- **类型**：优先精确类型而非 `any`/`Object`/`interface{}`；可空性显式表达；避免双重断言与类型逃逸。
- **资源与并发**：`using`/`defer`/`try-with-resources`/`context` 保证释放；共享状态有明确归属；并发代码说明顺序与取消语义。
- **日志与安全**：日志分级、结构化、带关联 ID；不记录密钥、令牌、个人敏感信息；不把用户输入直接拼进查询、命令或 HTML。
- **测试**：测试名描述「场景 + 预期」；一个测试一个行为；不依赖执行顺序与真实网络/时间；断言具体值而不是「不抛异常」。

## 六、工程层清单

- **变更粒度**：一个变更只做一件事；Google 的经验值是约 100 行较易评审，1000 行过大；重构与行为变更分开。
- **提交与描述**：首行是完整的祈使句，说明做了什么；正文说明为什么、影响面与验证方式；不写「fix bug」这类无信息描述。
- **测试**：实现与测试同一个变更；测试能在代码被破坏时失败；按 Google 的测试尺寸选择最小可行测试（小测试不碰网络、磁盘、sleep）。
- **评审**：评审意见具体、可执行，可选的润色标 `Nit:`；作者对每条意见回复或修改；Google 要求评审在一个工作日内响应，Microsoft 要求 CI 通过后再请评审。
- **CI**：提交前本地跑通格式、lint、类型检查、单测；CI 失败不请求评审、不合并。
- **文档**：README 写清运行与测试命令；公开 API 有接口文档；重要决策记录背景、选项与理由。
- **API**：资源用复数名词、路径用小写短横线或 camelCase、状态码语义正确、错误体稳定、版本与分页显式（Microsoft REST 指南）。
- **可观测性**：日志、指标、追踪三件套；跨服务传递关联 ID（Microsoft 工程手册）。

## 七、三家关键差异速查

| 维度 | Google | Microsoft | Meta |
| --- | --- | --- | --- |
| 缩进 | C++/Java/JS/Shell 2 空格，Python 4 空格 | C#/TS 4 空格 | 交给 Prettier（React 仓库默认 2 空格） |
| 行宽 | C++/JS/Python/Shell 80，Java 100，TS 未规定 | 官方约定未规定统一行宽 | React 仓库 `printWidth: 80` |
| 引号 | JS/TS 单引号 | TS 双引号 | React 仓库 `singleQuote: true` |
| 命名 | 类型/函数 PascalCase，C++ 变量 snake_case，Java 变量 camelCase | 公开成员 PascalCase，参数/局部变量 camelCase | 组件 PascalCase；变量/函数 camelCase |
| 错误处理 | Go 错误字符串小写、Java 不忽略异常、Python 不裸 `except` | 捕获具体异常、异步方法 `Async` 后缀 | React 渲染必须纯；Jest 测试确定性 |
| 测试 | `FooTest` / `testX_whenY_doesZ` | 单元测试 AAA、隔离、命名描述行为 | `*.test.js`、`describe`/`it`、快照入库 |

## 八、偏离与例外

- 允许偏离：遗留代码兼容、性能热点、框架强制写法、仓库既有约定。偏离必须写「哪条规则、为什么、影响是什么、何时复评」。
- 不允许：为了「像大厂」引入无意义抽象、照搬与语言不匹配的规则（例如把 Go 的错误处理套到 Java）、用风格争议掩盖设计问题。
- 规范没有覆盖的地方按语言社区主流做法，并在说明里标注「规范未覆盖」。

## 九、参考

- [Google 官方规范](references/google.md)：C++/Java/Python/Go/JS/TS/Shell 要点、工程实践、测试。
- [Microsoft 官方规范](references/microsoft.md)：C#/.NET、REST API、TypeScript、F#、工程手册、测试。
- [Meta 官方规范](references/meta.md)：React/React Native、Jest、Flow、Hack，以及「没有公司级通用规范」的边界。
- [跨公司工程实践](references/engineering-practices.md)：变更、评审、测试、CI、文档、API、可观测性的取舍。

所有链接均为官方域名（google.github.io、abseil.io、learn.microsoft.com、github.com/microsoft、github.com/facebook、github.com/jestjs、react.dev、reactnative.dev、jestjs.io、flow.org、docs.hhvm.com、prettier.io），检索日期 2026-11-28；规范会更新，引用具体条文前先打开链接核对版本。
