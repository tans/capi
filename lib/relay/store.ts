import { createHash } from "node:crypto";

import { startVideoTaskWorker } from "../video/worker";
import { defaultSettings, envOverrides, type RelaySettings } from "./config";
import { AsyncSqliteQueryAdapter, getStorageDatabase, resolveStorageConfig } from "../storage";
import type { Ability, ApiKey, Channel, Group, RelayData, UsageRecord } from "./types";
import { INITIAL_SCHEMA } from "./store-schema";
import { channelFromRow, groupFromRow, keyFromRow, type ChannelConfig, type ChannelRow, type GroupRow, type KeyConfig, type KeyRow } from "./store-rows";

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


function keyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function keyPrefix(key: string): string {
  return `${key.slice(0, 14)}${"•".repeat(8)}${key.slice(-4)}`;
}


async function openDatabase(): Promise<AsyncSqliteQueryAdapter> {
  const db = new AsyncSqliteQueryAdapter(getStorageDatabase());
  try {
    await db.exec("PRAGMA foreign_keys = ON");
    await db.transaction(async () => {
      // The app is pre-launch: initialize the full SQLite-compatible schema on startup.
      for (const statement of INITIAL_SCHEMA) await db.exec(statement);
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
  private readonly db: AsyncSqliteQueryAdapter;
  readonly database: AsyncSqliteQueryAdapter;
  private index = new Map<string, Map<string, number[]>>();
  private indexVersion = -1;
  private pollingCursor = new Map<number, number>();

  private constructor(database: AsyncSqliteQueryAdapter) {
    this.database = database;
    this.db = this.database;
  }

  static async create(): Promise<RelayRegistry> {
    const registry = new RelayRegistry(await openDatabase());
    await registry.seedPlatformAdministrator();
    await registry.seedDefaultGroups();
    return registry;
  }

  /** A consistent compatibility snapshot, never a mutable persistence cache. */
  async data(): Promise<RelayData> {
    return this.db.transaction(async () => {
      const sequence = (await this.db.query<{ name: string; seq: number }, []>("SELECT name, seq FROM sqlite_sequence").all());
      return {
        version: INITIAL_SCHEMA.length,
        channels: await this.listChannels(),
        keys: await this.listKeys(),
        usage: (await this.listUsage()).reverse(),
        settings: await this.storedSettings(),
        seq: {
          channel: sequence.find((row) => row.name === "channels")?.seq ?? 0,
          key: sequence.find((row) => row.name === "api_keys")?.seq ?? 0,
        },
      };
    })();
  }

  private async storedSettings(): Promise<Partial<RelaySettings>> {
    const row = (await this.db.query<{ config: string }, []>("SELECT config FROM settings WHERE id = 1").get());
    return row ? JSON.parse(row.config) as Partial<RelaySettings> : {};
  }

  /**
   * SQLite is authoritative; group ratios come from the `groups` table, never from
   * the settings JSON, so pricing and the admin group editor share one source.
   */
  async getSettings(): Promise<RelaySettings> {
    return { ...defaultSettings, ...await this.storedSettings(), groupRatio: await this.groupRatios(), ...envOverrides() };
  }

  async updateSettings(patch: Partial<RelaySettings>): Promise<RelaySettings> {
    await this.db.transaction(async () => {
      const config = JSON.stringify({ ...await this.storedSettings(), ...patch });
      (await this.db.query("INSERT INTO settings (id, config) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET config = excluded.config").run(config));
    }).immediate();
    return (await this.getSettings());
  }

  async listChannels(): Promise<Channel[]> {
    return (await this.db.query<ChannelRow, []>("SELECT * FROM channels ORDER BY id").all()).map(channelFromRow);
  }

  async getChannel(id: number): Promise<Channel | undefined> {
    const row = (await this.db.query<ChannelRow, [number]>("SELECT * FROM channels WHERE id = ?").get(id));
    return row ? channelFromRow(row) : undefined;
  }

  async workspaceAllowsPlatformChannels(workspaceId: number): Promise<boolean> {
    const row = (await this.db.query<{ allow_platform_channels: number }, [number]>("SELECT allow_platform_channels FROM workspaces WHERE id = ?").get(workspaceId));
    return row?.allow_platform_channels === 1;
  }

  async createChannel(input: NewChannelInput): Promise<Channel> {
    const { ownerType = "platform", workspaceId, ...config } = input;
    const row = (await this.db.query<ChannelRow, [Channel["ownerType"], number | null, string, number]>(
      "INSERT INTO channels (owner_type, workspace_id, config, created_time) VALUES (?, ?, ?, ?) RETURNING *",
    ).get(ownerType, workspaceId ?? null, JSON.stringify(config), Date.now()))!;
    this.indexVersion = -1;
    return channelFromRow(row);
  }

  async updateChannel(id: number, patch: Partial<NewChannelInput>): Promise<Channel | undefined> {
    return this.db.transaction(async () => {
      const row = (await this.db.query<ChannelRow, [number]>("SELECT * FROM channels WHERE id = ?").get(id));
      if (!row) return undefined;
      const { ownerType = row.owner_type, workspaceId = row.workspace_id ?? undefined, ...configPatch } = patch;
      const config = JSON.stringify({ ...JSON.parse(row.config) as ChannelConfig, ...configPatch });
      const updated = (await this.db.query<ChannelRow, [Channel["ownerType"], number | null, string, number]>(
        "UPDATE channels SET owner_type = ?, workspace_id = ?, config = ? WHERE id = ? RETURNING *",
      ).get(ownerType, workspaceId ?? null, config, id))!;
      this.indexVersion = -1;
      return channelFromRow(updated);
    }).immediate();
  }

  async deleteChannel(id: number): Promise<boolean> {
    const { changes } = (await this.db.query("DELETE FROM channels WHERE id = ?").run(id));
    this.indexVersion = -1;
    this.pollingCursor.delete(id);
    return changes > 0;
  }

  /** Bootstrap the documented platform administrator and its personal workspace. */
  private async seedPlatformAdministrator(): Promise<void> {
    const admin = (await this.db.query<{ id: number; name: string }, [string]>(
      "SELECT id, name FROM users WHERE email = ?",
    ).get("admin@capi.run"));
    if (!admin) return;
    const existing = (await this.db.query<{ id: number }, [number]>(
      "SELECT id FROM workspaces WHERE personal_owner_user_id = ?",
    ).get(admin.id));
    if (existing) return;
    const now = Date.now();
    await this.db.transaction(async () => {
      const workspace = (await this.db.query<{ id: number }, [string, number, number, number]>(
        `INSERT INTO workspaces (kind, name, created_by, personal_owner_user_id, created_at)
         VALUES ('personal', ?, ?, ?, ?) RETURNING id`,
      ).get(`${admin.name}'s workspace`, admin.id, admin.id, now))!;
      (await this.db.query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      ).run(workspace.id, admin.id, now));
      (await this.db.query("INSERT INTO wallets (workspace_id, balance_units) VALUES (?, 0)").run(workspace.id));
    }).immediate();
  }

  /**
   * Pre-launch bootstrap: the built-in groups exist until an administrator changes them.
   * Seeding runs only while the table is empty, so deletions survive restarts.
   */
  private async seedDefaultGroups(): Promise<void> {
    const count = (await this.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM groups").get())?.count ?? 0;
    if (count > 0) return;
    const insert = this.db.query("INSERT INTO groups (name, display_name, ratio, status, description, created_at) VALUES (?, ?, ?, 1, '', ?)");
    const now = Date.now();
    await this.db.transaction(async () => {
      for (const [name, ratio] of Object.entries(defaultSettings.groupRatio)) {
        (await insert.run(name, name.charAt(0).toUpperCase() + name.slice(1), ratio, now));
      }
    }).immediate();
  }

  async listGroups(): Promise<Group[]> {
    return (await this.db.query<GroupRow, []>("SELECT * FROM groups ORDER BY name").all()).map(groupFromRow);
  }

  async getGroup(id: number): Promise<Group | undefined> {
    const row = (await this.db.query<GroupRow, [number]>("SELECT * FROM groups WHERE id = ?").get(id));
    return row ? groupFromRow(row) : undefined;
  }

  /** Pricing reads group ratios through `settings.groupRatio`, projected from this table. */
  async groupRatios(): Promise<Record<string, number>> {
    return Object.fromEntries(
      (await this.db.query<{ name: string; ratio: number }, []>("SELECT name, ratio FROM groups").all())
        .map((row) => [row.name, row.ratio]),
    );
  }

  /** Returns undefined when the name is already taken; names are the group identifier. */
  async createGroup(input: NewGroupInput): Promise<Group | undefined> {
    if ((await this.db.query("SELECT 1 FROM groups WHERE name = ?").get(input.name))) return undefined;
    const row = (await this.db.query<GroupRow, [string, string, number, string, Group["status"], number]>(
      "INSERT INTO groups (name, display_name, ratio, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    ).get(input.name, input.displayName, input.ratio, input.description, input.status, Date.now()))!;
    this.indexVersion = -1;
    return groupFromRow(row);
  }

  /** `name` stays immutable because channels and API keys reference it verbatim. */
  async updateGroup(id: number, patch: Partial<Omit<NewGroupInput, "name">>): Promise<Group | undefined> {
    return this.db.transaction(async () => {
      const current = (await this.getGroup(id));
      if (!current) return undefined;
      const next = { ...current, ...patch };
      const row = (await this.db.query<GroupRow, [string, number, string, Group["status"], number]>(
        "UPDATE groups SET display_name = ?, ratio = ?, description = ?, status = ? WHERE id = ? RETURNING *",
      ).get(next.displayName, next.ratio, next.description, next.status, id))!;
      this.indexVersion = -1;
      return groupFromRow(row);
    }).immediate();
  }

  /** Deleting a group detaches it from channels and clears it from keys in one transaction. */
  async deleteGroup(id: number): Promise<boolean> {
    return this.db.transaction(async () => {
      const current = (await this.getGroup(id));
      if (!current) return false;
      const name = current.name;
      const channels = (await this.db.query<{ id: number; config: string }, [string]>(
        "SELECT id, config FROM channels WHERE EXISTS (SELECT 1 FROM json_each(config, '$.groups') WHERE json_each.value = ?)",
      ).all(name));
      const update = this.db.query("UPDATE channels SET config = ? WHERE id = ?");
      for (const channel of channels) {
        const config = JSON.parse(channel.config) as ChannelConfig;
        const groups = config.groups.filter((group) => group !== name);
        (await update.run(JSON.stringify({ ...config, groups: groups.length ? groups : ["default"] }), channel.id));
      }
      (await this.db.query("UPDATE api_keys SET config = json_set(config, '$.group', '') WHERE json_extract(config, '$.group') = ?").run(name));
      (await this.db.query("DELETE FROM groups WHERE id = ?").run(id));
      this.indexVersion = -1;
      return true;
    }).immediate();
  }
  async getWorkspaceWallet(workspaceId: number): Promise<{ balanceUnits: number; reservedUnits: number } | undefined> {
    const row = (await this.db.query<{ balance_units: number; reserved_units: number }, [number]>("SELECT balance_units, reserved_units FROM wallets WHERE workspace_id = ?").get(workspaceId));
    return row ? { balanceUnits: row.balance_units, reservedUnits: 0 } : undefined;
  }

  async canChargeJev(workspaceId: number, units: number): Promise<boolean> {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    const wallet = (await this.db.query<{ balance_units: number }, [number]>("SELECT balance_units FROM wallets WHERE workspace_id = ?").get(workspaceId));
    return Boolean(wallet && wallet.balance_units >= units);
  }

  async chargeJev(requestId: string, workspaceId: number, units: number, reason = "JEV decision"): Promise<boolean> {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    return this.db.transaction(async () => {
      const idempotencyKey = `jev:${requestId}`;
      const existing = (await this.db.query<{ id: number }, [string]>("SELECT id FROM wallet_entries WHERE idempotency_key = ?").get(idempotencyKey));
      if (existing) return true;
      const now = Date.now();
      const wallet = (await this.db.query("UPDATE wallets SET balance_units = balance_units - ? WHERE workspace_id = ? AND balance_units >= ?").run(units, workspaceId, units));
      if (wallet.changes !== 1) return false;
      const schema = (await this.db.query<{ sql: string }, [string]>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get("wallet_entries"))?.sql ?? "";
      const kind = schema.includes("jev_evaluation") ? "jev_evaluation" : "charge";
      (await this.db.query(
        "INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(workspaceId, kind, -units, idempotencyKey, `${reason}${kind === "charge" ? " [jev_evaluation]" : ""}`, now));
      return true;
    }).immediate();
  }

  async recordJevDecision(input: {
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
  }): Promise<void> {
    await this.db.transaction(async () => {
      const hasInlineText = (await this.db.query<{ name: string }, []>("PRAGMA table_info(jev_decisions)").all()).some((column) => column.name === "original_text");
      if (hasInlineText) {
        (await this.db.query(
          `INSERT OR REPLACE INTO jev_decisions
            (workspace_id, request_id, key_id, original_text, route_intent, route_complexity, route_confidence,
             security_categories, security_severity, security_confidence, detector, jev_request_id, prompt_tokens, quota_units, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(input.workspaceId, input.requestId, input.keyId, input.originalText, input.routeIntent, input.routeComplexity, input.routeConfidence,
          JSON.stringify(input.securityCategories), input.securitySeverity, input.securityConfidence, input.detector, input.jevRequestId,
          input.promptTokens, input.quotaUnits, Date.now()));
      } else {
        (await this.db.query(
          `INSERT OR REPLACE INTO jev_decisions
            (workspace_id, request_id, key_id, route_intent, route_complexity, route_confidence,
             security_categories, security_severity, security_confidence, detector, jev_request_id, prompt_tokens, quota_units, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(input.workspaceId, input.requestId, input.keyId, input.routeIntent, input.routeComplexity, input.routeConfidence,
          JSON.stringify(input.securityCategories), input.securitySeverity, input.securityConfidence, input.detector, input.jevRequestId,
          input.promptTokens, input.quotaUnits, Date.now()));
      }
      const decision = (await this.db.query<{ id: number }, [number, string]>(
        "SELECT id FROM jev_decisions WHERE workspace_id = ? AND request_id = ?",
      ).get(input.workspaceId, input.requestId))!;
      if ((await this.db.query<{ name: string }, []>("PRAGMA table_info(jev_decision_details)").all()).some((column) => column.name === "original_text")) {
        (await this.db.query("INSERT OR REPLACE INTO jev_decision_details (decision_id, original_text) VALUES (?, ?)")
          .run(decision.id, input.originalText));
      }
      const day = new Date().toISOString().slice(0, 10);
      (await this.db.query(
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
        Number(input.securitySeverity === "low"), Number(input.securitySeverity === "high"), Number(input.detector === "unavailable"), input.quotaUnits));
    }).immediate();
  }

  async recordSecurityIncident(input: {
    workspaceId: number;
    requestId: string;
    keyId: number;
    severity: "low" | "high" | "critical";
    categories: string[];
    confidence: number;
    evidence: Record<string, unknown>;
  }): Promise<void> {
    (await this.db.query(
      `INSERT OR IGNORE INTO security_incidents
        (workspace_id, request_id, key_id, direction, severity, detector, categories, confidence, evidence, created_at)
       VALUES (?, ?, ?, 'input', ?, 'jev', ?, ?, ?, ?)`,
    ).run(input.workspaceId, input.requestId, input.keyId, input.severity, JSON.stringify(input.categories), input.confidence, JSON.stringify(input.evidence), Date.now()));
  }

  async listSecurityIncidents(workspaceId: number, options: { limit?: number; status?: string } = {}): Promise<Array<Record<string, unknown>>> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const statusClause = options.status ? " AND status = ?" : "";
    const params = options.status ? [workspaceId, options.status, limit] : [workspaceId, limit];
    return (await this.db.query<Record<string, unknown>, (number | string)[]>(
      `SELECT id, request_id, key_id, direction, severity, detector, categories, confidence, evidence, status, created_at, resolved_at, resolved_by
       FROM security_incidents WHERE workspace_id = ?${statusClause} ORDER BY created_at DESC LIMIT ?`,
    ).all(...params)).map((row) => ({ ...row, categories: JSON.parse(row.categories as string), evidence: JSON.parse(row.evidence as string) }));
  }

  async listJevDecisions(workspaceId: number, options: { limit?: number; userId?: number } = {}): Promise<Array<Record<string, unknown>>> {
    (await this.db.query("DELETE FROM jev_decisions WHERE created_at < ?").run(Date.now() - 90 * 24 * 60 * 60 * 1000));
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const userClause = options.userId === undefined ? "" : " AND k.user_id = ?";
    const params = options.userId === undefined ? [workspaceId, limit] : [workspaceId, options.userId, limit];
    return (await this.db.query<Record<string, unknown>, (number | string)[]>(
      `SELECT d.id, d.request_id, d.key_id, d.route_intent, d.route_complexity, d.route_confidence,
              d.security_categories, d.security_severity, d.security_confidence, d.detector, d.jev_request_id, d.prompt_tokens, d.quota_units, d.created_at,
              k.user_id
       FROM jev_decisions d JOIN api_keys k ON k.id = d.key_id
       WHERE d.workspace_id = ?${userClause} ORDER BY d.created_at DESC LIMIT ?`,
    ).all(...params)).map((row) => ({ ...row, security_categories: JSON.parse(row.security_categories as string) }));
  }

  async getJevDecisionText(workspaceId: number, decisionId: number, userId?: number): Promise<string | undefined> {
    const hasInlineText = (await this.db.query<{ name: string }, []>("PRAGMA table_info(jev_decisions)").all()).some((column) => column.name === "original_text");
    const source = hasInlineText ? "d.original_text" : "detail.original_text";
    const detailsJoin = hasInlineText ? "" : " JOIN jev_decision_details detail ON detail.decision_id = d.id";
    const row = (await this.db.query<{ original_text: string }, (number | string)[]>(
      `SELECT ${source} AS original_text FROM jev_decisions d${detailsJoin}
       JOIN api_keys k ON k.id = d.key_id
       WHERE d.workspace_id = ? AND d.id = ? AND d.created_at >= ?${userId === undefined ? "" : " AND k.user_id = ?"}`,
    ).get(...(userId === undefined ? [workspaceId, decisionId, Date.now() - 90 * 24 * 60 * 60 * 1000] : [workspaceId, decisionId, Date.now() - 90 * 24 * 60 * 60 * 1000, userId])));
    return row?.original_text;
  }

  async listJevDailyStats(workspaceId: number): Promise<Array<Record<string, unknown>>> {
    return (await this.db.query<Record<string, unknown>, [number]>("SELECT * FROM jev_daily_stats WHERE workspace_id = ? ORDER BY day DESC LIMIT 90").all(workspaceId));
  }

  async updateSecurityIncident(id: number, workspaceId: number, status: string, userId: number, severity?: string): Promise<boolean> {
    if (!("open reviewing resolved false_positive".split(" ").includes(status))) return false;
    if (severity && !("low high critical".split(" ").includes(severity))) return false;
    return (await this.db.query(`UPDATE security_incidents SET status = ?, severity = COALESCE(?, severity), resolved_at = ?, resolved_by = ? WHERE id = ? AND workspace_id = ?`).run(status, severity ?? null, status === "resolved" || status === "false_positive" ? Date.now() : null, status === "resolved" || status === "false_positive" ? userId : null, id, workspaceId)).changes > 0;
  }

  /** Soft admission check. Billing is settled after upstream usage is known. */
  async reserveBilling(requestId: string, workspaceId: number, keyId: number, units: number): Promise<boolean> {
    if (!Number.isSafeInteger(units) || units <= 0) return false;
    const now = Date.now();
    return this.db.transaction(async () => {
      const existing = (await this.db.query<{ state: string }, [string]>("SELECT state FROM billing_requests WHERE request_id = ?").get(requestId));
      if (existing) {
        if (existing.state === "settled") return true;
        if (existing.state === "reserved") return true;
        if (existing.state !== "released") return false;
      }
      const wallet = (await this.db.query<{ balance_units: number }, [number]>("SELECT balance_units FROM wallets WHERE workspace_id = ?").get(workspaceId));
      if (!wallet || wallet.balance_units <= 0) return false;
      const key = (await this.db.query<{ budget_limit_units: number | null; budget_spent_units: number }, [number, number]>("SELECT budget_limit_units, budget_spent_units FROM api_keys WHERE id = ? AND workspace_id = ?").get(keyId, workspaceId));
      if (!key || (key.budget_limit_units !== null && key.budget_spent_units >= key.budget_limit_units)) return false;
      if (existing) {
        (await this.db.query("UPDATE billing_requests SET state = 'reserved', updated_at = ? WHERE request_id = ? AND state = 'released'").run(now, requestId));
        return true;
      }
      (await this.db.query("INSERT INTO billing_requests (request_id, workspace_id, key_id, state, reserved_units, lease_expires_at, created_at, updated_at) VALUES (?, ?, ?, 'reserved', 0, ?, ?, ?)").run(requestId, workspaceId, keyId, now, now, now));
      return true;
    }).immediate();
  }

  async finalizeBilling(requestId: string, chargedUnits: number, outcome: "settled" | "released" | "unknown"): Promise<boolean> {
    if (!Number.isSafeInteger(chargedUnits) || chargedUnits < 0) return false;
    return this.db.transaction(async () => {
      const request = (await this.db.query<{ workspace_id: number; key_id: number; state: string }, [string]>("SELECT workspace_id, key_id, state FROM billing_requests WHERE request_id = ?").get(requestId));
      if (!request) return false;
      if (request.state === "settled" || request.state === "released" || request.state === "unknown") return request.state === outcome;
      if (outcome === "unknown") {
        return (await this.db.query("UPDATE billing_requests SET state = 'unknown', updated_at = ? WHERE request_id = ? AND state = 'reserved'").run(Date.now(), requestId)).changes === 1;
      }
      const now = Date.now();
      if (outcome === "settled" && chargedUnits > 0) {
        const wallet = (await this.db.query("UPDATE wallets SET balance_units = balance_units - ? WHERE workspace_id = ?").run(chargedUnits, request.workspace_id));
        const key = (await this.db.query("UPDATE api_keys SET budget_spent_units = budget_spent_units + ?, accessed_time = ? WHERE id = ? AND workspace_id = ?").run(chargedUnits, now, request.key_id, request.workspace_id));
        if (wallet.changes !== 1 || key.changes !== 1) throw new Error("billing account missing");
        (await this.db.query("INSERT INTO wallet_entries (workspace_id, request_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, ?, 'charge', ?, ?, 'Relay usage settlement', ?)").run(request.workspace_id, requestId, -chargedUnits, `settle:${requestId}`, now));
      }
      return (await this.db.query("UPDATE billing_requests SET state = ?, settled_units = ?, updated_at = ? WHERE request_id = ? AND state = 'reserved'").run(outcome, outcome === "settled" ? chargedUnits : 0, now, requestId)).changes === 1;
    }).immediate();
  }

  /** Reservations hold no funds, so expiration only marks the request unknown. */
  async markExpiredBillingUnknown(): Promise<number> {
    return 0;
  }
  async countActiveVideoTasks(workspaceId: number): Promise<number> {
    return (await this.db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM video_tasks WHERE workspace_id = ? AND state IN ('submitting', 'running', 'unknown')").get(workspaceId))?.count ?? 0;
  }

  /** Atomically enforce the workspace concurrency limit and create the task. */
  createVideoTaskIfCapacity(task: VideoTask, limit = 3): Promise<boolean> {
    return this.db.transaction(async () => {
      const active = (await this.db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM video_tasks WHERE workspace_id = ? AND state IN ('submitting', 'running', 'unknown')").get(task.workspaceId))?.count ?? 0;
      if (active >= limit) return false;
      (await this.db.query("INSERT INTO video_tasks (id, workspace_id, key_id, channel_id, upstream_id, upstream_key, model, request, quote_units, state, result_url, error, next_poll_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(task.id, task.workspaceId, task.keyId, task.channelId, task.upstreamId, task.upstreamKey, task.model, JSON.stringify(task.request), task.quoteUnits, task.state, task.resultUrl, task.error, task.nextPollAt, task.createdAt, task.updatedAt));
      return true;
    }).immediate();
  }

  async listKeys(): Promise<ApiKey[]> {
    return (await this.db.query<KeyRow, []>("SELECT * FROM api_keys ORDER BY id").all()).map(keyFromRow);
  }

  async getKey(id: number): Promise<ApiKey | undefined> {
    const row = (await this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id));
    return row ? keyFromRow(row) : undefined;
  }
  async createVideoTask(task: VideoTask): Promise<void> {
    (await this.db.query(`INSERT INTO video_tasks (id, workspace_id, key_id, channel_id, upstream_id, upstream_key, model, request, quote_units, state, result_url, error, next_poll_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(task.id, task.workspaceId, task.keyId, task.channelId, task.upstreamId, task.upstreamKey, task.model, JSON.stringify(task.request), task.quoteUnits, task.state, task.resultUrl, task.error, task.nextPollAt, task.createdAt, task.updatedAt));
  }

  async getVideoTask(id: string): Promise<VideoTask | undefined> {
    const row = (await this.db.query<Record<string, unknown>, [string]>("SELECT * FROM video_tasks WHERE id = ?").get(id));
    if (!row) return undefined;
    return { id: row.id as string, workspaceId: row.workspace_id as number, keyId: row.key_id as number, channelId: row.channel_id as number | null, upstreamId: row.upstream_id as string | null, upstreamKey: row.upstream_key as string | null, model: row.model as string, request: JSON.parse(row.request as string) as Record<string, unknown>, quoteUnits: row.quote_units as number, state: row.state as VideoTask["state"], resultUrl: row.result_url as string | null, error: row.error as string | null, nextPollAt: row.next_poll_at as number | null, createdAt: row.created_at as number, updatedAt: row.updated_at as number };
  }

  async updateVideoTask(id: string, patch: Partial<Pick<VideoTask, "upstreamId" | "upstreamKey" | "state" | "resultUrl" | "error" | "nextPollAt">>): Promise<VideoTask | undefined> {
    const current = (await this.getVideoTask(id));
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    (await this.db.query("UPDATE video_tasks SET upstream_id = ?, upstream_key = ?, state = ?, result_url = ?, error = ?, next_poll_at = ?, updated_at = ? WHERE id = ?").run(next.upstreamId, next.upstreamKey, next.state, next.resultUrl, next.error, next.nextPollAt, next.updatedAt, id));
    return next;
  }
  async listDueVideoTasks(now = Date.now()): Promise<VideoTask[]> {
    const rows = (await this.db.query<Record<string, unknown>, [number]>("SELECT * FROM video_tasks WHERE upstream_id IS NOT NULL AND state IN ('running', 'unknown') AND (next_poll_at IS NULL OR next_poll_at <= ?) ORDER BY COALESCE(next_poll_at, 0) LIMIT 20").all(now));
    return rows.map((row) => ({ id: row.id as string, workspaceId: row.workspace_id as number, keyId: row.key_id as number, channelId: row.channel_id as number | null, upstreamId: row.upstream_id as string | null, upstreamKey: row.upstream_key as string | null, model: row.model as string, request: JSON.parse(row.request as string) as Record<string, unknown>, quoteUnits: row.quote_units as number, state: row.state as VideoTask["state"], resultUrl: row.result_url as string | null, error: row.error as string | null, nextPollAt: row.next_poll_at as number | null, createdAt: row.created_at as number, updatedAt: row.updated_at as number }));
  }


  async getKeyByKeyValue(key: string): Promise<ApiKey | undefined> {
    const row = (await this.db.query<KeyRow, [string]>("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash(key)));
    return row ? keyFromRow(row) : undefined;
  }

  async createKey(input: NewKeyInput): Promise<ApiKey> {
    const { key, userId, workspaceId, budgetLimitQuota, ...config } = input;
    const persistedConfig = { ...config, secret: key };
    const row = (await this.db.query<KeyRow, [number, number, string, string, string, number | null, number]>(
      `INSERT INTO api_keys (user_id, workspace_id, key_hash, key_prefix, config, budget_limit_units, created_time)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).get(userId, workspaceId, keyHash(key), keyPrefix(key), JSON.stringify(persistedConfig), budgetLimitQuota, Date.now()))!;
    return { ...keyFromRow(row), key };
  }

  async updateKey(id: number, patch: Partial<NewKeyInput>): Promise<ApiKey | undefined> {
    return this.db.transaction(async () => {
      const current = (await this.db.query<KeyRow, [number]>("SELECT * FROM api_keys WHERE id = ?").get(id));
      if (!current) return undefined;
      const { key, userId = current.user_id, workspaceId = current.workspace_id, budgetLimitQuota = current.budget_limit_units, ...configPatch } = patch;
      const config = { ...JSON.parse(current.config) as KeyConfig, ...configPatch, ...(key ? { secret: key } : {}) };
      const row = (await this.db.query<KeyRow, [number, number, string, string, string, number | null, number]>(
        `UPDATE api_keys SET user_id = ?, workspace_id = ?, key_hash = ?, key_prefix = ?, config = ?, budget_limit_units = ?
         WHERE id = ? RETURNING *`,
      ).get(userId, workspaceId, key ? keyHash(key) : current.key_hash, key ? keyPrefix(key) : current.key_prefix, JSON.stringify(config), budgetLimitQuota, id))!;
      return key ? { ...keyFromRow(row), key } : keyFromRow(row);
    }).immediate();
  }

  /** Preserve auditable usage and billing references while immediately revoking the credential. */
  async deleteKey(id: number): Promise<boolean> {
    return (await this.db.query(
      "UPDATE api_keys SET config = json_set(config, '$.status', 2) WHERE id = ? AND json_extract(config, '$.status') = 1",
    ).run(id)).changes > 0;
  }

  /** Usage and channel accounting commit together. Audit records are retained without an arbitrary global cap. */
  async recordUsage(record: UsageRecord): Promise<void> {
    await this.db.transaction(async () => {
      (await this.db.query(
        `INSERT INTO usage_records (request_id, workspace_id, key_id, channel_id, created_at, model, prompt_tokens, completion_tokens, cached_tokens, quota_units, success, status_code, record)
         SELECT ?, workspace_id, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM api_keys WHERE id = ?`,
      ).run(record.requestId, record.channelId, record.createdAt, record.model, record.promptTokens, record.completionTokens, record.cachedTokens, record.quota, Number(record.success), record.statusCode, JSON.stringify(record), record.keyId));
      if (record.channelId !== null) {
        (await this.db.query(
          `UPDATE channels SET used_quota = used_quota + ?,
            response_time = CASE WHEN response_time = 0 THEN ? ELSE ROUND(response_time * 0.7 + ? * 0.3) END
          WHERE id = ?`,
        ).run(record.quota, record.firstByteMs, record.firstByteMs, record.channelId));
      }
    }).immediate();
  }

  async listUsage(filter: { keyId?: number; days?: number } = {}): Promise<UsageRecord[]> {
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
    return (await this.db.query<{ record: string }, number[]>(`SELECT record FROM usage_records${where} ORDER BY sequence DESC`)
      .all(...parameters)).map((row) => JSON.parse(row.record) as UsageRecord);
  }

  /** Rebuild the routing cache from one database snapshot. */
  async rebuildIndex(): Promise<void> {
    await this.db.transaction(async () => {
      const index = new Map<string, Map<string, number[]>>();
      const disabled = new Set(
        (await this.db.query<{ name: string }, []>("SELECT name FROM groups WHERE status <> 1").all()).map((row) => row.name),
      );
      const channels = (await this.listChannels()).filter((channel) => channel.status === 1);
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
      this.indexVersion = Date.now();
    })();
  }

  private async ensureIndex(): Promise<void> {
    // Turso does not implement SQLite's PRAGMA data_version. Refresh briefly
    // cached routing data so writes from another serverless instance appear.
    if (this.indexVersion < 0 || Date.now() - this.indexVersion > 1000) await this.rebuildIndex();
  }

  async candidateIds(group: string, model: string): Promise<number[]> {
    (await this.ensureIndex());
    return [...(this.index.get(group)?.get(model) ?? [])];
  }

  abilities(): Promise<Ability[]> {
    return this.db.transaction(async () => {
      (await this.ensureIndex());
      const channels = new Map((await this.listChannels()).map((channel) => [channel.id, channel]));
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

  async groupModels(group: string): Promise<string[]> {
    (await this.ensureIndex());
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

  /** Every write is committed durably by the async storage driver. */
  async persist(): Promise<void> {
    // The libSQL remote driver has no local WAL to checkpoint.
  }
}

type GlobalWithRegistry = typeof globalThis & {
  __capiSqliteRelayRegistry?: { connectionKey: string; registry: Promise<RelayRegistry> };
};

export async function getRegistry(): Promise<RelayRegistry> {
  const g = globalThis as GlobalWithRegistry;
  const { url, authToken } = resolveStorageConfig();
  const connectionKey = `${url}\u0000${authToken ?? ""}`;
  if (!g.__capiSqliteRelayRegistry || g.__capiSqliteRelayRegistry.connectionKey !== connectionKey) {
    const registry = RelayRegistry.create();
    void registry.then((instance) => startVideoTaskWorker(instance));
    g.__capiSqliteRelayRegistry = { connectionKey, registry };
    void registry.catch(() => {
      if (g.__capiSqliteRelayRegistry?.registry === registry) delete g.__capiSqliteRelayRegistry;
    });
  }
  return g.__capiSqliteRelayRegistry.registry;
}
/** Shared connection for sibling server-side persistence modules and shared database access. */
export async function getDatabase(): Promise<AsyncSqliteQueryAdapter> {
  return (await getRegistry()).database;
}
