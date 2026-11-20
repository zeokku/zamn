# Classes and ids

`.name` adds a class and `#name` sets the id. Write as many as you need, straight
after the tag, in any order:

```zamn
button.btn.btn-primary#save Save
```

```html
<button class="btn btn-primary" id="save">Save</button>
```

Without a tag, the element is a `div`:

```zamn
#app.dark
```

```html
<div class="dark" id="app"></div>
```

## Merging with `class`

Classes from `.name` and from `class="..."` attributes are merged into one `class`
attribute, in the order they are written, and it always comes first:

```zamn
a.btn(href="/" class="big").primary Home
```

```html
<a class="btn big primary" href="/">Home</a>
```

An empty `class=""` adds nothing.

## Valid names

A class name holds letters, digits, `_` and `-`, and must contain at least one letter
or `_`: `.-x`, `._y` and `.col-2` are fine, `.5` is an error (`INVALID_CLASS_NAME`).

An id holds letters, digits, `_` and `-`. A `#` with no name after it is an error
(`INVALID_ID`).

For anything else, such as Tailwind's `w-1/2` or `md:flex`, use the attribute:

```zamn
div(class="w-1/2 md:flex")
```

```html
<div class="w-1/2 md:flex"></div>
```

`id` can appear only once per element: `p#a(id="b")` is an error
(`DUPLICATE_ATTRIBUTE`).
