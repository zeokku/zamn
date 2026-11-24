# vue-language-plugin-zamn

[Vue language tools](https://github.com/vuejs/language-tools) (Volar) plugin for
[zamn](../../README.md) templates in single-file components. With it,
`<template lang="zamn">` is type checked by `vue-tsc` and gets completion,
hover, go to definition and rename in the editor, like an HTML template.

```sh
bun add -d vue-language-plugin-zamn
```

```jsonc
// tsconfig.json
{
  "vueCompilerOptions": {
    "plugins": ["vue-language-plugin-zamn"]
  }
}
```

```vue
<script setup lang="ts">
defineProps<{ items: { id: number; name: string }[] }>();
</script>

<template lang="zamn">
ul.list {
  li(v-for="item in items" :key="item.id")= item.nmae
}
</template>
```

```
List.vue(7,50): error TS2339: Property 'nmae' does not exist on type '{ id: number; name: string; }'.
```

Needs `@vue/language-core` 3.3 (Vue - Official and `vue-tsc` 3.3) or later, and
Node 22.12 or later: the package is ESM, and the language tools load plugins
with `require()`. This plugin only teaches the language tools to read the
template; compiling it in your build is up to the bundler.

## How it works

The template is turned into HTML, Vue's compiler parses that, and every offset
in the result is moved back onto the zamn source. The HTML is not what
`compile()` produces: it is built from `parse()`, so a template with errors
still gets checked where it can be read, and source text is copied without
changing its length so positions inside expressions stay exact.

zamn's own diagnostics are reported as template errors, and its warnings (`MISLEADING_INDENTATION`) as template warnings. The editor shows both; `vue-tsc` reports type errors only, as it does for HTML templates.

Vue's directive comments, such as `@vue-generic {T}` or `@vue-expect-error`, must reach Vue's compiler, so write them as `//!` comments (which become HTML comments), not `//`.

## Limits

- An implicit `div` (`.card`, `#app`) has no tag name to point at. Its classes
  and ids map to where they are written.
- In an attribute value written with string escapes (`title="it\'s"`),
  positions are only exact at the start of the value.
