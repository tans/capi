import { channelError, RelayError, requestIdHeaders, upstreamError } from "./errors";
import {
  assertModelAllowed,
  assertOperationAllowed,
  effectiveGroup,
} from "./keys";
import {
  computeQuota,
  estimatePreConsumeQuota,
  estimateTokens,
} from "./pricing";
import { quotaToCurrency, systemCurrency, workspaceCurrency } from "./currency";
import { selectChannel } from "./selector";
import { isChannelAccessible } from "./selector";
import type { RelayRegistry } from "./store";
import type { ApiKey, Channel, UsageRecord } from "./types";
import type { ChatRequestBody, RelayContext, ResponsesRelayContext, UpstreamUsage } from "./relay-contracts";
import { forwardToChannel, shouldDisableChannel, shouldRetry } from "./relay-forward";
import { consumeSseEvents, estimatePromptTokens, estimateResponsesPromptTokens, extractUsage, truncate } from "./relay-utils";
export type { ChatRequestBody, RelayContext, ResponsesRelayContext } from "./relay-contracts";
export { shouldDisableChannel, shouldRetry } from "./relay-forward";
import { resolveModel } from "../auto-router/resolve";
import { evaluateInferenceInput } from "../jev/gateway";
import { extractChatUserText, extractResponsesUserText } from "../jev/input";
import { getWorkspaceJevSettings } from "../jev/config";
import { eligibleCombinedModels, findCombinedModel } from "./combined-models";
import type { JevDecision, JevRouteDecision } from "../jev/types";
import { anthropicToChat, chatStreamToAnthropic, chatToAnthropic, type AnthropicRequestBody } from "./anthropic";
import { buildImageProtocolRequest, imageTaskId, imageTaskResult, imageTaskStatus, imageTaskStatusEndpoint, normalizeImageProtocolResponse } from "./image-protocol";
import { createMediaFile, readImageReference } from "./files";

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

export function newRequestId(): string {
  return `capi_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`;
}

/** Low-confidence JEV output must never silently choose an advanced tier. */
export function effectiveJevRoute(jev: Pick<JevDecision, "route"> | null | undefined): JevRouteDecision | null {
  if (!jev?.route) return null;
  return jev.route.confidence >= 0.6
    ? jev.route
    : { intent: "other", complexity: "standard", confidence: 0 };
}

export async function relayChatCompletion(ctx: RelayContext): Promise<Response> {
  const { registry, apiKey } = ctx;
  const requestModel = ctx.body.model;
  const jevSettings = await getWorkspaceJevSettings(apiKey.workspaceId);
  const jev = await evaluateInferenceInput({
    registry,
    apiKey,
    requestId: ctx.requestId,
    requestModel,
    userText: extractChatUserText(ctx.body),
    settings: jevSettings,
  });
  const combined = await findCombinedModel(apiKey.workspaceId, requestModel);
  const models = combined
    ? eligibleCombinedModels(apiKey, combined)
    : [(await resolveModel(registry, apiKey, ctx.body, effectiveJevRoute(jev), jevSettings)).model];
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      return await relayChatModel({ ...ctx, body: { ...ctx.body, model } }, requestModel);
    } catch (error) {
      lastError = error;
      if (!combined || index === models.length - 1 || !shouldFallbackModel((await registry.getSettings()), error)) throw error;
    }
  }
  throw lastError;
}

function shouldFallbackModel(settings: { retryStatusRanges: [number, number][]; alwaysSkipRetryStatusCodes: number[] }, error: unknown): boolean {
  return error instanceof RelayError && (error.code === "no_available_channel" || shouldRetry(settings, error));
}

