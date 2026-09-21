import { RelayError, channelError, upstreamError } from "./errors";
import { assertModelAllowed, effectiveGroup } from "./keys";
import {
  computeQuota,
  estimatePreConsumeQuota,
  estimateTokens,
  quotaToUsd,
} from "./pricing";
import { shouldDisableChannel } from "./relay";
import { selectChannel } from "./selector";
import type { RelayRegistry } from "./store";
import type { ApiKey, Channel, EvaluateProtocol, UsageRecord } from "./types";

/**
 * Evaluation 中转（POST /api/v1/evaluate）。
 *
 * 与 chat completions 的差异：
 *   - 上游端点不是 /chat/completions，而是评测专用端点；Vercel AI Gateway 为 /v1/evaluate，
 *     渠道可用 evaluatePath 覆写，默认 /evaluate；TypeSafe 渠道可切换为 /v1/systemone。
 *   - 请求体是 { model, state, questions }，不是 messages；state 可以是字符串、对象或数组。
 *   - 响应是带概率的 answers + usage，按 usage 计费，与 chat 共用同一套倍率。
 *   - TypeSafe 渠道将 boolean/noul 与 jev 模型名做双向适配。
 *
 * 评测模型（如 typesafe-ai/jev）不是语言模型：走 /chat/completions 会被上游拒绝，
 * 必须经本端点转发。
 */

export const EVALUATE_QUESTION_TYPES = ["boolean", "noul", "choice", "score"] as const;
export type EvaluateQuestionType = (typeof EVALUATE_QUESTION_TYPES)[number];

/** 单个请求的题目数上限，防止单次请求挂上成百上千个问题。 */
export const MAX_EVALUATE_QUESTIONS = 20;

export type EvaluateRequestBody = {
  model: string;
  state: unknown;
  questions: Record<string, unknown>;
  [key: string]: unknown;
};

export type EvaluateValidation =
  | { ok: true; value: EvaluateRequestBody }
  | { ok: false; error: string };

/**
 * 校验并归一化评测请求体。
 *
 * 只校验 CAPI 需要理解的字段（model / state / questions），其余字段（例如
 * providerOptions）原样透传给上游，避免上游扩展能力被这一层吞掉。
 */
export function normalizeEvaluateBody(body: Record<string, unknown>): EvaluateValidation {
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return { ok: false, error: "Missing required parameter: model." };
  if (model.length > 200) return { ok: false, error: "model must not exceed 200 characters." };

  const state = body.state;
  if (state === undefined || state === null) return { ok: false, error: "Missing required parameter: state." };
  const stateIsText = typeof state === "string";
  const stateIsContainer = typeof state === "object" && !Array.isArray(state);
  const stateIsList = Array.isArray(state);
  if (!stateIsText && !stateIsContainer && !stateIsList) {
    return { ok: false, error: "state must be a string, object, or array." };
  }
  if (stateIsText && state.length > 200_000) return { ok: false, error: "state must not exceed 200000 characters." };

  const questions = body.questions;
  if (questions === undefined || questions === null) return { ok: false, error: "Missing required parameter: questions." };
  if (typeof questions !== "object" || Array.isArray(questions)) {
    return { ok: false, error: "questions must be an object keyed by question id." };
  }
  const entries = Object.entries(questions as Record<string, unknown>);
  if (!entries.length) return { ok: false, error: "questions must contain at least one question." };
  if (entries.length > MAX_EVALUATE_QUESTIONS) {
    return { ok: false, error: `questions must not exceed ${MAX_EVALUATE_QUESTIONS} entries.` };
  }
  for (const [id, question] of entries) {
    if (!id.trim()) return { ok: false, error: "Each question needs a non-empty id." };
    if (id.length > 64) return { ok: false, error: "Question ids must not exceed 64 characters." };
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return { ok: false, error: `Question "${id}" must be an object.` };
    }
    const type = (question as Record<string, unknown>).type;
    if (typeof type !== "string" || !(EVALUATE_QUESTION_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: `Question "${id}" has an unsupported type; use boolean, noul, choice, or score.` };
    }
  }

  return { ok: true, value: { ...body, model, state, questions: questions as Record<string, unknown> } };
}

