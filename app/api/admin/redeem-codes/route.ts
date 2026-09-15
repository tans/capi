import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  const db = await getDatabase();
  const data = db.query(`
    SELECT r.id, r.code, r.amount_quota / 500000.0 AS amount, r.redeemed_by, r.redeemed_at,
      r.created_at, r.expires_at, u.email AS redeemed_by_email, u.name AS redeemed_by_name,
      c.workspace_id, w.name AS workspace_name,
      CASE WHEN r.redeemed_by IS NOT NULL THEN 'redeemed'
        WHEN r.expires_at IS NOT NULL AND r.expires_at <= ? THEN 'expired' ELSE 'available' END AS status
    FROM redeem_codes r
    LEFT JOIN users u ON u.id = r.redeemed_by
    LEFT JOIN redeem_code_credits c ON c.redeem_code_id = r.id
    LEFT JOIN workspaces w ON w.id = c.workspace_id
    ORDER BY r.id DESC
  `).all(Date.now());
  return Response.json({ data });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  let body: { amount?: unknown; expiresAt?: unknown; code?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "body must be valid JSON" }, { status: 400 }); }
  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000) return Response.json({ error: "amount must be a finite number of at least 0.01" }, { status: 400 });
  const expiresAt = body.expiresAt === null || body.expiresAt === undefined ? null : body.expiresAt;
  if (expiresAt !== null && (typeof expiresAt !== "number" || !Number.isInteger(expiresAt) || expiresAt <= Date.now())) return Response.json({ error: "expiresAt must be a future timestamp" }, { status: 400 });
  const suppliedCode = body.code;
  if (suppliedCode !== undefined && (typeof suppliedCode !== "string" || !suppliedCode.trim() || suppliedCode.trim().length > 128)) return Response.json({ error: "code must be a non-empty string of at most 128 characters" }, { status: 400 });
  const code = typeof suppliedCode === "string" ? suppliedCode.trim() : `CAPI-${randomBytes(6).toString("hex").toUpperCase()}`;
  const db = await getDatabase();
  try {
    db.query("INSERT INTO redeem_codes (code, amount_quota, created_at, expires_at) VALUES (?, ?, ?, ?)").run(code, Math.round(amount * 500000), Date.now(), expiresAt);
  } catch { return Response.json({ error: "code already exists" }, { status: 409 }); }
  return Response.json({ code, amount: Math.round(amount * 100) / 100, expiresAt }, { status: 201 });
}
