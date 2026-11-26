# zamn

[Documentation](https://zeokku.github.io/zamn/) · [Playground](https://zeokku.github.io/zamn/playground)

A new, modern and fast way to write HTML with `{ }` blocks instead of closing tags. Easy to read, quick to write, and with AI coding agent support for code generation.

```
div {
  .another-div {
    button(@click="go") Text
    p= message
  }
}
```

```html
<div><div class="another-div"><button @click="go">Text</button><p>{{ message }}</p></div></div>
```

This package is the compiler, written in Rust and built to WebAssembly: no native dependencies, and it runs in Node, Bun, Deno and the browser.

```sh
npm install -D zamn
```

```ts
import { compile, parse } from "zamn";

const { code, map, warnings } = compile(source, {
  filename: "page.zamn",
  sourceMap: true,
}); // throws a ZamnError on errors

const { ast, diagnostics } = parse(source); // ranges and locs are UTF-16, ESLint style
```

The [JavaScript API](https://zeokku.github.io/zamn/reference/api) has `compile`, `parse` and `lex`, their options and types. In Vue, [Vite](https://zeokku.github.io/zamn/ecosystem/vite) compiles `<template lang="zamn">` with this package, and zamn has plugins for [TypeScript](https://zeokku.github.io/zamn/ecosystem/typescript), [ESLint](https://zeokku.github.io/zamn/ecosystem/eslint), [Prettier](https://zeokku.github.io/zamn/ecosystem/prettier) and [VS Code](https://zeokku.github.io/zamn/ecosystem/vscode).
