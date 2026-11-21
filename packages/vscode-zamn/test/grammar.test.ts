import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import * as oniguruma from "vscode-oniguruma";
import * as textmate from "vscode-textmate";
import { zamn } from "../../../tests/zamn.ts";

const syntaxes = resolve(import.meta.dir, "../syntaxes");
const wasm = createRequire(import.meta.url).resolve("vscode-oniguruma/release/onig.wasm");

// A stand-in for the Vue extension's grammar, with the parts of it that the
// injection has to get ahead of or uses: a rule for every `<`, which takes
// the content of an element in a language it does not know as plain text.
const VUE = {
  scopeName: "text.html.vue",
  patterns: [
    {
      begin: "(<)",
      end: "(>)",
      patterns: [
        {
          begin: "([a-zA-Z0-9:-]+)",
          end: "(</)(\\1)\\s*(?=>)",
          patterns: [
            { include: "#tag-stuff" },
            { begin: "(?<=>)", end: "(?=<\\/)", name: "text" },
          ],
        },
      ],
    },
  ],
  repository: { "tag-stuff": { begin: "\\G", end: "(?=/>)|(>)", name: "meta.tag-stuff" } },
};

const files: Record<string, string> = {
  "source.zamn": resolve(syntaxes, "zamn.tmLanguage.json"),
  "zamn.vue-injection": resolve(syntaxes, "zamn.vue-injection.tmLanguage.json"),
};

const registry = new textmate.Registry({
  onigLib: oniguruma.loadWASM(await Bun.file(wasm).arrayBuffer()).then(() => ({
    createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
    createOnigString: (text: string) => new oniguruma.OnigString(text),
  })),
  async loadGrammar(scopeName) {
    if (scopeName === "text.html.vue") return VUE as any;
    const file = files[scopeName];
    if (file) return textmate.parseRawGrammar(await Bun.file(file).text(), file);
    // TypeScript, HTML and the rest come with VS Code. Here they are
    // grammars that match nothing: a rule that includes a grammar that
    // cannot be found is dropped.
    const nothing = { patterns: [{ match: "(?!)" }] };
    return { scopeName, ...nothing, repository: { expression: nothing } } as any;
  },
  getInjections: (scopeName) => (scopeName === "text.html.vue" ? ["zamn.vue-injection"] : []),
});

/**
 * Every token of the source as `text  scope scope`, without the scopes that
 * only say which grammar or line it is in, and without whitespace.
 */
async function tokens(source: string, scopeName = "source.zamn") {
  const grammar = (await registry.loadGrammar(scopeName))!;
  const out: string[] = [];
  let stack = textmate.INITIAL;
  for (const line of source.split("\n")) {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    for (const token of result.tokens) {
      const text = line.slice(token.startIndex, token.endIndex);
      if (!text.trim()) continue;
      const scopes = token.scopes
        .filter((s) => !/^(source\.zamn|text\.html\.vue|meta\.(line\.tag|attributes|text-block)\.zamn)$/.test(s))
        .map((s) => s.replace(/\.zamn$/, ""));
      out.push(scopes.length ? `${text}  ${scopes.join(" ")}` : text);
    }
  }
  return out;
}

test("tags, ids, classes and text", async () => {
  expect(await tokens("main#app.page Hello .not #a-class")).toEqual([
    "main  entity.name.tag",
    "#app  entity.other.attribute-name.id",
    ".page  entity.other.attribute-name.class",
    "Hello .not #a-class",
  ]);
  expect(await tokens(".card\n  MyButton/\n  svg:path")).toEqual([
    ".card  entity.other.attribute-name.class",
    "MyButton  entity.name.tag",
    "/  punctuation.definition.tag.self-closing",
    "svg:path  entity.name.tag",
  ]);
});

test("attributes", async () => {
  expect(await tokens(`a(href="/a\\"b", target='_blank' n=1 on=true bare=word disabled) x`)).toEqual([
    "a  entity.name.tag",
    "(  punctuation.section.attributes.begin",
    "href  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "/a  string.quoted.double",
    '\\"  string.quoted.double constant.character.escape',
    "b  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ",  punctuation.separator.attribute",
    "target  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    "'  string.quoted.single punctuation.definition.string.begin",
    "_blank  string.quoted.single",
    "'  string.quoted.single punctuation.definition.string.end",
    "n  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    "1  constant.numeric",
    "on  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    "true  constant.language",
    "bare  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    "word  string.unquoted",
    "disabled  entity.other.attribute-name",
    ")  punctuation.section.attributes.end",
    "x",
  ]);
});