/** 上游评测端点：baseUrl 已含 /v1 时拼出 /v1/evaluate，渠道可覆写路径。 */
export function evaluateEndpoint(channel: Pick<Channel, "baseUrl" | "evaluatePath">): string {
  const base = channel.baseUrl.replace(/\/+$/, "");
  const path = channel.evaluatePath?.trim();
  return `${base}${path && path.startsWith("/") ? path : "/evaluate"}`;
}

export function buildEvaluateUpstreamPayload(body: EvaluateRequestBody, protocol: EvaluateProtocol | undefined, upstreamModel: string): Record<string, unknown> {
  if (protocol !== "typesafe") return { ...body, model: upstreamModel };
  return {
    ...body,
    model: upstreamModel,
    questions: Object.fromEntries(
      Object.entries(body.questions).map(([id, question]) => {
        const value = question as Record<string, unknown>;
        return [id, value.type === "boolean" ? { ...value, type: "noul" } : value];
      }),
    ),
  };
}

export function normalizeEvaluateResponse(payload: Record<string, unknown>, body: EvaluateRequestBody, protocol: EvaluateProtocol | undefined): Record<string, unknown> {
  if (protocol !== "typesafe" || !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) return payload;
  const answers = Object.fromEntries(
    Object.entries(payload.answers as Record<string, unknown>).map(([id, answer]) => {
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) return [id, answer];
      const value = answer as Record<string, unknown>;
      const question = body.questions[id];
      if ((question as Record<string, unknown> | undefined)?.type !== "boolean" || value.type !== "noul" || typeof value.noul !== "number") return [id, value];
      return [id, { type: "boolean", probability: value.noul }];
    }),
  );
  return { ...payload, model: body.model, answers };
}

type EvaluateUsage = { promptTokens: number; completionTokens: number; cachedTokens: number };

/**
 * 解析评测响应的用量。
 *
 * 各家字段名不统一：Vercel AI Gateway 返回 usage.inputTokens / usage.outputTokens，
 * OpenAI 风格返回 input_tokens / output_tokens，这里都接受；拿不到时回退到请求体估算。
 */
export function extractEvaluateUsage(payload: Record<string, unknown>, fallback: EvaluateUsage): EvaluateUsage {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") return fallback;
  const raw = usage as Record<string, unknown>;
  const read = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    }
    return null;
  };
  const promptTokens = read("inputTokens", "input_tokens", "prompt_tokens", "promptTokens");
  const completionTokens = read("outputTokens", "output_tokens", "completion_tokens", "completionTokens");
  const cachedTokens = read("cachedTokens", "cached_tokens");
  if (promptTokens === null && completionTokens === null) return fallback;
  return {
    promptTokens: promptTokens ?? fallback.promptTokens,
    completionTokens: completionTokens ?? fallback.completionTokens,
    cachedTokens: cachedTokens ?? fallback.cachedTokens,
  };
}

/** 预扣费用量估算：state 与 questions 都会作为输入发给上游。 */
export function estimateEvaluateTokens(body: EvaluateRequestBody): number {
  return estimateTokens(JSON.stringify({ state: body.state, questions: body.questions }) ?? "");
}

export type EvaluateRelayContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  pinnedChannelId: number | null;
  requestId: string;
  body: EvaluateRequestBody;
};

