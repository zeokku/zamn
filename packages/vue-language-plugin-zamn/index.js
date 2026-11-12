// Vue language tools (Volar) plugin for `<template lang="zamn">`.
//
// The template is turned into HTML, Vue's own compiler parses that, and every
// offset in the resulting AST is moved back onto the zamn source. From there
// on Vue treats the template like any other: type checking, completion,
// navigation and renaming all work on the zamn text.
import { toHtml, toSourceOffset } from "./html.js";

const LANG = "zamn";
// Vue's "duplicate attribute" error.
const DUPLICATE_ATTRIBUTE = 2;

/** @type {import("@vue/language-core").VueLanguagePlugin} */
const plugin = ({ modules }) => {
  const core = modules["@vue/language-core"];

  return {
    name: "vue-language-plugin-zamn",
    version: 2.2,

    getEmbeddedCodes(_fileName, sfc) {
      return sfc.template?.lang === LANG ? [{ id: "template", lang: LANG }] : [];
    },

    resolveEmbeddedCode(_fileName, sfc, embeddedFile) {
      if (embeddedFile.id !== "template" || sfc.template?.lang !== LANG) return;
      embeddedFile.content.push([
        sfc.template.content,
        sfc.template.name,
        0,
        core.codeFeatures.full,
      ]);
    },

    compileSFCTemplate(lang, template, options) {
      if (lang !== LANG) return;
      const { html, segments, diagnostics } = toHtml(template);
      const toSource = (offset) => toSourceOffset(segments, offset);

      for (const d of diagnostics) {
        const error = new SyntaxError(d.hint ? `${d.message} (${d.hint})` : d.message);
        options.onError?.(
          Object.assign(error, {
            code: d.code,
            loc: {
              start: { offset: d.range[0], line: d.loc.start.line, column: d.loc.start.column + 1 },
              end: { offset: d.range[1], line: d.loc.end.line, column: d.loc.end.column + 1 },
              source: template.slice(...d.range),
            },
          }),
        );
      }

      const report = (handler) => (error) => {
        if (error.loc) {
          error.loc.start.offset = toSource(error.loc.start.offset);
          error.loc.end.offset = toSource(error.loc.end.offset);
        }
        handler?.(error);
      };
      const compilerOptions = {
        ...options,
        onWarn: report(options.onWarn),
        onError(error) {
          // `.a.b` and `.a(class="b")` are several class attributes here.
          const duplicateClass =
            error.code === DUPLICATE_ATTRIBUTE &&
            /^class\s*=/.test(html.slice(error.loc?.start.offset));
          if (!duplicateClass) report(options.onError)(error);
        },
      };

      const result = { ast: core.compileTemplate(html, compilerOptions), code: "", preamble: "" };

      // Every location in the AST is `{ offset, line, column }`; Vue only
      // reads the offsets.
      const seen = new Set();
      (function relocate(object) {
        for (const value of Object.values(object)) {
          if (!value || typeof value !== "object" || seen.has(value)) continue;
          seen.add(value);
          if (typeof value.offset === "number") value.offset = toSource(value.offset);
          relocate(value);
        }
      })(result.ast);

      return result;
    },
  };
};

export default plugin;
// Vue's language tools load plugins with `require()` and call what they get.
export { plugin as "module.exports" };
