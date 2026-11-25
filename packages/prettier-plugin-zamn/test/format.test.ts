import { expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import * as prettier from "prettier";
import * as plugin from "prettier-plugin-zamn";
import { compile } from "zamn";
import { zamn } from "../../../tests/zamn.ts";

const fixtures = resolve(import.meta.dir, "../../../tests/fixtures");

const format = (source: string, options: prettier.Options = {}) =>
  prettier.format(source, { parser: "zamn", plugins: [plugin], ...options });

/** Formats `source`, and checks the result means the same and is stable. */
async function same(source: string, options: prettier.Options = {}) {
  const out = await format(source, options);
  expect(await format(out, options)).toBe(out);
  const result = compile(out);
  expect(result.code).toBe(compile(source).code);
  expect(result.warnings).toEqual([]);
  return out;
}

for (const file of new Glob("{braces,zamn}/**/*.zamn").scanSync(fixtures)) {
  for (const options of [{}, { tabWidth: 0 }, { useTabs: true }] as prettier.Options[]) {
    test(`fixture ${file} ${JSON.stringify(options)}: same HTML, stable, no warnings`, async () => {
      await same(await Bun.file(resolve(fixtures, file)).text(), options);
    });
  }
}

test("is inferred from the .zamn extension", async () => {
  const out = await prettier.format("p(  a='b' )", { filepath: "x.zamn", plugins: [plugin] });
  expect(out).toBe('p(a="b")\n');
});

test("re-indents blocks, which fixes misleading indentation", async () => {
  const source = zamn`
        html {
    body.page {
            nav#top {
                ul {
                 li: a(href='/') Home
                }
              }
            section {
            }
                p { }
    }
        }
  `;
  expect(compile(source).warnings.map((w) => w.code)).toEqual(["MISLEADING_INDENTATION"]);
  expect(await same(source)).toBe(zamn`
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
  expect(await same(source, { useTabs: true })).toContain('\n\t\t\t\tli: a(href="/") Home\n');
  expect(await same(source, { tabWidth: 0 })).toContain('\nli: a(href="/") Home\n');
});

test("blocks written on one line are printed over several", async () => {
  const source = zamn`
    .cl{.cl2{b text}}
    ul {li{a(href="/") Home} li{b \\} and \\{}}
    .one-liner { b { u biba }}
    .should-use-new-line { b some text
    u next child after b
    s and another one}
  `;
  expect(await same(source)).toBe(zamn`
    .cl {
      .cl2 {
        b text
      }
    }
    ul {
      li {
        a(href="/") Home
      }
      li {
        b \\} and \\{
      }
    }
    .one-liner {
      b {
        u biba
      }
    }
    .should-use-new-line {
      b some text
      u next child after b
      s and another one
    }
  `);
});

test("text after the head: tag text", async () => {
  const source = zamn`
    div some text
    div: | some text
    div: |{ some text }
    div: |{   trimmed   }
    p {
      | the only child
    }
    p { |{ one line } }
    p   two spaces go
    p: |   and so do these
    p{{ msg }}
    p: |{ {{ msg }} and #{b( x = 'y' ) z} }
  `;
  expect(await same(source)).toBe(zamn`
    div some text
    div: | some text
    div: |{ some text }
    div: |{ trimmed }
    p the only child
    p one line
    p two spaces go
    p: | and so do these
    p {{ msg }}
    p: |{ {{ msg }} and #{b(x="y") z} }
  `);
});

test("after the head, | is text; braces keep their escapes", async () => {
  const source = zamn`
    p | literal
    p: | | piped
    p { | | the only child }
    p { |{ | in a block } }
    p \\| a backslash
    p \\{ brace
    p { |{ \\{ brace in a block \\} } }
    p { |{ \\#{ not inline } }
    p { |{} }
    p: |
  `;
  expect(await same(source)).toBe(zamn`
    p | literal
    p: | | piped
    p | the only child
    p | in a block
    p \\| a backslash
    p \\{ brace
    p \\{ brace in a block \\}
    p \\#{ not inline
    p
    p: |
  `);
});

test("text statements: | lines, bare |, and |{ } on one line", async () => {
  const source = zamn`
    p {
       b this
         |
       |    is
          |
      u cool
    }
    div { |{ a } |{ b } }
    div {
    |{ a }
    |{ b }
    }
    | top
    | level
  `;
  // Text statements are joined as they are: the ones that share a line keep
  // sharing it.
  expect(await same(source)).toBe(zamn`
    p {
      b this
      |
      | is
      |
      u cool
    }
    div {
      |{ a } |{ b }
    }
    div {
      |{ a }
      |{ b }
    }
    | top
    | level
  `);
});

test("|{ } over several lines stays a block, re-indented", async () => {
  const source = zamn`
    div {
          pre: |{
                function go() \\{
                  return a < b;
                \\}
          }
      p {
      |{   starts on the line
            and keeps #{em its} relative
              indentation }
      }
      pre {
        |{
          kept in braces
        }
      }
    }
  `;
  expect(await same(source)).toBe(zamn`
    div {
      pre: |{
        function go() \\{
          return a < b;
        \\}
      }
      p {
        |{
          starts on the line
          and keeps #{em its} relative
            indentation
        }
      }
      pre {
        |{
          kept in braces
        }
      }
    }
  `);
});

test("script and style content is re-indented, never changed", async () => {
  const source = zamn`
    body {
        script(type="module")

              if (a < b && c) {
                go("{", '#{x}', "{{ y }}");
              }

                // relative indentation stays
         /script
      style
      a > b { color: red }
      /style
      script(src="/a.js")
    }
  `;
  expect(await same(source)).toBe(zamn`
    body {
      script(type="module")
        if (a < b && c) {
          go("{", '#{x}', "{{ y }}");
        }

          // relative indentation stays
      /script
      style
        a > b { color: red }
      /style
      script(src="/a.js")
    }
  `);
});

test("comments stay where they are, block comments as written", async () => {
  const source = zamn`
    // silent${"  "}
    //! for the HTML
    div { /* the title */ h2 { | Title } /*! the body */ p Body }
      /*! kept
            exactly${" "}
       as written */
    p {
      b x /* text, not a comment */
      a(href="https://x.y") https://x.y // text too
    }
  `;
  expect(await same(source)).toBe(zamn`
    // silent
    //! for the HTML
    div {
      /* the title */
      h2 Title
      /*! the body */
      p Body
    }
    /*! kept
            exactly${" "}
       as written */
    p {
      b x /* text, not a comment */
      a(href="https://x.y") https://x.y // text too
    }
  `);
});

test("doctype, expressions, expansion, mustaches and escapes", async () => {
  const source = zamn`


    doctype   html



    html {

      body {


        h1= title
        p {
          = greeting
          |
          = name
        }
        li:   a(href='/'):  b Home
        p {{ a < b }} \\#[not inline] C:\\temp \\} #{i: b x}
        p(style={color: red, fontSize: 12px}) Red
        input(type="checkbox" checked hidden=false)
        .w-1/2.md:flex.hover:bg-sky-700.[&>*]:p-2 x
      }

    }
  `;
  expect(await same(source)).toBe(zamn`
    doctype html

    html {
      body {
        h1= title
        p {
          = greeting
          |
          = name
        }
        li: a(href="/"): b Home
        p {{ a < b }} \\#[not inline] C:\\temp \\} #{i: b x}
        p(style={color: red, fontSize: 12px}) Red
        input(type="checkbox" checked hidden=false)
        .w-1/2.md:flex.hover:bg-sky-700.[&>*]:p-2 x
      }
    }
  `);
  expect(await format("")).toBe("");
});

test("whitespace at the end of a line is removed", async () => {
  const source = zamn`
    div {${"  "}
        p text${" "}
        span${"\t"}
        | piped${" "}
        |${"  "}
        | <i>x</i>${" "}
    }${" "}
  `;
  const out = await same(source);
  expect(out).toBe(zamn`
    div {
      p text
      span
      | piped
      |
      | <i>x</i>
    }
  `);
  expect(compile(out).code).toBe("<div><p>text</p><span></span>piped &lt;i&gt;x&lt;/i&gt;</div>");
});

test("CRLF input", async () => {
  expect(await format("div {\r\n    p a\r\n}\r\n")).toBe("div {\n  p a\n}\n");
});

test("attributes: spacing, separators and quotes", async () => {
  const source = `a( href = '/x' ,title="say \\"hi\\"", alt='it\\'s'  data-x!='<b>' disabled n=1 )`;
  const options = { zamnMaxAttributesPerLine: 6 };
  expect(await same(source, options)).toBe(
    `a(href="/x" title='say "hi"' alt="it's" data-x!="<b>" disabled n=1)\n`,
  );
  expect(await same(source, { ...options, singleQuote: true })).toBe(
    `a(href='/x' title='say "hi"' alt="it's" data-x!='<b>' disabled n=1)\n`,
  );
});

test("attributes break one per line when the head is too wide, but not in #{}", async () => {
  const source = zamn`
    ul {
      li: a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank" rel="noopener") Text
      a(href="/") Text after the head never counts towards the print width, however long it gets
      p here #{a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank" rel="x" title="y") stays} inline
    }
  `;
  expect(await same(source)).toBe(zamn`
    ul {
      li: a.link.link-external(
        href="https://example.com/a/rather/long/url"
        target="_blank"
        rel="noopener"
      ) Text
      a(href="/") Text after the head never counts towards the print width, however long it gets
      p here #{a.link.link-external(href="https://example.com/a/rather/long/url" target="_blank" rel="x" title="y") stays} inline
    }
  `);
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
      button(style={
      fontSize: 1em,
      'text-align': 'center'
      })
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
      button(
        style={
        fontSize: 1em,
        'text-align': 'center'
        }
      )
    }
  `);
  expect(await format(out)).toBe(out);
  expect(compile(out).warnings).toEqual([]);
});

test("zamnMaxAttributesPerLine: three by default", async () => {
  const source = zamn`
    input(type="text")
    input(type="text" required name="login")
    input(type="text" required name="login" disabled)
    input(
      type="text"
    )
  `;
  expect(await same(source)).toBe(zamn`
    input(type="text")
    input(type="text" required name="login")
    input(
      type="text"
      required
      name="login"
      disabled
    )
    input(type="text")
  `);
});

test("zamnMaxAttributesPerLine: a number, 0, -1 and false", async () => {
  const source = zamn`
    input(type="text")
    input(type="text" required)
    input(
      type="text"
    )
    a.link(href="https://example.com/a/rather/long/url")(target="_blank" rel="noopener" title="A title")
  `;
  const with_ = (zamnMaxAttributesPerLine: number | false, more: prettier.Options = {}) =>
    same(source, { zamnMaxAttributesPerLine, printWidth: 60, ...more });
  const long = zamn`
    a.link(
      href="https://example.com/a/rather/long/url"
    )(
      target="_blank"
      rel="noopener"
      title="A title"
    )
  `;
  expect(await with_(1, { zamnAttributeSeparator: "comma" })).toBe(zamn`
    input(type="text")
    input(
      type="text",
      required
    )
    input(type="text")
    a.link(
      href="https://example.com/a/rather/long/url"
    )(
      target="_blank",
      rel="noopener",
      title="A title"
    )
  `);
  // Few enough, but wider than the print width.
  const few = zamn`
    input(type="text")
    input(type="text" required)
    input(type="text")
  `;
  expect(await with_(4)).toBe(few + long);
  expect(await with_(0)).toBe(
    zamn`
      input(
        type="text"
      )
      input(
        type="text"
        required
      )
      input(
        type="text"
      )
    ` + long,
  );
  // As written, whatever the print width.
  expect(await with_(-1)).toBe(source);
  expect(await with_(false)).toBe(
    few +
      'a.link(href="https://example.com/a/rather/long/url")(target="_blank" rel="noopener" title="A title")\n',
  );
});

test("zamnMaxAttributesPerLine: a value on several lines always breaks", async () => {
  const source = zamn`
    div(:class="{
      on
    }")
  `;
  expect(await format(source, { zamnMaxAttributesPerLine: false })).toBe(zamn`
    div(
      :class="{
        on
      }"
    )
  `);
});

test("zamnAttributeSeparator: commas between attributes", async () => {
  const source = zamn`
    a(href='/' target="_blank"   disabled) Home
    a(href="/",target="_blank",
      disabled) Home
  `;
  expect(await same(source)).toBe(zamn`
    a(href="/" target="_blank" disabled) Home
    a(href="/" target="_blank" disabled) Home
  `);
  expect(await same(source, { zamnAttributeSeparator: "comma" })).toBe(zamn`
    a(href="/", target="_blank", disabled) Home
    a(href="/", target="_blank", disabled) Home
  `);
});

test("formats <template lang=\"zamn\"> in Vue files, with the options", async () => {
  const source = zamn`
    <template lang="zamn">
    div {
          p(  a='b' ) hi
      button(:class="{
        active: isActive
      }" @click="go" disabled)
    }
    </template>
  `;
  const options = { parser: "vue", plugins: [plugin], zamnAttributeSeparator: "comma" as const };
  expect(await prettier.format(source, options)).toBe(zamn`
    <template lang="zamn">
    div {
      p(a="b") hi
      button(
        :class="{
          active: isActive
        }",
        @click="go",
        disabled
      )
    }
    </template>
  `);
});

test("a template with errors is refused with a location", async () => {
  try {
    await format(zamn`
      p ok
      if x {
        p no
      }
    `);
    throw new Error("should have thrown");
  } catch (e: any) {
    expect(e).toBeInstanceOf(SyntaxError);
    expect(e.message).toContain("`if` (control flow) is not supported");
    expect(e.loc.start).toEqual({ line: 2, column: 1 });
  }
  expect(format("div {\n  p x\n")).rejects.toThrow("never closed");
});
