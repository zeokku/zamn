# zamn for VS Code

Syntax highlighting for zamn templates:

- `.zamn` files;
- `<template lang="zamn">` in Vue single-file components, alongside the
  [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
  extension.

Expressions in `{{ }}`, after `tag=` and in the values of directives (`:to`,
`@click`, `#default`, `v-if`) are highlighted as TypeScript; the lines under
`script.` and `style.` as JavaScript and CSS. pug syntax that zamn does not
have (`if`, `each`, `mixin`, `include`, `- code`, lines of HTML) is marked as
an error.

The extension also registers the `zamn` language: `//-` for toggling comments,
bracket pairs, and folding by indentation. It has no code of its own. Type
checking comes from `vue-language-plugin-zamn`,
linting from `eslint-plugin-vue-zamn`
and formatting from `prettier-plugin-zamn`.

## Comments

| | Scope | Looks like |
|---|---|---|
| `//- note` | `comment.block.silent.zamn` | a comment: it is left out of the HTML |
| `// note` | `string.comment.buffered.block.zamn` | a string: it is in the HTML, as `<!-- note -->` |

The second scope is the one VS Code's pug grammar gives its `//` comments, so
themes that style those style these. To pick the colours yourself:

```jsonc
// settings.json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "string.comment.buffered.block.zamn", "settings": { "foreground": "#c9a26d" } },
    { "scope": "comment.block.silent.zamn", "settings": { "fontStyle": "italic" } }
  ]
}
```

The language's comment is `//-` (`comments.lineComment` in
`language-configuration.json`), as in VS Code's pug: "Toggle Line Comment"
writes a comment that stays out of the output, in `.zamn` files and inside
`<template lang="zamn">`.

Extensions that decorate comments, such as
[Better Comments Next](https://marketplace.visualstudio.com/items?itemName=edwinhuish.better-comments-next),
read that same setting. Better Comments Next looks for the comment marker of
the file's language first and then for those of the languages embedded in it,
so:

- in a `.zamn` file, `//- TODO` and `// TODO` are both decorated: `//-` is
  zamn's own marker and `//` comes from the embedded TypeScript;
- in a `.vue` file the language is `vue`, whose only marker is `<!-- -->`, and
  `//` comes from the embedded script languages. `//` matches `//- TODO` first
  and then finds `-` where it wants the tag. This extension therefore sets a
  default for `better-comments.languages` that gives `vue` the line comment
  `//-`, which is tried before the embedded `//`. If you set
  `better-comments.languages` yourself, your value replaces that default, so
  include the entry:

  ```jsonc
  "better-comments.languages": [
    { "id": "vue", "comments": { "lineComment": "//-", "blockComment": ["<!--", "-->"] } }
  ]
  ```

## Install from this repository

```sh
cd packages/vscode-zamn
bun run package                                   # writes vscode-zamn-0.1.2.vsix
code --install-extension vscode-zamn-0.1.2.vsix
```

Installing a newer `.vsix` over an older one does not always stick: after a
restart VS Code may go back to the previous version (0.1.1 instead of 0.1.2,
say). Check the version in the Extensions view. If it is the old one, uninstall
the extension and install the `.vsix` again:

```sh
code --uninstall-extension zamn.vscode-zamn
code --install-extension vscode-zamn-0.1.2.vsix
```

The same goes for `code-insiders`.

## Develop

The grammars are `syntaxes/zamn.tmLanguage.json`
and a second one that injects it into Vue files. `bun test` tokenizes samples
with the engine VS Code uses and checks the scopes. To look at scopes in the
editor, run "Developer: Inspect Editor Tokens and Scopes".
