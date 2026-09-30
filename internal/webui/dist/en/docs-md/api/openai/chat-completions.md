# Chat Completions

OpenAI-compatible chat completions.

`POST /v1/chat/completions`

## Overview

Send OpenAI-compatible chat-completions requests through a configured OpenAI-compatible upstream. Streaming is supported when the upstream supports it.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | Model ID, e.g. gpt-5.6 or claude-opus-5. |
| messages | array | Yes | Conversation history in OpenAI message format. |
| stream | boolean | No | Stream tokens as server-sent events. |
| temperature | number | No | Sampling temperature between 0 and 2. |
| tools | array | No | Tool definitions the model may call. |

## Request body

```json
{
  "model": "gpt-5.6",
  "messages": [
    { "role": "user", "content": "Summarise this changelog in three bullets." }
  ],
  "stream": false
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Python

```python
from openai import OpenAI

# Only the base URL and key change.
client = OpenAI(
    base_url="https://YOUR_CAPI_HOST/v1",
    api_key="YOUR_API_TOKEN",
)

response = client.chat.completions.create(
    model="gpt-5.6",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)
```

### Node.js

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://YOUR_CAPI_HOST/v1",
  apiKey: process.env.CAPI_API_KEY,
});

const response = await client.chat.completions.create({
  model: "gpt-5.6",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0].message.content);
```

## Response

200 OK

```json
{
  "id": "chatcmpl_9f2b41",
  "object": "chat.completion",
  "model": "gpt-5.6",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 42, "completion_tokens": 118, "total_tokens": 160 }
}
```

