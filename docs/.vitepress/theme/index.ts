// https://vitepress.dev/guide/custom-theme
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import CopyOrDownloadAsMarkdownButtons from "vitepress-plugin-llms/vitepress-components/CopyOrDownloadAsMarkdownButtons.vue";
import Playground from "./Playground.vue";
import "./style.css";
import "./extra.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("CopyOrDownloadAsMarkdownButtons", CopyOrDownloadAsMarkdownButtons);
    app.component("Playground", Playground);
  },
} satisfies Theme;
