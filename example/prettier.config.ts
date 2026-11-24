/// <reference types="prettier-plugin-zamn" />
import type { Config } from "prettier"

export default {
  semi: false,
  singleQuote: false,
  printWidth: 100,
  // Formats <template lang="zamn">.
  plugins: ["prettier-plugin-zamn"],
  // How many attributes fit on the line of a tag (3 is the default). 0: always
  // one per line, -1: as written, false: always on the line of the tag
  zamnMaxAttributesPerLine: 3,
  // 'space' (the default) or 'comma': a(href="/", target="_blank")
  zamnAttributeSeparator: "space",
} satisfies Config
