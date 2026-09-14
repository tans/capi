---
title: Quickstart
description: Get your first CAPI generation running in under 5 minutes.
---

## Step 1: Get an API Key

Create a CAPI account and generate a key from the dashboard. Keys are scoped per project, so you can rotate or revoke one without touching the rest of your setup.

> Free starter credits are included with every new account.

## Step 2: Create Your First Task

Media generation is asynchronous. Submit a request to create a task, then use its identifier to retrieve the result.

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

## Step 3: Check the Result

The completed task carries the output URL, duration, and the exact cost deducted from your balance.

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

## What's Next?

- Read the [Task API quickstart](/docs/guides/task-api/quickstart) to learn how polling and callbacks work.
- Read the [LLM API quickstart](/docs/guides/llm-api/quickstart) if you only need text models.
- Browse the [model catalog](/models) to find the right model for your use case.
