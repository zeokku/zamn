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
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
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
    assert_eq!(
        text(&out.stdout),
        "<ul><li><a href=\"/\">Home</a></li></ul>\n"
    );
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
    assert!(
        stderr.starts_with("<stdin>:1:3: error[UNCLOSED_BRACE]"),
        "{stderr}"
    );
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

/// A file in a fresh directory, removed when dropped.
struct Temp(std::path::PathBuf);

impl Temp {
    fn new(name: &str, text: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("zamn-cli-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, text).unwrap();
        Temp(path)
    }

    fn path(&self) -> &str {
        self.0.to_str().unwrap()
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
    }
}

const SFC: &str = "<script setup>\nconst on = true\n</script>\n\n<template lang=\"zamn\">\nform {\n  input(:disabled=\"on\")\n}\n</template>\n";

#[test]
fn compiles_the_template_of_a_vue_file() {
    let file = Temp::new("Form.vue", SFC);
    let out = zamn(&[file.path()], "");
    assert!(out.status.success(), "{}", text(&out.stderr));
    assert_eq!(text(&out.stdout), "<form><input :disabled=\"on\"></form>\n");
}

#[test]
fn validate_prints_nothing_for_valid_files() {
    let page = Temp::new("page.zamn", "p {\n  b hi\n}\n");
    let sfc = Temp::new("Ok.vue", SFC);
    let out = zamn(&["--validate", page.path(), sfc.path()], "");
    assert!(out.status.success());
    assert!(out.stdout.is_empty());
    assert!(out.stderr.is_empty());
}

#[test]
fn validate_reports_errors_at_their_place_in_a_vue_file() {
    let sfc = Temp::new("Bad.vue", "<script setup>\nconst a = 1\n</script>\n<template lang=\"zamn\">\np {\n  b hi\n</template>\n");
    let out = zamn(&["--validate", sfc.path()], "");
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let stderr = text(&out.stderr);
    assert!(
        stderr.starts_with(&format!("{}:5:3: error[UNCLOSED_BRACE]", sfc.path())),
        "{stderr}"
    );
}

#[test]
fn validate_checks_every_file() {
    let bad = Temp::new("bad.zamn", "p {\n");
    let good = Temp::new("good.zamn", "p hi\n");
    let out = zamn(&["--validate", "missing.zamn", bad.path(), good.path()], "");
    assert_eq!(out.status.code(), Some(1));
    let stderr = text(&out.stderr);
    assert!(stderr.contains("missing.zamn: "), "{stderr}");
    assert!(
        stderr.contains("bad.zamn:1:3: error[UNCLOSED_BRACE]"),
        "{stderr}"
    );
    assert!(!stderr.contains("good.zamn"), "{stderr}");
}

#[test]
fn validate_reads_stdin() {
    let out = zamn(&["--validate"], "ul {\n  li x\n}\n");
    assert!(out.status.success());
    assert!(out.stdout.is_empty() && out.stderr.is_empty());
    let out = zamn(&["--validate"], "ul {\n");
    assert_eq!(out.status.code(), Some(1));
    assert!(text(&out.stderr).starts_with("<stdin>:1:4: error[UNCLOSED_BRACE]"));
}

#[test]
fn a_vue_file_needs_a_zamn_template() {
    let sfc = Temp::new("Html.vue", "<template><p>hi</p></template>\n");
    let out = zamn(&["--validate", sfc.path()], "");
    assert_eq!(out.status.code(), Some(1));
    assert!(text(&out.stderr).contains("no <template lang=\"zamn\">"));
}

#[test]
fn several_files_need_validate() {
    let out = zamn(&["a.zamn", "b.zamn"], "");
    assert_eq!(out.status.code(), Some(2));
    let out = zamn(&["--validate", "--ast", "a.zamn"], "");
    assert_eq!(out.status.code(), Some(2));
}
