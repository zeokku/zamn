// vue/component-name-in-template-casing, for zamn templates.
//
// What is a component, which names are checked and what the right casing is
// are all left to Vue's rule, which runs here unchanged. Only its fix is
// replaced: it writes `<Name` over the start of the tag and `</Name` over
// the end tag, and in zamn the tag is the name alone and nothing repeats it.
import vue from "eslint-plugin-vue";

const base = vue.rules["component-name-in-template-casing"];

/** Whether the file's `<template>` is written in zamn. */
function isZamn(context) {
  const template = context.sourceCode.ast.templateBody;
  return !!template?.startTag.attributes.some(
    (attr) => !attr.directive && attr.key.name === "lang" && attr.value?.value === "zamn",
  );
}

export default {
  meta: {
    ...base.meta,
    docs: {
      description: "enforce specific casing for the component naming style in template, zamn templates included",
    },
  },
  create(context) {
    if (!isZamn(context)) return base.create(context);

    const report = (descriptor) => {
      const tag = descriptor.node;
      context.report({
        ...descriptor,
        fix(fixer) {
          // The first thing Vue's fix writes is `<` and the name it wants.
          const [open] = descriptor.fix({ replaceText: (_token, text) => text });
          // An element without a tag (`.class`) is a div, and never reported.
          if (tag?.type !== "ZamnTag" || !open?.startsWith("<")) return null;
          return fixer.replaceText(tag, open.slice(1));
        },
      });
    };
    return base.create(Object.create(context, { report: { value: report } }));
  },
};