async function relayChatModel(ctx: RelayContext, requestModel: string): Promise<Response> {
  const { registry, apiKey, body } = ctx;
  const settings = (await registry.getSettings());
  const model = body.model;
  const group = effectiveGroup(apiKey);

  // 模型白名单（403，不重试）
  assertModelAllowed(apiKey, model);

  const promptEstimate = estimatePromptTokens(body);
  const pre = estimatePreConsumeQuota(settings, model, promptEstimate, typeof body.max_tokens === "number" ? body.max_tokens : null, "default", group);

  const exhaustedChannelIds: number[] = [];
  const triedKeysByChannel = new Map<number, string[]>();
  let lastError: RelayError | null = null;
  let quotaDenied = false;
  let retry = 0;

  for (; ; retry++) {
    let channel: Channel | null = null;

    if (ctx.pinnedChannelId !== null && retry === 0) {
      const pinned = (await registry.getChannel(ctx.pinnedChannelId));
      if (!pinned || !isChannelAccessible(pinned, apiKey.workspaceId, (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)))) {
        throw new RelayError(`Channel #${ctx.pinnedChannelId} is not available.`, { statusCode: 404, code: "invalid_request" });
      }
      channel = pinned;
    } else {
      const picked = await selectChannel(registry, {
        group,
        model,
        retry: exhaustedChannelIds.length,
        excludeIds: exhaustedChannelIds,
        workspaceId: apiKey.workspaceId,
        allowPlatform: (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)),
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
      lastError = channelError(`Channel #${channel.id} has no upstream key.`, null);
      exhaustedChannelIds.push(channel.id);
      continue;
    }
    const isBillable = channel.ownerType === "platform" && !pre.free;
    if (isBillable && !await registry.reserveBilling(ctx.requestId, apiKey.workspaceId, apiKey.id, pre.quota)) {
      quotaDenied = true;
      exhaustedChannelIds.push(channel.id);
      continue;
    }

    try {
      return await forwardToChannel({ ctx, channel, group, retryCount: retry, upstreamKey, isBillable, requestModel });
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
    (quotaDenied ? new RelayError("Insufficient funds or key budget.", { statusCode: 429, code: "quota_exceeded", type: "quota_error" }) : null) ??
    new RelayError("relay failed", { statusCode: 502, code: "channel_error" })
  );
}

export type AnthropicRelayContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  pinnedChannelId: number | null;
  requestId: string;
  body: AnthropicRequestBody;
};

/** Relay Claude Code's native Messages request through the shared chat path. */
export async function relayAnthropicMessages(ctx: AnthropicRelayContext): Promise<Response> {
  const chatResponse = await relayChatCompletion({
    registry: ctx.registry,
    apiKey: ctx.apiKey,
    pinnedChannelId: ctx.pinnedChannelId,
    requestId: ctx.requestId,
    body: anthropicToChat(ctx.body),
  });
  if (ctx.body.stream === true) return chatStreamToAnthropic(chatResponse, ctx.body, ctx.requestId);
  const payload = await chatResponse.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RelayError("Upstream returned invalid JSON body.", { statusCode: 502, code: "channel_error" });
  }
  return Response.json(chatToAnthropic(payload as Record<string, unknown>, ctx.body, ctx.requestId), {
    status: chatResponse.status,
    headers: {
      ...requestIdHeaders(ctx.requestId),
      "request-id": ctx.requestId,
      ...(chatResponse.headers.get("x-capi-channel") ? { "x-capi-channel": chatResponse.headers.get("x-capi-channel")! } : {}),
    },
  });
}

