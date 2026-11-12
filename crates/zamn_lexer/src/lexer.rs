use crate::{Diagnostic, Span, Token, TokenKind};
use TokenKind::*;

pub struct LexResult {
    pub tokens: Vec<Token>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Tokenise a source file. Never fails: problems are reported as diagnostics
/// and the lexer resumes on the next line.
pub fn lex(src: &str) -> LexResult {
    let mut lx = Lexer {
        src,
        b: src.as_bytes(),
        pos: 0,
        eol: 0,
        tokens: Vec::new(),
        diags: Vec::new(),
        stack: Vec::new(),
        base_set: false,
        after_brace: false,
        frames: Vec::new(),
    };
    lx.run();
    LexResult {
        tokens: lx.tokens,
        diagnostics: lx.diags,
    }
}

/// Indentation state saved while a `{ }` block is open.
struct Frame {
    stack: Vec<usize>,
    open: Span,
}

/// A line gathered for a text block.
struct Line {
    start: usize,
    end: usize,
    indent: usize,
    blank: bool,
}

struct Lexer<'a> {
    src: &'a str,
    b: &'a [u8],
    pos: usize,
    /// End of the current line's content (before any `\r\n`).
    eol: usize,
    tokens: Vec<Token>,
    diags: Vec<Diagnostic>,
    /// Indentation levels of the current frame; `stack[0]` is its base.
    stack: Vec<usize>,
    /// Whether the current frame has seen its first line.
    base_set: bool,
    /// The previous line closed a brace block.
    after_brace: bool,
    frames: Vec<Frame>,
}

const NO_JS: &str =
    "zamn has no JavaScript; attribute values are quoted strings, numbers or bare words";
const NO_CONTROL_FLOW: &str =
    "zamn has no control flow; use your framework's directives, e.g. `div(v-if=\"cond\")`";

fn is_ws(c: u8) -> bool {
    c == b' ' || c == b'\t'
}

