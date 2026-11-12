// Template tokenizer for vue-eslint-parser: lets ESLint read
// `<template lang="zamn">`.
//
// vue-eslint-parser hands over the text of the template and expects the
// stream its own HTML tokenizer would produce: start tags with their
// attributes, end tags, text and mustaches. It builds the template AST from
// those and parses the expressions itself, so everything here is positioned
// in the whole `.vue` file.
import { lex, parse } from "zamn";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);
// Attribute names vue-eslint-parser reads as directives.
const DIRECTIVE = /^(?:v-|[.:@#]).*[^.:@#]$|^slot-scope$|^scope$/u;
const MUSTACHE = /\{\{([\s\S]*?)\}\}/g;

// Tokens that say nothing ESLint can use: they are empty or whitespace.
const LAYOUT = new Set([
  "Newline", "Indent", "Outdent", "Eos", "TextBlockStart", "TextNewline", "TextBlockEnd",
]);
const PARENT = Object.freeze({});

export default class ZamnTokenizer {
  /**
   * @param {string} text the content of `<template>`, with line breaks normalised
   * @param {string} code the whole file
   * @param {{ startingLine: number, startingColumn: number }} position of `text` in `code`
   */
  constructor(text, code, { startingLine, startingColumn }) {
    // vue-eslint-parser reads and writes these while it consumes the tokens.
    this.text = code;
    this.expressionEnabled = true;
    this.namespace = HTML_NAMESPACE;
    this.state = "DATA";
    this.tokens = [];
    this.comments = [];
    this.errors = [];

    this.lineStarts = [0];
    for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) {
      this.lineStarts.push(i + 1);
    }
    // `text` has `\n` where the file may have `\r\n`, so take the template
    // from the file, where offsets are what ESLint counts.
    this.base = this.lineStarts[startingLine - 1] + startingColumn;
    let end = this.base;
    for (let i = 0; i < text.length; i++, end++) {
      if (text[i] === "\n" && code[end] === "\r") end++;
    }
    this.source = code.slice(this.base, end);

    const { ast, diagnostics } = parse(this.source);
    for (const d of diagnostics) {
      // No `code`: vue/no-parsing-error skips codes it does not know.
      const error = new SyntaxError(d.message);
      const { line, column } = this.position(d.range[0]);
      this.errors.push(Object.assign(error, { index: this.base + d.range[0], lineNumber: line, column }));
    }

    /** The lexer's tokens, layout included. */
    this.lexed = lex(this.source).tokens;
    /** Index in `lexed` of the token that starts at an offset. */
    this.lexedAt = new Map();
    /** The ESLint token that starts at an offset. */
    this.tokenAt = new Map();
    for (let i = 0; i < this.lexed.length; i++) {
      const t = this.lexed[i];
      if (t.type === "Comment" || t.type === "SilentComment") {
        // Comments, with their blocks, go to `comments` when they are visited.
        if (this.lexed[i + 1]?.type === "TextBlockStart") {
          while (i < this.lexed.length - 1 && this.lexed[i].type !== "TextBlockEnd") i++;
        }
        continue;
      }
      if (LAYOUT.has(t.type) || t.range[0] === t.range[1]) continue;
      const token = this.token(`Zamn${t.type}`, t.range[0], t.range[1]);
      this.lexedAt.set(t.range[0], i);
      this.tokenAt.set(t.range[0], token);
      this.tokens.push(token);
    }
    this.tokens.sort((a, b) => a.range[0] - b.range[0]);

    /** End of the last thing visited: where an element's content ends. */
    this.last = 0;
    /** How many elements the walk is inside. */
    this.depth = 0;
    this.walk = this.nodes(ast.nodes);
  }

  /** The next StartTag, EndTag, Text or Mustache, or null at the end. */
  nextToken() {
    const { value, done } = this.walk.next();
    return done ? null : value;
  }

  // -------------------------------------------------------------------------
  // Locations. Offsets are into the template unless said otherwise.
  // -------------------------------------------------------------------------

  position(offset) {
    const index = this.base + offset;
    let low = 0;
    let high = this.lineStarts.length;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (this.lineStarts[mid] <= index) low = mid;
      else high = mid;
    }
    return { line: low + 1, column: index - this.lineStarts[low] };
  }

  located(start, end) {
    return {
      range: [this.base + start, this.base + end],
      loc: { start: this.position(start), end: this.position(end) },
    };
  }

  token(type, start, end) {
    return { type, value: this.source.slice(start, end), ...this.located(start, end) };
  }

  // -------------------------------------------------------------------------
  // The AST, as the tokens vue-eslint-parser builds its own from
  // -------------------------------------------------------------------------

  *nodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type !== "Text" && node.type !== "RawHtml") {
        yield* this.node(node);
        continue;
      }
      // Pieces of text with nothing but whitespace between them are read as
      // one, so a mustache can span the lines of a text block.
      let start = -1;
      let end = -1;
      for (; i < nodes.length; i++) {
        const { type, value, range } = nodes[i];
        if (type !== "Text" && type !== "RawHtml") break;
        // Line breaks the parser adds between lines are not in the source.
        if (this.source.slice(...range) !== value) continue;
        if (start !== -1 && this.source.slice(end, range[0]).trim() !== "") break;
        if (start === -1) start = range[0];
        end = range[1];
      }
      i--;
      if (start !== -1) yield* this.textRun(start, end);
    }
  }

  *node(node) {
    switch (node.type) {
      case "Element":
        return yield* this.element(node);
      case "Interpolation":
        return yield* this.interpolation(node);
      case "Comment": {
        // `// eslint-disable-next-line` works as it does in `<!-- -->`.
        const marker = node.buffered ? 2 : 3;
        const [start, end] = node.range;
        this.comments.push({
          type: "HTMLComment",
          value: this.source.slice(start + marker, end),
          ...this.located(start, end),
        });
        this.last = Math.max(this.last, end);
      }
      // A doctype means nothing inside a Vue template.
    }
  }

  /**
   * Text, split into the mustaches it holds.
   *
   * Text outside every element stays out of the AST: vue-eslint-parser takes
   * any text directly under `<template>` for a template to tokenize, and
   * would start over on it without end.
   */
  *textRun(start, end) {
    this.last = Math.max(this.last, end);
    const text = this.source.slice(start, end);
    const mustaches = this.expressionEnabled ? [...text.matchAll(MUSTACHE)] : [];
    const pieces = [];
    const plain = (from, to) => {
      if (from === to || this.depth === 0) return;
      pieces.push({ type: "Text", value: this.source.slice(from, to), ...this.located(from, to) });
    };
    if (mustaches.length === 0) {
      plain(start, end);
      yield* pieces;
      return;
    }

    const tokens = [];
    let cursor = start;
    for (const match of mustaches) {
      const open = start + match.index;
      const close = open + match[0].length;
      plain(cursor, open);
      if (cursor !== open) tokens.push(this.token("ZamnText", cursor, open));
      const startToken = this.token("VExpressionStart", open, open + 2);
      const endToken = this.token("VExpressionEnd", close - 2, close);
      tokens.push(startToken);
      // vue-eslint-parser puts the expression's own tokens in place of this.
      if (match[1]) tokens.push(this.token("ZamnText", open + 2, close - 2));
      tokens.push(endToken);
      pieces.push({
        type: "Mustache",
        value: match[1],
        startToken,
        endToken,
        ...this.located(open, close),
      });
      cursor = close;
    }
    plain(cursor, end);
    if (cursor !== end) tokens.push(this.token("ZamnText", cursor, end));

    const [first, last] = [this.base + start, this.base + end];
    const index = this.tokens.findIndex((t) => t.range[0] >= first);
    let count = 0;
    while (this.tokens[index + count]?.range[1] <= last) count++;
    this.tokens.splice(index, count, ...tokens);
    yield* pieces;
  }

  /** `= expr`, which is `{{ expr }}`. */
  *interpolation(node) {
    const [start, end] = node.exprSpan.range;
    this.last = Math.max(this.last, end);
    if (!this.expressionEnabled) {
      yield { type: "Text", value: node.expr, ...this.located(start, end) };
      return;
    }
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

  *element(el) {
    // The head: the tag, then `#id`, `.class` and `(...)` in any order.
    const first = this.lexedAt.get(el.range[0]);
    let i = first;
    if (this.lexed[i]?.type === "Tag") i++;
    for (;;) {
      const type = this.lexed[i]?.type;
      if (type === "AttrsOpen") {
        do i++;
        while (/^Attr(Name|Eq|EqRaw|Value)$/.test(this.lexed[i]?.type));
        if (this.lexed[i]?.type === "AttrsClose") i++;
      } else if (type === "Id" || type === "Class") i++;
      else break;
    }
    if (el.selfClosing && this.lexed[i]?.type === "Slash") i++;
    const end = this.lexed[i - 1].range[1];
    this.last = Math.max(this.last, end);

    yield {
      type: "StartTag",
      name: el.name.toLowerCase(),
      rawName: el.name,
      selfClosing: el.selfClosing,
      attributes: el.attrs.flatMap((attr) => this.attribute(attr) ?? []),
      ...this.located(el.range[0], end),
    };
    // vue-eslint-parser has now set the namespace this element's children
    // are in. It leaves void elements closed, as it does `tag/`.
    const open = !el.selfClosing && !(this.namespace === HTML_NAMESPACE && VOID.has(el.name));

    // The children of an element that cannot have any are its siblings.
    if (open) this.depth++;
    yield* this.nodes(el.children);
    if (!open) return;
    this.depth--;

    // What closes the element: its `}`, the `]` of `#[...]`, or else the
    // end of its last line.
    let close;
    if (this.lexed[i]?.type === "BraceOpen") {
      let depth = 0;
      close = this.lexed.slice(i).find((t) => {
        if (t.type === "BraceOpen") depth++;
        return t.type === "BraceClose" && --depth === 0;
      });
    } else if (this.lexed[first - 1]?.type === "InterpStart") {
      close = this.lexed.find((t) => t.type === "InterpEnd" && t.range[0] >= this.last);
    }
    // The lexer closes what is left open with an empty token.
    let range;
    if (close && close.range[0] !== close.range[1]) {
      range = close.range;
      this.last = Math.max(this.last, range[1]);
    } else {
      range = this.lineEnd(this.last);
    }
    yield { type: "EndTag", name: el.name.toLowerCase(), ...this.located(...range) };
  }

  /**
   * The line break after `offset`, as the range of an end tag. Rules ask for
   * the tokens of an end tag and do not expect to find none, so the line
   * break becomes a token; on the last line of a template that does not end
   * with one, the token before stands in.
   */
  lineEnd(offset) {
    const at = this.source.indexOf("\n", offset);
    const index = this.tokens.findLastIndex((t) => t.range[0] < this.base + Math.max(at, offset));
    if (at === -1) {
      const before = this.tokens[index];
      return before ? before.range.map((n) => n - this.base) : [offset, offset];
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
  attribute(attr) {
    // `name=false` is not in the output, `name=true` is a bare `name`.
    if (attr.shorthand || attr.value === false) return null;

    let [nameStart, nameEnd] = attr.nameSpan.range;
    if (nameEnd - nameStart !== attr.name.length) {
      nameStart++;
      nameEnd--;
    }
    const node = {
      type: "VAttribute",
      parent: PARENT,
      directive: false,
      key: null,
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
    if (attr.value === true) return node;

    let [start, end] = attr.valueSpan.range;
    const raw = this.source.slice(start, end);
    const quoted = raw.length >= 2 && "\"'`".includes(raw[0]) && raw.endsWith(raw[0]);
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
