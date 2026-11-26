// What a release publishes: each package whose version is not on its registry yet.
//
//   bun scripts/release.ts            every package, its version, and whether it is new
//   bun scripts/release.ts npm        the new ones, space-separated, for the workflows:
//                                     npm package directories, crate names, the extension id
//
// Every published package shares one major.minor; patches are each package's own.
// Fails, listing the problems, when the manifests break that.
import { dirname, resolve } from "node:path";

export type Registry = "npm" | "crates" | "vscode";

export interface Package {
  registry: Registry;
  name: string;
  version: string;
  manifest: string;
}

export interface Workspace {
  packages: Package[];
  /** `version` of each crate of ours in `[workspace.dependencies]`. */
  cargoRequirements: { name: string; requirement: string }[];
  /** Dependencies of published npm packages on each other. */
  npmDependencies: { from: string; name: string; range: string }[];
}

const root = resolve(import.meta.dir, "..");

export async function readWorkspace(dir = root): Promise<Workspace> {
  const packages: Package[] = [];
  const npmDependencies: Workspace["npmDependencies"] = [];
  const npm: { name: string; dependencies: Record<string, string> }[] = [];

  for (const manifest of new Bun.Glob("packages/*/package.json").scanSync(dir)) {
    const pkg = await Bun.file(resolve(dir, manifest)).json();
    if (pkg.publisher) {
      packages.push({ registry: "vscode", name: `${pkg.publisher}.${pkg.name}`, version: pkg.version, manifest });
    } else if (!pkg.private) {
      packages.push({ registry: "npm", name: pkg.name, version: pkg.version, manifest });
      npm.push({ name: pkg.name, dependencies: { ...pkg.dependencies, ...pkg.peerDependencies } });
    }
  }
  const names = new Set(npm.map((p) => p.name));
  for (const { name: from, dependencies } of npm) {
    for (const [name, range] of Object.entries(dependencies)) {
      if (names.has(name)) npmDependencies.push({ from, name, range });
    }
  }

  for (const manifest of new Bun.Glob("crates/*/Cargo.toml").scanSync(dir)) {
    const { package: crate } = Bun.TOML.parse(await Bun.file(resolve(dir, manifest)).text()) as {
      package: { name: string; version: unknown; publish?: boolean };
    };
    if (crate.publish === false) continue;
    const version = typeof crate.version === "string" ? crate.version : "(inherited from the workspace)";
    packages.push({ registry: "crates", name: crate.name, version, manifest });
  }

  const cargo = Bun.TOML.parse(await Bun.file(resolve(dir, "Cargo.toml")).text()) as {
    workspace: { dependencies: Record<string, string | { path?: string; version?: string }> };
  };
  const cargoRequirements = Object.entries(cargo.workspace.dependencies).flatMap(([name, dep]) =>
    typeof dep === "object" && dep.path ? [{ name, requirement: dep.version ?? "(none)" }] : [],
  );

  const order: Registry[] = ["npm", "crates", "vscode"];
  packages.sort((a, b) => order.indexOf(a.registry) - order.indexOf(b.registry) || a.name.localeCompare(b.name));
  return { packages, cargoRequirements, npmDependencies };
}

const semver = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

/** The rules a release keeps; an empty list when the workspace keeps them all. */
export function problems({ packages, cargoRequirements, npmDependencies }: Workspace): string[] {
  const found: string[] = [];
  const minors = new Map<string, Package[]>();
  for (const pkg of packages) {
    const m = semver.exec(pkg.version);
    if (!m) {
      found.push(`${pkg.manifest}: ${pkg.name} has the version ${pkg.version}, not major.minor.patch`);
      continue;
    }
    const minor = `${m[1]}.${m[2]}`;
    minors.set(minor, [...(minors.get(minor) ?? []), pkg]);
  }
  if (minors.size > 1) {
    const list = [...minors].map(([minor, pkgs]) => `${minor}: ${pkgs.map((p) => p.name).join(", ")}`);
    found.push(`the packages don't share one major.minor (${list.join("; ")})`);
  }

  const crates = new Map(packages.filter((p) => p.registry === "crates").map((p) => [p.name, p.version]));
  for (const { name, requirement } of cargoRequirements) {
    const ver = semver.exec(crates.get(name) ?? "");
    if (!ver) continue; // not ours, or its version is reported above
    const version = ver[0];
    const req = /^~(\d+)\.(\d+)\.(\d+)$/.exec(requirement);
    if (!req) {
      found.push(`Cargo.toml: ${name} = { version = "${requirement}" } should be "~major.minor.patch"`);
    } else if (req[1] !== ver[1] || req[2] !== ver[2] || Number(req[3]) > Number(ver[3])) {
      found.push(`Cargo.toml: ${name} requires "${requirement}", but the crate is ${version}`);
    }
  }

  for (const { from, name, range } of npmDependencies) {
    if (range !== "workspace:~") {
      found.push(`${from} depends on ${name} as "${range}"; use "workspace:~", which is packed as ~<its version>`);
    }
  }
  return found;
}

async function status(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 200 && res.status !== 404) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res;
}

/** Whether this version is already on the registry. A version staged on npm and not approved yet is not. */
export async function isPublished({ registry, name, version }: Package): Promise<boolean> {
  if (registry === "npm") {
    return (await status(`https://registry.npmjs.org/${name}/${version}`)).status === 200;
  }
  if (registry === "crates") {
    // https://doc.rust-lang.org/cargo/reference/registry-index.html#index-files
    const n = name.toLowerCase();
    const path = n.length <= 2 ? `${n.length}/${n}` : n.length === 3 ? `3/${n[0]}/${n}` : `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`;
    const res = await status(`https://index.crates.io/${path}`);
    if (res.status === 404) return false;
    return (await res.text())
      .split("\n")
      .filter(Boolean)
      .some((line) => JSON.parse(line).vers === version);
  }
  // The query vsce makes for `vsce show`: filter type 7 is the extension id, flag 1 includes versions.
  const res = await status("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { Accept: "application/json;api-version=3.0-preview.1", "Content-Type": "application/json" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: name }], pageNumber: 1, pageSize: 1 }], flags: 1 }),
  });
  const { results } = (await res.json()) as {
    results: { extensions: { publisher: { publisherName: string }; extensionName: string; versions: { version: string }[] }[] }[];
  };
  return (results[0]?.extensions ?? []).some(
    (e) =>
      `${e.publisher.publisherName}.${e.extensionName}`.toLowerCase() === name.toLowerCase() &&
      e.versions.some((v) => v.version === version),
  );
}

if (import.meta.main) {
  const registry = process.argv[2] as Registry | undefined;
  if (registry && !["npm", "crates", "vscode"].includes(registry)) {
    console.error(`usage: bun scripts/release.ts [npm|crates|vscode]`);
    process.exit(2);
  }
  const workspace = await readWorkspace();
  const found = problems(workspace);
  if (found.length) {
    for (const problem of found) console.error(`error: ${problem}`);
    process.exit(1);
  }
  const selected = workspace.packages.filter((p) => !registry || p.registry === registry);
  const published = await Promise.all(selected.map(isPublished));
  if (registry) {
    const fresh = selected.filter((_, i) => !published[i]);
    console.log(fresh.map((p) => (p.registry === "npm" ? dirname(p.manifest) : p.name)).join(" "));
  } else {
    for (const [i, p] of selected.entries()) {
      console.log(`${p.registry.padEnd(7)}${`${p.name} ${p.version}`.padEnd(52)}${published[i] ? "published" : "new"}`);
    }
  }
}
