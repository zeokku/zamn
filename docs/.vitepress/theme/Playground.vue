<script setup lang="ts">
// Compiles zamn in the browser with the WebAssembly build of the `zamn`
// package. The module is imported on mount, so it never runs during SSR.
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { formatHtml } from "./format";

type Api = typeof import("zamn");
interface Problem {
  code: string;
  severity: "error" | "warning";
  message: string;
  hint?: string;
  loc: { start: { line: number; column: number } };
}

const presets: Record<string, string> = {
  "Vue component": `.card(:class="{ active: isActive }") {
  h2.title= item.title
  p(v-if="item.body")= item.body
  ul.tags {
    li(v-for="tag in item.tags" :key="tag")= tag
  }
  MyButton(@click="select(item)" :disabled="busy") Select
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
  each item in items
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
    loadError.value = String(error);
  }
});

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

function onKeydown(event: KeyboardEvent) {
  // Tab indents instead of leaving the editor.
  if (event.key !== "Tab") return;
  event.preventDefault();
  const el = event.target as HTMLTextAreaElement;
  const { selectionStart: start, selectionEnd: end } = el;
  source.value = source.value.slice(0, start) + "  " + source.value.slice(end);
  requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
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
        <textarea
          v-model="source"
          spellcheck="false"
          autocapitalize="off"
          aria-label="zamn source"
          @keydown="onKeydown"
        />
      </section>
      <section>
        <header>HTML <span v-if="result.html">{{ sizes.html }} characters</span></header>
        <p v-if="loadError" class="problem">Could not load the compiler: {{ loadError }}</p>
        <p v-else-if="!api" class="muted">Loading the compiler…</p>
        <template v-else>
          <ul v-if="result.problems.length" class="problems">
            <li v-for="(p, i) in result.problems" :key="i" :class="p.severity === 'warning' ? 'warning' : 'problem'">
              <strong>{{ p.loc.start.line }}:{{ p.loc.start.column + 1 }}</strong>
              <code>{{ p.code }}</code>
              {{ p.message }}
              <div v-if="p.hint" class="hint">{{ p.hint }}</div>
            </li>
          </ul>
          <pre v-if="result.html"><code>{{ shown }}</code></pre>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.playground {
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
textarea,
pre {
  flex: 1;
  min-height: 440px;
  margin: 0;
  padding: 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.65;
  background: transparent;
  color: var(--vp-c-text-1);
  border: 0;
  resize: vertical;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}
textarea:focus {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--zamn-c-soft);
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
.muted {
  padding: 16px;
  color: var(--vp-c-text-2);
}
</style>
