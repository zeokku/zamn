//! AST snapshots for the fixtures in tests/fixtures.

use std::path::Path;

#[test]
fn ast_snapshots() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    for (dir, name) in [
        ("zamn", "vue"),
        ("zamn", "text"),
        ("zamn", "include"),
        ("braces", "basic"),
    ] {
        let file = root.join(dir).join(format!("{name}.zamn"));
        let src = std::fs::read_to_string(&file).unwrap();
        let result = zamn_parser::parse(&src);
        assert!(
            result.diagnostics.is_empty(),
            "{}: {:?}",
            file.display(),
            result.diagnostics
        );
        let json = serde_json::to_string_pretty(&result.ast).unwrap();
        insta::assert_snapshot!(format!("{dir}__{name}"), json);
    }
}
