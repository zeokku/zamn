// The syntax errors of a zamn template.
//
// The tokenizer hands zamn's diagnostics to vue-eslint-parser with a code
// that starts with `zamn/`. vue/no-parsing-error skips codes it does not
// know, and goes on reporting what it does: errors in expressions.

export default {
  meta: {
    type: "problem",
    docs: {
      description: 'disallow syntax errors in `<template lang="zamn">`',
    },
    schema: [],
    messages: {
      error: "{{message}}.",
      errorWithHint: "{{message}}: {{hint}}.",
    },
  },
  create(context) {
    const withoutPeriod = (text) => text.replace(/\.$/, "");
    return {
      Program(program) {
        for (const error of program.templateBody?.errors ?? []) {
          if (typeof error.code !== "string" || !error.code.startsWith("zamn/")) continue;
          context.report({
            loc: error.loc,
            messageId: error.hint ? "errorWithHint" : "error",
            data: {
              message: withoutPeriod(error.message),
              hint: error.hint ? withoutPeriod(error.hint) : "",
            },
          });
        }
      },
    };
  },
};
