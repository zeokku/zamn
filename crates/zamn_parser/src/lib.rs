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
    fn peek(&self) -> TokenKind {
        self.toks.get(self.i).map_or(Eos, |t| t.kind)
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
        let kind = |i: usize| self.toks.get(i).map_or(Eos, |t| t.kind);
        kind(i) == Pipe && !matches!(kind(i + 1), Text | InterpStart)
    }

    /// Statements up to the end of the enclosing block.
    fn items(&mut self, out: &mut Vec<Node>) {
        let mut last_pipe = false;
        loop {
            match self.peek() {
                Eos | Outdent | BraceClose | InterpEnd => break,
                Newline => {
                    let t = self.next();
                    // Consecutive `|` lines are joined with a line break,
                    // unless one of them is a bare `|`, which is a space.
                    if last_pipe && self.peek() == Pipe && !self.bare_pipe(self.i) {
                        out.push(Node::Text(ast::Text {
                            value: "\n".into(),
                            span: t.span,
                        }));
                    }
                }
                Indent => {
                    let t = self.next();
                    self.diags.push(Diagnostic::new(
                        "UNEXPECTED_INDENT",
                        "unexpected indentation: the line above cannot have children",
                        t.span,
                    ));
                    self.items(out);
                    self.accept(Outdent);
                }
                kind => {
                    let before = self.i;
                    last_pipe = kind == Pipe && !self.bare_pipe(before);
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
            Comment | SilentComment => {
                let t = self.next();
                let buffered = t.kind == Comment;
                let value = self.text(t)[if buffered { 2 } else { 3 }..].to_string();
                let mut block = None;
                if self.accept(TextBlockStart).is_some() {
                    let mut s = String::new();
                    loop {
                        match self.peek() {
                            Text => {
                                let t = self.next();
                                s.push_str(self.text(t));
                            }
                            TextNewline => {
                                self.next();
                                s.push('\n');
                            }
                            _ => break,
                        }
                    }
                    self.accept(TextBlockEnd);
                    block = Some(s);
                }
                let span = Span {
                    start: t.span.start,
                    end: self.prev_end(),
                };
                out.push(Node::Comment(ast::Comment {
                    buffered,
                    value,
                    block,
                    span,
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
            Pipe => {
                let bare = self.bare_pipe(self.i);
                let pipe = self.next();
                if bare {
                    // Whitespace at the end of a line is ignored, so this is
                    // how a space between two lines is written.
                    out.push(Node::Text(ast::Text {
                        value: " ".into(),
                        span: pipe.span,
                    }));
                }
                self.inline(out);
            }
            Dot => {
                self.next();
                self.text_block(out);
            }
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

    /// Text and `#[...]` interpolations on one line.
    fn inline(&mut self, out: &mut Vec<Node>) {
        loop {
            match self.peek() {
                Text => {
                    let t = self.next();
                    out.push(Node::Text(ast::Text {
                        value: self.text(t).to_string(),
                        span: t.span,
                    }));
                }
                InterpStart => {
                    self.next();
                    self.statement(out);
                    self.accept(InterpEnd);
                }
                _ => break,
            }
        }
    }

    fn text_block(&mut self, out: &mut Vec<Node>) {
        if self.accept(TextBlockStart).is_none() {
            return;
        }
        loop {
            match self.peek() {
                Text | InterpStart => self.inline(out),
                TextNewline => {
                    let t = self.next();
                    out.push(Node::Text(ast::Text {
                        value: "\n".into(),
                        span: t.span,
                    }));
                }
                _ => break,
            }
        }
        self.accept(TextBlockEnd);
    }

    fn element(&mut self) -> Element {
        let start = self.toks[self.i].span.start;
        let mut el = Element {
            name: "div".into(),
            name_span: None,
            attrs: Vec::new(),
            children: Vec::new(),
            braced: false,
            self_closing: false,
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
            Slash => {
                self.next();
                el.self_closing = true;
            }
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
            Dot => {
                self.next();
                self.text_block(&mut el.children);
            }
            BraceOpen => {
                self.next();
                el.braced = true;
                self.items(&mut el.children);
                self.accept(BraceClose);
            }
            Text | InterpStart => self.inline(&mut el.children),
            _ => {}
        }
        if self.accept(Indent).is_some() {
            self.items(&mut el.children);
            self.accept(Outdent);
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

/// `style={color: 'red', 'font-size': 12}` as CSS, as pug writes it:
/// `color:red;font-size:12;`. Keys are names or quoted strings, values quoted
/// strings or numbers; anything else is `None`.
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
            while p < b.len() && (b[p].is_ascii_alphanumeric() || matches!(b[p], b'_' | b'$')) {
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
                if b[p] == b'-' {
                    p += 1;
                }
                while p < b.len() && (b[p].is_ascii_digit() || b[p] == b'.') {
                    p += 1;
                }
                let number = &raw[start..p];
                number.parse::<f64>().ok()?;
                number.to_string()
            }
        };
        css.push_str(&key);
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

/// Resolve JavaScript string escapes, so quoted values mean what they meant in pug.
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

    fn el(n: &Node) -> &Element {
        match n {
            Node::Element(e) => e,
            other => panic!("not an element: {other:?}"),
        }
    }

    #[test]
    fn braces_match_indentation() {
        let a = parse("div\n  .x {\n    button Text\n    p { }\n  }\n");
        assert!(a.diagnostics.is_empty(), "{:?}", a.diagnostics);
        let div = el(&a.ast.nodes[0]);
        let x = el(&div.children[0]);
        assert!(x.braced && x.name == "div" && x.name_span.is_none());
        assert_eq!(x.children.len(), 2);
        assert_eq!(el(&x.children[0]).name, "button");
        assert!(el(&x.children[1]).braced);
    }

    #[test]
    fn whitespace_at_the_end_of_a_line_is_ignored() {
        let a = parse("p text \t\n  | piped  \nb \n");
        assert!(a.diagnostics.is_empty(), "{:?}", a.diagnostics);
        let texts = |n: &Node| -> Vec<String> {
            el(n)
                .children
                .iter()
                .map(|c| match c {
                    Node::Text(t) => t.value.clone(),
                    other => panic!("not text: {other:?}"),
                })
                .collect()
        };
        assert_eq!(texts(&a.ast.nodes[0]), ["text", "piped"]);
        assert!(el(&a.ast.nodes[1]).children.is_empty());
    }

    #[test]
    fn a_bare_pipe_is_a_space() {
        // No line break joins a bare `|` to the `|` lines around it.
        let a = parse("p\n  b this\n  |  \n  | is\n  |\n  u cool\n  | a\n  | b\n");
        assert!(a.diagnostics.is_empty(), "{:?}", a.diagnostics);
        let shape: Vec<String> = el(&a.ast.nodes[0])
            .children
            .iter()
            .map(|c| match c {
                Node::Text(t) => format!("{:?}", t.value),
                Node::Element(e) => e.name.clone(),
                other => panic!("unexpected: {other:?}"),
            })
            .collect();
        assert_eq!(
            shape,
            ["b", "\" \"", "\"is\"", "\" \"", "u", "\"a\"", "\"\\n\"", "\"b\""]
        );
    }

    #[test]
    fn attribute_values() {
        let a = parse(r#"a(href="\x41\'b" :to='x' disabled n=1 off=false)"#);
        assert!(a.diagnostics.is_empty(), "{:?}", a.diagnostics);
        let attrs = &el(&a.ast.nodes[0]).attrs;
        assert_eq!(attrs[0].value, AttrValue::Str("A'b".into()));
        assert_eq!(attrs[1].name, ":to");
        assert_eq!(attrs[2].value, AttrValue::Bool(true));
        assert_eq!(attrs[3].value, AttrValue::Str("1".into()));
        assert_eq!(attrs[4].value, AttrValue::Bool(false));
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
}