test("directives hold expressions, over several lines too", async () => {
  const source = zamn`
    Card(
      v-for="item in items"
      :key='item.id'
      @click.prevent="go(item)"
      #default
      :count=1
    )
  `;
  const directive = "meta.attribute.directive";
  expect(await tokens(source)).toEqual([
    "Card  entity.name.tag",
    "(  punctuation.section.attributes.begin",
    `v-for  ${directive} entity.other.attribute-name.directive`,
    `=  ${directive} keyword.operator.assignment`,
    `"  ${directive} punctuation.definition.string.begin`,
    `item in items  ${directive} source.ts.embedded`,
    `"  ${directive} punctuation.definition.string.end`,
    `:key  ${directive} entity.other.attribute-name.directive`,
    `=  ${directive} keyword.operator.assignment`,
    `'  ${directive} punctuation.definition.string.begin`,
    `item.id  ${directive} source.ts.embedded`,
    `'  ${directive} punctuation.definition.string.end`,
    `@click.prevent  ${directive} entity.other.attribute-name.directive`,
    `=  ${directive} keyword.operator.assignment`,
    `"  ${directive} punctuation.definition.string.begin`,
    `go(item)  ${directive} source.ts.embedded`,
    `"  ${directive} punctuation.definition.string.end`,
    "#default  entity.other.attribute-name.directive",
    ":count  entity.other.attribute-name.directive",
    "=  keyword.operator.assignment",
    "1  constant.numeric",
    ")  punctuation.section.attributes.end",
  ]);
});

test("braces, expansion, output and interpolation", async () => {
  const source = zamn`
    ul.list {
      li: a(href="/") Home
      p= message
      p {{ a }} and #[b= c] \\#[d]
      footer { }
    }
    = total
  `;
  const mustache = "meta.interpolation.expression";
  const interpolation = "meta.interpolation.tag";
  expect(await tokens(source)).toEqual([
    "ul  entity.name.tag",
    ".list  entity.other.attribute-name.class",
    "{  punctuation.section.block.begin",
    "li  entity.name.tag",
    ":  punctuation.separator.expansion",
    "a  entity.name.tag",
    "(  punctuation.section.attributes.begin",
    "href  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "/  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    "Home",
    "p  entity.name.tag",
    "=  keyword.operator.output",
    " message  source.ts.embedded",
    "p  entity.name.tag",
    `{{  ${mustache} punctuation.definition.interpolation.begin`,
    ` a   ${mustache} source.ts.embedded`,
    `}}  ${mustache} punctuation.definition.interpolation.end`,
    " and ",
    `#[  ${interpolation} punctuation.section.embedded.begin`,
    `b  ${interpolation} entity.name.tag`,
    `=  ${interpolation} keyword.operator.output`,
    ` c  ${interpolation} source.ts.embedded`,
    `]  ${interpolation} punctuation.section.embedded.end`,
    "\\#[  constant.character.escape",
    "d]",
    "footer  entity.name.tag",
    "{  punctuation.section.block.begin",
    "}  punctuation.section.block.end",
    "}  punctuation.section.block.end",
    "=  keyword.operator.output",
    " total  source.ts.embedded",
  ]);
});

