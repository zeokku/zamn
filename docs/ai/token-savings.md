# Token savings

zamn says the same thing as HTML with less text: no closing tags, no `class="..."`
around class names, no angle brackets. Less text is usually fewer tokens, but
tokenizers are trained on a lot of HTML and very little zamn, so it had to be
measured, in two ways:

- **[The size of a page](#the-size-of-a-page)**: the same pages in each form, counted
  by tokenizers. This is what reading, storing and sending a page costs.
- **[Writing it with Claude](#writing-it-with-claude)**: Claude writes each page
  from a description, as HTML and as zamn, and every token it spends is counted,
  thinking included. This is what generating a page costs.

## The size of a page

<!--@include: ../data/token-summary.md-->

Per page:

<!--@include: ../data/token-files.md-->

## Writing it with Claude

<!--@include: ../data/generation-summary.md-->

| Arm | What Claude gets |
|---|---|
| HTML | the page's description, and "write it in HTML" |
| zamn, with the skill | the same, "write it in zamn", with the [Claude Code skill](./skill) installed |
| zamn, skill asking for the tersest form | the same, with the skill's first step replaced by the one it used to have: no indentation, one-line blocks, no optional quotes |
| HTML, one chat / zamn, with the skill, one chat | all six pages in one conversation, one after the other |

What it shows:

- **The code is about a third smaller**, as the counts above say. Claude writes
  formatted HTML, and readable zamn is that much smaller than it.
- **Thinking takes back most of that.** In a fresh conversation, Claude thinks
  before writing zamn and often doesn't before writing HTML: it has written HTML
  millions of times, and zamn only from the rules in its context. For one page, the
  whole answer is a few percent smaller in zamn. In a chat, the gap is mostly on the
  first page, and over six pages the answers are about a sixth smaller.
- **Squeezing the code doesn't pay.** The tersest form is the smallest code but
  takes the most thinking, so the answer comes out no smaller than HTML, and it is
  the only arm that wrote invalid zamn: a block opened on one line and closed on a
  later one. The skill now asks for readable zamn.
- **The skill costs input once per conversation.** Loading it means reading its
  body and two extra model calls that read the conversation again, almost all of it
  from cache. In a chat it is paid on the first page only.

Each arm runs three times, and thinking varies a lot from one run to the next, so
read these as directions, not exact figures.

## Read once

An agent reads the rules or the skill before it writes any zamn, once per
conversation. The size of a page sets how many pages it takes to make that back:

<!--@include: ../data/token-overhead.md-->

The rules sit in every conversation of a project that has them, whether it writes
zamn or not. The skill costs its description everywhere and its body only where it
is used.

## Method

The corpus is six hand-written pages in `docs/token-corpus/`, chosen to look like
what agents are asked to build:

| Page | What |
|---|---|
| `landing` | a full marketing page: head, nav, hero, features, testimonial, footer |
| `signup-form` | a Vue form with validation messages, `v-model` and conditionals |
| `data-table` | a sortable, selectable table with toolbar and pagination |
| `dashboard-card` | stat cards and an activity list in Tailwind utility classes |
| `vue-component` | a todo app: `v-for`, events, slots, `TransitionGroup` |
| `article` | a blog post: prose, inline links and emphasis, a table, a figure |

### The size of a page

Each page is written once, in zamn. The other forms are made from it, so every form
holds the same page:

| Form | How |
|---|---|
| zamn, flat braces | Prettier with `tabWidth: 0`: braces around every block, no indentation |
| zamn, one-line blocks | flat braces, with every block that can close on its line written on one: `ul{li{a x}}` |
| zamn, one-line blocks, simple values unquoted | the same, with quotes left off as the [agent rules](./rules) allow: simple values (`href=/docs`) and bindings that are one `{ }` or `[ ]` group (`:class={ on: x }`) |
| zamn, 1-space indentation | Prettier with `zamnBlockStyle: "preserve"` and `tabWidth: 1`: no braces |
| zamn, formatted | Prettier with prettier-plugin-zamn's defaults |
| HTML, minified | `compile(source, { doctype: "html" })` |
| HTML, formatted | the minified HTML through Prettier's HTML formatter |

The terse zamn forms also set `zamnMaxAttributesPerLine: false` and an unlimited
`printWidth`, so attributes stay on one line. A test checks that all five zamn forms
compile to identical HTML.

Tokens are counted with:

- **OpenAI**: `o200k_base`, the encoding of GPT-4o, GPT-4.1, GPT-5 and the o-series,
  through [gpt-tokenizer](https://www.npmjs.com/package/gpt-tokenizer);
- **Claude**: the [token counting endpoint](https://platform.claude.com/docs/en/build-with-claude/token-counting)
  for the current Opus model. A message carries a few tokens of its own, so the
  count of a one-token message, less one, is subtracted from every count.

### Writing it with Claude

Each page has a plain-language description next to it (`name.task.txt`) that says
what the page holds without saying how to write it. The script runs Claude Code
(`claude -p`) with the current Opus model, in an empty directory: no `CLAUDE.md`,
no project settings, no MCP servers, and no tools but the one that loads skills.
The zamn arms have the skill installed there, and Claude loads it on its own. Claude
answers with the code and nothing else, in one go; it cannot compile its answer and
try again. The script then checks it: zamn must compile, HTML must parse.

The token counts are what Claude Code reports for the model: everything it read,
cached or not, and everything it wrote, with thinking as part of the output. Claude
Code's own system prompt is in every arm, so it adds the same to each. The size of
the code itself is counted with `o200k_base`, as above.

## What it means

- **Against formatted HTML**, which is what models write, a zamn page is about a
  third smaller, even formatted. Every agent and person that reads it later saves
  that.
- **Against minified HTML**, formatted zamn is about even. Only the terse forms are
  smaller, and they cost more to write than they save.
- **Generating zamn** costs about what generating HTML does for a single page, and
  less over a longer session, once the rules are paid for and the pages add up. The
  extra thinking may shrink as models see more zamn; today it is there.
- **One-line blocks** save under 1% over flat braces. A block folds only when
  every child but the last ends in `}` or `/`, because text runs to the closing
  `}`, and most blocks hold text. A newline costs about what a space does.
- **Quotes** cost about 3%. Most values HTML allows unquoted (paths, `type`,
  `name`, Vue expressions like `form.email`) save a token or two each; the
  sign-up form, full of them, drops by 10%.
- **Utility classes** (`dashboard-card`) save the least: a long `class="..."` string
  costs the same in both. Semantic markup with `.class` shorthand saves the most.

## Run it yourself

```sh
bun run build          # the WASM package
bun run docs:tokens    # the size of each page: docs/data/token-stats.json
bun run docs:generate  # Claude writing them: docs/data/generation-summary.md
```

`docs:tokens` always counts OpenAI tokens. The Claude counts need API credentials
the Anthropic SDK can find: `ANTHROPIC_API_KEY`, or a profile from `ant auth login`.
Without them the script keeps the Claude numbers of the previous run for every form
whose text hasn't changed. Add a page by dropping a `.zamn` file into
`docs/token-corpus/`, and a `.task.txt` describing it for `docs:generate`.

`docs:generate` uses whatever Claude Code is logged in with, a subscription
included, and stops starting new runs once the cost Claude Code estimates reaches
`--budget` dollars (10 by default; every arm three times comes to about 7). `--arms`, `--pages`,
`--repeats` and `--parallel` narrow or widen it; arms that aren't run keep their
previous results. The answers themselves go to `docs/data/generation-stats.json`,
which is not committed.
