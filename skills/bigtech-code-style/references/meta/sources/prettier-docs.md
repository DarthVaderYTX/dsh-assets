# What is Prettier? · Prettier

> 来源：[https://prettier.io/docs/](https://prettier.io/docs/)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 29365 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# What is Prettier?

Prettier is an opinionated code formatter with support for:

- JavaScript (including experimental features)
- [JSX](https://facebook.github.io/jsx/)
- [Angular](https://angular.dev/)
- [Vue](https://vuejs.org/)
- [Flow](https://flow.org/)
- [TypeScript](https://www.typescriptlang.org/)
- CSS, [Less](https://lesscss.org/), and [SCSS](https://sass-lang.com)
- [HTML](https://en.wikipedia.org/wiki/HTML)
- [Ember/Handlebars](https://emberjs.com/)
- [JSON](https://json.org/)
- [GraphQL](https://graphql.org/)
- [Markdown](https://commonmark.org/), including [GFM](https://github.github.com/gfm/) and [MDX v1](https://mdxjs.com/)
- [YAML](https://yaml.org/)
- [Lightning Web Components (LWC)](https://developer.salesforce.com/developer-centers/lightning-web-components)
- [MJML](https://mjml.io/)

It removes all original styling* and ensures that all outputted code conforms to a consistent style. (See this [blog post](https://jlongster.com/A-Prettier-Formatter))

Prettier takes your code and reprints it from scratch by taking the line length into account.

For example, take the following code:

```
foo(arg1, arg2, arg3, arg4);
```

It fits in a single line so it’s going to stay as is. However, we've all run into this situation:

```
foo(reallyLongArg(), omgSoManyParameters(), IShouldRefactorThis(), isThereSeriouslyAnotherOne());
```

Suddenly our previous format for calling function breaks down because this is too long. Prettier is going to do the painstaking work of reprinting it like that for you:

```
foo(  reallyLongArg(),  omgSoManyParameters(),  IShouldRefactorThis(),  isThereSeriouslyAnotherOne(),);
```

Prettier enforces a consistent code **style** (i.e. code formatting that won’t affect the AST) across your entire codebase because it disregards the original styling* by parsing it away and re-printing the parsed AST with its own rules that take the maximum line length into account, wrapping code when necessary.

If you want to learn more, these two conference talks are great introductions:

#### Footnotes​

* *Well actually, some original styling is preserved when practical—see empty lines and multi-line objects.*

Edit this page
