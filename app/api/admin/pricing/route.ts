import { requireAdmin } from "@/lib/relay/admin";
import { getDatabase } from "@/lib/relay/store";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const db = await getDatabase();
  const row = db.query<{ model_ratio: string; completion_ratio: string; model_price: string }, []>("SELECT config->>'$.modelRatio' AS model_ratio, config->>'$.completionRatio' AS completion_ratio, config->>'$.modelPrice' AS model_price FROM settings WHERE id = 1").get();
  return Response.json(row ? { modelRatio: JSON.parse(row.model_ratio), completionRatio: JSON.parse(row.completion_ratio), modelPrice: JSON.parse(row.model_price) } : { modelRatio: {}, completionRatio: {}, modelPrice: {} });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await request.json() as Record<string, unknown>;
  const valid = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!valid(body.modelRatio) || !valid(body.completionRatio) || !valid(body.modelPrice)) return Response.json({ error: "pricing tables must contain non-negative numbers" }, { status: 400 });
  const db = await getDatabase();
  const config = JSON.stringify({ modelRatio: body.modelRatio, completionRatio: body.completionRatio, modelPrice: body.modelPrice });
  db.query("INSERT INTO settings (id, config) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET config = json_patch(settings.config, excluded.config)").run(config);
  return Response.json({ saved: true });
}
