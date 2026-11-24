//! HTML generation for zamn, with source mappings. The output is always
//! HTML5: void elements are written `<img>`, boolean attributes `disabled`.

pub mod sourcemap;

use zamn_lexer::Diagnostic;
use zamn_parser::ast::*;

#[derive(Clone, Debug)]
pub struct Options {
    /// Delimiters for `= expr`. Defaults to `{{` and `}}`.
    pub interpolation: (String, String),
}

impl Default for Options {
    fn default() -> Self {
        Options {
            interpolation: ("{{".into(), "}}".into()),
        }
    }
}

/// A point in the output that corresponds to a point in the source.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Mapping {
    /// Byte offset in the generated HTML.
    pub generated: u32,
    /// Byte offset in the source.
    pub source: u32,
}

pub struct Output {
    pub html: String,
    pub mappings: Vec<Mapping>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn generate(nodes: &[Node], options: &Options) -> Output {
    let mut g = Generator {
        out: String::new(),
        mappings: Vec::new(),
        diags: Vec::new(),
        options,
        raw_text: false,
    };
    g.nodes(nodes);
    Output {
        html: g.out,
        mappings: g.mappings,
        diagnostics: g.diags,
    }
}

const VOID: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

/// Elements whose text is not parsed as HTML by browsers, so it is written
/// as it is.
fn is_raw_text(name: &str) -> bool {
    name.eq_ignore_ascii_case("script") || name.eq_ignore_ascii_case("style")
}

/// Escapes an attribute value: `&`, `<`, `>` and `"`.
fn escape_into(out: &mut String, s: &str) {
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
}

/// Escapes text: `<`, `>`, and `&` unless it starts a character reference
/// (`&name;`, `&#123;`, `&#x1F;`), which passes through. The check is on the
/// pattern alone: a browser shows an unknown `&foo;` as it is anyway.
fn escape_text(out: &mut String, s: &str) {
    let bytes = s.as_bytes();
    let mut written = 0;
    for (i, &b) in bytes.iter().enumerate() {
        let entity = match b {
            b'<' => "&lt;",
            b'>' => "&gt;",
            b'&' if !is_char_ref(&bytes[i + 1..]) => "&amp;",
            _ => continue,
        };
        out.push_str(&s[written..i]);
        out.push_str(entity);
        written = i + 1;
    }
    out.push_str(&s[written..]);
}

/// Whether `rest` (what follows a `&`) completes a character reference:
/// `name;`, `#123;` or `#x1F;`.
fn is_char_ref(rest: &[u8]) -> bool {
    let (digits, is_digit): (&[u8], fn(&u8) -> bool) = match rest {
        [b'#', b'x' | b'X', tail @ ..] => (tail, u8::is_ascii_hexdigit),
        [b'#', tail @ ..] => (tail, u8::is_ascii_digit),
        [first, ..] if first.is_ascii_alphabetic() => (rest, u8::is_ascii_alphanumeric),
        _ => return false,
    };
    let len = digits.iter().take_while(|b| is_digit(b)).count();
    len > 0 && digits.get(len) == Some(&b';')
}

/// Escapes `"` alone, for `.class` and `#id` values: they can't hold `<` or
/// spaces, and Tailwind classes such as `[&>*]:p-2` stay as written.
fn escape_quotes_into(out: &mut String, s: &str) {
    let mut parts = s.split('"');
    out.push_str(parts.next().unwrap_or_default());
    for part in parts {
        out.push_str("&quot;");
        out.push_str(part);
    }
}

struct Generator<'a> {
    out: String,
    mappings: Vec<Mapping>,
    diags: Vec<Diagnostic>,
    options: &'a Options,
    /// Inside `script` or `style`: text is written as it is.
    raw_text: bool,
}

