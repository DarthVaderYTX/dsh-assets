# Microsoft 官方规范

来源限定在 `learn.microsoft.com` 与 `github.com/microsoft`（官方仓库、wiki）。注意两点：**Microsoft REST API Guidelines 的现行细则以仓库内的 Azure 指南为准**，引用时以该文件为准；**TypeScript Coding Guidelines 明确说明它面向 TypeScript 代码库贡献者，不是面向社区的统一规范**，跨项目时只能作参考。

## 来源

| 主题 | 链接 |
| --- | --- |
| C# 编码约定 | https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions |
| .NET 设计准则（总览） | https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/ |
| 大小写与命名约定 | https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/capitalization-conventions |
| Microsoft REST API Guidelines | https://github.com/microsoft/api-guidelines |
| Azure REST API Guidelines（现行细则） | https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md |
| TypeScript Coding Guidelines | https://github.com/microsoft/TypeScript/wiki/Coding-guidelines |
| F# 风格指南 | https://learn.microsoft.com/en-us/dotnet/fsharp/style-guide/conventions |
| VB 编码约定 | https://learn.microsoft.com/en-us/dotnet/visual-basic/programming-guide/program-structure/coding-conventions |
| Engineering Playbook | https://github.com/microsoft/code-with-engineering-playbook |
| Playbook：代码评审 | https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/code-reviews/README.md |
| Playbook：自动化测试 | https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/automated-testing/README.md |
| Playbook：持续集成 | https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/CI-CD/continuous-integration.md |
| Playbook：可观测性 | https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/observability/README.md |
| Playbook：文档 | https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/documentation/README.md |
| 单元测试最佳实践 | https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices |

## C# / .NET 编码约定

- 命名：命名空间、类型、接口、方法、属性、事件、公开字段、枚举值用 `PascalCase`；参数、局部变量用 `camelCase`；标识符不使用下划线或连字符（私有字段的 `_camelCase` 是部分仓库如 dotnet/runtime 的约定，不是官方通用规则）。
- 布局：**4 空格**缩进，不用 tab；大括号独占一行（Allman）；一行一条语句、一行一个声明；成员之间空一行。
- `var`：仅当右侧能明显看出类型时使用（`new`、强制转换、字面量）；只有方法名能暗示类型时不要用；`foreach` 循环变量写显式类型；`for` 与 LINQ 可用 `var`。
- 异步：返回可等待类型的方法加 `Async` 后缀；同步方法不加；`Async` 已被占用时用 `TaskAsync` 形式。
- 异常：只捕获能处理的异常；不要无过滤地捕获 `System.Exception`；用具体异常类型与有意义的 message；不要用异常做流程控制。
- 资源：能用 `using`（含无大括号的 `using` 声明）就不要写只调用 `Dispose` 的 `try-finally`。
- `using` 指令放在命名空间外；新代码用文件级命名空间（`namespace Foo;`）。
- 注释：`//` 独占一行（不写行尾注释），首字母大写、结尾句号、`//` 后一个空格；公开成员写 XML 文档注释。
- 可空性：项目开启 `<Nullable>enable</Nullable>`，用 `?` 标注可空意图；`!` 只在确定非空时使用。
- 用语言关键字（`string`、`int`）而不是运行时类型名（`String`、`Int32`）；优先有符号整数。
- 静态成员通过类型名调用（`ClassName.Member`），不要通过派生类名调用。

```csharp
namespace Orders.Api;

public sealed class OrderService
{
    private readonly IOrderStore _store;

    public OrderService(IOrderStore store)
    {
        _store = store;
    }

    public async Task<Order?> FindAsync(string orderId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(orderId))
        {
            return null;
        }

        return await _store.GetAsync(orderId, cancellationToken);
    }
}
```

## .NET 设计准则

- 类型名用名词（`OrderService`），接口用形容词或名词短语（`IDisposable`、`IOrderStore`），不用 `I` + 动词。
- 布尔成员用 `Is`/`Can`/`Has`/`Should` 开头；集合用复数名词；方法名用动词或动词短语。
- 避免缩写；用完整单词（`GetWindow` 而非 `GetWin`）；同一概念全库同名。
- 公开 API 的异常、参数校验、空值语义写进文档；不要抛 `Exception` 基类。
- 扩展方法放在静态类、命名空间与扩展类型一致；不要给 `object` 加扩展方法。

## REST API 设计（Azure 指南）

