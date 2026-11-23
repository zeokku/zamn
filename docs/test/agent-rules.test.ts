// skills/zamn/SKILL.md is the source of the rules; agents/zamn.md carries the
// same rules for agents other than Claude Code. From the opening sentence to
// the end of the "Not available" table, the two must say the same thing.
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

/** The text from "zamn compiles to HTML." up to the next heading after "Not available". */
async function rules(path: string) {
  const text = (await Bun.file(resolve(root, path)).text()).replace(/\r\n/g, "\n");
  const start = text.indexOf("zamn compiles to HTML.");
  const table = text.indexOf("## Not available");
  const end = text.indexOf("\n## ", table + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(table).toBeGreaterThan(start);
  return text.slice(start, end < 0 ? undefined : end);
}

test("agents/zamn.md has the skill's rules", async () => {
  expect(await rules("agents/zamn.md")).toBe(await rules("skills/zamn/SKILL.md"));
});
