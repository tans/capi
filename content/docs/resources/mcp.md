---
title: MCP Server
description: Give coding agents access to 240+ models through the Model Context Protocol.
---

The Capi MCP server turns the whole model catalog into tools that any MCP-capable agent can call. Ask your agent for a video and it generates one, without a custom integration.

## What it exposes

| Tool | Purpose |
| --- | --- |
| `list_models` | Search the catalog by modality, provider, or capability. |
| `get_model` | Full parameter schema and pricing for one model. |
| `generate` | Create a generation task and wait for the result. |
| `get_task` | Poll an async task. |
| `get_balance` | Read the remaining credit balance. |

`generate` blocks until the media is ready and returns the file URL, which most agents can then pass straight into a follow-up step.

## Two ways to connect

- **Hosted MCP** — nothing to install. The agent talks to `https://mcp.capi.ai/mcp` and authenticates over OAuth.
- **Local MCP** — runs `npx -y @capi.ai/mcp` as a child process and reads `CAPI_API_KEY` from the environment. Better for air-gapped setups and CI.

See [Hosted MCP](/docs/resources/mcp/hosted) and [Local MCP](/docs/resources/mcp/local) for setup per client.

## Example prompts

Once connected, these all work without extra configuration:

- "Generate a 5-second video of a paper kite over a coastal town at sunrise, then save the URL."
- "What's the cheapest model that can do image-to-video?"
- "Create three logo concepts in a flat vector style and describe each one."
- "Transcribe this audio file and summarise the action items."

## Permissions

The MCP server acts with the permissions of the API key it is given. Scope the key to exactly what you want the agent to do — for example `video.generate` and `image.generate` only — so a misread instruction cannot touch the LLM surface or your billing settings.

## Practical notes

**Cost awareness.** Agents retry. Tell the agent your budget in its system prompt, and set a key-level budget as a hard stop.

**Long tasks.** Video generation can take minutes. The `generate` tool polls internally and reports progress, but agents with aggressive turn timeouts may prefer `--no-wait` semantics via `get_task`.

**Output handling.** Results are URLs, not bytes. If the agent needs to inspect the output, it fetches the URL as a normal resource.

## Next steps

- [Hosted MCP](/docs/resources/mcp/hosted) — OAuth, no local install.
- [Local MCP](/docs/resources/mcp/local) — per-client setup snippets.
- [Claude Code integration](/docs/resources/tool-integrations/claude-code)
