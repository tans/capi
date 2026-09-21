import type { RelayRegistry } from "../relay/store";
import type { ChatRequestBody } from "../relay/relay";
import type { ApiKey } from "../relay/types";
import { assertModelAllowed } from "../relay/keys";
import { RelayError } from "../relay/errors";
import { classifyRequest } from "./classifier";
import { defaultAutoRoutePolicy } from "./policy";
import type { JevRouteDecision, AutoRouteConfig } from "../jev/types";
import { DEFAULT_AUTO_ROUTE_CONFIG, getWorkspaceJevSettings } from "../jev/config";
export async function resolveModel(registry: RelayRegistry, apiKey: ApiKey, body: ChatRequestBody, route?: JevRouteDecision | null) {
  const settings = await getWorkspaceJevSettings(apiKey.workspaceId);
  const alias = settings.routeConfig.alias || DEFAULT_AUTO_ROUTE_CONFIG.alias;
  const isAutoAlias = body.model === alias || body.model === "capi-auto";
  if (!isAutoAlias) return { requestModel: body.model, model: body.model, tier: null, reason: "explicit" };
  const tier = route?.complexity ?? classifyRequest(body);
  const intent = route?.intent ?? settings.routeConfig.fallback.intent;
  const config: AutoRouteConfig = settings.routeConfig;
  const profiles = [config.profiles[intent], config.profiles[config.fallback.intent], defaultAutoRoutePolicy].filter(Boolean) as Array<Record<string, string>>;
  const tiers = [tier, "standard", "light", "advanced"];
  const groups: string[] = apiKey.autoGroups.length ? apiKey.autoGroups : [apiKey.group || "default"];
  const candidates: string[] = [];
  for (const profile of profiles) for (const candidateTier of tiers) {
    const candidate = profile[candidateTier];
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }
  for (const candidate of candidates) {
    try { assertModelAllowed(apiKey, candidate); } catch { continue; }
    if (groups.some(group => registry.candidateIds(group, candidate).length > 0)) return { requestModel: body.model, model: candidate, tier, reason: route ? `jev:${intent}:${tier}` : `rule:${tier}` };
  }
  throw new RelayError(`No available model for automatic route ${intent}/${tier}`, { statusCode: 503, code: "no_available_channel" });
}
