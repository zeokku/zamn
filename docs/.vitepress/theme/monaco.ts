// Monaco for the playground, highlighted by Shiki with the grammars of the VS
// Code extension, the same ones the docs' code blocks use (see config.mts).
// Only the editor and the contributions a playground needs are loaded:
// `monaco-editor`'s main entry would bring every language and its workers.
import type { ThemeRegistration } from "shiki/core";

export type Monaco = typeof import("monaco-editor/editor/editor.api");

export const themes = { light: "zamn-light", dark: "zamn-dark" } as const;

let loading: Promise<Monaco> | undefined;

/** Loads Monaco and Shiki once; call it in the browser only. */
export function loadMonaco(): Promise<Monaco> {
  return (loading ??= load());
}

async function load(): Promise<Monaco> {
  const [monaco, { default: EditorWorker }, { createHighlighterCore }, { createOnigurumaEngine }, { shikiToMonaco }] =
    await Promise.all([
      import("monaco-editor/editor/editor.api"),
      import("monaco-editor/editor/editor.worker?worker"),
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
      import("@shikijs/monaco"),
      // Editor features: `monaco-editor/features/register.all` lists them all.
      import("monaco-editor/features/codicon/register"),
      import("monaco-editor/features/bracketMatching/register"),
      import("monaco-editor/features/clipboard/register"),
      import("monaco-editor/features/comment/register"),
      import("monaco-editor/features/contextmenu/register"),
      import("monaco-editor/features/cursorUndo/register"),
      import("monaco-editor/features/find/register"),
      import("monaco-editor/features/folding/register"),
      import("monaco-editor/features/gotoError/register"),
      import("monaco-editor/features/hover/register"),
      import("monaco-editor/features/indentation/register"),
      import("monaco-editor/features/linesOperations/register"),
      import("monaco-editor/features/multicursor/register"),
      import("monaco-editor/features/wordHighlighter/register"),
      import("monaco-editor/features/wordOperations/register"),
    ]);

  // The editor's own worker (diffs, word ranges). No language has one here.
  (self as { MonacoEnvironment?: object }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

  const [zamnGrammar, languageConfiguration, light, dark] = await Promise.all([
    import("../../../packages/vscode-zamn/syntaxes/zamn.tmLanguage.json"),
    import("../../../packages/vscode-zamn/language-configuration.json"),
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ]);

  const highlighter = await createHighlighterCore({
    engine: createOnigurumaEngine(import("shiki/wasm")),
    // The languages zamn embeds come first, as in config.mts.
    langs: [
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/html.mjs"),
      { ...zamnGrammar.default, name: "zamn", embeddedLangs: ["typescript", "javascript", "css"] } as never,
    ],
    themes: [glass(light.default, themes.light), glass(dark.default, themes.dark)],
  });

  // shikiToMonaco only tokenizes languages Monaco already knows.
  monaco.languages.register({ id: "zamn", extensions: [".zamn"] });
  monaco.languages.register({ id: "html", extensions: [".html"] });
  monaco.languages.setLanguageConfiguration("zamn", languageConfiguration.default as never);
  shikiToMonaco(highlighter, monaco as never);
  return monaco;
}

/** The GitHub themes VitePress uses, with a clear background for the glass panes. */
function glass(theme: ThemeRegistration, name: string): ThemeRegistration {
  const clear = "#00000000";
  return {
    ...theme,
    name,
    colors: {
      ...theme.colors,
      "editor.background": clear,
      "editorGutter.background": clear,
      "editorStickyScroll.background": clear,
      "minimap.background": clear,
    },
  };
}
