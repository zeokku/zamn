use std::io::{IsTerminal, Read};
use std::process::ExitCode;

use zamn::{compile, compile_vue, CompileOptions, Compiled, FileDiagnostic};

const USAGE: &str = "\
Usage: zamn [options] [file]
       zamn --validate [file...]

Compiles a zamn template to HTML on stdout. Without a file, or with `-`, the
template is read from stdin. For a `.vue` file, its `<template lang=\"zamn\">`
is compiled, as with `--doctype html`.

Options:
  -o, --out <file>     write the HTML to a file
      --map <file>     write a source map
      --doctype <name> assume a doctype without emitting it (e.g. html)
      --validate       only check: print the errors, or nothing if there are none
      --tokens         print the token stream as JSON instead
      --ast            print the AST as JSON instead
  -h, --help           show this help";

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let mut files = Vec::new();
    let (mut out, mut map, mut doctype) = (None, None, None);
    let (mut tokens, mut ast, mut validate) = (false, false, false);
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
            "--doctype" => doctype = Some(value("--doctype")),
            "--validate" => validate = true,
            "--tokens" => tokens = true,
            "--ast" => ast = true,
            _ if arg.starts_with('-') && arg != "-" => {
                return usage(&format!("unknown option {arg}"))
            }
            _ => files.push(arg),
        }
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
            "--validate prints nothing but errors: it takes no --out, --map, --tokens or --ast",
        );
    }

    if validate {
        let mut ok = true;
        for file in &files {
            // A file that can't be read is reported, and the others still checked.
            ok &= load(file, doctype.as_deref(), false)
                .is_ok_and(|compiled| report(&compiled.diagnostics));
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

    let compiled = match load(file, doctype.as_deref(), map.is_some()) {
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
fn load(file: &str, doctype: Option<&str>, source_map: bool) -> Result<Compiled, ExitCode> {
    let (name, source) = read(file)?;
    let vue = is_vue(file);
    let mut options = CompileOptions {
        filename: name.clone(),
        source_map,
        ..Default::default()
    };
    // Vue templates are HTML: `<input>`, not `<input/>`.
    options.codegen.doctype = doctype
        .map(str::to_owned)
        .or_else(|| vue.then(|| "html".to_owned()));
    if !vue {
        return Ok(compile(&source, &options));
    }
    compile_vue(&source, &options).ok_or_else(|| {
        eprintln!("{name}: no <template lang=\"zamn\"> in this file");
        ExitCode::FAILURE
    })
}

/// Prints every diagnostic to stderr; true if there were none.
fn report(diagnostics: &[FileDiagnostic]) -> bool {
    for d in diagnostics {
        eprintln!("{d}");
    }
    diagnostics.is_empty()
}
