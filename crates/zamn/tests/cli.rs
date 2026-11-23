use std::io::Write;
use std::process::{Command, Output, Stdio};

fn zamn(args: &[&str], stdin: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_zamn"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(stdin.as_bytes()).unwrap();
    child.wait_with_output().unwrap()
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).unwrap()
}

#[test]
fn reads_a_file() {
    let dir = std::env::temp_dir().join(format!("zamn-cli-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("page.zamn");
    std::fs::write(&file, "p {\n  b hi\n}\n").unwrap();
    let out = zamn(&[file.to_str().unwrap()], "");
    std::fs::remove_dir_all(&dir).unwrap();
    assert!(out.status.success());
    assert_eq!(text(&out.stdout), "<p><b>hi</b></p>\n");
}

#[test]
fn reads_stdin_without_a_file() {
    let out = zamn(&[], "ul {\n  li: a(href=\"/\") Home\n}\n");
    assert!(out.status.success());
    assert_eq!(text(&out.stdout), "<ul><li><a href=\"/\">Home</a></li></ul>\n");
}

#[test]
fn reads_stdin_for_a_dash() {
    let out = zamn(&["-", "--doctype", "html"], "input(disabled)\n");
    assert!(out.status.success());
    assert_eq!(text(&out.stdout), "<input disabled>\n");
}

#[test]
fn names_stdin_in_errors() {
    let out = zamn(&[], "p {\n  b hi\n");
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let stderr = text(&out.stderr);
    assert!(stderr.starts_with("<stdin>:1:3: error[UNCLOSED_BRACE]"), "{stderr}");
}

#[test]
fn reports_a_missing_file() {
    let out = zamn(&["does-not-exist.zamn"], "");
    assert_eq!(out.status.code(), Some(1));
    assert!(text(&out.stderr).starts_with("does-not-exist.zamn: "));
}

#[test]
fn rejects_unknown_options() {
    let out = zamn(&["--nope"], "");
    assert_eq!(out.status.code(), Some(2));
}
