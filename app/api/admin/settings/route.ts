import { requireAdmin } from "@/lib/relay/admin";
import { getRegistry, validCurrency } from "@/lib/relay";
import type { RelaySettings } from "@/lib/relay/config";
import { JEV_MODEL } from "@/lib/jev/types";

type RuntimeSettings = Pick<RelaySettings, "retryTimes" | "requestTimeoutMs" | "autoDisableEnabled" | "fallbackModelRatio" | "jevChannelId" | "pricingCurrency">;

function runtimeSettings(settings: RelaySettings): RuntimeSettings {
  const { retryTimes, requestTimeoutMs, autoDisableEnabled, fallbackModelRatio, jevChannelId, pricingCurrency } = settings;
  return { retryTimes, requestTimeoutMs, autoDisableEnabled, fallbackModelRatio, jevChannelId, pricingCurrency };
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const registry = await getRegistry();
  return Response.json(runtimeSettings(registry.settings));
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Settings must be an object.");
  const values = body as Record<string, unknown>;
  const allowed = ["retryTimes", "requestTimeoutMs", "autoDisableEnabled", "fallbackModelRatio", "jevChannelId", "pricingCurrency"];
  if (Object.keys(values).some((key) => !allowed.includes(key))) return badRequest("Unknown setting.");
  if (values.retryTimes !== undefined && (!Number.isSafeInteger(values.retryTimes) || (values.retryTimes as number) < 0 || (values.retryTimes as number) > 10)) {
    return badRequest("retryTimes must be an integer from 0 to 10.");
  }
  if (values.requestTimeoutMs !== undefined && (!Number.isSafeInteger(values.requestTimeoutMs) || (values.requestTimeoutMs as number) < 1000 || (values.requestTimeoutMs as number) > 600_000)) {
    return badRequest("requestTimeoutMs must be an integer from 1000 to 600000.");
  }
  if (values.autoDisableEnabled !== undefined && typeof values.autoDisableEnabled !== "boolean") return badRequest("autoDisableEnabled must be a boolean.");
  if (values.fallbackModelRatio !== undefined && (typeof values.fallbackModelRatio !== "number" || !Number.isFinite(values.fallbackModelRatio) || values.fallbackModelRatio < 0 || values.fallbackModelRatio > 1000)) {
    return badRequest("fallbackModelRatio must be a number from 0 to 1000.");
  }
  if (values.pricingCurrency !== undefined && !validCurrency(values.pricingCurrency)) return badRequest("pricingCurrency requires a three-letter code, symbol (up to 8 characters), and a positive rate (units per USD).");
  if (values.jevChannelId !== undefined && values.jevChannelId !== null && (!Number.isSafeInteger(values.jevChannelId) || (values.jevChannelId as number) <= 0)) {
    return badRequest("jevChannelId must be a positive integer or null.");
  }

  const registry = await getRegistry();
  if (values.jevChannelId !== undefined && values.jevChannelId !== null) {
    const channel = registry.getChannel(values.jevChannelId as number);
    if (!channel || channel.ownerType !== "platform" || channel.status !== 1 || !channel.models.includes(JEV_MODEL)) {
      return badRequest("jevChannelId must identify an enabled platform Jev channel.");
    }
  }

  const patch = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<RuntimeSettings>;
  return Response.json(runtimeSettings(await registry.updateSettings(patch)));
}
