/// <reference types="prettier-plugin-zamn" />
import type { Config } from "prettier"

export default {
  semi: false,
  singleQuote: false,
  printWidth: 100,
  // Formats <template lang="zamn">.
  plugins: ["prettier-plugin-zamn"],
  // 'braces' (the default) or 'preserve', which keeps indentation where it is written
  zamnBlockStyle: "braces",
  // 'space' (the default) or 'comma': a(href="/", target="_blank")
  zamnAttributeSeparator: "space",
} satisfies Config
