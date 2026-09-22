---
title: Open WebUI
description: Point Open WebUI at CAPI for chat, vision, and image generation.
---

Open WebUI is a self-hosted chat interface with an OpenAI-compatible backend. CAPI slots in as a drop-in provider, which means one config change gives you Claude, GPT, Gemini, DeepSeek, and the whole catalog in one picker.

## Prerequisites

- A running Open WebUI instance (Docker or bare metal).
- A CAPI API key from **Settings → API Keys**.

## Configure with Docker

Pass the settings as environment variables:

```bash
docker run -d \
  -p 3000:8080 \
  -e OPENAI_API_BASE_URL="https://capi.minapp.xin/api/v1" \
  -e OPENAI_API_KEY="capi_sk_live_..." \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

Restart the container after changing them.

## Configure in the UI

If the instance is already running:

1. Open **Admin Settings → Connections**.
2. Under **OpenAI API**, set the base URL to `https://capi.minapp.xin/api/v1`.
3. Paste the API key.
4. Click the refresh icon next to the URL to import the model list.

Every model your key can reach appears in the model dropdown.

## Verify

Send a message. If it fails:

- **`401`** — the key is wrong or has a trailing newline from copy-paste.
- **Empty model list** — the base URL is missing `/v1`. Open WebUI appends `/models` directly.
- **Connection refused** — the container cannot reach the internet; check its DNS.

## Image generation

Open WebUI's image tool calls `POST /v1/images/generations`, which CAPI serves directly:

1. **Admin Settings → Images**.
2. Enable image generation.
3. Choose an engine with the same base URL and key.
4. Set the model, for example `gpt-image-2-text-to-image`.

Images then render inline in chat.

## Mixing providers

Keep your local Ollama models alongside CAPI: add both connections and both model lists merge into one picker. Route sensitive prompts to the local models and everything else to CAPI.

## Cost visibility

Open WebUI does not track spend. Check the CAPI dashboard under **Usage**, or set a monthly budget on the key so a runaway conversation cannot overspend.

## Tips

- Disable models you do not want offered, rather than leaving a 240-entry dropdown.
- For team deployments, use a separate CAPI key per user group so usage is attributable.
- Vision models work out of the box — attach an image and pick a multimodal model such as `gemini-3.1-pro`.

## Next steps

- [LLM API quickstart](/docs/guides/llm-api/quickstart)
- [AnythingLLM](/docs/resources/application-practices/anythingllm)
