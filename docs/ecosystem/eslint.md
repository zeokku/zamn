# ESLint

`eslint-plugin-vue-zamn` lets [eslint-plugin-vue](https://eslint.vuejs.org) lint
zamn templates. It has a config that teaches ESLint to read `<template lang="zamn">`
and turns off the rules that can't apply there, and two rules of its own.

```sh
bun add -d eslint-plugin-vue-zamn
```

```js
// eslint.config.js
import vue from "eslint-plugin-vue";
import vueZamn from "eslint-plugin-vue-zamn";

export default [
  ...vue.configs["flat/recommended"],
  // After the configs of eslint-plugin-vue, and after anything else that
  // turns their rules on.
  ...vueZamn.configs.recommended,
  {
    files: ["**/*.vue"],
    rules: {
      "vue-zamn/component-name-in-template-casing": ["error", "PascalCase"],
    },
  },
];
```

Needs ESLint 9 or later (flat config), eslint-plugin-vue 10, vue-eslint-parser 10.4
or later, and Node 22.12 or later.

With `@vue/eslint-config-typescript`, put it in the same place:

```ts
// eslint.config.ts
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";
import pluginVueZamn from "eslint-plugin-vue-zamn";
import skipFormatting from "eslint-config-prettier/flat";

export default defineConfigWithVueTs(
  { files: ["**/*.{vue,ts,mts,tsx}"] },
  ...pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  ...pluginVueZamn.configs.recommended,
  skipFormatting,
);
```

## `configs.recommended`

For `*.vue` files, it:

- sets vue-eslint-parser's `templateTokenizer` for `zamn`, given as a path, so it is
  found wherever it is installed and `eslint --cache` can serialize the config;
- turns on `vue-zamn/no-parsing-error`;
- turns off the rules of eslint-plugin-vue that are about how HTML is written:

| Rule | Why |
|---|---|
| `vue/component-name-in-template-casing` | its fix writes `<Name` and `</Name`; use `vue-zamn/component-name-in-template-casing` |
| `vue/html-indent` | its fix re-indents, and indentation is structure in zamn |
| `vue/html-self-closing` | asks for `/>` |
| `vue/multiline-html-element-content-newline`, `vue/singleline-html-element-content-newline` | their fixes break lines where a line break means something else |
| `vue/padding-line-between-tags` | its fix inserts lines that break the indentation |
| `vue/html-quotes` | a bare value (`n=1`) is not a string to put in quotes; quotes are [Prettier](./prettier)'s job (`singleQuote`) |
| `vue/max-attributes-per-line`, `vue/first-attribute-linebreak` | decided by Prettier (`zamnMaxAttributesPerLine`) |
| `vue/html-end-tags`, `vue/html-closing-bracket-newline`, `vue/html-closing-bracket-spacing` | about `>`, `/>` and end tags, which zamn doesn't have |

Every other rule of eslint-plugin-vue works as it does on an HTML template, fixes
included: `v-for` without `:key`, unused variables, `v-if` with `v-for` and the rest.

ESLint can't tell templates apart by language, so these rules are off for every
`.vue` file the config applies to, HTML templates included. In a project that has
both, narrow `files`:

```js
...vueZamn.configs.recommended.map((config) => ({ ...config, files: ["src/zamn/**/*.vue"] })),
```

## Rules

### `vue-zamn/no-parsing-error`

Reports zamn's syntax errors, each over the source it is about, with its hint:

```text
div
  if user
  ^^^^^^^ `if` (control flow) is not supported: zamn has no control flow;
          use your framework's directives, e.g. `div(v-if="cond")`.
```

It has no options, and says nothing about HTML templates. Keep `vue/no-parsing-error`
on as well: that rule reports syntax errors in expressions (`:title="1 +"`), zamn
templates included, and leaves zamn's own errors to this one.

### `vue-zamn/component-name-in-template-casing`

[`vue/component-name-in-template-casing`](https://eslint.vuejs.org/rules/component-name-in-template-casing.html)
with a fix that works in zamn. It takes the same options and is Vue's rule itself:
which names are components, which are checked and what the right name is are all
decided there. In a zamn template only the fix differs, renaming the tag and nothing
else:

```text
my-card.big(title="a")   →   MyCard.big(title="a")
```

In an HTML template it behaves exactly as Vue's rule, so it can replace it in a
project that has both kinds.

## Comments

`//-` comments are comments to ESLint, so directives work:

```zamn
//- eslint-disable-next-line vue/no-v-html
article(v-html="post.body")
```

## What rules see

The same template AST an HTML template gives, positioned on the zamn source:

| zamn | AST |
|---|---|
| `tag`, `.class`, `#id`, `(...)` | the start tag of a `VElement` |
| `name="value"` in `(...)` | `VAttribute`, or a directive with its expression parsed |
| `name=true` | an attribute without a value |
| `name=false` | nothing, as in the output |
| text, `\|` lines, `p.` blocks | `VText` |
| `{{ expr }}` in any of those, `tag= expr` | `VExpressionContainer` |
| `//` and `//-` comments | comments |
| the `}`, the `]` of `#[...]`, or the end of the element's last line | the end tag |

Variables of `<script setup>` used in the template count as used.

Limits:

- `.class` and `#id` are tokens, not attributes, so rules about `class` and `id`
  only see the ones written in `(...)`.
- HTML written in text (`| <b>bold</b>`) is text: its tags and attributes are not
  looked at, only its `{{ }}`.
- Text outside every element is not in the AST (its `{{ }}` are).

## By hand

`configs.recommended` is a thin layer over `vue-eslint-parser-template-tokenizer-zamn`.
To set the tokenizer up yourself:

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
      // Rules about how HTML is written; see the table above.
      "vue/component-name-in-template-casing": "off",
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/html-quotes": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/padding-line-between-tags": "off",
    },
  },
];
```

The tokenizer can also be given as the class itself (its default export), but a
class can't be serialized, which `eslint --cache` needs. The bare package name works
only where vue-eslint-parser can resolve it from its own location, which is not the
case with pnpm or Bun's isolated installs.

zamn's diagnostics are in the template's `errors`, each with a `code` that starts
with `zamn/`, its `hint`, and its `range` and `loc`.
