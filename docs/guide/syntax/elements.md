# Elements

## Tags

A statement that starts with a name is an element. Its children go in a `{ }` block after it:

```zamn
ul {
  li One
  li Two
}
```

```html
<ul><li>One</li><li>Two</li></ul>
```

Text after the name and a space is the element's content. See [Text](./text). Blocks are explained in [Brace blocks](./brace-blocks).

A tag name may contain letters, digits, `_`, `-` and `:`, so custom elements, components and namespaced tags all work:

```zamn
my-card {
  MyButton Go
  svg:circle(r="4")
}
```

```html
<my-card><MyButton>Go</MyButton><svg:circle r="4"></svg:circle></my-card>
```

A tag can't hold a `.`: that starts a class. `Form.Input` is the tag `Form` with the class `Input`.

## The implicit `div`

A statement that starts with a class or an id is a `div`:

```zamn
.card {
  #title Hello
}
```

```html
<div class="card"><div id="title">Hello</div></div>
```

## Block expansion

`tag: child` puts a single child on the same line. It nests as deep as you like:

```zamn
ul {
  li: a(href="/") Home
  li: a(href="/about"): b About
}
```

```html
<ul><li><a href="/">Home</a></li><li><a href="/about"><b>About</b></a></li></ul>
```

The space after the `:` is required; `svg:path` is a tag name.

## Void elements

The output is always HTML5. `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track` and `wbr` are written without a closing tag or a `/`, and every other element gets its closing tag, even when it is empty:

```zamn
img(src="/logo.png" alt="Logo")
br
icon-star
```

```html
<img src="/logo.png" alt="Logo"><br><icon-star></icon-star>
```

Giving a void element content is an error (`SELF_CLOSING_CONTENT`), and so is a `/` after a tag (`img/`): there is nothing to self-close.
