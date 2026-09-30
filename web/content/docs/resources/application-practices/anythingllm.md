---
title: AnythingLLM
description: Add CAPI as a chat provider in AnythingLLM.
---

AnythingLLM is a desktop and self-hosted RAG workspace. Configure CAPI as a chat provider. CAPI does not currently expose an embeddings endpoint, so select a separate embedding provider in AnythingLLM.

## Prerequisites

- AnythingLLM installed (desktop app or Docker).
- A CAPI API key.

## Chat provider

1. Open **Settings → LLM Preference**.
2. Select **Generic OpenAI**.
3. Fill in:

| Field | Value |
| --- | --- |
| Base URL | `https://capi.minapp.xin/api/v1` |
| API Key | `capi_sk_live_...` |
| Chat Model Name | `gpt-5.6` (or any text model enabled for the workspace) |

4. Save. AnythingLLM lists the model in each workspace's settings.

Use the exact model ID from the [catalog](/models?modality=text). AnythingLLM does not discover models automatically, so a typo surfaces as a `404` on the first message.

## Embeddings

Choose an embedding provider that implements its own embeddings endpoint. Do not point the embedder at CAPI yet.

## Vector database

AnythingLLM's built-in LanceDB is fine to start. For larger corpora, point it at a dedicated store such as Chroma or Qdrant.

## Docker

```bash
docker run -d \
  -p 3001:3001 \
  -e LLM_PROVIDER="generic-openai" \
  -e GENERIC_OPEN_AI_BASE_PATH="https://capi.minapp.xin/api/v1" \
  -e GENERIC_OPEN_AI_API_KEY="capi_sk_live_..." \
  -e GENERIC_OPEN_AI_MODEL_PREF="gpt-5.6" \
  -v anythingllm:/app/server/storage \
  --name anythingllm \
  mintplexlabs/anythingllm
```

## Model choice for RAG

Long-context models handle retrieved chunks best. Good starting points:

- `gemini-3.1-pro` — 1M context, cheap enough for large workspaces.
- `claude-opus-5` — strongest reasoning over dense documents.
- `deepseek-v4-flash` — lowest cost for high-volume Q&A.

## Troubleshooting

**Documents upload but answers ignore them.** The embedder failed silently. Re-embed the workspace and watch the server log.

**`model_not_found` on chat.** The model ID is not enabled for your key. Copy it from `GET /v1/models` rather than typing it.

**Slow first response.** Embedding a new document blocks the first query. Wait for the workspace to finish indexing.

## Next steps

- [List Models](/docs/api/models/list)
- [LibreChat](/docs/resources/application-practices/librechat)
