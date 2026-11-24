// The syntax tree to a Prettier doc.
//
// One statement per line, children in `{ }` blocks, indented with
// `tabWidth` / `useTabs`. Indentation means nothing to zamn, so re-indenting
// is safe everywhere, including the lines of `|{ }` text and of `script` and
// `style` content: the compiler strips the indentation their lines have in
// common. Text, comments and expressions are copied as written.
import { doc, util, type AstPath, type Doc, type ParserOptions } from "prettier";
import type { Attr, Body, Element, Interp, Part, Root, Statement } from "./tree.js";

const { hardline, indent, join, literalline } = doc.builders;

export type Options = ParserOptions<Root> & {
  zamnMaxAttributesPerLine: number | false;
  zamnAttributeSeparator: "space" | "comma";
};

const leading = (line: string) => line.match(/^[ \t]*/)![0].length;

/**
 * Lines with the indentation they have in common left out, and without
 * whitespace at their end, which means nothing. Blank lines are empty.
 */
function dedent(lines: string[]): string[] {
  const trimmed = lines.map((l) => l.trimEnd());
  const base = Math.min(...trimmed.filter((l) => l).map(leading));
  return trimmed.map((l) => (l ? l.slice(base) : ""));
}

/** Without the blank lines at either end, which zamn drops. */
function trimBlank(lines: string[]): string[] {
  let from = 0;
  let to = lines.length;
  while (from < to && !lines[from]) from++;
  while (to > from && !lines[to - 1]) to--;
  return lines.slice(from, to);
}

/** Text after `|` starts after one space, if there is one. */
const afterPipe = (text: string) => (text.startsWith(" ") ? text.slice(1) : text);

/** A text statement: `| text` or `|{ }`, which zamn joins with a line break. */
const isText = (node: Statement) =>
  node.type === "PipeBlock" || (node.type === "Pipe" && node.parts.length > 0);

