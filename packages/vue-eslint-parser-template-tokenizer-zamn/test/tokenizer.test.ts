import { expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import vue from "eslint-plugin-vue";
import * as parser from "vue-eslint-parser";
import ZamnTokenizer from "../index.js";
import { zamn } from "../../../tests/zamn.ts";

const fixtures = resolve(import.meta.dir, "../../../tests/fixtures");

const sfc = (template: string, script = "") =>
  `${script}<template lang="zamn">\n${template}</template>\n`;

function parse(code: string, templateTokenizer: unknown = { zamn: ZamnTokenizer }) {
  const { ast } = parser.parseForESLint(code, { parser: false, templateTokenizer } as any);
  return ast.templateBody as any;
}

/** The template as an outline: one line per node, with the source it covers. */
function outline(code: string) {
  const lines: string[] = [];
  const text = (node: any) => JSON.stringify(code.slice(...node.range));
  (function visit(node: any, depth: number) {
    const pad = "  ".repeat(Math.max(depth, 0));
    if (node.type === "VElement") {
      const attrs = node.startTag.attributes.map(
        (a: any) => `${a.directive ? "directive" : "attribute"} ${text(a)}`,
      );
      const end = node.endTag ? ` ... ${text(node.endTag)}` : "";
      lines.push(`${pad}<${node.rawName}> ${text(node.startTag)}${end}`);
      for (const attr of attrs) lines.push(`${pad}  ${attr}`);
      for (const child of node.children) visit(child, depth + 1);
    } else if (node.type === "VText") {
      lines.push(`${pad}text ${text(node)}`);
    } else {
      const expression = node.expression ? code.slice(...node.expression.range) : "";
      lines.push(`${pad}{{ ${expression} }} ${text(node)}`);
    }
  })({ type: "VElement", rawName: "", startTag: { range: [0, 0], attributes: [] }, children: parse(code).children }, -1);
  return lines.slice(1);
}

function lint(code: string, rules: Record<string, unknown>, parserOptions: object = {}) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.vue"],
        plugins: { vue },
        // With vue/comment-directive, what makes `eslint-disable` comments
        // in a template work.
        processor: vue.processors[".vue"],
        languageOptions: {
          parser,
          parserOptions: { templateTokenizer: { zamn: ZamnTokenizer }, ...parserOptions },
        },
        rules: { "vue/comment-directive": "error", ...rules },
      } as any,
    ],
  });
  return eslint
    .lintText(code, { filePath: resolve(import.meta.dir, "Test.vue") })
    .then(([result]) =>
      result!.messages.map((m) => `${m.line}:${m.column} ${m.ruleId}: ${m.message}`),
    );
}

test("elements, attributes, text and mustaches", () => {
  const code = sfc(zamn`
    main#app.page(:class="{ on }") {
      Card(v-for="item in items" :key="item.id" title="One" disabled) {
        span {{ item.name }} of #[b= items.length]
      }
      p(v-else).
        Off for
        {{ items.length }} items
      input(type="checkbox" checked=true hidden=false)
      li: a(href='/') Home
    }
  `);
  expect(outline(code)).toEqual([
    `<main> "main#app.page(:class=\\"{ on }\\")" ... "}"`,
    `  directive ":class=\\"{ on }\\""`,
    `  <Card> "Card(v-for=\\"item in items\\" :key=\\"item.id\\" title=\\"One\\" disabled)" ... "}"`,
    `    directive "v-for=\\"item in items\\""`,
    `    directive ":key=\\"item.id\\""`,
    `    attribute "title=\\"One\\""`,
    `    attribute "disabled"`,
    `    <span> "span" ... "\\n"`,
    `      {{ item.name }} "{{ item.name }}"`,
    `      text " of "`,
    `      <b> "b" ... "]"`,
    `        {{ items.length }} "= items.length"`,
    `  <p> "p(v-else)" ... "\\n"`,
    `    directive "v-else"`,
    `    text "Off for\\n    "`,
    `    {{ items.length }} "{{ items.length }}"`,
    `    text " items"`,
    `  <input> "input(type=\\"checkbox\\" checked=true hidden=false)"`,
    `    attribute "type=\\"checkbox\\""`,
    `    attribute "checked=true"`,
    `  <li> "li" ... "\\n"`,
    `    <a> "a(href='/')" ... "\\n"`,
    `      attribute "href='/'"`,
    `      text "Home"`,
  ]);
});

