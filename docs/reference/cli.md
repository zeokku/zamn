# CLI

```sh
cargo install zamn
```

```text
Usage: zamn [options] <file>

Compiles a zamn template to HTML on stdout.

Options:
  -o, --out <file>     write the HTML to a file
      --map <file>     write a source map
      --doctype <name> assume a doctype without emitting it (e.g. html)
      --tokens         print the token stream as JSON instead
      --ast            print the AST as JSON instead
  -h, --help           show this help
```

## Examples

```sh
# HTML on stdout
zamn page.zamn

# HTML and a source map
zamn page.zamn -o page.html --map page.html.map

# A component template, written the HTML way
zamn Card.zamn --doctype html

# Check a file without keeping the output
zamn page.zamn > /dev/null && echo ok
```

`--tokens` and `--ast` print what [`lex`](./api#lex) and [`parse`](./api#parse)
return, with byte offsets (the JavaScript API gives UTF-16 offsets instead).

## Errors and exit codes

Every problem is printed to stderr, one per line, with its hint below it:

```text
page.zamn:4:1: error[INCONSISTENT_INDENTATION]: Inconsistent indentation. Expecting either 2 or 4 spaces/tabs.
page.zamn:7:14: error[JS_EXPRESSION]: JavaScript expressions are not supported in attribute values
  hint: zamn has no JavaScript; quote the value, or write a binding such as `:href` for your framework
```

Lines are 1-based, columns are 1-based. No HTML is written when there are errors.

| Exit code | Meaning |
|---|---|
| 0 | compiled |
| 1 | the template has errors, or a file could not be read or written |
| 2 | wrong usage: unknown option, missing file |
