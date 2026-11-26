// ESLint plugin for zamn templates in Vue single-file components.
import { fileURLToPath } from "node:url";
import type { ESLint, Linter, Rule } from "eslint";
import componentNameInTemplateCasing from "./rules/component-name-in-template-casing.js";
import noMisleadingIndentation from "./rules/no-misleading-indentation.js";
import noParsingError from "./rules/no-parsing-error.js";
import preferShorthand from "./rules/prefer-shorthand.js";

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
  "vue/html-self-closing",
  // Their fixes re-indent, or break lines, as in HTML. A line break ends a
  // statement in zamn, and the layout is prettier-plugin-zamn's.
  "vue/html-indent",
  "vue/multiline-html-element-content-newline",
  "vue/singleline-html-element-content-newline",
  "vue/padding-line-between-tags",
  // A bare value (`n=1`) is not a string to put in quotes, and the `&quot;`
  // its fix writes is escaped again by zamn.
  "vue/html-quotes",
  // What prettier-plugin-zamn decides.
  "vue/max-attributes-per-line",
  "vue/first-attribute-linebreak",
  // About `>`, `/>` and end tags, which zamn does not have.
  "vue/html-end-tags",
  "vue/html-closing-bracket-newline",
  "vue/html-closing-bracket-spacing",
];

export interface Plugin extends ESLint.Plugin {
  meta: { name: string; version: string };
  rules: {
    "component-name-in-template-casing": Rule.RuleModule;
    "no-misleading-indentation": Rule.RuleModule;
    "no-parsing-error": Rule.RuleModule;
    "prefer-shorthand": Rule.RuleModule;
  };
  configs: {
    /**
     * Sets up the tokenizer for `<template lang="zamn">`, turns off the
     * rules of eslint-plugin-vue that cannot be used on a zamn template, and
     * turns on `vue-zamn/no-parsing-error`,
     * `vue-zamn/no-misleading-indentation` and `vue-zamn/prefer-shorthand`.
     * Put it after the configs of eslint-plugin-vue.
     */
    recommended: Linter.Config[];
  };
}

const plugin: Plugin = {
  meta: { name: "eslint-plugin-vue-zamn", version: "0.1.0" },
  rules: {
    "component-name-in-template-casing": componentNameInTemplateCasing,
    "no-misleading-indentation": noMisleadingIndentation,
    "no-parsing-error": noParsingError,
    "prefer-shorthand": preferShorthand,
  },
  configs: { recommended: [] },
};

plugin.configs.recommended.push({
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
    "vue-zamn/no-misleading-indentation": "warn",
    "vue-zamn/prefer-shorthand": "warn",
  },
});

export const { meta, rules, configs } = plugin;
export default plugin;
