//! Parser for zamn: tokens to a typed AST.

pub mod ast;

use ast::{Ast, AttrValue, Attribute, Element, Interpolation, Node, Shorthand};
use zamn_lexer::TokenKind::{self, *};
use zamn_lexer::{lex, Diagnostic, Span, Token};

pub struct ParseResult {
    pub ast: Ast,
    /// Lexer and parser diagnostics, in source order.
    pub diagnostics: Vec<Diagnostic>,
}

/// Lex and parse a source file. Never fails; see `diagnostics`.
pub fn parse(src: &str) -> ParseResult {
    let lexed = lex(src);
    let (ast, mut diagnostics) = parse_tokens(src, &lexed.tokens);
    diagnostics.extend(lexed.diagnostics);
    diagnostics.sort_by_key(|d| d.span.start);
    ParseResult { ast, diagnostics }
}

/// Parse tokens produced by `zamn_lexer::lex` for the same `src`.
pub fn parse_tokens(src: &str, tokens: &[Token]) -> (Ast, Vec<Diagnostic>) {
    let mut p = Parser {
        src,
        toks: tokens,
        i: 0,
        diags: Vec::new(),
    };
    let mut nodes = Vec::new();
    p.items(&mut nodes);
    while p.peek() != Eos {
        p.unexpected();
        p.items(&mut nodes);
    }
    (Ast { nodes }, p.diags)
}

struct Parser<'a> {
    src: &'a str,
    toks: &'a [Token],
    i: usize,
    diags: Vec<Diagnostic>,
}

impl<'a> Parser<'a> {
    fn kind(&self, i: usize) -> TokenKind {
        self.toks.get(i).map_or(Eos, |t| t.kind)
    }

    fn peek(&self) -> TokenKind {
        self.kind(self.i)
    }

    fn next(&mut self) -> Token {
        let t = self.toks[self.i];
        self.i += 1;
        t
    }

    fn accept(&mut self, kind: TokenKind) -> Option<Token> {
        (self.peek() == kind).then(|| self.next())
    }

