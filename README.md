# zamn

A static way to write HTML, with `{ }` blocks instead of closing tags, written in Rust.

Tags, `.class`, `#id` and `(attributes)` on one line, and children in braces. A template is static markup, with logic, loops and composition left to your framework, and a single file that compiles to one HTML string, with a source map. The syntax for tags, classes and attributes was inspired by [pug](https://pugjs.org)'s.

```
div {
  .another-div {
    button(@click="go") Text
    p= message
  }
}
```

```html
<div><div class="another-div"><button @click="go">Text</button><p>{{ message }}</p></div></div>
```

## Syntax

**Blocks.** Children go only in `{ }`. A `{` straight after the tag head (tag, classes, ids, attributes) opens a block, which closes at its matching `}`, on the same line or a later one. A statement ends at the end of its line, at a `}` that closes its block, or at the `}` that ends its own block, after which another may follow: `ul { li { a(href="/") Home } li { b y } }`. `}}` closes two blocks. `tag: child` puts one child on the same line: `li: a(href="/") Home`.

**Indentation means nothing.** Indent for people (Prettier does it for you). A line indented as if it were a child, without braces, is a sibling, and zamn warns about it (`MISLEADING_INDENTATION`):

```
p Some text
  b bold
```

```html
<p>Some text</p><b>bold</b>
```

**Text.** `p Hello`, `p: | Hello` and `p: |{ Hello }` are the same: `|` and `|{ }` are statements, and an element takes them as it takes any other child. A statement of text starts with `|`. Text is trimmed at both ends, and lines of text are joined as they are: a bare `|` is one space, and is how a space between two lines is written. After a tag, a `|` is just text. `|{ }` may span lines: blank first and last lines are dropped and the common indentation is stripped.

```
p {
  b this
  |
  | is
  |
  u cool
}
pre: |{
  if (a < b) \{
    go();
  \}
}
```

```html
<p><b>this</b> is <u>cool</u></p><pre>if (a &lt; b) {
  go();
}</pre>
```

**Escaping.** Text is HTML-escaped: `<`, `>` and `&` become entities, but a character reference such as `&nbsp;` or `&rarr;` passes through. Tags written in text show as text; for HTML from data, use your framework (`div(v-html="html")`). In text, `{{ expr }}` is a mustache, copied as it is; every other brace is written `\{` or `\}`. `\#{` is a literal `#{`.

**Inline elements and interpolation.** `#{...}` holds one element in the middle of text, and `= expr` writes `{{ expr }}`:

```
p Hello {{ user.name }}, read #{a(href="/docs") the docs} or #{em: b ask}.
h1= title
```

```html
<p>Hello {{ user.name }}, read <a href="/docs">the docs</a> or <em><b>ask</b></em>.</p><h1>{{ title }}</h1>
```

**Scripts and styles** take raw content, not parsed and not escaped, up to a `/script` or `/style` line. `script(src="/a.js")` has neither.

```
script
  if (a < b && ready) { go() }
/script
```

```html
<script>if (a < b && ready) { go() }</script>
```

**Comments.** `// note` and `/* ... */` are left out of the HTML; `//! note` and `/*! ... */` are written as HTML comments. Block comments may span lines, and go wherever a statement can start.

**Attributes** are quoted strings, or unquoted as HTML allows them (`href=/docs/`; a `,` or `)` ends the value). `true` or no value makes a boolean attribute, always written terse (`disabled`); `false`, `null` and `undefined` drop it. A binding takes a value in brackets without quotes (`:class={ active: on }`). `style={...}` is written as CSS, with camelCase keys turned into kebab-case and unquoted values. `!=` skips escaping a value. Vue-style names work: `:to`, `@click`, `#slot`, `v-model.trim`.

```
.w-1/2.md:flex.hover:bg-sky-700(style={fontSize: 12px, color: rgb(0, 0, 0)}) {
  input(type="checkbox" checked hidden=false)
}
```

```html
<div class="w-1/2 md:flex hover:bg-sky-700" style="font-size:12px;color:rgb(0, 0, 0);"><input type="checkbox" checked></div>
```

Class shorthands take Tailwind-style names: `md:flex`, `w-1/2`, `px-2.5`, `[&>*]:p-2`, `!mt-0`, `bg-(--brand)`.

**Output** is always HTML5: `<img>` and `<br>` without a `/`, a closing tag for everything else. `doctype html` writes `<!DOCTYPE html>`.

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
| `assets` | the logo, and `logo.ts`, which writes its sizes (gitignored) for the docs and the VS Code extension |
| `tests/fixtures` | shared fixtures; `pug/` holds pug's own test cases, kept for the coming pug converter |

The lexer and parser never fail: they report every problem as a diagnostic (code, severity, message, hint, span) and carry on. Errors stop compilation; warnings don't.

## Use

```sh
cargo run -p zamn -- page.zamn -o page.html --map page.html.map
cargo run -p zamn -- --validate page.zamn Component.vue  # errors and warnings, or nothing; fails on errors only
```

```ts
import { compile, parse } from "zamn";

const { code, map, warnings } = compile(source, {
  filename: "page.zamn",
  sourceMap: true,
}); // throws a ZamnError on errors

const { ast, diagnostics } = parse(source); // ranges and locs are UTF-16, ESLint style
```

## Develop

```sh
bun install
bun run build     # Rust workspace + WASM package
bun run test      # cargo test + package tests
bun run docs:dev  # the documentation site; see docs/README.md
```

The WASM build needs `rustup target add wasm32-unknown-unknown` and `cargo install wasm-bindgen-cli --version 0.2.130`. Snapshots are updated with `INSTA_UPDATE=always cargo test`.
