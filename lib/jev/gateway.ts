import { buildEvaluateUpstreamPayload, estimateEvaluateTokens, evaluateEndpoint, extractEvaluateUsage, normalizeEvaluateResponse, type EvaluateRequestBody } from "../relay/evaluate";
import { effectiveGroup } from "../relay/keys";
import { computeQuota, estimatePreConsumeQuota } from "../relay/pricing";
import { isChannelAccessible, selectChannel } from "../relay/selector";
import type { RelayRegistry } from "../relay/store";
import type { ApiKey, UsageRecord } from "../relay/types";
import { buildSecurityEvidence } from "./evidence";
import type { JevComplexity, JevDecision, JevIntent, JevRouteDecision, JevSecurityCategory, JevSecurityDecision, WorkspaceJevSettings } from "./types";
import { JEV_MODEL } from "./types";

const INTENTS: JevIntent[] = ["chat", "code", "analysis", "sensitive", "media", "other"];
const COMPLEXITIES: JevComplexity[] = ["light", "standard", "advanced"];

type JevRunInput = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  requestId: string;
  requestModel: string;
  userText: string;
  settings: WorkspaceJevSettings;
};

function questionsFor(settings: WorkspaceJevSettings): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  if (settings.autoRoutingEnabled) {
    questions.route_intent = {
      type: "choice",
      instructions: "Classify the user's primary intent.",
      criteria: {
        chat: "General conversation or writing",
        code: "Programming, debugging, or software work",
        analysis: "Research, reasoning, planning, or complex analysis",
        sensitive: "A request involving sensitive or high-risk data",
        media: "A request about media generation or understanding",
        other: "Anything else",
      },
    };
    questions.route_complexity = {
      type: "choice",
      instructions: "Choose the minimum model capability needed to answer accurately.",
      criteria: {
        light: "Short, direct extraction, formatting, translation, or simple classification",
        standard: "Ordinary reasoning, writing, and multi-turn assistance",
        advanced: "Deep reasoning, architecture, difficult debugging, proofs, or multi-step expert work",
      },
    };
  }
  if (settings.securityAuditEnabled) {
    questions.leak_credential = { type: "boolean", instructions: "Does the user text disclose a credential, password, API key, access token, session cookie, or authentication secret?" };
    questions.leak_personal_data = { type: "boolean", instructions: "Does the user text disclose sensitive personal or account information that creates a meaningful privacy risk?" };
    questions.leak_internal_data = { type: "boolean", instructions: "Does the user text disclose confidential internal documents, configuration, source material, or non-public business information?" };
  }
  return questions;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bounded(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function choice<T extends string>(answer: unknown, allowed: readonly T[]): { value: T | null; confidence: number } {
  const data = object(answer);
  const value = typeof data.choice === "string" && allowed.includes(data.choice as T) ? data.choice as T : null;
  return { value, confidence: bounded(data.confidence) };
}

function probability(answer: unknown): number {
  const data = object(answer);
  return bounded(data.probability ?? data.noul ?? data.confidence);
}

function parseRoute(answers: Record<string, unknown>, enabled: boolean): JevRouteDecision | null {
  if (!enabled) return null;
  const intent = choice(answers.route_intent, INTENTS);
  const complexity = choice(answers.route_complexity, COMPLEXITIES);
  if (!intent.value || !complexity.value) return null;
  return { intent: intent.value, complexity: complexity.value, confidence: Math.min(intent.confidence, complexity.confidence) };
}

function parseSecurity(answers: Record<string, unknown>, enabled: boolean): JevSecurityDecision {
  if (!enabled) return { categories: [], severity: "none", confidence: 0 };
  const scores: Array<[JevSecurityCategory, number]> = [
    ["credential", probability(answers.leak_credential)],
    ["personal_data", probability(answers.leak_personal_data)],
    ["internal_data", probability(answers.leak_internal_data)],
  ];
  const categories = scores.filter(([category, score]) => category === "credential" ? score >= 0.85 : score >= 0.7).map(([category]) => category);
  const high = scores.some(([category, score]) => category === "credential" ? score >= 0.85 : score >= 0.9);
  return {
    categories,
    severity: high ? "high" : categories.length ? "low" : "none",
    confidence: scores.reduce((max, [, score]) => Math.max(max, score), 0),
  };
}

function unavailable(input: JevRunInput): JevDecision {
  const decision: JevDecision = { status: "unavailable", route: null, security: { categories: [], severity: "none", confidence: 0 }, requestId: null, quotaUnits: 0, promptTokens: 0 };
  input.registry.recordJevDecision({
    workspaceId: input.apiKey.workspaceId, requestId: input.requestId, keyId: input.apiKey.id, originalText: input.userText,
    routeIntent: null, routeComplexity: null, routeConfidence: null, securityCategories: [], securitySeverity: "unavailable",
    securityConfidence: null, detector: "unavailable", jevRequestId: null, promptTokens: 0, quotaUnits: 0,
  });
  return decision;
}

export async function evaluateInferenceInput(input: JevRunInput): Promise<JevDecision | null> {
  if (!input.settings.autoRoutingEnabled && !input.settings.securityAuditEnabled) return null;
  if (!input.userText) return unavailable(input);

  const group = effectiveGroup(input.apiKey);
  const pinnedId = input.registry.settings.jevChannelId;
  const allowPlatform = input.registry.workspaceAllowsPlatformChannels(input.apiKey.workspaceId);
  let channel;
  if (pinnedId === null) {
    channel = selectChannel(input.registry, {
      group, model: JEV_MODEL, retry: 0, workspaceId: input.apiKey.workspaceId, allowPlatform,
    })?.channel;
  } else {
    const pinned = input.registry.getChannel(pinnedId);
    if (pinned?.status === 1 && pinned.ownerType === "platform"
      && isChannelAccessible(pinned, input.apiKey.workspaceId, allowPlatform)
      && input.registry.candidateIds(group, JEV_MODEL).includes(pinnedId)) channel = pinned;
  }
  if (!channel) return unavailable(input);

  const body: EvaluateRequestBody = { model: JEV_MODEL, state: input.userText, questions: questionsFor(input.settings) };
  const estimate = estimateEvaluateTokens(body);
  const pre = estimatePreConsumeQuota(input.registry.settings, JEV_MODEL, estimate, null, "default", group);
  const billable = !pre.free;
  if (billable && !input.registry.canChargeJev(input.apiKey.workspaceId, pre.quota)) return unavailable(input);
  const upstreamKey = input.registry.pickUpstreamKey(channel);
  if (!upstreamKey) return unavailable(input);

  const jevRequestId = `${input.requestId}_jev`;
  const upstreamModel = channel.modelMapping?.[JEV_MODEL] ?? JEV_MODEL;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(evaluateEndpoint(channel), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstreamKey}`,
        ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])),
      },
      body: JSON.stringify({ ...buildEvaluateUpstreamPayload(body, channel.evaluateProtocol, upstreamModel), ...Object(channel.paramOverride ?? {}) }),
      signal: AbortSignal.timeout(input.registry.settings.requestTimeoutMs),
    });
  } catch {
    return unavailable(input);
  }
  if (!response.ok) return unavailable(input);

  let raw: Record<string, unknown>;
  try {
    raw = await response.json() as Record<string, unknown>;
  } catch {
    return unavailable(input);
  }
  const normalized = normalizeEvaluateResponse(raw, body, channel.evaluateProtocol);
  const answers = object(normalized.answers);
  const route = parseRoute(answers, input.settings.autoRoutingEnabled);
  const security = parseSecurity(answers, input.settings.securityAuditEnabled);
  if ((input.settings.autoRoutingEnabled && !route) || (input.settings.securityAuditEnabled && !normalized.answers)) return unavailable(input);

  const usage = extractEvaluateUsage(raw, { promptTokens: estimate, completionTokens: 0, cachedTokens: 0 });
  const quote = computeQuota(input.registry.settings, JEV_MODEL, usage, "default", group);
  const quotaUnits = billable ? quote.quota : 0;
  if (billable && quotaUnits > 0 && !input.registry.chargeJev(jevRequestId, input.apiKey.workspaceId, quotaUnits)) return unavailable(input);

  const record: UsageRecord = {
    id: jevRequestId, requestId: jevRequestId, createdAt: Date.now(), keyId: input.apiKey.id, keyName: input.apiKey.name,
    channelId: channel.id, channelName: channel.name, group, model: JEV_MODEL, requestModel: JEV_MODEL, upstreamModel,
    stream: false, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cachedTokens: usage.cachedTokens,
    quota: quotaUnits, retry: 0, firstByteMs: Date.now() - startedAt, durationMs: Date.now() - startedAt,
    success: true, statusCode: response.status, purpose: "jev_evaluation",
  };
  await input.registry.recordUsage(record);
  input.registry.recordJevDecision({
    workspaceId: input.apiKey.workspaceId, requestId: input.requestId, keyId: input.apiKey.id, originalText: input.userText,
    routeIntent: route?.intent ?? null, routeComplexity: route?.complexity ?? null, routeConfidence: route?.confidence ?? null,
    securityCategories: security.categories, securitySeverity: security.severity, securityConfidence: security.confidence,
    detector: "jev", jevRequestId, promptTokens: usage.promptTokens, quotaUnits,
  });
  if (input.settings.securityAuditEnabled && security.severity !== "none") {
    input.registry.recordSecurityIncident({
      workspaceId: input.apiKey.workspaceId, requestId: input.requestId, keyId: input.apiKey.id, severity: security.severity,
      categories: security.categories, confidence: security.confidence, evidence: buildSecurityEvidence(input.userText, security.categories),
    });
  }
  return { status: "jev", route, security, requestId: jevRequestId, quotaUnits, promptTokens: usage.promptTokens };
}
