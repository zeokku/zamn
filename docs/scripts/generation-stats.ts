// Has Claude write and edit the corpus pages as HTML and as zamn, and records
// what it cost in tokens, thinking included. Writes docs/data/generation-stats.json and
// the tables the token-savings page includes (generation-summary.md,
// edit-summary.md).
//
//   bun run docs:generate [--arms html,zamn,zamnCli,htmlEdit,zamnEdit,...]
//                         [--repeats 3] [--budget 20] [--parallel 6] [--pages landing,article]
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
//   zamnChecklist   the skill with a short checklist to run before answering
//   zamnCli         the skill, and Bash allowed to run `zamn` and nothing else,
//                   so Claude can check its answer on stdin before replying
//   htmlChat, zamnChat  every page in turn in one conversation
//   htmlEdit, zamnEdit  edits instead of new pages: the page is in the
//                   directory (formatted HTML, or zamn as Prettier prints it),
//                   Claude gets Read and Edit, and `name.edit.txt` says what to
//                   change; zamnEditSkill also has the skill, and zamnEdit
//                   the skill and `zamn`. An edit
//                   counts as done when the page's HTML has what
//                   `name.edit.json` lists under `has`, and none of `lacks`
//
// The `zamn` the arms run is the workspace's debug build (`bun run build`).
//
// Runs of the arms not named in --arms are kept from the previous run.
// --budget stops starting new conversations once the cost Claude Code reports
// (an API list-price estimate, also on a subscription) reaches that many dollars.
import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import { $, Glob } from "bun";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import * as prettier from "prettier";
import { compile, ZamnError } from "zamn";
import { render } from "./token-stats";

const MODEL = "claude-opus-5-5";
const docs = resolve(import.meta.dir, "..");
const out = resolve(docs, "data/generation-stats.json");

type Lang = "html" | "zamn";
type Skill = "readable" | "terse" | "checklist";
interface ArmSpec {
  label: string;
  lang: Lang;
  skill: Skill | null;
  /** Every page in one conversation. */
  chat: boolean;
  /** Edit the page in the directory instead of writing a new one. */
  edit: boolean;
  /** Bash, allowed to run `zamn` only. */
  cli: boolean;
}
const arm = (label: string, lang: Lang, skill: Skill | null, more: Partial<ArmSpec> = {}): ArmSpec => ({
  label, lang, skill, chat: false, edit: false, cli: false, ...more,
});
export const arms = {
  html: arm("HTML", "html", null),
  zamn: arm("zamn, with the skill", "zamn", "readable"),
  zamnTerse: arm("zamn, skill asking for the tersest form", "zamn", "terse"),
  zamnChecklist: arm("zamn, skill with a checklist", "zamn", "checklist"),
  zamnCli: arm("zamn, with the skill and the compiler", "zamn", "readable", { cli: true }),
  htmlChat: arm("HTML, one chat", "html", null, { chat: true }),
  zamnChat: arm("zamn, with the skill, one chat", "zamn", "readable", { chat: true }),
  htmlEdit: arm("HTML", "html", null, { edit: true }),
  zamnEditSkill: arm("zamn, with the skill", "zamn", "readable", { edit: true }),
  zamnEdit: arm("zamn, with the skill and the compiler", "zamn", "readable", { edit: true, cli: true }),
} satisfies Record<string, ArmSpec>;
export type Arm = keyof typeof arms;
const spec = (a: Arm): ArmSpec => arms[a];

