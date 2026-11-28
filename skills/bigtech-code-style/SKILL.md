---
name: bigtech-code-style
description: 遇到编程需求时，先问用户按 Google / Microsoft / Meta / Amazon 哪家风格实现；所选公司没有覆盖当前语言或框架时明确告知并给出替代选项。再按官方公开规范落地命名、格式、错误处理、测试、评审与 API 设计，先服从仓库既有配置，并说明依据与偏离。
whenToUse: 用户要求按 Google / Microsoft / Meta / Amazon 风格写代码、评审代码或统一现有代码风格；或仓库没有既有规范、需要一套可核查的业界基线时。
---

# 按大厂规范写代码

本 skill 把「像大厂那样写」变成可执行、可核查的动作。两个前置门禁：**先问用户选哪家公司**，**再检查所选公司是否覆盖当前任务**；两步都过了才写代码。

## 一、什么时候用

适用：

- 用户点名「按 Google / Microsoft / Meta / Amazon 的风格」写、改或评审代码。
- 新仓库、新模块没有既有规范，需要一套能讲清依据的基线。
- 统一存量代码风格，或对一段代码做规范审查。

不适用：

- 仓库已有明确的 lint/format 配置或团队规范：**以仓库为准**，本 skill 只用来解释与补缺。
- 需要架构决策（选型、容量、协议）时，先按 `how-to-write-document` 的技术方案/技术选型流程，再回到本 skill 写代码。
- 只需要格式化：直接运行仓库的 formatter，不要手改。

## 二、触发后先问：选哪家公司

**本 skill 的第一步是问用户，不要先读代码、不要默认 Google。**

用会话里的提问工具（没有就用普通消息问并等待），提问话术：

> 这次按哪家公司的规范来写？
>
> - **Google**：C++ / Java / Python / Go / JavaScript / TypeScript / Shell，附代码评审与测试规范
> - **Microsoft**：C# / .NET（F#、VB）、TypeScript、REST API 设计，附工程手册与单元测试
> - **Meta**：React / React Native / Jest / Flow / Hack（只有项目级规范）
> - **Amazon**：AWS SDK for Java v2、AWS CDK、Smithy，附 AWS 架构与运维实践
> - **不限**：按语言自动选，我会说明选了哪家

例外与处理：

- **用户已在请求里点名公司**：不再重复提问，复述确认「按你指定的 X 规范」，然后做覆盖检查。
- **用户说「随便 / 你定 / 不限」**：按第五节的映射选一家，并在交付说明里写明「用户未指定，按 X 规范」。
- **无法与用户交互**（批处理、CI 场景）：按语言映射执行，在输出中标明「未能确认公司，按 X 规范」。
- 用户选定后**全程不换公司**：命名、格式、错误处理、测试、评审、API 都按同一家；需要补充另一家时按第三节处理并说明。

## 三、覆盖检查：所选公司是否覆盖这个任务

选定公司后，先判断它有没有覆盖当前语言/框架。**不覆盖时必须告知用户，不能静默改用别家，也不能编造该公司的规则。**

| 公司 | 覆盖 | 不覆盖（常见） |
| --- | --- | --- |
| Google | C++、Java、Python、Go、JavaScript、TypeScript、Shell、HTML/CSS；代码评审、测试尺寸 | 本 skill 未收入：C#/F#、Rust、Kotlin、PHP、Ruby（Swift/ObjC 有 Google 指南，但未归档）；具体框架与业务约定 |
| Microsoft | C#、.NET（含 F#/VB）、TypeScript、REST API 设计、.NET 单元测试、工程手册 | Python、Java、C++、Go、React、非 Azure 的云架构 |
| Meta | React、React Native、Jest、Flow、Hack | 后端语言（Python/Java/Go/C++）、通用工程流程、非 React 前端 |
| Amazon | AWS SDK for Java v2、AWS CDK（TypeScript）、Smithy、AWS 架构与运维 | 非 AWS 场景的通用语言风格（Java/Python/前端等）、非 AWS 项目流程 |

**未覆盖时的处理**（必须按顺序做）：

1. **明确告知**：「你选的是 <公司>，但 <语言/框架> 不在它的公开规范里；它的规范只覆盖 <范围>，这部分没有可引用的官方依据。」
2. **给出三个选项让用户选**（同样用提问工具）：
   - **A 换成覆盖该栈的公司**：Python/Java/C++/Go/Shell → Google；C#/.NET/TypeScript → Microsoft；React → Meta；AWS SDK/CDK/Smithy → Amazon。
   - **B 保留所选公司**：只用它的通用工程实践（评审、测试、CI 等）+ 该语言社区惯例；哪些结论没有官方依据要写清。
   - **C 以语言映射的公司为主、所选公司作补充**：说明各自适用的部分，不混用同一类规则。