    fn text(&self, t: Token) -> &'a str {
        t.span.slice(self.src)
    }

    /// End offset of the last consumed token.
    fn prev_end(&self) -> u32 {
        self.toks[self.i.saturating_sub(1)].span.end
    }

    fn unexpected(&mut self) {
        if self.peek() == Eos {
            return;
        }
        let t = self.next();
        self.diags.push(Diagnostic::new(
            "UNEXPECTED_TOKEN",
            format!("unexpected {:?}", t.kind),
            t.span,
        ));
    }

    /// Whether the token at `i` is a `|` with nothing after it.
    fn bare_pipe(&self, i: usize) -> bool {
        self.kind(i) == Pipe && !matches!(self.kind(i + 1), Text | Mustache | InterpStart)
    }

    /// Statements up to the end of the enclosing block. Lines of text are
    /// joined as they are: a bare `|` is how a space between them is written.
    fn items(&mut self, out: &mut Vec<Node>) {
        loop {
            match self.peek() {
                Eos | BraceClose => break,
                Newline => {
                    self.next();
                }
                _ => {
                    let before = self.i;
                    self.statement(out);
                    if self.i == before {
                        self.unexpected();
                    }
                }
            }
        }
    }

    fn statement(&mut self, out: &mut Vec<Node>) {
        match self.peek() {
            Comment | SilentComment | BlockComment | SilentBlockComment => {
                let t = self.next();
                let raw = self.text(t);
                let buffered = matches!(t.kind, Comment | BlockComment);
                let block = matches!(t.kind, BlockComment | SilentBlockComment);
                let marker = if buffered { 3 } else { 2 };
                let mut value = &raw[marker.min(raw.len())..];
                if block && raw.len() >= marker + 2 {
                    value = value.strip_suffix("*/").unwrap_or(value);
                }
                out.push(Node::Comment(ast::Comment {
                    buffered,
                    block,
                    value: value.to_string(),
                    span: t.span,
                }));
            }
            Doctype => {
                let t = self.next();
                let value = self.text(t)["doctype".len()..].trim().to_string();
                out.push(Node::Doctype(ast::Doctype {
                    value,
                    span: t.span,
                }));
            }
            Eq => self.interpolation(out),
            Pipe | PipeOpen => self.pipe(out),
            // Text without a `|`, already reported by the lexer.
            Text | Mustache | InterpStart => self.inline(out),
            Tag | Id | Class => {
                let el = self.element();
                out.push(Node::Element(el));
            }
            _ => {}
        }
    }

    fn interpolation(&mut self, out: &mut Vec<Node>) {
        let eq = self.next();
        if let Some(e) = self.accept(Expr) {
            out.push(Node::Interpolation(Interpolation {
                expr: self.text(e).to_string(),
                expr_span: e.span,
                span: eq.span.to(e.span),
            }));
        }
    }

    /// `|`, `| text` or `|{ text }`.
    fn pipe(&mut self, out: &mut Vec<Node>) {
        if self.bare_pipe(self.i) {
            // Whitespace at the end of a line is ignored, so this is how a
            // space between two lines is written.
            let t = self.next();
            out.push(Node::Text(ast::Text {
                value: " ".into(),
                span: t.span,
            }));
            return;
        }
        let open = self.next();
        self.inline(out);
        if open.kind == PipeOpen {
            self.accept(PipeClose);
        }
    }

    /// Text, mustaches and `#{...}` inline elements. Consecutive `Text` and
    /// `TextNewline` tokens make one `Text` node.
    fn inline(&mut self, out: &mut Vec<Node>) {
        let mut text: Option<ast::Text> = None;
        fn flush(text: &mut Option<ast::Text>, out: &mut Vec<Node>) {
            if let Some(t) = text.take() {
                out.push(Node::Text(t));
            }
        }
        loop {
            match self.peek() {
                Text | TextNewline => {
                    let t = self.next();
                    let value = if t.kind == Text { self.text(t) } else { "\n" };
                    match &mut text {
                        Some(prev) => {
                            prev.value.push_str(value);
                            prev.span = prev.span.to(t.span);
                        }
                        None => {
                            text = Some(ast::Text {
                                value: value.to_string(),
                                span: t.span,
                            })
                        }
                    }
                }
                Mustache => {
                    flush(&mut text, out);
                    let t = self.next();
                    out.push(Node::Mustache(ast::Mustache {
                        value: self.text(t).to_string(),
                        span: t.span,
                    }));
                }
                InterpStart => {
                    flush(&mut text, out);
                    self.next();
                    if self.peek() != InterpEnd {
                        self.statement(out);
                    }
                    self.accept(InterpEnd);
                }
                _ => break,
            }
        }
        flush(&mut text, out);
    }

    fn element(&mut self) -> Element {
        let start = self.toks[self.i].span.start;
        let mut el = Element {
            name: "div".into(),
            name_span: None,
            attrs: Vec::new(),
            children: Vec::new(),
            braced: false,
            raw: false,
            span: Span::default(),
        };
        if let Some(t) = self.accept(Tag) {
            el.name = self.text(t).to_string();
            el.name_span = Some(t.span);
        }
        loop {
            match self.peek() {
                Id | Class => {
                    let t = self.next();
                    let is_id = t.kind == Id;
                    el.attrs.push(Attribute {
                        name: if is_id { "id" } else { "class" }.into(),
                        name_span: t.span,
                        value: AttrValue::Str(self.text(t)[1..].to_string()),
                        value_span: Some(Span {
                            start: t.span.start + 1,
                            end: t.span.end,
                        }),
                        escaped: false,
                        shorthand: Some(if is_id {
                            Shorthand::Id
                        } else {
                            Shorthand::Class
                        }),
                        span: t.span,
                    });
                }
                AttrsOpen => self.attrs(&mut el.attrs),
                _ => break,
            }
        }
        for (i, attr) in el.attrs.iter().enumerate() {
            if attr.name != "class" && el.attrs[..i].iter().any(|a| a.name == attr.name) {
                self.diags.push(Diagnostic::new(
                    "DUPLICATE_ATTRIBUTE",
                    format!("Duplicate attribute \"{}\" is not allowed.", attr.name),
                    attr.span,
                ));
            }
        }

        match self.peek() {
            Colon => {
                let colon = self.next();
                let before = self.i;
                self.statement(&mut el.children);
                if self.i == before {
                    self.diags.push(Diagnostic::new(
                        "MISSING_EXPANSION",
                        "`:` must be followed by a tag or text",
                        colon.span,
                    ));
                }
            }
            Eq => self.interpolation(&mut el.children),
            BraceOpen => {
                self.next();
                el.braced = true;
                self.items(&mut el.children);
                self.accept(BraceClose);
            }
            Text | Mustache | InterpStart => self.inline(&mut el.children),
            RawStart => {
                self.next();
                el.raw = true;
                self.inline(&mut el.children);
                self.accept(RawEnd);
            }
            _ => {}
        }
        el.span = Span {
            start,
            end: self.prev_end(),
        };
        el
    }

    fn attrs(&mut self, out: &mut Vec<Attribute>) {
        self.next();
        loop {
            match self.peek() {
                AttrName => {
                    let name = self.next();
                    let raw = self.text(name);
                    let unquoted = match raw.as_bytes()[0] {
                        q @ (b'"' | b'\'' | b'`') if raw.len() >= 2 && raw.ends_with(q as char) => {
                            &raw[1..raw.len() - 1]
                        }
                        _ => raw,
                    };
                    let mut attr = Attribute {
                        name: unquoted.to_string(),
                        name_span: name.span,
                        value: AttrValue::Bool(true),
                        value_span: None,
                        escaped: true,
                        shorthand: None,
                        span: name.span,
                    };
                    if matches!(self.peek(), AttrEq | AttrEqRaw) {
                        attr.escaped = self.next().kind == AttrEq;
                        if let Some(v) = self.accept(AttrValue) {
                            attr.value = self.attr_value(&attr.name, v);
                            attr.value_span = Some(v.span);
                            attr.span = name.span.to(v.span);
                        }
                    }
                    out.push(attr);
                }
                AttrsClose => {
                    self.next();
                    break;
                }
                _ => break,
            }
        }
    }

    fn attr_value(&mut self, name: &str, t: Token) -> AttrValue {
        let raw = self.text(t);
        let quote = raw.as_bytes()[0];
        if matches!(quote, b'"' | b'\'' | b'`') {
            // Find the matching close quote.
            let bytes = raw.as_bytes();
            let mut p = 1;
            while p < bytes.len() && bytes[p] != quote {
                p += if bytes[p] == b'\\' { 2 } else { 1 };
            }
            let p = p.min(raw.len());
            let inner = &raw[1..p];
            if p + 1 != raw.len() || (quote == b'`' && inner.contains("${")) {
                self.js_expression(t.span);
            }
            return AttrValue::Str(unescape(inner));
        }
        match raw {
            "true" => return AttrValue::Bool(true),
            "false" | "null" | "undefined" => return AttrValue::Bool(false),
            _ => {}
        }
        if matches!(quote, b'{' | b'[' | b'(') {
            // A binding's value is an expression for the framework: copied
            // as written, spaces and all.
            if is_binding(name) {
                return AttrValue::Str(raw.to_string());
            }
            if name == "style" && quote == b'{' {
                if let Some(css) = style_object(raw) {
                    return AttrValue::Str(css);
                }
            }
            self.js_expression(t.span);
            return AttrValue::Str(raw.to_string());
        }
        // Otherwise an unquoted value as HTML has it.
        if raw
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | '=' | '<' | '>'))
        {
            self.diags.push(
                Diagnostic::new(
                    "INVALID_ATTRIBUTE_VALUE",
                    "An unquoted attribute value cannot contain whitespace or any of \" ' ` = < >",
                    t.span,
                )
                .with_hint("put the value in quotes"),
            );
        }
        AttrValue::Str(raw.to_string())
    }

    fn js_expression(&mut self, span: Span) {
        // The lexer already reports expressions that continue past the value.
        self.diags.push(
            Diagnostic::new(
                "JS_EXPRESSION",
                "JavaScript expressions are not supported in attribute values",
                span,
            )
            .with_hint(
                "zamn has no JavaScript; quote the value, or write a binding such as `:href` for your framework",
            ),
        );
    }
}

