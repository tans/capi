---
title: CLI
description: Run Capi models from your terminal with JSON-first output.
---

The CLI mirrors the SDK surface and is built to be scripted: every command accepts `--json` and emits machine-readable output on stdout, with human-facing noise on stderr.

## Install

```bash
npm install -g @capi.ai/cli
# or run without installing
npx @capi.ai/cli --help
```

## Authenticate

```bash
capi auth login          # opens the browser, stores the key in the OS keychain
capi auth status         # shows the active account and balance
```

For CI, set `CAPI_API_KEY` instead — the CLI prefers the environment variable over stored credentials.

## Generate

```bash
capi video generate \
  --model kling-v3-turbo-text-to-video \
  --prompt "A paper kite above a coastal town at sunrise" \
  --duration 5 \
  --output kite.mp4
```

`--output` downloads the result once the task completes, so a single command goes from prompt to file.

```bash
capi image generate \
  --model gpt-image-2-text-to-image \
  --prompt "A minimal poster for a night train" \
  --size 1024x1024 \
  --output poster.png
```

## Async control

By default `generate` waits for completion. Use the task commands to split the flow:

```bash
TASK=$(capi video generate --model veo-3.1-text-to-video \
  --prompt "harbour at dawn" --no-wait --json | jq -r .task_id)

capi tasks get "$TASK" --wait --output dawn.mp4
```

## Inspect the catalog

```bash
capi models list                       # every model
capi models list --modality video      # filter
capi models show kling-v3-turbo-text-to-video
```

```bash
capi models search "text to music" --json | jq '.[].id'
```

## Account

```bash
capi account balance
capi account usage --since 2026-03-01 --group-by model
capi keys list
```

## Scripting

Because stdout is always valid JSON under `--json`, the CLI composes with `jq`, `xargs`, and shell loops:

```bash
# Generate one hero image per product, four at a time.
cat products.txt | xargs -P4 -I{} sh -c '
  capi image generate \
    --model seedream-5-text-to-image \
    --prompt "studio photo of {}" \
    --output "out/{}.png"
'
```

Exit codes are meaningful: `0` success, `1` request error, `2` task failed, `3` authentication problem — so `set -e` behaves correctly in scripts.

## Configuration

| Flag | Environment variable | Purpose |
| --- | --- | --- |
| `--api-key` | `CAPI_API_KEY` | Credential. |
| `--base-url` | `CAPI_BASE_URL` | Point at a proxy. |
| `--json` | `CAPI_JSON=1` | Machine-readable output. |
| `--timeout` | `CAPI_TIMEOUT` | Per-request timeout in seconds. |

## Next steps

- [SDKs](/docs/resources/sdks) — the same surface in your language.
- [MCP server](/docs/resources/mcp) — hand the CLI's job to a coding agent.
