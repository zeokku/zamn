use std::io::{IsTerminal, Read};
use std::path::PathBuf;
use std::process::ExitCode;

use zamn::{compile, compile_vue, CompileOptions, Compiled, FileDiagnostic};

const USAGE: &str = "\
Usage: zamn [options] [file]
       zamn --validate [file...]
       zamn --hook

Compiles a zamn template to HTML on stdout. Without a file, or with `-`, the
template is read from stdin. For a `.vue` file, its `<template lang=\"zamn\">`
is compiled. Errors and warnings are printed to stderr; only errors stop the
HTML from being written and make the exit status 1.

Options:
  -o, --out <file>     write the HTML to a file
      --map <file>     write a source map
      --validate       only check: print the errors and warnings, or nothing
                       if there are none
      --hook           run as a Claude Code PostToolUse hook: check the .zamn
                       or .vue file just written, and exit 2 on any error or
                       warning
      --tokens         print the token stream as JSON instead
      --ast            print the AST as JSON instead
  -h, --help           show this help";

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let mut files = Vec::new();
    let (mut out, mut map) = (None, None);
    let (mut tokens, mut ast, mut validate, mut hook) = (false, false, false, false);
    while let Some(arg) = args.next() {
        let mut value = |name: &str| {
            args.next().unwrap_or_else(|| {
                eprintln!("{name} needs a value");
                std::process::exit(2)
            })
        };
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "-o" | "--out" => out = Some(value("--out")),
            "--map" => map = Some(value("--map")),
            "--validate" => validate = true,
            "--hook" => hook = true,
            "--tokens" => tokens = true,
            "--ast" => ast = true,
            _ if arg.starts_with('-') && arg != "-" => {
                return usage(&format!("unknown option {arg}"))
            }
            _ => files.push(arg),
        }
    }
    if hook {
        if !files.is_empty() || out.is_some() || map.is_some() || tokens || ast || validate {
            return usage("--hook takes no files and no other options");
        }
        if std::io::stdin().is_terminal() {
            return usage("--hook reads Claude Code's hook input on stdin");
        }
        return run_hook();
    }
    if files.is_empty() {
        if std::io::stdin().is_terminal() {
            return usage("");
        }
        files.push("-".to_owned());
    }
    if files.len() > 1 && !validate {
        return usage("several files can only be given with --validate");
    }
    if validate && (out.is_some() || map.is_some() || tokens || ast) {
        return usage(
            "--validate prints nothing but diagnostics: it takes no --out, --map, --tokens or --ast",
        );
    }

    if validate {
        let mut ok = true;
        for file in &files {
            // A file that can't be read is reported, and the others still checked.
            ok &= load(file, false).is_ok_and(|compiled| report(&compiled.diagnostics));
        }
        return if ok {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        };
    }

    let file = &files[0];
    if (tokens || ast) && is_vue(file) {
        return usage("--tokens and --ast take a zamn template, not a .vue file");
    }
    if tokens || ast {
        let (name, source) = match read(file) {
            Ok(read) => read,
            Err(code) => return code,
        };
        let parsed = zamn::parser::parse(&source);
        let json = if tokens {
            serde_json::to_string_pretty(&zamn::lexer::lex(&source).tokens)
        } else {
            serde_json::to_string_pretty(&parsed.ast)
        };
        println!("{}", json.unwrap());
        let diagnostics: Vec<_> = parsed
            .diagnostics
            .into_iter()
            .map(|d| FileDiagnostic::new(&name, &source, d))
            .collect();
        return if report(&diagnostics) {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        };
    }

    let compiled = match load(file, map.is_some()) {
        Ok(compiled) => compiled,
        Err(code) => return code,
    };
    if !report(&compiled.diagnostics) {
        return ExitCode::FAILURE;
    }
    let written = match &out {
        Some(path) => std::fs::write(path, &compiled.code),
        None => {
            println!("{}", compiled.code);
            Ok(())
        }
    }
    .and_then(|()| match (&map, &compiled.map) {
        (Some(path), Some(json)) => std::fs::write(path, json),
        _ => Ok(()),
    });
    if let Err(e) = written {
        eprintln!("{e}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

fn usage(problem: &str) -> ExitCode {
    if problem.is_empty() {
        eprintln!("{USAGE}");
    } else {
        eprintln!("{problem}\n\n{USAGE}");
    }
    ExitCode::from(2)
}

fn is_vue(file: &str) -> bool {
    file.ends_with(".vue")
}

/// The name to report the file under, and its text: stdin for `-`.
fn read(file: &str) -> Result<(String, String), ExitCode> {
    let read = if file == "-" {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s).map(|_| s)
    } else {
        std::fs::read_to_string(file)
    };
    let name = if file == "-" { "<stdin>" } else { file };
    match read {
        Ok(source) => Ok((name.to_owned(), source)),
        Err(e) => {
            eprintln!("{name}: {e}");
            Err(ExitCode::FAILURE)
        }
    }
}

/// Reads and compiles one file: a `.vue` file's zamn template, or a template.
fn load(file: &str, source_map: bool) -> Result<Compiled, ExitCode> {
    let (name, source) = read(file)?;
    compile_file(&name, &source, is_vue(file), source_map).ok_or_else(|| {
        eprintln!("{name}: no <template lang=\"zamn\"> in this file");
        ExitCode::FAILURE
    })
}

/// Compiles a template, or a `.vue` file's zamn template: `None` if it has none.
fn compile_file(name: &str, source: &str, vue: bool, source_map: bool) -> Option<Compiled> {
    let options = CompileOptions {
        filename: name.to_owned(),
        source_map,
        ..Default::default()
    };
    if vue {
        compile_vue(source, &options)
    } else {
        Some(compile(source, &options))
    }
}

/// `--hook`: checks the `.zamn` or `.vue` file a Claude Code Write or Edit
/// wrote, named in the hook input on stdin. Silent when it is valid, or not a
/// zamn file; with errors or warnings, prints them and exits with 2, which
/// Claude Code passes on to Claude. Bad input exits with 1, a hook error
/// Claude Code shows the user.
fn run_hook() -> ExitCode {
    let fail = |problem: String| {
        eprintln!("zamn --hook: {problem}");
        ExitCode::FAILURE
    };
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        return fail(format!("can't read the hook input: {e}"));
    }
    let input: serde_json::Value = match serde_json::from_str(&input) {
        Ok(input) => input,
        Err(e) => return fail(format!("the hook input is not JSON: {e}")),
    };
    let file = match input["tool_input"]["file_path"].as_str() {
        Some(file) if file.ends_with(".zamn") || is_vue(file) => file,
        _ => return ExitCode::SUCCESS,
    };
    let cwd: PathBuf = match input["cwd"].as_str() {
        Some(cwd) => cwd.into(),
        None => match std::env::current_dir() {
            Ok(cwd) => cwd,
            Err(e) => return fail(format!("no cwd: {e}")),
        },
    };
    // Named as Claude wrote it: relative to the project when inside it.
    let path = cwd.join(file);
    let name = match path.strip_prefix(&cwd) {
        Ok(relative) => relative.to_string_lossy().into_owned(),
        Err(_) => file.to_owned(),
    };
    let source = match std::fs::read_to_string(&path) {
        Ok(source) => source,
        Err(e) => return fail(format!("{name}: {e}")),
    };
    // A `.vue` file with an HTML template is fine.
    match compile_file(&name, &source, is_vue(file), false) {
        Some(compiled) if !compiled.diagnostics.is_empty() => {
            report(&compiled.diagnostics);
            ExitCode::from(2)
        }
        _ => ExitCode::SUCCESS,
    }
}

/// Prints every diagnostic to stderr; true if none is an error.
fn report(diagnostics: &[FileDiagnostic]) -> bool {
    for d in diagnostics {
        eprintln!("{d}");
    }
    !diagnostics.iter().any(FileDiagnostic::is_error)
}
