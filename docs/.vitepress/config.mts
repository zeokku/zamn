import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import browserslist from "browserslist";
import { defineConfig, type DefaultTheme } from "vitepress";
import llmstxt, { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";

const repo = "https://github.com/zeokku/zamn";
const site = "https://zeokku.github.io/zamn";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(fromRoot(path), "utf8"));

// The grammars of the VS Code extension, so code blocks look like the editor.
const zamnGrammar = {
  ...json("packages/vscode-zamn/syntaxes/zamn.tmLanguage.json"),
  name: "zamn",
  embeddedLangs: ["typescript", "javascript", "css"],
};
const zamnInVue = {
  ...json("packages/vscode-zamn/syntaxes/zamn.vue-injection.tmLanguage.json"),
  name: "zamn-vue-injection",
  injectTo: ["text.html.vue"],
  embeddedLangs: ["zamn"],
};

// Browsers the CSS is built for. Vite gives Lightning CSS, its CSS minifier,
// targets from `build.cssTarget` only, in esbuild's format. Without targets,
// VitePress's `backdrop-filter` came out as `-webkit-backdrop-filter` alone,
// which Chromium ignores: no glass. See
// https://github.com/parcel-bundler/lightningcss/issues/826. (Our own CSS
// writes no `-webkit-backdrop-filter`: next to `backdrop-filter` with a
// `var()` value, Lightning CSS keeps only the last of the two.)
const esbuildBrowser: Record<string, string> = {
  chrome: "chrome",
  edge: "edge",
  firefox: "firefox",
  safari: "safari",
  ios_saf: "ios",
  opera: "opera",
};
const cssTarget = browserslist("defaults").flatMap((entry) => {
  const [name, version] = entry.split(" ");
  const browser = esbuildBrowser[name!];
  return browser ? [`${browser}${version!.split("-")[0]}`] : [];
});

// Files outside docs/ served as downloads: published path -> repo path.
const downloads: Record<string, string> = {
  "downloads/zamn-agent-rules.md": "agents/zamn.md",
  "downloads/SKILL.md": "skills/zamn/SKILL.md",
};

// Serves them in dev; `buildEnd` below copies them into the build.
function downloadsPlugin() {
  return {
    name: "zamn-docs:downloads",
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: { url?: string }, res: any, next: () => void) => {
        const path = req.url?.replace(/^\/zamn\//, "").split("?")[0];
        const source = path && downloads[path];
        if (!source) return next();
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.end(readFileSync(fromRoot(source)));
      });
    },
  };
}

const guide: DefaultTheme.SidebarItem[] = [
  {
    text: "Guide",
    items: [
      { text: "Introduction", link: "/guide/introduction" },
      { text: "Getting started", link: "/guide/getting-started" },
    ],
  },
  {
    text: "Syntax",
    items: [
      { text: "Elements", link: "/guide/syntax/elements" },
      { text: "Brace blocks", link: "/guide/syntax/brace-blocks" },
      { text: "Classes and ids", link: "/guide/syntax/classes-ids" },
      { text: "Attributes", link: "/guide/syntax/attributes" },
      { text: "Text", link: "/guide/syntax/text" },
      { text: "Scripts and styles", link: "/guide/syntax/script-style" },
      { text: "Interpolation", link: "/guide/syntax/interpolation" },
      { text: "Comments", link: "/guide/syntax/comments" },
      { text: "Doctype", link: "/guide/syntax/doctypes" },
      { text: "Not supported", link: "/guide/syntax/not-supported" },
    ],
  },
];

const ecosystem: DefaultTheme.SidebarItem[] = [
  {
    text: "Ecosystem",
    items: [
      { text: "Overview", link: "/ecosystem/overview" },
      { text: "Vite and Vue", link: "/ecosystem/vite" },
      { text: "TypeScript", link: "/ecosystem/typescript" },
      { text: "ESLint", link: "/ecosystem/eslint" },
      { text: "Prettier", link: "/ecosystem/prettier" },
      { text: "VS Code", link: "/ecosystem/vscode" },
    ],
  },
];

const reference: DefaultTheme.SidebarItem[] = [
  {
    text: "Reference",
    items: [
      { text: "JavaScript API", link: "/reference/api" },
      { text: "CLI", link: "/reference/cli" },
      { text: "Diagnostics", link: "/reference/diagnostics" },
      { text: "Rust crates", link: "/reference/rust" },
    ],
  },
];

const ai: DefaultTheme.SidebarItem[] = [
  {
    text: "AI agents",
    items: [
      { text: "Writing zamn with agents", link: "/ai/" },
      { text: "Token savings", link: "/ai/token-savings" },
      { text: "Agent rules", link: "/ai/rules" },
      { text: "Claude Code skill", link: "/ai/skill" },
    ],
  },
];

export default defineConfig({
  title: "zamn",
  description: "A static way to write HTML with { } blocks instead of closing tags. Readable for people, cheap for agents.",
  base: "/zamn/",
  cleanUrls: true,
  srcExclude: ["README.md", "data/**"],
  lastUpdated: true,
  sitemap: { hostname: `${site}/` },

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "Ecosystem", link: "/ecosystem/overview", activeMatch: "/ecosystem/" },
      { text: "Reference", link: "/reference/api", activeMatch: "/reference/" },
      { text: "AI", link: "/ai/", activeMatch: "/ai/" },
      { text: "Playground", link: "/playground" },
      { text: "Blog", link: "/blog/", activeMatch: "/blog/" },
    ],
    sidebar: {
      "/guide/": guide,
      "/ecosystem/": ecosystem,
      "/reference/": reference,
      "/ai/": ai,
      // No sidebar for /blog/: posts read better without one.
    },
    socialLinks: [
      { icon: "github", link: repo },
      { icon: "discord", link: "https://zeokku.com/discord" },
    ],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: "Edit this page on GitHub" },
    search: { provider: "local" },
    outline: { level: [2, 3] },
    footer: { message: "Released under the MIT License.", copyright: '© <a href="https://zeokku.com">ZEOKKU</a>' },
  },

  markdown: {
    // Built-in languages the zamn grammars embed come first.
    languages: ["typescript", "javascript", "css", "vue", zamnGrammar, zamnInVue],
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons);
      // Inline code is full of `{{ }}`, which Vue would otherwise interpolate.
      const codeInline = md.renderer.rules.code_inline!;
      md.renderer.rules.code_inline = (...args) =>
        codeInline(...args).replace(/^<code/, "<code v-pre");
    },
  },

  buildEnd({ outDir }) {
    for (const [path, source] of Object.entries(downloads)) {
      mkdirSync(dirname(join(outDir, path)), { recursive: true });
      copyFileSync(fromRoot(source), join(outDir, path));
    }
  },

  vite: {
    plugins: [llmstxt({ domain: "https://zeokku.github.io", ignoreFiles: ["blog/index.md"] }), downloadsPlugin()],
    server: { fs: { allow: [fromRoot("")] } },
    build: { cssTarget },
  },
});
