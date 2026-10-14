-- CAPI declarative schema — single source of truth for the local dev database.
--
-- This file is the only place a developer edits table structure during
-- feature work. `capi dev sync` compares a dev database against it and
-- applies safe, reversible changes automatically. Production databases keep
-- upgrading through migrations.go, which is generated per release and must
-- converge with this file (see schema_sync_test.go).
--
-- SQLite notes: no dropping or destructive changes here unless you bump the
-- schema and confirm the sync plan explicitly.

CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    secret TEXT NOT NULL,
    scopes TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    group_name TEXT NOT NULL DEFAULT '',
    budget_limit_micros INTEGER,
    owner_user_id TEXT NOT NULL DEFAULT '',
    expires_at TEXT,
    model_limits_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK(id=1),
    config_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE billing_reservations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    amount_micros INTEGER NOT NULL CHECK(amount_micros>=0),
    state TEXT NOT NULL DEFAULT 'held',
    lease_expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE channels (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    models_json TEXT NOT NULL DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    price_input_micros_per_million INTEGER NOT NULL DEFAULT 0,
    price_output_micros_per_million INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    last_error TEXT NOT NULL DEFAULT '',
    auto_disabled_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE conversation_affinity (
    scope TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE eval_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    overall_score REAL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    raw_json TEXT NOT NULL DEFAULT '',
    cost_micros INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    path TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'assistants',
    created_at TEXT NOT NULL,
    expires_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE jev_decisions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    original_text TEXT NOT NULL DEFAULT '',
    route_intent TEXT,
    route_complexity TEXT,
    route_confidence REAL,
    security_categories TEXT NOT NULL DEFAULT '[]',
    security_severity TEXT NOT NULL DEFAULT 'none',
    security_confidence REAL,
    detector TEXT NOT NULL,
    jev_request_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    quota_micros INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE TABLE legacy_restore_state (
    feature TEXT PRIMARY KEY
);

CREATE TABLE media_download_tokens (
    token_hash TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE model_groups (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    models_json TEXT NOT NULL DEFAULT '[]',
    ratio REAL NOT NULL DEFAULT 1,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE notification_events (
    id TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    UNIQUE(api_key_id,kind,threshold),
    FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE TABLE password_reset_codes (
    user_id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE password_reset_limits (
    bucket_hash TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL
);

CREATE TABLE product_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    published_by TEXT NOT NULL,
    published_at TEXT NOT NULL,
    FOREIGN KEY(published_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE product_notification_events (
    id TEXT PRIMARY KEY,
    announcement_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    UNIQUE(announcement_id,user_id),
    FOREIGN KEY(announcement_id) REFERENCES product_announcements(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE prompt_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    prompt_text TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE TABLE redeem_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    secret_code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    amount_micros INTEGER NOT NULL CHECK(amount_micros>0),
    enabled INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    redeemed_at TEXT,
    redeemed_workspace_id TEXT,
    redeemed_user_id TEXT
);

CREATE TABLE security_incidents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'input',
    severity TEXT NOT NULL,
    detector TEXT NOT NULL,
    categories TEXT NOT NULL DEFAULT '[]',
    confidence REAL NOT NULL DEFAULT 0,
    evidence TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_micros INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    requested_model TEXT NOT NULL DEFAULT '',
    routed_model TEXT NOT NULL DEFAULT '',
    served_model TEXT NOT NULL DEFAULT '',
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    ttft_ms INTEGER NOT NULL DEFAULT 0,
    affinity_key TEXT NOT NULL DEFAULT '',
    prompt_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);

CREATE TABLE video_idempotency (
    api_key_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    task_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY(api_key_id,idempotency_key),
    FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE TABLE video_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    upstream_id TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    next_poll_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    upstream_key TEXT NOT NULL DEFAULT '',
    channel_snapshot TEXT NOT NULL DEFAULT '{}',
    upstream_base TEXT NOT NULL DEFAULT '',
    upstream_model TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    reference_file_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE wallet_entries (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    delta_micros INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT UNIQUE,
    balance_micros INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE wallets (
    workspace_id TEXT PRIMARY KEY,
    balance_micros INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TEXT NOT NULL,
    reserved_micros INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE weekly_digest_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    UNIQUE(user_id,period_start),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE workspace_invites (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(workspace_id,email)
);

CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id,user_id),
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'personal',
    created_at TEXT NOT NULL,
    allow_platform_channels INTEGER NOT NULL DEFAULT 1,
    settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX billing_reservations_key_state ON billing_reservations(api_key_id,state);
CREATE INDEX conversation_affinity_updated ON conversation_affinity(updated_at);
CREATE INDEX eval_runs_workspace_created ON eval_runs(workspace_id,created_at DESC);
CREATE INDEX jev_decisions_created ON jev_decisions(created_at);
CREATE INDEX jev_decisions_workspace_created ON jev_decisions(workspace_id,created_at DESC);
CREATE INDEX media_download_tokens_expiry ON media_download_tokens(expires_at);
CREATE INDEX notification_events_due ON notification_events(status,next_attempt_at);
CREATE INDEX password_reset_limits_window ON password_reset_limits(window_started_at);
CREATE INDEX product_announcements_published ON product_announcements(published_at DESC);
CREATE INDEX product_notification_events_announcement ON product_notification_events(announcement_id,created_at);
CREATE INDEX product_notification_events_due ON product_notification_events(status,next_attempt_at);
CREATE INDEX prompt_logs_key_created ON prompt_logs(api_key_id,created_at DESC);
CREATE INDEX prompt_logs_workspace_created ON prompt_logs(workspace_id,created_at DESC);
CREATE INDEX prompt_logs_workspace_request_sequence ON prompt_logs(workspace_id,request_id,api_key_id,sequence);
CREATE INDEX security_incidents_created ON security_incidents(created_at);
CREATE INDEX security_incidents_workspace_created ON security_incidents(workspace_id,created_at DESC);
CREATE INDEX usage_workspace_created_idx ON usage_records(workspace_id,created_at DESC);
CREATE INDEX wallet_entries_workspace_created ON wallet_entries(workspace_id,created_at DESC);
CREATE INDEX weekly_digest_events_due ON weekly_digest_events(status,next_attempt_at);
CREATE INDEX workspace_invites_expiry ON workspace_invites(workspace_id,expires_at);
