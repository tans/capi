import { requireAdmin } from "@/lib/relay/admin";
import { defaultSettings } from "@/lib/relay/config";
import { getDatabase } from "@/lib/relay/store";
import { getRegistry, systemCurrency } from "@/lib/relay";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const settings = await (await getRegistry()).getSettings();
  const currency = systemCurrency(settings);
  const display = (table: Record<string, number>) => Object.fromEntries(Object.entries(table).map(([model, price]) => [model, price * currency.rate]));
  return Response.json({
    currency: { code: currency.code, symbol: currency.symbol },
    inputPrice: display(settings.inputPrice),
    outputPrice: display(settings.outputPrice),
    cacheInputPrice: display(settings.cacheInputPrice),
    modelPrice: display(settings.modelPrice),
    videoPricePerSecond: display(settings.videoPricePerSecond),
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
  const currentCurrency = systemCurrency(await (await getRegistry()).getSettings());
  const videoPricePerSecond = body.videoPricePerSecond ?? Object.fromEntries(Object.entries(settings.videoPricePerSecond ?? defaultSettings.videoPricePerSecond).map(([model, price]) => [model, price * currentCurrency.rate]));
  const videoModels = Object.keys(videoPricePerSecond as Record<string, number>);
  if (videoModels.some((model) => inputKeys.includes(model) || Object.hasOwn(body.modelPrice as object, model))) return Response.json({ error: "Per-second video prices cannot be combined with token or per-call prices for the same model." }, { status: 400 });
  const store = (table: Record<string, number>) => Object.fromEntries(Object.entries(table).map(([model, price]) => [model, price / currentCurrency.rate]));
  const config = JSON.stringify({ ...settings, inputPrice: store(body.inputPrice as Record<string, number>), outputPrice: store(body.outputPrice as Record<string, number>), cacheInputPrice: store(body.cacheInputPrice as Record<string, number>), modelPrice: store(body.modelPrice as Record<string, number>), videoPricePerSecond: store(videoPricePerSecond as Record<string, number>) });
  (await db.query("INSERT INTO settings (id, config) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config").run(config));
  return Response.json({ saved: true });
}
