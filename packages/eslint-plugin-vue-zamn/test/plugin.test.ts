import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import vue from "eslint-plugin-vue";
import zamnPlugin from "eslint-plugin-vue-zamn";
import { zamn } from "../../../tests/zamn.ts";

const sfc = (template: string, script = "", lang = ' lang="zamn"') =>
  `${script}<template${lang}>\n${template}</template>\n`;

const setup = zamn`
  <script setup>
  import MyCard from "./MyCard.vue"
  </script>
`;

function eslint(rules: Record<string, unknown> = {}, fix = false) {
  return new ESLint({
    overrideConfigFile: true,
    fix,
    overrideConfig: [
      ...vue.configs["flat/recommended"],
      ...zamnPlugin.configs.recommended,
      { rules: { "vue/multi-word-component-names": "off", ...rules } },
    ] as any,
  });
}

const filePath = resolve(import.meta.dir, "Test.vue");

async function lint(code: string, rules?: Record<string, unknown>) {
  const [result] = await eslint(rules).lintText(code, { filePath });
  return result!.messages.map(
    (m) => `${m.line}:${m.column} ${m.severity === 1 ? "warn " : ""}${m.ruleId}: ${m.message}`,
  );
}

async function fix(code: string, rules: Record<string, unknown>) {
  const [result] = await eslint(rules, true).lintText(code, { filePath });
  return result!.output ?? code;
}

test("recommended: zamn templates are read, and no rule about HTML complains", async () => {
  const code = sfc(zamn`
    main#app.page(:class="{ on }") {
      my-card(v-for="item in items" :key="item.id" title='One' n=1 checked=true @click="go(item)") {
        p.text Hello #{b world} and {{ item.name }} &rarr; done
        span= item.count
        p: |{
          A block of text
          over two lines.
        }
      }
      img(src="/a.png" alt="a")
      ul {
        li: a(href="/") Home
        li { a(href="/about" target="_blank") About }
        li {
          a(
            href="/docs" target="_blank") Docs
        }
      }
      // A comment
      /* and a block comment */
      p(v-if="items.length") { | Items: {{ items.length }} }
      p(v-else) None
    }
  `);
  expect(await lint(code)).toEqual([]);
  // The rules that are left do their work.
  expect(await lint(code.replace(' :key="item.id"', ""))).toEqual([
    "3:3 vue/valid-v-for: Custom elements in iteration require 'v-bind:key' directives.",
  ]);
});

test("recommended: the config can be serialized, for --cache, and sets the rules of the plugin", () => {
  const [config] = zamnPlugin.configs.recommended;
  const { templateTokenizer } = config!.languageOptions!.parserOptions as any;
  expect(typeof templateTokenizer.zamn).toBe("string");
  expect(templateTokenizer.zamn).toEndWith("/dist/index.js");
  expect(zamnPlugin.meta).toEqual({ name: "eslint-plugin-vue-zamn", version: expect.any(String) });
  expect(config!.rules).toMatchObject({
    "vue-zamn/no-parsing-error": "error",
    "vue-zamn/no-misleading-indentation": "warn",
    "vue-zamn/prefer-shorthand": "warn",
  });
});

test("no-parsing-error: zamn's errors, with their hints, over their whole range", async () => {
  const code = sfc(zamn`
    div {
      if x
      p(:a="1 +")
      <b>html</b>
      p(a=)
      p Some #[b bold] text
    }
  `);
  expect(await lint(code)).toEqual([
    "3:3 vue-zamn/no-parsing-error: \`if\` (control flow) is not supported: zamn has no control flow; use your framework's directives, e.g. \`div(v-if=\"cond\")\`.",
    // Expressions are parsed by vue-eslint-parser, and stay with Vue's rule.
    "4:12 vue/no-parsing-error: Parsing error: Unexpected end of expression.",
    "5:3 vue-zamn/no-parsing-error: A line of HTML is not supported: write it as an element (\`b bold\`); text is escaped.",
    "6:6 vue-zamn/no-parsing-error: missing attribute value.",
    "7:10 vue-zamn/no-parsing-error: \`#[...]\` is not supported: write an inline element as \`#{...}\`.",
  ]);
  const [result] = await eslint().lintText(code, { filePath });
  expect(result!.messages[0]).toMatchObject({ line: 3, column: 3, endLine: 3, endColumn: 7 });
});

test("no-parsing-error: says nothing about an HTML template", async () => {
  const code = sfc('  <p :a="1 +"></p>\n', "", "");
  expect(await lint(code)).toEqual([
    "2:13 vue/no-parsing-error: Parsing error: Unexpected end of expression.",
  ]);
});

test("no-misleading-indentation: a line indented as a child, without { }", async () => {
  const code = sfc(zamn`
    div {
      p Some text
        b bold
      ul {
        li: a(href="/") Home
      }
    }
  `);
  expect(await lint(code)).toEqual([
    "4:5 warn vue-zamn/no-misleading-indentation: This line is indented as if it were nested, but indentation means nothing in zamn: wrap the children in \`{ }\` on the line above, or remove the indentation.",
  ]);
  const [result] = await eslint().lintText(code, { filePath });
  expect(result!.messages[0]).toMatchObject({ line: 4, column: 5, endLine: 4, endColumn: 11 });
  // It is a warning of zamn, not an error: no-parsing-error leaves it.
  expect(await lint(code, { "vue-zamn/no-misleading-indentation": "off" })).toEqual([]);
});

const casing = "vue-zamn/component-name-in-template-casing";

