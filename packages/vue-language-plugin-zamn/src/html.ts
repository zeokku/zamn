// zamn to HTML for language tooling.
//
// This is not `compile()`: the HTML here is only ever read by Vue's template
// compiler, on behalf of the editor. It has the structure `compile()` gives,
// but differs in two ways.
//
// - It is built from `parse()`, which never fails, so a template that is
//   half-typed still gets an AST for everything that could be read.
// - Source text is copied without changing its length wherever possible
//   (attribute values are not entity-escaped, for one), and each copied piece
//   is recorded as a segment, so an offset in the HTML can be turned back
//   into an offset in the template.
import { lex, parse } from "zamn";
import type { Attribute, Diagnostic, Element, Node, Token } from "zamn";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);

/** The tokens that end an element: `}` of `{ }`, of `|{ }`, and the `/script` line. */
const CLOSERS = new Set(["BraceClose", "PipeClose", "RawEnd"]);

/**
 * A piece of the HTML and where it came from: `[generated, source, length]`.
 * The `length` characters from `generated` in the HTML are the `length`
 * characters from `source` in the template. A segment of length 0 pins a
 * single point.
 */
export type Segment = [generated: number, source: number, length: number];

export interface HtmlResult {
  html: string;
  segments: Segment[];
  /** zamn's diagnostics, errors and warnings. */
  diagnostics: Diagnostic[];
}

/**
 * The characters of text that `compile()` escapes: `<`, `>`, and an `&` that
 * does not start a character reference (`&name;`, `&#123;`, `&#x1F;`).
 */
const TEXT_ESCAPE = /[<>]|&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);)/g;
const TEXT_ENTITY: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };

class Writer {
  html = "";
  segments: Segment[] = [];
  /** End of the last piece of source written: where an end tag belongs. */
  last = 0;
  /** The token that closes an element, by where the element's range ends. */
  private closers = new Map<number, Token>();
  /** `#{` ... `}` tokens: `}` by the offset of the first token inside. */
  private inline = new Map<number, Token>();

  constructor(
    private source: string,
    tokens: Token[],
  ) {
    const open: Token[] = [];
    for (const [i, token] of tokens.entries()) {
      if (CLOSERS.has(token.type)) this.closers.set(token.range[1], token);
      if (token.type === "InterpStart") open.push(tokens[i + 1] ?? token);
      if (token.type === "InterpEnd") {
        const first = open.pop();
        if (first) this.inline.set(first.range[0], token);
      }
    }
  }

  /** Write text that has no counterpart in the source. */
  emit(text: string) {
    this.html += text;
  }

  /** Pin the current position in the HTML to an offset in the source. */
  mark(source: number) {
    this.segments.push([this.html.length, source, 0]);
  }

  /** Write text that is the same in the source, starting at `source`. */
  copy(text: string, source: number) {
    if (!text) return;
    this.segments.push([this.html.length, source, text.length]);
    this.html += text;
    this.last = Math.max(this.last, source + text.length);
  }

  nodes(nodes: Node[], raw = false) {
    for (const node of nodes) this.node(node, raw);
  }

  node(node: Node, raw: boolean) {
    switch (node.type) {
      case "Element":
        return this.element(node);
      case "Text":
        return this.text(node.value, node.range, raw);
      case "Mustache":
        // Written as it is, like `compile()` does.
        return this.text(node.value, node.range, true);
      case "Interpolation":
        this.mark(node.range[0]);
        this.emit("{{ ");
        this.copy(node.expr, node.exprSpan.range[0]);
        this.emit(" }}");
        return;
      case "Comment": {
        if (!node.buffered) return;
        // Vue finds `@vue-generic {T}` and the like by counting from the
        // start of `<!--`, so that has to be as far before the text as it is
        // in the HTML, even though `//!` and `/*!` are shorter.
        const text = node.range[0] + "//!".length;
        this.mark(text - "<!--".length);
        this.emit("<!--");
        this.text(node.value, [text, text + node.value.length], true);
        this.emit("-->");
        return;
      }
      // A doctype means nothing inside a Vue template.
    }
  }

  /**
   * Text, escaped as `compile()` escapes it unless `raw`. Where it is the
   * text in the source, it is copied piece by piece around what is escaped;
   * otherwise (escapes such as `\{` were resolved, or the lines of a `|{ }`
   * block lost their common indentation) it maps to where it starts.
   */
  text(value: string, [start, end]: [number, number], raw: boolean) {
    const escaped = raw ? value : value.replace(TEXT_ESCAPE, (c) => TEXT_ENTITY[c]!);
    if (this.source.slice(start, end) !== value) {
      this.mark(start);
      this.emit(escaped);
      this.last = Math.max(this.last, end);
      return;
    }
    if (escaped === value) return this.copy(value, start);
    let from = 0;
    for (const match of value.matchAll(TEXT_ESCAPE)) {
      const at = match.index;
      this.copy(value.slice(from, at), start + from);
      this.mark(start + at);
      this.emit(TEXT_ENTITY[match[0]]!);
      from = at + 1;
    }
    this.copy(value.slice(from), start + from);
  }

