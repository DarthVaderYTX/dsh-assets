# Tools | Hack & HHVM Documentation

> 来源：[https://docs.hhvm.com/hack/getting-started/tools/](https://docs.hhvm.com/hack/getting-started/tools/)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 31600 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# Tools

The core tools are:

- `hh_client`: this is the command line interface for Hack's static analysis; it
is needed to verify that a project is valid Hack, and is used to find errors
in your programs
- `hhvm`: this is used to execute your Hack code, and can either be used for
CLI (e.g. `hhvm foo.hack`) or as a server, and has
[its own documentation](/hhvm-overview/)

### Editors and IDEs​

We primarily recommend using [Visual Studio Code](https://code.visualstudio.com) with the
[VSCode-Hack](https://github.com/slackhq/vscode-hack/) extension; this provides IDE features such as syntax
highlighting, go-to-definition, and inline display of Hack errors.

For Vim users, [vim-hack](https://github.com/hhvm/vim-hack) provides syntax highlighting and language detection,
and the [ALE](https://github.com/w0rp/ale) project provides enhanced support for Hack.

[hack-mode](https://github.com/hhvm/hack-mode) provides a major mode for Emacs users.

If you use a different editor or IDE with [LSP support](https://microsoft.github.io/language-server-protocol/), configure it
to use `hh_client lsp`; if you use [HHAST](https://github.com/hhvm/hhast), you might want to configure it to
use `vendor/bin/hhast-lint --mode lsp`, but keep in mind this will lead to your
editor automatically executing code from a project when that project is opened;
for this reason, the ALE integration has HHAST disabled by default, and Visual
Studio Code prompts to confirm before executing it.

### Dependency Management​

Hack dependencies are currently managed using [Composer](https://getcomposer.org), which must be executed
with PHP. Composer can be thought of as an equivalent to `npm` or `yarn`.

### Other Common Tools​

- `hackfmt` is a CLI code formatter included with HHVM and Hack, and is also
used by the various editor and IDE integrations
- [HHAST](https://github.com/hhvm/hhast) provides code style linting, and the ability to automatically
modify code to adapt to some changes in the language or libraries
- [hacktest](https://github.com/hhvm/hacktest) and [fbexpect](https://github.com/hhvm/fbexpect) are commonly used together for writing unit tests

Edit this page