test("component-name-in-template-casing: reports and fixes the tag", async () => {
  const code = sfc(
    zamn`
      div {
        my-card.big(title="a") {
          p text
        }
        my-card
        p Some #{my-card(title="b") inline} text
        ul { li: my-card x }
        other-thing
        MyCard
      }
    `,
    setup,
  );
  expect(await lint(code, { [casing]: "error" })).toEqual([
    `6:3 ${casing}: Component name "my-card" is not PascalCase.`,
    `9:3 ${casing}: Component name "my-card" is not PascalCase.`,
    `10:12 ${casing}: Component name "my-card" is not PascalCase.`,
    `11:12 ${casing}: Component name "my-card" is not PascalCase.`,
  ]);
  expect(await fix(code, { [casing]: "error" })).toBe(
    sfc(
      zamn`
        div {
          MyCard.big(title="a") {
            p text
          }
          MyCard
          p Some #{MyCard(title="b") inline} text
          ul { li: MyCard x }
          other-thing
          MyCard
        }
      `,
      setup,
    ),
  );
});

test("component-name-in-template-casing: takes the options of Vue's rule", async () => {
  const code = sfc("MyCard(title=\"a\")\nOtherThing\n", setup);
  const rules = { [casing]: ["error", "kebab-case", { registeredComponentsOnly: false }] };
  expect(await lint(code, rules)).toEqual([
    `5:1 ${casing}: Component name "MyCard" is not kebab-case.`,
    `6:1 ${casing}: Component name "OtherThing" is not kebab-case.`,
  ]);
  expect(await fix(code, rules)).toBe(sfc("my-card(title=\"a\")\nother-thing\n", setup));
});

test("component-name-in-template-casing: is Vue's rule in an HTML template", async () => {
  const code = sfc("  <my-card title=\"a\"><p>text</p></my-card>\n", setup, "");
  expect(await lint(code, { [casing]: "error" })).toEqual([
    `5:3 ${casing}: Component name "my-card" is not PascalCase.`,
  ]);
  expect(await fix(code, { [casing]: "error" })).toBe(
    sfc("  <MyCard title=\"a\"><p>text</p></MyCard>\n", setup, ""),
  );
});

const shorthand = "vue-zamn/prefer-shorthand";

test("prefer-shorthand: reports static class and id attributes, and fixes them", async () => {
  const code = sfc(zamn`
    div {
      p(class="a  b" title="t") Text
      p.x(title="t" class="y")
      p(class="b").a
      a(
        href="/docs"
        id="docs") Docs
      p Some #{span(class="em") text}
      li: span(id="x", class="y") z
      div(class="box") { p(class="w-1/2 md:flex [&>*]:p-2") x }
      p(class="a" class="b") two
    }
  `);
  expect((await lint(code)).filter((m) => m.includes(shorthand))).toEqual([
    `3:5 warn ${shorthand}: Write \`.a.b\` instead of the \`class\` attribute.`,
    `4:17 warn ${shorthand}: Write \`.y\` instead of the \`class\` attribute.`,
    `5:5 warn ${shorthand}: Write \`.b\` instead of the \`class\` attribute.`,
    `8:5 warn ${shorthand}: Write \`#docs\` instead of the \`id\` attribute.`,
    `9:17 warn ${shorthand}: Write \`.em\` instead of the \`class\` attribute.`,
    `10:12 warn ${shorthand}: Write \`#x\` instead of the \`id\` attribute.`,
    `10:20 warn ${shorthand}: Write \`.y\` instead of the \`class\` attribute.`,
    `11:7 warn ${shorthand}: Write \`.box\` instead of the \`class\` attribute.`,
    `11:24 warn ${shorthand}: Write \`.w-1/2.md:flex.[&>*]:p-2\` instead of the \`class\` attribute.`,
    `12:5 warn ${shorthand}: Write \`.a\` instead of the \`class\` attribute.`,
    `12:15 warn ${shorthand}: Write \`.b\` instead of the \`class\` attribute.`,
  ]);
  expect(await fix(code, {})).toBe(
    sfc(zamn`
      div {
        p.a.b(title="t") Text
        p.x.y(title="t")
        p.b.a
        a#docs(
          href="/docs") Docs
        p Some #{span.em text}
        li: span#x.y z
        .box { p.w-1/2.md:flex.[&>*]:p-2 x }
        p.a.b two
      }
    `),
  );
});

test("prefer-shorthand: leaves what a shorthand cannot be", async () => {
  const code = sfc(zamn`
    div {
      p(:class="{ on }" :id="id") bound
      p(class="" id="has space") empty
      p(class="a&b" id="a.b") characters
      p#x(id="y") two ids
      p(CLASS="a") not merged
      p(class=true) boolean
    }
  `);
  expect((await lint(code)).filter((m) => m.includes(shorthand))).toEqual([]);
});

test("prefer-shorthand: the attributes option picks class or id", async () => {
  const code = sfc('p(class="a" id="b") x\n');
  expect(await fix(code, { [shorthand]: ["warn", { attributes: ["class"] }] })).toBe(
    sfc('p.a(id="b") x\n'),
  );
  expect(await fix(code, { [shorthand]: ["warn", { attributes: ["id"] }] })).toBe(
    sfc('p#b(class="a") x\n'),
  );
});

test("prefer-shorthand: says nothing about an HTML template", async () => {
  const code = sfc('  <p id="a" class="b"></p>\n', "", "");
  expect(await lint(code)).toEqual([]);
});
