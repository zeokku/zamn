// Has Claude Code write a page and then edit it, step by step in one chat, as
// HTML and as zamn with different setups, and records what each step cost.
// The steps are in docs/token-corpus/chats.yaml. Writes
// docs/data/chat-stats.json and the tables in docs/data/chat-summary.md.
//
//   bun run docs:chats [--arms html,zamn,zamnHook,zamnCli] [--pages landing,SignupForm.vue]
//                      [--repeats 3] [--effort low|medium|high|xhigh|max] [--budget 60] [--parallel 6]
//                      [--max-usage 95] [--model claude-opus-5-5] [--quiet]
//
// chats.yaml maps a page to its steps: the first writes the page, the others
// edit it. A step is a prompt, or { prompt, has, lacks }: text the page's HTML
// must contain, or must not, from that step on (until a later step says
// otherwise). `has` is matched as written, `lacks` ignoring case; both ignore
// how whitespace is laid out. A page named `Name.vue` is a Vue component, in
// that file in every arm; any other is `name.html` or `name.zamn`.
//
// Each chat runs `claude -p` (Claude Code, logged in as it is, a subscription
// included) in an empty temporary directory: no CLAUDE.md, no user or project
// settings but the arm's own, no MCP servers. The user's settings, effortLevel
// included, are skipped, so the effort is Claude Code's default unless --effort
// sets one. Claude has Write, Read and Edit, and Skill; the arms add:
//   html      nothing
//   zamn      the zamn skill, installed in the directory; Claude loads it itself
//   zamnHook  the skill with "a hook checks the file" for its check step, and a
//             PostToolUse hook that runs `zamn --validate` after every Write
//             and Edit and reports only errors (zamn-hook.ts)
//   zamnCli   the skill, and Bash allowed to run `zamn` and nothing else
//
// After each step the script checks the file: zamn must compile, HTML must
// parse, and a Vue template must compile with Vue's compiler. If it doesn't,
// the script sends the errors back once, as a user would, and counts the fix in
// that step. Then it checks the step's `has` and `lacks`.
//
// Costs are Claude Code's list-price estimate (`total_cost_usd`), also on a
// subscription. Tokens are the requested model's, from the `result` totals.
// Before the chats, one unrecorded chat per arm warms the prompt cache, so that
// no recorded chat pays for writing Claude Code's system prompt to it and the
// others don't, depending on which one starts first.
//
// Chats run repeat by repeat, arms and pages shuffled within a repeat. Only
// complete repeats go into chat-stats.json (the rest into
// chat-stats.partial.json); chats of the arms and pages not run are kept from
// the previous run. --budget stops starting new chats once the cost reaches
// that many dollars, and --max-usage stops starting them while any of the
// account's rate-limit windows is that many percent used, until it resets.
import { $ } from "bun";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs, styleText } from "node:util";
import * as prettier from "prettier";
import { compileTemplate, parse as parseSfc } from "vue/compiler-sfc";
import {
  describeTotals, duration, elapsed, fmt, forgetRateLimit, inputOf, logger, minus, noTotals, rateLimit, run, Session, setQuiet,
  usageOf, usd,
  type Log, type Totals,
} from "./claude-stream";

const docs = resolve(import.meta.dir, "..");
const out = resolve(docs, "data/chat-stats.json");
const partialOut = resolve(docs, "data/chat-stats.partial.json");
const summaryOut = resolve(docs, "data/chat-summary.md");
const chatsFile = resolve(docs, "token-corpus/chats.yaml");
const skillFile = resolve(docs, "../skills/zamn/SKILL.md");
const zamnBinary = resolve(docs, "../target/debug/zamn");
const hookScript = resolve(import.meta.dir, "zamn-hook.ts");

