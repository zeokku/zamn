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
    return { scopeName, ...nothing, repository: { expression: nothing, "property-values": nothing } } as any;
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
        .filter((s) => !/^(source\.zamn|text\.html\.vue|meta\.(tag|attributes|raw)\.zamn)$/.test(s))
        .map((s) => s.replace(/\.zamn$/, ""));
      out.push(scopes.length ? `${text}  ${scopes.join(" ")}` : text);
    }
  }
  return out;
}

const TAG = "entity.name.tag";
const ID = "entity.other.attribute-name.id";
const CLASS = "entity.other.attribute-name.class";
const BEGIN = "{  punctuation.section.block.begin";
const END = "}  punctuation.section.block.end";
const PIPE = "|  punctuation.definition.text";
const MUSTACHE = "meta.interpolation.expression";
const INLINE = "meta.interpolation.tag";
const ESCAPE = "constant.character.escape";

test("tags, ids, classes and text", async () => {
  expect(await tokens("main#app.page Hello .not #a-class")).toEqual([
    `main  ${TAG}`,
    `#app  ${ID}`,
    `.page  ${CLASS}`,
    "Hello .not #a-class",
  ]);
  expect(await tokens("MyButton\nsvg:path")).toEqual([`MyButton  ${TAG}`, `svg:path  ${TAG}`]);
});

test("Tailwind classes", async () => {
  const classes = [
    ".w-[10px]",
    ".hover:bg-red-500",
    ".md:w-1/2",
    ".bg-red-500/50",
    ".[&>*]:p-2",
    ".data-[state=open]:x",
    ".content-['a']",
    ".bg-(--brand)",
    ".!font-bold",
    ".font-bold!",
    ".@md:flex",
    ".*:p-2",
    ".from-10%",
    ".-mt-4",
    ".p-0.5",
  ];
  const expected = classes.map((c) => `${c}  ${CLASS}`);
  // at the start of a statement, after a tag, and inside a one-line block
  expect(await tokens(`${classes.join("")} x`)).toEqual([...expected, "x"]);
  expect(await tokens(`div${classes.join("")} x`)).toEqual([`div  ${TAG}`, ...expected, "x"]);
  expect(await tokens(`p{${classes.join("")}}`)).toEqual([`p  ${TAG}`, BEGIN, ...expected, END]);
  // `:` and `/` that no class character follows are not part of the class
  expect(await tokens("li.a: b x\n.a/")).toEqual([
    `li  ${TAG}`,
    `.a  ${CLASS}`,
    ":  punctuation.separator.expansion",
    `b  ${TAG}`,
    "x",
    `.a  ${CLASS}`,
    "/  invalid.illegal.unsupported",
  ]);
});

