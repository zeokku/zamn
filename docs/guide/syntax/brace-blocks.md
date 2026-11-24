# Brace blocks

An element holds its children in `{ }`. It is the only way to nest: a block visibly starts and ends, so long templates stay easy to follow, and indentation is free to show the structure the way you like.

```zamn
div {
  .another-div {
    button(@click="go") Text
    p= message
  }
}
```

```html
<div><div class="another-div"><button @click="go">Text</button><p>{{ message }}</p></div></div>
```

## The rules

- **A `{` straight after the tag head** opens a block: after the tag and its classes, ids and attributes, as in `section.main(role="main") {`. The space before it is optional.
- **The block closes at its matching `}`**, on the same line or on any line after it.
- **`p {}`** (or `p { }`) is an empty block: `<p></p>`.
- **Each child is a statement**, and a statement ends at:
  - the end of its line;
  - a `}`, which closes the block it is in;
  - the `}` that ends its own block (or its [`|{ }` text](./text#text-blocks)), after which another statement may follow on the same line.

So a block can open and close on one line, and hold several children there:

```zamn
ul.nav { li { a(href="/") Home } li { a(href="/about") About } }
.card { .card-body { h2 Title }}
```

```html
<ul class="nav"><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul><div class="card"><div class="card-body"><h2>Title</h2></div></div>
```

`}}` closes two blocks, as in `.card` above, unless it ends a [`{{ }}` mustache](./interpolation#inside-text) in text.

## Text ends its line

Text and `= expr` run to the end of the line, or to the `}` that closes the block they are in. The only way to start another child after text is a new line:

```zamn
p { b bold i italic }
p {
  b bold
  i italic
}
```

```html
<p><b>bold i italic</b></p><p><b>bold</b><i>italic</i></p>
```

In `= expr`, braces and quoted strings are counted, so an object literal passes through:

```zamn
p {
  span= ok ? { a: 1 }.a : 0
}
```

```html
<p><span>{{ ok ? { a: 1 }.a : 0 }}</span></p>
```

## Indentation

Indentation means nothing to zamn: the braces alone decide what holds what. Indent with spaces or tabs, by any amount, or not at all:

```zamn
section {
h2 Title
p {
| Text
}
}
```

```html
<section><h2>Title</h2><p>Text</p></section>
```

[Prettier](../../ecosystem/prettier) indents every block for you.

Since indentation is not structure, a line indented as if it were a child is a sibling. zamn warns about it (`MISLEADING_INDENTATION`) when a statement is indented deeper than the statement before it in the same block, and that statement left no block open:

```zamn warning=MISLEADING_INDENTATION
p Some text
  b bold
```

```html
<p>Some text</p><b>bold</b>
```

The `b` is not inside the `p`: put it in braces (`p { | Some text` and `b bold` on the lines below), or indent it as a sibling. It is a warning, not an error: the template still compiles. The first line of a block, continued attribute lists, [`|{ }` text](./text#text-blocks), [script and style content](./script-style) and comments can be indented as you like.

## Braces in text

Only a `{` straight after the tag head opens a block. In text, `{{ ... }}` is a [mustache](./interpolation#inside-text), and every other brace is written `\{` or `\}`:

```zamn
p some \{ text \}
| \{ more text \}
p {{ message }}
```

```html
<p>some { text }</p>{ more text }<p>{{ message }}</p>
```

`{{` never opens a block, so `p {{ message }}` is text, as Vue expects. `p {b}` is a `p` holding a `<b>` element; `p \{b\}` is the text `{b}`.

A `{` left bare in text is an error (`UNESCAPED_BRACE`), and a bare `}` closes the block, so a brace in text never goes unnoticed.

## Errors

- A `{` that is never closed: `UNCLOSED_BRACE`.
- A `}` with no `{` to close: `UNMATCHED_BRACE`.
- A bare `{` in text: `UNESCAPED_BRACE`.

See [Diagnostics](../../reference/diagnostics#blocks).
