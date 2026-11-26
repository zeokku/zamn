// What the rules need to know about the template of a file.
import type { Rule } from "eslint";
import type { AST } from "vue-eslint-parser";

/** Whether the file's `<template>` is written in zamn. */
export function isZamn(context: Rule.RuleContext) {
  const template = (context.sourceCode.ast as unknown as AST.ESLintProgram).templateBody;
  return !!template?.startTag.attributes.some(
    (attr) => !attr.directive && attr.key.name === "lang" && attr.value?.value === "zamn",
  );
}
