// The syntax errors of a zamn template.
import type { Rule } from "eslint";
import { messages, report } from "./diagnostics.js";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: 'disallow syntax errors in `<template lang="zamn">`',
    },
    schema: [],
    messages,
  },
  create(context) {
    return report(context, (error) => error.severity === "error");
  },
};

export default rule;
