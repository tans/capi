---
title: Local MCP
description: Run the Capi MCP server as a local process and wire it into your agent.
---

The local MCP server runs on your machine, reads `CAPI_API_KEY` from the environment, and speaks MCP over stdio. It works everywhere, including environments where OAuth is impractical.

## Install

Nothing to install permanently — `npx` fetches and caches it:

```bash
export CAPI_API_KEY="capi_sk_live_..."
```

Confirm it starts:

```bash
npx -y @capi.ai/mcp --help
```

## Claude Code

```bash
claude mcp add capi -- npx -y @capi.ai/mcp
```

Or edit the config directly:

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

## Codex

```bash
codex mcp add capi -- npx -y @capi.ai/mcp
```

## Cursor

Add to `~/.cursor/mcp.json`:

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

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json` using the same shape as Cursor.

## VS Code

Add to `.vscode/mcp.json` in the workspace:

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

## Gemini CLI

```bash
gemini mcp add capi npx -y @capi.ai/mcp
```

## Zed

Add to `settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "capi": {
      "command": {
        "path": "npx",
        "args": ["-y", "@capi.ai/mcp"],
        "env": { "CAPI_API_KEY": "capi_sk_live_..." }
      }
    }
  }
}
```

## Avoiding a key on disk

Instead of inlining the secret, let the server read it from your shell environment and omit `env` entirely. On macOS the key stays in the keychain and is exported at shell start.

For CI, inject the key as a masked secret variable.

## Flags

| Flag | Purpose |
| --- | --- |
| `--modalities video,image` | Restrict tools to these modalities. |
| `--max-cost 5` | Refuse generations costing more than this per call. |
| `--no-wait` | Return task ids instead of blocking on completion. |

Flags go in the `args` array, after the package name:

```json
"args": ["-y", "@capi.ai/mcp", "--modalities", "image", "--max-cost", "1"]
```

## Verify

Ask the agent to list its Capi tools, or call `list_models` directly. If the tools are missing, the server failed to start — run `npx -y @capi.ai/mcp` manually and read stderr.

## Next steps

- [MCP overview](/docs/resources/mcp)
- [Hosted MCP](/docs/resources/mcp/hosted) — no local process needed.
