// https://vitepress.dev/guide/custom-theme
import { h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme-without-fonts";
import CopyOrDownloadAsMarkdownButtons from "vitepress-plugin-llms/vitepress-components/CopyOrDownloadAsMarkdownButtons.vue";
import Logo from "./Logo.vue";
import HomeExample from "../../parts/home-example.md";
import Playground from "./Playground.vue";
import "@fontsource-variable/geist-mono";
import "@fontsource/aileron/400.css";
import "@fontsource/aileron/400-italic.css";
import "@fontsource/aileron/600.css";
import "@fontsource/aileron/700.css";
import "@fontsource/aileron/800.css";
import "@fontsource/redaction-50/400.css";
import "./style.css";
import "./extra.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      "nav-bar-title-before": () => h(Logo, { size: "nav" }),
      "home-hero-image": () => h(Logo, { size: "hero" }),
      // "Write this / Get this" goes between the hero and the features; the
      // page's own Markdown (the cheatsheet) comes after the features.
      "home-features-before": () => h("div", { class: "vp-doc home-extra home-example" }, [h(HomeExample)]),
    }),
  enhanceApp({ app }) {
    app.component("CopyOrDownloadAsMarkdownButtons", CopyOrDownloadAsMarkdownButtons);
    app.component("Playground", Playground);
  },
} satisfies Theme;
