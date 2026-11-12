//! Lexer for zamn, a static pug-flavoured HTML language.
//!
//! Tokens are a kind plus a byte span into the source; nothing is copied.

mod lexer;
mod span;

use serde::Serialize;

pub use lexer::{lex, LexResult};
pub use span::{LineIndex, Loc, Position, Span};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum TokenKind {
    /// Next statement at the same indentation.
    Newline,
    Indent,
    Outdent,
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
    Text,
    /// `|` starting a line of text.
    Pipe,
    /// Trailing `.` starting a text block.
    Dot,
    TextBlockStart,
    /// Line break inside a text block.
    TextNewline,
    TextBlockEnd,
    /// `#[`
    InterpStart,
    /// `]`
    InterpEnd,
    /// `:` block expansion.
    Colon,
    /// `/` explicit self-close.
    Slash,
    /// `=` buffered expression.
    Eq,
    Expr,
    /// `// text`, emitted as an HTML comment.
    Comment,
    /// `//- text`, dropped from the output.
    SilentComment,
    /// The whole `doctype ...` line.
    Doctype,
    Include,
    Path,
    /// A line of literal HTML (starts with `<`).
    RawHtml,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub span: Span,
}

impl Diagnostic {
    pub fn new(code: &'static str, message: impl Into<String>, span: Span) -> Self {
        Diagnostic {
            code,
            message: message.into(),
            hint: None,
            span,
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }
}