test("attributes", async () => {
  expect(await tokens(`a(href="/a\\"b", target='_blank' n=1 on=true bare=word disabled) x`)).toEqual([
    `a  ${TAG}`,
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
    `Card  ${TAG}`,
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

test("unquoted values, bindings in brackets and style objects", async () => {
  const directive = "meta.attribute.directive";
  expect(await tokens("a(href=/docs/ :class={ on: x } :style={a: b}) x")).toEqual([
    `a  ${TAG}`,
    "(  punctuation.section.attributes.begin",
    "href  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    "/docs/  string.unquoted",
    `:class  ${directive} entity.other.attribute-name.directive`,
    `=  ${directive} keyword.operator.assignment`,
    `{  ${directive} source.ts.embedded meta.brace`,
    ` on: x   ${directive} source.ts.embedded`,
    `}  ${directive} source.ts.embedded meta.brace`,
    `:style  ${directive} entity.other.attribute-name.directive`,
    `=  ${directive} keyword.operator.assignment`,
    `{  ${directive} source.ts.embedded meta.brace`,
    `a: b  ${directive} source.ts.embedded`,
    `}  ${directive} source.ts.embedded meta.brace`,
    ")  punctuation.section.attributes.end",
    "x",
  ]);
  // Values are CSS (`source.css#property-values`, a grammar that matches
  // nothing here); a `,` in parentheses does not end one.
  const style = "meta.attribute.style";
  const value = `${style} meta.property-value`;
  expect(await tokens("a(style={fontSize: 12px, 'font-weight': bold, --brand: rgb(0, 0, 0), color: 'red'})")).toEqual([
    `a  ${TAG}`,
    "(  punctuation.section.attributes.begin",
    `style  ${style} entity.other.attribute-name`,
    `=  ${style} keyword.operator.assignment`,
    `{  ${style} punctuation.section.style.begin`,
    `fontSize  ${style} support.type.property-name`,
    `:  ${style} punctuation.separator.key-value`,
    `12px  ${value}`,
    `,  ${style} punctuation.separator.comma`,
    `'  ${style} punctuation.definition.string.begin`,
    `font-weight  ${style} support.type.property-name`,
    `'  ${style} punctuation.definition.string.end`,
    `:  ${style} punctuation.separator.key-value`,
    `bold  ${value}`,
    `,  ${style} punctuation.separator.comma`,
    `--brand  ${style} variable.other.custom-property`,
    `:  ${style} punctuation.separator.key-value`,
    `rgb  ${value}`,
    `(  ${value}`,
    `0, 0, 0  ${value}`,
    `)  ${value}`,
    `,  ${style} punctuation.separator.comma`,
    `color  ${style} support.type.property-name`,
    `:  ${style} punctuation.separator.key-value`,
    `'  ${value} string.quoted.single punctuation.definition.string.begin`,
    `red  ${value} string.quoted.single`,
    `'  ${value} string.quoted.single punctuation.definition.string.end`,
    `}  ${style} punctuation.section.style.end`,
    ")  punctuation.section.attributes.end",
  ]);
});

test("blocks over lines, expansion and output", async () => {
  const source = zamn`
    ul.list {
      li: a(href="/") Home
      p= message
      footer { }
      .a {
        .b {
          p x }}
    }
    = total
  `;
  expect(await tokens(source)).toEqual([
    `ul  ${TAG}`,
    `.list  ${CLASS}`,
    BEGIN,
    `li  ${TAG}`,
    ":  punctuation.separator.expansion",
    `a  ${TAG}`,
    "(  punctuation.section.attributes.begin",
    "href  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "/  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    "Home",
    `p  ${TAG}`,
    "=  keyword.operator.output",
    " message  source.ts.embedded",
    `footer  ${TAG}`,
    BEGIN,
    END,
    `.a  ${CLASS}`,
    BEGIN,
    `.b  ${CLASS}`,
    BEGIN,
    `p  ${TAG}`,
    "x ",
    END,
    END,
    END,
    "=  keyword.operator.output",
    " total  source.ts.embedded",
  ]);
});

test("blocks on one line: a statement may follow a `}`", async () => {
  expect(await tokens("ul {li{a x} li{b y}}\n.cl{.cl2{b text \\{x\\} \\}}}")).toEqual([
    `ul  ${TAG}`,
    BEGIN,
    `li  ${TAG}`,
    BEGIN,
    `a  ${TAG}`,
    "x",
    END,
    `li  ${TAG}`,
    BEGIN,
    `b  ${TAG}`,
    "y",
    END,
    END,
    `.cl  ${CLASS}`,
    BEGIN,
    `.cl2  ${CLASS}`,
    BEGIN,
    `b  ${TAG}`,
    "text ",
    `\\{  ${ESCAPE}`,
    "x",
    `\\}  ${ESCAPE}`,
    `\\}  ${ESCAPE}`,
    END,
    END,
  ]);
});

test("text: mustaches, #{} inline elements, escapes and unescaped braces", async () => {
  const source = zamn`
    p some {{ a }} and #{b= c} \\#{d\\} \\#[e] #[f]
    p { | some #{b biba #{i x}} boba }
    p {{ x }}}
    div{{ y }}
    p bad { brace
  `;
  expect(await tokens(source)).toEqual([
    `p  ${TAG}`,
    "some ",
    `{{  ${MUSTACHE} punctuation.definition.interpolation.begin`,
    ` a   ${MUSTACHE} source.ts.embedded`,
    `}}  ${MUSTACHE} punctuation.definition.interpolation.end`,
    " and ",
    `#{  ${INLINE} punctuation.section.embedded.begin`,
    `b  ${INLINE} ${TAG}`,
    `=  ${INLINE} keyword.operator.output`,
    ` c  ${INLINE} source.ts.embedded`,
    `}  ${INLINE} punctuation.section.embedded.end`,
    `\\#{  ${ESCAPE}`,
    "d",
    `\\}  ${ESCAPE}`,
    `\\#[  ${ESCAPE}`,
    "e] ",
    "#[  invalid.illegal.unsupported",
    "f]",
    `p  ${TAG}`,
    BEGIN,
    PIPE,
    " some ",
    `#{  ${INLINE} punctuation.section.embedded.begin`,
    `b  ${INLINE} ${TAG}`,
    `biba   ${INLINE}`,
    `#{  ${INLINE} ${INLINE} punctuation.section.embedded.begin`,
    `i  ${INLINE} ${INLINE} ${TAG}`,
    `x  ${INLINE} ${INLINE}`,
    `}  ${INLINE} ${INLINE} punctuation.section.embedded.end`,
    `}  ${INLINE} punctuation.section.embedded.end`,
    " boba ",
    END,
    // `}}` closes a mustache, and the `}` after it a block
    `p  ${TAG}`,
    `{{  ${MUSTACHE} punctuation.definition.interpolation.begin`,
    ` x   ${MUSTACHE} source.ts.embedded`,
    `}}  ${MUSTACHE} punctuation.definition.interpolation.end`,
    END,
    `div  ${TAG}`,
    `{{  ${MUSTACHE} punctuation.definition.interpolation.begin`,
    ` y   ${MUSTACHE} source.ts.embedded`,
    `}}  ${MUSTACHE} punctuation.definition.interpolation.end`,
    `p  ${TAG}`,
    "bad ",
    "{  invalid.illegal.unescaped-brace",
    " brace",
  ]);
});

test("pipes: `| text`, `div | text`, `|{ }` and `\\|`", async () => {
  const source = zamn`
    | text
    div | some text
    div |{ some text }
    div|{ x }
    | { y }
    div \\| x
    pre |{
      line {{ a }} #{b c}
        \\} deeper
    }
  `;
  expect(await tokens(source)).toEqual([
    PIPE,
    " text",
    `div  ${TAG}`,
    PIPE,
    " some text",
    `div  ${TAG}`,
    PIPE,
    BEGIN,
    " some text ",
    END,
    `div  ${TAG}`,
    PIPE,
    BEGIN,
    " x ",
    END,
    PIPE,
    BEGIN,
    " y ",
    END,
    `div  ${TAG}`,
    `\\|  ${ESCAPE}`,
    " x",
    `pre  ${TAG}`,
    PIPE,
    BEGIN,
    "  line ",
    `{{  ${MUSTACHE} punctuation.definition.interpolation.begin`,
    ` a   ${MUSTACHE} source.ts.embedded`,
    `}}  ${MUSTACHE} punctuation.definition.interpolation.end`,
    `#{  ${INLINE} punctuation.section.embedded.begin`,
    `b  ${INLINE} ${TAG}`,
    `c  ${INLINE}`,
    `}  ${INLINE} punctuation.section.embedded.end`,
    `\\}  ${ESCAPE}`,
    " deeper",
    END,
  ]);
});

test("comments: `//` and `/* */` are left out, `//!` and `/*! */` are emitted", async () => {
  const source = zamn`
    // silent }
    //! shown
    //- dash
    div { /* note */ b x } // after
    /*! kept
      } still */
    /*
      gone
    */
    p see https://x.y // and /* this */
  `;
  const silent = "comment.line.double-slash";
  const block = "comment.block";
  const buffered = "string.comment.buffered.block";
  expect(await tokens(source)).toEqual([
    `//  ${silent} punctuation.definition.comment`,
    ` silent }  ${silent}`,
    `//!  ${buffered} punctuation.definition.comment`,
    ` shown  ${buffered}`,
    `//  ${silent} punctuation.definition.comment`,
    `- dash  ${silent}`,
    `div  ${TAG}`,
    BEGIN,
    `/*  ${block} punctuation.definition.comment`,
    ` note   ${block}`,
    `*/  ${block} punctuation.definition.comment`,
    `b  ${TAG}`,
    "x ",
    END,
    `//  ${silent} punctuation.definition.comment`,
    ` after  ${silent}`,
    `/*!  ${buffered} punctuation.definition.comment`,
    ` kept  ${buffered}`,
    `  } still   ${buffered}`,
    `*/  ${buffered} punctuation.definition.comment`,
    `/*  ${block} punctuation.definition.comment`,
    `  gone  ${block}`,
    `*/  ${block} punctuation.definition.comment`,
    `p  ${TAG}`,
    "see https://x.y // and /* this */",
  ]);
});

test("script and style: raw content up to `/script` and `/style`", async () => {
  const source = zamn`
    script.a(type="module")
    (function () {})()
    if (a) { go() }
      const s = "/script"
    /script
    script(src="a.js")
    script(:src="x")
    head {
      style
      .a { color: red }
      /style
    }
    /script
    /div
  `;
  expect(await tokens(source)).toEqual([
    `script  ${TAG}`,
    `.a  ${CLASS}`,
    "(  punctuation.section.attributes.begin",
    "type  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "module  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    "(function () {})()  source.js.embedded",
    "if (a) { go() }  source.js.embedded",
    '  const s = "/script"  source.js.embedded',
    "/  punctuation.definition.tag.end",
    `script  ${TAG}`,
    // with `src`, a script has no content
    `script  ${TAG}`,
    "(  punctuation.section.attributes.begin",
    "src  entity.other.attribute-name",
    "=  keyword.operator.assignment",
    '"  string.quoted.double punctuation.definition.string.begin',
    "a.js  string.quoted.double",
    '"  string.quoted.double punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    `script  ${TAG}`,
    "(  punctuation.section.attributes.begin",
    ":src  meta.attribute.directive entity.other.attribute-name.directive",
    "=  meta.attribute.directive keyword.operator.assignment",
    '"  meta.attribute.directive punctuation.definition.string.begin',
    "x  meta.attribute.directive source.ts.embedded",
    '"  meta.attribute.directive punctuation.definition.string.end',
    ")  punctuation.section.attributes.end",
    `head  ${TAG}`,
    BEGIN,
    `style  ${TAG}`,
    "  .a { color: red }  source.css.embedded",
    "/  punctuation.definition.tag.end",
    `style  ${TAG}`,
    END,
    "/script  invalid.illegal.unmatched-close",
    "/div  invalid.illegal.unmatched-close",
  ]);
});

test("doctype, and what zamn does not have", async () => {
  const source = zamn`
    doctype html
    <div :a="b">{{ c }}</div>
    if user
    - var x = 1
    +card
    {{ a }} text
    #{b x}
    img/
    p.
    p ok
  `;
  const unexpected = "invalid.illegal.unexpected-text";
  expect(await tokens(source)).toEqual([
    "doctype  meta.tag.sgml.doctype entity.name.tag.doctype",
    "html  meta.tag.sgml.doctype string.unquoted.doctype",
    '<div :a="b">{{ c }}</div>  invalid.illegal.unsupported',
    "if  invalid.illegal.unsupported",
    " user",
    "- var x = 1  invalid.illegal.unsupported",
    "+card  invalid.illegal.unsupported",
    // text must start with `|`
    `{{  ${unexpected} ${MUSTACHE} punctuation.definition.interpolation.begin`,
    ` a   ${unexpected} ${MUSTACHE} source.ts.embedded`,
    `}}  ${unexpected} ${MUSTACHE} punctuation.definition.interpolation.end`,
    ` text  ${unexpected}`,
    `#{  ${unexpected} ${INLINE} punctuation.section.embedded.begin`,
    `b  ${unexpected} ${INLINE} ${TAG}`,
    `x  ${unexpected} ${INLINE}`,
    `}  ${unexpected} ${INLINE} punctuation.section.embedded.end`,
    `img  ${TAG}`,
    "/  invalid.illegal.unsupported",
    `p  ${TAG}`,
    ".  invalid.illegal.unsupported",
    `p  ${TAG}`,
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
    `p  ${TAG}`,
    `.a  ${CLASS}`,
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

test("the comments of the language are the ones left out of the output", async () => {
  const { comments, folding } = await Bun.file(resolve(syntaxes, "../language-configuration.json")).json();
  // A string: tools that read it, Better Comments among them, skip the object form.
  expect(comments).toEqual({ lineComment: "//", blockComment: ["/*", "*/"] });
  // Nesting is by braces: no off-side folding.
  expect(folding).toBeUndefined();
});

test("every embedded scope is mapped to its language", async () => {
  const { contributes } = await Bun.file(resolve(syntaxes, "../package.json")).json();
  const grammar = await Bun.file(resolve(syntaxes, "zamn.tmLanguage.json")).text();
  const scopes = [...new Set(grammar.match(/source\.\w+\.embedded\.zamn/g))].sort();
  expect(scopes).toEqual(["source.css.embedded.zamn", "source.js.embedded.zamn", "source.ts.embedded.zamn"]);
  for (const { embeddedLanguages } of contributes.grammars) {
    for (const scope of scopes) expect(embeddedLanguages[scope]).toBeString();
  }
});
