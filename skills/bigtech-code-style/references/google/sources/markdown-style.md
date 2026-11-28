# Markdown style guide | Google Style Guides

> 来源：[https://google.github.io/styleguide/docguide/style.html](https://google.github.io/styleguide/docguide/style.html)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 55831 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

# [Google Style Guides](https://google.github.io/styleguide/)

# Markdown style guide

Much of what makes Markdown refreshing is the ability to write plain text and
get great formatted output as a result. To keep the slate clean for the next
author, your Markdown should be simple and consistent with the whole corpus
wherever possible.

We seek to balance three goals:

1. *Source text is readable and portable.*
2. *The Markdown corpus is maintainable over time and across teams.*
3. *The syntax is simple and easy to remember.*

mdformat off

- Markdown style guide
 Minimum viable documentation
 Better is better than best
 Capitalization
 Document layout
 Table of contents (TOCs)
 Use a [TOC] directive
 Place the [TOC] directive after the introduction

 80-character line limit
 Exceptions

 Trailing whitespace
 Headings
 ATX-style headings
 Use unique, complete names for headings
 Add spacing to headings
 Set heading targets to avoid breaking deep links
 Use a single H1 heading
 Capitalization of titles and headers

 Lists
 Use real numbering, even for long lists
 Nested list spacing

 Code
 Inline
 Use code span for escaping
 Code blocks
 Declare the language
 Use fenced code blocks instead of indented code blocks
 Escape newlines
 Nest code blocks within lists

 Links
 Avoid relative paths unless within the same directory
 Use informative Markdown link titles
 Delete unnecessary parameters
 Use reference links carefully
 Use reference links for long links
 Use reference links to reduce duplication
 Define reference links after their first use

 Images
 Don’t use self-closed iframes
 Use tables wisely
 Strongly prefer Markdown to HTML
 Arrange clauses to make sentences easy to skim
  - Minimum viable documentation
  - Better is better than best
  - Capitalization
  - Document layout
  - Table of contents (TOCs)
 Use a [TOC] directive
 Place the [TOC] directive after the introduction
    - Use a [TOC] directive
    - Place the [TOC] directive after the introduction
  - 80-character line limit
 Exceptions
    - Exceptions
  - Trailing whitespace
  - Headings
 ATX-style headings
 Use unique, complete names for headings
 Add spacing to headings
 Set heading targets to avoid breaking deep links
 Use a single H1 heading
 Capitalization of titles and headers
    - ATX-style headings
    - Use unique, complete names for headings
    - Add spacing to headings
    - Set heading targets to avoid breaking deep links
    - Use a single H1 heading
    - Capitalization of titles and headers
  - Lists
 Use real numbering, even for long lists
 Nested list spacing
    - Use real numbering, even for long lists
    - Nested list spacing
  - Code
 Inline
 Use code span for escaping
 Code blocks
 Declare the language
 Use fenced code blocks instead of indented code blocks
 Escape newlines
 Nest code blocks within lists
    - Inline
    - Use code span for escaping
    - Code blocks
 Declare the language
 Use fenced code blocks instead of indented code blocks
 Escape newlines
 Nest code blocks within lists
      - Declare the language
      - Use fenced code blocks instead of indented code blocks
      - Escape newlines
      - Nest code blocks within lists
  - Links
 Avoid relative paths unless within the same directory
 Use informative Markdown link titles
 Delete unnecessary parameters
 Use reference links carefully
 Use reference links for long links
 Use reference links to reduce duplication
 Define reference links after their first use
    - Avoid relative paths unless within the same directory
    - Use informative Markdown link titles
    - Delete unnecessary parameters
    - Use reference links carefully
 Use reference links for long links
 Use reference links to reduce duplication
 Define reference links after their first use
      - Use reference links for long links
      - Use reference links to reduce duplication
      - Define reference links after their first use
  - Images
  - Don’t use self-closed iframes
  - Use tables wisely
  - Strongly prefer Markdown to HTML
  - Arrange clauses to make sentences easy to skim

mdformat on

## Minimum viable documentation

A small set of fresh and accurate docs is better than a sprawling, loose
assembly of “documentation” in various states of disrepair.

The **Markdown way** encourages engineers to take ownership of their docs and
keep them up to date with the same zeal we keep our tests in good order. Strive
for this.

- Identify what you really need: release docs, API docs, testing guidelines.
- Delete cruft frequently and in small batches.

## Better is better than best

The standards for an internal documentation review are different from the
standards for code reviews. Reviewers should ask for improvements, but in
general, the author should always be able to invoke the “Better/Best Rule.”

Fast iteration is your friend. To get long-term improvement, **authors must stay
productive** when making short-term improvements. Set lower standards for each
CL, so that **more such CLs** can happen.

As a reviewer of a documentation CL:

1. When reasonable, LGTM immediately and trust that comments will be fixed
appropriately.
2. Prefer to suggest an alternative rather than leaving a vague comment.
3. For substantial changes, start your own follow-up CL instead. Especially try
to avoid comments of the form “You should *also*…”.
4. On rare occasions, hold up submission if the CL actually makes the docs
worse. It’s okay to ask the author to revert.

As an author:

1. Avoid wasting cycles with trivial argument. Capitulate early and move on.
2. Cite the Better/Best Rule as often as needed.

## Capitalization

Use the original names of products, tools and binaries, preserving the
capitalization. E.g.:

```
# gShoe style guide

`gShoe` is a dead-simple platform for your feet.
```

and not

```
# GShoe style guide

`GShoe` is a dead-simple platform for your feet.
```

## Document layout

In general, documents benefit from some variation of the following layout:

```
# Document title

Short introduction.

[TOC]

## Topic

Content.

## See also

* https://example.com/more_info
```

1. `# Document title`: The first heading should be a level-one heading, ideally
the same or nearly the same as the filename. The first level-one heading is
used by the server as the page `<title>`.
2. `author`: *Optional*. If you’d like to claim ownership of the document or if
you are very proud of it, add yourself under the title. However, revision
history generally suffices.
3. `Short introduction.` 1–3 sentences providing a high-level overview of the
topic. Imagine yourself as a complete newbie who landed on your “Extending
Foo” doc and doesn’t know the most basic information you take for granted.
“What is Foo? Why would I extend it?”
4. `[TOC]`: See [TOC] documentation.
5. `## Topic`: The rest of your headings should start from level 2.
6. `## See also`: Put miscellaneous links at the bottom for the user who wants
to know more or didn’t find what they needed.

## Table of contents (TOCs)

### Use a `[TOC]` directive

Use a [[TOC] directive](https://gerrit.googlesource.com/gitiles/+/HEAD/Documentation/markdown.md#Table-of-contents) unless all of your content is above the
fold1 on a laptop.

Only use this directive if you use hosting that supports table of contents, such
as Gitiles.

### Place the `[TOC]` directive after the introduction

Place the `[TOC]` directive after your page’s introduction and before the first
H2 heading. For example:

```
# My Page

This is my introduction **before** the TOC.

[TOC]

## My first H2
```

```
# My Page

[TOC]

This is my introduction **after** the TOC where it should not be.

## My first H2
```

`[TOC]` placement matters a lot when screen readers or keyboard controls are
involved.

That’s because `[TOC]` inserts the HTML for the table of contents into the DOM
wherever you’ve included the directive in your Markdown file. If, for example,
you place the directive at the very bottom of your file, screen readers won’t
read it until they get to the end of the document.

## 80-character line limit

Markdown content follows the residual convention of an 80-character line limit.
Why? Because it’s what most of us do for code.

- **Tooling integration**: All our tooling is designed around code, so the
more our documents are formatted according to similar rules, the better
these tools will work. For example, Code Search doesn’t soft wrap.
- **Quality**. The more engineers use their well-worn coding habits when
creating and editing Markdown content, the better the quality. Markdown
takes advantage of the excellent review culture we already have.

### Exceptions

Exceptions to the 80-character rule include:

- Links
- Tables
- Headings
- Code blocks

This means that lines with links are allowed to extend past column 80, along
with any relevant punctuation:

```
*   See the
    [foo docs](https://gerrit.googlesource.com/gitiles/+/HEAD/Documentation/markdown.md)
    and find the logfile.
```

However, note that text before and after the link gets wrapped.

Tables may also run long. However, there are
best practices for creating short, readable tables.

```
Foo                                                                           | Bar | Baz
----------------------------------------------------------------------------- | --- | ---
Somehow-unavoidable-long-cell-filled-with-content-that-simply-refuses-to-wrap | Foo | Bar
```

## Trailing whitespace

Don’t use trailing whitespace. Use a trailing backslash to break lines.

Both instances of `<br />' use a non-breaking space to avoid wrapping.

The [CommonMark spec](https://spec.commonmark.org/0.30/#hard-line-breaks)
decrees that two spaces at the end of a line should insert a `<br />` tag.
However, many directories have a presubmit check for trailing whitespace, and
many IDEs will clean it up anyway.

Use a trailing backslash, sparingly:

```
For some reason I just really want a break here,\
though it's probably not necessary.
```

Best practice is to avoid the need for a `<br />` altogether. A pair of newlines
will create a paragraph tag; get used to that.

## Headings

### ATX-style headings

```
# Heading 1

## Heading 2
```

Headings with `=` or `-` underlines can be annoying to maintain and don’t fit
with the rest of the heading syntax. An editor has to ask: Does `---` mean H1 or
H2?

```
Heading - do you remember what level?
---------
```

### Use unique, complete names for headings

Use unique and fully descriptive names for each heading, even for sub-sections.
Since link anchors are constructed from headings, this helps ensure that the
automatically-constructed anchor links are intuitive and clear.

For example, instead of:

```
## Foo
### Summary
### Example
## Bar
### Summary
### Example
```

prefer:

```
## Foo
### Foo summary
### Foo example
## Bar
### Bar summary
### Bar example
```

### Add spacing to headings

Prefer spacing after `#` and newlines before and after:

```
...text before.

## Heading 2

Text after...
```

Lack of spacing makes it a little harder to read in source:

```
...text before.

##Heading 2
Text after...
```

### Set heading targets to avoid breaking deep links

People will create deep links to specific points in your doc, *even if you don’t
do that yourself.* To prevent changes you make to your doc from breaking
external links, you should always use explicit targets for headings in your doc.

Do this even where the implicit target is the same as the heading, so links to
the target won’t break when the heading is edited. Also, when headings are long
or contain punctuation marks, it can make the URL easier to read.

```
<a id="topic"></a>

## Topic

<a id="explicit-subtopic"></a>

### Sub-Topic

<a id="short-subtopic"></a>

### Sub-Topic With A Super Long Name - One That Makes An Ugly Target, Maybe?
```

### Use a single H1 heading

Use one H1 heading as the title of your document. Subsequent headings should be
H2 or deeper. See Document layout for more information.

Some themes hide any H1 headings after the first.

### Capitalization of titles and headers

Follow the guidance for
[capitalization](https://developers.google.com/style/capitalization#capitalization-in-titles-and-headings)
in the
[Google Developer Documentation Style Guide](https://developers.google.com/style/).

## Lists

### Use real numbering, even for long lists

Use fully numbered lists, because it’s nicer to read in source:

```
1.  Foo
2.  Bar
    1.  Foofoo
    2.  Barbar
3.  Baz
```

Historically, we recommended lazy numbering to reduce
the burden of keeping numbers up to date. This is no longer applicable now that
the auto-formatter can keep the real numbers up to date.

```
1.  Foo
1.  Bar
1.  Baz
```

### Nested list spacing

When nesting lists, use a 4-space indent for both numbered and bulleted lists:

```
1.  Use 2 spaces after the item number, so the text itself is indented 4 spaces.
    Use a 4-space indent for wrapped text.
2.  Use 2 spaces again for the next item.

*   Use 3 spaces after a bullet, so the text itself is indented 4 spaces.
    Use a 4-space indent for wrapped text.
    1.  Use 2 spaces with numbered lists, as before.
        Wrapped text in a nested list needs an 8-space indent.
    2.  Looks nice, doesn't it?
*   Back to the bulleted list, indented 3 spaces.
```

The following works, but it’s very messy:

```
* One space,
with no indent for wrapped text.
     1. Irregular nesting...
```

Even when there’s no nesting, using the 4-space indent makes layout consistent
for wrapped text:

```
*   Foo,
    wrapped with a 4-space indent.

1.  Two spaces for the list item
    and 4 spaces before wrapped text.
2.  Back to 2 spaces.
```

## Code

Text marked as `code` means:

1. Render literally. This is a message to the Markdown renderer.
2. Wrap with `<code>` tags. This communicates an intent to your reader.

Both are valid usage, and usually overlap.

The definition of “code” here is loose: learn to use `code` any time you want to
show that the text should be precisely as you enter it, such as:

- Code snippets
- Command line snippets
- File names
- Fake example paths and URLs

### Inline

`Backticks` designate `inline code` that will be rendered literally. Use
them for short code quotations, field names, and more:

```
You'll want to run `really_cool_script.sh arg`.

Pay attention to the `foo_bar_whammy` field in that table.
```

Use inline code when referring to file types in a generic sense, rather than a
specific existing file:

```
Be sure to update your `README.md`!
```

### Use code span for escaping

When you don’t want text to be processed as normal Markdown, like a fake path or
example URL that would lead to a bad autolink, wrap it in backticks:

```
An example Markdown shortlink would be: `markdown/foo/markdown/bar.md`
```

```
An example query might be: `https://www.google.com/search?q=$TERM`
```

### Code blocks

For code quotations longer than a single line, use a fenced code block:

```
```python
def Foo(self, bar):
  self.bar = bar
```
```

Only if you need to use three backticks in a code block, which would prematurely
end the code block, enclose the backticked code block in
[CommonMark tildes](https://spec.commonmark.org/0.30/#fenced-code-blocks):

```
~~~markdown
```python
def Foo(self, bar):
  self.bar = bar
```
~~~
```

#### Declare the language

It is best practice to explicitly declare the language, so that neither the
syntax highlighter nor the text editor must guess.

#### Use fenced code blocks instead of indented code blocks

Four-space indenting is also interpreted as a code block. However, we strongly
recommend fencing for all code blocks.

Indented code blocks can sometimes look cleaner in the source, but they have
several drawbacks:

- You cannot specify the language. Some Markdown features are tied to language
specifiers.
- The beginning and end of the code block are ambiguous.
- Indented code blocks are harder to search for in Code Search.

#### Escape newlines

Because most command-line snippets are intended to be copied and pasted directly
into a terminal, it’s best practice to escape any newlines. Use a single
backslash at the end of the line:

```
```shell
$ some command --flag --foo=longlonglonglonglongvalue \
  --bar=anotherlonglonglonglonglonglonglonglonglonglongvalue
```
```

#### Nest code blocks within lists

If you need a code block within a list, make sure to indent it so as to not
break the list:

```
*   Bullet.

    ```c++
    int foo;
    ```

*   Next bullet.
```

You can also create a nested code block with 4 spaces. Simply indent 4
additional spaces from the list indentation:

```
*   Bullet.

        int foo;

*   Next bullet.
```

## Links

Long links make source Markdown difficult to read and break the 80 character
wrapping. **Wherever possible, shorten your links**.

### Avoid relative paths unless within the same directory

Relative paths are fairly safe within the same directory. For example:

```
[...](other-page-in-same-dir.md)
[...](/path/to/another/dir/other-page.md)
```

Avoid relative links if you need to specify other directories with `../`:

```
[...](../../another/dir/other-page.md)
```

### Use informative Markdown link titles

Markdown link syntax allows you to set a link title. Use it wisely. Users often
do not read documents; they scan them.

Links catch the eye. But titling your links “here,” “link,” or simply
duplicating the target URL tells the hasty reader precisely nothing and is a
waste of space:

```
See the Markdown guide for more info: [link](markdown.md), or check out the
style guide [here](/styleguide/docguide/style.html).

Check out a typical test result:
[https://example.com/logs/aba28c38-d9d1-4b57-9072-324cc5025ff7](https://example.com/logs/aba28c38-d9d1-4b57-9072-324cc5025ff7).
```

Instead, write the sentence naturally, then go back and wrap the most
appropriate phrase with the link:

```
See the [Markdown guide](markdown.md) for more info, or check out the
[style guide](/styleguide/docguide/style.html).

Check out a
[typical test result](https://example.com/logs/aba28c38-d9d1-4b57-9072-324cc5025ff7).
```

### Delete unnecessary parameters

Most links generated by search queries include many parameters that aren’t
necessary to get the user to the right place (and many of them, such as
`user=username`, will be replaced at serving time anyway).

### Use reference links carefully

For long links or image URLs, you may want to split the link use from the link
definition, like this:

Known bug: We use a zero-width non-breaking space (U+FEFF) here to prevent
reference links from rendering within code blocks.

```
See the [markdown style guide][style], which has suggestions for making docs
more readable.

[style]: https://google.github.io/styleguide/docguide/style.html
```

#### Use reference links for long links

Use reference links where the length of the link would detract from the
readability of the surrounding text if it were inlined. Reference links make it
harder to see the destination of a link in source text, and add additional
syntax.

In this example, reference link usage is not appropriate, because the link is
not long enough to disrupt the flow of the text:

```
The [style guide][style_guide] says not to use reference links unless you have
to.

[style_guide]: https://example.com/style
```

Just inline it instead:

```
https://example.com/style says not to use reference links unless you have to.
```

In this example, the link destination is long enough that it makes sense to use
a reference link:

```
The [style guide] says not to use reference links unless you have to.

[style guide]: https://docs.google.com/document/d/13HQBxfhCwx8lVRuN2Wf6poqvAfVeEXmFVcawP5I6B3c/edit
```

Use reference links more often in tables. It is particularly important to keep
table content short, since Markdown does not provide a facility to break text in
cell tables across multiple lines, and smaller tables are more readable.

For example, this table’s readability is worsened by inline links:

```
Site                                                             | Description
---------------------------------------------------------------- | -----------------------
[site 1](http://google.com/excessively/long/path/example_site_1) | This is example site 1.
[site 2](http://google.com/excessively/long/path/example_site_2) | This is example site 2.
```

Instead, use reference links to keep the line length manageable:

```
Site     | Description
-------- | -----------------------
[site 1] | This is example site 1.
[site 2] | This is example site 2.

[site 1]: http://google.com/excessively/long/path/example_site_1
[site 2]: http://google.com/excessively/long/path/example_site_2
```

#### Use reference links to reduce duplication

Consider using reference links when referencing the same link destination
multiple times in a document, to reduce duplication.

#### Define reference links after their first use

We recommend putting reference link definitions just before the next heading, at
the end of the section in which they’re first used. If your editor has its own
opinion about where they should go, don’t fight it; the tools always win.

We define a “section” as all text between two headings. Think of reference links
like footnotes, and the current section like the current page.

This arrangement makes it easy to find the link destination in source view,
while keeping the flow of text free from clutter. In long documents with lots of
reference links, it also prevents “footnote overload” at the bottom of the file,
which makes it difficult to pick out the relevant link destination.

There is one exception to this rule: reference link definitions that are used in
multiple sections should go at the end of the document. This avoids dangling
links when a section is updated or moved.

In the following example, the reference definition is far from its initial use,
which makes the document harder to read:

```
# Header

Some text with a [link][link_def].

Some more text with the same [link][link_def].

## Header 2

... lots of text ...

## Header 3

Some more text using a [different_link][different_link_def].

[link_def]: http://reallyreallyreallylonglink.com
[different_link_def]: http://differentreallyreallylonglink.com
```

Instead, put it just before the header following its first use:

```
# Header

Some text with a [link][link_def].

Some more text with the same [link][link_def].

[link_def]: http://reallyreallyreallylonglink.com

## Header 2

... lots of text ...

## Header 3

Some more text using a [different_link][different_link_def].

[different_link_def]: http://differentreallyreallylonglink.com
```

## Images

Use images sparingly, and prefer simple screenshots. This guide is designed
around the idea that plain text gets users down to the business of communication
faster with less reader distraction and author procrastination. However, it’s
sometimes very helpful to show what you mean.

See
[image syntax](https://gerrit.googlesource.com/gitiles/+/HEAD/Documentation/markdown.md#Images).

- Use images when it’s easier to *show* a reader something than to *describe
it*. For example, explaining how to navigate a UI is often easier with an
image than text.
- Make sure to provide appropriate text to describe your image. Readers who
are not sighted cannot see your image and still need to understand the
content!

## Don’t use self-closed iframes

Even though it may seem that the `<iframe>` element is self-closing, similarly
to `<input>` or `<img>`, it actually is not and because of the way HTML parsing
works, trying to use self-closed iframe may lead to unexpected consumption of
content.

Consider the following example:

```
<iframe src="https://example.com" />
<div>Some text here</div>
```

Perhaps surprisingly, the `<iframe>` is not closed, and the `<div>` becomes a
child of it. The effect is that the content is not rendered properly and the
`<div>` (and everything after it as well) is not visible.

The correct way is to always close the `<iframe>` explicitly, such as in the
example below

```
<iframe src="https://example.com"></iframe>
<div>Some text here</div>
```

## Use tables wisely

Use tables when they make sense: for the presentation of tabular data that needs
to be scanned quickly.

Avoid using tables when your data could easily be presented in a list. Lists are
much easier to write and read in Markdown.

For example:

```
Fruit  | Metrics      | Grows on | Acute curvature    | Attributes                                                                                                  | Notes
------ | ------------ | -------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------
Apple  | Very popular | Trees    |                    | [Juicy](https://example.com/SomeReallyReallyReallyReallyReallyReallyReallyReallyLongQuery), Firm, Sweet               | Apples keep doctors away.
Banana | Very popular | Trees    | 16 degrees average | [Convenient](https://example.com/SomeDifferentReallyReallyReallyReallyReallyReallyReallyReallyLongQuery), Soft, Sweet | Contrary to popular belief, most apes prefer mangoes. Don't you? See the [design doc][banana_v2] for the newest hotness in bananiels.
```

This table illustrates a few typical problems:

- **Poor distribution**: Several columns don’t differ across rows, and some
cells are empty. This is usually a sign that your data may not benefit from
tabular display.
- **Unbalanced dimensions**: There are a small number of rows relative to
columns. When this ratio is unbalanced in either direction, a table becomes
little more than an inflexible format for text.
- **Rambling prose** in some cells. Tables should tell a succinct story at a
glance.

Lists and subheadings sometimes suffice to present the same
information. Let’s see this data in list form:

```
## Fruits

Both types are highly popular, sweet, and grow on trees.

### Apple

*   [Juicy](https://example.com/SomeReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyReallyLongURL)
*   Firm

Apples keep doctors away.

### Banana

*   [Convenient](https://example.com/SomeDifferentReallyReallyReallyReallyReallyReallyReallyReallyLongQuery)
*   Soft
*   16 degrees average acute curvature.

Contrary to popular belief, most apes prefer mangoes. Don't you?

See the [design doc][banana_v2] for the newest hotness in bananiels.
```

The list form is more spacious, and arguably therefore much easier for the
reader to find what interests her in this case.

However, there are times a table is the best choice. When you have:

- Relatively uniform data distribution across two dimensions.
- Many parallel items with distinct attributes.

In those cases, a table format is just the thing. In fact, a compact table can
improve readability:

```
Transport        | Favored by     | Advantages
---------------- | -------------- | -----------------------------------------------
Swallow          | Coconuts       | [Fast when unladen][airspeed]
Bicycle          | Miss Gulch     | [Weatherproof][tornado_proofing]
X-34 landspeeder | Whiny farmboys | [Cheap][tosche_station] since the XP-38 came out

[airspeed]: https://example.com/airspeed.h
[tornado_proofing]: https://example.com/kansas/
[tosche_station]: https://example.com/power_converter.h
```

Note that reference links are used to keep the table cells
manageable.

## Strongly prefer Markdown to HTML

Please prefer standard Markdown syntax wherever possible and avoid HTML hacks.
If you can’t seem to accomplish what you want, reconsider whether you really
need it. Except for big tables, Markdown meets almost all needs
already.

Every bit of HTML hacking reduces the readability and portability of our
Markdown corpus. This in turn limits the usefulness of integrations with other
tools, which may either present the source as plain text or render it. See
[Philosophy](/styleguide/docguide/philosophy.html).

## Arrange clauses to make sentences easy to skim

It’s often easier to see:

```
If you have use case A then you should take some unfamiliar action B
```

than

```
You should take some unfamiliar action B if you have use case A
```

because readers that don’t have use case A can skip reading about B.

Similarly, it’s often easier to see:

```
You should take action C because of reason D
```

than

```
Reason D therefore you should take action C
```

because readers that already plan to take action C don’t need to read about D.

1. Content is “above the fold” if it is visible when the page is first
displayed. Content is “below the fold” if it is hidden until the user
scrolls down the page on a computer or literally unfolds a document such as
a newspaper. ↩

Improve this page
