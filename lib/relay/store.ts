import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { DB_PATH, defaultSettings, envOverrides, type RelaySettings } from "./config";
import type { Ability, ApiKey, Channel, RelayData, UsageRecord } from "./types";

/** Keep the same bounded usage history as the relay API. */
const MAX_USAGE_RECORDS = 2000;

/** Each entry upgrades the previous PRAGMA user_version in one transaction. */
const MIGRATIONS = [
  `
    CREATE TABLE channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config TEXT NOT NULL CHECK (json_valid(config)),
      used_quota REAL NOT NULL DEFAULT 0,
      response_time REAL NOT NULL DEFAULT 0,
      created_time INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT NOT NULL,
      config TEXT NOT NULL CHECK (json_valid(config)),
      remain_quota REAL NOT NULL,
      unlimited_quota INTEGER NOT NULL CHECK (unlimited_quota IN (0, 1)),
      used_quota REAL NOT NULL DEFAULT 0,
      created_time INTEGER NOT NULL,
      accessed_time INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE INDEX api_keys_value ON api_keys(key_value);
    CREATE TABLE usage_records (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      record TEXT NOT NULL CHECK (json_valid(record))
    ) STRICT;
    CREATE INDEX usage_records_key_time ON usage_records(key_id, created_at);
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL CHECK (json_valid(config))
    ) STRICT;
  `,
  `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE role_permissions (
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
      permission TEXT NOT NULL,
      PRIMARY KEY (role, permission)
    ) STRICT;
    INSERT INTO role_permissions (role, permission) VALUES
      ('user', 'dashboard:access'), ('user', 'keys:manage'),
      ('admin', 'dashboard:access'), ('admin', 'keys:manage'), ('admin', 'admin:access');
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_user ON sessions(user_id);
    CREATE TABLE redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      amount_quota REAL NOT NULL CHECK (amount_quota > 0),
      redeemed_by INTEGER REFERENCES users(id),
      redeemed_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    ) STRICT;
  `,
  `
    UPDATE api_keys
    SET config = json_set(config,
      '$.scopes', json_extract(config, '$.modelLimits'),
      '$.modelLimits', json('[]'))
    WHERE json_extract(config, '$.userId') > 0
      AND json_extract(config, '$.modelLimitsEnabled') = 0
      AND json_type(config, '$.scopes') IS NULL;
  `,
  `
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      amount_quota REAL NOT NULL CHECK (amount_quota > 0),
      redeemed_by INTEGER REFERENCES users(id),
      redeemed_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    ) STRICT;
  `,
  `
    ALTER TABLE users ADD COLUMN balance_quota REAL NOT NULL DEFAULT 0;
  `,
  `
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('personal', 'team')),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      timezone TEXT NOT NULL DEFAULT 'UTC',
      created_by INTEGER NOT NULL REFERENCES users(id),
      personal_owner_user_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL,
      UNIQUE(personal_owner_user_id)
    ) STRICT;
    CREATE TABLE workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
      created_at INTEGER NOT NULL,
      UNIQUE(workspace_id, user_id)
    ) STRICT;
    CREATE INDEX workspace_members_user ON workspace_members(user_id, status);
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      routing_mode TEXT NOT NULL DEFAULT 'platform_only' CHECK (routing_mode IN ('platform_only', 'private_only', 'private_then_platform')),
      allowed_models TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_models)),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX projects_default ON projects(workspace_id) WHERE is_default = 1;
    CREATE TABLE wallets (
      workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      balance_units INTEGER NOT NULL DEFAULT 0,
      reserved_units INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE wallet_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      request_id TEXT,
      kind TEXT NOT NULL,
      delta_units INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      actor_user_id INTEGER REFERENCES users(id),
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX wallet_entries_workspace ON wallet_entries(workspace_id, created_at);
    CREATE TABLE redeem_code_credits (
      redeem_code_id INTEGER PRIMARY KEY REFERENCES redeem_codes(id),
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      wallet_entry_id INTEGER REFERENCES wallet_entries(id)
    ) STRICT;
  `,
  `
    INSERT INTO workspaces (kind, name, created_by, personal_owner_user_id, created_at)
    SELECT 'personal', name || ' workspace', id, id, created_at FROM users
    WHERE NOT EXISTS (SELECT 1 FROM workspaces p WHERE p.personal_owner_user_id = users.id);
    INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
    SELECT w.id, w.personal_owner_user_id, 'owner', w.created_at FROM workspaces w
    WHERE w.kind = 'personal' AND NOT EXISTS (
      SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = w.personal_owner_user_id
    );
    INSERT INTO projects (workspace_id, name, is_default, created_at)
    SELECT w.id, 'Default', 1, w.created_at FROM workspaces w
    WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.workspace_id = w.id AND p.is_default = 1);
    INSERT INTO wallets (workspace_id, balance_units)
    SELECT w.id, CAST(u.balance_quota AS INTEGER) FROM workspaces w JOIN users u ON u.id = w.personal_owner_user_id
    WHERE NOT EXISTS (SELECT 1 FROM wallets x WHERE x.workspace_id = w.id);
  `,
  `
    INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, reason, created_at)
    SELECT w.workspace_id, 'opening', w.balance_units, 'opening:' || w.workspace_id, 'Migrated user balance', u.created_at
    FROM wallets w JOIN workspaces x ON x.id = w.workspace_id JOIN users u ON u.id = x.personal_owner_user_id
    WHERE NOT EXISTS (SELECT 1 FROM wallet_entries e WHERE e.idempotency_key = 'opening:' || w.workspace_id);
  `,
  `
    UPDATE api_keys SET config = json_set(config,
      '$.workspaceId', (SELECT w.id FROM workspaces w WHERE w.personal_owner_user_id = json_extract(api_keys.config, '$.userId')),
      '$.projectId', (SELECT p.id FROM projects p JOIN workspaces w ON w.id = p.workspace_id
        WHERE w.personal_owner_user_id = json_extract(api_keys.config, '$.userId') AND p.is_default = 1))
    WHERE json_extract(config, '$.workspaceId') IS NULL;
  `,
  `
    CREATE TABLE workspace_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      expires_at INTEGER NOT NULL, accepted_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX workspace_invites_workspace ON workspace_invites(workspace_id, email);
  `,
  `
    CREATE TABLE billing_requests (
      request_id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      key_id INTEGER NOT NULL REFERENCES api_keys(id),
      state TEXT NOT NULL CHECK (state IN ('reserved', 'settled', 'released', 'unknown')),
      reserved_units INTEGER NOT NULL,
      settled_units INTEGER NOT NULL DEFAULT 0,
      lease_expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX billing_requests_lease ON billing_requests(state, lease_expires_at);
  `,
];

