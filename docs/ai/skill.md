# Claude Code skill

A [skill](https://code.claude.com/docs/en/skills) that teaches Claude Code to write zamn, and a hook that checks every file it writes. Claude loads the skill on its own when a task touches `.zamn` files or `<template lang="zamn">`.

## Install the skill

For one project, commit it to the repository:

```sh
mkdir -p .claude/skills/zamn
curl -fsSL https://zeokku.github.io/zamn/downloads/SKILL.md -o .claude/skills/zamn/SKILL.md
```

For all your projects, put it in `~/.claude/skills/zamn/SKILL.md` instead. Claude Code picks up new skills while it runs; if this one doesn't show up, run `/reload-skills`. You can also call it yourself with `/zamn`.

The frontmatter uses only `name`, `description` and `license`, so the same file can be uploaded as a skill on claude.ai or through the Skills API.

<a href="/zamn/downloads/SKILL.md" download>Download SKILL.md</a>

## Add the hook

After every write and edit, Claude Code runs `zamn --hook`, which checks the file it wrote: a `.zamn` file, or the `<template lang="zamn">` of a `.vue` file. A valid file gets no output, so a check that passes costs no tokens. Errors and warnings go to Claude, each with a code and a hint, and Claude fixes them.

It needs the `zamn` command:

```sh
cargo install zamn
```

Then add the hook to `.claude/settings.json` in the project, or to `~/.claude/settings.json` for all your projects. If the file has hooks already, add this one to its `PostToolUse` list:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "zamn --hook" }]
      }
    ]
  }
}
```

The skill expects the hook: without it, Claude doesn't check what it writes. The [agent rules](./rules), for agents without hooks, have it run `zamn --validate` itself.

## The skill

<<< ../../skills/zamn/SKILL.md
