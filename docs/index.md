---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: ".zamn"
  text: "HTML without the <span class=\"angle\"><span class=\"punct bracket\">&lt;</span>angle brackets<span class=\"punct bracket\">&gt;</span></span>"
  tagline: A static way to write HTML with <code>{ }</code> blocks instead of closing tags. Easy to read, quick to write, and cheap for coding agents to generate.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: For AI agents
      link: /ai/

features:
  - title: Readable
    icon: ▲
    details: "Tags, classes and ids on one line, children in <code>{ }</code> blocks. No closing tags to keep in sync."
    link: /guide/syntax/elements
  - title: Fewer tokens
    icon: ◆
    details: About a third fewer tokens than formatted HTML on realistic pages. Agents write terse zamn, Prettier makes it pretty.
    link: /ai/token-savings
  - title: Vue tooling
    icon: ■
    details: "<code>&lt;template lang=\"zamn\"&gt;</code> with Vite, vue-tsc type checking, ESLint, Prettier and VS Code highlighting."
    link: /ecosystem/overview
  - title: Static by design
    icon: ●
    details: No JavaScript, no control flow, no includes. A template is one file that compiles to one HTML string, with a source map.
    link: /guide/introduction
---

<div class="home-extra">
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

zamn compiles to plain HTML (shown formatted here; the compiler writes it on one
line), so it works anywhere HTML does: a static page, an email
template, or the `<template>` of a Vue component. Directives such as `:class` and
`@click` go through untouched, and `= expr` becomes `{{ expr }}`.

[Read the introduction](/guide/introduction) or [try it in the playground](/playground).

</div>
