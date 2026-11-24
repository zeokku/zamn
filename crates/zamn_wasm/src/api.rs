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
        assert_eq!(
            nodes[1]["loc"]["start"],
            json!({ "line": 2, "column": 0, "offset": 5 })
        );
        assert_eq!(nodes[1]["attrs"][0]["valueSpan"]["range"], json!([12, 15]));
        assert!(nodes[1].get("span").is_none());
    }

    #[test]
    fn positions_carry_utf16_offsets() {
        let source = "a\n😀b\nc";
        let index = LineIndex::new(source);
        let b = source.find('b').unwrap();
        let c = source.find('c').unwrap();
        assert_eq!(
            located(&index, Span::new(b, c)),
            json!({
                "range": [4, 6],
                "loc": {
                    "start": { "line": 2, "column": 2, "offset": 4 },
                    "end": { "line": 3, "column": 0, "offset": 6 },
                },
            })
        );
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
                "loc": {
                    "start": { "line": 1, "column": 0, "offset": 0 },
                    "end": { "line": 1, "column": 1, "offset": 1 },
                },
            })
        );
    }

    #[test]
    fn compile_options_and_severity() {
        let v = compile("input(disabled)\np= x", r#"{"interpolation":["${","}"]}"#);
        assert_eq!(v["code"], "<input disabled><p>${ x }</p>");
        assert_eq!(v["diagnostics"], json!([]));
        // The removed `doctype` option is ignored.
        let v = compile("input(disabled)", r#"{"doctype":"xml"}"#);
        assert_eq!(v["code"], "<input disabled>");
        let v = compile("p {\n  b hi\n", "{}");
        let d = &v["diagnostics"][0];
        assert_eq!(d["code"], "UNCLOSED_BRACE");
        assert_eq!(d["severity"], "error");
        assert_eq!(d["loc"]["start"]["offset"], d["range"][0]);
        let v = parse("div {\n  p a\n    p b\n}");
        let d = &v["diagnostics"][0];
        assert_eq!(d["code"], "MISLEADING_INDENTATION");
        assert_eq!(d["severity"], "warning");
    }

    /// Every kind of token and node, with text outside ASCII.
    const ALL_SYNTAX: &str = r#"doctype html
//! buffered 😀
// silent 😀
/*! block 😀
  comment */
/* silent 😀 block */
div#main.a.w-1.5(href="/x" title!="<b>" disabled :class={ on: ok } @click='go') {
  p some 😀 text #{b bold 😀} {{ msg 😀 }} \{ x \}
  p= expr😀
  ul: li x
  |
  | piped 😀
  |{
    multi 😀
      line
  }
  p | inline 😀
}
script
if (a < b) { go("😀") }
/script
style
a > b { content: "😀" }
/style
"#;

    fn utf16_slice(source: &str, range: &Value) -> String {
        let units: Vec<u16> = source.encode_utf16().collect();
        let [a, b] = [&range[0], &range[1]].map(|v| v.as_u64().unwrap() as usize);
        String::from_utf16(&units[a..b]).unwrap()
    }

    /// Checks that `v` has a `range` and a `loc` that agree.
    fn assert_located(v: &Value, what: &str) {
        let (range, loc) = (&v["range"], &v["loc"]);
        assert!(range.is_array(), "{what} has no range: {v}");
        assert!(loc.is_object(), "{what} has no loc: {v}");
        assert_eq!(loc["start"]["offset"], range[0], "{what}: {v}");
        assert_eq!(loc["end"]["offset"], range[1], "{what}: {v}");
        for end in ["start", "end"] {
            assert!(loc[end]["line"].as_u64().unwrap() >= 1, "{what}: {v}");
            assert!(loc[end]["column"].is_u64(), "{what}: {v}");
        }
    }

    /// Walks an AST: every node, attribute and `*Span` is located, and no
    /// byte `span` is left. Collects the node types seen.
    fn walk(v: &Value, types: &mut Vec<String>) {
        match v {
            Value::Array(items) => items.iter().for_each(|x| walk(x, types)),
            Value::Object(o) => {
                assert!(o.get("span").is_none(), "byte span left: {v}");
                if let Some(t) = o.get("type").and_then(Value::as_str) {
                    assert_located(v, t);
                    types.push(t.to_owned());
                }
                if o.contains_key("nameSpan") && o.contains_key("escaped") {
                    assert_located(v, "Attribute");
                }
                for (key, value) in o {
                    if key.ends_with("Span") {
                        if !value.is_null() {
                            assert_located(value, key);
                        }
                    } else if key != "loc" {
                        walk(value, types);
                    }
                }
            }
            _ => {}
        }
    }

    #[test]
    fn every_token_and_node_is_located() {
        let source = ALL_SYNTAX;
        let lexed = lex(source);
        assert_eq!(lexed["diagnostics"], json!([]), "{source}");
        let mut kinds = Vec::new();
        for token in lexed["tokens"].as_array().unwrap() {
            let kind = token["type"].as_str().unwrap();
            assert_located(token, kind);
            assert_eq!(
                utf16_slice(source, &token["range"]),
                token["value"].as_str().unwrap(),
                "{token}"
            );
            kinds.push(kind.to_owned());
        }
        kinds.sort();
        kinds.dedup();
        assert_eq!(
            kinds,
            [
                "AttrEq",
                "AttrEqRaw",
                "AttrName",
                "AttrValue",
                "AttrsClose",
                "AttrsOpen",
                "BlockComment",
                "BraceClose",
                "BraceOpen",
                "Class",
                "Colon",
                "Comment",
                "Doctype",
                "Eos",
                "Eq",
                "Expr",
                "Id",
                "InterpEnd",
                "InterpStart",
                "Mustache",
                "Newline",
                "Pipe",
                "PipeClose",
                "PipeOpen",
                "RawEnd",
                "RawStart",
                "SilentBlockComment",
                "SilentComment",
                "Tag",
                "Text",
                "TextNewline",
            ],
            "the source should hold every kind of token"
        );

        let parsed = parse(source);
        assert_eq!(parsed["diagnostics"], json!([]));
        let mut types = Vec::new();
        walk(&parsed["ast"], &mut types);
        types.sort();
        types.dedup();
        assert_eq!(
            types,
            [
                "Comment",
                "Doctype",
                "Element",
                "Interpolation",
                "Mustache",
                "Root",
                "Text"
            ],
            "the source should hold every kind of node"
        );
    }
}
