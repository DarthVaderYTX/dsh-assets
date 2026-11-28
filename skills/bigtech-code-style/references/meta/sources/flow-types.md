# Type Annotations | Flow

> 来源：[https://flow.org/en/docs/types/](https://flow.org/en/docs/types/)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 43000 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# Type Annotations

Adding type annotations is an important part of your interaction with Flow.

Flow can infer types for most of your code without explicit annotations.
For example, you don't have to produce annotations for common patterns like `Array.map`:

```
1["foo", "bar"].map(s => ( // s is inferred to have type string2  s.length3));
```

Try

Still, there are places where you'll want to add types.

Imagine the following `concat` function for concatenating two strings together.

```
1function concat(a, b) { // Errormissing-local-annotMissing an annotation on this parameter.missing-local-annotMissing an annotation on this parameter.2  return a + b;3}
```

Try

You need to add annotations on parameters of `concat`, so that Flow can type
check its body. Now you'll get a warning from Flow if you are calling this
function with unexpected types.

```
1function concat(a: string, b: string) {2  return a + b;3}4
5concat("A", "B"); // Works!6concat(1, 2); // Error!incompatible-typeCannot call concat with 1 bound to a because 1 [1] is incompatible with string [2].incompatible-typeCannot call concat with 2 bound to b because 2 [1] is incompatible with string [2].
```

Try

This guide will teach you the syntax and semantics of all the different types
you can have in Flow.

## See Also​

- [Primitive Types](/en/docs/types/primitives/) — `boolean`, `string`, `number`, `null`, `undefined`, `symbol`, `bigint`
- [Literal Types](/en/docs/types/literals/) — using specific values like `2` or `"foo"` as types
- [Template Literal Types](/en/docs/types/template-literal-types/) — constructing string types and matching string patterns
- [Objects](/en/docs/types/objects/) — typing the shape of JavaScript objects
- [Arrays](/en/docs/types/arrays/) — variable-length lists of values
- [Tuples](/en/docs/types/tuples/) — fixed-length lists with per-element types
- [Functions](/en/docs/types/functions/) — parameters, return types, and generics
- [Classes](/en/docs/types/classes/) — class fields, methods, and nominal typing
- [Interfaces](/en/docs/types/interfaces/) — structural typing for classes and objects
- [Unions](/en/docs/types/unions/) — values that are one of several types (`A | B`)
- [Intersections](/en/docs/types/intersections/) — values that are all of several types (`A & B`)
- [Generics](/en/docs/types/generics/) — parameterized types for reusable, type-safe code
- [Type Aliases](/en/docs/types/aliases/) — giving names to complex types
- [Opaque Type Aliases](/en/docs/types/opaque-types/) — type aliases that hide their underlying type
- [Type Casts and Satisfies Expressions](/en/docs/types/casting/#toc-as-vs-satisfies) — expose a target type with `as` or keep the inferred type with [satisfies](/en/docs/types/casting/#toc-satisfies)
- [Utility Types](/en/docs/types/utilities/) — built-in type transformations like `Partial`, `Readonly`, `keyof`

Edit this page
Last updated on **Nov 26, 2026**
