import { inRanges, channelError, RelayError, upstreamError } from "./errors";
import {
  assertModelAllowed,
  effectiveGroup,
} from "./keys";
import {
  computeQuota,
  estimatePreConsumeQuota,
  estimateTokens,
  quotaToUsd,
} from "./pricing";
import { selectChannel } from "./selector";
import type { RelayRegistry } from "./store";
import type { ApiKey, Channel, UsageRecord } from "./types";
import { resolveModel } from "../auto-router/resolve";

/**
 * 中转主流程（对齐 controller/relay.go 的 Relay）：
 *
 *   鉴权(路由层已完成) -> 模型白名单 -> 预扣费
 *   -> [ retry 循环: 选渠道 -> 构建上游请求 -> 转发 -> 失败处理/换渠道 ]
 *   -> 结算实际费用 -> 记录用量
 *
 * 上游协议当前统一按 OpenAI 兼容（/chat/completions + Bearer）转发；
 * 主流厂商（OpenAI/Anthropic/Gemini/各家中转站）都提供该入口。
 */

export type ChatRequestBody = {
  model: string;
  messages?: { role: string; content: unknown }[];
  stream?: boolean;
  max_tokens?: number;
  [key: string]: unknown;
};

export type RelayContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  /** 管理员通过 sk-<key>-<channelId> 指定的渠道 */
  pinnedChannelId: number | null;
  requestId: string;
  body: ChatRequestBody;
};

type UpstreamUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};

export function newRequestId(): string {
  return `capi_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`;
}

export async function relayChatCompletion(ctx: RelayContext): Promise<Response> {
  const { registry, apiKey } = ctx;
  const requestModel = ctx.body.model;
  const resolved = await resolveModel(registry, apiKey, ctx.body);
  const body = { ...ctx.body, model: resolved.model };
  const settings = registry.settings;
  const model = body.model;
  const group = effectiveGroup(apiKey);

  // 模型白名单（403，不重试）
  assertModelAllowed(apiKey, model);

  const promptEstimate = estimatePromptTokens(body);
  const pre = estimatePreConsumeQuota(settings, model, promptEstimate, typeof body.max_tokens === "number" ? body.max_tokens : null, "default", group);

  const exhaustedChannelIds: number[] = [];
  const triedKeysByChannel = new Map<number, string[]>();
  let lastError: RelayError | null = null;
  let retry = 0;

  for (; ; retry++) {
    let channel: Channel | null = null;

    if (ctx.pinnedChannelId !== null && retry === 0) {
      const pinned = registry.getChannel(ctx.pinnedChannelId);
      if (!pinned || (pinned.ownerType === "workspace" && pinned.workspaceId !== apiKey.workspaceId) || (pinned.ownerType === "platform" && !registry.workspaceAllowsPlatformChannels(apiKey.workspaceId))) {
        throw new RelayError(`Channel #${ctx.pinnedChannelId} is not available.`, { statusCode: 404, code: "invalid_request" });
      }
      channel = pinned;
    } else {
      const picked = selectChannel(registry, {
        group,
        model,
        retry: exhaustedChannelIds.length,
        excludeIds: exhaustedChannelIds,
        workspaceId: apiKey.workspaceId,
        allowPlatform: registry.workspaceAllowsPlatformChannels(apiKey.workspaceId),
      });
      channel = picked?.channel ?? null;
    }

    if (!channel) {
      if (retry === 0) {
        throw new RelayError(
          `No available channel for model ${model} in group ${group}.`,
          { statusCode: 503, code: "no_available_channel", type: "api_error" },
        );
      }
      break;
    }

    const triedKeys = triedKeysByChannel.get(channel.id) ?? [];
    const upstreamKey = registry.pickUpstreamKey(channel, triedKeys);
    if (!upstreamKey) {
      exhaustedChannelIds.push(channel.id);
      continue;
    }
    const isBillable = channel.ownerType === "platform" && !pre.free;
    if (isBillable && !await registry.reserveBilling(ctx.requestId, apiKey.workspaceId, apiKey.id, pre.quota)) {
      exhaustedChannelIds.push(channel.id);
      continue;
    }

    try {
      return await forwardToChannel(ctx, channel, group, retry, upstreamKey, isBillable, requestModel);
    } catch (error) {
      if (isBillable) await registry.finalizeBilling(ctx.requestId, 0, "released");
      lastError = error instanceof RelayError
        ? error
        : channelError(error instanceof Error ? error.message : "network error");
      triedKeys.push(upstreamKey);
      triedKeysByChannel.set(channel.id, triedKeys);
      const hasAlternateKey = registry.hasUpstreamKey(channel, triedKeys);
      if (!hasAlternateKey) {
        exhaustedChannelIds.push(channel.id);
        if (shouldDisableChannel(settings, lastError) && channel.autoBan) {
          await registry.updateChannel(channel.id, { status: 2, autoDisabledAt: Date.now(), lastError: lastError.message });
        }
      }
      if (retry >= settings.retryTimes || !shouldRetry(settings, lastError)) break;
    }
  }

  // 预扣费退还（对应 Billing.Refund）

  throw (
    lastError ??
    new RelayError("relay failed", { statusCode: 502, code: "channel_error" })
  );
}

