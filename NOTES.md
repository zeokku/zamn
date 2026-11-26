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

## What eslint-plugin-vue expects from template text and comments

Seen in vue-eslint-parser 10.4 and eslint-plugin-vue 10.12:

- `VText.value` is decoded text (`&amp;` → `&`, `&rarr;` → `→`, an unknown `&foo;` kept as written), and `vue/no-bare-strings-in-template` compares against decoded characters. The tokenizer therefore decodes the character references zamn passes through (with `decodeHTMLStrict` from `entities`, which Vue's compiler also uses); `&copy` without `;` stays as written, as zamn escapes it.
- `vue/comment-directive` reads directives from every entry in `templateBody.comments`, whatever its type, so `// eslint-disable-next-line` and block `/* eslint-disable */` … `/* eslint-enable */` both work. Its "unused directive" report puts the rule name at `comment.range[0] + 4` (the length of `<!--`), so in zamn it lands 1 or 2 columns off.
- The `html-comment-*` rules skip comments whose text doesn't start with `<!--`, so zamn comments are safe from them although they have the type `HTMLComment`.
- vue-eslint-parser sorts template errors by position, so zamn's diagnostics and expression errors come out interleaved.
- Under Bun's isolated installs, a package's tests can import the package by its own name and get the built `dist/` through `exports`.

## A Prettier option that is a number or `false`

Prettier checks plugin options by their `type`, and `"int"` rejects `false`.
An option may carry `exception: (value) => boolean`; a value it accepts skips
the check. `zamnMaxAttributesPerLine` uses it. Prettier's own options do the
same (`parser` accepts a function this way). The CLI still parses
`--zamn-max-attributes-per-line` as a number, so `false` can only be given in
a config file or through the API.

## Comment markers in VS Code, and Better Comments Next

- `comments.lineComment` in `language-configuration.json` is the only place a language says what its comment is. VS Code uses it for "Toggle Line Comment"; it takes one marker. zamn's is `//`, which is left out of the HTML, so toggling never puts a comment into the page; `blockComment` is `/*` `*/`, also left out.
- Colours do not come from there but from the grammar's scopes. VS Code's pug grammar scopes `//-` as `comment.unbuffered.block.pug` and `//` as `string.comment.buffered.block.pug`, which is why a buffered comment has the colour of a string there. zamn does the same: `//` and `/* */` are `comment.line.double-slash.zamn` and `comment.block.zamn`, while `//!` and `/*! */`, which go into the HTML, are `string.comment.buffered.block.zamn`.
- Better Comments Next (3.4.6, read from its bundle) does not look at scopes. For the language id of the file it takes `comments.lineComment` (a string; the object form is ignored) from the extension that contributes the language, then the same of every language in the `embeddedLanguages` of the grammar contributed **for that language id**, in order. Entries of the `better-comments.languages` setting replace a language's `comments` and add to its embedded languages.
- It builds one regex from those markers and then wants a space or tab and a tag (`TODO`, `!`, `?`) straight after the marker: `(?<PRE>(?:^|[ \t])${mark}[ \t])(?<TAG>...)` (the same in 3.3.21 and 3.4.6). So `// TODO` and `/* TODO */` (the block form only at the start of a line) are decorated, but `//! text` is not read as its `!` tag, and `//! TODO` or `/*! note */` are not decorated at all.
- In a `.vue` file the language is `vue`: its own marker is `<!-- -->`, and `//` comes from the embedded script languages. Our injection grammar has no `language`, so its `embeddedLanguages` are never seen. The extension still gives `vue` the line comment `//` through `better-comments.languages` in `configurationDefaults`; since `//` already comes from the script languages, that entry is probably redundant now that zamn's marker is `//`.

## Vue's directive grammar and zamn's scopes

- The Vue extension (vue.volar 3.3.14) injects `vue-directives.json` into `text.html.vue` with `L:meta.tag -meta.attribute -meta.ng-binding -entity.name.tag.pug -attribute_value -source.tsx -source.js.jsx, L:meta.element -meta.attribute`. `L:` puts its patterns ahead of the embedded grammar's own, wherever the scope stack matches, `<template lang="zamn">` included.
- zamn's elements were `meta.tag.zamn`, so Vue took `.logo`, and `.svg` in `src="./logo.svg"` (zamn's `meta.attributes` is not `meta.attribute`), for its `.prop` shorthand. Elements are now `meta.statement.element.zamn`: no scope of zamn's may start with `meta.tag` or `meta.element`. The doctype keeps `meta.tag.sgml.doctype`, since its rule is one `match` for the whole line.
- Pug relies on the injection instead: only its tag name and `( )` are `meta.tag.other`, classes are `meta.selector.css`, values `attribute_value`, and the selector excludes pug's tag name and values by those names. Vue colours pug's `:x`, `@x`; zamn's grammar colours its directives itself.
- Before the rename, Vue scoped such a class name `entity.other.attribute-name.html.vue`, which most themes colour as an attribute, unlike the `.` before it. See below for the colour it has now.

