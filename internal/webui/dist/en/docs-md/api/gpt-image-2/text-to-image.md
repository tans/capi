# GPT Image 2 Text-to-Image

Generate an image from a prompt.

`POST /v1/images/generations`

## Overview

GPT Image 2 adds sharper text rendering and layout control compared with the first generation, and follows long instructions closely.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | Model ID, e.g. gpt-image-2-text-to-image. |
| prompt | string | Yes | Image description. |
| size | string | No | One of "1024x1024", "1536x1024", "1024x1536". |
| quality | string | No | One of "low", "medium", "high". |
| n | integer | No | Number of images to return. Default 1. |

## Request body

```json
{
  "model": "gpt-image-2-text-to-image",
  "prompt": "a minimal poster for a night train, deep blue background",
  "size": "1024x1024",
  "quality": "high"
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2-text-to-image",
    "prompt": "a minimal poster for a night train"
  }'
```

## Response

200 OK

```json
{
  "data": [
    { "url": "https://file.capi.minapp.xin/images/out-1.png" }
  ]
}
```

