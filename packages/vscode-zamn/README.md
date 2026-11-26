# zamn for VS Code

Syntax highlighting for zamn templates:

- `.zamn` files;
- `<template lang="zamn">` in Vue single-file components, alongside the [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension.

Expressions in `{{ }}`, after `tag=` and in the values of directives (`:to`, `@click`, `#default`, `v-if`) are highlighted as TypeScript; the raw content of `script` and `style` (the lines up to `/script` and `/style`) as JavaScript and CSS; the values in `style={...}` as CSS. Syntax that zamn does not have (`if`, `each`, `mixin`, `include`, `- code`, lines of HTML, `#[...]`, `tag.`, `tag/`), text that does not start with `|`, a `{` in text that is not escaped, and a `/tag` line that closes nothing are marked as errors.

The extension also registers the `zamn` language: `//` and `/* */` for toggling comments, bracket pairs, and folding by indentation. It has no code of its own. Type checking comes from `vue-language-plugin-zamn`, linting from `eslint-plugin-vue-zamn` and formatting from `prettier-plugin-zamn`.

The grammar follows the braces, so a `{` it does not see as a block (or a missing `}`) shifts what comes after it; the compiler's errors, through ESLint or the Vue extension, say where. A `script` or `style` gets raw content only when its head (`script(type="module")`) is on one line.

## Comments

| | Scope | Looks like |
|---|---|---|
| `// note` | `comment.line.double-slash.zamn` | a comment: it is left out of the HTML |
| `/* note */` | `comment.block.zamn` | a comment: it is left out of the HTML |
| `//! note` | `string.comment.buffered.block.zamn` | a string: it is in the HTML, as `<!-- note -->` |
| `/*! note */` | `string.comment.buffered.block.zamn` | a string: it is in the HTML, as `<!-- note -->` |

The last scope is the one VS Code's pug grammar gives the comments it puts in the HTML, so themes that style those style these. To pick the colours yourself:

```jsonc
// settings.json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "string.comment.buffered.block.zamn", "settings": { "foreground": "#c9a26d" } },
    { "scope": ["comment.line.double-slash.zamn", "comment.block.zamn"], "settings": { "fontStyle": "italic" } }
  ]
}
```

The language's comments are `//` and `/* */` (`comments` in `language-configuration.json`): "Toggle Line Comment" and "Toggle Block Comment" write comments that stay out of the output, in `.zamn` files and inside `<template lang="zamn">`.

Extensions that decorate comments, such as [Better Comments Next](https://marketplace.visualstudio.com/items?itemName=edwinhuish.better-comments-next), read that same setting. Better Comments Next looks for the comment marker of the file's language first and then for those of the languages embedded in it, and wants a space between the marker and its tag:

- `// TODO` and `/* TODO */` are decorated, in `.zamn` files and in `.vue` files;
- `//! TODO` is not, and neither is `//!` taken for its "alert" tag `!`: Better Comments Next finds `//`, then `!` where it wants the space.

In a `.vue` file the language is `vue`, whose only marker is `<!-- -->`. This extension sets a default for `better-comments.languages` that gives `vue` the line comment `//`. If you set `better-comments.languages` yourself, your value replaces that default, so include the entry:

```jsonc
"better-comments.languages": [
  { "id": "vue", "comments": { "lineComment": "//", "blockComment": ["<!--", "-->"] } }
]
```

## Install from this repository

```sh
cd packages/vscode-zamn
bun run install:local                # or: bun run install:local code
```

`install:local` runs `bun run package`, which writes `vscode-zamn-<version>.vsix`, then uninstalls the extension and installs the newest `.vsix` in the directory. It installs with `code-insiders` if that is on PATH, otherwise with `code`; an argument names another CLI. Open windows keep the old version until reloaded: click the reload button on zamn in the Extensions view, or run "Developer: Reload Window".

Installing a newer `.vsix` over an older one does not always stick: after a restart VS Code may go back to the previous version (0.1.1 instead of 0.1.2, say). That is why `install:local` uninstalls first. By hand:

```sh
code --uninstall-extension zamn.vscode-zamn
code --install-extension vscode-zamn-0.1.2.vsix
```

The same goes for `code-insiders`.

## Develop

The grammars are `syntaxes/zamn.tmLanguage.json` and a second one that injects it into Vue files. `bun test` tokenizes samples with the engine VS Code uses and checks the scopes; it needs no build. To look at scopes in the editor, run "Developer: Inspect Editor Tokens and Scopes".
