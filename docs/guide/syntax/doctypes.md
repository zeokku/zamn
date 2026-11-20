# Doctypes

`doctype html` writes the HTML5 doctype:

```zamn
doctype html
html
  body
    input(type="checkbox" checked)
    br
```

```html
<!DOCTYPE html><html><body><input type="checkbox" checked><br></body></html>
```

A bare `doctype` means `doctype html`.

## Shortcuts

| Write | Get |
|---|---|
| `doctype html` | `<!DOCTYPE html>` |
| `doctype xml` | `<?xml version="1.0" encoding="utf-8" ?>` |
| `doctype transitional` | XHTML 1.0 Transitional |
| `doctype strict` | XHTML 1.0 Strict |
| `doctype frameset` | XHTML 1.0 Frameset |
| `doctype 1.1` | XHTML 1.1 |
| `doctype basic` | XHTML Basic 1.1 |
| `doctype mobile` | XHTML Mobile 1.2 |
| `doctype plist` | Apple's property list |
| `doctype anything else` | `<!DOCTYPE anything else>` |

## What the doctype changes

The doctype also decides how elements and attributes are written after it:

| | HTML (`doctype html`) | XML (`doctype xml`) | otherwise |
|---|---|---|---|
| void elements | `<br>` | `<br></br>` | `<br/>` |
| boolean attributes | `checked` | `checked="checked"` | `checked="checked"` |

Without a doctype, the output is the third column, which is valid in every case.

## Assumed doctype

A component template has no doctype of its own, but should still be written the
HTML way. The `doctype` option of [`compile`](../../reference/api#compile) (or
`--doctype` on the [command line](../../reference/cli)) assumes one without writing
it:

```ts
compile("input(disabled)", { doctype: "html" });
// <input disabled>
```

Use `doctype: "html"` for Vue templates. The [Vite setup](../../ecosystem/vite) does.
