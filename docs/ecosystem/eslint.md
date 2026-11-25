# ESLint

`eslint-plugin-vue-zamn` lets [eslint-plugin-vue](https://eslint.vuejs.org) lint zamn templates. It has a config that teaches ESLint to read `<template lang="zamn">` and turns off the rules that can't apply there, and three rules of its own.

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
      "vue-zamn/component-name-in-template-casing": ["error", "kebab-case"],
    },
  },
];
```

Needs ESLint 9 or later (flat config), eslint-plugin-vue 10, vue-eslint-parser 10.4 or later, and Node 22.12 or later.

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

- sets vue-eslint-parser's `templateTokenizer` for `zamn`, given as a path, so it is found wherever it is installed and `eslint --cache` can serialize the config;
- turns on `vue-zamn/no-parsing-error` as an error and `vue-zamn/no-misleading-indentation` as a warning;
- turns off the rules of eslint-plugin-vue that are about how HTML is written:

| Rule | Why |
|---|---|
| `vue/component-name-in-template-casing` | its fix writes `<Name` and `</Name`; use `vue-zamn/component-name-in-template-casing` |
| `vue/html-self-closing` | asks for `/>`, and zamn has no self-closing form |
| `vue/html-indent` | indents as in HTML; the layout is [Prettier](./prettier)'s, and `vue-zamn/no-misleading-indentation` catches the indentation that matters |
| `vue/multiline-html-element-content-newline`, `vue/singleline-html-element-content-newline`, `vue/padding-line-between-tags` | their fixes break lines, and a line break ends a statement in zamn |
| `vue/html-quotes` | a bare value (`n=1`) is not a string to put in quotes; quotes are Prettier's job (`singleQuote`) |
| `vue/max-attributes-per-line`, `vue/first-attribute-linebreak` | decided by Prettier |
| `vue/html-end-tags`, `vue/html-closing-bracket-newline`, `vue/html-closing-bracket-spacing` | about `>`, `/>` and end tags, which zamn doesn't have |

Every other rule of eslint-plugin-vue works as it does on an HTML template, fixes included: `v-for` without `:key`, unused variables, `v-if` with `v-for` and the rest.

ESLint can't tell templates apart by language, so these rules are off for every `.vue` file the config applies to, HTML templates included. In a project that has both, narrow `files`:

```js
...vueZamn.configs.recommended.map((config) => ({ ...config, files: ["src/zamn/**/*.vue"] })),
```

## Rules

### `vue-zamn/no-parsing-error`

Reports zamn's syntax errors, each over the source it is about, with its hint:

```text
div {
  a(href=base + "/docs") Docs
         ^^^^^^^^^^^^^^ JavaScript expressions are not supported in attribute
                        values: zamn has no JavaScript; quote the value, or
                        write a binding such as `:href` for your framework.
}
```

It has no options, and says nothing about HTML templates. Keep `vue/no-parsing-error` on as well: that rule reports syntax errors in expressions (`:title="1 +"`), zamn templates included, and leaves zamn's own errors to this one.

### `vue-zamn/no-misleading-indentation`

Reports a line indented as if it were a child, without braces. Indentation means nothing in zamn, so such a line is a sibling, and zamn warns about it ([`MISLEADING_INDENTATION`](../guide/syntax/brace-blocks#indentation)):

```zamn warning=MISLEADING_INDENTATION
p Some text
  b bold
```

```text
p Some text
  b bold
  ^^^^^^ This line is indented as if it were nested, but indentation means
         nothing in zamn: wrap the children in `{ }` on the line above, or
         remove the indentation.
```

The template still compiles, which is why the config turns it on as a warning. It has no options. [Prettier](./prettier) re-indents the template, which fixes it in one of the two ways: if the line was meant to be a child, put it in `{ }` first.

### `vue-zamn/component-name-in-template-casing`

[`vue/component-name-in-template-casing`](https://eslint.vuejs.org/rules/component-name-in-template-casing.html) with a fix that works in zamn. It takes the same options and is Vue's rule itself: which names are components, which are checked and what the right name is are all decided there. In a zamn template only the fix differs, renaming the tag and nothing else:

```text
MyCard.big(title="a")   →   my-card.big(title="a")
```

In an HTML template it behaves exactly as Vue's rule, so it can replace it in a project that has both kinds.

## Comments

All four kinds of [comments](../guide/syntax/comments) are comments to ESLint, so directives work in any of them. `//` is the one to use, since it stays out of the HTML:

```zamn
// eslint-disable-next-line vue/no-v-html
article(v-html="post.body")
/* eslint-disable vue/no-v-html */
section(v-html="post.intro")
/* eslint-enable vue/no-v-html */
```

## What rules see

The same template AST an HTML template gives, positioned on the zamn source:

| zamn | AST |
|---|---|
| `tag`, `.class`, `#id`, `(...)` | the start tag of a `VElement` |
| `name="value"` in `(...)` | `VAttribute`, or a directive with its expression parsed |
| `name=true` | an attribute without a value |
| `name=false` | nothing, as in the output |
| text, `\|` lines, `\|{ }` blocks | `VText`, with the text as the browser shows it: escapes such as `\{` resolved, character references such as `&rarr;` decoded, and the indentation `\|{ }` strips left out |
| `{{ expr }}` in text, `tag= expr` | `VExpressionContainer` |
| `script` and `style` content | `VText`, as written |
| `//`, `//!`, `/* */` and `/*! */` | comments |
| the `}` of the element's block, of its `tag: \|{ }` text or of the `#{ }` it is in, its `/script` line, or else the end of its statement: its line break, or the `}` of the block it is in | the end tag |

Elements that end at the same `}`, as in `ul { li: a Home }`, share it as their end tag. Variables of `<script setup>` used in the template count as used.

Limits:

- `.class` and `#id` are tokens, not attributes, so rules about `class` and `id` only see the ones written in `(...)`.
- Text outside every element is not in the AST (its `{{ }}` are).

## By hand

`configs.recommended` is a thin layer over `vue-eslint-parser-template-tokenizer-zamn`. To set the tokenizer up yourself:

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

The tokenizer can also be given as the class itself (its default export), but a class can't be serialized, which `eslint --cache` needs. The bare package name works only where vue-eslint-parser can resolve it from its own location, which is not the case with pnpm or Bun's isolated installs.

zamn's diagnostics are in the template's `errors`, each with a `code` that starts with `zamn/` (`zamn/JS_EXPRESSION`), its `severity` (`"error"` or `"warning"`), its `hint`, and its `range` and `loc`. `vue/no-parsing-error` skips them, as it skips every code it doesn't know.
