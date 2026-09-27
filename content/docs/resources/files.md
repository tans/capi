---
title: Files
description: Upload, use, download, list, and delete input assets in a workspace.
---

CAPI stores uploaded input files for image, video, audio, and document workflows. Files belong to a workspace and can only be listed, read, or deleted by API keys from that workspace. Uploads expire after 30 days. The file bytes are stored under `data/files` by default; set `CAPI_FILES_DIR` to a persistent volume path when deploying.

## Upload a file

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

The signed URL is a bearer link. Keep it private and request a new one from `GET /v1/files/{file_id}` when it expires. File operations require the `files.write` API-key scope.

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

## List, inspect, and delete

```bash
curl "$CAPI_BASE_URL/v1/files?limit=50" \
  -H "Authorization: Bearer $CAPI_API_KEY"

curl "$CAPI_BASE_URL/v1/files/file_0123456789abcdef0123456789abcdef0123" \
  -H "Authorization: Bearer $CAPI_API_KEY"

curl -X DELETE "$CAPI_BASE_URL/v1/files/file_0123456789abcdef0123456789abcdef0123" \
  -H "Authorization: Bearer $CAPI_API_KEY"
```

`GET /v1/files/{file_id}` returns a fresh signed content URL. Listing supports `limit` (1–100) and a `before` creation-time cursor. Deleting a file removes both its metadata and stored bytes. Expired files are removed when a new upload or list request runs.

## Storage and backups

The SQLite database stores file metadata and signed-token hashes; file contents live in the configured files directory. Back up both together. In multi-instance deployments, all instances must share the same persistent file directory and database. CAPI does not store generated provider outputs in this input-file store.
