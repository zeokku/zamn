// Node / Bun entry point: the WASM module is loaded synchronously.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { makeApi } from "./api.js";

const wasm = createRequire(import.meta.url)("./pkg/node/zamn_wasm.js");

export { ZamnError } from "./api.js";
export const { lex, parse, compile } = makeApi(wasm);

/**
 * An include resolver that reads from the file system: relative paths are
 * resolved against the including file, absolute ones against `basedir`.
 */
export function fsResolver({ basedir } = {}) {
  return (path, from) => {
    if (isAbsolute(path) && !basedir) {
      throw new Error("a base directory is required to include absolute paths");
    }
    const filename = isAbsolute(path) ? join(basedir, path) : resolvePath(dirname(from), path);
    return { filename, source: readFileSync(filename, "utf8") };
  };
}
