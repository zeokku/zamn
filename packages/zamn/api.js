// Shared between the Node and browser entry points: wraps the JSON-string
// functions exported by the WASM module.

export class ZamnError extends Error {
  constructor(diagnostics) {
    const first = diagnostics[0];
    const more = diagnostics.length > 1 ? ` (and ${diagnostics.length - 1} more)` : "";
    super(`${first.message}${more}`);
    this.name = "ZamnError";
    this.code = first.code;
    this.diagnostics = diagnostics;
    // The shape Vite and Rollup use to print a location.
    this.id = first.filename;
    this.loc = { file: first.filename, line: first.loc.start.line, column: first.loc.start.column };
  }
}

export function makeApi(wasm) {
  return {
    lex(source) {
      return JSON.parse(wasm.lex(source));
    },

    parse(source) {
      return JSON.parse(wasm.parse(source));
    },

    compile(source, options = {}) {
      const { resolve, ...rest } = options;
      const resolver =
        resolve &&
        ((path, from) => {
          try {
            const file = resolve(path, from);
            return JSON.stringify(file ?? { error: "file not found" });
          } catch (e) {
            return JSON.stringify({ error: String(e?.message ?? e) });
          }
        });
      const result = JSON.parse(wasm.compile(source, JSON.stringify(rest), resolver));
      if (result.diagnostics.length) throw new ZamnError(result.diagnostics);
      return { code: result.code, map: result.map, dependencies: result.dependencies };
    },
  };
}
