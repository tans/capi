---
title: Workspace files
description: Browse and manage generated media, and use API uploads as reference inputs.
---

The dashboard's workspace Files page is an archive for generated images and videos. Generated outputs appear there automatically and expire after 30 days. It does not provide a manual upload workflow. The API also supports uploading reference inputs for generation requests; those files are accessible through the Files API but are not shown in the generated-output browser. The file bytes are stored under `data/files` by default; set `CAPI_FILES_DIR` to a persistent volume path when deploying.

## Upload an API reference input

The API accepts multipart uploads up to 25 MiB. Supported formats are PNG, JPEG, WebP, GIF, MP4, WebM, MP3, MP4 audio, WAV, and PDF.

```bash
curl -X POST "$CAPI_BASE_URL/v1/files" \
  -H "Authorization: Bearer $CAPI_API_KEY" \
  -F "file=@./portrait.png" \
  -F "purpose=vision"
```

The response contains a workspace-scoped `file_...` ID and a short-lived signed `url` (one hour):

```json
{
  "id": "file_0123456789abcdef0123456789abcdef0123",
  "object": "file",
  "bytes": 482913,
  "filename": "portrait.png",
  "purpose": "vision",
  "content_type": "image/png",
  "url": "https://capi.example/api/v1/files/file_.../content?token=..."
}
```

The signed URL is a bearer link. Keep it private and request a new one from `GET /v1/files/{file_id}` when it expires. File operations require the `files.write` API-key scope. Uploaded reference inputs expire after 30 days.

## Use an uploaded image

Responses accepts CAPI file IDs in the normal image input shape. CAPI verifies the file belongs to the key's workspace and sends the image contents to the selected provider:

```json
{
  "model": "your-responses-model",
  "input": [{
    "role": "user",
    "content": [
      { "type": "input_text", "text": "Describe this image." },
      { "type": "input_image", "file_id": "file_0123456789abcdef0123456789abcdef0123" }
    ]
  }]
}
```

Responses `image_generation` can also use an `input_image` reference as a guide. For `/v1/images/edits`, send `image_url` as an HTTPS URL, a CAPI file ID, or an array of those values. The multipart form accepts one or more `image` file fields and an optional `mask` file. Image URL references must be publicly routable HTTPS URLs on the default port, return a supported image type, and stay within the 25 MiB combined request limit.

```bash
curl -X POST "$CAPI_BASE_URL/v1/images/edits" \
  -H "Authorization: Bearer $CAPI_API_KEY" \
  -F "model=your-image-model" \
  -F "prompt=Replace the background with a snowy street" \
  -F "image=@./portrait.png"
```

For video providers, pass the returned signed `url` in the provider's reference-image/video URL field. Signed URLs expire after one hour; submit the video task before they expire.

## Generated output archive

Successful image generations and completed video tasks are copied into the workspace file library. Image responses keep the upstream result fields and add `capi_file_id`, `capi_url`, and `archive_status` to each result. Video task results return a fresh signed download URL and `file_id` after each status request. Archived outputs expire and are removed automatically after 30 days; a workspace manager can also delete them earlier from the Files page or through the Files API. Video outputs up to 512 MiB are archived; if an upstream result cannot be fetched or exceeds that limit, the task still returns the provider URL when available.

## List, inspect, and delete

```bash
curl "$CAPI_BASE_URL/v1/files?limit=50" \
  -H "Authorization: Bearer $CAPI_API_KEY"

curl "$CAPI_BASE_URL/v1/files/file_0123456789abcdef0123456789abcdef0123" \
  -H "Authorization: Bearer $CAPI_API_KEY"

curl -X DELETE "$CAPI_BASE_URL/v1/files/file_0123456789abcdef0123456789abcdef0123" \
  -H "Authorization: Bearer $CAPI_API_KEY"
```

`GET /v1/files/{file_id}` returns a fresh signed content URL. The API list includes uploaded reference inputs and generated outputs; it supports `limit` (1–100) and a creation-time cursor. Deleting a file removes both its metadata and stored bytes. Expired files are cleaned hourly. Workspace members can browse and preview generated outputs in the dashboard; only workspace owners and admins can delete them there.

## Storage and backups

The SQLite database stores file metadata and signed-token hashes; file contents live in the configured files directory. Back up both together. In multi-instance deployments, all instances must share the same persistent file directory and database.
