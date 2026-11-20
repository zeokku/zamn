# JavaScript API

```sh
bun add zamn
```

The package is the Rust compiler built to WebAssembly. It has three functions, all
synchronous:

```ts
import { compile, lex, parse, ZamnError } from "zamn";
```

| | Returns | Throws |
|---|---|---|
| [`compile(source, options?)`](#compile) | `{ code, map }` | a [`ZamnError`](#zamnerror) if the template has errors |
| [`parse(source)`](#parse) | `{ ast, diagnostics }` | never |
| [`lex(source)`](#lex) | `{ tokens, diagnostics }` | never |

Positions everywhere are the way JavaScript tooling (ESLint, Babel) expects them:
`range` is a pair of UTF-16 offsets into the source, and `loc` has a 1-based `line`
and a 0-based `column` in UTF-16 code units.

## compile

```ts
function compile(source: string, options?: CompileOptions): CompileResult;
```

Compiles a template to HTML.

```ts
const { code, map } = compile(source, {
  filename: "page.zamn",
  sourceMap: true,
});
```

### Options

```ts
interface CompileOptions {
  /** Used in diagnostics and as the source map's source. */
  filename?: string;
  /** Produce a source map. Defaults to false. */
  sourceMap?: boolean;
  /** Embed the source in the map. Defaults to true. */
  sourcesContent?: boolean;
  /** Delimiters for `= expr`. Defaults to ["{{", "}}"]. */
  interpolation?: [string, string];
  /** Assume a doctype without writing it. "html" for Vue templates. */
  doctype?: string;
}
```

- `doctype` sets how void elements and boolean attributes are written, as a
  `doctype` line at the top would, without writing one. Use `"html"` for anything
  that ends up inside a page, such as Vue templates. See [Doctypes](../guide/syntax/doctypes#assumed-doctype).
- `interpolation` changes what `= expr` writes: with `["${", "}"]`, `p= user` is
  `<p>${ user }</p>`.

### Result

```ts
interface CompileResult {
  code: string;
  /** Present when `sourceMap` is true. */
  map: SourceMap | null;
}

interface SourceMap {
  version: 3;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
}
```

The map is a standard [source map v3](https://tc39.es/ecma426/). It maps every
element, attribute, text and expression in the HTML back to where it was written,
so errors in a framework's compiled template point at the zamn source.

## ZamnError

```ts
class ZamnError extends Error {
  /** The code of the first diagnostic. */
  code: string;
  /** Every problem in the template. */
  diagnostics: Diagnostic[];
  /** The filename, and where the first problem is: what Vite and Rollup print. */
  id: string;
  loc: { file: string; line: number; column: number };
}
```

`compile` checks the whole template before throwing, so `diagnostics` holds every
problem, not just the first:

```ts
try {
  compile("if user\n  p Hi\np(title=a + b)", { filename: "x.zamn" });
} catch (error) {
  if (error instanceof ZamnError) {
    error.message; // "`if` (control flow) is not supported (and 1 more)"
    error.diagnostics.map((d) => d.code); // ["UNSUPPORTED_SYNTAX", "JS_EXPRESSION"]
  }
}
```

## Diagnostic

```ts
interface Diagnostic {
  /** "UNSUPPORTED_SYNTAX", "INCONSISTENT_INDENTATION", … */
  code: string;
  message: string;
  /** What to do instead, when there is something to say. */
  hint?: string;
  range: [number, number];
  loc: { start: Position; end: Position };
  /** Set on diagnostics from `compile`. */
  filename?: string;
}

interface Position {
  /** 1-based. */
  line: number;
  /** 0-based, in UTF-16 code units. */
  column: number;
}
```

Every code is listed under [Diagnostics](./diagnostics).

## parse

```ts
function parse(source: string): { ast: Root; diagnostics: Diagnostic[] };
```

Returns the syntax tree. It never throws: problems are returned as diagnostics, and
the parser carries on after each one, so editors and linters get a tree for a
template that is still being written.

```ts
interface Root {
  type: "Root";
  nodes: Node[];
  range: [number, number];
  loc: Loc;
}

type Node = Element | Text | Interpolation | Comment | Doctype;

interface Element {
  type: "Element";
  /** "div" for `.card` and `#app`. */
  name: string;
  /** null for an implicit div. */
  nameSpan: Located | null;
  attrs: Attribute[];
  children: Node[];
  /** Children were written in `{ }`. */
  braced: boolean;
  /** Written with a trailing `/`. */
  selfClosing: boolean;
  range: [number, number];
  loc: Loc;
}

interface Attribute {
  name: string;
  nameSpan: Located;
  /** true for a boolean attribute; false when the attribute is dropped. */
  value: string | boolean;
  valueSpan: Located | null;
  /** false for `!=`. */
  escaped: boolean;
  /** Set for `.class` and `#id`. */
  shorthand: "Class" | "Id" | null;
  range: [number, number];
  loc: Loc;
}

/** Text, piped text, text blocks. */
interface Text {
  type: "Text";
  value: string;
  range: [number, number];
  loc: Loc;
}

/** `= expr` */
interface Interpolation {
  type: "Interpolation";
  expr: string;
  exprSpan: Located;
  range: [number, number];
  loc: Loc;
}

interface Comment {
  type: "Comment";
  /** false for `//-`, which is not written to the HTML. */
  buffered: boolean;
  /** The rest of the comment's line. */
  value: string;
  /** The indented lines under it, if any. */
  block: string | null;
  range: [number, number];
  loc: Loc;
}

interface Doctype {
  type: "Doctype";
  /** "html", "xml", … */
  value: string;
  range: [number, number];
  loc: Loc;
}

interface Located {
  range: [number, number];
  loc: Loc;
}
```

`.class` and `#id` are attributes in the tree, with `shorthand` set, so code that
looks for classes sees all of them.

## lex

```ts
function lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[] };

interface Token {
  type: TokenType;
  /** The source text of the token. */
  value: string;
  range: [number, number];
  loc: Loc;
}
```

```ts
lex("p.a Hi").tokens.map((t) => [t.type, t.value]);
// [["Tag", "p"], ["Class", ".a"], ["Text", "Hi"], ["Eos", ""]]
```

The token types are `Tag`, `Id`, `Class`, `AttrsOpen`, `AttrName`, `AttrEq`,
`AttrEqRaw`, `AttrValue`, `AttrsClose`, `Text`, `Pipe`, `Dot`, `TextBlockStart`,
`TextNewline`, `TextBlockEnd`, `InterpStart`, `InterpEnd`, `Colon`, `Slash`, `Eq`,
`Expr`, `Comment`, `SilentComment`, `Doctype`, `BraceOpen`, `BraceClose`, and the
layout tokens `Newline`, `Indent`, `Outdent` and `Eos`. Syntax highlighters and
formatters use them; most code wants `parse`.

## In the browser

Bundlers that follow the `browser` export condition (Vite, webpack, esbuild) pick a
build that loads the WebAssembly asynchronously. Call its default export once
before anything else:

```ts
import init, { compile } from "zamn";

await init();
compile("p Hello").code; // "<p>Hello</p>"
```

In Node, Bun and Deno the module is ready as soon as it is imported. The
[playground](../playground) uses the browser build.