## Classes and tags in one colour: the Vesper theme

- zamn's classes and ids are `entity.other.attribute-name.class.zamn` and `entity.other.attribute-name.id.zamn`, the scopes HTML, CSS and pug use. The colour is the theme's.
- Vesper (raunofreiberg.vesper 0.0.39) gives `entity.name.tag` and `entity.other.attribute-name.class` / `.id` the same `#FFC799`; only a plain `entity.other.attribute-name` is `#A0A0A0`. So in Vesper a zamn class has the colour of a tag, as a pug class does. It is not a grammar bug, and the grammar should not change its scopes for one theme.
- The docs (playground and code blocks) use Shiki's GitHub light and dark themes, which colour classes and tags differently.
- To tell them apart in Vesper, a user setting does it: `"editor.tokenColorCustomizations": { "[Vesper]": { "textMateRules": [{ "scope": "entity.other.attribute-name.class.zamn", "settings": { "foreground": "#A0A0A0" } }] } }`.

## Two copies of the extension: Windows and WSL (2026-11-26)

- With VS Code on Windows and the repository in WSL, `code-insiders` in a WSL terminal installs into `~/.vscode-server-insiders/extensions`. A copy installed on Windows (`C:\Users\Roman\.vscode-insiders\extensions`) stays there, and nothing in `install:local` touches it.
- The extension had no code then, so VS Code could load it on either side, and the Windows copy won: the editor ran 0.1.1's grammar (from 2026-11-12) while WSL had 0.1.2. "Developer: Inspect Editor Tokens and Scopes" showed it: `#{a(...) Vite}` was one plain token with `source.zamn` and `text.html.vue` and none of 0.1.2's scopes, which is what 0.1.1's grammar gives.
- This is what looked like "installing over an older version does not always stick" (the comment in `scripts/install-local.ts`, and the README until now): VS Code going back to 0.1.1 after a restart.
- The fix was by hand: uninstall the copy under "Local" in the Extensions view, run `install:local` again, reload. When the editor's scopes disagree with `bun test`, look for a second copy first.

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

`docs/scripts/chat-stats.ts` (`docs:chats`) runs a page's steps from `docs/token-corpus/chats.yaml` in one chat through `docs/scripts/claude-stream.ts`. Each run writes `docs/data/chats/<started>.json` and its tables in `<started>.md`, both gitignored; `--resume` continues the newest. Seen in Claude Code 2.1.319:

