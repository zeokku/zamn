---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: ".zamn"
  text: 'HTML without the <span class="angle"><span class="punct bracket">&lt;</span>angle brackets<span class="punct bracket">&gt;</span></span>'
  tagline: A new, modern and fast way to write HTML with <code>{ }</code> blocks instead of closing tags. Easy to read, quick to write, and with AI coding agent support for code generation.
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
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.75 5.25a.747.747 0 0 0-.53.22.747.747 0 0 0 0 1.06c.14.141.331.22.53.22h16.5c.199 0 .39-.079.53-.22a.747.747 0 0 0 0-1.06.747.747 0 0 0-.53-.22H3.75Zm0 6a.747.747 0 0 0-.53.22.747.747 0 0 0 0 1.06c.14.141.331.22.53.22h16.5c.199 0 .39-.079.53-.22a.747.747 0 0 0 0-1.06.747.747 0 0 0-.53-.22H3.75Zm0 6a.747.747 0 0 0-.53.22.747.747 0 0 0 0 1.06c.14.141.331.22.53.22h5.5c.199 0 .39-.079.53-.22a.747.747 0 0 0 0-1.06.747.747 0 0 0-.53-.22h-5.5Z"/></svg>'
    details: "No redundant code: classes and ids as <code>.class</code> and <code>#id</code> shorthands, no closing tags, and children in <code>{ }</code> blocks."
    link: /guide/syntax/elements
  - title: Fast
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.716 1.329a1.341 1.341 0 0 1 2.109 1.55L15.147 9h4.161c1.623 0 2.372 2.016 1.143 3.075L8.102 22.721a1.148 1.148 0 0 1-1.81-1.317L8.996 15H4.674c-1.619 0-2.37-2.008-1.148-3.07l12.19-10.6Zm.452 1.595L4.51 13.061a.25.25 0 0 0 .164.439h5.45a.749.749 0 0 1 .692 1.041l-2.559 6.066 11.215-9.668a.25.25 0 0 0-.164-.439H14a.75.75 0 0 1-.687-1.05Z"/></svg>'
    details: Written in Rust and run as WebAssembly, for top performance compared to parsers and tools in pure JavaScript.
    link: /reference/rust
  - title: Agents ready
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.5 13.919v-.278a5.097 5.097 0 0 0-4.961-5.086.858.858 0 0 1-.754-.497l-.149-.327A6.414 6.414 0 0 0 10.81 4a6.133 6.133 0 0 0-6.13 6.32l.019.628a.863.863 0 0 1-.67.869A3.263 3.263 0 0 0 1.5 14.996v.108A3.397 3.397 0 0 0 4.896 18.5h1.577a.75.75 0 0 1 0 1.5H4.896A4.896 4.896 0 0 1 0 15.104v-.108a4.761 4.761 0 0 1 3.185-4.493l-.004-.137A7.633 7.633 0 0 1 10.81 2.5a7.911 7.911 0 0 1 7.176 4.58C21.36 7.377 24 10.207 24 13.641v.278a.75.75 0 0 1-1.5 0Z"/><path d="m12.306 11.77 3.374 3.375a.749.749 0 0 1 0 1.061l-3.375 3.375-.057.051a.751.751 0 0 1-1.004-.051.751.751 0 0 1-.051-1.004l.051-.057 2.845-2.845-2.844-2.844a.75.75 0 1 1 1.061-1.061ZM22.5 19.8H18a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 0 1.5Z"/></svg>'
    details: "Comes with a fine-tuned Claude Code skill, rules for any agent, <code>llms.txt</code>, and <code>zamn --validate</code> with hints agents act on. And thanks to clean syntax it consumes less input/output tokens."
    link: /ai/
  - title: First-class Vue
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 1.61h-9.94L12 5.16L9.94 1.61H0l12 20.78ZM12 14.08L5.16 2.23h4.43L12 6.41l2.41-4.18h4.43Z"/></svg>'
    details: '<code>&lt;template lang="zamn"&gt;</code> with Vite, vue-tsc type checking, ESLint, Prettier and VS Code highlighting.'
    link: /ecosystem/overview
---

<div class="home-extra home-cheatsheet">

## Cheatsheet {#cheatsheet}

| Write                                    | Get                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `div`, `button`, `.card`, `#app`         | an element; without a tag it is implicitly a `div`                                           |
| `a.link#home(href=/) Home`               | classes, ids and attributes follow the tag, text after a space                               |
| `a(href="/" target=_blank)`              | attributes; quote a value with spaces, commas or brackets                                    |
| `input(disabled checked=false)`          | `true` or no value is a boolean attribute; `false` drops it                                  |
| `style={fontSize: 12px}`                 | `style="font-size:12px;"`                                                                    |
| `:class={ active: on }`, `@click="go()"` | bindings and events, as written; binded JS values like `{ ... }` and `[...]` may omit quotes |
| `ul { li One }`                          | children go in `{ }`, the only way to nest                                                   |
| `li: a(href=/) Home`                     | one child on the same line                                                                   |
| `ul { li { b x } li { b y } }`           | blocks on one line                                                                           |
| `\| text`, `\|`                          | a statement of text; a bare `\|` is one space                                                |
| `\|{ … }`                                | text over several lines, line breaks kept, useful with `pre` or when writing inline template |
| `p Read #{a(href=/docs) the docs}.`      | an element inside text                                                                       |
| `h1= title`, `h1 {{ title }}`            | `{{ title }}` for your framework                                                             |
| `\{`, `\}`                               | escape braces in text                                                                        |
| `script` … `/script`                     | raw content, not parsed or escaped; same for `style`                                         |
| `// note`, `/* … */`                     | comments, left out of the HTML                                                               |
| `//! note`, `/*! … */`                   | HTML comments                                                                                |
| `doctype html`                           | `<!DOCTYPE html>`                                                                            |

```zamn
article.post {
  h2.title= post.title
  p Read #{a(href=/docs) the docs} first.
  ul.tags {
    li(v-for="tag in post.tags" :key=tag)= tag
  }
  button(@click="like(post)" :disabled=busy) Like
}
```

### Reminders

- Text runs to the end of its line or to the `}` that closes its block: `p { b bold i italic }` is one `b` with text "bold i italic". Put the next child on a new line, or after the `}`: `p { b { | bold } i italic }`.
- Indentation means nothing. Nest with `{ }`, and let [Prettier](/ecosystem/prettier) indent.
- Quote a value containing spaces, commas or brackets: `title="Page title"`, `v-for="(item, i) in items"`.
- Text is escaped: tags in text show as text. Write nested elements as `#{b bold}`.
- Logic belongs to your framework: `v-if`, `v-for`, components.
- Check with `zamn --validate`, then format with `prettier --write`.
- Give your agent the [skill or the rules](/ai/).

</div>
