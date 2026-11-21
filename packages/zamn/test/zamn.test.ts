import { expect, test } from "bun:test";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { compile, lex, parse, ZamnError } from "../index.js";
import { zamn } from "../../../tests/zamn.ts";

test("compiles the brace example", () => {
  const source = zamn`
    div
      .another-div {
        button Text
        p { }
      }
  `;
  expect(compile(source).code).toBe(
    '<div><div class="another-div"><button>Text</button><p></p></div></div>',
  );
});

test("whitespace at the end of a line is ignored; a bare | is a space", () => {
  const source = zamn`
    p {
      b this${"  "}
      |${"  "}
      | is
      |
      u cool
    }
    b some text${"  "}
  `;
  expect(compile(source).code).toBe("<p><b>this</b> is <u>cool</u></p><b>some text</b>");
});

test("braces after text are text", () => {
  const source = zamn`
    p(data-x=10) {
      | some { paragraph }
    }
    p some paragraph { ok
    p ends with {
    p.a \\{ ok }
  `;
  expect(compile(source).code).toBe(
    '<p data-x="10">some { paragraph }</p><p>some paragraph { ok</p><p>ends with {</p>' +
      '<p class="a">{ ok }</p>',
  );
});

test("a block can open and close on one line", () => {
  expect(compile(".cl{.cl2{b text}}").code).toBe(
    '<div class="cl"><div class="cl2"><b>text</b></div></div>',
  );
  expect(compile("ul {li{a x} li{b y}}").code).toBe(
    "<ul><li><a>x</a></li><li><b>y</b></li></ul>",
  );
  expect(parse("p{b x").diagnostics.map((d) => d.code)).toEqual(["UNCLOSED_BRACE"]);
});

test("lex returns tokens with UTF-16 ranges", () => {
  const source = "p 😀 #[b x]";
  const { tokens, diagnostics } = lex(source);
  expect(diagnostics).toEqual([]);
  for (const t of tokens) expect(source.slice(...t.range)).toBe(t.value);
  expect(tokens.map((t) => t.type)).toEqual([
    "Tag", "Text", "InterpStart", "Tag", "Text", "InterpEnd", "Eos",
  ]);
});

test("parse returns an AST and keeps going after errors", () => {
  const { ast, diagnostics } = parse(zamn`
    if x
      p no
    .a(href=b + c)
    p ok
  `);
  expect(diagnostics.map((d) => d.code)).toEqual(["UNSUPPORTED_SYNTAX", "JS_EXPRESSION"]);
  expect(diagnostics[0]!.loc.start).toEqual({ line: 1, column: 0 });
  expect(ast.type).toBe("Root");
  expect(ast.nodes.map((n) => n.type === "Element" && n.name)).toEqual(["div", "p"]);
});

test("compile throws a ZamnError with a location", () => {
  try {
    const source = zamn`
      p ok
      - var x
    `;
    compile(source, { filename: "bad.zamn" });
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(ZamnError);
    const err = e as ZamnError;
    expect(err.loc).toEqual({ file: "bad.zamn", line: 2, column: 0 });
    expect(err.diagnostics[0]!.hint).toContain("no JavaScript");
  }
});

test("options: doctype and interpolation delimiters", () => {
  const source = zamn`
    input(disabled)
    p= x
  `;
  expect(compile(source, { doctype: "html", interpolation: ["${", "}"] }).code).toBe(
    "<input disabled><p>${ x }</p>",
  );
});

// Where in the source does the text `needle` in the output come from?
function trace(result: { code: string; map: any }, needle: string) {
  const offset = result.code.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const before = result.code.slice(0, offset).split("\n");
  const pos = originalPositionFor(new TraceMap(result.map), {
    line: before.length,
    column: before.at(-1)!.length,
  });
  return { source: pos.source, line: pos.line, column: pos.column };
}

test("source map points at tags, attributes, text and expressions", () => {
  const source = zamn`
    div {
      a.link(href='/x' title="t") Héllo 😀 #[b bold]
      p= msg
    }
  `;
  const result = compile(source, { filename: "a.zamn", sourceMap: true });
  expect(result.map!.sources).toEqual(["a.zamn"]);
  expect(result.map!.sourcesContent).toEqual([source]);
  const at = (needle: string) => trace(result, needle);
  expect(at("<a")).toEqual({ source: "a.zamn", line: 2, column: 2 });
  expect(at("href=")).toEqual({ source: "a.zamn", line: 2, column: 9 });
  expect(at("/x")).toEqual({ source: "a.zamn", line: 2, column: 14 });
  expect(at("Héllo")).toEqual({ source: "a.zamn", line: 2, column: 30 });
  // Columns are UTF-16: the emoji before `#[b` counts as two.
  expect(at("<b>")).toEqual({ source: "a.zamn", line: 2, column: 41 });
  expect(at("msg")).toEqual({ source: "a.zamn", line: 3, column: 5 });
});
