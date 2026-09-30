# Retrieve Task

Poll the state of an async task.

`GET /v1/tasks/{task_id}`

## Overview

Poll the video task created by POST /v1/videos. This deployment does not currently send task callbacks.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| task_id | string | Yes | Task identifier returned at creation, in the path. |

## Examples

### cURL

```bash
curl https://YOUR_CAPI_HOST/v1/tasks/video_42_demo-video-001 \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## Response

200 OK

```json
{
  "id": "video_42_demo-video-001",
  "object": "video.task",
  "status": "succeeded",
  "model": "YOUR_VIDEO_MODEL",
  "result": { "id": "upstream_task_id", "status": "succeeded", "url": "https://provider.example/result.mp4" },
  "updated_at": "2026-10-01T00:00:00Z"
}
```

