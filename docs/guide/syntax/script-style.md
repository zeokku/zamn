# Scripts and styles

`script` and `style` hold raw content. The tag's line ends the head, the lines below are the content, and a line that holds only `/script` (or `/style`) ends it:

```zamn
script
  if (a < b && ready) {
    go();
  }
/script
style
  a > b { color: red }
/style
```

```html
<script>if (a < b && ready) {
  go();
}</script><style>a > b { color: red }</style>
```

The content is copied as it is:

- it is not parsed: braces, `#{`, `{{ }}` and backslashes are just characters;
- it is never escaped;
- as in [`|{ }` text](./text#text-blocks), a blank first and last line are dropped, and the indentation the lines have in common is stripped, keeping deeper indentation.

They work inside a block like any other element, and the `/script` line may be indented as you like:

```zamn
body {
  p Hello
  script
    console.log("loaded")
  /script
}
```

```html
<body><p>Hello</p><script>console.log("loaded")</script></body>
```

## With `src`

A script with `src` (or `:src`, `v-bind:src`) has no content, since browsers ignore it, and no closing line:

```zamn
script(type="module" src="/main.js")
p Next
```

```html
<script type="module" src="/main.js"></script><p>Next</p>
```

## Errors

- No closing line before the end of the file is `UNCLOSED_RAW`, reported at the `script` line, with the hint "end it with `/script` on its own line".
- A `/script` after a script with `src`, or a `/tag` line for any other tag, is `UNMATCHED_CLOSE`.
- `script` and `style` take no `{ }` block, `|{ }` text or text on their own line. Each is an error, with a hint pointing to `/script` content.

```zamn error=UNCLOSED_RAW
script
  go()
```

## `pre` and other elements

Only `script` and `style` hold raw content. `pre` is an ordinary element, whose text is escaped and may hold [inline elements](./text#inline-elements). Write multi-line text in it with `pre |{ ... }`; see [Text blocks](./text#text-blocks).
