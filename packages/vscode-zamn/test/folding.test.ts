import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { vueFolds, zamnFolds, type Fold } from "../src/folding.ts";
import { zamn } from "../../../tests/zamn.ts";

const root = resolve(import.meta.dir, "..");

/** Each fold as `start-end`, 0-based lines, with `comment` for comments. */
const show = (folds: Fold[]) => folds.map((f) => `${f.start}-${f.end}${f.comment ? " comment" : ""}`);

test("blocks, attributes, text blocks, raw content and comments fold; the closing line stays", () => {
  const source = zamn`
    div {
      img(
        alt="a"
      )
      pre: |{
        x
      }
      /* a
      b */
      script
        go()
      /script
      p #{a(
        href="/"
      ) x}
    }
  `;
  expect(show(zamnFolds(source))).toEqual([
    "0-14", // div { ... }
    "1-2", // img( ... )
    "4-5", // |{ ... }
    "7-8 comment", // /* ... */
    "9-10", // script ... /script
    "12-13", // #{a( ... ) x}: the `(`; `#{` starts on the same line
  ]);
});

test("a block that opens and closes on adjacent lines, or on one, does not fold", () => {
  const source = zamn`
    ul { li a }
    p {
    }
    div { p {
      b x
    } }
  `;
  // `div {` and `p {` start on the same line: the outer one is kept
  expect(show(zamnFolds(source))).toEqual(["3-4"]);
});

test("braces in text, strings and mustaches are not blocks", () => {
  const source = zamn`
    p(title="{") {{ a }} \{
    p x
    | \}
  `;
  expect(zamnFolds(source)).toEqual([]);
});

test("in a Vue file, only <template lang=\"zamn\"> folds, at its lines in the file", () => {
  const source = zamn`
    <script setup lang="ts">
    const a = {
      b: 1,
    }
    </script>

    <template lang="zamn">
    header {
      p x
    }
    </template>

    <template>
      <div>
        <p>x</p>
      </div>
    </template>
  `;
  expect(show(vueFolds(source))).toEqual(["7-8"]);
});

test("the packaged extension loads, without paths of this machine in it", async () => {
  await Bun.$`bun scripts/build.ts`.cwd(root).quiet();
  const bundle = await Bun.file(resolve(root, "dist/extension.js")).text();
  expect(bundle).not.toContain(resolve(root, "../.."));

  // VS Code's API, as far as the extension uses it.
  const script = `
    const Module = require("node:module");
    const load = Module._load;
    const providers = {};
    Module._load = function (request, ...rest) {
      if (request !== "vscode") return load.call(this, request, ...rest);
      return {
        languages: { registerFoldingRangeProvider: ({ language }, p) => ((providers[language] = p), {}) },
        FoldingRange: class { constructor(start, end, kind) { Object.assign(this, { start, end, kind }); } },
        FoldingRangeKind: { Comment: 1 },
      };
    };
    require("./dist/extension.js").activate({ subscriptions: [] });
    const text = "div {\\n  p x\\n}\\n";
    console.log(JSON.stringify(Object.keys(providers).sort()));
    console.log(JSON.stringify(providers.zamn.provideFoldingRanges({ getText: () => text })));
  `;
  const out = await Bun.$`node -e ${script}`.cwd(root).text();
  expect(out.trim().split("\n")).toEqual(['["vue","zamn"]', '[{"start":0,"end":1}]']);
});
