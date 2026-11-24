// Browser entry point: `await init()` once before calling anything else.
import init, * as wasm from "../pkg/web/zamn_wasm.js";
import { makeApi } from "./api.js";

export { ZamnError } from "./api.js";
export type * from "./types.js";
export default init;
export const { lex, parse, compile } = makeApi(wasm);
