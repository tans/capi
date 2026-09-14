import type { RelayRegistry } from "../relay/store";
import type { ChatRequestBody } from "../relay/relay";
import type { ApiKey } from "../relay/types";
import { assertModelAllowed } from "../relay/keys";
import { RelayError } from "../relay/errors";
import { classifyRequest } from "./classifier";
import { defaultAutoRoutePolicy } from "./policy";
export function resolveModel(registry: RelayRegistry, apiKey: ApiKey, body: ChatRequestBody) {
  if (body.model !== "capi-auto") return { requestModel: body.model, model: body.model, tier: null, reason: "explicit" };
  const tier = classifyRequest(body);
  const candidate = defaultAutoRoutePolicy[tier] || defaultAutoRoutePolicy[defaultAutoRoutePolicy.defaultTier];
  assertModelAllowed(apiKey, candidate);
  const groups: string[] = apiKey.autoGroups.length ? apiKey.autoGroups : [apiKey.group || "default"];
  if (!groups.some(group => registry.candidateIds(group, candidate).length > 0)) throw new RelayError(`Auto route model ${candidate} is unavailable`, { statusCode: 503, code: "no_available_channel" });
  return { requestModel: body.model, model: candidate, tier, reason: `rule:${tier}` };
}