export async function relayResponses(ctx: ResponsesRelayContext): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  const imageTool = Array.isArray(body.tools)
    ? body.tools.find((tool) => tool && typeof tool === "object" && (tool as Record<string, unknown>).type === "image_generation") as Record<string, unknown> | undefined
    : undefined;
  if (imageTool) {
    assertOperationAllowed(apiKey, "image.generate");
    const prompt = extractResponsesUserText(body.input);
    if (!prompt.trim()) throw new RelayError("Image generation requires a text prompt in input.", { statusCode: 400, code: "invalid_request" });
    const imageModel = typeof imageTool.model === "string" && imageTool.model.trim() ? imageTool.model : body.model;
    const referenceImages = extractResponsesImageInputs(body.input);
    const imageBody: Record<string, unknown> & { model: string; prompt: string } = { model: imageModel, prompt };
    if (referenceImages.length) imageBody.reference_images = referenceImages;
    for (const field of ["size", "quality", "background", "output_format", "moderation", "n"] as const) {
      if (imageTool[field] !== undefined) imageBody[field] = imageTool[field];
    }
    const imageResponse = await relayImageGeneration({ ...ctx, body: imageBody });
    if (!imageResponse.ok) return imageResponse;
    const imageResult = await imageResponse.json() as Record<string, unknown>;
    const responseBody = imageGenerationResponse(body.model, requestId, imageResult);
    if (body.stream === true) return imageGenerationStream(responseBody, imageResponse.headers.get("x-capi-channel") ?? "");
    return Response.json(responseBody, { headers: { ...requestIdHeaders(requestId), "x-capi-channel": imageResponse.headers.get("x-capi-channel") ?? "" } });
  }
  const requestModel = body.model;
  const jevSettings = await getWorkspaceJevSettings(apiKey.workspaceId);
  const jev = await evaluateInferenceInput({
    registry,
    apiKey,
    requestId,
    requestModel,
    userText: extractResponsesUserText(body.input),
    settings: jevSettings,
  });
  const routeBody: ChatRequestBody = { model: body.model, messages: [{ role: "user", content: extractResponsesUserText(body.input) }] };
  const combined = await findCombinedModel(apiKey.workspaceId, requestModel);
  const models = combined
    ? eligibleCombinedModels(apiKey, combined)
    : [(await resolveModel(registry, apiKey, routeBody, effectiveJevRoute(jev), jevSettings)).model];
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      return await relayResponsesModel(ctx, requestModel, model);
    } catch (error) {
      lastError = error;
      if (!combined || index === models.length - 1 || !shouldFallbackModel((await registry.getSettings()), error)) throw error;
    }
  }
  throw lastError;
}

export type ImageGenerationContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  pinnedChannelId: number | null;
  requestId: string;
  body: Record<string, unknown> & { model: string; prompt: string };
  editFiles?: { image: Uint8Array; mimeType: string; filename: string }[];
  maskFile?: { image: Uint8Array; mimeType: string; filename: string };
};

function extractResponsesImageInputs(input: unknown): string[] {
  const images: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item.type === "input_image") {
      if (typeof item.image_url === "string") images.push(item.image_url);
      else if (item.image_url && typeof item.image_url === "object" && typeof (item.image_url as Record<string, unknown>).url === "string") images.push((item.image_url as Record<string, string>).url!);
    }
    Object.values(item).forEach(visit);
  };
  visit(input);
  return [...new Set(images)];
}

