// Node / Bun entry point: the WASM module is loaded synchronously.
import { createRequire } from "node:module";
import { makeApi } from "./api.js";

const wasm = createRequire(import.meta.url)("./pkg/node/zamn_wasm.js");

export { ZamnError } from "./api.js";
export const { lex, parse, compile } = makeApi(wasm);
