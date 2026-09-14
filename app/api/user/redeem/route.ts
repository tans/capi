import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await readAuthBody(request);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const workspaceId = typeof body.workspaceId === "number" ? body.workspaceId : null;
    if (!code) return Response.json({ error: "code is required" }, { status: 400 });
    const db = await getDatabase();
    const target = workspaceId ?? db.query<{ id: number }, [number, number]>(
      "SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE w.personal_owner_user_id = ? AND m.user_id = ?",
    ).get(user.id, user.id)?.id;
    if (!target) return Response.json({ error: "workspaceId is required" }, { status: 400 });
    await requireWorkspacePermission(user.id, target, "manage");
    const result = db.transaction(() => {
      const row = db.query<{ id: number; amount_quota: number; expires_at: number | null }, [string]>(
        "SELECT id, amount_quota, expires_at FROM redeem_codes WHERE code = ? AND redeemed_by IS NULL",
      ).get(code);
      if (!row || (row.expires_at !== null && row.expires_at <= Date.now())) return null;
      const redeemed = db.query("UPDATE redeem_codes SET redeemed_by = ?, redeemed_at = ? WHERE id = ? AND redeemed_by IS NULL").run(user.id, Date.now(), row.id);
      if (redeemed.changes !== 1) return null;
      const entry = db.query<{ id: number }, [number, number, string, number, number]>(
        `INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, actor_user_id, reason, created_at)
         VALUES (?, 'redeem', ?, ?, ?, 'Redeem code', ?) RETURNING id`,
      ).get(target, row.amount_quota, `redeem:${row.id}`, user.id, Date.now())!;
      db.query("UPDATE wallets SET balance_units = balance_units + ? WHERE workspace_id = ?").run(row.amount_quota, target);
      db.query("INSERT INTO redeem_code_credits (redeem_code_id, workspace_id, wallet_entry_id) VALUES (?, ?, ?)").run(row.id, target, entry.id);
      return row.amount_quota;
    }).immediate();
    if (result === null) return Response.json({ error: "invalid, expired, or already redeemed code" }, { status: 400 });
    return Response.json({ redeemed: true, workspaceId: target, amount: result / 500000 });
  });
}
