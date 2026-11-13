// ESLint plugin for zamn templates in Vue single-file components.
import { fileURLToPath } from "node:url";
import componentNameInTemplateCasing from "./rules/component-name-in-template-casing.js";
import noParsingError from "./rules/no-parsing-error.js";

// Given to vue-eslint-parser as a path, not as the class: the parser finds
// it from wherever it is installed, and the config can be serialized, which
// `eslint --cache` needs.
const tokenizer = fileURLToPath(import.meta.resolve("vue-eslint-parser-template-tokenizer-zamn"));

/**
 * Rules of eslint-plugin-vue that cannot be used on a zamn template. ESLint
 * cannot tell templates apart by language, so these are off for every
 * `.vue` file the config applies to.
 */
const off = [
  // Their fixes write HTML into the template.
  "vue/component-name-in-template-casing", // use vue-zamn/component-name-in-template-casing
  "vue/html-indent",
  "vue/html-self-closing",
  "vue/multiline-html-element-content-newline",
  "vue/singleline-html-element-content-newline",
  "vue/padding-line-between-tags",
  // A bare value (`n=1`) is not a string to put in quotes, and the `&quot;`
  // its fix writes is escaped again by zamn.
  "vue/html-quotes",
  // What prettier-plugin-zamn decides (`zamnMaxAttributesPerLine`).
  "vue/max-attributes-per-line",
  "vue/first-attribute-linebreak",
  // About `>`, `/>` and end tags, which zamn does not have.
  "vue/html-end-tags",
  "vue/html-closing-bracket-newline",
  "vue/html-closing-bracket-spacing",
];

const plugin = {
  meta: { name: "eslint-plugin-vue-zamn", version: "0.1.0" },
  rules: {
    "component-name-in-template-casing": componentNameInTemplateCasing,
    "no-parsing-error": noParsingError,
  },
  configs: {},
};

plugin.configs.recommended = [
  {
    name: "vue-zamn/recommended",
    files: ["*.vue", "**/*.vue"],
    plugins: { "vue-zamn": plugin },
    languageOptions: {
      parserOptions: {
        templateTokenizer: { zamn: tokenizer },
      },
    },
    rules: {
      ...Object.fromEntries(off.map((rule) => [rule, "off"])),
      "vue-zamn/no-parsing-error": "error",
    },
  },
];

export const { meta, rules, configs } = plugin;
export default plugin;
