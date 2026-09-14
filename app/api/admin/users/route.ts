import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const db = await getDatabase();
  const users = db.query<{ id: number; email: string; name: string; role: string; balance_quota: number; created_at: number }, []>(
    "SELECT id, email, name, role, balance_quota, created_at FROM users ORDER BY id DESC",
  ).all();
  return Response.json({ data: users.map((user) => ({ ...user, balance: user.balance_quota / 500_000 })) });
}
