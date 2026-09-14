---
title: Authentication
description: Create an API key and authenticate requests to Capi.
---

Capi uses API keys to authenticate API requests. Send the key with every request that accesses your account or creates work.

## Choose the right key

- A **user API key** calls the Task API, LLM API, and account endpoints. Sign in, then open the API Keys page to create one.
- API keys are owned by the user account. Administrators configure upstream channels and model routing in the administrator console; they do not issue a separate management key.

## Create an API key

Give each application its own key so you can rotate or revoke access without interrupting other integrations. A key is bound to one account, and requests can access only resources visible to that account.

Paid API calls are limited to 300 requests per minute per account. A `429 Too Many Requests` response includes `Retry-After`, `X-RateLimit-Limit-RPM`, `X-RateLimit-Remaining-RPM`, and `X-RateLimit-Reset` headers.

## Authenticate a request

Send the API key as a bearer token in the `Authorization` header:

```http
Authorization: Bearer YOUR_API_TOKEN
```

For example, request your current balance with cURL:

```bash
curl "https://capi.ai/api/v1/me/balance" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

The OpenAI-compatible, Anthropic-compatible, and Gemini-compatible routes use their native header conventions. Anthropic routes read `x-api-key` plus `anthropic-version`, and Google routes accept either a bearer token or an `x-goog-api-key` header.


## Keep keys secure

- Store API keys in a secret manager or encrypted credentials.
- Never commit a key to source control or expose it in browser code.
- Rotate a key immediately if it may have been disclosed.
- Use separate keys for development and production.

## Troubleshoot authentication

- A `401 Unauthorized` response means the key is missing, malformed, revoked, or invalid.
- A `403 Forbidden` response means the key is valid but its credential class or account role cannot perform the operation.
- Confirm the header starts with `Bearer`, followed by one space and the complete key.
- Confirm the key belongs to the account whose resources you are requesting.
