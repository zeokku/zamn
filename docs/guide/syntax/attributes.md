# Attributes

Attributes go in parentheses after the tag, its classes and ids:

```zamn
a(href="/docs" target="_blank") Docs
```

```html
<a href="/docs" target="_blank">Docs</a>
```

Separate them with spaces or with commas, as you like:

```zamn
a(href="/docs", target="_blank") Docs
```

```html
<a href="/docs" target="_blank">Docs</a>
```

## Values

A value is one of:

| Value | Example | Output |
|---|---|---|
| a string in `"`, `'` or `` ` `` | `title='say "hi"'` | `title="say &quot;hi&quot;"` |
| a number | `tabindex=-1` | `tabindex="-1"` |
| unquoted, as in HTML: anything but whitespace, `"`, `'`, `` ` ``, `=`, `<`, `>`, `,` and `)` | `href=/docs/`, `target=_blank` | `href="/docs/"`, `target="_blank"` |
| an object of strings and numbers, for `style` | `style={color: 'red', margin: 0}` | `style="color:red;margin:0;"` |
| `true`, or no value | `disabled`, `disabled=true` | `disabled="disabled"` |
| `false`, `null` or `undefined` | `hidden=false` | the attribute is left out |

```zamn
input(type="checkbox" checked hidden=false tabindex=-1)
```

```html
<input type="checkbox" checked="checked" tabindex="-1"/>
```

With the HTML doctype, a boolean attribute is written as just its name, which is
what Vue expects:

```zamn doctype=html
input(type="checkbox" checked)
```

```html
<input type="checkbox" checked>
```

Quoted strings take JavaScript escapes: `title="it\'s"` is `it's`, `"é"` is
`é`. An empty `style=""` (or `style={}`) is left out.

A comma or `)` ends an unquoted value, as they separate and close the attributes.
Quote a value that holds one, or any of the characters HTML doesn't allow
(`INVALID_ATTRIBUTE_VALUE`):

```zamn
a(href=/docs/, target=_blank) Docs
a(href="/search?q=zamn") Search
p(style={color: 'red', 'font-size': '12px'}) Red
```

```html
<a href="/docs/" target="_blank">Docs</a><a href="/search?q=zamn">Search</a><p style="color:red;font-size:12px;">Red</p>
```

## Escaping

Values are HTML-escaped: `&`, `<`, `>` and `"` become entities. Use `!=` to write a
value as it is:

```zamn
p(title="a < b" data-html!="<b>bold</b>")
```

```html
<p title="a &lt; b" data-html="<b>bold</b>"></p>
```

## No expressions

A value is never evaluated: there is no JavaScript in zamn. Anything that looks like
an expression (`href=url + "/x"`, `class=['a', 'b']`, `` title=`${x}` ``,
`style={color: c}`) is an error (`JS_EXPRESSION`):

```zamn error=JS_EXPRESSION
a(href=base + "/docs") Docs
```

In Vue, write a binding instead: its value is a string to zamn and an expression to
Vue.

```zamn
a(:href="base + '/docs'") Docs
```

```html
<a :href="base + '/docs'">Docs</a>
```

A binding (`:x`, `@x`, `#x`, `.x`, `v-*`) may also go without quotes, as HTML
allows. A value in `{ }`, `[ ]` or `( )` is copied as written, spaces and all:

```zamn
RouterLink(:to=/about :class={ active: onAbout } @click=go()) About
```

```html
<RouterLink :to="/about" :class="{ active: onAbout }" @click="go()">About</RouterLink>
```

The value ends at its closing bracket, and whatever follows is the next attribute.
Quote a value that goes on after it:

```zamn
li(v-for="(item, i) in items")
li(v-for=(item, i) in items)
```

```html
<li v-for="(item, i) in items"></li><li v-for="(item, i)" in="in" items="items"></li>
```

## Names

Names can hold almost anything but spaces, `=`, `,` and `)`, so framework syntax
works as written:

```zamn
MyInput(
  v-model.trim="name"
  :label="t('name')"
  @update:model-value="save"
  #prefix="{ icon }"
)
```

```html
<MyInput v-model.trim="name" :label="t('name')" @update:model-value="save" #prefix="{ icon }"></MyInput>
```

Quote a name to use other characters: `("odd name"="1")`. Each name may appear only
once per element, except `class` (`DUPLICATE_ATTRIBUTE`).

## Over several lines

The parentheses may span lines. A value may too, and its line breaks are kept:

```zamn
div(
  :class="{
    active: isActive
  }"
  @click="select(item)"
)
```

```html
<div :class="{
    active: isActive
  }" @click="select(item)"></div>
```

A `(` without its `)` is an error (`NO_END_BRACKET`), as is a `=` with no value
(`MISSING_ATTRIBUTE_VALUE`).
