# Ecosystem

zamn comes with everything a Vue project expects of its templates. Each piece is a
separate package, so add only what you use.

| Package | What it does | Page |
|---|---|---|
| `zamn` | the compiler: Vite uses it to build `<template lang="zamn">` | [Vite and Vue](./vite) |
| `vue-language-plugin-zamn` | type checking with `vue-tsc`, plus completion, hover, go to definition and rename in the editor | [TypeScript](./typescript) |
| `eslint-plugin-vue-zamn` | lets eslint-plugin-vue lint zamn templates, and reports zamn's syntax errors | [ESLint](./eslint) |
| `vue-eslint-parser-template-tokenizer-zamn` | the part of the above that reads templates; set up for you by `eslint-plugin-vue-zamn` | [ESLint](./eslint#by-hand) |
| `prettier-plugin-zamn` | formats `.zamn` files and `<template lang="zamn">` | [Prettier](./prettier) |
| zamn for VS Code | syntax highlighting and folding in `.zamn` files and Vue components | [VS Code](./vscode) |

## Set up a Vue project

Starting from a Vue + Vite project (`bun create vue`, say), these six steps are the whole setup. Each links to its own page, with the details and options.

### 1. Build

```sh
bun add -d zamn
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { compile } from "zamn";

const zamn = {
  render(source: string, { filename }: { filename: string }, done: (error: unknown, html?: string) => void) {
    try {
      done(null, compile(source, { filename }).code);
    } catch (error) {
      done(error);
    }
  },
};

export default defineConfig({
  plugins: [vue({ template: { preprocessCustomRequire: (lang) => (lang === "zamn" ? zamn : undefined) } })],
});
```

Full setup and options: [Vite and Vue](./vite).

### 2. Write a template

```vue
<template lang="zamn">
.greetings {
  h1.green= msg
  h3 You did it!
}
</template>
```

### 3. Type check

```sh
bun add -d vue-language-plugin-zamn
```

```jsonc
// tsconfig.app.json
{
  "vueCompilerOptions": { "plugins": ["vue-language-plugin-zamn"] }
}
```

The Vue - Official extension picks it up too. Full setup and options: [TypeScript](./typescript).

### 4. Lint

```sh
bun add -d eslint-plugin-vue-zamn
```

```js
// eslint.config.js
import vue from "eslint-plugin-vue";
import vueZamn from "eslint-plugin-vue-zamn";

export default [
  ...vue.configs["flat/recommended"],
  ...vueZamn.configs.recommended,
];
```

Full setup and options: [ESLint](./eslint).

### 5. Format

```sh
bun add -d prettier prettier-plugin-zamn
```

```json
// .prettierrc
{ "plugins": ["prettier-plugin-zamn"] }
```

Full setup and options: [Prettier](./prettier).

### 6. Highlight

```sh
code --install-extension zamn.vscode-zamn
```

Full setup and options: [VS Code](./vscode).

When you're done, the scripts of a fresh Vue project all understand zamn:

| Script | What reads the zamn templates |
|---|---|
| `dev`, `build` | Vite, through `zamn` |
| `type-check` | `vue-tsc`, through `vue-language-plugin-zamn` |
| `lint` | ESLint and eslint-plugin-vue, through `eslint-plugin-vue-zamn` |
| `format` | Prettier, through `prettier-plugin-zamn` |

The [example app](https://github.com/zeokku/zamn/tree/main/example) in the repository
is Vue's starter app with every template in zamn and all of this set up.

## Versions

| Package | Needs |
|---|---|
| `vue-language-plugin-zamn` | `@vue/language-core` 3.3 or later (Vue - Official and `vue-tsc` 3.3), Node 22.12 or later |
| `eslint-plugin-vue-zamn` | ESLint 9 or later (flat config), eslint-plugin-vue 10, vue-eslint-parser 10.4 or later, Node 22.12 or later |
| `prettier-plugin-zamn` | Prettier 3 |
| zamn for VS Code | VS Code 1.100 or later |

The Node versions come from `require()` of ES modules, which Vue's language tools
and vue-eslint-parser use to load plugins.
