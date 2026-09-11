---
title: Callbacks
description: Securely receive and verify Task callback deliveries.
---

Instead of polling, pass a `callback_url` when creating a task and Capi will `POST` the finished result to you.

## Register a callback

Add `callback_url` to any async generation request:

```bash
curl -X POST https://capi.ai/api/v1/kling/text_to_video \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-turbo-text-to-video",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5,
    "callback_url": "https://api.example.com/hooks/capi"
  }'
```

The URL must be HTTPS and publicly reachable. Private addresses and self-signed certificates are rejected at submission time, so you find out immediately rather than after the generation finishes.

## Callback payload

Capi sends the same envelope that `GET /api/v1/tasks/{task_id}` returns:

```json
{
  "task_id": "tsk_8f21c4ba",
  "status": "completed",
  "output": {
    "url": "https://file.capi.ai/v/tsk_8f21c4ba.mp4",
    "duration": 5
  },
  "cost": { "amount": 0.21, "currency": "USD" },
  "delivered_at": "2026-03-14T09:22:41Z"
}
```

Sending the same shape for both paths means one handler can serve polling and callbacks.

## Verify the signature

Every delivery is signed so you can prove it came from Capi. The signature covers the raw request body and the delivery timestamp.

The request carries:

- `Capi-Signature` — `t=<unix timestamp>,v1=<hex hmac>`
- `Capi-Task-Id` — the task identifier
- `Capi-Delivery-Id` — unique per attempt, useful for de-duplication

Compute an HMAC-SHA256 over `${timestamp}.${rawBody}` using your callback signing secret, then compare in constant time:

```python
import hmac
import hashlib
import time

def verify(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    timestamp = int(parts["t"])

    # Reject replays outside the tolerance window.
    if abs(time.time() - timestamp) > tolerance:
        return False

    expected = hmac.new(
        secret.encode(),
        f"{parts['t']}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, parts["v1"])
```

The same check in Node.js:

```javascript
import crypto from "node:crypto";

function verify(rawBody, header, secret, tolerance = 300) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=")),
  );

  const timestamp = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1),
  );
}
```

> Always verify against the **raw** request body, before any JSON parsing. Re-serialising the payload changes byte order and invalidates the signature.

## Respond quickly

Return `2xx` as soon as you have durably queued the payload, then do the heavy work asynchronously. Any non-`2xx` response, or a response that takes longer than 10 seconds, counts as a failed delivery.

## Retries

Failed deliveries are retried with exponential backoff:

| Attempt | Delay |
| --- | --- |
| 1 | immediate |
| 2 | 30 seconds |
| 3 | 2 minutes |
| 4 | 10 minutes |
| 5 | 1 hour |

After five failed attempts the delivery is parked. Retrieve the result manually with `GET /api/v1/tasks/{task_id}`, and use `Capi-Delivery-Id` to ignore duplicates when two attempts both reach you.

## Local development

Forward to your machine with any tunnel:

```bash
ngrok http 3000
# then pass the generated https URL as callback_url
```

## Next steps

- [Retrieve Task](/docs/api/tasks/get) — fall back to polling when a delivery is missed.
- [Task API quickstart](/docs/guides/task-api/quickstart) — task lifecycle and failure codes.
