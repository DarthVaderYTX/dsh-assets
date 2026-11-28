# Flow Strict | Flow

> 来源：[https://flow.org/en/docs/strict/](https://flow.org/en/docs/strict/)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 29057 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# Flow Strict

You can enable stronger safety guarantees in Flow (such as banning `any` types and requiring all dependencies to be typed) by adding **@flow strict** to your files.

### Overview​

Flow was designed for easy adoption, so it allows you opt-out of type checking in certain situations, permitting unsafe behaviors. But since many codebases now have a high adoption of Flow types, this trade-off can be flipped. You can use *Flow Strict* to disallow previously-allowed unsafe patterns. This gives you improved safety guarantees that catch more bugs and make refactoring easier. And you can implement these stronger guarantees incrementally, on a file-by-file basis.

### Features​

Enabling Flow Strict for a file means that several previously-allowed patterns will now trigger a Flow error. Each disallowed pattern has a corresponding [Flow Lint](/en/docs/linting/) rule which triggers the error. The list of rules enabled for `@flow strict` is configured in each `.flowconfig`. Here are the recommended rules:

- [nonstrict-import](/en/docs/linting/rule-reference/#toc-nonstrict-import): Triggers an error when importing from a module which is not also `@flow strict`. This is very important, because it means that when a file is marked as strict, all of its dependencies are strict as well.
- [unclear-type](/en/docs/linting/rule-reference/#toc-unclear-type): Triggers an error when using `any` in a type annotation.
- [untyped-import](/en/docs/linting/rule-reference/#toc-untyped-import): Triggers an error when importing from an untyped module.
- [unsafe-getters-setters](/en/docs/linting/rule-reference/#toc-unsafe-getters-setters): Triggers an error when using getters and setters, which can be unsafe.
- [sketchy-null](/en/docs/linting/rule-reference/#toc-sketchy-null): Triggers an error when doing an existence check on a value that could be null/undefined or falsey.

For a full list of available lint rules, see the [Lint Rule Reference](/en/docs/linting/rule-reference/).

Additionally, note that function parameters are considered const (i.e., treated as if they were declared with `const` rather than `let`). This feature is not yet configurable in Flow Strict; it is always on.

### Enabling Flow Strict in a .flowconfig​

Flow Strict is configured in each `.flowconfig`. To enable:

1. Add a `[strict]` section to the `.flowconfig`.
2. List the lint rules to enable . These are strongly recommended:

```
[strict]nonstrict-importunclear-typeunsafe-getters-settersuntyped-import
```

Also recommended, but optional as it may be too noisy in some codebases:
`sketchy-null`

We recommend you enable all your desired rules from the beginning, then adopt Flow Strict file-by-file. This works better than enabling a single rule, adding `@flow strict` to many files, and then adding more rules to the config.

### Adoption​

Add `@flow strict` to a file and fix all errors that appear. Because Flow Strict requires dependencies to also be strict (if the `nonstrict-import` rule is enabled), start at the leaves of the dependency tree and work up from there. Do not add `$FlowFixMe` to suppress the new errors as they appear; just add `@flow strict` once all issues have been resolved. Since the most common reasons for using `$FlowFixMe` stem from reliance on untyped dependencies or behavior, future issues should be greatly reduced once Flow Strict is enabled.

Be liberal with enabling Flow Strict. Unlike adding or removing `@flow`, adding or removing `@flow strict` (by itself) does not change Flow coverage. It only prevents or allows certain new unsafe behavior from being added in the future. Even if in the future Flow Strict has to be disabled for the file, at least unsafe behavior was prevented from being added in the meantime.

Library definitions are considered strict (as they can be included in many different projects with contradicting strict configurations).

### Strict Local​

If you enable the `nonstrict-import` rule in your Flow Strict configuration (recommended), then all dependencies of a strict file must also be strict. In a large existing codebase, `@flow strict-local` lets you check a file before all its dependencies are strict.

`@flow strict-local` is the same as `@flow strict`, except it does not require its dependencies to also be strict (i.e. it is "locally" strict). It does not have a separate configuration: it uses the same configuration as Flow Strict, just without the `nonstrict-import` rule.

Once all the dependencies of a `@flow strict-local` file are strict, the file can be upgraded to a `@flow strict` file. A `@flow strict` file cannot depend on a `@flow strict-local` file as this would break the `nonstrict-import` rule.

### What's Ahead​

Eventually, some features of Flow Strict could become the default behavior of Flow, if those features prove successful and achieve widespread adoption.

## See Also​

- [Linting](/en/docs/linting/) — Flow's linting framework for catching additional issues
- [Lint Rule Reference](/en/docs/linting/rule-reference/) — all lint rules, many of which are enforced by strict mode

Edit this page
Last updated on **Nov 21, 2026**
