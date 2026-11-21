# Token savings

zamn says the same thing as HTML with less text: no closing tags, no `class="..."`
around class names, no angle brackets. Less text is usually fewer tokens, but
tokenizers are trained on a lot of HTML and very little zamn, so it had to be
measured.

## Results

<!--@include: ../data/token-summary.md-->

Per page:

<!--@include: ../data/token-files.md-->

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

Each page is written once, in zamn. The other forms are made from it, so every form
holds the same page:

| Form | How |
|---|---|
| zamn, flat braces | Prettier with `tabWidth: 0`: braces around every block, no indentation |
| zamn, one-line blocks | flat braces, with every block that can close on its line written on one: `ul{li{a x}}` |
| zamn, one-line blocks, no optional quotes | the same, with the quotes left off every value that means the same without them: `href=/docs`, `:class={ on: x }` |
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

## What it means

- **Against formatted HTML**, which is what models usually write, every zamn form
  is much smaller, even after formatting.
- **Against minified HTML**, formatted zamn is about even. The savings come from
  writing zamn tersely, so generate the terse form and format it afterwards.
- **One-line blocks** save under 1% over flat braces. A block folds only when
  every child but the last ends in `}` or `/`, because text runs to the closing
  `}`, and most blocks hold text. A newline costs about what a space does.
- **Quotes** cost about 3%. Most values HTML allows unquoted (paths, `type`,
  `name`, Vue expressions like `form.email`) save a token or two each; the
  sign-up form, full of them, drops by 10%.
- **Utility classes** (`dashboard-card`) save the least: a long `class="..."` string
  costs the same in both. Semantic markup with `.class` shorthand saves the most.
- Tokens are not the only cost. A model writes HTML it has seen millions of times;
  zamn it learns from the [rules](./rules) in its context, which cost tokens once
  per conversation.

## Run it yourself

```sh
bun run build          # the WASM package
bun run docs:tokens    # writes docs/data/token-stats.json
```

The OpenAI counts always run. The Claude counts need credentials the Anthropic SDK
can find: `ANTHROPIC_API_KEY`, or a profile from `ant auth login`. Without them the
script keeps the Claude numbers of the previous run for every form whose text hasn't
changed. Add a page by dropping a `.zamn` file into `docs/token-corpus/`.
