---
title: What it costs Claude Code to write zamn
date: 2026-11-26
description: Six pages written and edited in Claude Code, as HTML and as zamn in nine setups. Where zamn's extra cost goes, what lowered it, and the setup that came out of it.
---

# What it costs Claude Code to write zamn

zamn files are a fifth to a third shorter than the HTML Claude writes, but a chat in zamn still costs more than one in HTML: Claude has to read the rules first, and it thinks longer before writing a language it has seen only in those rules. Measured over six pages, each written and then edited six times in Claude Code, zamn with the [skill](/ai/skill) and a hook that validates every write cost 13% more than HTML. With Bash in both, as in a real session, the measured setup closest to the one that shipped cost 9% more. No chat left zamn that didn't compile.

## How it was measured

`docs:chats` (`docs/scripts/chat-stats.ts` in the repository) runs Claude Code with `claude -p` in an empty directory, one chat per page. The six pages are a landing page, a blog article and four Vue components: a signup form, an invoice table, dashboard cards and a todo app. Each chat has seven steps: write the page, then six edits (add a nav link, remove a logo, add a feature, …). The model is `claude-opus-5-5` at Claude Code's default effort, in Claude Code 2.1.319.

After each step the script checks the file: zamn must compile, HTML must parse, a Vue template must compile, and the text the prompt asked for must be there. Each setup ran every chat twice. The figures below are sums over the six pages of each page's mean, so "$1.10" is the cost of six chats of seven steps.

## Cost, not tokens

Claude Code reports `total_cost_usd`, its estimate at API list prices. For `claude-opus-5-5` these prices reproduce it exactly, for every step:

| Token | Per million | Relative |
|---|--:|--:|
| Input, uncached | $4.00 | 1× |
| Input, written to the cache | $8.00 | 2× |
| Input, read from the cache | $0.20 | 0.05× |
| Output, thinking included | $20.00 | 5× |

Every model call sends the whole conversation so far: system prompt, messages, tool calls and their results. Claude Code caches it, so a call writes what is new to the prompt cache (paying double for it once) and reads the rest back from it (at a twentieth of the price). About 94% of all input here was read from the cache. A token count would weigh a cached token like an output token, 100 times its price, so the comparison is in dollars.

## The first four setups

| Setup | Cost | vs HTML | Thinking, writing the page | Thinking, edits | Model calls |
|---|--:|--:|--:|--:|--:|
| HTML | $1.096 | | 966 | 527 | 85 |
| zamn, skill | $1.304 | +19% | 3,392 | 730 | 94 |
| zamn, skill, hook | $1.242 | +13% | 3,120 | 904 | 92 |
| zamn, skill, Bash `zamn` | $1.459 | +33% | 1,740 | 893 | 103 |

- **skill**: the zamn skill installed; Claude loads it itself.
- **hook**: a PostToolUse hook runs `zamn --validate` after every Write and Edit, says nothing when the file is valid and reports the errors when it isn't. The skill's check step says so.
- **Bash `zamn`**: Claude may run `zamn` in Bash and nothing else, and the skill tells it to validate the file itself.

The hook setup was the cheapest zamn. The overhead is front-loaded: +24% after writing the page, +13% after six edits, since the edits cost about the same in both languages.

## Where the extra cost goes

The hook setup's +$0.146 over HTML:

| What | Cost |
|---|--:|
| Input written to the cache | +$0.103 |
| Input read from the cache | +$0.047 |
| Thinking | +$0.051 |
| Other output | −$0.055 |
| **Total** | **+$0.146** |

The skill is the biggest part. Loading it is a tool call whose result, the skill's text, stays in the conversation: it is written to the cache once, then read by every later call of the chat. Thinking is the second part: about 2,500 tokens more over six chats, most of it while writing the page. The zamn files are 21–36% shorter in characters (Vue's script and style included), which saves output and takes back about a quarter of the rest.

## Can Claude think less?

Claude with Bash `zamn` thought about half as much while writing the page (1,740 against 3,120), with the same skill text otherwise. Thinking is output, the most expensive token, so this was worth understanding. Each experiment below changes the hook setup a little:

