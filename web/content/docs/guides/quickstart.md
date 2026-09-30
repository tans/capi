---
title: Quickstart
description: Get your first CAPI generation running in under 5 minutes.
---

## Step 1: Get an API Key

Create a CAPI account, select a workspace, and generate a key from the dashboard. Keys are scoped per workspace, so you can rotate or revoke one without touching the rest of your setup.

Add workspace credit by redeeming a code from your CAPI provider. A CAPI administrator can issue and manage redeem codes.

## Step 2: Create Your First Video Task

Video generation is asynchronous. Choose an enabled video model from the catalog, submit once, then use the returned task identifier to retrieve the result.

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_VIDEO_MODEL",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise"
  }'
```

## Step 3: Check the Result

Poll `GET /v1/tasks/{id}`. The result is the configured provider response. Task status names and result URL fields depend on the video adapter. CAPI does not currently enforce submission idempotency, so repeated POST requests may create multiple upstream tasks.


## What's Next?

- Read the [Task API quickstart](/docs/guides/task-api/quickstart) to learn how to poll video tasks.
- Read the [LLM API quickstart](/docs/guides/llm-api/quickstart) if you only need text models.
- Browse the [model catalog](/models) to find the right model for your use case.
