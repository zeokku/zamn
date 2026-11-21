// Has Claude write the corpus pages as HTML and as zamn, and records what it
// cost in tokens, thinking included. Writes docs/data/generation-stats.json and
// the tables the token-savings page includes.
//
//   bun run docs:generate [--arms html,zamn,zamnTerse,htmlChat,zamnChat]
//                         [--repeats 3] [--budget 10] [--parallel 6] [--pages landing,article]
//
// It runs the `claude` CLI (Claude Code) in print mode, so it uses whatever
// Claude Code is logged in with, a subscription included. Each conversation
// starts in an empty temporary directory: no CLAUDE.md, no project settings, no
// MCP servers, and only the Skill tool. The zamn arms have the skill installed
// there and load it themselves; the HTML arms have nothing. Claude answers in
// one go, and the script then checks the code: zamn must compile, HTML must
// parse.
//
// Arms:
//   html, zamn      one page per conversation
//   zamnTerse       the same, with the skill's "write readable zamn" step
//                   replaced by the "write the tersest form" it used to have
//   htmlChat, zamnChat  every page in turn in one conversation
//
// Runs of the arms not named in --arms are kept from the previous run.
// --budget stops starting new conversations once the cost Claude Code reports
// (an API list-price estimate, also on a subscription) reaches that many dollars.
import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import { $, Glob } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as prettier from "prettier";
import { compile, ZamnError } from "zamn";

const MODEL = "claude-opus-5-5";
const docs = resolve(import.meta.dir, "..");
const out = resolve(docs, "data/generation-stats.json");

export const arms = {
  html: { label: "HTML", lang: "html", skill: null, chat: false },
  zamn: { label: "zamn, with the skill", lang: "zamn", skill: "readable", chat: false },
  zamnTerse: { label: "zamn, skill asking for the tersest form", lang: "zamn", skill: "terse", chat: false },
  htmlChat: { label: "HTML, one chat", lang: "html", skill: null, chat: true },
  zamnChat: { label: "zamn, with the skill, one chat", lang: "zamn", skill: "readable", chat: true },
} as const;
export type Arm = keyof typeof arms;

const { values: args } = parseArgs({
  options: {
    arms: { type: "string", default: Object.keys(arms).join(",") },
    repeats: { type: "string", default: "3" },
    budget: { type: "string", default: "10" },
    parallel: { type: "string", default: "6" },
    pages: { type: "string" },
  },
});

/** One page written by Claude. */
export interface Turn {
  page: string;
  /** Everything the model read for this page, cached or not. */
  input: number;
  output: number;
  /** Part of `output`. */
  thinking: number;
  /** The code in the answer, in o200k_base tokens, as in the static counts. */
  codeTokens: number | null;
  /** zamn compiles, or HTML parses. */
  valid: boolean;
  errors: string[];
  code: string | null;
}

/** One conversation: one page, or every page in turn for the chat arms. */
export interface Conversation {
  arm: Arm;
  repeat: number;
  skillLoaded: boolean;
  costUsd: number;
  turns: Turn[];
}

export interface GenerationStats {
  generated: string;
  model: string;
  claudeCode: string;
  conversations: Conversation[];
}

/** The skill's first workflow step before it asked for readable zamn. */
const TERSE_STEP = `1. Write the tersest form: every element with children in \`{ }\`, no
   indentation, no optional spaces, attributes on the tag's line. Leave quotes
   off values that don't need them, following the quoting rule above
   (\`href=/docs\`, \`:class={ active: on }\`, but \`@click="save()"\`). Text blocks
   (\`tag.\`) and multi-line attribute values keep their indentation. A block
   whose children allow it may close on its line (\`a(href="/"){img(src="/a.svg")}\`);
   that saves about 1%, so don't rewrite text to make blocks fit.

   \`\`\`zamn
   ul.nav {
   li: a(href=/) Home
   li {
   a(href=/docs :class={ active: onDocs }) Docs
   span.badge= count
   }
   }
   \`\`\`

`;

async function skillText(kind: "terse" | "readable") {
  const skill = await Bun.file(resolve(docs, "../skills/zamn/SKILL.md")).text();
  if (kind === "readable") return skill;
  const start = skill.indexOf("1. Write readable zamn");
  const end = skill.indexOf("2. Compile");
  if (start < 0 || end < 0) throw new Error("SKILL.md: workflow step 1 not found");
  return skill.slice(0, start) + TERSE_STEP + skill.slice(end);
}

const prompt = (task: string, lang: "html" | "zamn") =>
  `${task.trim()}\n\nWrite it in ${lang === "html" ? "HTML" : "zamn"}. Reply with only the code, in one code block, without a <template> wrapper.`;

/** The first fenced block of the answer, without a `<template>` wrapper. */
function extract(answer: string): string | null {
  const block = answer.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (!block) return null;
  const lines = block[1].split("\n");
  if (/^\s*<template[\s>]/.test(lines[0]) && /^\s*<\/template>\s*$/.test(lines.at(-1)!)) {
    return lines.slice(1, -1).join("\n");
  }
  return block[1];
}

