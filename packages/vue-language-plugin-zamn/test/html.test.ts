import { expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import { parse as parseSfc } from "vue/compiler-sfc";
import { compile } from "zamn";
import { toHtml, toSourceOffset } from "../dist/html.js";
import { zamn } from "../../../tests/zamn.ts";

const fixtures = resolve(import.meta.dir, "../../../tests/fixtures");

/** Where in the source the text `needle` of the HTML comes from. */
function origin(source: string, needle: string, side: "start" | "end" = "start") {
  const { html, segments } = toHtml(source);
  const at = html.indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  return toSourceOffset(segments, side === "end" ? at + needle.length : at, side);
}

/**
 * HTML as Vue's compiler reads it: elements with their attributes, text,
 * interpolations and comments, with character references resolved. The
 * classes of an element are joined into one attribute: they are separate
 * here, so that each maps to its own `.class`. A doctype is left out, as here.
 */
function vueTree(html: string): unknown {
  // Errors don't matter here (duplicate classes, expressions that aren't
  // JavaScript): only what Vue reads.
  const { descriptor } = parseSfc(`<template>${html.replace(/^<!DOCTYPE [^>]*>/, "")}</template>`);
  const tree = (node: any): unknown => {
    switch (node.type) {
      case 1: {
        const props: string[] = [];
        const classes: string[] = [];
        for (const prop of node.props) {
          if (prop.type === 7) props.push(`${prop.rawName}=${prop.exp?.content ?? ""}`);
          else if (prop.name === "class") classes.push(prop.value?.content ?? "");
          else props.push(prop.value ? `${prop.name}=${prop.value.content}` : prop.name);
        }
        if (classes.length) props.unshift(`class=${classes.join(" ")}`);
        return { tag: node.tag, props, children: node.children.map(tree) };
      }
      case 2:
        return node.content;
      case 3:
        return `<!--${node.content}-->`;
      case 5:
        return `{{${node.content.content}}}`;
      default:
        throw new Error(`unexpected node type ${node.type}`);
    }
  };
  return descriptor.template!.ast!.children.map(tree);
}

for (const file of new Glob("{braces,zamn}/**/*.zamn").scanSync(fixtures)) {
  test(`fixture ${file}: every segment is a copy of the source`, async () => {
    const source = await Bun.file(resolve(fixtures, file)).text();
    const { html, segments, diagnostics } = toHtml(source);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(segments.some(([, , length]) => length > 0)).toBe(true);
    let previous = 0;
    for (const [generated, from, length] of segments) {
      expect(generated).toBeGreaterThanOrEqual(previous);
      previous = generated;
      expect(html.slice(generated, generated + length)).toBe(source.slice(from, from + length));
    }
  });

  test(`fixture ${file}: Vue reads the HTML as it reads compile()'s`, async () => {
    const source = await Bun.file(resolve(fixtures, file)).text();
    expect(vueTree(toHtml(source).html)).toEqual(vueTree(compile(source).code));
  });
}

test("is the HTML that compile() makes, but for classes", () => {
  const source = zamn`
    .card(:class="{ active: isActive }" @click="select(item)") {
      h2.title= item.title
      p(v-if="ok") Plain #{strong= count} items, #{em: b {{ n }}} more
      MyButton(v-model.trim="value" #default="{ row }" disabled) Go
      // left out
      //! kept
      /* left out
         too */
      /*! kept
         as well */
      pre |{
        a < b & c &amp; d
          {{ x }}
      }
      p | \\{ braces \\} and \\| a pipe
      input(type="checkbox" checked=true hidden=false)
      img(src="a.png" style={ fontSize: '12px', marginTop: 4px })
      p(style={}) no style
      script
        if (a < b && c) { go() }
      /script
    }
  `;
  expect(toHtml(source).html).toBe(compile(source).code);
});

test("each class is an attribute of its own, mapped to its `.`", () => {
  const source = "p.md:flex.w-[42rem](class=\"a\") x";
  const { html } = toHtml(source);
  expect(html).toBe('<p class="md:flex" class="w-[42rem]" class="a">x</p>');
  expect(compile(source).code).toBe('<p class="md:flex w-[42rem] a">x</p>');
  expect(origin(source, 'class="w-[42rem]"')).toBe(source.indexOf(".w-"));
});

test("text is escaped as compile() escapes it, and copied where nothing is", () => {
  const source = "p a < b {{ c > d }} &amp; & &#x1F; &#123; &x";
  const { html, segments } = toHtml(source);
  expect(html).toBe("<p>a &lt; b {{ c > d }} &amp; &amp; &#x1F; &#123; &amp;x</p>");
  expect(html).toBe(compile(source).code);
  for (const [generated, from, length] of segments) {
    expect(html.slice(generated, generated + length)).toBe(source.slice(from, from + length));
  }
  // The text around `<` keeps its place; `&lt;` maps to the `<`.
  expect(origin(source, " b ")).toBe(source.indexOf(" b "));
  expect(origin(source, "&lt;")).toBe(source.indexOf("<"));
  // A mustache is copied as it is.
  expect(origin(source, "c > d")).toBe(source.indexOf("c > d"));
});

test("attribute values keep their length", () => {
  const { html } = toHtml(zamn`
    a(:x="a && b < c" :y='say("hi")' :z="a&b" n=1 on=true off=false alt="it\\'s")
  `);
  expect(html).toBe(
    `<a :x="a && b < c" :y='say("hi")' :z="a&#38;b" n="1" on alt="it&#39;s"></a>`,
  );
});

test("maps names, values, text and expressions", () => {
  const source = zamn`
    .box#main {
      MyButton(:to="route" @click="go") Go {{ now }}
      p= message
    }
  `;
  const at = (needle: string) => source.indexOf(needle);
  // An implicit div starts at its first shorthand.
  expect(origin(source, "<div")).toBe(0);
  // Shorthands map to the `.` or `#`, as Vue expects.
  expect(origin(source, 'class="box"')).toBe(at(".box"));
  expect(origin(source, "box")).toBe(at("box"));
  expect(origin(source, 'id="main"')).toBe(at("#main"));
  // `<` maps to the tag name, which is where Vue looks for it.
  expect(origin(source, "<MyButton")).toBe(at("MyButton"));
  expect(origin(source, ":to")).toBe(at(":to"));
  expect(origin(source, '"route"')).toBe(at('"route"'));
  expect(origin(source, "route")).toBe(at("route"));
  expect(origin(source, "now")).toBe(at("now"));
  expect(origin(source, "message")).toBe(at("message"));
  // An element without a block ends after its content.
  expect(origin(source, "</MyButton>")).toBe(at("}}") + 2);
  expect(origin(source, "</MyButton>", "end")).toBe(at("}}") + 2);
  // One with a block ends at its `}`.
  expect(origin(source, "</div>")).toBe(source.lastIndexOf("}"));
  expect(origin(source, "</div>", "end")).toBe(source.lastIndexOf("}") + 1);
});

test("end tags go on the `}` of `|{ }`, of `#{ }` and on `/script`", () => {
  const source = zamn`
    p |{
      text
    }
    p a #{b(:x="y") bold } c
    script
      go()
    /script
  `;
  const at = (needle: string) => source.indexOf(needle);
  expect(origin(source, "</p>")).toBe(at("}"));
  expect(origin(source, "</p>", "end")).toBe(at("}") + 1);
  expect(origin(source, "</b>")).toBe(at("} c"));
  expect(origin(source, "</b>", "end")).toBe(at("} c") + 1);
  expect(origin(source, "</script>")).toBe(at("/script"));
  expect(origin(source, "</script>", "end")).toBe(at("/script") + "/script".length);
});

test("an offset between segments belongs to the end of the one before", () => {
  const source = "p= message";
  const { html, segments } = toHtml(source);
  expect(html).toBe("<p>{{ message }}</p>");
  expect(toSourceOffset(segments, html.indexOf(" }}") + 2)).toBe(source.length);
  expect(toSourceOffset(segments, html.length)).toBe(source.length);
});

test("an end offset at the start of a segment belongs to the one before", () => {
  const source = "b x\ni y";
  const { html, segments } = toHtml(source);
  expect(html).toBe("<b>x</b><i>y</i>");
  const between = html.indexOf("<i>");
  expect(toSourceOffset(segments, between)).toBe(source.indexOf("i"));
  expect(toSourceOffset(segments, between, "end")).toBe(source.indexOf("x") + 1);
});

test("a comment maps so that offsets counted from <!-- land in its text", () => {
  for (const source of ["//! @vue-generic {T}\nList", "/*! @vue-generic {T} */\nList"]) {
    const { html, segments } = toHtml(source);
    expect(html).toStartWith("<!-- @vue-generic {T}");
    const start = toSourceOffset(segments, html.indexOf("<!--"));
    expect(start + html.indexOf("{T}")).toBe(source.indexOf("{T}"));
  }
});

test("comments that are left out of the HTML are left out here too", () => {
  expect(toHtml("// a\n/* b */\np c").html).toBe("<p>c</p>");
});

test("a template with errors still gives HTML for the rest", () => {
  const { html, diagnostics } = toHtml(zamn`
    if x {
      p no
    }
    <b>bold</b>
    p(:title="t") ok
  `);
  expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
    ["error", "UNSUPPORTED_SYNTAX"],
    ["error", "UNSUPPORTED_SYNTAX"],
  ]);
  expect(html).toContain('<p :title="t">ok</p>');
});
