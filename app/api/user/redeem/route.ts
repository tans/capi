import { authResponse, readAuthBody, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";

export async function POST(request: Request) {
  return authResponse(async () => {
    requireSameOrigin(request);
    const user = await requireUser(request);
    const body = await readAuthBody(request);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) return Response.json({ error: "code is required" }, { status: 400 });
    const db = await getDatabase();
    const result = db.transaction(() => {
      const row = db.query<{ id: number; amount_quota: number; expires_at: number | null }, [string]>("SELECT id, amount_quota, expires_at FROM redeem_codes WHERE code = ? AND redeemed_by IS NULL").get(code);
      if (!row || (row.expires_at !== null && row.expires_at <= Date.now())) return null;
      db.query("UPDATE redeem_codes SET redeemed_by = ?, redeemed_at = ? WHERE id = ? AND redeemed_by IS NULL").run(user.id, Date.now(), row.id);
      db.query("UPDATE users SET balance_quota = balance_quota + ? WHERE id = ?").run(row.amount_quota, user.id);
      return row.amount_quota;
    }).immediate();
    if (result === null) return Response.json({ error: "invalid, expired, or already redeemed code" }, { status: 400 });
    return Response.json({ redeemed: true, amount: result / 500000 });
  });
}
