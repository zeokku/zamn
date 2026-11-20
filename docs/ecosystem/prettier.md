# Prettier

`prettier-plugin-zamn` formats zamn with [Prettier](https://prettier.io) 3: `.zamn`
files, and `<template lang="zamn">` in Vue components.

```sh
bun add -d prettier prettier-plugin-zamn
```

```json
// .prettierrc
{ "plugins": ["prettier-plugin-zamn"] }
```

```sh
bunx prettier --write "src/**/*.{zamn,vue}"
```

## Options

| Option | Values | |
|---|---|---|
| `zamnBlockStyle` | `"braces"` (default) | every element that has children holds them in `{ }` |
| | `"preserve"` | braces or indentation, as each element is written |
| `zamnMaxAttributesPerLine` | `3` (default), or any number | up to that many attributes stay on the line of the tag; more go one per line |
| | `0` | always one per line |
| | `-1` | as written: on one line, or one per line if the `(...)` spans lines |
| | `false` | always on the line of the tag |
| `zamnAttributeSeparator` | `"space"` (default) | `a(href="/" target="_blank")` |
| | `"comma"` | `a(href="/", target="_blank")` |

`singleQuote`, `printWidth`, `tabWidth` and `useTabs` apply as well.

`zamnMaxAttributesPerLine: false` can only be set in a config file or through the
API: on the command line, `--zamn-max-attributes-per-line` takes a number.

```ts
// prettier.config.ts
/// <reference types="prettier-plugin-zamn" />
import type { Config } from "prettier";

export default {
  plugins: ["prettier-plugin-zamn"],
  zamnBlockStyle: "braces",
  zamnMaxAttributesPerLine: 3,
  zamnAttributeSeparator: "space",
} satisfies Config;
```

## What it does

- Re-indents everything with `tabWidth` / `useTabs`, including the contents of
  brace blocks, text blocks (`p.`) and comment blocks.
- Gives every element that has children a `{ }` block, unless `zamnBlockStyle` is
  `"preserve"`. A block can only open straight after the tag and its attributes, so
  text or `= expr` on the line of such an element moves into the block, as a
  `| text` or `= expr` line.
- Writes attributes as `name="value"`. Quotes follow `singleQuote`, unless the other
  quote needs fewer escapes. Attributes are printed with the separator
  `zamnAttributeSeparator` asks for.
- Puts attributes one per line when there are more of them than
  `zamnMaxAttributesPerLine`, or when the tag, ids, classes and attributes don't fit
  in `printWidth`. Text after the tag doesn't count and is never wrapped. With `-1`
  and `false`, the print width is not looked at. Attributes inside `#[...]` always stay
  on their line, and a value that spans several lines puts every attribute on its
  own.
- Keeps at most one blank line between statements, and writes an empty block as `{}`.
- Removes whitespace at the end of lines, which means nothing in zamn. A `|` on its
  own (a space between two lines) is kept.

Before:

```zamn
section.hero
  h1 Welcome #[b back]
  input(type="text" required name="login" :class="{ error: failed }")
```

After:

```zamn
section.hero {
  h1 Welcome #[b back]
  input(
    type="text"
    required
    name="login"
    :class="{ error: failed }"
  )
}
```

## The output doesn't change

Formatting never changes the compiled HTML, with one exception: the continuation
lines of an attribute value that spans several lines are re-indented with the
attribute.

```zamn skip
div(:class="{
        active: isActive
    }" @click="go")
```

```zamn skip
div(
  :class="{
    active: isActive
  }"
  @click="go"
)
```

## Errors

A template with errors is not formatted: Prettier reports the first diagnostic as a
syntax error, with its position.

## In VS Code

The Prettier extension loads `prettier.config.ts` once and keeps using that copy:
Node caches imported modules, and the extension can't clear that cache. After
editing the config, run "Developer: Restart Extension Host" (or reload the window).
The Prettier output channel shows the options it actually used. The command line
always reads the current file.
