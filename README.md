# CAPI

CAPI is a self-hosted AI gateway rewritten as a single Go binary. It exposes OpenAI-compatible APIs, workspace API keys, provider routing, usage/billing, local file storage, async video task polling, health checks, backups, and an embedded web console.

The runtime has **no Node.js or Bun dependency**.

## Architecture

```text
clients
  │
  ├─ OpenAI Chat / Responses / Anthropic Messages / Images / Video
  ▼
Go HTTP server
  │
  ├─ Auth + Workspace
  ├─ Policy (optional JEV + redaction)
  ├─ Router (priority + weight + cooldown)
  ├─ Provider adapters
  ├─ Usage / negative-allowed wallet ledger
  ├─ File storage
  └─ Video worker
       │
       ├─ SQLite
       └─ data/files
```

The gateway follows the architectural lesson from Magpie: wire protocols are kept separate from providers and routing. CAPI remains server-oriented and multi-tenant rather than copying Magpie's local desktop state model.

## Run

Requires Go 1.23+.

```bash
go mod tidy
go run ./cmd/capi serve
```

Open `http://127.0.0.1:3210`.

The first registration creates a personal workspace and wallet. If `CAPI_ADMIN_EMAIL` matches the registered email, that user receives the `admin` role.

## Add a provider

Use the web console or:

```bash
curl -X POST http://127.0.0.1:3210/api/workspaces/$WORKSPACE_ID/channels \
  -b capi_session=... \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"OpenAI",
    "protocol":"openai",
    "base_url":"https://api.openai.com/v1",
    "api_key":"sk-...",
    "models":["gpt-5.6"],
    "priority":10,
    "weight":1
  }'
```

Enabled channel model IDs are the source of truth for `/v1/models` and the web Models page.

## API

Supported user-facing routes:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages` (Anthropic request/response translation; non-streaming)
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/videos`
- `GET /v1/tasks/{id}`
- `POST /v1/files`
- `GET /v1/files`
- `POST /v1/evaluate`
- `POST /v1/systemone`
- `GET /v1/me/balance`
- `GET /v1/me/usage`

API keys are workspace-scoped. Wallet balances intentionally may become negative; billing is settled after upstream usage is known.

## Routing

For a requested model CAPI:

1. selects enabled platform or workspace channels that advertise the model;
2. takes the highest priority tier;
3. chooses by configured weight;
4. temporarily rests channels after network, rate-limit, credit, auth, or upstream failures;
5. retries another available channel.

## JEV and redaction

Set `CAPI_JEV_URL` to call `<url>/v1/evaluate` before upstream relay. A low `allow` probability blocks the request. If the evaluator returns `route_model`, that model becomes the routing target.

Set `CAPI_REDACT=true` to redact common email and phone patterns from JSON requests before they leave CAPI.

## Operations

```bash
capi doctor
capi migrate
capi backup
```

- `/api/healthz` is liveness.
- `/api/readyz` checks SQLite and persistent file storage.
- logs are structured JSON via `slog`.
- `CAPI_ALERT_WEBHOOK_URL` receives de-duplicated readiness failures.
- `capi backup` uses SQLite `VACUUM INTO` and copies stored files into timestamped `data/backups/` directories. No external `sqlite3` executable is required.

## Docker

```bash
docker compose up -d --build
```

The container is a small distroless runtime with one persistent `/app/data` volume.

## Smoke

With the server running:

```bash
make smoke
```

The smoke verifies health, readiness, registration/login, session cookies, and workspace persistence. Provider calls are intentionally not made by default.

## Repository layout

```text
cmd/capi/              binary entry point
internal/auth/         passwords, sessions, API tokens
internal/protocol/     wire protocol normalization / translation
internal/provider/     channel and model registry
internal/router/       priority, weights, cooldown/fallback
internal/policy/       JEV and redaction
internal/server/       control plane + /v1 APIs
internal/store/        SQLite + migrations
internal/worker/       async video polling and cleanup
internal/ops/          logging, alerts, backup
internal/webui/        embedded web console
```

## Known boundaries

- OpenAI-compatible upstream channels are the production provider protocol in this first Go cut, matching CAPI's previous runtime support. The provider/protocol split is ready for native Anthropic/Gemini adapters without changing routing.
- Anthropic `/v1/messages` streaming translation is not enabled yet; Chat Completions and Responses stream directly.
- A single process is the intended deployment. Persistent routing cooldowns and distributed coordination can be added only if CAPI later needs horizontal multi-instance operation.
