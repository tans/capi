# GPT Image 2 Edit Image

Edit an image with an instruction.

`POST /v1/images/edits`

## Overview

Edit applies a natural-language instruction to an existing image, optionally guided by a mask, and preserves the untouched regions.

## Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| model | string | Yes | Model ID, e.g. gpt-image-2.5-edit-image. |
| image_url | string | Yes | Image to edit. |
| prompt | string | Yes | Instruction describing the change. |
| mask_url | string | No | Optional mask restricting the edit area. |

## Request body

```json
{
  "model": "gpt-image-2.5-edit-image",
  "image_url": "https://file.capi.minapp.xin/images/out-1.png",
  "prompt": "swap the background to a snowy street",
  "mask_url": "https://file.capi.minapp.xin/masks/bg.png"
}
```

## Examples

### cURL

```bash
curl -X POST https://YOUR_CAPI_HOST/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2.5-edit-image",
    "image_url": "https://file.capi.minapp.xin/images/out-1.png",
    "prompt": "swap the background to a snowy street"
  }'
```

## Response

200 OK

```json
{
  "data": [
    { "url": "https://file.capi.minapp.xin/images/edited-1.png" }
  ]
}
```

