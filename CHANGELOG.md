# Changelog

All notable changes to CAPI are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

To cut a release: add a `## [x.y.z] - YYYY-MM-DD` section here, commit to `main`, then run `bash scripts/release.sh` (tags `vx.y.z` and publishes the GitHub release).

## [Unreleased]

### Added

- Admin channel test: per-channel dialog to probe one selected protocol and model against the upstream with the stored key

### Fixed

- Channel editor white screen: the list API never returned `keys`, so opening the editor threw on `channel.keys.length`; the console now reads `keyCount`
- Deploy script used the CHANGELOG version string (with parentheses) for temp files, release directories and Docker image tags; paths now use the 12-char commit and the version stays display-only

## [0.1.0] - 2026-10-11

### Added

- Unified AI gateway API for LLM, image, and video models with a single workspace key
- Workspace and member management with roles, invites, and per-key budgets
- Channel routing with upstream provider configuration, model discovery, and health checks
- Usage metering and billing with per-model rates and redeemable credit codes
- Prompt redaction engine (脱敏审核) with per-workspace toggle
- Task API for long-running video generation jobs
- Admin console: pricing, users, announcements, email settings, model evaluation
- Marketing site and documentation with prerendered en/zh pages and Markdown exports
- Automated deploy pipeline with health-gated rollout and rollback (`scripts/deploy.sh`)