impl Generator<'_> {
    fn map(&mut self, source: u32) {
        self.mappings.push(Mapping {
            generated: self.out.len() as u32,
            source,
        });
    }

    fn nodes(&mut self, nodes: &[Node]) {
        for node in nodes {
            self.node(node);
        }
    }

    fn node(&mut self, node: &Node) {
        match node {
            Node::Element(el) => self.element(el),
            Node::Text(t) => {
                self.map(t.span.start);
                if self.raw_text {
                    self.out.push_str(&t.value);
                } else {
                    escape_text(&mut self.out, &t.value);
                }
            }
            Node::Mustache(m) => {
                self.map(m.span.start);
                self.out.push_str(&m.value);
            }
            Node::Interpolation(i) => {
                self.map(i.span.start);
                self.out.push_str(&self.options.interpolation.0);
                self.out.push(' ');
                self.map(i.expr_span.start);
                self.out.push_str(&i.expr);
                self.map(i.expr_span.end);
                self.out.push(' ');
                self.out.push_str(&self.options.interpolation.1);
            }
            Node::Comment(c) => {
                if c.buffered {
                    self.map(c.span.start);
                    self.out.push_str("<!--");
                    self.out.push_str(&c.value);
                    self.out.push_str("-->");
                }
            }
            Node::Doctype(d) => {
                self.map(d.span.start);
                self.out.push_str("<!DOCTYPE ");
                // A bare `doctype` is an error; `html` is the best guess.
                self.out
                    .push_str(if d.value.is_empty() { "html" } else { &d.value });
                self.out.push('>');
            }
        }
    }

    fn element(&mut self, el: &Element) {
        self.map(el.span.start);
        self.out.push('<');
        self.out.push_str(&el.name);
        self.attrs(&el.attrs);
        self.out.push('>');
        if VOID.contains(&el.name.as_str()) {
            let has_content = el.children.iter().any(|c| match c {
                Node::Text(t) => !t.value.trim().is_empty(),
                Node::Comment(c) => c.buffered,
                _ => true,
            });
            if has_content {
                let span = el.name_span.unwrap_or(el.span);
                self.diags.push(
                    Diagnostic::new(
                        "SELF_CLOSING_CONTENT",
                        format!(
                            "`{0}` is a void element: <{0}> has no content and no closing tag",
                            el.name
                        ),
                        span,
                    )
                    .with_hint("put the content after the element, not inside it"),
                );
            }
            return;
        }
        let raw_text = std::mem::replace(&mut self.raw_text, is_raw_text(&el.name));
        self.nodes(&el.children);
        self.raw_text = raw_text;
        self.map(el.span.end);
        self.out.push_str("</");
        self.out.push_str(&el.name);
        self.out.push('>');
    }

    fn attrs(&mut self, attrs: &[Attribute]) {
        // Classes are merged into a single attribute, written first.
        let mut first = true;
        for attr in attrs.iter().filter(|a| a.name == "class") {
            let AttrValue::Str(value) = &attr.value else {
                continue;
            };
            if value.is_empty() {
                continue;
            }
            if first {
                self.map(attr.span.start);
                self.out.push_str(" class=\"");
                first = false;
            } else {
                self.out.push(' ');
            }
            self.map(value_start(attr));
            self.value(attr, value);
        }
        if !first {
            self.out.push('"');
        }

        for attr in attrs.iter().filter(|a| a.name != "class") {
            match &attr.value {
                AttrValue::Bool(false) => {}
                AttrValue::Bool(true) => {
                    self.out.push(' ');
                    self.map(attr.name_span.start);
                    self.out.push_str(&attr.name);
                }
                AttrValue::Str(value) => {
                    if value.is_empty() && attr.name == "style" {
                        continue;
                    }
                    self.out.push(' ');
                    self.map(attr.name_span.start);
                    self.out.push_str(&attr.name);
                    self.out.push_str("=\"");
                    self.map(value_start(attr));
                    self.value(attr, value);
                    self.out.push('"');
                }
            }
        }
    }

    fn value(&mut self, attr: &Attribute, value: &str) {
        if attr.shorthand.is_some() {
            escape_quotes_into(&mut self.out, value);
        } else if attr.escaped {
            escape_into(&mut self.out, value);
        } else {
            self.out.push_str(value);
        }
    }
}

/// Where an attribute's value starts in the source.
fn value_start(attr: &Attribute) -> u32 {
    attr.value_span.map_or(attr.span.start, |s| s.start)
}

