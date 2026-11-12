//! HTML generation for zamn, with source mappings.

pub mod sourcemap;

use zamn_lexer::Diagnostic;
use zamn_parser::ast::*;

/// Index of a source file, as assigned by the caller.
pub type FileId = u32;

#[derive(Clone, Debug)]
pub struct Options {
    /// Delimiters for `= expr`. Defaults to `{{` and `}}`.
    pub interpolation: (String, String),
    /// Assume this doctype without emitting it (e.g. `html` for Vue templates,
    /// so boolean attributes are written as `disabled` rather than
    /// `disabled="disabled"`).
    pub doctype: Option<String>,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            interpolation: ("{{".into(), "}}".into()),
            doctype: None,
        }
    }
}

/// A point in the output that corresponds to a point in a source file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Mapping {
    /// Byte offset in the generated HTML.
    pub generated: u32,
    pub file: FileId,
    /// Byte offset in the source file.
    pub source: u32,
}

pub struct Output {
    pub html: String,
    pub mappings: Vec<Mapping>,
    pub diagnostics: Vec<(FileId, Diagnostic)>,
}

/// What an `include` resolved to.
pub enum Included<'a> {
    Template { file: FileId, nodes: &'a [Node] },
    Raw { file: FileId, text: &'a str },
}

pub trait Includes {
    fn get(&self, file: FileId, include: &Include) -> Option<Included<'_>>;
}

/// Ignores every include.
pub struct NoIncludes;

impl Includes for NoIncludes {
    fn get(&self, _: FileId, _: &Include) -> Option<Included<'_>> {
        None
    }
}

pub fn generate(
    nodes: &[Node],
    file: FileId,
    includes: &dyn Includes,
    options: &Options,
) -> Output {
    let mut g = Generator {
        out: String::new(),
        mappings: Vec::new(),
        diags: Vec::new(),
        includes,
        options,
        terse: false,
        xml: false,
    };
    if let Some(doctype) = &options.doctype {
        g.set_doctype(doctype);
    }
    g.nodes(nodes, file);
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

fn doctype_string(name: &str) -> String {
    match name.to_ascii_lowercase().as_str() {
        "html" => "<!DOCTYPE html>".into(),
        "xml" => "<?xml version=\"1.0\" encoding=\"utf-8\" ?>".into(),
        "transitional" => "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">".into(),
        "strict" => "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\">".into(),
        "frameset" => "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Frameset//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd\">".into(),
        "1.1" => "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.1//EN\" \"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\">".into(),
        "basic" => "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML Basic 1.1//EN\" \"http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd\">".into(),
        "mobile" => "<!DOCTYPE html PUBLIC \"-//WAPFORUM//DTD XHTML Mobile 1.2//EN\" \"http://www.openmobilealliance.org/tech/DTD/xhtml-mobile12.dtd\">".into(),
        "plist" => "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">".into(),
        _ => format!("<!DOCTYPE {name}>"),
    }
}

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

struct Generator<'a> {
    out: String,
    mappings: Vec<Mapping>,
    diags: Vec<(FileId, Diagnostic)>,
    includes: &'a dyn Includes,
    options: &'a Options,
    /// HTML5 doctype: void tags as `<br>`, boolean attributes as `checked`.
    terse: bool,
    xml: bool,
}

