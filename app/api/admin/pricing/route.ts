import { requireAdmin } from "@/lib/relay/admin";
import { defaultSettings } from "@/lib/relay/config";
import { getDatabase } from "@/lib/relay/store";

function parseTable(value: string | null | undefined): Record<string, number> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0));
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const db = await getDatabase();
  const row = (await db.query<{ config: string }, []>("SELECT config FROM settings WHERE id = 1").get());
  let config: Record<string, unknown> = {};
  try { config = row ? JSON.parse(row.config) as Record<string, unknown> : {}; } catch { /* Use empty editable tables for malformed settings. */ }
  return Response.json({
    inputPrice: parseTable(typeof config.inputPrice === "string" ? config.inputPrice : JSON.stringify(config.inputPrice)),
    outputPrice: parseTable(typeof config.outputPrice === "string" ? config.outputPrice : JSON.stringify(config.outputPrice)),
    cacheInputPrice: parseTable(typeof config.cacheInputPrice === "string" ? config.cacheInputPrice : JSON.stringify(config.cacheInputPrice)),
    modelPrice: config.modelPrice === undefined
      ? defaultSettings.modelPrice
      : parseTable(typeof config.modelPrice === "string" ? config.modelPrice : JSON.stringify(config.modelPrice)),
    videoPricePerSecond: config.videoPricePerSecond === undefined
      ? defaultSettings.videoPricePerSecond
      : parseTable(typeof config.videoPricePerSecond === "string" ? config.videoPricePerSecond : JSON.stringify(config.videoPricePerSecond)),
  });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await request.json() as Record<string, unknown>;
  const valid = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!valid(body.inputPrice) || !valid(body.outputPrice) || !valid(body.cacheInputPrice) || !valid(body.modelPrice) || (body.videoPricePerSecond !== undefined && !valid(body.videoPricePerSecond))) return Response.json({ error: "Prices must be non-negative numbers." }, { status: 400 });
  const inputKeys = Object.keys(body.inputPrice as Record<string, number>).sort();
  const outputKeys = Object.keys(body.outputPrice as Record<string, number>).sort();
  if (inputKeys.length !== outputKeys.length || inputKeys.some((key, index) => key !== outputKeys[index])) return Response.json({ error: "Each token-priced model needs both input and output prices." }, { status: 400 });
  const db = await getDatabase();
  const current = (await db.query<{ config: string }, []>("SELECT config FROM settings WHERE id = 1").get());
  let settings: Record<string, unknown> = {};
  try { settings = current ? JSON.parse(current.config) as Record<string, unknown> : {}; } catch { /* Replace malformed settings with the submitted pricing tables. */ }
  const videoPricePerSecond = body.videoPricePerSecond ?? settings.videoPricePerSecond ?? defaultSettings.videoPricePerSecond;
  const videoModels = Object.keys(videoPricePerSecond as Record<string, number>);
  if (videoModels.some((model) => inputKeys.includes(model) || Object.hasOwn(body.modelPrice as object, model))) return Response.json({ error: "Per-second video prices cannot be combined with token or per-call prices for the same model." }, { status: 400 });
  const config = JSON.stringify({ ...settings, inputPrice: body.inputPrice, outputPrice: body.outputPrice, cacheInputPrice: body.cacheInputPrice, modelPrice: body.modelPrice, videoPricePerSecond });
  (await db.query("INSERT INTO settings (id, config) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config").run(config));
  return Response.json({ saved: true });
}