#[cfg(test)]
mod tests {
    use super::*;
    use zamn_lexer::Span;

    fn span(start: u32, end: u32) -> Span {
        Span { start, end }
    }

    fn html(nodes: &[Node]) -> String {
        let out = generate(nodes, &Options::default());
        assert_eq!(out.diagnostics, vec![]);
        out.html
    }

    fn el(name: &str, attrs: Vec<Attribute>, children: Vec<Node>) -> Node {
        Node::Element(Element {
            name: name.into(),
            name_span: Some(span(0, name.len() as u32)),
            attrs,
            children,
            braced: false,
            raw: false,
            span: span(0, 0),
        })
    }

    fn text(value: &str) -> Node {
        Node::Text(Text {
            value: value.into(),
            span: span(0, 0),
        })
    }

    fn attr(name: &str, value: AttrValue) -> Attribute {
        Attribute {
            name: name.into(),
            name_span: span(0, 0),
            value,
            value_span: None,
            escaped: true,
            shorthand: None,
            span: span(0, 0),
        }
    }

    fn str_attr(name: &str, value: &str) -> Attribute {
        attr(name, AttrValue::Str(value.into()))
    }

    fn class(value: &str) -> Attribute {
        Attribute {
            shorthand: Some(Shorthand::Class),
            ..str_attr("class", value)
        }
    }

    fn escaped(s: &str) -> String {
        let mut out = String::new();
        escape_text(&mut out, s);
        out
    }

    #[test]
    fn text_is_escaped() {
        assert_eq!(
            html(&[el(
                "div",
                vec![],
                vec![text("some text <b>real bold lol</b>")]
            )]),
            "<div>some text &lt;b&gt;real bold lol&lt;/b&gt;</div>"
        );
        assert_eq!(escaped("a && b"), "a &amp;&amp; b");
        assert_eq!(escaped("Tom & Jerry"), "Tom &amp; Jerry");
        assert_eq!(escaped("😀 <é>"), "😀 &lt;é&gt;");
    }

    #[test]
    fn character_references_pass_through() {
        for s in [
            "&nbsp;", "&amp;", "&foo1;", "&#123;", "&#x1F;", "&#X1f;", "a&b;c",
        ] {
            assert_eq!(escaped(s), s);
        }
        for (s, out) in [
            ("&", "&amp;"),
            ("&;", "&amp;;"),
            ("&#;", "&amp;#;"),
            ("&#x;", "&amp;#x;"),
            ("&#12a;", "&amp;#12a;"),
            ("&#xG;", "&amp;#xG;"),
            ("&1a;", "&amp;1a;"),
            ("&nbsp", "&amp;nbsp"),
            ("&a-b;", "&amp;a-b;"),
            ("&nbsp;&", "&nbsp;&amp;"),
        ] {
            assert_eq!(escaped(s), out, "{s}");
        }
    }

    #[test]
    fn pre_is_escaped_too() {
        assert_eq!(
            html(&[el("pre", vec![], vec![text("if (a < b) {\n  go()\n}")])]),
            "<pre>if (a &lt; b) {\n  go()\n}</pre>"
        );
    }

    #[test]
    fn script_and_style_are_not_escaped() {
        let js = "if (a < b && c > d) { go() }";
        for raw in [true, false] {
            let Node::Element(mut script) = el("script", vec![], vec![text(js)]) else {
                unreachable!()
            };
            script.raw = raw;
            assert_eq!(
                html(&[Node::Element(script)]),
                format!("<script>{js}</script>")
            );
        }
        assert_eq!(
            html(&[el("style", vec![], vec![text("a > b { c: d }")])]),
            "<style>a > b { c: d }</style>"
        );
        // Only the element's own text: text after it is escaped again.
        assert_eq!(
            html(&[el("script", vec![], vec![text("<")]), text("<")]),
            "<script><</script>&lt;"
        );
    }

