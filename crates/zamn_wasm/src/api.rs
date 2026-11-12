//! The JSON API, independent of wasm-bindgen so it can be tested natively.

use serde::Deserialize;
use serde_json::{json, Value};
use zamn::lexer::{Diagnostic, LineIndex, Span};
use zamn::CompileOptions;

fn located(index: &LineIndex<'_>, span: Span) -> Value {
    json!({ "range": index.range(span), "loc": index.loc(span) })
}

fn as_span(v: &Value) -> Option<Span> {
    let o = v.as_object()?;
    Some(Span {
        start: o.get("start")?.as_u64()? as u32,
        end: o.get("end")?.as_u64()? as u32,
    })
}

/// Rewrite byte spans into what JS tooling expects: `span` becomes `range`
/// (UTF-16 offsets) and `loc` on the node itself; `fooSpan` becomes
/// `{ range, loc }`.
fn convert_spans(v: &mut Value, index: &LineIndex<'_>) {
    match v {
        Value::Array(items) => items.iter_mut().for_each(|x| convert_spans(x, index)),
        Value::Object(o) => {
            if let Some(span) = o.get("span").and_then(as_span) {
                o.remove("span");
                o.insert("range".into(), json!(index.range(span)));
                o.insert("loc".into(), json!(index.loc(span)));
            }
            for (key, value) in o.iter_mut() {
                match as_span(value) {
                    Some(span) if key.ends_with("Span") => *value = located(index, span),
                    _ => convert_spans(value, index),
                }
            }
        }
        _ => {}
    }
}

fn diagnostics(list: Vec<Diagnostic>, index: &LineIndex<'_>) -> Value {
    let mut v = serde_json::to_value(list).unwrap();
    convert_spans(&mut v, index);
    v
}

pub fn lex(source: &str) -> Value {
    let index = LineIndex::new(source);
    let result = zamn::lexer::lex(source);
    let tokens: Vec<Value> = result
        .tokens
        .iter()
        .map(|t| {
            json!({
                "type": t.kind,
                "value": t.span.slice(source),
                "range": index.range(t.span),
                "loc": index.loc(t.span),
            })
        })
        .collect();
    json!({ "tokens": tokens, "diagnostics": diagnostics(result.diagnostics, &index) })
}

pub fn parse(source: &str) -> Value {
    let index = LineIndex::new(source);
    let result = zamn::parser::parse(source);
    let mut nodes = serde_json::to_value(&result.ast.nodes).unwrap();
    convert_spans(&mut nodes, &index);
    let whole = Span::new(0, source.len());
    json!({
        "ast": {
            "type": "Root",
            "nodes": nodes,
            "range": index.range(whole),
            "loc": index.loc(whole),
        },
        "diagnostics": diagnostics(result.diagnostics, &index),
    })
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Options {
    filename: Option<String>,
    source_map: bool,
    sources_content: Option<bool>,
    interpolation: Option<(String, String)>,
    doctype: Option<String>,
}

pub fn compile(source: &str, options: &str) -> Value {
    let o: Options = serde_json::from_str(options).unwrap_or_default();
    let mut options = CompileOptions {
        source_map: o.source_map,
        ..Default::default()
    };
    if let Some(filename) = o.filename {
        options.filename = filename;
    }
    if let Some(sources_content) = o.sources_content {
        options.sources_content = sources_content;
    }
    if let Some(interpolation) = o.interpolation {
        options.codegen.interpolation = interpolation;
    }
    options.codegen.doctype = o.doctype;

    let out = zamn::compile(source, &options);
    let map: Value = out
        .map
        .map_or(Value::Null, |m| serde_json::from_str(&m).unwrap());
    json!({
        "code": out.code,
        "map": map,
        "diagnostics": out.diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_become_utf16_ranges() {
        let v = parse("p 😀\na(href='x')");
        let nodes = &v["ast"]["nodes"];
        assert_eq!(nodes[0]["type"], "Element");
        assert_eq!(nodes[0]["nameSpan"]["range"], json!([0, 1]));
        // The emoji is 4 bytes but 2 UTF-16 units.
        assert_eq!(nodes[1]["range"], json!([5, 16]));
        assert_eq!(nodes[1]["loc"]["start"], json!({ "line": 2, "column": 0 }));
        assert_eq!(nodes[1]["attrs"][0]["valueSpan"]["range"], json!([12, 15]));
        assert!(nodes[1].get("span").is_none());
    }

    #[test]
    fn compile_returns_map_object() {
        let v = compile("p hi", r#"{"sourceMap":true,"filename":"a.zamn"}"#);
        assert_eq!(v["code"], "<p>hi</p>");
        assert_eq!(v["map"]["sources"], json!(["a.zamn"]));
        let v = lex("p hi");
        assert_eq!(
            v["tokens"][0],
            json!({
                "type": "Tag", "value": "p", "range": [0, 1],
                "loc": { "start": { "line": 1, "column": 0 }, "end": { "line": 1, "column": 1 } }
            })
        );
    }
}
