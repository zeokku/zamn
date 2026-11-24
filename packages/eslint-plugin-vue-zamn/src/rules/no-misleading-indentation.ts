// Lines of a zamn template indented as if they were nested.
//
// Indentation means nothing in zamn: only `{ }` nests. A statement indented
// deeper than the one before it, which left no block open, is a sibling of
// it, and zamn warns about it (MISLEADING_INDENTATION).
import type { Rule } from "eslint";
import { messages, report } from "./diagnostics.js";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'disallow lines in `<template lang="zamn">` indented as if they were children, without `{ }`',
    },
    schema: [],
    messages,
  },
  create(context) {
    return report(context, (error) => error.code === "zamn/MISLEADING_INDENTATION");
  },
};

export default rule;
