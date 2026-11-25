// zamn's token stream to the syntax tree the printer works from.
//
// The formatter works from tokens rather than zamn's AST: tokens keep what
// the AST folds away (`li: a`, `| text` and `|{ }`, the source of text with
// its escapes, which statements share a line), and every piece of text can
// be copied straight from the source.
import type { Loc, Token, TokenType } from "zamn";

/** Text as written, or an inline element `#{...}`. */
export type Part = string | Interp;

export interface Interp {
  /** The statement inside `#{ }`, if any. */
  statement: Statement | null;
  /** The whole `#{...}` as written, when it spans lines: it is kept so. */
  verbatim: string | null;
}

export interface Located {
  start: number;
  end: number;
  /** A blank line comes before it. */
  blankBefore: boolean;
  /** It starts on the line the statement before it ends on. */
  sameLine: boolean;
}

/** `//`, `//!`, `/* *\/` or `/*! *\/`, as written. */
export interface Comment extends Located {
  type: "Comment";
  text: string;
}

export interface Doctype extends Located {
  type: "Doctype";
  value: string;
}

/** `= expr` */
export interface Expr extends Located {
  type: "Expr";
  expr: string;
}

/**
 * `| text`, or a bare `|` when `parts` is empty. The parts start right after
 * the `|`, with the space after it.
 */
export interface Pipe extends Located {
  type: "Pipe";
  parts: Part[];
}

/** `|{ ... }`. The parts are what is between the braces, as written. */
export interface PipeBlock extends Located {
  type: "PipeBlock";
  parts: Part[];
  multiline: boolean;
}

export interface Attr {
  name: string;
  /** `=` or `!=`; `null` for a boolean attribute. */
  eq: string | null;
  value: string | null;
}

/** A `(...)` group, and whether it is written over several lines. */
export interface AttrGroup {
  attrs: Attr[];
  wrapped: boolean;
}

/** What follows the head of an element. */
export type Body =
  | { kind: "none" }
  /** `tag: statement` */
  | { kind: "expansion"; child: Statement }
  /** `tag= expr` */
  | { kind: "expr"; expr: string }
  /** Text straight after the head, from the end of the head, as written. */
  | { kind: "text"; parts: Part[] }
  /** `tag { ... }` */
  | { kind: "braced"; children: Statement[] }
  /** `script` or `style` content: its lines, and the closing `/tag`. */
  | { kind: "raw"; lines: string[]; close: string };

export interface Element extends Located {
  type: "Element";
  /** Tag, `#id`, `.class` (strings) and `(...)` groups, in source order. */
  head: (string | AttrGroup)[];
  body: Body;
}

export type Statement = Comment | Doctype | Expr | Pipe | PipeBlock | Element;

/** A statement before its place in the source is known. */
type Unplaced<T> = T extends unknown ? Omit<T, keyof Located> : never;

export interface Root {
  type: "Root";
  nodes: Statement[];
  start: number;
  end: number;
}

const BLOCK_END = new Set<TokenType>(["Eos", "BraceClose", "InterpEnd"]);
const INLINE = new Set<TokenType>(["Text", "Mustache", "InterpStart"]);

/** The shape Prettier uses to print a code frame; its columns are 1-based. */
export class ZamnSyntaxError extends SyntaxError {
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };

  constructor(message: string, loc: Loc) {
    super(`${message} (${loc.start.line}:${loc.start.column + 1})`);
    this.loc = {
      start: { line: loc.start.line, column: loc.start.column + 1 },
      end: { line: loc.end.line, column: loc.end.column + 1 },
    };
  }
}

/** Mirrors the grammar of zamn's own parser, but keeps the source layout. */
export class Builder {
  private i = 0;
  /** End offset of the last token consumed that is not a line break. */
  private end = 0;

  constructor(
    private readonly src: string,
    private readonly toks: Token[],
  ) {}

  private token(): Token {
    return this.toks[Math.min(this.i, this.toks.length - 1)]!;
  }

  peek(): TokenType {
    return this.toks[this.i]?.type ?? "Eos";
  }

  private next(): Token {
    const t = this.token();
    this.i++;
    if (t.type !== "Newline" && t.type !== "Eos") this.end = t.range[1];
    return t;
  }

  private accept(type: TokenType): Token | null {
    return this.peek() === type ? this.next() : null;
  }

  private expect(type: TokenType): Token {
    return this.accept(type) ?? this.unexpected();
  }

  unexpected(): never {
    const t = this.token();
    throw new ZamnSyntaxError(`Unexpected ${t.type}`, t.loc);
  }

  /** Sibling statements up to the end of the enclosing block. */
  items(): Statement[] {
    const nodes: Statement[] = [];
    for (;;) {
      const type = this.peek();
      if (BLOCK_END.has(type)) return nodes;
      if (type === "Newline") {
        this.next();
        continue;
      }
      const node = this.statement();
      const prev = nodes.at(-1);
      if (prev) {
        const between = this.src.slice(prev.end, node.start);
        node.sameLine = !between.includes("\n");
        // More than one line break since the previous sibling: a blank line.
        node.blankBefore = between.split("\n").length > 2;
      }
      nodes.push(node);
    }
  }