export type ResponsesRelayContext = { registry: RelayRegistry; apiKey: ApiKey; pinnedChannelId: number | null; requestId: string; body: Record<string, unknown> & { model: string; stream?: boolean } };

export async function relayResponses(ctx: ResponsesRelayContext): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  const requestModel = body.model;
  const model = body.model;
  assertModelAllowed(apiKey, model);
  const group = effectiveGroup(apiKey);
  let channel = ctx.pinnedChannelId === null ? selectChannel(registry, { group, model, retry: 0, workspaceId: apiKey.workspaceId, allowPlatform: registry.workspaceAllowsPlatformChannels(apiKey.workspaceId) })?.channel : registry.getChannel(ctx.pinnedChannelId);
  if (!channel) throw new RelayError(`No available channel for model ${model}.`, { statusCode: 503, code: "no_available_channel", type: "api_error" });
  const quote = estimatePreConsumeQuota(registry.settings, model, estimateResponsesPromptTokens(body), typeof body.max_output_tokens === "number" ? body.max_output_tokens : null, "default", group);
  let isBillable = channel.ownerType === "platform" && !quote.free;
  if (isBillable && !await registry.reserveBilling(requestId, apiKey.workspaceId, apiKey.id, quote.quota)) {
    channel = selectChannel(registry, { group, model, retry: 0, workspaceId: apiKey.workspaceId, allowPlatform: false })?.channel;
    if (!channel) throw new RelayError("Insufficient funds or key budget.", { statusCode: 429, code: "quota_exceeded", type: "quota_error" });
    isBillable = false;
  }
  const key = registry.pickUpstreamKey(channel);
  if (!key) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError("Channel has no upstream key.", { statusCode: 503, code: "channel_error" });
  }
  const upstreamModel = channel.modelMapping?.[model] ?? model;
  let response: Response;
  try {
    response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])) }, body: JSON.stringify({ ...body, model: upstreamModel }), signal: AbortSignal.timeout(registry.settings.requestTimeoutMs) });
  } catch (error) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw error;
  }
  if (!response.ok) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError(`Upstream returned ${response.status}.`, { statusCode: response.status, code: "channel_error" });
  }

  const settle = async (usage: UpstreamUsage, success: boolean, errorMessage?: string) => {
    const actual = computeQuota(registry.settings, model, usage, "default", group).quota;
    if (isBillable && !await registry.finalizeBilling(requestId, actual, "settled")) {
      await registry.finalizeBilling(requestId, 0, "unknown");
      throw new RelayError("Billing settlement could not be finalized safely.", { statusCode: 503, code: "channel_error" });
    }
    await registry.recordUsage({ id: requestId, requestId, createdAt: Date.now(), keyId: apiKey.id, keyName: apiKey.name, channelId: channel.id, channelName: channel.name, group, model, requestModel, upstreamModel, stream: body.stream === true, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cachedTokens: usage.cachedTokens, quota: isBillable ? actual : 0, retry: 0, firstByteMs: 0, durationMs: 0, success, statusCode: response.status, errorMessage });
  };

  if (body.stream === true && !response.body) {
    await settle({ promptTokens: estimateResponsesPromptTokens(body), completionTokens: 0, cachedTokens: 0 }, false, "upstream returned empty stream body");
    throw channelError("upstream returned empty stream body", null);
  }
  if (body.stream === true && response.body) {
    const upstreamBody = response.body;
    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let input = estimateResponsesPromptTokens(body);
    let output = 0;
    let cached = 0;
    let settlement: Promise<void> | null = null;
    let settlementError: unknown;
    const capturedUsage = (): UpstreamUsage => ({ promptTokens: input, completionTokens: output, cachedTokens: cached });
    const settleOnce = (success: boolean, errorMessage?: string) => {
      if (!settlement) settlement = settle(capturedUsage(), success, errorMessage).catch((error) => { settlementError = error; });
      return settlement;
    };
    const capture = (data: string) => {
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const usage = extractUsage(parsed);
        if (usage) {
          if (typeof usage.promptTokens === "number") input = usage.promptTokens;
          if (typeof usage.completionTokens === "number") output = usage.completionTokens;
          if (typeof usage.cachedTokens === "number") cached = usage.cachedTokens;
        }
      } catch { /* opaque event */ }
    };
    const outputStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            buffer = consumeSseEvents(buffer + decoder.decode(), capture);
            await settleOnce(true);
            if (settlementError) { controller.error(settlementError); return; }
            controller.close();
            return;
          }
          controller.enqueue(result.value);
          buffer = consumeSseEvents(buffer + decoder.decode(result.value, { stream: true }), capture);
        } catch (error) {
          await settleOnce(false, error instanceof Error ? error.message : "upstream stream failed");
          controller.error(error);
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason); } catch { /* upstream is already closed */ }
        await settleOnce(false, reason instanceof Error ? reason.message : "client cancelled stream");
      },
    });
    return new Response(outputStream, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "text/event-stream", "x-capi-request-id": requestId, "x-capi-channel": String(channel.id) } });
  }
  const json = await response.json().catch(() => { throw new RelayError("Upstream returned invalid JSON.", { statusCode: 502, code: "channel_error" }); }) as Record<string, unknown>;
  const usage = extractUsage(json);
  await settle(usage ?? { promptTokens: estimateResponsesPromptTokens(body), completionTokens: 0, cachedTokens: 0 }, true);
  return Response.json(json, { status: response.status, headers: { "x-capi-request-id": requestId, "x-capi-channel": String(channel.id) } });
}

 // ------------------------------------------------------------------- forward
