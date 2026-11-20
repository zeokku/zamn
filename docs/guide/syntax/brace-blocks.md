# Brace blocks

An element may hold its children in `{ }` instead of indenting them under it.

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

Braces and indentation mean the same thing and mix freely. Use braces where they
make a long block easier to follow: you can see where it ends.

## The rules

- **`{` ends the line of the tag**, after its classes, ids and attributes:
  `section.main(role="main") {`.
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

## Braces that are text

Only a `{` straight after the tag and its attributes, at the end of the line, opens
a block. Everywhere else a brace is text:

```zamn
p some { text }
| { more text }
p {{ message }}
```

```html
<p>some { text }</p>{ more text }<p>{{ message }}</p>
```

`{{` never opens a block, so `p {{ message }}` is text, as Vue expects.

To start an element's text with a literal brace at the end of a line, escape it:

```zamn
p \{
```

```html
<p>{</p>
```
