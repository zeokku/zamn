// Vue language tools (Volar) plugin for `<template lang="zamn">`.
//
// The template is turned into HTML, Vue's own compiler parses that, and every
// offset in the resulting AST is moved back onto the zamn source. From there
// on Vue treats the template like any other: type checking, completion,
// navigation and renaming all work on the zamn text.
import type { VueLanguagePlugin, VueLanguagePluginReturn } from "@vue/language-core";
import type { Diagnostic } from "zamn";
import { toHtml, toSourceOffset } from "./html.js";

// Vue's compiler types come from @vue/compiler-dom, which is a dependency of
// @vue/language-core rather than of this package, so they are taken from the
// plugin interface.
type CompileSFCTemplate = NonNullable<VueLanguagePluginReturn["compileSFCTemplate"]>;
type CompilerOptions = Parameters<CompileSFCTemplate>[2];
type CompilerError = Parameters<NonNullable<CompilerOptions["onError"]>>[0];

const LANG = "zamn";
// Vue's "duplicate attribute" error.
const DUPLICATE_ATTRIBUTE = 2;

/** A zamn diagnostic as a Vue compiler error, at its place in the template. */
function toCompilerError(d: Diagnostic, template: string): CompilerError {
  const error = new SyntaxError(d.hint ? `${d.message} (${d.hint})` : d.message);
  const position = ({ offset, line, column }: Diagnostic["loc"]["start"]) => ({
    offset,
    line,
    // Vue's columns are 1-based.
    column: column + 1,
  });
  return Object.assign(error, {
    // Vue's own codes are numbers; zamn's are names, such as `UNCLOSED_BRACE`.
    code: d.code as unknown as number,
    loc: {
      start: position(d.loc.start),
      end: position(d.loc.end),
      source: template.slice(...d.range),
    },
  });
}

const plugin: VueLanguagePlugin = ({ modules }) => {
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

      // Vue's language service shows what reaches `onError` as errors and
      // what reaches `onWarn` as warnings.
      for (const d of diagnostics) {
        const report = d.severity === "error" ? options.onError : options.onWarn;
        report?.(toCompilerError(d, template));
      }

      // Vue's errors share their locations with the AST, so each position
      // is moved once. A position that is an `end` is where something stops,
      // so it maps to the end of what comes before it.
      const moved = new WeakSet<object>();
      const move = (position: { offset: number }, side: "start" | "end") => {
        if (moved.has(position)) return;
        moved.add(position);
        position.offset = toSourceOffset(segments, position.offset, side);
      };
      const relocate = (handler: ((error: CompilerError) => void) | undefined) =>
        (error: CompilerError) => {
          if (error.loc) {
            move(error.loc.start, "start");
            move(error.loc.end, "end");
          }
          handler?.(error);
        };
      const onError = relocate(options.onError);
      const compilerOptions: CompilerOptions = {
        ...options,
        onWarn: relocate(options.onWarn),
        onError(error) {
          // `.a.b` and `.a(class="b")` are several class attributes here.
          const duplicateClass =
            error.code === DUPLICATE_ATTRIBUTE &&
            /^class\s*=/.test(html.slice(error.loc?.start.offset));
          if (!duplicateClass) onError(error);
        },
      };

      const ast = core.compileTemplate(html, compilerOptions);

      // Every location in the AST is `{ offset, line, column }`; Vue only
      // reads the offsets.
      const seen = new Set<object>();
      (function visit(object: object) {
        for (const [key, value] of Object.entries(object)) {
          if (!value || typeof value !== "object" || seen.has(value)) continue;
          seen.add(value);
          if (typeof value.offset === "number") move(value, key === "end" ? "end" : "start");
          visit(value);
        }
      })(ast);

      return { ast, code: "", preamble: "" };
    },
  };
};

export default plugin;
// Vue's language tools load plugins with `require()` and call what they get.
export { plugin as "module.exports" };
