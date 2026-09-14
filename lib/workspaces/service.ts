import { getDatabase } from "../relay/store";

export type WorkspaceRole = "owner" | "admin" | "member";
export type Workspace = {
  id: number;
  kind: "personal" | "team";
  name: string;
  status: "active" | "suspended" | "deleted";
  timezone: string;
  role: WorkspaceRole;
  createdAt: number;
};

export async function listUserWorkspaces(userId: number): Promise<Workspace[]> {
  const db = await getDatabase();
  return db.query<Workspace & { created_at: number }, [number]>(
    `SELECT w.id, w.kind, w.name, w.status, w.timezone, m.role, w.created_at
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = ? AND m.status = 'active' AND w.status = 'active' ORDER BY w.id`,
  ).all(userId).map(({ created_at, ...row }) => ({ ...row, createdAt: created_at }));
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
    db.query("INSERT INTO wallets (workspace_id) VALUES (?)").run(row.id);
    return { id: row.id, kind: input.kind ?? "team", name: input.name, status: "active" as const, timezone: "UTC", role: "owner" as const, createdAt: now };
  }).immediate();
}

export async function ensurePersonalWorkspace(userId: number, name: string): Promise<Workspace> {
  const db = await getDatabase();
  const existing = db.query<Workspace & { created_at: number }, [number, number]>(
    `SELECT w.id, w.kind, w.name, w.status, w.timezone, m.role, w.created_at
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE w.personal_owner_user_id = ? AND m.user_id = ? LIMIT 1`,
  ).get(userId, userId);
  if (existing) return { ...existing, createdAt: existing.created_at };
  return createWorkspace({ userId, name, kind: "personal" });
}

