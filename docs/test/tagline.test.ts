// The homepage's tagline (`hero.tagline` in docs/index.md) is the one source of
// zamn's main paragraph; the READMEs repeat it word for word, in Markdown.
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = async (path: string) => (await Bun.file(resolve(root, path)).text()).replace(/\r\n/g, "\n");

const tagline = (await read("docs/index.md")).match(/^ {2}tagline: (.+)$/m)?.[1]?.trim();
// `<code>{ }</code>` is `` `{ }` `` in Markdown.
const paragraph = tagline?.replace(/<code>(.*?)<\/code>/g, "`$1`");

test("docs/index.md has a hero tagline", () => {
  expect(paragraph).toBeString();
});

for (const readme of ["README.md", "packages/zamn/README.md"]) {
  test(`${readme} has the homepage's tagline`, async () => {
    expect((await read(readme)).split("\n")).toContain(paragraph!);
  });
}
