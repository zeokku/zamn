//! End-to-end tests over tests/fixtures.

use std::path::{Path, PathBuf};

use zamn::{compile, CompileOptions, Compiled};

fn fixtures(dir: &str, ext: &str) -> Vec<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(dir);
    let mut files: Vec<_> = std::fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == ext))
        .collect();
    files.sort();
    assert!(!files.is_empty());
    files
}

fn compile_file(file: &Path) -> Compiled {
    let source = std::fs::read_to_string(file).unwrap();
    let options = CompileOptions {
        filename: file.to_string_lossy().into_owned(),
        ..Default::default()
    };
    compile(&source, &options)
}

fn html(file: &Path) -> String {
    let compiled = compile_file(file);
    let errors: Vec<_> = compiled.diagnostics.iter().map(|d| d.to_string()).collect();
    assert!(
        errors.is_empty(),
        "{}:\n{}",
        file.display(),
        errors.join("\n")
    );
    compiled.code
}

fn name(file: &Path) -> String {
    file.file_stem().unwrap().to_string_lossy().into_owned()
}

/// The AST as JSON without its spans, which differ between twins.
fn shape(src: &str) -> serde_json::Value {
    fn strip(v: &mut serde_json::Value) {
        match v {
            serde_json::Value::Object(map) => {
                map.retain(|k, _| k != "span" && !k.ends_with("Span"));
                map.values_mut().for_each(strip);
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(strip),
            _ => {}
        }
    }
    let mut v = serde_json::to_value(zamn::parser::parse(src).ast).unwrap();
    strip(&mut v);
    v
}

/// Indentation means nothing: `X.twin.zamn` is `X.zamn` with all leading
/// indentation stripped, and gives the same tokens and AST.
#[test]
fn indentation_is_cosmetic() {
    let mut pairs = 0;
    for file in fixtures("braces", "zamn") {
        let Some(base) = file.to_str().unwrap().strip_suffix(".twin.zamn") else {
            continue;
        };
        let original = std::fs::read_to_string(format!("{base}.zamn")).unwrap();
        let twin = std::fs::read_to_string(&file).unwrap();
        let kinds = |src: &str| -> Vec<_> {
            zamn::lexer::lex(src)
                .tokens
                .iter()
                .map(|t| t.kind)
                .collect()
        };
        assert_eq!(kinds(&original), kinds(&twin), "{}", file.display());
        assert_eq!(shape(&original), shape(&twin), "{}", file.display());
        for src in [&original, &twin] {
            let codes: Vec<_> = zamn::parser::parse(src)
                .diagnostics
                .iter()
                .map(|d| d.code)
                .filter(|&c| c != "MISLEADING_INDENTATION")
                .collect();
            assert!(codes.is_empty(), "{}: {codes:?}", file.display());
        }
        pairs += 1;
    }
    assert!(pairs >= 5);
}

#[test]
fn html_snapshots() {
    for dir in ["zamn", "braces"] {
        for file in fixtures(dir, "zamn") {
            if !file.to_string_lossy().ends_with(".twin.zamn") {
                insta::assert_snapshot!(format!("html__{dir}__{}", name(&file)), html(&file));
            }
        }
    }
}

#[test]
fn error_snapshots() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/errors/");
    for file in fixtures("errors", "zamn") {
        let compiled = compile_file(&file);
        let report: Vec<_> = compiled
            .diagnostics
            .iter()
            .map(|d| d.to_string().replace(root.to_str().unwrap(), ""))
            .collect();
        assert!(!report.is_empty());
        insta::assert_snapshot!(format!("errors__{}", name(&file)), report.join("\n"));
    }
}

#[test]
fn booleans_are_terse() {
    let out = compile(
        "input(disabled checked=true hidden=false)\nbr",
        &CompileOptions::default(),
    );
    assert_eq!(out.code, "<input disabled checked><br>");
}
