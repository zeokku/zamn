# Releasing

## Versions

Every published package (five on npm, four crates, the VS Code extension) has the same major.minor; the patch is each package's own.

- **A fix** to one package bumps its patch only: `prettier-plugin-zamn` 1.0.0 → 1.0.1, and nothing else changes.
- **A minor** (1.1.0) or **major** (2.0.0) moves every package to `x.y.0` at once, whether it changed or not.

`bun run release:plan` prints every package, its version and whether it is new; it fails, naming them, when the packages don't share one major.minor. The workflows run it first.

Dependencies follow the same rule:

- npm: the packages depend on each other as `workspace:~`, which Bun packs as `~<version>` (`"zamn": "~1.0.3"`): any later patch, never another minor. They always name the version in the repository when packed.
- Cargo: `[workspace.dependencies]` in `Cargo.toml` requires each crate as `~1.0.0`, any patch of 1.0. When a crate starts to need a patch of another (`zamn` uses something new in `zamn_lexer` 1.0.2), raise the requirement to `~1.0.2` and bump the crate that needs it too.

## How a release goes out

Publishing a GitHub Release runs all three workflows. Each publishes only what is new: the packages whose version in the repository is not on their registry yet. The rest are left alone, so a release can carry one patch or the whole ecosystem.

| What | Workflow | Goes public when |
|---|---|---|
| npm packages | [npm-publish.yml](.github/workflows/npm-publish.yml) | you approve each staged version on npmjs.com |
| crates (`zamn_wasm` is not published) | [crates-publish.yml](.github/workflows/crates-publish.yml) | you approve the run's `crates-io` deployment |
| the VS Code extension, `zeokku.zamn-vscode` | [vscode-publish.yml](.github/workflows/vscode-publish.yml) | the run finishes |

A workflow with nothing new skips its build, and the crates one asks for no approval. The release tag is only a name: say what is in it, `v1.1.0` for a minor, `prettier-plugin-zamn@1.0.1` for a patch, `zamn@1.0.2, zamn-vscode@1.0.4` for several.

None of the workflows holds a token: npm, crates.io and the Marketplace each trust the workflow file through OIDC.

## Every release

1. Bump the versions: `version` in the `package.json` of each npm package and of the extension (`packages/vscode-zamn`), in the `Cargo.toml` of each crate, and the requirements in `[workspace.dependencies]` when they must rise (see above).
2. Run `bun install` and `cargo check`, so `bun.lock` and `Cargo.lock` follow: CI installs with `--frozen-lockfile`, and `cargo publish` refuses a changed `Cargo.lock`.
3. `bun run release:plan` shows what will go out. Commit and push.
4. GitHub → Releases → Draft a new release → a new tag on `main` → Publish. Or `gh release create prettier-plugin-zamn@1.0.1 --target main --generate-notes`.
5. npm: when the run is done, approve the staged versions on npmjs.com, `zamn` first when it is among them, since the others depend on it. From a terminal: `npm stage list`, then `npm stage approve <stage-id>`.
6. crates.io: the run tests and waits. Open it under Actions → Review deployments → `crates-io` → Approve and deploy.

Approve or reject what is staged on npm before the next release: a staged version doesn't count as published, so the next run tries to stage it again and fails.

A version with a pre-release part (`1.0.1-beta.1`) is staged under the npm tag `next` instead of `latest`. The Marketplace takes only `major.minor.patch`.

## Once, before the first release

### GitHub

1. Push the repository to `github.com/zeokku/zamn` and make it public: npm only makes provenance for a public repository, and `--provenance` fails on a private one.
2. Settings → Environments → New environment `crates-io` → Required reviewers: yourself.

### npm

Trust can only be set on a package that exists. `zamn` does (0.0.0, from 2023); the other four do not, so the first release stages them with a token.

1. Trust for `zamn`, with the npm that has `npm stage` (`npm install -g npm@latest`; 12.2.3 now) and logged in as `zeokku`:
   ```sh
   npm trust github zamn --file npm-publish.yml --repo zeokku/zamn --allow-stage-publish
   ```
   Or on npmjs.com: zamn → Settings → Trusted publishing → GitHub Actions, owner `zeokku`, repository `zamn`, workflow `npm-publish.yml`, no environment, `npm stage publish` allowed and `npm publish` not.
2. A token for the first release: npmjs.com → Access Tokens → Generate New Token → Granular, **without** "Bypass two-factor authentication", Packages and scopes: Read and write, All packages, expiring in 7 days. A token without bypass can only stage, so nothing is published without your approval. Add it to the repository as the secret `NPM_TOKEN`.
3. Make the first release and approve the five staged versions.
4. Trust for the other four:
   ```sh
   for p in vue-eslint-parser-template-tokenizer-zamn prettier-plugin-zamn vue-language-plugin-zamn eslint-plugin-vue-zamn; do
     npm trust github "$p" --file npm-publish.yml --repo zeokku/zamn --allow-stage-publish --yes
     sleep 2
   done
   ```
   The first one asks for 2FA; tick "skip two-factor authentication for the next 5 minutes" and the rest go through.
5. Delete the `NPM_TOKEN` secret and revoke the token.
6. On each package: Settings → Publishing access → "Require two-factor authentication and disallow tokens". Trusted publishing still works.

### crates.io

crates.io trusts only crates that exist, and the first upload needs a token. There is no staging: what is uploaded is public, and a version can be yanked but never replaced.

1. crates.io → Account Settings → API Tokens → New Token, scopes `publish-new` and `publish-update`, crates `zamn*`, a short expiry.
2. From a clean checkout of the commit the first release will point at, before you publish the release:
   ```sh
   cargo login            # paste the token
   cargo publish --workspace
   cargo logout
   ```
   Then revoke the token. The release then finds the crates published and leaves them alone.
3. For each of `zamn`, `zamn_lexer`, `zamn_parser`, `zamn_codegen`: the crate's Settings → Trusted Publishing → Add → GitHub, owner `zeokku`, repository `zamn`, workflow `crates-publish.yml`, environment `crates-io`.

### VS Code Marketplace

Already done: the publisher `zeokku` trusts `vscode-publish.yml` in `zeokku/zamn`. The extension id is `zeokku.zamn-vscode`: the id is `publisher.name` from `package.json`, and the name cannot be `zamn`, since Bun's workspaces refuse a second package named `zamn`. The first publish creates the extension on the Marketplace.

## When a run fails

Fix the cause, then re-run the failed jobs: what went out is published now and is skipped.

- **npm.** What was staged stays staged, and a version cannot be staged twice: reject it (`npm stage reject <stage-id>`) before the re-run, or approve it if it is good.
- **crates.io.** `cargo publish` stops at the first crate that fails; the ones before it are public. A broken version can be yanked (`cargo yank --version 1.0.1 zamn`), not replaced: bump the patch.
- **Marketplace.** A version cannot be published twice: bump the patch.