  element(el: Element) {
    // Vue looks for the tag name in the template from where `<` maps to.
    const start = el.nameSpan ? el.nameSpan.range[0] : el.range[0];
    this.mark(start);
    this.emit("<");
    if (el.nameSpan) this.copy(el.name, start);
    else this.emit(el.name);
    this.last = Math.max(this.last, start);
    for (const attr of el.attrs) this.attribute(attr);

    if (VOID.has(el.name)) {
      this.mark(this.last);
      this.emit(">");
      return;
    }
    this.emit(">");
    this.nodes(el.children, el.raw);

    // The end tag goes on the `}` (or `/script` line) that closes the
    // element, and otherwise after its content. `</name` maps to the start
    // of that token and `>` to its end, so the element's range ends there.
    const closer = this.closer(el);
    const [end, after] = closer ? closer.range : [this.last, this.last];
    this.mark(end);
    this.emit(`</${el.name}`);
    this.mark(after);
    this.emit(">");
    this.last = Math.max(this.last, after);
  }

  /** The `}`, `/script` or `#{`'s `}` that ends an element, if any. */
  private closer(el: Element): Token | undefined {
    const own = this.closers.get(el.range[1]);
    if (own) return own;
    // An inline element's range stops before the `}` of its `#{ }`.
    const inline = this.inline.get(el.range[0]);
    return inline && inline.range[0] >= el.range[1] ? inline : undefined;
  }

  attribute(attr: Attribute) {
    // compile() drops these too: `false`, and a `style={}` with nothing in it.
    if (attr.value === false || (attr.name === "style" && attr.value === "")) return;
    this.emit(" ");

    if (attr.shorthand) {
      // Vue knows `.class` and `#id`: when an attribute starts at one of
      // those characters it maps the whole name there.
      const [at, end] = attr.range;
      this.mark(at);
      this.emit(`${attr.name}=`);
      this.mark(at);
      this.emit('"');
      this.value(String(attr.value), at + 1, '"');
      this.mark(end);
      this.emit('"');
      return;
    }

    const [nameStart, nameEnd] = attr.nameSpan.range;
    const quotedName = nameEnd - nameStart !== attr.name.length;
    this.copy(attr.name, nameStart + (quotedName ? 1 : 0));
    this.last = Math.max(this.last, nameEnd);
    if (attr.value === true || !attr.valueSpan) return;

    const [start, end] = attr.valueSpan.range;
    const raw = this.source.slice(start, end);
    const quoted = raw.length >= 2 && "\"'`".includes(raw[0]!) && raw.endsWith(raw[0]!);
    const inner = quoted ? raw.slice(1, -1) : raw;
    const innerStart = start + (quoted ? 1 : 0);
    // Vue takes the character before the value for its opening quote.
    const delimiter = inner.includes('"') && !inner.includes("'") ? "'" : '"';
    if (quoted) {
      this.emit("=");
      this.copy(delimiter, innerStart - 1);
    } else {
      // Unquoted, as HTML allows: the quote is written where the value starts.
      if (this.source[start - 1] === "=") this.copy("=", start - 1);
      else this.emit("=");
      this.mark(start);
      this.emit(delimiter);
    }
    if (inner === attr.value) {
      this.value(inner, innerStart, delimiter);
    } else {
      // The value has string escapes, or is a `style={}` object turned into
      // CSS, so it is not the text in the source.
      this.mark(innerStart);
      this.emit(attr.value.replace(/["'&]/g, (c) => `&#${c.charCodeAt(0)};`));
    }
    this.mark(innerStart + inner.length);
    this.emit(delimiter);
    this.last = Math.max(this.last, end);
  }

  /**
   * An attribute value, copied from the source. Only what would change its
   * meaning in HTML is escaped: the delimiter, and an `&` that would start a
   * character reference (`a && b` is left alone, `a&b` is not).
   */
  value(text: string, source: number, delimiter: string) {
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      const escape = c === delimiter || (c === "&" && /[a-zA-Z#]/.test(text[i + 1] ?? ""));
      if (!escape) continue;
      this.copy(text.slice(from, i), source + from);
      this.mark(source + i);
      this.emit(`&#${c.charCodeAt(0)};`);
      from = i + 1;
    }
    this.copy(text.slice(from), source + from);
  }
}

/** The HTML Vue's compiler reads for a zamn template, and how it maps back. */
export function toHtml(source: string): HtmlResult {
  const { ast, diagnostics } = parse(source);
  const writer = new Writer(source, lex(source).tokens);
  writer.nodes(ast.nodes);
  writer.mark(source.trimEnd().length);
  return { html: writer.html, segments: writer.segments, diagnostics };
}

/**
 * The offset in the template for an offset in the HTML. An offset that falls
 * between segments belongs to the end of the segment before it. Where a
 * segment starts exactly at the offset, `"start"` (for where something
 * begins) takes that segment, and `"end"` (for where something ends) the one
 * before it.
 * @param segments ordered by generated offset, as `toHtml` returns them
 */
export function toSourceOffset(
  segments: Segment[],
  offset: number,
  side: "start" | "end" = "start",
): number {
  // The last segment that starts at (for "start") or before the offset.
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const generated = segments[mid]![0];
    if (side === "start" ? generated <= offset : generated < offset) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return side === "end" ? toSourceOffset(segments, offset) : 0;
  const [generated, source, length] = segments[low - 1]!;
  return source + Math.min(offset - generated, length);
}