test("blocks on one line: an element in one ends at its }", () => {
  const code = sfc(zamn`
    ul{li{a x} li{b= y}}
    p next
  `);
  expect(outline(code)).toEqual([
    `<ul> "ul" ... "}"`,
    `  <li> "li" ... "}"`,
    `    <a> "a" ... "}"`,
    `      text "x"`,
    `  <li> "li" ... "}"`,
    `    <b> "b" ... "}"`,
    `      {{ y }} "= y"`,
    `<p> "p" ... "\\n"`,
    `  text "next"`,
  ]);
  // In source order; elements closed by the same `}` share it as their end tag.
  const starts = (node: any): number[] =>
    node.children.flatMap((c: any) =>
      c.type === "VElement" ? [c.startTag.range[0], ...starts(c), c.endTag.range[0]] : [c.range[0]],
    );
  const order = starts(parse(code));
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("attribute values", () => {
  const code = sfc(zamn`
    a(title="it\\'s" :to=\`{ name }\` :n=1 on=true)
  `);
  const [title, to, n, on] = parse(code).children[0].startTag.attributes;
  // A plain value is what it means; an expression is the text in the file.
  expect(title.value.value).toBe("it's");
  expect(code.slice(...to.value.expression.range)).toBe("{ name }");
  expect(n.value.expression.value).toBe(1);
  expect(on.value).toBeNull();
});

test("v-pre turns expressions off", () => {
  const code = sfc(zamn`
    div(v-pre)
      p {{ raw }}
      p= raw
    p= cooked
  `);
  expect(outline(code)).toEqual([
    `<div> "div(v-pre)" ... "\\n"`,
    `  directive "v-pre"`,
    `  <p> "p" ... "\\n"`,
    `    text "{{ raw }}"`,
    `  <p> "p" ... "\\n"`,
    `    text "raw"`,
    `<p> "p" ... "\\n"`,
    `  {{ cooked }} "= cooked"`,
  ]);
});

test("positions are in the whole file, with any line ending", () => {
  const code = sfc("div\n  p(:title=\"t\") {{ a }}\n", "<script>\nexport default {}\n</script>\n").replace(/\n/g, "\r\n");
  const body = parse(code);
  const p = body.children[0].children[0];
  expect(code.slice(...p.startTag.range)).toBe('p(:title="t")');
  expect(p.loc.start).toEqual({ line: 6, column: 2 });
  expect(code.slice(...p.children[0].expression.range)).toBe("a");
  expect(p.children[0].expression.loc.start).toEqual({ line: 6, column: 19 });
  expect(code.slice(...p.startTag.attributes[0].value.expression.range)).toBe("t");
});

test("can be named instead of passed", () => {
  const code = sfc("p= a\n");
  const body = parse(code, { zamn: resolve(import.meta.dir, "../index.js") });
  expect(body.children[0].children[0].type).toBe("VExpressionContainer");
});

test("rules see the template", async () => {
  const code = sfc(
    zamn`
      ul
        li(v-for="(item, index) in items") {{ item }}
        li(v-for="other in items" :key="other")
        //- eslint-disable-next-line vue/no-unused-vars
        li(v-for="hidden in items" :key="used")
        template(v-if="a")
        p(v-else-if="a" v-else)
    `,
    zamn`
      <script setup>
      const items = [];
      const used = 1;
      const unused = 2;
      </script>
    `,
  );
  expect(
    await lint(code, {
      "no-unused-vars": "error",
      "vue/no-unused-vars": "error",
      "vue/require-v-for-key": "error",
      "vue/valid-v-else": "error",
    }),
  ).toEqual([
    "4:7 no-unused-vars: 'unused' is assigned a value but never used.",
    "8:3 vue/require-v-for-key: Elements in iteration expect to have 'v-bind:key' directives.",
    "8:20 vue/no-unused-vars: 'index' is defined but never used.",
    "13:19 vue/valid-v-else: 'v-else' and 'v-else-if' directives can't exist on the same element.",
  ]);
});

test("zamn's diagnostics are errors of the template, with a code of their own", async () => {
  const code = sfc(zamn`
    div
      if x
      p(:a="1 +")
      p {{ b c }}
  `);
  const errors = parse(code).errors.map((e: any) => [e.code, e.message, e.hint, e.range ? code.slice(...e.range) : ""]);
  expect(errors).toEqual([
    [
      "zamn/UNSUPPORTED_SYNTAX",
      "\`if\` (control flow) is not supported",
      "zamn has no control flow; use your framework's directives, e.g. \`div(v-if=\"cond\")\`",
      "if x",
    ],
    [undefined, "Unexpected end of expression.", undefined, ""],
    [undefined, "Unexpected token c", undefined, ""],
  ]);
  // vue/no-parsing-error skips a code it does not know: zamn's diagnostics
  // are reported by vue-zamn/no-parsing-error.
  expect(await lint(code, { "vue/no-parsing-error": "error" })).toEqual([
    "4:12 vue/no-parsing-error: Parsing error: Unexpected end of expression.",
    "5:10 vue/no-parsing-error: Parsing error: Unexpected token c.",
  ]);
});

const every: Record<string, string> = {};
for (const name of Object.keys(vue.rules)) every[`vue/${name}`] = "error";

for (const file of new Glob("{braces,zamn,errors}/**/*.zamn").scanSync(fixtures)) {
  test(`fixture ${file}: sound tokens, and no rule fails on them`, async () => {
    const code = sfc(await Bun.file(resolve(fixtures, file)).text());
    const body = parse(code);
    let previous = 0;
    for (const token of [...body.tokens].slice(1, -1)) {
      // Tokens of the <template> tags themselves aside, each is its source.
      if (!token.type.startsWith("HTML")) expect(code.slice(...token.range)).toBe(token.value);
      expect(token.range[0]).toBeGreaterThanOrEqual(previous);
      expect(token.range[1]).toBeGreaterThanOrEqual(token.range[0]);
      previous = token.range[1];
    }
    for (const comment of body.comments) expect(code.slice(...comment.range)).toContain("//");
    // Throws if a rule does.
    await lint(code, every, { parser: false });
  });
}
