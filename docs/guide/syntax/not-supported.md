# Not supported

zamn is static: a template describes markup and nothing else. Anything that would need a program to run is an error, with a hint saying what to do instead. So are a few forms from other template languages that zamn writes another way. All of them have the code `UNSUPPORTED_SYNTAX`.

## Control flow

`if`, `else`, `unless`, `case`, `when`, `default`, `each`, `for` and `while`.

```zamn error=UNSUPPORTED_SYNTAX
if user {
  p Hello
}
```

Use your framework's directives:

```zamn
p(v-if="user") Hello
ul {
  li(v-for="item in items" :key="item.id")= item.name
}
```

## Code

`- code` lines and `&attributes(...)`. JavaScript in attribute values is an error too, with its own code ([`JS_EXPRESSION`](../../reference/diagnostics#js-expression)). `= expr` is fine: zamn doesn't run it, it writes it out for your framework (see [Interpolation](./interpolation)).

```zamn error=UNSUPPORTED_SYNTAX
- const year = new Date().getFullYear()
```

Move the logic into your component and bind the result: `p= year`.

`tag!= html`, which would write unescaped output, is not supported either. In Vue, use `v-html`:

```zamn
div(v-html="rendered")
```

## Mixins

`mixin name` and `+name`. Use a component.

```zamn error=UNSUPPORTED_SYNTAX
+card("Title")
```

## Includes and inheritance

`include`, `extends`, `block`, `append`, `prepend` and `yield`. A template is one file; compose pages from components, or let your framework's layouts do the job.

```zamn error=UNSUPPORTED_SYNTAX
include partials/header.zamn
```

## Filters

`:markdown` and other `:filter` blocks. Run the content through its tool before it reaches the template, or use a component that renders it.

```zamn error=UNSUPPORTED_SYNTAX
:markdown
```

## Lines of HTML

A statement that starts with `<`. Text is escaped, so HTML can't be written as text either: write it as elements.

```zamn error=UNSUPPORTED_SYNTAX
<b>bold</b>
```

```zamn
b bold
p Some #{b bold} text.
```

```html format
<b>bold</b>
<p>
  Some
  <b>bold</b>
  text.
</p>
```

For HTML that comes from data, use your framework: `div(v-html="html")` in Vue.

## Written another way

| Not this | Hint | Write |
|---|---|---|
| `p Some #[b bold] text` | use `#{...}` | `p Some #{b bold} text` |
| `p.` or `script.` with an indented block of text | `\|{ ... }` for text, `/script` content for scripts and styles | `p \|{ ... }`, or [`script` … `/script`](./script-style) |
| `img/`, `foo/` | drop the `/` | `img`, `foo`: void elements need nothing, and other elements always get a closing tag |

```zamn error=UNSUPPORTED_SYNTAX
p Some #[b bold] text
```

```zamn error=UNSUPPORTED_SYNTAX
p.
  A block of text
```

```zamn error=UNSUPPORTED_SYNTAX
br/
```

Children nested by indentation alone are not an error, but they are not children either: indentation means nothing, so they are siblings, and zamn warns about it (`MISLEADING_INDENTATION`). Put them in `{ }`; see [Brace blocks](./brace-blocks#indentation).
