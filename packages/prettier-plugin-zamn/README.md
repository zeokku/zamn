# prettier-plugin-zamn

Formats [zamn](../../README.md) templates with [Prettier](https://prettier.io) 3.

```sh
bun add -d prettier prettier-plugin-zamn
```

```json
// .prettierrc
{ "plugins": ["prettier-plugin-zamn"] }
```

```sh
bunx prettier --write "src/**/*.zamn"
```

`.zamn` files are picked up by extension. In Vue single-file components,
`<template lang="zamn">` is formatted too.

## Options

| Option | Values | |
|---|---|---|
| `zamnMaxAttributesPerLine` | `3` (default), or any number | up to that many attributes stay on the line of the tag; more go one per line |
| | `0` | always one per line |
| | `-1` | as written: on one line, or one per line if the `(...)` spans lines |
| | `false` | always on the line of the tag |
| `zamnAttributeSeparator` | `"space"` (default) | `a(href="/" target="_blank")` |
| | `"comma"` | `a(href="/", target="_blank")` |

`singleQuote`, `printWidth`, `tabWidth` and `useTabs` apply as well.

## What it does

- One statement per line, children in `{ }` blocks (the `{` at the end of the tag's line, the `}` on its own), every block indented with `tabWidth` / `useTabs`. Indentation means nothing to zamn, so this fixes misleading indentation without changing the output. Blocks written on one line are printed over several.
- An element whose only child is a line of text is written `tag text`.
- `|{ }` text over several lines and `script` / `style` content are indented one level deeper; zamn strips the indentation their lines have in common, so the output doesn't change. Their content, text, escapes, mustaches, `= expr` and comments are copied as written.
- Attributes are quoted with `singleQuote`, separated as `zamnAttributeSeparator` says, and go one per line when there are more than `zamnMaxAttributesPerLine` or the head doesn't fit in `printWidth`. Inside `#{...}` they stay on the line.
- At most one blank line between statements; no whitespace at the end of lines.

The compiled HTML does not change, with one exception: the continuation lines of an attribute value that spans several lines are re-indented with the attribute.

A template with errors is not formatted: the first error is thrown as a syntax error. Warnings don't stop it.

See [the documentation](../../docs/ecosystem/prettier.md).

## Develop

```sh
bun run build   # src/*.ts to dist/
bun test        # runs against dist/ and the built zamn package
```