- URL：资源集合用**复数**名词，路径段用 kebab-case（首选）或 camelCase；查询参数与 JSON 字段用 camelCase；请求头用 kebab-case。
- 方法语义：`GET` 查询、`POST` 创建或动作、`PUT` 全量替换、`PATCH` 部分更新、`DELETE` 删除；所有方法都应幂等，创建类 POST 通过 `Repeatability-Request-ID` / `If-Match` 保证幂等。
- 状态码：`POST` 创建返回 `201` + 资源 URL；`PATCH` 返回 `200/201`；`PUT` 返回 `200/201`；`DELETE` 返回 `204` 且避免用 `404` 表示删除成功；长任务返回 `202` + `Operation-Location`。
- 错误：响应头 `x-ms-error-code` 与响应体 `error.code` 一致；错误体结构为 `{ "error": { "code", "message", "target", "details", "innererror" } }`。
- 版本：每个操作都必须带 `api-version` 查询参数，格式 `YYYY-MM-DD`（预览加 `-preview`）；缺失返回 `400 MissingApiVersionParameter`。
- 分页：返回绝对地址 `nextLink`，其中必须带全部必需查询参数（含 `api-version`）；最后一页省略 `nextLink`，不要返回 `null`。
- 请求追踪：每个响应返回不透明的 `x-ms-request-id`；不要因为不认识的请求头而拒绝请求；不要自造 `x-` 前缀头。
- JSON：不要发送值为 `null` 的字段；只有 `PATCH` 合并语义下接受 `null` 表示删除。

## TypeScript Coding Guidelines

> 官方说明：这些规则面向 TypeScript 代码库自身的贡献者，不是面向社区的统一规范。

- 类型名与枚举值用 `PascalCase`；函数、属性、局部变量用 `camelCase`。
- 接口名不加 `I` 前缀；私有属性不加 `_` 前缀；用完整单词。
- 用 `undefined`，不用 `null`。
- 缩进 4 空格；循环与条件体必须加括号；左大括号同行；`else` 另起一行。
- 字符串用双引号；每个变量声明只声明一个变量；括号内不加空格。
- 用箭头函数代替匿名函数表达式；参数括号在可省略时省略。
- 函数、接口、枚举、类写 JSDoc；类型定义放在文件前部；不共享的符号不导出。

## F#

- 命名空间、模块、类型、成员用 `PascalCase`；函数与值用 `camelCase`。
- 优先用 `Option<'T>` 表达缺失，不用 `null`；与 .NET 互操作需要 `null` 时在边界处集中处理。
- 模块函数保持小而有明确输入输出；副作用集中在边界。
- 用 `[<Literal>]` 定义常量；判别联合与记录优先于元组表达领域模型。

## 工程手册（Playbook）

- 代码评审：每个 PR 都要评审，团队用评审清单；团队政策通常要求至少 2 名评审者；评审要及时响应。
- 测试：没有测试的代码视为未完成；合并前单元测试必须通过；集成/E2E 测试定期运行；测试失败阻断合并。
- CI：流水线定义入库；每次提交都构建、跑单测、代码风格检查与安全扫描；一条命令完成构建，不依赖 IDE。
- 分支：保护主分支，禁止直接提交；构建失败时阻断评审；CI 通过后再请评审。
- 覆盖率：工具在低于阈值（常见约 80%）时失败并发布趋势；检查清单目标 >90% 单元覆盖率。
- 可观测性：日志、指标、追踪三支柱；跨服务传播关联 ID；记录活动开始/完成与启动配置。
- 文档：README、上手文档、提交信息、PR 描述、代码注释、REST API 文档都要维护；决策记录日期。
- 基础设施即代码：配置、密钥、RBAC、告警都走 IaC 流水线；门户只读。

## 单元测试最佳实践

- 用 Arrange-Act-Assert 组织测试；一个测试只验证一个行为。
- 测试名描述「被测方法 + 场景 + 预期」。
- 测试相互隔离，不依赖执行顺序、共享状态、真实网络或系统时间。
- 不给测试写复杂逻辑（循环、条件）；需要逻辑说明测试设计有问题。
- 覆盖率是参考不是目标；优先覆盖关键路径与边界。

## 落地自检

- [ ] C# 命名与布局符合 Official C# Conventions（Pascal/camel、Allman、4 空格）。
- [ ] 异常、可空性、`using`、`Async` 后缀处理正确。
- [ ] REST 接口有 `api-version`、稳定错误体、幂等设计、`nextLink` 分页。
- [ ] TypeScript 代码遵守该仓库/eslint 配置；引用 MS 指南时注明其适用范围。
- [ ] 每个 PR 有测试、CI 通过、至少一名（团队政策两名）评审者。
- [ ] 日志带关联 ID，敏感信息不落日志。
