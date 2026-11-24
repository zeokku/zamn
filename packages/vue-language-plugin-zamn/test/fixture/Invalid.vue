<script setup lang="ts">
import Card from "./Card.vue";

const count = 1;
const pick = (id: string) => id;
</script>

<template lang="zamn">
div {
  Card(:title="count" @select="pick")
  p= missing
  p {{ count.oops }}
  Card
  Card(title=x :count={ n: count })
  p a { brace
  <b>raw HTML</b>
  p #[b old] {{ count.nope }}
    p misleading
}
</template>
