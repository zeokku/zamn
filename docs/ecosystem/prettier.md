# Prettier

`prettier-plugin-zamn` formats zamn with [Prettier](https://prettier.io) 3: `.zamn` files, and `<template lang="zamn">` in Vue components.

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
| `zamnMaxAttributesPerLine` | `3` (default), or any number | up to that many attributes stay on the line of the tag; more go one per line |
| | `0` | always one per line |
| | `-1` | as written: on one line, or one per line if the `(...)` spans lines |
| | `false` | always on the line of the tag |
| `zamnAttributeSeparator` | `"space"` (default) | `a(href="/" target="_blank")` |
| | `"comma"` | `a(href="/", target="_blank")` |

`singleQuote`, `printWidth`, `tabWidth` and `useTabs` apply as well.

`zamnMaxAttributesPerLine: false` can only be set in a config file or through the API: on the command line, `--zamn-max-attributes-per-line` takes a number.

```ts
// prettier.config.ts
/// <reference types="prettier-plugin-zamn" />
import type { Config } from "prettier";

export default {
  plugins: ["prettier-plugin-zamn"],
  zamnMaxAttributesPerLine: 3,
  zamnAttributeSeparator: "space",
} satisfies Config;
```

## What it does

- Puts one statement on each line, and the children of an element in a `{ }` block: the `{` ends the line of the tag, and the `}` goes on a line of its own. A block written on one line (`ul { li { a x } }`) is printed over several.
- Indents every block with `tabWidth` / `useTabs`. Indentation means nothing to zamn, so this never changes the output, and it fixes [misleading indentation](../guide/syntax/brace-blocks#indentation).
- Writes an element whose only child is a line of text as `tag text`: `p { | Hello }` and `p { |{ Hello } }` become `p Hello`. `p: | Hello` and `p: |{ Hello }` stay as written.
- Keeps `| text` lines and a bare `|` (a space) as they are. Text is trimmed at both ends, so the whitespace after a tag or a `|` becomes one space. Text statements that share a line stay on it.
- Keeps a `|{ }` written over several lines a block, with its lines indented one level deeper and the `}` on a line of its own. zamn strips the indentation the lines have in common, so the text doesn't change; deeper indentation stays.
- Indents the content of `script` and `style` one level deeper, with `/script` or `/style` at the level of the tag, and changes nothing else in it.
- Copies text, mustaches, escapes (`\{`, `\}`, `\#{`), `= expr` and comments as written. A block comment over several lines is kept exactly as it is, since a `/*! */` goes into the HTML. A comment written after a `{` or a `}` on the line of other statements goes on a line of its own.
- Writes quoted values with the quotes `singleQuote` asks for, unless the other quote needs fewer escapes. Unquoted values (`href=/docs`, `:class={ on: x }`, `style={color: red}`) stay as written. Attributes are printed with the separator `zamnAttributeSeparator` asks for.
- Puts attributes one per line when there are more of them than `zamnMaxAttributesPerLine`, or when the tag, ids, classes and attributes don't fit in `printWidth`. Text after the tag doesn't count and is never wrapped. With `-1` and `false`, the print width is not looked at. An inline element `#{...}` always stays on its line, attributes and all, and a value that spans several lines puts every attribute on its own.
- Keeps at most one blank line between statements, and writes an empty block as `{}`.
- Removes whitespace at the end of lines, which means nothing in zamn.

Before:

```zamn warning=MISLEADING_INDENTATION
section.hero { h1 Welcome #{b back}
  p Some text
    b bold
  input(type="text" required name="login" :class="{ error: failed }")
  script
  go()
  /script
}
```

After:

```zamn
section.hero {
  h1 Welcome #{b back}
  p Some text
  b bold
  input(
    type="text"
    required
    name="login"
    :class="{ error: failed }"
  )
  script
    go()
  /script
}
```

The `b` was never inside the `p`: formatting puts it where zamn reads it, and the warning goes away.

## The output doesn't change

Formatting never changes the compiled HTML, with one exception: the continuation lines of an attribute value that spans several lines are re-indented with the attribute.

```zamn skip
div(
  :class="{
      active: isActive
  }"
  @click="go"
)
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

A template with errors is not formatted: Prettier reports the first error as a syntax error, with its position. Warnings don't stop it.

## In VS Code

The Prettier extension loads `prettier.config.ts` once and keeps using that copy: Node caches imported modules, and the extension can't clear that cache. After editing the config, run "Developer: Restart Extension Host" (or reload the window). The Prettier output channel shows the options it actually used. The command line always reads the current file.
