// Prettier plugin for zamn.
//
// The formatter works from zamn's token stream rather than its AST: tokens
// keep what the AST folds away (`li: a`, `|` lines, `p.` blocks, brace
// blocks), and every piece of text can be copied straight from the source.
import { doc, util } from "prettier";
import { lex, parse as check } from "zamn";

const { hardline, literalline, indent, join, markAsRoot } = doc.builders;

// ---------------------------------------------------------------------------
// Tokens to a syntax tree
// ---------------------------------------------------------------------------

const LAYOUT = new Set(["Newline", "Indent", "Outdent", "Eos"]);
const BLOCK_END = new Set(["Eos", "Outdent", "BraceClose", "InterpEnd"]);

function syntaxError(message, loc) {
  const error = new SyntaxError(`${message} (${loc.start.line}:${loc.start.column + 1})`);
  // The shape prettier uses to print a code frame; its columns are 1-based.
  error.loc = {
    start: { line: loc.start.line, column: loc.start.column + 1 },
    end: { line: loc.end.line, column: loc.end.column + 1 },
  };
  return error;
}

/** Strip the common indentation from the lines of a text block. */
function dedent(raw) {
  const lines = raw.split("\n");
  const base = Math.min(
    ...lines.filter((l) => l.trim() !== "").map((l) => l.match(/^[ \t]*/)[0].length),
  );
  return lines.map((l) => (l.trim() === "" ? "" : l.slice(base)));
}

// Mirrors the grammar of zamn's own parser, but keeps the source layout.
class Builder {
  constructor(source, tokens) {
    this.src = source;
    this.toks = tokens;
    this.i = 0;
    /** End offset of the last token consumed that is not layout. */
    this.end = 0;
  }

  peek() {
    return this.toks[this.i]?.type ?? "Eos";
  }

  next() {
    const t = this.toks[this.i++];
    if (!LAYOUT.has(t.type)) this.end = t.range[1];
    return t;
  }

  accept(type) {
    return this.peek() === type ? this.next() : null;
  }

  expect(type) {
    const t = this.accept(type);
    if (!t) this.unexpected();
    return t;
  }

  unexpected() {
    const t = this.toks[Math.min(this.i, this.toks.length - 1)];
    throw syntaxError(`Unexpected ${t.type}`, t.loc);
  }

  /** Sibling statements up to the end of the enclosing block. */
  items() {
    const nodes = [];
    for (;;) {
      const type = this.peek();
      if (BLOCK_END.has(type)) return nodes;
      if (type === "Newline") {
        this.next();
        continue;
      }
      const node = this.statement();
      const prev = nodes.at(-1);
      // More than one line break since the previous sibling: a blank line.
      node.blankBefore = !!prev && this.src.slice(prev.end, node.start).split("\n").length > 2;
      nodes.push(node);
    }
  }

  statement() {
    const start = this.toks[this.i].range[0];
    const node = this.statementBody();
    node.start = start;
    node.end = this.end;
    return node;
  }

  statementBody() {
    switch (this.peek()) {
      case "Comment":
      case "SilentComment":
        return { type: "Comment", text: this.next().value, block: this.textBlock() };
      case "Doctype":
        return { type: "Doctype", value: this.next().value.slice("doctype".length).trim() };
      case "Eq":
        this.next();
        return { type: "Expr", expr: this.expect("Expr").value };
      case "Pipe": {
        let cursor = this.next().range[1];
        if (this.src[cursor] === " ") cursor++;
        return { type: "Pipe", parts: this.inline(cursor) };
      }
      case "RawHtml": {
        const node = { type: "RawHtml", value: this.next().value, children: [] };
        if (this.accept("Indent")) {
          node.children = this.items();
          this.expect("Outdent");
        }
        return node;
      }
      case "Dot":
        this.next();
        return { type: "TextBlock", block: this.textBlock() ?? [] };
      case "Tag":
      case "Id":
      case "Class":
        return this.element();
      default:
        return this.unexpected();
    }
  }

