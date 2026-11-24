import { fileURLToPath, URL } from "node:url"

import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { compile } from "zamn"

// What Vue's compiler asks of a template preprocessor: the template in, HTML
// out through a callback.
const zamn = {
  render(
    source: string,
    options: { filename: string },
    done: (error: unknown, html?: string) => void,
  ) {
    try {
      done(null, compile(source, { filename: options.filename }).code)
    } catch (error) {
      done(error)
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        // Compiles <template lang="zamn">.
        preprocessCustomRequire: (lang) => (lang === "zamn" ? zamn : undefined),
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
