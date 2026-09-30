# CAPI

> A self-hosted AI gateway with optional JEV-powered routing and security decisions.

CAPI gives teams one API and one workspace for connecting language, image, and video models. It keeps upstream channels, model access, API keys, usage, and workspace balances behind a single gateway while preserving the protocol shape that existing clients already use.

## Contents

- [Capabilities](#capabilities)
- [API surface](#api-surface)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Capabilities

| Area | What CAPI provides |
| --- | --- |
| Unified gateway | One base URL and one workspace API key for supported model requests. |
| Protocol compatibility | OpenAI-compatible Chat Completions and Responses, plus an Anthropic Messages route. |
| Multimodal gateway | Synchronous language and image requests, workspace file storage with archived image/video outputs, and provider-neutral asynchronous video task submission. |
| Provider routing | Configure upstream OpenAI-compatible channels, model groups, priorities, weights, retries, and automatic channel disable rules. |
| Workspaces | Separate members, API keys, model limits, channels, balances, and usage records by workspace. |
| JEV decision layer | Opt-in, workspace-scoped JEV routing and input security auditing. JEV is not required for normal requests. |
| Self-hosting | Run with Bun, Docker Compose, or the included PM2 configuration, backed by SQLite. |

### JEV in CAPI

JEV is an optional decision service, not a regular chat model. A workspace can enable it for automatic routing and input security auditing. Low-confidence routing falls back to the standard tier, and a JEV failure does not stop the model request. High-risk findings are recorded in the workspace security audit for review.

JEV requests use the evaluation endpoint and are charged to the workspace that enabled the capability. The JEV model is not sent through `/chat/completions`.

## API surface

CAPI accepts both `/v1/...` client paths and their `/api/v1/...` equivalents. The `/v1` paths are rewritten by the application for compatibility with existing OpenAI clients.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/v1/models` | List models available to the authenticated API key. |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions, including streaming when supported upstream. |
| `POST` | `/v1/responses` | OpenAI Responses-compatible requests. |
| `POST` | `/v1/images/generations` | OpenAI-compatible image generation. |
| `POST` | `/v1/images/edits` | Image editing from multipart uploads, HTTPS URLs, or uploaded file IDs. |
| `POST` | `/v1/files` | Upload a workspace-scoped input file. |
| `GET` | `/v1/files` | List workspace input files. |
| `GET` / `DELETE` | `/v1/files/{file_id}` | Inspect or delete an uploaded file. |
| `POST` | `/v1/messages` | Anthropic Messages-compatible requests. |
| `POST` | `/v1/videos` | Submit an asynchronous video task. |
| `GET` | `/v1/tasks/{task_id}` | Read the status and output of an asynchronous task. |
| `POST` | `/v1/evaluate` | Send a structured evaluation request, including JEV decisions. |
| `POST` | `/v1/systemone` | TypeSafe System One-compatible typed decision request. |
| `GET` | `/v1/me/balance` | Read the current workspace balance. |
| `GET` | `/v1/me/usage` | Read usage records for the authenticated workspace. |

All model and task requests require a workspace API key. Use `Authorization: Bearer <key>` for OpenAI-compatible routes. Anthropic requests use the native `x-api-key` and `anthropic-version` headers.

Uploaded inputs are limited to 25 MiB and expire after 30 days; generated image and video outputs are also removed automatically after 30 days. The default file directory is `data/files`; set `CAPI_FILES_DIR` to a persistent path and back it up together with the SQLite database. The file APIs require the `files.write` key scope.

## Quick start

### Run locally with Bun

Prerequisites:

- [Bun](https://bun.sh/)
- An upstream OpenAI-compatible model endpoint, unless you only need to inspect the UI

```bash
git clone https://github.com/tans/capi.git
cd capi
bun install
bun run dev
```

The development server listens on [http://localhost:3210](http://localhost:3210).

1. Create an account and sign in.
2. Create or select a workspace, redeem a code to add credit, and generate a workspace API key.
3. As an administrator, configure an upstream channel and its model group.
4. List the models visible to the key:

```bash
export CAPI_BASE_URL=http://localhost:3210
export CAPI_API_KEY=your_workspace_api_key

curl "$CAPI_BASE_URL/v1/models" \\
  -H "Authorization: Bearer $CAPI_API_KEY"
```

5. Send a chat request using one of the model IDs returned by `/v1/models`:

```bash
curl "$CAPI_BASE_URL/v1/chat/completions" \\
  -H "Authorization: Bearer $CAPI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-enabled-model",
    "messages": [{"role": "user", "content": "Hello from CAPI."}]
  }'
```

For asynchronous video generation, submit a request to `/v1/videos` and poll `/v1/tasks/{task_id}`. The guides and endpoint reference are available from `/docs` when CAPI is running.

## Configuration

CAPI stores its SQLite database at `data/capi.sqlite` by default. The directory should be persisted when running in a container or on a server.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAPI_DB_PATH` | `data/capi.sqlite` | SQLite database path. |
| `CAPI_ADMIN_TOKEN` | empty | Optional machine token for administrator API requests. |
| `CAPI_RELAY_RETRY_TIMES` | `1` | Maximum number of relay retries. |
| `CAPI_RELAY_TIMEOUT_MS` | `120000` | Upstream request timeout in milliseconds. |
| `CAPI_ALERT_WEBHOOK_URL` | empty | Optional JSON webhook for readiness failures. |
| `CAPI_BACKUP_DIR` | `data/backups` | Backup destination for local SQLite deployments. |
| `CAPI_BACKUP_RETENTION` | `14` | Number of timestamped local backups to retain. |

Set variables in the shell, a process manager, or the container environment. Upstream channel credentials are configured in the administrator console and are stored as application data; do not commit them to the repository.

## Deployment

### Docker Compose

The repository includes a Dockerfile and a Compose file. Compose exposes CAPI on port `3210` and persists the application data volume.

```bash
docker compose up --build -d
docker compose logs -f capi
```

Open [http://localhost:3210](http://localhost:3210) after the container is ready. Compose checks `/api/readyz` and marks the container unhealthy if the database or persistent storage is unavailable.

For an Internet-facing deployment, place CAPI behind HTTPS. `/api/healthz` is a lightweight liveness check; `/api/readyz` verifies database/storage readiness and emits a structured JSON error log. Set `CAPI_ALERT_WEBHOOK_URL` to forward readiness failures to an alert receiver.

### PM2

The included `ecosystem.config.cjs` runs CAPI on port `3210`:

```bash
pm2 start ecosystem.config.cjs
pm2 restart capi --update-env
pm2 logs capi
```

Build before starting or restarting PM2:

```bash
bun install --frozen-lockfile
bun run build
pm2 start ecosystem.config.cjs
```

### Backups

Local SQLite deployments can create a consistent database backup together with archived files:

```bash
bun run backup
```

The command requires the `sqlite3` CLI and writes timestamped backups to `data/backups` by default. Docker images include the CLI and the default backup directory lives on the persisted `/app/data` volume. Schedule the command with cron or your host scheduler, for example once per day. Remote Turso/libSQL deployments should use the provider's native backup/restore facility instead.

A restore is intentionally explicit: stop CAPI, replace the local database and files directory from one timestamped backup, then start CAPI and verify `/api/readyz`.

## Development

Install dependencies before using the development scripts:

```bash
bun install
bun run dev       # Start Next.js on port 3210
bun run lint      # Run ESLint
bun run build     # Create a production build
bun run smoke     # End-to-end launch smoke test
bun run backup    # Back up local SQLite + stored files
```

The main areas of the repository are:

- `app/` — Next.js pages and API routes.
- `components/` — dashboard, documentation, and marketing UI.
- `lib/relay/` — authentication, channel selection, relay, pricing, and persistence.
- `lib/jev/` — JEV configuration, evaluation, routing, and security evidence.
- `content/docs/` — user-facing documentation content.
- `docs/` — architecture and development contracts.

## Documentation

- [Documentation index and consistency rules](./docs/README.md)
- [Public documentation source](./content/docs/)
- [Development contract](./docs/DEVELOPMENT-CONTRACT.md)

When CAPI is running, user-facing guides and API reference are available from `/docs`. `content/docs/` stores guide and resource source files; the API reference is generated from `lib/api-spec.ts`.

## Contributing

Before opening a change:

1. Keep API examples aligned with the routes in `app/api/` and the structured API reference in `lib/api-spec.ts`.
2. Run `bun run lint` and `bun run build` for code changes.
3. Keep credentials, local databases, logs, and generated build output out of commits.
4. Include the scope and verification evidence for the change.
