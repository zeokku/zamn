use std::io::{IsTerminal, Read};
use std::process::ExitCode;

use zamn::{compile, CompileOptions, FileDiagnostic};

const USAGE: &str = "\
Usage: zamn [options] [file]

Compiles a zamn template to HTML on stdout. Without a file, or with `-`, the
template is read from stdin.

Options:
  -o, --out <file>     write the HTML to a file
      --map <file>     write a source map
      --doctype <name> assume a doctype without emitting it (e.g. html)
      --tokens         print the token stream as JSON instead
      --ast            print the AST as JSON instead
  -h, --help           show this help";

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let (mut file, mut out, mut map, mut doctype) = (None, None, None, None);
    let (mut tokens, mut ast) = (false, false);
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
            "--tokens" => tokens = true,
            "--ast" => ast = true,
            _ if arg.starts_with('-') && arg != "-" => {
                eprintln!("unknown option {arg}\n\n{USAGE}");
                return ExitCode::from(2);
            }
            _ => file = Some(arg),
        }
    }
    let stdin = file.as_deref().is_none_or(|f| f == "-");
    if file.is_none() && std::io::stdin().is_terminal() {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    }
    let file = if stdin { "<stdin>".to_owned() } else { file.unwrap() };
    let read = if stdin {
        let mut s = String::new();
        std::io::stdin().read_to_string(&mut s).map(|_| s)
    } else {
        std::fs::read_to_string(&file)
    };
    let source = match read {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{file}: {e}");
            return ExitCode::FAILURE;
        }
    };

    if tokens || ast {
        let parsed = zamn::parser::parse(&source);
        let json = if tokens {
            serde_json::to_string_pretty(&zamn::lexer::lex(&source).tokens)
        } else {
            serde_json::to_string_pretty(&parsed.ast)
        };
        println!("{}", json.unwrap());
        return report(
            parsed
                .diagnostics
                .into_iter()
                .map(|d| FileDiagnostic::new(&file, &source, d))
                .collect(),
        );
    }

    let mut options = CompileOptions {
        filename: file,
        source_map: map.is_some(),
        ..Default::default()
    };
    options.codegen.doctype = doctype;
    let compiled = compile(&source, &options);
    if !compiled.diagnostics.is_empty() {
        return report(compiled.diagnostics);
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

fn report(diagnostics: Vec<FileDiagnostic>) -> ExitCode {
    for d in &diagnostics {
        eprintln!("{d}");
    }
    if diagnostics.is_empty() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
