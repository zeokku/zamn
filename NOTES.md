# Notes

Facts and notes about the codebase and its tooling.

## `export { X as "module.exports" }`

[vue-eslint-parser-template-tokenizer-zamn](packages/vue-eslint-parser-template-tokenizer-zamn/index.js)
and [vue-language-plugin-zamn](packages/vue-language-plugin-zamn/index.js) end
with:

```js
export { ZamnTokenizer as "module.exports" };
```

- **Syntax.** Since ES2022 an export name may be any string literal, as long
  as it is well-formed Unicode (no lone surrogates), such as
  `x as "anything.with.dots"`, `"has spaces"` or `"🎉"`. Such names can only
  be imported with the string form and a rename
  (`import { "a.b" as y } from "./m.js"`) or read off the namespace
  (`ns["a.b"]`).
- **`"module.exports"` is not reserved by the language.** To the spec it is an
  ordinary export name. Node (22.12+, where `require(esm)` is on by default)
  and Bun give it meaning: when CommonJS code `require()`s an ES module that
  has an export with exactly this name, they return that export's value
  instead of the namespace object. No other name is special:
  `"module.exports.foo"` is just another export.
- **Why we need it.** Both packages are pure ESM but are loaded by CommonJS
  hosts with `require()`. vue-eslint-parser (`dist/index.cjs`) does
  `new (require(templateTokenizerOption))(...)`, so `require()` must return
  the class itself. Without the export, it returns the namespace object, and
  `new` throws "is not a constructor". Vue language tools load plugins with
  `require()` in the same way. This is also why the tokenizer package
  declares `"engines": { "node": ">=22.12.0" }`.

## Who reports which template error in ESLint

vue-eslint-parser copies the tokenizer's `errors` into `templateBody.errors`
as they are, extra properties included. `vue/no-parsing-error` (eslint-plugin-vue
10.12) reports an error unless it has a `code` that is not switched on in the
rule's options, and its options only know the HTML error codes:

```js
if (error.code && !options[error.code]) continue;
```

So an error with a code of our own is invisible to it. The tokenizer gives
zamn's diagnostics the code `zamn/<CODE>`, and
`vue-zamn/no-parsing-error` reports exactly those. Errors in expressions come
from vue-eslint-parser without a zamn code and stay with Vue's rule. Without a
code, both rules would report the same error.

## A Prettier option that is a number or `false`

Prettier checks plugin options by their `type`, and `"int"` rejects `false`.
An option may carry `exception: (value) => boolean`; a value it accepts skips
the check. `zamnMaxAttributesPerLine` uses it. Prettier's own options do the
same (`parser` accepts a function this way). The CLI still parses
`--zamn-max-attributes-per-line` as a number, so `false` can only be given in
a config file or through the API.

## Comment markers in VS Code, and Better Comments Next

- `comments.lineComment` in `language-configuration.json` is the only place a
  language says what its comment is. VS Code uses it for "Toggle Line
  Comment"; it takes one marker. zamn's is `//-`, as in VS Code's pug
  extension, so toggling never puts a comment into the HTML.
- Colours do not come from there but from the grammar's scopes. VS Code's pug
  grammar scopes `//-` as `comment.unbuffered.block.pug` and `//` as
  `string.comment.buffered.block.pug`, which is why a `//` comment has the
  colour of a string there. zamn does the same for `//`.
- Better Comments Next (3.4.6, read from its bundle) does not look at scopes.
  For the language id of the file it takes `comments.lineComment` (a string;
  the object form is ignored) from the extension that contributes the
  language, then the same of every language in the `embeddedLanguages` of the
  grammar contributed **for that language id**, in order. Entries of the
  `better-comments.languages` setting replace a language's `comments` and add
  to its embedded languages.
- It builds one regex from those markers, `(//-+|//+|...)`, in that order, and
  then wants whitespace and a tag (`TODO`, `!`, `?`) straight after the marker
  that matched. If `//` comes before `//-`, `//- TODO` matches `//` and fails
  on the `-`.
- In a `.vue` file the language is `vue`: its own marker is `<!-- -->`, and
  `//` comes from the embedded script languages. Our injection grammar has no
  `language`, so its `embeddedLanguages` are never seen, and embedded
  languages come after `//` anyway. The only way to get `//-` in front is to
  give `vue` itself the line comment `//-` through `better-comments.languages`,
  which the extension does with `configurationDefaults`.
