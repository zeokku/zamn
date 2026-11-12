// Builds the WASM module and its JS bindings into ./pkg.
// Needs: rustup target add wasm32-unknown-unknown
//        cargo install wasm-bindgen-cli --version 0.2.130
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const wasm = resolve(root, "target/wasm32-unknown-unknown/release/zamn_wasm.wasm");
const pkg = resolve(import.meta.dir, "pkg");

await Bun.$`cargo build --release --target wasm32-unknown-unknown -p zamn_wasm`.cwd(root);
await Bun.$`rm -rf ${pkg}`;
await Bun.$`wasm-bindgen --target nodejs --out-dir ${pkg}/node ${wasm}`;
await Bun.$`wasm-bindgen --target web --out-dir ${pkg}/web ${wasm}`;
// The Node bindings are CommonJS inside an ESM package.
await Bun.write(resolve(pkg, "node/package.json"), '{ "type": "commonjs" }\n');
console.log("built", pkg);
