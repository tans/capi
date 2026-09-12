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
