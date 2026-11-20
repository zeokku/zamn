# Text

## Inline

Everything after the tag and one space is text:

```zamn
p Hello, world.
```

```html
<p>Hello, world.</p>
```

Text is not escaped, so HTML written in text goes through as it is. Entities too:

```zamn
p Ready? <b>Go</b> &rarr;
```

```html
<p>Ready? <b>Go</b> &rarr;</p>
```

## Piped text

A line that starts with `|` is text, anywhere an element could be. Consecutive `|`
lines are joined with a line break:

```zamn
p
  | The first line
  | and the second.
```

```html
<p>The first line
and the second.</p>
```

## Whitespace

Whitespace at the end of a line is ignored everywhere. The output has no whitespace
between elements unless you write it, and a `|` on its own is one space. That's how
a space between two lines is written:

```zamn
p
  b this
  |
  | is
  |
  u cool
```

```html
<p><b>this</b> is <u>cool</u></p>
```

## Text blocks

A tag followed by a `.` takes the indented lines under it as text, with their line
breaks and any deeper indentation kept. This suits `script`, `style` and `pre`:

```zamn
script.
  if (a < b) {
    go();
  }
```

```html
<script>if (a < b) {
  go();
}</script>
```

A `.` on a line of its own does the same inside an element:

```zamn
p
  .
    A block of text
    under a dot.
```

```html
<p>A block of text
under a dot.</p>
```

## Inline tags

`#[...]` puts an element in the middle of text. It takes everything an element
takes: classes, attributes, `= expr`, `:` expansion, and its own text:

```zamn
p Read the #[a(href="/docs") docs] or #[em: b ask].
```

```html
<p>Read the <a href="/docs">docs</a> or <em><b>ask</b></em>.</p>
```

It works in piped text and in text blocks too. For a literal `#[`, escape it as
`\#[`:

```zamn
p Write \#[b bold] for bold.
```

```html
<p>Write #[b bold] for bold.</p>
```

An inline tag must close on the same line (`NO_END_BRACKET`).

## Text outside elements

Piped text works at the top level of a template as well:

```zamn
| Hello,
|
b world
```

```html
Hello, <b>world</b>
```
