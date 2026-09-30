---
title: NextChat
description: Point NextChat (ChatGPT-Next-Web) at CAPI with environment variables.
---

NextChat is a lightweight, self-hostable chat UI. It speaks the OpenAI schema, so it accepts CAPI through the standard base-URL and key variables.

## Prerequisites

- NextChat deployed (Vercel, Docker, or local dev).
- A CAPI API key.

## Docker

```bash
docker run -d \
  -p 3000:3000 \
  -e OPENAI_API_KEY="capi_sk_live_..." \
  -e BASE_URL="https://capi.minapp.xin/api/v1" \
  -e CUSTOM_MODELS="gpt-5.6,claude-opus-5,gemini-3.1-pro,deepseek-v4-flash" \
  -e DEFAULT_MODEL="gpt-5.6" \
  yidadaa/chatgpt-next-web
```

`BASE_URL` is the important one — without it NextChat talks to OpenAI's own endpoint.

## Vercel

Add the same variables under **Project → Settings → Environment Variables**, then redeploy. Environment changes need a new deployment to take effect.

## In-app settings

Users can override the endpoint per browser under **Settings**:

- **API Key** — their own CAPI key, if you do not want to share one.
- **Custom Endpoint** — `https://capi.minapp.xin/api/v1`.
- **Custom Models** — comma-separated IDs.

Per-user keys keep usage attributable, which matters when several people share an instance.

## Model list

NextChat does not discover models. Curate the list to what the deployment needs:

| Model ID | Why |
| --- | --- |
| `gpt-5.6` | Balanced default. |
| `claude-opus-5` | Long-form reasoning. |
| `gemini-3.1-pro` | Long context and vision. |
| `deepseek-v4-flash` | Cheapest option for simple turns. |

## Masks and templates

NextChat's prompt templates are client-side, so they compose with any model. A mask that sends a large system prompt costs more per turn — `deepseek-v4-flash` or `gpt-5-mini` keeps template-heavy usage affordable.

## Access control

For a private instance, set `CODE` to require an access code before the UI is usable:

```bash
-e CODE="$(openssl rand -hex 8)"
```

This protects the chat UI, not the API key. Treat the key as the real boundary and scope it accordingly.

## Troubleshooting

**`401` from the browser.** The key is set in the deployment but the user overrode it with an empty value. Clear the per-user setting.

**Model not in the dropdown.** `CUSTOM_MODELS` must list exact catalog IDs.

**Responses stop mid-stream.** A reverse proxy is buffering. Disable `proxy_buffering` for the API route, or raise `proxy_read_timeout`.

## Next steps

- [Jan](/docs/resources/application-practices/jan)
- [LLM API quickstart](/docs/guides/llm-api/quickstart)
