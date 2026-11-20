<script setup lang="ts">
// Compiles zamn in the browser with the WebAssembly build of the `zamn`
// package. The module is imported on mount, so it never runs during SSR.
import { computed, onMounted, ref, shallowRef, watch } from "vue";

type Api = typeof import("zamn");
interface Problem {
  code: string;
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
html(lang="en")
  head
    meta(charset="utf-8")
    title Hello
  body
    h1 Hello, #[em world]
    p
      | Text is not escaped, so
      |
      b HTML
      |
      | works too.`,
  Whitespace: `p {
  b this
  |
  | is
  |
  u cool
}`,
  Errors: `ul
  each item in items
    li= item
a(href=base + "/docs") Docs
p.5`,
};

const source = ref(presets["Vue component"]!);
const terse = ref(true);
const api = shallowRef<Api | null>(null);
const loadError = ref("");

onMounted(async () => {
  const hash = location.hash.slice(1);
  if (hash.startsWith("src=")) {
    try {
      source.value = decodeURIComponent(escape(atob(hash.slice(4))));
    } catch {}
  }
  if (location.hash.includes("&doctype=0")) terse.value = false;
  try {
    const mod = await import("zamn");
    await (mod as unknown as { default: () => Promise<unknown> }).default();
    api.value = mod;
  } catch (error) {
    loadError.value = String(error);
  }
});

const result = computed(() => {
  if (!api.value) return { html: "", problems: [] as Problem[] };
  try {
    const { code } = api.value.compile(source.value, {
      filename: "playground.zamn",
      doctype: terse.value ? "html" : undefined,
    });
    return { html: code, problems: [] as Problem[] };
  } catch (error) {
    return { html: "", problems: ((error as { diagnostics?: Problem[] }).diagnostics ?? []) as Problem[] };
  }
});

// Keep the source in the URL, so a playground can be shared by its link.
watch([source, terse], () => {
  const encoded = btoa(unescape(encodeURIComponent(source.value)));
  history.replaceState(null, "", `#src=${encoded}${terse.value ? "" : "&doctype=0"}`);
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
      <label title="Write boolean attributes and void elements the HTML way, as Vue templates need">
        <input v-model="terse" type="checkbox" />
        <code>doctype: "html"</code>
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
        <ul v-else-if="result.problems.length" class="problems">
          <li v-for="(p, i) in result.problems" :key="i" class="problem">
            <strong>{{ p.loc.start.line }}:{{ p.loc.start.column + 1 }}</strong>
            <code>{{ p.code }}</code>
            {{ p.message }}
            <div v-if="p.hint" class="hint">{{ p.hint }}</div>
          </li>
        </ul>
        <pre v-else><code>{{ result.html }}</code></pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.playground {
  margin-top: 16px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
}
.toolbar select,
.toolbar button {
  border: 1px solid var(--vp-c-divider);
  padding: 4px 10px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.toolbar button:hover {
  border-color: var(--vp-c-brand-1);
}
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 760px) {
  .panes {
    grid-template-columns: 1fr;
  }
}
section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-top: 3px solid var(--zamn-c-accent);
}
header {
  display: flex;
  justify-content: space-between;
  padding: 6px 12px;
  font-family: var(--zamn-font-display);
  font-weight: 700;
  text-transform: uppercase;
  background: var(--vp-c-bg-alt);
}
header span {
  font-family: var(--vp-font-family-base);
  font-weight: 400;
  text-transform: none;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
textarea,
pre {
  flex: 1;
  min-height: 420px;
  margin: 0;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border: 0;
  resize: vertical;
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 2;
}
textarea:focus {
  outline: 2px solid var(--zamn-c-accent);
  outline-offset: -2px;
}
.problems {
  margin: 0;
  padding: 12px 12px 12px 28px;
  font-size: 14px;
}
.problem {
  color: var(--vp-c-danger-1);
}
.hint {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.muted {
  padding: 12px;
  color: var(--vp-c-text-2);
}
</style>
