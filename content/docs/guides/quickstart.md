---
title: Quickstart
description: Get your first CAPI generation running in under 5 minutes.
---

## Step 1: Get an API Key

Create a CAPI account and generate a key from the dashboard. Keys are scoped per project, so you can rotate or revoke one without touching the rest of your setup.

> Free starter credits are included with every new account.

## Step 2: Create Your First Video Task

Video generation is asynchronous. Choose an enabled video model from the catalog, submit once with an `Idempotency-Key`, then use the returned task identifier to retrieve the result.

```bash
curl -X POST https://capi.minapp.xin/api/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Idempotency-Key: demo-video-001" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_VIDEO_MODEL",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise"
  }'
```

## Step 3: Check the Result

Poll `GET /api/v1/tasks/{id}`. Completed tasks contain a provider result URL; failed tasks release their reservation, while unknown tasks remain held for reconciliation.


## What's Next?

- Read the [Task API quickstart](/docs/guides/task-api/quickstart) to learn how polling and callbacks work.
- Read the [LLM API quickstart](/docs/guides/llm-api/quickstart) if you only need text models.
- Browse the [model catalog](/models) to find the right model for your use case.
