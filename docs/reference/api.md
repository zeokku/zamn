# JavaScript API

```sh
bun add zamn
```

The package is the Rust compiler built to WebAssembly. It has three functions, all synchronous:

```ts
import { compile, lex, parse, ZamnError } from "zamn";
```

| | Returns | Throws |
|---|---|---|
| [`compile(source, options?)`](#compile) | `{ code, map, warnings }` | a [`ZamnError`](#zamnerror) if the template has errors |
| [`parse(source)`](#parse) | `{ ast, diagnostics }` | never |
| [`lex(source)`](#lex) | `{ tokens, diagnostics }` | never |

Positions everywhere are the way JavaScript tooling (ESLint, Babel) expects them: `range` is a pair of UTF-16 offsets into the source, so `source.slice(...range)` is the text, and `loc` has a 1-based `line`, a 0-based `column` in UTF-16 code units and the `offset` of that point, as in Vue's compiler. Every token, node, attribute, nested `*Span` and diagnostic has both.

The types are exported from the package: `import type { Root, Token, Diagnostic } from "zamn"`.

## compile

```ts
function compile(source: string, options?: CompileOptions): CompileResult;
```

Compiles a template to HTML.

```ts
const { code, map, warnings } = compile(source, {
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
}
```

`interpolation` changes what `= expr` writes: with `["${", "}"]`, `p= user` is `<p>${ user }</p>`. The output is always HTML5, for a full page and for a Vue template alike.

### Result

```ts
interface CompileResult {
  code: string;
  /** Present when `sourceMap` is true. */
  map: SourceMap | null;
  /** Diagnostics that don't stop compilation, such as MISLEADING_INDENTATION. */
  warnings: Diagnostic[];
}

interface SourceMap {
  version: 3;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
}
```

The map is a standard [source map v3](https://tc39.es/ecma426/). It maps every element, attribute, text and expression in the HTML back to where it was written, so errors in a framework's compiled template point at the zamn source.

`compile` throws only for errors. Warnings come back in `warnings`, and are worth showing to whoever wrote the template.

## ZamnError

```ts
class ZamnError extends Error {
  /** The code of the first error. */
  code: string;
  /** Every error in the template, followed by any warnings. */
  diagnostics: Diagnostic[];
  /** The filename, and where the first problem is: what Vite and Rollup print. */
  id: string;
  loc: { file: string; line: number; column: number };
}
```

`compile` checks the whole template before throwing, so `diagnostics` holds every problem, not just the first:

```ts
try {
  compile("- const x = 1\np(title=a + b)", { filename: "x.zamn" });
} catch (error) {
  if (error instanceof ZamnError) {
    error.message; // "Unbuffered code (`- ...`) is not supported (and 1 more)"
    error.diagnostics.map((d) => d.code); // ["UNSUPPORTED_SYNTAX", "JS_EXPRESSION"]
  }
}
```

## Diagnostic

```ts
interface Diagnostic {
  /** "UNSUPPORTED_SYNTAX", "MISLEADING_INDENTATION", … */
  code: string;
  /** Errors stop `compile`; warnings don't. */
  severity: "error" | "warning";
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
  /** UTF-16 offset into the source: an index into the JS string. */
  offset: number;
}
```

Every code is listed under [Diagnostics](./diagnostics).

## parse

```ts
function parse(source: string): { ast: Root; diagnostics: Diagnostic[] };
```

Returns the syntax tree. It never throws: problems are returned as diagnostics, and the parser carries on after each one, so editors and linters get a tree for a template that is still being written.

```ts
interface Root {
  type: "Root";
  nodes: Node[];
  range: [number, number];
  loc: Loc;
}

type Node = Element | Text | Mustache | Interpolation | Comment | Doctype;

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
  /** `script` or `style` with raw content, ended by `/script` or `/style`. */
  raw: boolean;
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

/** Text, piped text, `|{ }` blocks, raw content: escapes resolved, not yet HTML-escaped. */
interface Text {
  type: "Text";
  value: string;
  range: [number, number];
  loc: Loc;
}

/** `{{ ... }}` in text, written to the output as it is. */
interface Mustache {
  type: "Mustache";
  /** The whole mustache, braces included. */
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

/** `// text`, `//! text`, `/* ... *\/` or `/*! ... *\/`. */
interface Comment {
  type: "Comment";
  /** true for `//!` and `/*!`, which are written to the HTML as `<!--value-->`. */
  buffered: boolean;
  /** true for `/* *\/` and `/*! *\/`. */
  block: boolean;
  /** Everything after the marker, up to the end of the line or the `*\/`, as written. */
  value: string;
  range: [number, number];
  loc: Loc;
}

interface Doctype {
  type: "Doctype";
  /** "html" for `doctype html`. */
  value: string;
  range: [number, number];
  loc: Loc;
}

interface Located {
  range: [number, number];
  loc: Loc;
}
```

`.class` and `#id` are attributes in the tree, with `shorthand` set, so code that looks for classes sees all of them.

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

The token types are:

| Type | What |
|---|---|
| `Tag`, `Id`, `Class` | the tag name, `#id` and `.class`, with their `#` and `.` |
| `AttrsOpen`, `AttrName`, `AttrEq`, `AttrEqRaw`, `AttrValue`, `AttrsClose` | `(`, a name, `=`, `!=`, a value, `)` |
| `BraceOpen`, `BraceClose` | the `{` and `}` of a block |
| `Text` | text, and each line of raw content; a `\` that escapes a brace or `#{` is left out of the range |
| `Pipe` | `\|` starting a statement of text, or a bare `\|` (one space) |
| `PipeOpen`, `PipeClose` | the `\|{` and `}` of a text block |
| `TextNewline` | a line break inside a `\|{ }` block or raw content |
| `Mustache` | `{{ ... }}` in text, braces included |
| `InterpStart`, `InterpEnd` | the `#{` and `}` of an inline element |
| `Colon` | `:` block expansion |
| `Eq`, `Expr` | `=` and the expression after it |
| `RawStart`, `RawEnd` | where the content of `script` or `style` starts (zero-width, at the end of the head's line), and its `/script` or `/style` line |
| `Comment`, `SilentComment` | `//! text` and `// text`, whole |
| `BlockComment`, `SilentBlockComment` | `/*! ... */` and `/* ... */`, whole |
| `Doctype` | the whole `doctype ...` line |
| `Newline`, `Eos` | the break between two statements, and the end of the source |

Syntax highlighters and formatters use them; most code wants `parse`.

## In the browser

Bundlers that follow the `browser` export condition (Vite, webpack, esbuild) pick a build that loads the WebAssembly asynchronously. Call its default export once before anything else:

```ts
import init, { compile } from "zamn";

await init();
compile("p Hello").code; // "<p>Hello</p>"
```

In Node, Bun and Deno the module is ready as soon as it is imported. The [playground](../playground) uses the browser build.
