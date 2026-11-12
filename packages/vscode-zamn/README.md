# zamn for VS Code

Syntax highlighting for zamn templates:

- `.zamn` files;
- `<template lang="zamn">` in Vue single-file components, alongside the
  [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
  extension.

Expressions in `{{ }}`, after `tag=` and in the values of directives (`:to`,
`@click`, `#default`, `v-if`) are highlighted as TypeScript; the lines under
`script.` and `style.` as JavaScript and CSS; lines of HTML as HTML. pug syntax
that zamn does not have (`if`, `each`, `mixin`, `include`, `- code`) is marked
as an error.

The extension also registers the `zamn` language: `//` for toggling comments,
bracket pairs, and folding by indentation. It has no code of its own. Type
checking comes from `vue-language-plugin-zamn`,
linting from `vue-eslint-parser-template-tokenizer-zamn`
and formatting from `prettier-plugin-zamn`.

## Install from this repository

```sh
cd packages/vscode-zamn
bun run package                                   # writes vscode-zamn-0.1.1.vsix
code --install-extension vscode-zamn-0.1.1.vsix
```

Installing a newer `.vsix` over an older one does not always stick: after a
restart VS Code may go back to the previous version (0.1.0 instead of 0.1.1,
say). Check the version in the Extensions view. If it is the old one, uninstall
the extension and install the `.vsix` again:

```sh
code --uninstall-extension zamn.vscode-zamn
code --install-extension vscode-zamn-0.1.1.vsix
```

The same goes for `code-insiders`.

## Develop

The grammars are `syntaxes/zamn.tmLanguage.json`
and a second one that injects it into Vue files. `bun test` tokenizes samples
with the engine VS Code uses and checks the scopes. To look at scopes in the
editor, run "Developer: Inspect Editor Tokens and Scopes".
