/** Complete SQLite schema applied directly while the project is pre-launch. */
export const INITIAL_SCHEMA = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
      permission TEXT NOT NULL,
      PRIMARY KEY (role, permission)
    ) STRICT;
    INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
      ('user', 'dashboard:access'), ('user', 'keys:manage'),
      ('admin', 'dashboard:access'), ('admin', 'keys:manage'), ('admin', 'admin:access');
    INSERT OR IGNORE INTO users (email, name, password_hash, role, created_at)
      VALUES ('admin@capi.run', 'Platform Administrator', '$argon2id$v=19$m=65536,t=3,p=1$gbsUb5/vENjunBIfpbKemPBMCyUi9N+V4Y0H8puNt/s$ueAozkBO3mycKh+NEjhMmUyqA50JszePT+Vhsm963Fs', 'admin', unixepoch() * 1000);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      code_hash TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL CHECK (request_count > 0),
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config TEXT NOT NULL CHECK (json_valid(config)),
      saved_at INTEGER NOT NULL
    ) STRICT;
  `,
  `
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('personal', 'team')),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      timezone TEXT NOT NULL DEFAULT 'UTC',
      display_currency TEXT,
      display_symbol TEXT,
      display_rate REAL,
      allow_platform_channels INTEGER NOT NULL DEFAULT 1 CHECK (allow_platform_channels IN (0, 1)),
      created_by INTEGER NOT NULL REFERENCES users(id),
      personal_owner_user_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL,
      UNIQUE(personal_owner_user_id),
      CHECK ((kind = 'personal' AND personal_owner_user_id IS NOT NULL) OR (kind = 'team' AND personal_owner_user_id IS NULL))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS workspace_jev_settings (
      workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      auto_routing_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_routing_enabled IN (0, 1)),
      security_audit_enabled INTEGER NOT NULL DEFAULT 0 CHECK (security_audit_enabled IN (0, 1)),
      route_config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(route_config)),
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS combined_models (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      models TEXT NOT NULL CHECK (json_valid(models)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
      created_at INTEGER NOT NULL,
      UNIQUE(workspace_id, user_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS workspace_members_user ON workspace_members(user_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_workspace_owner
      ON workspace_members(workspace_id) WHERE role = 'owner' AND status = 'active';
    CREATE TABLE IF NOT EXISTS wallets (
      workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
      balance_units INTEGER NOT NULL DEFAULT 0,
      reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units = 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      CHECK (expires_at > created_at)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS workspace_invites_workspace ON workspace_invites(workspace_id, email);
  `,
  `
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      config TEXT NOT NULL CHECK (json_valid(config)),
      budget_limit_units INTEGER CHECK (budget_limit_units IS NULL OR budget_limit_units >= 0),
      budget_spent_units INTEGER NOT NULL DEFAULT 0 CHECK (budget_spent_units >= 0),
      created_time INTEGER NOT NULL,
      accessed_time INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members(workspace_id, user_id),
      UNIQUE(id, workspace_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS api_keys_workspace_user ON api_keys(workspace_id, user_id);
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'workspace')),
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      config TEXT NOT NULL CHECK (json_valid(config)),
      used_quota INTEGER NOT NULL DEFAULT 0,
      response_time REAL NOT NULL DEFAULT 0,
      created_time INTEGER NOT NULL,
      CHECK ((owner_type = 'platform' AND workspace_id IS NULL) OR (owner_type = 'workspace' AND workspace_id IS NOT NULL))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS channels_workspace ON channels(workspace_id);
    CREATE TABLE IF NOT EXISTS billing_requests (
      request_id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      key_id INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('reserved', 'settled', 'released', 'unknown')),
      reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units = 0),
      settled_units INTEGER NOT NULL DEFAULT 0 CHECK (settled_units >= 0),
      lease_expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (key_id, workspace_id) REFERENCES api_keys(id, workspace_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS billing_requests_lease ON billing_requests(state, lease_expires_at);
    CREATE TABLE IF NOT EXISTS wallet_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      request_id TEXT UNIQUE REFERENCES billing_requests(request_id),
      kind TEXT NOT NULL CHECK (kind IN ('opening', 'redeem', 'adjustment', 'refund', 'charge', 'jev_evaluation')),
      delta_units INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      actor_user_id INTEGER REFERENCES users(id),
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      CHECK ((kind IN ('opening', 'redeem', 'refund') AND delta_units >= 0) OR kind = 'adjustment' OR (kind IN ('charge', 'jev_evaluation') AND delta_units <= 0))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS wallet_entries_workspace ON wallet_entries(workspace_id, created_at);
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      amount_quota INTEGER NOT NULL CHECK (amount_quota > 0),
      redeemed_by INTEGER REFERENCES users(id),
      redeemed_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS redeem_code_credits (
      redeem_code_id INTEGER PRIMARY KEY REFERENCES redeem_codes(id),
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      wallet_entry_id INTEGER NOT NULL UNIQUE REFERENCES wallet_entries(id)
    ) STRICT;
  `,
  `
    CREATE TABLE IF NOT EXISTS usage_records (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      key_id INTEGER NOT NULL REFERENCES api_keys(id),
      channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL CHECK (prompt_tokens >= 0),
      completion_tokens INTEGER NOT NULL CHECK (completion_tokens >= 0),
      cached_tokens INTEGER NOT NULL CHECK (cached_tokens >= 0),
      quota_units INTEGER NOT NULL,
      success INTEGER NOT NULL CHECK (success IN (0, 1)),
      status_code INTEGER NOT NULL,
      record TEXT NOT NULL CHECK (json_valid(record))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS usage_records_workspace_time ON usage_records(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS usage_records_key_time ON usage_records(key_id, created_at);
    CREATE TABLE IF NOT EXISTS jev_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      route_intent TEXT,
      route_complexity TEXT,
      route_confidence REAL,
      security_categories TEXT NOT NULL CHECK (json_valid(security_categories)),
      security_severity TEXT NOT NULL CHECK (security_severity IN ('none', 'low', 'high', 'unavailable')),
      security_confidence REAL,
      detector TEXT NOT NULL CHECK (detector IN ('jev', 'disabled', 'unavailable')),
      jev_request_id TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      quota_units INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(workspace_id, request_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS jev_decisions_workspace_time ON jev_decisions(workspace_id, created_at);
    CREATE TABLE IF NOT EXISTS jev_decision_details (
      decision_id INTEGER PRIMARY KEY REFERENCES jev_decisions(id) ON DELETE CASCADE,
      original_text TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS jev_daily_stats (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      route_light INTEGER NOT NULL DEFAULT 0,
      route_standard INTEGER NOT NULL DEFAULT 0,
      route_advanced INTEGER NOT NULL DEFAULT 0,
      security_low INTEGER NOT NULL DEFAULT 0,
      security_high INTEGER NOT NULL DEFAULT 0,
      unavailable INTEGER NOT NULL DEFAULT 0,
      quota_units INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (workspace_id, day)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS security_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
      direction TEXT NOT NULL CHECK (direction = 'input'),
      severity TEXT NOT NULL CHECK (severity IN ('low', 'high', 'critical')),
      detector TEXT NOT NULL DEFAULT 'jev' CHECK (detector IN ('jev', 'disabled', 'unavailable', 'rule_fallback')),
      categories TEXT NOT NULL CHECK (json_valid(categories)),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      evidence TEXT NOT NULL CHECK (json_valid(evidence)),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'false_positive')),
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by INTEGER REFERENCES users(id),
      UNIQUE(workspace_id, request_id, direction)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS security_incidents_workspace_time ON security_incidents(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS security_incidents_workspace_status ON security_incidents(workspace_id, status, severity);
    CREATE TABLE IF NOT EXISTS video_tasks (
      id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      key_id INTEGER NOT NULL REFERENCES api_keys(id),
      channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
      upstream_id TEXT,
      upstream_key TEXT,
      model TEXT NOT NULL,
      request TEXT NOT NULL CHECK (json_valid(request)),
      quote_units INTEGER NOT NULL CHECK (quote_units >= 0),
      state TEXT NOT NULL CHECK (state IN ('submitting', 'running', 'succeeded', 'failed', 'unknown')),
      result_url TEXT,
      error TEXT,
      next_poll_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS video_tasks_upstream ON video_tasks(channel_id, upstream_id) WHERE upstream_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS video_tasks_poll ON video_tasks(state, next_poll_at);
    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      purpose TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    ) STRICT;
    CREATE INDEX IF NOT EXISTS media_files_workspace_time ON media_files(workspace_id, created_at);
    CREATE TABLE IF NOT EXISTS media_file_download_tokens (
      token_hash TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS media_file_download_expiry ON media_file_download_tokens(expires_at);
  `,
  // Groups are the routing and fee unit; settings holds the mutable relay configuration.
  `
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      ratio REAL NOT NULL DEFAULT 1 CHECK (ratio >= 0),
      description TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2)),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL CHECK (json_valid(config))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS email_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      smtp_host TEXT NOT NULL DEFAULT 'smtp.qq.com',
      smtp_port INTEGER NOT NULL DEFAULT 465 CHECK (smtp_port BETWEEN 1 AND 65535),
      smtp_secure INTEGER NOT NULL DEFAULT 1 CHECK (smtp_secure IN (0, 1)),
      smtp_starttls INTEGER NOT NULL DEFAULT 0 CHECK (smtp_starttls IN (0, 1)),
      smtp_user TEXT NOT NULL DEFAULT '',
      smtp_password TEXT NOT NULL DEFAULT '',
      from_name TEXT NOT NULL DEFAULT 'CAPI',
      from_address TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    ) STRICT;
  `,
];
