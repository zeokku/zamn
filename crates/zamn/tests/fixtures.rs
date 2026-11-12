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

/// Static pug must compile to exactly what pug produces. The expected HTML is
/// written by `bun scripts/pug-parity.ts --write` from real pug, which is
/// given the source without the whitespace at the end of lines.
///
/// A bare `|` is a space in zamn and an empty line of text in pug, so a
/// fixture that has one is compared with runs of whitespace collapsed.
#[test]
fn matches_pug() {
    for file in fixtures("pug", "pug") {
        let expected = std::fs::read_to_string(file.with_extension("html"))
            .unwrap_or_else(|_| panic!("no expected HTML for {}", file.display()));
        let source = std::fs::read_to_string(&file).unwrap();
        let actual = html(&file);
        if source.lines().any(|line| line.trim() == "|") {
            let collapse = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
            assert_eq!(collapse(&actual), collapse(&expected), "{}", file.display());
        } else {
            assert_eq!(actual, expected, "{}", file.display());
        }
    }
}

/// A brace block and its indentation-only twin are the same document.
#[test]
fn braces_equal_indentation() {
    let mut pairs = 0;
    for file in fixtures("braces", "zamn") {
        let Some(base) = file.to_str().unwrap().strip_suffix(".twin.zamn") else {
            continue;
        };
        assert_eq!(
            html(Path::new(&format!("{base}.zamn"))),
            html(&file),
            "{}",
            file.display()
        );
        pairs += 1;
    }
    assert!(pairs >= 3);
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
fn doctype_option_is_terse() {
    let mut options = CompileOptions::default();
    options.codegen.doctype = Some("html".into());
    let out = compile("input(disabled)\nbr", &options);
    assert_eq!(out.code, "<input disabled><br>");
}
