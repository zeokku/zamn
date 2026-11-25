use crate::{Diagnostic, Span, Token, TokenKind};
use TokenKind::*;

pub struct LexResult {
    pub tokens: Vec<Token>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Tokenise a source file. Never fails: problems are reported as diagnostics
/// and the lexer carries on after the statement they are in.
pub fn lex(src: &str) -> LexResult {
    let mut lx = Lexer {
        src,
        b: src.as_bytes(),
        pos: 0,
        tokens: Vec::new(),
        diags: Vec::new(),
        ran_to_eof: false,
    };
    lx.run();
    LexResult {
        tokens: lx.tokens,
        diagnostics: lx.diags,
    }
}

struct Lexer<'a> {
    src: &'a str,
    b: &'a [u8],
    pos: usize,
    tokens: Vec<Token>,
    diags: Vec<Diagnostic>,
    /// An unclosed comment or raw content ran to the end of the file, and
    /// was reported: the blocks it swallowed the end of are not.
    ran_to_eof: bool,
}

const NO_JS: &str =
    "zamn has no JavaScript; quote the value, or write a binding such as `:href` for your framework";
const NO_CONTROL_FLOW: &str =
    "zamn has no control flow; use your framework's directives, e.g. `div(v-if=\"cond\")`";
const NO_FILES: &str = "a zamn template is a single file; compose with components instead";
const START_WITH_PIPE: &str = "start text with `|`";

fn is_ws(c: u8) -> bool {
    c == b' ' || c == b'\t'
}

