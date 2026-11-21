// zamn to HTML for language tooling.
//
// This is not `compile()`: the HTML here is only ever read by Vue's template
// compiler, on behalf of the editor. It differs in two ways.
//
// - It is built from `parse()`, which never fails, so a template that is
//   half-typed still gets an AST for everything that could be read.
// - Source text is copied without changing its length wherever possible
//   (attribute values are not entity-escaped, for one), and each copied piece
//   is recorded as a segment, so an offset in the HTML can be turned back
//   into an offset in the template.
import { parse } from "zamn";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);

/**
 * A piece of the HTML and where it came from: `[generated, source, length]`.
 * The `length` characters from `generated` in the HTML are the `length`
 * characters from `source` in the template. A segment of length 0 pins a
 * single point.
 * @typedef {[generated: number, source: number, length: number]} Segment
 */

class Writer {
  constructor(source) {
    this.source = source;
    this.html = "";
    /** @type {Segment[]} */
    this.segments = [];
    /** End of the last piece of source written: where an end tag belongs. */
    this.last = 0;
  }

  /** Write text that has no counterpart in the source. */
  emit(text) {
    this.html += text;
  }

  /** Pin the current position in the HTML to an offset in the source. */
  mark(source) {
    this.segments.push([this.html.length, source, 0]);
  }

  /** Write text that is the same in the source, starting at `source`. */
  copy(text, source) {
    this.segments.push([this.html.length, source, text.length]);
    this.html += text;
    this.last = Math.max(this.last, source + text.length);
  }

  nodes(nodes) {
    for (const node of nodes) this.node(node);
  }

  node(node) {
    switch (node.type) {
      case "Element":
        return this.element(node);
      case "Text":
        // Line breaks the parser puts between lines are not source text.
        if (this.source.slice(...node.range) === node.value) this.copy(node.value, node.range[0]);
        else this.emit(node.value);
        return;
      case "Interpolation":
        this.mark(node.range[0]);
        this.emit("{{ ");
        this.copy(node.expr, node.exprSpan.range[0]);
        this.emit(" }}");
        return;
      case "Comment": {
        if (!node.buffered) return;
        // Vue finds `@vue-generic {T}` and the like by counting from the
        // start of `<!--`, so that has to be as far before the text as it
        // is in the HTML, even though `//` is shorter.
        const text = node.range[0] + "//".length;
        this.mark(text - "<!--".length);
        this.emit("<!--");
        this.copy(node.value, text);
        this.emit(`${node.block ?? ""}-->`);
        return;
      }
      // A doctype means nothing inside a Vue template.
    }
  }

  element(el) {
    // Vue looks for the tag name in the template from where `<` maps to.
    const start = el.nameSpan ? el.nameSpan.range[0] : el.range[0];
    this.mark(start);
    this.emit("<");
    if (el.nameSpan) this.copy(el.name, start);
    else this.emit(el.name);
    this.last = Math.max(this.last, start);
    for (const attr of el.attrs) this.attribute(attr);

    if (el.selfClosing || VOID.has(el.name)) {
      this.mark(this.last);
      this.emit("/>");
      return;
    }
    this.emit(">");
    this.nodes(el.children);
    const closed = el.braced && this.source[el.range[1] - 1] === "}";
    const end = closed ? el.range[1] : this.last;
    this.mark(end);
    this.emit(`</${el.name}>`);
    this.last = end;
  }

  attribute(attr) {
    if (attr.value === false) return;
    this.emit(" ");

    if (attr.shorthand) {
      // Vue knows `.class` and `#id`: when an attribute starts at one of
      // those characters it maps the whole name there.
      const [at, end] = attr.range;
      this.mark(at);
      this.emit(`${attr.name}=`);
      this.mark(at);
      this.emit('"');
      this.value(attr.value, at + 1, '"');
      this.mark(end);
      this.emit('"');
      return;
    }

    const [nameStart, nameEnd] = attr.nameSpan.range;
    const quotedName = nameEnd - nameStart !== attr.name.length;
    this.copy(attr.name, nameStart + (quotedName ? 1 : 0));
    this.last = Math.max(this.last, nameEnd);
    if (attr.value === true) return;

    const [start, end] = attr.valueSpan.range;
    const raw = this.source.slice(start, end);
    const quoted = raw.length >= 2 && "\"'`".includes(raw[0]) && raw.endsWith(raw[0]);
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
      // The value has string escapes, so it is not the text in the source.
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
  value(text, source, delimiter) {
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
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

/**
 * @param {string} source
 * @returns {{ html: string, segments: Segment[], diagnostics: import("zamn").Diagnostic[] }}
 */
export function toHtml(source) {
  const { ast, diagnostics } = parse(source);
  const writer = new Writer(source);
  writer.nodes(ast.nodes);
  writer.mark(source.trimEnd().length);
  return { html: writer.html, segments: writer.segments, diagnostics };
}

/**
 * The offset in the template for an offset in the HTML. An offset that falls
 * between segments belongs to the end of the segment before it.
 * @param {Segment[]} segments ordered by generated offset, as `toHtml` returns them
 * @param {number} offset
 */
export function toSourceOffset(segments, offset) {
  // The last segment that starts at or before the offset.
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (segments[mid][0] <= offset) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return 0;
  const [generated, source, length] = segments[low - 1];
  return source + Math.min(offset - generated, length);
}
