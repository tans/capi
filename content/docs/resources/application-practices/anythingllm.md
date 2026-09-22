---
title: AnythingLLM
description: Add CAPI as a model provider and embedding backend in AnythingLLM.
---

AnythingLLM is a desktop and self-hosted RAG workspace. You configure CAPI twice: once as a chat provider, once as the embedding backend for document retrieval.

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
| Chat Model Name | `gpt-5.6` (or any catalog model ID) |

4. Save. AnythingLLM lists the model in each workspace's settings.

Use the exact model ID from the [catalog](/models?modality=text). AnythingLLM does not discover models automatically, so a typo surfaces as a `404` on the first message.

## Embeddings

Retrieval needs an embedding model, and it must stay the same for the life of a vector store — changing it invalidates every existing embedding.

1. Open **Settings → Embedder**.
2. Select **Generic OpenAI**.
3. Set the base URL and key as above.
4. Set the model to `text-embedding-4-large` or `text-embedding-4-small`.

> Pick the embedder **before** uploading documents. Switching later requires re-embedding the whole workspace.

## Vector database

AnythingLLM's built-in LanceDB is fine to start. For larger corpora, point it at a dedicated store such as Chroma or Qdrant and keep CAPI as the embedder only.

## Docker

```bash
docker run -d \
  -p 3001:3001 \
  -e LLM_PROVIDER="generic-openai" \
  -e GENERIC_OPEN_AI_BASE_PATH="https://capi.minapp.xin/api/v1" \
  -e GENERIC_OPEN_AI_API_KEY="capi_sk_live_..." \
  -e GENERIC_OPEN_AI_MODEL_PREF="gpt-5.6" \
  -e EMBEDDING_ENGINE="generic-openai" \
  -e GENERIC_OPEN_AI_EMBEDDING_MODEL_PREF="text-embedding-4-large" \
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

**`model_not_found` on chat.** The model ID does not exist for your key. Copy it from the catalog rather than typing it.

**Slow first response.** Embedding a new document blocks the first query. Wait for the workspace to finish indexing.

## Next steps

- [List Models](/docs/api/models/list)
- [LibreChat](/docs/resources/application-practices/librechat)
