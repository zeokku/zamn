# Rust crates

zamn is written in Rust. The npm package, the CLI and every editor integration use the same crates.

| Crate | What |
|---|---|
| `zamn` | `compile()`, `compile_vue()`, the `zamn` binary, and re-exports of the three below |
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

let source = "p Hello #{b world}";
let options = CompileOptions {
    filename: "hello.zamn".into(),
    source_map: true,
    ..Default::default()
};

let out = compile(source, &options);
for d in &out.diagnostics {
    eprintln!("{d}"); // hello.zamn:1:9: error[CODE]: message (and a hint line)
}
if !out.has_errors() {
    println!("{}", out.code); // <p>Hello <b>world</b></p>
    let map_json = out.map.unwrap();
}
```

`CompileOptions` has `filename`, `source_map`, `sources_content` (default `true`) and `codegen`, which holds the `interpolation` delimiters. `compile` always returns HTML, and `diagnostics` holds the errors and warnings in source order, each with its `severity`. When `has_errors()` is true, that HTML is a best effort: don't use it. Warnings alone leave it as good as it is.

`compile_vue(sfc, &options)` does the same for the `<template lang="zamn">` of a Vue single-file component, and returns `None` if it has none. The HTML is the template's; the diagnostics point into the whole file. `zamn::vue::zamn_template` gives the byte range of that template's content.

## Lex and parse

```rust
let lexed = zamn::lexer::lex(source);       // tokens + diagnostics
let parsed = zamn::parser::parse(source);   // ast + diagnostics (lexer's included)
```

Neither fails. Spans are byte offsets into the source; `zamn::lexer::LineIndex` turns them into lines and columns, or into the UTF-16 ranges and offsets that JavaScript tools use. A `Diagnostic` is an error or a warning (`Diagnostic::is_error`). The AST and the diagnostics implement `serde::Serialize`.

The WebAssembly bindings (`zamn_wasm`) are a thin JSON layer over these functions; the [JavaScript API](./api) documents the shapes they produce.
