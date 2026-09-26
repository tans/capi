import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";
import { getRegistry, quotaToCurrency, systemCurrency } from "@/lib/relay";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const registry = await getRegistry();
  const currency = systemCurrency((await registry.getSettings()));
  const db = await getDatabase();
  const users = (await db.query<{ id: number; email: string; name: string; role: string; balance_units: number; spent_units: number; created_at: number; last_used_at: number | null }, []>(
    `SELECT u.id, u.email, u.name, u.role,
       COALESCE(x.balance_units, 0) AS balance_units,
       COALESCE((SELECT SUM(k.budget_spent_units) FROM api_keys k WHERE k.user_id = u.id), 0) AS spent_units,
       u.created_at,
       (SELECT MAX(ur.created_at) FROM api_keys uk JOIN usage_records ur ON ur.key_id = uk.id
        WHERE uk.user_id = u.id) AS last_used_at
     FROM users u LEFT JOIN workspaces w ON w.personal_owner_user_id = u.id
     LEFT JOIN wallets x ON x.workspace_id = w.id ORDER BY u.id DESC`,
  ).all());
  return Response.json({ data: users.map(({ balance_units, spent_units, last_used_at, ...user }) => ({ ...user, last_used_at, balance: quotaToCurrency(balance_units, currency), spent: quotaToCurrency(spent_units, currency), currency: currency.code })) });
}
