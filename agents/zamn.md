# Writing zamn

zamn compiles to HTML. A template is static: no JavaScript, no control flow, no includes. Output has no whitespace between tags unless written.

## Syntax

- `tag` is an element; its children go inside `{ }`, the only way to nest. `.cls`, `#id` and `(attrs)` follow the tag; without a tag the element is a `div`: `.card`.
- A `{` straight after the tag head opens a block. It closes at its matching `}`, on the same line or a later one; `}}` closes two. `p {}` is empty. After the `}` of a child's block, another child may follow on the same line: `ul { li { a x } li { b y } }`.
- Indentation means nothing: indent for people, but a line indented under another without braces is its sibling (warning `MISLEADING_INDENTATION`).
- Text and `= expr` run to the end of the line or to the `}` that closes their block, so after text the next child goes on a new line: `p { b bold i italic }` is one `b` with the text `bold i italic`.
- Text: `p Hello` (after the tag), `| text` (a statement of text), `|` alone (one space, to join two lines). `|` and `|{ }` are statements: after a tag they need a `:` (`p: | text`), and without it a `|` is plain text. Text is trimmed at both ends, and consecutive `|` lines join with nothing between them, so put a bare `|` between lines that need a space. A statement of text must start with `|`, also when it starts with `{{` or `#{`. `pre: |{ ... }` holds text over several lines, line breaks kept: blank first and last lines are dropped and the common indentation is stripped.
- Text is HTML-escaped: `p a < b` shows `a < b`, and tags written in text show as text. Character references pass through: `&nbsp;`, `&rarr;`.
- Braces in text: `{{ expr }}` passes through as written. Every other brace is `\{` or `\}`: a bare `{` is an error, and a bare `}` closes the block. `p {b}` is a `p` holding a `b`; `p \{b\}` is the text `{b}`.
- Inline element inside text: `p Read #{a(href="/docs") the docs} first.` One element per `#{ }`; they nest.
- `script` and `style` take raw content on the lines below, ended by a line `/script` or `/style`; it is not parsed or escaped. `script(src="/a.js")` has no content and no `/script`.
- `tag: child` nests one child on the same line: `li: a(href="/") Home`.
- `tag= expr` and `= expr` write `{{ expr }}`.
- Attributes: `a(href="/" target="_blank")`. `style={color: red, fontSize: 12px}` becomes CSS (`font-size`). `disabled` or `x=true` is a boolean attribute; `x=false` drops it. `!=` writes the value unescaped. Vue names work as written: `:to`, `@click.prevent`, `#default="{ row }"`, `v-model.trim`.
- Classes may be utility names: `.w-1/2.md:flex.hover:bg-sky-700.px-2.5.[&>*]:p-2`.
- Quoting: always quote a value that contains whitespace, a `,`, any of `` " ' ` = < > ``, or a bracket: `class="btn primary"`, `@click="save()"`, `v-for="(item, i) in items"`. Without quotes such a value ends early or is an error, sometimes silently (`class=btn primary` gives a `primary` attribute). Simple values may go without quotes: `href=/docs`, `type=checkbox`, `:key=item.id`. One exception: a binding (`:x`, `@x`, `#x`, `.x`, `v-*`) whose whole value is one `{ }` or `[ ]` group may stay unquoted, spaces and commas included: `:class={ active: on, big: large }`, `v-bind=[a, b]`.
- Void tags (`img`, `br`, `input`, `meta`, `link`, `hr`) need nothing, and no `/`.
- `// note` is a comment left out of the output; `//! note` is an HTML comment. `/* ... */` and `/*! ... */` are the same, and may span lines.
- `doctype html` at the top of a full page.

## Not available, and what to write instead

| Don't | Do |
|---|---|
| `if cond` / `each x in xs` / `case` | `p(v-if="cond")`, `li(v-for="x in xs" :key="x.id")` |
| `- const x = ...` | compute it in the component, then `p= x` |
| `href=base + "/x"` (JS in a value) | `:href="base + '/x'"` |
| `include`, `extends`, `block`, `mixin`, `+mixin` | a component: `AppHeader` |
| `p!= html`, HTML from data | `div(v-html="html")` |
| `<div>...</div>` on a line, `<b>` in text | elements: `div ...`, `p Some #{b bold} text` |
| `#[b bold]` | `#{b bold}` |
| `p.`, `script.`, `style.` with indented text | text: the multi-line text form above; `script` and `style`: their lines, then `/script` or `/style` |
| `img/` | `img` |
| children nested by indentation alone | put them inside `{ }` |
| `:markdown` filters | render the content before it reaches the template |
| `p text {` to open a block after text | put the text inside: `p {` then `\| text` |
| `p \| text`, `pre \|{ ... }` | `p text` or `p: \| text`, `pre: \|{ ... }` |

## Writing it

Write readable zamn, laid out the way a person would: children in indented `{ }` blocks, one child per line, attributes on the tag's line. Don't squeeze it: measured with Claude, the tersest form (no indentation, blocks on one line, no optional quotes) took more thinking than it saved, and was invalid more often. Then run `prettier --write` (prettier-plugin-zamn) on the file, if the project uses it.

```zamn
ul.nav {
  li: a(href="/") Home
  li {
    a(href="/docs" :class="{ active: onDocs }") Docs
    span.badge= count
  }
}
```

## Checking your work

Check with `zamn --validate`, and fix every error (each has a code and a hint), and every warning too: a `MISLEADING_INDENTATION` warning means a line is not where its indentation says. It prints nothing when everything is valid, fails only on errors, takes several files, and checks the `<template lang="zamn">` of a `.vue` file in place. Check once, after the last change, not after every edit:

```sh
zamn --validate src/pages/home.zamn src/components/TodoList.vue
```

To check zamn that is not in a file of its own (an answer, a snippet), pipe it in instead of writing a temporary file:

```sh
zamn --validate <<'EOF'
ul {
  li: a(href="/") Home
}
EOF
```

In a Vue project, `vue-tsc` and `eslint`, if the project has them, also check the expressions in the template.

## Converting HTML

Drop the closing tags and put children in `{ }`, turn `class="a b"` into `.a.b` (utility names such as `md:flex` included) and `id="x"` into `#x`, turn whitespace that matters between inline elements into `|` lines, and write the content of `<script>` and `<style>` as `script` … `/script`. Character references such as `&nbsp;` stay as they are, but text is escaped: tags inside text become `#{b ...}`, and braces in text become `\{` and `\}`.
