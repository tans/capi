import { AuthError } from "@/lib/auth";
import { getDatabase } from "../relay/store";
import type { Workspace, WorkspaceRole } from "./service";

export type WorkspaceAction = "read" | "manage";

export async function requireWorkspacePermission(userId: number, workspaceId: number, action: WorkspaceAction): Promise<Workspace> {
  const db = await getDatabase();
  const row = (await db.query<Workspace & { created_at: number; allow_platform_channels: number; display_currency: string | null; display_symbol: string | null; display_rate: number | null }, [number, number]>(
    `SELECT w.id, w.kind, w.name, w.status, w.timezone, w.allow_platform_channels, w.display_currency, w.display_symbol, w.display_rate, m.role, w.created_at
     FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
     WHERE w.id = ? AND m.user_id = ? AND m.status = 'active' AND w.status = 'active'`,
  ).get(workspaceId, userId));
  if (!row) throw new AuthError("Workspace not found.", 404, "workspace_not_found");
  const role = row.role as WorkspaceRole;
  if (action === "manage" && role === "member") throw new AuthError("Workspace permission denied.", 403, "permission_denied");
  const { created_at, allow_platform_channels, display_currency, display_symbol, display_rate, ...workspace } = row;
  return { ...workspace, allowPlatformChannels: allow_platform_channels !== 0, displayCurrency: display_currency && display_symbol && typeof display_rate === "number" ? { code: display_currency, symbol: display_symbol, rate: display_rate } : null, createdAt: created_at };
}
