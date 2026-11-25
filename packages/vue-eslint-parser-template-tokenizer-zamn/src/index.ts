// Template tokenizer for vue-eslint-parser: lets ESLint read
// `<template lang="zamn">`.
//
// vue-eslint-parser hands over the text of the template and expects the
// stream its own HTML tokenizer would produce: start tags with their
// attributes, end tags, text and mustaches. It builds the template AST from
// those and parses the expressions itself, so everything here is positioned
// in the whole `.vue` file.
import { decodeHTMLStrict } from "entities/decode";
import type { AST } from "vue-eslint-parser";
import { lex, parse } from "zamn";
import type {
  Attribute,
  Element,
  Interpolation,
  Mustache,
  Node,
  Severity,
  Token as ZamnToken,
} from "zamn";

// The tokens vue-eslint-parser's tokenizers hand to its parser
// (src/html/intermediate-tokenizer.ts there). They are not in its types.
export interface StartTag extends AST.HasLocation {
  type: "StartTag";
  name: string;
  rawName: string;
  selfClosing: boolean;
  attributes: (AST.VAttribute | AST.VDirective)[];
}
export interface EndTag extends AST.HasLocation {
  type: "EndTag";
  name: string;
}
export interface Text extends AST.HasLocation {
  type: "Text";
  value: string;
}
export interface MustacheToken extends AST.HasLocation {
  type: "Mustache";
  value: string;
  startToken: AST.Token;
  endToken: AST.Token;
}
export type IntermediateToken = StartTag | EndTag | Text | MustacheToken;

/**
 * A diagnostic of zamn, as an error of the template. vue-eslint-parser
 * copies it to `templateBody.errors` as it is.
 */
export interface ZamnParseError extends SyntaxError {
  /** `zamn/` and zamn's code: `zamn/UNSUPPORTED_SYNTAX`. */
  code: `zamn/${string}`;
  severity: Severity;
  hint: string | undefined;
  index: number;
  lineNumber: number;
  column: number;
  range: AST.OffsetRange;
  loc: AST.LocationRange;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);
