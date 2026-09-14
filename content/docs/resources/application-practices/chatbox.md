---
title: Chatbox
description: Add CAPI as a custom OpenAI-compatible provider in Chatbox.
---

Chatbox is a desktop and mobile chat client with a simple custom-provider form. Setup takes under a minute.

## Prerequisites

- Chatbox installed.
- A CAPI API key.

## Configure

1. Open **Settings → Model**.
2. Choose **Add Custom Provider**.
3. Set **API Mode** to `OpenAI API Compatible`.
4. Fill in:

| Field | Value |
| --- | --- |
| Name | `CAPI` |
| API Host | `https://capi.ai/api/v1` |
| API Path | `/chat/completions` |
| API Key | `capi_sk_live_...` |
| Model | `gpt-5.6` |

5. Click **Check** to validate. A green result means the endpoint and key are correct.

Add more models by repeating the model entry — Chatbox keeps them under one provider, so switching is a dropdown change rather than a settings edit.

## Suggested models

| Use | Model ID |
| --- | --- |
| Everyday chat | `gpt-5.6` |
| Long documents | `gemini-3.1-pro` |
| Careful reasoning | `claude-opus-5` |
| Cheapest bulk work | `deepseek-v4-flash` |
| Vision | `gemini-3.1-flash` |

## Image input

Attach an image and pick a multimodal model. Chatbox sends it as a content array; if the model does not support vision you get a `400` explaining the unsupported content type.

## Sync across devices

Chatbox's paid sync carries provider settings between desktop and mobile, so the API key is stored by the sync service. On a shared machine, prefer a key scoped narrowly and rotated periodically.

## Web search and tools

Chatbox's built-in tools (web search, URL fetch) run client-side and are separate from the model. CAPI models with native tool calling work, but Chatbox's own tools do not depend on them.

## Troubleshooting

**"Check" fails with `404`.** API Host must end at `/v1`, with `/chat/completions` in the path field — not concatenated into the host.

**Replies are empty.** Some models return reasoning in a separate field. Disable any "show reasoning only" option, or switch model.

**Slow streaming.** Chatbox buffers by default. Lower the stream buffer setting, or test the same key with cURL to confirm the endpoint itself is fast:

```bash
curl https://capi.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $CAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

## Next steps

- [Cherry Studio](/docs/resources/application-practices/cherry-studio)
- [LLM API quickstart](/docs/guides/llm-api/quickstart)
