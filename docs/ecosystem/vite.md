# Vite and Vue

`@vitejs/plugin-vue` compiles `<template lang="...">` with a preprocessor it asks you
for by name. Give it zamn:

```sh
bun add -d zamn
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { compile } from "zamn";

// What Vue's compiler asks of a template preprocessor: the template in, HTML
// out through a callback.
const zamn = {
  render(
    source: string,
    options: { filename: string },
    done: (error: unknown, html?: string) => void,
  ) {
    try {
      done(null, compile(source, { filename: options.filename, doctype: "html" }).code);
    } catch (error) {
      done(error);
    }
  },
};

export default defineConfig({
  plugins: [
    vue({
      template: {
        // Compiles <template lang="zamn">.
        preprocessCustomRequire: (lang) => (lang === "zamn" ? zamn : undefined),
      },
    }),
  ],
});
```

Now any component can use it:

```vue
<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<template lang="zamn">
button.counter(type="button" @click="count++") {
  | Count:
  |
  = count
}
</template>
```

## Why `doctype: "html"`

Without a doctype, zamn writes boolean attributes as `disabled="disabled"` and void
elements as `<br/>`, which is valid everywhere. A Vue template is a piece of an HTML
page, so `doctype: "html"` makes zamn write `disabled` and `<br>` instead: the same
template you would have written by hand in HTML. See
[Doctypes](../guide/syntax/doctypes#assumed-doctype).

## Errors

`compile` throws a [`ZamnError`](../reference/api#zamnerror) with `id` and `loc`
set, which is what Vite prints, so the overlay points at the file and line of the
first problem. Its message lists how many more there are.

## Without Vue

For plain HTML pages, call [`compile`](../reference/api#compile) from your build
script, or use the [CLI](../reference/cli).
