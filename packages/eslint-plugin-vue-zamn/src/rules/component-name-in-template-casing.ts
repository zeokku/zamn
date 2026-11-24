// vue/component-name-in-template-casing, for zamn templates.
//
// What is a component, which names are checked and what the right casing is
// are all left to Vue's rule, which runs here unchanged. Only its fix is
// replaced: it writes `<Name` over the start of the tag and `</Name` over
// the end tag, and in zamn the tag is the name alone and nothing repeats it.
import type { Rule } from "eslint";
import vue from "eslint-plugin-vue";
import type { AST } from "vue-eslint-parser";

const base: Rule.RuleModule = vue.rules["component-name-in-template-casing"];

/** Whether the file's `<template>` is written in zamn. */
function isZamn(context: Rule.RuleContext) {
  const template = (context.sourceCode.ast as unknown as AST.ESLintProgram).templateBody;
  return !!template?.startTag.attributes.some(
    (attr) => !attr.directive && attr.key.name === "lang" && attr.value?.value === "zamn",
  );
}

/** What Vue's fix writes, without a fixer to write it with. */
const recorder = { replaceText: (_token: unknown, text: string) => text } as unknown as Rule.RuleFixer;

const rule: Rule.RuleModule = {
  meta: {
    ...base.meta,
    docs: {
      description:
        "enforce specific casing for the component naming style in template, zamn templates included",
    },
  },
  create(context) {
    if (!isZamn(context)) return base.create(context);

    const report = (descriptor: Rule.ReportDescriptor) => {
      const tag = "node" in descriptor ? (descriptor.node as AST.Token | undefined) : undefined;
      context.report({
        ...descriptor,
        fix(fixer) {
          // The first thing Vue's fix writes is `<` and the name it wants.
          const fixes: unknown = descriptor.fix?.(recorder);
          const [open] =
            fixes && typeof fixes === "object" && Symbol.iterator in fixes
              ? [...(fixes as Iterable<unknown>)]
              : [fixes];
          // An element without a tag (`.class`) is a div, and never reported.
          if (tag?.type !== "ZamnTag" || typeof open !== "string" || !open.startsWith("<")) {
            return null;
          }
          return fixer.replaceText(tag as never, open.slice(1));
        },
      });
    };
    return base.create(Object.create(context, { report: { value: report } }));
  },
};

export default rule;