/** Forward OpenAI-compatible image generation requests to the selected channel. */
export async function relayImageGeneration(ctx: ImageGenerationContext): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  assertOperationAllowed(apiKey, "image.generate");
  const model = body.model;
  assertModelAllowed(apiKey, model);
  const group = effectiveGroup(apiKey);
  const channel = ctx.pinnedChannelId === null
    ? (await selectChannel(registry, { group, model, retry: 0, workspaceId: apiKey.workspaceId, allowPlatform: (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)) }))?.channel
    : (await registry.getChannel(ctx.pinnedChannelId));
  if (ctx.pinnedChannelId !== null && channel && !isChannelAccessible(channel, apiKey.workspaceId, (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)))) {
    throw new RelayError(`Channel #${ctx.pinnedChannelId} is not available.`, { statusCode: 404, code: "invalid_request" });
  }
  if (!channel) throw new RelayError(`No available channel for model ${model}.`, { statusCode: 503, code: "no_available_channel", type: "api_error" });

  const upstreamKey = registry.pickUpstreamKey(channel);
  if (!upstreamKey) throw channelError(`Channel #${channel.id} has no upstream key.`, null);
  const promptTokens = estimateTokens(body.prompt);
  const estimate = estimatePreConsumeQuota((await registry.getSettings()), model, promptTokens, null, "default", group);
  const isBillable = channel.ownerType === "platform" && !estimate.free;
  if (isBillable && !await registry.reserveBilling(requestId, apiKey.workspaceId, apiKey.id, estimate.quota)) {
    throw new RelayError("Insufficient funds or key budget.", { statusCode: 429, code: "quota_exceeded", type: "quota_error" });
  }

  const upstreamModel = channel.modelMapping?.[model] ?? model;
  const imageProtocolConfig = channel.imageProtocolConfig ?? undefined;
  const requestTimeoutMs = (await registry.getSettings()).requestTimeoutMs;
  const referenceImages = Array.isArray(body.reference_images) ? body.reference_images.filter((value): value is string => typeof value === "string") : [];
  let resolvedReferenceImages: { image: Uint8Array; mimeType: string; filename: string }[] = [];
  if (referenceImages.length && !imageProtocolConfig && !ctx.editFiles) {
    try {
      resolvedReferenceImages = await Promise.all(referenceImages.map((value) => readImageReference(value, registry.database, apiKey.workspaceId)));
    } catch (error) {
      if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
      throw new RelayError(error instanceof Error ? error.message : "Invalid reference image.", { statusCode: 400, code: "invalid_request", type: "invalid_request_error" });
    }
  }
  const editFiles = ctx.editFiles ?? resolvedReferenceImages;
  const headers: Record<string, string> = {
    ...(!imageProtocolConfig && !editFiles.length ? { "content-type": "application/json" } : {}),
    ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])),
  };
  if (imageProtocolConfig && imageProtocolConfig.auth?.type === "api-key-header") {
    delete headers.authorization;
    headers[imageProtocolConfig.auth.header.toLowerCase()] = upstreamKey;
  } else if (imageProtocolConfig) {
    headers.authorization = `Bearer ${upstreamKey}`;
  } else {
    headers.authorization ??= `Bearer ${upstreamKey}`;
  }
  let response: Response;
  try {
    const mapperInput: Record<string, unknown> = { ...body, model: upstreamModel };
    if (editFiles.length) {
      const dataUrls = editFiles.map((file) => `data:${file.mimeType};base64,${Buffer.from(file.image).toString("base64")}`);
      mapperInput.images = dataUrls;
      mapperInput.image_urls = dataUrls;
      mapperInput.image_url = dataUrls[0];
      mapperInput.reference_images = dataUrls;
    }
    if (ctx.maskFile) {
      const maskUrl = `data:${ctx.maskFile.mimeType};base64,${Buffer.from(ctx.maskFile.image).toString("base64")}`;
      mapperInput.mask = maskUrl;
      mapperInput.mask_url = maskUrl;
    }
    const mapped = imageProtocolConfig
      ? buildImageProtocolRequest(imageProtocolConfig, mapperInput)
      : null;
    const endpoint = mapped?.endpoint ?? (editFiles.length ? "/images/edits" : "/images/generations");
    let upstreamBody: BodyInit;
    if (!imageProtocolConfig && editFiles.length) {
      const form = new FormData();
      for (const [field, value] of Object.entries({ ...body, ...Object(channel.paramOverride ?? {}), model: upstreamModel })) {
        if (["reference_images", "images", "mask", "image_url", "image_urls", "mask_url", "image"].includes(field)) continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") form.append(field, String(value));
      }
      for (const file of editFiles) form.append(editFiles.length > 1 ? "image[]" : "image", new Blob([new Uint8Array(file.image)], { type: file.mimeType }), file.filename);
      if (ctx.maskFile) form.append("mask", new Blob([new Uint8Array(ctx.maskFile.image)], { type: ctx.maskFile.mimeType }), ctx.maskFile.filename);
      upstreamBody = form;
      delete headers["content-type"];
    } else {
      const payload = mapped ? { ...mapped.body, ...Object(channel.paramOverride ?? {}) } : { ...body, ...Object(channel.paramOverride ?? {}), model: upstreamModel };
      upstreamBody = JSON.stringify(payload);
      headers["content-type"] = "application/json";
    }
    response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${endpoint}`, {
      method: "POST",
      headers,
      body: upstreamBody,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw channelError(`upstream request failed: ${error instanceof Error ? error.message : "network error"}`, null);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw upstreamError(`Upstream ${channel.name} returned ${response.status}: ${truncate(text || response.statusText, 800)}`, response.status);
  }
  let upstreamJson = await response.json().catch(async () => {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError("Upstream returned invalid JSON.", { statusCode: 502, code: "channel_error" });
  }) as Record<string, unknown>;
  if (imageProtocolConfig?.task) {
    try {
      const taskId = imageTaskId(imageProtocolConfig, upstreamJson);
      const deadline = Date.now() + requestTimeoutMs;
      const completedStatus = imageProtocolConfig.task.completedStatus ?? "completed";
      const failedStatus = imageProtocolConfig.task.failedStatus ?? "failed";
      while (true) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error("Image task polling timed out.");
        await new Promise((resolve) => setTimeout(resolve, Math.min(imageProtocolConfig.task!.pollIntervalMs ?? 1_000, remainingMs)));
        const pollResponse = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}${imageTaskStatusEndpoint(imageProtocolConfig, taskId)}`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        });
        if (!pollResponse.ok) {
          const text = await pollResponse.text().catch(() => "");
          throw new Error(`Task query returned ${pollResponse.status}: ${truncate(text || pollResponse.statusText, 500)}`);
        }
        const taskJson = await pollResponse.json() as Record<string, unknown>;
        const status = imageTaskStatus(imageProtocolConfig, taskJson);
        if (status === failedStatus) throw new Error("The upstream image task failed.");
        if (status === completedStatus) {
          upstreamJson = imageTaskResult(imageProtocolConfig, taskJson);
          response = pollResponse;
          break;
        }
        if (status !== "submitted" && status !== "pending" && status !== "processing") {
          throw new Error(`The upstream image task returned unsupported status: ${status}.`);
        }
      }
    } catch (error) {
      if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
      throw new RelayError(error instanceof Error ? error.message : "Image task polling failed.", { statusCode: 502, code: "channel_error" });
    }
  }
  let json: Record<string, unknown>;
  try {
    json = imageProtocolConfig ? normalizeImageProtocolResponse(imageProtocolConfig, upstreamJson) : upstreamJson;
  } catch (error) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError(error instanceof Error ? error.message : "Upstream returned an invalid image response.", { statusCode: 502, code: "channel_error" });
  }
  if (!Array.isArray(json.data) || json.data.length === 0) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError("Upstream returned no generated images.", { statusCode: 502, code: "channel_error" });
  }
  await archiveGeneratedImages(registry, apiKey, model, body, json);
  const usage: UpstreamUsage = { promptTokens, completionTokens: 0, cachedTokens: 0 };
  const quote = computeQuota((await registry.getSettings()), model, usage, "default", group);
  if (isBillable && !await registry.finalizeBilling(requestId, quote.quota, "settled")) {
    await registry.finalizeBilling(requestId, 0, "unknown");
    throw new RelayError("Billing settlement could not be finalized safely.", { statusCode: 503, code: "channel_error" });
  }
  await registry.recordUsage({
    id: requestId, requestId, createdAt: Date.now(), keyId: apiKey.id, keyName: apiKey.name,
    channelId: channel.id, channelName: channel.name, group, model, requestModel: model, upstreamModel,
    stream: false, promptTokens, completionTokens: 0, cachedTokens: 0, quota: isBillable ? quote.quota : 0,
    retry: 0, firstByteMs: 0, durationMs: 0, success: true, statusCode: response.status,
  });
  return Response.json(json, { status: response.status, headers: { ...requestIdHeaders(requestId), "x-capi-channel": String(channel.id) } });
}

