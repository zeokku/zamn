// Node / Bun entry point: the WASM module is loaded synchronously.
import { createRequire } from "node:module";
import { makeApi } from "./api.js";
import type { WasmModule } from "./types.js";

const wasm: WasmModule = createRequire(import.meta.url)("../pkg/node/zamn_wasm.js");

export { ZamnError } from "./api.js";
export type * from "./types.js";
export const { lex, parse, compile } = makeApi(wasm);
