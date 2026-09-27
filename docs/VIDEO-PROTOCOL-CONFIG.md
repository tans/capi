# Channel video protocol configuration

`videoProtocolConfig` is a versioned JSON adapter for asynchronous video APIs. It maps CAPI's video request into the provider's JSON contract, extracts the accepted task ID, polls the provider, and normalizes its status and result URL. The adapter is declarative and only calls relative paths on the channel's configured HTTPS base URL.

When this configuration is empty, CAPI keeps the existing convention: `POST /videos`, task ID in `task_id` or `id`, and `GET /videos/{id}`.

## Version 1 format

```json
{
  "version": 1,
  "submit": {
    "endpoint": "/videos",
    "request": {
      "model": { "from": "model" },
      "prompt": { "from": "prompt" }
    }
  },
  "taskIdPath": "data.task_id",
  "poll": {
    "endpoint": "/videos/{id}",
    "statusPath": "data.status",
    "resultUrlPath": "data.video_url",
    "errorPath": "data.message",
    "successStatuses": ["completed"],
    "failureStatuses": ["failed"]
  }
}
```

`request` keys are dot paths in the upstream JSON. Numeric path segments create arrays, so `contents.0.type` maps naturally to an array item. A mapping can read an input field with `from`, provide a fallback with `default`, or write a constant with `value`. Available built-in input fields include `model`, `prompt`, `image_url`, `duration_seconds`, `resolution`, `aspect_ratio`, and any additional fields the client sends.

The submit endpoint may use `{model}`; the poll endpoint may use `{id}`. Both values are URL encoded. Authentication defaults to Bearer. For `X-API-Key`, use `"auth": {"type":"api-key-header","header":"X-API-Key"}`. Provider keys remain in channel credentials, never in this JSON.

## Chiyuan86 Kling image-to-video

Set the channel base URL to `https://chiyuan86.com` and map the public CAPI model to the provider's path model (for example `kling-3.0`). This sample matches the documented newer Kling endpoints:

```json
{
  "version": 1,
  "submit": {
    "endpoint": "/kling/image-to-video/{model}",
    "request": {
      "contents.0.type": { "value": "prompt" },
      "contents.0.text": { "from": "prompt" },
      "contents.1.type": { "value": "first_frame" },
      "contents.1.url": { "from": "image_url" },
      "settings.duration": { "from": "duration_seconds", "default": 5 },
      "settings.resolution": { "from": "resolution", "default": "720p" },
      "settings.audio": { "value": "off" },
      "settings.multi_shot": { "value": false },
      "options.watermark_info.enabled": { "value": false }
    }
  },
  "taskIdPath": "id",
  "requiredInput": ["image_url"],
  "poll": {
    "endpoint": "/kling/tasks?task_ids={id}",
    "statusPath": "data.0.status",
    "resultUrlPath": "data.0.outputs.0.url",
    "successStatuses": ["completed"],
    "failureStatuses": ["failed"]
  }
}
```

The upstream submission accepts prompt plus a first-frame image, and task queries return `data[]` with `outputs[].url`. Verify the model name and resolution enabled for the account before generation.

## Xiaoguai MiniMax H3 Fast

Set the channel base URL to `https://xiaoguai123.xyz`. This matches the documented task endpoint and response fields:

```json
{
  "version": 1,
  "submit": {
    "endpoint": "/api/v1/videos/generations",
    "request": {
      "model": { "from": "model" },
      "prompt": { "from": "prompt" },
      "duration": { "from": "duration_seconds", "default": 5 },
      "resolution": { "from": "resolution", "default": "480p" },
      "aspect_ratio": { "from": "aspect_ratio", "default": "16:9" },
      "first_frame_image": { "from": "image_url" }
    }
  },
  "taskIdPath": "data.0.task_id",
  "poll": {
    "endpoint": "/api/v1/tasks/{id}",
    "statusPath": "data.status",
    "resultUrlPath": "data.result.videos.0",
    "successStatuses": ["completed"],
    "failureStatuses": ["failed"]
  }
}
```

The listed model accepts text-to-video and image-to-video modes. Follow the provider's model page for required media fields, duration and resolution limits. Provider billing is independent of CAPI workspace billing.
