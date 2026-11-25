# Interpolation

zamn doesn't evaluate anything, but it writes interpolation for the framework that will. `= expr` becomes `{{ expr }}`:

```zamn
h1= title
p {
  = greeting
  |
  = name
}
```

```html format
<h1>{{ title }}</h1>
<p>{{ greeting }} {{ name }}</p>
```

The expression runs to the end of the line, or to the `}` that closes the block it is in, and is copied as it is, without escaping. Braces and quoted strings in it are counted, so `p { span= { a: 1 }.a }` works. zamn never parses it otherwise, so any expression your framework accepts works: `p= items.length > 0 ? "some" : "none"`.

`=` with nothing after it is an error (`MISSING_EXPRESSION`).

## Inside text

`{{ ... }}` in text is a mustache: it reaches the framework untouched, and is not escaped like the text around it:

```zamn
p Hello {{ user.name }}, you have #{strong= count} messages.
p {{ a < b && c ? "yes" : "no" }}
```

```html format
<p>
  Hello {{ user.name }}, you have
  <strong>{{ count }}</strong>
  messages.
</p>
<p>{{ a < b && c ? "yes" : "no" }}</p>
```

A mustache must close within its text; one that doesn't is an error (`UNCLOSED_INTERPOLATION`). A statement can't start with `{{`: write `| {{ name }}`, or `= name`.

## Other delimiters

`{{` and `}}` are what Vue (and Angular, Handlebars and others) use. For another framework, pass the `interpolation` option to [`compile`](../../reference/api#compile):

```ts
compile("p= user", { interpolation: ["${", "}"] });
// <p>${ user }</p>
```

It changes what `= expr` writes; mustaches in text are copied as written.

## In attributes

Attribute values are never interpolated. In Vue, bind them instead:

```zamn
img(:src="user.avatar" :alt="`Avatar of ${user.name}`")
```

```html
<img :src="user.avatar" :alt="`Avatar of ${user.name}`">
```