test("blocks on one line", async () => {
  const source = zamn`
    .cl{.cl2 {b text {x} \\}}}
    ul{li{img/ br/} li(id="a")= msg}
    p{| {{ a }} and #[i c]}
    p {{ b }} \\{d}
  `;
  const begin = "{  punctuation.section.block.begin";
  const end = "}  punctuation.section.block.end";
  expect(await tokens(source)).toEqual([
    ".cl  entity.other.attribute-name.class",
    begin,
    ".cl2  entity.other.attribute-name.class",
    begin,
    "b  entity.name.tag",
    "text ",
    "{",
    "x",
    "}",
    "\\}  constant.character.escape",
    end,
    end,
    "ul  entity.name.tag",
    begin,
    "li  entity.name.tag",
    begin,
    "img  entity.name.tag",
    "/  punctuation.definition.tag.self-closing",
    "br  entity.name.tag",
    "/  punctuation.definition.tag.self-closing",
    end,
    "li  entity.name.tag",
    "(  punctuation.section.attributes.begin",
    "id  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "a  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    "=  keyword.operator.output",
    " msg  source.ts.embedded",
    end,
    "p  entity.name.tag",
    begin,
    "|  punctuation.definition.text",
    "{{  meta.interpolation.expression punctuation.definition.interpolation.begin",
    " a   meta.interpolation.expression source.ts.embedded",
    "}}  meta.interpolation.expression punctuation.definition.interpolation.end",
    " and ",
    "#[  meta.interpolation.tag punctuation.section.embedded.begin",
    "i  meta.interpolation.tag entity.name.tag",
    "c  meta.interpolation.tag",
    "]  meta.interpolation.tag punctuation.section.embedded.end",
    end,
    "p  entity.name.tag",
    "{{  meta.interpolation.expression punctuation.definition.interpolation.begin",
    " b   meta.interpolation.expression source.ts.embedded",
    "}}  meta.interpolation.expression punctuation.definition.interpolation.end",
    "\\{  constant.character.escape",
    "d}",
  ]);
});

test("comments, text blocks and pipes end where the indentation does", async () => {
  const source = zamn`
    div
      // note
        more .note
      //- silent
      p.lead(title="t").
        Text. With {{ x }}
          .deeper
      | piped .text
      p Ends with a dot.
      span after
  `;
  expect(await tokens(source)).toEqual([
    "div  entity.name.tag",
    "//  string.comment.buffered.block punctuation.definition.comment",
    " note  string.comment.buffered.block",
    "    more .note  string.comment.buffered.block",
    "//-  comment.block.silent punctuation.definition.comment",
    " silent  comment.block.silent",
    "p  entity.name.tag",
    ".lead  entity.other.attribute-name.class",
    "(  punctuation.section.attributes.begin",
    "title  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "t  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    ".  punctuation.definition.text-block",
    "    Text. With ",
    "{{  meta.interpolation.expression punctuation.definition.interpolation.begin",
    " x   meta.interpolation.expression source.ts.embedded",
    "}}  meta.interpolation.expression punctuation.definition.interpolation.end",
    "      .deeper",
    "|  punctuation.definition.text",
    "piped .text",
    "p  entity.name.tag",
    "Ends with a dot.",
    "span  entity.name.tag",
    "after",
  ]);
});

test("doctype, HTML lines and what zamn does not support", async () => {
  const source = zamn`
    doctype html
    <div :a="b">{{ c }}</div>
    if user
    - var x = 1
    +card
    p ok
  `;
  expect(await tokens(source)).toEqual([
    "doctype  meta.tag.sgml.doctype entity.name.tag.doctype",
    "html  meta.tag.sgml.doctype string.unquoted.doctype",
    '<div :a="b">{{ c }}</div>  invalid.illegal.unsupported',
    "if  invalid.illegal.unsupported",
    " user",
    "- var x = 1  invalid.illegal.unsupported",
    "+card  invalid.illegal.unsupported",
    "p  entity.name.tag",
    "ok",
  ]);
});

test("is injected into <template lang=\"zamn\"> of a Vue file, and only there", async () => {
  const source = zamn`
    <template lang="zamn">
    p.a= b
    </template>
    <template>
    p.a= b
    </template>
  `;
  expect(await tokens(source, "text.html.vue")).toEqual([
    "<  punctuation.definition.tag.begin.html",
    "template  entity.name.tag.template.html",
    ' lang="zamn"  meta.tag-stuff',
    ">  meta.tag-stuff",
    "p  entity.name.tag",
    ".a  entity.other.attribute-name.class",
    "=  keyword.operator.output",
    " b  source.ts.embedded",
    "</  punctuation.definition.tag.begin.html",
    "template  entity.name.tag.template.html",
    ">  punctuation.definition.tag.end.html",
    "<",
    "template",
    ">  meta.tag-stuff",
    "p.a= b  text",
    "</template",
    ">",
  ]);
});

test("the comment of the language is the one left out of the output", async () => {
  const { comments } = await Bun.file(resolve(syntaxes, "../language-configuration.json")).json();
  // A string: tools that read it, Better Comments among them, skip the object form.
  expect(comments).toEqual({ lineComment: "//-" });
});
