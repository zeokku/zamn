//! End-to-end tests over tests/fixtures.

use std::path::{Path, PathBuf};

use zamn::{compile, CompileOptions, Compiled, FsResolver};

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
    compile(&source, &options, Some(&FsResolver::default()))
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
/// written by `bun scripts/pug-parity.ts --write` from real pug.
#[test]
fn matches_pug() {
    for file in fixtures("pug", "pug") {
        let expected = std::fs::read_to_string(file.with_extension("html"))
            .unwrap_or_else(|_| panic!("no expected HTML for {}", file.display()));
        assert_eq!(html(&file), expected, "{}", file.display());
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
    let out = compile("input(disabled)\nbr", &options, None);
    assert_eq!(out.code, "<input disabled><br>");
}

#[test]
fn include_errors() {
    let out = compile("include a", &CompileOptions::default(), None);
    assert_eq!(out.diagnostics[0].code, "INCLUDE_FAILED");

    struct Loop;
    impl zamn::Resolver for Loop {
        fn resolve(&self, path: &str, _: &str) -> Result<zamn::Resolved, String> {
            Ok(zamn::Resolved {
                filename: path.into(),
                source: "include a".into(),
            })
        }
    }
    let out = compile("include a", &CompileOptions::default(), Some(&Loop));
    assert!(
        out.diagnostics[0].message.contains("includes itself"),
        "{:?}",
        out.diagnostics
    );
}
