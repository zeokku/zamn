<script setup lang="ts">
// Placeholder until the real logo exists.
defineProps<{ size?: "nav" | "hero" }>();
</script>

<template>
  <span class="zamn-logo" :class="size ?? 'nav'">logo</span>
</template>

<style scoped>
.zamn-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--vp-c-text-3);
  border-radius: 999px;
  background: var(--zamn-glass);
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.nav {
  height: 26px;
  padding: 0 10px;
  margin-right: 10px;
  font-size: 10px;
}
.hero {
  width: 280px;
  height: 280px;
  border-radius: 48px;
  font-size: 13px;
}
@media (max-width: 960px) {
  .hero {
    width: 180px;
    height: 180px;
  }
}
</style>
