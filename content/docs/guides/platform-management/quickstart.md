---
title: Platform Management
description: Create and govern standard API keys and guardrails with a Capi management key.
---

Platform Management endpoints let an organisation automate how keys are issued and constrained, without handing out account credentials.

## Two credential classes

| Credential | Can create work | Can manage keys |
| --- | --- | --- |
| Standard API key | Yes | No |
| Management key | No | Yes |

A management key cannot generate media or completions. That separation is deliberate: if a management key leaks, the attacker can mint keys but cannot spend your balance directly, and the minted keys are visible and revocable.

## Create a management key

Sign in, open **Management Keys**, and create one. Store it only on the server that provisions keys — never in a client application.

## Provision a standard key

```bash
curl -X POST https://capi.ai/api/v1/platform/keys \
  -H "Authorization: Bearer YOUR_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "customer-4821-production",
    "scopes": ["video.generate", "image.generate"],
    "budget": { "amount": 50.00, "currency": "USD", "period": "monthly" },
    "expires_at": "2026-12-31T23:59:59Z"
  }'
```

The response includes the secret **once**:

```json
{
  "id": "key_3f81c4",
  "name": "customer-4821-production",
  "secret": "capi_sk_live_9d41...",
  "scopes": ["video.generate", "image.generate"],
  "created_at": "2026-03-14T09:21:07Z"
}
```

Store it immediately. Capi keeps only a hash.

## Scopes

Scopes constrain what a key can call:

- `video.generate`, `image.generate`, `music.generate`, `audio.generate` — one per modality.
- `llm.chat` — chat, responses, and messages endpoints.
- `llm.embed` — embeddings only.
- `billing.read` — balance and usage reads.

Anything not listed is denied with `403 Forbidden`, even if the account itself has access.

## Budgets and expiry

A budget caps spend over a rolling window. When the cap is reached, requests fail with `402 Payment Required` until the window resets or the budget is raised — the key is not revoked, so a temporary spike does not require reprovisioning.

`expires_at` is enforced at authentication time, which makes short-lived keys practical for CI jobs and demos.

## Rotate and revoke

Rotation issues a new secret and keeps the old one valid for a grace period, so deployments do not drop requests:

```bash
curl -X POST https://capi.ai/api/v1/platform/keys/key_3f81c4/rotate \
  -H "Authorization: Bearer YOUR_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "grace_period_seconds": 86400 }'
```

Revocation is immediate and irreversible:

```bash
curl -X DELETE https://capi.ai/api/v1/platform/keys/key_3f81c4 \
  -H "Authorization: Bearer YOUR_MANAGEMENT_KEY"
```

## Guardrails

Guardrails attach policy to a key without changing application code:

- **Model allow-lists** — restrict a key to specific model IDs or families.
- **Modality blocks** — deny entire surfaces, for example LLM access for a media-only integration.
- **Rate ceilings** — a per-key requests-per-minute cap below the account default.
- **Content rules** — reject prompts matching configured patterns before they reach a provider, so blocked requests are never billed.

## Audit

Every management operation is recorded with the acting key, target key, timestamp, and source IP. Read the log via `GET /api/v1/platform/audit` or in the dashboard under **Settings → Audit log**.

## Next steps

- [Authentication](/docs/guides/authentication) — header formats and error semantics.
- [List Models](/docs/api/models/list) — enumerate what a key can actually reach.
