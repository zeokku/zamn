//! Lexer for zamn, a static way to write HTML with `{ }` blocks.
//!
//! Tokens are a kind plus a byte span into the source; nothing is copied.

mod lexer;
mod span;

use serde::Serialize;

pub use lexer::{lex, LexResult};
pub use span::{LineIndex, Loc, Position, Span};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum TokenKind {
    /// Line break between two statements. Zero-width at the start of the
    /// next statement's line content.
    Newline,
    Eos,
    /// `{` opening a child block after a tag head.
    BraceOpen,
    /// `}` closing a child block.
    BraceClose,
    Tag,
    /// `#id`, span includes the `#`.
    Id,
    /// `.class`, span includes the `.`.
    Class,
    AttrsOpen,
    AttrName,
    /// `=`
    AttrEq,
    /// `!=` (value is not escaped)
    AttrEqRaw,
    AttrValue,
    AttrsClose,
    /// Text, with escapes already resolved by the span: a `\` that escapes
    /// `{`, `}`, `|` or `#{` is left out of the span of the text around it.
    Text,
    /// `|` before text, or bare `|` (one space).
    Pipe,
    /// `|{`, with optional whitespace between `|` and `{`, opening a text
    /// block. Its text runs to the matching `PipeClose`.
    PipeOpen,
    /// `}` closing a `|{` text block.
    PipeClose,
    /// Line break inside a multi-line `|{ }` block or raw content. Spans
    /// from the end of one line's text to the start of the next line's text.
    TextNewline,
    /// `{{ ... }}` in text, braces included.
    Mustache,
    /// `#{` opening an inline element.
    InterpStart,
    /// `}` closing `#{`.
    InterpEnd,
    /// `:` block expansion.
    Colon,
    /// `=` buffered expression.
    Eq,
    Expr,
    /// Start of the raw content of `script` or `style`, zero-width at the
    /// end of the head's line. Raw lines follow as `Text` and `TextNewline`.
    RawStart,
    /// The `/script` or `/style` line that ends raw content (trimmed).
    RawEnd,
    /// `//! text`, emitted as an HTML comment. Spans the whole comment.
    Comment,
    /// `// text`, dropped from the output. Spans the whole comment.
    SilentComment,
    /// `/*! ... */`, emitted as an HTML comment. Spans the whole comment.
    BlockComment,
    /// `/* ... */`, dropped from the output. Spans the whole comment.
    SilentBlockComment,
    /// The whole `doctype ...` line.
    Doctype,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub span: Span,
}

impl Diagnostic {
    /// An error.
    pub fn new(code: &'static str, message: impl Into<String>, span: Span) -> Self {
        Diagnostic {
            code,
            severity: Severity::Error,
            message: message.into(),
            hint: None,
            span,
        }
    }

    /// A warning: reported, but the template still compiles.
    pub fn warning(code: &'static str, message: impl Into<String>, span: Span) -> Self {
        Diagnostic {
            severity: Severity::Warning,
            ..Diagnostic::new(code, message, span)
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}
