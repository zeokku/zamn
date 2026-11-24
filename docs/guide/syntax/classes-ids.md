# Classes and ids

`.name` adds a class and `#name` sets the id. Write as many as you need, straight after the tag, in any order:

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

Classes from `.name` and from `class="..."` attributes are merged into one `class` attribute, in the order they are written, and it always comes first:

```zamn
a.btn(href="/" class="big").primary Home
```

```html
<a class="btn big primary" href="/">Home</a>
```

An empty `class=""` adds nothing.

## Utility classes

Class names can hold what utility frameworks such as Tailwind put in them, so they work as shorthands too:

```zamn
.grid.grid-cols-1.gap-6.sm:grid-cols-2.dark:bg-gray-900
.w-1/2.px-2.5.md:flex.hover:bg-sky-700.!mt-0
.[&>*]:p-2.h-[calc(100%-2rem)].bg-(--brand).@container.*:rounded
```

```html
<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 dark:bg-gray-900"></div><div class="w-1/2 px-2.5 md:flex hover:bg-sky-700 !mt-0"></div><div class="[&>*]:p-2 h-[calc(100%-2rem)] bg-(--brand) @container *:rounded"></div>
```

After the `.`, a class name may hold:

- letters, digits, `_`, `-`, `@`, `*` and `%`;
- `:` and `/` when another class character follows, so in `li.active: a Home` the `: ` is still [block expansion](./elements#block-expansion);
- `.` when a digit follows (`px-2.5`); any other `.` starts the next class;
- `!` when no `=` follows;
- a `[...]` with no whitespace or braces inside (quotes are fine: `content-['*']`);
- a `(...)` straight after a `-` (`bg-(--brand)`); any other `(` starts the attributes.

A class name must contain at least one letter or `_`: `.-x`, `._y` and `.col-2` are fine, `.5` is an error (`INVALID_CLASS_NAME`). Shorthand classes are written to the HTML as they are, with only `"` escaped. A name with whitespace or braces in it goes in a `class="..."` attribute.

## Valid ids

An id holds letters, digits, `_` and `-`. A `#` with no name after it is an error (`INVALID_ID`).

`id` can appear only once per element: `p#a(id="b")` is an error (`DUPLICATE_ATTRIBUTE`).
