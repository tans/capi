# CAPI

CAPI is a self-hosted AI gateway rewritten as a single Go binary. It exposes OpenAI-compatible APIs, workspace API keys, provider routing, usage/billing, local file storage, async video task polling, health checks, backups, and an embedded web console.

The runtime has **no Node.js or Bun dependency**.

## Architecture

```text
clients
  │
  ├─ OpenAI Chat / Responses / Anthropic Messages / Gemini / Images / Video
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
make dev
```

Open `http://127.0.0.1:3210`.

On first startup with a previous Bun database, CAPI creates a SQLite snapshot
under `data/backups/legacy-*/capi.sqlite`, archives the original tables as
`legacy_*`, and imports accounts, sessions, workspaces, wallets, API keys,
channels, usage and video tasks into the Go schema in one transaction. Existing
IDs and API key hashes are preserved; wallet quota units are converted to USD
micros. Existing Argon2id passwords remain valid and are upgraded after a
successful login. A failed import rolls back the schema changes. Legacy-only
configuration remains in the archived tables; the Go channel uses the first
configured upstream key.

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

If `models` is omitted, CAPI asks the provider's live model endpoint and stores the discovered IDs. Enabled channel model IDs are the source of truth for `/v1/models` and the web Models page.

## API

Supported user-facing routes:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages` (Anthropic Messages, including streaming and tool use)
- `POST /v1beta/models/{model}:generateContent`
- `POST /v1beta/models/{model}:streamGenerateContent` (Gemini SSE, including function calling)
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

Conversation affinity is supported through OpenAI `prompt_cache_key` or `X-CAPI-Session`. Recent routing decisions are exposed from `GET /api/workspaces/{wid}/routes`, including candidates, attempts and the selected channel.

Native `openai`, `anthropic` and `gemini` channels participate in the same router. CAPI translates messages, streaming text, tool/function calls and tool results across these protocols.

## JEV and redaction

Set `CAPI_JEV_URL` to call `<url>/v1/evaluate` before upstream relay. A low `allow` probability blocks the request. If the evaluator returns `route_model`, that model becomes the routing target.

Set `CAPI_REDACT=true` to replace common secrets and personal identifiers with stable local placeholders before requests leave CAPI. Placeholders are restored on normal and streamed responses.

## ChatGPT subscription (Codex)

CAPI can use a ChatGPT account that is already signed in through the official Codex CLI as a separate `chatgpt-subscription` channel. It is intentionally kept distinct from normal OpenAI API-key channels.

Import the contents of Codex CLI's `auth.json` into a workspace:

```http
POST /api/workspaces/{workspace_id}/chatgpt-subscription
Content-Type: application/json

{
  "auth_json": { "...": "contents of Codex auth.json" },
  "priority": 20,
  "weight": 1
}
```

CAPI refreshes the OAuth token when needed, discovers the account's Codex models and exposes them as `codex/<model>`. Requests use the Responses API through the ChatGPT Codex backend.

Current allowance and reset windows are available from:

```http
GET /api/workspaces/{workspace_id}/chatgpt-subscription/{channel_id}/quota
```

The response includes the plan, primary/secondary allowance windows, reset times and reset credits when the account reports them.

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
- `capi backup` uses SQLite `VACUUM INTO` and copies stored files into timestamped `data/backups/` directories. If SMTP credentials are configured, it also copies the matching `smtp.key` encryption key into the backup with owner-only permissions; keep the backup directory protected because it can decrypt that credential. No external `sqlite3` executable is required.

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

## Frontend development

The React console source lives in `web/`; Vite generates
`internal/webui/dist/` locally, and the release build embeds it into the Go
binary. Generated assets are ignored by Git. Commit the frontend source and
lockfile, never the generated distribution. See `web/migration.json` for the
page inventory and verification status.

Running a release binary needs no Node runtime. Building or developing the
frontend requires Node 22.12+:

```bash
make web-build
make build
```

`make dev` builds the frontend and starts Go. For hot reload, start `make dev` and
`make web-dev` in separate terminals.
The frontend dev server on port 3211 proxies same-origin API requests to Go on 3210.
Docker and CI build the frontend before compiling Go. Commit frontend source and
the lockfile; do not commit generated assets. A plain `go build` omits the React
console; use `make build` or the Docker build for a release binary with the UI.

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
web/                  React frontend source and migration inventory
```

## Known boundaries

- The intended deployment is still a single CAPI process. Routing cooldown and affinity state are in memory; durable usage, tasks and account configuration stay in SQLite.
- ChatGPT subscription channels are Responses-only and are namespaced as `codex/*`; they are not presented as generic OpenAI API credits.
- Provider-specific features outside the shared text/tool/function-call surface may still pass through only when client and upstream protocols match.
