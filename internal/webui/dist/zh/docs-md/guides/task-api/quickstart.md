# Task API Quickstart

Video generation runs as an asynchronous task. Image generation and editing return synchronously.

## Submit a video task

Use an enabled video model. The channel's video adapter controls the provider-specific paths, authentication, request mapping and result mapping.

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/videos \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_VIDEO_MODEL","prompt":"A paper kite above a coastal town at sunrise"}'
```

Submission returns `202` with a CAPI task ID. `Idempotency-Key` is not currently enforced: retrying a POST may submit a second upstream task.

```json
{"id":"video_example","object":"video.task","status":"running","model":"YOUR_VIDEO_MODEL"}
```

## Poll a task

```bash
curl https://YOUR_CAPI_HOST/v1/tasks/video_example \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

CAPI polls active tasks in the background. The stored channel endpoint, model, adapter and credential snapshot allow polling to continue if the channel is edited or removed. Clients can access only tasks in their own workspace.

```json
{
  "id":"video_example",
  "object":"video.task",
  "model":"YOUR_VIDEO_MODEL",
  "status":"succeeded",
  "result":{"id":"upstream_id","status":"succeeded","url":"https://provider.example/result.mp4"},
  "updated_at":"2026-10-01T00:00:00Z"
}
```

## Handle results and failure

Status names and result fields depend on the configured provider and adapter. Download the result from the provider URL when available; CAPI does not currently copy generated videos into its Files API. Polling does not return progress or ETA. An unsuccessful submission returns a gateway error rather than a CAPI task ID.

## Next steps

- [Retrieve Task](/docs/api/tasks/get)
- [Authentication](/docs/guides/authentication)