- `--setting-sources project` also skips the user's `effortLevel`, so runs without `--effort` use Claude Code's built-in default, not the level the user works at. The script uses that default; `--effort` sets a level, and the results record which.
- A PostToolUse hook that exits with 2 has its stderr passed to Claude after the tool result, as `PostToolUse:Write hook blocking error from command: "<command>": [<command>]: <stderr>`. Exit 0 with no output passes nothing. The command is quoted in every error, so the hook command is short: `zamn --hook`. With `--include-hook-events`, each run is a `system`/`hook_response` message with `exit_code`, `stdout` and `stderr`.
- The `system`/`init` message is repeated with every prompt in stream-json input mode.
- Thinking blocks come with empty text; `system`/`thinking_tokens` messages give a running estimate of their size. The estimate restarts with each model call, and its messages come before the call's first message; `thinking_duration_ms` is on the message with the thinking block. Taking the last estimate before each call, the calls of one prompt added up to 12,599 against an exact `thinkingTokens` of 12,655; in earlier runs the estimates ran above it. `chat-stats.ts` records them per call (`byCall`).
- An `assistant` message's `usage` has the call's input and cache figures but not its final output; one call's content blocks come as separate messages with the same id.
- A denied tool call comes back as a tool result with `is_error`, starting with "Permission to use"; asking for a tool that isn't enabled comes back as "No such tool available".
- `rate_limit_event` messages carry the account's use of each window (`unifiedWindows.five_hour.utilization`, `resetsAt`). Parallel conversations see slightly different figures. `resetsAt` is Unix seconds, and windows already reset are left out.
- A turn that hits the usage limit ends with a `result` with `is_error`; it doesn't hang. With `CLAUDE_CODE_RETRY_WATCHDOG` in the environment, Claude Code instead waits out the limit itself, sending a retry message about every 30 seconds.
- Parallel chats share the prompt cache. With `--exclude-dynamic-system-prompt-sections` and one warm-up prompt per arm, a chat's first call read about 4.3k tokens of Claude Code's prefix from the cache and wrote about 5k of its own (environment, skill listing, prompt), about the same in every arm. Without the warm-up, whichever chat starts first pays for writing the shared prefix.

## What the chat measurements showed (2026-11-24)

Measured with `bun run docs:chats --repeats 1`: `claude-opus-5-5` at Claude Code's default effort, Claude Code 2.1.319, six pages, a chat each of 7 steps (write the page, then 6 edits), one run of each of the four arms. Its tables were not kept; the figures here are from them. Since then `docs:chats` runs only `html` and `zamnHook` by default, once: the hook arm cost the least of the zamn arms (+11% over HTML, against +23% with the skill alone and +31% with Bash `zamn`). The arm names in this section and the next are those of the experiments; their run files are in `docs/data/chats` (gitignored). Since the end of 2026-11-26, `docs:chats` has only `html` and `zamn`, the setup the docs give: SKILL.md, the hook `zamn --hook`, and Bash allowed to run `zamn`.

**How input adds up.** Every model call sends the whole conversation so far as its input: system prompt, every message, every tool call and its result. So input grows with the chat, and each step pays again for all the ones before it (about 24k tokens on edit 1 of the hook arm, 28k on edit 6). Loading the skill is one extra model call, and from then on the skill's text sits in the conversation as a tool result, so every later call reads it again. Writing a page took HTML 2 calls (Write, then the reply) and the hook arm 3 (Skill, Write, reply), two of them with the skill in their input.

**Where the hook arm's extra input came from:** 1,222,541 input tokens against 934,945 for HTML, +287.6k (+31%):

| Where | Extra input | Why |
|---|--:|---|
| writing the page | +71k | the Skill call, and the two calls after it reading the skill |
| 33 edit steps with as many calls as HTML | +127k | about 1.9k tokens per call: the skill, read again by every call |
| 3 edit steps with more calls than HTML | +89k | `landing` edit 4 (+35k) and `DashboardCards.vue` edit 4 (+31k), where hook errors took a Read and another Edit; `landing` edit 5 (+23k), where Claude made three edits in separate calls |

So every token of SKILL.md costs about two tokens of input per step for the rest of the chat.

**Why the tables compare cost, not tokens.** Token types are priced very differently: for `claude-opus-5-5`, uncached input is $4 per million tokens, a cache write 2× that, a cache read 0.05× and output (thinking included) 5×. These prices give `total_cost_usd` of every step of the 2026-11-25 run exactly. About 95% of the input here was read from the cache, so +31% input came to only +11% cost. `total_cost_usd` is Claude Code's estimate at API list prices. Whether a subscription's usage limits weigh token types the same way is not published, so cost stands in for quota but does not measure it. The `rate_limit_event` utilization does measure quota, but it covers the whole account (other sessions included) and parallel chats, so it can't be put down to one chat.

**Thinking differences from one run are noise.** The hook arm thought 2,961 tokens, the Bash arm 2,379. All of the gap was in writing the page (2,167 against 1,398); on the edits the hook arm thought less (794 against 981). Within one arm, thinking while writing a page ranged from 0 to 629 tokens per page, and the `zamn` arm, with exactly the Bash arm's skill text, thought 4,423. This matches the 100–1,300 tokens single runs vary by on one page (see "What in the skill changes how much Claude thinks"). 600 thinking tokens cost about $0.015.

