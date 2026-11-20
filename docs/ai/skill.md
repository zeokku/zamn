# Claude Code skill

A [skill](https://code.claude.com/docs/en/skills) that teaches Claude Code to write
zamn, check it with the compiler and format it with Prettier. Claude loads it on its
own when a task touches `.zamn` files or `<template lang="zamn">`.

## Install

For one project, commit it to the repository:

```sh
mkdir -p .claude/skills/zamn
curl -fsSL https://zeokku.github.io/zamn/downloads/SKILL.md -o .claude/skills/zamn/SKILL.md
```

For all your projects, put it in `~/.claude/skills/zamn/SKILL.md` instead. Claude
Code picks up new skills while it runs; if this one doesn't show up, run
`/reload-skills`. You can also call it yourself with `/zamn`.

The frontmatter uses only `name`, `description` and `license`, so the same file can
be uploaded as a skill on claude.ai or through the Skills API.

<a href="/zamn/downloads/SKILL.md" download>Download SKILL.md</a>

## The skill

<<< ../../skills/zamn/SKILL.md
