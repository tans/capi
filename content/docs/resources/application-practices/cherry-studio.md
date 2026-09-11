---
title: Cherry Studio
description: Use Capi as a provider in Cherry Studio with assistants and knowledge bases.
---

Cherry Studio is a desktop client built around providers, assistants, and knowledge bases. Capi plugs in as an OpenAI-compatible provider, and its multi-modality makes the drawing and translation features usable from one key.

## Prerequisites

- Cherry Studio installed.
- A Capi API key.

## Add the provider

1. Open **Settings → Model Providers**.
2. Click **Add Provider** and choose the OpenAI-compatible type.
3. Fill in:

| Field | Value |
| --- | --- |
| Provider Name | `Capi` |
| API Host | `https://capi.ai/api/v1` |
| API Key | `capi_sk_live_...` |

4. Click **Manage** next to the provider to add model IDs.

Cherry Studio does not auto-discover models, so add the ones you plan to use. The full list is in the [catalog](/models).

## Group models by task

Cherry Studio shows one model list, so name models meaningfully when you add them:

| Display name | Model ID | Use |
| --- | --- | --- |
| GPT-5.6 | `gpt-5.6` | Default assistant |
| Opus 5 | `claude-opus-5` | Deep analysis |
| Gemini Pro | `gemini-3.1-pro` | Long context, vision |
| DeepSeek Flash | `deepseek-v4-flash` | Bulk, cheap |

## Assistants

Create an assistant per recurring task and pin the model plus a system prompt:

- **Release notes writer** — `claude-opus-5`, temperature 0.3.
- **Commit message helper** — `deepseek-v4-flash`, temperature 0.
- **Screenshot describer** — `gemini-3.1-flash`, vision enabled.

Pinning both model and prompt is what makes output consistent run to run.

## Knowledge bases

Cherry Studio embeds documents with the provider you select. Point embeddings at Capi too:

- Embedding model: `text-embedding-4-large`
- Keep this model fixed for the life of the knowledge base.

Cherry Studio also ships a local embedding option. Choose one and stay with it — mixing embedders across a single knowledge base degrades retrieval quality.

## Image generation

The drawing panel accepts a custom provider. Set it to Capi with model `gpt-image-2-text-to-image` or `seedream-5-text-to-image`, and images are written to your local library.

## Troubleshooting

**Provider test fails.** Cherry Studio appends `/chat/completions` to the host. The host must therefore end in `/v1` with no trailing slash.

**Model produces an error on send.** The model ID is not available to your key — video models, for example, are not reachable through the chat route.

**Knowledge base returns nothing.** Re-index after changing the embedding model, and confirm the provider is not rate-limited.

## Next steps

- [LobeChat](/docs/resources/application-practices/lobechat)
- [AnythingLLM](/docs/resources/application-practices/anythingllm)