**One edit broke zamn in every zamn arm.** `landing` edit 4 ("Remove the Umbrella logo…") left the file invalid in all three zamn arms and in no HTML one: `UNCLOSED_BRACE`, four `INCONSISTENT_INDENTATION`, and `SELF_CLOSING_CONTENT` on the Initech `li: img(...)` line, which means an element ended up indented deeper than that line and nested into the `img`. The hook arm and the Bash arm caught it themselves; the skill-only arm needed the script's fix-up. The broken file was lost: the JSON kept only the file after each step, and sessions are not persisted. About a dozen likely leftovers (a blank line, a `}` too deep or too shallow, the line's indentation left on the next one) all compile, so it was none of the obvious slips. A step's `problems` now records every error Claude is shown (by the hook, a tool, or the script's check), each with zamn's codes and, for zamn errors, the file as it was then; `errors` stays what is still wrong once the step is over.

**What the skill doesn't say, checked with the compiler:**

- Inside braces, indentation still nests. The skill says only that the base indentation is free. A line indented less than its block's first line is `INCONSISTENT_INDENTATION`, and a line indented deeper silently becomes a child of the line above: `ul {` / `  li a` / `    li b` gives `<li>a<li>b</li></li>`, and under `li: img(...)` it goes into the `img` (`SELF_CLOSING_CONTENT`). These are the codes of the `landing` failure, and the skill says nothing about editing, which is 6 of the 7 steps.
- Class names need `class="..."` for `.` and brackets too, not only `/` and `:`: `.p-0.5` is `INVALID_CLASS_NAME`, `.w-[10px]` is `UNEXPECTED_TEXT`.
- `style={}` keys are copied as written: `style={fontSize: '2px'}` gives `fontSize:2px`; `{'font-size': '2px'}` gives CSS.
- `img/` is a weak example of self-closing, since `img` is void anyway; it matters for components (`Icon/`).

## What telling Claude the hook is its check changed (2026-11-26)

Measured with `bun run docs:chats --arms zamnHookTrust --repeats 2` against `html` and `zamnHook` of the 2026-11-25 run (two runs each, same Claude Code 2.1.319 and default effort). `zamnHookTrust` differs from `zamnHook` only in its check step: "…so no extra validation is needed: write the file in one go, without checking the syntax yourself first."

**Little, within noise.** Thinking while writing the page: 2,711 tokens over six pages against 3,120 (−13%, lower on 9 of 12 page-run pairs); on the edits 925 against 904. Cost $1.233 against $1.242 (+12% over HTML against +13%), cheaper on only 7 of 12 pairs. Validity, hook errors and fix-ups were the same.

**Claude thinks while composing the page, not checking it afterwards.** By call, all the thinking while writing a page was in the call that made the Write: none in the Skill call, none in the reply after it. So wording about checking can only reach thinking done before the Write. The Bash arm, with the skill-only arm's text, still thought far less (1,740), and that is not noise: lower than the skill-only arm (3,392) on 12 of 12 pairs.

**Thinking is the smaller lever.** Of the hook arm's +$0.146 over HTML (six pages), all its extra thinking comes to about $0.05; writing the skill to the cache comes to about $0.10. The per-call estimates added up to 8,036 against an exact 7,271 (+10%).

**The Bash tool alone doesn't lower thinking.** `htmlBash` (HTML with Bash, every call denied), two runs: thinking while writing the page 1,117 against HTML's 966, lower on only 3 of 12 pairs; cost +6%, nearly all of it the Bash tool's description read by every call (cache read +$0.032, write +$0.022). Claude tried Bash twice, a `python3` script and a `grep` pipe on SignupForm edit 6, both denied. So the Bash arm thinks less because it can run `zamn`, not because Bash is there, and about 6 points of its +33% are Bash's own cost.