/// A Vue binding (`:to`, `@click`, `#default`, `v-if`, `.prop`), whose value is
/// an expression for the framework.
fn is_binding(name: &str) -> bool {
    (name.starts_with("v-") || name.starts_with([':', '@', '#', '.']))
        && !name.ends_with([':', '@', '#', '.'])
}

/// A CSS property name for a `style={}` key: `--custom` as it is, camelCase
/// to kebab-case as React does (`fontSize` → `font-size`, `WebkitX` →
/// `-webkit-x`, `msX` → `-ms-x`).
fn css_property(key: &str) -> String {
    if key.starts_with("--") {
        return key.to_string();
    }
    let mut out = String::with_capacity(key.len() + 4);
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            out.push('-');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    if out.starts_with("ms-") {
        out.insert(0, '-');
    }
    out
}

/// `style={fontSize: 1em, 'text-align': 'center'}` as CSS:
/// `font-size:1em;text-align:center;`. Keys are names (which may hold `-`)
/// or quoted strings; values are quoted strings, or bare text up to a `,` or
/// `}` outside brackets and quotes. Anything else is `None`.
fn style_object(raw: &str) -> Option<String> {
    let b = raw.as_bytes();
    let mut p = 1;
    let mut css = String::new();
    let skip_ws = |p: &mut usize| {
        while *p < b.len() && b[*p].is_ascii_whitespace() {
            *p += 1;
        }
    };
    // A quoted string at `p`, unescaped; `p` moves past it.
    let string = |p: &mut usize| -> Option<String> {
        let quote = b[*p];
        let start = *p + 1;
        let mut e = start;
        while e < b.len() && b[e] != quote {
            e += if b[e] == b'\\' { 2 } else { 1 };
        }
        if e >= b.len() {
            return None;
        }
        *p = e + 1;
        Some(unescape(&raw[start..e]))
    };
    loop {
        skip_ws(&mut p);
        if p >= b.len() {
            return None;
        }
        if b[p] == b'}' {
            return (p + 1 == b.len()).then_some(css);
        }
        let key = if matches!(b[p], b'"' | b'\'') {
            string(&mut p)?
        } else {
            let start = p;
            while p < b.len()
                && (b[p].is_ascii_alphanumeric() || matches!(b[p], b'_' | b'$' | b'-'))
            {
                p += 1;
            }
            if p == start || b[start].is_ascii_digit() {
                return None;
            }
            raw[start..p].to_string()
        };
        skip_ws(&mut p);
        if b.get(p) != Some(&b':') {
            return None;
        }
        p += 1;
        skip_ws(&mut p);
        let value = match b.get(p)? {
            b'"' | b'\'' => string(&mut p)?,
            _ => {
                let start = p;
                let mut depth = 0usize;
                while p < b.len() {
                    match b[p] {
                        b',' | b'}' if depth == 0 => break,
                        b'"' | b'\'' => {
                            let mut e = p + 1;
                            while e < b.len() && b[e] != b[p] {
                                e += if b[e] == b'\\' { 2 } else { 1 };
                            }
                            p = e;
                        }
                        b'(' | b'[' => depth += 1,
                        b')' | b']' => depth = depth.checked_sub(1)?,
                        b'{' | b'`' => return None,
                        _ => {}
                    }
                    p += 1;
                }
                let value = raw.get(start..p)?.trim();
                if value.is_empty() || p >= b.len() {
                    return None;
                }
                value.to_string()
            }
        };
        css.push_str(&css_property(&key));
        css.push(':');
        css.push_str(&value);
        css.push(';');
        skip_ws(&mut p);
        match b.get(p)? {
            b',' => p += 1,
            b'}' => {}
            _ => return None,
        }
    }
}

