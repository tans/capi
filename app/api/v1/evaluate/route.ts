import {
  authenticateKey,
  getRegistry,
  newRequestId,
  normalizeEvaluateBody,
  relayErrorResponse,
  relayEvaluate,
} from "@/lib/relay";

/**
 * Evaluation 中转：把 { model, state, questions } 转发到上游评测端点。
 *
 * 请求 -> 密钥鉴权（llm.evaluate）-> 请求体校验 -> 模型白名单 -> 预扣费
 *      -> 按「分组 + 模型」选渠道 -> 转发上游 -> 按 usage 结算并记录用量
 *
 * 评测模型（例如 typesafe-ai/jev）不是语言模型，必须用本端点，
 * /api/v1/chat/completions 会被上游拒绝。
 */
export async function POST(request: Request) {
  const registry = await getRegistry();

  const auth = (await authenticateKey(registry, request, "llm.evaluate"));
  if (!auth.ok) return auth.response;
  const { apiKey, pinnedChannelId } = auth;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: { type: "invalid_request_error", code: "body_too_large", message: "Request body must not exceed 1 MiB.", param: null } }, { status: 413 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: { type: "invalid_request_error", message: "Body must be JSON." } }, { status: 400 });
  }

  const parsed = normalizeEvaluateBody(raw);
  if (!parsed.ok) {
    return Response.json(
      { error: { type: "invalid_request_error", code: "invalid_request", message: parsed.error, param: null } },
      { status: 400 },
    );
  }

  const requestId = newRequestId();

  try {
    return await relayEvaluate({
      registry,
      apiKey,
      pinnedChannelId,
      requestId,
      body: parsed.value,
    });
  } catch (error) {
    console.error("[relay] evaluation failed:", error);
    return relayErrorResponse(error, requestId);
  }
}

export async function GET() {
  return Response.json(
    { error: { type: "invalid_request_error", code: "method_not_allowed", message: "Use POST for evaluations.", param: null } },
    { status: 405, headers: { allow: "POST" } },
  );
}
