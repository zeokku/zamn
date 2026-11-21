# Brace blocks

An element holds its children in `{ }`. This is the recommended style, and the one
[Prettier](../../ecosystem/prettier) writes: a block visibly starts and ends, so long
templates stay easy to follow.

```zamn
div
  .another-div {
    button(@click="go") Text
    p= message
  }
```

```html
<div><div class="another-div"><button @click="go">Text</button><p>{{ message }}</p></div></div>
```

Braces and indentation alone (no braces) mean the same thing and can be mixed, as
above: the `div` holds its child by indentation.

## The rules

- **`{` at the end of the tag's line** opens a block over the lines below, after
  the tag's classes, ids and attributes: `section.main(role="main") {`.
- **`}` sits on a line of its own.**
- **`{ }` or `{}` on the tag's line** is an empty block: `p { }` is `<p></p>`.
- **Inside the braces, the first line sets the base indentation**, and indentation
  nests from there as usual. The base can be anything, even no indentation at all:

```zamn
ul {
li One
li
  b Two
}
```

```html
<ul><li>One</li><li><b>Two</b></li></ul>
```

- **After a `}`**, the next line can't be indented deeper: children of a braced
  element go inside its braces (`INVALID_INDENTATION`).
- An unclosed `{` (`UNCLOSED_BRACE`) or a `}` with no `{` (`UNMATCHED_BRACE`) is an
  error.

## Blocks on one line

A block can open and close on the same line. The space before the `{` is optional:

```zamn
.card{.card-body{h2 Title}}
ul.nav {li{a(href="/") Home} li{a(href="/about") About}}
```

```html
<div class="card"><div class="card-body"><h2>Title</h2></div></div><ul class="nav"><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul>
```

- **Each child is a statement**, as on a line of its own: `b{| bold}` is a `b`
  with the text `bold`, but `b{bold}` is a `b` holding a `<bold>` element.
- **Text and `= expr` run to the `}` that closes the block.** Braces inside
  them are counted, so `{{ }}` and object literals pass through. Write `\}`
  and `\{` for a brace that is not counted. Whitespace before the `}` means
  nothing, as at the end of a line.
- **A child that ends with `}` or `/`** may be followed by another child, so text
  can only be the last one: `div{h2{| Title} p Body}`.
- **The block closes on its line.** For children over several lines, end the
  line with `{` instead (`UNCLOSED_BRACE`).

```zamn
p{b {{ user.name }}}
p{span= ok ? { a: 1 }.a : 0}
p{b \} and \{ are text}
p{img(src="a.png")/ br/}
```

```html
<p><b>{{ user.name }}</b></p><p><span>{{ ok ? { a: 1 }.a : 0 }}</span></p><p><b>} and { are text</b></p><p><img src="a.png"/><br/></p>
```

[Prettier](../../ecosystem/prettier) prints every block over several lines.

## Braces that are text

Only a `{` straight after the tag and its attributes opens a block. Everywhere
else a brace is text:

```zamn
p some { text }
| { more text }
p {{ message }}
```

```html
<p>some { text }</p>{ more text }<p>{{ message }}</p>
```

`{{` never opens a block, so `p {{ message }}` is text, as Vue expects.

To start an element's text with a literal brace, escape it:

```zamn
p \{
p \{ not a block }
```

```html
<p>{</p><p>{ not a block }</p>
```

`p {b}` is a `p` holding a `<b>` element; `p \{b}` is the text `{b}`.
