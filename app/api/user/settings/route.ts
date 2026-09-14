import { authResponse, requireSameOrigin, requireUser } from "@/lib/auth";
import { getDatabase } from "@/lib/relay/store";

async function setup() { const db = await getDatabase(); db.exec("CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, config TEXT NOT NULL CHECK (json_valid(config)), saved_at INTEGER NOT NULL)"); return db; }
export async function GET(request: Request) {
  return authResponse(async () => {
  const user = await requireUser(request, "dashboard:access"); const db = await setup();
  const row = db.query<{ config: string; saved_at: number }, [number]>("SELECT config, saved_at FROM user_settings WHERE user_id = ?").get(user.id);
  const config = row ? JSON.parse(row.config) : { accountName: user.name, accountEmail: user.email, notifications: {}, autoRoute: { name: "capi-auto", light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5", defaultTier: "standard", allowPlatform: true, sticky: true } };
  return Response.json({ ...config, savedAt: row ? new Date(row.saved_at).toISOString() : null });
  });
}
export async function PUT(request: Request) {
  return authResponse(async () => {
  requireSameOrigin(request);
  const user = await requireUser(request, "dashboard:access"); const body = await request.json() as { accountName?: string; accountEmail?: string; notifications?: Record<string, boolean> };
  const accountEmail = body.accountEmail?.trim() || user.email;
  if (!accountEmail.includes("@")) return Response.json({ error: "invalid email" }, { status: 400 });
  const config = { accountName: body.accountName?.trim() || user.name, accountEmail, notifications: body.notifications ?? {}, autoRoute: (body as any).autoRoute }; const savedAt = Date.now(); const db = await setup();
  db.query("INSERT INTO user_settings (user_id, config, saved_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config, saved_at=excluded.saved_at").run(user.id, JSON.stringify(config), savedAt);
  return Response.json({ ...config, savedAt: new Date(savedAt).toISOString() });
  });
}
