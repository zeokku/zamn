# zamn example

Vue's starter app (`bun create vue`), with every template written in
[zamn](../README.md) and the tooling set up around it. The packages come from
this repository's workspace.

```sh
bun install          # in the repository root
bun run build        # in the repository root: builds the zamn WASM package
cd example
bun dev
```

| Script | What | Set up in |
|---|---|---|
| `bun dev`, `bun run build` | Vite compiles `<template lang="zamn">` with `zamn` | [vite.config.ts](vite.config.ts) |
| `bun run type-check` | `vue-tsc` checks the templates through `vue-language-plugin-zamn`; the editor uses the same plugin | [tsconfig.app.json](tsconfig.app.json) |
| `bun run lint` | ESLint and eslint-plugin-vue read the templates through `vue-eslint-parser-template-tokenizer-zamn` | [eslint.config.ts](eslint.config.ts) |
| `bun run format` | Prettier formats the templates with `prettier-plugin-zamn` | [prettier.config.ts](prettier.config.ts) |

To see them at work, change `h1.green= msg` in
[src/components/HelloWorld.vue](src/components/HelloWorld.vue) to `= mgs` and
run `bun run type-check`, or add `v-for="n in 2"` to a tag and run
`bun run lint`.

## Seeing problems in the editor

[src/components/LintProblems.vue](src/components/LintProblems.vue) is wrong on
purpose: every line of its template has a comment saying what ESLint, the Vue
language tools or zamn should report there. Open it with the Vue - Official and
ESLint extensions installed. The app does not use it; while it exists,
`bun run lint`, `bun run type-check` and `bun run build` fail (`bunx vite build`
still works). Delete it to get them passing again.
