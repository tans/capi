import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { startVideoTaskWorker } from "../video/worker";
import { DB_PATH, defaultSettings, envOverrides, type RelaySettings } from "./config";
import type { Ability, ApiKey, Channel, Group, RelayData, UsageRecord } from "./types";

/** Complete SQLite schema applied directly while the project is pre-launch. */
const INITIAL_SCHEMA = [
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
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
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
      reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units >= 0)
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
      reserved_units INTEGER NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
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
      original_text TEXT NOT NULL,
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
  `,
];

export type VideoTask = {
  id: string;
  workspaceId: number;
  keyId: number;
  channelId: number | null;
  upstreamId: string | null;
  upstreamKey: string | null;
  model: string;
  request: Record<string, unknown>;
  quoteUnits: number;
  state: "submitting" | "running" | "succeeded" | "failed" | "unknown";
  resultUrl: string | null;
  error: string | null;
  nextPollAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type ChannelConfig = Omit<Channel, "id" | "ownerType" | "workspaceId" | "usedQuota" | "responseTime" | "createdTime">;
type KeyConfig = Omit<ApiKey, "id" | "userId" | "workspaceId" | "key" | "budgetLimitQuota" | "budgetSpentQuota" | "createdTime" | "accessedTime">;
type ChannelRow = {
  id: number;
  owner_type: Channel["ownerType"];
  workspace_id: number | null;
  config: string;
  used_quota: number;
  response_time: number;
  created_time: number;
};
type KeyRow = {
  id: number;
  user_id: number;
  workspace_id: number;
  key_hash: string;
  key_prefix: string;
  config: string;
  budget_limit_units: number | null;
  budget_spent_units: number;
  created_time: number;
  accessed_time: number;
};

function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function keyPrefix(key: string): string {
  return `${key.slice(0, 14)}${"•".repeat(8)}${key.slice(-4)}`;
}

function channelFromRow(row: ChannelRow): Channel {
  return {
    ...JSON.parse(row.config) as ChannelConfig,
    id: row.id,
    ownerType: row.owner_type,
    ...(row.workspace_id === null ? {} : { workspaceId: row.workspace_id }),
    usedQuota: row.used_quota,
    responseTime: row.response_time,
    createdTime: row.created_time,
  };
}

function keyFromRow(row: KeyRow): ApiKey {
  return {
    ...JSON.parse(row.config) as KeyConfig,
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    key: row.key_prefix,
    budgetLimitQuota: row.budget_limit_units,
    budgetSpentQuota: row.budget_spent_units,
    createdTime: row.created_time,
    accessedTime: row.accessed_time,
  };
}

type GroupRow = {
  id: number;
  name: string;
  display_name: string;
  ratio: number;
  description: string;
  status: Group["status"];
  created_at: number;
};

function groupFromRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    ratio: row.ratio,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

function openDatabase(filename: string): Database {
  const file = filename === ":memory:" ? filename : path.resolve(process.cwd(), filename);
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file, { create: true, strict: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    db.transaction(() => {
      // The application has not shipped yet. Initialize the complete schema
      // once when the shared database connection is created at startup.
      for (const statement of INITIAL_SCHEMA) db.exec(statement);
    }).immediate();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export type NewChannelInput = Omit<Channel, "id" | "ownerType" | "workspaceId" | "usedQuota" | "responseTime" | "createdTime"> & Pick<Partial<Channel>, "ownerType" | "workspaceId">;
export type NewKeyInput = Omit<ApiKey, "id" | "budgetSpentQuota" | "createdTime" | "accessedTime">;
export type NewGroupInput = Omit<Group, "id" | "createdAt">;

/** SQLite is authoritative; returned domain objects are detached snapshots. */
export class RelayRegistry {
  private readonly db: Database;
  readonly database: Database;
  private index = new Map<string, Map<string, number[]>>();
  private indexVersion = -1;
  private pollingCursor = new Map<number, number>();

  constructor(filename: string = DB_PATH) {
    this.database = openDatabase(filename);
    this.db = this.database;
    this.seedDefaultGroups();
  }

  /** A consistent compatibility snapshot, never a mutable persistence cache. */
  get data(): RelayData {
    return this.db.transaction(() => {
      const sequence = this.db.query<{ name: string; seq: number }, []>("SELECT name, seq FROM sqlite_sequence").all();
      return {
        version: INITIAL_SCHEMA.length,
        channels: this.listChannels(),
        keys: this.listKeys(),
        usage: this.listUsage().reverse(),
        settings: this.storedSettings(),
        seq: {
          channel: sequence.find((row) => row.name === "channels")?.seq ?? 0,
          key: sequence.find((row) => row.name === "api_keys")?.seq ?? 0,
        },
      };
    })();
  }

  private storedSettings(): Partial<RelaySettings> {
    const row = this.db.query<{ config: string }, []>("SELECT config FROM settings WHERE id = 1").get();
    return row ? JSON.parse(row.config) as Partial<RelaySettings> : {};
  }

  /**
   * SQLite is authoritative; group ratios come from the `groups` table, never from
   * the settings JSON, so pricing and the admin group editor share one source.
   */
  get settings(): RelaySettings {
    return { ...defaultSettings, ...this.storedSettings(), groupRatio: this.groupRatios(), ...envOverrides() };
  }

  async updateSettings(patch: Partial<RelaySettings>): Promise<RelaySettings> {
    this.db.transaction(() => {
      const config = JSON.stringify({ ...this.storedSettings(), ...patch });
      this.db.query("INSERT INTO settings (id, config) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET config = excluded.config").run(config);
    }).immediate();
    return this.settings;
  }

  listChannels(): Channel[] {
    return this.db.query<ChannelRow, []>("SELECT * FROM channels ORDER BY id").all().map(channelFromRow);
  }

  getChannel(id: number): Channel | undefined {
    const row = this.db.query<ChannelRow, [number]>("SELECT * FROM channels WHERE id = ?").get(id);
    return row ? channelFromRow(row) : undefined;
  }

  workspaceAllowsPlatformChannels(workspaceId: number): boolean {
    const row = this.db.query<{ allow_platform_channels: number }, [number]>("SELECT allow_platform_channels FROM workspaces WHERE id = ?").get(workspaceId);
    return row?.allow_platform_channels === 1;
  }

  async createChannel(input: NewChannelInput): Promise<Channel> {
    const { ownerType = "platform", workspaceId, ...config } = input;
    const row = this.db.query<ChannelRow, [Channel["ownerType"], number | null, string, number]>(
      "INSERT INTO channels (owner_type, workspace_id, config, created_time) VALUES (?, ?, ?, ?) RETURNING *",
    ).get(ownerType, workspaceId ?? null, JSON.stringify(config), Date.now())!;
    this.indexVersion = -1;
    return channelFromRow(row);
  }

  async updateChannel(id: number, patch: Partial<NewChannelInput>): Promise<Channel | undefined> {
    return this.db.transaction(() => {
      const row = this.db.query<ChannelRow, [number]>("SELECT * FROM channels WHERE id = ?").get(id);
      if (!row) return undefined;
      const { ownerType = row.owner_type, workspaceId = row.workspace_id ?? undefined, ...configPatch } = patch;
      const config = JSON.stringify({ ...JSON.parse(row.config) as ChannelConfig, ...configPatch });
      const updated = this.db.query<ChannelRow, [Channel["ownerType"], number | null, string, number]>(
        "UPDATE channels SET owner_type = ?, workspace_id = ?, config = ? WHERE id = ? RETURNING *",
      ).get(ownerType, workspaceId ?? null, config, id)!;
      this.indexVersion = -1;
      return channelFromRow(updated);
    }).immediate();
  }

  async deleteChannel(id: number): Promise<boolean> {
    const { changes } = this.db.query("DELETE FROM channels WHERE id = ?").run(id);
    this.indexVersion = -1;
    this.pollingCursor.delete(id);
    return changes > 0;
  }

  /**
   * Pre-launch bootstrap: the built-in groups exist until an administrator changes them.
   * Seeding runs only while the table is empty, so deletions survive restarts.
   */
  private seedDefaultGroups(): void {
    const count = this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM groups").get()?.count ?? 0;
    if (count > 0) return;
    const insert = this.db.query("INSERT INTO groups (name, display_name, ratio, status, description, created_at) VALUES (?, ?, ?, 1, '', ?)");
    const now = Date.now();
    this.db.transaction(() => {
      for (const [name, ratio] of Object.entries(defaultSettings.groupRatio)) {
        insert.run(name, name.charAt(0).toUpperCase() + name.slice(1), ratio, now);
      }
    }).immediate();
  }

  listGroups(): Group[] {
    return this.db.query<GroupRow, []>("SELECT * FROM groups ORDER BY name").all().map(groupFromRow);
  }

  getGroup(id: number): Group | undefined {
    const row = this.db.query<GroupRow, [number]>("SELECT * FROM groups WHERE id = ?").get(id);
    return row ? groupFromRow(row) : undefined;
  }

  /** Pricing reads group ratios through `settings.groupRatio`, projected from this table. */
  groupRatios(): Record<string, number> {
    return Object.fromEntries(
      this.db.query<{ name: string; ratio: number }, []>("SELECT name, ratio FROM groups").all()
        .map((row) => [row.name, row.ratio]),
    );
  }

  /** Returns undefined when the name is already taken; names are the group identifier. */
  createGroup(input: NewGroupInput): Group | undefined {
    if (this.db.query("SELECT 1 FROM groups WHERE name = ?").get(input.name)) return undefined;
    const row = this.db.query<GroupRow, [string, string, number, string, Group["status"], number]>(
      "INSERT INTO groups (name, display_name, ratio, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    ).get(input.name, input.displayName, input.ratio, input.description, input.status, Date.now())!;
    this.indexVersion = -1;
    return groupFromRow(row);
  }

  /** `name` stays immutable because channels and API keys reference it verbatim. */
  updateGroup(id: number, patch: Partial<Omit<NewGroupInput, "name">>): Group | undefined {
    return this.db.transaction(() => {
      const current = this.getGroup(id);
      if (!current) return undefined;
      const next = { ...current, ...patch };
      const row = this.db.query<GroupRow, [string, number, string, Group["status"], number]>(
        "UPDATE groups SET display_name = ?, ratio = ?, description = ?, status = ? WHERE id = ? RETURNING *",
      ).get(next.displayName, next.ratio, next.description, next.status, id)!;
      this.indexVersion = -1;
      return groupFromRow(row);
    }).immediate();
  }

  /** Deleting a group detaches it from channels and clears it from keys in one transaction. */
  deleteGroup(id: number): boolean {
    return this.db.transaction(() => {
      const current = this.getGroup(id);
      if (!current) return false;
      const name = current.name;
      const channels = this.db.query<{ id: number; config: string }, [string]>(
        "SELECT id, config FROM channels WHERE EXISTS (SELECT 1 FROM json_each(config, '$.groups') WHERE json_each.value = ?)",
      ).all(name);
      const update = this.db.query("UPDATE channels SET config = ? WHERE id = ?");
      for (const channel of channels) {
        const config = JSON.parse(channel.config) as ChannelConfig;
        const groups = config.groups.filter((group) => group !== name);
        update.run(JSON.stringify({ ...config, groups: groups.length ? groups : ["default"] }), channel.id);
      }
      this.db.query("UPDATE api_keys SET config = json_set(config, '$.group', '') WHERE json_extract(config, '$.group') = ?").run(name);
      this.db.query("DELETE FROM groups WHERE id = ?").run(id);
      this.indexVersion = -1;
      return true;
    }).immediate();
  }
  getWorkspaceWallet(workspaceId: number): { balanceUnits: number; reservedUnits: number } | undefined {
    const row = this.db.query<{ balance_units: number; reserved_units: number }, [number]>("SELECT balance_units, reserved_units FROM wallets WHERE workspace_id = ?").get(workspaceId);
    return row ? { balanceUnits: row.balance_units, reservedUnits: row.reserved_units } : undefined;
  }

  canChargeJev(workspaceId: number, units: number): boolean {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    const wallet = this.db.query<{ balance_units: number; reserved_units: number }, [number]>("SELECT balance_units, reserved_units FROM wallets WHERE workspace_id = ?").get(workspaceId);
    return Boolean(wallet && wallet.balance_units - wallet.reserved_units >= units);
  }

  chargeJev(requestId: string, workspaceId: number, units: number, reason = "JEV decision") : boolean {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    return this.db.transaction(() => {
      const idempotencyKey = `jev:${requestId}`;
      const existing = this.db.query<{ id: number }, [string]>("SELECT id FROM wallet_entries WHERE idempotency_key = ?").get(idempotencyKey);
      if (existing) return true;
      const now = Date.now();
      const wallet = this.db.query("UPDATE wallets SET balance_units = balance_units - ? WHERE workspace_id = ? AND balance_units - reserved_units >= ?").run(units, workspaceId, units);
      if (wallet.changes !== 1) return false;
      const schema = this.db.query<{ sql: string }, [string]>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get("wallet_entries")?.sql ?? "";
      const kind = schema.includes("jev_evaluation") ? "jev_evaluation" : "charge";
      this.db.query(
        "INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(workspaceId, kind, -units, idempotencyKey, `${reason}${kind === "charge" ? " [jev_evaluation]" : ""}`, now);
      return true;
    }).immediate();
  }

  recordJevDecision(input: {
    workspaceId: number;
    requestId: string;
    keyId: number;
    originalText: string;
    routeIntent: string | null;
    routeComplexity: string | null;
    routeConfidence: number | null;
    securityCategories: string[];
    securitySeverity: "none" | "low" | "high" | "unavailable";
    securityConfidence: number | null;
    detector: "jev" | "disabled" | "unavailable";
    jevRequestId: string | null;
    promptTokens: number;
    quotaUnits: number;
  }): void {
    this.db.transaction(() => {
      this.db.query(
        `INSERT OR REPLACE INTO jev_decisions
          (workspace_id, request_id, key_id, original_text, route_intent, route_complexity, route_confidence,
           security_categories, security_severity, security_confidence, detector, jev_request_id, prompt_tokens, quota_units, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.workspaceId, input.requestId, input.keyId, input.originalText, input.routeIntent, input.routeComplexity, input.routeConfidence,
        JSON.stringify(input.securityCategories), input.securitySeverity, input.securityConfidence, input.detector, input.jevRequestId,
        input.promptTokens, input.quotaUnits, Date.now());
      const day = new Date().toISOString().slice(0, 10);
      this.db.query(
        `INSERT INTO jev_daily_stats (workspace_id, day, requests, route_light, route_standard, route_advanced, security_low, security_high, unavailable, quota_units)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, day) DO UPDATE SET
           requests = requests + 1,
           route_light = route_light + excluded.route_light,
           route_standard = route_standard + excluded.route_standard,
           route_advanced = route_advanced + excluded.route_advanced,
           security_low = security_low + excluded.security_low,
           security_high = security_high + excluded.security_high,
           unavailable = unavailable + excluded.unavailable,
           quota_units = quota_units + excluded.quota_units`,
      ).run(input.workspaceId, day, Number(input.routeComplexity === "light"), Number(input.routeComplexity === "standard"), Number(input.routeComplexity === "advanced"),
        Number(input.securitySeverity === "low"), Number(input.securitySeverity === "high"), Number(input.detector === "unavailable"), input.quotaUnits);
    }).immediate();
  }

  recordSecurityIncident(input: {
    workspaceId: number;
    requestId: string;
    keyId: number;
    severity: "low" | "high" | "critical";
    categories: string[];
    confidence: number;
    evidence: Record<string, unknown>;
  }): void {
    this.db.query(
      `INSERT OR IGNORE INTO security_incidents
        (workspace_id, request_id, key_id, direction, severity, detector, categories, confidence, evidence, created_at)
       VALUES (?, ?, ?, 'input', ?, 'jev', ?, ?, ?, ?)`,
    ).run(input.workspaceId, input.requestId, input.keyId, input.severity, JSON.stringify(input.categories), input.confidence, JSON.stringify(input.evidence), Date.now());
  }

  listSecurityIncidents(workspaceId: number, options: { limit?: number; status?: string } = {}): Array<Record<string, unknown>> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const statusClause = options.status ? " AND status = ?" : "";
    const params = options.status ? [workspaceId, options.status, limit] : [workspaceId, limit];
    return this.db.query<Record<string, unknown>, (number | string)[]>(
      `SELECT id, request_id, key_id, direction, severity, detector, categories, confidence, evidence, status, created_at, resolved_at, resolved_by
       FROM security_incidents WHERE workspace_id = ?${statusClause} ORDER BY created_at DESC LIMIT ?`,
    ).all(...params).map((row) => ({ ...row, categories: JSON.parse(row.categories as string), evidence: JSON.parse(row.evidence as string) }));
  }

  listJevDecisions(workspaceId: number, options: { limit?: number; userId?: number } = {}): Array<Record<string, unknown>> {
    this.db.query("DELETE FROM jev_decisions WHERE created_at < ?").run(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const userClause = options.userId === undefined ? "" : " AND k.user_id = ?";
    const params = options.userId === undefined ? [workspaceId, limit] : [workspaceId, options.userId, limit];
    return this.db.query<Record<string, unknown>, (number | string)[]>(
      `SELECT d.id, d.request_id, d.key_id, d.original_text, d.route_intent, d.route_complexity, d.route_confidence,
              d.security_categories, d.security_severity, d.security_confidence, d.detector, d.jev_request_id, d.prompt_tokens, d.quota_units, d.created_at,
              k.user_id
       FROM jev_decisions d JOIN api_keys k ON k.id = d.key_id
       WHERE d.workspace_id = ?${userClause} ORDER BY d.created_at DESC LIMIT ?`,
    ).all(...params).map((row) => ({ ...row, security_categories: JSON.parse(row.security_categories as string) }));
  }

  listJevDailyStats(workspaceId: number): Array<Record<string, unknown>> {
    return this.db.query<Record<string, unknown>, [number]>("SELECT * FROM jev_daily_stats WHERE workspace_id = ? ORDER BY day DESC LIMIT 90").all(workspaceId);
  }

  updateSecurityIncident(id: number, workspaceId: number, status: string, userId: number, severity?: string): boolean {
    if (!("open reviewing resolved false_positive".split(" ").includes(status))) return false;
    if (severity && !("low high critical".split(" ").includes(severity))) return false;
    return this.db.query(`UPDATE security_incidents SET status = ?, severity = COALESCE(?, severity), resolved_at = ?, resolved_by = ? WHERE id = ? AND workspace_id = ?`).run(status, severity ?? null, status === "resolved" || status === "false_positive" ? Date.now() : null, status === "resolved" || status === "false_positive" ? userId : null, id, workspaceId).changes > 0;
  }

  /** Atomically reserve workspace wallet capacity and API-key budget capacity. */
  async reserveBilling(requestId: string, workspaceId: number, keyId: number, units: number): Promise<boolean> {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    const now = Date.now();
    return this.db.transaction(() => {
      const existing = this.db.query<{ state: string }, [string]>("SELECT state FROM billing_requests WHERE request_id = ?").get(requestId);
      if (existing) {
        if (existing.state === "settled") return true;
        if (existing.state === "reserved") return true;
        if (existing.state !== "released") return false;
      }
      const key = this.db.query<{ budget_limit_units: number | null; budget_spent_units: number }, [number, number]>("SELECT budget_limit_units, budget_spent_units FROM api_keys WHERE id = ? AND workspace_id = ?").get(keyId, workspaceId);
      if (!key || (key.budget_limit_units !== null && key.budget_spent_units >= key.budget_limit_units)) return false;
      const activeForKey = this.db.query<{ units: number }, [number, number]>(
        "SELECT COALESCE(SUM(reserved_units), 0) AS units FROM billing_requests WHERE key_id = ? AND workspace_id = ? AND state = 'reserved'",
      ).get(keyId, workspaceId)?.units ?? 0;
      if (key.budget_limit_units !== null && key.budget_spent_units + activeForKey + units > key.budget_limit_units) return false;
      const wallet = this.db.query(
        "UPDATE wallets SET reserved_units = reserved_units + ? WHERE workspace_id = ? AND balance_units - reserved_units >= ?",
      ).run(units, workspaceId, units);
      if (wallet.changes !== 1) return false;
      if (existing) {
        return this.db.query(
          "UPDATE billing_requests SET state = 'reserved', reserved_units = ?, lease_expires_at = ?, updated_at = ? WHERE request_id = ? AND state = 'released'",
        ).run(units, now + 15 * 60 * 1000, now, requestId).changes === 1;
      }
      this.db.query("INSERT INTO billing_requests (request_id, workspace_id, key_id, state, reserved_units, lease_expires_at, created_at, updated_at) VALUES (?, ?, ?, 'reserved', ?, ?, ?, ?)").run(requestId, workspaceId, keyId, units, now + 15 * 60 * 1000, now, now);
      return true;
    }).immediate();
  }

  async finalizeBilling(requestId: string, chargedUnits: number, outcome: "settled" | "released" | "unknown"): Promise<boolean> {
    if (!Number.isSafeInteger(chargedUnits) || chargedUnits < 0) return false;
    return this.db.transaction(() => {
      const request = this.db.query<{ workspace_id: number; key_id: number; state: string; reserved_units: number }, [string]>("SELECT workspace_id, key_id, state, reserved_units FROM billing_requests WHERE request_id = ?").get(requestId);
      if (!request) return false;
      if (request.state === "settled" || request.state === "released" || request.state === "unknown") return request.state === outcome;
      const now = Date.now();
      const release = request.reserved_units;
      if (outcome === "settled" && chargedUnits > 0) {
        const wallet = this.db.query(
          "UPDATE wallets SET balance_units = balance_units - ?, reserved_units = reserved_units - ? WHERE workspace_id = ? AND reserved_units >= ? AND balance_units - reserved_units + ? >= ?",
        ).run(chargedUnits, release, request.workspace_id, release, release, chargedUnits);
        if (wallet.changes !== 1) return false;
        const key = this.db.query("UPDATE api_keys SET budget_spent_units = budget_spent_units + ?, accessed_time = ? WHERE id = ? AND workspace_id = ?").run(chargedUnits, now, request.key_id, request.workspace_id);
        if (key.changes !== 1) throw new Error("billing account missing");
        this.db.query("INSERT INTO wallet_entries (workspace_id, request_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, ?, 'charge', ?, ?, 'Relay usage settlement', ?)").run(request.workspace_id, requestId, -chargedUnits, `settle:${requestId}`, now);
      } else {
        const wallet = this.db.query("UPDATE wallets SET reserved_units = reserved_units - ? WHERE workspace_id = ? AND reserved_units >= ?").run(release, request.workspace_id, release);
        if (wallet.changes !== 1) return false;
      }
      return this.db.query("UPDATE billing_requests SET state = ?, reserved_units = 0, settled_units = ?, updated_at = ? WHERE request_id = ? AND state = 'reserved'").run(outcome, outcome === "settled" ? chargedUnits : 0, now, requestId).changes === 1;
    }).immediate();
  }

  async markExpiredBillingUnknown(): Promise<number> {
    const now = Date.now();
    return this.db.transaction(() => {
      const expired = this.db.query<{ request_id: string; workspace_id: number; reserved_units: number }, [number]>(
        "SELECT request_id, workspace_id, reserved_units FROM billing_requests WHERE state = 'reserved' AND lease_expires_at <= ?",
      ).all(now);
      for (const request of expired) {
        const wallet = this.db.query("UPDATE wallets SET reserved_units = reserved_units - ? WHERE workspace_id = ? AND reserved_units >= ?").run(request.reserved_units, request.workspace_id, request.reserved_units);
        if (wallet.changes !== 1) continue;
        this.db.query("UPDATE billing_requests SET state = 'unknown', reserved_units = 0, updated_at = ? WHERE request_id = ? AND state = 'reserved'").run(now, request.request_id);
      }
      return expired.length;
    }).immediate();
  }
  countActiveVideoTasks(workspaceId: number): number {
    return this.db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM video_tasks WHERE workspace_id = ? AND state IN ('submitting', 'running', 'unknown')").get(workspaceId)?.count ?? 0;
  }

  /** Atomically enforce the workspace concurrency limit and create the task. */
  createVideoTaskIfCapacity(task: VideoTask, limit = 3): boolean {
    return this.db.transaction(() => {
      const active = this.db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM video_tasks WHERE workspace_id = ? AND state IN ('submitting', 'running', 'unknown')").get(task.workspaceId)?.count ?? 0;
      if (active >= limit) return false;
      this.db.query("INSERT INTO video_tasks (id, workspace_id, key_id, channel_id, upstream_id, upstream_key, model, request, quote_units, state, result_url, error, next_poll_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(task.id, task.workspaceId, task.keyId, task.channelId, task.upstreamId, task.upstreamKey, task.model, JSON.stringify(task.request), task.quoteUnits, task.state, task.resultUrl, task.error, task.nextPollAt, task.createdAt, task.updatedAt);
      return true;
    }).immediate();
  }

  listKeys(): ApiKey[] {
    return this.db.query<KeyRow, []>("SELECT * FROM api_keys ORDER BY id").all().map(keyFromRow);
  }

  getKey(id: number): ApiKey | undefined {
    const row = this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id);
    return row ? keyFromRow(row) : undefined;
  }
  createVideoTask(task: VideoTask): void {
    this.db.query(`INSERT INTO video_tasks (id, workspace_id, key_id, channel_id, upstream_id, upstream_key, model, request, quote_units, state, result_url, error, next_poll_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(task.id, task.workspaceId, task.keyId, task.channelId, task.upstreamId, task.upstreamKey, task.model, JSON.stringify(task.request), task.quoteUnits, task.state, task.resultUrl, task.error, task.nextPollAt, task.createdAt, task.updatedAt);
  }

  getVideoTask(id: string): VideoTask | undefined {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM video_tasks WHERE id = ?").get(id);
    if (!row) return undefined;
    return { id: row.id as string, workspaceId: row.workspace_id as number, keyId: row.key_id as number, channelId: row.channel_id as number | null, upstreamId: row.upstream_id as string | null, upstreamKey: row.upstream_key as string | null, model: row.model as string, request: JSON.parse(row.request as string) as Record<string, unknown>, quoteUnits: row.quote_units as number, state: row.state as VideoTask["state"], resultUrl: row.result_url as string | null, error: row.error as string | null, nextPollAt: row.next_poll_at as number | null, createdAt: row.created_at as number, updatedAt: row.updated_at as number };
  }

  updateVideoTask(id: string, patch: Partial<Pick<VideoTask, "upstreamId" | "upstreamKey" | "state" | "resultUrl" | "error" | "nextPollAt">>): VideoTask | undefined {
    const current = this.getVideoTask(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    this.db.query("UPDATE video_tasks SET upstream_id = ?, upstream_key = ?, state = ?, result_url = ?, error = ?, next_poll_at = ?, updated_at = ? WHERE id = ?").run(next.upstreamId, next.upstreamKey, next.state, next.resultUrl, next.error, next.nextPollAt, next.updatedAt, id);
    return next;
  }
  listDueVideoTasks(now = Date.now()): VideoTask[] {
    const rows = this.db.query<Record<string, unknown>, [number]>("SELECT * FROM video_tasks WHERE upstream_id IS NOT NULL AND state IN ('running', 'unknown') AND (next_poll_at IS NULL OR next_poll_at <= ?) ORDER BY COALESCE(next_poll_at, 0) LIMIT 20").all(now);
    return rows.map((row) => ({ id: row.id as string, workspaceId: row.workspace_id as number, keyId: row.key_id as number, channelId: row.channel_id as number | null, upstreamId: row.upstream_id as string | null, upstreamKey: row.upstream_key as string | null, model: row.model as string, request: JSON.parse(row.request as string) as Record<string, unknown>, quoteUnits: row.quote_units as number, state: row.state as VideoTask["state"], resultUrl: row.result_url as string | null, error: row.error as string | null, nextPollAt: row.next_poll_at as number | null, createdAt: row.created_at as number, updatedAt: row.updated_at as number }));
  }


  getKeyByKeyValue(key: string): ApiKey | undefined {
    const row = this.db.query<KeyRow, [string]>("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash(key));
    return row ? keyFromRow(row) : undefined;
  }

  async createKey(input: NewKeyInput): Promise<ApiKey> {
    const { key, userId, workspaceId, budgetLimitQuota, ...config } = input;
    const row = this.db.query<KeyRow, [number, number, string, string, string, number | null, number]>(
      `INSERT INTO api_keys (user_id, workspace_id, key_hash, key_prefix, config, budget_limit_units, created_time)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).get(userId, workspaceId, keyHash(key), keyPrefix(key), JSON.stringify(config), budgetLimitQuota, Date.now())!;
    return { ...keyFromRow(row), key };
  }

  async updateKey(id: number, patch: Partial<NewKeyInput>): Promise<ApiKey | undefined> {
    return this.db.transaction(() => {
      const current = this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id);
      if (!current) return undefined;
      const { key, userId = current.user_id, workspaceId = current.workspace_id, budgetLimitQuota = current.budget_limit_units, ...configPatch } = patch;
      const config = { ...JSON.parse(current.config) as KeyConfig, ...configPatch };
      const row = this.db.query<KeyRow, [number, number, string, string, string, number | null, number]>(
        `UPDATE api_keys SET user_id = ?, workspace_id = ?, key_hash = ?, key_prefix = ?, config = ?, budget_limit_units = ?
         WHERE id = ? RETURNING *`,
      ).get(userId, workspaceId, key ? keyHash(key) : current.key_hash, key ? keyPrefix(key) : current.key_prefix, JSON.stringify(config), budgetLimitQuota, id)!;
      return key ? { ...keyFromRow(row), key } : keyFromRow(row);
    }).immediate();
  }

  /** Preserve auditable usage and billing references while immediately revoking the credential. */
  async deleteKey(id: number): Promise<boolean> {
    return this.db.query(
      "UPDATE api_keys SET config = json_set(config, '$.status', 2) WHERE id = ? AND json_extract(config, '$.status') = 1",
    ).run(id).changes > 0;
  }

  /** Usage and channel accounting commit together. Audit records are retained without an arbitrary global cap. */
  async recordUsage(record: UsageRecord): Promise<void> {
    this.db.transaction(() => {
      this.db.query(
        `INSERT INTO usage_records (request_id, workspace_id, key_id, channel_id, created_at, model, prompt_tokens, completion_tokens, cached_tokens, quota_units, success, status_code, record)
         SELECT ?, workspace_id, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM api_keys WHERE id = ?`,
      ).run(record.requestId, record.channelId, record.createdAt, record.model, record.promptTokens, record.completionTokens, record.cachedTokens, record.quota, Number(record.success), record.statusCode, JSON.stringify(record), record.keyId);
      if (record.channelId !== null) {
        this.db.query(
          `UPDATE channels SET used_quota = used_quota + ?,
            response_time = CASE WHEN response_time = 0 THEN ? ELSE ROUND(response_time * 0.7 + ? * 0.3) END
          WHERE id = ?`,
        ).run(record.quota, record.firstByteMs, record.firstByteMs, record.channelId);
      }
    }).immediate();
  }

  listUsage(filter: { keyId?: number; days?: number } = {}): UsageRecord[] {
    const clauses: string[] = [];
    const parameters: number[] = [];
    if (filter.keyId !== undefined) {
      clauses.push("key_id = ?");
      parameters.push(filter.keyId);
    }
    if (filter.days !== undefined) {
      clauses.push("created_at >= ?");
      parameters.push(Date.now() - filter.days * 24 * 60 * 60 * 1000);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.query<{ record: string }, number[]>(`SELECT record FROM usage_records${where} ORDER BY sequence DESC`)
      .all(...parameters).map((row) => JSON.parse(row.record) as UsageRecord);
  }

  /** Rebuild the routing cache from one database snapshot. */
  rebuildIndex(): void {
    this.db.transaction(() => {
      const version = this.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
      const index = new Map<string, Map<string, number[]>>();
      const disabled = new Set(
        this.db.query<{ name: string }, []>("SELECT name FROM groups WHERE status <> 1").all().map((row) => row.name),
      );
      const channels = this.listChannels().filter((channel) => channel.status === 1);
      const priorities = new Map(channels.map((channel) => [channel.id, channel.priority]));
      for (const channel of channels) {
        for (const group of channel.groups) {
          if (disabled.has(group)) continue;
          let models = index.get(group);
          if (!models) {
            models = new Map();
            index.set(group, models);
          }
          for (const model of channel.models) {
            const ids = models.get(model) ?? [];
            ids.push(channel.id);
            models.set(model, ids);
          }
        }
      }
      for (const models of index.values()) {
        for (const ids of models.values()) {
          ids.sort((a, b) => priorities.get(b)! - priorities.get(a)!);
        }
      }
      this.index = index;
      this.indexVersion = version;
    })();
  }

  private ensureIndex(): void {
    const version = this.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
    if (version !== this.indexVersion) this.rebuildIndex();
  }

  candidateIds(group: string, model: string): number[] {
    this.ensureIndex();
    return [...(this.index.get(group)?.get(model) ?? [])];
  }

  abilities(): Ability[] {
    return this.db.transaction(() => {
      this.ensureIndex();
      const channels = new Map(this.listChannels().map((channel) => [channel.id, channel]));
      const rows: Ability[] = [];
      for (const [group, models] of this.index) {
        for (const [model, ids] of models) {
          for (const id of ids) {
            const channel = channels.get(id)!;
            rows.push({ group, model, channelId: id, enabled: true, priority: channel.priority, weight: channel.weight, tag: channel.tag });
          }
        }
      }
      return rows;
    })();
  }

  groupModels(group: string): string[] {
    this.ensureIndex();
    return [...(this.index.get(group)?.keys() ?? [])].sort();
  }

  hasUpstreamKey(channel: Channel, excludeKeys: readonly string[] = []): boolean {
    return channel.keys.some((key) => key && !excludeKeys.includes(key));
  }

  pickUpstreamKey(channel: Channel, excludeKeys: readonly string[] = []): string | undefined {
    const keys = channel.keys.filter((key) => key && !excludeKeys.includes(key));
    if (keys.length === 0) return undefined;
    if (channel.multiKeyMode === "random") return keys[Math.floor(Math.random() * keys.length)];
    const next = ((this.pollingCursor.get(channel.id) ?? -1) + 1) % keys.length;
    this.pollingCursor.set(channel.id, next);
    return keys[next];
  }

  /** Writes already commit durably; explicitly checkpoint the WAL when requested. */
  async persist(): Promise<void> {
    this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
  }
}

type GlobalWithRegistry = typeof globalThis & {
  __capiSqliteRelayRegistry?: { filename: string; registry: Promise<RelayRegistry> };
};

export async function getRegistry(): Promise<RelayRegistry> {
  const g = globalThis as GlobalWithRegistry;
  const filename = DB_PATH === ":memory:" ? DB_PATH : path.resolve(process.cwd(), DB_PATH);
  if (!g.__capiSqliteRelayRegistry || g.__capiSqliteRelayRegistry.filename !== filename) {
    const registry = Promise.resolve().then(() => new RelayRegistry(filename));
    void registry.then((instance) => startVideoTaskWorker(instance));
    g.__capiSqliteRelayRegistry = { filename, registry };
    void registry.catch(() => {
      if (g.__capiSqliteRelayRegistry?.registry === registry) delete g.__capiSqliteRelayRegistry;
    });
  }
  return g.__capiSqliteRelayRegistry.registry;
}
/** Shared connection for sibling server-side persistence modules and shared database access. */
export async function getDatabase(): Promise<Database> {
  return (await getRegistry()).database;
}
