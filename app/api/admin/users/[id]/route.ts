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
  if (body.balance !== undefined && Number.isFinite(body.balance) && body.balance >= 0) { fields.push("balance_quota = ?"); values.push(Math.round(body.balance * 500_000)); }
  if (!fields.length) return Response.json({ error: "no valid changes" }, { status: 400 });
  values.push(id);
  const db = await getDatabase();
  const result = db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  if (!result.changes) return Response.json({ error: "user not found" }, { status: 404 });
  return Response.json({ updated: true, id });
}