  /** The raw lines of the text block under a `.` or a comment, if any. */
  textBlock() {
    const open = this.accept("TextBlockStart");
    if (!open) return null;
    while (this.peek() !== "TextBlockEnd") {
      if (this.peek() === "Eos") this.unexpected();
      this.next();
    }
    const close = this.next();
    return dedent(this.src.slice(open.range[0], close.range[1]));
  }

  /**
   * Text and `#[...]` interpolations up to the end of the line, starting at
   * the offset `cursor`. Text is taken from the source so escapes survive.
   */
  inline(cursor) {
    const parts = [];
    for (;;) {
      if (this.accept("Text")) continue;
      const open = this.accept("InterpStart");
      if (!open) break;
      if (open.range[0] > cursor) parts.push(this.src.slice(cursor, open.range[0]));
      const node = BLOCK_END.has(this.peek()) ? null : this.statement();
      parts.push({ interp: node });
      cursor = this.expect("InterpEnd").range[1];
    }
    if (this.end > cursor) parts.push(this.src.slice(cursor, this.end));
    return parts;
  }

  element() {
    const el = {
      type: "Element",
      /** Tag, `#id`, `.class` (strings) and `(...)` groups, in source order. */
      head: [],
      selfClosing: false,
      /** `tag: statement` */
      expansion: null,
      /** `tag= expr` */
      expr: null,
      /** `tag.` followed by a text block */
      block: null,
      /** Text after the head. */
      parts: null,
      braced: false,
      children: [],
    };
    for (;;) {
      const type = this.peek();
      if (type === "Tag" || type === "Id" || type === "Class") {
        el.head.push(this.next().value);
      } else if (type === "AttrsOpen") {
        const attrs = this.attrs();
        if (attrs.length) el.head.push({ attrs });
      } else {
        break;
      }
    }
    const headEnd = this.end;

    switch (this.peek()) {
      case "Slash":
        this.next();
        el.selfClosing = true;
        break;
      case "Colon":
        this.next();
        el.expansion = this.statement();
        break;
      case "Eq":
        this.next();
        el.expr = this.expect("Expr").value;
        break;
      case "Dot":
        this.next();
        el.block = this.textBlock() ?? [];
        break;
      case "BraceOpen":
        this.next();
        el.braced = true;
        el.children = this.items();
        this.expect("BraceClose");
        break;
      case "Text":
      case "InterpStart":
        el.parts = this.inline(headEnd);
        break;
    }
    if (this.accept("Indent")) {
      el.children = this.items();
      this.expect("Outdent");
    }
    return el;
  }

  attrs() {
    this.next();
    const attrs = [];
    while (this.peek() === "AttrName") {
      const attr = { name: this.next().value, eq: null, value: null };
      if (this.peek() === "AttrEq" || this.peek() === "AttrEqRaw") {
        attr.eq = this.next().value;
        attr.value = this.expect("AttrValue").value;
      }
      attrs.push(attr);
    }
    this.expect("AttrsClose");
    return attrs;
  }
}

function parse(text) {
  // Formatting a template with errors could silently drop the parts the
  // lexer skipped, so refuse instead.
  const { diagnostics } = check(text);
  if (diagnostics.length) {
    const d = diagnostics[0];
    throw syntaxError(d.hint ? `${d.message}. ${d.hint}` : d.message, d.loc);
  }
  const builder = new Builder(text, lex(text).tokens);
  const nodes = builder.items();
  if (builder.peek() !== "Eos") builder.unexpected();
  return { type: "Root", nodes, start: 0, end: text.length };
}

// ---------------------------------------------------------------------------
// Syntax tree to a prettier doc
// ---------------------------------------------------------------------------

const endsInSpace = (s) => /[ \t]$/.test(s);

function partsEndInSpace(parts) {
  const last = parts.at(-1);
  return typeof last === "string" && endsInSpace(last);
}

/**
 * Whether the last line a node prints ends in whitespace. With `own`, only
 * the node's first line is considered, not its children.
 */
