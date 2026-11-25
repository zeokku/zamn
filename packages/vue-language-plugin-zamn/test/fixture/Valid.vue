<script setup lang="ts">
import { ref } from "vue";
import Card from "./Card.vue";

const items = ref([{ id: 1, name: "one" }]);
const active = ref(false);
const pick = (id: number) => id;
</script>

<template lang="zamn">
main#app.page.md:flex.gap-1.5.w-[42rem](:class="{ active: active && items.length > 0 }") {
  //! a comment in the HTML
  // a comment for the reader, left out of the HTML
  /* a block comment
     over two lines */
  Card(
    v-for="item in items"
    :key="item.id"
    :title="item.name"
    :count=1
    @select="pick($event)"
    #default="{ row }"
  ) {
    span {{ row.id }} of #{b= items.length} & #{i.hover:underline {{ item.name }}}
  }
  p(v-if="active" :class={ on: active, 'is-new': items.length > 1 }) On
  p(v-else): |{
    Off for
    {{ items.length }} items < 2 &amp; more
  }
  input(type="checkbox" v-model="active" disabled=false)
  footer(:title="items[0]?.name" style={ fontSize: '12px', marginTop: 4px }) raw {{ active }}
}
</template>
