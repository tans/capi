---
title: LLM API Quickstart
description: Call CAPI language models through a supported synchronous or streaming protocol.
---

Language model requests are synchronous: you send a request and get the answer back in the same connection. CAPI supports OpenAI Chat Completions, the OpenAI Responses request and response format, and Anthropic Messages. Requests are relayed to the configured channel, so feature availability depends on the selected model and upstream.

## Pick a protocol

You only need one, and it should match the client you already use:

| Protocol | Base path | Use when |
| --- | --- | --- |
| OpenAI Chat Completions | `/v1/chat/completions` | You already use the OpenAI SDK or a compatible client. |
| OpenAI Responses | `/v1/responses` | Your client uses the OpenAI Responses API, including structured input or streaming. |
| Anthropic Messages | `/v1/messages` | Your code targets Claude's native schema. |

Use a model that is enabled for your workspace and compatible with the selected route. Responses requests are forwarded in the Responses schema; built-in tools and other model-specific features work only when the configured upstream supports them. CAPI also exposes Gemini native `POST /v1beta/models/{model}:generateContent` and `:streamGenerateContent` routes. Native protocols are adapted to configured upstream protocols where supported.

## OpenAI-compatible request

```bash
curl https://YOUR_CAPI_HOST/v1/chat/completions \
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
    base_url="https://YOUR_CAPI_HOST/v1",
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

Set `stream: true` to receive server-sent events. CAPI relays or adapts provider deltas as they arrive. A successful completion marker is emitted after usage settlement. A stream error requires checking the usage and billing records before retrying.

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://YOUR_CAPI_HOST/v1",
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

Chat Completions forwards supported request fields to the configured upstream. Tool calling depends on the selected channel and model:

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

Use `GET /v1/models` to find model IDs exposed by your workspace's enabled channels. Key/group restrictions are enforced when the request is routed. A catalog entry does not guarantee that a channel is configured for your workspace.

## Usage accounting

When the upstream reports token usage, CAPI records it for the workspace. Platform channels settle their configured token price; BYOK records have zero CAPI charge:

```json
{
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 118,
    "total_tokens": 160
  }
}
```

Billing reserves an estimate before a paid upstream request. A settlement that cannot be confirmed leaves a visible unresolved billing state; it does not silently return a successful completion. Check the workspace Billing page before retrying such requests.

## Next steps

- [Chat Completions reference](/docs/api/openai/chat-completions)
- [Anthropic Messages reference](/docs/api/anthropic/messages)
- [Authentication](/docs/guides/authentication) — key scoping and rate limits.
