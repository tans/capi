# Evaluate

Typed decisions from an evaluation model.

`POST /v1/evaluate`

## Overview

Evaluation models return choices, scores, and boolean probabilities instead of generated text. Send the shared `state` plus a map of typed `questions`; every question is evaluated independently and returned under its own id. Question types are boolean, noul, choice, or score. The upstream path and protocol are configured on the channel, so both Vercel AI Gateway TypeSafe and TypeSafe AI Jev channels work.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | An enabled evaluation model ID, e.g. typesafe-ai/jev. |
| state | string \| object \| array | Yes | The shared input every question is evaluated against. |
| questions | object | Yes | Map of question id to a question of type boolean, noul, choice, or score. Up to 20 per request. |

## Request body

```json
{
  "model": "typesafe-ai/jev",
  "state": "I was charged twice for my subscription this month.",
  "questions": {
    "refund": { "type": "boolean", "instructions": "Is the customer asking for money back?" },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is this ticket?",
      "criteria": ["Low, no impact", "Medium, degraded experience", "High, blocking with financial loss"]
    }
  }
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/evaluate \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"typesafe-ai/jev","state":"Review this request","questions":{"safe":{"type":"boolean","instructions":"Is this safe?"}}}'
```

## Response

200 OK

```json
{
  "model": "typesafe-ai/jev",
  "answers": {
    "refund": { "type": "boolean", "probability": 0.98 },
    "urgency": { "type": "score", "score": 2.1, "probabilities": { "0": 0.05, "1": 0.2, "2": 0.75 } }
  }
}

```