3. **用户不选就停下来等**；不得自行替换公司，也不得把「通用做法」写成「该公司的规范」。

**四家在本 skill 里都覆盖不到**（Rust、Kotlin、PHP、Ruby 等；Swift / Objective-C 另有 Google 指南，可按需补充）：

- 告知「这四家都没有该语言的公开规范」；
- 按仓库配置 + 语言社区惯例执行，输出标注「无公司规范依据」；
- 或请用户指定一份官方规范，再按它执行。

## 四、规范优先级

冲突时按下列顺序，不能跳级：

1. **仓库既有配置与约定**：`.editorconfig`、`prettier`、`eslint`、`.clang-format`、`gofmt`、`dotnet format`、`ruff`/`pylint`、邻近文件的真实风格。
2. **用户在第二节选定的公司**。
3. **语言/技术栈映射**（第五节，仅在用户选「不限」或按第三节选项 C 时使用）。
4. **通用工程实践**（第八节与 `references/README.md`）。

不混用两套风格：一套为主，另一套只在主规范未覆盖的部分补充，并在交付说明中写清补了哪一条、为什么。

## 五、语言到公司映射（仅在「不限」或补充时使用）

| 语言 / 技术栈 | 基准 | 官方依据 |
| --- | --- | --- |
| C#、.NET、ASP.NET、Azure SDK | Microsoft | C# 编码约定、.NET 设计准则 |
| F#、VB.NET | Microsoft | F# 风格指南、VB 编码约定 |
| TypeScript（业务代码、库、Node 服务，非 React） | Microsoft | TypeScript Coding Guidelines |
| React、React Native、Jest、Flow、Hack | Meta（项目级官方规范） | React 规则、React 仓库 Prettier/ESLint 配置、Jest、Flow、Hack 文档 |
| Python、Java、C++、Go、Shell、HTML/CSS、JavaScript（非 React） | Google | Google Style Guides |
| AWS SDK（Java v2）、AWS CDK、Smithy、AWS 架构与运维 | Amazon（项目级约定 + 工程指南） | SDK v2 开发指南、CDK 贡献指南、Smithy 风格指南、Builders' Library、Well-Architected、DevOps Guidance |
| HTTP / REST API 设计 | Microsoft | Microsoft REST API Guidelines |
| 代码评审、变更拆分与提交描述 | Google | Google Engineering Practices |

说明：

- 这张表只在用户选「不限」、或按第三节选项 C 时使用；用户点名公司时以用户为准。
- **Meta 没有公开的公司级通用编码规范**，只有 React、React Native、Jest、Flow、Hack 等项目级官方规范；不要把社区文章当成 Meta 规范，也不要把 React 规则外推到后端代码。
- **Amazon 同样没有公开全公司统一的编码规范**；AWS 相关代码按 SDK for Java v2、CDK、Smithy 的项目约定，架构与交付按 Builders' Library、Well-Architected 与 DevOps Guidance。
- TypeScript 与 React 同时出现时：语言层用 Microsoft TS 约定，React 层用 Meta 规则；冲突时以仓库配置为准。

## 六、工作流

1. **问公司**：按第二节提问或确认，记录用户选择。
2. **覆盖检查**：按第三节判断是否覆盖；不覆盖就告知并让用户选 A/B/C，不要跳过。
3. **侦察仓库**：读配置与 3–5 个邻近文件，确认格式器、linter、测试框架、目录约定。
4. **定基准**：按第四节确定主规范；写下一行判断：「本次按 X 规范，因为……」。
5. **先定命名与格式**：变量、函数、类型、文件、测试的命名方式先统一，再写逻辑；格式交给工具。
6. **写实现**：错误路径、边界、资源释放与日志和主逻辑一起写，不留 TODO 式空洞。
7. **同批补测试与文档**：测试与实现同一个变更；新增/变更的公开接口更新注释或文档。
8. **用工具验证**：运行仓库的 formatter、linter、类型检查与测试；没有工具时按清单人工核对。
9. **交付说明**：写明遵循的公司与规范、覆盖结论（是否用了替代方案）、验证命令，以及有意偏离的地方与原因。

## 七、代码层清单

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

## 八、工程层清单

