// Prettier plugin for zamn.
import type {
  ChoiceSupportOption,
  IntSupportOption,
  Parser,
  Plugin,
  Printer,
  SupportLanguage,
  SupportOptions,
} from "prettier";
import { lex, parse as check } from "zamn";
import { print, type Options } from "./print.js";
import { Builder, ZamnSyntaxError, type Root } from "./tree.js";

export type { Root } from "./tree.js";

function parse(text: string): Root {
  // Formatting a template with errors could silently drop the parts the
  // lexer skipped, so refuse instead. Warnings are fine: formatting fixes
  // misleading indentation, the only one.
  const error = check(text).diagnostics.find((d) => d.severity === "error");
  if (error) {
    throw new ZamnSyntaxError(error.hint ? `${error.message}. ${error.hint}` : error.message, error.loc);
  }
  const builder = new Builder(text, lex(text).tokens);
  const nodes = builder.items();
  if (builder.peek() !== "Eos") builder.unexpected();
  return { type: "Root", nodes, start: 0, end: text.length };
}

export const languages: SupportLanguage[] = [
  {
    name: "zamn",
    parsers: ["zamn"],
    extensions: [".zamn"],
    vscodeLanguageIds: ["zamn"],
  },
];

/**
 * `exception` is not in Prettier's types, but Prettier reads it: a value it
 * accepts skips the check of the option's type (see NOTES.md).
 */
const zamnMaxAttributesPerLine: IntSupportOption & { exception: (value: unknown) => boolean } = {
  category: "zamn",
  type: "int",
  default: 3,
  range: { start: -1, end: Infinity, step: 1 },
  // `false` is not an integer.
  exception: (value) => value === false,
  description:
    "How many attributes a tag may have on its line before they go one per line. " +
    "0: always one per line. -1: as written. false: always on the line of the tag.",
};

const zamnAttributeSeparator: ChoiceSupportOption<"space" | "comma"> = {
  category: "zamn",
  type: "choice",
  default: "space",
  description: "What to put between the attributes of a tag.",
  choices: [
    { value: "space", description: 'A space: a(href="/" target="_blank")' },
    { value: "comma", description: 'A comma and a space: a(href="/", target="_blank")' },
  ],
};

export const options = { zamnMaxAttributesPerLine, zamnAttributeSeparator } satisfies SupportOptions;

export const parsers: { zamn: Parser<Root> } = {
  zamn: {
    parse,
    astFormat: "zamn",
    locStart: (node) => node.start,
    locEnd: (node) => node.end,
  },
};

export const printers: { zamn: Printer<Root> } = {
  zamn: { print: (path, options) => print(path, options as Options) },
};

const plugin: Plugin<Root> = { languages, options, parsers, printers };
export default plugin;

declare module "prettier" {
  interface Options {
    /**
     * How many attributes a tag may have on its line. With more, or when the
     * line would be wider than `printWidth`, they go one per line. `0` always
     * puts them one per line, `-1` keeps them as they are written, and `false`
     * always keeps them on the line of the tag. Defaults to `3`.
     */
    zamnMaxAttributesPerLine?: number | false;
    /** What to put between the attributes of a tag. Defaults to `"space"`. */
    zamnAttributeSeparator?: "space" | "comma";
  }
}
