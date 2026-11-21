---
name: zamn
description: Write and edit zamn templates (.zamn files and Vue `<template lang="zamn">`), a static syntax with `{ }` blocks instead of closing tags that compiles to HTML. Use whenever a task creates or changes zamn markup, or converts HTML to zamn.
license: MIT
---

# zamn

zamn compiles to HTML. A template is static: no JavaScript, no control flow, no
includes. Output has no whitespace between tags unless written.

## Syntax

- `tag` is an element; children go on the following lines, nested by
  indentation or inside `{ }`. `.cls`, `#id` and `(attrs)` follow the tag;
  without a tag the element is a `div`: `.card`.
- A `{` at the end of the tag's line opens a block; its `}` goes on its own
  line. Inside braces, the base indentation is free (zero is fine). `p {}` is empty.
- A block can also open and close on one line: `.card{.body{h2 Title}}`,
  `ul{li{a x} li{b y}}`. Each child is a statement (`b{| bold}` for text);
  text and `= expr` run to the closing `}`, so a child can only follow one that
  ends in `}`. Write `\}` and `\{` for literal braces there. `p {b}` is a
  block, not text: write `p \{b}` for that.
- Text: `p Hello` (inline), `| text` (a line of text), `|` alone (one space,
  to join two lines). Text is not escaped: `p a &amp; <b>b</b>` is fine.
  `tag.` takes the indented lines below as raw text (`script.`, `style.`, `pre.`);
  those lines must stay indented deeper than the tag.
- Inline element inside text: `p Read #[a(href="/docs") the docs] first.`
- `tag: child` nests one child on the same line: `li: a(href="/") Home`.
- `tag= expr` and `= expr` write `{{ expr }}`. `{{ }}` in text passes through.
- Attributes: `a(href="/" target="_blank")`. Values are quoted strings, numbers
  or bare words. `disabled` or `x=true` is a boolean attribute; `x=false`
  drops it. `!=` writes the value unescaped. Vue names work as written:
  `:to`, `@click.prevent`, `#default="{ row }"`, `v-model.trim`.
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

## Workflow

1. Write the tersest form: every element with children in `{ }`, no
   indentation, no optional spaces, attributes on the tag's line. Text blocks
   (`tag.`) and multi-line attribute values keep their indentation.

   ```zamn
   ul.nav {
   li: a(href="/") Home
   li {
   a(href="/docs" :class="{ active: onDocs }") Docs
   span.badge= count
   }
   }
   ```

2. Compile to check it, and fix every error (each has a code and a hint):

   ```sh
   zamn path/to/file.zamn > /dev/null
   ```

   For a Vue component, run the project's `vue-tsc` and `eslint` instead, if the
   project has them; they read `<template lang="zamn">`.

3. Format the file for people, if the project uses Prettier with
   prettier-plugin-zamn:

   ```sh
   npx prettier --write path/to/file.zamn
   ```

When converting HTML: drop the closing tags, turn `class="a b"` into `.a.b` and
`id="x"` into `#x` (keep `class="..."` for names with `/` or `:`), and turn
whitespace that matters between inline elements into `|` lines.