/// Resolve JavaScript string escapes in a quoted value.
fn unescape(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        let Some(e) = it.next() else { break };
        match e {
            'n' => out.push('\n'),
            't' => out.push('\t'),
            'r' => out.push('\r'),
            'b' => out.push('\u{8}'),
            'f' => out.push('\u{c}'),
            'v' => out.push('\u{b}'),
            '0' => out.push('\0'),
            '\n' => {}
            '\r' => {
                if it.peek() == Some(&'\n') {
                    it.next();
                }
            }
            'x' | 'u' => {
                let mut hex = String::new();
                if e == 'u' && it.peek() == Some(&'{') {
                    it.next();
                    for h in it.by_ref() {
                        if h == '}' {
                            break;
                        }
                        hex.push(h);
                    }
                } else {
                    for _ in 0..if e == 'x' { 2 } else { 4 } {
                        match it.peek() {
                            Some(h) if h.is_ascii_hexdigit() => hex.push(it.next().unwrap()),
                            _ => break,
                        }
                    }
                }
                match u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                    Some(ch) => out.push(ch),
                    None => {
                        out.push(e);
                        out.push_str(&hex);
                    }
                }
            }
            other => out.push(other),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(src: &str) -> Vec<Node> {
        let r = parse(src);
        assert!(r.diagnostics.is_empty(), "{src:?}: {:?}", r.diagnostics);
        r.ast.nodes
    }

    fn el(n: &Node) -> &Element {
        match n {
            Node::Element(e) => e,
            other => panic!("not an element: {other:?}"),
        }
    }

    /// Children as a compact list: element names, `"text"`s, mustaches.
    fn shape(nodes: &[Node]) -> Vec<String> {
        nodes
            .iter()
            .map(|c| match c {
                Node::Text(t) => format!("{:?}", t.value),
                Node::Element(e) => e.name.clone(),
                Node::Mustache(m) => m.value.clone(),
                Node::Interpolation(i) => format!("= {}", i.expr),
                Node::Comment(c) => format!("comment {:?}", c.value),
                Node::Doctype(d) => format!("doctype {}", d.value),
            })
            .collect()
    }

    #[test]
    fn braces_nest() {
        let nodes = ok("div {\n  .x {\n    button Text\n    p {}\n  }\n}\n");
        let x = el(&el(&nodes[0]).children[0]);
        assert!(x.braced && x.name == "div" && x.name_span.is_none());
        assert_eq!(shape(&x.children), ["button", "p"]);
        assert!(el(&x.children[1]).braced);
    }

    #[test]
    fn whitespace_at_the_end_of_a_line_is_ignored() {
        let nodes = ok("p   text \t\np {\n  |   piped  \n}\nb \n");
        assert_eq!(shape(&el(&nodes[0]).children), ["\"text\""]);
        assert_eq!(shape(&el(&nodes[1]).children), ["\"piped\""]);
        assert!(el(&nodes[2]).children.is_empty());
    }

    #[test]
    fn a_bare_pipe_is_a_space() {
        let nodes = ok("p {\n  b this\n  |  \n  | is\n  |\n  u cool\n}\n");
        assert_eq!(
            shape(&el(&nodes[0]).children),
            ["b", "\" \"", "\"is\"", "\" \"", "u"]
        );
    }

    #[test]
    fn lines_of_text_join_as_they_are() {
        let nodes = ok("p {\n  | a\n  | b\n  |{ c }\n  |\n  | d\n}\n");
        assert_eq!(
            shape(&el(&nodes[0]).children),
            ["\"a\"", "\"b\"", "\"c\"", "\" \"", "\"d\""]
        );
    }

    #[test]
    fn text_forms_are_the_same() {
        let a = ok("div some text\ndiv: | some text\ndiv: |{ some text }\ndiv { |{ some text } }");
        for n in &a {
            assert_eq!(shape(&el(n).children), ["\"some text\""]);
        }
        // After a head, a `|` is text.
        let nodes = ok("div | x\ndiv: | | x\ndiv \\| x");
        assert_eq!(shape(&el(&nodes[0]).children), ["\"| x\""]);
        assert_eq!(shape(&el(&nodes[1]).children), ["\"| x\""]);
        assert_eq!(shape(&el(&nodes[2]).children), ["\"\\\\| x\""]);
    }

    #[test]
    fn escapes_are_resolved() {
        let nodes = ok("p a \\{ b \\} \\#{c\\} \\#[d] e\\f");
        let children = &el(&nodes[0]).children;
        assert_eq!(shape(children), ["\"a { b } #{c} #[d] e\\\\f\""]);
        assert_eq!(
            children[0]
                .span()
                .slice("p a \\{ b \\} \\#{c\\} \\#[d] e\\f"),
            "a \\{ b \\} \\#{c\\} \\#[d] e\\f"
        );
    }

    #[test]
    fn mustaches_and_inline_elements() {
        let nodes = ok("p { | a {{ b }} #{b biba #{i x}} boba }");
        let p = el(&nodes[0]);
        assert_eq!(
            shape(&p.children),
            ["\"a \"", "{{ b }}", "\" \"", "b", "\" boba\""]
        );
        assert_eq!(shape(&el(&p.children[3]).children), ["\"biba \"", "i"]);
    }

    #[test]
    fn multi_line_text_blocks() {
        let nodes = ok("pre: |{\n    line one\n      indented\n\n    last\n  }");
        assert_eq!(
            shape(&el(&nodes[0]).children),
            ["\"line one\\n  indented\\n\\nlast\""]
        );
    }

    #[test]
    fn raw_content() {
        let nodes = ok(
            "script\n  if (a < b) {\n    go()\n  }\n/script\nscript(src=\"a.js\")\nstyle\n/style",
        );
        let script = el(&nodes[0]);
        assert!(script.raw && !script.braced);
        assert_eq!(shape(&script.children), ["\"if (a < b) {\\n  go()\\n}\""]);
        assert!(!el(&nodes[1]).raw && el(&nodes[1]).children.is_empty());
        assert!(el(&nodes[2]).raw && el(&nodes[2]).children.is_empty());
    }

    #[test]
    fn comments_and_doctype() {
        let nodes = ok("doctype html\n// silent\n//! shown\n/*!\n  block\n*/\n/**/");
        assert_eq!(
            shape(&nodes),
            [
                "doctype html",
                "comment \" silent\"",
                "comment \" shown\"",
                "comment \"\\n  block\\n\"",
                "comment \"\""
            ]
        );
        let Node::Comment(c) = &nodes[3] else {
            panic!()
        };
        assert!(c.buffered && c.block);
        let Node::Comment(c) = &nodes[1] else {
            panic!()
        };
        assert!(!c.buffered && !c.block);
    }

    #[test]
    fn block_expansion() {
        let nodes = ok("ul { li: a(href=\"/\") Home }");
        let li = el(&el(&nodes[0]).children[0]);
        assert_eq!(shape(&li.children), ["a"]);
        assert!(parse("p: ")
            .diagnostics
            .iter()
            .any(|d| d.code == "MISSING_EXPANSION"));
    }

    #[test]
    fn attribute_values() {
        let nodes = ok(r#"a(href="\x41\'b" :to='x' disabled n=1 off=false)"#);
        let attrs = &el(&nodes[0]).attrs;
        assert_eq!(attrs[0].value, AttrValue::Str("A'b".into()));
        assert_eq!(attrs[1].name, ":to");
        assert_eq!(attrs[2].value, AttrValue::Bool(true));
        assert_eq!(attrs[3].value, AttrValue::Str("1".into()));
        assert_eq!(attrs[4].value, AttrValue::Bool(false));
    }

    #[test]
    fn style_objects() {
        let style = |src: &str| -> String {
            let nodes = ok(src);
            match &el(&nodes[0]).attrs[0].value {
                AttrValue::Str(s) => s.clone(),
                other => panic!("{other:?}"),
            }
        };
        assert_eq!(
            style("button(style={\n  fontSize: 1em,\n  'text-align': 'center',\n  padding: 1rem 0.5rem,\n  transitionProperty: \"color, background\"\n})"),
            "font-size:1em;text-align:center;padding:1rem 0.5rem;transition-property:color, background;"
        );
        assert_eq!(
            style("p(style={WebkitTransition: none, msFlex: 1, --brand: red, font-size: 2px, color: c})"),
            "-webkit-transition:none;-ms-flex:1;--brand:red;font-size:2px;color:c;"
        );
        assert_eq!(
            style("p(style={color: rgb(0, 0, 0), background: url('a,b'), grid: [a] 1fr,})"),
            "color:rgb(0, 0, 0);background:url('a,b');grid:[a] 1fr;"
        );
        assert_eq!(style("p(style={})"), "");
        // A binding is left alone.
        assert_eq!(style("p(:style={ fontSize: x })"), "{ fontSize: x }");
        for src in [
            "p(style={a: {b: 1}})",
            "p(style={...x})",
            "p(style={a: 'x' + y})",
        ] {
            assert!(
                parse(src)
                    .diagnostics
                    .iter()
                    .any(|d| d.code == "JS_EXPRESSION"),
                "{src}"
            );
        }
    }

    #[test]
    fn js_is_rejected() {
        for src in [
            "a(href=url + 1)",
            "a(class=['a', 'b'])",
            "a(x='a' + b)",
            "a(x=`${y}`)",
        ] {
            let a = parse(src);
            assert!(
                a.diagnostics.iter().any(|d| d.code == "JS_EXPRESSION"),
                "{src}"
            );
        }
    }

    #[test]
    fn errors_still_give_an_ast() {
        let r = parse("{{ x }}\n#{b y}\np ok");
        let codes: Vec<_> = r.diagnostics.iter().map(|d| d.code).collect();
        assert_eq!(codes, ["UNEXPECTED_TEXT", "UNEXPECTED_TEXT"]);
        assert_eq!(shape(&r.ast.nodes), ["{{ x }}", "b", "p"]);
    }
}
