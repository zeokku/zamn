// Bundles the extension into dist/extension.js, with zamn's API in it, and
// copies zamn's WebAssembly bindings next to it.
//
// zamn's Node entry loads the bindings with `createRequire(import.meta.url)`,
// and the bindings read their `.wasm` from `__dirname`; the bundler turns
// both into paths on this machine. So the bindings stay out of the bundle,
// which requires them from beside itself.
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dist = resolve(root, "dist");
const bindings = resolve(dirname(Bun.resolveSync("zamn/package.json", root)), "pkg/node");

await Bun.$`rm -rf ${dist}`;
const result = await Bun.build({
  entrypoints: [resolve(root, "src/extension.ts")],
  outdir: dist,
  target: "node",
  format: "cjs",
  external: ["vscode"],
  plugins: [
    {
      name: "zamn-bindings",
      setup(build) {
        build.onResolve({ filter: /^\.\/zamn_wasm\.js$/ }, ({ path }) => ({ path, external: true }));
        build.onLoad({ filter: /[\\/]zamn[\\/]dist[\\/]index\.js$/ }, async ({ path }) => {
          const source = await Bun.file(path).text();
          const contents = source.replace(
            'createRequire(import.meta.url)("../pkg/node/zamn_wasm.js")',
            'require("./zamn_wasm.js")',
          );
          if (contents === source) throw new Error(`zamn's entry no longer loads its bindings as expected: ${path}`);
          return { contents, loader: "js" };
        });
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "build failed");
for (const file of ["zamn_wasm.js", "zamn_wasm_bg.wasm"]) {
  await Bun.write(resolve(dist, file), Bun.file(resolve(bindings, file)));
}
console.log("built", dist);
