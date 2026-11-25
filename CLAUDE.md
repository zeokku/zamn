@README.md

## Tooling

The Rust workspace uses cargo. Everything JavaScript uses Bun, not Node.js:

- `bun <file>`, `bun install`, `bun run <script>`, `bunx <package>` instead of
  `node`/`ts-node`, `npm`/`yarn`/`pnpm`, `npx`
- `bun test` instead of `jest` or `vitest`
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa

## Testing

- `bun run test` runs everything: cargo tests, then both package test suites.
- The package tests run against the built WASM, so run `bun run build` after
  changing Rust code and before `bun test`.
- In TypeScript tests, write multi-line zamn templates with the `zamn` tag from
  `tests/zamn.ts`, not `"\n"`-joined strings.
- `tests/fixtures/pug` holds pug's own test cases, committed and kept for the coming pug converter; nothing uses them yet. The gitignored `/pug/` at the repository root is a local clone of pug, not part of the repository.

## Commits

Generate commit message after a feature is implemented.

## Agent rules

`skills/zamn/SKILL.md` is the source: Claude Code comes first. Change it first, then carry the change into `agents/zamn.md`, the same rules for other agents and tools. `docs/test/agent-rules.test.ts` checks that the rules (up to the end of the "Syntax" section) are the same in both.
