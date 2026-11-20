# TypeScript

`vue-language-plugin-zamn` teaches the [Vue language tools](https://github.com/vuejs/language-tools)
to read zamn templates. With it, `<template lang="zamn">` is type checked by
`vue-tsc`, and the Vue - Official extension gives you completion, hover, go to
definition and rename in it, as in an HTML template.

```sh
bun add -d vue-language-plugin-zamn
```

```jsonc
// tsconfig.json (tsconfig.app.json in a create-vue project)
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

```sh
vue-tsc --noEmit
```

```text
List.vue(7,50): error TS2339: Property 'nmae' does not exist on type '{ id: number; name: string; }'.
```

The error points at the zamn source: line 7 is the `li` line.

This plugin only teaches the language tools to read the template. Building it is up
to [Vite](./vite).

## Requirements

`@vue/language-core` 3.3 or later, which ships with Vue - Official and `vue-tsc` 3.3,
and Node 22.12 or later.

## How it works

The template is turned into HTML that Vue's compiler parses, and every position in
the result is moved back onto the zamn source. That HTML is built from
[`parse`](../reference/api#parse), not from `compile`, so a template with errors
is still checked wherever it can be read, and expressions keep their exact
positions. zamn's own diagnostics are reported as template errors.

## Limits

- An implicit `div` (`.card`, `#app`) has no tag name to point at. Its classes and
  ids map to where they are written.
- In an attribute value written with string escapes (`title="it\'s"`), positions
  are only exact at the start of the value.
