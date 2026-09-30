# Video Generation

Submit an asynchronous video generation task.

`POST /v1/videos`

## Overview

The model selects an enabled video model. Provider-specific paths and credentials are configured on the channel, not exposed to API clients.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | An enabled video model ID. |
| prompt | string | Yes | Text description of the video. |

## Request body

```json
{
  "model": "YOUR_VIDEO_MODEL",
  "prompt": "A paper kite flying above a quiet coastal town at sunrise"
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_VIDEO_MODEL","prompt":"A paper kite above a coastal town at sunrise"}'
```

## Response

202 Accepted

```json
{
  "id": "video_42_demo-video-001",
  "object": "video.task",
  "status": "running"
}
```

## Notes

- Submission returns 202 with a CAPI task ID. Idempotency-Key is not currently enforced; repeated submissions may create multiple upstream tasks.
- Task statuses are submitting, running, unknown, succeeded, and failed.
- Status and result fields follow the configured provider. Poll the task ID returned by CAPI, not the upstream task ID.

