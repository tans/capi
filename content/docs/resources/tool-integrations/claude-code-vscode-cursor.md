---
title: VS Code & Cursor
description: Wire Capi into VS Code and Cursor as an MCP server.
---

Both editors speak MCP, so the same server definition works in each. The only difference is which file you edit.

## Cursor

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "capi": {
      "command": "npx",
      "args": ["-y", "@capi.ai/mcp"],
      "env": { "CAPI_API_KEY": "capi_sk_live_..." }
    }
  }
}
```

Restart Cursor, then check **Settings → MCP** — `capi` should appear with a green dot and five tools.

## VS Code

VS Code reads `.vscode/mcp.json` in the workspace, which makes the setup shareable with the team:

```json
{
  "servers": {
    "capi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@capi.ai/mcp"],
      "env": { "CAPI_API_KEY": "capi_sk_live_..." }
    }
  }
}
```

VS Code prompts the first time a workspace server is used; approve it, and the tools become available in Copilot Chat's agent mode.

For a personal, cross-project install, use your user settings instead and keep the key out of the repository.

## Keeping the key out of git

`.vscode/mcp.json` is committed, so never inline the secret. Two safe patterns:

**Environment inheritance** — omit `env` entirely and have the server read `CAPI_API_KEY` from your shell:

```json
{
  "servers": {
    "capi": { "type": "stdio", "command": "npx", "args": ["-y", "@capi.ai/mcp"] }
  }
}
```

**Variable reference** — VS Code substitutes `${env:CAPI_API_KEY}` at launch:

```json
"env": { "CAPI_API_KEY": "${env:CAPI_API_KEY}" }
```

## Using it in the editor

With a file open, ask the agent:

> Generate a diagram-style image for this module's README, 1536x1024, and save it next to the file.

The agent reads the file for context, calls `generate`, and writes the asset into the repo.

## Scoping per workspace

A front-end workspace probably wants images only:

```json
"args": ["-y", "@capi.ai/mcp", "--modalities", "image", "--max-cost", "1"]
```

A video-heavy workspace can raise both limits. Because the config is per-repository, the constraint travels with the project.

## Troubleshooting

**No MCP panel entry.** The editor version may predate MCP support. Update it, and confirm the JSON parses — a trailing comma silently disables the whole file.

**Tools appear but calls fail.** The spawned process cannot see the key. Add an explicit `env` block temporarily to confirm, then switch back to inheritance.

**`npx` prompts for install.** The first run downloads the package. Run `npx -y @capi.ai/mcp --help` once in a terminal to warm the cache.

## Next steps

- [Claude Code](/docs/resources/tool-integrations/claude-code)
- [MCP server overview](/docs/resources/mcp)
