//! WebAssembly bindings. Every function takes and returns JSON strings; the
//! `zamn` npm package wraps them in a typed API.

mod api;

use wasm_bindgen::prelude::*;
use zamn::{Resolved, Resolver};

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

/// `{ code, map, diagnostics, dependencies }`. `resolve(path, from)` must
/// return a JSON string: `{ filename, source }` or `{ error }`.
#[wasm_bindgen]
pub fn compile(source: &str, options: &str, resolve: Option<js_sys::Function>) -> String {
    let resolver = resolve.map(JsResolver);
    api::compile(
        source,
        options,
        resolver.as_ref().map(|r| r as &dyn Resolver),
    )
    .to_string()
}

struct JsResolver(js_sys::Function);

impl Resolver for JsResolver {
    fn resolve(&self, path: &str, from: &str) -> Result<Resolved, String> {
        let result = self
            .0
            .call2(
                &JsValue::NULL,
                &JsValue::from_str(path),
                &JsValue::from_str(from),
            )
            .map_err(|e| {
                js_sys::Reflect::get(&e, &JsValue::from_str("message"))
                    .ok()
                    .and_then(|m| m.as_string())
                    .unwrap_or_else(|| "the include resolver threw".into())
            })?;
        let json = result
            .as_string()
            .ok_or("the include resolver returned no file")?;
        api::parse_resolved(&json)
    }
}