**A shorter skill cost a little less.** `zamnHookLean` is `zamnHookTrust` with SKILL.md cut from 5,650 to 4,859 characters: no reason for step 1, no Prettier step, no converting HTML. Two runs: $1.212, +11% over HTML (against +12%), cheaper on 9 of 12 pairs; the cache write while writing the page fell by about 250 tokens per chat. Thinking while writing the page went back to 3,056 (lower than `zamnHookTrust` on 5 of 12 pairs), so the hint's −13% didn't hold, or the reason it dropped ("the tersest form took more thinking…") held thinking down; two runs can't tell which.

**Wording the hook as Claude's own check didn't lower thinking either.** `zamnHookCheck` keeps SKILL.md's check step as "Check the results of the `zamn --validate` hook, and fix every error…". One or two runs per page (9 chats; the run stopped with 7 chats left): thinking while writing the page 3,101 against `zamnHook`'s 3,120, lower in 7 of 18 run-against-run comparisons; cost +12% over HTML. Three wordings of the hook step (`zamnHook`, `zamnHookTrust`, `zamnHookCheck`) all thought about as much.

**The Bash arm's low thinking held up, and it is in the call that writes the page.** Re-run with per-call figures (8 chats): 2,000 while writing the page against 1,740 before, and lower than `zamnHookCheck` in 12 of 13 comparisons. Its call that made the Write thought about 240 tokens per chat against about 410 in `zamnHookCheck`, so Claude composes with less thinking when it can run `zamn` itself; it doesn't only move the thinking after the check. A few chats thought a little in the call after the Write, or before it, around an `ls` to see whether the file existed.

**Having `zamn` to run lowered thinking even when Claude didn't run it, but Bash cost more than that saved.** `zamnHookBash` is `zamnHook` with Bash allowed to run `zamn`, and its check step adds "You can run `zamn --validate` yourself as well, but after a write or an edit the hook has already checked the file." Two runs: Claude never ran `zamn`; its one Bash call was a `sed` edit, denied. Thinking while writing the page 2,440 against `zamnHook`'s 3,120 (−22%, lower in 20 of 24 run-against-run comparisons) and the Bash arm's 1,815; on the edits 803 against 904. Cost +16% over HTML against `zamnHook`'s +13%, cheaper in only 9 of 24: the thinking saved about $0.015 over six pages, and the Bash tool's description, read by every call, cost about $0.04 (cache read +$0.031, write +$0.010).

**The fallback line brought Claude's own checks back (2026-11-26).** The shipped skill is `zamnHookBash`'s check step plus "reports every error and warning" and "If the project has no hook, run `zamn --validate <file>` once, after the last change", with the step-1 reason, the Prettier step and converting HTML cut. Two runs of the `zamn` arm (that skill, `zamn --hook`, Bash `zamn`): $1.351, +23% over HTML and +16% over HTML with Bash, against `zamnHookBash`'s +16% and +9%. Claude ran `zamn` itself in 8 of 12 chats, 26 times: after writing the page in 8, and after every step in 3 (`article` r1, `SignupForm.vue` r1, `TodoApp.vue` r2), some with `| grep` to look at the HTML; `zamnHookBash` ran it in none. A valid file gets no output from the hook, so Claude can't tell whether there is one, and the fallback line makes checking the safe choice. Thinking while writing the page 2,623 (`zamnHookBash` 2,440), 102 model calls against 93, cache read +$0.027; no zamn error anywhere, as before.

**Without the fallback line, the shipped setup came in where `zamnHookBash` did; without the check step, Claude went looking for a check.** Two runs each (2026-11-26):

- `zamn`, the skill with the fallback line removed: $1.288, +17% over HTML, +10% over HTML with Bash (`zamnHookBash` +9%). Claude ran `zamn` 3 times, in 1 of 12 chats. The hook reported once, a `MISLEADING_INDENTATION` warning on `landing` when writing the page, and Claude fixed it in the same step; the first warning any run passed on, and the reason the hook reports warnings.
- `zamnNoCheck`, the same with step 2 left out, so the skill says nothing of a check: $1.492, +36% over HTML, +28% over HTML with Bash. Claude ran `zamn` 42 times, in 10 of 12 chats: before writing it looked for a way to check (`ls .claude/skills/zamn`, `which zamn`, `zamn --help`), then checked after most steps, often compiling and `grep`ing the HTML. Thinking while writing the page 3,104, 109 model calls.

