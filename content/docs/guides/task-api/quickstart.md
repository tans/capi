---
title: Task API Quickstart
description: Create an asynchronous Task and handle polling, completion, failure, and retries.
---

Video generation runs as an asynchronous task. Image generation and editing return synchronously.

## Why tasks instead of blocking calls

Media generation takes seconds to minutes. Holding an HTTP connection open for that long invites timeouts and makes retries ambiguous. Tasks separate *submission* from *retrieval*:

1. `POST` the generation request and receive a `task_id`.
2. Poll the task endpoint for its status and result.
3. Read the output URL from the completed task.

## Submit a video task

Use the provider-neutral endpoint. The `model` selects an enabled video model and the provider channel remains an implementation detail. `Idempotency-Key` is required for safe retries.

```bash
curl -X POST https://capi.minapp.xin/api/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Idempotency-Key: demo-video-001" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_VIDEO_MODEL","prompt":"A paper kite above a coastal town at sunrise"}'
```

The response is a task envelope. `Idempotency-Key` is required; repeating a request with the same key returns the existing task.

```json
{
  "id": "video_1_demo-video-001",
  "object": "video.task",
  "status": "running"
}
```

## Poll a task

```bash
curl https://capi.minapp.xin/api/v1/tasks/tsk_8f21c4ba \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

The status is `submitting`, `running`, `unknown`, `succeeded`, or `failed`. The API does not currently return progress or ETA.

On completion:

```json
{
  "id": "video_1_demo-video-001",
  "object": "video.task",
  "status": "succeeded",
  "model": "YOUR_VIDEO_MODEL",
  "result": {
    "url": "https://capi.example/api/v1/files/file_.../content?token=...",
    "file_id": "file_...",
    "archived": true
  },
  "error": null,
  "created_at": 1770000000,
  "updated_at": 1770000120
}
```

Generated video files are archived for 30 days. The signed result URL is valid for one hour; poll the task again to receive a fresh URL.


## Handle failure

A failed task releases its reserved amount. The API returns the provider error as a message:

```json
{
  "id": "video_1_demo-video-001",
  "object": "video.task",
  "status": "failed",
  "error": { "message": "The provider rejected the request." }
}
```

An `unknown` status means the upstream submission could not be reconciled yet. Its reserved amount stays held until the task is reconciled.

## Concurrency and rate limits

The service limits the number of active video tasks per workspace. A limit or insufficient balance returns an error when the task is submitted.

## Next steps

- [Retrieve Task](/docs/api/tasks/get) — the full endpoint reference.
