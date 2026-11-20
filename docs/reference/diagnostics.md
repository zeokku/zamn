# Diagnostics

The lexer and parser never stop at the first problem: they report it and carry on,
so one run lists everything. [`compile`](./api#compile) throws them all as one
[`ZamnError`](./api#zamnerror), the [CLI](./cli) prints them, and
[`parse`](./api#parse) and [`lex`](./api#lex) return them alongside the result.

Every diagnostic is an error, and has a `code`, a `message`, a `range` and often a
`hint`. In ESLint the codes are prefixed with `zamn/` (`zamn/UNSUPPORTED_SYNTAX`); see
[`vue-zamn/no-parsing-error`](../ecosystem/eslint#vue-zamn-no-parsing-error).

## Constructs zamn doesn't have

### `UNSUPPORTED_SYNTAX`

Control flow, code, mixins, includes, inheritance, filters, `&attributes`, `!=`
output, `#{...}` tag names and lines of HTML. The hint says what to use instead; the
lines nested under the construct are skipped. See [Not supported](../guide/syntax/not-supported).

```zamn error=UNSUPPORTED_SYNTAX
each item in items
  li= item
```

```text
error[UNSUPPORTED_SYNTAX]: `each` (control flow) is not supported
  hint: zamn has no control flow; use your framework's directives, e.g. `div(v-if="cond")`
```

### `JS_EXPRESSION`

An attribute value, or what follows it, is JavaScript: `href=url + "/x"`,
`` title=`${x}` ``, `class=['a', 'b']`. Values are strings, numbers or bare words.
In Vue, use a binding (`:href="url + '/x'"`).

```zamn error=JS_EXPRESSION
a(href=base + "/docs") Docs
```

## Layout

### `INCONSISTENT_INDENTATION`

A line is indented less than the first line of its block, or between two levels.

```zamn error=INCONSISTENT_INDENTATION
ul
    li One
  li Two
```

```text
error[INCONSISTENT_INDENTATION]: Inconsistent indentation. Expecting either 0 or 4 spaces/tabs.
```

### `INVALID_INDENTATION`

Tabs and spaces mixed in one line's indentation, or a line indented deeper right
after a `}` (children of a braced element go inside its braces).

```zamn error=INVALID_INDENTATION
div {
  p Inside
}
  p Too deep
```

### `UNEXPECTED_INDENT`

Indented lines under something that can't have children, such as `= expr`.

```zamn error=UNEXPECTED_INDENT
= greeting
  p Child
```

### `UNCLOSED_BRACE`

A `{` with no `}`. The hint: add a `}` on its own line.

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

## Elements

### `INVALID_CLASS_NAME`

A `.` that isn't followed by a class name, or a name with no letter or `_` in it
(`.5`). Use `class="..."` for names zamn can't write as `.name`.

```zamn error=INVALID_CLASS_NAME
p.5 Five
```

### `INVALID_ID`

A `#` after a tag with no id after it.

```zamn error=INVALID_ID
p# Text
```

### `UNEXPECTED_TEXT`

Something after an element that zamn can't read, such as text straight after the
`)` of the attributes (write a space first) or after a `/`.

```zamn error=UNEXPECTED_TEXT
br/ text
```

### `SELF_CLOSING_CONTENT`

A void element (`img`, `br`, `input`, …) or an element closed with `/` has content.

```zamn error=SELF_CLOSING_CONTENT
img(src="/a.png")
  span Caption
```

### `MISSING_EXPANSION`

A `:` (block expansion) with nothing after it: `li: ` followed by the end of the line.

### `MISSING_EXPRESSION`

A `=` with no expression after it.

```zamn error=MISSING_EXPRESSION
p=
```

## Attributes

### `DUPLICATE_ATTRIBUTE`

The same attribute twice on one element, `id` set by both `#id` and `id="..."`
included. `class` may repeat: the values are merged.

```zamn error=DUPLICATE_ATTRIBUTE
a(href="/a" href="/b")
```

### `MISSING_ATTRIBUTE_VALUE`

A `=` with no value after it.

```zamn error=MISSING_ATTRIBUTE_VALUE
a(href=) Link
```

### `NO_END_BRACKET`

The `(` of an attribute list never closes, or a `#[` inline tag doesn't close on its
line.

```zamn error=NO_END_BRACKET
p See #[a(href="/") the docs
```

## Other

### `UNEXPECTED_TOKEN`

The parser met a token it didn't expect where it was. You shouldn't normally see this
one: the lexer reports most problems first. If you do, please
[open an issue](https://github.com/zeokku/zamn/issues) with the template.
