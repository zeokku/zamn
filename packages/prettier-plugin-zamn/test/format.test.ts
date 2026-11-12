import { expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as prettier from "prettier";
import { compile } from "zamn";
import * as plugin from "../index.js";
import { zamn } from "../../../tests/zamn.ts";

const fixtures = resolve(import.meta.dir, "../../../tests/fixtures");

const format = (source: string, options: prettier.Options = {}) =>
  prettier.format(source, { parser: "zamn", plugins: [plugin], ...options });

for (const file of new Glob("{braces,zamn}/**/*.zamn").scanSync(fixtures)) {
  test(`fixture ${file}: stable, and compiles to the same HTML`, async () => {
    const filename = resolve(fixtures, file);
    const source = readFileSync(filename, "utf8");
    const html = (s: string) => compile(s, { filename }).code;
    const formatted = await format(source);
    expect(await format(formatted)).toBe(formatted);
    expect(html(formatted)).toBe(html(source));
  });
}

test("is inferred from the .zamn extension", async () => {
  const out = await prettier.format("p(  a='b' )", { filepath: "x.zamn", plugins: [plugin] });
  expect(out).toBe('p(a="b")\n');
});

test("re-indents braces and indentation blocks", async () => {
  const source = zamn`
        html {
    body.page {
            nav#top
                ul {
                 li: a(href='/') Home
                }
            section {
            }
            p { }
    }
        }
  `;
  expect(await format(source)).toBe(zamn`
    html {
      body.page {
        nav#top {
          ul {
            li: a(href="/") Home
          }
        }
        section {}
        p {}
      }
    }
  `);
  expect(await format(source, { zamnBlockStyle: "preserve" })).toBe(zamn`
    html {
      body.page {
        nav#top
          ul {
            li: a(href="/") Home
          }
        section {}
        p {}
      }
    }
  `);
  expect(await format(source, { useTabs: true })).toContain('\n\t\t\t\tli: a(href="/") Home\n');
});

test("attributes: spacing, separators and quotes", async () => {
  const source = `a( href = '/x' ,title="say \\"hi\\"", alt='it\\'s'  data-x!='<b>' disabled n=1 )/`;
  expect(await format(source)).toBe(
    `a(href="/x" title='say "hi"' alt="it's" data-x!="<b>" disabled n=1)/\n`,
  );
  expect(await format(source, { singleQuote: true })).toBe(
    `a(href='/x' title='say "hi"' alt="it's" data-x!='<b>' disabled n=1)/\n`,
  );
  expect(compile(await format(source)).code).toBe(compile(source).code);
});

test("attributes break one per line when the head is too wide", async () => {
  const source = zamn`
    ul
      li: a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank" rel="noopener") Text
      a(href="/") Text after the head never counts towards the print width, however long it gets
      p here #[a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank") stays] inline
  `;
  const out = await format(source);
  expect(out).toBe(zamn`
    ul {
      li: a.link.link-external(
        href="https://example.com/a/rather/long/url"
        target="_blank"
        rel="noopener"
      ) Text
      a(href="/") Text after the head never counts towards the print width, however long it gets
      p here #[a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank") stays] inline
    }
  `);
  expect(await format(out)).toBe(out);
  expect(compile(out).code).toBe(compile(source).code);
});

test("multi-line attribute values are re-indented with the attribute", async () => {
  const source = zamn`
    main {
      div(:class="{
              a: b,

              c: d
            }" @click="go") {
        p hi
      }
    }
  `;
  const out = await format(source);
  expect(out).toBe(zamn`
    main {
      div(
        :class="{
          a: b,

          c: d
        }"
        @click="go"
      ) {
        p hi
      }
    }
  `);
  expect(await format(out)).toBe(out);
});

test("text, text blocks and comments are kept as written", async () => {
  const source = zamn`
    div {
          p Hello   #[em( title = 'x' )  world], \\#[escaped] {{ a }}
          p \\{
          |no space
          |
          script.

                if (a) {
                  go();

                }
          //   a comment${"   "}
              with a block
                that stays raw
          <div>
              b bold
          </div>
    }
  `;
  const out = await format(source);
  expect(out).toBe(zamn`
    div {
      p Hello   #[em(title="x")  world], \\#[escaped] {{ a }}
      p \\{
      | no space
      |
      script.
        if (a) {
          go();

        }
      //   a comment${"   "}
        with a block
          that stays raw
      <div>
        b bold
      </div>
    }
  `);
  expect(await format(out)).toBe(out);
  expect(compile(out).code).toBe(compile(source).code);
});

test("whitespace at the end of a text line is kept", async () => {
  const source = zamn`
    div {
        p text${" "}
            b bold
        span${" "}
        | piped${" "}
        <i>x</i>${" "}
        | last${" "}
    }
    p end${" "}
  `;
  const out = await format(source);
  expect(out).toBe(zamn`
    div {
      p text${" "}
        b bold
      span${" "}
      | piped${" "}
      <i>x</i>${" "}
      | last${" "}
    }
    p end${" "}
  `);
  expect(compile(out).code).toBe(compile(source).code);
  expect(compile(out).code).toContain("<p>text <b>bold</b></p><span> </span>");
});

test("blank lines between statements collapse to one", async () => {
  // Two blank lines before the doctype and one after the last line.
  const source = zamn`


    doctype   html



    html

      head
      body


        p a
        p b

  `;
  expect(await format(source)).toBe(zamn`
    doctype html

    html {
      head
      body {
        p a
        p b
      }
    }
  `);
  expect(await format("")).toBe("");
});

test("CRLF input", async () => {
  expect(await format("div {\r\n    p a\r\n}\r\n")).toBe("div {\n  p a\n}\n");
});

test("a template with errors is rejected with a location", async () => {
  try {
    await format(zamn`
      p ok
      if x
        p no
    `);
    throw new Error("should have thrown");
  } catch (e: any) {
    expect(e).toBeInstanceOf(SyntaxError);
    expect(e.message).toContain("`if` (control flow) is not supported");
    expect(e.loc.start).toEqual({ line: 2, column: 1 });
  }
});

test("formats <template lang=\"zamn\"> in Vue files", async () => {
  const source = zamn`
    <template lang="zamn">
    div {
          p(  a='b' ) hi
    }
    </template>
  `;
  expect(await prettier.format(source, { parser: "vue", plugins: [plugin] })).toBe(zamn`
    <template lang="zamn">
    div {
      p(a="b") hi
    }
    </template>
  `);
});

test("zamnAttributeSeparator: commas between attributes", async () => {
  const source = zamn`
    a(href='/' target="_blank"   disabled) Home
    a(href="/",target="_blank",
      disabled) Home
    input(type="text")
  `;
  expect(await format(source)).toBe(zamn`
    a(href="/" target="_blank" disabled) Home
    a(href="/" target="_blank" disabled) Home
    input(type="text")
  `);
  expect(await format(source, { zamnAttributeSeparator: "comma" })).toBe(zamn`
    a(href="/", target="_blank", disabled) Home
    a(href="/", target="_blank", disabled) Home
    input(type="text")
  `);
});

test("zamnAttributeSeparator: one attribute per line, and in Vue files", async () => {
  const source = zamn`
    <template lang="zamn">
    div(:class="{
      active: isActive
    }" @click="go" disabled)
    </template>
  `;
  const options = { parser: "vue", plugins: [plugin], zamnAttributeSeparator: "comma" as const };
  expect(await prettier.format(source, options)).toBe(zamn`
    <template lang="zamn">
    div(
      :class="{
        active: isActive
      }",
      @click="go",
      disabled
    )
    </template>
  `);
});

test("zamnBlockStyle: every element with children gets braces", async () => {
  const source = zamn`
    ul.list(
      :class="{ on }"
    )
      li: a(href="/")
        span Home
      li
        | piped
      p text on the line
        b cannot take braces
      p= expr
        b nor this
      script.
        let a = { b }
      // comment
        block
      <div>
        span raw
      </div>
  `;
  const out = await format(source);
  expect(out).toBe(zamn`
    ul.list(:class="{ on }") {
      li: a(href="/") {
        span Home
      }
      li {
        | piped
      }
      p text on the line
        b cannot take braces
      p= expr
        b nor this
      script.
        let a = { b }
      // comment
        block
      <div>
        span raw
      </div>
    }
  `);
  expect(await format(out)).toBe(out);
  expect(compile(out).code).toBe(compile(source).code);
  // Left as written, and stable.
  const kept = await format(source, { zamnBlockStyle: "preserve" });
  expect(kept).toBe(source.replace('ul.list(\n  :class="{ on }"\n)', 'ul.list(:class="{ on }")'));
});

test("zamnBlockStyle: braces around attributes on several lines", async () => {
  const source = zamn`
    a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank" rel="noopener")
      span Text
  `;
  expect(await format(source)).toBe(zamn`
    a.link.link-external(
      href="https://example.com/a/rather/long/url"
      target="_blank"
      rel="noopener"
    ) {
      span Text
    }
  `);
});
