import {
  authenticateKey,
  getRegistry,
  newRequestId,
  relayErrorResponse,
  relayResponses,
} from "@/lib/relay";

type ResponsesRequestBody = Record<string, unknown> & {
  model?: string;
  input?: unknown;
  stream?: boolean;
};

/** Native Responses pass-through. The upstream owns output items and SSE events. */
export async function POST(request: Request) {
  const registry = await getRegistry();
  const auth = authenticateKey(registry, request, "llm.chat");
  if (!auth.ok) return auth.response;

  let body: ResponsesRequestBody;
  try {
    body = (await request.json()) as ResponsesRequestBody;
  } catch {
    return Response.json({ error: { type: "invalid_request_error", message: "Body must be JSON." } }, { status: 400 });
  }
  if (typeof body.model !== "string" || body.model.length === 0) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_model", message: "Missing required parameter: model." } }, { status: 400 });
  }
  if (body.input === undefined) {
    return Response.json({ error: { type: "invalid_request_error", code: "invalid_input", message: "Missing required parameter: input." } }, { status: 400 });
  }

  const requestId = newRequestId();
  try {
    return await relayResponses({
      registry,
      apiKey: auth.apiKey,
      pinnedChannelId: auth.pinnedChannelId,
      requestId,
      body: body as Record<string, unknown> & { model: string; stream?: boolean },
    });
  } catch (error) {
    console.error("[relay] responses failed:", error);
    return relayErrorResponse(error, requestId);
  }
}

export async function GET() {
  return Response.json({ error: { type: "invalid_request_error", code: "method_not_allowed", message: "Use POST for responses." } }, { status: 405, headers: { allow: "POST" } });
}

