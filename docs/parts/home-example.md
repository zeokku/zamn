<div class="home-compare">
<div>

## Write this

```zamn
nav.top {
  a(href=/) Home
  a(href=/docs :class={ active: onDocs }) Docs
  button(@click=toggleTheme)= themeLabel
}
```

</div>
<div>

## Get this

```html format
<nav class="top">
  <a href="/">Home</a>
  <a href="/docs" :class="{ active: onDocs }">Docs</a>
  <button @click="toggleTheme">{{ themeLabel }}</button>
</nav>
```

</div>
</div>

With the advent of coding agents and a faster pace of development, I was thinking about a better format to replace HTML, without the issues other formats have (pug, for example). The main goal is to make it readable, so a human can quickly validate agent-generated code, and yet simple and explained for an agent to write and validate, with optimized token usage.

zamn compiles to plain HTML, so it works anywhere HTML does: a static page, an email template, or the `<template>` of a Vue component.

[Read the introduction](/guide/introduction) or [try it in the playground](/playground).
