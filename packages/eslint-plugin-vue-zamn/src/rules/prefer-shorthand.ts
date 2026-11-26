// `.class` and `#id` instead of `class="..."` and `id="..."` in a zamn
// template.
//
// zamn writes the classes of an element in the order they are written, so
// the fix puts the shorthands where the `(` of the attribute is: `p.a(class="b")`
// becomes `p.a.b`, `p(class="b").a` becomes `p.b.a`. Only values a shorthand
// can hold are reported, which zamn's lexer decides.
import type { Rule } from "eslint";
import type { AST } from "vue-eslint-parser";
import { lex } from "zamn";
import { isZamn } from "../template.js";

type Name = "class" | "id";
const NAMES: Name[] = ["class", "id"];
const MARK: Record<Name, string> = { class: ".", id: "#" };

type Filter = { filter: (token: AST.Token) => boolean };
interface TokenStore {
  getFirstToken(node: AST.HasLocation): AST.Token | null;
  getTokens(node: AST.HasLocation): AST.Token[];
  getTokenBefore(node: AST.HasLocation, options: Filter): AST.Token | null;
  getTokenAfter(node: AST.HasLocation, options: Filter): AST.Token | null;
}
interface ParserServices {
  defineTemplateBodyVisitor(visitor: Record<string, (node: never) => void>): Rule.RuleListener;
  getTemplateBodyTokenStore(): TokenStore;
}

/** Whether `shorthands` are read as themselves, after a tag and before `rest`. */
function lexesAs(shorthands: string[], rest: string) {
  const tokens = lex(`div${shorthands.join("")}${rest}`).tokens.slice(1);
  return shorthands.every(
    (s, i) => tokens[i]?.type === (s[0] === "." ? "Class" : "Id") && tokens[i]!.value === s,
  );
}

const separator = (c: string | undefined) => c !== undefined && /[\s,]/.test(c);

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        'enforce `.class` and `#id` over static `class` and `id` attributes in `<template lang="zamn">`',
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          attributes: {
            type: "array",
            items: { enum: NAMES },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      shorthand: "Write `{{shorthand}}` instead of the `{{name}}` attribute.",
    },
  },
  create(context) {
    if (!isZamn(context)) return {};
    const names = new Set<string>(
      (context.options[0] as { attributes?: Name[] } | undefined)?.attributes ?? NAMES,
    );
    const services = context.sourceCode.parserServices as ParserServices;
    const store = services.getTemplateBodyTokenStore();
    const text = context.sourceCode.text;

    return services.defineTemplateBodyVisitor({
      VAttribute(node: AST.VAttribute | AST.VDirective) {
        // zamn merges `class` alone, written in lowercase, with `.class`.
        if (node.directive || !names.has(node.key.rawName) || !node.value) return;
        const name = node.key.rawName as Name;
        const head = node.parent;

        const values = name === "class" ? node.value.value.split(/\s+/).filter(Boolean) : [node.value.value];
        if (!values.length) return;
        const shorthands = values.map((value) => MARK[name] + value);
        // A second id is an error of its own.
        if (
          name === "id" &&
          (store.getTokens(head).some((t) => t.type === "ZamnId") ||
            head.attributes.some((a) => a !== node && !a.directive && a.key.rawName === "id"))
        ) {
          return;
        }

        const open = store.getTokenBefore(node, { filter: (t) => t.type === "ZamnAttrsOpen" });
        const close = store.getTokenAfter(node, { filter: (t) => t.type === "ZamnAttrsClose" });
        if (!open || !close || close.range[1] > head.range[1]) return;
        const at = open.range[0];

        // The attribute and the separators on one side of it, or the whole
        // `(...)` if nothing else is in it.
        let [start, end] = node.range;
        let before = start;
        while (before > open.range[1] && separator(text[before - 1])) before--;
        let after = end;
        while (after < close.range[0] && separator(text[after])) after++;
        let rest = "(";
        if (before === open.range[1] && after === close.range[0]) {
          [start, end] = [at, close.range[1]];
          const eol = text.indexOf("\n", end);
          rest = text.slice(end, eol === -1 ? undefined : eol);
        } else if (after === close.range[0]) start = before;
        else end = after;
        if (!lexesAs(shorthands, rest)) return;

        // `div` is what an element without a tag is.
        const tag = store.getFirstToken(head);
        const from = tag?.type === "ZamnTag" && tag.value === "div" ? tag.range[1] : null;

        const shorthand = shorthands.join("");
        context.report({
          node,
          messageId: "shorthand",
          data: { shorthand, name },
          fix: (fixer) =>
            fixer.replaceTextRange(
              [from === null ? at : tag!.range[0], end],
              (from === null ? "" : text.slice(from, at)) + shorthand + text.slice(at, start),
            ),
        });
      },
    });
  },
};

export default rule;
