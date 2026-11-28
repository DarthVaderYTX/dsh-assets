# Google 官方规范

只引用 Google 自家域名：`google.github.io`（Style Guides、Engineering Practices、GoogleTest）与 `abseil.io`（Google 官方站点上的 *Software Engineering at Google*）。每条规则都能在对应链接里找到出处；规范更新频繁，引用前先核对当前版本。

## 来源

| 主题 | 链接 |
| --- | --- |
| C++ Style Guide | https://google.github.io/styleguide/cppguide.html |
| Java Style Guide | https://google.github.io/styleguide/javaguide.html |
| Python Style Guide | https://google.github.io/styleguide/pyguide.html |
| Go Style Guide | https://google.github.io/styleguide/go/guide · https://google.github.io/styleguide/go/decisions |
| JavaScript Style Guide | https://google.github.io/styleguide/jsguide.html |
| TypeScript Style Guide | https://google.github.io/styleguide/tsguide.html |
| Shell Style Guide | https://google.github.io/styleguide/shellguide.html |
| HTML/CSS Style Guide | https://google.github.io/styleguide/htmlcssguide.html |
| Markdown（docguide） | https://google.github.io/styleguide/docguide/style.html |
| Engineering Practices（代码评审） | https://google.github.io/eng-practices/ |
| 测试（SWE at Google 第 11 章） | https://abseil.io/resources/swe-book/html/ch11.html |
| GoogleTest 命名 | https://google.github.io/googletest/reference/testing.html |

## 通用

- 命名按语言各自规则；同一文件内保持一种风格。
- 注释解释「为什么」和约束，不逐行复述代码；公开接口必须有文档注释。
- 格式问题交给 `clang-format` / `gofmt` / `black` / `prettier` 一类工具，不靠人工争论。
- 每个变更自带测试；测试要能在实现被破坏时失败。

## C++

- 行宽最多 **80** 字符；只用空格，缩进 **2** 个空格；不用 tab。
- 类型与函数 `PascalCase`，变量 `snake_case`，类成员变量末尾加 `_`，常量 `kPascalCase`。
- `#include` 顺序：对应头文件 → C 系统头 → C++ 标准库 → 其他库 → 本项目头文件；组间空行，组内字母序。
- 注释风格 `//` 或 `/* */` 在一个文件内保持一致；不直观的类、函数写注释说明用途与用法。
- 异常：Google C++ 规范明确**不使用 C++ 异常**；错误通过状态码/返回值传递。

```cpp
// good
class UrlTableTester {
 public:
  explicit UrlTableTester(const std::string& name) : name_(name) {}
  void AddUrl(const std::string& url);

 private:
  std::string name_;
};
constexpr int kMaxRetries = 3;
```

## Java

- 列宽 **100**；块缩进 **2** 空格；续行至少 +4 空格。
- 大括号 K&R 风格；`if/else/for/do/while` 即使只有一条语句也加括号。
- 类 `UpperCamelCase`，方法与字段 `lowerCamelCase`，常量 `UPPER_SNAKE_CASE`，包名全小写无下划线；测试类 `FooTest`。
- 导入：静态导入一组、空行、非静态导入一组；组内 ASCII 排序；不换行。
- 每个可见类/成员写 Javadoc，摘要句首字母大写；标签顺序 `@param`、`@return`、`@throws`。
- 能用 `@Override` 就写；捕获到的异常不能静默忽略（空 catch 必须说明原因）。

```java
/**
 * Returns the user's display name.
 *
 * @param userId stable user identifier
 * @return display name, never null
 * @throws UserNotFoundException if the id is unknown
 */
String displayName(String userId) { ... }
```

## Python

- 行宽最多 **80**；缩进 **4** 空格，禁止 tab。
- 命名：模块 `module_name`、类 `ClassName`、函数 `function_name`、全局常量 `GLOBAL_CONSTANT_NAME`。
- 导入放在文件顶部，每行一个，按 future → 标准库 → 第三方 → 本仓库 分组，组内字典序。
- 公开或非平凡函数写 `"""` docstring，摘要不超过 80 字符并以句号结尾；参数/返回值/异常用 `Args:`、`Returns:`、`Raises:`。
- 禁止裸 `except:`；`except Exception` 只在重新抛出或隔离边界时使用，并说明原因；异常类名以 `Error` 结尾。
- 用 pylint（Google 的 pylintrc）做静态检查，Black/Pyink 做格式化。

```python
def fetch_orders(user_id: str, limit: int = 50) -> list[Order]:
    """Fetches recent orders for a user.

    Args:
        user_id: Stable user identifier.
        limit: Maximum number of orders to return.

    Returns:
        Orders sorted by creation time, newest first.

    Raises:
        UserNotFoundError: If the user does not exist.
    """
```

## Go