type Lang = "html" | "zamn";
interface ArmSpec {
  label: string;
  lang: Lang;
  skill: "readable" | "hook" | null;
  /** The PostToolUse hook that validates every write. */
  hook: boolean;
  /** Bash, allowed to run `zamn` only. */
  cli: boolean;
}
export const arms = {
  html: { label: "HTML", lang: "html", skill: null, hook: false, cli: false },
  zamn: { label: "zamn, skill", lang: "zamn", skill: "readable", hook: false, cli: false },
  zamnHook: { label: "zamn, skill, hook", lang: "zamn", skill: "hook", hook: true, cli: false },
  zamnCli: { label: "zamn, skill, Bash zamn", lang: "zamn", skill: "readable", hook: false, cli: true },
} satisfies Record<string, ArmSpec>;
export type Arm = keyof typeof arms;
const spec = (a: Arm): ArmSpec => arms[a];

const { values: args } = parseArgs({
  options: {
    arms: { type: "string", default: Object.keys(arms).join(",") },
    pages: { type: "string" },
    repeats: { type: "string", default: "3" },
    effort: { type: "string" },
    budget: { type: "string", default: "60" },
    "max-usage": { type: "string", default: "95" },
    parallel: { type: "string", default: "6" },
    model: { type: "string", default: "claude-opus-5-5" },
    quiet: { type: "boolean", default: false },
  },
});
setQuiet(args.quiet);
const MODEL = args.model;
/** The effort level asked for, or "default": then no --effort is passed and Claude Code picks its own. */
const EFFORT = args.effort ?? "default";
const effortText = (effort: string) => (effort === "default" ? "Claude Code's default effort" : `effort ${effort}`);

/** The skill's check step, for the arm whose hook does the checking. */
const HOOK_STEP = `2. A hook checks the file with \`zamn --validate\` after every write and edit, \`<template lang="zamn">\` of a \`.vue\` file included. It says nothing when the file is valid, and otherwise reports every error, each with a code and a hint: fix every error it reports.

`;

async function skillText(kind: NonNullable<ArmSpec["skill"]>) {
  const skill = await Bun.file(skillFile).text();
  if (kind === "readable") return skill;
  const start = skill.indexOf("2. Check it with `zamn --validate`");
  const end = skill.indexOf("3. Format");
  if (start < 0 || end < start) throw new Error("SKILL.md: workflow step 2 not found");
  return skill.slice(0, start) + HOOK_STEP + skill.slice(end);
}

interface Step {
  prompt: string;
  has: string[];
  lacks: string[];
}
interface Page {
  name: string;
  vue: boolean;
  steps: Step[];
}
const fileOf = (page: Page, lang: Lang) => (page.vue ? page.name : `${page.name}.${lang}`);
const labelOf = (i: number) => (i === 0 ? "create" : `edit ${i}`);

export async function readPages(): Promise<Page[]> {
  const raw = Bun.YAML.parse(await Bun.file(chatsFile).text()) as Record<string, unknown>;
  return Object.entries(raw).map(([name, steps]) => {
    if (!Array.isArray(steps) || !steps.length) throw new Error(`chats.yaml: ${name} has no steps`);
    return {
      name,
      vue: name.endsWith(".vue"),
      steps: steps.map((s, i): Step => {
        const step = typeof s === "string" ? { prompt: s } : (s as Partial<Step>);
        if (typeof step.prompt !== "string") throw new Error(`chats.yaml: ${name}, step ${i + 1} has no prompt`);
        return { prompt: step.prompt, has: step.has ?? [], lacks: step.lacks ?? [] };
      }),
    };
  });
}

const DONE = "Reply with one short sentence when it's done.";
function promptFor(page: Page, i: number, lang: Lang) {
  const step = page.steps[i]!;
  if (i > 0) return `${step.prompt.trim()}\n\n${DONE}`;
  const language = lang === "html" ? "HTML" : "zamn";
  const where = page.vue
    ? `Write the template in ${language}, in ${fileOf(page, lang)}.`
    : `Write it in ${language}, in ${fileOf(page, lang)}.`;
  return `${step.prompt.trim()}\n\n${where} ${DONE}`;
}
const fixPrompt = (file: string, problems: string) => `${file} has errors:\n\n${problems.trim()}\n\nFix them. ${DONE}`;

