//! AST and diagnostic snapshots for the fixtures in tests/fixtures.

use std::fmt::Write;
use std::path::{Path, PathBuf};

use zamn_lexer::LineIndex;

fn fixtures(dir: &str) -> Vec<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(dir);
    let mut files: Vec<_> = std::fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "zamn"))
        .filter(|p| !p.to_string_lossy().ends_with(".twin.zamn"))
        .collect();
    files.sort();
    files
}

fn stem(file: &Path) -> String {
    file.file_stem().unwrap().to_string_lossy().into_owned()
}

#[test]
fn ast_snapshots() {
    for dir in ["zamn", "braces"] {
        for file in fixtures(dir) {
            let src = std::fs::read_to_string(&file).unwrap();
            let result = zamn_parser::parse(&src);
            assert!(
                result.diagnostics.is_empty(),
                "{}: {:?}",
                file.display(),
                result.diagnostics
            );
            let json = serde_json::to_string_pretty(&result.ast).unwrap();
            insta::assert_snapshot!(format!("{dir}__{}", stem(&file)), json);
        }
    }
}

/// Lexer and parser diagnostics, without codegen.
#[test]
fn diagnostic_snapshots() {
    for file in fixtures("errors") {
        let src = std::fs::read_to_string(&file).unwrap();
        let result = zamn_parser::parse(&src);
        assert!(!result.diagnostics.is_empty(), "{}", file.display());
        let index = LineIndex::new(&src);
        let mut report = String::new();
        for d in &result.diagnostics {
            let at = index.position(d.span.start);
            let severity = if d.is_error() { "error" } else { "warning" };
            writeln!(
                report,
                "{}:{} {severity}[{}] {} {:?}",
                at.line,
                at.column + 1,
                d.code,
                d.message,
                d.span.slice(&src)
            )
            .unwrap();
            if let Some(hint) = &d.hint {
                writeln!(report, "  hint: {hint}").unwrap();
            }
        }
        insta::assert_snapshot!(format!("errors__{}", stem(&file)), report);
    }
}