async function check(code: string, lang: "html" | "zamn"): Promise<string[]> {
  if (lang === "zamn") {
    try {
      compile(code, { doctype: "html" });
      return [];
    } catch (error) {
      if (error instanceof ZamnError) return error.diagnostics.map((d) => d.code);
      throw error;
    }
  }
  try {
    await prettier.format(code, { parser: "html" });
    return [];
  } catch (error) {
    return [(error as Error).message.split("\n")[0]];
  }
}

/** Runs one conversation: each page's prompt in turn, as one chat. */
async function converse(arm: Arm, repeat: number, pages: { name: string; task: string }[]): Promise<Conversation> {
  const { lang, skill } = arms[arm];
  const dir = await mkdtemp(join(tmpdir(), "zamn-generate-"));
  try {
    await $`git init -q`.cwd(dir);
    if (skill) await Bun.write(join(dir, ".claude/skills/zamn/SKILL.md"), await skillText(skill));
    const proc = Bun.spawn(
      ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
        "--model", MODEL, "--tools", "Skill", "--setting-sources", "project", "--strict-mcp-config",
        "--no-session-persistence", "--max-budget-usd", String(pages.length)],
      { cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    // One prompt at a time: prompts that arrive while Claude is busy are
    // merged into one turn.
    const send = (i: number) => {
      if (i < pages.length) {
        proc.stdin.write(
          JSON.stringify({ type: "user", message: { role: "user", content: prompt(pages[i].task, lang) } }) + "\n",
        );
        proc.stdin.flush();
      } else proc.stdin.end();
    };
    send(0);
    const messages: any[] = [];
    let buffer = "";
    for await (const chunk of proc.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        messages.push(message);
        if (message.type === "result") send(messages.filter((m) => m.type === "result").length);
      }
    }
    if ((await proc.exited) !== 0) throw new Error(`${arm}: claude failed: ${await new Response(proc.stderr).text()}`);
    const results = messages.filter((m) => m.type === "result");
    if (results.length !== pages.length) throw new Error(`${arm}: ${results.length} answers for ${pages.length} pages`);

    // Usage in each result is the total so far; a turn is the difference.
    const totals = results.map((r) => {
      const u = r.modelUsage?.[MODEL];
      if (!u) throw new Error(`${arm}: no usage for ${MODEL}`);
      return {
        input: u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens,
        output: u.outputTokens,
        thinking: u.thinkingTokens ?? 0,
      };
    });
    const turns: Turn[] = [];
    for (const [i, r] of results.entries()) {
      const before = totals[i - 1] ?? { input: 0, output: 0, thinking: 0 };
      const code = extract(r.result ?? "");
      const errors = code === null ? ["NO_CODE_BLOCK"] : await check(code, lang);
      turns.push({
        page: pages[i].name,
        input: totals[i].input - before.input,
        output: totals[i].output - before.output,
        thinking: totals[i].thinking - before.thinking,
        codeTokens: code === null ? null : countO200k(code),
        valid: errors.length === 0,
        errors,
        code,
      });
    }
    return {
      arm,
      repeat,
      skillLoaded: messages.some(
        (m) =>
          m.type === "assistant" &&
          m.message.content.some((c: any) => c.type === "tool_use" && c.name === "Skill" && c.input?.skill === "zamn"),
      ),
      costUsd: results.at(-1).total_cost_usd,
      turns,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const only = args.pages?.split(",");
  const pages = await Promise.all(
    [...new Glob("token-corpus/*.task.txt").scanSync({ cwd: docs })]
      .sort()
      .map((path) => ({ name: basename(path, ".task.txt"), path }))
      .filter((p) => !only || only.includes(p.name))
      .map(async (p) => ({ name: p.name, task: await Bun.file(resolve(docs, p.path)).text() })),
  );
  const chosen = args.arms.split(",") as Arm[];
  for (const arm of chosen) if (!(arm in arms)) throw new Error(`unknown arm ${arm}`);
  const repeats = Number(args.repeats);
  const budget = Number(args.budget);

  // Repeat by repeat, so a run cut short by the budget still has every page
  // and arm the same number of times.
  const queue = Array.from({ length: repeats }, (_, i) =>
    chosen.flatMap((arm) =>
      arms[arm].chat
        ? [{ arm, repeat: i + 1, pages }]
        : pages.map((page) => ({ arm, repeat: i + 1, pages: [page] })),
    ),
  ).flat();
  const expected = queue.length / repeats;

  const previous: GenerationStats | null = await Bun.file(out).json().catch(() => null);
  const kept = (previous?.conversations ?? []).filter((c) => c.arm in arms && !chosen.includes(c.arm));
  const claudeCode = (await $`claude --version`.text()).trim();
  const done: Conversation[] = [];
  let spent = 0;
  // Written after every conversation, so a stopped run keeps what it has. Only
  // complete repeats are kept, so the arms are averaged over the same runs.
  const save = async () => {
    const complete = done.filter((c) => done.filter((d) => d.repeat === c.repeat).length === expected);
    // The rest is kept aside, not lost, if the run stops early.
    const partial = done.filter((c) => !complete.includes(c));
    const partialFile = out.replace(/\.json$/, ".partial.json");
    if (partial.length) await Bun.write(partialFile, JSON.stringify(partial, null, 2) + "\n");
    else await rm(partialFile, { force: true });
    const order = (c: Conversation) => `${c.arm} ${c.repeat} ${c.turns[0].page}`;
    const stats: GenerationStats = {
      generated: new Date().toLocaleDateString("sv"),
      model: MODEL,
      claudeCode,
      conversations: [...kept, ...complete].sort((a, b) => order(a).localeCompare(order(b))),
    };
    await Bun.write(out, JSON.stringify(stats, null, 2) + "\n");
    await Bun.write(resolve(docs, "data/generation-summary.md"), summaryTable(stats));
    return complete.length;
  };

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (spent >= budget) {
        console.warn(`budget of $${budget} reached ($${spent.toFixed(2)}), not starting more runs`);
        queue.length = 0;
        return;
      }
      const c = await converse(next.arm, next.repeat, next.pages).catch((error: Error) => {
        console.error(`#${next.repeat} ${next.arm}: ${error.message}`);
        return null;
      });
      if (!c) continue;
      spent += c.costUsd;
      done.push(c);
      for (const t of c.turns) {
        console.log(
          `#${c.repeat} ${c.arm} ${t.page}: out ${t.output} (thinking ${t.thinking}), in ${t.input}, ` +
            `code ${t.codeTokens}, ${t.valid ? "valid" : t.errors.join(" ")}`,
        );
      }
      console.log(`  $${c.costUsd.toFixed(3)} (total $${spent.toFixed(2)})`);
      await save();
    }
  };
  await Promise.all(Array.from({ length: Number(args.parallel) }, worker));
  console.log(`wrote ${out} (${await save()} new conversations) and the table next to it`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const num = (v: number) => (Number.isNaN(v) ? "—" : Math.round(v).toLocaleString("en-US"));
const change = (a: number, b: number) => {
  if (!b || Number.isNaN(a) || Number.isNaN(b)) return "—";
  const pct = Math.round((a / b - 1) * 100);
  return pct === 0 ? "±0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
};

/** Per arm: each page's mean over the repeats, summed over the pages. */
export function summaryTable(stats: GenerationStats): string {
  const present = (Object.keys(arms) as Arm[]).filter((a) => stats.conversations.some((c) => c.arm === a));
  if (!present.length) return "\nNot measured yet: run `bun run docs:generate`.\n";
  const turns = (arm: Arm) => stats.conversations.filter((c) => c.arm === arm).flatMap((c) => c.turns);
  const pages = [...new Set(stats.conversations.flatMap((c) => c.turns.map((t) => t.page)))];
  const total = (arm: Arm, f: (t: Turn) => number) =>
    pages.reduce((n, page) => n + mean(turns(arm).filter((t) => t.page === page).map(f)), 0);
  const rows: [string, (t: Turn) => number][] = [
    ["Output, all", (t) => t.output],
    ["of which thinking", (t) => t.thinking],
    ["of which the code (o200k_base)", (t) => t.codeTokens ?? 0],
    ["Input read, cached or not", (t) => t.input],
  ];
  const count = (arm: Arm, f: (c: Conversation) => number, of: (c: Conversation) => number) => {
    const cs = stats.conversations.filter((c) => c.arm === arm);
    return `${cs.reduce((n, c) => n + f(c), 0)} of ${cs.reduce((n, c) => n + of(c), 0)}`;
  };
  const repeats = Math.max(...present.map((a) => new Set(stats.conversations.filter((c) => c.arm === a).map((c) => c.repeat)).size));
  const line = (label: string, cells: string[]) => `| ${label} | ${cells.join(" | ")} |`;
  return [
    "<!-- Written by docs/scripts/generation-stats.ts. Do not edit. -->",
    "",
    line("All pages", present.map((a) => arms[a].label)),
    `|---|${present.map(() => "--:").join("|")}|`,
    ...rows.map(([label, f]) => line(label, present.map((a) => num(total(a, f))))),
    line("Valid code", present.map((a) => count(a, (c) => c.turns.filter((t) => t.valid).length, (c) => c.turns.length))),
    line("Skill loaded", present.map((a) => (arms[a].skill ? count(a, (c) => +c.skillLoaded, () => 1) : ""))),
    "",
    `${pages.length} pages, up to ${repeats} runs of each, ${stats.model} through Claude Code ${stats.claudeCode.split(" ")[0]}, ${stats.generated}. Tokens are each page's mean, summed over the pages.`,
    "",
  ].join("\n");
}

if (import.meta.main) await main();