type ChannelConfig = Omit<Channel, "id" | "usedQuota" | "responseTime" | "createdTime">;
type KeyConfig = Omit<ApiKey, "id" | "key" | "remainQuota" | "unlimitedQuota" | "usedQuota" | "createdTime" | "accessedTime">;
type ChannelRow = {
  id: number;
  config: string;
  used_quota: number;
  response_time: number;
  created_time: number;
};
type KeyRow = {
  id: number;
  key_value: string;
  config: string;
  remain_quota: number;
  unlimited_quota: number;
  used_quota: number;
  created_time: number;
  accessed_time: number;
};

function channelFromRow(row: ChannelRow): Channel {
  return {
    ...JSON.parse(row.config) as ChannelConfig,
    id: row.id,
    usedQuota: row.used_quota,
    responseTime: row.response_time,
    createdTime: row.created_time,
  };
}

function keyFromRow(row: KeyRow): ApiKey {
  return {
    ...JSON.parse(row.config) as KeyConfig,
    id: row.id,
    key: row.key_value,
    remainQuota: row.remain_quota,
    unlimitedQuota: row.unlimited_quota === 1,
    usedQuota: row.used_quota,
    createdTime: row.created_time,
    accessedTime: row.accessed_time,
  };
}

function openDatabase(filename: string): Database {
  const file = filename === ":memory:" ? filename : path.resolve(process.cwd(), filename);
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file, { create: true, strict: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    db.transaction(() => {
      const { user_version: version } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
      if (version > MIGRATIONS.length) {
        throw new Error(`Relay database schema ${version} is newer than supported schema ${MIGRATIONS.length}`);
      }
      for (let next = version; next < MIGRATIONS.length; next++) {
        db.exec(MIGRATIONS[next]);
        db.exec(`PRAGMA user_version = ${next + 1}`);
      }
    }).immediate();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export type NewChannelInput = Omit<Channel, "id" | "usedQuota" | "responseTime" | "createdTime">;
export type NewKeyInput = Omit<ApiKey, "id" | "usedQuota" | "createdTime" | "accessedTime">;

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
  }

  /** A consistent compatibility snapshot, never a mutable persistence cache. */
  get data(): RelayData {
    return this.db.transaction(() => {
      const sequence = this.db.query<{ name: string; seq: number }, []>("SELECT name, seq FROM sqlite_sequence").all();
      return {
        version: MIGRATIONS.length,
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

  get settings(): RelaySettings {
    return { ...defaultSettings, ...this.storedSettings(), ...envOverrides() };
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

  async createChannel(input: NewChannelInput): Promise<Channel> {
    const row = this.db.query<ChannelRow, [string, number]>(
      "INSERT INTO channels (config, created_time) VALUES (?, ?) RETURNING *",
    ).get(JSON.stringify(input), Date.now())!;
    this.indexVersion = -1;
    return channelFromRow(row);
  }

  async updateChannel(id: number, patch: Partial<NewChannelInput>): Promise<Channel | undefined> {
    return this.db.transaction(() => {
      const row = this.db.query<ChannelRow, [number]>("SELECT * FROM channels WHERE id = ?").get(id);
      if (!row) return undefined;
      const config = JSON.stringify({ ...JSON.parse(row.config) as ChannelConfig, ...patch });
      const updated = this.db.query<ChannelRow, [string, number]>(
        "UPDATE channels SET config = ? WHERE id = ? RETURNING *",
      ).get(config, id)!;
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
  async reserveWallet(workspaceId: number, units: number): Promise<boolean> {
    if (units <= 0) return true;
    const result = this.db.query(
      `UPDATE wallets SET reserved_units = reserved_units + ?
       WHERE workspace_id = ? AND balance_units - reserved_units >= ?`,
    ).run(units, workspaceId, units);
    return result.changes === 1;
  }
  async reserveBilling(requestId: string, workspaceId: number, keyId: number, units: number, leaseMs = 120_000): Promise<boolean> {
    if (units < 0) return false;
    const now = Date.now();
    return this.db.transaction(() => {
      const existing = this.db.query<{ state: string }, [string]>("SELECT state FROM billing_requests WHERE request_id = ?").get(requestId);
      if (existing) return existing.state === "reserved" || existing.state === "settled";
      const wallet = this.db.query("UPDATE wallets SET reserved_units = reserved_units + ? WHERE workspace_id = ? AND balance_units - reserved_units >= ?").run(units, workspaceId, units);
      if (wallet.changes !== 1) return false;
      const key = this.db.query("UPDATE api_keys SET remain_quota = CASE WHEN unlimited_quota = 1 THEN remain_quota ELSE remain_quota - ? END, used_quota = used_quota + ?, accessed_time = ? WHERE id = ? AND (unlimited_quota = 1 OR remain_quota >= ?)").run(units, units, now, keyId, units);
      if (key.changes !== 1) {
        this.db.query("UPDATE wallets SET reserved_units = reserved_units - ? WHERE workspace_id = ?").run(units, workspaceId);
        return false;
      }
      this.db.query("INSERT INTO billing_requests (request_id, workspace_id, key_id, state, reserved_units, lease_expires_at, created_at, updated_at) VALUES (?, ?, ?, 'reserved', ?, ?, ?, ?)").run(requestId, workspaceId, keyId, units, now + leaseMs, now, now);
      return true;
    }).immediate();
  }

  async finalizeBilling(requestId: string, chargedUnits: number, outcome: "settled" | "released" | "unknown"): Promise<boolean> {
    return this.db.transaction(() => {
      const request = this.db.query<{ workspace_id: number; key_id: number; reserved_units: number; state: string }, [string]>("SELECT workspace_id, key_id, reserved_units, state FROM billing_requests WHERE request_id = ?").get(requestId);
      if (!request || (request.state !== "reserved" && request.state !== "unknown") || chargedUnits < 0) return false;
      if (outcome === "unknown") {
        if (request.state !== "reserved") return false;
        this.db.query("UPDATE billing_requests SET state = 'unknown', updated_at = ? WHERE request_id = ? AND state = 'reserved'").run(Date.now(), requestId);
        return true;
      }
      if (chargedUnits > request.reserved_units) return false;
      const wallet = this.db.query("UPDATE wallets SET balance_units = balance_units - ?, reserved_units = reserved_units - ? WHERE workspace_id = ? AND reserved_units >= ? AND balance_units >= ?").run(outcome === "settled" ? chargedUnits : 0, request.reserved_units, request.workspace_id, request.reserved_units, outcome === "settled" ? chargedUnits : 0);
      if (wallet.changes !== 1) return false;
      const refund = request.reserved_units - (outcome === "settled" ? chargedUnits : 0);
      this.db.query("UPDATE api_keys SET remain_quota = CASE WHEN unlimited_quota = 1 THEN remain_quota ELSE remain_quota + ? END, used_quota = CASE WHEN unlimited_quota = 1 THEN used_quota ELSE MAX(0, used_quota - ?) END WHERE id = ?").run(refund, refund, request.key_id);
      this.db.query("UPDATE billing_requests SET state = ?, settled_units = ?, updated_at = ? WHERE request_id = ? AND state IN ('reserved', 'unknown')").run(outcome, outcome === "settled" ? chargedUnits : 0, Date.now(), requestId);
      if (outcome === "settled" && chargedUnits !== 0) this.db.query("INSERT INTO wallet_entries (workspace_id, request_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, ?, 'charge', ?, ?, 'Relay usage settlement', ?)").run(request.workspace_id, requestId, -chargedUnits, `settle:${requestId}`, Date.now());
      return true;
    }).immediate();
  }
  async markExpiredBillingUnknown(now = Date.now()): Promise<number> {
    const result = this.db.transaction(() => {
      return this.db.query("UPDATE billing_requests SET state = 'unknown', updated_at = ? WHERE state = 'reserved' AND lease_expires_at <= ?").run(now, now);
    }).immediate();
    return result.changes;
  }

  listKeys(): ApiKey[] {
    return this.db.query<KeyRow, []>("SELECT * FROM api_keys ORDER BY id").all().map(keyFromRow);
  }

  getKey(id: number): ApiKey | undefined {
    const row = this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id);
    return row ? keyFromRow(row) : undefined;
  }

  getKeyByKeyValue(key: string): ApiKey | undefined {
    const row = this.db.query<KeyRow, [string]>("SELECT * FROM api_keys WHERE key_value = ? ORDER BY id LIMIT 1").get(key);
    return row ? keyFromRow(row) : undefined;
  }

  async createKey(input: NewKeyInput): Promise<ApiKey> {
    const { key, remainQuota, unlimitedQuota, ...config } = input;
    const row = this.db.query<KeyRow, [string, string, number, number, number]>(
      `INSERT INTO api_keys (key_value, config, remain_quota, unlimited_quota, created_time)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    ).get(key, JSON.stringify(config), remainQuota, Number(unlimitedQuota), Date.now())!;
    return keyFromRow(row);
  }

  async updateKey(id: number, patch: Partial<NewKeyInput>): Promise<ApiKey | undefined> {
    return this.db.transaction(() => {
      const current = this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id);
      if (!current) return undefined;
      const { key = current.key_value, remainQuota = current.remain_quota, unlimitedQuota = current.unlimited_quota === 1, ...configPatch } = patch;
      const config = { ...JSON.parse(current.config) as KeyConfig, ...configPatch };
      const row = this.db.query<KeyRow, [string, string, number, number, number]>(
        `UPDATE api_keys SET key_value = ?, config = ?, remain_quota = ?, unlimited_quota = ?
         WHERE id = ? RETURNING *`,
      ).get(key, JSON.stringify(config), remainQuota, Number(unlimitedQuota), id)!;
      return keyFromRow(row);
    }).immediate();
  }

  async deleteKey(id: number): Promise<boolean> {
    return this.db.query("DELETE FROM api_keys WHERE id = ?").run(id).changes > 0;
  }

  /** Atomic arithmetic prevents quota updates from overwriting concurrent requests. */
  async consumeQuota(keyId: number, quota: number): Promise<void> {
    this.db.query(`
      UPDATE api_keys SET
        remain_quota = CASE WHEN unlimited_quota = 1 THEN remain_quota ELSE MAX(0, remain_quota - ?) END,
        used_quota = used_quota + ?, accessed_time = ?
      WHERE id = ?
    `).run(quota, quota, Date.now(), keyId);
  }

  /** Reserve quota only when the current database balance covers it. */
  async reserveQuota(keyId: number, quota: number): Promise<boolean> {
    if (quota <= 0) return true;
    const { changes } = this.db.query(`
      UPDATE api_keys SET
        remain_quota = CASE WHEN unlimited_quota = 1 THEN remain_quota ELSE remain_quota - ? END,
        used_quota = used_quota + ?, accessed_time = ?
      WHERE id = ? AND (unlimited_quota = 1 OR remain_quota >= ?)
    `).run(quota, quota, Date.now(), keyId, quota);
    return changes === 1;
  }

  /** Usage and channel accounting commit together, including during streaming. */
  async recordUsage(record: UsageRecord): Promise<void> {
    this.db.transaction(() => {
      this.db.query("INSERT INTO usage_records (key_id, created_at, record) VALUES (?, ?, ?)")
        .run(record.keyId, record.createdAt, JSON.stringify(record));
      if (record.channelId !== null) {
        this.db.query(`
          UPDATE channels SET used_quota = used_quota + ?,
            response_time = CASE WHEN response_time = 0 THEN ? ELSE ROUND(response_time * 0.7 + ? * 0.3) END
          WHERE id = ?
        `).run(record.quota, record.firstByteMs, record.firstByteMs, record.channelId);
      }
      this.db.query(`
        DELETE FROM usage_records WHERE sequence <= (
          SELECT sequence FROM usage_records ORDER BY sequence DESC LIMIT 1 OFFSET ?
        )
      `).run(MAX_USAGE_RECORDS);
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
      const channels = this.listChannels().filter((channel) => channel.status === 1);
      const priorities = new Map(channels.map((channel) => [channel.id, channel.priority]));
      for (const channel of channels) {
        for (const group of channel.groups) {
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

/** Reuse the connection across Next dev reloads, never the stored application state. */
export function getRegistry(): Promise<RelayRegistry> {
  const g = globalThis as GlobalWithRegistry;
  const filename = DB_PATH === ":memory:" ? DB_PATH : path.resolve(process.cwd(), DB_PATH);
  if (!g.__capiSqliteRelayRegistry || g.__capiSqliteRelayRegistry.filename !== filename) {
    const registry = Promise.resolve().then(() => new RelayRegistry(filename));
    g.__capiSqliteRelayRegistry = { filename, registry };
    void registry.catch(() => {
      if (g.__capiSqliteRelayRegistry?.registry === registry) delete g.__capiSqliteRelayRegistry;
    });
  }
  return g.__capiSqliteRelayRegistry.registry;
}
/** Shared connection for sibling server-side persistence modules and migrations. */
export async function getDatabase(): Promise<Database> {
  const registry = await getRegistry();
  return registry.database;
}
