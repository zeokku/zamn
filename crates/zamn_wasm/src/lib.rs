//! WebAssembly bindings. Every function takes and returns JSON strings; the
//! `zamn` npm package wraps them in a typed API.

mod api;

use wasm_bindgen::prelude::*;

/// `{ tokens, diagnostics }`
#[wasm_bindgen]
pub fn lex(source: &str) -> String {
    api::lex(source).to_string()
}

/// `{ ast, diagnostics }`
#[wasm_bindgen]
pub fn parse(source: &str) -> String {
    api::parse(source).to_string()
}

/// `{ code, map, diagnostics }`
#[wasm_bindgen]
pub fn compile(source: &str, options: &str) -> String {
    api::compile(source, options).to_string()
}
