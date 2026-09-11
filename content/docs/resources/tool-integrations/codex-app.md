---
title: Codex App
description: Connect the Codex desktop and CLI to Capi over MCP.
---

Codex reaches Capi through the same MCP server as every other agent, so setup is one command.

## Register the server

```bash
codex mcp add capi -- npx -y @capi.ai/mcp
```

Confirm it is registered:

```bash
codex mcp list
```

## Configure manually

Codex reads `~/.codex/config.toml`. Add a server block:

```toml
[mcp_servers.capi]
command = "npx"
args = ["-y", "@capi.ai/mcp"]
env = { CAPI_API_KEY = "capi_sk_live_..." }
```

Prefer letting the server inherit the key from your environment — omit `env` and export `CAPI_API_KEY` in your shell profile — so the secret is not written to a config file.

For a remote setup, point Codex at the hosted server instead:

```toml
[mcp_servers.capi]
url = "https://mcp.capi.ai/mcp"
```

## Use it

Inside a Codex session:

> Create three icon concepts for a weather app in a flat two-colour style, save them to `public/icons/`, and list the model you used.

Codex will call `list_models`, choose an image model, generate, download, and report back.

## Working with media in a repo

Because `generate` returns URLs, tell Codex where things belong:

```text
Generate a hero image (1536x1024, gpt-image-2-text-to-image) for the docs landing
page and save it as public/hero.png. Reference the model id in a comment in
content/docs/index.md.
```

Being explicit about size, model, and destination keeps output reproducible and avoids re-runs.

## Restricting the surface

```toml
[mcp_servers.capi]
command = "npx"
args = ["-y", "@capi.ai/mcp", "--modalities", "image", "--max-cost", "1"]
```

Useful in repositories where you only want design assets, not video spend.

## Troubleshooting

**Server shows as failed.** Run the command manually with `npx -y @capi.ai/mcp` and read stderr. A missing `CAPI_API_KEY` is the most common cause.

**`command not found: npx`.** Codex spawns a login shell that may not have Node on `PATH`. Set an absolute path in `command`, for example `/usr/local/bin/npx`.

**Tool results look truncated.** Large JSON responses may be elided by the agent's own display limits. Ask for the specific field, for example the output URL only.

## Next steps

- [MCP server overview](/docs/resources/mcp)
- [Local MCP](/docs/resources/mcp/local) — config snippets for other clients.
