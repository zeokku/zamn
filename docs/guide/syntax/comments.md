# Comments

`//-` is a comment for the template's readers: it is left out of the HTML. `//` is an
HTML comment: it is written to the output.

```zamn
//- Only people reading the template see this.
// Everyone reading the page source sees this.
p Hello
```

```html
<!-- Everyone reading the page source sees this.--><p>Hello</p>
```

The text after `//` is copied as written, including the space after the marker.

## Comment blocks

Lines indented under a comment belong to it. They are not parsed, so they can hold
anything, including lines that would be errors:

```zamn
//-
  Not ready yet:
  each item in items
    li= item
//
  Built by zamn
p Done
```

```html
<!--Built by zamn--><p>Done</p>
```

## In editors and linters

"Toggle Line Comment" in [VS Code](../../ecosystem/vscode) writes `//-`, so
commenting out a line never puts it into the page. ESLint directives work as `//-`
comments in a Vue template:

```zamn
//- eslint-disable-next-line vue/no-v-html
div(v-html="content")
```