- **变更粒度**：一个变更只做一件事；Google 的经验值是约 100 行较易评审，1000 行过大；重构与行为变更分开。
- **提交与描述**：首行是完整的祈使句，说明做了什么；正文说明为什么、影响面与验证方式；不写「fix bug」这类无信息描述。
- **测试**：实现与测试同一个变更；测试能在代码被破坏时失败；按 Google 的测试尺寸选择最小可行测试（小测试不碰网络、磁盘、sleep）。
- **评审**：评审意见具体、可执行，可选的润色标 `Nit:`；作者对每条意见回复或修改；Google 要求评审在一个工作日内响应，Microsoft 要求 CI 通过后再请评审。
- **CI**：提交前本地跑通格式、lint、类型检查、单测；CI 失败不请求评审、不合并。
- **文档**：README 写清运行与测试命令；公开 API 有接口文档；重要决策记录背景、选项与理由。
- **API**：资源用复数名词、路径用小写短横线或 camelCase、状态码语义正确、错误体稳定、版本与分页显式（Microsoft REST 指南）。
- **可观测性**：日志、指标、追踪三件套；跨服务传递关联 ID（Microsoft 工程手册）。

## 九、关键差异速查

| 维度 | Google | Microsoft | Meta |
| --- | --- | --- | --- |
| 缩进 | C++/Java/JS/Shell 2 空格，Python 4 空格 | C#/TS 4 空格 | 交给 Prettier（React 仓库默认 2 空格） |
| 行宽 | C++/JS/Python/Shell 80，Java 100，TS 未规定 | 官方约定未规定统一行宽 | React 仓库 `printWidth: 80` |
| 引号 | JS/TS 单引号 | TS 双引号 | React 仓库 `singleQuote: true` |
| 命名 | 类型/函数 PascalCase，C++ 变量 snake_case，Java 变量 camelCase | 公开成员 PascalCase，参数/局部变量 camelCase | 组件 PascalCase；变量/函数 camelCase |
| 错误处理 | Go 错误字符串小写、Java 不忽略异常、Python 不裸 `except` | 捕获具体异常、异步方法 `Async` 后缀 | React 渲染必须纯；Jest 测试确定性 |
| 测试 | `FooTest` / `testX_whenY_doesZ` | 单元测试 AAA、隔离、命名描述行为 | `*.test.js`、`describe`/`it`、快照入库 |

**Amazon（AWS）速查**

| 场景 | 规则 |
| --- | --- |
| AWS SDK for Java v2 | Javadoc、参数 ≤3、公开 API 不抛受检异常、POJO 三件套、测试命名 `method_when_behavior` |
| AWS CDK | ESLint / pkglint / awslint、每个 PR 带测试、Codecov 覆盖率门禁 |
| Smithy | 4 空格、UpperCamel shape、lowerCamel member、列表复数、操作 VerbNoun |
| 交付与运维 | trunk-based、评审后自动流水线、waves 控爆炸半径、自动回滚、operations as code |

## 十、偏离与例外

- 允许偏离：遗留代码兼容、性能热点、框架强制写法、仓库既有约定。偏离必须写「哪条规则、为什么、影响是什么、何时复评」。
- 不允许：为了「像大厂」引入无意义抽象、照搬与语言不匹配的规则（例如把 Go 的错误处理套到 Java）、用风格争议掩盖设计问题。
- 规范没有覆盖的地方按语言社区主流做法，并在说明里标注「规范未覆盖」；这类情况在第三节就先告知用户，不要留到交付时才说。

## 十一、参考

- [Google 官方规范](references/google/README.md)：C++/Java/Python/Go/JS/TS/Shell 要点、工程实践、测试。
- [Microsoft 官方规范](references/microsoft/README.md)：C#/.NET、REST API、TypeScript、F#、工程手册、测试。
- [Meta 官方规范](references/meta/README.md)：React/React Native、Jest、Flow、Hack，以及「没有公司级通用规范」的边界。
- [Amazon（AWS）官方规范](references/amazon/README.md)：SDK for Java v2、CDK、Smithy 约定，以及 Builders' Library、运营卓越、DevOps Guidance。
- [规范索引与跨公司实践](references/README.md)：变更、评审、测试、CI、文档、API、可观测性的取舍。

四家的官方原文（含本文件引用的每个链接）都已下载到 `references/<公司>/sources/`，每家公司 `sources/INDEX.md` 有清单，断网可查。所有链接均为官方域名（google.github.io、abseil.io、learn.microsoft.com、github.com/microsoft、github.com/facebook、github.com/jestjs、react.dev、reactnative.dev、jestjs.io、flow.org、docs.hhvm.com、prettier.io、builder.aws.com、docs.aws.amazon.com、smithy.io、github.com/aws），检索日期 2026-11-28；规范会更新，引用具体条文前先打开链接核对版本。
