# Introduction

zamn is a static way to write HTML. A tag is its name, classes and ids are `.class` and `#id`, and an element's children go in a `{ }` block. There are no closing tags, and nothing to keep in sync.

```zamn
article.post#intro {
  h2.title Hello
  p {
    | Written in
    |
    a(href="https://github.com/zeokku/zamn") zamn
    | .
  }
}
```

```html
<article class="post" id="intro"><h2 class="title">Hello</h2><p>Written in <a href="https://github.com/zeokku/zamn">zamn</a>.</p></article>
```

## Static, on purpose

A zamn template is data, not a program:

- **No JavaScript.** Attribute values are strings, quoted or not, as in HTML. Expressions belong to your framework: `p= message` writes `{{ message }}`, and `:title="t"` or `@click="go"` pass through to Vue as they are.
- **No control flow.** No `if`, no loops. Use your framework's directives (`li(v-for="item in items")`).
- **No includes, no inheritance, no mixins.** A template is one file. Compose with components.
- **No raw HTML.** Text is escaped, so `p a < b` shows `a < b`, and elements are written as elements: a line of HTML is an error.

Each of these is reported as an error with a hint, rather than silently ignored. See [Not supported](./syntax/not-supported).

Since there is nothing to run, a template compiles to the same HTML every time, in one pass, with a [source map](../reference/api#compile). Tooling can read it without executing anything: the [Vue language tools](../ecosystem/typescript), [ESLint](../ecosystem/eslint) and [Prettier](../ecosystem/prettier) all work on zamn templates.

## Why another syntax

- **Less to read.** No `</div>` at the bottom of the screen to match up with the top: a block ends with a `}`, and the indentation inside shows the structure at a glance.
- **One way to nest.** Only braces make children; indentation is for the eye. Code that is indented wrong still means what its braces say, and zamn warns about a line indented like a child when it isn't one.
- **Less to write.** For people, and for coding agents: the same page takes fewer tokens in zamn than in HTML. See [Writing zamn with AI agents](../ai/).
- **Nothing hidden.** What you write is what you get: there's no runtime and no logic in the template.

Its syntax for tags, classes, ids and attributes was inspired by [pug](https://pugjs.org)'s.

## Where to go next

- [Getting started](./getting-started): install it, compile a file.
- [Syntax](./syntax/elements): the whole language, one page per topic.
- [Ecosystem](../ecosystem/overview): Vite, TypeScript, ESLint, Prettier and VS Code for Vue projects.
- [Playground](../playground): try it in the browser.
