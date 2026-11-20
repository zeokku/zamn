# Rust crates

zamn is written in Rust. The npm package, the CLI and every editor integration use
the same crates.

| Crate | What |
|---|---|
| `zamn` | `compile()`, the `zamn` binary, and re-exports of the three below |
| `zamn_lexer` | source to tokens, spans, diagnostics; `LineIndex` for line/column and UTF-16 positions |
| `zamn_parser` | tokens to the AST |
| `zamn_codegen` | AST to HTML, with mappings and source map v3 |

```toml
[dependencies]
zamn = "0.1"
```

## Compile

```rust
use zamn::{compile, CompileOptions};

let source = "p Hello #[b world]";
let mut options = CompileOptions {
    filename: "hello.zamn".into(),
    source_map: true,
    ..Default::default()
};
options.codegen.doctype = Some("html".into());

let out = compile(source, &options);
if out.diagnostics.is_empty() {
    println!("{}", out.code); // <p>Hello <b>world</b></p>
    let map_json = out.map.unwrap();
} else {
    for d in &out.diagnostics {
        eprintln!("{d}"); // hello.zamn:1:9: error[CODE]: message (and a hint line)
    }
}
```

`CompileOptions` has `filename`, `source_map`, `sources_content` (default `true`) and
`codegen`, which holds the `interpolation` delimiters and the assumed `doctype`.
`compile` always returns HTML. When `diagnostics` is not empty, that HTML is a best
effort: don't use it.

## Lex and parse

```rust
let lexed = zamn::lexer::lex(source);       // tokens + diagnostics
let parsed = zamn::parser::parse(source);   // ast + diagnostics (lexer's included)
```

Neither fails. Spans are byte offsets into the source; `zamn::lexer::LineIndex`
turns them into lines and columns, or into the UTF-16 ranges that JavaScript tools
use. The AST and the diagnostics implement `serde::Serialize`.

The WebAssembly bindings (`zamn_wasm`) are a thin JSON layer over these functions;
the [JavaScript API](./api) documents the shapes they produce.
