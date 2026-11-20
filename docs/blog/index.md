---
title: Blog
---

<script setup>
import { withBase } from "vitepress";
import { data as posts } from "./posts.data.ts";

const date = (d) =>
  new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
</script>

# Blog

<div v-for="post in posts" :key="post.url" class="post-item">
  <h2><a :href="withBase(post.url)">{{ post.frontmatter.title }}</a></h2>
  <p class="post-date">{{ date(post.frontmatter.date) }}</p>
  <p>{{ post.frontmatter.description }}</p>
</div>

<style scoped>
.post-item h2 {
  margin-top: 32px;
}
.post-date {
  color: var(--vp-c-text-2);
  font-size: 0.9em;
  margin-top: 4px;
}
</style>
