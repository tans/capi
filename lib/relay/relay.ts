import { inRanges, channelError, RelayError, upstreamError } from "./errors";
import {
  assertModelAllowed,
  effectiveGroup,
  preConsumeQuota,
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
  const { registry, apiKey, body } = ctx;
  const settings = registry.settings;
  const model = body.model;
  const group = effectiveGroup(apiKey);

  // 模型白名单（403，不重试）
  assertModelAllowed(apiKey, model);

  // 预扣费
  const promptEstimate = estimatePromptTokens(body);
  const pre = estimatePreConsumeQuota(
    settings,
    model,
    promptEstimate,
    typeof body.max_tokens === "number" ? body.max_tokens : null,
    "default",
    group,
  );
  if (!pre.free) {
    preConsumeQuota(apiKey, pre.quota);
    await registry.consumeQuota(apiKey.id, pre.quota);
  }

  const triedChannelIds: number[] = [];
  let lastError: RelayError | null = null;
  let retry = 0;

  for (; ; retry++) {
    let channel: Channel | null = null;

    // 管理员指定渠道：只打一次，不换渠道
    if (ctx.pinnedChannelId !== null && retry === 0) {
      const pinned = registry.getChannel(ctx.pinnedChannelId);
      if (!pinned) {
        throw new RelayError(`Channel #${ctx.pinnedChannelId} not found.`, {
          statusCode: 400,
          code: "invalid_request",
        });
      }
      channel = pinned;
    } else {
      const picked = selectChannel(registry, {
        group,
        model,
        retry,
        excludeIds: triedChannelIds,
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
      break; // 重试用尽（没有更低优先级的渠道了）
    }

    triedChannelIds.push(channel.id);

    try {
      const response = await forwardToChannel(ctx, channel, group, retry);
      // 成功：结算并返回（流式的结算在转发内部挂到流的 flush 上）
      return response;
    } catch (error) {
      lastError =
        error instanceof RelayError
          ? error
          : channelError(error instanceof Error ? error.message : "network error");

      console.warn(
        `[relay] channel #${channel.id} (${channel.name}) failed: ${lastError.message}`,
      );

      // 自动禁用（对应 processChannelError / ShouldDisableChannel）
      if (shouldDisableChannel(settings, lastError) && channel.autoBan) {
        await registry.updateChannel(channel.id, { status: 2 });
        console.warn(`[relay] channel #${channel.id} auto-disabled`);
      }

      if (retry >= settings.retryTimes || !shouldRetry(settings, lastError)) {
        break;
      }
    }
  }

  // 预扣费退还（对应 Billing.Refund）
  if (!pre.free && lastError) {
    await registry.consumeQuota(apiKey.id, -pre.quota);
  }

  throw (
    lastError ??
    new RelayError("relay failed", { statusCode: 502, code: "channel_error" })
  );
}

// ------------------------------------------------------------------- forward

async function forwardToChannel(
  ctx: RelayContext,
  channel: Channel,
  group: string,
  retryCount: number,
): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  const settings = registry.settings;
  const model = body.model;
  const stream = body.stream === true;

  const upstreamKey = registry.pickUpstreamKey(channel);
  if (!upstreamKey) {
    throw channelError(`channel #${channel.id} has no upstream key`, null);
  }

  // 模型映射：对外模型名 -> 上游真实模型名
  const upstreamModel = channel.modelMapping?.[model] ?? model;

  const url = `${channel.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${upstreamKey}`,
    ...Object.fromEntries(
      Object.entries(channel.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };

  // 请求体：换上游模型名 + 渠道参数覆盖 + 流式时要求上游回传 usage
  const payload: Record<string, unknown> = {
    ...body,
    ...Object(channel.paramOverride ?? {}),
    model: upstreamModel,
  };
  if (stream && payload.stream_options === undefined) {
    payload.stream_options = { include_usage: true };
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      // 流式响应不设整体超时，避免长生成被掐断
      ...(stream
        ? {}
        : { signal: AbortSignal.timeout(settings.requestTimeoutMs) }),
    });
  } catch (error) {
    throw channelError(
      `upstream request failed: ${error instanceof Error ? error.message : "network error"}`,
      null,
    );
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

    // 多退少补：预扣过的退回差额，实际用多少扣多少
    const pre = estimatePreConsumeQuota(
      settings,
      model,
      usage.promptTokens,
      typeof body.max_tokens === "number" ? body.max_tokens : null,
      "default",
      group,
    );
    const delta = quote.quota - pre.quota;
    if (delta !== 0) {
      await registry.consumeQuota(apiKey.id, delta);
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
      stream,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      quota: quote.quota,
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

  if (stream) {
    const upstreamBody = response.body;
    if (!upstreamBody) {
      throw channelError("upstream returned empty stream body", null);
    }
    const captured = { usage: null as UpstreamUsage | null, contentChars: 0 };
    const decoder = new TextDecoder();
    let buffer = "";

    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        // 旁路解析 SSE，抓 usage 与输出文本长度（不影响透传）
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.trim();
          if (!data.startsWith("data:")) continue;
          const json = data.slice(5).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const parsed = JSON.parse(json) as {
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                prompt_tokens_details?: { cached_tokens?: number };
              };
              choices?: { delta?: { content?: string } }[];
            };
            if (parsed.usage) {
              captured.usage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                cachedTokens: parsed.usage.prompt_tokens_details?.cached_tokens ?? 0,
              };
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string") captured.contentChars += delta.length;
          } catch {
            /* 非 JSON 行直接忽略 */
          }
        }
      },
      flush() {
        const usage: UpstreamUsage = captured.usage ?? {
          promptTokens: estimatePromptTokens(body),
          completionTokens: Math.max(1, Math.round(captured.contentChars / 4)),
          cachedTokens: 0,
        };
        void settle(usage, response.status, firstByteMs, Date.now() - startedAt, true).catch(
          (error) => console.error("[relay] stream settle failed:", error),
        );
      },
    });

    return new Response(upstreamBody.pipeThrough(transform), {
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

  // 非流式：解析 JSON，提取 usage
  const json = (await response.json().catch(() => {
    throw channelError("upstream returned invalid JSON body", null);
  })) as Record<string, unknown> & {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  const usage: UpstreamUsage = {
    promptTokens: json.usage?.prompt_tokens ?? estimatePromptTokens(body),
    completionTokens: json.usage?.completion_tokens ?? 0,
    cachedTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };

  await settle(usage, response.status, firstByteMs, Date.now() - startedAt, true);

  return Response.json(
    { ...json, cost: { amount: quotaToUsd(computeQuota(settings, model, usage, "default", group).quota), currency: "USD" } },
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

/** 粗估 prompt token：把消息内容拼起来按 4 字符/token 估。 */
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
