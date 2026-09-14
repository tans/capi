import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const db = await getDatabase();
  const users = db.query<{ id: number; email: string; name: string; role: string; balance_units: number; created_at: number }, []>(
    `SELECT u.id, u.email, u.name, u.role, COALESCE(x.balance_units, 0) AS balance_units, u.created_at
     FROM users u LEFT JOIN workspaces w ON w.personal_owner_user_id = u.id
     LEFT JOIN wallets x ON x.workspace_id = w.id ORDER BY u.id DESC`,
  ).all();
  return Response.json({ data: users.map(({ balance_units, ...user }) => ({ ...user, balance: balance_units / 500_000 })) });
}
