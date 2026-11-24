use serde::Serialize;
use zamn_lexer::Span;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Ast {
    pub nodes: Vec<Node>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type")]
pub enum Node {
    Element(Element),
    Text(Text),
    Mustache(Mustache),
    Interpolation(Interpolation),
    Comment(Comment),
    Doctype(Doctype),
}

impl Node {
    pub fn span(&self) -> Span {
        match self {
            Node::Element(n) => n.span,
            Node::Text(n) => n.span,
            Node::Mustache(n) => n.span,
            Node::Interpolation(n) => n.span,
            Node::Comment(n) => n.span,
            Node::Doctype(n) => n.span,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    pub name: String,
    /// `None` for an implicit `div` (`.foo`, `#bar`).
    pub name_span: Option<Span>,
    /// `#id`, `.class` and `(...)` attributes in source order.
    pub attrs: Vec<Attribute>,
    pub children: Vec<Node>,
    /// Children were written inside `{ }`.
    pub braced: bool,
    /// `script` or `style` with raw content ended by `/script` or `/style`.
    /// Its children are `Text` nodes, one per line run, never escaped.
    pub raw: bool,
    pub span: Span,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum Shorthand {
    Id,
    Class,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum AttrValue {
    Str(String),
    /// `true` for a boolean attribute; `false` means the attribute is dropped.
    Bool(bool),
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attribute {
    pub name: String,
    pub name_span: Span,
    pub value: AttrValue,
    /// `None` for boolean attributes.
    pub value_span: Option<Span>,
    /// `=` escapes the value on output, `!=` does not.
    pub escaped: bool,
    /// Set for `#id` and `.class`.
    pub shorthand: Option<Shorthand>,
    pub span: Span,
}

/// Text as written, with escapes resolved; codegen escapes it for HTML.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Text {
    pub value: String,
    pub span: Span,
}

/// `{{ ... }}` in text, written to the output as it is.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Mustache {
    /// The whole mustache, braces included.
    pub value: String,
    pub span: Span,
}

/// `= expr`, emitted as `{{ expr }}`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interpolation {
    pub expr: String,
    pub expr_span: Span,
    pub span: Span,
}

/// `// text`, `//! text`, `/* ... */` or `/*! ... */`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Comment {
    /// `true` for `//!` and `/*!`, which are emitted as `<!--value-->`.
    pub buffered: bool,
    /// `true` for `/* */` and `/*! */`.
    pub block: bool,
    /// Everything after the marker (`//`, `//!`, `/*`, `/*!`), up to the end
    /// of the line or the `*/`, as written.
    pub value: String,
    pub span: Span,
}

/// `doctype X`, emitted as `<!DOCTYPE X>`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Doctype {
    /// `X`, trimmed.
    pub value: String,
    pub span: Span,
}
