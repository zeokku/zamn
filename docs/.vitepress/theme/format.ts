// How the docs show compiled HTML: laid out by Prettier, the way people write
// it. zamn's own output is one line with no whitespace between tags.
import type { Options } from "prettier";

export const htmlFormat: Options = {
  parser: "html",
  printWidth: 80,
  // Lay tags out on their own lines even where that adds whitespace a browser
  // would render: this is for reading, the compiled output is what runs.
  htmlWhitespaceSensitivity: "ignore",
};

/** Formats HTML in the browser; Prettier's standalone build is loaded on first use. */
export async function formatHtml(html: string): Promise<string> {
  const [prettier, html_] = await Promise.all([import("prettier/standalone"), import("prettier/plugins/html")]);
  return (await prettier.format(html, { ...htmlFormat, plugins: [html_] })).trimEnd();
}
