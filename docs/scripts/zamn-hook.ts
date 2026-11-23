// Claude Code PostToolUse hook for the zamnHook arm of chat-stats.ts. After
// Claude writes or edits a `.zamn` or `.vue` file, it checks the file with
// `zamn --validate`. A valid file gets no output, so Claude reads nothing; for
// one with errors it prints them and exits with 2, which Claude Code passes on
// to Claude after the tool's result.
import { relative } from "node:path";

const input = await Bun.stdin.json();
const file: unknown = input.tool_input?.file_path;
if (typeof file !== "string" || !/\.(zamn|vue)$/.test(file)) process.exit(0);

const cwd: string = input.cwd ?? process.cwd();
const zamn = Bun.which("zamn");
if (!zamn) {
  console.error("zamn-hook: `zamn` is not on PATH");
  process.exit(1);
}
// Errors name the file as Claude wrote it, relative to the project.
const path = relative(cwd, file).startsWith("..") ? file : relative(cwd, file);
const check = Bun.spawnSync([zamn, "--validate", path], { cwd });
if (check.exitCode === 0) process.exit(0);
process.stderr.write(`${check.stdout.toString()}${check.stderr.toString()}`);
process.exit(2);
