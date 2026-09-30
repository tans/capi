# Get Balance

Return the API key workspace's available credit balance.

`GET /v1/me/balance`

## Overview

Returns the available and reserved balance of the workspace that owns the API key, in USD.

## Examples

### cURL

```bash
curl https://YOUR_CAPI_HOST/v1/me/balance \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## Response

200 OK

```json
{
  "balance": { "micros": 128440000, "amount": 128.44, "currency": "USD",
    "reserved_micros": 610000, "available_micros": 127830000 }
}
```

