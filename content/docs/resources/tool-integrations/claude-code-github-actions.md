---
title: GitHub Actions
description: Generate media from CI with a scoped, short-lived CAPI key.
---

CAPI works well in CI: generation is a plain HTTPS call, tasks are pollable, and keys can be scoped and time-boxed so a compromised runner cannot drain your balance.

## Store the key

Add `CAPI_API_KEY` as a repository secret:

```bash
gh secret set CAPI_API_KEY --body "capi_sk_live_..."
```

Prefer a dedicated key for CI, scoped to what the workflow actually generates, with an expiry that matches your release cadence.

## Basic workflow

```yaml
name: Generate launch assets

on:
  push:
    branches: [main]

jobs:
  assets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create hero-image task
        env:
          CAPI_API_KEY: ${{ secrets.CAPI_API_KEY }}
        run: |
          curl --fail-with-body -X POST https://capi.ai/api/v1/gpt-image-2/text_to_image \
            -H "Authorization: Bearer $CAPI_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"model":"gpt-image-2-text-to-image","prompt":"Abstract hero for a developer tools launch, deep blue","size":"1536x1024"}' \
            > task.json

      - uses: actions/upload-artifact@v4
        with:
          name: generation-task
          path: task.json



## Cost guardrails

- Give the CI key a monthly budget in **Settings → API Keys**; the workflow receives `402` when it is exhausted.
- Cache generated assets keyed on the prompt hash, so unchanged prompts skip regeneration entirely.

