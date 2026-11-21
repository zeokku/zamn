// Measures how many tokens the pages in docs/token-corpus take as zamn and as
// HTML, and writes docs/data/token-stats.json for the docs to show.
//
//   bun run docs:tokens
//
// OpenAI counts come from gpt-tokenizer (o200k_base) and always run. Claude
// counts come from the count_tokens endpoint and need credentials the
// Anthropic SDK can find (ANTHROPIC_API_KEY, or a profile from
// `ant auth login`). Without them the Claude numbers from the previous run are
// kept for the variants whose text has not changed, and the rest are null.
import Anthropic from "@anthropic-ai/sdk";
import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import { Glob } from "bun";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import * as prettier from "prettier";
import * as zamnPrettier from "prettier-plugin-zamn";
import { compile, lex } from "zamn";

const CLAUDE_MODEL = "claude-opus-5-5";
const docs = resolve(import.meta.dir, "..");
const out = resolve(docs, "data/token-stats.json");

/** The forms each page is measured in. The zamn ones compile to the same HTML. */
export const variants = {
  zamnFlat: "zamn, flat braces",
  zamnOneLine: "zamn, one-line blocks",
  zamnIndent: "zamn, 1-space indentation",
  zamnFormatted: "zamn, formatted",
  htmlMinified: "HTML, minified",
  htmlFormatted: "HTML, formatted",
} as const;
export type Variant = keyof typeof variants;

const zamn = (source: string, options: prettier.Options = {}) =>
  prettier.format(source, { parser: "zamn", plugins: [zamnPrettier], ...options });

/** Every form of one page. */
export async function render(source: string): Promise<Record<Variant, string>> {
  const terse = { zamnMaxAttributesPerLine: false, printWidth: Number.MAX_SAFE_INTEGER } as const;
  const htmlMinified = compile(source, { doctype: "html" }).code;
  return {
    // Braces around every block, and no indentation at all: a brace block's
    // base indentation is free.
    zamnFlat: await zamn(source, { ...terse, tabWidth: 0 }),
    // Flat braces, with every block that can close on its line written on one.
    zamnOneLine: oneLine(await zamn(source, { ...terse, tabWidth: 0 })),
    // No braces, one space per level.
    zamnIndent: await zamn(source, { ...terse, tabWidth: 1, zamnBlockStyle: "preserve" }),
    // What prettier-plugin-zamn prints with its default options.
    zamnFormatted: await zamn(source),
    htmlMinified,
    // HTML laid out the way people (and agents) usually write it.
    htmlFormatted: await prettier.format(htmlMinified, {
      parser: "html",
      htmlWhitespaceSensitivity: "ignore",
    }),
  };
}

type Line = string | { head: string; children: Line[] };

/**
 * Folds the blocks of the flat-braces form onto one line where zamn allows it:
 * `ul {` / `li{a x}` / `}` becomes `ul{li{a x}}`. Text and `= expr` run to the
 * closing `}`, so a block folds only if every child but the last ends in `}`
 * or `/`. The input must have no text blocks (`p.`) or values that span lines.
 */
export function oneLine(flat: string): string {
  const lines = flat.replace(/\n$/, "").split("\n");
  const opens = new Set<number>();
  for (const token of lex(flat).tokens) {
    if (token.type === "BraceOpen") opens.add(token.loc.start.line - 1);
  }
  const root: Line[] = [];
  const stack = [root];
  lines.forEach((line, i) => {
    if (line === "}") stack.pop();
    else if (opens.has(i)) {
      const block = { head: line.slice(0, -1).trimEnd(), children: [] };
      stack.at(-1)!.push(block);
      stack.push(block.children);
    } else stack.at(-1)!.push(line);
  });
  const print = (line: Line): string[] => {
    if (typeof line === "string") return [line];
    const children = line.children.map(print);
    const folded = children.every((c) => c.length === 1) ? children.map((c) => c[0]) : null;
    if (folded && folded.slice(0, -1).every((c) => /[}/]$/.test(c))) {
      return [`${line.head}{${folded.join(" ")}}`];
    }
    return [`${line.head} {`, ...children.flat(), "}"];
  };
  return root.flatMap(print).join("\n") + "\n";
}

interface Count {
  chars: number;
  openai: number;
  claude: number | null;
  sha: string;
}
interface Stats {
  generated: string;
  tokenizers: { openai: string; claude: string | null };
  files: { name: string; counts: Record<Variant, Count> }[];
  totals: Record<Variant, { chars: number; openai: number; claude: number | null }>;
}

async function claudeCounter() {
  try {
    const client = new Anthropic();
    const raw = async (text: string) =>
      (await client.messages.countTokens({ model: CLAUDE_MODEL, messages: [{ role: "user", content: text }] }))
        .input_tokens;
    // A message carries a few tokens of its own. "a" is one token, so the
    // rest of its count is that overhead.
    const overhead = (await raw("a")) - 1;
    return async (text: string) => (await raw(text)) - overhead;
  } catch (error) {
    console.warn(`Claude counts skipped: ${(error as Error).message}`);
    return null;
  }
}

