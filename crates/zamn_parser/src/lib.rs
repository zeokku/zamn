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

    /// Statements up to the end of the enclosing block.
    fn items(&mut self, out: &mut Vec<Node>) {
        let mut last_pipe = false;
        loop {
            match self.peek() {
                Eos | Outdent | BraceClose | InterpEnd => break,
                Newline => {
                    let t = self.next();
                    // Consecutive `|` lines are joined with a line break.
                    if last_pipe && self.peek() == Pipe {
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
                    self.statement(out);
                    last_pipe = kind == Pipe;
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
            Include => {
                let t = self.next();
                if let Some(path) = self.accept(Path) {
                    out.push(Node::Include(ast::Include {
                        path: self.text(path).to_string(),
                        path_span: path.span,
                        span: t.span.to(path.span),
                    }));
                }
                if let Some(indent) = self.accept(Indent) {
                    self.diags.push(
                        Diagnostic::new(
                            "UNSUPPORTED_SYNTAX",
                            "An include cannot have a block",
                            indent.span,
                        )
                        .with_hint("zamn has no `yield`; included files are inserted as they are"),
                    );
                    self.items(&mut Vec::new());
                    self.accept(Outdent);
                }
            }
            Eq => self.interpolation(out),
            Pipe => {
                self.next();
                self.inline(out);
            }
            RawHtml => {
                let t = self.next();
                // Consecutive HTML lines keep their line breaks.
                if let Some(Node::RawHtml(prev)) = out.last() {
                    let gap = Span {
                        start: prev.span.end,
                        end: t.span.start,
                    };
                    out.push(Node::Text(ast::Text {
                        value: "\n".into(),
                        span: gap,
                    }));
                }
                out.push(Node::RawHtml(ast::RawHtml {
                    value: self.text(t).to_string(),
                    span: t.span,
                }));
                // Lines indented under an HTML line are its siblings.
                if self.accept(Indent).is_some() {
                    self.items(out);
                    self.accept(Outdent);
                }
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
                            attr.value = self.attr_value(v);
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

    fn attr_value(&mut self, t: Token) -> AttrValue {
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
            "true" => AttrValue::Bool(true),
            "false" | "null" | "undefined" => AttrValue::Bool(false),
            _ => {
                let bare = raw
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.' | b'%'));
                if !bare {
                    self.js_expression(t.span);
                }
                AttrValue::Str(raw.to_string())
            }
        }
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
                "zamn has no JavaScript; attribute values are quoted strings, numbers or bare words",
            ),
        );
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
