//! zamn: a static, pug-flavoured way to write HTML.
//!
//! This crate ties the lexer, parser and code generator together and resolves
//! `include`s.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

pub use zamn_codegen as codegen;
pub use zamn_lexer as lexer;
pub use zamn_parser as parser;

use zamn_codegen::{sourcemap, FileId, Included, Includes};
use zamn_lexer::{Diagnostic, LineIndex, Loc};
use zamn_parser::ast::{Ast, Include, Node};

/// A file handed back by a [`Resolver`].
pub struct Resolved {
    /// Canonical name of the file; used for cycle detection, as the `from`
    /// of nested includes and in source maps.
    pub filename: String,
    pub source: String,
}

/// Loads the target of an `include`.
pub trait Resolver {
    /// `path` is what the template says (with a default extension added);
    /// `from` is the name of the including file.
    fn resolve(&self, path: &str, from: &str) -> Result<Resolved, String>;
}

/// Resolves includes on the file system, like pug: relative paths against the
/// including file, absolute paths against `basedir`.
#[derive(Default)]
pub struct FsResolver {
    pub basedir: Option<PathBuf>,
}

impl Resolver for FsResolver {
    fn resolve(&self, path: &str, from: &str) -> Result<Resolved, String> {
        let full = if let Some(rest) = path.strip_prefix('/') {
            let Some(base) = &self.basedir else {
                return Err("a base directory is required to include absolute paths".into());
            };
            base.join(rest)
        } else {
            Path::new(from).parent().unwrap_or(Path::new("")).join(path)
        };
        let source =
            std::fs::read_to_string(&full).map_err(|e| format!("{}: {e}", full.display()))?;
        Ok(Resolved {
            filename: full.to_string_lossy().into_owned(),
            source,
        })
    }
}

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
    /// Files pulled in through `include` (for watch mode).
    pub dependencies: Vec<String>,
}

enum Content {
    Template(Ast),
    Raw,
}

struct File {
    name: String,
    source: String,
    content: Content,
}

struct Loader<'r> {
    resolver: Option<&'r dyn Resolver>,
    files: Vec<File>,
    by_name: HashMap<String, FileId>,
    /// (including file, offset of the include) -> included file.
    links: HashMap<(FileId, u32), FileId>,
    diags: Vec<(FileId, Diagnostic)>,
    /// Templates currently being loaded, for cycle detection.
    stack: Vec<FileId>,
}

fn is_template(name: &str) -> bool {
    matches!(
        Path::new(name).extension().and_then(|e| e.to_str()),
        Some("zamn" | "pug")
    )
}

fn collect_includes<'a>(nodes: &'a [Node], out: &mut Vec<&'a Include>) {
    for node in nodes {
        match node {
            Node::Include(inc) => out.push(inc),
            Node::Element(el) => collect_includes(&el.children, out),
            _ => {}
        }
    }
}

impl Loader<'_> {
    fn add_template(&mut self, name: String, source: String) -> FileId {
        let id = self.files.len() as FileId;
        let parsed = zamn_parser::parse(&source);
        self.diags
            .extend(parsed.diagnostics.into_iter().map(|d| (id, d)));

        let mut includes = Vec::new();
        collect_includes(&parsed.ast.nodes, &mut includes);
        let includes: Vec<Include> = includes.into_iter().cloned().collect();

        self.by_name.insert(name.clone(), id);
        self.files.push(File {
            name,
            source,
            content: Content::Template(parsed.ast),
        });
        self.stack.push(id);
        for inc in &includes {
            match self.include(id, inc) {
                Ok(target) => {
                    self.links.insert((id, inc.span.start), target);
                }
                Err(message) => self.diags.push((
                    id,
                    Diagnostic::new("INCLUDE_FAILED", message, inc.path_span),
                )),
            }
        }
        self.stack.pop();
        id
    }

    fn include(&mut self, from: FileId, inc: &Include) -> Result<FileId, String> {
        let Some(resolver) = self.resolver else {
            return Err(format!(
                "cannot include \"{}\": no include resolver was provided",
                inc.path
            ));
        };
        let from_name = self.files[from as usize].name.clone();
        let mut path = inc.path.clone();
        // No extension means a template, with the including file's extension.
        if !path.rsplit(['/', '\\']).next().unwrap_or("").contains('.') {
            path.push_str(if from_name.ends_with(".pug") {
                ".pug"
            } else {
                ".zamn"
            });
        }
        let resolved = resolver
            .resolve(&path, &from_name)
            .map_err(|e| format!("cannot include \"{}\": {e}", inc.path))?;
        if let Some(&id) = self.by_name.get(&resolved.filename) {
            if self.stack.contains(&id) {
                return Err(format!("\"{}\" includes itself", resolved.filename));
            }
            return Ok(id);
        }
        if is_template(&resolved.filename) {
            Ok(self.add_template(resolved.filename, resolved.source))
        } else {
            let id = self.files.len() as FileId;
            self.by_name.insert(resolved.filename.clone(), id);
            self.files.push(File {
                name: resolved.filename,
                source: resolved.source,
                content: Content::Raw,
            });
            Ok(id)
        }
    }
}

impl Includes for Loader<'_> {
    fn get(&self, file: FileId, include: &Include) -> Option<Included<'_>> {
        let target = *self.links.get(&(file, include.span.start))?;
        let f = &self.files[target as usize];
        Some(match &f.content {
            Content::Template(ast) => Included::Template {
                file: target,
                nodes: &ast.nodes,
            },
            Content::Raw => Included::Raw {
                file: target,
                text: &f.source,
            },
        })
    }
}

/// Compile a template to HTML.
pub fn compile(
    source: &str,
    options: &CompileOptions,
    resolver: Option<&dyn Resolver>,
) -> Compiled {
    let mut loader = Loader {
        resolver,
        files: Vec::new(),
        by_name: HashMap::new(),
        links: HashMap::new(),
        diags: Vec::new(),
        stack: Vec::new(),
    };
    let root = loader.add_template(options.filename.clone(), source.to_string());
    let Content::Template(ast) = &loader.files[root as usize].content else {
        unreachable!()
    };
    let output = zamn_codegen::generate(&ast.nodes, root, &loader, &options.codegen);

    let map = options.source_map.then(|| {
        let sources: Vec<_> = loader
            .files
            .iter()
            .map(|f| sourcemap::Source {
                name: &f.name,
                content: &f.source,
            })
            .collect();
        sourcemap::build(
            &output.html,
            &output.mappings,
            &sources,
            None,
            options.sources_content,
        )
    });

    let mut diags = std::mem::take(&mut loader.diags);
    diags.extend(output.diagnostics);
    diags.sort_by_key(|(file, d)| (*file, d.span.start));
    let diagnostics = diags
        .into_iter()
        .map(|(file, d)| {
            let f = &loader.files[file as usize];
            FileDiagnostic::new(&f.name, &f.source, d)
        })
        .collect();

    Compiled {
        code: output.html,
        map,
        diagnostics,
        dependencies: loader.files[1..].iter().map(|f| f.name.clone()).collect(),
    }
}
