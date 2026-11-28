# 规范索引与跨公司实践

本目录按公司分四个文件夹，每家公司一份「规范摘要 + 官方链接」，官方原文以可读文本形式离线保存在各自的 `sources/` 下，断网也能查阅。入口 `SKILL.md` 会先让用户选公司，再做覆盖检查；本文件只做索引、对比与默认基线。

## 目录

```
references/
├── README.md                # 本文件：索引、跨公司对比、默认基线
├── google/
│   ├── README.md            # Google 编程规范与工程实践摘要
│   └── sources/             # 官方原文离线副本 + INDEX.md
├── microsoft/
│   ├── README.md
│   └── sources/
├── meta/
│   ├── README.md
│   └── sources/
└── amazon/
    ├── README.md
    └── sources/
```

- 每家公司 `sources/INDEX.md` 列出：文档名、官方链接、本地副本、抓取状态、原始字节、正文字符。
- 离线副本为自动转换的可读文本（保留标题、列表、表格、代码块的基本结构），排版细节与交互以官网为准。
- 抓取时间见各文件头部；规范会更新，引用具体条文前先对照官网版本。

## 四家公开程度

| 维度 | Google | Microsoft | Meta | Amazon |
| --- | --- | --- | --- | --- |
| 语言风格 | 完整公开（C++/Java/Python/Go/JS/TS/Shell/HTML/CSS/Markdown） | 完整公开（C#/VB/F#/TS） | 仅项目级（React/RN/Jest/Flow/Hack） | 项目级（SDK for Java v2、CDK、Smithy） |
| 代码评审 | 完整规范（eng-practices） | 工程手册中的评审流程 | 项目贡献指南中的 PR 流程 | Builders' Library：评审后合入 main |
| 测试 | 测试尺寸、覆盖率观点、测试命名 | 单元测试最佳实践、覆盖率门槛 | Jest 文档与仓库约定 | SDK 测试命名、CDK 覆盖率门禁 |
| CI/CD | 未单独公开成册 | 工程手册（持续集成、IaC） | 项目 CI 与发布流程 | CI/CD 流水线、waves、自动回滚 |
| API 设计 | 本次核实的官方清单中没有 | REST API Guidelines（Azure 指南） | 无公开通用规范 | Smithy 风格指南 |
| 可观测性 | 未单独公开成册 | 工程手册（日志/指标/追踪、关联 ID） | 无公开通用规范 | Well-Architected 运营卓越支柱 |

**Meta 没有公开的公司级通用编码规范。** 只引用 React、React Native、Jest、Flow、Hack 等项目级官方文档，不把社区文章写成「Meta 规范」。

**Amazon 同样没有公开全公司统一的编码规范。** 官方可核实的是 AWS 项目约定（SDK for Java v2、CDK、Smithy）与工程指南（Builders' Library、Well-Architected、DevOps Guidance）。

## 跨公司默认基线

没有指定公司、仓库也没有既有规范时，按下列顺序落到代码（均为四家可核实的交集）：

1. **格式**：交给仓库工具或语言主流格式器（gofmt、Prettier、Black、dotnet format、clang-format），不手写争论。
2. **命名**：用语言社区惯例，同一仓库保持一致。
3. **注释**：公开接口写文档注释，说明用途、参数、返回与错误；注释解释「为什么」。
4. **错误**：不吞异常；错误信息包含可诊断上下文；错误类型/错误码稳定。
5. **变更**：一个变更只做一件事；Google 的经验值是约 100 行易评审、1000 行过大；重构与行为变更分开。
6. **测试**：实现与测试同批；一个测试一个行为；测试确定性；能在实现被破坏时失败。
7. **评审**：Google 要求一个工作日内响应，只要变更明确提升代码健康度就批准；Microsoft 要求 CI 通过后再请评审；非必须项标 `Nit:`。
8. **CI**：流水线定义入库；每次提交跑构建、单测、风格检查；主分支受保护；部署有分批与告警门禁，失败可自动回滚（Amazon Builders' Library 的默认做法）。
9. **文档**：README 写清运行/测试/构建命令；公开 API 有接口文档；重要决策记录背景、选项与日期。
10. **API**：资源用复数名词；状态码语义正确；错误体稳定；版本与分页显式（Microsoft REST 指南）。
11. **可观测性**：日志、指标、追踪三件套；跨服务传播关联 ID；不记录密钥与个人敏感信息。
12. **韧性**：远程调用设置超时、重试上限与带抖动的指数退避；故障隔离，避免重试风暴（Amazon Builders' Library、Smithy client guidance）。

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
- Amazon Builders' Library：https://builder.aws.com/learn/topics/builders-library
- Well-Architected 运营卓越：https://docs.aws.amazon.com/wellarchitected/latest/framework/operational-excellence.html
- AWS DevOps Guidance：https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/
- Smithy Style Guide：https://smithy.io/2.0/guides/style-guide.html

以上原文均已下载到各公司 `sources/` 目录，可直接在本地检索。
