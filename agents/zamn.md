# Writing zamn

zamn compiles to HTML. A template is static: no JavaScript, no control flow, no
includes. Output has no whitespace between tags unless written.

## Syntax

- `tag` is an element; its children go inside `{ }`, or on the following lines
  nested by indentation. `.cls`, `#id` and `(attrs)` follow the tag;
  without a tag the element is a `div`: `.card`.
- A `{` at the end of the tag's line opens a block; its `}` goes on its own
  line. Inside braces, the base indentation is free (zero is fine). `p {}` is empty.
- A block can also open and close on one line: `.card{.body{h2 Title}}`,
  `ul{li{a x} li{b y}}`. It must close on that line: `select{option a` with
  `option b}` on the next line is an error (`UNCLOSED_BRACE`). Each child is
  a statement (`b{| bold}` for text); text and `= expr` run to the closing
  `}`, so a child can only follow one that ends in `}`. Write `\}` and `\{`
  for literal braces there. `p {b}` is a block, not text: write `p \{b}` for
  that.
- Text: `p Hello` (inline), `| text` (a line of text), `|` alone (one space,
  to join two lines). Text is not escaped: `p a &amp; <b>b</b>` is fine.
  `tag.` takes the indented lines below as raw text (`script.`, `style.`, `pre.`);
  those lines must stay indented deeper than the tag.
- Inline element inside text: `p Read #[a(href="/docs") the docs] first.`
- `tag: child` nests one child on the same line: `li: a(href="/") Home`.
- `tag= expr` and `= expr` write `{{ expr }}`. `{{ }}` in text passes through.
- Attributes: `a(href="/" target="_blank")`. `style={color: 'red'}` becomes
  CSS. `disabled` or `x=true` is a boolean attribute; `x=false` drops it. `!=` writes the value unescaped. Vue names work as written:
  `:to`, `@click.prevent`, `#default="{ row }"`, `v-model.trim`.
- Quoting: always quote a value that contains whitespace, a `,`, any of
  `` " ' ` = < > ``, or a bracket: `class="btn primary"`, `@click="save()"`,
  `v-for="(item, i) in items"`. Without quotes such a value ends early or is an
  error, sometimes silently (`class=btn primary` gives a `primary` attribute).
  Simple values may go without quotes: `href=/docs`, `type=checkbox`,
  `:key=item.id`. One exception: a binding (`:x`, `@x`, `#x`, `.x`, `v-*`) whose
  whole value is one `{ }` or `[ ]` group may stay unquoted, spaces and commas
  included: `:class={ active: on, big: large }`, `v-bind=[a, b]`.
- `img/` self-closes; void tags (`img`, `br`, `input`, `meta`, `link`, `hr`) need nothing.
- `//- note` is a comment left out of the output; `// note` is an HTML comment.
- `doctype html` at the top of a full page.

## Not available, and what to write instead

| Don't | Do |
|---|---|
| `if cond` / `each x in xs` / `case` | `p(v-if="cond")`, `li(v-for="x in xs" :key="x.id")` |
| `- const x = ...` | compute it in the component, then `p= x` |
| `href=base + "/x"` (JS in a value) | `:href="base + '/x'"` |
| `include`, `extends`, `block`, `mixin`, `+mixin` | a component: `AppHeader` |
| `p!= html` | `div(v-html="html")` |
| `<div>...</div>` on a line | `div ...`, or `\| <b>raw</b>` |
| `:markdown` filters | render the content before it reaches the template |
| `p text {` to open a block after text | put the text inside: `p {` then `\| text` |

## Writing it

Write readable zamn, laid out the way a person would: children in `{ }` blocks
or nested by indentation, one child per line, attributes on the tag's line.
Don't squeeze it: measured with Claude, the tersest form (no indentation, blocks
on one line, no optional quotes) took more thinking than it saved, and was
invalid more often. Then run `prettier --write` (prettier-plugin-zamn) on the
file, if the project uses it.

```zamn
ul.nav {
  li: a(href="/") Home
  li {
    a(href="/docs" :class="{ active: onDocs }") Docs
    span.badge= count
  }
}
```

## Checking your work

Compile the file and fix every error it reports; each has a code and a hint:

```sh
zamn page.zamn
```

In a Vue project, `<template lang="zamn">` is checked by `vue-tsc` and `eslint`
as well.
