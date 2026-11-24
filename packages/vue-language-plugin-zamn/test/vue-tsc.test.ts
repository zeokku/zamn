import { expect, test } from "bun:test";
import { resolve } from "node:path";

const fixture = resolve(import.meta.dir, "fixture");

// Type checks test/fixture, whose tsconfig.json loads the built plugin.
test("vue-tsc reports type errors at their place in the zamn template", async () => {
  const result = await Bun.$`bunx vue-tsc --noEmit -p ${fixture}`.cwd(fixture).nothrow().quiet();
  const output = result.stdout.toString() + result.stderr.toString();
  const errors = [...output.matchAll(/^(\S+)\((\d+),(\d+)\): error (TS\d+)/gm)].map(
    ([, file, line, column, code]) => `${file}:${line}:${column} ${code}`,
  );
  // Nothing in Card.vue or Valid.vue. zamn's own errors in Invalid.vue are
  // template errors, which the editor shows and vue-tsc doesn't.
  expect(errors).toEqual([
    "Invalid.vue:10:9 TS2322", // :title="count": number is not a string
    "Invalid.vue:10:24 TS2322", // @select="pick": wrong parameter type
    "Invalid.vue:11:6 TS2339", // p= missing
    "Invalid.vue:12:14 TS2339", // {{ count.oops }}
    "Invalid.vue:13:3 TS2345", // Card without its required title
    "Invalid.vue:14:17 TS2322", // :count={ n: count }: an object is not a number
    "Invalid.vue:17:23 TS2339", // {{ count.nope }}, on a line with a zamn error
  ]);
  expect(output).not.toContain("[Vue]");
}, 60_000);
