// Packages the extension, then installs the newest .vsix in this directory.
// The VS Code CLI is the first argument, or `code-insiders` if it is on PATH, or `code`.
import { $, Glob, semver, which } from "bun";

const cli = process.argv[2] ?? (which("code-insiders") ? "code-insiders" : "code");
const root = `${import.meta.dir}/..`;

await $`bun run package`.cwd(root);

const versions = [...new Glob("zamn-vscode-*.vsix").scanSync(root)]
  .map((file) => file.slice("zamn-vscode-".length, -".vsix".length))
  .sort(semver.order);
const latest = versions.at(-1);
if (!latest) throw new Error("no zamn-vscode-*.vsix found");

// Installing over an older version does not always stick, so uninstall first.
// zamn.vscode-zamn is the id the extension had before it was published under the zeokku publisher.
await $`${cli} --uninstall-extension zamn.vscode-zamn`.nothrow();
await $`${cli} --uninstall-extension zeokku.zamn-vscode`.nothrow();
await $`${cli} --install-extension zamn-vscode-${latest}.vsix --force`.cwd(root);

// The CLI cannot reload a running window, and open windows keep the old grammars until reloaded.
console.log(
  `\nInstalled ${latest} with ${cli}. To load it, open the Extensions view in the side bar and click the reload button on zamn, or run "Developer: Reload Window".`,
);