// ------------------------------------------------------------------- forward

async function forwardToChannel(
  ctx: RelayContext,
  channel: Channel,
  group: string,
  retryCount: number,
  upstreamKey: string,
  isBillable: boolean,
  requestModel: string,
): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  const settings = registry.settings;
  const model = body.model;
  const stream = body.stream === true;

  if (!upstreamKey) {
    throw channelError(`channel #${channel.id} has no upstream key`, null);
  }

  // 模型映射：对外模型名 -> 上游真实模型名
  const upstreamModel = channel.modelMapping?.[model] ?? model;

  const url = `${channel.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${upstreamKey}`,
    ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const payload: Record<string, unknown> = { ...body, ...Object(channel.paramOverride ?? {}), model: upstreamModel };
  if (stream && payload.stream_options === undefined) payload.stream_options = { include_usage: true };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      ...(stream ? {} : { signal: AbortSignal.timeout(settings.requestTimeoutMs) }),
    });
  } catch (error) {
    throw channelError(`upstream request failed: ${error instanceof Error ? error.message : "network error"}`, null);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw upstreamError(
      truncate(`upstream ${channel.name} returned ${response.status}: ${text || response.statusText}`, 800),
      response.status,
    );
  }

  // ------------------------------------------------------------ success path

  const settle = async (usage: UpstreamUsage, statusCode: number, firstByteMs: number, durationMs: number, success: boolean, errorMessage?: string) => {
    const quote = computeQuota(
      settings,
      model,
      {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
      },
      "default",
      group,
    );

    const chargedUnits = isBillable ? quote.quota : 0;
    if (isBillable && !await registry.finalizeBilling(ctx.requestId, chargedUnits, "settled")) {
      await registry.finalizeBilling(ctx.requestId, 0, "unknown");
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
      requestModel,
      upstreamModel,
      stream,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      quota: chargedUnits,
      retry: retryCount,
      firstByteMs,
      durationMs,
      success,
      statusCode,
      errorMessage,
    };
    await registry.recordUsage(record);
  };

  const firstByteMs = Date.now() - startedAt;

  if (stream && !response.body) {
    await settle({ promptTokens: estimatePromptTokens(body), completionTokens: 0, cachedTokens: 0 }, response.status, firstByteMs, Date.now() - startedAt, false, "upstream returned empty stream body");
    throw channelError("upstream returned empty stream body", null);
  }
  if (stream) {
    const upstreamBody = response.body!;
    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let captured: UpstreamUsage | null = null;
    let contentChars = 0;
    let settlement: Promise<void> | null = null;
    let settlementError: unknown;
    const usage = (): UpstreamUsage => captured ?? {
      promptTokens: estimatePromptTokens(body),
      completionTokens: Math.max(1, Math.round(contentChars / 4)),
      cachedTokens: 0,
    };
    const settleOnce = (success: boolean, errorMessage?: string) => {
      if (!settlement) settlement = settle(usage(), response.status, firstByteMs, Date.now() - startedAt, success, errorMessage).catch((error) => { settlementError = error; });
      return settlement;
    };
    const capture = (data: string) => {
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const next = extractUsage(parsed);
        if (next) captured = next;
        const delta = (parsed.choices as { delta?: { content?: unknown } }[] | undefined)?.[0]?.delta?.content;
        if (typeof delta === "string") contentChars += delta.length;
      } catch { /* opaque event */ }
    };
    const outputStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            buffer = consumeSseEvents(buffer + decoder.decode(), capture);
            await settleOnce(true);
            if (settlementError) { controller.error(settlementError); return; }
            controller.close();
            return;
          }
          controller.enqueue(result.value);
          buffer = consumeSseEvents(buffer + decoder.decode(result.value, { stream: true }), capture);
        } catch (error) {
          await settleOnce(false, error instanceof Error ? error.message : "upstream stream failed");
          controller.error(error);
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason); } catch { /* upstream is already closed */ }
        await settleOnce(false, reason instanceof Error ? reason.message : "client cancelled stream");
      },
    });

    return new Response(outputStream, {
      status: response.status,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-capi-channel": String(channel.id),
        "x-capi-request-id": requestId,
      },
    });
  }

  let json: Record<string, unknown>;
  try {
    json = await response.json() as Record<string, unknown>;
  } catch {
    await settle({ promptTokens: estimatePromptTokens(body), completionTokens: 0, cachedTokens: 0 }, response.status, firstByteMs, Date.now() - startedAt, false, "upstream returned invalid JSON body");
    throw channelError("upstream returned invalid JSON body", null);
  }

  const usage = extractUsage(json) ?? { promptTokens: estimatePromptTokens(body), completionTokens: 0, cachedTokens: 0 };

  await settle(usage, response.status, firstByteMs, Date.now() - startedAt, true);

  return Response.json(
    { ...json, cost: { amount: isBillable ? quotaToUsd(computeQuota(settings, model, usage, "default", group).quota) : 0, currency: "USD" } },
    {
      status: response.status,
      headers: {
        "x-capi-channel": String(channel.id),
        "x-capi-request-id": requestId,
      },
    },
  );
}