- 每个文件必须与 `gofmt` 输出一致（提交前由 presubmit 强制）。
- 导出名用 `MixedCaps`，未导出用 `mixedCaps`；除测试名、生成代码与底层代码外不用下划线。
- 不设固定行宽：逻辑太长就重构，不在缩进变化处或长字符串中间断行。
- 所有导出的顶层名字都要有文档注释，完整句子、以名字开头。
- 错误字符串小写、结尾不加标点；每个错误要么处理要么返回；忽略错误必须注释说明；错误包装用 `%w`。
- 导入分组：标准库、其他、protobuf、副作用导入；`_` 导入只用于 `main` 或测试。

```go
// FetchOrder returns the order with the given ID.
// It returns ErrNotFound when no order matches.
func FetchOrder(ctx context.Context, id string) (*Order, error) {
	if id == "" {
		return nil, fmt.Errorf("fetch order: empty id")
	}
	...
}
```

## JavaScript

- 只用 `const`/`let`，默认 `const`，禁止 `var`。
- 列宽最多 **80**；缩进 **2** 空格；必须写分号，不依赖 ASI。
- 类 `UpperCamelCase`，方法与变量 `lowerCamelCase`，常量 `CONSTANT_CASE`；测试名 `test<Method>_<state>_<outcome>`。
- 导入不换行；相对导入带 `.js` 扩展名；别名 `lowerCamelCase`。
- JSDoc 标注 `@param` / `@return` 类型；类与接口必须有说明。
- 推荐 `clang-format` 统一格式。

## TypeScript

- 只用模块：禁止 `namespace`（第三方互操作除外）、禁止 `require`，用 ES6 import/export。
- 必须写分号，不依赖 ASI；文件编码 UTF-8；单引号字符串。
- 类型 `UpperCamelCase`，变量/函数 `lowerCamelCase`，常量 `CONSTANT_CASE`；不用 `I` 前缀、不用 `_` 隐私后缀、不用 `#private`。
- 优先 `unknown` 而不是 `any`；不需要重新赋值的属性标 `readonly`；用 `interface` 而非类型字面量别名表达对象形状。
- 只用命名导出，不用 `export default`；导出面尽量小。
- 函数约 **40** 行以内；测试名 `testX_whenY_doesZ()`；所有顶层导出写 JSDoc。

```ts
// good
export interface OrderRow {
  readonly id: string;
  readonly total: number;
}

export function formatTotal(row: OrderRow): string {
  return `${row.total.toFixed(2)} CNY`;
}
```

## Shell

- 只用 Bash，可执行脚本首行 `#!/bin/bash`。
- 缩进 **2** 空格，禁止 tab；行宽最多 **80**。
- 函数与局部变量小写加下划线，常量/环境变量大写；函数内变量用 `local`。
- 所有变量与命令替换加引号；参数转发用 `"$@"`；用 `$(command)` 不用反引号；用 `[[ ]]` 不用 `[ ]`。
- 错误输出到 STDERR；检查返回值；用 ShellCheck 做静态检查。

## HTML / CSS

- 缩进 **2** 空格；标签与属性小写；属性值用双引号。
- 一行一个属性；语义化标签优先；不为样式使用废弃标签。
- CSS 选择器尽量简短；避免 `!important`；按组件加前缀避免全局污染。

## 代码评审（Engineering Practices）

- 作者：一个变更只做一件事，**小变更**优先（约 100 行，1000 行通常过大）；重构单独提交。
- 作者：变更描述首行是简短的祈使句完整句子，空行后写「做了什么、为什么、影响与验证」；「Fix bug」不合格。
- 作者：测试与实现放在同一个变更里；Google 的默认预期是「所有变更都要有测试」。
- 评审者：一个工作日内必须响应；可以分多轮、当天完成。
- 评审者：变更只要**明确提升代码健康度**就批准，不要求完美；非必须的润色标 `Nit:`。
- 评审者：逐行看，检查设计、功能、复杂度、测试、命名、注释、风格、一致性、文档。

## 测试

- 测试尺寸：**小**（单进程，不碰网络/磁盘/sleep）、**中**（多进程、localhost）、**大**（多机）；能用小测试就不用大测试。
- 覆盖率没有强制百分比；把 80% 当目标容易变成天花板，Google 建议只统计小测试的覆盖率。
- 测试必须能在实现被破坏时失败；测试与实现同批提交。
- 命名：Java `FooTest` + `transferMoney_deductsFromSource`；JS/TS `testPop_emptyStack_throws` / `testX_whenY_doesZ`；GoogleTest `TEST(TestSuiteName, TestName)`，只用合法标识符、不加下划线。

## 落地自检

- [ ] 命名与所选语言规则一致（大小写、后缀、前缀）。
- [ ] 行宽、缩进、括号风格符合该语言数值；格式由工具生成。
- [ ] 导入分组与排序正确，没有未使用导入。
- [ ] 公开接口有文档注释，参数/返回/异常写全。
- [ ] 没有裸 `except`、空 catch、被忽略的 error；错误信息可诊断。
- [ ] 测试与实现同批，命名描述场景与预期，能失败。
- [ ] 变更小、描述清楚、评审意见有回复。
