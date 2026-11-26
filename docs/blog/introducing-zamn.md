---
title: Introducing zamn
date: 2026-11-21
description: A static way to write HTML that people can read and agents can write cheaply, with the Vue tooling to go with it.
---

# Introducing zamn

HTML is a fine format for browsers and a tiring one for people. Half of every
template is closing tags, and the structure you care about is buried in angle
brackets. zamn is a small, static syntax for the same markup:

```zamn
.card(:class="{ active: isActive }") {
  h2.title= item.title
  p(v-if="item.body")= item.body
  my-button(@click="select(item)") Select
}
```

```html format
<div class="card" :class="{ active: isActive }">
  <h2 class="title">{{ item.title }}</h2>
  <p v-if="item.body">{{ item.body }}</p>
  <my-button @click="select(item)">Select</my-button>
</div>
```

## Static, on purpose

zamn has no JavaScript, no control flow, no includes and no mixins. A template is
one file that compiles to one string of HTML. Logic belongs to your framework, and
in a Vue template that's where it already is: `v-if`, `v-for`, `:bindings` and
`@events` pass through untouched.

Because nothing in a template runs, everything around it can read it: the compiler
reports every problem in one pass, with a hint, and tools work on the syntax tree
directly.

## The toolchain

A template language is only as good as the editor and the build around it. zamn
comes with:

- **a compiler** in Rust, published to npm as WebAssembly, with source maps;
- **Vite** support through `@vitejs/plugin-vue`'s template preprocessors;
- **type checking** with `vue-tsc` and the Vue - Official extension, through
  `vue-language-plugin-zamn`: completion, hover and rename work in templates;
- **ESLint**, through `eslint-plugin-vue-zamn`, which makes eslint-plugin-vue's
  rules work on zamn and reports zamn's own errors;
- **Prettier**, through `prettier-plugin-zamn`;
- **VS Code** highlighting, in `.zamn` files and in Vue components.

The [ecosystem guide](/ecosystem/overview) sets all of it up in a few minutes.

## Fewer tokens

More and more templates are written by coding agents, and every token an agent writes costs time and money. We measured six realistic pages: a page of zamn is a fifth to a third fewer tokens than the HTML Claude writes for it.

That doesn't make a chat cheaper yet. Claude has to read zamn's rules before it writes any, and it thinks longer before writing a language it knows only from them. With the [Claude Code skill](/ai/skill) and its hook, a chat that writes a page and edits it six times costs around 6% more in zamn than in HTML, and in 140 chats Claude never left a zamn file that didn't compile. How a dozen setups got there is in [Engineering the zamn Claude Code skill for efficiency](/blog/engineering-zamn-claude-code-skill-for-efficiency). For other agents, the [AI agents section](/ai/) has the same [rules](/ai/rules).

## Try it

Open the [playground](/playground), or start with the [guide](/guide/getting-started).
