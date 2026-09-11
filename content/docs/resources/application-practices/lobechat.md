---
title: LobeChat
description: Deploy LobeChat against Capi as an OpenAI-compatible provider.
---

LobeChat is a web-based chat client with a plugin system and strong model switching. Because it reads the OpenAI schema, Capi works as a custom provider with no code changes.

## Prerequisites

- LobeChat running locally or deployed.
- A Capi API key.

## Configure in the UI

1. Open **Settings → Language Model**.
2. Under **OpenAI**, set:

| Field | Value |
| --- | --- |
| API Key | `capi_sk_live_...` |
| API Proxy Address | `https://capi.ai/api/v1` |
| Model List | `gpt-5.6,claude-opus-5,gemini-3.1-pro,deepseek-v4-flash` |

3. Save, then enable the models you want visible in the chat picker.

## Configure with environment variables

For a deployment, set these on the container:

```bash
docker run -d \
  -p 3210:3210 \
  -e OPENAI_API_KEY="capi_sk_live_..." \
  -e OPENAI_PROXY_URL="https://capi.ai/api/v1" \
  -e OPENAI_MODEL_LIST="gpt-5.6,claude-opus-5,gemini-3.1-pro" \
  -e ENABLED_OPENAI="1" \
  lobehub/lobe-chat
```

`OPENAI_MODEL_LIST` accepts `+` and `-` prefixes to add or hide entries, which is the quickest way to trim the default list.

## Background model

LobeChat runs helper tasks — topic naming, summaries — on a background model. Pin it to something cheap so it does not inflate spend:

```bash
-e OPENAI_MODEL_LIST="gpt-5.6,-all,+gpt-5-mini"
```

Set the topic-naming model explicitly under **Settings → Service Model**, choosing `gpt-5-mini` or `deepseek-v4-flash`.

## Streaming and proxies

If you deploy behind a reverse proxy, disable response buffering for the chat route. An Nginx default of `proxy_buffering on` collects the whole SSE stream before forwarding, which makes token streaming appear to hang and then arrive at once:

```nginx
location /api/chat {
    proxy_pass http://lobe-chat:3210;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

## Plugins

LobeChat's function-calling plugins work with Capi models that support tool use. If a plugin silently fails, switch to a model with stronger function calling — `gpt-5.6` and `claude-opus-5` are the most reliable in the catalog.

## Troubleshooting

**Models do not appear.** The proxy address is missing `/v1`. LobeChat concatenates the path itself.

**Topic names are nonsense.** The background model is a weak or mismatched one. Pin it explicitly as above.

**`429` under load.** Per-key rate limits apply. Issue a second key and split traffic, or raise limits on a Team plan.

## Next steps

- [NextChat](/docs/resources/application-practices/nextchat)
- [LLM API quickstart](/docs/guides/llm-api/quickstart)
