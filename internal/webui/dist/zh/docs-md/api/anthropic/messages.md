# Anthropic Messages

Anthropic Messages API surface.

`POST /v1/messages`

## Overview

Accepts Anthropic Messages requests and translates them through CAPI's shared chat relay. Existing clients can use the Anthropic request shape; tool use, image input, streaming, and other model-specific features depend on the configured upstream. Anthropic-only features are not guaranteed to map to every OpenAI-compatible channel.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | Claude model ID. |
| messages | array | Yes | Messages in Anthropic format. |
| max_tokens | integer | Yes | Upper bound on generated tokens. |
| system | string \| content blocks | No | System prompt in Anthropic format. |

## Request body

```json
{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Explain the CAP theorem." }
  ]
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/messages \
  -H "x-api-key: YOUR_API_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Response

200 OK

```json
{
  "id": "msg_7c41ab",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 18, "output_tokens": 240 }
}
```

