# Interpolation

zamn doesn't evaluate anything, but it writes interpolation for the framework that
will. `= expr` becomes `{{ expr }}`:

```zamn
h1= title
p
  = greeting
  |
  = name
```

```html
<h1>{{ title }}</h1><p>{{ greeting }} {{ name }}</p>
```

The expression runs to the end of the line (in a [block on one line](./brace-blocks#blocks-on-one-line),
to the `}` that closes it) and is copied as it is. zamn never parses
it, so any expression your framework accepts works: `p= items.length > 0 ? "some" : "none"`.

`=` with nothing after it is an error (`MISSING_EXPRESSION`).

## Inside text

`{{ }}` written in text is just text, so it reaches the framework untouched:

```zamn
p Hello {{ user.name }}, you have #[strong= count] messages.
```

```html
<p>Hello {{ user.name }}, you have <strong>{{ count }}</strong> messages.</p>
```

Interpolation written as `#{...}` is not special: it is text as well.

## Other delimiters

`{{` and `}}` are what Vue (and Angular, Handlebars and others) use. For another
framework, pass the `interpolation` option to [`compile`](../../reference/api#compile):

```ts
compile("p= user", { interpolation: ["${", "}"] });
// <p>${ user }</p>
```

## In attributes

Attribute values are never interpolated. In Vue, bind them instead:

```zamn
img(:src="user.avatar" :alt="`Avatar of ${user.name}`")
```

```html
<img :src="user.avatar" :alt="`Avatar of ${user.name}`"/>
```