export async function relayEvaluate(ctx: EvaluateRelayContext): Promise<Response> {
  const { registry, apiKey, requestId } = ctx;
  const settings = registry.settings;
  const model = ctx.body.model;
  const group = effectiveGroup(apiKey);

  // 模型白名单（403，不重试）
  assertModelAllowed(apiKey, model);

  const estimate = estimateEvaluateTokens(ctx.body);
  const pre = estimatePreConsumeQuota(settings, model, estimate, null, "default", group);

  let channel: Channel | null =
    ctx.pinnedChannelId === null
      ? selectChannel(registry, {
          group,
          model,
          retry: 0,
          workspaceId: apiKey.workspaceId,
          allowPlatform: registry.workspaceAllowsPlatformChannels(apiKey.workspaceId),
        })?.channel ?? null
      : registry.getChannel(ctx.pinnedChannelId) ?? null;

  if (ctx.pinnedChannelId !== null && channel) {
    const usable =
      !(channel.ownerType === "workspace" && channel.workspaceId !== apiKey.workspaceId) &&
      !(channel.ownerType === "platform" && !registry.workspaceAllowsPlatformChannels(apiKey.workspaceId));
    if (!usable) throw new RelayError(`Channel #${ctx.pinnedChannelId} is not available.`, { statusCode: 404, code: "invalid_request" });
  }
  if (!channel) {
    throw new RelayError(`No available channel for model ${model} in group ${group}.`, {
      statusCode: 503,
      code: "no_available_channel",
      type: "api_error",
    });
  }

  let isBillable = channel.ownerType === "platform" && !pre.free;
  if (isBillable && !await registry.reserveBilling(requestId, apiKey.workspaceId, apiKey.id, pre.quota)) {
    channel = selectChannel(registry, { group, model, retry: 0, excludeIds: [channel.id], workspaceId: apiKey.workspaceId, allowPlatform: false })?.channel ?? null;
    if (!channel) throw new RelayError("Insufficient funds or key budget.", { statusCode: 429, code: "quota_exceeded", type: "quota_error" });
    isBillable = false;
  }

  const upstreamKey = registry.pickUpstreamKey(channel);
  if (!upstreamKey) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError("Channel has no upstream key.", { statusCode: 503, code: "channel_error" });
  }

  const upstreamModel = channel.modelMapping?.[model] ?? model;
  const url = evaluateEndpoint(channel);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${upstreamKey}`,
    ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])),
  };
  const payload: Record<string, unknown> = {
    ...buildEvaluateUpstreamPayload(ctx.body, channel.evaluateProtocol, upstreamModel),
    ...Object(channel.paramOverride ?? {}),
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(settings.requestTimeoutMs),
    });
  } catch (error) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw channelError(`upstream request failed: ${error instanceof Error ? error.message : "network error"}`, null);
  }

  const fallback: EvaluateUsage = {
    promptTokens: estimate,
    completionTokens: 0,
    cachedTokens: 0,
  };

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    const error = upstreamError(
      `upstream ${channel.name} returned ${response.status}: ${(text || response.statusText).slice(0, 800)}`,
      response.status,
    );
    if (shouldDisableChannel(settings, error) && channel.autoBan) {
      await registry.updateChannel(channel.id, { status: 2, autoDisabledAt: Date.now(), lastError: error.message.slice(0, 500) });
    }
    throw error;
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw channelError("upstream returned invalid JSON body", null);
  }

  const usage = extractEvaluateUsage(json, fallback);
  const quote = computeQuota(settings, model, usage, "default", group);
  const chargedUnits = isBillable ? quote.quota : 0;
  if (isBillable && !await registry.finalizeBilling(requestId, chargedUnits, "settled")) {
    await registry.finalizeBilling(requestId, 0, "unknown");
    throw new RelayError("Billing settlement could not be finalized safely.", { statusCode: 503, code: "channel_error", type: "api_error" });
  }

  const record: UsageRecord = {
    id: requestId,
    requestId,
    createdAt: Date.now(),
    keyId: apiKey.id,
    keyName: apiKey.name,
    channelId: channel.id,
    channelName: channel.name,
    group,
    model,
    requestModel: model,
    upstreamModel,
    stream: false,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cachedTokens: usage.cachedTokens,
    quota: chargedUnits,
    retry: 0,
    firstByteMs: Date.now() - startedAt,
    durationMs: Date.now() - startedAt,
    success: true,
    statusCode: response.status,
  };
  await registry.recordUsage(record);

  return Response.json(
    { ...normalizeEvaluateResponse(json, ctx.body, channel.evaluateProtocol), cost: { amount: isBillable ? quotaToUsd(quote.quota) : 0, currency: "USD" } },
    {
      status: response.status,
      headers: { "x-capi-channel": String(channel.id), "x-capi-request-id": requestId },
    },
  );
}
