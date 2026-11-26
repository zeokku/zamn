---
title: Engineering the most efficient skill for Claude
date: 2026-11-26
description: A dozen setups of the zamn skill for Claude Code, measured on six pages written and edited in one chat each. What each one changed, what it cost, and the setup that shipped.
---

# Engineering the most efficient skill for Claude

zamn files are a fifth to a third shorter than the HTML Claude writes, but Claude has to read the rules before it writes any, and it thinks longer before writing a language it knows only from them. A dozen setups of the [Claude Code skill](/ai/skill) later, a chat in zamn costs 6–10% more than the same chat in HTML. In 140 chats, Claude never left a zamn file that didn't compile.

## How it was measured

Claude Code (`claude-opus-5-5`, default effort, 2.1.319) writes six pages, a landing page, an article and four Vue components, then edits each six times, all in one chat per page. Every setup ran each chat twice. Each step's file is checked: it must compile, and hold the text the prompt asked for.

The comparison is in dollars, at the list prices Claude Code reports, because token types are priced very differently. Most of what a model call reads is the conversation so far, served from a cache at 0.05× the price of fresh input. What is new is written to the cache once at 2×, and output, thinking included, costs 5×. A skill is paid for mostly when it is written to the cache, and every later call reads it again.

## Results

Cost of the six chats, against HTML with the same tools. A real Claude Code session always has Bash, and Bash's description costs about 6% on its own, so the setups with Bash are compared with HTML with Bash ($1.167), and the others with plain HTML ($1.096).

| Setup | What Claude gets | Cost | vs HTML |
|---|---|--:|--:|
| skill | the skill, which says to run `zamn --validate`, and no way to run it | $1.304 | +19% |
| skill, hook | a hook that validates every write; the skill says so | $1.242 | +13% |
| … "no extra validation" | the hook step adds "no extra validation is needed: write the file in one go" | $1.233 | +12% |
| … shorter skill | the same, with the Prettier step, converting HTML and a rationale cut (−14%) | $1.212 | +11% |
| skill, Bash `zamn` | Bash may run `zamn`, and the skill says to check with it | $1.459 | +25% |
| **skill, hook, Bash `zamn`** | the hook, and "you can run `zamn --validate` yourself as well, but the hook has already checked the file" | $1.272 | **+9%** |
| … shorter skill | the same, with the shorter skill and the hook reporting warnings too | $1.288 | +10% |
| … with a fallback | adds "if the project has no hook, run `zamn --validate` once, after the last change" | $1.351 | +16% |
| … without the check step | the skill says nothing about checking | $1.492 | +28% |
| **shipped** | the shorter skill, reordered, and "you can run `zamn --validate` yourself, but there is no need: the hook has already checked the file" | $1.240 | **+6%** |

## What made the difference

**The skill is the largest cost.** Loading it puts its text in the conversation, where it is written to the cache once and read by every later call. That is about two thirds of the hook setup's extra cost; cutting the skill by 14% took a point or two off.

**Claude thinks two to three times as much as for HTML, while composing the page.** Recorded per model call, nearly all of it is in the call that writes the file, before the Write. Three wordings of the hook step left it where it was. Having `zamn` to run lowered it: by about a fifth with the hook and Bash, although Claude never ran `zamn` in those chats, and by about half when it checked with Bash itself. HTML with Bash didn't think less: there is nothing to check in its head. The likeliest reading is that Claude goes over the rules in its head when it can't check for real. Thinking is a smaller cost than the skill, though: about $0.05 of the hook setup's $0.15.

**Every check Claude runs costs more than the thinking it saves.** A `zamn --validate` is a tool call of about 100 output tokens, and its call and result stay in the conversation, read again by every later call. With Bash `zamn` and no hook, that made the setup the most expensive. The hook checks for nothing: a valid file adds nothing to the conversation.

**The check step is what keeps Claude from checking.** A hook that passes says nothing, so Claude can't tell whether there is one. Told that the hook has already checked every write, it left the check to the hook, and ran `zamn` in 1 chat of 12. Given a fallback for a missing hook, it checked to be safe, in 8 of 12. Told nothing, it went looking for a way to check (`which zamn`, `zamn --help`) and ran `zamn` after most steps, in 10 of 12.

## What shipped

The [skill](/ai/skill) and `zamn --hook`, a PostToolUse hook in `.claude/settings.json` that validates every `.zamn` file Claude writes or edits, and the zamn template of every `.vue` file. It is silent when the file is valid, and reports errors and warnings, each with a code and a hint. The skill says Claude may run `zamn --validate`, but has no need to: the hook has already checked every write. Its last rewording came in 4 points under the setup before it, but was cheaper in only half of the run-against-run comparisons, so the two are tied. It has no fallback: it expects the hook, and the [agent rules](/ai/rules), for agents without one, keep `zamn --validate`.

In all 140 chats the hook reported one problem, a line indented as if it were nested, and Claude fixed it in the same step.

## Caveats

- Two runs per setup. The six-page cost of the same setup differed by 2.5% between its runs on average, and by up to 7%, so setups a point or two apart are tied.
- One model, at one effort, in one version of Claude Code, on six pages.
- The costs are list prices. Whether a subscription's usage limits weigh token types the same way isn't published.