/** What the file holds after a step, and what is wrong with it. */
interface Inspection {
  text: string | null;
  /** The page as HTML (a Vue component's template), when it compiles or parses. */
  html: string | null;
  /** Error codes: zamn's, or NO_FILE, HTML_PARSE, VUE_TEMPLATE, NO_TEMPLATE. */
  codes: string[];
  /** The errors as Claude would read them, for the fix-up prompt. */
  problems: string | null;
}

export async function inspect(dir: string, file: string, lang: Lang, vue: boolean): Promise<Inspection> {
  const text = await Bun.file(join(dir, file)).text().catch(() => null);
  if (text === null) return { text, html: null, codes: ["NO_FILE"], problems: null };
  let html: string;
  if (lang === "zamn") {
    const check = Bun.spawnSync([zamnBinary, "--validate", file], { cwd: dir });
    if (check.exitCode !== 0) {
      const problems = `${check.stdout}${check.stderr}`.trim();
      const codes = [...problems.matchAll(/error\[(\w+)\]/g)].map((m) => m[1]!);
      return { text, html: null, codes: codes.length ? codes : ["ZAMN"], problems };
    }
    html = Bun.spawnSync([zamnBinary, file], { cwd: dir }).stdout.toString();
  } else if (vue) {
    const template = parseSfc(text, { filename: file }).descriptor.template;
    if (!template) return { text, html: null, codes: ["NO_TEMPLATE"], problems: `There is no <template> in ${file}.` };
    html = template.content;
  } else {
    try {
      await prettier.format(text, { parser: "html" });
    } catch (error) {
      return { text, html: null, codes: ["HTML_PARSE"], problems: (error as Error).message.split("\n")[0]! };
    }
    html = text;
  }
  if (vue) {
    const { errors } = compileTemplate({ source: html, filename: file, id: "chat" });
    if (errors.length) {
      const problems = errors.map((e) => (typeof e === "string" ? e : e.message)).join("\n");
      return { text, html, codes: errors.map(() => "VUE_TEMPLATE"), problems };
    }
  }
  return { text, html, codes: [], problems: null };
}

/** What a page must and must not contain after step `i`: a later step overrides an earlier one. */
export function expectations(page: Page, i: number) {
  const must = new Map<string, boolean>();
  for (const step of page.steps.slice(0, i + 1)) {
    for (const s of step.has) must.set(s, true);
    for (const s of step.lacks) must.set(s, false);
  }
  return must;
}
const squash = (s: string) => s.replace(/\s+/g, " ");

/**
 * Judges the page after step `i`. A step fails for its own checks (MISSING,
 * LEFT), and for an earlier step's check that was met before it and isn't
 * after (BROKE), so that each miss counts once, against the step that caused
 * it. `before` is what was met after the previous step; the result's `met` is
 * that for this one.
 */
export function judge(page: Page, i: number, html: string, before: Map<string, boolean>) {
  const text = squash(html);
  const lower = text.toLowerCase();
  const step = page.steps[i]!;
  const own = new Set([...step.has, ...step.lacks]);
  const met = new Map<string, boolean>();
  const errors: string[] = [];
  for (const [s, wanted] of expectations(page, i)) {
    const ok = wanted ? text.includes(squash(s)) : !lower.includes(squash(s).toLowerCase());
    met.set(s, ok);
    if (ok) continue;
    if (own.has(s)) errors.push(`${wanted ? "MISSING" : "LEFT"} ${s}`);
    else if (before.get(s)) errors.push(`BROKE ${s}`);
  }
  return { errors, met };
}

