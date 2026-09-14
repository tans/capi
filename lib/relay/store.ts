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
