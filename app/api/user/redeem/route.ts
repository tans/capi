import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";
import { requireWorkspacePermission } from "@/lib/workspaces/permissions";
import { getRegistry, quotaToCurrency, systemCurrency, workspaceCurrency } from "@/lib/relay";

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await readAuthBody(request);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const workspaceId = body.workspaceId;
    if (!code) return Response.json({ error: "code is required" }, { status: 400 });
    if (typeof workspaceId !== "number" || !Number.isInteger(workspaceId) || workspaceId <= 0) return Response.json({ error: "workspaceId must be a positive integer" }, { status: 400 });
    const target = workspaceId;
    await requireWorkspacePermission(user.id, target, "manage");
    const registry = await getRegistry();
    const db = await getDatabase();
    const result = db.transaction(() => {
      const row = db.query<{ id: number; amount_quota: number; expires_at: number | null; redeemed_by: number | null }, [string]>(
        "SELECT id, amount_quota, expires_at, redeemed_by FROM redeem_codes WHERE code = ?",
      ).get(code);
      if (!row) return null;
      if (row.redeemed_by !== null) {
        const previous = db.query<{ amount_quota: number }, [number, number, number]>(
          `SELECT r.amount_quota FROM redeem_codes r JOIN redeem_code_credits c ON c.redeem_code_id = r.id
           WHERE r.id = ? AND r.redeemed_by = ? AND c.workspace_id = ?`,
        ).get(row.id, user.id, target);
        return previous ? { amount: previous.amount_quota, replayed: true } : null;
      }
      if (row.expires_at !== null && row.expires_at <= Date.now()) return null;
      const redeemed = db.query("UPDATE redeem_codes SET redeemed_by = ?, redeemed_at = ? WHERE id = ? AND redeemed_by IS NULL").run(user.id, Date.now(), row.id);
      if (redeemed.changes !== 1) return null;
      const wallet = db.query<{ workspace_id: number }, [number]>("SELECT workspace_id FROM wallets WHERE workspace_id = ?").get(target);
      if (!wallet) throw new Error("wallet not found");
      const entry = db.query<{ id: number }, [number, number, string, number, number]>(
        `INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, actor_user_id, reason, created_at)
         VALUES (?, 'redeem', ?, ?, ?, 'Redeem code', ?) RETURNING id`,
      ).get(target, row.amount_quota, `redeem:${row.id}`, user.id, Date.now());
      if (!entry) throw new Error("wallet entry could not be created");
      const updated = db.query("UPDATE wallets SET balance_units = balance_units + ? WHERE workspace_id = ?").run(row.amount_quota, target);
      if (updated.changes !== 1) throw new Error("wallet update failed");
      db.query("INSERT INTO redeem_code_credits (redeem_code_id, workspace_id, wallet_entry_id) VALUES (?, ?, ?)").run(row.id, target, entry.id);
      return { amount: row.amount_quota, replayed: false };
    }).immediate();
    if (result === null) return Response.json({ error: "invalid, expired, or already redeemed code" }, { status: 400 });
    const finalCurrency = workspaceCurrency(db, target, systemCurrency(registry.settings));
    return Response.json({ redeemed: true, replayed: result.replayed, workspaceId: target, amount: Number(quotaToCurrency(result.amount, finalCurrency).toFixed(4)), currency: finalCurrency.code });
  });
}
