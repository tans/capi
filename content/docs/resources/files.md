---
title: Files
description: How CAPI stores generated outputs and accepts input assets.
---

Every generation in CAPI produces a file with a stable URL. Understanding the lifecycle matters for long-running pipelines and for anything user-facing.

## Output URLs

Generated media is written to `file.capi.minapp.xin` and returned in the task result:

```json
{
  "output": {
    "url": "https://file.capi.minapp.xin/v/tsk_8f21c4ba.mp4"
  }
}
```

URLs are unguessable but **public by default** — anyone holding the link can fetch the file. Treat them as shareable rather than secret.

## Retention

| Account | Retention |
| --- | --- |
| Free | 7 days |
| Pay-as-you-go | 90 days |
| Team | 1 year |
| Enterprise | configurable |

Expiry is a deletion of the CAPI copy only. Download anything you need to keep, or mirror it to your own bucket — see below.

## Input assets

Models that accept images, audio, or video take HTTPS URLs. You can pass any publicly reachable URL, or upload to CAPI first:

```bash
curl -X POST https://capi.minapp.xin/api/v1/files \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -F "file=@./portrait.jpg" \
  -F "purpose=input"
```

```json
{
  "id": "file_2b71fd",
  "url": "https://file.capi.minapp.xin/in/file_2b71fd.jpg",
  "bytes": 482913,
  "expires_at": "2026-06-12T09:21:07Z"
}
```

Uploaded inputs are deleted after 30 days unless attached to a saved project.

## Limits

| Kind | Limit |
| --- | --- |
| Image input | 30 MB, max 8192 px per side |
| Audio input | 100 MB, max 60 minutes |
| Video input | 500 MB, max 10 minutes |
| Upload rate | 60 uploads per minute per account |

## Mirror to your own storage

For anything durable, copy the file out as soon as the task completes. A callback handler demonstrates the pattern:

```python
import httpx, boto3

def persist(output_url: str, key: str) -> str:
    data = httpx.get(output_url).content
    boto3.client("s3").put_object(
        Bucket="my-media", Key=key, Body=data
    )
    return f"s3://my-media/{key}"
```

CAPI never deletes data from your bucket, so retention becomes entirely your policy.

## Signed downloads

Team and Enterprise accounts can request short-lived signed URLs for private delivery:

```bash
curl https://capi.minapp.xin/api/v1/files/file_2b71fd/signed_url \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

```json
{
  "url": "https://file.capi.minapp.xin/in/file_2b71fd.jpg?sig=...&exp=1774000000",
  "expires_at": "2026-03-14T10:21:07Z"
}
```

## Delete early

Remove a file before its retention date:

```bash
curl -X DELETE https://capi.minapp.xin/api/v1/files/file_2b71fd \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Useful when a user deletes their account data and you need to honour it immediately.