So the check step is what keeps Claude from checking: told the hook has checked every write, it leaves it to the hook; told nothing, or told to check when there is no hook, it checks itself with Bash.

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

`tabWidth: 0` prints every brace block with no indentation, the flat form the token measurements use. It is safe for `|{ }` text and `script`/`style` raw content, whose common indentation the compiler strips. It still puts the continuation lines of a multi-line attribute value at column 0, which changes a quoted value such as a multi-line `:class="{…}"`. The token corpus avoids that; `docs/test/corpus.test.ts` would catch it if a page used one.

## Formatting zamn text

- The parser joins text statements (`| x`, `|{ }`, a bare `|`) with nothing between them, whether or not a line break separates them: a bare `|` is the only way to write a space between them. So a formatter may move them between lines, but must not add or drop a bare `|`. Text is trimmed at both ends; only a multi-line `|{ }` keeps line breaks.
- In `lex()` output, `Text` values have escapes resolved, and a token after an escape starts after the backslash. To copy text as written, slice the source between the surrounding tokens instead of joining token values.
- Prettier 3.10.1's `IntSupportOption` type has no `exception` field, although Prettier reads it (see "A Prettier option that is a number or `false`"). The plugin types the option as `IntSupportOption & { exception }`.

## zamn in the Vue language tools

Seen in `@vue/language-core` and `@vue/language-service` 3.3.14:

- vue-tsc 3.3 needs a TypeScript with the JS API: it reads `typescript/lib/tsc.js` and patches it. The `typescript` 7.0 package has none (its main export is `lib/version.cjs`, and `lib/tsc.js` only launches the native binary), so vue-language-plugin-zamn and the example keep TypeScript 6 while the other packages build with 7.
- What a template plugin passes to `onError` shows as an error in the editor (severity 1) and what it passes to `onWarn` as a warning (severity 2), per `vue-compiler-dom-errors.js`. vue-tsc prints neither. A template with any errors or warnings is not updated incrementally (`updateSFCTemplate`).
- Vue's directive comments (`@vue-generic`, `@vue-expect-error`, `@vue-skip`, `@vue-ignore`) are read from HTML comment nodes, so in zamn they must be written `//!` or `/*! */`.
- Vue's compiler errors share `loc` objects with AST nodes, so code that moves offsets back onto the zamn source must move each position object once.
- `getElementTagOffsets` uses end-tag offsets only when `lang === "html"`, so for zamn only the offset of a start tag's name matters.

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

## Building the packages with TypeScript 7

The JS packages are written in TypeScript (`src/*.ts`) and built with `tsc -p .` into `dist/`, with the shared settings in `tsconfig.base.json`. Seen with `typescript` 7.0.2 and Node 26.8:

- `tsc` emits JavaScript and declarations, as before 7.0. `${configDir}` works in `rootDir`, `outDir` and `include` of an extended config, so the base config can name each package's `src/` and `dist/`.
- `export { X as "module.exports" }` (see above) compiles as written, into both the `.js` and the `.d.ts`, with `module` and `moduleResolution` set to `nodenext`. Node's `require()` of the emitted ES module then returns `X` itself.
- Published packages must ship JavaScript: Node refuses to strip types from files under `node_modules`, so the hosts that load the plugins (ESLint, Prettier, Volar, VS Code) can't use `.ts` sources directly.

**The reordered skill, with "there is no need" (2026-11-26).** SKILL.md's Syntax section reordered as a template reads (tag, shorthands, attributes, children, text), a few clauses cut, and its check step ending "You can run `zamn --validate` yourself, but there is no need: after each write or edit the hook has already checked the file." Two runs of the `zamn` arm: $1.240, +13% over HTML and +6% over HTML with Bash, against the previous skill's $1.288; cheaper in 12 of 24 run-against-run comparisons, so a tie. Thinking while writing the page 2,130 against 2,544, lower in 18 of 24. Claude tried `zamn --validate` once, in 1 chat of 12 (`InvoiceTable.vue` r1, chained with a `sed`, so denied). Its two runs differed by 3.3%. The one failed step (`TodoApp.vue` r2, writing the page) is the content check: Claude linked only "Vue" in "Made with Vue", which compiled fine.

