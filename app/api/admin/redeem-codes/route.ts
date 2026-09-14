import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  const db = await getDatabase();
  return Response.json({ data: db.query("SELECT id, code, amount_quota / 500000 AS amount, redeemed_by, redeemed_at, created_at, expires_at FROM redeem_codes ORDER BY id DESC").all() });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  const body = await request.json() as { amount?: number; expiresAt?: number; code?: string };
  if (!Number.isFinite(body.amount) || body.amount! <= 0) return Response.json({ error: "amount must be positive" }, { status: 400 });
  const code = body.code?.trim() || `CAPI-${randomBytes(6).toString("hex").toUpperCase()}`;
  const db = await getDatabase();
  try {
    db.query("INSERT INTO redeem_codes (code, amount_quota, created_at, expires_at) VALUES (?, ?, ?, ?)").run(code, Math.round(body.amount! * 500000), Date.now(), body.expiresAt ?? null);
  } catch { return Response.json({ error: "code already exists" }, { status: 409 }); }
  return Response.json({ code, amount: body.amount }, { status: 201 });
}