impl Generator<'_> {
    fn map(&mut self, file: FileId, source: u32) {
        self.mappings.push(Mapping {
            generated: self.out.len() as u32,
            file,
            source,
        });
    }

    fn set_doctype(&mut self, name: &str) -> String {
        let doctype = doctype_string(if name.is_empty() { "html" } else { name });
        self.terse = doctype.eq_ignore_ascii_case("<!doctype html>");
        self.xml = doctype.starts_with("<?xml");
        doctype
    }

    fn nodes(&mut self, nodes: &[Node], file: FileId) {
        for node in nodes {
            self.node(node, file);
        }
    }

    fn node(&mut self, node: &Node, file: FileId) {
        match node {
            Node::Element(el) => self.element(el, file),
            Node::Text(t) => {
                self.map(file, t.span.start);
                self.out.push_str(&t.value);
            }
            Node::RawHtml(t) => {
                self.map(file, t.span.start);
                self.out.push_str(&t.value);
            }
            Node::Interpolation(i) => {
                self.map(file, i.span.start);
                self.out.push_str(&self.options.interpolation.0);
                self.out.push(' ');
                self.map(file, i.expr_span.start);
                self.out.push_str(&i.expr);
                self.map(file, i.expr_span.end);
                self.out.push(' ');
                self.out.push_str(&self.options.interpolation.1);
            }
            Node::Comment(c) => {
                if c.buffered {
                    self.map(file, c.span.start);
                    self.out.push_str("<!--");
                    self.out.push_str(&c.value);
                    if let Some(block) = &c.block {
                        self.out.push_str(block);
                    }
                    self.out.push_str("-->");
                }
            }
            Node::Doctype(d) => {
                let doctype = self.set_doctype(&d.value);
                self.map(file, d.span.start);
                self.out.push_str(&doctype);
            }
            Node::Include(inc) => match self.includes.get(file, inc) {
                Some(Included::Template { file, nodes }) => self.nodes(nodes, file),
                Some(Included::Raw { file, text }) => {
                    // One mapping per line of the included file.
                    let mut offset = 0;
                    for line in text.split_inclusive('\n') {
                        self.map(file, offset);
                        self.out.push_str(line);
                        offset += line.len() as u32;
                    }
                }
                None => {}
            },
        }
    }

    fn element(&mut self, el: &Element, file: FileId) {
        let void = el.self_closing || (!self.xml && VOID.contains(&el.name.as_str()));
        self.map(file, el.span.start);
        self.out.push('<');
        self.out.push_str(&el.name);
        self.attrs(&el.attrs, file);
        if void {
            self.out.push_str(if self.terse && !el.self_closing {
                ">"
            } else {
                "/>"
            });
            let has_content = el.children.iter().any(|c| match c {
                Node::Text(t) => !t.value.trim().is_empty(),
                _ => true,
            });
            if has_content {
                let span = el.name_span.unwrap_or(el.span);
                self.diags.push((
                    file,
                    Diagnostic::new(
                        "SELF_CLOSING_CONTENT",
                        format!(
                            "{0} is a self closing element: <{0}/> but contains nested content.",
                            el.name
                        ),
                        span,
                    ),
                ));
            }
            return;
        }
        self.out.push('>');
        self.nodes(&el.children, file);
        self.map(file, el.span.end);
        self.out.push_str("</");
        self.out.push_str(&el.name);
        self.out.push('>');
    }

    fn attrs(&mut self, attrs: &[Attribute], file: FileId) {
        // Classes are merged into a single attribute, written first (as pug does).
        let mut first = true;
        for attr in attrs.iter().filter(|a| a.name == "class") {
            let AttrValue::Str(value) = &attr.value else {
                continue;
            };
            if value.is_empty() {
                continue;
            }
            if first {
                self.map(file, attr.span.start);
                self.out.push_str(" class=\"");
                first = false;
            } else {
                self.out.push(' ');
            }
            self.map(file, value_start(attr));
            self.value(value, attr.escaped);
        }
        if !first {
            self.out.push('"');
        }

        for attr in attrs.iter().filter(|a| a.name != "class") {
            match &attr.value {
                AttrValue::Bool(false) => {}
                AttrValue::Bool(true) => {
                    self.out.push(' ');
                    self.map(file, attr.name_span.start);
                    self.out.push_str(&attr.name);
                    if !self.terse {
                        self.out.push_str("=\"");
                        self.out.push_str(&attr.name);
                        self.out.push('"');
                    }
                }
                AttrValue::Str(value) => {
                    if value.is_empty() && attr.name == "style" {
                        continue;
                    }
                    self.out.push(' ');
                    self.map(file, attr.name_span.start);
                    self.out.push_str(&attr.name);
                    self.out.push_str("=\"");
                    self.map(file, value_start(attr));
                    self.value(value, attr.escaped);
                    self.out.push('"');
                }
            }
        }
    }

    fn value(&mut self, value: &str, escaped: bool) {
        if escaped {
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
