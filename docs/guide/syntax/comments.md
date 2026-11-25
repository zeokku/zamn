# Comments

`//` is a comment for the template's readers: it is left out of the HTML. `//!` is an HTML comment: it is written to the output. Both run to the end of their line.

```zamn
// Only people reading the template see this.
//! Everyone reading the page source sees this.
p Hello
```

```html format
<!-- Everyone reading the page source sees this.-->
<p>Hello</p>
```

Everything after the marker is copied as written, including the space after it.

## Block comments

`/* ... */` is left out of the HTML, and `/*! ... */` is written as an HTML comment. A block comment can span lines and ends at the first `*/`; block comments don't nest. Its content is not parsed, so it can hold anything, including lines that would be errors:

```zamn
/*
  Not ready yet:
  a(href=base + "/docs") Docs
*/
/*! Built by zamn */
p Done
```

```html format
<!-- Built by zamn -->
<p>Done</p>
```

A block comment goes wherever a statement can start: on a line of its own, after a `{`, or after a child that ends with `}`:

```zamn
div { /* the title */ h2 { | Title } /* the body */ p Body }
```

```html format
<div>
  <h2>Title</h2>
  <p>Body</p>
</div>
```

An unclosed block comment is an error (`UNCLOSED_COMMENT`).

## In text

Inside text, `//` and `/*` are just text, so links and paths need nothing special:

```zamn
a(href="https://zamn.dev") https://zamn.dev
p Globs like src/*.ts stay as written.
```

```html format
<a href="https://zamn.dev">https://zamn.dev</a>
<p>Globs like src/*.ts stay as written.</p>
```

Comments are not escaped: what you write after `//!` or inside `/*! */` reaches the HTML as it is.

## In editors and linters

"Toggle Line Comment" in [VS Code](../../ecosystem/vscode) writes `//`, so commenting out a line never puts it into the page. ESLint directives work as `//` comments in a Vue template:

```zamn
// eslint-disable-next-line vue/no-v-html
div(v-html="content")
```