const { values: args } = parseArgs({
  options: {
    arms: { type: "string", default: Object.keys(arms).join(",") },
    repeats: { type: "string", default: "3" },
    budget: { type: "string", default: "20" },
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
  /** zamn compiles, or HTML parses; for an edit, also that it made every change asked for. */
  valid: boolean;
  errors: string[];
  /** The answer's code, or for an edit the file afterwards. */
  code: string | null;
  /** Times Claude ran `zamn`. */
  checks: number;
  /** Each tool call, as its name and the first line of its command or file. */
  tools?: string[];
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

/** A list of the usual mistakes, to check instead of reviewing everything. */
const CHECKLIST = `## Before you answer

Check these, the usual mistakes, and nothing else:

- every value with a space, a comma, a quote or a bracket is quoted;
- every line of text starts with \`|\`, unless it follows its tag on the tag's line;
- every \`{\` that ends a line has its \`}\` on a line of its own;
- a \`|\` line on its own wherever two lines need a space between them.

`;

async function skillText(kind: Skill) {
  const skill = await Bun.file(resolve(docs, "../skills/zamn/SKILL.md")).text();
  if (kind === "readable") return skill;
  if (kind === "checklist") {
    const at = skill.indexOf("## Workflow");
    if (at < 0) throw new Error("SKILL.md: ## Workflow not found");
    return skill.slice(0, at) + CHECKLIST + skill.slice(at);
  }
  const start = skill.indexOf("1. Write readable zamn");
  const end = skill.indexOf("2. Compile");
  if (start < 0 || end < 0) throw new Error("SKILL.md: workflow step 1 not found");
  return skill.slice(0, start) + TERSE_STEP + skill.slice(end);
}

const prompt = (task: string, lang: Lang) =>
  `${task.trim()}\n\nWrite it in ${lang === "html" ? "HTML" : "zamn"}. Reply with only the code, in one code block, without a <template> wrapper.`;

const editPrompt = (task: string, lang: Lang) =>
  `The page is in page.${lang}. ${task.trim()}\n\nEdit the file in place, then reply with one short sentence.`;

/** The page as it is before an edit: formatted HTML, or zamn as Prettier prints it. */
async function startingPage(source: string, lang: Lang) {
  const forms = await render(source);
  return lang === "html" ? forms.htmlFormatted : forms.zamnFormatted;
}

const zamnBinary = resolve(docs, "../target/debug/zamn");

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

async function check(code: string, lang: Lang): Promise<string[]> {
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

interface Page {
  name: string;
  /** What to write, or for an edit arm what to change. */
  task: string;
  /** The page in zamn, for the edit arms. */
  source: string;
  /** What the edited page's HTML must and must not contain. */
  expect: { has: string[]; lacks: string[] };
}

/** What an edit left undone, judged on the HTML, so both languages are judged alike. */
function undone(code: string, lang: Lang, expect: Page["expect"]): string[] {
  const html = lang === "zamn" ? compile(code, { doctype: "html" }).code : code;
  return [
    ...expect.has.filter((s) => !html.includes(s)).map((s) => `MISSING ${s}`),
    ...expect.lacks.filter((s) => html.includes(s)).map((s) => `LEFT ${s}`),
  ];
}

/** Runs one conversation: each page's prompt in turn, as one chat. */
async function converse(arm: Arm, repeat: number, pages: Page[]): Promise<Conversation> {
  const { lang, skill, edit, cli } = spec(arm);
  const dir = await mkdtemp(join(tmpdir(), "zamn-generate-"));
  try {
    await $`git init -q`.cwd(dir);
    if (skill) await Bun.write(join(dir, ".claude/skills/zamn/SKILL.md"), await skillText(skill));
    const file = join(dir, `page.${lang}`);
    const before = edit ? await startingPage(pages[0].source, lang) : null;
    if (before !== null) await Bun.write(file, before);
    // Only `zamn` is added to PATH, from a directory outside the working one.
    const bin = await mkdtemp(join(tmpdir(), "zamn-bin-"));
    if (cli) await symlink(zamnBinary, join(bin, "zamn"));
    const tools = ["Skill", ...(edit ? ["Read", "Edit"] : []), ...(cli ? ["Bash"] : [])];
    const allowed = [...(edit ? ["Read", "Edit"] : []), ...(cli ? ["Bash(zamn *)"] : [])];
    const proc = Bun.spawn(
      ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
        "--model", MODEL, "--tools", tools.join(","), "--setting-sources", "project", "--strict-mcp-config",
        ...(allowed.length ? ["--allowedTools", allowed.join(",")] : []), "--permission-mode", "dontAsk",
        "--no-session-persistence", "--max-budget-usd", String(pages.length)],
      {
        cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "pipe",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      },
    );
    // One prompt at a time: prompts that arrive while Claude is busy are
    // merged into one turn.
    const send = (i: number) => {
      if (i < pages.length) {
        const text = edit ? editPrompt(pages[i].task, lang) : prompt(pages[i].task, lang);
        proc.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n");
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
    await rm(bin, { recursive: true, force: true });
    const results = messages.filter((m) => m.type === "result");
    if (results.length !== pages.length) throw new Error(`${arm}: ${results.length} answers for ${pages.length} pages`);

    // The tools Claude called for each page: everything before that page's result.
    const toolUses: any[][] = pages.map(() => []);
    let turn = 0;
    for (const m of messages) {
      if (m.type === "result") turn++;
      else if (m.type === "assistant") toolUses[turn]?.push(...m.message.content.filter((c: any) => c.type === "tool_use"));
    }

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
      const previous = totals[i - 1] ?? { input: 0, output: 0, thinking: 0 };
      let code: string | null;
      let errors: string[];
      if (edit) {
        code = await Bun.file(file).text().catch(() => null);
        errors = code === null ? ["NO_FILE"] : code === before ? ["UNCHANGED"] : await check(code, lang);
        if (code !== null && !errors.length) errors = undone(code, lang, pages[i].expect);
      } else {
        code = extract(r.result ?? "");
        errors = code === null ? ["NO_CODE_BLOCK"] : await check(code, lang);
      }
      turns.push({
        page: pages[i].name,
        input: totals[i].input - previous.input,
        output: totals[i].output - previous.output,
        thinking: totals[i].thinking - previous.thinking,
        codeTokens: code === null || edit ? null : countO200k(code),
        valid: errors.length === 0,
        errors,
        code,
        checks: toolUses[i].filter((c) => c.name === "Bash" && /(^|[\s|;&(])zamn(\s|$)/m.test(c.input?.command ?? "")).length,
        tools: toolUses[i].map((c) => {
          const what = c.input?.command ?? c.input?.file_path ?? c.input?.skill ?? "";
          return `${c.name}: ${String(what).split("\n")[0].replace(dir, ".")}`.slice(0, 120);
        }),
      });
    }
    return {
      arm,
      repeat,
      skillLoaded: toolUses.flat().some((c) => c.name === "Skill" && c.input?.skill === "zamn"),
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
      .map(async (p) => {
        const text = (ext: string) => Bun.file(resolve(docs, `token-corpus/${p.name}${ext}`)).text();
        return {
          name: p.name,
          write: await text(".task.txt"),
          edit: await text(".edit.txt"),
          source: await text(".zamn"),
          expect: JSON.parse(await text(".edit.json")),
        };
      }),
  );
  const forArm = (arm: Arm) =>
    pages.map((p) => ({ name: p.name, task: spec(arm).edit ? p.edit : p.write, source: p.source, expect: p.expect }));
  const chosen = args.arms.split(",") as Arm[];
  for (const arm of chosen) if (!(arm in arms)) throw new Error(`unknown arm ${arm}`);
  if (chosen.some((a) => spec(a).cli) && !(await Bun.file(zamnBinary).exists())) {
    throw new Error(`${zamnBinary} not found: run \`bun run build\` first`);
  }
  const repeats = Number(args.repeats);
  const budget = Number(args.budget);

  // Repeat by repeat, so a run cut short by the budget still has every page
  // and arm the same number of times.
  const queue = Array.from({ length: repeats }, (_, i) =>
    chosen.flatMap((arm) =>
      spec(arm).chat
        ? [{ arm, repeat: i + 1, pages: forArm(arm) }]
        : forArm(arm).map((page) => ({ arm, repeat: i + 1, pages: [page] })),
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
    await Bun.write(resolve(docs, "data/generation-summary.md"), summaryTable(stats, false));
    await Bun.write(resolve(docs, "data/edit-summary.md"), summaryTable(stats, true));
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
            `code ${t.codeTokens}, checks ${t.checks}, ${t.valid ? "valid" : t.errors.join(" ")}`,
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

/**
 * Per arm: each page's mean over the repeats, summed over the pages. One table
 * for new pages, one for the edit arms.
 */
export function summaryTable(stats: GenerationStats, edits: boolean): string {
  const present = (Object.keys(arms) as Arm[]).filter(
    (a) => spec(a).edit === edits && stats.conversations.some((c) => c.arm === a),
  );
  if (!present.length) return `\nNot measured yet: run \`bun run docs:generate\`.\n`;
  const conversations = (arm: Arm) => stats.conversations.filter((c) => c.arm === arm);
  const turns = (arm: Arm) => conversations(arm).flatMap((c) => c.turns);
  const pages = [...new Set(present.flatMap((a) => turns(a).map((t) => t.page)))];
  const total = (arm: Arm, f: (t: Turn) => number) =>
    pages.reduce((n, page) => n + mean(turns(arm).filter((t) => t.page === page).map(f)), 0);
  const rows: [string, (t: Turn) => number][] = [
    ["Output, all", (t) => t.output],
    ["of which thinking", (t) => t.thinking],
    ...(edits ? [] : ([["of which the code (o200k_base)", (t) => t.codeTokens ?? 0]] as [string, (t: Turn) => number][])),
    ["Input read, cached or not", (t) => t.input],
  ];
  const count = (arm: Arm, f: (c: Conversation) => number, of: (c: Conversation) => number) => {
    const cs = conversations(arm);
    return `${cs.reduce((n, c) => n + f(c), 0)} of ${cs.reduce((n, c) => n + of(c), 0)}`;
  };
  const repeats = Math.max(...present.map((a) => new Set(conversations(a).map((c) => c.repeat)).size));
  const line = (label: string, cells: string[]) => `| ${label} | ${cells.join(" | ")} |`;
  const perPage = (a: Arm) => mean(turns(a).map((t) => t.checks ?? 0)).toFixed(1);
  return [
    "<!-- Written by docs/scripts/generation-stats.ts. Do not edit. -->",
    "",
    line(edits ? "All edits" : "All pages", present.map((a) => spec(a).label)),
    `|---|${present.map(() => "--:").join("|")}|`,
    ...rows.map(([label, f]) => line(label, present.map((a) => num(total(a, f))))),
    line(
      edits ? "Valid, with every change made" : "Valid code",
      present.map((a) => count(a, (c) => c.turns.filter((t) => t.valid).length, (c) => c.turns.length)),
    ),
    ...(present.some((a) => spec(a).cli)
      ? [line("`zamn` runs per page", present.map((a) => (spec(a).cli ? perPage(a) : "")))]
      : []),
    line("Skill loaded", present.map((a) => (spec(a).skill ? count(a, (c) => +c.skillLoaded, () => 1) : ""))),
    "",
    `${pages.length} ${edits ? "edits" : "pages"}, up to ${repeats} runs of each, ${stats.model} through Claude Code ${stats.claudeCode.split(" ")[0]}, ${stats.generated}. Tokens are each ${edits ? "edit" : "page"}'s mean, summed over the ${edits ? "edits" : "pages"}.`,
    "",
  ].join("\n");
}

if (import.meta.main) await main();
