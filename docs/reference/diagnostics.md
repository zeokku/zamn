# Diagnostics

The lexer and parser never stop at the first problem: they report it and carry on, so one run lists everything. [`compile`](./api#compile) throws the errors as one [`ZamnError`](./api#zamnerror), the [CLI](./cli) prints them, and [`parse`](./api#parse) and [`lex`](./api#lex) return them alongside the result.

Every diagnostic has a `code`, a `severity`, a `message`, a `range` and often a `hint`. The severity is `error` or `warning`:

- an **error** means the template can't be compiled: `compile` throws, and `zamn --validate` fails;
- a **warning** points at something that compiles but probably isn't what you meant: `compile` returns it in `warnings`, and the CLI prints it as `warning[CODE]` without failing.

In ESLint the codes are prefixed with `zamn/` (`zamn/UNSUPPORTED_SYNTAX`): errors are reported by [`vue-zamn/no-parsing-error`](../ecosystem/eslint#vue-zamn-no-parsing-error), and the `MISLEADING_INDENTATION` warning by [`vue-zamn/no-misleading-indentation`](../ecosystem/eslint#vue-zamn-no-misleading-indentation).

## Constructs zamn doesn't have

### `UNSUPPORTED_SYNTAX`

Control flow, code, mixins, includes, inheritance, filters, `&attributes`, `!=` output and lines of HTML, as well as forms zamn writes another way: `#[...]` inline tags (use `#{...}`), `tag.` text blocks (use `|{ ... }`, or `/script` content for scripts and styles) and `tag/` (drop the `/`). The hint says what to use instead. See [Not supported](../guide/syntax/not-supported).

```zamn error=UNSUPPORTED_SYNTAX
each item in items {
  li= item
}
```

```text
error[UNSUPPORTED_SYNTAX]: `each` (control flow) is not supported
  hint: zamn has no control flow; use your framework's directives, e.g. `div(v-if="cond")`
```

### `JS_EXPRESSION`

An attribute value, or what follows it, is JavaScript: `href=url + "/x"`, `` title=`${x}` ``, `class=['a', 'b']`, `data-x={ a: 1 }`, or a `style={...}` that can't be read as CSS. Quote the value, or in Vue use a binding (`:href="url + '/x'"`).

```zamn error=JS_EXPRESSION
a(href=base + "/docs") Docs
```

## Blocks

### `UNCLOSED_BRACE`

A `{` with no `}`.

```zamn error=UNCLOSED_BRACE
section {
  p Never closed
```

### `UNMATCHED_BRACE`

A `}` with no `{` to close.

```zamn error=UNMATCHED_BRACE
p Text
}
```

### `UNESCAPED_BRACE`

A `{` in text that is neither a block nor a `{{ }}` mustache. Write `\{` for a literal brace, and `\}` for its partner, which would otherwise close the block. See [Braces in text](../guide/syntax/brace-blocks#braces-in-text).

```zamn error=UNESCAPED_BRACE
p Objects look like { a: 1 }
```

### `MISLEADING_INDENTATION`

A warning: a statement is indented deeper than the statement before it in the same block, and that statement left no block open. It looks like a child, but [indentation means nothing](../guide/syntax/brace-blocks#indentation), so it is a sibling. Put it inside the braces, or indent it as a sibling. The first line of a block, continued attribute lists, `|{ }` text, script and style content and comments are exempt.

```zamn warning=MISLEADING_INDENTATION
p Some text
  b bold
```

```html format
<p>Some text</p>
<b>bold</b>
```

## Text

### `UNEXPECTED_TEXT`

Something zamn can't read, such as a statement that starts with `{{` or `#{` (start text with `|`), or text straight after the `)` of the attributes (write a space first).

```zamn error=UNEXPECTED_TEXT
p {
  {{ greeting }}
}
```

### `UNCLOSED_INTERPOLATION`

A `{{` in text with no `}}` before the text ends.

```zamn error=UNCLOSED_INTERPOLATION
p Hello {{ user.name
```

### `UNCLOSED_COMMENT`

A `/*` or `/*!` with no `*/`.

```zamn error=UNCLOSED_COMMENT
/* draft
p Hello
```

## Scripts and styles

### `UNCLOSED_RAW`

A `script` or `style` whose content has no `/script` or `/style` line after it. It is reported at the opening line, with the hint "end it with `/script` on its own line". See [Scripts and styles](../guide/syntax/script-style).

```zamn error=UNCLOSED_RAW
script
  go()
```

### `UNMATCHED_CLOSE`

A `/tag` line that ends nothing: after a script with `src`, which has no content and needs no `/script`, or for a tag other than `script` and `style`.

```zamn error=UNMATCHED_CLOSE
script(src="/app.js")
/script
```

## Elements

### `INVALID_CLASS_NAME`

A `.` that isn't followed by a class name, or a name with no letter or `_` in it (`.5`). See [Classes and ids](../guide/syntax/classes-ids#utility-classes) for what a name may hold, and use `class="..."` for anything else.

```zamn error=INVALID_CLASS_NAME
p.5 Five
```

### `INVALID_ID`

A `#` after a tag with no id after it.

```zamn error=INVALID_ID
p# Text
```

### `SELF_CLOSING_CONTENT`

A void element (`img`, `br`, `input`, …) has content.

```zamn error=SELF_CLOSING_CONTENT
img(src="/a.png") {
  span Caption
}
```

### `MISSING_EXPANSION`

A `:` (block expansion) with nothing after it: `li: ` followed by the end of the line.

### `MISSING_EXPRESSION`

A `=` with no expression after it.

```zamn error=MISSING_EXPRESSION
p=
```

### `MISSING_DOCTYPE`

A `doctype` with nothing after it. Write `doctype html`, or leave the line out.

```zamn error=MISSING_DOCTYPE
doctype
```

## Attributes

### `DUPLICATE_ATTRIBUTE`

The same attribute twice on one element, `id` set by both `#id` and `id="..."` included. `class` may repeat: the values are merged.

```zamn error=DUPLICATE_ATTRIBUTE
a(href="/a" href="/b")
```

### `INVALID_ATTRIBUTE_VALUE`

An unquoted value holds a character HTML doesn't allow there: whitespace, `"`, `'`, `` ` ``, `=`, `<` or `>`. The hint: put the value in quotes.

```zamn error=INVALID_ATTRIBUTE_VALUE
a(href=/search?q=zamn) Search
```

### `MISSING_ATTRIBUTE_VALUE`

A `=` with no value after it.

```zamn error=MISSING_ATTRIBUTE_VALUE
a(href=) Link
```

### `NO_END_BRACKET`

The `(` of an attribute list never closes.

```zamn error=NO_END_BRACKET
a(href="/" Docs
```

## Other

### `UNEXPECTED_TOKEN`

The parser met a token it didn't expect where it was. You shouldn't normally see this one: the lexer reports most problems first. If you do, please [open an issue](https://github.com/zeokku/zamn/issues) with the template.

## Removed codes

`INVALID_INDENTATION`, `INCONSISTENT_INDENTATION` and `UNEXPECTED_INDENT` went with nesting by indentation: indentation means nothing now, and the only diagnostic about it is the `MISLEADING_INDENTATION` warning.
