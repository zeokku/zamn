import { expect, test } from "bun:test";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { compile, lex, parse, ZamnError, type CompileResult } from "zamn";
import { zamn } from "../../../tests/zamn.ts";

test("compiles the brace example", () => {
  const source = zamn`
    div {
      .another-div {
        button Text
        p { }
      }
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

test("braces in text are escaped with a backslash", () => {
  const source = zamn`
    p(data-x=10) {
      | some \\{ paragraph \\}
    }
    p.a \\{ ok \\}
  `;
  expect(compile(source).code).toBe(
    '<p data-x="10">some { paragraph }</p><p class="a">{ ok }</p>',
  );
  expect(parse("p some { text").diagnostics.map((d) => d.code)).toEqual(["UNESCAPED_BRACE"]);
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

test("text is escaped; character references, mustaches and scripts are not", () => {
  expect(compile("div some text <b>real bold lol</b>").code).toBe(
    "<div>some text &lt;b&gt;real bold lol&lt;/b&gt;</div>",
  );
  expect(compile("p Tom & Jerry&nbsp;&#169;&#xA9; {{ a < b && c }}").code).toBe(
    "<p>Tom &amp; Jerry&nbsp;&#169;&#xA9; {{ a < b && c }}</p>",
  );
  const source = zamn`
    script
    if (a < b && c) { go() }
    /script
    p= a < b
  `;
  expect(compile(source).code).toBe("<script>if (a < b && c) { go() }</script><p>{{ a < b }}</p>");
});

test("output is HTML5: void tags without a slash, terse booleans", () => {
  const source = zamn`
    doctype html
    input(disabled checked=false required=true)
    img(src=a.png)
  `;
  expect(compile(source).code).toBe(
    '<!DOCTYPE html><input disabled required><img src="a.png">',
  );
});

test("shorthand classes escape quotes only", () => {
  expect(compile(".content-['a\"b'].[&>*]:p-2 x").code).toBe(
    "<div class=\"content-['a&quot;b'] [&>*]:p-2\">x</div>",
  );
});

test("lex returns tokens with UTF-16 ranges", () => {
  const source = "p 😀 #{b x}";
  const { tokens, diagnostics } = lex(source);
  expect(diagnostics).toEqual([]);
  for (const t of tokens) {
    expect(source.slice(...t.range)).toBe(t.value);
    expect([t.loc.start.offset, t.loc.end.offset]).toEqual(t.range);
  }
  expect(tokens.map((t) => t.type)).toEqual([
    "Tag", "Text", "InterpStart", "Tag", "Text", "InterpEnd", "Eos",
  ]);
});

test("parse returns an AST and keeps going after errors", () => {
  const { ast, diagnostics } = parse(zamn`
    if x
    .a(href=b + c)
    p ok
  `);
  expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
    ["UNSUPPORTED_SYNTAX", "error"],
    ["JS_EXPRESSION", "error"],
  ]);
  expect(diagnostics[0]!.loc.start).toEqual({ line: 1, column: 0, offset: 0 });
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
    expect(err.diagnostics[0]!.severity).toBe("error");
    expect(err.diagnostics[0]!.hint).toContain("no JavaScript");
  }
});

// Indented deeper than the line before, with no block open.
const misleading = zamn`
  div {
    p a
      p b
  }
`;

test("warnings are returned, not thrown", () => {
  const result = compile(misleading, { filename: "warn.zamn" });
  expect(result.code).toBe("<div><p>a</p><p>b</p></div>");
  expect(result.warnings.map((d) => [d.code, d.severity, d.filename])).toEqual([
    ["MISLEADING_INDENTATION", "warning", "warn.zamn"],
  ]);
  expect(result.warnings[0]!.loc.start.line).toBe(3);
  expect(compile("p ok").warnings).toEqual([]);
});

test("a ZamnError lists the errors, then the warnings", () => {
  try {
    compile(misleading + "p {\n");
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(ZamnError);
    const err = e as ZamnError;
    expect(err.code).toBe("UNCLOSED_BRACE");
    expect(err.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["UNCLOSED_BRACE", "error"],
      ["MISLEADING_INDENTATION", "warning"],
    ]);
  }
});

test("options: interpolation delimiters", () => {
  expect(compile("p= x", { interpolation: ["${", "}"] }).code).toBe("<p>${ x }</p>");
});

// Where in the source does the text `needle` in the output come from?
function trace(result: CompileResult, needle: string) {
  const offset = result.code.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const before = result.code.slice(0, offset).split("\n");
  const pos = originalPositionFor(new TraceMap(result.map as any), {
    line: before.length,
    column: before.at(-1)!.length,
  });
  return { source: pos.source, line: pos.line, column: pos.column };
}

test("source map points at tags, attributes, text and expressions", () => {
  const source = zamn`
    div {
      a.link(href='/x' title="t") Héllo 😀 &lt; #{b bold}
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
  // Columns are UTF-16: the emoji before `#{b` counts as two.
  expect(at("<b>")).toEqual({ source: "a.zamn", line: 2, column: 46 });
  expect(at("msg")).toEqual({ source: "a.zamn", line: 3, column: 5 });
});
