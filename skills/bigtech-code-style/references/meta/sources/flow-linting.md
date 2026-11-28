# Linting Overview | Flow

> 来源：[https://flow.org/en/docs/linting/](https://flow.org/en/docs/linting/)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 37884 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# Linting Overview

Flow contains a linting framework that can tell you about more than just type errors. This framework is highly configurable in order to show you the information you want and hide the information you don't.

### Configuring Lints in the `.flowconfig`​

Lint settings can be specified in the `[lints]` section of the `.flowconfig` as a list of `rule=severity` pairs. These settings apply globally to the entire project.

```
[lints]all=warnunused-promise=errorsketchy-null-bool=off
```

### Configuring Lints from the CLI​

Lint settings can be specified using the `--lints` flag of a Flow server command as a comma-delimited list of `rule=severity` pairs. These settings apply globally to the entire project.

```
flow start --lints "all=warn, unused-promise=error, sketchy-null-bool=off"
```

### Configuring Lints with Comments​

Lint settings can be specified inside a file using `flowlint` comments. These
settings apply to a region of a file, or a single line, or part of a line. For
more details see [Flowlint Comments](/en/docs/linting/flowlint-comments/).

```
1// flowlint sketchy-null:error2const x: ?number = 0;3
4if (x) {} // Errorsketchy-null-numberSketchy null check on number [1] which is potentially 0. Perhaps you meant to check for null or undefined [2]?5
6// flowlint-next-line sketchy-null:off7if (x) {} // No Error8
9if (x) {} /* flowlint-line sketchy-null:off */ // No Error10
11// flowlint sketchy-null:off12if (x) {} // No Error13if (x) {} // No Error
```

Try

### Lint Settings Precedence​

Lint settings in `flowlint` comments have the highest priority, followed by lint rules in the `--lints` flag, followed by the `.flowconfig`.
This order allows you to use `flowlint` comments for fine-grained linting control, the `--lints` flag for trying out new lint settings, and the `.flowconfig` for stable project-wide settings.

Within the `--lints` flag and the `.flowconfig`, rules lower down override rules higher up, allowing you to write things like

```
[lints]# warn on all sketchy-null checkssketchy-null=warn# ... except for booleanssketchy-null-bool=off
```

Flow reports redundant or overwritten lint rules and unused `flowlint` suppressions.

### Severity Levels and Meanings​

**off:**
The lint is ignored. Setting a lint to `off` is similar to suppressing a type error with a suppression comment, except with much more granularity.

**warn:**
Warnings are a severity level introduced by the linting framework. They are treated differently than errors in a couple of ways:

- Warnings don't affect the exit code of Flow. If Flow finds warnings but no errors, it still returns 0.
- Warnings aren't shown on the CLI by default, to avoid spew. CLI warnings can be
enabled by passing the `--include-warnings` flag to the Flow server or the
Flow client, or by setting `include_warnings=true` in the `.flowconfig`.
This is good for smaller projects that want to see all project warnings at once.

**error:**
Lints with severity `error` are treated exactly the same as any other Flow error.

## See Also​

- [.flowconfig [lints]](/en/docs/config/lints/) — configuring lint severities in your `.flowconfig`
- [Flow Strict](/en/docs/strict/) — enabling stricter type checking with `@flow strict`
- [ESLint](/en/docs/tools/eslint/) — using ESLint alongside Flow for additional linting

Edit this page
Last updated on **Nov 21, 2026**