function endsWithSpace(node, own = false) {
  switch (node.type) {
    case "Comment":
      if (!own && node.block) return endsInSpace(node.block.at(-1));
      return endsInSpace(node.text);
    case "TextBlock":
      return node.block.length > 0 && endsInSpace(node.block.at(-1));
    case "Pipe":
      return partsEndInSpace(node.parts);
    case "RawHtml":
      if (!own && node.children.length) return endsWithSpace(node.children.at(-1));
      return endsInSpace(node.value);
    case "Element":
      if (node.braced) return false;
      if (!own && node.children.length) return endsWithSpace(node.children.at(-1));
      if (node.block) return node.block.length > 0 && endsInSpace(node.block.at(-1));
      if (node.expansion) return endsWithSpace(node.expansion);
      return !!node.parts && partsEndInSpace(node.parts);
    default:
      return false;
  }
}

/**
 * A line break. Whitespace at the end of a text line is part of the text
 * (`| a ` before `b c` is `a <b>c</b>`), but prettier trims it before a
 * `hardline`; a `literalline` keeps it and returns to the indentation of the
 * enclosing `markAsRoot`.
 */
const newline = (keepTrailingSpace) => (keepTrailingSpace ? literalline : hardline);

/** Formats one attribute as lines of text (values may span lines). */
function attrLines(attr, options) {
  if (attr.eq === null) return [attr.name];
  let value = attr.value;
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const inner = value.slice(1, -1);
    const preferred = options.singleQuote ? "'" : '"';
    const other = options.singleQuote ? '"' : "'";
    // Use the preferred quote unless the other one needs fewer escapes.
    const count = (q) => inner.split(q).length - 1;
    const use = count(preferred) > count(other) ? other : preferred;
    const unused = use === '"' ? "'" : '"';
    value =
      use +
      inner.replace(/\\([\s\S])|(["'])/g, (match, escaped, q) =>
        escaped === unused ? escaped : q === use ? `\\${q}` : match,
      ) +
      use;
  }
  const [first, ...rest] = value.split("\n");
  // Lines after the first are re-indented relative to the attribute.
  return [attr.name + attr.eq + first, ...(rest.length ? dedent(rest.join("\n")) : [])];
}

/**
 * Give every element that has children a brace block. A block can only open
 * straight after the tag, ids, classes and attributes, so an element with
 * anything else on its line (`p text`, `p= expr`) keeps its indentation.
 */
function brace(nodes) {
  for (const node of nodes) {
    if (node.type === "RawHtml") brace(node.children);
    if (node.type !== "Element") continue;
    if (node.expansion) brace([node.expansion]);
    brace(node.children);
    const bare = !node.selfClosing && node.expr === null && !node.block && !node.parts;
    if (node.children.length && bare) node.braced = true;
  }
}

function print(path, options) {
  const { printWidth, tabWidth } = options;

  /** An indented block that starts on a new line. */
  const block = (keepTrailingSpace, contents) =>
    indent(markAsRoot([newline(keepTrailingSpace), contents]));

  const textBlock = (lines, keepTrailingSpace = false) =>
    lines.length
      ? block(
          keepTrailingSpace,
          lines.map((line, i) => (i ? [newline(endsInSpace(lines[i - 1])), line] : line)),
        )
      : "";

  const siblings = (nodes, column) =>
    nodes.map((node, i) => [
      i ? newline(endsWithSpace(nodes[i - 1])) : "",
      node.blankBefore ? hardline : "",
      statement(node, column),
    ]);

  /**
   * Tag, ids, classes and attributes. Attributes go one per line when the
   * head is wider than the print width; text after the head never counts.
   * Returns the doc and the column after it.
   */
  function head(el, column, start, flat) {
    const comma = options.zamnAttributeSeparator === "comma";
    const pieces = el.head.map((piece) =>
      typeof piece === "string" ? piece : piece.attrs.map((a) => attrLines(a, options)),
    );
    const multiline = pieces.some((p) => typeof p !== "string" && p.some((a) => a.length > 1));
    const text = pieces.map((p) => (typeof p === "string" ? p : `(${p.join(comma ? ", " : " ")})`)).join("");
    const width = util.getStringWidth(text);
    const hasAttrs = pieces.some((p) => typeof p !== "string");
    if (!hasAttrs || (!multiline && (flat || start + width <= printWidth))) {
      return [text, start + width];
    }
    // One attribute per line; a comma follows each but the last.
    const attr = (lines, i, all) =>
      join(hardline, comma && i < all.length - 1 ? lines.with(-1, `${lines.at(-1)},`) : lines);
    const docs = pieces.map((p) =>
      typeof p === "string"
        ? p
        : ["(", indent([hardline, join(hardline, p.map(attr))]), hardline, ")"],
    );
    return [docs, column + 1];
  }

  const inline = (parts) =>
    parts.map((part) =>
      typeof part === "string"
        ? part
        : ["#[", part.interp ? statement(part.interp, 0, 0, true) : "", "]"],
    );

  /**
   * `column` is the indentation of the line the statement is on, `start` the
   * column the statement itself starts at. `flat` is set inside `#[...]`.
   */
  function statement(node, column, start = column, flat = false) {
    switch (node.type) {
      case "Comment":
        return [node.text, node.block ? textBlock(node.block, endsInSpace(node.text)) : ""];
      case "Doctype":
        return node.value ? `doctype ${node.value}` : "doctype";
      case "Expr":
        return `= ${node.expr}`;
      case "Pipe":
        return ["|", node.parts.length ? " " : "", inline(node.parts)];
      case "TextBlock":
        return [".", textBlock(node.block)];
      case "RawHtml":
        return [
          node.value,
          node.children.length
            ? block(endsInSpace(node.value), siblings(node.children, column + tabWidth))
            : "",
        ];
      case "Element": {
        const [headDoc, end] = head(node, column, start, flat);
        const out = [headDoc];
        if (node.selfClosing) out.push("/");
        else if (node.expansion) out.push(": ", statement(node.expansion, column, end + 2, flat));
        else if (node.expr !== null) out.push("= ", node.expr);
        else if (node.block) out.push(".", textBlock(node.block));
        else if (node.parts) out.push(inline(node.parts));

        if (node.braced) {
          out.push(
            node.children.length
              ? [
                  " {",
                  block(false, siblings(node.children, column + tabWidth)),
                  newline(endsWithSpace(node.children.at(-1))),
                  "}",
                ]
              : " {}",
          );
        } else if (node.children.length) {
          out.push(block(endsWithSpace(node, true), siblings(node.children, column + tabWidth)));
        }
        return out;
      }
    }
  }

  const { nodes } = path.node;
  if (!nodes.length) return "";
  if (options.zamnBlockStyle === "braces") brace(nodes);
  // The final line break stays outside the root so that prettier can strip it
  // when the template is embedded in another file.
  const keep = endsWithSpace(nodes.at(-1));
  return [markAsRoot([siblings(nodes, 0), keep ? literalline : ""]), keep ? "" : hardline];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const languages = [
  {
    name: "zamn",
    parsers: ["zamn"],
    extensions: [".zamn"],
    vscodeLanguageIds: ["zamn"],
  },
];

export const options = {
  zamnBlockStyle: {
    category: "zamn",
    type: "choice",
    default: "braces",
    description: "How to write the children of an element.",
    choices: [
      { value: "braces", description: "In { }, for every element that has children." },
      { value: "preserve", description: "In { } or by indentation, as each element is written." },
    ],
  },
  zamnAttributeSeparator: {
    category: "zamn",
    type: "choice",
    default: "space",
    description: "What to put between the attributes of a tag.",
    choices: [
      { value: "space", description: 'A space: a(href="/" target="_blank")' },
      { value: "comma", description: 'A comma and a space: a(href="/", target="_blank")' },
    ],
  },
};

export const parsers = {
  zamn: {
    parse,
    astFormat: "zamn",
    locStart: (node) => node.start,
    locEnd: (node) => node.end,
  },
};

export const printers = {
  zamn: { print },
};

export default { languages, options, parsers, printers };
