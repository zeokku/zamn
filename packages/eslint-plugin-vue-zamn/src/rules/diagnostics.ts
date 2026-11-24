// The diagnostics of a zamn template, as reports.
//
// The tokenizer hands zamn's diagnostics to vue-eslint-parser with a code
// that starts with `zamn/`, and their severity. vue/no-parsing-error skips
// codes it does not know, and goes on reporting what it does: errors in
// expressions.
import type { Rule } from "eslint";
import type { AST } from "vue-eslint-parser";
import type { ZamnParseError } from "vue-eslint-parser-template-tokenizer-zamn";

export const messages = {
  diagnostic: "{{message}}.",
  diagnosticWithHint: "{{message}}: {{hint}}.",
};

const withoutPeriod = (text: string) => text.replace(/\.$/, "");

function isZamn(error: unknown): error is ZamnParseError {
  const { code } = error as { code?: unknown };
  return typeof code === "string" && code.startsWith("zamn/");
}

/** Reports the diagnostics of the template that `which` picks. */
export function report(
  context: Rule.RuleContext,
  which: (error: ZamnParseError) => boolean,
): Rule.RuleListener {
  return {
    Program(program) {
      const { templateBody } = program as unknown as AST.ESLintProgram;
      // vue-eslint-parser's own errors are there too.
      const errors: unknown[] = templateBody?.errors ?? [];
      for (const error of errors) {
        if (!isZamn(error) || !which(error)) continue;
        context.report({
          loc: error.loc,
          messageId: error.hint ? "diagnosticWithHint" : "diagnostic",
          data: {
            message: withoutPeriod(error.message),
            hint: error.hint ? withoutPeriod(error.hint) : "",
          },
        });
      }
    },
  };
}
