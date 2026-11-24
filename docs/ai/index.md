# Writing zamn with AI agents

zamn is easy for people to read, and a page of it takes about a third fewer tokens than the formatted HTML models write. Every agent that reads the page later, and every person who reviews it, gets the smaller file.

::: info Measured on the previous syntax
The numbers on these pages were measured before zamn moved to braces only (when children could also be nested by indentation, and text was not escaped). They will be measured again; the pages in the corpus are the same.
:::

<!--@include: ../data/token-summary.md-->

These are the totals for six hand-written pages: a landing page, a sign-up form, a data table, a Tailwind dashboard, a Vue component and an article. Every zamn form compiles to exactly the same HTML.

Writing it is another matter. Claude thinks before writing zamn where it often doesn't for HTML, and that takes back most of the saving: measured with Claude Code, a page costs 5 to 10% less to generate as zamn, and a chat of several pages about a sixth less, thinking included. Edits cost a little more in zamn: a single edit pays for loading the skill and compiling the result, and over six edits in one chat the answers are about 6% bigger than HTML's. [How it was measured](./token-savings).

## The workflow

1. **Write readable zamn**, laid out the way a person would: children in indented `{ }` blocks, one child per line, attributes on the tag's line. Squeezing it (no indentation, blocks on one line, no optional quotes) makes the code smaller but took Claude more thinking than it saved, and more of its answers were invalid.
2. **Check it.** `zamn --validate page.zamn Component.vue` reports every problem with a code and a hint, which an agent can act on, and prints nothing when all is well. Only errors fail the check; warnings, such as a line indented as if it were a child when it isn't, are worth fixing too. It reads the `<template lang="zamn">` of a `.vue` file in place; `vue-tsc` and `eslint` also check the expressions in it.
3. **Format it for people.** `prettier --write` with [prettier-plugin-zamn](../ecosystem/prettier) settles the layout, indentation included. Prettier costs no tokens.

```zamn
ul.nav {
  li: a(href="/") Home
  li {
    a(href="/docs" :class="{ active: onDocs }") Docs
    span.badge= count
  }
}
```

## Give your agent the rules

Models know HTML well and zamn not at all, so they need the rules in context. They fit in about a page:

- [Agent rules](./rules): a block to paste into `AGENTS.md`, `CLAUDE.md` or a system prompt.
- [Claude Code skill](./skill): the same rules plus the check-and-format workflow, loaded only when a task touches zamn.
- [`llms.txt`](/llms.txt) and [`llms-full.txt`](/llms-full.txt): the whole of this documentation for models, generated on every build. Every page also has a Markdown version, linked from the buttons under its title.

## Mistakes models make

What agents trained on HTML and other template languages get wrong, and what the compiler says:

| Mistake | Error | Fix |
|---|---|---|
| `if`, `each`, `for` lines | `UNSUPPORTED_SYNTAX` | `v-if`, `v-for` on the element |
| `a(href=base + "/x")` | `JS_EXPRESSION` | `a(:href="base + '/x'")` |
| `<div>` lines of HTML | `UNSUPPORTED_SYNTAX` | `div` |
| `<b>` and other tags in text | none: text is escaped, so the tags show as text | `#{b bold}` |
| `#[b bold]`, `script.`, `img/` | `UNSUPPORTED_SYNTAX` | `#{b bold}`, `script` … `/script`, `img` |
| children nested by indentation, without braces | `MISLEADING_INDENTATION`, a warning: they are siblings | put children inside `{ }` |
| `p Some text {` | `UNESCAPED_BRACE` | open the block straight after the tag: `p {` |
| `{` or `}` in text | `UNESCAPED_BRACE`, or a `}` that closes the block | `\{` and `\}` |
| `p { b bold i italic }` for two children | none: text runs to the `}`, so `i italic` is text | a new line after text |
| `v-for=(item, i) in items` | none: the value ends at `)`, and `in` and `items` become attributes | quote any value with spaces, commas or brackets: `v-for="(item, i) in items"` |
| `class=btn primary` | none: the value ends at the space, and `primary` becomes an attribute | quote a value with spaces: `class="btn primary"` |
| text lines without `\|`, or starting with `{{` | `UNEXPECTED_TEXT`, or a stray element | start each text line with `\|` |
| expecting a space between two lines of text or tags | none: they touch | a `\|` line on its own |

All codes: [Diagnostics](../reference/diagnostics).
