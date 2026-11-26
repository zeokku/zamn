// The homepage's tagline is the one source of zamn's main paragraph; the
// READMEs repeat it word for word (see .vitepress/tagline.ts).
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { tagline, taglineMarkdown } from "../.vitepress/tagline";

const root = resolve(import.meta.dir, "../..");
const read = async (path: string) => (await Bun.file(resolve(root, path)).text()).replace(/\r\n/g, "\n");
const paragraph = taglineMarkdown(tagline(await read("docs/index.md")));

for (const readme of ["README.md", "packages/zamn/README.md"]) {
  test(`${readme} has the homepage's tagline`, async () => {
    expect((await read(readme)).split("\n")).toContain(paragraph);
  });
}
