---
title: LLM API Quickstart
description: Call Capi language models through a supported synchronous or streaming protocol.
---

Language models are synchronous: you send a request and get the answer back in the same connection. Capi exposes each provider's native shape, so existing clients work by changing the base URL.

## Pick a protocol

You only need one, and it should match the client you already use:

| Protocol | Base path | Use when |
| --- | --- | --- |
| OpenAI Chat Completions | `/v1/chat/completions` | You already use the OpenAI SDK or a compatible client. |
| OpenAI Responses | `/v1/responses` | You want reasoning items, built-in tools, and server-side state. |
| Anthropic Messages | `/v1/messages` | Your code targets Claude's native schema. |
| Gemini generateContent | `/v1beta/models/{model}:generateContent` | You use the Google GenAI SDKs. |

Any model in the catalog can be addressed through any of these routes where the provider supports it.

## OpenAI-compatible request

```bash
curl https://capi.ai/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "messages": [
      { "role": "system", "content": "You are a concise assistant." },
      { "role": "user", "content": "Explain task queues in two sentences." }
    ]
  }'
```

Because the schema matches OpenAI, the official SDK works unchanged:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://capi.ai/api/v1",
    api_key="YOUR_API_TOKEN",
)

response = client.chat.completions.create(
    model="claude-opus-5",
    messages=[{"role": "user", "content": "Explain task queues."}],
)

print(response.choices[0].message.content)
```

Note the model: `claude-opus-5` through the OpenAI-compatible route. Model choice and protocol are independent.

## Streaming

Set `stream: true` to receive server-sent events. Capi forwards provider deltas without buffering, so time-to-first-token matches the upstream provider.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://capi.ai/api/v1",
  apiKey: process.env.CAPI_API_KEY,
});

const stream = await client.chat.completions.create({
  model: "gpt-5.6",
  messages: [{ role: "user", content: "Write a haiku about tides." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## Tool calling

Tool and function definitions pass through to the provider. The response carries `tool_calls`, and you send results back as `role: "tool"` messages, exactly as with OpenAI:

```json
{
  "model": "gpt-5.6",
  "messages": [{ "role": "user", "content": "What's the weather in Lisbon?" }],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Look up current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": { "city": { "type": "string" } },
          "required": ["city"]
        }
      }
    }
  ]
}
```

## Choosing a model

Pricing and context windows differ by an order of magnitude across the catalog, so route deliberately:

- **Reasoning and long context** — `claude-opus-5`, `gpt-5.6-sol`, `gemini-3.1-pro`
- **Balanced production default** — `gpt-5.6`, `claude-sonnet-5`, `gemini-3.1-flash`
- **High-volume, low-cost** — `deepseek-v4-flash`, `glm-5-air`, `gpt-5-mini`

The full list, with per-token pricing, is in the [model catalog](/models?modality=text).

## Usage accounting

Every response reports token usage, and the settled cost is available on the same request in the dashboard:

```json
{
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 118,
    "total_tokens": 160
  }
}
```

## Next steps

- [Chat Completions reference](/docs/api/openai/chat-completions)
- [Anthropic Messages reference](/docs/api/anthropic/messages)
- [Authentication](/docs/guides/authentication) — key scoping and rate limits.
