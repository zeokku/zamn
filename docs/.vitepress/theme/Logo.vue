<script setup lang="ts">
// The logo, `.z{}`, cropped tight, 512px wide: AVIF, else WebP, else PNG.
import avif from "../../../assets/logo/zamn-logo-512.avif";
import webp from "../../../assets/logo/zamn-logo-512.webp";
import png from "../../../assets/logo/zamn-logo-512.png";

defineProps<{ size?: "nav" | "hero" }>();
</script>

<template>
  <picture>
    <source :srcset="avif" type="image/avif" />
    <source :srcset="webp" type="image/webp" />
    <img :src="png" alt="zamn" :class="size ?? 'nav'" />
  </picture>
</template>

<style scoped>
.nav {
  height: 18px;
  margin-right: 10px;
}

/* In the flow of the hero's image column (see style.css), not in VitePress's
   absolutely positioned `.image-src`. 12rem, 16rem and 20rem wide at
   VitePress's own breakpoints. */
.hero {
  display: block;
  width: 12rem;
  max-width: 100%;
  height: auto;
  /* It blooms in the brand colours. drop-shadow follows the mark's shape,
     where a box-shadow would light up its rectangle. Kept tight: a wide one
     (50px and more) left a visible ring where it faded out. */
  filter: drop-shadow(0 0 6px rgb(var(--zamn-rgb-accent) / 0.45))
    drop-shadow(0 0 18px rgb(var(--zamn-rgb-fg) / 0.35));
}
:global(.dark) .hero {
  filter: drop-shadow(0 0 6px rgb(var(--zamn-rgb-accent) / 0.75))
    drop-shadow(0 0 18px rgb(var(--zamn-rgb-accent-light) / 0.4));
}
@media (min-width: 640px) {
  .hero {
    width: 16rem;
  }
}
@media (min-width: 960px) {
  .hero {
    width: 20rem;
  }
}
</style>
