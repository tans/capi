---
title: Workspace files
description: Upload, list, download and delete workspace-scoped files through the API.
---

CAPI stores file metadata in SQLite and bytes in `CAPI_FILES_DIR` (the default is `data/files`). File operations use a workspace API key with the `files.write` scope.

## Upload a file

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/files \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "file=@./portrait.png"
```

The multipart field is `file`. The upload handler accepts up to 25 MiB of file data and a 27 MiB total request; keep each file below the limit. The response is `201` with the stored ID, filename and byte count. The current upload handler stores purpose as `assistants`.

```json
{"id":"file_example","object":"file","bytes":482913,"filename":"portrait.png"}
```

## List and inspect

```bash
curl https://YOUR_CAPI_HOST/v1/files \
  -H "Authorization: Bearer YOUR_API_TOKEN"
curl https://YOUR_CAPI_HOST/v1/files/file_example \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

The list returns up to 100 files, newest first. Metadata includes `id`, `filename`, `content_type`, `bytes` and `created_at`. Cross-workspace IDs return `404`.

## Download and delete

```bash
curl https://YOUR_CAPI_HOST/v1/files/file_example/content \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -o portrait.png
curl -X DELETE https://YOUR_CAPI_HOST/v1/files/file_example \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Downloads require bearer authentication; this API does not issue signed download URLs. Deletion removes the file bytes and metadata. Newly uploaded files do not have an automatic expiry. Legacy files with expiry metadata are cleaned hourly after expiry.

## Generation inputs and outputs

Image editing supports multipart `image` and optional `mask` fields when the selected upstream supports them. Generated image/video results currently retain upstream URLs; they are not automatically archived into CAPI files. An uploaded CAPI ID is not automatically substituted for a provider image URL or Responses file input.

## Storage and backups

Back up the SQLite database and files directory together. Keep file storage persistent across application upgrades.