| Setup | What changed | Thinking, writing the page | Cost | vs HTML |
|---|---|--:|--:|--:|
| zamn, skill, hook | | 3,120 | $1.242 | +13% |
| … trusting the hook | the check step adds "no extra validation is needed: write the file in one go" | 2,711 | $1.233 | +12% |
| … shorter skill | the same, with the skill cut by 14%: no Prettier step, no converting HTML, no reason for the first step | 3,056 | $1.212 | +11% |
| … checking the hook | the check step says "Check the results of the `zamn --validate` hook" | 3,101 | $1.231 | +12% |
| … with Bash `zamn` | Bash may run `zamn`; the hook "has already checked the file" | 2,440 | $1.272 | +16% |
| HTML, Bash | HTML, with the Bash tool and every call denied | 1,117 | $1.167 | +6% |

The "checking the hook" setup has 9 chats; its run stopped before the rest.

Claude Code sends thinking blocks without their text, but it reports an estimate of their size for each model call. Recorded per call, all the thinking while writing a page was in the call that made the Write: none when loading the skill, none in the reply after it. Claude thinks while it composes the page, not when it checks it. That call thought about 240 tokens per chat with Bash `zamn`, against about 410 with the hook alone. A re-run of Bash `zamn` came out at 2,000, still lower than "checking the hook" in 12 of 13 comparisons.

Three wordings of the hook step thought about as much as each other. Bash alone, with HTML, didn't lower thinking. With the hook and Bash `zamn`, thinking dropped by 22% (lower in 20 of 24 run-against-run comparisons), although Claude never ran `zamn` in those chats. The explanation that fits all of it: Claude thinks less while composing when it can run the check itself, and a check it can't run, however worded, doesn't have that effect. With HTML there is nothing to check in its head either way. It is an inference: the thinking text isn't available to confirm it.

The shorter skill was the cheapest zamn setup, because less text sits in every call. Wording barely moved thinking.

## Why checking with Bash costs more

The Bash `zamn` setup thinks least and costs most. It never piped a template to `zamn` on stdin: 113 of its 134 Bash calls, over both runs, were `zamn --validate <file>`, with or without `&& echo OK`. Each check is a tool call Claude writes, about 100 tokens of output, and its call and result then stay in the conversation, written to the cache and read again by every later call. An edit with one Edit and one check cost about half a cent more than the same edit with the hook. On top of that, the Bash tool's description is read by every call: about 6 points of cost, measured with HTML and Bash denied.

The hook checks without a tool call. A valid file adds nothing to the conversation, so a passing check costs nothing.

With the hook and Bash `zamn`, the thinking saved about $0.015 over six chats, and the Bash tool's description cost about $0.04.

## The fair baseline

A real Claude Code session has Bash. Against HTML with Bash ($1.167):

| Setup | Cost | vs HTML, Bash |
|---|--:|--:|
| zamn, skill, hook, Bash `zamn` | $1.272 | +9% |
| zamn, skill, Bash `zamn`, no hook | $1.459 | +25% |

## Validity

No recorded chat left a file that didn't compile: the hook reported no errors, and the script never had to send one back. The steps that failed missed text the benchmark checks for, the same way in HTML and zamn: Claude wrote `icon-arrow-up` where the check looked for `IconArrowUp` (valid Vue either way), and split "Made with Vue" with a link.

## What shipped

The [Claude Code skill](/ai/skill) now comes with a hook, `zamn --hook`, a PostToolUse hook in `.claude/settings.json`. It validates every `.zamn` file Claude writes or edits, and the `<template lang="zamn">` of every `.vue` file, and reports errors and warnings, each with a code and a hint. It is silent when the file is valid.

The skill says the hook has already checked every write, and that Claude may run `zamn --validate` as well. Without a hook, it runs it once, after the last change. The skill dropped the Prettier step, the paragraph on converting HTML and the reason for its first step.

This combination is the sum of measured pieces: the hook, Bash `zamn` at hand and the shorter skill. It hasn't been measured as one setup yet. It will be the benchmark's new default against HTML.

## Caveats

- Two runs per setup. A single run varies by 100–1,300 thinking tokens on one page, so read thinking differences of a few hundred tokens as directions.
- One model, at one effort, in one version of Claude Code, on six pages.
- The costs are list prices. Whether a subscription's usage limits weigh token types the same way isn't published.
