// Differential test against real pug: every fixture in tests/fixtures/pug must
// compile to exactly the HTML pug produces.
//
//   bun scripts/pug-parity.ts            check
//   bun scripts/pug-parity.ts --write    also (re)write the expected .html files
//   bun scripts/pug-parity.ts --survey <dir>   try every .pug file in <dir>
import { Glob } from "bun";
import { resolve } from "node:path";
import pug from "pug";

const root = resolve(import.meta.dir, "..");
const bin = resolve(root, "target/debug/zamn");
const args = process.argv.slice(2);
const survey = args.indexOf("--survey");
const dir = survey >= 0 ? resolve(args[survey + 1]!) : resolve(root, "tests/fixtures/pug");
const write = args.includes("--write");

await Bun.$`cargo build -q -p zamn`.cwd(root);

let failed = 0;
const files = [...new Glob("*.pug").scanSync(dir)].sort();
for (const name of files) {
  const file = resolve(dir, name);
  const source = await Bun.file(file).text();
  let expected: string;
  try {
    expected = pug.render(source, { filename: file });
  } catch (e) {
    if (survey < 0) {
      failed++;
      console.log(`FAIL ${name}: pug itself fails: ${(e as Error).message.split("\n")[0]}`);
    }
    continue;
  }
  const run = await Bun.$`${bin} ${file}`.nothrow().quiet();
  // The CLI prints a trailing newline after the HTML.
  const actual = run.stdout.toString().replace(/\n$/, "");
  if (run.exitCode !== 0) {
    if (survey >= 0) continue;
    failed++;
    console.log(`FAIL ${name}: zamn reports errors\n${run.stderr}`);
  } else if (actual !== expected) {
    failed++;
    console.log(`DIFF ${name}\n  pug:  ${JSON.stringify(expected)}\n  zamn: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
    if (write) await Bun.write(file.replace(/\.pug$/, ".html"), expected);
  }
}
console.log(failed ? `\n${failed} of ${files.length} differ` : `\nall ${files.length} match pug`);
process.exit(failed && survey < 0 ? 1 : 0);
