import { describe, expect, test } from "bun:test";
import { type Package, type Workspace, problems, readWorkspace } from "./release.ts";

const pkg = (registry: Package["registry"], name: string, version: string): Package => ({
  registry,
  name,
  version,
  manifest: `${name}/manifest`,
});

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  packages: [
    pkg("npm", "zamn", "1.0.3"),
    pkg("npm", "prettier-plugin-zamn", "1.0.0"),
    pkg("crates", "zamn_lexer", "1.0.2"),
    pkg("crates", "zamn", "1.0.0"),
    pkg("vscode", "zeokku.zamn-vscode", "1.0.7"),
  ],
  cargoRequirements: [
    { name: "zamn_lexer", requirement: "~1.0.1" },
    { name: "zamn", requirement: "~1.0.0" },
  ],
  npmDependencies: [{ from: "prettier-plugin-zamn", name: "zamn", range: "workspace:~" }],
  ...overrides,
});

describe("problems", () => {
  test("patches drift, one major.minor", () => {
    expect(problems(workspace())).toEqual([]);
  });

  test("a package on another minor", () => {
    const w = workspace();
    w.packages.push(pkg("npm", "eslint-plugin-vue-zamn", "1.1.0"));
    expect(problems(w)).toEqual([
      "the packages don't share one major.minor (1.0: zamn, prettier-plugin-zamn, zamn_lexer, zamn, zeokku.zamn-vscode; 1.1: eslint-plugin-vue-zamn)",
    ]);
  });

  test("a version that is not major.minor.patch", () => {
    expect(problems(workspace({ packages: [pkg("crates", "zamn", "(inherited from the workspace)")] }))).toEqual([
      "zamn/manifest: zamn has the version (inherited from the workspace), not major.minor.patch",
    ]);
  });

  test("a pre-release keeps its minor", () => {
    const w = workspace();
    w.packages.push(pkg("npm", "eslint-plugin-vue-zamn", "1.0.1-beta.1"));
    expect(problems(w)).toEqual([]);
  });

  test("a Cargo requirement ahead of the crate, on another minor, or not a tilde", () => {
    const w = workspace({
      cargoRequirements: [
        { name: "zamn_lexer", requirement: "~1.0.3" },
        { name: "zamn", requirement: "~1.1.0" },
        { name: "zamn_lexer", requirement: "1.0.0" },
      ],
    });
    expect(problems(w)).toEqual([
      'Cargo.toml: zamn_lexer requires "~1.0.3", but the crate is 1.0.2',
      'Cargo.toml: zamn requires "~1.1.0", but the crate is 1.0.0',
      'Cargo.toml: zamn_lexer = { version = "1.0.0" } should be "~major.minor.patch"',
    ]);
  });

  test("an npm dependency that is not workspace:~", () => {
    const w = workspace({ npmDependencies: [{ from: "prettier-plugin-zamn", name: "zamn", range: "workspace:*" }] });
    expect(problems(w)).toEqual([
      'prettier-plugin-zamn depends on zamn as "workspace:*"; use "workspace:~", which is packed as ~<its version>',
    ]);
  });
});

test("the repository keeps the rules", async () => {
  const w = await readWorkspace();
  expect(problems(w)).toEqual([]);
  expect(w.packages.map((p) => `${p.registry} ${p.name}`)).toEqual([
    "npm eslint-plugin-vue-zamn",
    "npm prettier-plugin-zamn",
    "npm vue-eslint-parser-template-tokenizer-zamn",
    "npm vue-language-plugin-zamn",
    "npm zamn",
    "crates zamn",
    "crates zamn_codegen",
    "crates zamn_lexer",
    "crates zamn_parser",
    "vscode zeokku.zamn-vscode",
  ]);
});
