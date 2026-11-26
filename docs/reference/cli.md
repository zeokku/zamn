# CLI

```sh
cargo install zamn
```

```text
Usage: zamn [options] [file]
       zamn --validate [file...]
       zamn --hook

Compiles a zamn template to HTML on stdout. Without a file, or with `-`, the
template is read from stdin. For a `.vue` file, its `<template lang="zamn">`
is compiled.

Options:
  -o, --out <file>     write the HTML to a file
      --map <file>     write a source map
      --validate       only check: print the errors and warnings, or nothing if there are none
      --hook           run as a Claude Code PostToolUse hook: check the .zamn or .vue file just written, and exit 2 on any error or warning
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

# The template of a Vue component
zamn TodoList.vue

# Check files: nothing is printed when they are valid
zamn --validate page.zamn TodoList.vue

# Check a template without writing a file, as an agent would
zamn --validate <<'EOF'
ul {
  li: a(href="/") Home
}
EOF
```

Errors in a template read from stdin name it `<stdin>`.

`--tokens` and `--ast` print what [`lex`](./api#lex) and [`parse`](./api#parse) return, with byte offsets (the JavaScript API gives UTF-16 offsets instead).

## Vue components

For a `.vue` file, zamn compiles its `<template lang="zamn">` and leaves the rest of the file alone. It finds the template as Vue does: the other blocks at the top of the file, such as `<script>` and `<style>`, are skipped whatever they contain, and the template ends at the first `</template>`. Errors carry their line and column in the `.vue` file. A `.vue` file without a zamn template is an error.

## `--validate`

`--validate` compiles each file and prints its errors and warnings, and nothing at all when there are none, so a check that passes costs an agent no output to read. It takes several files, checks every one even after an error, and exits with 1 if any has errors. Warnings alone don't fail it.

## `--hook`

`zamn --hook` is a Claude Code `PostToolUse` hook for `Write|Edit`: it reads the hook input on stdin and checks the `.zamn` or `.vue` file written, as `--validate` does, naming it relative to the project. It prints nothing for a valid file, any other file, or a `.vue` file with an HTML template. On any error or warning it prints them and exits with 2, which passes them on to Claude. It takes no files and no other options. [Setup](../ai/skill#add-the-hook).

## Errors and exit codes

Every problem is printed to stderr, one per line, with its hint below it. Errors read `error[CODE]` and [warnings](./diagnostics) `warning[CODE]`:

```text
page.zamn:4:5: warning[MISLEADING_INDENTATION]: This line is indented like a child of the line above, but it is a sibling
page.zamn:7:14: error[JS_EXPRESSION]: JavaScript expressions are not supported in attribute values
  hint: zamn has no JavaScript; quote the value, or write a binding such as `:href` for your framework
```

Lines are 1-based, columns are 1-based. No HTML is written when there are errors; warnings are printed and the HTML is written all the same.

| Exit code | Meaning |
|---|---|
| 0 | compiled, with or without warnings |
| 1 | the template has errors, a file could not be read or written, or the `--hook` input could not be read |
| 2 | wrong usage: an unknown option, an option without its value, several files without `--validate`, options with `--hook`, or no file while stdin is a terminal; or `--hook` found errors or warnings |
