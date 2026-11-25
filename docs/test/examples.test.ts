// Every zamn example in the docs is checked against the compiler:
//
// - a ```zamn block whose next code block is ```html must compile to exactly
//   that HTML;
// - ```zamn error=CODE must report that diagnostic code as an error;
// - ```zamn warning=CODE must compile, with that warning, and to the HTML of
//   the next block if it is ```html;
// - any other ```zamn block must compile without errors or warnings;
// - ```html format shows the output as Prettier lays it out (.vitepress/theme/format.ts);
// - ```zamn skip is not checked (fragments, placeholders).
//
// The rules file and the skill are checked the same way.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import * as prettier from "prettier";
import { compile, ZamnError } from "zamn";
import { html5, htmlFormat } from "../.vitepress/theme/format";

const root = resolve(import.meta.dir, "../..");
const files = [
  ...new Glob("docs/**/*.md").scanSync({ cwd: root }),
  "agents/zamn.md",
  "skills/zamn/SKILL.md",
].filter((f) => !f.includes("node_modules") && !f.includes(".vitepress/"));

interface Block {
  lang: string;
  meta: string;
  code: string;
  line: number;
}

function blocks(source: string): Block[] {
  const out: Block[] = [];
  const re = /^( *)(`{3,})(\S*)([^\n]*)\n([\s\S]*?)^\1\2 *$/gm;
  for (const m of source.matchAll(re)) {
    const indent = m[1]!.length;
    const code = m[5]!
      .split("\n")
      .map((l) => l.slice(indent))
      .join("\n")
      .replace(/\n$/, "");
    out.push({
      lang: m[3]!,
      meta: m[4]!.trim(),
      code,
      line: source.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

function option(meta: string, name: string) {
  return meta.match(new RegExp(`\\b${name}=(\\S+)`))?.[1];
}

for (const file of files) {
  const list = blocks(await Bun.file(resolve(root, file)).text());
  const zamn = list.filter((b) => b.lang === "zamn" && !/\bskip\b/.test(b.meta));
  if (!zamn.length) continue;

  describe(file, () => {
    for (const block of zamn) {
      const error = option(block.meta, "error");
      const warning = option(block.meta, "warning");
      const next = list[list.indexOf(block) + 1];

      test(`line ${block.line}`, async () => {
        const run = () => compile(block.code, { filename: "example.zamn" });
        if (error) {
          let codes: string[] = [];
          try {
            run();
          } catch (e) {
            codes = (e as ZamnError).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
          }
          expect(codes).toContain(error);
          return;
        }
        const { code, warnings } = run();
        const codes = warnings.map((d) => d.code);
        if (warning) expect(codes).toContain(warning);
        else expect(codes).toEqual([]);
        if (next?.lang !== "html") return;
        if (/\bformat\b/.test(next.meta)) {
          expect(html5((await prettier.format(code, htmlFormat)).trimEnd())).toBe(next.code);
        } else {
          expect(code).toBe(next.code);
        }
      });
    }
  });
}
