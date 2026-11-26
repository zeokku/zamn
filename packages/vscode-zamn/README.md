# zamn for VS Code

[Documentation](https://zeokku.github.io/zamn/ecosystem/vscode)

Syntax highlighting and folding for zamn templates:

- `.zamn` files;
- `<template lang="zamn">` in Vue single-file components, alongside the [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension.

Expressions in `{{ }}`, after `tag=` and in directive values (`:to`, `@click`, `#default`, `v-if`) are highlighted as TypeScript; the raw content of `script` and `style` as JavaScript and CSS; the values in `style={...}` as CSS. Syntax zamn does not have, text that does not start with `|`, an unescaped `{` in text and a `/tag` line that closes nothing are marked as errors.

The extension also registers the `zamn` language: `//` and `/* */` for toggling comments, and bracket pairs. `{ }`, `|{ }` and `( )` blocks, raw `script` and `style` content and `/* */` comments that span lines fold, by zamn's own lexer; in a Vue file, the Vue extension folds the rest. Type checking comes from `vue-language-plugin-zamn`, linting from `eslint-plugin-vue-zamn`, formatting from `prettier-plugin-zamn`.

The grammar follows the braces, so a `{` it does not take for a block, or a missing `}`, shifts what comes after it; the compiler's errors, through ESLint or the Vue extension, say where. A `script` or `style` gets raw content only when its head is on one line.

## Comments

`//` and `/* */` are left out of the HTML and are scoped as comments. `//!` and `/*! */` go into the HTML as `<!-- -->` and are scoped `string.comment.buffered.block.zamn`, as VS Code's pug grammar scopes its own, so they look like strings. To pick the colours yourself:

```jsonc
// settings.json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "string.comment.buffered.block.zamn", "settings": { "foreground": "#c9a26d" } },
    { "scope": ["comment.line.double-slash.zamn", "comment.block.zamn"], "settings": { "fontStyle": "italic" } }
  ]
}
```

## Install from this repository

```sh
cd packages/vscode-zamn
bun run install:local                # or: bun run install:local code
```

`install:local` packages `zamn-vscode-<version>.vsix`, uninstalls the extension and installs the newest `.vsix`, with `code-insiders` if it is on PATH, otherwise `code`; an argument names another CLI. Reload open windows to load it: the reload button on zamn in the Extensions view, or "Developer: Reload Window".

With WSL or another remote, the CLI installs on the side it runs on. A copy also installed on Windows wins over the one in WSL, and the editor keeps the old grammar: uninstall the copy under "Local" in the Extensions view, run `install:local` again, and reload.

## Develop

The grammars are `syntaxes/zamn.tmLanguage.json` and a second one that injects it into Vue files. The folding is `src/`, which `bun run build` type-checks and bundles into `dist/`, with zamn's WebAssembly next to it. `bun test` tokenizes samples with the engine VS Code uses and checks the scopes, checks the folds, and builds and loads the bundle; it needs zamn built (`bun run build` at the root). To see scopes in the editor, run "Developer: Inspect Editor Tokens and Scopes".
