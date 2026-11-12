//! Token stream snapshots for the fixtures in tests/fixtures.

use std::fmt::Write;
use std::path::Path;

#[test]
fn token_snapshots() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    for dir in ["zamn", "braces"] {
        let mut files: Vec<_> = std::fs::read_dir(root.join(dir))
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "zamn"))
            .filter(|p| !p.to_string_lossy().ends_with(".twin.zamn"))
            .collect();
        files.sort();
        for file in files {
            let src = std::fs::read_to_string(&file).unwrap();
            let result = zamn_lexer::lex(&src);
            assert!(
                result.diagnostics.is_empty(),
                "{}: {:?}",
                file.display(),
                result.diagnostics
            );
            let mut dump = String::new();
            for t in &result.tokens {
                writeln!(
                    dump,
                    "{:?} {}..{} {:?}",
                    t.kind,
                    t.span.start,
                    t.span.end,
                    t.span.slice(&src)
                )
                .unwrap();
            }
            let name = format!("{dir}__{}", file.file_stem().unwrap().to_string_lossy());
            insta::assert_snapshot!(name, dump);
        }
    }
}
