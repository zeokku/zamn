# Text

## Inline

Everything after the tag and one space is text:

```zamn
p Hello, world.
```

```html
<p>Hello, world.</p>
```

A `|` after the tag, or text in `|{ }`, says the same thing. These three are identical:

```zamn
div some text
div | some text
div |{ some text }
```

```html
<div>some text</div><div>some text</div><div>some text</div>
```

## Escaping

Text is HTML-escaped: `<` and `>` become `&lt;` and `&gt;`, and `&` becomes `&amp;`, unless it starts a character reference such as `&rarr;`, `&#123;` or `&#x1F;`, which passes through:

```zamn
p Ready? <b>Go</b> &rarr; Tom & Jerry
```

```html
<p>Ready? &lt;b&gt;Go&lt;/b&gt; &rarr; Tom &amp; Jerry</p>
```

So text shows tags as text, and you write elements as elements: `p Ready? #{b Go}` (see [inline elements](#inline-elements)). The same goes for `pre`. There is no way to write raw HTML in text; for HTML that comes from data, use your framework, such as Vue's `v-html`.

Not escaped: the content of [`script` and `style`](./script-style), [mustaches and `= expr`](./interpolation), and [comments](./comments).

## Piped text

A statement that is only text starts with `|`, anywhere an element could be. Consecutive `|` lines are joined with a line break:

```zamn
p {
  | The first line
  | and the second.
}
```

```html
<p>The first line
and the second.</p>
```

Text that begins with a mustache or an inline element needs the `|` too: a statement that starts with `{{` or `#{` is an error (`UNEXPECTED_TEXT`).

```zamn
p {
  | {{ greeting }}, #{b world}
}
```

```html
<p>{{ greeting }}, <b>world</b></p>
```

## Whitespace

Whitespace at the end of a line is ignored everywhere. The output has no whitespace between elements unless you write it, and a `|` on its own is one space. That's how a space between two lines is written:

```zamn
p {
  b this
  |
  | is
  |
  u cool
}
```

```html
<p><b>this</b> is <u>cool</u></p>
```

## Text blocks

`|{ ... }` holds text that may span lines. On one line it is trimmed. Over several lines:

- a blank first and last line are dropped, so the text can start on the line after the `{` and end on the line before the `}`;
- the indentation the lines have in common is stripped, and deeper indentation is kept;
- the lines are joined with line breaks.

```zamn
pre |{
  function go() \{
    return a < b;
  \}
}
```

```html
<pre>function go() {
  return a &lt; b;
}</pre>
```

It can stand on its own inside a block, and holds [inline elements](#inline-elements):

```zamn
p {
  |{
    A block of text
    over two lines, with #{em inline} elements.
  }
}
```

```html
<p>A block of text
over two lines, with <em>inline</em> elements.</p>
```

Whitespace around the `|` is optional: `div |{ … }`, `div | { … }` and `div|{ … }` are the same, as are `|{ … }` and `| { … }` on their own. That is why text that starts with a brace is written `| \{ …`.

## Escapes

- `\{` and `\}` are literal braces. Any other brace in text is either a [mustache](./interpolation#inside-text) (`{{ }}`), a bare `{` (an error, `UNESCAPED_BRACE`) or a `}` that closes the block. See [Braces in text](./brace-blocks#braces-in-text).
- `\|` at the start of text is a literal `|`, and the space after it is kept.
- `\#{` is a literal `#{`, and `\#[` a literal `#[`.
- Any other backslash is just a backslash.

```zamn
p \| x
p Write \#{ to start an inline element.
p C:\temp
```

```html
<p>| x</p><p>Write #{ to start an inline element.</p><p>C:\temp</p>
```

`p \| x` is the same as `p | | x`.

## Inline elements

`#{...}` puts an element in the middle of text. It holds exactly one statement, so it takes everything an element takes: classes, attributes, `= expr`, `:` expansion, and its own text, which runs to the `}`:

```zamn
p Read the #{a(href="/docs") docs} or #{em: b ask}.
```

```html
<p>Read the <a href="/docs">docs</a> or <em><b>ask</b></em>.</p>
```

It works in piped text and in `|{ }` blocks too, and inline elements nest:

```zamn
p { | some #{b biba #{i boba}} text }
```

```html
<p>some <b>biba <i>boba</i></b> text</p>
```

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
