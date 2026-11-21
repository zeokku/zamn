# Elements

## Tags

A line that starts with a name is an element. Its children go in a `{ }` block after
it:

```zamn
ul {
  li One
  li Two
}
```

```html
<ul><li>One</li><li>Two</li></ul>
```

Text after the name and a space is the element's content. See [Text](./text).

A tag name may contain letters, digits, `_`, `-` and `:`, so custom elements,
components and namespaced tags all work:

```zamn
my-card
  MyButton Go
  svg:circle(r="4")
```

```html
<my-card><MyButton>Go</MyButton><svg:circle r="4"></svg:circle></my-card>
```

A tag can't hold a `.`: that starts a class. `Form.Input` is the tag `Form` with the
class `Input`.

## Braces or indentation

Braces are the recommended way to write children, and what
[Prettier](../../ecosystem/prettier) prints: see [Brace blocks](./brace-blocks).
Indentation alone works too, as long as the block is consistent. Children are then
the lines indented under the element:

```zamn
ul
  li One
  li Two
```

```html
<ul><li>One</li><li>Two</li></ul>
```

Indent with spaces or with tabs, but not both on the same line. Each block decides
its own step: children indented by 2 or by 4 are both fine, as long as the lines of
one block line up.

```zamn
section
    h2 Four spaces
    p Still four
footer
  p Two here
```

```html
<section><h2>Four spaces</h2><p>Still four</p></section><footer><p>Two here</p></footer>
```

A line indented less than its siblings, or in between two levels, is an error
(`INCONSISTENT_INDENTATION`).

## The implicit `div`

A line that starts with a class or an id is a `div`:

```zamn
.card
  #title Hello
```

```html
<div class="card"><div id="title">Hello</div></div>
```

## Block expansion

`tag: child` puts a single child on the same line. It nests as deep as you like:

```zamn
ul
  li: a(href="/") Home
  li: a(href="/about"): b About
```

```html
<ul><li><a href="/">Home</a></li><li><a href="/about"><b>About</b></a></li></ul>
```

The space after the `:` is required; `svg:path` is a tag name.

## Void and self-closing elements

`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`,
`source`, `track` and `wbr` never have content. Add `/` to close any other tag the
same way.

```zamn
img(src="/logo.png" alt="Logo")
br
icon-star/
```

```html
<img src="/logo.png" alt="Logo"/><br/><icon-star/>
```

With the HTML doctype (`doctype html`, or the [`doctype` option](./doctypes#assumed-doctype)),
void elements are written the HTML way, without the slash. A `/` you write stays:

```zamn doctype=html
img(src="/logo.png")
icon-star/
```

```html
<img src="/logo.png"><icon-star/>
```

Giving a void or self-closed element content is an error (`SELF_CLOSING_CONTENT`).