// Attribute names vue-eslint-parser reads as directives.
const DIRECTIVE = /^(?:v-|[.:@#]).*[^.:@#]$|^slot-scope$|^scope$/u;
// The character references zamn writes to the HTML as they are: everywhere
// else, `&` is escaped (see `is_char_ref` in crates/zamn_codegen).
const REFERENCE = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g;

// Tokens that say nothing ESLint can use: they are empty or whitespace.
const LAYOUT = new Set(["Newline", "Eos", "TextNewline"]);
// What each kind of comment starts with.
const COMMENT_MARKER: Partial<Record<ZamnToken["type"], number>> = {
  SilentComment: "//".length,
  Comment: "//!".length,
  SilentBlockComment: "/*".length,
  BlockComment: "/*!".length,
};
// A block, `|{ }` text, `#{ }` and script or style content, and their ends.
const OPEN = new Set(["BraceOpen", "PipeOpen", "InterpStart", "RawStart"]);
// What opens an element's own content after its head.
const OWN = new Set(["BraceOpen", "PipeOpen", "RawStart"]);
const CLOSE = new Set(["BraceClose", "PipeClose", "InterpEnd", "RawEnd"]);
// vue-eslint-parser sets the parent of each attribute it is given.
const PARENT = Object.freeze({}) as AST.VStartTag;

/** Text the walk is gathering: pieces of text next to each other are one. */
interface TextRun {
  value: string;
  start: number;
  end: number;
}

export default class ZamnTokenizer {
  // vue-eslint-parser reads and writes these while it consumes the tokens.
  text: string;
  expressionEnabled = true;
  namespace: string = HTML_NAMESPACE;
  state = "DATA";
  readonly tokens: AST.Token[] = [];
  readonly comments: AST.Token[] = [];
  readonly errors: ZamnParseError[] = [];

  private readonly lineStarts: number[] = [0];
  /** Where the template starts in the file. */
  private readonly base: number;
  /** The template as it is in the file. */
  private readonly source: string;
  /** The lexer's tokens, layout included. */
  private readonly lexed: ZamnToken[];
  /** Index in `lexed` of the token that starts at an offset. */
  private readonly lexedAt = new Map<number, number>();
  /** The ESLint token that starts at an offset. */
  private readonly tokenAt = new Map<number, AST.Token>();
  /** How many elements the walk is inside. */
  private depth = 0;
  /** The token that closes each element the walk is inside that has one. */
  private readonly closes: ZamnToken[] = [];
  private readonly walk: Generator<IntermediateToken>;

  /**
   * @param text the content of `<template>`, with line breaks normalised
   * @param code the whole file
   * @param position of `text` in `code`
   */
  constructor(
    text: string,
    code: string,
    { startingLine, startingColumn }: { startingLine: number; startingColumn: number },
  ) {
    this.text = code;
    for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) {
      this.lineStarts.push(i + 1);
    }
    // `text` has `\n` where the file may have `\r\n`, so take the template
    // from the file, where offsets are what ESLint counts.
    this.base = this.lineStarts[startingLine - 1]! + startingColumn;
    let end = this.base;
    for (let i = 0; i < text.length; i++, end++) {
      if (text[i] === "\n" && code[end] === "\r") end++;
    }
    this.source = code.slice(this.base, end);

    const { ast, diagnostics } = parse(this.source);
    for (const d of diagnostics) {
      // vue/no-parsing-error skips codes it does not know, so these are left
      // to the rules of eslint-plugin-vue-zamn, which report the whole range
      // and the hint.
      const { range, loc } = this.located(...d.range);
      this.errors.push(
        Object.assign(new SyntaxError(d.message), {
          code: `zamn/${d.code}` as const,
          severity: d.severity,
          hint: d.hint,
          index: range[0],
          lineNumber: loc.start.line,
          column: loc.start.column,
          range,
          loc,
        }),
      );
    }

    this.lexed = lex(this.source).tokens;
    for (let i = 0; i < this.lexed.length; i++) {
      const t = this.lexed[i]!;
      const [start, end] = t.range;
      const marker = COMMENT_MARKER[t.type];
      if (marker !== undefined) {
        // `// eslint-disable-next-line` works as it does in `<!-- -->`.
        let value = t.value.slice(marker);
        if (t.type.endsWith("BlockComment") && value.endsWith("*/")) value = value.slice(0, -2);
        this.comments.push({ type: "HTMLComment", value, ...this.located(start, end) });
        continue;
      }
      if (LAYOUT.has(t.type) || start === end) continue;
      const token = this.token(`Zamn${t.type}`, start, end);
      this.lexedAt.set(start, i);
      this.tokenAt.set(start, token);
      this.tokens.push(token);
    }

    this.walk = this.nodes(ast.nodes, false);
  }

  /** The next StartTag, EndTag, Text or Mustache, or null at the end. */
  nextToken(): IntermediateToken | null {
    const { value, done } = this.walk.next();
    return done ? null : value;
  }

  // -------------------------------------------------------------------------
  // Locations. Offsets are into the template unless said otherwise.
  // -------------------------------------------------------------------------

  private position(offset: number): AST.Location {
    const index = this.base + offset;
    let low = 0;
    let high = this.lineStarts.length;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (this.lineStarts[mid]! <= index) low = mid;
      else high = mid;
    }
    return { line: low + 1, column: index - this.lineStarts[low]! };
  }

  private located(start: number, end: number): AST.HasLocation {
    return {
      range: [this.base + start, this.base + end],
      loc: { start: this.position(start), end: this.position(end) },
    };
  }

  private token(type: string, start: number, end: number): AST.Token {
    return { type, value: this.source.slice(start, end), ...this.located(start, end) };
  }

  // -------------------------------------------------------------------------
  // The AST, as the tokens vue-eslint-parser builds its own from
  // -------------------------------------------------------------------------

  /** `raw` is set for the content of a script or a style. */
  private *nodes(nodes: Node[], raw: boolean): Generator<IntermediateToken> {
    // Pieces of text next to each other are one text, as in HTML.
    let run: TextRun | null = null;
    for (const node of nodes) {
      const piece = this.textPiece(node, raw);
      if (!piece) {
        if (run) yield* this.textRun(run);
        run = null;
        yield* this.node(node);
      } else if (run) {
        run.value += piece.value;
        run.end = piece.end;
      } else {
        run = piece;
      }
    }
    if (run) yield* this.textRun(run);
  }

  /**
   * What a node is as text, if it is text: its value as a browser shows it.
   * zamn has resolved its escapes (`\{`), and writes character references
   * (`&rarr;`) to the HTML, where they are read as the character.
   */
  private textPiece(node: Node, raw: boolean): TextRun | null {
    const [start, end] = node.range;
    switch (node.type) {
      case "Text":
        return { value: raw ? node.value : node.value.replace(REFERENCE, decodeHTMLStrict), start, end };
      case "Mustache":
        // A mustache that is not closed is an error, and text.
        if (this.expressionEnabled && node.value.endsWith("}}") && node.value.length >= 4) return null;
        return { value: node.value, start, end };
      case "Interpolation":
        if (this.expressionEnabled) return null;
        return { value: node.expr, start: node.exprSpan.range[0], end: node.exprSpan.range[1] };
      default:
        return null;
    }
  }

  private *node(node: Node): Generator<IntermediateToken> {
    switch (node.type) {
      case "Element":
        return yield* this.element(node);
      case "Mustache":
        return yield* this.mustache(node);
      case "Interpolation":
        return yield* this.interpolation(node);
      // Comments are taken from the tokens, and a doctype means nothing
      // inside a Vue template.
    }
  }

  /**
   * Text outside every element stays out of the AST: vue-eslint-parser takes
   * any text directly under `<template>` for a template to tokenize, and
   * would start over on it without end.
   */
  private *textRun({ value, start, end }: TextRun): Generator<IntermediateToken> {
    if (this.depth === 0) return;
    yield { type: "Text", value, ...this.located(start, end) };
  }

  /** `{{ expr }}` in text. */
  private *mustache(node: Mustache): Generator<IntermediateToken> {
    const [open, close] = node.range;
    const startToken = this.token("VExpressionStart", open, open + 2);
    const endToken = this.token("VExpressionEnd", close - 2, close);
    const tokens = [startToken];
    // vue-eslint-parser puts the expression's own tokens in place of this.
    if (close - open > 4) tokens.push(this.token("ZamnText", open + 2, close - 2));
    tokens.push(endToken);
    const token = this.tokenAt.get(open);
    if (token) this.tokens.splice(this.tokens.indexOf(token), 1, ...tokens);
    yield {
      type: "Mustache",
      value: node.value.slice(2, -2),
      startToken,
      endToken,
      ...this.located(open, close),
    };
  }

  /** `= expr`, which is `{{ expr }}`. */
  private *interpolation(node: Interpolation): Generator<IntermediateToken> {
    const end = node.exprSpan.range[1];
    // `=` opens the mustache and the end of the line closes it. Nothing is
    // written there, so that end is not in `tokens`.
    const eq = node.range[0];
    const startToken = this.tokenAt.get(eq) ?? this.token("VExpressionStart", eq, eq + 1);
    startToken.type = "VExpressionStart";
    yield {
      type: "Mustache",
      value: this.source.slice(eq + 1, end),
      startToken,
      endToken: this.token("VExpressionEnd", end, end),
      ...this.located(eq, end),
    };
  }

  private *element(el: Element): Generator<IntermediateToken> {
    // The head: the tag, then `#id`, `.class` and `(...)` in any order.
    const first = this.lexedAt.get(el.range[0]) ?? -1;
    let i = first;
    if (this.lexed[i]?.type === "Tag") i++;
    for (;;) {
      const type = this.lexed[i]?.type;
      if (type === "AttrsOpen") {
        do i++;
        while (/^Attr(?:Name|Eq|EqRaw|Value)$/.test(this.lexed[i]?.type ?? ""));
        if (this.lexed[i]?.type === "AttrsClose") i++;
      } else if (type === "Id" || type === "Class") i++;
      else break;
    }
    const end = this.lexed[i - 1]?.range[1] ?? el.range[0];

    yield {
      type: "StartTag",
      name: el.name.toLowerCase(),
      rawName: el.name,
      selfClosing: false,
      attributes: el.attrs.flatMap((attr) => this.attribute(attr) ?? []),
      ...this.located(el.range[0], end),
    };
    // vue-eslint-parser has now set the namespace this element's children
    // are in, and leaves a void element closed.
    const open = !(this.namespace === HTML_NAMESPACE && VOID.has(el.name.toLowerCase()));

    // What closes the element: the `}` of its block or of its `tag: |{ }`
    // text, the `/script` line, or the `}` of the `#{ }` it is in. Without
    // one, its statement ends with its line, or at the `}` of the block it
    // is in.
    let close: ZamnToken | undefined;
    if (this.lexed[i]?.type === "Colon" && this.lexed[i + 1]?.type === "PipeOpen") i++;
    if (OWN.has(this.lexed[i]?.type ?? "")) close = this.match(i);
    else if (this.lexed[first - 1]?.type === "InterpStart") close = this.match(first - 1);
    // The lexer closes what is left open with an empty token.
    if (close && close.range[0] === close.range[1]) close = undefined;

    // The children of an element that cannot have any are its siblings.
    if (open) this.depth++;
    if (close) this.closes.push(close);
    yield* this.nodes(el.children, el.raw);
    if (close) this.closes.pop();
    if (!open) return;
    this.depth--;

    close ??= this.statementEnd(el.range[1]);
    const range = close ? close.range : this.lineEnd(el.range[1]);
    yield { type: "EndTag", name: el.name.toLowerCase(), ...this.located(...range) };
  }

  /** The token that closes what the token at `index` opens. */
  private match(index: number): ZamnToken | undefined {
    let depth = 0;
    for (let i = index; i < this.lexed.length; i++) {
      const t = this.lexed[i]!;
      if (OPEN.has(t.type)) depth++;
      else if (CLOSE.has(t.type) && --depth === 0) return t;
    }
    return undefined;
  }

  /**
   * The `}` that ends a statement ending at `offset`, when it is the one
   * that closes the element the statement is in, as in `ul { li a }`.
   */
  private statementEnd(offset: number): ZamnToken | undefined {
    const next = this.lexed.find((t) => t.range[0] >= offset && t.range[1] > t.range[0]);
    if (!next || next !== this.closes.at(-1)) return undefined;
    return this.source.slice(offset, next.range[0]).includes("\n") ? undefined : next;
  }

  /**
   * The line break after `offset`, as the range of an end tag. Rules ask for
   * the tokens of an end tag and do not expect to find none, so the line
   * break becomes a token; on the last line of a template that does not end
   * with one, the token before stands in.
   */
  private lineEnd(offset: number): [number, number] {
    const at = this.source.indexOf("\n", offset);
    const index = this.tokens.findLastIndex((t) => t.range[0] < this.base + Math.max(at, offset));
    if (at === -1) {
      const before = this.tokens[index];
      return before ? [before.range[0] - this.base, before.range[1] - this.base] : [offset, offset];
    }
    if (this.tokens[index + 1]?.range[0] !== this.base + at) {
      this.tokens.splice(index + 1, 0, this.token("ZamnLineEnd", at, at + 1));
    }
    return [at, at + 1];
  }

  /**
   * An attribute written in `(...)`. `#id` and `.class` are left as tokens:
   * as attributes, `.a.b` would be a duplicate `class` to every rule.
   */
  private attribute(attr: Attribute): AST.VAttribute | null {
    // `name=false` is not in the output, `name=true` is a bare `name`.
    if (attr.shorthand || attr.value === false) return null;

    let [nameStart, nameEnd] = attr.nameSpan.range;
    if (nameEnd - nameStart !== attr.name.length) {
      nameStart++;
      nameEnd--;
    }
    const node: AST.VAttribute = {
      type: "VAttribute",
      parent: PARENT,
      directive: false,
      key: null!,
      value: null,
      ...this.located(...attr.range),
    };
    node.key = {
      type: "VIdentifier",
      parent: node,
      name: attr.name.toLowerCase(),
      rawName: attr.name,
      ...this.located(nameStart, nameEnd),
    };
    if (attr.value === true || !attr.valueSpan) return node;

    let [start, end] = attr.valueSpan.range;
    const raw = this.source.slice(start, end);
    const quoted = raw.length >= 2 && "\"'`".includes(raw[0]!) && raw.endsWith(raw[0]!);
    const inner = quoted ? raw.slice(1, -1) : raw;
    // vue-eslint-parser knows `"` and `'`, and parses what is between them.
    // It would read a backtick as part of the expression.
    if (raw[0] === "`" && quoted) {
      start++;
      end--;
    }
    node.value = {
      type: "VLiteral",
      parent: node,
      // An expression is parsed from where it is in the file, so it has to
      // be the text that is there; any other value is what it means.
      value: DIRECTIVE.test(attr.name) ? inner : attr.value,
      ...this.located(start, end),
    };
    return node;
  }
}

// Given by name, vue-eslint-parser loads the tokenizer with `require()` and
// constructs what it gets.
export { ZamnTokenizer as "module.exports" };
