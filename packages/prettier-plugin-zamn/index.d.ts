import type { Parser, Printer, SupportLanguage, SupportOption } from "prettier";

export const languages: SupportLanguage[];
export const options: {
  zamnBlockStyle: SupportOption;
  zamnMaxAttributesPerLine: SupportOption;
  zamnAttributeSeparator: SupportOption;
};
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
    /**
     * How to write the children of an element: always in `{ }`, or as each
     * element is written. Defaults to `"braces"`.
     */
    zamnBlockStyle?: "braces" | "preserve";
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
