// Runs Claude Code in print mode, stream-json in and out, one prompt at a time,
// and logs what happens in the conversation as it happens.
//
// What it relies on, seen in Claude Code 2.1.319's output:
// - each prompt ends with one `result`, whose `modelUsage[model]` and
//   `total_cost_usd` are totals for the whole session so far;
// - a model call's content blocks come as separate `assistant` messages with
//   the same message id; their `usage` has the call's input, but not its final
//   output, which only the `result` totals give;
// - thinking blocks have no text; `system`/`thinking_tokens` messages before
//   them give a running estimate of their size;
// - a denied tool call comes back as a tool result with `is_error` that starts
//   with "Permission to use";
// - with `--include-hook-events`, each hook run is a `system`/`hook_response`
//   with its `exit_code` and `stderr`.
import { styleText } from "node:util";

let quiet = false;
/** Leave out the events inside a conversation. */
export const setQuiet = (value: boolean) => {
  quiet = value;
};

const started = performance.now();
/** Milliseconds since the script started. */
export const elapsed = () => performance.now() - started;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
export const duration = (ms: number) => (ms < 60_000 ? seconds(ms) : `${(ms / 60_000).toFixed(1)} min`);
export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const usd = (n: number) => `$${n.toFixed(3)}`;

/** Time since the start, as m:ss. */
function clock() {
  const s = Math.floor(elapsed() / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The first line of a text, cut to `max` characters, and how many lines follow. */
export function oneLine(text: string, max = 110) {
  const lines = text.trim().split("\n");
  const head = lines[0] ?? "";
  const first = head.length > max ? `${head.slice(0, max)}…` : head;
  return lines.length > 1 ? `${first} (+${lines.length - 1} lines)` : first;
}

type Color = Parameters<typeof styleText>[0];
const palette: Color[] = ["cyan", "magenta", "yellow", "green", "blue", "red"];
let tags = 0;
/**
 * Console lines prefixed with the time and a tag, in a colour of the tag's own,
 * so conversations running in parallel can be told apart. `info` and `warn`
 * always print, `detail` not when quiet. styleText leaves colours out when the
 * output isn't a terminal.
 */
export function logger(tag: string, color: Color = palette[tags++ % palette.length]!) {
  const line = (text: string) => console.log(`${styleText("dim", clock().padStart(5))} ${styleText(color, tag)} ${text}`);
  return {
    info: line,
    warn: (text: string) => line(styleText("yellow", text)),
    detail: (text: string) => {
      if (!quiet) line(styleText("dim", text));
    },
  };
}
export type Log = ReturnType<typeof logger>;
/** Lines about the whole run. */
export const run = logger("run", ["bold"]);

/** A session's running totals for one model, as a `result` reports them. */
export interface Totals {
  /** Input not read from or written to the cache. */
  uncached: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  /** Part of `output`. */
  thinking: number;
  /** Claude Code's list-price estimate for the session, every model included. */
  cost: number;
}
export const noTotals: Totals = { uncached: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, cost: 0 };
export const inputOf = (t: Totals) => t.uncached + t.cacheWrite + t.cacheRead;
export const minus = (a: Totals, b: Totals): Totals => ({
  uncached: a.uncached - b.uncached,
  cacheWrite: a.cacheWrite - b.cacheWrite,
  cacheRead: a.cacheRead - b.cacheRead,
  output: a.output - b.output,
  thinking: a.thinking - b.thinking,
  cost: a.cost - b.cost,
});

/** A result's totals for `model`, or null if it has none. */
export function usageOf(result: any, model: string): Totals | null {
  const u = result.modelUsage?.[model];
  if (!u) return null;
  return {
    uncached: u.inputTokens ?? 0,
    cacheWrite: u.cacheCreationInputTokens ?? 0,
    cacheRead: u.cacheReadInputTokens ?? 0,
    output: u.outputTokens ?? 0,
    thinking: u.thinkingTokens ?? 0,
    cost: result.total_cost_usd ?? 0,
  };
}

/** Tokens and cost of a step or a whole conversation, as one line. */
export const describeTotals = (t: Totals) =>
  `${usd(t.cost)}, output ${fmt(t.output)} (thinking ${fmt(t.thinking)}), ` +
  `input ${fmt(inputOf(t))} (${fmt(t.cacheRead)} from cache, ${fmt(t.cacheWrite)} written to it, ${fmt(t.uncached)} uncached)`;

/** A tool call's input, as one line for the log. */
function toolInput(c: any): string {
  const i = c.input ?? {};
  if (c.name === "Bash") return oneLine(i.command ?? "");
  if (c.name === "Skill") return i.skill ?? "";
  if (c.name === "Read") return i.file_path ?? "";
  if (c.name === "Write") return `${i.file_path}: ${fmt(i.content?.length ?? 0)} characters`;
  if (c.name === "Edit") {
    return `${i.file_path}: ${fmt(i.old_string?.length ?? 0)} → ${fmt(i.new_string?.length ?? 0)} characters${i.replace_all ? ", every occurrence" : ""}`;
  }
  return oneLine(JSON.stringify(i));
}

/**
 * The rate limit logged last: the account's, in every conversation. Each
 * conversation sees it at a slightly different moment, so only a new status
 * or a higher use than logged so far is logged.
 */
let lastStatus = "";
let mostUsed = -1;

/** The account's use of its rate limits, from the latest event: the most used window. */
export const rateLimit = { status: "", window: "", used: -1, resetsAt: 0 };
/** Forgets the figures, after waiting for a window to reset: the next event brings new ones. */
export const forgetRateLimit = () => Object.assign(rateLimit, { status: "", window: "", used: -1, resetsAt: 0 });

/** Logs a conversation's stream-json messages; `label` names the prompt being answered. */
function follower(log: Log, dir: string, model: string) {
  const toolNames = new Map<string, string>();
  const calls = new Set<string>();
  let promptCalls = 0;
  let thinking = 0;
  let label = "";
  let sentAt = performance.now();
  let previous = noTotals;
  // Claude Code repeats its init message with every prompt.
  let initialised = false;
  const short = (text: string) => (dir ? text.replaceAll(`${dir}/`, "").replaceAll(dir, ".") : text);
  const at = () => (label ? `${label}: ` : "");
  return {
    sent(name: string, text: string) {
      label = name;
      sentAt = performance.now();
      promptCalls = 0;
      log.detail(`${at()}prompt sent, ${fmt(text.length)} characters: ${oneLine(text, 80)}`);
    },
    message(m: any) {
      switch (m.type) {
        case "system":
          if (m.subtype === "init") {
            if (initialised) break;
            initialised = true;
            const skills: string[] = m.skills ?? [];
            log.detail(
              `Claude Code ${m.claude_code_version}, ${m.model}, tools ${(m.tools ?? []).join(",")}, ` +
                `${m.permissionMode}, ${skills.length} skills listed${skills.includes("zamn") ? ", zamn among them" : ""}`,
            );
          } else if (m.subtype === "thinking_tokens") thinking = m.estimated_tokens ?? thinking;
          else if (m.subtype === "hook_response") {
            if (m.exit_code === 0) log.detail(`${at()}hook ${m.hook_name}: nothing to report`);
            else {
              const text = short(String(m.stderr || m.output || "")).trim();
              log.warn(`${at()}hook ${m.hook_name} exited with ${m.exit_code}`);
              for (const line of text.split("\n").slice(0, 4)) log.warn(`${at()}  ${line.slice(0, 110)}`);
            }
          }
          // A denial is logged with its tool result; hook_started says nothing new.
          else if (m.subtype !== "permission_denied" && m.subtype !== "hook_started") log.detail(`system: ${m.subtype}`);
          break;
        case "assistant": {
          const msg = m.message ?? {};
          if (!calls.has(msg.id)) {
            calls.add(msg.id);
            promptCalls++;
            const u = msg.usage ?? {};
            const read = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            log.detail(
              `${at()}model call ${promptCalls}${msg.model && msg.model !== model ? ` (${msg.model})` : ""}: ` +
                `reads ${fmt(read)} tokens, ${fmt(u.cache_read_input_tokens ?? 0)} from cache, ` +
                `${fmt(u.cache_creation_input_tokens ?? 0)} written to it`,
            );
          }
          for (const c of msg.content ?? []) {
            if (c.type === "thinking") {
              const took = m.thinking_duration_ms ? ` for ${seconds(m.thinking_duration_ms)}` : "";
              log.detail(`${at()}thinks${took}${thinking ? `, about ${fmt(thinking)} tokens (estimate)` : ""}`);
              thinking = 0;
            } else if (c.type === "text") {
              log.detail(`${at()}writes ${fmt(c.text.length)} characters: ${oneLine(c.text)}`);
            } else if (c.type === "tool_use") {
              toolNames.set(c.id, c.name);
              log.detail(`${at()}→ ${c.name} ${short(toolInput(c))}`);
            }
          }
          break;
        }
        case "user":
          for (const c of Array.isArray(m.message?.content) ? m.message.content : []) {
            if (c.type !== "tool_result") continue;
            const name = toolNames.get(c.tool_use_id) ?? "tool";
            const text = short(
              typeof c.content === "string" ? c.content : (c.content ?? []).map((p: any) => p.text ?? "").join("\n"),
            ).trim();
            if (!c.is_error) log.detail(`${at()}← ${name}: ${oneLine(text || "(no output)")}`);
            else if (text.startsWith("Permission to use")) log.warn(`${at()}✗ ${name} denied`);
            else for (const line of text.split("\n").slice(0, 4)) log.warn(`${at()}✗ ${name}: ${line.slice(0, 110)}`);
          }
          break;
        case "rate_limit_event": {
          const info = m.rate_limit_info ?? {};
          const windows = Object.entries(info.unifiedWindows ?? {}) as [string, any][];
          const used = Math.max(-1, ...windows.map(([, w]) => Math.round((w.utilization ?? 0) * 100)));
          const [name, most] = windows.find(([, w]) => Math.round((w.utilization ?? 0) * 100) === used) ?? ["", {}];
          Object.assign(rateLimit, { status: info.status ?? "", window: name.replace("_", " "), used, resetsAt: most.resetsAt ?? info.resetsAt ?? 0 });
          if (info.status === lastStatus && used <= mostUsed) break;
          lastStatus = info.status;
          mostUsed = Math.max(mostUsed, used);
          const text = windows.map(([name, w]) => `${name.replace("_", " ")} ${Math.round((w.utilization ?? 0) * 100)}%`).join(", ");
          (info.status === "allowed" ? run.detail : run.warn)(`rate limit ${info.status}${text ? `: ${text} used` : ""}`);
          break;
        }
        case "result": {
          const totals = usageOf(m, model);
          const took = seconds(performance.now() - sentAt);
          if (totals) {
            log.detail(`${at()}answered in ${took} after ${promptCalls} model calls: ${describeTotals(minus(totals, previous))}`);
            previous = totals;
          } else log.warn(`${at()}answered in ${took}, with no usage for ${model}`);
          if (m.subtype !== "success" || m.is_error) {
            log.warn(`${at()}ended with ${m.subtype}${m.terminal_reason ? ` (${m.terminal_reason})` : ""}`);
          }
          break;
        }
        default:
          log.detail(`(${m.type}${m.subtype ? `/${m.subtype}` : ""})`);
      }
    },
  };
}

export interface SessionOptions {
  model: string;
  cwd: string;
  /** The tools Claude has. */
  tools: string[];
  /** Permission rules that let tool calls through without asking; the rest is denied. */
  allowed: string[];
  /** Passed as --effort; without it, Claude Code uses its default. */
  effort?: string;
  env: Record<string, string | undefined>;
  maxBudgetUsd: number;
  log: Log;
  /** Called with each stream-json message as it arrives, after it is logged. */
  onMessage?: (message: any) => void;
}

/** A stream-json message, and the label of the prompt it answers. */
export interface Labelled {
  label: string;
  message: any;
}

/**
 * One Claude Code conversation in print mode. `send` writes a prompt and
 * resolves with its `result`; the next prompt must wait for it, since prompts
 * that arrive while Claude is busy are merged into one turn.
 */
export class Session {
  readonly messages: Labelled[] = [];
  private proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  private follow: ReturnType<typeof follower>;
  private label = "";
  private waiting: { resolve: (m: any) => void; reject: (e: Error) => void } | null = null;
  private reading: Promise<void>;
  private stderr: Promise<string>;
  private onMessage: SessionOptions["onMessage"];

  constructor(options: SessionOptions) {
    const { model, cwd, tools, allowed, effort, env, maxBudgetUsd, log, onMessage } = options;
    this.follow = follower(log, cwd, model);
    this.onMessage = onMessage;
    const proc = Bun.spawn(
      ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
        "--include-hook-events", "--exclude-dynamic-system-prompt-sections",
        "--model", model, ...(effort ? ["--effort", effort] : []), "--tools", tools.join(","),
        "--setting-sources", "project", "--strict-mcp-config",
        ...(allowed.length ? ["--allowedTools", allowed.join(",")] : []), "--permission-mode", "dontAsk",
        "--no-session-persistence", "--max-budget-usd", String(maxBudgetUsd)],
      { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    this.proc = proc;
    this.stderr = (async () => {
      let all = "";
      for await (const chunk of proc.stderr.pipeThrough(new TextDecoderStream())) {
        all += chunk;
        for (const line of chunk.split("\n")) if (line.trim()) log.warn(`stderr: ${line.trim()}`);
      }
      return all;
    })();
    this.reading = this.read();
  }

  private async read() {
    let buffer = "";
    for await (const chunk of this.proc.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        this.messages.push({ label: this.label, message });
        this.follow.message(message);
        this.onMessage?.(message);
        if (message.type === "result" && this.waiting) {
          const { resolve } = this.waiting;
          this.waiting = null;
          resolve(message);
        }
      }
    }
    if (this.waiting) {
      const code = await this.proc.exited;
      this.waiting.reject(new Error(`claude exited with ${code} before answering: ${(await this.stderr).trim()}`));
      this.waiting = null;
    }
  }

  /** Sends a prompt and waits for its result. */
  send(label: string, text: string): Promise<any> {
    if (this.waiting) throw new Error("a prompt is still being answered");
    this.label = label;
    this.follow.sent(label, text);
    const result = new Promise<any>((resolve, reject) => (this.waiting = { resolve, reject }));
    this.proc.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n");
    this.proc.stdin.flush();
    return result;
  }

  /** Ends the conversation; throws if Claude Code failed. */
  async close() {
    this.proc.stdin.end();
    await this.reading;
    const code = await this.proc.exited;
    const stderr = await this.stderr;
    if (code !== 0) throw new Error(`claude exited with ${code}: ${stderr.trim()}`);
  }

  /** Stops Claude Code, for a conversation that failed. */
  kill() {
    this.proc.kill();
  }

  /** The messages that answered the prompts with these labels. */
  answering(labels: string[]) {
    return this.messages.filter((m) => labels.includes(m.label)).map((m) => m.message);
  }
}