  private statement(): Statement {
    const start = this.token().range[0];
    const node = this.statementBody() as Statement;
    node.start = start;
    node.end = this.end;
    node.blankBefore = false;
    node.sameLine = false;
    return node;
  }

  private statementBody(): Unplaced<Statement> {
    switch (this.peek()) {
      case "Comment":
      case "SilentComment":
      case "BlockComment":
      case "SilentBlockComment": {
        const t = this.next();
        return { type: "Comment", text: this.src.slice(...t.range) };
      }
      case "Doctype":
        return { type: "Doctype", value: this.next().value.slice("doctype".length).trim() };
      case "Eq":
        this.next();
        return { type: "Expr", expr: this.expect("Expr").value };
      case "Pipe": {
        const pipe = this.next();
        return { type: "Pipe", parts: this.pipeParts(pipe) };
      }
      case "PipeOpen":
        return { type: "PipeBlock", ...this.pipeBlock() };
      case "Tag":
      case "Id":
      case "Class":
        return this.element();
      default:
        return this.unexpected();
    }
  }

  /** The text after a `|` just consumed; none for a bare `|`. */
  private pipeParts(pipe: Token): Part[] {
    return INLINE.has(this.peek()) ? this.inline(pipe.range[1]) : [];
  }

  /** `|{ ... }`, from its `|{`. */
  private pipeBlock(): { parts: Part[]; multiline: boolean } {
    const open = this.next();
    const parts = this.inline(open.range[1]);
    const close = this.expect("PipeClose");
    const multiline = this.src.slice(open.range[1], close.range[0]).includes("\n");
    return { parts, multiline };
  }

  /**
   * Text, mustaches and `#{...}` inline elements, starting at the offset
   * `cursor`. Text is taken from the source, so escapes survive.
   */
  private inline(cursor: number): Part[] {
    const parts: Part[] = [];
    for (;;) {
      const type = this.peek();
      if (type === "Text" || type === "TextNewline" || type === "Mustache") {
        this.next();
        continue;
      }
      if (type !== "InterpStart") break;
      const open = this.next();
      if (open.range[0] > cursor) parts.push(this.src.slice(cursor, open.range[0]));
      const statement = BLOCK_END.has(this.peek()) ? null : this.statement();
      const close = this.expect("InterpEnd");
      const written = this.src.slice(open.range[0], close.range[1]);
      parts.push({ statement, verbatim: written.includes("\n") ? written : null });
      cursor = close.range[1];
    }
    if (this.end > cursor) parts.push(this.src.slice(cursor, this.end));
    return parts;
  }

  private element(): Unplaced<Element> {
    const head: Element["head"] = [];
    for (;;) {
      const type = this.peek();
      if (type === "Tag" || type === "Id" || type === "Class") {
        head.push(this.next().value);
      } else if (type === "AttrsOpen") {
        const group = this.attrs();
        if (group.attrs.length) head.push(group);
      } else {
        break;
      }
    }
    const headEnd = this.end;
    return { type: "Element", head, body: this.body(headEnd) };
  }

  private body(headEnd: number): Body {
    switch (this.peek()) {
      case "Colon":
        this.next();
        return { kind: "expansion", child: this.statement() };
      case "Eq":
        this.next();
        return { kind: "expr", expr: this.expect("Expr").value };
      case "BraceOpen": {
        this.next();
        const children = this.items();
        this.expect("BraceClose");
        return { kind: "braced", children };
      }
      case "Text":
      case "Mustache":
      case "InterpStart":
        return { kind: "text", parts: this.inline(headEnd) };
      case "RawStart": {
        const open = this.next();
        while (this.peek() !== "RawEnd") {
          if (this.peek() === "Eos") this.unexpected();
          this.next();
        }
        const close = this.next();
        // The lines between the head and the closing line, as written.
        const from = this.src.indexOf("\n", open.range[0]) + 1;
        const to = this.src.lastIndexOf("\n", close.range[0]);
        const lines = from > 0 && to >= from ? this.src.slice(from, to).split("\n") : [];
        return { kind: "raw", lines, close: close.value };
      }
      default:
        return { kind: "none" };
    }
  }

  /**
   * A `(...)` group: its attributes, and whether it is written on more than
   * one line. A line break inside a value does not count.
   */
  private attrs(): AttrGroup {
    const first = this.i;
    this.next();
    const attrs: Attr[] = [];
    while (this.peek() === "AttrName") {
      const attr: Attr = { name: this.next().value, eq: null, value: null };
      if (this.peek() === "AttrEq" || this.peek() === "AttrEqRaw") {
        attr.eq = this.next().value;
        attr.value = this.expect("AttrValue").value;
      }
      attrs.push(attr);
    }
    this.expect("AttrsClose");
    let wrapped = false;
    for (let i = first + 1; i < this.i && !wrapped; i++) {
      wrapped = this.src.slice(this.toks[i - 1]!.range[1], this.toks[i]!.range[0]).includes("\n");
    }
    return { attrs, wrapped };
  }
}