/** One step of a chat: a prompt, and the fix-up if the script sent one. */
export interface StepResult {
  step: number;
  usage: Totals;
  /** Calls to the requested model. */
  calls: number;
  /** Each tool call, as its name and the first line of its command or file. */
  tools: string[];
  zamnRuns: number;
  hookErrors: number;
  /** The error codes the fix-up was sent for, or null if none was needed. */
  fixUp: string[] | null;
  /** Valid, its own checks met, and no earlier one broken. */
  valid: boolean;
  errors: string[];
  durationMs: number;
  /** The file after the step. */
  file: string | null;
}

export interface Chat {
  arm: Arm;
  page: string;
  repeat: number;
  skillLoaded: boolean;
  usage: Totals;
  steps: StepResult[];
}

export interface ChatStats {
  generated: string;
  model: string;
  claudeCode: string;
  /** The level passed with --effort, or "default" for Claude Code's own. */
  effort: string;
  chats: Chat[];
}

/** A temporary directory set up for an arm, and how to start Claude Code in it. */
async function prepare(arm: Arm) {
  const { skill, hook, cli } = spec(arm);
  const dir = await mkdtemp(join(tmpdir(), "zamn-chat-"));
  const bin = await mkdtemp(join(tmpdir(), "zamn-chat-bin-"));
  await $`git init -q`.cwd(dir);
  if (skill) await Bun.write(join(dir, ".claude/skills/zamn/SKILL.md"), await skillText(skill));
  if (hook) {
    // The command is short, since Claude Code quotes it with every error it passes on.
    await Bun.write(join(bin, "zamn-hook"), `#!/bin/sh\nexec bun "${hookScript}"\n`);
    await chmod(join(bin, "zamn-hook"), 0o755);
    const settings = { hooks: { PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "zamn-hook" }] }] } };
    await Bun.write(join(dir, ".claude/settings.json"), JSON.stringify(settings, null, 2));
  }
  // `zamn` is on PATH from a directory outside the working one; only the Bash
  // arm can run it itself, and the hook needs it.
  if (cli || hook) await symlink(zamnBinary, join(bin, "zamn"));
  const tools = ["Skill", "Write", "Read", "Edit", ...(cli ? ["Bash"] : [])];
  const allowed = ["Write", "Read", "Edit", ...(cli ? ["Bash(zamn *)"] : [])];
  const start = (log: Log, maxBudgetUsd: number) =>
    new Session({
      model: MODEL, cwd: dir, tools, allowed, effort: args.effort, maxBudgetUsd, log,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  const cleanUp = async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  };
  return { dir, tools, allowed, start, cleanUp };
}

/** One unrecorded prompt, so that the arm's system prompt is in the prompt cache. */
async function warmUp(arm: Arm) {
  const log = logger(`warm-up ${arm}`);
  const env = await prepare(arm);
  const session = env.start(log, 1);
  try {
    const result = await session.send("warm-up", "Reply with the word ready.");
    await session.close();
    const usage = usageOf(result, MODEL);
    log.info(usage ? `done: ${describeTotals(usage)}` : "done");
    return usage?.cost ?? 0;
  } catch (error) {
    session.kill();
    log.warn(`failed: ${(error as Error).message}`);
    return 0;
  } finally {
    await env.cleanUp();
  }
}

