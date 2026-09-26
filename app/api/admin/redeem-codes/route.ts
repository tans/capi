import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/relay/admin";
import { currencyToQuota, getRegistry, quotaToCurrency, systemCurrency } from "@/lib/relay";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  const registry = await getRegistry();
  const currency = systemCurrency((await registry.getSettings()));
  const db = await getDatabase();
  const data = (await db.query<{
    id: number; code: string; amount_quota: number; redeemed_by: number | null; redeemed_at: number | null;
    created_at: number; expires_at: number | null; redeemed_by_email: string | null; redeemed_by_name: string | null;
    workspace_id: number | null; workspace_name: string | null; status: string;
  }, [number]>(`
    SELECT r.id, r.code, r.amount_quota AS amount_quota, r.redeemed_by, r.redeemed_at,
      r.created_at, r.expires_at, u.email AS redeemed_by_email, u.name AS redeemed_by_name,
      c.workspace_id, w.name AS workspace_name,
      CASE WHEN r.redeemed_by IS NOT NULL THEN 'redeemed'
        WHEN r.expires_at IS NOT NULL AND r.expires_at <= ? THEN 'expired' ELSE 'available' END AS status
    FROM redeem_codes r
    LEFT JOIN users u ON u.id = r.redeemed_by
    LEFT JOIN redeem_code_credits c ON c.redeem_code_id = r.id
    LEFT JOIN workspaces w ON w.id = c.workspace_id
    ORDER BY r.id DESC
  `).all(Date.now()));
  return Response.json({ data: data.map((row) => ({ ...row, amount: Number(quotaToCurrency(Number(row.amount_quota), currency).toFixed(2)), currency: currency.code })) });
}
export async function POST(request: Request) {
  const denied = await requireAdmin(request); if (denied) return denied;
  let body: { amount?: unknown; expiresAt?: unknown; code?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "body must be valid JSON" }, { status: 400 }); }
  const registry = await getRegistry();
  const currency = systemCurrency((await registry.getSettings()));
  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000) return Response.json({ error: "amount must be a finite number of at least 0.01" }, { status: 400 });
  const expiresAt = body.expiresAt === null || body.expiresAt === undefined ? null : body.expiresAt;
  if (expiresAt !== null && (typeof expiresAt !== "number" || !Number.isInteger(expiresAt) || expiresAt <= Date.now())) return Response.json({ error: "expiresAt must be a future timestamp" }, { status: 400 });
  const suppliedCode = body.code;
  if (suppliedCode !== undefined && (typeof suppliedCode !== "string" || !suppliedCode.trim() || suppliedCode.trim().length > 128)) return Response.json({ error: "code must be a non-empty string of at most 128 characters" }, { status: 400 });
  const code = typeof suppliedCode === "string" ? suppliedCode.trim() : `CAPI-${randomBytes(6).toString("hex").toUpperCase()}`;
  const db = await getDatabase();
  try {
    (await db.query("INSERT INTO redeem_codes (code, amount_quota, created_at, expires_at) VALUES (?, ?, ?, ?)").run(code, currencyToQuota(amount, currency), Date.now(), expiresAt));
  } catch { return Response.json({ error: "code already exists" }, { status: 409 }); }
  return Response.json({ code, amount: Number(amount.toFixed(2)), currency: currency.code, expiresAt }, { status: 201 });
}
