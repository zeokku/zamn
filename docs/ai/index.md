# Writing zamn with AI agents

zamn is easy for people to read and cheap for models to write. The same page takes
noticeably fewer tokens as zamn than as HTML. An agent that generates templates
writes less, and so it is faster and cheaper, and the result is still a file a
person can review at a glance.

<!--@include: ../data/token-summary.md-->

These are the totals for six hand-written pages: a landing page, a sign-up form, a
data table, a Tailwind dashboard, a Vue component and an article. Every zamn form
compiles to exactly the same HTML. [How it was measured](./token-savings).

## The workflow

1. **Generate terse zamn.** Every element with children holds them in `{ }`, with
   no indentation at all, and attributes stay on the tag's line: a brace block
   can start at any indentation, including none. A block can also close on its
   own line (`a(href="/"){img(src="/logo.svg")}`), but that saves little.
2. **Check it.** `zamn file.zamn` (or `vue-tsc` and `eslint` in a Vue project)
   reports every problem with a code and a hint, which an agent can act on.
3. **Format it for people.** `prettier --write` with
   [prettier-plugin-zamn](../ecosystem/prettier) turns it into the indented,
   readable form. Prettier costs no tokens.

Terse:

```zamn
ul.nav {
li: a(href="/") Home
li {
a(href="/docs" :class="{ active: onDocs }") Docs
span.badge= count
}
}
```

After Prettier:

```zamn
ul.nav {
  li: a(href="/") Home
  li {
    a(href="/docs" :class="{ active: onDocs }") Docs
    span.badge= count
  }
}
```

With OpenAI's tokenizer, flat braces came out a few percent smaller than
indentation with one space. Folding every block that can onto one line saved under
1% more: most blocks hold text somewhere other than at the end, and text runs to
the closing `}`, so they can't fold. Both are far smaller than formatted HTML. Whichever an
agent writes, the formatter makes them identical.

## Give your agent the rules

Models know HTML well and zamn not at all, so they need the rules in context. They
fit in about a page:

- [Agent rules](./rules): a block to paste into `AGENTS.md`, `CLAUDE.md` or a
  system prompt.
- [Claude Code skill](./skill): the same rules plus the check-and-format workflow,
  loaded only when a task touches zamn.
- [`llms.txt`](/llms.txt) and [`llms-full.txt`](/llms-full.txt): the whole of this
  documentation for models, generated on every build. Every page also has a Markdown
  version, linked from the buttons under its title.

## Mistakes models make

What agents trained on HTML and other template languages get wrong, and what the
compiler says:

| Mistake | Error | Fix |
|---|---|---|
| `if`, `each`, `for` lines | `UNSUPPORTED_SYNTAX` | `v-if`, `v-for` on the element |
| `a(href=base + "/x")` | `JS_EXPRESSION` | `a(:href="base + '/x'")` |
| `<div>` lines of HTML | `UNSUPPORTED_SYNTAX` | `div`, or `\| <div>` as text |
| `p Some text {` | none: the `{` is text | open the block straight after the tag: `p {` |
| a line indented under `}` | `INVALID_INDENTATION` | put children inside the braces |
| text lines without `\|` | `UNEXPECTED_TEXT`, or a stray element | start each text line with `\|` |
| expecting a space between two lines of text or tags | none: they touch | a `\|` line on its own |
| `class="w-1/2"` as `.w-1/2` | `UNEXPECTED_TEXT` | keep `class="..."` for such names |

All codes: [Diagnostics](../reference/diagnostics).
