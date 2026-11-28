# 跨公司工程实践

三家公司的公开程度不同：Google 有完整的代码评审规范与测试方法论；Microsoft 有工程手册（Playbook）与 API 指南；Meta 只有项目级实践与开源协作流程。写代码时，**语言层按所选公司规范，工程层取三家可核实的交集**，不要编造某家内部流程。

## 公开程度对比

| 维度 | Google | Microsoft | Meta |
| --- | --- | --- | --- |
| 语言风格 | 完整公开（C++/Java/Python/Go/JS/TS/Shell/HTML/CSS/Markdown） | 完整公开（C#/VB/F#/TS） | 仅项目级（React/RN/Jest/Flow/Hack） |
| 代码评审 | 完整规范（eng-practices） | 工程手册中的评审流程 | 项目贡献指南中的 PR 流程 |
| 测试 | 测试尺寸、覆盖率观点、测试命名 | 单元测试最佳实践、覆盖率门槛 | Jest 文档与仓库约定 |
| CI/CD | 未单独公开成册 | 工程手册（持续集成、IaC） | 项目 CI 与发布流程 |
| API 设计 | 未在本次核实的官方清单中 | REST API Guidelines（Azure 指南） | 无公开通用规范 |
| 可观测性 | 未单独公开成册 | 工程手册（日志/指标/追踪、关联 ID） | 无公开通用规范 |

## 变更与提交

- 一个变更只做一件事；重构与行为变更分开（Google）。
- Google 的经验值：约 **100 行**的变更容易评审，**1000 行**通常过大。
- 提交/变更描述首行是完整祈使句，正文写「做了什么、为什么、影响与验证」；「fix bug」不合格（Google）。
- 测试与实现同批提交（Google、Microsoft）。

## 代码评审

- 作者：变更自解释，描述里给验证命令与结果；有争议时先对齐设计再改代码。
- 评审者：Google 要求**一个工作日内响应**；Microsoft 要求 CI 通过后再请评审；Meta 要求 PR 带测试计划且 CI 全绿。
- 评审标准：Google 的准则是「只要明确提升代码健康度就批准」，不要求完美；非必须项标 `Nit:`。
- 评审内容：设计、功能、复杂度、测试、命名、注释、风格、一致性、文档（Google 的检查清单）。
- Microsoft 团队政策常见要求 ≥2 名评审者；团队没有规定时至少 1 名，关键路径 2 名。

## 测试

- 优先最小可行测试：Google 的「小测试」不碰网络、磁盘、sleep；能用小测试就不用中/大测试。
- 一个测试一个行为，名字描述「场景 + 预期」；断言具体值，不用「不抛异常」当断言。
- 测试必须确定性：mock 时间、随机、网络；测试之间相互隔离（Microsoft 单元测试最佳实践、Jest 文档）。
- 覆盖率是参考不是目标：Google 认为 80% 目标容易变成天花板；Microsoft 手册常用 80% 作为流水线门槛、检查清单目标 >90%。团队没有门槛时，关键路径与边界必须有测试。
- 测试要能在实现被破坏时失败；没有失败过的测试不可信。

## CI

- 流水线定义入库，一条命令完成构建；每次提交都跑构建、单测、风格检查与安全扫描（Microsoft Playbook）。
- 保护主分支，禁止直接提交；CI 失败不请求评审、不合并（Microsoft Playbook）。
- 本地提交前跑与 CI 相同的命令，避免「本地绿、CI 红」。

## 文档

- README 写清运行、测试、构建命令；新成员能按文档跑起来（Microsoft Playbook）。
- 公开 API 有接口文档；重要决策记录背景、选项、结论与日期（Microsoft Playbook）。
- 注释解释「为什么」；变更代码时同批更新注释与文档。
- Markdown 文档本身遵守排版规范（Google docguide：标题层级、行宽、列表）。

## API 设计

- 资源用复数名词；路径段用小写短横线或 camelCase；查询参数与 JSON 字段用 camelCase（Microsoft REST）。
- 状态码语义正确：创建 `201`、删除 `204`、长任务 `202` + `Operation-Location`（Microsoft REST）。
- 错误体稳定：`code`、`message`、`target`、`details`、`innererror`；错误码可被程序判断（Microsoft REST）。
- 版本显式：`api-version` 参数或等价机制；分页返回 `nextLink` 并在最后一页省略（Microsoft REST）。
- 幂等：所有方法应幂等；创建类 POST 用幂等键（Microsoft REST）。

## 可观测性

- 日志、指标、追踪三件套；跨服务传播关联 ID；记录活动开始/完成与启动配置（Microsoft Playbook）。
- 日志分级、结构化、可检索；不记录密钥、令牌、个人敏感信息。
- 关键路径有超时、重试与降级；重试要区分可重试错误。

## 安全与依赖

- 不把用户输入拼进 SQL、命令、HTML；用参数化查询与转义（通用底线）。
- 依赖最小化；新增依赖说明用途、许可证与维护状态；锁文件入库。
- 密钥不写进代码与日志；用环境变量或密钥管理服务。

## 没有指定公司时的默认基线

按下列顺序落到代码，都是三家可核实的交集：

1. 格式化与 lint 交给仓库工具；没有工具时按语言主流格式器（gofmt、Prettier、Black、dotnet format、clang-format）。
2. 命名用语言社区惯例，同一仓库保持一致。
3. 公开接口写文档注释；错误信息可诊断；不吞异常。
4. 变更小、描述清楚；测试与实现同批；CI 绿；至少一名评审者。
5. 日志结构化并带关联 ID；不记录敏感信息。

## 来源

- Google Engineering Practices：https://google.github.io/eng-practices/
- Google 变更大小：https://google.github.io/eng-practices/review/developer/small-cls.html
- Google 变更描述：https://google.github.io/eng-practices/review/developer/cl-descriptions.html
- Google 评审速度：https://google.github.io/eng-practices/review/reviewer/speed.html
- Google 评审标准：https://google.github.io/eng-practices/review/reviewer/standard.html
- Google 测试尺寸与覆盖率：https://abseil.io/resources/swe-book/html/ch11.html
- Microsoft Playbook：https://github.com/microsoft/code-with-engineering-playbook
- Microsoft 单元测试最佳实践：https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices
- Microsoft REST API Guidelines：https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md
- Meta React 贡献指南：https://github.com/facebook/react/blob/main/CONTRIBUTING.md
- React Native PR 管理：https://reactnative.dev/contributing/managing-pull-requests
- Jest 快照测试：https://jestjs.io/docs/snapshot-testing
