---
title: Task API Quickstart
description: Create an asynchronous Task and handle polling, completion, failure, and retries.
---

Video, music, and long-running image jobs run as **Tasks**. Creating a task returns immediately with an identifier; the result arrives later.

## Why tasks instead of blocking calls

Media generation takes seconds to minutes. Holding an HTTP connection open for that long invites timeouts and makes retries ambiguous. Tasks separate *submission* from *retrieval*:

1. `POST` the generation request and receive a `task_id`.
2. Poll the task, wait on the SDK helper, or receive a callback.
3. Read the output URL from the completed task.

## Submit a task

```bash
curl -X POST https://capi.ai/api/v1/kling/text_to_video \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-turbo-text-to-video",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5
  }'
```

The response is a task envelope, not the media:

```json
{
  "task_id": "tsk_8f21c4ba",
  "status": "pending",
  "created_at": "2026-03-14T09:21:07Z"
}
```

## Poll a task

```bash
curl https://capi.ai/api/v1/tasks/tsk_8f21c4ba \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

`status` moves through `pending` → `processing` → `completed`, or ends at `failed`.

While a task is running, the response includes progress metadata:

```json
{
  "task_id": "tsk_8f21c4ba",
  "status": "processing",
  "progress": 0.42,
  "eta_seconds": 18
}
```

On completion:

```json
{
  "task_id": "tsk_8f21c4ba",
  "status": "completed",
  "output": {
    "url": "https://file.capi.ai/v/tsk_8f21c4ba.mp4",
    "duration": 5
  },
  "cost": { "amount": 0.21, "currency": "USD" }
}
```

## Wait with the SDK

Every SDK ships a blocking helper, so you rarely need to write a polling loop:

```python
from capi import Capi

client = Capi()
task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite flying above a quiet coastal town at sunrise",
)

# Blocks with exponential backoff until the task reaches a terminal state.
result = task.wait(timeout=600)
print(result.videos[0].url)
```

To hand control back to your own event loop, use the async client instead:

```javascript
const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite flying above a quiet coastal town at sunrise",
});

// Resolves when the task settles; rejects on failure.
const result = await task.wait();
```

## Handle failure

A failed task is never billed — the reserved amount is released automatically. Failures carry a machine-readable code and the provider's reason:

```json
{
  "task_id": "tsk_8f21c4ba",
  "status": "failed",
  "error": {
    "code": "content_filtered",
    "message": "The prompt violated the provider's content policy."
  },
  "cost": { "amount": 0.0, "currency": "USD" }
}
```

Common codes:

- `content_filtered` — the prompt or source image was rejected.
- `invalid_input` — a required parameter was missing or malformed.
- `provider_unavailable` — the upstream provider returned an error after retries.
- `timeout` — the generation exceeded the provider's maximum runtime.

Retry only `provider_unavailable` and `timeout`. Retrying a filtered request returns the same failure.

## Concurrency and rate limits

Tasks are fire-and-forget, so a single account can have many in flight at once — typically dozens for image work and a handful for premium video models. Per-provider concurrency caps apply and are reported in the `X-RateLimit-*` headers.

## Next steps

- [Callbacks](/docs/guides/task-api/callbacks) — stop polling entirely and receive a signed webhook.
- [Retrieve Task](/docs/api/tasks/get) — the full endpoint reference.
