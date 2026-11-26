<script setup lang="ts">
// The logo, `.z{}`, cropped tight, 512px wide: assets/logo/zamn-logo-512.png.
import logo from "../../../assets/logo/zamn-logo-512.png";

defineProps<{ size?: "nav" | "hero" }>();
</script>

<template>
  <!-- In the hero, VitePress's own `.image-src` styles centre and size it. -->
  <img :src="logo" alt="zamn" :class="size === 'hero' ? 'image-src' : 'nav'" />
</template>

<style scoped>
.nav {
  height: 18px;
  margin-right: 10px;
}
</style>
