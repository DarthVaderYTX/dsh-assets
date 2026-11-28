# Amazon（AWS）官方规范

Amazon 没有公开全公司统一的编码风格手册；可核查的官方材料分两类：**项目级代码与 API 约定**（AWS SDK for Java v2、AWS CDK、Smithy）和**工程实践指南**（Builders' Library、Well-Architected 运营卓越支柱、DevOps Guidance）。写 AWS 相关代码时按项目规范，做架构与交付时按工程指南；不要用社区文章冒充 Amazon 规范。

本文引用的官方页面已全部下载到 [sources/INDEX.md](sources/INDEX.md)，断网也能查阅；条文以上线版本为准。

## 来源

| 主题 | 链接 |
| --- | --- |
| AWS SDK for Java v2 开发指南（索引） | https://github.com/aws/aws-sdk-java-v2/blob/master/docs/guidelines/README.md |
| AWS SDK for Java v2 通用指南 | https://github.com/aws/aws-sdk-java-v2/blob/master/docs/guidelines/aws-sdk-java-v2-general.md |
| AWS SDK for Java v2 命名约定 | https://github.com/aws/aws-sdk-java-v2/blob/master/docs/guidelines/NamingConventions.md |
| AWS CDK 贡献指南（含 lint、测试、设计准则） | https://github.com/aws/aws-cdk/blob/main/CONTRIBUTING.md |
| Smithy 风格指南（API 建模） | https://smithy.io/2.0/guides/style-guide.html |
| Builders' Library | https://builder.aws.com/learn/topics/builders-library |
| Well-Architected 运营卓越支柱 | https://docs.aws.amazon.com/wellarchitected/latest/framework/operational-excellence.html |
| AWS DevOps Guidance | https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/ |

## 代码与 API 约定

### AWS SDK for Java v2

通用原则：

- 代码清晰、可读、可维护；遵循 SOLID，组合优于继承，面向接口编程。
- **Fail fast**：尽早发现并报告错误。
- 修改既有 API 时保持向后兼容。
- 最小化公开 API：能包内可见就不要 public。

代码风格：

- 遵循 Java 约定与仓库既有风格；缩进与格式保持一致。
- 命名表意：变量、方法、类名要能说明用途。
- 公开 API 写完整 Javadoc。
- 方法短小、单一职责；参数尽量不超过 3 个。
- 需要多个参数构造对象时用 Builder 模式；异步操作用响应式原则；优先不可变对象。

异常与错误信息：

- 公开 API **不抛受检异常**（checked exception）；错误用 `SdkException` 体系表达。
- 只捕获能处理的异常；不要用异常做流程控制。
- **不要捕获后按同一类型重新抛出**；需要补充上下文时链式保留 cause。
- 错误信息写清「出了什么、期望什么、实际是什么」，包含字段名与格式，但不泄露敏感信息；必要时给排查建议。

POJO 与工具类：

- 公开 POJO 必须实现 `toString()`、`equals()`、`hashCode()`；新增字段必须同步更新这三个方法。
- `toString()` 用 SDK 的 `ToString` 工具类，且不包含凭据等敏感字段。
- `equals`/`hashCode` 用 EqualsVerifier 写单测。
- 生产代码解析 JSON 用 `JsonNodeParser`，懒初始化用 `Lazy`，带 TTL 的缓存用 `CachedSupplier`；不要自造这些实现。

命名（节选）：

- 类名用单数；缩写按一个单词处理：`DynamoDbClient`，不是 `DynamoDBClient`。
- 工厂类后缀：无参 getter 实现 `Supplier` 用 `{Noun}Supplier`，否则 `{Noun}Provider`；带参 getter 用 `{Noun}Factory`。
- 服务客户端：`{ServiceName}Client`、`{ServiceName}AsyncClient`、`{ServiceName}EnhancedClient`；部分操作封装用 `{ServiceName}{Noun}Manager`；预签名用 `{ServiceName}Presigner`；工具集合用 `{ServiceName}Utilities`。
- 测试命名 `methodToTest_when_expectedBehavior`（如 `close_withCustomExecutor_shouldNotCloseCustomExecutor`）。

### AWS CDK

