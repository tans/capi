---
title: LibreChat
description: Configure CAPI as a custom endpoint in LibreChat with model presets.
---

LibreChat supports multiple providers side by side and lets you define per-model presets — system prompts, temperature, and capabilities — which makes it a good fit for a multi-model catalog like CAPI's.

## Prerequisites

- LibreChat running from source or Docker.
- A CAPI API key.

## Configure

LibreChat reads a `librechat.yaml` file. Add a custom endpoint:

```yaml
version: 1.2.8

endpoints:
  custom:
    - name: "CAPI"
      apiKey: "${CAPI_API_KEY}"
      baseURL: "https://capi.minapp.xin/api/v1"
      models:
        default:
          - gpt-5.6
          - claude-opus-5
          - gemini-3.1-pro
          - deepseek-v4-flash
        fetch: false
      titleConvo: true
      titleModel: "gpt-5-mini"
      modelDisplayLabel: "CAPI"
```

Set `fetch: false` and list models explicitly. Auto-discovery returns the entire catalog, which produces an unwieldy dropdown; a curated list is easier to use and cheaper to run.

Mount the file when using Docker:

```bash
docker run -d \
  -e CAPI_API_KEY="capi_sk_live_..." \
  -v ./librechat.yaml:/app/librechat.yaml \
  -p 3080:3080 \
  ghcr.io/danny-avila/librechat:latest
```

## Model presets

Presets let each model carry its own defaults, so users do not have to know that `claude-opus-5` wants a different temperature than `deepseek-v4-flash`:

```yaml
      models:
        default:
          - gpt-5.6
          - claude-opus-5
        endpoints:
          - name: "claude-opus-5"
            label: "Opus 5 (careful)"
            preset:
              temperature: 0.2
              maxContextTokens: 180000
          - name: "gpt-5.6"
            label: "GPT-5.6 (fast)"
            preset:
              temperature: 0.7
```

## Title generation

LibreChat names conversations automatically. Point `titleModel` at something cheap and fast — `gpt-5-mini` or `deepseek-v4-flash` — so naming does not dominate your spend.

## Vision and files

Multimodal models accept image attachments without extra configuration. Enable file upload in `librechat.yaml` if you want documents passed to the model directly rather than through RAG.

## Balances and assistants

LibreChat's built-in balance API expects an OpenAI-style `/dashboard/billing` route, which CAPI does not implement. Disable balance display and check spend in the CAPI dashboard instead:

```yaml
interface:
  balance:
    enabled: false
```

## Troubleshooting

**Custom endpoint missing from the UI.** The YAML failed validation. LibreChat logs the parse error on boot — check the container logs.

**`${CAPI_API_KEY}` unresolved.** The variable is read at process start. Restart after exporting it, or hardcode for a local-only instance.

**Streaming cuts out.** Confirm the endpoint is `https`; a proxy stripping chunked transfer breaks SSE.

## Next steps

- [LLM API quickstart](/docs/guides/llm-api/quickstart)
- [Chatbox](/docs/resources/application-practices/chatbox)
