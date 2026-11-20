// Every zamn example in the docs is checked against the compiler:
//
// - a ```zamn block whose next code block is ```html must compile to exactly
//   that HTML;
// - ```zamn error=CODE must report that diagnostic code;
// - any other ```zamn block must compile without errors;
// - ```zamn doctype=html compiles with `doctype: "html"`, as Vue templates do;
// - ```zamn skip is not checked (fragments, placeholders).
//
// The rules file and the skill are checked the same way.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import { compile, ZamnError } from "zamn";

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
      const doctype = option(block.meta, "doctype");
      const error = option(block.meta, "error");
      const next = list[list.indexOf(block) + 1];

      test(`line ${block.line}`, () => {
        const run = () => compile(block.code, { filename: "example.zamn", doctype });
        if (error) {
          let codes: string[] = [];
          try {
            run();
          } catch (e) {
            codes = (e as ZamnError).diagnostics.map((d) => d.code);
          }
          expect(codes).toContain(error);
          return;
        }
        const { code } = run();
        if (next?.lang === "html") expect(code).toBe(next.code);
      });
    }
  });
}
