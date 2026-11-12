export interface Position {
  /** 1-based. */
  line: number;
  /** 0-based, in UTF-16 code units. */
  column: number;
}
export interface Loc {
  start: Position;
  end: Position;
}
export interface Located {
  /** UTF-16 offsets into the source. */
  range: [number, number];
  loc: Loc;
}

export interface Diagnostic extends Located {
  code: string;
  message: string;
  hint?: string;
  /** Present on diagnostics from `compile`. */
  filename?: string;
}

export type TokenType =
  | "Newline" | "Indent" | "Outdent" | "Eos" | "BraceOpen" | "BraceClose"
  | "Tag" | "Id" | "Class"
  | "AttrsOpen" | "AttrName" | "AttrEq" | "AttrEqRaw" | "AttrValue" | "AttrsClose"
  | "Text" | "Pipe" | "Dot" | "TextBlockStart" | "TextNewline" | "TextBlockEnd"
  | "InterpStart" | "InterpEnd" | "Colon" | "Slash" | "Eq" | "Expr"
  | "Comment" | "SilentComment" | "Doctype" | "Include" | "Path" | "RawHtml";

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
  /** Children were written inside `{ }` rather than by indentation. */
  braced: boolean;
  selfClosing: boolean;
}
export interface Text extends Located {
  type: "Text";
  value: string;
}
/** `= expr`, emitted as `{{ expr }}`. */
export interface Interpolation extends Located {
  type: "Interpolation";
  expr: string;
  exprSpan: Located;
}
export interface RawHtml extends Located {
  type: "RawHtml";
  value: string;
}
export interface Comment extends Located {
  type: "Comment";
  /** `false` for `//-` comments, which are not emitted. */
  buffered: boolean;
  value: string;
  block: string | null;
}
export interface Doctype extends Located {
  type: "Doctype";
  value: string;
}
export interface Include extends Located {
  type: "Include";
  path: string;
  pathSpan: Located;
}
export type Node = Element | Text | Interpolation | RawHtml | Comment | Doctype | Include;

export interface Root extends Located {
  type: "Root";
  nodes: Node[];
}

export interface ResolvedFile {
  /** Canonical name: used in source maps and as `from` for nested includes. */
  filename: string;
  source: string;
}

export interface CompileOptions {
  filename?: string;
  /** Loads the target of an `include`. Without it, includes are an error. */
  resolve?: (path: string, from: string) => ResolvedFile | null | undefined;
  sourceMap?: boolean;
  /** Embed sources in the map. Defaults to true. */
  sourcesContent?: boolean;
  /** Delimiters for `= expr`. Defaults to `["{{", "}}"]`. */
  interpolation?: [string, string];
  /**
   * Assume a doctype without emitting it. Use `"html"` for Vue templates so
   * boolean attributes are written as `disabled`, not `disabled="disabled"`.
   */
  doctype?: string;
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
  /** Files pulled in through `include`, for watch mode. */
  dependencies: string[];
}

export class ZamnError extends Error {
  code: string;
  diagnostics: Diagnostic[];
  id: string;
  loc: { file: string; line: number; column: number };
}

/** Never throws; problems are returned as diagnostics. */
export function lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[] };
/** Never throws; problems are returned as diagnostics. */
export function parse(source: string): { ast: Root; diagnostics: Diagnostic[] };
/** Throws a `ZamnError` if the template has errors. */
export function compile(source: string, options?: CompileOptions): CompileResult;
/** Node only: an include resolver backed by the file system. */
export function fsResolver(options?: { basedir?: string }): NonNullable<CompileOptions["resolve"]>;
