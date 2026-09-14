---
title: CC Switch
description: Switch coding agents between CAPI and other providers with one profile change.
---

CC Switch is a small profile manager for coding agents. Instead of editing config files per machine, you define named profiles and switch the active one.

That makes CAPI easy to adopt incrementally: keep your existing provider as one profile, add CAPI as another, and move over without unpicking anyone's local setup.

## Install

```bash
npx -y cc-switch --help
```

## Define a profile

```bash
cc-switch add capi \
  --base-url https://capi.ai/api/v1 \
  --api-key "$CAPI_API_KEY" \
  --models "gpt-5.6,claude-opus-5,gemini-3.1-pro"
```

`--models` narrows which models the agent offers, which keeps model pickers short and prevents accidental calls to expensive video models during a coding session.

## Activate

```bash
cc-switch use capi
cc-switch status
```

Switching rewrites the client config in place, so the next agent invocation picks up the new endpoint and key.

## Common layout

A typical setup keeps three profiles:

| Profile | Points at | Purpose |
| --- | --- | --- |
| `default` | Your existing provider | Unchanged day-to-day work. |
| `capi` | `https://capi.ai/api/v1` | Multi-modality work and cost comparison. |
| `local` | `http://localhost:11434/v1` | Offline or sensitive prompts. |

Because CAPI is OpenAI-compatible, the `capi` profile is a base URL and key change — no client code changes.

## Per-project override

Commit a project-level profile so a repository always uses CAPI regardless of the developer's global setting:

```bash
cc-switch add capi-project \
  --base-url https://capi.ai/api/v1 \
  --scope project
```

The key still comes from the environment, so nothing secret is committed.


## Verifying a switch

Confirm the active endpoint and that a request succeeds:

```bash
cc-switch status
curl https://capi.ai/api/v1/me/balance \
  -H "Authorization: Bearer $CAPI_API_KEY"
```

If balance returns but the agent still errors, the client is caching its config — restart it.

## Next steps

- [LLM API quickstart](/docs/guides/llm-api/quickstart) — base URL and protocol details.
