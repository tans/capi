---
title: Authentication
description: Create an API key and authenticate requests to CAPI.
---

CAPI uses API keys to authenticate API requests. Every key belongs to one workspace; requests use that workspace's balance and resources.

## Choose the right key

- Create a **workspace API key** from a workspace's API Keys page. It calls the Task API, LLM API, and account endpoints.
- Workspace administrators manage keys and members. Platform administrators configure upstream channels and model routing.

## Create an API key

Give each application its own key so you can rotate or revoke access without interrupting other integrations. A key is bound to one workspace and its creator, and requests can access only that workspace's resources.

Keys can have an expiry, enabled state, scopes, group and spending budget. Platform-channel requests reserve and settle workspace credit; workspace-owned BYOK channels do not debit CAPI credit. A paid request that exceeds available balance or its key budget returns `429 quota_exceeded`.

## Authenticate a request

Send the API key as a bearer token in the `Authorization` header:

```http
Authorization: Bearer YOUR_API_TOKEN
```

For example, request your current balance with cURL:

```bash
curl "https://YOUR_CAPI_HOST/v1/me/balance" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

OpenAI-compatible routes use the bearer token shown above. Anthropic Messages also accepts its native `x-api-key` and `anthropic-version` headers.


## Keep keys secure

- Store API keys in a secret manager or encrypted credentials.
- Never commit a key to source control or expose it in browser code.
- Rotate a key immediately if it may have been disclosed.
- Use separate keys for development and production.

## Troubleshoot authentication

- A `401 Unauthorized` response means the key is missing, malformed, revoked, or invalid.
- A `403 Forbidden` response can indicate that a policy blocked the request. Missing API scopes currently produce `401` during authentication.
- Confirm the header starts with `Bearer`, followed by one space and the complete key.
- Confirm the key belongs to the account whose resources you are requesting.
