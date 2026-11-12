# vue-eslint-parser-template-tokenizer-zamn

Lets [vue-eslint-parser](https://github.com/vuejs/vue-eslint-parser) read
[zamn](../../README.md) templates, so ESLint and
[eslint-plugin-vue](https://eslint.vuejs.org) work in
`<template lang="zamn">`.

```sh
bun add -d vue-eslint-parser-template-tokenizer-zamn
```

```js
// eslint.config.js
import vue from "eslint-plugin-vue";
import ZamnTokenizer from "vue-eslint-parser-template-tokenizer-zamn";

export default [
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        templateTokenizer: { zamn: ZamnTokenizer },
      },
    },
    rules: {
      // These rules are about how HTML is written. See below.
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/html-closing-bracket-spacing": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
    },
  },
];
```

A class in the config cannot be serialized, which `eslint --cache` needs. For
that, give the tokenizer as a path instead:

```js
import { fileURLToPath } from "node:url";

const zamnTokenizer = fileURLToPath(
  import.meta.resolve("vue-eslint-parser-template-tokenizer-zamn"),
);
// ...
templateTokenizer: { zamn: zamnTokenizer },
```

The bare package name works too, but only where vue-eslint-parser can resolve
it from its own location, which is not the case with pnpm or Bun's isolated
installs.

Needs vue-eslint-parser 10.4 or later. The package is ESM; giving it by path
or name makes vue-eslint-parser `require()` it, which needs Node 22.12 or later.

## What rules see

The same template AST an HTML template gives, positioned on the zamn source:

| zamn | AST |
|---|---|
| `tag`, `.class`, `#id`, `(...)` | the start tag of a `VElement` |
| `name="value"` in `(...)` | `VAttribute`, or a directive with its expression parsed |
| `name=true` | an attribute without a value |
| `name=false` | nothing, as in the output |
| text, `\|` lines, `p.` blocks, HTML lines | `VText` |
| `{{ expr }}` in any of those, `tag= expr` | `VExpressionContainer` |
| `//` and `//-` comments | comments, so `//- eslint-disable-next-line` works |
| the `}`, the `]` of `#[...]`, or the end of the element's last line | the end tag |

Variables of `<script setup>` used in the template count as used. zamn's own
diagnostics are reported by `vue/no-parsing-error`.

## Limits

- Rules about HTML formatting do not apply and report nonsense, some with
  fixes that would break the template: turn off the ones in the example, and
  `vue/padding-line-between-tags` if you use it. Format with
  [prettier-plugin-zamn](../prettier-plugin-zamn) instead.
- `.class` and `#id` are tokens, not attributes, so rules about `class` and
  `id` only see the ones written in `(...)`.
- Lines of HTML are text: their tags and attributes are not looked at, only
  their `{{ }}`.
- Text and HTML lines outside every element are not in the AST (their `{{ }}`
  are).
