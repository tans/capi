---
title: Quickstart
description: Get your first Capi generation running in under 5 minutes.
---

## Step 1: Get an API Key

Create a Capi account and generate a key from the dashboard. Keys are scoped per project, so you can rotate or revoke one without touching the rest of your setup.

> Free starter credits are included with every new account.

## Step 2: Install the SDK

Pick the client for your language. Every SDK ships full type definitions and built-in task polling.

```bash
pip install capi
npm install @capi.ai/sdk
go get github.com/capi-ai/capi-go
```

## Step 3: Create Your First Task

Media generation is asynchronous. Submitting a task returns immediately; `task.wait()` blocks until the output is ready.

```python
from capi import Capi

client = Capi()
task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite flying above a quiet coastal town at sunrise",
    duration_seconds=5,
)
result = task.wait()
print(result.videos[0].url)
```

The same call in Node.js:

```javascript
import { Capi } from "@capi.ai/sdk";

const client = new Capi();
const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite flying above a quiet coastal town at sunrise",
  duration_seconds: 5,
});
const result = await task.wait();
console.log(result.videos[0].url);
```

Or call the REST endpoint directly:

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

## Step 4: Check the Result

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
