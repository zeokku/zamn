//! zamn: a static, pug-flavoured way to write HTML.
//!
//! This crate ties the lexer, parser and code generator together.

use serde::Serialize;

pub use zamn_codegen as codegen;
pub use zamn_lexer as lexer;
pub use zamn_parser as parser;

use zamn_codegen::sourcemap;
use zamn_lexer::{Diagnostic, LineIndex, Loc};

#[derive(Clone, Debug)]
pub struct CompileOptions {
    pub filename: String,
    /// Produce a source map.
    pub source_map: bool,
    /// Embed the sources in the map (`sourcesContent`).
    pub sources_content: bool,
    pub codegen: zamn_codegen::Options,
}

impl Default for CompileOptions {
    fn default() -> Self {
        CompileOptions {
            filename: "template.zamn".into(),
            source_map: false,
            sources_content: true,
            codegen: Default::default(),
        }
    }
}

/// A diagnostic with the file it belongs to and JS-style positions.
#[derive(Clone, Debug, Serialize)]
pub struct FileDiagnostic {
    pub filename: String,
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// UTF-16 offsets.
    pub range: [u32; 2],
    pub loc: Loc,
}

impl FileDiagnostic {
    pub fn new(filename: &str, source: &str, d: Diagnostic) -> Self {
        let index = LineIndex::new(source);
        FileDiagnostic {
            filename: filename.to_string(),
            code: d.code,
            message: d.message,
            hint: d.hint,
            range: index.range(d.span),
            loc: index.loc(d.span),
        }
    }
}

impl std::fmt::Display for FileDiagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}:{}: error[{}]: {}",
            self.filename,
            self.loc.start.line,
            self.loc.start.column + 1,
            self.code,
            self.message
        )?;
        if let Some(hint) = &self.hint {
            write!(f, "\n  hint: {hint}")?;
        }
        Ok(())
    }
}

pub struct Compiled {
    /// Best-effort HTML; do not use it when `diagnostics` is non-empty.
    pub code: String,
    /// Source map JSON, when requested.
    pub map: Option<String>,
    /// Every diagnostic is an error.
    pub diagnostics: Vec<FileDiagnostic>,
}

/// Compile a template to HTML.
pub fn compile(source: &str, options: &CompileOptions) -> Compiled {
    let parsed = zamn_parser::parse(source);
    let output = zamn_codegen::generate(&parsed.ast.nodes, &options.codegen);

    let map = options.source_map.then(|| {
        sourcemap::build(
            &output.html,
            &output.mappings,
            sourcemap::Source {
                name: &options.filename,
                content: source,
            },
            None,
            options.sources_content,
        )
    });

    let mut diags = parsed.diagnostics;
    diags.extend(output.diagnostics);
    diags.sort_by_key(|d| d.span.start);
    let diagnostics = diags
        .into_iter()
        .map(|d| FileDiagnostic::new(&options.filename, source, d))
        .collect();

    Compiled {
        code: output.html,
        map,
        diagnostics,
    }
}
