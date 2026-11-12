import type { Parser, Printer, SupportLanguage } from "prettier";

export const languages: SupportLanguage[];
export const parsers: { zamn: Parser };
export const printers: { zamn: Printer };

declare const plugin: {
  languages: typeof languages;
  parsers: typeof parsers;
  printers: typeof printers;
};
export default plugin;