fn is_word(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

fn is_quote(c: u8) -> bool {
    matches!(c, b'"' | b'\'' | b'`')
}

/// Characters a class name may hold anywhere.
fn is_class_char(c: u8) -> bool {
    is_word(c) || matches!(c, b'-' | b'@' | b'*' | b'%')
}

/// Characters that may follow a `:` or `/` inside a class name.
fn starts_class_part(c: u8) -> bool {
    is_class_char(c) || matches!(c, b'!' | b'[')
}

/// Characters that can only start the continuation of a JavaScript expression,
/// never an attribute name.
fn is_operator(c: u8) -> bool {
    matches!(
        c,
        b'+' | b'-' | b'/' | b'?' | b'<' | b'>' | b'|' | b'&' | b'%' | b'^' | b'~' | b'='
    )
}

/// Template constructs that zamn deliberately leaves out: (description, hint).
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
        "mixin" if space => Some(("mixins", "use a component instead")),
        "extends" | "extend" | "append" | "prepend" if space => {
            Some(("template inheritance", NO_FILES))
        }
        "block" if space || end => Some(("template inheritance", NO_FILES)),
        "yield" if end => Some(("template inheritance", NO_FILES)),
        "include" if space || end || after.starts_with(':') => Some(("includes", NO_FILES)),
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

    /// A `Text` token, unless it would be empty.
    fn text(&mut self, start: usize, end: usize) {
        if end > start {
            self.push(Text, start, end);
        }
    }

    fn error(&mut self, code: &'static str, message: impl Into<String>, start: usize, end: usize) {
        self.diags
            .push(Diagnostic::new(code, message, Span::new(start, end)));
    }

    fn error_hint(
        &mut self,
        code: &'static str,
        message: impl Into<String>,
        hint: impl Into<String>,
        start: usize,
        end: usize,
    ) {
        self.diags
            .push(Diagnostic::new(code, message, Span::new(start, end)).with_hint(hint));
    }

    fn unsupported(&mut self, what: &str, hint: &str, start: usize, end: usize) {
        self.error_hint(
            "UNSUPPORTED_SYNTAX",
            format!("{what} is not supported"),
            hint,
            start,
            end,
        );
    }

    fn unexpected_text(&mut self, at: usize, hint: Option<&str>) {
        let end = self.error_end(at).max((at + 1).min(self.line_end(at)));
        let shown: String = self.src[at..end].chars().take(5).collect();
        let d = Diagnostic::new(
            "UNEXPECTED_TEXT",
            format!("unexpected text \"{shown}\""),
            Span::new(at, end),
        );
        self.diags.push(match hint {
            Some(h) => d.with_hint(h),
            None => d,
        });
    }

    fn at(&self, i: usize) -> u8 {
        self.b.get(i).copied().unwrap_or(0)
    }

    /// End of the content of the line containing `from`, searching from
    /// `from`: before `\r\n` and before any whitespace at the end of the line,
    /// which never means anything.
    fn line_end(&self, from: usize) -> usize {
        let mut e = from;
        while e < self.b.len() && self.b[e] != b'\n' {
            e += 1;
        }
        if e > from && self.b[e - 1] == b'\r' {
            e -= 1;
        }
        while e > from && is_ws(self.b[e - 1]) {
            e -= 1;
        }
        e
    }

    /// Start of the line after the one `from` is on, or the end of the file.
    fn next_line(&self, from: usize) -> usize {
        match self.b[from.min(self.b.len())..]
            .iter()
            .position(|&c| c == b'\n')
        {
            Some(i) => from + i + 1,
            None => self.b.len(),
        }
    }

    /// Start of the line `p` is on.
    fn line_start(&self, p: usize) -> usize {
        self.b[..p]
            .iter()
            .rposition(|&c| c == b'\n')
            .map_or(0, |i| i + 1)
    }

    /// Leading whitespace of the line starting at `line_start`.
    fn indent(&self, line_start: usize) -> usize {
        self.skip_ws(line_start, self.b.len()) - line_start
    }

    fn skip_ws(&self, mut p: usize, end: usize) -> usize {
        while p < end && is_ws(self.b[p]) {
            p += 1;
        }
        p
    }

    fn run(&mut self) {
        if self.src.starts_with('\u{feff}') {
            self.pos = 3;
        }
        self.statements(None);
        let n = self.b.len();
        self.push(Eos, n, n);
    }

    /// The statements of the file, or of the block opened by the `{` at
    /// `open`, up to and including its `}`.
    fn statements(&mut self, open: Option<usize>) {
        let n = self.b.len();
        let open_line = open.map(|o| self.line_start(o));
        // End of the previous statement or comment in this block.
        let mut last_end: Option<usize> = None;
        // Indentation of the line the previous statement ended on; `None`
        // when there is none, or that line opened this block.
        let mut reference: Option<usize> = None;
        loop {
            let mut q = self.pos;
            while q < n && self.b[q].is_ascii_whitespace() {
                q += 1;
            }
            if q >= n {
                self.pos = n;
                if let Some(o) = open {
                    if !self.ran_to_eof {
                        self.error_hint(
                            "UNCLOSED_BRACE",
                            "This `{` is never closed",
                            "close it with `}`",
                            o,
                            o + 1,
                        );
                    }
                    self.push(BraceClose, n, n);
                }
                return;
            }
            if self.b[q] == b'}' {
                self.pos = q + 1;
                if open.is_some() {
                    self.push(BraceClose, q, q + 1);
                    return;
                }
                self.error_hint(
                    "UNMATCHED_BRACE",
                    "This `}` does not close any `{`",
                    "remove it, or write `\\}` for a literal brace",
                    q,
                    q + 1,
                );
                continue;
            }
            if last_end.is_some_and(|e| self.src[e..q].contains('\n')) {
                self.push(Newline, q, q);
            }
            self.pos = q;
            if self.b[q] == b'/' && matches!(self.at(q + 1), b'/' | b'*') {
                self.comment();
                last_end = Some(self.pos);
                continue;
            }
            let ls = self.line_start(q);
            if self.b[ls..q].iter().all(|&c| is_ws(c)) && reference.is_some_and(|r| q - ls > r) {
                self.diags.push(
                    Diagnostic::warning(
                        "MISLEADING_INDENTATION",
                        "This line is indented as if it were nested, but indentation means nothing in zamn",
                        Span::new(q, self.line_end(q)),
                    )
                    .with_hint("wrap the children in `{ }` on the line above, or remove the indentation"),
                );
            }
            self.statement();
            if self.pos == q {
                self.unexpected_text(q, None);
                self.skip_statement();
                if self.pos == q {
                    self.pos += 1;
                }
            }
            last_end = Some(self.pos);
            let ended_on = self.line_start(self.pos);
            reference = (Some(ended_on) != open_line).then(|| self.indent(ended_on));
        }
    }

    /// `//`, `//!`, `/* */` or `/*! */` at the cursor.
    fn comment(&mut self) {
        let s = self.pos;
        let buffered = self.at(s + 2) == b'!';
        if self.at(s + 1) == b'/' {
            let e = self.line_end(s);
            self.push(if buffered { Comment } else { SilentComment }, s, e);
            self.pos = e;
            return;
        }
        let kind = if buffered {
            BlockComment
        } else {
            SilentBlockComment
        };
        let e = match self.src[s + 2..].find("*/") {
            Some(i) => s + 2 + i + 2,
            None => {
                self.error_hint(
                    "UNCLOSED_COMMENT",
                    "This comment is never closed",
                    "close it with `*/`",
                    s,
                    s + if buffered { 3 } else { 2 },
                );
                self.ran_to_eof = true;
                self.b.len()
            }
        };
        self.push(kind, s, e);
        self.pos = e;
    }

    /// Skip what is left of a statement after an error: up to the end of
    /// its line or the `}` that closes the block it is in, along with any
    /// `{ }` it opens.
    fn skip_statement(&mut self) {
        self.pos = self.statement_end(self.pos);
    }

    /// Where `skip_statement` from `p` stops.
    fn statement_end(&self, mut p: usize) -> usize {
        let n = self.b.len();
        let mut depth = 0usize;
        while p < n {
            match self.b[p] {
                b'\\' => p += 1,
                b'\n' if depth == 0 => break,
                b'{' => depth += 1,
                b'}' if depth == 0 => break,
                b'}' => depth -= 1,
                _ => {}
            }
            p += 1;
        }
        p.min(n)
    }

    /// End of what is left of the statement at `p`, for an error's span:
    /// the end of its line or the `}` that closes its block.
    fn error_end(&self, p: usize) -> usize {
        let e = self.statement_end(p).min(self.line_end(p)).max(p);
        let mut e = e;
        while e > p && is_ws(self.b[e - 1]) {
            e -= 1;
        }
        e
    }

    fn statement(&mut self) {
        let src = self.src;
        let s = self.pos;
        let eol = self.line_end(s);
        if s >= eol || self.b[s] == b'}' {
            return;
        }
        let rest = &src[s..eol];
        // Errors cover the statement, not the `}` after it.
        let eol = self.error_end(s);
        if let Some(after) = rest.strip_prefix("doctype") {
            if after.is_empty() || after.starts_with([' ', '\t', '}']) {
                return self.doctype();
            }
        }
        if let Some((what, hint)) = removed_keyword(rest) {
            let word = rest.split([' ', '\t', ':', '{', '}']).next().unwrap();
            self.unsupported(&format!("`{word}` ({what})"), hint, s, eol);
            return self.skip_statement();
        }
        let next = self.at(s + 1);
        match self.b[s] {
            b'-' => {
                self.unsupported(
                    "Unbuffered code (`- ...`)",
                    "zamn has no JavaScript; move the logic into your component",
                    s,
                    eol,
                );
                self.skip_statement();
            }
            b'!' if next == b'=' => {
                self.unescaped_code(s, eol);
            }
            b'+' => {
                self.unsupported("A mixin call", "use a component instead", s, eol);
                self.skip_statement();
            }
            b':' => {
                self.unsupported("A filter", "zamn has no filters", s, eol);
                self.skip_statement();
            }
            b'#' | b'{' if next == b'{' => {
                // Text without its `|`: reported, then read as text.
                self.unexpected_text(s, Some(START_WITH_PIPE));
                self.text_run(s);
            }
            // `#[...]`: reported by `text_run`.
            b'#' if next == b'[' => self.text_run(s),
            b'{' => {
                self.error_hint(
                    "UNEXPECTED_TEXT",
                    "unexpected `{`",
                    "a `{` opens the children of an element, after its tag; write `| \\{` for text",
                    s,
                    s + 1,
                );
                self.skip_statement();
            }
            b'=' => self.expr(),
            b'|' => self.pipe(s),
            b'<' => {
                self.unsupported(
                    "A line of HTML",
                    "write it as an element (`b bold`); text is escaped",
                    s,
                    eol,
                );
                self.skip_statement();
                // The lines of HTML after it are the same mistake.
                loop {
                    let p = self.pos;
                    if self.line_end(p) != p {
                        break;
                    }
                    let next = self.next_line(p);
                    let le = self.line_end(next);
                    let cs = self.skip_ws(next, le);
                    if cs >= le || self.b[cs] != b'<' {
                        break;
                    }
                    self.pos = cs;
                    self.skip_statement();
                }
            }
            b'/' => {
                let mut e = s + 1;
                while e < eol && (is_word(self.b[e]) || self.b[e] == b'-') {
                    e += 1;
                }
                if e == s + 1 {
                    self.unexpected_text(s, None);
                } else {
                    let name = &src[s + 1..e];
                    let hint = match name {
                        "script" => "a script with `src` needs no `/script`",
                        "style" => "`/style` ends the lines after a `style` that ends its line",
                        _ => "close elements with `}`; only `script` and `style` content ends with a `/` line",
                    };
                    self.error_hint(
                        "UNMATCHED_CLOSE",
                        format!("This `/{name}` does not close anything"),
                        hint,
                        s,
                        e,
                    );
                }
                self.skip_statement();
            }
            _ => self.head(),
        }
    }

    fn unescaped_code(&mut self, at: usize, eol: usize) {
        self.unsupported(
            "Unescaped buffered code (`!=`)",
            "use `=` for `{{ }}` interpolation, or `v-html` for raw HTML",
            at,
            eol,
        );
        self.skip_statement();
    }

    /// `doctype X`, to the end of the line or a `}`.
    fn doctype(&mut self) {
        let s = self.pos;
        let eol = self.line_end(s);
        let mut e = s + "doctype".len();
        while e < eol && self.b[e] != b'}' {
            e += 1;
        }
        while is_ws(self.b[e - 1]) {
            e -= 1;
        }
        self.push(Doctype, s, e);
        self.pos = e;
        if e == s + "doctype".len() {
            self.error_hint(
                "MISSING_DOCTYPE",
                "`doctype` must be followed by the document type",
                "write `doctype html`, or leave the line out",
                s,
                e,
            );
        }
    }

    /// `= expr`: the expression is opaque text up to the end of the line, or
    /// the `}` that closes the block or inline element it is in.
    fn expr(&mut self) {
        let s = self.pos;
        let eol = self.line_end(s);
        self.push(Eq, s, s + 1);
        let start = self.skip_ws(s + 1, eol);
        let mut depth = 0usize;
        let mut p = start;
        while p < eol {
            match self.b[p] {
                c if is_quote(c) => {
                    p = self.skip_string(p).min(eol);
                    continue;
                }
                b'{' => depth += 1,
                b'}' if depth == 0 => break,
                b'}' => depth -= 1,
                _ => {}
            }
            p += 1;
        }
        let stop = p;
        let mut end = p;
        while end > start && is_ws(self.b[end - 1]) {
            end -= 1;
        }
        if end == start {
            self.error(
                "MISSING_EXPRESSION",
                "`=` must be followed by an expression",
                s,
                stop.max(s + 1),
            );
        } else {
            self.push(Expr, start, end);
        }
        self.pos = stop;
    }

    /// `|` at `at`, starting a statement: a bare `|`, `| text` (trimmed) or
    /// a `|{ ... }` text block.
    fn pipe(&mut self, at: usize) {
        let eol = self.line_end(at);
        let j = self.skip_ws(at + 1, eol);
        if j < eol && self.b[j] == b'{' && self.at(j + 1) != b'{' {
            self.push(PipeOpen, at, j + 1);
            return self.pipe_block(j);
        }
        self.push(Pipe, at, at + 1);
        self.text_run(j);
    }

    /// The text of a `|{` block whose `{` is at `open`, up to and including
    /// its `}`. On one line the text is trimmed; across lines, blank lines at
    /// either end are dropped and the common indentation of the others is
    /// left out of their `Text` tokens.
    fn pipe_block(&mut self, open: usize) {
        let n = self.b.len();
        let mark = self.tokens.len();
        // Where each line's tokens begin, and where its text was read from.
        let mut lines: Vec<(usize, usize)> = Vec::new();
        let mut p = open + 1;
        let close = loop {
            lines.push((self.tokens.len(), p));
            self.text_run(p);
            let q = self.pos;
            if q < n && self.b[q] == b'}' {
                break Some(q);
            }
            p = self.next_line(q);
            if p >= n {
                break None;
            }
        };
        let tokens = self.tokens.split_off(mark);
        let mut groups: Vec<(usize, Vec<Token>)> = lines
            .iter()
            .enumerate()
            .map(|(k, &(first, start))| {
                let to = lines.get(k + 1).map_or(tokens.len(), |l| l.0 - mark);
                (start, tokens[first - mark..to].to_vec())
            })
            .collect();
        self.strip(&mut groups[0].1, usize::MAX);
        let base = groups[1..]
            .iter()
            .filter(|g| !g.1.is_empty())
            .map(|g| self.indent(g.0))
            .min()
            .unwrap_or(0);
        for g in &mut groups[1..] {
            self.strip(&mut g.1, base);
        }
        self.emit_lines(groups);
        match close {
            Some(q) => {
                self.push(PipeClose, q, q + 1);
                self.pos = q + 1;
            }
            None => {
                if !self.ran_to_eof {
                    self.error_hint(
                        "UNCLOSED_BRACE",
                        "This `|{` is never closed",
                        "close it with `}`",
                        open,
                        open + 1,
                    );
                }
                self.push(PipeClose, n, n);
                self.pos = n;
            }
        }
    }

    /// Drop up to `max` bytes of leading whitespace from a line's first token,
    /// when it is text.
    fn strip(&self, line: &mut Vec<Token>, max: usize) {
        let Some(first) = line.first_mut() else {
            return;
        };
        if first.kind != Text {
            return;
        }
        let start = first.span.start as usize;
        let end = first.span.end as usize;
        let mut p = start;
        while p < end && p - start < max && is_ws(self.b[p]) {
            p += 1;
        }
        first.span.start = p as u32;
        if p == end {
            line.remove(0);
        }
    }

    /// The tokens of the lines of a text block, without the blank lines at
    /// either end, with a `TextNewline` between each two lines. A line is a
    /// (start, tokens) pair; a blank line has no tokens.
    fn emit_lines(&mut self, mut lines: Vec<(usize, Vec<Token>)>) {
        while lines.first().is_some_and(|l| l.1.is_empty()) {
            lines.remove(0);
        }
        while lines.last().is_some_and(|l| l.1.is_empty()) {
            lines.pop();
        }
        let mut prev_end = None;
        for (start, line) in lines {
            let start = line.first().map_or(start, |t| t.span.start as usize);
            if let Some(end) = prev_end {
                self.push(TextNewline, end, start);
            }
            prev_end = Some(line.last().map_or(start, |t| t.span.end as usize));
            self.tokens.extend(line);
        }
    }

    /// Tag name, `#id`, `.class` and `(attrs)`, then whatever follows them.
    fn head(&mut self) {
        let src = self.src;
        let s = self.pos;
        let mut eol = self.line_end(s);
        let mut any = false;
        let mut tag = None;
        let mut has_src = false;
        if is_word(self.b[s]) {
            let mut e = s + 1;
            while e < eol && (is_word(self.b[e]) || self.b[e] == b'-' || self.b[e] == b':') {
                e += 1;
            }
            while !is_word(self.b[e - 1]) {
                e -= 1;
            }
            self.push(Tag, s, e);
            tag = Some(&src[s..e]);
            self.pos = e;
            any = true;
        }
        loop {
            let p = self.pos;
            if p >= eol {
                break;
            }
            match self.b[p] {
                b'#' => {
                    let mut e = p + 1;
                    while e < eol && (is_word(self.b[e]) || self.b[e] == b'-') {
                        e += 1;
                    }
                    if e == p + 1 {
                        if !any {
                            break;
                        }
                        self.error("INVALID_ID", "`#` must be followed by a valid ID", p, p + 1);
                        return self.skip_statement();
                    }
                    self.push(Id, p, e);
                    self.pos = e;
                }
                b'.' => {
                    let e = self.class_end(p + 1, eol);
                    let named = self.b[p + 1..e]
                        .iter()
                        .any(|&c| c.is_ascii_alphabetic() || c == b'_');
                    if named {
                        self.push(Class, p, e);
                        self.pos = e;
                    } else if e == p + 1
                        && (p + 1 == eol || matches!(self.b[p + 1], b' ' | b'\t' | b'}'))
                    {
                        self.unsupported(
                            "A text block (`tag.`)",
                            "write text in `|{ ... }`; a `script` or `style` takes the lines below it, ended by `/script` or `/style`",
                            p,
                            p + 1,
                        );
                        self.pos = p + 1;
                        return self.skip_statement();
                    } else if e > p + 1 {
                        self.error(
                            "INVALID_CLASS_NAME",
                            "Class names must contain at least one letter or underscore.",
                            p,
                            e,
                        );
                        return self.skip_statement();
                    } else {
                        self.error(
                            "INVALID_CLASS_NAME",
                            "`.` must be followed by a class name",
                            p,
                            p + 1,
                        );
                        return self.skip_statement();
                    }
                }
                b'(' if any => {
                    let mark = self.tokens.len();
                    if !self.attrs() {
                        return;
                    }
                    has_src |= self.tokens[mark..].iter().any(|t| {
                        t.kind == AttrName
                            && matches!(t.span.slice(src), "src" | ":src" | "v-bind:src")
                    });
                    eol = self.line_end(self.pos);
                }
                _ => break,
            }
            any = true;
        }
        if !any {
            self.unexpected_text(s, None);
            return self.skip_statement();
        }
        let raw = match tag {
            Some(name @ ("script" | "style")) => Some((name, name == "style" || !has_src)),
            _ => None,
        };
        self.follow(s, raw);
    }

    /// The end of a class name starting at `p` (after its `.`).
    fn class_end(&self, start: usize, eol: usize) -> usize {
        let mut p = start;
        while p < eol {
            let c = self.b[p];
            let next = if p + 1 < eol { self.b[p + 1] } else { 0 };
            if is_class_char(c)
                || (matches!(c, b':' | b'/') && starts_class_part(next))
                || (c == b'.' && p > start && self.decimal_point(p, eol))
                || (c == b'!' && next != b'=')
            {
                p += 1;
            } else if c == b'[' {
                match self.balanced(p, eol, b'[', b']') {
                    Some(e) => p = e,
                    None => break,
                }
            } else if c == b'(' && p > start && self.b[p - 1] == b'-' {
                match self.balanced(p, eol, b'(', b')') {
                    Some(e) => p = e,
                    None => break,
                }
            } else {
                break;
            }
        }
        p
    }

    /// Whether the `.` at `p` is the point of a number (`w-1.5`), rather
    /// than the start of the next class (`.p-0.5.2xl:flex`).
    fn decimal_point(&self, p: usize, eol: usize) -> bool {
        let mut e = p + 1;
        while e < eol && self.b[e].is_ascii_digit() {
            e += 1;
        }
        self.b[p - 1].is_ascii_digit() && e > p + 1 && (e == eol || !is_word(self.b[e]))
    }

    /// The end of the bracketed part of a class name opening at `p`, with no
    /// whitespace or braces in it; quotes are skipped.
    fn balanced(&self, mut p: usize, eol: usize, open: u8, close: u8) -> Option<usize> {
        let mut depth = 0usize;
        while p < eol {
            let c = self.b[p];
            match c {
                b' ' | b'\t' | b'{' | b'}' => return None,
                b'"' | b'\'' => {
                    let mut e = p + 1;
                    while e < eol && self.b[e] != c {
                        if is_ws(self.b[e]) || matches!(self.b[e], b'{' | b'}') {
                            return None;
                        }
                        e += 1;
                    }
                    if e >= eol {
                        return None;
                    }
                    p = e;
                }
                c if c == open => depth += 1,
                c if c == close => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(p + 1);
                    }
                }
                _ => {}
            }
            p += 1;
        }
        None
    }

    /// What follows a head: children in `{ }`, `: child`, `= expr`, text
    /// (where a `|` is text like any other), or for `script` and `style` the
    /// raw content on the lines below. `raw` is
    /// the tag name for those two, and whether it takes content (a script
    /// with `src` does not).
    fn follow(&mut self, head_start: usize, raw: Option<(&str, bool)>) {
        let head_end = self.pos;
        loop {
            let p = self.pos;
            let eol = self.line_end(p);
            if p >= eol {
                if let Some((name, true)) = raw {
                    self.raw(name, head_start, head_end);
                }
                return;
            }
            let c = self.b[p];
            if c == b'/' {
                self.unsupported(
                    "A self-closing `/`",
                    "drop the `/`: HTML elements such as `img` need no closing",
                    p,
                    p + 1,
                );
                self.pos = p + 1;
                continue;
            }
            if let Some((name, content)) = raw {
                let q = self.skip_ws(p, eol);
                if self.b[q] == b'}' && !content {
                    return;
                }
                let end = self.error_end(q);
                if !content {
                    self.error_hint(
                        "UNSUPPORTED_SYNTAX",
                        "A script with `src` has no content",
                        "drop what follows the head; browsers ignore the body of a script with `src`",
                        q,
                        end,
                    );
                } else if self.b[q] == b'}' {
                    self.error_hint(
                        "UNSUPPORTED_SYNTAX",
                        format!("`{name}` must end its line"),
                        format!("write the content on the lines below, and end it with `/{name}` on its own line"),
                        head_start,
                        head_end,
                    );
                    self.pos = q;
                    return;
                } else {
                    self.error_hint(
                        "UNSUPPORTED_SYNTAX",
                        format!("Content on the `{name}` line is not supported"),
                        format!("write the content on the lines below, and end it with `/{name}` on its own line"),
                        q,
                        end,
                    );
                }
                return self.skip_statement();
            }
            match c {
                b'}' => {}
                b':' if p + 1 == eol || is_ws(self.b[p + 1]) => {
                    self.push(Colon, p, p + 1);
                    self.pos = self.skip_ws(p + 1, eol);
                    self.statement();
                }
                b'=' => self.expr(),
                b'!' if self.at(p + 1) == b'=' => self.unescaped_code(p, self.error_end(p)),
                b'&' if self.src[p..eol].starts_with("&attributes") => {
                    self.unsupported(
                        "`&attributes`",
                        "zamn has no JavaScript; list the attributes explicitly",
                        p,
                        self.error_end(p),
                    );
                    self.skip_statement();
                }
                b'{' if self.at(p + 1) != b'{' => self.block(p),
                // `p{{ msg }}`
                b'{' => self.text_run(p),
                b' ' | b'\t' => {
                    let q = self.skip_ws(p, eol);
                    match self.b[q] {
                        b'}' => self.pos = q,
                        b'{' if self.at(q + 1) != b'{' => self.block(q),
                        _ => self.text_run(q),
                    }
                }
                _ => {
                    self.unexpected_text(p, None);
                    self.skip_statement();
                }
            }
            return;
        }
    }

    /// `{` at `open`, after a head.
    fn block(&mut self, open: usize) {
        self.push(BraceOpen, open, open + 1);
        self.pos = open + 1;
        self.statements(Some(open));
    }

    /// The raw content of `script` or `style`, on the lines after the head,
    /// up to a line that is `/script` or `/style`.
    fn raw(&mut self, name: &str, head_start: usize, head_end: usize) {
        let n = self.b.len();
        let eol = self.pos;
        self.push(RawStart, eol, eol);
        let mut lines: Vec<(usize, usize)> = Vec::new();
        let mut end = None;
        let mut p = self.next_line(eol);
        while p < n {
            let le = self.line_end(p);
            let cs = self.skip_ws(p, le);
            if self.src[cs..le].strip_prefix('/') == Some(name) {
                end = Some((cs, le));
                break;
            }
            lines.push((p, le));
            p = self.next_line(le);
        }
        let base = lines
            .iter()
            .filter(|l| l.1 > l.0)
            .map(|l| self.indent(l.0))
            .min()
            .unwrap_or(0);
        let lines = lines
            .into_iter()
            .map(|(ls, le)| {
                let start = (ls + base).min(le);
                let tokens = if le > start {
                    vec![Token {
                        kind: Text,
                        span: Span::new(start, le),
                    }]
                } else {
                    Vec::new()
                };
                (start, tokens)
            })
            .collect();
        self.emit_lines(lines);
        match end {
            Some((cs, le)) => {
                self.push(RawEnd, cs, le);
                self.pos = le;
            }
            None => {
                self.error_hint(
                    "UNCLOSED_RAW",
                    format!("This `{name}` is never closed"),
                    format!("end it with `/{name}` on its own line"),
                    head_start,
                    head_end,
                );
                self.ran_to_eof = true;
                self.push(RawEnd, n, n);
                self.pos = n;
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
                self.pos = self.line_end(open);
                return false;
            }
            if self.b[p] == b')' {
                self.push(AttrsClose, p, p + 1);
                self.pos = p + 1;
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

    /// Text from `start` to the end of the line or the `}` that closes the
    /// block, `|{` or `#{` it is in, split around escapes, `{{ }}` mustaches
    /// and `#{...}` inline elements. Whitespace before the `}` is left out.
    fn text_run(&mut self, start: usize) {
        let mut eol = self.line_end(start);
        let mut p = start.min(eol);
        let mut seg = p;
        // Unescaped `{`s, already reported: their `}`s are text too.
        let mut stray = 0usize;
        while p < eol {
            let c = self.b[p];
            let next = if p + 1 < eol { self.b[p + 1] } else { 0 };
            match c {
                b'\\' if matches!(next, b'{' | b'}') => {
                    self.text(seg, p);
                    seg = p + 1;
                    p += 2;
                }
                b'\\' if next == b'#' && matches!(self.at(p + 2), b'{' | b'[') && p + 2 < eol => {
                    self.text(seg, p);
                    seg = p + 1;
                    p += 3;
                }
                b'{' if next == b'{' => {
                    self.text(seg, p);
                    match self.src[p + 2..eol].find("}}") {
                        Some(i) => {
                            let e = p + 2 + i + 2;
                            self.push(Mustache, p, e);
                            p = e;
                        }
                        None => {
                            self.error_hint(
                                "UNCLOSED_INTERPOLATION",
                                "This `{{` is not closed",
                                "close it with `}}` on the same line",
                                p,
                                p + 2,
                            );
                            self.push(Mustache, p, eol);
                            p = eol;
                        }
                    }
                    seg = p;
                }
                b'{' => {
                    // `tag |{`, text that starts with a text block.
                    let lead = self.skip_ws(start, p);
                    let block = self.b[lead] == b'|' && self.skip_ws(lead + 1, p) == p;
                    self.error_hint(
                        "UNESCAPED_BRACE",
                        "A `{` in text must be escaped",
                        if block {
                            "a text block after a tag is `tag: |{ ... }`; write `\\{` for a literal brace"
                        } else {
                            "write `\\{` for a literal brace"
                        },
                        p,
                        p + 1,
                    );
                    stray += 1;
                    p += 1;
                }
                b'}' if stray > 0 => {
                    stray -= 1;
                    p += 1;
                }
                b'}' => break,
                b'#' if next == b'{' => {
                    self.text(seg, p);
                    self.push(InterpStart, p, p + 2);
                    self.pos = p + 2;
                    self.interp(p);
                    p = self.pos;
                    seg = p;
                    eol = self.line_end(p);
                }
                b'#' if next == b'[' => {
                    self.unsupported("`#[...]`", "write an inline element as `#{...}`", p, p + 2);
                    p += 2;
                }
                _ => p += 1,
            }
        }
        let mut end = p;
        while end > seg && is_ws(self.b[end - 1]) {
            end -= 1;
        }
        self.text(seg, end);
        self.pos = p;
    }

    /// The statement of a `#{` at `open` and its `}`; the cursor is after
    /// the `#{`.
    fn interp(&mut self, open: usize) {
        let eol = self.line_end(self.pos);
        self.pos = self.skip_ws(self.pos, eol);
        if self.pos < eol && self.b[self.pos] != b'}' {
            self.statement();
        }
        let eol = self.line_end(self.pos);
        let mut q = self.skip_ws(self.pos, eol);
        if q < eol && self.b[q] != b'}' {
            self.unexpected_text(q, Some("an inline element `#{...}` holds one element"));
            self.pos = q;
            self.skip_statement();
            q = self.pos;
        }
        if q < self.b.len() && self.b[q] == b'}' {
            self.push(InterpEnd, q, q + 1);
            self.pos = q + 1;
        } else {
            self.error_hint(
                "UNCLOSED_BRACE",
                "This `#{` is never closed",
                "close the inline element with `}` on the same line",
                open,
                open + 2,
            );
            self.push(InterpEnd, q, q);
            self.pos = q;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(src: &str) -> Vec<TokenKind> {
        let r = lex(src);
        assert!(r.diagnostics.is_empty(), "{src:?}: {:?}", r.diagnostics);
        r.tokens.iter().map(|t| t.kind).collect()
    }

    /// The source text of each token of the given kind.
    fn texts(src: &str, kind: TokenKind) -> Vec<&str> {
        lex(src)
            .tokens
            .iter()
            .filter(|t| t.kind == kind)
            .map(|t| t.span.slice(src))
            .collect()
    }

    fn codes(src: &str) -> Vec<&'static str> {
        lex(src).diagnostics.iter().map(|d| d.code).collect()
    }

    #[test]
    fn blocks_span_lines() {
        let src = "div {\n  .another-div {\n    button Text\n    p {}\n  }\n}\n";
        assert_eq!(
            kinds(src),
            vec![
                Tag, BraceOpen, Class, BraceOpen, Tag, Text, Newline, Tag, BraceOpen, BraceClose,
                BraceClose, BraceClose, Eos
            ]
        );
    }

    #[test]
    fn indentation_means_nothing() {
        let a = "ul {\n  li a\n  li b\n}\np";
        let b = "ul {\nli a\nli b\n}\np";
        assert_eq!(kinds(a), kinds(b));
    }

    #[test]
    fn one_line_blocks() {
        assert_eq!(
            kinds(".a{.b{i x}}\nul {li{a} li}"),
            vec![
                Class, BraceOpen, Class, BraceOpen, Tag, Text, BraceClose, BraceClose, Newline,
                Tag, BraceOpen, Tag, BraceOpen, Tag, BraceClose, Tag, BraceClose, Eos
            ]
        );
        // `}}` closes two blocks.
        assert_eq!(
            kinds(".one-liner { b { u biba }}"),
            vec![Class, BraceOpen, Tag, BraceOpen, Tag, Text, BraceClose, BraceClose, Eos]
        );
    }

    #[test]
    fn statements_after_a_closing_brace() {
        let src = "div { b: |{ some text here } u: |{another child} b without pipe\nspan so next }";
        assert_eq!(
            kinds(src),
            vec![
                Tag, BraceOpen, Tag, Colon, PipeOpen, Text, PipeClose, Tag, Colon, PipeOpen,
                Text, PipeClose, Tag, Text, Newline, Tag, Text, BraceClose, Eos
            ]
        );
        assert_eq!(
            texts(src, Text),
            ["some text here", "another child", "without pipe", "so next"]
        );
    }

    #[test]
    fn three_ways_to_write_text() {
        for src in [
            "div some text",
            "div   some text  ",
            "div: | some text",
            "div: |   some text",
            "div: |{ some text }",
            "div: | { some text }",
        ] {
            assert_eq!(texts(src, Text), ["some text"], "{src}");
        }
        // After a head, `|` is text like any other character.
        assert_eq!(kinds("div | x"), vec![Tag, Text, Eos]);
        assert_eq!(texts("div | x", Text), ["| x"]);
        assert_eq!(texts("| | x", Text), ["| x"]);
        assert_eq!(texts("div \\| x", Text), ["\\| x"]);
        assert_eq!(codes("div|x"), ["UNEXPECTED_TEXT"]);
    }

    #[test]
    fn a_text_block_after_a_head_needs_a_colon() {
        let r = lex("div |{ x }");
        assert_eq!(r.diagnostics.len(), 1);
        assert_eq!(r.diagnostics[0].code, "UNESCAPED_BRACE");
        assert!(r.diagnostics[0].hint.as_deref().unwrap().contains("tag: |{"));
        let r = lex("div a { x }");
        assert!(!r.diagnostics[0].hint.as_deref().unwrap().contains("tag: |{"));
    }

    #[test]
    fn escapes_are_left_out_of_text() {
        let src = "p a \\{ b \\} c \\#{d\\} \\#[e]";
        assert_eq!(
            texts(src, Text),
            ["a ", "{ b ", "} c ", "#{d", "} ", "#[e]"]
        );
        // An unescaped `}` closes the block.
        assert_eq!(texts("p { b \\#{d} }", Text), ["#{d"]);
        // Any other backslash is literal.
        assert_eq!(texts("p a\\b", Text), ["a\\b"]);
    }

    #[test]
    fn mustaches() {
        let src = "li {{ a }} and {{ b < c }}";
        assert_eq!(kinds(src), vec![Tag, Mustache, Text, Mustache, Eos]);
        assert_eq!(texts(src, Mustache), ["{{ a }}", "{{ b < c }}"]);
        // In a block, `}}` after a mustache's own closes the block.
        assert_eq!(
            kinds("p{b {{ m }}}"),
            vec![Tag, BraceOpen, Tag, Mustache, BraceClose, Eos]
        );
        assert_eq!(codes("p {{ a }"), ["UNCLOSED_INTERPOLATION"]);
    }

    #[test]
    fn inline_elements_nest() {
        let src = "p { | some #{b biba #{i x}} boba }";
        assert_eq!(
            kinds(src),
            vec![
                Tag,
                BraceOpen,
                Pipe,
                Text,
                InterpStart,
                Tag,
                Text,
                InterpStart,
                Tag,
                Text,
                InterpEnd,
                InterpEnd,
                Text,
                BraceClose,
                Eos
            ]
        );
        assert_eq!(texts(src, Text), ["some ", "biba ", "x", " boba"]);
        assert_eq!(texts("p #{strong= count} x", Expr), ["count"]);
        assert_eq!(texts("p a #{b   x  } c", Text), ["a ", "x", " c"]);
        assert_eq!(codes("p #{b x"), ["UNCLOSED_BRACE"]);
        assert_eq!(codes("p #[b x]"), ["UNSUPPORTED_SYNTAX"]);
    }

    #[test]
    fn pipes() {
        assert_eq!(
            kinds("p {\n  |\n}"),
            vec![Tag, BraceOpen, Pipe, BraceClose, Eos]
        );
        assert_eq!(texts("p |", Text), ["|"]);
        assert_eq!(kinds("| {{ x }}"), vec![Pipe, Mustache, Eos]);
        assert_eq!(texts("| \\{ literal", Text), ["{ literal"]);
        assert_eq!(texts("|  two  ", Text), ["two"]);
        assert_eq!(kinds("p: |"), vec![Tag, Colon, Pipe, Eos]);
    }

    #[test]
    fn multi_line_pipe_blocks() {
        let src = "pre: |{\n    line one\n      indented\n\n    #{b x} last\n  }";
        let r = lex(src);
        assert!(r.diagnostics.is_empty(), "{:?}", r.diagnostics);
        let dump: Vec<_> = r
            .tokens
            .iter()
            .map(|t| format!("{:?} {:?}", t.kind, t.span.slice(src)))
            .collect();
        assert_eq!(
            dump,
            [
                "Tag \"pre\"",
                "Colon \":\"",
                "PipeOpen \"|{\"",
                "Text \"line one\"",
                "TextNewline \"\\n    \"",
                "Text \"  indented\"",
                "TextNewline \"\\n\"",
                "TextNewline \"\\n    \"",
                "InterpStart \"#{\"",
                "Tag \"b\"",
                "Text \"x\"",
                "InterpEnd \"}\"",
                "Text \" last\"",
                "PipeClose \"}\"",
                "Eos \"\"",
            ]
        );
        // Text on the `|{` line loses its leading whitespace.
        assert_eq!(texts("p: |{   a\n  b }", Text), ["a", "b"]);
        assert_eq!(codes("p: |{ a\nb"), ["UNCLOSED_BRACE"]);
    }

    #[test]
    fn raw_content() {
        let src = "script\n  if (a < b && c) { go() }\n    nested\n/script\np after";
        let r = lex(src);
        assert!(r.diagnostics.is_empty(), "{:?}", r.diagnostics);
        assert_eq!(
            r.tokens.iter().map(|t| t.kind).collect::<Vec<_>>(),
            vec![
                Tag,
                RawStart,
                Text,
                TextNewline,
                Text,
                RawEnd,
                Newline,
                Tag,
                Text,
                Eos
            ]
        );
        assert_eq!(
            texts(src, Text),
            ["if (a < b && c) { go() }", "  nested", "after"]
        );
        assert_eq!(texts(src, RawEnd), ["/script"]);
        // `/style` does not close a script.
        assert_eq!(texts("script\n/style\n  /script", Text), ["/style"]);
        assert_eq!(
            kinds("style(scoped)\n/style"),
            vec![Tag, AttrsOpen, AttrName, AttrsClose, RawStart, RawEnd, Eos]
        );
    }

    #[test]
    fn script_with_src_has_no_content() {
        assert_eq!(
            kinds("script(src=\"a.js\")\np"),
            vec![Tag, AttrsOpen, AttrName, AttrEq, AttrValue, AttrsClose, Newline, Tag, Eos]
        );
        assert_eq!(codes("script(:src=\"a\")\n/script"), ["UNMATCHED_CLOSE"]);
        assert_eq!(codes("script(src=\"a\") {}"), ["UNSUPPORTED_SYNTAX"]);
        assert_eq!(codes("script {\n  go()\n}"), ["UNSUPPORTED_SYNTAX"]);
        assert_eq!(codes("style: |{ a {} }"), ["UNSUPPORTED_SYNTAX"]);
        assert_eq!(codes("script\n  go()\n"), ["UNCLOSED_RAW"]);
        assert_eq!(codes("div {\n  script\n  go()\n}"), ["UNCLOSED_RAW"]);
        assert_eq!(codes("pre\n/pre"), ["UNMATCHED_CLOSE"]);
    }

    #[test]
    fn comments() {
        let src =
            "// silent\n//! shown\n/* a\n b */ p x\ndiv { /*! note */ b x }\np // not a comment";
        assert_eq!(
            kinds(src),
            vec![
                SilentComment,
                Newline,
                Comment,
                Newline,
                SilentBlockComment,
                Tag,
                Text,
                Newline,
                Tag,
                BraceOpen,
                BlockComment,
                Tag,
                Text,
                BraceClose,
                Newline,
                Tag,
                Text,
                Eos
            ]
        );
        assert_eq!(texts(src, Text), ["x", "x", "// not a comment"]);
        assert_eq!(codes("p\n/* open"), ["UNCLOSED_COMMENT"]);
        assert_eq!(codes("div {\n/* open\n}"), ["UNCLOSED_COMMENT"]);
    }

    #[test]
    fn doctype() {
        assert_eq!(texts("doctype html\nhtml", Doctype), ["doctype html"]);
        assert_eq!(codes("doctype"), ["MISSING_DOCTYPE"]);
    }

    #[test]
    fn expressions_end_at_the_closing_brace() {
        let src = "p{span= user ? {name: \"}\"}.name : \"\"}";
        assert_eq!(texts(src, Expr), ["user ? {name: \"}\"}.name : \"\""]);
        assert_eq!(kinds(src).last(), Some(&Eos));
    }

    #[test]
    fn tailwind_classes() {
        for class in [
            "w-[10px]",
            "hover:bg-red-500",
            "md:w-1/2",
            "bg-red-500/50",
            "group-hover/item:flex",
            "[&>*]:p-2",
            "data-[state=open]:x",
            "content-['a']",
            "bg-(--brand)",
            "!font-bold",
            "font-bold!",
            "@container",
            "@md:flex",
            "*:p-2",
            "from-10%",
            "-mt-4",
            "p-0.5",
            "2xl:flex",
            "supports-[display:grid]:grid",
            "bg-[url('/a.png')]",
        ] {
            let src = format!("p.{class}.next x");
            assert_eq!(
                texts(&src, Class),
                [format!(".{class}").as_str(), ".next"],
                "{class}"
            );
            assert_eq!(texts(&src, Text), ["x"], "{class}");
        }
        // `:` before a space is block expansion.
        assert_eq!(kinds("li.a: b x"), vec![Tag, Class, Colon, Tag, Text, Eos]);
        assert_eq!(codes("p.5"), ["INVALID_CLASS_NAME"]);
        assert_eq!(
            texts("p.p-0.5.2xl:flex.w-1.5/2", Class),
            [".p-0.5", ".2xl:flex", ".w-1.5/2"]
        );
        assert_eq!(texts("p.a.b", Class), [".a", ".b"]);
    }

    #[test]
    fn misleading_indentation() {
        let r = lex("div {\n  .first\n    .second\n  .third {\n      | first line\n  }\n}");
        let d: Vec<_> = r
            .diagnostics
            .iter()
            .map(|d| (d.code, d.is_error()))
            .collect();
        assert_eq!(d, [("MISLEADING_INDENTATION", false)]);
        assert_eq!(
            r.diagnostics[0].span.slice("div {\n  .first\n    .second"),
            ".second"
        );
        // Not after a line that opened the block, nor for comments, attribute
        // or text block lines.
        for src in [
            "div { b x\n    i y }",
            "p a\n    // comment\np b",
            "a(\n    href=x\n  ) y\nb",
            "p: |{\n    a\n  }\nb",
        ] {
            assert!(codes(src).is_empty(), "{src}: {:?}", codes(src));
        }
        // After a closed block, against the `}` line.
        assert_eq!(codes("div {\n}\n  p"), ["MISLEADING_INDENTATION"]);
    }

    #[test]
    fn crlf() {
        let src = "p a\r\nscript\r\n  go()\r\n/script\r\n";
        assert_eq!(texts(src, Text), ["a", "go()"]);
        assert_eq!(texts(src, RawEnd), ["/script"]);
    }

    #[test]
    fn errors_recover() {
        let r = lex("if x {\n  p a\n}\np b\ndiv {\n");
        let codes: Vec<_> = r.diagnostics.iter().map(|d| d.code).collect();
        assert_eq!(codes, vec!["UNSUPPORTED_SYNTAX", "UNCLOSED_BRACE"]);
        assert_eq!(r.tokens.iter().filter(|t| t.kind == Tag).count(), 2);
        assert_eq!(super::tests::codes("p a { b } c"), ["UNESCAPED_BRACE"]);
        assert_eq!(super::tests::codes("}\np"), ["UNMATCHED_BRACE"]);
        assert_eq!(super::tests::codes("{{ x }}"), ["UNEXPECTED_TEXT"]);
        assert_eq!(super::tests::codes("#{b x}"), ["UNEXPECTED_TEXT"]);
        assert_eq!(super::tests::codes("img/"), ["UNSUPPORTED_SYNTAX"]);
        assert_eq!(super::tests::codes("p."), ["UNSUPPORTED_SYNTAX"]);
    }
}