- 代码用 TypeScript，仓库用 **ESLint** 保证风格一致；另有 pkglint、awslint 做包与 API 规则检查，提交前都要通过。
- 设计遵循仓库的 `docs/DESIGN_GUIDELINES.md`；尽量沿用仓库既有模式，不为个别实现偏离约定。
- 每个 PR 要有测试；覆盖率由 Codecov 门禁控制，不达标会阻止合并。
- 贡献类型明确区分：新功能、缺陷修复、文档、测试、重构；大改动先开 issue 对齐设计。

### Smithy（API 建模）

- 模型文件 UTF-8、以换行结尾；文件结构顺序：许可证 → 版本 → metadata → namespace，段间空一行。
- 用 4 空格缩进；一条语句一行；逗号只在单行 trait 或 node 值中保留；行尾不留空格。
- 命名：shape 用严格 UpperCamelCase（`XmlRequest`）；成员用严格 lowerCamelCase（`xmlRequest`）。
- 列表用复数名（`Users`），枚举与资源用单数名（`Suit`、`User`），操作按 `VerbNoun`（`UpdateUser`）。
- 数值 shape 带单位（`SizeInMb` 而不是 `Size`）；缩写按普通单词处理（`XmlHttpRequest`）；namespace 用消息字母、数字与点。

## 工程实践

### Builders' Library

Amazon 工程师撰写的官方工程文章，核心做法：

- **Trunk-based development**：所有人在 main 上小步提交，不维护长期特性分支；一个改动通常几小时到几天就能提交评审。
- **合入前必须通过代码评审**；评审通过后由 CI/CD 流水线自动构建、测试、部署，开发者不管理发布分支。
- **流水线就是 release captain**：用 stages、approvals、promotions 自动推进；每个 stage 部署到一组环境后跑集成测试与告警检查，失败就停止并不晋级。
- **Waves 控制爆炸半径**：先部署单个环境建立信心，越往后并行越多；生产拆成多个小环境（Region → AZ → one-box）。
- **不可变部署产物**：每次 main 变更生成新产物，记录产物与提交、环境的对应关系。
- **多 in-flight release**：stage 并行推进不同版本，新版本可取代旧版本，避免批量发布放大风险。
- **自动回滚**：部署或审批失败时把环境回滚到健康状态。
- **韧性**：超时、重试与带抖动的指数退避；故障隔离与依赖隔离（bulkhead）；用 constant work 降低突发负载带来的失败模式；减少相关故障（cell-based 设计）。

### Well-Architected 运营卓越支柱

- 把运营当作代码：基础设施、配置、流程与响应都定义为可版本化、可测试的代码。
- 四个持续活动：围绕业务结果组织团队 → 为生产做好准备 → 运营并交付价值 → 随业务变化演进。
- 七个能力：带质量门禁的变更流、降低部署风险、生产可支持性、多视角观测、提炼洞察、有效事件响应、从事件中学习并演进。

### DevOps Guidance

- 用 **DevOps Sagas** 组织能力域（组织采纳、CI/CD、测试、可观测性等），每个能力给出最佳实践指标、度量与反模式。
- 强调没有放之四海皆准的 DevOps：按组织环境、质量与安全要求裁剪。
- 与 Well-Architected 框架配合使用，而不是互相替代。

## 怎么落到代码

- **Java + AWS SDK**：按 SDK v2 指南（命名、异常、POJO、工具类）；通用 Java 风格可参考 Google Java Style，但 SDK 的项目约定优先。
- **TypeScript + CDK**：按 CDK 贡献指南的 ESLint/pkglint/awslint 与测试、覆盖率要求。
- **API 建模**：按 Smithy 风格指南。
- **服务架构、部署与运维**：按 Builders' Library、运营卓越支柱与 DevOps Guidance；默认采用 trunk-based、小变更、评审后自动流水线发布、自动回滚。

## 落地自检

- [ ] 异常不吞、不按同类型重抛；错误信息含字段与期望值，且不含敏感数据。
- [ ] 公开 POJO 的 `toString`/`equals`/`hashCode` 与字段同步，并有 EqualsVerifier 测试。
- [ ] 公开 API 有 Javadoc；方法短小、参数不超过 3 个；优先 Builder 与不可变对象。
- [ ] 命名符合 SDK 约定（单数类名、缩写按单词、后缀语义正确）。
- [ ] 变更走小步提交与代码评审；CI/CD 流水线负责构建、测试、部署与回滚。
- [ ] 部署有分批与告警门禁；失败能自动回滚；产物不可变。
- [ ] 分布式调用有超时、重试与带抖动退避；有故障隔离与容量保护。
