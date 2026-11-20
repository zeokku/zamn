---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "zamn"
  text: "HTML without the angle brackets"
  tagline: A static, indentation-based way to write HTML. Easy to read, quick to write, and cheap for coding agents to generate.
  image:
    src: /logo.svg
    alt: zamn
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
    details: Tags, classes and ids on one line, nesting by indentation or braces. No closing tags to keep in sync.
    link: /guide/syntax/elements
  - title: Fewer tokens
    icon: ◆
    details: About a third fewer tokens than formatted HTML on realistic pages. Agents write terse zamn, Prettier makes it pretty.
    link: /ai/token-savings
  - title: Vue tooling
    icon: ■
    details: "&lt;template lang=\"zamn\"&gt; with Vite, vue-tsc type checking, ESLint, Prettier and VS Code highlighting."
    link: /ecosystem/overview
  - title: Static by design
    icon: ●
    details: No JavaScript, no control flow, no includes. A template is one file that compiles to one HTML string, with a source map.
    link: /guide/introduction
---

<div class="home-extra">

## Write this

```zamn
nav.top {
  a(href="/") Home
  a(href="/docs" :class="{ active: onDocs }") Docs
  button(@click="toggleTheme")= themeLabel
}
```

## Get this

```html
<nav class="top"><a href="/">Home</a><a href="/docs" :class="{ active: onDocs }">Docs</a><button @click="toggleTheme">{{ themeLabel }}</button></nav>
```

zamn compiles to plain HTML, so it works anywhere HTML does: a static page, an email
template, or the `<template>` of a Vue component. Directives such as `:class` and
`@click` go through untouched, and `= expr` becomes `{{ expr }}`.

[Read the introduction](/guide/introduction) or [try it in the playground](/playground).

</div>
