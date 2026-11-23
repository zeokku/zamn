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

## zamn in the docs' code blocks

The docs highlight ` ```zamn ` with the grammars of the VS Code extension,
registered in `markdown.languages` of `docs/.vitepress/config.mts`. Shiki
(4.6, through VitePress 2.0.0-alpha.21) needs three things there:

- the registration's `name` is the language id used after the fence, so it
  overrides the grammar's own `name` ("zamn" for `zamn.tmLanguage.json`);
- every language a grammar `include`s (`source.ts`, `source.js`, `source.css`)
  must be listed in its `embeddedLangs`, **and** loaded before it: list
  `"typescript"`, `"javascript"`, `"css"` (and `"vue"` for the injection) as
  plain strings ahead of the grammars in `markdown.languages`, or Shiki fails
  with "Missing languages ... required by zamn";
- the Vue injection grammar needs `injectTo: ["text.html.vue"]`, which in VS
  Code comes from `package.json`, not from the grammar file.

Inline code with `{{ }}` is compiled by Vue as an interpolation and fails the
build, so the config adds `v-pre` to every inline `<code>`. Fenced blocks are
`v-pre` already. Text that VitePress renders as HTML (the `details` of home
page features) needs `&lt;` for a literal `<`, or hydration mismatches.

## Counting Claude tokens

`count_tokens` counts a whole message, which carries a few tokens of its own.
`docs/scripts/token-stats.ts` subtracts that overhead, taken as the count of a
message holding just `"a"` minus one. All forms of a page share the overhead,
so the percentages don't depend on it; the absolute numbers are off by at most
a token or so.

`count_tokens` is free, but the API refuses it ("credit balance is too low")
on an account with no credits.

## Measuring generation with `claude -p`

`docs/scripts/generation-stats.ts` drives Claude Code rather than the API, so it
works on a subscription. What it relies on:

- `--bare` would isolate best, but it reads only `ANTHROPIC_API_KEY`, never the
  OAuth login. The script runs in an empty temp directory with
  `--setting-sources project --strict-mcp-config --tools Skill` instead. Built-in
  and user skills are still listed in the system prompt, equally in every arm.
- `--output-format stream-json --verbose` gives one `result` per turn, whose
  `modelUsage[model]` has `thinkingTokens` (part of `outputTokens`). With
  `--input-format stream-json`, the usage and `total_cost_usd` in each `result`
  are totals so far, so a turn is the difference from the previous one.
- Prompts written to stdin while Claude is busy are merged into one turn: write
  the next one only after the previous `result` arrives.
- `modelUsage` also lists a small Haiku call Claude Code makes on its own; the
  script counts only the requested model.

## Measuring chats with `claude -p`

`docs/scripts/chat-stats.ts` (`docs:chats`) runs a page's steps from `docs/token-corpus/chats.yaml` in one chat through `docs/scripts/claude-stream.ts`. Seen in Claude Code 2.1.319:

- `--setting-sources project` also skips the user's `effortLevel`, so runs without `--effort` use Claude Code's built-in default, not the level the user works at. The script uses that default; `--effort` sets a level, and the results record which.
- A PostToolUse hook that exits with 2 has its stderr passed to Claude after the tool result, as `PostToolUse:Write hook blocking error from command: "<command>": [<command>]: <stderr>`. Exit 0 with no output passes nothing. The command is quoted in every error, so the hook is a short `zamn-hook` on `PATH`. With `--include-hook-events`, each run is a `system`/`hook_response` message with `exit_code`, `stdout` and `stderr`.
- The `system`/`init` message is repeated with every prompt in stream-json input mode.
- Thinking blocks come with empty text; `system`/`thinking_tokens` messages give a running estimate of their size, which ran above the final `thinkingTokens`.
- An `assistant` message's `usage` has the call's input and cache figures but not its final output; one call's content blocks come as separate messages with the same id.
- A denied tool call comes back as a tool result with `is_error`, starting with "Permission to use"; asking for a tool that isn't enabled comes back as "No such tool available".
- `rate_limit_event` messages carry the account's use of each window (`unifiedWindows.five_hour.utilization`, `resetsAt`). Parallel conversations see slightly different figures.
- Parallel chats share the prompt cache. With `--exclude-dynamic-system-prompt-sections` and one warm-up prompt per arm, a chat's first call read about 4.3k tokens of Claude Code's prefix from the cache and wrote about 5k of its own (environment, skill listing, prompt), about the same in every arm. Without the warm-up, whichever chat starts first pays for writing the shared prefix.

## What the AI measurements showed (2026-11-22)

Measured with `claude-opus-5-5` through Claude Code 2.1.319, six corpus pages,
three runs of each arm. The tables are in `docs/data/`; the reasoning behind
the current agent advice is here.

- **A page is smaller, generating it barely is.** Generated zamn code is about
  a third smaller than the formatted HTML Claude writes. But with one page per
  conversation, Claude thinks about 270 tokens more per page before writing
  zamn (about 480 with the terse skill), and often not at all before writing
  HTML. So the whole answer is only about 5% smaller for one page, and about
  16% smaller over a chat of six pages (an earlier run gave 22%; the noise is
  several percent).
- **In a chat, the extra thinking is mostly on the first page:** about +530
  tokens there, then about +45 per page on pages 2–6, where Claude thinks
  before writing HTML too. With the old terse skill, it stayed higher on later
  pages.
- **Terse advice doesn't pay.** The skill used to ask for the tersest form (no
  indentation, one-line blocks, no optional quotes). That gave the smallest
  code but the most thinking, so the answer was no smaller than HTML, and it
  was the only arm that wrote invalid zamn: a block opened inline and closed on
  a later line (`select{option a` / `option b}`, `UNCLOSED_BRACE`). The skill
  and `agents/zamn.md` now ask for readable zamn, and the syntax bullet says a
  one-line block must close on its line. Asking for readable zamn produced no
  invalid answers. The old step is kept as the `zamnTerse` arm.
- **The skill costs input once per conversation:** about 9.7k tokens on the
  first page, mostly cache reads. Loading it means reading its body and two
  extra model calls that reread the context. Rules pasted into `CLAUDE.md` would
  skip the extra calls but are read in every conversation, zamn or not.
- **Break-even on size alone:** the rules (~1.25k tokens) or the skill (~1.4k)
  are made back after about 6–7 pages of formatted zamn compared with formatted
  HTML. Compared with minified HTML, formatted zamn is about even, so they never
  are.
- **The tokenizer counts are an upper bound.** The static counts (`docs:tokens`)
  measure only the size of the text. They are right for reading and storing a
  page, but overstate what generating it saves. Claim generation savings only
  from `docs:generate`.

## prettier-plugin-zamn with `tabWidth: 0`

`tabWidth: 0` prints every brace block with no indentation, the flat form the
token measurements use. It breaks text blocks (`p.`, `script.`), whose lines
must stay indented deeper than their tag, and puts multi-line attribute values
at column 0. The token corpus avoids both; `docs/test/corpus.test.ts` would
catch it if a page used them.

## `backdrop-filter` and Lightning CSS

Vite 8 minifies CSS with Lightning CSS and gives it targets only from
`build.cssTarget` (esbuild's format), not from `css.lightningcss.targets`.
VitePress leaves it unset, and without targets VitePress's
`backdrop-filter: var(--vp-nav-backdrop-filter)` came out of the build as
`-webkit-backdrop-filter` alone, which Chromium ignores. So `docs/.vitepress/config.mts`
turns `browserslist("defaults")` into a `cssTarget`. Related:
https://github.com/parcel-bundler/lightningcss/issues/826.

Separately, Lightning CSS 1.33 merges `backdrop-filter: var(--x)` and
`-webkit-backdrop-filter: var(--x)` in one rule into whichever comes last, with
or without targets. The docs theme therefore writes only the unprefixed
property; every browser in `defaults` supports it.

## What in the skill changes how much Claude thinks

Measured on 2026-11-22 with `docs:generate` (claude-opus-5-5, Claude Code 2.1.319, six pages, three runs each), as thinking tokens summed over the six pages, mean and median. HTML thinks 639 (median 600); the current skill 2,251 (2,198).

- **Wording does not.** The skill rewritten to explain zamn as CSS selectors nested like SCSS, with the same rules: 2,505 (2,280). The same, also saying to quote every attribute value: 2,412 (1,965), with one invalid page (`INVALID_CLASS_NAME`).
- **A shorter skill thinks more.** Cut to 1.4 KB (an example and four lines of rules, pug named as the base): 2,928 (2,808), lower on no page but the article.
- **Worked examples think less.** The current skill plus six zamn examples with the HTML each compiles to (text mixed with elements, a `v-for` list, a form, utility classes, a slot, a full page): 1,628 (1,606), lower on five pages of six, all valid. Output as a whole drops to 8,722, against 9,240 for the current skill and 9,749 for HTML; input read grows from 102k to 110k, almost all of it cached. The examples were close to the corpus (a todo list, as in `vue-component`; a form, as in `signup-form`), so this may overstate the saving on other pages.

Single runs vary from about 100 to 1,300 thinking tokens on the same page, so only differences much larger than a few hundred tokens mean anything.

The skill stays as it is for now: the examples add input to every conversation that loads the skill, and the saving is not shown on pages unlike them.

## Claude Code writes temporary files to its scratchpad

Claude Code's system prompt tells Claude to put temporary files in a session scratchpad directory. In `docs:generate`, where Bash may run `zamn` and nothing else, Claude often checked its answer with `cat > <scratchpad>/page.zamn <<'EOF'` followed by `zamn`, which was denied, until the skill said to pipe the template into `zamn` instead of writing a temporary file. Even then, 3 runs in 18 still tried the file first. Checking an answer that is not in a file means writing the code twice, so it roughly doubles what Claude writes for a page.