// -------------------------------------------------------------------- rules

/** 是否换渠道重试（对应 shouldRetry）。 */
export function shouldRetry(settings: { retryStatusRanges: [number, number][]; alwaysSkipRetryStatusCodes: number[] }, error: RelayError): boolean {
  if (!error.retryable) return false;
  const code = error.upstreamStatusCode ?? error.statusCode;
  if (code >= 200 && code < 300) return false;
  if (code < 100 || code > 599) return true; // 异常状态码按网络错误处理
  if (settings.alwaysSkipRetryStatusCodes.includes(code)) return false;
  return inRanges(code, settings.retryStatusRanges);
}

/** 是否自动禁用渠道（对应 ShouldDisableChannel）。 */
export function shouldDisableChannel(
  settings: {
    autoDisableEnabled: boolean;
    autoDisableStatusRanges: [number, number][];
    autoDisableKeywords: string[];
  },
  error: RelayError,
): boolean {
  if (!settings.autoDisableEnabled) return false;
  if (error.upstreamStatusCode === null) return true; // 网络层错误
  if (inRanges(error.upstreamStatusCode, settings.autoDisableStatusRanges)) return true;
  const message = error.message.toLowerCase();
  return settings.autoDisableKeywords.some(
    (keyword) => keyword && message.includes(keyword.toLowerCase()),
  );
}

