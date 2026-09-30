# List Models

List every model available to the key.

`GET /v1/models`

## Overview

Returns the model IDs exposed by enabled channels available to the calling workspace. Model restrictions still apply when a request is routed. This endpoint does not supply catalog pricing or modality filters.

## Examples

### cURL

```bash
curl https://YOUR_CAPI_HOST/v1/models \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## Response

200 OK

```json
{"object":"list","data":[{"id":"YOUR_MODEL","object":"model","owned_by":"capi"}]}
```

