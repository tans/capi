import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";
import { quotaToUsd } from "@/lib/relay";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const db = await getDatabase();
  const users = db.query<{ id: number; email: string; name: string; role: string; balance_units: number; spent_units: number; created_at: number }, []>(
    `SELECT u.id, u.email, u.name, u.role,
       COALESCE(x.balance_units, 0) AS balance_units,
       COALESCE((SELECT SUM(k.budget_spent_units) FROM api_keys k WHERE k.user_id = u.id), 0) AS spent_units,
       u.created_at
     FROM users u LEFT JOIN workspaces w ON w.personal_owner_user_id = u.id
     LEFT JOIN wallets x ON x.workspace_id = w.id ORDER BY u.id DESC`,
  ).all();
  return Response.json({ data: users.map(({ balance_units, spent_units, ...user }) => ({ ...user, balance: quotaToUsd(balance_units), spent: quotaToUsd(spent_units) })) });
}
