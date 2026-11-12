import type { Parser, Printer, SupportLanguage, SupportOption } from "prettier";

export const languages: SupportLanguage[];
export const options: { zamnAttributeSeparator: SupportOption };
export const parsers: { zamn: Parser };
export const printers: { zamn: Printer };

declare const plugin: {
  languages: typeof languages;
  options: typeof options;
  parsers: typeof parsers;
  printers: typeof printers;
};
export default plugin;

declare module "prettier" {
  interface Options {
    /** What to put between the attributes of a tag. Defaults to `"space"`. */
    zamnAttributeSeparator?: "space" | "comma";
  }
}
