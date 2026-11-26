# VS Code

The [zamn extension](https://marketplace.visualstudio.com/items?itemName=zamn.vscode-zamn) highlights and folds zamn templates:

- in `.zamn` files;
- in `<template lang="zamn">` in Vue components, alongside the [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension.

```sh
code --install-extension zamn.vscode-zamn
```

Expressions in `{{ }}`, after `tag=` and in the values of directives (`:to`, `@click`, `#default`, `v-if`), quoted or in brackets, are highlighted as TypeScript, and the content of `script` … `/script` and `style` … `/style` as JavaScript and CSS.

Blocks in `{ }`, `|{ }` and `( )`, the content of `script` and `style`, and `/* */` comments fold, wherever they span lines.

The extension also registers the `zamn` language: `//` and `/* */` for toggling comments, and bracket pairs. Type checking comes from [vue-language-plugin-zamn](./typescript), linting from [eslint-plugin-vue-zamn](./eslint) and formatting from [prettier-plugin-zamn](./prettier), each through its usual extension.

## Comments

| | Scope | Looks like |
|---|---|---|
| `// note`, `/* note */` | `comment.block.silent.zamn` | a comment: it is left out of the HTML |
| `//! note`, `/*! note */` | `string.comment.buffered.block.zamn` | a string: it is in the HTML, as `<!-- note -->` |

The second scope is the one VS Code gives buffered comments in similar languages, so themes that style those style these. To pick the colours yourself:

```jsonc
// settings.json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "string.comment.buffered.block.zamn", "settings": { "foreground": "#c9a26d" } },
    { "scope": "comment.block.silent.zamn", "settings": { "fontStyle": "italic" } }
  ]
}
```

"Toggle Line Comment" writes `//`, and "Toggle Block Comment" `/* */`, in `.zamn` files and inside `<template lang="zamn">`, so commenting a line out never puts it into the page.

## Better Comments Next

[Better Comments Next](https://marketplace.visualstudio.com/items?itemName=edwinhuish.better-comments-next) decorates `// TODO`, `// !` and the like. It reads the comment markers from the language of the file:

- in a `.zamn` file, `//` and `/* */` comments are decorated. Better Comments reads a `!` straight after the marker as its "alert" tag, so `//! note` is shown as an alert;
- in a `.vue` file the language is `vue`, whose only marker is `<!-- -->`. The zamn extension sets a default for `better-comments.languages` that gives `vue` the line comment `//`, so it works there too. If you set `better-comments.languages` yourself, your value replaces that default, so include the entry:

  ```jsonc
  "better-comments.languages": [
    { "id": "vue", "comments": { "lineComment": "//", "blockComment": ["<!--", "-->"] } }
  ]
  ```

## Inspecting scopes

To see how a piece of a template is highlighted, run "Developer: Inspect Editor Tokens and Scopes".
