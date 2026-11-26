# zamn docs

The documentation site, built with [VitePress](https://vitepress.dev) and published to
<https://zeokku.github.io/zamn/> by `.github/workflows/docs.yml`.

```sh
bun install          # in the repository root
bun run build        # in the repository root: the WASM package the playground and tests use
bun run docs:dev     # http://localhost:5173/zamn/
bun run docs:build   # writes docs/.vitepress/dist
bun run --cwd docs test
```

## Pages

`guide/`, `ecosystem/`, `reference/` and `ai/` each have a sidebar in `.vitepress/config.mts`: add a new page there.

Every ` ```zamn ` block is checked by `test/examples.test.ts`: it must compile without errors or warnings, and if the next code block is ` ```html `, to exactly that HTML. Mark a block `error=CODE` when it should fail with that error, `warning=CODE` when it should compile with that warning, or `skip` for fragments. An ` ```html format ` block holds the output as Prettier formats it (`.vitepress/theme/format.ts`).

`ai/rules.md` and `ai/skill.md` include `agents/zamn.md` and `skills/zamn/SKILL.md` from the repository root; edit those files, not the pages. They are also served for download under `/downloads/`.

## Blog

Posts live in `blog/`. Create a `.md` file with this frontmatter:

```md
---
title: Something happened
date: 2026-12-01
description: One sentence for the list of posts.
---

# Something happened

...
```

The list on `/blog/` is built from the posts' frontmatter, newest first. Nothing else needs to change.

## Token statistics

`bun run docs:tokens` measures the pages in `token-corpus/` and writes `data/token-stats.json` and its tables in `data/token-*.md`. Claude counts need `ANTHROPIC_API_KEY` or an `ant auth login` profile, on an account with credits.

`bun run docs:generate` has Claude Code write each page from its `.task.txt`, as HTML and as zamn, and writes `data/generation-summary.md`. It runs on whatever Claude Code is logged in with and costs about $7 at API prices for every arm three times; `--arms`, `--pages` and `--repeats` run less.
