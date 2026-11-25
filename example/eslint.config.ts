import { globalIgnores } from "eslint/config"
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript"
import pluginVue from "eslint-plugin-vue"
import pluginVueZamn from "eslint-plugin-vue-zamn"
import skipFormatting from "eslint-config-prettier/flat"

export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{vue,ts,mts,tsx}"],
  },

  globalIgnores(["**/dist/**", "**/dist-ssr/**", "**/coverage/**"]),

  ...pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,

  // Lets the rules above read <template lang="zamn">, turns off the ones
  // that only make sense for HTML, and reports zamn's own syntax errors.
  ...pluginVueZamn.configs.recommended,
  {
    name: "app/zamn-rules",
    files: ["**/*.vue"],
    rules: {
      "vue-zamn/component-name-in-template-casing": ["error", "kebab-case"],
    },
  },

  // Formatting is Prettier's job. This also turns off the rules about how
  // HTML is laid out, which mean nothing in a zamn template.
  skipFormatting,
)
