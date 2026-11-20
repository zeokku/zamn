# zamn

A static, pug-flavoured way to write HTML, written in Rust.

Same syntax as [pug](https://pugjs.org) for tags, classes, ids, attributes,
text, comments and doctypes, but with no JavaScript, no control flow and no
includes: a template is a single file. Existing static pug compiles to the
same HTML.

```
div
  .another-div {
    button(@click="go") Text
    p= message
  }
```

```html
<div><div class="another-div"><button @click="go">Text</button><p>{{ message }}</p></div></div>
```

## Differences from pug

- **Brace blocks.** An element may hold its children in `{ }`. The `{` ends the
  line of the tag (or is immediately closed: `p { }`); the `}` sits on its own
  line. Inside, the first line sets the base indentation and indentation nests
  as usual. `{{` never opens a block, so `p {{ msg }}` is text; write `p \{` for
  a literal brace at the end of a line.
- **`tag= expr`** emits `{{ expr }}`. The expression is not parsed.
- **Whitespace at the end of a line** is ignored everywhere: `b text  ` is
  `<b>text</b>`. A `|` on its own is one space, and is how a space between two
  lines is written:

  ```
  p {
    b this
    |
    | is
    |
    u cool
  }
  ```

  ```html
  <p><b>this</b> is <u>cool</u></p>
  ```

  In pug a bare `|` is an empty line of text, so this is the one place where
  static pug compiles to different (but equivalently rendered) whitespace.
- **Braces in text** are text. Only a `{` straight after the tag and its
  attributes opens a block: `p some { text }` and `| { text }` are text.
- **Attribute values** are quoted strings, numbers or bare words. `true` makes
  a boolean attribute; `false`, `null` and `undefined` drop it. `!=` skips
  escaping. Vue-style names work: `:to`, `@click`, `#slot`, `v-model.trim`.
- **`#{...}`** in text is not special.
- **Removed**, each with its own error: `- code`, `!=`, `if`/`else`/`unless`,
  `case`/`when`, `each`/`for`/`while`, mixins, `include`, `extends`/`block`,
  filters, `&attributes`, and lines of HTML (`<b>bold</b>` on a line of its
  own: write `b bold`, or `| <b>bold</b>`, since text is not escaped).

## Layout

| Path | What |
|---|---|
| `crates/zamn_lexer` | source to tokens, spans, diagnostics |
| `crates/zamn_parser` | tokens to AST |
| `crates/zamn_codegen` | AST to HTML and source map v3 |
| `crates/zamn` | `compile()`, the `zamn` CLI |
| `crates/zamn_wasm` | WebAssembly bindings |
| `packages/zamn` | npm package: sync `lex`, `parse`, `compile` |
| `packages/prettier-plugin-zamn` | Prettier plugin: formats `.zamn` files |
| `packages/vue-language-plugin-zamn` | Vue language tools (Volar) plugin: type checking and editor support for `<template lang="zamn">` |
| `packages/vue-eslint-parser-template-tokenizer-zamn` | ESLint: lets vue-eslint-parser read `<template lang="zamn">` |
| `packages/eslint-plugin-vue-zamn` | ESLint plugin: a config that sets up the tokenizer and eslint-plugin-vue for zamn, and rules of its own |
| `packages/vscode-zamn` | VS Code extension: syntax highlighting for `.zamn` files and `<template lang="zamn">` |
| `example` | Vue's starter app in zamn, with Vite, vue-tsc, ESLint and Prettier set up |
| `docs` | the documentation site (VitePress), with the playground, the blog and the token measurements |
| `agents` | rules to paste into an agent's context so it writes valid zamn |
| `skills` | a Claude Code skill for writing zamn |
| `tests/fixtures` | shared fixtures; `pug/` holds pug's own test cases |

The lexer and parser never fail: they report every problem as a diagnostic
(code, message, hint, span) and carry on.

## Use

```sh
cargo run -p zamn -- page.zamn -o page.html --map page.html.map
```

```ts
import { compile, parse } from "zamn";

const { code, map } = compile(source, {
  filename: "page.zamn",
  sourceMap: true,
  doctype: "html", // terse output without emitting a doctype (use for Vue)
});

const { ast, diagnostics } = parse(source); // ranges and locs are UTF-16, ESLint style
```

## Develop

```sh
bun install
bun run build     # Rust workspace + WASM package
bun run test      # cargo test + package tests
bun run parity    # diff against real pug on tests/fixtures/pug
bun run docs:dev  # the documentation site; see docs/README.md
```

The WASM build needs `rustup target add wasm32-unknown-unknown` and
`cargo install wasm-bindgen-cli --version 0.2.130`. Snapshots are updated with
`INSTA_UPDATE=always cargo test`.
