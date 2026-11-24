// The shapes returned by `lex`, `parse` and `compile`. They mirror the Rust
// types (crates/zamn_lexer, crates/zamn_parser), with byte spans turned into
// `range` and `loc` by crates/zamn_wasm.

export interface Position {
  /** 1-based. */
  line: number;
  /** 0-based, in UTF-16 code units. */
  column: number;
  /** UTF-16 offset into the source: an index into the JS string. */
  offset: number;
}
export interface Loc {
  start: Position;
  end: Position;
}
export interface Located {
  /** UTF-16 offsets into the source: `source.slice(...range)`. */
  range: [number, number];
  loc: Loc;
}

export type Severity = "error" | "warning";

export interface Diagnostic extends Located {
  code: string;
  /** Errors stop `compile`; warnings don't. */
  severity: Severity;
  message: string;
  hint?: string;
  /** Present on diagnostics from `compile`. */
  filename?: string;
}

export type TokenType =
  | "Newline" | "Eos" | "BraceOpen" | "BraceClose"
  | "Tag" | "Id" | "Class"
  | "AttrsOpen" | "AttrName" | "AttrEq" | "AttrEqRaw" | "AttrValue" | "AttrsClose"
  | "Text" | "Pipe" | "PipeOpen" | "PipeClose" | "TextNewline" | "Mustache"
  | "InterpStart" | "InterpEnd" | "Colon" | "Eq" | "Expr"
  | "RawStart" | "RawEnd"
  | "Comment" | "SilentComment" | "BlockComment" | "SilentBlockComment"
  | "Doctype";

export interface Token extends Located {
  type: TokenType;
  /** The source text of the token. */
  value: string;
}

export interface Attribute extends Located {
  name: string;
  nameSpan: Located;
  /** `true` is a boolean attribute; `false` means the attribute is dropped. */
  value: string | boolean;
  valueSpan: Located | null;
  /** `=` escapes the value on output, `!=` does not. */
  escaped: boolean;
  /** Set for `#id` and `.class`. */
  shorthand: "Id" | "Class" | null;
}

export interface Element extends Located {
  type: "Element";
  name: string;
  /** `null` for an implicit `div`. */
  nameSpan: Located | null;
  attrs: Attribute[];
  children: Node[];
  /** Children were written inside `{ }`. */
  braced: boolean;
  /** `script` or `style` with raw content ended by `/script` or `/style`. */
  raw: boolean;
}
/** Text with escapes resolved; `compile` escapes it for HTML. */
export interface Text extends Located {
  type: "Text";
  value: string;
}
/** `{{ ... }}` in text, written to the output as it is. */
export interface Mustache extends Located {
  type: "Mustache";
  /** The whole mustache, braces included. */
  value: string;
}
/** `= expr`, emitted as `{{ expr }}`. */
export interface Interpolation extends Located {
  type: "Interpolation";
  expr: string;
  exprSpan: Located;
}
/** `// text`, `//! text`, `/* ... *\/` or `/*! ... *\/`. */
export interface Comment extends Located {
  type: "Comment";
  /** `true` for `//!` and `/*!`, which are emitted as HTML comments. */
  buffered: boolean;
  /** `true` for `/* *\/` and `/*! *\/`. */
  block: boolean;
  /** Everything after the marker, up to the end of the line or the `*\/`. */
  value: string;
}
/** `doctype X`, emitted as `<!DOCTYPE X>`. */
export interface Doctype extends Located {
  type: "Doctype";
  value: string;
}
export type Node = Element | Text | Mustache | Interpolation | Comment | Doctype;

export interface Root extends Located {
  type: "Root";
  nodes: Node[];
}

export interface CompileOptions {
  filename?: string;
  sourceMap?: boolean;
  /** Embed sources in the map. Defaults to true. */
  sourcesContent?: boolean;
  /** Delimiters for `= expr`. Defaults to `["{{", "}}"]`. */
  interpolation?: [string, string];
}

export interface SourceMap {
  version: 3;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
}

export interface CompileResult {
  code: string;
  map: SourceMap | null;
  /** Diagnostics that don't stop compilation. */
  warnings: Diagnostic[];
}

/** The functions exported by the WASM module: JSON in, JSON out. */
export interface WasmModule {
  lex(source: string): string;
  parse(source: string): string;
  compile(source: string, options: string): string;
}
