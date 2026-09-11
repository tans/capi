---
title: Claude Code
description: Give Claude Code the full Capi model catalog as MCP tools and skills.
---

Claude Code can drive Capi two ways: as an **MCP server** (tools it calls directly) or as an **Agent Skill** (a packaged workflow it loads on demand). Most teams install both.

## MCP server

```bash
claude mcp add capi -- npx -y @capi.ai/mcp
```

Verify the tools loaded:

```bash
claude mcp list
```

You should see `capi` connected with `list_models`, `get_model`, `generate`, `get_task`, and `get_balance`.

Then ask naturally, inside any project:

> Generate a 5-second video of a paper kite over a coastal town at sunrise, and put the URL in `assets/README.md`.

Claude Code calls `list_models`, picks a video model, calls `generate`, waits, and writes the file.

### Scoping the server

Limit what the agent can spend and reach by passing flags:

```bash
claude mcp add capi -- npx -y @capi.ai/mcp --modalities image,video --max-cost 2
```

### Project-level install

Commit the server to a repository so every contributor gets it:

```bash
claude mcp add capi --scope project -- npx -y @capi.ai/mcp
```

That writes `.mcp.json` at the repo root. Do **not** put the key in that file — let the server read `CAPI_API_KEY` from each developer's environment, and use a masked secret in CI.

## Agent Skill

Skills package the *workflow* around the models — brand tone, output sizes, where files go — so results are consistent across a team.

```bash
npx -y @capi.ai/skills add brand-imagery
```

Then invoke it:

```
/brand-imagery product hero for the spring launch
```

The skill pins the model, the aspect ratio, the prompt scaffold, and the output path. Model choice becomes a reviewable artifact instead of a per-developer decision.

## Which to use

| Need | Use |
| --- | --- |
| One-off generation while coding | MCP server |
| Repeatable output with house style | Agent Skill |
| Both | Install both — the skill calls the server's tools |

## Cost control

Claude Code retries tool calls when a step fails, which can multiply spend on video models. Two safeguards:

1. Pass `--max-cost` so a single call cannot exceed a threshold.
2. Set a monthly budget on the API key in **Settings → API Keys**.

The agent receives a clear `402` when a budget is exhausted and will typically report it rather than looping.

## Troubleshooting

**Tools missing after install.** Run `npx -y @capi.ai/mcp` on its own. A `command not found` for `npx` means Node is not on `PATH` for the shell Claude Code spawns.

**`401` on every call.** `CAPI_API_KEY` is not visible to the spawned process. Re-export it, or add an explicit `env` block to the server config.

**Generation hangs.** Video models can take minutes. If your agent has a short turn timeout, add `--no-wait` and poll with `get_task`.

## Next steps

- [MCP server overview](/docs/resources/mcp)
- [VS Code and Cursor](/docs/resources/tool-integrations/claude-code-vscode-cursor)
- [GitHub Actions](/docs/resources/tool-integrations/claude-code-github-actions)