    #[test]
    fn mustaches_expressions_and_comments_are_not_escaped() {
        let nodes = [
            Node::Mustache(Mustache {
                value: "{{ a < b && c }}".into(),
                span: span(0, 0),
            }),
            Node::Interpolation(Interpolation {
                expr: "a > b".into(),
                expr_span: span(0, 0),
                span: span(0, 0),
            }),
            Node::Comment(Comment {
                buffered: true,
                block: false,
                value: " <b> & ".into(),
                span: span(0, 0),
            }),
            Node::Comment(Comment {
                buffered: false,
                block: true,
                value: " silent ".into(),
                span: span(0, 0),
            }),
        ];
        assert_eq!(html(&nodes), "{{ a < b && c }}{{ a > b }}<!-- <b> & -->");
    }

    #[test]
    fn doctype() {
        let doctype = |value: &str| {
            Node::Doctype(Doctype {
                value: value.into(),
                span: span(0, 0),
            })
        };
        assert_eq!(html(&[doctype("html")]), "<!DOCTYPE html>");
        assert_eq!(html(&[doctype("xml")]), "<!DOCTYPE xml>");
        assert_eq!(html(&[doctype("")]), "<!DOCTYPE html>");
    }

    #[test]
    fn void_elements_have_no_closing_tag() {
        assert_eq!(
            html(&[
                el("img", vec![str_attr("src", "a.png")], vec![]),
                el("br", vec![], vec![]),
                el("div", vec![], vec![]),
            ]),
            "<img src=\"a.png\"><br><div></div>"
        );
        let out = generate(&[el("input", vec![], vec![text("x")])], &Options::default());
        assert_eq!(out.html, "<input>");
        assert_eq!(out.diagnostics.len(), 1);
        assert_eq!(out.diagnostics[0].code, "SELF_CLOSING_CONTENT");
        assert!(out.diagnostics[0].is_error());
        assert!(out.diagnostics[0].message.contains("void element"));
    }

    #[test]
    fn boolean_attributes_are_terse() {
        assert_eq!(
            html(&[el(
                "input",
                vec![
                    attr("disabled", AttrValue::Bool(true)),
                    attr("checked", AttrValue::Bool(false)),
                    str_attr("type", "checkbox"),
                ],
                vec![],
            )]),
            "<input disabled type=\"checkbox\">"
        );
    }

    #[test]
    fn shorthand_values_escape_quotes_only() {
        let id = Attribute {
            shorthand: Some(Shorthand::Id),
            ..str_attr("id", "a\"b")
        };
        assert_eq!(
            html(&[el(
                "div",
                vec![
                    class("[&>*]:p-2"),
                    class("content-['a\"b']"),
                    str_attr("class", "x&y"),
                    id
                ],
                vec![],
            )]),
            "<div class=\"[&>*]:p-2 content-['a&quot;b'] x&amp;y\" id=\"a&quot;b\"></div>"
        );
    }

    #[test]
    fn attribute_escaping() {
        let raw = Attribute {
            escaped: false,
            ..str_attr("title", "<b>")
        };
        assert_eq!(
            html(&[el("a", vec![str_attr("href", "?a=1&b=\"2\""), raw], vec![])]),
            "<a href=\"?a=1&amp;b=&quot;2&quot;\" title=\"<b>\"></a>"
        );
    }

    #[test]
    fn text_keeps_its_mapping() {
        let nodes = [Node::Element(Element {
            name: "p".into(),
            name_span: Some(span(0, 1)),
            attrs: vec![],
            children: vec![
                Node::Text(Text {
                    value: "a < b".into(),
                    span: span(2, 7),
                }),
                Node::Mustache(Mustache {
                    value: "{{ x }}".into(),
                    span: span(8, 15),
                }),
            ],
            braced: false,
            raw: false,
            span: span(0, 15),
        })];
        let out = generate(&nodes, &Options::default());
        assert_eq!(out.html, "<p>a &lt; b{{ x }}</p>");
        let at = |generated: u32| {
            out.mappings
                .iter()
                .find(|m| m.generated == generated)
                .map(|m| m.source)
        };
        assert_eq!(at(0), Some(0));
        assert_eq!(at(3), Some(2));
        assert_eq!(at(11), Some(8));
        assert_eq!(at(18), Some(15));
    }
}
