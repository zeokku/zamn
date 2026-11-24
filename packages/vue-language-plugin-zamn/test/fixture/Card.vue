<script setup lang="ts">
defineProps<{ title: string; count?: number }>();
defineEmits<{ select: [id: number] }>();
</script>

<template lang="zamn">
.card {
  h2.title= title
  slot(:row="{ id: 1 }")
}
</template>
