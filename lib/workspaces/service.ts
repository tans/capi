import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";

import { getDatabase } from "../relay/store";

export type WorkspaceRole = "owner" | "admin" | "member";
export type Workspace = {
  id: number;
  kind: "personal" | "team";
  name: string;
  status: "active" | "suspended" | "deleted";
  timezone: string;
  allowPlatformChannels: boolean;
  displayCurrency: { code: string; symbol: string; rate: number } | null;
  role: WorkspaceRole;
  createdAt: number;
};

export async function listUserWorkspaces(userId: number): Promise<Workspace[]> {
  const db = await getDatabase();
  return db.query<Workspace & { created_at: number; allow_platform_channels: number; display_currency: string | null; display_symbol: string | null; display_rate: number | null }, [number]>(
    `SELECT w.id, w.kind, w.name, w.status, w.timezone, w.allow_platform_channels, w.display_currency, w.display_symbol, w.display_rate, m.role, w.created_at
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = ? AND m.status = 'active' AND w.status = 'active' ORDER BY w.id`,
  ).all(userId).map(({ created_at, allow_platform_channels, display_currency, display_symbol, display_rate, ...row }) => ({ ...row, allowPlatformChannels: allow_platform_channels !== 0, displayCurrency: display_currency && display_symbol && typeof display_rate === "number" ? { code: display_currency, symbol: display_symbol, rate: display_rate } : null, createdAt: created_at }));
}

export async function createWorkspace(input: { userId: number; name: string; kind?: "personal" | "team" }): Promise<Workspace> {
  const db = await getDatabase();
  const now = Date.now();
  return db.transaction(() => {
    const row = db.query<{ id: number }, [string, string, number, number | null, number]>(
      `INSERT INTO workspaces (kind, name, created_by, personal_owner_user_id, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ).get(input.kind ?? "team", input.name, input.userId, input.kind === "personal" ? input.userId : null, now)!;
    db.query("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(row.id, input.userId, now);
    db.query("INSERT INTO wallets (workspace_id, balance_units) VALUES (?, 0)").run(row.id);
    return { id: row.id, kind: input.kind ?? "team", name: input.name, status: "active" as const, timezone: "UTC", allowPlatformChannels: true, displayCurrency: null, role: "owner" as const, createdAt: now };
  }).immediate();
}

export async function ensurePersonalWorkspace(userId: number, name: string): Promise<Workspace> {
  const db = await getDatabase();
  const existing = db.query<Workspace & { created_at: number; allow_platform_channels: number; display_currency: string | null; display_symbol: string | null; display_rate: number | null }, [number, number]>(
    `SELECT w.id, w.kind, w.name, w.status, w.timezone, w.allow_platform_channels, w.display_currency, w.display_symbol, w.display_rate, m.role, w.created_at
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE w.personal_owner_user_id = ? AND m.user_id = ? LIMIT 1`,
  ).get(userId, userId);
  if (existing) return { ...existing, allowPlatformChannels: existing.allow_platform_channels !== 0, displayCurrency: existing.display_currency && existing.display_symbol && typeof existing.display_rate === "number" ? { code: existing.display_currency, symbol: existing.display_symbol, rate: existing.display_rate } : null, createdAt: existing.created_at };
  return createWorkspace({ userId, name, kind: "personal" });
}

export async function acceptWorkspaceInvite(
  input: { userId: number; email: string; token: string },
  database?: Database,
): Promise<{ workspaceId: number } | null> {
  if (!input.token) return null;
  const db = database ?? await getDatabase();
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const now = Date.now();

  return db.transaction(() => {
    const invite = db.query<{ id: number; workspace_id: number; email: string; role: "admin" | "member" }, [string, number]>(
      `SELECT i.id, i.workspace_id, i.email, i.role
       FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
       WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL
         AND i.expires_at > ? AND w.status = 'active'`,
    ).get(tokenHash, now);
    if (!invite || invite.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) return null;

    const accepted = db.query(
      `UPDATE workspace_invites SET accepted_at = ?
       WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    ).run(now, invite.id, now);
    if (accepted.changes !== 1) return null;

    db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, status, created_at)
       VALUES (?, ?, ?, 'active', ?)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`,
    ).run(invite.workspace_id, input.userId, invite.role, now);
    return { workspaceId: invite.workspace_id };
  }).immediate();
}
