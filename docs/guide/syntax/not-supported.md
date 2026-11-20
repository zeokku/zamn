# Not supported

zamn is static: a template describes markup and nothing else. Anything that would
need a program to run is an error, with a hint saying what to do instead. All of
them have the code `UNSUPPORTED_SYNTAX`, and the lines nested under them are skipped,
so one mistake doesn't turn into many errors.

## Control flow

`if`, `else`, `unless`, `case`, `when`, `default`, `each`, `for` and `while`.

```zamn error=UNSUPPORTED_SYNTAX
if user
  p Hello
```

Use your framework's directives:

```zamn
p(v-if="user") Hello
ul
  li(v-for="item in items" :key="item.id")= item.name
```

## Code

`- code` lines and `&attributes(...)`. JavaScript in attribute values is an error
too, with its own code ([`JS_EXPRESSION`](../../reference/diagnostics#js-expression)).
`= expr` is fine: zamn doesn't run it, it writes it out for your framework (see
[Interpolation](./interpolation)).

```zamn error=UNSUPPORTED_SYNTAX
- const year = new Date().getFullYear()
```

Move the logic into your component and bind the result: `p= year`.

`tag!= html`, which writes unescaped output, is not supported either. In Vue, use
`v-html`:

```zamn
div(v-html="rendered")
```

## Mixins

`mixin name` and `+name`. Use a component.

```zamn error=UNSUPPORTED_SYNTAX
+card("Title")
```

## Includes and inheritance

`include`, `extends`, `block`, `append`, `prepend` and `yield`. A template is one file;
compose pages from components, or let your framework's layouts do the job.

```zamn error=UNSUPPORTED_SYNTAX
include partials/header.zamn
```

## Filters

`:markdown` and other `:filter` blocks. Run the content through its tool before it
reaches the template, or use a component that renders it.

```zamn error=UNSUPPORTED_SYNTAX
:markdown
  # Title
```

## Interpolated tag names

`#{tag}` as a tag name. Write the tag literally, or use a dynamic component
(`component(:is="tag")`).

```zamn error=UNSUPPORTED_SYNTAX
#{level} Heading
```

## Lines of HTML

A line that starts with `<`. Write it as zamn, or as text after `|`, since text is not
escaped:

```zamn error=UNSUPPORTED_SYNTAX
<b>bold</b>
```

```zamn
b bold
| <b>bold</b>
```

```html
<b>bold</b><b>bold</b>
```
