// The token comparison is only fair if every zamn form of a page is the same
// page: they must all compile, to the same HTML.
import { expect, test } from "bun:test";
import { Glob } from "bun";
import { resolve } from "node:path";
import { compile } from "zamn";
import { render } from "../scripts/token-stats";

const docs = resolve(import.meta.dir, "..");

for (const path of new Glob("token-corpus/*.zamn").scanSync({ cwd: docs })) {
  test(path, async () => {
    const forms = await render(await Bun.file(resolve(docs, path)).text());
    const html = forms.htmlMinified;
    for (const form of [forms.zamnFlat, forms.zamnIndent, forms.zamnFormatted]) {
      expect(compile(form, { doctype: "html" }).code).toBe(html);
    }
  });
}
