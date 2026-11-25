# vue-eslint-parser-template-tokenizer-zamn

Lets [vue-eslint-parser](https://github.com/vuejs/vue-eslint-parser) read [zamn](../../README.md) templates, so ESLint and [eslint-plugin-vue](https://eslint.vuejs.org) work in `<template lang="zamn">`.

[eslint-plugin-vue-zamn](../eslint-plugin-vue-zamn) sets this up for you, turns off the rules that cannot be used on a zamn template and reports zamn's diagnostics. Use this package directly only if you want to do that yourself:

```sh
bun add -d vue-eslint-parser-template-tokenizer-zamn
```

```js
// eslint.config.js
import { fileURLToPath } from "node:url";
import vue from "eslint-plugin-vue";

const zamnTokenizer = fileURLToPath(import.meta.resolve("vue-eslint-parser-template-tokenizer-zamn"));

export default [
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        templateTokenizer: { zamn: zamnTokenizer },
      },
    },
    rules: {
      // These rules are about how HTML is written. See eslint-plugin-vue-zamn.
      "vue/component-name-in-template-casing": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/padding-line-between-tags": "off",
      "vue/html-quotes": "off",
      "vue/max-attributes-per-line": "off",
      "vue/first-attribute-linebreak": "off",
    },
  },
];
```

The tokenizer is given as a path, so vue-eslint-parser `require()`s it from wherever it is installed and `eslint --cache` can serialize the config. The class itself (the default export) works too, but cannot be serialized. The bare package name works only where vue-eslint-parser can resolve it from its own location, which is not the case with pnpm or Bun's isolated installs.

Needs vue-eslint-parser 10.4 or later. The package is ESM; giving it by path or name makes vue-eslint-parser `require()` it, which needs Node 22.12 or later.

## What rules see

The same template AST an HTML template gives, positioned on the zamn source:

| zamn | AST |
|---|---|
| `tag`, `.class`, `#id`, `(...)` | the start tag of a `VElement` |
| `name="value"` in `(...)` | `VAttribute`, or a directive with its expression parsed |
| `name=true` | an attribute without a value |
| `name=false` | nothing, as in the output |
| text, `\|` lines, `\|{ }` blocks | `VText`, with the text as the browser shows it: escapes resolved, character references decoded, the indentation `\|{ }` strips left out |
| `{{ expr }}` in text, `tag= expr` | `VExpressionContainer` |
| `script` and `style` content | `VText`, as written |
| `//`, `//!`, `/* */` and `/*! */` | comments, so `// eslint-disable-next-line` works |
| the `}` of the element's block, of its `\|{ }` text or of the `#{ }` it is in, its `/script` line, or else the end of its statement (its line break, or the `}` of the block it is in) | the end tag |

Variables of `<script setup>` used in the template count as used.

zamn's diagnostics are in the `errors` of the template, each with a `code` that starts with `zamn/` (`zamn/JS_EXPRESSION`), its `severity` (`"error"` or `"warning"`), its `hint`, and the `range` and `loc` it covers. `vue/no-parsing-error` skips codes it does not know, so it reports errors in expressions only; `vue-zamn/no-parsing-error` and `vue-zamn/no-misleading-indentation` of eslint-plugin-vue-zamn report zamn's.

## Limits

- Rules about HTML formatting do not apply and report nonsense, some with fixes that would break the template: turn off the ones in the example. Format with [prettier-plugin-zamn](../prettier-plugin-zamn) instead.
- `.class` and `#id` are tokens, not attributes, so rules about `class` and `id` only see the ones written in `(...)`.
- Text outside every element is not in the AST (its `{{ }}` are).
