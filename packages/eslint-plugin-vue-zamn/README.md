# eslint-plugin-vue-zamn

ESLint for [zamn](../../README.md) templates in Vue single-file components, on top of [eslint-plugin-vue](https://eslint.vuejs.org):

- a config that lets ESLint read `<template lang="zamn">` and turns off the rules of eslint-plugin-vue that cannot be used there;
- three rules of its own.

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

## `configs.recommended`

For `*.vue` files:

- sets `parserOptions.templateTokenizer.zamn` to [vue-eslint-parser-template-tokenizer-zamn](../vue-eslint-parser-template-tokenizer-zamn), given as a path, so vue-eslint-parser finds it from wherever it is installed and `eslint --cache` can serialize the config;
- turns on `vue-zamn/no-parsing-error` (`error`) and `vue-zamn/no-misleading-indentation` (`warn`);
- turns off these rules of eslint-plugin-vue:

| Rule | Why |
|---|---|
| `vue/component-name-in-template-casing` | its fix writes `<Name` and `</Name`; use `vue-zamn/component-name-in-template-casing` |
| `vue/html-self-closing` | asks for `/>`, and zamn has no self-closing form |
| `vue/html-indent` | indents as in HTML; the layout is prettier-plugin-zamn's, and `vue-zamn/no-misleading-indentation` catches the indentation that matters |
| `vue/multiline-html-element-content-newline`, `vue/singleline-html-element-content-newline`, `vue/padding-line-between-tags` | their fixes break lines, and a line break ends a statement in zamn |
| `vue/html-quotes` | a bare value (`n=1`) is not a string to put in quotes; its fix writes `&quot;`, which zamn escapes again; quotes are for prettier-plugin-zamn (`singleQuote`) |
| `vue/max-attributes-per-line`, `vue/first-attribute-linebreak` | decided by [prettier-plugin-zamn](../prettier-plugin-zamn) |
| `vue/html-end-tags`, `vue/html-closing-bracket-newline`, `vue/html-closing-bracket-spacing` | about `>`, `/>` and end tags, which zamn does not have; they never report |

Every other rule of eslint-plugin-vue works as it does on an HTML template, fixes included.

ESLint cannot tell templates apart by their language: the rules above are off for every `.vue` file the config applies to, HTML templates among them. In a project that has both, narrow `files`:

```js
...vueZamn.configs.recommended.map((config) => ({ ...config, files: ["src/zamn/**/*.vue"] })),
```

## Rules

### `vue-zamn/no-parsing-error`

Reports zamn's syntax errors, each over the source it is about and with its hint:

```
div {
  a(href=base + "/docs") Docs
         ^^^^^^^^^^^^^^ JavaScript expressions are not supported in attribute
                        values: zamn has no JavaScript; quote the value, or
                        write a binding such as `:href` for your framework.
}
```

It has no options, and says nothing about HTML templates. Keep `vue/no-parsing-error` on next to it: that rule reports syntax errors in expressions (`:title="1 +"`), in zamn templates too, and skips zamn's own.

### `vue-zamn/no-misleading-indentation`

Reports a line indented as if it were a child, without braces (zamn's `MISLEADING_INDENTATION` warning). Indentation means nothing in zamn, so the line is a sibling:

```
p Some text
  b bold
  ^^^^^^ This line is indented as if it were nested, but indentation means
         nothing in zamn: wrap the children in `{ }` on the line above, or
         remove the indentation.
```

The template still compiles, so the config turns it on as a warning. It has no options.

### `vue-zamn/component-name-in-template-casing`

[`vue/component-name-in-template-casing`](https://eslint.vuejs.org/rules/component-name-in-template-casing.html) with a fix that works in zamn. It takes the same options and is Vue's rule itself: which names are components, which are checked and what the right name is are all decided there. In a zamn template only the fix differs, renaming the tag and nothing else:

```
MyCard.big(title="a")   →   my-card.big(title="a")
```

In an HTML template it behaves exactly as Vue's rule, so it can replace it in a project that has both kinds.

A zamn tag cannot hold a `.`, which starts a class: `Form.Input` is the tag `Form` with the class `Input`, not a namespaced component.
