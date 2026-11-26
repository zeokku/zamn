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
    icon: ▲
    details: "No redundant code: classes and ids as <code>.class</code> and <code>#id</code> shorthands, no closing tags, and children in <code>{ }</code> blocks."
    link: /guide/syntax/elements
  - title: Fast
    icon: ●
    details: Written in Rust and run as WebAssembly, for top performance compared to parsers and tools in pure JavaScript.
    link: /reference/rust
  - title: Agents ready
    icon: ◆
    details: "Comes with a fine-tuned Claude Code skill, rules for any agent, <code>llms.txt</code>, and <code>zamn --validate</code> with hints agents act on. And thanks to clean syntax it consumes less input/output tokens."
    link: /ai/
  - title: First-class Vue
    icon: ■
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
