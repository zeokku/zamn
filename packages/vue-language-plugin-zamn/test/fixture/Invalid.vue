<script setup lang="ts">
import Card from "./Card.vue";

const count = 1;
const pick = (id: string) => id;
</script>

<template lang="zamn">
div
  Card(:title="count" @select="pick")
  p= missing
  p {{ count.oops }}
  Card
  Card(title=x :count={ n: count })
</template>
