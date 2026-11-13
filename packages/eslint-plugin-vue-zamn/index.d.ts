import type { ESLint, Linter, Rule } from "eslint";

declare const plugin: ESLint.Plugin & {
  rules: {
    "component-name-in-template-casing": Rule.RuleModule;
    "no-parsing-error": Rule.RuleModule;
  };
  configs: {
    /**
     * Sets up the tokenizer for `<template lang="zamn">`, turns off the
     * rules of eslint-plugin-vue that cannot be used on a zamn template, and
     * turns on `vue-zamn/no-parsing-error`. Put it after the configs of
     * eslint-plugin-vue.
     */
    recommended: Linter.Config[];
  };
};

export const meta: NonNullable<ESLint.Plugin["meta"]>;
export const rules: (typeof plugin)["rules"];
export const configs: (typeof plugin)["configs"];
export default plugin;
