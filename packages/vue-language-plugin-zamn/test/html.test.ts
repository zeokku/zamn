import { expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import { compile } from "zamn";
import { toHtml, toSourceOffset } from "../html.js";
import { zamn } from "../../../tests/zamn.ts";

const fixtures = resolve(import.meta.dir, "../../../tests/fixtures");

/** Where in the source the text `needle` of the HTML comes from. */
function origin(source: string, needle: string) {
  const { html, segments } = toHtml(source);
  const at = html.indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  return toSourceOffset(segments, at);
}

for (const file of new Glob("{braces,zamn}/**/*.zamn").scanSync(fixtures)) {
  test(`fixture ${file}: every segment is a copy of the source`, async () => {
    const source = await Bun.file(resolve(fixtures, file)).text();
    const { html, segments, diagnostics } = toHtml(source);
    expect(diagnostics).toEqual([]);
    expect(segments.some(([, , length]) => length > 0)).toBe(true);
    let previous = 0;
    for (const [generated, from, length] of segments) {
      expect(generated).toBeGreaterThanOrEqual(previous);
      previous = generated;
      expect(html.slice(generated, generated + length)).toBe(source.slice(from, from + length));
    }
  });
}

test("is the HTML that compile() makes, up to escaping and void tags", () => {
  const source = zamn`
    .card(:class="{ active: isActive }" @click="select(item)") {
      h2.title= item.title
      p(v-if="ok") Plain #[strong= count] items
      MyButton(v-model.trim="value" #default="{ row }" disabled) Go
      // note
      //- silent
    }
  `;
  expect(toHtml(source).html).toBe(compile(source, { doctype: "html" }).code);
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
    .box#main
      MyButton(:to="route" @click="go") Go {{ now }}
      p= message
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
  // An end tag sits at the end of the element's content.
  expect(origin(source, "</MyButton>")).toBe(at("}}") + 2);
  expect(origin(source, "</div>")).toBe(source.trimEnd().length);
});

test("an offset between segments belongs to the end of the one before", () => {
  const source = "p= message";
  const { html, segments } = toHtml(source);
  expect(html).toBe("<p>{{ message }}</p>");
  expect(toSourceOffset(segments, html.indexOf(" }}") + 2)).toBe(source.length);
  expect(toSourceOffset(segments, html.length)).toBe(source.length);
});

test("a comment maps so that offsets counted from <!-- land in its text", () => {
  const source = "// @vue-generic {T}\nList";
  const { html, segments } = toHtml(source);
  const start = toSourceOffset(segments, html.indexOf("<!--"));
  expect(start + html.indexOf("{T}")).toBe(source.indexOf("{T}"));
});

test("a template with errors still gives HTML for the rest", () => {
  const { html, diagnostics } = toHtml(zamn`
    if x
      p no
    p(:title="t") ok
  `);
  expect(diagnostics.map((d) => d.code)).toEqual(["UNSUPPORTED_SYNTAX"]);
  expect(html).toContain('<p :title="t">ok</p>');
});
