<script setup lang="ts">
// Compiles zamn in the browser with the WebAssembly build of the `zamn`
// package, in Monaco editors highlighted like the docs' code blocks. Both are
// imported on mount, so they never run during SSR.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useData } from "vitepress";
import { formatHtml } from "./format";
import { loadMonaco, themes, type Monaco } from "./monaco";

type Api = typeof import("zamn");
interface Problem {
  code: string;
  severity: "error" | "warning";
  message: string;
  hint?: string;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
}

const presets: Record<string, string> = {
  "Vue component": `.card(:class="{ active: isActive }") {
  h2.title= item.title
  p(v-if="item.body")= item.body
  ul.tags {
    li(v-for="tag in item.tags" :key="tag")= tag
  }
  my-button(@click="select(item)" :disabled="busy") Select
}`,
  Page: `doctype html
html(lang="en") {
  head {
    meta(charset="utf-8")
    title Hello
    style
      h1 > em { color: tomato }
    /style
  }
  body {
    h1 Hello, #{em world}
    p {
      | Text is escaped, so <b>tags</b> show as text,
      | while entities pass through: &rarr;
    }
    /* left out of the HTML */
    //! written as an HTML comment
    .flex.gap-2.md:w-1/2(style={fontSize: 14px}) {
      button(disabled) Off
      input(type="checkbox" checked)
    }
  }
}`,
  Whitespace: `p {
  b this
  |
  | is
  |
  u cool
}
pre: |{
  keeps its
    relative indentation
}`,
  Errors: `ul {
  li An open { brace
  p Hello {{ name
}
a(href=base + "/docs") Docs
p Some text
  b bold
script
  go()`,
};

const source = ref(presets["Vue component"]!);
const formatted = ref(true);
const api = shallowRef<Api | null>(null);
const loadError = ref("");

const { isDark } = useData();
const sourceEl = ref<HTMLElement>();
const outputEl = ref<HTMLElement>();
const monaco = shallowRef<Monaco | null>(null);
let sourceEditor: ReturnType<Monaco["editor"]["create"]> | undefined;
let outputEditor: ReturnType<Monaco["editor"]["create"]> | undefined;
// Hovers and other widgets go here: the panes' `backdrop-filter` and
// `overflow: hidden` would clip them, even as `position: fixed`.
let widgets: HTMLElement | undefined;

onMounted(async () => {
  const hash = location.hash.slice(1);
  if (hash.startsWith("src=")) {
    try {
      source.value = decodeURIComponent(escape(atob(hash.slice(4))));
    } catch {}
  }
  if (location.hash.includes("&raw=1")) formatted.value = false;
  try {
    const mod = await import("zamn");
    await (mod as unknown as { default: () => Promise<unknown> }).default();
    api.value = mod;
  } catch (error) {
    loadError.value = `Could not load the compiler: ${error}`;
  }
  try {
    await mountEditors();
  } catch (error) {
    loadError.value ||= `Could not load the editor: ${error}`;
  }
});

onBeforeUnmount(() => {
  sourceEditor?.getModel()?.dispose();
  sourceEditor?.dispose();
  outputEditor?.dispose();
  widgets?.remove();
});

async function mountEditors() {
  const m = await loadMonaco();
  widgets = document.createElement("div");
  // Monaco styles its widgets under `.monaco-editor`.
  widgets.className = "monaco-editor zamn-monaco-widgets";
  document.body.append(widgets);
  const options = {
    theme: isDark.value ? themes.dark : themes.light,
    automaticLayout: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--vp-font-family-mono"),
    fontSize: 13,
    lineHeight: 21,
    tabSize: 2,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    overviewRulerLanes: 0,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: "none" as const,
    // No language service: suggestions would only repeat words.
    quickSuggestions: false,
    wordBasedSuggestions: "off" as const,
    fixedOverflowWidgets: true,
    overflowWidgetsDomNode: widgets,
  };
  sourceEditor = m.editor.create(sourceEl.value!, {
    ...options,
    model: m.editor.createModel(source.value, "zamn"),
    ariaLabel: "zamn source",
  });
  sourceEditor.onDidChangeModelContent(() => {
    source.value = sourceEditor!.getValue();
  });
  outputEditor = m.editor.create(outputEl.value!, {
    ...options,
    language: "html",
    value: shown.value,
    readOnly: true,
    domReadOnly: true,
    ariaLabel: "HTML output",
  });
  // Monaco measures the font when it starts; measure again once it has loaded.
  document.fonts.ready.then(() => m.editor.remeasureFonts());
  monaco.value = m;
}

// What the panes wait for, until the compiler and the editor have both loaded.
const loading = computed(() =>
  loadError.value ? "" : !api.value ? "Loading the compiler…" : !monaco.value ? "Loading the editor…" : "",
);

// A preset or a shared link replaces the source: show it in the editor.
watch(source, (value) => {
  if (sourceEditor && sourceEditor.getValue() !== value) sourceEditor.setValue(value);
});
watch(isDark, (dark) => monaco.value?.editor.setTheme(dark ? themes.dark : themes.light));

// Errors leave no HTML to show; warnings are listed above it.
const result = computed(() => {
  if (!api.value) return { html: "", problems: [] as Problem[] };
  try {
    const { code, warnings } = api.value.compile(source.value, { filename: "playground.zamn" });
    return { html: code, problems: warnings as Problem[] };
  } catch (error) {
    return { html: "", problems: ((error as { diagnostics?: Problem[] }).diagnostics ?? []) as Problem[] };
  }
});

