# Getting started

## Try it

The quickest way is the [playground](../playground): type zamn on the left and see
the HTML on the right.

## Install

::: code-group

```sh [bun]
bun add -d zamn
```

```sh [npm]
npm install -D zamn
```

```sh [pnpm]
pnpm add -D zamn
```

```sh [cargo]
cargo install zamn
```

:::

The npm package is the compiler built to WebAssembly, so it has no native
dependencies and works in Node, Bun, Deno and the browser. `cargo install` gives
you the `zamn` command line tool.

## A first template

Save this as `page.zamn`:

```zamn
doctype html
html(lang="en") {
  head {
    meta(charset="utf-8")
    title My page
  }
  body {
    h1 Hello
    p.lead Plain HTML, without the angle brackets.
  }
}
```

Compile it from the command line:

```sh
zamn page.zamn -o page.html
```

`page.html` now holds:

```html
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>My page</title></head><body><h1>Hello</h1><p class="lead">Plain HTML, without the angle brackets.</p></body></html>
```

The output has no whitespace between tags. Whitespace you want in the page is
written explicitly; see [Text](./syntax/text).

## From JavaScript

```ts
import { compile } from "zamn";

const source = await Bun.file("page.zamn").text();
const { code, map } = compile(source, { filename: "page.zamn", sourceMap: true });
```

`compile` throws a `ZamnError` that lists every problem in the template. `lex` and
`parse` never throw: they return the tokens or the syntax tree together with
diagnostics. See the [JavaScript API](../reference/api).

## In a Vue project

`<template lang="zamn">` works in single-file components once Vite knows how to
compile it. The [ecosystem overview](../ecosystem/overview) sets up the build, type
checking, linting, formatting and editor support, one step at a time.

```vue
<script setup lang="ts">
defineProps<{ msg: string }>();
</script>

<template lang="zamn">
.greetings {
  h1.green= msg
  h3 You did it!
}
</template>
```

## Errors

A template with problems is not compiled. Each problem names its code, the place and
usually a hint:

```zamn error=UNSUPPORTED_SYNTAX
ul
  each item in items
    li= item
```

```text
page.zamn:2:3: error[UNSUPPORTED_SYNTAX]: `each` (control flow) is not supported
  hint: zamn has no control flow; use your framework's directives, e.g. `div(v-if="cond")`
```

All codes are listed under [Diagnostics](../reference/diagnostics).
