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
- **Attribute values** are quoted strings, numbers or bare words. `true` makes
  a boolean attribute; `false`, `null` and `undefined` drop it. `!=` skips
  escaping. Vue-style names work: `:to`, `@click`, `#slot`, `v-model.trim`.
- **`#{...}`** in text is not special.
- **Removed**, each with its own error: `- code`, `!=`, `if`/`else`/`unless`,
  `case`/`when`, `each`/`for`/`while`, mixins, `include`, `extends`/`block`,
  filters, `&attributes`.

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
```

The WASM build needs `rustup target add wasm32-unknown-unknown` and
`cargo install wasm-bindgen-cli --version 0.2.130`. Snapshots are updated with
`INSTA_UPDATE=always cargo test`.