**Counting `zamn` runs (2026-11-26).** The run tables count Bash commands, and of them those with `zamn` as a command: at the start or after `;`, `&&`, `||`, `|` or `(`, so `cd .; zamn --validate x` counts and `which zamn` or `ls .claude/skills/zamn` doesn't. Both come from each step's `tools`, so old run files count the same way. The earlier counter matched `zamn` anywhere as a word, and overcounted: 4 runs in 2 chats for the shipped skill against 3 in 1, 52 in 11 chats for `zamnNoCheck` against 42 in 10. The figures above are the corrected ones. `Bash(zamn *)` allows only a command that is `zamn`; a chained one like `zamn --validate x; sed …` is denied, and still counts as a run Claude tried.

## Publishing (2026-11-26)

- `npm publish` and `npm pack` copy `workspace:` ranges into the published `package.json` as they are, which no one can install. `bun pm pack` writes versions instead: `workspace:*` as `1.0.3`, `workspace:~` as `~1.0.3`, `workspace:^` as `^1.0.3`, from the dependency's version in the repository. So `npm-publish.yml` packs with Bun and stages the tarball with `npm stage publish <dir>/<name>-<version>.tgz`; the packages use `workspace:~`, which keeps them on one minor (RELEASE.md).
- `bun pm pack` leaves out a `LICENSE` that is a symlink, and `cargo package` takes only files inside the crate (besides `readme`). So every published package and crate holds a copy of the root `LICENSE`; change them together.
- vsce asks "Do you want to continue? [y/N]" when `LICENSE` or `repository` is missing, and with no terminal (CI) that reads as no and aborts.
- The extension's `name` cannot be `zamn`: Bun fails the whole `bun install` with "Workspace name "zamn" already exists", since `packages/zamn` has it. The Marketplace id is `publisher.name`; the name is `zamn-vscode`, so the id is `zeokku.zamn-vscode`. The folder stays `packages/vscode-zamn`.
- npm's trusted publishing turns on provenance by itself only for a public repository; `--provenance` is passed anyway. For a package the registry doesn't have yet, npm (libnpmpublish) also wants `--access public`: without it, it asks the registry for the package's visibility, gets a 404, and stops with `EUSAGE` "Can't generate provenance for new or private package". vsce 4.1 publishes with `--oidc`, sending the GitHub token for the audience `marketplace.visualstudio.com` and the `publisher` of `package.json`.
- npm and crates.io can trust only a package that exists, so each first release needs a token once (see RELEASE.md). The Marketplace trusts a publisher, so the extension needs none.
- `scripts/release.ts` asks each registry for the exact version: npm `GET registry.npmjs.org/<name>/<version>` (200 or 404), crates.io the sparse index (`index.crates.io/za/mn/zamn`, one JSON line per version, 404 for a crate that doesn't exist), the Marketplace the `extensionquery` vsce makes for `vsce show` (filter type 7, the id; flag 1, versions). A version staged on npm and not approved is a 404.

## The link preview and the README header (2026-11-26)

- `bun run docs:og` (`docs/scripts/og-image.ts`) screenshots the homepage's hero from the docs' dev server with Playwright into `docs/public/og.jpg` (the link preview of every page, 1200x630) and `assets/readme-header.jpg` (the README's header, 1280x400, at 2x for high-density screens; feeds show the link preview at 500-600px, so it is 1x). Run it after changing the hero or the logo, and commit both images. It needs Playwright's Chromium once: `bunx playwright install chromium --only-shell`.
- The cards use the hero's own styles with everything but the heading and the logo hidden. The heading wraps by its font size and the width the logo leaves; the homepage's `text-wrap-style: balance` made "HTML without" / "the <angle brackets>" in the wide README header, so the cards wrap greedily.
- JPEG at quality 90: the background's soft gradients made a 2x PNG near 900 KB.
- VitePress caps the hero heading at 36rem; the cards lift it, or "HTML without the" broke before "the" at 72px.
- The README links the header by a relative path. crates.io shows the same README (`readme` in the workspace `Cargo.toml`) and rewrites relative images to `https://github.com/<repository>/raw/HEAD/<path>`, resolved from where the README sits in the repository (`crates_io_markdown`, `text_to_html`), so the image shows there once it is on the default branch.
