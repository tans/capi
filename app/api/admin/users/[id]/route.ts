import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "invalid user id" }, { status: 400 });
  const body = await request.json() as { role?: "user" | "admin"; balance?: number };
  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (body.role === "user" || body.role === "admin") { fields.push("role = ?"); values.push(body.role); }
  if (body.balance !== undefined && (!Number.isFinite(body.balance) || body.balance < 0)) return Response.json({ error: "balance must be a non-negative number" }, { status: 400 });
  if (!fields.length && body.balance === undefined) return Response.json({ error: "no valid changes" }, { status: 400 });
  const db = await getDatabase();
  const updated = db.transaction(() => {
    if (fields.length) db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
    if (body.balance === undefined) return db.query("SELECT 1 FROM users WHERE id = ?").get(id) !== null;
    const wallet = db.query<{ workspace_id: number; balance_units: number; reserved_units: number }, [number]>(
      `SELECT x.workspace_id, x.balance_units, x.reserved_units FROM workspaces w
       JOIN wallets x ON x.workspace_id = w.id WHERE w.kind = 'personal' AND w.personal_owner_user_id = ?`,
    ).get(id);
    if (!wallet) return false;
    const targetUnits = Math.round(body.balance * 500_000);
    if (targetUnits < wallet.reserved_units) return false;
    const delta = targetUnits - wallet.balance_units;
    db.query("UPDATE wallets SET balance_units = ? WHERE workspace_id = ?").run(targetUnits, wallet.workspace_id);
    db.query(
      "INSERT INTO wallet_entries (workspace_id, kind, delta_units, idempotency_key, reason, created_at) VALUES (?, 'adjustment', ?, ?, 'Administrator balance adjustment', ?)",
    ).run(wallet.workspace_id, delta, `admin-balance:${id}:${Date.now()}`, Date.now());
    return true;
  }).immediate();
  if (!updated) return Response.json({ error: "user not found or balance is reserved" }, { status: 409 });
  return Response.json({ updated: true, id });
}
