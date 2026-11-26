# Writing zamn

zamn compiles to HTML. A template is static markup.

## Syntax

- `tag` is an element; its children go inside `{ }`, the only way to nest. `.cls` (class shorthand), `#id` (id shorthand) and `(attrs)` follow the tag; without a tag the element is implicitly `div`: `.card`.
- A `{` straight after the tag head opens a block. It closes at its matching `}`, on the same line or a later one; `p {}` is empty. After the `}` of a child's block, another child may follow on the same line: `ul { li { a x } li { b y } }`.
- Indentation means nothing: indent for people, but a line indented under another without braces is its sibling (warning `MISLEADING_INDENTATION`). Output has no whitespace between tags unless written.
- `tag: child` nests one child on the same line: `li: a(href="/") Home`.
- Void tags (`img`, `br`, `input`, `meta`, `link`, `hr`) need nothing, and no `/`.
- Class shorthands allow utility names: `.w-1/2.md:flex.hover:bg-sky-700.px-2.5.[&>*]:p-2`.
- Attributes: `a(href="/" target="_blank")`. A value is a string, as in HTML. `style={color: red, fontSize: 12px}` becomes CSS (`font-size`). `disabled` or `x=true` is a boolean attribute; `x=false` drops it. `!=` writes the value unescaped. Vue names work as written: `:to`, `@click.prevent`, `#default="{ row }"`, `v-model.trim`.
- Quoting: always quote a value that contains whitespace, a `,`, any of ``" ' ` = < >``, or a bracket: `title="Page title"`, `@click="save()"`, `v-for="(item, i) in items"`. Without quotes such a value ends early or is an error, sometimes silently (`title=Page heading` gives a `heading` attribute). Simple values may go without quotes: `href=/docs`, `type=checkbox`, `:key=item.id`. One exception: a binding (`:x`, `@x`, `#x`, `.x`, `v-*`) whose whole value is one `{ }` or `[ ]` group may stay unquoted, spaces and commas included: `:class={ active: on, big: large }`, `v-bind=[a, b]`.
- Text: `p Hello` (after the tag on the same line), `| text` (a statement of text), `|` alone (one space). `|` and `|{ }` are statements (placed like any other child): after a tag they need a `:` (`p: | text`), and without it a `|` is plain text. Text is trimmed at both ends, and consecutive `|` lines join with nothing between them, so put a bare `|` between lines that need a space. A statement of text must start with `|`, also when it starts with `{{` or `#{`. `|{ ... }` holds text over several lines (`pre: |{ ... }`), line breaks kept: blank first and last lines are dropped and the common indentation is stripped.
- `tag= expr` and `= expr` write `{{ expr }}`.
- Text and `= expr` run to the end of the line or to the `}` that closes their block, so after text the next child goes on a new line: `p { b bold i italic }` is one `b` with the text `bold i italic`.
- Text is HTML-escaped: `p a < b` shows `a < b`, and tags written in text show as text. Character references pass through: `&nbsp;`, `&rarr;`. For HTML from data, use `div(v-html="html")`.
- Braces in text: `{{ expr }}` passes through as written. Every other brace is `\{` or `\}`: a bare `{` is an error, and a bare `}` closes the block. `p {b}` is a `p` holding a `b`; `p \{b\}` is the text `{b}`.
- Inline element inside text: `p Read #{a(href="/docs") the docs} first.` One element per `#{ }`; they nest.
- `script` and `style` take raw content on the lines below, ended by a line `/script` or `/style`; it is not parsed or escaped. `script(src="/a.js")` has no content and no `/script`.
- Logic goes in your framework's directives: `p(v-if="cond")`, `li(v-for="x in xs" :key="x.id")`. Compute values in the component and write them out: `p= total`. Share markup as components: `app-header`.
- `// note` is a comment left out of the output; `//! note` is an HTML comment. `/* ... */` and `/*! ... */` are the same, and may span lines.
- `doctype html` at the top of a full page.

## Writing it

Write readable zamn, laid out the way a person would: children in indented `{ }` blocks, one child per line, attributes on the tag's line.

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
