# System One

Evaluate typed questions with a System One model.

`POST /v1/systemone`

## Overview

TypeSafe System One-compatible endpoint. Provide a state and one or more independent typed questions; CAPI routes the request through the workspace's configured evaluation channel, applies the same key scope and billing as /evaluate, and returns the configured evaluation provider’s typed answers.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | An enabled evaluation model ID, e.g. typesafe-ai/jev. |
| state | string \| object \| array | Yes | Text or structured JSON state to evaluate. |
| questions | object | Yes | Map of question IDs to questions of type noul, choice, or score. Up to 20 questions per request. |

## Request body

```json
{
  "model": "typesafe-ai/jev",
  "state": { "message": "I was charged twice for my subscription." },
  "questions": {
    "refund_requested": {
      "type": "noul",
      "instructions": "Does the customer ask for a refund?"
    },
    "urgency": {
      "type": "choice",
      "instructions": "How urgent is the issue?",
      "criteria": {
        "low": "No immediate impact",
        "high": "Blocking with financial loss"
      }
    }
  }
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/systemone \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"typesafe-ai/jev","state":{"message":"Review this request"},"questions":{"decision":{"type":"noul","instructions":"Should this proceed?"}}}'
```

## Response

200 OK

```json
{
  "model": "typesafe-ai/jev",
  "answers": {
    "refund_requested": { "type": "noul", "noul": 0.97 },
    "urgency": {
      "type": "choice",
      "choice": "high",
      "probabilities": { "low": 0.08, "high": 0.92 },
      "confidence": 0.84
    }
  }
}

```

