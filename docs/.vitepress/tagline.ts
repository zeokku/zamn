// The homepage's tagline (`hero.tagline` in docs/index.md) is the one source of
// zamn's main paragraph. The site's description is made from it, and the
// READMEs repeat it word for word (test/tagline.test.ts).

/** The tagline's HTML, from the text of docs/index.md. */
export function tagline(indexMd: string): string {
  const match = indexMd.match(/^ {2}tagline: (.+)$/m);
  if (!match) throw new Error("docs/index.md has no hero tagline");
  return match[1]!.trim();
}

/** As plain text, for meta descriptions: `<code>{ }</code>` is `{ }`. */
export const taglineText = (html: string) => html.replace(/<[^>]+>/g, "");

/** As Markdown, as the READMEs write it: `<code>{ }</code>` is `` `{ }` ``. */
export const taglineMarkdown = (html: string) => html.replace(/<code>(.*?)<\/code>/g, "`$1`");