export function print(path: AstPath<Root>, options: Options): Doc {
  const { printWidth, tabWidth } = options;
  const comma = options.zamnAttributeSeparator === "comma";

  /** Formats one attribute as lines of text (values may span lines). */
  function attrLines(attr: Attr): string[] {
    if (attr.eq === null || attr.value === null) return [attr.name];
    let value = attr.value;
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const inner = value.slice(1, -1);
      const preferred = options.singleQuote ? "'" : '"';
      const other = options.singleQuote ? '"' : "'";
      // Use the preferred quote unless the other one needs fewer escapes.
      const count = (q: string) => inner.split(q).length - 1;
      const use = count(preferred) > count(other) ? other : preferred;
      const unused = use === '"' ? "'" : '"';
      value =
        use +
        inner.replace(/\\([\s\S])|(["'])/g, (match, escaped?: string, q?: string) =>
          escaped === unused ? escaped : q === use ? `\\${q}` : match,
        ) +
        use;
    }
    const [first, ...rest] = value.split("\n");
    // Lines after the first are re-indented relative to the attribute.
    return [attr.name + attr.eq + first, ...(rest.length ? dedent(rest) : [])];
  }

  /**
   * Tag, ids, classes and attributes. Attributes go on the line of the tag
   * or one per line, as `zamnMaxAttributesPerLine` says; text after the head
   * never counts towards the print width. Returns the doc and the column
   * after it. `flat` keeps everything on one line, for `#{...}`.
   */
  function head(el: Element, column: number, start: number, flat: boolean): [Doc, number] {
    const pieces = el.head.map((piece) =>
      typeof piece === "string" ? piece : piece.attrs.map(attrLines),
    );
    const multiline = pieces.some((p) => typeof p !== "string" && p.some((a) => a.length > 1));
    const text = pieces
      .map((p) => (typeof p === "string" ? p : `(${p.join(comma ? ", " : " ")})`))
      .join("");
    const width = util.getStringWidth(text);
    const groups = el.head.filter((piece) => typeof piece !== "string");
    const count = groups.reduce((n, group) => n + group.attrs.length, 0);
    const max = options.zamnMaxAttributesPerLine;
    let wrap: boolean;
    // A value that spans lines cannot share a line with another attribute.
    if (multiline) wrap = true;
    else if (flat || max === false) wrap = false;
    else if (max === -1) wrap = groups.some((group) => group.wrapped);
    else wrap = count > max || start + width > printWidth;
    if (!count || !wrap) return [text, start + width];
    // One attribute per line; a comma follows each but the last.
    const attr = (lines: string[], i: number, all: string[][]) =>
      join(hardline, comma && i < all.length - 1 ? lines.with(-1, `${lines.at(-1)},`) : lines);
    const docs = pieces.map((p) =>
      typeof p === "string"
        ? p
        : ["(", indent([hardline, join(hardline, p.map(attr))]), hardline, ")"],
    );
    return [docs, column + 1];
  }

  const interp = (part: Interp) =>
    part.verbatim ?? `#{${part.statement ? flat(part.statement) : ""}}`;

  /** Text as written, with the inline elements in it formatted. */
  const render = (parts: Part[]) =>
    parts.map((part) => (typeof part === "string" ? part : interp(part))).join("");

  /** The text of a `|{ }` on one line. */
  const oneLine = (parts: Part[]) => {
    const text = render(parts).trim();
    return text ? `|{ ${text} }` : "|{}";
  };

  /**
   * The lines of a `|{ }` over several lines, without their common
   * indentation. zamn strips all the indentation of a first line written
   * after the `{` and the common indentation of the others, so the first
   * line can move to a line of its own.
   */
  function blockLines(parts: Part[]): string[] {
    const [first = "", ...rest] = render(parts).split("\n");
    return trimBlank([first.trim(), ...(rest.length ? dedent(rest) : [])]);
  }

  /** `|{` and the indented lines of a `|{ }` over several lines, and `}`. */
  function textBlock(lines: string[]): Doc {
    return ["|{", indent([hardline, join(hardline, lines)]), hardline, "}"];
  }

  /**
   * What follows the head for text: `tag text` where that means the same,
   * or `tag | text`. `keepBlock` keeps a `|{ }` on one line as it is, for
   * where something may follow it on the line.
   */
  function inlineText(body: Body & { kind: "text" | "pipe" | "pipeBlock" }, keepBlock: boolean) {
    switch (body.kind) {
      case "text": {
        // One space or tab separates the head from its text; more are text.
        const text = render(body.parts);
        return ` ${/^[ \t]/.test(text) ? text.slice(1) : text}`;
      }
      case "pipe": {
        if (!body.parts.length) return " |";
        const text = afterPipe(render(body.parts));
        // After the head, a `|` would start the text again.
        return text.trimStart().startsWith("|") ? ` | ${text}` : ` ${text}`;
      }
      case "pipeBlock": {
        if (keepBlock) return ` ${oneLine(body.parts)}`;
        // Text in `|{ }` on one line is trimmed.
        const text = render(body.parts).trim();
        if (!text) return "";
        return text.startsWith("|") ? ` | ${text}` : ` ${text}`;
      }
    }
  }

  /** The text of a `|` statement. */
  const pipe = (parts: Part[]) => (parts.length ? `| ${afterPipe(render(parts))}` : "|");

  /** A statement on one line, inside `#{...}`. */
  function flat(node: Statement): string {
    switch (node.type) {
      case "Comment":
        return node.text;
      case "Doctype":
        return `doctype ${node.value}`;
      case "Expr":
        return `= ${node.expr}`;
      case "Pipe":
        return pipe(node.parts);
      case "PipeBlock":
        return oneLine(node.parts);
      case "Element": {
        const [headDoc] = head(node, 0, 0, true);
        const { body } = node;
        let rest = "";
        switch (body.kind) {
          case "expansion":
            rest = `: ${flat(body.child)}`;
            break;
          case "expr":
            rest = `= ${body.expr}`;
            break;
          case "text":
          case "pipe":
          case "pipeBlock":
            rest = inlineText(body, true);
            break;
          case "braced":
            rest = body.children.length ? ` { ${body.children.map(flat).join(" ")} }` : " {}";
            break;
        }
        return (headDoc as string) + rest;
      }
    }
  }

  /** Siblings, one per line, but text statements that share a line. */
  function siblings(nodes: Statement[], column: number): Doc[] {
    return nodes.map((node, i) => {
      const prev = nodes[i - 1];
      // Text statements on two lines are joined with a line break, and on
      // one line without, so they stay on their line.
      if (prev && node.sameLine && isText(prev) && isText(node)) {
        return [" ", statement(node, column)];
      }
      return [i ? hardline : "", node.blankBefore ? hardline : "", statement(node, column)];
    });
  }

  /**
   * `column` is the indentation of the line the statement is on, `start` the
   * column the statement itself starts at.
   */
  function statement(node: Statement, column: number, start = column): Doc {
    switch (node.type) {
      case "Comment":
        // A block comment over several lines stays exactly as written.
        return join(literalline, node.text.split("\n"));
      case "Doctype":
      case "Expr":
      case "Pipe":
        return flat(node);
      case "PipeBlock": {
        if (!node.multiline) return oneLine(node.parts);
        const lines = blockLines(node.parts);
        return lines.length ? textBlock(lines) : "|{}";
      }
      case "Element": {
        const [headDoc, end] = head(node, column, start, false);
        let { body } = node;
        // An element whose only child is a line of text: `tag text`.
        if (body.kind === "braced" && body.children.length === 1) {
          const [child] = body.children as [Statement];
          if (child.type === "Pipe" && child.parts.length) {
            body = { kind: "pipe", parts: child.parts };
          } else if (child.type === "PipeBlock" && !child.multiline) {
            body = { kind: "pipeBlock", parts: child.parts, multiline: false };
          }
        }
        switch (body.kind) {
          case "none":
            return headDoc;
          case "expansion":
            return [headDoc, ": ", statement(body.child, column, end + 2)];
          case "expr":
            return [headDoc, `= ${body.expr}`];
          case "text":
          case "pipe":
            return [headDoc, inlineText(body, false)];
          case "pipeBlock": {
            if (!body.multiline) return [headDoc, inlineText(body, false)];
            const lines = blockLines(body.parts);
            return [headDoc, lines.length ? [" ", textBlock(lines)] : ""];
          }
          case "braced":
            if (!body.children.length) return [headDoc, " {}"];
            return [
              headDoc,
              " {",
              indent([hardline, siblings(body.children, column + tabWidth)]),
              hardline,
              "}",
            ];
          case "raw": {
            // The content is not parsed; only its common indentation changes.
            const lines = trimBlank(dedent(body.lines));
            return [
              headDoc,
              lines.length ? indent([hardline, join(hardline, lines)]) : "",
              hardline,
              body.close,
            ];
          }
        }
      }
    }
  }

  const { nodes } = path.node;
  if (!nodes.length) return "";
  return [siblings(nodes, 0), hardline];
}
