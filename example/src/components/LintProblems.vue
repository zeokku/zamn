<script setup lang="ts">
// Nothing here is right, on purpose: open this file in the editor to see
// ESLint and the Vue language tools report problems inside a zamn template.
// It is not used by the app. Delete it to make `bun run lint` and
// `bun run type-check` pass again.
import { ref } from 'vue'
import HelloWorld from './HelloWorld.vue'

const items = ref([
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
])
const count = ref(0)
const html = ref('<b>bold</b>')
const increment = (by: number) => (count.value += by)
// ESLint: assigned but never used. Using it in the template would fix it.
const unused = 1
</script>

<template lang="zamn">
section {
  //- ESLint: no :key (vue/valid-v-for), `index` is never used (vue/no-unused-vars)
  HelloWorld(v-for='(item, index) in items' :msg='item.name')

  //- ESLint: v-if on the same element as v-for (vue/no-use-v-if-with-v-for)
  ul
    li(v-for='item in items' v-if='item.id > 1' :key='item.id')= item.name

  //- ESLint: v-else and v-else-if together (vue/valid-v-else), `this` (vue/this-in-template)
  p(v-if='count') {{ this.count }}
  p(v-else-if='items' v-else) none

  //- ESLint: v-html (vue/no-v-html), attribute order (vue/attributes-order)
  div(v-html='html' id='raw')

  //- TypeScript: a number where `msg` wants a string
  HelloWorld(:msg='count')

  //- TypeScript: `msg` is required
  HelloWorld

  //- TypeScript: no such property, in `tag= expr` and in `{{ }}`
  p= items[0]?.nmae
  p Total: {{ count.toFixd(2) }}

  //- TypeScript: a string where `increment` wants a number
  button(@click="increment('one')") Add

  //- zamn: there is no control flow, so both tools report a syntax error
  each item in items
}
</template>