// ------------------------------------------------------------------- helpers
/** Parse only complete SSE events; an incomplete tail is returned untouched. */
function consumeSseEvents(buffer: string, onData: (data: string) => void): string {
  let rest = buffer;
  for (;;) {
    const separator = /\r?\n\r?\n/.exec(rest);
    if (!separator || separator.index === undefined) return rest;
    const event = rest.slice(0, separator.index);
    rest = rest.slice(separator.index + separator[0].length);
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) onData(data);
  }
}

/** Normalize usage from Chat Completions or Responses payloads. */
function extractUsage(payload: Record<string, unknown>): UpstreamUsage | null {
  const response = payload.response;
  const nested = response && typeof response === "object" ? (response as Record<string, unknown>).usage : undefined;
  const candidate = nested && typeof nested === "object" ? nested : payload.usage;
  if (!candidate || typeof candidate !== "object") return null;
  const usage = candidate as Record<string, unknown>;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : usage.input_tokens;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : usage.output_tokens;
  const promptDetails = usage.prompt_tokens_details;
  const inputDetails = usage.input_tokens_details;
  const details = promptDetails && typeof promptDetails === "object" ? promptDetails : inputDetails;
  const cachedTokens = details && typeof details === "object" && typeof (details as Record<string, unknown>).cached_tokens === "number"
    ? (details as Record<string, unknown>).cached_tokens as number
    : 0;
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number" && cachedTokens === 0) return null;
  return {
    promptTokens: typeof promptTokens === "number" ? Math.max(0, promptTokens) : 0,
    completionTokens: typeof completionTokens === "number" ? Math.max(0, completionTokens) : 0,
    cachedTokens: Math.max(0, cachedTokens),
  };
}

/** 粗估 prompt token：把消息内容拼起来按 4 字符/token 估。 */
function estimateResponsesPromptTokens(body: Record<string, unknown>): number {
  return estimateTokens(JSON.stringify(body.input ?? ""));
}

function estimatePromptTokens(body: ChatRequestBody): number {
  if (!Array.isArray(body.messages)) return 0;
  let text = "";

  for (const message of body.messages) {
    const content = message.content;
    if (typeof content === "string") {
      text += content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          text += (part as { text: string }).text;
        }
      }
    }
  }
  return estimateTokens(text);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
