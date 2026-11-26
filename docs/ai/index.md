# Writing zamn with AI agents

An agent writes valid zamn with the rules in its context and a check of every file it writes. What that costs in Claude Code, and how this setup came out of it: [Engineering the zamn Claude Code skill for efficiency](../blog/engineering-zamn-claude-code-skill-for-efficiency).

## The workflow

1. **Write readable zamn**, laid out the way a person would: children in indented `{ }` blocks, one child per line, attributes on the tag's line.
2. **Check it.** `zamn --validate page.zamn Component.vue` reports every problem with a code and a hint, which an agent can act on, and prints nothing when all is well. Only errors fail the check; warnings, such as a line indented as if it were a child when it isn't, are worth fixing too. It reads the `<template lang="zamn">` of a `.vue` file in place; `vue-tsc` and `eslint` also check the expressions in it. In Claude Code, a [hook](./skill#add-the-hook) runs the check after every write and edit, and a check that passes costs no tokens.

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
- [Claude Code skill](./skill): the same rules, loaded only when a task touches zamn, and a hook that checks every file Claude writes.
- [`llms.txt`](/llms.txt) and [`llms-full.txt`](/llms-full.txt): the whole of this documentation for models, generated on every build. Every page also has a Markdown version, linked from the buttons under its title.