fn is_word(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

fn is_quote(c: u8) -> bool {
    matches!(c, b'"' | b'\'' | b'`')
}

/// Characters that can only start the continuation of a JavaScript expression,
/// never an attribute name.
fn is_operator(c: u8) -> bool {
    matches!(
        c,
        b'+' | b'-' | b'/' | b'?' | b'<' | b'>' | b'|' | b'&' | b'%' | b'^' | b'~' | b'='
    )
}

/// Pug constructs that zamn deliberately drops: (description, hint).
fn removed_keyword(rest: &str) -> Option<(&'static str, &'static str)> {
    let len = rest.bytes().take_while(u8::is_ascii_lowercase).count();
    let (word, after) = rest.split_at(len);
    let space = after.starts_with([' ', '\t']);
    let end = after.trim().is_empty();
    match word {
        "if" | "unless" | "while" | "case" | "when" | "each" | "for" if space => {
            Some(("control flow", NO_CONTROL_FLOW))
        }
        "else" if space || end => Some(("control flow", NO_CONTROL_FLOW)),
        "default" if end || after.starts_with(':') => Some(("control flow", NO_CONTROL_FLOW)),
        "mixin" if space => Some(("mixins", "use `include` or a component instead")),
        "extends" | "extend" | "append" | "prepend" if space => {
            Some(("template inheritance", "use `include` instead"))
        }
        "block" if space || end => Some(("template inheritance", "use `include` instead")),
        "yield" if end => Some(("template inheritance", "use `include` instead")),
        _ => None,
    }
}

impl<'a> Lexer<'a> {
    fn push(&mut self, kind: TokenKind, start: usize, end: usize) {
        self.tokens.push(Token {
            kind,
            span: Span::new(start, end),
        });
    }

    fn error(&mut self, code: &'static str, message: impl Into<String>, start: usize, end: usize) {
        self.diags
            .push(Diagnostic::new(code, message, Span::new(start, end)));
    }

    fn unsupported(&mut self, what: &str, hint: &str, start: usize, end: usize) {
        self.diags.push(
            Diagnostic::new(
                "UNSUPPORTED_SYNTAX",
                format!("{what} is not supported"),
                Span::new(start, end),
            )
            .with_hint(hint),
        );
    }

    fn at(&self, i: usize) -> u8 {
        if i < self.b.len() {
            self.b[i]
        } else {
            0
        }
    }

    /// End of the content of the line containing `from` (excludes `\r\n`).
    fn content_end(&self, from: usize) -> usize {
        let mut e = from;
        while e < self.b.len() && self.b[e] != b'\n' {
            e += 1;
        }
        if e > from && self.b[e - 1] == b'\r' {
            e -= 1;
        }
        e
    }

    /// Start of the line after the one whose content ends at `eol`.
    fn next_line(&self, eol: usize) -> usize {
        let mut p = eol;
        if self.at(p) == b'\r' {
            p += 1;
        }
        if self.at(p) == b'\n' {
            p += 1;
        }
        p
    }

    fn run(&mut self) {
        if self.src.starts_with('\u{feff}') {
            self.pos = 3;
        }
        let n = self.b.len();
        while self.pos < n {
            let line_start = self.pos;
            self.eol = self.content_end(line_start);
            let mut i = line_start;
            while i < self.eol && is_ws(self.b[i]) {
                i += 1;
            }
            if i < self.eol {
                let ws = &self.b[line_start..i];
                if ws.contains(&b' ') && ws.contains(&b'\t') {
                    self.error(
                        "INVALID_INDENTATION",
                        "Invalid indentation, you can use tabs or spaces but not both",
                        line_start,
                        i,
                    );
                }
                if self.b[i] == b'}' {
                    self.close_brace(i);
                } else {
                    self.layout(i - line_start, line_start, i);
                    self.pos = i;
                    self.statement(i - line_start, false);
                    self.finish_line();
                }
            }
            let next = self.next_line(self.eol);
            if next == self.eol {
                break;
            }
            self.pos = next;
        }
        while let Some(frame) = self.frames.pop() {
            self.diags.push(
                Diagnostic::new("UNCLOSED_BRACE", "This `{` is never closed", frame.open)
                    .with_hint("add a `}` on its own line"),
            );
            for _ in 1..self.stack.len() {
                self.push(Outdent, n, n);
            }
            self.push(BraceClose, n, n);
            self.stack = frame.stack;
        }
        for _ in 1..self.stack.len() {
            self.push(Outdent, n, n);
        }
        self.push(Eos, n, n);
    }

    /// Emit the layout token(s) for a new line indented by `indent`.
    fn layout(&mut self, indent: usize, line_start: usize, content: usize) {
        let after_brace = std::mem::take(&mut self.after_brace);
        if !self.base_set {
            self.base_set = true;
            self.stack = vec![indent];
            return;
        }
        let top = *self.stack.last().unwrap();
        if indent > top {
            if after_brace {
                self.diags.push(
                    Diagnostic::new(
                        "INVALID_INDENTATION",
                        "Unexpected indentation after a closing `}`",
                        Span::new(line_start, content),
                    )
                    .with_hint("children of a braced element go inside its braces"),
                );
                self.push(Newline, line_start, content);
            } else {
                self.stack.push(indent);
                self.push(Indent, line_start, content);
            }
            return;
        }
        let mut popped = top;
        while self.stack.len() > 1 && *self.stack.last().unwrap() > indent {
            popped = self.stack.pop().unwrap();
            self.push(Outdent, content, content);
        }
        let top = *self.stack.last().unwrap();
        if top != indent {
            let message = if indent < top {
                format!(
                    "Inconsistent indentation. This line is indented less than the first line of its block ({top} spaces/tabs)."
                )
            } else {
                format!("Inconsistent indentation. Expecting either {top} or {popped} spaces/tabs.")
            };
            self.error("INCONSISTENT_INDENTATION", message, line_start, content);
        }
        self.push(Newline, line_start, content);
    }

    fn finish_line(&mut self) {
        let mut p = self.pos;
        while p < self.eol && is_ws(self.b[p]) {
            p += 1;
        }
        if p < self.eol {
            self.unexpected_text(p);
        }
        self.pos = self.eol;
    }

    fn unexpected_text(&mut self, at: usize) {
        let end = self.eol.max(at);
        let shown: String = self.src[at..end].chars().take(5).collect();
        self.error(
            "UNEXPECTED_TEXT",
            format!("unexpected text \"{shown}\""),
            at,
            end,
        );
    }

    /// Give up on the current statement.
    fn bail(&mut self, interp: bool) {
        if interp {
            while self.pos < self.eol && self.b[self.pos] != b']' {
                self.pos += 1;
            }
        } else {
            self.pos = self.eol;
        }
    }

    fn close_brace(&mut self, at: usize) {
        let Some(frame) = self.frames.pop() else {
            self.error(
                "UNMATCHED_BRACE",
                "This `}` does not close any `{`",
                at,
                at + 1,
            );
            return;
        };
        for _ in 1..self.stack.len() {
            self.push(Outdent, at, at);
        }
        self.push(BraceClose, at, at + 1);
        self.stack = frame.stack;
        self.base_set = true;
        self.after_brace = true;
        self.pos = at + 1;
        self.finish_line();
    }

    /// If a `{` block opens at the cursor, consume it.
    fn brace_open(&mut self) -> bool {
        let mut j = self.pos;
        while j < self.eol && is_ws(self.b[j]) {
            j += 1;
        }
        if self.at(j) != b'{' || j >= self.eol || self.at(j + 1) == b'{' {
            return false;
        }
        let mut k = j + 1;
        while k < self.eol && is_ws(self.b[k]) {
            k += 1;
        }
        if k == self.eol {
            self.push(BraceOpen, j, j + 1);
            self.frames.push(Frame {
                stack: std::mem::take(&mut self.stack),
                open: Span::new(j, j + 1),
            });
            self.base_set = false;
            self.pos = self.eol;
            return true;
        }
        if self.b[k] == b'}' && self.src[k + 1..self.eol].trim().is_empty() {
            self.push(BraceOpen, j, j + 1);
            self.push(BraceClose, k, k + 1);
            self.pos = self.eol;
            return true;
        }
        false
    }

    fn statement(&mut self, indent: usize, interp: bool) {
        let src = self.src;
        let s = self.pos;
        let rest = &src[s..self.eol];
        if rest.is_empty() {
            return;
        }
        if !interp {
            if rest.starts_with("//") {
                let kind = if rest.starts_with("//-") {
                    SilentComment
                } else {
                    Comment
                };
                self.push(kind, s, self.eol);
                self.pos = self.eol;
                self.text_block(indent, false);
                return;
            }
            if let Some(after) = rest.strip_prefix("doctype") {
                if after.is_empty() || after.starts_with([' ', '\t']) {
                    self.push(Doctype, s, self.eol);
                    self.pos = self.eol;
                    return;
                }
            }
            if let Some(after) = rest.strip_prefix("include") {
                if after.starts_with(':') {
                    self.unsupported(
                        "An include filter",
                        "zamn has no filters; include the file directly",
                        s,
                        self.eol,
                    );
                    self.pos = self.eol;
                    return;
                }
                if after.is_empty() || after.starts_with([' ', '\t']) {
                    self.push(Include, s, s + 7);
                    let path = after.trim();
                    if path.is_empty() {
                        self.error("NO_INCLUDE_PATH", "missing path for include", s, self.eol);
                    } else {
                        let start = s + 7 + (after.len() - after.trim_start().len());
                        self.push(Path, start, start + path.len());
                    }
                    self.pos = self.eol;
                    return;
                }
            }
            if let Some((what, hint)) = removed_keyword(rest) {
                let what = format!(
                    "`{}` ({what})",
                    rest.split([' ', '\t', ':']).next().unwrap()
                );
                self.unsupported(&what, hint, s, self.eol);
                self.skip_block(indent);
                return;
            }
        }
        match self.b[s] {
            b'-' => {
                self.unsupported(
                    "Unbuffered code (`- ...`)",
                    "zamn has no JavaScript; move the logic into your component",
                    s,
                    self.eol,
                );
                self.skip_or_bail(indent, interp);
            }
            b'!' if self.at(s + 1) == b'=' => {
                self.unsupported(
                    "Unescaped buffered code (`!=`)",
                    "use `=` for `{{ }}` interpolation, or `v-html` for raw HTML",
                    s,
                    self.eol,
                );
                self.bail(interp);
            }
            b'+' => {
                self.unsupported(
                    "A mixin call",
                    "use `include` or a component instead",
                    s,
                    self.eol,
                );
                self.skip_or_bail(indent, interp);
            }
            b':' => {
                self.unsupported("A filter", "zamn has no filters", s, self.eol);
                self.skip_or_bail(indent, interp);
            }
            b'#' if self.at(s + 1) == b'{' => {
                self.unsupported(
                    "An interpolated tag name (`#{...}`)",
                    "write the tag name literally",
                    s,
                    self.eol,
                );
                self.bail(interp);
            }
            b'=' => self.expr(interp),
            b'|' => {
                self.push(Pipe, s, s + 1);
                self.pos = s + 1;
                if self.pos < self.eol && self.b[self.pos] == b' ' {
                    self.pos += 1;
                }
                self.text_run(interp);
            }
            b'<' if !interp => {
                self.push(RawHtml, s, self.eol);
                self.pos = self.eol;
            }
            b'.' if !interp && rest[1..].trim().is_empty() => {
                self.push(Dot, s, s + 1);
                self.pos = self.eol;
                self.text_block(indent, true);
            }
            _ => self.head(indent, interp),
        }
    }

    fn skip_or_bail(&mut self, indent: usize, interp: bool) {
        if interp {
            self.bail(true);
        } else {
            self.skip_block(indent);
        }
    }

    /// `= expr`: the expression is opaque text up to the end of the line (or
    /// the closing `]` of an interpolation).
    fn expr(&mut self, interp: bool) {
        let s = self.pos;
        self.push(Eq, s, s + 1);
        let mut start = s + 1;
        while start < self.eol && is_ws(self.b[start]) {
            start += 1;
        }
        let mut end = self.eol;
        if interp {
            let mut depth = 0usize;
            let mut p = start;
            while p < self.eol {
                match self.b[p] {
                    c if is_quote(c) => {
                        p = self.skip_string(p).min(self.eol);
                        continue;
                    }
                    b'[' => depth += 1,
                    b']' if depth == 0 => break,
                    b']' => depth -= 1,
                    _ => {}
                }
                p += 1;
            }
            end = p;
        }
        let stop = end;
        while end > start && is_ws(self.b[end - 1]) {
            end -= 1;
        }
        if end == start {
            self.error(
                "MISSING_EXPRESSION",
                "`=` must be followed by an expression",
                s,
                stop,
            );
        } else {
            self.push(Expr, start, end);
        }
        self.pos = stop;
    }

    /// Tag name, `#id`, `.class` and `(attrs)`, then whatever follows them.
    fn head(&mut self, indent: usize, interp: bool) {
        let s = self.pos;
        let mut any = false;
        if is_word(self.b[s]) {
            let mut e = s + 1;
            while e < self.eol && (is_word(self.b[e]) || self.b[e] == b'-' || self.b[e] == b':') {
                e += 1;
            }
            while !is_word(self.b[e - 1]) {
                e -= 1;
            }
            self.push(Tag, s, e);
            self.pos = e;
            any = true;
        }
        loop {
            let p = self.pos;
            if p >= self.eol {
                break;
            }
            match self.b[p] {
                b'#' => {
                    let mut e = p + 1;
                    while e < self.eol && (is_word(self.b[e]) || self.b[e] == b'-') {
                        e += 1;
                    }
                    if e == p + 1 {
                        if !any {
                            break;
                        }
                        self.error("INVALID_ID", "`#` must be followed by a valid ID", p, p + 1);
                        return self.bail(interp);
                    }
                    self.push(Id, p, e);
                    self.pos = e;
                }
                b'.' => {
                    let mut e = p + 1;
                    let mut named = false;
                    while e < self.eol
                        && (self.b[e].is_ascii_alphanumeric() || matches!(self.b[e], b'_' | b'-'))
                    {
                        named |= self.b[e].is_ascii_alphabetic() || self.b[e] == b'_';
                        e += 1;
                    }
                    if named {
                        self.push(Class, p, e);
                        self.pos = e;
                    } else if any && !interp && self.src[p + 1..self.eol].trim().is_empty() {
                        break;
                    } else if e > p + 1 {
                        self.error(
                            "INVALID_CLASS_NAME",
                            "Class names must contain at least one letter or underscore.",
                            p,
                            e,
                        );
                        return self.bail(interp);
                    } else {
                        self.error(
                            "INVALID_CLASS_NAME",
                            "`.` must be followed by a class name. Class names can only contain \"_\", \"-\", a-z and 0-9",
                            p,
                            p + 1,
                        );
                        return self.bail(interp);
                    }
                }
                b'(' if any => {
                    if !self.attrs() {
                        return;
                    }
                }
                _ => break,
            }
            any = true;
        }
        if !any {
            self.unexpected_text(s);
            return self.bail(interp);
        }

        let p = self.pos;
        if p >= self.eol {
            return;
        }
        match self.b[p] {
            b']' if interp => {}
            b'/' => {
                self.push(Slash, p, p + 1);
                self.pos = p + 1;
            }
            b':' if self.at(p + 1) == b' ' => {
                self.push(Colon, p, p + 1);
                self.pos = p + 1;
                while self.pos < self.eol && self.b[self.pos] == b' ' {
                    self.pos += 1;
                }
                self.statement(indent, interp);
            }
            b'=' => self.expr(interp),
            b'!' if self.at(p + 1) == b'=' => {
                self.unsupported(
                    "Unescaped buffered code (`!=`)",
                    "use `=` for `{{ }}` interpolation, or `v-html` for raw HTML",
                    p,
                    self.eol,
                );
                self.bail(interp);
            }
            b'&' if self.src[p..self.eol].starts_with("&attributes") => {
                self.unsupported(
                    "`&attributes`",
                    "zamn has no JavaScript; list the attributes explicitly",
                    p,
                    self.eol,
                );
                self.bail(interp);
            }
            b'.' if !interp => {
                // Only reachable when the rest of the line is blank.
                self.push(Dot, p, p + 1);
                self.pos = self.eol;
                self.text_block(indent, true);
            }
            c if is_ws(c) || c == b'{' => {
                if !interp && self.brace_open() {
                    return;
                }
                if c == b'{' {
                    self.unexpected_text(p);
                    return self.bail(interp);
                }
                self.pos = p + 1;
                if self.at(self.pos) == b'\\' && self.at(self.pos + 1) == b'{' {
                    // `\{` starts text with a literal brace.
                    self.pos += 1;
                }
                if self.pos >= self.eol {
                    // `tag ` with a single trailing space is a one-space text, as in pug.
                    self.push(Text, p, p + 1);
                } else {
                    self.text_run(interp);
                }
            }
            _ => {
                self.unexpected_text(p);
                self.bail(interp);
            }
        }
    }

    /// Index just past the string literal starting at `p`.
    fn skip_string(&self, mut p: usize) -> usize {
        let quote = self.b[p];
        let n = self.b.len();
        p += 1;
        while p < n {
            match self.b[p] {
                b'\\' => p += 2,
                c if c == quote => return p + 1,
                _ => p += 1,
            }
        }
        n
    }

    /// End of a bare value / expression starting at `p`: the next whitespace,
    /// `,` or `)` outside any nesting.
    fn value_end(&self, mut p: usize, stop_at_ws: bool) -> usize {
        let n = self.b.len();
        let mut depth = 0usize;
        while p < n {
            let c = self.b[p];
            if depth == 0 && (c == b',' || c == b')' || (stop_at_ws && c.is_ascii_whitespace())) {
                break;
            }
            match c {
                c if is_quote(c) => {
                    p = self.skip_string(p);
                    continue;
                }
                b'(' | b'[' | b'{' => depth += 1,
                b')' | b']' | b'}' => depth = depth.saturating_sub(1),
                _ => {}
            }
            p += 1;
        }
        p
    }

    /// `( name=value, ... )`. May span several lines. Returns false when the
    /// closing paren is missing.
    fn attrs(&mut self) -> bool {
        let open = self.pos;
        let mark = self.tokens.len();
        let n = self.b.len();
        self.push(AttrsOpen, open, open + 1);
        let mut p = open + 1;
        loop {
            while p < n && (self.b[p].is_ascii_whitespace() || self.b[p] == b',') {
                p += 1;
            }
            if p >= n {
                self.tokens.truncate(mark);
                self.error(
                    "NO_END_BRACKET",
                    "The end of the file was reached with no closing bracket `)` found.",
                    open,
                    open + 1,
                );
                self.pos = self.eol;
                return false;
            }
            if self.b[p] == b')' {
                self.push(AttrsClose, p, p + 1);
                self.pos = p + 1;
                self.eol = self.content_end(self.pos);
                return true;
            }

            // name
            let name_start = p;
            if is_quote(self.b[p]) {
                p = self.skip_string(p);
            } else if is_operator(self.b[p]) {
                p = self.value_end(p, false);
                self.diags.push(
                    Diagnostic::new(
                        "JS_EXPRESSION",
                        "JavaScript expressions are not supported in attributes",
                        Span::new(name_start, p),
                    )
                    .with_hint(NO_JS),
                );
                continue;
            } else {
                let mut depth = 0usize;
                while p < n {
                    let c = self.b[p];
                    if depth == 0
                        && (c.is_ascii_whitespace()
                            || matches!(c, b'=' | b',' | b')')
                            || (c == b'!' && self.at(p + 1) == b'='))
                    {
                        break;
                    }
                    match c {
                        b'(' | b'[' => depth += 1,
                        b')' | b']' => depth = depth.saturating_sub(1),
                        _ => {}
                    }
                    p += 1;
                }
            }
            self.push(AttrName, name_start, p);

            // assignment
            let mut q = p;
            while q < n && self.b[q].is_ascii_whitespace() {
                q += 1;
            }
            let value_start = if self.at(q) == b'=' {
                self.push(AttrEq, q, q + 1);
                q + 1
            } else if self.at(q) == b'!' && self.at(q + 1) == b'=' {
                self.push(AttrEqRaw, q, q + 2);
                q + 2
            } else {
                continue;
            };
            let mut v = value_start;
            while v < n && self.b[v].is_ascii_whitespace() {
                v += 1;
            }
            if v >= n || matches!(self.b[v], b',' | b')') {
                self.error(
                    "MISSING_ATTRIBUTE_VALUE",
                    "missing attribute value",
                    q,
                    value_start,
                );
                p = v;
                continue;
            }
            p = self.value_end(v, true);
            self.push(AttrValue, v, p);

            // `'a' + b` and friends: the value continues as a JS expression.
            let mut q = p;
            while q < n && self.b[q].is_ascii_whitespace() {
                q += 1;
            }
            if q < n && is_operator(self.b[q]) {
                p = self.value_end(q, false);
                self.diags.push(
                    Diagnostic::new(
                        "JS_EXPRESSION",
                        "JavaScript expressions are not supported in attribute values",
                        Span::new(v, p),
                    )
                    .with_hint(NO_JS),
                );
            }
        }
    }

    /// Text up to the end of the line, split around `#[tag ...]` interpolation.
    fn text_run(&mut self, interp: bool) {
        let mut seg = self.pos;
        let mut p = self.pos;
        while p < self.eol {
            let c = self.b[p];
            if interp && c == b']' {
                break;
            }
            if c == b'\\' && self.src[p + 1..self.eol].starts_with("#[") {
                // `\#[` is a literal `#[`; drop the backslash.
                if p > seg {
                    self.push(Text, seg, p);
                }
                seg = p + 1;
                p += 3;
                continue;
            }
            if c == b'#' && self.at(p + 1) == b'[' && p + 1 < self.eol {
                if p > seg {
                    self.push(Text, seg, p);
                }
                self.push(InterpStart, p, p + 2);
                self.pos = p + 2;
                self.statement(0, true);
                if self.pos < self.eol && self.b[self.pos] == b']' {
                    self.push(InterpEnd, self.pos, self.pos + 1);
                    self.pos += 1;
                } else {
                    self.error(
                        "NO_END_BRACKET",
                        "End of line was reached with no closing bracket for interpolation.",
                        p,
                        p + 2,
                    );
                    self.push(InterpEnd, self.pos, self.pos);
                }
                p = self.pos;
                seg = p;
                continue;
            }
            p += 1;
        }
        if p > seg {
            self.push(Text, seg, p);
        }
        self.pos = p;
    }

    /// The lines after the current one that are blank or indented deeper than
    /// `indent`, and whether the run was ended by the end of the file.
    fn gather(&self, indent: usize) -> (Vec<Line>, bool) {
        let n = self.b.len();
        let mut lines = Vec::new();
        let mut p = self.next_line(self.eol);
        if p == self.eol {
            return (lines, true);
        }
        while p < n {
            let end = self.content_end(p);
            let mut i = p;
            while i < end && is_ws(self.b[i]) {
                i += 1;
            }
            let blank = i == end;
            if !blank && i - p <= indent {
                return (lines, false);
            }
            lines.push(Line {
                start: p,
                end,
                indent: i - p,
                blank,
            });
            let next = self.next_line(end);
            if next == end {
                break;
            }
            p = next;
        }
        (lines, true)
    }

    /// Skip the block nested under an unsupported construct so it does not
    /// produce a cascade of errors.
    fn skip_block(&mut self, indent: usize) {
        self.pos = self.eol;
        let (lines, _) = self.gather(indent);
        if let Some(last) = lines.iter().rev().find(|l| !l.blank) {
            self.eol = last.end;
            self.pos = last.end;
        }
    }

    /// The indented block of raw text after a trailing `.` or a comment.
    fn text_block(&mut self, indent: usize, interpolate: bool) {
        let (mut lines, hit_eof) = self.gather(indent);
        let Some(first) = lines.iter().position(|l| !l.blank) else {
            return;
        };
        lines.drain(..first);
        if hit_eof {
            while lines.last().is_some_and(|l| l.blank) {
                lines.pop();
            }
        }
        let base = lines
            .iter()
            .filter(|l| !l.blank)
            .map(|l| l.indent)
            .min()
            .unwrap();
        self.push(TextBlockStart, lines[0].start, lines[0].start);
        let mut prev_end = lines[0].start;
        for (k, line) in lines.iter().enumerate() {
            if k > 0 {
                self.push(TextNewline, prev_end, line.start);
            }
            let start = (line.start + base).min(line.end);
            if start < line.end {
                if interpolate {
                    self.pos = start;
                    self.eol = line.end;
                    self.text_run(false);
                } else {
                    self.push(Text, start, line.end);
                }
            }
            prev_end = line.end;
        }
        self.push(TextBlockEnd, prev_end, prev_end);
        self.eol = prev_end;
        self.pos = prev_end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(src: &str) -> Vec<TokenKind> {
        let r = lex(src);
        assert!(r.diagnostics.is_empty(), "{:?}", r.diagnostics);
        r.tokens.iter().map(|t| t.kind).collect()
    }

    #[test]
    fn braces_and_indentation() {
        let src = "div\n  .another-div {\n    button Text\n    p { }\n  }\n";
        assert_eq!(
            kinds(src),
            vec![
                Tag, Indent, Class, BraceOpen, Tag, Text, Newline, Tag, BraceOpen, BraceClose,
                BraceClose, Outdent, Eos
            ]
        );
    }

    #[test]
    fn brace_block_base_indent_is_free() {
        let src = "ul {\nli\n  a x\n}\np";
        assert_eq!(
            kinds(src),
            vec![Tag, BraceOpen, Tag, Indent, Tag, Text, Outdent, BraceClose, Newline, Tag, Eos]
        );
    }

    #[test]
    fn mustache_is_text() {
        assert_eq!(kinds("p {{ msg }}"), vec![Tag, Text, Eos]);
    }

    #[test]
    fn crlf() {
        let r = lex("p a\r\n  b c\r\n");
        assert_eq!(r.tokens[1].span.slice("p a\r\n  b c\r\n"), "a");
    }

    #[test]
    fn errors_recover() {
        let r = lex("if x\n  p a\np b\ndiv {\n");
        let codes: Vec<_> = r.diagnostics.iter().map(|d| d.code).collect();
        assert_eq!(codes, vec!["UNSUPPORTED_SYNTAX", "UNCLOSED_BRACE"]);
        assert!(r.tokens.iter().filter(|t| t.kind == Tag).count() == 2);
    }
}
