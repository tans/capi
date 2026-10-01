# Workspace files

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

Downloads through this endpoint require bearer authentication. Completed video tasks can also include a signed download URL that expires after one hour. Deletion removes the file bytes and metadata. Newly uploaded files do not have an automatic expiry. Expired generated files are cleaned hourly.

## Generation inputs and outputs

Image editing supports multipart `image` and optional `mask` fields when the selected upstream supports them. Generated base64 images and supported public HTTPS image URLs are archived into workspace files for 30 days, up to 25 MiB per image. Image results include `capi_file_id`, `capi_url` and `archive_status` when archiving is attempted; an unavailable archive leaves the original provider result intact. Successful video tasks archive supported public HTTPS MP4/WebM outputs for 30 days, up to 512 MiB. An uploaded CAPI ID is not automatically substituted for a provider image URL or Responses file input.

## Storage and backups

Back up the SQLite database and files directory together. Keep file storage persistent across application upgrades.
