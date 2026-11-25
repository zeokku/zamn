// How the docs show compiled HTML: laid out by Prettier, the way people write
// it. zamn's own output is one line with no whitespace between tags.
import type { Options } from "prettier";

export const htmlFormat: Options = {
  parser: "html",
  printWidth: 80,
  // Lay tags out on their own lines even where that adds whitespace a browser
  // would render: this is for reading, the compiled output is what runs.
  htmlWhitespaceSensitivity: "ignore",
  // Script and style content, and `style` values, are shown as zamn wrote
  // them: only re-indented, not reformatted.
  embeddedLanguageFormatting: "off",
};

// A void element's start tag, its quoted attribute values skipped whole.
const voidTag =
  /<(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b(?:"[^"]*"|'[^']*'|[^"'>])*?\s*\/>/gi;

/** Prettier writes `<br />`; zamn writes HTML5, `<br>`, and so do the docs. */
export function html5(formatted: string): string {
  return formatted.replace(voidTag, (tag) => tag.replace(/\s*\/>$/, ">"));
}

/** Formats HTML in the browser; Prettier's standalone build is loaded on first use. */
export async function formatHtml(html: string): Promise<string> {
  const [prettier, html_] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/html")]);
  return html5((await prettier.format(html, { ...htmlFormat, plugins: [html_] })).trimEnd());
}
