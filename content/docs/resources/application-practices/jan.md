---
title: Jan
description: Use Capi as a remote provider inside Jan alongside local models.
---

Jan is an open-source desktop client designed to run models locally. It also supports remote OpenAI-compatible providers, which lets you keep private work on-device and route everything else through Capi.

## Prerequisites

- Jan installed.
- A Capi API key.

## Add Capi

1. Open **Settings → Model Providers**.
2. Choose **OpenAI** (or add a custom provider if your build supports it).
3. Set:

| Field | Value |
| --- | --- |
| Base URL | `https://capi.ai/api/v1` |
| API Key | `capi_sk_live_...` |

4. Add model IDs manually, for example `gpt-5.6`, `claude-opus-5`, `gemini-3.1-pro`.

Jan lists remote and local models in the same picker, so switching between them is a dropdown change.

## Choosing where a prompt runs

A practical split:

- **Local (privacy)** — anything containing customer data, credentials, or internal documents.
- **Capi (capability)** — long-context analysis, multimodal input, and tasks where a frontier model clearly wins.
- **Capi (cost)** — high-volume simple turns where a small hosted model is cheaper than the electricity for a local one.

Because both appear in one picker, the decision stays a per-conversation choice rather than a configuration change.

## Model selection

| Task | Model |
| --- | --- |
| Quick drafting | `deepseek-v4-flash` |
| Reasoning and review | `claude-opus-5` |
| Long documents, images | `gemini-3.1-pro` |
| General default | `gpt-5.6` |

## Offline fallback

Jan works without a network when pointed at local models only. If you travel or lose connectivity, the remote provider simply errors while local models keep working — no reconfiguration needed.

## Assistant templates

Jan's assistants bundle a model with a system prompt. Attach a Capi model to an assistant when you want consistent remote behaviour, and leave the default local model for ad-hoc chat.

## Troubleshooting

**Provider shows no models.** Jan requires explicit model IDs for remote providers; it does not fetch a list.

**Requests time out.** Local model threads may be saturating the machine. Reduce local concurrency, or switch the conversation to a remote model.

**Key rejected after working previously.** The key may have been rotated. Update it in the provider settings.

## Next steps

- [LLM API quickstart](/docs/guides/llm-api/quickstart)
- [SDKs](/docs/resources/sdks) — move the same calls into your own application.
