---
title: GitHub Actions
description: Generate media from CI with a scoped, short-lived Capi key.
---

Capi works well in CI: generation is a plain HTTPS call, tasks are pollable, and keys can be scoped and time-boxed so a compromised runner cannot drain your balance.

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

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Generate hero image
        env:
          CAPI_API_KEY: ${{ secrets.CAPI_API_KEY }}
        run: |
          npx -y @capi.ai/cli image generate \
            --model gpt-image-2-text-to-image \
            --prompt "Abstract hero for a developer tools launch, deep blue" \
            --size 1536x1024 \
            --output public/hero.png

      - uses: actions/upload-artifact@v4
        with:
          name: launch-assets
          path: public/hero.png
```

The CLI exits non-zero on failure, so the step fails loudly rather than shipping a missing asset.

## Fan-out with a matrix

Generate several variants in parallel without writing a loop:

```yaml
    strategy:
      matrix:
        variant: [dawn, dusk, night]
    steps:
      - env:
          CAPI_API_KEY: ${{ secrets.CAPI_API_KEY }}
        run: |
          npx -y @capi.ai/cli image generate \
            --model seedream-5-text-to-image \
            --prompt "coastal town at ${{ matrix.variant }}, editorial photo" \
            --output "public/hero-${{ matrix.variant }}.png"
```

Raise `max-parallel` modestly — provider concurrency caps still apply.

## Committing generated output

If assets belong in the repo, commit them from the workflow:

```yaml
      - run: |
          git config user.name "capi-bot"
          git config user.email "bot@example.com"
          git add public/
          git diff --staged --quiet || git commit -m "chore: regenerate launch assets"
          git push
```

Guard with `git diff --staged --quiet` so a no-op run does not create an empty commit.

## Video in CI

Video is slower and costs more. Keep it off the default path and trigger it deliberately:

```yaml
on:
  workflow_dispatch:
    inputs:
      prompt:
        description: Shot description
        required: true

jobs:
  video:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - env:
          CAPI_API_KEY: ${{ secrets.CAPI_API_KEY }}
        run: |
          npx -y @capi.ai/cli video generate \
            --model veo-3.1-text-to-video \
            --prompt "${{ inputs.prompt }}" \
            --duration 8 \
            --output teaser.mp4
```

Set `timeout-minutes` above the longest expected generation so the runner does not kill a task that is about to finish.

## Cost guardrails

- Give the CI key a monthly budget in **Settings → API Keys**; the workflow receives `402` when it is exhausted.
- Pass `--max-cost` to the MCP or CLI so a single call cannot exceed a threshold.
- Cache generated assets keyed on the prompt hash, so unchanged prompts skip regeneration entirely.

## Next steps

- [CLI](/docs/resources/cli) — flags and exit codes.
- [Platform Management](/docs/guides/platform-management/quickstart) — provisioning scoped keys programmatically.
