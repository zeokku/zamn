// Folding ranges for zamn, from zamn's own lexer: `{ }`, `|{ }`, `#{ }`,
// `( )` and raw `script`/`style` content fold from the line they open on to
// the line before the one they close on, so the closer stays in sight; a
// `/* */` comment folds whole.
import { lex } from "zamn";
import type { TokenType } from "zamn";

export interface Fold {
  /** 0-based line where the range starts: the line of its opener. */
  start: number;
  /** 0-based last line the range hides. */
  end: number;
  comment?: true;
}

const PAIRS: Partial<Record<TokenType, TokenType>> = {
  BraceClose: "BraceOpen",
  PipeClose: "PipeOpen",
  InterpEnd: "InterpStart",
  AttrsClose: "AttrsOpen",
  RawEnd: "RawStart",
};
const OPENERS = new Set(Object.values(PAIRS));
const COMMENTS = new Set<TokenType>(["BlockComment", "SilentBlockComment"]);

/**
 * The folds of a zamn template.
 * @param firstLine the 0-based line the template starts on, in the document
 */
export function zamnFolds(source: string, firstLine = 0): Fold[] {
  const folds: Fold[] = [];
  const open: { type: TokenType; line: number }[] = [];
  const at = (line: number) => firstLine + line - 1;

  for (const token of lex(source).tokens) {
    const { type } = token;
    if (OPENERS.has(type)) {
      open.push({ type, line: token.loc.start.line });
    } else if (PAIRS[type]) {
      // A closer without its opener on top is the lexer's to report; skip it.
      if (open.at(-1)?.type !== PAIRS[type]) continue;
      const start = open.pop()!.line;
      const end = token.loc.start.line - 1;
      if (end > start) folds.push({ start: at(start), end: at(end) });
    } else if (COMMENTS.has(type)) {
      const { start, end } = token.loc;
      if (end.line > start.line) folds.push({ start: at(start.line), end: at(end.line), comment: true });
    }
  }
  // VS Code keeps one range per start line: the outer one, which comes first.
  folds.sort((a, b) => a.start - b.start || b.end - a.end);
  return folds.filter((fold, i) => i === 0 || fold.start !== folds[i - 1]!.start);
}

/** `<template lang="zamn">`, as the injection grammar finds it. */
const TEMPLATE = /<template\b(?=[^>]*\blang\s*=\s*(['"]?)zamn\b\1)[^>]*>/g;
const TEMPLATE_END = /<\/template[\s>]/g;

/** The folds inside each `<template lang="zamn">` of a Vue single-file component. */
export function vueFolds(text: string): Fold[] {
  const folds: Fold[] = [];
  for (const match of text.matchAll(TEMPLATE)) {
    const from = match.index + match[0].length;
    TEMPLATE_END.lastIndex = from;
    const to = TEMPLATE_END.exec(text)?.index ?? text.length;
    const firstLine = text.slice(0, from).split("\n").length - 1;
    folds.push(...zamnFolds(text.slice(from, to), firstLine));
  }
  return folds;
}
