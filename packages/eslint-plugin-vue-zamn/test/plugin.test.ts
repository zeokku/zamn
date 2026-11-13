import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import vue from "eslint-plugin-vue";
import zamnPlugin from "../index.js";
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
  return result!.messages.map((m) => `${m.line}:${m.column} ${m.ruleId}: ${m.message}`);
}

async function fix(code: string, rules: Record<string, unknown>) {
  const [result] = await eslint(rules, true).lintText(code, { filePath });
  return result!.output ?? code;
}

test("recommended: zamn templates are read, and no rule about HTML complains", async () => {
  const code = sfc(zamn`
    main#app.page(:class="{ on }") {
      my-card(v-for="item in items" :key="item.id" title='One' n=1 checked=true @click="go(item)") {
        p.text Hello #[b world] and {{ item.name }}
        span= item.count
      }
      img(src="/a.png" alt="a")/
      ul
        li: a(href="/") Home
        li
          a(
            href="/about" target="_blank") About
    }
  `);
  expect(await lint(code)).toEqual([]);
  // The rules that are left do their work.
  expect(await lint(code.replace(' :key="item.id"', ""))).toEqual([
    "3:3 vue/valid-v-for: Custom elements in iteration require 'v-bind:key' directives.",
  ]);
});

test("recommended: the config can be serialized, for --cache", () => {
  const [config] = zamnPlugin.configs.recommended;
  const { templateTokenizer } = config!.languageOptions!.parserOptions as any;
  expect(typeof templateTokenizer.zamn).toBe("string");
  expect(zamnPlugin.meta).toEqual({ name: "eslint-plugin-vue-zamn", version: expect.any(String) });
});

test("no-parsing-error: zamn's diagnostics, with their hints, over their whole range", async () => {
  const code = sfc(zamn`
    div
      if x
      p(:a="1 +")
      <b>html</b>
      p(a=)
  `);
  expect(await lint(code)).toEqual([
    "3:3 vue-zamn/no-parsing-error: \`if\` (control flow) is not supported: zamn has no control flow; use your framework's directives, e.g. \`div(v-if=\"cond\")\`.",
    // Expressions are parsed by vue-eslint-parser, and stay with Vue's rule.
    "4:12 vue/no-parsing-error: Parsing error: Unexpected end of expression.",
    "5:3 vue-zamn/no-parsing-error: A line of HTML is not supported: write it as a tag, or as text after \`|\`.",
    "6:6 vue-zamn/no-parsing-error: missing attribute value.",
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

const casing = "vue-zamn/component-name-in-template-casing";

test("component-name-in-template-casing: reports and fixes the tag", async () => {
  const code = sfc(
    zamn`
      div {
        my-card.big(title="a") {
          p text
        }
        my-card
        p #[my-card(title="b") inline]
        other-thing
        MyCard
      }
    `,
    setup,
  );
  expect(await lint(code, { [casing]: "error" })).toEqual([
    `6:3 ${casing}: Component name "my-card" is not PascalCase.`,
    `9:3 ${casing}: Component name "my-card" is not PascalCase.`,
    `10:7 ${casing}: Component name "my-card" is not PascalCase.`,
  ]);
  expect(await fix(code, { [casing]: "error" })).toBe(
    sfc(
      zamn`
        div {
          MyCard.big(title="a") {
            p text
          }
          MyCard
          p #[MyCard(title="b") inline]
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
