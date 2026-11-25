# Doctype

`doctype html` writes the HTML5 doctype, and goes at the top of a full page:

```zamn
doctype html
html {
  body {
    input(type="checkbox" checked)
    br
  }
}
```

```html format
<!DOCTYPE html>
<html>
  <body>
    <input type="checkbox" checked>
    <br>
  </body>
</html>
```

`doctype X` writes `<!DOCTYPE X>`, whatever `X` is:

```zamn
doctype html PUBLIC "-//W3C//DTD HTML 4.01//EN"
```

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN">
```

A `doctype` with nothing after it is an error (`MISSING_DOCTYPE`): write `doctype html`, or leave the line out.

The doctype changes nothing else. The output is always HTML5, with or without one: void elements are written `<br>` and boolean attributes `checked`. A component template, such as a Vue `<template lang="zamn">`, has no doctype.