const isZamnRun = (c: any) => c.name === "Bash" && /(^|[\s|;&(])zamn(\s|$)/m.test(c.input?.command ?? "");

/** Runs one chat: the page's steps in turn. */
async function chat(arm: Arm, page: Page, repeat: number, log: Log): Promise<Chat> {
  const { lang, skill, cli, hook } = spec(arm);
  const file = fileOf(page, lang);
  const env = await prepare(arm);
  log.detail(
    `${file}, ${page.steps.length} steps, skill ${skill ?? "none"}${hook ? ", hook" : ""}, tools ${env.tools.join(",")}, ` +
      `allowed ${env.allowed.join(",")}, ${effortText(EFFORT)}, in ${env.dir}`,
  );
  const session = env.start(log, page.steps.length);
  try {
    const steps: StepResult[] = [];
    let previous = noTotals;
    let met = new Map<string, boolean>();
    for (let i = 0; i < page.steps.length; i++) {
      const label = labelOf(i);
      const at = performance.now();
      let result = await session.send(label, promptFor(page, i, lang));
      let found = await inspect(env.dir, file, lang, page.vue);
      let fixUp: string[] | null = null;
      if (found.problems) {
        fixUp = found.codes;
        log.warn(`${label}: ${found.codes.join(" ")}, sending the errors back`);
        result = await session.send(`${label}, fix`, fixPrompt(file, found.problems));
        found = await inspect(env.dir, file, lang, page.vue);
      }
      const totals = usageOf(result, MODEL);
      if (!totals) throw new Error(`${label}: no usage for ${MODEL}`);
      const messages = session.answering([label, `${label}, fix`]);
      const toolUses = messages
        .filter((m) => m.type === "assistant")
        .flatMap((m) => (m.message.content ?? []).filter((c: any) => c.type === "tool_use"));
      const judged = found.html === null ? { errors: [], met } : judge(page, i, found.html, met);
      met = judged.met;
      const errors = [...found.codes, ...judged.errors];
      const step: StepResult = {
        step: i,
        usage: minus(totals, previous),
        calls: new Set(messages.filter((m) => m.type === "assistant" && m.message.model === MODEL).map((m) => m.message.id)).size,
        tools: toolUses.map((c: any) => {
          const what = c.input?.command ?? c.input?.file_path ?? c.input?.skill ?? "";
          return `${c.name}: ${String(what).split("\n")[0]!.replace(env.dir, ".")}`.slice(0, 120);
        }),
        zamnRuns: toolUses.filter(isZamnRun).length,
        hookErrors: messages.filter((m) => m.type === "system" && m.subtype === "hook_response" && m.exit_code !== 0).length,
        fixUp,
        valid: errors.length === 0,
        errors,
        durationMs: performance.now() - at,
        file: found.text,
      };
      steps.push(step);
      previous = totals;
      log.info(
        `${label}: ${describeTotals(step.usage)}, ${step.calls} model calls` +
          (cli ? `, ${step.zamnRuns} zamn runs` : "") +
          (hook && step.hookErrors ? `, ${step.hookErrors} hook errors` : "") +
          `, ${step.valid ? styleText("green", fixUp ? "valid after the fix-up" : "valid") : styleText("red", errors.join(" "))}`,
      );
    }
    await session.close();
    const skillLoaded = session.messages.some(
      ({ message: m }) =>
        m.type === "assistant" && (m.message.content ?? []).some((c: any) => c.type === "tool_use" && c.name === "Skill" && c.input?.skill === "zamn"),
    );
    if (skill && !skillLoaded) log.warn("never loaded the zamn skill");
    return { arm, page: page.name, repeat, skillLoaded, usage: previous, steps };
  } catch (error) {
    session.kill();
    throw error;
  } finally {
    await env.cleanUp();
  }
}

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

async function main() {
  const all = await readPages();
  const only = args.pages?.split(",");
  for (const name of only ?? []) if (!all.some((p) => p.name === name)) throw new Error(`no page ${name} in chats.yaml`);
  const pages = all.filter((p) => !only || only.includes(p.name));
  const chosen = args.arms.split(",") as Arm[];
  for (const arm of chosen) if (!(arm in arms)) throw new Error(`unknown arm ${arm}`);
  if (chosen.some((a) => spec(a).lang === "zamn") && !(await Bun.file(zamnBinary).exists())) {
    throw new Error(`${zamnBinary} not found: run \`bun run build\` first`);
  }
  const repeats = Number(args.repeats);
  const budget = Number(args.budget);

  const queue = Array.from({ length: repeats }, (_, i) =>
    shuffle(chosen.flatMap((arm) => pages.map((page) => ({ arm, page, repeat: i + 1 })))),
  ).flat();
  const total = queue.length;
  const perRepeat = total / repeats;

  const previous: ChatStats | null = await Bun.file(out).json().catch(() => null);
  const ran = (c: Chat) => chosen.includes(c.arm) && pages.some((p) => p.name === c.page);
  const kept = (previous?.chats ?? []).filter((c) => c.arm in arms && !ran(c));
  const claudeCode = (await $`claude --version`.text()).trim().split(" ")[0]!;
  run.info(`${MODEL} at ${effortText(EFFORT)}, through Claude Code ${claudeCode}`);
  run.info(`arms ${chosen.join(", ")}`);
  run.info(`pages ${pages.map((p) => `${p.name} (${p.steps.length} steps)`).join(", ")}, ${repeats} run${repeats === 1 ? "" : "s"} of each`);
  run.info(`${plural(total, "chat")}, ${fmt(queue.reduce((n, q) => n + q.page.steps.length, 0))} prompts, ${args.parallel} at a time, budget $${budget}`);
  if (kept.length) {
    const byArm = Object.entries(Object.groupBy(kept, (c) => c.arm)).map(([a, cs]) => `${a} ${cs!.length}`);
    run.info(`kept from the previous run: ${byArm.join(", ")}`);
    if (previous && (previous.effort !== EFFORT || previous.model !== MODEL)) {
      run.warn(`the kept chats ran with ${previous.model} at ${effortText(previous.effort)}`);
    }
  }

  const done: Chat[] = [];
  let spent = 0;
  const save = async () => {
    const complete = done.filter((c) => done.filter((d) => d.repeat === c.repeat).length === perRepeat);
    const partial = done.filter((c) => !complete.includes(c));
    if (partial.length) await Bun.write(partialOut, JSON.stringify(partial, null, 2) + "\n");
    else await rm(partialOut, { force: true });
    const order = (c: Chat) => `${c.arm} ${c.page} ${c.repeat}`;
    const stats: ChatStats = {
      generated: new Date().toLocaleDateString("sv"),
      model: MODEL,
      claudeCode,
      effort: EFFORT,
      chats: [...kept, ...complete].sort((a, b) => order(a).localeCompare(order(b))),
    };
    await Bun.write(out, JSON.stringify(stats, null, 2) + "\n");
    await Bun.write(summaryOut, summary(stats));
    return { complete: complete.length, partial: partial.length, stats };
  };

  run.info("warming the prompt cache, one prompt per arm");
  for (const cost of await Promise.all(chosen.map(warmUp))) spent += cost;

  let begun = 0;
  let finished = 0;
  let failed = 0;
  const startedChats = elapsed();
  const left = () => duration(((elapsed() - startedChats) / finished) * (total - finished));
  // Near a rate limit, no new chat starts until the window resets: one wait,
  // shared by every worker. Chats already running go on.
  const maxUsage = Number(args["max-usage"]);
  let pause: Promise<void> | null = null;
  const waitForLimit = () => {
    if (rateLimit.used < maxUsage && rateLimit.status !== "rejected") return null;
    pause ??= (async () => {
      const until = rateLimit.resetsAt * 1000 + 60_000;
      run.warn(
        `${rateLimit.window || "rate"} limit ${rateLimit.used}% used (${rateLimit.status}), --max-usage ${maxUsage}: ` +
          `no new chats until it resets, at ${new Date(until).toLocaleTimeString("sv")}`,
      );
      await Bun.sleep(Math.max(0, until - Date.now()));
      forgetRateLimit();
      run.info("rate limit window reset, starting chats again");
      pause = null;
    })();
    return pause;
  };
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      for (let wait = waitForLimit(); wait; wait = waitForLimit()) await wait;
      if (spent >= budget) {
        run.warn(`budget of $${budget} reached (${usd(spent)}), not starting the ${queue.length + 1} chats left`);
        queue.length = 0;
        return;
      }
      const log = logger(`#${next.repeat} ${next.arm} ${next.page.name}`);
      const at = performance.now();
      log.info(`starts, chat ${++begun} of ${total}`);
      const c = await chat(next.arm, next.page, next.repeat, log).catch((error: Error) => {
        log.info(styleText("red", `failed: ${error.message}`));
        return null;
      });
      finished++;
      if (!c) {
        failed++;
        continue;
      }
      spent += c.usage.cost;
      done.push(c);
      log.info(
        `done in ${duration(performance.now() - at)}: ${describeTotals(c.usage)}. ` +
          `Spent ${usd(spent)} of $${budget}; ${finished} of ${total} chats finished` +
          `${failed ? ` (${failed} failed)` : ""}${finished < total ? `, about ${left()} to go` : ""}`,
      );
      const saved = await save();
      log.detail(
        `saved: ${saved.complete} chats in complete repeats` +
          `${saved.partial ? `, ${saved.partial} in chat-stats.partial.json until their repeat is complete` : ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: Number(args.parallel) }, worker));
  const { complete, partial, stats } = await save();
  run.info(
    `wrote ${out} (${complete} new chats${partial ? `, ${partial} partial` : ""}${failed ? `, ${failed} failed` : ""}) ` +
      `and ${summaryOut}, ${usd(spent)} in ${duration(elapsed())}`,
  );
  console.log(`\n${summary(stats).replace(/^<!--.*-->\n/, "")}`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const num = (v: number) => (Number.isNaN(v) ? "—" : fmt(v));
const money = (v: number) => (Number.isNaN(v) ? "—" : usd(v));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const change = (a: number, b: number) => {
  if (!b || Number.isNaN(a) || Number.isNaN(b)) return "—";
  const pct = Math.round((a / b - 1) * 100);
  return pct === 0 ? "±0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
};

/**
 * Tables of a run. Every figure is a page's mean over its runs, summed over
 * the pages that every arm in the table ran.
 */
export function summary(stats: ChatStats): string {
  const present = (Object.keys(arms) as Arm[]).filter((a) => stats.chats.some((c) => c.arm === a));
  if (!present.length) return "\nNot measured yet: run `bun run docs:chats`.\n";
  const chatsOf = (arm: Arm, page?: string) => stats.chats.filter((c) => c.arm === arm && (!page || c.page === page));
  const pages = [...new Set(stats.chats.map((c) => c.page))].filter((p) => present.every((a) => chatsOf(a, p).length));
  const steps = Math.max(...stats.chats.map((c) => c.steps.length));
  const repeats = Math.max(...present.flatMap((a) => pages.map((p) => chatsOf(a, p).length)));
  /** A page's mean over its runs, summed over the pages. */
  const sum = (arm: Arm, f: (c: Chat) => number) => pages.reduce((n, p) => n + mean(chatsOf(arm, p).map(f)), 0);
  const stepSum = (arm: Arm, i: number, f: (s: StepResult) => number) =>
    sum(arm, (c) => (c.steps[i] ? f(c.steps[i]!) : NaN));
  const line = (label: string, cells: string[]) => `| ${label} | ${cells.join(" | ")} |`;
  const header = (label: string) => [line(label, present.map((a) => spec(a).label)), `|---|${present.map(() => "--:").join("|")}|`];
  const html = present.includes("html") ? "html" : null;
  const vsHtml = (f: (a: Arm) => number) => line("vs HTML", present.map((a) => (a === html ? "" : change(f(a), f(html!)))));
  const allSteps = (arm: Arm) => chatsOf(arm).filter((c) => pages.includes(c.page)).flatMap((c) => c.steps);

  const perStep = [
    ...header("Cost per step"),
    ...Array.from({ length: steps }, (_, i) => line(labelOf(i), present.map((a) => money(stepSum(a, i, (s) => s.usage.cost))))),
    line("**All steps**", present.map((a) => `**${money(sum(a, (c) => c.usage.cost))}**`)),
    ...(html ? [vsHtml((a) => sum(a, (c) => c.usage.cost))] : []),
  ];
  const cumulative = [
    ...header("Cost so far"),
    ...Array.from({ length: steps }, (_, i) =>
      line(`after ${labelOf(i)}`, present.map((a) => {
        const so = Array.from({ length: i + 1 }, (_, j) => stepSum(a, j, (s) => s.usage.cost)).reduce((x, y) => x + y, 0);
        const base = html && a !== html
          ? Array.from({ length: i + 1 }, (_, j) => stepSum(html, j, (s) => s.usage.cost)).reduce((x, y) => x + y, 0)
          : NaN;
        return `${money(so)}${Number.isNaN(base) ? "" : ` (${change(so, base)})`}`;
      })),
    ),
  ];
  const count = (arm: Arm, f: (s: StepResult) => boolean) => `${allSteps(arm).filter(f).length} of ${allSteps(arm).length}`;
  const totals = [
    ...header("All steps"),
    line("Cost", present.map((a) => money(sum(a, (c) => c.usage.cost)))),
    line("Output", present.map((a) => num(sum(a, (c) => c.usage.output)))),
    line("of which thinking", present.map((a) => num(sum(a, (c) => c.usage.thinking)))),
    line("Input", present.map((a) => num(sum(a, (c) => inputOf(c.usage))))),
    line("read from cache", present.map((a) => num(sum(a, (c) => c.usage.cacheRead)))),
    line("written to cache", present.map((a) => num(sum(a, (c) => c.usage.cacheWrite)))),
    line("uncached", present.map((a) => num(sum(a, (c) => c.usage.uncached)))),
    line("Model calls", present.map((a) => num(sum(a, (c) => c.steps.reduce((n, s) => n + s.calls, 0))))),
    line("Valid, its checks met, nothing broken", present.map((a) => count(a, (s) => s.valid))),
    line("Needed a fix-up", present.map((a) => count(a, (s) => s.fixUp !== null))),
    ...(present.some((a) => spec(a).cli)
      ? [line("`zamn` runs", present.map((a) => (spec(a).cli ? num(sum(a, (c) => c.steps.reduce((n, s) => n + s.zamnRuns, 0))) : "")))]
      : []),
    ...(present.some((a) => spec(a).hook)
      ? [line("Hook errors", present.map((a) => (spec(a).hook ? num(sum(a, (c) => c.steps.reduce((n, s) => n + s.hookErrors, 0))) : "")))]
      : []),
    line("Skill loaded", present.map((a) => {
      const cs = chatsOf(a).filter((c) => pages.includes(c.page));
      return spec(a).skill ? `${cs.filter((c) => c.skillLoaded).length} of ${cs.length}` : "";
    })),
  ];
  const range = (xs: number[]) => (xs.length > 1 ? ` (${money(Math.min(...xs))}–${money(Math.max(...xs))})` : "");
  const perPage = [
    ...header("Cost per chat"),
    ...pages.map((p) =>
      line(`\`${p}\``, present.map((a) => {
        const costs = chatsOf(a, p).map((c) => c.usage.cost);
        const base = html && a !== html ? mean(chatsOf(html, p).map((c) => c.usage.cost)) : NaN;
        return `${money(mean(costs))}${Number.isNaN(base) ? "" : `, ${change(mean(costs), base)}`}${range(costs)}`;
      })),
    ),
  ];
  return [
    "<!-- Written by docs/scripts/chat-stats.ts. Do not edit. -->",
    "",
    ...perStep, "", ...cumulative, "", ...totals, "", ...perPage, "",
    `${plural(pages.length, "page")}, a chat each of ${steps} steps (write the page, then ${plural(steps - 1, "edit")}), ` +
      `${repeats === 1 ? "one run" : `up to ${repeats} runs`} of each; ` +
      `${stats.model} at ${effortText(stats.effort)} through Claude Code ${stats.claudeCode}, ${stats.generated}. ` +
      "Costs are Claude Code's list-price estimates. Every figure is a page's mean over its runs, summed over the pages; " +
      "the cost per chat gives the range over the runs in brackets.",
    "",
  ].join("\n");
}

if (import.meta.main) await main();