async function main() {
  const previous: Stats | null = await Bun.file(out)
    .json()
    .catch(() => null);
  const kept = new Map<string, number>();
  for (const file of previous?.files ?? []) {
    for (const count of Object.values(file.counts)) {
      if (count.claude !== null) kept.set(count.sha, count.claude);
    }
  }

  const claude = await claudeCounter();
  const paths = [...new Glob("token-corpus/*.zamn").scanSync({ cwd: docs })].sort();
  const files: Stats["files"] = [];
  for (const path of paths) {
    const forms = await render(await Bun.file(resolve(docs, path)).text());
    const counts = {} as Record<Variant, Count>;
    for (const [variant, text] of Object.entries(forms) as [Variant, string][]) {
      const sha = createHash("sha256").update(text).digest("hex").slice(0, 16);
      counts[variant] = {
        chars: text.length,
        openai: countO200k(text),
        claude: claude ? await claude(text) : (kept.get(sha) ?? null),
        sha,
      };
    }
    files.push({ name: basename(path, ".zamn"), counts });
    console.log(`${path}: ${Object.values(counts).map((c) => c.openai).join(" / ")}`);
  }

  const totals = {} as Stats["totals"];
  for (const variant of Object.keys(variants) as Variant[]) {
    const all = files.map((f) => f.counts[variant]);
    const claudeKnown = all.every((c) => c.claude !== null);
    totals[variant] = {
      chars: all.reduce((n, c) => n + c.chars, 0),
      openai: all.reduce((n, c) => n + c.openai, 0),
      claude: claudeKnown ? all.reduce((n, c) => n + c.claude!, 0) : null,
    };
  }

  const stats: Stats = {
    generated: new Date().toLocaleDateString("sv"), // YYYY-MM-DD, local
    tokenizers: {
      openai: "o200k_base (gpt-tokenizer)",
      claude: claude || totals.htmlMinified.claude !== null ? `${CLAUDE_MODEL} (count_tokens)` : null,
    },
    files,
    totals,
  };
  await Bun.write(out, JSON.stringify(stats, null, 2) + "\n");
  // Markdown tables for the pages to include: they reach llms.txt and the
  // Markdown version of each page, which a Vue component would not.
  await Bun.write(resolve(docs, "data/token-summary.md"), summaryTable(stats));
  await Bun.write(resolve(docs, "data/token-files.md"), filesTable(stats));
  console.log(`wrote ${out} and the tables next to it`);
}

const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));
const change = (a: number | null, b: number | null) => {
  if (a === null || b === null) return "—";
  const pct = Math.round((a / b - 1) * 100);
  return pct === 0 ? "±0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
};

function caption(stats: Stats) {
  const claude = stats.tokenizers.claude ?? "not measured yet: run the script with Anthropic credentials";
  return `\nTokens, measured ${stats.generated}. OpenAI: ${stats.tokenizers.openai}. Claude: ${claude}.\n`;
}

function summaryTable(stats: Stats) {
  const t = stats.totals;
  const rows = (Object.keys(variants) as Variant[]).map((v) =>
    [
      variants[v],
      num(t[v].openai),
      num(t[v].claude),
      `${change(t[v].openai, t.htmlFormatted.openai)} / ${change(t[v].claude, t.htmlFormatted.claude)}`,
      `${change(t[v].openai, t.htmlMinified.openai)} / ${change(t[v].claude, t.htmlMinified.claude)}`,
    ].join(" | "),
  );
  return [
    "<!-- Written by docs/scripts/token-stats.ts. Do not edit. -->",
    "",
    "| All pages | OpenAI | Claude | vs HTML, formatted (OpenAI / Claude) | vs HTML, minified (OpenAI / Claude) |",
    "|---|--:|--:|--:|--:|",
    ...rows.map((r) => `| ${r} |`),
    caption(stats),
  ].join("\n");
}

function filesTable(stats: Stats) {
  const keys = Object.keys(variants) as Variant[];
  const rows = stats.files.flatMap((f) => [
    `| \`${f.name}\` | OpenAI | ${keys.map((v) => num(f.counts[v].openai)).join(" | ")} |`,
    `| | Claude | ${keys.map((v) => num(f.counts[v].claude)).join(" | ")} |`,
  ]);
  return [
    "<!-- Written by docs/scripts/token-stats.ts. Do not edit. -->",
    "",
    `| Page | | ${keys.map((v) => variants[v]).join(" | ")} |`,
    `|---|---|${keys.map(() => "--:").join("|")}|`,
    ...rows,
    caption(stats),
  ].join("\n");
}

if (import.meta.main) await main();
