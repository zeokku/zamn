import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as core from "@vue/language-core";
import plugin from "../dist/index.js";

const fixture = resolve(import.meta.dir, "fixture");

type CompilerOptions = Parameters<NonNullable<core.VueLanguagePluginReturn["compileSFCTemplate"]>>[2];
type CompilerError = Parameters<NonNullable<CompilerOptions["onError"]>>[0];

/** The zamn template of a fixture, as Vue hands it to the plugin. */
async function template(name: string) {
  const sfc = await Bun.file(resolve(fixture, name)).text();
  return sfc.match(/<template lang="zamn">\n([\s\S]*)<\/template>/)![1]!;
}

function compile(source: string) {
  const errors: CompilerError[] = [];
  const warnings: CompilerError[] = [];
  // Only `modules` is read.
  const [instance] = [plugin({ modules: { "@vue/language-core": core } } as never)].flat();
  const result = instance!.compileSFCTemplate!("zamn", source, {
    onError: (e) => errors.push(e),
    onWarn: (e) => warnings.push(e),
  });
  return { result, errors, warnings };
}

test("require() gives the plugin itself, as Vue's language tools load it", () => {
  const required = createRequire(import.meta.url)("../dist/index.js");
  expect(required).toBe(plugin);
  expect(typeof required).toBe("function");
});

test("zamn's errors are errors, its warnings are warnings, at their place", async () => {
  const source = await template("Invalid.vue");
  const { errors, warnings } = compile(source);
  const at = ({ code, loc }: CompilerError) => [
    code,
    source.slice(loc!.start.offset, loc!.end.offset),
  ];
  expect(errors.map(at)).toEqual([
    ["UNESCAPED_BRACE", "{"],
    ["UNSUPPORTED_SYNTAX", "<b>raw HTML</b>"],
    ["UNSUPPORTED_SYNTAX", "#["],
  ]);
  expect(warnings.map(at)).toEqual([["MISLEADING_INDENTATION", "p misleading"]]);
});

test("a valid template has no errors or warnings", async () => {
  for (const name of ["Valid.vue", "Card.vue"]) {
    const { result, errors, warnings } = compile(await template(name));
    expect(result).toBeDefined();
    expect([...errors, ...warnings]).toEqual([]);
  }
});

test("the AST Vue gets points into the zamn source", async () => {
  const source = await template("Valid.vue");
  const { result } = compile(source);
  const nodes = [...core.forEachElementNode(result!.ast)];
  const card = nodes.find((node) => node.tag === "Card")!;
  expect(card.loc.start.offset).toBe(source.indexOf("Card("));
  // Its block ends at its `}`.
  const close = source.indexOf("\n  }\n") + 4;
  expect(card.loc.end.offset).toBe(close);
  const footer = nodes.find((node) => node.tag === "footer")!;
  expect(source.slice(footer.loc.start.offset, footer.loc.end.offset)).toStartWith("footer(");
  expect(source.slice(footer.loc.start.offset, footer.loc.end.offset)).toEndWith("{{ active }}");
});
