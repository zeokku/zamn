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
- `tests/fixtures/pug` is gitignored: files deleted there cannot be restored
  from git.

## Commits

Generate commit message after a feature is implemented.