async function archiveGeneratedImages(
  registry: RelayRegistry,
  apiKey: ApiKey,
  model: string,
  requestBody: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  const format = typeof requestBody.output_format === "string" ? requestBody.output_format.toLowerCase() : "png";
  const formatTypes: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  for (const [index, value] of (result.data as unknown[]).entries()) {
    if (!value || typeof value !== "object") continue;
    const image = value as Record<string, unknown>;
    try {
      let bytes: Uint8Array;
      let mimeType: string;
      let filename: string;
      if (typeof image.b64_json === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(image.b64_json)) {
        bytes = Buffer.from(image.b64_json, "base64");
        mimeType = typeof image.content_type === "string" && image.content_type.startsWith("image/") ? image.content_type : formatTypes[format] ?? "image/png";
        filename = `generated-${Date.now()}-${index + 1}.${format === "jpeg" ? "jpg" : format}`;
      } else if (typeof image.url === "string") {
        const fetched = await readImageReference(image.url, registry.database, apiKey.workspaceId);
        bytes = fetched.image;
        mimeType = fetched.mimeType;
        filename = fetched.filename || `generated-${Date.now()}-${index + 1}.png`;
      } else {
        image.archive_status = "unavailable";
        continue;
      }
      const file = await createMediaFile({ db: registry.database, workspaceId: apiKey.workspaceId, keyId: apiKey.id, filename, mimeType, purpose: "generated_image", bytes });
      image.capi_file_id = file.id;
      image.archive_status = "archived";
      image.capi_url = `/api/v1/files/${encodeURIComponent(file.id)}/content`;
      image.model = model;
    } catch (error) {
      image.archive_status = "failed";
      console.warn("[relay] generated image archive failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
}

function imageGenerationResponse(model: string, requestId: string, imageResult: Record<string, unknown>): Record<string, unknown> {
  const data = Array.isArray(imageResult.data) ? imageResult.data : [];
  const output = data.map((image, index) => {
    const item = image && typeof image === "object" ? image as Record<string, unknown> : {};
    return {
      id: `ig_${requestId}_${index}`,
      type: "image_generation_call",
      status: "completed",
      result: item.b64_json ?? item.url ?? null,
      ...(typeof item.capi_file_id === "string" ? { file_id: item.capi_file_id, file_url: item.capi_url } : {}),
      ...(typeof item.archive_status === "string" ? { archive_status: item.archive_status } : {}),
      ...(typeof item.revised_prompt === "string" ? { revised_prompt: item.revised_prompt } : {}),
    };
  });
  return {
    id: requestId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

function imageGenerationStream(response: Record<string, unknown>, channelId: string): Response {
  const outputs = response.output as Record<string, unknown>[];
  const initial = { ...response, status: "in_progress", output: [] };
  const events: Record<string, unknown>[] = [
    { type: "response.created", response: initial },
    { type: "response.in_progress", response: initial },
  ];
  outputs.forEach((item, outputIndex) => {
    const inProgress = { ...item, status: "in_progress", result: null };
    events.push(
      { type: "response.output_item.added", output_index: outputIndex, item: inProgress },
      { type: "image_generation_call.in_progress", output_index: outputIndex, item_id: item.id },
      { type: "image_generation_call.completed", output_index: outputIndex, item_id: item.id, result: item.result },
      { type: "response.output_item.done", output_index: outputIndex, item },
    );
  });
  events.push({ type: "response.completed", response });
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-capi-channel": channelId } });
}

async function relayResponsesModel(ctx: ResponsesRelayContext, requestModel: string, model: string): Promise<Response> {
  const { registry, apiKey, body, requestId } = ctx;
  assertModelAllowed(apiKey, model);
  const group = effectiveGroup(apiKey);
  let channel = ctx.pinnedChannelId === null ? (await selectChannel(registry, { group, model, retry: 0, workspaceId: apiKey.workspaceId, allowPlatform: (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)) }))?.channel : (await registry.getChannel(ctx.pinnedChannelId));
  if (ctx.pinnedChannelId !== null && channel && !isChannelAccessible(channel, apiKey.workspaceId, (await registry.workspaceAllowsPlatformChannels(apiKey.workspaceId)))) {
    throw new RelayError(`Channel #${ctx.pinnedChannelId} is not available.`, { statusCode: 404, code: "invalid_request" });
  }
  if (!channel) throw new RelayError(`No available channel for model ${model}.`, { statusCode: 503, code: "no_available_channel", type: "api_error" });
  const quote = estimatePreConsumeQuota((await registry.getSettings()), model, estimateResponsesPromptTokens(body), typeof body.max_output_tokens === "number" ? body.max_output_tokens : null, "default", group);
  let isBillable = channel.ownerType === "platform" && !quote.free;
  if (isBillable && !await registry.reserveBilling(requestId, apiKey.workspaceId, apiKey.id, quote.quota)) {
    channel = (await selectChannel(registry, { group, model, retry: 0, workspaceId: apiKey.workspaceId, allowPlatform: false }))?.channel;
    if (!channel) throw new RelayError("Insufficient funds or key budget.", { statusCode: 429, code: "quota_exceeded", type: "quota_error" });
    isBillable = false;
  }
  const key = registry.pickUpstreamKey(channel);
  if (!key) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw channelError("Channel has no upstream key.", null);
  }
  const upstreamModel = channel.modelMapping?.[model] ?? model;
  let response: Response;
  try {
    response = await fetch(`${channel.baseUrl.replace(/\/+$/, "")}/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...Object.fromEntries(Object.entries(channel.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])) }, body: JSON.stringify({ ...body, model: upstreamModel }), signal: AbortSignal.timeout((await registry.getSettings()).requestTimeoutMs) });
  } catch (error) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw channelError(`upstream request failed: ${error instanceof Error ? error.message : "network error"}`, null);
  }
  if (!response.ok) {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw upstreamError(`Upstream returned ${response.status}.`, response.status);
  }

  const settle = async (usage: UpstreamUsage, success: boolean, errorMessage?: string) => {
    const actual = computeQuota((await registry.getSettings()), model, usage, "default", group).quota;
    if (isBillable && !await registry.finalizeBilling(requestId, actual, "settled")) {
      await registry.finalizeBilling(requestId, 0, "unknown");
      throw new RelayError("Billing settlement could not be finalized safely.", { statusCode: 503, code: "channel_error" });
    }
    await registry.recordUsage({ id: requestId, requestId, createdAt: Date.now(), keyId: apiKey.id, keyName: apiKey.name, channelId: channel.id, channelName: channel.name, group, model, requestModel, upstreamModel, stream: body.stream === true, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cachedTokens: usage.cachedTokens, quota: isBillable ? actual : 0, retry: 0, firstByteMs: 0, durationMs: 0, success, statusCode: response.status, errorMessage });
  };

  if (body.stream === true && !response.body) {
    await settle({ promptTokens: estimateResponsesPromptTokens(body), completionTokens: 0, cachedTokens: 0 }, false, "upstream returned empty stream body");
    throw new RelayError("Upstream returned empty stream body.", { statusCode: 502, code: "channel_error" });
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
    return new Response(outputStream, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "text/event-stream", ...requestIdHeaders(requestId), "x-capi-channel": String(channel.id) } });
  }
  const json = await response.json().catch(async () => {
    if (isBillable) await registry.finalizeBilling(requestId, 0, "released");
    throw new RelayError("Upstream returned invalid JSON.", { statusCode: 502, code: "channel_error" });
  }) as Record<string, unknown>;
  const usage = extractUsage(json);
  await settle(usage ?? { promptTokens: estimateResponsesPromptTokens(body), completionTokens: 0, cachedTokens: 0 }, true);
  return Response.json(json, { status: response.status, headers: { ...requestIdHeaders(requestId), "x-capi-channel": String(channel.id) } });
}

 // ------------------------------------------------------------------- forward
// ------------------------------------------------------------------- forward
