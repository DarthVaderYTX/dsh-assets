# Meta（Facebook）官方规范

**先明确边界：Meta 没有公开的公司级通用编码规范，也没有公开的命名/架构手册。** 公开可核查的只有项目级官方规范：React、React Native、Jest、Flow、Hack，以及 Meta 开源项目的贡献流程。写代码时按项目选对应规范，不要把 React 的规则外推到后端或普通 Node 服务，也不要用社区文章冒充 Meta 规范。

本文引用的官方页面已全部下载到 [sources/INDEX.md](sources/INDEX.md)，断网也能查阅；条文以上线版本为准。

## 来源

| 主题 | 链接 | 性质 |
| --- | --- | --- |
| React 规则总览（Rules of React） | https://react.dev/reference/rules | 官方文档 |
| Hooks 规则 | https://react.dev/reference/rules/rules-of-hooks | 官方文档 |
| 组件与 Hooks 必须纯粹 | https://react.dev/reference/rules/components-and-hooks-must-be-pure | 官方文档 |
| React ESLint 插件规则列表 | https://react.dev/reference/eslint-plugin-react-hooks | 官方文档 |
| React 仓库 Prettier 配置 | https://github.com/facebook/react/blob/main/.prettierrc.js | 官方仓库 |
| React 贡献指南 | https://github.com/facebook/react/blob/main/CONTRIBUTING.md | 官方仓库 |
| React Native 代码风格 | https://reactnative.dev/contributing/how-to-contribute-code | 官方文档 |
| React Native PR 管理 | https://reactnative.dev/contributing/managing-pull-requests | 官方文档 |
| Jest 入门与测试组织 | https://jestjs.io/docs/getting-started | 官方文档 |
| Jest 快照测试最佳实践 | https://jestjs.io/docs/snapshot-testing | 官方文档 |
| Jest 代码约定 | https://github.com/jestjs/jest/blob/main/CONTRIBUTING.md | 官方仓库 |
| Flow 类型注解 | https://flow.org/en/docs/types/ | 官方文档 |
| Flow lint 配置 | https://flow.org/en/docs/linting/ | 官方文档 |
| Flow strict | https://flow.org/en/docs/strict/ | 官方文档 |
| Hack 工具链（hackfmt / HHAST / hh_client） | https://docs.hhvm.com/hack/getting-started/tools/ | 官方文档 |
| Hack 命名基础 | https://docs.hhvm.com/hack/source-code-fundamentals/names/ | 官方文档 |
| Prettier | https://prettier.io/docs/ | 官方项目（Meta 发起） |

## React / JavaScript

- 格式与 lint 以仓库配置为准：React 仓库用 Prettier + ESLint（`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-jest`）。
- React 仓库的 Prettier 配置（直接抄或对齐）：`printWidth: 80`、`singleQuote: true`、`bracketSpacing: false`、`arrowParens: "avoid"`、`trailingComma: "es5"`（TS/ES next 为 `"all"`）。
- 组件名必须以大写字母开头；组件定义在模块顶层，**不要在一个组件内部定义另一个组件**。
- Hooks 只能在顶层调用：不能放在条件、循环、嵌套函数、`try` 块里，也不能在提前 return 之后调用。
- 只能在 React 组件或自定义 Hook（`use*`）里调用 Hooks。
- 组件与 Hook 必须是纯函数：渲染期间不做副作用、不修改外部状态；不要修改 props、state、Hook 参数/返回值或已传给 JSX 的值。
- 更新 state 用 `useState` 的 setter，不要直接赋值；用 Strict Mode + `eslint-plugin-react-hooks` 在开发期暴露违规。
- 依赖数组必须完整（`exhaustive-deps`），不要用注释关闭规则来掩盖问题。

```jsx
// good: 纯组件，顶层组件，hooks 顶层调用
export default function OrderList({orders}) {
  const [selected, setSelected] = useState(null);

return (
    <ul>
      {orders.map((order) => (
        <li key={order.id} onClick={() => setSelected(order.id)}>
          {order.title}
        </li>
      ))}
    </ul>
  );
}
```

## React Native

- 代码风格与 React 相同：Prettier + linter；提交前跑 `yarn lint` / `yarn test` / `yarn flow`。
- Java 代码列宽 **100**；Objective-C 按仓库既有风格。
- 可访问性：可交互元素设置 `accessibilityLabel`、恰当的 `accessibilityRole`；动作不直观时给 `accessibilityHint`；用 VoiceOver / TalkBack 实测。

## 测试（Jest）

- 测试文件命名 `*.test.js`，或放在 `__tests__` 目录。
- 用 `describe` 分组、`it`/`test` 描述行为、`expect` + 具体 matcher 断言。
- 测试必须确定性：时间、随机数、网络都 mock；不依赖执行顺序。
- 快照是代码：必须提交并在评审中查看；不要因为失败就无脑 `-u` 重生成；CI 上禁止自动写快照。
- Jest 仓库约定：单元测试放 `__tests__`，集成测试放 `e2e`；每个功能/修复带 changelog 条目。
- 不要用快照代替行为断言；快照只用于稳定、可读的输出。

## Flow

- 函数参数要有类型注解；Flow 会对缺失的局部注解报错。
- React 代码优先用 `component` / `hook` 语法，旧函数/类写法视为遗留。
- 需要严格检查的文件加 `@flow strict`：禁止 `any`、未类型化导入、非 strict 导入。
- 采用「叶子优先」逐步开启 strict；不要用新的 `$FlowFixMe` 压制错误。
- lint 严重级别配置在 `.flowconfig` 的 `[lints]`；局部覆盖用 `flowlint` 注释并说明原因。

## Hack

- 标识符以字母或下划线开头；局部变量、参数、属性需要 `$` 前缀；`$_` 表示不使用的占位符；`__` 前缀保留。
- 工具链：`hh_client` 类型检查、`hackfmt` 格式化、HHAST 做 lint/风格检查、`hacktest`/`fbexpect` 跑测试。
- Meta 没有公开 Hack 的完整命名与格式规则文本，以上为官方文档能核实的部分；其余按项目仓库的 `.hhconfig` 与 HHAST 规则。

## 工程实践（官方可见部分）

- PR 必须有摘要、changelog 条目与可复现的测试计划；CI 全绿才能合并；评审通过 GitHub review 完成。
- React Native 的 GitHub 仓库是 Meta monorepo 的镜像：PR 会被导入内部 diff，通过 land-blocking 测试后再同步回来。
- React 发布：每次 push 都跑 CI；canary/experimental 按 cron 在工作日发布；stable 从 canary 手动晋级；回滚用 `releases/**` 分支。
- Meta 开源项目统一要求 CLA 与 Code of Conduct；各项目贡献细节不同，以项目文档为准。

## 不要声称的（未公开）

- 没有 Meta 全公司统一的命名规范、目录结构、架构手册或覆盖率阈值。
- 没有官方 React PropTypes 政策、状态管理（Redux/Recoil）强制要求、文件布局约定。
- `engineering.fb.com` 是技术博客，不是规范文档，不能作为「Meta 规范」引用。

## 落地自检

- [ ] 项目有 Prettier/ESLint 配置时直接运行，不手改格式。
- [ ] 组件在顶层定义、名称大写；Hooks 只在顶层调用；渲染保持纯。
- [ ] 不直接改 props/state；依赖数组完整。
- [ ] 测试确定性；快照已提交并在评审中查看。
- [ ] 引用 Meta 规范时写明是哪个项目（React / RN / Jest / Flow / Hack），不写成「Meta 公司规范」。
