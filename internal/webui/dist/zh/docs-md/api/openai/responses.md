# Responses

OpenAI Responses-compatible requests.

`POST /v1/responses`

## Overview

Forwards the Responses request schema to the configured upstream and returns its response or streaming events. Input items, built-in tools, and stateful features depend on upstream support.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | Model ID that supports the Responses API. |
| input | string \| array | Yes | Prompt text or structured Responses input items supported by the selected upstream. |
| stream | boolean | No | Stream incremental output events. |

## Request body

```json
{
  "model": "gpt-5.6-sol",
  "input": "Draft a migration plan for a Postgres schema change."
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/responses \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6-sol",
    "input": "Draft a migration plan"
  }'
```

## Response

200 OK

```json
{
  "id": "resp_5c81a2",
  "object": "response",
  "model": "gpt-5.6-sol",
  "output": [
    { "type": "message", "role": "assistant", "content": [] }
  ],
  "usage": { "input_tokens": 24, "output_tokens": 402 }
}
```

