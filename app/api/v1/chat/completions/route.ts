import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayChatCompletion,
  relayErrorResponse,
  type ChatRequestBody,
} from "@/lib/relay";

/**
 * OpenAI 兼容的 chat completions 中转。
 *
 * 请求 -> 密钥鉴权 -> 模型白名单 -> 预扣费
 *      -> 按「分组 + 模型」选渠道（优先级 + 权重）-> 转发上游
 *      -> 失败按状态码决定换渠道重试 / 自动禁用 -> 结算计费
 */
export async function POST(request: Request) {
  const registry = await getRegistry();

  const auth = authenticateKey(registry, request, "llm.chat");
  if (!auth.ok) return auth.response;
  const { apiKey, pinnedChannelId } = auth;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 1 MiB.", param: null } }, { status: 413 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json(
      { error: { type: "invalid_request_error", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  if (!body.model || typeof body.model !== "string") {
    return Response.json(
      {
        error: {
          type: "invalid_request_error",
          code: "invalid_model",
          message: "Missing required parameter: model.",
          param: "model",
        },
      },
      { status: 400 },
    );
  }
  if (body.model.length > 200 || (body.messages !== undefined && (!Array.isArray(body.messages) || body.messages.length > 100)) || (body.max_tokens !== undefined && (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 128_000))) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_request", message: "Request exceeds relay limits.", param: null } }, { status: 400 });
  }

  const requestId = newRequestId();

  try {
    return await relayChatCompletion({
      registry,
      apiKey,
      pinnedChannelId,
      requestId,
      body,
    });
  } catch (error) {
    console.error("[relay] chat completion failed:", error);
    return relayErrorResponse(error, requestId);
  }
}
export async function GET() {
  return Response.json(
    {
      error: {
        type: "invalid_request_error",
        code: "method_not_allowed",
        message: "Use POST for chat completions.",
        param: null,
      },
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