// The HTML as shown: laid out by Prettier unless "Formatted" is off. Only the
// latest run may write, so a slow format never overwrites a newer one.
const shown = ref("");
let run = 0;
watch(
  [() => result.value.html, formatted],
  async ([html, pretty]) => {
    const mine = ++run;
    let out = html;
    if (pretty && html) {
      try {
        out = await formatHtml(html);
      } catch {
        // Prettier can't read it: show the compiler's output as it is.
      }
    }
    if (mine === run) shown.value = out;
  },
  { immediate: true },
);

watch([shown, monaco], ([html]) => {
  if (outputEditor && outputEditor.getValue() !== html) outputEditor.setValue(html);
});

// Errors and warnings as squiggles in the source, with the hint on hover.
watch([() => result.value.problems, monaco], ([problems, m]) => {
  const model = sourceEditor?.getModel();
  if (!m || !model) return;
  m.editor.setModelMarkers(
    model,
    "zamn",
    problems.map((p) => {
      const { start, end } = p.loc;
      const empty = start.line === end.line && start.column === end.column;
      return {
        severity: p.severity === "error" ? m.MarkerSeverity.Error : m.MarkerSeverity.Warning,
        code: p.code,
        message: p.hint ? `${p.message}\n${p.hint}` : p.message,
        startLineNumber: start.line,
        startColumn: start.column + 1,
        endLineNumber: end.line,
        endColumn: end.column + (empty ? 2 : 1),
      };
    }),
  );
});

// Keep the source in the URL, so a playground can be shared by its link.
watch([source, formatted], () => {
  const encoded = btoa(unescape(encodeURIComponent(source.value)));
  const flags = formatted.value ? "" : "&raw=1";
  history.replaceState(null, "", `#src=${encoded}${flags}`);
});

const copied = ref(false);
async function share() {
  await navigator.clipboard.writeText(location.href);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

const sizes = computed(() => ({ zamn: source.value.length, html: result.value.html.length }));
</script>

<template>
  <div class="playground">
    <div class="toolbar">
      <label>
        Example
        <select @change="source = presets[($event.target as HTMLSelectElement).value]!">
          <option v-for="(_, name) in presets" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label title="Lay the HTML out with Prettier. The compiler writes it on one line.">
        <input v-model="formatted" type="checkbox" />
        Formatted
      </label>
      <button type="button" @click="share">{{ copied ? "Link copied" : "Copy link" }}</button>
    </div>
    <div class="panes">
      <section>
        <header>zamn <span>{{ sizes.zamn }} characters</span></header>
        <div ref="sourceEl" class="editor" />
        <div v-if="!monaco && !loadError" class="loading" role="status">
          <span class="spinner" aria-hidden="true" />
          Loading the editor…
        </div>
      </section>
      <section>
        <header>HTML <span v-if="result.html">{{ sizes.html }} characters</span></header>
        <p v-if="loadError" class="problem load-error">{{ loadError }}</p>
        <div v-else-if="loading" class="loading" role="status">
          <span class="spinner" aria-hidden="true" />
          {{ loading }}
        </div>
        <template v-else>
          <ul v-if="result.problems.length" class="problems">
            <li v-for="(p, i) in result.problems" :key="i" :class="p.severity === 'warning' ? 'warning' : 'problem'">
              <strong>{{ p.loc.start.line }}:{{ p.loc.start.column + 1 }}</strong>
              <code>{{ p.code }}</code>
              {{ p.message }}
              <div v-if="p.hint" class="hint">{{ p.hint }}</div>
            </li>
          </ul>
        </template>
        <!-- Always in the page, so Monaco has somewhere to mount; hidden when there is no HTML. -->
        <div v-show="api && result.html" ref="outputEl" class="editor" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.playground {
  --pane-header: 42px;
  margin-top: 20px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
}
.toolbar label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar select,
.toolbar button {
  border: 1px solid var(--zamn-glass-border);
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--zamn-glass);
  backdrop-filter: var(--zamn-blur);
  box-shadow: var(--zamn-glass-shadow);
  color: var(--vp-c-text-1);
  transition: border-color 0.2s;
}
.toolbar select:hover,
.toolbar button:hover {
  border-color: var(--zamn-c-accent);
}
.toolbar input[type="checkbox"] {
  accent-color: var(--zamn-c-accent);
}
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 760px) {
  .panes {
    grid-template-columns: 1fr;
  }
}
section {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--zamn-glass-border);
  border-radius: var(--zamn-radius);
  background: var(--zamn-glass);
  backdrop-filter: var(--zamn-blur);
  box-shadow: var(--zamn-glass-shadow);
}
header {
  /* Fixed, so the loading overlay can start right below it. */
  height: var(--pane-header);
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--zamn-glass-edge);
}
header span {
  font-weight: 400;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.editor {
  flex: 1;
  min-height: 440px;
}
section:focus-within {
  box-shadow:
    var(--zamn-glass-shadow),
    inset 0 0 0 2px var(--zamn-c-soft);
}
.problems {
  margin: 0;
  padding: 16px 16px 16px 32px;
  font-size: 14px;
}
.problems li + li {
  margin-top: 8px;
}
.problem {
  color: var(--vp-c-danger-1);
}
.problem code {
  margin: 0 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--vp-c-danger-soft);
}
.warning {
  color: var(--vp-c-warning-1);
}
.warning code {
  margin: 0 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--vp-c-warning-soft);
}
.hint {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.load-error {
  padding: 16px;
}
/* Over the pane, below its header, until the compiler and the editor load. */
.loading {
  position: absolute;
  inset: var(--pane-header) 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--zamn-c-soft);
  border-top-color: var(--zamn-c-accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }
}
</style>
