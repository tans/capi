import { inRanges, channelError, RelayError, requestIdHeaders, upstreamError } from "./errors";
import { computeQuota } from "./pricing";
import { quotaToCurrency, systemCurrency, workspaceCurrency } from "./currency";
import type { UsageRecord } from "./types";
import type { ForwardChannelInput, UpstreamUsage } from "./relay-contracts";
import { consumeSseEvents, estimatePromptTokens, extractUsage, truncate } from "./relay-utils";

export async function forwardToChannel({ ctx, channel, group, retryCount, upstreamKey, isBillable, requestModel }: ForwardChannelInput): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  const settings = (await registry.getSettings());
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
    throw new RelayError("Upstream returned empty stream body.", { statusCode: 502, code: "channel_error" });
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
        ...requestIdHeaders(requestId),
      },
    });
  }

  let json: Record<string, unknown>;
  try {
    json = await response.json() as Record<string, unknown>;
  } catch {
    await settle({ promptTokens: estimatePromptTokens(body), completionTokens: 0, cachedTokens: 0 }, response.status, firstByteMs, Date.now() - startedAt, false, "upstream returned invalid JSON body");
    throw new RelayError("Upstream returned invalid JSON body.", { statusCode: 502, code: "channel_error" });
  }

  const usage = extractUsage(json) ?? { promptTokens: estimatePromptTokens(body), completionTokens: 0, cachedTokens: 0 };

  await settle(usage, response.status, firstByteMs, Date.now() - startedAt, true);

  const currency = (await workspaceCurrency(registry.database, apiKey.workspaceId, systemCurrency(settings)));
  return Response.json(
    { ...json, cost: { amount: isBillable ? quotaToCurrency(computeQuota(settings, model, usage, "default", group).quota, currency) : 0, currency: currency.code } },
    {
      status: response.status,
      headers: {
        "x-capi-channel": String(channel.id),
        ...requestIdHeaders(requestId),
      },
    },
  );
}


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

