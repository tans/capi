import {
  authenticateKey,
  anthropicErrorResponse,
  anthropicRelayResponse,
  getRegistry,
  newRequestId,
  relayAnthropicMessages,
  type AnthropicRequestBody,
} from "@/lib/relay";

/** Anthropic Messages compatibility endpoint used by Claude Code and native Claude clients. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = (await authenticateKey(registry, request, "llm.chat"));
  if (!auth.ok) return anthropicRelayResponse(auth.response);

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: { type: "invalid_request_error", message: "Request body must not exceed 1 MiB." } }, { status: 413 });
  }

  let body: AnthropicRequestBody;
  try {
    body = (await request.json()) as AnthropicRequestBody;
  } catch {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "Body must be JSON." } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "Body must be a JSON object." } }, { status: 400 });
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "Missing required parameter: model." } }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 100) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "messages must contain 1 to 100 items." } }, { status: 400 });
  }
  if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens as number) < 1 || (body.max_tokens as number) > 128_000) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "max_tokens must be an integer between 1 and 128000." } }, { status: 400 });
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "stream must be a boolean." } }, { status: 400 });
  }

  const requestId = newRequestId();
  try {
    return await relayAnthropicMessages({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId,
      body,
    });
  } catch (error) {
    console.error("[relay] anthropic messages failed:", error);
    return anthropicErrorResponse(error, requestId);
  }
}

export async function GET() {
  return Response.json({ type: "error", error: { type: "invalid_request_error", message: "Use POST for messages." } }, { status: 405, headers: { allow: "POST" } });
}
