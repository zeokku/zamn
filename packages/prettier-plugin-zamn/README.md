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
| `zamnBlockStyle` | `"braces"` (default) | every element that has children holds them in `{ }` |
| | `"preserve"` | braces or indentation, as each element is written |
| `zamnAttributeSeparator` | `"space"` (default) | `a(href="/" target="_blank")` |
| | `"comma"` | `a(href="/", target="_blank")` |

`singleQuote`, `printWidth`, `tabWidth` and `useTabs` apply as well.

## What it does

- Re-indents everything with `tabWidth` / `useTabs`, including the contents of
  `{ }` blocks, text blocks (`p.`) and comment blocks.
- Gives every element that has children a `{ }` block, unless
  `zamnBlockStyle` is `"preserve"`. A block can only open straight after the
  tag and its attributes, so an element with text or `= expr` on its line keeps
  its children indented under it.
- Writes attributes as `name="value"`. Quotes follow `singleQuote`, unless the
  other quote needs fewer escapes. Attributes may be written with spaces or
  commas between them; they are printed with what `zamnAttributeSeparator`
  says.
- Puts attributes one per line when the tag, ids, classes and attributes do not
  fit in `printWidth`. Text after the tag does not count and is never wrapped.
- Keeps at most one blank line between statements.
- Writes an empty brace block as `{}`.

The compiled HTML does not change, with one exception: the continuation lines
of an attribute value that spans several lines are re-indented with the
attribute.

```
div(:class="{
        active: isActive
    }" @click="go")
```

```
div(
  :class="{
    active: isActive
  }"
  @click="go"
)
```

Whitespace at the end of a text line is part of the text (`| a ` followed by
`b c` is `a <b>c</b>`), so it is kept.

A template with errors is not formatted: the first diagnostic is thrown as a
syntax error.
