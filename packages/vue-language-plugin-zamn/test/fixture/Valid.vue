<script setup lang="ts">
import { ref } from "vue";
import Card from "./Card.vue";

const items = ref([{ id: 1, name: "one" }]);
const active = ref(false);
const pick = (id: number) => id;
</script>

<template lang="zamn">
main#app.page(:class="{ active: active && items.length > 0 }") {
  // a comment
  Card(
    v-for="item in items"
    :key="item.id"
    :title="item.name"
    :count=1
    @select="pick($event)"
    #default="{ row }"
  ) {
    span {{ row.id }} of #[b= items.length]
  }
  p(v-if="active") On
  p(v-else).
    Off for
    {{ items.length }} items
  input(type="checkbox" v-model="active" disabled=false)
  <footer :title="items[0]?.name">raw {{ active }}</footer>
}
</template>
