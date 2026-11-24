// Shared between the Node and browser entry points: wraps the JSON-string
// functions exported by the WASM module.
import type {
  CompileOptions,
  CompileResult,
  Diagnostic,
  Root,
  SourceMap,
  Token,
  WasmModule,
} from "./types.js";

export class ZamnError extends Error {
  code: string;
  /** The errors, followed by any warnings. */
  diagnostics: Diagnostic[];
  /** The shape Vite and Rollup use to print a location. */
  id: string | undefined;
  loc: { file: string | undefined; line: number; column: number };

  constructor(diagnostics: Diagnostic[]) {
    const first = diagnostics[0]!;
    const more = diagnostics.length > 1 ? ` (and ${diagnostics.length - 1} more)` : "";
    super(`${first.message}${more}`);
    this.name = "ZamnError";
    this.code = first.code;
    this.diagnostics = diagnostics;
    this.id = first.filename;
    this.loc = { file: first.filename, line: first.loc.start.line, column: first.loc.start.column };
  }
}

export interface Api {
  /** Never throws; problems are returned as diagnostics. */
  lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[] };
  /** Never throws; problems are returned as diagnostics. */
  parse(source: string): { ast: Root; diagnostics: Diagnostic[] };
  /** Throws a `ZamnError` if the template has errors; warnings are returned. */
  compile(source: string, options?: CompileOptions): CompileResult;
}

export function makeApi(wasm: WasmModule): Api {
  return {
    lex(source) {
      return JSON.parse(wasm.lex(source));
    },

    parse(source) {
      return JSON.parse(wasm.parse(source));
    },

    compile(source, options = {}) {
      const result: { code: string; map: SourceMap | null; diagnostics: Diagnostic[] } =
        JSON.parse(wasm.compile(source, JSON.stringify(options)));
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length) {
        const warnings = result.diagnostics.filter((d) => d.severity !== "error");
        throw new ZamnError([...errors, ...warnings]);
      }
      return { code: result.code, map: result.map, warnings: result.diagnostics };
    },
  };
}
